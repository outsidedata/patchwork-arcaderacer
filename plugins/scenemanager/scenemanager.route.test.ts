// The scenemanager's routes on a repo of their own. Over HTTP: a scene's new files made in a game's
// folder, its map's catalogue entry and its table entry set, and all of it taken out again; and every
// make and unmake whose body the route must refuse refused with nothing written or taken. Inside a
// change, as the editor runs them (`editor/server/changes.ts`): each one change, taken back byte for
// byte and made again; and a make or an unmake refused part-way, after it has written, leaves every
// file as it was and nothing kept.
import { afterAll, beforeAll, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Changes, type Answer, type Changed } from '#editor/server/changes.ts'
import { Files } from '#editor/server/files.ts'
import type { Route } from '#editor/server/routes.ts'
import { start } from '#editor/server/server.ts'
import { scenemanager } from './scenemanager.route.ts'

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'scenemanager-route-')))
mkdirSync(path.join(root, 'plugins/scenemanager'), { recursive: true })
symlinkSync(path.join(process.cwd(), 'plugins/scenemanager/scenemanager.route.ts'), path.join(root, 'plugins/scenemanager/scenemanager.route.ts'))
mkdirSync(path.join(root, 'games/rooms/assets'), { recursive: true })
writeFileSync(path.join(root, 'games/rooms/hall.scene.json'), '{ "was": true }\n')
// The manager's file: its table, and its catalogue, which the hall's map is in.
const MANAGER = 'games/rooms/rooms.scene.json'
const MANAGED = [
  '{',
  '  "world": {',
  '    "loader": {',
  '      "assets": {',
  '        "hall": { "type": "json", "url": "/games/rooms/assets/hall.tmj" }',
  '      }',
  '    }',
  '  },',
  '  "prefabs": {',
  '    "scenemanager": {',
  '      "scenes": {',
  '        "hall": {',
  '          "file": "hall.scene.json"',
  '        }',
  '      },',
  '      "entry": "hall"',
  '    }',
  '  }',
  '}',
  '',
].join('\n')
writeFileSync(path.join(root, MANAGER), MANAGED)

let server: Awaited<ReturnType<typeof start>>
beforeAll(async () => { server = await start({ root, port: 0 }) })
afterAll(async () => {
  await server.close()
  rmSync(root, { recursive: true, force: true })
})

const call = (route: string, body: unknown) => fetch(`${server.url}/api/x/scenemanager/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const refused = async (res: Response) => {
  expect(res.status).toBe(400)
  return (await res.json()).error as string
}
const at = (p: string) => path.join(root, p)
// A file's text, or null when there is none.
const text = (p: string) => (existsSync(at(p)) ? readFileSync(at(p), 'utf8') : null)

const FILES = {
  'games/rooms/cellar.scene.json': '{\n  "actors": []\n}\n',
  'games/rooms/cellar.sim.ts': "export { sim } from './hall.sim.ts'\n",
  'games/rooms/assets/cellar.tmj': '{"width": 2}',
}
const ENTRY = { file: 'cellar.scene.json', suspend: true }
const MAP = { type: 'json', url: '/games/rooms/assets/cellar.tmj' }
const MAKE = { files: FILES, table: { file: MANAGER, name: 'cellar', entry: ENTRY }, assets: [{ file: MANAGER, name: 'cellar', entry: MAP }] }
const UNMAKE = { files: Object.keys(FILES), table: { file: MANAGER, name: 'cellar' }, assets: [{ file: MANAGER, name: 'cellar' }] }
// Every file a make or an unmake touches, with its text.
const touched = () => Object.fromEntries([MANAGER, ...Object.keys(FILES)].map(p => [p, text(p)]))
const before = () => ({ ...Object.fromEntries(Object.keys(FILES).map(p => [p, null])), [MANAGER]: MANAGED })

test('make writes each file, its map\'s catalogue entry and its table entry last, answering the paths; unmake takes them all out again', async () => {
  expect(await (await call('make', MAKE)).json()).toEqual({ files: Object.keys(FILES) })
  for (const [p, t] of Object.entries(FILES)) expect(text(p)).toBe(t)
  const manager = JSON.parse(text(MANAGER)!)
  expect(manager.prefabs.scenemanager.scenes).toEqual({ hall: { file: 'hall.scene.json' }, cellar: ENTRY })
  expect(manager.world.loader.assets.cellar).toEqual(MAP)
  // Each set as one value, after its object's last key: the rest of the file as it was.
  expect(Object.keys(manager.prefabs.scenemanager.scenes)).toEqual(['hall', 'cellar'])

  expect(await (await call('unmake', UNMAKE)).json()).toEqual({ files: Object.keys(FILES) })
  expect(touched()).toEqual(before())
  // The rest of the game's folder is as it was.
  expect(text('games/rooms/hall.scene.json')).toBe('{ "was": true }\n')
})

test('make refuses, writing nothing, a file there already, a path outside a game\'s folder, text that is not text, a name no scene may have, and a table entry or catalogue entry not shaped so', async () => {
  const make = (body: Record<string, unknown>) => call('make', { ...MAKE, ...body })
  const cellar = { 'games/rooms/cellar.scene.json': '{}' }
  expect(await refused(await make({ files: { ...cellar, 'games/rooms/hall.scene.json': '{}' } }))).toBe('games/rooms/hall.scene.json is there already')
  expect(await refused(await make({ files: { ...cellar, 'plugins/x.ts': '' } }))).toBe("make writes in a game's folder, and not plugins/x.ts")
  expect(await refused(await make({ files: { ...cellar, 'games/rooms/../../x.ts': '' } }))).toBe("make writes in a game's folder, and not games/rooms/../../x.ts")
  expect(await refused(await make({ files: { ...cellar, 'games/rooms': '' } }))).toBe("make writes in a game's folder, and not games/rooms")
  expect(await refused(await make({ files: { ...cellar, 'games/rooms/cellar.sim.ts': 3 } }))).toBe('make writes games/rooms/cellar.sim.ts as text')
  expect(await refused(await make({ files: {} }))).toBe('make takes one file or more')
  expect(await refused(await make({ files: ['games/rooms/a.json'] }))).toBe('make takes files, each path with its text')
  expect(await refused(await make({ table: { ...MAKE.table, name: 'Big Cellar' } }))).toBe('a scene\'s name is lower-case letters, digits and dashes, and not "Big Cellar"')
  const table = 'make takes the manager\'s table entry as { file, name, entry }: a scene file in a game\'s folder, a name and an object'
  expect(await refused(await make({ table: undefined }))).toBe(table)
  expect(await refused(await make({ table: { ...MAKE.table, file: 'package.json' } }))).toBe(table)
  expect(await refused(await make({ table: { ...MAKE.table, entry: 'cellar.scene.json' } }))).toBe(table)
  const asset = 'make takes each catalogue entry as { file, name, entry }: a scene file in a game\'s folder, a name and an object'
  expect(await refused(await make({ assets: [{ file: MANAGER, entry: MAP }] }))).toBe(asset)
  expect(await refused(await make({ assets: { cellar: MAP } }))).toBe('make takes assets as a list of catalogue entries')
  expect(touched()).toEqual(before())
  expect(text('games/rooms/hall.scene.json')).toBe('{ "was": true }\n')
})

test('unmake refuses, taking nothing away, a path outside a game\'s folder, a body that names no files, and a table entry or catalogue entry not shaped so', async () => {
  const unmake = (body: Record<string, unknown>) => call('unmake', { ...UNMAKE, files: ['games/rooms/hall.scene.json'], table: { file: MANAGER, name: 'hall' }, assets: [], ...body })
  expect(await refused(await unmake({ files: ['games/rooms/hall.scene.json', 'package.json'] }))).toBe("unmake takes away in a game's folder, and not package.json")
  expect(await refused(await unmake({ files: [] }))).toBe('unmake takes a list of one path or more')
  expect(await refused(await unmake({ files: undefined }))).toBe('unmake takes a list of one path or more')
  expect(await refused(await unmake({ table: { name: 'hall' } }))).toBe('unmake takes the manager\'s table entry as { file, name }: a scene file in a game\'s folder, a name')
  expect(await refused(await unmake({ assets: [{ file: MANAGER, name: '' }] }))).toBe('unmake takes each catalogue entry as { file, name }: a scene file in a game\'s folder, a name')
  expect(text('games/rooms/hall.scene.json')).toBe('{ "was": true }\n')
  expect(text(MANAGER)).toBe(MANAGED)
})

// ---------------------------------------------------------------- inside a change

const table = new Map<string, Route>()
scenemanager({ get: (r, f) => table.set(`GET ${r}`, f), post: (r, f) => table.set(`POST ${r}`, f) })
let folders = 0
// The changes the editor's server keeps, running the routes on the change's files.
const changes = () => new Changes(new Files(root), path.join(root, 'node_modules/.cache/editor', `changes-${folders++}`), async (_owner, route, body, files) => table.get(`POST ${route}`)!({ query: new URLSearchParams(), body, files }))
const op = (route: string, body: unknown) => [{ route: { owner: 'scenemanager', route, body } }]
const made = (a: Answer): Changed => {
  if ('error' in a) throw new Error(a.error)
  return a
}

test('make and unmake are each one change: one undo takes every file back byte for byte, and redo makes it again', async () => {
  const c = changes()
  const was = touched()
  expect(made(await c.change('make', op('make', MAKE))).answers).toEqual([{ files: Object.keys(FILES) }])
  const after = touched()
  expect(JSON.parse(after[MANAGER]!).prefabs.scenemanager.scenes.cellar).toEqual(ENTRY)
  expect(JSON.parse(after[MANAGER]!).world.loader.assets.cellar).toEqual(MAP)
  made(await c.undo('make'))
  expect(touched()).toEqual(was)
  made(await c.redo('make'))
  expect(touched()).toEqual(after)

  expect(made(await c.change('unmake', op('unmake', UNMAKE))).answers).toEqual([{ files: Object.keys(FILES) }])
  expect(touched()).toEqual(was)
  made(await c.undo('unmake'))
  expect(touched()).toEqual(after)
  made(await c.redo('unmake'))
  expect(touched()).toEqual(was)
})

test('a make refused once its files are written, for a catalogue entry or a table entry there already, leaves every file as it was and nothing kept', async () => {
  const c = changes()
  const was = touched()
  expect(await c.change('entry', op('make', { ...MAKE, assets: [{ file: MANAGER, name: 'hall', entry: MAP }] }))).toEqual({ id: 'entry', error: `the catalogue of ${MANAGER} has an entry hall already` })
  expect(touched()).toEqual(was)
  // The catalogue entry set, then the table's refused.
  expect(await c.change('table', op('make', { ...MAKE, table: { ...MAKE.table, name: 'hall' } }))).toEqual({ id: 'table', error: `the table of ${MANAGER} has a scene hall already` })
  expect(touched()).toEqual(was)
  expect(await c.undo('entry')).toEqual({ id: 'entry', error: 'no change entry is kept' })
  expect(await c.undo('table')).toEqual({ id: 'table', error: 'no change table is kept' })
  expect(c.version).toBe(0)
})

test('an unmake refused once the table entry is out, for a catalogue entry or a file not there, or a file out of the repo, leaves every file as it was and nothing kept', async () => {
  const c = changes()
  made(await c.change('make', op('make', MAKE)))
  const after = touched()
  expect(await c.change('entry', op('unmake', { ...UNMAKE, assets: [{ file: MANAGER, name: 'cave' }] }))).toEqual({ id: 'entry', error: `the catalogue of ${MANAGER} has no entry cave` })
  expect(touched()).toEqual(after)
  expect(await c.change('gone', op('unmake', { ...UNMAKE, files: [...UNMAKE.files, 'games/rooms/gone.json'] }))).toEqual({ id: 'gone', error: 'games/rooms/gone.json is not there' })
  expect(touched()).toEqual(after)
  // A link out of the repo, which the server's files refuse to follow, is no file of it.
  const away = mkdtempSync(path.join(tmpdir(), 'scenemanager-outside-'))
  writeFileSync(path.join(away, 'out.json'), '{}')
  symlinkSync(path.join(away, 'out.json'), at('games/rooms/assets/out.json'))
  expect(await c.change('out', op('unmake', { ...UNMAKE, files: [...UNMAKE.files, 'games/rooms/assets/out.json'] }))).toEqual({ id: 'out', error: 'games/rooms/assets/out.json is not there' })
  expect(touched()).toEqual(after)
  expect(readFileSync(at('games/rooms/assets/out.json'), 'utf8')).toBe('{}')
  rmSync(at('games/rooms/assets/out.json'))
  rmSync(away, { recursive: true, force: true })
  // A table that has no such scene, the first thing it takes out.
  expect(await c.change('none', op('unmake', { ...UNMAKE, table: { file: MANAGER, name: 'cave' } }))).toEqual({ id: 'none', error: `the table of ${MANAGER} has no scene cave` })
  for (const id of ['entry', 'gone', 'out', 'none']) expect(await c.undo(id)).toEqual({ id, error: `no change ${id} is kept` })
  made(await c.undo('make'))
  expect(touched()).toEqual(before())
})
