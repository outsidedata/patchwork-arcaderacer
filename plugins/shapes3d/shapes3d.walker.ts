// shapes3d's mod for walker (`addons/scenemanager`'s mods). A scene with `world.walker.mods: { fixed:
// 'shapes3d', behaviors: 'shapes3d' }` has walker's bodies walk round shapes3d's shapes.
//
// `fixed(w, x, z, r)` is every shape whose footprint reaches within r of (x, z): they never move.
// `behaviors()` delivers walker `box`, a box's footprint, its four corners with no rounding (`corners`);
// walker has `cylinder` of its own.
//
// `ground(w, feet, k)` is shapes3d as the ground itself: the ground a body whose feet stand at y =
// `feet` walks on, for its rule to hand walker's `walk`, `slide`, `carry` and `seek` in place of
// `groundOf`, with `k` the body's walker numbers (`numbers`). Its `height` over (x, z) is the top of
// the highest shape there no more than the body's `step` above its feet, each word's `top`, or the land
// under the shapes (`land`, `world.shapes3d.mods.height`) where that is higher or no shape covers it.
// Its `solids` are every shape that stands in the way, a cylinder or a box, whose top rises past that
// and whose underside starts below the body's head (`feet` + `height`): the body walks round it. So a
// body steps up a stair of boxes, walks up a tilted plane, walks under a box raised over its head on
// the land below, and once it has climbed onto that box, stands on it. A scene whose rules walk on it
// names shapes3d in `world.walker.mods.behaviors`, for the boxes' footprints, and not in `fixed`, which
// would hand walker every box as a wall.
//
// Walker asks the ground many times a step for every body, each time about a place near that body, so
// this mod reads a truth's shapes once, the first time it is asked, since none moves (`standing`): every
// one in `shapes`' order, the top over each one's middle for one that stands in the way, and by each
// square of the ground SQUARE metres a side the shapes whose footprint's box (its middle, and the most it
// reaches from it) takes in some of that square. `height` reads the shapes of the square (x, z) is in,
// and `solids` and `fixed` those of the squares within r, in `shapes`' order: every shape whose footprint
// covers the place or reaches within r is among them, so each answers as it would over every shape, and
// a body on a ground of a thousand shapes reads the few round it. A shape moved (`move`) has the truth's
// shapes read again, the next time any is asked.
//
// The ground's `footing(pos, yaw)` is where a body standing at `pos` is now that the shape under it has
// moved: the highest shape `move` moved whose top, where it stood before (its row's `was`), over (pos x,
// pos z) is at the body's feet or no more than its `step` under them (a body stood across a slope stands
// over its middle's top). The body's point in that shape's frame as it stood is put back through the
// shape as it stands now, by quaternions, so a tilt and a roll carry it as a turn does, and its yaw is
// the heading its facing is turned to by the shape's turn. Undefined on any other ground, so a body on
// the land or a still shape is left as it is.
import type { W } from '#engine/engine.ts'
import type { Behavior, Ground, Numbers } from '#plugins/walker/walker.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { conj, corners, land, moves, mul, rotate, shapes, turnOf, words, type Placed } from './shapes3d.sim.ts'

// A top at the body's reach to the rounding of the sums, as walker's own step rule takes it.
const TOLERANCE = 1e-9
const SQUARE = 2

// A truth's shapes as walker reads them: `placed`, every one in `shapes`' order; `crown`, the top over
// the middle of each one that stands in the way; and `squares`, by square, the places in `placed` of the
// shapes whose footprint's box takes in some of it.
type Standing = { placed: Placed[]; crown: (number | undefined)[]; squares: Map<number, number[]>; moves: number }
const stood = new WeakMap<object, Standing>()
const squareOf = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768)

function standing(w: W): Standing {
  let s = stood.get(w.world)
  if (s && s.moves === moves(w)) return s
  const placed = shapes(w)
  const squares = new Map<number, number[]>()
  const crown = placed.map((p, n) => {
    const shape = p.shape[p.word], known = words[p.word]
    const { x, z, reach } = known.middle(shape)
    for (let i = Math.floor((x - reach) / SQUARE); i <= Math.floor((x + reach) / SQUARE); i++) {
      for (let j = Math.floor((z - reach) / SQUARE); j <= Math.floor((z + reach) / SQUARE); j++) {
        const k = squareOf(i, j)
        const there = squares.get(k)
        if (there) there.push(n)
        else squares.set(k, [n])
      }
    }
    return known.base ? known.top(shape, x, z) : undefined
  })
  stood.set(w.world, (s = { placed, crown, squares, moves: moves(w) }))
  return s
}

// The places in `placed`, in its order, of the shapes of the squares within r of (x, z).
function around(s: Standing, x: number, z: number, r: number): number[] {
  const i0 = Math.floor((x - r) / SQUARE), i1 = Math.floor((x + r) / SQUARE)
  const j0 = Math.floor((z - r) / SQUARE), j1 = Math.floor((z + r) / SQUARE)
  if (i0 === i1 && j0 === j1) return s.squares.get(squareOf(i0, j0)) ?? []
  const found = new Set<number>()
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const n of s.squares.get(squareOf(i, j)) ?? []) found.add(n)
  return [...found].sort((a, b) => a - b)
}

// Whether the shape at `n` reaches within r of (x, z), and is no plane.
const reaches = (s: Standing, n: number, x: number, z: number, r: number) => {
  const p = s.placed[n], known = words[p.word]
  return known.base !== undefined && known.gap(p.shape[p.word], x, z) <= r
}

export function fixed(w: W, x: number, z: number, r: number) {
  const s = standing(w)
  return around(s, x, z, r).filter(n => reaches(s, n, x, z, r)).map(n => s.placed[n].shape)
}

export const behaviors = (): Record<string, Behavior> => ({ box: b => ({ points: corners(b), round: 0 }) })

export function ground(w: W, feet: number, k: Pick<Numbers, 'step' | 'height'>): Ground {
  const reach = feet + k.step + TOLERANCE, head = feet + k.height
  const under = land(w)
  const s = standing(w)
  // Whether the shape at `n` stands in the way of this body: its top, the same over all of it, past its
  // reach, and its underside under its head.
  const wall = (n: number) => {
    const p = s.placed[n]
    return words[p.word].base!(p.shape[p.word]) < head && s.crown[n]! > reach
  }
  return {
    height(x, z) {
      let y = under(w, x, z)
      for (const n of around(s, x, z, 0)) {
        const p = s.placed[n]
        const t = words[p.word].top(p.shape[p.word], x, z)
        if (t !== undefined && t <= reach && t > y) y = t
      }
      return y
    },
    solids: (x, z, r) => around(s, x, z, r).filter(n => reaches(s, n, x, z, r) && wall(n)).map(n => s.placed[n].shape),
    footing: (pos, yaw) => footing(w, s, pos, yaw, k.step),
  }
}

// Where a body at `pos` facing `yaw` is carried by the moved shape whose top it stood on (`ground`).
function footing(w: W, s: Standing, pos: number[], yaw: number, step: number): { pos: number[]; yaw: number } | undefined {
  let on: { row: ReturnType<W['get']>; was: number[]; top: number } | undefined
  for (const p of s.placed) {
    const row = w.get(p.id)
    const was = row.data.was as number[] | null | undefined
    if (!was) continue
    // The shape as it stood the step before.
    const before = { ...p.shape[p.word], pos: [was[0], was[1], was[2]], ...(was.length === 7 ? { rot: was.slice(3) } : { yaw: was[3] }) }
    const t = words[p.word].top(before, pos[0], pos[2])
    if (t === undefined || t > pos[1] + TOLERANCE || t < pos[1] - step || (on && t <= on.top)) continue
    on = { row, was, top: t }
  }
  if (!on) return undefined
  const { row, was } = on
  const from = was.length === 7 ? was.slice(3) : [0, math.sin(was[3] / 2), 0, math.cos(was[3] / 2)]
  const to = turnOf(row), at = row.data.pos as number[]
  const local = rotate(conj(from), [pos[0] - was[0], pos[1] - was[1], pos[2] - was[2]])
  const there = rotate(to, local)
  const facing = rotate(mul(to, conj(from)), [math.sin(yaw), 0, math.cos(yaw)])
  return {
    pos: [at[0] + there[0], at[1] + there[1], at[2] + there[2]],
    yaw: math.hypot(facing[0], facing[2]) > 1e-9 ? math.atan2(facing[0], facing[2]) : yaw,
  }
}
