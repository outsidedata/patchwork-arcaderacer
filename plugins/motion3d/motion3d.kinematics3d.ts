// motion3d's mod for kinematics3d (`addons/scenemanager`'s mods): how a body moves on any target. A scene
// with `world.kinematics3d.mods: { behaviors: [..., 'motion3d'], states: ['motion3d', ...] }` has
// kinematics3d move a body by these words, and read the states they leave on it.
//
// `behaviors()` delivers two words, each wrapping a target of another word (kinematics3d's header), and
// answering `at`, `nearest` and `ways` through it:
//   move   `{ move: <target> }`: the body's place on the target moved by `want` [x, y, z], the way and the
//          speed it is asked to go in the world, metres a second: its `vel` eased toward the want, laid
//          along the target's ways, the place stepped by the target's own behavior, its `vel` read back
//          from where the place went, its part back against what it was asked taken off and no faster
//          than that (kinematics3d's `kept`), so a wall stops it and a push out of a solid never flings
//          it. Where the target's
//          ways span the ground (the ground, a ceiling, the water) the body turns toward `face`, or the
//          way it is asked to go, and its `facing` is written. A move on a way with ends is made only when
//          every such way went as far as it was asked and keeps every bone of the clip's spot within its
//          bounds as the clip has them this step (motion3d's `fits`): a body stopped either way is
//          stopped, and does not slide on along the other
//   jump   `{ jump: <target> }`: moved as `move` moves it until its clip's takeoff, the second its feet
//          leave the ground (`motion3d.play.ts`, Moments; at once for a clip whose feet never leave
//          it); then a body held up by its target and not sliding is given the upward speed
//          √(2·gravity·jumpH), gravity kinematics3d's own (`fall.gravity`), its speed across times
//          jumpVelocityBoostMagnitude, and kinematics3d's gravity takes it from there. It is `leapt`,
//          `{ from }`, the height it left the ground at, while it rises. A clip that comes down again
//          before its end (its landing, Moments) is played from there at the rate that brings its
//          landing to the step the body comes back down to that height (the row's `rate`)
// The jump cut short: a body `leapt` and still rising whose `jumpHeld` is false (its rule's: the jump
// key let go) keeps `cut` of its upward speed, once, and its clip is timed to the new fall (`cutShort`,
// which motion3d's `drive` asks each step); a rule that never sets `jumpHeld` jumps as high as `jumpH`
// every time.
// `states()` delivers the states these leave (`is`): `still` slower than the kind's `move.still`, `moving`
// faster; `pushed` its `want` not none; `reversed` its `want` turned further than the kind's `move.reverse`
// degrees from the way it faces (a kind that gives none throws when asked). kinematics3d reports `ground`, `falling`, `rising` and `landed`.
//
// The numbers, `world.kinematics3d.kinds.<kind>`:
//   move  `{ accel, turnRate, turnMax?, still, reverse? }`: `vel` eases toward the want by 1 − exp(−accel·dt)
//         a step, 1/s; the facing eases toward its aim by 1 − exp(−turnRate·dt) a step, 1/s, at most turnMax
//         rad/s; slower than `still` m/s the body is `still`; its want further than `reverse` degrees, 0 to
//         180, from the way it faces, it is `reversed`
//   jump  `{ jumpH, jumpVelocityBoostMagnitude, cut? }`: metres, the times the speed across is multiplied
//         by on taking off (1 keeps it, 0 jumps straight up), and the share of its upward speed a jump
//         keeps when cut short, 0 to 1 (none: never cut short)
// A number out of range throws a sentence naming the kind.
//
// `fill(me)` fills the row's fields where it gives none, as each behavior does the first time: at the
// origin facing 0, still, wanting nothing. A row carries `pos`, `yaw`, `vel`, `sliding`, `speed`,
// `stopped`, `facing` and `leapt`; its rule sets `want`, `face` and `jumpHeld`.
import type { Row, W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { at, fallOf, joined, kept, kindOf, nearest as nearestOn, numbers as kindNumbers, parts, spans, step, ways, type Behavior, type Place, type State, type Target } from '#plugins/kinematics3d/kinematics3d.sim.ts'
import { fits, type Constraint } from './motion3d.sim.ts'
import { clipOf, playKind, rigOf, secondsIn } from './motion3d.play.ts'

export type Move = { accel: number; turnRate: number; turnMax?: number; still: number; reverse?: number }
export type Jump = { jumpH: number; jumpVelocityBoostMagnitude: number; cut?: number }

const TOLERANCE = 1e-9
// An angle in (−π, π].
const wrap = (a: number) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI))

// A row's kind's block of numbers under `word`, each field a number at or above 0 (above it where
// `above` names it), checked the first time each block is read.
const checked = new WeakSet<object>()
function block<T>(me: Row, w: W, word: string, fields: string[], above: string[]): T {
  const k = kindNumbers(me, w)[word]
  if (k && checked.has(k)) return k
  if (!k) throw new Error(`kinematics3d kind ${kindOf(me)} gives no ${word}, which the ${word} behavior reads`)
  for (const f of fields) {
    const v = k[f]
    if (v === undefined && (f === 'turnMax' || f === 'cut' || f === 'reverse')) continue
    if (f === 'reverse' && !(v <= 180)) throw new Error(`kinematics3d kind ${kindOf(me)}: ${word}.reverse ${v} is more than 180`)
    if (f === 'cut' && !(v <= 1)) throw new Error(`kinematics3d kind ${kindOf(me)}: ${word}.cut ${v} is more than 1`)
    if (!Number.isFinite(v) || (above.includes(f) ? v <= 0 : v < 0)) {
      throw new Error(`kinematics3d kind ${kindOf(me)}: ${word}.${f} ${v} is not a number ${above.includes(f) ? 'above' : 'at or above'} 0`)
    }
  }
  checked.add(k)
  return k
}
const moving = (me: Row, w: W) => block<Move>(me, w, 'move', ['accel', 'turnRate', 'turnMax', 'still', 'reverse'], ['accel', 'turnRate', 'turnMax'])
const jumping = (me: Row, w: W) => block<Jump>(me, w, 'jump', ['jumpH', 'jumpVelocityBoostMagnitude', 'cut'], [])

// The fields motion3d's behaviors keep on a row, filled the first time one moves it.
const FRESH = { yaw: 0, sliding: false, speed: 0, face: null, stopped: false, facing: null, leapt: null }
export function fill(me: Row) {
  const d = me.data
  d.pos ??= [0, 0, 0]
  d.vel ??= [0, 0, 0]
  d.want ??= [0, 0]
  for (const [k, v] of Object.entries(FRESH)) d[k] ??= v
}

// The way the body is turned, eased the short way round from `from` toward `face`, or toward the bearing
// of `want` [x, y, z] across the ground when `face` is null and the want is not none, at most turnMax·dt.
function turned(from: number, face: number | null, want: number[], k: Move, dt: number): number {
  const aim = face ?? (math.hypot(want[0], want[2]) > TOLERANCE ? math.atan2(want[0], want[2]) : null)
  if (aim === null) return from
  const most = (k.turnMax ?? Infinity) * dt
  return wrap(from + Math.max(-most, Math.min(most, wrap(aim - from) * (1 - math.exp(-k.turnRate * dt)))))
}

// Whether a move went as far as it was asked along one way, to the rounding of the place.
const went = (made: number, asked: number, was: number) => Math.abs(made - asked) <= 2 * Number.EPSILON * Math.max(Math.abs(was), Math.abs(made))

// The target's place moved by `vel` [x, y, z] for `dt` seconds (`move`'s header): the place it ends at,
// and the velocity it went at.
function moved(w: W, me: Row, target: Target, place: Place, vel: number[], dt: number): { place: Place; vel: number[] } {
  const all = ways(w, target, place, me)
  const was = parts(place)
  const speeds = all.map(way => vel[0] * way.dir[0] + vel[1] * way.dir[1] + vel[2] * way.dir[2])
  const asked = was.map((v, i) => v + speeds[i] * dt)
  const made = parts(step(w, target, place, speeds, dt, me))
  const ends = (i: number) => Number.isFinite(all[i].lo) || Number.isFinite(all[i].hi)
  const ok = all.every((way, i) => {
    if (!ends(i)) return true
    const one = was.slice()
    one[i] = asked[i]
    return made[i] === asked[i] && fits(w, me, target as Constraint, me.data.clip, me.data.clipT, way.from, way.dir, was[i], asked[i], joined(one, place), way.lo, way.hi)
  })
  const now = ok ? made : was
  // The speed along each way: what it was asked where every way went as far as it was asked; else what
  // each went, as a body going at what it was asked can go (`kept`), over the ways that point somewhere
  // (the triangles' height has no way, and a stair climbed is no speed): a wall slid along leaves it
  // going along at the speed it went, and a push out of a solid never flings it.
  const exact = all.every((_, i) => went(now[i], asked[i], was[i]))
  const real = all.map((_, i) => i).filter(i => all[i].dir.some(v => v !== 0))
  const back = exact ? undefined : kept(real.map(i => (now[i] - was[i]) / dt), real.map(i => speeds[i]))
  const each = exact ? speeds : all.map((_, i) => (real.includes(i) ? back![real.indexOf(i)] : speeds[i]))
  const out = [0, 0, 0]
  all.forEach((way, i) => {
    for (let j = 0; j < 3; j++) out[j] += each[i] * way.dir[j]
  })
  return { place: joined(now, place), vel: out }
}

const wrapping = (shape: unknown) => shape as Target
const answers = {
  at: (shape: unknown, place: Place, me: Row, w: W) => at(w, wrapping(shape), place, me),
  nearest: (shape: unknown, point: number[], me: Row, w: W) => nearestOn(w, wrapping(shape), point, me),
  ways: (shape: unknown, place: Place, me: Row, w: W) => ways(w, wrapping(shape), place, me),
}

const move: Behavior = {
  ...answers,
  step(shape, place, want, dt, me, w) {
    const k = moving(me, w)
    fill(me)
    const d = me.data
    const target = wrapping(shape)
    const all = ways(w, target, place, me)
    if (!all.length) return place
    if (spans(all)) d.facing = turned(d.facing ?? at(w, target, place, me).yaw, d.face, want, k, dt)
    const ease = 1 - math.exp(-k.accel * dt)
    const vel = [0, 1, 2].map(i => d.vel[i] + (want[i] - d.vel[i]) * ease)
    const done = moved(w, me, target, place, vel, dt)
    d.vel = done.vel
    d.speed = math.hypot(d.vel[0], d.vel[2])
    return done.place
  },
}

// The seconds a body rising at `up` m/s, `over` metres over the height it left the ground at, takes to
// come back down to that height under `gravity`.
const airborne = (up: number, over: number, gravity: number) => (up + Math.sqrt(Math.max(0, up * up + 2 * gravity * over))) / gravity

// The row's rate, for a clip that comes down again before its end: the rate that brings its landing to
// the step the body, rising at `up` m/s `over` metres over where it left the ground, is back down there.
function timed(me: Row, w: W, up: number, over: number) {
  const d = me.data
  if (typeof d.clip !== 'string') return
  const c = clipOf(rigOf(w, playKind(me)), d.clip)
  const landing = secondsIn(w, me, d.clip, 'landing', 'landing')
  if (!(landing < c.dur) || !(landing > d.clipT)) return
  d.rate = (landing - d.clipT) / (airborne(up, over, fallOf(me, w).gravity) * c.rate)
}

const jump: Behavior = {
  ...answers,
  step(shape, place, want, dt, me, w) {
    const k = jumping(me, w)
    fill(me)
    const d = me.data
    const placed = move.step(shape, place, want, dt, me, w)
    // Still on the ground until the clip's feet leave it.
    if (typeof d.clip === 'string' && d.clipT < secondsIn(w, me, d.clip, 'takeoff', 'takeoff')) return placed
    if (d.grounded === false || d.sliding) return placed
    const vel: number[] = d.vel
    const magnitude = math.hypot(vel[0], vel[1], vel[2])
    const dir = magnitude > 0 ? [vel[0] / magnitude, vel[1] / magnitude, vel[2] / magnitude] : [0, 0, 0]
    const boosted = magnitude * k.jumpVelocityBoostMagnitude
    const up = Math.sqrt(2 * fallOf(me, w).gravity * k.jumpH)
    d.vel = [dir[0] * boosted, up, dir[2] * boosted]
    d.leapt = { from: d.pos[1] }
    timed(me, w, up, 0)
    return placed
  },
}

// A jump cut short (the header): a body `leapt` and still rising whose `jumpHeld` is false keeps its
// kind's `cut` of its upward speed, once, its clip timed to the new fall; one no longer rising is
// `leapt` no more. motion3d's `drive` asks it each step.
export function cutShort(me: Row, w: W) {
  const d = me.data
  if (!d.leapt) return
  if (!(d.vel[1] > 0)) {
    d.leapt = null
    return
  }
  if (d.jumpHeld !== false) return
  const { cut } = jumping(me, w)
  if (cut === undefined) return
  const over = d.pos[1] - d.leapt.from
  d.vel = [d.vel[0], d.vel[1] * cut, d.vel[2]]
  d.leapt = null
  timed(me, w, d.vel[1], over)
}

export const behaviors = (): Record<string, Behavior> => ({ move, jump })

const STATES: Record<string, State> = {
  still: (me, w) => !(me.data.speed > moving(me, w).still),
  moving: (me, w) => me.data.speed > moving(me, w).still,
  pushed: me => math.hypot(me.data.want[0], me.data.want[1]) > 0,
  // The want across the ground turned further than the kind's `move.reverse` degrees from the way the
  // body faces: a body walked back the way it came.
  reversed: (me, w) => {
    const d = me.data
    const most = moving(me, w).reverse
    if (most === undefined) throw new Error(`kinematics3d kind ${kindOf(me)} gives no move.reverse, which the state reversed reads`)
    if (!(math.hypot(d.want[0], d.want[1]) > 0)) return false
    return Math.abs(wrap(math.atan2(d.want[0], d.want[1]) - d.yaw)) > (most * Math.PI) / 180
  },
}

// The facing a body turns to this step, eased from `from` toward `aim` as `move` turns it (the kind's
// `move.turnRate` and `turnMax`): a one-shot that steers (motion3d's `steer`) turns so.
export function toward(me: Row, w: W, from: number, aim: number, dt: number): number {
  return turned(from, aim, [0, 0, 0], moving(me, w), dt)
}

export const states = (): Record<string, State> =>
  Object.fromEntries(Object.entries(STATES).map(([word, s]) => [word, (me: Row, w: W) => (fill(me), s(me, w))]))
