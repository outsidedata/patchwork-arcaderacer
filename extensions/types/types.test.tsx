// The editor's own types: an angle shown in degrees and kept in radians, a colour kept in the form
// it came in, an integer kept whole and a bearing on a dial, each wherever a field is bound to it.
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { EditorContext } from '#editor/context.ts'
import { Editor } from '#editor/editor.ts'
import type { FilesApi } from '#editor/files.ts'
import { PropertyGrid } from '#editor/ui/grid.tsx'
import { types } from './types.extension.tsx'

test('an angle, a colour and an integer, bound on a kind', async () => {
  const ed = new Editor({} as FilesApi, undefined)
  ed.use('types', types)
  ed.bind('marine', { yaw: 'angle', tint: 'color', ammo: 'integer' })
  const onChange = vi.fn()
  render(<EditorContext.Provider value={ed}><PropertyGrid value={{ yaw: Math.PI / 2, tint: 0xff0000, ammo: 50 }} owner={{ kind: 'marine' }} onChange={onChange} /></EditorContext.Provider>)
  const user = userEvent.setup()
  expect(screen.getByRole('spinbutton', { name: 'yaw' })).toHaveTextContent('90')
  await user.click(screen.getByRole('spinbutton', { name: 'yaw' }))
  await user.clear(screen.getByRole('textbox', { name: 'yaw' }))
  await user.type(screen.getByRole('textbox', { name: 'yaw' }), '180{Enter}')
  expect(onChange).toHaveBeenLastCalledWith(['yaw'], Math.PI, true)
  fireEvent.change(screen.getByLabelText('tint'), { target: { value: '#0000ff' } })
  expect(onChange).toHaveBeenLastCalledWith(['tint'], 0x0000ff, false)
  await user.click(screen.getByRole('spinbutton', { name: 'ammo' }))
  await user.clear(screen.getByRole('textbox', { name: 'ammo' }))
  await user.type(screen.getByRole('textbox', { name: 'ammo' }), '12.7{Enter}')
  expect(onChange).toHaveBeenLastCalledWith(['ammo'], 13, true)
})

test('a bearing is a dial in degrees clockwise from north, kept in [0, 360)', () => {
  const ed = new Editor({} as FilesApi, undefined)
  ed.use('types', types)
  ed.bind('sky', { windDeg: 'bearing' })
  const onChange = vi.fn()
  render(<EditorContext.Provider value={ed}><PropertyGrid value={{ windDeg: 359 }} owner={{ kind: 'sky' }} onChange={onChange} /></EditorContext.Provider>)
  const dial = screen.getByRole('slider', { name: 'windDeg' })
  expect(dial).toHaveAttribute('aria-valuenow', '359')
  fireEvent.keyDown(dial, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenLastCalledWith(['windDeg'], 0, true)
})
