// world3d's mod for shapes3d (`addons/scenemanager`'s mods), the server's. A scene with
// `world.shapes3d.mods: { shapes: ['world3d'] }` has shapes3d hold the place's shapes: what a body walks on and bumps
// into, as pro-ng's `shapes.py` wrote them from the same numbers each solid is cut from.
//   shapes  `(world) → names`: the catalogue entry of the place's shapes file (`world3d.sim.ts`, the parts), one name.
import { entry } from './world3d.sim.ts'

export const shapes = (world: Record<string, any>): string[] => [entry(world, 'shapes3d')]
