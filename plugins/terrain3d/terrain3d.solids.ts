// terrain3d's mod for solids (`addons/scenemanager`'s mods). A scene with
// `world.solids.mods: { land: 'terrain3d' }` stands every model solids draws on terrain3d's land.
//
// `land(plugins)` is the land as this page has it, terrain3d's browser half's `ground`: undefined
// until its field has loaded.
import type { Plugins } from '#engine/browser.ts'
import type { Ground } from './terrain3d.plugin.ts'

export const land = (plugins: Plugins): Ground | undefined => plugins.terrain3d.ground
