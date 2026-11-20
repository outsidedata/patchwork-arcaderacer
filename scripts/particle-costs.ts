// What each thing particle3d does costs, on the CPU, measured:
//
//   yarn particle-costs [--particles <n>] [--steps <n>] [--rounds <n>]
//
// It writes its own effects file in memory: `base`, one burst of `--particles` particles (5000 when left out)
// that all live past the run, and one effect for every field of a layer, every field of a force generator's
// entry, and every system particle3d runs beside them (streams, carrying, beams, bouncing, lamps, drivers,
// sheets), each the same particles with that one thing more. Each is played by core's particle3d in node, on
// a stand-in page (a loader that hands over the file and a sheet, a three.js scene and a camera), thrown, and
// timed over `--steps` steps (6) after the step it is thrown on; every effect is played once a round,
// `--rounds` rounds (5), and its fastest kept. It prints, for each, against the effect it is measured against:
//
//   at birth   microseconds it adds to a particle the step the particle is thrown: the throw step less a
//              step after it, over the particles.
//   a step     microseconds it adds to a particle each step after that.
//   particles  how many are in the air at the end of the run: a probe that throws more or fewer than `base`
//              (a stream, carrying) costs what it costs for those.
//
// A field of a force generator's entry is measured against an entry with the force it changes and not it:
// `range` against an entry that pulls, `falloff` against `range`. An entry's force is measured against an
// entry with nothing in it, and that against `base`. A field `base` already has (`n`, `life`, `shape`,
// `size`, `box`, `speed`) is what `base` costs. A word's drawing (instances3d's `mesh`) and the solids a mod
// hands over to bounce off are other plugins' and are not here; `bounce` bounces off the effect's floor.
import { performance } from 'node:perf_hooks'
import * as THREE from 'three'
import { particle3d, type Effects } from '../plugins/particle3d/particle3d.plugin.ts'
import { uv } from '../plugins/loader/loader.plugin.ts'
import { frameOf, read } from '../plugins/loader/loader.sim.ts'

type Json = any
// One probe: its name, what it is measured against, the layer's fields over the block's, the force generator
// entry it is in when it is in one and how hard, more layers beside it, and its spawn's life.
type Probe = { name: string; against?: string; layer?: Json; entry?: Json; strength?: Json; more?: Json[]; life?: number }

const DT = 1 / 60
const STOPS5 = [[0, 16777215], [0.25, 16769696], [0.5, 16747050], [0.75, 8002564], [1, 0]]

const PROBES: Probe[] = [
  { name: 'base' },
  // thrown
  { name: 'skip', against: 'base', layer: { skip: 0.5 } },
  { name: 'dir', against: 'base', layer: { dir: [1, 0, 0] } },
  { name: 'spread', against: 'dir', layer: { dir: [1, 0, 0], spread: 0.5 } },
  { name: 'outward', against: 'base', layer: { outward: [1, 2] } },
  { name: 'jitter', against: 'base', layer: { jitter: [1, 1, 1] } },
  { name: 'inherit', against: 'base', layer: { inherit: 1 } },
  { name: 'lasts', against: 'base', layer: { life: undefined, lasts: true } },
  // moved
  { name: 'g', against: 'base', layer: { g: 9.8 } },
  { name: 'drag', against: 'base', layer: { drag: 1 } },
  { name: 'pull', against: 'base', layer: { pull: 1 } },
  { name: 'swirl', against: 'base', layer: { swirl: 1 } },
  { name: 'axis', against: 'swirl', layer: { swirl: 1, axis: [1, 0, 0] } },
  { name: 'pace', against: 'base', layer: { pace: [[0, 0.5], [100, 1]] } },
  { name: 'follow', against: 'base', layer: { follow: true } },
  { name: 'bounce', against: 'g', layer: { g: 9.8, bounce: 0.5 } },
  { name: 'spin', against: 'base', layer: { spin: 2 } },
  // drawn
  { name: 'grow', against: 'base', layer: { grow: 2 } },
  { name: 'grows', against: 'base', layer: { grows: [[0, 0.2], [0.1, 1], [1, 1.4]] } },
  { name: 'tint', against: 'base', layer: { tint: 16746014 } },
  { name: 'tint1', against: 'tint', layer: { tint: 16746014, tint1: 0 } },
  { name: 'tints', against: 'base', layer: { tints: STOPS5 } },
  { name: 'gain', against: 'base', layer: { gain: 2 } },
  { name: 'a0 a1', against: 'base', layer: { a0: 1, a1: 0 } },
  { name: 'fade', against: 'a0 a1', layer: { a0: 1, a1: 0, fade: 1 } },
  { name: 'alphas', against: 'base', layer: { alphas: [[0, 0], [0.1, 1], [0.6, 1], [1, 0]] } },
  { name: 'flips', against: 'base', layer: { flips: [[0, 1, 0]] } },
  { name: 'origin', against: 'base', layer: { origin: [0.5, 1] } },
  { name: 'add', against: 'base', layer: { add: true } },
  { name: 'stretch', against: 'base', layer: { stretch: true } },
  { name: 'face', against: 'base', layer: { face: true } },
  { name: 'beam', against: 'base', layer: { beam: true } },
  { name: 'no shape', against: 'base', layer: { shape: undefined } },
  { name: 'sheet', against: 'no shape', layer: { shape: undefined, sheet: 'probe', clip: 'all' } },
  { name: 'sheet play', against: 'sheet', layer: { shape: undefined, sheet: 'probe', clip: 'all', play: true } },
  // systems
  { name: 'carry', against: 'base', layer: { carry: 'idle' } },
  { name: 'every', against: 'base', layer: { n: [100, 100], every: DT }, life: 1000 },
  { name: 'lamp', against: 'base', more: [{ lamp: { intensity: 2, distance: 4, decay: 2 } }], life: 1000 },
  { name: 'driver', against: 'drag', layer: { drag: 'k' } },
  // a force generator's entry
  { name: 'entry', against: 'base', entry: {} },
  { name: 'entry g', against: 'entry', entry: { g: 9.8 } },
  { name: 'entry drag', against: 'entry', entry: { drag: 1 } },
  { name: 'entry pull', against: 'entry', entry: { pull: 1 } },
  { name: 'entry swirl', against: 'entry', entry: { swirl: 1 } },
  { name: 'entry axis', against: 'entry swirl', entry: { swirl: 1, axis: [1, 0, 0] } },
  { name: 'direction', against: 'entry', entry: { direction: [1, 0, 0] } },
  { name: 'turbulence', against: 'entry', entry: { turbulence: 1 } },
  { name: 'noiseFrequency', against: 'turbulence', entry: { turbulence: 1, noiseFrequency: 2 } },
  { name: 'noiseScroll', against: 'turbulence', entry: { turbulence: 1, noiseScroll: [0, 1, 0] } },
  { name: 'noiseAmplitude', against: 'direction', entry: { direction: [1, 0, 0], noiseAmplitude: 0.5 } },
  { name: 'at', against: 'entry pull', entry: { pull: 1, at: [0, 2, 0] } },
  { name: 'anchor effect', against: 'entry pull', entry: { pull: 1, anchor: 'effect' } },
  { name: 'range', against: 'entry pull', entry: { pull: 1, range: 4 } },
  { name: 'falloff', against: 'range', entry: { pull: 1, range: 4, falloff: 1 } },
  { name: 'shell', against: 'entry pull', entry: { pull: 1, shell: 2 } },
  { name: 'toAxis', against: 'entry pull', entry: { pull: 1, toAxis: true } },
  { name: 'wind', against: 'entry drag', entry: { drag: 1, wind: [1, 0, 0] } },
  { name: 'dragBySpeed', against: 'entry drag', entry: { drag: 1, dragBySpeed: 0.1 } },
  { name: 'overLife', against: 'direction', entry: { direction: [1, 0, 0], overLife: [[0, 1], [0.5, 0.5], [1, 0]] } },
  { name: 'overAge', against: 'direction', entry: { direction: [1, 0, 0], overAge: [[0, 1], [1, 0.5], [2, 0]] } },
  { name: 'strength range', against: 'direction', entry: { direction: [1, 0, 0] }, strength: [0.5, 1] },
  { name: 'two generators', against: 'direction', entry: { direction: [1, 0, 0] } },
]

// The effects file: each probe an effect of its name, the block of particles with its fields (a field
// written undefined taken away), in a force generator of its own name when it has an entry; the effect
// `carry` carries, which throws nothing in the run; and the driver `k`.
function sheet(n: number): Effects {
  const block = { n: [n, n], life: [1000, 1000], shape: 'puff', size: [0.1, 0.1], box: [-3, 0, -3, 3, 4, 3], speed: [0.5, 0.5] }
  // `prime` draws one particle of each picture for less than a step, so the shapes' texture and the sheet's
  // mesh are made before any step is timed
  const effects: Json = {
    idle: [{ after: 1000, life: [1, 1], shape: 'puff' }],
    prime: [{ n: [1, 1], life: [1e-3, 1e-3], shape: 'puff' }, { n: [1, 1], life: [1e-3, 1e-3], sheet: 'probe', clip: 'all' }],
  }
  const forceGenerators: Json = { second: [{ direction: [0, 1, 0] }] }
  for (const p of PROBES) {
    const layer: Json = { ...block, ...p.layer }
    for (const k of Object.keys(layer)) if (layer[k] === undefined) delete layer[k]
    if (p.entry) layer.forces = { [p.name]: p.strength ?? 1, ...(p.name === 'two generators' ? { second: 1 } : {}) }
    effects[p.name] = [layer, ...(p.more ?? [])]
    if (p.entry) forceGenerators[p.name] = [p.entry]
  }
  return { cap: n * 4, ppm: 16, effects, forceGenerators, drivers: { k: 1 } }
}

// The probes' sheet as the loader hands one over: four frames of 16 pixels on one page, the clip `all`.
function probeSheet() {
  const cell = 16
  const json = {
    frames: [0, 1, 2, 3].map(i => ({
      filename: String(i), frame: { x: i * cell, y: 0, w: cell, h: cell }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: cell, h: cell }, sourceSize: { w: cell, h: cell }, pivot: { x: 0.5, y: 0.5 }, duration: 100,
    })),
    meta: { app: 'particle-costs', image: 'probe.png', frameTags: [{ name: 'all', from: 0, to: 3 }] },
  }
  const data = read(json, '/probe.json', {}, () => undefined)
  const pages = [new THREE.Texture({ width: cell * 4, height: cell })]
  return {
    data, pages,
    uv: (id: string) => uv(data.frames[id], cell * 4, cell),
    frameOf: (clip: string, run: number, i: number) => frameOf(data, clip, run, i),
  }
}

// One probe played on a fresh particle3d: the milliseconds of the step it is thrown on, of the `steps` steps
// after it, and the particles in the air at the end.
function time(file: Effects, sheetOf: Json, p: Probe, steps: number) {
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 2, 12)
  const plugins: Json = {
    wire: { scene: { plugins: ['loader', 'particle3d', 'lights3d', 'render3d'], world: { particle3d: { effects: 'effects' } }, prefabs: { engine: { dt: DT } } }, rows: [] },
    render3d: { THREE, scene: new THREE.Scene(), camera },
    loader: { on: (_: string, f: (it: Effects) => void) => f(file), onWritten: () => {}, get: (name: string) => (name === 'probe' ? sheetOf : undefined), load: () => {} },
  }
  const fx = particle3d()
  // the file read and checked, and every picture drawn once, before the timing starts
  fx.emit('prime', [0, -100, 0], { seed: 0 })
  fx.afterTick(plugins)
  fx.afterTick(plugins)
  fx.emit(p.name, [0, 1.2, 0], { dir: [0, 1, 0], to: [6, 1.2, 0], floor: 0, seed: 1, life: p.life ?? (p.layer?.lasts ? 1000 : 0) })
  let t0 = performance.now()
  fx.afterTick(plugins)
  const thrown = performance.now() - t0
  t0 = performance.now()
  for (let i = 0; i < steps; i++) fx.afterTick(plugins)
  const after = performance.now() - t0
  const count = fx.count
  fx.close(plugins)
  return { thrown, after, count }
}

const args = process.argv.slice(2)
const given = (flag: string, fallback: number) => {
  const i = args.indexOf(flag)
  const v = i < 0 ? fallback : Number(args[i + 1])
  if (!(Number.isInteger(v) && v > 0)) throw new Error(`${flag} is ${args[i + 1]}, and it is a whole number above 0`)
  return v
}
const n = given('--particles', 5000), steps = given('--steps', 6), rounds = given('--rounds', 5)
const began = performance.now()
const file = sheet(n)
const sheetOf = probeSheet()
// one round first, so every function is compiled before any is timed
for (const p of PROBES) time(file, sheetOf, p, steps)
const best = new Map<string, { thrown: number; after: number; count: number }>()
for (let r = 0; r < rounds; r++) for (const p of PROBES) {
  const t = time(file, sheetOf, p, steps), b = best.get(p.name)
  best.set(p.name, { thrown: Math.min(b?.thrown ?? Infinity, t.thrown), after: Math.min(b?.after ?? Infinity, t.after), count: t.count })
}
// microseconds a particle: at birth (the throw step less a step after it), and a step after it
const birth = (x: { thrown: number; after: number }) => ((x.thrown - x.after / steps) * 1000) / n
const step = (x: { after: number }) => (x.after * 1000) / (n * steps)
const f = (x: number) => x.toFixed(3).padStart(9)
const b = best.get('base')!
console.log(`${n} particles, ${steps} steps, the fastest of ${rounds} rounds\n`)
console.log(`base: ${step(b).toFixed(3)} µs a particle a step (moved, its quad written), ${birth(b).toFixed(3)} µs at birth\n`)
console.log(`${'what'.padEnd(17)}${'against'.padEnd(14)}${'at birth'.padStart(9)}${'a step'.padStart(9)}${'particles'.padStart(11)}`)
for (const p of PROBES) {
  if (!p.against) continue
  const x = best.get(p.name)!, a = best.get(p.against)!
  console.log(`${p.name.padEnd(17)}${p.against.padEnd(14)}${f(birth(x) - birth(a))}${f(step(x) - step(a))}${String(x.count).padStart(11)}`)
}
console.log(`\n${((performance.now() - began) / 1000).toFixed(1)} s`)
