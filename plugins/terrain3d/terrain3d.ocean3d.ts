// terrain3d's mod for ocean3d (`addons/scenemanager`'s mods). A scene with
// `world.ocean3d.mods: { land: 'terrain3d' }` shoals the sea over terrain3d's seabed.
//
// `land(plugins)` is the land as this page has it, terrain3d's browser half's `ground`, whose `depth`
// the sea's seabed tile is baked from and whose `edits()` say when to bake it again: undefined until
// its field has loaded.
import type { Plugins } from '#engine/browser.ts'
import type { Ground } from './terrain3d.plugin.ts'

export const land = (plugins: Plugins): Ground | undefined => plugins.terrain3d.ground
