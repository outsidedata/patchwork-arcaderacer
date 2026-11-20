// anim's mod for hair3d, given to hair3d by a key of a scene: `world.hair3d.mods.skins` names 'anim'. The
// test writes a manager and one child, which `load` boots as a game's would, and reads the mod off a page
// holding anim's models, as hair3d's browser half does.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { skins } from './anim.hair3d.ts'

const DT = 1 / 60
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'], seats: 1,
}
const yard = { world: { anim: { kinds: { xbot: {} } }, hair3d: { hairs: 'hairs', mods: { skins: ['anim'] } } }, prefabs: { engine: { dt: DT } }, actors: [], plugins: ['anim', 'hair3d'] }
const dir = mkdtempSync(join(tmpdir(), 'anim-hair3d-'))
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `import file from './yard.scene.json' with { type: 'json' }\nexport const sim = {}\nexport const scene = file\n`)
afterAll(() => rmSync(dir, { recursive: true }))

test('each row anim draws is a wearer of the kind it is drawn as, its skins its model\'s skinned meshes', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  expect(modsOf(child.world, 'hair3d', 'skins')).toEqual([skins])
  const root = new THREE.Group(), surface = new THREE.SkinnedMesh(), joints = new THREE.SkinnedMesh()
  root.add(surface, new THREE.Mesh(), joints)
  const models: Record<number, THREE.Object3D> = { 1: root }
  const rows = [{ id: 1, kind: 'player', data: { as: 'xbot' } }, { id: 2, kind: 'xbot', data: {} }, { id: 3, kind: 'rock', data: {} }] as Row[]
  const plugins = { wire: { scene: { world: child.world }, rows }, anim: { model: (id: number) => models[id] } } as unknown as Plugins
  // Row 2's model is not built yet, and a rock is no kind of anim's.
  expect(skins(plugins)).toEqual([{ id: 'anim 1', kind: 'xbot', skins: [{ skinned: surface }, { skinned: joints }] }])
})
