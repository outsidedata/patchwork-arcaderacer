// The server half of terrain3d: the ground, as a pure function of a field file. There is no
// three.js here and no clock, so a rule on the server and the browser half's rings both ask the one
// ground and get the same bytes.
//
// It has no row: nothing of it changes while the game runs. Its numbers are the scene's
// `world.terrain3d`, which a child scene inherits from the manager's (`addons/scenemanager`).
// `field` is the field's name in the scene's `loader` catalogue, a `json` entry with `preload`, read
// through the loader's `json`, which is the one import a plugin's server half makes; the other
// numbers are the browser half's (`terrain3d.plugin.ts`). The land is made the first time a query
// asks for it, so a field that cannot be made throws then.
//
// The field file:
//   program   { world, hscale, sea, flood, out, nodes }: the height program, below.
//   analysis  what the land record reads the ground with, in metres:
//               slopeStep        the half-span of the normal `slope` and `aspect` are read from, and
//                                the step `ray` and `occludes` march the ground in;
//               curveStep        the step the curvatures are read over;
//               positionRadius   the radius of the 8-point ring `position` is measured against;
//               occlusionRadius  how far the 8-direction march reaches;
//               occlusionSteps   the samples along each direction of that march;
//               cliffProbe       how far away a cliff is looked for, and the half-span of the
//                                gradient that points at it;
//               cliffSlope       the `slope` at which a face counts as a whole cliff;
//               cliffDrop        the rise or drop in metres at which it counts as a whole cliff;
//               flatAngle        radians: a direction whose horizon is within this of level is flat,
//                                for the geomorphon `form`;
//               records          how many land records a land keeps: past it, the one asked for
//                                longest ago goes first, and is made again if it is asked for.
//   ground    the ground's look: its texture layers, each with its rules, its noise edge and its
//             warp, and how they are composed (`terrain3d.warp.ts` says what it holds). Its rules'
//             `q`s and its numbers are checked when a land is made (`looks`). The land record answers
//             each layer's weight as `layer:<name>`, the weight the ground's shader draws there.
//   surfaces  `{ name: { colour?, cover, grip?, drag?, spray?, edge? } }`: what a `surface` stroke
//             paints. `colour`, when it has one, is drawn over the ground layers by the paint's
//             weight, through `edge` when it has one (a ground layer can instead lay a texture where
//             `surface:<name>` is); `cover` multiplies scatter's density, 0 on a road; `grip` (1 if left out, and on
//             unpainted ground) multiplies the friction of a wheel's contact with it; `drag` (0 if left
//             out, and on unpainted ground) is its rolling resistance, the newtons a wheel rolling on
//             it loses per newton of load, as soft ground sinks a tyre; `spray` is what a wheel going
//             over it throws up, a particle3d effect's name, or false for nothing, as off asphalt; left
//             out, a wheel throws what it would throw off unpainted ground; `mark`, from 0 to 1, how
//             dark a track a tyre rolling over it leaves, deep in mud and none on asphalt; left out, a
//             tyre marks it as it marks unpainted ground.
// An edge `{ width, ragged, scale }` turns a weight w into
// smoothstep(0.5 − width/2, 0.5 + width/2, w + ragged·(noise − 0.5)), the noise value noise at `scale`
// cycles a metre: a crisp line where w crosses a half, broken up by `ragged`. With no edge, w is
// drawn as it is and blends over the ground between the vertices.
//   layers    `[{ at: [x, z], size, px, strokes }]`: painted ground. A layer is a square `size`
//             metres across centred on `at`, of `px` × `px` pixels.
//
// The program. `nodes` are evaluated in order into one reused Float64Array, and `out` names the one
// whose value is the ground. Every input names an earlier node; the names are resolved once, when
// the program is compiled, and a name that is not an earlier node throws naming the node, so no
// cycle can be written. Values are unitless and are multiplied by `hscale` once; only a warp's
// `amount`, a crater's `radius` and a clearing's `flat` are metres. `compile(program)` hands back
// `run(x, z)`, the value of `out`, and `at(id, x, z)`, the value of any one node, for a preview.
//   const     `value`.
//   noise     `kind` value, simplex or worley, at `freq` cells across `world`, with `seed`. The
//             lattice point of a ground point p is ((p' / world) + 0.5)·freq, where p' is p turned
//             by `rotate` radians and then multiplied by `stretch` [x, z] ([1, 1] when absent).
//             Value noise is bilinear over hashed corners with a quintic fade; simplex takes its
//             gradient angles from the same hash and is 0.5 + 35n; worley is the distance to the
//             nearest (`metric` f1, the default), second nearest (f2) or their difference (f2-f1) of
//             one hashed point per cell over the 3×3 cells around, clamped to [0, 1].
//   warp      the value of `input` at the point moved by `amount`·(value of `x`, value of `z`)
//             metres: the nodes up to `input` are run again there.
//   fold      `kind` ridge (1 − |2v − 1|)², billow |2v − 1|², abs |2v − 1|, or terrace: `steps`
//             floors, each rising to the next through a quintic riser, (⌊vs⌋ + quintic(vs − ⌊vs⌋))/s.
//   remap     (v − inLo)/(inHi − inLo), clamped to [0, 1], eased `linear`, `smooth` (3t² − 2t³) or
//             `smoother` (6t⁵ − 15t⁴ + 10t³), onto outLo..outHi. An `inLo` equal to `inHi` throws.
//   combine   `a` and `b` by `mode`: add, sub, mul, min and max of the two, or lerp a + (b − a)·t,
//             `t` 0.5 when absent.
//   scale     `input` × `by`.
//   craters   a crater in every cell of a lattice of `freq` cells across `world`, at a hashed point
//             of the cell, of a hashed radius between `radius` [min, max] metres. At q, the distance
//             from its centre over its radius, a crater's floor is −depth(1 − q²) inside q < 1, and
//             its rim is rim·exp(−½((q − 1)/rimWidth)²), or, out to `ejecta` radii, the quadratic
//             apron rim·(1 − (q − 1)/(ejecta − 1))² where that is higher. The deepest floor wins and
//             the rims add.
//   clearing  `input` levelled toward its own value at the origin v₀: v₀ + (v − v₀)·keep, keep =
//             floor + (1 − floor)(1 − exp(−r²/2flat²)), r metres from the origin. Levelling toward 0
//             would dig a pit `hscale` deep at spawn.
//   biomes    the land's biomes, `list: [{ name, strength, height }]`, each `strength` and `height` an
//             earlier node, and `sharp` above 0. A biome is a name, a node that says how much of it
//             stands at a point and a node that is its own ground there. The mix at a point is each
//             biome's share, max(0, strength)^sharp over their sum (equal shares where that sum is 0),
//             a higher `sharp` narrowing the ground between two biomes; the value is Σ share·height. A
//             program has at most one biomes node, its names distinct and none empty. `compile` also
//             hands back `biomes`, the names in order (none without the node), and `mix(x, z)`, the
//             shares there in that order.
//
// The sea. raw = program·hscale − hscale(2·sea − 1), so the waterline is y = 0. With `flood` the
// height is max(raw, 0), the water's surface, and the depth max(0, −raw); with no flood there is no
// sea, the height is raw and the depth 0 everywhere, so a dry valley that dips below 0 holds no
// water.
//
// Painted layers. A layer's raster is baked from its strokes the first time the land reads it, in
// order and deterministically, so the server and every seat hold the same bytes; the strokes are
// the source and no image exists. Each pixel holds a target T premultiplied by its weight W, a
// surface index S and that surface's own weight SW. Layers apply in order as h ← h + (T/W − h)·W,
// which is h·(1 − W) + T, sampled premultiplied bilinear with zero outside, so paint feathers out
// over one pixel at a layer's edge.
//
// A stroke `{ verb, radius, hardness, strength, level, surface, path: [[x, z], …] }` is applied once
// along its polyline: each pixel within `radius` of it has f = clamp01((1 − d/r)/(1 − hardness)),
// d its distance to the polyline, and moves f of the way to a goal. An empty entry `[]` in the path
// breaks it into runs, and nothing joins the points either side of it: d is the distance to the
// nearest run, a run of one point being that point, as a brush that leaves its layer and comes back
// paints. T ← T + (goal − T)·f and
// W ← 1 − (1 − W)(1 − f), so a soft edge over paint stays soft. Every goal reads the raster as it
// was before the stroke:
//   raise, lower  the ground under the pixel ± `strength`, so a later program edit, which bakes
//                 again, carries the painted spot with it;
//   flatten       `level`;
//   smooth        the mean of the ground at the pixel and ±radius/2 along x and z;
//   bench         the ground under the nearest point of the polyline: it follows the hill along the
//                 path and is flat across it, which cuts a road;
//   surface       no height: where the pixel's surface is `surface`, or it has none, SW grows as W
//                 does; where f outweighs another surface, the pixel becomes `surface` at weight f.
// `paintAt` stacks the layers' surfaces the same way, each layer's surface the nearest pixel's and
// its weight that surface's bilinear weight, and its `cover` is 1 + (surfaces[s].cover − 1)·weight,
// its `grip` the same of surfaces[s].grip, its `drag` surfaces[s].drag·weight, and its `spray` and
// `mark` surfaces[s]'s where the weight is at least a half, undefined where it is less.
//
// The land record, `analyse(x, z)`, is made on first asking and kept, up to `records` of them; each
// key is worked out when it is first read. The keys (`keys`, which a rule's `q` may name):
//   height     heightAt.
//   relief     height / hscale.
//   slope      1 − n.y, n the normal over ±slopeStep.
//   aspect     the way downhill faces, atan2(n.x, n.z): 0 faces +z, π/2 faces +x.
//   profile    the curvature along the slope, and `plan` across it, over curveStep, positive where
//              the ground is concave: a slope's foot, a hollow. On level ground both are half the
//              Laplacian.
//   position   height minus the mean of 8 points positionRadius around.
//   occlusion  the mean over 8 directions of sin of the highest horizon angle, 0 when nothing rises.
//   form       the geomorphon from the same march: a direction is up when its highest horizon is
//              above flatAngle and above its lowest, down likewise, and the counts of each pick one
//              of 0 flat, 1 peak, 2 ridge, 3 shoulder, 4 spur, 5 slope, 6 hollow, 7 footslope,
//              8 valley, 9 pit.
//   cliffAbove read at the one point cliffProbe along the gradient, the gradient taken over
//              ±cliffProbe (the local gradient is zero where a boulder rests): shape(the slope there,
//              0, cliffSlope) · shape(the rise to there, 0, cliffDrop). `cliffBelow` the same the
//              other way, with the drop.
//   wet        shape(plan, 0, .01) · shape(−position, 0, .15·positionRadius).
//   water      depthAt.
//   biome:<n>  biome n's share of the mix there, one key for each name of the program's biomes.
//   surface:<n>  surface n's painted weight there, 0 where another surface is painted.
//   layer:<n>  ground layer n's weight there (`terrain3d.warp.ts`), as the ground draws it before its
//              height blend, so a scatter rule on `layer:rock` places on the rock that is drawn.
//              `layers` is every layer's, in order. A ground layer's own rules read no layer.
// `read(q)` is any of them by name. `reach(analysis)` is how far from its point a record reads the
// ground.
//
// `shape(v, lo, hi)` is the one ramp: clamp01((v − lo)/(hi − lo)), so it is inverted when lo > hi,
// and a step at lo when they are equal. A rule `{ q, lo, hi }` is shape(record.read(q), lo, hi)
// (`ramp`); band colours, scatter's keep rules and its boulders all use it. `rules(list, what,
// biomes)` throws naming a rule whose `q` is none of `keys` nor `biome:<n>` for a name in `biomes`;
// a land's own `rules(list, what)` checks against its own biomes.
//
// A land (`land(field)`) is the ground of one field and holds its compiled program, its rasters and
// its records. `landOf(field)` is the one every truth in the process reads, made again only when the
// field's content changes: the loader refills a written file in place, swapping its top-level
// values, and a land whose values were swapped for ones of the same content is kept. The browser
// half makes its own with `land`, which its brush strokes.
//
// The brush. Each layer holds at most one unsaved stroke, a stroke the file does not hold yet, and a
// copy of its pixels from before it. `stroke(k, stroke)` puts that copy back and bakes the stroke,
// its whole path so far, once, so a drag whose path grows each frame bakes the same pixels as the
// finished stroke baked from the file. Whenever layer k is baked again, because a stroke into an
// earlier layer changed the ground its strokes read, it bakes its file's strokes and then its unsaved
// one. `land(field, from)` makes a land that keeps each unsaved stroke of the land `from` whose layer
// the new file does not hold it in, so the stroke goes once the file holds it. A stroke that
// replaces the unsaved one changes the ground both changed. `discard(k)` puts layer k's pixels back
// as they were before its unsaved stroke and drops the stroke, for a save that was refused or undone
// before a new land was made from it; its version moves as a stroke's does, so the ground's `edits`
// report the area. A stroke, or a discard, bakes again each later layer whose strokes read the
// ground it changed (a layer's pixels, grown by its largest stroke radius: a bench reads its path,
// a smooth reads half a radius out), and drops the records that read it. `version(k)`, 0 when the
// land is made, moves each time layer k's pixels are baked again that way, and `rect(k)` is
// [x0, z0, x1, z1], where its pixels reach, grown by the record's reach. `edits()` is `{ land,
// layers: [{ version, rect }] }`: whatever keeps something built on the ground compares it with what
// it saw last. Nothing is called back.
//
// The queries each take `w` and read the land of the field `world.terrain3d` names: heightAt, rawAt, depthAt,
// normalAt(x, z, step), restsAt(x, z, span) (the mean of the four corners of a span square, so a
// body stands still over ground rougher than itself), paintAt, occludes(a, b) (whether the ground
// rises above the segment between two points), analyse, ramp(rule, x, z), edits and
// ray(origin, dir, far) (the first point along the ray at or below the ground: marched in slopeStep
// steps and refined by bisection, or undefined). A land also answers `through(k, x, z)`, the raw
// ground as layer k leaves it, the program and layers 0 to k, which the brush's `pick` reads,
// `mix(x, z)`, each biome's share there by name, `layers(x, z)`, each ground layer's weight there by
// name, and `rules(list, what)`, the rule check that knows its biomes and its layers, which the
// `edits` land hands any plugin standing on it.
import type { W } from '#engine/engine.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { checked, weights, type Look } from './terrain3d.warp.ts'

export type Rule = { q: string; lo: number; hi: number }
export type Node = { id: string; op: string; [param: string]: any }
export type Program = { world: number; hscale: number; sea: number; flood: boolean; out: string; nodes: Node[] }
export type Analysis = {
  slopeStep: number; curveStep: number; positionRadius: number; occlusionRadius: number; occlusionSteps: number
  cliffProbe: number; cliffSlope: number; cliffDrop: number; flatAngle: number; records: number
}
export type Edge = { width: number; ragged: number; scale: number }
export type Stroke = { verb: 'raise' | 'lower' | 'flatten' | 'smooth' | 'bench' | 'surface'; radius: number; hardness: number; strength: number; level: number; surface: string; path: number[][] }
export type Layer = { at: number[]; size: number; px: number; strokes: Stroke[] }
export type Surface = { colour?: string; cover: number; grip?: number; drag?: number; spray?: string | false; mark?: number; edge?: Edge }
export type Field = { program: Program; analysis: Analysis; ground: Look; surfaces: Record<string, Surface>; layers: Layer[] }
export type Paint = { weight: number; surface: string | undefined; cover: number; grip: number; drag: number; spray: string | false | undefined; mark: number | undefined }
export type Edits = { land: Land; layers: { version: number; rect: number[] }[] }

// ---------------------------------------------------------------- noise

// One integer hash of a lattice point and a seed, mixed with Math.imul: a whole number 0 … 2³² − 1.
export function hash(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}
// The hash as a fraction in [0, 1), and a second and third one for the same point.
const unit = (x: number, z: number, seed: number) => hash(x, z, seed) / 4294967296
const SECOND = 0x5bd1e995, THIRD = 0x1b873593

const quintic = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Value noise: the hashes of the four corners, bilinear with a quintic fade. [0, 1).
export function value(x: number, z: number, seed: number): number {
  const i = Math.floor(x), j = Math.floor(z)
  const u = quintic(x - i), v = quintic(z - j)
  const a = unit(i, j, seed), b = unit(i + 1, j, seed), c = unit(i, j + 1, seed), d = unit(i + 1, j + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6

// Simplex noise: three corners, each a gradient at the hashed angle, 0.5 + 35n.
export function simplex(x: number, z: number, seed: number): number {
  const s = (x + z) * F2
  const i = Math.floor(x + s), j = Math.floor(z + s)
  const t = (i + j) * G2
  const x0 = x - (i - t), z0 = z - (j - t)
  const [i1, j1] = x0 > z0 ? [1, 0] : [0, 1]
  const corner = (dx: number, dz: number, ci: number, cj: number) => {
    const r = 0.5 - dx * dx - dz * dz
    if (r <= 0) return 0
    const angle = 2 * Math.PI * unit(ci, cj, seed)
    return r * r * r * r * (math.cos(angle) * dx + math.sin(angle) * dz)
  }
  const n = corner(x0, z0, i, j) + corner(x0 - i1 + G2, z0 - j1 + G2, i + i1, j + j1) + corner(x0 - 1 + 2 * G2, z0 - 1 + 2 * G2, i + 1, j + 1)
  return 0.5 + 35 * n
}

// Worley noise: one hashed point per cell, the 3×3 cells around, by `metric`, clamped to [0, 1].
export function worley(x: number, z: number, seed: number, metric: 'f1' | 'f2' | 'f2-f1' = 'f1'): number {
  const i = Math.floor(x), j = Math.floor(z)
  let f1 = Infinity, f2 = Infinity
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const ci = i + di, cj = j + dj
      const px = ci + unit(ci, cj, seed), pz = cj + unit(ci, cj, seed ^ SECOND)
      const d = math.hypot(px - x, pz - z)
      if (d < f1) { f2 = f1; f1 = d } else if (d < f2) f2 = d
    }
  }
  return clamp01(metric === 'f1' ? f1 : metric === 'f2' ? f2 : f2 - f1)
}

// ---------------------------------------------------------------- the program

type Step = (buf: Float64Array, x: number, z: number) => number
export type Compiled = {
  run(x: number, z: number): number; at(id: string, x: number, z: number): number
  biomes: string[]; mix(x: number, z: number): number[]
}
export type Biome = { name: string; strength: string; height: string }
// A biomes node resolved: its names, its strengths' and heights' nodes, its sharpness, and the last
// node its strengths need.
type Biomes = { names: string[]; strengths: number[]; heights: number[]; sharp: number; last: number }

const EASES: Record<string, (t: number) => number> = { linear: t => t, smooth: t => t * t * (3 - 2 * t), smoother: quintic }
const NOISES = ['value', 'simplex', 'worley']
const METRICS = ['f1', 'f2', 'f2-f1']
const MODES: Record<string, (a: number, b: number, t: number) => number> = {
  add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, min: (a, b) => Math.min(a, b), max: (a, b) => Math.max(a, b),
  lerp: (a, b, t) => a + (b - a) * t,
}
const FOLDS: Record<string, (v: number, steps: number) => number> = {
  ridge: v => math.pow(1 - Math.abs(2 * v - 1), 2),
  billow: v => math.pow(Math.abs(2 * v - 1), 2),
  abs: v => Math.abs(2 * v - 1),
  terrace: (v, steps) => { const t = v * steps, f = Math.floor(t); return (f + quintic(t - f)) / steps },
}

export function compile(program: Program): Compiled {
  const { nodes, world } = program
  const index = new Map<string, number>()
  const steps: Step[] = []
  // Runs the nodes up to `last` at (x, z) into `buf`, and hands back the last one's value.
  const upto = (last: number, x: number, z: number, buf: Float64Array) => {
    for (let i = 0; i <= last; i++) buf[i] = steps[i](buf, x, z)
    return buf[last]
  }
  const origins: [number, number][] = []
  let biomes: (Biomes & { id: string }) | undefined
  nodes.forEach((n, i) => {
    if (typeof n.id !== 'string') throw new Error(`terrain3d node ${i} has no id`)
    if (index.has(n.id)) throw new Error(`terrain3d has two nodes ${n.id}`)
    const read = (param: string, id: unknown = n[param]) => {
      const at = typeof id === 'string' ? index.get(id) : undefined
      if (at === undefined) throw new Error(`terrain3d node ${n.id} reads ${param} ${id}, which is not a node before it`)
      return at
    }
    if (n.op === 'biomes') {
      if (biomes) throw new Error(`terrain3d has two biomes nodes, ${biomes.id} and ${n.id}`)
      biomes = { id: n.id, ...resolve(n, read) }
      steps.push(mixed(biomes))
    } else steps.push(step(n, read, world, upto, origins, i))
    index.set(n.id, i)
  })
  // Each clearing's input at the origin, in node order, so a clearing that reads an earlier one
  // finds it already levelled.
  for (const [i, input] of origins) steps[i] = clearing(nodes[i], input, upto(input, 0, 0, new Float64Array(input + 1)))
  const out = index.get(program.out)
  if (out === undefined) throw new Error(`terrain3d program out ${program.out} is none of its nodes`)
  const buf = new Float64Array(nodes.length)
  const b = biomes
  const scratch = b && new Float64Array(b.last + 1)
  return {
    run: (x, z) => upto(out, x, z, buf),
    at: (id, x, z) => {
      const i = index.get(id)
      if (i === undefined) throw new Error(`terrain3d has no node ${id}`)
      return upto(i, x, z, new Float64Array(i + 1))
    },
    biomes: b ? b.names.slice() : [],
    mix: (x, z) => {
      if (!b) return []
      upto(b.last, x, z, scratch!)
      return shares(b, scratch!, new Array(b.names.length))
    },
  }
}

// A biomes node's list checked and its nodes found.
function resolve(n: Node, read: (param: string, id?: unknown) => number): Biomes {
  const list = n.list as Biome[] | undefined
  if (!Array.isArray(list) || !list.length) throw new Error(`terrain3d node ${n.id} has no biomes in its list`)
  if (!(typeof n.sharp === 'number' && n.sharp > 0)) throw new Error(`terrain3d node ${n.id} sharp ${n.sharp} is not above 0`)
  const names: string[] = []
  list.forEach((b, k) => {
    if (typeof b?.name !== 'string' || !b.name) throw new Error(`terrain3d node ${n.id} biome ${k} has no name`)
    if (names.includes(b.name)) throw new Error(`terrain3d node ${n.id} has two biomes ${b.name}`)
    names.push(b.name)
  })
  const strengths = list.map(b => read(`biome ${b.name} strength`, b.strength))
  const heights = list.map(b => read(`biome ${b.name} height`, b.height))
  return { names, strengths, heights, sharp: n.sharp, last: Math.max(...strengths) }
}

// Each biome's share of the mix, from the strengths `buf` holds, written into `out`.
function shares<T extends { [k: number]: number }>(b: Biomes, buf: Float64Array, out: T): T {
  const n = b.names.length
  let total = 0
  for (let k = 0; k < n; k++) {
    const s = buf[b.strengths[k]]
    const w = s > 0 ? math.pow(s, b.sharp) : 0
    out[k] = w
    total += w
  }
  for (let k = 0; k < n; k++) out[k] = total > 0 ? out[k] / total : 1 / n
  return out
}

// The biomes node's step: each biome's height by its share.
function mixed(b: Biomes): Step {
  const got = new Float64Array(b.names.length)
  return buf => {
    shares(b, buf, got)
    let v = 0
    for (let k = 0; k < got.length; k++) v += got[k] * buf[b.heights[k]]
    return v
  }
}

const clearing = (n: Node, input: number, v0: number): Step => {
  const floor = n.floor, two = 2 * n.flat * n.flat
  return (buf, x, z) => {
    const keep = floor + (1 - floor) * (1 - math.exp(-(x * x + z * z) / two))
    return v0 + (buf[input] - v0) * keep
  }
}

// The lattice point of a ground point.
const lattice = (world: number, freq: number, rotate = 0, stretch: number[] = [1, 1]) => {
  const c = math.cos(rotate), s = math.sin(rotate)
  return (x: number, z: number): [number, number] => [((x * c - z * s) * stretch[0] / world + 0.5) * freq, ((x * s + z * c) * stretch[1] / world + 0.5) * freq]
}

function step(
  n: Node, read: (param: string) => number, world: number,
  upto: (last: number, x: number, z: number, buf: Float64Array) => number, origins: [number, number][], i: number,
): Step {
  switch (n.op) {
    case 'const': return () => n.value
    case 'noise': {
      if (!NOISES.includes(n.kind)) throw new Error(`terrain3d node ${n.id} noise ${n.kind} is none of ${NOISES.join(', ')}`)
      const metric = n.metric ?? 'f1'
      if (!METRICS.includes(metric)) throw new Error(`terrain3d node ${n.id} metric ${metric} is none of ${METRICS.join(', ')}`)
      const at = lattice(world, n.freq, n.rotate, n.stretch), seed = n.seed
      if (n.kind === 'value') return (_, x, z) => { const [u, v] = at(x, z); return value(u, v, seed) }
      if (n.kind === 'simplex') return (_, x, z) => { const [u, v] = at(x, z); return simplex(u, v, seed) }
      return (_, x, z) => { const [u, v] = at(x, z); return worley(u, v, seed, metric) }
    }
    case 'warp': {
      const input = read('input'), dx = read('x'), dz = read('z'), amount = n.amount
      const scratch = new Float64Array(input + 1)
      return (buf, x, z) => upto(input, x + amount * buf[dx], z + amount * buf[dz], scratch)
    }
    case 'fold': {
      const input = read('input'), f = FOLDS[n.kind], steps = n.steps
      if (!f) throw new Error(`terrain3d node ${n.id} fold ${n.kind} is none of ${Object.keys(FOLDS).join(', ')}`)
      return buf => f(buf[input], steps)
    }
    case 'remap': {
      const input = read('input'), ease = EASES[n.ease ?? 'linear']
      if (!ease) throw new Error(`terrain3d node ${n.id} ease ${n.ease} is none of ${Object.keys(EASES).join(', ')}`)
      const { inLo, inHi, outLo, outHi } = n
      if (inLo === inHi) throw new Error(`terrain3d node ${n.id} remaps from ${inLo} to ${inHi}, which is no span`)
      return buf => outLo + (outHi - outLo) * ease(clamp01((buf[input] - inLo) / (inHi - inLo)))
    }
    case 'combine': {
      const a = read('a'), b = read('b'), f = MODES[n.mode], t = n.t ?? 0.5
      if (!f) throw new Error(`terrain3d node ${n.id} mode ${n.mode} is none of ${Object.keys(MODES).join(', ')}`)
      return buf => f(buf[a], buf[b], t)
    }
    case 'scale': {
      const input = read('input'), by = n.by
      return buf => buf[input] * by
    }
    case 'craters': return craters(n, world)
    case 'clearing': {
      // Made again once every node before it can run, with its input's value at the origin.
      origins.push([i, read('input')])
      return () => 0
    }
    default: throw new Error(`terrain3d node ${n.id} op ${n.op} is none of const, noise, warp, fold, remap, combine, scale, craters, clearing, biomes`)
  }
}

function craters(n: Node, world: number): Step {
  const { freq, seed, depth, rim, rimWidth, ejecta } = n
  const [rmin, rmax] = n.radius as number[]
  const cell = world / freq
  const reach = rmax * Math.max(ejecta, 1 + 3 * rimWidth)
  const around = Math.ceil(reach / cell)
  return (_, x, z) => {
    const u = (x / world + 0.5) * freq, v = (z / world + 0.5) * freq
    const i = Math.floor(u), j = Math.floor(v)
    let floor = 0, rims = 0
    for (let cj = j - around; cj <= j + around; cj++) {
      for (let ci = i - around; ci <= i + around; ci++) {
        const cx = ((ci + unit(ci, cj, seed)) / freq - 0.5) * world
        const cz = ((cj + unit(ci, cj, seed ^ SECOND)) / freq - 0.5) * world
        const r = rmin + (rmax - rmin) * unit(ci, cj, seed ^ THIRD)
        const q = math.hypot(x - cx, z - cz) / r
        if (q < 1) floor = Math.min(floor, -depth * (1 - q * q))
        const gauss = math.exp(-0.5 * math.pow((q - 1) / rimWidth, 2))
        const apron = q >= 1 && q < ejecta ? math.pow(1 - (q - 1) / (ejecta - 1), 2) : 0
        rims += rim * Math.max(gauss, apron)
      }
    }
    return floor + rims
  }
}

// ---------------------------------------------------------------- rules

export const keys = ['height', 'relief', 'slope', 'aspect', 'profile', 'plan', 'position', 'occlusion', 'form', 'cliffAbove', 'cliffBelow', 'wet', 'water'] as const
export type Key = (typeof keys)[number]

export const shape = (v: number, lo: number, hi: number) => (lo === hi ? (v >= lo ? 1 : 0) : clamp01((v - lo) / (hi - lo)))

const BIOME = 'biome:'
// The names of a program's biomes, in order.
const biomesOf = (program: Program): string[] => ((program.nodes.find(n => n.op === 'biomes')?.list ?? []) as Biome[]).map(b => b.name)

const LAYER = 'layer:'
const SURFACE = 'surface:'

export function rules(list: Rule[], what: string, biomes: readonly string[] = [], layers: readonly string[] = [], surfaces: readonly string[] = []): Rule[] {
  const known = [...keys, ...biomes.map(n => BIOME + n), ...surfaces.map(n => SURFACE + n), ...layers.map(n => LAYER + n)]
  list.forEach((rule, i) => {
    if (!known.includes(rule.q)) throw new Error(`${what} rule ${i} reads ${rule.q}, which is none of the land record's keys: ${known.join(', ')}`)
  })
  return list
}

// Whether rule `q` reads the land record's own keys, a biome's share or a surface's paint, which a
// vertex can carry.
export const recorded = (q: string) => (keys as readonly string[]).includes(q) || q.startsWith(BIOME) || q.startsWith(SURFACE)

// Throws naming the first thing in an edge it cannot draw.
function edged(edge: Edge | undefined, what: string) {
  if (edge === undefined) return
  if (!(edge.width > 0 && edge.width <= 1)) throw new Error(`${what} edge width ${edge.width} is not above 0 and at most 1`)
  if (!(edge.ragged >= 0)) throw new Error(`${what} edge ragged ${edge.ragged} is below 0`)
  if (edge.ragged > 0 && !(edge.scale > 0)) throw new Error(`${what} edge scale ${edge.scale} is not above 0`)
}

// The field's ground layers and surfaces, checked: throws naming the first one that cannot be drawn.
// A ground layer's rules read the land record's own keys and the biomes' shares, never a layer.
export function looks(field: Field) {
  const biomes = biomesOf(field.program)
  for (const [name, s] of Object.entries(field.surfaces ?? {})) edged(s.edge, `terrain3d surface ${name}`)
  if (!field.ground) throw new Error('terrain3d field has no ground')
  checked(field.ground, [...keys, ...biomes.map(n => BIOME + n), ...Object.keys(field.surfaces ?? {}).map(n => SURFACE + n)])
}

export const reach = (a: Analysis) => Math.max(a.slopeStep, a.curveStep * Math.SQRT2, a.positionRadius, a.occlusionRadius, a.cliffProbe + a.slopeStep)

// The geomorphon forms by the count of directions down (row) and up (column).
const FL = 0, PK = 1, RI = 2, SH = 3, SP = 4, SL = 5, HL = 6, FS = 7, VL = 8, PT = 9
const FORMS = [
  [FL, FL, FL, FS, FS, VL, VL, VL, PT],
  [FL, FL, FS, FS, FS, VL, VL, VL],
  [FL, SH, SL, SL, HL, HL, VL],
  [SH, SH, SL, SL, SL, HL],
  [SH, SH, SP, SL, SL],
  [RI, RI, SP, SP],
  [RI, RI, RI],
  [RI, RI],
  [PK],
]

type Ground = {
  height(x: number, z: number): number; depth(x: number, z: number): number; normal(x: number, z: number, step: number): number[]
  mix(x: number, z: number): number[]; biomes: string[]; hscale: number; analysis: Analysis; look: Look
  paint(x: number, z: number): Paint
}

// What the land says about one point, each key worked out when it is first read.
export class LandRecord {
  #g: Ground
  #x: number
  #z: number
  #got: Partial<Record<Key, number>> = {}
  #mix: number[] | undefined
  #layers: number[] | undefined
  constructor(g: Ground, x: number, z: number) { this.#g = g; this.#x = x; this.#z = z }

  // Any key by its name, a biome's share and a ground layer's weight too.
  read(q: string): number {
    if ((keys as readonly string[]).includes(q)) return this[q as Key]
    if (q.startsWith(LAYER)) {
      const k = this.#g.look.layers.findIndex(l => l.name === q.slice(LAYER.length))
      if (k < 0) throw new Error(`the land record has no key ${q}`)
      return this.layers[k]
    }
    if (q.startsWith(SURFACE)) {
      const p = this.#g.paint(this.#x, this.#z)
      return p.surface === q.slice(SURFACE.length) ? p.weight : 0
    }
    const k = q.startsWith(BIOME) ? this.#g.biomes.indexOf(q.slice(BIOME.length)) : -1
    if (k < 0) throw new Error(`the land record has no key ${q}`)
    return (this.#mix ??= this.#g.mix(this.#x, this.#z))[k]
  }

  // Every ground layer's weight here, as the ground's shader draws it before its height blend
  // (`terrain3d.warp.ts`), at this point's height and slope.
  get layers(): number[] {
    return (this.#layers ??= weights(this.#g.look, this.#x, this.height, this.#z, this.slope, q => this.read(q)))
  }

  #h(dx: number, dz: number) { return this.#g.height(this.#x + dx, this.#z + dz) }
  #n() { return this.#g.normal(this.#x, this.#z, this.#g.analysis.slopeStep) }

  get height() { return (this.#got.height ??= this.#h(0, 0)) }
  get relief() { return (this.#got.relief ??= this.height / this.#g.hscale) }
  get slope() { return (this.#got.slope ??= 1 - this.#n()[1]) }
  get aspect() { return (this.#got.aspect ??= (n => math.atan2(n[0], n[2]))(this.#n())) }
  get profile() { return this.#curves().profile }
  get plan() { return this.#curves().plan }
  get position() {
    if (this.#got.position !== undefined) return this.#got.position
    const r = this.#g.analysis.positionRadius
    let sum = 0
    for (let k = 0; k < 8; k++) sum += this.#h(r * math.cos(k * Math.PI / 4), r * math.sin(k * Math.PI / 4))
    return (this.#got.position = this.height - sum / 8)
  }
  get occlusion() { return this.#march().occlusion }
  get form() { return this.#march().form }
  get cliffAbove() { return this.#cliffs().cliffAbove }
  get cliffBelow() { return this.#cliffs().cliffBelow }
  get wet() { return (this.#got.wet ??= shape(this.plan, 0, 0.01) * shape(-this.position, 0, 0.15 * this.#g.analysis.positionRadius)) }
  get water() { return (this.#got.water ??= this.#g.depth(this.#x, this.#z)) }

  #curves() {
    const got = this.#got
    if (got.plan !== undefined) return { plan: got.plan, profile: got.profile! }
    const c = this.#g.analysis.curveStep, h0 = this.height
    const e = this.#h(c, 0), wv = this.#h(-c, 0), s = this.#h(0, c), nv = this.#h(0, -c)
    const fx = (e - wv) / (2 * c), fz = (s - nv) / (2 * c)
    const fxx = (e - 2 * h0 + wv) / (c * c), fzz = (s - 2 * h0 + nv) / (c * c)
    const fxz = (this.#h(c, c) - this.#h(c, -c) - this.#h(-c, c) + this.#h(-c, -c)) / (4 * c * c)
    const p = fx * fx + fz * fz
    if (p < 1e-12) {
      got.plan = got.profile = (fxx + fzz) / 2
    } else {
      got.profile = (fxx * fx * fx + 2 * fxz * fx * fz + fzz * fz * fz) / (p * math.pow(1 + p, 1.5))
      got.plan = (fxx * fz * fz - 2 * fxz * fx * fz + fzz * fx * fx) / (p * Math.sqrt(1 + p))
    }
    return { plan: got.plan, profile: got.profile }
  }

  #march() {
    const got = this.#got
    if (got.form !== undefined) return { occlusion: got.occlusion!, form: got.form }
    const { occlusionRadius: r, occlusionSteps: n, flatAngle } = this.#g.analysis
    const h0 = this.height
    let sky = 0, ups = 0, downs = 0
    for (let k = 0; k < 8; k++) {
      const cx = math.cos(k * Math.PI / 4), cz = math.sin(k * Math.PI / 4)
      let up = -Infinity, down = -Infinity
      for (let s = 1; s <= n; s++) {
        const d = r * s / n
        const angle = math.atan2(this.#h(cx * d, cz * d) - h0, d)
        up = Math.max(up, angle)
        down = Math.max(down, -angle)
      }
      sky += Math.max(0, math.sin(up))
      if (up > flatAngle && up > down) ups++
      else if (down > flatAngle && down > up) downs++
    }
    got.occlusion = sky / 8
    got.form = FORMS[downs][ups]
    return { occlusion: got.occlusion, form: got.form }
  }

  #cliffs() {
    const got = this.#got
    if (got.cliffAbove !== undefined) return { cliffAbove: got.cliffAbove, cliffBelow: got.cliffBelow! }
    const { cliffProbe: p, cliffSlope, cliffDrop, slopeStep } = this.#g.analysis
    const gx = this.#h(p, 0) - this.#h(-p, 0), gz = this.#h(0, p) - this.#h(0, -p)
    const len = math.hypot(gx, gz)
    if (len === 0) {
      got.cliffAbove = got.cliffBelow = 0
    } else {
      const ux = (gx / len) * p, uz = (gz / len) * p, h0 = this.height
      const at = (sx: number, sz: number) => 1 - this.#g.normal(this.#x + sx, this.#z + sz, slopeStep)[1]
      got.cliffAbove = shape(at(ux, uz), 0, cliffSlope) * shape(this.#h(ux, uz) - h0, 0, cliffDrop)
      got.cliffBelow = shape(at(-ux, -uz), 0, cliffSlope) * shape(h0 - this.#h(-ux, -uz), 0, cliffDrop)
    }
    return { cliffAbove: got.cliffAbove, cliffBelow: got.cliffBelow }
  }
}

// ---------------------------------------------------------------- painted layers

type Pixels = { T: Float64Array; W: Float64Array; S: Int32Array; SW: Float64Array }
type Raster = {
  n: number; d: number; x0: number; z0: number // pixels across, their spacing, pixel 0's centre
  T: Float64Array; W: Float64Array; S: Int32Array; SW: Float64Array
  base: Float64Array // the ground under the layer at each pixel's centre
  version: number
}

// The ground `h` under a raster at (x, z), with the raster's `T` and `W` over it.
function over(r: Raster, T: Float64Array, W: Float64Array, h: number, x: number, z: number) {
  const u = (x - r.x0) / r.d, v = (z - r.z0) / r.d
  if (!(u > -1 && v > -1 && u < r.n && v < r.n)) return h
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j
  let t = 0, w = 0
  for (let b = 0; b < 2; b++) {
    const pj = j + b
    if (pj < 0 || pj >= r.n) continue
    for (let a = 0; a < 2; a++) {
      const pi = i + a
      if (pi < 0 || pi >= r.n) continue
      const k = (a ? fu : 1 - fu) * (b ? fv : 1 - fv), p = pj * r.n + pi
      t += k * T[p]
      w += k * W[p]
    }
  }
  return h * (1 - w) + t
}

// Whether a path's entry is a point, not the empty entry that breaks the path into runs.
const isPoint = (p: number[] | undefined) => !!p && p.length >= 2
// A path's points, without its breaks.
const pointsOf = (path: number[][]) => path.filter(isPoint)

// The distance from (x, z) to a path, its runs apart, and its nearest point: each segment within a
// run, and each run of one point.
export function nearest(path: number[][], x: number, z: number): [number, number, number] {
  let best: [number, number, number] = [Infinity, 0, 0]
  for (let s = 0; s < path.length; s++) {
    if (!isPoint(path[s])) continue
    const [ax, az] = path[s]
    if (!isPoint(path[s + 1])) {
      if (!isPoint(path[s - 1])) {
        const d = math.hypot(x - ax, z - az)
        if (d < best[0]) best = [d, ax, az]
      }
      continue
    }
    const [bx, bz] = path[s + 1]
    const ex = bx - ax, ez = bz - az, len = ex * ex + ez * ez
    const t = len === 0 ? 0 : clamp01(((x - ax) * ex + (z - az) * ez) / len)
    const px = ax + ex * t, pz = az + ez * t
    const d = math.hypot(x - px, z - pz)
    if (d < best[0]) best = [d, px, pz]
  }
  return best
}

const falloff = (d: number, r: number, hardness: number) => (d >= r ? 0 : hardness >= 1 ? 1 : clamp01((1 - d / r) / (1 - hardness)))

// ---------------------------------------------------------------- the land

export type Land = ReturnType<typeof land>

export function land(field: Field, from?: { unsaved(k: number): Stroke | undefined }) {
  const program = compile(field.program)
  const { hscale, sea, flood } = field.program
  const analysis = field.analysis
  if (!(Number.isInteger(analysis.records) && analysis.records > 0)) throw new Error(`terrain3d analysis records ${analysis.records} is not a whole number above 0`)
  looks(field)
  const names = Object.keys(field.surfaces ?? {})
  const layers = field.layers ?? []
  const grow = reach(analysis)
  const rasters: (Raster | undefined)[] = layers.map(() => undefined)
  const records = new Map<string, { x: number; z: number; record: LandRecord }>()
  // Each layer's unsaved stroke, and its pixels from before it.
  const unsaved: (Stroke | undefined)[] = layers.map((l, k) => {
    const s = from?.unsaved(k)
    return s && !l.strokes.some(t => JSON.stringify(t) === JSON.stringify(s)) ? s : undefined
  })
  const kept: (Pixels | undefined)[] = layers.map(() => undefined)
  const copy = (r: Raster): Pixels => ({ T: r.T.slice(), W: r.W.slice(), S: r.S.slice(), SW: r.SW.slice() })

  const sealevel = hscale * (2 * sea - 1)
  const bare = (x: number, z: number) => program.run(x, z) * hscale - sealevel

  // The ground under layer k: the program and every layer before k.
  const under = (k: number, x: number, z: number) => {
    let h = bare(x, z)
    for (let j = 0; j < k; j++) { const r = baked(j); h = over(r, r.T, r.W, h, x, z) }
    return h
  }

  const blank = (k: number): Raster => {
    const { at, size, px } = layers[k]
    const d = size / px, x0 = at[0] - size / 2 + d / 2, z0 = at[1] - size / 2 + d / 2
    const base = new Float64Array(px * px)
    for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) base[j * px + i] = under(k, x0 + i * d, z0 + j * d)
    return { n: px, d, x0, z0, T: new Float64Array(px * px), W: new Float64Array(px * px), S: new Int32Array(px * px).fill(-1), SW: new Float64Array(px * px), base, version: 0 }
  }

  // Bakes a stroke into raster k.
  const bake = (k: number, r: Raster, s: Stroke) => {
    const T0 = r.T.slice(), W0 = r.W.slice()
    const before = (x: number, z: number) => over(r, T0, W0, under(k, x, z), x, z)
    const surface = s.verb === 'surface' ? names.indexOf(s.surface) : -1
    if (s.verb === 'surface' && surface < 0) throw new Error(`terrain3d stroke surface ${s.surface} is none of the surfaces: ${names.join(', ')}`)
    if (!['raise', 'lower', 'flatten', 'smooth', 'bench', 'surface'].includes(s.verb)) throw new Error(`terrain3d stroke verb ${s.verb} is none of raise, lower, flatten, smooth, bench, surface`)
    const points = pointsOf(s.path)
    if (!points.length) return
    const xs = points.map(p => p[0]), zs = points.map(p => p[1])
    const lo = (v: number, o: number) => Math.max(0, Math.floor((v - s.radius - o) / r.d))
    const hi = (v: number, o: number) => Math.min(r.n - 1, Math.ceil((v + s.radius - o) / r.d))
    const i0 = lo(Math.min(...xs), r.x0), i1 = hi(Math.max(...xs), r.x0), j0 = lo(Math.min(...zs), r.z0), j1 = hi(Math.max(...zs), r.z0)
    const half = s.radius / 2
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = r.x0 + i * r.d, z = r.z0 + j * r.d
        const [d, nx, nz] = nearest(s.path, x, z)
        const f = falloff(d, s.radius, s.hardness)
        if (f <= 0) continue
        const p = j * r.n + i
        if (s.verb === 'surface') {
          if (r.S[p] === surface || r.SW[p] === 0) { r.S[p] = surface; r.SW[p] = 1 - (1 - r.SW[p]) * (1 - f) }
          else if (f > r.SW[p]) { r.S[p] = surface; r.SW[p] = f }
          continue
        }
        const here = r.base[p] * (1 - W0[p]) + T0[p]
        const goal =
          s.verb === 'raise' ? here + s.strength
          : s.verb === 'lower' ? here - s.strength
          : s.verb === 'flatten' ? s.level
          : s.verb === 'smooth' ? (here + before(x + half, z) + before(x - half, z) + before(x, z + half) + before(x, z - half)) / 5
          : before(nx, nz)
        r.T[p] = T0[p] + (goal - T0[p]) * f
        r.W[p] = 1 - (1 - W0[p]) * (1 - f)
      }
    }
  }

  // Layer k's raster: its file's strokes, then its unsaved one.
  function baked(k: number): Raster {
    const had = rasters[k]
    if (had) return had
    const r = blank(k)
    for (const s of layers[k].strokes) bake(k, r, s)
    const s = unsaved[k]
    if (s) {
      kept[k] = copy(r)
      bake(k, r, s)
    }
    rasters[k] = r
    return r
  }

  // The ground a stroke changes: its path, grown by its radius and a pixel.
  const box = (s: Stroke, d: number) => {
    const points = pointsOf(s.path)
    const xs = points.map(p => p[0]), zs = points.map(p => p[1]), e = s.radius + d
    return [Math.min(...xs) - e, Math.min(...zs) - e, Math.max(...xs) + e, Math.max(...zs) + e]
  }
  const union = (a: number[], b: number[]) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
  // Layer k's pixels put back as they were before its unsaved stroke.
  const restore = (k: number, r: Raster) => {
    const p = kept[k]!
    r.T.set(p.T); r.W.set(p.W); r.S.set(p.S); r.SW.set(p.SW)
  }
  // Layer k's pixels changed within `dirty`: its version moves, each later layer whose strokes read
  // the ground there is baked again from its strokes over the new ground, and the records that read
  // any of it go.
  const reached = (k: number, r: Raster, dirty: number[]) => {
    for (let j = k + 1; j < layers.length; j++) baked(j)
    r.version++
    const areas = [dirty]
    for (let j = k + 1; j < layers.length; j++) {
      if (!meets(extent(j, widest(j)), dirty)) continue
      const version = rasters[j]!.version
      rasters[j] = undefined
      baked(j).version = version + 1
      const it = extent(j, 0)
      dirty = union(dirty, it)
      areas.push(it)
    }
    const reads = areas.map(a => [a[0] - grow, a[1] - grow, a[2] + grow, a[3] + grow])
    for (const [key, { x, z }] of records) if (reads.some(a => x >= a[0] && x <= a[2] && z >= a[1] && z <= a[3])) records.delete(key)
  }
  // How far from layer j's pixels its strokes read the ground: its widest stroke's radius.
  const widest = (j: number) => Math.max(0, ...layers[j].strokes.map(s => s.radius), unsaved[j]?.radius ?? 0)

  // Where layer k's pixels reach, grown by `by`.
  const extent = (k: number, by: number) => {
    const { at, size, px } = layers[k]
    const e = size / 2 + size / px / 2 + by
    return [at[0] - e, at[1] - e, at[0] + e, at[1] + e]
  }
  const meets = (a: number[], b: number[]) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

  const raw = (x: number, z: number) => {
    let h = bare(x, z)
    for (let k = 0; k < layers.length; k++) { const r = baked(k); h = over(r, r.T, r.W, h, x, z) }
    return h
  }
  const height = flood ? (x: number, z: number) => Math.max(raw(x, z), 0) : raw
  const depth = flood ? (x: number, z: number) => Math.max(0, -raw(x, z)) : () => 0
  const normal = (x: number, z: number, s: number) => {
    const nx = height(x - s, z) - height(x + s, z), ny = 2 * s, nz = height(x, z - s) - height(x, z + s)
    const len = math.hypot(nx, ny, nz)
    return [nx / len, ny / len, nz / len]
  }
  const ground: Ground = { height, depth, normal, mix: program.mix, biomes: program.biomes, hscale, analysis, look: field.ground, paint: (x, z) => me.paint(x, z) }
  const layerNames = field.ground.layers.map(l => l.name)

  const analyse = (x: number, z: number): LandRecord => {
    const key = `${x},${z}`
    const had = records.get(key)
    if (had) {
      // Asked for again, it is the newest.
      records.delete(key)
      records.set(key, had)
      return had.record
    }
    const record = new LandRecord(ground, x, z)
    records.set(key, { x, z, record })
    if (records.size > analysis.records) records.delete(records.keys().next().value!)
    return record
  }

  const me = {
    field,
    program,
    raw,
    height,
    depth,
    normal,
    rests(x: number, z: number, span: number) {
      const h = span / 2
      return (height(x - h, z - h) + height(x + h, z - h) + height(x - h, z + h) + height(x + h, z + h)) / 4
    },
    paint(x: number, z: number): Paint {
      let surface = -1, weight = 0
      for (let k = 0; k < layers.length; k++) {
        const r = baked(k)
        const u = (x - r.x0) / r.d, v = (z - r.z0) / r.d
        if (!(u > -1 && v > -1 && u < r.n && v < r.n)) continue
        const ni = Math.round(u), nj = Math.round(v)
        if (ni < 0 || nj < 0 || ni >= r.n || nj >= r.n) continue
        const s = r.S[nj * r.n + ni]
        if (s < 0) continue
        const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j
        let f = 0
        for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
          const pi = i + a, pj = j + b
          if (pi < 0 || pj < 0 || pi >= r.n || pj >= r.n || r.S[pj * r.n + pi] !== s) continue
          f += (a ? fu : 1 - fu) * (b ? fv : 1 - fv) * r.SW[pj * r.n + pi]
        }
        if (s === surface || weight === 0) { surface = s; weight = 1 - (1 - weight) * (1 - f) }
        else if (f > weight) { surface = s; weight = f }
      }
      if (surface < 0) return { weight: 0, surface: undefined, cover: 1, grip: 1, drag: 0, spray: undefined, mark: undefined }
      const name = names[surface], s = field.surfaces[name], over = weight >= 0.5
      return {
        weight, surface: name, cover: 1 + (s.cover - 1) * weight, grip: 1 + ((s.grip ?? 1) - 1) * weight,
        drag: (s.drag ?? 0) * weight, spray: over ? s.spray : undefined, mark: over ? s.mark : undefined,
      }
    },
    occludes(a: number[], b: number[]) {
      const n = Math.ceil(math.hypot(b[0] - a[0], b[2] - a[2]) / analysis.slopeStep)
      for (let i = 1; i < n; i++) {
        const t = i / n
        if (height(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t) > a[1] + (b[1] - a[1]) * t) return true
      }
      return false
    },
    // A record made fresh and kept nowhere: what the browser half colours each vertex from.
    record: (x: number, z: number) => new LandRecord(ground, x, z),
    analyse,
    ramp: (rule: Rule, x: number, z: number) => shape(analyse(x, z).read(rule.q), rule.lo, rule.hi),
    // Each biome's share by name: `{}` with no biomes node.
    mix: (x: number, z: number): Record<string, number> => {
      const got = program.mix(x, z)
      return Object.fromEntries(program.biomes.map((name, k) => [name, got[k]]))
    },
    // Each ground layer's weight by name, as the ground's shader draws it before its height blend.
    layers: (x: number, z: number): Record<string, number> => {
      const got = analyse(x, z).layers
      return Object.fromEntries(layerNames.map((name, k) => [name, got[k]]))
    },
    rules: (list: Rule[], what: string) => rules(list, what, program.biomes, layerNames, names),
    ray(origin: number[], dir: number[], far: number): number[] | undefined {
      const len = math.hypot(dir[0], dir[1], dir[2])
      const d = [dir[0] / len, dir[1] / len, dir[2] / len]
      const at = (t: number) => [origin[0] + d[0] * t, origin[1] + d[1] * t, origin[2] + d[2] * t]
      const below = (t: number) => { const p = at(t); return p[1] <= height(p[0], p[2]) }
      if (below(0)) return origin.slice()
      const step = analysis.slopeStep
      for (let t0 = 0; t0 < far; t0 += step) {
        let t1 = Math.min(t0 + step, far)
        if (!below(t1)) continue
        let a = t0
        for (let i = 0; i < 60 && t1 - a > 1e-6; i++) {
          const m = (a + t1) / 2
          if (below(m)) t1 = m
          else a = m
        }
        return at(t1)
      }
      return undefined
    },
    // The raw ground as layer k leaves it: the program, layer k and every layer before it.
    through(k: number, x: number, z: number) {
      if (!layers[k]) throw new Error(`terrain3d has no layer ${k}`)
      return under(k + 1, x, z)
    },
    stroke(k: number, s: Stroke) {
      if (!layers[k]) throw new Error(`terrain3d has no layer ${k}`)
      const r = baked(k)
      const was = unsaved[k]
      if (was) restore(k, r)
      else kept[k] = copy(r)
      unsaved[k] = s
      bake(k, r, s)
      // The pixels the stroke it replaces had changed, and the ones it changes.
      reached(k, r, was ? union(box(was, r.d), box(s, r.d)) : box(s, r.d))
    },
    discard(k: number) {
      if (!layers[k]) throw new Error(`terrain3d has no layer ${k}`)
      const was = unsaved[k]
      if (!was) return
      const r = baked(k)
      restore(k, r)
      unsaved[k] = undefined
      kept[k] = undefined
      reached(k, r, box(was, r.d))
    },
    unsaved: (k: number): Stroke | undefined => unsaved[k],
    version: (k: number) => rasters[k]?.version ?? 0,
    rect: (k: number) => extent(k, grow),
    edits(): Edits { return { land: me, layers: layers.map((_, k) => ({ version: me.version(k), rect: me.rect(k) })) } },
  }
  return me
}

// ---------------------------------------------------------------- the process's lands

const lands = new WeakMap<object, { values: unknown[]; text: string; land: Land }>()

// Whether every top-level value of `field` is the one in `values`, in order.
const unchanged = (field: Field, values: unknown[]) => {
  let i = 0
  for (const key in field) if ((field as Record<string, unknown>)[key] !== values[i++]) return false
  return i === values.length
}

export function landOf(field: Field): Land {
  const had = lands.get(field)
  if (had && unchanged(field, had.values)) return had.land
  const values = Object.values(field)
  const text = JSON.stringify(field)
  if (had && had.text === text) {
    had.values = values
    return had.land
  }
  const made = land(field)
  lands.set(field, { values, text, land: made })
  return made
}

// ---------------------------------------------------------------- the queries

const landIn = (w: W) => landOf(json(w, w.world.terrain3d.field))

export const heightAt = (w: W, x: number, z: number) => landIn(w).height(x, z)
export const rawAt = (w: W, x: number, z: number) => landIn(w).raw(x, z)
export const depthAt = (w: W, x: number, z: number) => landIn(w).depth(x, z)
export const normalAt = (w: W, x: number, z: number, step: number) => landIn(w).normal(x, z, step)
export const restsAt = (w: W, x: number, z: number, span: number) => landIn(w).rests(x, z, span)
export const paintAt = (w: W, x: number, z: number) => landIn(w).paint(x, z)
export const occludes = (w: W, a: number[], b: number[]) => landIn(w).occludes(a, b)
export const analyse = (w: W, x: number, z: number) => landIn(w).analyse(x, z)
export const ramp = (w: W, rule: Rule, x: number, z: number) => landIn(w).ramp(rule, x, z)
export const edits = (w: W) => landIn(w).edits()
export const ray = (w: W, origin: number[], dir: number[], far: number) => landIn(w).ray(origin, dir, far)
