// shapes3d's mods for fabric3d and gpgpu3d: what a page is handed of a shape a rule moves.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { sources } from './shapes3d.fabric3d.ts'
import { things } from './shapes3d.gpgpu3d.ts'

test('a shape that moved in the page\'s newest step is handed between where its last two steps left it, as far as the frame is between them, to what meets it on the GPU and to the fabric it holds alike', () => {
  const world = { shapes3d: { kinds: { lift: { shape: { box: { size: [2, 1, 2] } } } } } }
  const wire: any = { n: 1, between: 0, scene: { world }, rows: [{ id: 7, kind: 'lift', data: { pos: [0, 0, 0], yaw: 0 } }] }
  const plugins = { wire } as unknown as Plugins
  const near = { at: [0, 0, 0], reach: 20 }
  things(plugins, near)
  // a step on: the lift 2 metres up and a quarter turn round, the frame drawn half way to it
  wire.n = 2
  wire.between = 0.5
  wire.rows = [{ id: 7, kind: 'lift', data: { pos: [0, 2, 0], yaw: Math.PI / 2 } }]
  expect(things(plugins, near)).toEqual([{ box: { pos: [0, 1, 0], size: [2, 1, 2], yaw: Math.PI / 4 } }])
  const [lift] = sources(plugins)
  expect([lift.key, lift.of]).toEqual(['7', 'lift'])
  expect(lift.point('pos')).toEqual({ at: [0, 1, 0], rot: [0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)] })
})
