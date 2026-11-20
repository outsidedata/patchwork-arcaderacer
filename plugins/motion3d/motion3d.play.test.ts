// motion3d's playing on a scene this test writes, `world.motion3d.kinds` with one body, its rig file and
// its motion3d file handed to the loader: a pose, its clip held at its frame, faded into as a clip is; and
// `posed` on a glb the test builds, kept while nothing it is posed from changes and made again when the
// row's parts, the rig file or the motion3d file do.
import { beforeAll, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { loader, written } from '#plugins/loader/loader.sim.ts'
import { animate, decayed, downOf, inStep, open, partsOf, play, pose, posed, secondsIn, timesOf } from './motion3d.play.ts'

const measure = (dur: number) => ({ dur, forward: 0, left: 0, yaw: 0, travel: [[0, 0, 0, 0], [dur, 0, 0, 0]] })
const RIG = {
  clips: { idle: { loop: true }, kick: {} },
  roles: {},
  table: { idle: measure(2), kick: measure(1.2) },
  poses: { chamber: { clip: 'kick', frame: 12, at: 0.4 }, extend: { clip: 'kick', frame: 21, at: 0.7 } },
}
const READS = { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'limp' }

function world() {
  written('test/motion3d-play/rig.json', JSON.stringify(RIG))
  written('test/motion3d-play/motion.json', JSON.stringify({ moves: 0.05, turns: 30 }))
  const asset = (url: string) => ({ type: 'json', url, preload: true })
  const scene: Scene = {
    world: {
      motion3d: { kinds: { body: { rig: 'rig', motion: 'motion', model: 'model', fade: 0.2, blend: 'cross', reads: READS } } },
      loader: { assets: { rig: asset('test/motion3d-play/rig.json'), motion: asset('test/motion3d-play/motion.json') } },
    },
    prefabs: { loader: {}, body: { pos: [0, 0, 0], yaw: 0 }, probe: {} },
    actors: [{ is: 'loader' }, { is: 'body' }, { is: 'probe' }],
  }
  let w!: W
  const t = boot(scene, { loader, body: {}, probe: { before(_me, _dt, got) { w = got } } })
  t.step(0)
  const row = t.rows.find(r => r.kind === 'body') as Row
  return { w, row, d: row.data, step: () => animate(row, w, 1 / 60) }
}

test('a pose is its clip held at its frame: the playhead at its time, not moving, and faded into as a clip is', () => {
  const { w, row, d, step } = world()
  play(row, 'idle')
  step()
  pose(row, w, 'chamber')
  expect([d.clip, d.clipT, d.rate, d.state, d.from, d.blend]).toEqual(['kick', 0.4, 0, 'act', 'idle', 0])
  for (let i = 0; i < 120; i++) step()
  expect([d.clip, d.clipT, d.state, d.blend]).toEqual(['kick', 0.4, 'act', 1])
  // A pose of the same clip fades from the one before it, at its own time.
  pose(row, w, 'extend')
  expect([d.clip, d.clipT, d.from, d.fromT, d.blend]).toEqual(['kick', 0.7, 'kick', 0.4, 0])
  expect(() => pose(row, w, 'dab')).toThrow('motion3d: body\'s rig has no pose dab')
})

// ---------------------------------------------------------------- moments

// A body whose `kick` swings its right foot fastest between its frames 6 and 7, whose `hop` stands on
// both feet to 0.3 s and 0.4 s, and comes down on its left at 0.9 s, and whose `vault` holds its left
// hand still in the air from 0.1 s, plants its right on a box at 0.6 s and its left at 0.5 s; and two
// loops a second long, `stride`, its left ankle down from 0.3 s to 0.5 s, and `side`, from 0.7 s to 0.8 s,
// each a centimetre lower in the middle of it.
function measured() {
  const frames = 12, fps = 10
  const still = Array.from({ length: frames }, () => [0, 1, 0, 0, 0.5, 0])
  const swung = still.map((r, f) => (f === 7 ? [0, 1, 0, 0, 0.5, 0.6] : f > 7 ? [0, 1, 0, 0, 0.5, 0.6] : r))
  const plant = (point: string, from: number, to: number, on = 'ground') => ({ point, from, to, at: [0, 0, 0], on })
  // A second's lap, its last frame its first again; a left ankle 0.3 m up but on the frames given, 0.08 m
  // up there and 0.07 m in the middle of them.
  const lap = Array.from({ length: 11 }, () => [0, 0.3, 0, 0, 0.1, 0.1])
  const ankle = (down: number[]) => lap.map((r, f) => (down.includes(f) ? [0, f === down[Math.floor(down.length / 2)] ? 0.07 : 0.08, 0, 0, 0, 0.1] : r))
  const rig = {
    clips: {
      kick: { markers: { blow: 'strike', window: ['strike', '100%'] } },
      hop: { markers: { up: 'takeoff', down: 'landing' } },
      idle: { loop: true, markers: { up: 'takeoff', down: 'landing' } },
      vault: { markers: { hand: 'plant', ready: 'plant-0.1' } },
      stride: { loop: true },
      side: { loop: true },
    },
    roles: {},
    table: { kick: measure(1.2), hop: measure(1.2), idle: measure(2), vault: measure(1.2), stride: measure(1), side: measure(1) },
    ends: {
      model: {
        kick: { fps, handL: still, handR: still, footL: still, footR: swung },
        hop: { fps, handL: still, handR: still, footL: still, footR: still },
        idle: { fps, handL: still, handR: still, footL: still, footR: still },
        vault: { fps, handL: still, handR: still, footL: still, footR: still },
        stride: { fps, handL: lap, handR: lap, footL: ankle([3, 4, 5]), footR: lap },
        side: { fps, handL: lap, handR: lap, footL: ankle([7, 8]), footR: lap },
      },
    },
    touches: {
      model: {
        kick: { case: 'kick', loop: false, dur: 1.2, plants: [] },
        hop: { case: 'jump', loop: false, dur: 1.2, plants: [plant('soleL', 0, 0.3), plant('soleR', 0, 0.4), plant('soleL', 0.9, 1.2), plant('soleR', 1, 1.2)] },
        idle: { case: 'idle', loop: true, dur: 2, plants: [plant('soleL', 0, 2), plant('soleR', 0, 2)] },
        vault: { case: 'vault', loop: false, dur: 1.2, plants: [plant('soleL', 0, 0.3), plant('palmL', 0.1, 0.4, 'still'), plant('palmR', 0.6, 0.8, 'ledge'), plant('palmL', 0.5, 0.7, 'ledge')] },
      },
    },
  }
  written('test/motion3d-moments/rig.json', JSON.stringify(rig))
  written('test/motion3d-moments/motion.json', JSON.stringify({ moves: 0.05, turns: 30, down: 0.02 }))
  const asset = (url: string) => ({ type: 'json', url, preload: true })
  const scene: Scene = {
    world: {
      motion3d: { kinds: { body: { rig: 'rig', motion: 'motion', model: 'model', fade: 0.2, blend: 'cross', reads: READS } } },
      loader: { assets: { rig: asset('test/motion3d-moments/rig.json'), motion: asset('test/motion3d-moments/motion.json') } },
    },
    prefabs: { loader: {}, body: { pos: [0, 0, 0], yaw: 0 }, probe: {} },
    actors: [{ is: 'loader' }, { is: 'body' }, { is: 'probe' }],
  }
  let w!: W
  const t = boot(scene, { loader, body: {}, probe: { before(_me, _dt, got) { w = got } } })
  t.step(0)
  return { w, row: t.rows.find(r => r.kind === 'body') as Row }
}

test('a marker at the strike is where the fastest hand or foot moves fastest; the takeoff and the landing are where the feet leave the ground and come down', () => {
  const { w, row } = measured()
  expect(timesOf(w, row, 'kick')).toEqual({ markers: [{ name: 'blow', t: 0.7 }], windows: [{ name: 'window', from: 0.7, to: 1.2 }] })
  expect(timesOf(w, row, 'hop').markers).toEqual([{ name: 'up', t: 0.4 }, { name: 'down', t: 0.9 }])
  // Feet that never leave the ground take off at its start and land at its end.
  expect(timesOf(w, row, 'idle').markers).toEqual([{ name: 'up', t: 0 }, { name: 'down', t: 2 }])
  // The plant is where the first hand comes down on something, a hand held still in the air not among
  // them; moved back by seconds as any moment is.
  const vault = timesOf(w, row, 'vault').markers
  expect(vault.find(m => m.name === 'hand')!.t).toBeCloseTo(0.5, 9)
  expect(vault.find(m => m.name === 'ready')!.t).toBeCloseTo(0.4, 9)
  // A clip whose hands come down on nothing has no plant.
  expect(() => secondsIn(w, row, 'hop', 'warp', 'plant')).toThrow(/hop's warp is at its plant, and neither hand of it is planted on anything/)
  // Crossed as the playhead passes them; the window's close by its name and `.end`.
  play(row, 'kick')
  const crossed: string[] = []
  for (let i = 0; i < 80; i++) crossed.push(...animate(row, w, 1 / 60).markers.map(m => m.name))
  expect(crossed).toEqual(['blow', 'window', 'window.end'])
  expect(open(w, row, 'kick', 0.69)).toEqual([])
  expect(open(w, row, 'kick', 0.7)).toEqual(['window'])
})

// ---------------------------------------------------------------- mixes

test('mixed loops are kept in step by the left foot coming down; a mix shares its clip\'s weight, and fades out with it when another clip plays', () => {
  const { w, row } = measured()
  const d = row.data
  // The left foot comes down where the ankle first stands within `down` of its lowest.
  expect(downOf(w, row, 'stride')).toBeCloseTo(0.3, 9)
  expect(downOf(w, row, 'side')).toBeCloseTo(0.7, 9)
  // 0.2 s on from stride's foot coming down is 0.2 s on from side's, round its lap.
  expect(inStep(w, row, 'stride', 0.5, 'side')).toBeCloseTo(0.9, 9)
  expect(inStep(w, row, 'stride', 0.9, 'side')).toBeCloseTo(0.3, 9)
  expect(() => downOf(w, row, 'kick')).toThrow('motion3d: kick is mixed, and it is no loop')
  // The clip and its mix share the clip's weight.
  play(row, 'stride')
  d.clipT = 0.5
  d.mix = [{ clip: 'side', t: 0.9, w: 0.25 }]
  expect(partsOf(d, false)).toEqual([{ slot: 'to', clip: 'stride', t: 0.5, w: 0.75, bone: undefined }, { slot: 'to', clip: 'side', t: 0.9, w: 0.25, bone: undefined }])
  // Another clip played: the mix frozen with the clip it fades out from, and the new one begun unmixed.
  play(row, 'idle')
  expect([d.from, d.fromT, d.fromMix, d.mix]).toEqual(['stride', 0.5, [{ clip: 'side', t: 0.9, w: 0.25 }], []])
  d.blend = 0.4
  expect(partsOf(d, false)).toEqual([
    { slot: 'to', clip: 'idle', t: 0, w: 0.4, bone: undefined },
    { slot: 'from', clip: 'stride', t: 0.5, w: 0.6 * 0.75, bone: undefined },
    { slot: 'from', clip: 'side', t: 0.9, w: 0.6 * 0.25, bone: undefined },
  ])
})

// ---------------------------------------------------------------- posed

// Three's exporter reads its blobs back with a FileReader, which node does not have.
class Reader {
  result: ArrayBuffer | undefined
  onloadend = () => {}
  readAsArrayBuffer(b: Blob) { void b.arrayBuffer().then(r => { this.result = r; this.onloadend() }) }
}

// A skinned body of four Mixamo-named joints, hips, spine, chest and left arm, and three clips that turn
// each: `idle` and `wave` loops, `kick` a one-shot.
const q = (axis: number[], angle: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis).normalize(), angle)
async function glb(): Promise<Uint8Array> {
  const root = new THREE.Group()
  const bone = (name: string, at: number[], parent?: THREE.Bone) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.fromArray(at)
    parent?.add(b)
    return b
  }
  const hips = bone('mixamorigHips', [0, 1, 0])
  const spine = bone('mixamorigSpine', [0, 0.1, 0], hips)
  const chest = bone('mixamorigSpine1', [0, 0.1, 0], spine)
  const arm = bone('mixamorigLeftArm', [0.1, 0.1, 0], chest)
  const g = new THREE.BoxGeometry(0.3, 1.5, 0.2)
  const n = g.getAttribute('position').count
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : 1)), 4))
  const skinned = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial())
  root.add(skinned, hips)
  skinned.bind(new THREE.Skeleton([hips, spine, chest, arm]))
  const clip = (name: string, dur: number, turn: (u: number) => Record<string, THREE.Quaternion>, move: (u: number) => number[]) => {
    const times = Array.from({ length: 11 }, (_, i) => (i / 10) * dur)
    const keys = times.map((_, i) => turn(i / 10))
    return new THREE.AnimationClip(name, -1, [
      ...Object.keys(keys[0]).map(b => new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, keys.flatMap(k => k[b].toArray()))),
      new THREE.VectorKeyframeTrack('mixamorigHips.position', times, times.flatMap((_, i) => move(i / 10))),
    ])
  }
  const all = (u: number, a: number, b: number, c: number) => ({ mixamorigHips: q([0, 1, 0], a * u), mixamorigSpine1: q([1, 0, 0], b * u), mixamorigLeftArm: q([0, 0, 1], c * u) })
  const clips = [
    clip('idle', 2, u => all(u, 0.1, 0.2, 0.3), u => [0.02 * u, 1, 0]),
    clip('wave', 1, u => all(u, 0.2, -0.4, 1.1), u => [0, 1 + 0.01 * u, 0]),
    clip('kick', 1.2, u => all(u, Math.PI / 2, 0.6, -0.5), u => [0, 1, 0.5 * u]),
  ]
  vi.stubGlobal('FileReader', Reader)
  try {
    return new Uint8Array(await new GLTFExporter().parseAsync(root, { binary: true, animations: clips }) as ArrayBuffer)
  } finally {
    vi.unstubAllGlobals()
  }
}

// The kick's travel turns a quarter, so a motion file whose `turns` is under 90 degrees keeps its turn.
const travelled = (dur: number, yaw: number) => ({ dur, forward: 0.5, left: 0, yaw, travel: [[0, 0, 0, 0], [dur, 0.5, 0, yaw]] })
const POSED = {
  clips: { idle: { loop: true }, wave: { loop: true }, kick: {} },
  roles: {},
  table: { idle: measure(2), wave: measure(1), kick: travelled(1.2, 90) },
}
const MOVES = { moves: 0.05, turns: 30 }
const GLB = 'test/motion3d-posed/body.glb'
// The glb, written once: a write refills every copy read from it, and a row's poses are kept per copy.
beforeAll(async () => { written(GLB, await glb()) })

// A body on a scene of its own, its rig and motion3d files at urls of its own, so writing one scene's
// files leaves every other's as it was.
let scenes = 0
function body(data: Record<string, unknown>, rig: object = POSED, moves: object = MOVES, blend: 'cross' | 'inertial' = 'cross') {
  const at = `test/motion3d-posed/${++scenes}`
  written(`${at}/rig.json`, JSON.stringify(rig))
  written(`${at}/motion.json`, JSON.stringify(moves))
  const asset = (url: string) => ({ type: 'json', url, preload: true })
  const scene: Scene = {
    world: {
      motion3d: { kinds: { body: { rig: 'rig', motion: 'motion', model: 'model', glb: 'glb', fade: 0.2, blend, reads: READS } } },
      loader: { assets: { rig: asset(`${at}/rig.json`), motion: asset(`${at}/motion.json`), glb: { type: 'binary', url: GLB, preload: true } } },
    },
    prefabs: { loader: {}, body: { pos: [0, 0, 0], yaw: 0 }, probe: {} },
    actors: [{ is: 'loader' }, { is: 'body' }, { is: 'probe' }],
  }
  let w!: W
  const t = boot(scene, { loader, body: {}, probe: { before(_me, _dt, got) { w = got } } })
  t.step(0)
  const row = t.rows.find(r => r.kind === 'body') as Row
  Object.assign(row.data, data)
  return { w, row, at, posed: () => posed(w, row) }
}

// Every joint of two poses at the same matrix, to `digits` places.
const samePose = (a: Map<string, THREE.Matrix4>, b: Map<string, THREE.Matrix4>, what: string, digits = 9) => {
  expect([...a.keys()], what).toEqual([...b.keys()])
  for (const [name, m] of a) m.elements.forEach((x, i) => expect(x, `${what}: ${name}[${i}]`).toBeCloseTo(b.get(name)!.elements[i], digits))
}

const PLAYING = { clip: 'kick', clipT: 0.5, blend: 0.6, from: 'idle', fromT: 0.4, upper: 'wave', upperT: 0.3, upperW: 0.5, upperBone: 'Spine1', was: 'idle', wasT: 0.8, wasW: 0.2, wasBone: 'LeftArm' }

test('a row is posed once while nothing it is posed from changes, and posed again when any of its parts does', () => {
  const b = body(PLAYING)
  const first = b.posed()
  expect(b.posed()).toBe(first)
  const changes: [string, Record<string, unknown>][] = [
    ['the playhead', { clipT: 0.6 }],
    ['the blend', { blend: 0.7 }],
    ['the clip faded from', { from: 'wave' }],
    ['its playhead', { fromT: 0.1 }],
    ['the upper gesture', { upper: 'kick' }],
    ['its weight', { upperW: 0.3 }],
    ['the bone it is played from', { upperBone: 'LeftArm' }],
    ['the gesture before it', { was: 'wave' }],
    ['its playhead', { wasT: 0.2 }],
    ['its bone', { wasBone: 'Spine1' }],
    ['the clip', { clip: 'idle', clipT: 1.1 }],
  ]
  let last = first
  for (const [what, change] of changes) {
    Object.assign(b.row.data, change)
    const now = b.posed()
    expect(now, what).not.toBe(last)
    expect(b.posed(), `${what}, asked again`).toBe(now)
    samePose(now, body({ ...b.row.data }).posed(), what)
    last = now
  }
})

// ---------------------------------------------------------------- inertialization

test('an offset decays from where it is at the speed it moves, to nothing by the fade, never past nothing', () => {
  const T = 0.2
  for (const [x0, v0] of [[0.5, 0], [0.5, -1], [0.5, -20], [0.3, 4]]) {
    expect(decayed(x0, v0, T, 0)).toBeCloseTo(x0, 12)
    expect(decayed(x0, v0, T, T)).toBe(0)
    // Its speed at the start: what it moved at, or none where it moved away from nothing.
    const h = 1e-6
    expect((decayed(x0, v0, T, h) - x0) / h).toBeCloseTo(Math.min(0, v0), 3)
    // Down all the way, never past nothing.
    let was = x0
    for (let i = 1; i <= 200; i++) {
      const x = decayed(x0, v0, T, (i / 200) * T)
      expect(x).toBeGreaterThanOrEqual(-1e-12)
      expect(x).toBeLessThanOrEqual(was + 1e-12)
      was = x
    }
  }
  // Nothing to decay, or no time to decay it in: none.
  expect(decayed(0, -1, T, 0.05)).toBe(0)
  expect(decayed(0.5, -1, 0, 0)).toBe(0)
})

test('a kind that inertializes draws the pose the body left in as its clip changes, the clip it went to whole once the fade is through, and between them as it decays', () => {
  // The idle left 0.8 s in, the wave begun 0.3 s in.
  const change = { from: 'idle', t: 0.8, mix: [], rate: 1, to: 'wave', t0: 0.3, mix0: [], rate0: 1 }
  const fields = { clip: 'wave', clipT: 0.3, blend: 0, from: 'idle', fromT: 0.8, state: 'act' }
  const left = body({ clip: 'idle', clipT: 0.8, blend: 1, from: null, state: 'act' }).posed()
  const wave = body({ clip: 'wave', clipT: 0.3, blend: 1, from: null, state: 'act' }).posed()
  // As the clip changes: the pose it left in, every joint, to the rounding of laying the offset on.
  samePose(body({ ...fields, inert: [{ ...change, s: 0 }] }, POSED, MOVES, 'inertial').posed(), left, 'as it changes', 7)
  // Through the fade, the change let go: the wave alone.
  samePose(body({ ...fields, blend: 1, inert: [] }, POSED, MOVES, 'inertial').posed(), wave, 'through the fade')
  // Half way through the fade: the arm turned between where it left and where the wave has it.
  const turnOf = (m: Map<string, THREE.Matrix4>, bone: string) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(m.get(bone)!))
  const half = body({ ...fields, blend: 0.5, inert: [{ ...change, s: 0.5 }] }, POSED, MOVES, 'inertial').posed()
  const gap = turnOf(left, 'LeftArm').angleTo(turnOf(wave, 'LeftArm'))
  expect(gap).toBeGreaterThan(0.1)
  expect(turnOf(half, 'LeftArm').angleTo(turnOf(wave, 'LeftArm'))).toBeLessThan(gap)
  expect(turnOf(half, 'LeftArm').angleTo(turnOf(wave, 'LeftArm'))).toBeGreaterThan(0)
})

test('a kind that gives no blend, or one that is neither cross nor inertial, throws naming it', () => {
  for (const blend of [undefined, 'smooth']) {
    const b = body({ clip: 'idle', clipT: 0.2, blend: 1, state: 'act' })
    ;(b.w.world.motion3d as any).kinds.body.blend = blend
    expect(() => b.posed()).toThrow(`motion3d kind body gives blend ${JSON.stringify(blend)}, which is neither cross nor inertial`)
  }
})

test('an additive layer turns each bone it keys on by the turn its clip makes from its first frame, at its weight, over the pose beneath', () => {
  const base = body({ ...PLAYING, adds: [] })
  const halfway = { name: 'walk.wave', clip: 'wave', t: 0.5, w: 0.5, most: 0.5, loop: true, ending: false, bone: null }
  const laid = body({ ...PLAYING, adds: [halfway] })
  // A joint's turn under its parent, from two joints' matrices in the body's frame.
  const local = (pose: Map<string, THREE.Matrix4>, name: string, parent: string) => {
    const q = new THREE.Quaternion()
    new THREE.Matrix4().copy(pose.get(parent)!).invert().multiply(pose.get(name)!).decompose(new THREE.Vector3(), q, new THREE.Vector3())
    return q
  }
  // The wave turns the chest about x by −0.4 a lap: halfway, −0.2 from its first frame, at half weight −0.1.
  const want = local(base.posed(), 'Spine1', 'Spine').multiply(q([1, 0, 0], -0.1))
  const got = local(laid.posed(), 'Spine1', 'Spine')
  expect(got.angleTo(want)).toBeLessThan(1e-5)
  // From a bone up: laid from the left arm, the chest is as it was.
  const armOnly = body({ ...PLAYING, adds: [{ ...halfway, bone: 'LeftArm' }] })
  expect(local(armOnly.posed(), 'Spine1', 'Spine').angleTo(local(base.posed(), 'Spine1', 'Spine'))).toBeLessThan(1e-6)
  expect(local(armOnly.posed(), 'LeftArm', 'Spine1').angleTo(local(base.posed(), 'LeftArm', 'Spine1'))).toBeGreaterThan(0.1)
})

test('a row standing still is posed again when its rig file or its motion3d file is rewritten', () => {
  const b = body(PLAYING)
  const first = b.posed()
  // The kick's table row turned the other way.
  const turned = { ...POSED, table: { ...POSED.table, kick: travelled(1.2, -90) } }
  written(`${b.at}/rig.json`, JSON.stringify(turned))
  const retabled = b.posed()
  expect(retabled).not.toBe(first)
  samePose(retabled, body(PLAYING, turned).posed(), 'a new table')
  // The kick mirrored from the idle: new clips.
  const mirrored = { ...turned, clips: { ...turned.clips, kick: { mirror: 'idle' } } }
  written(`${b.at}/rig.json`, JSON.stringify(mirrored))
  const reclipped = b.posed()
  expect(reclipped).not.toBe(retabled)
  samePose(reclipped, body(PLAYING, mirrored).posed(), 'new clips')
  // `turns` above the kick's 90 degrees: it keeps its turn no more.
  written(`${b.at}/rig.json`, JSON.stringify(turned))
  const back = b.posed()
  written(`${b.at}/motion.json`, JSON.stringify({ moves: 0.05, turns: 120 }))
  const unturned = b.posed()
  expect(unturned).not.toBe(back)
  samePose(unturned, body(PLAYING, turned, { moves: 0.05, turns: 120 }).posed(), 'new turns')
  expect(b.posed(), 'asked again').toBe(unturned)
})
