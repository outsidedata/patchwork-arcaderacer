// render3d's mod of the loader: a scene naming it in `world.loader.mods.shaders` is prepared as the
// scenemanager prepares one, which loads the mod, and the loader's `shaders` is then render3d's own
// count of what it is compiling.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { mod, prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { render3d } from './render3d.plugin.ts'

test('the loader\'s shaders mod is render3d\'s count of what it is compiling', async () => {
  const world = { loader: { assets: {}, mods: { shaders: 'render3d' } } }
  await prepare({}, [], world)
  const shaders = mod<(plugins: any) => number>(world, 'loader', 'shaders')!
  // With no renderer, as in node, render3d compiles nothing ahead, so nothing waits.
  const r = render3d()
  r.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
  expect(shaders({ render3d: r })).toBe(0)
  // The count it hands on is render3d's own.
  expect(shaders({ render3d: { compiling: () => 3 } })).toBe(3)
})
