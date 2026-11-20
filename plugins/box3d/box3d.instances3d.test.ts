// box3d's mod for instances3d, named by `world.instances3d.mods`: a scene's world with its mods loaded
// (`prepare`), a page of box3d rows, and instances3d drawing the kinds it names on three in node.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { mod, prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { instances3d } from '#plugins/instances3d/instances3d.plugin.ts'
import { behaviors, instances } from './box3d.instances3d.ts'

const world = {
  box3d: {
    gravity: [0, -10, 0], subStepCount: 4, static: [],
    kinds: {
      crate: { type: 'dynamic', shapes: [{ box: [0.4, 0.5, 0.6] }] },
      barrel: { type: 'dynamic', shapes: [{ cylinder: { height: 1, radius: 0.35, yOffset: -0.5, sides: 24 } }] },
      pill: { type: 'dynamic', shapes: [{ capsule: { center1: [-0.4, 0, 0], center2: [0.4, 0, 0], radius: 0.3 } }, { sphere: { center: [0, 1, 0], radius: 0.2 } }] },
      floor: { type: 'static', shapes: [{ heightField: { make: 'grid', rowCount: 2, columnCount: 2, scale: [1, 1, 1], makeHoles: false } }] },
    },
  },
  instances3d: {
    mods: { instances: ['box3d'], behaviors: ['box3d'] },
    kinds: {
      crate: { body: {}, colour: '#b07a43', roughness: 0.8, lods: [0], shadow: 1, leaf: 0 },
      barrel: { body: {}, colour: '#b8382f', roughness: 0.5, metalness: 0.35, lods: [0], shadow: 1, leaf: 0 },
    },
  },
}
const row = (id: number, kind: string, pos: number[], rot = [0, 0, 0, 1]) => ({ id, kind, data: { pos, rot } })

function page(rows: ReturnType<typeof row>[]) {
  const scene = new THREE.Scene()
  const plugins = {
    render3d: { THREE, scene, dress: (m: THREE.Material) => m },
    loader: { ready: () => true },
    wire: { scene: { world, plugins: ['box3d', 'instances3d', 'render3d'] }, rows },
  } as unknown as Plugins
  plugins.instances3d = instances3d()
  return { plugins, scene }
}
const meshes = (scene: THREE.Scene) => scene.children.filter((o): o is THREE.InstancedMesh => (o as THREE.InstancedMesh).isInstancedMesh)

test('the scene\'s mods are box3d\'s, and instances are every body row of a kind box3d lists, where it is', async () => {
  await prepare({}, [], world)
  expect(mod(world, 'instances3d', 'instances')).toBe(instances)
  const { plugins } = page([row(1, 'crate', [1, 2, 3]), row(2, 'player', [0, 0, 0]), row(3, 'barrel', [4, 5, 6], [0, 1, 0, 0])])
  expect(instances(plugins)).toEqual([{ kind: 'crate', at: [1, 2, 3], rot: [0, 0, 0, 1] }, { kind: 'barrel', at: [4, 5, 6], rot: [0, 1, 0, 0] }])
})

test('a body is its kind\'s shapes as Box3D holds them: a box of its half extents, a hull of Box3D\'s vertices, a capsule and a sphere placed in it', () => {
  const tools = { THREE, convex: (points: number[][]) => new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p))) }
  const [box] = behaviors().body.parts({}, 'crate', tools, world)
  box.geometry.computeBoundingBox()
  expect(box.geometry.boundingBox!.max.toArray().map(v => Math.fround(v))).toEqual([0.4, 0.5, 0.6].map(v => Math.fround(v)))
  const [barrel] = behaviors().body.parts({}, 'barrel', tools, world)
  barrel.geometry.computeBoundingBox()
  expect(barrel.geometry.boundingBox!.min.y).toBeCloseTo(-0.5, 5)
  expect(barrel.geometry.boundingBox!.max.y).toBeCloseTo(0.5, 5)
  expect(barrel.geometry.getAttribute('position').count).toBe(48)
  const [capsule, sphere] = behaviors().body.parts({}, 'pill', tools, world)
  expect(capsule.at).toEqual([0, 0, 0])
  expect(new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(...capsule.turn!)).toArray().map(v => Math.round(v * 1e6) / 1e6)).toEqual([1, 0, 0])
  expect(sphere.at).toEqual([0, 1, 0])
  expect(() => behaviors().body.parts({}, 'floor', tools, world)).toThrow('box3d draws floor\'s boxes, spheres, capsules and hulls for instances3d, and no heightField')
  expect(() => behaviors().body.parts({}, 'ghost', tools, world)).toThrow('instances3d draws ghost\'s body, and world.box3d.kinds lists no ghost')
})

test('instances3d draws each kind it names as one instanced mesh, every row where its row is this frame', async () => {
  await prepare({}, [], world)
  const rows = [row(1, 'crate', [1, 0, 0]), row(2, 'crate', [2, 0, 0]), row(3, 'barrel', [0, 3, 0])]
  const { plugins, scene } = page(rows)
  plugins.instances3d.afterTick(plugins)
  const [crates, barrels] = meshes(scene)
  expect([crates.count, barrels.count]).toEqual([2, 1])
  expect((crates.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('b07a43')
  expect((barrels.material as THREE.MeshStandardMaterial).metalness).toBe(0.35)
  expect(crates.castShadow).toBe(true)
  const at = (m: THREE.InstancedMesh, k: number) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(m.instanceMatrix.array, k * 16)).toArray()
  expect([at(crates, 0), at(crates, 1)]).toEqual([[1, 0, 0], [2, 0, 0]])
  // The next frame a crate has moved and one is gone.
  rows.splice(0, 1)
  rows[0] = row(2, 'crate', [7, 1, 0], [0, 0.7071068, 0, 0.7071068])
  plugins.instances3d.afterTick(plugins)
  expect(crates.count).toBe(1)
  expect(at(crates, 0)).toEqual([7, 1, 0])
  plugins.instances3d.close(plugins)
  expect(meshes(scene)).toEqual([])
})
