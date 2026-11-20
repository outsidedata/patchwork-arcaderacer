// The thrown source on the stage file's own numbers: the bomb leaves the hand at `from` with `vel`,
// lands on the ground (the top of the stage's grid, y = 0), bounces off it at least once, comes to rest
// on it, and is put back in the hand and thrown the same way again.
import { expect, test } from 'vitest'
import fs from 'node:fs'
import { thrown } from './thrown.ts'

const stage = JSON.parse(fs.readFileSync(new URL('./particles.stage.json', import.meta.url), 'utf8'))
const DT = 1 / 60

test('the bomb is thrown, bounces on the ground, rests on it, and is thrown again the same way', () => {
  const t = thrown(stage.thrown)
  const path = (): number[][] => {
    const out: number[][] = []
    for (let i = 0; i < stage.thrown.every / DT; i++) {
      t.step(DT)
      out.push([...t.pos, ...t.vel])
    }
    return out
  }
  const first = path()
  // it starts where it is thrown from, rising and going the way it is thrown
  expect(first[0][0]).toBeGreaterThan(stage.thrown.from[0])
  expect(first[0][4]).toBeGreaterThan(0)
  // it never sinks into the ground
  expect(Math.min(...first.map(p => p[1]))).toBeGreaterThan(-0.01)
  // a bounce: falling, then rising again after it has come down near the ground
  let bounces = 0
  for (let i = 1; i < first.length; i++) if (first[i - 1][4] < -0.3 && first[i][4] > 0.3 && first[i][1] < 0.3) bounces++
  expect(bounces).toBeGreaterThanOrEqual(1)
  // at rest on the ground by the next throw, further along the way it was thrown
  const last = first.at(-1)!
  expect(Math.hypot(last[3], last[4], last[5])).toBeLessThan(0.2)
  expect(last[1]).toBeLessThan(0.1)
  expect(last[0]).toBeGreaterThan(stage.thrown.from[0] + 1)
  expect(t.since).toBeCloseTo(stage.thrown.every, 5)
  // put back and thrown again: the same first step
  t.again()
  expect(t.since).toBe(0)
  t.step(DT)
  expect(t.pos[0]).toBeCloseTo(first[0][0], 3)
  expect(t.pos[1]).toBeCloseTo(first[0][1], 3)
})
