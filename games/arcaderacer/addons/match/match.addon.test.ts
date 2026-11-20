// The match addon on arcaderacer's manager, in node with no page: seats opened as links on a loopback
// to `match`, the game's door, closed, and the manager stepped. What each seat is told is read off the
// `Down`s it hears: the scene it is on, and the `match` row and the cars there. Every row of the
// transition table, in order: a fresh join, the leader choosing a course, a start refused until every seat
// has picked a car, the race staged until every racer's page says it is ready, a `waiting` seat spectating
// and choosing what it watches, a racer refreshing (its car held by nobody), the results once every racer
// has finished, any racer exiting, the leader leaving the lobby and leaving mid-race, and a start past the
// course's seats. A second test has the staging wait out its time, the grace after the first finish and
// the results' time run out. A third is `solo`, index.html's: the pick starts the race with no start, the
// race still staged until the page is ready, and the results standing past their time until exit.
import { expect, test, vi } from 'vitest'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import { link, load, manager, type Down, type Link } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { match, solo } from './match.addon.ts'
import { sim } from '../../arcaderacer.sim.ts'
import file from '../../arcaderacer.scene.json' with { type: 'json' }
import forestFile from '../../forest.scene.json' with { type: 'json' }
import defs from '../../assets/arcaderacer.json' with { type: 'json' }

vi.setConfig({ testTimeout: 120_000 })

const DT = file.prefabs.engine.dt
const base = new URL('../../', import.meta.url).href
const entry = file.prefabs.scenemanager.entry
const cars = defs.match.cars
const R = defs.race

type Seat = { link: Link; last?: Down; seq: number; visit: string; close(): void }

async function game(alone = false) {
  const truth = boot(structuredClone(file) as Scene, sim)
  const scenes = await load(truth, base)
  const door = (alone ? solo : match)(manager(truth))
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
    return (m.roster as { id: number; mode: string; scene: string; seat: number; car: string }[]).find(e => e.scene === m.scene && e.seat === seat)
  }
  // A racer's page saying its art is in, on its own `player` row.
  const ready = (s: Seat) => press(s, own(s)!.id, 'ready')
  // Steps until every seat's last packet says what `ok` asks, at most `most` steps.
  const until = (ok: () => boolean, most = 30) => {
    for (let k = 0; k < most && !ok(); k++) step()
    expect(ok()).toBe(true)
  }
  // Every seat picks a car of its own on the title and the leader chooses the course, as the pages do.
  const setup = (leader: Seat, seats: Seat[], course: string) => {
    seats.forEach((s, k) => ask(s, 'pick', cars[k % cars.length]))
    ask(leader, 'choose', course)
    until(() => seats.every((s, k) => me(s)?.car === cars[k % cars.length] && row(s).data.chosen === course))
  }
  return { truth, scenes, step, open, rows, row, where, press, ask, own, car, me, until, ready, setup }
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
  // only the leader chooses the course, and every seat is told it
  g.ask(b, 'choose', 'forest')
  g.step(3)
  expect(g.row(b).data.chosen).toBe('')
  g.ask(a, 'choose', 'forest')
  g.until(() => [a, b, c].every(s => g.row(s).data.chosen === 'forest'))
  // nobody starts the race before every seat has picked a car: not the leader, with the third's pick
  // outstanding, and never a seat that is not the leader
  g.ask(a, 'pick', cars[0])
  g.ask(b, 'pick', cars[1])
  g.until(() => g.me(a)?.car === cars[0] && g.me(b)?.car === cars[1])
  g.ask(a, 'start')
  g.step(5)
  expect(g.row(a).data.match).toBe('lobby')
  expect([a, b, c].every(s => g.where(s) === entry)).toBe(true)
  g.ask(c, 'pick', cars[2])
  g.until(() => g.me(c)?.car === cars[2])
  g.ask(b, 'start')
  g.step(5)
  expect(g.row(a).data.match).toBe('lobby')
  expect([a, b, c].every(s => g.where(s) === entry)).toBe(true)

  // the leader starts: every lobby connection is a racer on the course, each holding a car on a grid
  // place of its own, and rivals on the rest
  g.ask(a, 'start')
  g.until(() => [a, b, c].every(s => g.where(s) === 'forest' && g.car(s)?.data.seg >= 0))
  const forest = g.scenes.get('forest')!
  const m = () => forest.rows.find(r => r.kind === 'match')!.data
  const race = () => forest.rows.find(r => r.kind === 'race')!
  // the race is staged: it waits on every racer's page, and no car has moved or clock run meanwhile
  expect(race().data.phase).toBe('staging')
  g.ready(a)
  g.ready(b)
  g.until(() => g.own(a)?.data.ready === true && g.own(b)?.data.ready === true)
  g.step(Math.ceil((R.hold + R.countdown) / DT) + 60)
  expect(race().data.phase).toBe('staging')
  expect(race().data.clock).toBe(0)
  expect(forest.rows.filter(r => r.kind === 'car' || r.kind === 'rival').every(r => r.data.speed === 0)).toBe(true)
  // the last racer's page is ready: the grid hold and the countdown begin
  g.ready(c)
  g.until(() => race().data.phase !== 'staging')
  const holder = (id: number) => forest.rows.find(r => r.kind === 'player' && r.data.held?.id === id)
  expect(m().match).toBe('racing')
  expect(m().course).toBe('forest')
  const onGrid = forest.rows.filter(r => r.kind === 'car')
  expect(onGrid.length).toBe(3)
  for (const car of onGrid) expect(holder(car.id)).toBeDefined()
  const grids = onGrid.map(r => r.data.grid).sort()
  expect(grids).toEqual([0, 1, 2])
  const rivals = forest.rows.filter(r => r.kind === 'rival').map(r => r.data.grid).sort()
  expect(rivals).toEqual([3, 4, 5])
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

  // the first racer home does not end the race: the results wait on the racer still driving
  g.until(() => race().data.phase === 'go', 600)
  g.until(() => g.row(a).data.match === 'racing')
  const aCar = g.car(a)!.id, cCar = g.car(c)!.id
  forest.rows.find(r => r.id === aCar)!.data.lap = 2
  forest.rows.find(r => r.id === aCar)!.data.done = 99
  g.step(5)
  expect(race().data.phase).toBe('go')
  // every racer still here has finished: the race and the match are at the results, for every seat
  forest.rows.find(r => r.id === cCar)!.data.lap = 2
  forest.rows.find(r => r.id === cCar)!.data.done = 100
  g.until(() => race().data.phase === 'results')
  g.until(() => [a, c, d].every(s => g.row(s).data.match === 'results'))
  for (const s of [a, c, d]) expect(g.rows(s).find(r => r.kind === 'race')!.data.phase).toBe('results')
  // a seat on the course exits, not only the leader: every racer and spectator back in the lobby
  g.ask(c, 'exit')
  g.until(() => [a, c, d].every(s => g.where(s) === entry) && [a, c, d, b2].every(s => g.me(s)?.mode === 'lobby'))
  expect(g.row(a).data.match).toBe('lobby')
  expect(g.row(a).data.message).toBe('')
  expect(g.row(a).data.chosen).toBe('')

  // the leader leaves the lobby: the next in join order leads
  a.close()
  g.until(() => g.row(c).data.leader === g.me(c)!.id)

  // the new leader chooses and starts; the leader leaves mid-race: every connection back in the lobby,
  // told why, the next in join order the leader
  g.setup(c, [c, d, b2], 'tokyo')
  g.ask(c, 'start')
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
  g.setup(seats[0], seats, 'forest')
  g.ask(seats[0], 'start')
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

test('the times: staging gives up on a page that never says ready, the others are given a grace after the first finish, and the results go back to the lobby on their own', async () => {
  const g = await game()
  const [a, b] = [g.open(), g.open()]
  g.until(() => [a, b].every(s => g.me(s) !== undefined))
  g.setup(a, [a, b], 'forest')
  g.ask(a, 'start')
  g.until(() => [a, b].every(s => g.where(s) === 'forest' && g.car(s)?.data.seg >= 0))
  const forest = g.scenes.get('forest')!
  const race = () => forest.rows.find(r => r.kind === 'race')!
  const driven = () => [a, b].map(s => forest.rows.find(r => r.id === g.car(s)!.id)!)
  // b's page never says ready: staging waits `wait` seconds on it, and not a step less
  g.ready(a)
  g.until(() => g.own(a)?.data.ready === true)
  race().data.staged = R.wait - 10 * DT
  g.step(5)
  expect(race().data.phase).toBe('staging')
  g.until(() => race().data.phase !== 'staging', 10)
  expect(g.own(b)!.data.ready).toBe(false)
  g.until(() => race().data.phase === 'go', 600)
  g.until(() => g.row(a).data.match === 'racing')
  // a finishes and b does not: the results come `grace` seconds after, and not a step before
  const [carA] = driven()
  carA.data.lap = 2
  carA.data.done = race().data.clock
  race().data.clock = carA.data.done + R.grace - 10 * DT
  g.step(5)
  expect(race().data.phase).toBe('go')
  g.until(() => race().data.phase === 'results', 10)
  g.until(() => [a, b].every(s => g.row(s).data.match === 'results'))
  // nobody presses exit: the race row ends the results after `results` seconds, and every seat goes home
  race().data.over = R.results - 10 * DT
  g.step(5)
  expect([a, b].every(s => g.where(s) === 'forest')).toBe(true)
  g.until(() => [a, b].every(s => g.where(s) === entry && g.me(s)?.mode === 'lobby'), 20)
  expect(g.row(a).data.match).toBe('lobby')
  expect(g.row(a).data.chosen).toBe('')
})

test('solo: the pick starts the race, staging waits on the page, and the results stand until exit', async () => {
  const g = await game(true)
  const a = g.open()
  g.until(() => g.me(a) !== undefined)
  expect(g.row(a).data.solo).toBe(true)
  // a pick with no course chosen starts nothing
  g.ask(a, 'pick', cars[1])
  g.until(() => g.me(a)?.car === cars[1])
  g.step(5)
  expect(g.where(a)).toBe(entry)
  expect(g.row(a).data.match).toBe('lobby')
  // the course chosen, the pick is the start: no `start` is asked
  g.ask(a, 'choose', 'forest')
  g.ask(a, 'pick', cars[2])
  g.until(() => g.where(a) === 'forest' && g.car(a)?.data.seg >= 0)
  expect(g.car(a)!.data.car).toBe(cars[2])
  g.until(() => g.me(a)?.mode === 'racer')
  const forest = g.scenes.get('forest')!
  expect(forest.rows.find(r => r.kind === 'match')!.data.solo).toBe(true)
  // solo, the player starts last on the grid, the rivals on every place ahead
  expect(g.car(a)!.data.grid).toBe(forestFile.seats - 1)
  expect(forest.rows.filter(r => r.kind === 'rival').map(r => r.data.grid).sort()).toEqual([0, 1, 2, 3, 4])
  const race = () => forest.rows.find(r => r.kind === 'race')!
  // staging holds the cars until the page says its art is in
  g.step(Math.ceil((R.hold + R.countdown) / DT) + 60)
  expect(race().data.phase).toBe('staging')
  expect(race().data.clock).toBe(0)
  g.ready(a)
  g.until(() => race().data.phase !== 'staging')
  g.until(() => race().data.phase === 'go', 600)
  // the player finishes: the results, which stand past their time
  const mine = forest.rows.find(r => r.id === g.car(a)!.id)!
  mine.data.lap = 2
  mine.data.done = race().data.clock
  g.until(() => race().data.phase === 'results')
  g.until(() => g.row(a).data.match === 'results')
  race().data.over = R.results
  g.until(() => race().data.ended === true, 5)
  g.step(30)
  expect(g.where(a)).toBe('forest')
  expect(g.row(a).data.match).toBe('results')
  // exit: back on the title, in the lobby, with no car and no course
  g.ask(a, 'exit')
  g.until(() => g.where(a) === entry && g.me(a)?.mode === 'lobby')
  expect(g.row(a).data.match).toBe('lobby')
  expect(g.row(a).data.chosen).toBe('')
  expect(g.me(a)!.car).toBe('')
})

test('a manager is solo or a match, never both', async () => {
  const truth = boot(structuredClone(file) as Scene, sim)
  await load(truth, base)
  solo(manager(truth))
  expect(() => match(manager(truth))).toThrow('the match on this manager is solo, and was asked for as a match')
})
