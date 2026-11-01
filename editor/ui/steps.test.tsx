// The step grid: a cell per step of each row, pressed while on, a click toggling it, and the head lit.
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { StepGrid } from './steps.tsx'

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('each row has a cell a step, pressed while on; a click hands its row and step over; the head is lit', () => {
  const on = new Set(['kick 0', 'snare 4'])
  const got: [string, number][] = []
  render(<StepGrid label="drums" rows={[{ id: 'kick', label: 'kick' }, { id: 'snare', label: 'snare' }]} steps={8} head={4} on={(r, i) => on.has(`${r} ${i}`)} onToggle={(r, i) => got.push([r, i])} />)
  expect(screen.getAllByRole('gridcell')).toHaveLength(16)
  expect(screen.getByRole('gridcell', { name: 'kick 1' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('gridcell', { name: 'kick 2' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('gridcell', { name: 'snare 5' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('gridcell', { name: 'snare 5' })).toHaveClass('ui-head')
  fireEvent.click(screen.getByRole('gridcell', { name: 'snare 3' }))
  expect(got).toEqual([['snare', 2]])
})
