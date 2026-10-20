// The sky's server half on scenes this test writes, each with a skydome3d row, its fixed numbers in
// `world.skydome3d` and a weathers file handed to the loader: the sun against the arithmetic, the clock, the weather blend and its
// interrupted fade, the ground lagging the sky, the wind and its drift, lightning on the die, and
// the acts.
import { expect, test } from 'vitest'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { loader, written } from '#plugins/loader/loader.sim.ts'
import { declination, fields, gust, hourAngle, moon, moonLit, skydome3d, sun, wind, windSpeed, type Sky, type Table, type Weather } from './skydome3d.sim.ts'

const weather = (over: Partial<Weather>): Weather => ({
  cloud: 0, cirrus: 0.1, base: 1400, top: 2000, dense: 1, rain: 0, snow: 0, fog: 0, haze: 1, wind: 2, gust: 0.2, thunder: 0, dust: 0, ...over,
})
const WEATHERS: Record<string, Weather> = {
  clear: weather({}),
  rain: weather({ cloud: 0.97, base: 550, top: 2600, dense: 2.3, rain: 0.65, fog: 0.3, haze: 2.4, wind: 7, gust: 0.45 }),
  storm: weather({ cloud: 0.97, base: 450, top: 4200, dense: 3.4, rain: 1, fog: 0.42, haze: 2.8, wind: 14, gust: 0.85, thunder: 9 }),
  snow: weather({ cloud: 0.9, base: 700, dense: 1.9, snow: 0.55, fog: 0.35, wind: 4, gust: 0.35 }),
}
const URL = 'test/skydome3d/weathers.json'
written(URL, JSON.stringify(WEATHERS))

const DAY = 1200
const TABLE: Table = { day: DAY, weathers: 'weathers', soak: 6, dry: 45, lay: 55, melt: 90, gusts: [3, 7, 11], bolt: { lasts: [0.12, 0.4], out: [300, 2500] } }
const prefab = (over: Partial<Sky> = {}): Sky => ({
  t: DAY / 2, rate: 1, doy: 172, lat: 46, phase: 0.25,
  to: 'clear', from: WEATHERS.clear, mix: WEATHERS.clear, blend: 1, fade: 0,
  wet: 0, pack: 0, windDeg: 90, flash: 0, strike: [0, 0], drift: [0, 0],
  ...over,
})
// A row's fields with the fixed numbers beside them, as the sun, the moon and the wind read them.
const both = (s: Sky) => ({ ...s, ...TABLE })

// A truth whose one skydome3d row starts from the prefab with `over` written over it, stepped once by
// 0 s so a probe row hands over the truth's `w`, through which the acts are called as a game calls
// them.
const sky = (over: Partial<Sky> = {}, seed?: number) => {
  const scene: Scene = {
    world: { ...(seed === undefined ? {} : { seed }), skydome3d: TABLE, loader: { assets: { weathers: { type: 'json', url: URL, preload: true } } } },
    prefabs: { loader: {}, skydome3d: prefab(over), probe: {} },
    actors: [{ is: 'loader' }, { is: 'skydome3d' }, { is: 'probe' }],
  }
  let w: W | undefined
  const t = boot(scene, { loader, skydome3d, probe: { before(_me, _dt, got) { w = got } } })
  t.step(0)
  const row = () => t.rows.find(r => r.kind === 'skydome3d') as Row & { data: Sky }
  return { t, row, act: (name: string, ...args: (number | string)[]) => w!.call(row(), name, 0, ...args) }
}

const DEG = Math.PI / 180
const elevation = (s: Sky) => Math.asin(sun(both(s))[1])

test('the sun at noon stands 90° less the latitude less the declination, and at midnight that far below the pole, at three latitudes and two dates', () => {
  for (const lat of [-33, 0, 46]) for (const doy of [80.5 + 365.25 / 4, 355]) {
    const d = 23.44 * DEG * Math.sin((2 * Math.PI * (doy - 80.5)) / 365.25)
    expect(declination(doy)).toBeCloseTo(d, 12)
    const noon = prefab({ lat, doy, t: DAY / 2 })
    expect(hourAngle(noon.t, DAY)).toBe(0)
    expect(elevation(noon)).toBeCloseTo(Math.PI / 2 - Math.abs(lat * DEG - d), 9)
    const midnight = prefab({ lat, doy, t: 0 })
    expect(Math.abs(hourAngle(midnight.t, DAY))).toBeCloseTo(Math.PI, 12)
    expect(elevation(midnight)).toBeCloseTo(Math.abs(lat * DEG + d) - Math.PI / 2, 9)
    // At noon north of the tropic the sun is due south, −z being north; it rises in the east, +x.
    if (lat === 46) {
      expect(sun(both(noon))[2]).toBeGreaterThan(0)
      expect(sun(both(noon))[0]).toBeCloseTo(0, 12)
      expect(sun(both(prefab({ lat, doy, t: DAY * 0.3 })))[0]).toBeGreaterThan(0)
    }
    expect(Math.hypot(...sun(both(noon)))).toBeCloseTo(1, 12)
  }
})

test('the moon lags the sun by its phase on the sun\'s path, lit by (1 − cos 2πφ)/2, and its phase moves a lunar month of sky days', () => {
  const s = both(prefab({ phase: 0.5, t: 0 }))
  // Full at midnight: where the sun would stand at noon half a year on.
  const want = sun(both(prefab({ t: DAY / 2, doy: s.doy + 365.25 / 2 })))
  moon(s).forEach((v, i) => expect(v).toBeCloseTo(want[i], 12))
  expect(moonLit(s)).toBeCloseTo(1, 12)
  expect(moonLit(prefab({ phase: 0 }))).toBe(0)
  expect(moonLit(prefab({ phase: 0.25 }))).toBeCloseTo(0.5, 12)
  const { t, row } = sky({ phase: 0.1, rate: 3 })
  for (let i = 0; i < 100; i++) t.step(0.5)
  expect(row().data.phase).toBeCloseTo(0.1 + (100 * 0.5 * 3) / (DAY * 29.53), 12)
})

test('t moves at dt·rate and wraps at the day, the sun meeting itself across midnight', () => {
  const { t, row } = sky({ t: DAY - 1, rate: 4 })
  const before = sun(both(row().data))
  t.step(0.5)
  expect(row().data.t).toBeCloseTo(1, 9)
  const after = sun(both(row().data))
  before.forEach((v, i) => expect(Math.abs(v - after[i])).toBeLessThan(0.02))
  const back = sky({ t: 1, rate: -4 })
  back.t.step(0.5)
  expect(back.row().data.t).toBeCloseTo(DAY - 1, 9)
})

test('the blend moves by dt/fade and mix is its smoothstep across every field; a fade of 0 is there on the next step', () => {
  // The storm thunders, so the scene declares a seed.
  const { t, row, act } = sky({}, 1)
  act('weather', 'rain', 10)
  expect(row().data.to).toBe('rain')
  expect(row().data.blend).toBe(0)
  for (let i = 0; i < 12; i++) t.step(0.25)
  const b = 3 / 10, s = b * b * (3 - 2 * b)
  expect(row().data.blend).toBeCloseTo(b, 12)
  for (const f of fields) expect(row().data.mix[f]).toBeCloseTo(WEATHERS.clear[f] + (WEATHERS.rain[f] - WEATHERS.clear[f]) * s, 9)
  act('weather', 'storm', 0)
  t.step(0.25)
  expect(row().data.mix).toEqual(WEATHERS.storm)
  expect(() => act('weather', 'sleet', 5)).toThrow('skydome3d has no weather sleet')
})

test('an interrupted fade starts from the standing mix, so nothing jumps', () => {
  const { t, row, act } = sky({}, 1)
  act('weather', 'storm', 8)
  for (let i = 0; i < 12; i++) t.step(0.25)
  const standing = structuredClone(row().data.mix)
  act('weather', 'snow', 8)
  expect(row().data.from).toEqual(standing)
  t.step(0.25)
  for (const f of fields) expect(Math.abs(row().data.mix[f] - standing[f])).toBeLessThan(Math.abs(WEATHERS.snow[f] - standing[f]) * 0.01 + 1e-12)
})

test('wet lags the rain and dries slower; pack lays under snow and melts after, faster in the sun', () => {
  const { t, row, act } = sky({ to: 'rain', from: WEATHERS.rain, mix: WEATHERS.rain })
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

  const snow = (t0: number) => {
    const s = sky({ to: 'snow', from: WEATHERS.snow, mix: WEATHERS.snow, t: t0, rate: 0 })
    s.t.step(1)
    expect(s.row().data.pack).toBeCloseTo((0.35 + 0.55 * 0.75) * (1 - Math.exp(-1 / 55)), 12)
    for (let i = 0; i < 400; i++) s.t.step(1)
    expect(s.row().data.pack).toBeCloseTo(0.35 + 0.55 * 0.75, 2)
    s.act('weather', 'clear', 0)
    s.t.step(1)
    const p = s.row().data.pack
    s.t.step(1)
    const up = Math.max(0, sun(both(s.row().data))[1])
    expect(s.row().data.pack).toBeCloseTo(p * Math.exp(-1 / (90 / (0.35 + up))), 12)
    return p - s.row().data.pack
  }
  // Noon melts it faster than midnight.
  expect(snow(DAY / 2)).toBeGreaterThan(snow(0) * 2)
})

test('the wind gusts on whole cycles a day, wanders, and drift is the integral of the wind vector', () => {
  const { t, row, act } = sky({ windDeg: 30 }, 1)
  act('weather', 'storm', 0)
  const s = both(row().data)
  const g = (x: number) => 0.5 + [3, 7, 11].reduce((a, n, k) => a + Math.sin((2 * Math.PI * n * x) / DAY + k) / 6, 0)
  expect(gust(s)).toBeCloseTo(g(s.t), 12)
  expect(gust({ ...s, t: 0 })).toBeCloseTo(gust({ ...s, t: DAY - 1e-9 }), 6)
  let drift = [0, 0], deg = 30
  for (let i = 0; i < 200; i++) {
    t.step(0.1)
    const r = both(row().data)
    deg += (gust(r) - 0.5) * 0.1 * (2 + 0.6 * r.mix.wind)
    expect(r.windDeg).toBeCloseTo(((deg % 360) + 360) % 360, 9)
    const speed = r.mix.wind * (1 - 0.45 * r.mix.gust + 0.9 * r.mix.gust * gust(r))
    expect(windSpeed(r)).toBeCloseTo(speed, 12)
    const v = wind(r)
    // Blowing toward windDeg, clockwise from north: 0 toward −z, 90 toward +x.
    expect(v[0]).toBeCloseTo(speed * Math.sin(r.windDeg * DEG), 12)
    expect(v[1]).toBeCloseTo(-speed * Math.cos(r.windDeg * DEG), 12)
    drift = [drift[0] + v[0] * 0.1, drift[1] + v[1] * 0.1]
    expect(r.drift[0]).toBeCloseTo(drift[0], 9)
    expect(r.drift[1]).toBeCloseTo(drift[1], 9)
  }
})

test('lightning on one seed strikes the same on two truths, lasts and lands within the bolt, and a sky that never thunders needs no seed', () => {
  const strikes = (seed: number) => {
    const { t, row } = sky({ to: 'storm', from: WEATHERS.storm, mix: WEATHERS.storm }, seed)
    const seen: string[] = []
    for (let i = 0; i < 3000; i++) {
      const was = row().data.flash
      t.step(1 / 30)
      const r = row().data
      if (r.flash > was) {
        seen.push(JSON.stringify([t.n, r.flash, r.strike]))
        expect(r.flash).toBeGreaterThanOrEqual(0.12)
        expect(r.flash).toBeLessThanOrEqual(0.4)
        const d = Math.hypot(...r.strike)
        expect(d).toBeGreaterThanOrEqual(300)
        expect(d).toBeLessThanOrEqual(2500)
      }
    }
    return seen
  }
  const a = strikes(7)
  // thunder 9 is a chance of 9/60 a second: about 15 strikes in 100 s.
  expect(a.length).toBeGreaterThan(5)
  expect(strikes(7)).toEqual(a)
  expect(strikes(8)).not.toEqual(a)
  // A flash counts down by dt to 0.
  const { t, row } = sky({ flash: 0.3 })
  t.step(0.1)
  expect(row().data.flash).toBeCloseTo(0.2, 12)
  for (let i = 0; i < 5; i++) t.step(0.1)
  expect(row().data.flash).toBe(0)
})

test('the acts set the hour, the rate, the moon and the place', () => {
  const { row, act } = sky()
  act('time', 18)
  expect(row().data.t).toBeCloseTo(DAY * 0.75, 12)
  act('time', 30)
  expect(row().data.t).toBeCloseTo(DAY * 0.25, 12)
  act('rate', 20)
  expect(row().data.rate).toBe(20)
  act('moon', 1.25)
  expect(row().data.phase).toBeCloseTo(0.25, 12)
  act('place', -12, 30)
  expect([row().data.lat, row().data.doy]).toEqual([-12, 30])
  expect(skydome3d.open ?? []).toEqual([])
})
