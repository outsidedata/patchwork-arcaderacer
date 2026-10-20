// The editor's server over HTTP, on a repo of its own: the file routes, an extension's route, the
// refusal of a request that does not come from the editor's own pages, Vite's page client opening no
// socket, a module the server writes served as written at once and one changed by anyone taken in anew
// as the watcher sees it, the games and extensions listed, `/editor/` sent to the game the server was
// started on, what the pages are told of the disk and of Vite and when, a page's changes and undos
// answered on its socket in the order it sent them and told to every other page, the change log's own
// writes and a file the watcher sees again as it was told as nothing more, every request a page makes
// answered and done with, and a game on node started again on its changed files, what it prints told
// to the pages on their socket.
import { afterAll, beforeAll, expect, onTestFinished, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { dial } from '#addons/socket/socket.addon.ts'
import type { Answer, Changed } from './changes.ts'
import { GATHER, STILL, type Applied, type Notice } from './disk.ts'
import type { Message } from './pages.ts'
import { start } from './server.ts'
import type { Event } from './servers.ts'

// By its real path, as the repo's is, so the files the watcher sees are the ones under it.
const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'editor-server-')))
mkdirSync(path.join(root, 'games/g'), { recursive: true })
mkdirSync(path.join(root, 'extensions/hello'), { recursive: true })
writeFileSync(path.join(root, 'games/g/g.scene.json'), '{\n  "world": { "seed": 1 },\n  "actors": []\n}\n')
writeFileSync(path.join(root, 'extensions/hello/hello.route.ts'), `
export function hello(r: any) {
  r.get('greet', (req: any) => ({ hi: req.query.get('name') }))
  r.post('sum', (req: any) => ({ sum: req.body.a + req.body.b }))
  r.post('save', async (req: any) => { await req.files.write(req.body.path, new Uint8Array(req.body.bytes)); return { read: await req.files.read(req.body.path) } })
}
`)

// A test that waits on the watcher waits a few seconds, past the default five beside the rest.
vi.setConfig({ testTimeout: 30_000 })

let server: Awaited<ReturnType<typeof start>>
// The watcher sees a file written once it is up, which can take it a second or two: every test after
// sees its writes as they are made.
beforeAll(async () => {
  server = await start({ root, port: 0 })
  const probe = path.join(root, 'probe.txt')
  const up = new Promise<void>(ok => { server.vite.watcher.on('add', f => { if (f === probe) ok() }) })
  writeFileSync(probe, 'up')
  await up
  rmSync(probe)
}, 30_000)
afterAll(async () => {
  await server.close()
  rmSync(root, { recursive: true, force: true })
})

const api = (route: string, init: RequestInit = {}) => fetch(`${server.url}${route}`, init)
const post = (route: string, body: unknown) => api(route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('a file is read and written whole, and a folder listed', async () => {
  expect(await (await api('/api/files?path=games/g/g.scene.json')).text()).toContain('"seed": 1')
  await api('/api/files?path=games/g/notes.txt', { method: 'PUT', body: 'hello' })
  expect(readFileSync(path.join(root, 'games/g/notes.txt'), 'utf8')).toBe('hello')
  expect(await (await api('/api/files/list?dir=games/g')).json()).toEqual(['games/g/g.scene.json', 'games/g/notes.txt'])
  // A folder that is not there holds no file; a file is no folder to list.
  expect(await (await api('/api/files/list?dir=games/g/none')).json()).toEqual([])
  expect((await api('/api/files/list?dir=games/g/notes.txt')).status).toBe(400)
})

test('a path out of the repo is an error, not a write', async () => {
  const res = await api('/api/files?path=../escape.txt', { method: 'PUT', body: 'x' })
  expect(res.status).toBe(400)
  expect((await res.json()).error).toContain('is not a file of the repo')
})

test('an extension\'s route answers under /api/x/<name>/', async () => {
  expect(await (await api('/api/x/hello/greet?name=bill')).json()).toEqual({ hi: 'bill' })
  expect(await (await post('/api/x/hello/sum', { a: 2, b: 3 })).json()).toEqual({ sum: 5 })
  expect((await api('/api/x/nobody/greet')).status).toBe(400)
})

test('a route writes the repo\'s files through the server\'s own, and never out of the repo', async () => {
  expect(await (await post('/api/x/hello/save', { path: 'games/g/bytes.bin', bytes: [104, 105] })).json()).toEqual({ read: 'hi' })
  expect([...readFileSync(path.join(root, 'games/g/bytes.bin'))]).toEqual([104, 105])
  const res = await post('/api/x/hello/save', { path: '../out.bin', bytes: [1] })
  expect(res.status).toBe(400)
  expect((await res.json()).error).toContain('is not a file of the repo')
})

test('a request from another origin is refused', async () => {
  const res = await api('/api/files?path=games/g/g.scene.json', { headers: { origin: 'http://evil.example' } })
  expect(res.status).toBe(403)
})

test('Vite\'s page client is served without opening a socket, or saying it connects', async () => {
  const client = await (await api('/@vite/client')).text()
  expect(client).toContain('function setupWebSocket(')
  expect(client).not.toMatch(/^\s*socket = setupWebSocket\(socketProtocol, socketHost/m)
  expect(client).not.toContain('[vite] connecting')
})

test('a module the server writes, for a page or for a route, is served as written at once, before the watcher has seen it', async () => {
  const rule = path.join(root, 'games/g/rule.ts')
  writeFileSync(rule, 'export const n = 111\n')
  expect(await (await api('/games/g/rule.ts')).text()).toContain('111')
  await api('/api/files?path=games/g/rule.ts', { method: 'PUT', body: 'export const n = 222\n' })
  expect(await (await api('/games/g/rule.ts')).text()).toContain('222')
  await post('/api/x/hello/save', { path: 'games/g/rule.ts', bytes: [...new TextEncoder().encode('export const n = 333\n')] })
  expect(await (await api('/games/g/rule.ts')).text()).toContain('333')
})

test('a module changed by anyone is taken in anew by Vite as the watcher sees the change, before anything else hears of it', async () => {
  const rule = path.join(root, 'games/g/seen.ts')
  const added = new Promise<void>(ok => {
    const heard = (_event: string, file: string) => {
      if (file !== rule) return
      server.vite.watcher.off('all', heard)
      ok()
    }
    server.vite.watcher.on('all', heard)
  })
  writeFileSync(rule, 'export const n = 1\n')
  await added
  expect(await (await api('/games/g/seen.ts')).text()).toContain('= 1')
  // Vite's own handler of the change takes the module in anew only after it has waited on its
  // plugins; what anyone hears of the change at once finds it taken in already.
  const fresh = new Promise<boolean>(ok => {
    const heard = (event: string, file: string) => {
      if (file !== rule || event !== 'change') return
      server.vite.watcher.off('all', heard)
      ok([...server.vite.moduleGraph.getModulesByFile(rule) ?? []].every(m => m.transformResult === null))
    }
    server.vite.watcher.on('all', heard)
  })
  writeFileSync(rule, 'export const n = 2\n')
  expect(await fresh).toBe(true)
  expect(await (await api('/games/g/seen.ts')).text()).toContain('= 2')
})

test('the games are listed as the disk holds them now, each whether the editor opens it, and the extensions a page on a game loads', async () => {
  mkdirSync(path.join(root, 'games/h/extensions/tool'), { recursive: true })
  mkdirSync(path.join(root, 'games/h/plugins/own'), { recursive: true })
  mkdirSync(path.join(root, 'plugins/p'), { recursive: true })
  writeFileSync(path.join(root, 'games/h/h.scene.json'), JSON.stringify({ prefabs: { scenemanager: { scenes: {} } }, actors: [] }))
  writeFileSync(path.join(root, 'games/h/h.sim.ts'), 'export const sim = {}\n')
  for (const f of ['games/h/h.extension.tsx', 'games/h/extensions/tool/tool.extension.tsx', 'games/h/plugins/own/own.extension.tsx', 'plugins/p/p.extension.tsx', 'extensions/hello/hello.extension.tsx'])
    writeFileSync(path.join(root, f), 'export const x = 1\n')
  expect(await (await api('/api/games')).json()).toEqual([{ name: 'g', opens: false }, { name: 'h', opens: true }])
  expect(await (await api('/api/extensions?game=h')).json()).toEqual({
    own: ['/extensions/hello/hello.extension.tsx'],
    named: ['/plugins/p/p.extension.tsx'],
    game: ['/games/h/h.extension.tsx', '/games/h/extensions/tool/tool.extension.tsx', '/games/h/plugins/own/own.extension.tsx'],
  })
  expect((await (await api('/api/extensions')).json()).game).toEqual([])
  // One made a moment ago is listed at once.
  writeFileSync(path.join(root, 'games/h/extensions/tool/more.extension.tsx'), 'export const x = 1\n')
  expect((await (await api('/api/extensions?game=h')).json()).game).toContain('/games/h/extensions/tool/more.extension.tsx')
  expect((await api('/api/extensions?game=../g')).status).toBe(400)
})

test('a server started on a game sends /editor/ to that game\'s page; one started on none, and a page naming its game, are served as they are', async () => {
  const on = await start({ root, port: 0, game: 'h' })
  try {
    for (const at of ['/editor/', '/editor']) {
      const res = await fetch(`${on.url}${at}`, { redirect: 'manual' })
      expect([res.status, res.headers.get('location')], at).toEqual([302, '/editor/?game=h'])
    }
    expect((await fetch(`${on.url}/editor/?game=g`, { redirect: 'manual' })).status).not.toBe(302)
  } finally {
    await on.close()
  }
  expect((await api('/editor/', { redirect: 'manual' })).status).not.toBe(302)
})

// What a page heard of the changes other pages made, and of the disk.
const changedIn = (heard: Message[]) => heard.filter(m => m.event === 'editor:changed').map(m => m.data as Applied)
const diskIn = (heard: Message[]) => heard.filter(m => m.event === 'editor:disk').map(m => m.data as Notice)
// A page on the editor pages' socket, dialled as the editor page dials it, which says it is page `id`
// on game `game`: every message the server sends it, the notices of the disk and of other pages'
// changes among them, what the games on node say and the answers to its changes; what it sends; and
// its going away, as a page that is closed or goes to another game goes.
function page(id: string, game?: string) {
  const heard: Message[] = []
  const socket = dial<Message, Message>(`${server.url.replace('http:', 'ws:')}/api/page`)(m => { heard.push(m) })
  socket.send({ event: 'editor:page', data: { id, game } })
  onTestFinished(() => socket.close())
  return {
    heard,
    disk: () => diskIn(heard),
    servers: () => heard.filter(m => m.event === 'editor:servers').map(m => m.data as Event),
    answers: () => heard.filter(m => m.event === 'editor:answer').map(m => m.data as Answer),
    changed: () => changedIn(heard),
    send: (event: string, data: unknown) => socket.send({ event, data }),
    close: () => socket.close(),
  }
}
// A page that began to load at `since`, by the machine's clock, joining the socket: every message
// the server sends it.
function join(id: string, game: string, since: number) {
  const heard: Message[] = []
  const socket = dial<Message, Message>(`${server.url.replace('http:', 'ws:')}/api/page`)(m => { heard.push(m) })
  socket.send({ event: 'editor:page', data: { id, game, since } })
  onTestFinished(() => socket.close())
  return heard
}
// Long enough for the pages to have said who they are.
const settled = () => new Promise(r => setTimeout(r, 200))
// As long as the watcher may take to see a write, and the file to be still.
const WATCH = { timeout: 8000 }
// Done once the watcher has seen every write made before it and each is still: a file written by hand
// after them, `at`, told to page `p` as it settles, and a while after that.
async function seen(p: ReturnType<typeof page>, at: string) {
  writeFileSync(path.join(root, at), `${Date.now()}`)
  await vi.waitFor(() => expect(p.disk().map(n => n.path)).toContain(at), WATCH)
  await settled()
}

test('a page is told of every change on the disk no change made to its game\'s files, and to files of no game: by hand, and by a request outside any change, whichever page asked it', async () => {
  const mine = page('mine', 'g'), other = page('other', 'g'), elsewhere = page('elsewhere', 'h'), none = page('none')
  await settled()
  // What each page was told of the file at `at`.
  const of = (p: ReturnType<typeof page>, at: string) => p.disk().filter(n => n.path === at)
  // Made by hand, as a text editor or an LLM's tools make one.
  writeFileSync(path.join(root, 'games/g/hand.json'), '{}')
  await vi.waitFor(() => expect(of(mine, 'games/g/hand.json')).toEqual([{ path: 'games/g/hand.json', added: true, gone: false }]), WATCH)
  await vi.waitFor(() => expect(of(other, 'games/g/hand.json')).toEqual(of(mine, 'games/g/hand.json')))
  // A page is told of its own game's files alone.
  const ofG = (p: ReturnType<typeof page>) => p.disk().filter(n => n.path.startsWith('games/g/'))
  expect([ofG(elsewhere), ofG(none)]).toEqual([[], []])

  // Written by the file routes and by a route asked by a plain request, outside any change, as page
  // `mine` asks them: no change made it, and every page of the game is told, `mine` as much as any.
  await api('/api/files?path=games/g/hand.json', { method: 'PUT', body: '{ "a": 1 }' })
  await post('/api/x/hello/save', { path: 'games/g/mine.bin', bytes: [2] })
  await vi.waitFor(() => expect([of(other, 'games/g/hand.json').length, of(other, 'games/g/mine.bin').length]).toEqual([2, 1]), WATCH)
  await vi.waitFor(() => expect([of(mine, 'games/g/hand.json').length, of(mine, 'games/g/mine.bin').length]).toEqual([2, 1]), WATCH)
  expect(of(mine, 'games/g/mine.bin')).toEqual([{ path: 'games/g/mine.bin', added: true, gone: false }])

  // The same file changed again by hand after the server's write is told too; and so is it put back by
  // hand to what the server wrote: the server's write is let go of once it has landed.
  writeFileSync(path.join(root, 'games/g/mine.bin'), 'by hand')
  await vi.waitFor(() => expect(of(mine, 'games/g/mine.bin')).toEqual([{ path: 'games/g/mine.bin', added: true, gone: false }, { path: 'games/g/mine.bin', added: false, gone: false }]), WATCH)
  writeFileSync(path.join(root, 'games/g/mine.bin'), new Uint8Array([2]))
  await vi.waitFor(() => expect(of(mine, 'games/g/mine.bin')).toHaveLength(3), WATCH)

  // A page that began to load before a change and joins after it is told of it as it joins; one that
  // began after is not.
  // `before` is a millisecond before the write, as a page's time origin is before anything it reads.
  const before = Date.now() - 1
  writeFileSync(path.join(root, 'games/g/late.json'), '{}')
  await vi.waitFor(() => expect(of(other, 'games/g/late.json')).toHaveLength(1), WATCH)
  const late = join('late', 'g', before), fresh = join('fresh', 'g', Date.now())
  await vi.waitFor(() => expect(late.filter(m => m.event === 'editor:disk').map(m => (m.data as Notice).path)).toContain('games/g/late.json'), WATCH)
  await settled()
  expect(fresh.filter(m => m.event === 'editor:disk' && (m.data as Notice).path === 'games/g/late.json')).toEqual([])

  // Taken away; and a file of no game's, which every page hears.
  rmSync(path.join(root, 'games/g/hand.json'))
  await vi.waitFor(() => expect(of(mine, 'games/g/hand.json').at(-1)).toEqual({ path: 'games/g/hand.json', added: false, gone: true }), WATCH)
  writeFileSync(path.join(root, 'plugins/p/p.data.json'), '{}')
  await vi.waitFor(() => expect(of(none, 'plugins/p/p.data.json')).toHaveLength(1), WATCH)
  expect([of(elsewhere, 'plugins/p/p.data.json').length, of(mine, 'plugins/p/p.data.json').length, ofG(elsewhere), ofG(none)]).toEqual([1, 1, [], []])
})

test('a page that began to load after a file came to be as it is is not told of it, as a page reloaded for a write of a plain request of its own is not; one that began before is', async () => {
  const before = join('before', 'g', Date.now() - 1000)
  await settled()
  const of = (heard: Message[], at: string) => diskIn(heard).filter(n => n.path === at)
  // Written by plain requests of a page that reloads for them at once, as for code it ran, and joins
  // as the page `reloaded`, before the watcher has seen the writes.
  await api('/api/files?path=games/g/reload.ts', { method: 'PUT', body: 'export const r = 1\n' })
  await post('/api/x/hello/save', { path: 'games/g/routed.bin', bytes: [3] })
  const reloaded = join('reloaded', 'g', Date.now())
  await vi.waitFor(() => expect([of(before, 'games/g/reload.ts').length, of(before, 'games/g/routed.bin').length]).toEqual([1, 1]), WATCH)
  await settled()
  expect([...of(reloaded, 'games/g/reload.ts'), ...of(reloaded, 'games/g/routed.bin')]).toEqual([])
  // A change after it began to load is told to it.
  writeFileSync(path.join(root, 'games/g/reload.ts'), 'export const r = 2\n')
  await vi.waitFor(() => expect(of(reloaded, 'games/g/reload.ts')).toHaveLength(1), WATCH)
})

test('a page is told nothing before it says which page it is, and once it says, what it missed since it began to load, once', async () => {
  mkdirSync(path.join(root, 'plugins/p'), { recursive: true })
  const began = Date.now()
  const heard: Message[] = []
  const socket = dial<Message, Message>(`${server.url.replace('http:', 'ws:')}/api/page`)(m => { heard.push(m) })
  onTestFinished(() => socket.close())
  const witness = page('witness')
  await settled()
  // A file of no game, which every page that has said is told of.
  writeFileSync(path.join(root, 'plugins/p/quiet.json'), '{}')
  await vi.waitFor(() => expect(witness.disk().map(n => n.path)).toContain('plugins/p/quiet.json'), WATCH)
  expect(heard).toEqual([])
  socket.send({ event: 'editor:page', data: { id: 'quiet', since: began } })
  const quiet = () => heard.filter(m => m.event === 'editor:disk' && (m.data as Notice).path === 'plugins/p/quiet.json')
  await vi.waitFor(() => expect(quiet()).toHaveLength(1))
  await settled()
  expect(quiet()).toHaveLength(1)
})

test('a page\'s change and its undo, sent back to back on its socket, are answered in order, a malformed one sent after them too, and leave the files as they were', async () => {
  const p = page('changer', 'g')
  const scene = path.join(root, 'games/g/g.scene.json')
  const was = readFileSync(scene, 'utf8')
  // A JSON value, and an extension's route run inside the change, which Vite loads as the change is
  // still being made.
  p.send('editor:change', { id: 'c1', ops: [
    { json: 'games/g/g.scene.json', at: ['world', 'seed'], value: 9 },
    { route: { owner: 'hello', route: 'save', body: { path: 'games/g/changed.bin', bytes: [104, 105] } } },
  ] })
  p.send('editor:undo', { id: 'c1' })
  p.send('editor:change', { id: 'c2', ops: [{ nope: 1 }] })
  await vi.waitFor(() => expect(p.answers()).toHaveLength(3))
  const [made, undone, refused] = p.answers()
  expect(made).toMatchObject({ id: 'c1', files: { 'games/g/changed.bin': 'hi' }, answers: [{ read: 'hi' }] })
  if ('error' in made) throw new Error(made.error)
  expect(JSON.parse(made.files['games/g/g.scene.json']!).world.seed).toBe(9)
  expect(undone).toEqual({ id: 'c1', version: made.version + 1, files: { 'games/g/g.scene.json': was, 'games/g/changed.bin': null }, answers: [] })
  expect(refused).toEqual({ id: 'c2', error: 'an op is a json, text, bytes or route op' })
  expect([readFileSync(scene, 'utf8'), existsSync(path.join(root, 'games/g/changed.bin'))]).toEqual([was, false])
})

test('every change, undo and redo applied is told to every other page, by the page that sent it: on the files\' game, each file of it and of no game, and on another game or none, each of no game; the page that sent it has its answer alone, and the change log\'s writes are no change on the disk, told or counted', async () => {
  mkdirSync(path.join(root, 'plugins/p'), { recursive: true })
  const a = page('a', 'g'), b = page('b', 'g'), elsewhere = page('elsewhere', 'h'), none = page('none')
  await settled()
  const scene = path.join(root, 'games/g/g.scene.json')
  const was = readFileSync(scene, 'utf8')
  a.send('editor:change', { id: 'n1', ops: [
    { json: 'games/g/g.scene.json', at: ['world', 'seed'], value: 5 },
    { text: 'plugins/p/shared.json', value: '{ "n": 1 }\n' },
  ] })
  await vi.waitFor(() => expect([a.answers().length, b.changed().length, elsewhere.changed().length, none.changed().length]).toEqual([1, 1, 1, 1]))
  const made = a.answers()[0] as Changed
  const told = b.changed()[0]
  expect(told).toEqual({ id: 'n1', by: 'a', version: made.version, files: made.files, at: expect.any(Number) })
  expect(elsewhere.changed()).toEqual([{ ...told, files: { 'plugins/p/shared.json': '{ "n": 1 }\n' } }])
  expect(none.changed()).toEqual(elsewhere.changed())
  expect(a.changed()).toEqual([])

  // Its undo, sent by the other page: told to every page but that one, the first too.
  b.send('editor:undo', { id: 'n1' })
  await vi.waitFor(() => expect([b.answers().length, a.changed().length, elsewhere.changed().length]).toEqual([1, 1, 2]))
  const undone = b.answers()[0] as Changed
  expect(a.changed()).toEqual([{ id: 'n1', by: 'b', version: made.version + 1, files: { 'games/g/g.scene.json': was, 'plugins/p/shared.json': null }, at: expect.any(Number) }])
  expect(b.changed()).toEqual([told])
  expect(undone.version).toBe(made.version + 1)

  // Once the watcher has seen every write the change log made, and each is still: none is told as a
  // change on the disk, and none counted as one; a change by hand after them is told and counted.
  await seen(a, 'games/g/after-n1.json')
  for (const p of [a, b, elsewhere, none]) expect(p.disk().filter(n => n.path === 'games/g/g.scene.json' || n.path === 'plugins/p/shared.json')).toEqual([])
  a.send('editor:redo', { id: 'n1' })
  await vi.waitFor(() => expect(a.answers()).toHaveLength(2))
  expect((a.answers()[1] as Changed).version).toBe(undone.version + 2)
  await vi.waitFor(() => expect(b.changed()).toHaveLength(2))
  expect([a.changed().length, b.changed()[1].by]).toEqual([1, 'a'])
  // Put back as it was, for the tests after.
  a.send('editor:undo', { id: 'n1' })
  await vi.waitFor(() => expect(a.answers()).toHaveLength(3))
  expect(readFileSync(scene, 'utf8')).toBe(was)
})

test('a file the watcher sees again as it was, as it may for one write or after it has missed some, is no change: told and counted once; a change to it after is told', async () => {
  const p = page('again', 'g')
  await settled()
  const at = 'games/g/again.json', file = path.join(root, at)
  const of = () => p.disk().filter(n => n.path === at)
  writeFileSync(file, '{}')
  await vi.waitFor(() => expect(of()).toEqual([{ path: at, added: true, gone: false }]), WATCH)
  // A change on either side of the watcher seeing the file again, whose versions count what came between.
  p.send('editor:change', { id: 'g1', ops: [{ text: 'games/g/again.txt', value: 'a\n' }] })
  await vi.waitFor(() => expect(p.answers()).toHaveLength(1))
  server.vite.watcher.emit('all', 'change', file)
  await new Promise(r => setTimeout(r, STILL * 3))
  p.send('editor:undo', { id: 'g1' })
  await vi.waitFor(() => expect(p.answers()).toHaveLength(2))
  expect((p.answers()[1] as Changed).version).toBe((p.answers()[0] as Changed).version + 1)
  expect(of()).toHaveLength(1)
  // Changed, and taken away: each told; the taking away seen again is nothing more.
  writeFileSync(file, '{ "b": 1 }')
  await vi.waitFor(() => expect(of().at(-1)).toEqual({ path: at, added: false, gone: false }), WATCH)
  rmSync(file)
  await vi.waitFor(() => expect(of().at(-1)).toEqual({ path: at, added: false, gone: true }), WATCH)
  server.vite.watcher.emit('all', 'unlink', file)
  await new Promise(r => setTimeout(r, STILL * 3))
  expect(of()).toHaveLength(3)
})

test('a page that reloads for its own change, joining under a new id, is told nothing of it, as a change or on the disk; a page that began to load before it and joins after is told it', async () => {
  const writer = page('writer', 'g')
  await settled()
  const began = Date.now() - 1
  await new Promise(r => setTimeout(r, 5))
  writer.send('editor:change', { id: 'r1', ops: [{ text: 'games/g/code.ts', value: 'export const c = 1\n' }] })
  await vi.waitFor(() => expect(writer.answers()).toHaveLength(1))
  // It reloads for the code it wrote, as a page that ran it does, and joins again.
  const reloaded = join('writer, reloaded', 'g', Date.now())
  const late = join('late', 'g', began)
  await vi.waitFor(() => expect(changedIn(late).map(c => c.id)).toEqual(['r1']))
  await seen(writer, 'games/g/after-r1.json')
  expect([changedIn(reloaded), diskIn(reloaded).filter(n => n.path === 'games/g/code.ts'), diskIn(late).filter(n => n.path === 'games/g/code.ts')]).toEqual([[], [], []])
  writer.send('editor:undo', { id: 'r1' })
  await vi.waitFor(() => expect(writer.answers()).toHaveLength(2))
  expect(existsSync(path.join(root, 'games/g/code.ts'))).toBe(false)
})

test('what Vite would say to a page over its own socket is said on the editor\'s: a reload, and a module that does not compile', async () => {
  const p = page('vite', 'g')
  await settled()
  const before = Date.now()
  await new Promise(r => setTimeout(r, 5))
  server.vite.hot.send({ type: 'full-reload', path: '*' })
  await vi.waitFor(() => expect(p.heard.find(m => m.event === 'editor:reload')?.data).toEqual({ why: 'Vite asked for it: its dependencies bundled again, or its config changed' }))
  await new Promise(r => setTimeout(r, 5))
  // A page that began to load before that reload and joins after it is told it as it joins; one that
  // began after is not.
  const late = join('late', 'g', before), fresh = join('fresh', 'g', Date.now())
  await vi.waitFor(() => expect(late.map(m => m.event)).toContain('editor:reload'))
  await settled()
  expect(fresh.filter(m => m.event === 'editor:reload')).toEqual([])
  writeFileSync(path.join(root, 'games/g/wrong.ts'), 'export const = 2\n')
  expect((await api('/games/g/wrong.ts')).status).not.toBe(200)
  await vi.waitFor(() => expect((p.heard.find(m => m.event === 'editor:error')?.data as { message: string }).message).toMatch(/games\/g\/wrong\.ts: /))
})

test('every request a page makes is answered and done with, so a page that goes to another game and back, again and again, leaves the browser its six for the next', async () => {
  // A browser's requests to one server, as Chrome makes them: at most six at once across every tab,
  // each connection kept for the next request once its answer has ended.
  const browser = new http.Agent({ keepAlive: true, maxSockets: 6 })
  onTestFinished(() => browser.destroy())
  // `route` asked as the browser asks it: its status once its answer has ended, or the route named as
  // still open once two seconds have gone by.
  const ask = (route: string) => new Promise<number>((ok, open) => {
    const late = setTimeout(() => open(new Error(`${route} is still open after 2 s`)), 2000)
    http.get(`${server.url}${route}`, { agent: browser }, res => {
      res.resume()
      res.on('end', () => {
        clearTimeout(late)
        ok(res.statusCode!)
      })
    }).on('error', open)
  })
  // Every GET route, as a page on `game` asks it as it loads, with the status each answers: the MCP
  // server's asked with no session, and `/api/events`, no route: a stream of the server's events held
  // open for a page's whole life would keep one of the six, so they come on the pages' socket.
  const routes = (game: string) => ({
    '/api/games': 200,
    [`/api/extensions?game=${game}`]: 200,
    '/api/servers': 200,
    '/api/files?path=games/g/g.scene.json': 200,
    [`/api/files/list?dir=games/${game}`]: 200,
    [`/api/x/hello/greet?name=${game}`]: 200,
    '/api/mcp': 400,
    '/api/events': 404,
  })
  // A page that goes to another game and back, over and over: eight loads, more than the browser's
  // six. Each asks every route and joins the socket, and goes away with none of its requests open.
  for (const [i, game] of ['g', 'h', 'g', 'h', 'g', 'h', 'g', 'h'].entries()) {
    const p = page(`load ${i}`, game)
    const asked = routes(game)
    expect(Object.fromEntries(await Promise.all(Object.keys(asked).map(async r => [r, await ask(r)])))).toEqual(asked)
    await vi.waitFor(() => expect(Object.values(browser.sockets).flat()).toEqual([]))
    p.close()
  }
})

test('a game running on node starts again when a file it may run changes, whoever changed it: its own game\'s, or code every game runs, but not another game\'s, an extension, or a test', async () => {
  // A game whose server prints that it is up and stays up, its files seen and settled before it starts,
  // so it starts again on nothing of its making.
  const watching = [page('on n', 'n'), page('on h', 'h')]
  await settled()
  const told = () => new Set(watching.flatMap(p => p.disk().map(n => n.path)))
  mkdirSync(path.join(root, 'games/n'), { recursive: true })
  writeFileSync(path.join(root, 'games/n/n.scene.json'), JSON.stringify({ prefabs: { scenemanager: { scenes: {}, port: 9017 } }, actors: [] }))
  writeFileSync(path.join(root, 'games/n/n.server.ts'), 'console.log(\'up\')\nsetInterval(() => {}, 1000)\n')
  await vi.waitFor(() => expect(['games/n/n.scene.json', 'games/n/n.server.ts'].filter(f => !told().has(f))).toEqual([]), WATCH)
  await new Promise(r => setTimeout(r, GATHER * 3))
  // Every line the game prints, as a page on the socket hears it; a page on another game hears it too.
  const lines = () => watching[0].servers().flatMap(e => (e.type === 'log' && e.game === 'n' ? [e.line] : []))
  onTestFinished(async () => { await post('/api/servers/stop', { game: 'n' }) })
  await post('/api/servers/start', { game: 'n' })
  await vi.waitFor(() => expect(lines()).toEqual(['starting on port 9017', 'up']), WATCH)
  await vi.waitFor(() => expect(watching[1].servers()).toEqual(watching[0].servers()))
  const restarts = () => lines().filter(l => l === 'stopped').length
  // None of these, each seen and settled on its own, with nothing else changed for a game to start
  // again on: another game's file, an extension, a test, an actor's look, a hidden file, a note, and
  // what a run of the simulator records, which its tap writes every second.
  for (const dir of ['addons/simulator/runs', 'games/h', 'plugins/p']) mkdirSync(path.join(root, dir), { recursive: true })
  const none =['games/h/rule.ts', 'plugins/p/p.extension.tsx', 'games/n/n.sim.test.ts', 'games/n/hero.client.ts', 'games/n/.DS_Store', 'games/n/notes.md', 'addons/simulator/runs/tap.jsonl']
  for (const f of none) writeFileSync(path.join(root, f), `// ${f}\n`)
  await vi.waitFor(() => expect(none.filter(f => !told().has(f))).toEqual([]), WATCH)
  // Each was told as it settled, which is when a game would be gathered to start again.
  await new Promise(r => setTimeout(r, GATHER * 3))
  expect(restarts()).toBe(0)
  // Two of its own files at once, written through the server: one start again.
  await api('/api/files?path=games/n/a.sim.ts', { method: 'PUT', body: 'export const a = 1\n' })
  await api('/api/files?path=games/n/b.sim.ts', { method: 'PUT', body: 'export const b = 1\n' })
  await vi.waitFor(() => expect(restarts()).toBe(1), WATCH)
  await new Promise(r => setTimeout(r, 1000))
  expect(restarts()).toBe(1)
  // Code every game runs, changed by hand.
  mkdirSync(path.join(root, 'engine'), { recursive: true })
  writeFileSync(path.join(root, 'engine/shared.ts'), 'export const s = 1\n')
  await vi.waitFor(() => expect(restarts()).toBe(2), WATCH)
  // Its scene file broken: it stays stopped and says why, and the editor's server goes on; put right,
  // it starts again, since it was asked to run and never stopped.
  const scene = readFileSync(path.join(root, 'games/n/n.scene.json'), 'utf8')
  writeFileSync(path.join(root, 'games/n/n.scene.json'), '{ broken')
  await vi.waitFor(() => expect(lines().at(-1)).toMatch(/^could not start again: /), WATCH)
  expect(await (await api('/api/servers')).json()).toEqual([])
  writeFileSync(path.join(root, 'games/n/n.scene.json'), scene)
  await vi.waitFor(() => expect(lines().slice(-2)).toEqual(['starting on port 9017', 'up']), WATCH)
  expect(await (await api('/api/servers')).json()).toEqual([{ game: 'n', port: 9017 }])
  // Its server thrown as it starts: it exits by itself, and a change that puts it right starts it.
  const server_ = readFileSync(path.join(root, 'games/n/n.server.ts'), 'utf8')
  writeFileSync(path.join(root, 'games/n/n.server.ts'), 'throw new Error(\'down\')\n')
  await vi.waitFor(() => expect(lines().at(-1)).toMatch(/^exited with code [1-9]/), WATCH)
  expect(await (await api('/api/servers')).json()).toEqual([])
  writeFileSync(path.join(root, 'games/n/n.server.ts'), server_)
  await vi.waitFor(() => expect(lines().slice(-2)).toEqual(['starting on port 9017', 'up']), WATCH)
  // Stopped, it is asked for no more: a change starts nothing.
  await post('/api/servers/stop', { game: 'n' })
  await vi.waitFor(() => expect(lines().at(-1)).toBe('stopped'))
  const said = lines().length
  writeFileSync(path.join(root, 'games/n/c.sim.ts'), 'export const c = 1\n')
  await vi.waitFor(() => expect(watching[0].disk().map(n => n.path)).toContain('games/n/c.sim.ts'), WATCH)
  await new Promise(r => setTimeout(r, GATHER * 3))
  expect(lines().slice(said)).toEqual([])
})
