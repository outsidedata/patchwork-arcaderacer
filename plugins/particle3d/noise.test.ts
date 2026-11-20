// The force generators' noise field: within -1 to 1, the same every time it is asked, smooth (two
// points a hundredth apart read nearly the same), and not one number everywhere.
import { expect, test } from 'vitest'
import { curl, noise } from './noise.ts'

test('the curl is a field of pushes, the same every time, that varies over space and gathers nothing: as much flows into any small box as out of it', () => {
  const ways: number[] = []
  for (let n = 0; n < 500; n++) {
    const x = n * 0.137, y = n * 0.071 - 40, z = 17 - n * 0.093
    const c = curl(x, y, z)
    expect(curl(x, y, z)).toEqual(c)
    ways.push(c[0])
    // what leaves across each pair of faces of a box a thousandth across, summed
    const h = 0.0005
    const out = (curl(x + h, y, z)[0] - curl(x - h, y, z)[0] + curl(x, y + h, z)[1] - curl(x, y - h, z)[1] + curl(x, y, z + h)[2] - curl(x, y, z - h)[2]) / (2 * h)
    expect(Math.abs(out)).toBeLessThan(0.05)
  }
  expect(Math.max(...ways) - Math.min(...ways)).toBeGreaterThan(1)
})

test('the noise is a smooth field from -1 to 1, the same every time, and varies over space', () => {
  const seen: number[] = []
  for (let n = 0; n < 2000; n++) {
    const x = n * 0.137, y = n * 0.071 - 40, z = 17 - n * 0.093
    const v = noise(x, y, z)
    expect(v).toBeGreaterThanOrEqual(-1)
    expect(v).toBeLessThanOrEqual(1)
    expect(noise(x, y, z)).toBe(v)
    expect(Math.abs(noise(x + 0.01, y, z) - v)).toBeLessThan(0.05)
    seen.push(v)
  }
  expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(1)
})
