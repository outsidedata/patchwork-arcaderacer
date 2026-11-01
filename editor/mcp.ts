// The page's side of the editor's MCP server (`editor/server/mcp.ts`): every command is a tool an
// LLM calls, and the server asks the page the user is in over the editor pages' socket
// (`editor/server/pages.ts`), which the page dials, with these events:
//
//   editor:list   { call }                 answered editor:result { call, tools } or { call, error }
//   editor:call   { call, name, args }     answered editor:result { call, content } or { call, error }
//   editor:here                            sent when the page loads and whenever its window takes
//                                          the focus, so the server asks the page last used
//   editor:tools                           sent when the commands have changed, as an extension turns
//                                          on or off with the game opened: once for all the changes
//                                          of one task, at its end, so a game whose extensions add
//                                          many commands has every client read the list once
//
// Every question is answered, an error too, since the server waits for the answer with no time
// limit of its own.
//
// A tool is a command by its tool name (`toolName`), its `input`'s description or else its title,
// and its `input` as a JSON schema, or an object of nothing for a plain command. A call runs the
// command through `Editor.call`, so it is one undo; what it answers becomes the call's content: a
// `Blob` an image, nothing the text `done`, anything else its JSON.
//
// What makes a command a tool an LLM can use is in the header of `editor.ts` (Commands): one
// function for its button, its tool and its call; world points, never canvas pixels; an input that
// is a `z.object` at its top, with no `.transform`, since one that is not voids the whole list the
// MCP SDK's client reads; the files and the rows worked from, and the client only for what only it
// holds, after `Session.frame()`; one chain of saves for a tool and its command. Every field of an
// input is described, and every tool's entry is at most 1.2 KB, since the list, the tools of the
// editor's own extensions, of the plugins and addons the open game names and of the game's own, is
// read whole into the LLM's context (`mcp.test.tsx`).
import { z } from 'zod'
import type { Channel } from './channel.ts'
import { toolName, type Editor } from './editor.ts'

export type Tool = { name: string; description: string; inputSchema: Record<string, unknown> }
export type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

export function tools(ed: Editor): Tool[] {
  return [...ed.commands.values()].map(c => ({
    name: toolName(c.id),
    description: ('input' in c ? c.input.description : undefined) ?? c.title,
    inputSchema: 'input' in c ? schemaOf(c.input) : { type: 'object', properties: {} },
  }))
}

// An input's JSON schema, as the LLM reads it in every tool of the list: what a call may hand it, so
// a field with a default is not required, less what tells it nothing: the dialect, which is MCP's
// own default; the description, which is the tool's; and the bounds zod gives every integer, which
// are those of any number of JavaScript's.
function schemaOf(input: z.ZodType): Record<string, unknown> {
  const schema = z.toJSONSchema(input, {
    io: 'input',
    override: ({ jsonSchema: j }) => {
      if (j.minimum === Number.MIN_SAFE_INTEGER) delete j.minimum
      if (j.maximum === Number.MAX_SAFE_INTEGER) delete j.maximum
    },
  }) as Record<string, unknown>
  delete schema.$schema
  delete schema.description
  return schema
}

// A Blob's bytes as base64: a data url's, read by the page.
const base64 = (b: Blob) => new Promise<string>((ok, no) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).slice(String(r.result).indexOf(',') + 1))
  r.onerror = () => no(r.error)
  r.readAsDataURL(b)
})

// Runs the tool `name` with `args`, and answers its content.
export async function called(ed: Editor, name: string, args: unknown): Promise<Content[]> {
  const c = [...ed.commands.values()].find(c => toolName(c.id) === name)
  if (!c) throw new Error(`no tool ${name}`)
  const out = await ed.call(c.id, args ?? {})
  if (out instanceof Blob) return [{ type: 'image', data: await base64(out), mimeType: out.type || 'image/png' }]
  if (out === undefined) return [{ type: 'text', text: 'done' }]
  return [{ type: 'text', text: JSON.stringify(out, null, 1) }]
}

// `socket` is the page's end of the editor pages' socket (`channel.ts`).
export function mcp(ed: Editor, socket: Channel) {
  const send = socket.send
  socket.on('editor:list', data => {
    const { call } = data as { call: number }
    let listed: Tool[]
    try {
      listed = tools(ed)
    } catch (e) {
      return send('editor:result', { call, error: (e as Error).message })
    }
    send('editor:result', { call, tools: listed })
  })
  // A call is an action in hand until its answer is sent, so a reload it sets off waits for that.
  socket.on('editor:call', data => void ed.holding(async () => {
    const { call, name, args } = data as { call: number; name: string; args: unknown }
    try {
      send('editor:result', { call, content: await called(ed, name, args) })
    } catch (e) {
      send('editor:result', { call, error: (e as Error).message })
    }
  }))
  const here = () => send('editor:here')
  here()
  addEventListener('focus', here)
  // The commands, to tell when they have changed, looked at once the task that changed them is over.
  // A command registered again is a new one, its input maybe another, so each is kept by itself.
  let had = new Map(ed.commands)
  const same = () => had.size === ed.commands.size && [...ed.commands].every(([id, c]) => had.get(id) === c)
  let asked = false
  ed.subscribe(() => {
    if (asked) return
    asked = true
    setTimeout(() => {
      asked = false
      if (same()) return
      had = new Map(ed.commands)
      send('editor:tools')
    })
  }, ['extensions'])
}
