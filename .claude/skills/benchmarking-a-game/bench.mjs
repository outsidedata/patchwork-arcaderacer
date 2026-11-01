// Benchmarks every scene of a game, one after another, never two at once (they share the GPU): each
// scene's ticks on node (rules-profile.ts), its page's CPU in Chrome (scene-profile.mjs), then its page on
// the GPU (gpu-profile.mjs). The scenes are those the manager's table names
// (`games/<game>/<game>.scene.json`), or those given.
// Both modes run the GPU profile whole: the page as it is, then each pass, the shadows and each material
// taken away in turn.
//   basic (the default): the GPU profile run once, as it runs by itself: 3 s a window, one run; the page's
//                        CPU timed for 10 s.
//   --deep:              the GPU profile with `--each 4 --runs 2`: each window 4 s, the whole of it
//                        twice, the medians and each row's least and most saved; the page's CPU for 20 s.
// `--playtest` has the page played by the game's playtester (`games/<game>/<game>.playtest.ts`) while its
// CPU and GPU are measured, in place of the seat sitting still.
// Each run's whole output is written to `<out>/<scene>.ticks.txt`, `<out>/<scene>.cpu.txt` and
// `<out>/<scene>.gpu.txt`, its data to the `.json` of each, and `<out>/run.json` names them all. `<out>`
// is `benchmarks/<game>/<when>` at the repo's root when no `--out` names one, where benchmarkPage.ts
// (`scripts/benchmarkPage.ts`) finds every run to look at and compare. One table of
// every scene is printed at the end. The page needs the game's server and the three lines of SKILL.md in
// its dev.html.
//   node bench.mjs <server base url> <game> [--deep] [--playtest] [--out <folder>] [scene]…
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { made, runFolder } from './testbed.mjs'

const args = process.argv.slice(2)
const take = f => { const i = args.indexOf(f); if (i >= 0) args.splice(i, 1); return i >= 0 }
const deep = take('--deep')
const playtest = take('--playtest')
const o = args.indexOf('--out')
const named = o >= 0 ? args.splice(o, 2)[1] : undefined
const [base, game, ...only] = args
if (!base || !game) {
  console.error('usage: node bench.mjs <server base url> <game> [--deep] [--playtest] [--out <folder>] [scene]…')
  process.exit(1)
}
const out = named ?? runFolder(game, playtest && 'played', deep && 'deep')
const here = import.meta.dirname
const root = path.resolve(here, '../../..')
const manager = JSON.parse(fs.readFileSync(path.join(root, 'games', game, `${game}.scene.json`), 'utf8'))
const scenes = only.length ? only : Object.keys(manager.prefabs.scenemanager.scenes)
fs.mkdirSync(out, { recursive: true })

const run = (file, argv) => {
  const t0 = Date.now()
  const r = spawnSync('node', argv, { cwd: root, encoding: 'utf8', timeout: 45 * 60 * 1000 })
  const text = (r.stdout ?? '') + (r.stderr ? '\n[stderr]\n' + r.stderr : '')
  fs.writeFileSync(path.join(out, file), text + `\n[exit ${r.status}${r.signal ? ' ' + r.signal : ''}, ${((Date.now() - t0) / 1000).toFixed(0)} s]\n`)
  console.log(`${file}: exit ${r.status}, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  return r.status === 0
}
const read = file => { try { return JSON.parse(fs.readFileSync(path.join(out, file), 'utf8')) } catch { return undefined } }

const index = { ...made('bench', { deep, playtest }), game, scenes: [] }
const page = [...(playtest ? ['--playtest'] : []), '--settle', '5', '--out', out]
for (const s of scenes) {
  const ok = {
    ticks: run(`${s}.ticks.txt`, ['--experimental-strip-types', path.join(here, 'rules-profile.ts'), game, s, '30', '--out', out]),
    cpu: run(`${s}.cpu.txt`, [path.join(here, 'scene-profile.mjs'), base, game, s, deep ? '20' : '10', ...page]),
    gpu: run(`${s}.gpu.txt`, [path.join(here, 'gpu-profile.mjs'), base, game, s, ...page, ...(deep ? ['--each', '4', '--runs', '2'] : [])]),
  }
  index.scenes.push({ scene: s, ok, files: Object.fromEntries(['ticks', 'cpu', 'gpu'].filter(k => fs.existsSync(path.join(out, `${s}.${k}.json`))).map(k => [k, `${s}.${k}.json`])) })
  fs.writeFileSync(path.join(out, 'run.json'), JSON.stringify(index, null, 1))
}

const rows = index.scenes.map(({ scene, ok }) => {
  const t = read(`${scene}.ticks.json`), c = read(`${scene}.cpu.json`), g = read(`${scene}.gpu.json`)
  const top = c?.owners.list[0]
  const saved = g?.taken[0]
  return {
    scene,
    step: t ? `${t.step.mean.toFixed(3)} (95% ${t.step.p95.toFixed(3)}, most ${t.step.most.toFixed(3)})` : ok.ticks ? '?' : 'failed',
    work: c ? `${c.work.toFixed(2)} ms, ${top ? `${top.name} ${top.side} ${top.ms.toFixed(2)}` : ''}` : ok.cpu ? '?' : 'failed',
    frame: g ? `${g.asIs.fps.toFixed(1)} a second, ${g.asIs.ms.toFixed(2)} ms` : ok.gpu ? '?' : 'failed',
    costliest: saved ? `${saved.label}: ${saved.saved.toFixed(2)} ms` : '',
  }
})
console.log(`\n${game}, ${deep ? 'deep' : 'basic'}${playtest ? ', played' : ''}: every run's output in ${out}\n`)
const cols = ['scene', 'step', 'work', 'frame', 'costliest']
const head = { scene: 'scene', step: 'ticks: ms a step', work: "page: a frame's CPU, its biggest owner", frame: 'page as it is', costliest: 'most saved taken away' }
const width = c => Math.max(head[c].length, ...rows.map(r => r[c].length))
for (const r of [head, ...rows]) console.log(cols.map(c => r[c].padEnd(width(c))).join('  '))
console.log('\nto look at it: node --experimental-strip-types scripts/benchmarkPage.ts')
