// The server half of particle3d: the ledger of the effects the rules have spawned in the world. A particle is
// drawn and never read by a rule, and every row goes to every seat in every packet, so no particle
// is a row: a rule says once which effect, where and for how long, and each page draws the rest
// (`particle3d.plugin.ts`, which holds the effects themselves, what every field of a spawn means, and the
// page's own ledger).
//
// The one row of this kind is the ledger. Its prefab is `next`, the id the next entry gets, and
// `live`, the entries, and nothing else, since a prefab field goes onto the row and a row goes to
// every seat every step. A field of the row that is neither throws, naming it, in its `before`. The
// fixed numbers are `world.particle3d`: `effects`, the name in the scene's `loader` catalogue of the data
// file that holds every effect (the browser half reads it; this half never does), and `hold`.
//
// `emit(w, effect, at, spawn)` adds an entry: the effect's name, its point `at` in the world, [x, y, z]
// in metres with y up,
// `age`, and from `spawn` its `life` (the seconds it goes on emitting, 0 for one burst), and a `dir`,
// `to`, `tint`, `scale`, `floor`, `from`, `fly` and `land` when given. With `fly`, its `life` is the
// seconds its point takes to be carried from `at` to `to`. It hands the entry back. A rule that keeps
// its id finds it again with `entry(w, id)`, undefined once it has left the row, and moves it by
// writing its `at` or stops it by writing its `life`: a page follows an entry for as long as the row
// holds it.
//
// Each step ages every entry and drops the ones past their life, or past `hold` when that is
// longer. A page reads only the last packet's rows each frame, so an entry on the row for a single
// step is missed whenever two packets land in one frame; `hold` is how long an entry stays so that
// every page sees it. The ageing is in `before`, so an entry emitted in a tick or an after is sent
// at age 0. An entry `from` a row stays for as long as that row is there, so a page that comes later
// still draws it; in the first `before` after the row has gone, the entry's `from` is dropped and its
// `life` is its age, so every page ends it.
import type { Kind, W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'

export type Spawn = {
  life?: number; dir?: number[]; to?: number[]; tint?: number; scale?: number; floor?: number
  from?: number; fly?: number; land?: Land[]
}
// An effect thrown where another lands, and its spawn.
export type Land = Spawn & { effect: string; seed?: number }
export type Entry = Spawn & { id: number; effect: string; at: number[]; age: number; life: number }

// The seconds an effect that flies at `fly` takes from `at` to `to`, a point's missing number 0.
export const flight = (name: string, at: number[], to: number[] | undefined, fly: number) => {
  if (!to) throw new Error(`particle3d effect ${name} flies and was spawned with no to`)
  return math.hypot(...[0, 1, 2].map(i => (to[i] ?? 0) - (at[i] ?? 0))) / fly
}

// Whether the scene has row `id`.
const holds = (w: W, id: number) => {
  try {
    w.get(id)
    return true
  } catch {
    return false
  }
}

export const particle3d: Kind = {
  before(me, dt, w) {
    const d = me.data
    for (const k of Object.keys(d)) if (!['next', 'live'].includes(k)) throw new Error(`the particle3d prefab has ${k}, which particle3d does not know`)
    for (const e of d.live as Entry[]) {
      e.age += dt
      if (e.from !== undefined && !holds(w, e.from)) {
        delete e.from
        e.life = e.age
      }
    }
    d.live = (d.live as Entry[]).filter(e => e.from !== undefined || e.age < Math.max(e.life, w.world.particle3d.hold))
  },
}

const ledgerOf = (w: W) => {
  const rows = w.all('particle3d')
  if (rows.length !== 1) throw new Error(`particle3d needs one ledger row, and the scene has ${rows.length}`)
  return rows[0].data
}

export const entry = (w: W, id: number): Entry | undefined => (ledgerOf(w).live as Entry[]).find(e => e.id === id)

export function emit(w: W, effect: string, at: number[], spawn: Spawn = {}): Entry {
  const ledger = ledgerOf(w)
  const entry: Entry = { id: ledger.next++, effect, at: [...at], age: 0, life: spawn.life ?? 0 }
  if (spawn.dir) entry.dir = [...spawn.dir]
  if (spawn.to) entry.to = [...spawn.to]
  if (spawn.tint !== undefined) entry.tint = spawn.tint
  if (spawn.scale !== undefined) entry.scale = spawn.scale
  if (spawn.floor !== undefined) entry.floor = spawn.floor
  if (spawn.from !== undefined) entry.from = spawn.from
  if (spawn.fly !== undefined) {
    entry.fly = spawn.fly
    entry.life = flight(effect, at, spawn.to, spawn.fly)
  }
  if (spawn.land) entry.land = structuredClone(spawn.land)
  ledger.live.push(entry)
  return entry
}
