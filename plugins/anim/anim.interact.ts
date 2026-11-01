// anim's mod for interact (`addons/scenemanager`'s mods). A scene with `world.interact.mods: { body:
// 'anim' }` has the body of a row in an interaction drawn on its machine's point as the page draws it.
//
// `body(plugins, row)` is the body this page's anim draws for the row: `{ root, props, limp }`, its
// model root, the roots of the props anim has hung on it (every one made so far, in its kind's order),
// and whether it lies limp by the field its kind's `reads` names `limp`. It is undefined for a row of
// a kind anim does not draw, and for one whose model is not built yet.
import type { Object3D } from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { animKind, numbersOf, readsOf } from './anim.sim.ts'

export function body(plugins: Plugins, row: Row): { root: Object3D; props: Object3D[]; limp: boolean } | undefined {
  const kind = animKind(row)
  if (!numbersOf(plugins.wire).kinds[kind]) return undefined
  const root: Object3D | undefined = plugins.anim.model(row.id)
  if (!root) return undefined
  return { root, props: plugins.anim.props(row.id), limp: !!row.data[readsOf(plugins.wire, kind).limp] }
}
