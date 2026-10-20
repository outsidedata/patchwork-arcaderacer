// The rule half of the player: a seat's thing taking hold of rows that are not it. It has no row and
// no hook; it is functions a game's `player` kind calls on its own row, and a held kind calls on its
// own, and nothing in a scene that never calls them changes (`designing-a-seat`, When the seat
// controls more than one kind).
//
// A seat possesses its `player` row from the moment it opens until it leaves (`open` in
// `engine/engine.ts`), and every press it sends lands there. So the `player` row stays the seat's
// thing, the body, the driver, the rider, and takes hold of other rows that stand in the world without
// it: a vehicle, a mount, a turret. The row it holds is its `held` field, `{ kind, id }`, or absent
// or null while it holds nothing, so a `player` prefab that never names it holds nothing. It is not
// `holds`, which anim writes on every row it plays (`plugins/anim/anim.sim.ts`), as a `player` row
// that is a body is.
//
//   take(me, w, row)   `me` takes hold of `row`, and true; false, and nothing changes, when `me`
//                      already holds a row, when `row` is a `player` row, or when another `player`
//                      row holds it: a row is held by one seat at most.
//   letGo(me)          `me` holds nothing.
//   holding(w, me)     the row `me` holds, or undefined when it holds none or the row it held has
//                      ended (a held row that ends lets go of its holder by being gone).
//   holderOf(w, row)   the `player` row that holds `row`, or undefined.
//   relay(table)       acts for the `player` kind that pass a press on to the row it holds:
//                      `{ <held kind>: [<act>, …] }`, each act the held kind has. A press of one is
//                      `w.call` on the held row with the seat and args as they came, when the row held
//                      is of a kind that lists it, and nothing otherwise, so a press for a car while
//                      on foot, or while holding a turret, is a press at the wrong moment and not an
//                      error. The held kind keeps those acts out of its `open`, so the only way a seat
//                      reaches them is through the `player` row that holds it, and each checks its
//                      args, as an act a seat sends does.
//
// Taking hold and letting go are the game's acts on its `player` row, which check what only the game
// knows (in reach, slow enough, a door free) and then call these. A row nobody holds is the held
// kind's to rest or to drive itself: its rule asks `holderOf` each step. A seat that leaves ends its
// `player` row, and with it the hold.
//
// A page that runs ahead (`addons/predict`) runs every rule on its copy, so `take`, `letGo` and every
// relayed press land on the same step there as on the server, and the held row answers the keys on
// the next frame as the `player` row does. The page finds the row it holds with `holding(rows)`
// (`player.plugin.ts`).
import type { Act, Row, W } from '#engine/engine.ts'

export type Holds = { kind: string; id: number }

const heldOf = (me: Row): Holds | undefined => (me.data.held ? me.data.held as Holds : undefined)

export function holding(w: W, me: Row): Row | undefined {
  const h = heldOf(me)
  return h ? w.all(h.kind).find(r => r.id === h.id) : undefined
}

export function holderOf(w: W, row: Row): Row | undefined {
  return w.all('player').find(p => {
    const h = heldOf(p)
    return h !== undefined && h.id === row.id && h.kind === row.kind && holding(w, p) !== undefined
  })
}

export function take(me: Row, w: W, row: Row): boolean {
  if (row.kind === 'player' || holding(w, me) || holderOf(w, row)) return false
  me.data.held = { kind: row.kind, id: row.id } satisfies Holds
  return true
}

export function letGo(me: Row) {
  me.data.held = null
}

export function relay(table: Record<string, string[]>): Record<string, Act> {
  const acts: Record<string, Act> = {}
  for (const name of new Set(Object.values(table).flat())) {
    acts[name] = (me, w, seat, ...args) => {
      const it = holding(w, me)
      if (it && table[it.kind]?.includes(name)) w.call(it, name, seat, ...args)
    }
  }
  return acts
}
