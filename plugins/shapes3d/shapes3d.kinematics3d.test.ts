import { describe, expect, it } from 'vitest'
import type { Row, W } from '#engine/engine.ts'
import { behaviors } from './shapes3d.kinematics3d.ts'

const { spline } = behaviors()
const me = {} as Row, w = {} as W
// A quarter of a circle of 10 m round the origin, from (10, 0, 0) to (0, 0, 10), through five places.
const points = [0, 1, 2, 3, 4].map(i => [10 * Math.cos((i * Math.PI) / 8), 2, 10 * Math.sin((i * Math.PI) / 8)])
const curve = { points, yaw: 0.5 }
const quarter = (Math.PI * 10) / 2

describe('shapes3d spline target', () => {
  it('moves the place metres along the curve and stops it at both ends', () => {
    expect(spline.step(curve, 1, [2], 0.5, me, w)).toBeCloseTo(2)
    expect(spline.step(curve, 1, [-5], 1, me, w)).toBe(0)
    const end = spline.step(curve, 1, [100], 1, me, w) as number
    expect(end).toBeCloseTo(quarter, 1)
  })

  it('stands the place on the curve, passing through every point, with the target own yaw and up', () => {
    const half = spline.at(curve, quarter / 2, me, w)
    expect(Math.hypot(half.at[0], half.at[2])).toBeCloseTo(10, 1)
    expect(half.at[0]).toBeCloseTo(half.at[2], 1)
    expect(half.at[1]).toBeCloseTo(2)
    expect(half.yaw).toBe(0.5)
    expect(half.normal).toEqual([0, 1, 0])
    expect(spline.at(curve, 0, me, w).at).toEqual(points[0])
  })

  it('finds the place nearest a point, and the way runs along the curve with the place as its number', () => {
    const s = spline.nearest(curve, [20, 2, 20], me, w) as number
    expect(s).toBeCloseTo(quarter / 2, 1)
    const [way] = spline.ways(curve, s, me, w)
    const here = spline.at(curve, s, me, w).at
    expect(way.dir[0]).toBeCloseTo(-Math.SQRT1_2, 1)
    expect(way.dir[2]).toBeCloseTo(Math.SQRT1_2, 1)
    expect([0, 1, 2].reduce((t, i) => t + (here[i] - way.from[i]) * way.dir[i], 0)).toBeCloseTo(s)
    expect(way.lo).toBe(0)
    expect(way.hi).toBeCloseTo(quarter, 1)
  })
})
