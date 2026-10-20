// interact's mod for ik3d (`addons/scenemanager`'s mods). A scene with `world.ik3d.mods: { limbs:
// 'interact' }` has the hands and feet of a body in an interaction reach its machine's points.
//
// `limbs(plugins, row)` is the limbs the step the row is in bends (its `ik`), each `{ bones, pole,
// target }` with `target` the object of its point as `world.interact.mods.object` hands it this frame;
// a point not drawn yet is left out, so its limb stands as the clip draws it until it is. Undefined for
// a row in no interaction, or in a step that bends none.
import type { Object3D } from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { interactionOf, type State } from './interact.sim.ts'

type ObjectMod = (plugins: Plugins, machine: number, name: string) => Object3D | undefined

export function limbs(plugins: Plugins, row: Row): { bones: [string, string, string]; pole: number[]; target: Object3D }[] | undefined {
  const s = row.data.interact as State | null | undefined
  if (!s) return undefined
  const step = interactionOf(plugins.wire, s.kind, s.name)?.steps[s.step]
  if (!step?.ik?.length) return undefined
  const object = mod<ObjectMod>(plugins.wire.scene.world!, 'interact', 'object')
  if (!object) throw new Error('interact bends limbs onto the points a mod draws, and the scene names none in world.interact.mods.object')
  return step.ik.flatMap(l => {
    const target = object(plugins, s.machine, l.target)
    return target ? [{ bones: l.bones, pole: l.pole, target }] : []
  })
}
