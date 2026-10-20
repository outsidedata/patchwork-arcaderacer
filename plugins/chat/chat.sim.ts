// The server half of chat: lines a seat says, on four channels, kept on rows as keyed rings.
//
// The rows. One `chat` row per truth, an `actors` entry of every scene that talks and of the hub,
// holds the lines of the two channels every seat of a truth reads alike: `channels.zone` and
// `channels.global`, each a ring `{ seq, lines: { <seq>: line } }` of the last `keep` lines. A line is
// `{ from, account, text, n }`: the speaker's name and account, what was said, and the chat row's own
// step it arrived on. Adding a line is one key added and the key `keep` behind it deleted, so #9 sends
// one line per `say` and never the ring. The lines one account reads alone, `party` and `whisper`, are
// on a `chatbox` row of that account's, `{ account, channels: { party, whisper } }`, rings of the same
// shape, spawned the first time a line reaches that account in this truth and ended in the chat row's
// `before` once no row of the account is here. Its `owner` is the account's player row, so a scene
// whose `security` block lists `chatbox: { channels: 'me' }` sends every other seat the chatbox
// without its lines; the browser half finds the seat's own chatbox as the one whose `channels` it was
// sent, and throws when the scene talks on party or whisper and its security lists no chatbox
// channels. A whisper echoed to its speaker carries `to: { account, name }`.
//
// The speaker. `who` in the prefab names the kind whose row stands for a seat and three of its
// fields: `seat`, holding the truth's seat number the row's seat speaks from (a `player` row keeps
// the number its `arrive` act was handed), `account` and `name`. `say` finds the row whose `seat`
// field is the seat that sent it, and a seat with none says nothing. The chatbox's `owner` is that
// row's `owner`, or the row itself when it has none.
//
// The act. `say(channel, text, to?, toName?)` is `open`, so any seat sends it at the chat row. It is
// dropped unless `channel` is one of the prefab's `talk` list (a scene that turns whisper or global
// chat off leaves it out), `text` is a string, not blank, of at most `length` characters, and the
// seat is within its rate. The rate is a next-allowed step per seat, `next[seat]`, on the chat row's
// own count `n`, which its `before` adds one to, since a rule cannot read the engine's step counter:
// each line moves the seat's next-allowed step on by `rate.gap` steps from the later of it and now,
// and a line is dropped when that would put it more than `gap × (burst − 1)` steps ahead of now. So
// a seat says `burst` lines at once and then one every `gap` steps. A seat's entry is deleted once
// its step has come, when it no longer holds anything back.
//
// The channels.
// - zone: the line goes on this truth's `chat` row, which every seat here reads.
// - whisper: `to` is an account; the line is mailed straight to `{ account: to }` as `hear`, and
//   echoed on the speaker's own chatbox with `to: { account: to, name: toName }`.
// - party: mailed to the hub's `chat` row as `relay`, which mails `hear` to every member account of
//   the speaker's party, the speaker's own truth included; a speaker in no party is heard by nobody.
// - global: mailed to the hub as `relay`, which mails `hear` to every live copy of each scene the
//   prefab's `scenes` lists, as a `{ scene }` broadcast.
// `hear(channel, from, account, text, reader)` adds the line: a zone or global line to the chat row,
// a party or whisper line to the chatbox of `reader`, when that account has a row here.
//
// Mail between truths is the `post(w, to, kind, act, ...args)` this plugin is handed: an act on the
// first row of `kind` in the truth `to` names. It takes it as a parameter, `chat(post, members)`,
// with `members(w, account)`, every account of that account's party as the hub's party rows hold it
// (`plugins/party`), since one plugin never imports another; the game's sim hands both in. `relay`
// and `hear` are `open`, because the post seat possesses no row.
import type { Arg, Kind, Row, W } from '#engine/engine.ts'

export type To = string | { account: string } | { scene: string }
export type Post = (w: W, to: To, kind: string, act: string, ...args: Arg[]) => void
export type Members = (w: W, account: string) => string[]

export type Line = { from: string; account: string; text: string; n: number; to?: { account: string; name: string } }
export type Ring = { seq: number; lines: Record<string, Line> }
export type Who = { kind: string; seat: string; account: string; name: string }

const SHARED = ['zone', 'global']

const add = (ring: Ring, keep: number, line: Line) => {
  ring.seq++
  ring.lines[ring.seq] = line
  delete ring.lines[ring.seq - keep]
}

// The row of `who.kind` standing for this seat, or for this account.
const bySeat = (w: W, who: Who, seat: number) => w.all(who.kind).find(r => r.data[who.seat] === seat)
const byAccount = (w: W, who: Who, account: string) => w.all(who.kind).find(r => r.data[who.account] === account)

// Whether the seat may say a line on the chat row's step `n`, moving its next-allowed step on if so.
export function allowed(d: { n: number; next: Record<string, number>; rate: { gap: number; burst: number } }, seat: number): boolean {
  const at = Math.max(d.next[seat] ?? d.n, d.n)
  if (at - d.n > d.rate.gap * (d.rate.burst - 1)) return false
  d.next[seat] = at + d.rate.gap
  return true
}

export function chat(post: Post, members: Members): { chat: Kind; chatbox: Kind } {
  // The chatbox of `account` here, spawned when it has none, owned by the account's row: or nothing,
  // when no row of the account is here to read it.
  const box = (w: W, d: any, account: string): Row | undefined => {
    const reader = byAccount(w, d.who, account)
    if (!reader) return undefined
    const row = w.all('chatbox').find(r => r.data.account === account) ?? w.spawn('chatbox', { account })
    row.data.owner = reader.data.owner ?? reader.id
    return row
  }

  const chat: Kind = {
    before(me, _dt, w) {
      const d = me.data
      d.n++
      for (const [seat, at] of Object.entries(d.next as Record<string, number>)) if (at <= d.n) delete d.next[seat]
      for (const b of w.all('chatbox')) if (!byAccount(w, d.who, b.data.account)) w.end(b)
    },
    acts: {
      say(me, w, seat, channel: unknown, text: unknown, to?: unknown, toName?: unknown) {
        const d = me.data
        if (typeof channel !== 'string' || !(d.talk as string[]).includes(channel)) return
        if (typeof text !== 'string' || !text.trim() || text.length > d.length) return
        if (channel === 'whisper' && (typeof to !== 'string' || !to || typeof toName !== 'string')) return
        const speaker = bySeat(w, d.who, seat)
        if (!speaker || !allowed(d, seat)) return
        const from: string = speaker.data[d.who.name], account: string = speaker.data[d.who.account]
        if (channel === 'zone') add(d.channels.zone, d.keep, { from, account, text, n: d.n })
        else if (channel === 'whisper') {
          post(w, { account: to as string }, 'chat', 'hear', 'whisper', from, account, text, to as string)
          const mine = box(w, d, account)
          if (mine) add(mine.data.channels.whisper, d.keep, { from, account, text, n: d.n, to: { account: to as string, name: toName as string } })
        } else post(w, d.hub, 'chat', 'relay', channel, from, account, text)
      },
      relay(me, w, _seat, channel: string, from: string, account: string, text: string) {
        if (channel === 'party') for (const m of members(w, account)) post(w, { account: m }, 'chat', 'hear', 'party', from, account, text, m)
        else if (channel === 'global') for (const scene of me.data.scenes as string[]) post(w, { scene }, 'chat', 'hear', 'global', from, account, text, null)
      },
      hear(me, w, _seat, channel: string, from: string, account: string, text: string, reader: string | null) {
        const d = me.data
        const line = { from, account, text, n: d.n }
        if (SHARED.includes(channel)) return add(d.channels[channel], d.keep, line)
        const b = box(w, d, reader as string)
        if (b) add(b.data.channels[channel], d.keep, line)
      },
    },
    open: ['say', 'relay', 'hear'],
  }
  return { chat, chatbox: {} }
}
