// crowd3d's mod for hair3d, given to hair3d by two keys of a scene: `world.hair3d.mods.skins` and
// `behaviors` both name 'crowd3d'. The test writes a manager and one child, which `load` boots as a game's
// would, and reads the mod off a page holding a body as crowd3d's `worn()` hands it.
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
import { behaviors, skins } from './crowd3d.hair3d.ts'
import type { Worn } from './crowd3d.plugin.ts'

const DT = 1 / 60
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'], seats: 1,
}
const yard = { world: { hair3d: { hairs: 'hairs', mods: { skins: ['crowd3d'], behaviors: ['crowd3d'] } } }, prefabs: { engine: { dt: DT } }, actors: [], plugins: ['crowd3d', 'hair3d', 'render3d'] }
const dir = mkdtempSync(join(tmpdir(), 'crowd3d-hair3d-'))
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `import file from './yard.scene.json' with { type: 'json' }\nexport const sim = {}\nexport const scene = file\n`)
afterAll(() => rmSync(dir, { recursive: true }))

test('each crowd3d body is one wearer of its name, and the word posed is the skin of a mesh group: a copy a person, its bones the pose\'s rows', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  expect(modsOf(child.world, 'hair3d', 'skins')).toEqual([skins])
  expect(modsOf(child.world, 'hair3d', 'behaviors')).toEqual([behaviors])

  // A body modelled a hundred units to the metre: a square of skin, a bone at each side.
  const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(100, 100, 1, 1) as unknown as THREE.InstancedBufferGeometry)
  g.setAttribute('crowdBones', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], 4))
  g.setAttribute('crowdWeights', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
  mesh.name = 'crowd3d horse horse_1'
  const pose = new THREE.Texture()
  const body: Worn = { name: 'horse', first: 2, count: 3, unit: 0.01, bones: ['root', 'tip'], inverses: [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(-50, 0, 0)], pose, groups: [mesh] }
  const plugins = { render3d: { THREE }, crowd3d: { worn: () => [body] } } as unknown as Plugins

  const [wearer] = skins(plugins)
  expect(wearer).toEqual({ id: 'crowd3d horse', kind: 'horse', skins: [{ posed: { body, mesh } }] })
  const skin = behaviors().posed(plugins, wearer.skins[0].posed)
  expect(skin).toMatchObject({ name: 'crowd3d horse horse_1', key: g.uuid, unit: 0.01 })
  expect([...skin.skin().positions].map(v => +v.toFixed(4))).toEqual([-0.5, 0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0])
  expect(skin.frames()[1]).toMatchObject({ name: 'tip' })
  expect(skin.frames()[1].bind[12]).toBeCloseTo(0.5, 6)
  expect(skin.pose()).toMatchObject({ bones: pose, first: 2, copies: 3 })

  // The body's people moved on in the pose: the same skin, where they are now.
  const later = { ...body, first: 0, count: 5 }
  expect(behaviors().posed(plugins, { body: later, mesh })).toBe(skin)
  expect(skin.pose()).toMatchObject({ first: 0, copies: 5 })
})
