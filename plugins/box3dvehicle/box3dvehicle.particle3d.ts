// box3dvehicle's mod for particle3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.particle3d.mods: { sources: ['box3dvehicle'] }` throws effects from every car's wheels and
// tailpipes as its `world.particle3d.attach` says (particle3d's header, Attachments).
//
// `sources(plugins)` is asked once a frame: it reads every car off the rows this page holds, each a
// `box3dvehicle` row whose `chassis` and `wheels` it holds too, and hands back, for each, its sources, each
// `of` the car's vehicle (its row's `vehicle`):
//
//   wheel    one at each wheel, keyed by the car's row and the wheel's corner: at the land under the wheel
//            (`world.box3dvehicle.mods.land`, the land its tracks are laid on), or at the wheel's lowest
//            point where there is no land, that height its `floor`; thrown along the way its tread pushes
//            the ground back (`tread`, `box3dvehicle.plugin.ts`) and up by half as much.
//   exhaust  one at each tailpipe of the car's look, keyed by the car's row and the pipe's place in the list:
//            at the pipe's tip, along the way it points, both turned with the chassis.
//
// and their drivers, each a number every frame:
//
//   rpm          the car row's `rpm`; 0 for a car whose engine writes none (direct drive)
//   throttle     the car row's `throttle`, -1 to 1
//   speed        m/s across the land: the wheel's, for a wheel; the chassis's, for an exhaust
//   slide        m/s the tread slides over the ground, spinning or locked: the wheel's, for a wheel; the most
//                of the car's wheels', for an exhaust
//   slip         m/s the wheel goes sideways, along its axle: the wheel's, for a wheel; the most of the car's
//                wheels', for an exhaust
//   load         newtons the wheel's suspension pushes it down on the ground with, the car row's `load` of
//                its corner (`box3dvehicle.sim.ts`): the wheel's, for a wheel; the most of the car's wheels',
//                for an exhaust; 0 before the server half has stepped the car
//   compression  metres the wheel's spring is pushed in from full droop, the car row's `compression` of its
//                corner: a wheel's alone; 0 before the server half has stepped the car
//   grounded     1 while the wheel touches anything, the car row's `grounded` of its corner, else 0: a
//                wheel's alone
//   height       metres the wheel's lowest point is above the land under it: a wheel's alone, and only where
//                there is land
//   backX, backZ the way the tread pushes the ground, across the land, of length 1: a wheel's alone
//   sideX, sideZ the way the wheel goes sideways, along its axle across the land, of length 1, or 0 for
//                one that goes straight or stands on its end: a wheel's alone
//
// and, for a wheel on land whose `drivers(x, z)` hands it any, the drivers the ground under it hands what is
// on it (terrain3d's surfaces' `drivers`), which a source of a wheel off that ground has none of. So the
// effects file the scene plays has a driver of each name its sources hand (its value there is what plays
// where no car drives it, as in the particle workshop), and a layer says with them what it does:
// `"every": "slip > 2 ? 0.05 / clamp(slip / 2, 1, 30) : 0"` holds a skid's stream until the wheel slides
// 2 m/s sideways and then quickens it, and `"dir": ["sideX", 0.1, "sideZ"]` throws it the way it slides.
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Source } from '#plugins/particle3d/particle3d.plugin.ts'
import type { Quat, Vec3 } from '#plugins/box3d/box3d.sim.ts'
import { corners, design, turn, type Fleet } from './box3dvehicle.sim.ts'
import { tread, type Land } from './box3dvehicle.plugin.ts'

export function sources(plugins: Plugins): Source[] {
  const world = plugins.wire.scene.world
  const fleet: Fleet | undefined = world?.box3dvehicle
  if (!fleet) return []
  const rows = new Map<number, Row>(plugins.wire.rows.map(r => [r.id, r]))
  const ground = mod<Land>(world!, 'box3dvehicle', 'land')?.(plugins)
  const out: Source[] = []
  for (const car of plugins.wire.rows) {
    if (car.kind !== 'box3dvehicle' || car.data.chassis === undefined) continue
    const chassis = rows.get(car.data.chassis), wheels = (car.data.wheels as number[]).map(id => rows.get(id))
    if (!chassis || wheels.some(w => !w)) continue
    const v = design(world!, car), of: string = car.data.vehicle
    const rpm: number = car.data.rpm ?? 0, throttle: number = car.data.throttle ?? 0
    const loads: number[] = car.data.load ?? [], compressions: number[] = car.data.compression ?? [], grounds: boolean[] = car.data.grounded ?? []
    const most = { slide: 0, slip: 0, load: 0 }
    corners(v).forEach((c, i) => {
      const wd = wheels[i]!.data, r = c.axle.wheel.radius
      const [x, y, z] = wd.pos as Vec3, [vx, , vz] = wd.vel as Vec3
      const { speed, slide, back } = tread(wd, r)
      // The wheel's axle across the land (its own z turned by its rot), and its speed along it.
      const [ax, , az] = turn(wd.rot as Quat, [0, 0, 1]), across = Math.hypot(ax, az)
      const sideways = across > 1e-6 ? (vx * ax + vz * az) / across : 0
      const s = across > 1e-6 ? Math.sign(sideways) / across : 0
      const floor = ground ? ground.height(x, z) : undefined
      const drivers: Record<string, number> = {
        rpm, throttle, speed, slide, slip: Math.abs(sideways),
        load: loads[i] ?? 0, compression: compressions[i] ?? 0, grounded: grounds[i] ? 1 : 0,
        backX: back[0], backZ: back[1], sideX: ax * s, sideZ: az * s,
      }
      if (floor !== undefined) {
        drivers.height = y - r - floor
        Object.assign(drivers, ground!.drivers?.(x, z))
      }
      most.slide = Math.max(most.slide, drivers.slide)
      most.slip = Math.max(most.slip, drivers.slip)
      most.load = Math.max(most.load, drivers.load)
      const at = floor ?? y - r
      out.push({ key: `${car.id}:${i}`, on: 'wheel', of, at: [x, at, z], dir: [back[0], 0.5, back[1]], floor: at, drivers })
    })
    const [px, py, pz] = chassis.data.pos as Vec3, rot = chassis.data.rot as Quat
    const [cvx, , cvz] = chassis.data.vel as Vec3, going = Math.hypot(cvx, cvz)
    ;(v.look.exhaust ?? []).forEach((ex, i) => {
      const t = turn(rot, ex.at)
      out.push({
        key: `${car.id}:exhaust:${i}`, on: 'exhaust', of, at: [px + t[0], py + t[1], pz + t[2]], dir: turn(rot, ex.dir),
        drivers: { rpm, throttle, speed: going, slide: most.slide, slip: most.slip, load: most.load },
      })
    })
  }
  return out
}
