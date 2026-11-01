// flight3d's plane's attitude: the nose is the body's −z turned by `rot`.
import { expect, test } from 'vitest'
import { fromAttitude, fromHeading, noseOf, rotate } from './flight3d.sim.ts'

test('a heading turns the nose clockwise from north seen from above, and a pitch raises it', () => {
  for (const h of [0, Math.PI / 2, 2]) {
    const n = rotate(fromHeading(h), [0, 0, -1])
    noseOf(h).forEach((v, i) => expect(n[i]).toBeCloseTo(v, 12))
  }
  expect(noseOf(Math.PI / 2)[0]).toBeCloseTo(1, 12)
  const climbing = rotate(fromAttitude(Math.PI / 2, 0.3), [0, 0, -1])
  expect(climbing[1]).toBeCloseTo(Math.sin(0.3), 12)
  expect(climbing[0]).toBeCloseTo(Math.cos(0.3), 12)
  expect(rotate(fromAttitude(1.1, 0.4), [1, 0, 0])[1]).toBeCloseTo(0, 12) // wings level
})
