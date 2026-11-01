// box3dvehicle's mod for box3d: the kinds a car is made of, built from the scene's
// `world.box3dvehicle` (`box3dvehicle.sim.ts`), which a scene hands box3d by naming it in
// `world.box3d.mods.kinds`. A car's rows say which Vehicle each part is of and which corner each
// wheel and joint is: the `box3dvehicle` row that lists it, its `vehicle`, and the part's place in
// `wheels` or `joints`.
//   the chassis  the body's box and, where the body has a `cabin`, the cabin's hull, both of the
//                body's `friction`; a body with no cabin is the one box. Its mass, centre of mass and
//                inertia set outright (`inertia`).
//   a wheel      a ball of its axle's `wheel.radius`, with contact events on, so box3d writes what it
//                touches; its mass and inertia set outright, a tyre's of its `width` (`wheelInertia`);
//                and `allowFastRotation`, since Box3D otherwise holds a body to a quarter turn a
//                step, 47 rad/s at 60 steps a second, which is 19 m/s on a 0.42 m wheel in any gear.
//                A ball rolls on one point that never changes: a cylinder is a hull of flat sides in
//                Box3D, and each side meeting the ground is a bump, several a step at speed, which
//                shake the car and let it creep on a slope where a ball sleeps.
//   a joint      a wheel joint from the chassis to the wheel's inner face, both frames turned a
//                quarter about z, the chassis's on the axis below the corner's mount where the
//                wheel's face is at full droop (`frameA`); Box3D's spring off and its limits the ends
//                of the travel, until box3dvehicle's rule sets them each step; the spin motor on at
//                no torque; and on a `steered` axle the steering at `steering`'s numbers, on any
//                other the steering off, so the wheel is held straight and never toes in.
// Every body also takes the Vehicle's `bodies`.
import type { Row, W } from '#engine/engine.ts'
import type { Body, Joint, Kinds } from '#plugins/box3d/box3d.sim.ts'
import { cabinPoints, corners, design, frameA, inertia, QUARTER, wheelInertia, type Corner, type Fleet, type Vehicle } from './box3dvehicle.sim.ts'

// An inertia matrix of three moments about the body's own axes.
const diagonal = ([x, y, z]: number[]): NonNullable<Body['mass']>['inertia'] => ({ cx: [x, 0, 0], cy: [0, y, 0], cz: [0, 0, z] })

export function chassisBody(v: Vehicle): Body {
  const { length, height, width, mass, center, friction, cabin } = v.body
  return {
    type: 'dynamic',
    ...v.bodies,
    shapes: [
      { box: [length / 2, height / 2, width / 2], baseMaterial: { friction } },
      ...(cabin ? [{ hull: { points: cabinPoints(v, cabin) }, baseMaterial: { friction } }] : []),
    ],
    mass: { mass, center: [...center], inertia: diagonal(inertia(v)) },
  }
}

export function wheelBody(v: Vehicle, c: Corner): Body {
  const { radius, mass, friction, rollingResistance } = c.axle.wheel
  return {
    type: 'dynamic',
    ...v.bodies,
    allowFastRotation: true,
    shapes: [{ sphere: { center: [0, 0, 0], radius }, baseMaterial: { friction, rollingResistance }, enableContactEvents: true }],
    mass: { mass, center: [0, 0, 0], inertia: diagonal(wheelInertia(c.axle.wheel)) },
  }
}

export function wheelJoint(v: Vehicle, c: Corner): Joint {
  const { travel } = c.axle.spring
  return {
    type: 'wheel',
    localFrameA: frameA(c, 0), localFrameB: { pos: [...c.hub], rot: QUARTER },
    enableSuspensionSpring: false, enableSuspensionLimit: true, lowerSuspensionLimit: 0, upperSuspensionLimit: travel,
    enableSpinMotor: true, maxSpinTorque: 0, spinSpeed: 0,
    enableSteering: c.axle.steered, steeringHertz: v.steering.hertz, steeringDampingRatio: v.steering.dampingRatio,
    maxSteeringTorque: v.steering.maxTorque, targetSteeringAngle: 0,
  }
}

// The car that lists a part's row in `field`, and the part's place in that list.
function ownerOf(w: W, row: Row, field: 'chassis' | 'wheels' | 'joints'): { v: Vehicle; i: number } {
  for (const car of w.all('box3dvehicle')) {
    const ids: number[] = field === 'chassis' ? [car.data.chassis] : car.data[field] ?? []
    const i = ids.indexOf(row.id)
    if (i >= 0) return { v: design(w.world, car), i }
  }
  throw new Error(`box3dvehicle: no car lists ${row.kind} ${row.id} as its ${field}`)
}
const cornerOf = (w: W, row: Row, field: 'wheels' | 'joints'): [Vehicle, Corner] => {
  const { v, i } = ownerOf(w, row, field)
  return [v, corners(v)[i]]
}

export function kinds(w: W): Kinds {
  const f: Fleet = w.world.box3dvehicle
  return {
    bodies: {
      [f.chassis]: row => chassisBody(ownerOf(w, row, 'chassis').v),
      [f.wheel]: row => wheelBody(...cornerOf(w, row, 'wheels')),
    },
    joints: { [f.joint]: row => wheelJoint(...cornerOf(w, row, 'joints')) },
  }
}
