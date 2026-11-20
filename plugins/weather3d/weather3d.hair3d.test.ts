// weather3d's mod for hair3d, given to hair3d by a key of a scene: `world.hair3d.mods.wind` is 'weather3d'.
// The test writes a manager and one child, `sky`, a weather under a sky, which `load` boots as a game's
// would, and reads the mod off a page's wire holding the child's rows, as hair3d's browser half does.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { load, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { skyOf, wind as windOf, type Weather } from './weather3d.sim.ts'
import { wind } from './weather3d.hair3d.ts'

const DT = 1 / 60
const weather = (over: Partial<Weather>): Weather => ({ cloud: 0, cirrus: 0.1, base: 1400, top: 2000, dense: 1, rain: 0, snow: 0, fog: 0, haze: 1, wind: 3, gust: 0.6, thunder: 0, dust: 0, ...over })
const url = '/weather3d-hair3d-test/weathers.json'
written(url, JSON.stringify({ breeze: weather({}) }))

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { sky: { file: 'sky.scene.json', suspend: false } }, dt: DT, entry: 'sky', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const sky = {
  world: {
    loader: { assets: { weathers: { type: 'json', url, preload: true } } },
    skydome3d: { day: 1200 },
    weather3d: { weathers: 'weathers', soak: 6, dry: 45, lay: 55, melt: 90, gusts: [3, 7, 11], bolt: { lasts: [0.1, 0.2], out: [300, 900] }, mods: { sky: 'skydome3d' } },
    hair3d: { hairs: 'hairs', mods: { wind: 'weather3d' } },
  },
  prefabs: {
    loader: {},
    skydome3d: { t: 600, rate: 1, doy: 172, lat: 46, phase: 0.25 },
    weather3d: { to: 'breeze', from: weather({}), mix: weather({}), blend: 1, fade: 0, wet: 0, pack: 0, windDeg: 30, flash: 0, strike: [0, 0], drift: [0, 0] },
    probe: {},
  },
  actors: [{ is: 'loader' }, { is: 'skydome3d' }, { is: 'weather3d' }, { is: 'probe' }],
}

const dir = mkdtempSync(join(tmpdir(), 'weather3d-hair3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'sky.scene.json'), JSON.stringify(sky))
writeFileSync(join(dir, 'sky.sim.ts'), `
import { loader } from ${path('../loader/loader.sim.ts')}
import { skydome3d } from ${path('../skydome3d/skydome3d.sim.ts')}
import { weather3d } from ${path('./weather3d.sim.ts')}
import file from './sky.scene.json' with { type: 'json' }
export const sim = { loader, skydome3d, weather3d, probe: { before(_me, _dt, w) { globalThis.weather3dHair3d = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

test('the scene\'s key gives hair3d the weather\'s wind as it gusts now and its drift, and none with no weather row', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('sky')!
  expect(mod(child.world, 'hair3d', 'wind')).toBe(wind)
  child.step(0)
  const w: W = (globalThis as any).weather3dHair3d
  const page = { wire: { scene: { world: child.world }, rows: child.rows } } as unknown as Plugins
  const row = () => child.rows.find(r => r.kind === 'weather3d')!
  for (let n = 0; n < 10; n++) {
    child.step(0.5)
    const clock = skyOf(w)
    const blowing = wind(page)!
    expect(blowing.wind).toEqual(windOf({ ...row().data, gusts: [3, 7, 11], t: clock.t, day: clock.day } as Parameters<typeof windOf>[0]))
    expect(blowing.drift).toEqual(row().data.drift)
  }
  expect(wind({ wire: { scene: { world: child.world }, rows: [] } } as unknown as Plugins)).toBeUndefined()
})
