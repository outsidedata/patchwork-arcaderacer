// Running a scene ahead of a server that owns the clock. The test writes its own game: a manager and
// one child, `track`, whose `world.predict` runs it ahead. A seat's `player` row spawns a `car` on its
// slot's `start`; the player's `steer` act sets the car's steer, and every step the car moves by it
// and rolls the die for a wobble, so a step taken with another die's state moves it elsewhere. A
// `sparker` spawns a `spark` every 7 steps, which ends itself 5 steps later, so every spawn takes the
// truth's next id and a copy that had the wrong one differs. The server runs on a clock the test
// moves and never waits for a page, the pages frame on it at 60 a second, and the wire between is the
// loopback with a network of the test's.
//
// One seat never needs a correction: over a slow, jittery wire that loses, holds back, doubles and
// reorders what it carries, every packet the server sends once it has taken the page's presses is the
// rows the page's copy had at that step. A page whose frames stop holds nobody else up. Two seats
// differ only where the other seat pressed.
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, seeded, type Scene, type Truth } from '#engine/engine.ts'
import { accept, link, load, manager, rewindOf, run, scene, type Diff, type Got, type Up } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback, type Net, type Time } from '#addons/loopback/loopback.addon.ts'
import { dial, serve as listen } from '#addons/socket/socket.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { possessed } from '#addons/player/player.addon.ts'
import { nearRows, predict } from './predict.addon.ts'

const DT = 1 / 60
const CUTOFF = 60

const top = (seats: number): Scene => ({
  prefabs: {
    engine: { dt: DT },
    scenemanager: { scenes: { track: { file: 'track.scene.json', suspend: true } }, dt: DT, entry: 'track', port: 0 },
  },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats,
})

const track = (seats: number, epsilon: number) => ({
  world: { seed: 7, predict: { epsilon, cutoff: CUTOFF, halflife: 60, snap: 100, below: 0.01 } },
  prefabs: {
    engine: { dt: DT, width: 320, height: 200 },
    scenemanager: { out: {} },
    player: { seat: 0, car: 0 },
    start: { slot: 0, x: 0 },
    car: { x: 0, steer: 0, wobble: 0 },
    sparker: { t: 0 },
    spark: { age: 0 },
  },
  actors: [{ is: 'scenemanager' }, { is: 'sparker' }, { is: 'start', slot: 0, x: 0 }, { is: 'start', slot: 1, x: 50 }],
  plugins: ['scenemanager', 'player'],
  seats,
})

const sim = `
import { scenemanager } from ${JSON.stringify(new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import file from './track.scene.json' with { type: 'json' }
export const sim = {
  scenemanager,
  start: {},
  player: {
    before(me, _dt, w) {
      if (me.data.car) return
      const s = w.find('start', r => r.data.slot === me.data.seat)
      me.data.car = w.spawn('car', { x: s.data.x }).id
    },
    acts: {
      steer(me, w, seat, x) {
        if (typeof x !== 'number' || !Number.isFinite(x)) return
        w.call(w.get(me.data.car), 'steer', seat, x)
      },
    },
  },
  car: {
    tick(me, dt, w) {
      me.data.wobble = w.die() - 0.5
      me.data.x += (me.data.steer * 10 + me.data.wobble) * dt
    },
    acts: { steer(me, _w, _seat, x) { me.data.steer = x } },
  },
  sparker: { tick(me, _dt, w) { if (++me.data.t % 7 === 0) w.spawn('spark') } },
  spark: { tick(me, _dt, w) { if (++me.data.age > 5) w.end(me) } },
}
export const scene = file
`

// One folder per game, each with its seat count and its scene's epsilon.
const dirs: string[] = []
const game = (seats: number, epsilon: number) => {
  const dir = mkdtempSync(join(tmpdir(), `predict-${seats}-`))
  dirs.push(dir)
  writeFileSync(join(dir, 'track.scene.json'), JSON.stringify(track(seats, epsilon)))
  writeFileSync(join(dir, 'track.sim.ts'), sim)
  return pathToFileURL(dir + '/').href
}
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true }) })

// The player plugin's browser half listens on the page.
beforeAll(() => {
  vi.stubGlobal('addEventListener', () => {})
  vi.stubGlobal('removeEventListener', () => {})
})

// A clock the test moves: every callback falls due at its millisecond, in the order it was asked for,
// a millisecond on at the soonest, as node's `setTimeout` has it.
function clock() {
  let now = 0
  let queue: { at: number; i: number; f: () => void }[] = []
  let i = 0
  const time: Time = { now: () => now, after: (ms, f) => { queue.push({ at: now + Math.max(1, ms), i: i++, f }) } }
  const to = (t: number) => {
    for (;;) {
      const due = queue.filter(q => q.at <= t).sort((a, b) => a.at - b.at || a.i - b.i)[0]
      if (!due) break
      queue = queue.filter(q => q !== due)
      now = due.at
      due.f()
    }
    now = t
  }
  return { time, to, get now() { return now } }
}

type Page = ReturnType<typeof predict>

// The server, booted and loaded, stepped on the test's clock; and a page on a timed loopback.
async function serve(seats: number, epsilon = 0) {
  const base = game(seats, epsilon)
  const file = top(seats)
  const truth = boot(structuredClone(file), { scenemanager })
  await load(truth, base)
  const c = clock()
  vi.spyOn(performance, 'now').mockImplementation(() => c.now)
  const stop = run(truth, c.time)
  const open = (net: Net): Page => predict(link(loopback(accept(manager(truth)), c.time, net)), file, base, () => {})
  return { truth, c, open, stop, child: (): Truth => scene(manager(truth), 'track') }
}

// Frames at 60 a second for `ms`, the pages' input before each, `press` asked on each frame, and a
// page whose frames `stalled` says have stopped framing nothing.
async function play(c: ReturnType<typeof clock>, pages: Page[], ms: number, press?: (frame: number) => void, stalled?: (page: number, t: number) => boolean) {
  const frames = Math.round(ms / (1000 / 60))
  for (let f = 0; f < frames; f++) {
    c.to(c.now + 1000 / 60)
    press?.(f)
    for (const [i, p] of pages.entries()) {
      if (stalled?.(i, c.now)) continue
      p.input()
      await p.frame(c.now)
    }
  }
}

// A press of the seat's car's steer, sent as the player plugin sends a press: at the seat's `player` row.
const steer = (p: Page, x: number) => {
  const wire = p.client!.plugins.wire
  wire.send(possessed(wire.rows)!.id, 'steer', x)
}

const bad: Net = {
  up: { delay: 90, jitter: 60, tail: true, loss: 0.15, reorder: 0.2, dup: 0.05, burst: 0.1 },
  down: { delay: 110, jitter: 40, loss: 0.1, reorder: 0.2, dup: 0.05, burst: 0.1 },
  seed: 3,
}

// What the view drew last: the rows of the packet the page's client took, and its step.
const drawn = (p: Page) => p.client!.plugins.wire as unknown as { rows: { id: number; kind: string; data: Record<string, number> }[]; n: number }
const slow: Net = { up: { delay: 150 }, down: { delay: 150 }, seed: 4 }

// The press steers the seat's car, a row of its own that the `player` row spawned, not the `player`
// row: the car the page draws turns on the frame after the key, 150 ms before the press reaches the
// server.
test('a row the seat\'s press moves, other than its player row, is drawn moved on the frame after the key', async () => {
  const s = await serve(1)
  const page = s.open(slow)
  await play(s.c, [page], 2000)
  expect(page.stats.predicting).toBe(true)
  steer(page, 2)
  await play(s.c, [page], 1000 / 60)
  expect(drawn(page).rows.find(r => r.kind === 'car')!.data.steer).toBe(2)
  expect(s.child().rows.find(r => r.kind === 'car')!.data.steer).toBe(0)
  page.close()
  s.stop.stop()
  vi.restoreAllMocks()
})

// The sparker counts every step and spawns a spark every 7th. Drawn from the server's packets, it
// would stand a down leg behind the step the view draws; drawn from the copy it stands on that step,
// and each spark is drawn on the step the copy made it.
test('every row is drawn as the copy has it on the step drawn, the rows no press touches and the rows they spawn too', async () => {
  const s = await serve(1)
  const page = s.open(slow)
  await play(s.c, [page], 2000)
  expect(page.stats.predicting).toBe(true)
  const server = s.child()
  const lead = server.n - server.rows.find(r => r.kind === 'sparker')!.data.t
  for (let f = 0; f < 60; f++) {
    await play(s.c, [page], 1000 / 60)
    const { rows, n } = drawn(page)
    const t = rows.find(r => r.kind === 'sparker')!.data.t
    expect(t).toBe(n - lead)
    const sparks = rows.filter(r => r.kind === 'spark').map(r => r.data.age).sort((a, b) => a - b)
    // A spark spawned on the sparker's count `c` (a multiple of 7) is `t - c` steps old, and ends past 5.
    const want = [0, 1, 2, 3, 4, 5].filter(age => (t - age) % 7 === 0 && t - age > 0)
    expect(sparks).toEqual(want)
  }
  page.close()
  s.stop.stop()
  vi.restoreAllMocks()
})

// The second seat's presses reach the first page's copy late, and the copy goes back for each: its car
// jumps, and the jump is eased. The car's `steer`, the sparker's count, a spark's age and the player
// row's `car` are whole numbers, which have no place between: each is drawn whole on every frame.
test('a jump is eased, and a number whole on both sides of it is drawn where it is', async () => {
  const s = await serve(2)
  const a = s.open(slow), b = s.open({ ...slow, seed: 5 })
  const die = seeded(4)
  let fractions = 0
  await play(s.c, [a, b], 1000 / 60 * 600, f => {
    if (b.stats.predicting && f % 11 === 0) steer(b, Math.round(die() * 4) - 2)
    if (!a.stats.predicting) return
    for (const r of drawn(a).rows) {
      const whole = r.kind === 'car' ? [r.data.steer] : r.kind === 'sparker' ? [r.data.t] : r.kind === 'spark' ? [r.data.age] : r.kind === 'player' ? [r.data.car, r.data.seat] : []
      fractions += whole.filter(v => !Number.isInteger(v)).length
    }
  })
  expect(a.stats.back).toBeGreaterThan(0)
  expect(a.stats.taken).toBeGreaterThan(10)
  expect(fractions).toBe(0)
  a.close()
  b.close()
  s.stop.stop()
  vi.restoreAllMocks()
})

test('numbers within epsilon are the same rows, past it they differ', () => {
  const a = [{ id: 1, kind: 'car', data: { pos: [-40.16428957426367, 0], look: { yaw: 1 } } }]
  const b = [{ id: 1, kind: 'car', data: { pos: [-40.16428957426366, 0], look: { yaw: 1 } } }]
  expect(nearRows(a, b, 1e-6)).toBe(true)
  expect(nearRows(a, b, 0)).toBe(false)
  expect(nearRows(a, [{ id: 1, kind: 'car', data: { pos: [-40.1, 0], look: { yaw: 1 } } }], 1e-6)).toBe(false)
})

// A number of a row no rule moves, a hair apart on the server, as a browser and node round the same
// maths a last bit apart: every packet after it drifts, the page keeps the last one with the row and
// how far apart it stood, and nothing is corrected.
test('a number a hair apart from the server\'s is a drift, kept with its row and its gap, never a correction', async () => {
  const s = await serve(1, 1e-6)
  const page = s.open({ up: { delay: 20 }, down: { delay: 20 }, seed: 1 })
  await play(s.c, [page], 2000)
  expect(page.stats.predicting).toBe(true)
  expect(page.stats.drifts).toBe(0)
  expect(page.stats.drifted).toBeUndefined()
  const start = s.child().rows.find(r => r.kind === 'start' && r.data.slot === 1)!
  start.data.x += 1e-9
  const nudged = s.child().n
  // The packets the server made before the nudge are on the wire for its 20 ms, and match.
  await play(s.c, [page], 100)
  const checked = page.stats.checked, drifts = page.stats.drifts
  expect(drifts).toBeGreaterThan(0)
  await play(s.c, [page], 2000)
  expect(page.stats.corrections).toBe(0)
  expect(page.stats.drifts - drifts).toBeGreaterThan(100)
  expect(page.stats.drifts - drifts).toBe(page.stats.checked - checked)
  const drifted = page.stats.drifted!
  expect(drifted.n).toBeGreaterThan(nudged)
  expect(drifted.rows).toEqual([{ id: start.id, kind: 'start', mine: { slot: 1, x: 50 }, theirs: { slot: 1, x: start.data.x } }])
  expect(drifted.by).toBe(start.data.x - 50)
  expect(drifted.by).toBeCloseTo(1e-9, 13)
  expect(page.stats.loads).toHaveLength(1)
  page.close()
  s.stop.stop()
  vi.restoreAllMocks()
})

// Bursts of presses: a press every 9th frame for the first second of every two, so the server has
// taken every press in the second between and the page holds those packets against its copy.
const bursts = (f: number) => f % 120 < 60 && f % 9 === 0

test('one seat over a bad wire: every packet that took the page\'s presses is what the page ran, and nothing is corrected', async () => {
  const s = await serve(1)
  const page = s.open(bad)
  const die = seeded(11)
  await play(s.c, [page], 20_000, f => { if (page.stats.predicting && bursts(f)) steer(page, [-2, -1, 1, 2][Math.floor(die() * 4)]) })
  expect(page.stats.predicting).toBe(true)
  expect(page.stats.corrections).toBe(0)
  expect(page.stats.drifts).toBe(0)
  expect(page.stats.checked).toBeGreaterThan(300)
  expect(page.stats.loads).toHaveLength(1)
  // The server took the page's presses late and went back to put each on its step, running no step
  // again: it stands behind its clock by every step it went back, which is never more than the cutoff.
  const child = s.child()
  const server = rewindOf(child)!
  expect(server.back).toBeGreaterThan(0)
  expect(server.clock - child.n).toBe(server.back)
  expect(server.back).toBeLessThanOrEqual(CUTOFF)
  expect(server.missed).toBe(0)
  expect(child.rows.find(r => r.kind === 'car')!.data.steer).not.toBe(0)
  expect(child.n).toBeGreaterThan(1000)
  page.close()
  s.stop.stop()
  vi.restoreAllMocks()
})

test('one seat whose frames stop for two seconds: the server runs on without it, and the page starts over from the whole truth, never corrected', async () => {
  const s = await serve(1)
  const page = s.open({ up: { delay: 50, jitter: 20 }, down: { delay: 50, jitter: 20 }, seed: 5 })
  const die = seeded(4)
  const start = s.c.now
  let n0 = 0, n1 = 0
  await play(s.c, [page], 10_000, f => {
    if (page.stats.predicting && bursts(f)) steer(page, Math.round(die() * 4) - 2)
    const t = s.c.now - start
    if (Math.abs(t - 4000) < 9) n0 = s.child().n
    if (Math.abs(t - 6000) < 9) n1 = s.child().n
  }, (_i, t) => t - start > 4000 && t - start < 6000)
  // The server stepped the whole two seconds.
  expect(n1 - n0).toBeGreaterThanOrEqual(119)
  expect({ corrections: page.stats.corrections, first: page.stats.first }).toEqual({ corrections: 0, first: undefined })
  expect(page.stats.loads).toHaveLength(2)
  expect(page.stats.checked).toBeGreaterThan(200)
  page.close()
  s.stop.stop()
  vi.restoreAllMocks()
})

test('two seats over a bad wire, both pressing: each page takes the other\'s presses from the journal on their steps, and neither is corrected', async () => {
  const s = await serve(2)
  const a = s.open(bad), b = s.open({ ...bad, seed: 10 })
  const die = seeded(2)
  // Every press that reached the server more than the cutoff after the step it was stamped for, by the
  // server's clock: the wire's losses and bursts hold some back that long, and only those may be
  // answered late.
  const server = rewindOf(s.child())!
  const take = server.take
  let past = 0
  server.take = (seat, msg) => { if (server.clock - msg.n > CUTOFF) past++; take(seat, msg) }
  await play(s.c, [a, b], 20_000, f => {
    if (a.stats.predicting && bursts(f)) steer(a, Math.round(die() * 4) - 2)
    if (b.stats.predicting && bursts(f + 60)) steer(b, Math.round(die() * 4) - 2)
  })
  expect(server.missed).toBe(past)
  for (const p of [a, b]) {
    expect({ corrections: p.stats.corrections, first: p.stats.first, loads: p.stats.loads, missed: p.stats.missed })
      .toEqual({ corrections: 0, first: undefined, loads: [p.stats.loads[0]], missed: 0 })
    expect(p.stats.drifts).toBe(0)
    expect(p.stats.taken).toBeGreaterThan(50)
    // Each page's copy went back for the other seat's presses, and ran every step again at once.
    expect(p.stats.back).toBeGreaterThan(0)
    expect(p.stats.checked).toBeGreaterThan(100)
  }
  // The server went back for late presses, and stands behind its clock by exactly that, within the
  // cutoff.
  expect(server.back).toBeGreaterThan(0)
  expect(server.clock - s.child().n).toBe(server.back)
  expect(server.back).toBeLessThanOrEqual(CUTOFF)
  a.close()
  b.close()
  s.stop.stop()
  vi.restoreAllMocks()
})

// Known bug, open: over this wire the first page's copy goes back for the second seat's join (44 steps
// in all, no other seat's press taken) and from step 141 its own car is 4 steps of steer off the
// server's: 32 corrections and a second load. The server's side is right (the rewind test of a late
// press crossing a join made through `change`); over a clean wire the page goes back 6 steps for the
// join and is never corrected. This passes while the bug is there and fails once it is fixed.
test.fails('a second seat joining while the first\'s presses arrive late: neither page is corrected', async () => {
  const s = await serve(2)
  // A wire whose up leg has a long tail: now and then a press reaches the server later than any
  // before it, and the server goes back further.
  const slow: Net = { up: { delay: 90, jitter: 120, tail: true }, down: { delay: 60, jitter: 10 }, seed: 8 }
  const a = s.open(slow)
  const die = seeded(9)
  // The first seat presses every 9th frame throughout.
  const pressing = (f: number) => { if (a.stats.predicting && f % 9 === 0) steer(a, Math.round(die() * 4) - 2) }
  await play(s.c, [a], 2000, pressing)
  const b = s.open({ up: { delay: 40 }, down: { delay: 40 }, seed: 11 })
  await play(s.c, [a, b], 6000, f => pressing(f + 1))
  const server = rewindOf(s.child())!
  expect(server.back).toBeGreaterThan(0)
  for (const p of [a, b]) {
    expect(p.stats.predicting).toBe(true)
    expect({ corrections: p.stats.corrections, first: p.stats.first, loads: p.stats.loads.length }).toEqual({ corrections: 0, first: undefined, loads: 1 })
    expect(p.stats.checked).toBeGreaterThan(100)
  }
  expect(b.stats.taken).toBeGreaterThan(0)
  a.close()
  b.close()
  s.stop.stop()
  vi.restoreAllMocks()
})

test('two seats, one whose frames stop: the other plays on, the scene never waits, and nothing of the stalled page corrects it', async () => {
  const s = await serve(2)
  const net: Net = { up: { delay: 40, jitter: 10 }, down: { delay: 40, jitter: 10 }, seed: 12 }
  const a = s.open(net), b = s.open({ ...net, seed: 13 })
  const die = seeded(6)
  const start = s.c.now
  const seen: number[] = []
  // Both press; b's frames stop from 2s to 7s.
  await play(s.c, [a, b], 9000, f => {
    if (a.stats.predicting && bursts(f)) steer(a, Math.round(die() * 4) - 2)
    if (b.stats.predicting && bursts(f + 60)) steer(b, Math.round(die() * 4) - 2)
    if (f % 60 === 0) seen.push(a.stats.n)
  }, (i, t) => i === 1 && t - start > 2000 && t - start < 7000)
  // a's copy moved on a second's worth of steps every second, the stalled seconds too.
  for (let i = 3; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeGreaterThanOrEqual(59)
  expect(a.stats.corrections).toBe(0)
  expect(a.stats.checked).toBeGreaterThan(100)
  // b came back behind by more than the cutoff and started over from the whole truth, uncorrected.
  expect(b.stats.corrections).toBe(0)
  expect(b.stats.loads).toHaveLength(2)
  a.close()
  b.close()
  s.stop.stop()
  vi.restoreAllMocks()
})

// A Box3D world over a real socket, on the machine's clock: a stack of crates the seat's press knocks
// about. The page joins, is sent the server's truth and Box3D's whole world beside it as Box3D's own
// bytes, loads them into its copy and runs ahead; every packet it checks is what its copy ran, to the
// bit (an epsilon of 0). With the world taken out of what reaches it, the page is corrected.
const yard = {
  world: {
    seed: 3,
    predict: { epsilon: 0, cutoff: CUTOFF, halflife: 60, snap: 100, below: 0.01 },
    box3d: {
      gravity: [0, -10, 0], subStepCount: 4, enableSleep: true,
      static: [{ pos: [0, -1, 0], rot: [0, 0, 0, 1], shapes: [{ box: [20, 1, 20], density: 0, baseMaterial: { friction: 0.6, restitution: 0, rollingResistance: 0 } }] }],
      kinds: { crate: { type: 'dynamic', linearDamping: 0, angularDamping: 0, gravityScale: 1, sleepThreshold: 0.05, isBullet: false, shapes: [{ box: [0.5, 0.5, 0.5], density: 1000, baseMaterial: { friction: 0.6, restitution: 0, rollingResistance: 0 } }] } },
    },
  },
  prefabs: {
    engine: { dt: DT, width: 320, height: 200 },
    scenemanager: { out: {} },
    player: { seat: 0 },
    box3d: {},
    crate: { pos: [0, 0.5, 0], rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], awake: true },
  },
  actors: [{ is: 'scenemanager' }, { is: 'box3d' }, ...[0, 1, 2, 3, 4, 5].map(i => ({ is: 'crate', pos: [i % 2 ? 0.05 : -0.05, 0.6 + i * 1.05, 0] }))],
  plugins: ['scenemanager', 'player'],
  seats: 1,
}
const yardSim = `
import { scenemanager } from ${JSON.stringify(new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import { box3d } from ${JSON.stringify(new URL('../../plugins/box3d/box3d.sim.ts', import.meta.url).pathname)}
import file from './yard.scene.json' with { type: 'json' }
export const sim = {
  scenemanager,
  box3d,
  crate: {},
  player: {
    acts: {
      push(me, w, _seat, i, x) {
        if (typeof x !== 'number' || !Number.isFinite(x)) return
        const crate = w.all('crate')[i]
        if (crate) crate.data.vel = [x, 2, 0]
      },
    },
  },
}
export const scene = file
`

test('a Box3D world crosses a real socket as its bytes, and the page that loads it runs ahead uncorrected', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'predict-box3d-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
  writeFileSync(join(dir, 'yard.sim.ts'), yardSim)
  const base = pathToFileURL(dir + '/').href
  const file: Scene = { ...top(1), prefabs: { ...top(1).prefabs, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } } }
  // A server, and a page that joins it and plays six seconds; `keep` false takes the world out of
  // what reaches the page, which then loads the rows alone.
  const joined = async (keep: boolean) => {
    const truth = boot(structuredClone(file), { scenemanager })
    await load(truth, base)
    const ticking = run(truth)
    const server = await listen(0, accept(manager(truth)))
    // The page is sent the oldest save the server keeps, a cutoff (a second) behind its clock, so two
    // seconds in it is a world Box3D has stepped for a second.
    await new Promise(r => setTimeout(r, 2000))
    const images: unknown[] = []
    const wire = dial<Up | Got, Diff>(`ws://localhost:${server.port}`)
    const page = predict(link(fan => wire(d => {
      for (const m of Object.values(d.held ?? {})) images.push((m as { image?: unknown }).image)
      fan(keep ? d : { ...d, held: {} })
    })), file, base, () => {})
    const die = seeded(9)
    const end = performance.now() + 6000
    for (let f = 0; performance.now() < end; f++) {
      await new Promise(r => setTimeout(r, 1000 / 60))
      if (page.stats.predicting && f % 20 === 0) page.client!.plugins.wire.send(possessed(page.client!.plugins.wire.rows)!.id, 'push', Math.floor(die() * 6), die() * 6 - 3)
      page.input()
      await page.frame(performance.now())
    }
    const stats = page.stats
    page.close()
    ticking.stop()
    await server.close()
    return { images, stats }
  }

  const kept = await joined(true)
  expect(kept.images.length).toBeGreaterThan(0)
  for (const image of kept.images) expect(image).toBeInstanceOf(Uint8Array)
  expect(kept.stats.predicting).toBe(true)
  expect(kept.stats.loads).toHaveLength(1)
  expect(kept.stats.loads[0]).toBeGreaterThan(30)
  expect(kept.stats.checked).toBeGreaterThan(200)
  expect({ corrections: kept.stats.corrections, first: kept.stats.first }).toEqual({ corrections: 0, first: undefined })

  const rowsAlone = await joined(false)
  expect(rowsAlone.stats.corrections).toBeGreaterThan(0)
}, 40_000)
