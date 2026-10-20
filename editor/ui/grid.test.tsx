// A property grid: every field drawn by its type, bound or by shape, and every change handed back
// with the field's path.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { EditorContext } from '../context.ts'
import { Editor, type FieldProps } from '../editor.ts'
import type { FilesApi } from '../files.ts'
import { PropertyGrid } from './grid.tsx'

const none = {} as FilesApi

function Stars({ value, onChange, label }: FieldProps<number>) {
  return <button type="button" aria-label={label} onClick={() => onChange(value + 1, true)}>{'★'.repeat(value)}</button>
}

const imp = { health: 60, solid: true, pos: [1, 0, 2], state: 'look', colour: '#445533', target: null, ai: { reaction: 8, sight: [4, 5] } }

test('each field is drawn by its shape, and an edit comes back with its path', async () => {
  const ed = new Editor(none, undefined)
  const onChange = vi.fn()
  render(<EditorContext.Provider value={ed}><PropertyGrid value={imp} owner={{ kind: 'imp' }} onChange={onChange} /></EditorContext.Provider>)
  expect(screen.getByRole('spinbutton', { name: 'health' })).toHaveTextContent('60')
  expect(screen.getByRole('checkbox', { name: 'solid' })).toBeChecked()
  expect(screen.getByRole('spinbutton', { name: 'pos z' })).toHaveTextContent('2')
  expect(screen.getByRole('textbox', { name: 'state' })).toHaveValue('look')
  expect(screen.getByLabelText('colour')).toHaveValue('#445533')
  expect(screen.getByRole('textbox', { name: 'target' })).toHaveValue('null')
  expect(screen.getByRole('spinbutton', { name: 'ai.reaction' })).toHaveTextContent('8')
  const user = userEvent.setup()
  await user.click(screen.getByRole('spinbutton', { name: 'ai.sight y' }))
  await user.clear(screen.getByRole('textbox', { name: 'ai.sight y' }))
  await user.type(screen.getByRole('textbox', { name: 'ai.sight y' }), '7{Enter}')
  expect(onChange).toHaveBeenCalledWith(['ai', 'sight'], [4, 7], true)
  await user.click(screen.getByRole('checkbox', { name: 'solid' }))
  expect(onChange).toHaveBeenCalledWith(['solid'], false, true)
})

test('a field bound to a type is drawn by the component an extension gave that type, for that kind only', async () => {
  const ed = new Editor(none, undefined)
  ed.use('stars', e => {
    e.field('stars', Stars)
    e.bind('imp', { health: 'stars', 'ai.*': 'stars' })
  })
  const onChange = vi.fn()
  const { rerender } = render(
    <EditorContext.Provider value={ed}><PropertyGrid value={{ health: 3, ai: { reaction: 2 } }} owner={{ kind: 'imp' }} onChange={onChange} /></EditorContext.Provider>,
  )
  expect(screen.getByRole('button', { name: 'health' })).toHaveTextContent('★★★')
  await userEvent.setup().click(screen.getByRole('button', { name: 'ai.reaction' }))
  expect(onChange).toHaveBeenCalledWith(['ai', 'reaction'], 3, true)
  rerender(<EditorContext.Provider value={ed}><PropertyGrid value={{ health: 3 }} owner={{ kind: 'zombie' }} onChange={onChange} /></EditorContext.Provider>)
  expect(screen.getByRole('spinbutton', { name: 'health' })).toBeInTheDocument()
  // The extension turned off takes its type with it.
  ed.drop('stars')
  rerender(<EditorContext.Provider value={ed}><PropertyGrid value={{ health: 3 }} owner={{ kind: 'imp' }} onChange={onChange} /></EditorContext.Provider>)
  expect(screen.getByRole('spinbutton', { name: 'health' })).toBeInTheDocument()
})

test('a grid of a value inside a file, a scene\'s world in its scene file, is bound by the file\'s paths and labelled from its own top, where its tables start open', async () => {
  const ed = new Editor(none, undefined)
  ed.use('stars', e => {
    e.field('stars', Stars)
    e.bindFile('games/x/hall.scene.json', { 'world.lives': 'stars' })
  })
  const onChange = vi.fn()
  render(
    <EditorContext.Provider value={ed}>
      <PropertyGrid value={{ lives: 2, room: { size: 4, light: { level: 1 } } }} owner={{ scene: 'hall', file: 'games/x/hall.scene.json' }} at={['world']} top={1} onChange={onChange} />
    </EditorContext.Provider>,
  )
  expect(screen.getByRole('button', { name: 'lives' })).toHaveTextContent('★★')
  expect(screen.getByRole('spinbutton', { name: 'room.size' })).toHaveTextContent('4')
  // A table inside one at the top starts closed, as it does in a grid of a whole value.
  expect(screen.queryByRole('spinbutton', { name: 'room.light.level' })).toBeNull()
  await userEvent.setup().click(screen.getByRole('button', { name: 'lives' }))
  expect(onChange).toHaveBeenCalledWith(['world', 'lives'], 3, true)
})
