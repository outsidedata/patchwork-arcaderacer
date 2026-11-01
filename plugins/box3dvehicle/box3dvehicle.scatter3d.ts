// box3dvehicle's mod for scatter3d (`addons/scenemanager`'s mods). A scene with
// `world.scatter3d.mods: { hollows: ['box3dvehicle'] }` has scatter3d draw no grass, bush or branch
// inside a car: the boxes are every car's as this page has its rows that frame.
//
// `hollows(plugins)` is, for each car whose row names its parts and whose parts have come, its body
// and each of its wheels as a box (scatter3d's Hollow): the body on the chassis row, from the bottom
// of its box to the top of its cabin (`body.cabin.height` over its top; its box's top where it has no
// cabin), as long as the body and its
// bumpers, as wide as the body and the bumpers' overhang; and each wheel on its wheel row, its radius
// round and its width across, about its spin axis, z.
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import type { Hollow } from '#plugins/scatter3d/scatter3d.plugin.ts'
import { corners, design, turn } from './box3dvehicle.sim.ts'

export function hollows(plugins: Plugins): Hollow[] {
  const world = plugins.wire.scene.world!
  const rows = new Map<number, Row>(plugins.wire.rows.map(r => [r.id, r]))
  const out: Hollow[] = []
  for (const car of plugins.wire.rows) {
    if (car.kind !== 'box3dvehicle' || car.data.chassis === undefined) continue
    const chassis = rows.get(car.data.chassis), wheels = (car.data.wheels as number[]).map(id => rows.get(id))
    if (!chassis || wheels.some(w => !w)) continue
    const v = design(world, car), { length, width, height, cabin } = v.body, b = v.look.bumpers
    const bottom = -height / 2, top = height / 2 + (cabin?.height ?? 0)
    const mid = turn(chassis.data.rot, [0, (bottom + top) / 2, 0])
    out.push({
      at: [chassis.data.pos[0] + mid[0], chassis.data.pos[1] + mid[1], chassis.data.pos[2] + mid[2]],
      rot: chassis.data.rot,
      half: [length / 2 + (b?.depth ?? 0), (top - bottom) / 2, width / 2 + (b?.overhang ?? 0)],
    })
    corners(v).forEach((c, i) => {
      const { radius, width: across } = c.axle.wheel
      out.push({ at: wheels[i]!.data.pos, rot: wheels[i]!.data.rot, half: [radius, radius, across / 2] })
    })
  }
  return out
}
