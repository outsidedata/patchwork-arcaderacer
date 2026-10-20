// The browser half of the scenemanager. A page makes one link, which is one seat, and holds one
// client on it, for the scene the seat is on: `view` mounts this plugin on the link under that
// scene's name and hands it that scene's packets. When the seat moves, that client is closed and one
// is made for the scene it moved to; each game's own test holds a page to that. This test holds every
// other plugin to mounting no pipe.
import { expect, test } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// A client takes its packets from the one plugin with a mounted `pipe`, and this is that plugin in
// every game: its pipe is its scene's door onto the page's link, whatever wire the link crosses. No
// other top-level plugin has a `pipe`, so no page can be wired past the link (a game's own plugins
// are held to the same in `games/games.test.ts`). Comments are read past.
test('no plugin but this one mounts a pipe', () => {
  const root = new URL('../../', import.meta.url).pathname
  const files = (readdirSync(join(root, 'plugins'), { recursive: true }) as string[]).map(f => join('plugins', f))
    .filter(f => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  expect(files.length).toBeGreaterThan(20)
  const code = (f: string) => readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  // Mounting a pipe is setting a client's `pipe`, or holding one: a property typed `Pipe`. A car's
  // exhaust pipe or a city's water pipes are other pipes.
  const mounting = files.filter(f => /\.pipe\s*=[^=]|\bpipe\s*:[^,;}\n]*\bPipe\b/.test(code(f)))
  expect(mounting).toEqual(['plugins/scenemanager/scenemanager.plugin.ts'])
})
