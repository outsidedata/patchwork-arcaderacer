// Chat's browser half against its server half, on a town this test writes: a chat row, player rows
// joined by the player addon under a `security` block that keeps each chatbox's lines to its owner,
// and `hero` rows standing for the seats. Each seat's page is plugins in the scene's order, chat then
// ui with no canvas, handed that seat's packet each frame, and its `send` goes into the truth's inbox
// as a pipe would take it. Each page's ui carries a double of `entry` that hands back the lines the
// test queues. Whisper mail to another truth is the test's own `post`, which hands each mail back to
// this one truth.
import { afterEach, expect, test } from 'vitest'
import * as PIXI from 'pixi.js'
import { boot, type Arg, type Row, type Scene, type Truth } from '#engine/engine.ts'
import { join } from '#addons/player/player.addon.ts'
import { ui } from '#plugins/ui/ui.plugin.ts'
import { chat as sim, type Post, type To } from './chat.sim.ts'
import { chat } from './chat.plugin.ts'

const DT = 1 / 60
const W = 640, H = 360
const BUTTON = { size: [48, 18], fill: { color: 3355443 }, focus: { color: 7829367 }, text: { fontSize: 12 } }
const UI = {
  panels: {
    'chat.tabs': { anchor: 'bottom-left', at: [8, -120], size: [240, 18] },
    'chat.log': { anchor: 'bottom-left', at: [8, -40], size: [400, 60], clip: true },
    'chat.entry': { anchor: 'bottom-left', at: [8, -8], size: [400, 20] },
  },
  styles: {
    'chat.tab': BUTTON, 'chat.tab.on': { ...BUTTON, fill: { color: 8947848 } },
    'chat.zone': { fontSize: 12, fill: 16777215 }, 'chat.global': { fontSize: 12, fill: 16755200 },
    'chat.party': { fontSize: 12, fill: 5635925 }, 'chat.whisper': { fontSize: 12, fill: 16733695 },
    'chat.label': { fontSize: 12, fill: 13421772 }, 'chat.entry': { fontSize: 12, fill: 16777215 },
  },
}
const CHAT = {
  keep: 10, length: 40, rate: { gap: 0, burst: 1 }, hub: 'hub', scenes: ['town'],
  talk: ['zone', 'party', 'whisper', 'global'],
  who: { kind: 'hero', seat: 'seat', account: 'account', name: 'name' },
  page: { lines: 3, height: 16, tab: 50, label: [0, 2], entry: [70, 2] },
  n: 0, next: {}, channels: { zone: { seq: 0, lines: {} }, global: { seq: 0, lines: {} } },
}

function town(over: Partial<Scene> = {}) {
  const scene: Scene = {
    world: { name: 'town', ui: UI },
    seats: 4,
    plugins: ['chat', 'ui'],
    security: { chatbox: { channels: 'me' } },
    prefabs: {
      engine: { width: W, height: H },
      player: { seat: 0, masks: [] }, chat: CHAT, chatbox: { account: '', channels: { party: { seq: 0, lines: {} }, whisper: { seq: 0, lines: {} } } },
      hero: { seat: -1, account: '', name: '' },
    },
    actors: [{ is: 'chat' }],
    ...over,
  }
  const mail: { to: To; kind: string; act: string; args: Arg[] }[] = []
  const post: Post = (_w, to, kind, act, ...args) => { mail.push({ to, kind, act, args }) }
  const t = boot(scene, { ...sim(post, () => []), player: {}, hero: {} })
  const poster = t.open()
  let seq = 0
  const step = (k = 1) => {
    for (let i = 0; i < k; i++) {
      for (const m of mail.splice(0)) t.inbox(poster, { seq: ++seq, n: t.n, id: t.rows.find(r => r.kind === m.kind)!.id, action: m.act, args: m.args })
      t.step(DT)
    }
  }
  return { t, scene, step }
}

// A seat on the truth with a hero, and its page.
const pages: { close(): void }[] = []
afterEach(() => { for (const p of pages.splice(0)) p.close() })
function page(t: Truth, scene: Scene, account: string, name: string) {
  const order = scene.plugins!
  const seat = join(t)
  t.spawn('hero', { seat, account, name, owner: t.rows.filter(r => r.kind === 'player').at(-1)!.id })
  let seq = 0
  const sent: Arg[][] = []
  const wire = {
    scene, rows: [] as Row[], n: 0, ack: 0, home: '',
    send: (id: number, action: string, ...args: Arg[]) => { sent.push([action, ...args]); t.inbox(seat, { seq: ++seq, n: t.n, id, action, args }); return seq },
  }
  const queued: string[] = []
  const entries: unknown[] = []
  const u = Object.assign(ui(), {
    entry(panel: string, key: string, o: { max: number; style: string }) {
      entries.push({ panel, key, o })
      return u.show(panel, key, () => Object.assign(new PIXI.Container(), { take: () => queued.shift() }))
    },
  })
  const made: Record<string, any> = { chat: chat(), ui: u }
  const plugins: any = { wire }
  for (const n of order) if (made[n]) plugins[n] = made[n]
  pages.push({ close: () => u.close() })
  const frame = () => {
    wire.rows = t.packet(seat).rows
    for (const n of order) plugins[n]?.tick?.(plugins)
    for (const n of order) plugins[n]?.afterTick?.(plugins)
  }
  // What actors showed on a panel, left to right and top to bottom: a clipped panel's mask is not one.
  const on = (panel: string) => (u.panel(panel).children as PIXI.Container[]).filter(c => c !== u.panel(panel).mask).sort((x, y) => x.y - y.y || x.x - y.x)
  const texts = (panel: string) => on(panel).filter(c => c instanceof PIXI.Text).map(c => (c as PIXI.Text).text)
  return { seat, plugins, frame, queued, entries, sent, on, texts, ui: u }
}

// Each tab button's label, and the colour its background is filled with.
const tabKeys = (p: ReturnType<typeof page>) => p.on('chat.tabs').map(b => (b.children[1] as PIXI.Text).text)
const fill = (p: ReturnType<typeof page>) => p.on('chat.tabs').map(b => ((b.children[0] as PIXI.Graphics).context.instructions[0] as any).data.style.color)

test('a tab per channel the scene talks on, the open one in its own style, and a tap opens another', () => {
  const { t, scene } = town()
  const p = page(t, scene, 'a', 'Ann')
  p.frame()
  expect(tabKeys(p)).toEqual(['zone', 'party', 'whisper', 'global'])
  expect(p.on('chat.tabs').map(b => b.x)).toEqual([0, 50, 100, 150])
  expect(fill(p)).toEqual([0x888888, 0x333333, 0x333333, 0x333333])
  p.on('chat.tabs')[3].emit('pointertap', {} as any)
  p.frame()
  expect(fill(p)).toEqual([0x333333, 0x333333, 0x333333, 0x888888])
})

test('a line typed in the entry is said on the open channel, and the log shows the last lines of it, oldest at the top', () => {
  const { t, scene, step } = town()
  const a = page(t, scene, 'a', 'Ann'), b = page(t, scene, 'b', 'Bob')
  a.frame()
  expect(a.entries.at(-1)).toEqual({ panel: 'chat.entry', key: 'line', o: { max: 40, style: 'chat.entry' } })
  expect(a.texts('chat.entry')).toEqual(['[zone]'])
  for (const line of ['one', 'two', 'three', 'four']) {
    a.queued.push(line)
    a.frame()
    step()
  }
  expect(a.sent).toEqual([['say', 'zone', 'one'], ['say', 'zone', 'two'], ['say', 'zone', 'three'], ['say', 'zone', 'four']])
  b.frame()
  expect(b.texts('chat.log')).toEqual(['Ann: two', 'Ann: three', 'Ann: four'])
  expect(b.on('chat.log').map(c => c.y)).toEqual([0, 16, 32])
  // A frame with nothing typed sends nothing.
  a.frame()
  expect(a.sent).toHaveLength(4)
})

test('a tap on a line opens a whisper to its speaker, which only its speaker and reader see, drawn to whom it went', () => {
  const { t, scene, step } = town()
  const a = page(t, scene, 'a', 'Ann'), b = page(t, scene, 'b', 'Bob'), c = page(t, scene, 'c', 'Cy')
  // With nobody to whisper to, a whisper is not sent.
  a.frame()
  a.on('chat.tabs')[2].emit('pointertap', {} as any)
  a.frame()
  expect(a.texts('chat.entry')).toEqual(['[]'])
  a.queued.push('to nobody')
  a.frame()
  expect(a.sent).toEqual([])
  b.queued.push('hi all')
  b.frame()
  step()
  a.on('chat.tabs')[0].emit('pointertap', {} as any)
  a.frame()
  a.on('chat.log')[0].emit('pointertap', {} as any)
  a.frame()
  expect(a.texts('chat.entry')).toEqual(['[Bob]'])
  a.queued.push('psst')
  a.frame()
  expect(a.sent).toEqual([['say', 'whisper', 'psst', 'b', 'Bob']])
  step(2)
  a.frame()
  expect(a.texts('chat.log')).toEqual(['→Bob: psst'])
  b.frame()
  b.on('chat.tabs')[2].emit('pointertap', {} as any)
  b.frame()
  expect(b.texts('chat.log')).toEqual(['Ann: psst'])
  c.frame()
  c.on('chat.tabs')[2].emit('pointertap', {} as any)
  c.frame()
  expect(c.texts('chat.log')).toEqual([])
  // A tap on a whisper the seat sent opens a whisper to whom it went; whisper() does it for other plugins.
  a.plugins.chat.whisper('c', 'Cy')
  a.frame()
  expect(a.texts('chat.entry')).toEqual(['[Cy]'])
  a.on('chat.log')[0].emit('pointertap', {} as any)
  a.frame()
  expect(a.texts('chat.entry')).toEqual(['[Bob]'])
})

test('it throws listed after ui, with no ui, or talking privately with no security listing for chatbox lines', () => {
  const one = town({ plugins: ['ui', 'chat'] })
  expect(() => page(one.t, one.scene, 'a', 'A').frame()).toThrow('chat is listed after ui')
  const two = town({ plugins: ['chat'] })
  expect(() => page(two.t, two.scene, 'a', 'A').frame()).toThrow('chat draws on ui\'s panels, and the scene lists no ui')
  const three = town({ security: { chatbox: {} } })
  expect(() => page(three.t, three.scene, 'a', 'A').frame()).toThrow('chat talks on party or whisper, and the scene\'s security lists no chatbox channels')
  const four = town({ security: { hero: {} }, prefabs: { ...town().scene.prefabs, chat: { ...CHAT, talk: ['zone', 'global'] } } })
  expect(() => page(four.t, four.scene, 'a', 'A').frame()).not.toThrow()
})
