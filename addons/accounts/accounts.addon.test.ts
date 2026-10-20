// Accounts on a game the test writes: its manager, whose scene file is given an `accounts` prefab
// here, and a page's link made as a page makes one, `link(signin(loopback(accounts(accept(row),
// store, rules))))`, over the persist addon's `sqlite` in a temp file per test. A page asks with
// `login`, `register` and `relogin` on its link, and sends the game's acts as its player plugin would:
// up the link, at a row of the last packet it was sent. The hall is the game's entry scene, so a seat
// in these tests is in the hall from the step it connects, where its `player` row forwards `turn` to
// its `body`, which is what the tests read to see whether an up reached the truth.
// The limits and the token's life are counted in milliseconds of `Date.now()`, which the tests that
// need them move by hand; scrypt's cost is low here so the suite runs fast.
import { afterAll, afterEach, expect, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type Truth } from '#engine/engine.ts'
import { accept, link, load, manager, scenes, type Down, type Link } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { heard } from '#addons/heard/heard.addon.ts'
import { sqlite, type Store } from '#addons/persist/persist.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { possessed } from '#addons/player/player.addon.ts'
import { account, accounts, local, LOCAL, login, register, relogin, signin, who, type Keep, type Rules } from './accounts.addon.ts'

const dir = mkdtempSync(join(tmpdir(), 'accounts-'))
afterAll(() => rmSync(dir, { recursive: true }))

// The game, written into `dir/game` as a game folder is: a manager of one scene, `hall`, which every
// connection enters. A seat's `player` row spawns its `body` and forwards `turn` to it, and the body
// keeps the sign of what it was sent. Every connection a test opens is seated at once, logged in or
// not, so the hall has more seats than any test opens connections.
const DT = 1 / 60
const SCENEMANAGER = new URL('../../plugins/scenemanager/scenemanager.sim.ts', import.meta.url).pathname
const game = join(dir, 'game')
mkdirSync(game)
const hall: Scene = {
  world: {},
  plugins: ['scenemanager', 'player'],
  seats: 64,
  prefabs: { engine: { dt: DT, width: 640, height: 480 }, scenemanager: { out: {} }, player: { seat: 0, body: 0 }, body: { turn: 0 } },
  actors: [{ is: 'scenemanager' }],
}
writeFileSync(join(game, 'hall.scene.json'), JSON.stringify(hall))
writeFileSync(join(game, 'hall.sim.ts'), `import { scenemanager } from ${JSON.stringify(SCENEMANAGER)}
import file from './hall.scene.json' with { type: 'json' }
export const player = {
  before(me, _dt, w) { if (!me.data.body) me.data.body = w.spawn('body', {}).id },
  acts: { turn(me, w, seat, v) { if (me.data.body) w.call(w.get(me.data.body), 'turn', seat, v) } },
}
export const body = { acts: { turn(me, _w, _seat, v) { me.data.turn = Math.sign(v) } } }
export const sim = { scenemanager, player, body }
export const scene = file
`)
const file: Scene = {
  world: {},
  plugins: ['scenemanager'],
  seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { hall: { file: 'hall.scene.json', suspend: true } }, dt: DT, entry: 'hall', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}
const sim = { scenemanager }
const here = pathToFileURL(game + '/').href

const BUSY = 5000
const WINDOW = 60_000
const TTL = 3_600_000
const RULES: Rules = {
  name: { min: 3, max: 16, pattern: '^[a-z0-9_]+$' },
  secret: { min: 8, max: 64 },
  scrypt: { N: 1024, r: 8, p: 1, keylen: 32, salt: 16 },
  token: { bytes: 32, ttl: TTL },
  limit: { connection: 6, name: 3, window: WINDOW },
}
const SECRET = 'correct-horse-Qz7!battery'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
let files = 0

const start = async (rules: Rules = RULES, wrap: (s: Store) => Store = s => s) => {
  const scene = { ...structuredClone(file), prefabs: { ...structuredClone(file.prefabs), accounts: rules } }
  const truth = boot(scene, sim)
  await load(truth, here)
  const row = manager(truth)
  const path = join(dir, `${++files}.db`)
  const store = await sqlite(path, BUSY)
  const logged: [string, object][] = []
  const guarded = accounts(accept(row), wrap(store), scene.prefabs.accounts as Rules, (uid, seat) => logged.push([uid, seat]))
  return { truth, row, store, path, logged, guarded, hall: scenes(row).get('hall')! }
}
type Game = Awaited<ReturnType<typeof start>>

const step = (truth: Truth, k: number) => { for (let i = 0; i < k; i++) truth.step(DT) }

// A page's link, the envelopes it heard, and a send of a game's act at a row of its last packet.
const page = (l: Link) => {
  const heard: Down[] = []
  l.hear(d => heard.push(d))
  let seq = 0
  const last = () => heard[heard.length - 1]
  const mine = (): Row | undefined => (last() ? possessed(last()!.packet.rows) : undefined)
  return {
    link: l,
    heard,
    mine,
    say(kind: string, action: string, ...args: any[]) {
      // A seat is sent every player row, and speaks to its own, the one that is `mine`.
      const target = kind === 'player' ? possessed(last().packet.rows) : last().packet.rows.find(r => r.kind === kind)
      if (!target) throw new Error(`no ${kind} row in this seat's packet`)
      l.send({ scene: last().scene, seat: last().seat, msg: { seq: ++seq, n: last().packet.n, id: target.id, action, args } })
    },
  }
}
const open = (g: Game, keep?: Keep) => page(link(signin(loopback(g.guarded), keep)))
const kept = (): Keep & { token: string | null } => ({ token: null, get() { return this.token }, set(t) { this.token = t } })

// The body the page's seat walks in the hall, read off the truth.
const body = (g: Game, p: ReturnType<typeof page>) => g.hall.rows.find(r => r.id === p.mine()!.data.body)!

test('register makes an account and logs the connection in; a login on another connection is the same account', async () => {
  const g = await start()
  const a = open(g)
  step(g.truth, 2)
  expect(who(a.link)).toBeUndefined()
  const made = await register(a.link, 'Bill', SECRET)
  expect(made).toEqual({ account: expect.any(String) })
  const uid = (made as { account: string }).account
  expect(who(a.link)).toBe(uid)
  // The account the connection carries is handed to the callback with the seat the manager made,
  // and `account` reads it back off that seat.
  expect(g.logged.map(([u]) => u)).toEqual([uid])
  expect(account(g.logged[0][1] as any)).toBe(uid)
  const [record] = await g.store.load('account', { name: 'bill' })
  expect(Object.keys(record).sort()).toEqual(['N', 'hash', 'keylen', 'name', 'p', 'r', 'salt', 'uid'])
  expect(record).toMatchObject({ uid, name: 'bill', N: RULES.scrypt.N, keylen: RULES.scrypt.keylen })
  expect(record.salt).toHaveLength(RULES.scrypt.salt * 2)

  const b = open(g)
  expect(await login(b.link, 'BILL', SECRET)).toEqual({ account: uid })
  expect(who(b.link)).toBe(uid)
})

test('each account has a salt of its own, so one secret is two hashes', async () => {
  const g = await start()
  await register(open(g).link, 'one', SECRET)
  await register(open(g).link, 'two', SECRET)
  const [one, two] = [(await g.store.load('account', { name: 'one' }))[0], (await g.store.load('account', { name: 'two' }))[0]]
  expect(one.salt).not.toBe(two.salt)
  expect(one.hash).not.toBe(two.hash)
})

test('a wrong secret and an unknown name are one answer, and neither logs in', async () => {
  const g = await start()
  await register(open(g).link, 'bill', SECRET)
  const b = open(g)
  expect(await login(b.link, 'bill', SECRET + 'x')).toEqual({ why: 'wrong' })
  expect(await login(b.link, 'nobody', SECRET)).toEqual({ why: 'wrong' })
  expect(await login(b.link, 'bill', 'x'.repeat(RULES.secret.max + 1))).toEqual({ why: 'wrong' })
  expect(who(b.link)).toBeUndefined()
  expect(g.logged).toHaveLength(1)
})

test('a name is one account however it is cased, and two registers of it at once make one', async () => {
  const g = await start()
  await register(open(g).link, 'bill', SECRET)
  expect(await register(open(g).link, 'Bill', 'another-secret')).toEqual({ why: 'taken' })
  const both = await Promise.all([register(open(g).link, 'ann', SECRET), register(open(g).link, 'ANN', SECRET)])
  expect(both.filter(r => 'account' in r)).toHaveLength(1)
  expect(both.filter(r => 'why' in r)).toEqual([{ why: 'taken' }])
  expect(await g.store.load('account', { name: 'ann' })).toHaveLength(1)
})

test('register refuses a name or a secret the rules do not allow', async () => {
  const g = await start()
  const a = open(g)
  for (const name of ['ab', 'x'.repeat(17), 'no spaces', 'semi;colon']) expect(await register(a.link, name, SECRET)).toEqual({ why: 'name' })
  for (const secret of ['short', 'y'.repeat(65)]) expect(await register(a.link, 'fine_name', secret)).toEqual({ why: 'secret' })
  expect(await g.store.load('account')).toEqual([])
})

test('a connection may ask limit.connection times a window, whatever it asks, and then waits', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000_000)
  const g = await start()
  await register(open(g).link, 'bill', SECRET)
  const a = open(g)
  for (let i = 0; i < RULES.limit.connection; i++) {
    vi.setSystemTime(1_000_000 + i * 1000)
    expect(await login(a.link, `name${i}`, SECRET)).toEqual({ why: 'wrong' })
  }
  expect(await login(a.link, 'bill', SECRET)).toEqual({ why: 'slow', wait: WINDOW - (RULES.limit.connection - 1) * 1000 })
  // Another connection is not held back by this one.
  expect(await login(open(g).link, 'bill', SECRET)).toEqual({ account: expect.any(String) })
  // Once the oldest ask leaves the window, one more is let through.
  vi.setSystemTime(1_000_000 + WINDOW + 1)
  expect(await login(a.link, 'bill', SECRET)).toEqual({ account: expect.any(String) })
})

test('a name may fail limit.name times a window from any connections, and a login that succeeds clears it', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(5_000_000)
  const g = await start()
  await register(open(g).link, 'bill', SECRET)
  for (let i = 0; i < RULES.limit.name; i++) expect(await login(open(g).link, 'bill', 'wrong-secret')).toEqual({ why: 'wrong' })
  // The right secret, on a fresh connection, is held back too: the name is being guessed at.
  expect(await login(open(g).link, 'Bill', SECRET)).toEqual({ why: 'slow', wait: WINDOW })
  // Another name is not.
  await register(open(g).link, 'ann', SECRET)
  expect(await login(open(g).link, 'ann', SECRET)).toEqual({ account: expect.any(String) })
  vi.setSystemTime(5_000_000 + WINDOW)
  expect(await login(open(g).link, 'bill', SECRET)).toEqual({ account: expect.any(String) })
  // Cleared: the full count of failures is allowed again at once.
  for (let i = 0; i < RULES.limit.name; i++) expect(await login(open(g).link, 'bill', 'wrong-secret')).toEqual({ why: 'wrong' })
  expect(await login(open(g).link, 'bill', 'wrong-secret')).toEqual({ why: 'slow', wait: WINDOW })
})

test('logins of one name at once from many connections are all counted before any is hashed', async () => {
  const g = await start()
  await register(open(g).link, 'bill', SECRET)
  const all = await Promise.all(Array.from({ length: RULES.limit.name + 2 }, () => login(open(g).link, 'bill', 'wrong-secret')))
  expect(all.filter(r => 'why' in r && r.why === 'wrong')).toHaveLength(RULES.limit.name)
  expect(all.filter(r => 'why' in r && r.why === 'slow')).toHaveLength(2)
})

test('a token logs a reloaded page back in once, each login hands a new one, and the store keeps only its hash', async () => {
  const g = await start()
  const keep = kept()
  const uid = ((await register(open(g, keep).link, 'bill', SECRET)) as { account: string }).account
  const first = keep.token!
  expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
  const sessions = await g.store.load('session', { account: uid })
  expect(sessions).toHaveLength(1)
  expect(JSON.stringify(sessions)).not.toContain(first)

  // The page reloads: a new link, the same keep.
  const again = open(g, keep)
  expect(await relogin(again.link)).toEqual({ account: uid })
  expect(who(again.link)).toBe(uid)
  const second = keep.token!
  expect(second).not.toBe(first)
  // The first token was spent.
  const stolen = kept()
  stolen.token = first
  expect(await relogin(open(g, stolen).link)).toEqual({ why: 'token' })
  expect(stolen.token).toBeNull()
  expect(await g.store.load('session', { account: uid })).toHaveLength(1)
  // A page that keeps nothing has nothing to send.
  expect(await relogin(open(g).link)).toEqual({ why: 'token' })
})

test('a token past its ttl is refused and forgotten, and its session dropped', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(9_000_000)
  const g = await start()
  const keep = kept()
  const uid = ((await register(open(g, keep).link, 'bill', SECRET)) as { account: string }).account
  vi.setSystemTime(9_000_000 + TTL - 1)
  expect(await relogin(open(g, keep).link)).toEqual({ account: uid })
  vi.setSystemTime(9_000_000 + TTL - 1 + TTL)
  expect(await relogin(open(g, keep).link)).toEqual({ why: 'token' })
  expect(keep.token).toBeNull()
  expect(await g.store.load('session')).toEqual([])
  // A malformed token is the same answer, and costs no store read.
  keep.token = 'not a token'
  expect(await relogin(open(g, keep).link)).toEqual({ why: 'token' })
})

test('a new session drops the account\'s expired ones', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(1_000)
  const g = await start()
  await register(open(g).link, 'bill', SECRET)
  await login(open(g).link, 'bill', SECRET)
  expect(await g.store.load('session')).toHaveLength(2)
  vi.setSystemTime(1_000 + TTL)
  await login(open(g).link, 'bill', SECRET)
  expect(await g.store.load('session')).toHaveLength(1)
})

test('before a login every up the page sends is dropped, and after it they reach the seat', async () => {
  const g = await start()
  const a = open(g)
  step(g.truth, 4)
  expect(a.heard[a.heard.length - 1].scene).toBe('hall')
  a.say('player', 'turn', 1)
  expect(() => step(g.truth, 2)).not.toThrow()
  expect(body(g, a).data.turn).toBe(0)
  // A malformed ask is dropped too, answered with nothing.
  a.link.send({ ask: 9, login: { name: 7, secret: null } } as any)
  a.link.send({ ask: 10, register: 'bill' } as any)
  a.link.send({ ask: 11, token: 42 } as any)
  expect(await register(a.link, 'bill', SECRET)).toEqual({ account: expect.any(String) })
  a.say('player', 'turn', 1)
  step(g.truth, 2)
  expect(body(g, a).data.turn).toBe(1)
})

test('one ask at a time, and none once logged in', async () => {
  const g = await start()
  const a = open(g)
  const [one, two] = await Promise.all([register(a.link, 'bill', SECRET), login(a.link, 'bill', SECRET)])
  expect(one).toEqual({ account: expect.any(String) })
  expect(two).toEqual({ why: 'busy' })
  expect(await login(a.link, 'bill', SECRET)).toEqual({ why: 'signed' })
})

test('an account logged in on a second connection is let go on the first, which may log in again', async () => {
  const g = await start()
  const a = open(g), b = open(g)
  const uid = ((await register(a.link, 'bill', SECRET)) as { account: string }).account
  step(g.truth, 4)
  const seatA = g.logged[0][1] as any
  const playerA = a.mine()!.id
  expect(await login(b.link, 'bill', SECRET)).toEqual({ account: uid })
  expect(who(a.link)).toBeUndefined()
  expect(account(seatA)).toBeUndefined()
  step(g.truth, 2)
  // A's seat has left the hall: its player row is gone, and it is sent nothing more.
  expect(g.hall.rows.some(r => r.id === playerA)).toBe(false)
  const heard = a.heard.length
  step(g.truth, 4)
  expect(a.heard.length).toBe(heard)
  // Logged in again it is seated anew, and B is let go.
  expect(await login(a.link, 'bill', SECRET)).toEqual({ account: uid })
  step(g.truth, 4)
  expect(a.heard.length).toBeGreaterThan(heard)
  expect(who(b.link)).toBeUndefined()
  a.say('player', 'turn', -1)
  step(g.truth, 2)
  expect(body(g, a).data.turn).toBe(-1)
})

test('a connection closed while its ask is out is logged in as nobody, and its promise is told so', async () => {
  const g = await start()
  await register(open(g).link, 'bill', SECRET)
  const a = open(g)
  const asking = login(a.link, 'bill', SECRET)
  a.link.close()
  expect(await asking).toEqual({ why: 'closed' })
  await new Promise(r => setTimeout(r, 50))
  expect(g.logged).toHaveLength(1)
  expect(await g.store.load('session')).toHaveLength(1)
})

test('a connection closed while its session is being saved is logged in as nobody, and the session is dropped', async () => {
  let closing: Link | undefined
  const dropped: string[] = []
  const g = await start(RULES, s => ({
    ...s,
    async save(kind, key, data) {
      await s.save(kind, key, data)
      if (kind === 'session' && closing) closing.close()
    },
    async drop(kind, key) {
      await s.drop(kind, key)
      dropped.push(kind)
    },
  }))
  await register(open(g).link, 'bill', SECRET)
  const a = open(g)
  closing = a.link
  expect(await login(a.link, 'bill', SECRET)).toEqual({ why: 'closed' })
  await vi.waitFor(() => expect(dropped).toEqual(['session']))
  expect(g.logged).toHaveLength(1)
  expect(await g.store.load('session')).toHaveLength(1)
})

test('accounts drops every expired session in the store when it is called', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(2_000)
  const g = await start()
  await register(open(g).link, 'bill', SECRET)
  vi.setSystemTime(2_000 + TTL / 2)
  await register(open(g).link, 'ann', SECRET)
  vi.setSystemTime(2_000 + TTL)
  accounts(accept(g.row), g.store, RULES)
  await vi.waitFor(async () => expect((await g.store.load('session')).map(s => s.account)).toHaveLength(1))
  const [ann] = await g.store.load('account', { name: 'ann' })
  expect((await g.store.load('session'))[0].account).toBe(ann.uid)
})

test('a store that fails is answered down, and its log names what failed, never the ask', async () => {
  const lines: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...a) => { lines.push(a.join(' ')) })
  const g = await start(RULES, s => ({ ...s, save: () => Promise.reject(new Error('disk full')) }))
  expect(await register(open(g).link, 'bill', SECRET)).toEqual({ why: 'down' })
  expect(lines).toEqual(['accounts could not answer a register: disk full'])
})

test('the secret is in no row of any truth, no message a truth answered, no record, no store file and no console line', async () => {
  const lines: string[] = []
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a) => { lines.push(a.map(String).join(' ')) })
  const g = await start()
  const answered = [g.truth, ...scenes(g.row).values()].map(t => heard(t))
  const keep = kept()
  const a = open(g, keep), b = open(g)
  step(g.truth, 3)
  await register(a.link, 'bill', SECRET)
  step(g.truth, 3)
  await login(b.link, 'bill', SECRET)
  await login(open(g).link, 'bill', SECRET + SECRET)
  await register(open(g).link, 'bill', SECRET)
  // The page reloaded logs the account in once more, so a and b are both let go, and it is the one
  // seat whose up reaches the hall.
  const c = open(g, keep)
  await relogin(c.link)
  step(g.truth, 3)
  a.say('player', 'turn', 1)
  b.say('player', 'turn', 1)
  c.say('player', 'turn', 1)
  step(g.truth, 10)
  expect(body(g, c).data.turn).toBe(1)
  const truths = [g.truth, ...scenes(g.row).values()]
  const records = [...(await g.store.load('account')), ...(await g.store.load('session'))]
  await g.store.close()
  const disk = [g.path, g.path + '-wal'].filter(existsSync).map(f => readFileSync(f).toString('latin1'))
  const everything = [
    ...truths.map(t => JSON.stringify(t.rows)),
    ...answered.map(list => JSON.stringify(list)),
    JSON.stringify(records),
    ...disk,
    ...lines,
    JSON.stringify(a.heard),
    JSON.stringify(b.heard),
    JSON.stringify(c.heard),
  ]
  // The haystack is real: the account and its two live sessions, b's and the relogin's, the
  // seats' rows and the messages they sent are all in it.
  expect(records.length).toBe(3)
  expect(answered.some(list => list.length > 0)).toBe(true)
  for (const hay of everything) expect(hay).not.toContain(SECRET)
})

test('local: every connection is the one profile at once, with no password and no store', async () => {
  const truth = boot(structuredClone(file), sim)
  await load(truth, here)
  const logged: string[] = []
  const a = page(link(signin(loopback(local(accept(manager(truth)), uid => logged.push(uid))))))
  expect(who(a.link)).toBe(LOCAL)
  expect(logged).toEqual([LOCAL])
  step(truth, 4)
  a.say('player', 'turn', 1)
  step(truth, 2)
  const hall = scenes(manager(truth)).get('hall')!
  expect(hall.rows.find(r => r.id === a.mine()!.data.body)!.data.turn).toBe(1)
  expect(await login(a.link, 'anyone', 'anything')).toEqual({ account: LOCAL })
  expect(await register(a.link, 'anyone', 'anything')).toEqual({ account: LOCAL })
})

test('local tells the seat the manager made which account it is', async () => {
  const truth = boot(structuredClone(file), sim)
  await load(truth, here)
  let seat: object | undefined
  const guarded = local(accept(manager(truth)), (_uid, s) => { seat = s })
  loopback(guarded)(() => {})
  expect(account(seat as any)).toBe(LOCAL)
})

test('the rules are checked when accounts is called', async () => {
  const g = await start()
  const bad = (over: any) => () => accounts(accept(g.row), g.store, { ...RULES, ...over })
  expect(bad({ scrypt: { ...RULES.scrypt, N: 1000 } })).toThrow('accounts scrypt.N is 1000: a power of two')
  expect(bad({ limit: { ...RULES.limit, name: 0 } })).toThrow('accounts limit.name is 0')
  expect(bad({ name: { ...RULES.name, max: 2 } })).toThrow('accounts name.max is 2')
  expect(bad({ token: { bytes: 8, ttl: 1 } })).toThrow('accounts token.bytes is 8')
  expect(() => accounts(accept(g.row), g.store, undefined as any)).toThrow('the manager scene has no accounts prefab')
})

// `view` is handed only the manager's envelopes: the answers never reach it.
test('the answers are taken off the wire before the link hears them', async () => {
  const g = await start()
  const a = open(g)
  await register(a.link, 'bill', SECRET)
  await login(a.link, 'bill', SECRET)
  step(g.truth, 2)
  expect(a.heard.length).toBeGreaterThan(0)
  expect(a.heard.every(d => 'scene' in d && 'packet' in d)).toBe(true)
})
