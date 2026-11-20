// shapes3d's mod for motion3d (`addons/scenemanager`'s mods): its spaces, the kinds that offer
// activities. A scene with `world.motion3d.mods: { spaces: 'shapes3d' }` has every row of a shapes3d
// kind that lists `activities` offer them to a body its shape holds.
//
// A kind's entry in `world.shapes3d.kinds` gives, beside its `shape` and `look`:
//   activities  the activity words it offers (motion3d's, each an activity of the body's motion3d
//               file), `['ledge']`
//   priority    the priority of those activities (motion3d's), 1 when it gives none
//   data        `{ <plugin>: { … } }`, blocks for the plugins that read spaces, passed on untouched:
//               `data.motion3d.autoChange`, whether a body it holds takes up its activities with no key
//   points      `{ <name>: <constraint> }`, what a motion's root and limbs are held to, each a word in the
//               shape's own frame (metres: x across, y up from its foot, z along its length; degrees),
//               so it moves and turns with its row:
//                 point  `{ at, turn? }`: one place, a seat, a door handle
//                 line   `{ from, to, turn? }`: a straight line between two places, a ledge's lip, a bar
//                 spline `{ points, turn? }`: a curve through two or more places, a ledge bending round a
//                        tower, a sagging rope
//                 plane  `{ at, size: [x, z], turn? }`: a flat rectangle, its middle at `at`, `x` across
//                        and `z` long, lying face up until it is turned: a ceiling, a climbing wall
//               `turn` `[yaw, pitch, roll]`, 0 each when it gives none: about the shape's up (positive
//               left), then across, then along, any rotation at all. On a point, a line and a spline its yaw is
//               the facing a body takes on it; a plane is turned by all three from lying face up, and a
//               body on it takes its yaw.
//               `normal` `[x, y, z]`, on any of the three when given: the way the thing faces out, a
//               direction in the shape's own frame, turned with its row and made a unit vector: a seat's
//               up, a wall's out. A point that gives none has none.
// A kind that lists `activities` is a space and stands in nothing's way (shapes3d's `shapes` leaves it
// out): it is only where its activities are offered.
//
// A space's row is turned by its `yaw`, or, when it carries `rot` [x, y, z, w] in place of it, by that
// unit quaternion, the whole of its turn (as a hyperplane's row is; shapes3d's `move` writes it): the
// shape and every point of it tilt, roll and turn with the row, so a space a rule lays along a moving
// thing (a limb of a rig, a boom, a ship's deck) stays on it. Its box or cylinder then holds a point
// that is over its footprint and between its foot and its top in the shape's own frame, a point's
// facing is the bearing of its own facing turned by the row, and a plane's axes and every `normal` are
// turned with it. Each point of such a row also carries `up`, the shape's own up in the world, a unit
// vector: motion3d stands a body held to the point along it, so a climber on a shape that leans to one
// side climbs up the shape, not up the world.
//
// `faces(w, at, r)` is every upright side of every solid box (a box of a kind that lists no `activities`,
// turned by its `yaw` alone) whose footprint reaches within `r` metres of `at` across the ground: what
// motion3d makes a traversal of (its Solids). Each is `{ id, side, at, normal, along, half, base, top }`:
// its row, which of the box's four sides (0 its +x, 1 its −x, 2 its +z, 3 its −z), the middle of the
// side at the box's foot in the world, the way the side faces out and the way along it (unit vectors
// across the ground), half its length, and the heights of the box's foot and its top.
//
// `spaces(w, at)` is every row of such a kind: `{ id, activities, priority, data, points, holds, far }`, its
// points placed in the world (motion3d's `Constraint`: a point's `at` and `yaw`, a line's `from`, `to`
// and `yaw`, a spline's `points` and `yaw`, a plane's middle, its axes `u` (across) and `v` (along), unit vectors, its `size` and
// `yaw`, and each one's `normal` in the world when it gives one), `holds` whether its shape holds the point `at` [x, y, z], and `far` the metres over the ground
// from `at` to the shape's middle. A cylinder or a box holds a point over its footprint and from its
// underside up to its top, both included. A plane has no inside, and a kind of a plane that lists
// activities throws naming it, as does a point of a word none of these is.
import type { Row, W } from '#engine/engine.ts'
import type { Constraint, Face, Space } from '#plugins/motion3d/motion3d.sim.ts'
import { Euler, Vector3 } from 'three'
import * as math from '#plugins/math/math.sim.ts'
import { conj, rotate, wordOf, type Kind } from './shapes3d.sim.ts'

const DEG = Math.PI / 180

// A point of the shape's own frame in the world, by its row's place and its turn: its `rot`, the whole
// of its turn, when it carries one, else its yaw.
function toWorld(row: Row, p: number[]): number[] {
  const [x, y, z] = row.data.pos
  if (row.data.rot) {
    const r = rotate(row.data.rot, p)
    return [x + r[0], y + r[1], z + r[2]]
  }
  const yaw = row.data.yaw ?? 0
  const c = math.cos(yaw), s = math.sin(yaw)
  return [x + p[0] * c + p[2] * s, y + p[1], z - p[0] * s + p[2] * c]
}

// A direction of the shape's own frame in the world, by its row's turn, made a unit vector.
function dirToWorld(row: Row, d: number[]): number[] {
  const l = math.hypot(d[0], d[1], d[2])
  if (row.data.rot) return rotate(row.data.rot, [d[0] / l, d[1] / l, d[2] / l])
  const yaw = row.data.yaw ?? 0
  const c = math.cos(yaw), s = math.sin(yaw)
  return [(d[0] * c + d[2] * s) / l, d[1] / l, (-d[0] * s + d[2] * c) / l]
}

// The facing a body takes on a point that faces `yaw` radians in the shape's own frame: the row's yaw
// more; for a row turned by `rot`, the bearing over the ground of that way turned by it, or `yaw` itself
// where the turn stands it straight up or down.
function facingOf(row: Row, yaw: number): number {
  if (!row.data.rot) return (row.data.yaw ?? 0) + yaw
  const f = rotate(row.data.rot, [math.sin(yaw), 0, math.cos(yaw)])
  return math.hypot(f[0], f[2]) > 1e-9 ? math.atan2(f[0], f[2]) : yaw
}

function placed(kind: string, name: string, row: Row, point: Record<string, any>): Constraint {
  const [word] = Object.keys(point)
  const n = point[word]
  const [yaw, pitch, roll] = (n.turn ?? [0, 0, 0]).map((v: number) => v * DEG)
  const facing = facingOf(row, yaw)
  // A row turned by `rot` hands its own up too, so a body held to a point of it stands along the shape
  // however it leans.
  const normal = { ...(n.normal ? { normal: dirToWorld(row, n.normal) } : {}), ...(row.data.rot ? { up: dirToWorld(row, [0, 1, 0]) } : {}) }
  if (word === 'point') return { point: { at: toWorld(row, n.at), yaw: facing, ...normal } }
  if (word === 'line') return { line: { from: toWorld(row, n.from), to: toWorld(row, n.to), yaw: facing, ...normal } }
  if (word === 'spline') return { spline: { points: n.points.map((p: number[]) => toWorld(row, p)), yaw: facing, ...normal } }
  if (word === 'plane') {
    // Its two axes in the shape's own frame, turned from lying face up, then turned as the row is.
    const e = new Euler(pitch, yaw, roll, 'YXZ')
    const u = new Vector3(1, 0, 0).applyEuler(e), v = new Vector3(0, 0, 1).applyEuler(e)
    return { plane: { at: toWorld(row, n.at), u: dirToWorld(row, [u.x, u.y, u.z]), v: dirToWorld(row, [v.x, v.y, v.z]), size: n.size, yaw: facing, ...normal } }
  }
  throw new Error(`shapes3d kind ${kind}'s point ${name} is a ${word}, which is none of point, line, spline, plane`)
}

// Whether a box or a cylinder turned by its row's `rot` holds the point `at`, and how far over the
// ground its middle is from it: the point taken into the shape's own frame, where the shape stands
// upright on its foot.
function turned(word: string, numbers: any, row: Row, at: number[]): { holds: boolean; far: number } {
  const [px, py, pz] = row.data.pos
  const q = rotate(conj(row.data.rot), [at[0] - px, at[1] - py, at[2] - pz])
  const tall = word === 'box' ? numbers.size[1] : numbers.height
  const over = word === 'box' ? Math.abs(q[0]) <= numbers.size[0] / 2 && Math.abs(q[2]) <= numbers.size[2] / 2 : math.hypot(q[0], q[2]) <= numbers.radius
  const m = rotate(row.data.rot, [0, tall / 2, 0])
  return { holds: over && q[1] >= 0 && q[1] <= tall, far: math.hypot(at[0] - (px + m[0]), at[2] - (pz + m[2])) }
}

export function faces(w: W, at: number[], r: number): Face[] {
  const kinds = w.world.shapes3d.kinds as Record<string, Kind>
  const out: Face[] = []
  for (const [kind, k] of Object.entries(kinds)) {
    if (k.activities || !k.shape.box) continue
    const [sx, sy, sz] = k.shape.box.size as number[]
    for (const row of w.all(kind)) {
      if (row.data.rot) continue
      const [px, py, pz] = row.data.pos
      const yaw = row.data.yaw ?? 0
      const c = math.cos(yaw), s = math.sin(yaw)
      // The box's own x and z across the ground.
      const ax = [c, 0, -s], az = [s, 0, c]
      // Its footprint's nearest reach of `at`, in its own frame.
      const dx = at[0] - px, dz = at[2] - pz
      const lx = dx * ax[0] + dz * ax[2], lz = dx * az[0] + dz * az[2]
      const gap = math.hypot(Math.max(0, Math.abs(lx) - sx / 2), Math.max(0, Math.abs(lz) - sz / 2))
      if (gap > r) continue
      const side = (n: number[], half: number, depth: number, along: number[], i: number): Face => ({
        id: row.id, side: i, at: [px + n[0] * depth, py, pz + n[2] * depth], normal: n, along, half, base: py, top: py + sy,
      })
      out.push(
        side(ax, sz / 2, sx / 2, az, 0),
        side([-ax[0], 0, -ax[2]], sz / 2, sx / 2, [-az[0], 0, -az[2]], 1),
        side(az, sx / 2, sz / 2, [-ax[0], 0, -ax[2]], 2),
        side([-az[0], 0, -az[2]], sx / 2, sz / 2, ax, 3),
      )
    }
  }
  return out
}

export function spaces(w: W, at: number[]): Space[] {
  const kinds = w.world.shapes3d.kinds as Record<string, Kind>
  const [x, y, z] = at
  const out: Space[] = []
  for (const [kind, k] of Object.entries(kinds)) {
    if (!k.activities) continue
    const { word, known } = wordOf(kind, k)
    if (!known.base) throw new Error(`shapes3d kind ${kind} offers activities, and a ${word} has no inside to hold a body`)
    for (const row of w.all(kind)) {
      const points = Object.fromEntries(Object.entries(k.points ?? {}).map(([name, p]) => [name, placed(kind, name, row, p)]))
      const held = (): { holds: boolean; far: number } => {
        if (row.data.rot) return turned(word, k.shape[word], row, at)
        const s = known.place(k.shape[word], row)
        const top = known.top(s, x, z)
        const m = known.middle(s)
        return { holds: top !== undefined && y >= known.base!(s) && y <= top, far: math.hypot(x - m.x, z - m.z) }
      }
      out.push({
        id: row.id,
        activities: k.activities,
        ...(k.priority === undefined ? {} : { priority: k.priority }),
        ...(k.data === undefined ? {} : { data: k.data }),
        points,
        ...held(),
      })
    }
  }
  return out
}
