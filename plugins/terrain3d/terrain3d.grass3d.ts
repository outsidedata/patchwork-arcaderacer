// terrain3d's mod for grass3d (`addons/scenemanager`'s mods): the land the grass stands on.
//
// `world.grass3d.mods: { land: 'terrain3d' }`, and grass3d with terrain3d listed before it:
//   land(plugins)  the land as this page has it, undefined until it has one: its `ground` (`height`, the
//                  height the rings draw; `cover`, the painted surface's cover, 0 on a road; `ramp`, a rule
//                  over the land record, `layer:<name>` too; `rules`, the land's own check of a list),
//                  `version`, moving with a new land and every stroke, `cell`, the finest ring's cell
//                  (2·reach/seg of `world.terrain3d.rings[0]`), the lattice the finest ring's triangles
//                  stand on, so a blade stands on the triangle that is drawn, `shown` once the rings are
//                  on the scene, `prepared` the place `prepare` holds, and `worker`, this module with the
//                  land's field and unsaved strokes, for grass3d's workers.
//   worker(held)   in a worker of grass3d's (`grass3d.worker.ts`): the same ground, made from the field and
//                  unsaved strokes `land` handed, so a block filled there is the page's to the bit.
import type { Plugins } from '#engine/browser.ts'
import type { Ground, Land as Handed } from '#plugins/grass3d/grass3d.sim.ts'
import { land as landOf, type Field, type Land, type Stroke } from './terrain3d.sim.ts'
import { layoutOf } from './terrain3d.rings.ts'

// This module, which grass3d's workers load to answer the land.
const HERE = import.meta.url

const ids = new WeakMap<object, number>()
let next = 0
const idOf = (o: object) => ids.get(o) ?? (ids.set(o, next++), next - 1)

// What a worker makes the land from: the field and each layer's unsaved stroke.
export type Held = { field: Field; unsaved: (Stroke | undefined)[] }

export function land(plugins: Plugins): Handed | undefined {
  const t = plugins.terrain3d
  const ground = t?.ground
  if (!ground) return undefined
  const e = ground.edits()
  const l = e.land as Land
  const held: Held = { field: l.field, unsaved: (l.field.layers ?? []).map((_, k) => l.unsaved(k)) }
  const prepared = ground.prepared()
  return {
    ground: { height: ground.height, cover: ground.cover, ramp: ground.ramp, rules: ground.rules },
    version: `${idOf(e.land)} ${e.layers.map((x: { version: number }) => x.version).join(' ')}`,
    cell: layoutOf(plugins.wire.scene.world!.terrain3d.rings).c0,
    shown: ground.shown(),
    ...(prepared && { prepared }),
    worker: { url: HERE, held },
  }
}

// The ground in a worker of grass3d's, made from what `land` handed.
export function worker(held: Held): Ground {
  const l = landOf(held.field, { unsaved: k => held.unsaved[k] })
  return { height: (x, z) => l.height(x, z), cover: (x, z) => l.paint(x, z).cover, ramp: (r, x, z) => l.ramp(r, x, z), rules: (list, what) => l.rules(list, what) }
}
