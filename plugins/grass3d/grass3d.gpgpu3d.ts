// grass3d's mod for gpgpu3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.gpgpu3d.mods.ops` naming grass3d has an op a grass's program (`grass3d.sim.ts`) may use beside
// gpgpu3d's own, reading what only a blade's shader has in scope (`grass3d.glsl.ts`):
//
//   dist   the blade's metres from the camera. It moves, so what reads it is worked out each frame
//
// The blade's own random number is gpgpu3d's `roll`, which grass3d's shaders answer (`gpRollOf`).
import type { Op } from '#plugins/gpgpu3d/gpgpu3d.ops.ts'

export const ops = (): Record<string, Op> => ({
  dist: { moves: true, expr: () => 'gD' },
})
