// The weather's server half under skydome3d, on a manager and one child, `sky`, this test writes,
// which `load` boots as a game's would, so the `sky` mod (`skydome3d.weather3d.ts`) is loaded; its
// `probe` hands the test the child's `w`, through which the acts are called as a game calls them. The
// weathers file is handed to the loader. Each test loads its own truth and writes the rows it starts
// from.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { sun, type Sky } from '#plugins/skydome3d/skydome3d.sim.ts'
import { fields, gust, wind, type Weather, type Weathered } from './weather3d.sim.ts'

const weather = (over: Partial<Weather>): Weather => ({
  cloud: 0, cirrus: 0.1, base: 1400, top: 2000, dense: 1, rain: 0, snow: 0, fog: 0, haze: 1, wind: 2, gust: 0.2, thunder: 0, dust: 0, ...over,
})
const WEATHERS: Record<string, Weather> = {
  clear: weather({}),
  rain: weather({ cloud: 0.97, base: 550, top: 2600, dense: 2.3, rain: 0.65, fog: 0.3, haze: 2.4, wind: 7, gust: 0.45 }),
  storm: weather({ cloud: 0.97, base: 450, top: 4200, dense: 3.4, rain: 1, fog: 0.42, haze: 2.8, wind: 14, gust: 0.85, thunder: 9 }),
  snow: weather({ cloud: 0.9, base: 700, dense: 1.9, snow: 0.55, fog: 0.35, wind: 4, gust: 0.35 }),
}
const WEATHERS_URL = '/weather3d-sim-test/weathers.json'
written(WEATHERS_URL, JSON.stringify(WEATHERS))

const DAY = 1200
const TABLE = { weathers: 'weathers', soak: 6, dry: 45, lay: 55, melt: 90, gusts: [3, 7, 11] as [number, number, number], bolt: { lasts: [0.12, 0.4] as [number, number], out: [300, 2500] as [number, number] } }
const DT = 1 / 60
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { sky: { file: 'sky.scene.json', suspend: false } }, dt: DT, entry: 'sky', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const scene = {
  world: {
    seed: 7,
    loader: { assets: { weathers: { type: 'json', url: WEATHERS_URL, preload: true } } },
    skydome3d: { day: DAY },
    weather3d: { ...TABLE, mods: { sky: 'skydome3d' } },
  },
  prefabs: {
    loader: {},
    skydome3d: { t: DAY / 2, rate: 1, doy: 172, lat: 46, phase: 0.25 },
    weather3d: { to: 'clear', from: WEATHERS.clear, mix: WEATHERS.clear, blend: 1, fade: 0, wet: 0, pack: 0, windDeg: 90, flash: 0, strike: [0, 0], drift: [0, 0] },
    probe: {},
  },
  actors: [{ is: 'loader' }, { is: 'skydome3d' }, { is: 'weather3d' }, { is: 'probe' }],
}

const dir = mkdtempSync(join(tmpdir(), 'weather3d-sim-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'sky.scene.json'), JSON.stringify(scene))
writeFileSync(join(dir, 'sky.sim.ts'), `
import { loader } from ${path('../loader/loader.sim.ts')}
import { skydome3d } from ${path('../skydome3d/skydome3d.sim.ts')}
import { weather3d } from ${path('./weather3d.sim.ts')}
import file from './sky.scene.json' with { type: 'json' }
export const sim = { loader, skydome3d, weather3d, probe: { before(_me, _dt, w) { globalThis.weather3dSim = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

// The child truth, its weather and sky rows started from `weather` and `sky` written over the
// prefabs, stepped once by 0 s so the probe hands over its `w`.
const sky = async (over: Partial<Weathered> = {}, clock: Partial<Sky> = {}) => {
  const t = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('sky')!
  const row = () => t.rows.find(r => r.kind === 'weather3d') as Row & { data: Weathered }
  const clockRow = () => t.rows.find(r => r.kind === 'skydome3d') as Row & { data: Sky }
  Object.assign(row().data, over)
  Object.assign(clockRow().data, clock)
  t.step(0)
  const w: W = (globalThis as any).weather3dSim
  return { t, row, clockRow, act: (name: string, ...args: (number | string)[]) => w.call(row(), name, 0, ...args) }
}

test('the weather act fades by dt/fade through the smoothstep of every field, a fade of 0 is there the next step, and a weather the file lacks throws', async () => {
  const { t, row, act } = await sky()
  act('weather', 'rain', 10)
  for (let i = 0; i < 12; i++) t.step(0.25)
  const b = 3 / 10, s = b * b * (3 - 2 * b)
  for (const f of fields) expect(row().data.mix[f]).toBeCloseTo(WEATHERS.clear[f] + (WEATHERS.rain[f] - WEATHERS.clear[f]) * s, 9)
  act('weather', 'storm', 0)
  t.step(0.25)
  expect(row().data.mix).toEqual(WEATHERS.storm)
  expect(() => act('weather', 'sleet', 5)).toThrow('weather3d has no weather sleet')
})

test('an interrupted fade starts from the standing mix, so nothing jumps', async () => {
  const { t, row, act } = await sky()
  act('weather', 'storm', 8)
  for (let i = 0; i < 12; i++) t.step(0.25)
  const standing = structuredClone(row().data.mix)
  act('weather', 'snow', 8)
  t.step(0.25)
  for (const f of fields) expect(Math.abs(row().data.mix[f] - standing[f])).toBeLessThan(Math.abs(WEATHERS.snow[f] - standing[f]) * 0.01 + 1e-12)
})

test('wet lags the rain and dries slower; pack lays under snow and melts faster under the sky\'s noon sun than at its midnight', async () => {
  const { t, row, act } = await sky({ to: 'rain', from: WEATHERS.rain, mix: WEATHERS.rain })
  const target = Math.min(1, WEATHERS.rain.rain * 1.5 + WEATHERS.rain.fog * 0.25)
  t.step(1)
  expect(row().data.wet).toBeCloseTo(target * (1 - Math.exp(-1 / 6)), 12)
  for (let i = 0; i < 60; i++) t.step(1)
  expect(row().data.wet).toBeCloseTo(target, 3)
  act('weather', 'clear', 0)
  t.step(1)
  const w = row().data.wet
  t.step(1)
  expect(row().data.wet).toBeCloseTo(w * Math.exp(-1 / 45), 12)

  const melted = async (hour: number) => {
    const s = await sky({ to: 'snow', from: WEATHERS.snow, mix: WEATHERS.snow }, { t: hour, rate: 0 })
    for (let i = 0; i < 400; i++) s.t.step(1)
    expect(s.row().data.pack).toBeCloseTo(0.35 + 0.55 * 0.75, 2)
    s.act('weather', 'clear', 0)
    s.t.step(1)
    const p = s.row().data.pack
    s.t.step(1)
    const up = Math.max(0, sun({ ...s.clockRow().data, day: DAY })[1])
    expect(s.row().data.pack).toBeCloseTo(p * Math.exp(-1 / (90 / (0.35 + up))), 12)
    return p - s.row().data.pack
  }
  expect(await melted(DAY / 2)).toBeGreaterThan((await melted(0)) * 2)
})

test('the wind gusts on the sky\'s clock, wanders, and drift is the integral of the wind vector', async () => {
  const { t, row, clockRow, act } = await sky({ windDeg: 30 })
  act('weather', 'storm', 0)
  t.step(0)
  let drift = [...row().data.drift], deg = row().data.windDeg
  for (let i = 0; i < 200; i++) {
    t.step(0.1)
    const r = { ...row().data, ...TABLE, t: clockRow().data.t, day: DAY }
    deg += (gust(r) - 0.5) * 0.1 * (2 + 0.6 * r.mix.wind)
    expect(r.windDeg).toBeCloseTo(((deg % 360) + 360) % 360, 9)
    const v = wind(r)
    drift = [drift[0] + v[0] * 0.1, drift[1] + v[1] * 0.1]
    expect(r.drift[0]).toBeCloseTo(drift[0], 9)
    expect(r.drift[1]).toBeCloseTo(drift[1], 9)
  }
})

test('lightning on one seed strikes the same on two truths, and each flash lasts and lands within the bolt', async () => {
  const strikes = async () => {
    const { t, row } = await sky({ to: 'storm', from: WEATHERS.storm, mix: WEATHERS.storm })
    const seen: string[] = []
    for (let i = 0; i < 3000; i++) {
      const was = row().data.flash
      t.step(1 / 30)
      const r = row().data
      if (r.flash > was) {
        seen.push(JSON.stringify([t.n, r.flash, r.strike]))
        expect(r.flash).toBeGreaterThanOrEqual(0.12)
        expect(r.flash).toBeLessThanOrEqual(0.4)
        expect(Math.hypot(...r.strike)).toBeGreaterThanOrEqual(300)
        expect(Math.hypot(...r.strike)).toBeLessThanOrEqual(2500)
      }
    }
    return seen
  }
  const a = await strikes()
  expect(a.length).toBeGreaterThan(5)
  expect(await strikes()).toEqual(a)
})
