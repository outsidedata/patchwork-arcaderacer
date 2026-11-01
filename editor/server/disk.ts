// What happens on the disk and in the change log, and what the editor's pages are told of it. Vite
// runs with no HMR (`server.ts`), so nothing else tells a page that a file changed, and a page holds
// every module it has imported as it was until it reloads.
//
// Every change, undo and redo the change log applies (`changes.ts`) is told to every page but the one
// that sent it, which takes it in from its answer: `editor:changed { id, by, version, files, at }`
// (`Applied`), `by` the id of the page that sent it, `at` when it was applied, by the machine's clock,
// and `files` each file it wrote with its text now, as the answer has them. A page is told the files of
// its own game and of no game, and nothing of a change that wrote neither (`applied`).
//
// Every file the server writes, for the change log or for a request outside any change (a whole file
// put, `PUT /api/files`, or a route asked by a plain request, the simulator's run say), is taken in anew
// by Vite at once, so a page that reloads right after reads it as written; and it is kept by a hash of
// what it holds, when it was written and whether the change log wrote it (`wrote`), until the watcher
// sees the file hold something else. Vite's watcher sees every change to the repo, the server's and
// anyone else's: a person's text editor, an LLM writing files, git; and may see one more than once.
// Vite is made to take a file in anew as the watcher sees it change, before anything else is done of
// it. Once a file has been still for `STILL` ms:
//   - a file as it was when it was last still, by its inode, its size and when it was last written,
//     is no change: the watcher saw it again, as it may for one write, or after it missed some under
//     load, and it is told and counted nothing more;
//   - a file that holds what the change log last wrote there is the log's own, which the pages were
//     told of as `editor:changed`, and is told nothing more;
//   - any other change is one no change made: it is counted (`Changes.outside`) and told to every page
//     with its game open, or every page for a file of no game, as `editor:disk { path, added, gone }`,
//     the page whose plain request wrote it too, which takes it in as it takes in any other; a write of
//     the server's once, however often the watcher sees it. A page that began to load after the file
//     came to be as it now is read it so, and is not told: one the server wrote came to be so when it
//     was written, which is before a page that reloads for that write began to load; any other change
//     when the watcher saw it.
// A page decides for itself whether it holds a file as a module, and reloads for it (`Editor`). A game
// running on node starts again on a change to a file it may run, whoever made it, the change log too:
// its own game's, or the shared code every game runs; one that will not start again says why in its
// log (`scripts/servers.ts`).
//
// What Vite would say to a page over its own socket, which it has none of here, is said on the
// editor's: a reload (`editor:reload`), which Vite asks for when it has bundled a dependency it found
// anew, so every module that imports one is read again, or when its config changed; and an error
// (`editor:error`), a module that does not compile, to the pages of its game, or every page for a
// module of no game.
//
// A page is told nothing before it has said which page it is (`pages.ts`). As it says so, it says
// when it began to load (`editor:page { since }`, the page's own time origin, on the machine's
// clock), and is told then everything said since then that was for it (`Told`): a change it may have
// read the files before, a reload Vite asked for as its own imports set one off. Whatever was said is
// kept for `KEPT` ms.
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { HMRPayload, ViteDevServer } from 'vite'
import type { Changed, Changes } from './changes.ts'
import type { Page, Pages } from './pages.ts'
import { gameOf, restarts, type Servers } from '#scripts/servers.ts'

export { GATHER } from '#scripts/servers.ts'
// How long a file is still before the pages are told of it: a write lands as one or more changes
// within a few ms, and a page is told of the file once, as it ends up.
export const STILL = 100
// How long what the pages were told is kept, for a page that is loading: far longer than any page
// takes to load and join.
const KEPT = 120_000

export type Notice = { path: string; added: boolean; gone: boolean }
// A change, undo or redo the change log applied, as every page but the one that sent it is told it.
export type Applied = { id: string; by?: string; version: number; files: Record<string, string | null>; at: number }
// Something said to the pages: when what it says of happened, by the machine's clock, and which
// pages it is for.
type Told = { at: number; event: string; data: unknown; to(page: Page): boolean }

const hash = (data: string | Uint8Array | null) => (data === null ? null : createHash('sha1').update(data).digest('hex'))
// A file by its path from the repo, as a page names it.
const relOf = (root: string, file: string) => path.relative(root, file).split(path.sep).join('/')
// What no page is told of: what is out of the repo, and what the editor never touches.
const outside = (rel: string) => rel === '' || rel.startsWith('..') || path.isAbsolute(rel) || /(^|\/)(node_modules|\.git)(\/|$)/.test(rel)
// The pages a file is told to: those on its game, or every page for a file of no game.
const onGame = (rel: string) => {
  const game = gameOf(rel)
  return (p: Page) => game === undefined || p.game === game
}

export function disk(root: string, vite: ViteDevServer, pages: Pages, servers: Servers, changes: Changes) {
  const written = new Map<string, { hash: string | null; at: number; log: boolean; told?: boolean }>()
  const waiting = new Map<string, { timer: ReturnType<typeof setTimeout>; added: boolean; at: number }>()

  // Said to the pages `to` says yes to that began to load before `at`, and kept for one that is
  // loading.
  let told: Told[] = []
  const tell = (event: string, data: unknown, to: (page: Page) => boolean, at = Date.now()) => {
    told = told.filter(t => t.at > Date.now() - KEPT)
    told.push({ at, event, data, to })
    pages.tell(event, data, p => (p.since === undefined || at > p.since) && to(p))
  }
  pages.on('editor:page', (_data, page) => {
    const since = page.since
    if (since === undefined) return
    for (const t of told) if (t.at > since && t.to(page)) page.send(t.event, t.data)
  })

  // The games on node to start again, gathered.
  const restart = restarts(servers)

  // What each file was when it last settled: its inode, size and when it was last written, or null
  // once it was gone.
  const found = new Map<string, string | null>()

  // A file still at last, seen to change at `at`: which game on node starts again, and who is told of
  // it. A file found as it was when it last settled is no change: the watcher saw it again, as it may
  // for one write, or after it missed some under load, and nothing more is done of it. Only a file the
  // server wrote is read, to know whether it holds what the server wrote; the rest are only looked
  // for. The server's write is let go of once the file is seen to hold something else: what is
  // written there after is someone else's.
  const settle = async (rel: string, added: boolean, at: number) => {
    const file = path.join(root, rel)
    const had = written.get(rel)
    const now = await stat(file).then(s => (s.isFile() ? `${s.ino} ${s.size} ${s.mtimeMs}` : null), () => null)
    if (found.has(rel) && found.get(rel) === now) return
    found.set(rel, now)
    const there = had && now !== null ? await readFile(file).then(d => d, () => null) : null
    const gone = now === null || (had !== undefined && there === null)
    const ours = had !== undefined && had.hash === hash(gone ? null : there) ? had : undefined
    if (!ours && written.get(rel) === had) written.delete(rel)
    restart.changed(rel)
    if (ours?.log || ours?.told) return
    if (ours) ours.told = true
    changes.outside()
    const notice: Notice = { path: rel, added: added && !gone, gone }
    tell('editor:disk', notice, onGame(rel), ours?.at ?? at)
  }

  vite.watcher.on('all', (event, file) => {
    if (event !== 'add' && event !== 'change' && event !== 'unlink') return
    const rel = relOf(root, file)
    if (outside(rel)) return
    // Taken in anew before the change is dated, so a page that began to load after it reads it as it
    // now is.
    vite.moduleGraph.onFileChange(file)
    const was = waiting.get(rel)
    clearTimeout(was?.timer)
    const added = (was?.added ?? false) || event === 'add'
    const at = Date.now()
    waiting.set(rel, {
      added,
      at,
      timer: setTimeout(() => {
        waiting.delete(rel)
        void settle(rel, added, at)
      }, STILL),
    })
  })

  const send = vite.hot.send.bind(vite.hot) as (payload: HMRPayload | string, data?: unknown) => void
  vite.hot.send = ((payload: HMRPayload | string, data?: unknown) => {
    if (typeof payload === 'string') return send(payload, data)
    if (payload.type === 'full-reload') {
      // Vite names the file when one set it off; else it has bundled its dependencies again, or its
      // config changed, which its payload does not tell apart.
      tell('editor:reload', { why: payload.triggeredBy ? `${relOf(root, payload.triggeredBy)} changed` : 'Vite asked for it: its dependencies bundled again, or its config changed' }, () => true)
    }
    if (payload.type === 'error') {
      const e = payload.err
      const rel = e.id ? relOf(root, e.id.split('?')[0]) : undefined
      tell('editor:error', { message: `${e.plugin ? `[${e.plugin}] ` : ''}${rel ? `${rel}: ` : ''}${e.message}`, stack: [e.frame, e.stack].filter(Boolean).join('\n') }, rel ? onGame(rel) : () => true)
    }
    send(payload)
  }) as typeof vite.hot.send

  return {
    // The server wrote the file at `file`, or took it away, for the change log (`log`) or outside any
    // change: Vite takes it in anew, and the write is kept to know it by, with when it was made.
    wrote(file: string, data: string | Uint8Array | null, log: boolean) {
      vite.moduleGraph.onFileChange(file)
      written.set(relOf(root, file), { hash: hash(data), at: Date.now(), log })
    },
    // A change, undo or redo the change log applied, answered `a`, told to every page but `by`, the
    // page that sent it: each is told the files of its own game and of no game, and nothing when the
    // change wrote neither.
    applied(a: Changed, by: Page) {
      const at = Date.now()
      const files = Object.entries(a.files)
      const shared = files.some(([rel]) => gameOf(rel) === undefined)
      const games = new Set(files.flatMap(([rel]) => gameOf(rel) ?? []))
      const notice = (game: string | undefined): Applied => ({
        id: a.id, by: by.id, version: a.version, at,
        files: Object.fromEntries(files.filter(([rel]) => gameOf(rel) === undefined || gameOf(rel) === game)),
      })
      for (const game of games) tell('editor:changed', notice(game), p => p !== by && p.game === game, at)
      if (shared) tell('editor:changed', notice(undefined), p => p !== by && (p.game === undefined || !games.has(p.game)), at)
    },
    close() {
      for (const w of waiting.values()) clearTimeout(w.timer)
      waiting.clear()
      restart.close()
    },
  }
}
