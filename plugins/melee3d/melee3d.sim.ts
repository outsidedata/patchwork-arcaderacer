// melee3d: weapons held in a body's hands, swung through the world by the clips anim plays, and the
// limbs and blades they meet. Its server half (this file) knows where each blade and each limb stands
// on a step and what a swing passed through; its page half (`melee3d.plugin.ts`) draws them.
//
// A blade is a rigid weapon a body's rig names in its `blades`: one of the rig's `meshes`, measured
// by anim's bake into the rig's `grips` for each body as its guard and its tip on the joint that
// carries it (`anim.export.py`). A body holds a blade while its stance draws it (the rig's `show` for the
// row's stance lists it, or the rig has no `show`) and while it still has the limb the blade's bone
// hangs from: a hand cut off takes its sword with it.
//
// The fixed numbers of a scene are `world.melee3d`:
//   kinds    the kinds of body whose blades and limbs it knows, each an anim kind.
//   limbs    `{ <limb>: { from, to, radius } }`: a body's limbs as a blade meets them, each a capsule
//            of `radius` metres round the line from the bone `from` to the bone `to` of the posed
//            skeleton, named as dismember3d names its segments (`head`, `torso`, `armL`, …).
//   spacing  metres: the most between two points of a blade whose paths a swing follows.
//   edge     m/s: the slowest a point of a blade moves and still lands a blow; slower, a blade
//            resting on a limb or against another blade meets nothing.
//   clash    metres: how near the path of a point of one blade passes another blade to meet it.
//   show     `{ colour, radius, limbs?, struck? }`: the page half draws every blade as a rod of that
//            colour and radius, metres, from its guard to its tip, over everything else; with `limbs`,
//            a colour, every limb's line from bone to bone, and with `struck` too, a limb a swing in
//            play has met (a body's `struck`) in that colour; with no `show`, it draws nothing.
//
// The row of a body that swings carries, written here: `edges`, `{ <blade>: [guard, tip] }`, where
// each blade stood at the end of its last step; `swing`, the name of the swing it is in, or null; and
// `struck`, the `<id>:<part>` of every limb and blade the swing has met. A body's prefab starts them
// `{}`, null and `[]`.
//
// `blades(from, me)` is every blade the body `me` holds now, `{ blade, guard, tip }`, the two ends in
// the world, metres: none for a body lying limp, which no clip poses. The body is posed as anim's
// browser half draws it from the row's fields (anim's `posed`): every clip it blends, the upper body's
// gestures and the pinned hips, down the skeleton to the blade's bone, which carries the guard and the
// tip; then turned by the row's yaw and moved to its feet, as the row's `reads` name them.
// `limbs(from, me)` is every limb the body still has, `{ limb, a, b, radius }`, posed so, in the world;
// none for a body lying limp. A limb is lost when the row's `off` (dismember3d's) lists it.
// `swing(w, me, dt, live)`, each step of the body's rule once anim has posed it: where each blade
// stands now goes on `edges`. `live` is the name of the swing the rule says the body is in, or null:
// with none, nothing is met and `struck` is emptied; a name other than `swing` starts a new swing,
// with nothing struck yet. In a swing, each blade that stood somewhere at the end of the last step is
// followed from there to where it stands now: points along it, guard to tip, at most `spacing` apart,
// each moving straight from where it was to where it is. A path that passes within a limb's radius of
// its line meets that limb of another body of `kinds` that stands (not limp), and one that passes
// within `clash` of another such body's blade meets that blade, each where on its path it comes
// nearest, `u` of the way from the step's start to its end, moving at the point's speed, `|path| /
// dt`, and only at `edge` or faster. Each limb and blade a swing meets is met once: the first path to
// reach it, the soonest point of it. `swing` hands back what it met, soonest first: `{ what, id, part,
// point, dir, speed, u, blade }`, `what` `limb` or `blade`, `part` the limb or the other body's blade,
// `point` where the path came nearest, `dir` the unit way it moved, `blade` the swinging blade's name.
// `liveOf(me, strikes)` is the swing a body is in now, for a rule to hand `swing`: the clip it plays
// that `strikes` (`{ <clip>: … }`, the clips that swing a blade) names, on anim's upper channel while a
// gesture there has weight, else as its act, or null.
//
// melee3d hands npc3d a sword fight through its mod, `melee3d.npc3d.ts`.
import type { Row, W } from '#engine/engine.ts'
import type { Wire } from '#engine/browser.ts'
import { Matrix4, Vector3 } from 'three'
import { animKind, numbersOf, posed, readsOf, rigOf, skeletonOf, stanceOf, type Skeleton } from '#plugins/anim/anim.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

export type Blade = { blade: string; guard: number[]; tip: number[] }
export type Limb = { limb: string; a: number[]; b: number[]; radius: number }
export type Contact = { what: 'limb' | 'blade'; id: number; part: string; point: number[]; dir: number[]; speed: number; u: number; blade: string }
type Numbers = {
  kinds: string[]
  limbs: Record<string, { from: string; to: string; radius: number }>
  spacing: number
  edge: number
  clash: number
}

const numbers = (from: W | Wire): Numbers => ('find' in from ? from.world : from.scene.world!).melee3d

// A vector in the body's frame turned to the world by `yaw` about y (yaw θ faces (sin θ, cos θ)).
const turn = (v: Vector3, yaw: number) => {
  const c = math.cos(yaw), s = math.sin(yaw)
  return [v.x * c + v.z * s, v.y, -v.x * s + v.z * c]
}

// A body's posed skeleton, its joints and grips and the place it stands, or undefined for one lying limp.
function bodyOf(from: W | Wire, me: Row) {
  const d = me.data
  const kind = animKind(me)
  const reads = readsOf(from, kind)
  if (d[reads.limp]) return undefined
  const rig = rigOf(from, kind)
  const pos: number[] = d[reads.pos] ?? [0, 0, 0]
  const yaw: number = d[reads.yaw] ?? 0
  const place = (v: Vector3) => {
    const t = turn(v, yaw)
    return [pos[0] + t[0], pos[1] + t[1], pos[2] + t[2]]
  }
  const grips = rig.grips?.[numbersOf(from).kinds[kind].model] ?? {}
  return { rig, sk: skeletonOf(from, kind), grips, place, bones: posed(from, me), off: (d.off ?? []) as string[] }
}

// Whether `bone` is `above` or below it in the skeleton.
const under = (sk: Skeleton, bone: string, above: string) => {
  for (let b: string | null = bone; b; b = sk.bones[b].parent) if (b === above) return true
  return false
}

export function blades(from: W | Wire, me: Row): Blade[] {
  const kind = animKind(me)
  const rig = rigOf(from, kind)
  const shown = rig.show?.[stanceOf(rig, me.data)]
  const held = (rig.blades ?? []).filter(b => !shown || shown.includes(b))
  if (!held.length) return []
  const body = bodyOf(from, me)
  if (!body) return []
  const limbs = numbers(from).limbs
  const out: Blade[] = []
  for (const blade of held) {
    const b = body.grips[blade]
    if (!b) throw new Error(`melee3d: ${kind}'s rig names the blade ${blade}, and its grips have none; bake it (anim.export.py)`)
    if (body.off.some(limb => limbs[limb] && under(body.sk, b.bone, limbs[limb].from))) continue
    const m: Matrix4 = body.bones.get(b.bone)!
    out.push({ blade, guard: body.place(new Vector3().fromArray(b.guard).applyMatrix4(m)), tip: body.place(new Vector3().fromArray(b.tip).applyMatrix4(m)) })
  }
  return out
}

export function limbs(from: W | Wire, me: Row): Limb[] {
  const body = bodyOf(from, me)
  if (!body) return []
  const at = (bone: string) => {
    const m = body.bones.get(bone)
    if (!m) throw new Error(`melee3d: the skeleton of ${animKind(me)} has no joint ${bone}`)
    return body.place(new Vector3().setFromMatrixPosition(m))
  }
  return Object.entries(numbers(from).limbs).filter(([limb]) => !body.off.includes(limb))
    .map(([limb, l]) => ({ limb, a: at(l.from), b: at(l.to), radius: l.radius }))
}

// The nearest points of the segments p0–p1 and q0–q1: `s` along the first and `t` along the second,
// each 0 to 1, and the distance between them (Ericson, Real-Time Collision Detection, 5.1.9).
function nearest(p0: number[], p1: number[], q0: number[], q1: number[]) {
  const d1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
  const d2 = [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]]
  const r = [p0[0] - q0[0], p0[1] - q0[1], p0[2] - q0[2]]
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r)
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  let s: number, t: number
  if (a <= 1e-12 && e <= 1e-12) s = t = 0
  else if (a <= 1e-12) { s = 0; t = clamp(f / e) }
  else {
    const c = dot(d1, r)
    if (e <= 1e-12) { t = 0; s = clamp(-c / a) }
    else {
      const b = dot(d1, d2), den = a * e - b * b
      s = den > 1e-12 ? clamp((b * f - c * e) / den) : 0
      t = (b * s + f) / e
      if (t < 0) { t = 0; s = clamp(-c / a) }
      else if (t > 1) { t = 1; s = clamp((b - c) / a) }
    }
  }
  const p = [p0[0] + d1[0] * s, p0[1] + d1[1] * s, p0[2] + d1[2] * s]
  const q = [q0[0] + d2[0] * t, q0[1] + d2[1] * t, q0[2] + d2[2] * t]
  return { s, t, p, distance: math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) }
}

export function liveOf(me: Row, strikes: Record<string, unknown>): string | null {
  const d = me.data
  if (d.upper != null && d.upperW > 0 && strikes[d.upper]) return d.upper
  if (d.state === 'act' && strikes[d.clip]) return d.clip
  return null
}

const lerp = (a: number[], b: number[], s: number) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]

export function swing(w: W, me: Row, dt: number, live: string | null): Contact[] {
  const d = me.data
  const n = numbers(w)
  const now = blades(w, me)
  const before: Record<string, number[][]> = d.edges ?? {}
  d.edges = Object.fromEntries(now.map(b => [b.blade, [b.guard, b.tip]]))
  if (live === null) {
    d.swing = null
    d.struck = []
    return []
  }
  if (d.swing !== live) {
    d.swing = live
    d.struck = []
  }
  const struck = new Set<string>(d.struck)
  const others = n.kinds.flatMap(k => w.all(k)).filter(r => r.id !== me.id && !r.data[readsOf(w, animKind(r)).limp])
  const found = new Map<string, Contact>()
  for (const b of now) {
    const was = before[b.blade]
    if (!was) continue
    const [g0, t0] = was
    const length = math.hypot(b.tip[0] - b.guard[0], b.tip[1] - b.guard[1], b.tip[2] - b.guard[2])
    const count = Math.max(1, Math.ceil(length / n.spacing))
    const paths = Array.from({ length: count + 1 }, (_, i) => [lerp(g0, t0, i / count), lerp(b.guard, b.tip, i / count)])
    const reach = length + math.hypot(b.guard[0] - g0[0], b.guard[1] - g0[1], b.guard[2] - g0[2]) + 2.5
    for (const r of others) {
      if (math.hypot(r.data.pos[0] - b.guard[0], r.data.pos[2] - b.guard[2]) > reach) continue
      const meet = (key: string, what: 'limb' | 'blade', part: string, a: number[], c: number[], within: number) => {
        if (struck.has(key)) return
        for (const [p0, p1] of paths) {
          const near = nearest(p0, p1, a, c)
          if (near.distance > within) continue
          const move = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
          const l = math.hypot(move[0], move[1], move[2])
          const speed = l / dt
          if (speed < n.edge) continue
          const had = found.get(key)
          if (had && had.u <= near.s) continue
          found.set(key, { what, id: r.id, part, point: near.p, dir: move.map(v => v / l), speed, u: near.s, blade: b.blade })
        }
      }
      for (const l of limbs(w, r)) meet(`${r.id}:${l.limb}`, 'limb', l.limb, l.a, l.b, l.radius)
      for (const o of blades(w, r)) meet(`${r.id}:${o.blade}`, 'blade', o.blade, o.guard, o.tip, n.clash)
    }
  }
  const met = [...found.values()].sort((a, b) => a.u - b.u)
  d.struck = [...struck, ...met.map(c => `${c.id}:${c.part}`)]
  return met
}
