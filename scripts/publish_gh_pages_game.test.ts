// publish_gh_pages_game's folder on repos of its own: an engine repo, and a root holding two games. The
// first run makes the folder from the engine, the game and the workflow, and commits it; a run with
// nothing changed commits nothing; a run after the engine dropped a file and the game changed one
// refreshes both, keeping the folder's history.
import { afterAll, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { commit, stage } from './publish_gh_pages_game.ts'

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'publish-')))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const engine = path.join(root, 'engine')
const core = path.join(root, 'core')
const dir = path.join(root, 'out/patchwork-foo')
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const write = (base: string, file: string, text: string) => {
  mkdirSync(path.dirname(path.join(base, file)), { recursive: true })
  writeFileSync(path.join(base, file), text)
}
const read = (file: string) => readFileSync(path.join(dir, file), 'utf8')

mkdirSync(engine)
git(engine, 'init', '-q', '-b', 'master')
git(engine, 'config', 'user.email', 'test@example.com')
git(engine, 'config', 'user.name', 'test')
write(engine, 'engine/engine.ts', 'export const v = 1\n')
write(engine, 'engine/old.ts', 'export {}\n')
write(engine, 'extensions/games/games.route.ts', 'export {}\n')
git(engine, 'add', '-A')
git(engine, 'commit', '-q', '-m', 'engine')

write(core, 'games/foo/index.html', '<!doctype html>\n')
write(core, 'games/foo/foo.sim.ts', 'export const sim = {}\n')
write(core, 'games/foo/__pycache__/x.pyc', '')
write(core, 'games/bar/index.html', '<!doctype html>\n')

test('the first run is the engine, the game and the workflow, committed', () => {
  const sha = stage(core, 'foo', dir, engine)
  expect(sha).toBe(git(engine, 'rev-parse', '--short=7', 'HEAD'))
  expect(read('engine/engine.ts')).toBe('export const v = 1\n')
  expect(read('extensions/games/games.route.ts')).toBe('export {}\n')
  expect(read('games/foo/foo.sim.ts')).toBe('export const sim = {}\n')
  expect(existsSync(path.join(dir, 'games/foo/__pycache__'))).toBe(false)
  expect(existsSync(path.join(dir, 'games/bar'))).toBe(false)
  expect(read('.github/workflows/deploy.yml')).toContain('yarn produce_static_site foo --base /${{ github.event.repository.name }}/')
  expect(commit(dir, 'foo', sha)).toBe(true)
  expect(git(dir, 'log', '--format=%s')).toBe(`foo on Patchwork ${sha}`)
})

test('a run with nothing changed commits nothing; a run after the engine and the game changed refreshes both', () => {
  expect(commit(dir, 'foo', stage(core, 'foo', dir, engine))).toBe(false)
  git(engine, 'rm', '-q', 'engine/old.ts')
  write(engine, 'engine/engine.ts', 'export const v = 2\n')
  git(engine, 'commit', '-q', '-am', 'engine 2')
  write(core, 'games/foo/foo.sim.ts', 'export const sim = { more: true }\n')
  const sha = stage(core, 'foo', dir, engine)
  expect(commit(dir, 'foo', sha)).toBe(true)
  expect(existsSync(path.join(dir, 'engine/old.ts'))).toBe(false)
  expect(read('engine/engine.ts')).toBe('export const v = 2\n')
  expect(read('games/foo/foo.sim.ts')).toBe('export const sim = { more: true }\n')
  expect(git(dir, 'rev-list', '--count', 'master')).toBe('2')
})
