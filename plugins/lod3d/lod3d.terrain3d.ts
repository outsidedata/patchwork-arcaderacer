// lod3d's mod for terrain3d (`addons/scenemanager`'s mods). A scene with `world.terrain3d.mods: { ready:
// ['lod3d'] }` counts a place terrain3d prepares as done only once lod3d's share of it is done too, so a cut
// or a teleport lands on a field already held, never one filling in.
//
// `ready(plugins)` is lod3d's browser half's `ready()`: whether every layer is held and every tile in reach
// of the place is worked, before the camera arrives, or held, after (`lod3d.plugin.ts`, Prepared places).
// The place reaches lod3d through terrain3d's own mod for it, `seen`'s `prepared` (`terrain3d.lod3d.ts`).
import type { Plugins } from '#engine/browser.ts'

export const ready = (plugins: Plugins): boolean => plugins.lod3d.ready()
