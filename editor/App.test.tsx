// The editor's page on no game: a docked panel behind another tab, which waits until it is shown,
// every panel's drawings counted.
// The game view draws with WebGL, which jsdom has none of; it is looked at in Chrome.
import { act, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { App } from './App.tsx'
import { useEditor } from './context.ts'
import { editor } from './test/editor.ts'
import { hierarchy } from '#extensions/hierarchy/hierarchy.extension.tsx'
import { timeline } from '#extensions/timeline/timeline.extension.tsx'
import { inspector } from '#extensions/inspector/inspector.extension.tsx'

// The page on no game.
async function page() {
  const made = await editor()
  made.ed.use('hierarchy', hierarchy)
  made.ed.use('timeline', timeline)
  made.ed.use('inspector', inspector)
  render(<App editor={made.ed} />)
  return made
}

test('a docked panel behind another tab is not drawn while hidden, and is drawn as the editor is once shown; each panel\'s drawings are counted', async () => {
  const { ed } = await page()
  const draws = { front: 0, back: 0 }
  // Two panels that show how many lines the console has, joining the timeline's area behind it.
  const lines = (id: 'front' | 'back') => function Lines() {
    const e = useEditor(['log'])
    draws[id]++
    return <p>{id} has {e.log.length} lines</p>
  }
  act(() => ed.use('notes', e => {
    e.panel({ id: 'front', title: 'Front', area: 'bottom', component: lines('front') })
    e.panel({ id: 'back', title: 'Back', area: 'bottom', component: lines('back') })
  }))
  act(() => ed.reveal('front'))
  await screen.findByText(/^front has/)
  const before = { ...draws }
  await act(async () => {
    ed.info('one')
    ed.info('two')
  })
  expect(screen.getByText(`front has ${ed.log.length} lines`)).toBeInTheDocument()
  expect(draws.front).toBeGreaterThan(before.front)
  expect(draws.back).toBe(before.back)
  act(() => ed.reveal('back'))
  expect(await screen.findByText(`back has ${ed.log.length} lines`)).toBeInTheDocument()
  const perf = ed.perf()
  expect(perf.panels.find(p => p.panel === 'front')?.draws).toBeGreaterThan(0)
  expect(perf.topics.log).toBeGreaterThan(0)
})
