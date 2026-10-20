// Chat's server half on scenes this test writes: a `hub`, `town`, `town#2` and `depths`, each a truth
// with a chat row, and `hero` rows standing for seats. Mail between truths is the test's own `post`:
// each mail is queued, and before the next step it is handed to its
// target truths, found by name, by the truth a hero of the account is in, or by every truth of the
// scene, as an act on the first row of its kind from a seat of its own, through the truth's inbox, so
// `answer()` checks it as it checks a player's. `members` is a double of party's: a fixed table.
import { expect, test } from 'vitest'
import { boot, type Arg, type Row, type Scene, type Truth, type W } from '#engine/engine.ts'
import { join } from '#addons/player/player.addon.ts'
import { chat, type Post, type To } from './chat.sim.ts'

const DT = 1 / 60
const CHAT = {
  keep: 4, length: 20, rate: { gap: 4, burst: 2 }, hub: 'hub', scenes: ['town', 'depths'],
  talk: ['zone', 'party', 'whisper', 'global'],
  who: { kind: 'hero', seat: 'seat', account: 'account', name: 'name' },
  page: { lines: 3, height: 16, tab: 50, label: [0, 0], entry: [60, 0] },
  n: 0, next: {}, channels: { zone: { seq: 0, lines: {} }, global: { seq: 0, lines: {} } },
}
const CHATBOX = { account: '', channels: { party: { seq: 0, lines: {} }, whisper: { seq: 0, lines: {} } } }

const PARTIES: Record<string, string[]> = { a: ['a', 'b', 'c'], b: ['a', 'b', 'c'], c: ['a', 'b', 'c'] }

function world(names: string[], chatOver: Record<string, unknown> = {}) {
  const truths = new Map<string, Truth>()
  const mail: { to: To; kind: string; act: string; args: Arg[] }[] = []
  const post: Post = (_w, to, kind, act, ...args) => { mail.push({ to, kind, act, args }) }
  const members = (_w: W, account: string) => PARTIES[account] ?? []
  const sim = { ...chat(post, members), hero: {} }
  for (const name of names) {
    const scene: Scene = {
      world: { name },
      prefabs: { chat: { ...structuredClone(CHAT), ...chatOver }, chatbox: CHATBOX, hero: { seat: -1, account: '', name: '' } },
      actors: [{ is: 'chat' }],
    }
    truths.set(name, boot(scene, sim))
  }
  const posters = new Map<Truth, number>()
  let seq = 0
  const at = (to: To): Truth[] => {
    if (typeof to === 'string') return [truths.get(to)!]
    if ('account' in to) return [...truths.values()].filter(t => t.rows.some(r => r.kind === 'hero' && r.data.account === to.account))
    return [...truths].filter(([n]) => n === to.scene || n.startsWith(`${to.scene}#`)).map(([, t]) => t)
  }
  const step = (k = 1) => {
    for (let i = 0; i < k; i++) {
      for (const m of mail.splice(0)) for (const t of at(m.to)) {
        if (!posters.has(t)) posters.set(t, t.open())
        const row = t.rows.find(r => r.kind === m.kind)!
        t.inbox(posters.get(t)!, { seq: ++seq, n: t.n, id: row.id, action: m.act, args: m.args })
      }
      for (const t of truths.values()) t.step(DT)
    }
  }
  // A seat with a hero standing for it, and a say sent at the chat row.
  const hero = (where: string, account: string, name = account.toUpperCase()) => {
    const t = truths.get(where)!
    const seat = t.open()
    const row = t.spawn('hero', { seat, account, name })
    let s = 0
    const say = (...args: Arg[]) => t.inbox(seat, { seq: ++s, n: t.n, id: t.rows.find(r => r.kind === 'chat')!.id, action: 'say', args })
    return { seat, row, say, t }
  }
  const chatOf = (where: string) => truths.get(where)!.rows.find(r => r.kind === 'chat')!.data
  const boxOf = (where: string, account: string) => truths.get(where)!.rows.find(r => r.kind === 'chatbox' && r.data.account === account)?.data
  const texts = (ring: { lines: Record<string, { text: string }> }) => Object.entries(ring.lines).sort((x, y) => +x[0] - +y[0]).map(([, l]) => l.text)
  return { truths, mail, step, hero, chatOf, boxOf, texts }
}

test('a zone line goes on the truth\'s chat row, which keeps the last keep lines as a ring: one key added and one deleted per say', () => {
  const { step, hero, chatOf, texts } = world(['town'], { rate: { gap: 1, burst: 1 } })
  const a = hero('town', 'a', 'Ann')
  const seen: Record<string, unknown>[] = []
  for (let i = 1; i <= 7; i++) {
    a.say('zone', `line ${i}`)
    const before = structuredClone(chatOf('town').channels.zone.lines)
    step()
    const after = chatOf('town').channels.zone.lines
    const added = Object.keys(after).filter(k => !(k in before)), gone = Object.keys(before).filter(k => !(k in after))
    expect(added).toEqual([String(i)])
    expect(gone).toEqual(i > 4 ? [String(i - 4)] : [])
    seen.push(after[i])
  }
  expect(texts(chatOf('town').channels.zone)).toEqual(['line 4', 'line 5', 'line 6', 'line 7'])
  expect(chatOf('town').channels.zone.seq).toBe(7)
  // The line says who and when, by the chat row's own count.
  expect(seen[0]).toEqual({ from: 'Ann', account: 'a', text: 'line 1', n: 0 })
  expect(seen[6]).toEqual({ from: 'Ann', account: 'a', text: 'line 7', n: 6 })
})

test('the rate: burst lines at once, then one every gap steps of the chat row\'s count, per seat', () => {
  const { step, hero, chatOf, texts } = world(['town'])
  const a = hero('town', 'a'), b = hero('town', 'b')
  for (let i = 1; i <= 3; i++) a.say('zone', `a${i}`)
  b.say('zone', 'b1')
  step()
  // Two of a's (burst 2) and b's own, which a's rate does not hold back.
  expect(texts(chatOf('town').channels.zone)).toEqual(['a1', 'a2', 'b1'])
  expect(chatOf('town').next).toEqual({ [a.seat]: 8, [b.seat]: 4 })
  // a's next-allowed step is 8, and a line is let through once that is at most one gap past now: at 4.
  for (let n = 1; n < 4; n++) { a.say('zone', `early${n}`); step() }
  expect(texts(chatOf('town').channels.zone)).toEqual(['a1', 'a2', 'b1'])
  expect(chatOf('town').n).toBe(4)
  a.say('zone', 'a3')
  a.say('zone', 'a4')
  step()
  expect(texts(chatOf('town').channels.zone)).toEqual(['a1', 'a2', 'b1', 'a3'])
  // An entry goes once its step has come, when it holds nothing back.
  step(20)
  expect(chatOf('town').next).toEqual({})
})

test('a line is dropped when too long, blank, not a string, on a channel the scene turned off, or from a seat with no row', () => {
  const { step, hero, truths, chatOf, texts, mail } = world(['town'], { talk: ['zone', 'party'], rate: { gap: 0, burst: 1 } })
  const a = hero('town', 'a')
  a.say('zone', 'x'.repeat(21))
  a.say('zone', '   ')
  a.say('zone', 12)
  a.say('shout', 'hi')
  a.say('whisper', 'hi', 'b', 'B')
  a.say('global', 'hi')
  a.say('zone', 'x'.repeat(20))
  const t = truths.get('town')!
  const nobody = t.open()
  t.inbox(nobody, { seq: 1, n: t.n, id: t.rows.find(r => r.kind === 'chat')!.id, action: 'say', args: ['zone', 'ghost'] })
  step()
  expect(texts(chatOf('town').channels.zone)).toEqual(['x'.repeat(20)])
  expect(mail).toEqual([])
})

test('a whisper is mailed to the account wherever it is, and echoed to its speaker with who it went to', () => {
  const { step, hero, mail, boxOf, texts } = world(['hub', 'town', 'depths'])
  hero('town', 'a', 'Ann').say('whisper', 'psst', 'b', 'Bob')
  hero('depths', 'b', 'Bob')
  step()
  expect(mail).toEqual([{ to: { account: 'b' }, kind: 'chat', act: 'hear', args: ['whisper', 'Ann', 'a', 'psst', 'b'] }])
  expect(boxOf('town', 'a')!.channels.whisper.lines[1]).toEqual({ from: 'Ann', account: 'a', text: 'psst', n: 0, to: { account: 'b', name: 'Bob' } })
  step()
  expect(boxOf('depths', 'b')!.channels.whisper.lines[1]).toEqual({ from: 'Ann', account: 'a', text: 'psst', n: 1 })
  expect(boxOf('town', 'b')).toBeUndefined()
  // A whisper needs someone to go to.
  hero('town', 'c').say('whisper', 'to nobody', '', 'Nobody')
  step()
  expect(mail).toEqual([])
  expect(texts(boxOf('depths', 'b')!.channels.whisper)).toEqual(['psst'])
})

test('a party line goes through the hub\'s relay to every member account, on the chatbox each reads alone', () => {
  const { step, hero, mail, boxOf, texts } = world(['hub', 'town', 'depths'])
  hero('town', 'a', 'Ann').say('party', 'pull')
  hero('town', 'c')
  hero('depths', 'b')
  hero('depths', 'd') // in no party of a's
  step()
  expect(mail).toEqual([{ to: 'hub', kind: 'chat', act: 'relay', args: ['party', 'Ann', 'a', 'pull'] }])
  step()
  expect(mail.map(m => m.to)).toEqual([{ account: 'a' }, { account: 'b' }, { account: 'c' }])
  step()
  for (const [where, account] of [['town', 'a'], ['town', 'c'], ['depths', 'b']]) expect(texts(boxOf(where, account)!.channels.party), account).toEqual(['pull'])
  expect(boxOf('depths', 'd')).toBeUndefined()
  // A speaker in no party is heard by nobody.
  hero('town', 'e').say('party', 'hello?')
  step(3)
  expect(boxOf('town', 'e')).toBeUndefined()
})

test('a global line goes through the hub to every live copy of each scene the prefab lists', () => {
  const { step, hero, mail, chatOf, texts } = world(['hub', 'town', 'town#2', 'depths', 'depths#party-4', 'login'])
  hero('town#2', 'a', 'Ann').say('global', 'wts')
  step(2)
  expect(mail.map(m => m.to)).toEqual([{ scene: 'town' }, { scene: 'depths' }])
  step()
  for (const where of ['town', 'town#2', 'depths', 'depths#party-4']) expect(texts(chatOf(where).channels.global), where).toEqual(['wts'])
  expect(chatOf('login').channels.global.lines).toEqual({})
  expect(chatOf('town').channels.zone.lines).toEqual({})
})

test('a chatbox is owned by its account\'s player row, so under security no other seat is sent its lines; it ends when its account leaves', () => {
  const scene: Scene = {
    world: { name: 'town' },
    seats: 4,
    security: { chatbox: { channels: 'me' } },
    prefabs: { player: { seat: 0, masks: [] }, chat: structuredClone(CHAT), chatbox: CHATBOX, hero: { seat: -1, account: '', name: '' } },
    actors: [{ is: 'chat' }],
  }
  const post: Post = () => {}
  const t = boot(scene, { ...chat(post, () => []), player: {}, hero: {} })
  const heroOf = (account: string) => {
    const seat = join(t)
    const player = t.rows.filter(r => r.kind === 'player').at(-1)!
    t.spawn('hero', { seat, account, name: account, owner: player.id })
    return seat
  }
  const a = heroOf('a'), b = heroOf('b')
  const chatRow = t.rows.find(r => r.kind === 'chat')!
  t.inbox(a, { seq: 1, n: t.n, id: chatRow.id, action: 'say', args: ['whisper', 'secret', 'b', 'B'] })
  t.step(DT)
  const box = t.rows.find(r => r.kind === 'chatbox')!
  expect(box.data.owner).toBe(t.rows.find(r => r.kind === 'hero' && r.data.account === 'a')!.data.owner)
  const sent = (seat: number) => t.packet(seat).rows.find((r: Row) => r.id === box.id)!.data
  expect(sent(a).channels.whisper.lines[1].text).toBe('secret')
  expect('channels' in sent(b)).toBe(false)
  t.end(t.rows.find(r => r.kind === 'hero' && r.data.account === 'a')!)
  t.step(DT)
  expect(t.rows.some(r => r.kind === 'chatbox')).toBe(false)
})
