// crowd3d, what the page and the server both read: where a person's course puts it. A course is a
// shapes3d shape, walked as kinematics3d walks one (`plugins/shapes3d/shapes3d.kinematics3d.ts`):
//   line    from `pos` to `to`, a row without `through`, or with it null
//   spline  with `through` [[x, y, z], …], the curve through `pos`, each place of `through` and `to`
// crowd3d walks a person along a straight line, so a spline is walked a straight piece at a time, the
// pieces shapes3d draws it in (`drawn`). Each piece, as a line, is walked at the row's `speed` across the
// ground, its height along it, and the next starts where and when it ends. A course whose ends stand one
// over the other, no way apart across the ground, is at its end; a speed of 0 stands at `pos`.
//
// The ground's up. A row's `normal` [x, y, z], a unit vector, is the up of the ground under `pos`, and
// its `normalTo` the up of the ground under `to`; a row without `normal` stands on [0, 1, 0], and one
// without `normalTo` on its `normal` all the way. Along the course the up turns from the one to the
// other with the metres walked, so a person crosses from a floor onto a wall leaning as it goes. Across
// the ground is across the ground under the piece: the piece with its part along the up halfway along it
// taken out (`mid`), so on [0, 1, 0] it is the piece's length in x and z. The way a person faces, `yaw`
// (yaw θ faces (sin θ, cos θ)), is in its ground's own frame: the frame [0, 1, 0] is turned onto the up
// by (`frame`, the least turn that does it; straight down, half a turn about x). The person is placed,
// turned by `yaw` about [0, 1, 0], then turned by `frame` of the piece's halfway up and on by the least
// turn from that to the up where it stands (`turn`), so on a piece whose up does not change it is `frame`
// of that up alone.
//   `piece(row, time)`     the straight piece the person walks at `time`: `{ pos, to, since, yaw, n,
//                          normal, normalTo }`, its ends, when it set out on it, the way it faces along
//                          it (the row's `yaw` on a line, or on a piece no way across the ground), its
//                          place among the pieces, and the up at each end; the line itself for a line
//   `where(row, time)`     where its feet stand at `time`, [x, y, z]
//   `standing(row, time)`  where it stands at `time`, the up there and the way it faces in that up's
//                          frame: `{ at, normal, yaw }`
//   `ends(row)`            when it gets to `to`
//
// Paths. A person may walk the paths a plugin hands crowd3d through the `paths` mod,
// `world.crowd3d.mods: { paths: '<a>' }`, `paths(w)`: every line and spline some shape lays down, each
// `{ id, point, points, clip, speed }`, the row of the shape and the name of its point, its places in
// the world in order, and what a person plays on it and how fast it goes, metres a second across the
// ground, as the shape's own data says. shapes3d is one (`shapes3d.crowd3d.ts`). So the shape says
// what is done on it: a walkway's `walk`, a flight path's pose.
//   `travel(me, w, time)`  once a step, by the rule of a person that walks paths: at `time`, seconds on
//                          the step's clock, once it has got to the end of the path it is on (`ends`),
//                          it sets out on another from there; with none yet, on the path with a place
//                          nearest where it stands, from where it stands, on along its places past that
//                          one, the die choosing which way where both go on. The next is a path with an end within
//                          `world.crowd3d.reach` metres of where it got to, not the one it was on, the die
//                          choosing among them; with none, the one it was on, back the way it came. It
//                          sets out from where it got to, along the path's places from the end it is at,
//                          at the moment it got there: `pos`, `to`, `through` (null on a line), `yaw` the
//                          way its first leg goes, `since`, and the path's `clip` and `speed`; and
//                          `path`, `{ id, point, back }`, the path and whether it walks it from its last
//                          place to its first. A person whose row gives no `path` walks no path: `travel`
//                          is never handed one, and its row is drawn as it says. A scene a person walks
//                          paths in and whose `world.crowd3d.mods` names no `paths`, or gives no `reach`,
//                          throws.
import type { Row, W } from '#engine/engine.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { behaviors, drawn } from '#plugins/shapes3d/shapes3d.kinematics3d.ts'
import * as math from '#plugins/math/math.sim.ts'

// A path a shape lays down: its shape's row and point, its places in the world, and what is played on it.
export type Path = { id: number; point: string; points: number[][]; clip: string; speed: number }

export type Piece = { pos: number[]; to: number[]; since: number; yaw: number; n: number; normal: number[]; normalTo: number[] }

const { line } = behaviors()
export const UP = [0, 1, 0]

const unit = (v: number[], or: number[]) => {
  const l = math.hypot(v[0], v[1], v[2])
  return l > 0 ? [v[0] / l, v[1] / l, v[2] / l] : or
}
// The up `f` of the way from `a` to `b`, 0 to 1: `a` itself where the two are one up.
const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
const blend = (a: number[], b: number[], f: number) =>
  same(a, b) ? a : unit([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], a)

// The up halfway between `a` and `b`.
export const mid = (a: number[], b: number[]) => blend(a, b, 0.5)

// How far from `a` to `b` across the ground whose up is `n`: the way with its part along `n` taken out.
export function across(a: number[], b: number[], n: number[]): number {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const k = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]
  return math.hypot(d[0] - k * n[0], d[1] - k * n[1], d[2] - k * n[2])
}

// The least turn from unit vector `a` onto unit vector `b`, as its rows; `a` straight against `b` is no
// turn, which `mid` never hands `turn`.
export function turn(a: number[], b: number[]): number[][] {
  const v = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  if (c <= -1 + 1e-6) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  const k = 1 / (1 + c)
  return [
    [1 - k * (v[1] * v[1] + v[2] * v[2]), -v[2] + k * v[0] * v[1], v[1] + k * v[0] * v[2]],
    [v[2] + k * v[0] * v[1], 1 - k * (v[0] * v[0] + v[2] * v[2]), -v[0] + k * v[1] * v[2]],
    [-v[1] + k * v[0] * v[2], v[0] + k * v[1] * v[2], 1 - k * (v[0] * v[0] + v[1] * v[1])],
  ]
}

// The turn of [0, 1, 0] onto the up `n`, as its rows: the least turn, or for straight down half a turn
// about x.
export function frame(n: number[]): number[][] {
  if (n[1] <= -1 + 1e-6) return [[1, 0, 0], [0, -1, 0], [0, 0, -1]]
  return turn(UP, n)
}

const times = (m: number[][], v: number[]) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2])
const timesT = (m: number[][], v: number[]) => [0, 1, 2].map(j => m[0][j] * v[0] + m[1][j] * v[1] + m[2][j] * v[2])

// The way from `a` to `b` faced in the frame of the up `n`, a yaw; `yaw` where they are no way apart
// across that ground.
export function facing(a: number[], b: number[], n: number[], yaw: number): number {
  if (across(a, b, n) === 0) return yaw
  const d = timesT(frame(n), [b[0] - a[0], b[1] - a[1], b[2] - a[2]])
  return math.atan2(d[0], d[2])
}

const normalOf = (row: Row): number[] => row.data.normal ?? UP
const normalToOf = (row: Row): number[] => row.data.normalTo ?? normalOf(row)

// A spline course's pieces, each place, the up there and the seconds from `since` it is got to, worked
// out once for each `through` it is handed with the `pos`, `to`, `speed` and ups it had.
type Cut = { pos: number[]; to: number[]; speed: number; normal: number[]; normalTo: number[]; pts: number[][]; ups: number[][]; t: number[] }
const cuts = new WeakMap<object, Cut>()
function cutOf(row: Row): Cut {
  const d = row.data
  const n0 = normalOf(row), n1 = normalToOf(row)
  const had = cuts.get(d.through)
  if (had && had.pos === d.pos && had.to === d.to && had.speed === d.speed && had.normal === n0 && had.normalTo === n1) return had
  const { pts, at } = drawn({ points: [d.pos, ...d.through, d.to] })
  const total = at[at.length - 1]
  const ups = at.map(s => blend(n0, n1, total > 0 ? s / total : 0))
  const t = [0]
  for (let i = 1; i < pts.length; i++) t.push(t[i - 1] + (d.speed > 0 ? across(pts[i - 1], pts[i], mid(ups[i - 1], ups[i])) / d.speed : 0))
  const cut = { pos: d.pos, to: d.to, speed: d.speed, normal: n0, normalTo: n1, pts, ups, t }
  cuts.set(d.through, cut)
  return cut
}

export function piece(row: Row, time: number): Piece {
  const d = row.data
  if (!d.through) return { pos: d.pos, to: d.to, since: d.since, yaw: d.yaw, n: 0, normal: normalOf(row), normalTo: normalToOf(row) }
  const { pts, ups, t } = cutOf(row)
  const e = time - d.since
  let n = 0
  if (d.speed > 0) while (n < pts.length - 2 && t[n + 1] <= e) n++
  const a = pts[n], b = pts[n + 1]
  return { pos: a, to: b, since: d.since + t[n], yaw: facing(a, b, mid(ups[n], ups[n + 1]), d.yaw), n, normal: ups[n], normalTo: ups[n + 1] }
}

// How far along a straight piece the feet are at `time`, 0 to 1: as far as `speed` carries it across the
// ground since its `since`, at its end once it has got there.
function along(row: Row, p: Piece, time: number): number {
  const wide = across(p.pos, p.to, mid(p.normal, p.normalTo))
  return wide > 0 ? Math.min(1, Math.max(0, (row.data.speed * (time - p.since)) / wide)) : 1
}

// Where a straight piece puts the feet at `time`: on the shapes3d line from its `pos` to its `to`, as far
// along it as `along` says. A line's answer is its own shape's alone: it reads neither the row nor the world.
function onLine(row: Row, p: Piece, time: number): number[] {
  const length = math.hypot(p.to[0] - p.pos[0], p.to[1] - p.pos[1], p.to[2] - p.pos[2])
  if (length === 0) return [p.pos[0], p.pos[1], p.pos[2]]
  return line.at({ from: p.pos, to: p.to, yaw: p.yaw }, along(row, p, time) * length, row, undefined as unknown as W).at
}

export const where = (row: Row, time: number): number[] => onLine(row, piece(row, time), time)

export function standing(row: Row, time: number): { at: number[]; normal: number[]; yaw: number } {
  const p = piece(row, time)
  const f = along(row, p, time)
  const half = mid(p.normal, p.normalTo)
  const normal = blend(p.normal, p.normalTo, f)
  if (half === normal) return { at: onLine(row, p, time), normal, yaw: p.yaw }
  const ahead = times(turn(half, normal), times(frame(half), [math.sin(p.yaw), 0, math.cos(p.yaw)]))
  const own = timesT(frame(normal), ahead)
  return { at: onLine(row, p, time), normal, yaw: math.atan2(own[0], own[2]) }
}

export function ends(row: Row): number {
  const d = row.data
  if (d.speed <= 0) return d.since
  if (!d.through) return d.since + across(d.pos, d.to, mid(normalOf(row), normalToOf(row))) / d.speed
  const { t } = cutOf(row)
  return d.since + t[t.length - 1]
}

// ---------------------------------------------------------------- paths

function pathsOf(w: W): Path[] {
  const of = mod<(w: W) => Path[]>(w.world, 'crowd3d', 'paths')
  if (!of) throw new Error('crowd3d: a person walks paths, and world.crowd3d.mods names no paths')
  return of(w)
}

const gap = (a: number[], b: number[]) => math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// The person set out on `p` from `at`, at `since`: along its places from the end `back` says, from the
// place `from` of them on (0, the end itself, when not given).
function setOut(me: Row, p: Path, back: boolean, at: number[], since: number, from = 0) {
  const pts = [at, ...(back ? [...p.points].reverse() : p.points).slice(from + 1)]
  const d = me.data
  d.pos = [...at]
  d.to = [...pts[pts.length - 1]]
  d.through = pts.length > 2 ? pts.slice(1, -1).map(q => [...q]) : null
  d.yaw = math.atan2(pts[1][0] - at[0], pts[1][2] - at[2])
  d.since = since
  d.clip = p.clip
  d.speed = p.speed
  d.path = { id: p.id, point: p.point, back }
}

export function travel(me: Row, w: W, time: number) {
  const d = me.data
  const all = pathsOf(w)
  if (!all.length) return
  if (d.path === null) {
    // The path with a place nearest where it stands, set out on from where it stands, on along its
    // places past that one, the way the die chooses where both ways go on.
    let best = all[0], i = 0, far = Infinity
    for (const p of all) {
      p.points.forEach((q, k) => {
        const g = gap(q, d.pos)
        if (g < far) { far = g; best = p; i = k }
      })
    }
    const last = best.points.length - 1
    const back = i === last || (i > 0 && w.die() < 0.5)
    setOut(me, best, back, [...d.pos], time, back ? last - i : i)
    return
  }
  const got = ends(me)
  if (time < got) return
  const reach = w.world.crowd3d.reach as number | undefined
  if (reach === undefined) throw new Error('crowd3d: a person walks paths, and world.crowd3d gives no reach')
  const at: number[] = d.to
  const on = (p: Path) => p.id === d.path.id && p.point === d.path.point
  const next: [Path, boolean][] = []
  for (const p of all) {
    if (on(p)) continue
    if (gap(p.points[0], at) <= reach) next.push([p, false])
    if (gap(p.points[p.points.length - 1], at) <= reach) next.push([p, true])
  }
  if (!next.length) {
    const was = all.find(on)
    if (!was) throw new Error(`crowd3d: ${me.kind} ${me.id} walks the path ${d.path.point} of ${d.path.id}, which is gone`)
    next.push([was, !d.path.back])
  }
  const [p, back] = next[Math.floor(w.die() * next.length)]
  setOut(me, p, back, at, got)
}
