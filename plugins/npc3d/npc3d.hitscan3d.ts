// npc3d's mod for hitscan3d (`addons/scenemanager`'s mods). A scene with `world.hitscan3d.mods: { bodies: 'npc3d' }` has a shot meet every body of the
// kinds whose definitions name a `body`, whichever body carries it: hitscan3d keeps those of the kinds
// its own `kinds` lists.
//
// `bodies(w)` is one upright cylinder per row, its part named as its kind, standing where its body
// says its feet are now (`bodyOf`, on npc3d's clock), of its definition's `radius` and `tall` metres.
import type { W } from '#engine/engine.ts'
import type { Body } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import { bodyOf, now } from './npc3d.sim.ts'

export function bodies(w: W): Body[] {
  const defs = json(w, w.world.defs)
  const time = now(w)
  return Object.keys(defs).filter(kind => defs[kind].body !== undefined).flatMap(kind => {
    const k = defs[kind]
    const body = bodyOf(kind, k)
    return w.all(kind).map(r => {
      const pos = body.where(r, time)
      return { id: r.id, kind, pos, shapes: [{ part: kind, cylinder: { pos, radius: k.radius, height: k.tall } }] }
    })
  })
}
