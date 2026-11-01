// hitscan3d: a shot along a line through a 3D world, answered with the first thing it meets: the
// ground, a solid standing on it, or a body; and, when the shot carries a hurt, the body it meets is
// hurt. The server half (this file) answers; the browser half (`hitscan3d.plugin.ts`) tells a page's
// shot which step it was aimed at.
//
// What a line meets is asked of other plugins through mods (`addons/scenemanager`), each named in
// `world.hitscan3d.mods`, and each optional:
//   ground     `(w, from, dir, far) → { t, normal } | undefined`, the first point of the ground along
//              the line (`terrain3d.hitscan3d.ts`).
//   solids     `(w, from, dir, far) → Shape[]`, every solid standing on it, a trunk, a boulder, a wall,
//              that the line may cross within `far`, as shapes (Shapes, below), named as one plugin or
//              a list of them, each one's solids taken (`scatter3d.hitscan3d.ts`,
//              `shapes3d.hitscan3d.ts`).
//   bodies     `(w) → { id, kind, pos, shapes }[]`, every body that could be hit, `pos` its feet and
//              `shapes` what of it a shot meets, in the world, each a shape named by its `part`,
//              `{ part, <word>: { … } }` (`walker.hitscan3d.ts`, `ragdoll3d.hitscan3d.ts`).
//   behaviors  the plugins that deliver hitscan3d more words of shape (Shapes, below).
// `t` is metres along `dir` from `from`, `dir` any length (it is normalised), `normal` the surface's,
// unit length. `far` is the most metres a line is asked along.
//
// Shapes. hitscan3d never knows what a shape is: it meets each by its behavior, a table from a word to
// `(shape, from, dir, far, grow) → { t, normal } | undefined`, where the line from `from` along unit
// `dir` first meets a thing of that word within `far`, taken `grow` metres wider, or, from inside it,
// where it leaves it. A shape names its word by the key its numbers sit under, `{ cylinder: { pos,
// radius, height } }`. hitscan3d's own words:
//   cylinder  `{ pos, radius, height? }`, upright, from its foot `pos` up `height`, without end when it
//             has none; `grow` takes it wider and longer at both ends.
//   capsule   `{ a, b, radius }`, every point within `radius` of the segment from `a` to `b`, one
//             sphere when they are one point; `grow` takes it wider.
// More words come from the plugins `world.hitscan3d.mods.behaviors` names, each exporting
// `behaviors()`, `{ <word>: <behavior> }`, laid over hitscan3d's own in the list's order: a word one
// delivers takes the place of hitscan3d's own of that word, built-ins included, and a later one's
// takes the place of an earlier one's. The plugin that hands hitscan3d shapes of a word delivers that
// word's behavior (`plugins/shapes3d`'s `box`). A shape of a word none of them has throws naming it.
// One fallback is kept, `fromBare`: a solid handed bare, `{ x, z, radius, base, tall? }`, as providers
// written before shapes had words hand them, is the upright cylinder it always was, about (x, z) from
// `base` up `tall`, without end when it has none. Nothing past `fromBare` reads a bare solid. A body's
// shapes are met `grow` wider; a solid's are met as they stand.
//
// The rest of `world.hitscan3d`:
//   kinds    `{ <kind>: { off?, tall? } }`: the kinds of body a shot can hit, and no other. A row
//            whose field `off` names is truthy (a body lying dead) is not hit. A row carrying a number
//            in the field `tall` names is that tall: its cylinders reach that high over their foot (a
//            crouch); a capsule is where the body's pose puts it and is never changed by it.
//   rewind   steps: how far back a shot may be aimed.
//
// Aiming back. A seat sees the other bodies where the last packet it took put them, some steps
// behind the server by the time its shot arrives, so a shot is checked against the bodies as that
// packet held them. That needs a `hitscan3d` row, made by one actor entry: its `after` counts the
// steps in its field `n` and keeps every body's feet and shapes at the end of each of the last
// `rewind` steps, under the `n` the step's packet carries. A page reads `n` off the row in the packet
// it draws and hands it to the shot (`seen` on the browser half), and `shoot`'s `seen` puts each body
// back where it stood then; a `seen` older than `rewind` steps is taken as the oldest kept, and a
// `seen` newer than the last step, or one given in a scene with no `hitscan3d` row, as now. What is
// kept is the plugin's own memory, one per row, built from the rows as the steps run, and sent to no
// seat: a truth rebuilt by replaying its steps keeps it again. A body is only put back, never
// brought back: one that has ended since is not there, and whether it is `off` is read off its row now.
//
// `shoot(w, from, dir, far, { skip, seen, bodies, grow, hurt })` is the first thing the line meets
// within `far`: `{ t, point, normal, what }`, `what` being `ground`, `solid` or `body`, with `id`,
// `kind` and `part` when it is a body, the part of the shape it met, or undefined when it meets
// nothing. `skip` is ids of bodies it passes through (the shooter); `bodies: false` passes through
// every body, for a line only the ground and the solids stop (a camera kept out of a hill); `grow` is
// metres every body's shape is taken wider by, as its word's behavior says (a cylinder longer by it
// at both ends too), 0 when left out, for a round with a size of its own. A line starting inside a shape meets it where it leaves it; a line
// starting inside a skipped body passes it by.
// `hurt` is what the shot does to a body it meets, `{ damage, by, … }`: `damage` the harm, a number,
// or `{ <part>: number }`, the harm by the part met, which must name it; `by` the row that shot; and
// anything else the weapon carries (a knock, an impulse). With one, the body met is hurt: its row's
// `hit` act is called, as a rule's (seat −1), with a `Struck`, `{ ...hurt, damage, part, point, dir,
// what: 'body' }`, `damage` the harm as a number, `dir` the unit way the line runs. Without one, the
// shot only answers.
//
// `Struck` is what every `hit` act is handed, whoever hurts the row: a shot's, as above; a round's
// splash, `what: 'splash'`, `part` null (`plugins/volley3d`); a rule's burst, `what: 'blast'`, `part`
// null; a car's chassis, `what: 'car'`, with its `speed`, m/s (`plugins/box3dvehicle`). `point` is
// where it was struck from, or met, and `dir` the unit way the harm travels. A `hit` act tells one
// hurt from another by its `what`.
// `strike(w, row, struck)` is how a row is hurt: its `hit` act called, as a rule's (seat −1), with a
// `Struck`; a rule's burst hurts each row it reaches with it.
//
// `hittable(w)` is every body a shot can hit now: of a kind `kinds` lists, none lying `off`, each
// cylinder as tall as its row's `tall` field when it carries one.
// `sees(w, from, to)` is whether nothing of the ground or the solids stands between two points:
// bodies do not block a sight.
//
// hitscan3d answers other plugins through its own mods: `hitscan3d.volley3d.ts` hands volley3d
// `shoot` and `bodies`, so launched rounds meet, and hurt, what a shot meets.
import type { Arg, Kind, Row, W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Memory } from '#addons/rewind/rewind.addon.ts'

export type Surface = { t: number; normal: number[] }
// A shape: its numbers under its word (Shapes, above).
export type Worded = { [word: string]: any }
// A body's shape, named by its part.
export type Shape = { part: string } & Worded
// A word's behavior: where the line from `from` along unit `dir` first meets a thing of that word,
// within `far`, taken `grow` metres wider.
export type Behavior = (shape: any, from: number[], dir: number[], far: number, grow: number) => Surface | undefined
export type Body = { id: number; kind: string; pos: number[]; shapes: Shape[] }
export type Hit = { t: number; point: number[]; normal: number[]; what: 'ground' | 'solid' | 'body'; id?: number; kind?: string; part?: string }
export type Hurt = { damage: number | Record<string, number>; by: number; [more: string]: unknown }
export type Struck = { damage: number; by: number; part: string | null; point: number[]; dir: number[]; what: 'body' | 'splash' | 'blast' | 'car'; [more: string]: unknown }
export type Numbers = {
  kinds: Record<string, { off?: string; tall?: string }>
  rewind: number
}

// A solid handed bare (`fromBare`).
export type Solid = { x: number; z: number; radius: number; base: number; tall?: number }
type Ground = (w: W, from: number[], dir: number[], far: number) => Surface | undefined
type Solids = (w: W, from: number[], dir: number[], far: number) => (Solid | Worded)[]
type Bodies = (w: W) => Body[]

const kept = new WeakMap<Row, Map<number, Body[]>>()

const numbersOf = (w: W) => {
  const n = w.world.hitscan3d as Numbers | undefined
  if (!n) throw new Error('hitscan3d is asked a shot, and the scene gives no world.hitscan3d')
  return n
}

// The bodies a shot can hit now.
function bodiesOf(w: W): Body[] {
  const bodies = mod<Bodies>(w.world, 'hitscan3d', 'bodies')
  if (!bodies) return []
  const { kinds } = numbersOf(w)
  return bodies(w).filter(b => b.kind in kinds)
}

// A body with every point of it copied, to be kept.
const copy = (b: Body): Body => ({ ...b, pos: b.pos.slice(), shapes: structuredClone(b.shapes) })

export const hitscan3d: Kind & Memory = {
  // Where every body stood on each step kept, which a truth's snapshot does not carry: handed out
  // with a save, and taken by the truth loaded from it (`Memory` in `addons/rewind`), so a shot
  // there is aimed back as it would have been on the truth saved.
  hold(me) {
    const steps = kept.get(me)
    return steps ? structuredClone([...steps]) : undefined
  },
  take(me, held) { kept.set(me, new Map(structuredClone(held as [number, Body[]][]))) },
  after(me, _dt, w) {
    const { rewind } = numbersOf(w)
    me.data.n = (me.data.n ?? 0) + 1
    let steps = kept.get(me)
    if (!steps) kept.set(me, steps = new Map())
    steps.set(me.data.n, bodiesOf(w).map(copy))
    for (const k of steps.keys()) if (k <= me.data.n - rewind) steps.delete(k)
  },
}

// A body as a shot meets it now: none for one lying `off`, and its cylinders as tall as its row's
// `tall` field when the row carries it (a crouch).
function upright(w: W, b: Body): Body | undefined {
  const k = numbersOf(w).kinds[b.kind]
  const row = w.get(b.id)
  if (k.off && row.data[k.off]) return undefined
  if (k.tall === undefined || typeof row.data[k.tall] !== 'number') return b
  const height = row.data[k.tall] as number
  return { ...b, shapes: b.shapes.map(s => ('cylinder' in s ? { part: s.part, cylinder: { ...s.cylinder, height } } : s)) }
}

export const hittable = (w: W): Body[] => bodiesOf(w).flatMap(b => upright(w, b) ?? [])

// Where each body stood on the step `seen`, of those that are there now; now, with no `seen`.
function bodiesAt(w: W, seen: number | undefined): Body[] {
  const now = bodiesOf(w)
  if (seen === undefined) return now
  const row = w.all('hitscan3d')[0]
  const steps = row && kept.get(row)
  if (!row || !steps || seen >= row.data.n) return now
  const oldest = Math.min(...steps.keys())
  const then = steps.get(Math.max(oldest, Math.floor(seen)))
  if (!then) return now
  const here = new Set(now.map(b => b.id))
  return then.filter(b => here.has(b.id))
}

// Where a line from `o` along unit `d` first meets an upright cylinder about `c`'s x and z, from y0 up
// to y1 (Infinity for one without end), within `far`; from inside, where it leaves it.
export function cylinder(o: number[], d: number[], far: number, c: number[], r: number, y0: number, y1: number): Surface | undefined {
  let best: Surface | undefined
  const take = (t: number, normal: number[]) => { if (t >= 0 && t <= far && (!best || t < best.t)) best = { t, normal } }
  const ox = o[0] - c[0], oz = o[2] - c[2]
  const a = d[0] * d[0] + d[2] * d[2]
  const inside = ox * ox + oz * oz <= r * r
  if (a > 1e-12) {
    const b = ox * d[0] + oz * d[2]
    const disc = b * b - a * (ox * ox + oz * oz - r * r)
    if (disc >= 0) {
      const s = Math.sqrt(disc)
      const t = inside ? (-b + s) / a : (-b - s) / a
      const y = o[1] + d[1] * t
      if (y >= y0 && y <= y1) {
        const px = ox + d[0] * t, pz = oz + d[2] * t
        const l = math.hypot(px, pz) || 1
        take(t, inside ? [-px / l, 0, -pz / l] : [px / l, 0, pz / l])
      }
    }
  }
  if (Math.abs(d[1]) > 1e-12)
    for (const [y, up] of [[y1, 1], [y0, -1]] as const) {
      if (!Number.isFinite(y)) continue
      const t = (y - o[1]) / d[1]
      const px = ox + d[0] * t, pz = oz + d[2] * t
      if (px * px + pz * pz <= r * r) take(t, [0, up, 0])
    }
  return best
}

const sub = (p: number[], q: number[]) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]]
const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]

// Where a line from `o` along unit `d` first meets the capsule of every point within `r` of the
// segment from `a` to `b`, within `far`; from inside, where it leaves it. A capsule is convex, so the
// line crosses its surface at most twice: every crossing of the side's endless cylinder that lies
// between the ends, and of each end's sphere that lies beyond its end, is gathered, and the first
// kept, or from inside the last.
export function capsule(o: number[], d: number[], far: number, a: number[], b: number[], r: number): Surface | undefined {
  const ba = sub(b, a), oa = sub(o, a)
  const len2 = dot(ba, ba)
  // How far along the axis a point lies, 0 at `a` and 1 at `b`; 0 for a sphere.
  const along = (p: number[]) => (len2 > 1e-12 ? dot(sub(p, a), ba) / len2 : 0)
  const at = (t: number) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]
  const roots: number[] = []
  if (len2 > 1e-12) {
    // The endless cylinder: |(oa + t d) − ((oa + t d)·ba / len2) ba|² = r².
    const bd = dot(ba, d), bo = dot(ba, oa)
    const qa = len2 - bd * bd, qb = len2 * dot(oa, d) - bo * bd, qc = len2 * dot(oa, oa) - bo * bo - r * r * len2
    const disc = qb * qb - qa * qc
    if (qa > 1e-12 && disc >= 0) {
      const s = Math.sqrt(disc)
      for (const t of [(-qb - s) / qa, (-qb + s) / qa]) {
        const u = along(at(t))
        if (u >= 0 && u <= 1) roots.push(t)
      }
    }
  }
  for (const [end, side] of [[a, -1], [b, 1]] as const) {
    const oc = sub(o, end)
    const hb = dot(d, oc), disc = hb * hb - (dot(oc, oc) - r * r)
    if (disc < 0) continue
    const s = Math.sqrt(disc)
    for (const t of [-hb - s, -hb + s]) {
      const u = along(at(t))
      if (len2 <= 1e-12 || (side < 0 ? u <= 0 : u >= 1)) roots.push(t)
    }
  }
  if (!roots.length) return undefined
  const u0 = Math.min(1, Math.max(0, along(o)))
  const near = [a[0] + ba[0] * u0, a[1] + ba[1] * u0, a[2] + ba[2] * u0]
  const inside = dot(sub(o, near), sub(o, near)) <= r * r
  const t = inside ? Math.max(...roots) : Math.min(...roots)
  if (t < 0 || t > far) return undefined
  const p = at(t)
  const u = Math.min(1, Math.max(0, along(p)))
  const n = sub(p, [a[0] + ba[0] * u, a[1] + ba[1] * u, a[2] + ba[2] * u])
  const l = math.hypot(n[0], n[1], n[2]) || 1
  return { t, normal: inside ? [-n[0] / l, -n[1] / l, -n[2] / l] : [n[0] / l, n[1] / l, n[2] / l] }
}

// hitscan3d's own words (Shapes, above).
/** @deprecated LEGACY, being phased out: a plugin keeps no words of its own; every word is delivered by the plugin that brings things of it (`world.hitscan3d.mods.behaviors`). */
export const base: Record<string, Behavior> = {
  cylinder: (c, o, d, far, grow) => cylinder(o, d, far, c.pos, c.radius + grow, c.pos[1] - grow, c.height === undefined ? Infinity : c.pos[1] + c.height + grow),
  capsule: (c, o, d, far, grow) => capsule(o, d, far, c.a, c.b, c.radius + grow),
}

// Every behavior the scene has: hitscan3d's own, and over them each mod's in the order they are named;
// made once per scene's `world`, whose mods never change.
const made = new WeakMap<object, Record<string, Behavior>>()
function behaviorsOf(world: object): Record<string, Behavior> {
  let all = made.get(world)
  if (!all) {
    all = { ...base }
    for (const m of modsOf<() => Record<string, Behavior>>(world, 'hitscan3d', 'behaviors')) Object.assign(all, m())
    made.set(world, all)
  }
  return all
}

// Where a line meets a shape, by its word's behavior, `grow` wider. The word is the key its numbers sit
// under, a body's `part` aside.
function meet(world: object, o: number[], d: number[], far: number, s: Worded, grow: number): Surface | undefined {
  const word = Object.keys(s).find(k => k !== 'part')!
  const behavior = behaviorsOf(world)[word]
  if (!behavior) throw new Error(`hitscan3d has no behavior for a shape of the word ${word}: no plugin world.hitscan3d.mods.behaviors names delivers it`)
  return behavior(s[word], o, d, far, grow)
}

// The one fallback: a solid handed bare, `{ x, z, radius, base, tall? }`, as providers written before
// shapes had words hand them, is the upright cylinder it always was. Nothing past this reads a bare
// solid.
/** @deprecated LEGACY, being phased out: a provider hands worded shapes and delivers their words' behaviors; a bare solid is the old way. */
function fromBare(s: Solid | Worded): Worded {
  if (!('x' in s && 'radius' in s)) return s
  const bare = s as Solid
  return { cylinder: { pos: [bare.x, bare.base, bare.z], radius: bare.radius, height: bare.tall } }
}

// Where a line from `from` along unit `d` first meets a solid within `far`, of those the scene's
// `solids` mods stand along it, each met as it stands.
function solidAlong(w: W, from: number[], d: number[], far: number): Surface | undefined {
  let best: Surface | undefined
  for (const solids of modsOf<Solids>(w.world, 'hitscan3d', 'solids')) {
    for (const s of solids(w, from, d, far)) {
      const hit = meet(w.world, from, d, far, fromBare(s), 0)
      if (hit && (!best || hit.t < best.t)) best = hit
    }
  }
  return best
}

const unit = (v: number[]) => {
  const l = math.hypot(v[0], v[1], v[2])
  if (!(l > 0)) throw new Error('hitscan3d is asked a shot along no direction')
  return [v[0] / l, v[1] / l, v[2] / l]
}

export function shoot(w: W, from: number[], dir: number[], far: number, opts: { skip?: number[]; seen?: number; bodies?: boolean; grow?: number; hurt?: Hurt } = {}): Hit | undefined {
  const d = unit(dir)
  let best: Hit | undefined
  const take = (s: Surface | undefined, what: Hit['what'], body?: { id: number; kind: string; part: string }) => {
    if (s && (!best || s.t < best.t)) best = { t: s.t, point: [from[0] + d[0] * s.t, from[1] + d[1] * s.t, from[2] + d[2] * s.t], normal: s.normal, what, ...body }
  }
  const ground = mod<Ground>(w.world, 'hitscan3d', 'ground')
  if (ground) take(ground(w, from, d, far), 'ground')
  take(solidAlong(w, from, d, best?.t ?? far), 'solid')
  const skip = new Set(opts.skip ?? [])
  const grow = opts.grow ?? 0
  for (const b of opts.bodies === false ? [] : bodiesAt(w, opts.seen)) {
    if (skip.has(b.id)) continue
    const up = upright(w, b)
    if (!up) continue
    for (const s of up.shapes) take(meet(w.world, from, d, best?.t ?? far, s, grow), 'body', { id: b.id, kind: b.kind, part: s.part })
  }
  const hit = best as Hit | undefined
  if (hit?.what === 'body' && opts.hurt) {
    const h = opts.hurt
    const damage = typeof h.damage === 'number' ? h.damage : h.damage[hit.part!]
    if (damage === undefined) throw new Error(`hitscan3d: ${hit.kind} was struck on ${hit.part}, and the hurt names no damage for it`)
    strike(w, w.get(hit.id!), { ...h, damage, part: hit.part!, point: hit.point, dir: d, what: 'body' })
  }
  return hit
}

// A row hurt: its `hit` act called, as a rule's (seat −1), with what struck it. An act a seat's
// message asks for is handed plain values alone, and a `Struck` is no message: no seat sends one.
export function strike(w: W, row: Row, struck: Struck) {
  w.call(row, 'hit', -1, struck as unknown as Arg)
}

export function sees(w: W, from: number[], to: number[]): boolean {
  const dir = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const far = math.hypot(dir[0], dir[1], dir[2])
  if (far === 0) return true
  const d = unit(dir)
  const ground = mod<Ground>(w.world, 'hitscan3d', 'ground')
  return !ground?.(w, from, d, far) && !solidAlong(w, from, d, far)
}
