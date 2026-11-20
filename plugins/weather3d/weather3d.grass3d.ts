// weather3d's mod for grass3d (`addons/scenemanager`'s mods): the wind the grass bends in.
//
// `world.grass3d.mods: { wind: 'weather3d' }`, with weather3d listed before grass3d:
//   wind(plugins)  `{ wind, drift }`, the weather3d row's wind as it blows now, [x, z] metres a second, its
//                  gusts on the sky's clock through weather3d's own `sky` mod (`weather3d.sim.ts`'s `wind`),
//                  and its `drift`, the wind's integral in metres, which carries the grass's gusts as it
//                  carries the clouds and the rain; undefined while the page has no weather3d row.
import type { Plugins } from '#engine/browser.ts'
import type { Wind } from '#plugins/grass3d/grass3d.sim.ts'
import { skyOf, wind as windOf, type Table, type Weathered } from './weather3d.sim.ts'

export function wind(plugins: Plugins): Wind | undefined {
  const rows = plugins.wire.rows
  const row = rows.find(r => r.kind === 'weather3d')
  if (!row) return undefined
  const world = plugins.wire.scene.world!
  const reading = {
    world,
    find(kind: string) {
      const r = rows.find(r => r.kind === kind)
      if (!r) throw new Error(`no ${kind} matches`)
      return r
    },
  } as Parameters<typeof skyOf>[0]
  const clock = skyOf(reading)
  const w = row.data as Weathered
  const [x, z] = windOf({ ...w, gusts: (world.weather3d as Table).gusts, t: clock.t, day: clock.day })
  return { wind: [x, z], drift: [w.drift[0], w.drift[1]] }
}
