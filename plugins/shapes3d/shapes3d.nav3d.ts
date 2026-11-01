// shapes3d's mod for nav3d (`addons/scenemanager`'s mods). A scene with `world.nav3d.mods: { solids:
// ['shapes3d'] }` has nav3d's bake walk round shapes3d's shapes.
//
// `solids(w, area)` is every shape whose footprint reaches into the area [x0, z0, x1, z1], as nav3d's
// footprint, in the order `shapes` hands them: a cylinder its middle rounded by its radius, a box its
// four corners (`corners`) with no rounding. A shape stands in the way however tall it is, but a plane,
// which is stood on and never in the way.
import type { W } from '#engine/engine.ts'
import type { Footprint } from '#plugins/nav3d/nav3d.sim.ts'
import { corners, shapes, words, type Box, type Cylinder } from './shapes3d.sim.ts'

const feet: Record<string, (shape: any) => Footprint> = {
  cylinder: (c: Cylinder) => ({ points: [[c.pos[0], c.pos[2]]], round: c.radius }),
  box: (b: Box) => ({ points: corners(b), round: 0 }),
}

export const solids = (w: W, area: number[]): Footprint[] =>
  shapes(w)
    .filter(p => {
      if (!words[p.word].base) return false
      const { x, z, reach } = words[p.word].middle(p.shape[p.word])
      return x + reach >= area[0] && x - reach <= area[2] && z + reach >= area[1] && z - reach <= area[3]
    })
    .map(p => feet[p.word](p.shape[p.word]))
