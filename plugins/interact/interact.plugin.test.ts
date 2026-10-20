// interact's browser half, on a scene the test writes into a game folder of its own and boots through
// the scenemanager's `load`, so the scene's mods are loaded as a game's are: a `cart` whose interaction
// `board` bends limbs in its last step, and the game's own `rack` handing interact the cart's points and
// the bodies as the page draws them, out of `plugins.rack`, which each test fills. Each frame it reads
// every interaction, throwing for one out of shape and for a scene with no `world.interact`, and checks
// the mods' plugins are listed before it; a body in a step whose point is drawn is put on that point,
// its props with it.
import { afterAll, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { interact } from './interact.plugin.ts'
import type { Interaction } from './interact.sim.ts'

const DT = 1 / 60
const BOARD: Interaction = {
  body: 'person',
  steps: [
    { name: 'reach', clip: 'reach', at: 'foot' },
    { name: 'grab', clip: 'perch', at: 'seat', turn: 90, hold: true, ik: [{ bones: ['LeftArm', 'LeftForeArm', 'LeftHand'], target: 'gripL', pole: [1, -1, 0] }] },
  ],
}
const BOARD_URL = '/interact-plugin-test/board.json'
written(BOARD_URL, JSON.stringify(BOARD))
// `slip` walks 1.5 m ahead and 0.6 m left over 1.5 s turning 60° left; `out` plays it from the seat.
const RIG = {
  clips: { idle: { loop: true }, reach: {}, perch: { loop: true }, slip: {} },
  roles: { still: 'idle' },
  table: {
    idle: { dur: 1, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [1, 0, 0, 0]] },
    slip: { dur: 1.5, forward: 1.5, left: 0.6, yaw: 60, travel: [[0, 0, 0, 0], [1.5, 1.5, 0.6, 60]] },
  },
}
const RIG_URL = '/interact-plugin-test/rig.json'
written(RIG_URL, JSON.stringify(RIG))
const OUT: Interaction = { body: 'person', steps: [{ name: 'out', clip: 'slip', at: 'seat', turn: 20, travel: 'from' }] }
const OUT_URL = '/interact-plugin-test/out.json'
written(OUT_URL, JSON.stringify(OUT))
const yard: Scene = {
  world: {
    loader: { assets: { board: { type: 'json', url: BOARD_URL, preload: true }, out: { type: 'json', url: OUT_URL, preload: true }, rig: { type: 'json', url: RIG_URL, preload: true } } },
    anim: { still: 0.05, shift: 0.75, leap: 0.5, landFall: 7.5, moves: 0.05, turns: 30, kinds: { person: { rig: 'rig', model: 'figure', fade: 0.2, reads: { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' } } } },
    interact: { kinds: { cart: { board: 'board', out: 'out' } }, mods: { point: 'rack', object: 'rack', body: 'rack' } },
    shipped: { plugins: ['rack'] },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }],
  plugins: ['scenemanager'],
}
const top: Scene = {
  world: {}, plugins: ['scenemanager'], seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}
const dir = mkdtempSync(join(tmpdir(), 'interact-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
mkdirSync(join(dir, 'plugins/rack'), { recursive: true })
writeFileSync(join(dir, 'plugins/rack/rack.plugin.ts'), 'export const rack = () => ({})\n')
writeFileSync(join(dir, 'plugins/rack/rack.interact.ts'), `export const point = () => undefined
export const object = (plugins, machine, name) => plugins.rack?.points?.[machine + '.' + name]
export const body = (plugins, row) => plugins.rack?.bodies?.[row.id]
`)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader }
export const scene = file
`)

// A page's plugins on the booted yard, its scene listing `plugins`, render3d's three handed it.
async function page(plugins = ['loader', 'shipped', 'interact', 'ik3d', 'render3d']) {
  const t = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  return { wire: { n: 1, rows: [] as any[], scene: { ...t.scene, plugins } }, render3d: { THREE }, rack: { points: {} as Record<string, THREE.Object3D>, bodies: {} as Record<number, any> } } as any
}

// The cart drawn as a walker draws it mid-stride: its frame moved, turned and leant, its seat on it
// with a turn of its own (a hand's, which the body does not take), and a person's body drawn where its
// row stands, at its own scale, holding a prop in the world beside it.
function stage(p: any, step = 1) {
  const cart = new THREE.Group()
  cart.position.set(4, 2.6, -3)
  cart.quaternion.setFromEuler(new THREE.Euler(0.08, 0.6, -0.05, 'YXZ'))
  const seat = new THREE.Object3D()
  seat.position.set(0.1, 0.2, -0.05)
  seat.quaternion.setFromEuler(new THREE.Euler(0.4, 0.3, 0.2))
  cart.add(seat)
  const world = new THREE.Scene()
  world.add(cart)
  const root = new THREE.Group()
  root.position.set(4, 2.9, -3)
  root.rotation.set(0, 0.6 + Math.PI / 2, 0)
  root.scale.setScalar(0.01)
  const gun = new THREE.Group()
  gun.position.set(4.3, 4.1, -2.8)
  gun.quaternion.setFromEuler(new THREE.Euler(0.2, 1.1, 0))
  world.add(root, gun)
  world.updateMatrixWorld(true)
  p.rack.points['1.seat'] = seat
  p.rack.bodies[2] = { root, props: [gun], limp: false }
  p.wire.rows = [
    { id: 1, kind: 'cart', data: {} },
    { id: 2, kind: 'person', data: { interact: { machine: 1, kind: 'cart', name: 'board', step, t: 0 } } },
  ]
  return { cart, seat, root, gun }
}

const close = (a: number[], b: number[], digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits))
// The world place, turn and scale of an object.
const worldOf = (o: THREE.Object3D) => {
  const at = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
  o.matrixWorld.decompose(at, q, s)
  return { at: at.toArray(), q: q.toArray(), s: s.toArray() }
}
// Where the step puts the body: at the seat, turned as the cart is and then by the step's 90° about its up.
const placed = (cart: THREE.Object3D, seat: THREE.Object3D) => ({
  at: seat.getWorldPosition(new THREE.Vector3()).toArray(),
  q: cart.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)).toArray(),
})
// A prop's world matrix in the root's frame: what moving the body with its props keeps.
const held = (root: THREE.Object3D, prop: THREE.Object3D) => new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(prop.matrixWorld).toArray()

test('a scene listing the mods\' plugin before interact ticks; listed after it, the frame throws', async () => {
  const ok = await page(), late = await page(['loader', 'interact', 'shipped', 'ik3d', 'render3d'])
  expect(() => interact().tick(ok)).not.toThrow()
  expect(() => interact().tick(late)).toThrow('interact is listed before rack, whose object it reads that frame')
  expect(() => interact().afterTick(late)).toThrow('interact is listed before rack, whose object it reads that frame')
})

test('a scene with no world.interact, and an interaction out of shape, throw the frame they are read', async () => {
  const bare = await page()
  bare.wire.scene.world = { ...bare.wire.scene.world, interact: undefined }
  expect(() => interact().tick(bare)).toThrow('interact: the scene gives no world.interact.kinds')
  const ok = await page()
  written(BOARD_URL, JSON.stringify({ ...BOARD, steps: [] }))
  try {
    expect(() => interact().tick(ok)).toThrow('interact cart.board.steps is not a list of steps')
  } finally {
    written(BOARD_URL, JSON.stringify(BOARD))
  }
})

test('a scene naming a body and no object throws: the body is drawn on the points the object mod draws', async () => {
  const p = await page()
  const flat = { ...BOARD, steps: BOARD.steps.map(({ ik, ...s }) => s) }
  written(BOARD_URL, JSON.stringify(flat))
  try {
    p.wire.scene.world = { ...p.wire.scene.world, interact: { ...p.wire.scene.world.interact, mods: { point: 'rack', body: 'rack' } } }
    expect(() => interact().tick(p)).toThrow('interact draws bodies on, and bends limbs onto, the points a mod draws, and the scene names none in world.interact.mods.object')
  } finally {
    written(BOARD_URL, JSON.stringify(BOARD))
  }
})

test('a body in a step whose point is drawn is put on it: at the point, turned as its frame and by the step\'s turn, its scale kept, its props carried with it', async () => {
  const p = await page()
  const { cart, seat, root, gun } = stage(p)
  const grip = held(root, gun)
  interact().tick(p)
  const got = worldOf(root), want = placed(cart, seat)
  close(got.at, want.at)
  // the same turn, either sign of the quaternion
  expect(Math.abs(new THREE.Quaternion().fromArray(got.q).dot(new THREE.Quaternion().fromArray(want.q)))).toBeCloseTo(1, 9)
  close(got.s, [0.01, 0.01, 0.01], 9)
  close(held(root, gun), grip)
})

test('the point moved as the machine bobs, crouches and leans, the body goes with it in the afterTick', async () => {
  const p = await page()
  const { cart, seat, root, gun } = stage(p)
  const plugin = interact()
  plugin.tick(p)
  const grip = held(root, gun)
  cart.position.y -= 0.18
  cart.position.x += 0.03
  cart.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, -0.04, 0.07)))
  cart.updateMatrixWorld(true)
  plugin.afterTick(p)
  const got = worldOf(root), want = placed(cart, seat)
  close(got.at, want.at)
  expect(Math.abs(new THREE.Quaternion().fromArray(got.q).dot(new THREE.Quaternion().fromArray(want.q)))).toBeCloseTo(1, 9)
  close(held(root, gun), grip)
})

test('a body in a step that travels is drawn as far along its clip\'s curve as its `t`, in the frame its point hangs in, rolled and pitched with it', async () => {
  const p = await page()
  const { cart, seat, root, gun } = stage(p)
  p.wire.rows[1].data.interact = { machine: 1, kind: 'cart', name: 'out', step: 0, t: 0.75 }
  const grip = held(root, gun)
  interact().afterTick(p)
  // Half way: 0.75 m ahead and 0.3 m left of a facing 20° left of the frame's, turned 30° more.
  const facing = (20 * Math.PI) / 180
  const local = new THREE.Vector3(0.75 * Math.sin(facing) + 0.3 * Math.cos(facing), 0, 0.75 * Math.cos(facing) - 0.3 * Math.sin(facing))
  const frame = cart.getWorldQuaternion(new THREE.Quaternion())
  const at = seat.getWorldPosition(new THREE.Vector3()).add(local.applyQuaternion(frame))
  const q = frame.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing + (30 * Math.PI) / 180))
  const got = worldOf(root)
  close(got.at, at.toArray())
  expect(Math.abs(new THREE.Quaternion().fromArray(got.q).dot(q))).toBeCloseTo(1, 9)
  close(held(root, gun), grip)
})

test('a body is left where its plugin drew it: in a step whose point is not drawn, lying limp, in no interaction, and with no body mod named', async () => {
  const still = (fix: (p: any, o: ReturnType<typeof stage>) => void, step = 1) => async () => {
    const p = await page()
    const o = stage(p, step)
    fix(p, o)
    const before = o.root.matrixWorld.toArray(), gun = o.gun.matrixWorld.toArray()
    interact().tick(p)
    interact().afterTick(p)
    expect(o.root.matrixWorld.toArray()).toEqual(before)
    expect(o.gun.matrixWorld.toArray()).toEqual(gun)
  }
  await still(() => {}, 0)()
  await still(p => { p.rack.bodies[2].limp = true })()
  await still(p => { p.wire.rows[1].data.interact = null })()
  await still(p => { p.wire.scene.world = { ...p.wire.scene.world, interact: { ...p.wire.scene.world.interact, mods: { point: 'rack', object: 'rack' } } } })()
})

test('a body whose model is not built yet, the body mod handing none, is waited for', async () => {
  const p = await page()
  stage(p)
  delete p.rack.bodies[2]
  expect(() => { interact().tick(p); interact().afterTick(p) }).not.toThrow()
})
