// A solids model's file, read and edited as text, for the asset workshop: the `json` model the solids
// plugin draws (`plugins/solids/solids.plugin.ts`), and the game's own plugins draw through it.
// Every edit is made at the place of the value it changes, in the style that place is written in (a
// node on one line, `{"at":[0,2.6,0]}` with no spaces, or spaced), so the rest of a hand-laid file
// stays byte for byte as it was. Nothing here touches the disk.
//
// A solids model's points are what hangs things in it:
//   nodes    `{ <name>: { parent?, at, turn?, mirror? } }`: the frames its parts hang in, `at` metres
//            from its parent's origin (the model's for a node with none), turned by `turn` [rx, ry],
//            radians, about x and then about y in its parent's frame. A node no part hangs in is a
//            frame alone, as a machine's mounts are: where the game hangs a module or a cabin.
//   empties  `{ <name>: [x, y, z] | { at: [x, y, z], part?, turn? } }`: points in the model's frame,
//            as a module's `muzzle`; one given a `part` rides that piece where the game turns it
//            (mech's mount3d), and is read and moved here by its `at`, its `part` kept; one given a
//            `turn`, a quaternion [x, y, z, w] as a glb's empty holds one, is turned by it (where a
//            hand that reaches it is turned to: a seat's grip).
//
// `solid(value)` is whether a parsed file is a solids model: `paints` an object and `parts` a list.
// `framesOf(model)` is its `{ nodes, empties, turns }`, each node with its `turn` ([0, 0] where it
//   gives none) and its `parent` and `mirror` where it gives them, each empty its point, and the turn
//   of each empty that gives one.
// `setFrames(text, { nodes?, empties?, turns? })` sets them; each empty named in `turns` has its
//   quaternion written in place, added after its `at`, or, a bare point, made `{ at, turn }`, laid as
//   it was. Each node named `{ at, turn?, parent? }` has its
//   `at` and `turn` written in place, a `turn` added after its `at` when it had none and the new one is
//   not [0, 0]; a node the file does not have is added last in `nodes`, hanging from `parent`, which
//   must be a node the file has. Each empty named `[x, y, z]` is written in place (into its `at` when
//   it rides a part) or added last in `empties`, which is made when the file has none. It throws for an `at` or an empty that is not
//   three numbers, a `turn` that is not two, a name that is not a word, and a parent the file lacks.

import { spans, type Spanned } from './scenes.ts'
import { pointOf, type Empty } from './drawn.ts'

export type Frame = { parent?: string; at: number[]; turn: number[]; mirror?: boolean }
export type Frames = { nodes: Record<string, Frame>; empties: Record<string, number[]>; turns: Record<string, number[]> }
export type FrameEdit = { nodes?: Record<string, { at: number[]; turn?: number[]; parent?: string }>; empties?: Record<string, number[]>; turns?: Record<string, number[]> }

export const solid = (v: any): boolean => !!v && typeof v === 'object' && !Array.isArray(v) && !!v.paints && typeof v.paints === 'object' && Array.isArray(v.parts)

export function framesOf(model: any): Frames {
  const nodes: Record<string, Frame> = {}
  for (const [name, n] of Object.entries((model.nodes ?? {}) as Record<string, any>)) {
    nodes[name] = { ...(n.parent === undefined ? {} : { parent: n.parent }), at: n.at, turn: n.turn ?? [0, 0], ...(n.mirror ? { mirror: true } : {}) }
  }
  const empties = Object.fromEntries(Object.entries((model.empties ?? {}) as Record<string, Empty>).map(([name, e]) => [name, pointOf(e)]))
  const turns = Object.fromEntries(Object.entries((model.empties ?? {}) as Record<string, Empty>).flatMap(([name, e]) => (!Array.isArray(e) && e.turn ? [[name, e.turn]] : [])))
  return { nodes, empties, turns }
}

const at = (node: Spanned | undefined, key: string) => (node?.kind === 'object' ? node.entries.find(([k]) => k === key)?.[1] : undefined)
const numbers = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every(x => typeof x === 'number' && Number.isFinite(x))
const word = (s: string) => /^[\w.-]+$/.test(s)
// A number as a hand writes one: four places at most, no -0.
const num = (n: number) => String(+n.toFixed(4) || 0)

// An array of numbers laid as `like` is laid: `[a,b,c]` or `[a, b, c]`.
const arr = (v: number[], like: string) => `[${v.map(num).join(/,\s/.test(like) ? ', ' : ',')}]`
// An object laid as `like` is: `{"a":1}` with no spaces, or `{ "a": 1 }`.
function obj(v: Record<string, unknown>, like: string) {
  const spaced = /":\s/.test(like)
  const val = (x: unknown): string => (Array.isArray(x) ? arr(x as number[], spaced ? ', ' : ',') : JSON.stringify(x))
  const body = Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}:${spaced ? ' ' : ''}${val(x)}`).join(spaced ? ', ' : ',')
  return spaced ? `{ ${body} }` : `{${body}}`
}

// A key and value put last in an object of entries each on its own line, laid as the last entry is.
function appendLine(text: string, o: Spanned & { kind: 'object' }, key: string, value: string) {
  const last = o.entries[o.entries.length - 1]?.[1]
  if (!last) {
    const ind = text.slice(text.lastIndexOf('\n', o.from) + 1, o.from).match(/^[ \t]*/)![0]
    return text.slice(0, o.from + 1) + `\n${ind}  ${JSON.stringify(key)}: ${value}\n${ind}` + text.slice(o.to - 1)
  }
  const colon = text.lastIndexOf(':', last.from)
  const keyAt = text.lastIndexOf('"', text.lastIndexOf('"', colon) - 1)
  const lineStart = text.lastIndexOf('\n', keyAt) + 1
  const ind = text.slice(lineStart, keyAt)
  const sep = text.slice(colon, last.from)
  const between = text.slice(o.from + 1, keyAt).includes('\n') ? `,\n${/^[ \t]*$/.test(ind) ? ind : ''}` : ', '
  return text.slice(0, last.to) + `${between}${JSON.stringify(key)}${sep}${value}` + text.slice(last.to)
}

export function setFrames(text: string, edit: FrameEdit): string {
  for (const [name, n] of Object.entries(edit.nodes ?? {})) {
    if (!word(name)) throw new Error(`${name} is not a node's name`)
    if (!numbers(n.at, 3)) throw new Error(`node ${name}'s at is not three numbers`)
    if (n.turn !== undefined && !numbers(n.turn, 2)) throw new Error(`node ${name}'s turn is not two numbers, [rx, ry]`)
    const top = spans(text)
    const nodes = at(top, 'nodes')
    const was = at(nodes, name)
    if (was?.kind === 'object') {
      // `turn` first, the later of the two in the file, so `at`'s span holds; then `at`.
      const turn = at(was, 'turn'), place = at(was, 'at')!
      const own = text.slice(was.from, was.to)
      if (n.turn !== undefined && turn) text = text.slice(0, turn.from) + arr(n.turn, text.slice(turn.from, turn.to)) + text.slice(turn.to)
      else if (n.turn !== undefined && (n.turn[0] !== 0 || n.turn[1] !== 0)) {
        const spaced = /":\s/.test(own)
        text = text.slice(0, place.to) + `,${spaced ? ' ' : ''}"turn":${spaced ? ' ' : ''}${arr(n.turn, spaced ? ', ' : text.slice(place.from, place.to))}` + text.slice(place.to)
      }
      text = text.slice(0, place.from) + arr(n.at, text.slice(place.from, place.to)) + text.slice(place.to)
      continue
    }
    if (nodes?.kind !== 'object') throw new Error(`the model has no nodes to add ${name} to`)
    if (n.parent !== undefined && !at(nodes, n.parent)) throw new Error(`node ${name} hangs from ${n.parent}, which the model does not have`)
    const like = nodes.entries.length ? text.slice(nodes.entries[nodes.entries.length - 1][1].from, nodes.entries[nodes.entries.length - 1][1].to) : '{"at":[0,0,0]}'
    const value: Record<string, unknown> = { ...(n.parent === undefined ? {} : { parent: n.parent }), at: n.at }
    if (n.turn && (n.turn[0] !== 0 || n.turn[1] !== 0)) value.turn = n.turn
    text = appendLine(text, nodes, name, obj(value, like))
  }
  for (const [name, p] of Object.entries(edit.empties ?? {})) {
    if (!word(name)) throw new Error(`${name} is not an empty's name`)
    if (!numbers(p, 3)) throw new Error(`empty ${name} is not three numbers`)
    const top = spans(text) as Spanned & { kind: 'object' }
    const empties = at(top, 'empties')
    const found = at(empties, name)
    const was = found?.kind === 'object' ? at(found, 'at') : found
    if (found && !was) throw new Error(`empty ${name} rides a part and has no at to move`)
    if (was) { text = text.slice(0, was.from) + arr(p, text.slice(was.from, was.to)) + text.slice(was.to); continue }
    if (empties?.kind === 'object') {
      const like = empties.entries.length ? text.slice(empties.entries[0][1].from, empties.entries[0][1].to) : ','
      text = appendLine(text, empties, name, arr(p, like))
      continue
    }
    const paints = at(top, 'paints')
    const like = paints ? text.slice(paints.from, paints.to) : ','
    text = appendLine(text, top, 'empties', `{ ${JSON.stringify(name)}: ${arr(p, /":\s/.test(like) ? ', ' : ',')} }`)
  }
  for (const [name, t] of Object.entries(edit.turns ?? {})) {
    if (!word(name)) throw new Error(`${name} is not an empty's name`)
    if (!numbers(t, 4)) throw new Error(`empty ${name}'s turn is not a quaternion, [x, y, z, w]`)
    const found = at(at(spans(text), 'empties'), name)
    if (!found) throw new Error(`the model has no empty ${name} to turn`)
    const own = text.slice(found.from, found.to)
    if (found.kind === 'object') {
      // `turn` written in place, or added after the empty's `at`.
      const turn = at(found, 'turn'), place = at(found, 'at')!
      if (turn) text = text.slice(0, turn.from) + arr(t, text.slice(turn.from, turn.to)) + text.slice(turn.to)
      else {
        const spaced = /":\s/.test(own)
        text = text.slice(0, place.to) + `,${spaced ? ' ' : ''}"turn":${spaced ? ' ' : ''}${arr(t, text.slice(place.from, place.to))}` + text.slice(place.to)
      }
    } else {
      // A bare point becomes `{ at, turn }`, laid as the point was.
      const spaced = /,\s/.test(own)
      text = text.slice(0, found.from) + (spaced ? `{ "at": ${own}, "turn": ${arr(t, own)} }` : `{"at":${own},"turn":${arr(t, own)}}`) + text.slice(found.to)
    }
  }
  return text
}
