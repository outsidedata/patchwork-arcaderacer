// The Effects 3D panel's fields, with no game booted: in metres, an emitter with no dir of its own
// aimed straight up, and a spawn's to a vector of the world from the point it is fired at.
import { expect, test } from 'vitest'
import { specs } from '#plugins/particle2d/particle2d.extension.tsx'
import { SPACE } from './particle3d.extension.tsx'

test('the panel\'s fields are in metres, and its preview aims up and ends a beam along x', () => {
  const fields = specs(SPACE)
  expect(fields.find(s => s.key === 'g')!.label).toBe('g (m/s²)')
  const ctx = { sheets: [], clips: undefined, dir: SPACE.dir(SPACE.spawn) }
  expect(fields.find(s => s.key === 'dir')!.absent({}, ctx)).toEqual([0, 1, 0])
  expect(SPACE.to([1, 2, 3], SPACE.spawn)).toEqual([4, 2, 3])
})
