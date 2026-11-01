// The home page lists every game with a link to each of its pages, and beside `dev` each scene its
// manager names, and says which game's server runs; a repo with no games says how to make one.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { page } from './home.ts'

const repo = (games: Record<string, Record<string, string>>) => {
  const root = mkdtempSync(path.join(tmpdir(), 'home-'))
  for (const [name, files] of Object.entries(games)) {
    mkdirSync(path.join(root, 'games', name), { recursive: true })
    for (const [f, text] of Object.entries(files)) writeFileSync(path.join(root, 'games', name, f), text)
  }
  return root
}

const manager = (scenes: string[]) =>
  JSON.stringify({ prefabs: { scenemanager: { scenes: Object.fromEntries(scenes.map(s => [s, { file: `${s}.scene.json` }])) } } })

test('every game is listed with its pages, index, client and dev first, its scenes beside dev, and the one whose server runs says so', () => {
  const root = repo({
    tetris: { 'client.html': '', 'index.html': '', 'tetris.sim.ts': '', 'tetris.scene.json': manager(['main']) },
    mech: { 'tune.html': '', 'client.html': '', 'dev.html': '', 'index.html': '', 'refit.html': '', 'mech.scene.json': manager(['title', 'hangar', 'battle']) },
    blob: { 'dev.html': '', 'blob.scene.json': '{ not json' },
  })
  try {
    const html = page(root, [{ game: 'tetris', port: 9007 }])
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1])
    expect(links).toEqual([
      '/games/blob/dev.html',
      '/games/mech/index.html', '/games/mech/client.html', '/games/mech/dev.html',
      '/games/mech/dev.html?scene=title', '/games/mech/dev.html?scene=hangar', '/games/mech/dev.html?scene=battle',
      '/games/mech/refit.html', '/games/mech/tune.html',
      '/games/tetris/index.html', '/games/tetris/client.html',
    ])
    expect(html).toContain('>dev</a> <span class="scenes">(<a href="/games/mech/dev.html?scene=title">title</a>, <a href="/games/mech/dev.html?scene=hangar">hangar</a>, <a href="/games/mech/dev.html?scene=battle">battle</a>)</span>')
    expect(html.match(/server on \d+/g)).toEqual(['server on 9007'])
    expect(html.indexOf('server on 9007')).toBeGreaterThan(html.indexOf('/games/tetris/'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a repo with no games says how to make one', () => {
  const root = repo({})
  try {
    expect(page(root, [])).toContain('No games yet: <code>yarn new-game &lt;name&gt;</code>')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
