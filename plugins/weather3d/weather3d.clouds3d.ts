// weather3d's mod for clouds3d (`addons/scenemanager`'s mods). A scene with
// `world.clouds3d.mods: { weather: 'weather3d' }` draws the clouds of the weather: the deck's cover,
// altitude and density, the cirrus, and the drift that carries them.
//
// `weather(plugins)` is weather3d's `weather()`: the weather standing under the camera this frame,
// `{ mix, lift, to, from, blend, shares, drift }`; undefined with no weather3d row or no camera.
import type { Plugins } from '#engine/browser.ts'
import type { Now } from './weather3d.plugin.ts'

export const weather = (plugins: Plugins): Now | undefined => plugins.weather3d.weather(plugins)
