// shapes3d: shapes standing in the world, held on the server. It is the one place a game says what
// stands in the way, and every plugin that asks what is in the way reads it in the same words. It has
// no row and draws nothing: its mods hand its shapes, and each of its words' behaviors, to the plugins
// that ask.
//
// Its numbers are the scene's `world.shapes3d`:
//   kinds  `{ <kind>: { shape: { <word>: { … } }, look?, surface? } }`: every row of the kind is a thing
//          of that word, of its numbers. `look` `{ colour, roughness?, sides?, thick?, map?, scale? }`,
//          when given, is how solids draws it, a plain shape of that paint, a picture laid on it when
//          it names a `map` (`shapes3d.solids.ts`), and box3d stands a cylinder and a plane as that
//          same solid (`shapes3d.box3d.ts`). `surface` is what box3d's bodies meet on it, Box3D's
//          b3SurfaceMaterial fields (`friction`, `restitution`, `rollingResistance`, …), Box3D's own
//          where left out. A kind that gives
//          `activities` is a space: its rows offer motion3d those activities, at its `priority`,
//          with the constraints its `points` name (`shapes3d.motion3d.ts`), carrying its `data`, `{
//          <plugin>: { … } }`, keyed by the plugin each block is for and passed on untouched (motion3d
//          reads `data.motion3d.autoChange`), and stand in nothing's
//          way: `shapes`, and so every mod here but motion3d's and solids', leaves them out. A space
//          is only where an activity is offered; a thing in the way there is a kind of its own.
//   mods   `{ height? }`: the ground the shapes stand over, `(w, x, z) → y`, for `ground` and walker's
//          ground (`shapes3d.walker.ts`); terrain3d's land, `terrain3d.shapes3d.ts`. With none, the
//          ground is flat at y = 0.
// A row of one of these kinds carries `pos` [x, y, z] metres and `yaw` radians, as every row solids
// draws does, and stands where it was put: walker takes the shapes as fixed and asks for them once a
// tile; a hyperplane's row carries `pos` and `rot` in place of `yaw`. A rule moves one with
// `move(w, row, pos, turn)`, `turn` its new `yaw`, or for a hyperplane its new `rot`, and nothing else
// writes its place: `move` keeps where it stood before on the row, `was` [x, y, z, …turn] (so a kind
// whose rows move gives `was: null` in its prefab), and counts the truth's moves (`moves(w)`), so
// walker's and kinematics3d's grounds read the shapes again, and walker's carries a body standing on a
// moved one with it (`shapes3d.walker.ts`'s `footing`). A shape is moved every step it travels; `was` is
// the step before's place, so one that stops is moved to where it is. `turnOf(row)` is a row's turn as
// a quaternion, its `rot`, or its `yaw` about up.
//
// Its words, `words`, each what a thing of the word is in the world and the sums shapes3d answers of it:
//   cylinder  `{ radius, height }`: upright, its foot's middle at the row's `pos`, `radius` metres round
//             and `height` tall: `{ cylinder: { pos, radius, height } }`.
//   box       `{ size: [x, y, z] }`: its foot's middle at the row's `pos`, `x` metres across and `z`
//             long on the ground, `y` tall, turned by the row's `yaw`, its length along (sin yaw,
//             cos yaw): `{ box: { pos, size, yaw } }`.
//   plane     `{ size: [x, z], tilt? }`: a surface with no thickness, its middle at the row's `pos`, `x`
//             metres across and `z` long on the ground, turned by the row's `yaw`; flat, or with `tilt`
//             radians rising along its length, so a tilted plane is a ramp: `{ plane: { pos, size, yaw,
//             slope } }`, `slope` the tilt's rise a metre, 0 when flat. A plane is stood on and shot,
//             and is never in the way: walker, cover3d and nav3d are never handed one.
//   hyperplane  `{ size: [x, z] }`: a surface with no thickness, its middle at the row's `pos`, `x` metres
//             across and `z` long, turned by the row's `rot` [x, y, z, w], a unit quaternion and the
//             whole of its turn, so a row tilts, rolls and turns it as the game runs: lying face up, `x`
//             along the world's x and `z` along its z, when `rot` is [0, 0, 0, 1]. `{ hyperplane: { pos,
//             size, rot } }`. Stood on where its face is over a point and shot, and never in the way, as
//             a plane is; a body on one tilted past its `maxSlope` slides off it by walker's own rule.
// A kind of a word none of these is throws, naming the kind and the word.
//
// Each word answers for its own top, `top(shape, x, z)`: the height of the surface a body stands on over
// (x, z), or undefined where the shape does not cover it. A cylinder and a box are flat at the height of
// their top, `pos` y + `height` or `size` y; a plane is at `pos` y at its middle, risen by `slope` a
// metre along its length. `base(shape)` is the height a cylinder's or a box's underside starts at,
// `pos` y, for walker's ground, which walks a body round what stands between its feet and its head; a
// plane has none.
//
// `shapes(w)` is every one but the spaces, `{ id, kind, word, shape }`, the shape its numbers under its
// word.
// `near(w, x, z, r)` is those whose footprint on the ground reaches within r of (x, z), but planes;
// `along(w, from, dir, far)` those whose footprint the line's path over the ground may cross within
// `far`. `land(w)` is the ground under the shapes, the `height` mod's, or 0 everywhere.
// hitscan3d, walker and cover3d have `cylinder` of their own, and shapes3d delivers each of them `box`,
// and hitscan3d `plane`, whose sums are here: `corners(box)` its footprint's corners in
// order round it, `lineBox` where a line meets it, `behind` where a body stands hidden behind it,
// `linePlane` where a line meets a plane, `lineHyperplane` where a line meets a hyperplane, and
// `rotate(q, v)`, `conj(q)` and `mul(a, b)` the quaternion sums a hyperplane is turned by.
//
// Its mods, each named by the plugin that asks: `shapes3d.hitscan3d.ts` (`solids`, `behaviors`),
// `shapes3d.walker.ts` (`fixed`, `behaviors`, and `ground`, the ground a body walks for a rule),
// `shapes3d.cover3d.ts` (`solids`, `behaviors`), `shapes3d.nav3d.ts` (`solids`, each shape's footprint),
// `shapes3d.box3d.ts` (`fixed`, each shape a thing in box3d's world that never moves),
// `shapes3d.motion3d.ts` (`spaces`, the shapes that hold a point and the activities they offer),
// `shapes3d.crowd3d.ts` (`paths`, the lines and splines crowd3d's people walk, played as each kind's
// `data.crowd3d` says) and `shapes3d.solids.ts` (`models`, the page's).
import type { Row, W } from '#engine/engine.ts'
import type { Material } from '#plugins/box3d/box3d.sim.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import * as math from '#plugins/math/math.sim.ts'

export type Cylinder = { pos: number[]; radius: number; height: number }
export type Box = { pos: number[]; size: number[]; yaw: number }
export type Plane = { pos: number[]; size: number[]; yaw: number; slope: number }
export type Hyperplane = { pos: number[]; size: number[]; rot: number[] }
export type Placed = { id: number; kind: string; word: string; shape: Record<string, any> }
export type Kind = {
  shape: Record<string, any>
  look?: { colour: string; roughness?: number; sides?: number; thick?: number; map?: string; scale?: number }
  surface?: Partial<Material>
  activities?: string[]
  priority?: number
  points?: Record<string, Record<string, any>>
  data?: Record<string, unknown>
}

// What shapes3d knows of a word: a thing of it in the world, from its kind's numbers and its row; how
// far a point stands from its footprint, 0 within it; its footprint's middle and the most the footprint
// reaches from it; its top over a point, undefined where it does not cover it; and where its underside
// starts, for a thing that stands in the way, which a plane never is.
type Word = {
  place(numbers: any, row: Row): any
  gap(shape: any, x: number, z: number): number
  middle(shape: any): { x: number; z: number; reach: number }
  top(shape: any, x: number, z: number): number | undefined
  base?(shape: any): number
}

// A point in a turned shape's own frame: across it, and along its length.
const local = (s: { pos: number[]; yaw: number }, x: number, z: number) => {
  const c = math.cos(s.yaw), n = math.sin(s.yaw)
  const rx = x - s.pos[0], rz = z - s.pos[2]
  return [rx * c - rz * n, rx * n + rz * c]
}

// A vector turned by the unit quaternion q [x, y, z, w].
export function rotate(q: number[], v: number[]): number[] {
  const [qx, qy, qz, qw] = q
  const tx = 2 * (qy * v[2] - qz * v[1]), ty = 2 * (qz * v[0] - qx * v[2]), tz = 2 * (qx * v[1] - qy * v[0])
  return [v[0] + qw * tx + (qy * tz - qz * ty), v[1] + qw * ty + (qz * tx - qx * tz), v[2] + qw * tz + (qx * ty - qy * tx)]
}
// The turn back of a unit quaternion.
export const conj = (q: number[]) => [-q[0], -q[1], -q[2], q[3]]
// The turn `b` then the turn `a`.
export function mul(a: number[], b: number[]): number[] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]
}
// A turn of `yaw` radians about up, as a quaternion.
const aboutUp = (yaw: number) => [0, math.sin(yaw / 2), 0, math.cos(yaw / 2)]
export const turnOf = (row: Row): number[] => (row.data.rot as number[] | undefined) ?? aboutUp((row.data.yaw as number | undefined) ?? 0)

// A hyperplane's axes in the world: across, its face's up, and along.
const axes = (h: Hyperplane) => ({ u: rotate(h.rot, [1, 0, 0]), n: rotate(h.rot, [0, 1, 0]), v: rotate(h.rot, [0, 0, 1]) })
// A hyperplane's four corners in the world, in order round it.
const hyperCorners = (h: Hyperplane) => {
  const { u, v } = axes(h), hx = h.size[0] / 2, hz = h.size[1] / 2
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => [0, 1, 2].map(i => h.pos[i] + u[i] * a + v[i] * b))
}
// How far (x, z) stands from a convex outline on the ground, its points [x, z] in order round it; 0
// within it. An outline seen edge on, its points in a line, is that line.
function gapTo(points: number[][], x: number, z: number): number {
  let inside = true, sign = 0, best = Infinity
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length]
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)) : 0
    best = Math.min(best, math.hypot(x - (ax + ex * t), z - (az + ez * t)))
    const cross = ex * (z - az) - ez * (x - ax)
    if (cross !== 0) {
      if (sign === 0) sign = Math.sign(cross)
      else if (Math.sign(cross) !== sign) inside = false
    }
  }
  return inside && sign !== 0 ? 0 : best
}

export const words: Record<string, Word> = {
  cylinder: {
    place: (n, row): Cylinder => ({ pos: row.data.pos, radius: n.radius, height: n.height }),
    gap: (c: Cylinder, x, z) => Math.max(0, math.hypot(x - c.pos[0], z - c.pos[2]) - c.radius),
    middle: (c: Cylinder) => ({ x: c.pos[0], z: c.pos[2], reach: c.radius }),
    top: (c: Cylinder, x, z) => (math.hypot(x - c.pos[0], z - c.pos[2]) <= c.radius ? c.pos[1] + c.height : undefined),
    base: (c: Cylinder) => c.pos[1],
  },
  box: {
    place: (n, row): Box => ({ pos: row.data.pos, size: n.size, yaw: row.data.yaw }),
    gap(b: Box, x, z) {
      const [lx, lz] = local(b, x, z)
      return math.hypot(Math.max(0, Math.abs(lx) - b.size[0] / 2), Math.max(0, Math.abs(lz) - b.size[2] / 2))
    },
    middle: (b: Box) => ({ x: b.pos[0], z: b.pos[2], reach: math.hypot(b.size[0], b.size[2]) / 2 }),
    top(b: Box, x, z) {
      const [lx, lz] = local(b, x, z)
      return Math.abs(lx) <= b.size[0] / 2 && Math.abs(lz) <= b.size[2] / 2 ? b.pos[1] + b.size[1] : undefined
    },
    base: (b: Box) => b.pos[1],
  },
  plane: {
    place: (n, row): Plane => ({ pos: row.data.pos, size: n.size, yaw: row.data.yaw, slope: n.tilt ? math.tan(n.tilt) : 0 }),
    gap(p: Plane, x, z) {
      const [lx, lz] = local(p, x, z)
      return math.hypot(Math.max(0, Math.abs(lx) - p.size[0] / 2), Math.max(0, Math.abs(lz) - p.size[1] / 2))
    },
    middle: (p: Plane) => ({ x: p.pos[0], z: p.pos[2], reach: math.hypot(p.size[0], p.size[1]) / 2 }),
    top(p: Plane, x, z) {
      const [lx, lz] = local(p, x, z)
      return Math.abs(lx) <= p.size[0] / 2 && Math.abs(lz) <= p.size[1] / 2 ? p.pos[1] + lz * p.slope : undefined
    },
  },
  hyperplane: {
    place: (n, row): Hyperplane => ({ pos: row.data.pos, size: n.size, rot: row.data.rot }),
    gap: (h: Hyperplane, x, z) => gapTo(hyperCorners(h).map(c => [c[0], c[2]]), x, z),
    middle: (h: Hyperplane) => ({ x: h.pos[0], z: h.pos[2], reach: math.hypot(h.size[0], h.size[1]) / 2 }),
    // The face's height over (x, z): where the upright line there meets it, within its edges; none where
    // the face stands on edge.
    top(h: Hyperplane, x, z) {
      const { u, n, v } = axes(h)
      if (Math.abs(n[1]) < 1e-12) return undefined
      const dx = x - h.pos[0], dz = z - h.pos[2]
      const dy = -(n[0] * dx + n[2] * dz) / n[1]
      const lx = u[0] * dx + u[1] * dy + u[2] * dz, lz = v[0] * dx + v[1] * dy + v[2] * dz
      return Math.abs(lx) <= h.size[0] / 2 && Math.abs(lz) <= h.size[1] / 2 ? h.pos[1] + dy : undefined
    },
  },
}

// The word of a kind's shape, and what shapes3d knows of it; a word none of its own throws.
export function wordOf(kind: string, k: Kind): { word: string; known: Word } {
  const word = Object.keys(k.shape)[0]
  const known = words[word]
  if (!known) throw new Error(`shapes3d kind ${kind} is a ${word}, which is none of its words: ${Object.keys(words).join(', ')}`)
  return { word, known }
}

export function shapes(w: W): Placed[] {
  const kinds = (w.world.shapes3d?.kinds ?? {}) as Record<string, Kind>
  const out: Placed[] = []
  for (const [kind, k] of Object.entries(kinds)) {
    if (k.activities) continue
    const { word, known } = wordOf(kind, k)
    for (const r of w.all(kind)) out.push({ id: r.id, kind, word, shape: { [word]: known.place(k.shape[word], r) } })
  }
  return out
}

// How many times a shape of the truth has been moved, so what is kept of its shapes knows when to read
// them again.
const moved = new WeakMap<object, number>()
export const moves = (w: W) => moved.get(w.world) ?? 0

export function move(w: W, row: Row, pos: number[], turn: number | number[]) {
  const [x, y, z] = row.data.pos as number[]
  if (typeof turn === 'number') {
    row.data.was = [x, y, z, row.data.yaw]
    row.data.yaw = turn
  } else {
    row.data.was = [x, y, z, ...(row.data.rot as number[])]
    row.data.rot = [turn[0], turn[1], turn[2], turn[3]]
  }
  row.data.pos = [pos[0], pos[1], pos[2]]
  moved.set(w.world, moves(w) + 1)
}

export const near = (w: W, x: number, z: number, r: number): Placed[] =>
  shapes(w).filter(p => words[p.word].base && words[p.word].gap(p.shape[p.word], x, z) <= r)

// The ground under the shapes, the `height` mod's, found once per world.
type Height = (w: W, x: number, z: number) => number
const lands = new WeakMap<object, Height>()
const flat: Height = () => 0
export function land(w: W): Height {
  let h = lands.get(w.world)
  if (!h) lands.set(w.world, (h = mod<Height>(w.world, 'shapes3d', 'height') ?? flat))
  return h
}

export function along(w: W, from: number[], dir: number[], far: number): Placed[] {
  const l = math.hypot(dir[0], dir[1], dir[2])
  const ax = from[0], az = from[2]
  const ex = (dir[0] / l) * far, ez = (dir[2] / l) * far, len2 = ex * ex + ez * ez
  return shapes(w).filter(p => {
    const { x, z, reach } = words[p.word].middle(p.shape[p.word])
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2)) : 0
    return math.hypot(x - (ax + ex * t), z - (az + ez * t)) <= reach
  })
}

// A box's footprint's corners, [x, z], in order round it.
export function corners(b: Box): number[][] {
  const c = math.cos(b.yaw), s = math.sin(b.yaw), hx = b.size[0] / 2, hz = b.size[2] / 2
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => [b.pos[0] + lx * c + lz * s, b.pos[2] - lx * s + lz * c])
}

// Where a line from `o` along unit `d` first meets a box taken `grow` metres wider on every side, within
// `far`, and the box's normal there; from inside, where it leaves it, and the normal turned in.
export function lineBox(b: Box, o: number[], d: number[], far: number, grow: number): { t: number; normal: number[] } | undefined {
  const c = math.cos(b.yaw), s = math.sin(b.yaw)
  const rx = o[0] - b.pos[0], ry = o[1] - b.pos[1], rz = o[2] - b.pos[2]
  const lo = [rx * c - rz * s, ry, rx * s + rz * c]
  const ld = [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c]
  const min = [-b.size[0] / 2 - grow, -grow, -b.size[2] / 2 - grow]
  const max = [b.size[0] / 2 + grow, b.size[1] + grow, b.size[2] / 2 + grow]
  let tin = -Infinity, tout = Infinity
  let nin = [0, 0, 0], nout = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    if (Math.abs(ld[i]) < 1e-12) {
      if (lo[i] < min[i] || lo[i] > max[i]) return undefined
      continue
    }
    const t1 = (min[i] - lo[i]) / ld[i], t2 = (max[i] - lo[i]) / ld[i]
    // The side it comes in by faces back along the line; the side it leaves by faces on along it.
    const back = [0, 0, 0]
    back[i] = ld[i] > 0 ? -1 : 1
    if (Math.min(t1, t2) > tin) { tin = Math.min(t1, t2); nin = back }
    if (Math.max(t1, t2) < tout) { tout = Math.max(t1, t2); nout = back.map(v => -v) }
  }
  if (tin > tout) return undefined
  const inside = tin < 0
  const t = inside ? tout : tin
  if (t < 0 || t > far) return undefined
  const n = inside ? nout.map(v => -v) : nin
  return { t, normal: [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c] }
}

// Where a line from `o` along unit `d` meets a plane taken `grow` metres wider at its edges, within
// `far`, and the plane's normal there, turned back toward the line's start.
export function linePlane(p: Plane, o: number[], d: number[], far: number, grow: number): { t: number; normal: number[] } | undefined {
  const c = math.cos(p.yaw), s = math.sin(p.yaw)
  const rx = o[0] - p.pos[0], ry = o[1] - p.pos[1], rz = o[2] - p.pos[2]
  const lo = [rx * c - rz * s, ry, rx * s + rz * c]
  const ld = [d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c]
  // Its height over its own middle, less the surface's there: 0 on the plane.
  const across = ld[1] - ld[2] * p.slope
  if (Math.abs(across) < 1e-12) return undefined
  const t = -(lo[1] - lo[2] * p.slope) / across
  if (t < 0 || t > far) return undefined
  const hx = lo[0] + ld[0] * t, hz = lo[2] + ld[2] * t
  if (Math.abs(hx) > p.size[0] / 2 + grow || Math.abs(hz) > p.size[1] / 2 + grow) return undefined
  const l = math.hypot(1, p.slope), back = across > 0 ? -1 : 1
  const n = [0, back / l, (-p.slope * back) / l]
  return { t, normal: [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c] }
}

// Where a line from `o` along unit `d` meets a hyperplane taken `grow` metres wider at its edges, within
// `far`, and its normal there, turned back toward the line's start.
export function lineHyperplane(h: Hyperplane, o: number[], d: number[], far: number, grow: number): { t: number; normal: number[] } | undefined {
  const back = conj(h.rot)
  const lo = rotate(back, [o[0] - h.pos[0], o[1] - h.pos[1], o[2] - h.pos[2]]), ld = rotate(back, d)
  if (Math.abs(ld[1]) < 1e-12) return undefined
  const t = -lo[1] / ld[1]
  if (t < 0 || t > far) return undefined
  if (Math.abs(lo[0] + ld[0] * t) > h.size[0] / 2 + grow || Math.abs(lo[2] + ld[2] * t) > h.size[1] / 2 + grow) return undefined
  return { t, normal: rotate(h.rot, [0, ld[1] > 0 ? -1 : 1, 0]) }
}

// Where a body `radius` wide stands behind a box hidden from `threat` [x, z], [x, z]: on the line from
// the threat through its middle, where that line leaves the box grown by `radius` all round (its
// footprint widened, lengthened and its corners rounded), so the body stands `radius` clear of it.
// Undefined when the box is under `low` tall, its middle more than `reach` from `at`, or the threat on
// its middle.
export function behind(b: Box, at: number[], threat: number[], ask: { reach: number; radius: number; low: number }): { at: number[]; tall: number } | undefined {
  const tall = b.size[1]
  if (tall < ask.low || math.hypot(b.pos[0] - at[0], b.pos[2] - at[1]) > ask.reach) return undefined
  const dx = b.pos[0] - threat[0], dz = b.pos[2] - threat[1], l = math.hypot(dx, dz)
  if (l === 0) return undefined
  const ux = dx / l, uz = dz / l
  const c = math.cos(b.yaw), s = math.sin(b.yaw)
  // The way in the box's own frame, taken into its first quarter: the grown box is the same each way.
  const lx = Math.abs(ux * c - uz * s), lz = Math.abs(ux * s + uz * c)
  const hx = b.size[0] / 2, hz = b.size[2] / 2, r = ask.radius
  // Where the line from the middle leaves each part of the grown box: the box widened, the box
  // lengthened, and the circle at its corner; it leaves the whole where it leaves the last of them.
  const slab = (ax: number, az: number) => Math.min(lx > 0 ? ax / lx : Infinity, lz > 0 ? az / lz : Infinity)
  const b2 = lx * hx + lz * hz, disc = b2 * b2 - (hx * hx + hz * hz - r * r)
  const corner = disc >= 0 ? b2 + Math.sqrt(disc) : 0
  const out = Math.max(slab(hx + r, hz), slab(hx, hz + r), corner)
  return { at: [b.pos[0] + ux * out, b.pos[2] + uz * out], tall }
}
