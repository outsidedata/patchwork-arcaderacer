// terrain3d's mod for dismember3d (`addons/scenemanager`'s mods). A scene with
// `world.dismember3d.mods: { land: 'terrain3d' }` lays dismember3d's gore on terrain3d's land.
//
// `land(plugins)` is the land as this page has it, terrain3d's browser half's `ground`: undefined
// until its field has loaded.
import type { Plugins } from '#engine/browser.ts'
import type { Ground } from './terrain3d.plugin.ts'

export const land = (plugins: Plugins): Ground | undefined => plugins.terrain3d.ground
