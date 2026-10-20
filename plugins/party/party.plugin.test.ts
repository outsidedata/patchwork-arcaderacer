// Party's browser half against its server half, on a hub and a town this test writes: the town's
// player rows joined by the player addon under a `security` block that keeps each seat's account and
// invite to it, and `hero` rows standing for the seats. Each seat's page is plugins in the scene's
// order, party, chat and ui with no canvas, handed that seat's packet each frame, and its `send` goes into
// the town's inbox as a pipe would take it. Mail between the truths is the test's own `post`: queued, and handed before the next step to the truth named, or to the one a hero
// of the account is in, as an act on the first row of its kind from a seat of its own.
// The town names chat's mod for party's `whisper` in `world.party.mods`, and the scenemanager loads
// it as it loads every mod a scene names, here by `load`ing a manager whose `world` names it. The
// town lists chat between party and ui, and each page's chat is a stand-in that keeps the whispers
// it is asked to open.
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as path } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as PIXI from 'pixi.js'
import { boot, type Arg, type Row, type Scene, type Truth } from '#engine/engine.ts'
import { join } from '#addons/player/player.addon.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { ui } from '#plugins/ui/ui.plugin.ts'
import { party as sim, type Post, type To } from './party.sim.ts'
import { party } from './party.plugin.ts'

const DT = 1 / 60
const W = 640, H = 360
const BUTTON = { size: [40, 16], fill: { color: 3355443 }, focus: { color: 7829367 }, text: { fontSize: 11 } }
const UI = {
  panels: {
    'party.frames': { anchor: 'top-left', at: [8, 8], size: [200, 200] },
    'party.invite': { anchor: 'center', size: [220, 80], modal: true, layer: 3 },
  },
  styles: {
    'party.name': { fontSize: 12, fill: 16777215 }, 'party.leader': { fontSize: 12, fill: 16766720 },
    'party.zone': { fontSize: 10, fill: 11184810 }, 'party.prompt': { fontSize: 14, fill: 16777215 },
    'party.life': { size: [100, 6], edge: 1, frame: { color: 0 }, track: { color: 3342336 }, fill: { color: 13369344 } },
    'party.kick': { ...BUTTON, label: 'kick' }, 'party.promote': { ...BUTTON, label: 'lead' },
    'party.leave': { ...BUTTON, label: 'leave' }, 'party.accept': { ...BUTTON, label: 'join' }, 'party.decline': { ...BUTTON, label: 'no' },
  },
}
const PAGE = { stride: 40, name: [0, 0], zone: [110, 0], bar: [0, 16], kick: [120, 14], promote: [164, 14], leave: [0, 180], prompt: { name: [10, 10], accept: [10, 50], decline: [120, 50] } }
const PARTIES = {
  hub: 'hub', prefix: 'party-', max: 4, invite: 600, grain: 0.05, rate: { gap: 0, burst: 1 },
  who: { kind: 'hero', seat: 'seat', account: 'account', name: 'name', life: 'life', most: 'most' },
  page: PAGE, n: 0, next: {}, invites: {},
}
const SECURITY = { partyseat: { account: 'me', invite: 'me' } }
const MODS = { whisper: 'chat' }

// The manager, whose `world` names the mod, and its one child, a scene of nothing, which `load` boots.
const dir = mkdtempSync(path(tmpdir(), 'party-plugin-'))
writeFileSync(path(dir, 'lobby.scene.json'), JSON.stringify({ prefabs: { engine: { dt: DT }, scenemanager: { out: {} } }, actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'] }))
writeFileSync(path(dir, 'lobby.sim.ts'), `
import { scenemanager } from ${JSON.stringify(new URL('../scenemanager/scenemanager.sim.ts', import.meta.url).pathname)}
import file from './lobby.scene.json' with { type: 'json' }
export const sim = { scenemanager }
export const scene = file
`)
beforeAll(async () => {
  const top: Scene = {
    world: { party: { mods: MODS } },
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { lobby: { file: 'lobby.scene.json', suspend: false } }, dt: DT, entry: 'lobby', port: 0 } },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
    seats: 1,
  }
  await load(boot(top, { scenemanager }), pathToFileURL(dir + '/').href)
})
afterAll(() => rmSync(dir, { recursive: true }))

function world(security: Record<string, unknown> = SECURITY, plugins = ['party', 'chat', 'ui'], mods: Record<string, string> = MODS) {
  const mail: { to: To; kind: string; act: string; args: Arg[] }[] = []
  const post: Post = (_w, to, kind, act, ...args) => { mail.push({ to, kind, act, args }) }
  const kinds = { ...sim(post, w => w.world.name), player: {}, hero: {} }
  const prefabs = {
    engine: { width: W, height: H }, player: { seat: 0, masks: [] },
    parties: PARTIES, party: { key: '', leader: '', members: {} }, partymirror: { key: '', leader: '', members: {} }, partyseat: { account: '', invite: null },
    hero: { seat: -1, account: '', name: '', life: 1, most: 1 },
  }
  const town: Scene = { world: { name: 'town', ui: UI, party: { mods } }, seats: 4, plugins, security, prefabs, actors: [{ is: 'parties' }] }
  const truths = new Map<string, Truth>([['hub', boot({ world: { name: 'hub', ui: UI }, prefabs, actors: [{ is: 'parties' }] }, kinds)], ['town', boot(town, kinds)]])
  const posters = new Map<Truth, number>()
  let seq = 0
  const step = (k = 1) => {
    for (let i = 0; i < k; i++) {
      for (const m of mail.splice(0)) {
        const to = m.to
        const t = typeof to === 'string' ? truths.get(to) : 'account' in to ? [...truths.values()].find(t => t.rows.some(r => r.kind === 'hero' && r.data.account === to.account)) : undefined
        if (!t) continue
        if (!posters.has(t)) posters.set(t, t.open())
        t.inbox(posters.get(t)!, { seq: ++seq, n: t.n, id: t.rows.find(r => r.kind === m.kind)!.id, action: m.act, args: m.args })
      }
      for (const t of truths.values()) t.step(DT)
    }
  }
  return { t: truths.get('town')!, scene: town, step, settle: () => step(4), hub: () => truths.get('hub')!.rows.filter(r => r.kind === 'party').map(r => r.data) }
}

const pages: { close(): void }[] = []
afterEach(() => { for (const p of pages.splice(0)) p.close() })
function page(t: Truth, scene: Scene, account: string, name: string) {
  const order = scene.plugins!
  const seat = join(t)
  const hero = t.spawn('hero', { seat, account, name, owner: t.rows.filter(r => r.kind === 'player').at(-1)!.id })
  let seq = 0
  const sent: Arg[][] = []
  const wire = {
    scene, rows: [] as Row[], n: 0, ack: 0, home: '',
    send: (id: number, action: string, ...args: Arg[]) => { sent.push([action, ...args]); t.inbox(seat, { seq: ++seq, n: t.n, id, action, args }); return seq },
  }
  const whispered: string[][] = []
  const u = ui()
  const made: Record<string, any> = { party: party(), ui: u }
  const plugins: any = { wire, chat: { whisper: (a: string, n: string) => whispered.push([a, n]) } }
  for (const n of order) if (made[n]) plugins[n] = made[n]
  pages.push({ close: () => u.close() })
  const frame = () => {
    wire.rows = t.packet(seat).rows
    for (const n of order) plugins[n]?.tick?.(plugins)
    for (const n of order) plugins[n]?.afterTick?.(plugins)
  }
  const on = (panel: string) => (u.panel(panel).children as PIXI.Container[]).slice().sort((x, y) => x.y - y.y || x.x - y.x)
  // A button's label; a frame's name, zone and life bar.
  const label = (c: PIXI.Container) => (c.children[1] as PIXI.Text).text
  const buttons = (panel: string) => on(panel).filter(c => c.children.length === 2 && c.children[1] instanceof PIXI.Text).map(b => [label(b), b.x, b.y])
  const frames = () => on('party.frames').filter(c => c.children.length === 3).map(f => {
    const [n, z, bar] = f.children as [PIXI.Text, PIXI.Text, PIXI.Container]
    return { name: n.text, zone: z.text, y: f.y, life: (bar.children[1] as PIXI.Graphics).getLocalBounds().width, leader: (n.style.fill as any) === 16766720 }
  })
  const tap = (panel: string, text: string, i = 0) => on(panel).filter(c => c.children[1] instanceof PIXI.Text && label(c) === text)[i].emit('pointertap', {} as any)
  return { seat, hero, plugins, frame, sent, on, buttons, frames, tap, whispered, ui: u }
}

test('an invite puts up the prompt on the invited seat alone, and join makes a party whose frames each member sees of the others', () => {
  const { t, scene, settle } = world()
  const a = page(t, scene, 'a', 'Ann'), b = page(t, scene, 'b', 'Bob'), c = page(t, scene, 'c', 'Cy')
  a.frame()
  a.plugins.party.invite('b')
  expect(a.sent).toEqual([['invite', 'b']])
  settle()
  for (const p of [a, b, c]) p.frame()
  expect(a.on('party.invite')).toEqual([])
  expect(c.on('party.invite')).toEqual([])
  expect((b.on('party.invite')[0] as PIXI.Text).text).toBe('Ann')
  expect(b.on('party.invite')[0].position).toMatchObject({ x: 10, y: 10 })
  expect(b.buttons('party.invite')).toEqual([['join', 10, 50], ['no', 120, 50]])
  expect(b.ui.modal()).toBe('party.invite')
  b.tap('party.invite', 'join')
  expect(b.sent).toEqual([['accept']])
  settle()
  for (const p of [a, b, c]) p.frame()
  expect(b.on('party.invite')).toEqual([])
  expect(a.frames()).toEqual([{ name: 'Bob', zone: 'town', y: 0, life: 100, leader: false }])
  expect(b.frames()).toEqual([{ name: 'Ann', zone: 'town', y: 0, life: 100, leader: true }])
  expect(c.frames()).toEqual([])
  expect(c.on('party.frames')).toEqual([])
  // The leader has kick and promote on each frame; every member has leave.
  expect(a.buttons('party.frames')).toEqual([['kick', 120, 14], ['lead', 164, 14], ['leave', 0, 180]])
  expect(b.buttons('party.frames')).toEqual([['leave', 0, 180]])
})

test('frames stack by the order members joined, follow their life, and a tap on a name whispers them', () => {
  const { t, scene, settle } = world()
  const a = page(t, scene, 'a', 'Ann'), b = page(t, scene, 'b', 'Bob'), c = page(t, scene, 'c', 'Cy')
  for (const [p, account] of [[b, 'b'], [c, 'c']] as const) {
    a.frame()
    a.plugins.party.invite(account)
    settle()
    p.frame()
    p.tap('party.invite', 'join')
    settle()
  }
  c.hero.data.life = 0.33
  settle()
  a.frame()
  expect(a.frames().map(f => [f.name, f.y, f.life])).toEqual([['Bob', 0, 100], ['Cy', 40, 35]])
  expect(a.buttons('party.frames')).toEqual([['kick', 120, 14], ['lead', 164, 14], ['kick', 120, 54], ['lead', 164, 54], ['leave', 0, 180]])
  const cy = a.on('party.frames').find(f => f.children.length === 3 && (f.children[0] as PIXI.Text).text === 'Cy')!.children[0]
  expect([cy.eventMode, cy.cursor]).toEqual(['static', 'pointer'])
  cy.emit('pointertap', {} as any)
  expect(a.whispered).toEqual([['c', 'Cy']])
})

test('with no whisper named in world.party.mods a name is only a name: it takes no tap and whispers nobody', () => {
  const { t, scene, settle } = world(SECURITY, ['party', 'chat', 'ui'], {})
  const a = page(t, scene, 'a', 'Ann'), b = page(t, scene, 'b', 'Bob')
  a.frame()
  a.plugins.party.invite('b')
  settle()
  b.frame()
  b.tap('party.invite', 'join')
  settle()
  a.frame()
  const bob = a.on('party.frames').find(f => f.children.length === 3)!.children[0] as PIXI.Text
  expect(bob.text).toBe('Bob')
  expect(bob.isInteractive()).toBe(false)
  expect(bob.cursor).not.toBe('pointer')
  bob.emit('pointertap', {} as any)
  expect(a.whispered).toEqual([])
})

test('promote, kick and leave are sent from the frames, and the frames follow the party', () => {
  const { t, scene, settle, hub } = world()
  const a = page(t, scene, 'a', 'Ann'), b = page(t, scene, 'b', 'Bob'), c = page(t, scene, 'c', 'Cy')
  for (const [p, account] of [[b, 'b'], [c, 'c']] as const) {
    a.frame()
    a.plugins.party.invite(account)
    settle()
    p.frame()
    p.tap('party.invite', 'join')
    settle()
  }
  a.frame()
  a.tap('party.frames', 'lead', 0)
  expect(a.sent.at(-1)).toEqual(['promote', 'b'])
  settle()
  for (const p of [a, b]) p.frame()
  expect(hub()[0].leader).toBe('b')
  expect(a.buttons('party.frames')).toEqual([['leave', 0, 180]])
  expect(a.frames().map(f => [f.name, f.leader])).toEqual([['Bob', true], ['Cy', false]])
  b.tap('party.frames', 'kick', 1)
  expect(b.sent.at(-1)).toEqual(['kick', 'c'])
  settle()
  for (const p of [a, b, c]) p.frame()
  expect(c.on('party.frames')).toEqual([])
  expect(b.frames().map(f => f.name)).toEqual(['Ann'])
  a.tap('party.frames', 'leave')
  expect(a.sent.at(-1)).toEqual(['leave'])
  settle()
  for (const p of [a, b]) p.frame()
  expect(hub()).toEqual([])
  expect(a.on('party.frames')).toEqual([])
  expect(b.on('party.frames')).toEqual([])
})

test('no is sent as decline and takes the prompt down', () => {
  const { t, scene, settle, hub } = world()
  const a = page(t, scene, 'a', 'Ann'), b = page(t, scene, 'b', 'Bob')
  a.frame()
  a.plugins.party.invite('b')
  settle()
  b.frame()
  b.tap('party.invite', 'no')
  expect(b.sent).toEqual([['decline']])
  settle()
  b.frame()
  expect(b.on('party.invite')).toEqual([])
  expect(hub()).toEqual([])
})

test('it throws listed after ui, with no ui, naming chat\'s whisper without listing chat, or with no security listing each seat\'s account and invite', () => {
  const one = world(SECURITY, ['ui', 'party'])
  expect(() => page(one.t, one.scene, 'a', 'A').frame()).toThrow('party is listed after ui')
  const two = world(SECURITY, ['party', 'chat'])
  expect(() => page(two.t, two.scene, 'a', 'A').frame()).toThrow('party draws on ui\'s panels, and the scene lists no ui')
  const unlisted = world(SECURITY, ['party', 'ui'])
  expect(() => page(unlisted.t, unlisted.scene, 'a', 'A').frame()).toThrow('party\'s whisper is chat\'s, which this scene does not list')
  // Naming no whisper, the scene need not list chat.
  const quiet = world(SECURITY, ['party', 'ui'], {})
  expect(() => page(quiet.t, quiet.scene, 'a', 'A').frame()).not.toThrow()
  const three = world({ partyseat: { invite: 'me' } })
  expect(() => page(three.t, three.scene, 'a', 'A').frame()).toThrow('party needs the scene\'s security to list partyseat account and invite')
  // Before the first packet holds the door, an invite sends nothing.
  const four = world()
  const p = page(four.t, four.scene, 'a', 'A')
  p.plugins.party.invite('b')
  expect(p.sent).toEqual([])
})
