// volley3d's server half on a range the test writes: a manager and one child, `range`, which `load`
// boots as a game's would, so the mods its `world.volley3d.mods` names are loaded before the first
// step: hitscan3d's `shoot` and `bodies`, and through hitscan3d terrain3d's ground, level at 0, and
// walker's bodies, six dummies each a metre round and four tall, which the test stands where each
// case needs them and parks the rest far off. The ledger row, a `tube` that rounds are fired `from`
// and whose `landed` act writes down every call it is handed, and a `probe` that hands the test the
// child's `w`. The patterns are the test's own. The entry `fire` puts on the ledger, a round's
// closed-form flight against many small steps of it, a speed that falls, and what the file and
// `world.volley3d` may hold.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import type { Numbers as Walker } from '#plugins/walker/walker.sim.ts'
import { check, fire, flight } from './volley3d.sim.ts'

const DT = 1 / 60
const HOLD = 0.25
const field: Field = {
  program: { world: 600, hscale: 10, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  bands: [{ colour: '#3e5722', amount: 1, rules: [] }],
  grain: { base: 1, range: 0 },
  detail: [],
  surfaces: {},
  layers: [],
}
const landUrl = '/volley3d-test/range.json'
written(landUrl, JSON.stringify(field))

type Pattern = { speed: number; accel?: number; max?: number; g?: number; life: number; radius?: number; splash?: number; seek?: number; look: { body: string; trail: string; burst: string } }
const look = { body: 'flame', trail: 'smoke', burst: 'boom' }
const patterns: Record<string, Pattern> = {
  rocket: { speed: 30, life: 3, look },
  grenade: { speed: 30, life: 3, splash: 5, look },
  shell: { speed: 30, accel: 20, max: 50, g: 9.8, life: 8, look },
  lob: { speed: 25, g: 9.8, life: 8, look },
  missile: { speed: 30, seek: 3, life: 3, look },
  dart: { speed: 30, life: 3, look },
  short: { speed: 10, life: 0.5, look },
  fat: { speed: 30, life: 3, radius: 0.5, look },
  brake: { speed: 30, accel: -20, life: 3, look },
  over: { speed: 60, accel: -20, max: 40, life: 3, look },
  homing: { speed: 20, accel: 10, max: 40, g: 5, seek: 2, life: 3, look },
}
const patternsUrl = '/volley3d-test/patterns.json'
written(patternsUrl, JSON.stringify({ patterns }))

const DUMMY: Walker = {
  radius: 1, height: 4, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9,
  step: 0.6, maxSlope: 0.7, slopeBand: 0.05, slide: 2, wade: 0.5, span: 0.5, probe: 1.5, seekSpeed: 1.5,
}
const parked = (i: number) => [100 + 10 * i, 0, 100]

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { range: { file: 'range.scene.json', suspend: false } }, dt: DT, entry: 'range', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const range = {
  world: {
    loader: { assets: { land: { type: 'json', url: landUrl, preload: true }, patterns: { type: 'json', url: patternsUrl, preload: true } } },
    terrain3d: { field: 'land' },
    walker: { kinds: { dummy: DUMMY } },
    hitscan3d: { mods: { ground: 'terrain3d', bodies: 'walker' }, kinds: { dummy: { parts: { legs: [0, 0.5], chest: [0.5, 1] } } }, rewind: 1 },
    volley3d: { patterns: 'patterns', hold: HOLD, mods: { shoot: 'hitscan3d', bodies: 'hitscan3d' } },
  },
  prefabs: {
    engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, volley3d: { next: 1, live: [] },
    tube: { landed: [] }, dummy: { pos: [0, 0, 0], walk: [0, 0, 0] }, probe: {},
  },
  actors: [
    { is: 'scenemanager' }, { is: 'loader' }, { is: 'volley3d' }, { is: 'tube' },
    ...[0, 1, 2, 3, 4, 5].map(i => ({ is: 'dummy', pos: parked(i) })),
    { is: 'probe' },
  ],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'volley3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'range.scene.json'), JSON.stringify(range))
writeFileSync(join(dir, 'range.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { volley3d } from ${path('./volley3d.sim.ts')}
import file from './range.scene.json' with { type: 'json' }
export const sim = {
  scenemanager, loader, volley3d,
  tube: { acts: { landed(me, _w, _seat, ...args) { me.data.landed.push(args) } } },
  dummy: { tick(me, dt) { const v = me.data.walk; me.data.pos = me.data.pos.map((c, i) => c + v[i] * dt) } },
  probe: { before(_me, _dt, w) { globalThis.volley3dRange = w } },
}
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

// The range booted and stepped once: its `w`, the tube and the dummies, every dummy parked.
async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('range')!
  child.step(DT)
  const w = (globalThis as { volley3dRange?: W }).volley3dRange!
  const ledger = () => w.all('volley3d')[0].data
  return { child, w, ledger, tube: w.all('tube')[0], dummies: w.all('dummy') }
}

const unit = (v: number[]) => v.map(c => c / Math.hypot(v[0], v[1], v[2]))
const close = (got: number[], want: number[], digits = 9) => got.forEach((g, i) => expect(g).toBeCloseTo(want[i], digits))

// A round's place by many small steps: its speed along its aim growing by `accel` until it reaches
// `max`, and `g` pulling it down, each step's move at the step's middle.
const stepped = (p: Pattern, at: number[], aim: number[], s: number) => {
  const n = 20000, dt = s / n, max = p.max ?? Infinity, a = p.accel ?? 0, g = p.g ?? 0
  let along = 0, v = Math.min(max, p.speed), drop = 0, fall = 0
  for (let i = 0; i < n; i++) {
    along += Math.min(max, v + (a * dt) / 2) * dt
    v = Math.min(max, v + a * dt)
    drop += (fall + (g * dt) / 2) * dt
    fall += g * dt
  }
  return [at[0] + aim[0] * along, at[1] + aim[1] * along - drop, at[2] + aim[2] * along]
}

// ---------------------------------------------------------------- the entry

test('fire puts an entry on the ledger: its id, pattern, at, dir, age 0, from, n, skip and target, its pos at at and its vel its speed along dir', async () => {
  const { w, ledger, tube, dummies } = await booted()
  fire(w, 'rocket', [0, 1, 0], [0, 0.6, 0.8], { from: tube.id, n: 3, skip: [dummies[0].id] })
  fire(w, 'missile', [2, 1, 0], [0, 0, 1], { from: tube.id, n: 4, skip: [], target: dummies[1].id })
  expect(ledger().live).toEqual([
    {
      id: 1, pattern: 'rocket', at: [0, 1, 0], dir: [0, 0.6, 0.8], age: 0, from: tube.id, n: 3, skip: [dummies[0].id],
      pos: [0, 1, 0], vel: [expect.closeTo(0, 12), expect.closeTo(18, 12), expect.closeTo(24, 12)],
    },
    {
      id: 2, pattern: 'missile', at: [2, 1, 0], dir: [0, 0, 1], age: 0, from: tube.id, n: 4, skip: [], target: dummies[1].id,
      pos: [2, 1, 0], vel: [expect.closeTo(0, 12), expect.closeTo(0, 12), expect.closeTo(30, 12)],
    },
  ])
  expect(ledger().next).toBe(3)
})

// ---------------------------------------------------------------- flight

test('flight speeds a round along its aim by accel until max and holds it there, while g pulls it down', () => {
  const { shell } = patterns
  // 30 → 50 m/s takes 1 s, 40 m on the way, then 50 m a second; the fall is g t² / 2.
  close(flight(shell, [0, 0, 0], [1, 0, 0], 0.5), [17.5, -1.225, 0])
  close(flight(shell, [0, 0, 0], [1, 0, 0], 1), [40, -4.9, 0])
  close(flight(shell, [0, 0, 0], [1, 0, 0], 2), [90, -19.6, 0])
  close(flight(shell, [3, 4, 5], [0, 0, -1], 2), [3, 4 - 19.6, 5 - 90])
  close(flight(patterns.rocket, [1, 2, 3], [0, 0.6, 0.8], 0.5), [1, 2 + 9, 3 + 12])
})

test('flight is where many small steps of its speed, accel up to max and g put a round', () => {
  const aim = unit([0.3, 0.8, -0.52])
  for (const name of ['shell', 'lob', 'rocket']) {
    for (const s of [0.3, 1, 2.5, 4]) {
      const got = flight(patterns[name], [5, 1, -2], aim, s)
      const want = stepped(patterns[name], [5, 1, -2], aim, s)
      expect(Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2]), `${name} at ${s} s`).toBeLessThan(1e-6)
    }
  }
})

test('a negative accel slows a round through nothing and back the way it came; one fired over its max holds max until its speed falls under it', () => {
  const aim = unit([0.3, 0.8, -0.52])
  for (const s of [0.3, 1, 1.5, 2.5]) {
    const got = flight(patterns.brake, [5, 1, -2], aim, s), want = stepped(patterns.brake, [5, 1, -2], aim, s)
    expect(Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2]), `brake at ${s} s`).toBeLessThan(1e-6)
  }
  // 30 m/s falling by 20: 22.5 m out by 1.5 s, and back to 12.5 m by 2.5 s.
  close(flight(patterns.brake, [0, 0, 0], [1, 0, 0], 1.5), [22.5, 0, 0])
  close(flight(patterns.brake, [0, 0, 0], [1, 0, 0], 2.5), [12.5, 0, 0])
  // min(40, 60 − 20 t): 40 m/s for a second, then 40 falling to 20 over the next.
  close(flight(patterns.over, [0, 0, 0], [1, 0, 0], 0.5), [20, 0, 0])
  close(flight(patterns.over, [0, 0, 0], [1, 0, 0], 2), [70, 0, 0])
})

test('a field of world.volley3d, of a pattern or of its look that volley3d does not know throws, naming it, and so does a pattern with no speed, life or look', async () => {
  const own = { patterns: 'patterns', hold: 1 }
  expect(() => check({ patterns: { a: { speed: 1, life: 1, look: {}, sped: 2 } as never } }, own)).toThrow('volley3d pattern a has sped, which volley3d does not know')
  expect(() => check({ patterns: { b: { speed: 1, life: 1, look: { flash: 'x' } } as never } }, own)).toThrow('volley3d pattern b\'s look has flash, which volley3d does not know')
  for (const k of ['speed', 'life', 'look']) {
    const p: Record<string, unknown> = { speed: 1, life: 1, look: {} }
    delete p[k]
    expect(() => check({ patterns: { c: p as never } }, own)).toThrow(`volley3d pattern c has no ${k}`)
  }
  expect(() => check({ patterns: {} }, { ...own, spin: 1 })).toThrow('world.volley3d has spin, which volley3d does not know')
  const { child, w } = await booted()
  w.world.volley3d.spin = 1
  expect(() => child.step(DT)).toThrow('world.volley3d has spin, which volley3d does not know')
  delete w.world.volley3d.spin
  expect(() => fire(w, 'none', [0, 1, 0], [0, 0, 1], { from: 1, n: 1, skip: [] })).toThrow('volley3d has no pattern none')
  expect(() => fire(w, 'rocket', [0, 1, 0], [0, 0, 0], { from: 1, n: 1, skip: [] })).toThrow('volley3d is asked a round along no direction')
})
