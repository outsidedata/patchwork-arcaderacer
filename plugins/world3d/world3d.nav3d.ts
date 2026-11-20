// world3d's mod for nav3d (`addons/scenemanager`'s mods). A scene with `world.nav3d.mods: { graphs: ['world3d'] }`
// has nav3d route over the place's ways, the graph pro-ng's `town_nav.py` wrote from the place's metadata, by the
// name `place` (`GRAPH`, `world3d.sim.ts`): an NPC's definition and a `start` actor name that graph.
//   graphs  `(world) → { place: { asset } }`: the graph, `asset` the catalogue entry of the place's nav file
//           (`world3d.sim.ts`, the parts). It has no bake: pro-ng's build makes it.
import { GRAPH, entry } from './world3d.sim.ts'

export const graphs = (world: Record<string, any>): Record<string, { asset: string }> => ({ [GRAPH]: { asset: entry(world, 'nav') } })
