// Team vision, fog of war: a piece on a truth that sends each seat only the rows its team sees. A
// row is sent to a seat when the row is its team's own, or when it stands on a cell a row of its
// team sees, within that seer's sight. A row of a kind the block lists in `always` is sent to every
// seat wherever it is, and so is a row with no place: a manager, the ground, anything that is not a
// thing on the map. A `player` row is the thing its seat plays as, and stands where its place says
// like any other row; its team is the slot in its `seat`. A row that walks out of sight is in the seat's next packet's
// `ended`, and one that walks back in is in its `born`, as if it had been spawned again. Vision
// limits what is sent, never what the rules know: the truth holds every row, and a rule that must
// act only on what a team sees asks `sees`.
//
// It is set from the scene file's `world.vision`, which this addon reads on the server and the
// vision plugin (`plugins/vision`) on the page, where it draws the fog:
//   cell     the world units across a cell, a number above 0;
//   size     [across, down], the cells of the map, whole numbers above 0; a cell off the map is seen
//            by nobody;
//   at       the field holding a row's place, [x, y] or [x, y, h] in world units, `h` never read;
//            its cell is [⌊x / cell⌋, ⌊y / cell⌋];
//   slot     the field holding the slot of the seat a row belongs to, the slot `addons/player` gave
//            that seat; a row without it belongs to no team;
//   teams    optional, each slot's team, a list by slot; left out, each slot is a team of its own;
//   sight    for each kind that sees, how many cells round its own cell it sees: every cell whose
//            middle is within that many cells of its cell's middle;
//   always   kinds sent to every seat, the map's pieces;
// and the plugin's numbers (`layer`, `unexplored`, `explored`, in its own header). A scene whose
// `vision` is of the wrong shape throws when `vision` is called, naming the value.
//
// `addons/player` attaches it to a truth whose scene names the player plugin and has `world.vision`,
// with its seats' slots, when the first seat joins: `vision(truth, slot)`, `slot(seat)` the slot of
// the seat, or undefined for a seat with none, which is sent only the rows with no place and the
// `always` kinds.
//
// A rule asks `sees(w.world, slot, row)`: whether the team of that slot sees the row, its own rows
// always. On a world no vision is attached to, a truth before `addons/player` first seats a seat on
// it, it is true. What a
// team is sent of any rows, with or without a seat, is `visible` over the grids `sight` makes of them,
// which is what `show` asks, and what the editor's Vision panel shows (`vision.extension.tsx`).
//
// When. What a team sees through a step is what it saw as the step began: the grids are made once
// a step, from the rows as they stood before any row of the step ran (the engine's `advance`, or the
// packets sent after the step before, which are made from the same rows), so a rule that asks `sees`
// after another row has moved this step is told what one asking before it is told.
//
// The cost. Each team's cells seen are one byte a cell, made once a step: every row
// of a kind in `sight` stamps its disc of cells into its team's grid, a filled span of bytes a line
// of the disc. Then `show`, which the engine asks of every row for every seat on every packet, is a
// lookup of the row's cell in the seat's team's grid, whatever the number of seers. Measured on
// node 22 on an Apple M1, a map of 40 × 40 cells with two seats, N rows of sight 9 split between
// the two teams at random cells, each a seer:
//   N      the grids, once a step   every row asked, both seats   the obvious way
//   100    0.06 ms                  0.02 ms                       0.19 ms
//   300    0.11 ms                  0.05 ms                       0.59 ms
//   1000   0.36 ms                  0.10 ms                       1.77 ms
// The obvious way is every row checked against the seat's team's seers, stopping at the first that
// sees it, up to N² / 2 distance checks a seat. Both are small beside the packets themselves: the
// engine copies every row it sends, and the two seats' packets took 0.6, 1.8 and 5.8 ms whole.
import type { Row, Truth } from '#engine/engine.ts'

export type Block = {
  cell: number
  size: [number, number]
  at: string
  slot: string
  teams?: unknown[]
  sight: Record<string, number>
  always: string[]
}

type State = { truth: Truth; block: Block; always: Set<string>; n: number; grids: Map<unknown, Uint8Array> }
const states = new WeakMap<object, State>()

/** A row's cell on the map, or -1 when it has no place or stands off the map. */
export function cellOf(block: Block, row: Row): number {
  const p = row.data[block.at]
  if (!Array.isArray(p)) return -1
  const x = Math.floor(p[0] / block.cell), y = Math.floor(p[1] / block.cell), [w, h] = block.size
  return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x
}

/** The team of a slot, or undefined for none. */
export const teamOf = (block: Block, slot: unknown) => (slot === undefined || slot === null ? undefined : block.teams ? block.teams[slot as number] : slot)

// For each sight, the half-width of each line of its disc, from -sight to sight.
const discs = new Map<number, number[]>()
function disc(r: number): number[] {
  let d = discs.get(r)
  if (d) return d
  d = []
  for (let dy = -Math.floor(r); dy <= r; dy++) d.push(Math.floor(Math.sqrt(r * r - dy * dy)))
  discs.set(r, d)
  return d
}

/**
 * Each team's cells seen among `rows`, one byte a cell, 1 where seen, stamped into `into`'s grids
 * when given (cleared first) so a step reuses them. A team with no seer has no grid.
 */
export function sight(block: Block, rows: Row[], into = new Map<unknown, Uint8Array>()): Map<unknown, Uint8Array> {
  const [w, h] = block.size
  for (const g of into.values()) g.fill(0)
  for (const r of rows) {
    const range = block.sight[r.kind]
    if (range === undefined) continue
    const team = teamOf(block, r.data[block.slot])
    const c = cellOf(block, r)
    if (team === undefined || c < 0) continue
    let g = into.get(team)
    if (!g) into.set(team, (g = new Uint8Array(w * h)))
    const cx = c % w, cy = (c / w) | 0, half = disc(range), top = cy - Math.floor(range)
    for (let i = 0; i < half.length; i++) {
      const y = top + i
      if (y < 0 || y >= h) continue
      const x0 = Math.max(0, cx - half[i]), x1 = Math.min(w - 1, cx + half[i])
      g.fill(1, y * w + x0, y * w + x1 + 1)
    }
  }
  return into
}

// The state's grids, made again when the truth has stepped since they were made.
function grids(s: State): Map<unknown, Uint8Array> {
  if (s.n !== s.truth.n) {
    sight(s.block, s.truth.rows, s.grids)
    s.n = s.truth.n
  }
  return s.grids
}

/**
 * Whether the team sees the row, among each team's cells seen (`sight`): its own, one with no place,
 * an `always` kind, or one on a cell its grid holds. `grids` is asked for only when the row's cell
 * decides it.
 */
export function visible(block: Block, always: Set<string>, grids: Map<unknown, Uint8Array> | (() => Map<unknown, Uint8Array>), team: unknown, row: Row): boolean {
  if (!(block.at in row.data) || always.has(row.kind)) return true
  if (team === undefined) return false
  if (teamOf(block, row.data[block.slot]) === team) return true
  const c = cellOf(block, row)
  return c >= 0 && (typeof grids === 'function' ? grids() : grids).get(team)?.[c] === 1
}

// Whether the team sees the row, off the state's grids.
const seen = (s: State, team: unknown, row: Row) => visible(s.block, s.always, () => grids(s), team, row)

/** Whether the team of `slot` sees `row` (the header); true on a world no vision is attached to. */
export function sees(world: object, slot: unknown, row: Row): boolean {
  const s = states.get(world)
  return !s || seen(s, teamOf(s.block, slot), row)
}

export function vision(truth: Truth, slot: (seat: number) => unknown) {
  const b = block(truth)
  const s: State = { truth, block: b, always: new Set(b.always), n: -1, grids: new Map() }
  states.set(truth.world, s)
  truth.attach({
    show: (seat, row) => seen(s, teamOf(s.block, slot(seat)), row),
    hide: () => [],
    accept: () => true,
    // the step's grids, from the rows as the step begins (When)
    advance: () => { grids(s); return true },
    spawn: () => {},
  })
}

// The scene's `world.vision`, checked.
export function block(truth: { world: any; scene: { prefabs: Record<string, unknown> } }): Block {
  const b = truth.world.vision
  const say = (field: string, what: string) => { throw new Error(`vision.${field} is ${JSON.stringify(b?.[field])}: ${what}`) }
  if (typeof b !== 'object' || b === null || Array.isArray(b)) throw new Error(`vision is ${JSON.stringify(b)}: world.vision is an object`)
  const whole = (v: unknown) => Number.isInteger(v) && (v as number) > 0
  if (typeof b.cell !== 'number' || !(b.cell > 0)) say('cell', 'a cell is a number of world units above 0')
  if (!Array.isArray(b.size) || b.size.length !== 2 || !b.size.every(whole)) say('size', 'the size is [across, down] in whole cells')
  if (typeof b.at !== 'string' || b.at === '') say('at', 'at is the name of a field')
  if (typeof b.slot !== 'string' || b.slot === '') say('slot', 'slot is the name of a field')
  if (b.teams !== undefined && !Array.isArray(b.teams)) say('teams', 'teams is a list, a team for each slot')
  if (typeof b.sight !== 'object' || b.sight === null) say('sight', 'sight is each kind that sees and its cells')
  for (const [kind, r] of Object.entries(b.sight))
    if (!(kind in truth.scene.prefabs) || typeof r !== 'number' || !(r >= 0)) say('sight', `${kind} is a kind with a prefab, seeing a number of cells`)
  if (!Array.isArray(b.always) || !b.always.every((k: unknown) => typeof k === 'string' && k in truth.scene.prefabs))
    say('always', 'always lists kinds the scene has prefabs for')
  return b as Block
}
