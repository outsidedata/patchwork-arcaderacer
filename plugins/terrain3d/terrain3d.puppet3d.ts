// terrain3d's mod for puppet3d. A scene with `world.puppet3d.mods: { land: 'terrain3d' }` stands the
// bodies puppet3d poses on terrain3d's land: their feet put down on it, their trunks riding it.
//
// `land(plugins)` is the land as this page has it, terrain3d's browser half's `ground`, whose
// `height(x, z)` is the ground there: undefined until its field has loaded.
import type { Plugins } from '#engine/browser.ts'
import type { Ground } from './terrain3d.plugin.ts'

export const land = (plugins: Plugins): Ground | undefined => plugins.terrain3d.ground
