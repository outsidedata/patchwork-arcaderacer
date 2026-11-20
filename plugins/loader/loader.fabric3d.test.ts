// loader's `garment` cut for fabric3d, on a page with no renderer: a garment's meshes joined at their seam
// into one sewn fabric, read by fabric3d's check, and its pinned piece held where it lay from the bone it
// was draped on. How a garment moves on a body is seen on the GPU, in a game's page.
import { expect, test } from 'vitest'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { behaviorsOf, check, sewn, wearing, type Fabrics } from '#plugins/fabric3d/fabric3d.plugin.ts'
import { joined } from './loader.fabric3d.ts'

// A skirt of two pieces: a waistband, a strip of two triangles a metre up, and a skirt of two triangles
// hanging from it, sewn along the waistband's lower edge.
const meshes = {
  waistband: { position: [0, 1, 0, 1, 1, 0, 0, 0.9, 0, 1, 0.9, 0], uv: [0, 0.1, 1, 0.1, 0, 0, 1, 0], index: [0, 2, 1, 1, 2, 3] },
  skirt: { position: [0, 0.9, 0, 1, 0.9, 0, 0, 0.4, 0, 1, 0.4, 0], uv: [0, 0.5, 1, 0.5, 0, 0, 1, 0], index: [0, 2, 1, 1, 2, 3] },
}
// the hips stood half a metre along x, a metre up, as the skirt was draped
const stood = { 'mixamorig:Hips': new THREE.Matrix4().makeTranslation(0.5, 1, 0).toArray() }
const skirt = {
  garment: { model: 'skirt', file: 'skirt-garment' }, paint: { colour: '#5a2a82' },
  weight: 0.3, stretch: 1, bend: 0.1, drag: 1, catch: 0.3, friction: 0.2, thick: 0.01,
  pins: [{ on: 'Hips', piece: 'waistband' }],
}

test('a garment of a waistband and a skirt sewn to it is one fabric of six points, read by fabric3d, its waistband held to the hips as it lay from them when it was draped', async () => {
  const cut = { ...joined(['waistband', 'skirt'], meshes), stood }
  // the seam's two points are one each: eight vertices, six points, and each piece has its four
  expect(cut.points.length / 3).toBe(6)
  expect(cut.pieces.waistband.length).toBe(4)
  expect(cut.pieces.skirt.length).toBe(4)

  const world: Record<string, any> = {
    fabric3d: {
      fabrics: 'fabrics', attach: [{ fabric: 'skirt', of: 'xbot' }], gravity: [0, -9.81, 0], substep: 1 / 240, passes: 4, most: 0.05,
      mods: { behaviors: ['loader', 'solids'], sources: ['anim'] },
    },
    loader: { assets: { skirt: { type: 'model' }, 'skirt-garment': { type: 'json' } } },
    scenemanager: { home: pathToFileURL(`${import.meta.dirname}/`).href },
  }
  await prepare({} as any, [], world)
  const words = behaviorsOf(world)
  const read = (fabric: unknown) => () => check({ fabrics: { skirt: fabric } } as Fabrics, world.fabric3d, words, world)
  expect(read(skirt)).not.toThrow()
  expect(read({ ...skirt, points: [4, 4] })).toThrow("fabric3d's fabric skirt has points of [4,4], and it is sewn by garment: its points are its mesh's")

  const lain = sewn("fabric3d's fabric skirt", skirt, cut)
  // the waistband's four points are held by pin 0, the skirt's hem by nothing
  expect([...lain.held].filter(p => p === 0).length).toBe(4)
  expect([...lain.held].filter(p => p === -1).length).toBe(2)
  expect(() => sewn("fabric3d's fabric skirt", { ...skirt, pins: [{ on: 'Hips', piece: 'hem' }] }, cut)).toThrow("fabric3d's fabric skirt's pin 0 holds the piece hem, and its pieces are waistband, skirt")

  // the hips now three metres along x and turned a quarter left: the waistband's first point, which lay
  // half a metre to the hips' right, lies half a metre behind them
  const hips = new THREE.Object3D()
  hips.position.set(3, 1, 0)
  hips.rotation.y = Math.PI / 2
  hips.updateMatrixWorld(true)
  const frame = wearing(THREE, new THREE.Matrix4().fromArray(lain.stood[0]!).invert(), hips, new THREE.Matrix4())
  const first = new THREE.Vector3(...lain.rest.subarray(0, 3)).applyMatrix4(frame).toArray().map(v => +v.toFixed(6))
  expect(first).toEqual([3, 1, 0.5])
})
