// puppet3d's own mod for itself: the word `pureQuadrupedDriver`, the solver that walks a body on four
// legs. A scene that names `puppet3d` in `world.puppet3d.mods.behaviors` has it.
//
// It senses the ground, the land's height wherever it asks, and works the body out from that: where each
// foot is put down, how each foot swings, how the two ends of the body ride over the ground on their
// legs, and how each leg bends between its top and its foot.
//   a foot coming down    is put on the land's height at the spot it lands on;
//   a foot swinging       is never let under the land it passes over;
//   the body              rides the land as it lies under its hind end and under its fore end, so it
//                         pitches up a slope and down one;
//   a standing leg        reaches from its top to its foot on the land, and a leg that cannot reach
//                         holds its end of the body down.
// It gives off `sprawlStride`, how far round its stride the body is, 0 to 1, the left hind foot coming
// down at its pace's `fall`. It leaps.
//
// Its numbers are the `walk` block of the body's sheet, metres, seconds and radians. Along the body, `u`
// is metres ahead of the hip joint and `y` metres up:
//   centre   the row's `pos` ahead of the hip joint.
//   hip, withers, span   the hip joint over the ground, the top of the fore leg over the ground, and
//            that top ahead of the hip joint, standing.
//   hoof     `{ hind, fore }`: the bottom of the pastern over the ground, of a hind foot and of a fore.
//   homes    `{ hind, fore }`: where a foot stands under a still body, ahead of the hip joint.
//   stance   `{ hip, shoulder, hind, fore }`: how far to each side of the middle the hip joints, the
//            fore legs' tops, the hind feet and the fore feet are.
//   hind, fore   a leg: `bones`, four lengths from the top, thigh, gaskin, cannon and pastern, or upper
//            arm, forearm, cannon and pastern; `bend` 1 puts the upper joint ahead of the leg's line
//            (the stifle), -1 behind it (the elbow). `out`, five numbers, one for each point of the
//            leg from its top to the bottom of its pastern: how far that point stands out of the leg's
//            plane, metres, to the leg's own side. `straight`: the share of their two lengths the leg's
//            two upper bones reach at the most. `cannon` `{ follow, rest, flex }`: the cannon points
//            `follow` of the way with the line from foot to hip, `rest` more, and `flex` more at the top
//            of a swing. `pastern` `{ rest, sink, flex }`: it slopes back `rest`, `sink` more under the
//            most load, and folds forward `flex` at the top of a swing. A fore leg's `blade` `{ length,
//            rest, follow }` is the shoulder blade its upper arm hangs from.
//   gait     `paces`, slowest first, each `{ name, speed, cycle, air, fall, lift, crouch }`, a speed
//            between two paces going by each of their numbers between the two, each foot's `fall` the
//            short way round the stride (0.8 to 0 by way of 0.9, never back through 0.4); `reach`,
//            `lead`, `still`, `settle`, `fold`; `hurry`: a foot standing is lifted in its turn, and its
//            turn is brought round sooner when the body would otherwise leave it further behind than a
//            steady stride leaves a foot (as it does setting off from a stand, where every foot waits
//            its turn), the stride going round at most `hurry` times as fast as its pace's `cycle`; 1
//            never hurries it. `puppet3d.feet.ts` measures what it does.
//   spring   each end of the body is a weight on its legs: `gravity`, `k`, `c`, `cap`, `taut`, `give`.
//   ride     the body rides the land as it lies for this far each way along it.
//   back     `{ arch, shorten, span, ease }`.
//   spine    the points of the back from the rump to the breast, each [u, y].
//
// The layouts it stands: the `pureQuadrupedLayout` (the four legs and the spine between them) and the
// `awolQuadrupedLayout`, the AWOL bones every AWOL animal on four legs is made on:
//   pelvis, spine 1           the root and the bone on it, both from the pelvis to spine 2;
//   spine 2 … spine 5, chest  each from its joint to the next, the chest to the neck;
//   left/right hip, stifle, hock, hind paw            a hind leg from the hip joint down;
//   left/right shoulder, elbow, wrist, front paw      a fore leg the same, from the top of its upper arm;
//   neck, head, jaw, left ear, right ear              carried by the chest as they stand from it at rest;
//   tail 1 … tail 7                                   carried by the pelvis as they stand from it at rest.
// The bones it does not stand are played by the driver's cues from where they stand at rest, and carried
// by the bone that carries them as it stands now.
import type { Bone, Height, Ridden, Solver, V3 } from './puppet3d.plugin.ts'

type V2 = [number, number]
type Stood = { spine: V3[]; legs: V3[][]; across: V3 }
type Stride = { name: string; speed: number; cycle: number; air: number; fall: number[]; lift: number; crouch: number }
type Leg = {
  blade?: { length: number; rest: number; follow: number }
  bones: number[]; bend: number; out: number[]; straight: number
  cannon: { follow: number; rest: number; flex: number }
  pastern: { rest: number; sink: number; flex: number }
}
type Walk = {
  centre: number; hip: number; withers: number; span: number; hoof: { hind: number; fore: number }
  homes: { hind: number; fore: number }
  stance: { hip: number; shoulder: number; hind: number; fore: number }
  hind: Leg; fore: Leg
  gait: { paces: Stride[]; reach: number; lead: number; still: number; settle: number; fold: number; hurry: number }
  spring: { gravity: number; k: number; c: number; cap: number; taut: number; give: number }
  ride: number
  back: { arch: number; shorten: number; span: number; ease: number }
  spine: number[][]
}
type Leaning = { pts: V3[]; blade?: V3; hind: boolean; over: number }
type Trunk = {
  world(u: number, y: number, s: number): V3
  local(q: V3): V3
  at(u: number, y: number): V2
  forward: V3; right: V3
  hipY: number; pitch: number
}
type Walking = {
  pos: number[]; yaw: number; vel: number[]; spin: number
  cycle: number; waiting: boolean
  planted: V3[]; up: boolean[]; from: V3[]; feet: V3[]; arcs: number[]; loads: number[]; far: number[]
  yH: number; vH: number; yF: number; vF: number
  gather: number
  stride: Stride; trunk: Trunk; legs: Leaning[]; falls: number
  leap?: { t: number; time: number; v: number }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const frac = (v: number) => v - Math.floor(v)
const wrap = (a: number) => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI))
const ease = (t: number) => t * t * (3 - 2 * t)
const dir = (a: number): V2 => [Math.sin(a), Math.cos(a)]
const LEGS = [0, 1, 2, 3]
const hindOf = (j: number) => j % 2 === 0
const sideOf = (j: number) => (j < 2 ? 1 : -1)

function pace(paces: Stride[], v: number): Stride {
  if (v <= paces[0].speed) return { ...paces[0], crouch: paces[0].crouch * Math.max(0, v) / paces[0].speed }
  for (let i = 1; i < paces.length; i++) {
    const a = paces[i - 1], b = paces[i]
    if (v <= b.speed) {
      const t = (v - a.speed) / (b.speed - a.speed)
      return {
        name: t < 0.5 ? a.name : b.name, speed: v, cycle: lerp(a.cycle, b.cycle, t), air: lerp(a.air, b.air, t),
        fall: a.fall.map((n, j) => frac(n + (b.fall[j] - n - Math.round(b.fall[j] - n)) * t)), lift: lerp(a.lift, b.lift, t), crouch: lerp(a.crouch, b.crouch, t),
      }
    }
  }
  return paces[paces.length - 1]
}

function chain(leg: Leg, H: V2, F: V2, load: number, arc: number) {
  const [l1, l2, l3, l4] = leg.bones
  const u = Math.atan2(H[0] - F[0], H[1] - F[1])
  const pastern = -(leg.pastern.rest + leg.pastern.sink * load) * (1 - arc) + leg.pastern.flex * arc
  const cannon = leg.cannon.follow * u + leg.cannon.rest + leg.cannon.flex * arc
  let K: V2 = F, J: V2 = F, d = 0
  const lower = (s: number) => {
    const dp = dir(lerp(pastern, u, s)), dc = dir(lerp(cannon, u, s))
    K = [F[0] + l4 * dp[0], F[1] + l4 * dp[1]]
    J = [K[0] + l3 * dc[0], K[1] + l3 * dc[1]]
    d = Math.hypot(J[0] - H[0], J[1] - H[1])
    return d
  }
  const far = (l1 + l2) * leg.straight, near = Math.abs(l1 - l2) * 1.001
  if (lower(0) > far) {
    let lo = 0, hi = 1
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2
      if (lower(mid) > far) lo = mid
      else hi = mid
    }
    lower(hi)
  }
  const dd = clamp(d, near, far)
  const phi = Math.atan2(J[0] - H[0], H[1] - J[1])
  const alpha = Math.acos(clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1))
  const a = phi + leg.bend * alpha
  const E: V2 = [H[0] + l1 * Math.sin(a), H[1] - l1 * Math.cos(a)]
  return { pts: [H, E, J, K, F] as V2[], stretch: Math.max(0, d - far) }
}

function home(W: Walk, j: number, x: number, z: number, yaw: number): V2 {
  const u = (hindOf(j) ? W.homes.hind : W.homes.fore) - W.centre, s = sideOf(j) * (hindOf(j) ? W.stance.hind : W.stance.fore)
  const sin = Math.sin(yaw), cos = Math.cos(yaw)
  return [x + sin * u + cos * s, z + cos * u - sin * s]
}

function trunkOf(W: Walk, g: Walking, land: Height, squeeze: number): Trunk {
  const sin = Math.sin(g.yaw), cos = Math.cos(g.yaw)
  const forward: V3 = [sin, 0, cos], right: V3 = [cos, 0, -sin]
  const ox = g.pos[0] - sin * W.centre, oz = g.pos[2] - cos * W.centre
  const ride = (u: number) => [-1, -0.5, 0, 0.5, 1].reduce((sum, o) => sum + land(ox + sin * (u + o * W.ride), oz + cos * (u + o * W.ride)), 0) / 5
  const span = W.span * squeeze, lie = Math.atan2(W.withers - W.hip, span)
  const hipY = ride(W.homes.hind) + W.hip - g.stride.crouch + g.yH
  const topY = ride(W.homes.fore) + W.withers - g.stride.crouch + g.yF
  const pitch = Math.atan2(topY - hipY, span) - lie, c = Math.cos(pitch), s = Math.sin(pitch)
  return {
    world: (u, y, s2) => [ox + forward[0] * u + right[0] * s2, y, oz + forward[2] * u + right[2] * s2],
    local: q => { const dx = q[0] - ox, dz = q[2] - oz; return [dx * forward[0] + dz * forward[2], q[1], dx * right[0] + dz * right[2]] },
    at: (u, y) => [u * squeeze * c - y * s, hipY + u * squeeze * s + y * c],
    forward, right, hipY, pitch,
  }
}

function legsOf(W: Walk, g: Walking, t: Trunk): Leaning[] {
  const P = t.at(W.span, W.withers - W.hip)
  const rest = Math.atan2(W.homes.fore - W.span, W.withers - W.hoof.fore)
  return LEGS.map((j): Leaning => {
    const hind = hindOf(j), leg = hind ? W.hind : W.fore, f = t.local(g.feet[j]), free = g.up[j]
    const T: V3 = hind ? [0, t.hipY, sideOf(j) * W.stance.hip] : [P[0], P[1], sideOf(j) * W.stance.shoulder]
    let F: V3 = [f[0], f[1] + (hind ? W.hoof.hind : W.hoof.fore), f[2]]
    const solve = () => {
      const dy = F[1] - T[1], ds = F[2] - T[2], down = Math.hypot(dy, ds) || 1e-6
      const side = sideOf(j), nY = side * ds / down, nS = -side * dy / down
      const lift = (q: V2, o: number): V3 => [q[0], T[1] - q[1] * dy / down + o * nY, T[2] - q[1] * ds / down + o * nS]
      let H: V2 = [T[0], 0]
      if (leg.blade) {
        const turn = leg.blade.rest + leg.blade.follow * (Math.atan2(F[0] - T[0], down) - rest) + t.pitch
        H = [T[0] + leg.blade.length * Math.sin(turn), -leg.blade.length * Math.cos(turn)]
      }
      const stood = chain(leg, H, [F[0], -down], g.loads[j], g.arcs[j])
      const far = leg.bones.reduce((x, y) => x + y) * W.spring.taut, dx = H[0] - F[0], drop = H[1] + down
      const over = Math.hypot(dx, drop) > far && Math.abs(dx) < far ? drop - Math.sqrt(far * far - dx * dx) : 0
      return { stood, lift, over }
    }
    let at3 = solve()
    for (let i = 0; i < 4 && free && at3.stood.stretch > 0; i++) {
      const H = at3.lift(at3.stood.pts[0], leg.out[0]), d = Math.hypot(H[0] - F[0], H[1] - F[1], H[2] - F[2]), pull = (at3.stood.stretch + 0.002) / d
      F = [F[0] + (H[0] - F[0]) * pull, F[1] + (H[1] - F[1]) * pull, F[2] + (H[2] - F[2]) * pull]
      at3 = solve()
    }
    const out = (q: V2, k: number) => { const q3 = at3.lift(q, leg.out[k]); return t.world(q3[0], q3[1], q3[2]) }
    return { pts: at3.stood.pts.map(out), blade: leg.blade ? t.world(T[0], T[1], T[2]) : undefined, hind, over: free ? 0 : at3.over }
  })
}

function settle(W: Walk, g: Walking, land: Height) {
  const squeeze = 1 - W.back.shorten * g.gather
  g.trunk = trunkOf(W, g, land, squeeze)
  g.legs = legsOf(W, g, g.trunk)
  for (let i = 0; i < 6; i++) {
    const over = (hind: boolean) => Math.max(0, ...g.legs.filter(l => l.hind === hind).map(l => l.over))
    const back = over(true), front = over(false)
    if (back < 1e-4 && front < 1e-4) break
    const wasH = g.yH, wasF = g.yF, floor = -W.spring.give
    if (back > 0) { g.yH = Math.max(g.yH - back, Math.min(g.yH, floor)); g.vH = Math.min(g.vH, 0) }
    if (front > 0) { g.yF = Math.max(g.yF - front, Math.min(g.yF, floor)); g.vF = Math.min(g.vF, 0) }
    if (g.yH === wasH && g.yF === wasF) break
    g.trunk = trunkOf(W, g, land, squeeze)
    g.legs = legsOf(W, g, g.trunk)
  }
}

function make(W: Walk, at: Ridden, land: Height): Walking {
  const planted = LEGS.map((j): V3 => { const [x, z] = home(W, j, at.pos[0], at.pos[2], at.yaw); return [x, land(x, z), z] })
  const copy = () => planted.map(q => [...q] as V3)
  const g: Walking = {
    pos: [...at.pos], yaw: at.yaw, vel: [0, 0, 0], spin: 0, cycle: 0, waiting: true,
    planted, up: [false, false, false, false], from: copy(), feet: copy(), arcs: [0, 0, 0, 0], loads: [0.5, 0.5, 0.5, 0.5], far: [0, 0, 0, 0],
    yH: 0, vH: 0, yF: 0, vF: 0, gather: 0,
    stride: pace(W.gait.paces, 0), trunk: undefined as unknown as Trunk, legs: [], falls: 0,
  }
  settle(W, g, land)
  return g
}

function leap(W: Walk, g: Walking, height: number) {
  const v = Math.sqrt(2 * W.spring.gravity * height)
  g.leap = { t: 0, time: 2 * v / W.spring.gravity, v }
  for (const j of LEGS) { g.up[j] = true; g.from[j] = [...g.planted[j]] }
  g.vH = g.vF = v
  g.waiting = false
}

const TUCK = 0.85

function stride(W: Walk, g: Walking, at: Ridden, dt: number, land: Height) {
  const G = W.gait
  g.spin = wrap(at.yaw - g.yaw) / dt
  g.pos = [...at.pos]
  g.yaw = at.yaw
  g.vel = [...at.vel]
  const vx = g.vel[0], vz = g.vel[2], v = Math.hypot(vx, vz), [px, , pz] = g.pos
  const p = pace(G.paces, v)
  const before = LEGS.map(j => frac(g.cycle - g.stride.fall[j] + g.stride.air))
  g.stride = p
  const S = W.spring
  const duty = 1 - p.air, airtime = p.cycle * p.air, standing = p.cycle * duty
  const round = (j: number) => frac(g.cycle - p.fall[j] + p.air)
  const homeNow = (j: number) => home(W, j, px, pz, g.yaw)
  const target = (j: number, t: number): V3 => {
    const left = airtime * (1 - t), lead = v > 1e-6 ? Math.min(G.reach, v * standing * G.lead) / v : 0
    const [x, z] = home(W, j, px + vx * (left + lead), pz + vz * (left + lead), g.yaw + g.spin * left)
    return [x, land(x, z), z]
  }
  const restless = () => v > G.still || g.planted.some((f, j) => { const [x, z] = homeNow(j); return Math.hypot(f[0] - x, f[2] - z) > G.settle })
  const lift = (j: number) => { g.up[j] = true; g.from[j] = [...g.planted[j]] }
  if (g.leap) {
    const J = g.leap
    J.t += dt
    const s = Math.min(1, J.t / J.time), e = ease(s), rise = Math.max(0, J.v * J.t - S.gravity * J.t * J.t / 2)
    g.vH -= S.gravity * dt; g.yH += g.vH * dt
    g.vF -= S.gravity * dt; g.yF += g.vF * dt
    g.feet = LEGS.map((j): V3 => {
      const from = g.from[j], to = target(j, 1), x = lerp(from[0], to[0], e), z = lerp(from[2], to[2], e)
      return [x, Math.max(land(x, z), lerp(from[1], to[1], e) + rise * TUCK + p.lift * Math.sin(Math.PI * s)), z]
    })
    g.arcs = LEGS.map(() => Math.sin(Math.PI * s))
    g.loads = [0, 0, 0, 0]
    if (J.t >= J.time) {
      for (const j of LEGS) { g.planted[j] = target(j, 1); g.up[j] = false; g.far[j] = 0 }
      g.leap = undefined
      g.falls++
    }
    return
  }
  if (g.waiting && restless()) {
    const due = LEGS.map(j => (1 - round(j)) % 1), j = due.indexOf(Math.min(...due))
    g.cycle = frac(g.cycle + due[j])
    lift(j)
    g.waiting = false
  }
  // How fast the stride goes round, strides a second: its pace's, or as much faster as brings round the
  // turn of each foot standing by the time the body has left it as far behind as a steady stride leaves
  // a foot, to `hurry` times its pace's. `far` is that distance for each foot, at the fastest the body
  // has gone since the foot was put down, so a body slowing down hurries no foot; a turn less than a
  // step late is not hurried.
  const furthest = v * standing - Math.min(G.reach, v * standing * G.lead)
  for (const j of LEGS) g.far[j] = Math.max(g.far[j], furthest)
  const rate = () => {
    if (v <= G.still) return 1 / p.cycle
    let most = 1 / p.cycle
    for (const j of LEGS) {
      if (g.up[j]) continue
      const [x, z] = homeNow(j), behind = -((g.planted[j][0] - x) * vx + (g.planted[j][2] - z) * vz) / v
      const left = (g.far[j] - behind) / v, turn = 1 - round(j)
      if (turn * p.cycle - left <= dt) continue
      most = left > 0 ? Math.max(most, turn / left) : Infinity
    }
    return Math.min(most, G.hurry / p.cycle)
  }
  if (!g.waiting) {
    const was = before
    g.cycle = frac(g.cycle + dt * rate())
    for (const j of LEGS) {
      const now = round(j)
      if (g.up[j] && (now >= p.air || was[j] - now > 0.5)) {
        g.planted[j] = target(j, 1)
        g.up[j] = false
        g.far[j] = furthest
        g.falls++
      }
    }
    const going = restless()
    for (const j of LEGS) if (!g.up[j] && going && was[j] - round(j) > 0.5) lift(j)
    if (!going && !g.up.some(Boolean)) g.waiting = true
  }
  const progress = LEGS.map(j => (g.up[j] ? Math.min(1, round(j) / p.air) : 0))
  g.feet = g.planted.map((f, j): V3 => {
    if (!g.up[j]) return f
    const s = progress[j], e = ease(s), from = g.from[j], to = target(j, s)
    const x = lerp(from[0], to[0], e), z = lerp(from[2], to[2], e)
    return [x, Math.max(land(x, z), lerp(from[1], to[1], e) + p.lift * Math.sin(Math.PI * s)), z]
  })
  g.arcs = progress.map(t => Math.sin(Math.PI * t) * Math.min(1, p.lift / G.fold))
  g.loads = LEGS.map(j => {
    if (g.up[j]) return 0
    if (g.waiting) return 0.5
    const r = round(j)
    return r >= p.air ? Math.sin(Math.PI * (r - p.air) / duty) : 0.5
  })
  const mean = 2 * duty * 2 / Math.PI
  const push = (a: number, b: number) => (g.waiting ? 1 : Math.min(S.cap, (g.loads[a] + g.loads[b]) / mean))
  const aH = S.gravity * (push(0, 2) - 1) - S.k * g.yH - S.c * g.vH
  const aF = S.gravity * (push(1, 3) - 1) - S.k * g.yF - S.c * g.vF
  g.vH += aH * dt; g.yH += g.vH * dt
  g.vF += aF * dt; g.yF += g.vF * dt
}

function gathered(W: Walk, g: Walking): number {
  const sin = Math.sin(g.yaw), cos = Math.cos(g.yaw)
  const off = (j: number) => { const [x, z] = home(W, j, g.pos[0], g.pos[2], g.yaw); return (g.feet[j][0] - x) * sin + (g.feet[j][2] - z) * cos }
  return clamp(((off(0) + off(2)) / 2 - (off(1) + off(3)) / 2) / W.back.span, -1, 1)
}

function step(W: Walk, g: Walking, at: Ridden, dt: number, land: Height) {
  stride(W, g, at, dt, land)
  g.gather += (gathered(W, g) - g.gather) * (1 - Math.exp(-dt / W.back.ease))
  settle(W, g, land)
}

function stood(W: Walk, g: Walking): Stood {
  const t = g.trunk
  const spine = W.spine.map(([u, y]): V3 => {
    const q = t.at(u, y + W.back.arch * g.gather * Math.sin(Math.PI * clamp(u / W.span, 0, 1)))
    return t.world(q[0], q[1], 0)
  })
  return { spine, legs: g.legs.map(l => (l.blade ? [l.blade, ...l.pts] : l.pts)), across: t.right }
}

// The pureQuadrupedLayout: spine.<i> from each point of the back to the next, spine.0 the root;
// hind.<j>.<i> and fore.<j>.<i> each leg's bones from its top, the first on the spine bone whose start
// its top is nearest.
const near = (pts: V3[], q: V3) => {
  let best = 0, d = Infinity
  pts.forEach((p, i) => { const e = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (e < d) { d = e; best = i } })
  return best
}
function pureBones(s: Stood): Bone[] {
  const across = s.across
  const out: Bone[] = s.spine.slice(0, -1).map((a, i) => ({ name: `spine.${i}`, parent: i ? `spine.${i - 1}` : null, head: a, tail: s.spine[i + 1], across }))
  const heads = s.spine.slice(0, -1)
  s.legs.forEach((pts, j) => {
    const part = j % 2 === 0 ? 'hind' : 'fore'
    pts.slice(0, -1).forEach((a, i) => out.push({ name: `${part}.${j}.${i}`, parent: i ? `${part}.${j}.${i - 1}` : `spine.${near(heads, a)}`, head: a, tail: pts[i + 1], across }))
  })
  return out
}

// The awolQuadrupedLayout: each bone stood by the driver, its head and tail as [the back's point] or
// [leg, the leg's point]; each bone carried, and the bone that carries it.
const SPINE: Record<string, [number, number]> = {
  'pelvis': [0, 1], 'spine 1': [0, 1], 'spine 2': [1, 2], 'spine 3': [2, 3], 'spine 4': [3, 4], 'spine 5': [4, 5], 'chest': [5, 6],
}
const AWOL_LEGS: Record<string, [number, number]> = {
  'left hip': [0, 0], 'left stifle': [0, 1], 'left hock': [0, 2], 'left hind paw': [0, 3],
  'left shoulder': [1, 0], 'left elbow': [1, 1], 'left wrist': [1, 2], 'left front paw': [1, 3],
  'right hip': [2, 0], 'right stifle': [2, 1], 'right hock': [2, 2], 'right hind paw': [2, 3],
  'right shoulder': [3, 0], 'right elbow': [3, 1], 'right wrist': [3, 2], 'right front paw': [3, 3],
}
const CARRIED: Record<string, string> = {
  'neck': 'chest', 'head': 'chest', 'jaw': 'chest', 'left ear': 'chest', 'right ear': 'chest',
  'tail 1': 'pelvis', 'tail 2': 'pelvis', 'tail 3': 'pelvis', 'tail 4': 'pelvis', 'tail 5': 'pelvis', 'tail 6': 'pelvis', 'tail 7': 'pelvis',
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l] }
function frame(b: Bone) {
  const y = norm(sub(b.tail, b.head)), a = b.across, k = dot(a, y)
  const z = norm([a[0] - y[0] * k, a[1] - y[1] * k, a[2] - y[2] * k]), x = cross(y, z)
  return { o: b.head, x, y, z }
}
function awolBones(s: Stood, rest: Bone[], play: (carried: Bone[]) => Bone[]): Bone[] {
  const free = rest.filter(r => CARRIED[r.name]).map(r => ({ ...r, parent: r.parent !== null && CARRIED[r.parent] ? r.parent : null }))
  const moved = new Map(play(free).map(b => [b.name, b]))
  const posed = new Map<string, Bone>()
  for (const r of rest) {
    const sp = SPINE[r.name], lg = AWOL_LEGS[r.name]
    if (sp) posed.set(r.name, { ...r, head: s.spine[sp[0]], tail: s.spine[sp[1]], across: s.across })
    else if (lg) posed.set(r.name, { ...r, head: s.legs[lg[0]][lg[1]], tail: s.legs[lg[0]][lg[1] + 1], across: s.across })
  }
  const byName = new Map(rest.map(r => [r.name, r]))
  return rest.map(r => {
    const done = posed.get(r.name)
    if (done) return done
    const on = CARRIED[r.name]
    if (!on) throw new Error(`puppet3d: the awolQuadrupedLayout has no bone ${r.name}`)
    const a = frame(byName.get(on)!), b = frame(posed.get(on)!)
    const local = (v: V3): V3 => [dot(v, a.x), dot(v, a.y), dot(v, a.z)]
    const world = (l: V3): V3 => [b.x[0] * l[0] + b.y[0] * l[1] + b.z[0] * l[2], b.x[1] * l[0] + b.y[1] * l[1] + b.z[1] * l[2], b.x[2] * l[0] + b.y[2] * l[1] + b.z[2] * l[2]]
    const put = (p: V3): V3 => { const w = world(local(sub(p, a.o))); return [b.o[0] + w[0], b.o[1] + w[1], b.o[2] + w[2]] }
    const p = moved.get(r.name)!
    return { ...r, head: put(p.head), tail: put(p.tail), across: world(local(p.across)) }
  })
}

const LAYOUTS: Record<string, (s: Stood, rest: Bone[], play: (carried: Bone[]) => Bone[]) => Bone[]> = {
  pureQuadrupedLayout: s => pureBones(s),
  awolQuadrupedLayout: awolBones,
}

export const pureQuadrupedDriver: Solver<Walk, Walking> = {
  block: 'walk',
  make, step, leap,
  senses: g => ({ sprawlStride: g.cycle }),
  bones(W, g, layout, rest, play) {
    const lay = LAYOUTS[layout]
    if (!lay) throw new Error(`puppet3d: the pureQuadrupedDriver stands the layout ${layout}, and it stands only ${Object.keys(LAYOUTS).join(', ')}`)
    return lay(stood(W, g), rest, play)
  },
}

export const behaviors = () => ({ pureQuadrupedDriver })
