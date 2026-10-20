// ik3d on anim and render3d with no canvas, with a body the test builds and exports as a GLB (a
// Mixamo-named skeleton under a Z-up armature scaled to centimetres) and a gun the test builds, three
// empties inside it: `stock`, `grip` and `support`. anim hangs the gun in the right hand; ik3d sets it
// against the right shoulder by its stock and bends both arms onto its grip and its support. The
// scene names anim's `body` mod in `world.ik3d.mods`, which `load` has loaded once, booting a child
// that names it, as a game's page has it loaded before its first frame. Both hands on their empties
// in the tick and in the afterTick, the gun's stock at its anchor, a frame repeated with no drift, the
// clip's own writes kept, the yaw, a target out of reach, a limp body let go of, every skeleton copy,
// and what throws.
//   Limbs another plugin hands: a seat the test builds, two empties in it, `gripL` and `gripR`, which a
// game's own `rack` plugin's `limbs` mod (`plugins/rack/rack.ik3d.ts` in the test's game folder, named
// in `world.shipped.plugins`) hands as the hands' targets when the page's `handed` says so. The hands
// on the grips and following the seat on a row whose kind ik3d does not list, the handed limbs after
// the kind's own, the body let go of when none are handed, and the order the mod's plugin is listed in.
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { anim } from '#plugins/anim/anim.plugin.ts'
import type { Measure, Rig } from '#plugins/anim/anim.sim.ts'
import { ik3d, type Handed, type Kind } from './ik3d.plugin.ts'

afterEach(() => { vi.restoreAllMocks() })

// ---------------------------------------------------------------- the body and the gun

class Reader {
  result: ArrayBuffer | undefined
  onloadend = () => {}
  readAsArrayBuffer(b: Blob) { void b.arrayBuffer().then(r => { this.result = r; this.onloadend() }) }
}
async function glbOf(scene: THREE.Object3D, animations: THREE.AnimationClip[]) {
  vi.stubGlobal('FileReader', Reader)
  try {
    const bytes = await new GLTFExporter().parseAsync(scene, { binary: true, animations }) as ArrayBuffer
    return await new GLTFLoader().parseAsync(bytes, '')
  } finally {
    vi.unstubAllGlobals()
  }
}

const X = new THREE.Vector3(1, 0, 0)
const Z = new THREE.Vector3(0, 0, 1)
const q = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle)
const HIPS_REST = q(X, -Math.PI / 2) // under the hips +y is up, +x the body's left and +z its front
const HIPS_AT = new THREE.Vector3(0, 0, -95)
const SKELETON: [string, string | null, number[]][] = [
  ['Hips', null, HIPS_AT.toArray()],
  ['Spine', 'Hips', [0, 10, 0]], ['Spine1', 'Spine', [0, 12, 0]], ['Spine2', 'Spine1', [0, 14, 0]],
  ['Neck', 'Spine2', [0, 18, 0]], ['Head', 'Neck', [0, 10, 0]],
  ['LeftShoulder', 'Spine2', [6, 12, 0]], ['LeftArm', 'LeftShoulder', [12, 0, 0]], ['LeftForeArm', 'LeftArm', [28, 0, 0]], ['LeftHand', 'LeftForeArm', [26, 0, 0]],
  ['RightShoulder', 'Spine2', [-6, 12, 0]], ['RightArm', 'RightShoulder', [-12, 0, 0]], ['RightForeArm', 'RightArm', [-28, 0, 0]], ['RightHand', 'RightForeArm', [-26, 0, 0]],
  ['LeftUpLeg', 'Hips', [9, -6, 0]], ['LeftLeg', 'LeftUpLeg', [0, -42, 0]], ['LeftFoot', 'LeftLeg', [0, -40, 0]],
  ['RightUpLeg', 'Hips', [-9, -6, 0]], ['RightLeg', 'RightUpLeg', [0, -42, 0]], ['RightFoot', 'RightLeg', [0, -40, 0]],
]

// `copies` meshes, each binding a skeleton copy of its own.
function body(copies: number) {
  const root = new THREE.Group()
  root.name = 'model'
  const rig = new THREE.Object3D()
  rig.name = 'rig'
  rig.quaternion.copy(q(X, Math.PI / 2))
  rig.scale.setScalar(0.01)
  root.add(rig)
  for (let c = 0; c < copies; c++) {
    const made = new Map<string, THREE.Bone>()
    for (const [bone, parent, at] of SKELETON) {
      const b = new THREE.Bone()
      b.name = `mixamorig${bone}`
      b.position.fromArray(at)
      if (bone === 'Hips') b.quaternion.copy(HIPS_REST)
      if (parent) made.get(parent)!.add(b)
      else rig.add(b)
      made.set(bone, b)
    }
    const g = new THREE.BoxGeometry(30, 150, 20)
    const n = g.getAttribute('position').count
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : 1)), 4))
    const skinned = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ name: `skin${c}` }))
    skinned.name = `skin${c}`
    rig.add(skinned)
    skinned.bind(new THREE.Skeleton([...made.values()]))
  }
  return root
}

const FRAME = 1 / 30
type Keys = Record<string, THREE.Vector3 | THREE.Quaternion>
function clip(name: string, keys: Keys): THREE.AnimationClip {
  const times = Array.from({ length: 31 }, (_, i) => i * FRAME)
  return new THREE.AnimationClip(name, -1, Object.entries(keys).map(([track, v]) => {
    const values = times.flatMap(() => v.toArray() as number[])
    return track.endsWith('quaternion') ? new THREE.QuaternionKeyframeTrack(track, times, values) : new THREE.VectorKeyframeTrack(track, times, values)
  }))
}
const base = (over: Keys = {}): Keys => ({ 'mixamorigHips.position': HIPS_AT.clone(), 'mixamorigHips.quaternion': HIPS_REST.clone(), ...over })
// `stand` is the T-pose. `bent` has both forearms folded 40° and the arms keyed, so the clip writes them.
const CLIPS = [
  clip('stand', base()),
  clip('bent', base({ 'mixamorigLeftForeArm.quaternion': q(Z, 0.7), 'mixamorigRightForeArm.quaternion': q(Z, -0.7) })),
]
const measure = (): Measure => ({ dur: 1, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [1, 0, 0, 0]] })
const RIG: Rig = { clips: { stand: { loop: true }, bent: { loop: true } }, roles: { still: 'idle' }, stances: { a: { idle: 'stand' } }, table: { stand: measure(), bent: measure() } }

// The gun, modelled pointing along −z with its stock at the back: the stock 12 cm behind the grip,
// the support 12 cm ahead of it. The stock's frame is the gun's own; the grip and the support are
// turned so a hand on either lies along the gun.
function gun() {
  const root = new THREE.Group()
  root.name = 'gun'
  const at = (name: string, p: number[], turned: boolean) => {
    const e = new THREE.Object3D()
    e.name = name
    e.position.fromArray(p)
    if (turned) e.quaternion.copy(q(new THREE.Vector3(0, 1, 0), Math.PI / 2))
    root.add(e)
  }
  at('stock', [0, 0.05, 0.12], false)
  at('grip', [0, 0, 0], true)
  at('support', [0, 0.04, -0.12], true)
  return root
}

let one: Awaited<ReturnType<typeof glbOf>>
let two: Awaited<ReturnType<typeof glbOf>>
beforeAll(async () => {
  one = await glbOf(body(1), CLIPS)
  two = await glbOf(body(2), CLIPS)
})

// ---------------------------------------------------------------- the mod

const dir = mkdtempSync(join(tmpdir(), 'ik3d-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
beforeAll(async () => {
  const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
  mkdirSync(join(dir, 'plugins/rack'), { recursive: true })
  writeFileSync(join(dir, 'plugins/rack/rack.ik3d.ts'), 'export const limbs = (plugins: any, row: any) => plugins.handed?.(row)\n')
  writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify({
    world: { ik3d: { mods: { body: 'anim', limbs: 'rack' } }, shipped: { plugins: ['rack'] } },
    prefabs: { engine: { dt: DT }, scenemanager: { out: {} } },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
  }))
  writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager }
export const scene = file
`)
  const top: Scene = {
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
    seats: 1,
  }
  await load(boot(top, { scenemanager }), pathToFileURL(dir + '/').href)
})

// ---------------------------------------------------------------- the page

const DT = 1 / 60
const PLUGINS = ['loader', 'anim', 'ik3d', 'render3d']
const HANDED = ['loader', 'anim', 'shipped', 'ik3d', 'render3d']
const LIMBS: Kind['limbs'] = [
  { bones: ['RightArm', 'RightForeArm', 'RightHand'], prop: 'gun', target: 'grip', pole: [-1, -1, 0] },
  { bones: ['LeftArm', 'LeftForeArm', 'LeftHand'], prop: 'gun', target: 'support', pole: [1, -1, 0] },
]
// The stock 12 cm in front of the right shoulder bone and 4 cm under it, the gun pointing along the
// body's front: the shoulder bone's frame read off the body, and the turn that takes the gun's −z to
// the body's +z in it.
function anchorOf(shoulder: THREE.Object3D, yaw: number) {
  shoulder.updateWorldMatrix(true, false)
  const turn = new THREE.Quaternion()
  shoulder.matrixWorld.decompose(new THREE.Vector3(), turn, new THREE.Vector3())
  const facing = q(new THREE.Vector3(0, 1, 0), yaw)
  const offset = new THREE.Vector3(0, -0.04, 0.12).applyQuaternion(facing).applyQuaternion(turn.clone().invert())
  const gunTurn = turn.clone().invert().multiply(facing).multiply(q(new THREE.Vector3(0, 1, 0), Math.PI))
  const e = new THREE.Euler().setFromQuaternion(gunTurn, 'XYZ')
  return { prop: 'gun', bone: 'RightShoulder', at: offset.toArray(), turn: [e.x, e.y, e.z].map(v => v / (Math.PI / 180)), point: 'stock' }
}

let files = 0
function page(o: { model?: typeof one; yaw?: number; plugins?: string[]; mods?: Record<string, string>; ik?: (shoulder: THREE.Object3D) => Kind | Record<string, unknown>; clip?: string; gun?: { landed: boolean }; handed?: () => Handed[] | undefined } = {}) {
  const url = `test/ik3d-plugin/${++files}.json`
  written(url, JSON.stringify(RIG))
  const reads = { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' }
  const kinds = { dummy: { rig: 'rig', model: 'figure', fade: 0.2, reads, props: [{ model: 'gun', bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }] } }
  const yaw = o.yaw ?? 0.4
  // A page handed limbs lists the game's own `rack` among the shipped plugins, ahead of ik3d, and finds
  // its mod in the test's game folder.
  const rack = o.handed ? { shipped: { plugins: ['rack'] }, scenemanager: { home: pathToFileURL(dir + '/').href } } : {}
  const scene = {
    plugins: o.plugins ?? (o.handed ? HANDED : PLUGINS),
    world: {
      anim: { still: 0.05, shift: 0.75, leap: 0.5, landFall: 7.5, moves: 0.05, turns: 30, kinds },
      loader: { assets: { rig: { type: 'json', url, preload: true }, figure: { type: 'model', url: 'figure.glb' }, gun: { type: 'model', url: 'gun.glb' } } },
      ik3d: { mods: o.mods ?? (o.handed ? { body: 'anim', limbs: 'rack' } : { body: 'anim' }), kinds: {} as Record<string, unknown> },
      ...rack,
    },
    prefabs: { engine: { dt: DT }, loader: {} },
  } as unknown as Scene
  const rows: Row[] = [{ id: 3, kind: 'dummy', data: { pos: [1, 0, -2], yaw, clip: o.clip ?? 'stand', clipT: 0 } }]
  const plugins: any = {
    wire: { n: 1, rows, scene },
    render3d: render3d(),
    handed: () => o.handed?.(),
    loader: {
      ready: (name: string) => name !== 'gun' || (o.gun?.landed ?? true),
      load: () => Promise.resolve(),
      model: (name: string) => (name === 'gun' ? { scene: gun(), animations: [] } : { scene: SkeletonUtils.clone((o.model ?? one).scene), animations: (o.model ?? one).animations }),
    },
  }
  const model = anim()
  const me = ik3d()
  plugins.anim = model
  plugins.ik3d = me
  // A first frame of anim alone, so the body is there to read the anchor off.
  model.tick(plugins)
  const shoulder = model.model(3)!.getObjectByName('mixamorigRightShoulder')!
  ;(scene.world as any).ik3d.kinds.dummy = o.ik ? o.ik(shoulder) : { anchor: anchorOf(shoulder, yaw), limbs: LIMBS }
  const tick = () => { model.tick(plugins); me.tick(plugins) }
  const after = () => { model.afterTick(); me.afterTick(plugins) }
  const gunOf = () => model.props(3)[0]
  return {
    me, model, plugins, rows, tick, after, gunOf,
    frame() { tick(); after() },
    bone: (name: string) => model.model(3)!.getObjectByName(`mixamorig${name}`)!,
    point: (name: string) => gunOf().getObjectByName(name)!,
  }
}
const world = (o: THREE.Object3D) => { o.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld) }
const turnOf = (o: THREE.Object3D) => { o.updateWorldMatrix(true, false); const t = new THREE.Quaternion(); o.matrixWorld.decompose(new THREE.Vector3(), t, new THREE.Vector3()); return t }

// ---------------------------------------------------------------- tests

test('both hands stand on their empties, turned to them, after the tick and again after the afterTick', () => {
  const p = page()
  p.tick()
  expect(world(p.bone('RightHand')).distanceTo(world(p.point('grip')))).toBeLessThan(1e-5)
  expect(world(p.bone('LeftHand')).distanceTo(world(p.point('support')))).toBeLessThan(1e-5)
  p.after()
  for (const [hand, at] of [['RightHand', 'grip'], ['LeftHand', 'support']]) {
    expect(world(p.bone(hand)).distanceTo(world(p.point(at)))).toBeLessThan(1e-5)
    expect(turnOf(p.bone(hand)).angleTo(turnOf(p.point(at)))).toBeLessThan(1e-5)
  }
  expect(p.me.short(3)).toEqual([expect.closeTo(0, 6), expect.closeTo(0, 6)])
})

test('the gun is set by its stock at the shoulder\'s frame, moved by at and turned by turn, and points along the body\'s front', () => {
  for (const yaw of [0, 0.4, 2.5]) {
    const p = page({ yaw })
    p.frame()
    const shoulder = world(p.bone('RightShoulder'))
    const facing = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    const spot = shoulder.clone().add(new THREE.Vector3(0, -0.04, 0.12).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw))
    expect(world(p.point('stock')).distanceTo(spot)).toBeLessThan(1e-5)
    // The gun's own −z, its barrel's way, along the body's front.
    const along = new THREE.Vector3(0, 0, -1).applyQuaternion(turnOf(p.gunOf()))
    expect(along.angleTo(facing)).toBeLessThan(1e-5)
  }
})

test('frame after frame on a clip that stands still, every bone lands the same: a solve never builds on the last', () => {
  const p = page()
  p.frame()
  const first = ['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand'].map(b => p.bone(b).quaternion.clone())
  for (let i = 0; i < 20; i++) { p.plugins.wire.n++; p.frame() }
  ;['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand'].forEach((b, i) => expect(p.bone(b).quaternion.angleTo(first[i])).toBeLessThan(1e-6))
})

test('a solve is put back before the next, so a body the solve no longer bends stands as its clip draws it', () => {
  const p = page()
  const bare = page({ ik: () => ({}) })
  bare.frame()
  const clipPose = bare.bone('LeftForeArm').quaternion.clone()
  p.frame()
  expect(p.bone('LeftForeArm').quaternion.angleTo(clipPose)).toBeGreaterThan(0.1)
  ;(p.plugins.wire.scene.world as any).ik3d.kinds.dummy = {}
  p.frame()
  expect(p.bone('LeftForeArm').quaternion.angleTo(clipPose)).toBeLessThan(1e-6)
})

test('a kind taken out of world.ik3d.kinds is let go of: its bones put back, it stands as its clip draws it', () => {
  const p = page()
  const bare = page({ ik: () => ({}) })
  bare.frame()
  const clipPose = ['RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'].map(b => bare.bone(b).quaternion.clone())
  p.frame()
  delete (p.plugins.wire.scene.world as any).ik3d.kinds.dummy
  p.frame()
  ;['RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'].forEach((b, i) => expect(p.bone(b).quaternion.angleTo(clipPose[i])).toBeLessThan(1e-6))
  expect(p.me.short(3)).toBeUndefined()
})

test('a clip that writes the arms is kept as it wrote them under the solve, and the hands still land', () => {
  const p = page({ clip: 'bent' })
  p.frame()
  p.rows[0].data.clipT = 0.5
  p.frame()
  expect(world(p.bone('LeftHand')).distanceTo(world(p.point('support')))).toBeLessThan(1e-5)
  expect(world(p.bone('RightHand')).distanceTo(world(p.point('grip')))).toBeLessThan(1e-5)
})

test('a target out of reach leaves the arm straight toward it, and short says how far it fell', () => {
  const p = page({
    ik: shoulder => {
      const a = anchorOf(shoulder, 0.4)
      return { anchor: { ...a, at: [a.at[0], a.at[1] + 0.9, a.at[2]] }, limbs: LIMBS }
    },
  })
  p.frame()
  const [right] = p.me.short(3) as number[]
  expect(right).toBeGreaterThan(0.1)
  expect(world(p.bone('RightHand')).distanceTo(world(p.point('grip')))).toBeCloseTo(right, 6)
})

test('a prop still loading is waited for: the body stands as its clip draws it, and is solved the frame the prop is there', () => {
  const gun = { landed: false }
  const p = page({ gun })
  const bare = page({ ik: () => ({}) })
  bare.frame()
  expect(() => p.frame()).not.toThrow()
  expect(p.me.short(3)).toBeUndefined()
  expect(p.bone('LeftForeArm').quaternion.angleTo(bare.bone('LeftForeArm').quaternion)).toBeLessThan(1e-6)
  gun.landed = true
  p.frame()
  expect(world(p.bone('LeftHand')).distanceTo(world(p.point('support')))).toBeLessThan(1e-5)
})

test('a limp body is let go of: not solved, and short is undefined', () => {
  const p = page()
  p.frame()
  p.rows[0].data.limp = true
  p.frame()
  expect(p.me.short(3)).toBeUndefined()
})

test('every skeleton copy takes the solved bones\' turns', () => {
  const p = page({ model: two })
  p.frame()
  const root = p.model.model(3)!
  for (const name of ['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand']) {
    const all: THREE.Object3D[] = []
    root.traverse(o => { if (o.name.replace(/_\d+$/, '') === `mixamorig${name}`) all.push(o) })
    expect(all.length).toBe(2)
    expect(all[1].quaternion.toArray()).toEqual(all[0].quaternion.toArray())
  }
})

test('what throws: no body mod, ik3d before anim, render3d before ik3d, a bone, a prop or an empty that is not there, numbers out of shape', () => {
  expect(() => page({ mods: {} }).frame()).toThrow(/names none in world.ik3d.mods.body/)
  expect(() => page({ plugins: ['loader', 'ik3d', 'anim', 'render3d'] }).frame()).toThrow(/ik3d is listed before anim/)
  expect(() => page({ plugins: ['loader', 'anim', 'render3d', 'ik3d'] }).frame()).toThrow(/ik3d must come before render3d/)
  expect(() => page({ ik: () => ({ limbs: [{ ...LIMBS![0], bones: ['RightArm', 'RightElbow', 'RightHand'] }] }) }).frame()).toThrow(/no bone ending RightElbow/)
  expect(() => page({ ik: () => ({ limbs: [{ ...LIMBS![0], prop: 'sword' }] }) }).frame()).toThrow(/holds no sword/)
  expect(() => page({ ik: () => ({ limbs: [{ ...LIMBS![0], target: 'trigger' }] }) }).frame()).toThrow(/no empty ending trigger/)
  expect(() => page({ ik: () => ({ limbs: [{ ...LIMBS![0], pole: [0, 0, 0] }] }) }).frame()).toThrow(/pole is not a direction/)
  expect(() => page({ ik: shoulder => ({ anchor: { ...anchorOf(shoulder, 0), at: [0, 0] } }) }).frame()).toThrow(/anchor.at is not three numbers/)
})

// ---------------------------------------------------------------- limbs another plugin hands

// The seat, standing where the body stands and turned as it is, its grips at chest height 30 cm in
// front of it, one each side: within the arms' 54 cm of the shoulders.
function seat(yaw = 0.4) {
  const g = new THREE.Group()
  g.name = 'seat'
  g.position.set(1, 0, -2)
  g.rotation.y = yaw
  for (const [name, x] of [['gripL', 0.25], ['gripR', -0.25]] as const) {
    const e = new THREE.Object3D()
    e.name = name
    e.position.set(x, 1.1, 0.3)
    g.add(e)
  }
  g.updateMatrixWorld(true)
  return g
}

// Both arms onto the seat's grips, as objects, the way a plugin that knows what the row is doing
// hands them.
const handedOn = (s: THREE.Object3D): Handed[] => [
  { bones: ['LeftArm', 'LeftForeArm', 'LeftHand'], pole: [1, -1, 0], target: s.getObjectByName('gripL')! },
  { bones: ['RightArm', 'RightForeArm', 'RightHand'], pole: [-1, -1, 0], target: s.getObjectByName('gripR')! },
]

test('limbs the limbs mod hands are bent onto their objects, on a row whose kind ik3d does not list, and follow them', () => {
  const s = seat()
  const p = page({ handed: () => handedOn(s), ik: () => ({}) })
  delete (p.plugins.wire.scene.world.ik3d.kinds as Record<string, unknown>).dummy
  p.frame()
  for (const [hand, at] of [['LeftHand', 'gripL'], ['RightHand', 'gripR']]) {
    expect(world(p.bone(hand)).distanceTo(world(s.getObjectByName(at)!))).toBeLessThan(1e-5)
    expect(turnOf(p.bone(hand)).angleTo(turnOf(s.getObjectByName(at)!))).toBeLessThan(1e-5)
  }
  expect(p.me.short(3)).toEqual([expect.closeTo(0, 6), expect.closeTo(0, 6)])
  s.position.x += 0.05
  s.updateMatrixWorld(true)
  p.frame()
  expect(world(p.bone('LeftHand')).distanceTo(world(s.getObjectByName('gripL')!))).toBeLessThan(1e-5)
})

test('handed limbs are bent after the kind\'s own and counted after them; handed none, the body is let go of and stands as its clip draws it', () => {
  const s = seat()
  let hand: Handed[] | undefined = [handedOn(s)[0]]
  const p = page({ handed: () => hand, ik: () => ({ limbs: [LIMBS![0]] }) })
  const bare = page({ ik: () => ({}) })
  bare.frame()
  p.frame()
  expect(p.me.short(3)).toEqual([expect.closeTo(0, 6), expect.closeTo(0, 6)])
  expect(world(p.bone('RightHand')).distanceTo(world(p.point('grip')))).toBeLessThan(1e-5)
  expect(world(p.bone('LeftHand')).distanceTo(world(s.getObjectByName('gripL')!))).toBeLessThan(1e-5)
  hand = undefined
  delete (p.plugins.wire.scene.world.ik3d.kinds as Record<string, unknown>).dummy
  p.frame()
  expect(p.me.short(3)).toBeUndefined()
  expect(p.bone('LeftForeArm').quaternion.angleTo(bare.bone('LeftForeArm').quaternion)).toBeLessThan(1e-6)
})

test('the plugin whose limbs mod is named is listed before ik3d, or the frame throws', () => {
  const s = seat()
  expect(() => page({ handed: () => handedOn(s), ik: () => ({}), plugins: ['loader', 'anim', 'ik3d', 'shipped', 'render3d'] }).frame()).toThrow(/ik3d is listed before rack/)
})
