// box3dvehicle's mod for interact (`plugins/interact`). A scene with `world.interact.mods: { point:
// 'box3dvehicle', object: 'box3dvehicle' }` has a body in an interaction with a car (getting in, driving,
// getting out) placed at, and reaching for, the points of the car's look (`look.points`,
// `box3dvehicle.plugin.ts`), each in the chassis's frame.
//   point(w, car, name)   the world place of the point `name` of the car whose `box3dvehicle` row is
//            `car`, this step, `{ at, yaw }`: `at` the chassis row's `pos` plus the point's `at` turned
//            by the chassis row's `rot` (a point riding `steer` at its place with the wheel straight),
//            and `yaw` the chassis's frame's facing about world up, radians, its +z turned by `rot`
//            facing (sin yaw, cos yaw) on the ground, so that with the car still the page's empty of a
//            point on the chassis hangs in a frame of that yaw (the steering wheel's frame is the
//            chassis's pitched down its column, of the same yaw). Before the car's first step, while
//            its row names no chassis, the chassis is where the row says it will be made, its `pos`
//            and `rot`. Undefined for a name the look has not.
//   object(plugins, car, name)   the empty the page draws for the point this frame
//            (box3dvehicle's `point(id, name)`), its world matrix this frame's; undefined while the car
//            is not drawn, and for a name it has not.
import type { Object3D } from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row, W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import type { Quat, Vec3 } from '#plugins/box3d/box3d.sim.ts'
import { design, pointOf, turn } from './box3dvehicle.sim.ts'

export function point(w: W, car: Row, name: string): { at: number[]; yaw: number } | undefined {
  const p = pointOf(design(w.world, car), name)
  if (!p) return undefined
  const chassis = car.data.chassis === undefined ? car.data : w.get(car.data.chassis).data
  const pos: Vec3 = chassis.pos, rot: Quat = chassis.rot
  const t = turn(rot, p.at), z = turn(rot, [0, 0, 1])
  return { at: [pos[0] + t[0], pos[1] + t[1], pos[2] + t[2]], yaw: math.atan2(z[0], z[2]) }
}

export function object(plugins: Plugins, car: number, name: string): Object3D | undefined {
  return plugins.box3dvehicle.point(car, name)
}
