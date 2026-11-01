// track: arcaderacer's circuit, made from the scene's `world.seed` and the `track` block of the
// scene's course file (`world.course`, a json entry of the catalogue), and the questions every racing
// kind asks of it. It has no row and no browser half: the
// circuit is a pure function of the seed and the numbers, so the server and the circuit's look each
// make the same one, once per process for each pair, and no row carries it.
//
// The world is three.js's: y up, the ground the x–z plane, metres. A heading `yaw` faces
// (sin yaw, 0, cos yaw), so yaw 0 faces +z and a positive turn of yaw turns left. The right of a
// heading is (−cos yaw, 0, sin yaw). Along the circuit, `s` is metres from the start line, 0 to
// `length`, the way the race runs; `side` is metres to the right of the centre line.
//
// The course's `track` (`assets/courses/<course>.json`), every number of it in metres, radians or a
// count:
//   points     how many control points the loop is drawn through.
//   radius     [least, most]: how far from the middle each control point stands, rolled.
//   wander     how far off its even share of the turn each point's angle is rolled, as a fraction of
//              that share.
//   hills      { height, waves }: the ground under point k is the sum over the first `waves`
//              harmonics of the loop of `height` / harmonic × a rolled weight and phase, so the
//              road rises and falls smoothly round the loop and joins itself.
//   width      the road, edge to edge.
//   shoulder   from the road's edge to the wall.
//   step       the spacing of the samples the circuit is kept as.
//   smooth     the half-width, in samples, of the window the curvature is averaged over before it
//              banks the road.
//   tightest   the sharpest a bend may be (1/m, of the averaged curvature): a loop with a sharper one
//              is rolled again.
//   steepest   the most the road may climb or fall a metre along, its features' ramps and all: a
//              loop with a steeper slope is rolled again.
//   bank       { gain, most }: the road's cross slope is curvature × `gain`, at most `most`, tilted
//              down on the inside of the turn.
//   straight   the half-length of the stretch the start line is put in the middle of: of every
//              place, the one whose turning over that stretch is least.
//   gap        the least distance kept between two stretches of road that are not each other: a loop
//              whose roads come closer is rolled again.
//   checkpoints how many splits a lap is cut into, evenly by distance.
//   grid       { gap, lane }: grid place g stands g + 1 gaps behind the line, `lane` to the right of
//              the centre on even places and to the left on odd ones.
//   features   a list of stretches with something of their own (Features).
//
// Features. Each is { kind, length, ramp, at?, rise?, depth? }: a stretch `length` long with a `ramp`
// either end over which the road eases into it and out, kept clear of the start's straight and of the
// features placed before it, a ramp's length apart. A `bridge` is put on the straightest stretch there
// is, its deck the mean height of the road along it raised `rise`, level across. A `tunnel` or an
// `underground` is put as near as it fits to `at`, a fraction of the lap from the line to the middle
// of its stretch; an `underground` takes the road `depth` under where it was. A tunnel changes the
// road not at all: what stands over it is the land's. Placed, each is { kind, s0, s1, ramp, deck }:
// the stretch from `s0` to `s1` without its ramps, and `deck` the bridge's height, the tunnel's
// highest road, or an underground's `depth` below 0. `inside(p, s, length)` is how far into it `s`
// is: 0 outside, easing up over a ramp to 1 along it. A loop whose features fit nowhere is rolled
// again.
//
// `build(spec, seed)` is the circuit: `n` samples `step` apart round a loop `length` long, each with
// its centre `x`, `y`, `z`, its heading `yaw`, its signed `curve` (1/m, positive turning left) and its
// `slope`, the cross slope (rise per metre to the right; the surface at `side` is y − side × slope),
// `walls`, how far either side of the centre the walls stand, its placed `features`, and `base`,
// each sample's height before the features changed it. `trackOf(w)`
// is the circuit of the truth the rule runs in: its course file's `track` and `world.seed`;
// `courseOf(from)` the course file of a truth's or a page's scene.
//
// `locate(t, x, z, hint)` finds where a point is on the circuit: the sample `i` behind it, its `s`,
// its `side`, the heading `yaw` there, the road's `height` under it with the bank, the road's `grade`
// (rise per metre ahead), its `slope` and `curve`. With a `hint`, the sample it was near last step,
// it looks a few samples either way of it; with −1 it looks at every sample. `sample(t, s)` is the
// centre line at `s`. `wrap(t, ds)` is a difference of two `s` taken the short way round.
//
// Progress (`progress(t, at, before)`): a racer keeps `dist`, the metres it has come along the
// circuit since the start line, counting back for going backwards, so a lap is `length` of it and a
// racer on the grid, behind the line, starts below 0. `far` is the most of it reached: a lap is done
// when `far` passes a whole number of `length`s, a checkpoint when it passes a whole number of
// `length` / `checkpoints`, so driving back and forth over the line counts nothing twice.
import type { W } from '#engine/engine.ts'
import type { Wire } from '#engine/browser.ts'
import { seeded } from '#engine/engine.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

export type Spec = {
  points: number
  radius: number[]
  wander: number
  hills: { height: number; waves: number }
  width: number
  shoulder: number
  step: number
  smooth: number
  tightest: number
  steepest: number
  bank: { gain: number; most: number }
  straight: number
  gap: number
  checkpoints: number
  grid: { gap: number; lane: number }
  features?: Feature[]
}

// A stretch of the circuit with something of its own (the header's Features).
export type Feature = { kind: 'tunnel' | 'bridge' | 'underground'; length: number; ramp: number; at?: number; rise?: number; depth?: number }
export type Placed = { kind: Feature['kind']; s0: number; s1: number; ramp: number; deck: number }

export type Track = {
  n: number
  step: number
  length: number
  x: Float64Array
  y: Float64Array
  z: Float64Array
  yaw: Float64Array
  curve: Float64Array
  slope: Float64Array
  width: number
  walls: number
  checkpoints: number
  features: Placed[]
  base: Float64Array
}

export type Where = { i: number; s: number; side: number; yaw: number; height: number; grade: number; slope: number; curve: number }

const TAU = Math.PI * 2

// An angle taken to (−π, π].
export const angle = (a: number) => a - TAU * Math.round(a / TAU)

// A closed centripetal Catmull–Rom through the points, `per` samples between each two.
function spline(px: number[], py: number[], pz: number[], per: number): number[][] {
  const n = px.length
  const out: number[][] = []
  for (let k = 0; k < n; k++) {
    const i = [k - 1, k, k + 1, k + 2].map(j => (j + n) % n)
    const P = i.map(j => [px[j], py[j], pz[j]])
    // the knots, spaced by the square root of the distance across the ground
    const t = [0]
    for (let j = 1; j < 4; j++) t.push(t[j - 1] + Math.sqrt(math.hypot(P[j][0] - P[j - 1][0], P[j][2] - P[j - 1][2])))
    for (let q = 0; q < per; q++) {
      const u = t[1] + ((t[2] - t[1]) * q) / per
      const lerp = (a: number[], b: number[], ta: number, tb: number) => a.map((v, c) => ((tb - u) * v + (u - ta) * b[c]) / (tb - ta))
      const A1 = lerp(P[0], P[1], t[0], t[1]), A2 = lerp(P[1], P[2], t[1], t[2]), A3 = lerp(P[2], P[3], t[2], t[3])
      const B1 = lerp(A1, A2, t[0], t[2]), B2 = lerp(A2, A3, t[1], t[3])
      out.push(lerp(B1, B2, t[1], t[2]))
    }
  }
  return out
}

// A window average round a loop, `half` either side.
function average(v: Float64Array, half: number): Float64Array {
  const n = v.length, out = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = -half; j <= half; j++) sum += v[(i + j + n) % n]
    out[i] = sum / (2 * half + 1)
  }
  return out
}

// One roll of the loop: undefined when two of its stretches come within `gap` of each other.
function attempt(spec: Spec, die: () => number): Track | undefined {
  const { points: N, radius: [r0, r1], wander, hills } = spec
  const amp = Array.from({ length: hills.waves }, () => die())
  const phase = Array.from({ length: hills.waves }, () => die() * TAU)
  const px: number[] = [], py: number[] = [], pz: number[] = []
  for (let k = 0; k < N; k++) {
    const a = ((k + (die() - 0.5) * wander) / N) * TAU
    const r = r0 + (r1 - r0) * die()
    px.push(math.sin(a) * r)
    pz.push(math.cos(a) * r)
    let h = 0
    for (let m = 0; m < hills.waves; m++) h += (hills.height / (m + 1)) * amp[m] * math.sin((m + 1) * ((k / N) * TAU) + phase[m])
    py.push(h)
  }
  // dense, then cut at even distances along the ground
  const dense = spline(px, py, pz, 64)
  const along = [0]
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length]
    along.push(along[i - 1] + math.hypot(b[0] - a[0], b[2] - a[2]))
  }
  const total = along[dense.length]
  const n = Math.round(total / spec.step)
  const step = total / n
  const X = new Float64Array(n), Y = new Float64Array(n), Z = new Float64Array(n)
  for (let i = 0, j = 0; i < n; i++) {
    const s = i * step
    while (along[j + 1] < s) j++
    const f = (s - along[j]) / (along[j + 1] - along[j])
    const a = dense[j], b = dense[(j + 1) % dense.length]
    X[i] = a[0] + (b[0] - a[0]) * f
    Y[i] = a[1] + (b[1] - a[1]) * f
    Z[i] = a[2] + (b[2] - a[2]) * f
  }
  // headings and curvature
  const yaw = new Float64Array(n), raw = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n, q = (i + 1) % n
    yaw[i] = math.atan2(X[q] - X[p], Z[q] - Z[p])
  }
  for (let i = 0; i < n; i++) raw[i] = angle(yaw[(i + 1) % n] - yaw[(i - 1 + n) % n]) / (2 * step)
  const curve = average(average(raw, spec.smooth), spec.smooth)
  if (curve.some(c => Math.abs(c) > spec.tightest)) return undefined
  const slope = new Float64Array(n)
  for (let i = 0; i < n; i++) slope[i] = Math.max(-spec.bank.most, Math.min(spec.bank.most, curve[i] * spec.bank.gain))
  // the start line, mid-way along the straightest stretch
  const half = Math.round(spec.straight / step)
  let start = 0, least = Infinity
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = -half; j <= half; j++) sum += Math.abs(curve[(i + j + n) % n])
    if (sum < least) [least, start] = [sum, i]
  }
  const turn = (v: Float64Array) => Float64Array.from({ length: n }, (_, i) => v[(i + start) % n])
  const t: Track = {
    n, step, length: total,
    x: turn(X), y: turn(Y), z: turn(Z), yaw: turn(yaw), curve: turn(curve), slope: turn(average(slope, spec.smooth)),
    width: spec.width, walls: spec.width / 2 + spec.shoulder, checkpoints: spec.checkpoints, features: [], base: turn(Y),
  }
  for (const f of spec.features ?? []) {
    const placed = feature(t, f, spec.straight)
    if (!placed) return undefined
    t.features.push(placed)
  }
  for (let i = 0; i < n; i++) if (Math.abs(t.y[(i + 1) % n] - t.y[i]) / step > spec.steepest) return undefined
  // no two stretches of road within `gap` but where they are one stretch
  const near = Math.ceil((spec.gap * 2 + spec.width) / step) + 1
  const clear = spec.gap + 2 * t.walls
  for (let i = 0; i < n; i += 2) {
    for (let k = i + near; k <= i + n - near; k += 2) {
      const j = k % n
      if (math.hypot(t.x[i] - t.x[j], t.z[i] - t.z[j]) < clear) return undefined
    }
  }
  return t
}

// How far into a feature's stretch `s` is: 0 outside it, rising over its ramps to 1 along it.
export function inside(p: Placed, s: number, length: number): number {
  const from = (((s - (p.s0 - p.ramp)) % length) + length) % length
  const span = p.s1 - p.s0 + 2 * p.ramp
  if (from > span) return 0
  const up = Math.min(from, span - from)
  if (up >= p.ramp) return 1
  const k = up / p.ramp
  return k * k * (3 - 2 * k)
}

// The feature `f` put on the circuit, its stretch kept clear of the start's straight and of every
// feature placed before it, and the road's height changed along it; undefined when it fits nowhere.
function feature(t: Track, f: Feature, straight: number): Placed | undefined {
  const span = f.length + 2 * f.ramp
  const steps = Math.ceil(span / t.step)
  // the stretches it may not touch: the start's straight and the features already placed, with a
  // ramp's length between
  const taken = [{ from: t.length - straight, to: straight }, ...t.features.map(p => ({ from: p.s0 - p.ramp * 2, to: p.s1 + p.ramp * 2 }))]
  const clashes = (a: number) => taken.some(({ from, to }) => {
    const width = (((to - from) % t.length) + t.length) % t.length
    for (let s = a; s <= a + span; s += t.step) if ((((s - from) % t.length) + t.length) % t.length <= width) return true
    return false
  })
  let best = -1, score = Infinity
  for (let i = 0; i < t.n; i++) {
    const a = i * t.step
    if (clashes(a)) continue
    // a bridge on the straightest stretch; anything else as near as it fits to `at` round the lap
    let turning = 0
    for (let k = 0; k <= steps; k++) turning += Math.abs(t.curve[(i + k) % t.n])
    const off = Math.abs(wrap(t, a + span / 2 - (f.at ?? 0.5) * t.length))
    const s = f.kind === 'bridge' ? turning : off
    if (s < score) [score, best] = [s, a]
  }
  if (best < 0) return undefined
  const p: Placed = { kind: f.kind, s0: best + f.ramp, s1: best + f.ramp + f.length, ramp: f.ramp, deck: 0 }
  if (f.kind === 'bridge') {
    let sum = 0, k = 0
    for (let s = p.s0; s <= p.s1; s += t.step, k++) sum += sample(t, s).y
    p.deck = sum / k + (f.rise ?? 0)
  }
  const y = Float64Array.from(t.y)
  for (let i = 0; i < t.n; i++) {
    const w = inside(p, i * t.step, t.length)
    if (!w) continue
    if (f.kind === 'bridge') {
      t.y[i] = y[i] + (p.deck - y[i]) * w
      t.slope[i] = w === 1 ? 0 : t.slope[i] * (1 - w)
    }
    if (f.kind === 'underground') t.y[i] = y[i] - (f.depth ?? 0) * w
  }
  if (f.kind === 'tunnel') p.deck = Math.max(...Array.from({ length: Math.ceil(f.length / t.step) }, (_, k) => sample(t, p.s0 + k * t.step).y))
  if (f.kind === 'underground') p.deck = -(f.depth ?? 0)
  return p
}

const made = new WeakMap<object, Map<number, Track>>()

// The circuit of `spec` and `seed`, the same every time, made once per process.
export function build(spec: Spec, seed: number): Track {
  const bySeed = made.get(spec) ?? new Map<number, Track>()
  made.set(spec, bySeed)
  const had = bySeed.get(seed)
  if (had) return had
  const die = seeded(seed)
  for (let tries = 0; tries < 256; tries++) {
    const t = attempt(spec, die)
    if (!t) continue
    bySeed.set(seed, t)
    return t
  }
  throw new Error(`track: no loop of seed ${seed} in 256 rolls keeps its roads ${spec.gap} m apart, its bends no sharper than ${spec.tightest}, its slopes no steeper than ${spec.steepest} and its features clear of each other`)
}

// The circuit of the truth `w`: its `circuit` row's definition and the scene's seed.
// The course file of the scene a rule runs in (`w`) or a page holds (`plugins.wire`).
export function courseOf(from: W | Wire): any {
  const world = 'find' in from ? from.world : from.scene.world
  if (typeof world?.course !== 'string') throw new Error('track: the scene\'s world names no course')
  return json(from, world.course)
}

// The circuit of the scene a rule runs in, or a page holds.
export function trackOf(from: W | Wire): Track {
  const world = 'find' in from ? from.world : from.scene.world
  if (typeof world?.seed !== 'number') throw new Error('track: the scene has no world.seed')
  return build(courseOf(from).track, world.seed)
}

export const wrap = (t: Track, ds: number) => ds - t.length * Math.round(ds / t.length)

// The centre line at `s`, between its samples.
export function sample(t: Track, s: number): { x: number; y: number; z: number; yaw: number; slope: number; curve: number } {
  const u = (((s % t.length) + t.length) % t.length) / t.step
  const i = Math.floor(u) % t.n, j = (i + 1) % t.n, f = u - Math.floor(u)
  const mix = (v: Float64Array) => v[i] + (v[j] - v[i]) * f
  return { x: mix(t.x), y: mix(t.y), z: mix(t.z), yaw: t.yaw[i] + angle(t.yaw[j] - t.yaw[i]) * f, slope: mix(t.slope), curve: mix(t.curve) }
}

// Where the point (x, z) is on the circuit.
export function locate(t: Track, x: number, z: number, hint: number): Where {
  let best = 0, least = Infinity
  const look = (i: number) => {
    const d = math.pow(t.x[i] - x, 2) + math.pow(t.z[i] - z, 2)
    if (d < least) [least, best] = [d, i]
  }
  if (hint < 0) for (let i = 0; i < t.n; i++) look(i)
  else for (let k = -8; k <= 8; k++) look((((hint + k) % t.n) + t.n) % t.n)
  // the segment behind or ahead of the nearest sample that the point lies along
  const along = (i: number) => {
    const j = (i + 1) % t.n
    const dx = t.x[j] - t.x[i], dz = t.z[j] - t.z[i]
    return ((x - t.x[i]) * dx + (z - t.z[i]) * dz) / (dx * dx + dz * dz)
  }
  let i = best, f = along(best)
  if (f < 0) {
    i = (best - 1 + t.n) % t.n
    f = along(i)
  }
  f = Math.max(0, Math.min(1, f))
  // walked along the centre line until the point is square to it there, as `sample` turns it
  let s = (i + f) * t.step
  let c = sample(t, s)
  for (let k = 0; k < 8; k++) {
    s += (x - c.x) * math.sin(c.yaw) + (z - c.z) * math.cos(c.yaw)
    s = ((s % t.length) + t.length) % t.length
    c = sample(t, s)
  }
  i = Math.floor(s / t.step) % t.n
  const side = (x - c.x) * -math.cos(c.yaw) + (z - c.z) * math.sin(c.yaw)
  const ahead = sample(t, s + t.step), behind = sample(t, s - t.step)
  return { i, s, side, yaw: c.yaw, height: c.y - side * c.slope, grade: (ahead.y - behind.y) / (2 * t.step), slope: c.slope, curve: c.curve }
}

// Where grid place `g` stands, and its heading.
export function gridAt(t: Track, grid: Spec['grid'], g: number): { pos: [number, number, number]; yaw: number; s: number } {
  const s = t.length - (g + 1) * grid.gap
  const c = sample(t, s)
  const side = g % 2 === 0 ? grid.lane : -grid.lane
  const x = c.x - math.cos(c.yaw) * side, z = c.z + math.sin(c.yaw) * side
  return { pos: [x, c.y - side * c.slope, z], yaw: c.yaw, s }
}

// A racer's progress after moving from `before` (its last `s`) to `at.s`: its new `dist` and `far`,
// and the laps and checkpoints that move completed.
export function progress(t: Track, at: Where, before: number, dist: number, far: number): { dist: number; far: number; laps: number; splits: number } {
  const next = dist + wrap(t, at.s - before)
  const top = Math.max(far, next)
  const cut = t.length / t.checkpoints
  const laps = Math.max(0, Math.floor(top / t.length)) - Math.max(0, Math.floor(far / t.length))
  const splits = Math.max(0, Math.floor(top / cut)) - Math.max(0, Math.floor(far / cut))
  return { dist: next, far: top, laps, splits }
}
