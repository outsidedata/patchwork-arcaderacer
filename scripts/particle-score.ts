// Scores particle effects against the rules of how an effect is designed (the `tuning-particles` skill, How
// an effect is designed), by looking at them:
//
//   yarn particle-score <effects file> [--effect <name>]... [--camera x,y,z] [--target x,y,z] [--at x,y,z]
//                       [--sheet <key>=<path>]... [--out <folder>]
//
// Each effect (every effect of the file, or each `--effect` named, as many as given) is scored by the
// particle workshop's scorer (`tools/workshop/score.ts`, whose header has every rule and its line), on the
// views page (`tools/workshop/views.ts`) in a headless Chrome, as `yarn particle-views` plays it, from
// `--camera` looking at `--target` ([6, 3.5, 8] at [0, 1.2, 0], where the workshop's camera starts), thrown
// from `--at` ([0, 1.2, 0]), at 1280×720. The workshop's Score effect runs the same scorer on the effect as
// it is edited.
//
// It prints each effect's rules and its score, the rules it passed of those that apply, and ends with every
// effect's score, lowest first. With `--out`, every picture it measured is written there,
// `<effect>-<moment>.png`, `<effect>-<moment>-bright.png` and `<effect>-off-<effect>-<layer>.png` (each layer
// muted at the peak). It ends 1 when the page threw or logged an error.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { start } from '../tools/workshop/workshop.server.ts'
import { chrome, open, plan } from './particle-views.ts'

type Json = any
const SIZE: [number, number] = [1280, 720]

const triple = (s: string, flag: string) => {
  const v = s.split(',').map(Number)
  if (v.length !== 3 || v.some(n => !Number.isFinite(n))) throw new Error(`${flag} is ${s}, and it is x,y,z`)
  return v
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const file = args[0]
  if (!file || file.startsWith('--')) {
    console.error('usage: yarn particle-score <effects file> [--effect <name>]... [--camera x,y,z] [--target x,y,z] [--at x,y,z] [--sheet <key>=<path>]... [--out <folder>]')
    process.exit(1)
  }
  const known = ['--effect', '--camera', '--target', '--at', '--sheet', '--out']
  for (let i = 1; i < args.length; i += 2) if (!known.includes(args[i])) throw new Error(`${args[i]} is not a flag of particle-score: ${known.join(', ')}`)
  const flag = (f: string) => { const i = args.indexOf(f); return i < 0 ? undefined : args[i + 1] }
  const effectsFile = path.resolve(file)
  const camera = flag('--camera') ? triple(flag('--camera')!, '--camera') : [6, 3.5, 8]
  const target = flag('--target') ? triple(flag('--target')!, '--target') : [0, 1.2, 0]
  const at = flag('--at') ? triple(flag('--at')!, '--at') : [0, 1.2, 0]
  const sheets: Record<string, string> = {}
  args.forEach((a, i) => {
    if (a !== '--sheet') return
    const [k, p] = (args[i + 1] ?? '').split('=')
    if (!k || !p) throw new Error(`--sheet is ${args[i + 1]}, and it is <key>=<path>`)
    sheets[k] = p
  })
  const out = flag('--out')
  if (out) fs.mkdirSync(out, { recursive: true })

  // the effects named, each checked by particle-views' own `plan`, which reads the file and the files it lists
  const asked = args.flatMap((a, i) => (a === '--effect' ? [args[i + 1]] : []))
  const every = plan([{ file: effectsFile, camera, target, preroll: 0 }], process.cwd()).map(s => s.view.effect)
  for (const n of asked) if (!every.includes(n)) throw new Error(`${file} has no effect ${n}: it has ${every.join(', ')}`)
  const names = asked.length ? asked : every

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const page = await chrome()
  const server = await start({ port: 0, root, effects: effectsFile, sheets: Object.fromEntries(Object.entries(sheets).map(([k, p]) => [k, path.resolve(p)])) })
  await open(page, server.url, effectsFile, SIZE)
  let threw = 0
  const scores: { name: string; passed: number; of: number }[] = []
  for (const name of names) {
    const base = { effect: name, camera, target, fov: 45, at, dir: [0, 1, 0], to: [6, 1.2, 0], scale: 1, seed: 1, from: 'still', stage: true, drawer: 'particle3d' }
    const scored: Json = await page.evaluate(`window.__views.score(${JSON.stringify(base)}, ${!!out})`)
    console.log(`\n${scored.report}`)
    scores.push({ name, passed: scored.passed, of: scored.of })
    if (out) for (const p of scored.pictures as string[]) {
      const url: string = await page.evaluate(`window.__views.picture(${JSON.stringify(p)})`)
      fs.writeFileSync(path.join(out, `${name}-${p}.png`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))
    }
    for (const e of page.take()) { threw++; console.log(`  the page said: ${e.split('\n')[0]}`) }
  }
  if (scores.length > 1) {
    console.log('\nevery effect, lowest first:')
    for (const s of [...scores].sort((a, b) => a.passed / (a.of || 1) - b.passed / (b.of || 1))) console.log(`  ${s.passed} of ${s.of}  ${s.name}`)
  }
  await server.close()
  await page.close()
  process.exit(threw ? 1 : 0)
}
