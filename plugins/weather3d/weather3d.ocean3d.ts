// weather3d's mod for ocean3d (`addons/scenemanager`'s mods). A scene with
// `world.ocean3d.mods: { wind: 'weather3d' }` raises the sea with the weather's wind.
//
// `wind(w)` is the wind standing now, the `mix.wind` of the weather3d row; undefined with no such row.
// A server function: the server's `ampAt` asks it with the truth's `w`, and the page with a `w` over
// the rows it draws.
import type { W } from '#engine/engine.ts'

export const wind = (w: W): number | undefined => w.all('weather3d')[0]?.data.mix.wind
