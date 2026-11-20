// instances3d's mod for lod3d (`addons/scenemanager`'s mods). A scene with `world.lod3d.mods: { behaviors:
// [..., 'instances3d'] }` has every lod3d layer that gives `mesh` drawn as instanced meshes:
//
//   "copse": { "on": ["land"], "rows": { ... }, ..., "mesh": { "asset": "trees", "lods": [0, 2, 3], "shadow": 140, "leaf": 0.55 } }
//
// `behaviors()` is `{ mesh }`, lod3d's Drawer for that word: its numbers are an instances3d look
// (`instances3d.sim.ts`), it draws `lods.length` shells, and its Drawing is an Instances of the layer's rows
// out to lod3d's rings (`plugins.instances3d.instances`), each tile's things added in its shell. instances3d
// is listed in the scene, before render3d.
import type { Drawer } from '#plugins/lod3d/lod3d.sim.ts'
import { check, type Look } from './instances3d.sim.ts'
import type { Instances } from './instances3d.plugin.ts'

export function behaviors(): Record<string, Drawer> {
  return {
    mesh: {
      check: (look: Look, rings, what, world) => check(look, rings.length, what, world),
      shells: (look: Look) => look.lods.length,
      draw(look: Look, made) {
        const { plugins, layer } = made
        if (!plugins.instances3d) throw new Error(`lod3d layer ${made.name} draws a mesh through instances3d, which this scene does not list`)
        const it: Instances | undefined = plugins.instances3d.instances(plugins, {
          name: `lod3d layer ${made.name}`, rows: Object.keys(layer.rows), seed: layer.seed, shells: made.rings, slots: made.slots, look,
          ...(layer.lean !== undefined && { lean: layer.lean }), ...(made.hollows !== undefined && { hollows: made.hollows }),
        })
        if (!it) return undefined
        return { arrive: (things, shell) => it.add(things, shell), leave: added => it.remove(added), frame: boxes => it.frame(boxes), show: () => it.show(), stale: () => it.stale(), dispose: () => it.dispose() }
      },
    },
  }
}
