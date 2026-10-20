// terrain3d's mod for flight3d (`addons/scenemanager`'s mods). A scene with
// `world.flight3d.mods: { ground: 'terrain3d' }` gives flight3d this `ground`.
//
// `ground(w, x, z)` is the land's height under a world x, z: terrain3d's heightAt, the water's
// surface where the field floods, so a plane that flies into the sea has hit it.
import type { W } from '#engine/engine.ts'
import { heightAt } from './terrain3d.sim.ts'

export const ground = (w: W, x: number, z: number): number => heightAt(w, x, z)
