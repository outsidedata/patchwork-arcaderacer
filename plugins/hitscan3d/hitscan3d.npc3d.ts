// hitscan3d's mod for npc3d (`addons/scenemanager`'s mods). A scene with `world.npc3d.mods: { sight: 'hitscan3d', shot: 'hitscan3d' }` has its NPCs see
// and shoot by hitscan3d, over what `world.hitscan3d.mods` hands it.
//
// `sight(w, from, to)` is hitscan3d's `sees`: nothing of the ground or the solids between the two
// points. `shot(w, from, dir, far, { skip, hurt })` is hitscan3d's `shoot`: where the shot first meets
// anything, `{ point, id }`, `id` the row of the body it met and hurt, or undefined when it meets
// nothing within `far`.
import type { W } from '#engine/engine.ts'
import { sees, shoot } from '#plugins/hitscan3d/hitscan3d.sim.ts'

export const sight = (w: W, from: number[], to: number[]) => sees(w, from, to)

export function shot(w: W, from: number[], dir: number[], far: number, opts: { skip: number[]; hurt: { damage: number; by: number } }) {
  const hit = shoot(w, from, dir, far, opts)
  return hit && { point: hit.point, id: hit.what === 'body' ? hit.id : undefined }
}
