// dismember3d's mod for hitscan3d (`addons/scenemanager`'s mods). A scene with
// `world.hitscan3d.mods: { bodies: 'dismember3d' }` has a shot meet the joints of every body that comes
// apart: every row of a kind `world.dismember3d.kinds` lists is its joints (`joints`,
// `dismember3d.sim.ts`), each a sphere, one capsule whose two ends are its middle, its part named as its
// segment, as it stands this step of its clip; a segment it has lost has no joint, and a row anim has
// played no clip on yet has none.
//
// Every other body comes from the `bodies` dismember3d is itself handed, `world.dismember3d.mods: {
// bodies: '<a>' }`, none when it names none; a body that mod hands with the id of one of these is this
// one, never both.
import type { W } from '#engine/engine.ts'
import type { Body } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { joints } from './dismember3d.sim.ts'

type Bodies = (w: W) => Body[]

export function bodies(w: W): Body[] {
  const kinds = Object.keys(w.world.dismember3d?.kinds ?? {})
  const mine = kinds.flatMap(kind => w.all(kind)).map(r => ({
    id: r.id, kind: r.kind, pos: r.data.pos as number[],
    shapes: joints(w, r).map(j => ({ part: j.segment, capsule: { a: j.at, b: j.at, radius: j.radius } })),
  }))
  const ids = new Set(mine.map(b => b.id))
  const rest = mod<Bodies>(w.world, 'dismember3d', 'bodies')?.(w) ?? []
  return [...rest.filter(b => !ids.has(b.id)), ...mine]
}
