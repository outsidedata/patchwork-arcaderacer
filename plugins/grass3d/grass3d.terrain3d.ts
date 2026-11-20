// grass3d's mod for terrain3d (`addons/scenemanager`'s mods). A scene with `world.terrain3d.mods: { ready:
// ['grass3d'] }` counts a place terrain3d prepares as done only once grass3d's share of it is done too, so a
// cut or a teleport lands on grass already standing, never one filling in.
//
// `ready(plugins)` is grass3d's browser half's `ready()`: whether every block of the ground the grass would
// hold round the place is filled, before the camera arrives, or held, after (`grass3d.plugin.ts`, Prepared
// places). The place reaches grass3d through terrain3d's own mod for it, `land`'s `prepared`
// (`terrain3d.grass3d.ts`).
import type { Plugins } from '#engine/browser.ts'

export const ready = (plugins: Plugins): boolean => plugins.grass3d.ready()
