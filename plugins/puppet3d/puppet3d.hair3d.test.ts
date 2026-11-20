// puppet3d's mod for hair3d, given to hair3d by a key of a scene: `world.hair3d.mods.skins` names
// 'puppet3d'. The test writes a manager and one child, which `load` boots as a game's would, and reads the
// mod off a page holding puppet3d's bodies, as hair3d's browser half does.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { skins } from './puppet3d.hair3d.ts'

const DT = 1 / 60
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'], seats: 1,
}
const yard = { world: { puppet3d: { kinds: ['horse'] }, hair3d: { hairs: 'hairs', mods: { skins: ['puppet3d'] } } }, prefabs: { engine: { dt: DT } }, actors: [], plugins: ['puppet3d', 'hair3d'] }
const dir = mkdtempSync(join(tmpdir(), 'puppet3d-hair3d-'))
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `import file from './yard.scene.json' with { type: 'json' }\nexport const sim = {}\nexport const scene = file\n`)
afterAll(() => rmSync(dir, { recursive: true }))

test('each row puppet3d draws is a wearer of its kind, its skins its layouts\' bodies under the word skinned', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  expect(modsOf(child.world, 'hair3d', 'skins')).toEqual([skins])
  const body = { name: 'horse_1' }, rider = { name: 'xbot' }
  const bodies: Record<number, unknown[]> = { 1: [body, rider] }
  const rows = [{ id: 1, kind: 'horse', data: {} }, { id: 2, kind: 'horse', data: {} }, { id: 3, kind: 'rock', data: {} }] as Row[]
  const plugins = { wire: { scene: { world: child.world }, rows }, puppet3d: { bodies: (id: number) => bodies[id] ?? [] } } as unknown as Plugins
  // Row 2 is not drawn yet, and a rock is no kind of puppet3d's.
  expect(skins(plugins)).toEqual([{ id: 'puppet3d 1', kind: 'horse', skins: [{ skinned: body }, { skinned: rider }] }])
})
