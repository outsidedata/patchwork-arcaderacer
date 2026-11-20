// puppet3d: bodies posed every step by procedure, worn as a glb's skin on bones of puppet3d's own. A
// browser half only: no row, no prefab, no server half. Listed after the plugin its `land` mod reads
// (it asks `ahead`) and before render3d, whose `afterTick` draws.
//
// It draws every row of a kind `world.puppet3d.kinds` lists. The kind's definition says how, every word
// of it named, never read off the data:
//   senses    every sense the kind's drivers read, each name to its source: `clock` (seconds since the
//             scene began), `velocity` (metres a second, off the row's `vel`), `rowSpeed`, `rowStride`,
//             `rowFlight`, `rowJump`, `rowUpright` (the row's own `speed`, `stride`, `flight`, `jump`,
//             `upright`), or a source a solver gives off (the `pureQuadrupedDriver`'s `sprawlStride`).
//   layouts   its bone layouts by name, posed in the order written, each:
//     layout    the layout's name; its skeleton file must name the same.
//     on        what it hangs on: `world`, at the row's `pos` facing its `yaw`, for exactly one of them;
//               else `<layout>:<bone>`, a bone of a layout written before it, with `along` that bone
//               from its head (0) to its tail (1), moved `offset` [across, up, ahead] metres and turned
//               `turn` [yaw, pitch, roll] radians in its frame.
//     skeleton  the loader entry of its rest skeleton, `{ entry, layout, bones: [{ name, parent, head,
//               tail, across }] }`, metres, facing +z, every parent before its children.
//     skin      the loader entry of its glb: its mesh, material and weights, by bone name.
//     drivers   what poses its bones, in layers, each `{ name, weight }` and one of:
//                 `solver`  a word of the behaviors table, with `gait`, the loader entry of the body's
//                           sheet, whose block the solver reads (its `block`), and with `leap: { count,
//                           height }`, two fields of the row, its body leaps to the row's `height` each
//                           time the row's `count` moves, for a solver that leaps. It stands every bone
//                           of the layout by name, and plays the bones it does not stand by its `cues`, a
//                           cue sheet; a bone of those its sheet has no cues for keeps its rest turn on
//                           the bone it rides.
//                 `cues`    the loader entry of a cue sheet, alone: the bones the sheet names turned from
//                           their rest by three angles, each cues on the senses (`played`). It poses
//                           those bones and no others: a roar that names the neck and the jaw leaves a
//                           walk's legs alone.
//               `name` is the driver's own; nothing reads it but what is thrown. `weight` is cues on the
//               senses, from 0 to 1. The layout starts at its rest pose, and
//               each driver in the order written is laid over what the drivers before it made: each bone
//               it poses is turned from where it was toward the driver's own turn (from the bone it
//               hangs on, so a neck moved stays on the spine under it), by its weight. A driver at 1
//               takes its bones over, at 0.33 alone it poses them a third of the way from rest, and two
//               drivers crossfade as the first at 1 and the second by its weight (`layered`).
//
// A cue sheet, `<name>.cues.json`, a loader `json` entry, is `{ <bone>: { bend, swing, twist } }`, each
// angle a list of cues, for the bones it names by name and no others. Every armature of one family has
// the same bone names (every AWOL animal's `neck`, every Mixamo body's `Head`), so a sheet plays on any
// body that has its bones: a bone it names that the layout has not got is not played. A sheet's cues read
// senses by name, so a body that plays it names those senses. Sheets are kept as clips are, in the
// library (`$PATCHWORK_LIBRARY/cues/`), and a game copies the ones it plays into its own `assets/`.
//
// A cue is `{ by, keys: [[at, value], …], period? }`, the value between the two keys the sense `by`
// lies between, held past either end, the sense taken round every `period` first when it has one; or
// `{ by, swing, period, phase? }`, `swing` times the sine of the sense round a whole turn every `period`
// of it, `phase` of a period later. A list of cues is summed. A bone's three angles, radians, from its
// rest: `bend` about its `across`, `swing` about its up (its length crossed with its across), `twist`
// about its length, each bone turned in its parent's turned frame.
//
// `world.puppet3d.mods`: `land`, the plugin whose `land(plugins)` is the ground as this page has it
// (terrain3d's), the row's own height until it has one; `behaviors`, the plugins whose
// `<a>.puppet3d.ts` export `behaviors()`, `{ <word>: Solver }`, laid over each other in the list's
// order. puppet3d has no built-in word: its own `pureQuadrupedDriver` is its own mod,
// `puppet3d.puppet3d.ts`, named in the list as `puppet3d`. A word nothing delivers throws.
//
// `world.puppet3d.capsules`, which a scene may leave out: `{ <kind>: [{ from, to, radius }, { bone, at,
// radius }] }`, the capsules and balls of a kind's body that gpgpu3d holds, so hair lies on it and
// particles bounce off it (`puppet3d.gpgpu3d.ts`).
//
// A row is read for `pos`, `yaw`, `vel` and what its senses and leaps read. It is posed once a step, on
// the frame that step lands, each bone an object of the scene set straight, so render3d draws it
// between the last two steps. `bodies(id)` is the row's skinned meshes, one a layout in the order
// written, each named as its glb's mesh is, or [] before the row is drawn. `close` takes everything off
// the scene.
//
// Beside this file, run by hand, each posing a kind with the functions below as `afterTick` does, and
// each one's header its whole use:
//   puppet3d.feet.ts   measures a kind's feet: the body taken from a stand up to a speed, held, and
//                      back to a stand on flat ground, and for each phase and each foot how far it slid
//                      while down, how far behind and ahead of its place it got, how long it stayed down
//                      and up, its steps, its top speed, its jumps, the most a bone stretched and how
//                      far the body dipped; then the start and the stop against the steady stride, 0
//                      where they went no further than a steady stride goes. It is how a solver's
//                      numbers are judged: `try=` runs it with a number of a sheet changed, the file
//                      left alone, and the last table is read again.
//   puppet3d.clips.ts  writes a kind's walk and its idle into a copy of its glb as two animations, for
//                      crowd3d.
//   puppet3d.cues.py   (Blender) writes cue sheets and a definition from a body's clips.
//
// Exported for the solvers a mod delivers: the types and `played`. Exported for a page that poses a kind
// outside the plugin (the workshop's `/puppet3d`), which `afterTick` itself is made of, so the page and
// the game pose a body with the same code: `solvers` (the solver drivers and their sheets' blocks),
// `sheetsOf` (the cue sheets it plays),
// `stand` (a body first stood), `stepped` (a step on), `sensed` (the senses), `stood` (every layout's
// bones), and beneath them `checked`, `cued`, `layered`, `placed`, `hung`, `frame`, `skinned`, `posed`.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { ahead, mod, modsOf, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { def, json } from '#plugins/loader/loader.sim.ts'

export type V3 = [number, number, number]
export type Bone = { name: string; parent: string | null; head: V3; tail: V3; across: V3 }
export type Ridden = { pos: number[]; yaw: number; vel: number[] }
export type Height = (x: number, z: number) => number
export type Cue = { by: string; keys: number[][]; period?: number } | { by: string; swing: number; period: number; phase?: number }
export type Turn = { bend: Cue[]; swing: Cue[]; twist: Cue[] }
export type BoneCues = Record<string, Turn>
// A solver: a word of the behaviors table. `block` the block of the body's sheet it reads; `make` the
// body standing where the row is, `step` it a step on, `leap` it (a solver that leaps), `senses` the
// sources it gives off, `bones` the layout `layout`'s bones as it stands them, every one of `rest`'s in
// its order, the bones it does not stand played by `play`.
export type Solver<B = any, S = any> = {
  block: string
  make(b: B, at: Ridden, land: Height): S
  step(b: B, s: S, at: Ridden, dt: number, land: Height): void
  leap?(b: B, s: S, height: number): void
  senses(s: S): Record<string, number>
  bones(b: B, s: S, layout: string, rest: Bone[], play: (carried: Bone[]) => Bone[]): Bone[]
}

type LandMod = (plugins: Plugins) => { height(x: number, z: number): number } | undefined
export type Behaviors = () => Record<string, Solver>
export type Skeleton = { entry: string; layout: string; bones: Bone[] }
export type Solving = { solver: string; gait: string; leap?: { count: string; height: string }; cues: string }
export type Driver = { name: string; weight: Cue[] } & (Solving | { cues: string })
export type Hung = { on: 'world' } | { on: string; along: number; offset: V3; turn: V3 }
export type Layout = Hung & { layout: string; skeleton: string; skin: string; drivers: Driver[] }
export type Def = { senses: Record<string, string>; layouts: Record<string, Layout> }
export type Skinned = { joints: THREE.Bone[]; body: THREE.SkinnedMesh; geometry: THREE.BufferGeometry }
// A body as puppet3d keeps it between steps: each solver driver's body by `<layout>:<driver>`, the row's
// leap count each leaping driver last saw, and each layout's rest bones in the order written.
export type Standing = { bodies: Record<string, unknown>; leaps: Record<string, number>; rests: Bone[][] }
type Drawn = Standing & { n: number; was: Ridden; layouts: Skinned[] }

const SOURCES: Record<string, (data: Record<string, any>, at: Ridden, clock: number) => number> = {
  clock: (_d, _at, clock) => clock,
  velocity: (_d, at) => Math.hypot(at.vel[0], at.vel[1], at.vel[2]),
  rowSpeed: d => d.speed,
  rowStride: d => d.stride,
  rowFlight: d => d.flight,
  rowJump: d => d.jump,
  rowUpright: d => d.upright,
}

export function cued(what: string, list: Cue[], senses: Record<string, number>): number {
  if (!list.length) throw new Error(`puppet3d: no cue for ${what}`)
  return list.reduce((sum, c) => {
    const v = senses[c.by]
    if (v === undefined) throw new Error(`puppet3d: a cue for ${what} is by ${c.by}, a sense its kind does not name`)
    if ('swing' in c) return sum + c.swing * Math.sin(2 * Math.PI * (v / c.period - (c.phase ?? 0)))
    const k = c.keys, at = c.period === undefined ? v : v - c.period * Math.floor(v / c.period)
    if (at <= k[0][0]) return sum + k[0][1]
    for (let i = 1; i < k.length; i++) if (at <= k[i][0]) return sum + k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (at - k[i - 1][0]) / (k[i][0] - k[i - 1][0])
    return sum + k[k.length - 1][1]
  }, 0)
}

const AXES = ['bend', 'swing', 'twist'] as const
type M3 = [V3, V3, V3]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const apply = (m: M3, v: V3): V3 => [m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2], m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2], m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2]]
const times = (a: M3, b: M3): M3 => [apply(a, b[0]), apply(a, b[1]), apply(a, b[2])]
const flip = (m: M3): M3 => [[m[0][0], m[1][0], m[2][0]], [m[0][1], m[1][1], m[2][1]], [m[0][2], m[1][2], m[2][2]]]
const ONE: M3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]

// A bone's frame: its `across` (x), its up (y) and its length (z).
function frameOf(b: Bone): M3 {
  const f = unit(sub(b.tail, b.head)), a = unit(sub(b.across, [f[0] * dot(b.across, f), f[1] * dot(b.across, f), f[2] * dot(b.across, f)]))
  return [a, cross(f, a), f]
}

// The turn the three angles make in a bone's own frame: twist about its length, then bend about its
// across, then swing about its up.
function turnOf(bend: number, swing: number, twist: number): M3 {
  const cb = Math.cos(bend), sb = Math.sin(bend), cs = Math.cos(swing), ss = Math.sin(swing), ct = Math.cos(twist), st = Math.sin(twist)
  const z: M3 = [[ct, st, 0], [-st, ct, 0], [0, 0, 1]]
  const x: M3 = [[1, 0, 0], [0, cb, -sb], [0, sb, cb]]
  const y: M3 = [[cs, 0, -ss], [0, 1, 0], [ss, 0, cs]]
  return times(y, times(x, z))
}

// Each bone's parent's index, every parent before its child.
function parents(what: string, rest: Bone[]): number[] {
  const at = new Map(rest.map((b, i) => [b.name, i]))
  return rest.map((b, i) => {
    if (b.parent === null) return -1
    const p = at.get(b.parent)
    if (p === undefined || p >= i) throw new Error(`puppet3d: ${what}'s bone ${b.name} has the parent ${b.parent}, which is not a bone before it`)
    return p
  })
}

// The bones of `rest` turned by their cues, in the rest skeleton's own frame; a bone it names no cues for
// keeps its rest turn from its parent, and cues for a bone `rest` has not got are not played. A bone named
// without one of the three angles throws.
export function played(what: string, rest: Bone[], cues: BoneCues, senses: Record<string, number>): Bone[] {
  const up = parents(what, rest), turns: M3[] = [], out: Bone[] = []
  rest.forEach((b, i) => {
    const c = cues[b.name], m = frameOf(b), p = up[i], above = p < 0 ? ONE : turns[p]
    let own = above
    if (c) {
      for (const axis of AXES) if (!c[axis]) throw new Error(`puppet3d: ${what}'s bone ${b.name} has no ${axis}`)
      const angle = (axis: (typeof AXES)[number]) => cued(`${what}'s ${b.name} ${axis}`, c[axis], senses)
      own = times(above, times(m, times(turnOf(angle('bend'), angle('swing'), angle('twist')), flip(m))))
    }
    turns.push(own)
    const head = p < 0 ? b.head : add(out[p].head, apply(above, sub(b.head, rest[p].head)))
    out.push({ ...b, head, tail: add(head, apply(own, sub(b.tail, b.head))), across: apply(own, b.across) })
  })
  return out
}

// The bones `list` a solver stood, as the layout whose skeleton's bones are `want` has them, in that
// order; a bone stood that the layout has not got, or one of the layout's not stood, throws.
function fitted(what: string, solver: string, layout: string, want: string[], list: Bone[]): Bone[] {
  const extra = list.find(b => !want.includes(b.name)), missing = want.find(nm => !list.some(b => b.name === nm))
  if (extra) throw new Error(`puppet3d: ${what} (${solver}) poses ${extra.name}, and the layout ${layout} has no such bone`)
  if (missing) throw new Error(`puppet3d: ${what} (${solver}) poses no ${missing}, a bone of the layout ${layout}`)
  return want.map(nm => list.find(b => b.name === nm)!)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const wrap = (a: number) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI))

// The tree of a kind, checked: exactly one layout on the world, every other on a bone of one written
// before it, every layout with a driver, each solver a word of the table, and a leap only on a solver
// that leaps.
export function checked(kind: string, d: Def, table: Record<string, Solver>) {
  const names = Object.keys(d.layouts), roots = names.filter(n => d.layouts[n].on === 'world')
  if (roots.length !== 1) throw new Error(`puppet3d: ${kind} has ${roots.length} layouts on the world, and a tree has one: ${roots.join(', ')}`)
  names.forEach((n, i) => {
    const L = d.layouts[n]
    if (L.on !== 'world') {
      const [parent] = L.on.split(':')
      if (!names.slice(0, i).includes(parent)) throw new Error(`puppet3d: ${kind}'s ${n} hangs on ${L.on}, and ${parent} is not a layout written before it`)
    }
    if (!L.drivers.length) throw new Error(`puppet3d: ${kind}'s ${n} has no drivers`)
    for (const x of L.drivers) {
      if (!('solver' in x)) continue
      const s = table[x.solver]
      if (!s) throw new Error(`puppet3d has no behavior for ${kind}'s ${n} (${x.name}), of the word ${x.solver}: no plugin world.puppet3d.mods.behaviors names delivers it`)
      if (x.leap && !s.leap) throw new Error(`puppet3d: ${kind}'s ${n} is driven by ${x.solver} (${x.name}), which does not leap`)
    }
  })
}

type Q = [number, number, number, number]

// A turn as a quaternion [x, y, z, w], and back.
function quatOf(m: M3): Q {
  const r = (i: number, j: number) => m[j][i]
  const t = r(0, 0) + r(1, 1) + r(2, 2)
  if (t > 0) { const s = 0.5 / Math.sqrt(t + 1); return [(r(2, 1) - r(1, 2)) * s, (r(0, 2) - r(2, 0)) * s, (r(1, 0) - r(0, 1)) * s, 0.25 / s] }
  if (r(0, 0) > r(1, 1) && r(0, 0) > r(2, 2)) { const s = 2 * Math.sqrt(1 + r(0, 0) - r(1, 1) - r(2, 2)); return [0.25 * s, (r(0, 1) + r(1, 0)) / s, (r(0, 2) + r(2, 0)) / s, (r(2, 1) - r(1, 2)) / s] }
  if (r(1, 1) > r(2, 2)) { const s = 2 * Math.sqrt(1 + r(1, 1) - r(0, 0) - r(2, 2)); return [(r(0, 1) + r(1, 0)) / s, 0.25 * s, (r(1, 2) + r(2, 1)) / s, (r(0, 2) - r(2, 0)) / s] }
  const s = 2 * Math.sqrt(1 + r(2, 2) - r(0, 0) - r(1, 1))
  return [(r(0, 2) + r(2, 0)) / s, (r(1, 2) + r(2, 1)) / s, 0.25 * s, (r(1, 0) - r(0, 1)) / s]
}
function matOf([x, y, z, w]: Q): M3 {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
    [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
    [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)],
  ]
}
// The turn `t` of the way from `a` to `b`, the short way round.
function slerp(a: Q, b: Q, t: number): Q {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  const c: Q = d < 0 ? [-b[0], -b[1], -b[2], -b[3]] : b
  d = Math.abs(d)
  if (d > 0.9995) {
    const q: Q = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t, a[3] + (c[3] - a[3]) * t]
    const l = Math.hypot(...q)
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]
  }
  const th = Math.acos(d), s = Math.sin(th), ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s
  return [a[0] * ka + c[0] * kb, a[1] * ka + c[1] * kb, a[2] * ka + c[2] * kb, a[3] * ka + c[3] * kb]
}
const toward = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

// A bone as its parent has it: its `turn` from its rest turned by its parent's, its `head` from its
// parent's head in its parent's turned frame (a bone with no parent: where it is), and its `tail` from
// its head in its own turned frame.
type Local = { turn: Q; head: V3; tail: V3 }
function locals(rest: Bone[], up: number[], list: Bone[]): Local[] {
  const owns: M3[] = []
  return list.map((b, i) => {
    const own = times(frameOf(b), flip(frameOf(rest[i]))), p = up[i], back = p < 0 ? ONE : flip(owns[p])
    owns.push(own)
    return { turn: quatOf(times(back, own)), head: p < 0 ? b.head : apply(back, sub(b.head, list[p].head)), tail: apply(flip(own), sub(b.tail, b.head)) }
  })
}
function bonesOf(rest: Bone[], up: number[], ls: Local[]): Bone[] {
  const owns: M3[] = [], out: Bone[] = []
  ls.forEach((l, i) => {
    const p = up[i], above = p < 0 ? ONE : owns[p], own = times(above, matOf(l.turn))
    owns.push(own)
    const head = p < 0 ? l.head : add(out[p].head, apply(above, l.head))
    out.push({ ...rest[i], head, tail: add(head, apply(own, l.tail)), across: apply(own, rest[i].across) })
  })
  return out
}

// A driver's part of a layout's mix: the bones it posed (every one of the layout's, in its order), the
// names of the bones it poses, and its weight.
export type Layer = { name: string; bones: Bone[]; names: Set<string>; weight: number }

// A layout's bones, `base` (its rest, stood where it stands) with each layer laid over the ones before
// it in turn: each bone the layer names moved from where the layers under it left it toward the layer's
// own, by the layer's weight, its turn from its parent, its head and its tail; each bone it does not name
// left as it was. A weight of 0 leaves the bones as they were, 1 puts them where the layer has them.
export function layered(what: string, rest: Bone[], base: Bone[], layers: Layer[]): Bone[] {
  const up = parents(what, rest)
  const now = locals(rest, up, base)
  for (const L of layers) {
    const theirs = locals(rest, up, L.bones)
    rest.forEach((b, i) => {
      if (!L.names.has(b.name)) return
      const a = now[i], t = theirs[i]
      now[i] = { turn: slerp(a.turn, t.turn, L.weight), head: toward(a.head, t.head, L.weight), tail: toward(a.tail, t.tail, L.weight) }
    })
  }
  return bonesOf(rest, up, now)
}

// A bone's frame as drawn: its head, its length along y, its `across` along z.
export function frame(T: typeof THREE, b: Bone, m: THREE.Matrix4) {
  const y = new T.Vector3(b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]).normalize()
  const z = new T.Vector3(b.across[0], b.across[1], b.across[2])
  z.addScaledVector(y, -z.dot(y)).normalize()
  const x = new T.Vector3().crossVectors(y, z)
  return m.makeBasis(x, y, z).setPosition(b.head[0], b.head[1], b.head[2])
}

// A layout's body: the glb `glb`'s (the loader entry `skin`'s) mesh and material on a skeleton of
// puppet3d's own bones, `sk`'s, added to `scene`.
export function skinned(T: typeof THREE, scene: THREE.Scene, glb: THREE.Object3D, sk: Skeleton, skin: string): Skinned {
  let found: THREE.SkinnedMesh | undefined
  glb.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh })
  if (!found) throw new Error(`puppet3d: the skin ${skin} has no skinned mesh`)
  const index = new Map(sk.bones.map((b, i) => [b.name, i]))
  // The glb's joints by name, three having taken the dots out of the names it shows.
  const theirs = found.skeleton.bones.map(b => {
    const n = (b.userData.name as string | undefined) ?? b.name, i = index.get(n)
    if (i === undefined) throw new Error(`puppet3d: the skin ${skin} has a bone ${n} that ${sk.entry}'s skeleton does not`)
    return i
  })
  const geometry = found.geometry.clone()
  const si = geometry.getAttribute('skinIndex')
  for (let v = 0; v < si.count; v++) for (let k = 0; k < 4; k++) si.setComponent(v, k, theirs[si.getComponent(v, k)])
  si.needsUpdate = true
  const joints = sk.bones.map(b => { const j = new T.Bone(); j.name = b.name; scene.add(j); return j })
  const inverses = sk.bones.map(b => frame(T, b, new T.Matrix4()).invert())
  const body = new T.SkinnedMesh(geometry, found.material)
  body.name = found.name
  body.bindMode = T.DetachedBindMode
  body.bind(new T.Skeleton(joints, inverses), new T.Matrix4())
  body.castShadow = true
  body.receiveShadow = true
  body.frustumCulled = false
  scene.add(body)
  return { joints, body, geometry }
}

// A layout's joints set on its bones, `list` in the skeleton's order.
export function posed(T: typeof THREE, joints: THREE.Bone[], list: Bone[], m: THREE.Matrix4) {
  list.forEach((b, k) => {
    const j = joints[k]
    j.position.set(b.head[0], b.head[1], b.head[2])
    j.quaternion.setFromRotationMatrix(frame(T, b, m))
  })
}

// A layout's bones in its own frame (+z ahead, +y up, +x across), hung by `p` on the bone `b`: turned
// in that bone's frame by its `turn` (roll about ahead, then pitch about across, then yaw about up),
// and stood `along` the bone from its head plus its `offset` in that frame.
export function hung(list: Bone[], b: Bone, p: { along: number; offset: V3; turn: V3 }): Bone[] {
  const f = unit(sub(b.tail, b.head))
  const r0 = b.across, k = dot(r0, f)
  const r = unit([r0[0] - f[0] * k, r0[1] - f[1] * k, r0[2] - f[2] * k])
  const u = cross(f, r)
  const [yaw, pitch, roll] = p.turn
  const local = (q: V3): V3 => {
    let [x, y, z] = q
    ;[x, y] = [x * Math.cos(roll) - y * Math.sin(roll), x * Math.sin(roll) + y * Math.cos(roll)]
    ;[y, z] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)]
    ;[x, z] = [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)]
    return [x, y, z]
  }
  const world = (q: V3): V3 => [r[0] * q[0] + u[0] * q[1] + f[0] * q[2], r[1] * q[0] + u[1] * q[1] + f[1] * q[2], r[2] * q[0] + u[2] * q[1] + f[2] * q[2]]
  const at: V3 = [b.head[0] + (b.tail[0] - b.head[0]) * p.along, b.head[1] + (b.tail[1] - b.head[1]) * p.along, b.head[2] + (b.tail[2] - b.head[2]) * p.along]
  const origin = add(at, world(p.offset))
  const turn = (q: V3) => world(local(q))
  const put = (q: V3): V3 => add(origin, turn(q))
  return list.map(x => ({ ...x, head: put(x.head), tail: put(x.tail), across: turn(x.across) }))
}

// A layout's bones in its own frame, set at `pos` facing `yaw`.
export function placed(list: Bone[], pos: number[], yaw: number): Bone[] {
  const s = Math.sin(yaw), c = Math.cos(yaw)
  const turn = (q: V3): V3 => [q[0] * c + q[2] * s, q[1], -q[0] * s + q[2] * c]
  const put = (q: V3): V3 => { const r = turn(q); return [pos[0] + r[0], pos[1] + r[1], pos[2] + r[2]] }
  return list.map(b => ({ ...b, head: put(b.head), tail: put(b.tail), across: turn(b.across) }))
}

export type Solved = { key: string; x: Driver & Solving }

// Every solver driver of a kind, by `<layout>:<driver>`, and the block of its sheet (`sheet(gait)`, the
// sheet the loader entry `gait` holds) its solver reads.
export function solvers(d: Def, table: Record<string, Solver>, sheet: (gait: string) => Record<string, unknown>) {
  const drivers: Solved[] = Object.entries(d.layouts).flatMap(([n, L]) => L.drivers.flatMap(x => 'solver' in x ? [{ key: `${n}:${x.name}`, x }] : []))
  const blocks: Record<string, unknown> = Object.fromEntries(drivers.map(({ key, x }) => [key, sheet(x.gait)[table[x.solver]?.block]]))
  return { drivers, blocks }
}

// A kind's body first stood where its row is: the tree checked, each skeleton checked against its
// layout, each solver driver's body made, each leaping driver's count read off the row's `data`.
export function stand(kind: string, d: Def, table: Record<string, Solver>, blocks: Record<string, unknown>, sks: Skeleton[], at: Ridden, land: Height, data: Record<string, any>): Standing {
  checked(kind, d, table)
  const names = Object.keys(d.layouts)
  names.forEach((n, i) => {
    const L = d.layouts[n]
    if (sks[i].layout !== L.layout) throw new Error(`puppet3d: ${kind}'s ${n} is the layout ${L.layout}, and its skeleton ${L.skeleton} is ${sks[i].layout}`)
  })
  const { drivers } = solvers(d, table, () => ({}))
  return {
    bodies: Object.fromEntries(drivers.map(({ key, x }) => [key, table[x.solver].make(blocks[key], at, land)])),
    leaps: Object.fromEntries(drivers.flatMap(({ key, x }) => x.leap ? [[key, data[x.leap.count]]] : [])),
    rests: sks.map(sk => sk.bones),
  }
}

// Every solver driver's body a step of `dt` on, to `at`; a leaping driver whose row's count has moved
// leaps first, to the row's height.
export function stepped(table: Record<string, Solver>, drivers: Solved[], blocks: Record<string, unknown>, s: Standing, data: Record<string, any>, at: Ridden, dt: number, land: Height) {
  for (const { key, x } of drivers) {
    if (!x.leap || data[x.leap.count] === s.leaps[key]) continue
    s.leaps[key] = data[x.leap.count]
    table[x.solver].leap!(blocks[key], s.bodies[key], data[x.leap.height])
  }
  for (const { key, x } of drivers) table[x.solver].step(blocks[key], s.bodies[key], at, dt, land)
}

// The senses, read once the bodies are stood this step: each the source the kind names, the row's
// (`data`, `at`, `clock`) or the first solver driver's that gives it off.
export function sensed(kind: string, d: Def, table: Record<string, Solver>, drivers: Solved[], s: Standing, data: Record<string, any>, at: Ridden, clock: number): Record<string, number> {
  const given: Record<string, number> = {}
  for (const { key, x } of [...drivers].reverse()) Object.assign(given, table[x.solver].senses(s.bodies[key]))
  const senses: Record<string, number> = {}
  for (const [name, source] of Object.entries(d.senses)) {
    const read = SOURCES[source]
    if (read) senses[name] = read(data, at, clock)
    else if (source in given) senses[name] = given[source]
    else throw new Error(`puppet3d: ${kind} senses ${name} from ${source}, which is none of ${[...Object.keys(SOURCES), ...Object.keys(given)].join(', ')}`)
  }
  return senses
}

// Every cue sheet a kind's drivers play, by loader entry, each once.
export function sheetsOf(d: Def): string[] {
  return [...new Set(Object.values(d.layouts).flatMap(L => L.drivers.map(x => x.cues)))]
}

// Every layout's bones, in the order written, each its drivers laid over its rest in the order written
// (`layered`) and hung where it hangs; `sheets`, every cue sheet the kind plays by its loader entry
// (`sheetsOf`); `left`, drivers by `<layout>:<index>` left out of the mix (a page that poses a kind
// leaves some out; the plugin, none).
export function stood(kind: string, d: Def, table: Record<string, Solver>, blocks: Record<string, unknown>, sheets: Record<string, BoneCues>, s: Standing, senses: Record<string, number>, at: Ridden, left: Set<string> = new Set()): Record<string, Bone[]> {
  const done: Record<string, Bone[]> = {}
  Object.entries(d.layouts).forEach(([n, L], i) => {
    const what = `${kind}'s ${n}`
    const rest = s.rests[i], layers: Layer[] = []
    // A layout's bones in its own frame, stood where it stands: on the world at the row, or hung.
    const set = (own: Bone[]) => {
      if (L.on === 'world') return placed(own, at.pos, at.yaw)
      const [parent, bone] = L.on.split(':'), on = done[parent].find(b => b.name === bone)
      if (!on) throw new Error(`puppet3d: ${what} hangs on ${L.on}, a bone ${parent} does not have`)
      return hung(own, on, L as Extract<Hung, { along: number }>)
    }
    L.drivers.forEach((x, k) => {
      if (left.has(`${n}:${k}`)) return
      const weight = cued(`${what}'s ${x.name} weight`, x.weight, senses)
      if ('solver' in x) {
        const key = `${n}:${x.name}`, want = rest.map(b => b.name)
        const play = (carried: Bone[]) => played(`${what}'s ${x.name}`, carried, sheets[x.cues], senses)
        layers.push({ name: x.name, weight, names: new Set(want), bones: fitted(`${what}'s ${x.name}`, x.solver, L.layout, want, table[x.solver].bones(blocks[key], s.bodies[key], L.layout, rest, play)) })
        return
      }
      const sheet = sheets[x.cues]
      layers.push({ name: x.name, weight, names: new Set(Object.keys(sheet)), bones: set(played(`${what}'s ${x.name}`, rest, sheet, senses)) })
    })
    done[n] = layered(what, rest, set(rest), layers)
  })
  return done
}

export function puppet3d() {
  const drawn = new Map<number, Drawn>()

  function build(plugins: Plugins, sk: Skeleton, skin: string): Skinned {
    return skinned(plugins.render3d.THREE as typeof THREE, plugins.render3d.scene as THREE.Scene, plugins.loader.model(skin).scene as THREE.Object3D, sk, skin)
  }

  function drop(plugins: Plugins, id: number) {
    const d = drawn.get(id)!
    for (const s of d.layouts) {
      for (const j of s.joints) plugins.render3d.scene.remove(j)
      plugins.render3d.scene.remove(s.body)
      s.geometry.dispose()
    }
    drawn.delete(id)
  }

  return {
    afterTick(plugins: Plugins) {
      const scene = plugins.wire.scene, world = scene.world!
      ahead(scene, 'puppet3d', 'land')
      provided(scene, 'puppet3d', 'behaviors')
      const T = plugins.render3d.THREE as typeof THREE
      const ground = mod<LandMod>(world, 'puppet3d', 'land')?.(plugins)
      const table: Record<string, Solver> = Object.assign({}, ...modsOf<Behaviors>(world, 'puppet3d', 'behaviors').map(b => b()))
      const kinds = world.puppet3d.kinds as string[]
      const dt = scene.prefabs.engine.dt as number, n = plugins.wire.n
      const here = new Set<number>(), m = new T.Matrix4()
      for (const row of plugins.wire.rows) {
        if (!kinds.includes(row.kind)) continue
        const d0 = def(plugins.wire, row.kind) as Def
        const names = Object.keys(d0.layouts), tree = names.map(k => d0.layouts[k])
        // The tree waits for every one of its glbs.
        if (tree.some(L => plugins.loader.get(L.skin) === undefined)) continue
        here.add(row.id)
        const at: Ridden = { pos: row.data.pos, yaw: row.data.yaw, vel: row.data.vel }
        const { drivers, blocks } = solvers(d0, table, gait => json(plugins.wire, gait) as Record<string, unknown>)
        const land: Height = (x, z) => ground?.height(x, z) ?? at.pos[1]
        let d = drawn.get(row.id)
        if (d && n === d.n) continue
        if (!d) {
          const sks = tree.map(L => json(plugins.wire, L.skeleton) as Skeleton)
          d = { n, was: at, ...stand(row.kind, d0, table, blocks, sks, at, land, row.data), layouts: tree.map((L, i) => build(plugins, sks[i], L.skin)) }
          drawn.set(row.id, d)
        } else {
          for (let i = 1; i <= n - d.n; i++) {
            const t = i / (n - d.n)
            const now: Ridden = { pos: at.pos.map((v, k) => lerp(d!.was.pos[k], v, t)), yaw: d.was.yaw + wrap(at.yaw - d.was.yaw) * t, vel: at.vel }
            stepped(table, drivers, blocks, d, row.data, now, dt, land)
          }
        }
        d.n = n
        d.was = { pos: [...at.pos], yaw: at.yaw, vel: [...at.vel] }
        const senses = sensed(row.kind, d0, table, drivers, d, row.data, at, n * dt)
        const sheets = Object.fromEntries(sheetsOf(d0).map(e => [e, json(plugins.wire, e) as BoneCues]))
        const done = stood(row.kind, d0, table, blocks, sheets, d, senses, at)
        tree.forEach((L, i) => {
          const s = d!.layouts[i], list = done[names[i]]
          if (list.length !== s.joints.length) throw new Error(`puppet3d: ${row.kind}'s ${names[i]} poses ${list.length} bones and its skeleton ${L.skeleton} has ${s.joints.length}`)
          posed(T, s.joints, list, m)
        })
      }
      for (const id of [...drawn.keys()]) if (!here.has(id)) drop(plugins, id)
    },
    bodies(id: number): THREE.SkinnedMesh[] {
      return drawn.get(id)?.layouts.map(s => s.body) ?? []
    },
    close(plugins: Plugins) {
      for (const id of [...drawn.keys()]) drop(plugins, id)
    },
  }
}
