// A subject's waves: the anchor a quarter of the way through a wave is its whole amplitude off its place,
// and two waves are added.
import { expect, test } from 'vitest'
import { waved } from './subjects.plugin.ts'

test('a wave is its amplitude either way of the anchor\'s place, its rate times a second, and waves add', () => {
  const sway = { amplitude: [0.2, 0, 0] as [number, number, number], rate: 1 }
  const bob = { amplitude: [0, 0.05, 0] as [number, number, number], rate: 2 }
  const quarter = waved([sway, bob], 0.25)
  expect(quarter[0]).toBeCloseTo(0.2)
  expect(quarter[1]).toBeCloseTo(0)
  const eighth = waved([sway, bob], 0.125)
  expect(eighth[0]).toBeCloseTo(0.2 * Math.SQRT1_2)
  expect(eighth[1]).toBeCloseTo(0.05)
  expect(waved([sway, bob], 0.75)[0]).toBeCloseTo(-0.2)
})
