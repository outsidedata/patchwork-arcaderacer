// shapes3d's mod for crowd3d (`addons/scenemanager`'s mods): the paths crowd3d's people walk. A scene
// with `world.crowd3d.mods: { paths: 'shapes3d' }` has every line and spline point of a shapes3d kind
// whose `data` gives a `crowd3d` block walked as a path, played as that block says:
//   data.crowd3d  `{ clip, speed }`: the clip or pose a person plays on the kind's paths (one of
//                 `world.crowd3d.clips`, or a pose of `world.crowd3d.poses`) and its speed, metres a
//                 second across the ground
// The points are the kind's `points` (`shapes3d.motion3d.ts`'s header): a `line` `{ from, to }` and a
// `spline` `{ points }`, in the shape's own frame (metres: x across, y up from its foot, z along its
// length), moved and turned with its row; a point of any other word is no path, and is left out.
// A kind that lists `activities` stands in nothing's way, so a kind laid down only for its paths lists
// none of them, `activities: []`.
//
// `paths(w)` is every such point of every row of such a kind, `{ id, point, points, clip, speed }` (crowd3d's
// `Path`): the row, the point's name, its places in the world in order, and the block's clip and speed.
// A block that names no clip, or no speed above 0, throws naming the kind.
import type { Row, W } from '#engine/engine.ts'
import type { Path } from '#plugins/crowd3d/crowd3d.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import type { Kind } from './shapes3d.sim.ts'

// A place of the shape's own frame in the world, by its row's place and yaw.
function toWorld(row: Row, p: number[]): number[] {
  const yaw = row.data.yaw ?? 0
  const c = math.cos(yaw), s = math.sin(yaw)
  const [x, y, z] = row.data.pos
  return [x + p[0] * c + p[2] * s, y + p[1], z - p[0] * s + p[2] * c]
}

export function paths(w: W): Path[] {
  const kinds = (w.world.shapes3d?.kinds ?? {}) as Record<string, Kind>
  const out: Path[] = []
  for (const [kind, k] of Object.entries(kinds)) {
    const block = (k.data as { crowd3d?: { clip?: unknown; speed?: unknown } } | undefined)?.crowd3d
    if (!block) continue
    if (typeof block.clip !== 'string') throw new Error(`shapes3d kind ${kind}'s data.crowd3d names no clip`)
    if (!(typeof block.speed === 'number' && block.speed > 0)) throw new Error(`shapes3d kind ${kind}'s data.crowd3d gives no speed above 0`)
    for (const row of w.all(kind)) {
      for (const [name, p] of Object.entries(k.points ?? {})) {
        const places = p.line ? [p.line.from, p.line.to] : p.spline ? p.spline.points : undefined
        if (!places) continue
        out.push({ id: row.id, point: name, points: places.map((q: number[]) => toWorld(row, q)), clip: block.clip, speed: block.speed })
      }
    }
  }
  return out
}
