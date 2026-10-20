// The code extension's routes over HTTP, on a repo of their own: the code files of a game's, a
// plugin's, an addon's and an extension's folder listed, JSON and the engine's code left out; a file
// read, or answered not there; a file written, made and taken away, each answering its path and
// nothing more; every save the route must refuse refused with nothing written; a save reloads no page
// itself, and the module a page imports after it is the one saved. That a save is one change, which
// one undo takes back byte for byte, is shown where a change runs it (`code.extension.test.tsx`).
import { afterAll, beforeAll, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { start } from '#editor/server/server.ts'

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'code-route-')))
const put = (p: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, p)), { recursive: true })
  writeFileSync(path.join(root, p), text)
}
mkdirSync(path.join(root, 'extensions/code'), { recursive: true })
symlinkSync(path.join(process.cwd(), 'extensions/code/code.route.ts'), path.join(root, 'extensions/code/code.route.ts'))
put('games/g/g.scene.json', '{ "actors": [] }\n')
put('games/g/hero.sim.ts', "export const hero = { tick() {} }\n")
put('games/g/hero.client.ts', 'export const hero = {}\n')
put('games/g/plugins/moves/moves.sim.ts', 'export const step = 1\n')
put('games/g/assets/cut.py', 'print(1)\n')
put('plugins/p/p.plugin.ts', 'export function p() {}\n')
put('plugins/p/p.extension.tsx', 'export function p() {}\n')
put('engine/engine.ts', 'export const frozen = true\n')

let server: Awaited<ReturnType<typeof start>>
beforeAll(async () => { server = await start({ root, port: 0 }) })
afterAll(async () => {
  await server.close()
  rmSync(root, { recursive: true, force: true })
})

const post = (route: string, body: unknown) => fetch(`${server.url}/api/x/code/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const refused = async (res: Response) => {
  expect(res.status).toBe(400)
  return (await res.json()).error as string
}
const at = (p: string) => path.join(root, p)
const text = (p: string) => readFileSync(at(p), 'utf8')

test('list answers the code files under each folder named, sorted: no JSON, and none of a folder that is not there; a folder that is no game, plugin, addon or extension is refused', async () => {
  const listed = await (await fetch(`${server.url}/api/x/code/list?dirs=${encodeURIComponent('games/g,plugins/p,addons/nobody')}`)).json()
  expect(listed).toEqual({ files: ['games/g/assets/cut.py', 'games/g/hero.client.ts', 'games/g/hero.sim.ts', 'games/g/plugins/moves/moves.sim.ts', 'plugins/p/p.extension.tsx', 'plugins/p/p.plugin.ts'] })
  for (const dir of ['engine', 'games', 'games/g/plugins', '../x']) {
    const res = await fetch(`${server.url}/api/x/code/list?dirs=${encodeURIComponent(dir)}`)
    expect(await refused(res)).toContain(`and not ${dir}`)
  }
})

test('read answers a code file\'s text, and null for one that is not there, which is no error; a path that is no code file is refused', async () => {
  const read = (p: string) => fetch(`${server.url}/api/x/code/read?path=${encodeURIComponent(p)}`)
  const hero = await read('games/g/hero.sim.ts')
  expect([hero.status, await hero.json()]).toEqual([200, { text: text('games/g/hero.sim.ts') }])
  const ghost = await read('games/g/ghost.sim.ts')
  expect([ghost.status, await ghost.json()]).toEqual([200, { text: null }])
  for (const p of ['engine/engine.ts', 'games/g/g.scene.json', 'games/g/../../x.ts'])
    expect(await refused(await read(p))).toContain('read reads a code file')
})

test('a save writes the file, answering its path and nothing more; a save of what was there over it writes it back, byte for byte', async () => {
  const p = 'games/g/hero.sim.ts', was = text(p), now = "export const hero = { tick() { return 2 } }\n"
  const saved = await (await post('save', { path: p, text: now, was })).json()
  expect(saved).toEqual({ files: [p] })
  expect(text(p)).toBe(now)
  expect(await (await post('save', { path: p, text: was, was: now })).json()).toEqual({ files: [p] })
  expect(text(p)).toBe(was)
})

test('a save handed no `was` makes the file; one handed no text takes it away; each answers its path', async () => {
  const p = 'games/g/goblin.sim.ts', t = 'export const goblin = {}\n'
  expect(await (await post('save', { path: p, text: t, was: null })).json()).toEqual({ files: [p] })
  expect(text(p)).toBe(t)
  expect(await (await post('save', { path: p, text: null, was: t })).json()).toEqual({ files: [p] })
  expect(existsSync(at(p))).toBe(false)
})

test('a save is refused, writing nothing, out of a game, plugin, addon or extension, for the engine, for JSON, past its own folder, and for a file that does not hold what it was handed', async () => {
  const hero = text('games/g/hero.sim.ts')
  for (const p of ['engine/engine.ts', 'editor/x.ts', 'games/g/g.scene.json', 'games/g/../g/hero.sim.ts', 'games/g', 'notes.ts', 'games//hero.sim.ts'])
    expect(await refused(await post('save', { path: p, text: 'x', was: null }))).toContain('save writes a code file')
  expect(await refused(await post('save', { path: 'games/g/hero.sim.ts', text: 'x', was: 'something else' }))).toBe('games/g/hero.sim.ts has changed since it was read: read it again')
  expect(await refused(await post('save', { path: 'games/g/hero.sim.ts', text: 'x', was: null }))).toBe('games/g/hero.sim.ts is there already')
  expect(await refused(await post('save', { path: 'games/g/ghost.sim.ts', text: 'x', was: 'y' }))).toBe('games/g/ghost.sim.ts is not there')
  expect(await refused(await post('save', { path: 'games/g/ghost.sim.ts', text: null, was: null }))).toContain('is handed neither its text nor what it holds')
  expect(await refused(await post('save', { path: 'games/g/ghost.sim.ts', text: 3, was: null }))).toBe('save writes games/g/ghost.sim.ts as text')
  expect(text('games/g/hero.sim.ts')).toBe(hero)
  expect(text('engine/engine.ts')).toBe('export const frozen = true\n')
  expect(existsSync(at('games/g/ghost.sim.ts'))).toBe(false)
})

test('a save reloads no page itself, and the module a page imports after it is the one saved', async () => {
  // The page has imported the module.
  expect((await fetch(`${server.url}/games/g/hero.client.ts`)).status).toBe(200)
  const p = 'games/g/hero.client.ts', was = text(p)
  expect(await (await post('save', { path: p, text: 'export const hero = { look: 1 }\n', was })).json()).toEqual({ files: [p] })
  expect(await (await fetch(`${server.url}/games/g/hero.client.ts`)).text()).toContain('look: 1')
})
