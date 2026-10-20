// skydome3d's mods for ocean3d, given to ocean3d by two keys of a scene: `world.ocean3d.mods.light`
// and `.wind` are 'skydome3d'. The test writes a manager and one child, `sky`, a sky over the sea,
// which `load` boots as a game's would; its `probe` hands the test the child's `w`. The wind is the
// sky row's `mix.wind` as its weather fades.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { load, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Weather } from './skydome3d.sim.ts'
import { light, wind } from './skydome3d.ocean3d.ts'

const DT = 1 / 60
const weather = (over: Partial<Weather>): Weather => ({ cloud: 0, cirrus: 0.1, base: 1400, top: 2000, dense: 1, rain: 0, snow: 0, fog: 0, haze: 1, wind: 2, gust: 0, thunder: 0, dust: 0, ...over })
const url = '/skydome3d-ocean3d-test/weathers.json'
written(url, JSON.stringify({ clear: weather({}), storm: weather({ cloud: 0.97, rain: 1, wind: 14 }) }))

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { sky: { file: 'sky.scene.json', suspend: false } }, dt: DT, entry: 'sky', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const sky = {
  world: {
    loader: { assets: { weathers: { type: 'json', url, preload: true } } },
    skydome3d: { day: 1200, weathers: 'weathers', soak: 6, dry: 45, lay: 55, melt: 90, gusts: [3, 7, 11], bolt: { lasts: [0.1, 0.2], out: [300, 900] } },
    ocean3d: { mods: { light: 'skydome3d', wind: 'skydome3d' } },
  },
  prefabs: {
    loader: {},
    skydome3d: {
      t: 600, rate: 1, doy: 172, lat: 46, phase: 0.25, to: 'clear', from: weather({}), mix: weather({}), blend: 1, fade: 0,
      wet: 0, pack: 0, windDeg: 90, flash: 0, strike: [0, 0], drift: [0, 0],
    },
    probe: {},
  },
  actors: [{ is: 'loader' }, { is: 'skydome3d' }, { is: 'probe' }],
}

const dir = mkdtempSync(join(tmpdir(), 'skydome3d-ocean3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'sky.scene.json'), JSON.stringify(sky))
writeFileSync(join(dir, 'sky.sim.ts'), `
import { loader } from ${path('../loader/loader.sim.ts')}
import { skydome3d } from ${path('./skydome3d.sim.ts')}
import file from './sky.scene.json' with { type: 'json' }
export const sim = { loader, skydome3d, probe: { before(_me, _dt, w) { globalThis.skydome3dOcean3d = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const loaded = async () => (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('sky')!

test('the scene\'s two keys give ocean3d this light and this wind, loaded before the first step', async () => {
  const child = await loaded()
  expect(mod(child.world, 'ocean3d', 'light')).toBe(light)
  expect(mod(child.world, 'ocean3d', 'wind')).toBe(wind)
})

test('the wind is the sky row\'s mix.wind, step by step through a fade to a storm, and undefined with no sky row', async () => {
  const child = await loaded()
  child.step(0)
  const w: W = (globalThis as any).skydome3dOcean3d
  const row = child.rows.find(r => r.kind === 'skydome3d')!
  expect(wind(w)).toBe(2)
  w.call(row, 'weather', 0, 'storm', 4)
  const seen: number[] = []
  for (let n = 0; n < 24; n++) {
    child.step(0.25)
    expect(wind(w)).toBe(row.data.mix.wind)
    seen.push(wind(w)!)
  }
  expect(seen[0]).toBeLessThan(seen[8])
  expect(seen[23]).toBe(14)
  const none = { all: (): Row[] => [] } as unknown as W
  expect(wind(none)).toBeUndefined()
})
