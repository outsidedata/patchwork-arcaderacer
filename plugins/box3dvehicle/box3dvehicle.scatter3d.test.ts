// box3dvehicle's mod for scatter3d, given to scatter3d by a list of a scene: `world.scatter3d.mods.hollows`
// names 'box3dvehicle'. Its hollows are each car's body and wheels as the page has its rows: the test
// hands it a page's `plugins` holding a car turned and moved off the origin, and a car whose parts have
// not come yet.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { corners, type Axle, type Cabin, type Vehicle } from './box3dvehicle.sim.ts'
import { hollows } from './box3dvehicle.scatter3d.ts'

const axle = (at: number): Axle => ({
  at, track: 1.7, mount: 0.2,
  wheel: { radius: 0.42, width: 0.32, mass: 20, friction: 0.9, rollingResistance: 0 },
  spring: { stiffness: 16000, length: 0.55, travel: 0.3, sag: 0.1 },
  damper: { bump: 800, rebound: 1600 },
  bumpStop: { length: 0.06, stiffness: 30000 },
  antiRoll: 8000, driven: true, steered: at > 0,
})
const CABIN: Cabin = { at: -0.35, length: 1.7, width: 1.2, top: 1.3, topWidth: 1.1, height: 0.55 }
const vehicle: Vehicle = {
  body: { length: 3.6, width: 1.3, height: 0.7, mass: 600, center: [0, 0, 0], friction: 0.9, cabin: CABIN },
  bodies: {},
  axles: [axle(1.25), axle(-1.25)],
  engine: { spinSpeed: 30, spinTorque: 300, brakeTorque: 600, coastTorque: 0 },
  steering: { angle: 0.5, hertz: 5, dampingRatio: 1, maxTorque: 1e4 },
  look: {
    paint: { body: 0, cabin: 0, trim: 0, glass: 0, light: 0, tail: 0, amber: 0, tyre: 0, rim: 0, chrome: 0, seat: 0, hook: 0, spring: 0, damper: 0, arm: 0 },
    segments: 16, spokes: 5, rim: 0.6, coils: 6, coilRadius: 0.07, wire: 0.01, arm: 0.03,
    bumpers: { depth: 0.15, height: 0.2, overhang: 0.1, round: 0.03, bolts: 4 },
  },
}
const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.8).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.1)).toArray()
const pos = [40, 3, -12]
const wheelAt = (i: number) => ({ pos: [41 + i, 2.6, -11 - i], rot: [0, 0.6, 0, 0.8] })
const rows = [
  { id: 1, kind: 'body', data: { pos, rot } },
  ...[0, 1, 2, 3].map(i => ({ id: 2 + i, kind: 'tyre', data: wheelAt(i) })),
  { id: 6, kind: 'box3dvehicle', data: { vehicle: 'jeep', chassis: 1, wheels: [2, 3, 4, 5] } },
  // A car whose parts have not come yet.
  { id: 7, kind: 'box3dvehicle', data: { vehicle: 'jeep', chassis: 8, wheels: [9, 10, 11, 12] } },
  // One whose row does not name its parts yet.
  { id: 13, kind: 'box3dvehicle', data: { vehicle: 'jeep' } },
]
// The page's plugins, every car of the vehicle `jeep`.
const pluginsOf = (jeep: Vehicle) => ({ wire: { rows, scene: { world: { box3dvehicle: { chassis: 'body', wheel: 'tyre', joint: 'axle', vehicles: { jeep } } } } } }) as unknown as Plugins
const plugins = pluginsOf(vehicle)

test('a car\'s hollows are its body from its bottom to its cabin\'s top, out to its bumpers, turned with the chassis, and each wheel its radius round and its width across', () => {
  const got = hollows(plugins)
  expect(got).toHaveLength(5)
  const [body, ...wheels] = got
  const H = vehicle.body.height, top = H / 2 + CABIN.height
  expect(body.half).toEqual([3.6 / 2 + 0.15, (top + H / 2) / 2, 1.3 / 2 + 0.1])
  expect(body.rot).toEqual(rot)
  // Its middle is the chassis's origin moved up the chassis's own y to halfway between bottom and top.
  const mid = new THREE.Vector3(0, (top - H / 2) / 2, 0).applyQuaternion(new THREE.Quaternion(...rot)).add(new THREE.Vector3(...pos))
  body.at.forEach((v, k) => expect(v).toBeCloseTo(mid.toArray()[k], 12))
  corners(vehicle).forEach((c, i) => {
    expect(wheels[i]).toEqual({ at: wheelAt(i).pos, rot: wheelAt(i).rot, half: [c.axle.wheel.radius, c.axle.wheel.radius, c.axle.wheel.width / 2] })
  })
})

test('a car with no cabin hollows its body\'s box alone, its middle the chassis\'s origin', () => {
  const [body] = hollows(pluginsOf({ ...vehicle, body: { ...vehicle.body, cabin: undefined } }))
  expect(body.half).toEqual([3.6 / 2 + 0.15, vehicle.body.height / 2, 1.3 / 2 + 0.1])
  body.at.forEach((v, k) => expect(v).toBeCloseTo(pos[k], 12))
})
