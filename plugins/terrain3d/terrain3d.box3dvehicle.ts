// terrain3d's mods for box3dvehicle (`addons/scenemanager`'s mods). A scene with
// `world.box3dvehicle.mods: { land: 'terrain3d' }` throws a car's dust from terrain3d's land, each
// wheel what the surface painted under it sprays; one with `{ grip: 'terrain3d' }` has its wheels
// grip by the surface painted under them, and one with `{ drag: 'terrain3d' }` has them roll as hard
// as it drags.
//
// `land(plugins)` is the land as this page has it, terrain3d's browser half's `ground`: undefined
// until its field has loaded. Its `spray(x, z)` and `mark(x, z)` are the `spray` and `mark` of the
// surface painted at [x, z].
// `grip(w, x, z)` is the `grip` of the surface painted at [x, z] (`paintAt`), 1 on unpainted ground.
// `drag(w, x, z)` is its `drag`, 0 on unpainted ground.
import type { W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Ground } from './terrain3d.plugin.ts'
import { paintAt } from './terrain3d.sim.ts'

export const land = (plugins: Plugins): Ground | undefined => plugins.terrain3d.ground

export const grip = (w: W, x: number, z: number): number => paintAt(w, x, z).grip

export const drag = (w: W, x: number, z: number): number => paintAt(w, x, z).drag
