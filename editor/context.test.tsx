// A burst of changes that lands before React draws is drawn once. A change that lands between a
// component's drawing and its subscribing is drawn all the same.
import { act, render } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { expect, test } from 'vitest'
import { EditorContext, useEditor } from './context.ts'
import type { Editor, Topic } from './editor.ts'
import { editor } from './test/editor.ts'

// A component on `topics` that counts its drawings in `draws`, under the editor.
function counted(ed: Editor, topics: Topic[]) {
  const draws = { n: 0 }
  function Reader() {
    useEditor(topics)
    draws.n++
    return null
  }
  render(<EditorContext.Provider value={ed}><Reader /></EditorContext.Provider>)
  return draws
}

test('a hundred changes that land before React draws are drawn once', async () => {
  const { ed } = await editor()
  const draws = counted(ed, ['log', 'texts'])
  const before = draws.n
  await act(async () => {
    for (let i = 0; i < 100; i++) {
      ed.info(`line ${i}`)
      ed.changed('texts', [`games/none/${i}.json`])
    }
  })
  expect(draws.n).toBe(before + 1)
})

test('a change that lands after a component is drawn and before it subscribes is drawn', async () => {
  const { ed } = await editor()
  let lines = -1
  let draws = 0
  function Reader() {
    lines = useEditor(['log']).log.length
    draws++
    return null
  }
  // Its layout effect runs after the drawing and before any passive effect, the one that subscribes.
  function Writer() {
    useLayoutEffect(() => { ed.info('between') }, [])
    return null
  }
  const before = ed.log.length
  await act(async () => {
    render(<EditorContext.Provider value={ed}><Reader /><Writer /></EditorContext.Provider>)
  })
  expect(lines).toBe(before + 1)
  expect(draws).toBe(2)
})
