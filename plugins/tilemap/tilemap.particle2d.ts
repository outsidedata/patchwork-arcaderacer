// tilemap's mod for particle2d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.particle2d.mods: { solids: ['tilemap'] }` has every particle of a layer with a `bounce` bounce
// off the map's walls.
//
// `solids(plugins)` is asked once a frame: it reads the map the loader has handed the page
// (`world.tilemap.file`) with the tilemap row's `edits` in it, and hands back where a line on the stage
// from `from` along the unit `dir` first meets a tile's collision shape within `far` pixels, `{ t,
// normal }`, the normal on the stage facing out of the shape, or undefined; undefined for every line
// before the map has landed. A particle is on the ground, so a line of the stage is laid on the world's
// ground by render2d's `ground`, a shape met in the world, and the place and the normal laid back on the
// stage: the walls a particle meets are the map's cells drawn where render2d draws them, in a world seen
// from above, from the side or isometric alike. A one-way shape is met from above alone, through a side
// whose normal faces up the rows, as a sweep lands on one; a particle inside a shape goes out of it freely.
import type { Plugins } from '#engine/browser.ts'
import type { DecodedMap } from '#plugins/loader/loader.plugin.ts'
import type { Meet } from '#plugins/particle2d/particle2d.plugin.ts'
import { shapes, type Edits } from './tilemap.sim.ts'

type P = [number, number]

// Where the line from `o` along `d`, both in cells, enters a convex shape, `t` the line's own measure,
// and the shape's normal there, facing out; undefined for a line that misses it, starts inside it, or
// enters it past `far`.
function enter(pts: P[], o: P, d: P, far: number): { t: number; normal: P } | undefined {
  // which way round the shape goes, so each side's outward normal is found whichever it is
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    area += a[0] * b[1] - b[0] * a[1]
  }
  const way = area < 0 ? -1 : 1
  let t0 = -Infinity, t1 = Infinity, normal: P = [0, 0]
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const n: P = [(b[1] - a[1]) * way, (a[0] - b[0]) * way]
    const ahead = n[0] * (a[0] - o[0]) + n[1] * (a[1] - o[1]), into = n[0] * d[0] + n[1] * d[1]
    if (into === 0) {
      if (ahead < 0) return undefined
      continue
    }
    const t = ahead / into
    if (into < 0) {
      if (t > t0) {
        t0 = t
        normal = n
      }
    } else t1 = Math.min(t1, t)
  }
  if (t0 < 0 || t0 > t1 || t0 > far) return undefined
  return { t: t0, normal }
}

export function solids(plugins: Plugins): Meet {
  const world = plugins.wire.scene.world ?? {}
  const got = plugins.loader.get(world.tilemap.file) as DecodedMap | undefined
  if (!got) return () => undefined
  const edits: Edits | undefined = plugins.wire.rows.find(r => r.kind === 'tilemap')?.data.edits
  // The stage point of a world point on the ground is G g, G's columns the steps along the world's x
  // and y; a stage point back on the ground is G⁻¹ s, and a normal of the ground on the stage is G⁻ᵀ n.
  const [[ax, ay], [bx, by]] = plugins.render2d.ground()
  const det = ax * by - bx * ay
  const back = (x: number, y: number): P => [(by * x - bx * y) / det, (-ay * x + ax * y) / det]
  const out = (n: P): number[] => {
    const x = (by * n[0] - ay * n[1]) / det, y = (-bx * n[0] + ax * n[1]) / det, l = Math.hypot(x, y)
    return [x / l, y / l]
  }
  return (from, dir, far) => {
    const o = back(from[0], from[1]), d = back(dir[0], dir[1])
    const e = back(from[0] + dir[0] * far, from[1] + dir[1] * far)
    const x0 = Math.min(o[0], e[0]), y0 = Math.min(o[1], e[1])
    const box = { x: Math.floor(x0) - 1, y: Math.floor(y0) - 1, w: Math.ceil(Math.max(o[0], e[0])) - Math.floor(x0) + 2, h: Math.ceil(Math.max(o[1], e[1])) - Math.floor(y0) + 2 }
    let best: { t: number; normal: P } | undefined
    for (const s of shapes(got.map, edits, box)) {
      const hit = enter(s.pts, o, d, far)
      if (!hit || (best && hit.t >= best.t)) continue
      if (s.oneway && !(hit.normal[1] < 0 && Math.abs(hit.normal[1]) >= Math.abs(hit.normal[0]))) continue
      best = hit
    }
    return best && { t: best.t, normal: out(best.normal) }
  }
}
