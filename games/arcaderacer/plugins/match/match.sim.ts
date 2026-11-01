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
//   leader     the id the addon gave the leader's connection, −1 with nobody there.
//   message    what the lobby is told, a key of the `match` definition's `messages`, or ''.
//   roster     every connection in join order, each { id, mode, scene, seat }: the id the addon gave
//              it, its mode (`lobby`, `waiting`, `racer` or `spectator`), the scene its seat is on
//              and its seat number there.
//   asks       what seats asked of the match since the last `hear`, each [seat, what, arg], which the
//              addon answers after the step: `start` with a course, `spectate`, `exit`.
//   you<n>     on a scene nobody runs ahead (the title), `n` for each seat `n` on it, which the addon
//              sends to seat `n` alone, so a page with no row of its own finds its seat (`seatOf`).
//
// The acts. The addon's, closed: `hear(scene, match, course, leader, message, ...roster)`, the roster
// flat as id, mode, scene, seat for each connection; `reset(racers)`, the course started over for a race
// of `racers` seats; `role(id, seat, role)`, the `player` row `id` of seat `seat`, which the addon sent
// to this course, once: the row's `conn` is `seat`, the seat the roster names its connection by; as
// `racer` a `car` is made on the grid place of the `start` of the row's slot (its `seat`) and the row
// takes hold of it (`take` in `plugins/player`), and as `spectator` the row's `watch` is −1, the free
// camera. A page's, open, each written into `asks` for the addon: `start(course)`, `spectate()`
// and `exit()`.
//
// A racer's seat that leaves ends its `player` row, and with it the hold: its car stands on with no
// control (`car.sim.ts`).
//
// The functions the kinds call: `watch(me, w, target)`, a spectator's own row choosing the free camera
// (−1) or a car a racer holds to follow; `leaderCar(w)`, the leader's car on this course, whose finish
// ends the race. And for a page, from the rows it was sent: `seatOf(rows)`, its seat on the scene;
// `entryOf(rows)`, its connection's roster entry; `leads(rows)`, whether it is the leader;
// `driven(rows)`, the cars a racer holds.
//
// Its numbers are the `match` definition's (the page side, `match.plugin.ts`).
import type { Arg, Kind, Row, W } from '#engine/engine.ts'
import { possessed } from '#addons/player/player.addon.ts'
import { holderOf, holding, take, type Holds } from '#plugins/player/player.sim.ts'

export type Match = 'lobby' | 'racing' | 'results'
export type Mode = 'lobby' | 'waiting' | 'racer' | 'spectator'
export type Entry = { id: number; mode: Mode; scene: string; seat: number }

// The scene's `actors` entries of a kind, each as the fields it writes over its prefab.
const entries = (w: W, kind: string) => (w.world.scenemanager.actors as { is: string }[])
  .filter(a => a.is === kind)
  .map(({ is: _, ...fields }) => fields)

const ask = (me: Row, seat: number, what: string, arg: Arg = null) => { me.data.asks = [...me.data.asks, [seat, what, arg]] }

export const match: Kind = {
  acts: {
    hear(me, w, _seat, scene: string, mode: Match, course: string, leader: number, message: string, ...flat: Arg[]) {
      const roster: Entry[] = []
      for (let k = 0; k < flat.length; k += 4) roster.push({ id: flat[k] as number, mode: flat[k + 1] as Mode, scene: flat[k + 2] as string, seat: flat[k + 3] as number })
      Object.assign(me.data, { scene, match: mode, course, leader, message, roster, asks: [] })
      for (const key of Object.keys(me.data)) if (/^you\d+$/.test(key)) delete me.data[key]
      if (w.world.predict === undefined) for (const e of roster) if (e.scene === scene) me.data[`you${e.seat}`] = e.seat
    },
    reset(_me, w, _seat, racers: number) {
      for (const r of [...w.all('player'), ...w.all('car'), ...w.all('rival'), ...w.all('race')]) w.end(r)
      // the racers take the grid places of the starts of the first `racers` slots; rivals take the rest
      const taken = new Set(w.all('start').filter(s => s.data.slot < racers).map(s => s.data.grid))
      for (const fields of entries(w, 'race')) w.spawn('race', fields)
      for (const fields of entries(w, 'rival')) if (!taken.has((fields as { grid: number }).grid)) w.spawn('rival', fields)
    },
    role(_me, w, _seat, id: number, seat: number, role: string) {
      const it = w.all('player').find(r => r.id === id)
      if (!it || it.data.conn >= 0) return
      it.data.conn = seat
      if (role === 'racer') take(it, w, w.spawn('car', { grid: w.find('start', s => s.data.slot === it.data.seat).data.grid }))
      if (role === 'spectator') it.data.watch = -1
    },
    start(me, _w, seat, course: unknown) {
      if (typeof course === 'string') ask(me, seat, 'start', course)
    },
    spectate(me, _w, seat) {
      ask(me, seat, 'spectate')
    },
    exit(me, _w, seat) {
      ask(me, seat, 'exit')
    },
  },
  open: ['start', 'spectate', 'exit'],
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

// The leader's car on this course, while its seat holds it.
export function leaderCar(w: W): Row | undefined {
  const m = w.find('match').data
  const e = (m.roster as Entry[]).find(e => e.id === m.leader)
  if (!e || e.scene !== m.scene) return
  const driver = w.all('player').find(r => r.data.conn === e.seat)
  return driver && holding(w, driver)
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
