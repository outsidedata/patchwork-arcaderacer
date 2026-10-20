// match: arcaderacer's match, held where the truths are. `match(row)`, handed the manager's
// `scenemanager` row, is the server's side of every seat, for a transport to hand each page that
// arrives, as the scenemanager addon's `accept(row)` is: each page is that `accept`'s, and this addon
// stands in front of it. So the game's own code attaches it: `<game>.server.ts` serves `match` in place
// of `accept`, and `index.html` and `dev.html` hand it to their loopback.
//
// It holds every truth about the match: every connection, in the order they joined, keyed by the
// connection and never by a seat number or a slot (a seat's number changes on every move), each with
// its mode; the leader; the match's mode; the course; and the lobby's message. Each change is broadcast
// to the `match` row of every scene (`plugins/match`), and it moves seats with core's `go`, sent at the
// scene's `scenemanager` row from the seat it moves.
//
// The modes, and the whole of what changes them:
//   the match   `lobby`, `racing`, `results`.
//   a connection   `lobby`, `waiting`, `racer`, `spectator`.
//   the leader   one connection: the earliest joined still here.
//
//   A connection joins: `lobby` while the match is in the lobby, else `waiting`; the leader when there
//   is none.
//   The leader asks `start` with a course, the match in the lobby: the course starts over (its `match`
//   row's `reset`), up to the course's `seats` `lobby` connections in join order, the leader first, are
//   `racer` and sent there; any `lobby` connection past them is `waiting`; the match is `racing` and
//   the message `waiting`.
//   A `waiting` connection asks `spectate`, the match racing or at its results: it is sent to the
//   course, and is `spectator` once it is there. A course whose every seat is taken leaves it where it
//   was, `waiting`.
//   A `racer` or `spectator` reaches the course: its `player` row, the one the first envelope of its
//   visit names `mine`, is told to the course's `match` row (`role`) as a racer, which takes hold of a
//   car made for it, or a spectator. It is told
//   from the addon's own seat and never from the seat that just came, which a page running the course
//   ahead may not have made yet.
//   The race row of the course reaches `results` (the leader's car finished): the match is `results`.
//   The leader asks `exit`, the match at its results: every `racer` and `spectator` is sent to the
//   entry, and every connection is `lobby`; the match is in the lobby and the message ''.
//   A `racer`'s connection closes while the match runs: its seat leaves, its `player` row ending with
//   it, and the car it held stands on where it was, with no control (`car.sim.ts`). The connection
//   goes.
//   Any other connection closes: it goes.
//   The leader's connection closes: the next in join order is the leader. While the match runs, every
//   connection on the course is sent to the entry, every connection is `lobby`, the match is in the
//   lobby and the message `disconnected`.
// Anything else changes nothing.
//
// What a seat asks reaches it through the `match` row's `asks`, read after each step of the manager and
// emptied by the next `hear`; a scene going back over steps it ran (`addons/rewind`) is not read until
// it stands where it stood. Every message it sends a scene is a seat's message of number 0, as the
// scenemanager's own `enter` and `arrive` are, so a scene run ahead writes it in its journal and every
// page's copy takes it on the step the server did. Its own seat on each scene, opened when it is
// attached, possesses the scene's `match` row, so `hear`, `reset` and `role` are its alone. On a
// scene nobody runs ahead it attaches a piece that sends each seat only its own `you<n>` of the `match`
// row (`plugins/match`).
import type { Arg, Row, Truth } from '#engine/engine.ts'
import { accept, entries, owner, scene, scenes, type Diff, type Got, type Up } from '#addons/scenemanager/scenemanager.addon.ts'
import { predicts, rewinding } from '#addons/rewind/rewind.addon.ts'
import type { Accept } from '#addons/loopback/loopback.addon.ts'
import type { Match, Mode } from '../../plugins/match/match.sim.ts'

type Conn = { id: number; mode: Mode; scene: string; seat: number; going: boolean }
type State = {
  conns: Conn[]
  leader: Conn | undefined
  match: Match
  course: string
  message: string
  next: number
  // each scene's seat of the addon's own
  desk: Map<Truth, number>
  dirty: boolean
}

type Attached = { state: State; join(c: Conn): void; leave(c: Conn, close: () => void): void; role(c: Conn, id: number): void }
const held = new WeakMap<Row, Attached>()

// The match on the manager `row`, made and attached the first time: its state, and what a connection
// arriving and one going do.
function attach(row: Row): Attached {
  const had = held.get(row)
  if (had) return had
  const m: State = { conns: [], leader: undefined, match: 'lobby', course: '', message: '', next: 0, desk: new Map(), dirty: true }
  const entry: string = row.data.entry
  const table = new Map(entries(row))
  // the courses: the scenes a seat races on, which seat it by `player`
  const courses = [...table.keys()].filter(name => scene(row, name).scene.plugins?.includes('player'))
  for (const child of scenes(row).values()) {
    const it = child.rows.find(r => r.kind === 'match')
    if (!it) throw new Error(`a scene of the match has no match row`)
    m.desk.set(child, child.open(it.id))
    if (predicts(child.world)) continue
    child.attach({
      show: () => true,
      hide: (seat, r) => (r.kind === 'match' ? Object.keys(r.data).filter(k => /^you\d+$/.test(k) && k !== `you${seat}`) : []),
      accept: () => true,
      advance: () => true,
      spawn: () => {},
    })
  }

  // A message to the `match` row of `child` from the addon's own seat there.
  const tell = (child: Truth, action: string, ...args: Arg[]) => {
    const it = child.rows.find(r => r.kind === 'match')!
    child.inbox(m.desk.get(child)!, { seq: 0, n: child.n, id: it.id, action, args })
  }
  // A connection sent to `to` by its own seat's `go`.
  const go = (c: Conn, to: string, ...args: Arg[]) => {
    const child = scene(row, c.scene)
    const sm = child.rows.find(r => r.kind === 'scenemanager')!
    child.inbox(c.seat, { seq: 0, n: child.n, id: sm.id, action: 'go', args: [to, ...args] })
  }
  const known = (c: Conn) => c.scene !== ''

  const start = (course: string) => {
    const seats = scene(row, course).scene.seats ?? 0
    const lobby = m.conns.filter(c => c.mode === 'lobby' && known(c))
    const racers = lobby.slice(0, seats)
    tell(scene(row, course), 'reset', racers.length)
    for (const c of racers) { c.mode = 'racer'; go(c, course) }
    for (const c of m.conns) if (c.mode === 'lobby') c.mode = 'waiting'
    m.match = 'racing'
    m.course = course
    m.message = 'waiting'
  }
  // Every connection back in the lobby: those on the course sent to the entry.
  const home = (message: string) => {
    for (const c of m.conns) {
      if (known(c) && c.scene === m.course) go(c, entry)
      c.mode = 'lobby'
      c.going = false
    }
    m.match = 'lobby'
    m.course = ''
    m.message = message
  }
  const asked = (where: string, seat: number, what: string, arg: Arg) => {
    const c = m.conns.find(c => c.scene === where && c.seat === seat)
    if (!c) return
    if (what === 'start' && c === m.leader && m.match === 'lobby' && typeof arg === 'string' && courses.includes(arg)) start(arg)
    else if (what === 'spectate' && c.mode === 'waiting' && m.match !== 'lobby' && where !== m.course) { c.going = true; go(c, m.course) }
    else if (what === 'exit' && c === m.leader && m.match === 'results') home('')
  }

  // After every step of the manager, before any connection reads its seat's next scene.
  owner(row).onStep(() => {
    for (const [name, child] of scenes(row)) {
      const it = child.rows.find(r => r.kind === 'match')
      if (!it || rewinding(child) || !it.data.asks.length) continue
      for (const [seat, what, arg] of it.data.asks as [number, string, Arg][]) asked(name, seat, what, arg)
      m.dirty = true
    }
    if (m.match === 'racing' && scene(row, m.course).rows.find(r => r.kind === 'race')?.data.phase === 'results') {
      m.match = 'results'
      m.dirty = true
    }
    if (!m.dirty) return
    m.dirty = false
    const roster = m.conns.filter(known).flatMap(c => [c.id, c.mode, c.scene, c.seat])
    for (const [name, child] of scenes(row)) tell(child, 'hear', name, m.match, m.course, m.leader?.id ?? -1, m.message, ...roster)
  })

  // A connection that arrives and one that goes.
  const join = (c: Conn) => {
    c.mode = m.match === 'lobby' ? 'lobby' : 'waiting'
    m.conns.push(c)
    m.leader ??= c
    m.dirty = true
  }
  const leave = (c: Conn, close: () => void) => {
    m.conns = m.conns.filter(x => x !== c)
    const running = m.match !== 'lobby'
    close()
    if (c === m.leader) {
      m.leader = m.conns[0]
      if (running) home('disconnected')
    }
    m.dirty = true
  }
  const role = (c: Conn, id: number) => tell(scene(row, m.course), 'role', id, c.seat, c.mode)
  const made = { state: m, join, leave, role }
  held.set(row, made)
  return made
}

export function match(row: Row): Accept<Up | Got, Diff> {
  const { state: m, join, leave, role } = attach(row)
  const door = accept(row)
  return send => {
    const c: Conn = { id: m.next++, mode: 'lobby', scene: '', seat: -1, going: false }
    const seat = door(d => {
      if (c.scene !== d.scene || c.seat !== d.seat) {
        c.scene = d.scene
        c.seat = d.seat
        if (c.going && d.scene === m.course) { c.mode = 'spectator'; c.going = false }
        // on the course, the `player` row the seat plays as, the one its first envelope there names
        // `mine`, is told to the course's `match` row as the racer's or the spectator's
        const own = d.add.find(r => r.kind === 'player' && r.data.mine === true)
        if (d.scene === m.course && own && (c.mode === 'racer' || c.mode === 'spectator')) role(c, own.id)
        m.dirty = true
      }
      send(d)
    })
    join(c)
    let gone = false
    return {
      take: up => seat.take(up),
      close() {
        if (gone) return
        gone = true
        leave(c, () => seat.close())
      },
    }
  }
}
