// hair3d's shared half: a hairs file checked, and a hair's locks rooted on a skin.
import { expect, test } from 'vitest'
import { check, rootsOf, type Hair, type Hair3d, type Skin } from './hair3d.sim.ts'

const hair: Hair = {
  on: { meshes: 'hide', bones: ['right'], weight: 0.5, cuts: [], planes: [], faces: [] },
  density: 400, strands: 3, length: [0.2, 0.5], width: [0.004, 0], taper: 0.5, thin: 0, links: 2, segments: 2,
  comb: [0, 0, 0], stiffness: [10, 1], gravity: 9.8, damping: 2, drag: 1,
  clump: { radius: 0.01, tight: 0.5 }, curl: { radius: 0, turns: 0 }, ragged: 0,
  colours: { root: '#000000', tip: '#ffffff' }, vary: 0, ao: 0, roughness: 0.5, shine: { strength: 0, power: 1 }, translucency: 0,
  shadow: true,
}
const file: Hair3d = { wind: { toward: 0, speed: 0 }, gust: { scale: 1, strength: 0, rate: 0 }, kinds: { beast: { hairs: ['coat'] } }, hairs: { coat: hair } }

// A square metre of skin on the ground facing up, its x = 0 edge held by the bone `rig:left` and its
// x = 1 edge by `rig:right`, so `right` holds x of the skin at x.
const at = (x: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]
const skin: Skin = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1]),
  normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
  bones: new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]),
  weights: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
  triangles: new Uint32Array([0, 2, 1, 0, 3, 2]),
  frames: [{ name: 'rig:left', bind: at(0) }, { name: 'rig:right', bind: at(1) }],
}

test('a hair roots its locks where its bones hold the skin and its cuts, planes and faces pass, the same every time', () => {
  const roots = rootsOf(hair, 'coat', skin)
  // Half the square metre at 400 a square metre.
  expect(roots.count).toBeGreaterThan(150)
  expect(roots.count).toBeLessThan(250)
  for (let i = 0; i < roots.count; i++) {
    expect(roots.at[i * 4]).toBeGreaterThanOrEqual(0.5 - 1e-6)
    expect(roots.at[i * 4 + 3]).toBeGreaterThanOrEqual(0.15 - 1e-6)
    expect(roots.at[i * 4 + 3]).toBeLessThanOrEqual(0.25 + 1e-6)
    expect([roots.normal[i * 4], roots.normal[i * 4 + 1], roots.normal[i * 4 + 2]]).toEqual([0, 1, 0])
    expect(roots.weights[i * 4] + roots.weights[i * 4 + 1] + roots.weights[i * 4 + 2] + roots.weights[i * 4 + 3]).toBeCloseTo(1, 5)
  }
  expect(rootsOf(hair, 'coat', skin)).toEqual(roots)

  // A cut in the right bone's frame, a plane in the skin's, a face the skin does not turn to.
  const cut = rootsOf({ ...hair, on: { ...hair.on, cuts: [{ bone: 'right', normal: [0, 0, 1], offset: 0.5 }] } }, 'coat', skin)
  for (let i = 0; i < cut.count; i++) expect(cut.at[i * 4 + 2]).toBeGreaterThanOrEqual(0.5 - 1e-6)
  const plane = rootsOf({ ...hair, on: { ...hair.on, planes: [{ normal: [1, 0, 0], offset: 0.75 }] } }, 'coat', skin)
  for (let i = 0; i < plane.count; i++) expect(plane.at[i * 4]).toBeGreaterThanOrEqual(0.75 - 1e-6)
  expect(() => rootsOf({ ...hair, on: { ...hair.on, faces: [{ toward: [0, -1, 0], within: 60 }] } }, 'coat', skin)).toThrow('roots nowhere')
  expect(() => rootsOf({ ...hair, on: { ...hair.on, bones: ['spine'] } }, 'coat', skin)).toThrow('names the bone spine')
})

test('check names the first number of a hairs file that is wrong', () => {
  expect(() => check(file)).not.toThrow()
  expect(() => check({ ...file, hairs: { coat: { ...hair, links: 0 } } })).toThrow('hair coat links 0 is not a whole number from 1 to 16')
  expect(() => check({ ...file, kinds: { beast: { hairs: ['mane'] } } })).toThrow('kind beast hair "mane" is not one of the hairs coat')
})
