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
//           reach ("kitchen").
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
//           and `bake` the rules the bake makes it by, for a graph the bake makes (The bake, below).
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
// step with no `normal` stands on [0, 1, 0]. It is undefined when there is no way. Each end joins the
// graph: on a graph with blocks, `from` to every place a straight walk reaches across none of them, and
// every such place to the goal place, and `from` straight to the goal place when that walk crosses none,
// the walks and the blocks taken across the ground; on one with none, each end to its nearest place,
// nearest in all three, so an end on one level of a graph of levels joins a place of its own level and
// not one over or under it. A join costs its length, in all three. A tag's route ends at the cheapest
// place it tags. A way's cost is its word's behavior's; one undefined is not taken. The search is
// Dijkstra's, every place in the graph's order, so two runs of one question give one answer, on the
// server and on a page running ahead.
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
// The bake throws naming the mod when the scene names no `height` or `link`. A route asks none of them
// but `behaviors`.
import type { W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { drawn } from '#plugins/shapes3d/shapes3d.kinematics3d.ts'

export type Footprint = { points: number[][]; round: number }
export type Rules = { area: number[]; clearance: number; around: number; [more: string]: unknown }
export type Data = { nav3d?: { tags?: string[]; word?: string; cost?: number; one?: boolean }; [block: string]: any }
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
type Entry = { asset: string; bake?: Rules }

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

function entryOf(w: W, name: string): Entry {
  const e = w.world.nav3d?.graphs?.[name] as Entry | undefined
  if (!e) throw new Error(`nav3d has no graph ${name}: world.nav3d.graphs names ${Object.keys(w.world.nav3d?.graphs ?? {}).join(', ') || 'none'}`)
  return e
}

// ---------------------------------------------------------------- the file

// A graph read: its file, and each way's two places and its own cost, worked out once.
type Read = { g: Graph; ends: [number, number][]; costs: number[] }

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
  const r = { g, ends, costs }
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

export function route(w: W, name: string, from: number[], to: number[] | string, who?: unknown): Step[] | undefined {
  const { g, ends, costs } = read(name, json(w, entryOf(w, name).asset) as Graph)
  const n = g.places.length
  const spot = (i: number) => g.places[i].point.at
  const ground = (p: number[]) => [p[0], p[2]]
  const far = (a: number[], b: number[]) => math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  // The places an end joins.
  const nearest = (p: number[]) => {
    let best = -1
    for (let i = 0; i < n; i++) if (best < 0 || far(p, spot(i)) < far(p, spot(best))) best = i
    return best < 0 ? [] : [best]
  }
  const joins = (p: number[]) => (g.blocks ? [...Array(n).keys()].filter(i => clear(g.blocks!, ground(p), ground(spot(i)))) : nearest(p))
  const goalAt = typeof to === 'string' ? undefined : to
  const goals = new Map<number, number>()
  if (typeof to === 'string') for (let i = 0; i < n; i++) { if (g.places[i].data?.nav3d?.tags?.includes(to)) goals.set(i, 0) }
  else for (const i of joins(to)) goals.set(i, far(spot(i), to))

  // Dijkstra's over the places, from `from`'s joins.
  const cost = new Array<number>(n).fill(Infinity)
  const back = new Array<{ place: number | null; way: number | null }>(n)
  for (const i of joins(from)) { cost[i] = far(from, spot(i)); back[i] = { place: null, way: null } }
  const out = Array.from({ length: n }, () => [] as { to: number; way: number }[])
  g.ways.forEach((wy, k) => {
    const [a, b] = ends[k]
    out[a].push({ to: b, way: k })
    if (!wy.data?.nav3d?.one) out[b].push({ to: a, way: k })
  })
  const done = new Array<boolean>(n).fill(false)
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && cost[i] < Infinity && (u < 0 || cost[i] < cost[u])) u = i
    if (u < 0) break
    done[u] = true
    for (const { to: v, way } of out[u]) {
      if (done[v]) continue
      const c = costOf(w, g.ways[way], costs[way], who)
      if (c === undefined) continue
      if (cost[u] + c < cost[v]) { cost[v] = cost[u] + c; back[v] = { place: u, way } }
    }
  }

  // The cheapest end: straight from `from` to the goal place, or a goal place and its join.
  let best = goalAt && g.blocks && clear(g.blocks, ground(from), ground(goalAt)) ? far(from, goalAt) : Infinity
  let end = -1
  for (const [i, c] of goals) if (cost[i] + c < best) { best = cost[i] + c; end = i }
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
  for (let i: number | null = end < 0 ? null : end; i !== null; i = back[i].place) {
    const k = back[i].way
    steps.unshift(up({ at: [...spot(i)], place: i, way: k === null ? null : g.ways[k], course: k === null ? null : courseOf(k, i) }, i))
  }
  if (goalAt) {
    const goal: Step = { at: [goalAt[0], goalAt[1], goalAt[2]], place: null, way: null, course: null }
    steps.push(end < 0 ? goal : up(goal, end))
  }
  return steps
}
