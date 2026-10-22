// skydome3d's mods for ocean3d (`addons/scenemanager`'s mods). A scene with
// `world.ocean3d.mods: { light: 'skydome3d', wind: 'skydome3d' }` draws the sea in the sky's light and
// raises it with the sky's wind.
//
// `light(plugins)` is skydome3d's `light()`: the sun's way and colour, the zenith's and the horizon's
// colour, as the sky drew them this frame; undefined before its first frame.
// `wind(w)` is the wind standing now, the `mix.wind` of the skydome3d row; undefined with no such row
// or no wind on it.
// A server function: the server's `ampAt` asks it with the truth's `w`, and the page with a `w` over
// the rows it draws.
import type { W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Light } from './skydome3d.plugin.ts'

export const light = (plugins: Plugins): Light | undefined => plugins.skydome3d.light()

export const wind = (w: W): number | undefined => w.all('skydome3d')[0]?.data.mix?.wind
