// supershader3d's mod for lights3d (`addons/scenemanager`'s mods): what glows. A scene with
// `world.lights3d.mods: { glow: 'supershader3d' }` and `world.lights3d.areas.glow` lights itself from every glowing
// material supershader3d draws (`supershader3d.glowmap.ts`, made when the scene gives `world.supershader3d.glowmap`).
//
// `glow(plugins)` is supershader3d's glowmap as the last frame drew it, or undefined where the scene gives no glowmap
// or before it is first drawn.
import type { Plugins } from '#engine/browser.ts'
import type { Glowmap } from './supershader3d.plugin.ts'

export const glow = (plugins: Plugins): Glowmap | undefined => plugins.supershader3d.glowmap()
