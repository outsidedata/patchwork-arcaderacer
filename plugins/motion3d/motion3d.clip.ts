// motion3d's arithmetic on a clip, off the rig file alone: what the bake measured (the rig's `table`,
// `ends` and `touches`, `motion3d.play.ts`), with no world and no row. The server half
// (`motion3d.sim.ts`) places a held body by it, motion3d's step of a bake writes each clip's offsets
// into the rig by it (`motion3d.offsets.ts`), and the clip analyzer draws it (`scripts/clipanalyzer.html`).
//
// Every place is metres in the clip's frame at its start (x the body's left, y up, z ahead, the root
// there at its middle), every turn radians, positive left.
//   `endsOf(rig, body, clip, segment, t)`   a segment's two ends in the body's frame `t` seconds in,
//        [ax, ay, az, bx, by, bz], straight between the two frames the playhead falls between, held within
//        the clip's frames; a mirrored clip's its source's other side's, across x (`motion3d.play.ts`'s `ends`).
//   `drawnAt(rig, body, numbers, clip, segment, t)`   where a segment starts in the body's frame as it is
//        draws it: its measured place for a loop and for a one-shot that carries no travel; for a
//        one-shot that carries travel, the hips held at their rest across the ground, at their own
//        height, and, where it keeps its turn, the body turned back about them by the curve's turn
//        (pinned as `motion3d.play.ts` pins them).
//   `rootIn(rig, numbers, clip, t)`   where the root stands, `{ at, turn }`: as far as the clip carries
//        its measured travel (`carries`), or where it began for a clip that carries none.
//   `spotIn(rig, body, numbers, clip, bones, t)`   where a spot stands: the middle of the bones (Mixamo's
//        names, `LeftHand`, `Hips`, motion3d's `BONES`) as they are drawn, from the root where it stands
//        then, turned as it is; with none, the root itself, and for a loop, risen as far as the clip
//        climbs its hips into its lap, which is drawn with the clip.
//   `axes(yaw, normal)`   a point's frame (motion3d's Offsets): its up the normal, its ahead its facing
//        laid square to it, or, where its facing is its up, up laid square to it; its left the third way.
//   `offsetsOf(rig, body, numbers, clip, judge)`   the clip's two offsets (motion3d's Offsets) by the
//        judgement `judge`, `{ spot, on, facing?, after? }` (a rig clip's `held`, which the header of
//        `motion3d.offsets.ts` says), and for a clip measured against a plane, where it ends the root
//        from it, which a clip held `after` it starts from: `{ offsets, ended? }`.
//   `heldOf(rig, clip)`   the clip's judgement, its rig entry's `held`, which every clip gives: one
//        that gives none throws, naming it.
//   `rigOffsets(rig, moves, judge?)`   every clip's offsets for every body the rig measures, `{ <body>: { <clip>:
//        offsets } }`, by its judgement (`judge(clip)`, else `heldOf`) (zeros for a spot on its point all through), a clip held `after`
//        another from where that one ends, rounded to the millimetre and the hundredth of a degree: what
//        motion3d's step of a bake writes into the rig.
import { at as curveAt, carries, clipOf, type Moves, type Rig } from './motion3d.play.ts'
import * as math from '#plugins/math/math.sim.ts'

export type Offsets = { beginOffset: number[]; endOffset: number[]; beginTurn: number; normal?: number[] }
// A clip's judgement, its rig entry's `held` (`motion3d.offsets.ts`'s header).
export type Held = { spot?: string[]; on?: 'both' | 'begin' | 'end' | 'face'; facing?: 'into' | 'along'; after?: string }
export type Judge = { spot: string[]; on?: 'both' | 'begin' | 'end' | 'face'; facing?: 'into' | 'along'; after?: Ended }
// Where a clip measured against a plane ends the root: from the place on the plane, in the plane's
// frame; its turn from the plane's facing, degrees; the plane's frame and normal in the clip's frame at
// its start; and the way the body faces at its end there, radians.
export type Ended = { root: number[]; turn: number; axes: Axes; facing: number; normal: number[] }
export type Axes = { x: number[]; y: number[]; z: number[] }
type Anim = Moves

const DEG = Math.PI / 180

// A bone of the rig by its name, where the bake measures it: the start of its segment (`ends`).
export const BONES: Record<string, string> = {
  Hips: 'torso', Head: 'head',
  LeftArm: 'armL', LeftForeArm: 'forearmL', LeftHand: 'handL', RightArm: 'armR', RightForeArm: 'forearmR', RightHand: 'handR',
  LeftUpLeg: 'uplegL', LeftLeg: 'legL', LeftFoot: 'footL', RightUpLeg: 'uplegR', RightLeg: 'legR', RightFoot: 'footR',
}

export const add = (a: number[], b: number[]) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const scaled = (a: number[], k: number) => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

// A vector in the frame of a body facing yaw θ (x left, y up, z ahead), in the frame yaw 0 is.
export const fromBody = (yaw: number, v: number[]): number[] =>
  [v[2] * math.sin(yaw) + v[0] * math.cos(yaw), v[1], v[2] * math.cos(yaw) - v[0] * math.sin(yaw)]
// The other way: a vector of the frame yaw 0 is, in the frame of a body facing yaw θ.
export const inBody = (yaw: number, v: number[]): number[] =>
  [v[0] * math.cos(yaw) - v[2] * math.sin(yaw), v[1], v[0] * math.sin(yaw) + v[2] * math.cos(yaw)]

const otherSide = (segment: string) => segment.replace(/[LR]$/, s => (s === 'L' ? 'R' : 'L'))

export function endsOf(rig: Rig, body: string, clip: string, segment: string, t: number): number[] {
  const measured = rig.ends?.[body]
  if (!measured) throw new Error(`motion3d: the rig has no ends for ${body}; bake it`)
  const c = clipOf(rig, clip)
  const e = measured[c.source]
  if (!e) throw new Error(`motion3d: the rig has no ends of ${c.source} for ${body}; bake it`)
  const rows = e[c.mirrored ? otherSide(segment) : segment] as number[][]
  if (!rows) throw new Error(`motion3d: the rig measures no segment ${segment}`)
  const f = Math.min(rows.length - 1, Math.max(0, t * e.fps))
  const i = Math.floor(f), s = f - i
  const a = rows[i], b = rows[Math.min(rows.length - 1, i + 1)]
  const got = s === 0 ? a : a.map((v, k) => v + (b[k] - v) * s)
  return c.mirrored ? got.map((v, k) => (k % 3 === 0 ? -v : v)) : got
}

export function drawnAt(rig: Rig, body: string, anim: Anim, clip: string, segment: string, t: number): number[] {
  const at = endsOf(rig, body, clip, segment, t)
  const c = clipOf(rig, clip)
  const how = carries(c, anim)
  if (!how.carries) return at.slice(0, 3)
  const hips = endsOf(rig, body, clip, 'torso', t), rest = endsOf(rig, body, clip, 'torso', 0)
  const a = how.turns ? -curveAt(c.measure, t)[2] * DEG : 0
  const x = at[0] - hips[0], z = at[2] - hips[2]
  return [rest[0] + x * math.cos(a) + z * math.sin(a), at[1], rest[2] - x * math.sin(a) + z * math.cos(a)]
}

export function rootIn(rig: Rig, anim: Anim, clip: string, t: number): { at: number[]; turn: number } {
  const c = clipOf(rig, clip)
  const how = carries(c, anim)
  if (!how.carries) return { at: [0, 0, 0], turn: 0 }
  const [f, l, turn] = curveAt(c.measure, t)
  return { at: [l * c.scale, 0, f * c.scale], turn: how.turns ? turn * DEG : 0 }
}

export const segmentOf = (bone: string): string => {
  const seg = BONES[bone]
  if (!seg) throw new Error(`motion3d: ${bone} is no bone it knows: ${Object.keys(BONES).join(', ')}`)
  return seg
}

export function spotIn(rig: Rig, body: string, anim: Anim, clip: string, bones: string[], t: number): number[] {
  const { at, turn } = rootIn(rig, anim, clip, t)
  if (!bones.length) {
    if (!clipOf(rig, clip).loop) return at
    const climb = endsOf(rig, body, clip, 'torso', t)[1] - endsOf(rig, body, clip, 'torso', 0)[1]
    return [at[0], at[1] + climb, at[2]]
  }
  const drawn = bones.map(b => drawnAt(rig, body, anim, clip, segmentOf(b), t))
  const mid = [0, 1, 2].map(i => drawn.reduce((s, p) => s + p[i], 0) / drawn.length)
  return add(at, fromBody(turn, mid))
}

export function axes(yaw: number, n: number[] = [0, 1, 0]): Axes {
  const square = (v: number[]) => {
    const s = sub(v, scaled(n, dot(v, n)))
    const l = math.hypot(s[0], s[1], s[2])
    return l > 1e-6 ? scaled(s, 1 / l) : undefined
  }
  const z = square([math.sin(yaw), 0, math.cos(yaw)]) ?? square([0, 1, 0])
  if (!z) throw new Error(`motion3d: a point faces along its normal ${n.join(', ')}, and straight up is its normal too`)
  return { x: cross(n, z), y: n, z }
}
export const inAxes = (a: Axes, v: number[]) => [dot(v, a.x), dot(v, a.y), dot(v, a.z)]

// What the clip was measured against, by its touches: `things.face`, a wall its hands or feet are on,
// `{ at: [x, z], normal: degrees }`, its normal out of it toward the body.
export function faceOf(rig: Rig, body: string, clip: string): { at: number[]; normal: number } | undefined {
  const c = clipOf(rig, clip)
  const things = rig.touches?.[body]?.[c.source]?.things as { face?: { at: number[]; normal: number } } | undefined
  return things?.face
}

const FEET = ['LeftFoot', 'RightFoot']

// Whether a clip has the feet on the floor at the frame its spot is on its point (`on`: the first, or
// the last for `end`): its spot the feet, and its soles planted on the ground then, by its touches.
export function onFloor(rig: Rig, body: string, clip: string, spot: string[], on: string | undefined): boolean {
  if (spot.length !== FEET.length || !FEET.every(b => spot.includes(b))) return false
  const c = clipOf(rig, clip)
  const touch = rig.touches?.[body]?.[c.source]
  if (!touch) return false
  const t = on === 'end' ? c.measure.dur : 0
  // A plant's run is read a frame at a time: it reaches the frame within one of it.
  const frame = touch.dur / (touch.frames as number)
  return touch.plants.some(p => p.point.startsWith('sole') && p.on === 'ground' && p.from <= t + frame && p.to >= t - frame)
}

export function offsetsOf(rig: Rig, body: string, anim: Anim, clip: string, judge: Judge): { offsets: Offsets; ended?: Ended } {
  const c = clipOf(rig, clip)
  const dur = c.measure.dur
  const P0 = spotIn(rig, body, anim, clip, judge.spot, 0), P1 = spotIn(rig, body, anim, clip, judge.spot, dur)
  if (judge.after) {
    if (judge.spot.length) throw new Error(`motion3d: ${clip} is held from where the clip before ends the root, so its spot is the root`)
    // Its spot the root, from where the clip before ends it, going where this clip carries it, the body
    // facing as that clip ends it; measured against what that clip was, in the frame this one starts in.
    const was = judge.after
    const moved = inAxes(was.axes, fromBody(was.facing, sub(P1, P0)))
    return { offsets: { beginOffset: was.root, endOffset: add(was.root, moved), beginTurn: was.turn, normal: inBody(was.facing, was.normal) } }
  }
  // The feet on the floor at the frame the spot is on its point: measured from the floor, square under
  // the spot then, at the height of the toes' tips, so the soles and not the ankles meet it.
  const floor = judge.on !== 'face' && onFloor(rig, body, clip, judge.spot, judge.on)
  const under = (P: number[], t: number) => {
    if (!floor) return P
    const l = endsOf(rig, body, clip, 'footL', t), r = endsOf(rig, body, clip, 'footR', t)
    return [P[0], P[1] - ((l[1] + r[1]) / 2 - Math.min(l[4], r[4])), P[2]]
  }
  if (judge.on === 'both') {
    const above = [0, P0[1] - under(P0, 0)[1], 0]
    return { offsets: { beginOffset: above, endOffset: above, beginTurn: 0 } }
  }
  if (judge.on === 'begin') {
    const T = under(P0, 0)
    return { offsets: { beginOffset: inAxes(axes(0), sub(P0, T)), endOffset: inAxes(axes(0), sub(P1, T)), beginTurn: 0 } }
  }
  if (judge.on === 'end') {
    const turn = rootIn(rig, anim, clip, dur).turn
    const T = under(P1, dur)
    return { offsets: { beginOffset: inAxes(axes(turn), sub(P0, T)), endOffset: inAxes(axes(turn), sub(P1, T)), beginTurn: -turn / DEG } }
  }
  if (judge.on === 'face') {
    const face = faceOf(rig, body, clip)
    if (!face) throw new Error(`motion3d: ${clip} is held against the plane its hands or feet are on, and the rig measures none (its touches' face)`)
    const n = [math.sin(face.normal * DEG), 0, math.cos(face.normal * DEG)]
    // The plane's facing: into it, against its normal; or along it the way the clip runs, square to its
    // normal, toward where the spot ends.
    const way = sub(P1, P0)
    const along = sub(way, scaled(n, dot(way, n)))
    const yaw = judge.facing === 'into' ? math.atan2(-n[0], -n[2]) : math.atan2(along[0], along[2])
    const a = axes(yaw, n)
    // The place on the plane where the spot starts, square under it.
    const on = [face.at[0], 0, face.at[1]]
    const T0 = sub(P0, scaled(n, dot(sub(P0, on), n)))
    const begin = inAxes(a, sub(P0, T0))
    const root = rootIn(rig, anim, clip, dur)
    return {
      offsets: { beginOffset: begin, endOffset: c.loop ? begin : inAxes(a, sub(P1, T0)), beginTurn: -yaw / DEG, normal: n },
      ended: { root: inAxes(a, sub(root.at, T0)), turn: (root.turn - yaw) / DEG, axes: a, facing: root.turn, normal: n },
    }
  }
  throw new Error(`motion3d: ${clip} is on none of both, begin, end, face, and after none`)
}

// A clip's judgement: its rig entry's `held`, which every clip gives; one that gives none throws, naming it.
export const heldOf = (rig: Rig, clip: string): Held => {
  const e = rig.clips[clip] as unknown
  const held = typeof e === 'object' && e !== null ? (e as { held?: Held }).held : undefined
  if (!held) throw new Error(`motion3d: the rig's clip ${clip} gives no held: every clip says its spot and how it meets its point`)
  return held
}

const round = (v: number, k = 1000) => Math.round(v * k) / k + 0

export function rigOffsets(rig: Rig, anim: Anim, judge: (clip: string) => Held = clip => heldOf(rig, clip)): Record<string, Record<string, Offsets>> {
  const out: Record<string, Record<string, Offsets>> = {}
  for (const body of Object.keys(rig.ends ?? {})) {
    const got: Record<string, Offsets> = {}
    const ended: Record<string, Ended | undefined> = {}
    const done = new Set<string>()
    const make = (clip: string, seen: string[] = []) => {
      if (done.has(clip)) return
      if (seen.includes(clip)) throw new Error(`motion3d: ${[...seen, clip].join(' after ')}: a clip held after itself`)
      const held = judge(clip)
      let after: Ended | undefined
      if (held.after !== undefined) {
        if (!rig.clips[held.after]) throw new Error(`motion3d: ${clip} is held after ${held.after}, which is no clip of the rig`)
        make(held.after, [...seen, clip])
        after = ended[held.after]
        if (!after) throw new Error(`motion3d: ${clip} is held after ${held.after}, which is not held against a wall (on: face)`)
      }
      const r = offsetsOf(rig, body, anim, clip, { spot: held.spot ?? [], on: held.on, facing: held.facing, after })
      got[clip] = {
        beginOffset: r.offsets.beginOffset.map(v => round(v)),
        endOffset: r.offsets.endOffset.map(v => round(v)),
        beginTurn: round(r.offsets.beginTurn, 100),
        ...(r.offsets.normal ? { normal: r.offsets.normal.map(v => round(v)) } : {}),
      }
      ended[clip] = r.ended
      done.add(clip)
    }
    for (const clip of Object.keys(rig.clips)) make(clip)
    out[body] = got
  }
  return out
}
