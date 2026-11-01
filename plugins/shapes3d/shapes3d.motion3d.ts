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
// `spaces(w, at)` is every row of such a kind: `{ id, activities, priority, data, points, holds, far }`, its
// points placed in the world (motion3d's `Constraint`: a point's `at` and `yaw`, a line's `from`, `to`
// and `yaw`, a spline's `points` and `yaw`, a plane's middle, its axes `u` (across) and `v` (along), unit vectors, its `size` and
// `yaw`, and each one's `normal` in the world when it gives one), `holds` whether its shape holds the point `at` [x, y, z], and `far` the metres over the ground
// from `at` to the shape's middle. A cylinder or a box holds a point over its footprint and from its
// underside up to its top, both included. A plane has no inside, and a kind of a plane that lists
// activities throws naming it, as does a point of a word none of these is.
import type { Row, W } from '#engine/engine.ts'
import type { Constraint, Space } from '#plugins/motion3d/motion3d.sim.ts'
import { Euler, Vector3 } from 'three'
import * as math from '#plugins/math/math.sim.ts'
import { wordOf, type Kind } from './shapes3d.sim.ts'

const DEG = Math.PI / 180

// A point of the shape's own frame in the world, by its row's place and yaw.
function toWorld(row: Row, p: number[]): number[] {
  const yaw = row.data.yaw ?? 0
  const c = math.cos(yaw), s = math.sin(yaw)
  const [x, y, z] = row.data.pos
  return [x + p[0] * c + p[2] * s, y + p[1], z - p[0] * s + p[2] * c]
}

// A direction of the shape's own frame in the world, by its row's yaw, made a unit vector.
function dirToWorld(row: Row, d: number[]): number[] {
  const yaw = row.data.yaw ?? 0
  const c = math.cos(yaw), s = math.sin(yaw)
  const l = math.hypot(d[0], d[1], d[2])
  return [(d[0] * c + d[2] * s) / l, d[1] / l, (-d[0] * s + d[2] * c) / l]
}

function placed(kind: string, name: string, row: Row, point: Record<string, any>): Constraint {
  const [word] = Object.keys(point)
  const n = point[word]
  const [yaw, pitch, roll] = (n.turn ?? [0, 0, 0]).map((v: number) => v * DEG)
  const facing = (row.data.yaw ?? 0) + yaw
  const normal = n.normal ? { normal: dirToWorld(row, n.normal) } : {}
  if (word === 'point') return { point: { at: toWorld(row, n.at), yaw: facing, ...normal } }
  if (word === 'line') return { line: { from: toWorld(row, n.from), to: toWorld(row, n.to), yaw: facing, ...normal } }
  if (word === 'spline') return { spline: { points: n.points.map((p: number[]) => toWorld(row, p)), yaw: facing, ...normal } }
  if (word === 'plane') {
    const e = new Euler(pitch, facing, roll, 'YXZ')
    const u = new Vector3(1, 0, 0).applyEuler(e), v = new Vector3(0, 0, 1).applyEuler(e)
    return { plane: { at: toWorld(row, n.at), u: [u.x, u.y, u.z], v: [v.x, v.y, v.z], size: n.size, yaw: facing, ...normal } }
  }
  throw new Error(`shapes3d kind ${kind}'s point ${name} is a ${word}, which is none of point, line, spline, plane`)
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
      const s = known.place(k.shape[word], row)
      const top = known.top(s, x, z)
      const m = known.middle(s)
      const points = Object.fromEntries(Object.entries(k.points ?? {}).map(([name, p]) => [name, placed(kind, name, row, p)]))
      out.push({
        id: row.id,
        activities: k.activities,
        ...(k.priority === undefined ? {} : { priority: k.priority }),
        ...(k.data === undefined ? {} : { data: k.data }),
        points,
        holds: top !== undefined && y >= known.base(s) && y <= top,
        far: math.hypot(x - m.x, z - m.z),
      })
    }
  }
  return out
}
