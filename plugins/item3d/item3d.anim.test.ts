// item3d's mods for anim and motion3d: the sheet's holds and capsules handed as a kind's props and capsules.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { capsules, props } from './item3d.anim.ts'
import { capsules as capsulesOfMotion, props as propsOfMotion } from './item3d.motion3d.ts'

const wrench = { item: 'wrench', bone: 'RightHand', at: [0, 0.1, 0], turn: [0, 90, 0] }
const sword = { model: 'sword', bone: 'LeftHand', at: [0, 0, 0], turn: [0, 0, 0] }
const tube = { from: 'Hips', to: 'Spine2', radius: 0.15 }
const bodies = {
  worker: { holds: [wrench, sword] },
  guard: { capsules: [tube] },
  soldier: { holds: [{ item: 'skullcap', place: 'head', at: [0, 0, 0], turn: [0, 0, 0] }] },
}
const plugins = { item3d: { bodies: () => bodies } } as unknown as Plugins

test('a kind is handed the holds of the sheet\'s body of its name as its props, the sheet\'s own list, and its capsules', () => {
  for (const [p, c] of [[props, capsules], [propsOfMotion, capsulesOfMotion]] as const) {
    expect(p(plugins).held('worker')).toBe(bodies.worker.holds)
    expect(p(plugins).held('guard')).toEqual([])
    expect(p(plugins).held('nobody')).toEqual([])
    expect(c(plugins)('guard')).toBe(bodies.guard.capsules)
    expect(c(plugins)('worker')).toEqual([])
  }
})

test('a body that holds on a place is crowd3d\'s, and a plugin that hangs props on bones is refused it', () => {
  expect(() => props(plugins).held('soldier')).toThrow('item3d: the body soldier holds skullcap on the place head, and anim draws soldier and hangs a prop on a bone')
  expect(() => propsOfMotion(plugins).held('soldier')).toThrow('and motion3d draws soldier and hangs a prop on a bone')
})
