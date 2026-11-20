// item3d's mod for fabric3d: what each body of the sheet wears and what each item hangs, handed as entries of
// fabric3d's attach, and item3d's things handed as its sources.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { attach, sources } from './item3d.fabric3d.ts'

test('each fabric a body wears is one entry, the fabric held to every thing of the body\'s name, and each fabric an item hangs one after them', () => {
  const bodies = { guard: { wears: ['tee', 'cape'] }, worker: { holds: [] }, runner: { wears: ['cape'] } }
  const hung = [{ fabric: 'kit/pennant', of: 'item3d/lance' }]
  expect(attach({ item3d: { bodies: () => bodies, hung: () => hung } } as unknown as Plugins)).toEqual([
    { fabric: 'tee', of: 'guard' },
    { fabric: 'cape', of: 'guard' },
    { fabric: 'cape', of: 'runner' },
    { fabric: 'kit/pennant', of: 'item3d/lance' },
  ])
})

test('its sources are item3d\'s things', () => {
  const things = [{ key: 'item3d 4', of: 'item3d/lance', point: () => undefined }]
  expect(sources({ item3d: { things: () => things } } as unknown as Plugins)).toBe(things)
})
