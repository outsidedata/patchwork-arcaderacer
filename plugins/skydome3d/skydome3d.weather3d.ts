// skydome3d's mod for weather3d (`addons/scenemanager`'s mods). A scene with
// `world.weather3d.mods: { sky: 'skydome3d' }` runs the weather under this sky.
//
// `sky(w)` is `{ t, day, sun }`: the skydome3d row's `t`, `world.skydome3d.day`, and the unit way
// toward the sun at that `t` (`sun` of `skydome3d.sim.ts`). A server function: weather3d's tick asks
// it with the truth's `w`, and the page with a `w` over the rows it draws. With no skydome3d row it
// throws.
import type { W } from '#engine/engine.ts'
import type { SkyClock } from '#plugins/weather3d/weather3d.sim.ts'
import { sun, type Sky, type Table } from './skydome3d.sim.ts'

export const sky = (w: Pick<W, 'find' | 'world'>): SkyClock => {
  const s = w.find('skydome3d').data as Sky, { day } = w.world.skydome3d as Table
  return { t: s.t, day, sun: sun({ ...s, day }) }
}
