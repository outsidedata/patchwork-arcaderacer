// The actors extension's snap: a point snapped on each axis but its height.
import { expect, test } from 'vitest'
import { snapPoint } from './actors.extension.tsx'

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a point is snapped on each axis but height: h, and y where the axes have a z', () => {
  expect(snapPoint(['x', 'y', 'h'], [2.26, 7.74, 0.3], 0.5)).toEqual([2.5, 7.5, 0.3])
  expect(snapPoint(['x', 'y', 'z'], [2.26, 1.33, 7.74], 1)).toEqual([2, 1.33, 8])
  expect(snapPoint(['x', 'y', 'h'], [2.26449, 7.7, 0], 0)).toEqual([2.264, 7.7, 0])
})
