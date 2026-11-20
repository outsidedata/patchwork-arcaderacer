// motion3d's kinematics3d mod: the states it delivers, read off a row and its kind's numbers in
// `world.kinematics3d.kinds`. `reversed`: the want across the ground turned further than the kind's
// `move.reverse` degrees from the way the body faces; a kind that gives none throws when it is asked, and
// one more than 180 throws as it is read. `toward`: a one-shot that steers turns as `move` turns a walk.
import { expect, test } from 'vitest'
import type { Row, W } from '#engine/engine.ts'
import { states, toward } from './motion3d.kinematics3d.ts'

// A world of one kind, `body`, its `move` numbers as given.
const world = (move: Record<string, number>) => ({ world: { kinematics3d: { kinds: { body: { move } } } } }) as unknown as W
const body = (want: number[], yaw: number) => ({ id: 1, kind: 'body', data: { want, yaw } }) as unknown as Row
const MOVE = { accel: 12, turnRate: 12, still: 0.05 }

test('a body walked further than the kind\'s reverse from the way it faces is reversed; nearer, or not walked, it is not', () => {
  const { reversed } = states()
  const w = world({ ...MOVE, reverse: 135 })
  // Facing +z (yaw 0): walked straight back, and 140° round, reversed; 130° round and straight ahead not.
  expect(reversed(body([0, -1], 0), w)).toBe(true)
  const at = (deg: number) => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)]
  expect(reversed(body(at(140), 0), w)).toBe(true)
  expect(reversed(body(at(-140), 0), w)).toBe(true)
  expect(reversed(body(at(130), 0), w)).toBe(false)
  expect(reversed(body([0, 1], 0), w)).toBe(false)
  // Facing round the other way, the same want across the ground is ahead of it.
  expect(reversed(body([0, -1], Math.PI), w)).toBe(false)
  // Not walked at all: not reversed.
  expect(reversed(body([0, 0], 0), w)).toBe(false)
})

test('reversed asked of a kind that gives no reverse throws naming it; a reverse over 180 throws as it is read', () => {
  const { reversed } = states()
  expect(() => reversed(body([0, -1], 0), world(MOVE))).toThrow('kinematics3d kind body gives no move.reverse, which the state reversed reads')
  expect(() => reversed(body([0, -1], 0), world({ ...MOVE, reverse: 200 }))).toThrow('kinematics3d kind body: move.reverse 200 is more than 180')
})

test('a steered one-shot turns toward its aim as move turns a walk: by 1 − exp(−turnRate·dt) of the way a step', () => {
  const w = world({ ...MOVE, reverse: 135 })
  const dt = 1 / 60
  const turned = toward(body([0, 1], 0), w, 0, Math.PI / 2, dt)
  expect(turned).toBeCloseTo((Math.PI / 2) * (1 - Math.exp(-12 * dt)), 12)
})
