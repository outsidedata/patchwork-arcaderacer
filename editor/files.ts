// The page's side of the server's files (`editor/server/server.ts`), and of what the page asks of the
// server and of itself: the changes it makes to the files and takes back, the games there are,
// reloading, going to another game, and the modules it has fetched.
//
// A file is read over HTTP. A change is sent on the editor pages' socket (`channel.ts`), which keeps
// the page's messages in order, so the server applies a change, its undo and its redo in the order the
// page sent them (`editor/server/changes.ts`), and answers each, in that order, `editor:answer`. The
// page names each change it sends, and an answer is the one for the oldest change, undo or redo of its
// id the page is still waiting on. What the server tells every other page of the change,
// `editor:changed`, is another event, which the page hears as it hears the disk (`page.ts`).
import type { Channel } from './channel.ts'
import type { At } from './server/files.ts'
import type { Answer, Changed, Op } from './server/changes.ts'

export type { At, Changed, Op }

export type FilesApi = {
  read(path: string): Promise<string>
  // A whole file written outside any change: no undo takes it back, and every page on its game, this
  // one too, is told of it as of a change on the disk (`editor/server/disk.ts`).
  write(path: string, text: string): Promise<void>
  // A change of the files, named `id`, made of `ops`, applied whole or not at all, and answered with
  // the text of every file it wrote; one the server refuses throws its error. `undo` takes it back and
  // `redo` makes it again, answered the same.
  change(id: string, ops: Op[]): Promise<Changed>
  undo(id: string): Promise<Changed>
  redo(id: string): Promise<Changed>
  list(dir: string): Promise<string[]>
  // The games of `games/`, each whether the editor opens it: on the scenemanager pattern.
  games(): Promise<{ name: string; opens: boolean }[]>
  // This page reloaded, for the code at `paths`, which no page takes in place: the server has taken
  // the files in anew as they were written, so the page imports them as they now are.
  reload(paths: string[]): void
  // The page goes to the editor on game `name`, leaving this one's.
  open(name: string): void
  // Whether this page fetched the file at `path` as a module, which it holds as it was until it
  // reloads: one that did not compile too, which it waits on.
  ran(path: string): boolean
}

declare global {
  // The paths from the repo of every module the page has fetched, kept by the page's first script,
  // from before the first module is fetched (`index.html`).
  interface Window { modules: Set<string> }
}

// Which editor page this is, a new one at every load, said on the pages' socket (`main.tsx`): what the
// server tells every other page a change of this page's was made by (`editor/server/disk.ts`).
export const PAGE = crypto.randomUUID()

const ok = async (res: Response) => {
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error)
  return res
}

// The page's files, changed on `server`, the page's end of the pages' socket, which the page dials
// before it makes anything that could change a file (`main.tsx`).
export function http(server: Channel): FilesApi {
  // Every change, undo and redo sent and not yet answered, by its id, the oldest first.
  const waiting = new Map<string, { done(a: Changed): void; fail(e: Error): void }[]>()
  server.on('editor:answer', data => {
    const a = data as Answer
    const w = waiting.get(a.id)
    const first = w?.shift()
    if (!first) return
    if (!w!.length) waiting.delete(a.id)
    if ('error' in a) first.fail(new Error(a.error))
    else first.done(a)
  })
  const ask = (event: string, id: string, ops?: Op[]) => new Promise<Changed>((done, fail) => {
    waiting.set(id, [...(waiting.get(id) ?? []), { done, fail }])
    server.send(event, ops ? { id, ops } : { id })
  })
  return {
    read: async path => (await ok(await fetch(`/api/files?path=${encodeURIComponent(path)}`))).text(),
    write: async (path, text) => { await ok(await fetch(`/api/files?path=${encodeURIComponent(path)}`, { method: 'PUT', body: text })) },
    change: (id, ops) => ask('editor:change', id, ops),
    undo: id => ask('editor:undo', id),
    redo: id => ask('editor:redo', id),
    list: async dir => (await ok(await fetch(`/api/files/list?dir=${encodeURIComponent(dir)}`))).json(),
    games: async () => (await ok(await fetch('/api/games'))).json(),
    reload: () => location.reload(),
    open: name => location.assign(`/editor/?game=${encodeURIComponent(name)}`),
    ran: path => window.modules.has(path),
  }
}
