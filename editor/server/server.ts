// The editor's server: `yarn editor [game] [--port <port>]`, on 5173 unless given another (`PORT`
// from the shell does too; 0 is any free one). A port another server holds is refused with how to
// start on another, never a stack trace. One HTTP server holding Vite, which serves the editor at
// `/editor/` and every game's pages, and the editor's API under `/api/`:
//
//   GET  /api/files?path=           a file's text
//   PUT  /api/files?path=           the body is the file's new text, written outside any change
//   GET  /api/files/list?dir=       every file under a folder
//   GET  /api/games                 the games of `games/`, each { name, opens }: whether the editor
//                                   opens it, a manager scene with a scenemanager table and a sim
//   GET  /api/extensions?game=      the extension files the editor page loads, by their urls:
//                                   { own, named, game }, the editor's own, every plugin's and
//                                   addon's, and the game's
//   GET  /api/servers               the games running on node, with their ports
//   POST /api/servers/start|stop    { game }: `games/<game>/<game>.server.ts` as a child process;
//                                   what each prints and which run, `{ type: 'log', game, line }`
//                                   and `{ type: 'servers', running }`, is told to every page on
//                                   the pages' socket as `editor:servers`
//   *    /api/x/<name>/<route>      a route an extension's `<name>.route.ts` ships, which touches the
//                                   repo through the server's files, as these routes do, outside any
//                                   change; a change runs one inside it (`routes.ts`)
//   POST|GET|DELETE /api/mcp        the editor's MCP server (Streamable HTTP): every command of the
//                                   editor page the user is in is a tool (`mcp.ts`)
//   WS   /api/page                  the editor pages' socket (`pages.ts`): the MCP server asks the
//                                   page on it, and the server tells the page the changes other pages
//                                   made, what changed on the disk and what Vite asks of it
//                                   (`disk.ts`), and what the games on node say. A page sends its
//                                   changes on it (`changes.ts`):
//     editor:change { id, ops }     a change of the repo's files, named by the page
//     editor:undo   { id }          that change taken back
//     editor:redo   { id }          made again
//                                   each applied in turn for the whole server and answered to the
//                                   page that sent it, in the order it sent them, `editor:answer`
//                                   { id, version, files, answers }, or { id, error }; and each
//                                   applied told to every other page on the files' game, every page
//                                   for a file of no game, `editor:changed` (`disk.ts`)
//
// Every request is answered and done with: nothing the server says to a page as it happens holds an
// HTTP request open, which the browser would count against the six it opens to one server, across
// every tab, so that a few editor pages, or one that has gone to another game and back, would leave
// none for a page's next request. What is said as it happens is said on the pages' socket.
//
// It only answers requests addressed to it by name, from its own pages: a web page elsewhere cannot
// make a browser write the repo.
//
// A game is a project: an editor page has one game open, the game in its url, `/editor/?game=<name>`,
// and nothing of any other. Started with a game, the server sends `/editor/` to that game's page;
// opening another is going to its url.
//
// Vite runs with no HMR and no socket of its own, and its page client opens none (`noSocket`): no
// file changed reloads a page or swaps anything in one by itself. Every file the server writes is
// taken in anew by Vite at once. Every change the change log applies is told to the editor pages that
// did not send it, and every change on the disk no change made, a plain request's write or anyone
// else's, to every editor page, the one that made it too; each page is told only of the files of its
// own game and of no game, and only of what came after it began to load, and takes it in or reloads
// (`disk.ts`). The files the change log writes through are its own (`logged`), so the server knows its
// writes from any other. Its record is kept in `node_modules/.cache/editor/changes/`, so a change made
// before the server started again is still taken back.
// The server itself runs under `node --watch`, which starts it again when a file of its own code
// changes; a page whose socket closes waits for it and reloads (`main.tsx`).
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer, type Plugin, type ViteDevServer } from 'vite'
import config from '../../vite.config.ts'
import { Changes, type Answer, type Op } from './changes.ts'
import { disk } from './disk.ts'
import { Files } from './files.ts'
import { extensionsOf, gamesIn } from './listing.ts'
import { Servers } from './servers.ts'
import { Routes } from './routes.ts'
import { editorMcp } from './mcp.ts'
import { pages, type Page } from './pages.ts'

type Handler = (q: URLSearchParams, body: unknown) => Promise<unknown>

// A base64 text, as a whole file's bytes are sent.
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

// The ops of a change, as a page sent them (`Op` in `changes.ts`).
function opsOf(d: unknown): Op[] {
  const ops = (d as { ops?: unknown } | null)?.ops
  if (!Array.isArray(ops)) throw new Error('a change is a list of ops')
  return ops.map((o: unknown): Op => {
    const op = (o ?? {}) as { json?: unknown; text?: unknown; bytes?: unknown; route?: unknown; at?: unknown; value?: unknown; insert?: unknown; index?: unknown }
    if (typeof op.json === 'string') {
      if (!Array.isArray(op.at) || !op.at.every(k => typeof k === 'string' || typeof k === 'number')) throw new Error(`a JSON op on ${op.json} names where in it`)
      if (op.insert !== undefined && typeof op.insert !== 'boolean') throw new Error(`a JSON op on ${op.json} inserts or does not`)
      if (op.index !== undefined && !(Number.isInteger(op.index) && (op.index as number) >= 0)) throw new Error(`a JSON op on ${op.json} puts a key at a place among its object's keys`)
      return { json: op.json, at: op.at, value: op.value, ...(op.insert !== undefined && { insert: op.insert }), ...(op.index !== undefined && { index: op.index as number }) }
    }
    if (typeof op.text === 'string') {
      if (op.value !== null && typeof op.value !== 'string') throw new Error(`a text op writes ${op.text} as text, or takes it away`)
      return { text: op.text, value: op.value }
    }
    if (typeof op.bytes === 'string') {
      if (op.value !== null && !(typeof op.value === 'string' && BASE64.test(op.value))) throw new Error(`a bytes op writes ${op.bytes} as base64, or takes it away`)
      return { bytes: op.bytes, value: op.value }
    }
    const call = op.route as { owner?: unknown; route?: unknown; body?: unknown } | null | undefined
    if (call && typeof call.owner === 'string' && typeof call.route === 'string') return { route: { owner: call.owner, route: call.route, body: call.body } }
    throw new Error('an op is a json, text, bytes or route op')
  })
}

const gameOf = (b: unknown) => {
  const game = (b as { game?: unknown } | null)?.game
  if (typeof game !== 'string') throw new Error('name a game')
  return game
}

const body = (req: http.IncomingMessage) =>
  new Promise<string>((ok, fail) => {
    let s = ''
    req.setEncoding('utf8')
    req.on('data', c => { s += c })
    req.on('end', () => ok(s))
    req.on('error', fail)
  })

// Vite's page client, which every page and every CSS module imports, says in the console that it is
// connecting and opens Vite's socket as it loads, whatever `hmr` says, and logs that it failed to.
// It is served without those two lines, as when opening the socket throws, which the client already
// takes: `socket` is left undefined and nothing is sent. A Vite whose client says or opens it
// otherwise fails the request, so it is never opened unseen.
const UNSAID = ['console.debug("[vite] connecting...");\n', '  socket = setupWebSocket(socketProtocol, socketHost, fallback);\n']
const noSocket: Plugin = {
  name: 'editor-no-vite-socket',
  transform(code, id) {
    if (!id.endsWith('/vite/dist/client/client.mjs')) return
    for (const line of UNSAID) if (!code.includes(line)) throw new Error(`Vite's page client opens its socket other than the editor knows, with no line ${JSON.stringify(line.trim())}: see noSocket in editor/server/server.ts`)
    return UNSAID.reduce((c, line) => c.replace(line, ''), code)
  },
}

// Whether a request comes from the editor's own origin, to the server's own name.
const ours = (req: http.IncomingMessage, port: number) => {
  const names = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]
  if (!names.includes(req.headers.host ?? '')) return false
  const origin = req.headers.origin
  return origin === undefined || names.some(n => origin === `http://${n}`)
}

// `game` is the game `/editor/` opens, when the server is started with one.
export async function start({ root = process.cwd(), port = 5173, game }: { root?: string; port?: number; game?: string } = {}) {
  let watched: ReturnType<typeof disk> | undefined
  // The repo's files, as a request outside any change writes them, and as the change log does.
  const files = new Files(root, (file, data) => watched?.wrote(file, data, false))
  const logged = new Files(root, (file, data) => watched?.wrote(file, data, true))
  const servers = new Servers(root)

  const httpServer = http.createServer()
  // The repo's Vite config, imported here rather than by Vite, which would import it from a copy it
  // writes and takes away again, which `node --watch` takes for a change of the server's code and
  // starts it again, over and over; imported here, a change to it starts the server again on it.
  const vite: ViteDevServer = await createServer({
    ...config,
    configFile: false,
    root: files.root,
    appType: 'mpa',
    // `allowedHosts`: a page asked for by this machine's address on the network, not `localhost`.
    server: { ...config.server, middlewareMode: true, hmr: false, ws: false, allowedHosts: true },
    plugins: [...(config.plugins ?? []), noSocket],
  })
  const routes = new Routes(files.root, vite, {
    resolve: rel => files.resolve(rel),
    read: rel => files.read(rel),
    bytes: rel => files.bytes(rel),
    write: async (rel, data) => { await files.write(rel, data) },
    edit: async (rel, at, value, insert) => { await files.edit(rel, at, value, insert) },
    remove: async rel => { await files.remove(rel) },
    list: dir => files.list(dir),
  })

  const page = await pages()
  // What the games on node say, told to every page on the pages' socket.
  servers.on(e => page.tell('editor:servers', e))
  const changes = new Changes(logged, path.join(files.root, 'node_modules/.cache/editor/changes'), (owner, route, b, f) => routes.call(owner, 'POST', route, new URLSearchParams(), b, f))
  const watch = watched = disk(files.root, vite, page, servers, changes)
  const mcp = editorMcp(page, () => `http://localhost:${(httpServer.address() as { port: number }).port}/editor/`)

  // Every change a page sends, and every undo and redo, applied in the order the server took them,
  // told to every other page as it is applied, and answered to the page in the order it sent them, one
  // it sent malformed among them.
  const answering = new WeakMap<Page, Promise<void>>()
  const take = (event: string, apply: (id: string, data: unknown) => Promise<Answer>) =>
    page.on(event, (data, p) => {
      const id = (data as { id?: unknown } | null)?.id
      const answered: Promise<Answer | { id: null; error: string }> = typeof id === 'string'
        ? (async () => apply(id, data))().catch((e: Error) => ({ id, error: e.message })).then(a => {
          if (!('error' in a)) watch.applied(a, p)
          return a
        })
        : Promise.resolve({ id: null, error: 'a change is named by an id' })
      answering.set(p, (answering.get(p) ?? Promise.resolve()).then(() => answered).then(a => p.send('editor:answer', a)))
    })
  take('editor:change', (id, data) => changes.change(id, opsOf(data)))
  take('editor:undo', id => changes.undo(id))
  take('editor:redo', id => changes.redo(id))

  const api: Record<string, Handler> = {
    'GET /api/files': async q => files.read(q.get('path') ?? ''),
    'PUT /api/files': async (q, text) => {
      if (typeof text !== 'string') throw new Error('a file is written as text')
      await files.write(q.get('path') ?? '', text)
      return {}
    },
    'GET /api/files/list': async q => files.list(q.get('dir') ?? ''),
    'GET /api/games': async () => gamesIn(files.root),
    'GET /api/extensions': async q => extensionsOf(files.root, q.get('game') ?? undefined),
    'GET /api/servers': async () => servers.running(),
    'POST /api/servers/start': async (_q, b) => servers.start(gameOf(b)),
    'POST /api/servers/stop': async (_q, b) => servers.stop(gameOf(b)),
  }

  httpServer.on('request', async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (game !== undefined && (url.pathname === '/editor' || url.pathname === '/editor/') && !url.searchParams.has('game')) {
      res.writeHead(302, { location: `/editor/?game=${encodeURIComponent(game)}` })
      return void res.end()
    }
    if (!url.pathname.startsWith('/api/')) return vite.middlewares(req, res)
    const answer = (status: number, value: unknown) => {
      res.writeHead(status, { 'content-type': typeof value === 'string' ? 'text/plain; charset=utf-8' : 'application/json' })
      res.end(typeof value === 'string' ? value : JSON.stringify(value))
    }
    if (!ours(req, (httpServer.address() as { port: number }).port)) return answer(403, { error: 'not from the editor' })
    try {
      const raw = await body(req)
      const text = req.headers['content-type']?.startsWith('application/json') ? JSON.parse(raw) : raw
      if (url.pathname === '/api/mcp') return await mcp.handle(req, res, text || undefined)
      const handler = api[`${req.method} ${url.pathname}`]
      if (handler) return answer(200, await handler(url.searchParams, text))
      const ext = /^\/api\/x\/([\w-]+)\/(.*)$/.exec(url.pathname)
      if (ext) return answer(200, await routes.call(ext[1], req.method ?? 'GET', ext[2], url.searchParams, text))
      answer(404, { error: `no route ${req.method} ${url.pathname}` })
    } catch (e) {
      if (res.headersSent) return void res.end()
      answer(400, { error: (e as Error).message })
    }
  })

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/api/page' && ours(req, (httpServer.address() as { port: number }).port)) return page.upgrade(req, socket, head)
    socket.destroy()
  })

  // Every interface, IPv4 and IPv6, so another machine on the network plays the games' pages; the
  // `/api` routes and the pages' socket still answer only a request named for this machine's own
  // loopback (`ours`), so nothing off it reads or writes a file. A port another server holds is
  // refused with how to start on another; Vite and the rest made above are closed again first.
  await new Promise<void>((ok, fail) => {
    httpServer.once('error', fail)
    httpServer.listen(port, '::', () => {
      httpServer.off('error', fail)
      ok()
    })
  }).catch(async (e: NodeJS.ErrnoException) => {
    servers.stopAll()
    watch.close()
    await page.close()
    await mcp.close()
    await vite.close()
    if (e.code === 'EADDRINUSE') throw new Error(`port ${port} is in use by another server: start the editor on another with \`yarn editor --port <port>\`, or on any free one with \`yarn editor --port 0\``)
    throw e
  })
  const at = (httpServer.address() as { port: number }).port
  return {
    port: at,
    url: `http://localhost:${at}`,
    // The Vite server within.
    vite,
    async close() {
      servers.stopAll()
      watch.close()
      await page.close()
      await mcp.close()
      await vite.close()
      await new Promise<void>(ok => httpServer.close(() => ok()))
    },
  }
}

// The command line, `[game] [--port <port>]` in either order (`--port=<port>` too): the game `/editor/`
// opens, and the port, else `PORT` from the shell, else 5173. Port 0 is any free one, printed once it
// is open.
export function argsOf(argv: string[]): { game?: string; port: number } {
  let game: string | undefined
  let given: string | undefined = process.env.PORT
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--port') {
      if (argv[i + 1] === undefined) throw new Error('--port takes a port: `yarn editor --port 5174`')
      given = argv[++i]
    } else if (a.startsWith('--port=')) given = a.slice('--port='.length)
    else if (a.startsWith('-')) throw new Error(`no option ${a}: the editor takes \`[game] [--port <port>]\``)
    else if (game === undefined) game = a
    else throw new Error(`one game a server: ${game} and ${a} were both given`)
  }
  const port = given === undefined ? 5173 : Number(given)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`no port ${given}: a port is a whole number from 0 to 65535`)
  return { ...(game === undefined ? {} : { game }), port }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let args: ReturnType<typeof argsOf>
  try {
    args = argsOf(process.argv.slice(2))
  } catch (e) {
    console.error((e as Error).message)
    process.exit(1)
  }
  const { game, port } = args
  if (game !== undefined) {
    const games = await gamesIn(process.cwd())
    const it = games.find(g => g.name === game)
    if (!it?.opens) {
      console.error(it ? `${game} is not on the scenemanager pattern, which the editor opens` : `no game ${game}: the games the editor opens are ${games.filter(g => g.opens).map(g => g.name).join(', ')}`)
      process.exit(1)
    }
  }
  const server = await start({ port, ...(game === undefined ? {} : { game }) }).catch((e: Error) => {
    console.error(e.message)
    process.exit(1)
  })
  console.log(`editor: ${server.url}/editor/${game ? `?game=${game}` : ''}`)
  // `node --watch` stops the server with SIGTERM to start it again on its new code, and ctrl-C with
  // SIGINT: the games it runs on node stop with it, so none is left holding its port. A close that
  // hangs, on a socket that will not end, is cut off after a second.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      setTimeout(() => process.exit(0), 1000).unref()
      void server.close().finally(() => process.exit(0))
    })
  }
}
