// ragdoll3d on anim and render3d with no canvas, stepping rows the test writes, with a model the test
// builds and exports as a GLB: a Mixamo-named skeleton under a Z-up armature (the 15 joints and the
// spine, neck and shoulder bones between them) whose two meshes each bind a copy of their own, the
// copy the clips name standing second. Each page's scene names the five mods in
// `world.ragdoll3d.mods`: anim's model and pose, terrain3d's land, scatter3d's solids and walker's
// gravity, which `load` has loaded once, booting a child that names them, as a game's page has them
// loaded before its first frame; the terrain3d and scatter3d they read are stand-ins handing out the
// test's ground and solids. Gravity at any frame rate and per kind, the limits on every step, the
// ground, a late seat, sleep and settle, the numbers a body keeps, getting up, the blow, solids,
// friction, writing back onto every copy, what a scene's mods leave out, and what throws.
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
import { ragdoll3d, type Numbers, type Role, type Solid } from './ragdoll3d.plugin.ts'

afterEach(() => { vi.restoreAllMocks() })

// ---------------------------------------------------------------- the model

// Three's exporter reads its blobs back with a FileReader, which node does not have.
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
const q = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle)
const DEG = Math.PI / 180
const HIPS_REST = q(X, -Math.PI / 2) // takes back the armature's quarter turn, so under the hips +y is up, +x the body's left and +z its front
const HIPS_AT = new THREE.Vector3(0, 0, -95)
// Each bone's parent and place under it, in centimetres: a T-pose 1.59 m tall.
const SKELETON: [string, string | null, number[]][] = [
  ['Hips', null, HIPS_AT.toArray()],
  ['Spine', 'Hips', [0, 10, 0]], ['Spine1', 'Spine', [0, 12, 0]], ['Spine2', 'Spine1', [0, 14, 0]],
  ['Neck', 'Spine2', [0, 18, 0]], ['Head', 'Neck', [0, 10, 0]],
  ['LeftShoulder', 'Spine2', [6, 12, 0]], ['LeftArm', 'LeftShoulder', [12, 0, 0]], ['LeftForeArm', 'LeftArm', [28, 0, 0]], ['LeftHand', 'LeftForeArm', [26, 0, 0]],
  ['RightShoulder', 'Spine2', [-6, 12, 0]], ['RightArm', 'RightShoulder', [-12, 0, 0]], ['RightForeArm', 'RightArm', [-28, 0, 0]], ['RightHand', 'RightForeArm', [-26, 0, 0]],
  ['LeftUpLeg', 'Hips', [9, -6, 0]], ['LeftLeg', 'LeftUpLeg', [0, -42, 0]], ['LeftFoot', 'LeftLeg', [0, -40, 0]], ['LeftToeBase', 'LeftFoot', [0, -5, 10]],
  ['RightUpLeg', 'Hips', [-9, -6, 0]], ['RightLeg', 'RightUpLeg', [0, -42, 0]], ['RightFoot', 'RightLeg', [0, -40, 0]], ['RightToeBase', 'RightFoot', [0, -5, 10]],
]

// The armature is turned a quarter about x and scaled to centimetres, as an exported Mixamo rig is.
// Each mesh binds a skeleton copy of its own, as a Mixamo model's meshes can; `without` leaves a bone
// (and all under it) out of both.
function body(without?: string) {
  const root = new THREE.Group()
  root.name = 'model'
  const rig = new THREE.Object3D()
  rig.name = 'rig'
  rig.quaternion.copy(q(X, Math.PI / 2))
  rig.scale.setScalar(0.01)
  root.add(rig)
  for (const name of ['Armor', 'Body']) {
    const made = new Map<string, THREE.Bone>()
    for (const [bone, parent, at] of SKELETON) {
      if (bone === without || (parent !== null && !made.has(parent))) continue
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
    const skinned = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ name }))
    skinned.name = name
    rig.add(skinned)
    skinned.bind(new THREE.Skeleton([...made.values()]))
  }
  return root
}

// A clip of `dur` seconds keyed every thirtieth, holding one pose.
const FRAME = 1 / 30
type Keys = Record<string, THREE.Vector3 | THREE.Quaternion>
function clip(name: string, keys: Keys): THREE.AnimationClip {
  const times = Array.from({ length: 31 }, (_, i) => i * FRAME)
  return new THREE.AnimationClip(name, -1, Object.entries(keys).map(([track, v]) => {
    const values = times.flatMap(() => v.toArray() as number[])
    return track.endsWith('quaternion') ? new THREE.QuaternionKeyframeTrack(track, times, values) : new THREE.VectorKeyframeTrack(track, times, values)
  }))
}
const legs = (thigh: number, shin: number): Keys => ({
  'mixamorigLeftUpLeg.quaternion': q(X, thigh), 'mixamorigRightUpLeg.quaternion': q(X, thigh),
  'mixamorigLeftLeg.quaternion': q(X, shin), 'mixamorigRightLeg.quaternion': q(X, shin),
})
const base = (over: Keys = {}): Keys => ({ 'mixamorigHips.position': HIPS_AT.clone(), 'mixamorigHips.quaternion': HIPS_REST.clone(), ...legs(0, 0), ...over })
// `stand` is the T-pose; `kneel` has each thigh straight out in front and each shin folded back to
// 20° from it, tighter than the knees' least, and the chest bowed at Spine1, a bone no limb turn
// writes.
// `dive` stands on its head. `ready` stands with elbows and knees a little bent, inside every limit.
// `lie` and `lieUp` lie on the back, the body's length along +z rising at a grade of 0 and ½, with
// elbows and knees bent within the body's own plane, so the 15 joints lie in one plane.
const Z = new THREE.Vector3(0, 0, 1)
const lying = (grade: number) => base({
  'mixamorigHips.quaternion': q(X, -Math.atan(grade)),
  'mixamorigLeftForeArm.quaternion': q(Z, 0.5), 'mixamorigRightForeArm.quaternion': q(Z, -0.5),
  'mixamorigLeftLeg.quaternion': q(Z, 0.3), 'mixamorigRightLeg.quaternion': q(Z, -0.3),
})
const CLIPS = [
  clip('stand', base()),
  clip('kneel', base({ ...legs(-Math.PI / 2, 160 * DEG), 'mixamorigSpine1.quaternion': q(X, 0.4) })),
  clip('lie', lying(0)),
  clip('lieUp', lying(0.5)),
  clip('dive', base({ 'mixamorigHips.quaternion': q(X, Math.PI).multiply(HIPS_REST) })),
  clip('ready', base({
    'mixamorigLeftForeArm.quaternion': q(Z, 0.5), 'mixamorigRightForeArm.quaternion': q(Z, -0.5),
    'mixamorigLeftLeg.quaternion': q(X, 0.3), 'mixamorigRightLeg.quaternion': q(X, 0.3),
  })),
]

// The model's two skeleton copies, the one found first renamed `_1`, so the copy the clips name
// stands second.
function renamed(scene: THREE.Object3D) {
  const tops: THREE.Object3D[] = []
  scene.traverse(o => { if ((o as THREE.Bone).isBone && !(o.parent as THREE.Bone).isBone) tops.push(o) })
  expect(tops.length).toBe(2)
  tops.forEach((top, i) => top.traverse(o => { o.name = o.name.replace(/_\d+$/, '') + (i === 0 ? '_1' : '') }))
  return scene
}

const measure = (): Measure => ({ dur: 1, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [1, 0, 0, 0]] })
const RIG: Rig = {
  clips: { stand: { loop: true }, kneel: {}, lie: {}, lieUp: {}, dive: {}, ready: {} },
  roles: { still: 'idle' },
  stances: { a: { idle: 'stand' } },
  table: { stand: measure(), kneel: measure(), lie: measure(), lieUp: measure(), dive: measure(), ready: measure() },
}

let gltf: Awaited<ReturnType<typeof glbOf>>
let lacking: Awaited<ReturnType<typeof glbOf>>
beforeAll(async () => {
  gltf = await glbOf(body(), CLIPS)
  renamed(gltf.scene)
  lacking = await glbOf(body('LeftFoot'), CLIPS)
})

// ---------------------------------------------------------------- the mods

const MODS = { model: 'anim', pose: 'anim', land: 'terrain3d', solids: 'scatter3d', gravity: 'walker' }
const without = (name: keyof typeof MODS) => Object.fromEntries(Object.entries(MODS).filter(([k]) => k !== name))

// A manager and one child, `yard`, whose `world.ragdoll3d.mods` names the five mods: `load` boots it
// as a game's would, and its `prepare` loads them.
const dir = mkdtempSync(join(tmpdir(), 'ragdoll3d-plugin-'))
afterAll(() => rmSync(dir, { recursive: true }))
beforeAll(async () => {
  const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
  writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify({
    world: { ragdoll3d: { mods: MODS } },
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
const BONES: Record<Role, string> = {
  hips: 'Hips', spine: 'Spine2', head: 'Head', armL: 'LeftArm', forearmL: 'LeftForeArm', handL: 'LeftHand', armR: 'RightArm', forearmR: 'RightForeArm',
  handR: 'RightHand', uplegL: 'LeftUpLeg', legL: 'LeftLeg', footL: 'LeftFoot', uplegR: 'RightUpLeg', legR: 'RightLeg', footR: 'RightFoot',
}
const NUMBERS: Numbers = {
  bones: BONES,
  damp: 0.985, iter: 6, sweeps: 30, radius: 0.06, vmax: 0.14, friction: 0.4, spread: 0.25,
  limits: { elbow: [35, 172], knee: [35, 172], spine: [120, 180], hip: [55, 180], shoulder: [20, 180] },
  still: 0.0005, calm: 30, settle: 8,
}
const GRAVITY = { dummy: 20, martian: 8.34 }
const PLUGINS = ['loader', 'terrain3d', 'scatter3d', 'anim', 'ragdoll3d', 'render3d']

let files = 0
function page(o: { numbers?: Partial<Numbers>; mods?: Record<string, string>; kind?: string; pos?: number[]; yaw?: number; height?: (x: number, z: number) => number; solids?: Solid[]; model?: typeof gltf; plugins?: string[]; walker?: boolean } = {}) {
  const url = `test/ragdoll3d-plugin/${++files}.json`
  written(url, JSON.stringify(RIG))
  const reads = { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' }
  const kinds = { dummy: { rig: 'rig', model: 'figure', fade: 0.2, reads }, martian: { rig: 'rig', model: 'figure', fade: 0.2, reads } }
  const numbers = { still: 0.05, shift: 0.75, leap: 0.5, landFall: 7.5, moves: 0.05, turns: 30, kinds }
  const scene = {
    plugins: o.plugins ?? PLUGINS,
    world: {
      anim: numbers,
      ...(o.walker !== false && { walker: { kinds: Object.fromEntries(Object.entries(GRAVITY).map(([k, gravity]) => [k, { gravity }])) } }),
      loader: { assets: { rig: { type: 'json', url, preload: true }, figure: { type: 'model', url: 'figure.glb' } } },
      ragdoll3d: { ...structuredClone(NUMBERS), ...o.numbers, mods: o.mods ?? MODS },
    },
    prefabs: {
      engine: { dt: DT },
      loader: {},
    },
  } as unknown as Scene
  const rows: Row[] = [
    { id: 3, kind: o.kind ?? 'dummy', data: { pos: o.pos ?? [0, 0, 0], yaw: o.yaw ?? 0.4, clip: 'stand', clipT: 0 } },
  ]
  const asked: number[][] = []
  const plugins: any = {
    wire: { n: 1, rows, scene },
    render3d: render3d(),
    loader: {
      ready: () => true,
      load: () => Promise.resolve(),
      model: () => ({ scene: SkeletonUtils.clone((o.model ?? gltf).scene), animations: (o.model ?? gltf).animations }),
    },
    terrain3d: { ground: { height: o.height ?? (() => -1000) } },
    scatter3d: { solids: (x: number, z: number, r: number) => { asked.push([x, z, r]); return o.solids ?? [] } },
  }
  const model = anim()
  const me = ragdoll3d()
  plugins.anim = model
  plugins.ragdoll3d = me
  const row = () => rows.find(r => r.id === 3)!
  const frame = () => { model.tick(plugins); me.tick(plugins) }
  return {
    me, model, plugins, rows, row, frame, asked,
    // The row dies at its current pos and yaw.
    die(blow = { dir: [1, 0], speed: 0, height: 1 }, pose = { clip: 'stand', clipT: 0 }) {
      Object.assign(row().data, { limp: true, limpFor: 0, blow, pose })
    },
    // One sim step: the counter and the row's own count.
    step() {
      plugins.wire.n++
      if (row().data.limp) row().data.limpFor++
    },
    points: () => Object.values(me.body(3)!.points),
    bone: (name: string) => model.model(3)!.getObjectByName(`mixamorig${name}`)!,
  }
}
const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
const sub = (a: number[], b: number[]) => new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const angle = (a: number[], m: number[], c: number[]) => sub(a, m).angleTo(sub(c, m)) / DEG
const centre = (ps: number[][]) => [0, 1, 2].map(i => ps.reduce((s, v) => s + v[i], 0) / ps.length)

// ---------------------------------------------------------------- tests

test('it falls at its walker gravity whatever the frame rate: two frames a step and one a step draw the same poses', () => {
  const free = { damp: 1, vmax: 100 }
  const one = page({ numbers: free }), two = page({ numbers: free })
  for (const p of [one, two]) { p.frame(); p.die() }
  one.frame(); two.frame(); two.frame()
  const start = centre(one.points())
  for (let n = 1; n <= 40; n++) {
    one.step(); two.step()
    one.frame()
    two.frame(); two.frame()
    expect(one.me.body(3)!.steps).toBe(n)
    expect(two.points()).toEqual(one.points())
    // Every pair a pass moves, it moves equally, so the centre falls by the gravity sum Σk·g·dt².
    const c = centre(one.points())
    expect(start[1] - c[1]).toBeCloseTo((20 * DT * DT * n * (n + 1)) / 2, 9)
    expect(c[0]).toBeCloseTo(start[0], 9)
  }
  const pairs: [THREE.Object3D, THREE.Object3D][] = []
  one.model.model(3)!.traverse(o => { if ((o as THREE.Bone).isBone) pairs.push([o, two.model.model(3)!.getObjectByName(o.name)!]) })
  for (const [a, b] of pairs) {
    expect(b.quaternion.toArray()).toEqual(a.quaternion.toArray())
    expect(b.position.toArray()).toEqual(a.position.toArray())
  }
})

test('a mars kind falls at 8.34, and a gravity edited in world.walker reaches the next body, not the one falling', () => {
  const free = { damp: 1, vmax: 100 }
  const mars = page({ numbers: free, kind: 'martian' })
  mars.frame(); mars.die(); mars.frame()
  const start = centre(mars.points())
  for (let n = 0; n < 30; n++) { mars.step(); mars.frame() }
  expect(start[1] - centre(mars.points())[1]).toBeCloseTo((8.34 * DT * DT * 30 * 31) / 2, 9)

  const p = page({ numbers: free })
  p.frame(); p.die(); p.frame()
  p.plugins.wire.scene.world.walker.kinds.dummy.gravity = 5
  const a = centre(p.points())
  for (let n = 0; n < 10; n++) { p.step(); p.frame() }
  expect(a[1] - centre(p.points())[1]).toBeCloseTo((20 * DT * DT * 10 * 11) / 2, 9)
  // It gets up and dies again: the new body falls at the edited gravity.
  p.row().data.limp = false
  p.frame()
  p.die()
  p.frame()
  const b = centre(p.points())
  for (let n = 0; n < 10; n++) { p.step(); p.frame() }
  expect(b[1] - centre(p.points())[1]).toBeCloseTo((5 * DT * DT * 10 * 11) / 2, 9)
})

test('damp keeps its share of each step\'s velocity: the centre falls by v ← damp·v + g·dt²', () => {
  const p = page({ numbers: { vmax: 100 } })
  p.frame(); p.die(); p.frame()
  let y = centre(p.points())[1], v = 0
  for (let n = 0; n < 40; n++) {
    p.step(); p.frame()
    v = v * 0.985 + 20 * DT * DT
    y -= v
    expect(centre(p.points())[1]).toBeCloseTo(y, 9)
  }
})

test('a body of a model anim makes again is built again, and catches up to the steps it is owed', () => {
  const p = page({ height: () => 0 })
  p.frame(); p.die({ dir: [1, 0], speed: 3, height: 1.4 }); p.frame()
  for (let n = 0; n < 10; n++) { p.step(); p.frame() }
  const first = p.model.model(3)!
  // An edit to the rig's clips makes anim build the row's model again, at its rest.
  written(p.plugins.wire.scene.world.loader.assets.rig.url, JSON.stringify({ ...RIG, clips: { ...RIG.clips, stand: { loop: true, rate: 1 } } }))
  p.frame()
  const m = p.model.model(3)!
  expect(m).not.toBe(first)
  expect(p.me.body(3)!.steps).toBe(10)
  expect(world(p.bone('Hips')).distanceTo(new THREE.Vector3(...p.me.body(3)!.points.hips))).toBeLessThan(1e-9)
})

test('a body with no world.walker, or of a kind world.walker does not name, has no gravity from walker\'s mod and throws naming the kind', () => {
  const none = page({ walker: false })
  none.frame(); none.die()
  expect(() => none.frame()).toThrow('ragdoll3d: walker gives no gravity for kind dummy, so the dummy body cannot fall')
  const p = page()
  p.frame(); p.die()
  delete p.plugins.wire.scene.world.walker.kinds.dummy
  expect(() => p.frame()).toThrow('ragdoll3d: walker gives no gravity for kind dummy, so the dummy body cannot fall')
})

// Every limit the numbers set, as the three points whose angle it bounds, and how far past its
// bounds each stands, in degrees. A most of 180° is no bound.
const LIMITED: [keyof Numbers['limits'], Role, Role, Role][] = [
  ['elbow', 'armL', 'forearmL', 'handL'], ['elbow', 'armR', 'forearmR', 'handR'],
  ['knee', 'uplegL', 'legL', 'footL'], ['knee', 'uplegR', 'legR', 'footR'],
  ['spine', 'hips', 'spine', 'head'],
  ['hip', 'spine', 'uplegL', 'legL'], ['hip', 'spine', 'uplegR', 'legR'],
  ['shoulder', 'hips', 'armL', 'forearmL'], ['shoulder', 'hips', 'armR', 'forearmR'],
]
const past = (s: Record<Role, number[]>) => LIMITED.map(([key, a, m, c]) => {
  const [lo, hi] = NUMBERS.limits[key], g = angle(s[a], s[m], s[c])
  return Math.max(lo - g, hi < 180 ? g - hi : 0, 0)
})
// The tolerance every limit is held to after every step, in degrees.
const HELD = 0.1

// A body struck and let fall until it sleeps, with every limit checked after every step: the most
// any limit stood past its bounds, and whether any point reached the ground.
function fall(o: { clip: string; pos: number[]; blow: { dir: number[]; speed: number; height: number }; height: (x: number, z: number) => number }) {
  const p = page({ height: o.height, pos: o.pos })
  p.frame(); p.die(o.blow, { clip: o.clip, clipT: 0 }); p.frame()
  let worst = 0, landed = false, under = 0
  for (let n = 0; n < 480 && !p.me.body(3)!.asleep; n++) {
    p.step(); p.frame()
    const s = p.me.body(3)!.points
    worst = Math.max(worst, ...past(s))
    for (const v of Object.values(s)) under = Math.min(under, v[1] - o.height(v[0], v[2]) - 0.06)
    landed ||= Object.values(s).some(v => v[1] - o.height(v[0], v[2]) < 0.06 + 1e-9)
  }
  return { p, worst, landed, under }
}

test('knees stay inside 35° on every step: a knee that died folded to 20° opens to it on the first step and holds it through the fall and the landing, and every other limit holds', () => {
  const p = page({ height: () => 0, pos: [0, 0.5, 0] })
  p.frame()
  p.die({ dir: [0.3, 1], speed: 6, height: 1.2 }, { clip: 'kneel', clipT: 0.5 })
  p.frame()
  const joint = (s: Record<Role, number[]>, a: string, m: string, c: string, side: string) => angle(s[`${a}${side}` as Role], s[`${m}${side}` as Role], s[`${c}${side}` as Role])
  const b = p.me.body(3)!.points
  expect(joint(b, 'upleg', 'leg', 'foot', 'L')).toBeCloseTo(20, 3)
  expect(joint(b, 'upleg', 'leg', 'foot', 'R')).toBeCloseTo(20, 3)
  let landed = false
  for (let n = 0; n < 480 && !p.me.body(3)!.asleep; n++) {
    p.step(); p.frame()
    const s = p.me.body(3)!.points
    landed ||= Object.values(s).some(v => v[1] < 0.06 + 1e-9)
    for (const side of ['L', 'R']) expect(joint(s, 'upleg', 'leg', 'foot', side)).toBeGreaterThan(35 - HELD)
    for (const v of past(s)) expect(v).toBeLessThan(HELD)
  }
  expect(landed).toBe(true)
  // The bones draw the points' bend.
  const s = p.me.body(3)!.points
  expect(angle(world(p.bone('LeftUpLeg')).toArray(), world(p.bone('LeftLeg')).toArray(), world(p.bone('LeftFoot')).toArray())).toBeCloseTo(joint(s, 'upleg', 'leg', 'foot', 'L'), 3)
})

test('a straight drop onto the feet and a head-first fall hold every limit on every step, landing included', () => {
  // Straight-legged and straight-armed, 0.6 m up, struck by nothing: it lands on its feet and folds.
  const drop = fall({ clip: 'stand', pos: [0, 0.6, 0], blow: { dir: [1, 0], speed: 0, height: 1 }, height: () => 0 })
  expect(drop.landed).toBe(true)
  expect(drop.worst).toBeLessThan(HELD)
  // A straight limb bends to its most on the first step, though straight it has no plane of its own:
  // a leg about the pelvis's x, an arm lying along x about its z.
  const stand = page({ height: () => -100 })
  stand.frame(); stand.die(); stand.frame()
  stand.step(); stand.frame()
  const s = stand.me.body(3)!.points
  expect(angle(s.uplegL, s.legL, s.footL)).toBeCloseTo(172, 6)
  expect(angle(s.armR, s.forearmR, s.handR)).toBeCloseTo(172, 6)
  const y = sub(s.spine, s.hips).normalize(), x = sub(s.uplegR, s.uplegL)
  x.addScaledVector(y, -x.dot(y)).normalize()
  const z = new THREE.Vector3().crossVectors(x, y)
  const plane = (a: number[], m: number[], c: number[]) => new THREE.Vector3().crossVectors(sub(a, m), sub(c, m)).normalize()
  expect(Math.abs(plane(s.uplegL, s.legL, s.footL).dot(x))).toBeCloseTo(1, 3)
  expect(Math.abs(plane(s.armR, s.forearmR, s.handR).dot(z))).toBeCloseTo(1, 3)
  // Upside down, its head 1.2 m up: it lands on its head and shoulders.
  const head = fall({ clip: 'dive', pos: [0, 1.2, 0], blow: { dir: [1, 0.2], speed: 0.5, height: 1 }, height: () => -0.9 })
  expect(head.landed).toBe(true)
  expect(head.worst).toBeLessThan(HELD)
})

test('every limit holds on every step over blows high and low, soft and hard, on hilly ground, and no point ends a step under it', () => {
  const hills = (x: number, z: number) => 0.3 * Math.sin(2 * x) + 0.2 * Math.cos(1.5 * z)
  let worst = 0
  for (const speed of [3, 6, 9, 12]) {
    for (const height of [0.2, 1.0, 1.6]) {
      for (const clip of ['stand', 'kneel', 'ready']) {
        const f = fall({ clip, pos: [0, hills(0, 0), 0], blow: { dir: [Math.cos(speed), Math.sin(speed)], speed, height }, height: hills })
        expect(f.landed).toBe(true)
        expect(f.under).toBeGreaterThan(-1e-9)
        expect(f.p.me.body(3)!.asleep).toBe(true)
        worst = Math.max(worst, f.worst)
      }
    }
  }
  // Measured 0.052° at worst.
  expect(worst).toBeLessThan(HELD)
})

test('a body steps by the numbers it had when it was built: an edit while it lies reaches the next body, not this one', () => {
  const blow = { dir: [1, 0.5], speed: 6, height: 1.3 }
  const edit = { damp: 0.9, iter: 3, sweeps: 5, radius: 0.1, vmax: 0.1, friction: 0.9, still: 0.01, calm: 10, settle: 0.5 }
  const hills = (x: number, z: number) => 0.2 * Math.sin(x + z)
  const seat = (numbers: Partial<Numbers> = {}) => page({ height: hills, numbers })
  const edited = seat(), plain = seat(), late = seat(), fresh = seat(edit)
  for (const s of [edited, plain, fresh]) { s.frame(); s.die(blow, { clip: 'ready', clipT: 0 }); s.frame() }
  for (let n = 0; n < 60; n++) {
    if (n === 20) Object.assign(edited.plugins.wire.scene.world.ragdoll3d, edit)
    for (const s of [edited, plain, fresh]) { s.step(); s.frame() }
  }
  // The seat that saw the edit mid-fall steps its body as the one that never saw it.
  expect(edited.points()).toEqual(plain.points())
  expect(edited.me.body(3)!.steps).toBe(60)
  // A seat that builds the body after the edit steps it by the edited numbers throughout.
  Object.assign(late.plugins.wire.scene.world.ragdoll3d, edit)
  late.die(blow, { clip: 'ready', clipT: 0 })
  late.row().data.limpFor = 60
  late.frame()
  expect(late.points()).toEqual(fresh.points())
  expect(late.me.body(3)!.steps).toBe(fresh.me.body(3)!.steps)
  expect(fresh.me.body(3)!.steps).toBeLessThanOrEqual(30)
})

test('it comes to rest on the ground: no point under ground height plus radius, the lowest on it, the body lying flat', () => {
  const height = (x: number, z: number) => 0.3 + 0.1 * x - 0.05 * z
  const p = page({ height, pos: [0, 0.3, 0] })
  p.frame()
  p.die({ dir: [0, 1], speed: 5, height: 1.5 })
  p.frame()
  for (let n = 0; n < 600; n++) {
    p.step(); p.frame()
    for (const v of p.points()) expect(v[1]).toBeGreaterThanOrEqual(height(v[0], v[2]) + 0.06 - 1e-9)
  }
  expect(p.me.body(3)!.asleep).toBe(true)
  const gaps = p.points().map(v => v[1] - height(v[0], v[2]) - 0.06)
  expect(Math.min(...gaps)).toBeCloseTo(0, 9)
  // A body 1.59 m tall lies within the torso's depth of the ground, not propped up.
  expect(Math.max(...gaps)).toBeLessThan(0.3)
  // The hips bone stands on the hips point.
  const hips = p.me.body(3)!.points.hips
  expect(world(p.bone('Hips')).distanceTo(new THREE.Vector3(...hips))).toBeLessThan(1e-9)
})

test('a late seat\'s body equals a continuous seat\'s, bone for bone, and one arriving after settle draws the settled body', () => {
  const height = (x: number) => 0.2 * Math.sin(x)
  const blow = { dir: [-2, 1], speed: 7, height: 1.3 }
  const on = page({ height }), late = page({ height }), later = page({ height })
  on.frame()
  on.die(blow, { clip: 'kneel', clipT: 0.2 })
  on.frame()
  for (let n = 0; n < 45; n++) { on.step(); on.frame() }
  late.die(blow, { clip: 'kneel', clipT: 0.2 })
  late.row().data.limpFor = 45
  late.frame()
  expect(late.me.body(3)!.steps).toBe(45)
  expect(late.points()).toEqual(on.points())
  const same = (a: ReturnType<typeof page>, b: ReturnType<typeof page>) => {
    let n = 0
    a.model.model(3)!.traverse(o => {
      if (!(o as THREE.Bone).isBone) return
      const other = b.model.model(3)!.getObjectByName(o.name)!
      expect(other.quaternion.toArray()).toEqual(o.quaternion.toArray())
      expect(other.position.toArray()).toEqual(o.position.toArray())
      n++
    })
    expect(n).toBe(2 * 22)
  }
  same(on, late)
  // Past settle: 8 s at 60 Hz is 480 steps, and no more.
  for (let n = 45; n < 600; n++) { on.step(); on.frame() }
  expect(on.me.body(3)!.steps).toBeLessThanOrEqual(480)
  later.die(blow, { clip: 'kneel', clipT: 0.2 })
  later.row().data.limpFor = 5000
  later.frame()
  expect(later.me.body(3)!.steps).toBe(on.me.body(3)!.steps)
  expect(later.points()).toEqual(on.points())
  same(on, later)
})

test('it sleeps once every point moves less than still for calm steps, and settle stops it where it stands', () => {
  const p = page({ height: () => 0 })
  p.frame(); p.die({ dir: [1, 0], speed: 3, height: 1.4 }); p.frame()
  let slept = 0
  for (let n = 1; n <= 480; n++) {
    const before = p.points()
    p.step(); p.frame()
    const b = p.me.body(3)!
    if (b.asleep && !slept) slept = n
    if (slept && n > slept) {
      expect(b.steps).toBe(slept)
      expect(p.points()).toEqual(before)
    }
  }
  expect(slept).toBeGreaterThan(30)
  expect(slept).toBeLessThan(480)

  // Lying still on its back it sleeps on the calm-th step; lifted by ground rising under it on the
  // 20th, it counts its calm steps again from there.
  const lie = (rise: boolean) => {
    let lift = 0
    const l = page({ yaw: 0, height: () => lift })
    l.frame()
    l.row().data.pos = [0, 0.06 - 0.95, 0]
    l.die({ dir: [1, 0], speed: 0, height: 0 }, { clip: 'lie', clipT: 0 })
    l.frame()
    for (let n = 1; n <= 200 && !l.me.body(3)!.asleep; n++) {
      if (rise && n === 21) lift = 0.01
      l.step(); l.frame()
    }
    return l.me.body(3)!.steps
  }
  expect(lie(false)).toBe(30)
  expect(lie(true)).toBeGreaterThan(21 + 30)

  // A still no body reaches: settle is the hard stop, 0.5 s at 60 Hz.
  const s = page({ height: () => 0, numbers: { still: 1e-12, settle: 0.5 } })
  s.frame(); s.die({ dir: [1, 0], speed: 3, height: 1.4 }); s.frame()
  for (let n = 0; n < 29; n++) { s.step(); s.frame() }
  expect(s.me.body(3)!.asleep).toBe(false)
  s.step(); s.frame()
  expect(s.me.body(3)).toMatchObject({ steps: 30, asleep: true })
  s.step(); s.frame()
  expect(s.me.body(3)!.steps).toBe(30)
  // A seat arriving long after steps to settle and no further, to the same body.
  const late = page({ height: () => 0, numbers: { still: 1e-12, settle: 0.5 } })
  late.die({ dir: [1, 0], speed: 3, height: 1.4 })
  late.row().data.limpFor = 5000
  late.frame()
  expect(late.me.body(3)).toMatchObject({ steps: 30, asleep: true })
  expect(late.points()).toEqual(s.points())
})

test('a frame with no new step does no physics', () => {
  const p = page({ height: () => 0 })
  p.frame(); p.die({ dir: [1, 0], speed: 3, height: 1.4 }); p.frame()
  p.step(); p.frame()
  const at = p.points()
  const quats: number[][] = []
  p.model.model(3)!.traverse(o => quats.push(o.quaternion.toArray()))
  for (let n = 0; n < 5; n++) p.frame()
  expect(p.points()).toEqual(at)
  expect(p.me.body(3)!.steps).toBe(1)
  const again: number[][] = []
  p.model.model(3)!.traverse(o => again.push(o.quaternion.toArray()))
  expect(again).toEqual(quats)
})

test('it is let go when the row gets up, built again on its next death, and on a limpFor lower than the last seen; a row that ends and close let go too', () => {
  const p = page({ height: () => 0 })
  p.frame(); p.die({ dir: [1, 0], speed: 3, height: 1.4 }); p.frame()
  for (let n = 0; n < 20; n++) { p.step(); p.frame() }
  expect(p.me.body(3)!.steps).toBe(20)
  // Gets up: let go, and anim draws it from the rest and its clip again.
  p.row().data.limp = false
  p.frame()
  expect(p.me.body(3)).toBeUndefined()
  const fresh = page()
  fresh.frame()
  fresh.model.model(3)!.traverse(o => {
    const got = p.model.model(3)!.getObjectByName(o.name)!
    got.quaternion.toArray().forEach((x, i) => expect(x).toBeCloseTo(o.quaternion.toArray()[i], 9))
  })
  // Dies again: a new body from the new death.
  p.die({ dir: [0, 1], speed: 2, height: 0.2 }, { clip: 'kneel', clipT: 0 })
  p.frame()
  expect(p.me.body(3)!.steps).toBe(0)
  expect(angle(p.me.body(3)!.points.uplegL, p.me.body(3)!.points.legL, p.me.body(3)!.points.footL)).toBeCloseTo(20, 3)
  for (let n = 0; n < 10; n++) { p.step(); p.frame() }
  // A seat that missed the rising sees a lower limpFor: a new death.
  p.row().data.limpFor = 3
  p.row().data.pose = { clip: 'stand', clipT: 0 }
  p.frame()
  expect(p.me.body(3)!.steps).toBe(3)
  // The row ends.
  p.rows.splice(p.rows.indexOf(p.row()), 1)
  p.frame()
  expect(p.me.body(3)).toBeUndefined()
  const c = page({ height: () => 0 })
  c.frame(); c.die(); c.frame()
  expect(c.me.body(3)).toBeDefined()
  c.me.close()
  expect(c.me.body(3)).toBeUndefined()
})

test('the blow: the point nearest its height moves at speed along dir, normalised, the rest at speed·spread, each cut to vmax', () => {
  const blow = (speed: number, dir: number[], height: number, numbers: Partial<Numbers> = {}) => {
    const p = page({ numbers: { damp: 1, ...numbers }, kind: 'martian', pos: [0, 5, 0] })
    p.plugins.wire.scene.world.walker.kinds.martian.gravity = 1e-12
    p.frame(); p.die({ dir, speed, height }, { clip: 'ready', clipT: 0 }); p.frame()
    const a = p.me.body(3)!.points
    p.step(); p.frame()
    const b = p.me.body(3)!.points
    return Object.fromEntries(Object.keys(a).map(r => [r, sub(b[r as Role], a[r as Role])])) as Record<Role, THREE.Vector3>
  }
  // Struck at the head's height, 6.59 m: the head carries the blow, square to its stick.
  const d = blow(3, [3, 4], 1.59)
  const along = new THREE.Vector3(0.6, 0, 0.8)
  expect(d.head.dot(along)).toBeCloseTo(3 * DT, 3)
  expect(d.footL.dot(along)).toBeCloseTo(3 * DT * 0.25, 3)
  expect(Math.abs(d.head.x * 0.8 - d.head.z * 0.6)).toBeLessThan(1e-6)
  // Every pass moves a pair equally, so the centre moves by the mean of the velocities.
  const mean = Object.values(d).reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(15)
  expect(mean.dot(along)).toBeCloseTo((3 * DT * (1 + 14 * 0.25)) / 15, 12)
  // Struck at the feet's height instead, the left foot, first in role order, carries it.
  const f = blow(3, [3, 4], 0.07)
  expect(f.footL.dot(along)).toBeCloseTo(3 * DT, 2)
  expect(f.head.dot(along)).toBeCloseTo(3 * DT * 0.25, 2)
  // 100 m/s is 1.67 m a step, a quarter of it 0.42: every point is cut to vmax.
  const cut = blow(100, [1, 0], 1.59)
  const m = Object.values(cut).reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(15)
  expect(m.x).toBeCloseTo(0.14, 9)
})

test('solids: asked once a step, after the move, about the centre out to the furthest point plus radius and vmax, and no point ends a step inside one', () => {
  const trunk = { x: 0.6, z: 0.13, radius: 0.25 }
  let onEdge = 0
  // Without friction each point's last place is where it stood a step before, so the move is known.
  const p = page({ height: () => 0, solids: [trunk], numbers: { friction: 0 } })
  p.frame(); p.die({ dir: [1, 0], speed: 6, height: 1.2 }); p.frame()
  let last = p.points()
  for (let n = 1; n <= 120 && !p.me.body(3)!.asleep; n++) {
    const before = p.points()
    const moved = before.map((v, i) => {
      const u = [0, 1, 2].map(k => (v[k] - last[i][k]) * 0.985)
      const s = Math.min(1, 0.14 / (Math.hypot(...u) || 1))
      return [v[0] + u[0] * s, v[1] + u[1] * s - 20 * DT * DT, v[2] + u[2] * s]
    })
    const c = centre(moved)
    const far = Math.max(...moved.map(v => Math.hypot(v[0] - c[0], v[2] - c[2])))
    p.step(); p.frame()
    last = before
    expect(p.asked.length).toBe(n)
    if (n === 1) continue // the first step's last places are the blow's
    const [x, z, r] = p.asked[n - 1]
    expect(x).toBeCloseTo(c[0], 12)
    expect(z).toBeCloseTo(c[2], 12)
    expect(r).toBeCloseTo(far + 0.06 + 0.14, 12)
    for (const v of p.points()) {
      const d = Math.hypot(v[0] - trunk.x, v[2] - trunk.z)
      expect(d).toBeGreaterThanOrEqual(0.25 + 0.06 - 1e-9)
      if (d < 0.25 + 0.06 + 1e-9) onEdge++
    }
  }
  // A point pushed out on the last pass stands on the edge, straight out from the trunk's middle.
  expect(onEdge).toBeGreaterThan(0)
  // Without the trunk the same blow carries the body through where it stands.
  const open = page({ height: () => 0 })
  open.frame(); open.die({ dir: [1, 0], speed: 6, height: 1.2 }); open.frame()
  let inside = false
  for (let n = 0; n < 120; n++) {
    open.step(); open.frame()
    inside ||= open.points().some(v => Math.hypot(v[0] - trunk.x, v[2] - trunk.z) < 0.31)
  }
  expect(inside).toBe(true)
})

test('a solid pushes a point straight out from its middle: a trunk met off to one side turns the body away from that side', () => {
  // Sliding flat on its back, the body moves as one along x until its left hand meets a trunk whose
  // middle is 7 cm to +z of the hand's path. Nothing but a solid moves the body's centre across z.
  const trunk = { x: 0, z: 0, radius: 0.1 }
  const p = page({ numbers: { spread: 1 }, yaw: 0, height: () => 0, solids: [trunk] })
  p.frame()
  p.row().data.pos = [0, 0.06 - 0.95, 0]
  p.die({ dir: [1, 0], speed: 3, height: 0 }, { clip: 'lie', clipT: 0 })
  p.frame()
  const hand = p.me.body(3)!.points.handL
  Object.assign(trunk, { x: hand[0] + 0.2, z: hand[2] + 0.07 })
  const z0 = centre(p.points())[2]
  let met = false
  for (let k = 1; k <= 30; k++) {
    p.step(); p.frame()
    const got = p.points()
    const near = Math.min(...got.map(v => Math.hypot(v[0] - trunk.x, v[2] - trunk.z)))
    expect(near).toBeGreaterThanOrEqual(0.16 - 1e-9)
    met ||= near < 0.16 + 1e-9
    if (!met) expect(centre(got)[2]).toBeCloseTo(z0, 12)
  }
  expect(met).toBe(true)
  expect(centre(p.points())[2]).toBeLessThan(z0 - 1e-4)
})

test('friction slows a body sliding on the ground: the more friction, the shorter the slide, and none on a body in the air', () => {
  const slide = (friction: number, height = () => 0) => {
    const p = page({ height, numbers: { friction, damp: 1 } })
    p.frame(); p.die({ dir: [1, 0], speed: 8, height: 0.05 }); p.frame()
    const a = centre(p.points())
    for (let n = 0; n < 60; n++) { p.step(); p.frame() }
    return centre(p.points())[0] - a[0]
  }
  const none = slide(0), some = slide(0.4), all = slide(1)
  expect(none).toBeGreaterThan(some)
  expect(some).toBeGreaterThan(all)
  expect(all).toBeGreaterThan(0)
  // In the air nothing touches: friction takes nothing.
  expect(slide(0.4, () => -1000)).toBe(slide(0, () => -1000))
})

test('friction takes its share of a touching point\'s speed across the ground once a step: a body sliding on its back slows by damp·(1 − friction) a step', () => {
  const p = page({ numbers: { spread: 1 }, yaw: 0, height: () => 0 })
  p.frame()
  // Lying flat at 0.95 m, lowered onto the ground as it dies.
  p.row().data.pos = [0, 0.06 - 0.95, 0]
  p.die({ dir: [1, 0], speed: 3, height: 0 }, { clip: 'lie', clipT: 0 })
  p.frame()
  for (const v of p.points()) expect(v[1]).toBeCloseTo(0.06, 9)
  let x = centre(p.points())[0], d = 3 * DT
  for (let k = 1; k <= 40; k++) {
    p.step(); p.frame()
    d *= 0.985
    x += d
    d *= 1 - 0.4
    expect(centre(p.points())[0]).toBeCloseTo(x, 9)
    for (const v of p.points()) expect(v[1]).toBeCloseTo(0.06, 9)
  }
})

test('friction takes only the speed across the ground: a body slid up a slope keeps its climb and lifts off it', () => {
  let c = 0
  const p = page({ yaw: 0, numbers: { spread: 1 }, height: (_x, z) => 0.5 * z + c })
  p.frame()
  p.die({ dir: [0, 1], speed: 6, height: 0 }, { clip: 'lieUp', clipT: 0 })
  p.frame()
  // The ground laid under the body as it died: every joint on it.
  const h = p.me.body(3)!.points.hips
  c = h[1] - 0.5 * h[2] - 0.06
  const gap = () => p.points().map(v => v[1] - (0.5 * v[2] + c + 0.06))
  for (const g of gap()) expect(g).toBeCloseTo(0, 7)
  // The first step climbs d, lifted onto the slope; the second keeps the climb's 0.985·½·d but runs
  // only 0.985·0.6·d along it, so it rises clear by 0.985·½·d·0.4 less its fall.
  const d = 6 * DT * 0.985
  p.step(); p.frame()
  for (const g of gap()) expect(g).toBeCloseTo(0, 7)
  p.step(); p.frame()
  for (const g of gap()) expect(g).toBeCloseTo(0.985 * 0.5 * d * 0.4 - 20 * DT * DT, 7)
})

test('the braces keep the torso a slab: shoulder to shoulder, hip to hip, hips to each shoulder and upper spine to each hip hold their lengths at death', () => {
  const p = page({ height: (x: number) => 0.3 * Math.sin(2 * x) })
  p.frame(); p.die({ dir: [1, 1], speed: 7, height: 1.45 }, { clip: 'kneel', clipT: 0 }); p.frame()
  const braces: [Role, Role][] = [['armL', 'armR'], ['uplegL', 'uplegR'], ['hips', 'armL'], ['hips', 'armR'], ['spine', 'uplegL'], ['spine', 'uplegR']]
  const len = (s: Record<Role, number[]>, [a, b]: [Role, Role]) => sub(s[a], s[b]).length()
  const at = braces.map(b => len(p.me.body(3)!.points, b))
  let worst = 0
  for (let n = 0; n < 480 && !p.me.body(3)!.asleep; n++) {
    p.step(); p.frame()
    braces.forEach((b, i) => { worst = Math.max(worst, Math.abs(len(p.me.body(3)!.points, b) / at[i] - 1)) })
  }
  // Measured 0.02% at the worst step; without the braces the shoulders swing 83% off.
  expect(worst).toBeLessThan(0.005)
})

test('writing back: the hips turn with the pelvis basis, each limb bone points along its points, and no turn carries over from the frame before', () => {
  const p = page({ height: () => 0 }), scrambled = page({ height: () => 0 })
  const blow = { dir: [1, 2], speed: 5, height: 1.4 }
  for (const s of [p, scrambled]) { s.frame(); s.die(blow); s.frame() }
  const basis = (b: Record<Role, number[]>) => {
    const y = sub(b.spine, b.hips).normalize()
    const x = sub(b.uplegR, b.uplegL)
    x.addScaledVector(y, -x.dot(y)).normalize()
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)))
  }
  const b0 = basis(p.me.body(3)!.points)
  const hips0 = p.bone('Hips').getWorldQuaternion(new THREE.Quaternion())
  let n = 0
  for (; n < 480 && !p.me.body(3)!.asleep; n++) {
    for (const s of [p, scrambled]) s.step()
    // One seat's limb bones are knocked askew between steps; the next write puts them back.
    for (const name of ['Neck', 'LeftShoulder', 'LeftArm', 'RightForeArm', 'LeftUpLeg', 'RightLeg']) scrambled.bone(name).quaternion.set(0.5, -0.5, 0.5, 0.5)
    p.frame(); scrambled.frame()
    const b = p.me.body(3)!.points
    const want = basis(b).multiply(b0.clone().invert()).multiply(hips0)
    const got = p.bone('Hips').getWorldQuaternion(new THREE.Quaternion())
    expect(Math.abs(got.dot(want))).toBeCloseTo(1, 9)
    const dir = (from: THREE.Vector3, to: number[]) => new THREE.Vector3(...to).sub(from).normalize()
    const along = (bone: string, child: string, from: number[] | undefined, to: number[]) => {
      const o = world(p.bone(bone))
      const now = world(p.bone(child)).sub(o).normalize()
      expect(now.angleTo(dir(from ? new THREE.Vector3(...from) : o, to))).toBeLessThan(1e-6)
    }
    along('Neck', 'Head', undefined, b.head)
    along('LeftShoulder', 'LeftArm', undefined, b.armL)
    along('RightShoulder', 'RightArm', undefined, b.armR)
    along('LeftArm', 'LeftForeArm', b.armL, b.forearmL)
    along('RightForeArm', 'RightHand', b.forearmR, b.handR)
    along('LeftUpLeg', 'LeftLeg', b.uplegL, b.legL)
    along('RightLeg', 'RightFoot', b.legR, b.footR)
    p.model.model(3)!.traverse(o => {
      const other = scrambled.model.model(3)!.getObjectByName(o.name)!
      o.quaternion.toArray().forEach((x, i) => expect(other.quaternion.toArray()[i]).toBeCloseTo(x, 9))
    })
  }
  expect(n).toBeGreaterThan(60)
})

test('every skeleton copy is driven: the points are read from the copy the clips name, wherever it stands, and every other copy is posed as it is', () => {
  const p = page({ height: () => 0 })
  p.frame()
  p.die({ dir: [1, 0], speed: 0, height: 1 }, { clip: 'kneel', clipT: 0.3 })
  p.frame()
  const m = p.model.model(3)!
  // At death the points are the posed copy's joints, and writing back leaves its pose as anim drew it.
  const posed = page()
  posed.model.tick(posed.plugins)
  posed.row().data.limp = true
  posed.model.tick(posed.plugins)
  const drawn = posed.model.pose(3, 'kneel', 0.3)
  const b = p.me.body(3)!.points
  for (const [role, suffix] of Object.entries(BONES)) {
    const want = world(drawn.getObjectByName(`mixamorig${suffix}`)!)
    expect(new THREE.Vector3(...b[role as Role]).distanceTo(want)).toBeLessThan(1e-9)
    expect(world(m.getObjectByName(`mixamorig${suffix}`)!).distanceTo(want)).toBeLessThan(1e-6)
  }
  // The `_1` copy, found first and never drawn by the clips, stands where the named copy stands, before
  // and after steps.
  const check = () => {
    let n = 0
    m.traverse(o => {
      if (!(o as THREE.Bone).isBone || !o.name.endsWith('_1')) return
      const named = m.getObjectByName(o.name.slice(0, -2))!
      expect(world(o).distanceTo(world(named))).toBeLessThan(1e-6)
      // The clips' quaternions are float32, a few parts in 10¹⁰ off unit length, so each is normalised and the turn compared.
      expect(o.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(named.getWorldQuaternion(new THREE.Quaternion()).normalize())).toBeLessThan(1e-7)
      expect(o.quaternion.toArray()).toEqual(named.quaternion.toArray())
      n++
    })
    expect(n).toBe(22)
  }
  check()
  for (let n = 0; n < 60; n++) { p.step(); p.frame() }
  check()
})

test('a model without the bones throws, naming the kind and the bone', () => {
  const p = page({ model: lacking })
  p.frame(); p.die()
  expect(() => p.frame()).toThrow('ragdoll3d: the dummy model has no bone ending LeftFoot')
})

test('the order in plugins: the plugin whose model and pose it reads is listed before it, those of its land and solids listed anywhere, or it throws; render3d, which draws in its afterTick, anywhere', () => {
  const before = page({ plugins: ['loader', 'terrain3d', 'scatter3d', 'ragdoll3d', 'anim', 'render3d'] })
  expect(() => before.frame()).toThrow('ragdoll3d is listed before anim, whose model it reads that frame')
  const unlisted = page({ plugins: ['loader', 'terrain3d', 'scatter3d', 'ragdoll3d', 'render3d'] })
  expect(() => unlisted.frame()).toThrow('ragdoll3d\'s model is anim\'s, which this scene does not list')
  // The land and the solids are read whenever: their plugins may be listed after it, and must be listed.
  expect(() => page({ plugins: ['loader', 'anim', 'ragdoll3d', 'terrain3d', 'scatter3d', 'render3d'] }).frame()).not.toThrow()
  expect(() => page({ plugins: ['loader', 'scatter3d', 'anim', 'ragdoll3d', 'render3d'] }).frame()).toThrow('ragdoll3d\'s land is terrain3d\'s, which this scene does not list')
  expect(() => page({ plugins: ['loader', 'terrain3d', 'anim', 'ragdoll3d', 'render3d'] }).frame()).toThrow('ragdoll3d\'s solids is scatter3d\'s, which this scene does not list')
  // Listed after render3d it lays the same body as listed before it.
  const after = page({ plugins: ['loader', 'terrain3d', 'scatter3d', 'anim', 'render3d', 'ragdoll3d'], height: () => 0 })
  const on = page({ height: () => 0 })
  for (const p of [after, on]) {
    p.frame(); p.die({ dir: [1, 0], speed: 3, height: 1.4 }); p.frame()
    for (let n = 0; n < 20; n++) { p.step(); p.frame() }
  }
  expect(after.me.body(3)!.steps).toBe(20)
  expect(after.points()).toEqual(on.points())
})

test('what the scene\'s mods leave out: no model, pose or gravity throws; no land, a body lies as it died; no solids, nothing is asked and nothing stops it', () => {
  expect(() => page({ mods: without('model') }).frame()).toThrow('ragdoll3d lays its bodies on the model a mod hands it, and the scene names none in world.ragdoll3d.mods.model')
  expect(() => page({ mods: without('pose') }).frame()).toThrow('ragdoll3d builds its bodies from the pose a mod draws, and the scene names none in world.ragdoll3d.mods.pose')
  expect(() => page({ mods: without('gravity') }).frame()).toThrow('ragdoll3d drops its bodies at the gravity a mod hands it, and the scene names none in world.ragdoll3d.mods.gravity')
  // No land: built and written back, never stepped.
  const flat = page({ mods: without('land'), height: () => 0 })
  flat.frame(); flat.die({ dir: [1, 0], speed: 3, height: 1.4 }); flat.frame()
  const died = flat.points()
  for (let n = 0; n < 20; n++) { flat.step(); flat.frame() }
  expect(flat.me.body(3)!.steps).toBe(0)
  expect(flat.points()).toEqual(died)
  // No solids: the trunk the scatter3d stand-in would hand is never asked for, and the blow carries
  // the body through where it stands.
  const trunk = { x: 0.6, z: 0.13, radius: 0.25 }
  const open = page({ mods: without('solids'), height: () => 0, solids: [trunk] })
  open.frame(); open.die({ dir: [1, 0], speed: 6, height: 1.2 }); open.frame()
  let inside = false
  for (let n = 0; n < 120; n++) {
    open.step(); open.frame()
    inside ||= open.points().some(v => Math.hypot(v[0] - trunk.x, v[2] - trunk.z) < 0.31)
  }
  expect(open.me.body(3)!.steps).toBeGreaterThan(0)
  expect(open.asked).toEqual([])
  expect(inside).toBe(true)
})

test('the numbers are checked: out of range, a role without a suffix, a limit out of order', () => {
  const bad: [Partial<Numbers>, string][] = [
    [{ damp: 1.2 }, 'ragdoll3d damp must be above 0 and at most 1, not 1.2'],
    [{ iter: 2.5 }, 'ragdoll3d iter must be a whole number from 1, not 2.5'],
    [{ sweeps: 0 }, 'ragdoll3d sweeps must be a whole number from 1, not 0'],
    [{ vmax: 0 }, 'ragdoll3d vmax must be above 0, not 0'],
    [{ friction: -0.1 }, 'ragdoll3d friction must be from 0 to 1, not -0.1'],
    [{ settle: Number.NaN }, 'ragdoll3d settle must be above 0, not NaN'],
    [{ bones: { ...BONES, legR: '' } }, 'ragdoll3d bones gives no suffix for legR'],
    [{ limits: { ...NUMBERS.limits, knee: [172, 35] } }, 'ragdoll3d limits.knee must be [least, most] degrees, 0 ≤ least ≤ most ≤ 180'],
    [{ limits: { ...NUMBERS.limits, hip: [55, 190] } }, 'ragdoll3d limits.hip must be [least, most] degrees, 0 ≤ least ≤ most ≤ 180'],
  ]
  for (const [numbers, words] of bad) expect(() => page({ numbers }).frame()).toThrow(words)
  expect(() => page().frame()).not.toThrow()
})

test('a body waits for its model and its ground, then catches up the steps it is owed', () => {
  const p = page({ height: () => 0 })
  const ground = p.plugins.terrain3d.ground
  p.plugins.terrain3d.ground = undefined
  p.frame(); p.die({ dir: [1, 0], speed: 3, height: 1.4 }); p.frame()
  for (let n = 0; n < 12; n++) { p.step(); p.frame() }
  expect(p.me.body(3)!.steps).toBe(0)
  p.plugins.terrain3d.ground = ground
  p.frame()
  const on = page({ height: () => 0 })
  on.frame(); on.die({ dir: [1, 0], speed: 3, height: 1.4 }); on.frame()
  for (let n = 0; n < 12; n++) { on.step(); on.frame() }
  expect(p.points()).toEqual(on.points())
})

