// The editor's MCP server, on the editor's own server at `/api/mcp` (Streamable HTTP): every command
// of the editor page the user is in is a tool an LLM calls (`editor/mcp.ts`, the page's side). No
// process of its own: the page is asked over the editor pages' socket (`pages.ts`, `/api/page`),
// and answers the same way.
//
// Each client that initializes is a session of its own, so the tools changing reaches every one of
// them (`notifications/tools/list_changed`): when a page says its commands changed (`editor:tools`),
// and when another page becomes the one asked. The page asked is the last to say `editor:here`, as it
// loads and as its window takes the focus. `tools/list` and `tools/call` are handed to it and
// answered with its answer, with no time limit of their own, since a call can rebuild a game. With no
// page, the list is empty and a call fails naming the page to open; a call whose page's socket closes
// before it answers, as a reload closes it, fails saying so. A command that throws is a call that
// fails, `isError`, with its message.
import { randomUUID } from 'node:crypto'
import type http from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, isInitializeRequest, ListToolsRequestSchema, type CallToolResult, type Tool } from '@modelcontextprotocol/sdk/types.js'
import type { Page, Pages } from './pages.ts'

type Answer = { call: number; tools?: Tool[]; content?: CallToolResult['content']; error?: string }

// `editor` is the editor page's url, which a failure with no page names.
export function editorMcp(pages: Pages, editor: () => string) {
  let page: Page | undefined
  let next = 0
  const waiting = new Map<number, { page: Page; ok(a: Answer): void; no(e: Error): void }>()
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: Server }>()
  const changed = () => { for (const s of sessions.values()) void s.server.sendToolListChanged().catch(() => {}) }

  // A page, watched once: when its socket closes, it is asked nothing more and its calls fail.
  const watched = new WeakSet<Page>()
  const watch = (client: Page) => {
    if (watched.has(client)) return
    watched.add(client)
    client.onClose(() => {
      if (page === client) page = undefined
      for (const [call, w] of waiting) if (w.page === client) {
        waiting.delete(call)
        w.no(new Error('the editor page closed before it answered: it reloaded, or was closed'))
      }
    })
  }
  pages.on('editor:here', (_data, client) => {
    watch(client)
    if (page === client) return
    page = client
    changed()
  })
  pages.on('editor:tools', (_data, client) => { if (client === page) changed() })
  pages.on('editor:result', data => {
    const a = data as Answer
    const w = waiting.get(a.call)
    if (!w) return
    waiting.delete(a.call)
    if (a.error !== undefined) w.no(new Error(a.error))
    else w.ok(a)
  })

  // Asks the page, and answers its answer.
  const ask = (event: string, data: Record<string, unknown>) => new Promise<Answer>((ok, no) => {
    if (!page) return no(new Error(`no editor page is open: open ${editor()}`))
    const call = next++
    waiting.set(call, { page, ok, no })
    page.send(event, { call, ...data })
  })

  const serverOf = () => {
    const server = new Server({ name: 'editor', version: '0.0.0' }, { capabilities: { tools: { listChanged: true } } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: page ? (await ask('editor:list', {})).tools ?? [] : [] }))
    server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
      try {
        return { content: (await ask('editor:call', { name: req.params.name, args: req.params.arguments ?? {} })).content ?? [] }
      } catch (e) {
        return { content: [{ type: 'text', text: (e as Error).message }], isError: true }
      }
    })
    return server
  }

  const refuse = (res: http.ServerResponse, status: number, message: string) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }))
  }

  // A request to `/api/mcp`: one of a session's, or the first of a new one.
  async function handle(req: http.IncomingMessage, res: http.ServerResponse, body: unknown) {
    const id = req.headers['mcp-session-id']
    if (typeof id === 'string') {
      const had = sessions.get(id)
      if (!had) return refuse(res, 404, `no session ${id}`)
      return had.transport.handleRequest(req, res, body)
    }
    if (req.method !== 'POST' || !isInitializeRequest(body)) return refuse(res, 400, 'no session: initialize first')
    const server = serverOf()
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: sid => { sessions.set(sid, { transport, server }) },
    })
    transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId) }
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  }

  return {
    handle,
    async close() { for (const s of [...sessions.values()]) await s.server.close() },
  }
}
