// A test ground as grass3d fills a block of it, and a treader going round on it.
import { expect, test } from 'vitest'
import { fill, NOWHERE } from '#plugins/grass3d/grass3d.sim.ts'
import { groundOf, heightOf, treading, type Test, type Treader } from './grounds.sim.ts'

const hills: Test = { hills: [{ toward: 90, length: 40, height: 3 }], bare: { scale: 9, below: 0.42, edge: 0.18 } }
const field = { size: 240, cell: 0.5 }

test('grass3d fills a block of a test ground: its hills\' heights, grass and bare patches, and no ground past the field\'s edge', () => {
  const ground = groundOf(hills, field)
  const inField = fill(ground, 0, 0, field.cell, [[]])
  // 10 m east is a quarter of the way along a 40 m wave toward the east: its crest
  expect(inField.heights[20]).toBeCloseTo(3)
  const shares = [...inField.keeps]
  expect(shares.some(k => k === 1)).toBe(true)
  expect(shares.some(k => k === 0)).toBe(true)
  // the block from 128 m out lies past the field's edge at 120 m
  const past = fill(ground, 8, 0, field.cell, [[]])
  expect(past.heights.every(h => h <= NOWHERE)).toBe(true)
  expect(past.keeps.every(k => k === 0)).toBe(true)
})

test('a car goes round its circle on the ground: its body and wheels a quarter of the way round, turned the way it goes, each wheel on the ground under it', () => {
  const car: Treader = {
    parts: [
      { at: [0, 0.85, 0], box: { half: [0.65, 0.35, 1.8] } },
      { at: [0.85, 0.42, 1.25], box: { half: [0.16, 0.42, 0.42] } },
      { at: [0, 0, 0], cylinder: { radius: 0.3, height: 1.8 } },
    ],
    circle: 10,
    speed: 5,
  }
  const height = (x: number, z: number) => heightOf(hills, x, z)
  // a quarter of a circle of 10 m is 5π m, π seconds at 5 m/s: from (10, 0) round to (0, 10), going toward −x
  const [body, wheel, driver] = treading(car, height, Math.PI)
  expect(body!.hyperbox.at[0]).toBeCloseTo(0)
  expect(body!.hyperbox.at[2]).toBeCloseTo(10)
  expect(body!.hyperbox.at[1]).toBeCloseTo(height(0, 10) + 0.85)
  // the wheel 0.85 m out from the circle's middle and 1.25 m ahead
  expect(wheel!.hyperbox.at[0]).toBeCloseTo(-1.25)
  expect(wheel!.hyperbox.at[2]).toBeCloseTo(10.85)
  expect(wheel!.hyperbox.at[1]).toBeCloseTo(height(-1.25, 10.85) + 0.42)
  // turned a quarter turn about y, its own +z toward −x
  expect(body!.hyperbox.rot[1]).toBeCloseTo(-Math.SQRT1_2)
  expect(body!.hyperbox.rot[3]).toBeCloseTo(Math.SQRT1_2)
  expect(driver!.cylinder.pos[1]).toBeCloseTo(height(0, 10))
})
