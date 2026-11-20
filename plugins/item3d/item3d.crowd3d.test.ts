// item3d's mod for crowd3d: the sheet's holds on places handed as crowd3d's table of items.
import { expect, test } from 'vitest'
import { placed } from './item3d.crowd3d.ts'

const cap = { item: 'skullcap', place: 'head', at: [0, -1.5, 0], turn: [0, 180, 0] }
const sword = { model: 'sword', place: 'rightHand', at: [0, 0.07, 0], turn: [90, 0, 0], scale: 1.2 }

test('the holds of crowd3d\'s bodies are a table of items, each by its item\'s or its model\'s name, listing each place it is held on', () => {
  const sheet = {
    soldier: { holds: [cap, sword, { item: 'skullcap', place: 'leftHand', at: [0, 0, 0], turn: [0, 0, 0] }] },
    captain: { holds: [cap] },
    worker: { holds: [{ item: 'wrench', bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }] },
  }
  expect(placed(sheet, ['soldier', 'captain', 'nobody'])).toEqual({
    skullcap: { item: 'skullcap', head: { at: [0, -1.5, 0], turn: [0, 180, 0] }, leftHand: { at: [0, 0, 0], turn: [0, 0, 0] } },
    sword: { model: 'sword', rightHand: { at: [0, 0.07, 0], turn: [90, 0, 0], scale: 1.2 } },
  })
})

test('a hold on a bone, one item held two ways on a place, and one name an item and a model are each refused', () => {
  expect(() => placed({ worker: { holds: [{ item: 'wrench', bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }] } }, ['worker']))
    .toThrow('item3d: the body worker holds wrench on the bone RightHand, and crowd3d draws worker and holds an item on a place')
  expect(() => placed({ soldier: { holds: [cap] }, captain: { holds: [{ ...cap, at: [0, -1.6, 0] }] } }, ['soldier', 'captain']))
    .toThrow('item3d: the bodies soldier and captain hold skullcap on head two ways')
  expect(() => placed({ soldier: { holds: [sword] }, captain: { holds: [{ item: 'sword', place: 'leftHand', at: [0, 0, 0], turn: [0, 0, 0] }] } }, ['soldier', 'captain']))
    .toThrow('item3d: sword is an item on one body and a model on another')
})
