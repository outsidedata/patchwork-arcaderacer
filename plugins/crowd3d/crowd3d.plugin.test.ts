// The browser half of crowd3d on render3d with no canvas, on two bodies the test builds of the one
// skeleton: small Mixamo-named skeletons under a Z-up armature scaled to centimetres, two meshes of two
// materials, an idle that sways in place and a walk whose hips travel 150 cm a second. The second body
// is taller, with longer bones and its own rest turns, and its clips are the first's turns from its
// own rest and the first's hips' movement off its own rest, as a Mixamo clip baked onto two bodies
// is. One bake against three's own mixer on both
// bodies, the hips' travel taken off and handed out, the one pool of `poolSize`, a row written into
// its slot once and written again only when it changes course (`since`, clip, speed, heading, the end of
// its line), a clip going on across a new line and a new clip starting afresh, the bodies'
// runs, a full pool, a row of no body or no end to its line, a body of other bones, the order it is listed in, an item on a place of the
// body against the same item as a child of the bone in three, its copies and what each is put
// through, a row's `holding` that names what no item or place has, and `close`.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import type { Row, Scene } from '#engine/engine.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import { crowd3d, type Item, type Numbers } from './crowd3d.plugin.ts'
import { piece } from './crowd3d.sim.ts'
import { drawn } from '#plugins/shapes3d/shapes3d.kinematics3d.ts'
import { written } from '#plugins/loader/loader.sim.ts'

const X = new THREE.Vector3(1, 0, 0)
const Z = new THREE.Vector3(0, 0, 1)
const q = (axis: THREE.Vector3, angle: number) => new THREE.Quaternion().setFromAxisAngle(axis, angle)
const TAU = 2 * Math.PI

// A body's own numbers: its hips' rest height, its bones' lengths and its arm's rest turn.
type Shape = { hips: number; spine: number; arm: number; rest: THREE.Quaternion; names?: string[] }
const BOB: Shape = { hips: 95, spine: 30, arm: 20, rest: new THREE.Quaternion() }
const TALL: Shape = { hips: 110, spine: 36, arm: 26, rest: q(X, 0.3) }
const NAMES = ['mixamorigHips', 'mixamorigSpine', 'mixamorigLeftHand']

// The armature is turned a quarter about x and scaled to centimetres, as an exported Mixamo rig is:
// its +y is the world's +z, the way the body faces, and its −z up.
function body(s: Shape) {
  const names = s.names ?? NAMES
  const root = new THREE.Group()
  const rig = new THREE.Object3D()
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
  const hips = bone(names[0], [0, 0, -s.hips])
  hips.quaternion.copy(q(X, -Math.PI / 2))
  const spine = bone(names[1], [0, s.spine, 0], hips)
  const arm = bone(names[2], [s.arm, 20, 0], spine)
  arm.quaternion.copy(s.rest)
  const bones = [hips, spine, arm]
  rig.add(hips)
  const mesh = (name: string, colour: number, bone: number) => {
    const g = new THREE.BoxGeometry(20, 60, 20)
    const n = g.getAttribute('position').count
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 ? 0 : bone)), 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 ? 0 : 1)), 4))
    const m = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial({ color: colour }))
    m.name = name
    rig.add(m)
    return m
  }
  const meshes = [mesh('Body', 0x886655, 1), mesh('Sleeve', 0x335577, 2)]
  root.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  for (const m of meshes) m.bind(skeleton, m.matrixWorld)
  return root
}

// A body's clips, as a Mixamo clip baked onto each body is: the hips moved the same off its own rest,
// and the arm's turn from its own rest.
const times = (dur: number) => Array.from({ length: 31 }, (_, i) => (i / 30) * dur)
function clips(s: Shape) {
  const hips = (dur: number, f: (u: number) => number[]) =>
    new THREE.VectorKeyframeTrack(`${NAMES[0]}.position`, times(dur), times(dur).flatMap(t => {
      const [x, y, z] = f(t / dur)
      return [x, y, -s.hips + z + BOB.hips]
    }))
  const arm = (dur: number, f: (u: number) => number) =>
    new THREE.QuaternionKeyframeTrack(`${NAMES[2]}.quaternion`, times(dur), times(dur).flatMap(t => s.rest.clone().multiply(q(Z, f(t / dur))).toArray()))
  return [
    new THREE.AnimationClip('idle', 2, [hips(2, u => [2 * Math.sin(TAU * u), 0, -95 + Math.cos(TAU * u)]), arm(2, u => 0.6 * Math.sin(TAU * u))]),
    new THREE.AnimationClip('walk', 1, [hips(1, u => [3 * Math.sin(TAU * u), 150 * u, -95 + 2 * Math.cos(2 * TAU * u)]), arm(1, u => Math.sin(TAU * u))]),
  ]
}
const MODELS: Record<string, { scene: THREE.Object3D; animations: THREE.AnimationClip[] }> = {
  bob: { scene: body(BOB), animations: clips(BOB) },
  tall: { scene: body(TALL), animations: clips(TALL) },
  odd: { scene: body({ ...BOB, names: [NAMES[0], NAMES[1], 'mixamorigRightHand'] }), animations: clips(BOB) },
  cup: { scene: cup(), animations: [] },
}

// An item: a box 4 cm across and 10 cm tall, standing 5 cm up in its glb.
function cup() {
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.04), new THREE.MeshStandardMaterial({ color: 0xffffff }))
  mesh.name = 'Cup'
  mesh.position.set(0, 0.05, 0)
  root.add(mesh)
  return root
}
const CUP: Item = { model: 'cup', leftHand: { at: [0.02, 0.05, -0.03], turn: [0, 90, 30], scale: 0.8 }, hips: { at: [0.1, 0, 0] } }

const NUMBERS: Numbers = { bodies: { bob: 'bob', tall: 'tall' }, clips: ['idle', 'walk'], rate: 30, kinds: ['person'] }
const DT = 1 / 60

async function page(o: { rows?: Row[]; plugins?: string[]; world?: Partial<Numbers>; assets?: Record<string, unknown> } = {}) {
  const scene = {
    plugins: o.plugins ?? ['loader', 'crowd3d', 'render3d'],
    world: { crowd3d: { ...structuredClone(NUMBERS), ...o.world }, loader: { assets: o.assets ?? {} } },
    prefabs: { engine: { dt: DT } },
  } as unknown as Scene
  const r3 = render3d()
  const plugins: any = {
    wire: { n: 10, rows: o.rows ?? [], scene },
    render3d: r3,
    loader: {
      on: (_name: string, f: () => void) => f(),
      model: (name: string) => ({ scene: SkeletonUtils.clone(MODELS[name].scene), animations: MODELS[name].animations }),
    },
  }
  const me = crowd3d()
  me.tick(plugins)
  return { me, plugins, r3 }
}

const person = (id: number, data: Partial<Row['data']> = {}): Row =>
  ({ id, kind: 'person', data: { pos: [5, 0, 6], to: [5 + Math.sin(1) * 9, 3, 6 + Math.cos(1) * 9], yaw: 1, speed: 1.5, body: 'bob', clip: 'walk', since: 10 * DT, ...data } }) as Row

// Each bone's world position, three's mixer at `t` against the bake's matrices at `t`, both from the
// hips, since the bake takes the hips' travel off.
function fromHips(name: string, clip: string, t: number, matrices: number[][]) {
  const model = SkeletonUtils.clone(MODELS[name].scene)
  let skinned!: THREE.SkinnedMesh
  model.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && !skinned) skinned = o as THREE.SkinnedMesh })
  const mixer = new THREE.AnimationMixer(model)
  const action = mixer.clipAction(MODELS[name].animations.find(c => c.name === clip)!)
  action.play()
  action.time = t
  mixer.update(0)
  model.updateMatrixWorld(true)
  const sk = skinned.skeleton
  const mine = sk.bones.map(b => b.getWorldPosition(new THREE.Vector3()))
  const theirs = matrices.map((e, i) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(e).multiply(sk.boneInverses[i].clone().invert())))
  return { mine, theirs }
}

test('one bake of the first body\'s turns poses both bodies as three\'s mixer does, from the hips, on a baked frame and between two', async () => {
  const { me } = await page()
  expect(me.ready()).toBe(true)
  for (const name of ['bob', 'tall']) {
    for (const clip of ['idle', 'walk']) {
      for (const t of [0, 0.2, 1 / 3, 0.5]) {
        const { mine, theirs } = fromHips(name, clip, t, me.pose(name, clip, t).matrices)
        for (let i = 1; i < mine.length; i++) expect(mine[i].clone().sub(mine[0]).distanceTo(theirs[i].clone().sub(theirs[0]))).toBeLessThan(1e-5)
        expect(Math.abs(mine[0].y - theirs[0].y)).toBeLessThan(1e-5)
      }
      // Between two baked frames the turns are blended, which bends a turning arm a little short.
      const between = fromHips(name, clip, 0.5 / 30 + 0.1, me.pose(name, clip, 0.5 / 30 + 0.1).matrices)
      expect(between.mine[2].clone().sub(between.mine[0]).distanceTo(between.theirs[2].clone().sub(between.theirs[0]))).toBeLessThan(0.002)
    }
  }
})

test('the hips\' travel is taken off every clip and handed out as metres a second, the same for each body', async () => {
  const { me } = await page()
  expect(me.travel('bob', 'walk')).toBeCloseTo(1.5, 6)
  expect(me.travel('tall', 'walk')).toBeCloseTo(1.5, 6)
  expect(me.travel('bob', 'idle')).toBeCloseTo(0, 6)
  // The walk's hips stand at their rest across the ground plus their sway, never 0.4 m on at the
  // eighth key: rest (0, 0) with the clip's sway of 3 sin(τu) cm across.
  const t = 8 / 30
  const { theirs } = fromHips('bob', 'walk', t, me.pose('bob', 'walk', t).matrices)
  expect(theirs[0].x).toBeCloseTo(0.03 * Math.sin(TAU * t), 6)
  expect(theirs[0].z).toBeCloseTo(0, 6)
})

test('a held clip stops on its last frame and stands on its first before it starts; a looped one goes round', async () => {
  const { me } = await page({ world: { hold: ['walk'] } })
  expect(me.pose('bob', 'walk', 2.6).matrices).toEqual(me.pose('bob', 'walk', 1).matrices)
  expect(me.pose('bob', 'walk', -0.4).matrices).toEqual(me.pose('bob', 'walk', 0).matrices)
  expect(me.pose('bob', 'idle', 2.5).matrices).toEqual(me.pose('bob', 'idle', 0.5).matrices)
})

// The pose every group of every body reads: one row a person of the pool.
const poseOf = (r3: ReturnType<typeof render3d>) => {
  const mesh = r3.scene.children.find(o => (o as THREE.Mesh).isMesh) as THREE.Mesh
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>' }
  ;(mesh.material as THREE.Material).onBeforeCompile(shader as any, {} as THREE.WebGLRenderer)
  return shader.uniforms.crowdPose.value as THREE.Texture<{ width: number; height: number }>
}

test('one pool of poolSize people for every body, 512 when it is left out, made before any row comes', async () => {
  const plain = await page()
  expect(plain.me.pool()).toEqual({ size: 512, used: 0, writes: 0 })
  expect(poseOf(plain.r3).image.height).toBe(512)
  const big = await page({ world: { poolSize: 1000 } })
  expect(big.me.pool().size).toBe(1000)
  expect(poseOf(big.r3).image.height).toBe(1000)
  // Every group of both bodies reads that one pose.
  const meshes = big.r3.scene.children as THREE.Mesh[]
  expect(meshes.length).toBe(4)
  const pose = poseOf(big.r3)
  big.plugins.wire.rows = [person(1), person(2, { body: 'tall' })]
  big.me.tick(big.plugins)
  expect(big.me.pool()).toEqual({ size: 1000, used: 2, writes: 2 })
  expect(poseOf(big.r3)).toBe(pose)
  await expect(page({ world: { poolSize: 0 } })).rejects.toThrow('poolSize 0 is not a whole number above 0')
})

test('a row is written into its slot once while it keeps its course, and again only when it changes course', async () => {
  const { me, plugins } = await page()
  plugins.wire.rows = [person(1)]
  me.tick(plugins)
  expect(me.pool().writes).toBe(1)
  // Thirty steps on, the same course: nothing written.
  plugins.wire.n = 40
  me.tick(plugins)
  expect(me.pool().writes).toBe(1)
  // A new clip, a new speed, a new heading, a new leg from where it then stood: each written once.
  plugins.wire.rows = [person(1, { clip: 'idle' })]
  me.tick(plugins)
  me.tick(plugins)
  expect(me.pool().writes).toBe(2)
  plugins.wire.rows = [person(1, { clip: 'idle', speed: 0 })]
  me.tick(plugins)
  plugins.wire.rows = [person(1, { clip: 'idle', speed: 0, yaw: 2 })]
  me.tick(plugins)
  expect(me.pool().writes).toBe(4)
  plugins.wire.rows = [person(1, { pos: [5 + Math.sin(2) * 0.75, 0, 6 + Math.cos(2) * 0.75], clip: 'idle', speed: 0, yaw: 2, since: 40 * DT })]
  me.tick(plugins)
  me.tick(plugins)
  expect(me.pool().writes).toBe(5)
  // A new end to its line, up a stair from where it stands.
  plugins.wire.rows = [person(1, { pos: [5 + Math.sin(2) * 0.75, 0, 6 + Math.cos(2) * 0.75], to: [8, 2.4, 3], clip: 'walk', speed: 1.5, yaw: 2, since: 40 * DT })]
  me.tick(plugins)
  plugins.wire.rows = [person(1, { pos: [5 + Math.sin(2) * 0.75, 0, 6 + Math.cos(2) * 0.75], to: [8, 2.4, 4], clip: 'walk', speed: 1.5, yaw: 2, since: 40 * DT })]
  me.tick(plugins)
  me.tick(plugins)
  expect(me.pool().writes).toBe(7)
  // Gone, its slot is the next row's.
  plugins.wire.rows = []
  me.tick(plugins)
  expect(me.pool()).toEqual({ size: 512, used: 0, writes: 7 })
  plugins.wire.rows = [person(2)]
  me.tick(plugins)
  expect(me.pool()).toEqual({ size: 512, used: 1, writes: 8 })
})

// What each slot was sent with, by a renderer that takes the slots crowd3d sends and draws nothing: the
// clip time (slot s's is texel 6s + 1's a), and the slot's twenty-four numbers, the last sent. A slot
// that runs onto the next row is sent a row's part at a time; its first part names it.
function sent(r3: ReturnType<typeof render3d>, slots = new Map<number, number[]>(), parts: number[][] = []) {
  const times = new Map<number, number>()
  r3.renderer = {
    capabilities: { maxTextureSize: 4096 },
    copyTextureToTexture(from: THREE.DataTexture, _to: THREE.Texture, region: THREE.Box2) {
      const d = from.image.data as Float32Array
      const i = region.min.y * 1024 + region.min.x
      parts.push([region.min.x, region.min.y, region.max.x, region.max.y])
      if (i % 8) return
      const s = i / 8, o = i * 4
      times.set(s, d[o + 7])
      slots.set(s, [...d.slice(o, o + 32)])
    },
    getRenderTarget: () => null,
    setRenderTarget() {},
    render() {},
  } as unknown as THREE.WebGLRenderer
  return times
}

test('a clip goes on where it had got to when its person sets out on a new line; a new clip starts afresh', async () => {
  const { me, plugins, r3 } = await page({ world: { hold: ['idle'] } })
  const times = sent(r3)
  const phase = (1 * 0.6180339887498949) % 1
  // A walk, looped, starts at the id's point.
  plugins.wire.rows = [person(1)]
  me.tick(plugins)
  me.afterTick(plugins)
  expect(times.get(0)).toBeCloseTo(phase * 1, 6)
  // Its next line 0.7 s on, on the same walk: 0.7 s further into it, taken round its 1 s.
  plugins.wire.rows = [person(1, { pos: [6, 0, 7], to: [9, 0, 9], since: 10 * DT + 0.7 })]
  me.tick(plugins)
  me.afterTick(plugins)
  expect(times.get(0)).toBeCloseTo((phase + 0.7) % 1, 6)
  // 0.9 s on again: round its length once more.
  plugins.wire.rows = [person(1, { pos: [8, 0, 8], to: [12, 0, 9], since: 10 * DT + 1.6 })]
  me.tick(plugins)
  me.afterTick(plugins)
  expect(times.get(0)).toBeCloseTo((phase + 1.6) % 1, 6)
  // The idle, held: a new clip, from its start.
  plugins.wire.rows = [person(1, { pos: [8, 0, 8], to: [8, 0, 8], speed: 0, clip: 'idle', since: 10 * DT + 2 })]
  me.tick(plugins)
  me.afterTick(plugins)
  expect(times.get(0)).toBe(0)
  // Turned 0.5 s into it, the idle kept: 0.5 s into it, not taken round.
  plugins.wire.rows = [person(1, { pos: [8, 0, 8], to: [8, 0, 8], speed: 0, clip: 'idle', yaw: 2, since: 10 * DT + 2.5 })]
  me.tick(plugins)
  me.afterTick(plugins)
  expect(times.get(0)).toBeCloseTo(0.5, 6)
  // Back on the walk: a new clip, at the id's point again.
  plugins.wire.rows = [person(1, { pos: [8, 0, 8], to: [12, 0, 9], since: 10 * DT + 3 })]
  me.tick(plugins)
  me.afterTick(plugins)
  expect(times.get(0)).toBeCloseTo(phase, 6)
})

test('a row on a spline has the piece the clock is on written into its slot, again as the clock reaches each next one, its clip going on', async () => {
  const { me, plugins, r3 } = await page()
  const slots = new Map<number, number[]>()
  sent(r3, slots)
  const row = person(1, { pos: [0, 0, 0], to: [6, 3, 2], through: [[2, 1, 2], [4, 2, 0]], since: 10 * DT })
  const { pts } = drawn({ points: [[0, 0, 0], [2, 1, 2], [4, 2, 0], [6, 3, 2]] })
  plugins.wire.rows = [row]
  const at = (n: number) => {
    plugins.wire.n = n
    me.tick(plugins)
    me.afterTick(plugins)
    return slots.get(0)!
  }
  const phase = (1 * 0.6180339887498949) % 1
  let writes = me.pool().writes
  let last = -1
  for (let n = 10; n < 10 + 60 * 8; n++) {
    const p = piece(row, n * DT)
    const slot = at(n)
    if (p.n !== last) {
      // A new piece: written once, from its own start, at its own start's time, facing along it.
      expect(me.pool().writes).toBe(writes + 1)
      writes++
      last = p.n
      expect(slot.slice(0, 3).map(v => Math.fround(v))).toEqual(p.pos.map(v => Math.fround(v)))
      expect(slot[3]).toBeCloseTo(p.yaw, 5)
      expect(slot[8]).toBeCloseTo(p.since, 5)
      expect(slot.slice(12, 15).map(v => Math.fround(v))).toEqual(p.to.map(v => Math.fround(v)))
      // The walk goes on from where it had got to: the clip time at the piece's start is the time since
      // the course set out, past the row's phase, taken round the walk's 1 s.
      expect(slot[7]).toBeCloseTo((phase + p.since - 10 * DT) % 1, 4)
    } else expect(me.pool().writes).toBe(writes)
  }
  // Every piece was walked, and the last is held once it is got to.
  expect(last).toBe(pts.length - 2)
})

test('a row\'s ups are its slot\'s last two texels, [0, 1, 0] where it gives none, and a new up is written again', async () => {
  const { me, plugins, r3 } = await page()
  const slots = new Map<number, number[]>()
  sent(r3, slots)
  plugins.wire.rows = [person(1)]
  me.tick(plugins)
  me.afterTick(plugins)
  expect(slots.get(0)!.slice(16, 24)).toEqual([0, 1, 0, 0, 0, 1, 0, 0])
  const S = Math.fround(Math.SQRT1_2)
  plugins.wire.rows = [person(1, { normal: [0, 1, 0], normalTo: [Math.SQRT1_2, Math.SQRT1_2, 0] })]
  me.tick(plugins)
  me.afterTick(plugins)
  expect(me.pool().writes).toBe(2)
  expect(slots.get(0)!.slice(16, 24)).toEqual([0, 1, 0, 0, S, S, 0, 0])
  // The same ups again: nothing written.
  plugins.wire.rows = [person(1, { normal: [0, 1, 0], normalTo: [Math.SQRT1_2, Math.SQRT1_2, 0] })]
  me.tick(plugins)
  expect(me.pool().writes).toBe(2)
  // On a spline, each piece's ups, from `normal` at its start to `normalTo` at its end.
  const row = person(1, { pos: [0, 0, 1], to: [0, 2, 0], through: [[0, 1, 0.2]], normal: [0, 1, 0], normalTo: [1, 0, 0] })
  plugins.wire.rows = [row]
  me.tick(plugins)
  me.afterTick(plugins)
  const p = piece(row, plugins.wire.n * DT)
  expect(slots.get(0)!.slice(16, 24)).toEqual([...p.normal, 0, ...p.normalTo, 0].map(v => Math.fround(v)))
})

test('each slot is sent whole, from the one row of the pool it sits in', async () => {
  const { me, plugins, r3 } = await page()
  const parts: number[][] = []
  sent(r3, new Map(), parts)
  // Slot 127 is texels 1016 to 1023, the last eight of the first row; slot 128 the first eight of the next.
  plugins.wire.rows = Array.from({ length: 129 }, (_, i) => person(i + 1))
  me.tick(plugins)
  me.afterTick(plugins)
  expect(parts).toContainEqual([1016, 0, 1024, 1])
  expect(parts).toContainEqual([0, 1, 8, 2])
  expect(parts).toHaveLength(129)
})

// The scene's poses, a file the loader holds, each a frame of one of the clips.
const POSES = 'test/crowd3d/poses.json'
written(POSES, JSON.stringify({ poses: { stride: { clip: 'walk', frame: 9, at: 0.3 }, sway: { clip: 'idle', frame: 20, at: 0.6667 } } }))
const posed = { world: { poses: 'poses' }, assets: { poses: { type: 'json', url: POSES, preload: true } } }

test('a pose is its clip at its frame\'s time, whatever the time asked, and a slot holds it there', async () => {
  const { me, plugins, r3 } = await page(posed)
  const near = (a: number[][], b: number[][]) => { for (let i = 0; i < a.length; i++) for (let k = 0; k < 16; k++) expect(a[i][k]).toBeCloseTo(b[i][k], 9) }
  near(me.pose('bob', 'stride', 0).matrices, me.pose('bob', 'walk', 0.3).matrices)
  near(me.pose('tall', 'sway', 1.9).matrices, me.pose('tall', 'idle', 0.6667).matrices)
  const slots = new Map<number, number[]>()
  sent(r3, slots)
  plugins.wire.rows = [person(1, { clip: 'stride', speed: 0 })]
  me.tick(plugins)
  me.afterTick(plugins)
  const slot = slots.get(0)!
  // Its clip's place in the bake (the walk after the idle's 61 rows), its frame's time, and held as a pose.
  expect(slot.slice(4, 8)).toEqual([61, 30, 1, Math.fround(0.3)])
  expect(slot[10]).toBe(2)
  // The clock going on writes nothing: the pass holds the pose at its time.
  plugins.wire.n += 120
  me.tick(plugins)
  expect(me.pool().writes).toBe(1)
})

test('a pose of a clip the scene does not list, and a clip that is neither clip nor pose, throw', async () => {
  const odd = 'test/crowd3d/odd-poses.json'
  written(odd, JSON.stringify({ poses: { leap: { clip: 'jump', frame: 3, at: 0.1 } } }))
  const { me, plugins } = await page({ world: { poses: 'odd' }, assets: { odd: { type: 'json', url: odd, preload: true } } })
  plugins.wire.rows = [person(1, { clip: 'leap' })]
  expect(() => me.tick(plugins)).toThrow('crowd3d\'s pose leap is of jump, which world.crowd3d.clips does not list')
  const other = await page(posed)
  other.plugins.wire.rows = [person(1, { clip: 'dance' })]
  expect(() => other.me.tick(other.plugins)).toThrow('crowd3d has no clip or pose dance: world.crowd3d.clips is idle, walk')
})

test('with a fade, a slot written for a new clip keeps the one it had to fade from; a new line keeps the fade; no fade, none', async () => {
  const { me, plugins, r3 } = await page({ ...posed, world: { ...posed.world, fade: 0.5 } })
  const slots = new Map<number, number[]>()
  sent(r3, slots)
  plugins.wire.rows = [person(1, { clip: 'walk', since: 10 * DT })]
  me.tick(plugins)
  me.afterTick(plugins)
  const walking = slots.get(0)!
  // Its first clip has nothing to fade from.
  expect(walking.slice(24, 32)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  plugins.wire.n = 40
  plugins.wire.rows = [person(1, { clip: 'stride', since: 40 * DT, speed: 0 })]
  me.tick(plugins)
  me.afterTick(plugins)
  const striding = slots.get(0)!
  // The walk as the slot had it, its own then and how it was held, the moment the fade began, and the fade.
  expect(striding.slice(24, 28)).toEqual(walking.slice(4, 8))
  expect(striding.slice(28, 32)).toEqual([walking[8], 0, Math.fround(40 * DT), 0.5])
  // The same pose on a new line: its fade kept.
  plugins.wire.rows = [person(1, { clip: 'stride', since: 41 * DT, speed: 0, to: [0, 0, 0] })]
  me.tick(plugins)
  me.afterTick(plugins)
  expect(slots.get(0)!.slice(24, 32)).toEqual(striding.slice(24, 32))
  // No fade: a change of clip keeps nothing to fade from.
  const plain = await page(posed)
  const kept = new Map<number, number[]>()
  sent(plain.r3, kept)
  plain.plugins.wire.rows = [person(1, { clip: 'walk' })]
  plain.me.tick(plain.plugins)
  plain.me.afterTick(plain.plugins)
  plain.plugins.wire.rows = [person(1, { clip: 'idle', since: 30 * DT })]
  plain.me.tick(plain.plugins)
  plain.me.afterTick(plain.plugins)
  expect(kept.get(0)!.slice(24, 32)).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
})

test('a fade draws each bone mixed from the clip it had into the one it has, the pose at either end of it', async () => {
  const { me } = await page(posed)
  const whole = me.pose('bob', 'stride', 0).matrices
  expect(me.pose('bob', 'stride', 0, { clip: 'idle', t: 0.4, share: 0 }).matrices).toEqual(whole)
  const from = me.pose('bob', 'idle', 0.4).matrices
  const all = me.pose('bob', 'stride', 0, { clip: 'idle', t: 0.4, share: 1 }).matrices
  for (let i = 0; i < all.length; i++) for (let k = 0; k < 16; k++) expect(all[i][k]).toBeCloseTo(from[i][k], 5)
  // Halfway, the arm stands between the two, as three's slerp has it.
  const half = me.pose('bob', 'stride', 0, { clip: 'idle', t: 0.4, share: 0.5 }).matrices
  const hand = (m: number[][]) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(m[2]))
  const mid = hand(whole).add(hand(from)).multiplyScalar(0.5)
  expect(hand(half).distanceTo(mid)).toBeLessThan(0.05)
})

test('each body draws its own people, as many copies a group as it has people', async () => {
  const rows = [person(1), person(2, { body: 'tall' }), person(3), person(4, { body: 'tall' }), person(5)]
  const { me, r3 } = await page({ rows })
  expect(me.counts()).toEqual({ bob: { copies: 3, groups: 2 }, tall: { copies: 2, groups: 2 } })
  const meshes = r3.scene.children as THREE.Mesh<THREE.InstancedBufferGeometry>[]
  expect(meshes.map(m => m.geometry.instanceCount)).toEqual([3, 3, 2, 2])
  expect(meshes.every(m => !(m as unknown as THREE.InstancedMesh).isInstancedMesh && m.frustumCulled === false && m.castShadow && m.customDepthMaterial)).toBe(true)
})

test('more rows than the pool, a row of no body or no end to its line, and a body of other bones throw', async () => {
  const full = await page({ world: { poolSize: 2 } })
  full.plugins.wire.rows = [person(1), person(2), person(3)]
  expect(() => full.me.tick(full.plugins)).toThrow("crowd3d's pool of 2 is full: 3 people (world.crowd3d.poolSize)")
  const lost = await page()
  lost.plugins.wire.rows = [person(1, { body: 'nobody' })]
  expect(() => lost.me.tick(lost.plugins)).toThrow("person 1's body nobody is none of world.crowd3d.bodies")
  lost.plugins.wire.rows = [person(2, { to: undefined })]
  expect(() => lost.me.tick(lost.plugins)).toThrow('crowd3d: person 2 has no to [x, y, z], where its course ends')
  await expect(page({ world: { bodies: { bob: 'bob', odd: 'odd' } } })).rejects.toThrow('crowd3d body odd: bone 2 is mixamorigRightHand where bob has mixamorigLeftHand')
})

test('it is listed after the loader, whose models it asks for in its tick', async () => {
  await expect(page({ plugins: ['crowd3d', 'loader', 'render3d'] })).rejects.toThrow('crowd3d is listed before the loader')
})

// The held texture every group of the item reads.
const heldOf = (r3: ReturnType<typeof render3d>, name: string) => {
  const mesh = r3.scene.children.find(o => o.name.startsWith(`crowd3d item ${name}`)) as THREE.Mesh
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <common>' }
  ;(mesh.material as THREE.Material).onBeforeCompile(shader as any, {} as THREE.WebGLRenderer)
  return shader.uniforms.crowdHeld.value.image.data as Float32Array
}

test('an item sits on its place\'s bone as a child of that bone sits in three, in metres, on both bodies', async () => {
  const { me } = await page({ world: { items: { cup: CUP } } })
  expect(me.ready()).toBe(true)
  for (const name of ['bob', 'tall']) {
    for (const t of [0, 0.3, 0.55]) {
      for (const place of ['leftHand', 'hips'] as const) {
        // Three's own: the cup's place as a child of the bone, under the armature's centimetres undone.
        const model = SkeletonUtils.clone(MODELS[name].scene)
        let skinned!: THREE.SkinnedMesh
        model.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && !skinned) skinned = o as THREE.SkinnedMesh })
        const mixer = new THREE.AnimationMixer(model)
        const action = mixer.clipAction(MODELS[name].animations.find(c => c.name === 'walk')!)
        action.play()
        action.time = t
        mixer.update(0)
        const bone = skinned.skeleton.bones[place === 'hips' ? 0 : 2]
        const unscale = new THREE.Object3D()
        unscale.scale.setScalar(100)
        const sit = CUP[place] as { at: number[]; turn?: number[]; scale?: number }
        const child = new THREE.Object3D()
        child.position.fromArray(sit.at)
        const turn = (sit.turn ?? [0, 0, 0]).map(a => (a * Math.PI) / 180)
        child.rotation.set(turn[0], turn[1], turn[2])
        child.scale.setScalar(sit.scale ?? 1)
        bone.add(unscale)
        unscale.add(child)
        model.updateMatrixWorld(true)
        const theirs = child.matrixWorld.elements
        // The bake takes the hips' travel off: both are held from where their hips stand.
        const pose = me.pose(name, 'walk', t).matrices
        const hipsBaked = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(pose[0]).multiply(skinned.skeleton.boneInverses[0].clone().invert()))
        const hipsThree = skinned.skeleton.bones[0].getWorldPosition(new THREE.Vector3())
        const mine = me.holds(name, 'walk', t, 'cup', place)
        for (let i = 0; i < 12; i++) expect(mine[i]).toBeCloseTo(theirs[i], 5)
        for (let k = 0; k < 3; k++) expect(mine[12 + k] - hipsBaked.getComponent(k)).toBeCloseTo(theirs[12 + k] - hipsThree.getComponent(k), 5)
      }
    }
  }
})

test('an item is one mesh a group, its vertices where they stand in its glb, drawn once for each place anyone holds it on', async () => {
  const rows = [person(1, { holding: { leftHand: 'cup' } }), person(2, { body: 'tall', holding: { leftHand: 'cup', hips: 'cup' } }), person(3)]
  const { me, plugins, r3 } = await page({ rows, world: { items: { cup: CUP } } })
  expect(me.items()).toEqual({ cup: { copies: 3, groups: 1 } })
  const cup = r3.scene.children.find(o => o.name === 'crowd3d item cup Cup') as THREE.Mesh<THREE.InstancedBufferGeometry>
  expect(cup.geometry.instanceCount).toBe(3)
  const box = new THREE.Box3().setFromBufferAttribute(cup.geometry.getAttribute('position') as THREE.BufferAttribute)
  expect(box.min.y).toBeCloseTo(0, 6)
  expect(box.max.y).toBeCloseTo(0.1, 6)
  // Each copy its holder's pose row, its place's bone, and what the bone's skin is put through after:
  // bob's people are rows 0 and 1, tall's person row 2.
  const held = heldOf(r3, 'cup')
  const copies = [0, 1, 2].map(k => ({ row: held[k * 20], bone: held[k * 20 + 1], m: new THREE.Matrix4().fromArray(held, k * 20 + 4) }))
  expect(copies.map(c => [c.row, c.bone])).toEqual([[0, 2], [2, 2], [2, 0]])
  for (const [k, body, place] of [[0, 'bob', 'leftHand'], [1, 'tall', 'leftHand'], [2, 'tall', 'hips']] as const) {
    const skin = new THREE.Matrix4().fromArray(me.pose(body, 'walk', 0.2).matrices[place === 'hips' ? 0 : 2])
    const want = new THREE.Matrix4().fromArray(me.holds(body, 'walk', 0.2, 'cup', place))
    const got = skin.multiply(copies[k].m)
    for (let i = 0; i < 16; i++) expect(got.elements[i]).toBeCloseTo(want.elements[i], 5)
  }
  // What a row holds changes, and it goes: each drawn at once.
  plugins.wire.rows = [rows[0], rows[1], person(3, { holding: { hips: 'cup' } })]
  me.tick(plugins)
  expect(me.items()).toEqual({ cup: { copies: 4, groups: 1 } })
  plugins.wire.rows = [rows[1], person(3, { holding: { hips: 'cup' } })]
  me.tick(plugins)
  expect(me.items()).toEqual({ cup: { copies: 3, groups: 1 } })
  expect(cup.geometry.instanceCount).toBe(3)
})

test('an item on no place, of no item, on a place its item does not list, or on a bone the skeleton has not got throws', async () => {
  const held = async (holding: Record<string, string>) => {
    const { me, plugins } = await page({ world: { items: { cup: CUP } } })
    plugins.wire.rows = [person(4, { holding })]
    return () => me.tick(plugins)
  }
  expect(await held({ tail: 'cup' })).toThrow('crowd3d: person 4 holds cup on tail, which is no place')
  expect(await held({ leftHand: 'mug' })).toThrow('crowd3d: person 4 holds mug, which is none of world.crowd3d.items')
  expect(await held({ rightHand: 'cup' })).toThrow('crowd3d: person 4 holds cup on rightHand, which world.crowd3d.items.cup does not list')
  await expect(page({ world: { items: { cup: { model: 'cup', head: {} } } } })).rejects.toThrow('crowd3d item cup: its place head is the bone Head, which bob\'s skeleton has not got')
  await expect(page({ world: { items: { cup: { model: 'cup', tail: {} } } } })).rejects.toThrow('crowd3d item cup: tail is no place')
})

test('close takes everything it made off the scene', async () => {
  const { me, plugins, r3 } = await page({ rows: [person(7, { holding: { leftHand: 'cup' } })], world: { items: { cup: CUP } } })
  me.tick(plugins)
  expect(r3.scene.children.length).toBe(5)
  me.close()
  expect(r3.scene.children.length).toBe(0)
})
