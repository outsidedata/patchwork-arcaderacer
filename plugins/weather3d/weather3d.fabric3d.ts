// weather3d's mod for fabric3d (`addons/scenemanager`'s mods): the wind the fabrics fly in.
//
// `world.fabric3d.mods: { wind: 'weather3d' }`, with weather3d listed:
//   wind(plugins)  the weather3d row's wind as it blows now, [x, 0, z] metres a second, its gusts on the sky's
//                  clock through weather3d's own `sky` mod (`weather3d.sim.ts`'s `wind`); undefined while the
//                  page has no weather3d row, when fabric3d flies its fabrics in `world.fabric3d.wind`.
import type { Plugins } from '#engine/browser.ts'
import { skyOf, wind as windOf, type Table, type Weathered } from './weather3d.sim.ts'

export function wind(plugins: Plugins): number[] | undefined {
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
  const [x, z] = windOf({ ...(row.data as Weathered), gusts: (world.weather3d as Table).gusts, t: clock.t, day: clock.day })
  return [x, 0, z]
}
