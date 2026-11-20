// motion3d's browser half on a scene the test writes into a game folder of its own and boots through the
// scenemanager's `load`, so its mods are loaded as a game's are: the game's own `rack` hands motion3d the
// spaces as the page draws them, out of `plugins.rack`, which each test fills. A rider's body is drawn by
// motion3d from a stand-in model the page's loader hands it (a root at a hundredth of its size, a hand
// bone, and its one clip), a stick hung on its hand. The rider is held to the point `Seat` of a cart's
// space (its row's `space` and `root`): drawn where it stands in that space's frame, in the frame the
// space is drawn in, its prop with it.
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { motion3d } from './motion3d.plugin.ts'

const DT = 1 / 60
const still = (dur: number) => ({ dur, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [dur, 0, 0, 0]] })
const RIG = { clips: { sit: { loop: true }, twitch: { loop: true } }, roles: {}, table: { sit: still(1), twitch: still(1) } }
// The rider's carry: the stick's `butt` set at the shoulder, the hand reaching its `grip`, while `sit`
// plays. The arm's pole points down.
const CARRY = { prop: 'stick', anchor: { bone: 'Shoulder', at: [0, 0, 0.1], turn: [0, 0, 0], point: 'butt' }, limbs: [{ bones: ['Arm', 'ForeArm', 'Hand'], target: 'grip', pole: [0, -1, 0] }] }
const MOTION = {
  rig: 'rig.json', moves: 0.05, turns: 30, carries: { stick: CARRY },
  activities: { ride: { motions: { sit: { target: 'point', clips: ['sit'] }, hold: { target: 'point', clips: ['sit'], carry: 'stick' } } } },
}
const BAKED = { held: { sit: { on: 'both' }, twitch: { on: 'both' } }, offsets: {} }
written('/motion3d-plugin-test/rig.json', JSON.stringify(RIG))
written('/motion3d-plugin-test/motion.json', JSON.stringify(MOTION))
written('/motion3d-plugin-test/baked.json', JSON.stringify(BAKED))
const json = (url: string) => ({ type: 'json', url, preload: true })
const yard: Scene = {
  world: {
    loader: {
      assets: {
        rig: json('/motion3d-plugin-test/rig.json'),
        motion: json('/motion3d-plugin-test/motion.json'),
        baked: json('/motion3d-plugin-test/baked.json'),
        figureglb: { type: 'binary', url: '/motion3d-plugin-test/figure.glb', preload: true },
      },
    },
    motion3d: {
      kinds: {
        rider: {
          motion: 'motion', baked: 'baked', rig: 'rig', model: 'figure', glb: 'figureglb', fade: 0.2, blend: 'cross',
          reads: { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' },
          props: [{ model: 'stick', bone: 'Hand', at: [0, 0, 0], turn: [0, 0, 0] }],
        },
      },
      anywhere: { shape: { box: { size: [1e9, 1e9, 1e9] } }, activities: ['ride'], priority: 0, data: { motion3d: { autoChange: true } } },
      mods: { object: 'rack' },
    },
    shipped: { plugins: ['rack'] },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
}
const top: Scene = {
  world: {}, plugins: ['scenemanager'], seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}
const dir = mkdtempSync(join(tmpdir(), 'motion3d-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
mkdirSync(join(dir, 'plugins/rack'), { recursive: true })
writeFileSync(join(dir, 'plugins/rack/rack.plugin.ts'), 'export const rack = () => ({})\n')
writeFileSync(join(dir, 'plugins/rack/rack.motion3d.ts'), 'export const object = (plugins, space) => plugins.rack?.drawn?.[space]\n')
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager }
export const scene = file
`)

// The stand-in rider: a root at a hundredth of its size, an arm under it (its shoulder 1.4 m up and 0.2 m
// left, the arm 0.1 m further, the forearm and the hand each 0.25 m below the bone before), and the clip
// `sit` keying the hand still for a second; and the stick, its `butt` at its root and its `grip` 0.3 m
// along it.
function figure() {
  const root = new THREE.Group()
  root.scale.setScalar(0.01)
  const bone = (name: string, at: number[], parent: THREE.Object3D) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.fromArray(at)
    parent.add(b)
    return b
  }
  const shoulder = bone('Shoulder', [20, 140, 0], root)
  const arm = bone('Arm', [10, 0, 0], shoulder)
  const fore = bone('ForeArm', [0, -25, 0], arm)
  bone('Hand', [0, -25, 0], fore)
  const sit = new THREE.AnimationClip('sit', -1, [
    new THREE.VectorKeyframeTrack('Hand.position', [0, 1], [0, -25, 0, 0, -25, 0]),
    new THREE.QuaternionKeyframeTrack('Arm.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])
  // The twitch turns the arm about z from 0.3 to 1.1 over its second.
  const zq = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a).toArray()
  const twitch = new THREE.AnimationClip('twitch', -1, [new THREE.QuaternionKeyframeTrack('Arm.quaternion', [0, 1], [...zq(0.3), ...zq(1.1)])])
  const stick = new THREE.Group()
  const butt = new THREE.Object3D()
  butt.name = 'butt'
  const grip = new THREE.Object3D()
  grip.name = 'grip'
  grip.position.set(0, 0, 0.3)
  stick.add(butt, grip)
  return { root, stick, animations: [sit, twitch] }
}

// The stand-in rider as the server poses it: its model and clips written as a glb, the kind's `glb`, which
// motion3d reads the skeleton and the clips' tracks from (`motion3d.play.ts`'s `skeletonOf`). Three's
// exporter reads its blobs back with a FileReader, which node does not have.
class Reader {
  result: ArrayBuffer | undefined
  onloadend = () => {}
  readAsArrayBuffer(b: Blob) { void b.arrayBuffer().then(r => { this.result = r; this.onloadend() }) }
}
beforeAll(async () => {
  const f = figure()
  // A box skinned to its bones, so the glb carries the skin the server reads the skeleton from.
  const bones: THREE.Bone[] = []
  f.root.traverse(o => { if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone) })
  const g = new THREE.BoxGeometry(10, 150, 10)
  const n = g.getAttribute('position').count
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : 1)), 4))
  const skinned = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial())
  f.root.add(skinned)
  skinned.bind(new THREE.Skeleton(bones))
  vi.stubGlobal('FileReader', Reader)
  try {
    written('/motion3d-plugin-test/figure.glb', new Uint8Array(await new GLTFExporter().parseAsync(f.root, { binary: true, animations: f.animations }) as ArrayBuffer))
  } finally {
    vi.unstubAllGlobals()
  }
})

// A page's plugins on the booted yard, its scene listing `plugins`, render3d's three and scene handed it,
// and a loader that hands the stand-ins.
async function page(plugins = ['scenemanager', 'shipped', 'motion3d', 'render3d']) {
  const t = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  const f = figure()
  const models: Record<string, unknown> = { figure: { scene: f.root, animations: f.animations }, stick: { scene: f.stick, animations: [] } }
  const p = {
    wire: { n: 1, rows: [] as any[], scene: { ...t.scene, plugins } },
    render3d: { THREE, scene: new THREE.Scene(), dress: () => {} },
    loader: { ready: () => true, load: async () => {}, model: (name: string) => models[name] },
    rack: { drawn: {} as Record<number, THREE.Object3D> },
  } as any
  return { p, root: f.root, prop: f.stick }
}

// A cart, row 1, standing at (4, 0, −3) facing 0.6, drawn bobbing and leaning off where it stands; a
// rider, row 2, sitting on its seat 0.4 m left of its middle and 0.2 m ahead, facing as it does.
function stage(p: any) {
  const cart = { pos: [4, 0, -3], yaw: 0.6 }
  const seat = [4 + 0.2 * Math.sin(0.6) + 0.4 * Math.cos(0.6), 0.5, -3 + 0.2 * Math.cos(0.6) - 0.4 * Math.sin(0.6)]
  const drawn = new THREE.Object3D()
  drawn.position.set(4.05, 0.12, -2.97)
  drawn.quaternion.setFromEuler(new THREE.Euler(0.06, 0.62, -0.04, 'YXZ'))
  drawn.updateMatrixWorld(true)
  p.rack.drawn[1] = drawn
  p.wire.rows = [
    { id: 1, kind: 'cart', data: cart },
    { id: 2, kind: 'rider', data: { pos: seat, yaw: 0.6, activity: 'ride', motion: 'sit', space: 1, root: 'Seat', state: 'act', clip: 'sit', clipT: 0.5, rate: 1, blend: 1, from: null, fromT: 0 } },
  ]
  return { drawn }
}

const close = (a: number[], b: number[], digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits))
// A prop's world matrix in the root's frame: what moving the body with its props keeps.
const held = (root: THREE.Object3D, prop: THREE.Object3D) => new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(prop.matrixWorld).toArray()

test('a body held to a point of a space is drawn on it as the page draws the space: where it sits in its frame, turned as it is, its scale kept, its props carried with it', async () => {
  const { p, root, prop } = await page()
  const { drawn } = stage(p)
  const m = motion3d()
  m.tick(p)
  // In the cart's frame the rider sits 0.4 m left, 0.2 m ahead and 0.5 m up, facing as the cart does.
  const want = new THREE.Vector3(0.4, 0.5, 0.2).applyMatrix4(drawn.matrixWorld)
  close(root.getWorldPosition(new THREE.Vector3()).toArray(), want.toArray())
  const q = root.getWorldQuaternion(new THREE.Quaternion())
  expect(Math.abs(q.dot(drawn.getWorldQuaternion(new THREE.Quaternion())))).toBeCloseTo(1, 9)
  close(root.getWorldScale(new THREE.Vector3()).toArray(), [0.01, 0.01, 0.01], 9)
  // The stick hangs on the hand, a hundredth of the hand's 0.3 m left and 1.2 m up, its scale taken off.
  const hand = root.getObjectByName('Hand')!
  close(prop.getWorldPosition(new THREE.Vector3()).toArray(), hand.getWorldPosition(new THREE.Vector3()).toArray())
  const grip = held(root, prop)

  // Drawn on again in the afterTick as the cart bobs on, the stick with it.
  drawn.position.y += 0.1
  drawn.updateMatrixWorld(true)
  m.afterTick(p)
  close(root.getWorldPosition(new THREE.Vector3()).toArray(), new THREE.Vector3(0.4, 0.5, 0.2).applyMatrix4(drawn.matrixWorld).toArray())
  close(held(root, prop), grip)
})

test('an additive layer is laid on the pose the mixer leaves, by its clip\'s turn from its first frame at its weight, the same every frame', async () => {
  const { p, root } = await page()
  stage(p)
  // Halfway through the twitch at half weight: the arm turned on from where `sit` holds it by half of
  // (0.7 − 0.3) about z.
  p.wire.rows[1].data.adds = [{ name: 'ride.twitch', clip: 'twitch', t: 0.5, w: 0.5, most: 0.5, loop: true, ending: false, bone: null }]
  const m = motion3d()
  const want = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.2)
  for (let i = 0; i < 3; i++) {
    m.tick(p)
    expect(root.getObjectByName('Arm')!.quaternion.angleTo(want)).toBeLessThan(1e-5)
  }
  // Taken off: the arm as `sit` holds it.
  p.wire.rows[1].data.adds = []
  m.tick(p)
  expect(root.getObjectByName('Arm')!.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6)
})

test('a clip mixed with the body\'s is drawn at its share of the clip\'s weight, and at its share of the weight fading out once frozen with the clip it fades from', async () => {
  const { p, root } = await page()
  stage(p)
  const d = p.wire.rows[1].data
  const arm = () => root.getObjectByName('Arm')!.quaternion
  const about = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a)
  const m = motion3d()
  // A quarter twitch, halfway through it (the arm at 0.7 about z), over `sit` holding it still: the arm
  // turned a quarter of the way, 0.175.
  d.mix = [{ clip: 'twitch', t: 0.5, w: 0.25 }]
  m.tick(p)
  expect(arm().angleTo(about(0.175))).toBeLessThan(1e-5)
  // Faded out from as `sit` comes back in on its own, 0.4 of the way: the frozen mix drawn at a quarter
  // of the 0.6 still fading out, 0.15 of the whole, the arm turned 0.105.
  Object.assign(d, { from: 'sit', fromT: 0.5, fromMix: [{ clip: 'twitch', t: 0.5, w: 0.25 }], mix: [], blend: 0.4 })
  m.tick(p)
  expect(arm().angleTo(about(0.105))).toBeLessThan(1e-5)
})

test('a kind that inertializes draws, on the page, the pose the body left in as its clip changes, the clip it went to once the fade is through, and between them as it decays, the same every frame', async () => {
  const { p, root } = await page()
  stage(p)
  // The rider inertializes for this test alone: the yard's world is the one every page here reads.
  const kind = p.wire.scene.world.motion3d.kinds.rider
  kind.blend = 'inertial'
  try {
    await inertialized(p, root)
  } finally {
    kind.blend = 'cross'
  }
})

async function inertialized(p: any, root: THREE.Object3D) {
  const d = p.wire.rows[1].data
  const arm = () => root.getObjectByName('Arm')!.quaternion
  const about = (a: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a)
  const m = motion3d()
  // The sit left half way through, the twitch begun half way through (its arm at 0.7 about z).
  const change = { from: 'sit', t: 0.5, mix: [], rate: 1, to: 'twitch', t0: 0.5, mix0: [], rate0: 1 }
  Object.assign(d, { clip: 'twitch', clipT: 0.5, from: 'sit', fromT: 0.5, blend: 0, inert: [{ ...change, s: 0 }] })
  // As the clip changes: the arm as the sit left it, every frame.
  for (let i = 0; i < 2; i++) {
    m.tick(p)
    expect(arm().angleTo(new THREE.Quaternion())).toBeLessThan(1e-6)
  }
  // Half way through the fade: turned part of the way, short of the twitch.
  Object.assign(d, { blend: 0.5, inert: [{ ...change, s: 0.5 }] })
  m.tick(p)
  const half = arm().angleTo(about(0.7))
  expect(half).toBeGreaterThan(1e-3)
  expect(half).toBeLessThan(0.7)
  // Through the fade, the change let go: the twitch's arm.
  Object.assign(d, { blend: 1, inert: [] })
  m.tick(p)
  expect(arm().angleTo(about(0.7))).toBeLessThan(1e-6)
}

test('a kind\'s props are hung once while they stay the same, a fresh copy of them included, and again when a number deep in them is written in place', async () => {
  const { p, root, prop } = await page()
  stage(p)
  const scene = p.render3d.scene as THREE.Scene
  let hung = 0
  const add = scene.add.bind(scene)
  scene.add = (...o: THREE.Object3D[]) => { hung += o.filter(x => x === prop).length; return add(...o) }
  const m = motion3d()
  m.tick(p)
  m.tick(p)
  expect(hung).toBe(1)
  // One number of the stick's offset written in place, in the list it was hung by, as a dev page's panel writes a
  // scene: the stick is hung again, 0.2 m along the hand's z.
  const rider = p.wire.scene.world.motion3d.kinds.rider
  rider.props[0].at[2] = 0.2
  m.tick(p)
  expect(hung).toBe(2)
  const hand = root.getObjectByName('Hand')!
  close(new THREE.Vector3().applyMatrix4(new THREE.Matrix4().copy(hand.matrixWorld).invert().multiply(prop.matrixWorld)).toArray(), [0, 0, 20])
  m.tick(p)
  rider.props = structuredClone(rider.props)
  m.tick(p)
  expect(hung).toBe(2)
  // The scene's world is the one module every test loads; the stick goes back on the hand.
  rider.props[0].at[2] = 0
})

test('a scene that lists the mods\' plugin after motion3d throws: motion3d reads what it drew that frame', async () => {
  const { p } = await page(['scenemanager', 'motion3d', 'shipped', 'render3d'])
  stage(p)
  expect(() => motion3d().tick(p)).toThrow('motion3d is listed before rack, whose object it reads that frame')
})

test('a move that names a carry sets its prop at the shoulder by its point and bends the arm onto its grip; one that names none leaves it on the hand', async () => {
  const { p, root, prop } = await page()
  stage(p)
  p.wire.rows[1].data.motion = 'hold'
  const m = motion3d()
  m.tick(p)
  // The butt 0.1 m ahead of the shoulder in its frame, its scale taken off; the stick turned as it is.
  const shoulder = root.getObjectByName('Shoulder')!
  const sp = new THREE.Vector3(), sq = new THREE.Quaternion()
  shoulder.matrixWorld.decompose(sp, sq, new THREE.Vector3())
  const butt = prop.getObjectByName('butt')!, grip = prop.getObjectByName('grip')!
  close(butt.getWorldPosition(new THREE.Vector3()).toArray(), sp.clone().add(new THREE.Vector3(0, 0, 0.1).applyQuaternion(sq)).toArray())
  // The hand on the grip, the elbow bent toward the pole, and so again in the afterTick.
  const hand = root.getObjectByName('Hand')!
  close(hand.getWorldPosition(new THREE.Vector3()).toArray(), grip.getWorldPosition(new THREE.Vector3()).toArray(), 4)
  expect(m.short(2)![0]).toBeLessThan(1e-4)
  m.afterTick(p)
  close(hand.getWorldPosition(new THREE.Vector3()).toArray(), grip.getWorldPosition(new THREE.Vector3()).toArray(), 4)

  // Back to a move with no carry: the arm as the clip draws it, the stick on the hand.
  p.wire.rows[1].data.motion = 'sit'
  m.tick(p)
  expect(m.short(2)).toEqual([])
  const fore = root.getObjectByName('ForeArm')!
  close(hand.getWorldPosition(new THREE.Vector3()).toArray(), new THREE.Vector3(0, -25, 0).applyMatrix4(fore.matrixWorld).toArray())
  close(prop.getWorldPosition(new THREE.Vector3()).toArray(), hand.getWorldPosition(new THREE.Vector3()).toArray())
})
