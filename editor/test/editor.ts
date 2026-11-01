// An editor for a test, on a game the tests wrote (`written`, beside this file) or one of the repo's:
// its files are the repo's, read from disk, and every change it makes is made by the same change log
// the server keeps (`editor/server/changes.ts`), over the files in memory, so a test reads the bytes
// the server would write without writing the repo; and the page's fetches of the games' files are
// answered from disk, as the dev server answers them, whatever query a url carries. A test on a
// written game, or whose routes write new files into a game's folder or beside a plugin, runs in a
// sandbox (`sandbox`), whose files the change log writes on its disk, so the repo's folders, which
// other tests read as it runs, never hold them. The repo needs no `games/` folder: a clone of core
// has none.
import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { onTestFinished, vi } from 'vitest'
import type { Scene, Sim } from '#engine/engine.ts'
import { Editor, type Loader } from '../editor.ts'
import type { At, FilesApi } from '../files.ts'
import type { Game } from '../games.ts'
import { Changes, type Answer, type Call, type Changed } from '../server/changes.ts'
import { Session } from '../session.ts'
import { Files } from '../server/files.ts'
import { gamesIn } from '../server/listing.ts'
import type { Route, RouteFiles, Router } from '../server/routes.ts'

// Tests run from the repo's root, as the loader's node half reads files from it.
export const repo = process.cwd()
// Where the files the helpers below read and write are: the repo's, or a sandbox's while a test
// runs in one.
let root = repo

// The games the tests write, beside this file: `games/<name>/`, each a game as a person writes one.
// A sandbox holds one at `games/<name>/`, as it holds a game of the repo's, and wins over a game of
// the repo's of the same name, so a test on it boots the same game in any clone.
export const written = path.join(repo, 'editor', 'test', 'games')

// The folders a sandbox holds copies of its own of, as it does the games it names: the homes of the
// repo's code, beside which a route writes a file of its own.
const homes = new Set(['engine', 'editor', 'plugins', 'addons', 'extensions'])

// A folder of its own at `to`, holding a link to each file of `from`, and the same of each folder in
// it.
const mirror = (from: string, to: string) => {
  mkdirSync(to, { recursive: true })
  for (const e of readdirSync(from, { withFileTypes: true })) {
    if (e.isDirectory()) mirror(path.join(from, e.name), path.join(to, e.name))
    else symlinkSync(path.join(from, e.name), path.join(to, e.name))
  }
}

// A repo of the test's own, for the rest of the test, whose path it answers: every file and folder
// of the repo is a link to the real one, but `games/`, and the homes of the code (`homes`) and the
// folder of each game named, each of which is a folder of its own holding a link to each of the real
// one's files, and the same of each folder in it. A game named is the test's own (`written`) where
// there is one by that name, and the repo's otherwise; every other game of the repo is a link. So a
// file a route writes into a game's folder, as a scene added is, or beside a plugin, is the
// sandbox's alone, and a module imported through a link is the real file's, where the link points.
// Every helper here, and the page's fetches, read and write the sandbox's files until the test ends,
// when it goes. Called again in the same test, it adds the games named to the sandbox it made.
export function sandbox(games: string[]): string {
  if (root === repo) {
    const made = mkdtempSync(path.join(tmpdir(), 'editor-sandbox-'))
    onTestFinished(() => {
      root = repo
      rmSync(made, { recursive: true, force: true })
    })
    for (const e of readdirSync(repo, { withFileTypes: true })) {
      if (e.name === 'games') continue
      if (homes.has(e.name)) mirror(path.join(repo, e.name), path.join(made, e.name))
      else symlinkSync(path.join(repo, e.name), path.join(made, e.name))
    }
    mkdirSync(path.join(made, 'games'))
    if (existsSync(path.join(repo, 'games')))
      for (const e of readdirSync(path.join(repo, 'games'), { withFileTypes: true }))
        if (!games.includes(e.name)) symlinkSync(path.join(repo, 'games', e.name), path.join(made, 'games', e.name))
    root = made
  }
  for (const name of games) {
    const at = path.join(root, 'games', name)
    if (lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink()) rmSync(at)
    else if (existsSync(at)) continue
    mirror(existsSync(path.join(written, name)) ? path.join(written, name) : path.join(repo, 'games', name), at)
  }
  return root
}

vi.stubGlobal('fetch', async (url: string | URL) => {
  const at = String(url).replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')
  try {
    return new Response(await readFile(path.join(root, decodeURIComponent(at))))
  } catch {
    return new Response('', { status: 404 })
  }
})

// The repo's files, or the sandbox's, as the editor's server hands them to a route: what a test
// calling a route's function itself hands it. A file of the sandbox that is a link to the repo's own
// file at its path is read through the link, as that file it stands for, which the server's files
// refuse as one out of the sandbox; it is never written through the link, which they refuse too. A
// link anywhere else is refused, as the server refuses a link out of the repo.
export function routeFiles(): RouteFiles {
  const files = new Files(root)
  const linked = async (rel: string) => {
    if (root === repo || !(await lstat(path.join(root, rel)).then(s => s.isSymbolicLink(), () => false))) return false
    return (await realpath(path.join(root, rel)).catch(() => '')) === (await realpath(path.join(repo, rel)).catch(() => undefined))
  }
  return {
    resolve: rel => files.resolve(rel),
    read: async rel => (await linked(rel) ? readFile(path.join(root, rel), 'utf8') : files.read(rel)),
    bytes: async rel => (await linked(rel) ? new Uint8Array(await readFile(path.join(root, rel))) : files.bytes(rel)),
    write: async (rel, data) => { await files.write(rel, data) },
    edit: async (rel, at, value, insert) => { await files.edit(rel, at, value, insert) },
    remove: async rel => { await files.remove(rel) },
    list: dir => files.list(dir),
  }
}

// Every route a test answers (`answer`), by the name of its `<name>.route.ts`: its routes, and every
// call made to them, by a fetch or by a change.
const answering = new Map<string, { table: Map<string, Route>; calls: { route: string; body: unknown }[] }>()

// The routes a `<name>.route.ts` ships (`register`, the function it exports) answered as the
// editor's server answers them, for the rest of the test: a page's call to `/api/x/<name>/<route>`
// runs the route on the repo's files or the sandbox's (`routeFiles`), answering its JSON, or its
// error with a 400, and every other fetch is answered as it was; a change that runs the route
// (`Edits.route`) runs it on the files of the change, as the server does. Answers the list of every
// call made, by route and body.
export function answer(name: string, register: (r: Router) => void) {
  const table = new Map<string, Route>()
  register({ get: (r, f) => table.set(`GET ${r}`, f), post: (r, f) => table.set(`POST ${r}`, f) })
  const calls: { route: string; body: unknown }[] = []
  answering.set(name, { table, calls })
  const was = globalThis.fetch
  vi.stubGlobal('fetch', async (url: string | URL, init?: RequestInit) => {
    const at = new URL(String(url), 'http://x')
    const prefix = `/api/x/${name}/`
    if (!at.pathname.startsWith(prefix)) return was(url, init)
    const route = at.pathname.slice(prefix.length), method = init?.method ?? 'GET'
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body))
    calls.push({ route, body })
    const f = table.get(`${method} ${route}`)
    try {
      if (!f) throw new Error(`${name}.route.ts has no ${method} ${route}`)
      return Response.json((await f({ query: at.searchParams, body, files: routeFiles() })) ?? {})
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 })
    }
  })
  onTestFinished(() => {
    vi.stubGlobal('fetch', was)
    if (answering.get(name)?.table === table) answering.delete(name)
  })
  return calls
}

// A route a change runs, as the server's `Routes` runs it: one the test answers (`answer`), handed the
// change's files.
const routed: Call = async (owner, route, body, files) => {
  const a = answering.get(owner)
  if (!a) throw new Error(`no ${owner}.route.ts`)
  a.calls.push({ route, body })
  const f = a.table.get(`POST ${route}`)
  if (!f) throw new Error(`${owner}.route.ts has no POST ${route}`)
  return (await f({ query: new URLSearchParams(), body, files })) ?? {}
}

// What a test's server holds in memory over the files at its root: the text and the bytes of every
// file written, and every file taken away, by its path from the root.
type Memory = { texts: Map<string, string>; bytes: Map<string, Uint8Array>; gone: Set<string> }

// A file's text, or undefined when its bytes are not UTF-8.
const utf8 = (b: Uint8Array) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b)
  } catch {
    return undefined
  }
}

// The files a test's server holds, as the server's own are: the sandbox's, on its disk, or else the
// repo's, read from the disk and written in memory, so no test writes the repo. A file of the sandbox
// that is a link to the repo's own is read through the link and written as a file of the sandbox's,
// the link taken away first, and one in a folder that is a link to the repo's is refused (`own`), so
// the repo's own is never written. A path that leaves the root, or
// reaches into node_modules or .git, is refused, as the server's files refuse it.
class TestFiles extends Files {
  private mem: Memory
  private sandboxed: boolean
  constructor(at: string, mem: Memory) {
    super(at)
    this.mem = mem
    this.sandboxed = at !== repo
  }

  async resolve(rel: string): Promise<string> {
    const abs = path.resolve(this.root, rel)
    const r = path.relative(this.root, abs)
    if (r === '' || r.startsWith('..') || path.isAbsolute(r) || r.split(path.sep).some(s => s === 'node_modules' || s === '.git'))
      throw new Error(`${rel} is not a file of the repo the editor may touch`)
    return abs
  }
  private key(rel: string) {
    return path.relative(this.root, path.resolve(this.root, rel)).split(path.sep).join('/')
  }
  private forget(key: string) {
    this.mem.texts.delete(key)
    this.mem.bytes.delete(key)
    this.mem.gone.delete(key)
  }

  async read(rel: string): Promise<string> {
    return new TextDecoder().decode(await this.bytes(rel))
  }
  async bytes(rel: string): Promise<Uint8Array> {
    const abs = await this.resolve(rel), key = this.key(rel)
    const text = this.mem.texts.get(key)
    if (text !== undefined) return new TextEncoder().encode(text)
    const held = this.mem.bytes.get(key)
    if (held) return held
    if (this.mem.gone.has(key)) throw Object.assign(new Error(`ENOENT: no such file or directory, open '${abs}'`), { code: 'ENOENT' })
    // Read at once, not behind the disk's queue, which a run of many test files fills.
    return new Uint8Array(readFileSync(abs))
  }
  // A file of the sandbox is written or taken away only in a folder of the sandbox's own: in a folder
  // that is a link to the repo's, a game it does not mirror or a folder beside `games/`, it would be
  // the repo's own file, and is refused, as the server's files refuse a link out of the repo.
  private async own(rel: string) {
    const dir = path.dirname(rel)
    if (dir !== '.') await super.resolve(dir).catch(() => { throw new Error(`${rel} is not a file of the repo the editor may touch`) })
  }
  async write(rel: string, data: string | Uint8Array): Promise<string> {
    const abs = await this.resolve(rel), key = this.key(rel)
    if (this.sandboxed) await this.own(rel)
    this.forget(key)
    if (this.sandboxed) {
      if (await lstat(abs).then(s => s.isSymbolicLink(), () => false)) await rm(abs)
      await mkdir(path.dirname(abs), { recursive: true })
      await writeFile(abs, data)
      return abs
    }
    const text = typeof data === 'string' ? data : utf8(data)
    if (text === undefined) this.mem.bytes.set(key, data as Uint8Array)
    else this.mem.texts.set(key, text)
    return abs
  }
  async remove(rel: string): Promise<string> {
    const abs = await this.resolve(rel), key = this.key(rel)
    if (this.sandboxed) await this.own(rel)
    this.forget(key)
    if (this.sandboxed) await rm(abs, { force: true })
    else this.mem.gone.add(key)
    return abs
  }
  // A folder only memory holds, not yet on the disk, lists what memory holds in it.
  async list(dir: string): Promise<string[]> {
    const key = this.key(dir)
    const held = [...this.mem.texts.keys(), ...this.mem.bytes.keys()].filter(p => p.startsWith(`${key}/`))
    return [...new Set([...(await super.list(dir)), ...held])].filter(p => !this.mem.gone.has(p)).sort()
  }
}

// Where every test's server keeps its change log, taken away as the tests' process ends.
const logs = mkdtempSync(path.join(tmpdir(), 'editor-changes-'))
process.once('exit', () => rmSync(logs, { recursive: true, force: true }))

// The editor's server as a test has it: the repo's files, or the sandbox's (`TestFiles`), and every
// change made to them, made by the change log the server keeps (`Changes`), whose routes are those the
// test answers (`answer`); the games of the repo or the sandbox as the server lists them; the paths
// of every reload the editor asked for and every game it went to, which reload and go nowhere here;
// and the modules the page fetched, which a test names in `ran`. `texts` and `bytes` are what memory
// holds of the repo's files, which a test may set as a file's text; `edits` every JSON value a change
// wrote, as it was sent. `files` are a page's files on it; `page` makes another page's, which `join`
// joins, with the editor on it, to the pages told of every change another page makes, as the server
// tells them (`editor/server/disk.ts`): each the files of its game and of no game, nothing when the
// change wrote neither, and never the page that made it; until `leave`, as its socket closes. Two
// editors handed one are two pages on one server, or one page and the page it reloads to, once the
// first has gone.
export function memoryFiles() {
  const mem: Memory = { texts: new Map(), bytes: new Map(), gone: new Set() }
  const edits: { path: string; at: At; value: unknown; insert: boolean; index?: number }[] = []
  const reloads: string[][] = []
  const opened: string[] = []
  const ran = new Set<string>()
  // The server, made anew on the files at `root` once a test runs in a sandbox, or out of one.
  let server: { root: string; files: TestFiles; changes: Changes } | undefined
  const here = () => {
    if (server?.root !== root) {
      const files = new TestFiles(root, mem)
      server = { root, files, changes: new Changes(files, mkdtempSync(path.join(logs, 'server-')), routed) }
    }
    return server
  }
  // What the server answers a change, an undo or a redo, as the page's files hand it: its refusal
  // thrown.
  const answered = async (asked: Promise<Answer>): Promise<Changed> => {
    const a = await asked
    if ('error' in a) throw new Error(a.error)
    return a
  }
  const read = (p: string) => here().files.read(p)
  // Every page joined, by its files, with its id and the editor on it.
  const pages = new Map<FilesApi, { id: string; ed: Editor }>()
  const gameOf = (p: string) => /^games\/([^/]+)\//.exec(p)?.[1]
  // `a`, applied for the page whose files are `by`, told to every other page joined.
  const tell = (by: FilesApi, a: Changed) => {
    const at = Date.now()
    for (const [f, p] of pages) {
      if (f === by) continue
      const of = Object.entries(a.files).filter(([path]) => gameOf(path) === undefined || gameOf(path) === p.ed.game?.name)
      if (of.length) void p.ed.another({ id: a.id, by: pages.get(by)?.id, version: a.version, files: Object.fromEntries(of), at })
    }
  }
  const page = (): FilesApi => {
    const f: FilesApi = {
      read,
      write: async (p, text) => { await here().files.write(p, text) },
      // The ops as the socket carries them, as JSON.
      change: async (id, ops) => {
        const a = await answered(here().changes.change(id, JSON.parse(JSON.stringify(ops))))
        for (const o of ops) if ('json' in o) edits.push({ path: o.json, at: o.at, value: o.value, insert: o.insert ?? false, ...(o.index !== undefined && { index: o.index }) })
        tell(f, a)
        return a
      },
      undo: async id => {
        const a = await answered(here().changes.undo(id))
        tell(f, a)
        return a
      },
      redo: async id => {
        const a = await answered(here().changes.redo(id))
        tell(f, a)
        return a
      },
      list: dir => here().files.list(dir),
      games: () => gamesIn(root),
      reload: paths => { reloads.push(paths) },
      open: name => { opened.push(name) },
      ran: p => ran.has(p),
    }
    return f
  }
  const join = (files: FilesApi, ed: Editor) => { pages.set(files, { id: crypto.randomUUID(), ed }) }
  const leave = (files: FilesApi) => { pages.delete(files) }
  return { files: page(), page, join, leave, texts: mem.texts, bytes: mem.bytes, edits, read, reloads, opened, ran }
}

// A game of the repo, or the sandbox's, read the way the page reads its game but from disk. A game the
// tests wrote (`written`) is read from a sandbox holding it, made for the test if it runs in none.
export async function game(name: string): Promise<Game> {
  if (existsSync(path.join(written, name))) sandbox([name])
  const file = JSON.parse(readFileSync(path.join(root, 'games', name, `${name}.scene.json`), 'utf8')) as Scene
  const sim = await import(pathToFileURL(path.join(root, 'games', name, `${name}.sim.ts`)).href) as { sim: Sim }
  return {
    name,
    path: `games/${name}/${name}.scene.json`,
    base: pathToFileURL(path.join(root, 'games', name) + '/').href,
    file,
    managed: true,
    sim: async () => sim.sim,
  }
}

// The element a game view draws into, for `session.attach`, or an element a game view already
// draws into, such as the game extension's stage. jsdom draws nothing, so the context of a canvas in
// a stage takes every call and every field and answers each with itself, and reads as the text
// `WebGL 2.0` where a string is asked for, as three.js asks for the version, with an empty log for
// every shader and program and a GPU's precision for floats, so three has nothing to warn about: a
// renderer of either library mounts on it, and the client the view makes runs as a page's does. So
// does a canvas on no page, such as the one PixiJS measures text on, so a game's text is laid out.
// Every other canvas is jsdom's. The canvas's `getContext` is jsdom's again once the test that made
// the last stage has finished.
const stages = new Set<HTMLElement>()
let jsdomContext: HTMLCanvasElement['getContext'] | undefined
export function stage(it: HTMLElement = document.createElement('div')): HTMLElement {
  if (!jsdomContext) {
    const jsdom = jsdomContext = HTMLCanvasElement.prototype.getContext
    // What three asks of a context and would warn about otherwise: a shader's and a program's log,
    // empty as a compiler that found nothing says; a float's precision, a GPU's highest.
    const answers: Record<PropertyKey, unknown> = {
      getShaderInfoLog: () => '',
      getProgramInfoLog: () => '',
      getShaderPrecisionFormat: () => ({ rangeMin: 127, rangeMax: 127, precision: 23 }),
    }
    const context: object = new Proxy(function () {}, {
      get: (_t, k) => (k === Symbol.toPrimitive ? (hint: string) => (hint === 'string' ? 'WebGL 2.0' : 0) : k in answers ? answers[k] : context),
      apply: () => context,
      set: () => true,
    })
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      return !this.isConnected || [...stages].some(s => s.contains(this)) ? context : (jsdom as (...a: unknown[]) => unknown).apply(this, args)
    } as never
  }
  stages.add(it)
  onTestFinished(() => {
    stages.delete(it)
    if (stages.size || !jsdomContext) return
    HTMLCanvasElement.prototype.getContext = jsdomContext
    jsdomContext = undefined
  })
  return it
}

// No clock: the session's clock runs no frame (`Session.after`), so nothing steps or draws but what a
// test asks for, and nothing follows the clock (`Session.onFrame`); put back when the test ends,
// whether it passed or not.
export function noClock() {
  const after = vi.spyOn(Session, 'after').mockImplementation(() => {})
  onTestFinished(() => after.mockRestore())
  return after
}

// An editor on game `name`, or on none, and the extensions the loaders name turned on, a page of its
// own joined to the server `mem` (`memoryFiles`): a new one, or another editor's, as a page reloaded is
// on the server it reloaded from, and two pages open at once are. `files` are the page's own; `gone`
// is the page going, as a reload or a move to another page makes it, after which the server tells it
// nothing.
export async function editor(name?: string, extensions: Record<string, Loader> = {}, mem = memoryFiles()) {
  const files = mem.page()
  const ed = new Editor(files, name === undefined ? undefined : await game(name))
  mem.join(files, ed)
  await ed.load(extensions)
  return { ...mem, ed, files, gone: () => mem.leave(files) }
}
