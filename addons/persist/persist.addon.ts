// Durable records as rows. The engine neither saves nor loads a truth; this addon keeps the rows of
// a few kinds, the records, in a store beside it: it loads records into a truth as rows, writes the
// rows back out as they change, and deletes a record whose row ends with `forget: true`. The truth
// itself is not durable: every other row is made again from its scene when the truth is booted
// again, and the records are loaded into it.
//
// Declared by a `persist` prefab, which the manager scene file holds so every child inherits it
// (`child` in `addons/scenemanager/scenemanager.addon.ts`), and one `persist` row per truth that
// keeps records, an `actors` entry whose sim names the `persist` kind
// (`plugins/persist/persist.sim.ts`). The prefab is
//
//   kinds   kind name to `{ key, load }`: `key` is the field of the row's data the record is filed
//           under, a string or a number, `uid` for every record a game has. `load` is `boot`, every
//           record of the kind loaded when this addon is attached (a market's listings, say, in the
//           scene that holds the market), or `claim`, a record loaded when a rule asks for it with
//           `claim` (a scene asking for an account's characters).
//   every   the fewest steps between two writes of one row, so a row that changes every step is
//           written once per `every` steps and not every step: a timer here is a due step, like
//           every timer a row keeps.
//   claims  `{}`, where `claim` writes what the truth's rules have asked for and this addon deletes
//           each request once its records are rows.
//   file    the store's name: the database file under the working directory in node, the
//           IndexedDB database in a page. This addon never reads it; whoever opens the store does.
//   busy    the milliseconds a write in node waits for another thread's to finish before it fails.
//
// A kind the prefab declares that this truth's sim has no code for is not this truth's to keep, so
// one table in the manager's file serves every child: each keeps the declared kinds it makes rows
// of. A child that loads differently, one taking a kind at boot where no other child does, gives
// its `persist` actors entry a `kinds` of its own. A declared kind with no prefab is a misspelling
// and throws.
//
// Records name each other by their `uid`, never by a row id: a row id is one truth's for one boot.
// The record is the row's `data` as JSON, whole. A secret never goes in a row, so it never goes in a
// record; this addon writes no data to any log, only a record's kind and key when a write fails.
//
// Loads. A load reads the store, which is asynchronous, and a rule must never see half a record, so
// while any load is out the piece's `advance()` says no and the truth's `step` returns without
// running. When the records are in they are spawned with `truth.spawn`, each the kind's prefab with
// the record over it, and a claim's request is deleted from the `persist` row; the next step runs
// with every one of them. A record whose key is already a live row of its kind in this truth is not
// spawned again, and a load reads the store only once every write this truth handed it before has
// settled, so a record a rule dropped is never claimed back in the step after: a record taken and
// forgotten is gone, not loaded a second time by a claim made while its drop was still out. For a
// claim that live row is newer than the record and is left as it is. At boot
// a live row of a `boot` kind is the scene's starting copy of it, an `actors` entry such as a
// scheduler's, and the record is what that row came to the last time the scene ran, so the
// record is written over it. A load the store fails throws out of the next `step`, since a truth
// that went on without its records would make them again from nothing.
//
// Writes, after every step (`onStep`):
// - a live row whose data has changed since it was last written, and which was last written at
//   least `every` steps ago, is written, its data compared as JSON;
// - a live row whose data has `urgent: true` is written that step whatever `every` says, and the
//   flag deleted from its data, so no record holds it. A rule sets it on every row a transfer
//   touches in the step it makes the transfer: an item taken out of one row's bag into another
//   row is written out of the first in the same step the second is written, and never a step later;
// - a row that has ended since the last step is written one last time, with its data as it was when
//   it ended, or its record dropped if that data has `forget: true`. A rule deleting a record sets
//   `forget` in the step it ends the row;
// - when a seat has closed since the last step, every changed row is written then, whatever
//   `every` says, so what a player did before leaving is on disk when they have gone.
// A row that was loaded is not written until it changes. Every record one step writes or drops goes
// to the store as one `batch`, which the store makes as one transaction: a process killed while it
// writes leaves the store with all of that step's records or with none, so a transfer made in one
// step, the item out of one record and into another, is never on disk half made. Batches go to the
// store one after another in the order their steps ran. A batch the store fails is logged by kind
// and key for each record in it, and each of those records not written again since is made again in
// the next batch, whole with the rest of its step's, so a transfer that failed is retried whole; a
// step that writes nothing sends the failed ones `every` steps later, until they succeed or newer
// writes of those records replace them.
//
// `persist(truth, store)` attaches the piece and the `onStep` and starts the `boot` loads. It hands
// back `loaded()`, which resolves when no load is out, and `flush()`, which writes every changed
// row and every failed write now and resolves once the store has all of them, or rejects when it
// took not all: whatever lets a truth go, or the process, awaits it first, so no write that `every`
// was still holding back is lost.
// The `persist` row is shown to no seat: only this addon reads it, and its `claims` name accounts.
//
// A store is five asynchronous calls, which one store can answer for every truth in its thread:
//
//   load(kind, match?)   the data of every record of `kind` whose data holds each field of `match`
//                        at that value, or every record of the kind without one;
//   save(kind, key, data) files `data` under (kind, key), over whatever was there;
//   drop(kind, key)      deletes it;
//   batch(ops)           makes every op of the list, in order, as one transaction: each op is
//                        `{ kind, key, data }`, a save, or `{ kind, key, data: null }`, a drop. It
//                        resolves once all of them are in the store and rejects with none of them
//                        in it;
//   close()              lets the storage go.
//
// There are two. `sqlite(file, busy)` is node's, over `node:sqlite`: one database file in WAL mode,
// which every worker thread opens on its own connection and writes the rows of its own truths
// into, each write waiting up to `busy` milliseconds for another thread's to finish. It has one
// table, (kind, key, data), keyed by (kind, key), and matches a field by its JSON in SQL. A batch is
// `BEGIN IMMEDIATE` … `COMMIT`, taking the file's write lock before its first op, and rolled back
// on any op that fails. `indexeddb(name)` is the page's: the database `name` in the tab's
// IndexedDB, one object store keyed by [kind, key] with an index on kind, a match filtered as it is
// read; a batch is one `readwrite` transaction, which IndexedDB commits whole or aborts whole. The server file opens
// `sqlite` on the manager's `persist` prefab's `file` and `busy`, `index.html` opens `indexeddb` on
// its `file`, and whoever opens a store closes it. `node:sqlite` is reached only inside `sqlite`,
// so the page, which imports this file and calls only `indexeddb`, never loads it.
import type { Arg, Row, Truth } from '#engine/engine.ts'
import { onRewind, rewinding } from '#addons/rewind/rewind.addon.ts'

export type Match = Record<string, Arg>
export type Store = {
  load(kind: string, match?: Match): Promise<any[]>
  save(kind: string, key: string, data: any): Promise<void>
  drop(kind: string, key: string): Promise<void>
  batch(ops: Op[]): Promise<void>
  close(): Promise<void>
}
// A save, or with `data` null a drop.
export type Op = { kind: string; key: string; data: any }
export type Persist = { loaded(): Promise<void>; flush(): Promise<void> }
type Spec = { key: string; load: 'boot' | 'claim' }

// The `persist` row's declaration, the kinds of it this truth has code for, each checked.
function declared(truth: Truth, me: Row): Map<string, Spec> {
  const { kinds, every, claims } = me.data
  if (!Number.isInteger(every) || every < 1) throw new Error(`persist every is ${JSON.stringify(every)}: a whole number of steps, 1 or more`)
  if (typeof claims !== 'object' || claims === null) throw new Error('persist row has no claims table')
  if (typeof kinds !== 'object' || kinds === null) throw new Error('persist row declares no kinds')
  const out = new Map<string, Spec>()
  for (const [kind, spec] of Object.entries(kinds as Record<string, Spec>)) {
    if (!(kind in truth.scene.prefabs)) throw new Error(`persist declares ${kind}, which has no prefab`)
    if (typeof spec?.key !== 'string' || spec.key === '') throw new Error(`persist ${kind} names no key field`)
    if (spec.load !== 'boot' && spec.load !== 'claim') throw new Error(`persist ${kind} loads by ${JSON.stringify(spec.load)}: boot or claim`)
    if (kind in truth.sim) out.set(kind, spec)
  }
  return out
}

export function persist(truth: Truth, store: Store): Persist {
  const mine = truth.rows.filter(r => r.kind === 'persist')
  if (mine.length !== 1) throw new Error(`${mine.length} persist rows, need 1`)
  let me = mine[0]
  const kinds = declared(truth, me)
  const every: number = me.data.every

  const keyOf = (row: Row): string => {
    const k = row.data[kinds.get(row.kind)!.key]
    if (typeof k !== 'string' && typeof k !== 'number') throw new Error(`persist ${row.kind} row ${row.id} has no ${kinds.get(row.kind)!.key}`)
    return String(k)
  }
  const recordOf = (kind: string, key: string) => `${kind}\n${key}`

  // Every live row of a declared kind, by id; the JSON it was last written or loaded as; the step
  // it was last written at.
  const tracked = new Map<number, Row>()
  const written = new Map<number, string>()
  const at = new Map<number, number>()
  const track = (row: Row) => { if (kinds.has(row.kind)) tracked.set(row.id, row) }

  // The store's writes: each step's as one batch, the batches one after another. `version` counts
  // the writes made of each record, so a failed one is made again only while no newer one has been
  // made; `failed` rides along in the next batch sent, whole.
  type Write = { kind: string; key: string; json: string | null; v: number }
  let tail = Promise.resolve()
  const version = new Map<string, number>()
  const failed = new Map<string, Write>()
  let made: Write[] = []
  let retried = truth.n
  const put = (kind: string, key: string, json: string | null) => {
    const record = recordOf(kind, key)
    const v = (version.get(record) ?? 0) + 1
    version.set(record, v)
    made.push({ kind, key, json, v })
  }
  const send = () => {
    const mine = made
    made = []
    retried = truth.n
    tail = tail.then(() => {
      const fresh = new Set(mine.map(w => recordOf(w.kind, w.key)))
      const all = [...[...failed].filter(([record]) => !fresh.has(record)).map(([, w]) => w), ...mine]
      failed.clear()
      if (!all.length) return
      return store.batch(all.map(w => ({ kind: w.kind, key: w.key, data: w.json === null ? null : JSON.parse(w.json) }))).then(
        () => {
          for (const w of all) if (version.get(recordOf(w.kind, w.key)) === w.v) version.delete(recordOf(w.kind, w.key))
        },
        e => {
          for (const w of all) {
            console.error(`persist could not ${w.json === null ? 'drop' : 'save'} ${w.kind} ${w.key}: ${e.message}`)
            if (version.get(recordOf(w.kind, w.key)) === w.v) failed.set(recordOf(w.kind, w.key), w)
          }
        },
      )
    })
  }
  const write = (row: Row, force: boolean) => {
    const urgent = row.data.urgent === true
    if ('urgent' in row.data) delete row.data.urgent
    if (!urgent && !force && truth.n - (at.get(row.id) ?? -Infinity) < every) return
    const json = JSON.stringify(row.data)
    if (json === written.get(row.id)) return
    put(row.kind, keyOf(row), json)
    written.set(row.id, json)
    at.set(row.id, truth.n)
  }

  // Loads out, and the first one the store failed.
  const out = new Set<Promise<void>>()
  let broke: Error | undefined
  const asking = new Set<string>()
  const land = (kind: string, records: any[], boot: boolean) => {
    const live = new Map([...tracked.values()].filter(r => r.kind === kind).map(r => [keyOf(r), r]))
    for (const data of records) {
      const key = String(data[kinds.get(kind)!.key])
      const had = live.get(key)
      if (had && !boot) continue
      if (had) Object.assign(had.data, data)
      const row = had ?? truth.spawn(kind, data)
      live.set(key, row)
      written.set(row.id, JSON.stringify(row.data))
    }
  }
  const fetch = (kind: string, match: Match | undefined, then: (records: any[]) => void) => {
    const p: Promise<void> = tail.then(() => store.load(kind, match)).then(then).catch(e => { broke ??= new Error(`persist could not load ${kind}: ${e.message}`) })
    out.add(p)
    void p.then(() => out.delete(p))
  }
  const sweep = () => {
    for (const [ask, c] of Object.entries(me.data.claims as Record<string, { kind: string; match: Match }>)) {
      if (asking.has(ask)) continue
      if (kinds.get(c.kind)?.load !== 'claim') throw new Error(`persist claims ${c.kind}, which this truth does not load by claim`)
      asking.add(ask)
      fetch(c.kind, c.match, records => {
        land(c.kind, records, false)
        delete me.data.claims[ask]
        asking.delete(ask)
      })
    }
  }

  // Each row that has ended since this last ran: written a last time, or its record dropped.
  const ended = () => {
    const now = new Set(truth.rows.map(r => r.id))
    for (const [id, row] of tracked) {
      if (now.has(id)) continue
      tracked.delete(id)
      if ('urgent' in row.data) delete row.data.urgent
      if (row.data.forget === true) put(row.kind, keyOf(row), null)
      else if (JSON.stringify(row.data) !== written.get(id)) put(row.kind, keyOf(row), JSON.stringify(row.data))
      written.delete(id)
      at.delete(id)
    }
  }

  const closed = new Set<number>()
  truth.attach({
    show: (_seat, row) => row !== me,
    hide: () => [],
    accept: () => true,
    // A load landing changes the truth between steps, so a rewind never runs a step again from
    // before one (`addons/rewind`): the steps it runs again ran with no load out, and do so again.
    advance: () => {
      if (broke) throw broke
      return out.size === 0 || rewinding(truth)
    },
    spawn: track,
  })
  // The steps a rewind runs again write nothing: what they come to is written after the step that
  // follows, as the rows then stand. The rows are new objects once it has, which are tracked in place
  // of those they replace.
  onRewind(truth, () => {
    me = truth.rows.find(r => r.id === me.id) ?? me
    const now = new Map(truth.rows.map(r => [r.id, r]))
    for (const [id, row] of tracked) tracked.set(id, now.get(id) ?? row)
    for (const row of truth.rows) track(row)
  })
  truth.onStep(() => {
    if (rewinding(truth)) return
    ended()
    let left = false
    for (let s = 0; s < truth.seats; s++) if (truth.closed(s) && !closed.has(s)) { closed.add(s); left = true }
    for (const row of tracked.values()) write(row, left)
    if (made.length || (failed.size && truth.n - retried >= every)) send()
    sweep()
  })

  for (const row of truth.rows) track(row)
  for (const [kind, spec] of kinds) if (spec.load === 'boot') fetch(kind, undefined, records => land(kind, records, true))
  sweep()

  return {
    async loaded() { while (out.size) await Promise.all(out) },
    async flush() {
      ended()
      for (const row of tracked.values()) write(row, true)
      send()
      await tail
      if (failed.size) throw new Error(`persist could not write ${failed.size} records`)
    },
  }
}

// ---------------------------------------------------------------- node

export async function sqlite(file: string, busy: number): Promise<Store> {
  if (!Number.isInteger(busy) || busy < 0) throw new Error(`persist busy is ${JSON.stringify(busy)}: whole milliseconds`)
  // Taken from node itself rather than imported: vite strips the `node:` off an import, and
  // `sqlite`, unlike `fs`, exists only with it.
  const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
  const db = new DatabaseSync(file)
  // The wait first, so opening the file while another thread writes it waits too.
  db.exec(`PRAGMA busy_timeout = ${busy}`)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (kind, key))')
  const save = db.prepare('INSERT INTO records (kind, key, data) VALUES (?, ?, ?) ON CONFLICT (kind, key) DO UPDATE SET data = excluded.data')
  const drop = db.prepare('DELETE FROM records WHERE kind = ? AND key = ?')
  return {
    async load(kind, match = {}) {
      // `->` is `json_extract` handing back JSON, so "1", 1 and true are three different values.
      const fields = Object.entries(match)
      const where = fields.map(() => ' AND data -> ? = ?').join('')
      const args = fields.flatMap(([f, v]) => [`$."${f}"`, JSON.stringify(v)])
      const rows = db.prepare(`SELECT data FROM records WHERE kind = ?${where}`).all(kind, ...args) as { data: string }[]
      return rows.map(r => JSON.parse(r.data))
    },
    async save(kind, key, data) { save.run(kind, key, JSON.stringify(data)) },
    async drop(kind, key) { drop.run(kind, key) },
    async batch(ops) {
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const op of ops) if (op.data === null) drop.run(op.kind, op.key); else save.run(op.kind, op.key, JSON.stringify(op.data))
        db.exec('COMMIT')
      } catch (e) {
        // A failure sqlite has rolled back itself, a full disk, leaves no transaction to roll back.
        if (db.isTransaction) db.exec('ROLLBACK')
        throw e
      }
    },
    async close() { db.close() },
  }
}

// ---------------------------------------------------------------- page

const done = <T>(req: IDBRequest<T>) => new Promise<T>((ok, fail) => {
  req.onsuccess = () => ok(req.result)
  req.onerror = () => fail(req.error)
})
const committed = (tx: IDBTransaction) => new Promise<void>((ok, fail) => {
  tx.oncomplete = () => ok()
  tx.onerror = () => fail(tx.error)
  tx.onabort = () => fail(tx.error)
})

export async function indexeddb(name: string): Promise<Store> {
  const open = indexedDB.open(name, 1)
  open.onupgradeneeded = () => open.result.createObjectStore('records', { keyPath: ['kind', 'key'] }).createIndex('kind', 'kind')
  const db = await done(open)
  // An op that throws as it is made, data that cannot be cloned, aborts the ops made before it.
  const change = async (f: (records: IDBObjectStore) => void) => {
    const tx = db.transaction('records', 'readwrite')
    const end = committed(tx)
    try {
      f(tx.objectStore('records'))
    } catch (e) {
      tx.abort()
      await end.catch(() => {})
      throw e
    }
    return end
  }
  return {
    async load(kind, match = {}) {
      const all = await done(db.transaction('records').objectStore('records').index('kind').getAll(kind)) as { data: any }[]
      return all.map(r => r.data).filter(data => Object.entries(match).every(([f, v]) => data[f] === v))
    },
    save: (kind, key, data) => change(records => records.put({ kind, key, data })),
    drop: (kind, key) => change(records => records.delete([kind, key])),
    batch: ops => change(records => { for (const op of ops) if (op.data === null) records.delete([op.kind, op.key]); else records.put({ kind: op.kind, key: op.key, data: op.data }) }),
    async close() { db.close() },
  }
}
