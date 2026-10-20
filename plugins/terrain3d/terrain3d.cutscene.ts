// terrain3d's mod for the cutscene (`addons/scenemanager`'s mods). A scene with
// `world.cutscene.mods: { land: 'terrain3d' }` stands the points, the marks and the shots the cutscene's
// browser half places on terrain3d's land, as its server half stands them on terrain3d's `heightAt`.
//
// `land(plugins)` is the land as this page has it, terrain3d's browser half's `ground`: undefined
// until its field has loaded.
import type { Plugins } from '#engine/browser.ts'
import type { Ground } from './terrain3d.plugin.ts'

export const land = (plugins: Plugins): Ground | undefined => plugins.terrain3d.ground
