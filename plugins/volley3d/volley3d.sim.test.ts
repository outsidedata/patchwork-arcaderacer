// volley3d's server half on a range the test writes: a manager and one child, `range`, which `load`
// boots as a game's would, so the mods its `world.volley3d.mods` names are loaded before the first
// step: hitscan3d's `shoot` and `bodies`, and through hitscan3d terrain3d's ground, level at 0, and
// walker's bodies, six dummies each a metre round and four tall, which the test stands where each
// case needs them and parks the rest far off. The ledger row, a `tube` that rounds are fired `from`
// and whose `landed` act writes down every call it is handed, and a `probe` that hands the test the
// child's `w`. The patterns are the test's own. It fires with `fire` between steps and reads the
// ledger: the entry `fire` puts on it, an unguided round's closed-form flight and the steps that
// follow it, what a round meets and whom `landed` is called on for it, splash, a guided round turning
// onto a moving target, a round's life, how long an entry stays once it has ended, and the row's
// fields; and a round's `radius`, a splash of its own shooter, a guided round with nothing to turn
// toward, a speed that falls, a `from` that has ended, and what the file and `world.volley3d` may hold.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import type { Numbers as Walker } from '#plugins/walker/walker.sim.ts'
import { check, fire, flight, intercept } from './volley3d.sim.ts'

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

type Hit = { point: number[]; what: string; id?: number | null }
type Entry = {
  id: number; pattern: string; at: number[]; dir: number[]; age: number; from: number; n: number; skip: number[]
  target?: number; ride?: { id: number; field: string }; pos: number[]; vel: number[]; hit?: Hit
}

// The range booted and stepped once: its `w`, the tube and the dummies, every dummy parked.
async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('range')!
  child.step(DT)
  const w = (globalThis as { volley3dRange?: W }).volley3dRange!
  const steps = (k: number) => { for (let i = 0; i < k; i++) child.step(DT) }
  const ledger = () => w.all('volley3d')[0].data
  const entry = (id: number): Entry | undefined => (ledger().live as Entry[]).find(e => e.id === id)
  const tube = w.all('tube')[0]
  // Fires from the tube and hands back the entry's id, the ledger's `next` as it fired.
  const shoot = (pattern: string, at: number[], aim: number[], key: { n: number; skip?: number[]; target?: number; ride?: { id: number; field: string } }) => {
    const id: number = ledger().next
    fire(w, pattern, at, aim, { from: tube.id, skip: [], ...key })
    return id
  }
  return { child, w, steps, ledger, entry, shoot, tube, dummies: w.all('dummy') }
}

const unit = (v: number[]) => v.map(c => c / Math.hypot(v[0], v[1], v[2]))
const close = (got: number[], want: number[], digits = 9) => got.forEach((g, i) => expect(g).toBeCloseTo(want[i], digits))
const stand = (row: Row, pos: number[], walk = [0, 0, 0]) => { row.data.pos = pos; row.data.walk = walk }
const angle = (a: number[], b: number[]) => {
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(a[0], a[1], a[2]) * Math.hypot(b[0], b[1], b[2]))
  return Math.acos(Math.min(1, Math.max(-1, c)))
}

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

test('an unguided round is where flight puts it at its age, step after step, one dt older each step', async () => {
  const { steps, entry, shoot } = await booted()
  const at = [0, 2, 0], aim = [0.6, 0.8, 0]
  const id = shoot('shell', at, aim, { n: 1 })
  for (let k = 1; k <= 150; k++) {
    steps(1)
    const e = entry(id)!
    expect(e.age).toBeCloseTo(k * DT, 9)
    close(e.pos, flight(patterns.shell, at, aim, e.age), 9)
    expect(e.hit).toBeUndefined()
  }
  // 2.5 s: a second and a half past reaching max, 69 m along x.
  expect(entry(id)!.pos[0]).toBeCloseTo(69, 9)
})

// ---------------------------------------------------------------- what a round meets

test('a round meeting the ground writes hit there, what ground, and calls landed on its from once, with no id, no part and far 0', async () => {
  const { steps, entry, shoot, tube } = await booted()
  // From 2 m up, 0.6 of 30 m/s down: the ground in 1/9 s, between the 6th step and the 7th, 2.67 m on.
  const id = shoot('rocket', [0, 2, 0], [0, -0.6, 0.8], { n: 1 })
  steps(6)
  expect(entry(id)!.hit).toBeUndefined()
  expect(tube.data.landed).toEqual([])
  steps(1)
  const hit = entry(id)!.hit!
  expect(hit.what).toBe('ground')
  close(hit.point, [0, 0, 24 / 9], 4)
  expect(tube.data.landed).toEqual([[id, 'ground', null, null, 0]])
  steps(10)
  expect(tube.data.landed).toHaveLength(1)
})

test('a round meeting a body calls landed with body, the body\'s id and the part it met; one given its id in skip passes through it', async () => {
  const { steps, entry, shoot, tube, dummies } = await booted()
  const [a, b] = dummies
  stand(a, [0, 0, 12])
  stand(b, [0, 0, 20])
  // 3 m up is 0.75 of a dummy's height: its chest.
  const first = shoot('rocket', [0, 3, 0], [0, 0, 1], { n: 1 })
  const past = shoot('rocket', [0, 3, 0], [0, 0, 1], { n: 2, skip: [a.id] })
  // A's side is 11 m on and B's 19 m, at 30 m/s: the first meets A by its 23rd step and the second B by
  // its 39th, and each entry stays `hold`, 15 steps, after, so each is read while it is held.
  steps(30)
  expect(entry(first)!.hit).toMatchObject({ what: 'body', id: a.id })
  close(entry(first)!.hit!.point, [0, 3, 11], 6)
  expect(entry(past)!.hit).toBeUndefined()
  steps(15)
  expect(entry(past)!.hit).toMatchObject({ what: 'body', id: b.id })
  close(entry(past)!.hit!.point, [0, 3, 19], 6)
  expect(tube.data.landed).toEqual([[first, 'body', a.id, 'chest', 0], [past, 'body', b.id, 'chest', 0]])
})

test('splash calls landed with splash, the id and how far on every other body within its radius, after a body or the ground', async () => {
  const { steps, shoot, tube, dummies } = await booted()
  const [a, d, f, e, g, h] = dummies
  // Onto A's side at (0, 2.4, 11): D's side is 2 m off, F's 3 m, E's 6 m, past the 5 m of splash.
  stand(a, [0, 0, 12])
  stand(d, [3, 0, 11])
  stand(f, [-4, 0, 11])
  stand(e, [0, 0, 18])
  const onto = shoot('grenade', [0, 2.4, 0], [0, 0, 1], { n: 1 })
  steps(30)
  const got = tube.data.landed as [number, string, number | null, string | null, number][]
  expect(got).toHaveLength(3)
  expect(got).toContainEqual([onto, 'body', a.id, 'chest', 0])
  const splash = got.filter(l => l[1] === 'splash')
  expect(splash.map(l => l[2]).sort((x, y) => x! - y!)).toEqual([d.id, f.id].sort((x, y) => x - y))
  for (const l of splash) expect([l[0], l[3]]).toEqual([onto, null])
  expect(splash.find(l => l[2] === d.id)![4]).toBeCloseTo(2, 6)
  expect(splash.find(l => l[2] === f.id)![4]).toBeCloseTo(3, 6)
  // Onto the ground at (10, 0, 2.67): G's side is 2.33 m off, H's 5.83 m.
  tube.data.landed = []
  dummies.forEach((r, i) => stand(r, parked(i)))
  stand(g, [10, 0, 6])
  stand(h, [10, 0, 9.5])
  const down = shoot('grenade', [10, 2, 0], [0, -0.6, 0.8], { n: 2 })
  steps(10)
  const ground = tube.data.landed as [number, string, number | null, string | null, number][]
  expect(ground).toHaveLength(2)
  expect(ground).toContainEqual([down, 'ground', null, null, 0])
  const near = ground.find(l => l[1] === 'splash')!
  expect(near.slice(0, 4)).toEqual([down, 'splash', g.id, null])
  expect(near[4]).toBeCloseTo(6 - 24 / 9 - 1, 4)
})

test('a guided round turns toward its moving target at no more than seek, keeps its speed and meets it, where an unguided one misses', async () => {
  const { steps, entry, shoot, tube, dummies } = await booted()
  const [t] = dummies
  // T stands 30 m off and walks away along +x at 8 m/s; both rounds are fired at where it stood.
  stand(t, [0, 0, 30], [8, 0, 0])
  const at = [0, 3, 0], aim = unit([0, -2, 30])
  const missile = shoot('missile', at, aim, { n: 1, target: t.id })
  const dart = shoot('dart', at, aim, { n: 2, target: t.id })
  let last = entry(missile)!.vel.slice()
  let k = 0
  for (; k < 150 && !entry(missile)!.hit; k++) {
    steps(1)
    const e = entry(missile)!
    expect(Math.hypot(e.vel[0], e.vel[1], e.vel[2])).toBeCloseTo(30, 6)
    expect(angle(e.vel, last)).toBeLessThanOrEqual(3 * DT + 1e-9)
    if (k === 10) expect(e.vel[0]).toBeGreaterThan(0)
    last = e.vel.slice()
  }
  expect(entry(missile)!.hit).toMatchObject({ what: 'body', id: t.id })
  expect(tube.data.landed).toContainEqual([missile, 'body', t.id, expect.any(String), 0])
  steps(150 - k)
  expect(entry(dart)?.hit?.id).not.toBe(t.id)
  expect((tube.data.landed as unknown[][]).filter(l => l[0] === dart && l[1] === 'body')).toEqual([])
})

test('a round fired to ride a row\'s point turns toward it, before its target, follows it as it moves and meets the ground there; with the row carrying no point, and no target, it flies on straight', async () => {
  const { steps, entry, shoot, tube, dummies } = await booted()
  const [t] = dummies
  stand(t, [0, 0, 30], [0, 0, 0])
  const at = [0, 10, 0], aim = [0, 0, 1]
  tube.data.spot = [25, 0, 45]
  const rider = shoot('missile', at, aim, { n: 1, target: t.id, ride: { id: tube.id, field: 'spot' } })
  expect(entry(rider)!.ride).toEqual({ id: tube.id, field: 'spot' })
  let last = entry(rider)!.vel.slice()
  for (let k = 0; k < 12; k++) {
    steps(1)
    const e = entry(rider)!
    expect(angle(e.vel, last)).toBeLessThanOrEqual(3 * DT + 1e-9)
    last = e.vel.slice()
  }
  // Turned toward the spot at +x, not the target straight ahead.
  expect(entry(rider)!.vel[0]).toBeGreaterThan(0)
  // The spot moves across to −x; the round follows it there.
  tube.data.spot = [-15, 0, 50]
  for (let k = 0; k < 180 && !entry(rider)!.hit; k++) steps(1)
  const hit = entry(rider)!.hit!
  expect(hit.what).toBe('ground')
  expect(Math.hypot(hit.point[0] + 15, hit.point[2] - 50)).toBeLessThan(2)

  // With no point on the row and no target, the ride turns it toward nothing.
  delete tube.data.spot
  const blind = shoot('homing', [0, 20, 0], unit([0.2, 0.3, 1]), { n: 2, ride: { id: tube.id, field: 'spot' } })
  const was = entry(blind)!
  for (let k = 1; k <= 60; k++) {
    steps(1)
    const e = entry(blind)!
    if (e.hit) break
    close(e.pos, flight(patterns.homing, was.at, was.dir, e.age), 9)
  }
})

test('intercept ends a round in flight where it is, what intercepted, telling nobody, and it stays put; an ended round, or an id no entry has, is left be', async () => {
  const { w, steps, entry, shoot, tube } = await booted()
  const at = [0, 5, 0], aim = [0, 0, 1]
  const id = shoot('rocket', at, aim, { n: 1 })
  steps(20)
  const e = entry(id)!
  const there = e.pos.slice(), age = e.age
  expect(intercept(w, id)).toBe(true)
  expect(entry(id)!.hit).toEqual({ point: there, what: 'intercepted', id: null, age })
  steps(10)
  expect(entry(id)!.pos).toEqual(there)
  expect(tube.data.landed).toEqual([])
  expect(intercept(w, id)).toBe(false)
  expect(intercept(w, 99_999)).toBe(false)
})

// ---------------------------------------------------------------- ending

test('a round past its life ends with no hit and calls nothing, and its entry leaves hold seconds after', async () => {
  const { steps, entry, shoot, tube } = await booted()
  // Straight up at 10 m/s: it meets nothing in its half second.
  const id = shoot('short', [0, 1, 0], [0, 1, 0], { n: 1 })
  const end = Math.round(patterns.short.life / DT), hold = Math.round(HOLD / DT)
  steps(end + hold - 2)
  expect(entry(id)).toBeDefined()
  expect(entry(id)!.hit).toBeUndefined()
  steps(4)
  expect(entry(id)).toBeUndefined()
  expect(tube.data.landed).toEqual([])
})

test('an entry that has hit stays hold seconds after, calling landed no more, and then leaves', async () => {
  const { steps, entry, shoot, tube } = await booted()
  // The ground on the 7th step, as above.
  const id = shoot('rocket', [0, 2, 0], [0, -0.6, 0.8], { n: 1 })
  const hold = Math.round(HOLD / DT)
  steps(7 + hold - 2)
  expect(entry(id)!.hit!.what).toBe('ground')
  steps(4)
  expect(entry(id)).toBeUndefined()
  expect(tube.data.landed).toEqual([[id, 'ground', null, null, 0]])
})

test('the ledger row carries next and live and nothing else; a field it does not know throws, naming it', async () => {
  const { child, steps, ledger, shoot } = await booted()
  shoot('rocket', [0, 2, 0], [0, -0.6, 0.8], { n: 1 })
  shoot('short', [0, 1, 0], [0, 1, 0], { n: 2 })
  steps(20)
  expect(Object.keys(ledger()).sort()).toEqual(['live', 'next'])
  ledger().extra = 1
  expect(() => child.step(DT)).toThrow(/extra/)
})

// ---------------------------------------------------------------- more of a pattern

test('a round with a radius meets a body its middle passes within that of, where one without passes it by; the ground meets its middle', async () => {
  const { steps, entry, shoot, tube, dummies } = await booted()
  const [a] = dummies
  stand(a, [0, 0, 12])
  // 1.3 m off A's axis, 0.3 m past its side.
  const thin = shoot('rocket', [1.3, 3, 0], [0, 0, 1], { n: 1 })
  const fat = shoot('fat', [1.3, 3, 0], [0, 0, 1], { n: 2 })
  steps(30)
  expect(entry(thin)!.hit).toBeUndefined()
  expect(entry(fat)!.hit).toMatchObject({ what: 'body', id: a.id })
  close(entry(fat)!.hit!.point, [1.3, 3, 12 - Math.sqrt(1.5 ** 2 - 1.3 ** 2)], 6)
  expect(tube.data.landed).toEqual([[fat, 'body', a.id, 'chest', 0]])
  const down = shoot('fat', [0, 2, 0], [0, -0.6, 0.8], { n: 3 })
  steps(7)
  close(entry(down)!.hit!.point, [0, 0, 24 / 9], 4)
})

test('a splash reaches the round\'s own shooter too: skip is the line\'s alone', async () => {
  const { steps, shoot, tube, dummies } = await booted()
  const [a] = dummies
  // A fires from its own chest down onto the ground 2.67 m ahead: its side is 1.67 m from the burst.
  stand(a, [0, 0, 0])
  const id = shoot('grenade', [0, 2, 0], [0, -0.6, 0.8], { n: 1, skip: [a.id] })
  steps(10)
  const got = tube.data.landed as [number, string, number | null, string | null, number][]
  expect(got.map(l => l.slice(0, 4))).toEqual([[id, 'ground', null, null], [id, 'splash', a.id, null]])
  expect(got[1][4]).toBeCloseTo(24 / 9 - 1, 4)
})

test('a guided round with nothing to turn toward flies as flight says: fired at no target, or at one that is no body', async () => {
  const { steps, entry, shoot, tube } = await booted()
  const at = [0, 20, 0], aim = unit([0.2, 0.3, 1])
  const none = shoot('homing', at, aim, { n: 1 })
  const gone = shoot('homing', at, aim, { n: 2, target: tube.id })
  for (let k = 1; k <= 120; k++) {
    steps(1)
    for (const id of [none, gone]) {
      const e = entry(id)!
      close(e.pos, flight(patterns.homing, at, aim, e.age), 9)
      expect(e.hit).toBeUndefined()
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

test('a round from a row that has ended meets what it meets and tells nobody', async () => {
  const { steps, entry, w, tube } = await booted()
  const e = fire(w, 'rocket', [0, 2, 0], [0, -0.6, 0.8], { from: 9999, n: 1, skip: [] })
  steps(7)
  expect(entry(e.id)!.hit!.what).toBe('ground')
  expect(tube.data.landed).toEqual([])
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
