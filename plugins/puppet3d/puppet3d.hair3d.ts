// puppet3d's mod for hair3d (`addons/scenemanager`'s mods). A scene with
// `world.hair3d.mods: { skins: ['puppet3d'], behaviors: ['render3d'] }` grows hair3d's hairs on the bodies
// puppet3d draws: a mane on a horse, a coat on a cat.
//
// `skins(plugins)` is a wearer for each row puppet3d draws: its `id` `puppet3d <row id>`, its `kind` the
// row's own, its skins the skinned mesh of each of its layouts, in the order written, each
// `{ skinned: <the mesh> }`, named as its glb's mesh is. Its bones are in metres and named as its skeleton
// names them (`neck`, `tail 3`). The word `skinned` is render3d's (`render3d.hair3d.ts`).
import type { SkinnedMesh } from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Wearer } from '#plugins/hair3d/hair3d.sim.ts'

export function skins(plugins: Plugins): Wearer[] {
  const kinds = plugins.wire.scene.world!.puppet3d.kinds as string[]
  const out: Wearer[] = []
  for (const r of plugins.wire.rows) {
    if (!kinds.includes(r.kind)) continue
    const bodies: SkinnedMesh[] = plugins.puppet3d.bodies(r.id)
    if (!bodies.length) continue
    out.push({ id: `puppet3d ${r.id}`, kind: r.kind, skins: bodies.map(skinned => ({ skinned })) })
  }
  return out
}
