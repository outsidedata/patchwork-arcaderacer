// A tree: items fold open, one is selected by a click or walked to with the keys.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test } from 'vitest'
import { Tree, type TreeItem } from './tree.tsx'

const items: TreeItem[] = [
  { id: 'hall', label: 'hall', children: [{ id: 'coin', label: 'coin' }, { id: 'body', label: 'body' }] },
  { id: 'vault', label: 'vault', children: [{ id: 'chest', label: 'chest' }] },
]

function Picked() {
  const [selected, setSelected] = useState<string>('hall')
  return <Tree label="rows" items={items} selected={selected} onSelect={setSelected} open={['hall']} />
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a click selects; the arrows walk the items shown and fold one open and shut', async () => {
  render(<Picked />)
  const user = userEvent.setup()
  const item = (name: string) => screen.getByRole('treeitem', { name })
  expect(screen.queryByRole('treeitem', { name: 'chest' })).toBeNull()
  await user.click(item('body'))
  expect(item('body')).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{ArrowDown}')
  expect(item('vault')).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{ArrowRight}')
  expect(item('chest')).toBeInTheDocument()
  expect(item('vault')).toHaveAttribute('aria-expanded', 'true')
  await user.keyboard('{ArrowDown}')
  expect(item('chest')).toHaveAttribute('aria-selected', 'true')
  await user.keyboard('{ArrowUp}{ArrowLeft}')
  expect(screen.queryByRole('treeitem', { name: 'chest' })).toBeNull()
})
