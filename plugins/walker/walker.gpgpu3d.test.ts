// walker's mod for gpgpu3d: every walking body on the page's wire, by its kind or the kind its `as` names,
// a cylinder standing on its `pos`; none for a limp body, a row of no walking kind, or one out of reach.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { things } from './walker.gpgpu3d.ts'

test('every walking body within reach is a cylinder of its kind on its feet; a limp one, a far one and a row that does not walk are none', () => {
  const kinds = { xbot: { radius: 0.35, height: 1.8 }, dog: { radius: 0.3, height: 0.7 } }
  const rows = [
    { id: 1, kind: 'player', data: { as: 'xbot', pos: [1, 2, 3] } },
    { id: 2, kind: 'dog', data: { pos: [4, 0, 5] } },
    { id: 3, kind: 'dog', data: { pos: [9, 0, 9], limp: true } },
    { id: 4, kind: 'crate', data: { pos: [0, 0, 0] } },
    { id: 5, kind: 'dog', data: { pos: [80, 0, 0] } },
  ] as Row[]
  const page = { wire: { scene: { world: { walker: { kinds } } }, rows } } as unknown as Plugins
  const near = { at: [0, 0, 0], reach: 40 }
  expect(things(page, near)).toEqual([
    { cylinder: { pos: [1, 2, 3], radius: 0.35, height: 1.8 } },
    { cylinder: { pos: [4, 0, 5], radius: 0.3, height: 0.7 } },
  ])
  expect(things({ wire: { scene: { world: {} }, rows } } as unknown as Plugins, near)).toEqual([])
})
