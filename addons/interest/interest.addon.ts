// Area of interest: a piece on a truth that sends each seat only the rows near it. A row is sent
// when its `pos` is within `radius` of the seat's centre row, measured on x and y. A row whose kind
// the block lists in `always` is sent to every seat wherever it is, and so is a row with no `pos`:
// a manager, a tilemap, anything that is not a thing on the ground. A `player` row is the thing its
// seat plays as and is sent by its `pos` like any other row; without `at`, the seat's centre is its
// own `player` row. A row that walks
// out of the radius is in the seat's next packet's `ended`, and one that walks back in is in its
// `born`, as if it had been spawned again.
//
// It is set from the scene file's top-level block `"interest": { "radius": <cells>, "always":
// [kinds], "at": "<field>" }`, where `at` may be left out. `radius` is in world units, cells, a
// number above 0, and a row at exactly `radius` is sent. `always` names kinds the scene has
// prefabs for. `pos` is a row's `data.pos`, [x, y] or [x, y, h] in cells, and `h` is never read. A
// scene with no block, a field the block does not hold, or a value of the wrong shape throws when
// `interest` is called, naming the value.
//
// The engine does not say which row a seat possesses, so the caller hands `interest` the lookup,
// `possessed(seat)`. Without `at` the centre is the possessed row itself. With `at` it is the row
// whose id the possessed row holds in its `data[at]`: a seat possesses a `player` row, which names
// the `hero` that walks. A seat whose centre row does not exist, or has no `pos`, is sent only the
// `always` kinds and the rows with no `pos`.
//
// Each check is one distance compare against the seat's centre. The engine asks `show` of every
// row for every seat on every packet, so the cost is that many compares whatever the piece does;
// the centre is looked up once per seat per step, at the step's first packet for that seat, not
// once per row. The centre row is kept and its `pos` read at each check, so a centre that moves
// between two packets of one step is measured where it is. There is no spatial grid: a grid answers
// "which rows are near this point" without looking at the rest, and the engine never asks that, it
// asks "is this row near" of every row. A grid pays only in code that walks a row's neighbours.
import type { Row, Truth } from '#engine/engine.ts'

type Block = { radius: number; always: Set<string>; at: string | undefined }

export function interest(truth: Truth, possessed: (seat: number) => Row | undefined) {
  const { radius, always, at } = block(truth)
  const reach = radius * radius
  const centres = new Map<number, { n: number; row: Row | undefined }>()
  const centre = (seat: number) => {
    let known = centres.get(seat)
    if (known?.n !== truth.n) {
      const own = possessed(seat)
      const row = at === undefined || own === undefined ? own : truth.rows.find(r => r.id === own.data[at])
      centres.set(seat, known = { n: truth.n, row })
    }
    return known.row
  }
  truth.attach({
    show: (seat, row) => {
      const pos = row.data.pos
      if (pos === undefined || always.has(row.kind)) return true
      const here = centre(seat)?.data.pos
      if (here === undefined) return false
      const dx = pos[0] - here[0], dy = pos[1] - here[1]
      return dx * dx + dy * dy <= reach
    },
    hide: () => [],
    accept: () => true,
    advance: () => true,
    spawn: () => {},
  })
}

// The scene file's `interest` block, checked.
function block(truth: Truth): Block {
  const b = truth.scene.interest
  if (b === undefined) throw new Error('a scene given interest has no interest block')
  if (typeof b !== 'object' || b === null || Array.isArray(b)) throw new Error(`interest is ${JSON.stringify(b)}: the block is an object`)
  const { radius, always, at, ...rest } = b as Record<string, unknown>
  const stray = Object.keys(rest)[0]
  if (stray !== undefined) throw new Error(`interest.${stray} is not a field: the block holds radius, always and at`)
  if (typeof radius !== 'number' || !Number.isFinite(radius) || radius <= 0)
    throw new Error(`interest.radius is ${JSON.stringify(radius)}: a radius is a number of cells above 0`)
  if (!Array.isArray(always)) throw new Error(`interest.always is ${JSON.stringify(always)}: always is a list of kinds`)
  for (const kind of always)
    if (typeof kind !== 'string' || !(kind in truth.scene.prefabs))
      throw new Error(`interest.always names ${JSON.stringify(kind)}: always lists kinds the scene has prefabs for`)
  if (at !== undefined && (typeof at !== 'string' || at === ''))
    throw new Error(`interest.at is ${JSON.stringify(at)}: at is the name of a field`)
  return { radius, always: new Set(always), at }
}
