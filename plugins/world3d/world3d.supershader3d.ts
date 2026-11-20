// world3d's mod for supershader3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.supershader3d.mods: { looks: 'world3d', behaviors: ['world3d'] }` has supershader3d draw the place's looks
// file and bind world3d's course table (`world3d.plugin.ts`, The course table) as the shared texture `courses`,
// which the wall looks read.
//   looks      `(world) → name`: the catalogue entry of the place's looks file (`world3d.sim.ts`, the parts).
//   behaviors  `(plugins) → { courses }`: the course table, made on supershader3d's first ask.
import type { Plugins } from '#engine/browser.ts'
import type { Shared } from '#plugins/supershader3d/supershader3d.plugin.ts'
import { entry } from './world3d.sim.ts'

export const looks = (world: Record<string, any>): string => entry(world, 'looks')

export function behaviors(_plugins: Plugins): Record<string, Shared> {
  return { courses: plugins => plugins.world3d.courses(plugins.render3d.THREE) }
}
