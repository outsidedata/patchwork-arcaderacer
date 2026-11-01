// What the Tiles panel's tests and its view test both use: a tile picked from the panel, the wait for
// every edit to be written, and every change taken back.
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, vi } from 'vitest'
import type { Editor } from '#editor/editor.ts'
import { onChain } from '#editor/live.ts'

// Every edit asked for has been written, and the editor has taken it in: the editor's chain of writes,
// which every edit of the map is made on, has run through, and the panel says it writes no more.
export const saved = async (ed: Editor) => {
  await act(() => onChain(ed, () => {}))
  await vi.waitFor(() => expect(screen.queryByText('writing')).toBeNull())
  await act(async () => { await Promise.resolve() })
}
// Every change the test made taken back, one undo at a time.
export const undoAll = async (ed: { undos: unknown[]; undo(): Promise<void> }) => { while (ed.undos.length) await act(() => ed.undo()) }
export const tile = async (id: number) => userEvent.click(within(screen.getByRole('listbox', { name: 'tiles' })).getByRole('option', { name: `tile ${id}` }))
