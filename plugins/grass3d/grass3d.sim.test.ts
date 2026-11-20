// grass3d's shared half: the scene's numbers checked, the levels a grass is drawn in, the window, and a
// block of ground filled off terrain3d's land, the same land a rule reads.
import { expect, test } from 'vitest'
import { land, type Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { worker } from '#plugins/terrain3d/terrain3d.grass3d.ts'
import { BLOCK, check, fill, levelsOf, windowOf, type Grass, type Grass3d } from './grass3d.sim.ts'

const field: Field = {
  program: { world: 600, hscale: 6, sea: -1, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 12, seed: 3 }] },
  analysis: { slopeStep: 1, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: { road: { cover: 0 } },
  layers: [{ at: [0, 0], size: 64, px: 128, strokes: [{ verb: 'surface', radius: 2, hardness: 1, strength: 0, level: 0, surface: 'road', path: [[-30, 4], [30, 4]] }] }],
}

const grass: Grass = {
  rules: [{ q: 'slope', lo: 0.4, hi: 0.2 }], density: 200, full: 5, reach: 70, fade: 15, tile: 2,
  height: [0.4, 0.5], width: [0.04, 0.5], widen: 0.5, widest: 6, lean: 0.2, segments: [5, 3, 2, 1], chunks: 4,
  colours: { root: '#203010', tip: '#90b050', dry: '#b0a060' }, dry: { amount: 0.3, scale: 10 },
  vary: 0.1, translucency: 0.5, roughness: 0.7, ao: 0.4, shadow: 10,
}
const settings: Grass3d = {
  budget: 2, wind: { toward: 90, speed: 3 }, gust: { scale: 12, strength: 0.5, flutter: 0.05, rate: 2 },
  bend: 0.07, trample: { recover: 20, reach: 0.3 }, grasses: { meadow: grass },
}

test('check names the first number that is wrong, and a rule the land cannot answer', () => {
  const ground = worker({ field, unsaved: field.layers!.map(() => undefined) })
  expect(() => check(settings, ground)).not.toThrow()
  expect(() => check({ ...settings, bend: 0.9 })).toThrow('grass3d bend 0.9 is not a number from 0 to 0.85')
  expect(() => check({ ...settings, grasses: { meadow: { ...grass, reach: 5 } } })).toThrow('grass3d grass meadow reach 5 is not a number of metres beyond its full 5')
  expect(() => check({ ...settings, grasses: { meadow: { ...grass, segments: [3, 0] } } })).toThrow('grass3d grass meadow segments [3,0] is not a list of whole numbers of at least 1')
  expect(() => check({ ...settings, grasses: { meadow: { ...grass, rules: [{ q: 'nonsense', lo: 0, hi: 1 }] } } }, ground)).toThrow('nonsense')
  // a program is a list of nodes and an out; its ops are checked where gpgpu3d compiles it
  const program = { nodes: [{ id: 'n', op: 'noise', freq: 1 }], out: { height: 'n' } }
  expect(() => check({ ...settings, grasses: { meadow: { ...grass, program } } })).not.toThrow()
  expect(() => check({ ...settings, grasses: { meadow: { ...grass, program: { nodes: 'n', out: {} } as never } } })).toThrow('grass3d grass meadow program {"nodes":"n","out":{}} is not { nodes: [...], out: { <name>: <node id> } }')
})

test('each level is a band twice as far out as the last, a quarter the blades a tile, its square holding every tile of its band', () => {
  const levels = levelsOf(grass)
  expect(levels.map(l => [l.from, l.to])).toEqual([[0, 10], [10, 20], [20, 40], [40, 70]])
  expect(levels.map(l => l.blades)).toEqual([800, 200, 50, 13])
  expect(levels.map(l => l.segments)).toEqual([5, 3, 2, 1])
  for (const l of levels) {
    expect(l.side).toBe(l.chunk * l.chunks)
    // A camera anywhere in the middle tile: every tile whose nearest point is within `to` of it is in the square.
    expect(Math.floor(l.side / 2) * grass.tile).toBeGreaterThanOrEqual(l.to)
    // The density at the level's near edge times a tile is no more than the blades it draws a tile.
    expect(grass.density * Math.min(1, (grass.full / Math.max(l.from, 1e-9)) ** 2) * grass.tile ** 2).toBeLessThanOrEqual(l.blades)
  }
  // A blade drawn at the density each level's band falls to is the same number at every level: as many as
  // the square's tiles times the blades a tile, near enough the same from level to level.
  const counts = levels.slice(1, -1).map(l => l.side * l.side * l.blades)
  for (const c of counts) expect(c / counts[0]).toBeGreaterThan(0.6)
})

test('the window holds every blade within reach of a camera anywhere in its middle block', () => {
  const { blocks, half } = windowOf(0.5, 72)
  expect(blocks).toBe(2 * half + 1)
  expect(half * BLOCK * 0.5).toBeGreaterThanOrEqual(72)
})

test('a block filled is the land at each lattice point, and the share covered is its rules times the painted cover', () => {
  const l = land(field)
  const ground = worker({ field, unsaved: field.layers!.map(() => undefined) })
  const f = fill(ground, 0, 0, 0.5, [grass.rules])
  expect(f.heights).toHaveLength(BLOCK * BLOCK)
  for (const [i, j] of [[0, 0], [5, 9], [31, 31], [17, 2]]) {
    const x = i * 0.5, z = j * 0.5
    expect(f.heights[j * BLOCK + i]).toBe(Math.fround(l.height(x, z)))
    const keep = l.paint(x, z).cover * l.ramp(grass.rules[0], x, z)
    expect(f.keeps[j * BLOCK + i]).toBe(Math.fround(Math.max(0, Math.min(1, keep))))
  }
  // On the road, whose cover is 0, no grass.
  expect(f.keeps[8 * BLOCK + 4]).toBe(0)
  expect(l.paint(2, 4).cover).toBe(0)
  // Off it, on flat enough ground, grass.
  expect([...f.keeps].filter(k => k > 0.5).length).toBeGreaterThan(BLOCK * BLOCK / 2)
})
