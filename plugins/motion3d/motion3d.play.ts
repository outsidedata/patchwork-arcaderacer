// motion3d's playing: the clips of a body motion3d moves, one at a time, as fields on its row, and the
// body posed by them. motion3d's server half (`motion3d.sim.ts`) plays a clip by `play` and runs it a
// step by `animate`; its browser half (`motion3d.plugin.ts`) draws every body from the same fields; a
// rule and motion3d itself read where each bone stands by `posed`, `ends` and `plantsOf`.
//
// A body's numbers are its kind's entry of `world.motion3d.kinds` (the row's `as` when it names one,
// else its kind): beside `motion` and `baked` (`motion3d.sim.ts`),
//   rig     a loader `json` entry: the rig file, `bodies`, `clips` and `roles`
//   measured  a loader `json` entry: what the rig's bake measured, `table`, `ends`, `grips` and `touches`
//           (`<name>.rig.baked.json`), laid over the rig file
//   model   a loader `model` entry: the body the browser half draws
//   glb     a loader `binary` entry of the model's same file: the body the server poses
//   fade    seconds a change of clip fades over
//   reads   the names of the row's fields it reads: `pos`, `yaw`, `vel`, `grounded`, `limp`
//   props   `[{ model, bone, at, turn }]`, loader models hung on bones (the browser half's)
// The motion3d file's `moves` and `turns` say which one-shots carry travel: one that ends more than `moves` metres
// from its start, or turns `turns` degrees or more; under `turns`, its yaw column is zeroed.
//
// The rig file:
//   clips   name to a file string, or `{ file, loop, markers, scale, rate, mirror, rebase }`: `loop` laps
//           the clip; `markers` name to seconds, "peak" or "NN%"; `scale` multiplies the distance a
//           one-shot carries; `rate` its playhead; `mirror: "<clip>"` the named clip mirrored across the
//           body's x, its table row with `left` and `yaw` negated. A mirror of a mirror throws. `file`
//           and `rebase` are the bake's.
//   roles   `still`: the name of the motion a space lays over a body standing still (Layers).
//   aim     `{ across, up, down }`, radians: how far the body's upper half turns to aim (the browser
//           half's aim) to either side of its legs, and up and down; the rule that writes the row's `aim`
//           keeps it within them.
// What the bake measured:
//   table    per clip: `dur`, `forward`, `left`, `yaw`, `rise`, `height`, `low`, `peak`, and `travel`, rows
//            `[t, fwd, left, yawDeg]` every tenth of a second and at `dur`.
//   ends     per body, per clip: `fps` and each segment's two ends on every frame, in the body's frame.
//   touches  per body, per clip: what the clip touches, its `plants` among it.
//   poses    pose name to `{ clip, frame, at }`: a frame of a clip of the rig, named by the clip's
//            `.poses.json` beside its FBX, and its time, `at` seconds (`plugins/anim/anim.export.py`).
//
// A row that plays carries `state` (`act` while its clip plays, `done` once a one-shot has played out),
// `clip`, `clipT` (seconds into it), `rate`, `blend`, `from` and `fromT`; and the upper half's own two
// slots, as anim's upper channel: `upper` the clip played over the body from the bone `upperBone` and
// every bone under it, `upperT` its playhead and `upperW` its share, and `was`, `wasT`, `wasW`, `wasBone`
// the one it fades out from.
//   over(me, clip, bone)  the clip played over the body from `bone` up: the one playing there handed to
//                     `was` to fade out, the new one fading in from 0
//   under(me)         the upper half let go: the clip playing there fades out
//   overStep(me, w, dt, next)  one step of the upper half: its playhead on by dt·(the clip's `rate`); a
//                     loop laps and comes up to its whole share over `fade`; a one-shot comes up over
//                     `fade` and is `ended` at its end: with no `next`, faded out over the `fade` before
//                     its end and let go there; with `next`, a clip to follow it, held whole at its end
//                     for `over` to fade out into that one; `was` fades out over `fade`
//   play(me, clip, { rate })   the clip from 0 at the row's `rate` (1 when left out); the clip it
//                     played at full weight is kept as `from`, frozen at its playhead, and the new one
//                     fades in, `blend` 0; a row's first clip starts at full weight
//   pose(me, w, name)  the pose `name` of the rig's `poses` played as `play` plays a clip: its clip, the
//                     playhead at its `at` and the row's `rate` 0, so it is held there, `act`, until
//                     another clip is played or it is let go; it fades in from the clip before as any
//                     clip does, a pose of the same clip too
//   stop(me)          the clip let go: `done`, and fading out from where it stands, as `from` frozen at
//                     its playhead with `blend` 0, into whatever plays next
//   animate(me, w, dt)  one step: the playhead on by dt·(the clip's `rate`)·(the row's `rate`); the
//                     markers it crosses, a loop's lap included, in order; a one-shot that carries travel
//                     its step's travel, `{ move: [x, z], yaw }` in world metres and radians, turned back
//                     by the curve's yaw at the step's first playhead (when it keeps its turn) and by the
//                     row's `yaw`; a one-shot `done` on the step it reaches its end; `blend` up by
//                     dt/`fade`. A `limp` row is not played.
//   clipOf(rig, name), at(measure, t), carries(clip, { moves, turns }), rigOf(from, kind),
//   readsOf(from, kind), numbersOf(from, kind), playKind(me), ends(from, me, segment, at?),
//   touchOf(from, me, clip), plantsOf(from, me, clip), posed(from, me), skeletonOf(from, kind)
//                     what the rest read, each as its comment says.
import type { Row, W } from '#engine/engine.ts'
import type { Wire } from '#engine/browser.ts'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { binary, json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

// The decoder's WebAssembly is made once, as the module is loaded, so a pose read on any step decodes
// at once.
await MeshoptDecoder.ready

export type Entry = string | { file?: string; loop?: boolean; markers?: Record<string, number | string>; scale?: number; rate?: number; mirror?: string; rebase?: { from: string; onto: string } }
export type Measure = {
  frames?: number; dur: number; forward: number; left: number; yaw: number; rise?: number; height?: number; low?: number; peak?: number
  travel: number[][]
}
export type Reads = { pos: string; yaw: string; vel: string; grounded: string; limp: string }
export type Prop = { model: string; bone: string; at: number[]; turn: number[] }
export type Plant = { point: string; from: number; to: number; at: number[]; on: string }
export type Touch = { case: string; loop: boolean; dur: number; plants: Plant[]; [field: string]: unknown }
export type Limb = 'handL' | 'handR' | 'footL' | 'footR'
export type Rig = {
  bodies?: Record<string, string>
  clips: Record<string, Entry>
  roles: { still?: string }
  aim?: { across: number; up: number; down: number }
  table: Record<string, Measure>
  ends?: Record<string, Record<string, { fps: number } & Record<string, number[][]>>>
  touches?: Record<string, Record<string, Touch>>
  poses?: Record<string, Pose>
  [field: string]: unknown
}
// A pose: a frame of a clip of the rig, and its time in seconds.
export type Pose = { clip: string; frame: number; at: number }
export type Body = { rig: string; measured?: string; model: string; glb?: string; fade: number; reads: Reads; props?: Prop[] }
export type Clip = {
  name: string
  source: string // the clip whose tracks it draws: its own name, or the clip it mirrors
  mirrored: boolean
  loop: boolean
  scale: number
  rate: number
  markers: { name: string; t: number }[]
  dur: number
  measure: Measure
}
export type Marker = { name: string; clip: string }
export type Travel = { move: number[]; yaw: number }
export type Moves = { moves: number; turns: number }

const DEG = Math.PI / 180
// An angle in (−180, 180] degrees, or (−π, π] radians with `half` π.
const wrap = (a: number, half = 180) => a - 2 * half * Math.ceil((a - half) / (2 * half))

// ---------------------------------------------------------------- the rig file

const memo = new WeakMap<object, { table: object; clips: Map<string, Clip> }>()
const cacheOf = (rig: Rig) => {
  let c = memo.get(rig.clips)
  if (!c || c.table !== rig.table) {
    c = { table: rig.table, clips: new Map() }
    memo.set(rig.clips, c)
  }
  return c
}

const entryOf = (rig: Rig, name: string) => {
  const e = rig.clips[name]
  if (e === undefined) throw new Error(`motion3d: the rig has no clip ${name}`)
  return typeof e === 'string' ? { file: e } : e
}

// A marker's time in the clip: seconds, "peak", or "NN%".
function timeOf(clip: string, marker: string, at: number | string, m: Measure): number {
  if (typeof at === 'number') return at
  if (at === 'peak') {
    if (m.peak === undefined) throw new Error(`motion3d: ${clip}'s marker ${marker} is at its peak, and its table row gives none`)
    return m.peak
  }
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(at)
  if (!pct) throw new Error(`motion3d: ${clip}'s marker ${marker} is at ${at}, which is no seconds, "peak" or "NN%"`)
  return (Number(pct[1]) / 100) * m.dur
}

export function clipOf(rig: Rig, name: string): Clip {
  const cache = cacheOf(rig)
  const had = cache.clips.get(name)
  if (had) return had
  const own = entryOf(rig, name)
  let e = own, measure: Measure
  if (own.mirror !== undefined) {
    const src = entryOf(rig, own.mirror)
    if (src.mirror !== undefined) throw new Error(`motion3d: ${name} mirrors ${own.mirror}, itself a mirror`)
    e = { ...src, ...own }
    const m = rig.table[own.mirror]
    if (!m) throw new Error(`motion3d: the rig's table has no row for ${own.mirror}`)
    measure = { ...m, left: -m.left, yaw: -m.yaw, travel: m.travel.map(([t, f, l, y]) => [t, f, -l, -y]) }
  } else {
    const m = rig.table[name]
    if (!m) throw new Error(`motion3d: the rig's table has no row for ${name}`)
    measure = m
  }
  if (!(measure.dur > 0)) throw new Error(`motion3d: ${name} lasts ${measure.dur} s`)
  const clip: Clip = {
    name,
    source: own.mirror ?? name,
    mirrored: own.mirror !== undefined,
    loop: e.loop ?? false,
    scale: e.scale ?? 1,
    rate: e.rate ?? 1,
    markers: Object.entries(e.markers ?? {}).map(([n, at]) => ({ name: n, t: timeOf(name, n, at, measure) })).sort((a, b) => a.t - b.t),
    dur: measure.dur,
    measure,
  }
  cache.clips.set(name, clip)
  return clip
}

// Where the travel curve stands at t: [fwd, left, yawDeg], linear between rows, the yaw the short way.
export function at(m: Measure, t: number): number[] {
  const rows = m.travel
  if (t <= rows[0][0]) return rows[0].slice(1)
  for (let i = 1; i < rows.length; i++) {
    const b = rows[i]
    if (t > b[0]) continue
    const a = rows[i - 1]
    const u = (t - a[0]) / (b[0] - a[0])
    return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, a[3] + wrap(b[3] - a[3]) * u]
  }
  return rows[rows.length - 1].slice(1)
}

// A one-shot's travel: whether it carries any, and whether it keeps its turn.
export function carries(c: Clip, a: Moves): { carries: boolean; turns: boolean } {
  if (c.loop) return { carries: false, turns: false }
  const turns = Math.abs(wrap(c.measure.yaw)) >= a.turns
  return { carries: turns || math.hypot(c.measure.forward, c.measure.left) > a.moves, turns }
}

// The kind whose entry a row is played by: the kind its `as` names, or its own.
export const playKind = (me: Row): string => (typeof me.data.as === 'string' ? me.data.as : me.kind)

const worldOf = (from: W | Wire) => ('find' in from ? from.world : from.scene.world!)
export function numbersOf(from: W | Wire, kind: string): Body {
  const k = worldOf(from).motion3d?.kinds?.[kind]
  if (!k) throw new Error(`motion3d has no kind ${kind}: world.motion3d.kinds names none`)
  return k
}
// The motion3d file's `moves` and `turns`.
export function movesOf(from: W | Wire, kind: string): Moves {
  const f = json(from, worldOf(from).motion3d.kinds[kind].motion)
  return { moves: f.moves, turns: f.turns }
}

const READS = ['pos', 'yaw', 'vel', 'grounded', 'limp'] as const
export function readsOf(from: W | Wire, kind: string): Reads {
  const r = numbersOf(from, kind).reads
  const missing = READS.find(f => typeof r?.[f] !== 'string')
  if (missing) throw new Error(`motion3d kinds.${kind}.reads names no ${missing}`)
  return r
}

// A rig file with what its bake measured laid over it, made once for each pair of the two loaded files.
const laid = new WeakMap<object, WeakMap<object, Rig>>()
export function rigOf(from: W | Wire, kind: string): Rig {
  const k = numbersOf(from, kind)
  const rig: Rig = json(from, k.rig)
  if (k.measured === undefined) return rig
  const measured = json(from, k.measured)
  let byMeasured = laid.get(rig)
  if (!byMeasured) laid.set(rig, (byMeasured = new WeakMap()))
  const had = byMeasured.get(measured)
  if (had) return had
  const both: Rig = { ...rig, ...measured }
  byMeasured.set(measured, both)
  return both
}

// Every field a row plays by, as a row that has played nothing holds it.
const FRESH = {
  state: 'done', clip: null, clipT: 0, rate: 1, blend: 1, from: null, fromT: 0,
  upper: null, upperT: 0, upperW: 0, upperBone: null, was: null, wasT: 0, wasW: 0, wasBone: null,
}
export function fill(d: any) {
  for (const [k, v] of Object.entries(FRESH)) d[k] ??= v
}

// The clip playing over the upper half handed to `was`, to fade out.
export function under(me: Row) {
  const d = me.data
  fill(d)
  if (d.upper == null) return
  d.was = d.upper
  d.wasT = d.upperT
  d.wasW = d.upperW
  d.wasBone = d.upperBone
  d.upper = null
  d.upperT = 0
  d.upperW = 0
  d.upperBone = null
}

export function over(me: Row, clip: string, bone: string) {
  const d = me.data
  under(me)
  d.upper = clip
  d.upperT = 0
  d.upperW = 0
  d.upperBone = bone
}

export function overStep(me: Row, w: W, dt: number, next = false): { markers: Marker[]; ended: boolean } {
  const d = me.data
  fill(d)
  const kind = playKind(me)
  const { fade } = numbersOf(w, kind)
  const per = (s: number) => (fade > 0 ? s / fade : Infinity)
  const crossed: [number, Marker][] = []
  let ended = false
  if (d.upper != null) {
    const u = clipOf(rigOf(w, kind), d.upper)
    const went = advance(u, d.upperT, dt * u.rate, crossed)
    d.upperT = went.t
    ended = went.ended
    if (went.ended && !next) {
      d.upper = null
      d.upperT = 0
      d.upperW = 0
      d.upperBone = null
    } else if (!went.ended) d.upperW = u.loop || next ? Math.min(1, d.upperW + per(dt)) : Math.min(1, d.upperW + per(dt), per(u.dur - went.t))
  }
  if (d.was != null) {
    d.wasW -= per(dt)
    if (!(d.wasW > 0)) {
      d.was = null
      d.wasT = 0
      d.wasW = 0
      d.wasBone = null
    }
  }
  return { markers: crossed.sort((a, b) => a[0] - b[0]).map(([, m]) => m), ended }
}

export function play(me: Row, clip: string, { rate }: { rate?: number } = {}) {
  const d = me.data
  fill(d)
  if (d.clip == null) d.blend = 1
  else {
    if (d.blend >= 1) {
      d.from = d.clip
      d.fromT = d.clipT
    }
    d.blend = 0
  }
  d.clip = clip
  d.state = 'act'
  d.clipT = 0
  d.rate = rate ?? 1
}

export function pose(me: Row, w: W, name: string) {
  const kind = playKind(me)
  const p = rigOf(w, kind).poses?.[name]
  if (!p) throw new Error(`motion3d: ${kind}'s rig has no pose ${name}`)
  play(me, p.clip, { rate: 0 })
  me.data.clipT = p.at
}

export function stop(me: Row) {
  const d = me.data
  fill(d)
  if (d.clip != null) {
    if (d.blend >= 1) {
      d.from = d.clip
      d.fromT = d.clipT
    }
    d.blend = 0
  }
  d.state = 'done'
}

// ---------------------------------------------------------------- what the bake measured

// A segment's two ends in the body's frame (x its left, y up, z ahead), at `at`, a clip and its
// playhead, the row's own `clip` and `clipT` unless given: [ax, ay, az, bx, by, bz], off the rig's `ends`
// for the kind's `model`, straight between the two frames the playhead falls between. A mirrored clip is
// its source's other side's segment reflected across x. It throws naming a clip with no ends.
export function ends(w: W | Wire, me: Row, segment: string, at: { clip: string; clipT: number } = me.data as any): number[] {
  const kind = playKind(me)
  const body = numbersOf(w, kind).model
  const rig = rigOf(w, kind)
  const measured = rig.ends?.[body]
  if (!measured) throw new Error(`motion3d: ${kind}'s rig has no ends for ${body}; bake it`)
  const c = clipOf(rig, at.clip)
  const clip = measured[c.source]
  if (!clip) throw new Error(`motion3d: ${kind}'s rig has no ends of ${c.source} for ${body}; bake it`)
  const rows = clip[c.mirrored ? otherSide(segment) : segment] as number[][]
  if (!rows) throw new Error(`motion3d: ${kind}'s rig measures no segment ${segment}`)
  const f = Math.min(rows.length - 1, Math.max(0, at.clipT * clip.fps))
  const i = Math.floor(f), s = f - i
  const a = rows[i], b = rows[Math.min(rows.length - 1, i + 1)]
  const got = s === 0 ? a : a.map((v, k) => v + (b[k] - v) * s)
  return c.mirrored ? got.map((v, k) => (k % 3 === 0 ? -v : v)) : got
}

const otherSide = (segment: string) => segment.replace(/[LR]$/, s => (s === 'L' ? 'R' : 'L'))

// What `clip` touches on the kind's body: the reading of a clip of its own; a mirrored clip's is its
// source's, read from the other side by `plantsOf`.
export function touchOf(from: W | Wire, me: Row, clip: string): Touch {
  const kind = playKind(me)
  const body = numbersOf(from, kind).model
  const rig = rigOf(from, kind)
  const read = rig.touches?.[body]
  if (!read) throw new Error(`motion3d: ${kind}'s rig has no touches for ${body}; bake it`)
  const got = read[clipOf(rig, clip).source]
  if (!got) throw new Error(`motion3d: ${kind}'s rig has no touches of ${clip} for ${body}; bake it`)
  return got
}

// The patches of skin each limb is planted by: a hand by its middle, its top or its underside, a foot by
// its sole, its ball or its heel.
const LIMBS: Record<Limb, RegExp> = { handL: /^(hand|grip|palm)L$/, handR: /^(hand|grip|palm)R$/, footL: /^(sole|ball|heel)L$/, footR: /^(sole|ball|heel)R$/ }
const swapped = (limb: Limb): Limb => (limb.endsWith('L') ? limb.replace(/L$/, 'R') : limb.replace(/R$/, 'L')) as Limb

// When each limb is planted in `clip`: the runs of seconds any patch of skin it is planted by is held on
// something (every plant but those on nothing, `still`), runs that touch or overlap made one, in order. A
// loop's run may go past its end. A mirrored clip's are its source's, the left's the right's.
export function plantsOf(from: W | Wire, me: Row, clip: string): Record<Limb, number[][]> {
  const t = touchOf(from, me, clip)
  const mirrored = clipOf(rigOf(from, playKind(me)), clip).mirrored
  const out = { handL: [], handR: [], footL: [], footR: [] } as Record<Limb, number[][]>
  for (const limb of Object.keys(LIMBS) as Limb[]) {
    const runs = t.plants.filter(p => p.on !== 'still' && LIMBS[limb].test(p.point)).map(p => [p.from, p.to]).sort((a, b) => a[0] - b[0])
    const joined: number[][] = []
    for (const r of runs) {
      const last = joined[joined.length - 1]
      if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
      else joined.push([...r])
    }
    out[mirrored ? swapped(limb) : limb] = joined
  }
  return out
}

// ---------------------------------------------------------------- the pose
//
// A kind's model as the browser half draws it is the glb its `glb` names, a loader `binary` entry of the
// same file as its `model` entry. Its skeleton and clips are read off those bytes once per copy of them
// (`skeletonOf`), as three's glTF loader reads them: each buffer view gltfpack compressed decoded by
// three's meshopt decoder, each normalized accessor scaled as three scales it, every joint of its skin
// under its bare name, the hips the joint with no joint above it, `root` the place of the hips' parent in
// the model, each joint's rest, and each clip's rotation and translation tracks moved to start at 0.
//
// `posed(from, me)` is every joint, each its matrix in the body's frame, as the browser half poses the
// model from the row's fields this step: the clip and the one it fades from at their weights, each track
// sampled as three's interpolants sample it, each joint's turn the running average three's mixer keeps,
// short of a whole weight eased back toward its rest; the upper half's parts on the joints from their bone
// up; and the hips pinned as `pin` pins them, by the body's two parts. A row is posed once a step whatever asks. It throws for a kind with no `glb`, and for a clip the glb has none of.

const swapSide = (name: string) => name.replace(/Left|Right/g, s => (s === 'Left' ? 'Right' : 'Left'))
const bareBone = (name: string) => name.replace(/^mixamorig\d*:?/, '')

type Track = { times: Float32Array; values: Float32Array }
export type Skeleton = {
  root: Matrix4
  hips: string
  bones: Record<string, { parent: string | null; t: number[]; r: number[]; s: number[] }>
  clips: Map<string, { r: Map<string, Track>; p: Map<string, Track>; dur: number }>
}

const NORMAL: Record<number, number> = { 5120: 1 / 127, 5121: 1 / 255, 5122: 1 / 32767, 5123: 1 / 65535 }
const ARRAYS: Record<number, any> = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
const WIDTHS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

const skeletons = new WeakMap<Uint8Array, Skeleton>()
export function skeletonOf(from: W | Wire, kind: string): Skeleton {
  const k = numbersOf(from, kind)
  if (!k.glb) throw new Error(`motion3d kinds.${kind} names no glb, the binary entry of its model the server poses it by`)
  const bytes = binary(from, k.glb)
  let sk = skeletons.get(bytes)
  if (!sk) skeletons.set(bytes, sk = readSkeleton(bytes, kind))
  return sk
}

function readSkeleton(bytes: Uint8Array, kind: string): Skeleton {
  const at = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const jsonLength = at.getUint32(12, true)
  const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)))
  const binLength = at.getUint32(20 + jsonLength, true)
  const bin = bytes.subarray(28 + jsonLength, 28 + jsonLength + binLength)
  const views = new Map<number, { data: Uint8Array; stride: number | undefined }>()
  const view = (i: number) => {
    let v = views.get(i)
    if (v) return v
    const bv = gltf.bufferViews[i]
    const ext = bv.extensions?.EXT_meshopt_compression
    if (ext) {
      const data = new Uint8Array(ext.count * ext.byteStride)
      const source = bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength)
      MeshoptDecoder.decodeGltfBuffer(data, ext.count, ext.byteStride, source, ext.mode, ext.filter ?? 'NONE')
      v = { data, stride: ext.byteStride }
    } else v = { data: bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength), stride: bv.byteStride }
    views.set(i, v)
    return v
  }
  const accessor = (i: number): Float32Array => {
    const a = gltf.accessors[i]
    const { data, stride } = view(a.bufferView)
    const Type = ARRAYS[a.componentType]
    const width = WIDTHS[a.type]
    const size = Type.BYTES_PER_ELEMENT
    const step = stride ?? width * size
    const out = new Float32Array(a.count * width)
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const read = { 5120: dv.getInt8, 5121: dv.getUint8, 5122: dv.getInt16, 5123: dv.getUint16, 5125: dv.getUint32, 5126: dv.getFloat32 }[a.componentType as 5126]!
    const scale = a.normalized ? NORMAL[a.componentType] : 1
    for (let e = 0; e < a.count; e++) for (let c = 0; c < width; c++) out[e * width + c] = read.call(dv, (a.byteOffset ?? 0) + e * step + c * size, true) * scale
    return out
  }
  const nodes: any[] = gltf.nodes
  const parent = new Map<number, number>()
  nodes.forEach((n, i) => { for (const c of n.children ?? []) parent.set(c, i) })
  const joints = new Set<number>(gltf.skins?.[0]?.joints ?? [])
  if (!joints.size) throw new Error(`motion3d: ${kind}'s glb has no skin`)
  const trs = (n: any) => ({ t: n.translation ?? [0, 0, 0], r: n.rotation ?? [0, 0, 0, 1], s: n.scale ?? [1, 1, 1] })
  const local = (n: any) => (n.matrix ? new Matrix4().fromArray(n.matrix) : (({ t, r, s }) => new Matrix4().compose(new Vector3().fromArray(t), new Quaternion().fromArray(r), new Vector3().fromArray(s)))(trs(n)))
  const hipsAt = [...joints].find(j => !joints.has(parent.get(j) ?? -1))!
  const root = new Matrix4()
  for (let i = parent.get(hipsAt); i !== undefined; i = parent.get(i)) root.premultiply(local(nodes[i]))
  const bones: Skeleton['bones'] = {}
  for (const j of joints) bones[bareBone(nodes[j].name)] = { parent: j === hipsAt ? null : bareBone(nodes[parent.get(j)!].name), ...trs(nodes[j]) }
  const clips: Skeleton['clips'] = new Map()
  for (const a of gltf.animations ?? []) {
    const tracks: [string, 'r' | 'p', Track][] = []
    for (const ch of a.channels) {
      const path = ch.target.path
      const s = a.samplers[ch.sampler]
      const tr = { times: accessor(s.input), values: accessor(s.output) }
      if (!joints.has(ch.target.node) || (path !== 'rotation' && path !== 'translation')) {
        tracks.push(['', 'r', tr])
        continue
      }
      tracks.push([bareBone(nodes[ch.target.node].name), path === 'rotation' ? 'r' : 'p', tr])
    }
    const first = Math.min(...tracks.map(([, , tr]) => tr.times[0]))
    const r = new Map<string, Track>(), p = new Map<string, Track>()
    for (const [bone, what, tr] of tracks) {
      if (!bone) continue
      ;(what === 'r' ? r : p).set(bone, { times: tr.times.map(t => t - first), values: tr.values })
    }
    clips.set(a.name, { r, p, dur: Math.max(...tracks.map(([, , tr]) => tr.times[tr.times.length - 1] - first)) })
  }
  return { root, hips: bareBone(nodes[hipsAt].name), bones, clips }
}

export type Part = { slot: 'to' | 'from' | 'upper' | 'was'; clip: string; t: number; w: number; bone?: string }

const SHARE = 0.999 // as anim's: the most of an upper bone the upper half holds, short of the 1 its weight s/(1 − s) cannot reach

// The parts the row's fields draw: its clip at `blend`, and the one it fades from at the rest; over them
// the upper half's two, each from its own bone up. The mixer keeps a running weighted average, so a part of
// share s over a base of weight 1 is given weight s/(1 − s): shares a and b get weights a·k and b·k,
// k = s/(a + b)/(1 − s), s = min(0.999, a + b), so together they hold s of every bone under them.
export function partsOf(d: any): Part[] {
  if (d.clip == null) return []
  const blend = d.from != null ? d.blend : 1
  const out: Part[] = [{ slot: 'to', clip: d.clip, t: d.clipT, w: blend }]
  if (d.from != null && blend < 1) out.push({ slot: 'from', clip: d.from, t: d.fromT, w: 1 - blend })
  const a = d.upper != null ? d.upperW : 0
  const b = d.was != null ? d.wasW : 0
  if (a + b > 0) {
    const s = Math.min(SHARE, a + b)
    const k = s / (a + b) / (1 - s)
    if (a > 0) out.push({ slot: 'upper', clip: d.upper, t: d.upperT, w: a * k, bone: d.upperBone })
    if (b > 0) out.push({ slot: 'was', clip: d.was, t: d.wasT, w: b * k, bone: d.wasBone })
  }
  return out.filter(p => p.w > 0)
}

// Whether the joint `name` is the bone whose name ends with `bone`, or under it.
function within(sk: Skeleton, name: string, bone: string): boolean {
  for (let b: string | null = name; b; b = sk.bones[b].parent) if (b.endsWith(bone)) return true
  return false
}

// A joint's rotation or translation in a clip at t, as three's interpolants sample its track; a mirrored
// clip's from its source's other side, reflected across x.
function sampled(rig: Rig, sk: Skeleton, clip: string, bone: string, what: 'r' | 'p', t: number): number[] | undefined {
  const c = clipOf(rig, clip)
  const src = sk.clips.get(c.source)
  if (!src) throw new Error(`motion3d: the glb has no animation ${c.source}`)
  const track = src[what].get(c.mirrored ? swapSide(bone) : bone)
  if (!track) return undefined
  const { times, values } = track
  const n = what === 'r' ? 4 : 3
  const last = times.length - 1
  let v: number[]
  if (t <= times[0]) v = Array.from(values.subarray(0, n))
  else if (t >= times[last]) v = Array.from(values.subarray(last * n, last * n + n))
  else {
    let lo = 0, hi = last
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (times[mid] <= t) lo = mid
      else hi = mid
    }
    const s = (t - times[lo]) / (times[hi] - times[lo])
    if (what === 'r') {
      v = [0, 0, 0, 0]
      Quaternion.slerpFlat(v, 0, values as unknown as number[], lo * 4, values as unknown as number[], hi * 4, s)
    } else v = [0, 1, 2].map(k => values[lo * 3 + k] + (values[hi * 3 + k] - values[lo * 3 + k]) * s)
  }
  if (!c.mirrored) return v
  return what === 'r' ? [v[0], -v[1], -v[2], v[3]] : [-v[0], v[1], v[2]]
}

const lastPose = new WeakMap<Row, { key: string; sk: Skeleton; bones: Map<string, Matrix4> }>()

export function posed(from: W | Wire, me: Row): Map<string, Matrix4> {
  const kind = playKind(me)
  const rig = rigOf(from, kind)
  const sk = skeletonOf(from, kind)
  const parts = partsOf(me.data)
  const key = JSON.stringify(parts)
  const had = lastPose.get(me)
  if (had && had.key === key && had.sk === sk) return had.bones
  const names = Object.keys(sk.bones)
  const local = new Map<string, { t: Vector3; q: Quaternion; s: Vector3 }>()
  for (const name of names) {
    const rest = sk.bones[name]
    const q = [0, 0, 0, 1], p = [0, 0, 0]
    let wq = 0, wp = 0
    for (const part of parts) {
      if (part.bone !== undefined && !within(sk, name, part.bone)) continue
      const r = sampled(rig, sk, part.clip, name, 'r', part.t)
      if (r) {
        if (wq === 0) q.splice(0, 4, ...r)
        else Quaternion.slerpFlat(q, 0, q, 0, r, 0, part.w / (wq + part.w))
        wq += part.w
      }
      const t = sampled(rig, sk, part.clip, name, 'p', part.t)
      if (t) {
        if (wp === 0) p.splice(0, 3, ...t)
        else for (let i = 0; i < 3; i++) p[i] += (t[i] - p[i]) * (part.w / (wp + part.w))
        wp += part.w
      }
    }
    if (wq === 0) q.splice(0, 4, ...rest.r)
    else if (wq < 1) Quaternion.slerpFlat(q, 0, q, 0, rest.r, 0, 1 - wq)
    if (wp === 0) p.splice(0, 3, ...rest.t)
    else if (wp < 1) for (let i = 0; i < 3; i++) p[i] += (rest.t[i] - p[i]) * (1 - wp)
    local.set(name, { t: new Vector3().fromArray(p), q: new Quaternion().fromArray(q), s: new Vector3().fromArray(rest.s) })
  }
  pin(rig, sk, local.get(sk.hips)!, parts.filter(p => p.slot === 'to' || p.slot === 'from'), movesOf(from, kind))
  // Each joint's matrix in the body's frame, its parent's first.
  const world = () => {
    const out = new Map<string, Matrix4>()
    const of = (name: string): Matrix4 => {
      let m = out.get(name)
      if (m) return m
      const b = local.get(name)!
      const parent = sk.bones[name].parent
      m = (parent === null ? sk.root.clone() : of(parent).clone()).multiply(new Matrix4().compose(b.t, b.q, b.s))
      out.set(name, m)
      return m
    }
    for (const name of names) of(name)
    return out
  }
  const out = world()
  lastPose.set(me, { key, sk, bones: out })
  return out
}

// The hips from the parts, each pinned as its clip is, weighted as the mixer weighs them: a loop's at
// their rest plus their sway about its steady progress, a one-shot that carries travel's at their rest
// across the ground, a one-shot that keeps its turn turned back by its curve.
function pin(rig: Rig, sk: Skeleton, hips: { t: Vector3; q: Quaternion }, parts: Part[], a: Moves) {
  if (!parts.length) return
  const turn = new Quaternion()
  sk.root.decompose(new Vector3(), turn, new Vector3())
  const up = new Vector3(0, 1, 0).applyQuaternion(turn.invert()).normalize()
  const vert = (v: Vector3) => up.clone().multiplyScalar(v.dot(up))
  const flat = (v: Vector3) => v.clone().sub(vert(v))
  const bind = sk.bones[sk.hips]
  const restPos = new Vector3().fromArray(bind.t)
  const pos = new Vector3()
  let quat: Quaternion | undefined
  let total = 0
  for (const p of parts) {
    const c = clipOf(rig, p.clip)
    const at3 = (t: number) => sampled(rig, sk, p.clip, sk.hips, 'p', t)
    const h = at3(p.t) ? new Vector3().fromArray(at3(p.t)!) : restPos.clone()
    let q = new Quaternion().fromArray(sampled(rig, sk, p.clip, sk.hips, 'r', p.t) ?? bind.r)
    const how = carries(c, a)
    let x = h
    if (c.loop) {
      const dur = sk.clips.get(c.source)!.dur
      const start = at3(0) ? new Vector3().fromArray(at3(0)!) : new Vector3()
      const end = at3(dur) ? new Vector3().fromArray(at3(dur)!) : new Vector3()
      const steady = start.lerp(end, p.t / dur)
      x = flat(restPos).add(flat(h.clone().sub(steady))).add(vert(h))
    } else if (how.carries) x = flat(restPos).add(vert(h))
    if (how.turns) q = new Quaternion().setFromAxisAngle(up, -at(c.measure, p.t)[2] * DEG).multiply(q)
    pos.addScaledVector(x, p.w)
    total += p.w
    if (!quat) quat = q
    else quat.slerp(q, p.w / total)
  }
  hips.t.copy(pos.divideScalar(total))
  hips.q.copy(quat!)
}

// ---------------------------------------------------------------- a step

// Moves a playhead from t0 by `by` seconds of clip, each marker it crosses on `crossed` with how far
// through the step; a one-shot stops at its end.
function advance(c: Clip, t0: number, by: number, crossed: [number, Marker][]): { t: number; ended: boolean } {
  const reached = t0 + by
  if (!c.loop) {
    const t = Math.min(c.dur, reached)
    for (const m of c.markers) if (t0 < m.t && m.t <= t) crossed.push([(m.t - t0) / by, { name: m.name, clip: c.name }])
    return { t, ended: t >= c.dur }
  }
  for (let lap = 0; lap * c.dur <= reached; lap++) {
    for (const m of c.markers) {
      const at = m.t + lap * c.dur
      if (t0 < at && at <= reached) crossed.push([(at - t0) / by, { name: m.name, clip: c.name }])
    }
  }
  return { t: reached % c.dur, ended: false }
}

// The travel of a one-shot from t0 to t1, in world metres and radians, for a body facing `yaw`.
function travelOf(c: Clip, t0: number, t1: number, yaw: number, turns: boolean): Travel {
  const [f0, l0, y0] = at(c.measure, t0)
  const [f1, l1, y1] = at(c.measure, t1)
  const df = (f1 - f0) * c.scale, dl = (l1 - l0) * c.scale
  const c0 = turns ? y0 * DEG : 0
  const bf = df * math.cos(c0) + dl * math.sin(c0)
  const bl = -df * math.sin(c0) + dl * math.cos(c0)
  return {
    move: [bf * math.sin(yaw) + bl * math.cos(yaw), bf * math.cos(yaw) - bl * math.sin(yaw)],
    yaw: turns ? wrap((y1 - y0) * DEG, Math.PI) : 0,
  }
}

export function animate(me: Row, w: W, dt: number): { markers: Marker[]; travel: Travel } {
  const crossed: [number, Marker][] = []
  const travel: Travel = { move: [0, 0], yaw: 0 }
  const d = me.data
  const kind = playKind(me)
  const reads = readsOf(w, kind)
  if (d[reads.limp]) return { markers: [], travel }
  const { fade } = numbersOf(w, kind)
  fill(d)
  if (d.clip == null) return { markers: [], travel }
  const rig = rigOf(w, kind)
  const c = clipOf(rig, d.clip)
  const t0 = d.clipT
  if (d.state === 'act') {
    const moved = advance(c, t0, dt * c.rate * d.rate, crossed)
    d.clipT = moved.t
    const how = carries(c, movesOf(w, kind))
    if (how.carries) Object.assign(travel, travelOf(c, t0, moved.t, d[reads.yaw] ?? 0, how.turns))
    if (moved.ended) d.state = 'done'
  }
  d.blend = Math.min(1, d.blend + (fade > 0 ? dt / fade : Infinity))
  return { markers: crossed.sort((a, b) => a[0] - b[0]).map(([, m]) => m), travel }
}
