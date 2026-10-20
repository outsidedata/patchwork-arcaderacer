// Accounts: who a connection is, settled at the connection before anything it sends reaches a
// truth. `accounts(accept(row), store, rules)` wraps the server's side of a seat (`Accept` in the
// loopback addon) and hands back one of the same shape for a transport to serve. Each connection is
// handed to the wrapped `accept` at once, so it is seated on the entry scene and sent its packets
// from the first step, as a login screen must be drawn; what it sends is the other half. An up that
// asks to log in is answered here and never passed on. Every other up passes to the seat only once
// the connection is logged in, and before that it is dropped, the way the engine drops a message a
// seat may not send: no answer, no throw.
//
// The ups it answers, each numbered `ask` by the page so the answer can name it:
//
//   { ask, register: { name, secret } }   makes an account and logs the connection in as it
//   { ask, login: { name, secret } }      logs the connection in
//   { ask, token }                        logs it in again with the token of an earlier login
//
// and the downs it answers with, beside the manager's envelopes on the same wire:
//
//   { signed: { ask, account, token } }   logged in as the account uid; `token` logs back in later
//   { refused: { ask, why, wait? } }      not logged in, and why:
//     wrong     no account has that name and secret (one answer for both, so a login never says
//               which names exist)
//     taken     register: an account has the name
//     name      register: the name is not `rules.name`'s shape
//     secret    register: the secret is not `rules.secret`'s length
//     token     the token is unknown or expired, and the page forgets it
//     slow      too many asks: `wait` is the milliseconds until one more is let through
//     busy      an ask of this connection's is still being answered
//     signed    the connection is logged in already
//     down      the store failed; the error is logged, never the ask
//     elsewhere sent with `ask: 0` to a connection whose account has just logged in on another:
//               that connection's seat is let go and it is logged out, so one account is never
//               seated twice and never loads its characters into two truths at once. It may log
//               in again, and is seated on the entry scene anew.
//
// A name is folded (NFKC, lower case) before anything reads it, so `Bill` and `bill` are one
// account; the folded name is the one kept. A register or login whose name or secret is not a
// string is dropped whole, as a malformed message is.
//
// On success the connection carries the account uid. `account(seat)` hands it back for the seat the
// wrapped `accept` made, or `undefined` before a login, and the `logged` handed to `accounts` is
// called with both the moment it is carried: the manager reads a connection's account from either.
//
// Secrets. An account's record keeps a scrypt hash of its secret (`node:crypto`) under a salt of its
// own and the scrypt numbers it was hashed with, so raising `rules.scrypt` later still checks every
// older record. A login hashes the secret it was sent with the record's salt and compares the two
// hashes in constant time (`timingSafeEqual`); a name with no account is hashed against a fresh salt
// all the same, so an unknown name costs what a wrong secret costs. The secret is read off the ask,
// hashed, and let go: it never enters a truth, a row, a record, a journal, a log or an error.
//
// Limits. A connection may ask `limit.connection` times in any `limit.window` milliseconds, every
// kind of ask counted, and a name may fail to log in `limit.name` times in any window, from any
// connections: a failure after that is `slow` until the oldest leaves the window, and a login that
// succeeds clears its name's failures. Both are counted before any hashing, so a flood costs no
// scrypt. They are counted in this process, which is the one process that serves the connections
// of a store; a limit per address is the transport's, which knows the address. Anyone may spend a
// name's failures, so a name being guessed at is shut to secrets for a window; a page that kept its
// token still logs in with it, since a token is counted per connection and never per name.
//
// Tokens. Each login hands back a new random token of `token.bytes` bytes, base64url. The store
// keeps only its SHA-256, under which a `session` record names the account and the millisecond it
// expires, `token.ttl` after it was made. A token logs in once: that login drops its session and
// hands back a new token, so a stolen token and the page's own race, and the loser logs in with its
// secret. Each new session drops the account's expired ones, and `accounts` drops every expired
// session in the store when it is called, so an account nobody logs in to again leaves none behind
// past the next start of the server.
//
// The rules are the manager scene's `accounts` prefab, handed to `accounts` whole and checked:
//
//   name    { min, max, pattern }   a folded name's length, and a regular expression it matches
//   secret  { min, max }            a secret's length
//   scrypt  { N, r, p, keylen, salt }   scrypt's cost (N a power of two), block size,
//                                   parallelism, hash bytes, and salt bytes
//   token   { bytes, ttl }          a token's random bytes, and the milliseconds a session lasts
//   limit   { connection, name, window }   asks per connection, failed logins per name, and the
//                                   milliseconds both are counted over
//
// Every child inherits the manager's prefabs, so a page reads the same rules off
// `plugins.wire.scene.prefabs.accounts` and can tell a player a name is too short before asking.
// Nothing in them is secret: they are what any player could learn by trying.
//
// The store is the persist addon's (`Store` in `addons/persist/persist.addon.ts`): the server file
// opens one on the manager's `persist` prefab and hands the same one to `persist` and to this. Its
// records here are of two kinds no game names: `account`, keyed by `uid` (`{ uid, name, salt, hash,
// N, r, p, keylen }`), and `session`, keyed by the token's hash (`{ hash, account, until }`). Records
// of a game name an account by that `uid`, never by its name. A register holds its name in this
// process until its record is saved, so two registers of one name at once make one account.
//
// Plain `ws` carries the secret as it was typed, to anyone on the path. The server file serves
// `wss` when it is given a certificate, and a page on it dials `wss://`.
//
// The page's side. `signin(wire, keep?)` wraps the page's wire before `link` is handed it: it takes
// the answers off the wire, so `view` is only ever handed the manager's envelopes, and puts a door
// on the link. `login(link, name, secret)`, `register(link, name, secret)` and `relogin(link)`
// send an ask through that door, and each returns a promise of `{ account }` or `{ why, wait? }`.
// `who(link)` is the account the page is logged in as, or `undefined`. `keep` is where the token
// lives between loads of the page, `get()` and `set(token | null)`: each login's token is set there,
// `relogin` sends what `get()` hands back, and a `token` refusal sets `null`. Without `keep` a token
// is not kept. The page asks one thing at a time, as the server answers one at a time.
//
// So the lines that name the transport become `serve(port, accounts(accept(row), store, rules))` in
// `<game>.server.ts`, `link(signin(dial(url), keep))` in `client.html` and
// `link(signin(loopback(local(accept(row)))))` in `index.html`.
//
// `local(accept)` is `index.html`'s, one tab holding the page and every truth: no password and no
// store. Every connection is logged in at once as the one local profile, account `LOCAL`, which is
// told to the page as it connects, and every ask is answered with it. The profile is the tab's, as
// its IndexedDB is, so every record a game files under it is that browser's.
//
// `node:crypto` is reached only inside `accounts`, so a page, which imports this file for `signin`
// and `local`, never loads it.
import type { Accept, Wire } from '#addons/loopback/loopback.addon.ts'
import type { Link } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Store } from '#addons/persist/persist.addon.ts'

export type Rules = {
  name: { min: number; max: number; pattern: string }
  secret: { min: number; max: number }
  scrypt: { N: number; r: number; p: number; keylen: number; salt: number }
  token: { bytes: number; ttl: number }
  limit: { connection: number; name: number; window: number }
}
type Cred = { name: string; secret: string }
export type Ask = { ask: number } & ({ register: Cred } | { login: Cred } | { token: string })
export type Why = 'wrong' | 'taken' | 'name' | 'secret' | 'token' | 'slow' | 'busy' | 'signed' | 'down' | 'elsewhere'
export type Told = { signed: { ask: number; account: string; token: string | null } } | { refused: { ask: number; why: Why; wait?: number } }
export type Result = { account: string } | { why: Why | 'closed'; wait?: number }
export type Keep = { get(): string | null; set(token: string | null): void }
type Seat = ReturnType<Accept<unknown, unknown>>

export const LOCAL = 'local'

// The account each seat's connection is logged in as.
const told = new WeakMap<Seat, string>()
export const account = (seat: Seat): string | undefined => told.get(seat)

const asked = (up: unknown): up is Ask =>
  typeof up === 'object' && up !== null && ('register' in up || 'login' in up || 'token' in up)

// ---------------------------------------------------------------- rules

const whole = (v: unknown, at: string, least = 1) => {
  if (!Number.isSafeInteger(v) || (v as number) < least) throw new Error(`accounts ${at} is ${JSON.stringify(v)}: a whole number, ${least} or more`)
}

function checked(r: Rules): Rules {
  if (typeof r !== 'object' || r === null) throw new Error('the manager scene has no accounts prefab')
  whole(r.name?.min, 'name.min')
  whole(r.name?.max, 'name.max', r.name.min)
  if (typeof r.name.pattern !== 'string') throw new Error('accounts name.pattern is not a regular expression')
  new RegExp(r.name.pattern, 'u')
  whole(r.secret?.min, 'secret.min')
  whole(r.secret?.max, 'secret.max', r.secret.min)
  whole(r.scrypt?.N, 'scrypt.N', 2)
  if ((r.scrypt.N & (r.scrypt.N - 1)) !== 0) throw new Error(`accounts scrypt.N is ${r.scrypt.N}: a power of two`)
  for (const k of ['r', 'p', 'keylen', 'salt'] as const) whole(r.scrypt[k], `scrypt.${k}`)
  whole(r.token?.bytes, 'token.bytes', 16)
  whole(r.token.ttl, 'token.ttl')
  for (const k of ['connection', 'name', 'window'] as const) whole(r.limit?.[k], `limit.${k}`)
  return r
}

// ---------------------------------------------------------------- the server's side

const fold = (name: string) => name.normalize('NFKC').toLowerCase()

// Times in the last `window` milliseconds, per key: an ask of a connection, a failure of a name.
function counter(window: number) {
  const times = new Map<string, number[]>()
  let swept = 0
  const live = (key: string, now: number) => {
    const t = (times.get(key) ?? []).filter(at => at > now - window)
    if (t.length) times.set(key, t)
    else times.delete(key)
    return t
  }
  return {
    // The milliseconds until one more fits under `most`, or 0 when it fits now.
    wait(key: string, most: number, now: number) {
      // Every key is swept once a window, so names nobody asks for again do not pile up.
      if (now - swept >= window) { for (const k of [...times.keys()]) live(k, now); swept = now }
      const t = live(key, now)
      return t.length < most ? 0 : t[t.length - most] + window - now
    },
    add(key: string, now: number) { times.set(key, [...live(key, now), now]) },
    clear(key: string) { times.delete(key) },
  }
}

type Conn = { seat: Seat | undefined; uid: string | undefined; busy: boolean; closed: boolean; key: string; send(t: Told): void; out(): void }

export function accounts<U, D>(inner: Accept<U, D>, store: Store, rules: Rules, logged?: (uid: string, seat: Seat) => void): Accept<U | Ask, D | Told> {
  const { name: nr, secret: sr, scrypt: sc, token: tr, limit } = checked(rules)
  const pattern = new RegExp(nr.pattern, 'u')
  // Taken from node itself rather than imported, as `sqlite` takes `node:sqlite`: the page imports
  // this file and must never load it.
  const crypto = process.getBuiltinModule('node:crypto')
  const hash = (secret: string, salt: Buffer, p: { N: number; r: number; p: number; keylen: number }) =>
    new Promise<Buffer>((ok, fail) => crypto.scrypt(secret, salt, p.keylen, { N: p.N, r: p.r, p: p.p, maxmem: 256 * p.N * p.r * p.p }, (e, key) => (e ? fail(e) : ok(key))))
  const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex')
  const tokenLength = Math.ceil((tr.bytes * 8) / 6)

  const asks = counter(limit.window)
  const failures = counter(limit.window)
  const registering = new Set<string>()
  const live = new Map<string, Conn>()
  let conns = 0

  void store.load('session')
    .then(all => Promise.all(all.filter(s => s.until <= Date.now()).map(s => store.drop('session', s.hash))))
    .catch(e => console.error(`accounts could not sweep expired sessions: ${e.message}`))

  const session = async (uid: string, now: number) => {
    for (const s of await store.load('session', { account: uid })) if (s.until <= now) await store.drop('session', s.hash)
    const token = crypto.randomBytes(tr.bytes).toString('base64url')
    const h = digest(token)
    await store.save('session', h, { hash: h, account: uid, until: now + tr.ttl })
    return { token, hash: h }
  }

  const bind = (c: Conn, uid: string, send: (d: D | Told) => void) => {
    const other = live.get(uid)
    if (other && other !== c) other.out()
    if (!c.seat) c.seat = inner(send)
    c.uid = uid
    live.set(uid, c)
    told.set(c.seat, uid)
    logged?.(uid, c.seat)
  }

  // One ask, answered. Everything read off it is checked here, since it arrives from outside.
  const answer = async (c: Conn, a: Ask, send: (d: D | Told) => void) => {
    const ask = Number.isSafeInteger(a.ask) ? a.ask : 0
    const refuse = (why: Why, wait?: number) => c.send({ refused: wait === undefined ? { ask, why } : { ask, why, wait } })
    const cred = 'register' in a ? a.register : 'login' in a ? a.login : undefined
    if (cred !== undefined && (typeof cred !== 'object' || cred === null || typeof cred.name !== 'string' || typeof cred.secret !== 'string')) return
    if ('token' in a && cred === undefined && typeof a.token !== 'string') return
    const now = Date.now()
    const wait = asks.wait(c.key, limit.connection, now)
    if (wait) return refuse('slow', wait)
    asks.add(c.key, now)
    if (c.busy) return refuse('busy')
    if (c.uid) return refuse('signed')
    c.busy = true
    try {
      // Each await may be the last thing this connection sees: one that closed meanwhile is sent
      // nothing and logged in as nobody, and a session made for it is dropped.
      const done = async (uid: string) => {
        if (c.closed) return
        const s = await session(uid, Date.now())
        if (c.closed) return store.drop('session', s.hash)
        bind(c, uid, send)
        c.send({ signed: { ask, account: uid, token: s.token } })
      }
      if ('register' in a) {
        const name = fold(a.register.name), secret = a.register.secret
        if (name.length < nr.min || name.length > nr.max || !pattern.test(name)) return refuse('name')
        if (secret.length < sr.min || secret.length > sr.max) return refuse('secret')
        if (registering.has(name)) return refuse('taken')
        registering.add(name)
        try {
          if ((await store.load('account', { name })).length) return refuse('taken')
          const salt = crypto.randomBytes(sc.salt)
          const key = await hash(secret, salt, sc)
          const uid = crypto.randomUUID()
          await store.save('account', uid, { uid, name, salt: salt.toString('hex'), hash: key.toString('hex'), N: sc.N, r: sc.r, p: sc.p, keylen: sc.keylen })
          return await done(uid)
        } finally { registering.delete(name) }
      }
      if ('login' in a) {
        const name = fold(a.login.name), secret = a.login.secret
        const fails = failures.wait(name, limit.name, now)
        if (fails) return refuse('slow', fails)
        // Counted as a failure from the moment it is asked, so logins of one name at once from many
        // connections are all counted before any of them is hashed; one that succeeds clears it.
        failures.add(name, now)
        // A secret longer than `secret.max` is no account's, and is hashed no further than that.
        const [record] = secret.length > sr.max ? [] : await store.load('account', { name })
        const key = await hash(secret.slice(0, sr.max), record ? Buffer.from(record.salt, 'hex') : crypto.randomBytes(sc.salt), record ?? sc)
        if (!record || !crypto.timingSafeEqual(key, Buffer.from(record.hash, 'hex'))) return refuse('wrong')
        failures.clear(name)
        return await done(record.uid)
      }
      const token = a.token
      if (token.length !== tokenLength || !/^[A-Za-z0-9_-]+$/.test(token)) return refuse('token')
      const h = digest(token)
      // Found by its hash: the token itself is compared nowhere, so no compare of it can be timed.
      const [s] = await store.load('session', { hash: h })
      if (!s) return refuse('token')
      await store.drop('session', s.hash)
      if (s.until <= Date.now()) return refuse('token')
      return await done(s.account)
    } catch (e) {
      console.error(`accounts could not answer a ${'register' in a ? 'register' : 'login' in a ? 'login' : 'token'}: ${(e as Error).message}`)
      if (!c.closed) refuse('down')
    } finally {
      c.busy = false
    }
  }

  return send => {
    const c: Conn = {
      seat: inner(send),
      uid: undefined,
      busy: false,
      closed: false,
      key: String(conns++),
      send: t => { if (!c.closed) send(t) },
      // Logged in elsewhere: told so, logged out, and its seat let go.
      out() {
        c.send({ refused: { ask: 0, why: 'elsewhere' } })
        const seat = c.seat
        c.seat = undefined
        c.uid = undefined
        if (seat) { told.delete(seat); seat.close() }
      },
    }
    return {
      take(up) {
        if (c.closed) return
        if (asked(up)) { void answer(c, up, send); return }
        if (c.uid && c.seat) c.seat.take(up as U)
      },
      close() {
        if (c.closed) return
        c.closed = true
        asks.clear(c.key)
        if (c.uid && live.get(c.uid) === c) live.delete(c.uid)
        c.seat?.close()
        if (c.seat) told.delete(c.seat)
      },
    }
  }
}

// `index.html`'s: every connection is the local profile from the start, and every ask is told so.
export function local<U, D>(inner: Accept<U, D>, logged?: (uid: string, seat: Seat) => void): Accept<U | Ask, D | Told> {
  return send => {
    const seat = inner(send)
    told.set(seat, LOCAL)
    logged?.(LOCAL, seat)
    send({ signed: { ask: 0, account: LOCAL, token: null } })
    return {
      take(up) {
        if (asked(up)) send({ signed: { ask: Number.isSafeInteger(up.ask) ? up.ask : 0, account: LOCAL, token: null } })
        else seat.take(up as U)
      },
      close: () => seat.close(),
    }
  }
}

// ---------------------------------------------------------------- the page's side

type Door = { who: string | undefined; keep: Keep | undefined; ask(body: Record<string, unknown>): Promise<Result> }
const DOOR = Symbol('accounts')

const isTold = (d: unknown): d is Told => typeof d === 'object' && d !== null && ('signed' in d || 'refused' in d)

// The page's wire, with the answers taken off it and a door put on it. `link` spreads what a wire
// hands back into the link it makes, so the door is on the link every client's `scenemanager`
// plugin holds.
export function signin<U, D>(wire: Wire<U | Ask, D | Told>, keep?: Keep): Wire<U, D> {
  return fan => {
    let n = 0
    const waiting = new Map<number, (r: Result) => void>()
    const door: Door = {
      who: undefined,
      keep,
      ask(body) {
        const ask = ++n
        return new Promise<Result>(ok => {
          waiting.set(ask, ok)
          end.send({ ask, ...body } as Ask)
        })
      },
    }
    const end = wire(d => {
      if (!isTold(d)) return fan(d as D)
      const ask = 'signed' in d ? d.signed.ask : d.refused.ask
      if ('signed' in d) {
        door.who = d.signed.account
        if (d.signed.token !== null) keep?.set(d.signed.token)
      } else if (d.refused.why === 'elsewhere') door.who = undefined
      else if (d.refused.why === 'token') keep?.set(null)
      const ok = waiting.get(ask)
      if (!ok) return
      waiting.delete(ask)
      ok('signed' in d ? { account: d.signed.account } : d.refused.wait === undefined ? { why: d.refused.why } : { why: d.refused.why, wait: d.refused.wait })
    })
    const made = {
      send: (u: U) => end.send(u),
      close() {
        end.close()
        for (const ok of waiting.values()) ok({ why: 'closed' })
        waiting.clear()
      },
      [DOOR]: door,
    }
    return made
  }
}

const doorOf = (link: Link): Door => {
  const door = (link as Link & { [DOOR]?: Door })[DOOR]
  if (!door) throw new Error('this link was not made on a signin wire')
  return door
}

export const who = (link: Link) => doorOf(link).who
export const login = (link: Link, name: string, secret: string) => doorOf(link).ask({ login: { name, secret } })
export const register = (link: Link, name: string, secret: string) => doorOf(link).ask({ register: { name, secret } })
export function relogin(link: Link): Promise<Result> {
  const door = doorOf(link)
  const token = door.keep?.get() ?? null
  return token === null ? Promise.resolve({ why: 'token' }) : door.ask({ token })
}
