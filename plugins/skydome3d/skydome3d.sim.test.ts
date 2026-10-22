// The sky's server half on scenes this test writes, each with a skydome3d row and its fixed numbers in
// `world.skydome3d`: the sun, the moon, the clock, and the acts.
import { expect, test } from 'vitest'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { moon, moonLit, skydome3d, sun, type Sky, type Table } from './skydome3d.sim.ts'

const DAY = 1200
const TABLE: Table = { day: DAY }
const prefab = (over: Partial<Sky> = {}): Sky => ({ t: DAY / 2, rate: 1, doy: 172, lat: 46, phase: 0.25, ...over })
// A row's fields with the fixed numbers beside them, as the sun and the moon read them.
const both = (s: Sky) => ({ ...s, ...TABLE })

// A truth whose one skydome3d row starts from the prefab with `over` written over it, stepped once by
// 0 s so a probe row hands over the truth's `w`, through which the acts are called as a game calls
// them.
const sky = (over: Partial<Sky> = {}) => {
  const scene: Scene = {
    world: { skydome3d: TABLE },
    prefabs: { skydome3d: prefab(over), probe: {} },
    actors: [{ is: 'skydome3d' }, { is: 'probe' }],
  }
  let w: W | undefined
  const t = boot(scene, { skydome3d, probe: { before(_me, _dt, got) { w = got } } })
  t.step(0)
  const row = () => t.rows.find(r => r.kind === 'skydome3d') as Row & { data: Sky }
  return { t, row, act: (name: string, ...args: (number | string)[]) => w!.call(row(), name, 0, ...args) }
}

const DEG = Math.PI / 180
const elevation = (s: Sky) => Math.asin(sun(both(s))[1])

test('the sun at noon stands 90° less the latitude less the declination, and at midnight that far below the pole, at three latitudes and two dates', () => {
  for (const lat of [-33, 0, 46]) for (const [doy, d] of [[80.5 + 365.25 / 4, 23.44 * DEG], [355, 23.44 * DEG * Math.sin((2 * Math.PI * (355 - 80.5)) / 365.25)]]) {
    expect(elevation(prefab({ lat, doy, t: DAY / 2 }))).toBeCloseTo(Math.PI / 2 - Math.abs(lat * DEG - d), 9)
    expect(elevation(prefab({ lat, doy, t: 0 }))).toBeCloseTo(Math.abs(lat * DEG + d) - Math.PI / 2, 9)
  }
  // At noon north of the tropic the sun is due south, −z being north; it rises in the east, +x.
  const noon = prefab({ lat: 46, t: DAY / 2 })
  expect(sun(both(noon))[2]).toBeGreaterThan(0)
  expect(sun(both(noon))[0]).toBeCloseTo(0, 12)
  expect(sun(both(prefab({ lat: 46, t: DAY * 0.3 })))[0]).toBeGreaterThan(0)
})

test('the moon lags the sun by its phase on the sun\'s path, lit by its phase, and its phase moves a lunar month of sky days', () => {
  const s = both(prefab({ phase: 0.5, t: 0 }))
  // Full at midnight: where the sun would stand at noon half a year on.
  const want = sun(both(prefab({ t: DAY / 2, doy: s.doy + 365.25 / 2 })))
  moon(s).forEach((v, i) => expect(v).toBeCloseTo(want[i], 12))
  expect(moonLit(s)).toBeCloseTo(1, 12)
  expect(moonLit(prefab({ phase: 0 }))).toBe(0)
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

test('the acts set the hour, the rate, the moon and the place, and no seat may send them', () => {
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
