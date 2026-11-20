// The browser half of ragdoll3d, handed a scene of its own whose `world.ragdoll3d` the test edits as
// a dev page's panel does, in place. The scene names no mods, so a frame whose numbers pass their check throws
// that it names no `model`; a frame whose numbers were checked again and are out of shape throws
// naming the number. Which of the two a frame throws says whether the numbers were checked again.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import type { Numbers } from './ragdoll3d.plugin.ts'
import { ragdoll3d } from './ragdoll3d.plugin.ts'

const NUMBERS: Numbers = {
  kinds: ['dummy'],
  bones: {
    hips: 'Hips', spine: 'Spine2', head: 'Head', armL: 'LeftArm', forearmL: 'LeftForeArm', handL: 'LeftHand',
    armR: 'RightArm', forearmR: 'RightForeArm', handR: 'RightHand', uplegL: 'LeftUpLeg', legL: 'LeftLeg', footL: 'LeftFoot',
    uplegR: 'RightUpLeg', legR: 'RightLeg', footR: 'RightFoot',
  },
  damp: 0.98, iter: 6, sweeps: 30, radius: 0.06, vmax: 0.5, friction: 0.4, spread: 0.3,
  limits: { elbow: [0, 160], knee: [0, 160], spine: [0, 60], hip: [0, 150], shoulder: [0, 170] },
  still: 0.001, calm: 30, settle: 4,
}
const NO_MODEL = 'ragdoll3d lays its bodies on the model a mod hands it, and the scene names none in world.ragdoll3d.mods.model'

function page() {
  const world: Record<string, any> = { ragdoll3d: structuredClone(NUMBERS) }
  const plugins = { wire: { rows: [], scene: { world, plugins: ['ragdoll3d'], prefabs: { engine: { dt: 1 / 60 } } } } } as unknown as Plugins
  const me = ragdoll3d()
  return { world, tick: () => me.tick(plugins) }
}

test('world.ragdoll3d is checked again when it changes in place deep inside it, as a dev page\'s panel changes it, and a fresh copy is checked as it stands', () => {
  const { world, tick } = page()
  expect(tick).toThrow(NO_MODEL)
  expect(tick).toThrow(NO_MODEL)
  // The same object, a limit deep inside it made out of shape: the next frame throws naming it.
  world.ragdoll3d.limits.knee[1] = 200
  expect(tick).toThrow('ragdoll3d limits.knee must be [least, most] degrees, 0 ≤ least ≤ most ≤ 180')
  world.ragdoll3d.limits.knee[1] = 160
  expect(tick).toThrow(NO_MODEL)
  // A fresh copy of the same numbers passes; one of it made out of shape in place throws.
  world.ragdoll3d = structuredClone(world.ragdoll3d)
  expect(tick).toThrow(NO_MODEL)
  world.ragdoll3d.bones.head = ''
  expect(tick).toThrow('ragdoll3d bones gives no suffix for head')
})
