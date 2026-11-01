// kinematics3d: where a body's place on its target goes when the body wants to move. A target is a
// point, a line, a plane, the triangles of the land, a curve: anything a plugin that supplies targets
// hands out (shapes3d's `point`, `line` and `plane`, terrain3d's `triangles`), or a behavior wrapping
// one (motion3d's `move` and `jump`: how a body moves on any of them). Gravity is its own.
// kinematics3d never knows what any target is: it runs the behavior of the target's word, which steps
// the place within the target's own space and stops it at the target's edges.
// Its server half (this file) has no row and no browser half: the functions a body's rule calls.
//
// A target is plain data under its word, `{ <word>: <shape> }` (`{ line: { from, to, yaw } }`). Its
// place is the body's place in the target's space, as the word's behavior keeps it: a distance along a
// line, two distances across a plane, nothing on a point, the body's `pos` on the triangles. A
// want is which way and how fast the body wants to go within that space, as many numbers as the space
// has ways, metres a second (stick right shimmies right along a ledge, no stick holds still).
//
// Behaviors. Every word comes from the plugin that brings targets of it, through
// `world.kinematics3d.mods.behaviors: ['<a>', ...]`, each `<a>.kinematics3d.ts` exporting
// `behaviors()`, `{ <word>: { step, at } }`, laid over one another in the list's order, a later one's
// word taking the place of an earlier one's. kinematics3d has none of its own. A word nothing delivered
// throws, naming it. Each is handed the body it moves, its row and its truth's `w`.
//   step(shape, place, want, dt, me, w)   the place moved by `want` for `dt` seconds, stopped at the edges
//   at(shape, place, me, w)               where the place stands in the world: `at` [x, y, z] metres,
//                                         `normal` the target's up there, a unit vector, and `yaw` its
//                                         facing, radians
//   nearest(shape, point, me, w)          the place nearest a point [x, y, z] in the world, within the edges
//   ways(shape, place, me, w)             the ways the place moves from there, each `{ dir, from, lo, hi }`:
//                                         `dir` a unit vector in the world, the place's number along it
//                                         measured from the world point `from`, between `lo` and `hi`; one
//                                         way to each number of the place, in its order
// A behavior may wrap a shape, its own shape another target (`{ move: { line: { ... } } }`): it answers
// each of the four through that target, by `step`, `at`, `nearest` and `ways` here.
//   footing?(pos, yaw, me, w)             where a body standing at `pos` [x, y, z] facing `yaw` is now that
//                                         the floor under it has moved (shapes3d's moved shapes), or
//                                         undefined where it has not: a body's step puts a grounded body
//                                         whose place is its `pos` there before it moves it, so a body
//                                         stands still on a moving floor
//
// What stands on the land: `world.kinematics3d.mods.solids`, each `<a>.kinematics3d.ts` exporting
// `solids(w, x, z, r)`, the things reaching within r of (x, z) under their words (shapes3d's boxes,
// cylinders and planes), and `world.kinematics3d.mods.footprints`, each exporting `footprints()`, each
// word's outline, underside and top. terrain3d's `triangles` stands a body on them and walks it round
// them.
//
// Gravity is kinematics3d's own. A body's step, the outermost `step` (a behavior stepping the target it
// wraps is inside it), runs the target's word's behavior, then asks whether the target holds the body
// up: the body is not going up off it (its `vel` less what lies along the target's ways, a jump's), and
// the target under where the place stands (`nearest`, then `at`) reaches it. Held, the row's `grounded`
// is true. Else it is false, and gravity pulls it: its vertical speed less `gravity`·dt, its place's
// height carried by it through the target's own step, stood on the target where it comes down onto it
// (`landed` that step). A body in the air is moved by that fall alone, its `vel` across eased toward the
// want by 1 − exp(−airAccel·dt), not by the behavior. Falling is the body in the air going down; rising,
// in the air going up. A drop the target follows (terrain3d's stairs, up to its `step`) holds the body up
// all the way down, so it never falls.
//
// `step(w, target, place, want, dt, me)`, `at(w, target, place, me)`, `nearest(w, target, point, me)` and
// `ways(w, target, place, me)` run the target's word's behavior. A place's numbers, one to each way, are
// `parts(place)`, and `joined(numbers, like)` is the place of those numbers in the form of `like`: a
// number on its own, a list, or none. `spans(ways)` is whether ways span the ground: two of them laid
// across it that do not run the same way (the ground, a ceiling, the water; not a wall, a line or a
// point).
//
// States. `is(me, w, word)` is whether the body is in the state `word`, as it was last moved. Built in:
// `stopped`, its place stopped at a target's edge (the row's `stopped`, written by whatever moved it along
// the target: the way it was pushed when it stopped, or false); `ground`, held up by its target; `rest`,
// held up by its target with nothing asking it to move (its rule's `want` none);
// `falling`, in the air going down; `rising`, in the air going up; `landed`, come down onto its target
// this step. More come from
// `world.kinematics3d.mods.states`, each `<a>.kinematics3d.ts` exporting `states()`, `{ <word>: (me, w)
// => boolean }`, laid over the built-in in the list's order; a word nothing has throws, naming it. A
// move's `when` may write a word `!word`, the state not true.
//
// `relative(stick, yaw)` is the camera-relative stick, forward along (sin yaw, cos yaw).
//
// The numbers, `world.kinematics3d.kinds.<kind>`: each body's, by the kind its row's `as` names, else its
// own (`kindOf`), one block to each behavior that reads them, under that behavior's word (`triangles`,
// `move`, `jump`); each behavior's header says its block's numbers and checks them. kinematics3d's own is
// `fall`, `{ gravity, airAccel }`, m/s² and 1/s, each above 0 (`fallOf`). `numbers(me, w)` is
// the row's kind's entry; a kind the table has none of throws, naming it.
import type { Row, W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'

export type Place = number | number[] | null
export type Where = { at: number[]; normal: number[]; yaw: number }
export type Way = { dir: number[]; from: number[]; lo: number; hi: number }
export type Behavior = {
  step: (shape: unknown, place: Place, want: number[], dt: number, me: Row, w: W) => Place
  at: (shape: unknown, place: Place, me: Row, w: W) => Where
  nearest: (shape: unknown, point: number[], me: Row, w: W) => Place
  ways: (shape: unknown, place: Place, me: Row, w: W) => Way[]
  footing?: (pos: number[], yaw: number, me: Row, w: W) => { pos: number[]; yaw: number } | undefined
}
export type Behaviors = () => Record<string, Behavior>
export type Target = Record<string, unknown>
export type State = (me: Row, w: W) => boolean

// Every word the scene's mods deliver, laid in their list's order, made once per world.
const targetTables = new WeakMap<object, Record<string, Behavior>>()
function targets(w: W): Record<string, Behavior> {
  let t = targetTables.get(w.world)
  if (!t) {
    t = {}
    for (const behaviors of modsOf<Behaviors>(w.world, 'kinematics3d', 'behaviors')) Object.assign(t, behaviors())
    targetTables.set(w.world, t)
  }
  return t
}

// Where the first of the delivered behaviors' footings that answers puts a body at `pos`.
function footing(w: W, pos: number[], me: Row): { pos: number[]; yaw: number } | undefined {
  for (const f of new Set(Object.values(targets(w)).map(b => b.footing))) {
    const borne = f?.(pos, me.data.yaw ?? 0, me, w)
    if (borne) return borne
  }
  return undefined
}

// The target's word, its shape, and the behavior delivered for it.
function of(w: W, target: Target): { b: Behavior; shape: unknown } {
  const [word] = Object.keys(target)
  const b = targets(w)[word]
  if (!b) throw new Error(`kinematics3d has no target ${word}: no plugin world.kinematics3d.mods.behaviors names delivers it`)
  return { b, shape: target[word] }
}

// How deep in a body's step a call is: a behavior wrapping a target steps it here too, and only the
// outermost call, the body's own step, asks what holds the body up.
let depth = 0

export function step(w: W, target: Target, place: Place, want: number[], dt: number, me: Row): Place {
  const { b, shape } = of(w, target)
  if (depth > 0) return b.step(shape, place, want, dt, me, w)
  const d = me.data
  depth++
  try {
    // In the air, kinematics3d's own fall; on the target, the motion's behavior, then gravity where
    // nothing holds the body up.
    if (d.grounded === false) return fall(w, target, place, want, dt, me, true)
    // A body standing on a floor that has moved is first put where the floor took it.
    const borne = Array.isArray(place) && place.length === 3 ? footing(w, place, me) : undefined
    if (borne) {
      place = borne.pos
      d.yaw = borne.yaw
    }
    const moved = b.step(shape, place, want, dt, me, w)
    if (holds(w, target, moved, me)) {
      d.grounded = true
      d.landed = false
      return moved
    }
    d.grounded = false
    d.landed = false
    return fall(w, target, moved, [0, 0, 0], dt, me, false)
  } finally {
    depth--
  }
}

// The innermost target of one a behavior wraps (`{ move: { triangles: {} } }`): the shape under each
// word the scene delivers a behavior for, while that shape is itself a target.
function innermost(w: W, target: Target): Target {
  let t = target
  for (;;) {
    const { shape } = of(w, t)
    const inner = shape && typeof shape === 'object' && Object.keys(shape).length === 1 ? (shape as Target) : undefined
    if (!inner || !targets(w)[Object.keys(inner)[0]]) return t
    t = inner
  }
}

// Whether the target holds the body up at `place`: the body is not going up off the target (its `vel`
// less what lies along the target's ways there, a jump's), and the target under where the place stands
// reaches it.
function holds(w: W, target: Target, place: Place, me: Row): boolean {
  const vel: number[] = me.data.vel ?? [0, 0, 0]
  const off = ways(w, target, place, me).reduce((v, way) => {
    const s = v[0] * way.dir[0] + v[1] * way.dir[1] + v[2] * way.dir[2]
    return [v[0] - s * way.dir[0], v[1] - s * way.dir[1], v[2] - s * way.dir[2]]
  }, vel)
  if (off[1] > TOLERANCE) return false
  const p = at(w, target, place, me).at
  const q = at(w, target, nearest(w, target, p, me), me).at
  return q[1] >= p[1] - TOLERANCE
}

// The fall (`world.kinematics3d.kinds.<kind>.fall`): gravity pulling the body down, its place's height
// carried down or up by its vertical speed, moved across by its `vel`, eased toward the want by
// `airAccel` where `across` (in the air all the step), and stood on the target where it comes down onto it.
function fall(w: W, target: Target, place: Place, want: number[], dt: number, me: Row, across: boolean): Place {
  const k = fallOf(me, w)
  const d = me.data
  const inner = innermost(w, target)
  const { b, shape } = of(w, inner)
  const was = d.vel ?? [0, 0, 0]
  const ease = 1 - math.exp(-k.airAccel * dt)
  const vx = across ? was[0] + (want[0] - was[0]) * ease : 0
  const vz = across ? was[2] + (want[2] - was[2]) * ease : 0
  let vy = (was[1] ?? 0) - k.gravity * dt
  const [px, py, pz] = at(w, inner, place, me).at
  const moved = b.step(shape, [px, py + vy * dt, pz], [vx, 0, vz], dt, me, w) as number[]
  if (holds(w, inner, moved, me)) {
    d.grounded = true
    d.landed = true
    vy = 0
  }
  d.vel = across ? [(moved[0] - px) / dt, vy, (moved[2] - pz) / dt] : [was[0], vy, was[2]]
  d.speed = math.hypot(d.vel[0], d.vel[2])
  return moved
}

const TOLERANCE = 1e-6

// The fall's numbers, `{ gravity, airAccel }`, m/s² and 1/s, each a number above 0, checked the first
// time each block is read.
type Fall = { gravity: number; airAccel: number }
const fallsChecked = new WeakSet<object>()
export function fallOf(me: Row, w: W): Fall {
  const k = numbers(me, w).fall as Fall | undefined
  if (k && fallsChecked.has(k)) return k
  if (!k) throw new Error(`kinematics3d kind ${kindOf(me)} gives no fall, which kinematics3d's gravity reads`)
  for (const f of ['gravity', 'airAccel'] as const) {
    if (!Number.isFinite(k[f]) || !(k[f] > 0)) throw new Error(`kinematics3d kind ${kindOf(me)}: fall.${f} ${k[f]} is not a number above 0`)
  }
  fallsChecked.add(k)
  return k
}

export function at(w: W, target: Target, place: Place, me: Row): Where {
  const { b, shape } = of(w, target)
  return b.at(shape, place, me, w)
}

export function nearest(w: W, target: Target, point: number[], me: Row): Place {
  const { b, shape } = of(w, target)
  return b.nearest(shape, point, me, w)
}

export function ways(w: W, target: Target, place: Place, me: Row): Way[] {
  const { b, shape } = of(w, target)
  return b.ways(shape, place, me, w)
}

// Whether ways span the ground: two of them that do not run the same way, the surface they lie in
// facing more up than sideways (the land, a ceiling, the water; not a wall, nor a slab leaning back).
export function spans(all: Way[]): boolean {
  const dirs = all.map(way => way.dir).filter(d => math.hypot(d[0], d[1], d[2]) > 1e-9)
  return dirs.some(a => dirs.some(b => {
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
    const size = math.hypot(n[0], n[1], n[2])
    return size > 1e-9 * math.hypot(a[0], a[1], a[2]) * math.hypot(b[0], b[1], b[2]) && Math.abs(n[1]) > math.hypot(n[0], n[2])
  }))
}

export const parts = (place: Place): number[] => (place === null ? [] : typeof place === 'number' ? [place] : place)
export const joined = (numbers: number[], like: Place): Place => (like === null ? null : typeof like === 'number' ? numbers[0] : numbers)

const BUILT: Record<string, State> = {
  stopped: me => !!me.data.stopped,
  ground: me => me.data.grounded !== false,
  rest: me => me.data.grounded !== false && !((me.data.want ?? []).some((v: number) => v !== 0)),
  falling: me => me.data.grounded === false && (me.data.vel?.[1] ?? 0) < 0,
  rising: me => me.data.grounded === false && (me.data.vel?.[1] ?? 0) > 0,
  landed: me => me.data.landed === true,
}

// Every state word the scene has: the built-in, and over it each mod's in the order they are named;
// made once per scene's `world`.
const statesMade = new WeakMap<object, Record<string, State>>()
function statesOf(world: object): Record<string, State> {
  let all = statesMade.get(world)
  if (!all) {
    all = { ...BUILT }
    for (const m of modsOf<() => Record<string, State>>(world, 'kinematics3d', 'states')) Object.assign(all, m())
    statesMade.set(world, all)
  }
  return all
}

export function is(me: Row, w: W, word: string): boolean {
  const s = statesOf(w.world)[word]
  if (!s) throw new Error(`kinematics3d has no state ${word}: none built in, and no plugin world.kinematics3d.mods.states names delivers it`)
  return s(me, w)
}

// The kind whose entry a row moves by: the kind its `as` names, or its own. A seat's `player` row that
// is one of several bodies, an `xbot` or a `ybot`, names it in `as`.
export const kindOf = (me: Row): string => (typeof me.data.as === 'string' ? me.data.as : me.kind)

export function numbers(me: Row, w: W): Record<string, any> {
  const kind = kindOf(me)
  const k = (w.world.kinematics3d?.kinds as Record<string, Record<string, any>> | undefined)?.[kind]
  if (!k) throw new Error(`kinematics3d kinds has no kind ${kind}`)
  return k
}

export function relative(stick: number[], yaw: number): number[] {
  const s = math.sin(yaw), c = math.cos(yaw)
  const x = stick[1] * s - stick[0] * c
  const z = stick[1] * c + stick[0] * s
  const m = math.hypot(x, z)
  return m > 1 ? [x / m, z / m] : [x, z]
}
