// walker's mod for ragdoll3d (`addons/scenemanager`'s mods). A scene with
// `world.ragdoll3d.mods: { gravity: 'walker' }` drops ragdoll3d's limp bodies at the gravity they
// walked under.
//
// `gravity(world, kind)` is `world.walker.kinds[kind].gravity`, m/s², or undefined for a kind the
// scene's walker table does not list, or a scene with none.
import type { Numbers } from './walker.sim.ts'

export const gravity = (world: Record<string, any>, kind: string): number | undefined =>
  (world.walker?.kinds as Record<string, Numbers> | undefined)?.[kind]?.gravity
