// The test editor's stage: a canvas in a stage, and a canvas on no page, such as the one PixiJS
// measures a game's text on, has a context that answers every call; a canvas on the page, such as a
// panel's, has jsdom's, and jsdom's `getContext` is back once the test that made the stages is over;
// three's renderer draws on it with nothing to warn about. A sandbox, holding a game the test writes
// into it, is one per test, and its changes write only its own files, never the repo's through a
// link.
import { existsSync, lstatSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { expect, test, vi } from 'vitest'
import { memoryFiles, repo, sandbox, stage } from './editor.ts'

const jsdom = HTMLCanvasElement.prototype.getContext

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the canvases of two stages share one lent context, the one wrapper, as a canvas on no page does, and a canvas on the page is jsdom\'s', () => {
  const a = stage()
  const lent = HTMLCanvasElement.prototype.getContext
  const b = stage()
  expect(HTMLCanvasElement.prototype.getContext).toBe(lent)
  const inA = a.appendChild(document.createElement('canvas')), inB = b.appendChild(document.createElement('canvas'))
  expect(inA.getContext('2d')).not.toBeNull()
  expect(inA.getContext('2d')).toBe(inB.getContext('2d'))
  expect(document.createElement('canvas').getContext('2d')).toBe(inA.getContext('2d'))
  const onPage = document.body.appendChild(document.createElement('canvas'))
  expect(onPage.getContext('2d')).toBeNull()
  onPage.remove()
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('once that test is over, getContext is jsdom\'s own', () => {
  expect(HTMLCanvasElement.prototype.getContext).toBe(jsdom)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('three draws on a stage\'s canvas with nothing to warn about', () => {
  const said = vi.spyOn(console, 'warn').mockImplementation(() => {}), erred = vi.spyOn(console, 'error').mockImplementation(() => {}), logged = vi.spyOn(console, 'log').mockImplementation(() => {})
  const canvas = stage().appendChild(document.createElement('canvas'))
  const renderer = new THREE.WebGLRenderer({ canvas })
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
  renderer.render(scene, new THREE.PerspectiveCamera())
  expect([...said.mock.calls, ...erred.mock.calls, ...logged.mock.calls]).toEqual([])
  vi.restoreAllMocks()
})

// A game of the test's own, written into the sandbox at `at`: a folder `games/mine/` holding a page.
const mine = (at: string) => {
  mkdirSync(path.join(at, 'games', 'mine'))
  writeFileSync(path.join(at, 'games', 'mine', 'index.html'), '<!doctype html>\n')
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('in a sandbox, a change writes and takes away in a game of its own and beside a plugin or an addon, and is refused in a folder that is a link to the repo\'s, whose files stay as they are', async () => {
  const at = sandbox([])
  mine(at)
  // A game folder that is a link to a folder of the repo's, as each game of the repo the sandbox does
  // not name is.
  symlinkSync(path.join(repo, 'editor', 'test'), path.join(at, 'games', 'linked'))
  const { files } = memoryFiles()
  await files.change('own', [{ text: 'games/mine/made.txt', value: 'made' }, { text: 'games/mine/index.html', value: null }])
  expect([readFileSync(path.join(at, 'games/mine/made.txt'), 'utf8'), existsSync(path.join(at, 'games/mine/index.html'))]).toEqual(['made', false])
  expect(existsSync(path.join(repo, 'games/mine'))).toBe(false)
  await files.change('beside', [{ text: 'addons/simulator/runs/made.jsonl', value: 'made' }, { text: 'plugins/tilemap/tilemap.plugin.ts', value: null }])
  expect([readFileSync(path.join(at, 'addons/simulator/runs/made.jsonl'), 'utf8'), existsSync(path.join(at, 'plugins/tilemap/tilemap.plugin.ts'))]).toEqual(['made', false])
  expect([existsSync(path.join(repo, 'addons/simulator/runs/made.jsonl')), existsSync(path.join(repo, 'plugins/tilemap/tilemap.plugin.ts'))]).toEqual([false, true])
  const kept = readFileSync(path.join(repo, 'editor/test/png.ts'))
  for (const [id, rel, value] of [['game', 'games/linked/stray.txt', 'x'], ['gone', 'games/linked/png.ts', null], ['out', 'node_modules/stray.txt', 'x']] as const)
    await expect(files.change(id, [{ text: rel, value }])).rejects.toThrow(`${rel} is not a file of the repo the editor may touch`)
  expect([existsSync(path.join(repo, 'editor/test/stray.txt')), existsSync(path.join(repo, 'node_modules/stray.txt')), readFileSync(path.join(repo, 'editor/test/png.ts'))]).toEqual([false, false, kept])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a sandbox called again in the same test is the one it made; its games folder and the homes of the code are folders of its own, holding links to the repo\'s files', () => {
  const at = sandbox([])
  mine(at)
  expect(sandbox([])).toBe(at)
  for (const d of ['games', 'games/mine', 'plugins', 'plugins/tilemap']) expect(lstatSync(path.join(at, d)).isSymbolicLink()).toBe(false)
  expect(lstatSync(path.join(at, 'plugins', 'tilemap', 'tilemap.plugin.ts')).isSymbolicLink()).toBe(true)
})
