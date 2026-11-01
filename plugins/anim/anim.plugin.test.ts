// The browser half of anim on render3d with no canvas, drawing rows the test writes, with a rig file
// handed to the loader and a model the test builds and exports as a GLB: a small Mixamo-named
// skeleton under a Z-up armature, and clips whose first key sits a frame in. The mixer at the row's
// clip, the crossfade, the upper layer's share, pinning (a one-shot at bind, a loop at bind plus its
// sway, a turn's yaw taken off), mirrored tracks, mesh roles per stance, a limp row, getting up,
// `pose`, `model`, the clips' checks, `close`, a rig of other roles on a row of other
// fields, the aim (its sign, its shares, and no turn piled on the frame before's) and props (hung
// scale-free at their bone, following it standing and limp, going with the row).
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import type { Row, Scene } from '#engine/engine.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { posed, type Measure, type Numbers, type Rig } from './anim.sim.ts'
import { anim } from './anim.plugin.ts'

afterEach(() => { vi.restoreAllMocks() })

// ---------------------------------------------------------------- the model

// Three's exporter reads its blobs back with a FileReader, which node does not have.
class Reader {
  result: ArrayBuffer | undefined
  onloadend = () => {}
  readAsArrayBuffer(b: Blob) { void b.arrayBuffer().then(r => { this.result = r; this.onloadend() }) }
}
// The glb's bytes, as exported, and the model three's loader reads from them.
async function glbOf(scene: THREE.Object3D, animations: THREE.AnimationClip[]) {
  vi.stubGlobal('FileReader', Reader)
  try {
    const bytes = await new GLTFExporter().parseAsync(scene, { binary: true, animations }) as ArrayBuffer
    return { bytes: new Uint8Array(bytes), gltf: await new GLTFLoader().parseAsync(bytes, '') }
  } finally {
    vi.unstubAllGlobals()
  }
}

// The armature is turned a quarter about x and scaled to centimetres, as an exported Mixamo rig is:
// its −z is up, its +y forward and its +x the body's left.
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1)
const UP = new THREE.Vector3(0, 0, -1)
const q = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle)
const HIPS_REST = q(X, -Math.PI / 2)
const HIPS_AT = new THREE.Vector3(0, 0, -95)
const SPINE_AT = new THREE.Vector3(0, 10, 0)

function body() {
  const root = new THREE.Group()
  root.name = 'model'
  const rig = new THREE.Object3D()
  rig.name = 'rig'
  rig.quaternion.copy(q(X, Math.PI / 2))
  rig.scale.setScalar(0.01)
  root.add(rig)
  const bone = (name: string, at: number[], parent?: THREE.Bone) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.fromArray(at)
    parent?.add(b)
    return b
  }
  const hips = bone('mixamorigHips', HIPS_AT.toArray())
  hips.quaternion.copy(HIPS_REST)
  const spine = bone('mixamorigSpine', [0, 8, 0], hips)
  const spine1 = bone('mixamorigSpine1', SPINE_AT.toArray(), spine)
  const leftArm = bone('mixamorigLeftArm', [12, 10, 0], spine1)
  const rightArm = bone('mixamorigRightArm', [-12, 10, 0], spine1)
  const rightHand = bone('mixamorigRightHand', [-25, 0, 0], rightArm)
  const leftUpLeg = bone('mixamorigLeftUpLeg', [8, -5, 0], hips)
  const bones = [hips, spine, spine1, leftArm, rightArm, rightHand, leftUpLeg]
  const g = new THREE.BoxGeometry(30, 150, 20)
  const n = g.getAttribute('position').count
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : 1)), 4))
  const skinned = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ name: 'skin', color: 0x886655 }))
  skinned.name = 'Body'
  rig.add(skinned)
  rig.add(hips)
  skinned.bind(new THREE.Skeleton(bones))
  const steel = new THREE.MeshStandardMaterial({ name: 'steel', color: 0x999999 })
  const sword = new THREE.Mesh(new THREE.BoxGeometry(2, 60, 2), steel)
  sword.name = 'Sword'
  rightHand.add(sword)
  const shield = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 3), steel)
  shield.name = 'Shield'
  leftArm.add(shield)
  return root
}

// A clip of `dur` seconds keyed every thirtieth from a frame in, as exported clips are: `keys(u)`,
// u from 0 to 1, gives each track's value.
type Keys = Record<string, THREE.Vector3 | THREE.Quaternion>
const FRAME = 1 / 30
function clip(name: string, dur: number, keys: (u: number) => Keys): THREE.AnimationClip {
  const n = Math.round(dur / FRAME)
  const times = Array.from({ length: n + 1 }, (_, i) => FRAME + i * FRAME)
  const all = Array.from({ length: n + 1 }, (_, i) => keys(i / n))
  return new THREE.AnimationClip(name, -1, Object.keys(all[0]).map(track => {
    const values = all.flatMap(k => k[track].toArray() as number[])
    return track.endsWith('quaternion') ? new THREE.QuaternionKeyframeTrack(track, times, values) : new THREE.VectorKeyframeTrack(track, times, values)
  }))
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const TAU = 2 * Math.PI
// Every clip keys these, so no binding blends against the rest.
const base = (over: Partial<Keys> = {}): Keys => ({
  'mixamorigHips.position': HIPS_AT.clone(),
  'mixamorigHips.quaternion': HIPS_REST.clone(),
  'mixamorigSpine1.position': SPINE_AT.clone(),
  'mixamorigSpine1.quaternion': new THREE.Quaternion(),
  'mixamorigLeftArm.quaternion': q(Z, 0.2),
  'mixamorigRightArm.quaternion': q(Z, -0.2),
  ...over,
})
const TURN = (u: number) => Math.PI * u // the turn's hips, left about the vertical
const KEYS: Record<string, [number, (u: number) => Keys]> = {
  idle: [2, u => base({ 'mixamorigHips.position': v(2 * Math.sin(TAU * u), 0, -95 + Math.cos(TAU * u)), 'mixamorigSpine1.quaternion': q(Z, 0.1 * Math.sin(TAU * u)) })],
  walk: [1, u => base({ 'mixamorigHips.position': v(3 * Math.sin(TAU * u), 150 * u, -95 + 2 * Math.cos(2 * TAU * u)) })],
  dash: [1, u => base({ 'mixamorigHips.position': v(Math.sin(Math.PI * u), 200 * u, -95 - 5 * Math.sin(Math.PI * u)) })],
  turn: [1, u => base({ 'mixamorigHips.position': v(0, 20 * u, -95), 'mixamorigHips.quaternion': q(UP, TURN(u)).multiply(HIPS_REST) })],
  twitch: [0.5, u => base({ 'mixamorigHips.quaternion': q(UP, (10 * Math.PI / 180) * u).multiply(HIPS_REST) })],
  strike: [1, u => base({
    'mixamorigHips.position': v(1.5 * Math.sin(TAU * u), 0, -95),
    'mixamorigSpine1.position': v(0, 10 + 5 * u, 0),
    'mixamorigSpine1.quaternion': q(X, Math.sin(Math.PI * u)),
    'mixamorigRightArm.quaternion': q(Y, 1.2 * u),
  })],
  wave: [1, u => base({ 'mixamorigSpine1.position': v(0, 10, 4 * u), 'mixamorigLeftArm.quaternion': q(X, u) })],
  strafe: [1, u => base({
    'mixamorigHips.position': v(100 * u, 2 * Math.sin(TAU * u), -95),
    'mixamorigLeftArm.quaternion': q(new THREE.Vector3(1, 2, 3).normalize(), 0.7 * u),
    'mixamorigRightArm.quaternion': q(Y, 0.3),
  })],
  'Armature|mixamo.com|Layer0': [1, () => base()],
}

// ---------------------------------------------------------------- the rig

function measure(dur: number, path: (u: number) => number[]): Measure {
  const ts: number[] = []
  for (let t = 0; t < dur - 1e-9; t = Math.round((t + 0.1) * 10) / 10) ts.push(t)
  ts.push(dur)
  const [forward, left, yaw] = path(1)
  return { dur, forward, left, yaw, rise: 0, height: 1, low: 0, peak: dur / 2, travel: ts.map(t => [t, ...path(t / dur)]) }
}
const RIG: Rig = {
  clips: {
    idle: { loop: true },
    walk: { loop: true, gear: 0 },
    dash: {},
    turn: {},
    turnOther: { mirror: 'turn' },
    twitch: {},
    strike: {},
    wave: {},
    strafe: { loop: true, gear: 90 },
    strafeRight: { mirror: 'strafe' },
  },
  roles: { still: 'idle' },
  stances: { a: { idle: 'idle' }, b: { idle: 'idle' } },
  mask: 'Spine1',
  table: {
    idle: measure(2, () => [0, 0, 0]),
    walk: measure(1, u => [1.5 * u, 0, 0]),
    dash: measure(1, u => [2 * u, 0, 0]),
    turn: measure(1, u => [0.2 * u, 0, 180 * u]),
    twitch: measure(0.5, u => [0, 0, 10 * u]),
    strike: measure(1, () => [0, 0, 0]),
    wave: measure(1, () => [0, 0, 0]),
    strafe: measure(1, u => [0, u, 0]),
  },
  meshes: { sword: 'Sword', shield: 'Shield$' },
  show: { a: ['sword', 'shield'], b: ['sword'] },
}
const READS = { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' }
const ANIM: Numbers = { still: 0.05, shift: 0.75, leap: 0.5, landFall: 7.5, moves: 0.05, turns: 30, kinds: { hero: { rig: 'rig', model: 'paladin', glb: 'bytes', fade: 0.2, reads: READS } } }

// The model three's loader reads, and the glb's bytes it read it from, which the server poses by.
let gltf: Awaited<ReturnType<typeof glbOf>>['gltf']
let bytes: Uint8Array
beforeAll(async () => {
  ;({ gltf, bytes } = await glbOf(body(), Object.entries(KEYS).map(([name, [dur, keys]]) => clip(name, dur, keys))))
})

// ---------------------------------------------------------------- the page

// A prop: a gun whose barrel runs 0.4 m down its −z to a `muzzle` empty, modelled in metres, and a
// scabbard. The loader hands out a clone of each, sharing its materials, as its own `model` does.
const GUN = new THREE.Group()
GUN.name = 'gun'
const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.4), new THREE.MeshStandardMaterial({ name: 'gunmetal' }))
barrel.position.set(0, 0, -0.2)
barrel.name = 'Barrel'
const muzzle = new THREE.Object3D()
muzzle.name = 'muzzle'
muzzle.position.set(0, 0, -0.4)
GUN.add(barrel, muzzle)
const SCABBARD = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 0.02), new THREE.MeshStandardMaterial({ name: 'leather' }))
SCABBARD.name = 'scabbard'
const PROPS: Record<string, THREE.Object3D> = { gun: GUN, scabbard: SCABBARD }

let files = 0
function page(o: { rig?: Rig; numbers?: Numbers; rows?: Record<string, unknown>[]; landed?: boolean; waiting?: string[]; plugins?: string[] } = {}) {
  const url = `test/anim-plugin/${++files}.json`
  written(url, JSON.stringify(o.rig ?? RIG))
  written('test/anim-plugin/paladin.glb', bytes)
  const scene = {
    plugins: o.plugins,
    world: { anim: structuredClone(o.numbers ?? ANIM), loader: { assets: { rig: { type: 'json', url, preload: true }, paladin: { type: 'model', url: 'paladin.glb' }, bytes: { type: 'binary', url: 'test/anim-plugin/paladin.glb', preload: true } } } },
    prefabs: { loader: {} },
  } as unknown as Scene
  const rows: Row[] = (o.rows ?? [{}]).map((data, i) => ({ id: 2 + i, kind: 'hero', data: { pos: [0, 0, 0], yaw: 0, ...data } }))
  const asked: string[] = []
  const models: THREE.Object3D[] = []
  let landed = o.landed ?? true
  const waiting = new Set(o.waiting)
  const r3 = render3d()
  const dress = vi.spyOn(r3, 'dress')
  const plugins: any = {
    wire: { n: 1, rows, scene },
    render3d: r3,
    loader: {
      ready: (name: string) => landed && !waiting.has(name),
      load: (name: string) => { asked.push(name); return Promise.resolve() },
      model: (name: string) => {
        if (PROPS[name]) return { scene: PROPS[name].clone(), animations: [] }
        const m = { scene: SkeletonUtils.clone(gltf.scene), animations: gltf.animations }
        models.push(m.scene)
        return m
      },
    },
  }
  const me = anim()
  return {
    me, plugins, rows, url, row: (id = 2) => rows.find(r => r.id === id)!, frame: () => me.tick(plugins), asked, models, dress,
    land: (name?: string) => { if (name === undefined) landed = true; else waiting.delete(name) },
  }
}
const bone = (root: THREE.Object3D, name: string) => root.getObjectByName(`mixamorig${name}`)!
// The value a clip's keys give a track at t, one of its key times.
const key = (name: string, track: string, t: number) => {
  const [dur, keys] = KEYS[name]
  return keys(t / dur)[track]
}
// Two quaternions for one turn: q and −q are the same, and angleTo is blind near 0, so the components.
const same = (a: THREE.Quaternion, b: THREE.Quaternion, digits = 6) => {
  const s = Math.sign(a.dot(b)) || 1
  a.toArray().forEach((x, i) => expect(x).toBeCloseTo(s * b.toArray()[i], digits))
}
const near = (a: THREE.Vector3, b: THREE.Vector3, digits = 4) => {
  expect(a.x).toBeCloseTo(b.x, digits)
  expect(a.y).toBeCloseTo(b.y, digits)
  expect(a.z).toBeCloseTo(b.z, digits)
}

// ---------------------------------------------------------------- tests

test('one model per row, at the row\'s pos and yaw, asked of the loader once and drawn once it lands', () => {
  const p = page({ rows: [{ pos: [3, 1, -2], yaw: 0.7 }, {}], landed: false })
  p.frame()
  p.frame()
  expect(p.asked).toEqual(['paladin'])
  expect(p.me.model(2)).toBeUndefined()
  p.land()
  p.frame()
  const m = p.me.model(2)!
  expect(m).toBe(p.models[0])
  expect(p.me.model(3)).toBe(p.models[1])
  expect(m.parent).toBe(p.plugins.render3d.scene)
  expect(m.position.toArray()).toEqual([3, 1, -2])
  expect(m.rotation.y).toBeCloseTo(0.7, 12)
  p.frame()
  expect(p.models.length).toBe(2)
})

test('every material is dressed once, and every mesh casts and takes shadows', () => {
  const p = page({ rows: [{}, {}] })
  p.frame()
  p.frame()
  const materials = new Set<THREE.Material>()
  p.me.model(2)!.traverse(o => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    expect([mesh.castShadow, mesh.receiveShadow]).toEqual([true, true])
    materials.add(mesh.material as THREE.Material)
  })
  expect(materials.size).toBe(2)
  expect(p.dress.mock.calls.map(c => c[0]).sort((a, b) => a.name.localeCompare(b.name))).toEqual([...materials].sort((a, b) => a.name.localeCompare(b.name)))
})

test('the mixer shows the row\'s clip at full weight, at the row\'s playhead, the clip moved to start at 0', () => {
  const p = page({ rows: [{ clip: 'strike', clipT: 0.4, blend: 1, from: 'idle', fromT: 1 }] })
  p.frame()
  const m = p.me.model(2)!
  same(bone(m, 'Spine1').quaternion, key('strike', 'mixamorigSpine1.quaternion', 0.4) as THREE.Quaternion)
  same(bone(m, 'RightArm').quaternion, key('strike', 'mixamorigRightArm.quaternion', 0.4) as THREE.Quaternion)
  near(bone(m, 'Spine1').position, key('strike', 'mixamorigSpine1.position', 0.4) as THREE.Vector3)
  // At 0 it is the clip's first key, which the file holds a frame in.
  Object.assign(p.row().data, { clipT: 0 })
  p.frame()
  same(bone(m, 'RightArm').quaternion, key('strike', 'mixamorigRightArm.quaternion', 0) as THREE.Quaternion)
  // A row with no anim fields stands in its stance's still role at 0.
  const fresh = page()
  fresh.frame()
  same(bone(fresh.me.model(2)!, 'Spine1').quaternion, key('idle', 'mixamorigSpine1.quaternion', 0) as THREE.Quaternion)
})

test('the base crossfade: the row\'s clip at blend, from frozen at fromT at the rest, and a clip fading into itself drawn at both its times', () => {
  const p = page({ rows: [{ clip: 'strike', clipT: 0.2, blend: 0.3, from: 'wave', fromT: 0.6 }] })
  p.frame()
  const m = p.me.model(2)!
  const at = (clip: string, t: number) => key(clip, 'mixamorigSpine1.position', t) as THREE.Vector3
  near(bone(m, 'Spine1').position, at('strike', 0.2).multiplyScalar(0.3).add(at('wave', 0.6).multiplyScalar(0.7)))
  same(bone(m, 'LeftArm').quaternion, (key('wave', 'mixamorigLeftArm.quaternion', 0.6) as THREE.Quaternion).slerp(key('strike', 'mixamorigLeftArm.quaternion', 0.2) as THREE.Quaternion, 0.3))
  Object.assign(p.row().data, { from: 'strike', fromT: 0.8 })
  p.frame()
  near(bone(m, 'Spine1').position, at('strike', 0.2).multiplyScalar(0.3).add(at('strike', 0.8).multiplyScalar(0.7)))
})

test('the upper layer holds its share of every masked bone and none of the rest; two gestures share it by their weights', () => {
  const p = page({ rows: [{ clip: 'idle', clipT: 0.5, upper: 'strike', upperT: 0.3, upperW: 0.4 }] })
  p.frame()
  const m = p.me.model(2)!
  const at = (clip: string, track: string, t: number) => key(clip, `mixamorig${track}`, t)
  // Masked: Spine1 and the arms under it.
  near(bone(m, 'Spine1').position, (at('idle', 'Spine1.position', 0.5) as THREE.Vector3).lerp(at('strike', 'Spine1.position', 0.3) as THREE.Vector3, 0.4))
  same(bone(m, 'RightArm').quaternion, (at('idle', 'RightArm.quaternion', 0.5) as THREE.Quaternion).slerp(at('strike', 'RightArm.quaternion', 0.3) as THREE.Quaternion, 0.4))
  // Not masked: the hips are the idle's, pinned to its sway, which at 0.5 of a still loop is the clip's own.
  near(bone(m, 'Hips').position, at('idle', 'Hips.position', 0.5) as THREE.Vector3)
  // Two gestures of shares 0.3 and 0.2 hold 0.5 between them, 3 to 2.
  Object.assign(p.row().data, { upperW: 0.3, was: 'wave', wasT: 0.9, wasW: 0.2 })
  p.frame()
  const want = (at('idle', 'Spine1.position', 0.5) as THREE.Vector3).multiplyScalar(0.5)
    .add((at('strike', 'Spine1.position', 0.3) as THREE.Vector3).multiplyScalar(0.3))
    .add((at('wave', 'Spine1.position', 0.9) as THREE.Vector3).multiplyScalar(0.2))
  near(bone(m, 'Spine1').position, want)
  // Shares past 0.999 hold 0.999.
  Object.assign(p.row().data, { upperW: 1, wasW: 0.5 })
  p.frame()
  const top = (at('idle', 'Spine1.position', 0.5) as THREE.Vector3).multiplyScalar(0.001)
    .add((at('strike', 'Spine1.position', 0.3) as THREE.Vector3).multiplyScalar(0.999 * 2 / 3))
    .add((at('wave', 'Spine1.position', 0.9) as THREE.Vector3).multiplyScalar(0.999 / 3))
  near(bone(m, 'Spine1').position, top)
  // A rig with no mask draws no upper layer.
  const bare = page({ rig: { ...RIG, mask: undefined }, rows: [{ clip: 'idle', clipT: 0.5, upper: 'strike', upperT: 0.3, upperW: 0.4 }] })
  bare.frame()
  near(bone(bare.me.model(2)!, 'Spine1').position, at('idle', 'Spine1.position', 0.5) as THREE.Vector3)
})

test('a one-shot that carries travel has its hips at bind across the ground, their height its own', () => {
  const p = page({ rows: [{ clip: 'dash', clipT: 0.5, pos: [4, 0, 7], yaw: 1.1 }] })
  p.frame()
  const m = p.me.model(2)!
  const hips = bone(m, 'Hips')
  near(hips.position, v(0, 0, -95 - 5))
  const world = hips.getWorldPosition(new THREE.Vector3())
  expect(world.x).toBeCloseTo(4, 9)
  expect(world.z).toBeCloseTo(7, 9)
  expect(world.y).toBeCloseTo(1, 5)
})

test('a loop has its hips at bind plus their sway about the clip\'s steady progress', () => {
  const p = page({ rows: [{ clip: 'walk', clipT: 0.2 }] })
  p.frame()
  const hips = bone(p.me.model(2)!, 'Hips')
  // walk's hips run 150u forward (+y) with a 3 sin 2πu sway and a bob: the forward run is taken off.
  near(hips.position, v(3 * Math.sin(TAU * 0.2), 0, -95 + 2 * Math.cos(2 * TAU * 0.2)))
  // A mirrored strafe sways the other way, its steady progress to the right taken off.
  Object.assign(p.row().data, { clip: 'strafeRight', clipT: 0.3 })
  p.frame()
  near(hips.position, v(0, 2 * Math.sin(TAU * 0.3), -95))
})

test('a one-shot that carries no travel is drawn as its clip draws it', () => {
  const p = page({ rows: [{ clip: 'strike', clipT: 0.2 }] })
  p.frame()
  near(bone(p.me.model(2)!, 'Hips').position, key('strike', 'mixamorigHips.position', 0.2) as THREE.Vector3)
  // twitch turns 10°, under turns: its hips keep their own turn.
  Object.assign(p.row().data, { clip: 'twitch', clipT: 0.3 })
  p.frame()
  same(bone(p.me.model(2)!, 'Hips').quaternion, key('twitch', 'mixamorigHips.quaternion', 0.3) as THREE.Quaternion)
})

test('a turn has its hips\' yaw taken off, about the vertical read from the armature, so the row\'s yaw draws the turn once', () => {
  const p = page({ rows: [{ clip: 'turn', clipT: 0.6, yaw: 0.4 }] })
  p.frame()
  const hips = bone(p.me.model(2)!, 'Hips')
  same(hips.quaternion, HIPS_REST)
  near(hips.position, v(0, 0, -95))
  // Its hips face the row's yaw in the world.
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(hips.getWorldQuaternion(new THREE.Quaternion()))
  const rest = page()
  rest.frame()
  const restFacing = new THREE.Vector3(0, 0, 1).applyQuaternion(bone(rest.me.model(2)!, 'Hips').getWorldQuaternion(new THREE.Quaternion()))
  near(facing, restFacing.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.4), 6)
})

test('a mirrored turn has its hips\' yaw taken off too, and draws the mirror of the turn\'s rest', () => {
  const p = page({ rows: [{ clip: 'turnOther', clipT: 0.6, yaw: -0.4 }] })
  p.frame()
  const hips = bone(p.me.model(2)!, 'Hips')
  same(hips.quaternion, new THREE.Quaternion(HIPS_REST.x, -HIPS_REST.y, -HIPS_REST.z, HIPS_REST.w))
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(hips.getWorldQuaternion(new THREE.Quaternion()))
  const rest = page()
  rest.frame()
  const restFacing = new THREE.Vector3(0, 0, 1).applyQuaternion(bone(rest.me.model(2)!, 'Hips').getWorldQuaternion(new THREE.Quaternion()))
  near(facing, restFacing.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.4), 6)
})

test('each clip\'s share of the hips is where that clip draws them, so a crossfade eases', () => {
  const p = page({ rows: [{ clip: 'dash', clipT: 0.5, blend: 0.25, from: 'walk', fromT: 0.2 }] })
  p.frame()
  const walk = v(3 * Math.sin(TAU * 0.2), 0, -95 + 2 * Math.cos(2 * TAU * 0.2))
  const dash = v(0, 0, -100)
  near(bone(p.me.model(2)!, 'Hips').position, walk.multiplyScalar(0.75).add(dash.multiplyScalar(0.25)))
  // The turn's unspun hips against the twitch's own.
  Object.assign(p.row().data, { clip: 'turn', clipT: 0.6, blend: 0.5, from: 'twitch', fromT: 0.3 })
  p.frame()
  same(bone(p.me.model(2)!, 'Hips').quaternion, (key('twitch', 'mixamorigHips.quaternion', 0.3) as THREE.Quaternion).slerp(HIPS_REST, 0.5))
})

// The server reads the same glb's bytes this half's model was read from (`kinds.hero.glb`).
test('the server poses every bone off the glb where this half draws it: a crossfade, two gestures sharing the upper body, a turn\'s hips unspun, a carried one-shot\'s and a loop\'s hips pinned', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['a crossfade', { clip: 'strike', clipT: 0.2, blend: 0.3, from: 'wave', fromT: 0.6 }],
    ['two gestures', { clip: 'idle', clipT: 0.5, upper: 'strike', upperT: 0.3, upperW: 0.4, was: 'wave', wasT: 0.7, wasW: 0.3 }],
    ['a turn', { clip: 'turn', clipT: 0.6, blend: 0.5, from: 'twitch', fromT: 0.3 }],
    ['a carried one-shot from a loop', { clip: 'dash', clipT: 0.5, blend: 0.25, from: 'walk', fromT: 0.2 }],
    ['a mirrored loop', { clip: 'strafeRight', clipT: 0.3 }],
  ]
  for (const [what, data] of cases) {
    const p = page({ rows: [data] })
    p.frame()
    const m = p.me.model(2)!
    m.updateMatrixWorld(true)
    const server = posed(p.plugins.wire, p.row())
    for (const [name, matrix] of server) {
      const drawn = bone(m, name).getWorldPosition(new THREE.Vector3())
      const at = new THREE.Vector3().setFromMatrixPosition(matrix)
      expect(at.distanceTo(drawn), `${what}: ${name}`).toBeLessThan(1e-6)
    }
  }
})

test('a mirrored clip swaps its Left and Right tracks, negates x positions and the quaternions\' y and z', () => {
  const p = page({ rows: [{ clip: 'strafeRight', clipT: 0.5 }] })
  p.frame()
  const m = p.me.model(2)!
  const mirror = (a: THREE.Quaternion) => new THREE.Quaternion(a.x, -a.y, -a.z, a.w)
  same(bone(m, 'RightArm').quaternion, mirror(key('strafe', 'mixamorigLeftArm.quaternion', 0.5) as THREE.Quaternion))
  same(bone(m, 'LeftArm').quaternion, mirror(key('strafe', 'mixamorigRightArm.quaternion', 0.5) as THREE.Quaternion))
  // The hips' own track, x negated: drawn unpinned by a one-shot mirror of it.
  const rig = structuredClone(RIG)
  rig.clips.dashBack = { mirror: 'dash' }
  rig.clips.strikeOther = { mirror: 'strike' }
  const o = page({ rig, rows: [{ clip: 'strikeOther', clipT: 0.2 }] })
  o.frame()
  const own = key('strike', 'mixamorigHips.position', 0.2) as THREE.Vector3
  near(bone(o.me.model(2)!, 'Hips').position, v(-own.x, own.y, own.z))
  same(bone(o.me.model(2)!, 'Spine1').quaternion, mirror(key('strike', 'mixamorigSpine1.quaternion', 0.2) as THREE.Quaternion))
})

test('mesh roles are shown per stance; a mesh of no role is always drawn, and a rig with no show draws every mesh', () => {
  const p = page({ rows: [{ rig: 'a' }] })
  p.frame()
  const m = p.me.model(2)!
  const shown = () => ['Body', 'Sword', 'Shield'].map(n => m.getObjectByName(n)!.visible)
  expect(shown()).toEqual([true, true, true])
  p.row().data.rig = 'b'
  p.frame()
  expect(shown()).toEqual([true, true, false])
  const all = page({ rig: { ...RIG, show: undefined }, rows: [{ rig: 'b' }] })
  all.frame()
  expect(['Body', 'Sword', 'Shield'].map(n => all.me.model(2)!.getObjectByName(n)!.visible)).toEqual([true, true, true])
})

test('a limp row is left alone: its model is not posed or moved', () => {
  const p = page({ rows: [{ clip: 'strike', clipT: 0.3, pos: [1, 0, 1] }] })
  p.frame()
  const m = p.me.model(2)!
  Object.assign(p.row().data, { limp: true, clip: 'wave', clipT: 0.9, pos: [5, 0, 5], yaw: 2 })
  const spine = bone(m, 'Spine1')
  spine.quaternion.set(0.5, 0.5, 0.5, 0.5)
  p.frame()
  expect(spine.quaternion.toArray()).toEqual([0.5, 0.5, 0.5, 0.5])
  expect(m.position.toArray()).toEqual([1, 0, 1])
  expect(p.me.model(2)).toBe(m)
})

test('a row that gets up is drawn from the rest and its clips again: every keyed bone rewritten, every other at its rest', () => {
  const p = page({ rows: [{ clip: 'strike', clipT: 0.3 }] })
  p.frame()
  const m = p.me.model(2)!
  p.row().data.limp = true
  p.frame()
  // The ragdoll turns a keyed bone whose clip value will not move, and a bone no clip keys.
  const arm = bone(m, 'LeftArm'), leg = bone(m, 'LeftUpLeg')
  const legRest = leg.quaternion.clone()
  arm.quaternion.set(0, 1, 0, 0)
  leg.quaternion.set(0, 0, 1, 0)
  p.row().data.limp = false
  p.frame()
  same(arm.quaternion, key('strike', 'mixamorigLeftArm.quaternion', 0.3) as THREE.Quaternion)
  same(leg.quaternion, legRest)
})

test('pose draws the row\'s model in one clip alone at t, from the rest, the same whatever the seat drew before', () => {
  const walked = page({ rows: [{ clip: 'walk', clipT: 0.1, upper: 'strike', upperT: 0.5, upperW: 1, pos: [2, 0, 3], yaw: 0.5 }] })
  for (let n = 0; n < 5; n++) {
    Object.assign(walked.row().data, { clipT: 0.1 * n })
    walked.frame()
  }
  walked.row().data.limp = true
  walked.frame()
  bone(walked.me.model(2)!, 'LeftUpLeg').quaternion.set(0, 0, 1, 0)
  const late = page({ rows: [{ limp: true, pos: [2, 0, 3], yaw: 0.5 }] })
  late.frame()
  const a = walked.me.pose(2, 'dash', 0.4), b = late.me.pose(2, 'dash', 0.4)
  expect(a).toBe(walked.me.model(2))
  const pairs: [THREE.Object3D, THREE.Object3D][] = []
  a.traverse(o => pairs.push([o, b.getObjectByName(o.name)!]))
  expect(pairs.length).toBeGreaterThan(10)
  for (const [x, y] of pairs) {
    near(x.getWorldPosition(new THREE.Vector3()), y.getWorldPosition(new THREE.Vector3()), 9)
    same(x.getWorldQuaternion(new THREE.Quaternion()), y.getWorldQuaternion(new THREE.Quaternion()), 9)
  }
  // The dash alone, pinned as it is: the hips at bind across the ground.
  near(bone(a, 'Hips').position, v(0, 0, -95 - 5 * Math.sin(Math.PI * 0.4)))
  same(bone(a, 'Spine1').quaternion, new THREE.Quaternion())
  expect(a.position.toArray()).toEqual([2, 0, 3])
  // A frame while it lies leaves the pose alone.
  walked.frame()
  near(bone(a, 'Hips').position, v(0, 0, -95 - 5 * Math.sin(Math.PI * 0.4)))
  expect(() => walked.me.pose(9, 'dash', 0)).toThrow('anim has no model for row 9')
})

test('the clips are checked against the rig: a length more than a frame from the table throws, a missing animation throws, an unlisted one is ignored', () => {
  const long = structuredClone(RIG)
  long.table.wave = measure(1.04, () => [0, 0, 0])
  expect(() => page({ rig: long }).frame()).toThrow(/anim: wave lasts (1|0\.99)\d* s in the model paladin, more than a frame from its table's 1\.04 s/)
  const within = structuredClone(RIG)
  within.table.wave = measure(1.03, () => [0, 0, 0])
  expect(() => page({ rig: within }).frame()).not.toThrow()
  const missing = structuredClone(RIG)
  missing.clips.cartwheel = {}
  missing.table.cartwheel = measure(1, () => [0, 0, 0])
  expect(() => page({ rig: missing }).frame()).toThrow('anim: the model paladin has no animation cartwheel')
})

test('a rig file written again is checked again: a table length moved past a frame throws on the next frame', () => {
  const p = page()
  p.frame()
  const long = structuredClone(RIG)
  long.table.wave = measure(1.04, () => [0, 0, 0])
  written(p.url, JSON.stringify(long))
  expect(() => p.frame()).toThrow(/anim: wave lasts (1|0\.99)\d* s in the model paladin, more than a frame from its table's 1\.04 s/)
})

test('a row that ends takes its model off the scene, and close takes every one off', () => {
  const p = page({ rows: [{}, {}] })
  p.frame()
  const [a, b] = [p.me.model(2)!, p.me.model(3)!]
  p.rows.splice(0, 1)
  p.frame()
  expect(a.parent).toBe(null)
  expect(p.me.model(2)).toBeUndefined()
  expect(b.parent).toBe(p.plugins.render3d.scene)
  p.me.close()
  expect(b.parent).toBe(null)
  expect(p.me.model(3)).toBeUndefined()
})

// A game of its own roles and its own mover: its rig calls standing `rest`, which its stance plays as
// `wave`, and its rows carry their place as `at`, their facing as `facing` and their going limp as
// `ragged`, beside `pos`, `yaw` and `limp` fields that mean nothing to it.
test('a rig of other roles on a row of other fields is drawn as the rig and `world.anim` name them', () => {
  const rig: Rig = { ...RIG, roles: { still: 'rest' }, stances: { a: { rest: 'wave' } } }
  const numbers: Numbers = { ...ANIM, kinds: { hero: { ...ANIM.kinds.hero, reads: { pos: 'at', yaw: 'facing', vel: 'v', grounded: 'footed', limp: 'ragged' } } } }
  const p = page({ rig, numbers, rows: [{ at: [4, 0, -1], facing: 1.2, pos: [9, 9, 9], yaw: 3, limp: true }] })
  p.frame()
  const m = p.me.model(2)!
  expect(m.position.toArray()).toEqual([4, 0, -1])
  expect(m.rotation.y).toBeCloseTo(1.2, 12)
  same(bone(m, 'LeftArm').quaternion, key('wave', 'mixamorigLeftArm.quaternion', 0) as THREE.Quaternion)
  // Ragged, it is left alone: neither placed nor posed.
  Object.assign(p.row().data, { ragged: true, at: [0, 0, 0] })
  bone(m, 'LeftArm').quaternion.set(0, 1, 0, 0)
  p.frame()
  expect(m.position.toArray()).toEqual([4, 0, -1])
  expect(bone(m, 'LeftArm').quaternion.toArray()).toEqual([0, 1, 0, 0])
  // A kind whose reads name no field throws.
  const { limp: _, ...partial } = READS
  const blind = page({ numbers: { ...ANIM, kinds: { hero: { ...ANIM.kinds.hero, reads: partial as typeof READS } } } })
  expect(() => blind.frame()).toThrow('anim kinds.hero.reads names no limp')
})

// ---------------------------------------------------------------- the aim

const DEG = Math.PI / 180
const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion())
const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
// A kind that spreads its pitch over Spine, which no clip keys, and Spine1, which every clip keys.
const AIMED: Numbers = { ...ANIM, kinds: { hero: { ...ANIM.kinds.hero, reads: { ...READS, aim: 'look.pitch' }, aim: { bones: { Spine: 0.5, Spine1: 0.5 } } } } }
// The body's right, square to a facing of `yaw`.
const rightOf = (yaw: number) => new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw))
// The same row drawn by a kind with no aim.
const unaimed = (data: Record<string, unknown>) => {
  const p = page({ rows: [data] })
  p.frame()
  return p.me.model(2)!
}

test('the aim turns each listed bone by its share of the pitch about the body\'s right, so a positive pitch raises what faces forward', () => {
  const yaw = 0.7
  const row = { clip: 'strike', clipT: 0.5, yaw }
  const flat = unaimed(row)
  const p = page({ numbers: AIMED, rows: [{ ...row, look: { pitch: 0.4 } }] })
  p.frame()
  const m = p.me.model(2)!
  const turn = (a: number) => q(rightOf(yaw), a)
  // Spine takes half the pitch, Spine1 the other half, and everything under Spine1 the whole of it.
  same(wq(bone(m, 'Spine')), turn(0.2).multiply(wq(bone(flat, 'Spine'))))
  same(wq(bone(m, 'Spine1')), turn(0.4).multiply(wq(bone(flat, 'Spine1'))))
  same(wq(bone(m, 'RightHand')), turn(0.4).multiply(wq(bone(flat, 'RightHand'))))
  same(wq(bone(m, 'Hips')), wq(bone(flat, 'Hips')))
  same(wq(bone(m, 'LeftUpLeg')), wq(bone(flat, 'LeftUpLeg')))
  // The body's forward, carried by the chest, rises by the pitch and stays over the body's facing.
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw))
  const chest = (o: THREE.Object3D) => forward.clone().applyQuaternion(wq(bone(flat, 'Spine1')).invert()).applyQuaternion(wq(bone(o, 'Spine1')))
  const up = chest(m)
  expect(up.y).toBeCloseTo(Math.sin(0.4), 9)
  expect(up.dot(rightOf(yaw))).toBeCloseTo(0, 9)
  // A negative pitch lowers it.
  p.row().data.look = { pitch: -0.3 }
  p.frame()
  expect(chest(m).y).toBeCloseTo(-Math.sin(0.3), 9)
  // What the hand holds turns with it: a gun hung 0.3 m ahead of the hand, its barrel along the
  // body's forward, rises at the muzzle.
  const hand = wq(bone(flat, 'RightHand')).invert()
  const along = new THREE.Euler().setFromQuaternion(hand.clone().multiply(new THREE.Quaternion().setFromUnitVectors(v(0, 0, -1), forward)), 'XYZ')
  const armed: Numbers = { ...AIMED, kinds: { hero: { ...AIMED.kinds.hero, props: [{ model: 'gun', bone: 'RightHand', at: forward.clone().multiplyScalar(0.3).applyQuaternion(hand).toArray(), turn: [along.x / DEG, along.y / DEG, along.z / DEG] }] } } }
  const held = page({ numbers: armed, rows: [{ ...row, look: { pitch: 0 } }] })
  held.frame()
  const muzzleAt = () => wp(held.me.props(2)[0].getObjectByName('muzzle')!)
  const [spine, spine1] = ['Spine', 'Spine1'].map(n => wp(bone(held.me.model(2)!, n)))
  const about = (p: THREE.Vector3, pivot: THREE.Vector3, a: number) => p.clone().sub(pivot).applyAxisAngle(rightOf(yaw), a).add(pivot)
  const level = muzzleAt()
  held.row().data.look = { pitch: 0.4 }
  held.frame()
  const raised = muzzleAt()
  // Spine1's half about its own pivot, then Spine's half about Spine's, which carries Spine1 with it.
  near(raised, about(about(level, spine1, 0.2), spine, 0.2), 7)
  expect(level.clone().sub(spine1).dot(forward)).toBeGreaterThan(0.1)
  expect(raised.y - level.y).toBeGreaterThan(0.05)
})

test('the aim is never piled on the frame before\'s: a clip that stands still keeps one turn, and pitch 0 or no field draws the mixer\'s pose', () => {
  const row = { clip: 'strike', clipT: 0.5 }
  const flat = unaimed(row)
  const p = page({ numbers: AIMED, rows: [{ ...row, look: { pitch: 0.3 } }] })
  p.frame()
  const m = p.me.model(2)!
  const first = ['Spine', 'Spine1'].map(n => bone(m, n).quaternion.clone())
  for (let n = 0; n < 60; n++) p.frame()
  ;['Spine', 'Spine1'].forEach((n, i) => same(bone(m, n).quaternion, first[i], 9))
  same(wq(bone(m, 'Spine1')), q(rightOf(0), 0.3).multiply(wq(bone(flat, 'Spine1'))))
  // A playhead that moves is aimed from each frame's own pose.
  for (const t of [0.1, 0.2, 0.3]) {
    Object.assign(p.row().data, { clipT: t })
    p.frame()
    same(wq(bone(m, 'Spine1')), q(rightOf(0), 0.3).multiply(wq(bone(unaimed({ clip: 'strike', clipT: t }), 'Spine1'))))
  }
  Object.assign(p.row().data, row)
  p.frame()
  // A pitch of 0, and a row without the field, are the mixer's pose.
  p.row().data.look = { pitch: 0 }
  p.frame()
  for (const n of ['Spine', 'Spine1']) same(bone(m, n).quaternion, bone(flat, n).quaternion, 9)
  p.row().data.look = { pitch: 0.3 }
  p.frame()
  delete p.row().data.look
  p.frame()
  p.frame()
  for (const n of ['Spine', 'Spine1']) same(bone(m, n).quaternion, bone(flat, n).quaternion, 9)
  // A kind with no aim reads no pitch.
  const plain = page({ numbers: { ...ANIM, kinds: { hero: { ...ANIM.kinds.hero, reads: { ...READS, aim: 'look.pitch' } } } }, rows: [{ ...row, look: { pitch: 0.3 } }] })
  plain.frame()
  for (const n of ['Spine', 'Spine1']) same(bone(plain.me.model(2)!, n).quaternion, bone(flat, n).quaternion, 9)
})

test('a limp row and pose are not aimed, and a row that gets up is aimed from its clips again', () => {
  const p = page({ numbers: AIMED, rows: [{ clip: 'strike', clipT: 0.5, look: { pitch: 0.3 } }] })
  p.frame()
  const m = p.me.model(2)!
  p.row().data.limp = true
  const spine = bone(m, 'Spine')
  spine.quaternion.set(0.5, 0.5, 0.5, 0.5)
  p.frame()
  expect(spine.quaternion.toArray()).toEqual([0.5, 0.5, 0.5, 0.5])
  p.me.pose(2, 'strike', 0.5)
  const flat = unaimed({ clip: 'strike', clipT: 0.5 })
  for (const n of ['Spine', 'Spine1']) same(bone(m, n).quaternion, bone(flat, n).quaternion, 9)
  p.row().data.limp = false
  p.frame()
  same(wq(bone(m, 'Spine1')), q(rightOf(0), 0.3).multiply(wq(bone(flat, 'Spine1'))))
})

test('an aim with no field to read, a bone no suffix names, and a reads.aim that is no name throw', () => {
  const row = [{ look: { pitch: 0.1 } }]
  expect(() => page({ numbers: { ...AIMED, kinds: { hero: { ...AIMED.kinds.hero, reads: READS } } }, rows: row }).frame()).toThrow('anim kinds.hero has an aim, and its reads name no aim')
  expect(() => page({ numbers: { ...AIMED, kinds: { hero: { ...AIMED.kinds.hero, aim: { bones: { Chest: 1 } } } } }, rows: row }).frame()).toThrow('anim: the model paladin has no bone ending Chest')
  expect(() => page({ numbers: { ...AIMED, kinds: { hero: { ...AIMED.kinds.hero, reads: { ...READS, aim: 3 as unknown as string } } } }, rows: row }).frame()).toThrow('anim kinds.hero.reads.aim is no field name')
})

// ---------------------------------------------------------------- props

const GUN_AT = [0.1, 0.02, -0.05], GUN_TURN = [10, -20, 90]
const ARMED: Numbers = {
  ...ANIM,
  kinds: { hero: { ...ANIM.kinds.hero, props: [{ model: 'gun', bone: 'RightHand', at: GUN_AT, turn: GUN_TURN }, { model: 'scabbard', bone: 'Hips', at: [0.2, 0, 0], turn: [0, 0, 0] }] } },
}
// A prop at its bone's world place and turn, times its offset, at a scale of 1.
function hangs(prop: THREE.Object3D, at: THREE.Object3D, offset: number[], turn: number[]) {
  const q = wq(at)
  near(wp(prop), wp(at).add(new THREE.Vector3().fromArray(offset).applyQuaternion(q)), 9)
  same(wq(prop), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(turn[0] * DEG, turn[1] * DEG, turn[2] * DEG, 'XYZ'))), 9)
  near(prop.getWorldScale(new THREE.Vector3()), v(1, 1, 1), 9)
}

test('props: each row\'s own clones, in the kind\'s order, made once all have landed, hung at the bone with its scale taken off', () => {
  const p = page({ numbers: ARMED, rows: [{ clip: 'strike', clipT: 0.2, pos: [3, 0, 1], yaw: 0.5 }, {}], waiting: ['gun'] })
  p.frame()
  p.frame()
  expect(p.me.props(2)).toEqual([])
  expect(p.asked).toEqual(['gun'])
  p.land('gun')
  p.frame()
  const [gun, scabbard] = p.me.props(2)
  expect([gun.name, scabbard.name]).toEqual(['gun', 'scabbard'])
  expect(p.me.props(3)[0]).not.toBe(gun)
  expect(p.me.props(9)).toEqual([])
  expect(gun.parent).toBe(p.plugins.render3d.scene)
  const m = p.me.model(2)!
  const hand = bone(m, 'RightHand')
  expect(hand.getWorldScale(new THREE.Vector3()).x).toBeCloseTo(0.01, 9)
  hangs(gun, hand, GUN_AT, GUN_TURN)
  hangs(scabbard, bone(m, 'Hips'), [0.2, 0, 0], [0, 0, 0])
  // In metres: the muzzle is 0.4 m down the barrel.
  expect(wp(gun.getObjectByName('muzzle')!).distanceTo(wp(gun))).toBeCloseTo(0.4, 9)
  // It follows the hand as the clip moves it, placed by the tick for the actors after it.
  const before = wp(gun)
  Object.assign(p.row().data, { clipT: 0.8, pos: [4, 0, 1] })
  p.frame()
  expect(wp(gun).distanceTo(before)).toBeGreaterThan(0.5)
  hangs(gun, hand, GUN_AT, GUN_TURN)
  // Dressed once for both rows, casting and taking shadows as the body does.
  const materials = p.dress.mock.calls.map(c => (c[0] as THREE.Material).name)
  expect(materials.filter(n => n === 'gunmetal' || n === 'leather').sort()).toEqual(['gunmetal', 'leather'])
  const barrel = gun.getObjectByName('Barrel') as THREE.Mesh
  expect([barrel.castShadow, barrel.receiveShadow, (scabbard as THREE.Mesh).castShadow, (scabbard as THREE.Mesh).receiveShadow]).toEqual([true, true, true, true])
})

test('a prop follows its bone while the row is limp: afterTick places it after whatever wrote the bones in the ticks before', () => {
  const p = page({ numbers: ARMED, rows: [{ clip: 'strike', clipT: 0.2 }] })
  p.frame()
  const [gun] = p.me.props(2)
  const m = p.me.model(2)!
  p.row().data.limp = true
  p.frame()
  // A ragdoll's tick, after anim's, throws the arm up and moves the body.
  const arm = bone(m, 'RightArm')
  arm.quaternion.setFromAxisAngle(Z, 1.3)
  m.position.set(2, 0, -3)
  m.updateMatrixWorld(true)
  const hand = bone(m, 'RightHand')
  const stale = wp(gun)
  p.me.afterTick()
  expect(wp(gun).distanceTo(stale)).toBeGreaterThan(1)
  hangs(gun, hand, GUN_AT, GUN_TURN)
  expect(p.me.props(2)[0]).toBe(gun)
})

test('props go with their row and on close, are made again when the kind\'s props change, and a bone no suffix names throws', () => {
  const p = page({ numbers: ARMED, rows: [{}, {}] })
  p.frame()
  const [a, b] = [p.me.props(2), p.me.props(3)]
  // Written in place, as the editor writes a scene: the gun moves and is made again.
  p.plugins.wire.scene.world.anim.kinds.hero.props[0].at = [0, 0, 0.3]
  p.frame()
  const moved = p.me.props(2)[0]
  expect(moved).not.toBe(a[0])
  expect(a[0].parent).toBe(null)
  hangs(moved, bone(p.me.model(2)!, 'RightHand'), [0, 0, 0.3], GUN_TURN)
  p.rows.splice(0, 1)
  p.frame()
  expect([moved.parent, p.me.props(2)]).toEqual([null, []])
  const left = p.me.props(3)
  expect(left[0]).not.toBe(b[0])
  expect(left.every(o => o.parent === p.plugins.render3d.scene)).toBe(true)
  p.me.close()
  expect(left.map(o => o.parent)).toEqual([null, null])
  expect(p.me.props(3)).toEqual([])
  const tail: Numbers = { ...ANIM, kinds: { hero: { ...ANIM.kinds.hero, props: [{ model: 'gun', bone: 'Tail', at: [0, 0, 0], turn: [0, 0, 0] }] } } }
  expect(() => page({ numbers: tail }).frame()).toThrow('anim: the model paladin has no bone ending Tail')
})

test('anim must come before render3d in the scene\'s plugins, or render3d would draw the props a frame late', () => {
  expect(() => page({ numbers: ARMED, plugins: ['loader', 'render3d', 'anim'] }).frame()).toThrow("anim must come before render3d in the scene's plugins, so its props are hung before the frame is drawn")
  expect(() => page({ numbers: ARMED, plugins: ['loader', 'anim', 'ragdoll3d', 'render3d'] }).frame()).not.toThrow()
})
