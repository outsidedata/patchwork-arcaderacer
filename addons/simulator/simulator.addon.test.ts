// The driver, on a scene of its own, written here into a folder as a game's is: a manager, and one
// child, `track`, whose seats each own a `mover` that goes one unit along x a step and `v` more, `v`
// the last `move` its seat pressed. A page draws the packets as they come, so `n`, the step of the
// packet a frame drew, says how many steps each frame moved. The seat's actor binds `a` and `d` to
// `move` and exports `eye()`, a camera held 5 units behind its mover as drawn. The manager is written
// too, as `lane.scene.json` and its sim, for the command line.
//
// Where a test states how many steps each frame moved, it fixes the timing that decides it: a server
// whose timer fires on the very millisecond owed (`grain: 0`), so step k is sent at k steps' time,
// and a display whose vsyncs stand 8 ms past each frame's time (`phase: 8`). A packet that crosses in
// a fixed 20 ms then arrives 3⅓ ms past each step's time, 4⅔ ms before a vsync, so no vsync falls on
// an arrival.
import { afterAll, expect, onTestFinished, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { histogram, packets, parse, real, report, running, simulate, standoff, summary, tap, timing, type FrameRecord, type Page, type Record_, type Run, type StepRecord } from './simulator.addon.ts'

const DT = 1 / 60
const dir = mkdtempSync(join(tmpdir(), 'simulator-'))
afterAll(() => rmSync(dir, { recursive: true }))
const write = (name: string, text: string) => { mkdirSync(join(dir, name, '..'), { recursive: true }); writeFileSync(join(dir, name), text) }

const track: Scene = {
  world: {},
  plugins: ['scenemanager', 'player'],
  seats: 2,
  prefabs: { engine: { dt: DT, width: 10, height: 10 }, scenemanager: { out: {} }, player: { seat: 0, mover: 0 }, mover: { seat: 0, pos: [0, 0, 0], v: 0 } },
  actors: [{ is: 'scenemanager' }],
}
write('track.scene.json', JSON.stringify(track))
write('track.sim.ts', `import { scenemanager } from ${JSON.stringify(new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import { player } from './player.sim.ts'
import { mover } from './mover.sim.ts'
import file from './track.scene.json' with { type: 'json' }
export const sim = { scenemanager, player, mover }
export const scene = file
`)
write('player.sim.ts', `export const player = {
  before(me, _dt, w) { if (!me.data.mover) me.data.mover = w.spawn('mover', { seat: me.data.seat }).id },
  acts: { move(me, w, _seat, v) { w.get(me.data.mover).data.v = v } },
}
`)
write('mover.sim.ts', `export const mover = { tick(me) { me.data.pos[0] += 1 + me.data.v } }
`)
write('player.client.ts', `let plugins, row
export function setup(r, p) {
  row = r
  plugins = p
  p.player.bind({ axis: [{ keys: ['a', 'd'], send: v => ['move', v] }] })
}
export function tick(r) { row = r }
export function remove() {}
export function eye() {
  const mine = plugins?.wire.rows.find(m => m.id === row?.data.mover)
  if (!mine) return undefined
  return { pos: [mine.data.pos[0] - 5, 0, 0], dir: [1, 0, 0], target: [mine.data.pos[0], 0, 0] }
}
`)
const top: Scene = {
  world: {},
  plugins: ['scenemanager'],
  seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { track: { file: 'track.scene.json', suspend: false } }, dt: DT, entry: 'track', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}
write('lane.scene.json', JSON.stringify(top))
write('lane.sim.ts', `import { scenemanager } from ${JSON.stringify(new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
export const sim = { scenemanager }
`)
const base = pathToFileURL(dir + '/').href

const page = (more: Partial<Page> = {}): Page => ({ display: { hz: 60 }, up: { delay: 20 }, down: { delay: 20 }, ...more })
const sim = (more: Partial<Run> = {}) => simulate({ file: top, sim: { scenemanager }, base, seed: 1, ms: 3000, pages: [page()], watch: { kinds: ['mover'], fields: ['pos', 'v'], own: 'mover' }, ...more })
const frames = (records: Record_[], p = 0) => records.filter((r): r is FrameRecord => r.type === 'frame' && r.page === p)
const steps = (records: Record_[]) => records.filter((r): r is StepRecord => r.type === 'step')
// A page's frames that drew a packet, and how many steps each frame moved after the first of them.
const drawing = (fs: FrameRecord[]) => fs.filter(f => f.n !== null)
const moved = (fs: FrameRecord[]) => drawing(fs).map(f => f.n!).map((s, i, a) => (i ? s - a[i - 1] : 0)).slice(1)
// The d key pressed and let go every 100 ms from 0.5 s to 2.5 s: an axis message each time, 40 in all.
const tapping = Array.from({ length: 20 }, (_, i) => [{ at: 500 + i * 100, key: 'd' }, { at: 550 + i * 100, key: 'd', up: true }]).flat()
// The timing that fixes how many steps each frame moves (the header).
const exact = { server: { grain: 0 } }
const vsynced = (hz: number) => page({ display: { hz, phase: 8 } })

test('a run writes its knobs first, then every frame and step as they happen, then each packet and message', async () => {
  const lines: string[] = []
  const records = await sim({ write: l => lines.push(l), pages: [page({ presses: tapping })] })
  expect(lines).toEqual(records.map(r => JSON.stringify(r)))
  expect(records[0]).toMatchObject({ type: 'run', mode: 'sim', seed: 1, ms: 3000 })
  const types = records.map(r => r.type)
  expect(types.lastIndexOf('frame')).toBeLessThan(types.indexOf('packet'))
  expect(types.lastIndexOf('packet')).toBeLessThan(types.indexOf('message'))
  expect(steps(records).length).toBeGreaterThanOrEqual(179)
  expect(steps(records).length).toBeLessThanOrEqual(180)
  expect(frames(records).length).toBeGreaterThanOrEqual(179)
})

test('a page on a 60 Hz display, its packets a fixed time behind a server keeping exact time, draws one step every frame', async () => {
  const fs = frames(await sim({ ...exact, pages: [vsynced(60)] }))
  expect(new Set(moved(fs))).toEqual(new Set([1]))
  expect(moved(fs).length).toBeGreaterThan(170)
})

test('the same seed is the same bytes, and another seed another run', async () => {
  const knobs = { pages: [page({ up: { delay: 40, jitter: 20, tail: true, dup: 0.05 }, down: { delay: 30, jitter: 25, burst: 0.2 }, display: { hz: 60, wobble: 3, drop: 0.05 } })], server: { late: 1.5, pause: { every: 0.5, ms: 30 } } }
  const bytes = async (seed: number) => (await sim({ seed, ...knobs })).map(r => JSON.stringify(r)).join('\n')
  const a = await bytes(7)
  expect(await bytes(7)).toBe(a)
  expect(await bytes(8)).not.toBe(a)
})

test('a press between frames reaches the server as the key\'s message, and each is written down', async () => {
  const records = await sim({ pages: [page({ presses: [{ at: 1000, key: 'KeyD' }, { at: 1500, key: 'KeyD', up: true }, { at: 2000, act: ['move', 3] }] })] })
  expect(records.filter(r => r.type === 'press')).toEqual([
    { type: 'press', page: 0, t: 1000, key: 'KeyD', taken: true },
    { type: 'press', page: 0, t: 1500, key: 'KeyD', up: true, taken: true },
    { type: 'press', page: 0, t: 2000, act: ['move', 3], taken: true },
  ])
  expect(steps(records).flatMap(s => s.applied).filter(a => a.action === 'move').map(a => a.page)).toEqual([0, 0, 0])
  const x = (t: number) => steps(records).find(s => s.t >= t)!.rows!.track
  const v = (t: number) => Object.values(x(t))[0].v
  expect([v(900), v(1300), v(1800), v(2500)]).toEqual([0, 1, 0, 3])
})

test('a press before the page has a client is written down as not taken', async () => {
  const records = await sim({ pages: [page({ presses: [{ at: 1, act: ['move', 1] }] })] })
  expect(records.find(r => r.type === 'press')).toMatchObject({ taken: false })
})

// A frame of either display is shorter than a step, so it takes one packet or none.
test('a 120 Hz display draws a step every other frame, and a 144 Hz one never two steps in a frame', async () => {
  const at120 = moved(frames(await sim({ ...exact, pages: [vsynced(120)] })))
  expect(new Set(at120)).toEqual(new Set([0, 1]))
  expect(at120.filter(m => m === 1).length / at120.length).toBeCloseTo(0.5, 1)
  const at144 = moved(frames(await sim({ ...exact, pages: [vsynced(144)] })))
  expect(new Set(at144)).toEqual(new Set([0, 1]))
})

test('a hidden span draws no frames, a stall holds the first frame, and a dropped vsync draws nothing', async () => {
  const hid = frames(await sim({ pages: [page({ display: { hz: 60, hidden: [[1000, 2000]] } })] }))
  expect(hid.filter(f => f.t >= 1000 && f.t < 2000)).toEqual([])
  expect(hid.some(f => f.t >= 2000 && f.t < 2020)).toBe(true)
  const stalled = frames(await sim({ pages: [page({ join: 100, display: { hz: 60, stall: 400 } })] }))
  expect(stalled[0].t).toBeGreaterThanOrEqual(500)
  expect(stalled[0].t).toBeLessThan(500 + 1000 / 60)
  const dropped = frames(await sim({ pages: [page({ display: { hz: 60, drop: 0.5 } })] }))
  expect(dropped.length).toBeLessThan(120)
  expect(dropped.length).toBeGreaterThan(60)
})

test('a long frame draws nothing on the vsyncs it covers, and wobble moves a frame off its vsync', async () => {
  const long = frames(await sim({ pages: [page({ display: { hz: 60, long: { every: 0.5, ms: 100 } } })] }))
  const gaps = long.map((f, i) => (i ? f.t - long[i - 1].t : 0)).slice(1)
  expect(Math.max(...gaps)).toBeGreaterThanOrEqual(100)
  const even = frames(await sim())
  const wobbly = frames(await sim({ pages: [page({ display: { hz: 60, wobble: 4 } })] }))
  const off = (fs: FrameRecord[]) => new Set(fs.map((f, i) => (i ? Math.round((f.t - fs[i - 1].t) * 10) : 0)).slice(1)).size
  expect(off(even)).toBeLessThanOrEqual(2)
  expect(off(wobbly)).toBeGreaterThan(10)
})

test('a display\'s phase puts its vsyncs that far past each frame\'s time, and a server grain of 0 steps on the very millisecond owed', async () => {
  const records = await sim({ ms: 1000, server: { grain: 0 }, pages: [page({ display: { hz: 60, phase: 8 } })] })
  frames(records).forEach((f, k) => expect(f.t).toBeCloseTo(8 + k * 1000 / 60, 9))
  steps(records).forEach((st, k) => expect(st.t).toBeCloseTo((k + 1) * 1000 / 60, 5))
})

test('each page\'s clock is its offset and its drift from the timeline\'s', async () => {
  const fs = frames(await sim({ pages: [page({ clock: { offset: 5000, ppm: 200 } })] }))
  for (const f of fs) expect(f.clock).toBeCloseTo(5000 + f.t * (1 + 200e-6), 6)
})

// The server's timer fires on whole milliseconds, so no packet is sent at the turn's 1000.5.
test('a turn is called at its millisecond of the timeline: a leg turned there carries what is sent after it its new way', async () => {
  const down = { delay: 20 }
  const records = await sim({ ms: 2000, pages: [page({ down })], turns: [{ at: 1000.5, turn: () => { down.delay = 60 } }] })
  const sent = records.filter(r => r.type === 'packet')
  expect(sent.some(p => p.sent < 1000.5) && sent.some(p => p.sent > 1000.5)).toBe(true)
  // Every packet sent more than 60 ms before the end arrived, once.
  for (const p of sent.filter(p => p.sent < 2000 - 60)) expect(p.at.map(at => at - p.sent)).toEqual([expect.closeTo(p.sent < 1000.5 ? 20 : 60, 9)])
})

test('a server that pauses runs no step inside a pause and makes up the steps it owes as it ends', async () => {
  const records = await sim({ server: { pause: { every: 0.4, ms: 80 } } })
  const ts = steps(records).map(s => s.t)
  const gaps = ts.map((t, i) => (i ? t - ts[i - 1] : 0)).slice(1)
  expect(Math.max(...gaps)).toBeGreaterThanOrEqual(80)
  expect(ts.filter((t, i) => i > 0 && t === ts[i - 1]).length).toBeGreaterThan(8)
  // After the last step at each millisecond the server is where its clock says, a step at most short.
  const last = steps(records).filter((s, i, a) => a[i + 1]?.t !== s.t)
  for (const s of last) expect(Math.floor(s.t / (DT * 1000)) - s.n).toBeLessThanOrEqual(1)
})

// Node truncates the interval to 16 ms and each firing comes a millisecond late on the mean: 17 ms a
// step, the 58.76 steps a second a real one measured. Fewer packets come than the display draws
// frames, so the frames that take none outnumber those that take two by the steps lost.
test('the setInterval server loses steps: it falls behind the scene\'s rate, and the page holds a frame each time', async () => {
  const records = await sim({ ms: 10_000, server: { loop: 'interval', late: 1 } })
  const rate = steps(records).length / 10
  expect(rate).toBeLessThan(59.5)
  expect(rate).toBeGreaterThan(58)
  expect(moved(frames(records)).filter(m => m === 0).length).toBeGreaterThan(5)
})

test('every frame records the camera of the actor that exports eye(), and each packet and message what became of it', async () => {
  const records = await sim({ pages: [page({ up: { delay: 20, loss: 0.2, dup: 0.2 }, down: { delay: 20, loss: 0.2, dup: 0.2 }, presses: tapping })] })
  const f = drawing(frames(records))[10]
  const x = (f.rows[f.own!].pos as number[])[0]
  expect(f.eye).toEqual({ pos: [x - 5, 0, 0], dir: [1, 0, 0], target: [x, 0, 0] })
  const packets = records.filter(r => r.type === 'packet')
  expect(packets.some(p => p.at.length === 0)).toBe(true)
  expect(packets.some(p => p.at.length === 2)).toBe(true)
  for (const p of packets) for (const at of p.at) expect(at - p.sent).toBeCloseTo(20, 9)
  const messages = records.filter(r => r.type === 'message')
  expect(messages.some(m => m.at.length === 0)).toBe(true)
  expect(messages.some(m => m.at.length === 2)).toBe(true)
})

// Where no actor exports eye(), the camera is the first of the scene's plugins' that does: `ring`, a
// child written into a folder of its own with a manager of its own, draws through render3d's camera,
// which chasecamera3d holds on the seat's mover, `lift` over it and `dist` behind it at its look. The
// player plugin, which sends a message for any name it has not got, is asked for none.
test('where no actor exports eye(), a frame records the camera of the first plugin that does, and the player plugin sends no eye', async () => {
  const ring: Scene = {
    world: {},
    plugins: ['scenemanager', 'player', 'render3d', 'chasecamera3d'],
    seats: 1,
    prefabs: {
      engine: { dt: DT, width: 10, height: 10 }, scenemanager: { out: {} }, player: { seat: 0, mover: 0 },
      mover: { seat: 0, pos: [0, 0, 0], v: 0, lift: 1, look: { yaw: 0, pitch: 0, dist: 5 } },
      render3d: { camera: { fov: 60, near: 0.1, far: 100, at: [0, 3, -6], look: [0, 0, 0] } },
    },
    actors: [{ is: 'scenemanager' }],
  }
  write('orbit/ring.scene.json', JSON.stringify(ring))
  write('orbit/ring.sim.ts', `import { scenemanager } from ${JSON.stringify(new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import { player } from './player.sim.ts'
import { mover } from './mover.sim.ts'
import file from './ring.scene.json' with { type: 'json' }
export const sim = { scenemanager, player, mover }
export const scene = file
`)
  write('orbit/player.sim.ts', `export { player } from '../player.sim.ts'\n`)
  write('orbit/mover.sim.ts', `export { mover } from '../mover.sim.ts'\n`)
  write('orbit/player.client.ts', `export function setup(r, p) { p.chasecamera3d.follow(r.data.mover) }
export function tick() {}
export function remove() {}
`)
  const orbit: Scene = { ...top, prefabs: { ...top.prefabs, scenemanager: { ...top.prefabs.scenemanager, scenes: { ring: { file: 'ring.scene.json', suspend: false } }, entry: 'ring' } } }
  const records = await simulate({ file: orbit, sim: { scenemanager }, base: pathToFileURL(join(dir, 'orbit') + '/').href, seed: 1, ms: 1000, pages: [page()], watch: { kinds: ['mover'], fields: ['pos'], own: 'mover' } })
  const f = drawing(frames(records))[10]
  const x = (f.rows[f.own!].pos as number[])[0]
  expect(Object.keys(f.eye!)).toEqual(['pos', 'dir'])
  ;[x, 1, -5].forEach((v, i) => expect(f.eye!.pos[i]).toBeCloseTo(v, 9))
  ;[0, 0, 1].forEach((v, i) => expect(f.eye!.dir[i]).toBeCloseTo(v, 9))
  expect(records.filter(r => r.type === 'message').map(m => m.action)).not.toContain('eye')
})

// The processor time a run takes, which, unlike the wall's, other work on the machine does not
// stretch: the test file runs in a process of its own.
test('a run takes less processor time than it plays', async () => {
  const t0 = process.cpuUsage()
  await sim({ ms: 30_000, pages: [page(), page({ display: { hz: 120 } })] })
  const cpu = process.cpuUsage(t0)
  expect((cpu.user + cpu.system) / 1000).toBeLessThan(30_000)
})

test('ready is handed the loaded server before anything runs, and running says whose time it is', async () => {
  const seen: string[] = []
  await sim({
    ms: 500,
    ready(truth) {
      seen.push(`ready at step ${truth.n}`)
      truth.onStep(() => { if (!seen.includes('step "server"')) seen.push(`step ${JSON.stringify(running())}`) })
    },
    mount: () => { seen.push(`mount ${JSON.stringify(running())}`) },
  })
  expect(seen).toEqual(['ready at step 0', 'step "server"', 'mount {"page":0}'])
  expect(running()).toBeUndefined()
})

test('own follows a list of fields from the player row, each naming the next row, and names no row where a link is missing', async () => {
  const f = (own: string | string[]) => sim({ ms: 300, watch: { kinds: ['mover'], fields: ['pos'], own } })
  const one = frames(await f('mover')).at(-1)!, chain = frames(await f(['mover'])).at(-1)!
  expect(chain.own).toBe(one.own)
  expect(one.rows[one.own!].kind).toBe('mover')
  expect(frames(await f(['mover', 'seat'])).at(-1)!.own).toBeUndefined()
})

test('watch without kinds records every row, and without fields every field; cost times each frame and step', async () => {
  const records = await sim({ ms: 500, watch: {}, cost: true })
  const f = frames(records).at(-1)!
  expect(new Set(Object.values(f.rows).map(r => r.kind))).toEqual(new Set(['scenemanager', 'player', 'mover']))
  expect(Object.values(f.rows).find(r => r.kind === 'mover')).toMatchObject({ seat: 0, v: 0, pos: expect.any(Array) })
  expect(frames(records).every(f => typeof f.cost === 'number' && f.cost >= 0)).toBe(true)
  expect(steps(records).every(s => typeof s.cost === 'number' && s.cost >= 0)).toBe(true)
  expect(frames(await sim({ ms: 200 })).some(f => 'cost' in f)).toBe(false)
})

// ------------------------------------------------------------------ examining

test('parse reads back the lines a run wrote', async () => {
  const lines: string[] = []
  const records = await sim({ write: l => lines.push(l) })
  expect(parse(lines.join('\n') + '\n')).toEqual(records)
})

// Under the exact timing (the header) step 1's packet is sent at 16⅔ ms and arrives at 36⅔, which
// the vsync at 8 + 2 × 16⅔ ms takes, so that frame is the first to draw.
test('histogram: a page drawing a packet a frame moves one step a frame from its first packet, and says when that was', async () => {
  const h = histogram(await sim({ ...exact, pages: [vsynced(60)] }), 0)
  expect(Object.keys(h.counts)).toEqual(['1'])
  expect(h.counts[1]).toBeGreaterThan(170)
  expect(h.first).toBeCloseTo(8 + 2000 / 60, 6)
  const held = histogram(await sim({ ms: 10_000, server: { loop: 'interval', late: 1 } }), 0)
  expect(held.counts[0]).toBeGreaterThan(5)
  expect(histogram([{ type: 'run', mode: 'sim', ms: 0, pages: [] }], 0)).toEqual({ first: null, counts: {} })
})

test('standoff: the distance from the camera to the page\'s own row, and how much it changes frame to frame', async () => {
  const s = standoff(await sim(), 0)
  expect(s.frames.length).toBeGreaterThan(170)
  expect(new Set(s.frames.map(f => f.d))).toEqual(new Set([5]))
  expect(s.jitter).toEqual({ max: 0, rms: 0 })
  const frame = (t: number, x: number, eye: number): FrameRecord => ({ type: 'frame', page: 0, t, clock: t, n: t, took: [], rows: { 1: { kind: 'mover', pos: [x, 0, 0] } }, own: 1, eye: { pos: [eye, 0, 0], dir: [1, 0, 0], target: [x, 0, 0] } })
  const judder = standoff([frame(0, 10, 5), frame(1, 11, 5), frame(2, 12, 7), frame(3, 13, 7), frame(4, 14, 9)], 0)
  expect(judder.frames.map(f => f.d)).toEqual([5, 6, 5, 6, 5])
  expect(judder.jitter).toEqual({ max: 1, rms: 1 })
})

// Page 0's envelopes come in bursts, half of them held back and handed on with the next, so its
// frames take two or none; page 1's cross in a fixed time and its frames take one each.
test('envelopes a frame, each a page\'s own', async () => {
  const records = await sim({ ...exact, pages: [{ ...vsynced(60), down: { delay: 20, burst: 0.5 } }, vsynced(60)] })
  const p = packets(records, 0)
  expect(p[0]).toBeGreaterThan(10)
  expect(p[2]).toBeGreaterThan(10)
  expect(packets(records, 1)).toEqual({ 1: expect.any(Number) })
})

test('summary puts every part of every page together, and report prints it', async () => {
  const records = await sim({ pages: [page(), page({ display: { hz: 120 } })] })
  const s = summary(records)
  expect(s).toMatchObject({ mode: 'sim', ms: 3000 })
  expect(s.rate).toBeCloseTo(60, 0)
  expect(s.pages.map(p => p.page)).toEqual([0, 1])
  expect(s.pages[0].histogram.counts).toEqual(histogram(records, 0).counts)
  expect(s.pages[1].frames).toBeGreaterThan(2 * s.pages[0].frames - 10)
  const text = report(s)
  expect(text).toContain('sim run of 3000 ms')
  expect(text).toContain('page 1:')
  expect(() => summary([])).toThrow('the records have no run line')
})

// ------------------------------------------------------------------ real

// A recording's timing played again (`timing`): a run with a server that pauses and comes late, a
// display that wobbles and drops frames, played again from its step and frame times alone and its
// network's waits, draws the very steps it drew, frame for frame.
test('a simulation given a recording\'s timing draws what the recording drew', async () => {
  const first = await sim({ server: { late: 1.5, pause: { every: 0.5, ms: 60 } }, pages: [page({ up: { delay: 23 }, down: { delay: 31 }, display: { hz: 60, wobble: 5, drop: 0.1 }, presses: tapping })] })
  const t = timing(first)
  expect(t.pages[0]).toMatchObject({ up: { delay: 23 }, down: { delay: 31 } })
  expect(t.server.steps).toHaveLength(steps(first).length)
  const again = await sim({ ...t, pages: t.pages })
  expect(frames(again).map(f => [f.t, f.n])).toEqual(frames(first).map(f => [f.t, f.n]))
  expect(histogram(again, 0)).toEqual(histogram(first, 0))
  expect(() => timing([])).toThrow('the records have no run line')
})

// The same page on the machine's clocks, over a real socket to the manager served here, and a
// simulation of it given the real run's timing (`timing`): the server's steps, the moments the page
// drew its frames, the socket's handshake, and when each envelope, message and word arrived.
// Whatever the machine's timers did to the real run, late firings and a socket held under load
// included, the simulation draws the same steps a frame, within a stated tolerance: the fraction of
// frames that move each number of steps is within 0.02 of the real run's, for every number.
test('a real run over the socket and a simulation of its timing draw the same steps a frame', async () => {
  const ms = 4000
  const records = await real({ file: top, sim: { scenemanager }, base, ms, port: 0, pages: [{ hz: 60, presses: [{ at: 2000, act: ['move', 1] }] }], watch: { kinds: ['mover'], fields: ['pos'], own: 'mover' } })
  expect(records[0]).toMatchObject({ type: 'run', mode: 'real', ms })
  expect(frames(records).length).toBeGreaterThan(150)
  expect(steps(records).length).toBeGreaterThan(150)
  // A socket loses nothing and sends nothing twice; an envelope still crossing when the run closes
  // never arrives, so only those sent half a second before the end are held to it.
  const early = records.filter(r => r.type === 'packet' && r.sent < ms - 500)
  expect(early.filter(p => !(p.type === 'packet' && p.at.length === 1 && p.at[0] >= p.sent))).toEqual([])
  expect(steps(records).flatMap(s => s.applied).filter(a => a.action === 'move')).toHaveLength(1)
  const t = timing(records)
  const simulated = await sim({ ...t, pages: t.pages.map(p => ({ ...p, presses: [{ at: 2000, act: ['move', 1] as [string, number] }] })) })
  const share = (r: Record_[]) => { const h = histogram(r, 0).counts; const all = Object.values(h).reduce((a, b) => a + b, 0); return (k: string) => (h[Number(k)] ?? 0) / all }
  const a = share(records), b = share(simulated)
  for (const k of new Set([...Object.keys(histogram(records, 0).counts), ...Object.keys(histogram(simulated, 0).counts)]))
    expect(Math.abs(a(k) - b(k)), JSON.stringify({ real: histogram(records, 0), sim: histogram(simulated, 0) })).toBeLessThan(0.02)
}, 30_000)

// ------------------------------------------------------------------ the browser's tap

// A page as client.html makes one, with the tap between it and its wire; here the wire is the
// in-tab loopback, the server stepped a step before each frame, and the lines the tap sends are kept.
// Node has no page for the actor's keys and the tap's pagehide to listen on: these stand in for it
// while the page lives, and go when it closes.
const listens = () => {
  const g = globalThis as { addEventListener?: unknown; removeEventListener?: unknown }
  const had = { add: g.addEventListener, remove: g.removeEventListener }
  g.addEventListener = () => {}
  g.removeEventListener = () => {}
  return () => { g.addEventListener = had.add; g.removeEventListener = had.remove }
}
async function tapped(search: string, frames: number) {
  onTestFinished(listens())
  const truth = boot(top, { scenemanager })
  await load(truth, base)
  const sent: { body: { name: string; first: boolean; lines: string[] }; last: boolean }[] = []
  const page = tap(loopback(accept(manager(truth))), wire => view(link(wire), top, base, () => {}), { search, send: (body, last) => sent.push({ body, last }) })
  for (let k = 0; k < frames; k++) { truth.step(DT); await page.frame() }
  return { page, sent }
}

test('without ?tap the tap is the view itself, and records nothing', async () => {
  onTestFinished(listens())
  const truth = boot(top, { scenemanager })
  await load(truth, base)
  let made: ReturnType<typeof view> | undefined
  const page = tap(loopback(accept(manager(truth))), wire => (made = view(link(wire), top, base, () => {})), { search: '?other=1', send: () => { throw new Error('sent') } })
  expect(page).toBe(made)
  page.close()
})

test('with ?tap every frame is a frame record, watched as the address says, sent as one recording once the page closes', async () => {
  const { page, sent } = await tapped('?tap=mine&kinds=mover&fields=pos&own=mover', 30)
  expect(page.client!.rows.some(r => r.kind === 'mover')).toBe(true)
  page.close()
  expect(sent.at(-1)!.last).toBe(true)
  expect(sent.map(s => s.body.first)).toEqual([true, ...sent.slice(1).map(() => false)])
  expect(new Set(sent.map(s => s.body.name))).toEqual(new Set(['mine']))
  const records = parse(sent.flatMap(s => s.body.lines).join('\n'))
  expect(records[0]).toMatchObject({ type: 'run', mode: 'real', ms: 0, watch: { kinds: ['mover'], fields: ['pos'], own: ['mover'] } })
  const fs = frames(records)
  expect(fs).toHaveLength(30)
  const last = fs.at(-1)!
  expect(last.rows[last.own!]).toEqual({ kind: 'mover', pos: expect.any(Array) })
  expect(last.eye).toEqual({ pos: [(last.rows[last.own!].pos as number[])[0] - 5, 0, 0], dir: [1, 0, 0], target: [(last.rows[last.own!].pos as number[])[0], 0, 0] })
  expect(fs.flatMap(f => f.took).every(t => t.sent === null && t.at >= 0)).toBe(true)
  expect(summary(records).ms).toBe(last.t)
})

test('a tap names its recording with letters, digits, _, . and - only', async () => {
  await expect(tapped('?tap=../x', 1)).rejects.toThrow('the tap is named "../x": letters, digits, _, . and - only')
})
