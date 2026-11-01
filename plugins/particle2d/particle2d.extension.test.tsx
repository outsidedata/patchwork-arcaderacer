// The logic the Effects panel is built on, on a file of its own: the survey, the values that name and
// move an effect, the panel's fields and one particle's life. That every effect a game ships is read
// by the commands with no problem is checked beside each game's effects file
// (`games/<game>/assets/effects.test.ts`).
import { expect, test } from 'vitest'
import { FIELDS, type Effects, type Emitter } from './particle2d.plugin.ts'
import { SPACE, effectEdits, marks, namings, renaming, sample, specs, survey } from './particle2d.extension.tsx'

// ---------------------------------------------------------------- the logic

const file: Effects = {
  cap: 100, layer: 'fx', ppm: 1,
  effects: {
    a: [{ life: [1, 2], sheet: 'fx', clip: 'flash' }, { effect: 'b' }],
    b: [{ life: [1, 1], every: 0.1, beam: true }],
    loop: [{ effect: 'loop' }],
    gap: [{ effect: 'none' }],
    bad: [{ life: [1, 1], sheet: 'fx', clip: 'nope' }, { life: [1, 1], sheet: 'art' }],
    lasting: [{ lasts: true, follow: true }],
    odd: [{ life: [1, 1], lasts: true }, { n: [1, 1] }],
    shaped: [{ n: 1, life: [1, 1] } as unknown as Emitter, { effect: 'a', to: 1 } as unknown as Emitter, { effect: 'nowhere' }],
    twice: [{ life: [1, 1], sheet: 'fx', clip: 'nope' }, { life: [1, 1], sheet: 'fx', clip: 'nope' }],
  },
}
const assets = { fx: { type: 'sheet', url: '/fx.json' }, art: { type: 'json', url: '/art.json' } }

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a survey opens an effect\'s layers out as the plugin does and says every reason it would throw, once each', () => {
  const clips = (s: string) => (s === 'fx' ? ['flash'] : undefined)
  const sv = (f: Effects, name: string, c = clips) => survey(f, name, assets, c, SPACE)
  expect(sv(file, 'a')).toEqual({ emitters: [file.effects.a[0], file.effects.b[0]], beam: true, lives: true, waiting: [], problems: [] })
  expect(sv(file, 'a', () => undefined).waiting).toEqual(['fx'])
  expect(sv(file, 'loop').problems).toEqual(['loop is made of itself: loop > loop'])
  expect(sv(file, 'gap').problems).toEqual(['gap names none, which there is none of'])
  expect(sv(file, 'nothing').problems).toEqual(['there is no effect nothing'])
  expect(sv(file, 'bad').problems).toEqual(['a layer plays clip nope of fx, which it does not have', 'art is no sheet entry of the catalogue'])
  expect(sv({ ...file, ppm: undefined }, 'a').problems).toEqual(['a layer draws from fx, and the file gives no ppm'])
  expect(sv(file, 'lasting')).toMatchObject({ lives: true, problems: [] })
  expect(sv(file, 'odd').problems).toEqual(['a layer has a life and lasts', 'a layer has no life and does not last'])
  // a layer that is not what particle2d reads, said as a call handing it is refused, and opened no further
  expect(sv(file, 'shaped').problems).toEqual([
    'layer 0 of shaped n: Invalid input: expected array, received number',
    'layer 1 of shaped: an { effect } layer has no to, which particle2d does not read: its fields are effect, at',
    'shaped names nowhere, which there is none of',
  ])
  expect(sv(file, 'twice').problems).toEqual(['a layer plays clip nope of fx, which it does not have'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('namings, renaming and an effect\'s layers moved are the values that name, move and change', () => {
  const others = [{ path: 'w.json', value: { gun: { muzzle: 'b', impact: { any: 'b', note: 'ab' } } } }]
  expect(namings(file, 'e.json', 'b', others)).toEqual([
    { file: 'e.json', at: ['effects', 'a', 1, 'effect'] },
    { file: 'w.json', at: ['gun', 'muzzle'] },
    { file: 'w.json', at: ['gun', 'impact', 'any'] },
  ])
  expect(renaming(file, 'e.json', 'b', 'c')).toEqual([
    { file: 'e.json', at: ['effects', 'a', 1, 'effect'], value: 'c' },
    { file: 'e.json', at: ['effects', 'c'], value: file.effects.b },
    { file: 'e.json', at: ['effects', 'b'], value: undefined },
  ])
  expect(renaming(file, 'e.json', 'loop', 'l2')[0]).toEqual({ file: 'e.json', at: ['effects', 'l2'], value: [{ effect: 'l2' }] })
  const [x, y, z] = [{ effect: 'x' }, { effect: 'y' }, { effect: 'z' }]
  expect(effectEdits({ ...file, effects: { q: [x, y, z] } }, 'e.json', 'q', [y, x, z])).toEqual([
    { file: 'e.json', at: ['effects', 'q', 0], value: y },
    { file: 'e.json', at: ['effects', 'q', 1], value: x },
  ])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the panel has a field for every field of an emitter the plugin reads, in its order', () => {
  expect(specs(SPACE).map(s => s.key)).toEqual([...FIELDS])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('one particle\'s life: colour to tint1, opacity holding a0 until fade, size to grow; its seconds marked', () => {
  const l = { life: [1, 2] as [number, number], tint: 0xff0000, tint1: 0x0000ff, a0: 1, a1: 0, fade: 0.5, grow: 3 }
  expect(sample(l, undefined, 0)).toEqual({ color: 0xff0000, alpha: 1, size: 1 })
  expect(sample(l, undefined, 0.5)).toEqual({ color: 0x800080, alpha: 1, size: 2 })
  expect(sample(l, undefined, 0.875).alpha).toBeCloseTo(0.5, 9)
  expect(sample(l, undefined, 1)).toEqual({ color: 0x0000ff, alpha: 0, size: 3 })
  expect(sample({ life: [1, 1] }, 0x00ff00, 0.5)).toEqual({ color: 0x00ff00, alpha: 1, size: 1 })
  expect(sample({ life: [1, 1], a1: 0 }, undefined, 0.25).alpha).toBe(0.75)
  // one that lasts is sampled over the life it is handed
  expect(sample({ lasts: true, a1: 0, fade: 1 }, undefined, 0.75, 2).alpha).toBeCloseTo(0.5, 9)
  expect(marks(2)).toEqual([0, 0.5, 1, 1.5, 2])
  expect(marks(0.09)).toEqual([0, 0.02, 0.04, 0.06, 0.08])
})
