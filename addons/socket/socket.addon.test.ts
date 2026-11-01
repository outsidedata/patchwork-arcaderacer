// The WebSocket wire, on a manager of two scenes of two seats each, written here. Each page that
// dials is a connection of its own, which gets a seat and loses it on close; a connection with no
// seat free is closed with 1013. A press that crosses a scene move on the socket is dropped. The
// same seats are made on an HTTP server of someone else's (`upgrades`). A page is told its server has
// gone. The last test holds every other file in the repo to having no socket of its own.
import { afterAll, expect, test, vi } from 'vitest'
import http from 'node:http'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, scene, type Diff, type Down, type Got, type Up } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { dial, serve, upgrades } from './socket.addon.ts'

const DT = 1 / 60
const PORT = 9003
const hall: Scene = {
  world: {},
  plugins: ['scenemanager', 'player'],
  seats: 2,
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, player: { seat: 0 } },
  actors: [{ is: 'scenemanager' }],
}
const top: Scene = {
  world: {},
  plugins: ['scenemanager'],
  seats: 1,
  prefabs: {
    engine: { dt: DT },
    scenemanager: { scenes: { hall: { file: 'hall.scene.json', suspend: false }, yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'hall', port: PORT },
  },
  actors: [{ is: 'scenemanager' }],
}
const dir = mkdtempSync(join(tmpdir(), 'socket-'))
for (const name of ['hall', 'yard']) {
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(hall))
  writeFileSync(join(dir, `${name}.sim.ts`), `import { scenemanager } from ${JSON.stringify(new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, player: {} }
export const scene = file
`)
}
afterAll(() => rmSync(dir, { recursive: true }))

test('serve hands back the port it listens on, one the machine chose when asked for 0', async () => {
  const truth = boot(top, { scenemanager })
  await load(truth, pathToFileURL(dir + '/').href)
  const server = await serve(0, accept(manager(truth)))
  expect(server.port).toBeGreaterThan(0)
  const heard: Diff[] = []
  const page = dial<Up | Got, Diff>(`ws://localhost:${server.port}`)(d => heard.push(d))
  for (let i = 0; i < 200 && !heard.length; i++) { truth.step(DT); await new Promise(r => setTimeout(r, 5)) }
  expect(heard[0]?.scene).toBe('hall')
  page.close()
  await server.close()
})

test('each page that dials gets a seat and loses it on close, and one with no seat free is refused', async () => {
  const truth = boot(top, { scenemanager })
  await load(truth, pathToFileURL(dir + '/').href)
  const room = scene(manager(truth), 'hall')
  const server = await serve(PORT, accept(manager(truth)))
  const url = `ws://localhost:${PORT}`
  const players = () => room.rows.filter(r => r.kind === 'player').map(r => r.data.seat).sort()
  // The seat a page's own player row names, off the first envelope it hears after this: every page
  // is sent every player row, and its own is the one that is `mine`.
  const seenBy = (page: ReturnType<typeof link>) => new Promise<number[]>(r => {
    let done = false
    page.hear((d: Down) => { if (!done) { done = true; r(d.packet.rows.filter(x => x.kind === 'player' && x.data.mine === true).map(x => x.data.seat)) } })
  })

  // One after the other: two sockets dialled at once connect in either order.
  const a = link(dial(url))
  await vi.waitFor(() => expect(players()).toEqual([0]))
  const b = link(dial(url))
  await vi.waitFor(() => expect(players()).toEqual([0, 1]))
  const [sa, sb] = [seenBy(a), seenBy(b)]
  truth.step(DT)
  expect([await sa, await sb]).toEqual([[0], [1]])

  const c = new WebSocket(url)
  const refused = await new Promise<number>(r => { c.onclose = e => r(e.code) })
  expect(refused).toBe(1013)

  a.close()
  await vi.waitFor(() => expect(players()).toEqual([1]))
  const d = link(dial(url))
  await vi.waitFor(() => expect(players()).toEqual([0, 1]))
  const sd = seenBy(d)
  truth.step(DT)
  expect(await sd).toEqual([0])

  b.close(); d.close()
  await server.close()
})

// The page sends on the visit its last packet was of. A press sent there after the server has moved
// the seat on arrives for a visit that is over: it is dropped, and the socket carries on.
test('a press that crosses a scene move on the socket is dropped, and the page plays on where it went', async () => {
  const truth = boot(top, { scenemanager })
  await load(truth, pathToFileURL(dir + '/').href)
  const server = await serve(PORT - 1, accept(manager(truth)))
  const page = link(dial<Up | Got, Diff>(`ws://localhost:${PORT - 1}`))
  const heard: Down[] = []
  page.hear(d => heard.push(d))
  const hallRoom = scene(manager(truth), 'hall'), yardRoom = scene(manager(truth), 'yard')
  const players = () => [hallRoom, yardRoom].map(t => t.rows.filter(r => r.kind === 'player').length)
  await vi.waitFor(() => expect(players()).toEqual([1, 0]))
  let seq = 0
  // A `go` on the visit `d` is of, sent at that scene's own `scenemanager` row.
  const go = (d: Down, to: string) => page.send({ scene: d.scene, seat: d.seat, msg: { seq: ++seq, n: d.packet.n, id: d.packet.rows.find(r => r.kind === 'scenemanager')!.id, action: 'go', args: [to] } })
  // Stepped until the last envelope the page heard is of `name`.
  const until = (name: string) => vi.waitFor(() => { truth.step(DT); expect(heard[heard.length - 1]?.scene).toBe(name) })

  await until('hall')
  const inHall = heard[heard.length - 1]
  go(inHall, 'yard')
  await until('yard')
  expect(players()).toEqual([0, 1])
  // Sent on the hall visit, as a page that had not yet heard of the move would, and a go back to the
  // hall sent on the yard visit after it: the socket keeps their order, so the second arriving
  // shows the first arrived and threw nothing.
  go(inHall, 'yard')
  go(heard[heard.length - 1], 'hall')
  await until('hall')
  expect(players()).toEqual([1, 0])

  page.close()
  await vi.waitFor(() => expect(players()).toEqual([0, 0]))
  await server.close()
})

// A page's sends before its socket is open wait for it, and arrive in order.
test('a send before the socket is open waits for it', async () => {
  const heard: unknown[] = []
  const server = await serve<number, never>(PORT + 1, () => ({ take: up => { heard.push(up) }, close() {} }))
  const page = dial<number, never>(`ws://localhost:${PORT + 1}`)(() => {})
  page.send(1); page.send(2); page.send(3)
  await vi.waitFor(() => expect(heard).toEqual([1, 2, 3]))
  page.close()
  await server.close()
})

// Bytes cross as the bytes they are, each way: a `Uint8Array` at the top of a message, in an object,
// in an array, empty, and a node `Buffer` that is a slice of a larger one. Everything around them
// crosses as JSON does, and a message of plain JSON between two of bytes arrives in its order.
test('a Uint8Array anywhere in a message crosses as its bytes, in its place, each way and in order', async () => {
  const pattern = (n: number, k: number) => Uint8Array.from({ length: n }, (_, i) => (i * k + 3) & 255)
  const pool = Buffer.from(pattern(4096, 13))
  const message = () => ({
    held: { 4: { image: pattern(1_300_000, 31), live: { gravity: [0, -10, 0] } } },
    list: [1, pattern(3, 11), 'x', new Uint8Array(0)],
    sliced: pool.subarray(1000, 1500),
  })
  const want = [{ before: 1 }, { ...message(), sliced: new Uint8Array(pool.subarray(1000, 1500)) }, { between: 2 }, pattern(16, 3)]
  const heard: unknown[] = []
  const server = await serve<unknown, unknown>(0, send => ({ take: up => { heard.push(up); send(up) }, close() {} }))
  const got: unknown[] = []
  const page = dial<unknown, unknown>(`ws://localhost:${server.port}`)(down => { got.push(down) })
  page.send({ before: 1 })
  page.send(message())
  page.send({ between: 2 })
  page.send(pattern(16, 3))
  await vi.waitFor(() => expect(got.length).toBe(4))
  expect(heard).toEqual(want)
  expect(got).toEqual(want)
  page.close()
  await server.close()
})

// `upgrades` is `serve` on an HTTP server of someone else's, which hands it the upgrades it finds
// are for it: each a connection of its own, which gets a seat and loses it on close, as `serve`'s.
test('an HTTP server\'s upgrades handed to `upgrades` are seats, as `serve`\'s connections are', async () => {
  const heard: number[] = []
  let closed = 0
  const wire = await upgrades<number, number>(send => ({ take: up => { heard.push(up); send(up * 2) }, close: () => { closed++ } }))
  const server = http.createServer()
  server.on('upgrade', (req, socket, head) => { if (req.url === '/mine') wire.upgrade(req, socket, head); else socket.destroy() })
  await new Promise<void>(r => server.listen(0, 'localhost', r))
  const at = (server.address() as { port: number }).port
  const got: number[] = []
  const page = dial<number, number>(`ws://localhost:${at}/mine`)(down => { got.push(down) })
  page.send(1); page.send(2)
  await vi.waitFor(() => expect(got).toEqual([2, 4]))
  expect(heard).toEqual([1, 2])
  page.close()
  await vi.waitFor(() => expect(closed).toBe(1))
  await wire.close()
  await new Promise<void>(r => server.close(() => r()))
})

// A page is told once its server has gone, and when there was none to dial; never when it closed the
// socket itself.
test('a page is told its server has gone, or was never there, and not when it closed the socket itself', async () => {
  let gone = 0
  const server = await serve<number, never>(0, () => ({ take() {}, close() {} }))
  dial<number, never>(`ws://localhost:${server.port}`, () => { gone++ })(() => {}).send(1)
  const mine = dial<number, never>(`ws://localhost:${server.port}`, () => { gone += 100 })(() => {})
  mine.send(1)
  await new Promise(r => setTimeout(r, 100))
  mine.close()
  await new Promise(r => setTimeout(r, 100))
  expect(gone).toBe(0)
  await server.close()
  await vi.waitFor(() => expect(gone).toBe(1))
  // The port the server let go of has nobody on it now.
  let never = 0
  dial<number, never>(`ws://localhost:${server.port}`, () => { never++ })(() => {})
  await vi.waitFor(() => expect(never).toBe(1))
  await new Promise(r => setTimeout(r, 100))
  expect([gone, never]).toEqual([1, 1])
})

// This addon is the one WebSocket: no other file of the repo's, test or not, opens one or imports
// `ws`. A second copy grown beside it works and passes its own tests, as scenemanager's did, so
// nothing but this finds it. The editor's own channel to its pages is this addon's too
// (`editor/server/pages.ts`). Comments are read past: a header may name the socket.
test('no file but this addon and its test opens a WebSocket', () => {
  const root = new URL('../../', import.meta.url).pathname
  const mine = ['addons/socket/socket.addon.ts', 'addons/socket/socket.addon.test.ts']
  const files = ['engine', 'addons', 'plugins', 'games', 'editor', 'extensions'].filter(dir => existsSync(join(root, dir))).flatMap(dir =>
    (readdirSync(join(root, dir), { recursive: true }) as string[]).filter(f => /\.(ts|tsx|html)$/.test(f)).map(f => join(dir, f)))
  expect(files.length).toBeGreaterThan(100)
  const code = (f: string) => readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const offenders = files.filter(f => !mine.includes(f) && /\bWebSocket(Server)?\b|['"]ws['"]/.test(code(f)))
  expect(offenders).toEqual([])
})
