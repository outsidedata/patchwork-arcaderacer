import { expect, test } from 'vitest'
import { plan } from './particle-views.ts'

// two effects files in a folder: one of two effects, and one that lists the other
const files: Record<string, string> = {
  '/fx/a.json': JSON.stringify({ cap: 100, effects: { fire: [{ life: [1, 1] }, { life: [2, 2] }, { life: [3, 3] }], smoke: [{ life: [1, 1] }] } }),
  '/fx/b.json': JSON.stringify({ cap: 100, files: ['a.json'], effects: { rift: [{ effect: 'fire' }] } }),
}
const read = (f: string) => {
  if (!files[f]) throw new Error(`no file ${f}`)
  return files[f]
}
const at = { camera: [1, 2, 3], target: [0, 1, 0], preroll: 0.5 }

test('a view is one picture, what it leaves out filled in, and a list of layers is its own effect\'s', () => {
  expect(plan([{ file: 'a.json', effect: 'fire', ...at, off: [1], only: { smoke: [0] } }], '/fx', read)).toEqual([{
    name: 'a-fire', file: '/fx/a.json', sheets: {}, size: [1280, 720],
    view: {
      effect: 'fire', camera: [1, 2, 3], target: [0, 1, 0], fov: 45, preroll: 0.5, off: { fire: [1] }, only: { smoke: [0] },
      at: [0, 1.2, 0], dir: [0, 1, 0], to: [6, 1.2, 0], scale: 1, seed: 1, from: 'still', stage: true,
    },
  }])
})

test('a view of no effect is a picture of every effect of its file, the files it lists too, each named for its effect', () => {
  expect(plan([{ file: 'b.json', name: 'sweep', ...at }], '/fx', read).map(s => [s.name, s.view.effect])).toEqual([['sweep-rift', 'rift'], ['sweep-fire', 'fire'], ['sweep-smoke', 'smoke']])
})

test('a view the file cannot play throws, naming the view', () => {
  expect(() => plan([{ file: 'a.json', effect: 'ice', ...at }], '/fx', read)).toThrow('view 0 is of the effect ice, which a.json has not: it has fire, smoke')
  expect(() => plan([{ file: 'a.json', effect: 'fire', ...at, off: [3] }], '/fx', read)).toThrow('view 0 turns off the layers [3] of fire, which has layers 0 to 2')
  expect(() => plan([{ file: 'a.json', ...at, only: [0] }], '/fx', read)).toThrow('is of every effect and has only as a list')
  expect(() => plan([{ file: 'a.json', effect: 'fire', camera: [1, 2, 3], target: [0, 1, 0] }], '/fx', read)).toThrow('view 0 has a preroll of undefined')
  expect(() => plan([{ file: 'a.json', effect: 'fire', ...at, zoom: 2 }], '/fx', read)).toThrow('view 0 has zoom, which a view does not')
  expect(() => plan([{ file: 'a.json', effect: 'fire', ...at }, { file: 'a.json', effect: 'fire', ...at, preroll: 1 }], '/fx', read)).toThrow('two pictures are named a-fire')
})
