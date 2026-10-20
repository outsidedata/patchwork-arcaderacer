// box3dvehicle's extension and a vehicle's `look.model`: the grid's fields for it, the field its
// `asset` is drawn as and what that offers, and the writes the grid and `vehicle.design` make of it,
// refused where they are not of its shape or name no model of the catalogue. On an editor with no game
// open, as the editor's own types are tested, and a fleet of the test's own.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { EditorContext } from '#editor/context.ts'
import { Editor, worldGridEdits } from '#editor/editor.ts'
import type { FilesApi } from '#editor/files.ts'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { box3dvehicle, KIND, MODEL, modelChoices, unmodelled } from './box3dvehicle.extension.tsx'
import type { Fleet, Model } from './box3dvehicle.sim.ts'

const model: Model = { asset: 'tractor', at: [0.2, -0.3, 0], scale: 1.5 }
// A fleet of one vehicle whose look names a model; its other numbers are no business of these tests,
// and the grid shows only what is there.
const fleet = { chassis: 'body', wheel: 'tyre', joint: 'axle', vehicles: { tractor: { look: { segments: 16, model } } } } as unknown as Fleet
const FILE = 'games/x/x.scene.json'

function made() {
  const ed = new Editor({} as FilesApi, undefined)
  ed.use(KIND, box3dvehicle)
  return ed
}

test('a vehicle\'s look.model.asset is a field of the model type, which the extension adds; its at and scale are fields as the look\'s others are', () => {
  const ed = made()
  expect(ed.typeOf(KIND, ['vehicles', 'tractor', 'look', 'model', 'asset'])).toBe(MODEL)
  expect(ed.fields.has(MODEL)).toBe(true)
  expect(ed.typeOf(KIND, ['vehicles', 'tractor', 'look', 'model', 'at'])).toBeUndefined()
  expect(ed.typeOf(KIND, ['vehicles', 'tractor', 'look', 'segments'])).toBeUndefined()
})

test('the grid writes look.model\'s asset, at and scale each at its place under world.box3dvehicle, and refuses a value not of its shape', () => {
  const ed = made()
  const set = (values: Record<string, unknown>) => worldGridEdits(ed, KIND, FILE, fleet as unknown as Record<string, unknown>, values)
  const at = (...path: (string | number)[]) => ['world', KIND, 'vehicles', 'tractor', 'look', 'model', ...path]
  expect(set({ 'vehicles.tractor.look.model.asset': 'combine', 'vehicles.tractor.look.model.at': [0, 0.1, 0], 'vehicles.tractor.look.model.scale': 2 })).toEqual([
    { file: FILE, at: at('asset'), value: 'combine' },
    { file: FILE, at: at('at'), value: [0, 0.1, 0] },
    { file: FILE, at: at('scale'), value: 2 },
  ])
  expect(() => set({ 'vehicles.tractor.look.model.at': [0, 0.1] })).toThrow(/^world\.box3dvehicle vehicles\.tractor\.look\.model\.at is \[0\.2,-0\.3,0\], and \[0,0\.1\] is not of its shape/)
  expect(() => set({ 'vehicles.tractor.look.model.scale': '2' })).toThrow(/^world\.box3dvehicle vehicles\.tractor\.look\.model\.scale is 1\.5, and "2" is not of its shape/)
  expect(() => set({ 'vehicles.tractor.look.model.asset': 3 })).toThrow(/^world\.box3dvehicle vehicles\.tractor\.look\.model\.asset is "tractor", and 3 is not of its shape/)
  expect(() => set({ 'vehicles.tractor.look.model': {} })).toThrow('world.box3dvehicle has no field vehicles.tractor.look.model: its fields under it are vehicles.tractor.look.model.asset, vehicles.tractor.look.model.at, vehicles.tractor.look.model.scale')
})

test('a model\'s asset is refused unless it names a model entry of the catalogue, saying which it named and which there are; nothing else is asked about', () => {
  const models = ['tractor', 'combine']
  expect(unmodelled({ 'vehicles.tractor.look.model.asset': 'combine', 'vehicles.tractor.look.model.scale': 2 }, models)).toBeUndefined()
  expect(unmodelled({ 'vehicles.tractor.look.model.asset': 'barn' }, models)).toBe('vehicles.tractor.look.model.asset is "barn", and the catalogue\'s models are tractor, combine')
  expect(unmodelled({ 'vehicles.tractor.look.model.asset': 'barn' }, [])).toBe('vehicles.tractor.look.model.asset is "barn", and the catalogue\'s models are none')
  // A field elsewhere that happens to be called asset is not a model's.
  expect(unmodelled({ 'vehicles.tractor.look.exhaust.asset': 'barn' }, models)).toBeUndefined()
})

test('the model field offers each model of the catalogue and the name it holds, marked when the catalogue has no such model', () => {
  expect(modelChoices('tractor', ['tractor', 'combine'])).toEqual([{ value: 'tractor', label: 'tractor' }, { value: 'combine', label: 'combine' }])
  expect(modelChoices('gone', ['tractor'])).toEqual([{ value: 'gone', label: 'gone (not in the catalogue)' }, { value: 'tractor', label: 'tractor' }])
})

test('the grid draws look.model\'s asset as the model field, and its at and scale as numbers, each change handed back at its path', () => {
  const ed = made()
  const onChange = vi.fn()
  render(<EditorContext.Provider value={ed}><PropertyGrid value={fleet as unknown as Record<string, unknown>} owner={{ kind: KIND }} onChange={onChange} /></EditorContext.Provider>)
  for (const fold of ['tractor', 'look', 'model']) fireEvent.click(screen.getByRole('button', { name: fold }))
  // No game open: no catalogue, so the name it holds is the one choice, marked.
  const asset = screen.getByRole('combobox', { name: 'vehicles.tractor.look.model.asset' })
  expect(within(asset).getAllByRole('option').map(o => o.textContent)).toEqual(['tractor (not in the catalogue)'])
  fireEvent.change(asset, { target: { value: 'tractor' } })
  expect(onChange).toHaveBeenLastCalledWith(['vehicles', 'tractor', 'look', 'model', 'asset'], 'tractor', true)
  expect(['x', 'y', 'z'].map(k => screen.getByRole('spinbutton', { name: `vehicles.tractor.look.model.at ${k}` }).getAttribute('aria-valuenow'))).toEqual(['0.2', '-0.3', '0'])
  expect(screen.getByRole('spinbutton', { name: 'vehicles.tractor.look.model.scale' })).toHaveAttribute('aria-valuenow', '1.5')
})
