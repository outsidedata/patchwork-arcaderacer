// shapes3d's mod for particle3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.particle3d.mods: { solids: ['shapes3d'] }` has every particle of a layer with a `bounce` bounce
// off shapes3d's shapes.
//
// `solids(plugins)` is asked once a frame: it reads the shapes off the rows this page holds (and the
// files `world.shapes3d.shapes` names), and hands back where a line from `from` along the unit `dir`
// first meets one within `far` metres, `{ t, normal }`, the normal facing out of the shape, or undefined.
// A box, a plane and a hyperplane are met as hitscan3d meets them (`lineBox`, `linePlane`,
// `lineHyperplane`), a cylinder as hitscan3d's own cylinder; `triangles` are met by nothing.
import type { Row, W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { cylinder } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import type { Meet } from '#plugins/particle3d/particle3d.plugin.ts'
import { lineBox, lineHyperplane, linePlane, shapes, words } from './shapes3d.sim.ts'

type Line = (shape: any, o: number[], d: number[], far: number) => { t: number; normal: number[] } | undefined
const LINE: Record<string, Line> = {
  box: (s, o, d, far) => lineBox(s, o, d, far, 0),
  plane: (s, o, d, far) => linePlane(s, o, d, far, 0),
  hyperplane: (s, o, d, far) => lineHyperplane(s, o, d, far, 0),
  cylinder: (s, o, d, far) => cylinder(o, d, far, s.pos, s.radius, s.pos[1], s.pos[1] + s.height),
}

export function solids(plugins: Plugins): Meet {
  const wire = plugins.wire
  const w = {
    world: wire.scene.world ?? {},
    all: (kind: string) => wire.rows.filter(r => r.kind === kind),
    get: (id: number) => wire.rows.find(r => r.id === id),
    find: (kind: string, pred: (r: Row) => boolean = () => true) => wire.rows.find(r => r.kind === kind && pred(r)),
  } as unknown as W
  // Each shape a line can meet, with the round on the ground that holds it, so a line far off is not tried.
  const placed = shapes(w).filter(p => LINE[p.word]).map(p => ({ p, ...words[p.word].middle(p.shape[p.word]) }))
  return (from, dir, far) => {
    let best: { t: number; normal: number[] } | undefined
    for (const { p, x, z, reach } of placed) {
      if (Math.hypot(x - from[0], z - from[2]) > reach + far) continue
      const hit = LINE[p.word](p.shape[p.word], from, dir, far)
      if (hit && (!best || hit.t < best.t)) best = hit
    }
    return best
  }
}
