// A game's server on node, started as `yarn serve` starts it, starts again on its new code when one of
// its files changes.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { restarts, Servers } from './servers.ts'

const alive = (says: string) => `console.log(${JSON.stringify(says)})\nsetInterval(() => {}, 1000)\n`

test('a change to a file of the game starts its server again on its new code', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'servers-'))
  const game = path.join(root, 'games', 'demo')
  mkdirSync(game, { recursive: true })
  writeFileSync(path.join(game, 'demo.scene.json'), JSON.stringify({ prefabs: { scenemanager: { port: 9101 } } }))
  writeFileSync(path.join(game, 'demo.server.ts'), alive('first'))
  const servers = new Servers(root)
  const lines: string[] = []
  const said = (line: string) => new Promise<void>(ok => servers.on(e => { if (e.type === 'log' && e.line === line) ok() }))
  servers.on(e => { if (e.type === 'log') lines.push(e.line) })
  try {
    const first = said('first')
    expect(servers.start('demo')).toEqual([{ game: 'demo', port: 9101 }])
    await first

    writeFileSync(path.join(game, 'demo.server.ts'), alive('second'))
    const second = said('second')
    restarts(servers).changed('games/demo/demo.server.ts')
    await second
    expect(lines).toEqual(['starting on port 9101', 'first', 'stopped', 'starting on port 9101', 'second'])
  } finally {
    servers.stopAll()
    rmSync(root, { recursive: true, force: true })
  }
})
