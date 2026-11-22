// supershader3d's models mod for box3dvehicle on the fixture's glb (`supershader3d.glb.fixture.ts`), its own looks
// counting stone 0 and slate 1, drawn in a scene whose looks file counts them the other way round.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Looks } from './supershader3d.plugin.ts'
import { LOOKS, glbOf, made } from './supershader3d.glb.fixture.ts'
import { models } from './supershader3d.box3dvehicle.ts'

test('a car\'s pro-ng model is built once the scene\'s looks have landed, each vertex counting its material as the scene does, in the scene\'s materials, casting and taking shadows', async () => {
  const scene = { materials: [LOOKS.materials[1], LOOKS.materials[0]] } as unknown as Looks
  const solid = new THREE.MeshBasicMaterial(), relief = new THREE.MeshBasicMaterial()
  let looks: Looks | undefined
  const plugins = {
    render3d: { THREE },
    supershader3d: {
      looks: () => looks,
      idOf: (name: string) => scene.materials.findIndex(m => m.name === name),
      material: (call: string) => (call === 'solid' ? solid : relief),
    },
  } as unknown as Plugins
  const maker = models(plugins)
  const unpacked = await maker.unpack(glbOf(made({ skinned: false })))
  expect(maker.build(unpacked, LOOKS)).toBeUndefined()
  looks = scene
  const mesh = maker.build(unpacked, LOOKS) as THREE.Mesh
  // the solid triangle and the sign (stone, the scene's 1), the kit's quad (slate, the scene's 0)
  expect([...(mesh.geometry.getAttribute('lookId').array as Float32Array)]).toEqual([1, 1, 1, 0, 0, 0, 0, 1, 1, 1])
  expect(mesh.material).toEqual([solid, relief])
  expect(mesh.castShadow && mesh.receiveShadow).toBe(true)
  // a material the scene's looks file does not hold
  looks = { materials: [LOOKS.materials[0]] } as unknown as Looks
  const only = { ...plugins, supershader3d: { ...plugins.supershader3d, idOf: (name: string) => (name === 'stone' ? 0 : undefined) } } as unknown as Plugins
  expect(() => models(only).build(unpacked, LOOKS)).toThrow('supershader3d: a model draws the material slate, which the scene\'s looks file does not hold')
})

test('a skinned model\'s rig poses each animation `at` the way through it, 0 its first key and 1 its last, and holds it there until it is posed again', async () => {
  const solid = new THREE.MeshBasicMaterial()
  const plugins = {
    render3d: { THREE },
    supershader3d: { looks: () => ({ materials: LOOKS.materials }), idOf: (name: string) => LOOKS.materials.findIndex(m => m.name === name), material: () => solid },
  } as unknown as Plugins
  const maker = models(plugins)
  const unpacked = await maker.unpack(glbOf(made({ skinned: true })))
  const mesh = maker.build(unpacked, LOOKS) as THREE.SkinnedMesh
  const rig = maker.rig(unpacked, mesh)
  const rotor = mesh.skeleton.bones[1]
  expect(rig.has('fan spin')).toBe(true)
  expect(rig.has('no such clip')).toBe(false)
  // the fan turns 0, 90, 180, 270, 360 degrees over its four quarters, its middle key 180: added to the bind pose, the
  // middle adds nothing and a quarter either side adds 90 degrees; the quaternion's w is cos of half the angle
  rig.pose('fan spin', 0.5)
  rig.apply()
  expect(rotor.quaternion.w).toBeCloseTo(1, 5)
  rig.pose('fan spin', 0.75)
  rig.apply()
  expect(Math.abs(rotor.quaternion.w)).toBeCloseTo(Math.SQRT1_2, 5)
  rig.pose('fan spin', 1)
  rig.apply()
  expect(Math.abs(rotor.quaternion.w)).toBeCloseTo(0, 5)
  rig.apply()
  expect(Math.abs(rotor.quaternion.w)).toBeCloseTo(0, 5)
  expect(() => rig.pose('no such clip', 0)).toThrow('supershader3d: the model has no animation no such clip')
})

test('a lamp\'s twin is the scene\'s look numbers of its lens dark and lit, which must be drawn in one call and held by the scene', () => {
  const calls = { dark: 'seeThrough', lit: 'seeThrough', other: 'solid' } as Record<string, string>
  const names = Object.keys(calls)
  let looks: Looks | undefined
  const plugins = {
    render3d: { THREE },
    supershader3d: { looks: () => looks, idOf: (name: string) => (names.includes(name) ? names.indexOf(name) : undefined) },
  } as unknown as Plugins
  const maker = models(plugins)
  expect(() => maker.twin('dark', 'lit')).toThrow('supershader3d: the twin of dark was asked before the scene\'s looks file landed')
  looks = { materials: names.map(name => ({ name, call: calls[name] })) } as unknown as Looks
  expect(maker.twin('dark', 'lit')).toEqual([0, 1])
  expect(() => maker.twin('dark', 'missing')).toThrow('supershader3d: a lamp draws the material missing, which the scene\'s looks file does not hold')
  expect(() => maker.twin('dark', 'other')).toThrow('supershader3d: the lamp materials dark and other are drawn in different calls (seeThrough, solid), so a model cannot change one for the other')
})
