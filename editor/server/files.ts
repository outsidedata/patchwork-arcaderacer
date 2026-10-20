// The editor's files, on disk. Every path is relative to the repo and stays inside it, and never
// reaches into `node_modules` or `.git`, through a symlink either. A JSON edit sets, removes or
// inserts one value, found with jsonc-parser, the library VS Code edits settings.json with: only
// that value's bytes change, and they are written as the file around them writes JSON, so the file
// stays as a person or a machine wrote it. An edit hands back the bytes it changed and how the value
// it replaced was written, which take it back byte for byte.
import { applyEdits, findNodeAtLocation, getNodeValue, modify, parse, parseTree, type Node, type ParseError } from 'jsonc-parser'
import { mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type At = (string | number)[]
// The bytes an edit changed: from `offset`, `was` became `now`.
export type Splice = { offset: number; was: string; now: string }
// How a value is written where the value alone does not say: `raw`, the text it is written as, `1.0`
// where JSON would write `1`; `slot`, for a key an object lacks, its place among the object's keys;
// and `splice`, the bytes of the edit this one takes back.
export type Back = { raw?: string; slot?: number; splice?: Splice }

// The splice that turns `a` into `b`: what lies between the start and the end they share.
export function splice(a: string, b: string): Splice {
  let from = 0
  while (from < a.length && from < b.length && a[from] === b[from]) from++
  let back = 0
  while (back < a.length - from && back < b.length - from && a[a.length - 1 - back] === b[b.length - 1 - back]) back++
  return { offset: from, was: a.slice(from, a.length - back), now: b.slice(from, b.length - back) }
}

// Whether two JSON texts hold the same value, whatever order their objects' keys are in: a text
// that does not parse holds none.
function same(a: string, b: string): boolean {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sorted)
    : v !== null && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])]))
    : v
  const value = (t: string) => {
    const errors: ParseError[] = []
    const v = parse(t, errors)
    return errors.length ? undefined : JSON.stringify(sorted(v))
  }
  const va = value(a)
  return va !== undefined && va === value(b)
}

// The value at `at` in JSON text, or undefined when there is none.
export function valueAt(text: string, at: At): unknown {
  const tree = parseTree(text)
  const node = tree && findNodeAtLocation(tree, at)
  return node ? getNodeValue(node) : undefined
}

// How the value at `at` is put back as it is written, or undefined when there is none.
export function backOf(text: string, at: At): Back | undefined {
  const tree = parseTree(text)
  const node = tree && findNodeAtLocation(tree, at)
  if (!node) return undefined
  const raw = text.slice(node.offset, node.offset + node.length)
  const key = node.parent?.type === 'property' ? node.parent : undefined
  return key?.parent?.children ? { raw, slot: key.parent.children.indexOf(key) } : { raw }
}

// How a file writes JSON, read off the file: the indent a nested line steps in by and its line
// ending, and, on one line, what stands between a key and its value, between two items, and inside
// the braces of an object. What a file shows none of is written as this repo writes it:
// `{ "is": "imp", "pos": [2, 0, -31] }`, two spaces in a line.
type Style = { unit: string; eol: string; colon: string; comma: string; pad: boolean }

const end = (n: Node) => n.offset + n.length
const oneLine = (text: string, n: Node) => !text.slice(n.offset, end(n)).includes('\n')

function styleOf(text: string, tree: Node | undefined): Style {
  const indents = [...text.matchAll(/^([ \t]+)\S/gm)].map(m => m[1])
  const spaces = indents.filter(i => !i.includes('\t')).map(i => i.length)
  const unit = indents.some(i => i.startsWith('\t')) && !spaces.length ? '\t' : ' '.repeat(spaces.length ? Math.min(...spaces) : 2)
  const style: Style = { unit, eol: text.includes('\r\n') ? '\r\n' : '\n', colon: ': ', comma: ', ', pad: true }
  let colon = false, comma = false, pad = false
  const walk = (n: Node) => {
    if (colon && comma && pad) return
    if (n.type === 'property' && !colon && n.children?.length === 2) {
      style.colon = text.slice(end(n.children[0]), n.children[1].offset)
      colon = true
    }
    if ((n.type === 'array' || n.type === 'object') && oneLine(text, n)) {
      const kids = n.children ?? []
      if (!comma && kids.length >= 2) {
        style.comma = text.slice(end(kids[0]), kids[1].offset)
        comma = true
      }
      if (!pad && n.type === 'object' && kids.length) {
        style.pad = text[n.offset + 1] === ' '
        pad = true
      }
    }
    for (const c of n.children ?? []) walk(c)
  }
  if (tree) walk(tree)
  return style
}

// A value on one line, as the file writes one.
const inline = (v: unknown, s: Style): string =>
  Array.isArray(v) ? `[${v.map(x => inline(x, s)).join(s.comma)}]`
  : v !== null && typeof v === 'object'
    ? Object.keys(v).length
      ? `{${s.pad ? ' ' : ''}${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}${s.colon}${inline(x, s)}`).join(s.comma)}${s.pad ? ' ' : ''}}`
      : '{}'
  : JSON.stringify(v)

// A value as it is written on lines of its own at `indent`, each level `step` further in: an object
// a key a line, a list a value a line, and a list of numbers, strings or nothing else on one line.
const pretty = (v: unknown, indent: string, step: string, s: Style): string => {
  const inner = indent + step
  if (Array.isArray(v)) {
    if (v.every(x => x === null || typeof x !== 'object')) return inline(v, s)
    return `[${s.eol}${v.map(x => inner + pretty(x, inner, step, s)).join(`,${s.eol}`)}${s.eol}${indent}]`
  }
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  const keys = Object.entries(v)
  if (!keys.length) return '{}'
  return `{${s.eol}${keys.map(([k, x]) => `${inner}${JSON.stringify(k)}${s.colon}${pretty(x, inner, step, s)}`).join(`,${s.eol}`)}${s.eol}${indent}}`
}

// The text with the value at `at` set to `value`, or removed when `value` is undefined. `insert`
// puts `value` into the list at `at`'s last index, -1 being the end, instead of over what is there;
// a value set one past a list's end is put in after its last. A key an object lacks goes in at
// `back.slot` among its keys, or after the last, and a value where nothing is yet goes in, in the
// objects and lists it needs made around it, into the deepest list or object that is there.
//
// Only the value's bytes change, written as the file around them writes JSON (`Style`). A value
// written on one line is replaced on one line, and one written over lines is laid out again at its
// indent. An item or a key goes in beside the others as the list or the object already writes them:
// after the one before it, behind the text that already stands between two of them (`, `, or a line
// break and an indent), on one line in a list or an object written on one line, or among neighbours
// that are lists or objects each written on one line, as a catalogue's entries are, and else on lines
// of its own at its neighbours' indent. An empty list or object takes its first on its own line when
// what holds it is written on lines, and its last taken out leaves it `[]` or `{}`. An item or a key
// taken out takes with it the text that parts it from its neighbour and nothing else. So adding a
// value and taking it out again gives back the file's bytes, and nothing beside the value is written
// again.
//
// `back` is what an undo hands back. Its `splice`, the bytes of the edit this one takes back, is put
// back when the text still holds what that edit wrote at its offset and putting it back makes the
// value this edit would, so an undo is that edit's bytes again. A file changed there since is edited
// by value, `value` written as `back.raw` and a key put back at `back.slot`, so a number written
// `1.0`, a value laid out on lines of its own and a key taken out of the middle of an object come
// back as they were.
export function edit(text: string, at: At, value: unknown, insert = false, back: Back = {}): string {
  const { raw, slot, splice: made } = back
  if (made && text.startsWith(made.now, made.offset)) {
    const undone = text.slice(0, made.offset) + made.was + text.slice(made.offset + made.now.length)
    if (same(undone, edit(text, at, value, insert, { raw, slot }))) return undone
  }
  if (raw !== undefined && !same(raw, JSON.stringify(value) ?? '')) throw new Error(`${raw} is not the text of the value it is written for`)
  const tree = parseTree(text)
  const s = styleOf(text, tree)
  const lines = () => applyEdits(text, modify(text, at, value, {
    isArrayInsertion: insert,
    formattingOptions: { insertSpaces: s.unit !== '\t', tabSize: s.unit === '\t' ? 1 : s.unit.length, eol: s.eol },
  }))
  if (!tree || !at.length) return lines()
  const lead = (offset: number) => /^[ \t]*/.exec(text.slice(text.lastIndexOf('\n', offset - 1) + 1))![0]
  const node = findNodeAtLocation(tree, at)
  if (!insert && node) {
    if (value === undefined) {
      const item = node.parent?.type === 'property' ? node.parent : node
      const box = item.parent!
      const members = box.children!
      const i = members.indexOf(item)
      const [from, to] = members.length === 1 ? [box.offset + 1, end(box) - 1] : i > 0 ? [end(members[i - 1]), end(item)] : [item.offset, members[1].offset]
      return text.slice(0, from) + text.slice(to)
    }
    const written = raw ?? (oneLine(text, node) ? inline(value, s) : pretty(value, lead(node.offset), s.unit, s))
    return text.slice(0, node.offset) + written + text.slice(end(node))
  }
  if (value === undefined && !insert) return text
  // The deepest list or object that is there, and what goes into it: an item, or a key and its value,
  // with what it needs made around it.
  let k = at.length - 1
  while (k > 0 && !findNodeAtLocation(tree, at.slice(0, k))) k--
  const box = findNodeAtLocation(tree, at.slice(0, k))
  if (!box || (box.type !== 'object' && box.type !== 'array')) return lines()
  const whole = at.slice(k + 1).reduceRight<unknown>((v, key) => (typeof key === 'number' ? [v] : { [key]: v }), value)
  const members = box.children ?? []
  const key = at[k]
  let place: number
  if (box.type === 'array') {
    if (typeof key !== 'number') return lines()
    // An item goes in where `insert` says, or one past the end.
    if (insert && k === at.length - 1) place = key < 0 || key > members.length ? members.length : key
    else if (key === members.length) place = members.length
    else return lines()
  } else {
    if (typeof key !== 'string') return lines()
    place = k === at.length - 1 && slot !== undefined && slot <= members.length ? slot : members.length
  }
  const [open, close] = [box.offset + 1, end(box) - 1]
  // What holds the box, and whether the box, when it is empty that, is written on lines.
  const holder = box.parent?.type === 'property' ? box.parent.parent : box.parent
  const lined = members.length ? !oneLine(text, box) : !!holder && !oneLine(text, holder)
  const indent = members.length ? lead(members[0].offset) : lead(box.offset) + (holder ? lead(box.offset).slice(lead(holder.offset).length) || s.unit : s.unit)
  const step = indent.slice(lead(box.offset).length) || s.unit
  // Beside neighbours that are lists or objects written on one line, it is written on one line too.
  const near = members[Math.max(place - 1, 0)]
  const shown = near && (box.type === 'object' ? near.children?.[1] : near)
  const flat = !lined || (!!shown && (shown.type === 'object' || shown.type === 'array') && oneLine(text, shown))
  const written = (k === at.length - 1 ? raw : undefined) ?? (flat ? inline(whole, s) : pretty(whole, indent, step, s))
  const member = box.type === 'object' ? `${JSON.stringify(key)}${s.colon}${written}` : written
  if (!members.length) {
    if (lined) return text.slice(0, open) + `${s.eol}${indent}${member}${s.eol}${lead(box.offset)}` + text.slice(close)
    return text.slice(0, open) + (box.type === 'object' && s.pad ? ` ${member} ` : member) + text.slice(close)
  }
  const between = (i: number) => text.slice(end(members[i]), members[i + 1].offset)
  const sep = members.length > 1 ? between(0) : lined ? `,${s.eol}${indent}` : s.comma
  if (place === 0) return text.slice(0, members[0].offset) + member + sep + text.slice(members[0].offset)
  const after = end(members[place - 1])
  return text.slice(0, after) + (place < members.length ? between(place - 1) : sep) + member + text.slice(after)
}

export class Files {
  readonly root: string
  // Called with each file as it is written, by its absolute path, with what it now holds, or null
  // once it is taken away: the server's, which takes the file's module in anew and keeps what it
  // wrote, to know the change log's writes, and its own, from another's on the disk (`disk.ts`).
  private wrote: (file: string, data: string | Uint8Array | null) => void
  constructor(root: string, wrote: (file: string, data: string | Uint8Array | null) => void = () => {}) {
    this.root = path.resolve(root)
    this.wrote = wrote
  }

  // The absolute path of `rel`, refused when it leaves the repo or names what the editor never
  // touches, by its name or, through a symlink, by where it really is.
  async resolve(rel: string): Promise<string> {
    const abs = path.resolve(this.root, rel)
    const inside = (p: string, root: string) => {
      const r = path.relative(root, p)
      return r !== '' && !r.startsWith('..') && !path.isAbsolute(r) && !r.split(path.sep).some(s => s === 'node_modules' || s === '.git')
    }
    if (!inside(abs, this.root)) throw new Error(`${rel} is not a file of the repo the editor may touch`)
    let real = abs
    for (;;) {
      try {
        real = path.join(await realpath(real), path.relative(real, abs))
        break
      } catch {
        real = path.dirname(real)
      }
    }
    if (!inside(real, await realpath(this.root))) throw new Error(`${rel} is not a file of the repo the editor may touch`)
    return abs
  }

  async read(rel: string): Promise<string> {
    return readFile(await this.resolve(rel), 'utf8')
  }

  // A file's bytes, as it holds them.
  async bytes(rel: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(await this.resolve(rel)))
  }

  // Takes a file away, when it is there, and hands back the file it was.
  async remove(rel: string): Promise<string> {
    const abs = await this.resolve(rel)
    await rm(abs, { force: true })
    this.wrote(abs, null)
    return abs
  }

  // Writes text, or bytes, and hands back the file written.
  async write(rel: string, data: string | Uint8Array): Promise<string> {
    const abs = await this.resolve(rel)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, data)
    this.wrote(abs, data)
    return abs
  }

  // Sets one JSON value and hands back the new text, the value it replaced and how that value was
  // written (`backOf`), the bytes it changed, and the file written. `back` is as `edit`'s.
  async edit(rel: string, at: At, value: unknown, insert = false, back?: Back) {
    const text = await this.read(rel)
    const before = valueAt(text, at)
    const was = insert ? undefined : backOf(text, at)
    const after = edit(text, at, value, insert, back)
    const file = await this.write(rel, after)
    return { text: after, before, was, splice: splice(text, after), file }
  }

  // Every file under `dir`, as paths from the repo, skipping what the editor never touches. A folder
  // that is not there holds none, as one a route writes into once it has something to write.
  async list(dir: string): Promise<string[]> {
    const abs = await this.resolve(dir)
    const out: string[] = []
    const walk = async (at: string) => {
      const entries = await readdir(at, { withFileTypes: true }).catch((e: NodeJS.ErrnoException) => {
        if (at === abs && e.code === 'ENOENT') return []
        throw e
      })
      for (const e of entries) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === '.DS_Store') continue
        const p = path.join(at, e.name)
        if (e.isDirectory()) await walk(p)
        else out.push(path.relative(this.root, p).split(path.sep).join('/'))
      }
    }
    await walk(abs)
    return out.sort()
  }
}
