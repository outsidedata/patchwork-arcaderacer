// How near a scatter3d preview may be asked for, however small the cell.
import { expect, test } from 'vitest'
import { furthest } from './scatter3d.extension.tsx'

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the within a refusal names is one the preview answers however small the cell, in four digits, and none where no positive one is', () => {
  for (const cell of [13, 2.2, 0.3, 0.001, 7e-5, 1e-5, 1e-9, 1e-300]) {
    const w = furthest(cell)!
    expect(w).toBeGreaterThan(0)
    expect(Math.ceil(w / cell)).toBeLessThanOrEqual(127)
    expect(Number(w.toPrecision(4))).toBe(w)
  }
  expect([furthest(2.2), furthest(0.3), furthest(1e-5)]).toEqual([279.4, 38.09, 0.00127])
  expect(furthest(5e-324)).toBeUndefined()
})
