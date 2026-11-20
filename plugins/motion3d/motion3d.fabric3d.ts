// motion3d's mod for fabric3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.fabric3d.mods: { sources: ['motion3d'] }` holds fabrics to the bodies motion3d draws: a cape to a
// body's shoulders, a ribbon to the stick it carries. What a fabric drapes on is gpgpu3d's, which motion3d
// hands its bodies' capsules (`motion3d.gpgpu3d.ts`).
//
// `sources(plugins)` is asked once a frame and hands back every row
// motion3d draws, once its model and its props are made, its `key` the row's id and its `of` the kind motion3d
// draws it as (its `as`, else its kind). `point(on)` is, the first of: the first object under its model whose
// name ends with `on`, a bone say (motion3d's `socket`); its prop of the model `on`; the first object under one
// of its props whose name ends with `on`, an empty in the prop; each the three.js object, which fabric3d reads
// where the frame draws it, bent, aimed and carried as motion3d left it.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Thing } from '#plugins/fabric3d/fabric3d.plugin.ts'
import type { Numbers } from './motion3d.sim.ts'
import { playKind, propName, propsOf } from './motion3d.play.ts'

// Each prop's objects found by the end of their names, kept with the prop.
const found = new WeakMap<THREE.Object3D, Map<string, THREE.Object3D | undefined>>()
const under = (root: THREE.Object3D, suffix: string) => {
  let names = found.get(root)
  if (!names) found.set(root, names = new Map())
  if (!names.has(suffix)) {
    let hit: THREE.Object3D | undefined
    root.traverse(o => { if (!hit && o.name.endsWith(suffix)) hit = o })
    names.set(suffix, hit)
  }
  return names.get(suffix)
}

export function sources(plugins: Plugins): Thing[] {
  const kinds = (plugins.wire.scene.world?.motion3d as Numbers | undefined)?.kinds ?? {}
  const out: Thing[] = []
  for (const r of plugins.wire.rows) {
    const of = playKind(r), k = kinds[of]
    if (!k || !plugins.motion3d.model(r.id)) continue
    const named = propsOf(plugins, of)
    const props: THREE.Object3D[] = plugins.motion3d.props(r.id)
    if (named.length && !props.length) continue
    out.push({
      key: `${r.id}`, of,
      point(on: string) {
        const bone = plugins.motion3d.socket(r.id, on)
        if (bone) return bone
        const i = named.findIndex(p => propName(p) === on)
        if (i >= 0) return props[i]
        for (const p of props) {
          const hit = under(p, on)
          if (hit) return hit
        }
        return undefined
      },
    })
  }
  return out
}
