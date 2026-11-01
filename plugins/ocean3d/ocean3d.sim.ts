// The server half of ocean3d: a spectral sea that is the same on every machine, and the height of
// the drawn surface over any point of it. One row of kind `ocean3d` per scene; the browser half
// (`ocean3d.plugin.ts`) draws from that row and the scene's numbers. This half imports no other
// plugin: the ground it shoals over is handed to it, and the wind it swells with is a mod's.
//
// The row carries `t` alone, the sea's clock in seconds: t += dt each step, wrapped into
// [0, repeat). Its prefab is `t` and nothing else, since a prefab field goes onto the row and a row
// goes to every seat every step.
//
// Every other number is fixed, so it is the scene's `world.ocean3d` (`Sea`), which a child scene
// inherits from the manager's (`addons/scenemanager`), read here as `w.world.ocean3d` and by the
// browser half off `plugins.wire.scene.world.ocean3d`:
//   windSpeed      m/s, windDeg the way the wind blows toward, fetchKm its fetch in kilometres.
//   swellScale     the swell's share, swellDeg the way it travels.
//   amp            every wave's height is times amp; chop the horizontal displacement's.
//   foamRecovery   how fast the browser's foam history recovers (its header).
//   seed           the random stream's start.
//   patches        each cascade's tile in metres, largest first.
//   shoalDepth     metres of water over which the sea grows from shoalFloor of itself to all of it.
//   repeat         seconds after which the sea is exactly itself again.
//   weather        { windRef, floor }: how the sea follows the wind its `wind` mod hands it.
//   mods           { wind, land, light } (`addons/scenemanager`'s mods): `wind` is this half's, the
//                  others the browser half's (its header).
// Its other numbers are the browser half's.
//
// The weather. `wind(w)`, the mod a scene names in `world.ocean3d.mods.wind` (weather3d's,
// `weather3d.ocean3d.ts`), is the wind standing now, or undefined; every wave is drawn and floated
// at `ampOf(sea, wind)` = amp·(floor + (1 − floor)·min(1, wind/windRef)), and at amp itself with no
// mod or no wind, where `weather` may be left out. A wind with no `weather` to raise the sea by
// throws. amp is not in the spectrum's key, so a change of weather remakes nothing, and the sky's
// wind fades smoothly, so the sea swells and calms with it. `ampAt(w)` is the amplitude over `w`'s
// rows: the truth's on the server, the drawn ones on the page.
//
// Directions. A way θ is clockwise from north, as weather3d's `windDeg` is: 0 toward −z, 90 toward
// +x. A cell's term h0(k)·e^{i(k·p + ωt)} holds its phase where k·p = −ωt, so the energy put at cell
// k travels toward −k, the way θ = atan2(−kx, kz), and that is the θ its spreading is read at.
//
// The spectrum. Two JONSWAP lobes, g = 9.81 and a depth h of 500 m:
//   wind   angle windDeg, scale 1, U windSpeed, F fetchKm·1000, γ 3.3, spread 0.35,
//          directionality 0.85, shortWaveFade 0.003;
//   swell  angle swellDeg, scale swellScale, U max(1.3·windSpeed, 10), F 1e6, γ 7, spread 1,
//          directionality 0.95, shortWaveFade 0.01.
// Per lobe α = 0.076(gF/U²)^−0.22 and ωp = 22(UF/g²)^−0.33. A cell's ω is √(g·k·tanh(min(500k, 20)))
// put on the nearest whole multiple m of 2π/repeat, so the sea repeats exactly every `repeat`
// seconds; that one ω is used in S, in the spreading's r and in dω/dk, and a cell whose m is 0
// carries nothing.
//   dω/dk = g(tanh kh + kh/cosh² kh)/(2ω)
//   S(ω)  = scale·TMA·α·g²·ω⁻⁵·exp(−1.25(ωp/ω)⁴)·γ^exp(−n²), n = (ω − ωp)/(σ·ωp·√2), σ 0.07 at or
//           below ωp and 0.09 above; TMA, with v = ω√(h/g), is ½v² for v ≤ 1, 1 − ½(2 − v)² for
//           v < 2, and 1 beyond.
//   the spreading, r = ω/ωp: s = (r ≤ 1 ? 6.97r⁵ : 9.77r^−2.5) + 16·tanh(min(r, 20))·spread²;
//           norm = s < 5 ? −0.000564s⁴ + 0.00776s³ − 0.044s² + 0.192s + 0.163
//                        : −4.8e−8s⁴ + 1.07e−5s³ − 9.53e−4s² + 0.059s + 0.393;
//           directed = norm·|cos((θ − angle)/2)|^(2s), broad = (2/π)·cos²(θ − angle), and the
//           spreading is broad + (directed − broad)·directionality.
//   E     = the two lobes' S·spreading, summed, times exp(−shortWaveFade²k²) each.
//
// The grid. Each cascade c is RES × RES cells over a tile of patches[c] metres: dK = 2π/patch and cell
// (x, y), at index y·RES + x, is k = ((x − 128)dK, (y − 128)dK). Its amplitude is
// √(2E|dω/dk|dK²/k) times a gaussian pair (Box–Muller on u1 = 1 − the first draw and u2 = the second:
// √(−2 ln u1)·(cos 2πu2, sin 2πu2)) from mulberry32(seed + c·1013). A pair is drawn for every cell, in
// index order, before the band mask, so moving a band edge never reshuffles the sea. The first row
// and column (k = −128dK) have no mirror on the grid and carry nothing, so every cell's −k is a cell
// (`mirror(i)`) and each transform of the grid is real.
//
// The bands (`bands(patches)`). Cascade c keeps the k from edge(c) = 6·2π/patches[c] up to
// edge(c + 1), the first from 1e-4 (no DC) and the last up to 1e4. Each band but the last must top
// out under its cascade's Nyquist, π·RES/patch; the last's top is the grid's own. A band that keeps
// nothing, because the next patch is not smaller, throws, and so does one past its Nyquist, each
// with a sentence naming the cascade.
//
// `grid(sea, c)` is cascade c's whole band before packing: h0 as re and im, and m, per cell.
// `spectrum(sea)` packs every cascade for the GPU as RES² texels of (re, im, m, 0) in float32. Of
// cascade 0 it keeps the KEPT (96) strongest ± pairs, a cell and its mirror, by |h0(k)|² + |h0(−k)|²
// ties broken by index, and zeroes every other cell of cascade 0, so the drawn cascade 0 and
// `waveAt` are one set of waves. The pairs are read back from the packed float32, so the server and
// the GPU start from the same numbers, and they carry `total`, the whole band's energy before the
// cut. Cascades 1 on draw all their band's detail, waves under edge(1)'s wavelength, which a float's
// span averages out.
//
// A cell evolves as h(k, t) = (h0(k)·e^{iφ} + conj(h0(−k))·e^{−iφ})·ampOf(sea, wind), φ =
// 2π·fract(m·t/repeat), on the server and the GPU alike. The surface over the undisplaced point p
// is y = Σ h(k)e^{ik·p}, moved sideways by chop·D, D = Σ i·(k/|k|)·h(k)e^{ik·p}; a ± pair sums to
// 2·Re of its k's term.
//
// The shoaling factor over water `depth` deep is `shoal(sea, depth)` = shoalFloor + (1 −
// shoalFloor)·smoothstep(0, shoalDepth, depth); it multiplies the height and the chop.
//
// The queries take `ground`, the browser's shape `{ depth(x, z) }`; an actor passes
// `{ depth: (x, z) => depthAt(w, x, z) }`.
//   waveAt(w, x, z, ground)   the height of the drawn surface over (x, z): it reads the depth once, at
//                             (x, z), inverts the horizontal chop with three fixed-point steps on the
//                             kept pairs' displacement, p ← (x, z) − shoal·chop·D(p), and returns
//                             shoal·y(p).
//   floatAt(w, x, z, span, ground)   `{ y, normal }` from waveAt at the four corners of a `span`
//                             square, as terrain3d's `restsAt` samples: y their mean and the normal the
//                             plane through them, so a float does not bob on ripples shorter than
//                             itself.
// `spectrumOf(w)` is the spectrum of the truth's `world.ocean3d`, memoised per truth by `inputs(sea)`,
// the numbers the spectrum reads, `keyed`: amp, chop, foamRecovery and the shoaling never change it
// and are not in the key. The truth is its `world`, which it copies for itself at boot, not the `w`
// it is read through: the editor's `reading` makes a `w` a call, and a panel that redrew the sea four
// times a second made the whole spectrum each time.
// The row's `tick` asks for it, so a bad `patches` throws on the first step.
import { seeded, type Kind, type W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'

export type Sea = {
  windSpeed: number; windDeg: number; fetchKm: number; swellScale: number; swellDeg: number
  amp: number; chop: number; foamRecovery: number; seed: number; patches: number[]
  shoalDepth: number; shoalFloor: number; repeat: number
  weather?: { windRef: number; floor: number }
}
export type Ground = { depth(x: number, z: number): number }
// The `wind` mod ocean3d asks for: the wind standing now over `w`'s rows, or undefined.
export type Wind = (w: W) => number | undefined
export type Grid = { re: Float64Array; im: Float64Array; m: Int32Array }
// A ± pair: cell i (k) and its mirror j (−k), with h0 at each and the multiple m of their ω.
export type Pair = { i: number; j: number; kx: number; kz: number; m: number; a: [number, number]; b: [number, number]; energy: number }
export type Cascade = { patch: number; lo: number; hi: number; dK: number; packed: Float32Array }
export type Spectrum = { key: string; cascades: Cascade[]; pairs: { total: number; kept: Pair[] } }

export const RES = 256
export const KEPT = 96
const G = 9.81
const DEPTH = 500
const HALF = RES / 2

const wrap = (x: number, span: number) => ((x % span) + span) % span
const fract = (x: number) => x - Math.floor(x)
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// mulberry32, the same generator the engine's die is.
export const mulberry32 = (seed: number) => seeded(seed)

// The cell of −k for cell i; the first row and column mirror onto themselves and carry nothing.
export const mirror = (i: number) => {
  const x = i % RES, y = (i - x) / RES
  return ((RES - y) % RES) * RES + ((RES - x) % RES)
}

// The numbers the spectrum is made from, which a change of remakes it; every other number of
// `world.ocean3d` is read as it stands.
export const keyed = ['windSpeed', 'windDeg', 'fetchKm', 'swellScale', 'swellDeg', 'seed', 'repeat', 'patches'] as const
export const inputs = (sea: Sea) => keyed.flatMap(k => sea[k])

export const ampOf = (sea: Pick<Sea, 'amp' | 'weather'>, wind: number | undefined) => {
  if (wind === undefined) return sea.amp
  if (!sea.weather) throw new Error('ocean3d is handed a wind, and world.ocean3d gives no weather { windRef, floor } to raise the sea by')
  const { windRef, floor } = sea.weather
  return sea.amp * (floor + (1 - floor) * Math.min(1, wind / windRef))
}
export const ampAt = (w: W) => ampOf(w.world.ocean3d as Sea, mod<Wind>(w.world, 'ocean3d', 'wind')?.(w))

export const shoal = (sea: Pick<Sea, 'shoalDepth' | 'shoalFloor'>, depth: number) => sea.shoalFloor + (1 - sea.shoalFloor) * smoothstep(0, sea.shoalDepth, depth)

// Each cascade's band [lo, hi) of |k|; throws naming a cascade that keeps nothing or passes its Nyquist.
export function bands(patches: number[]): { lo: number; hi: number }[] {
  if (!patches.length) throw new Error('ocean3d has no patches: it needs at least one cascade')
  const edge = (c: number) => (6 * 2 * Math.PI) / patches[c]
  return patches.map((patch, c) => {
    const lo = c === 0 ? 1e-4 : edge(c)
    const last = c === patches.length - 1
    const hi = last ? 1e4 : edge(c + 1)
    if (hi <= lo) throw new Error(`ocean3d cascade ${c} keeps no waves: the next patch, ${patches[c + 1]} m, is not smaller than its own ${patch} m`)
    const nyquist = (Math.PI * RES) / patch
    if (!last && hi >= nyquist) throw new Error(`ocean3d cascade ${c}'s band reaches k = ${hi.toFixed(3)}, past its Nyquist of ${nyquist.toFixed(3)}: its patch of ${patch} m is too large for the next patch of ${patches[c + 1]} m`)
    return { lo, hi }
  })
}

type Lobe = { angle: number; scale: number; U: number; F: number; gamma: number; spread: number; dir: number; fade: number }
const lobes = (sea: Sea): Lobe[] => [
  { angle: sea.windDeg * (Math.PI / 180), scale: 1, U: sea.windSpeed, F: sea.fetchKm * 1000, gamma: 3.3, spread: 0.35, dir: 0.85, fade: 0.003 },
  { angle: sea.swellDeg * (Math.PI / 180), scale: sea.swellScale, U: Math.max(1.3 * sea.windSpeed, 10), F: 1e6, gamma: 7, spread: 1, dir: 0.95, fade: 0.01 },
]

// One lobe's energy at |k| = k, travelling the way θ, of angular frequency ω.
function lobeEnergy(l: Lobe, k: number, theta: number, w: number): number {
  const alpha = 0.076 * math.pow((G * l.F) / (l.U * l.U), -0.22)
  const wp = 22 * math.pow((l.U * l.F) / (G * G), -0.33)
  const sigma = w <= wp ? 0.07 : 0.09
  const n = (w - wp) / (sigma * wp * Math.SQRT2)
  const v = w * Math.sqrt(DEPTH / G)
  const tma = v <= 1 ? 0.5 * v * v : v < 2 ? 1 - 0.5 * (2 - v) * (2 - v) : 1
  const S = l.scale * tma * alpha * G * G * math.pow(w, -5) * math.exp(-1.25 * math.pow(wp / w, 4)) * math.pow(l.gamma, math.exp(-n * n))
  const r = w / wp
  const s = (r <= 1 ? 6.97 * math.pow(r, 5) : 9.77 * math.pow(r, -2.5)) + 16 * math.tanh(Math.min(r, 20)) * l.spread * l.spread
  const norm = s < 5
    ? -0.000564 * math.pow(s, 4) + 0.00776 * math.pow(s, 3) - 0.044 * math.pow(s, 2) + 0.192 * s + 0.163
    : -4.8e-8 * math.pow(s, 4) + 1.07e-5 * math.pow(s, 3) - 9.53e-4 * math.pow(s, 2) + 0.059 * s + 0.393
  const d = theta - l.angle
  const directed = norm * math.pow(Math.abs(math.cos(d / 2)), 2 * s)
  const broad = (2 / Math.PI) * math.pow(math.cos(d), 2)
  return S * (broad + (directed - broad) * l.dir) * math.exp(-l.fade * l.fade * k * k)
}

// The whole multiple of 2π/repeat nearest the dispersion's ω at |k| = k.
const multiple = (k: number, repeat: number) => Math.round(Math.sqrt(G * k * math.tanh(Math.min(DEPTH * k, 20))) / ((2 * Math.PI) / repeat))

// Cascade c's whole band before packing.
export function grid(sea: Sea, c: number): Grid {
  const { lo, hi } = bands(sea.patches)[c]
  const dK = (2 * Math.PI) / sea.patches[c]
  const step = (2 * Math.PI) / sea.repeat
  const ls = lobes(sea)
  const die = mulberry32(sea.seed + c * 1013)
  const re = new Float64Array(RES * RES), im = new Float64Array(RES * RES), m = new Int32Array(RES * RES)
  for (let i = 0; i < RES * RES; i++) {
    const u1 = 1 - die(), u2 = die()
    const x = i % RES, y = (i - x) / RES
    if (x === 0 || y === 0) continue
    const kx = (x - HALF) * dK, kz = (y - HALF) * dK
    const k = math.hypot(kx, kz)
    if (k < lo || k >= hi) continue
    const mk = multiple(k, sea.repeat)
    if (mk === 0) continue
    const w = mk * step
    const kh = k * DEPTH
    const slope = (G * (math.tanh(kh) + kh / math.pow(math.cosh(kh), 2))) / (2 * w)
    const theta = math.atan2(-kx, kz)
    let E = 0
    for (const l of ls) E += lobeEnergy(l, k, theta, w)
    const amplitude = Math.sqrt((2 * E * Math.abs(slope) * dK * dK) / k)
    const r = Math.sqrt(-2 * math.log(u1))
    re[i] = amplitude * r * math.cos(2 * Math.PI * u2)
    im[i] = amplitude * r * math.sin(2 * Math.PI * u2)
    m[i] = mk
  }
  return { re, im, m }
}

const pack = (g: Grid, keep?: Set<number>) => {
  const out = new Float32Array(RES * RES * 4)
  for (let i = 0; i < RES * RES; i++) {
    if (keep && !keep.has(i)) continue
    out[i * 4] = g.re[i]
    out[i * 4 + 1] = g.im[i]
    out[i * 4 + 2] = g.m[i]
  }
  return out
}

export function spectrum(sea: Sea): Spectrum {
  const b = bands(sea.patches)
  const cascades: Cascade[] = []
  let pairs: Spectrum['pairs'] = { total: 0, kept: [] }
  sea.patches.forEach((patch, c) => {
    const g = grid(sea, c)
    const dK = (2 * Math.PI) / patch
    if (c > 0) return cascades.push({ patch, ...b[c], dK, packed: pack(g) })
    let total = 0
    const all: { i: number; j: number; energy: number }[] = []
    for (let i = 0; i < RES * RES; i++) {
      const e = math.pow(g.re[i], 2) + math.pow(g.im[i], 2)
      total += e
      const j = mirror(i)
      if (j > i && (e > 0 || g.re[j] !== 0 || g.im[j] !== 0)) all.push({ i, j, energy: e + math.pow(g.re[j], 2) + math.pow(g.im[j], 2) })
    }
    all.sort((p, q) => q.energy - p.energy || p.i - q.i)
    const top = all.slice(0, KEPT)
    const packed = pack(g, new Set(top.flatMap(p => [p.i, p.j])))
    cascades.push({ patch, ...b[c], dK, packed })
    pairs = {
      total,
      kept: top.map(({ i, j }) => {
        const x = i % RES, y = (i - x) / RES
        const a: [number, number] = [packed[i * 4], packed[i * 4 + 1]], bb: [number, number] = [packed[j * 4], packed[j * 4 + 1]]
        return { i, j, kx: (x - HALF) * dK, kz: (y - HALF) * dK, m: packed[i * 4 + 2], a, b: bb, energy: math.pow(a[0], 2) + math.pow(a[1], 2) + math.pow(bb[0], 2) + math.pow(bb[1], 2) }
      }),
    }
  })
  return { key: inputs(sea).join(','), cascades, pairs }
}

const memo = new WeakMap<object, Spectrum>()
export function spectrumOf(w: W): Spectrum {
  const sea = w.world.ocean3d as Sea
  const key = inputs(sea).join(',')
  const had = memo.get(w.world)
  if (had?.key === key) return had
  const made = spectrum(sea)
  memo.set(w.world, made)
  return made
}

// The kept pairs' surface at undisplaced (x, z), before amp: [y, Dx, Dz], each pair's term evolved to
// the cycle t/repeat first.
function evolved(s: Spectrum, cycle: number) {
  return s.pairs.kept.map(p => {
    const phi = 2 * Math.PI * fract(p.m * cycle)
    const c = math.cos(phi), n = math.sin(phi)
    const [ar, ai] = p.a, [br, bi] = p.b
    const k = math.hypot(p.kx, p.kz)
    return { kx: p.kx, kz: p.kz, ux: p.kx / k, uz: p.kz / k, hr: ar * c - ai * n + br * c - bi * n, hi: ar * n + ai * c - br * n - bi * c }
  })
}
function surface(terms: ReturnType<typeof evolved>, x: number, z: number): [number, number, number] {
  let y = 0, dx = 0, dz = 0
  for (const q of terms) {
    const th = q.kx * x + q.kz * z
    const c = math.cos(th), n = math.sin(th)
    const gr = q.hr * c - q.hi * n, gi = q.hr * n + q.hi * c
    y += 2 * gr
    dx -= 2 * q.ux * gi
    dz -= 2 * q.uz * gi
  }
  return [y, dx, dz]
}

export function waveAt(w: W, x: number, z: number, ground: Ground): number {
  const sea = w.world.ocean3d as Sea
  const terms = evolved(spectrumOf(w), w.find('ocean3d').data.t / sea.repeat)
  const s = shoal(sea, ground.depth(x, z))
  const amp = ampAt(w)
  const side = s * sea.chop * amp
  let px = x, pz = z
  for (let i = 0; i < 3; i++) {
    const [, dx, dz] = surface(terms, px, pz)
    px = x - side * dx
    pz = z - side * dz
  }
  return s * amp * surface(terms, px, pz)[0]
}

export function floatAt(w: W, x: number, z: number, span: number, ground: Ground): { y: number; normal: [number, number, number] } {
  const h = span / 2
  const a = waveAt(w, x - h, z - h, ground), b = waveAt(w, x + h, z - h, ground)
  const c = waveAt(w, x - h, z + h, ground), d = waveAt(w, x + h, z + h, ground)
  const sx = (b + d - a - c) / (2 * span), sz = (c + d - a - b) / (2 * span)
  const l = math.hypot(sx, 1, sz)
  return { y: (a + b + c + d) / 4, normal: [-sx / l, 1 / l, -sz / l] }
}

export const ocean3d: Kind = {
  tick(me, dt, w) {
    spectrumOf(w)
    me.data.t = wrap(me.data.t + dt, w.world.ocean3d.repeat)
  },
}
