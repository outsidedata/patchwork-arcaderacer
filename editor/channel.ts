// The editor page's end of the editor pages' socket (`editor/server/pages.ts`), `{ event, data }`
// each way: what each event the server sends is handed to, and sending one. The MCP server's
// questions (`mcp.ts`), what the server tells the page of the changes other pages made, of the disk
// and of Vite (`page.ts`), what the games on node say (`editor:servers`, the Node panel's), and the
// answers to the page's changes to the files (`files.ts`) all come over it, and the page sends its
// changes on it. It is the editor's, `Editor.server`, for an extension to hear what the server says as
// it happens.
import type { Wire } from '#addons/loopback/loopback.addon.ts'
import type { Message } from './server/pages.ts'

export type Channel = {
  // Called with the data of each `event` the server sends, until what it answers is called.
  on(event: string, f: (data: unknown) => void): () => void
  send(event: string, data?: unknown): void
}

// `wire` is the socket to the server: the socket addon's `dial` to `/api/page`.
export function channel(wire: Wire<Message, Message>): Channel {
  const handlers = new Map<string, ((data: unknown) => void)[]>()
  const socket = wire(m => { for (const f of handlers.get(m.event) ?? []) f(m.data) })
  return {
    on: (event, f) => {
      handlers.set(event, [...(handlers.get(event) ?? []), f])
      return () => { handlers.set(event, (handlers.get(event) ?? []).filter(g => g !== f)) }
    },
    send: (event, data) => socket.send({ event, data }),
  }
}
