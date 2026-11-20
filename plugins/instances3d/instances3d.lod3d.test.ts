// instances3d's mod for lod3d, and the Instances under it, on three in node: handed a `plugins` of render3d's
// THREE, scene and dress, a wire whose scene gives world.instances3d, and a loader of one model, as lod3d
// hands its `mesh` Drawing a layer's things.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Drawing, Layer, Made, Thing } from '#plugins/lod3d/lod3d.sim.ts'
import { instances3d } from './instances3d.plugin.ts'
import type { Look } from './instances3d.sim.ts'
import { behaviors } from './instances3d.lod3d.ts'

// A model of one row, `t`: LOD 0 a 2 m tall box, LOD 1 a card that faces the eye.
function model() {
  const root = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial())
  box.name = 't-0'
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), new THREE.MeshStandardMaterial({ transparent: true }))
  card.name = 't-1-billboard'
  root.add(box, card)
  return root
}

function page(world: Record<string, unknown> = { instances3d: { cutout: 0.4, coverage: 0.3 } }) {
  const scene = new THREE.Scene()
  type Splice = { uniforms?: object; fragment?: Record<string, string> }
  const splices: (Splice | undefined)[] = []
  let ready = false
  const loaded: string[] = []
  const plugins = {
    render3d: { THREE, scene, dress: (m: THREE.Material, o: { surface?: Splice }) => { splices.push(o.surface); return m } },
    loader: { ready: () => ready, load: async (n: string) => { loaded.push(n) }, model: () => ({ scene: model() }) },
    wire: { scene: { world } },
  } as unknown as Plugins
  plugins.instances3d = instances3d()
  return { plugins, scene, splices, loaded, come: () => { ready = true } }
}

const layer = { on: ['land'], rows: { t: {} }, cell: 10, seed: 1, density: 1, size: [1, 0] } as Layer
const made = (plugins: Plugins, hollows?: number): Made => ({ name: 'copse', layer, rings: [50, 200], plugins, ...(hollows !== undefined && { hollows }) })
const thing = (x: number, tint = 1): Thing => ({ row: 't', at: [x, 0, 0], normal: [0, 1, 0], size: 1, spin: 0, tint, sink: 0, surface: 'land', u: x, v: 0 })
const meshes = (scene: THREE.Scene) => scene.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh)
const draw = (look: Look, m: Made) => behaviors().mesh.draw(look, m)

test('a model is asked of the loader once and drawn when it has come', () => {
  const p = page()
  const look: Look = { asset: 'trees', lods: [0, 1], shadow: 60, leaf: 0.5 }
  expect(draw(look, made(p.plugins))).toBeUndefined()
  expect(draw(look, made(p.plugins))).toBeUndefined()
  expect(p.loaded).toEqual(['trees'])
  p.come()
  expect(draw(look, made(p.plugins))).toBeDefined()
})

test('each shell draws its LOD, nothing is on the scene until shown, and a shell casts when the one before ends inside shadow', () => {
  const p = page()
  p.come()
  const d = draw({ asset: 'trees', lods: [0, 1], shadow: 60, leaf: 0.5 }, made(p.plugins))!
  d.arrive([thing(0), thing(3)], 0)
  d.arrive([thing(100)], 1)
  d.frame([])
  expect(meshes(p.scene)).toEqual([])
  d.show()
  const [near, far] = meshes(p.scene)
  expect([near.name, near.count, near.castShadow]).toEqual(['t-0', 2, true])
  expect([far.name, far.count, far.castShadow]).toEqual(['t-1-billboard', 1, true])
  // The box stands on its foot: its lowest point is on y = 0 at the instance's foot.
  near.geometry.computeBoundingBox()
  expect(near.geometry.boundingBox!.min.y).toBeCloseTo(0, 9)
  expect(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(near.instanceMatrix.array, 16))).toEqual(new THREE.Vector3(3, 0, 0))
  // The card is cut at cutout and written to depth; the billboard has its own depth material.
  expect([far.material as THREE.Material].map(m => [m.transparent, m.alphaTest, m.depthWrite])).toEqual([[false, 0.4, true]])
  expect(far.customDepthMaterial).toBeInstanceOf(THREE.MeshDepthMaterial)
  const tight = page()
  tight.come()
  const t = draw({ asset: 'trees', lods: [0, 1], shadow: 40, leaf: 0.5 }, made(tight.plugins))!
  t.show()
  expect(meshes(tight.scene).map(m => m.castShadow)).toEqual([true, false])
})

test('leaving keeps a look packed: the last instance takes the slot let go, its matrix and grey with it', () => {
  const p = page()
  const d = draw({ shape: { detail: 1, lumpy: [0.7, 0.3], squash: 0.7 }, colour: '#777777', lods: [0], shadow: 0, leaf: 0 }, made(p.plugins))!
  d.show()
  const a = d.arrive([thing(0, 0.8), thing(1, 0.9)], 0)
  d.arrive([thing(2, 1.1)], 0)
  d.leave(a)
  d.frame([])
  const [m] = meshes(p.scene)
  expect(m.count).toBe(1)
  expect(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(m.instanceMatrix.array, 0)).x).toBeCloseTo(2, 6)
  expect(m.instanceColor!.array[0]).toBeCloseTo(1.1, 6)
})

test('a look full to its capacity grows, keeping every instance, on the scene in the old one\'s place', () => {
  const p = page()
  const d = draw({ shape: { detail: 0, lumpy: [1, 0], squash: 1 }, colour: '#777777', lods: [0], shadow: 0, leaf: 0 }, made(p.plugins))!
  d.show()
  const before = meshes(p.scene)[0]
  d.arrive(Array.from({ length: 65 }, (_, k) => thing(k)), 0)
  d.frame([])
  const after = meshes(p.scene)
  expect(after.length).toBe(1)
  expect(after[0]).not.toBe(before)
  expect(after[0].count).toBe(65)
  expect(after[0].instanceMatrix.count).toBe(128)
  expect(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(after[0].instanceMatrix.array, 64 * 16)).x).toBeCloseTo(64, 6)
})

test('hollows reach every material as many boxes as were handed, each the inverse of its box', () => {
  const p = page()
  p.come()
  const d = draw({ asset: 'trees', lods: [0, 1], shadow: 0, leaf: 0 }, made(p.plugins, 2))!
  d.frame([{ at: [1, 2, 3], rot: [0, 0, 0, 1], half: [2, 2, 2] }])
  expect(p.splices.length).toBe(2)
  const box = new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3), new THREE.Quaternion(), new THREE.Vector3(2, 2, 2)).invert()
  for (const s of p.splices) {
    const u = s!.uniforms as { inHollow: { value: THREE.Matrix4[] }; inHollows: { value: number } }
    expect(u.inHollows.value).toBe(1)
    expect(u.inHollow.value.length).toBe(2)
    expect(u.inHollow.value[0].equals(box)).toBe(true)
    expect(s!.fragment!.clipping_planes_fragment).toContain('discard')
  }
  const none = page()
  none.come()
  draw({ asset: 'trees', lods: [0], shadow: 0, leaf: 0 }, made(none.plugins))
  expect(none.splices).toEqual([undefined])
})

test('a card with no world.instances3d throws naming the layer; a change to world.instances3d makes a Drawing stale', () => {
  const bare = page({})
  bare.come()
  expect(() => draw({ asset: 'trees', lods: [1], shadow: 0, leaf: 0 }, made(bare.plugins))).toThrow("lod3d layer copse's trees has cards, and world.instances3d gives no cutout and coverage")
  const world: Record<string, unknown> = { instances3d: { cutout: 0.4, coverage: 0.3 } }
  const p = page(world)
  p.come()
  const d = draw({ asset: 'trees', lods: [0], shadow: 0, leaf: 0 }, made(p.plugins))!
  expect(d.stale()).toBe(false)
  world.instances3d = { cutout: 0.5, coverage: 0.3 }
  expect(d.stale()).toBe(true)
})

test('a Drawing is stale once world.instances3d\'s cutout, coverage or behaviors mods differ, written in place or not, and not while they stay the same, a fresh copy of them included', () => {
  const s = { cutout: 0.4, coverage: 0.3, mods: { behaviors: ['a'] } }
  const world: Record<string, unknown> = { instances3d: s }
  const p = page(world)
  p.come()
  const d = draw({ asset: 'trees', lods: [0], shadow: 0, leaf: 0 }, made(p.plugins))!
  expect([d.stale(), d.stale()]).toEqual([false, false])
  // Written in place, as a dev page's panel writes a scene: a number, and an entry deep in the mods.
  s.cutout = 0.5
  expect(d.stale()).toBe(true)
  s.cutout = 0.4
  expect(d.stale()).toBe(false)
  s.mods.behaviors.push('b')
  expect(d.stale()).toBe(true)
  s.mods.behaviors.pop()
  expect(d.stale()).toBe(false)
  // A field the Drawing is not made by is not read.
  ;(s as Record<string, unknown>).kinds = {}
  expect(d.stale()).toBe(false)
  world.instances3d = structuredClone(s)
  expect(d.stale()).toBe(false)
})

test('the kinds world.instances3d names are drawn by Instances made again when world.instances3d differs, written in place deep inside or not, and kept while it stays the same, a fresh copy of it included', () => {
  const s = { kinds: { rock: { shape: { detail: 0, lumpy: [1, 0], squash: 1 }, colour: '#777777', lods: [0], shadow: 0, leaf: 0 } } }
  const world: Record<string, unknown> = { instances3d: s }
  const p = page(world)
  const tick = () => { p.plugins.instances3d.afterTick(p.plugins); return meshes(p.scene)[0] }
  const first = tick()
  expect(first).toBeDefined()
  expect(tick() === first).toBe(true)
  // One number deep in a look, written in place as a dev page's panel writes a scene.
  s.kinds.rock.shape.lumpy[1] = 0.2
  const again = tick()
  expect([again === first, first.parent === null]).toEqual([false, true])
  expect(tick() === again).toBe(true)
  world.instances3d = structuredClone(s)
  expect(tick() === again).toBe(true)
})

test('a row missing a LOD throws naming it; dispose and close take everything off the scene', () => {
  const p = page()
  p.come()
  expect(() => draw({ asset: 'trees', lods: [0, 2], shadow: 0, leaf: 0 }, made(p.plugins))).toThrow('lod3d layer copse row t has no LOD 2 in trees')
  const d: Drawing = draw({ asset: 'trees', lods: [0, 1], shadow: 0, leaf: 0 }, made(p.plugins))!
  d.show()
  d.arrive([thing(0)], 0)
  expect(meshes(p.scene).length).toBe(2)
  d.dispose()
  expect(meshes(p.scene)).toEqual([])
  const e = draw({ asset: 'trees', lods: [0], shadow: 0, leaf: 0 }, made(p.plugins))!
  e.show()
  p.plugins.instances3d.close(p.plugins)
  expect(meshes(p.scene)).toEqual([])
})

test('the mesh word checks its numbers against lod3d\'s rings, and draws as many shells as it has LODs', () => {
  const { mesh } = behaviors()
  const ok: Look = { asset: 'trees', lods: [0, 1], shadow: 0, leaf: 0.5 }
  const world = {}
  expect(() => mesh.check(ok, [50, 200], 'w', world)).not.toThrow()
  expect(mesh.shells(ok)).toBe(2)
  expect(() => mesh.check({ ...ok, shape: { detail: 1, lumpy: [1, 0], squash: 1 } }, [50, 200], 'w', world)).toThrow('w gives an asset and a shape: a look draws one')
  expect(() => mesh.check({ lods: [0], shadow: 0, leaf: 0 }, [50], 'w', world)).toThrow('w gives neither an asset, a shape nor a word: a look draws one')
  expect(() => mesh.check({ glow: {}, colour: '#fff', lods: [0], shadow: 0, leaf: 0 }, [50], 'w', world)).toThrow('w gives glow, which is no field of a look and which no plugin world.instances3d.mods.behaviors names delivers')
  expect(() => mesh.check({ shape: { detail: 1, lumpy: [1, 0], squash: 1 }, lods: [0], shadow: 0, leaf: 0 }, [50], 'w', world)).toThrow('w has no asset and no colour')
  expect(() => mesh.check(ok, [50], 'w', world)).toThrow('w lods [0,1] are not a LOD for each of up to 1 shells')
  expect(() => mesh.check({ ...ok, leaf: 2 }, [50, 200], 'w', world)).toThrow('w leaf 2 is not a share from 0 to 1')
  expect(() => mesh.check({ ...ok, shadow: -1 }, [50, 200], 'w', world)).toThrow('w shadow -1 is not metres from 0')
  const bare = page()
  delete (bare.plugins as Record<string, unknown>).instances3d
  expect(() => mesh.draw(ok, made(bare.plugins))).toThrow('lod3d layer copse draws a mesh through instances3d, which this scene does not list')
})
