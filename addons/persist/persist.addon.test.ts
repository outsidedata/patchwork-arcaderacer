// The persist addon over `sqlite`, in a temp file per test. The test boots a scene it writes: a
// `persist` row loading `note` at boot and `hero` by claim, and a `desk` whose open acts are what a
// game's rules would do with them: `ask` claims an account's heroes, `make` spawns a hero, `train`
// sets a hero's `gain`, which its `tick` adds to its `xp` every step, `retire` ends a hero,
// `forget` ends one with `forget: true`, and `hand` moves xp from one hero to another in one act,
// marking both `urgent`, as a transfer does. A seat is a plain `truth.open()`. Writes reach the store
// after the step that made them, so a test reads the file once the writes have settled, on a
// connection of its own, as another thread would.
//
// Two worker threads, each a truth of its own with its own connection to one file, write heroes
// every step at once; every hero of both is in the file afterwards and no write failed.
//
// A kill in the middle of a step's writes is a child process that SIGKILLs itself between two ops of
// one batch; the file it leaves holds that batch's records all as they were before it.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { boot, type Scene, type Sim, type Truth } from '#engine/engine.ts'
import { claim, persist as kind } from '#plugins/persist/persist.sim.ts'
import { persist, sqlite, type Op, type Store } from './persist.addon.ts'

const DT = 1 / 60
const BUSY = 5000
const dir = mkdtempSync(join(tmpdir(), 'persist-'))
afterAll(() => rmSync(dir, { recursive: true }))
let files = 0
const fresh = () => join(dir, `${++files}.db`)

const scene = (every = 1, actors: Scene['actors'] = []): Scene => ({
  prefabs: {
    persist: { kinds: { hero: { key: 'uid', load: 'claim' }, note: { key: 'uid', load: 'boot' } }, every, claims: {} },
    hero: { uid: '', account: '', xp: 0, gain: 0 },
    note: { uid: '', text: '' },
    desk: {},
  },
  actors: [{ is: 'persist' }, { is: 'desk' }, ...actors],
})

const hero = (w: any, uid: string) => w.find('hero', (r: any) => r.data.uid === uid)
const sim: Sim = {
  persist: kind,
  hero: { tick(me) { me.data.xp += me.data.gain } },
  note: {},
  desk: {
    acts: {
      ask: (_me, w, _seat, account: string) => claim(w, 'hero', { account }),
      make: (_me, w, _seat, uid: string, account: string) => { w.spawn('hero', { uid, account }) },
      train: (_me, w, _seat, uid: string, gain: number) => { hero(w, uid).data.gain = gain },
      retire: (_me, w, _seat, uid: string) => { const h = hero(w, uid); h.data.xp += 1000; w.end(h) },
      forget: (_me, w, _seat, uid: string) => { const h = hero(w, uid); h.data.forget = true; w.end(h) },
      hand: (_me, w, _seat, from: string, to: string, xp: number) => {
        const a = hero(w, from), b = hero(w, to)
        a.data.xp -= xp
        b.data.xp += xp
        a.data.urgent = b.data.urgent = true
      },
    },
    open: ['ask', 'make', 'train', 'retire', 'forget', 'hand'],
  },
}

// Every write the store is handed, as it is handed it, and the batches they came in.
const spied = (store: Store) => {
  const calls: string[] = []
  const batches: string[][] = []
  return {
    calls,
    batches,
    store: {
      ...store,
      batch: (ops: Op[]) => {
        const said = ops.map(op => (op.data === null ? `drop ${op.kind} ${op.key}` : `save ${op.kind} ${op.key} ${op.data.xp ?? op.data.text}`))
        calls.push(...said)
        batches.push(said)
        return store.batch(ops)
      },
    } as Store,
  }
}

const settle = () => new Promise(r => setImmediate(r))

// A store whose loads, once it is shut, wait until the test opens it, so it can step while one is
// out.
const gated = (store: Store) => {
  let gate = Promise.resolve(), open = () => {}
  return {
    shut() { gate = new Promise(r => { open = r }) },
    open: () => open(),
    store: { ...store, load: (k: string, match?: any) => gate.then(() => store.load(k, match)) } as Store,
  }
}

// A truth on a store of the file, `every` apart, with extra actors, the store wrapped; its boot
// loads in unless `held`.
const start = async (file: string, every = 1, actors: Scene['actors'] = [], wrap: (s: Store) => Store = s => s, held = false) => {
  const truth = boot(scene(every, actors), sim)
  const store = await sqlite(file, BUSY)
  const kept = persist(truth, wrap(store))
  if (!held) await kept.loaded()
  const seat = truth.open()
  let seq = 0
  const desk = truth.rows.find(r => r.kind === 'desk')!
  const act = (action: string, ...args: (string | number)[]) => truth.inbox(seat, { seq: ++seq, n: truth.n, id: desk.id, action, args })
  const rows = (k: string) => truth.rows.filter(r => r.kind === k).map(r => r.data)
  return { truth, store, kept, seat, act, rows }
}

// What the file holds, read on a connection of its own.
const inFile = async (file: string, k: string, match?: Record<string, string>) => {
  const other = await sqlite(file, BUSY)
  try { return (await other.load(k, match)).sort((a, b) => a.uid.localeCompare(b.uid)) } finally { await other.close() }
}

const note = (truth: Truth, uid: string, text: string) => truth.spawn('note', { uid, text })

test('records saved by one truth are loaded into the next booted from the scene: boot kinds when attached, claim kinds when asked', async () => {
  const file = fresh()
  const one = await start(file)
  note(one.truth, 'n1', 'the butcher wakes at 900')
  note(one.truth, 'n2', 'mail for a1')
  one.act('make', 'h1', 'a1')
  one.truth.step(DT)
  await one.kept.flush()
  await one.store.close()

  const gate = gated(await sqlite(file, BUSY))
  gate.shut()
  const two = await start(file, 1, [], () => gate.store, true)
  two.truth.step(DT)
  expect(two.truth.n).toBe(0)
  expect(two.rows('note')).toEqual([])
  gate.open()
  await two.kept.loaded()
  expect(two.rows('note').sort((a, b) => a.uid.localeCompare(b.uid))).toEqual([{ uid: 'n1', text: 'the butcher wakes at 900' }, { uid: 'n2', text: 'mail for a1' }])
  expect(two.rows('hero')).toEqual([])
  two.truth.step(DT)
  expect(two.truth.n).toBe(1)
  await two.store.close()
})

test('a claim holds the truth until its records are rows, then is deleted, and the persist row is sent to no seat', async () => {
  const file = fresh()
  const one = await start(file)
  one.act('make', 'h1', 'a1')
  one.act('make', 'h2', 'a1')
  one.act('make', 'h3', 'a2')
  one.truth.step(DT)
  await one.kept.flush()
  await one.store.close()

  const gate = gated(await sqlite(file, BUSY))
  const two = await start(file, 1, [], () => gate.store)
  gate.shut()
  two.act('ask', 'a1')
  two.truth.step(DT)
  expect(two.truth.n).toBe(1)
  expect(Object.keys(two.truth.rows.find(r => r.kind === 'persist')!.data.claims)).toHaveLength(1)
  expect(two.rows('hero')).toEqual([])
  two.truth.step(DT)
  two.truth.step(DT)
  expect(two.truth.n).toBe(1)
  expect(two.rows('hero')).toEqual([])
  gate.open()
  await two.kept.loaded()
  expect(two.rows('hero').map(h => h.uid).sort()).toEqual(['h1', 'h2'])
  expect(two.truth.rows.find(r => r.kind === 'persist')!.data.claims).toEqual({})
  two.truth.step(DT)
  expect(two.truth.n).toBe(2)
  expect(two.truth.packet(two.seat).rows.map(r => r.kind).sort()).toEqual(['desk', 'hero', 'hero'])
  await two.store.close()
})

test('a record already a live row is not spawned again: a claim leaves the live row as it is, and at boot the record is written over the scene\'s copy', async () => {
  const file = fresh()
  const one = await start(file)
  one.act('make', 'h1', 'a1')
  note(one.truth, 'n1', 'saved')
  one.truth.step(DT)
  await one.kept.flush()
  await one.store.close()

  const two = await start(file, 1, [{ is: 'note', uid: 'n1', text: 'the scene\'s' }])
  await two.kept.loaded()
  expect(two.rows('note')).toEqual([{ uid: 'n1', text: 'saved' }])
  two.act('ask', 'a1')
  two.truth.step(DT)
  await two.kept.loaded()
  two.act('train', 'h1', 3)
  two.truth.step(DT)
  two.truth.step(DT)
  two.act('ask', 'a1')
  two.truth.step(DT)
  await two.kept.loaded()
  two.truth.step(DT)
  expect(two.rows('hero')).toHaveLength(1)
  expect(two.rows('hero')[0].xp).toBe(12)
  await two.store.close()
})

test('a changing row is written at most once per every steps, a row that stays the same is not written again, and a loaded row is not written until it changes', async () => {
  const file = fresh()
  const spy = spied(await sqlite(file, BUSY))
  const one = await start(file, 4, [], () => spy.store)
  one.act('make', 'h1', 'a1')
  one.act('make', 'h2', 'a1')
  one.truth.step(DT)
  one.act('train', 'h1', 1)
  for (let i = 0; i < 12; i++) one.truth.step(DT)
  await settle()
  // Step 1 writes both new heroes; h1 gains 1 a step from step 2 and is written at steps 5, 9, 13.
  expect(spy.calls).toEqual(['save hero h1 0', 'save hero h2 0', 'save hero h1 4', 'save hero h1 8', 'save hero h1 12'])
  expect((await inFile(file, 'hero')).map(h => h.xp)).toEqual([12, 0])
  one.act('train', 'h1', 0)
  one.truth.step(DT)
  await one.kept.flush()
  await one.store.close()

  const again = spied(await sqlite(file, BUSY))
  const two = await start(file, 4, [], () => again.store)
  two.act('ask', 'a1')
  two.truth.step(DT)
  await two.kept.loaded()
  for (let i = 0; i < 8; i++) two.truth.step(DT)
  await settle()
  expect(again.calls).toEqual([])
  await two.store.close()
})

test('a row that ends is written one last time with its data as it ended, and one ended with forget: true has its record deleted', async () => {
  const file = fresh()
  const spy = spied(await sqlite(file, BUSY))
  const one = await start(file, 100, [], () => spy.store)
  one.act('make', 'h1', 'a1')
  one.act('make', 'h2', 'a1')
  one.truth.step(DT)
  await settle()
  expect((await inFile(file, 'hero')).map(h => h.uid)).toEqual(['h1', 'h2'])
  one.act('retire', 'h1')
  one.act('forget', 'h2')
  one.truth.step(DT)
  await settle()
  expect(spy.calls.slice(2)).toEqual(['save hero h1 1000', 'drop hero h2'])
  expect(await inFile(file, 'hero')).toEqual([{ uid: 'h1', account: 'a1', xp: 1000, gain: 0 }])
  await one.store.close()
})

test('a seat closing writes every changed row at once, whatever every says', async () => {
  const file = fresh()
  const one = await start(file, 1000)
  one.act('make', 'h1', 'a1')
  one.truth.step(DT)
  one.act('train', 'h1', 5)
  one.truth.step(DT)
  one.truth.step(DT)
  await settle()
  expect((await inFile(file, 'hero'))[0].xp).toBe(0)
  one.truth.close(one.seat)
  one.truth.step(DT)
  await settle()
  expect((await inFile(file, 'hero'))[0].xp).toBe(15)
  one.truth.step(DT)
  await settle()
  expect((await inFile(file, 'hero'))[0].xp).toBe(15)
  await one.kept.flush()
  expect((await inFile(file, 'hero'))[0].xp).toBe(20)
  await one.store.close()
})

test('a write the store fails is logged by kind and key alone and made again every steps later', async () => {
  const file = fresh()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  let fail = true
  const one = await start(file, 3, [], s => ({ ...s, batch: ops => (fail ? Promise.reject(new Error('disk full')) : s.batch(ops)) }))
  one.act('make', 'h1', 'a1')
  one.truth.step(DT)
  await settle()
  expect(error.mock.calls).toEqual([['persist could not save hero h1: disk full']])
  await expect(one.kept.flush()).rejects.toThrow('persist could not write 1 records')
  fail = false
  one.truth.step(DT)
  one.truth.step(DT)
  await settle()
  expect(await inFile(file, 'hero')).toEqual([])
  one.truth.step(DT)
  await settle()
  expect(await inFile(file, 'hero')).toEqual([{ uid: 'h1', account: 'a1', xp: 0, gain: 0 }])
  error.mockRestore()
  await one.store.close()
})

test('a load the store fails throws out of the next step, and the truth never runs without its records', async () => {
  const file = fresh()
  const one = await start(file, 1, [], s => ({ ...s, load: () => Promise.reject(new Error('locked')) }))
  await one.kept.loaded()
  expect(() => one.truth.step(DT)).toThrow('persist could not load note: locked')
  expect(one.truth.n).toBe(0)
  await one.store.close()
})

test('the declaration is checked: every, the claims table, each kind\'s key and load, and a declared kind with no prefab', async () => {
  const store = await sqlite(fresh(), BUSY)
  const bad = (edit: (p: any) => void) => {
    const s = scene()
    edit(s.prefabs.persist)
    return () => persist(boot(s, sim), store)
  }
  expect(bad(p => { p.every = 0 })).toThrow('persist every is 0')
  expect(bad(p => { p.every = 1.5 })).toThrow('persist every is 1.5')
  expect(bad(p => { delete p.claims })).toThrow('persist row has no claims table')
  expect(bad(p => { p.kinds.hero.key = '' })).toThrow('persist hero names no key field')
  expect(bad(p => { p.kinds.hero.load = 'later' })).toThrow('persist hero loads by "later"')
  expect(bad(p => { p.kinds.ghost = { key: 'uid', load: 'boot' } })).toThrow('persist declares ghost, which has no prefab')
  expect(() => persist(boot({ ...scene(), actors: [{ is: 'desk' }] }, sim), store)).toThrow('0 persist rows, need 1')
  await expect(sqlite(fresh(), -1)).rejects.toThrow('persist busy is -1')
  await store.close()
})

test('a declared kind this truth has no code for is not this truth\'s: none of its records is loaded', async () => {
  const file = fresh()
  const one = await start(file)
  note(one.truth, 'n1', 'kept')
  one.truth.step(DT)
  await one.kept.flush()
  await one.store.close()
  const { note: _, ...without } = sim
  const truth = boot(scene(), without)
  const store = await sqlite(file, BUSY)
  const kept = persist(truth, store)
  await kept.loaded()
  truth.step(DT)
  expect(truth.rows.map(r => r.kind)).toEqual(['persist', 'desk'])
  await store.close()
})

test('sqlite matches a field by its JSON: a string, a number, true and null are four values', async () => {
  const store = await sqlite(fresh(), BUSY)
  await store.save('hero', 's', { uid: 's', v: '1' })
  await store.save('hero', 'n', { uid: 'n', v: 1 })
  await store.save('hero', 't', { uid: 't', v: true })
  await store.save('hero', 'z', { uid: 'z', v: null })
  await store.save('hero', 'm', { uid: 'm' })
  await store.save('note', 'n', { uid: 'n', v: 1 })
  const uids = async (match?: any) => (await store.load('hero', match)).map(d => d.uid).sort()
  expect(await uids({ v: '1' })).toEqual(['s'])
  expect(await uids({ v: 1 })).toEqual(['n'])
  expect(await uids({ v: true })).toEqual(['t'])
  expect(await uids({ v: null })).toEqual(['z'])
  expect(await uids({ v: 1, uid: 'n' })).toEqual(['n'])
  expect(await uids()).toEqual(['m', 'n', 's', 't', 'z'])
  await store.save('hero', 'n', { uid: 'n', v: 2 })
  expect(await uids({ v: 2 })).toEqual(['n'])
  await store.drop('hero', 'n')
  expect(await uids({ v: 2 })).toEqual([])
  await store.close()
})

// Each worker boots a truth of its own, attaches persist on its own connection to the one file,
// spawns its heroes and steps, every hero gaining xp every step and `every` 1, so both threads
// write every step while the other does. A thread counts the writes that failed and says when it
// began and finished writing, so the test sees the two overlapped.
const worker = `
const { workerData: d, parentPort } = require('node:worker_threads')
;(async () => {
  let failures = 0
  console.error = m => { if (String(m).startsWith('persist')) failures++ }
  const { boot } = await import(d.engine)
  const { persist, sqlite } = await import(d.addon)
  const sim = await import(d.sim)
  const truth = boot(d.scene, { persist: sim.persist, hero: { tick(me) { me.data.xp += 1 } } })
  const store = await sqlite(d.file, d.busy)
  const kept = persist(truth, store)
  for (let i = 0; i < d.heroes; i++) truth.spawn('hero', { uid: d.name + '-' + i, account: d.name })
  const from = Date.now()
  for (let s = 0; s < d.steps; s++) { truth.step(1 / 60); await new Promise(r => setImmediate(r)) }
  await kept.flush()
  const to = Date.now()
  await store.close()
  parentPort.postMessage({ failures, from, to })
})().catch(e => parentPort.postMessage({ error: e.message }))
`

test('two worker threads writing one file at once both land every record, and no write fails on a busy database', async () => {
  const file = fresh()
  const heroes = 30, steps = 30
  const run = (name: string) => new Promise<any>((ok, fail) => {
    const w = new Worker(worker, {
      eval: true,
      workerData: {
        name, file, heroes, steps, busy: BUSY,
        scene: { ...scene(), actors: [{ is: 'persist' }] },
        engine: new URL('../../engine/engine.ts', import.meta.url).href,
        addon: new URL('./persist.addon.ts', import.meta.url).href,
        sim: new URL('../../plugins/persist/persist.sim.ts', import.meta.url).href,
      },
    })
    w.once('message', ok)
    w.once('error', fail)
  })
  const [a, b] = await Promise.all([run('a'), run('b')])
  expect(a).toMatchObject({ failures: 0 })
  expect(b).toMatchObject({ failures: 0 })
  expect(a.from < b.to && b.from < a.to).toBe(true)
  for (const name of ['a', 'b']) {
    const got = await inFile(file, 'hero', { account: name })
    expect(got).toHaveLength(heroes)
    expect(got.every(h => h.xp === steps)).toBe(true)
  }
}, 30000)

test('every record one step writes or drops goes to the store as one batch', async () => {
  const file = fresh()
  const spy = spied(await sqlite(file, BUSY))
  const one = await start(file, 1, [], () => spy.store)
  one.act('make', 'h1', 'a1')
  one.act('make', 'h2', 'a1')
  one.act('make', 'h3', 'a1')
  one.truth.step(DT)
  one.act('train', 'h1', 2)
  one.act('retire', 'h2')
  one.act('forget', 'h3')
  one.truth.step(DT)
  await settle()
  expect(spy.batches).toEqual([
    ['save hero h1 0', 'save hero h2 0', 'save hero h3 0'],
    ['save hero h2 1000', 'drop hero h3', 'save hero h1 2'],
  ])
  await one.store.close()
})

test('a row marked urgent is written that step whatever every says, and the flag is cleared off the row and never written', async () => {
  const file = fresh()
  const spy = spied(await sqlite(file, BUSY))
  const one = await start(file, 1000, [], () => spy.store)
  one.act('make', 'h1', 'a1')
  one.act('make', 'h2', 'a1')
  one.truth.step(DT)
  one.act('train', 'h1', 10)
  one.truth.step(DT)
  one.truth.step(DT)
  await settle()
  expect(spy.batches).toEqual([['save hero h1 0', 'save hero h2 0']])
  one.act('hand', 'h1', 'h2', 7)
  one.truth.step(DT)
  await settle()
  expect(spy.batches.slice(1)).toEqual([['save hero h1 23', 'save hero h2 7']])
  expect(one.rows('hero').map(h => 'urgent' in h)).toEqual([false, false])
  expect(await inFile(file, 'hero')).toEqual([{ uid: 'h1', account: 'a1', xp: 23, gain: 10 }, { uid: 'h2', account: 'a1', xp: 7, gain: 0 }])
  one.truth.step(DT)
  await settle()
  expect(spy.batches).toHaveLength(2)
  await one.store.close()
})

test('a failed batch is made again whole: its records ride in the next batch sent, beside whatever that step wrote', async () => {
  const file = fresh()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  let fail = false
  const spy = spied(await sqlite(file, BUSY))
  const one = await start(file, 1000, [], () => ({ ...spy.store, batch: ops => (fail ? Promise.reject(new Error('disk full')) : spy.store.batch(ops)) }))
  one.act('make', 'h1', 'a1')
  one.act('make', 'h2', 'a1')
  one.act('make', 'h3', 'a1')
  one.truth.step(DT)
  await settle()
  fail = true
  one.act('hand', 'h1', 'h2', 5)
  one.truth.step(DT)
  await settle()
  expect(error.mock.calls).toEqual([['persist could not save hero h1: disk full'], ['persist could not save hero h2: disk full']])
  fail = false
  one.act('hand', 'h3', 'h2', 1)
  one.truth.step(DT)
  await settle()
  expect(spy.batches.slice(1)).toEqual([['save hero h1 -5', 'save hero h2 6', 'save hero h3 -1']])
  expect((await inFile(file, 'hero')).map(h => h.xp)).toEqual([-5, 6, -1])
  error.mockRestore()
  await one.store.close()
})

test('sqlite makes a batch whole or not at all: an op that fails rolls back the ops before it', async () => {
  const file = fresh()
  const store = await sqlite(file, BUSY)
  await store.batch([{ kind: 'hero', key: 'h1', data: { uid: 'h1', xp: 1 } }, { kind: 'hero', key: 'h2', data: { uid: 'h2', xp: 2 } }])
  const broken = { toJSON() { throw new Error('the op failed') } }
  await expect(store.batch([
    { kind: 'hero', key: 'h1', data: { uid: 'h1', xp: 100 } },
    { kind: 'hero', key: 'h2', data: null },
    { kind: 'hero', key: 'h3', data: broken },
  ])).rejects.toThrow('the op failed')
  expect(await inFile(file, 'hero')).toEqual([{ uid: 'h1', xp: 1 }, { uid: 'h2', xp: 2 }])
  await store.batch([{ kind: 'hero', key: 'h1', data: null }, { kind: 'hero', key: 'h3', data: { uid: 'h3', xp: 3 } }])
  expect(await inFile(file, 'hero')).toEqual([{ uid: 'h2', xp: 2 }, { uid: 'h3', xp: 3 }])
  await store.close()
})

// Writes h1 and h2 at 1, then a batch moving 400 xp from h1 to h2 over 200 op pairs, and SIGKILLs
// itself as the 101st op is made.
const killer = `
const { sqlite } = await import(process.env.ADDON)
const store = await sqlite(process.env.FILE, 5000)
await store.batch([{ kind: 'hero', key: 'h1', data: { uid: 'h1', xp: 1 } }, { kind: 'hero', key: 'h2', data: { uid: 'h2', xp: 1 } }])
const ops = []
for (let i = 0; i < 200; i++) {
  const die = i === 50 ? { toJSON() { process.kill(process.pid, 'SIGKILL') } } : undefined
  ops.push({ kind: 'hero', key: 'h1', data: { uid: 'h1', xp: 1 - 2 * (i + 1), die } })
  ops.push({ kind: 'hero', key: 'h2', data: { uid: 'h2', xp: 1 + 2 * (i + 1) } })
}
await store.batch(ops)
console.log('not killed')
`

test('a process killed in the middle of a batch leaves every record of it as it was before the batch', async () => {
  const file = fresh()
  const run = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', killer], {
    env: { ...process.env, FILE: file, ADDON: new URL('./persist.addon.ts', import.meta.url).href },
    encoding: 'utf8',
  })
  expect(run.signal).toBe('SIGKILL')
  expect(run.stdout).not.toContain('not killed')
  expect(await inFile(file, 'hero')).toEqual([{ uid: 'h1', xp: 1 }, { uid: 'h2', xp: 1 }])
})

test('a claim reads the store only after every write the truth made before it: a record forgotten is not claimed back while its drop is out', async () => {
  const file = fresh()
  let open = () => {}
  let gate: Promise<void> = Promise.resolve()
  const one = await start(file, 1, [], s => ({ ...s, batch: ops => gate.then(() => s.batch(ops)) }))
  one.act('make', 'h1', 'a1')
  one.act('make', 'h2', 'a1')
  one.truth.step(DT)
  await one.kept.flush()
  gate = new Promise(r => { open = r })
  one.act('forget', 'h1')
  one.act('ask', 'a1')
  one.truth.step(DT)
  await settle()
  expect(one.truth.step(DT)).toBeUndefined()
  expect(one.truth.n).toBe(2)
  open()
  await one.kept.loaded()
  one.truth.step(DT)
  expect(one.rows('hero').map(h => h.uid)).toEqual(['h2'])
  expect((await inFile(file, 'hero')).map(h => h.uid)).toEqual(['h2'])
  await one.store.close()
})
