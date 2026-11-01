// The Patterns 3D panel's logic, with no editor and no game: a field for every field of a pattern the
// sim reads, a survey of every reason the page would throw drawing a pattern's round, the values that
// name and move a pattern and the one a new pattern starts as, and a round's flight plotted from the
// side, its aim and the marks of its way, over the patterns the game view's tests fire.
import { expect, test } from 'vitest'
import { FIELDS, LOOK, type Patterns } from './volley3d.sim.ts'
import { SPECS, aimOf, firsts, fresh, marks, namings, plot, reach, renaming, survey, topOf } from './volley3d.extension.tsx'
import { PATTERNS, close, look, path } from './volley3d.extension.harness.ts'

// ---------------------------------------------------------------- the logic

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the panel has a field for every field of a pattern the sim reads, in its header\'s order, its look\'s in its place', () => {
  expect(SPECS.map(s => s.at.join('.'))).toEqual(FIELDS.flatMap(k => (k === 'look' ? LOOK.map(l => `look.${l}`) : [k])))
  expect(SPECS.filter(s => s.needed).map(s => s.at[0])).toEqual(['speed', 'life'])
  const ctx = { effects: ['spark', 'boom'], firsts: firsts(PATTERNS) }
  const at = (k: string) => SPECS.find(s => s.at.join('.') === k)!.absent(PATTERNS.patterns.shell, ctx)
  expect(['accel', 'g', 'radius', 'splash', 'seek'].map(at)).toEqual([0, 0, 0, 0, 0])
  expect(at('max')).toBe(110)
  expect(at('look.trail')).toBe('smoke')
  expect(SPECS.find(s => s.at.join('.') === 'look.trail')!.absent(PATTERNS.patterns.shell, { effects: ['spark'], firsts: {} })).toBe('spark')
  expect(topOf({ speed: 30, accel: -5, life: 2, look: {} })).toBe(30)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a survey says every reason the page would throw drawing a pattern\'s round, and waits for the effects', () => {
  const file: Patterns = { patterns: { ...PATTERNS.patterns, odd: { speed: 1, life: 1, look: { body: 'fog' } }, bare: { speed: 1, look: {} } as never } }
  expect(survey(file, 'rocket', ['flame', 'smoke', 'boom'], 'fx.json')).toEqual({ problems: [], waiting: false })
  expect(survey(file, 'rocket', undefined, 'fx.json')).toEqual({ problems: [], waiting: true })
  expect(survey(file, 'odd', ['flame'], 'fx.json').problems).toEqual(['its look\'s body fog is no effect of fx.json'])
  expect(survey(file, 'bare', [], 'fx.json').problems).toEqual(['volley3d pattern bare has no life'])
  expect(survey(file, 'none', [], 'fx.json').problems).toEqual(['there is no pattern none'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('namings and renaming are the values that name and move a pattern; a new one is drawn as the first', () => {
  const others = [{ path: 'd.json', value: { gun: { pattern: 'rocket', note: 'rockets' }, list: ['rocket'] } }, { path, value: PATTERNS }]
  expect(namings(path, 'rocket', others)).toEqual([{ file: 'd.json', at: ['gun', 'pattern'] }, { file: 'd.json', at: ['list', 0] }])
  expect(renaming(PATTERNS, path, 'dart', 'bolt')).toEqual([
    { file: path, at: ['patterns', 'bolt'], value: PATTERNS.patterns.dart },
    { file: path, at: ['patterns', 'dart'], value: undefined },
  ])
  expect(fresh(PATTERNS)).toEqual({ speed: 40, life: 3, look })
  expect(fresh({ patterns: {} })).toEqual({ speed: 40, life: 3, look: {} })
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the plot is the round\'s flight from the side, the aim a heading from +z toward +x and an elevation, and the marks its way', () => {
  const level = plot(PATTERNS.patterns.shell, 0, 0.1)
  expect(level.points).toHaveLength(41)
  expect(level.points[10]).toEqual([expect.closeTo(40, 9), 0])
  expect(level.end).toEqual([expect.closeTo(280, 9), 0])
  expect(level.fastest).toBeCloseTo(110, 9)
  expect(level.down).toBeUndefined()
  expect(reach(PATTERNS.patterns.shell)).toBeCloseTo(280, 9)
  const lob = plot(PATTERNS.patterns.grenade, Math.PI / 4, 0.01)
  expect(lob.top.height).toBeCloseTo((20 * 20) / (4 * 9.8), 2)
  expect(lob.down!.along).toBeCloseTo((20 * 20) / 9.8, 2)
  expect(lob.down!.when).toBeCloseTo((2 * 20 * Math.SQRT1_2) / 9.8, 4)
  expect(aimOf({ heading: 0, elevation: 0 })).toEqual([0, 0, 1])
  expect(aimOf({ heading: 90, elevation: 0 })).toEqual([1, 0, 0])
  expect(aimOf({ heading: 0, elevation: 90 })).toEqual([0, 1, 0])
  const m = marks(PATTERNS.patterns.dart, [1, 0, 2], { heading: 90, elevation: 0, height: 2 }, 4)
  expect(m).toHaveLength(6)
  expect(m.slice(0, 2)).toEqual([[1, 0, 2], [1, 2, 2]])
  close(m[5], [16, 2, 2])
})
