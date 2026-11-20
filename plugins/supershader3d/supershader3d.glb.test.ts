// A pro-ng glb read and assembled in supershader3d's calls (`supershader3d.glb.ts`), on the glb of the fixture
// (`supershader3d.glb.fixture.ts`): a solid triangle, a kit quad skinned to a fan's rotor, a sign of two morph targets.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Looks } from './supershader3d.plugin.ts'
import { assemble, unpack } from './supershader3d.glb.ts'
import { COURSE_ROWS, LOOKS, glbOf, made } from './supershader3d.glb.fixture.ts'

test('a glb is one skinned mesh in each call\'s material, every input read or its default, its targets on their mesh alone', async () => {
  const unpacked = await unpack(glbOf(made()))
  expect(unpacked.info.courses).toEqual(COURSE_ROWS)
  const solid = new THREE.MeshBasicMaterial(), relief = new THREE.MeshBasicMaterial()
  const mesh = assemble(THREE, unpacked, LOOKS, call => (call === 'solid' ? solid : relief)) as THREE.SkinnedMesh
  expect(mesh.isSkinnedMesh).toBe(true)
  // the solid triangle and the sign in the solid call, the kit's two in the relief call
  expect(mesh.geometry.groups.map(g => [g.start, g.count, g.materialIndex])).toEqual([[0, 6, 0], [6, 6, 1]])
  expect(mesh.material).toEqual([solid, relief])
  expect(mesh.skeleton.bones.map(b => b.name)).toEqual(['kit bones', 'fan rotor'])
  // every vertex but the kit's wholly on the bone that never moves; the kit's on the rotor
  const joint = mesh.geometry.getAttribute('skinIndex'), weight = mesh.geometry.getAttribute('skinWeight')
  expect([...Array(joint.count).keys()].map(v => [joint.getX(v), weight.getX(v)])).toEqual([[0, 1], [0, 1], [0, 1], [1, 1], [1, 1], [1, 1], [1, 1], [0, 1], [0, 1], [0, 1]])
  expect([...(mesh.geometry.getAttribute('lookId').array as Float32Array)]).toEqual([0, 0, 0, 1, 1, 1, 1, 0, 0, 0])
  expect(mesh.morphTargetDictionary).toEqual({ out: 0, up: 1 })
  expect([...(mesh.geometry.morphAttributes.position[0].array as Float32Array)]).toEqual([...Array(21).fill(0), 0, 0, 1, 0, 0, 1, 0, 0, 1])
  // with no moving thing it is a plain mesh
  const plain = assemble(THREE, await unpack(glbOf(made({ skinned: false }))), LOOKS, () => solid)
  expect(plain.isMesh && !(plain as THREE.SkinnedMesh).isSkinnedMesh).toBe(true)
})

test('a glb of the wrong shape throws, naming what is wrong', async () => {
  await expect(unpack(glbOf(made({ extras: {} })))).rejects.toThrow('supershader3d: the glb has no extras `vertex`; bake it again with the library\'s pro-ng/pack.mjs')
  const unpacked = await unpack(glbOf(made()))
  expect(() => assemble(THREE, unpacked, { materials: [LOOKS.materials[0]] } as Looks, () => new THREE.MeshBasicMaterial())).toThrow('supershader3d: a vertex\'s lookId 1 is no material of the looks')
  // an animation of a glb with no skin moves a node that is no joint
  const loose = made({ skinned: false })
  loose.gltf.nodes.push({ name: 'fan rotor' })
  loose.gltf.animations = [{ name: 'fan spin', channels: [{ sampler: 0, target: { node: 4, path: 'rotation' } }], samplers: [{ input: 0, output: 0 }] }]
  await expect(unpack(glbOf(loose))).rejects.toThrow('supershader3d: the glb\'s animation fan spin moves the node fan rotor, which is no joint of its skin')
  const wrong = made()
  wrong.gltf.animations[0].channels[0].target.path = 'weights'
  await expect(unpack(glbOf(wrong))).rejects.toThrow('supershader3d: the glb\'s animation fan spin moves weights, which is not a bone\'s rotation, translation or scale')
  // a bone's scale is a track as its place is
  const scaled = made()
  scaled.gltf.animations[0].channels[0].target.path = 'scale'
  expect((await unpack(glbOf(scaled))).animations[0].tracks[0].path).toBe('scale')
  const stepped = made()
  stepped.gltf.animations[0].samplers[0].interpolation = 'STEP'
  await expect(unpack(glbOf(stepped))).rejects.toThrow('supershader3d: the glb\'s animation fan spin is STEP, and its clips are linear')
  const missing = made()
  missing.gltf.nodes[0].extras.vertex.meshes.push('tower')
  await expect(unpack(glbOf(missing))).rejects.toThrow('supershader3d: the glb\'s extras name the mesh tower, which it has not')
})
