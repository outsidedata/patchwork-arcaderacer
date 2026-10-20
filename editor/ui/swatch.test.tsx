// A swatch is its colour, named by its label or else by the colour.
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { Swatch } from './swatch.tsx'

test('a swatch is a square of its colour, named by its label, or by the colour when it has none', () => {
  render(<><Swatch color="#7dff6a" label="Empire" /><Swatch color="#ff5d5d" /></>)
  expect(screen.getByRole('img', { name: 'Empire' })).toHaveStyle({ background: '#7dff6a' })
  expect(screen.getByRole('img', { name: 'Empire' })).toHaveAttribute('title', 'Empire')
  expect(screen.getByRole('img', { name: '#ff5d5d' })).toHaveStyle({ background: '#ff5d5d' })
})
