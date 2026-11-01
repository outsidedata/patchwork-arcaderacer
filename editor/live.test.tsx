// A file a panel edits in place shows what the files say once they change, by a write landing or an
// undo, and an undo back to the very text the file had when an edit was made shows that text, not
// the edit; an edit still being written stays shown as a write before it lands. A command's write of
// the same file waits on the panel's writes, and the panel's next edit is made over it.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { EditorContext, useText } from './context.ts'
import { liveWrite, useLive, type Codec } from './live.ts'
import { editor } from './test/editor.ts'

// A data file of no game, which the test's server holds in memory from the start.
const path = 'live.json'
const TEXT = '{"viking":{"speed":3}}'
type Defs = { viking: { speed: number } }

// An editor on no game, its server holding the file the panel edits.
const open = async () => {
  const made = await editor()
  made.texts.set(path, TEXT)
  return made
}

function Speed({ text }: { text: string }) {
  const live = useLive<Defs>(path, text)
  return (
    <>
      <output aria-label="speed">{live.value.viking.speed}</output>
      <button onClick={() => live.edit(d => ({ ...d, viking: { ...d.viking, speed: d.viking.speed + 4 } }))}>faster</button>
      {live.writing && <span>writing</span>}
    </>
  )
}
function Panel() {
  const text = useText(path)
  return text === undefined ? null : <Speed text={text} />
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('an edit is shown as it is written, and undo and redo show the file as each leaves it', async () => {
  const { ed, read } = await open()
  const user = userEvent.setup()
  render(<EditorContext.Provider value={ed}><Panel /></EditorContext.Provider>)
  const speed = await screen.findByRole('status', { name: 'speed' })
  const before = await read(path)
  expect(speed).toHaveTextContent('3')
  await user.click(screen.getByRole('button', { name: 'faster' }))
  expect(speed).toHaveTextContent('7')
  // In the history as it is sent, and written once the server has answered it.
  await waitFor(() => expect(ed.undos).toHaveLength(1))
  await act(() => ed.idle())
  expect(JSON.parse(await read(path)).viking.speed).toBe(7)
  await act(() => ed.undo())
  expect(await read(path)).toBe(before)
  expect(speed).toHaveTextContent('3')
  await act(() => ed.redo())
  expect(speed).toHaveTextContent('7')
  await act(() => ed.undo())
  expect(speed).toHaveTextContent('3')
  // An edit after the undo edits what the file now says.
  await user.click(screen.getByRole('button', { name: 'faster' }))
  expect(speed).toHaveTextContent('7')
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('an edit still being written stays shown when a write before it lands, until its own lands', async () => {
  const { ed, files } = await open()
  render(<EditorContext.Provider value={ed}><Panel /></EditorContext.Provider>)
  const speed = await screen.findByRole('status', { name: 'speed' })
  // The second change the page sends is held back until the test lets it go.
  let go!: () => void
  const held = new Promise<void>(done => { go = done })
  const change = files.change
  let sent = 0
  files.change = async (id, ops) => {
    if (++sent === 2) await held
    return change(id, ops)
  }
  fireEvent.click(screen.getByRole('button', { name: 'faster' }))
  fireEvent.click(screen.getByRole('button', { name: 'faster' }))
  expect(speed).toHaveTextContent('11')
  // The first lands, and the files say 7; the second, still being written, is what is shown.
  await waitFor(() => expect(JSON.parse(ed.texts.get(path)!).viking.speed).toBe(7))
  await act(async () => { await new Promise(r => setTimeout(r, 0)) })
  expect(speed).toHaveTextContent('11')
  go()
  await waitFor(() => expect(JSON.parse(ed.texts.get(path)!).viking.speed).toBe(11))
  await act(() => ed.idle())
  expect(speed).toHaveTextContent('11')
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a write made as a command makes it waits on the panel\'s writes asked for before it, and an edit the panel asks for after it is made over what it wrote', async () => {
  const { ed, read } = await open()
  render(<EditorContext.Provider value={ed}><Panel /></EditorContext.Provider>)
  const speed = await screen.findByRole('status', { name: 'speed' })
  const before = await read(path)
  const one: Codec<Defs> = { read: files => files[path] as Defs, write: async value => ({ [path]: value }) }
  // The panel's edit, the command's, and the panel's again, each asked for before any is written.
  fireEvent.click(screen.getByRole('button', { name: 'faster' }))
  const doubled = liveWrite(ed, ed, [path], one, d => ({ ...d, viking: { ...d.viking, speed: d.viking.speed * 2 } }))
  fireEvent.click(screen.getByRole('button', { name: 'faster' }))
  await act(() => doubled)
  // The last is taken in once the server has answered it.
  await waitFor(() => expect(speed).toHaveTextContent('18'))
  expect(JSON.parse(await read(path)).viking.speed).toBe((3 + 4) * 2 + 4)
  expect(ed.undos).toHaveLength(3)
  for (let i = 0; i < 3; i++) await act(() => ed.undo())
  expect(await read(path)).toBe(before)
})
