// box3dvehicle's mod for interact, on a car of the test's own on flat box3d ground: a manager and a
// yard the test writes, loaded as a game's are and viewed over a loopback, the yard naming the mod for
// interact's `point` and `object`. The car is the open jeep of the plugin's test with points on its
// chassis and on its steering wheel; it is driven round a turn so its chassis is moved, yawed and
// leaning, and what `point` says of the truth is held to the chassis row, and to the empty the page
// draws, which `object` hands out.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { accept, link, load, manager, mod, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import type { Static } from '#plugins/box3d/box3d.sim.ts'
import type { Axle, Point, Vehicle } from './box3dvehicle.sim.ts'
import { object, point } from './box3dvehicle.interact.ts'

const DT = 1 / 60
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}

const axle = (at: number, steered: boolean): Axle => ({
  at, track: 1.7, mount: 0.2,
  wheel: { radius: 0.36, width: 0.28, mass: 20, friction: 0.9, rollingResistance: 0 },
  spring: { stiffness: 16000, length: 0.55, travel: 0.3, sag: 0.1 },
  damper: { bump: 800, rebound: 1600 },
  bumpStop: { length: 0.06, stiffness: 30000 },
  antiRoll: 8000, driven: true, steered,
})
const GRIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.4).toArray() as [number, number, number, number]
const POINTS: Record<string, Point> = {
  seat: [-0.6, -0.05, -0.325],
  footL: { at: [0.1, -0.18, -0.4] },
  gripL: { at: [0.05, 0.45, -0.45], part: 'steer', turn: GRIP },
}
const vehicle: Vehicle = {
  body: { length: 3.6, width: 1.3, height: 0.5, mass: 600, center: [0.1, -0.1, 0], friction: 0.9, cabin: { at: -0.2, length: 1.9, width: 1.2, top: 1.2, topWidth: 1, height: 0.5 } },
  bodies: { enableContactRecycling: false },
  axles: [axle(1.25, true), axle(-1.25, false)],
  engine: { spinSpeed: 30, spinTorque: 300, brakeTorque: 600, coastTorque: 0 },
  steering: { angle: 0.5, hertz: 5, dampingRatio: 1, maxTorque: 1e4 },
  look: {
    paint: { body: 0, cabin: 0, trim: 0, glass: 0, light: 0, tail: 0, amber: 0, tyre: 0, rim: 0, chrome: 0, seat: 0, hook: 0, spring: 0, damper: 0, arm: 0 },
    segments: 16, spokes: 5, rim: 0.6, coils: 6, coilRadius: 0.07, wire: 0.01, arm: 0.03,
    lock: 2, points: POINTS,
    open: {
      windshield: { height: 0.5, lean: 0.35, frame: 0.05, wiper: 0.3 },
      cage: { height: 0.6, tube: 0.035, bend: 0.12, pad: 0.05 },
      wall: 0.06, floor: 0.08, corner: 0.14,
      door: { from: -1, to: 0.4, drop: 0.2, ease: 0.18 },
      rib: { at: -0.12, depth: 0.012, height: 0.03 },
      seat: { width: 0.45, depth: 0.45, base: 0.12, back: 0.5, round: 0.04, tilt: 0.18, head: 0.16 },
      steer: 0.17,
      dash: { depth: 0.12, height: 0.18 },
      hood: { drop: 0.04, round: 0.035 },
    },
  },
}
const surface = { friction: 0.9, restitution: 0, rollingResistance: 0 }
const flat: Static = { pos: [0, -1, 0], rot: [0, 0, 0, 1], shapes: [{ box: [2000, 1, 200], baseMaterial: surface }] }
// Made 1 m up, turned 0.4 rad to the left about up.
const MADE = { pos: [3, 1, -2], rot: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4).toArray() }

const dir = mkdtempSync(join(tmpdir(), 'box3dvehicle-interact-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
const at = { pos: [0, 0, 0], rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], awake: true }
const yard: Scene = {
  world: {
    box3d: { gravity: [0, -10, 0], subStepCount: 4, static: [flat], kinds: {}, mods: { kinds: 'box3dvehicle' } },
    box3dvehicle: { chassis: 'body', wheel: 'tyre', joint: 'axle', vehicles: { car: vehicle }, mods: { gravity: 'box3d' } },
    interact: { kinds: {}, mods: { point: 'box3dvehicle', object: 'box3dvehicle' } },
  },
  prefabs: {
    engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} },
    render3d: { camera: { fov: 60, near: 0.1, far: 500, at: [0, 6, 12], look: [0, 0, 0] } },
    box3d: {}, box3dvehicle: { throttle: 0, brake: 0, steer: 0 }, body: at, tyre: at, axle: {}, probe: {}, first: {},
  },
  actors: [{ is: 'scenemanager' }, { is: 'first' }, { is: 'box3d' }, { is: 'box3dvehicle', vehicle: 'car', ...MADE }, { is: 'probe' }],
  plugins: ['scenemanager', 'box3dvehicle', 'render3d'],
  seats: 1,
}
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { box3d } from ${path('../box3d/box3d.sim.ts')}
import { box3dvehicle } from ${path('./box3dvehicle.sim.ts')}
import { point } from ${path('./box3dvehicle.interact.ts')}
import file from './yard.scene.json' with { type: 'json' }
// first: a rule ahead of the car's, asking every point on the first step, before the car has made its parts.
const first = { before(_me, _dt, w) {
  if (globalThis.interactFirst) return
  const car = w.find('box3dvehicle')
  globalThis.interactFirst = { chassis: car.data.chassis, points: Object.fromEntries(${JSON.stringify(Object.keys(POINTS))}.map(n => [n, point(w, car, n)])) }
} }
export const sim = { scenemanager, box3d, box3dvehicle, body: {}, tyre: {}, axle: {}, first, probe: { after(_me, _dt, w) { globalThis.interactYard = w } } }
export const scene = file
`)

const top: Scene = {
  world: {},
  plugins: ['scenemanager'],
  seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}
const home = pathToFileURL(dir + '/').href
const truth = boot(structuredClone(top), { scenemanager })
const child = (await load(truth, home)).get('yard')!
const page = view(link(loopback(accept(manager(truth)))), top, home, (me, s) => {
  me.plugins.render3d.canvas = { addEventListener: () => {}, style: {}, width: s.prefabs.engine.width, height: s.prefabs.engine.height, remove() {} }
})
const steps = async (k: number) => { for (let i = 0; i < k; i++) { truth.step(DT); await page.frame() } }
const w = () => (globalThis as any).interactYard as W
const car = () => child.rows.find(r => r.kind === 'box3dvehicle')!
const chassisOf = (c: Row) => child.rows.find(r => r.id === c.data.chassis)!.data
const v3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2])
const placed = (pos: number[], rot: number[], p: number[]) => v3(p).applyQuaternion(new THREE.Quaternion(...rot)).add(v3(pos))
// The facing a frame turned `rot` has: its +z turned, on the ground.
const facing = (rot: number[]) => { const z = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...rot)); return Math.atan2(z.x, z.z) }
const near = (a: number[], b: number[], digits = 9) => a.forEach((c, k) => expect(c).toBeCloseTo(b[k], digits))
const atOf = (p: Point) => (Array.isArray(p) ? p : p.at)

test('the yard names this point and this object for interact', () => {
  expect(mod(child.world, 'interact', 'point')).toBe(point)
  expect(mod(child.world, 'interact', 'object')).toBe(object)
})

test('before the car\'s first step, a point is where the row will make the chassis: its pos plus `at` turned by its rot, facing its rot\'s yaw', async () => {
  await steps(1)
  const seen = (globalThis as any).interactFirst
  expect(seen.chassis).toBeUndefined()
  for (const [name, p] of Object.entries(POINTS)) {
    near(seen.points[name].at, placed(MADE.pos, MADE.rot, atOf(p)).toArray())
    expect(seen.points[name].yaw).toBeCloseTo(0.4, 12)
  }
})

test('driven round a turn, each point is the chassis row\'s pos plus its `at` turned by the chassis row\'s rot, facing the chassis\'s yaw; a grip on the wheel at its unturned place; undefined for a name the look has not', async () => {
  await steps(60)
  Object.assign(car().data, { throttle: 0.6, steer: 1 })
  await steps(90)
  const c = car(), ch = chassisOf(c)
  // Moved, yawed off where it was made and leaning in the turn.
  expect(Math.hypot(ch.pos[0] - MADE.pos[0], ch.pos[2] - MADE.pos[2])).toBeGreaterThan(1)
  expect(Math.abs(facing(ch.rot) - 0.4)).toBeGreaterThan(0.2)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...ch.rot))
  expect(up.y).toBeLessThan(0.99999)
  for (const [name, p] of Object.entries(POINTS)) {
    const got = point(w(), c, name)!
    near(got.at, placed(ch.pos, ch.rot, atOf(p)).toArray())
    expect(got.yaw).toBeCloseTo(facing(ch.rot), 12)
    // A yaw θ faces (sin θ, cos θ).
    const z = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...ch.rot))
    expect(Math.sin(got.yaw) * z.z - Math.cos(got.yaw) * z.x).toBeCloseTo(0, 12)
    expect(Math.sin(got.yaw) * z.x + Math.cos(got.yaw) * z.z).toBeGreaterThan(0)
  }
  expect(point(w(), c, 'boot')).toBeUndefined()
  expect(point(w(), c, 'toString')).toBeUndefined()
})

test('the page\'s object of each point is the drawn twin of `point`: with the steering wheel straight, at its place, its parent turned to its yaw; undefined for a name the car has not, or a car not drawn', async () => {
  Object.assign(car().data, { throttle: 0, steer: 0, brake: 1 })
  await steps(60)
  const plugins = page.client!.plugins
  plugins.render3d.scene.updateMatrixWorld(true)
  const c = car()
  for (const name of Object.keys(POINTS)) {
    const o = object(plugins, c.id, name)!
    expect(o.name).toBe(name)
    const want = point(w(), c, name)!
    near(o.getWorldPosition(new THREE.Vector3()).toArray(), want.at, 5)
    const frame = o.parent!.getWorldQuaternion(new THREE.Quaternion()).toArray()
    expect(facing(frame)).toBeCloseTo(want.yaw, 5)
  }
  expect(object(plugins, c.id, 'boot')).toBeUndefined()
  expect(object(plugins, c.id + 1000, 'seat')).toBeUndefined()
})
