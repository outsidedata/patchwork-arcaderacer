// scatter3d's mod for walker (`addons/scenemanager`'s mods). A scene with
// `world.walker.mods: { fixed: 'scatter3d' }` (or `solids: 'scatter3d'`) has walker's bodies walk round
// scatter3d's solid instances, placed on the ground `world.scatter3d.mods.ground` names
// (`terrain3d.scatter3d.ts`), so the trunk a body walks round is the trunk a seat sees.
//
// `fixed(w, x, z, r)` and `solids(w, x, z, r)` are both scatter3d's `solids` there. The instances
// never move, so a scene names `fixed`: walker asks it once for each tile of an agent's map, and every
// agent walks round the trunks with no question asked of scatter3d again; `solids` is asked every call.
import type { W } from '#engine/engine.ts'
import { placed, solids as over } from './scatter3d.sim.ts'

export const solids = (w: W, x: number, z: number, r: number) => over(w, x, z, r, placed(w))

export const fixed = solids
