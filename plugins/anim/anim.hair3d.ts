// anim's mod for hair3d (`addons/scenemanager`'s mods). A scene with `world.hair3d.mods: { skins: ['anim'],
// behaviors: ['render3d'] }` grows hair3d's hairs on the models anim draws.
//
// `skins(plugins)` is a wearer for each row anim draws whose model is built: its `id` `anim <row id>`, its
// `kind` the kind anim draws it as (the one its `as` names when it names one, else its own), its skins
// every skinned mesh of its model, each `{ skinned: <the mesh> }`, posed for the frame once anim's `tick`
// has run. The word `skinned` is render3d's (`render3d.hair3d.ts`).
import type { Object3D, SkinnedMesh } from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Thing, Wearer } from '#plugins/hair3d/hair3d.sim.ts'
import { animKind, type Numbers } from './anim.sim.ts'

// Each model's skins, found once for the model.
const found = new WeakMap<Object3D, Thing[]>()

export function skins(plugins: Plugins): Wearer[] {
  const kinds = (plugins.wire.scene.world!.anim as Numbers).kinds
  const out: Wearer[] = []
  for (const r of plugins.wire.rows) {
    const kind = animKind(r)
    if (!kinds[kind]) continue
    const root: Object3D | undefined = plugins.anim.model(r.id)
    if (!root) continue
    let list = found.get(root)
    if (!list) {
      list = []
      root.traverse(o => { if ((o as SkinnedMesh).isSkinnedMesh) list!.push({ skinned: o }) })
      found.set(root, list)
    }
    out.push({ id: `anim ${r.id}`, kind, skins: list })
  }
  return out
}
