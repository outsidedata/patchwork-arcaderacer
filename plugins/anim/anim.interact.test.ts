// anim's mod for interact, given to interact by one key of a scene: `world.interact.mods.body` is
// 'anim'. It hands on the body anim draws for a row: the model root, the roots of the props anim has
// made for it, and whether it lies limp by its kind's `reads.limp`.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { body } from './anim.interact.ts'

const root = { name: 'model' }, gun = { name: 'gun' }
const plugins = {
  wire: {
    scene: {
      world: {
        anim: {
          kinds: {
            xbot: { rig: 'rig', model: 'xbot', reads: { pos: 'pos', yaw: 'yaw', vel: 'vel', grounded: 'grounded', limp: 'down' }, props: [{ model: 'rifle', bone: 'RightHand', at: [0, 0, 0], turn: [0, 0, 0] }] },
          },
        },
      },
    },
  },
  anim: {
    model: (id: number) => (id === 3 || id === 4 ? root : undefined),
    props: (id: number) => (id === 3 || id === 4 ? [gun] : []),
  },
} as unknown as Plugins

test('the body anim draws: its root, its props as made, limp by its kind\'s reads, its kind by `as`', () => {
  const row: Row = { id: 3, kind: 'player', data: { as: 'xbot', down: false } }
  expect(body(plugins, row)).toEqual({ root, props: [gun], limp: false })
  expect(body(plugins, { id: 4, kind: 'xbot', data: { down: true } })!.limp).toBe(true)
})

test('a body whose props are not made yet, their models still loading, hands none', () => {
  const waiting = { ...plugins, anim: { ...(plugins as any).anim, props: () => [] } } as unknown as Plugins
  expect(body(waiting, { id: 3, kind: 'xbot', data: {} })!.props).toEqual([])
})

test('undefined for a kind anim does not draw, and for a row whose model is not built', () => {
  expect(body(plugins, { id: 3, kind: 'crate', data: {} })).toBeUndefined()
  expect(body(plugins, { id: 9, kind: 'xbot', data: {} })).toBeUndefined()
})
