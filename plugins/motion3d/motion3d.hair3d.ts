// motion3d's mod for hair3d (`addons/scenemanager`'s mods). A scene with
// `world.hair3d.mods: { skins: ['motion3d'], behaviors: ['render3d'] }` grows hair3d's hairs on the models
// motion3d draws.
//
// `skins(plugins)` is a wearer for each row motion3d draws whose model is built: its `id` `motion3d <row
// id>`, its `kind` the kind motion3d draws it as (the one its `as` names when it names one, else its own),
// its skins every skinned mesh of its model, each `{ skinned: <the mesh> }`, posed for the frame once
// motion3d's `tick` has run. The word `skinned` is render3d's (`render3d.hair3d.ts`).
import type { Object3D, SkinnedMesh } from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Thing, Wearer } from '#plugins/hair3d/hair3d.sim.ts'

// Each model's skins, found once for the model.
const found = new WeakMap<Object3D, Thing[]>()

export function skins(plugins: Plugins): Wearer[] {
  const kinds = plugins.wire.scene.world!.motion3d.kinds as Record<string, unknown>
  const out: Wearer[] = []
  for (const r of plugins.wire.rows) {
    const kind: string = typeof r.data.as === 'string' ? r.data.as : r.kind
    if (!kinds[kind]) continue
    const root: Object3D | undefined = plugins.motion3d.model(r.id)
    if (!root) continue
    let list = found.get(root)
    if (!list) {
      list = []
      root.traverse(o => { if ((o as SkinnedMesh).isSkinnedMesh) list!.push({ skinned: o }) })
      found.set(root, list)
    }
    out.push({ id: `motion3d ${r.id}`, kind, skins: list })
  }
  return out
}
