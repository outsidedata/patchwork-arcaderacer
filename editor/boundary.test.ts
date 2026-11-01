// Nothing a game runs imports the editor: no file of the engine, an addon, a plugin or a game but an
// extension's own, or a test's own (a test, and the harness a test shares with its view test), names
// `editor/`, `extensions/`, an extension, a route or a harness. So a game runs the same with the
// editor and without it. And no code a page runs lists files with a glob.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from 'vitest'

const root = process.cwd()
const editorsOwn = /\.(extension|components)\.tsx$|\.route\.ts$|\.test\.tsx?$|\.harness\.tsx?$/

// Every file under a folder, by its path from the root. Walked a folder at a time: Node's
// `readdirSync(dir, { recursive: true })` takes 95 seconds over `games/`, whose art is 30,000
// entries, and this 30 milliseconds.
const walk = (dir: string): string[] => readdirSync(path.join(root, dir), { withFileTypes: true })
  .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))

const files = ['engine', 'addons', 'plugins', 'games'].filter(d => existsSync(path.join(root, d))).flatMap(walk)
  .filter(f => /\.(ts|tsx|html)$/.test(f) && !editorsOwn.test(f))

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('no file a game runs imports the editor, an extension or a test\'s harness', () => {
  expect(files.length).toBeGreaterThan(100)
  const offenders = files.filter(f => {
    const text = readFileSync(path.join(root, f), 'utf8')
    return [...text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].some(([, spec]) =>
      /(^|\/)(editor|extensions)\//.test(spec) || /\.(extension|components)\.tsx$|\.route\.ts$|\.harness\.tsx?$/.test(spec))
  })
  expect(offenders).toEqual([])
})

// No code a page runs, the editor's or a game's, lists files with `import.meta.glob`: Vite fills a
// glob in as it first serves the module, and with no HMR nothing fills it in again, so a file made
// since, a scene, a kind, an extension, a game, would be missing from the list until the server
// started again. The editor's server lists what is on the disk each time it is asked
// (`editor/server/listing.ts`). Comments are read past: a header may name the glob.
// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('no code a page runs lists files with import.meta.glob', () => {
  const pageCode = ['engine', 'addons', 'plugins', 'games', 'editor', 'extensions'].filter(d => existsSync(path.join(root, d))).flatMap(walk)
    .filter(f => /\.(ts|tsx|js|jsx|mjs|html)$/.test(f) && !/\.test\.tsx?$|\.harness\.tsx?$/.test(f))
  expect(pageCode.length).toBeGreaterThan(100)
  const code = (f: string) => readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  expect(pageCode.filter(f => code(f).includes('import.meta.glob'))).toEqual([])
})
