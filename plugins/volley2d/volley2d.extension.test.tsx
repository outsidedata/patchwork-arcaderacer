// The logic the Patterns panel is built on, on a file of its own: the survey, the values that name and
// move a pattern, the panel's fields, the plot and the aim.
import { expect, test } from 'vitest'
import { shots, type Emitter, type Patterns } from './volley2d.sim.ts'
import { SPECS, bearing, fresh, heading, lifeOf, namings, patternEdits, plot, renaming, survey } from './volley2d.extension.tsx'

const file: Patterns = {
  patterns: {
    a: [{ n: 2, spread: 1, speed: 10, sheet: 'fx', clip: 'ball' }, { pattern: 'b', dir: 1 }],
    b: [{ speed: 20, bursts: 3, every: 0.5, sheet: 'fx', clip: 'rice', layer: 'shots' }],
    loop: [{ pattern: 'loop' }],
    gap: [{ pattern: 'none' }],
    bad: [{ sheet: 'fx', clip: 'nope' }, { sheet: 'art', clip: 'x' }, { layer: 'nowhere' }],
    shaped: [{ n: 1.5 }, { pattern: 'a', to: 1 } as unknown as Emitter, { pattern: 'nowhere' }],
  },
}
const assets = { fx: { type: 'sheet', url: '/fx.json' }, art: { type: 'json', url: '/art.json' } }
const world = { patterns: 'p', bounds: [0, 0, 100, 100] as [number, number, number, number], layer: 'bullets' }

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a survey opens a pattern\'s layers out as the sim does and says every reason the page would throw', () => {
  const clips = (s: string) => (s === 'fx' ? ['ball', 'rice'] : undefined)
  const w = { world, layers: ['bullets', 'shots'] }
  expect(survey(file, 'a', assets, clips, w)).toEqual({ emitters: [file.patterns.a[0], file.patterns.b[0]], shots: shots(file, 'a'), waiting: [], problems: [] })
  expect(survey(file, 'a', assets, clips, w).shots).toHaveLength(5)
  expect(survey(file, 'a', assets, () => undefined, w).waiting).toEqual(['fx'])
  expect(survey(file, 'loop', assets, clips, w).problems).toEqual(['loop is built out of itself: loop > loop'])
  expect(survey(file, 'gap', assets, clips, w).problems).toEqual(['gap names none, which there is none of'])
  expect(survey(file, 'nothing', assets, clips, w).problems).toEqual(['there is no pattern nothing'])
  expect(survey(file, 'bad', assets, clips, w).problems).toEqual(['a layer draws clip nope of fx, which it does not have', 'art is no sheet entry of the catalogue', 'a layer draws on nowhere, which render2d has no layer of'])
  // a layer that is not what volley2d reads, said as a call handing it is refused, and opened no further
  expect(survey(file, 'shaped', assets, clips, w).problems).toEqual([
    'layer 0 of shaped n: Invalid input: expected int, received number',
    'layer 1 of shaped: a { pattern } layer has no to, which volley2d does not read: its fields are pattern, at, dir, after',
    'shaped names nowhere, which there is none of',
  ])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('namings, renaming and a pattern\'s layers moved are the values that name, move and change', () => {
  const others = [{ path: 'd.json', value: { boss: { fire: [{ pattern: 'b' }], note: 'bb' } } }]
  expect(namings(file, 'p.json', 'b', others)).toEqual([
    { file: 'p.json', at: ['patterns', 'a', 1, 'pattern'] },
    { file: 'd.json', at: ['boss', 'fire', 0, 'pattern'] },
  ])
  expect(renaming(file, 'p.json', 'b', 'c')).toEqual([
    { file: 'p.json', at: ['patterns', 'a', 1, 'pattern'], value: 'c' },
    { file: 'p.json', at: ['patterns', 'c'], value: file.patterns.b },
    { file: 'p.json', at: ['patterns', 'b'], value: undefined },
  ])
  expect(renaming(file, 'p.json', 'loop', 'l2')[0]).toEqual({ file: 'p.json', at: ['patterns', 'l2'], value: [{ pattern: 'l2' }] })
  const [x, y, z] = [{ pattern: 'x' }, { pattern: 'y' }, { pattern: 'z' }]
  expect(patternEdits({ patterns: { q: [x, y, z] } }, 'p.json', 'q', [y, x, z])).toEqual([
    { file: 'p.json', at: ['patterns', 'q', 0], value: y },
    { file: 'p.json', at: ['patterns', 'q', 1], value: x },
  ])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the panel has a field for every field of an emitter the sim reads, in its header\'s order', () => {
  expect(SPECS.map(s => s.key)).toEqual(['n', 'spread', 'ring', 'bursts', 'every', 'after', 'turn', 'offset', 'from', 'speed', 'accel', 'min', 'max', 'curve', 'life', 'radius', 'damage', 'sheet', 'clip', 'orient', 'layer'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the plot steps every bullet as the server does: its path, the peak in the air, and when the last is gone', () => {
  // three bursts of one bullet half a second apart, 20 a second from the middle along +x: each
  // leaves x > 100 after 2.5 s
  const list = shots(file, 'b')
  const p = plot(list, [50, 50], 0, world.bounds, 4, 0.1)
  expect(p.paths).toHaveLength(3)
  expect(p.paths[0][0]).toEqual([50, 50])
  expect(p.paths[0].at(-1)![0]).toBeCloseTo(100, 9)
  expect(p.peak).toBe(3)
  expect(p.when).toBeCloseTo(1, 9)
  expect(p.clear).toBeCloseTo(3.6, 9)
  // aimed down, the same, along +y
  expect(plot(list, [50, 50], Math.PI / 2, world.bounds, 4, 0.1).paths[0][10]).toEqual([expect.closeTo(50, 9), expect.closeTo(70, 9)])
  // one that never leaves is in the air past the span
  expect(plot(shots({ patterns: { still: [{}] } }, 'still'), [50, 50], 0, world.bounds, 1, 0.1)).toMatchObject({ peak: 1, clear: undefined })
  // a life that changes nothing yet: the seconds its bullet takes to leave the bounds from their middle
  expect(lifeOf({ speed: 20 }, world.bounds, 0.1)).toBe(2.6)
  expect(lifeOf({}, world.bounds, 0.1)).toBe(60)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the dial\'s bearing and volley2d\'s heading are one aim', () => {
  expect(bearing(0)).toBe(90)
  expect(bearing(Math.PI / 2)).toBe(180)
  expect(bearing(-Math.PI / 2)).toBe(0)
  expect(heading(180)).toBeCloseTo(Math.PI / 2, 9)
  expect(heading(bearing(1))).toBeCloseTo(Math.round((1 * 180) / Math.PI) * Math.PI / 180, 9)
  expect(fresh({ patterns: { x: [{ speed: 1 }] } })).toEqual({ n: 8, ring: true, speed: 80 })
})
