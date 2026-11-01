// shapes3d's mod for kinematics3d (`addons/scenemanager`'s mods): the targets of shapes3d's points. A
// scene with `world.kinematics3d.mods: { behaviors: ['shapes3d'] }` has kinematics3d move a body's place
// on them.
//
// A target is a point of a shapes3d kind placed in the world, as `shapes3d.motion3d.ts`' `spaces` hands
// it out, under its word:
//   point  `{ at, yaw, normal? }`: no place within it; it stays where it is
//   line   `{ from, to, yaw, normal? }`: the place is metres along it from `from`, a want of one number
//          moves it toward `to`, stopped at both ends
//   plane  `{ at, u, v, size, yaw, normal? }`: the place is [across, along] metres from its middle along
//          `u` and `v`, a want of two numbers moves it, each stopped at its edges, `size` [across, along]
//   spline `{ points, yaw, normal? }`: a curve through every one of `points`, two or more; the place is
//          metres along it from the first, a want of one number moves it toward the last, stopped at
//          both ends
// Each also gives kinematics3d `footing`: a body standing on a shape `move` moved is carried with it.
// `at` hands back where the place stands, the target's `normal` there (straight up where it gives none)
// and its `yaw`; `nearest` the place nearest a point [x, y, z] in the world, within the edges; and `ways`
// the ways a place moves, each `{ dir, from, lo, hi }`: a unit vector in the world, the place's number
// along it measured from `from`, between `lo` and `hi` (a line's one, from `from`, 0 to its length; a
// spline's one, the curve's direction at the place, its number the metres along the curve, 0 to its
// length; a plane's two, `u` then `v`, from its middle, ± half its `size`; a point's none). A spline is
// drawn as straight pieces (`drawn`, its places and how far along each is), and each answer is on them.
//
// The shapes standing on the land, for whatever target a body walks across (terrain3d's `triangles`):
// `solids(w, x, z, r)` every shape of shapes3d's reaching within r of (x, z), a box, a cylinder or a plane,
// under its word (`world.kinematics3d.mods.solids`). `footprints()` delivers each word's footprint
// (`world.kinematics3d.mods.footprints`): a `box`'s four corners, a `cylinder`'s circle, a `plane` and a
// `hyperplane` none; each with its underside's height `base` (a plane and a hyperplane none: they stand
// in nothing's way), its top over its middle `crown`, and `top(x, z)`, its top over (x, z) or undefined
// off it, which a body may stand on. The shapes are read again whenever one has been moved (`move`).
import { numbers as kindNumbers, type Behavior, type Place, type Way, type Where } from '#plugins/kinematics3d/kinematics3d.sim.ts'
import type { Footprinter, Worded } from '#plugins/terrain3d/terrain3d.kinematics3d.ts'
import type { Row, W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { conj, corners, moves, mul, rotate, shapes, turnOf, words, type Placed } from './shapes3d.sim.ts'

type Point = { at: number[]; yaw: number; normal?: number[] }
type Line = { from: number[]; to: number[]; yaw: number; normal?: number[] }
type Plane = { at: number[]; u: number[]; v: number[]; size: number[]; yaw: number; normal?: number[] }
type Spline = { points: number[][]; yaw: number; normal?: number[] }

const UP = [0, 1, 0]
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const length = (l: Line) => math.hypot(l.to[0] - l.from[0], l.to[1] - l.from[1], l.to[2] - l.from[2])

const point: Behavior = {
  step: () => null,
  at(shape): Where {
    const p = shape as Point
    return { at: p.at, normal: p.normal ?? UP, yaw: p.yaw }
  },
  nearest: () => null,
  ways: () => [],
}

const line: Behavior = {
  step(shape, place, want, dt): Place {
    const l = shape as Line
    return clamp((place as number) + want[0] * dt, 0, length(l))
  },
  at(shape, place): Where {
    const l = shape as Line
    const s = (place as number) / length(l)
    return { at: [0, 1, 2].map(i => l.from[i] + (l.to[i] - l.from[i]) * s), normal: l.normal ?? UP, yaw: l.yaw }
  },
  nearest(shape, p): Place {
    const { from, to } = shape as Line
    const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
    const len = math.hypot(d[0], d[1], d[2])
    const t = ((p[0] - from[0]) * d[0] + (p[1] - from[1]) * d[1] + (p[2] - from[2]) * d[2]) / len
    return clamp(t, 0, len)
  },
  ways(shape): Way[] {
    const l = shape as Line
    const len = length(l)
    return [{ dir: [0, 1, 2].map(i => (l.to[i] - l.from[i]) * (1 / len)), from: l.from, lo: 0, hi: len }]
  },
}

const plane: Behavior = {
  step(shape, place, want, dt): Place {
    const p = shape as Plane
    const [a, b] = place as number[]
    return [clamp(a + want[0] * dt, -p.size[0] / 2, p.size[0] / 2), clamp(b + want[1] * dt, -p.size[1] / 2, p.size[1] / 2)]
  },
  at(shape, place): Where {
    const p = shape as Plane
    const [a, b] = place as number[]
    return { at: [0, 1, 2].map(i => p.at[i] + p.u[i] * a + p.v[i] * b), normal: p.normal ?? UP, yaw: p.yaw }
  },
  nearest(shape, q): Place {
    const { at, u, v, size } = shape as Plane
    const r = [q[0] - at[0], q[1] - at[1], q[2] - at[2]]
    const dot = (a: number[]) => r[0] * a[0] + r[1] * a[1] + r[2] * a[2]
    return [clamp(dot(u), -size[0] / 2, size[0] / 2), clamp(dot(v), -size[1] / 2, size[1] / 2)]
  },
  ways(shape): Way[] {
    const p = shape as Plane
    return [
      { dir: p.u, from: p.at, lo: -p.size[0] / 2, hi: p.size[0] / 2 },
      { dir: p.v, from: p.at, lo: -p.size[1] / 2, hi: p.size[1] / 2 },
    ]
  },
}

// A spline drawn as SAMPLES straight pieces between each two of its points, a Catmull-Rom curve through
// every point, its ends' tangents taken by doubling the end points; and how far along it each sample is.
// Handed out, so whatever walks a spline a straight line at a time (crowd3d) walks these same pieces.
const SAMPLES = 16
export type Drawn = { pts: number[][]; at: number[] }
export function drawn(s: { points: number[][] }): Drawn {
  const p = s.points
  const pts: number[][] = [p[0]]
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(i - 1, 0)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(i + 2, p.length - 1)]
    for (let k = 1; k <= SAMPLES; k++) {
      const t = k / SAMPLES, t2 = t * t, t3 = t2 * t
      pts.push([0, 1, 2].map(j => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3)))
    }
  }
  const at = [0]
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    at.push(at[i - 1] + math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))
  }
  return { pts, at }
}

// The piece a place s metres along lies on: its first sample's index, and how far through it s is, 0 to 1.
function pieceOf(d: Drawn, s: number): { i: number; f: number } {
  let i = 0
  while (i < d.pts.length - 2 && d.at[i + 1] < s) i++
  const len = d.at[i + 1] - d.at[i]
  return { i, f: len > 0 ? clamp((s - d.at[i]) / len, 0, 1) : 0 }
}

const spline: Behavior = {
  step(shape, place, want, dt): Place {
    const d = drawn(shape as Spline)
    return clamp((place as number) + want[0] * dt, 0, d.at[d.at.length - 1])
  },
  at(shape, place): Where {
    const s = shape as Spline
    const d = drawn(s)
    const { i, f } = pieceOf(d, place as number)
    const a = d.pts[i], b = d.pts[i + 1]
    return { at: [0, 1, 2].map(j => a[j] + (b[j] - a[j]) * f), normal: s.normal ?? UP, yaw: s.yaw }
  },
  nearest(shape, q): Place {
    const d = drawn(shape as Spline)
    let best = Infinity, along = 0
    for (let i = 0; i < d.pts.length - 1; i++) {
      const a = d.pts[i], b = d.pts[i + 1]
      const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const ee = e[0] * e[0] + e[1] * e[1] + e[2] * e[2]
      const t = ee > 0 ? clamp(((q[0] - a[0]) * e[0] + (q[1] - a[1]) * e[1] + (q[2] - a[2]) * e[2]) / ee, 0, 1) : 0
      const gap = math.hypot(a[0] + e[0] * t - q[0], a[1] + e[1] * t - q[1], a[2] + e[2] * t - q[2])
      if (gap < best) {
        best = gap
        along = d.at[i] + (d.at[i + 1] - d.at[i]) * t
      }
    }
    return along
  },
  // The one way: the curve's direction at the place, measured so that the place's number along it is the
  // metres it is along the curve, 0 to its length.
  ways(shape, place): Way[] {
    const d = drawn(shape as Spline)
    const s = place as number
    const { i, f } = pieceOf(d, s)
    const a = d.pts[i], b = d.pts[i + 1]
    const len = d.at[i + 1] - d.at[i]
    const dir = [0, 1, 2].map(j => (b[j] - a[j]) / len)
    const here = [0, 1, 2].map(j => a[j] + (b[j] - a[j]) * f)
    return [{ dir, from: here.map((v, j) => v - dir[j] * s), lo: 0, hi: d.at[d.at.length - 1] }]
  },
}

// Where a body at `pos` facing `yaw` is carried by the moved shape whose top it stood on: the highest shape
// `move` moved whose top, where it stood before (its row's `was`), over (pos x, pos z) is at the body's
// feet or no more than its `triangles.step` under them. The body's point in that shape's frame as it
// stood is put back through the shape as it stands now, by quaternions, so a tilt and a roll carry it as
// a turn does, and its yaw is the heading its facing is turned to by the shape's turn. Undefined off a
// moved shape, so a body on the land or a still shape is left as it is.
const TOLERANCE = 1e-9
function footing(pos: number[], yaw: number, me: Row, w: W): { pos: number[]; yaw: number } | undefined {
  const step = kindNumbers(me, w).triangles?.step
  if (step === undefined) return undefined
  let on: { row: Row; was: number[]; top: number } | undefined
  for (const p of standing(w).placed) {
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

export const behaviors = (): Record<string, Behavior> => ({
  point: { ...point, footing },
  line: { ...line, footing },
  plane: { ...plane, footing },
  spline: { ...spline, footing },
})

// A word's footprint: its outline, and its underside, its crown and its top, by shapes3d's own word.
const footed = (word: string, outline: (s: any) => { points: number[][]; round: number }): Footprinter => s => {
  const known = words[word]
  const { x, z } = known.middle(s)
  return { ...outline(s), base: known.base?.(s), crown: known.top(s, x, z), top: (px: number, pz: number) => known.top(s, px, pz) }
}

export const footprints = (): Record<string, Footprinter> => ({
  box: footed('box', b => ({ points: corners(b), round: 0 })),
  cylinder: footed('cylinder', c => ({ points: [[c.pos[0], c.pos[2]]], round: c.radius })),
  plane: footed('plane', () => ({ points: [], round: 0 })),
  hyperplane: footed('hyperplane', () => ({ points: [], round: 0 })),
})

// A truth's shapes, `placed` in `shapes`' order, and by square SQUARE metres a side the places in
// `placed` of the shapes whose footprint's box takes in some of it. Read again when a shape has moved.
const SQUARE = 2
type Standing = { placed: Placed[]; squares: Map<number, number[]>; moves: number }
const stood = new WeakMap<object, Standing>()
const squareOf = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768)

function standing(w: W): Standing {
  let s = stood.get(w.world)
  if (s && s.moves === moves(w)) return s
  const placed = shapes(w)
  const squares = new Map<number, number[]>()
  placed.forEach((p, n) => {
    const { x, z, reach } = words[p.word].middle(p.shape[p.word])
    for (let i = Math.floor((x - reach) / SQUARE); i <= Math.floor((x + reach) / SQUARE); i++) {
      for (let j = Math.floor((z - reach) / SQUARE); j <= Math.floor((z + reach) / SQUARE); j++) {
        const k = squareOf(i, j)
        const there = squares.get(k)
        if (there) there.push(n)
        else squares.set(k, [n])
      }
    }
  })
  stood.set(w.world, (s = { placed, squares, moves: moves(w) }))
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

// Every shape reaching within r of (x, z): a box or a cylinder by how far it stands from (x, z), a plane
// or a hyperplane by its top being over it.
export function solids(w: W, x: number, z: number, r: number): Worded[] {
  const s = standing(w)
  return around(s, x, z, r).filter(n => {
    const p = s.placed[n], known = words[p.word]
    return known.base !== undefined ? known.gap(p.shape[p.word], x, z) <= r : known.top(p.shape[p.word], x, z) !== undefined
  }).map(n => s.placed[n].shape)
}
