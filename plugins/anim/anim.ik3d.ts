// anim's mod for ik3d (`addons/scenemanager`'s mods). A scene with `world.ik3d.mods: { body: 'anim' }`
// bends the limbs of the bodies anim draws.
//
// `body(plugins, row)` is the body this page's anim draws for the row: `{ kind, root, props, limp }`,
// the anim kind it is drawn by (`as`, else its own kind), its model root, every prop its kind's
// `props` names as `{ model, root }` in that order, `root` undefined until anim has made it (a model
// still loading), and whether it lies limp by the field its kind's `reads` names `limp`. It is
// undefined for a row of a kind anim does not draw, and for one whose model is not built yet.
import type { Object3D } from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { animKind, numbersOf, readsOf } from './anim.sim.ts'

export function body(plugins: Plugins, row: Row): { kind: string; root: Object3D; props: { model: string; root: Object3D | undefined }[]; limp: boolean } | undefined {
  const kind = animKind(row)
  const k = numbersOf(plugins.wire).kinds[kind]
  if (!k) return undefined
  const root: Object3D | undefined = plugins.anim.model(row.id)
  if (!root) return undefined
  const roots: Object3D[] = plugins.anim.props(row.id)
  const props = (k.props ?? []).map((p, i) => ({ model: p.model, root: roots[i] as Object3D | undefined }))
  return { kind, root, props, limp: !!row.data[readsOf(plugins.wire, kind).limp] }
}
