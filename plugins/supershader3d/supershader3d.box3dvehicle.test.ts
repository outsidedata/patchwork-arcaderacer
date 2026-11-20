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
