// The server half of anim: skeletal clips from a rig file, as fields on the rows that play them. It
// keeps each row's playhead, picks its gear from how it moves, fires the markers its playhead
// crosses, measures the travel a one-shot carries, and keeps an upper-body channel beside it. The
// browser half (`anim.plugin.ts`) draws every row from these fields as they stand.
//
// anim has no row of its own: nothing of its own changes. Its numbers are the scene's `world.anim`,
// which a child scene inherits from the manager's (`addons/scenemanager`), read by a rule off `w` and
// by the browser half off `plugins.wire.scene`:
//   still     m/s: slower than this over the ground a body stands in its `still` role.
//   shift     a gear is taken once the body moves at `shift` of that gear's own speed.
//   leap      m/s: leaving the ground rising, a body plays its `leap` role when moving faster than
//             this over the ground, its `jump` role otherwise.
//   landFall  m/s: touching down, a body plays its `land` role only when it was falling faster than
//             this.
//   moves     metres: a one-shot carries travel when it ends more than this from its start,
//   turns     degrees: or when it turns this far or further; turning less, its yaw column is zeroed.
//   kinds     `{ <kind>: { rig, model, fade, reads, aim, props } }`: the rig file (a loader `json`
//             entry) and the model (a loader `model` entry) each kind's rows play, `fade`, the
//             seconds a crossfade takes, and `reads`, the names of the fields of the kind's rows that
//             anim reads and whatever moves the body writes: `pos` (x, y, z metres), `yaw` (radians,
//             positive left), `vel` (x, y, z m/s, y up), `grounded` (false in the air) and `limp`
//             (true while something else owns the body). A row that carries none of one of them is at
//             the origin, facing 0, standing, on the ground and not limp. `reads.aim`, which a kind
//             may leave out, is the row's aim pitch in radians, positive up, and may be a dotted path
//             into the row's fields, `"look.pitch"` its `look`'s `pitch`. `aim` `{ bones: { <bone
//             suffix>: <share> } }` spreads that pitch over the bones it lists, and `props` `[{ model,
//             bone, at, turn }]` hangs loader models on bones: the browser half's, which draws both,
//             and nothing here reads them.
//
// The rig file:
//   bodies   `{ <model>: "<fbx>" }`, the rigged characters the rig's clips are baked onto, paths
//            under the library (`PATCHWORK_LIBRARY`, else ~/patchwork-library), each written, packed by
//            gltfpack, to the loader `model` entry of its name (`anim.export.py`). Nothing plays by it.
//   spread   `{ <model>: <degrees> }`, how far the bake swings that body's upper arms out from its
//            sides on every frame of every clip, for a body broader than the one the clips were
//            pulled on, whose arms would pass through it. Nothing plays by it.
//   size     times, 1 when left out: every body of the rig baked that many times its own size, its
//            `table` and `ends` measured on it (`anim.export.py`). Nothing plays by it.
//   clips    name to a file string, or to `{ file, loop, gear, markers, scale, rate, stance, mirror,
//            rebase }`. `file` is the clip's FBX under ~/troupe-collection and `rebase` `{ from, onto }`
//            moves it from the pose it was authored around (the first frame of the FBX `from`) to the
//            one clip `onto` starts in; both are the export's (`anim.export.py`), and nothing plays by
//            them.
//            `loop` laps the clip; without it the clip is a one-shot. `gear`, degrees (0 forward, 90
//            left), makes a loop a gear. `markers` are name to seconds, "peak" (the table's `peak`)
//            or "NN%" of the clip. `scale` multiplies the distance a one-shot carries (the turn is
//            kept whole), 1 when left out. `rate` multiplies the clip's playhead, 1 when left out.
//            `stance` is the stance the clip is a gear of; a gear with none is a gear of every
//            stance. `mirror: "<clip>"` makes this clip the named clip mirrored across the body's x:
//            every field of that clip's entry with this entry's own written over it, its gear the
//            named clip's negated (wrapped) unless this entry gives one, so a mirrored left strafe
//            is a right strafe, and its table row the named clip's with `left` and `yaw` negated,
//            travel rows too. A mirror of a mirror throws.
//   roles    anim's own moments to the role each plays: `still`, standing slower than `world.anim`'s
//            `still`; `jump` and `leap`, leaving the ground rising slower and faster than its
//            `leap`; `fall`, in the air, and after a `jump` or `leap` that ends there; `land`,
//            touching down faster than its `landFall`. A moment a body comes to that the rig names
//            no role for changes no clip: the body plays on in the clip it had.
//   stances  stance name to `{ role: clip }`, for the roles `roles` names and any other a game
//            plays itself; a role a stance does not name is the clip named after the role, so a
//            stance names only the roles it plays differently.
//   mask     the suffix of the bone the upper channel draws from, and every bone under it.
//   table    per clip, measured: `dur` (seconds), `forward` and `left` (metres at its end), `yaw`
//            (degrees at its end, positive left), `rise`, `height`, `low`, `peak` (seconds), and
//            `travel`, rows `[t, fwd, left, yawDeg]` every tenth of a second and at `dur`.
//   ends     per body, per clip, measured: `fps` and each segment's two ends on every frame, in the
//            body's frame (`anim.export.py`). `ends(w, me, segment, at?)` reads it (below); ragdoll3d
//            and dismember3d ask it, and nothing here draws by it.
//   meshes   role to a regular expression matched against a mesh's name (the browser half's).
//   show     stance to the roles it draws (the browser half's).
//
// A row that plays carries `state` (`loco` in its gears, `act` in a one-shot or loop it was told to
// play, `fall` in the air), `clip`, `clipT` (seconds into the clip), `rate`, `holds`, `cancel`,
// `blend`, `from`, `fromT`, `upper`, `upperT`, `upperW`, `was`, `wasT`, `wasW`, `sink` and `rig`, and
// reads the fields its kind's `reads` names. A row that gives no anim fields stands in the first
// stance's `still` role; `animate` writes each field it lacks.
//
// The row's `rig` is the stance it stands in: its gears, its roles and the meshes `show` draws. The
// rig file is the kind's `kinds.rig`. A game flips the stance by writing `rig`.
//
// `play(me, clip, { holds, rate })` starts a clip as an act: from 0, at the row's `rate` (1 when
// left out), committed while `holds` or before its `cancel` marker. `gesture(me, clip)` starts a
// clip on the upper channel. `committed(me)` is `holds || clipT < cancel`. The three take only the
// row, so they cannot read the rig: `animate` writes `cancel` (the clip's `cancel` marker, 0
// without one) each step, and `play` sets it to null, which counts as committed until `animate` has
// read it. `stop(me, w)` ends the act playing, as an act past its cancel gives way to the stick, or
// a loop played as an act, which no end releases, is let go: the body is back in its gears at once,
// at the start of their clip, even when it is the clip the act played, with the act fading out as
// `from` where it stood, and not committed. A body in its gears or in the air is left as it is.
// `rest(me)` puts every field a row plays by back as a row that has played nothing holds it, as a
// body that stands again from nothing (a respawn) needs: on the next `animate` it is in its stance's
// `still` role at full weight, with nothing fading and nothing on the upper channel. It leaves `rig`.
// `rigOf(from, kind)` is the rig file of a kind, off `world.anim`, for a rule handed its `w` or the
// browser half handed its `plugins.wire`. `clipOf(rig, name)` is a clip resolved: its entry,
// mirror and markers read, its table row, and a gear's speed. `roleOf(rig, stance, role)` is the
// clip a stance plays for a role, `momentOf(rig, stance, moment)` the clip it plays for one of
// anim's moments, through `roles`, and `stanceOf(rig, fields)` the stance a row stands in.
// `readsOf(from, kind)` is the kind's `reads`, off `world.anim`, and `numbersOf(from)` `world.anim`
// itself. `at(measure, t)` is the travel curve at t, and `carries(clip, numbers)` whether a
// clip carries travel and keeps its turn: what the browser half pins the hips by.
//
// `animate(me, w, dt)` runs one step and returns `{ markers, travel }`:
//   1. Airborne (`grounded` false) overrides everything. `sink` is written, the row's fall speed,
//      −vel[1], on every step in the air. Leaving the ground, a body rising plays `leap` when moving
//      faster than `leap` over the ground, `jump` otherwise, and one not rising plays `fall`; a jump
//      or leap that ends in the air goes on into `fall`. The gesture fades out as `was`: a jump drops
//      the strike, gently. Touching down after falling faster than `landFall` (read off `sink`, the
//      fall speed of its last step in the air, since a mover's landing step may set vel[1] from the
//      ground) plays `land` as an act that does not hold; slower, the body goes straight back to its
//      gears, so a step off a kerb does not commit it to a landing. Each is the role `roles` names
//      for that moment.
//   2. In its gears: slower than `still`, the stance's `still` role. Otherwise the gears of the stance, taken
//      by the nearest direction to the way the body moves against its facing, all ties kept, and of
//      those the fastest whose speed·`shift` is at or under the body's speed, or the slowest when
//      none is. A gear's speed is hypot(forward, left)/dur times the clip's own `rate`, and the
//      row's `rate` is speed/gear speed, so a playhead that moves at dt·(clip rate)·(row rate) keeps
//      the feet planted at any clip rate. A change of clip in the gears carries the playhead as a
//      fraction of the clip: carried in seconds, a 2.5 s stand into a 1.1 s walk lands past the walk's
//      end.
//   3. The playhead moves on dt·(the clip's `rate`)·(the row's `rate`). A marker at m fires when the
//      playhead goes from before m to m or past, a loop's lap included, so a marker at 0 fires on a
//      loop's lap and never on a one-shot. Markers are `{ name, clip, upper }`, in the order they are
//      crossed.
//   4. A one-shot carries travel when it moves more than `moves` or turns `turns` or more; loops
//      carry none, since their gear speed moves the body. The step's travel is the table's travel
//      between the step's first and last playhead, sampled linearly between rows, its yaw the short
//      way round, since a 180 turn's curve crosses ±180°. Its distance is times the clip's `scale`.
//      It is turned back by the curve's yaw at the step's first playhead, since the body has already
//      turned that far, and then by the row's `yaw`. Under `turns` the yaw column is zeroed, because
//      a roll's hips flip the measured facing, and nothing is turned by it. `travel` is
//      `{ move: [x, z], yaw }` in world metres and radians; the caller slides by `move` and then adds
//      `yaw`. Positive yaw is a turn left, the rig's own sign and the row's; yaw θ faces (sin θ,
//      cos θ), and left of it is (cos θ, −sin θ).
//   5. A one-shot releases on the step it reaches its end, after that step's markers: an act goes
//      back to its gears, which it enters at the start of their clip.
//   6. The upper channel has its own playhead, at the clip's own `rate`, never travels, and reports
//      its markers on the same list with `upper` true, the two channels' in the order they are crossed
//      within the step. It plays its clip once and lets it go at its end.
//   7. The crossfades are row fields, never a clock of the page's, so a seat that arrives late draws
//      the same fade. A change of the base clip keeps `from`/`fromT`, the last clip at full weight,
//      frozen at the playhead it had, and sets `blend`, the new clip's share, to 0; `blend` rises by
//      dt/`fade` a step. A row's first clip starts at full weight. On the upper channel `upperW` rises
//      by dt/`fade` and never above the gesture's own out-ramp over its last `fade` seconds, and a new
//      gesture hands the one it replaces to `was`/`wasT`/`wasW`, frozen at its playhead, whose weight
//      falls by dt/`fade` until it is let go.
// `animate` throws for a clip the rig does not hold. A `limp` row is not animated or moved: whatever
// made it limp owns it, and `animate` hands back no markers and no travel and writes nothing.
//
// It reads the rig file through the loader's `json`, as terrain3d and skydome3d read theirs, and
// imports no other plugin. A resolved clip is kept per rig file's `clips` and `table` objects, which
// the loader replaces whole when the file is written, so an edit is read on the next step.
import type { Row, W } from '#engine/engine.ts'
import type { Wire } from '#engine/browser.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

export type Entry = string | {
  file?: string; loop?: boolean; gear?: number; markers?: Record<string, number | string>
  scale?: number; rate?: number; stance?: string; mirror?: string; rebase?: { from: string; onto: string }
}
export type Measure = {
  frames?: number; dur: number; forward: number; left: number; yaw: number; rise?: number; height?: number; low?: number; peak?: number
  travel: number[][]
}
// anim's own moments, each played as the role the rig's `roles` names for it.
export type Moment = 'still' | 'jump' | 'leap' | 'fall' | 'land'
// The fields of a row anim reads, each the name the row carries it by; `aim` a dotted path.
export type Reads = { pos: string; yaw: string; vel: string; grounded: string; limp: string; aim?: string }
// A loader model hung on a bone of a kind's body (the browser half's).
export type Prop = { model: string; bone: string; at: number[]; turn: number[] }
export type Rig = {
  bodies?: Record<string, string>
  spread?: Record<string, number>
  size?: number
  clips: Record<string, Entry>
  roles: Partial<Record<Moment, string>>
  stances?: Record<string, Record<string, string>>
  mask?: string
  table: Record<string, Measure>
  ends?: Record<string, Record<string, { fps: number } & Record<string, number[][]>>>
  meshes?: Record<string, string>
  show?: Record<string, string[]>
}
export type Numbers = {
  still: number; shift: number; leap: number; landFall: number; moves: number; turns: number
  kinds: Record<string, { rig: string; model: string; fade: number; reads: Reads; aim?: { bones: Record<string, number> }; props?: Prop[] }>
}
export type Clip = {
  name: string
  source: string // the clip whose tracks it draws: its own name, or the clip it mirrors
  mirrored: boolean
  loop: boolean
  gear: number | undefined
  stance: string | undefined
  scale: number
  rate: number
  markers: { name: string; t: number }[] // by time
  dur: number
  measure: Measure
  speed: number // a gear's: metres a second at row rate 1
}
export type Marker = { name: string; clip: string; upper: boolean }
export type Travel = { move: number[]; yaw: number }

const DEG = Math.PI / 180
const TIE = 1e-9 // degrees: two gears this close to the way the body moves are equally near

// An angle in (−180, 180] degrees, or (−π, π] radians with `half` π.
const wrap = (a: number, half = 180) => a - 2 * half * Math.ceil((a - half) / (2 * half))

// ---------------------------------------------------------------- the rig file

const memo = new WeakMap<object, { table: object; clips: Map<string, Clip>; gears: Map<string, Clip[]> }>()
const cacheOf = (rig: Rig) => {
  let c = memo.get(rig.clips)
  if (!c || c.table !== rig.table) {
    c = { table: rig.table, clips: new Map(), gears: new Map() }
    memo.set(rig.clips, c)
  }
  return c
}

const entryOf = (rig: Rig, name: string) => {
  const e = rig.clips[name]
  if (e === undefined) throw new Error(`anim: the rig has no clip ${name}`)
  return typeof e === 'string' ? { file: e } : e
}

// A marker's time in the clip: seconds, "peak", or "NN%".
function timeOf(clip: string, marker: string, at: number | string, m: Measure): number {
  if (typeof at === 'number') return at
  if (at === 'peak') {
    if (m.peak === undefined) throw new Error(`anim: ${clip}'s marker ${marker} is at its peak, and its table row gives none`)
    return m.peak
  }
  const pct = /^(\d+(?:\.\d+)?)%$/.exec(at)
  if (!pct) throw new Error(`anim: ${clip}'s marker ${marker} is at ${at}, which is no seconds, "peak" or "NN%"`)
  return (Number(pct[1]) / 100) * m.dur
}

export function clipOf(rig: Rig, name: string): Clip {
  const cache = cacheOf(rig)
  const had = cache.clips.get(name)
  if (had) return had
  const own = entryOf(rig, name)
  let e = own, measure: Measure, gear: number | undefined
  if (own.mirror !== undefined) {
    const src = entryOf(rig, own.mirror)
    if (src.mirror !== undefined) throw new Error(`anim: ${name} mirrors ${own.mirror}, itself a mirror`)
    e = { ...src, ...own }
    const m = rig.table[own.mirror]
    if (!m) throw new Error(`anim: the rig's table has no row for ${own.mirror}`)
    measure = { ...m, left: -m.left, yaw: -m.yaw, travel: m.travel.map(([t, f, l, y]) => [t, f, -l, -y]) }
    gear = own.gear ?? (src.gear === undefined ? undefined : wrap(-src.gear))
  } else {
    const m = rig.table[name]
    if (!m) throw new Error(`anim: the rig's table has no row for ${name}`)
    measure = m
    gear = own.gear
  }
  if (!(measure.dur > 0)) throw new Error(`anim: ${name} lasts ${measure.dur} s`)
  const rate = e.rate ?? 1
  const loop = e.loop ?? false
  const speed = (math.hypot(measure.forward, measure.left) / measure.dur) * rate
  if (loop && gear !== undefined && !(speed > 0)) throw new Error(`anim: the gear ${name} travels nowhere`)
  const clip: Clip = {
    name,
    source: own.mirror ?? name,
    mirrored: own.mirror !== undefined,
    loop,
    gear,
    stance: e.stance,
    scale: e.scale ?? 1,
    rate,
    markers: Object.entries(e.markers ?? {}).map(([n, at]) => ({ name: n, t: timeOf(name, n, at, measure) })).sort((a, b) => a.t - b.t),
    dur: measure.dur,
    measure,
    speed,
  }
  cache.clips.set(name, clip)
  return clip
}

// The gears of a stance: its loops with a gear, and every stance's.
function gearsOf(rig: Rig, stance: string | undefined): Clip[] {
  const cache = cacheOf(rig)
  const key = stance ?? ''
  let g = cache.gears.get(key)
  if (!g) {
    g = Object.keys(rig.clips).map(n => clipOf(rig, n)).filter(c => c.loop && c.gear !== undefined && (c.stance === undefined || c.stance === stance))
    cache.gears.set(key, g)
  }
  return g
}

// The stance a row stands in: its `rig`, or the rig's first.
export const stanceOf = (rig: Rig, d: { rig?: string }) => d.rig ?? Object.keys(rig.stances ?? {})[0]

export const roleOf = (rig: Rig, stance: string | undefined, role: string) => (stance === undefined ? undefined : rig.stances?.[stance]?.[role]) ?? role

export function momentOf(rig: Rig, stance: string | undefined, moment: Moment): string | undefined {
  const role = rig.roles?.[moment]
  if (role === undefined) return undefined
  return roleOf(rig, stance, role)
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

// A one-shot's travel under `world.anim`: whether it carries any, and whether it keeps its turn.
export function carries(c: Clip, a: Pick<Numbers, 'moves' | 'turns'>): { carries: boolean; turns: boolean } {
  if (c.loop) return { carries: false, turns: false }
  const turns = Math.abs(wrap(c.measure.yaw)) >= a.turns
  return { carries: turns || math.hypot(c.measure.forward, c.measure.left) > a.moves, turns }
}

// `world.anim`, off a rule's `w` or the browser half's `plugins.wire`.
export const numbersOf = (from: W | Wire): Numbers => ('find' in from ? from.world : from.scene.world!).anim
const kindOf = (a: Numbers, kind: string) => {
  const k = a.kinds[kind]
  if (!k) throw new Error(`anim kinds has no ${kind}`)
  return k
}
const READS = ['pos', 'yaw', 'vel', 'grounded', 'limp'] as const
const readsIn = (a: Numbers, kind: string): Reads => {
  const r = kindOf(a, kind).reads
  const missing = READS.find(f => typeof r?.[f] !== 'string')
  if (missing) throw new Error(`anim kinds.${kind}.reads names no ${missing}`)
  if (r.aim !== undefined && typeof r.aim !== 'string') throw new Error(`anim kinds.${kind}.reads.aim is no field name`)
  return r
}

export const rigOf = (from: W | Wire, kind: string): Rig => json(from, kindOf(numbersOf(from), kind).rig)
export const readsOf = (from: W | Wire, kind: string): Reads => readsIn(numbersOf(from), kind)

// What a body's mover says of it, off the fields `reads` names.
const bodyOf = (d: any, r: Reads) => ({ vel: (d[r.vel] ?? [0, 0, 0]) as number[], yaw: (d[r.yaw] ?? 0) as number })

// Every field a row plays by, as a row that has played nothing holds it.
const FRESH = {
  state: 'loco', clip: null, clipT: 0, rate: 1, holds: false, blend: 1, from: null, fromT: 0,
  upper: null, upperT: 0, upperW: 0, was: null, wasT: 0, wasW: 0, sink: 0,
}

// Every field a row plays by, filled where it gives none.
function fill(d: any) {
  for (const [k, v] of Object.entries(FRESH)) d[k] ??= v
}

export function rest(me: Row) {
  Object.assign(me.data, FRESH)
  delete me.data.cancel
}

// The base clip becomes `clip`: the one at full weight is kept as `from`, and the new one fades in.
function change(d: any, clip: string | undefined) {
  if (clip === undefined) return
  if (d.clip == null) d.blend = 1
  else {
    if (d.blend >= 1) {
      d.from = d.clip
      d.fromT = d.clipT
    }
    d.blend = 0
  }
  d.clip = clip
}

// The gesture playing is handed to `was`, to fade out.
function drop(d: any) {
  if (d.upper == null) return
  d.was = d.upper
  d.wasT = d.upperT
  d.wasW = d.upperW
  d.upper = null
  d.upperT = 0
  d.upperW = 0
}

export function play(me: Row, clip: string, { holds, rate }: { holds?: boolean; rate?: number } = {}) {
  const d = me.data
  change(d, clip)
  d.state = 'act'
  d.clipT = 0
  d.holds = holds ?? false
  d.rate = rate ?? 1
  d.cancel = null
}

export function gesture(me: Row, clip: string) {
  const d = me.data
  drop(d)
  d.upper = clip
  d.upperT = 0
  d.upperW = 0
}

// The kind whose entry of `kinds` a row is animated by: the kind its `as` names, or its own. A seat's
// `player` row that is one of several bodies, an `xbot` or a `ybot`, names it in `as`.
export const animKind = (me: Row): string => (typeof me.data.as === 'string' ? me.data.as : me.kind)

// A segment's two ends in the body's frame (x its left, y up, z ahead), at `at`, a clip and its
// playhead, the row's own `clip` and `clipT` unless given: [ax, ay, az, bx, by, bz], off the rig's
// `ends` for the kind's `model`, the frame the playhead falls on, held within the clip's frames.
export function ends(w: W | Wire, me: Row, segment: string, at: { clip: string; clipT: number } = me.data as any): number[] {
  const kind = animKind(me)
  const body = numbersOf(w).kinds[kind].model
  const measured = rigOf(w, kind).ends?.[body]
  if (!measured) throw new Error(`anim: ${kind}'s rig has no ends for ${body}; bake it (anim.export.py)`)
  const clip = measured[at.clip]
  const rows = clip[segment] as number[][]
  return rows[Math.min(rows.length - 1, Math.max(0, Math.round(at.clipT * clip.fps)))]
}

export function stop(me: Row, w: W) {
  const d = me.data
  if (d.state !== 'act') return
  const rig = rigOf(w, animKind(me))
  const a = numbersOf(w)
  d.state = 'loco'
  d.holds = false
  gear(d, rig, stanceOf(rig, d), a, bodyOf(d, readsIn(a, animKind(me))), false)
  d.cancel = 0
}

export const committed = (me: Row) => {
  const d = me.data
  return !!d.holds || d.cancel === null || (d.cancel !== undefined && d.clipT < d.cancel)
}

// The body's clip in its gears, and its rate. A new clip takes the fraction of the last one's playhead
// when `carry`; otherwise the clip starts at 0, the same one too.
function gear(d: any, rig: Rig, stance: string | undefined, a: Numbers, { vel, yaw }: { vel: number[]; yaw: number }, carry = true) {
  const speed = math.hypot(vel[0], vel[2])
  const gears = speed < a.still ? [] : gearsOf(rig, stance)
  let pick: string | undefined, rate = 1
  if (!gears.length) pick = momentOf(rig, stance, 'still')
  else {
    const f = vel[0] * math.sin(yaw) + vel[2] * math.cos(yaw)
    const l = vel[0] * math.cos(yaw) - vel[2] * math.sin(yaw)
    const dir = math.atan2(l, f) / DEG
    const off = (g: Clip) => Math.abs(wrap(g.gear! - dir))
    const best = Math.min(...gears.map(off))
    const near = gears.filter(g => off(g) - best <= TIE)
    const fits = near.filter(g => g.speed * a.shift <= speed)
    const g = fits.length ? fits.reduce((x, y) => (y.speed > x.speed ? y : x)) : near.reduce((x, y) => (y.speed < x.speed ? y : x))
    pick = g.name
    rate = speed / g.speed
  }
  if (pick === undefined) return
  if (pick !== d.clip || !carry) {
    const frac = d.clip == null || !carry ? 0 : (d.clipT / clipOf(rig, d.clip).dur) % 1
    change(d, pick)
    d.clipT = frac * clipOf(rig, pick).dur
  }
  d.rate = rate
}

// Moves a playhead from t0 by `by` seconds of clip, reporting each marker it crosses; a one-shot
// stops at its end.
// Each marker crossed goes on `crossed` with how far through the step it was crossed.
function advance(c: Clip, t0: number, by: number, upper: boolean, crossed: [number, Marker][]): { t: number; ended: boolean } {
  const reached = t0 + by
  if (!c.loop) {
    const t = Math.min(c.dur, reached)
    for (const m of c.markers) if (t0 < m.t && m.t <= t) crossed.push([(m.t - t0) / by, { name: m.name, clip: c.name, upper }])
    return { t, ended: t >= c.dur }
  }
  for (let lap = 0; lap * c.dur <= reached; lap++) {
    for (const m of c.markers) {
      const at = m.t + lap * c.dur
      if (t0 < at && at <= reached) crossed.push([(at - t0) / by, { name: m.name, clip: c.name, upper }])
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
  const a = numbersOf(w)
  const reads = readsIn(a, animKind(me))
  if (d[reads.limp]) return { markers: [], travel }
  const { fade } = kindOf(a, animKind(me))
  const rig = rigOf(w, animKind(me))
  const stance = stanceOf(rig, d)
  const per = (s: number) => (fade > 0 ? s / fade : Infinity)
  fill(d)

  const body = bodyOf(d, reads)
  const { vel } = body
  if (d[reads.grounded] === false) {
    d.sink = -vel[1]
    const air = momentOf(rig, stance, vel[1] > 0 ? (math.hypot(vel[0], vel[2]) > a.leap ? 'leap' : 'jump') : 'fall')
    if (d.state !== 'fall' && air !== undefined) {
      change(d, air)
      d.state = 'fall'
      d.clipT = 0
      d.rate = 1
      d.holds = false
      drop(d)
    }
  } else if (d.state === 'fall') {
    const land = momentOf(rig, stance, 'land')
    if (d.sink > a.landFall && land !== undefined) {
      change(d, land)
      d.state = 'act'
      d.clipT = 0
      d.rate = 1
      d.holds = false
    } else d.state = 'loco'
  }
  if (d.state === 'loco') gear(d, rig, stance, a, body)
  if (d.clip == null) return { markers: [], travel }

  const c = clipOf(rig, d.clip)
  const t0 = d.clipT
  const moved = advance(c, t0, dt * c.rate * d.rate, false, crossed)
  d.clipT = moved.t
  if (d.state !== 'loco') {
    const how = carries(c, a)
    if (how.carries) Object.assign(travel, travelOf(c, t0, moved.t, body.yaw, how.turns))
  }
  if (moved.ended) {
    const fall = momentOf(rig, stance, 'fall')
    if (d.state === 'fall' && fall !== undefined) {
      change(d, fall)
      d.clipT = 0
    } else {
      d.state = 'loco'
      d.holds = false
      gear(d, rig, stance, a, body)
    }
  }
  d.cancel = clipOf(rig, d.clip).markers.find(m => m.name === 'cancel')?.t ?? 0

  if (d.upper != null) {
    const u = clipOf(rig, d.upper)
    const went = advance({ ...u, loop: false }, d.upperT, dt * u.rate, true, crossed)
    d.upperT = went.t
    if (went.ended) {
      d.upper = null
      d.upperT = 0
      d.upperW = 0
    } else d.upperW = Math.min(1, d.upperW + per(dt), per(u.dur - went.t))
  }
  if (d.was != null) {
    d.wasW -= per(dt)
    if (!(d.wasW > 0)) {
      d.was = null
      d.wasT = 0
      d.wasW = 0
    }
  }
  d.blend = Math.min(1, d.blend + per(dt))
  return { markers: crossed.sort((a, b) => a[0] - b[0]).map(([, m]) => m), travel }
}
