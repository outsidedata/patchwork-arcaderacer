// Benchmarks every scene of a game, one after another, never two at once (they share the GPU): each
// scene's ticks on node (rules-profile.ts), then its page on the GPU (gpu-profile.mjs). The scenes are
// those the manager's table names (`games/<game>/<game>.scene.json`), or those given.
// Both modes run the GPU profile whole: the page as it is, then each pass, the shadows and each material
// taken away in turn.
//   basic (the default): the GPU profile run once, as it runs by itself: 3 s a window, one run.
//   --deep:              the GPU profile with `--each 4 --runs 2`: each window 4 s, the whole of it
//                        twice, the medians and each row's least and most saved.
// Each run's whole output is written to `<out>/<scene>.ticks.txt` and `<out>/<scene>.gpu.txt`, and one
// table of every scene is printed at the end. The page needs the game's server and the three lines of
// SKILL.md in its dev.html.
//   node bench.mjs <server base url> <game> [--deep] [--out <folder>] [scene]…
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const deep = args.includes('--deep')
if (deep) args.splice(args.indexOf('--deep'), 1)
const o = args.indexOf('--out')
const out = o >= 0 ? args.splice(o, 2)[1] : fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'))
const [base, game, ...only] = args
if (!base || !game) {
  console.error('usage: node bench.mjs <server base url> <game> [--deep] [--out <folder>] [scene]…')
  process.exit(1)
}
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
  return { ok: r.status === 0, text }
}

const rows = []
for (const s of scenes) {
  const ticks = run(`${s}.ticks.txt`, ['--experimental-strip-types', path.join(here, 'rules-profile.ts'), game, s, '30'])
  const gpu = run(`${s}.gpu.txt`, [path.join(here, 'gpu-profile.mjs'), base, game, s, '--settle', '5', ...(deep ? ['--each', '4', '--runs', '2'] : [])])
  const step = ticks.text.match(/a step mean ([\d.]+) ms, 95% ([\d.]+) ms, most ([\d.]+) ms/)
  const top = ticks.text.match(/^\s+([\d.]+)\s+[\d.]+%\s+(.+)$/m)
  const frame = gpu.text.match(/as it is: ([\d.]+) frames a second, ([\d.]+) ms a frame/)
  // the first row under the header is the thing whose taking away saved the most
  const table = gpu.text.split('taken away\n')[1] ?? ''
  const saved = deep ? table.match(/^\s+[\d.]+\s+[\d.]+\s+([-\d.]+)\s+\S+\s{3}(.+)$/m) : table.match(/^\s+[\d.]+\s+[\d.]+\s+([-\d.]+)\s{3}(.+)$/m)
  rows.push({
    scene: s,
    step: step ? `${step[1]} (95% ${step[2]}, most ${step[3]})` : ticks.ok ? '?' : 'failed',
    rule: top ? `${top[2]} ${top[1]}` : '',
    frame: frame ? `${frame[1]} a second, ${frame[2]} ms` : gpu.ok ? '?' : 'failed',
    costliest: saved ? `${saved[2]}: ${saved[1]} ms` : '',
  })
}

console.log(`\n${game}, ${deep ? 'deep' : 'basic'}: every run's output in ${out}\n`)
const cols = ['scene', 'step', 'rule', 'frame', 'costliest']
const head = { scene: 'scene', step: 'ticks: ms a step', rule: 'biggest rule, ms', frame: 'page as it is', costliest: 'most saved taken away' }
const width = c => Math.max(head[c].length, ...rows.map(r => r[c].length))
for (const r of [head, ...rows]) console.log(cols.map(c => r[c].padEnd(width(c))).join('  '))
