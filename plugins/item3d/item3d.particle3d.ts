// item3d's mod for particle3d (`addons/scenemanager`'s mods), the page's. A scene with `world.particle3d.mods: {
// sources: ['item3d'] }` burns every item's own effects on it: each spawn of an item's sidecar (`{ effect, at, dir
// }`, the kit kind's effects as pro-ng wrote them) is a source of particle3d's that names its own effect, at the
// spawn's point and along its way as the item stands this frame, for every copy of the item drawn: lying loose, hung
// on a bone by anim or motion3d, or held by one of crowd3d's people. particle3d keeps the effect running on it and
// stops it the frame the copy is gone; an effect's lamp shines through lights3d as any effect's does.
//
// The scene's effects file lists each item's `<item>.effects.json` under `files` (the bake's items tool writes it
// and hands back the names), and particle3d is listed after the plugins that pose the bodies, so a source is where
// its item is drawn.
import type { Plugins } from '#engine/browser.ts'
import type { Sources } from '#plugins/particle3d/particle3d.plugin.ts'

export const sources: Sources = (plugins: Plugins) => plugins.item3d.sources()
