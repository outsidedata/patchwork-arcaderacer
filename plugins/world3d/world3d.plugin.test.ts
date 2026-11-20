// world3d's browser half on a place of the test's own, the glb of supershader3d's fixture (`supershader3d.glb.fixture.ts`,
// as pro-ng's pack writes one): a solid triangle; a kit quad skinned to a fan's rotor, which its clip `spin` turns once
// in a third of a second; a sign of two morph targets, which its clip `swing` poses; and two course rows. The plugin is
// handed the plugins it draws through, render3d's scene and THREE, supershader3d's looks and materials, the loader's
// glb and particle3d, and ticked as a page ticks it, on a clock the test holds. What it built is read off render3d's
// scene. How the glb is read and assembled is proven beside it (`supershader3d.glb.test.ts`).
import { afterEach, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { prepared, written } from '#plugins/loader/loader.sim.ts'
import type { Looks } from '#plugins/supershader3d/supershader3d.plugin.ts'
import { assemble, unpack } from '#plugins/supershader3d/supershader3d.glb.ts'
import { LOOKS, ROTOR, glbOf, made as place } from '#plugins/supershader3d/supershader3d.glb.fixture.ts'
import { played, type Clips } from './world3d.place.ts'
import { COURSES, ROWS, world3d } from './world3d.plugin.ts'

// ---------------------------------------------------------------- the place's clips

const CLIPS: Clips = {
  things: [
    { thing: 'fan', kind: 'fan', clips: { spin: { about: 'turns', how: 'bones', start: 'on', loop: true, seconds: 1 / 3, animation: 'fan spin' } } },
    { thing: 'sign', kind: 'sign', clips: { swing: { about: 'swings', how: 'poses', start: 'off', loop: false, seconds: 2, poses: [{ time: 0, target: null }, { time: 1, target: 0 }, { time: 2, target: 1 }] } } },
  ],
}
const SPAWNS = [{ effect: 'brazier', at: [1, 2, 3], dir: [0, 1, 0] }]

// ---------------------------------------------------------------- the page

// The scene's world, its catalogue's files written in memory and read as the loader reads them: the place `yard`,
// its clips and its effects. The glb is handed by the loader's stand-in.
let n = 0
async function worldOf(clips: Clips = CLIPS, spawns: unknown[] = SPAWNS) {
  const at = `/world3d-plugin-test/${++n}/`
  const assets = {
    'yard.glb': { type: 'binary', url: `${at}yard.glb`, preload: true },
    'yard.clips': { type: 'json', url: `${at}yard.clips.json`, preload: true },
    'yard.effects': { type: 'json', url: `${at}yard.effects.json`, preload: true },
  }
  written(assets['yard.clips'].url, JSON.stringify(clips))
  written(assets['yard.effects'].url, JSON.stringify({ spawns }))
  const world = { loader: { assets }, world3d: { place: 'yard' } }
  await prepared(world, 'yard.clips')
  await prepared(world, 'yard.effects')
  return world
}

// The page's clock, in milliseconds, which the plugin's mixer goes on by.
let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)
afterEach(() => { clock = 0 })

type Page = { plugins: Plugins; scene: THREE.Scene; emitted: unknown[][]; asked: string[]; burning: Set<string> }
async function page({ glb = glbOf(place()), clips, spawns }: { glb?: Uint8Array; clips?: Clips; spawns?: unknown[] } = {}): Promise<Page> {
  const world = await worldOf(clips, spawns)
  const scene = new THREE.Scene()
  const emitted: unknown[][] = [], asked: string[] = []
  const burning = new Set<string>()
  const materials = { solid: new THREE.MeshBasicMaterial(), relief: new THREE.MeshBasicMaterial() } as Record<string, THREE.Material>
  let looks: Looks | undefined
  const plugins = {
    wire: { scene: { world }, rows: [] },
    render3d: { THREE, scene },
    loader: { load: async (name: string) => { asked.push(name); return { bytes: glb } } },
    supershader3d: { looks: () => looks, material: (call: string) => materials[call] },
    // each emitted effect handed back as particle3d hands it, its point and way written as world3d moves it
    particle3d: { has: (e: string) => burning.has(e), emit: (...a: unknown[]) => { emitted.push(a); const s = a[2] as { dir?: number[] }; return { name: a[0], at: [...(a[1] as number[])], dir: s.dir && [...s.dir] } } },
    // supershader3d's looks file lands
    land: () => { looks = LOOKS },
  } as unknown as Plugins
  return { plugins, scene, emitted, asked, burning }
}

// a tick of the plugin `ms` milliseconds of the page's clock after the last, the glb's unpacking let finish first
async function tick(me: ReturnType<typeof world3d>, p: Plugins, ms = 0) {
  await new Promise(r => setTimeout(r, 0))
  clock += ms
  me.tick(p)
}

const placeOf = (scene: THREE.Scene) => scene.children.find(o => (o as THREE.Mesh).isMesh) as THREE.SkinnedMesh | undefined

test('the place is built once its glb and supershader3d\'s looks have landed: one skinned mesh in each call\'s material, casting and taking shadows', async () => {
  const { plugins, scene, asked } = await page()
  const me = world3d()
  await tick(me, plugins)
  expect(asked).toEqual(['yard.glb'])
  await tick(me, plugins)
  expect(placeOf(scene)).toBeUndefined()
  plugins.land()
  await tick(me, plugins)
  const mesh = placeOf(scene)!
  expect(mesh.isSkinnedMesh).toBe(true)
  expect(mesh.castShadow && mesh.receiveShadow).toBe(true)
  expect(mesh.material).toEqual([plugins.supershader3d.material('solid'), plugins.supershader3d.material('relief')])
  // built once
  await tick(me, plugins)
  expect(scene.children.filter(o => (o as THREE.Mesh).isMesh)).toEqual([mesh])
})

test('the course table holds each row\'s course feet, the courses past them out of reach, and its walls\' thickness', async () => {
  const { plugins } = await page()
  const me = world3d()
  const table = me.courses(THREE)
  expect([table.image.width, table.image.height]).toEqual([COURSES + 1, ROWS])
  expect(me.courses(THREE)).toBe(table)
  const data = table.image.data as Float32Array
  expect(data[0]).toBe(0)
  plugins.land()
  await tick(me, plugins)
  await tick(me, plugins)
  const width = COURSES + 1
  expect([...data.subarray(0, 4)]).toEqual([0, Math.fround(0.4), Math.fround(0.9), 1e4 + 3])
  expect(data[COURSES]).toBe(Math.fround(1.2))
  expect([...data.subarray(width, width + 3)]).toEqual([0, Math.fround(0.3), 1e4 + 2])
  expect(data[width + COURSES]).toBe(0.5)
  expect(data[2 * width]).toBe(0)
})

test('the fan\'s spin plays from the start and turns once in a third of a second on the page\'s clock, and stops and starts by name', async () => {
  const { plugins, scene } = await page()
  const me = world3d()
  plugins.land()
  await tick(me, plugins)
  await tick(me, plugins)
  const mesh = placeOf(scene)!
  const rotor = mesh.skeleton.bones[1]
  const angle = () => (2 * Math.atan2(rotor.quaternion.y, rotor.quaternion.w) * 180) / Math.PI
  // where the blade's tip, the kit's first corner, is drawn
  const rest = new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position') as THREE.BufferAttribute, 3)
  const tip = () => {
    mesh.updateMatrixWorld(true)
    mesh.skeleton.update()
    return mesh.applyBoneTransform(3, rest.clone())
  }
  const turned = (degrees: number) => rest.clone().sub(new THREE.Vector3(...ROTOR)).applyAxisAngle(new THREE.Vector3(0, 1, 0), (degrees * Math.PI) / 180).add(new THREE.Vector3(...ROTOR))
  expect(tip().distanceTo(rest)).toBeLessThan(1e-5)
  await tick(me, plugins, 1000 / 12)
  expect(angle()).toBeCloseTo(90, 3)
  expect(tip().distanceTo(turned(90))).toBeLessThan(1e-5)
  // the solid stays where it was cut
  expect(mesh.applyBoneTransform(0, new THREE.Vector3(0, 0, 0)).length()).toBeLessThan(1e-6)
  await tick(me, plugins, 1000 / 3)
  expect(tip().distanceTo(turned(90))).toBeLessThan(1e-5)
  // stopped, it stands where it is however long the clock goes on; started, it goes on from there
  me.clip('fan', 'spin', false)
  await tick(me, plugins, 100)
  expect(tip().distanceTo(turned(90))).toBeLessThan(1e-5)
  me.clip('fan', 'spin', true)
  me.advance(1 / 12)
  expect(tip().distanceTo(turned(180))).toBeLessThan(1e-5)
  expect(() => me.clip('fan', 'wobble', true)).toThrow('world3d: the place has no clip wobble of fan; it has spin of fan, swing of sign')
})

test('the sign\'s swing waits until started, poses its targets one after the other, and holds its last pose', async () => {
  const { plugins, scene } = await page()
  const me = world3d()
  plugins.land()
  await tick(me, plugins)
  await tick(me, plugins)
  const mesh = placeOf(scene)!
  await tick(me, plugins, 500)
  expect(mesh.morphTargetInfluences).toEqual([0, 0])
  me.clip('sign', 'swing', true)
  me.advance(0.5)
  expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0.5, 6)
  expect(mesh.morphTargetInfluences![1]).toBeCloseTo(0, 6)
  me.advance(1)
  expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0.5, 6)
  expect(mesh.morphTargetInfluences![1]).toBeCloseTo(0.5, 6)
  me.advance(5)
  expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0, 6)
  expect(mesh.morphTargetInfluences![1]).toBeCloseTo(1, 6)
})

test('one clip played in place of the rest and held at a moment stands there however long the clock goes on, until let go', async () => {
  const { plugins, scene } = await page()
  const me = world3d()
  plugins.land()
  await tick(me, plugins)
  await tick(me, plugins)
  const mesh = placeOf(scene)!
  const rotor = mesh.skeleton.bones[1]
  expect(me.clips()).toEqual([{ thing: 'fan', clip: 'spin', start: true, loop: true }, { thing: 'sign', clip: 'swing', start: false, loop: false }])
  me.only('swing')
  me.hold(1)
  // the swing at its first target, the spin stopped and the rotor back at rest
  expect(mesh.morphTargetInfluences![0]).toBeCloseTo(1, 6)
  expect(mesh.morphTargetInfluences![1]).toBeCloseTo(0, 6)
  await tick(me, plugins, 700)
  expect(mesh.morphTargetInfluences![0]).toBeCloseTo(1, 6)
  expect(rotor.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6)
  me.hold()
  me.advance(0.5)
  expect(mesh.morphTargetInfluences![0]).toBeCloseTo(0.5, 6)
  expect(mesh.morphTargetInfluences![1]).toBeCloseTo(0.5, 6)
  expect(() => me.only('wobble')).toThrow('world3d: no thing of the place has a clip wobble; the clips: spin, swing')
  expect(() => me.hold(-1)).toThrow('world3d: hold is a number of seconds, 0 or more, not -1')
})

test('a joint posed turns about its axis from rest within its range, the joint it drives turned its ratio as far', async () => {
  const joints = [
    { thing: 'fan', bone: 'rotor', joint: 1, axis: [0, 1, 0], range: [-90, 90] as [number, number] },
    { thing: 'fan', bone: 'blade', joint: 1, axis: [0, 1, 0], range: [-30, 30] as [number, number], couple: { joint: 1, ratio: 0.5 } },
  ]
  const { plugins, scene } = await page({ clips: { ...CLIPS, joints } })
  const me = world3d()
  plugins.land()
  await tick(me, plugins)
  await tick(me, plugins)
  me.only('swing')
  const rotor = placeOf(scene)!.skeleton.bones[1]
  expect(me.joints()).toEqual(joints)
  // the rotor at 60, then its coupled entry (on the same bone, standing after it) at half of it, within its range
  me.pose('fan', 'rotor', 60)
  const angle = () => (2 * Math.atan2(rotor.quaternion.y, rotor.quaternion.w) * 180) / Math.PI
  expect(angle()).toBeCloseTo(30, 4)
  await tick(me, plugins, 200)
  expect(angle()).toBeCloseTo(30, 4)
  expect(() => me.pose('fan', 'rotor', 120)).toThrow('world3d: the joint rotor of fan turns -90 to 90 degrees, not 120')
  expect(() => me.pose('fan', 'blade', 10)).toThrow('world3d: the joint blade of fan is driven by its linkage, not posed alone')
  expect(() => me.pose('fan', 'hub', 10)).toThrow('world3d: the place has no joint hub of fan; it has rotor of fan, blade of fan')
})

test('the place\'s effects burn for ever once particle3d holds them, emitted once', async () => {
  const { plugins, emitted, burning } = await page()
  const me = world3d()
  await tick(me, plugins)
  expect(emitted).toEqual([])
  burning.add('brazier')
  await tick(me, plugins)
  await tick(me, plugins)
  expect(emitted).toEqual([['brazier', [1, 2, 3], { dir: [0, 1, 0], life: Infinity }]])
})

test('an effect a joint carries goes with it as the clip turns it, its way turned too; one on a joint the skin has not throws', async () => {
  // a lamp on the fan's rotor, 1 m out along x from its pivot, shining along x
  const at = [ROTOR[0] + 1, ROTOR[1], ROTOR[2]]
  const { plugins, burning } = await page({ spawns: [{ effect: 'lamp', at, dir: [1, 0, 0], node: 'fan rotor' }] })
  const fx: { at: number[]; dir: number[] }[] = []
  const emit = plugins.particle3d.emit
  plugins.particle3d.emit = ((...a: Parameters<typeof emit>) => { const f = emit(...a); fx.push(f as never); return f }) as typeof emit
  const me = world3d()
  burning.add('lamp')
  plugins.land()
  await tick(me, plugins)
  await tick(me, plugins)
  // at rest, where the spawn says
  expect(fx[0].at.map(v => +v.toFixed(5))).toEqual(at)
  // a quarter of the spin (a twelfth of a second) turns it 90 degrees about y: out along x goes to -z
  await tick(me, plugins, 1000 / 12)
  expect(fx[0].at.map(v => +v.toFixed(5) + 0)).toEqual([ROTOR[0], ROTOR[1], ROTOR[2] - 1])
  expect(fx[0].dir.map(v => +v.toFixed(5) + 0)).toEqual([0, 0, -1])
  const bad = await page({ spawns: [{ effect: 'lamp', at, dir: [1, 0, 0], node: 'fan hub' }] })
  const other = world3d()
  bad.burning.add('lamp')
  bad.plugins.land()
  await tick(other, bad.plugins)
  await expect(tick(other, bad.plugins)).rejects.toThrow('world3d: the effect lamp goes with the joint fan hub, which the place\'s skin has not')
})

test('close takes the place away and lets go of its geometry, skeleton and course table', async () => {
  const { plugins, scene } = await page()
  const me = world3d()
  const table = me.courses(THREE)
  plugins.land()
  await tick(me, plugins)
  await tick(me, plugins)
  const mesh = placeOf(scene)!
  const let_go: string[] = []
  mesh.geometry.addEventListener('dispose', () => let_go.push('geometry'))
  table.addEventListener('dispose', () => let_go.push('table'))
  me.close(plugins)
  expect(placeOf(scene)).toBeUndefined()
  expect(let_go).toEqual(['geometry', 'table'])
  expect(() => me.clip('fan', 'spin', true)).toThrow('world3d: no place is animated, so no clip spin of fan')
})

test('a place with no moving thing is a plain mesh, and a clip asked of it throws', async () => {
  const { plugins, scene } = await page({ glb: glbOf(place({ skinned: false })), clips: { things: [] } })
  const me = world3d()
  plugins.land()
  await tick(me, plugins)
  await tick(me, plugins)
  const mesh = placeOf(scene)!
  expect(mesh.isMesh && !mesh.isSkinnedMesh).toBe(true)
  expect(() => me.clip('fan', 'spin', true)).toThrow('world3d: no place is animated, so no clip spin of fan')
})

test('a place of too many course rows, or clips of the wrong shape, throws, naming what is wrong', async () => {
  const town = await unpack(glbOf(place()))
  const many = Array.from({ length: ROWS + 1 }, (_, i) => ({ thing: `t${i}`, look: 'stone', feet: [0], wallDepth: 1 }))
  const { plugins } = await page({ glb: glbOf(place({ courses: many })) })
  const me = world3d()
  plugins.land()
  await tick(me, plugins)
  await new Promise(r => setTimeout(r, 0))
  expect(() => me.tick(plugins)).toThrow(`world3d: the place has ${ROWS + 1} course rows, and the course table ${ROWS}`)
  const mesh = assemble(THREE, town, LOOKS, () => new THREE.MeshBasicMaterial())
  const mixer = new THREE.AnimationMixer(mesh)
  const clip = (c: object) => played(THREE, mixer, mesh, town, { things: [{ thing: 'fan', kind: 'fan', clips: { x: { about: '', how: '', start: 'on', loop: true, seconds: 1, ...c } } }] })
  expect(() => clip({ animation: 'fan wobble' })).toThrow('world3d: the clip x of fan plays the animation fan wobble, which the place\'s glb has not')
  expect(() => clip({ poses: [{ time: 0, target: 2 }] })).toThrow('world3d: the clip x of fan poses the target 2, and the place\'s mesh has 2')
  expect(() => clip({})).toThrow('world3d: the clip x of fan has neither an animation nor poses')
})
