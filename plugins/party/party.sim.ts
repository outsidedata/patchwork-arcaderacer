// The server half of parties: who plays together, held in the hub and mirrored into every truth a
// member is in.
//
// The rows.
// - `parties`: one per truth, an `actors` entry of every scene a party is made in and of the hub. It
//   is the door: a seat sends every party act at it, and mail about parties lands on it (mail lands
//   on the first row of a kind). Its prefab holds `hub`, the hub's truth name; `prefix`, which a
//   party's key starts with; `max`, the most members a party has; `invite`, the hub steps an invite
//   waits for an answer; `grain`, the step a member's life fraction is rounded to; `rate`; `who`;
//   and `page`, the browser half's own numbers. It counts its own steps in `n`, since a rule cannot
//   read the engine's step counter. In the hub it also holds `invites`, keyed by the invited account:
//   `{ from, name, zone, life, until }`, the inviter as the invite found them and the hub step it
//   expires on. One invite waits per account; a newer one replaces it.
// - `party`: in the hub, one per party, the truth of it: `{ key, leader, members }`, `members` keyed
//   by account, each `{ name, zone, life, joined }`: the member's name, the truth they were last in,
//   their life fraction there, and the hub step they joined on. `key` is `prefix` and the row's id,
//   the instance key of the party's dungeons.
// - `partymirror`: in a member's truth, the same three fields as the hub last mailed them, one per
//   party with a member here. Rules read it (`mates`, `instance`) and the page draws it.
// - `partyseat`: one per account with a row here, `{ account, invite }`, `invite` being
//   `{ from, name }` while an invite waits for it. Its `owner` is the account's player row, so a
//   scene whose `security` lists `partyseat: { account: 'me', invite: 'me' }` sends each seat its own
//   account and invite and every other seat's without them; the browser half finds its own seat's as
//   the one whose `account` it was sent, and throws when the scene's security lists neither.
//
// The speaker, as in chat: `who` names the kind whose row stands for a seat and its fields `seat`
// (the truth's seat number), `account`, `name`, and `life` and `most`, its life and its greatest life,
// each a field name or a dotted path into the row's data.
//
// The acts, all `open`, sent at the `parties` row by a seat: `invite(account)`, `accept()`,
// `decline()`, `leave()`, `kick(account)` and `promote(account)`. Each finds the seat's row, is held
// to the rate as chat's `say` is (a next-allowed step per seat, `rate: { gap, burst }`), and mails the
// hub's `parties` row `ask(verb, account, name, zone, life, arg)`: the verb, who asks, where they are
// and how they are, and the account the verb names. The hub decides:
// - invite: refused when the account invites itself, the invited account is in a party, the inviter
//   is in one they do not lead, or that party is full. Otherwise the invite is kept and the invited
//   account mailed `invited(account, from, name)`.
// - accept: the waiting invite is taken, the account mailed `uninvited`, and it joins the inviter's
//   party, made then with the inviter as leader when they have none, unless it is full or the account
//   joined another meanwhile.
// - decline: the invite is taken and the account mailed `uninvited`.
// - leave, and kick by the leader: the member goes. A leader who goes hands the lead to the member who
//   joined first; a party left with one member is disbanded.
// - promote, by the leader: the lead goes to that member.
// - status: the member's name, zone and life are written. The `parties` row of a truth mails it in its
//   `before` for each member here whose zone or rounded life differs from its mirror, writing the new
//   values on the mirror at once so it mails once; the hub's mirror mail brings them back.
// The hub's `before` takes each invite whose step has come and mails the account `uninvited`.
//
// Every change to a party mails `mirror(json)` to each member, and to a member who left or was kicked,
// as `{ account }`: the party's row data as a JSON string, since a message's args are plain values. A
// truth writes it on its mirror of that key, spawning one, and ends the mirror when its members are
// none, as a disbanded party's are; its `before` ends every mirror with no member here, so a member
// who left takes the mirror from a truth with no other member in it. Mail to `{ account }` reaches the
// truth the account is in, so each member's truth hears every change, once per member in it.
//
// Mail is the `post(w, to, kind, act, ...args)` this plugin is handed, and `here(w)` is the truth's
// own name: `party(post, here)`, which the game's sim hands in. `ask`, `invited`, `uninvited` and
// `mirror` are `open`, since the post seat possesses no row.
//
// For rules: `partyOf(w, account)`, the party row (in the hub) or mirror (anywhere else) holding that
// account; `members(w, account)`, every account of it, the account's own included, or none;
// `mates(w, account)`, the rows here of the other members; and `instance(w, account)`, the key a
// dungeon of that account's is instanced by: its party's key, or the account alone.
import type { Arg, Kind, Row, W } from '#engine/engine.ts'

export type To = string | { account: string } | { scene: string }
export type Post = (w: W, to: To, kind: string, act: string, ...args: Arg[]) => void
export type Here = (w: W) => string

export type Member = { name: string; zone: string; life: number; joined: number }
export type Party = { key: string; leader: string; members: Record<string, Member> }
export type Who = { kind: string; seat: string; account: string; name: string; life: string; most: string }

const VERBS = ['invite', 'accept', 'decline', 'leave', 'kick', 'promote']
const NAMED = ['invite', 'kick', 'promote'] // the verbs whose arg is an account

const read = (data: any, path: string) => path.split('.').reduce((o, k) => o?.[k], data)

const doorOf = (w: W) => w.find('parties').data

export function partyOf(w: W, account: string): Party | undefined {
  return (w.all('party').find(r => account in r.data.members) ?? w.all('partymirror').find(r => account in r.data.members))?.data
}

export const members = (w: W, account: string): string[] => Object.keys(partyOf(w, account)?.members ?? {})

export function mates(w: W, account: string): Row[] {
  const { who } = doorOf(w)
  const all = members(w, account)
  return w.all(who.kind).filter(r => r.data[who.account] !== account && all.includes(r.data[who.account]))
}

export const instance = (w: W, account: string): string => partyOf(w, account)?.key ?? account

// Whether the seat may ask on step `n`, moving its next-allowed step on if so.
function allowed(d: { n: number; next: Record<string, number>; rate: { gap: number; burst: number } }, seat: number): boolean {
  const at = Math.max(d.next[seat] ?? d.n, d.n)
  if (at - d.n > d.rate.gap * (d.rate.burst - 1)) return false
  d.next[seat] = at + d.rate.gap
  return true
}

export function party(post: Post, here: Here): { parties: Kind; party: Kind; partymirror: Kind; partyseat: Kind } {
  // A row's life as a fraction of its most, rounded to `grain`; none when its most is none, as 0/0 would
  // be a fraction that never equals itself and is mailed every step.
  const life = (d: any, r: Row) => {
    const f = Math.max(0, Math.min(1, read(r.data, d.who.life) / read(r.data, d.who.most))) || 0
    return Math.round(f / d.grain) * d.grain
  }

  // ---------------------------------------------------------------- in the hub

  const rowOf = (w: W, account: string) => w.all('party').find(r => account in r.data.members)

  const mirror = (w: W, p: Party, to: string[]) => {
    const json = JSON.stringify(p)
    for (const account of to) post(w, { account }, 'parties', 'mirror', json)
  }

  // Takes the member out, hands on the lead or disbands, and mails everyone it concerns.
  const drop = (w: W, row: Row, account: string) => {
    const p: Party = row.data
    delete p.members[account]
    const left = Object.entries(p.members).sort((a, b) => a[1].joined - b[1].joined).map(([a]) => a)
    if (left.length < 2) {
      w.end(row)
      return mirror(w, { ...p, members: {} }, [account, ...left])
    }
    if (p.leader === account) p.leader = left[0]
    mirror(w, p, [account, ...left])
  }

  const ask = (me: Row, w: W, verb: string, account: string, name: string, zone: string, lifeNow: number, arg: string | null) => {
    const d = me.data
    const row = rowOf(w, account)
    const p: Party | undefined = row?.data
    const member = (): Member => ({ name, zone, life: lifeNow, joined: d.n })
    if (verb === 'status') {
      if (!p) return
      p.members[account] = { ...p.members[account], name, zone, life: lifeNow }
      return mirror(w, p, Object.keys(p.members))
    }
    if (verb === 'invite') {
      if (arg === null || arg === account || rowOf(w, arg)) return
      if (p && (p.leader !== account || Object.keys(p.members).length >= d.max)) return
      d.invites[arg] = { from: account, name, zone, life: lifeNow, until: d.n + d.invite }
      return post(w, { account: arg }, 'parties', 'invited', arg, account, name)
    }
    if (verb === 'accept' || verb === 'decline') {
      const inv = d.invites[account]
      if (!inv) return
      delete d.invites[account]
      post(w, { account }, 'parties', 'uninvited', account)
      if (verb === 'decline' || p) return
      const theirs = rowOf(w, inv.from)
      if (theirs) {
        if (Object.keys(theirs.data.members).length >= d.max) return
        theirs.data.members[account] = member()
        return mirror(w, theirs.data, Object.keys(theirs.data.members))
      }
      const made = w.spawn('party', { leader: inv.from, members: { [inv.from]: { name: inv.name, zone: inv.zone, life: inv.life, joined: d.n }, [account]: member() } })
      made.data.key = `${d.prefix}${made.id}`
      return mirror(w, made.data, Object.keys(made.data.members))
    }
    if (!row || !p) return
    if (verb === 'leave') return drop(w, row, account)
    if (p.leader !== account || arg === null || arg === account || !(arg in p.members)) return
    if (verb === 'kick') return drop(w, row, arg)
    if (verb === 'promote') {
      p.leader = arg
      mirror(w, p, Object.keys(p.members))
    }
  }

  // ---------------------------------------------------------------- in a member's truth

  const seatOf = (w: W, account: string) => w.all('partyseat').find(r => r.data.account === account)

  const parties: Kind = {
    before(me, _dt, w) {
      const d = me.data
      d.n++
      for (const [seat, at] of Object.entries(d.next as Record<string, number>)) if (at <= d.n) delete d.next[seat]
      // The hub's invites that have waited out their steps.
      for (const [account, inv] of Object.entries(d.invites as Record<string, { until: number }>)) {
        if (inv.until > d.n) continue
        delete d.invites[account]
        post(w, { account }, 'parties', 'uninvited', account)
      }
      // Every account here has its seat row, owned by its row, and no other account has one.
      const rows = new Map<string, Row>(w.all(d.who.kind).map(r => [r.data[d.who.account], r]))
      for (const s of w.all('partyseat')) if (!rows.has(s.data.account)) w.end(s)
      for (const [account, r] of rows) (seatOf(w, account) ?? w.spawn('partyseat', { account })).data.owner = r.data.owner ?? r.id
      // Mirrors of parties with nobody here go; members here whose zone or life moved are mailed.
      const zone = here(w)
      for (const m of w.all('partymirror')) {
        const p: Party = m.data
        const present = Object.keys(p.members).filter(a => rows.has(a))
        if (!present.length) { w.end(m); continue }
        for (const account of present) {
          const r = rows.get(account)!
          const now = { name: r.data[d.who.name], zone, life: life(d, r) }
          const was = p.members[account]
          if (was.name === now.name && was.zone === now.zone && was.life === now.life) continue
          p.members[account] = { ...was, ...now }
          post(w, d.hub, 'parties', 'ask', 'status', account, now.name, zone, now.life, null)
        }
      }
    },
    acts: {
      ...Object.fromEntries(VERBS.map(verb => [verb, (me: Row, w: W, seat: number, arg?: unknown) => {
        const d = me.data
        if (NAMED.includes(verb) && (typeof arg !== 'string' || !arg)) return
        const r = w.all(d.who.kind).find(r => r.data[d.who.seat] === seat)
        if (!r || !allowed(d, seat)) return
        post(w, d.hub, 'parties', 'ask', verb, r.data[d.who.account], r.data[d.who.name], here(w), life(d, r), NAMED.includes(verb) ? arg as string : null)
      }])),
      ask(me, w, _seat, verb: string, account: string, name: string, zone: string, lifeNow: number, arg: string | null) {
        ask(me, w, verb, account, name, zone, lifeNow, arg)
      },
      invited(_me, w, _seat, account: string, from: string, name: string) {
        const s = seatOf(w, account)
        if (s) s.data.invite = { from, name }
      },
      uninvited(_me, w, _seat, account: string) {
        const s = seatOf(w, account)
        if (s) s.data.invite = null
      },
      mirror(_me, w, _seat, json: string) {
        const p: Party = JSON.parse(json)
        const m = w.all('partymirror').find(r => r.data.key === p.key)
        if (!Object.keys(p.members).length) return m && w.end(m)
        if (m) Object.assign(m.data, p)
        else w.spawn('partymirror', p)
      },
    },
    open: [...VERBS, 'ask', 'invited', 'uninvited', 'mirror'],
  }
  return { parties, party: {}, partymirror: {}, partyseat: {} }
}
