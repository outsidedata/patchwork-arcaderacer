// walker's mod for ragdoll3d, given to ragdoll3d by one key of a scene:
// `world.ragdoll3d.mods.gravity` is 'walker'. It gives ragdoll3d each kind's
// `world.walker.kinds[kind].gravity`, and none for a kind walker does not list or a scene with no
// `world.walker`.
import { expect, test } from 'vitest'
import { gravity } from './walker.ragdoll3d.ts'

test('a kind walker does not list, and a scene with no world.walker, give none', () => {
  const world = { walker: { kinds: { soldier: { gravity: 20 }, dog: { gravity: 12.5 } } } }
  expect(gravity(world, 'soldier')).toBe(20)
  expect(gravity(world, 'dog')).toBe(12.5)
  expect(gravity(world, 'post')).toBeUndefined()
  expect(gravity({}, 'soldier')).toBeUndefined()
})
