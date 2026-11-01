// Where a person's course puts it: on a line as crowd3d has always walked one, and on a spline, a
// straight piece of shapes3d's at a time, across the ground at its speed, the next piece from where and
// when the last ended.
import { expect, test } from 'vitest'
import type { Row } from '#engine/engine.ts'
import { drawn } from '#plugins/shapes3d/shapes3d.kinematics3d.ts'
import { ends, facing, frame, piece, standing, where } from './crowd3d.sim.ts'

const person = (data: Record<string, unknown>) => ({ id: 1, kind: 'person', data: { yaw: 0.3, speed: 1.5, since: 2, through: null, ...data } }) as unknown as Row

test('a line: as far along it as the speed carries it across the ground, its height with it, at its end once there', () => {
  const r = person({ pos: [0, 0, 0], to: [3, 1.5, 4] })
  expect(where(r, 2)).toEqual([0, 0, 0])
  const half = where(r, 2 + 2.5 / 1.5)
  expect(half[0]).toBeCloseTo(1.5, 9)
  expect(half[1]).toBeCloseTo(0.75, 9)
  expect(half[2]).toBeCloseTo(2, 9)
  expect(where(r, 100)).toEqual([3, 1.5, 4])
  expect(ends(r)).toBeCloseTo(2 + 5 / 1.5, 9)
  expect(piece(r, 3)).toEqual({ pos: [0, 0, 0], to: [3, 1.5, 4], since: 2, yaw: 0.3, n: 0, normal: [0, 1, 0], normalTo: [0, 1, 0] })
  expect(standing(r, 2 + 2.5 / 1.5)).toEqual({ at: where(r, 2 + 2.5 / 1.5), normal: [0, 1, 0], yaw: 0.3 })
  // Ends one over the other: at the end. A speed of 0: at its start.
  expect(where(person({ pos: [1, 0, 1], to: [1, 2, 1] }), 2)).toEqual([1, 2, 1])
  expect(where(person({ pos: [0, 0, 0], to: [3, 0, 4], speed: 0 }), 50)).toEqual([0, 0, 0])
})

// The way a yaw faces in the world on the ground whose up is `n`.
const ahead = (n: number[], yaw: number) => frame(n).map(r => r[0] * Math.sin(yaw) + r[2] * Math.cos(yaw))
const near = (a: number[], b: number[]) => b.forEach((v, i) => expect(a[i]).toBeCloseTo(v, 9))
const S = Math.SQRT1_2

test('up a wall: across the wall\'s ground at the speed, facing up it in the wall\'s frame', () => {
  // The wall x = 0, its up +x; walked straight up it, 3 metres.
  const r = person({ pos: [0, 0, 0], to: [0, 3, 0], normal: [1, 0, 0], normalTo: [1, 0, 0] })
  expect(ends(r)).toBeCloseTo(2 + 3 / 1.5, 9)
  near(where(r, 3), [0, 1.5, 0])
  const yaw = facing([0, 0, 0], [0, 3, 0], [1, 0, 0], 0.3)
  near(ahead([1, 0, 0], yaw), [0, 1, 0])
  // On the floor that walk is one over the other: at its end at once.
  expect(where(person({ pos: [0, 0, 0], to: [0, 3, 0] }), 2)).toEqual([0, 3, 0])
})

test('from the floor onto the edge: the up turns with the way walked, across the ground under it halfway', () => {
  // From the floor at x = 1 to the edge where it meets the wall x = 0, the edge's up halfway between.
  const edge = [S, S, 0]
  const yaw = facing([1, 0, 0], [0, 0, 0], [Math.sin(Math.PI / 8), Math.cos(Math.PI / 8), 0], 0)
  const r = person({ pos: [1, 0, 0], to: [0, 0, 0], normal: [0, 1, 0], normalTo: edge, yaw })
  const wide = Math.cos(Math.PI / 8)
  expect(ends(r)).toBeCloseTo(2 + wide / 1.5, 9)
  const half = standing(r, 2 + wide / 3)
  near(half.at, [0.5, 0, 0])
  near(half.normal, [Math.sin(Math.PI / 8), Math.cos(Math.PI / 8), 0])
  // Halfway, it faces along the floor, the way it walks, laid onto the ground under it.
  near(ahead(half.normal, half.yaw), [-Math.cos(Math.PI / 8), Math.sin(Math.PI / 8), 0])
  // There, on the edge's up, facing on over it toward the wall.
  const there = standing(r, 100)
  near(there.at, [0, 0, 0])
  near(there.normal, edge)
  near(ahead(there.normal, there.yaw), [-S, S, 0])
})

test('on the ceiling: the up straight down is half a turn about x, and the way faced keeps to it', () => {
  const r = person({ pos: [0, 4, 0], to: [2, 4, 0], normal: [0, -1, 0], normalTo: [0, -1, 0] })
  near(frame([0, -1, 0]).map(row => row[1]), [0, -1, 0])
  const yaw = facing([0, 4, 0], [2, 4, 0], [0, -1, 0], 0)
  near(ahead([0, -1, 0], yaw), [1, 0, 0])
  expect(ends(r)).toBeCloseTo(2 + 2 / 1.5, 9)
  expect(standing({ ...r, data: { ...r.data, yaw } } as Row, 2.5).yaw).toBe(yaw)
})

test('a spline\'s ups: the first piece starts on `normal`, the last ends on `normalTo`, each between by the metres along', () => {
  const through = [[0, 1, 0.2]]
  const r = person({ pos: [0, 0, 1], to: [0, 2, 0], through, normal: [0, 1, 0], normalTo: [1, 0, 0] })
  const { at } = drawn({ points: [[0, 0, 1], ...through, [0, 2, 0]] })
  const first = piece(r, 2)
  expect(first.normal).toEqual([0, 1, 0])
  const last = piece(r, 1000)
  near(last.normalTo, [1, 0, 0])
  // The up of the piece's start is the turn from the one to the other by the metres along it.
  const f = at[last.n] / at[at.length - 1]
  const blended = [f, 1 - f, 0]
  const l = Math.hypot(...blended)
  near(last.normal, blended.map(v => v / l))
})

test('a spline: walked a piece of shapes3d\'s at a time, each across the ground at the speed, facing along it', () => {
  const through = [[2, 1, 2], [4, 2, 0]]
  const r = person({ pos: [0, 0, 0], to: [6, 3, 2], through })
  const { pts } = drawn({ points: [[0, 0, 0], ...through, [6, 3, 2]] })
  const across = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[2] - a[2])
  let t = 2
  for (let n = 0; n < pts.length - 1; n++) {
    const p = piece(r, t + 1e-9)
    expect(p.n).toBe(n)
    expect(p.pos).toEqual(pts[n])
    expect(p.to).toEqual(pts[n + 1])
    expect(p.since).toBeCloseTo(t, 9)
    expect(p.yaw).toBeCloseTo(Math.atan2(pts[n + 1][0] - pts[n][0], pts[n + 1][2] - pts[n][2]), 9)
    // Half way along the piece by the clock, half way along it.
    const step = across(pts[n], pts[n + 1]) / 1.5
    const mid = where(r, t + step / 2)
    for (let i = 0; i < 3; i++) expect(mid[i]).toBeCloseTo((pts[n][i] + pts[n + 1][i]) / 2, 9)
    t += step
  }
  expect(ends(r)).toBeCloseTo(t, 9)
  // At its end, and on past it, at `to`: the last piece, stayed on.
  for (let i = 0; i < 3; i++) expect(where(r, t + 5)[i]).toBeCloseTo([6, 3, 2][i], 9)
  expect(piece(r, t + 5).n).toBe(pts.length - 2)
  // A new spline handed in its place is cut again.
  const other = person({ pos: [0, 0, 0], to: [6, 3, 2], through: [[3, 0, 3]] })
  expect(piece(other, 2).to).toEqual(drawn({ points: [[0, 0, 0], [3, 0, 3], [6, 3, 2]] }).pts[1])
})
