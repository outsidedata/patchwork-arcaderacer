// supershader3d's mod for fabric3d: the drawing `look`, on a supershader3d of the test's own that holds one material.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { behaviors } from './supershader3d.fabric3d.ts'

const { look } = behaviors()

test('a fabric\'s look is { material }, and anything else throws, naming it', () => {
  look.check({ material: 'felt' }, 'fabric cape\'s look', {})
  expect(() => look.check({ colour: '#fff' }, 'fabric cape\'s look', {})).toThrow('fabric cape\'s look is {"colour":"#fff"}, and a fabric\'s look is { material }')
  expect(() => look.check({ material: 'felt', roughness: 1 }, 'fabric cape\'s look', {})).toThrow('fabric cape\'s look has roughness, and a fabric\'s look is { material }')
})

test('it is drawn once the looks hold its material: every vertex its number, in a material of its call dressed with the surface it is handed', () => {
  const made: unknown[][] = []
  const material = {}
  let landed = false
  const plugins = { supershader3d: {
    idOf: (name: string) => (landed && name === 'felt' ? 4 : undefined),
    callOf: (name: string) => (landed && name === 'felt' ? 'relief' : undefined),
    surfaced: (call: string, surface: unknown) => { made.push([call, surface]); return material },
  } } as unknown as Plugins
  expect(look.material!({ material: 'felt' }, { plugins, name: 'cape' })).toBeUndefined()
  landed = true
  expect(look.material!({ material: 'silk' }, { plugins, name: 'cape' })).toBeUndefined()
  const drawn = look.material!({ material: 'felt' }, { plugins, name: 'cape' }) as { dress(surface: unknown): unknown; vertex: Record<string, number> }
  expect(drawn.vertex).toEqual({ lookId: 4 })
  const surface = { vertex: {} }
  expect(drawn.dress(surface)).toBe(material)
  expect(made).toEqual([['relief', surface]])
})
