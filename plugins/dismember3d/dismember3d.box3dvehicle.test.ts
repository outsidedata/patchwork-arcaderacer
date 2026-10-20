// dismember3d's mod for box3dvehicle, given to box3dvehicle by one key of a scene:
// `world.box3dvehicle.mods.strike` is 'dismember3d', its `bodies` hitscan3d's, whose `bodies` are
// dismember3d's joints. The test writes a manager and one child, a yard, which `load` boots as a
// game's would: a car on flat box3d ground, its chassis 3.6 m long, and a zombie standing 10 m ahead
// of it, facing across its way with its right side to the car, one of `world.dismember3d.kinds`,
// off for hitscan3d while `limp`. The zombie's rig is written here: one clip, `idle`, of one frame,
// every segment of `LIMBS` its two ends in the body's frame (x its left), the arms out at the
// shoulders, the legs straight down. A `post`, no kind of dismember3d's, keeps what struck it. Its
// `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Static } from '#plugins/box3d/box3d.sim.ts'
import type { Fleet, Vehicle } from '#plugins/box3dvehicle/box3dvehicle.sim.ts'
import type { Struck } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import { PIECES } from './dismember3d.sim.ts'
import { strike } from './dismember3d.box3dvehicle.ts'

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
const fleet: Fleet = { chassis: 'body', wheel: 'tyre', joint: 'axle', vehicles: { car }, hit: HIT, mods: { gravity: 'box3d', bodies: 'hitscan3d', strike: 'dismember3d' } }

// Each segment's two ends, [ax, ay, az, bx, by, bz], on the body's left; the right is its mirror.
const left: Record<string, number[]> = {
  arm: [0.2, 1.4, 0, 0.45, 1.4, 0], forearm: [0.45, 1.4, 0, 0.7, 1.4, 0], hand: [0.7, 1.4, 0, 0.8, 1.4, 0],
  upleg: [0.1, 0.9, 0, 0.1, 0.5, 0], leg: [0.1, 0.5, 0, 0.1, 0.1, 0], foot: [0.1, 0.1, 0, 0.1, 0, 0.15],
}
const idle: Record<string, unknown> = { fps: 30, head: [[0, 1.5, 0, 0, 1.75, 0]] }
for (const [segment, e] of Object.entries(left)) {
  idle[`${segment}L`] = [e]
  idle[`${segment}R`] = [[-e[0], e[1], e[2], -e[3], e[4], e[5]]]
}
const url = '/dismember3d-box3dvehicle-test/zombie.rig.json'
written(url, JSON.stringify({ ends: { zombie: { idle } } }))

const at = { pos: [0, 0, 0], rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], awake: true }
const piece = { of: 0, limbs: [], ...at }
const yard = {
  world: {
    loader: { assets: { rig: { type: 'json', url, preload: true } } },
    anim: { kinds: { zombie: { model: 'zombie', rig: 'rig' } } },
    box3d: { gravity: [0, -10, 0], subStepCount: 4, static: [flat], kinds: {}, mods: { kinds: 'box3dvehicle' } },
    box3dvehicle: fleet,
    hitscan3d: { mods: { bodies: 'dismember3d' }, kinds: { zombie: { off: 'limp' } }, rewind: 5 },
    dismember3d: { kinds: { zombie: {} } },
    ragdoll3d: {},
  },
  prefabs: {
    engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, probe: {}, box3d: {}, box3dvehicle: { throttle: 0, brake: 0, steer: 0 },
    body: at, tyre: at, axle: {}, post: { struck: null },
    zombie: { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], clip: 'idle', clipT: 0, rig: 'stand', off: [], hp: {}, limp: false, limpFor: 0, blow: null, pose: null },
    ...Object.fromEntries(PIECES.map(p => [p, piece])),
  },
  actors: [
    { is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }, { is: 'box3d' },
    { is: 'box3dvehicle', vehicle: 'car', pos: [0, 1, 0], rot: [0, 0, 0, 1] },
    // Yaw 0 faces +z, its left +x: its right side is to the car coming along +x.
    { is: 'zombie', pos: [10, 0, 0] },
    { is: 'post' },
  ],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'dismember3d-box3dvehicle-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { box3d } from ${path('../box3d/box3d.sim.ts')}
import { box3dvehicle } from ${path('../box3dvehicle/box3dvehicle.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = {
  scenemanager, loader, box3d, box3dvehicle, body: {}, tyre: {}, axle: {}, zombie: {},
  ...Object.fromEntries(${JSON.stringify(PIECES)}.map(p => [p, {}])),
  post: { acts: { hit(me, _w, seat, struck) { if (seat === -1) me.data.struck = struck } } },
  probe: { before(_me, _dt, w) { globalThis.dismember3dBox3dvehicle = w } },
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
const booted = async () => (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!

test('a car driven into a zombie crushes the arm and the leg on the side it met, each a piece, and lays what is left down along its way; it crushes it no more', async () => {
  const truth = await booted()
  for (let i = 0; i < 60; i++) truth.step(DT)
  rowOf(truth, 'box3dvehicle').data.throttle = 1
  let i = 0
  while (!rowOf(truth, 'zombie').data.limp && i++ < 600) truth.step(DT)
  const zombie = rowOf(truth, 'zombie')
  expect(zombie.data.off).toEqual(['armR', 'forearmR', 'handR', 'uplegR', 'legR', 'footR'])
  expect(zombie.data.limp).toBe(true)
  expect(zombie.data.blow.dir[0]).toBeGreaterThan(0.99)
  expect(zombie.data.blow.speed).toBeGreaterThan(HIT.speed)
  expect(zombie.data.pose).toEqual({ clip: 'idle', clipT: 0 })
  const pieces = () => truth.rows.filter(r => PIECES.includes(r.kind)).map(r => ({ kind: r.kind, of: r.data.of, limbs: r.data.limbs }))
  expect(pieces()).toEqual([
    { kind: 'arm', of: zombie.id, limbs: ['armR', 'forearmR', 'handR'] },
    { kind: 'thigh', of: zombie.id, limbs: ['uplegR', 'legR', 'footR'] },
  ])
  // Driven on through where it lay: limp, it is struck no more.
  for (let k = 0; k < 120; k++) truth.step(DT)
  expect(zombie.data.off).toHaveLength(6)
  expect(pieces()).toHaveLength(2)
})

test('a part on neither side crushes both thighs; a row of no kind of dismember3d\'s is struck as hitscan3d strikes it', async () => {
  const truth = await booted()
  truth.step(DT)
  const w = (globalThis as { dismember3dBox3dvehicle?: W }).dismember3dBox3dvehicle!
  const zombie = rowOf(truth, 'zombie'), post = rowOf(truth, 'post')
  const struck: Struck = { damage: 50, by: 0, part: 'head', point: [10, 1.6, 0], dir: [1, 0, 0], what: 'car', speed: 5 }
  strike(w, zombie, struck)
  expect(zombie.data.off).toEqual(['uplegL', 'legL', 'footL', 'uplegR', 'legR', 'footR'])
  expect(zombie.data.blow).toEqual({ dir: [1, 0], speed: 5, height: 1.6 })
  strike(w, post, struck)
  expect(post.data.struck).toEqual(struck)
})
