// Party's server half on scenes this test writes: a `hub`, `town` and `depths`, each a truth with a
// `parties` row, `hero` rows standing for seats, and a `probe` row whose `after` hands the truth's `w`
// to whatever the test asks of the rules. Mail between truths is the test's own `post`: each mail is
// queued, and before the next step it is handed to its target truth,
// found by name or by the truth a hero of the account is in, as an act on the first row of its kind
// from a seat of its own, through the truth's inbox, so `answer()` checks it as it checks a player's.
// The truth's own name is a `here` reading `world.name`.
import { expect, test } from 'vitest'
import { boot, type Arg, type Kind, type Row, type Scene, type Truth, type W } from '#engine/engine.ts'
import { join } from '#addons/player/player.addon.ts'
import { instance, mates, members, party, partyOf, type Party, type Post, type To } from './party.sim.ts'

const DT = 1 / 60
const PARTIES = {
  hub: 'hub', prefix: 'party-', max: 3, invite: 10, grain: 0.1, rate: { gap: 0, burst: 1 },
  who: { kind: 'hero', seat: 'seat', account: 'account', name: 'name', life: 'life', most: 'sheet.life' },
  page: {},
  n: 0, next: {}, invites: {},
}
const MIRROR = { key: '', leader: '', members: {} }

let look: (w: W) => unknown = () => undefined
const probe: Kind = { after(me, _dt, w) { me.data.saw = look(w) } }

function world(names: string[], over: Record<string, unknown> = {}) {
  const truths = new Map<string, Truth>()
  const mail: { to: To; kind: string; act: string; args: Arg[] }[] = []
  const post: Post = (_w, to, kind, act, ...args) => { mail.push({ to, kind, act, args }) }
  const sim = { ...party(post, w => w.world.name), hero: {}, probe }
  for (const name of names) {
    const scene: Scene = {
      world: { name },
      prefabs: {
        parties: { ...structuredClone(PARTIES), ...over }, party: MIRROR, partymirror: MIRROR, partyseat: { account: '', invite: null },
        hero: { seat: -1, account: '', name: '', life: 100, sheet: { life: 100 } }, probe: {},
      },
      actors: [{ is: 'parties' }, { is: 'probe' }],
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
  // Every mail an act raises answered: the ask, the hub's answer, and the answer arriving.
  const settle = () => step(4)
  const hero = (where: string, account: string, name = account.toUpperCase()) => {
    const t = truths.get(where)!
    const seat = t.open()
    const row = t.spawn('hero', { seat, account, name })
    let s = 0
    const act = (verb: string, ...args: Arg[]) => t.inbox(seat, { seq: ++s, n: t.n, id: t.rows.find(r => r.kind === 'parties')!.id, action: verb, args })
    return { seat, row, act, t }
  }
  const rows = (where: string, kind: string) => truths.get(where)!.rows.filter(r => r.kind === kind)
  const hub = () => rows('hub', 'party').map(r => r.data as Party)
  const mirrors = (where: string) => rows(where, 'partymirror').map(r => r.data as Party)
  const seatOf = (where: string, account: string) => rows(where, 'partyseat').find(r => r.data.account === account)?.data
  // What the rules say in a truth, asked with its own `w` in the probe's `after`.
  const ask = (where: string, f: (w: W) => unknown) => {
    look = f
    truths.get(where)!.step(DT)
    look = () => undefined
    return rows(where, 'probe')[0].data.saw
  }
  return { truths, mail, step, settle, hero, hub, mirrors, seatOf, ask }
}

// a in town and b in depths make a party.
function pair(names = ['hub', 'town', 'depths'], over: Record<string, unknown> = {}) {
  const w = world(names, over)
  const a = w.hero('town', 'a', 'Ann'), b = w.hero('depths', 'b', 'Bob')
  a.act('invite', 'b')
  w.settle()
  b.act('accept')
  w.settle()
  return { ...w, a, b }
}

test('an invite reaches the invited account\'s seat row, and accepting makes a party in the hub led by the inviter, keyed by prefix and row id', () => {
  const { hero, settle, hub, seatOf, mail, step } = world(['hub', 'town', 'depths'])
  const a = hero('town', 'a', 'Ann'), b = hero('depths', 'b', 'Bob')
  a.act('invite', 'b')
  step()
  expect(mail).toEqual([{ to: 'hub', kind: 'parties', act: 'ask', args: ['invite', 'a', 'Ann', 'town', 1, 'b'] }])
  settle()
  expect(seatOf('depths', 'b')).toEqual({ account: 'b', invite: { from: 'a', name: 'Ann' }, owner: b.row.id })
  expect(hub()).toEqual([])
  b.act('accept')
  settle()
  const [p] = hub()
  expect(p.key).toMatch(/^party-\d+$/)
  expect(p.leader).toBe('a')
  expect(p.members).toEqual({
    a: { name: 'Ann', zone: 'town', life: 1, joined: expect.any(Number) },
    b: { name: 'Bob', zone: 'depths', life: 1, joined: expect.any(Number) },
  })
  expect(seatOf('depths', 'b')!.invite).toBeNull()
})

test('the party\'s key is its instance key, and the rules read the party off the hub\'s row or a member truth\'s mirror', () => {
  const { hero, hub, ask, truths, settle } = pair()
  const key = hub()[0].key
  const row = truths.get('hub')!.rows.find(r => r.kind === 'party')!
  expect(key).toBe(`party-${row.id}`)
  hero('town', 'c')
  settle()
  expect(ask('town', w => instance(w, 'a'))).toBe(key)
  expect(ask('depths', w => instance(w, 'b'))).toBe(key)
  expect(ask('town', w => instance(w, 'c'))).toBe('c')
  expect(ask('hub', w => members(w, 'b'))).toEqual(['a', 'b'])
  expect(ask('hub', w => partyOf(w, 'a')?.key)).toBe(key)
  expect(ask('town', w => members(w, 'c'))).toEqual([])
  expect(ask('town', w => partyOf(w, 'c'))).toBeUndefined()
})

test('every member\'s truth holds a mirror of the party, which a change of life or zone updates in every one of them', () => {
  const { mirrors, hub, settle, truths, mail, step, a, b } = pair()
  expect(mirrors('town')).toEqual(hub())
  expect(mirrors('depths')).toEqual(hub())
  // b's life to 43 of 100, rounded to the grain: one status mailed, every mirror updated.
  b.row.data.life = 43
  step()
  expect(mail).toEqual([{ to: 'hub', kind: 'parties', act: 'ask', args: ['status', 'b', 'Bob', 'depths', 0.4, null] }])
  settle()
  expect(hub()[0].members.b.life).toBe(0.4)
  expect(mirrors('town')).toEqual(hub())
  expect(mirrors('depths')).toEqual(hub())
  // A change inside one grain mails nothing.
  b.row.data.life = 41
  step()
  expect(mail).toEqual([])
  // A life of none out of none is none, mailed once.
  b.row.data.life = 0
  b.row.data.sheet = { life: 0 }
  step()
  expect(mail.map(m => m.args[4])).toEqual([0])
  step()
  expect(mail.filter(m => m.act === 'ask')).toEqual([])
  settle()
  b.row.data.life = 41
  b.row.data.sheet = { life: 100 }
  step()
  // b walks from depths into town: depths has no member left and drops its mirror; town's shows b there.
  truths.get('depths')!.end(b.row)
  const t = truths.get('town')!
  t.spawn('hero', { seat: t.open(), account: 'b', name: 'Bob', life: 41 })
  settle()
  expect(mirrors('depths')).toEqual([])
  expect(hub()[0].members.b.zone).toBe('town')
  expect(mirrors('town')).toEqual(hub())
  expect(a.t.rows.some(r => r.kind === 'partyseat' && r.data.account === 'b')).toBe(true)
})

test('mates are the rows here of the other members', () => {
  const { hero, settle, ask, a } = pair()
  hero('town', 'x')
  settle()
  expect(ask('town', w => mates(w, 'a'))).toEqual([])
  const t = a.t
  const bHere = t.spawn('hero', { seat: t.open(), account: 'b', name: 'Bob' })
  settle()
  expect((ask('town', w => mates(w, 'a')) as Row[]).map(r => r.id)).toEqual([bHere.id])
  expect((ask('town', w => mates(w, 'b')) as Row[]).map(r => r.id)).toEqual([a.row.id])
})

test('invites are refused to oneself, to a member of a party, from a member who does not lead, and into a full party', () => {
  const { hero, settle, hub, seatOf, a, b } = pair(['hub', 'town', 'depths'])
  const c = hero('town', 'c'), d = hero('town', 'd')
  a.act('invite', 'a')
  settle()
  expect(seatOf('town', 'a')!.invite).toBeNull()
  // b does not lead.
  b.act('invite', 'd')
  settle()
  expect(seatOf('town', 'd')!.invite).toBeNull()
  // c joins: three, the most.
  a.act('invite', 'c')
  settle()
  c.act('accept')
  settle()
  expect(Object.keys(hub()[0].members)).toEqual(['a', 'b', 'c'])
  a.act('invite', 'd')
  settle()
  expect(seatOf('town', 'd')!.invite).toBeNull()
  // d leads a party of their own and invites b, who is in a's.
  const e = hero('town', 'e')
  d.act('invite', 'e')
  settle()
  e.act('accept')
  settle()
  d.act('invite', 'b')
  settle()
  expect(seatOf('depths', 'b')!.invite).toBeNull()
  // An invite arg that is no account is dropped at the door.
  d.act('invite', 7)
  d.act('kick')
  settle()
  expect(hub()).toHaveLength(2)
})

test('an invite expires on the hub\'s own count, which mails uninvited; accepting it after does nothing; declining takes it', () => {
  const { hero, settle, step, hub, seatOf, mail } = world(['hub', 'town'])
  const a = hero('town', 'a'), c = hero('town', 'c')
  a.act('invite', 'c')
  settle()
  expect(seatOf('town', 'c')!.invite).toEqual({ from: 'a', name: 'A' })
  step(10)
  expect(seatOf('town', 'c')!.invite).toBeNull()
  c.act('accept')
  settle()
  expect(hub()).toEqual([])
  a.act('invite', 'c')
  settle()
  c.act('decline')
  settle()
  expect(seatOf('town', 'c')!.invite).toBeNull()
  expect(hub()).toEqual([])
  step(12)
  expect(mail).toEqual([])
})

test('a leader who leaves hands the lead to the member who joined first; a party left with one member disbands, and every mirror goes', () => {
  const { hero, settle, hub, mirrors, a, b } = pair()
  const c = hero('town', 'c')
  a.act('invite', 'c')
  settle()
  c.act('accept')
  settle()
  a.act('leave')
  settle()
  expect(hub()[0].leader).toBe('b')
  expect(Object.keys(hub()[0].members)).toEqual(['b', 'c'])
  // town still holds c, so its mirror stays, without a.
  expect(mirrors('town')).toEqual(hub())
  expect(mirrors('depths')).toEqual(hub())
  b.act('leave')
  settle()
  expect(hub()).toEqual([])
  expect(mirrors('town')).toEqual([])
  expect(mirrors('depths')).toEqual([])
})

test('the leader kicks and promotes; a member who does not lead does neither', () => {
  const { hero, settle, hub, mirrors, a, b } = pair()
  const c = hero('town', 'c')
  a.act('invite', 'c')
  settle()
  c.act('accept')
  settle()
  b.act('kick', 'c')
  b.act('promote', 'b')
  settle()
  expect(hub()[0].leader).toBe('a')
  expect(Object.keys(hub()[0].members)).toEqual(['a', 'b', 'c'])
  a.act('promote', 'b')
  settle()
  expect(hub()[0].leader).toBe('b')
  expect(mirrors('depths')[0].leader).toBe('b')
  b.act('kick', 'c')
  settle()
  expect(Object.keys(hub()[0].members)).toEqual(['a', 'b'])
  // A kick of someone not in the party, and of oneself, do nothing.
  b.act('kick', 'z')
  b.act('kick', 'b')
  settle()
  expect(Object.keys(hub()[0].members)).toEqual(['a', 'b'])
  // c's truth still has a, so its mirror stays and no longer lists c.
  expect(mirrors('town')).toEqual(hub())
})

test('a seat\'s asks are held to the rate: burst at once, then one every gap steps', () => {
  const { hero, step, mail } = world(['hub', 'town'], { rate: { gap: 3, burst: 2 } })
  const a = hero('town', 'a')
  for (const x of ['b', 'c', 'd', 'e']) a.act('invite', x)
  step()
  expect(mail.map(m => m.args[5])).toEqual(['b', 'c'])
  step()
  a.act('invite', 'f')
  step()
  expect(mail.map(m => m.args[5])).toEqual([])
  step(3)
  a.act('invite', 'g')
  step()
  expect(mail.map(m => m.args[5])).toEqual(['g'])
})

test('a seat row is owned by its account\'s player row, so under security no other seat is sent its account or invite', () => {
  const scene: Scene = {
    world: { name: 'town' },
    seats: 4,
    security: { partyseat: { account: 'me', invite: 'me' } },
    prefabs: {
      player: { seat: 0, masks: [] }, parties: structuredClone(PARTIES), party: MIRROR, partymirror: MIRROR, partyseat: { account: '', invite: null },
      hero: { seat: -1, account: '', name: '', life: 1, sheet: { life: 1 } },
    },
    actors: [{ is: 'parties' }],
  }
  const t = boot(scene, { ...party(() => {}, () => 'town'), player: {}, hero: {} })
  const heroOf = (account: string) => {
    const seat = join(t)
    t.spawn('hero', { seat, account, name: account, owner: t.rows.filter(r => r.kind === 'player').at(-1)!.id })
    return seat
  }
  const a = heroOf('a'), b = heroOf('b')
  t.step(DT)
  const door = t.rows.find(r => r.kind === 'parties')!
  t.inbox(t.open(), { seq: 1, n: t.n, id: door.id, action: 'invited', args: ['a', 'b', 'B'] })
  t.step(DT)
  const mine = (seat: number) => t.packet(seat).rows.filter(r => r.kind === 'partyseat').map(r => r.data)
  expect(mine(a)).toEqual([{ account: 'a', invite: { from: 'b', name: 'B' }, owner: expect.any(Number) }, { owner: expect.any(Number) }])
  expect(mine(b)).toEqual([{ owner: expect.any(Number) }, { account: 'b', invite: null, owner: expect.any(Number) }])
})
