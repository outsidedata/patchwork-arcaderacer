// A table of records: a row selected by a click or the arrow keys, and rows sorted by a column's
// head, one way and then the other.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test } from 'vitest'
import { Table } from './table.tsx'

type Unit = { name: string; hp: number }
const units: Unit[] = [{ name: 'trooper', hp: 10 }, { name: 'walker', hp: 300 }, { name: 'droid', hp: 40 }]

function Units() {
  const [at, setAt] = useState<string>()
  return (
    <Table<Unit>
      label="units"
      rows={units}
      keyOf={u => u.name}
      selected={at}
      onSelect={setAt}
      columns={[
        { key: 'name', title: 'Unit', cell: u => u.name, sort: u => u.name },
        { key: 'hp', title: 'HP', cell: u => u.hp, sort: u => u.hp, numeric: true },
      ]}
    />
  )
}

const names = () => within(screen.getByRole('table', { name: 'units' })).getAllByRole('row').slice(1).map(r => r.firstChild!.textContent)

test('a click and the arrow keys select a row; a column\'s head sorts by it, again the other way', async () => {
  const user = userEvent.setup()
  render(<Units />)
  expect(names()).toEqual(['trooper', 'walker', 'droid'])
  await user.click(screen.getByText('walker'))
  expect(screen.getByText('walker').closest('tr')).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{ArrowDown}')
  expect(screen.getByText('droid').closest('tr')).toHaveAttribute('aria-selected', 'true')
  await user.click(screen.getByRole('button', { name: 'HP' }))
  expect(names()).toEqual(['trooper', 'droid', 'walker'])
  expect(screen.getByRole('columnheader', { name: /HP/ })).toHaveAttribute('aria-sort', 'ascending')
  await user.click(screen.getByRole('button', { name: /HP/ }))
  expect(names()).toEqual(['walker', 'droid', 'trooper'])
  // The keys walk the rows in the order they are shown.
  await user.keyboard('{ArrowUp}')
  expect(screen.getByText('walker').closest('tr')).toHaveAttribute('aria-selected', 'true')
})
