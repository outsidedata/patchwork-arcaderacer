// The open game on node, as it runs on its own: the editor's server starts
// `games/<game>/<game>.server.ts`, and each tab of its `client.html` is a seat on it. What it prints
// is shown here, and it starts again whenever a file it runs changes.
//
// What the server says of its games on node, the ones running and each line one prints, comes on the
// editor pages' socket (`editor:servers` on `Editor.server`), which the editor hears from the first
// time the panel or a command asks until the extension turns off (`feedOf`, closed by
// `Editor.onDrop`), the games running read then from `/api/servers`: so the panel and a call read the
// same lines, and a line printed while the panel is closed is there when it opens. Run on node and
// Stop post to the server and take the games running it answers (`serve`).
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here:
//   servers.state  whether the open game runs on node, on which port, and the lines it printed;
//   servers.start  Run on node;
//   servers.stop   Stop;
//   servers.seat   Open a seat: `client.html` in a new tab, a seat on the game on node.
import { z } from 'zod'
import { fetched, posted, type Editor } from '#editor/editor.ts'
import { Servers } from './servers.components.tsx'

export type Running = { game: string; port: number }
type Event = { type: 'log'; game: string; line: string } | { type: 'servers'; running: Running[] }
export type Line = { game: string; line: string }

// How many lines of every game the feed keeps, the last ones.
const LINES = 500
// How long `servers.state` waits for the server to say which games run, in milliseconds: it answers
// at once, so a server that has said nothing by then is not answering.
const HEARD = 5000

// The server's events as the editor has heard them: the games running, the last lines printed, and
// `heard`, which settles once the server has said which games run, as it answers first thing, or has
// not answered. `version` counts every change, which the panel is drawn again for.
export type Feed = {
  running: Running[]
  lines: Line[]
  heard: Promise<void>
  version: number
  subscribe(f: () => void): () => void
  set(running: Running[]): void
  // Stops hearing the events: the next ask hears them anew.
  close(): void
}

const feeds = new WeakMap<Editor, Feed>()
// The feed of `ed`, heard from now on the first time anything asks for it. When the server cannot be
// reached before it says which games run, the feed is let go, so the next ask tries again.
export function feedOf(ed: Editor): Feed {
  const had = feeds.get(ed)
  if (had) return had
  const listeners = new Set<() => void>()
  let ok!: () => void, no!: (e: Error) => void
  const feed: Feed = {
    running: [],
    lines: [],
    heard: new Promise<void>((y, n) => { ok = y; no = n }),
    version: 0,
    subscribe(f) {
      listeners.add(f)
      return () => { listeners.delete(f) }
    },
    set(running) {
      feed.running = running
      tell()
    },
    close() {
      off()
      if (feeds.get(ed) === feed) feeds.delete(ed)
    },
  }
  const tell = () => {
    feed.version++
    for (const f of listeners) f()
  }
  feed.heard.catch(() => {})
  if (!ed.server) throw new Error('the editor\'s page has no socket to its server to hear the games on node on')
  const off = ed.server.on('editor:servers', data => {
    const e = data as Event
    if (e.type === 'servers') feed.set(e.running)
    else {
      feed.lines = [...feed.lines.slice(-(LINES - 1)), { game: e.game, line: e.line }]
      tell()
    }
  })
  feeds.set(ed, feed)
  // Heard from before it is asked, so nothing said meanwhile is missed.
  fetched<Running[]>('/api/servers').then(running => {
    ok()
    feed.set(running)
  }, () => {
    feed.close()
    no(new Error('the editor\'s server does not answer /api/servers'))
    // The panel is drawn again, and asks for the feed anew.
    tell()
  })
  return feed
}

// Starts the open game on node, or stops it, as Run on node and Stop do: the server answers the
// games running, which the feed takes.
export async function serve(ed: Editor, route: 'start' | 'stop') {
  const game = ed.need().game.name
  const feed = feedOf(ed)
  feed.set(await posted<Running[]>(`/api/servers/${route}`, { game }))
  return stateOf(ed)
}

// The url of a seat on a game on node, which Open a seat opens in a new tab. A browser opens a tab
// only for a click or a key, so one a call asks for may be refused, and is said to be.
export const seatOf = (game: string) => `/games/${game}/client.html`
export function openSeat(ed: Editor) {
  const game = ed.need().game.name
  if (!feedOf(ed).running.some(r => r.game === game)) throw new Error(`${game} does not run on node: start it with servers.start`)
  if (!window.open(seatOf(game), '_blank')) throw new Error(`the browser opened no tab for ${seatOf(game)}, as it opens one only for a click or a key: press Open a seat in the Node panel`)
  return { url: seatOf(game) }
}

// The open game on node as a call is answered it: whether it runs, on which port, and the lines it
// printed that the feed keeps.
function stateOf(ed: Editor) {
  const game = ed.need().game.name
  const feed = feedOf(ed)
  const mine = feed.running.find(r => r.game === game)
  return { game, running: !!mine, ...(mine && { port: mine.port, seat: seatOf(game) }), lines: feed.lines.filter(l => l.game === game).map(l => l.line) }
}

export function servers(ed: Editor) {
  const open = () => !!ed.session
  ed.panel({ id: 'servers', title: 'Node', area: 'bottom', component: Servers })
  ed.onDrop(() => feeds.get(ed)?.close())
  ed.command({
    id: 'servers.state',
    title: 'Node: state',
    input: z.object({}).describe(`Whether the open game runs on node, as games/<game>/<game>.server.ts, on which port and at which seat's url, and the last lines it printed, as the Node panel shows them (at most ${LINES} of every game's, read since the page first asked).`),
    run: async () => {
      ed.need()
      let late: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        feedOf(ed).heard,
        new Promise<never>((_, no) => { late = setTimeout(() => no(new Error(`the editor's server did not say which games run on node within ${HEARD / 1000} s`)), HEARD) }),
      ]).finally(() => clearTimeout(late))
      return stateOf(ed)
    },
  })
  ed.command({ id: 'servers.start', title: 'Run the open game on node', enabled: open, run: () => serve(ed, 'start') })
  ed.command({ id: 'servers.stop', title: 'Stop the open game on node', enabled: open, run: () => serve(ed, 'stop') })
  ed.command({ id: 'servers.seat', title: 'Open a seat on the game on node in a new tab', enabled: open, run: () => openSeat(ed) })
}
