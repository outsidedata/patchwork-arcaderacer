// The ledger of the volleys the rules fire, and every bullet's flight as a function of its volley's
// age. The test writes its own scene: the ledger row and a `gun` kind whose tick fires the pattern
// its row names on the step its row says, from its `from`, toward its `dir`.
import { expect, test } from 'vitest'
import { boot, type Scene, type Sim } from '#engine/engine.ts'
import { jsonAt, written } from '#plugins/loader/loader.sim.ts'
import { ahead, clear, fire, move, points, shots, strike, volley2d, type Entry, type Patterns } from './volley2d.sim.ts'

const DT = 1 / 60
const V = 120

const file: Patterns = {
  patterns: {
    one: [{ speed: V, radius: 2 }],
    ring: [{ n: 8, ring: true, speed: V, radius: 2 }],
    fan: [{ n: 5, spread: 1, speed: V }],
    spiral: [{ n: 1, bursts: 4, every: 0.1, turn: 0.5, after: 0.2, speed: V }],
    fast: [{ speed: 10, accel: 100, max: 60 }],
    stop: [{ speed: 60, accel: -120, min: 0 }],
    arc: [{ speed: 50, accel: 20, max: 90, curve: 1.3 }],
    short: [{ speed: 1, life: 0.25 }],
    both: [{ pattern: 'one', at: [5, -3], dir: 0.4, after: 0.5 }, { offset: Math.PI, speed: V }],
    loop: [{ pattern: 'loop2' }],
    loop2: [{ pattern: 'loop' }],
  },
}
const url = '/volley2d-test/patterns.json'
written(url, JSON.stringify(file))
const patterns = await jsonAt('patterns', url)

const gun: Sim[string] = {
  tick(me, _dt, w) {
    const d = me.data
    if (d.at === d.step) d.id = fire(w, d.pattern, d.from, d.dir, d.side).id
    d.step++
  },
}

// Runs f with the scene's W in a tick of the next step, after every ledger `before`, and hands back
// what it handed back.
let run: ((w: any) => unknown) | undefined
let got: unknown
const probe: Sim[string] = { tick(_me, _dt, w) { if (run) got = run(w); run = undefined } }
const inTick = <T>(truth: ReturnType<typeof boot>, f: (w: any) => T): T => {
  run = f
  truth.step(DT)
  return got as T
}

const scene = (guns: Record<string, unknown>[], ledger: Record<string, unknown> = {}): Scene => ({
  world: {
    loader: { assets: { patterns: { type: 'json', url, preload: true } } },
    volley2d: { patterns: 'patterns', bounds: [-50, -50, 350, 450], layer: 'bullets' },
  },
  prefabs: {
    volley2d: { next: 1, live: [], frame: [0, 0], ...ledger },
    gun: { step: 0, at: 0, pattern: 'one', from: [100, 100], dir: 0, side: 'foe', id: 0 },
    probe: {},
  },
  actors: [{ is: 'volley2d' }, ...guns.map(g => ({ is: 'gun', ...g })), { is: 'probe' }],
})

const sim: Sim = { volley2d, gun, probe }
const ledger = (truth: ReturnType<typeof boot>) => truth.rows.find(r => r.kind === 'volley2d')!.data
const live = (truth: ReturnType<typeof boot>): Entry[] => ledger(truth).live
const pts = (truth: ReturnType<typeof boot>, e: Entry) => points(shots(patterns, e.pattern), e, ledger(truth).frame)

// A bullet's place by a thousand small steps of its speed and heading, to hold the closed form to.
const stepped = (shot: { speed: number; accel: number; min: number; max: number; curve: number }, θ: number, s: number) => {
  let x = 0, y = 0, v = Math.min(shot.max, Math.max(shot.min, shot.speed)), h = θ
  const n = 20000, dt = s / n
  for (let i = 0; i < n; i++) {
    const vm = Math.min(shot.max, Math.max(shot.min, v + (shot.accel * dt) / 2)), hm = h + (shot.curve * dt) / 2
    x += vm * Math.cos(hm) * dt
    y += vm * Math.sin(hm) * dt
    v = Math.min(shot.max, Math.max(shot.min, v + shot.accel * dt))
    h += shot.curve * dt
  }
  return [x, y]
}

test('a volley is an entry on the ledger at age 0, its point in the frame, one dt older each step after', () => {
  const truth = boot(scene([{ dir: 0.3 }], { frame: [0, 40] }), sim)
  truth.step(DT)
  expect(live(truth)).toEqual([{ id: 1, pattern: 'one', side: 'foe', at: [100, 60], dir: 0.3, age: 0, gone: [], grazed: [] }])
  truth.step(DT)
  expect(live(truth)[0].age).toBeCloseTo(DT, 12)
})

test('a bullet flies its speed along the aim, and the frame carries it', () => {
  const truth = boot(scene([{ dir: Math.PI / 2 }]), sim)
  for (let n = 0; n < 31; n++) truth.step(DT)
  const e = live(truth)[0]
  const [p] = pts(truth, e)
  expect(p.pos[0]).toBeCloseTo(100, 9)
  expect(p.pos[1]).toBeCloseTo(100 + V * 30 * DT, 9)
  expect(p.heading).toBeCloseTo(Math.PI / 2, 12)
  truth.step(DT)
  const before = pts(truth, live(truth)[0])[0].pos
  truth.rows.find(r => r.kind === 'volley2d')!.data.frame = [7, -20]
  const after = pts(truth, live(truth)[0])[0].pos
  expect([after[0] - before[0], after[1] - before[1]]).toEqual([7, -20])
})

test('move sets the frame the bullets fly in', () => {
  const truth = boot(scene([]), sim)
  inTick(truth, w => move(w, [3, 4]))
  expect(ledger(truth).frame).toEqual([3, 4])
})

test('a ring is n bullets evenly round the turn from the aim, a fan n evenly across its spread about the aim', () => {
  const ring = shots(patterns, 'ring').map(s => s.angle)
  expect(ring).toHaveLength(8)
  ring.forEach((a, i) => expect(a).toBeCloseTo((2 * Math.PI * i) / 8, 12))
  expect(shots(patterns, 'fan').map(s => s.angle)).toEqual([-0.5, -0.25, 0, 0.25, 0.5])
})

test('bursts come every so often from after, each turned by turn, so many bursts make a spiral', () => {
  expect(shots(patterns, 'spiral').map(s => [s.t0, s.angle])).toEqual([[0.2, 0], [0.30000000000000004, 0.5], [0.4, 1], [0.5, 1.5]])
  const truth = boot(scene([{ pattern: 'spiral' }]), sim)
  for (let n = 0; n < 12; n++) truth.step(DT)
  expect(pts(truth, live(truth)[0])).toHaveLength(0)
  for (let n = 0; n < 16; n++) truth.step(DT)
  // age 27 steps, 0.45 s: the bursts at 0.2, 0.3 and 0.4 are in the air
  expect(pts(truth, live(truth)[0]).map(p => p.k)).toEqual([0, 1, 2])
})

test('accel speeds a bullet up to max and holds it, or slows it to min and holds it there', () => {
  const [fast] = shots(patterns, 'fast')
  // 10 → 60 takes 0.5 s, 17.5 on the way, then 60 a second
  expect(ahead(fast, { at: [0, 0], dir: 0, age: 0 } as Entry, [0, 0], 0.5)!.pos[0]).toBeCloseTo(17.5, 9)
  expect(ahead(fast, { at: [0, 0], dir: 0, age: 0 } as Entry, [0, 0], 1.5)!.pos[0]).toBeCloseTo(77.5, 9)
  const [stop] = shots(patterns, 'stop')
  expect(ahead(stop, { at: [0, 0], dir: 0, age: 0 } as Entry, [0, 0], 0.5)!.pos[0]).toBeCloseTo(15, 9)
  expect(ahead(stop, { at: [0, 0], dir: 0, age: 0 } as Entry, [0, 0], 3)!.pos[0]).toBeCloseTo(15, 9)
})

test('a curving, speeding bullet is where a thousand small steps of it put it', () => {
  const [arc] = shots(patterns, 'arc')
  for (const s of [0.3, 1, 2.5, 4]) {
    const at = ahead(arc, { at: [0, 0], dir: 0.7, age: 0 } as Entry, [0, 0], s)!
    const want = stepped(arc, 0.7, s)
    expect(Math.hypot(at.pos[0] - want[0], at.pos[1] - want[1])).toBeLessThan(1e-6)
    expect(at.heading).toBeCloseTo(0.7 + 1.3 * s, 12)
  }
})

test('a pattern built of a pattern fires it from at, turned by dir, after its after; one built of itself throws', () => {
  const both = shots(patterns, 'both')
  expect(both.map(s => [s.t0, s.from, s.angle])).toEqual([[0.5, [5, -3], 0.4], [0, [0, 0], Math.PI]])
  expect(() => shots(patterns, 'loop')).toThrow('volley2d pattern loop is built out of itself: loop > loop2 > loop')
  expect(() => shots(patterns, 'none')).toThrow('volley2d has no pattern none')
})

test('a bullet out of the bounds or past its life is gone, and the entry leaves once every bullet is', () => {
  const truth = boot(scene([{ from: [340, 100] }, { pattern: 'short', from: [10, 10] }]), sim)
  const seen = new Set<number>()
  for (let n = 0; n < 12; n++) {
    truth.step(DT)
    for (const e of live(truth)) seen.add(e.id)
  }
  // 10 px to the bound at 2 px a step: gone on the step it crosses; short lives 0.25 s
  expect(live(truth).map(e => e.pattern)).toEqual(['short'])
  for (let n = 0; n < 6; n++) truth.step(DT)
  expect(live(truth)).toEqual([])
  expect(seen).toEqual(new Set([1, 2]))
})

test('strike hits the targets a side\'s bullets meet and takes those bullets out; a near miss grazes once', () => {
  const truth = boot(scene([{ pattern: 'ring' }, { pattern: 'one', side: 'ship', from: [0, 0] }]), sim)
  for (let n = 0; n < 10; n++) truth.step(DT)
  const e = live(truth)[0]
  // the ring's bullet 4 heads along −x: fired in the first step's tick, 10 steps old in the probe's, at 100 − 20 = 80
  const hit = inTick(truth, w => strike(w, 'foe', [{ id: 9, pos: [80, 103.5], r: 1.5 }]))
  expect(hit.hits.map(h => [h.id, h.k, h.damage])).toEqual([[9, 4, 1]])
  expect(hit.hits[0].pos[0]).toBeCloseTo(80, 9)
  expect(hit.grazes).toEqual([])
  expect(e.gone).toEqual([4])
  // 11 steps old: bullet 3 heads down and left, at 100 − 22 cos(π/4), 100 + 22 sin(π/4)
  const [x3, y3] = [100 - 22 * Math.SQRT1_2, 100 + 22 * Math.SQRT1_2]
  const grazed = inTick(truth, w => strike(w, 'foe', [{ id: 9, pos: [x3, y3 + 12], r: 1.5, graze: 10 }]))
  expect(grazed.hits).toEqual([])
  expect(grazed.grazes.map(g => [g.id, g.k])).toEqual([[9, 3]])
  expect(inTick(truth, w => strike(w, 'foe', [{ id: 9, pos: [x3, y3 + 12], r: 1.5, graze: 10 }])).grazes).toEqual([])
  // the ship's bullet is not the foe's
  expect(inTick(truth, w => strike(w, 'foe', [{ id: 9, pos: [30, 0], r: 5 }])).hits).toEqual([])
})

test('clear takes every bullet of a side out of the air and hands back where each was', () => {
  const truth = boot(scene([{ pattern: 'ring' }, { pattern: 'one', side: 'ship', from: [0, 0] }]), sim)
  for (let n = 0; n < 3; n++) truth.step(DT)
  const where = inTick(truth, w => clear(w, 'foe'))
  expect(where).toHaveLength(8)
  expect(pts(truth, live(truth)[0])).toEqual([])
  expect(pts(truth, live(truth)[1])).toHaveLength(1)
  truth.step(DT)
  expect(live(truth).map(e => e.side)).toEqual(['ship'])
})

test('a field of the ledger volley2d does not know throws, naming it', () => {
  const truth = boot(scene([], { extra: 1 }), sim)
  expect(() => truth.step(DT)).toThrow('the volley2d prefab has extra, which volley2d does not know')
})
