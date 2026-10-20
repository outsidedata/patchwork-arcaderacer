// terrain3d's mod for skydome3d (`addons/scenemanager`'s mods). A scene with
// `world.skydome3d.mods: { land: 'terrain3d' }` stands skydome3d's rain splashes on terrain3d's land,
// and draws the sky in the weather of the biomes under the camera, by the land's `mix`.
//
// `land(plugins)` is the land as this page has it, terrain3d's browser half's `ground`: undefined
// until its field has loaded. terrain3d places it in its `afterTick`, so a scene lists terrain3d
// before skydome3d, which asks it in its own.
import type { Plugins } from '#engine/browser.ts'
import type { Ground } from './terrain3d.plugin.ts'

export const land = (plugins: Plugins): Ground | undefined => plugins.terrain3d.ground
