// render3d's mod for hair3d, given to hair3d by a key of a scene: `world.hair3d.mods.behaviors` names
// 'render3d'. The test writes a manager and one child, which `load` boots as a game's would, and hands
// the word's behavior a skinned mesh bound in centimetres, as a Mixamo body's is.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Scene } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { behaviors } from './render3d.hair3d.ts'

const DT = 1 / 60
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'], seats: 1,
}
const yard = { world: { hair3d: { hairs: 'hairs', mods: { behaviors: ['render3d'] } } }, prefabs: { engine: { dt: DT } }, actors: [], plugins: ['hair3d', 'render3d'] }
const dir = mkdtempSync(join(tmpdir(), 'render3d-hair3d-'))
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `import file from './yard.scene.json' with { type: 'json' }\nexport const sim = {}\nexport const scene = file\n`)
afterAll(() => rmSync(dir, { recursive: true }))

test('the word skinned is the skin of a three SkinnedMesh: in metres, on its skeleton\'s own bones, one copy', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  expect(modsOf(child.world, 'hair3d', 'behaviors')).toEqual([behaviors])

  // A metre square of skin modelled a hundred units across under an armature scaled to a hundredth.
  const g = new THREE.PlaneGeometry(100, 100, 1, 1)
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute([2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0], 4))
  const armature = new THREE.Group(), root = new THREE.Bone(), tip = new THREE.Bone()
  armature.scale.setScalar(0.01)
  root.name = 'root'
  tip.name = 'tip'
  tip.position.x = 50
  root.add(tip)
  armature.add(root)
  armature.updateMatrixWorld(true)
  const mesh = new THREE.SkinnedMesh(g, new THREE.MeshStandardMaterial())
  mesh.name = 'hide'
  mesh.bind(new THREE.Skeleton([root, tip], [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(-50, 0, 0)]), new THREE.Matrix4())

  const plugins = { render3d: { THREE } } as unknown as Plugins
  const skin = behaviors().skinned(plugins, mesh)
  expect(skin.name).toBe('hide')
  expect(skin.key).toBe(g.uuid)
  expect(skin.unit).toBeCloseTo(0.01, 6)
  const held = skin.skin()
  expect([...held.positions].map(v => +v.toFixed(4))).toEqual([-0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0])
  expect([...held.weights]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])
  expect(held.frames.map(f => f.name)).toEqual(['root', 'tip'])
  expect(held.frames[1].bind[12]).toBeCloseTo(0.5, 6)
  const pose = skin.pose()
  expect(pose.bones).toBe(mesh.skeleton.boneTexture)
  expect(pose).toMatchObject({ first: -1, copies: 1 })
  expect(behaviors().skinned(plugins, mesh)).toBe(skin)
})
