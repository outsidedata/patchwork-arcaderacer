// Backend routes an extension ships: `<name>.route.ts` beside its `<name>.extension.tsx`, exporting
// a function named `<name>` that is handed a `Router` and adds routes to it. They are served under
// `/api/x/<name>/<route>`, answer JSON, and are loaded through Vite, so a change to one is used by
// the next request without restarting the server.
//
// A route touches the repo through the files it is handed: every path is from the repo and stays
// inside it, as the file routes' do. Asked by a plain request (`routeOf` in the page), it is handed
// `files`, the server's own, and writes outside any change: no undo takes it back, and every page on
// the file's game, the one that asked too, is told of each file it wrote as of a change on the disk
// (`disk.ts`), as the simulator's run is. Run by a change (`changes.ts`, `Edits.route` in the page),
// it is handed the change's files instead, so every file it writes is part of the change, which one
// undo takes back, and a route that throws part-way leaves nothing written. A route never works out
// how to take itself back: the change log does. So an operation that writes several files, a kind or
// a scene made, is one route, and so one change, whole or not at all. A JSON value it sets is written
// as the editor writes one (`edit`), so the file's diff is that value.
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import type { ViteDevServer } from 'vite'
import type { At } from './files.ts'

// `body` is the request's JSON, or its text: whatever a page sent, which the route checks.
export type Request = { query: URLSearchParams; body: unknown; files: RouteFiles }
export type RouteFiles = {
  // The absolute path of a path from the repo, refused when it leaves the repo.
  resolve(rel: string): Promise<string>
  read(rel: string): Promise<string>
  // A file's bytes, for a file that is not text.
  bytes(rel: string): Promise<Uint8Array>
  write(rel: string, data: string | Uint8Array): Promise<void>
  // One JSON value of a file set at `at`, taken out when `value` is undefined, or with `insert` put
  // into the list at `at`'s last index, -1 for its end, as `files.ts` `edit` writes one: only that
  // value's bytes change. A change keeps it as the value it is, which its undo takes back value by
  // value where the file has changed since, as it does the editor's own.
  edit(rel: string, at: At, value: unknown, insert?: boolean): Promise<void>
  // Takes a file away; a file that is not there is left not there.
  remove(rel: string): Promise<void>
  list(dir: string): Promise<string[]>
}
export type Route = (req: Request) => unknown
export type Router = { get(route: string, f: Route): void; post(route: string, f: Route): void }

const HOMES = ['extensions', 'plugins', 'addons', 'games']

export class Routes {
  private root: string
  private vite: ViteDevServer
  private files: RouteFiles
  private tables = new WeakMap<object, Map<string, Route>>()
  constructor(root: string, vite: ViteDevServer, files: RouteFiles) {
    this.root = root
    this.vite = vite
    this.files = files
  }

  // The file of the route module `name`, found by its name.
  async find(name: string): Promise<string> {
    const found: string[] = []
    const walk = async (dir: string) => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) await walk(p)
        else if (e.name === `${name}.route.ts`) found.push(p)
      }
    }
    for (const home of HOMES) await walk(path.join(this.root, home))
    if (found.length !== 1) throw new Error(found.length ? `${found.length} files named ${name}.route.ts` : `no ${name}.route.ts`)
    return found[0]
  }

  // Runs a route, handed `files` to touch the repo through: the server's own, or those of the change it
  // runs inside (`changes.ts`), which every file it writes joins.
  async call(name: string, method: string, route: string, query: URLSearchParams, body: unknown, files = this.files) {
    const file = await this.find(name)
    const mod = await this.vite.ssrLoadModule(file)
    let table = this.tables.get(mod)
    if (!table) {
      if (typeof mod[name] !== 'function') throw new Error(`${name}.route.ts exports no function ${name}`)
      const made = new Map<string, Route>()
      mod[name]({ get: (r: string, f: Route) => made.set(`GET ${r}`, f), post: (r: string, f: Route) => made.set(`POST ${r}`, f) } satisfies Router)
      this.tables.set(mod, made)
      table = made
    }
    const f = table.get(`${method} ${route}`)
    if (!f) throw new Error(`${name}.route.ts has no ${method} ${route}`)
    return (await f({ query, body, files })) ?? {}
  }
}
