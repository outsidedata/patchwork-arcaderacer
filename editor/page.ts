// The editor page's life across its loads (`main.tsx`): what it does with what the server tells it
// on the editor pages' socket (`hear`), the session it keeps across a reload (`keep`), and how it
// waits for a server that has gone (`awaitServer`).
import type { Channel } from './channel.ts'
import type { Editor, Remembered } from './editor.ts'
import type { Applied, Notice } from './server/disk.ts'

// The page joins the editor pages' socket: it says which page it is, the game its url names and when
// it began to load, so the server tells it of what it was not there to hear since then, and nothing
// from before, which it read as it was (`editor/server/disk.ts`). It takes in each change another page
// made (`Editor.another`) and what changed on the disk (`Editor.disk`); a page on a game it could not
// open, one there is not yet or whose manager scene does not read, reloads on any change to that
// game's files instead. It reloads when Vite asks, and writes Vite's errors to the console. Every
// handler is in place before the page says which it is.
export function hear(ed: Editor, socket: Channel, page: { id: string; name: string | undefined; opened: boolean; since: number }) {
  // A file of the game the page could not open.
  const unopened = (path: string) => !page.opened && page.name !== undefined && path.startsWith(`games/${page.name}/`)
  socket.on('editor:reload', data => {
    ed.info(`reloading: ${(data as { why: string }).why}`)
    void ed.reloadPage([])
  })
  socket.on('editor:changed', data => {
    const n = data as Applied
    const of = Object.keys(n.files).filter(unopened)
    if (of.length) return void ed.reloadPage(of)
    void ed.another(n)
  })
  socket.on('editor:disk', data => {
    const n = data as Notice
    if (unopened(n.path)) return void ed.reloadPage([n.path])
    void ed.disk(n)
  })
  socket.on('editor:error', data => {
    const e = data as { message: string; stack?: string }
    ed.error(e.message, e.stack)
  })
  socket.send('editor:page', { id: page.id, game: page.name, since: page.since })
}

// The session of the page's game a reload interrupted, put back from `storage` under `key`, or else
// the game opened when there is one; and the session saved there whenever the page goes, so a reload,
// for code the editor wrote or code changed on the disk, comes back to the same step. It is not saved
// while what was saved is being put back, so a page that goes then, as one reloaded at once can,
// leaves it as it was. One that could not be put back, its game's code broken say, is said in the
// console and kept for the reload that comes with the fix, until a game opened here since is saved
// over it: a page with no session open saves nothing.
export async function keep(ed: Editor, storage: Storage, key: string, game: boolean) {
  let restoring = true
  addEventListener('pagehide', () => {
    if (restoring) return
    const s = ed.save()
    if (s) storage.setItem(key, JSON.stringify(s))
  })
  const saved = storage.getItem(key)
  try {
    if (saved) await ed.restore(JSON.parse(saved) as Remembered)
    else if (game) await ed.open()
  } catch (e) {
    ed.error(`could not open ${ed.game?.name ?? 'the game'}: ${(e as Error).message}`, (e as Error).stack)
  } finally {
    restoring = false
  }
}

// How often the page asks whether its server is back.
export const ASK = 500

// What the page does when its server is gone, or not yet there, as while it starts again on its own
// new code: says so once (`say`), asks every `ASK` ms whether it is back, and reloads on what it
// serves once it answers. Called again while it waits, as the socket closes and a request fails, it
// waits once.
export function awaitServer(say: (message: string) => void, reload: () => void) {
  let waiting = false
  return async () => {
    if (waiting) return
    waiting = true
    say('the editor\'s server is gone: the page reloads once it answers again')
    for (;;) {
      await new Promise(r => setTimeout(r, ASK))
      if (await fetch('/api/games').then(r => r.ok, () => false)) return reload()
    }
  }
}
