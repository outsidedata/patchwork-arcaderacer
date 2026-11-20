// nav3d, the server half: the way from one place to another over a graph, a model of the space and not
// the space itself. It has no row. It moves nothing: it answers which way, and whoever drives a body
// (an NPC's plugin) walks it there through the body's own plugin (walker, crowd3d).
//
// A graph is made of shapes3d's shapes: its places are points and its ways are lines and splines, in
// shapes3d's own words, each with a `data` block beside its word, `{ <plugin or word>: { … } }`, that
// carries everything about it that is not its shape. What a person does on a stretch of the graph is
// said where it happens, on the shape: a ledge's way says to balance (`data.crowd3d.clip`), a door's way
// says who may go through it (`data.door`), and whoever walks the route reads it off the step.
//
// A graph is a data file, a `json` entry of the scene's loader catalogue, made before the game runs: by
// a level's own generator, which knows its rooms and doors as it makes them, or by the bake (`graphOf`,
// below; `nav3d.bake.ts` writes it), which reads the space. nav3d reads either the same way:
//   places  `[{ point: { at: [x, y, z], normal? }, data? }]`: shapes3d points, metres. `normal` [x, y, z],
//           a unit vector, is the up of the ground there, for a graph walked on a wall or a ceiling; a
//           place without one stands on [0, 1, 0]. `data.nav3d.tags` are names a route may be asked to
//           reach ("kitchen"). `data.nav3d.moe`, metres, is how wide a square across the ground the
//           place spreads over: each route that goes to it goes to a spot of its own in that square
//           about `at`, x and z each rolled within moe / 2 of it, its height kept (Routes, below).
//   ways    `[{ line: { from, to } , data? }]` or `[{ spline: { points }, data? }]`: shapes3d lines and
//           splines, each a way between the two places its ends stand on (within MATCH of a place's
//           `at`). A line is the straight way from `from` to `to`; a spline the curve through `points`,
//           from its first to its last: a curved stair, a ramp round a tower. Its first-class fields are
//           its shape; everything else is its data:
//             `data.nav3d.word`  what it is, `stair`, `door`, `room`, `ground`, the word its behavior is
//                                found by (Behaviors, below); a way with none has no behavior
//             `data.nav3d.cost`  what crossing it costs as the file was made; its length along its
//                                shape, as shapes3d draws it, when it gives none
//             `data.nav3d.one`   true: crossed from its first end to its last alone
//             `data.<word>`      the word's own numbers, handed to its behavior
//             `data.<anything>`  any other block, carried on the step for whoever walks it
//   blocks  optional: `[[[x, z], …], …]`, convex outlines on the ground no straight walk crosses, the
//           shapes the bake read grown by its clearance. A route joins its ends to the graph across them
//           (Routes, below). A graph with none joins each end to its nearest place.
// A graph file of the wrong shape throws, naming the graph and what is wrong, the first time it is read:
// a place that is not one point, a way that is not one line or spline, a way's end on no place or on two.
//
// Its numbers are the scene's `world.nav3d`:
//   graphs  `{ <name>: { asset, bake? } }`: each graph by name, `asset` the catalogue entry of its file,
//           and `bake` the rules the bake makes it by, for a graph the bake makes (The bake, below). The
//           `graphs` mods give more (Mods, below).
//   mods    the plugins it asks (Mods, below).
//
// Behaviors. A way costs to cross its own cost, whatever its word. A word whose ways cost something else
// now, or cannot be crossed now (a door locked, a door for the staff alone), has a behavior: `(w, data,
// way, who) → cost | undefined`, `data` the way's `data.<word>`, `who` whatever the route was asked for
// (a row, a name; undefined when it was asked for nobody). A behavior is delivered by the plugin that
// brings ways of its word, through `world.nav3d.mods.behaviors`, each exporting `behaviors()`,
// `{ <word>: <behavior> }`, laid over one another in the list's order, a later one's taking the place of
// an earlier one's. `wordOf(way)` is a way's word.
//
// Routes. `route(w, name, from, to, who?)` is the cheapest way over graph `name` from `from` [x, y, z] to
// `to`, a place [x, y, z] or a tag, for `who`: a list of steps `{ at: [x, y, z], place, way, course,
// normal? }`, each a place to go to next, its height with it (a place's own, or the goal place's as it
// was asked), the place it is (its index; null for the goal place), the way that reaches it (null for a
// step that joins the graph), `course` the way's shape run the way the route crosses it, ending at `at`
// (`{ line: { from, to } }` or `{ spline: { points } }`; null with no way), and the up there where the
// graph gives one: a place's own `normal`, and the goal place's the normal of the place it joins from. A
// step with no `normal` stands on [0, 1, 0]. A step to a place with a `moe` goes to that place's
// spot for this route: `at` moved across the ground by `w.die()`, x and z each within moe / 2, and the
// ends of the courses into and out of it moved with it; its height and the search are the place's own.
// It is undefined when there is no way. Each end joins the
// graph: on a graph with blocks, `from` to every place a straight walk reaches across none of them, and
// every such place to the goal place, and `from` straight to the goal place when that walk crosses none,
// the walks and the blocks taken across the ground; on one with none, each end to its nearest place,
// nearest in all three, so an end on one level of a graph of levels joins a place of its own level and
// not one over or under it. A join costs its length, in all three. A tag's route ends at the cheapest
// place it tags. A way's cost is its word's behavior's; one undefined is not taken. The search is
// Dijkstra's over a heap, the lower-numbered of two places at one cost taken first, so two runs of one
// question give one answer, on the server and on a page running ahead. On a graph with no blocks whose
// ways' words have no behavior in the scene, every way costs its own and never anything else, so the
// cheapest way from a place to every other is worked out once, the first time a route sets out from
// that place, and kept for as long as the graph's file is: every later route from there is read off it.
// Any other graph is searched for each route, from `from`'s joins, stopping once no place left can end
// cheaper than the cheapest end found.
//
// The bake. `graphOf(w, name)` makes graph `name` from the space, by `world.nav3d.graphs.<name>.bake`:
//   area       `[x0, z0, x1, z1]` metres: the play area. The ground goes on for ever; the graph stops here.
//   clearance  metres: how far from a solid's footprint every place and every way keeps.
//   around     a whole number, at least 3: how many places ring a round footprint.
//   …          any more, read by the `link` mod (terrain3d's `sample`, `slope`, `wade`).
// Each footprint the `solids` mods hand within the area is grown by its own rounding and the clearance
// into a convex outline: a round one into a ring of `around` corners, far enough out that the ring holds
// the circle; any other by moving each side out along its normal, its corners where the moved sides
// meet; one of two points into the rectangle about them. Those are the graph's blocks. A place is put at
// each corner of each block, in the area and inside no block, its height the `height` mod's. Two places
// are joined by a line when the straight walk between them crosses no block (a walk along a block's side
// does not) and the `link` mod says the ground lets it be walked: it hands back the way's cost and its
// word with the word's data, and the line carries them, `data: { nav3d: { word, cost }, <word>: { … } }`.
// Places and ways are in the order the mods hand the footprints, so a bake of one scene is the same file
// every time.
//
// Mods, `world.nav3d.mods`, each named by the plugin that gives it:
//   solids     many: `(w, area) → Footprint[]`, every solid that stands in the area, as a footprint:
//              `{ points: [[x, z], …], round }`, a convex outline, one point for a round thing, taken
//              `round` metres wider all round (`shapes3d.nav3d.ts`).
//   height     one: `(w, x, z) → metres`, the ground under a place (`terrain3d.nav3d.ts`).
//   link       one: `(w, a, b, rules) → { cost, <word>: { … } } | undefined`, whether the ground lets a
//              straight walk from `a` to `b` [x, z] be made, by the bake's rules, and as what
//              (`terrain3d.nav3d.ts`, `ground`).
//   behaviors  many: the words' behaviors (Behaviors, above).
//   graphs     many: `(world) → { <name>: { asset } }`, more graphs by name, beside `world.nav3d.graphs`,
//              from the plugin that makes the scene's place (world3d's, `world3d.nav3d.ts`); a graph a mod
//              gives is made by that plugin's own build, never by the bake. `graphsOf(world)` is every
//              graph of the scene.
// The bake throws naming the mod when the scene names no `height` or `link`. A route asks none of them
// but `behaviors` and `graphs`.
import type { W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { drawn } from '#plugins/shapes3d/shapes3d.kinematics3d.ts'

export type Footprint = { points: number[][]; round: number }
export type Rules = { area: number[]; clearance: number; around: number; [more: string]: unknown }
export type Data = { nav3d?: { tags?: string[]; moe?: number; word?: string; cost?: number; one?: boolean }; [block: string]: any }
export type Place = { point: { at: number[]; normal?: number[] }; data?: Data }
export type Line = { line: { from: number[]; to: number[]; normal?: number[] }; data?: Data }
export type Spline = { spline: { points: number[][]; normal?: number[] }; data?: Data }
export type Way = Line | Spline
export type Course = { line: { from: number[]; to: number[] } } | { spline: { points: number[][] } }
export type Graph = { places: Place[]; ways: Way[]; blocks?: number[][][] }
export type Step = { at: number[]; place: number | null; way: Way | null; course: Course | null; normal?: number[] }
export type Solids = (w: W, area: number[]) => Footprint[]
export type Height = (w: W, x: number, z: number) => number
export type Linker = (w: W, a: number[], b: number[], rules: Rules) => ({ cost: number } & Record<string, unknown>) | undefined
export type Behavior = (w: W, data: any, way: Way, who: unknown) => number | undefined
export type Entry = { asset: string; bake?: Rules }
export type Graphs = (world: Record<string, any>) => Record<string, Entry>

// How far inside a block's sides a point must be to count as inside it: a walk along a side, or a
// place on a corner, is outside.
const EPS = 1e-7
// How near a way's end must be to a place's `at` to stand on it, metres.
const MATCH = 1e-3

export const wordOf = (way: Way): string | undefined => way.data?.nav3d?.word

// A way's shape's points from its first end to its last.
export const pointsOf = (way: Way): number[][] => ('line' in way ? [way.line.from, way.line.to] : way.spline.points)

// A way's length along its shape, as shapes3d draws a spline: its cost when its data gives none.
export function lengthOf(way: Way): number {
  if ('line' in way) {
    const [p, q] = [way.line.from, way.line.to]
    return math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])
  }
  const { at } = drawn(way.spline)
  return at[at.length - 1]
}

// Every graph of a scene by name: `world.nav3d.graphs`, and each `graphs` mod's.
export const graphsOf = (world: Record<string, any>): Record<string, Entry> =>
  Object.assign({ ...(world.nav3d?.graphs ?? {}) }, ...modsOf<Graphs>(world, 'nav3d', 'graphs').map(f => f(world)))

function entryOf(w: W, name: string): Entry {
  const all = graphsOf(w.world)
  const e = all[name]
  if (!e) throw new Error(`nav3d has no graph ${name}: world.nav3d.graphs and its graphs mods name ${Object.keys(all).join(', ') || 'none'}`)
  return e
}

// ---------------------------------------------------------------- the file

// A graph read: its file, each way's two places and its own cost, each place's ways out (`outTo` the
// place each reaches, `outWay` the way), the places' `at` one after another in `flat`, all worked out
// once; `trees`, each place's cheapest ways to every other at the ways' own costs, worked out the first
// time a route sets out from it; and `fixed`, by the behaviors a world has, whether every way costs its
// own cost there (no way's word has a behavior).
type Tree = { cost: Float64Array; place: Int32Array; way: Int32Array }
type Read = {
  g: Graph
  ends: [number, number][]
  costs: number[]
  outTo: Int32Array[]
  outWay: Int32Array[]
  flat: Float64Array
  trees: (Tree | undefined)[]
  fixed: WeakMap<object, boolean>
}

const isPoint = (p: unknown, n: number) => Array.isArray(p) && p.length === n && p.every(Number.isFinite)
const unit = (n: number[]) => Math.abs(math.hypot(n[0], n[1], n[2]) - 1) <= 1e-6

// A graph file checked once, the first time it is read: it comes from outside the program. It is
// known by its `places` list, which the loader makes anew when the file is written again, reading the
// graph again.
const reads = new WeakMap<object, Read>()
function read(name: string, g: Graph): Read {
  const had = Array.isArray(g?.places) ? reads.get(g.places) : undefined
  if (had) return had
  const bad = (why: string): never => { throw new Error(`nav3d graph ${name}: ${why}`) }
  if (!Array.isArray(g?.places) || !Array.isArray(g?.ways)) bad('a graph is { places: [], ways: [] }')
  const data = (what: string, d: unknown) => {
    if (d !== undefined && (typeof d !== 'object' || d === null || Array.isArray(d))) bad(`${what}'s data is not { <block>: { … } }`)
  }
  g.places.forEach((p, i) => {
    const words = Object.keys(p ?? {}).filter(k => k !== 'data')
    if (words.length !== 1 || words[0] !== 'point') bad(`place ${i} is not one point: a place is { point: { at }, data? }`)
    if (!isPoint(p.point?.at, 3)) bad(`place ${i}'s at is not [x, y, z]`)
    const n = p.point.normal
    if (n !== undefined) {
      if (!isPoint(n, 3)) bad(`place ${i}'s normal is not [x, y, z]`)
      if (!unit(n)) bad(`place ${i}'s normal is not a unit vector`)
    }
    data(`place ${i}`, p.data)
    const tags = p.data?.nav3d?.tags
    if (tags !== undefined && !(Array.isArray(tags) && tags.every(t => typeof t === 'string'))) bad(`place ${i}'s data.nav3d.tags are not a list of names`)
    const moe = p.data?.nav3d?.moe
    if (moe !== undefined && !(Number.isFinite(moe) && moe >= 0)) bad(`place ${i}'s data.nav3d.moe is not a number of 0 or more`)
  })
  const on = (p: number[], i: number, end: string): number => {
    const found: number[] = []
    g.places.forEach((q, k) => { if (math.hypot(p[0] - q.point.at[0], p[1] - q.point.at[1], p[2] - q.point.at[2]) <= MATCH) found.push(k) })
    if (found.length !== 1) bad(`way ${i}'s ${end} end stands on ${found.length} places: it stands on one`)
    return found[0]
  }
  const ends: [number, number][] = []
  const costs: number[] = []
  g.ways.forEach((wy, i) => {
    const words = Object.keys(wy ?? {}).filter(k => k !== 'data')
    if (words.length !== 1 || (words[0] !== 'line' && words[0] !== 'spline')) bad(`way ${i} is not one line or spline: a way is { line: { from, to } } or { spline: { points } }, and data?`)
    if ('line' in wy) {
      if (!isPoint(wy.line?.from, 3) || !isPoint(wy.line?.to, 3)) bad(`way ${i}'s line is not { from: [x, y, z], to: [x, y, z] }`)
    } else if (!Array.isArray(wy.spline?.points) || wy.spline.points.length < 2 || !wy.spline.points.every(p => isPoint(p, 3))) {
      bad(`way ${i}'s spline is not { points }, two or more [x, y, z]`)
    }
    data(`way ${i}`, wy.data)
    const nav = wy.data?.nav3d
    if (nav?.word !== undefined && typeof nav.word !== 'string') bad(`way ${i}'s data.nav3d.word is not a name`)
    if (nav?.cost !== undefined && !(Number.isFinite(nav.cost) && nav.cost >= 0)) bad(`way ${i}'s data.nav3d.cost is not a number of 0 or more`)
    if (nav?.one !== undefined && typeof nav.one !== 'boolean') bad(`way ${i}'s data.nav3d.one is not true or false`)
    const pts = pointsOf(wy)
    ends.push([on(pts[0], i, 'first'), on(pts[pts.length - 1], i, 'last')])
    costs.push(nav?.cost ?? lengthOf(wy))
  })
  if (g.blocks !== undefined && !(Array.isArray(g.blocks) && g.blocks.every(b => Array.isArray(b) && b.length >= 3 && b.every(p => isPoint(p, 2)))))
    bad('blocks are a list of outlines, each three or more [x, z]')
  const n = g.places.length
  const to: number[][] = Array.from({ length: n }, () => [])
  const by: number[][] = Array.from({ length: n }, () => [])
  g.ways.forEach((wy, k) => {
    const [a, b] = ends[k]
    to[a].push(b)
    by[a].push(k)
    if (!wy.data?.nav3d?.one) { to[b].push(a); by[b].push(k) }
  })
  const flat = new Float64Array(n * 3)
  g.places.forEach((p, i) => flat.set(p.point.at, i * 3))
  const r: Read = {
    g, ends, costs, flat,
    outTo: to.map(t => Int32Array.from(t)),
    outWay: by.map(t => Int32Array.from(t)),
    trees: new Array(n).fill(undefined),
    fixed: new WeakMap(),
  }
  reads.set(g.places, r)
  return r
}

export const graph = (w: W, name: string): Graph => read(name, json(w, entryOf(w, name).asset) as Graph).g

// ---------------------------------------------------------------- behaviors

const made = new WeakMap<object, Record<string, Behavior>>()
function behaviorsOf(world: object): Record<string, Behavior> {
  let all = made.get(world)
  if (!all) {
    all = {}
    for (const m of modsOf<() => Record<string, Behavior>>(world, 'nav3d', 'behaviors')) Object.assign(all, m())
    made.set(world, all)
  }
  return all
}

// What a way costs to cross now: its word's behavior's, or its own cost when its word has none;
// undefined when it cannot be crossed now.
function costOf(w: W, way: Way, own: number, who: unknown): number | undefined {
  const word = wordOf(way)
  const behavior = word === undefined ? undefined : behaviorsOf(w.world)[word]
  return behavior ? behavior(w, way.data?.[word!], way, who) : own
}

// ---------------------------------------------------------------- outlines

// A convex outline's sides' outward normals, by the way its corners turn.
function normals(pts: number[][]): number[][] {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    area += p[0] * q[1] - q[0] * p[1]
  }
  const s = area > 0 ? 1 : -1
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]
    const dx = q[0] - p[0], dz = q[1] - p[1], l = math.hypot(dx, dz)
    return [(s * dz) / l, (-s * dx) / l]
  })
}

// Whether the walk from `a` to `b` [x, z] passes inside the convex outline `pts` (Cyrus–Beck): the part
// of it on the inner side of every side, by more than EPS, is longer than nothing.
function crosses(pts: number[][], a: number[], b: number[]): boolean {
  const ns = normals(pts)
  let lo = 0, hi = 1
  for (let i = 0; i < pts.length; i++) {
    const n = ns[i], v = pts[i]
    const f0 = n[0] * (a[0] - v[0]) + n[1] * (a[1] - v[1]) + EPS
    const fd = n[0] * (b[0] - a[0]) + n[1] * (b[1] - a[1])
    if (Math.abs(fd) < 1e-15) {
      if (f0 >= 0) return false
      continue
    }
    const t = -f0 / fd
    if (fd > 0) hi = Math.min(hi, t)
    else lo = Math.max(lo, t)
    if (lo >= hi) return false
  }
  return hi - lo > 1e-12
}

const inside = (pts: number[][], p: number[]) => normals(pts).every((n, i) => n[0] * (p[0] - pts[i][0]) + n[1] * (p[1] - pts[i][1]) < -EPS)
const clear = (blocks: number[][][], a: number[], b: number[]) => !blocks.some(pts => crosses(pts, a, b))

// A footprint grown by its rounding and `clearance` into a convex outline that holds it (The bake).
export function grow(f: Footprint, clearance: number, around: number): number[][] {
  const r = f.round + clearance
  const pts = f.points
  if (pts.length === 1) {
    const out = r / math.cos(Math.PI / around)
    return Array.from({ length: around }, (_, k) => {
      const a = (2 * Math.PI * k) / around
      return [pts[0][0] + out * math.cos(a), pts[0][1] + out * math.sin(a)]
    })
  }
  if (pts.length === 2) {
    const [p, q] = pts
    const dx = q[0] - p[0], dz = q[1] - p[1], l = math.hypot(dx, dz)
    const ux = (dx / l) * r, uz = (dz / l) * r, nx = -uz, nz = ux
    return [[p[0] - ux + nx, p[1] - uz + nz], [q[0] + ux + nx, q[1] + uz + nz], [q[0] + ux - nx, q[1] + uz - nz], [p[0] - ux - nx, p[1] - uz - nz]]
  }
  const ns = normals(pts)
  return pts.map((p, i) => {
    const n1 = ns[(i + pts.length - 1) % pts.length], n2 = ns[i]
    const sx = n1[0] + n2[0], sz = n1[1] + n2[1], k = (2 * r) / (sx * sx + sz * sz)
    return [p[0] + sx * k, p[1] + sz * k]
  })
}

// ---------------------------------------------------------------- the bake

function rulesOf(name: string, b: Rules | undefined): Rules {
  if (!b) throw new Error(`nav3d graph ${name} has no bake: world.nav3d.graphs.${name}.bake gives the rules it is made by`)
  if (!(Array.isArray(b.area) && b.area.length === 4 && b.area.every(Number.isFinite) && b.area[0] < b.area[2] && b.area[1] < b.area[3]))
    throw new Error(`nav3d graph ${name}'s bake area is not [x0, z0, x1, z1] with x0 < x1 and z0 < z1`)
  if (!(Number.isFinite(b.clearance) && b.clearance >= 0)) throw new Error(`nav3d graph ${name}'s bake clearance is not a number of 0 or more`)
  if (!(Number.isInteger(b.around) && b.around >= 3)) throw new Error(`nav3d graph ${name}'s bake around is not a whole number of 3 or more`)
  return b
}

export function graphOf(w: W, name: string): Graph {
  const rules = rulesOf(name, entryOf(w, name).bake)
  const height = mod<Height>(w.world, 'nav3d', 'height')
  if (!height) throw new Error('nav3d\'s bake has no height: world.nav3d.mods names no height')
  const link = mod<Linker>(w.world, 'nav3d', 'link')
  if (!link) throw new Error('nav3d\'s bake has no link: world.nav3d.mods names no link')
  const [x0, z0, x1, z1] = rules.area
  const feet = modsOf<Solids>(w.world, 'nav3d', 'solids').flatMap(f => f(w, rules.area))
  const blocks = feet.map(f => grow(f, rules.clearance, rules.around))
  const spots = blocks.flat().filter(p => p[0] >= x0 && p[0] <= x1 && p[1] >= z0 && p[1] <= z1 && !blocks.some(b => inside(b, p)))
  const places: Place[] = spots.map(p => ({ point: { at: [p[0], height(w, p[0], p[1]), p[1]] } }))
  const ways: Way[] = []
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      if (!clear(blocks, spots[i], spots[j])) continue
      const got = link(w, spots[i], spots[j], rules)
      if (!got) continue
      const { cost, ...words } = got
      const [word] = Object.keys(words)
      ways.push({ line: { from: [...places[i].point.at], to: [...places[j].point.at] }, data: { nav3d: { word, cost }, [word]: words[word] } })
    }
  }
  return { places, ways, blocks }
}

// ---------------------------------------------------------------- routes

// The search. Places come off a binary heap by their cost so far, the lower-numbered of two at one
// cost first, as a scan of the places in the graph's order takes them, so two runs of one question
// give one answer. `seen` the places it starts from at their costs; `wayCost(k)` what way `k` costs to
// cross, undefined when it cannot be; `bound(u, c)`, once place `u` is off the heap at its cost `c`,
// the cheapest end it gives (Infinity for none): the search stops once a place comes off dearer than
// the cheapest of those, since every way left costs 0 or more and no place after it can end cheaper. It hands back each place's cost (Infinity unreached), the place before it on its way
// (-1 a place it started from or one unreached) and the way from there (-1 none).
function search(r: Read, seen: [number, number][], wayCost: (k: number) => number | undefined, bound: (u: number, c: number) => number): Tree {
  const n = r.g.places.length
  const cost = new Float64Array(n).fill(Infinity)
  const place = new Int32Array(n).fill(-1)
  const way = new Int32Array(n).fill(-1)
  const done = new Uint8Array(n)
  let heapC = new Float64Array(16), heapI = new Int32Array(16), size = 0
  const less = (a: number, b: number) => heapC[a] < heapC[b] || (heapC[a] === heapC[b] && heapI[a] < heapI[b])
  const swap = (a: number, b: number) => {
    const c = heapC[a]; heapC[a] = heapC[b]; heapC[b] = c
    const i = heapI[a]; heapI[a] = heapI[b]; heapI[b] = i
  }
  const push = (c: number, i: number) => {
    if (size === heapC.length) {
      const C = new Float64Array(size * 2), I = new Int32Array(size * 2)
      C.set(heapC); I.set(heapI); heapC = C; heapI = I
    }
    let k = size++
    heapC[k] = c; heapI[k] = i
    while (k > 0) { const p = (k - 1) >> 1; if (!less(k, p)) break; swap(k, p); k = p }
  }
  const pop = () => {
    const i = heapI[0]
    size--
    heapC[0] = heapC[size]; heapI[0] = heapI[size]
    for (let k = 0; ;) {
      const l = 2 * k + 1, m0 = l + 1
      let m = k
      if (l < size && less(l, m)) m = l
      if (m0 < size && less(m0, m)) m = m0
      if (m === k) break
      swap(k, m); k = m
    }
    return i
  }
  for (const [i, c] of seen) if (c < cost[i]) { cost[i] = c; push(c, i) }
  let best = Infinity
  while (size > 0) {
    const u = pop()
    if (done[u]) continue
    if (cost[u] > best) break
    done[u] = 1
    best = Math.min(best, bound(u, cost[u]))
    const to = r.outTo[u], by = r.outWay[u]
    for (let e = 0; e < to.length; e++) {
      const v = to[e]
      if (done[v]) continue
      const c = wayCost(by[e])
      if (c === undefined) continue
      if (cost[u] + c < cost[v]) { cost[v] = cost[u] + c; place[v] = u; way[v] = by[e]; push(cost[v], v) }
    }
  }
  return { cost, place, way }
}

// Whether every way of graph `r` costs its own cost in `world`: no way's word has a behavior there.
function fixedIn(r: Read, world: object): boolean {
  let f = r.fixed.get(world)
  if (f === undefined) {
    const all = behaviorsOf(world)
    f = r.g.ways.every(wy => { const word = wordOf(wy); return word === undefined || !all[word] })
    r.fixed.set(world, f)
  }
  return f
}

// The place nearest `p`, nearest in all three; -1 on a graph of none.
function nearestOf(r: Read, p: number[]): number {
  const f = r.flat
  let best = -1, d = Infinity
  for (let i = 0, k = 0; i < r.g.places.length; i++, k += 3) {
    const dx = f[k] - p[0], dy = f[k + 1] - p[1], dz = f[k + 2] - p[2], e = dx * dx + dy * dy + dz * dz
    if (e < d) { d = e; best = i }
  }
  return best
}

export function route(w: W, name: string, from: number[], to: number[] | string, who?: unknown): Step[] | undefined {
  const r = read(name, json(w, entryOf(w, name).asset) as Graph)
  const { g, ends, costs } = r
  const n = g.places.length
  const spot = (i: number) => g.places[i].point.at
  const ground = (p: number[]) => [p[0], p[2]]
  const far = (a: number[], b: number[]) => math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  // The places an end joins.
  const nearest = (p: number[]) => { const i = nearestOf(r, p); return i < 0 ? [] : [i] }
  const joins = (p: number[]) => (g.blocks ? [...Array(n).keys()].filter(i => clear(g.blocks!, ground(p), ground(spot(i)))) : nearest(p))
  const goalAt = typeof to === 'string' ? undefined : to
  const goals = new Map<number, number>()
  if (typeof to === 'string') for (let i = 0; i < n; i++) { if (g.places[i].data?.nav3d?.tags?.includes(to)) goals.set(i, 0) }
  else for (const i of joins(to)) goals.set(i, far(spot(i), to))

  // On a graph with no blocks whose ways all cost their own, `from` joins its one nearest place, and
  // the cheapest way from there to every place is that place's tree, worked out the first time and kept.
  // Otherwise a search from `from`'s joins at what each way costs now, for `who`.
  // The cheapest end: straight from `from` to the goal place, or a goal place and its join.
  let best = goalAt && g.blocks && clear(g.blocks, ground(from), ground(goalAt)) ? far(from, goalAt) : Infinity
  let t: Tree, start = 0
  if (!g.blocks && fixedIn(r, w.world)) {
    const s = nearestOf(r, from)
    if (s < 0) return undefined
    t = r.trees[s] ??= search(r, [[s, 0]], k => costs[k], () => Infinity)
    start = far(from, spot(s))
  } else {
    const seen: [number, number][] = joins(from).map(i => [i, far(from, spot(i))])
    const straight = best
    t = search(r, seen, k => costOf(w, g.ways[k], costs[k], who), (u, c) => Math.min(straight, c + (goals.get(u) ?? Infinity)))
  }
  let end = -1
  for (const [i, c] of goals) if (start + t.cost[i] + c < best) { best = start + t.cost[i] + c; end = i }
  if (best === Infinity) return undefined
  // A way's shape run the way the route crosses it, into place `i`.
  const courseOf = (k: number, i: number): Course => {
    const wy = g.ways[k]
    const forward = ends[k][1] === i
    if ('line' in wy) return forward ? { line: { from: [...wy.line.from], to: [...wy.line.to] } } : { line: { from: [...wy.line.to], to: [...wy.line.from] } }
    const pts = wy.spline.points.map(p => [...p])
    return { spline: { points: forward ? pts : pts.reverse() } }
  }
  // A step with the up of the place it is or joins from, where that place has one.
  const up = (step: Step, i: number): Step => {
    const nr = g.places[i].point.normal
    return nr ? { ...step, normal: [nr[0], nr[1], nr[2]] } : step
  }
  const steps: Step[] = []
  for (let i = end; i >= 0; i = t.place[i]) {
    const k = t.way[i]
    steps.unshift(up({ at: [...spot(i)], place: i, way: k < 0 ? null : g.ways[k], course: k < 0 ? null : courseOf(k, i) }, i))
  }
  // Each place of the route with a `moe` moved across the ground by its own roll, the same for its step's
  // `at` and for the ends of the courses into it and out of it, its height kept.
  for (let s = 0; s < steps.length; s++) {
    const moe = g.places[steps[s].place!].data?.nav3d?.moe
    if (!moe) continue
    const dx = (w.die() - 0.5) * moe, dz = (w.die() - 0.5) * moe
    const move = (p: number[]) => { p[0] += dx; p[2] += dz }
    move(steps[s].at)
    const into = steps[s].course, out = steps[s + 1]?.course
    if (into) move('line' in into ? into.line.to : into.spline.points[into.spline.points.length - 1])
    if (out) move('line' in out ? out.line.from : out.spline.points[0])
  }
  if (goalAt) {
    const goal: Step = { at: [goalAt[0], goalAt[1], goalAt[2]], place: null, way: null, course: null }
    steps.push(end < 0 ? goal : up(goal, end))
  }
  return steps
}
