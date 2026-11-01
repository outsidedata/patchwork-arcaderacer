// The match addon on arcaderacer's manager, in node with no page: seats opened as links on a loopback
// to `match`, the game's door, closed, and the manager stepped. What each seat is told is read off the
// `Down`s it hears: the scene it is on, and the `match` row and the cars there. Every row of the
// transition table, in order: a fresh join, the leader starting, a `waiting` seat spectating and
// choosing what it watches, a racer refreshing (its car held by nobody), the leader finishing, the leader
// exiting, the leader leaving the lobby and leaving mid-race, and a start past the course's seats.
import { expect, test, vi } from 'vitest'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import { link, load, manager, type Down, type Link } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { match } from './match.addon.ts'
import { sim } from '../../arcaderacer.sim.ts'
import file from '../../arcaderacer.scene.json' with { type: 'json' }
import forestFile from '../../forest.scene.json' with { type: 'json' }

vi.setConfig({ testTimeout: 120_000 })

const DT = file.prefabs.engine.dt
const base = new URL('../../', import.meta.url).href
const entry = file.prefabs.scenemanager.entry

type Seat = { link: Link; last?: Down; seq: number; visit: string; close(): void }

async function game() {
  const truth = boot(structuredClone(file) as Scene, sim)
  const scenes = await load(truth, base)
  const door = match(manager(truth))
  const step = (n = 1) => { for (let k = 0; k < n; k++) truth.step(DT) }
  const open = (): Seat => {
    const l = link(loopback(door))
    const s: Seat = { link: l, seq: 0, visit: '', close: () => l.close() }
    l.hear(d => {
      s.last = d
      if (`${d.scene}/${d.seat}` !== s.visit) { s.visit = `${d.scene}/${d.seat}`; s.seq = 0 }
    })
    return s
  }
  // The rows a seat was last sent, and the match row among them.
  const rows = (s: Seat): Row[] => s.last!.packet.rows
  const row = (s: Seat) => rows(s).find(r => r.kind === 'match')!
  const where = (s: Seat) => s.last?.scene
  // A seat's message at a row it was sent, stamped for the step its scene is about to run.
  const press = (s: Seat, id: number, action: string, ...args: (string | number)[]) => {
    const n = scenes.get(where(s)!)!.n
    s.link.send({ scene: s.last!.scene, seat: s.last!.seat, msg: { seq: ++s.seq, n, id, action, args } })
  }
  const ask = (s: Seat, action: string, ...args: (string | number)[]) => press(s, row(s).id, action, ...args)
  const own = (s: Seat) => rows(s).find(r => r.kind === 'player' && r.data.mine === true)
  // The car a seat's own `player` row holds, among the rows it was last sent.
  const car = (s: Seat) => {
    const held = own(s)?.data.held
    return held ? rows(s).find(r => r.kind === held.kind && r.id === held.id) : undefined
  }
  // What the match row a seat was last sent says of its own connection.
  const me = (s: Seat) => {
    if (!s.last) return
    const m = row(s).data
    const self = own(s)
    const seat = self ? self.data.conn : Object.entries(m).find(([k]) => /^you\d+$/.test(k))?.[1]
    return (m.roster as { id: number; mode: string; scene: string; seat: number }[]).find(e => e.scene === m.scene && e.seat === seat)
  }
  // Steps until every seat's last packet says what `ok` asks, at most `most` steps.
  const until = (ok: () => boolean, most = 30) => {
    for (let k = 0; k < most && !ok(); k++) step()
    expect(ok()).toBe(true)
  }
  return { truth, scenes, step, open, rows, row, where, press, ask, own, car, me, until }
}

test('the whole table, in order', async () => {
  const g = await game()
  // a fresh join: every connection in the lobby, the first the leader
  const [a, b, c] = [g.open(), g.open(), g.open()]
  g.until(() => [a, b, c].every(s => g.me(s) !== undefined))
  for (const s of [a, b, c]) {
    expect(g.where(s)).toBe(entry)
    expect(g.me(s)!.mode).toBe('lobby')
    expect(g.row(s).data.match).toBe('lobby')
  }
  expect(g.row(a).data.leader).toBe(g.me(a)!.id)
  // only the leader starts a race
  g.ask(b, 'start', 'forest')
  g.step(3)
  expect(g.row(b).data.match).toBe('lobby')
  expect([a, b, c].every(s => g.where(s) === entry)).toBe(true)

  // the leader starts: every lobby connection is a racer on the course, each holding a car on a grid
  // place of its own, and rivals on the rest
  g.ask(a, 'start', 'forest')
  g.until(() => [a, b, c].every(s => g.where(s) === 'forest' && g.car(s)?.data.seg >= 0))
  const forest = g.scenes.get('forest')!
  const m = () => forest.rows.find(r => r.kind === 'match')!.data
  const holder = (id: number) => forest.rows.find(r => r.kind === 'player' && r.data.held?.id === id)
  expect(m().match).toBe('racing')
  expect(m().course).toBe('forest')
  const cars = forest.rows.filter(r => r.kind === 'car')
  expect(cars.length).toBe(3)
  for (const car of cars) expect(holder(car.id)).toBeDefined()
  const grids = cars.map(r => r.data.grid).sort()
  expect(grids).toEqual([0, 1, 2])
  const rivals = forest.rows.filter(r => r.kind === 'rival').map(r => r.data.grid).sort()
  expect(rivals).toEqual([3, 4, 5, 6, 7])
  g.until(() => [a, b, c].every(s => g.me(s)?.mode === 'racer'))

  // a connection that joins mid-match waits, and is told so
  const d = g.open()
  g.until(() => g.me(d) !== undefined)
  expect(g.where(d)).toBe(entry)
  expect(g.me(d)!.mode).toBe('waiting')
  expect(g.row(d).data.message).toBe('waiting')
  expect(g.row(d).data.match).toBe('racing')

  // it spectates: on the course holding no car, free
  g.ask(d, 'spectate')
  g.until(() => g.where(d) === 'forest' && g.me(d)?.mode === 'spectator' && g.own(d)?.data.watch === -1)
  const spectator = g.own(d)!
  const watching = () => forest.rows.find(r => r.id === spectator.id)!.data.watch
  expect(spectator.data.held).toBeNull()
  expect(forest.rows.filter(r => r.kind === 'car').length).toBe(3)
  // it follows b's car, and goes back to the free camera
  const bCar = g.car(b)!.id
  g.press(d, spectator.id, 'watch', bCar)
  g.until(() => watching() === bCar)
  g.press(d, spectator.id, 'watch', -1)
  g.until(() => watching() === -1)
  // a car nobody holds is not followed
  g.press(d, spectator.id, 'watch', 123456)
  g.step(3)
  expect(watching()).toBe(-1)
  // a racer's drive presses reach its car; a spectator's reach nothing
  g.press(d, spectator.id, 'throttle', 1)
  g.step(2)
  expect(forest.rows.filter(r => r.kind === 'car').every(r => r.data.throttle === 0)).toBe(true)
  g.press(b, g.own(b)!.id, 'steer', 0.5)
  g.until(() => forest.rows.find(r => r.id === bCar)!.data.steer === 0.5)

  // a racer refreshes: its car stands on, held by nobody, with no control; the connection is gone
  const bId = g.me(b)!.id, bPlayer = g.own(b)!.id
  g.step(5)
  const was = forest.rows.find(r => r.id === bCar)!.data.pos
  b.close()
  g.until(() => !forest.rows.some(r => r.id === bPlayer))
  g.step()
  const left = forest.rows.find(r => r.id === bCar)!
  expect(left.kind).toBe('car')
  expect(holder(bCar)).toBeUndefined()
  expect(Math.hypot(left.data.pos[0] - was[0], left.data.pos[2] - was[2])).toBeLessThan(5)
  expect([left.data.steer, left.data.throttle, left.data.brake, left.data.handbrake]).toEqual([0, 0, 0, 0])
  g.step(2)
  expect(m().roster.some((e: { id: number }) => e.id === bId)).toBe(false)
  // and it comes back as a new connection, waiting
  const b2 = g.open()
  g.until(() => g.me(b2) !== undefined)
  expect(g.me(b2)!.mode).toBe('waiting')
  expect(g.me(b2)!.id).not.toBe(bId)

  // the leader's car finishes: the race and the match are at the results, for every seat on the course
  const race = () => forest.rows.find(r => r.kind === 'race')!
  g.until(() => race().data.phase === 'go', 600)
  g.until(() => g.row(a).data.match === 'racing')
  forest.rows.find(r => r.id === g.car(a)!.id)!.data.lap = 2
  forest.rows.find(r => r.id === g.car(a)!.id)!.data.done = 99
  g.until(() => race().data.phase === 'results')
  g.until(() => [a, c, d].every(s => g.row(s).data.match === 'results'))
  for (const s of [a, c, d]) expect(g.rows(s).find(r => r.kind === 'race')!.data.phase).toBe('results')
  // only the leader exits
  g.ask(c, 'exit')
  g.step(3)
  expect(g.where(c)).toBe('forest')
  // the leader exits: every racer and spectator back in the lobby
  g.ask(a, 'exit')
  g.until(() => [a, c, d].every(s => g.where(s) === entry) && [a, c, d, b2].every(s => g.me(s)?.mode === 'lobby'))
  expect(g.row(a).data.match).toBe('lobby')
  expect(g.row(a).data.message).toBe('')

  // the leader leaves the lobby: the next in join order leads
  a.close()
  g.until(() => g.row(c).data.leader === g.me(c)!.id)

  // the new leader starts; the leader leaves mid-race: every connection back in the lobby, told why,
  // the next in join order the leader
  g.ask(c, 'start', 'tokyo')
  g.until(() => [c, d, b2].every(s => g.where(s) === 'tokyo'))
  c.close()
  g.until(() => [d, b2].every(s => g.where(s) === entry && g.me(s)?.mode === 'lobby'))
  expect(g.row(d).data.message).toBe('disconnected')
  expect(g.row(d).data.match).toBe('lobby')
  expect(g.row(d).data.leader).toBe(g.me(d)!.id)
  // a seat on the title is told its own seat alone
  expect(Object.keys(g.row(d).data).filter(k => /^you\d+$/.test(k)).length).toBe(1)
})

test('a start past the course\'s seats: the rest wait, and find no seat to spectate in', async () => {
  const g = await game()
  const seats = Array.from({ length: forestFile.seats + 1 }, () => g.open())
  g.until(() => seats.every(s => g.me(s) !== undefined))
  g.ask(seats[0], 'start', 'forest')
  const racers = seats.slice(0, forestFile.seats), last = seats[forestFile.seats]
  g.until(() => racers.every(s => g.where(s) === 'forest' && g.car(s)?.data.seg >= 0))
  const forest = g.scenes.get('forest')!
  expect(forest.rows.filter(r => r.kind === 'rival').length).toBe(0)
  g.until(() => g.me(last)?.mode === 'waiting')
  expect(g.where(last)).toBe(entry)
  g.ask(last, 'spectate')
  g.step(10)
  expect(g.where(last)).toBe(entry)
  expect(g.me(last)!.mode).toBe('waiting')
})
