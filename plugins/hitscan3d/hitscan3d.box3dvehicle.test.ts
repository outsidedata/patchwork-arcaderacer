// hitscan3d's mod for box3dvehicle, given to box3dvehicle by two keys of a scene:
// `world.box3dvehicle.mods.bodies` and `.strike` are 'hitscan3d'. The test writes a manager and one
// child, a yard, which `load` boots as a game's would: a car on flat box3d ground, its chassis 3.6 m
// long, and a soldier standing 10 m ahead of it, one of walker's bodies (`walker.hitscan3d.ts`), which
// hitscan3d lists, off while `limp`. The soldier's `hit` keeps what struck it and lies down, as a
// game's body does when it dies.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type Truth } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import type { Static } from '#plugins/box3d/box3d.sim.ts'
import type { Fleet, Vehicle } from '#plugins/box3dvehicle/box3dvehicle.sim.ts'
import type { Numbers as Walker } from '#plugins/walker/walker.sim.ts'

const DT = 1 / 60
const HIT = { speed: 2, damage: 10 }
const flat: Static = { pos: [0, -1, 0], rot: [0, 0, 0, 1], shapes: [{ box: [200, 1, 200], baseMaterial: { friction: 0.9, restitution: 0, rollingResistance: 0 } }] }
const axle = (at: number, steered: boolean) => ({
  at, track: 1.7, mount: 0.2,
  wheel: { radius: 0.36, width: 0.28, mass: 20, friction: 0.9, rollingResistance: 0 },
  spring: { stiffness: 16000, length: 0.55, travel: 0.3, sag: 0.1 },
  damper: { bump: 800, rebound: 1600 },
  bumpStop: { length: 0.06, stiffness: 30000 },
  antiRoll: 8000, driven: true, steered,
})
const car: Vehicle = {
  body: { length: 3.6, width: 1.3, height: 0.5, mass: 600, center: [0.1, -0.1, 0], friction: 0.9 },
  bodies: { enableContactRecycling: false },
  axles: [axle(1.25, true), axle(-1.25, false)],
  engine: { spinSpeed: 30, spinTorque: 300, brakeTorque: 600, coastTorque: 0 },
  steering: { angle: 0.5, hertz: 5, dampingRatio: 1, maxTorque: 1e4 },
  look: { paint: { body: 0, cabin: 0, trim: 0, glass: 0, light: 0, tail: 0, amber: 0, tyre: 0, rim: 0, chrome: 0, seat: 0, hook: 0, spring: 0, damper: 0, arm: 0 }, segments: 16, spokes: 5, rim: 0.6, coils: 6, coilRadius: 0.07, wire: 0.01, arm: 0.03 },
}
const fleet: Fleet = { chassis: 'body', wheel: 'tyre', joint: 'axle', vehicles: { car }, hit: HIT, mods: { gravity: 'box3d', bodies: 'hitscan3d', strike: 'hitscan3d' } }
const SOLDIER: Walker = {
  radius: 0.4, height: 1.8, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9,
  step: 0.6, maxSlope: 0.7, slopeBand: 0.05, slide: 2, wade: 0.5, span: 0.5, probe: 1.5, seekSpeed: 1.5,
}

const at = { pos: [0, 0, 0], rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], awake: true }
const yard = {
  world: {
    box3d: { gravity: [0, -10, 0], subStepCount: 4, static: [flat], kinds: {}, mods: { kinds: 'box3dvehicle' } },
    box3dvehicle: fleet,
    walker: { kinds: { soldier: SOLDIER } },
    hitscan3d: { mods: { bodies: 'walker' }, kinds: { soldier: { off: 'limp' } }, rewind: 5 },
  },
  prefabs: {
    engine: { dt: DT }, scenemanager: { out: {} }, box3d: {}, box3dvehicle: { throttle: 0, brake: 0, steer: 0 },
    body: at, tyre: at, axle: {}, soldier: { pos: [0, 0, 0], limp: false, struck: null },
  },
  actors: [
    { is: 'scenemanager' }, { is: 'box3d' },
    { is: 'box3dvehicle', vehicle: 'car', pos: [0, 1, 0], rot: [0, 0, 0, 1] },
    { is: 'soldier', pos: [10, 0, 0] },
  ],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'hitscan3d-box3dvehicle-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { box3d } from ${path('../box3d/box3d.sim.ts')}
import { box3dvehicle } from ${path('../box3dvehicle/box3dvehicle.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = {
  scenemanager, box3d, box3dvehicle, body: {}, tyre: {}, axle: {},
  soldier: { acts: { hit(me, _w, seat, struck) { if (seat === -1) Object.assign(me.data, { struck, limp: true }) } } },
}
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
}
const rowOf = (truth: Truth, kind: string) => truth.rows.find(r => r.kind === kind)!

test('a car driven into a soldier strikes it once, on its body, along the way the car goes, by the chassis, harder the faster it goes', async () => {
  const truth = (await load(boot(top, { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  for (let i = 0; i < 60; i++) truth.step(DT)
  rowOf(truth, 'box3dvehicle').data.throttle = 1
  let i = 0
  while (!rowOf(truth, 'soldier').data.struck && i++ < 600) truth.step(DT)
  const chassis = rowOf(truth, 'body')
  const { struck } = rowOf(truth, 'soldier').data
  expect(struck).toMatchObject({ by: chassis.id, part: 'soldier', what: 'car' })
  expect(struck.speed).toBeGreaterThan(HIT.speed)
  expect(struck.damage).toBe(HIT.damage * struck.speed)
  expect(struck.dir[0]).toBeGreaterThan(0.99)
  // Met on the soldier's middle, 10 m ahead, where the car's nose reaches it.
  expect(struck.point[0]).toBeCloseTo(10, 5)
  expect(chassis.data.pos[0] + car.body.length / 2).toBeGreaterThan(10 - SOLDIER.radius - 0.2)
})
