// item3d's bodies sheet: what `check` takes and what it refuses, naming the body and the field.
import { expect, test } from 'vitest'
import { check } from './item3d.bodies.ts'

const ITEMS = ['wrench', 'skullcap']
const sheet = (bodies: Record<string, unknown>) => () => check({ bodies }, ITEMS)

test('a sheet of bodies that hold on bones or on places, wear fabrics and have capsules is taken', () => {
  expect(sheet({
    worker: { holds: [{ item: 'wrench', bone: 'RightHand', at: [0, 0.1, 0], turn: [0, 90, 0] }, { model: 'sword', bone: 'LeftHand', at: [0, 0, 0], turn: [0, 0, 0] }] },
    soldier: { holds: [{ item: 'skullcap', place: 'head', at: [0, 0, 0], turn: [0, 180, 0], scale: 1.1 }] },
    guard: { wears: ['tee'], capsules: [{ from: 'Hips', to: 'Spine2', radius: 0.15 }, { bone: 'Head', at: [0, 0.1, 0], radius: 0.11 }] },
    bare: {},
  })).not.toThrow()
})

test('a sheet that is not one throws, naming the body and the field', () => {
  expect(() => check({}, ITEMS)).toThrow("item3d's bodies sheet has no bodies")
  expect(() => check({ bodies: {}, more: 1 }, ITEMS)).toThrow("item3d's bodies sheet has more, which item3d does not know")
  expect(sheet({ guard: { props: [] } })).toThrow("item3d's body guard has props, and a body is { holds, wears, capsules }")
  const hold = { item: 'wrench', bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }
  expect(sheet({ worker: { holds: [{ ...hold, model: 'sword' }] } })).toThrow("item3d's body worker's hold 0 names both an item and a model")
  expect(sheet({ worker: { holds: [{ ...hold, item: 'hammer' }] } })).toThrow('holds the item "hammer", which is none of world.item3d.items: wrench, skullcap')
  expect(sheet({ worker: { holds: [{ ...hold, place: 'head' }] } })).toThrow("item3d's body worker's hold 0 names both a bone and a place")
  expect(sheet({ worker: { holds: [hold, { item: 'skullcap', place: 'head', at: [0, 0, 0], turn: [0, 0, 0] }] } })).toThrow('one plugin draws a body')
  expect(sheet({ worker: { holds: [{ ...hold, at: [0, 0] }] } })).toThrow("item3d's body worker's hold 0 has an at of [0,0], and it is [x, y, z] metres")
  expect(sheet({ worker: { holds: [{ ...hold, scale: 2 }] } })).toThrow('has a scale and is on a bone')
  expect(sheet({ guard: { wears: ['tee', 'tee'] } })).toThrow("item3d's body guard wears tee twice")
  expect(sheet({ guard: { capsules: [{ from: 'Hips', to: 'Spine2', radius: 0 }] } })).toThrow("item3d's body guard's capsule 0 has a radius of 0, and it is metres above 0")
  expect(sheet({ guard: { capsules: [{ bone: 'Head', to: 'Neck', radius: 0.1 }] } })).toThrow("item3d's body guard's capsule 0 has to")
})

test('a body crowd3d draws, one that holds on places, wears no fabric and has no capsules', () => {
  const held = { item: 'skullcap', place: 'head', at: [0, 0, 0], turn: [0, 0, 0] }
  expect(sheet({ soldier: { holds: [held], wears: ['tee'] } })).toThrow("item3d's body soldier has wears and holds on places, which are crowd3d's")
  expect(sheet({ soldier: { holds: [held], capsules: [{ from: 'Hips', to: 'Spine2', radius: 0.15 }] } })).toThrow("item3d's body soldier has capsules and holds on places, which are crowd3d's")
})
