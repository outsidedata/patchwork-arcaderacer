// anim's mod for ik3d, given to ik3d by one key of a scene: `world.ik3d.mods.body` is 'anim'. It
// hands on the body anim draws for a row: the anim kind (`as`, else the row's own), the model root,
// the props named by their kind's models, and whether it lies limp by its kind's `reads.limp`.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { body } from './anim.ik3d.ts'

const root = { name: 'model' }, gun = { name: 'gun' }, knife = { name: 'knife' }
const plugins = {
  wire: {
    scene: {
      world: {
        anim: {
          kinds: {
            xbot: { rig: 'rig', model: 'xbot', reads: { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'down' }, props: [{ model: 'rifle', bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }, { model: 'blade', bone: 'LeftHand', at: [0, 0, 0], turn: [0, 0, 0] }] },
          },
        },
      },
    },
  },
  anim: {
    model: (id: number) => (id === 3 || id === 4 ? root : undefined),
    props: (id: number) => (id === 3 || id === 4 ? [gun, knife] : []),
  },
} as unknown as Plugins

test('the body anim draws: its kind by `as`, its root, its props by their models, limp by the kind\'s reads', () => {
  const row: Row = { id: 3, kind: 'player', data: { as: 'xbot', down: false } }
  expect(body(plugins, row)).toEqual({ kind: 'xbot', root, props: [{ model: 'rifle', root: gun }, { model: 'blade', root: knife }], limp: false })
  expect(body(plugins, { id: 4, kind: 'xbot', data: { down: true } })!.limp).toBe(true)
})

test('a prop anim has not made yet, its model still loading, is named with no root', () => {
  const waiting = { ...plugins, anim: { ...(plugins as any).anim, props: () => [] } } as unknown as Plugins
  expect(body(waiting, { id: 3, kind: 'xbot', data: {} })!.props).toEqual([{ model: 'rifle', root: undefined }, { model: 'blade', root: undefined }])
})

test('undefined for a kind anim does not draw, and for a row whose model is not built', () => {
  expect(body(plugins, { id: 3, kind: 'crate', data: {} })).toBeUndefined()
  expect(body(plugins, { id: 9, kind: 'xbot', data: {} })).toBeUndefined()
})
