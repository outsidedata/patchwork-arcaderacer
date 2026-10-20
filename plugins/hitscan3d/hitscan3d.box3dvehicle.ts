// hitscan3d's mod for box3dvehicle (`addons/scenemanager`'s mods). A scene with
// `world.box3dvehicle.mods: { bodies: 'hitscan3d', strike: 'hitscan3d' }` has a car hit the bodies a
// shot hits: its chassis meets each body's shapes, and the body met is hurt as a shot hurts it.
//
// `bodies(w)` is every body a shot can hit now, `{ id, kind, pos, shapes }` (`hittable`): of a kind
// `world.hitscan3d.kinds` lists, none lying `off`, each cylinder as tall as its row's `tall` field
// when it carries one, and the shapes those of the bodies `world.hitscan3d.mods.bodies` hands.
// `strike(w, row, struck)` is hitscan3d's `strike`: the row's `hit` act called, as a rule's (seat −1),
// with the `Struck`.
import type { Row, W } from '#engine/engine.ts'
import { hittable, strike as hurt, type Struck } from './hitscan3d.sim.ts'

export function bodies(w: W) {
  return hittable(w)
}

export function strike(w: W, row: Row, struck: Struck) {
  hurt(w, row, struck)
}
