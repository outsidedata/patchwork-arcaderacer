// supershader3d's mod for hair3d: the looks a hair that names a `look` is drawn in, on a supershader3d of the test's
// own that holds one material.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { looks } from './supershader3d.hair3d.ts'

test('a material the looks hold is its number and a new material of its call dressed with the surface handed; one they do not is neither', () => {
  const made: unknown[][] = []
  const material = {}
  const plugins = { supershader3d: {
    idOf: (name: string) => (name === 'felt' ? 4 : undefined),
    callOf: (name: string) => (name === 'felt' ? 'solid' : undefined),
    surfaced: (call: string, surface: unknown) => { made.push([call, surface]); return material },
  } } as unknown as Plugins
  const l = looks(plugins)
  expect([l.idOf('felt'), l.idOf('silk')]).toEqual([4, undefined])
  const surface = { vertex: {} }
  expect(l.material('felt', surface)).toBe(material)
  expect(l.material('silk', surface)).toBeUndefined()
  expect(made).toEqual([['solid', surface]])
})
