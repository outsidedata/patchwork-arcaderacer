// The games extension's route over HTTP, on a repo of its own holding two games and links to the
// engine, the addons and the plugins: a new game written as the scenemanager's header says a game is,
// on the port after the highest the games use, which boots, loads its scene and steps as its page
// does; and every game the route must refuse refused with nothing written.
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { start } from '#editor/server/server.ts'
import { boot, type Scene, type Sim } from '#engine/engine.ts'
import { load, manager, scenes } from '#addons/scenemanager/scenemanager.addon.ts'

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'games-route-')))
const put = (p: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, p)), { recursive: true })
  writeFileSync(path.join(root, p), text)
}
mkdirSync(path.join(root, 'extensions/games'), { recursive: true })
symlinkSync(path.join(process.cwd(), 'extensions/games/games.route.ts'), path.join(root, 'extensions/games/games.route.ts'))
for (const d of ['engine', 'addons', 'plugins', 'node_modules']) symlinkSync(path.join(process.cwd(), d), path.join(root, d))
put('games/a/a.scene.json', JSON.stringify({ prefabs: { scenemanager: { scenes: {}, port: 9019 } } }))
put('games/b/b.scene.json', JSON.stringify({ prefabs: { scenemanager: { scenes: {}, port: 9030 } } }))
put('games/taken/notes.txt', 'here')

let server: Awaited<ReturnType<typeof start>>
beforeAll(async () => { server = await start({ root, port: 0 }) })
afterAll(async () => {
  await server.close()
  rmSync(root, { recursive: true, force: true })
})

const post = (body: unknown) => fetch(`${server.url}/api/x/games/make`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const refused = async (res: Response) => {
  expect(res.status).toBe(400)
  return (await res.json()).error as string
}

test('a new game is written on the port after the highest the games use, and boots, loads its scene and steps', async () => {
  const made = await (await post({ name: 'fresh', scene: 'main', width: 320, height: 240 })).json()
  expect(made.port).toBe(9031)
  expect(made.files.sort()).toEqual(['assets/fresh.json', 'body.client.ts', 'body.sim.ts', 'client.html', 'fresh.scene.json', 'fresh.server.ts', 'fresh.sim.test.ts', 'fresh.sim.ts', 'index.html', 'main.scene.json', 'main.sim.ts', 'player.client.ts', 'player.sim.ts', 'start.sim.ts'].map(f => `games/fresh/${f}`))
  const manager_ = JSON.parse(readFileSync(path.join(root, 'games/fresh/fresh.scene.json'), 'utf8'))
  expect(manager_.prefabs.scenemanager).toMatchObject({ scenes: { main: { file: 'main.scene.json', suspend: true } }, entry: 'main', port: 9031 })
  expect(JSON.parse(readFileSync(path.join(root, 'games/fresh/main.scene.json'), 'utf8')).prefabs.engine).toMatchObject({ width: 320, height: 240 })

  const { sim } = await import(pathToFileURL(path.join(root, 'games/fresh/fresh.sim.ts')).href) as { sim: Sim }
  // The loader reads a catalogue's url from the working directory, as the server's process does.
  vi.spyOn(process, 'cwd').mockReturnValue(root)
  const truth = boot(manager_ as Scene, sim)
  await load(truth, pathToFileURL(path.join(root, 'games/fresh/fresh.scene.json')).href)
  for (let i = 0; i < 10; i++) truth.step(manager_.prefabs.engine.dt)
  vi.restoreAllMocks()
  expect(scenes(manager(truth)).get('main')!.rows.map(r => r.kind)).toEqual(['scenemanager', 'loader', 'start'])
})

test('a game is refused, with nothing written, for a name that is no lower-case name, a kind\'s of the game, one taken, a scene named as the game, and a size out of range', async () => {
  const ok = { name: 'other', scene: 'main', width: 320, height: 240 }
  expect(await refused(await post({ ...ok, name: 'Other' }))).toContain('a lower-case letter and then lower-case letters, digits and underscores')
  expect(await refused(await post({ ...ok, name: 'start' }))).toBe('a game cannot be named start: start.sim.ts is the rule of its start kind')
  expect(await refused(await post({ ...ok, name: 'taken' }))).toBe('there is a game taken already: games/taken has files')
  expect(await refused(await post({ ...ok, scene: 'other' }))).toBe('the scene cannot be named other: other.scene.json is the game\'s manager')
  expect(await refused(await post({ ...ok, scene: 'Main' }))).toContain('a scene\'s name is lower-case letters')
  expect(await refused(await post({ ...ok, width: 0 }))).toBe('a game\'s width is a whole number of pixels from 1 to 8192, and not 0')
  expect(await refused(await post({ ...ok, height: 1.5 }))).toBe('a game\'s height is a whole number of pixels from 1 to 8192, and not 1.5')
  expect(existsSync(path.join(root, 'games/other'))).toBe(false)
})
