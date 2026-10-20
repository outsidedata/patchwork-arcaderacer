// The editor page's life across its loads: a page on a game it could not open reloads for that
// game's files, and a page waits for a server that has gone.
import { expect, onTestFinished, test, vi } from 'vitest'
import type { Channel } from './channel.ts'
import { ASK, awaitServer, hear } from './page.ts'
import { editor } from './test/editor.ts'

// The page's end of the socket, as a test holds it: each handler by its event, in the order they
// were put in place, until it is let go, and every message the page sent, with how many handlers were in place as it did.
function socket() {
  const handlers = new Map<string, ((data: unknown) => void)[]>()
  const sent: { event: string; data: unknown; handlers: number }[] = []
  const channel: Channel = {
    on: (event, f) => {
      handlers.set(event, [...(handlers.get(event) ?? []), f])
      return () => { handlers.set(event, (handlers.get(event) ?? []).filter(g => g !== f)) }
    },
    send: (event, data) => { sent.push({ event, data, handlers: [...handlers.values()].flat().length }) },
  }
  const tell = (event: string, data: unknown) => { for (const f of handlers.get(event) ?? []) f(data) }
  return { channel, sent, tell }
}

test('a page on a game it could not open reloads on any change to that game\'s files, on the disk or by another page, and on no other\'s', async () => {
  const { ed, reloads } = await editor()
  const s = socket()
  hear(ed, s.channel, { id: 'page-2', name: 'newgame', opened: false, since: 0 })
  s.tell('editor:disk', { path: 'games/other/other.scene.json', added: true, gone: false })
  s.tell('editor:changed', { id: 'elsewhere', by: 'page-3', version: 1, files: { 'plugins/p/p.data.json': '{}' }, at: 1 })
  s.tell('editor:disk', { path: 'games/newgame/newgame.scene.json', added: true, gone: false })
  await vi.waitFor(() => expect(reloads).toEqual([['games/newgame/newgame.scene.json']]))
  s.tell('editor:changed', { id: 'made', by: 'page-3', version: 2, files: { 'games/newgame/newgame.sim.ts': 'export const sim = {}\n', 'plugins/p/p.data.json': '{ "a": 1 }' }, at: 2 })
  await vi.waitFor(() => expect(reloads).toEqual([['games/newgame/newgame.scene.json'], ['games/newgame/newgame.sim.ts']]))
})

test('a page whose server is gone says so once, asks again every while, and reloads once it answers, however many times it is told', async () => {
  vi.useFakeTimers()
  onTestFinished(() => { vi.useRealTimers() })
  let up = false
  const asked: string[] = []
  const harness = globalThis.fetch
  vi.stubGlobal('fetch', async (url: string) => {
    asked.push(url)
    if (!up) throw new TypeError('fetch failed')
    return new Response('[]')
  })
  onTestFinished(() => { vi.stubGlobal('fetch', harness) })
  const said: string[] = []
  let reloads = 0
  const back = awaitServer(m => { said.push(m) }, () => { reloads++ })
  void back()
  void back()
  await vi.advanceTimersByTimeAsync(ASK * 3)
  expect(asked).toEqual(['/api/games', '/api/games', '/api/games'])
  expect([said, reloads]).toEqual([['the editor\'s server is gone: the page reloads once it answers again'], 0])
  up = true
  await vi.advanceTimersByTimeAsync(ASK)
  expect(reloads).toBe(1)
  await vi.advanceTimersByTimeAsync(ASK * 3)
  expect([asked.length, reloads, said.length]).toEqual([4, 1, 1])
})
