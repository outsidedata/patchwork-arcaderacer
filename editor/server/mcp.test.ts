// The editor's MCP server on the real server, spoken to by the MCP SDK's own client, as Claude Code
// speaks to it; the editor page is a stand-in on the editor pages' socket, speaking its events as
// `editor/mcp.ts` does. With no page the list is empty and a call fails naming the page to open; a
// page that says it is here is asked, and every session hears that the tools changed; a list the
// page cannot make fails with its error; a page that closes before it answers fails the call; a
// request from another origin, or with no session, is refused; and the socket is upgraded to only
// from the editor's own origin, at its own path.
import { afterAll, beforeAll, expect, onTestFinished, test } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import http from 'node:http'
import { dial } from '#addons/socket/socket.addon.ts'
import type { Message } from './pages.ts'
import { start } from './server.ts'

let server: Awaited<ReturnType<typeof start>>
beforeAll(async () => { server = await start({ port: 0 }) })
afterAll(async () => { await server.close() })

// A client of the MCP server, and each time it has heard that the tools changed.
async function connect() {
  const client = new Client({ name: 'test', version: '0.0.0' })
  const heard: number[] = []
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => { heard.push(Date.now()) })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/api/mcp`)))
  onTestFinished(() => client.close())
  return { client, heard }
}

// A page on the editor pages' socket, dialled as the editor page dials it, answering each event the
// server sends it with `answer`'s reply, or with nothing when `answer` answers undefined.
function page(answer: (event: string, data: { call: number; name?: string; args?: unknown }) => Record<string, unknown> | undefined) {
  const asked: string[] = []
  const socket = dial<Message, Message>(`${server.url.replace('http:', 'ws:')}/api/page`)(m => {
    asked.push(m.event)
    const data = m.data as { call: number }
    const reply = answer(m.event, data)
    if (reply) socket.send({ event: 'editor:result', data: { call: data.call, ...reply } })
  })
  const send = (event: string) => socket.send({ event })
  onTestFinished(() => socket.close())
  return { asked, send, close: socket.close }
}

const until = async (f: () => boolean) => { for (let i = 0; i < 200 && !f(); i++) await new Promise(r => setTimeout(r, 10)) }
const TOOL = { name: 'sprites_read', description: 'A frame\'s pixels', inputSchema: { type: 'object' as const, properties: { frame: { type: 'string' } } } }

test('with no page open the list is empty and a call fails naming the page to open', async () => {
  const { client } = await connect()
  expect((await client.listTools()).tools).toEqual([])
  const got = await client.callTool({ name: 'sprites_read', arguments: {} })
  expect(got).toMatchObject({ isError: true, content: [{ type: 'text', text: `no editor page is open: open ${server.url}/editor/` }] })
})

test('a page that says it is here is asked: its tools listed, its calls answered, its errors failed calls, and every session hears when its tools change', async () => {
  const { client, heard } = await connect()
  const other = await connect()
  const p = page((event, data) => {
    if (event === 'editor:list') return { tools: [TOOL] }
    if (event === 'editor:call' && data.name === 'sprites_read') return { content: [{ type: 'text', text: JSON.stringify(data.args) }] }
    if (event === 'editor:call') return { error: `no tool ${data.name}` }
    return undefined
  })
  p.send('editor:here')
  await until(() => heard.length > 0 && other.heard.length > 0)
  expect([heard.length, other.heard.length]).toEqual([1, 1])
  expect((await client.listTools()).tools).toEqual([TOOL])
  expect(await client.callTool({ name: 'sprites_read', arguments: { frame: '1-2' } })).toMatchObject({ content: [{ type: 'text', text: '{"frame":"1-2"}' }] })
  expect(await client.callTool({ name: 'sprites_gone', arguments: {} })).toMatchObject({ isError: true, content: [{ type: 'text', text: 'no tool sprites_gone' }] })
  expect(p.asked).toEqual(['editor:list', 'editor:call', 'editor:call'])
  // The page's commands changing reaches every session; saying it is here again, being the page
  // asked already, does not.
  p.send('editor:tools')
  await until(() => heard.length > 1)
  p.send('editor:here')
  await new Promise(r => setTimeout(r, 50))
  expect([heard.length, other.heard.length]).toEqual([2, 2])
})

test('a list the page answers with an error fails with it, and is not left waiting', async () => {
  const { client, heard } = await connect()
  const p = page(event => (event === 'editor:list' ? { error: 'Transforms cannot be represented in JSON Schema' } : undefined))
  p.send('editor:here')
  await until(() => heard.length > 0)
  await expect(client.listTools()).rejects.toThrow('Transforms cannot be represented in JSON Schema')
})

test('a call whose page closes before it answers fails saying so, and the next is told no page is open', async () => {
  const { client, heard } = await connect()
  const p = page(() => undefined)
  p.send('editor:here')
  await until(() => heard.length > 0)
  const calling = client.callTool({ name: 'sprites_read', arguments: {} })
  await until(() => p.asked.includes('editor:call'))
  p.close()
  expect(await calling).toMatchObject({ isError: true, content: [{ type: 'text', text: 'the editor page closed before it answered: it reloaded, or was closed' }] })
  expect(await client.callTool({ name: 'sprites_read', arguments: {} })).toMatchObject({ isError: true, content: [{ type: 'text', text: `no editor page is open: open ${server.url}/editor/` }] })
})

test('a request from another origin, one naming no session but not initializing, and one naming a session there is not are refused', async () => {
  const post = (headers: Record<string, string>, body: unknown) => fetch(`${server.url}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  })
  const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'x', version: '0' } } }
  expect((await post({ origin: 'http://elsewhere.example' }, init)).status).toBe(403)
  const list = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
  const none = await post({}, list)
  expect([none.status, (await none.json()).error.message]).toEqual([400, 'no session: initialize first'])
  const gone = await post({ 'mcp-session-id': 'nobody' }, list)
  expect([gone.status, (await gone.json()).error.message]).toEqual([404, 'no session nobody'])
})

// An upgrade to the socket, from `origin` to `path`: whether the server switched protocols or hung up.
const upgrade = (path: string, origin?: string) => new Promise<string>(ok => {
  const req = http.request(`${server.url}${path}`, {
    headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', ...(origin ? { origin } : {}) },
  })
  req.on('upgrade', (_res, socket) => { socket.destroy(); ok('switched') })
  req.on('error', () => ok('hung up'))
  req.end()
})

test('the editor pages\' socket is upgraded to from the editor\'s own origin at /api/page, and from nowhere else', async () => {
  expect(await upgrade('/api/page')).toBe('switched')
  expect(await upgrade('/api/page', server.url)).toBe('switched')
  expect(await upgrade('/api/page', 'http://elsewhere.example')).toBe('hung up')
  expect(await upgrade('/')).toBe('hung up')
})
