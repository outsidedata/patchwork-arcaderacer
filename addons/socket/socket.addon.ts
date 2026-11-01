// The WebSocket wire: a page and the server's side of its seat in two processes. It carries
// whatever the two ends say to each other as JSON, `U` up and `D` down, and knows nothing about
// what they are.
//
// Bytes. A `Uint8Array` anywhere in what is said, a physics world's snapshot image among the memory a
// kind hands a joining page (`Memory` in `addons/rewind`), crosses as the bytes it is, not as JSON:
// the message goes as one binary frame, the JSON of the rest first with each array's place in it, then
// every array's bytes, and arrives with each array a `Uint8Array` of its own back in its place. A
// message holding none goes as JSON text, as it always has.
//
// `serve(port, accept)` runs on node: each connection is handed to `accept`, the server's side of
// one seat (`Accept` in the loopback addon), and a connection `accept` throws on is closed with
// 1013 and the error. It hands back the port it listens on, which is a free one the machine chose
// when `port` is 0. `upgrades(accept)` is the same on an HTTP server someone else holds: it listens
// on no port, and its `upgrade` is handed each request to upgrade that the server's holder has
// found is for it. `dial(url, gone)` runs in the page: a wire, which `link` in the scenemanager addon
// is handed. A send before the socket is open waits for it. `gone` is called once the socket closes
// but by the wire's own `close`: the server went away, or was never there.
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { WebSocket as Socket, WebSocketServer as Server } from 'ws'
import type { Accept, Wire } from '#addons/loopback/loopback.addon.ts'

// A path from the top of a message to a value in it, each step a key or an index; the first step is
// always '', the key `JSON.stringify` hands the top itself under.
type Path = (string | number)[]

// Whether a byte array is anywhere in `v`, where JSON would meet it: an object's own enumerable keys,
// an array's every index, and in place of anything with a `toJSON` what that hands back. A byte array
// is taken as one before its `toJSON` is asked, since a node `Buffer` has one of its own.
function holds(v: unknown, key: string | number): boolean {
  if (typeof v !== 'object' || v === null) return false
  if (v instanceof Uint8Array) return true
  if (typeof (v as { toJSON?: unknown }).toJSON === 'function') return holds((v as { toJSON(k: string): unknown }).toJSON(String(key)), key)
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (holds(v[i], i)) return true
    return false
  }
  for (const k of Object.keys(v)) if (holds((v as Record<string, unknown>)[k], k)) return true
  return false
}

// Every byte array in `v`, with its path, in the order JSON meets them, by the same walk as `holds`.
function bytesIn(v: unknown, key: string | number, path: Path, found: [Path, Uint8Array][]) {
  if (typeof v !== 'object' || v === null) return
  if (v instanceof Uint8Array) { found.push([[...path], v]); return }
  if (typeof (v as { toJSON?: unknown }).toJSON === 'function') return bytesIn((v as { toJSON(k: string): unknown }).toJSON(String(key)), key, path, found)
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) { path.push(i); bytesIn(v[i], i, path, found); path.pop() }
    return
  }
  for (const k of Object.keys(v)) { path.push(k); bytesIn((v as Record<string, unknown>)[k], k, path, found); path.pop() }
}

// What is said, as it crosses: JSON text, or one frame of a 4-byte little-endian length, that many
// bytes of the header's JSON, `{ "b": [[path, length], …], "v": <the message> }` with every array
// written null in its place, and then each array's bytes in the order `b` lists them. A message with
// no bytes, a packet every step among them, is stringified as it is: a replacer would have JSON call
// back for every value.
function encode(said: unknown): string | Uint8Array {
  if (!holds(said, '')) return JSON.stringify(said)
  const found: [Path, Uint8Array][] = []
  bytesIn(said, '', [''], found)
  const json = JSON.stringify(said, function (this: Record<string, unknown>, key: string, value: unknown) {
    return this[key] instanceof Uint8Array ? null : value
  })
  const head = new TextEncoder().encode(`{"b":${JSON.stringify(found.map(([path, bytes]) => [path, bytes.byteLength]))},"v":${json}}`)
  const out = new Uint8Array(4 + head.byteLength + found.reduce((n, [, bytes]) => n + bytes.byteLength, 0))
  new DataView(out.buffer).setUint32(0, head.byteLength, true)
  out.set(head, 4)
  let at = 4 + head.byteLength
  for (const [, bytes] of found) { out.set(bytes, at); at += bytes.byteLength }
  return out
}

// A binary frame back into what was said: each array copied out of the frame into a `Uint8Array` of
// its own memory, and put back in its place. The copy is the constructor's: on node the frame is a
// `Buffer`, whose `slice` is a view into it, not a copy.
function decode(frame: Uint8Array): unknown {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const length = view.getUint32(0, true)
  const head = JSON.parse(new TextDecoder().decode(frame.subarray(4, 4 + length))) as { b: [Path, number][]; v: unknown }
  const top: Record<string, unknown> = { '': head.v }
  let at = 4 + length
  for (const [path, len] of head.b) {
    let holder: any = top
    for (const step of path.slice(0, -1)) holder = holder[step]
    holder[path[path.length - 1]] = new Uint8Array(frame.subarray(at, at + len))
    at += len
  }
  return top['']
}

// Each connection `wss` makes, handed to `accept`.
function seats<U, D>(wss: Server, accept: Accept<U, D>) {
  wss.on('connection', (ws: Socket) => {
    let seat: ReturnType<Accept<U, D>>
    try { seat = accept(down => { if (ws.readyState === ws.OPEN) ws.send(encode(down)) }) }
    catch (e) { ws.close(1013, String(e)); return }
    ws.on('message', (data: Buffer, binary: boolean) => seat.take((binary ? decode(data) : JSON.parse(data.toString())) as U))
    ws.on('close', () => seat.close())
  })
  return () => new Promise<void>(r => { for (const c of wss.clients) c.terminate(); wss.close(() => r()) })
}

export async function serve<U, D>(port: number, accept: Accept<U, D>) {
  const { WebSocketServer } = await import('ws')
  const wss = new WebSocketServer({ port })
  const close = seats(wss, accept)
  await new Promise<void>(r => wss.on('listening', () => r()))
  return { port: (wss.address() as { port: number }).port, close }
}

export async function upgrades<U, D>(accept: Accept<U, D>) {
  const { WebSocketServer } = await import('ws')
  const wss = new WebSocketServer({ noServer: true })
  const close = seats(wss, accept)
  return {
    upgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req)),
    close,
  }
}

export function dial<U, D>(url: string, gone?: () => void): Wire<U, D> {
  return fan => {
    const ws = new WebSocket(url)
    // A binary frame is handed over as an ArrayBuffer, read at once, rather than as a Blob, which
    // is read only later and would let a text frame after it pass it.
    ws.binaryType = 'arraybuffer'
    const queued: (string | Uint8Array)[] = []
    let closing = false, told = false
    ws.onmessage = e => fan((e.data instanceof ArrayBuffer ? decode(new Uint8Array(e.data)) : JSON.parse(String(e.data))) as D)
    ws.onopen = () => { for (const s of queued.splice(0)) ws.send(s) }
    // A browser says `close` after an `error`; Node says only `error` of a socket nobody answered.
    // Either is the server gone, said once.
    const lost = () => {
      if (closing || told) return
      told = true
      gone?.()
    }
    ws.onerror = lost
    ws.onclose = lost
    return {
      send: up => { const s = encode(up); ws.readyState === ws.OPEN ? ws.send(s) : queued.push(s) },
      close: () => {
        closing = true
        ws.close()
      },
    }
  }
}
