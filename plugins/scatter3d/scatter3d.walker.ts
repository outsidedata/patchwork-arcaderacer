// scatter3d's mod for walker (`addons/scenemanager`'s mods). A scene with
// `world.walker.mods: { solids: 'scatter3d' }` has walker's bodies walk round scatter3d's solid
// instances, placed on the ground `world.scatter3d.mods.ground` names (`terrain3d.scatter3d.ts`),
// so the trunk a body walks round is the trunk a seat sees.
//
// `solids(w, x, z, r)` is scatter3d's `solids` there.
import type { W } from '#engine/engine.ts'
import { placed, solids as over } from './scatter3d.sim.ts'

export const solids = (w: W, x: number, z: number, r: number) => over(w, x, z, r, placed(w))
