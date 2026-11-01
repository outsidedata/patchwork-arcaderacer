// A small chart: a line per series in the series colours in order, areas washed under them, bands
// shaded and labelled, a legend only for two or more series, a crosshair with every value at the
// nearest x, and the values as a table.
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { Chart } from './chart.tsx'

const wave: [number, number][] = [[0, 0], [50, 1.5], [100, -0.5], [150, 0.25], [200, 0]]

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('one series: a line in the first series colour, no legend, the hover reading the value at the nearest x', () => {
  const { container } = render(<Chart label="height along the view" series={[{ label: 'height', points: wave }]} x={{ label: 'm' }} y={{ label: 'height, m' }} />)
  const plot = screen.getByRole('img', { name: 'height along the view' })
  expect(container.querySelectorAll('.ui-series-1 .ui-chart-line')).toHaveLength(1)
  expect(container.querySelector('.ui-chart-area')).toBeNull()
  expect(container.querySelector('.ui-chart-key')).toBeNull()
  plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 150, right: 320, bottom: 150, x: 0, y: 0, toJSON() {} })
  // 320 wide with 44 on the left and 10 on the right: x 50 is drawn at 44 + 266 / 4.
  fireEvent.pointerMove(plot, { clientX: 44 + 266 / 4 + 3 })
  expect(screen.getByRole('status')).toHaveTextContent('m 50')
  expect(screen.getByRole('status')).toHaveTextContent('1.5')
  fireEvent.pointerLeave(plot)
  expect(screen.queryByRole('status')).toBeNull()
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('two series on a log x, as areas, with a band per cascade: a legend names them, and Table lists every value', async () => {
  const energy = (k: number): [number, number][] => [1, 10, 100, 1000].map(l => [l, k * Math.exp(-((Math.log10(l) - 2) ** 2))])
  const { container } = render(
    <Chart
      label="energy against wavelength"
      area
      series={[{ label: 'wind', points: energy(1) }, { label: 'swell', points: energy(0.5) }]}
      x={{ label: 'wavelength, m', log: true }}
      y={{ label: 'energy' }}
      bands={[{ from: 1, to: 10, label: 'cascade 2' }, { from: 10, to: 250, label: 'cascade 1' }]}
    />,
  )
  expect(container.querySelectorAll('.ui-chart-area')).toHaveLength(2)
  expect([...container.querySelectorAll('.ui-chart-key')].map(k => k.textContent)).toEqual(['wind', 'swell'])
  expect(container.querySelectorAll('.ui-series-2 .ui-chart-line')).toHaveLength(1)
  expect(within(screen.getByRole('img')).getByText('cascade 1')).toBeInTheDocument()
  // The log axis is ticked at the powers of ten.
  for (const t of ['1', '10', '100', '1000']) expect(within(screen.getByRole('img')).getAllByText(t).length).toBeGreaterThan(0)
  await userEvent.setup().click(screen.getByRole('button', { name: 'energy against wavelength as a table' }))
  const table = screen.getByRole('table', { name: 'energy against wavelength' })
  expect(within(table).getAllByRole('row')).toHaveLength(5)
  expect(within(table).getAllByRole('row')[3]).toHaveTextContent('100')
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('two series sampled at different x: the hover reads each at its own nearest x, and the table has a row for every x', async () => {
  const a: [number, number][] = [[0, 1], [10, 2], [20, 3]]
  const b: [number, number][] = [[-5, 6], [5, 7], [15, 8]]
  render(<Chart label="two" series={[{ label: 'a', points: a }, { label: 'a', points: b }]} x={{ label: 'm' }} y={{ label: 'v' }} />)
  const plot = screen.getByRole('img', { name: 'two' })
  plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 150, right: 320, bottom: 150, x: 0, y: 0, toJSON() {} })
  // x 14 is drawn at 44 + 266·19/25 on an axis from −5 to 20: the first series' nearest is 10, the
  // second's 15.
  fireEvent.pointerMove(plot, { clientX: 44 + (266 * 19) / 25 })
  const tip = screen.getByRole('status')
  expect(tip).toHaveTextContent('m 10')
  expect(within(tip).getAllByText(/^a /).map(e => e.textContent)).toEqual(['a 2', 'a 8 at 15'])
  await userEvent.setup().click(screen.getByRole('button', { name: 'two as a table' }))
  const rows = within(screen.getByRole('table', { name: 'two' })).getAllByRole('row').slice(1).map(r => r.textContent)
  expect(rows).toEqual(['-56', '01', '57', '102', '158', '203'])
})
