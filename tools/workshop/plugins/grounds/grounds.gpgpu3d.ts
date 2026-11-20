// grounds' mod for gpgpu3d (`addons/scenemanager`'s mods), the grass workshop's: the treader shown as things
// on the GPU. The workshop's stage names it in `world.gpgpu3d.mods.things`, so the grass it grows is
// pressed by what treads it.
//
// `things(plugins)` hands back the treader's parts where they stand this frame: each cylinder `{ cylinder:
// { pos, radius, height } }`, shapes3d's word, and each box `{ hyperbox: { at, rot, half } }`,
// box3dvehicle's, both of which the stage names under `behaviors`.
import type { Plugins } from '#engine/browser.ts'
import type { Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'

export const things = (plugins: Plugins): Thing[] => plugins.grounds.things()
