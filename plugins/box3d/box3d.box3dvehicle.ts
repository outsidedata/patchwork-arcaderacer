// box3d's mod for box3dvehicle (`addons/scenemanager`'s mods). A scene with
// `world.box3dvehicle.mods: { gravity: 'box3d' }` gives box3dvehicle the gravity its cars' bodies
// fall by, which it preloads every spring against.
//
// `gravity(w)` is the gravity box3d's world steps with, decided as box3d decides it (`box3d.sim.ts`):
// the `box3d` row's `gravity` while the row carries one, else the scene's `world.box3d.gravity`, else
// Box3D's own (b3DefaultWorldDef's).
import type { W } from '#engine/engine.ts'
import { b3, type Vec3 } from './box3d.sim.ts'

export function gravity(w: W): Vec3 {
  return w.all('box3d')[0]?.data.gravity ?? w.world.box3d.gravity ?? b3.b3DefaultWorldDef().gravity
}
