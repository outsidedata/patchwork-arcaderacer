// terrain3d's extension: the Terrain panel on the field file of the open scene, and the brush, a
// tool of the game view that paints the field's layers (`terrain3d.sim.ts` says what the file holds).
//
// The panel (`terrain3d.components.tsx`) edits the file of the scene selected, or else of the one the
// game view shows, or else the first scene with a `world.terrain3d`. Every change it makes is written
// to the file through the editor, one value at a time, as one change the editor can undo; a change
// the land could not be made from, or that names a node, a rule's key or a surface that is not
// there, is refused and written nowhere, and the panel says why.
//
// terrain3d's change-check compares a field's top-level values by identity before it compares the
// text. Nothing here edits a parsed field in place: every edit reaches the file, the loader refills
// the parsed copies from the new text, which swaps every top-level value, and so the land is made
// again from what the file now says. The shortcut stays.
//
// The brush (T) strokes the armed layer of the field of the scene the game view shows, through the
// view's client:
//   - hovering, it draws a ring of its radius on the ground where the view's ray meets the client's
//     ground (`ground.ray`), and within it a ring where its hardness makes the stroke whole, with
//     each layer's square, the armed one in the accent colour, all in the stage's overlay, each a
//     band a few pixels wide laid on the ground;
//   - a press starts a stroke `{ verb, radius, hardness, strength, level, surface, path }` there, and
//     each move a quarter of the radius on adds a point to its path, every point to a thousandth of
//     a metre; the path so far is baked into the client's land (`stroke`), whose moved version
//     remeshes the rings it reaches, so the ground under the ring shows the stroke as it is dragged;
//   - a point outside the armed layer's square, or where the view's ray meets no ground, is dropped,
//     and a press there starts nothing; a path that leaves the square and comes back is broken there
//     into runs (an empty entry, which the server half never joins across);
//   - a `surface` press whose surface is none of the field's starts nothing, and neither does a press
//     on a layer whose land still holds the last stroke unsaved, which the stroke would replace; each
//     says why in the console;
//   - on release the stroke is put at the end of the layer's `strokes`, one change: undo takes it
//     out. It is saved on the editor's one chain of saves (`liveEdit`), reading the file as it is
//     when it is written, so two strokes in quick succession each land. It edits the field and nothing else: a thing standing
//     on the ground stands on it wherever the ground now is, since its game places it at a point on
//     the ground and never at a height of its own;
//   - a save the editor refuses, and one undone before the client's land was made again from the
//     file that held it, is taken out with `discard` of the land the client draws, which holds it
//     still when it was made again from another write meanwhile, so the ground drawn is the file's;
//   - `pick` strokes nothing: it reads the raw ground as the armed layer leaves it under the pointer
//     (`through`) into `level`, and the brush turns to flatten.
// The brush's settings and which layer is armed are the panel's to set. They are a viewer's
// convenience, kept in the browser's storage under the game and the field file, so a reload keeps
// them; a browser that keeps nothing starts each field from the same settings. The armed layer is
// followed through every write of its field that takes a layer out or puts one in, an undo's and a
// redo's and another page's too, by the layers the field held before the write and after it, so one
// made before the panel has looked at the field, an undo after a reload say, moves it all the same:
// taking it out disarms the brush. What it held before is what the editor read of it, and the field
// of every scene of the game is read as the game opens, so the editor holds it from then on.
//
// What the panel's buttons and the brush do is done by functions here, which the panel, the brush
// and the commands call alike: every change of the field goes through `writeField`, which refuses one
// the land could not be made from; each section's edits are made by its own function, a layer added,
// set or taken out by `layerEdits`, the program's values and a list of nodes pasted over its own by
// `reprogrammed`, which the node list's adds, removals and moves go through too, a node made again as
// another op, its values set and renamed by `nodeEdits`, the bands and the grain by `bandEdits`, a
// surface by `surfaceEdits`, the analysis by `analysisEdits` and the detail by `detailEdits`, and a
// list edited as a whole as the editor's `listEdits` writes it; a stroke is begun and dragged as
// `begun` and `dragged` take its path, and saved on the editor's one chain of saves (`save`); and the
// preview is sampled as `sampler` reads the field.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here, on the
// field file of any scene with a `world.terrain3d`, whatever the game view shows and whether it draws
// at all:
//   terrain.stroke    one stroke of the brush along ground points [x, z], its verb and numbers handed
//                     to it rather than the panel's, which are the person's: its path taken as a drag
//                     takes it, a `surface` stroke of no surface of the field refused as a press is,
//                     then saved as the brush saves it, after any stroke of the brush let go;
//                     it is baked into no land drawn, so one the brush is dragging does not stop it;
//   terrain.height    the ground at points, or a node's value, a key of the land record, or the raw
//                     ground as a layer leaves it, which the brush's pick reads;
//   terrain.range     the lowest and highest of what the preview shows, as its note says;
//   terrain.preview   the preview, a PNG, with the layers' squares over it;
//   terrain.layer     a layer added, its values set, or taken out;
//   terrain.program   the program's values set, and a list of nodes over its own, written as the node
//                     list writes it, a node added, taken out or moved one edit; none set reads it;
//   terrain.node      a node renamed, made again as another op, or its values set;
//   terrain.bands     the bands, a list edited as a whole, each with its edge or none, and the grain;
//   terrain.surface   a surface added, its values set, its edge among them, renamed, or taken out;
//   terrain.analysis  the numbers the land record reads the ground with;
//   terrain.detail    the ground detail the browser half draws over the colours, a list of layers
//                     edited as a whole, each of its kind's shape.
// Each change is one undo; one the land could not be made from is refused, as the panel refuses it.
import * as THREE from 'three'
import { z } from 'zod'
import { changes, edited, listEdits, outlined, OUTLINE, Refusal, turn, written, type Edits, type Editor, type FileEdit, type Pointer } from '#editor/editor.ts'
import { liveEdit } from '#editor/live.ts'
import type { Plugins } from '#engine/browser.ts'
import { encodePng } from '#plugins/loader/loader.sim.ts'
import { Terrain } from './terrain3d.components.tsx'
import { compile, keys, land, type Analysis, type Band, type Detail, type Edge, type Field, type Land, type Layer, type Node, type Program, type Stroke } from './terrain3d.sim.ts'

export type Verb = Stroke['verb'] | 'pick'
export type Settings = {
  verb: Verb
  radius: number
  hardness: number
  strength: number
  level: number
  surface: string
  // The layer strokes go into: its place in the field file's `layers`.
  armed: number | undefined
}
// The brush's settings on the field file at a path, of the open game, which the panel reads and
// sets; `get` hands the same object until they are set. `at` is the ground point it last pointed
// at, [x, z], where the panel adds a layer; the subscribers hear when it first has one.
export type Brush = {
  get(path: string): Settings
  set(path: string, patch: Partial<Settings>): void
  subscribe(f: () => void): () => void
  at: number[] | undefined
  use(): void
  // The verbs, in the order the panel offers them.
  verbs: Verb[]
}

// What a stroke does to the ground, and the brush's verbs: those, and `pick`, which strokes nothing.
const STROKES = ['raise', 'lower', 'flatten', 'smooth', 'bench', 'surface'] as const satisfies readonly Stroke['verb'][]
const VERBS: Verb[] = [...STROKES, 'pick']
// The ranges the panel sets the brush's numbers in, and a stroke's are kept in.
export const RANGES = { radius: [1, 64], hardness: [0, 1], strength: [0, 32] } as const
const START: Settings = { verb: 'raise', radius: 8, hardness: 0.5, strength: 2, level: 0, surface: '', armed: undefined }

// Settings kept in the browser, taken field by field where each is what it should be, a number within
// the range the panel sets it in: they come from outside the program, and a browser that keeps
// nothing, or refuses to, starts from `START`.
function kept(key: string): Settings {
  let got: Record<string, unknown> = {}
  try {
    const text = localStorage.getItem(key)
    const v: unknown = text === null ? undefined : JSON.parse(text)
    if (v && typeof v === 'object') got = v as Record<string, unknown>
  } catch {
    // Nothing kept.
  }
  const number = (k: keyof Settings, lo = -Infinity, hi = Infinity) =>
    typeof got[k] === 'number' && Number.isFinite(got[k]) && got[k] >= lo && got[k] <= hi ? { [k]: got[k] } : {}
  return {
    ...START,
    ...(VERBS.includes(got.verb as Verb) && { verb: got.verb as Verb }),
    ...number('radius', ...RANGES.radius), ...number('hardness', ...RANGES.hardness), ...number('strength', ...RANGES.strength), ...number('level'),
    ...(typeof got.surface === 'string' && { surface: got.surface }),
    ...(Number.isInteger(got.armed) && (got.armed as number) >= 0 && { armed: got.armed as number }),
  }
}

// How far along its path a stroke takes its next point, in radii.
const SPACING = 0.25
// The segments of the ring, and of each side of a layer's square, drawn on the ground.
const RING = 64
const SIDE = 32
// How wide a line the brush draws on the ground is, over its distance from the eye: about three
// pixels of a 720-pixel view with a 62° fov.
const WIDTH = 0.004

// A number to a thousandth, never −0, which a file cannot hold: a stroke drawn and the same stroke
// read back from its file are the same stroke.
const thousandth = (v: number) => Math.round(v * 1000) / 1000 + 0

// Whether (x, z) is on a layer's square.
const onLayer = (l: Field['layers'][number], x: number, z: number) =>
  Math.abs(x - l.at[0]) <= l.size / 2 && Math.abs(z - l.at[1]) <= l.size / 2

// A colour of the design system, for what the brush draws over the game.
const colour = (name: string) => new THREE.Color().setStyle(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'white')

// Each layer of a field's text, as JSON.
const layersIn = (text: string) => ((JSON.parse(text) as Field).layers ?? []).map(l => JSON.stringify(l))

// ---------------------------------------------------------------- the field file

// The field file of the scene `scene`'s `world.terrain3d`, by its path from the repo, as the panel
// finds it: the entry of the scene's loader catalogue its `field` names, both read off the `world` the
// scene booted with; or why there is none.
export function fieldIn(ed: Editor, scene: string): { path: string } | { why: string } {
  const world = ed.need().scene(scene).world
  const field = world.terrain3d?.field as string | undefined
  if (field === undefined) return { why: `the world.terrain3d of ${scene} names no field` }
  const asset = world.loader?.assets?.[field] as { type: string; url: string } | undefined
  if (!asset || asset.type !== 'json') return { why: `terrain3d names ${field}, which is no json entry of the loader` }
  return { path: asset.url.replace(/^\//, '') }
}

// The field file of `scene` and what it holds, as the editor last read or wrote it; a scene with no
// `world.terrain3d` is refused, naming those with one (`worldOf`).
async function fieldOf(ed: Editor, scene: string) {
  ed.worldOf(scene, 'terrain3d')
  const got = fieldIn(ed, scene)
  if ('why' in got) throw new Error(got.why)
  return { path: got.path, field: JSON.parse(await ed.text(got.path)) as Field }
}

// A number of a node: a slider when its range is narrow enough to drag across, else a number that
// is kept in its range.
type Spec = {
  key: string
  ref?: boolean
  choices?: string[]
  pair?: string[]
  min?: number
  max?: number
  slide?: boolean
  int?: boolean
  // What it is when the node leaves it out, and whether this node has it at all.
  absent?: unknown
  when?(n: Node): boolean
}
const band = (key: string, min: number, max: number, more: Partial<Spec> = {}): Spec => ({ key, min, max, slide: true, ...more })
const SPECS: Record<string, Spec[]> = {
  const: [{ key: 'value' }],
  noise: [
    { key: 'kind', choices: ['value', 'simplex', 'worley'] },
    { key: 'freq', min: 0.01, max: 1024 },
    { key: 'seed', min: 0, max: 999999, int: true },
    band('rotate', -3.15, 3.15, { absent: 0 }),
    { key: 'stretch', pair: ['x', 'z'], absent: [1, 1] },
    { key: 'metric', choices: ['f1', 'f2', 'f2-f1'], absent: 'f1', when: n => n.kind === 'worley' },
  ],
  warp: [{ key: 'input', ref: true }, { key: 'x', ref: true }, { key: 'z', ref: true }, { key: 'amount', min: 0, max: 20000 }],
  fold: [
    { key: 'input', ref: true },
    { key: 'kind', choices: ['ridge', 'billow', 'abs', 'terrace'] },
    band('steps', 1, 64, { int: true, absent: 8, when: n => n.kind === 'terrace' }),
  ],
  remap: [
    { key: 'input', ref: true },
    band('inLo', -8, 8), band('inHi', -8, 8), band('outLo', -8, 8), band('outHi', -8, 8),
    { key: 'ease', choices: ['linear', 'smooth', 'smoother'], absent: 'linear' },
  ],
  combine: [
    { key: 'a', ref: true }, { key: 'b', ref: true },
    { key: 'mode', choices: ['add', 'sub', 'mul', 'min', 'max', 'lerp'] },
    band('t', 0, 1, { absent: 0.5, when: n => n.mode === 'lerp' }),
  ],
  scale: [{ key: 'input', ref: true }, { key: 'by' }],
  craters: [
    { key: 'freq', min: 0.01, max: 1024 },
    { key: 'seed', min: 0, max: 999999, int: true },
    { key: 'radius', pair: ['min', 'max'] },
    band('depth', 0, 8), band('rim', 0, 8), band('rimWidth', 0.01, 2), band('ejecta', 0, 8),
  ],
  clearing: [{ key: 'input', ref: true }, { key: 'flat', min: 0, max: 20000 }, band('floor', 0, 1)],
}
export const OPS = Object.keys(SPECS)
// What a node made with an op starts with, besides its inputs, which read the node before it.
const MADE: Record<string, Record<string, unknown>> = {
  const: { value: 0 },
  noise: { kind: 'value', freq: 4, seed: 1 },
  warp: { amount: 10 },
  fold: { kind: 'ridge' },
  remap: { inLo: 0, inHi: 1, outLo: 0, outHi: 1, ease: 'linear' },
  combine: { mode: 'add' },
  scale: { by: 1 },
  craters: { freq: 8, seed: 1, radius: [5, 20], depth: 0.1, rim: 0.05, rimWidth: 0.3, ejecta: 2 },
  clearing: { flat: 40, floor: 0.1 },
}
// The values of a node's op, none for a name that is no op (`toString` say, which every object has);
// and those it has as it is set, a value some other value of it turns on (`when`) only while it does.
const specsOfOp = (op: string): Spec[] => (Object.hasOwn(SPECS, op) ? SPECS[op] : [])
export const specsOf = (n: Node) => specsOfOp(n.op).filter(s => !s.when || s.when(n))
const refs = (n: Node) => specsOfOp(n.op).filter(s => s.ref).map(s => s.key)
// Node `n` without the values its other values turn off (`metric` of a noise that is no worley), which
// its form does not show and the land never reads, where `kept` says a value is the file's own: a
// file written by hand may hold one, which an edit takes out in its change. One the caller hands in
// is not the file's, and `misfit` refuses it.
const shown = (n: Node, kept: (k: string) => boolean = () => true): Node => {
  const off = specsOfOp(n.op).filter(s => s.when && !s.when(n) && kept(s.key)).map(s => s.key)
  return Object.fromEntries(Object.entries(n).filter(([k]) => !off.includes(k))) as Node
}

// Node `i` of `nodes` made again as `op`, keeping its id and whatever inputs it has.
function remade(nodes: Node[], i: number, op: string): Node {
  const n = nodes[i]
  const before = nodes[i - 1]?.id
  const inputs = Object.fromEntries(refs({ id: n.id, op }).map(k => [k, n[k] ?? before]))
  return { id: n.id, op, ...inputs, ...MADE[op] }
}

// The program with node `i` called `id`, and every later node that read it, and `out`, reading it.
function renamed(program: Program, i: number, id: string): Program {
  const was = program.nodes[i].id
  const nodes = program.nodes.map((n, j) => {
    if (j === i) return { ...n, id }
    if (j < i) return n
    const m = { ...n }
    for (const k of refs(n)) if (m[k] === was) m[k] = id
    return m
  })
  return { ...program, nodes, out: program.out === was ? id : program.out }
}

// Why the land could not be made from a field, or undefined when it could.
function refusal(f: Field): string | undefined {
  try {
    land(f)
  } catch (e) {
    return (e as Error).message
  }
  if (!(f.program.world > 0)) return `terrain3d program world ${f.program.world} is not above 0`
  const a = f.analysis
  for (const k of ['slopeStep', 'curveStep', 'positionRadius', 'occlusionRadius', 'cliffProbe', 'cliffSlope', 'cliffDrop'] as const)
    if (!(a[k] > 0)) return `terrain3d analysis ${k} ${a[k]} is not above 0`
  if (!(Number.isInteger(a.occlusionSteps) && a.occlusionSteps > 0)) return `terrain3d analysis occlusionSteps ${a.occlusionSteps} is not a whole number above 0`
  if (!(a.flatAngle >= 0)) return `terrain3d analysis flatAngle ${a.flatAngle} is below 0`
  for (const [k, l] of (f.layers ?? []).entries()) {
    if (!(l.size > 0)) return `terrain3d layer ${k} size ${l.size} is not above 0`
    if (!(Number.isInteger(l.px) && l.px >= 1 && l.px <= 1024)) return `terrain3d layer ${k} px ${l.px} is not a whole number from 1 to 1024`
    for (const s of l.strokes)
      if (s.verb === 'surface' && !(s.surface in (f.surfaces ?? {}))) return `terrain3d layer ${k} has a stroke that paints ${s.surface}, which is none of the surfaces`
  }
  return undefined
}

// Writes `edits` to the field file at `path`, which holds `field`, as one change `e` makes, and
// answers the field they leave; or refuses them, writing nothing (`Refusal`), when the land could not
// be made from that field. They are written as the editor's `written` writes a change: one edit by
// itself, as the panel writes a value; more, or one that puts a key at its place in an object, as one
// group.
export async function writeField(e: Pick<Edits, 'editFile' | 'editFiles'>, path: string, field: Field, edits: FileEdit[]): Promise<Field> {
  const next = edited(field, edits)
  const why = refusal(next)
  if (why) throw new Refusal(path, why)
  await written(e, edits.map(x => ({ file: path, ...x })))
  return next
}

// ---------------------------------------------------------------- the sections' edits

// Layer `k` of the field at `path`, refused, naming those it has, when there is none.
function layerOf(path: string, field: Field, k: number): Layer {
  const layers = field.layers ?? []
  if (!layers[k]) throw new Error(`${path} has no layer ${k}: ${layers.length ? `its layers are 0 to ${layers.length - 1}` : 'it has none'}`)
  return layers[k]
}

// What a layer added starts as, but where it is put.
export const NEW_LAYER = { at: [0, 0], size: 128, px: 128 }

// A layer's square: its middle [x, z], metres across and pixels across.
export type Square = Partial<Pick<Layer, 'at' | 'size' | 'px'>>

// The edits of the Layers section: with no `index`, a layer added at the end, its square `layer`'s
// values over `NEW_LAYER`'s; else layer `index`'s values set, or with `layer` null the layer taken out.
export function layerEdits(path: string, field: Field, index: number | undefined, layer: Square | null): FileEdit[] {
  const layers = field.layers ?? []
  if (index === undefined) {
    if (layer === null) throw new Error('the layer taken out is named by its index')
    return listEdits(['layers'], layers, [...layers, { ...NEW_LAYER, ...layer, strokes: [] }])
  }
  layerOf(path, field, index)
  if (layer === null) return listEdits(['layers'], layers, layers.filter((_, j) => j !== index))
  return Object.entries(layer).filter(([, v]) => v !== undefined).map(([k, value]) => ({ at: ['layers', index, k], value }))
}

// The nodes of program `p` as the node list's Copy hands them over: as each node's form shows it,
// without a value its others turn off that a hand wrote into the file (`shown`), so a list copied
// from one field is taken by a Paste into any other, whose own nodes hold no such value.
export const copyOf = (p: Program): Node[] => p.nodes.map(n => shown(n))

// The edits that set values of program `p`, each one `patch` gives, and its `out`. A list of nodes,
// pasted or edited in the node list, is written as `listEdits` writes it, each of its values held to
// its op's (`misfit`), but a value its others turn off that the file's node of that id holds as it
// is, which a hand wrote there and the list only carries: that goes in the same change (`shown`).
// Given with no `out`, `out` is the node it names while the list has it, else the list's last.
export function reprogrammed(p: Program, patch: Partial<Program>): FileEdit[] {
  const nodes = patch.nodes?.map(n => {
    const was = p.nodes.find(m => m.id === n.id && m.op === n.op)
    return shown(n, k => !!was && k in was && JSON.stringify(was[k]) === JSON.stringify(n[k]))
  })
  for (const n of nodes ?? []) {
    if (!Object.hasOwn(SPECS, n.op)) throw new Error(`node ${n.id}'s op ${n.op} is none of ${OPS.join(', ')}`)
    for (const k of Object.keys(n)) if (k !== 'id' && k !== 'op') {
      const why = misfit(n, k)
      if (why) throw new Error(why)
    }
  }
  const out = patch.out ?? (nodes && !nodes.some(n => n.id === p.out) ? nodes[nodes.length - 1]?.id : p.out)
  return [
    ...Object.entries(patch).filter(([k, v]) => k !== 'out' && k !== 'nodes' && v !== undefined).map(([k, value]) => ({ at: ['program', k], value })),
    ...(nodes ? listEdits(['program', 'nodes'], p.nodes, nodes) : []),
    ...(out !== p.out ? [{ at: ['program', 'out'], value: out }] : []),
  ]
}

// Why node `n`'s value `k` is none of its op's as the node is set (`when`), or out of its range, or
// undefined when it fits: one it has not got names those it has.
function misfit(n: Node, k: string): string | undefined {
  const specs = specsOf(n)
  const s = specs.find(s => s.key === k)
  if (!s) return `node ${n.id}, a ${n.op}, has no ${k}: it has ${specs.map(s => s.key).join(', ')}`
  return unfit(n.id, s, n[k])
}

// Why value `v` is no value of a node's `spec`, or undefined when it is.
function unfit(id: string, s: Spec, v: unknown): string | undefined {
  const at = `node ${id} ${s.key}`
  if (s.ref || s.choices) {
    if (typeof v !== 'string') return `${at} is a node's id, not ${JSON.stringify(v)}`
    if (s.choices && !s.choices.includes(v)) return `${at} is one of ${s.choices.join(', ')}, not ${v}`
    return undefined
  }
  if (s.pair) return Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number') ? undefined : `${at} is [${s.pair.join(', ')}], two numbers, not ${JSON.stringify(v)}`
  if (typeof v !== 'number') return `${at} is a number, not ${JSON.stringify(v)}`
  if (s.int && !Number.isInteger(v)) return `${at} is a whole number, not ${v}`
  if (s.min !== undefined && (v < s.min || v > s.max!)) return `${at} is from ${s.min} to ${s.max}, not ${v}`
  return undefined
}

// A node's change, as its form in the panel makes it: made again as another op, its values set, and
// renamed, in that order.
export type Renode = { op?: string; values?: Record<string, unknown>; rename?: string }

// The edits of node `id` of program `p` in the field at `path`: made again as `op`, the whole node
// written, with that op's starting numbers and its inputs (`remade`); each of `values` set, each
// one its op has and in its range; each value a value set turns off taken out (`shown`: `metric`
// of a noise no longer a worley, say), so the file holds only what the node's form shows and
// `misfit` takes; then renamed, with every later node that reads it and `out` (`renamed`). A node
// the program has not got, or a value its op has not got, is refused, naming those there are, and
// a value out of its range naming the range.
export function nodeEdits(path: string, p: Program, id: string, { op, values, rename }: Renode): FileEdit[] {
  const i = p.nodes.findIndex(n => n.id === id)
  if (i < 0) throw new Error(`${path}'s program has no node ${id}: its nodes are ${p.nodes.map(n => n.id).join(', ')}`)
  const set: Node = { ...(op === undefined ? p.nodes[i] : remade(p.nodes, i, op)), ...values }
  for (const k of Object.keys(values ?? {})) {
    const why = misfit(set, k)
    if (why) throw new Error(why)
  }
  // Every value `values` sets has passed `misfit`: a value turned off is the file's.
  const n = shown(set)
  const off = Object.keys(set).filter(k => !(k in n))
  const at = ['program', 'nodes', i]
  const edits: FileEdit[] = op === undefined
    ? [...Object.entries(values ?? {}).map(([k, value]) => ({ at: [...at, k], value })), ...off.map(k => ({ at: [...at, k], value: undefined }))]
    : [{ at, value: n }]
  if (rename === undefined || rename === id) return edits
  const now = { ...p, nodes: p.nodes.map((m, j) => (j === i ? n : m)) }
  return [...edits, ...changes(now, renamed(now, i, rename), ['program'])]
}

// A colour of the file, #rrggbb.
const HEX = /^#[0-9a-f]{6}$/i

// The edits of the Bands section: the bands, a list edited as a whole (`listEdits`), and each of the
// grain's values `grain` gives.
export function bandEdits(field: Field, { bands, grain }: { bands?: Band[]; grain?: Partial<Field['grain']> }): FileEdit[] {
  return [
    ...(bands ? listEdits(['bands'], field.bands, bands) : []),
    ...Object.entries(grain ?? {}).filter(([, v]) => v !== undefined).map(([k, value]) => ({ at: ['grain', k], value })),
  ]
}

type SurfaceValues = Field['surfaces'][string]
// A surface's values to set; an edge of null takes its edge out.
type SurfacePatch = Partial<Omit<SurfaceValues, 'edge'>> & { edge?: Edge | null }
// What a surface added starts as, but for what it is given.
const NEW_SURFACE: SurfaceValues = { colour: '#808080', cover: 1 }

// The edits of surface `name` of the field at `path`, as the Surfaces section makes them: `surface`
// null takes it out; values set it, or add it, from `NEW_SURFACE`, where the field has none, with no
// values too, an edge of null taking its edge out; `rename`
// calls it that, with the values given, rewriting every stroke that paints it, and is refused when
// the field has a surface of that name already. A surface the field has not got is neither taken out
// nor renamed, and one is not both; a surface a stroke paints is not taken out: `writeField` refuses
// the field it would leave.
export function surfaceEdits(field: Field, path: string, name: string, { surface, rename }: { surface?: SurfacePatch | null; rename?: string }): FileEdit[] {
  const surfaces = field.surfaces ?? {}
  const names = Object.keys(surfaces)
  if ((surface === null || rename !== undefined) && !names.includes(name))
    throw new Error(`${path} has no surface ${name}: ${names.length ? `its surfaces are ${names.join(', ')}` : 'it has none'}`)
  if (surface === null && rename !== undefined) throw new Error(`surface ${name} is taken out or renamed, not both`)
  if (surface === null) return [{ at: ['surfaces', name], value: undefined }]
  const given = Object.entries(surface ?? {}).filter(([, v]) => v !== undefined)
  // A surface's values with those given over them, an edge of null taken out.
  const over = (was: SurfaceValues) => Object.fromEntries(Object.entries({ ...was, ...Object.fromEntries(given) }).filter(([, v]) => v !== null)) as SurfaceValues
  if (rename === undefined || rename === name) {
    return name in surfaces
      ? given.map(([k, value]) => ({ at: ['surfaces', name, k], value: value === null ? undefined : value }))
      : [{ at: ['surfaces', name], value: over(NEW_SURFACE) }]
  }
  if (rename in surfaces) throw new Refusal(path, `terrain3d has a surface ${rename} already`)
  const strokes = (field.layers ?? []).flatMap((l, k) => l.strokes.flatMap((s, j) => (s.verb === 'surface' && s.surface === name ? [{ at: ['layers', k, 'strokes', j, 'surface'], value: rename }] : [])))
  return [{ at: ['surfaces', rename], value: over(surfaces[name]) }, ...strokes, { at: ['surfaces', name], value: undefined }]
}

// The numbers the land record reads the ground with, by name.
const ANALYSIS = ['slopeStep', 'curveStep', 'positionRadius', 'occlusionRadius', 'occlusionSteps', 'cliffProbe', 'cliffSlope', 'cliffDrop', 'flatAngle', 'records'] as const satisfies readonly (keyof Analysis)[]

// The edits of the Analysis section: each number `analysis` gives set.
export const analysisEdits = (analysis: Partial<Analysis>): FileEdit[] =>
  Object.entries(analysis).filter(([, v]) => v !== undefined).map(([k, value]) => ({ at: ['analysis', k], value }))

// The shapes of the look's values, which the browser half builds its shader from (`terrain3d.plugin.ts`
// and `terrain3d.sim.ts`), so a value of another shape is refused before it reaches the file; what
// they name, a key, a band, a surface, is checked when the land is made from the file (`writeField`).
const pair = z.tuple([z.number(), z.number()])
export const EDGE = z.object({
  width: z.number().gt(0).max(1).describe('how wide the line is drawn, as a share of the weight about a half'),
  ragged: z.number().min(0).describe('how far noise moves the line'),
  scale: z.number().gt(0).describe('the noise\'s cycles a metre'),
}).strict().describe('draws the weight as a crisp line where it crosses a half')
const RULE = z.object({
  q: z.string().describe('a key of the land record, band:<i> or surface:<name>'),
  lo: z.number().describe('where it starts'),
  hi: z.number().describe('where it is whole'),
}).strict().describe('a ramp')
const NOISE = z.object({
  freqs: z.array(z.number()).min(1).describe('each octave\'s cycles a metre'),
  weights: z.array(z.number()).min(1).describe('each octave\'s weight'),
  offset: pair.optional().describe('[x, z] metres the noise is moved'),
  angle: z.number().optional().describe('radians it is turned'),
  stretch: pair.optional().describe('[x, z] it is multiplied by: strokes along the smaller'),
}).strict().refine(n => n.freqs.length === n.weights.length, { message: 'one weight a freq' })
const EACH = {
  amount: z.number().min(0).max(1).optional().describe('how much of it is drawn, 1 when absent'),
  fade: pair.optional().describe('[near, far] metres from the camera it fades out over'),
  edge: EDGE.optional(),
  where: z.array(RULE).optional().describe('ramps whose product weighs it'),
}
const DETAIL_LAYER = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tint'), noise: NOISE, base: z.number(), range: z.number(), ...EACH }).strict(),
  z.object({ kind: z.literal('patch'), noise: NOISE, from: z.number(), to: z.number(), colour: z.string().regex(HEX), ...EACH }).strict(),
  z.object({ kind: z.literal('bump'), noise: NOISE, step: z.number().gt(0), strength: z.number(), ...EACH }).strict(),
  z.object({ kind: z.literal('rough'), noise: NOISE, range: pair, jitter: z.object({ freq: z.number(), amount: z.number() }).strict(), ...EACH }).strict(),
  z.object({
    kind: z.literal('texture'), map: z.string().min(1), normal: z.string().min(1).optional(), rough: z.string().min(1).optional(),
    scale: z.number().gt(0), project: z.enum(['top', 'tri']), sharp: z.number().gt(0), vary: z.number().min(0), colour: z.string().regex(HEX),
    strength: z.number(), blend: z.enum(['over', 'multiply']), ...EACH,
  }).strict(),
]).describe('a detail layer')
export const DETAIL = z.array(DETAIL_LAYER)

// What a detail layer of each kind starts as, keeping the common values of the one it was.
export const STARTS: Record<Detail['kind'], Detail> = {
  tint: { kind: 'tint', noise: { freqs: [0.1, 0.9], weights: [0.6, 0.4] }, base: 1, range: 0.3 },
  patch: { kind: 'patch', noise: { freqs: [0.05, 0.4], weights: [0.7, 0.3] }, from: 0.6, to: 0.7, colour: '#6a6a32' },
  bump: { kind: 'bump', noise: { freqs: [0.13, 0.9], weights: [0.6, 0.4] }, step: 0.8, strength: 0.5 },
  rough: { kind: 'rough', noise: { freqs: [0.13, 0.9], weights: [0.6, 0.4] }, range: [0.8, 1], jitter: { freq: 2.7, amount: 0.1 } },
  texture: { kind: 'texture', map: '', scale: 4, project: 'top', sharp: 4, vary: 0.5, colour: '#ffffff', strength: 1, blend: 'over' },
}

// The edits of the Detail section: the list of layers, edited as a whole (`listEdits`); refused,
// naming what is wrong and where, unless every layer is of its kind's shape (`DETAIL`).
export function detailEdits(field: Field, detail: unknown): FileEdit[] {
  const got = DETAIL.safeParse(detail)
  if (!got.success) throw new Error(`the ground detail refuses it: ${z.prettifyError(got.error)}`)
  return listEdits(['detail'], field.detail ?? [], got.data as Detail[])
}

// ---------------------------------------------------------------- the preview

// How many samples the preview takes across, and how long the page may spend on them before it draws
// a frame.
export const PREVIEW = 128
export const BUDGET = 8

// What the preview may show: the height, any node's value, or any key of the land record.
export const readings = (f: Field) => ['height', ...f.program.nodes.map(n => `node:${n.id}`), ...keys.map(k => `key:${k}`)]

// What the preview shows at a point: the height, a node's value, or a key of the land record; and,
// for `terrain.height`, `layer:<k>`, the raw ground as layer k leaves it, which the brush's pick reads.
export function sampler(f: Field, what: string): (x: number, z: number) => number {
  const [kind, name] = what.split(':')
  if (kind === 'node') {
    const c = compile(f.program)
    return (x, z) => c.at(name, x, z)
  }
  const l = land(f)
  if (kind === 'key') return (x, z) => l.record(x, z)[name as (typeof keys)[number]]
  if (kind === 'layer') return (x, z) => l.through(Number(name), x, z)
  return l.height
}
// Row `j` of the preview's samples of `f` over the program's `world` square about the origin, into
// `values`: `PREVIEW` across, the rows from −z.
export function sampleRow(f: (x: number, z: number) => number, world: number, values: Float64Array, j: number) {
  const step = world / PREVIEW
  for (let i = 0; i < PREVIEW; i++) values[j * PREVIEW + i] = f(-world / 2 + (i + 0.5) * step, -world / 2 + (j + 0.5) * step)
}
// The lowest and the highest of the samples.
export function span(values: Float64Array) {
  let lo = Infinity, hi = -Infinity
  for (const v of values) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  return { lo, hi }
}
// The samples as RGBA pixels, each drawn from its lowest to its highest, black to white.
export function greys(values: Float64Array, lo: number, hi: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(values.length * 4)
  const range = hi - lo || 1
  values.forEach((v, p) => {
    const g = Math.round(((v - lo) / range) * 255)
    out.set([g, g, g, 255], p * 4)
  })
  return out
}
// Layer `l`'s square over a preview `side` across of the program's `world` square: [x, y, w, h].
export const squareOf = (l: Layer, world: number, side: number) => {
  const k = side / world
  return [(l.at[0] - l.size / 2 + world / 2) * k, (l.at[1] - l.size / 2 + world / 2) * k, l.size * k, l.size * k]
}

// ---------------------------------------------------------------- strokes

// A stroke of a brush begun at the ground point (x, z), to a thousandth of a metre.
const begun = (b: Omit<Stroke, 'path'>, x: number, z: number): Stroke => ({
  verb: b.verb, radius: b.radius, hardness: b.hardness, strength: b.strength, level: b.level, surface: b.surface,
  path: [[thousandth(x), thousandth(z)]],
})
// A stroke's path taken on to the ground point `at`, [x, z], of its layer `l`, as a drag of the brush
// takes it, and whether a point was added: the point to a thousandth; off the layer's square, or
// where the view's ray meets no ground (undefined), the path breaks, and a run starts again where it
// comes back; a point closer to the last than `SPACING` radii is dropped.
function dragged(s: Stroke, l: Layer, at: number[] | undefined): boolean {
  const q = at && [thousandth(at[0]), thousandth(at[1])]
  const path = s.path, last = path[path.length - 1]
  if (!q || !onLayer(l, q[0], q[1])) {
    if (last.length) path.push([])
    return false
  }
  if (last.length && Math.hypot(q[0] - last[0], q[1] - last[1]) < s.radius * SPACING) return false
  path.push(q)
  return true
}
// Why a stroke of `b` into layer k of `field` starts nothing, or undefined when it starts: a
// `surface` stroke whose surface is none of the field's, or a layer that still holds a stroke not
// saved yet, `unsaved`, which the stroke would replace.
function unstarted(field: Field, k: number, b: { verb: Verb; surface: string }, unsaved: Stroke | undefined): string | undefined {
  const names = Object.keys(field.surfaces ?? {})
  if (b.verb === 'surface' && !names.includes(b.surface)) return `the brush paints no surface of the field: ${names.length ? `its surfaces are ${names.join(', ')}` : 'it has none'}`
  if (unsaved) return `terrain3d layer ${k} holds a stroke that is not saved yet`
  return undefined
}
// ---------------------------------------------------------------- the commands' inputs

const sceneArg = z.string().describe('a scene with world.terrain3d')
// A ground point, or a layer's middle, [x, z] in metres.
const xz = (what: string) => z.array(z.number()).length(2).describe(what)
const hex = z.string().regex(HEX)
// A layer as the commands answer it: its square, and how many strokes it holds.
const layersOf = (f: Field) => (f.layers ?? []).map(l => ({ at: l.at, size: l.size, px: l.px, strokes: l.strokes.length }))

export function terrain3d(ed: Editor) {
  // Each field's settings, by the key the browser keeps them under: the game and the field file.
  const held = new Map<string, Settings>()
  const keyOf = (path: string) => `terrain3d.brush ${ed.session?.game.name ?? ''} ${path}`
  const listeners = new Set<() => void>()
  const brush: Brush = {
    get(path) {
      const key = keyOf(path)
      let s = held.get(key)
      if (!s) held.set(key, (s = kept(key)))
      return s
    },
    set(path, patch) {
      const key = keyOf(path)
      const s = { ...brush.get(path), ...patch }
      held.set(key, s)
      try {
        localStorage.setItem(key, JSON.stringify({ ...s, armed: s.armed ?? null }))
      } catch {
        // Kept for this page only.
      }
      for (const f of listeners) f()
    },
    subscribe(f) {
      listeners.add(f)
      return () => { listeners.delete(f) }
    },
    at: undefined,
    use: () => ed.activate('terrain3d.brush'),
    verbs: VERBS,
  }
  function TerrainPanel() {
    return <Terrain brush={brush} />
  }
  ed.panel({ id: 'terrain3d', title: 'Terrain', area: 'right', component: TerrainPanel })

  // What the brush strokes under a pointer: the game view's client's terrain3d, its land, and the
  // field file its scene's `world.terrain3d` names; undefined until the client has a land.
  const target = (p: Pointer) => {
    const plugins: Plugins | undefined = ed.session?.client?.plugins
    const t = plugins?.terrain3d
    const land: Land | undefined = t?.land
    const field: string | undefined = plugins?.wire.scene.world?.terrain3d?.field
    const url: string | undefined = field === undefined ? undefined : plugins!.wire.scene.world!.loader?.assets?.[field]?.url
    if (!land || !url || !t.ground || ed.session?.viewing !== p.scene) return undefined
    return { land, ground: t.ground as { height(x: number, z: number): number; ray(o: number[], d: number[]): number[] | undefined }, path: url.replace(/^\//, '') }
  }
  // The land the game view's client draws now.
  const drawn = (): Land | undefined => ed.session?.client?.plugins.terrain3d?.land
  // Says in the console why a press starts nothing.
  const refuse = (path: string, why: string) => ed.error(`${path}: refused: ${why}`)
  // The ground point under the pointer.
  const under = (p: Pointer, t: NonNullable<ReturnType<typeof target>>) => {
    const r = p.stage.ray(p.x, p.y)
    return r && t.ground.ray(r.origin, r.dir)
  }
  // The armed layer of the field the brush strokes, when one is.
  const armed = (t: NonNullable<ReturnType<typeof target>>) => {
    const k = brush.get(t.path).armed
    return k !== undefined && t.land.field.layers[k] ? k : undefined
  }

  // ---------------------------------------------------------------- what it draws

  const drawing = new THREE.Group()
  const clear = () => {
    for (const o of drawing.children as THREE.Mesh[]) {
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    drawing.clear()
  }
  // A closed line through `points` on the ground, drawn as a band across it `WIDTH` of its distance
  // from `eye` wide, so it reads as a line a few pixels wide however far off it is: at each point
  // one vertex either side, square to the line there.
  const loop = (points: number[][], eye: number[], c: THREE.Color) => {
    const n = points.length
    const pos = new Float32Array(6 * n)
    points.forEach((q, i) => {
      const a = points[(i + n - 1) % n], b = points[(i + 1) % n]
      const tx = b[0] - a[0], tz = b[2] - a[2], len = Math.hypot(tx, tz) || 1
      const w = (Math.hypot(q[0] - eye[0], q[1] - eye[1], q[2] - eye[2]) * WIDTH) / 2
      const nx = (-tz / len) * w, nz = (tx / len) * w
      pos.set([q[0] - nx, q[1], q[2] - nz, q[0] + nx, q[1], q[2] + nz], 6 * i)
    })
    const index: number[] = []
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      index.push(2 * i, 2 * i + 1, 2 * j, 2 * j, 2 * i + 1, 2 * j + 1)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setIndex(index)
    drawing.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: c, depthTest: false, side: THREE.DoubleSide })))
  }
  // The ring round the ground point `q`, and each layer's square.
  const draw = (p: Pointer | undefined) => {
    clear()
    const overlay = p?.stage.overlay as THREE.Scene | undefined
    const t = p && target(p)
    const eye = p?.stage.ray(p.x, p.y)?.origin
    if (!p || !overlay || !t || !eye) {
      drawing.removeFromParent()
      return
    }
    if (drawing.parent !== overlay) overlay.add(drawing)
    const h = t.ground.height
    const accent = colour('--accent'), dim = colour('--dim')
    const k = armed(t)
    t.land.field.layers.forEach((l, i) => {
      const e = l.size / 2, [cx, cz] = l.at
      const corners = [[cx - e, cz - e], [cx + e, cz - e], [cx + e, cz + e], [cx - e, cz + e]]
      const points = corners.flatMap((a, c) => {
        const b = corners[(c + 1) % 4]
        return Array.from({ length: SIDE }, (_, s) => {
          const x = a[0] + ((b[0] - a[0]) * s) / SIDE, z = a[1] + ((b[1] - a[1]) * s) / SIDE
          return [x, h(x, z), z]
        })
      })
      loop(points, eye, i === k ? accent : dim)
    })
    const q = under(p, t)
    if (!q) return
    const had = brush.at
    brush.at = [thousandth(q[0]), thousandth(q[2])]
    if (!had) for (const f of listeners) f()
    const ring = (r: number, c: THREE.Color) => loop(Array.from({ length: RING }, (_, s) => {
      const a = (2 * Math.PI * s) / RING, x = q[0] + r * Math.cos(a), z = q[2] + r * Math.sin(a)
      return [x, h(x, z), z]
    }), eye, c)
    const { radius, hardness } = brush.get(t.path)
    ring(radius, accent)
    if (hardness > 0 && hardness < 1) ring(radius * hardness, dim)
  }

  // ---------------------------------------------------------------- strokes

  // The stroke being dragged: the land it is baked into, its layer and the field file.
  let drag: { land: Land; k: number; path: string; stroke: Stroke } | undefined
  // The last stroke saved, once the file holds it, while the land drawn may still hold it unsaved.
  let saved: { k: number; path: string; stroke: Stroke } | undefined

  // Takes a stroke out of the land drawn, when that land still holds it unsaved.
  const unpaint = (k: number, stroke: Stroke) => {
    const l = drawn()
    if (l?.unsaved(k) === stroke) l.discard(k)
  }

  // Bakes the drag's path so far into the client's land, the one there is now.
  const bake = (p: Pointer) => {
    const d = drag!
    const land = target(p)?.land
    if (land && land !== d.land && land.field.layers[d.k]) d.land = land
    d.land.stroke(d.k, structuredClone(d.stroke))
  }

  // Puts `stroke` at the end of layer k's strokes in the field file at `path`, as an edit of `e`, on
  // the editor's one chain of saves (`liveEdit`), reading the file as it is when it is written, and
  // answers its place there. The brush and `terrain.stroke` save through this, so no two saves read
  // one count of strokes, nor a panel's write another's.
  const save = (e: Pick<Edits, 'editFiles'>, path: string, k: number, stroke: Stroke) =>
    liveEdit<Field, number>(ed, e, path, field => {
      const layer = layerOf(path, field, k)
      const n = layer.strokes.length
      return { file: { ...field, layers: field.layers.map((l, j) => (j === k ? { ...layer, strokes: [...layer.strokes, stroke] } : l)) }, answer: n }
    })

  // The field of every scene of the open game, read as the game opens, or now when it is open, so a
  // write of it is handed to the listener below with what it held before, whether or not the panel has
  // looked at it.
  let readFor: typeof ed.session
  const readFields = () => {
    if (!ed.session || ed.session === readFor) return
    readFor = ed.session
    for (const scene of ed.scenesWith()) {
      const got = fieldIn(ed, scene)
      if ('path' in got) void ed.text(got.path).catch(e => ed.error(`${got.path} could not be read: ${(e as Error).message}`))
    }
  }
  readFields()
  ed.onDrop(ed.subscribe(readFields, ['game']))
  ed.onFile((path, text, before) => {
    // A layer taken out or put in: the armed layer moves with its layer, and goes with it, read off
    // the settings the panel holds or else the browser keeps, so whether or not it has looked yet.
    const k = (held.get(keyOf(path)) ?? kept(keyOf(path))).armed
    if (k !== undefined) {
      const was = layersIn(before), now = layersIn(text)
      const same = (a: string[], b: string[]) => a.length === b.length && a.every((l, j) => l === b[j])
      const without = (list: string[], i: number) => list.filter((_, j) => j !== i)
      if (now.length === was.length - 1) {
        const i = was.findIndex((_, i) => same(without(was, i), now))
        if (i >= 0 && i <= k) brush.set(path, { armed: i === k ? undefined : k - 1 })
      } else if (now.length === was.length + 1) {
        const i = now.findIndex((_, i) => same(without(now, i), was))
        if (i >= 0 && i <= k) brush.set(path, { armed: k + 1 })
      }
    }
    // A write of the file the last stroke was saved to that does not hold it, an undo say, while the
    // land drawn still holds it unsaved: that land has not been made again from the file, so the
    // stroke goes.
    const s = saved
    if (!s || path !== s.path) return
    if (drawn()?.unsaved(s.k) !== s.stroke) {
      saved = undefined
      return
    }
    const strokes: Stroke[] = (JSON.parse(text) as Field).layers?.[s.k]?.strokes ?? []
    if (strokes.some(t => JSON.stringify(t) === JSON.stringify(s.stroke))) return
    unpaint(s.k, s.stroke)
    saved = undefined
  })

  ed.tool({
    id: 'terrain3d.brush',
    title: 'Brush',
    key: 'T',
    cursor: 'crosshair',
    hover: draw,
    down(p) {
      draw(p)
      drag = undefined
      const t = target(p)
      const q = t && under(p, t)
      const k = t && armed(t)
      if (!t || !q || k === undefined) return
      const layer = t.land.field.layers[k]
      if (!onLayer(layer, q[0], q[2])) return
      const settings = brush.get(t.path)
      if (settings.verb === 'pick') {
        brush.set(t.path, { level: thousandth(t.land.through(k, q[0], q[2])), verb: 'flatten' })
        return
      }
      const { verb, radius, hardness, strength, level, surface } = settings
      const why = unstarted(t.land.field, k, settings, t.land.unsaved(k))
      if (why) return refuse(t.path, why)
      drag = { land: t.land, k, path: t.path, stroke: begun({ verb, radius, hardness, strength, level, surface }, q[0], q[2]) }
      bake(p)
    },
    move(p) {
      draw(p)
      const d = drag
      const t = target(p)
      if (!d || !t) return
      const q = under(p, t)
      if (dragged(d.stroke, d.land.field.layers[d.k], q && [q[0], q[2]])) bake(p)
    },
    up() {
      const d = drag
      drag = undefined
      const stroke = d?.land.unsaved(d.k)
      // A save the editor refused it has said why of, and the ground goes back to the file's.
      if (d && stroke) save(ed, d.path, d.k, stroke).then(() => { saved = { k: d.k, path: d.path, stroke } }, () => unpaint(d.k, stroke))
    },
    off() {
      drag = undefined
      clear()
      drawing.removeFromParent()
    },
  })

  // ---------------------------------------------------------------- commands

  ed.command({
    id: 'terrain.stroke',
    title: 'Terrain: stroke',
    input: z.object({
      scene: sceneArg,
      layer: z.number().int().min(0).describe('the layer\'s index'),
      verb: z.enum(STROKES).describe('what it does'),
      radius: z.number().min(RANGES.radius[0]).max(RANGES.radius[1]).describe('metres'),
      hardness: z.number().min(RANGES.hardness[0]).max(RANGES.hardness[1]).describe('the radius\'s part painted whole'),
      strength: z.number().min(RANGES.strength[0]).max(RANGES.strength[1]).describe('metres raise and lower move'),
      level: z.number().optional().describe('the height flatten makes, or 0'),
      surface: z.string().optional().describe('what a surface stroke paints'),
      path: z.array(xz('[x, z]')).min(1).describe('points dragged through; off the layer breaks it'),
    }).describe('A terrain brush stroke through ground points, put last in the layer\'s strokes as a drag puts it: one undo. Answers the file, stroke and index.'),
    run: async ({ scene, layer: k, path: points, level = 0, surface = '', ...numbers }, e) => {
      const b = { ...numbers, level, surface }
      const { path, field } = await fieldOf(ed, scene)
      const l = layerOf(path, field, k)
      const [[x, z], ...rest] = points
      if (!onLayer(l, x, z)) throw new Error(`the path starts at [${x}, ${z}], off layer ${k}, ${l.size} m across about [${l.at.join(', ')}]`)
      // The field's own stroke, which no ground drawn holds unsaved: it is baked into no land, and
      // is saved after any stroke of the brush's already let go.
      const why = unstarted(field, k, b, undefined)
      if (why) throw new Refusal(path, why)
      const stroke = begun(b, x, z)
      for (const q of rest) dragged(stroke, l, q)
      // Saved as the brush saves it, as its path was when a point was last added: a break it ends in
      // is none of it.
      if (!stroke.path[stroke.path.length - 1].length) stroke.path.pop()
      return { file: path, layer: k, index: await save(e, path, k, stroke), stroke }
    },
  })

  // What the preview shows, `of`, of the field at `path`, refused, naming what it may show, when it is
  // none of that; `layers` lets it be the ground as a layer leaves it too.
  const reading = (path: string, field: Field, of: string, layers: boolean) => {
    const choices = [...readings(field), ...(layers ? (field.layers ?? []).map((_, k) => `layer:${k}`) : [])]
    if (!choices.includes(of)) throw new Error(`${path} shows no ${of}: it shows ${choices.join(', ')}`)
    return sampler(field, of)
  }
  // The preview's samples of `of` over the program's world square, and their lowest and highest: as
  // the panel takes them, a few rows at a time, the page free to draw and take input between them
  // (the editor's `turn`).
  const sampled = async (scene: string, of: string) => {
    const { path, field } = await fieldOf(ed, scene)
    const f = reading(path, field, of, false)
    const values = new Float64Array(PREVIEW * PREVIEW)
    let start = performance.now()
    for (let j = 0; j < PREVIEW; j++) {
      if (performance.now() - start >= BUDGET) {
        await turn()
        start = performance.now()
      }
      sampleRow(f, field.program.world, values, j)
    }
    return { field, values, ...span(values) }
  }
  const of = z.string().default('height').describe('height, node:<id> for a node\'s value, or key:<key> for a key of the land record')

  ed.command({
    id: 'terrain.height',
    title: 'Terrain: height',
    input: z.object({
      scene: sceneArg,
      points: z.array(xz('[x, z]')).min(1).describe('the ground points read'),
      of: of.describe('height, node:<id> for a node\'s value, key:<key> for a key of the land record, or layer:<k> for the raw ground as layer k leaves it, which the brush\'s pick reads'),
    }).describe('The ground of a scene\'s field file at points, worked out as the land every rule reads works it out, or another value the preview shows there. Answers what it read and a value for each point, in order.'),
    run: async ({ scene, points, of }) => {
      const { path, field } = await fieldOf(ed, scene)
      const f = reading(path, field, of, true)
      return { of, values: points.map(([x, z]) => f(x, z)) }
    },
  })
  ed.command({
    id: 'terrain.range',
    title: 'Terrain: range',
    input: z.object({ scene: sceneArg, of }).describe(`The lowest and the highest of what the Terrain panel's preview shows, over its ${PREVIEW} × ${PREVIEW} samples of the program's world square about the origin, as its note says.`),
    run: async ({ scene, of }) => {
      const { field, lo, hi } = await sampled(scene, of)
      return { of, lo, hi, across: PREVIEW, world: field.program.world }
    },
  })
  ed.command({
    id: 'terrain.preview',
    title: 'Terrain: preview',
    input: z.object({
      scene: sceneArg,
      of,
      zoom: z.number().int().min(1).max(8).default(4).describe('pixels each sample is drawn across'),
    }).describe(`The Terrain panel's preview as a PNG: ${PREVIEW} × ${PREVIEW} samples of the program's world square about the origin, −z up, each drawn from the lowest to the highest, black to white, with the layers' squares over it in the accent colour.`),
    run: async ({ scene, of, zoom }) => {
      const { field, values, lo, hi } = await sampled(scene, of)
      const grey = greys(values, lo, hi)
      const side = PREVIEW * zoom
      const data = new Uint8ClampedArray(side * side * 4)
      for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
        const from = (Math.floor(y / zoom) * PREVIEW + Math.floor(x / zoom)) * 4
        data.set(grey.subarray(from, from + 4), (y * side + x) * 4)
      }
      const accent = colour('--accent').getHex()
      const dot = (x: number, y: number) => {
        if (x >= 0 && y >= 0 && x < side && y < side) data.set([accent >> 16, (accent >> 8) & 255, accent & 255, 255], (y * side + x) * 4)
      }
      for (const l of field.layers ?? []) {
        const [x, y, w, h] = squareOf(l, field.program.world, side).map(Math.round)
        for (let i = x; i <= x + w; i++) { dot(i, y); dot(i, y + h) }
        for (let j = y; j <= y + h; j++) { dot(x, j); dot(x + w, j) }
      }
      return new Blob([encodePng({ width: side, height: side, data, text: {} }) as BlobPart], { type: 'image/png' })
    },
  })

  ed.command({
    id: 'terrain.layer',
    title: 'Terrain: layer',
    input: z.object({
      scene: sceneArg,
      index: z.number().int().min(0).optional().describe('the layer, by its place in the field\'s layers; a new layer at the end when left out'),
      layer: z.object({
        at: xz('its middle [x, z]').optional(),
        size: z.number().optional().describe('metres across, above 0'),
        px: z.number().int().optional().describe('pixels across, 1 to 1024'),
      }).nullable().describe(`the values to set, a new layer's starting from at [${NEW_LAYER.at.join(', ')}], size ${NEW_LAYER.size} and px ${NEW_LAYER.px}; null takes the layer out`),
    }).describe(`Adds a painted layer to a scene's field, sets its square, or takes it out, as the Terrain panel's Layers section does: one undo, refused as the panel refuses what the land could not be made from. Answers the layers, each with how many strokes it holds. ${OUTLINE}`),
    run: async ({ scene, index, layer }, e) => {
      const { path, field } = await fieldOf(ed, scene)
      return { file: path, layers: outlined(layersOf(await writeField(e, path, field, layerEdits(path, field, index, layer)))) }
    },
  })

  const node = z.object({
    id: z.string().describe('its name'),
    op: z.string().describe(OPS.join(', ')),
  }).catchall(z.unknown()).describe('a node and its op\'s values')
  ed.command({
    id: 'terrain.program',
    title: 'Terrain: program',
    input: z.object({
      scene: sceneArg,
      program: z.object({
        world: z.number().optional().describe('metres across'),
        hscale: z.number().optional().describe('metres a value of 1 is'),
        sea: z.number().min(0).max(1).optional().describe('the waterline\'s value'),
        flood: z.boolean().optional().describe('whether the sea floods below it'),
        out: z.string().optional().describe('the node whose value is the ground'),
        nodes: z.array(node).optional().describe('the nodes in order, each reading only earlier ones; out kept while listed, else the last'),
      }).describe('the values set; none reads the program'),
    }).describe('Sets the height program\'s values, and pastes nodes over its own, as the Program section does: one undo. Answers the program.'),
    run: async ({ scene, program }, e) => {
      const { path, field } = await fieldOf(ed, scene)
      return { file: path, program: (await writeField(e, path, field, reprogrammed(field.program, program))).program }
    },
  })
  ed.command({
    id: 'terrain.node',
    title: 'Terrain: node',
    input: z.object({
      scene: sceneArg,
      node: z.string().describe('the node, by its id'),
      op: z.enum(OPS as [string, ...string[]]).optional().describe('the op it is made again as, with that op\'s starting numbers, keeping its inputs'),
      values: z.record(z.string(), z.unknown()).optional().describe('its op\'s numbers and inputs to set, by name, each in its range'),
      rename: z.string().min(1).optional().describe('its new id; every later node that reads it, and out, read it by it'),
    }).describe('Changes one node of a scene\'s height program, as its form in the Terrain panel does: made again as another op, its values set, then renamed, as one undo, refused when the program could not be compiled from it. Answers the node and out.'),
    run: async ({ scene, node: id, ...how }, e) => {
      const { path, field } = await fieldOf(ed, scene)
      const i = field.program.nodes.findIndex(n => n.id === id)
      const done = await writeField(e, path, field, nodeEdits(path, field.program, id, how))
      return { file: path, node: done.program.nodes[i], out: done.program.out }
    },
  })

  ed.command({
    id: 'terrain.bands',
    title: 'Terrain: bands',
    input: z.object({
      scene: sceneArg,
      bands: z.array(z.object({
        colour: hex.describe('#rrggbb'),
        amount: z.number().min(0).max(1).describe('how much it mixes in'),
        rules: z.array(z.object({
          q: z.string().describe('a key of the land record'),
          lo: z.number().describe('where it starts'),
          hi: z.number().describe('where it is whole'),
        }).describe('a ramp')).describe('ramps whose product weighs it'),
        edge: EDGE.optional(),
      }).describe('a band')).optional().describe('in order, the first the base coat'),
      grain: z.object({
        base: z.number().optional().describe('a colour\'s least multiplier'),
        range: z.number().optional().describe('what a hash adds to it'),
      }).optional().describe('the grain\'s values set'),
    }).describe('Sets the ground colour bands, a whole list, and the grain, as the Bands section does: one undo. Answers both.'),
    run: async ({ scene, bands, grain }, e) => {
      const { path, field } = await fieldOf(ed, scene)
      const done = await writeField(e, path, field, bandEdits(field, { bands, grain }))
      return { file: path, bands: done.bands, grain: done.grain }
    },
  })
  ed.command({
    id: 'terrain.surface',
    title: 'Terrain: surface',
    input: z.object({
      scene: sceneArg,
      name: z.string().min(1).describe('the surface, by its name; a new one is added'),
      surface: z.object({
        colour: hex.optional().describe('#rrggbb, drawn over the bands by the paint\'s weight'),
        cover: z.number().min(0).max(4).optional().describe('what scatter\'s density is multiplied by'),
        edge: EDGE.nullable().optional().describe('draws its paint as a crisp line; null takes it out'),
      }).nullable().optional().describe(`the values to set, a new surface's starting from ${NEW_SURFACE.colour} and cover ${NEW_SURFACE.cover}; null takes it out, unless a stroke paints it`),
      rename: z.string().min(1).optional().describe('its new name; every stroke that paints it is rewritten'),
    }).describe('Adds a surface a surface stroke paints to a scene\'s field, sets its values, renames it, or takes it out, as the Terrain panel\'s Surfaces section does: one undo. Answers the surfaces.'),
    run: async ({ scene, name, surface, rename }, e) => {
      const { path, field } = await fieldOf(ed, scene)
      const done = await writeField(e, path, field, surfaceEdits(field, path, name, { surface, rename }))
      return { file: path, surfaces: done.surfaces ?? {} }
    },
  })
  ed.command({
    id: 'terrain.analysis',
    title: 'Terrain: analysis',
    input: z.object({
      scene: sceneArg,
      analysis: z.partialRecord(z.enum(ANALYSIS), z.number()).describe('the numbers to set, by name, in metres (flatAngle in radians; occlusionSteps and records whole numbers)'),
    }).describe('Sets the numbers the land record reads the ground with, as the Terrain panel\'s Analysis section does: one undo, refused as the panel refuses one that is not above 0. Answers them.'),
    run: async ({ scene, analysis }, e) => {
      const { path, field } = await fieldOf(ed, scene)
      return { file: path, analysis: (await writeField(e, path, field, analysisEdits(analysis))).analysis }
    },
  })
  ed.command({
    id: 'terrain.detail',
    title: 'Terrain: detail',
    input: z.object({
      scene: sceneArg,
      detail: DETAIL.describe('the layers, in the order they are drawn: tint, patch, bump, rough and texture, each with its own numbers'),
    }).describe('Sets the ground detail the browser half draws over the colours, a whole list of layers, as the Terrain panel\'s Detail section does: one undo, refused unless each layer is of its kind\'s shape and reads only keys, bands and surfaces the field has. Answers the detail.'),
    run: async ({ scene, detail }, e) => {
      const { path, field } = await fieldOf(ed, scene)
      return { file: path, detail: (await writeField(e, path, field, detailEdits(field, detail))).detail }
    },
  })
}
