// motion3d's browser half on a scene the test writes into a game folder of its own and boots through the
// scenemanager's `load`, so its mods are loaded as a game's are: the game's own `rack` hands motion3d the
// spaces as the page draws them, out of `plugins.rack`, which each test fills. A rider's body is drawn by
// motion3d from a stand-in model the page's loader hands it (a root at a hundredth of its size, a hand
// bone, and its one clip), a stick hung on its hand. The rider is held to the point `Seat` of a cart's
// space (its row's `space` and `root`): drawn where it stands in that space's frame, in the frame the
// space is drawn in, its prop with it.
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
import { motion3d } from './motion3d.plugin.ts'

const DT = 1 / 60
const RIG = { clips: { sit: { loop: true } }, roles: {}, table: { sit: { dur: 1, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [1, 0, 0, 0]] } } }
// The rider's carry: the stick's `butt` set at the shoulder, the hand reaching its `grip`, while `sit`
// plays. The arm's pole points down.
const CARRY = { prop: 'stick', anchor: { bone: 'Shoulder', at: [0, 0, 0.1], turn: [0, 0, 0], point: 'butt' }, limbs: [{ bones: ['Arm', 'ForeArm', 'Hand'], target: 'grip', pole: [0, -1, 0] }] }
const MOTION = {
  rig: 'rig.json', moves: 0.05, turns: 30, carries: { stick: CARRY },
  activities: { ride: { motions: { sit: { target: 'point', clips: ['sit'] }, hold: { target: 'point', clips: ['sit'], carry: 'stick' } } } },
}
const BAKED = { held: { sit: { on: 'both' } }, offsets: {} }
written('/motion3d-plugin-test/rig.json', JSON.stringify(RIG))
written('/motion3d-plugin-test/motion.json', JSON.stringify(MOTION))
written('/motion3d-plugin-test/baked.json', JSON.stringify(BAKED))
const json = (url: string) => ({ type: 'json', url, preload: true })
const yard: Scene = {
  world: {
    loader: { assets: { rig: json('/motion3d-plugin-test/rig.json'), motion: json('/motion3d-plugin-test/motion.json'), baked: json('/motion3d-plugin-test/baked.json') } },
    motion3d: {
      kinds: {
        rider: {
          motion: 'motion', baked: 'baked', rig: 'rig', model: 'figure', fade: 0.2,
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
  const sit = new THREE.AnimationClip('sit', -1, [new THREE.VectorKeyframeTrack('Hand.position', [0, 1], [0, -25, 0, 0, -25, 0])])
  const stick = new THREE.Group()
  const butt = new THREE.Object3D()
  butt.name = 'butt'
  const grip = new THREE.Object3D()
  grip.name = 'grip'
  grip.position.set(0, 0, 0.3)
  stick.add(butt, grip)
  return { root, stick, animations: [sit] }
}

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
