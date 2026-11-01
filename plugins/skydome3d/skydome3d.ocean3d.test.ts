// skydome3d's mods for ocean3d, given to ocean3d by two keys of a scene: `world.ocean3d.mods.light`
// and `.wind` are 'skydome3d'. The test writes a manager and one child, `sky`, a sky over the sea,
// which `load` boots as a game's would.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene } from '#engine/engine.ts'
import { load, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { light, wind } from './skydome3d.ocean3d.ts'

const DT = 1 / 60
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { sky: { file: 'sky.scene.json', suspend: false } }, dt: DT, entry: 'sky', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const sky = {
  world: {
    skydome3d: { day: 1200 },
    ocean3d: { mods: { light: 'skydome3d', wind: 'skydome3d' } },
  },
  prefabs: { skydome3d: { t: 600, rate: 1, doy: 172, lat: 46, phase: 0.25 } },
  actors: [{ is: 'skydome3d' }],
}

const dir = mkdtempSync(join(tmpdir(), 'skydome3d-ocean3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'sky.scene.json'), JSON.stringify(sky))
writeFileSync(join(dir, 'sky.sim.ts'), `
import { skydome3d } from ${path('./skydome3d.sim.ts')}
import file from './sky.scene.json' with { type: 'json' }
export const sim = { skydome3d }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

test('the scene\'s two keys give ocean3d this light and this wind, loaded before the first step', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('sky')!
  expect(mod(child.world, 'ocean3d', 'light')).toBe(light)
  expect(mod(child.world, 'ocean3d', 'wind')).toBe(wind)
})
