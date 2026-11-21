// hair3d's shared half: a hairs file checked, and a hair's locks rooted on a skin.
import { expect, test } from 'vitest'
import { REACHES, TIE_TEXELS, builtFrom, check, rootsOf, tieRows, type Hair, type Hair3d, type Roots, type Skin, type Tie } from './hair3d.sim.ts'

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
  expect(() => check({ ...file, hairs: { coat: { ...hair, links: 0 } } })).toThrow('hair coat links 0 is not a whole number from 1 to 32')
  expect(() => check({ ...file, kinds: { beast: { hairs: ['mane'] } } })).toThrow('kind beast hair "mane" is not one of the hairs coat')
})

// A tie on the right bone: at x 0.75 and z 0.5 on the ground (the bone's frame is the skin's moved 1 along x),
// laid round the middle of the square, hanging down, a plait of 0.01 swing.
const tie: Tie = {
  bone: 'right', at: [-0.25, 0.1, 0.5], around: [-0.5, -0.4, 0.5], lift: 0.02, hang: [0, -1, 0], fall: 0.5,
  reach: 0.3, share: 1, spread: 0.02, flare: 0.05, band: 0.2, side: [1, 0, 0], stiffness: [30, 3], braid: { radius: 0.01, pitch: 0.1 },
}
const tied: Hair = { ...hair, density: 1500, links: 6, length: [1, 0], ties: [tie] }

test('a lock is gathered to the nearest tie its root is within reach of and its length reaches, a share of them, the same every time', () => {
  const roots = rootsOf(tied, 'coat', skin)
  const mine = (i: number) => Math.hypot(roots.at[i * 4] - 0.75, roots.at[i * 4 + 1] - 0.1, roots.at[i * 4 + 2] - 0.5)
  let gathered = 0
  const strands = new Set<number>()
  for (let i = 0; i < roots.count; i++) {
    const [which, strand, angle, radius] = Array.from(roots.tie.slice(i * 4, i * 4 + 4))
    if (mine(i) <= 0.3) {
      expect(which).toBe(1)
      gathered++
      strands.add(strand)
    } else expect(which).toBe(0)
    expect(angle).toBeGreaterThanOrEqual(0)
    expect(angle).toBeLessThan(1)
    expect(radius).toBeGreaterThanOrEqual(0)
    expect(radius).toBeLessThan(1)
  }
  expect(gathered).toBeGreaterThan(30)
  expect(gathered).toBeLessThan(roots.count)
  expect([...strands].sort()).toEqual([0, 1, 2])
  expect(rootsOf(tied, 'coat', skin)).toEqual(roots)

  // none of the locks within reach of a tie whose share is 0, about half of them when it is a half, and a
  // lock too short to reach the tie (more than REACHES times its length from it) is left loose
  const gatheredOf = (r: Roots) => Array.from({ length: r.count }, (_, i) => i).filter(i => r.tie[i * 4] > 0)
  expect(gatheredOf(rootsOf({ ...tied, ties: [{ ...tie, share: 0 }] }, 'coat', skin))).toHaveLength(0)
  const half = gatheredOf(rootsOf({ ...tied, ties: [{ ...tie, share: 0.5 }] }, 'coat', skin)).length
  expect(half).toBeGreaterThan(gathered * 0.25)
  expect(half).toBeLessThan(gathered * 0.75)
  const short = rootsOf({ ...tied, length: [0.1, 0] }, 'coat', skin)
  const shortGathered = gatheredOf(short)
  expect(shortGathered.length).toBeGreaterThan(0)
  expect(shortGathered.length).toBeLessThan(gathered)
  for (let i = 0; i < short.count; i++) {
    const far = Math.hypot(short.at[i * 4] - 0.75, short.at[i * 4 + 1] - 0.1, short.at[i * 4 + 2] - 0.5)
    expect(short.tie[i * 4] > 0).toBe(far <= REACHES * 0.1 + 1e-6)
  }

  // a tie takes nothing from where the locks are rooted: with none, the same locks, none gathered
  const bare = rootsOf({ ...tied, ties: undefined }, 'coat', skin)
  expect(Array.from(bare.at)).toEqual(Array.from(roots.at))
  expect(Array.from(bare.tie).every(v => v === 0)).toBe(true)
  expect(bare.tie).toHaveLength(bare.count * 4)

  // the nearer of two ties
  // (the first at x 0.55 and z 0.5, the second where the one tie was: a lock goes to whichever is nearer)
  const two = rootsOf({ ...tied, ties: [{ ...tie, at: [-0.45, 0.1, 0.5], reach: 0.5 }, { ...tie, reach: 0.5 }] }, 'coat', skin)
  const first = new Set<number>(), second = new Set<number>()
  for (let i = 0; i < two.count; i++) {
    const near = (x: number) => Math.hypot(two.at[i * 4] - x, two.at[i * 4 + 1] - 0.1, two.at[i * 4 + 2] - 0.5)
    const [a, b] = [near(0.55), near(0.75)]
    expect(two.tie[i * 4]).toBe(Math.min(a, b) > 0.5 ? 0 : a < b ? 1 : 2)
    if (two.tie[i * 4] === 1) first.add(i)
    if (two.tie[i * 4] === 2) second.add(i)
  }
  expect(first.size).toBeGreaterThan(0)
  expect(second.size).toBeGreaterThan(0)
})

test('a tie is handed to the pass in the skin\'s own frame, its bone by number', () => {
  const rows = tieRows(tied, skin.frames, 'coat')
  expect(rows).toHaveLength(TIE_TEXELS * 4)
  const texels = (from: number, to: number) => Array.from(rows.slice(from, to)).map(v => Math.round(v * 1e6) / 1e6)
  expect(texels(0, 8)).toEqual([0.75, 0.1, 0.5, 1, 0.5, -0.4, 0.5, 0.02])
  expect(texels(8, 12)).toEqual([0, -1, 0, 0.5])
  expect(texels(12, 16)).toEqual([1, 0, 0, 0.1])
  expect(texels(16, 24)).toEqual([0.02, 0.05, 30, 3, 0.01, 0.2, 0, 0])
  // a hair with no ties still has a row, which nothing reads
  expect(tieRows(hair, skin.frames, 'coat')).toHaveLength(TIE_TEXELS * 4)
  expect(() => tieRows({ ...tied, ties: [{ ...tie, bone: 'spine' }] }, skin.frames, 'coat')).toThrow('names the bone spine')
})

test('check names the first number of a tie that is wrong', () => {
  const of = (h: Hair) => () => check({ ...file, hairs: { coat: h } })
  expect(of(tied)).not.toThrow()
  expect(of({ ...tied, links: 2 })).toThrow('hair coat links 2 is not a whole number from 3 to 32 for a hair with ties')
  expect(of({ ...tied, ties: [{ ...tie, reach: 0 }] })).toThrow('hair coat tie 0 reach 0 is not a number of metres above 0')
  expect(of({ ...tied, ties: [{ ...tie, share: 2 }] })).toThrow('hair coat tie 0 share 2 is not a number from 0 to 1')
  expect(of({ ...tied, ties: [tie, { ...tie, hang: [0, 0, 0] }] })).toThrow('hair coat tie 1 hang [0,0,0] is not [x, y, z] longer than 0')
  expect(of({ ...tied, ties: [{ ...tie, braid: { radius: 0.01, pitch: 0 } }] })).toThrow('hair coat tie 0 braid pitch 0 is not a number of metres above 0')
  expect(of({ ...tied, ties: [{ ...tie, band: -1 }] })).toThrow('hair coat tie 0 band -1 is not a number of metres at or above 0')
})

test('what a hair is rooted from includes which locks a tie gathers and not how it hangs', () => {
  expect(builtFrom(tied)).toBe(builtFrom({ ...tied, ties: [{ ...tie, spread: 0.1, flare: 0.2, band: 0.5, fall: 1, hang: [1, 0, 0], stiffness: [1, 1], braid: { radius: 0.02, pitch: 0.3 }, lift: 0.1, around: [0, 0, 0], side: [0, 0, 1] }] }))
  expect(builtFrom(tied)).not.toBe(builtFrom({ ...tied, ties: [{ ...tie, reach: 0.2 }] }))
  expect(builtFrom(tied)).not.toBe(builtFrom({ ...tied, ties: [{ ...tie, share: 0.5 }] }))
  expect(builtFrom(tied)).not.toBe(builtFrom({ ...tied, ties: [{ ...tie, at: [0, 0, 0] }] }))
  expect(builtFrom(tied)).not.toBe(builtFrom({ ...tied, ties: [tie, tie] }))
})
