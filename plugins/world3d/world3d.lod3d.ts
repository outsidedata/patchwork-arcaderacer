// world3d's mod for lod3d (`addons/scenemanager`'s mods), the page's. A scene with `world.lod3d.mods: { hollows:
// ['world3d'] }` hands lod3d's drawers each building of the place as a box, so no grass, tree or stone is drawn inside
// one, through its floor.
//   hollows  `(plugins) → Hollow[]`: the place's hollows file (`world3d.sim.ts`, the parts), each `{ at, half }` a box
//            standing square to the world round a building whose entry stands at elevation 0, `at` its middle and
//            `half` its half sizes in metres, from a metre under its lowest point to its top.
import type { Plugins } from '#engine/browser.ts'
import type { Hollow } from '#plugins/lod3d/lod3d.plugin.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { entry } from './world3d.sim.ts'

const SQUARE: Hollow['rot'] = [0, 0, 0, 1]

export function hollows(plugins: Plugins): Hollow[] {
  const boxes = json(plugins.wire, entry(plugins.wire.scene.world ?? {}, 'hollows')) as { at: Hollow['at']; half: Hollow['half'] }[]
  return boxes.map(b => ({ at: b.at, rot: SQUARE, half: b.half }))
}
