// The games extension in a sandbox of the repo whose games folder is its own, with its route, the
// kinds route and the code route answered: a game made blank is gone to, and the page on it boots its
// scene with the scenemanager's, the loader's and the start's rows and its seat's player; and composed from there, a kind made in it and listed by its
// scene's sim; the Games panel's list and its New game form making one; a name taken refused.
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, expect, onTestFinished, test, vi } from 'vitest'
import { EditorContext } from '#editor/context.ts'
import { answer, editor, noClock, sandbox } from '#editor/test/editor.ts'
import { code } from '#extensions/code/code.extension.tsx'
import { code as codeRoutes } from '#extensions/code/code.route.ts'
import { kinds } from '#extensions/kinds/kinds.extension.tsx'
import { kinds as kindsRoutes } from '#extensions/kinds/kinds.route.ts'
import { games } from './games.extension.tsx'
import { games as routes } from './games.route.ts'

// Each test makes a game, boots it and makes a kind in it: under a second alone, past the default
// five beside the rest of the editor's tests.
vi.setConfig({ testTimeout: 30_000 })
beforeEach(() => sessionStorage.clear())

let root = ''
// An editor page on `game`, or on none, in the sandbox made once for the test.
async function page(game?: string) {
  const made = await editor(game, {
    '/extensions/games/games.extension.tsx': async () => ({ games }),
    '/extensions/kinds/kinds.extension.tsx': async () => ({ kinds }),
    '/extensions/code/code.extension.tsx': async () => ({ code }),
  })
  onTestFinished(() => made.ed.close())
  return made
}
async function open() {
  noClock()
  root = sandbox([])
  answer('games', routes)
  answer('kinds', kindsRoutes)
  answer('code', codeRoutes)
  return page()
}
const disk = (p: string) => (existsSync(path.join(root, p)) ? readFileSync(path.join(root, p), 'utf8') : null)

test('a game made blank is gone to once the call has its answer; the page on it boots its scene, lists it open, and makes a kind in it; a name taken is refused', async () => {
  const { ed, opened } = await open()
  const made = await act(() => ed.call('games.new', { name: 'fresh' })) as { files: string[]; port: number }
  expect(made.files).toContain('games/fresh/main.sim.ts')
  await vi.waitFor(() => expect(opened).toEqual(['fresh']))
  expect(ed.session).toBeUndefined()

  // The page the editor went to.
  const { ed: there } = await page('fresh')
  await there.open()
  expect(there.session!.scene('main').rows.map(r => r.kind)).toEqual(['scenemanager', 'loader', 'start', 'player'])
  expect(await there.call('games.list')).toMatchObject({ games: expect.arrayContaining([{ name: 'fresh', opens: true, open: true }]) })
  await act(() => there.call('kinds.make', { name: 'hero' }))
  expect(disk('games/fresh/hero.sim.ts')).toContain('export const hero: Kind = {}')
  expect(disk('games/fresh/main.sim.ts')).toContain('export const sim: Sim = { scenemanager, loader, player, start, body, hero }')

  await expect(there.call('games.new', { name: 'fresh' })).rejects.toThrow('there is a game fresh already')
  expect([...ed.log, ...there.log].filter(l => l.level === 'error')).toEqual([])
})

test('the Games panel lists the games there are now; its New game form makes a game and goes to it', async () => {
  const { ed, opened } = await open()
  const P = ed.panels.get('games')!.component
  render(<EditorContext.Provider value={ed}><P /></EditorContext.Provider>)
  await userEvent.click(await screen.findByRole('button', { name: 'New game' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'name' }), 'pond{Enter}')
  const scene = screen.getByRole('textbox', { name: 'scene' })
  await userEvent.clear(scene)
  await userEvent.type(scene, 'shore{Enter}')
  await userEvent.click(screen.getByRole('button', { name: 'Make the game' }))
  await waitFor(() => expect(opened).toEqual(['pond']))
  expect(disk('games/pond/shore.scene.json')).not.toBe(null)
  // Back to the list, which holds the game made.
  expect(await screen.findByRole('treeitem', { name: 'pond' })).toBeInTheDocument()
})
