// subjects' mod for gpgpu3d (`addons/scenemanager`'s mods), the hair workshop's: the subject shown as things
// on the GPU. The workshop's stage names it in `world.gpgpu3d.mods.things`, so hair3d keeps the hair it
// shows out of the subject.
//
// `things(plugins, near)` hands back each of the shown subject's `solids` as `{ capsule: { key, a, b, radius
// } }`, a ball: both its ends the one point its anchor carries, `at` metres in the anchor's frame. A
// capsule is anim's word (`plugins/anim/anim.gpgpu3d.ts`), which the stage names under `behaviors`.
import type { Plugins } from '#engine/browser.ts'
import { carried, type Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'
import type { Numbers } from './subjects.plugin.ts'

export function things(plugins: Plugins): Thing[] {
  const n = plugins.wire.scene.world!.subjects as Numbers
  const mesh = plugins.subjects.mesh()
  if (!mesh || mesh.name !== n.subject) return []
  const anchor = mesh.skeleton.bones[0]
  return n.subjects[n.subject].solids.map((o, i) => {
    const at = carried(anchor.matrixWorld.elements, o.at)
    return { capsule: { key: `subject ${i}`, a: at, b: at, radius: o.radius } }
  })
}
