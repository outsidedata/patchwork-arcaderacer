// motion3d's mod for kinematics3d (`addons/scenemanager`'s mods): how a body moves on any target. A scene
// with `world.kinematics3d.mods: { behaviors: [..., 'motion3d'], states: ['motion3d', ...] }` has
// kinematics3d move a body by these words, and read the states they leave on it.
//
// `behaviors()` delivers two words, each wrapping a target of another word (kinematics3d's header), and
// answering `at`, `nearest` and `ways` through it:
//   move   `{ move: <target> }`: the body's place on the target moved by `want` [x, y, z], the way and the
//          speed it is asked to go in the world, metres a second: its `vel` eased toward the want, laid
//          along the target's ways, the place stepped by the target's own behavior. Where the target's
//          ways span the ground (the ground, a ceiling, the water) the body turns toward `face`, or the
//          way it is asked to go, and its `facing` is written. A move on a way with ends is made only when
//          every such way went as far as it was asked and keeps every bone of the clip's spot within its
//          bounds as the clip has them this step (motion3d's `fits`): a body stopped either way is
//          stopped, and does not slide on along the other
//   jump   `{ jump: <target> }`: a body held up by its target and not sliding is given the upward speed
//          √(2·gravity·jumpH), gravity kinematics3d's own (`fall.gravity`), and moved across as `move`
//          moves it; kinematics3d's gravity takes it from there
// `states()` delivers the states these leave (`is`): `still` slower than the kind's `move.still`, `moving`
// faster; `pushed` its `want` not none. kinematics3d reports `ground`, `falling`, `rising` and `landed`.
//
// The numbers, `world.kinematics3d.kinds.<kind>`:
//   move  `{ accel, turnRate, turnMax?, still }`: `vel` eases toward the want by 1 − exp(−accel·dt) a
//         step, 1/s; the facing eases toward its aim by 1 − exp(−turnRate·dt) a step, 1/s, at most turnMax
//         rad/s; slower than `still` m/s the body is `still`
//   jump  `{ jumpH }`: metres
// A number out of range throws a sentence naming the kind.
//
// `fill(me)` fills the row's fields where it gives none, as each behavior does the first time: at the
// origin facing 0, still, wanting nothing. A row carries `pos`, `yaw`, `vel`, `sliding`, `speed`,
// `stopped` and `facing`; its rule sets `want` and `face`.
import type { Row, W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { at, fallOf, joined, kindOf, nearest as nearestOn, numbers as kindNumbers, parts, spans, step, ways, type Behavior, type Place, type State, type Target } from '#plugins/kinematics3d/kinematics3d.sim.ts'
import { fits, type Constraint } from './motion3d.sim.ts'

export type Move = { accel: number; turnRate: number; turnMax?: number; still: number }
export type Jump = { jumpH: number }

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
    if (v === undefined && f === 'turnMax') continue
    if (!Number.isFinite(v) || (above.includes(f) ? v <= 0 : v < 0)) {
      throw new Error(`kinematics3d kind ${kindOf(me)}: ${word}.${f} ${v} is not a number ${above.includes(f) ? 'above' : 'at or above'} 0`)
    }
  }
  checked.add(k)
  return k
}
const moving = (me: Row, w: W) => block<Move>(me, w, 'move', ['accel', 'turnRate', 'turnMax', 'still'], ['accel', 'turnRate', 'turnMax'])
const jumping = (me: Row, w: W) => block<Jump>(me, w, 'jump', ['jumpH'], [])

// The fields motion3d's behaviors keep on a row, filled the first time one moves it.
const FRESH = { yaw: 0, sliding: false, speed: 0, face: null, stopped: false, facing: null }
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

// The speed a move went at along one way: what it was asked where it went as far, to the rounding of the
// place, else what it went.
const went = (made: number, asked: number, was: number, speed: number, dt: number) =>
  Math.abs(made - asked) <= 2 * Number.EPSILON * Math.max(Math.abs(was), Math.abs(made)) ? speed : (made - was) / dt

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
  const out = [0, 0, 0]
  all.forEach((way, i) => {
    const s = went(now[i], asked[i], was[i], speeds[i], dt)
    for (let j = 0; j < 3; j++) out[j] += s * way.dir[j]
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

const jump: Behavior = {
  ...answers,
  step(shape, place, want, dt, me, w) {
    const k = jumping(me, w)
    fill(me)
    const d = me.data
    const placed = move.step(shape, place, want, dt, me, w)
    if (d.grounded !== false && !d.sliding) d.vel = [d.vel[0], Math.sqrt(2 * fallOf(me, w).gravity * k.jumpH), d.vel[2]]
    return placed
  },
}

export const behaviors = (): Record<string, Behavior> => ({ move, jump })

const STATES: Record<string, State> = {
  still: (me, w) => !(me.data.speed > moving(me, w).still),
  moving: (me, w) => me.data.speed > moving(me, w).still,
  pushed: me => math.hypot(me.data.want[0], me.data.want[1]) > 0,
}

export const states = (): Record<string, State> =>
  Object.fromEntries(Object.entries(STATES).map(([word, s]) => [word, (me: Row, w: W) => (fill(me), s(me, w))]))
