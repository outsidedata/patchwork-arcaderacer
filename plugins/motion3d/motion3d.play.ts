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
//   blend   how: `cross` or `inertial` (Inertialization); a kind that gives neither throws
//   reads   the names of the row's fields it reads: `pos`, `yaw`, `vel`, `grounded`, `limp`
//   props   `[{ model, bone, at, turn }]`, loader models hung on bones (the browser half's); the `props` mod
//           may hang props on the kind too, after these (`held(kind)`: item3d's, off its bodies sheet), and
//           `propsOf` is the two together
//   capsules  `[{ from, to, radius }]`, the body as gpgpu3d holds it for what is moved on the GPU
//           (`motion3d.gpgpu3d.ts`): each a capsule `radius` metres round between the bones whose names
//           end with `from` and `to`, or `{ bone, at, radius }`, a ball carried by a bone, `at` metres in
//           its frame; the `capsules` mod (`world.motion3d.mods.capsules`, item3d's) may give the kind
//           capsules after these, and `capsulesOf` is the two together
// The motion3d file's `moves` and `turns` say which one-shots carry travel: one that ends more than `moves` metres
// from its start, or turns `turns` degrees or more; under `turns`, its yaw column is zeroed. Its `down`,
// metres, is how far over its lowest an ankle stands while its foot is down, which keeps mixed clips in
// step (Mixes); a file whose motions mix nothing needs none.
//
// The rig file:
//   clips   name to a file string, or `{ file, loop, markers, scale, rate, mirror, rebase }`: `loop` laps
//           the clip; `markers` name to a time, or to `[from, to]`, two times, a window open between
//           them; a time is seconds, "NN%", or a moment the bake measured (Moments); `scale` multiplies the distance a
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
// `clip`, `clipT` (seconds into it), `rate`, `blend`, `from` and `fromT`; `inert`, the changes of clip
// being inertialized (Inertialization); and the upper half's own two
// slots, as anim's upper channel: `upper` the clip played over the body from the bone `upperBone` and
// every bone under it, `upperT` its playhead and `upperW` its share, and `was`, `wasT`, `wasW`, `wasBone`
// the one it fades out from.
//   over(me, clip, bone)  the clip played over the body from `bone` up: the one playing there handed to
//                     `was` to fade out, the new one fading in from 0
//   under(me)         the upper half let go: the clip playing there fades out
// The additive layers: `adds`, `[{ name, clip, t, w, most, loop, ending, bone }]`, clips laid on top of
// whatever the body plays, each bone turned on by as much as the clip turns it from its own first
// frame, at the layer's weight `w` (and moved on by as much as the clip moves it), from the bone `bone`
// up, or the whole body with none: a flinch over a run, breathing over anything.
// Mixes: `mix`, `[{ clip, t, w }]`, the clips drawn with the body's `clip`, each at its playhead and its
// share of the clip's weight, the clip itself the rest (a strafe drawn between its forward and its left);
// `fromMix` those drawn with `from` as it fades out, frozen with it. motion3d's server half sets them
// (`motion3d.sim.ts`, Mixes). Mixed loops are kept in step by the left foot coming down (`downOf`): each
// as far through its lap from that as the body's clip is through its own (`inStep`). `play` and `stop`
// freeze the mix into `fromMix` as they freeze the clip into `from`, and begin the new clip unmixed.
// Inertialization. A kind's `blend` says how its body goes from one clip to the next over its `fade`:
// `cross`, the clip it leaves frozen and drawn at 1 − `blend` under the one it goes to; `inertial`, the
// clip it goes to drawn whole at once, and each joint's offset from the pose the body left in to the
// pose that clip began in laid on, decaying to nothing over the fade along its own axis from the speed it
// moved at (`decayed`, Bollo's). Each change is an entry of the row's `inert` (`Inert`): `play` starts one
// from the clip it leaves, `settle` takes where the clip gone to began once a motion has set its playhead
// and its mix, the server half folds in the jump of the body's place (`left`, `root`) so the hips go on
// from where they were drawn, and `animate` takes it on and lets it go through the fade. A change cut
// short by another keeps decaying beside it, so the body goes on from the pose drawn, where a crossfade
// drops the clip half faded in and pops back to the one it froze. `posed` and the browser half lay the
// same offsets (`inertiaOf`) on the clip's pose. The upper half's two and the additive layers fade as
// they do either way.
//   inertiaOf(from, me)  each joint's turn and move left of every change the row inertializes
//   decayed(x0, v0, T, t)  an offset's decay
//   settle(me)        the change into the row's clip taking its playhead and mix as they are now
//   downOf(from, me, clip)  when a loop's left foot comes down in its lap, seconds: the start of the
//                     stretch round the lap its left ankle stands within the motion3d file's `down`
//                     metres of its lowest, off the rig's `ends` (a mirrored clip's, its source's right)
//   inStep(from, me, clip, t, other)  where `other` stands in step with `clip` at `t`
//   lay(me, name, clip, { most, loop, bone })  the layer `name` begun on `clip` from 0, fading in to
//                     `most` over `fade` (a layer of that name already on taken off first)
//   lift(me, name)    the layer `name` let go: it fades out over `fade` and is taken off
//   layStep(me, w, dt)  one step of every layer: its playhead on by dt·(the clip's `rate`); a loop laps;
//                     a one-shot fades out over the `fade` before its end and is taken off there; a layer
//                     let go fades out and is taken off; the markers each crossed, in order
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
//                     markers it crosses, a loop's lap included, in order (a window's opening by its name,
//                     its closing by its name and `.end`; a mark at a clip's very start is passed as it
//                     starts, not crossed); a one-shot that carries travel
//                     its step's travel, `{ move: [x, z], yaw }` in world metres and radians, turned back
//                     by the curve's yaw at the step's first playhead (when it keeps its turn) and by the
//                     row's `yaw`; a one-shot `done` on the step it reaches its end; `blend` up by
//                     dt/`fade`. A `limp` row is not played.
//   timesOf(from, me, clip)  the clip's markers and windows in seconds on the row's body (Moments)
//   open(from, me, clip, t)  the names of the clip's windows open `t` seconds in
//   clipOf(rig, name), at(measure, t), carries(clip, { moves, turns }), rigOf(from, kind),
//   readsOf(from, kind), numbersOf(from, kind), playKind(me), ends(from, me, segment, at?),
//   touchOf(from, me, clip), plantsOf(from, me, clip), posed(from, me), skeletonOf(from, kind)
//                     what the rest read, each as its comment says.
//
// Moments. A marker's time may name a moment the bake measured of the clip on the row's body, read off
// its `ends` and `touches`, so a clip's timing comes from the clip itself:
//   "peak"     the second its right hand moves fastest (the table's `peak`)
//   "strike"   the second the fastest of its hands and feet moves fastest: where a blow lands
//   "takeoff"  the second its last foot leaves the ground it stood on at the start: where a jump leaves it
//   "landing"  the second a foot comes down again after the takeoff: where a jump lands
//   "plant"    the second its first hand comes down on something: where a vault's hand meets the box;
//              a clip whose hands plant on nothing has none, and a time at it throws
// A clip whose feet never leave the ground has its takeoff and its landing at 0 and at its end. A moment
// may be moved on or back by seconds, "strike-0.08", held within the clip.
import type { Row, W } from '#engine/engine.ts'
import type { Plugins, Wire } from '#engine/browser.ts'
import { ahead, mod, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { Matrix4, Quaternion, Vector3 } from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { binary, json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

// The decoder's WebAssembly is made once, as the module is loaded, so a pose read on any step decodes
// at once.
await MeshoptDecoder.ready

// A time in a clip: seconds, "NN%", or a moment the bake measured (Moments, the header).
export type Time = number | string
export type Entry = string | { file?: string; loop?: boolean; markers?: Record<string, Time | [Time, Time]>; scale?: number; rate?: number; mirror?: string; rebase?: { from: string; onto: string } }
export type Measure = {
  frames?: number; dur: number; forward: number; left: number; yaw: number; rise?: number; height?: number; low?: number; peak?: number
  travel: number[][]
}
export type Reads = { pos: string; yaw: string; vel: string; grounded: string; limp: string }
// A prop hung on a bone: a loader model, or an item the `props` mod hands (`motion3d.plugin.ts`, Props).
export type Prop = ({ model: string } | { item: string }) & { bone: string; at: number[]; turn: number[] }
// A prop's name, which a carry's `prop` names it by: its model's, or its item's.
export const propName = (p: Prop) => ('item' in p ? p.item : p.model)
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
export type Capsule = { from: string; to: string; radius: number } | { bone: string; at: number[]; radius: number }
export type Body = { rig: string; measured?: string; model: string; glb?: string; fade: number; blend: 'cross' | 'inertial'; reads: Reads; props?: Prop[]; capsules?: Capsule[] }
// What the `props` mod hands of a kind's props (`motion3d.plugin.ts`, Props): `held(kind)`, the props it hangs
// on every body of that kind, [] for a kind it hangs none on. The `capsules` mod: `capsules(plugins)` hands back
// the capsules it gives a kind, [] for a kind it gives none.
export type Held = (plugins: Plugins) => { held(kind: string): Prop[] }
export type Capsules = (plugins: Plugins) => (kind: string) => Capsule[]
// A kind's props on this page: its own (`<kind>.props`), then those the `props` mod hangs on it, in that order,
// which is the order of `plugins.motion3d.props(id)` and the one a carry finds its prop in.
export function propsOf(plugins: Plugins, kind: string): Prop[] {
  const scene = plugins.wire.scene
  const own: Prop[] = scene.world!.motion3d?.kinds?.[kind]?.props ?? []
  const from = mod<Held>(scene.world!, 'motion3d', 'props')
  if (!from) return own
  ahead(scene, 'motion3d', 'props')
  const more = from(plugins).held(kind)
  return !own.length ? more : !more.length ? own : [...own, ...more]
}
// A kind's capsules on this page: its own (`<kind>.capsules`), then those the `capsules` mod gives it.
export function capsulesOf(plugins: Plugins, kind: string): Capsule[] {
  const scene = plugins.wire.scene
  const own: Capsule[] = scene.world!.motion3d?.kinds?.[kind]?.capsules ?? []
  const from = mod<Capsules>(scene.world!, 'motion3d', 'capsules')
  if (!from) return own
  provided(scene, 'motion3d', 'capsules')
  const more = from(plugins)(kind)
  return !own.length ? more : !more.length ? own : [...own, ...more]
}
// One change of the body's clip being inertialized (Inertialization, the header): the clip it came from,
// its playhead, its mix and the row's rate as it was left; the clip it went to, its playhead and its mix
// as it began, and the row's rate it began at; how far through the kind's `fade` it is, 0 to 1; and, once
// the server half has placed the clip gone to (`motion3d.sim.ts`), where the body stood as it changed
// (`left`, [x, y, z, yaw] and its tilt after) and the turn and move from where it stood to where it
// stands now, in its own frame (`root`, a matrix's 16 numbers), or null for none.
export type Inert = { from: string; t: number; mix: Mix[]; rate: number; to: string; t0: number; mix0: Mix[]; rate0: number; s: number; left: number[] | null; root: number[] | null }
export type Clip = {
  name: string
  source: string // the clip whose tracks it draws: its own name, or the clip it mirrors
  mirrored: boolean
  loop: boolean
  scale: number
  rate: number
  markers: { name: string; at: Time }[]
  windows: { name: string; from: Time; to: Time }[]
  dur: number
  measure: Measure
}
export type Marker = { name: string; clip: string }
// A clip's markers and windows in seconds on one body.
export type Times = { markers: { name: string; t: number }[]; windows: { name: string; from: number; to: number }[] }
export type Travel = { move: number[]; yaw: number }
export type Moves = { moves: number; turns: number; down?: number }
// A clip drawn with the body's own (Mixes, the header): its name, its playhead and its share.
export type Mix = { clip: string; t: number; w: number }

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

// The moments a time may name (Moments, the header).
const MOMENTS = ['peak', 'strike', 'takeoff', 'landing', 'plant']

// A time's check as the rig is read: seconds, "NN%" or a moment.
function checkTime(clip: string, marker: string, at: Time) {
  if (typeof at === 'number' ? Number.isFinite(at) : MOMENTS.includes(at) || /^\d+(?:\.\d+)?%$/.test(at) || /^(peak|strike|takeoff|landing|plant)[+-]\d+(?:\.\d+)?$/.test(at)) return
  throw new Error(`motion3d: ${clip}'s marker ${marker} is at ${JSON.stringify(at)}, which is no seconds, "NN%" or one of ${MOMENTS.join(', ')}, maybe moved by seconds ("strike-0.1")`)
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
  const markers: Clip['markers'] = [], windows: Clip['windows'] = []
  for (const [n, at] of Object.entries(e.markers ?? {})) {
    if (Array.isArray(at)) {
      // The rig file is read from outside the program, so a window of other than two times is refused.
      const given = (at as unknown[]).length
      if (given !== 2) throw new Error(`motion3d: ${name}'s window ${n} gives ${given} times, not [from, to]`)
      at.forEach(a => checkTime(name, n, a))
      windows.push({ name: n, from: at[0], to: at[1] })
    } else {
      checkTime(name, n, at)
      markers.push({ name: n, at })
    }
  }
  const clip: Clip = {
    name,
    source: own.mirror ?? name,
    mirrored: own.mirror !== undefined,
    loop: e.loop ?? false,
    scale: e.scale ?? 1,
    rate: e.rate ?? 1,
    markers,
    windows,
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
  if (k.blend !== 'cross' && k.blend !== 'inertial') throw new Error(`motion3d kind ${kind} gives blend ${JSON.stringify(k.blend)}, which is neither cross nor inertial`)
  return k
}
// The motion3d file, read for its `moves` and `turns`.
export function movesOf(from: W | Wire, kind: string): Moves {
  return json(from, worldOf(from).motion3d.kinds[kind].motion)
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
  d.adds ??= []
  d.mix ??= []
  d.fromMix ??= []
  d.inert ??= []
}

// The clip the body went to, begun at another playhead or mix than `play` began it at (a motion's
// `begin`, a pose, the clips mixed with it): the change being inertialized into it takes them as where it
// began (Inertialization, the header).
export function settle(me: Row) {
  const d = me.data
  fill(d)
  const last = (d.inert as Inert[])[d.inert.length - 1]
  if (!last || last.to !== d.clip || last.s !== 0) return
  d.inert = [...d.inert.slice(0, -1), { ...last, t0: d.clipT, mix0: (d.mix as Mix[]).map(m => ({ ...m })), rate0: d.rate }]
}

// ---------------------------------------------------------------- mixes

// When a loop's left foot comes down in its lap, seconds (Mixes, the header): off the rig's `ends` for
// the kind's `model`, the start of the stretch, round the lap, the left ankle stands within the motion3d
// file's `down` metres of its lowest. A mirrored clip's is its source's right foot. A file with no `down`
// throws, as does a clip with no ends or a one-shot.
const downs = new WeakMap<object, Map<string, number>>()
export function downOf(from: W | Wire, me: Row, clip: string): number {
  const kind = playKind(me)
  const rig = rigOf(from, kind)
  const c = clipOf(rig, clip)
  if (!c.loop) throw new Error(`motion3d: ${clip} is mixed, and it is no loop`)
  const near = movesOf(from, kind).down
  if (typeof near !== 'number') throw new Error(`motion3d: ${kind}'s motion3d file gives no down, which keeps the clips it mixes in step`)
  const body = numbersOf(from, kind).model
  let byClip = downs.get(rig.ends ?? rig)
  if (!byClip) downs.set(rig.ends ?? rig, (byClip = new Map()))
  const key = `${body} ${clip} ${near}`
  const had = byClip.get(key)
  if (had !== undefined) return had
  const e = rig.ends?.[body]?.[c.source]
  const rows = e?.[c.mirrored ? 'footR' : 'footL'] as number[][] | undefined
  if (!e || !rows) throw new Error(`motion3d: ${clip} is mixed, and ${kind}'s rig has no ends of ${c.source} for ${body}; bake it`)
  // The lap's frames, its last the first again.
  const n = rows.length - 1
  const at = (f: number) => rows[((f % n) + n) % n][1]
  let low = 0
  for (let f = 1; f < n; f++) if (at(f) < at(low)) low = f
  let down = low
  for (let k = 0; k < n && at(down - 1) <= at(low) + near; k++) down--
  const t = ((((down % n) + n) % n) / n) * c.dur
  byClip.set(key, t)
  return t
}

// Where clip `to` stands in step with `from` at `t` seconds into it (Mixes, the header): as far through
// its lap from its left foot coming down as `from` is through its own.
export function inStep(w: W | Wire, me: Row, from: string, t: number, to: string): number {
  const rig = rigOf(w, playKind(me))
  const a = clipOf(rig, from), b = clipOf(rig, to)
  const share = (t - downOf(w, me, from)) / a.dur + downOf(w, me, to) / b.dur
  return (share - Math.floor(share)) * b.dur
}

// ---------------------------------------------------------------- additive layers

// A layer laid on top of what the body plays (the header).
export type Layer = { name: string; clip: string; t: number; w: number; most: number; loop: boolean; ending: boolean; bone: string | null }

export function lay(me: Row, name: string, clip: string, { most = 1, loop = false, bone = null }: { most?: number; loop?: boolean; bone?: string | null } = {}) {
  const d = me.data
  fill(d)
  d.adds = [...d.adds.filter((l: Layer) => l.name !== name), { name, clip, t: 0, w: 0, most, loop, ending: false, bone }]
}

export function lift(me: Row, name: string) {
  const d = me.data
  fill(d)
  d.adds = d.adds.map((l: Layer) => (l.name === name ? { ...l, ending: true } : l))
}

export function layStep(me: Row, w: W, dt: number): Marker[] {
  const d = me.data
  fill(d)
  const kind = playKind(me)
  const { fade } = numbersOf(w, kind)
  const per = (s: number) => (fade > 0 ? s / fade : Infinity)
  const crossed: [number, Marker][] = []
  const kept: Layer[] = []
  for (const l of d.adds as Layer[]) {
    const c = clipOf(rigOf(w, kind), l.clip)
    const went = advance(c, timesOf(w, me, l.clip), l.t, dt * c.rate, crossed)
    if (went.ended) continue
    const up = l.ending ? l.w - l.most * per(dt) : Math.min(l.most, l.w + l.most * per(dt))
    // A one-shot comes down over the fade before its end.
    const w2 = l.loop ? up : Math.min(up, l.most * per(c.dur - went.t))
    if (l.ending && !(w2 > 0)) continue
    kept.push({ ...l, t: went.t, w: Math.max(0, w2) })
  }
  d.adds = kept
  return crossed.sort((a, b) => a[0] - b[0]).map(([, m]) => m)
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
    const went = advance(u, timesOf(w, me, d.upper), d.upperT, dt * u.rate, crossed)
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
      d.fromMix = d.mix
    }
    d.blend = 0
    // The change inertialized (Inertialization, the header): from the clip it played as it left it.
    d.inert = [...d.inert, { from: d.clip, t: d.clipT, mix: d.mix, rate: d.rate, to: clip, t0: 0, mix0: [], rate0: rate ?? 1, s: 0, left: null, root: null }]
  }
  d.clip = clip
  d.mix = []
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
  settle(me)
}

export function stop(me: Row) {
  const d = me.data
  fill(d)
  if (d.clip != null) {
    if (d.blend >= 1) {
      d.from = d.clip
      d.fromT = d.clipT
      d.fromMix = d.mix
    }
    d.blend = 0
  }
  d.mix = []
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

// ---------------------------------------------------------------- moments

// The second the fastest of a clip's hands and feet moves fastest, off its `ends` on the body: each
// segment's far end (the wrist's or the ankle's next joint) frame to frame, leaving out the step into its
// second frame and into its last, where a clip cut from a longer take jumps (the great sword's slide
// throws a foot into its first frame) — a clip of under four frames reads them all.
function strikeOf(from: W | Wire, me: Row, c: Clip): { t: number; limb: Limb } {
  const kind = playKind(me)
  const body = numbersOf(from, kind).model
  const clip = rigOf(from, kind).ends?.[body]?.[c.source]
  if (!clip) throw new Error(`motion3d: ${c.name}'s marker is at its strike, and ${kind}'s rig has no ends of ${c.source} for ${body}; bake it`)
  let most = 0, at = 0, limb: Limb = 'handR'
  for (const seg of ['handL', 'handR', 'footL', 'footR'] as Limb[]) {
    const rows = clip[seg] as number[][] | undefined
    if (!rows) throw new Error(`motion3d: ${kind}'s rig measures no segment ${seg} of ${c.source}`)
    const edge = rows.length >= 4 ? 1 : 0
    for (let f = 1 + edge; f < rows.length - edge; f++) {
      const v = math.hypot(rows[f][3] - rows[f - 1][3], rows[f][4] - rows[f - 1][4], rows[f][5] - rows[f - 1][5])
      if (v > most) { most = v; at = f / clip.fps; limb = seg }
    }
  }
  // A mirrored clip strikes with the other side's limb.
  return { t: Math.min(c.dur, at), limb: c.mirrored ? (limb.endsWith('L') ? limb.replace(/L$/, 'R') : limb.replace(/R$/, 'L')) as Limb : limb }
}

// Where a clip's blow lands, on the row's body: the second its strike comes, and the limb that strikes.
export const blowOf = (from: W | Wire, me: Row, name: string) => strikeOf(from, me, clipOf(rigOf(from, playKind(me)), name))

// When a clip's feet leave the ground they stood on at its start, and when one comes down again (Moments,
// the header): the end of the later foot's first planted run, and the start of the first run after it.
// Feet that never leave it take off at 0 and land at the end.
function airOf(from: W | Wire, me: Row, c: Clip): { takeoff: number; landing: number } {
  const p = plantsOf(from, me, c.name)
  const feet = [p.footL, p.footR]
  if (feet.some(runs => !runs.length) || feet.some(runs => runs[0][1] >= c.dur - 1e-6)) return { takeoff: 0, landing: c.dur }
  const takeoff = Math.max(...feet.map(runs => runs[0][1]))
  const after = feet.flatMap(runs => runs.filter(r => r[0] > takeoff).map(r => r[0]))
  return { takeoff, landing: after.length ? Math.min(...after) : c.dur }
}

// When a clip's first hand comes down on something (Moments, the header): the earliest start of a run
// either hand is planted in. A clip whose hands plant on nothing has no plant, and a time at it throws.
function plantOf(from: W | Wire, me: Row, c: Clip, marker: string): number {
  const p = plantsOf(from, me, c.name)
  const starts = [...p.handL, ...p.handR].map(r => r[0])
  if (!starts.length) throw new Error(`motion3d: ${c.name}'s ${marker} is at its plant, and neither hand of it is planted on anything`)
  return Math.min(...starts)
}

// A time in seconds on the row's body.
function secondsOf(from: W | Wire, me: Row, c: Clip, marker: string, at: Time): number {
  if (typeof at === 'number') return at
  if (at === 'peak') {
    if (c.measure.peak === undefined) throw new Error(`motion3d: ${c.name}'s marker ${marker} is at its peak, and its table row gives none`)
    return c.measure.peak
  }
  // A moment moved on or back by seconds: "strike-0.1".
  const by = /^(peak|strike|takeoff|landing|plant)([+-]\d+(?:\.\d+)?)$/.exec(at)
  if (by) return Math.max(0, Math.min(c.dur, secondsOf(from, me, c, marker, by[1]) + Number(by[2])))
  if (at === 'strike') return strikeOf(from, me, c).t
  if (at === 'takeoff') return airOf(from, me, c).takeoff
  if (at === 'landing') return airOf(from, me, c).landing
  if (at === 'plant') return plantOf(from, me, c, marker)
  return (Number(at.slice(0, -1)) / 100) * c.dur
}

const timed = new WeakMap<object, Map<string, Times>>()
export function timesOf(from: W | Wire, me: Row, name: string): Times {
  const kind = playKind(me)
  const rig = rigOf(from, kind)
  const c = clipOf(rig, name)
  const body = numbersOf(from, kind).model
  let byRig = timed.get(rig)
  if (!byRig) timed.set(rig, (byRig = new Map()))
  const key = `${body}\u0000${name}`
  const had = byRig.get(key)
  if (had) return had
  const got: Times = {
    markers: c.markers.map(m => ({ name: m.name, t: secondsOf(from, me, c, m.name, m.at) })).sort((a, b) => a.t - b.t),
    windows: c.windows.map(win => ({ name: win.name, from: secondsOf(from, me, c, win.name, win.from), to: secondsOf(from, me, c, win.name, win.to) })),
  }
  for (const win of got.windows) if (!(win.from <= win.to)) throw new Error(`motion3d: ${name}'s window ${win.name} opens at ${win.from} s, after it closes at ${win.to} s`)
  byRig.set(key, got)
  return got
}

// A time in seconds on the row's body, of a time the motion3d file gives against a clip (a cancel point).
export const secondsIn = (from: W | Wire, me: Row, name: string, what: string, at: Time): number => {
  const c = clipOf(rigOf(from, playKind(me)), name)
  checkTime(name, what, at)
  return secondsOf(from, me, c, what, at)
}

export function open(from: W | Wire, me: Row, clip: string, t: number): string[] {
  return timesOf(from, me, clip).windows.filter(win => win.from <= t && t < win.to).map(win => win.name)
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
// up; the hips pinned as `pin` pins them, by the body's two parts; and each additive layer laid on top
// (`added`). A row is posed once a step whatever
// asks: the answer is kept on it until the fields it is posed from change, or the glb, the rig file, or
// the motion file's moves and turns. It throws for a kind with no `glb`, and for a clip the glb has none of.

const swapSide = (name: string) => name.replace(/Left|Right/g, s => (s === 'Left' ? 'Right' : 'Left'))
export const bareBone = (name: string) => name.replace(/^mixamorig\d*:?/, '')

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

export type Part = { slot: 'to' | 'from' | 'upper' | 'was' | 'add'; clip: string; t: number; w: number; bone?: string }

const SHARE = 0.999 // as anim's: the most of an upper bone the upper half holds, short of the 1 its weight s/(1 − s) cannot reach

// The parts the row's fields draw: its clip at `blend`, and the one it fades from at the rest, each
// sharing its weight with the clips mixed with it (`mix`, `fromMix`); over them
// the upper half's two, each from its own bone up; and on top of all of them each additive layer (`add`)
// at its weight, from its bone up or over the whole body. The mixer keeps a running weighted average, so a part of
// share s over a base of weight 1 is given weight s/(1 − s): shares a and b get weights a·k and b·k,
// k = s/(a + b)/(1 − s), s = min(0.999, a + b), so together they hold s of every bone under them.
export function partsOf(d: any, inertial: boolean): Part[] {
  const into = fresh()
  return into.slice(0, partsInto(d, into, inertial))
}

// The same parts, of some weight each, written over the first of `into` and counted. `posed` reads them
// every call to see whether the row's pose has moved, so they are written into parts it keeps rather than made.
// A kind that inertializes (Inertialization, the header) draws its clip whole and nothing it fades from.
function partsInto(d: any, into: Part[], inertial: boolean): number {
  let n = 0
  const put = (slot: Part['slot'], clip: string, t: number, w: number, bone?: string) => {
    if (!(w > 0)) return
    if (n === into.length) into.push({ slot: 'to', clip: '', t: 0, w: 0 })
    const p = into[n++]
    p.slot = slot
    p.clip = clip
    p.t = t
    p.w = w
    p.bone = bone
  }
  if (d.clip == null) return 0
  const blend = d.from != null && !inertial ? d.blend : 1
  // The clip and the clips mixed with it (Mixes), sharing its weight; the one it fades from, and those
  // mixed with that, sharing the rest.
  const mix = (d.mix ?? []) as Mix[], fromMix = (d.fromMix ?? []) as Mix[]
  put('to', d.clip, d.clipT, blend * (1 - mix.reduce((s, m) => s + m.w, 0)))
  for (const m of mix) put('to', m.clip, m.t, blend * m.w)
  if (d.from != null && blend < 1) {
    put('from', d.from, d.fromT, (1 - blend) * (1 - fromMix.reduce((s, m) => s + m.w, 0)))
    for (const m of fromMix) put('from', m.clip, m.t, (1 - blend) * m.w)
  }
  const a = d.upper != null ? d.upperW : 0
  const b = d.was != null ? d.wasW : 0
  if (a + b > 0) {
    const s = Math.min(SHARE, a + b)
    const k = s / (a + b) / (1 - s)
    if (a > 0) put('upper', d.upper, d.upperT, a * k, d.upperBone)
    if (b > 0) put('was', d.was, d.wasT, b * k, d.wasBone)
  }
  for (const l of (d.adds ?? []) as Layer[]) put('add', l.clip, l.t, l.w, l.bone ?? undefined)
  return n
}

// Parts to write a row's into: `to`, `from`, `upper` and `was`, and one more for each additive layer.
const fresh = (): Part[] => Array.from({ length: 4 }, () => ({ slot: 'to', clip: '', t: 0, w: 0 }))

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

// Each row's last pose, and everything it was posed from: the skeleton, the rig's `clips` and `table`
// (the loader parses a changed file into new ones), the motion file's moves and turns, the parts, and the
// changes it inertializes.
type Kept = { sk: Skeleton; clips: Rig['clips']; table: Rig['table']; moves: number; turns: number; parts: Part[]; inert: string; bones: Map<string, Matrix4> }
const lastPose = new WeakMap<Row, Kept>()

// The parts a row's fields draw this call, written here first and kept only when the pose is made again.
const drawn = fresh()

// Whether the row is to be posed as it was last posed.
function unmoved(had: Kept, sk: Skeleton, rig: Rig, a: Moves, n: number, inert: string): boolean {
  if (had.sk !== sk || had.clips !== rig.clips || had.table !== rig.table || had.inert !== inert) return false
  if (had.moves !== a.moves || had.turns !== a.turns || had.parts.length !== n) return false
  for (let i = 0; i < n; i++) {
    const p = drawn[i], q = had.parts[i]
    if (p.slot !== q.slot || p.clip !== q.clip || p.t !== q.t || p.w !== q.w || p.bone !== q.bone) return false
  }
  return true
}

// Each joint's place, turn and scale in its parent's frame, drawn from `parts` (each at its weight, the
// rest of a joint's weight its bind), its hips pinned as their clips have them (`pin`).
type Local = Map<string, { t: Vector3; q: Quaternion; s: Vector3 }>
function localPose(rig: Rig, sk: Skeleton, parts: Part[], a: Moves): Local {
  const local: Local = new Map()
  for (const name of Object.keys(sk.bones)) {
    const rest = sk.bones[name]
    const q = [0, 0, 0, 1], p = [0, 0, 0]
    let wq = 0, wp = 0
    for (const part of parts) {
      if (part.slot === 'add' || (part.bone !== undefined && !within(sk, name, part.bone))) continue
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
  pin(rig, sk, local.get(sk.hips)!, parts.filter(p => p.slot === 'to' || p.slot === 'from'), a)
  return local
}

export function posed(from: W | Wire, me: Row): Map<string, Matrix4> {
  const kind = playKind(me)
  const rig = rigOf(from, kind)
  const sk = skeletonOf(from, kind)
  const a = movesOf(from, kind)
  const inertial = numbersOf(from, kind).blend === 'inertial'
  const n = partsInto(me.data, drawn, inertial)
  const inert = inertial ? JSON.stringify(me.data.inert ?? []) : ''
  const had = lastPose.get(me)
  if (had && unmoved(had, sk, rig, a, n, inert)) return had.bones
  const parts = drawn.slice(0, n).map(p => ({ ...p }))
  const names = Object.keys(sk.bones)
  const local = localPose(rig, sk, parts, a)
  // Each change of clip inertialized: every joint turned and moved on by what is left of its offset.
  if (inertial) {
    for (const [name, o] of inertiaOf(from, me)) {
      const b = local.get(name)
      if (!b) continue
      b.q.premultiply(o.q)
      b.t.add(o.t)
    }
  }
  // Each additive layer laid on top (`added`).
  for (const part of parts) if (part.slot === 'add') added(rig, sk, names, local, part)
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
  lastPose.set(me, { sk, clips: rig.clips, table: rig.table, moves: a.moves, turns: a.turns, parts, inert, bones: out })
  return out
}

// ---------------------------------------------------------------- inertialization

// The step a joint's speed is read over, seconds: a sixtieth, the clip's own frame or finer.
const H = 1 / 60

// How far an offset `x0` that moves at `v0` a second has left to go `t` seconds into a decay of `T`
// seconds (Bollo, "Inertialization", GDC 2018): a fifth-order curve from x0 at v0 to nothing at rest by
// t1, the sooner of T and the time v0 would take it there five times over, its speed and its acceleration
// there none, never past nothing. A speed away from nothing is taken as none, as Bollo takes it: carried,
// a joint's speed goes on only along its own offset's axis, and the body's limbs, whose speeds lie
// across it, come out more jolted than a crossfade leaves them (measured, walking let go into its stop).
export function decayed(x0: number, v0: number, T: number, t: number): number {
  if (!(x0 > 0) || !(T > 0)) return 0
  const v = Math.min(0, v0)
  const t1 = v < 0 ? Math.min(T, (-5 * x0) / v) : T
  if (t >= t1) return 0
  const a0 = Math.max(0, (-8 * v * t1 - 20 * x0) / (t1 * t1))
  const A = -(a0 * t1 * t1 + 6 * v * t1 + 12 * x0) / (2 * t1 ** 5)
  const B = (3 * a0 * t1 * t1 + 16 * v * t1 + 30 * x0) / (2 * t1 ** 4)
  const C = -(3 * a0 * t1 * t1 + 12 * v * t1 + 20 * x0) / (2 * t1 ** 3)
  return A * t ** 5 + B * t ** 4 + C * t ** 3 + (a0 / 2) * t * t + v * t + x0
}

// The parts of a clip at `t` with the clips mixed with it, each kept in step with it (`inStep`), its
// shares as `mix` gives them.
function partsAt(from: W | Wire, me: Row, clip: string, t: number, mix: Mix[]): Part[] {
  const own = 1 - mix.reduce((s, m) => s + m.w, 0)
  return [{ slot: 'to', clip, t, w: own }, ...mix.map(m => ({ slot: 'to' as const, clip: m.clip, t: inStep(from, me, clip, t, m.clip), w: m.w }))]
}

// A clip's playhead `back` seconds of the row's time before `t`, as it plays at `rate` on its own: held
// within a one-shot, round a loop's lap.
function before(rig: Rig, clip: string, t: number, rate: number, back: number): number {
  const c = clipOf(rig, clip)
  const at = t - back * rate * c.rate
  if (!c.loop) return Math.max(0, Math.min(c.dur, at))
  return at - Math.floor(at / c.dur) * c.dur
}

// What is left of every change the row inertializes (Inertialization, the header), joint by joint: a turn
// to lay before its joint's own, and a move to add to its place. For each change, each joint's offset is
// the pose the body left in (the clip it came from as it left it, with its mix) against the pose the clip
// it went to began in, its speed the two poses' speeds a step before those, and it is decayed (`decayed`)
// over the kind's `fade` from there, along the offset's own axis; the changes laid together.
const inertiaKept = new WeakMap<Row, { key: string; out: Map<string, { q: Quaternion; t: Vector3 }> }>()
export function inertiaOf(from: W | Wire, me: Row): Map<string, { q: Quaternion; t: Vector3 }> {
  const kind = playKind(me)
  const { fade } = numbersOf(from, kind)
  const entries = (me.data.inert ?? []) as Inert[]
  const key = JSON.stringify(entries)
  const had = inertiaKept.get(me)
  if (had && had.key === key) return had.out
  const rig = rigOf(from, kind)
  const sk = skeletonOf(from, kind)
  const a = movesOf(from, kind)
  const out = new Map<string, { q: Quaternion; t: Vector3 }>()
  for (const e of entries) {
    const src = localPose(rig, sk, partsAt(from, me, e.from, e.t, e.mix), a)
    const srcBefore = localPose(rig, sk, partsAt(from, me, e.from, before(rig, e.from, e.t, e.rate, H), e.mix), a)
    // The body moved and turned as it changed (`root`): its hips where they were drawn, in the frame of
    // where it stands now, so the place's jump decays with the pose.
    if (e.root) {
      const into = sk.root.clone().invert().multiply(new Matrix4().fromArray(e.root)).multiply(sk.root)
      for (const pose of [src, srcBefore]) {
        const h = pose.get(sk.hips)!
        new Matrix4().compose(h.t, h.q, h.s).premultiply(into).decompose(h.t, h.q, new Vector3())
      }
    }
    const dst = localPose(rig, sk, partsAt(from, me, e.to, e.t0, e.mix0), a)
    const dstBefore = localPose(rig, sk, partsAt(from, me, e.to, before(rig, e.to, e.t0, e.rate0, H), e.mix0), a)
    const t = e.s * fade
    for (const [name, s] of src) {
      const d = dst.get(name)!, sp = srcBefore.get(name)!, dp = dstBefore.get(name)!
      const o = out.get(name) ?? { q: new Quaternion(), t: new Vector3() }
      // The turn: the offset from where the clip went to began to where the body left, about its axis.
      const off = s.q.clone().multiply(d.q.clone().invert())
      if (off.w < 0) off.set(-off.x, -off.y, -off.z, -off.w)
      const sin = Math.hypot(off.x, off.y, off.z)
      if (sin > 1e-9) {
        const axis = new Vector3(off.x, off.y, off.z).divideScalar(sin)
        const x0 = 2 * Math.atan2(sin, off.w)
        const prev = sp.q.clone().multiply(dp.q.clone().invert())
        // The short way round, as the offset is taken, so its angle about the axis is near the offset's.
        if (prev.w < 0) prev.set(-prev.x, -prev.y, -prev.z, -prev.w)
        const xp = 2 * Math.atan2(prev.x * axis.x + prev.y * axis.y + prev.z * axis.z, prev.w)
        const x = decayed(x0, (x0 - xp) / H, fade, t)
        // Laid inside the changes before it: each offset goes from the clip its change went to, which
        // the change after it went on from, so the oldest is laid outermost.
        o.q.multiply(new Quaternion().setFromAxisAngle(axis, x))
      }
      // The move: the offset from where the joint began in the clip gone to to where it left, along it.
      const gap = s.t.clone().sub(d.t)
      const far = gap.length()
      if (far > 1e-9) {
        const dir = gap.clone().divideScalar(far)
        const xp = sp.t.clone().sub(dp.t).dot(dir)
        o.t.addScaledVector(dir, decayed(far, (far - xp) / H, fade, t))
      }
      out.set(name, o)
    }
  }
  inertiaKept.set(me, { key, out })
  return out
}

// An additive layer laid on the pose (Additive layers, the header): each joint from the layer's bone up
// (every joint, with none) turned on by the turn its clip makes from its first frame to its playhead,
// taken to the layer's weight, `q · slerp(1, q₀⁻¹ · q_t, w)`, and moved on by the move it makes,
// `p + w · (p_t − p₀)`. The browser half lays it the same way on the mixer's pose.
function added(rig: Rig, sk: Skeleton, names: string[], local: Map<string, { t: Vector3; q: Quaternion }>, part: Part) {
  for (const name of names) {
    if (part.bone !== undefined && !within(sk, name, part.bone)) continue
    const b = local.get(name)!
    const r0 = sampled(rig, sk, part.clip, name, 'r', 0), rt = sampled(rig, sk, part.clip, name, 'r', part.t)
    if (r0 && rt) {
      const delta = new Quaternion().fromArray(r0).invert().multiply(new Quaternion().fromArray(rt))
      b.q.multiply(new Quaternion().slerp(delta, part.w))
    }
    const p0 = sampled(rig, sk, part.clip, name, 'p', 0), pt = sampled(rig, sk, part.clip, name, 'p', part.t)
    if (p0 && pt) b.t.add(new Vector3().fromArray(pt).sub(new Vector3().fromArray(p0)).multiplyScalar(part.w))
  }
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

// Every point a clip's markers mark: its markers, each window's opening by its name and its closing by
// its name and `.end`.
function marksOf(times: Times): { name: string; t: number }[] {
  return [...times.markers, ...times.windows.flatMap(win => [{ name: win.name, t: win.from }, { name: `${win.name}.end`, t: win.to }])]
}

// Moves a playhead from t0 by `by` seconds of clip, each marker it crosses on `crossed` with how far
// through the step; a one-shot stops at its end.
function advance(c: Clip, times: Times, t0: number, by: number, crossed: [number, Marker][]): { t: number; ended: boolean } {
  const reached = t0 + by
  const marks = marksOf(times)
  if (!c.loop) {
    const t = Math.min(c.dur, reached)
    for (const m of marks) if (t0 < m.t && m.t <= t) crossed.push([(m.t - t0) / by, { name: m.name, clip: c.name }])
    return { t, ended: t >= c.dur }
  }
  for (let lap = 0; lap * c.dur <= reached; lap++) {
    for (const m of marks) {
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
    const moved = advance(c, timesOf(w, me, d.clip), t0, dt * c.rate * d.rate, crossed)
    d.clipT = moved.t
    const how = carries(c, movesOf(w, kind))
    if (how.carries) Object.assign(travel, travelOf(c, t0, moved.t, d[reads.yaw] ?? 0, how.turns))
    if (moved.ended) d.state = 'done'
  }
  d.blend = Math.min(1, d.blend + (fade > 0 ? dt / fade : Infinity))
  // Each change inertialized on by the step, and let go once through the fade.
  d.inert = (d.inert as Inert[]).map(e => ({ ...e, s: e.s + (fade > 0 ? dt / fade : Infinity) })).filter(e => e.s < 1)
  return { markers: crossed.sort((a, b) => a[0] - b[0]).map(([, m]) => m), travel }
}
