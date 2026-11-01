// Every change the editor makes to the repo's files, applied by the server one at a time and kept to
// be taken back. A page names each change it sends (`id`, a name no change kept has, or it is
// refused), and it is made of ops:
//
//   { json: path, at, value?, insert?, index? }   one JSON value set, removed when `value` is left out,
//                                                 or with `insert` put into the list at `at`, written
//                                                 as `Files.edit` writes one, so the diff is that value;
//                                                 a key its object lacks goes in at place `index`
//   { text: path, value }                          a whole text file, or null to take it away
//   { bytes: path, value }                         a whole file's bytes, as base64, or null
//   { route: { owner, route, body } }              an extension's route (`routes.ts`), run inside the
//                                                 change: every file it writes or takes away through
//                                                 the `RouteFiles` it is handed is part of it, a whole
//                                                 file, and every JSON value it sets (`edit`) is a
//                                                 value of it, as a `json` op's is
//
// Changes, and the undos and redos of them, are applied one after another for the whole server, in
// the order they are asked for, each page's in the order it sent them (`pages.ts`), so an undo asked
// for right after its change is applied after it.
//
// A change is whole or not at all. Each file's bytes are read before the change first writes it; if
// any op throws, every file it wrote is put back to those bytes, and nothing is kept.
//
// Each change keeps, per file, its bytes before and after. An undo writes the before-bytes back where
// the file still holds the after-bytes, so the file is byte for byte what it was. Where the file has
// changed since, by hand or by another change, its JSON values are taken back one by one, the last
// first, each as `Files.edit` puts back a value (`Back`): its bytes put back where the file still holds
// what the change wrote there, else the value written as it was, a key at its place among its
// object's keys. A file a whole-file op wrote, a text, bytes or a route's `write`, is not taken back
// then: the undo is refused, naming the file. A redo is the same with before and after swapped, and
// its values made again in the order they were first made. An undo or a redo is whole or not at all
// as a change is, and keeps the bytes it found and the bytes it left, which the next undo or redo goes
// by.
//
// The record is kept on the disk, so the changes made before the server started again can still be
// taken back: one file per change in `folder`, named by the order it was made in and a hash of its id,
// the last `KEPT` of them. The server's is `node_modules/.cache/editor/changes/`, which git and the
// watcher both pass over.
//
// Every change answers `{ id, version, files, answers }`: `version` counts every change, undo and redo
// applied, and every change on the disk no change made (`outside`); `files` is every file it wrote with
// its text now, or null when it is taken away or is not text, a picture say, which a page reads as
// bytes; and `answers` is what each route op answered, in order. Whether a page reloads for a file is
// the page's to say, by what it has imported (`Editor`). A change that is refused answers
// `{ id, error }`.
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { valueAt, type At, type Back, type Files, type Splice } from './files.ts'
import type { RouteFiles } from './routes.ts'

export type Op =
  | { json: string; at: At; value?: unknown; insert?: boolean; index?: number }
  | { text: string; value: string | null }
  | { bytes: string; value: string | null }
  | { route: { owner: string; route: string; body: unknown } }
export type Changed = { id: string; version: number; files: Record<string, string | null>; answers: unknown[] }
export type Refused = { id: string; error: string }
export type Answer = Changed | Refused
// A route an extension ships, `/api/x/<owner>/<route>`, posted `body` and handed `files` to write
// through: the server's runs it through its `Routes`.
export type Call = (owner: string, route: string, body: unknown, files: RouteFiles) => Promise<unknown>

// How many changes are kept to be taken back.
export const KEPT = 2000

// A JSON value a change wrote: where it landed, the value there before and after, the bytes it changed
// the last time it was made, and how the value it replaced was written (`Back`); `index` is the place
// a key put in has among its object's keys, which a redo puts it at again.
type Value = { at: At; before?: unknown; after?: unknown; insert?: boolean; splice: Splice; was?: Back; index?: number }
// What a change did to one file: its bytes before and after, null where there was no file; whether a
// whole-file op wrote it; and the JSON values written into it, in order.
type Kept = { before: Uint8Array | null; after: Uint8Array | null; whole: boolean; values: Value[] }
// A change as it is kept: whether it is taken back, and what it did to each file, by its path.
type Made = { id: string; undone: boolean; files: Map<string, Kept> }
// A record as its file holds it, the bytes as base64.
type Stored = { id: string; undone: boolean; files: { [file: string]: { before: string | null; after: string | null; whole: boolean; values: Value[] } } }

// A file's bytes, or null when there is none.
const held = (files: Files, rel: string) =>
  files.bytes(rel).catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') return null
    throw e
  })
const same = (a: Uint8Array | null, b: Uint8Array | null) => (a === null || b === null ? a === b : Buffer.from(a).equals(b))
const base64 = (b: Uint8Array | null) => (b === null ? null : Buffer.from(b).toString('base64'))
const unbase64 = (s: string | null) => (s === null ? null : new Uint8Array(Buffer.from(s, 'base64')))
// A file's text, or null when its bytes are not UTF-8.
const textOf = (b: Uint8Array) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b)
  } catch {
    return null
  }
}
// What a change's record is named by: a page names a change as it likes, and a file is named by this.
const hash = (id: string) => createHash('sha1').update(id).digest('hex')
// Where a value put into a list at `at` landed, as the file's text after it says: an insert at an
// index before 0 or past the end goes on the end, and is taken back out from there.
const landed = (at: At, insert: boolean, text: string): At => {
  const key = at[at.length - 1]
  if (!insert || typeof key !== 'number') return at
  const list = valueAt(text, at.slice(0, -1)) as unknown[]
  return key >= 0 && key < list.length ? at : [...at.slice(0, -1), list.length - 1]
}

// The files one change, undo or redo writes through. Each file's bytes are read before its first
// write, as soon as the write is asked for, so writes a route makes at once are read before any lands.
class Writing {
  private files: Files
  // Every file written, by its path from the repo, with its bytes before.
  readonly before = new Map<string, Promise<Uint8Array | null>>()
  constructor(files: Files) {
    this.files = files
  }

  // The path from the repo of `rel`, as two ops naming one file each name it.
  key(rel: string) {
    return path.relative(this.files.root, path.resolve(this.files.root, rel)).split(path.sep).join('/')
  }
  private async touch(rel: string) {
    const key = this.key(rel)
    if (!this.before.has(key)) this.before.set(key, held(this.files, rel))
    await this.before.get(key)
  }
  async write(rel: string, data: string | Uint8Array) {
    await this.touch(rel)
    await this.files.write(rel, data)
  }
  async remove(rel: string) {
    await this.touch(rel)
    await this.files.remove(rel)
  }
  async edit(rel: string, at: At, value: unknown, insert = false, back?: Back) {
    await this.touch(rel)
    return this.files.edit(rel, at, value, insert, back)
  }
  // What a route is handed: it reads as the server's files do, and every file it writes or takes away
  // joins the change, and is put in `whole`; every JSON value it sets is set as a `json` op sets one.
  routeFiles(whole: Set<string>, json: (rel: string, at: At, value: unknown, insert: boolean) => Promise<void>): RouteFiles {
    return {
      resolve: rel => this.files.resolve(rel),
      read: rel => this.files.read(rel),
      bytes: rel => this.files.bytes(rel),
      write: (rel, data) => {
        whole.add(this.key(rel))
        return this.write(rel, data)
      },
      edit: (rel, at, value, insert = false) => json(rel, at, value, insert),
      remove: rel => {
        whole.add(this.key(rel))
        return this.remove(rel)
      },
      list: dir => this.files.list(dir),
    }
  }
  // Every file written put back as it was, the last written first; a file whose bytes could not be
  // read was never written.
  async putBack() {
    for (const [rel, before] of [...this.before].reverse()) {
      const was = await before.catch(() => undefined)
      if (was === undefined || same(was, await held(this.files, rel))) continue
      if (was === null) await this.files.remove(rel)
      else await this.files.write(rel, was)
    }
  }
}

export class Changes {
  private files: Files
  private folder: string
  private call: Call
  // Every change kept, by the hash of its id, with its record's file, in the order they were made.
  private kept = new Map<string, string>()
  private next = 0
  private loaded: Promise<void> | undefined
  private last: Promise<unknown> = Promise.resolve()
  private count = 0
  constructor(files: Files, folder: string, call: Call) {
    this.files = files
    this.folder = folder
    this.call = call
  }

  // How many changes, undos and redos have been applied, and changes on the disk no change made.
  get version() {
    return this.count
  }
  // A change on the disk that no change made, counted.
  outside() {
    this.count++
  }

  change(id: string, ops: Op[]): Promise<Answer> {
    return this.queued(id, async () => {
      if (this.kept.has(hash(id))) throw new Error(`a change ${id} is made already`)
      const w = new Writing(this.files)
      const whole = new Set<string>()
      const values = new Map<string, Value[]>()
      const answers: unknown[] = []
      const record: Made = { id, undone: false, files: new Map() }
      // One JSON value set, by an op or by a route, kept as a value of its file.
      const json = async (rel: string, at: At, value: unknown, insert = false, index?: number) => {
        const d = await w.edit(rel, at, value, insert, index !== undefined ? { slot: index } : undefined)
        const key = w.key(rel)
        values.set(key, [...(values.get(key) ?? []), {
          at: landed(at, insert, d.text), before: d.before, after: value, splice: d.splice,
          ...(insert && { insert }), ...(d.was && { was: d.was }), ...(index !== undefined && { index }),
        }])
      }
      try {
        for (const op of ops) {
          if ('json' in op) {
            await json(op.json, op.at, op.value, op.insert, op.index)
          } else if ('text' in op) {
            whole.add(w.key(op.text))
            await (op.value === null ? w.remove(op.text) : w.write(op.text, op.value))
          } else if ('bytes' in op) {
            whole.add(w.key(op.bytes))
            await (op.value === null ? w.remove(op.bytes) : w.write(op.bytes, unbase64(op.value)!))
          } else {
            answers.push(await this.call(op.route.owner, op.route.route, op.route.body, w.routeFiles(whole, json)))
          }
        }
        for (const [rel, before] of w.before)
          record.files.set(rel, { before: await before, after: await held(this.files, rel), whole: whole.has(rel), values: values.get(rel) ?? [] })
        await this.keep(record)
      } catch (e) {
        await w.putBack()
        throw e
      }
      return this.answer(id, new Map([...record.files].map(([rel, k]) => [rel, k.after])), answers)
    })
  }

  undo(id: string): Promise<Answer> {
    return this.queued(id, () => this.flip(id, true))
  }

  redo(id: string): Promise<Answer> {
    return this.queued(id, () => this.flip(id, false))
  }

  // `f` applied once every change asked for before it is, answered with what it answers, or with the
  // error it throws.
  private queued(id: string, f: () => Promise<Changed>): Promise<Answer> {
    const run = this.last.then(async () => {
      await (this.loaded ??= this.load())
      return await f()
    }).catch((e: Error) => ({ id, error: e.message }))
    this.last = run
    return run
  }

  // A change taken back, `undo`, or made again.
  private async flip(id: string, undo: boolean): Promise<Changed> {
    const record = await this.record(id)
    if (record.undone === undo) throw new Error(undo ? `${id} is taken back already` : `${id} is not taken back`)
    const w = new Writing(this.files)
    // What each file the change wrote holds now, refused for a whole file where it is not what the
    // change left it holding; and what it holds once taken back, or made again.
    const found = new Map<string, Uint8Array | null>()
    const left = new Map<string, Uint8Array | null>()
    try {
      for (const [rel, k] of record.files) {
        if (same(k.before, k.after)) continue
        const now = await held(this.files, rel)
        found.set(rel, now)
        if (k.whole && !same(now, undo ? k.after : k.before))
          throw new Error(`${rel} has changed since ${id} was ${undo ? 'made' : 'taken back'}, so it is not ${undo ? 'taken back' : 'made again'}`)
      }
      for (const [rel, now] of found) {
        const k = record.files.get(rel)!
        const [from, to] = undo ? [k.after, k.before] : [k.before, k.after]
        if (same(now, from)) await (to === null ? w.remove(rel) : w.write(rel, to))
        else if (undo) for (const v of [...k.values].reverse()) await w.edit(rel, ...back(v))
        else for (const v of k.values) {
          const d = await w.edit(rel, v.at, v.after, v.insert ?? false, v.index !== undefined ? { slot: v.index } : undefined)
          v.splice = d.splice
          if (d.was) v.was = d.was
        }
        left.set(rel, await held(this.files, rel))
        if (undo) Object.assign(k, { after: now, before: left.get(rel) })
        else Object.assign(k, { before: now, after: left.get(rel) })
      }
      record.undone = undo
      await this.keep(record)
    } catch (e) {
      await w.putBack()
      throw e
    }
    return this.answer(id, left, [])
  }

  // What a change, undo or redo applied answers, counted: each file it touched, by what it left there.
  private answer(id: string, touched: Map<string, Uint8Array | null>, answers: unknown[]): Changed {
    this.count++
    const files = Object.fromEntries([...touched].map(([rel, b]) => [rel, b === null ? null : textOf(b)]))
    return { id, version: this.count, files, answers }
  }

  // ---------------------------------------------------------------- on the disk

  // Every record kept, in the order they were made.
  private async load() {
    await mkdir(this.folder, { recursive: true })
    const names = (await readdir(this.folder)).flatMap(name => {
      const m = /^(\d+)-([0-9a-f]{40})\.json$/.exec(name)
      return m ? [{ name, n: Number(m[1]), hash: m[2] }] : []
    })
    for (const { name, hash } of names.sort((a, b) => a.n - b.n)) this.kept.set(hash, name)
    this.next = names.reduce((n, r) => Math.max(n, r.n + 1), 0)
  }

  private async record(id: string): Promise<Made> {
    const name = this.kept.get(hash(id))
    if (name === undefined) throw new Error(`no change ${id} is kept`)
    const stored = JSON.parse(await readFile(path.join(this.folder, name), 'utf8')) as Stored
    return {
      id: stored.id,
      undone: stored.undone,
      files: new Map(Object.entries(stored.files).map(([rel, k]) => [rel, { ...k, before: unbase64(k.before), after: unbase64(k.after) }])),
    }
  }

  // A record written to its file, whole: a server stopped as it writes leaves the one before. A new
  // one past the last `KEPT` takes the oldest away.
  private async keep(record: Made) {
    const key = hash(record.id)
    const name = this.kept.get(key) ?? `${this.next}-${key}.json`
    const stored: Stored = {
      id: record.id,
      undone: record.undone,
      files: Object.fromEntries([...record.files].map(([rel, k]) => [rel, { ...k, before: base64(k.before), after: base64(k.after) }])),
    }
    const file = path.join(this.folder, name)
    await writeFile(`${file}.writing`, JSON.stringify(stored))
    await rename(`${file}.writing`, file)
    if (this.kept.has(key)) return
    this.kept.set(key, name)
    this.next++
    for (const [old, at] of this.kept) {
      if (this.kept.size <= KEPT) break
      this.kept.delete(old)
      await rm(path.join(this.folder, at), { force: true })
    }
  }
}

// How a JSON value is taken back: its bytes put back where it can be and else the value it replaced
// written as it was; a value put into a list taken out, and one taken out of a list put back in.
function back(v: Value): [At, unknown, boolean, Back] {
  const was: Back = { ...(v.before !== undefined && v.was), splice: v.splice }
  if (v.insert) return [v.at, undefined, false, { splice: v.splice }]
  if (v.after === undefined && typeof v.at[v.at.length - 1] === 'number') return [v.at, v.before, true, was]
  return [v.at, v.before, false, was]
}
