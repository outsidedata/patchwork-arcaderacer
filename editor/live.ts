// A data file, or several files edited as one, that a panel edits in place: every edit is written
// into the files as it is made, one change the editor can undo, so the editor's undo is the only
// undo there is and nothing is ever unsaved. The panel hands it each file's text as the editor last
// read it; `value` is what the files say.
//
// A gesture, a drag say, changes what is shown many times and is one change: `change` shows the next
// value without writing it, and `commit` writes what was shown once the gesture ends, or, handed a
// function, that function of the files as they are when it is written. `edit` is one edit written at
// once; handed a function, it shows the value as the edits before it left it, so keys pressed faster
// than the panel draws each land on the last, and writes that function of the files as they are
// when it is written, so a change another made to them in between, a command's say, is kept. Writes
// are made in order, each the values that differ from the files as the editor holds them when it is
// made.
//
// Every write of a panel's files, and every command's that writes the same way (`liveWrite`), waits
// on one chain of the editor's, so none reads the files while another's write is in hand, and a
// stroke of a panel and a stroke of a call never interleave. A write that makes its own edits, a
// value written whole where `changes` would write it field by field, runs on the same chain
// (`onChain`), and never on one of its own.
//
// A value of one file is the file's JSON (`fileCodec`). A value of several is what a `Codec` reads
// from their JSON, by path, and writes back to it: a map and its tilesets, say, with a layer's cells
// as numbers where the file packs them.
//
// A command that writes a panel's one file writes it as `liveEdit` does: what it makes of the file's
// JSON as it is when it is written, on the chain, and what it answers made of the same JSON.
import { useMemo, useRef, useState } from 'react'
import { useEditor } from './context.ts'
import { changes, type Edits, type Editor } from './editor.ts'

export type Codec<T> = {
  // The value the files' JSON, by path, make.
  read(files: Record<string, unknown>): T
  // Each file's JSON as the value makes it, handed the files' JSON as they are.
  write(value: T, files: Record<string, unknown>): Promise<Record<string, unknown>>
}

export type Live<T> = {
  value: T
  // Something is being written.
  writing: boolean
  change(next: T): void
  commit(next?: (files: T) => T): void
  edit(next: T | ((was: T) => T)): void
}

type Texts = Record<string, string>
const parsed = (texts: Texts) => Object.fromEntries(Object.entries(texts).map(([p, t]) => [p, JSON.parse(t)]))

// One file as a codec: its JSON is the value.
export const fileCodec = <T>(path: string): Codec<T> => ({ read: files => files[path] as T, write: async value => ({ [path]: value }) })

// Each editor's chain of writes.
const chains = new WeakMap<Editor, Promise<void>>()

// `fn` run on the editor's chain of writes, once every write asked for before it has been made and
// taken in, so it works out what it writes from the files as they are when its turn comes, and every
// write asked for after it waiting on it in turn; what it throws is its caller's, and the chain goes
// on. Answers what `fn` answers.
export function onChain<T>(ed: Editor, fn: () => T | Promise<T>): Promise<T> {
  const done = (chains.get(ed) ?? Promise.resolve()).then(fn)
  chains.set(ed, done.then(() => {}, () => {}))
  return done
}

// Writes `next` into the files at `paths` through `codec`, as the change `e` makes, once every write
// asked for before it has been made: each file's values that differ from what the editor holds of it
// then, as one change. Handed a function, it writes that function of the value the files make then.
export function liveWrite<T>(ed: Editor, e: Pick<Edits, 'editFiles'>, paths: string[], codec: Codec<T>, next: T | ((files: T) => T)): Promise<void> {
  return onChain(ed, async () => {
    const now: Record<string, unknown> = {}
    for (const p of paths) now[p] = JSON.parse(await ed.text(p))
    const value = typeof next === 'function' ? (next as (files: T) => T)(codec.read(now)) : next
    const made = await codec.write(value, now)
    const edits = Object.keys(made).flatMap(p => changes(now[p], made[p]).map(c => ({ file: p, ...c })))
    if (edits.length) await e.editFiles(edits)
  })
}

// The file at `path` written as `op` makes it of the file's JSON as it is when it is written, on the
// editor's chain (`liveWrite`), as the change `e` makes; what `op` throws refuses the write, and
// nothing is written. Answers what `op` answered with the JSON it made.
export async function liveEdit<T, A>(ed: Editor, e: Pick<Edits, 'editFiles'>, path: string, op: (file: T) => { file: T; answer: A }): Promise<A> {
  let answer: A | undefined
  await liveWrite<T>(ed, e, [path], fileCodec(path), file => {
    const got = op(file)
    answer = got.answer
    return got.file
  })
  return answer as A
}

export function useLive<T>(path: string, text: string): Live<T>
export function useLive<T>(texts: Texts, codec: Codec<T>): Live<T>
export function useLive<T>(a: string | Texts, b: string | Codec<T>): Live<T> {
  // One file is a codec of one path.
  const texts = typeof a === 'string' ? { [a]: b as string } : a
  const codec: Codec<T> = typeof a === 'string' ? fileCodec(a) : b as Codec<T>
  // The texts are the caller's, read as it reads them; the editor is written through.
  const ed = useEditor([])
  const key = JSON.stringify(texts)
  // `key` is every text, and changes whenever one does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const files = useMemo(() => codec.read(parsed(texts)), [key])
  // How many times the files have changed while the panel is open: each change, a write landing or an
  // undo, is a new one, even an undo back to texts the files had before.
  const [seen, setSeen] = useState({ key, count: 0 })
  if (seen.key !== key) setSeen({ key, count: seen.count + 1 })
  const gen = seen.key === key ? seen.count : seen.count + 1
  // What a gesture in hand, or an edit being written, shows over the files as they are (`over`, the
  // count they were at), and the value the last edit made, which the next edit made before the panel
  // draws again edits. Once the files change they are shown, but while an edit is still being written:
  // a write before it that lands changes the files, and what the last edit shows stays shown until
  // its own write lands, so nothing drawn from it goes and comes back.
  const [shown, setShown] = useState<{ over: number; value: T }>()
  const [writing, setWriting] = useState(0)
  const latest = useRef<{ over: number; value: T } | undefined>(undefined)
  const held = (s: { over: number } | undefined) => !!s && (s.over === gen || writing > 0)
  const value = shown && held(shown) ? shown.value : files
  // The value the last edit or change made over the files as this drawing has them, else what it shows.
  const last = () => (latest.current && held(latest.current) ? latest.current.value : value)

  // `next` written on the editor's chain (`liveWrite`), each an undo of its own.
  const write = (next: T | ((files: T) => T)) => {
    const paths = Object.keys(texts)
    setWriting(n => n + 1)
    liveWrite(ed, ed, paths, codec, next).catch((e: Error) => {
      // What could not be written is not shown: the files are.
      ed.error(`${paths.join(', ')}: ${e.message}`, e.stack)
      setShown(undefined)
      latest.current = undefined
    }).finally(() => setWriting(n => n - 1))
  }

  return {
    value,
    writing: writing > 0,
    change(next: T) {
      latest.current = { over: gen, value: next }
      setShown({ over: gen, value: next })
    },
    // What `change` showed last, handed at once, as a field that changes and ends in one call does;
    // or `next` of the files as they are when it is written, which what `change` showed was of the
    // files as this drawing has them.
    commit(next?: (files: T) => T) {
      const v = last()
      if (next) write(next)
      else if (v !== files) write(v)
    },
    edit(next: T | ((was: T) => T)) {
      const was = last()
      const v = typeof next === 'function' ? (next as (was: T) => T)(was) : next
      if (v === was) return
      latest.current = { over: gen, value: v }
      setShown({ over: gen, value: v })
      write(typeof next === 'function' ? next as (files: T) => T : v)
    },
  }
}
