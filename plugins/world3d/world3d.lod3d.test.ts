// world3d's mod for lod3d, named by the scene's `world.lod3d.mods.hollows`. The test writes a manager and one child,
// `yard`, which `load` boots as a game's would, its place `yard`'s hollows file two buildings' boxes; on the page the
// mod hands lod3d each as a box square to the world, its middle and half sizes the file's.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { hollows } from './world3d.lod3d.ts'

const DT = 1 / 60
const at = '/world3d-lod3d-test/'
written(`${at}yard.hollows.json`, JSON.stringify([{ at: [1, 2, 3], half: [4, 2.5, 3] }, { at: [-10, 1, 0], half: [2, 1.5, 2] }]))

const yard = {
  world: {
    loader: { assets: { 'yard.hollows': { type: 'json', url: `${at}yard.hollows.json`, preload: true } } },
    world3d: { place: 'yard' },
    lod3d: { mods: { hollows: ['world3d'] } },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }],
  plugins: ['scenemanager'],
}
const dir = mkdtempSync(join(tmpdir(), 'world3d-lod3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const manager: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}

test('the scene\'s hollows are world3d\'s: each building of the place a box square to the world, as the hollows file gives it', async () => {
  const room = (await load(boot(manager, { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  expect(modsOf(room.world, 'lod3d', 'hollows')).toEqual([hollows])
  const plugins = { wire: { scene: { world: room.world } } } as unknown as Plugins
  expect(hollows(plugins)).toEqual([
    { at: [1, 2, 3], rot: [0, 0, 0, 1], half: [4, 2.5, 3] },
    { at: [-10, 1, 0], rot: [0, 0, 0, 1], half: [2, 1.5, 2] },
  ])
})
