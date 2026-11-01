// npc3d's crowd3d body on ground whose up is not [0, 1, 0]: walking writes the up where it stands and the
// order's, its way across the ground under it and its facing in that ground's frame; standing writes the
// up where it stood; and a row that carries no up and is handed none is written as ever.
import { expect, test } from 'vitest'
import type { Row, W } from '#engine/engine.ts'
import { frame, standing, where } from '#plugins/crowd3d/crowd3d.sim.ts'
import { bodies } from './npc3d.sim.ts'

const body = bodies.crowd3d
const w = undefined as unknown as W
const person = (data: Record<string, unknown>) =>
  ({ id: 1, kind: 'person', data: { pos: [0, 0, 0], to: [0, 0, 0], yaw: 0, speed: 0, since: 0, through: null, clip: 'idle', body: 'b', holding: {}, ...data } }) as unknown as Row
const near = (a: number[], b: number[]) => b.forEach((v, i) => expect(a[i]).toBeCloseTo(v, 9))
// The way a yaw faces in the world on the ground whose up is `n`.
const ahead = (n: number[], yaw: number) => frame(n).map(r => r[0] * Math.sin(yaw) + r[2] * Math.cos(yaw))
const S = Math.SQRT1_2

test('walking from the floor onto the edge writes both ups, ends when the way across the ground under it is walked, and faces along it', () => {
  const me = person({ pos: [1, 0, 0], to: [1, 0, 0], normal: [0, 1, 0], normalTo: [0, 1, 0] })
  const ends = body.go(me, w, 2, [0, 0, 0], 1.5, 'walk', undefined, [S, S, 0])
  expect(me.data.normal).toEqual([0, 1, 0])
  expect(me.data.normalTo).toEqual([S, S, 0])
  expect(me.data.speed).toBe(1.5)
  expect(ends).toBeCloseTo(2 + Math.cos(Math.PI / 8) / 1.5, 9)
  // Halfway, it faces the way it walks, laid onto the ground under it.
  const half = standing(me, 2 + Math.cos(Math.PI / 8) / 3)
  near(ahead(half.normal, half.yaw), [-Math.cos(Math.PI / 8), Math.sin(Math.PI / 8), 0])
  // Stood there at the end, on the edge's up, facing on over the edge.
  body.stand(me, w, 10, 'idle')
  expect(me.data.speed).toBe(0)
  near(me.data.pos, [0, 0, 0])
  near(me.data.normal, [S, S, 0])
  expect(me.data.normalTo).toEqual(me.data.normal)
  near(ahead(me.data.normal, me.data.yaw), [-S, S, 0])
})

test('up the wall onto its up: the walk is the wall\'s 3 metres, not nothing across the floor', () => {
  const me = person({ pos: [0, 0, 0], to: [0, 0, 0], normal: [1, 0, 0], normalTo: [1, 0, 0] })
  const ends = body.go(me, w, 0, [0, 3, 0], 1.5, 'walk', undefined, [1, 0, 0])
  expect(ends).toBeCloseTo(2, 9)
  near(where(me, 1), [0, 1.5, 0])
  near(ahead([1, 0, 0], me.data.yaw), [0, 1, 0])
  // Halted halfway: there, on the wall's up, still facing up it.
  body.halt(me, 1)
  near(me.data.pos, [0, 1.5, 0])
  expect(me.data.normal).toEqual([1, 0, 0])
  near(ahead([1, 0, 0], me.data.yaw), [0, 1, 0])
})

test('a row that carries no up and is handed none is written as ever: no up, its yaw across the floor', () => {
  const me = person({ pos: [0, 0, 0], to: [0, 0, 0] })
  const ends = body.go(me, w, 0, [3, 1, 4], 1, 'walk')
  expect(ends).toBe(5)
  expect('normal' in me.data).toBe(false)
  expect('normalTo' in me.data).toBe(false)
  expect(me.data.yaw).toBe(Math.atan2(3, 4))
  body.stand(me, w, 1, 'idle')
  expect('normal' in me.data).toBe(false)
  expect(me.data.yaw).toBe(Math.atan2(3, 4))
})
