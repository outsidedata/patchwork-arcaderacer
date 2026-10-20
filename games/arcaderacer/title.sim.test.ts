// The title, booted as the server boots arcaderacer: a seat enters it, the rivals stand on the grid and
// the intro waits until the seat's page says it is ready; then the curtain starts the intro and flags
// the race off in the same step, every frame of every shot of the cue file frames its car (the check
// `assets/intro.ts` writes it by), and at the end every rival is let go and races on behind the title.
// A skip plays it through at once, the race still running after. The curtain starts it on its own
// after its wait. A rival refuses a cue a car cannot obey, and no seat can flag the race.
import { expect, test, vi } from 'vitest'
import type { Script } from '#plugins/cutscene/cutscene.sim.ts'
import { blocker, enter, frames, land, type Drawn } from './assets/intro.ts'
import { locate, sample } from './plugins/track/track.sim.ts'
import tokyo from './assets/courses/tokyo.json' with { type: 'json' }
import defs from './assets/arcaderacer.json' with { type: 'json' }
import intro from './assets/intro.json' with { type: 'json' }
import file from './arcaderacer.scene.json' with { type: 'json' }

vi.setConfig({ testTimeout: 300_000 })

const DT = file.prefabs.engine.dt

async function title() {
  const s = await enter()
  const rivals = () => s.t.rows.filter(r => r.kind === 'rival')
  const steps = (n: number) => { for (let i = 0; i < n; i++) s.truth.step(DT) }
  // Steps until the cue clock reaches `e`, or the intro is done, its clock stopped.
  const until = (e: number) => { for (let i = 0; i < 1e5 && !s.one('cutscene').data.done && s.one('cutscene').data.e < e - 1e-9; i++) s.truth.step(DT) }
  return { ...s, rivals, steps, until }
}

test('the seat enters the title, and the rivals stand on the grid until the page is ready', async () => {
  const s = await title()
  s.steps(120)
  expect(s.one('cutscene').data.running ?? false).toBe(false)
  expect(s.one('curtain').data.started).toBe(false)
  expect(s.one('race').data.phase).toBe('grid')
  expect(s.rivals().length).toBe(8)
  for (const r of s.rivals()) {
    expect(r.data.seg).toBeGreaterThanOrEqual(0)
    expect(r.data.speed).toBe(0)
  }
})

test('ready starts the intro and flags the race off in one step, and the race goes as the count ends', async () => {
  const s = await title()
  s.send(s.one('curtain').id, 'ready')
  s.steps(1)
  const d = s.one('cutscene').data
  expect(s.one('curtain').data.started).toBe(true)
  expect(d.running).toBe(true)
  expect(d.e).toBeCloseTo(DT, 9)
  expect(s.one('race').data.phase).toBe('count')
  expect(s.one('race').data.count).toBeCloseTo(defs.race.countdown - DT, 9)
  for (const r of s.rivals()) expect(r.data.direct).toEqual({})
  s.until(defs.race.countdown + 0.5)
  expect(s.one('race').data.phase).toBe('go')
  for (const r of s.rivals()) expect(r.data.speed).toBeGreaterThan(0)
})

test('every frame of every shot frames its car, in view, in reach, with nothing in between', async () => {
  const seen = await frames(intro as Script, 1)
  const shots = intro.cues.filter(c => c.do === 'shot' && typeof c.look === 'string').map(c => c.name)
  expect(seen.map(s => s.shot)).toEqual(shots)
  for (const s of seen) expect(s.off).toBeLessThanOrEqual(1)
})

test('the launch camera stands over the bank beyond the wall, where 1.3 m over the road it stood inside it', async () => {
  const s = await title()
  const L = land()
  const B = blocker(L, tokyo as unknown as Drawn)
  const launch = intro.cues.find(c => c.name === 'launch')!
  const pos = launch.pos as number[]
  s.send(s.one('curtain').id, 'ready')
  s.until(launch.at + 1)
  const car = s.rivals().find(r => r.data.name === launch.look)!
  const head = [car.data.pos[0], car.data.pos[1] + intro.head, car.data.pos[2]]
  expect(B.through(pos, head)).toBeUndefined()
  const old = [pos[0], sample(L.track, locate(L.track, pos[0], pos[2], -1).s).y + 1.3, pos[2]]
  expect(B.through(old, head)).toBe('the bank')
})

test('at the end every rival is let go, and the race runs on behind the title', async () => {
  const s = await title()
  s.send(s.one('curtain').id, 'ready')
  s.until(intro.end + 0.1)
  s.steps(2)
  const d = s.one('cutscene').data
  expect(d.done).toBe(true)
  expect(d.running).toBe(false)
  for (const r of s.rivals()) expect(r.data.direct).toBeNull()
  const far = new Map(s.rivals().map(r => [r.id, r.data.far]))
  s.steps(30 / DT)
  expect(s.one('race').data.phase).toBe('go')
  for (const r of s.rivals()) {
    expect(r.data.far).toBeGreaterThan(far.get(r.id)! + 500)
    expect(r.data.speed).toBeGreaterThan(10)
  }
})

test('a skip plays the intro through at once for every seat, and the race runs on', async () => {
  const s = await title()
  s.send(s.one('curtain').id, 'ready')
  s.steps(6 / DT)
  s.send(s.one('cutscene').id, 'skip')
  s.steps(2)
  const d = s.one('cutscene').data
  expect(d.done).toBe(true)
  for (const r of s.rivals()) expect(r.data.direct).toBeNull()
  const far = new Map(s.rivals().map(r => [r.id, r.data.far]))
  s.steps(10 / DT)
  for (const r of s.rivals()) expect(r.data.far).toBeGreaterThan(far.get(r.id)! + 100)
})

test('the curtain starts the intro by itself after its wait, and a ready after that does nothing', async () => {
  const s = await title()
  s.steps(Math.ceil(defs.curtain.wait / DT) - 2)
  expect(s.one('cutscene').data.running ?? false).toBe(false)
  s.steps(3)
  expect(s.one('cutscene').data.running).toBe(true)
  expect(s.one('race').data.phase).toBe('count')
  const e = s.one('cutscene').data.e
  s.send(s.one('curtain').id, 'ready')
  s.steps(1)
  expect(s.one('cutscene').data.e).toBeCloseTo(e + DT, 9)
})

test('no seat can flag the race, and a rival handed a cue a car cannot obey throws', async () => {
  const s = await title()
  s.send(s.one('race').id, 'flag')
  s.steps(2)
  expect(s.one('race').data.phase).toBe('grid')
  s.send(s.one('curtain').id, 'ready')
  s.steps(1)
  const r = s.rivals()[0]
  r.data.direct.walk = { to: [0, 0], gear: null, stop: 10, pace: 1 }
  expect(() => s.steps(1)).toThrow(`the rival ${r.data.name} was handed a walk cue, and a rival is driven by its pilot`)
})
