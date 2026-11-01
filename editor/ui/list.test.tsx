// A list of nodes edited in place: each row moves up and down, is dropped, is dragged onto another
// row's place, and Add appends what `make` makes; every change is the whole list as it now is.
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { NodeList } from './list.tsx'

const nodes = [{ name: 'base' }, { name: 'hills' }, { name: 'sum' }]

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('rows move, drop, drag and add, each change handing back the whole list', async () => {
  const onChange = vi.fn()
  render(<NodeList label="program" items={nodes} name={n => n.name} onChange={onChange} make={() => ({ name: 'new' })} render={n => <span>{n.name} body</span>} />)
  const user = userEvent.setup()
  const rows = within(screen.getByRole('list', { name: 'program' })).getAllByRole('listitem')
  expect(rows.map(r => r.getAttribute('aria-label'))).toEqual(['base', 'hills', 'sum'])
  expect(within(rows[1]).getByText('hills body')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'move base up' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'move sum down' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'move hills up' }))
  expect(onChange).toHaveBeenLastCalledWith([{ name: 'hills' }, { name: 'base' }, { name: 'sum' }])
  await user.click(screen.getByRole('button', { name: 'move base down' }))
  expect(onChange).toHaveBeenLastCalledWith([{ name: 'hills' }, { name: 'base' }, { name: 'sum' }])
  await user.click(screen.getByRole('button', { name: 'drop hills' }))
  expect(onChange).toHaveBeenLastCalledWith([{ name: 'base' }, { name: 'sum' }])
  await user.click(screen.getByRole('button', { name: 'add to program' }))
  expect(onChange).toHaveBeenLastCalledWith([...nodes, { name: 'new' }])
  // The first row's head dragged onto the last row puts it last.
  fireEvent.dragStart(rows[0].firstElementChild!)
  fireEvent.dragOver(rows[2])
  fireEvent.drop(rows[2])
  expect(onChange).toHaveBeenLastCalledWith([{ name: 'hills' }, { name: 'sum' }, { name: 'base' }])
  expect(onChange).toHaveBeenCalledTimes(5)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('with no `make` there is no Add, and a row with no name is called by its place', () => {
  render(<NodeList label="layers" items={[1, 2]} onChange={() => {}} render={n => String(n)} />)
  expect(screen.queryByRole('button', { name: 'add to layers' })).toBeNull()
  expect(screen.getAllByRole('listitem').map(r => r.getAttribute('aria-label'))).toEqual(['0', '1'])
})

// A row whose field holds what is typed until it is committed, as a draft does.
function Draft({ label }: { label: string }) {
  const [text, setText] = useState('')
  return <input aria-label={label} value={text} onChange={e => setText(e.target.value)} />
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('what a row\'s field holds goes with its node when the node moves, and stays with its place when the node is replaced by an edited copy', async () => {
  function Program() {
    const [items, setItems] = useState([{ name: 'base' }, { name: 'hills' }, { name: 'sum' }])
    return (
      <>
        <NodeList label="program" items={items} name={n => n.name} onChange={setItems} render={(_n, i) => <Draft label={`draft ${i}`} />} />
        <button type="button" onClick={() => setItems(its => its.map((n, i) => (i === 0 ? { ...n, name: 'ridges' } : n)))}>rename</button>
      </>
    )
  }
  render(<Program />)
  const user = userEvent.setup()
  await user.type(screen.getByRole('textbox', { name: 'draft 0' }), 'half typed')
  await user.click(screen.getByRole('button', { name: 'move base down' }))
  expect(within(screen.getByRole('listitem', { name: 'base' })).getByRole('textbox')).toHaveValue('half typed')
  expect(within(screen.getByRole('listitem', { name: 'hills' })).getByRole('textbox')).toHaveValue('')
  // hills, now first, is replaced by a copy named ridges: its row, and what it holds, stay.
  await user.type(screen.getByRole('textbox', { name: 'draft 0' }), 'kept')
  await user.click(screen.getByRole('button', { name: 'rename' }))
  expect(within(screen.getByRole('listitem', { name: 'ridges' })).getByRole('textbox')).toHaveValue('kept')
  expect(within(screen.getByRole('listitem', { name: 'base' })).getByRole('textbox')).toHaveValue('half typed')
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('rows of plain values keep their rows while the list does not change', async () => {
  const { rerender } = render(<NodeList label="layers" items={[1, 2]} onChange={() => {}} render={(_n, i) => <Draft label={`d ${i}`} />} />)
  await userEvent.setup().type(screen.getByRole('textbox', { name: 'd 1' }), 'x')
  rerender(<NodeList label="layers" items={[1, 2]} onChange={() => {}} render={(_n, i) => <Draft label={`d ${i}`} />} />)
  expect(screen.getByRole('textbox', { name: 'd 1' })).toHaveValue('x')
})
