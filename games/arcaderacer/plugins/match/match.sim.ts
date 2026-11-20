// match: who races in arcaderacer, as every scene sees it. One `match` row stands in the title and in
// each course, an `actors` entry of each scene, and the match addon (`addons/match`) keeps it: it holds
// every truth there is about the match, and broadcasts each change to the `match` row of every scene by
// the row's closed act `hear`, sent from a seat of the addon's own that possesses the row, so no page can
// send it. Every seat is sent the row, so every page knows what is going on, and rules read it.
//
// The row's fields (its prefab):
//   scene      the scene this row stands in, as the manager's table names it.
//   match      `lobby`, `racing` or `results`: the match's mode.
//   course     the course the match is racing on, '' in the lobby.
//   chosen     in the lobby, the course the leader has chosen for the match, '' until it has; every seat is
//              shown it, so each knows what it is picking a car for.
//   solo       whether this is one player in one tab (`index.html`, the addon's `solo`): no roster,
//              START, staging list or countdown is shown, and a pick starts the race.
//   leader     the id the addon gave the leader's connection, −1 with nobody there.
//   message    what the lobby is told, a key of the `match` definition's `messages`, or ''.
//   roster     every connection in join order, each { id, mode, scene, seat, car }: the id the addon
//              gave it, its mode (`lobby`, `waiting`, `racer` or `spectator`), the scene its seat is on,
//              its seat number there, and the car it picked on the title's car select, a car of the
//              `match` definition's `cars`, or '' while it has picked none.
//   grids      on a course, the grid place each racer's slot drives from, dealt at `reset`: the grid place of
//              its `start`, or solo the last places on the grid, so the one player starts last.
//   spare      on a course, the cars dealt at `reset` to the racers that picked none, each taken by the
//              next such racer's `role`.
//   asks       what seats asked of the match since the last `hear`, each [seat, what, arg], which the
//              addon answers after the step: `choose` with a course, `pick` with a car, `start`, `spectate`,
//              `exit`.
//   you<n>     on a scene nobody runs ahead (the title), `n` for each seat `n` on it, which the addon
//              sends to seat `n` alone, so a page with no row of its own finds its seat (`seatOf`).
//
// The acts. The addon's, closed: `hear(scene, match, course, leader, message, chosen, solo, ...roster)`, the
// roster flat as id, mode, scene, seat, car for each connection; `reset(racers, ...picks)`, the course
// started over for a race of `racers` seats, `picks` the car each of them picked ('' for none), its race
// row staged (`staging`); `role(id, seat, role, car)`, the `player` row `id` of seat `seat`, which the addon
// sent to this course, once: the row's `conn` is `seat`, the seat the roster names its connection by; as
// `racer` a `car` of the car `car` is made on the grid place `grids` deals the row's slot (its `seat`),
// or of the first `spare` car when `car` is '', and the row takes hold of it (`take` in `plugins/player`),
// and as `spectator` the row's `watch` is −1, the free camera. A page's, open, each written into `asks` for
// the addon: `choose(course)` the leader's course, `pick(car)` with a car of the `match` definition's
// `cars`, `start()` the leader's, once every seat that would race has picked a car, `spectate()` and
// `exit()` any seat's on the course at the results.
//
// Staging. A race the match starts is on its `staging` phase until every racer the roster names has
// reached the course and its page has said its art is in (`ready` on its `player` row, `pending`), or the
// race definition's `wait` seconds have passed; only then does the grid hold and the countdown begin, so
// every seat is looking at the course when the lights go.
//
// The cars dealt at `reset` (`deal`): the `match` definition's `cars` that no racer picked, in the list's
// order, then the whole list again from its start, as many times round as it takes. The racers that
// picked none are dealt theirs first, into `spare`, then each rival its own, in the order the scene lists
// them. So with as many cars as grid places no car is on the grid twice.
//
// A racer's seat that leaves ends its `player` row, and with it the hold: its car stands on with no
// control (`car.sim.ts`).
//
// The functions the kinds call: `watch(me, w, target)`, a spectator's own row choosing the free camera
// (−1) or a car a racer holds to follow; `humans(w)`, the cars the seats on this course hold, whose
// finishes end the race (`race.sim.ts`); `staged(w)`, whether staging has nothing left to wait on. And for
// a page, from the rows it was sent: `seatOf(rows)`, its seat on the scene; `entryOf(rows)`, its
// connection's roster entry; `leads(rows)`, whether it is the leader; `driven(rows)`, the cars a racer
// holds; `pending(rows)`, the racers staging still waits on; `numberOf(roster, entry)`, a connection's
// place in join order from 1, which names it "PLAYER n" on the lobby and the staging screens.
//
// Its numbers are the `match` definition's (the page side, `match.plugin.ts`).
import type { Arg, Kind, Row, W } from '#engine/engine.ts'
import { possessed } from '#addons/player/player.addon.ts'
import { holderOf, holding, take, type Holds } from '#plugins/player/player.sim.ts'
import { def } from '#plugins/loader/loader.sim.ts'

export type Match = 'lobby' | 'racing' | 'results'
export type Mode = 'lobby' | 'waiting' | 'racer' | 'spectator'
export type Entry = { id: number; mode: Mode; scene: string; seat: number; car: string }
// the fields of one connection in `hear`'s flat roster
const ENTRY = 5

// The cars dealt after the racers' `picks` (the header): those of `cars` none picked, then `cars` round
// again, one each call.
export function deal(cars: string[], picks: string[]): () => string {
  const first = cars.filter(c => !picks.includes(c))
  let k = 0
  return () => {
    const car = k < first.length ? first[k] : cars[(k - first.length) % cars.length]
    k++
    return car
  }
}

// The scene's `actors` entries of a kind, each as the fields it writes over its prefab.
const entries = (w: W, kind: string) => (w.world.scenemanager.actors as { is: string }[])
  .filter(a => a.is === kind)
  .map(({ is: _, ...fields }) => fields)

const ask = (me: Row, seat: number, what: string, arg: Arg = null) => { me.data.asks = [...me.data.asks, [seat, what, arg]] }

export const match: Kind = {
  acts: {
    hear(me, w, _seat, scene: string, mode: Match, course: string, leader: number, message: string, chosen: string, solo: boolean, ...flat: Arg[]) {
      const roster: Entry[] = []
      for (let k = 0; k < flat.length; k += ENTRY) roster.push({ id: flat[k] as number, mode: flat[k + 1] as Mode, scene: flat[k + 2] as string, seat: flat[k + 3] as number, car: flat[k + 4] as string })
      Object.assign(me.data, { scene, match: mode, course, leader, message, chosen, solo, roster, asks: [] })
      for (const key of Object.keys(me.data)) if (/^you\d+$/.test(key)) delete me.data[key]
      if (w.world.predict === undefined) for (const e of roster) if (e.scene === scene) me.data[`you${e.seat}`] = e.seat
    },
    reset(me, w, _seat, racers: number, ...picks: string[]) {
      for (const r of [...w.all('player'), ...w.all('car'), ...w.all('rival'), ...w.all('race')]) w.end(r)
      // the racers take the grid places of the starts of the first `racers` slots, solo the last `racers`
      // grid places, slot 0 the first of them; rivals take the rest
      const starts = w.all('start').filter(s => s.data.slot < racers).sort((a, b) => a.data.slot - b.data.slot)
      const back = w.all('start').map(s => s.data.grid as number).sort((a, b) => a - b).slice(-racers)
      me.data.grids = starts.map((s, k) => (me.data.solo ? back[k] : s.data.grid))
      const taken = new Set(me.data.grids as number[])
      const next = deal(def(w, me.kind).cars, picks)
      me.data.spare = picks.filter(p => p === '').map(() => next())
      for (const fields of entries(w, 'race')) w.spawn('race', { ...fields, phase: 'staging' })
      for (const fields of entries(w, 'rival')) if (!taken.has((fields as { grid: number }).grid)) w.spawn('rival', { ...fields, car: next() })
    },
    role(me, w, _seat, id: number, seat: number, role: string, car: string) {
      const it = w.all('player').find(r => r.id === id)
      if (!it || it.data.conn >= 0) return
      it.data.conn = seat
      if (role === 'racer') {
        const drives = car === '' ? me.data.spare[0] : car
        if (car === '') me.data.spare = me.data.spare.slice(1)
        take(it, w, w.spawn('car', { car: drives, grid: me.data.grids[it.data.seat] }))
      }
      if (role === 'spectator') it.data.watch = -1
    },
    choose(me, _w, seat, course: unknown) {
      if (typeof course === 'string') ask(me, seat, 'choose', course)
    },
    start(me, _w, seat) {
      ask(me, seat, 'start')
    },
    pick(me, w, seat, car: unknown) {
      if (typeof car === 'string' && def(w, me.kind).cars.includes(car)) ask(me, seat, 'pick', car)
    },
    spectate(me, _w, seat) {
      ask(me, seat, 'spectate')
    },
    exit(me, _w, seat) {
      ask(me, seat, 'exit')
    },
  },
  open: ['choose', 'start', 'pick', 'spectate', 'exit'],
}

// A spectator's own row choosing what it watches: −1 the free camera, or a car a racer holds to follow.
export function watch(me: Row, w: W, target: unknown) {
  if (me.data.watch === null) return
  if (target === -1) me.data.watch = -1
  else if (typeof target === 'number') {
    const car = w.all('car').find(c => c.id === target)
    if (car && holderOf(w, car)) me.data.watch = target
  }
}

// The cars the seats on this course hold: one for each racer still here.
export function humans(w: W): Row[] {
  return w.all('player').flatMap(p => holding(w, p) ?? [])
}

// The racers the roster names that staging still waits on: each that has not reached this course, or has
// reached it and whose page has not said its art is in (`ready` on its `player` row). Nobody before the
// match has told this course it is racing, since the roster is not yet known.
export function pending(rows: Row[]): Entry[] | undefined {
  const m = rows.find(r => r.kind === 'match')
  if (m?.data.match !== 'racing') return
  const players = rows.filter(r => r.kind === 'player')
  return (m.data.roster as Entry[]).filter(e => e.mode === 'racer' && !(e.scene === m.data.scene && players.some(p => p.data.conn === e.seat && p.data.ready)))
}

// Whether staging has nothing left to wait on, as the race row reads it.
export function staged(w: W): boolean {
  return pending(w.all('player').concat(w.all('match')))?.length === 0
}

// A connection's place in join order from 1: the roster is in join order.
export function numberOf(roster: Entry[], entry: Entry): number {
  return roster.findIndex(e => e.id === entry.id) + 1
}

// The cars a racer holds, among the rows a page was sent.
export function driven(rows: Row[]): Row[] {
  const held = new Set(rows.filter(r => r.kind === 'player' && r.data.held).map(r => (r.data.held as Holds).id))
  return rows.filter(r => r.kind === 'car' && held.has(r.id))
}

// A page's seat on the scene, from the rows it was sent: on a course its own `player` row's `conn`, once
// `role` has told it, and on the title the one `you<n>` the addon sends it.
export function seatOf(rows: Row[]): number | undefined {
  const m = rows.find(r => r.kind === 'match')
  if (!m) return
  const own = possessed(rows)
  if (own) return own.data.conn >= 0 ? own.data.conn : undefined
  const key = Object.keys(m.data).find(k => /^you\d+$/.test(k))
  return key === undefined ? undefined : m.data[key]
}

// A page's connection, as the roster has it.
export function entryOf(rows: Row[]): Entry | undefined {
  const m = rows.find(r => r.kind === 'match')
  const seat = seatOf(rows)
  if (!m || seat === undefined) return
  return (m.data.roster as Entry[]).find(e => e.scene === m.data.scene && e.seat === seat)
}

// Whether a page's connection is the leader.
export const leads = (rows: Row[]) => {
  const m = rows.find(r => r.kind === 'match')
  return !!m && entryOf(rows)?.id === m.data.leader
}
