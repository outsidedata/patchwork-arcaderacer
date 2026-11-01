// A strip of tiles is picked from with the pointer, in a row, in rows, or in as many columns as it is
// told, such as a tileset laid out as its image lays it out. A meter shows how full something is.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Meter, Strip } from './layout.tsx'

const items = Array.from({ length: 6 }, (_, i) => ({ id: i, title: `tile ${i}`, node: <span>{i}</span> }))

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a strip in columns lays its tiles out that many to a row, and hands over the one picked', async () => {
  const picked = vi.fn()
  render(<><Strip label="row" items={items} onSelect={() => {}} /><Strip label="grid" columns={3} items={items} selected={4} onSelect={picked} /></>)
  const grid = screen.getByRole('listbox', { name: 'grid' })
  expect(grid).toHaveClass('ui-strip', 'ui-columns')
  expect(grid.style.getPropertyValue('--columns')).toBe('3')
  expect(screen.getByRole('listbox', { name: 'row' })).not.toHaveClass('ui-columns')
  expect(within(grid).getByRole('option', { name: 'tile 4' })).toHaveAttribute('aria-selected', 'true')
  await userEvent.click(within(grid).getByRole('option', { name: 'tile 2' }))
  expect(picked).toHaveBeenCalledWith(2)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a meter says its value and range, fills to its value and ticks its mark', () => {
  render(<Meter label="spring" value={0.1} min={0} max={0.4} mark={0.2} text="0.10 m" />)
  const meter = screen.getByRole('meter', { name: 'spring' })
  expect(meter).toHaveAttribute('aria-valuenow', '0.1')
  expect(meter).toHaveAttribute('aria-valuemax', '0.4')
  expect((meter.querySelector('.ui-meter-fill') as HTMLElement).style.width).toBe('25%')
  expect((meter.querySelector('.ui-meter-mark') as HTMLElement).style.left).toBe('50%')
  expect(screen.getByText('0.10 m')).toBeTruthy()
})
