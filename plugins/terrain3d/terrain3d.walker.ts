// terrain3d's mod for walker (`addons/scenemanager`'s mods). A scene with
// `world.walker.mods: { height: 'terrain3d', depth: 'terrain3d', cell: 'terrain3d' }` stands walker's
// bodies on the land.
//
// `height(w, x, z)` is the ground a foot stands on, `rawAt`: under water too, so a body wades on the
// bed and walker's `depth` says how deep it is. `depth(w, x, z)` is `depthAt`, the water over it, 0 on
// a land with no flood. `cell(w)` is the cell of the finest ring the page draws, 2·reach/seg of
// `world.terrain3d.rings[0]` (`terrain3d.rings.ts`' `layoutOf`), so walker stands its bodies on the
// triangles that are drawn.
import type { W } from '#engine/engine.ts'
import { depthAt, rawAt } from './terrain3d.sim.ts'
import { layoutOf } from './terrain3d.rings.ts'

export const height = (w: W, x: number, z: number) => rawAt(w, x, z)
export const depth = (w: W, x: number, z: number) => depthAt(w, x, z)
export const cell = (w: W) => layoutOf(w.world.terrain3d.rings).c0
