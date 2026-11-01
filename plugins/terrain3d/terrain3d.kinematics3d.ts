// terrain3d's mod for kinematics3d (`addons/scenemanager`'s mods): the land as a target. A scene with
// `world.kinematics3d.mods: { behaviors: [..., 'terrain3d'], solids: [...], footprints: [...] }` has
// kinematics3d move a body across the land, round and onto the solids standing on it.
//
// `behaviors()` delivers `triangles`, `{ triangles: { yaw?, normal? } }`: the land's triangles, the
// lattice of the finest ring the page draws (2·reach/seg of `world.terrain3d.rings[0]`), the water over
// them (`depthAt`), and the solids standing on them from every plugin `world.kinematics3d.mods.solids`
// names, each `solids(w, x, z, r)` the solids reaching within r of (x, z). Its place is the body's `pos`
// [x, y, z]:
//   step(pos, want, dt)   the body moved across the land by `want` [x, y, z] metres a second (its y none)
//                         for `dt` seconds within the limits, then stood on it: rises followed, and on the
//                         ground, drops of up to `step` onto ground that is not steep (a stair down, a body
//                         set down a little over the floor), on the ground as kinematics3d last found it
//                         (`grounded`, which kinematics3d writes); off the ground where it drops further,
//                         its height kept, for kinematics3d's gravity. On steep ground the want slides
//                         down it. Writes `sliding`
//   at(pos)               `pos`; the target's `normal` where it gives one, else the ground's up there (its
//                         slope across one `span`); its `yaw` where it gives one, else the body's
//   nearest(at)           the place on the ground under `at` [x, y, z]: its x and z, at S
//   ways                  x and z across the land, without end, and y, which no want moves
// The ground under a body is the land, or the top of a solid there no more than the body's `step` over
// its feet, where that is higher; a solid whose top rises past that and whose underside is under the
// body's head stands in its way. `ground(w, feet, k)` is that ground for feet at y = `feet`.
//
// The numbers, `world.kinematics3d.kinds.<kind>.triangles` (the row's `as` when it names one, else its kind):
//   radius     metres: the body's circle against solids' footprints
//   height     metres: the body's height
//   step       metres: the tallest rise a foot takes in one move
//   maxSlope   rise over run: the steepest grade climbed
//   slopeBand  rise over run: a slide ends only under maxSlope − slopeBand
//   slide      m/s: the speed a body on steep ground slides down it at
//   wade       metres: the deepest water walked into
//   span       metres: the side of the footprint square
//   probe      metres: how far ahead the slope rule looks for a rise past step
//   bodies     the kinds whose bodies are solid to this kind's
// A number out of range throws a sentence naming the kind.
//
// Solids are walked round by their footprints, a convex outline on the ground: each solid names its
// word by the key its numbers sit under, and each word's footprint comes from
// `world.kinematics3d.mods.footprints`, each `<a>.kinematics3d.ts` exporting `footprints()`,
// `{ <word>: (shape) → { points, round, base, crown, top } }`: its outline, its underside's height, its
// top over its middle, and its top over (x, z) or undefined off it; a word nothing delivered throws
// naming it.
//
// The footprint: the four corners of a `span` square and its centre; S, the stand height, the mean of
// the feet within `step` of the highest. Ground steeper than maxSlope is not ground: a body on it slides
// down it at `slide`.
//   slide   the move across the ground within the limits, in rounds: pushed out of the solids, refused
//           into water deeper than `wade`, up a riser taller than `step` (slid along its edge) and up a
//           slope taller than `step` within `probe`
import type { Row, W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { numbers as kindNumbers, kindOf, type Behavior, type Place } from '#plugins/kinematics3d/kinematics3d.sim.ts'
import { depthAt, rawAt } from './terrain3d.sim.ts'
import { layoutOf } from './terrain3d.rings.ts'

export type Numbers = {
  radius: number; height: number; step: number; maxSlope: number; slopeBand: number; slide: number; wade: number; span: number; probe: number
  bodies?: string[]
}
// A solid handed bare (`fromBare`).
export type Solid = { x: number; z: number; radius: number }
// A solid: its numbers under its word (Solids and their footprints, above).
export type Worded = { [word: string]: any }
// A footprint: a convex outline on the ground, its corners `points` [[x, z], …] in order round it, one
// for a round thing, taken `round` metres wider all round.
export type Footprint = { points: number[][]; round: number; base?: number; crown?: number; top?: (x: number, z: number) => number | undefined }
// A word's behavior: the footprint of a thing of that word.
export type Footprinter = (shape: any) => Footprint
export type Ground = {
  height(x: number, z: number): number
  depth?(x: number, z: number): number
  solids(x: number, z: number, r: number): (Solid | Worded)[]
  cell?: number
}
// The ground's heights and water, what the footprint stands on, without its solids.
type Heights = Omit<Ground, 'solids'>
// A plugin's `fixed`: every solid that never moves reaching within r of
// (x, z), from the walls of a level, the trunks and boulders scatter3d places, anything that stands
// where it stands for the life of the truth.
export type Fixed = (w: W, x: number, z: number, r: number) => (Solid | Worded)[]


// Every footprint word the scene has: each mod's, in the order they are named;
// made once per scene's `world`, whose mods never change.
const behaviorsMade = new WeakMap<object, Record<string, Footprinter>>()
function behaviorsOf(world: object): Record<string, Footprinter> {
  let all = behaviorsMade.get(world)
  if (!all) {
    all = {}
    for (const m of modsOf<() => Record<string, Footprinter>>(world, 'kinematics3d', 'footprints')) Object.assign(all, m())
    behaviorsMade.set(world, all)
  }
  return all
}

// The one fallback: a solid handed bare, `{ x, z, radius }`, as providers written before solids had
// words hand them, is the upright cylinder it always was. Nothing past this reads a bare solid.
/** @deprecated LEGACY, being phased out: a provider hands worded solids and delivers their words' behaviors; a bare solid is the old way. */
function fromBare(s: Solid | Worded): Worded {
  if (!('x' in s && 'radius' in s)) return s
  const bare = s as Solid
  return { cylinder: { pos: [bare.x, 0, bare.z], radius: bare.radius } }
}

// What turns a solid into its footprint, by its word's behavior among `all`.
type Foot = (s: Solid | Worded) => Footprint
const footOf = (all: Record<string, Footprinter>): Foot => solid => {
  const s = fromBare(solid)
  const word = Object.keys(s)[0]
  const behavior = all[word]
  if (!behavior) throw new Error(`kinematics3d has no footprint for a solid of the word ${word}: no plugin world.kinematics3d.mods.footprints names delivers it`)
  return behavior(s[word])
}
// A footprint of no words, for a question that reads no solid.
const ownFoot = footOf({})

// The ground as a truth keeps it, when one does: every corner of the lattice asked of `height`
// and `depth` so far, kept by `keyOf`; the fixed solids, asked of every `fixed` plugin; and the
// `solids` mod's, what moves.
const KEPT = Symbol('kept')
type Area = (x: number, z: number, r: number) => (Solid | Worded)[]
type Kept = { height?: Map<number, number>; depth?: Map<number, number>; fixed?: Area; moving?: Area }
type Made = Ground & { [KEPT]: Kept }

// A square (i, j) of a grid, or a corner of the lattice, as one number.
const keyOf = (i: number, j: number) => (i + 1048576) * 2097152 + (j + 1048576)

// ---------------------------------------------------------------- footprints

// The point of a footprint's outline nearest (x, z): `at`, whether (x, z) lies inside the outline, and
// `n`, the unit way out of it there: from `at` toward (x, z) outside, the nearest side's outward normal
// inside. An outline of one point is that point, never inside; of two, the segment between them.
function nearest(points: number[][], x: number, z: number): { at: number[]; inside: boolean; n: number[] | undefined } {
  if (points.length === 1) return { at: points[0], inside: false, n: undefined }
  // The turn of the outline: + for anticlockwise in (x, z), − for clockwise; a side's outward normal
  // is its direction turned a quarter the other way.
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length]
    area += ax * bz - bx * az
  }
  const sign = area >= 0 ? 1 : -1
  let best: number[] = points[0], far = Infinity, normal: number[] | undefined, inside = points.length > 2
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length]
    const ex = bx - ax, ez = bz - az, len2 = ex * ex + ez * ez
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len2)) : 0
    const px = ax + ex * t, pz = az + ez * t
    const d = math.hypot(x - px, z - pz)
    const len = Math.sqrt(len2)
    const out = len > 0 ? [(ez / len) * sign, (-ex / len) * sign] : [0, 0]
    if ((x - ax) * out[0] + (z - az) * out[1] > 0) inside = false
    if (d < far) { far = d; best = [px, pz]; normal = out }
  }
  if (inside) return { at: best, inside, n: normal }
  return { at: best, inside, n: far > 0 ? [(x - best[0]) / far, (z - best[1]) / far] : normal }
}

// How far (x, z) stands from a footprint's outline, 0 inside it, not counting its rounding.
function gap(f: Footprint, x: number, z: number): number {
  const near = nearest(f.points, x, z)
  return near.inside ? 0 : math.hypot(x - near.at[0], z - near.at[1])
}

// Whether a footprint reaches within r of (x, z).
function within(f: Footprint, x: number, z: number, r: number): boolean {
  if (f.points.length === 1) return math.hypot(f.points[0][0] - x, f.points[0][1] - z) <= r + f.round
  return gap(f, x, z) <= r + f.round
}

// ---------------------------------------------------------------- one body's read of the ground

// The ground as one body reads it in one call: on a ground with a `cell`, its height and depth are
// the triangles of the lattice of that cell, each corner asked of the ground once in the call, every
// cell split from its (i, j) corner to its (i + 1, j + 1) one, as terrain3d draws its finest ring; and
// its solids are asked once, round (x, z) out to `reach`, and every question inside that disc is
// answered from that list. A question that reaches outside it is asked of the ground.
const READ = Symbol('read')
// Its solids are their footprints, each turned once, as they are read.
type Read = Omit<Ground, 'solids'> & { solids(x: number, z: number, r: number): Footprint[]; [READ]: true }

// `kept`, the corners a truth keeps, when the ground keeps them; else the call's own.
function lattice(f: (x: number, z: number) => number, c: number, kept?: Map<number, number>) {
  const corners = kept ?? new Map<number, number>()
  const at = (i: number, j: number) => {
    const key = keyOf(i, j)
    let h = corners.get(key)
    if (h === undefined) corners.set(key, (h = f(i * c, j * c)))
    return h
  }
  return (x: number, z: number) => {
    const gx = x / c, gz = z / c
    const i = Math.floor(gx), j = Math.floor(gz)
    const fx = gx - i, fz = gz - j
    const a = at(i, j), d = at(i + 1, j + 1)
    if (fx >= fz) {
      const b = at(i + 1, j)
      return a + (b - a) * fx + (d - b) * fz
    }
    const e = at(i, j + 1)
    return a + (e - a) * fz + (d - e) * fx
  }
}

function read(ground: Ground | Read, x: number, z: number, reach: number, foot: Foot): Read {
  if ((ground as Read)[READ]) return ground as Read
  const asked = (ground as Ground).solids
  const near = (list: Footprint[], qx: number, qz: number, r: number) => list.filter(s => within(s, qx, qz, r))
  const held = reach > 0 ? asked(x, z, reach).map(foot) : undefined
  const c = ground.cell
  const kept = (ground as Partial<Made>)[KEPT]
  return {
    [READ]: true,
    height: c ? lattice(ground.height, c, kept?.height) : ground.height,
    ...(ground.depth && { depth: c ? lattice(ground.depth, c, kept?.depth) : ground.depth }),
    solids: (qx, qz, r) => (held && math.hypot(qx - x, qz - z) + r <= reach ? near(held, qx, qz, r) : asked(qx, qz, r).map(foot)),
    ...(c && { cell: c }),
  }
}

// One call's ground for `me`: the bodies solid to it beside the ground's solids, read round where it
// stands out to `reach` past its own radius, each solid's footprint by the scene's behaviors.
const ready = (me: Row, w: W, k: Numbers, on: Ground, reach: number) =>
  read(bodied(me, w, k, on), me.data.pos[0], me.data.pos[2], reach + 2 * k.radius, footOf(behaviorsOf(w.world)))

const TOLERANCE = 1e-9
const HALVINGS = 30
const FRACTION = 12
const SAMPLES = 16
const FINE = 1000
const EDGE = 8
const ROUNDS = 6

// Which numbers may be 0; every other must be above it.
const FIELDS: Record<Exclude<keyof Numbers, 'bodies'>, 'zero' | 'above'> = {
  radius: 'above', height: 'above', step: 'above', maxSlope: 'above', slopeBand: 'above', slide: 'above', wade: 'zero', span: 'above', probe: 'above',
}

// Throws a sentence naming the kind whose triangles numbers cannot be walked by.
function check(name: string, k: Numbers | undefined, kinds: Record<string, unknown>) {
  if (!k) throw new Error(`kinematics3d kind ${name} gives no triangles, which the triangles target reads`)
  for (const [f, least] of Object.entries(FIELDS) as [keyof typeof FIELDS, 'zero' | 'above'][]) {
    const v = k[f]
    if (!Number.isFinite(v) || (least === 'zero' ? v < 0 : v <= 0)) {
      throw new Error(`kinematics3d kind ${name}: triangles.${f} ${v} is not a number ${least === 'zero' ? 'at or above' : 'above'} 0`)
    }
  }
  // `player`, a seat's row, walks as the kind its `as` names, so it may stand among the bodies too.
  if (k.bodies !== undefined && !(Array.isArray(k.bodies) && k.bodies.every(b => typeof b === 'string' && (Object.hasOwn(kinds, b) || b === 'player')))) {
    throw new Error(`kinematics3d kind ${name}: triangles.bodies ${JSON.stringify(k.bodies)} is not a list of the table's kinds`)
  }
  if (!(k.slopeBand < k.maxSlope)) throw new Error(`kinematics3d kind ${name}: triangles.slopeBand ${k.slopeBand} is not under triangles.maxSlope ${k.maxSlope}`)
  const spread = k.maxSlope * k.span * Math.SQRT2
  if (!(spread < k.step)) {
    throw new Error(`kinematics3d kind ${name}: triangles.maxSlope·span·√2 is ${spread}, not under triangles.step ${k.step}, so a footprint on a grade of maxSlope spreads past step`)
  }
}

// A row's kind's triangles numbers, checked the first time each is read.
const checked = new WeakSet<object>()
export function numbers(me: Row, w: W): Numbers {
  const k = kindNumbers(me, w).triangles as Numbers | undefined
  if (!k || !checked.has(k)) {
    check(kindOf(me), k, w.world.kinematics3d.kinds)
    checked.add(k!)
  }
  return k!
}

// The ground with the bodies solid to `me` beside its solids: every row of a kind its `bodies` names,
// but itself and a limp one, whose circle reaches within r.
function bodied(me: Row, w: W, k: Numbers, ground: Ground): Ground {
  if (!k.bodies?.length) return ground
  const kinds = w.world.kinematics3d.kinds as Record<string, { triangles?: Numbers }>
  // A row walks among the bodies by its own entry, or the entry of the kind its `as` names; a `player`
  // row with neither (a seat that plays no body) is none.
  const bodies = k.bodies.flatMap(kind => w.all(kind).filter(o => o.id !== me.id && !o.data.limp && kinds[kindOf(o)]?.triangles).map(o => ({ x: o.data.pos[0], z: o.data.pos[2], radius: kinds[kindOf(o)].triangles!.radius })))
  return {
    ...ground,
    solids: (x, z, r) => [...ground.solids(x, z, r), ...bodies.filter(s => math.hypot(s.x - x, s.z - z) <= r + s.radius)],
  }
}

// ---------------------------------------------------------------- the footprint

// The feet's offsets from the body: the four corners of the span square, then its centre.
const feet = (k: Numbers) => {
  const o = k.span / 2
  return [[-o, -o], [o, -o], [-o, o], [o, o], [0, 0]]
}

// S: the mean height of the feet within step of the highest, on the ground as a body reads it.
export const stand = (k: Numbers, ground: Ground, x: number, z: number): number => standOn(k, read(ground, x, z, 0, ownFoot), x, z)
// The feet in `feet`'s order, each added in that order, with nothing made: it is asked dozens of times a
// body a step.
function standOn(k: Numbers, ground: Heights, x: number, z: number): number {
  const o = k.span / 2, height = ground.height
  const a = height(x - o, z - o), b = height(x + o, z - o), c = height(x - o, z + o), d = height(x + o, z + o), e = height(x, z)
  const least = Math.max(a, b, c, d, e) - k.step - TOLERANCE
  let sum = 0, n = 0
  if (a >= least) { sum += a; n++ }
  if (b >= least) { sum += b; n++ }
  if (c >= least) { sum += c; n++ }
  if (d >= least) { sum += d; n++ }
  if (e >= least) { sum += e; n++ }
  return sum / n
}

// The plain mean of the four corners' depth, 0 on a ground with none.
function depthOf(k: Numbers, ground: Heights, x: number, z: number): number {
  const depth = ground.depth
  if (!depth) return 0
  const o = k.span / 2
  return (depth(x - o, z - o) + depth(x + o, z - o) + depth(x - o, z + o) + depth(x + o, z + o)) / 4
}

// The gradient of f by central differences `width` wide.
function gradient(f: (x: number, z: number) => number, x: number, z: number, width: number): number[] {
  const h = width / 2
  return [(f(x + h, z) - f(x - h, z)) / width, (f(x, z + h) - f(x, z - h)) / width]
}

// The unit of a projection's normal: the fine gradient, or the span-wide one where that is flat.
function normal(f: (x: number, z: number) => number, x: number, z: number, span: number): number[] | undefined {
  for (const width of [span / FINE, span]) {
    const [gx, gz] = gradient(f, x, z, width)
    const m = math.hypot(gx, gz)
    if (m > TOLERANCE) return [gx / m, gz / m]
  }
  return undefined
}

// ---------------------------------------------------------------- the limits

// A limit's answer for a point: undefined when it passes, otherwise which limit refused it and the
// normal the move's component along is removed, or null when there is none to project across.
type Refusal = { by: 'wade' | 'step' | 'slope'; n: number[] | null } | undefined

function wading(k: Numbers, ground: Heights, p: number[], q: number[]): Refusal {
  if (!ground.depth) return undefined
  const dq = depthOf(k, ground, q[0], q[1])
  if (!(dq > k.wade + TOLERANCE && dq > depthOf(k, ground, p[0], p[1]) + TOLERANCE)) return undefined
  return { by: 'wade', n: normal((x, z) => depthOf(k, ground, x, z), q[0], q[1], k.span) ?? null }
}

// The edge a refusing foot's path crosses: where the path from p to q first rises past step, found by
// halving, and where a second path, parallel to it span/8 to one side, crosses the same height. The
// line through the two crossings is the edge's tangent, and the normal is square to it.
function stepping(k: Numbers, ground: Heights, p: number[], y: number, q: number[]): Refusal {
  const d = [q[0] - p[0], q[1] - p[1]]
  const len = math.hypot(d[0], d[1])
  for (const [ox, oz] of feet(k)) {
    const from = Math.max(ground.height(p[0] + ox, p[1] + oz), y)
    const over = (x: number, z: number) => ground.height(x, z) - from > k.step + TOLERANCE
    if (!over(q[0] + ox, q[1] + oz)) continue
    // The crossing between a point that is not over and one that is.
    const cross = (a: number[], b: number[]) => {
      let lo = 0, hi = 1
      for (let h = 0; h < HALVINGS; h++) {
        const mid = (lo + hi) / 2
        if (over(a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid)) hi = mid
        else lo = mid
      }
      return [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi]
    }
    const start = [p[0] + ox, p[1] + oz], end = [q[0] + ox, q[1] + oz]
    const c = cross(start, end)
    const side = [(-d[1] / len) * (k.span / EDGE), (d[0] / len) * (k.span / EDGE)]
    for (const sign of [1, -1]) {
      const s0 = [start[0] + sign * side[0], start[1] + sign * side[1]]
      const s1 = [end[0] + sign * side[0], end[1] + sign * side[1]]
      // The parallel path crosses along its length, or, starting over, between the two starts.
      const other = !over(s0[0], s0[1]) ? (over(s1[0], s1[1]) ? cross(s0, s1) : undefined) : cross(start, s0)
      if (!other) continue
      const tx = other[0] - c[0], tz = other[1] - c[1]
      const m = math.hypot(tx, tz)
      if (!(m > TOLERANCE)) continue
      const n = [tz / m, -tx / m]
      const toward = n[0] * d[0] + n[1] * d[1] >= 0 ? 1 : -1
      return { by: 'step', n: [n[0] * toward, n[1] * toward] }
    }
    return { by: 'step', n: null }
  }
  return undefined
}

// The way up at q when the ground there is too steep to climb, measured from `from`: g, the gradient
// of S across one span, is steeper than maxSlope, and R, the highest S at samples every span/16 along
// g out to probe, less `from`, is over step. R is over step as soon as one sample is, so the samples
// stop there.
function climb(k: Numbers, ground: Heights, q: number[], from: number): number[] | undefined {
  const S = (x: number, z: number) => standOn(k, ground, x, z)
  const [gx, gz] = gradient(S, q[0], q[1], k.span)
  const m = math.hypot(gx, gz)
  if (!(m > k.maxSlope)) return undefined
  const ux = gx / m, uz = gz / m, apart = k.span / SAMPLES
  for (let i = 0; i * apart <= k.probe + TOLERANCE; i++) {
    if (S(q[0] + ux * i * apart, q[1] + uz * i * apart) - from > k.step + TOLERANCE) return [ux, uz]
  }
  return undefined
}

function sloping(k: Numbers, ground: Heights, p: number[], y: number, q: number[]): Refusal {
  const S = (x: number, z: number) => standOn(k, ground, x, z)
  const sp = S(p[0], p[1])
  if (!(S(q[0], q[1]) > Math.max(sp, y) + TOLERANCE)) return undefined
  // Steep ground is not ground: a rise onto it is refused across its own gradient.
  const onto = steep(k, ground, q[0], q[1])
  if (onto) return { by: 'slope', n: onto }
  const up = climb(k, ground, q, sp)
  return up ? { by: 'slope', n: normal(S, q[0], q[1], k.span) ?? up } : undefined
}

// The limits in turn: the first that refuses is the answer.
function limits(k: Numbers, ground: Heights, p: number[], y: number, q: number[]): Refusal {
  return wading(k, ground, p, q) ?? stepping(k, ground, p, y, q) ?? sloping(k, ground, p, y, q)
}

// The point pushed out of every solid it is within the body's radius of: a round one along the line
// from its middle, one with corners from the nearest point of its outline, along the way out there.
function push(k: Numbers, ground: Read, q: number[], from: number[]): number[] {
  let [x, z] = q
  for (const s of ground.solids(x, z, k.radius)) {
    const reach = s.round + k.radius
    if (s.points.length === 1) {
      const [sx, sz] = s.points[0]
      let dx = x - sx, dz = z - sz
      let d = math.hypot(dx, dz)
      if (d >= reach) continue
      // A point on the centre is pushed back the way it came.
      if (d === 0) { dx = from[0] - q[0]; dz = from[1] - q[1]; d = math.hypot(dx, dz) }
      if (d === 0) { dx = 1; dz = 0; d = 1 }
      x = sx + (dx / d) * reach
      z = sz + (dz / d) * reach
      continue
    }
    const near = nearest(s.points, x, z)
    if (!near.inside && math.hypot(x - near.at[0], z - near.at[1]) >= reach) continue
    const n = near.n ?? [1, 0]
    x = near.at[0] + n[0] * reach
    z = near.at[1] + n[1] * reach
  }
  return [x, z]
}

const clear = (k: Numbers, ground: Read, q: number[]) =>
  ground.solids(q[0], q[1], k.radius).every(s => s.points.length === 1
    ? math.hypot(q[0] - s.points[0][0], q[1] - s.points[0][1]) >= s.round + k.radius - TOLERANCE
    : gap(s, q[0], q[1]) >= s.round + k.radius - TOLERANCE)

function slideOn(me: Row, k: Numbers, ground: Read, delta: number[]): number[] {
  const b = me.data
  const [px, y, pz] = b.pos
  const p = [px, pz]
  const take = (q: number[]) => {
    b.pos = [q[0], y, q[1]]
    return [q[0] - px, q[1] - pz]
  }
  let d = [delta[0], delta[1]]
  for (let round = 0; round < ROUNDS; round++) {
    if (math.hypot(d[0], d[1]) <= TOLERANCE) break
    const q = push(k, ground, [px + d[0], pz + d[1]], p)
    d = [q[0] - px, q[1] - pz]
    const refused = limits(k, ground, p, y, q)
    if (!refused) {
      if (clear(k, ground, q)) return take(q)
      continue
    }
    const { n } = refused
    const along = n ? d[0] * n[0] + d[1] * n[1] : 0
    const next = n && along > 0 ? [d[0] - along * n[0], d[1] - along * n[1]] : undefined
    const stalled = !next || round === ROUNDS - 1 || math.hypot(next[0], next[1]) >= math.hypot(d[0], d[1]) * (1 - TOLERANCE)
    if (!stalled) {
      d = next
      continue
    }
    // A slope or wading refusal the projection cannot get past, as on a curved face or shore that a
    // square footprint meets with a different corner as it goes, is settled onto the level it stood
    // at: S's at the start (or pos.y), or the water's (wade, or the depth at the start, whichever is
    // deeper). It is moved down that field's own gradient by its excess over the gradient's square,
    // and judged again the next round.
    if (refused.by !== 'step' && round < ROUNDS - 1) {
      const S = (x: number, z: number) => standOn(k, ground, x, z)
      const D = (x: number, z: number) => depthOf(k, ground, x, z)
      const [f, level] = refused.by === 'slope' ? [S, Math.max(S(px, pz), y)] : [D, Math.max(k.wade, D(px, pz))]
      const [gx, gz] = gradient(f, q[0], q[1], k.span / FINE)
      const g2 = gx * gx + gz * gz, rise = f(q[0], q[1]) - level
      if (g2 > TOLERANCE && rise > 0) {
        const base = next ?? d
        d = [base[0] - (rise / g2) * gx, base[1] - (rise / g2) * gz]
        continue
      }
    }
    // A slope or wading refusal still not got past goes as far along this round's move as every limit
    // passes, found by halving.
    if (refused.by === 'step') break
    let lo = 0, hi = 1
    for (let h = 0; h < FRACTION; h++) {
      const t = (lo + hi) / 2
      const c = push(k, ground, [px + d[0] * t, pz + d[1] * t], p)
      if (!limits(k, ground, p, y, c) && clear(k, ground, c)) lo = t
      else hi = t
    }
    if (lo * math.hypot(d[0], d[1]) <= TOLERANCE) break
    return take(push(k, ground, [px + d[0] * lo, pz + d[1] * lo], p))
  }
  return [0, 0]
}

// Steep ground, which is not ground: the uphill direction of the ground a body at (x, z) stands on,
// its stand height S, where that is steeper than maxSlope; undefined where it is not. It is S and not
// the point under the centre, so a body held up by feet on a steep face stands on steep ground. Each
// axis takes the smaller of S's two one-sided differences a thousandth of a span long, and 0 where
// they differ in sign, so the jump S makes where a foot meets a riser, or leaves a drop, is an edge
// beside the body and not a grade under it.
function steep(k: Numbers, ground: Heights, x: number, z: number, limit = k.maxSlope): number[] | undefined {
  const h = k.span / FINE
  const s0 = standOn(k, ground, x, z)
  const least = (a: number, b: number) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b)
  const gx = least(standOn(k, ground, x + h, z) - s0, s0 - standOn(k, ground, x - h, z)) / h
  const gz = least(standOn(k, ground, x, z + h) - s0, s0 - standOn(k, ground, x, z - h)) / h
  const m = math.hypot(gx, gz)
  return m > limit ? [gx / m, gz / m] : undefined
}

// ---------------------------------------------------------------- the triangles target

type Triangles = { yaw?: number; normal?: number[] }

function stepOn(me: Row, w: W, pos: number[], want: number[], dt: number): number[] {
  const k = numbers(me, w)
  const d = me.data
  d.pos = pos
  const [px, py, pz] = pos
  // Held up by the land the step before, as kinematics3d last found it.
  const was = d.grounded !== false
  // The farthest this step can move it: its want, and steep ground's slide added to it.
  const g = ready(me, w, k, ground(w, py, k), (math.hypot(want[0], want[2]) + k.slide) * dt)
  // A slide starts past maxSlope and ends only below maxSlope − slopeBand.
  const up = was || d.sliding ? steep(k, g, px, pz, d.sliding ? k.maxSlope - k.slopeBand : k.maxSlope) : undefined
  let vx = want[0], vz = want[2]
  if (up) {
    const along = vx * up[0] + vz * up[1]
    const slid = Math.min(along, -k.slide)
    vx += (slid - along) * up[0]
    vz += (slid - along) * up[1]
  }
  slideOn(me, k, g, [vx * dt, vz * dt])
  const [x, y, z] = d.pos
  const S = standOn(k, g, x, z)
  // It stands on S where the move rose to it, or, on the ground, dropped to it by up to step onto ground
  // that is not steep. Anywhere else it is off the ground at its height.
  if (S >= y || ((was || d.sliding) && y - S <= k.step + TOLERANCE && !steep(k, g, x, z))) {
    d.pos = [x, S, z]
    d.sliding = !!steep(k, g, x, z, d.sliding || up ? k.maxSlope - k.slopeBand : k.maxSlope)
  } else d.sliding = false
  return d.pos
}

// The ground's up at (x, z): its slope across one `span`.
function upAt(me: Row, w: W, pos: number[]): number[] {
  const k = numbers(me, w)
  const on = ground(w, pos[1], k)
  const [gx, gz] = gradient((x, z) => stand(k, on, x, z), pos[0], pos[2], k.span)
  const n = [-gx, 1, -gz], l = math.hypot(n[0], n[1], n[2])
  return n.map(v => v / l)
}

const WITHOUT = { lo: -Infinity, hi: Infinity }
const triangles: Behavior = {
  step: (_shape, place, want, dt, me, w) => stepOn(me, w, place as number[], want, dt),
  at(shape, place, me, w) {
    const t = shape as Triangles
    return { at: place as number[], normal: t.normal ?? upAt(me, w, place as number[]), yaw: t.yaw ?? me.data.yaw ?? 0 }
  },
  nearest(_shape, at, me, w): Place {
    const k = numbers(me, w)
    return [at[0], stand(k, ground(w, at[1], k), at[0], at[2]), at[2]]
  },
  ways: (_shape, place) => {
    const from = place as number[]
    return [{ dir: [1, 0, 0], from, ...WITHOUT }, { dir: [0, 0, 0], from, ...WITHOUT }, { dir: [0, 0, 1], from, ...WITHOUT }]
  },
}

export const behaviors = (): Record<string, Behavior> => ({ triangles })

// ---------------------------------------------------------------- the land and the solids on it

// Every solid standing on the land reaching within r of (x, z), from each plugin
// `world.kinematics3d.mods.solids` names, in the list's order.
type Solids = (w: W, x: number, z: number, r: number) => Worded[]
function solidsAt(w: W, x: number, z: number, r: number): Worded[] {
  return modsOf<Solids>(w.world, 'kinematics3d', 'solids').flatMap(solids => solids(w, x, z, r))
}

// The land's height and water as the page draws them: the triangles of the finest ring's lattice, each
// corner asked of the land once a truth, kept by `keyOf`.
const lands = new WeakMap<object, { height: (x: number, z: number) => number; depth: (x: number, z: number) => number }>()
function landOf(w: W) {
  let l = lands.get(w.world)
  if (!l) {
    const c = layoutOf(w.world.terrain3d.rings).c0
    l = { height: lattice((x, z) => rawAt(w, x, z), c), depth: lattice((x, z) => depthAt(w, x, z), c) }
    lands.set(w.world, l)
  }
  return l
}

export function ground(w: W, feet: number, k: Pick<Numbers, 'step' | 'height'>): Ground {
  const reach = feet + k.step + TOLERANCE, head = feet + k.height
  const l = landOf(w)
  const foot = footOf(behaviorsOf(w.world))
  // Whether a solid stands in the way of this body: its top past its reach, and its underside under its
  // head.
  const wall = (s: Worded) => {
    const f = foot(s)
    return f.base !== undefined && f.base < head && f.crown! > reach
  }
  return {
    height(x, z) {
      let y = l.height(x, z)
      for (const s of solidsAt(w, x, z, 0)) {
        const t = foot(s).top?.(x, z)
        if (t !== undefined && t <= reach && t > y) y = t
      }
      return y
    },
    depth: l.depth,
    solids: (x, z, r) => solidsAt(w, x, z, r).filter(wall),
  }
}
