// scatter3d's mod for cover3d (`addons/scenemanager`'s mods). A scene with
// `world.cover3d.mods: { solids: 'scatter3d' }` has a body take cover behind scatter3d's solid
// instances, placed on the ground `world.scatter3d.mods.ground` names, each as tall as its row's `tall`
// times its size, or without end.
//
// `solids(w, x, z, r)` is scatter3d's `solids` there.
import type { W } from '#engine/engine.ts'
import { placed, solids as over } from './scatter3d.sim.ts'

export const solids = (w: W, x: number, z: number, r: number) => over(w, x, z, r, placed(w))
