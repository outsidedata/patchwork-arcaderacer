// The editor pages' socket: `/api/page` on the editor's server, the socket addon's wire on a server
// of the editor's own (`upgrades`), which each editor page dials (`main.tsx`). Each end says
// `{ event, data }` to the other. A page says first which page it is, the game it has open and when
// it began to load (`editor:page { id, game, since }`): the id, which every other page is told a
// change it made by (`by`); the game, so it is told only of its own game's files; and `since`, so it
// is told nothing of what happened before it began to load, which it read as it was then
// (`disk.ts`). A page is told nothing before it has said, and is told then what it missed
// (`disk.ts`). The MCP server asks the page the user is in over it (`mcp.ts`), and the server tells
// every page the changes other pages made, what changed on the disk, what Vite asks of it and what the
// games on node say (`tell`). A page sends its changes to the files on it (`changes.ts`): a page's
// messages arrive in the order it sent them, and each is handed to its handlers as it arrives, so its
// changes are applied in that order. It is the editor's own: the server runs Vite with no HMR and no
// socket of its own.
import { upgrades } from '#addons/socket/socket.addon.ts'

export type Message = { event: string; data?: unknown }
// A page on the socket: whether it has said which page it is, and what it said, the time `since` by
// the machine's clock; what is sent to it; and what is called once it has gone.
export type Page = { said: boolean; id?: string; game?: string; since?: number; send(event: string, data?: unknown): void; onClose(f: () => void): void }
export type Pages = Awaited<ReturnType<typeof pages>>

export async function pages() {
  const handlers = new Map<string, ((data: unknown, page: Page) => void)[]>()
  const open = new Set<Page>()
  const wire = await upgrades<Message, Message>(send => {
    const gone: (() => void)[] = []
    const page: Page = { said: false, send: (event, data) => send({ event, data }), onClose: f => { gone.push(f) } }
    open.add(page)
    return {
      take: m => {
        if (m.event === 'editor:page') {
          // What a page says of itself comes from outside the server, and is kept only as strings and
          // a finite number.
          const said = (m.data ?? {}) as { id?: unknown; game?: unknown; since?: unknown }
          page.id = typeof said.id === 'string' ? said.id : undefined
          page.game = typeof said.game === 'string' ? said.game : undefined
          page.since = typeof said.since === 'number' && Number.isFinite(said.since) ? said.since : undefined
          page.said = true
        }
        for (const h of handlers.get(m.event) ?? []) h(m.data, page)
      },
      close: () => {
        open.delete(page)
        for (const f of gone) f()
      },
    }
  })
  return {
    // Called with each `event` a page sends, its data and the page.
    on(event: string, f: (data: unknown, page: Page) => void) {
      handlers.set(event, [...(handlers.get(event) ?? []), f])
    },
    // `event` sent to every page open that has said which page it is and that `to` says yes to, by
    // default every one.
    tell(event: string, data: unknown, to: (page: Page) => boolean = () => true) {
      for (const p of open) if (p.said && to(p)) p.send(event, data)
    },
    // A request to upgrade to the socket, which the server has found is an editor page's.
    upgrade: wire.upgrade,
    close: wire.close,
  }
}
