// terrain3d's mod for shapes3d (`addons/scenemanager`'s mods). A scene with
// `world.shapes3d.mods: { height: 'terrain3d' }` stands shapes3d's shapes on the land: `height(w, x, z)`
// is `rawAt`, the ground itself, as terrain3d hands walker its own (`terrain3d.walker.ts`), so a body
// walking shapes3d's ground (`shapes3d.walker.ts`' `ground`) stands on the land wherever no shape is.
import type { W } from '#engine/engine.ts'
import { rawAt } from './terrain3d.sim.ts'

export const height = (w: W, x: number, z: number) => rawAt(w, x, z)
