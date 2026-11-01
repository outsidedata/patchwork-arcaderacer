// A game's scene files, read and edited as text, for the asset workshop. Every edit is made at the
// place of the value it changes and at that place's indent, so the rest of a file laid out by hand
// (an asset entry on one line, a number array on one) stays byte for byte as it was. Nothing here
// touches the disk: each function takes a file's text and hands back the new text, or undefined when
// the scene has nothing the edit applies to.
//
// `spans(text)` parses JSON into values that keep their spans in the text.
// `fit(text, { body, prop, hold, ik })` sets how the anim kind `body` holds the model `prop`, in a
//   scene file or a partial. Whether the scene draws that body and has that model is the caller's to
//   know, from the scene as the game loads it, its partial under it. `hold` (`{ bone, at, turn }`) is
//   the body's `props` entry for the model, written in place or added last, in a file whose own
//   `world.anim.kinds` has that body (undefined when it has not); `ik` is `world.ik3d.kinds.<body>`,
//   written in place or added, with `ik3d` added to the file's `plugins` (`listed`) and `world.ik3d`
//   with anim's body mod, when the file has none yet.
// `listed(text)` adds `ik3d` to a scene's `plugins` right after `anim`: undefined when it lists it
//   already, lists no `anim`, or has no `plugins` (a partial).
// `catalogue(text, key, entry)` adds the loader entry `key` to a scene that draws with anim, unless
//   it has one: undefined when it has that same entry or does not draw with anim; it throws when it
//   has another entry by that key, since a game's key names one file.
// `points(text, vehicle, { empties?, turns? })` sets the points of a box3dvehicle vehicle's look,
//   `world.box3dvehicle.vehicles.<vehicle>.look.points` (`{ <name>: [x, y, z] | { at, part?, turn? } }`,
//   the chassis's frame), in a scene file or a partial whose own world gives that look: undefined when
//   it gives none. Each point named in `empties` (`[x, y, z]`) is written in place, the point itself
//   when it is bare and its `at` when it is an object (its `part` and `turn` kept), or added last in
//   `points` (on a line of its own, on one line, when the points stand so), `points` made last in the
//   look when it has none. Each named in `turns` (a quaternion [x, y, z, w]) has its `turn` written in
//   place, added last in its object when it has none, or, a bare point, made `{ "at": …, "turn": … }`
//   where it stood; it throws for a turn of a point the look has not, and for one whose object has no
//   `at`.
// `poses(text, machine, name, poses)` sets what a machine does in each step of its interaction `name`
//   (`plugins/interact`), its definition's `interact.<name>` (`{ <step>: { <field>: value } }`, mech's
//   jimmy's `kneel`), in a game's definitions file (`world.defs`): undefined when the file has no
//   definition `machine`. Each field is written in place, or added last in its step, the step last in
//   the interaction, the interaction last in `interact`, and `interact` last in the definition, each
//   made where it is missing.
// `set(text, path, value)` sets the value at `path` (object keys, and an array's index as a number) in
//   any JSON file, as the UI workshop writes a `world.ui` style or panel and a definition's word or
//   place: written in place at that value's own layout when it is there, else added last in the
//   deepest object the path reaches, the keys still missing made around it. It throws for a path that
//   runs through a value that is not an object, or past the end of an array.

export type Spanned = { from: number; to: number } & (
  | { kind: 'object'; entries: [string, Spanned][] }
  | { kind: 'array'; items: Spanned[] }
  | { kind: 'value'; value: unknown })

export function spans(text: string): Spanned {
  let i = 0
  const space = () => { while (/\s/.test(text[i] ?? '')) i++ }
  const value = (): Spanned => {
    space()
    const from = i
    if (text[i] === '{') {
      i++
      const entries: [string, Spanned][] = []
      space()
      if (text[i] === '}') { i++; return { kind: 'object', entries, from, to: i } }
      for (;;) {
        const key = value()
        space()
        i++ // the colon
        entries.push([key.kind === 'value' ? String(key.value) : '', value()])
        space()
        if (text[i++] === '}') return { kind: 'object', entries, from, to: i }
      }
    }
    if (text[i] === '[') {
      i++
      const items: Spanned[] = []
      space()
      if (text[i] === ']') { i++; return { kind: 'array', items, from, to: i } }
      for (;;) {
        items.push(value())
        space()
        if (text[i++] === ']') return { kind: 'array', items, from, to: i }
      }
    }
    if (text[i] === '"') {
      i++
      while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1
      i++
    } else {
      while (i < text.length && !/[\s,\]}]/.test(text[i])) i++
    }
    return { kind: 'value', value: JSON.parse(text.slice(from, i)), from, to: i }
  }
  return value()
}

const at = (node: Spanned | undefined, key: string) => (node?.kind === 'object' ? node.entries.find(([k]) => k === key)?.[1] : undefined)
const indentAt = (text: string, from: number) => text.slice(text.lastIndexOf('\n', from) + 1, from).match(/^[ \t]*/)![0]
// The indent of the line a value's key starts on.
const keyIndent = (text: string, value: Spanned) => indentAt(text, text.lastIndexOf('"', text.lastIndexOf(':', value.from)))
// One step of indent, as the file steps: the indent of an object's first key past its own line's.
function step(text: string, obj: Spanned & { kind: 'object' | 'array' }) {
  const first = obj.kind === 'object' ? obj.entries[0]?.[1] : obj.items[0]
  if (first && text.slice(obj.from, first.from).includes('\n')) {
    const inner = obj.kind === 'object' ? keyIndent(text, first) : indentAt(text, first.from)
    const outer = indentAt(text, obj.from)
    if (inner.length > outer.length) return inner.slice(outer.length)
  }
  return '  '
}
// Whether a file keeps arrays of numbers on one line, `[1, 2, 3]`, more often than one number a line.
function flatNumbers(text: string) {
  const inline = (text.match(/\[ *-?\d[^\[\]\n]*\]/g) ?? []).length
  const spread = (text.match(/\[\n[ \t]*-?\d/g) ?? []).length
  return inline > spread
}
let flat = false // the style of the file being edited, set by each exported edit
// A value laid out as JSON, `unit` a step, every line past the first at `indent`, its arrays of
// numbers on one line when the file keeps them so.
function lay(value: unknown, indent: string, unit = '  '): string {
  let text = JSON.stringify(value, null, unit)
  if (flat) text = text.replace(/\[\s*(-?[\d.e+-]+(?:,\s*-?[\d.e+-]+)*)\s*\]/g, (_m, inner: string) => `[${inner.split(/,\s*/).join(', ')}]`)
  return text.split('\n').map((l, i) => (i ? indent + l : l)).join('\n')
}
// A value on one line, as a hand lays one: `{ "a": 1, "b": [1, 2] }`.
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`
  if (value && typeof value === 'object') {
    const e = Object.entries(value)
    return e.length ? `{ ${e.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(', ')} }` : '{}'
  }
  return JSON.stringify(value)
}
// A key and value put last in an object, at the indent of its keys; on one line when the object is
// on one, or when the value it follows stands on one line and the new one is no deeper than it.
function append(text: string, obj: Spanned & { kind: 'object' }, key: string, value: unknown) {
  const last = obj.entries[obj.entries.length - 1]?.[1]
  const unit = step(text, obj)
  if (!last) {
    const ind = indentAt(text, obj.from) + unit
    return text.slice(0, obj.from + 1) + `\n${ind}${JSON.stringify(key)}: ${lay(value, ind, unit)}\n${indentAt(text, obj.from)}` + text.slice(obj.to - 1)
  }
  if (!text.slice(obj.from, last.to).includes('\n')) return text.slice(0, last.to) + `, ${JSON.stringify(key)}: ${inline(value)}` + text.slice(last.to)
  const ind = keyIndent(text, last)
  const depth = (v: unknown): number => (v && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depth)) : 0)
  const was = JSON.parse(text.slice(last.from, last.to))
  const short = (last.kind === 'object' || last.kind === 'array') && !text.slice(last.from, last.to).includes('\n') && depth(value) <= depth(was)
  return text.slice(0, last.to) + `,\n${ind}${JSON.stringify(key)}: ${short ? inline(value) : lay(value, ind, unit)}` + text.slice(last.to)
}
// An item put last in an array, at the indent of its items.
function push(text: string, arr: Spanned & { kind: 'array' }, value: unknown) {
  const last = arr.items[arr.items.length - 1]
  const unit = step(text, arr)
  if (!last) {
    const ind = indentAt(text, arr.from) + unit
    return text.slice(0, arr.from + 1) + `\n${ind}${lay(value, ind, unit)}\n${indentAt(text, arr.from)}` + text.slice(arr.to - 1)
  }
  if (!text.slice(arr.from, last.to).includes('\n')) return text.slice(0, last.to) + `, ${JSON.stringify(value)}` + text.slice(last.to)
  const ind = indentAt(text, last.from)
  return text.slice(0, last.to) + `,\n${ind}${lay(value, ind, unit)}` + text.slice(last.to)
}
// A value replaced in place. A string or a number as JSON. An array of numbers as the one it replaces
// was laid: one a line at its items' indent, or `[a, b, c]`. An object on one line when it stood on
// one, else laid out at its key's indent.
function replace(text: string, old: Spanned, value: unknown, unit: string) {
  const was = text.slice(old.from, old.to)
  let now: string
  if (Array.isArray(value) && value.every(v => typeof v === 'number')) {
    if (!was.includes('\n')) now = `[${value.join(', ')}]`
    else {
      const inner = was.match(/\n([ \t]*)\S/)?.[1] ?? ''
      const close = was.match(/\n([ \t]*)\]$/)?.[1] ?? ''
      now = `[\n${value.map(n => inner + n).join(',\n')}\n${close}]`
    }
  } else if (typeof value !== 'object' || value === null) now = JSON.stringify(value)
  else if (!was.includes('\n')) now = JSON.stringify(value).replace(/,"/g, ', "').replace(/":/g, '": ')
  else now = lay(value, keyIndent(text, old), unit)
  return text.slice(0, old.from) + now + text.slice(old.to)
}

export type Hold = { bone: string; at: number[]; turn: number[] }

export function fit(text: string, f: { body: string; prop: string; hold?: Hold; ik?: unknown }): string | undefined {
  flat = flatNumbers(text)
  let top = spans(text)
  const kind = at(at(at(at(top, 'world'), 'anim'), 'kinds'), f.body)
  if (f.hold && kind?.kind !== 'object') return undefined
  if (f.hold && kind?.kind === 'object') {
    const props = at(kind, 'props')
    const found = props?.kind === 'array' ? props.items.find(p => { const m = at(p, 'model'); return m?.kind === 'value' && m.value === f.prop }) : undefined
    if (found?.kind === 'object') {
      // Each field in its own place, last first so the earlier spans hold; one missing is added.
      const fields = (['bone', 'at', 'turn'] as const).map(k => [k, at(found, k)] as const)
      for (const [k, old] of [...fields].filter(([, o]) => o).sort((a, b) => b[1]!.from - a[1]!.from)) text = replace(text, old!, f.hold[k], '  ')
      for (const [k] of fields.filter(([, o]) => !o)) {
        const now = at(at(at(at(at(spans(text), 'world'), 'anim'), 'kinds'), f.body), 'props') as Spanned & { kind: 'array' }
        const entry = now.items.find(p => { const m = at(p, 'model'); return m?.kind === 'value' && m.value === f.prop }) as Spanned & { kind: 'object' }
        text = append(text, entry, k, f.hold[k])
      }
    } else if (props?.kind === 'array') text = push(text, props, { model: f.prop, ...f.hold })
    else text = append(text, kind, 'props', [{ model: f.prop, ...f.hold }])
    top = spans(text)
  }
  if (f.ik !== undefined) {
    text = listed(text) ?? text
    top = spans(text)
    const world = at(top, 'world') as Spanned & { kind: 'object' }
    const ik3d = at(world, 'ik3d')
    const kinds = at(ik3d, 'kinds')
    if (!ik3d) text = append(text, world, 'ik3d', { mods: { body: 'anim' }, kinds: { [f.body]: f.ik } })
    else if (kinds?.kind === 'object') {
      const was = at(kinds, f.body)
      text = was ? replace(text, was, f.ik, step(text, kinds)) : append(text, kinds, f.body, f.ik)
    } else if (ik3d.kind === 'object') text = append(text, ik3d, 'kinds', { [f.body]: f.ik })
  }
  return text
}

export function listed(text: string): string | undefined {
  const plugins = at(spans(text), 'plugins')
  if (plugins?.kind !== 'array' || plugins.items.some(i => i.kind === 'value' && i.value === 'ik3d')) return undefined
  const anim = plugins.items.find(i => i.kind === 'value' && i.value === 'anim')
  if (!anim) return undefined
  const oneLine = !text.slice(plugins.from, plugins.to).includes('\n')
  return text.slice(0, anim.to) + (oneLine ? ', "ik3d"' : `,\n${indentAt(text, anim.from)}"ik3d"`) + text.slice(anim.to)
}

export function catalogue(text: string, key: string, entry: Record<string, unknown>): string | undefined {
  flat = flatNumbers(text)
  const top = spans(text)
  if (!at(at(top, 'world'), 'anim')) return undefined
  const assets = at(at(at(top, 'world'), 'loader'), 'assets')
  if (assets?.kind !== 'object') return undefined
  const had = at(assets, key)
  if (had) {
    const value = JSON.parse(text.slice(had.from, had.to))
    if (JSON.stringify(value) === JSON.stringify(entry)) return undefined
    throw new Error(`the scene's catalogue has another ${key}: ${JSON.stringify(value)}`)
  }
  return append(text, assets, key, entry)
}

export function points(text: string, vehicle: string, edit: { empties?: Record<string, number[]>; turns?: Record<string, number[]> }): string | undefined {
  flat = flatNumbers(text)
  const lookOf = (t: string) => at(at(at(at(at(spans(t), 'world'), 'box3dvehicle'), 'vehicles'), vehicle), 'look')
  if (lookOf(text)?.kind !== 'object') return undefined
  for (const [name, p] of Object.entries(edit.empties ?? {})) {
    const look = lookOf(text) as Spanned & { kind: 'object' }
    const all = at(look, 'points')
    const was = at(all, name)
    if (was?.kind === 'object') {
      const place = at(was, 'at')
      if (!place) throw new Error(`${vehicle}'s point ${name} has no at to move`)
      text = replace(text, place, p, '  ')
    } else if (was) text = replace(text, was, p, '  ')
    else if (all?.kind === 'object') text = append(text, all, name, p)
    else text = append(text, look, 'points', { [name]: p })
  }
  for (const [name, q] of Object.entries(edit.turns ?? {})) {
    const was = at(at(lookOf(text), 'points'), name)
    if (!was) throw new Error(`${vehicle}'s look has no point ${name} to turn`)
    if (was.kind === 'object') {
      if (!at(was, 'at')) throw new Error(`${vehicle}'s point ${name} has no at`)
      const turn = at(was, 'turn')
      text = turn ? replace(text, turn, q, '  ') : append(text, was, 'turn', q)
    } else text = text.slice(0, was.from) + inline({ at: JSON.parse(text.slice(was.from, was.to)), turn: q }) + text.slice(was.to)
  }
  return text
}

export function set(text: string, path: (string | number)[], value: unknown): string {
  flat = flatNumbers(text)
  let node = spans(text)
  for (let i = 0; i < path.length; i++) {
    const key = path[i]
    if (node.kind === 'array') {
      if (typeof key !== 'number' || !node.items[key]) throw new Error(`${path.slice(0, i + 1).join('.')} is past the end of its list`)
      node = node.items[key]
      continue
    }
    if (node.kind !== 'object') throw new Error(`${path.slice(0, i).join('.')} is not an object, so it has no ${key}`)
    const next = at(node, String(key))
    if (!next) {
      const rest = path.slice(i + 1).reduceRight<unknown>((v, k) => ({ [String(k)]: v }), value)
      return append(text, node, String(key), rest)
    }
    node = next
  }
  return replace(text, node, value, '  ')
}

export function poses(text: string, machine: string, name: string, edit: Record<string, Record<string, unknown>>): string | undefined {
  flat = flatNumbers(text)
  if (at(spans(text), machine)?.kind !== 'object') return undefined
  for (const [stepName, fields] of Object.entries(edit)) {
    for (const [field, value] of Object.entries(fields)) {
      // Each value is found again in the text as it stands after the last edit.
      const def = at(spans(text), machine) as Spanned & { kind: 'object' }
      const interact = at(def, 'interact')
      if (interact?.kind !== 'object') { text = append(text, def, 'interact', { [name]: { [stepName]: { [field]: value } } }); continue }
      const one = at(interact, name)
      if (one?.kind !== 'object') { text = append(text, interact, name, { [stepName]: { [field]: value } }); continue }
      const st = at(one, stepName)
      if (st?.kind !== 'object') { text = append(text, one, stepName, { [field]: value }); continue }
      const was = at(st, field)
      text = was ? replace(text, was, value, '  ') : append(text, st, field, value)
    }
  }
  return text
}
