// A game's server on node, started as `yarn serve` starts it, starts again on its new code when one of
// its files changes.
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { inRepo, restarts, Servers } from './servers.ts'

test('a build written and cleared through a game\'s link out of the repo is not the repo\'s, and the game\'s own files are', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'servers-repo-'))
  const out = mkdtempSync(path.join(tmpdir(), 'servers-builds-'))
  try {
    mkdirSync(path.join(root, 'games', 'g', 'assets'), { recursive: true })
    symlinkSync(out, path.join(root, 'games', 'g', 'assets', 'builds'))
    const built = path.join(root, 'games', 'g', 'assets', 'builds', 'barrel', 'barrel.glb')
    mkdirSync(path.join(out, 'barrel'))
    writeFileSync(path.join(out, 'barrel', 'barrel.glb'), '')
    expect(inRepo(root, built)).toBe(false)
    // the build clears its folder before it writes again: the removed file's folder is gone too
    rmSync(path.join(out, 'barrel'), { recursive: true })
    expect(inRepo(root, built)).toBe(false)
    writeFileSync(path.join(root, 'games', 'g', 'g.sim.ts'), '')
    expect(inRepo(root, path.join(root, 'games', 'g', 'g.sim.ts'))).toBe(true)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
  }
})

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
