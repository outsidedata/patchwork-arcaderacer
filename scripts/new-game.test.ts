// new-game on a root of its own, holding a plugin and an addon and no games: a game made there boots
// its scene through the scenemanager, and a seat joining it gets a body on its start; and a name
// new-game must refuse is refused with nothing written.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type Sim } from '#engine/engine.ts'
import { connection, load, manager } from '#addons/scenemanager/scenemanager.addon.ts'
import { newGame } from './new-game.ts'

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'new-game-')))
for (const f of ['plugins/glow/glow.plugin.ts', 'addons/vault/vault.addon.ts']) {
  mkdirSync(path.dirname(path.join(root, f)), { recursive: true })
  writeFileSync(path.join(root, f), 'export {}\n')
}
afterAll(() => rmSync(root, { recursive: true, force: true }))

test('a game made where there are none boots its scene, and a seat joining it gets a body on its start', async () => {
  const made = await newGame('fresh', root)
  expect(made.port).toBe(9001)
  expect(readdirSync(path.join(root, 'games'))).toEqual(['fresh'])
  const at = (f: string) => path.join(root, 'games/fresh', f)
  const { sim } = await import(pathToFileURL(at('fresh.sim.ts')).href) as { sim: Sim }
  const { default: file } = await import(pathToFileURL(at('fresh.scene.json')).href, { with: { type: 'json' } }) as { default: Scene }
  // The loader reads a catalogue's url from the working directory, as the server's process does.
  vi.spyOn(process, 'cwd').mockReturnValue(root)
  const truth = boot(file, sim)
  const room = (await load(truth, pathToFileURL(at('fresh.scene.json')).href)).get('main')!
  connection(manager(truth), () => {})
  for (let i = 0; i < 3; i++) truth.step(file.prefabs.engine.dt)
  vi.restoreAllMocks()
  const start = room.rows.find(r => r.kind === 'start')!
  expect(start.data).toEqual({ slot: 0, pos: [480, 270] })
  expect(room.rows.find(r => r.kind === 'body')!.data.pos).toEqual(start.data.pos)
})

test('a name that is no lower-case name, a kind\'s of the game, a plugin\'s, an addon\'s or a game\'s there is refused, with nothing written', async () => {
  await expect(newGame('Other', root)).rejects.toThrow('a lower-case letter and then lower-case letters, digits and underscores')
  await expect(newGame('body', root)).rejects.toThrow('a game cannot be named body: body.sim.ts is the rule of its body kind')
  await expect(newGame('glow', root)).rejects.toThrow('a game cannot be named glow: plugins/glow is a plugin of that name')
  await expect(newGame('vault', root)).rejects.toThrow('a game cannot be named vault: addons/vault is an addon of that name')
  await expect(newGame('fresh', root)).rejects.toThrow('there is a game fresh already')
  expect(readdirSync(path.join(root, 'games'))).toEqual(['fresh'])
})
