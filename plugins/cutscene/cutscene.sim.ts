// The server half of the cutscene: a scene played from a cue file, by one row that keeps its clocks
// and directs the rows it casts. The browser half (`cutscene.plugin.ts`) draws what the row says: the
// camera during a shot, the bars, the veil and the line.
//
// Kinds. `cutscene` is the playhead row. Its numbers are fixed, so no row carries them: they are the
// scene's `world.cutscene`, which a child scene inherits from the manager's (`addons/scenemanager`):
// `script`, the loader `json` entry of its cue file, `kinds`, the kinds a cast member may be, `settle`,
// the seconds of each quiet stretch a skip steps the cast through, `tremor`, the shake's
// `[weight, rate]` on x, y and z, and `mods`, the scene's mods for it (`addons/scenemanager`): `play`,
// what sounds a cue (below), and `land`, the browser half's ground (below). The row carries only what
// changes (below), so its prefab is `{}`. A scene holds one, and its `before` throws when it holds
// more. `mark` is `{ name, at }`, a named spot, `at` a point (below), which does nothing.
//
// The ground. Everything the cutscene places stands on the scene's ground: a point is `[x, z]`, on
// the ground there, or `[x, up, z]`, `up` metres above it, and its height is the ground's as it is
// now, so ground raised under a mark or a shot raises the mark and the camera with it. The ground is
// handed in, never imported. The server half is `cutscene(height)`, the kind built from the ground's
// height over a truth, `height(w, x, z)`, which a game passes from its ground plugin's server half
// (terrain3d's `heightAt`). The browser half stands on the ground the scene's `land` mod hands it
// (terrain3d's `terrain3d.cutscene.ts`), `cutscene.plugin.ts`'s `Land`, and places nothing while that mod has no ground yet; a
// scene that names no `land` is flat at height 0, and its sim passes `() => 0`.
// `placed(p, height)` is the world point of a point, and `rooted(q, height)` the point `[x, up, z]` of
// a world point q.
//
// The cue file:
//   end, go?, arrive?   the cue clock's end, and the scene every seat's body goes to then, with the
//                       arguments it arrives with.
//   auto?               true starts the scene on the row's first step.
//   reach, stop         metres: a walk to a cast member is done within `reach` of it, and a walk to a
//                       mark or a point within `stop`.
//   head                metres: a cast member's head above its feet, where a shot looks at it.
//   fov, pace, limit    a shot's fov when the cue gives none, the m/s a walk with no gear is walked
//                       at, and the seconds after which a walk that gives no `limit` is done.
//   cast                name to `{ kind, name }`: the first row of that kind whose `name` is that name.
//   cues                each `{ at, do, ... }`, `at` on the cue clock.
// `check(name, file)` throws a sentence naming the file and the cue for a file it cannot play: every
// number above is required, and each cue's fields by its `do` (`CUES`, each field's rule one of
// `RULES`, which the editor holds a call's fields to as well):
//   play     who, clip, holds, rate      a whole-body clip, `direct.play` on the member
//   gesture  who, clip                   an upper-body clip, `direct.gesture`
//   walk     who, to, gear, limit?       walked to `to`, `direct.walk`; `gear` a clip or null for
//                                        `pace`
//   face     who, to | null              the facing held while not walking, `direct.face`; null
//                                        lets go; it does not stop a walk
//   say      who, text, for, voice?      the one line, for `for` seconds of e; `voice` is a cue
//                                        raised from the speaker with it
//   wait     who | "line"                holds the cue clock until that member's walk is done or the
//                                        line has gone
//   shot     name, pos, look, fov?, over, follows?, frame?
//                                        a cut when `over` is 0, else a dolly from the pose drawn;
//                                        with `follows` a cast member, `pos` is an offset [x, y, z]
//                                        from its feet in the world's axes, or with `frame: "body"`
//                                        in its own: z forward, x its left, y up, turned by its yaw
//   fade     to (0 clear … 1 black), over
//   bars     on, over                    the letterbox in (1) or out (0)
//   shake    over, amp                   position jitter decaying to nothing
//   sound    cue, where? | who?          a ledger entry at `where`, or from the member
//   music    name | ""                   the row's `music`, null for ""
//   prepare  where                       the land made ready at `where`, ahead of a cut there: the
//                                        row's `prepare` is set to its ground point [x, z], which the
//                                        browser half hands the land (`cutscene.plugin.ts`)
// It refuses a first shot, in `at` order, with an `over`, since before it the camera is not the
// cutscene's; a `frame` on a shot that follows nobody; a following shot whose `pos` is not an offset;
// a sound with both `where` and `who`; and a cast member named `line`, which a wait would name.
//
// A target (`to`, `pos`, `look`, `where`) is a cast name, a mark's name, or a point `[x, z]` or
// `[x, up, z]` on the ground (above). A name is a cast member's before a mark's, looked up
// as own keys, so a mark named `constructor` is a mark. A cast member is its feet for a walk, a face
// and a sound, and its head, `head` above its feet, for a shot's `pos` and `look`.
//
// The row. `t` is the cue clock and `e` the elapsed time; `fired`, how many cues in `at` order have
// fired; `wait { cue, since }`; `line { who, text, until }`; `shot { from, to, at, over }`, `fade`
// and `bars { from, to, at, over }`, `shake { at, over, amp }`; `music`; `walks { who: { cue, since
// } }` and `faces { who: cue }`; `cast { name: id }`; `prepare`, the last prepare's [x, z] or null;
// `running`, `skip` and `done`. `cue` in `wait`,
// `walks` and `faces` is the cue's place in the file as written, and its target is read from there
// again every step, so a walk or a face toward a cast member follows it. `at` in the ramps and
// `since` are values of `e`. `shot.to` is the cue's view with `fov` (the cue's or the file's) and
// `head` filled in, and `shot.from` the pose drawn when it fired, before any shake: null for the first
// shot, or when that pose could not be drawn. The row's `before` writes every field it lacks.
//
// The cast. When the scene starts each member is matched to its row, and the match is the row's
// `cast`, which the browser half reads. A member whose kind `kinds` does not name, whose
// row is missing, or whose row is listed ahead of the cutscene row throws. Rows are only ever added
// at the end, so a row listed ahead has the lower id. Every name a cue places something at (`to`,
// `pos`, `look`, `where`) that is neither a cast member nor a mark (`strangers`) throws `no cast
// member or mark is named X`, naming the cue, so a misspelt name fails at the start. A member whose row ends mid-scene
// is passed over: its cues do nothing, a wait on it passes, a walk to it ends, a face toward it lets
// go, and a shot on it is not drawn.
//
// The contract of a cast kind. It carries `name`, and obeys `direct { walk?, face?, play?, gesture? }`
// in its `tick`: `walk { to: [x, z], gear, stop, pace }` it seeks by walker's `seek`, at the gear
// clip's speed, or at `pace` when `gear` is null; `face [x, z]` it turns toward while not walking;
// `play { clip, holds, rate }` and `gesture` (a clip) it starts once and deletes, and deletes unplayed
// a clip its rig lacks. It ignores its player's stick while `direct` is set: `{}` from the start and
// null at the end. Its act `advance(dt)` runs exactly its own step, and its act `go(scene,
// ...arrive)` moves the seat whose body it is through scenemanager and does nothing on a row that is
// no seat's body. The cutscene calls both from `before`, which has no seat, handing them seat −1.
// Its step reads no other cast member's fields, so the order the cast steps in changes nothing.
//
// Two clocks. `e` always advances: shots, fades, bars, shakes and lines run on it, so a dolly keeps
// moving through a wait. `t` advances unless a wait holds it. A cue fires on the first step `t`
// reaches its `at`, in `at` order, cues with one `at` in the order written. A wait reached with
// nothing to wait for passes at once. Otherwise `t` is set back to the wait's `at`, and the step's
// later cues are left unfired; on the step it lets go `t` stays at its `at` and the cues held behind
// it fire. So `e − t` is the time every wait so far has held, and every later cue shifts by exactly
// the hold. Both clocks are sums of steps, so a clock reaches a time within a nanosecond of it
// (TOLERANCE), and 30 steps of 1/60 reach 0.5.
//
// The row works in `before`, so the cast obeys `direct` in the same step's `tick`; the audio
// ledger's actor is listed ahead of it, so its sounds are stamped with their own step. Each step:
// `e` moves on and the line expires; each walk is judged, done within its stop, or `limit` seconds
// after it began, and otherwise its target read again; each held face is read again; then the cue
// clock; then, at `t ≥ end` with no wait holding it, the end. Fades and bars ramp straight from
// where they stood when they fired to `to` over `over` (`level`).
//
// Start and end. The act `start`, which is closed so only the game's rule calls it, or `auto`, starts
// the scene; so does the row's `starts`, true, on the first step every cast member's row is there,
// which the editor sets through its recorder to play a scene whatever the game's rule does: the cast matched, `direct` `{}` on each member, the clocks at 0. It does nothing while
// the scene runs or once it is done, so a scene plays once. The act `reset`, closed too, puts the row
// back as it stood before it ever started, wherever it is: a scene that runs stops where it is, its
// cast's `direct` null, and every clock, ramp, shot, line, walk, face and wait cleared, `running`,
// `skip` and `done` false, so the next `start` plays it again from its first cue, matching its cast
// again, a cast whose rows have changed since among them. A game that plays one scene before every
// round or every match resets it and starts it in one step. The act `skip` is open, so any seat skips
// the scene for every seat; it sets `skip` while the scene runs and is not kept before it starts. On
// the next step the row plays the scene through to its end inside its `before`: its own step, then
// `advance(dt)` on every cast member, and that engine step's own passes are then the cast's last step.
// It steps every step while a walk runs, and `settle` seconds of steps of each quiet stretch: the
// steps after the last one a cue fired on or a walk ran, up to the next cue, the line going while a
// wait holds on it, or the end. The rest of a quiet stretch it leaps: `t` and `e` move on by whole
// steps to one step short of that next thing, and the cast is not stepped. So a skip costs at most
// every walk's steps, and a step and `settle` seconds of steps for each step cues fire on, however
// long the scene runs. A scene whose quiet stretches all fit in `settle` leaves the cast and the row
// exactly where a played one would, but for `skip`; a longer one leaves the cast as it stood
// `settle` seconds into each, and the row's clocks, and every time on it, within a nanosecond of a
// played one's. Walks that can never arrive end at their limit. No sound or voice is raised while it
// plays through, and `music` is set as played. `longest(file)` is the most seconds of `e` a file can
// play: its `end`, and at each wait the longest it can hold, a walk's limit or a line's `for`.
// At the end the row is `done`, the line and every walk, face and wait are cleared, `direct` is null
// on the cast, so control returns, and with `go` every row of the kinds `kinds` names is sent
// `go(go, ...arrive)`, after a skip too.
//
// The pose. `pose(d, rows, height)` is the camera the row's shot draws, before any shake, from the
// row, the rows as they stand (the cast's and the marks') and the ground: the view's point and look
// resolved and aimed with world up; during a dolly, smoothstep k²(3 − 2k) of k = (e − at)/over from
// `from`, the position lerped, the orientation slerped and the fov lerped. It is undefined with no
// shot, or while a member the view names has no row. `shaken(d, tremor)` is the shake's offset, amp·(1 − (e
// − at)/over)·(weight·sin rate·e) on each axis, on e. The row fires a shot with `from` the pose at
// the step's `e` over the rows as the step found them, so a dolly starts from where the last shot's
// camera is at that `e`.
//
// The sound. A `sound` cue, and a `say` with a `voice`, are sounded by the scene's `play` mod,
// `Play`: `play(w, cue, at?, from?)`, the cue at the point `at`, or from the row `from`, or with no
// place given neither, which audio's (`audio.cutscene.ts`) raises on its ledger. A scene that names no
// `play` plays no sound: its cues fire, and nothing is heard.
//
// It imports no other plugin but the loader's `json`, which the cue file is read through.
import type { Arg, Kind, Row, W } from '#engine/engine.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'

type Target = string | number[]
export type Cue = { at: number; do: string; [field: string]: any }
export type Script = {
  end: number; go?: string; arrive?: Arg[]; auto?: boolean
  reach: number; stop: number; head: number; fov: number; pace: number; limit: number
  cast: Record<string, { kind: string; name: string }>
  cues: Cue[]
}
export type Ramp = { from: number; to: number; at: number; over: number }
export type Pose = { pos: number[]; quat: number[]; fov: number }
export type View = { pos: Target; look: Target; fov: number; head: number; follows?: string; frame?: 'body' | 'world' }
export type Height = (x: number, z: number) => number
// The scene's `world.cutscene`.
export type Numbers = { script: string; kinds: string[]; settle: number; tremor: number[][] }
// The `play` mod: what sounds a cue, at a point, from a row, or with no place.
export type Play = (w: W, cue: string, at?: number[], from?: number) => void

const TOLERANCE = 1e-9

// ---------------------------------------------------------------- check

// A rule of `check`'s: whether a value keeps it, in a file, what a value that keeps it is, and, for a
// rule of names, the names of the file that keep it.
type Rule = [(v: any, file: Script) => boolean, string, ((file: Script) => string[])?]
const finite = (v: any) => typeof v === 'number' && Number.isFinite(v)
const point = (v: any) => Array.isArray(v) && (v.length === 2 || v.length === 3) && v.every(finite)
const target = (v: any) => typeof v === 'string' || point(v)
const member = (v: any, f: Script) => typeof v === 'string' && Object.hasOwn(f.cast, v)
export const RULES: Record<string, Rule> = {
  number: [v => finite(v) && v >= 0, 'a number at or above 0'],
  positive: [v => finite(v) && v > 0, 'a number above 0'],
  finite: [finite, 'a number'],
  unit: [v => finite(v) && v >= 0 && v <= 1, 'a number from 0 to 1'],
  angle: [v => finite(v) && v > 0 && v < 180, 'a number of degrees between 0 and 180'],
  flag: [v => typeof v === 'boolean', 'true or false'],
  text: [v => typeof v === 'string', 'a string'],
  clip: [v => typeof v === 'string' || v === null, 'a clip or null'],
  who: [member, 'a cast member', f => Object.keys(f.cast)],
  waited: [(v, f) => v === 'line' || member(v, f), 'a cast member or "line"', f => [...Object.keys(f.cast), 'line']],
  target: [target, 'a name, [x, z] or [x, up, z]'],
  facing: [v => v === null || target(v), 'a name, [x, z], [x, up, z] or null'],
  frame: [v => v === 'body' || v === 'world', '"body" or "world"'],
  args: [v => Array.isArray(v) && v.every(a => a === null || ['number', 'string', 'boolean'].includes(typeof a)), 'a list of numbers, strings, true, false and null'],
}
// Each cue's fields by its `do`; a rule ending in `?` may be left out.
export const CUES: Record<string, Record<string, string>> = {
  play: { who: 'who', clip: 'text', holds: 'flag', rate: 'positive' },
  gesture: { who: 'who', clip: 'text' },
  walk: { who: 'who', to: 'target', gear: 'clip', limit: 'positive?' },
  face: { who: 'who', to: 'facing' },
  say: { who: 'who', text: 'text', for: 'positive', voice: 'text?' },
  wait: { who: 'waited' },
  shot: { name: 'text', pos: 'target', look: 'target', fov: 'angle?', over: 'number', follows: 'who?', frame: 'frame?' },
  fade: { to: 'unit', over: 'number' },
  bars: { on: 'flag', over: 'number' },
  shake: { over: 'positive', amp: 'number' },
  sound: { cue: 'text', where: 'target?', who: 'who?' },
  music: { name: 'text' },
  prepare: { where: 'target' },
}
const FILE: Record<string, string> = {
  end: 'number', reach: 'number', stop: 'number', head: 'finite', fov: 'angle', pace: 'positive', limit: 'positive',
  go: 'text?', arrive: 'args?', auto: 'flag?',
}

// What a value that keeps `rule` in `file` is, the names that keep it listed.
export const said = ([, what, names]: Rule, file: Script) => (names ? `${what}: ${names(file).join(', ')}` : what)

// The cues' places in the file, stable-sorted by `at`: the order they fire in.
export const sorted = (cues: Cue[]) => cues.map((_, i) => i).sort((a, b) => cues[a].at - cues[b].at || a - b)

// Throws a sentence naming the file, and the cue, for a file the row cannot play.
export function check(name: string, file: Script) {
  const fields = (of: Record<string, any>, rules: Record<string, string>, where: string) => {
    for (const [field, spec] of Object.entries(rules)) {
      const optional = spec.endsWith('?')
      const rule = RULES[optional ? spec.slice(0, -1) : spec]
      const v = of[field]
      if (optional && v === undefined) continue
      if (!rule[0](v, file)) throw new Error(`${where}${field} ${JSON.stringify(v)} is not ${said(rule, file)}`)
    }
  }
  fields(file, FILE, `${name}: `)
  if (!file.cast || typeof file.cast !== 'object') throw new Error(`${name}: cast is not a table of cast members`)
  for (const [who, m] of Object.entries(file.cast)) {
    if (typeof m?.kind !== 'string' || typeof m?.name !== 'string') throw new Error(`${name}: the cast member ${who} is not { kind, name }`)
  }
  if (Object.hasOwn(file.cast, 'line')) throw new Error(`${name}: a cast member named line, which a wait on the line would name`)
  if (!Array.isArray(file.cues)) throw new Error(`${name}: cues is not a list`)
  file.cues.forEach((c, i) => {
    const where = `${name}: cue ${i} (${c?.do} at ${c?.at}): `
    if (!c || typeof c !== 'object') throw new Error(`${where}is not { at, do, ... }`)
    fields(c, { at: 'number' }, where)
    const rules = Object.hasOwn(CUES, c.do) ? CUES[c.do] : undefined
    if (!rules) throw new Error(`${where}${c.do} is not a cue`)
    fields(c, rules, where)
    if (c.do === 'shot' && c.frame !== undefined && c.follows === undefined) throw new Error(`${where}a frame with no follows`)
    if (c.do === 'shot' && c.follows !== undefined && !(Array.isArray(c.pos) && c.pos.length === 3)) {
      throw new Error(`${where}pos ${JSON.stringify(c.pos)} is not an offset [x, y, z] from the member it follows`)
    }
    if (c.do === 'sound' && c.where !== undefined && c.who !== undefined) throw new Error(`${where}both where and who`)
  })
  const first = sorted(file.cues).find(i => file.cues[i].do === 'shot')
  if (first !== undefined && file.cues[first].over !== 0) {
    const c = file.cues[first]
    throw new Error(`${name}: cue ${first} (shot at ${c.at}): the first shot has an over, and before it the camera is not the cutscene's`)
  }
}

// The file a row plays, checked, and its cues in `at` order: kept per `cues` list. The loader parses a
// file once, and when the editor writes it refills that parse in place with a new value for every
// top-level field, so a written file brings a new `cues` list and is checked again.
const read = new WeakMap<object, number[]>()
function scriptOf(w: W, name: string): { file: Script; order: number[] } {
  const file = json(w, name) as Script
  let order = read.get(file.cues)
  if (!order) {
    check(name, file)
    order = sorted(file.cues)
    read.set(file.cues, order)
  }
  return { file, order }
}

// ---------------------------------------------------------------- targets and the pose

export const placed = (p: number[], height: Height) =>
  p.length === 2 ? [p[0], height(p[0], p[1]), p[1]] : [p[0], height(p[0], p[2]) + p[1], p[2]]
export const rooted = (q: number[], height: Height) => [q[0], q[1] - height(q[0], q[2]), q[2]]
const castRow = (cast: Record<string, number>, name: string, rows: Row[]) => rows.find(r => r.id === cast[name])
const markOf = (t: string, rows: Row[]) => rows.find(r => r.kind === 'mark' && r.data.name === t)

// Where a target stands, or undefined while a member it names has no row: a cast member's feet, or
// its head `head` above them, a mark's point, or a point, on the ground.
function spot(t: Target, cast: Record<string, number>, rows: Row[], height: Height, head = 0): number[] | undefined {
  if (typeof t !== 'string') return placed(t, height)
  if (Object.hasOwn(cast, t)) {
    const r = castRow(cast, t, rows)
    return r && [r.data.pos[0], r.data.pos[1] + head, r.data.pos[2]]
  }
  const m = markOf(t, rows)
  return m && placed(m.data.at, height)
}
// Where on the ground a target stands, [x, z], which a walk and a face need and no height.
function ground(t: Target, cast: Record<string, number>, rows: Row[]): number[] | undefined {
  if (typeof t !== 'string') return [t[0], t[t.length - 1]]
  if (Object.hasOwn(cast, t)) {
    const r = castRow(cast, t, rows)
    return r && [r.data.pos[0], r.data.pos[2]]
  }
  const at = markOf(t, rows)?.data.at
  return at && [at[0], at[at.length - 1]]
}

// The orientation of a camera at `eye` looking at `to` with world up, as a quaternion [x, y, z, w]:
// its −z toward `to`, its x level.
function aim(eye: number[], to: number[]): number[] {
  let z = [eye[0] - to[0], eye[1] - to[1], eye[2] - to[2]]
  if (math.hypot(...z) === 0) z = [0, 0, 1]
  if (math.hypot(z[0], z[2]) === 0) z = [z[0], z[1], z[2] + 1e-4] // straight up or down: nudged off the vertical
  const zl = math.hypot(...z)
  z = z.map(v => v / zl)
  // x = up × z, y = z × x
  const xl = math.hypot(z[2], z[0])
  const x = [z[2] / xl, 0, -z[0] / xl]
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]
  const [m11, m12, m13, m21, m22, m23, m31, m32, m33] = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]
  const trace = m11 + m22 + m33
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s]
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33)
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s]
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33)
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s]
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22)
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s]
}

// The short way from a to b, u of the way.
function slerp(a: number[], b: number[], u: number): number[] {
  let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  const sign = cos < 0 ? -1 : 1
  cos *= sign
  if (cos > 1 - 1e-9) {
    const q = a.map((v, i) => v + (sign * b[i] - v) * u)
    const l = math.hypot(...q)
    return q.map(v => v / l)
  }
  const th = math.acos(cos), sin = math.sin(th)
  const wa = math.sin((1 - u) * th) / sin, wb = (sign * math.sin(u * th)) / sin
  return a.map((v, i) => wa * v + wb * b[i])
}

// The camera a shot's view is, from the rows as they stand and the ground, or undefined while a member
// it names has no row.
export function view(to: View, cast: Record<string, number>, rows: Row[], height: Height): Pose | undefined {
  let pos: number[] | undefined
  if (to.follows !== undefined) {
    const r = castRow(cast, to.follows, rows)
    if (!r) return
    const [x, y, z] = to.pos as number[]
    const [fx, fy, fz] = r.data.pos
    if (to.frame === 'body') {
      const c = math.cos(r.data.yaw), s = math.sin(r.data.yaw)
      pos = [fx + x * c + z * s, fy + y, fz - x * s + z * c]
    } else pos = [fx + x, fy + y, fz + z]
  } else pos = spot(to.pos, cast, rows, height, to.head)
  const look = spot(to.look, cast, rows, height, to.head)
  if (!pos || !look) return
  return { pos, quat: aim(pos, look), fov: to.fov }
}

// The camera the row's shot draws at its `e`, before any shake.
export function pose(d: any, rows: Row[], height: Height): Pose | undefined {
  const shot = d.shot
  if (!shot) return
  const to = view(shot.to, d.cast, rows, height)
  if (!to || !shot.from || !(shot.over > 0)) return to
  const k = (d.e - shot.at) / shot.over
  if (k >= 1) return to
  const s = k * k * (3 - 2 * k), from: Pose = shot.from
  return {
    pos: from.pos.map((p, i) => p + (to.pos[i] - p) * s),
    quat: slerp(from.quat, to.quat, s),
    fov: from.fov + (to.fov - from.fov) * s,
  }
}

// The shake's offset at the row's `e`: [x, y, z].
export function shaken(d: any, tremor: number[][]): number[] {
  const sh = d.shake
  const k = sh ? (d.e - sh.at) / sh.over : 1
  if (k >= 1) return [0, 0, 0]
  return tremor.map(([weight, rate]) => sh.amp * (1 - k) * weight * math.sin(rate * d.e))
}

// Where a fade or the bars stand at `e`: straight from `from` to `to` over `over`; 0 before any.
export function level(r: Ramp | null, e: number): number {
  if (!r) return 0
  if (!(r.over > 0)) return r.to
  return r.from + (r.to - r.from) * Math.min(1, (e - r.at) / r.over)
}

// ---------------------------------------------------------------- the row

function fill(d: any) {
  d.t ??= 0
  d.e ??= 0
  d.fired ??= 0
  d.wait ??= null
  d.line ??= null
  d.shot ??= null
  d.fade ??= null
  d.bars ??= null
  d.shake ??= null
  d.music ??= null
  d.prepare ??= null
  d.walks ??= {}
  d.faces ??= {}
  d.cast ??= {}
  d.running ??= false
  d.skip ??= false
  d.done ??= false
}

// The rows a target is looked for in: the cast kinds' and the marks'.
const rowsOf = (w: W): Row[] => [...(w.world.cutscene as Numbers).kinds.flatMap(k => w.all(k)), ...w.all('mark')]

// Every name a cue places something at (`to`, `where`, `look`, and the `pos` of a shot that follows
// nobody) that is neither a cast member of the file nor one of `marks`: the cue's place in the file,
// the field and the name.
export function strangers(file: Script, marks: Iterable<string>): { cue: number; field: string; name: string }[] {
  const known = new Set(marks)
  const out: { cue: number; field: string; name: string }[] = []
  file.cues.forEach((c, i) => {
    for (const field of ['to', 'where', 'look', ...(c.follows === undefined ? ['pos'] : [])]) {
      const t = c[field]
      if (typeof t === 'string' && !Object.hasOwn(file.cast, t) && !known.has(t)) out.push({ cue: i, field, name: t })
    }
  })
  return out
}

// Whether every cast member of the file has its row.
const present = (file: Script, w: W) => Object.values(file.cast).every(m => w.all(m.kind).some(r => r.data.name === m.name))

function begin(me: Row, w: W) {
  const d = me.data
  fill(d)
  if (d.running || d.done) return
  const { script, kinds } = w.world.cutscene as Numbers
  const { file } = scriptOf(w, script)
  const cast: Record<string, number> = {}
  for (const [name, m] of Object.entries(file.cast)) {
    if (!kinds.includes(m.kind)) throw new Error(`the cast member ${name} is a ${m.kind}, which the cutscene's kinds do not name`)
    const r = w.all(m.kind).find(r => r.data.name === m.name)
    if (!r) throw new Error(`no ${m.kind} row is named ${m.name}, for the cast member ${name}`)
    if (r.id < me.id) throw new Error(`the cast member ${name} is listed ahead of the cutscene row, so its step would run before the row directs it`)
    cast[name] = r.id
  }
  const stranger = strangers(file, w.all('mark').map(r => r.data.name))[0]
  if (stranger) {
    const c = file.cues[stranger.cue]
    throw new Error(`${script}: cue ${stranger.cue} (${c.do} at ${c.at}): no cast member or mark is named ${stranger.name}`)
  }
  Object.assign(d, { cast, t: 0, e: 0, fired: 0, wait: null, line: null, shot: null, fade: null, bars: null, shake: null, prepare: null, walks: {}, faces: {}, running: true, skip: false })
  for (const id of Object.values(cast)) w.get(id).data.direct = {}
}

// A sound or a voice, through the scene's `play` mod; none when it names none.
const raise = (w: W, cue: string, at?: number[], from?: number) => mod<Play>(w.world, 'cutscene', 'play')?.(w, cue, at, from)

function fire(me: Row, w: W, file: Script, c: Cue, i: number, loud: boolean, rows: Row[], height: Height) {
  const d = me.data
  const who = c.who !== undefined && c.who !== 'line' ? castRow(d.cast, c.who, rows) : undefined
  if (c.who !== undefined && c.who !== 'line' && !who) return
  const direct = who?.data.direct
  switch (c.do) {
    case 'play': direct.play = { clip: c.clip, holds: c.holds, rate: c.rate }; return
    case 'gesture': direct.gesture = c.clip; return
    case 'walk': {
      const to = ground(c.to, d.cast, rows)
      if (!to) return
      d.walks[c.who] = { cue: i, since: d.e }
      direct.walk = { to, gear: c.gear, stop: typeof c.to === 'string' && Object.hasOwn(d.cast, c.to) ? file.reach : file.stop, pace: file.pace }
      return
    }
    case 'face': {
      const to = c.to === null ? undefined : ground(c.to, d.cast, rows)
      if (!to) {
        delete d.faces[c.who]
        delete direct.face
        return
      }
      d.faces[c.who] = i
      direct.face = to
      return
    }
    case 'say':
      d.line = { who: c.who, text: c.text, until: d.e + c.for }
      if (loud && c.voice !== undefined) raise(w, c.voice, undefined, who!.id)
      return
    case 'shot': {
      const to: View = { pos: c.pos, look: c.look, fov: c.fov ?? file.fov, head: file.head }
      if (c.follows !== undefined) to.follows = c.follows
      if (c.frame !== undefined) to.frame = c.frame
      if (!view(to, d.cast, rows, height)) return
      d.shot = { from: pose(d, rows, height) ?? null, to, at: d.e, over: c.over }
      return
    }
    case 'fade': d.fade = { from: level(d.fade, d.e), to: c.to, at: d.e, over: c.over }; return
    case 'bars': d.bars = { from: level(d.bars, d.e), to: c.on ? 1 : 0, at: d.e, over: c.over }; return
    case 'shake': d.shake = { at: d.e, over: c.over, amp: c.amp }; return
    case 'sound': {
      if (!loud) return
      if (who) return raise(w, c.cue, undefined, who.id)
      const at = c.where === undefined ? undefined : spot(c.where, d.cast, rows, height)
      if (c.where !== undefined && !at) return
      raise(w, c.cue, at)
      return
    }
    case 'music': d.music = c.name === '' ? null : c.name; return
    case 'prepare': {
      const at = ground(c.where, d.cast, rows)
      if (at) d.prepare = at
      return
    }
  }
}

// The most seconds of `e` the file can play: its end, and at each wait the longest it can hold, the
// longest walk's limit for a wait on a member, or the longest line for a wait on the line.
export function longest(file: Script): number {
  const line = Math.max(0, ...file.cues.filter(c => c.do === 'say').map(c => c.for))
  const walk = Math.max(0, ...file.cues.filter(c => c.do === 'walk').map(c => c.limit ?? file.limit))
  return file.cues.reduce((s, c) => s + (c.do !== 'wait' ? 0 : c.who === 'line' ? line : walk), file.end)
}

// Whether a wait has something to wait for.
const holds = (d: any, c: Cue) => (c.who === 'line' ? d.line !== null : Object.hasOwn(d.walks, c.who))

function finish(me: Row, w: W, file: Script, rows: Row[]) {
  const d = me.data
  Object.assign(d, { running: false, done: true, line: null, wait: null, prepare: null, walks: {}, faces: {} })
  for (const name of Object.keys(d.cast)) {
    const r = castRow(d.cast, name, rows)
    if (r) r.data.direct = null
  }
  if (file.go === undefined) return
  for (const kind of (w.world.cutscene as Numbers).kinds) for (const r of w.all(kind)) w.call(r, 'go', -1, file.go, ...(file.arrive ?? []))
}

// One step of the scene; `loud` raises its sounds and voices. It hands back the rows it looked targets
// up in, the cast kinds' and the marks', found once a step: nothing it does adds or ends a row.
function own(me: Row, w: W, dt: number, script: { file: Script; order: number[] }, loud: boolean, height: Height): Row[] {
  const d = me.data
  const { file, order } = script
  d.e += dt
  if (d.line && d.e >= d.line.until - TOLERANCE) d.line = null
  const rows = rowsOf(w)
  for (const who of Object.keys(d.walks)) {
    const walking = d.walks[who]
    const r = castRow(d.cast, who, rows)
    if (!r) {
      delete d.walks[who]
      continue
    }
    const c = file.cues[walking.cue]
    const to = ground(c.to, d.cast, rows)
    const stop = typeof c.to === 'string' && Object.hasOwn(d.cast, c.to) ? file.reach : file.stop
    if (!to || math.hypot(r.data.pos[0] - to[0], r.data.pos[2] - to[1]) <= stop || d.e - walking.since >= (c.limit ?? file.limit) - TOLERANCE) {
      delete d.walks[who]
      delete r.data.direct.walk
      continue
    }
    r.data.direct.walk.to = to
  }
  for (const who of Object.keys(d.faces)) {
    const r = castRow(d.cast, who, rows)
    const to = r && ground(file.cues[d.faces[who]].to, d.cast, rows)
    if (to) {
      r!.data.direct.face = to
      continue
    }
    delete d.faces[who]
    if (r) delete r.data.direct.face
  }
  let firing = true
  if (d.wait) {
    if (holds(d, file.cues[d.wait.cue])) firing = false
    else d.wait = null
  } else d.t += dt
  while (firing && d.fired < order.length) {
    const i = order[d.fired]
    const c = file.cues[i]
    if (c.at > d.t + TOLERANCE) break
    d.fired++
    if (c.do !== 'wait') fire(me, w, file, c, i, loud, rows, height)
    else if (holds(d, c)) {
      d.t = c.at
      d.wait = { cue: i, since: d.e }
      break
    }
  }
  if (!d.wait && d.t >= file.end - TOLERANCE) finish(me, w, file, rows)
  return rows
}

// A quiet stretch's rest, leapt: the row's clocks moved on by whole steps to one step short of the
// next thing that happens with no walk running, the line going while a wait holds on it, or else the
// next cue or the end reached on `t`. The step after it lands on that thing as a played step would.
function leap(d: any, { file, order }: { file: Script; order: number[] }, dt: number) {
  const next = d.fired < order.length ? Math.min(file.cues[order[d.fired]].at, file.end) : file.end
  const n = Math.ceil(((d.wait ? d.line.until - d.e : next - d.t) - TOLERANCE) / dt) - 1
  if (n < 1) return
  d.e += n * dt
  if (!d.wait) d.t += n * dt
}

// The cutscene kind on the ground whose height over a truth is `height(w, x, z)`.
export const cutscene = (height: (w: W, x: number, z: number) => number): Kind => ({
  before(me, dt, w) {
    const h: Height = (x, z) => height(w, x, z)
    const all = w.all('cutscene')
    if (all.length > 1) throw new Error(`a scene holds one cutscene, and this one holds ${all.length}`)
    const d = me.data
    fill(d)
    const numbers = w.world.cutscene as Numbers
    const script = scriptOf(w, numbers.script)
    if (!d.running && !d.done && (script.file.auto || (d.starts === true && present(script.file, w)))) begin(me, w)
    if (!d.running) return
    if (!d.skip) {
      own(me, w, dt, script, true, h)
      return
    }
    // Each step of the play-through finds the rows once, in `own`; a cast member's step may add or end
    // rows, so the next step finds them again. `quiet` counts the steps of the quiet stretch after the
    // one it began on.
    const ids = [...new Set(Object.values(d.cast) as number[])]
    const settle = Math.floor(numbers.settle / dt + TOLERANCE)
    let quiet = 0
    for (;;) {
      const fired = d.fired
      const rows = own(me, w, dt, script, false, h)
      if (d.done) return
      for (const id of ids) {
        const r = rows.find(r => r.id === id)
        if (r) w.call(r, 'advance', -1, dt)
      }
      const walking = Object.keys(d.walks).length > 0
      quiet = walking || d.fired !== fired ? 0 : quiet + 1
      if (!walking && quiet >= settle) leap(d, script, dt)
    }
  },
  acts: {
    start(me, w) { begin(me, w) },
    reset(me, w) {
      const d = me.data
      fill(d)
      const rows = rowsOf(w)
      for (const name of Object.keys(d.cast)) {
        const r = castRow(d.cast, name, rows)
        if (r) r.data.direct = null
      }
      Object.assign(d, {
        t: 0, e: 0, fired: 0, wait: null, line: null, shot: null, fade: null, bars: null, shake: null, music: null,
        prepare: null, walks: {}, faces: {}, cast: {}, running: false, skip: false, done: false,
      })
    },
    skip(me) { if (me.data.running) me.data.skip = true },
  },
  open: ['skip'],
})

export const mark: Kind = {}
