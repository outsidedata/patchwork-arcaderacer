// The sea's server half on scenes this test writes, each with one ocean3d row: the spectrum against
// the formulas, the bands, the stream and the kept pairs, and `waveAt` against a full 256² inverse
// transform of the cascade 0 the GPU draws, computed here in plain JS.
import { expect, test } from 'vitest'
import { boot, seeded, type Row, type Truth, type W } from '#engine/engine.ts'
import { bands, floatAt, grid, KEPT, mirror, ocean3d, RES, shoal, spectrum, spectrumOf, waveAt, type Sea, type Spectrum } from './ocean3d.sim.ts'

const SEA: Sea = {
  windSpeed: 9, windDeg: 30, fetchKm: 300, swellScale: 0.4, swellDeg: 65, amp: 0.35, chop: 1.1, foamRecovery: 0.35, seed: 731,
  patches: [250, 17, 5], shoalDepth: 60, shoalFloor: 0, repeat: 200,
  weather: { windRef: 9, floor: 0.5 },
}
const DEEP = { depth: () => 1000 }

// A truth whose `world.ocean3d` is SEA with `over` written over it and whose one ocean3d row's `t` is
// `t0`, stepped once by 0 s so a probe row hands over the truth's `w`.
function sea(over: Partial<Sea> = {}, t0 = 0) {
  let w: W | undefined
  const t = boot(
    {
      world: { ocean3d: { ...SEA, ...over } },
      prefabs: { ocean3d: { t: t0 }, probe: {} },
      actors: [{ is: 'ocean3d' }, { is: 'probe' }],
    },
    { ocean3d, probe: { before(_me, _dt, got) { w = got } } },
  )
  t.step(0)
  return held(t, w!)
}
const held = (t: Truth, w: W) => ({ t, w, row: () => t.rows.find(r => r.kind === 'ocean3d') as Row & { data: { t: number } }, numbers: t.world.ocean3d as Sea })

// ---------------------------------------------------------------- a reference transform

// An in-place radix-2 transform of n complex values at stride `step` from `at`, with e^{+i}: inverse,
// unnormalised.
function fft(re: Float64Array, im: Float64Array, at: number, step: number, n: number) {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const a = at + i * step, b = at + j * step
      ;[re[a], re[b]] = [re[b], re[a]]
      ;[im[a], im[b]] = [im[b], im[a]]
    }
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2
    for (let s = 0; s < n; s += size) for (let q = 0; q < half; q++) {
      const ang = (2 * Math.PI * q) / size, wr = Math.cos(ang), wi = Math.sin(ang)
      const a = at + (s + q) * step, b = at + (s + q + half) * step
      const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr
      re[b] = re[a] - tr; im[b] = im[a] - ti
      re[a] += tr; im[a] += ti
    }
  }
}
// The field Σ F(k)e^{ik·p} over the grid's cells, at every texel p = (x, y)·patch/RES: the transform of
// rows and then columns, times (−1)^(x+y) for the cells' k starting at −128dK.
function field(re: Float64Array, im: Float64Array): Float64Array {
  for (let y = 0; y < RES; y++) fft(re, im, y * RES, 1, RES)
  for (let x = 0; x < RES; x++) fft(re, im, x, RES, RES)
  const out = new Float64Array(RES * RES)
  for (let i = 0; i < RES * RES; i++) {
    const x = i % RES, y = (i - x) / RES
    out[i] = re[i] * ((x + y) % 2 ? -1 : 1)
    // Every cell has its mirror, so the field is real.
    expect(Math.abs(im[i])).toBeLessThan(1e-9 * (1 + Math.abs(re[i])))
  }
  return out
}
// A packed cascade evolved to t as the brief writes it, and its y, Dx and Dz over the tile, all times amp.
function drawn(s: Spectrum, c: number, sea: Sea, t: number) {
  const { packed, dK } = s.cascades[c]
  const h = { re: new Float64Array(RES * RES), im: new Float64Array(RES * RES) }
  const dx = { re: new Float64Array(RES * RES), im: new Float64Array(RES * RES) }
  const dz = { re: new Float64Array(RES * RES), im: new Float64Array(RES * RES) }
  for (let i = 0; i < RES * RES; i++) {
    const j = mirror(i)
    const [ar, ai, m] = [packed[i * 4], packed[i * 4 + 1], packed[i * 4 + 2]]
    const [br, bi] = [packed[j * 4], packed[j * 4 + 1]]
    const phi = 2 * Math.PI * ((m * t) / sea.repeat - Math.floor((m * t) / sea.repeat))
    const er = Math.cos(phi), ei = Math.sin(phi)
    // h0·e^{iφ} + conj(h0(−k))·e^{−iφ}
    const hr = (ar * er - ai * ei + br * er - bi * ei) * sea.amp
    const hi = (ar * ei + ai * er - br * ei - bi * er) * sea.amp
    h.re[i] = hr; h.im[i] = hi
    const x = i % RES, y = (i - x) / RES
    const kx = (x - 128) * dK, kz = (y - 128) * dK, k = Math.hypot(kx, kz)
    if (k === 0) continue
    // i·(k/|k|)·h
    dx.re[i] = (-hi * kx) / k; dx.im[i] = (hr * kx) / k
    dz.re[i] = (-hi * kz) / k; dz.im[i] = (hr * kz) / k
  }
  return { y: field(h.re, h.im), dx: field(dx.re, dx.im), dz: field(dz.re, dz.im) }
}
const rms = (a: Float64Array) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length)

// ---------------------------------------------------------------- the spectrum

test('two truths make identical spectrum bytes', () => {
  const a = sea(), b = sea()
  const sa = spectrumOf(a.w), sb = spectrumOf(b.w)
  for (let c = 0; c < 3; c++) expect(Buffer.from(sa.cascades[c].packed.buffer).equals(Buffer.from(sb.cascades[c].packed.buffer))).toBe(true)
  expect(sa.pairs).toEqual(sb.pairs)
})

test('a cell\'s amplitude is √(2E|dω/dk|dK²/k) times the Box–Muller pair of its draws from mulberry32(seed + c·1013), E the two lobes', () => {
  const g = 9.81, h = 500
  const lobe = (angle: number, scale: number, U: number, F: number, gamma: number, spread: number, dir: number, fade: number, k: number, theta: number, w: number) => {
    const alpha = 0.076 * (g * F / U ** 2) ** -0.22
    const wp = 22 * (U * F / g ** 2) ** -0.33
    const sigma = w <= wp ? 0.07 : 0.09
    const n = (w - wp) / (sigma * wp * Math.SQRT2)
    const v = w * Math.sqrt(500 / g)
    const tma = v <= 1 ? 0.5 * v ** 2 : v < 2 ? 1 - 0.5 * (2 - v) ** 2 : 1
    const S = scale * tma * alpha * g ** 2 * w ** -5 * Math.exp(-1.25 * (wp / w) ** 4) * gamma ** Math.exp(-(n ** 2))
    const r = w / wp
    const s = (r <= 1 ? 6.97 * r ** 5 : 9.77 * r ** -2.5) + 16 * Math.tanh(Math.min(r, 20)) * spread ** 2
    const norm = s < 5 ? -0.000564 * s ** 4 + 0.00776 * s ** 3 - 0.044 * s ** 2 + 0.192 * s + 0.163 : -4.8e-8 * s ** 4 + 1.07e-5 * s ** 3 - 9.53e-4 * s ** 2 + 0.059 * s + 0.393
    const directed = norm * Math.abs(Math.cos((theta - angle) / 2)) ** (2 * s)
    const broad = (2 / Math.PI) * Math.cos(theta - angle) ** 2
    return S * (broad + (directed - broad) * dir) * Math.exp(-(fade ** 2) * k ** 2)
  }
  for (const [c, x, y] of [[0, 140, 131], [0, 121, 125], [1, 138, 116], [2, 30, 200]]) {
    const dK = (2 * Math.PI) / SEA.patches[c]
    const kx = (x - 128) * dK, kz = (y - 128) * dK, k = Math.hypot(kx, kz)
    const step = (2 * Math.PI) / SEA.repeat
    const m = Math.round(Math.sqrt(g * k * Math.tanh(Math.min(500 * k, 20))) / step)
    const w = m * step
    const slope = (g * (Math.tanh(k * h) + (k * h) / Math.cosh(k * h) ** 2)) / (2 * w)
    // Cell k's energy travels toward −k.
    const theta = Math.atan2(-kx, kz)
    const E = lobe(30 * Math.PI / 180, 1, 9, 300000, 3.3, 0.35, 0.85, 0.003, k, theta, w)
      + lobe(65 * Math.PI / 180, 0.4, Math.max(1.3 * 9, 10), 1e6, 7, 1, 0.95, 0.01, k, theta, w)
    const die = seeded(731 + c * 1013)
    const i = y * RES + x
    for (let n = 0; n < 2 * i; n++) die()
    const u1 = 1 - die(), u2 = die()
    const amplitude = Math.sqrt((2 * E * Math.abs(slope) * dK ** 2) / k)
    const got = grid(SEA, c)
    expect(got.m[i]).toBe(m)
    expect(got.re[i]).toBeCloseTo(amplitude * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2), 12)
    expect(got.im[i]).toBeCloseTo(amplitude * Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2), 12)
    expect(got.re[i]).not.toBe(0)
  }
})

test('ω is a whole multiple of 2π/repeat, and a cell whose ω rounds to 0 carries nothing', () => {
  const g = grid(SEA, 0)
  const dK = (2 * Math.PI) / 250
  for (let i = 0; i < RES * RES; i++) {
    if (!g.m[i]) continue
    expect(Number.isInteger(g.m[i])).toBe(true)
    const x = i % RES, y = (i - x) / RES, k = Math.hypot((x - 128) * dK, (y - 128) * dK)
    const w = Math.sqrt(9.81 * k * Math.tanh(Math.min(500 * k, 20)))
    expect(Math.abs(g.m[i] * ((2 * Math.PI) / 200) - w)).toBeLessThanOrEqual(Math.PI / 200 + 1e-12)
  }
  // Over a repeat of 0.5 s the step is 4π rad/s, and every wave of cascade 0, ω under 4.7, rounds to 0.
  const still = grid({ ...SEA, repeat: 0.5 }, 0)
  expect(still.re.every(v => v === 0) && still.im.every(v => v === 0)).toBe(true)
})

test('crests travel the way their lobe points, clockwise from north as windDeg is: a wind-only sea toward windDeg, a swell-only sea toward swellDeg', () => {
  // waveAt along a 600 m line the lobe's way, at t and half a second on: the shift that lines the two
  // profiles up is how far the crests travelled along that way.
  const travel = (over: Partial<Sea>, deg: number) => {
    const { w, row } = sea(over)
    const way = [Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)]
    const profile = (t: number) => {
      row().data.t = t
      return Array.from({ length: 1200 }, (_, n) => waveAt(w, 40 + way[0] * n * 0.5, -70 + way[1] * n * 0.5, DEEP))
    }
    const a = profile(30), b = profile(30.5)
    let best = 0, most = -Infinity
    for (let s = -60; s <= 60; s++) {
      let c = 0
      for (let n = 60; n < 1140; n++) c += a[n] * b[n + s]
      if (c > most) { most = c; best = s }
    }
    return best * 0.5
  }
  // The wind sea's peak runs at about g/ωp = 13 m/s, the swell's at about 21 m/s.
  const wind = travel({ swellScale: 0 }, 30), swell = travel({ windSpeed: 1e-3, swellScale: 1 }, 65)
  expect(wind).toBeGreaterThan(3)
  expect(wind).toBeLessThan(9)
  expect(swell).toBeGreaterThan(6)
  expect(swell).toBeLessThan(14)
})

test('each cascade keeps only its band, from 6·2π/patch to the next\'s, the first from 1e-4 with no DC and the last to 1e4; the first row and column carry nothing', () => {
  const b = bands(SEA.patches)
  expect(b).toEqual([
    { lo: 1e-4, hi: (12 * Math.PI) / 17 },
    { lo: (12 * Math.PI) / 17, hi: (12 * Math.PI) / 5 },
    { lo: (12 * Math.PI) / 5, hi: 1e4 },
  ])
  for (let c = 0; c < 3; c++) {
    const g = grid(SEA, c)
    const dK = (2 * Math.PI) / SEA.patches[c]
    let inBand = 0
    for (let i = 0; i < RES * RES; i++) {
      const x = i % RES, y = (i - x) / RES, k = Math.hypot((x - 128) * dK, (y - 128) * dK)
      const has = g.re[i] !== 0 || g.im[i] !== 0
      if (x === 0 || y === 0 || k === 0) expect(has).toBe(false)
      else if (k < b[c].lo || k >= b[c].hi) expect(has).toBe(false)
      else { expect(has).toBe(true); inBand++ }
    }
    expect(inBand).toBeGreaterThan(100)
  }
  expect(mirror(129 * RES + 130)).toBe(127 * RES + 126)
  expect(mirror(mirror(5 * RES + 200))).toBe(5 * RES + 200)
})

test('a pair is drawn for every cell before the band mask, so moving a band edge never reshuffles the sea', () => {
  const a = grid(SEA, 1), b = grid({ ...SEA, patches: [250, 17, 4] }, 1)
  const c0 = grid(SEA, 0), d0 = grid({ ...SEA, patches: [250, 20, 5] }, 0)
  let same = 0
  for (let i = 0; i < RES * RES; i++) {
    if (a.re[i] && b.re[i]) { expect(b.re[i]).toBe(a.re[i]); expect(b.im[i]).toBe(a.im[i]); same++ }
    if (c0.re[i] && d0.re[i]) { expect(d0.re[i]).toBe(c0.re[i]); same++ }
  }
  expect(same).toBeGreaterThan(1000)
})

test('a patches that keeps nothing or passes its Nyquist throws with a sentence naming the cascade', () => {
  expect(() => bands([250, 17, 17])).toThrow('ocean3d cascade 1 keeps no waves: the next patch, 17 m, is not smaller than its own 17 m')
  // Cascade 0 of 250 m reaches π·256/250 = 3.217 at most; a next patch of 11 m tops it at 3.427.
  expect(() => bands([250, 11, 5])).toThrow('ocean3d cascade 0\'s band reaches k = 3.427, past its Nyquist of 3.217')
  expect(() => bands([])).toThrow('ocean3d has no patches')
  expect(() => sea({ patches: [250, 11] })).toThrow('ocean3d cascade 0')
  expect(() => bands([250])).not.toThrow()
})

// ---------------------------------------------------------------- the kept pairs

test('the 96 strongest ± pairs of cascade 0 carry over 95 % of its energy, and `total` is the whole band\'s', () => {
  const s = spectrum(SEA)
  const g = grid(SEA, 0)
  const total = g.re.reduce((a, v, i) => a + v * v + g.im[i] ** 2, 0)
  expect(s.pairs.total).toBeCloseTo(total, 9)
  expect(s.pairs.kept).toHaveLength(KEPT)
  const kept = s.pairs.kept.reduce((a, p) => a + p.energy, 0)
  expect(kept / total).toBeGreaterThan(0.95)
  // Strongest first, and no pair left out is stronger than the weakest kept.
  for (let n = 1; n < KEPT; n++) expect(s.pairs.kept[n].energy).toBeLessThanOrEqual(s.pairs.kept[n - 1].energy)
  const inKept = new Set(s.pairs.kept.flatMap(p => [p.i, p.j]))
  const weakest = s.pairs.kept[KEPT - 1].energy
  for (let i = 0; i < RES * RES; i++) {
    const j = mirror(i)
    if (!inKept.has(i)) expect(Math.fround(g.re[i]) ** 2 + Math.fround(g.im[i]) ** 2 + Math.fround(g.re[j]) ** 2 + Math.fround(g.im[j]) ** 2).toBeLessThanOrEqual(weakest * (1 + 1e-6))
  }
})

test('the packed cascade 0 holds exactly the kept pairs and zeros elsewhere; the pairs read the packed float32; the others hold their whole band', () => {
  const s = spectrum(SEA)
  const g0 = grid(SEA, 0), g1 = grid(SEA, 1)
  const kept = new Set(s.pairs.kept.flatMap(p => [p.i, p.j]))
  expect(kept.size).toBe(2 * KEPT)
  const p0 = s.cascades[0].packed, p1 = s.cascades[1].packed
  for (let i = 0; i < RES * RES; i++) {
    if (kept.has(i)) {
      expect([p0[i * 4], p0[i * 4 + 1], p0[i * 4 + 2], p0[i * 4 + 3]]).toEqual([Math.fround(g0.re[i]), Math.fround(g0.im[i]), g0.m[i], 0])
      expect(g0.re[i]).not.toBe(0)
    } else expect([p0[i * 4], p0[i * 4 + 1], p0[i * 4 + 2], p0[i * 4 + 3]]).toEqual([0, 0, 0, 0])
    expect([p1[i * 4], p1[i * 4 + 1], p1[i * 4 + 2]]).toEqual([Math.fround(g1.re[i]), Math.fround(g1.im[i]), g1.m[i]])
  }
  for (const p of s.pairs.kept) {
    expect(p.j).toBe(mirror(p.i))
    expect(p.a).toEqual([p0[p.i * 4], p0[p.i * 4 + 1]])
    expect(p.b).toEqual([p0[p.j * 4], p0[p.j * 4 + 1]])
    expect(p.m).toBe(p0[p.i * 4 + 2])
  }
})

test('the spectrum is memoised per truth by its inputs; amp, chop and foamRecovery are not in the key', () => {
  const { w, row, numbers } = sea()
  const first = spectrumOf(w)
  Object.assign(numbers, { amp: 0.1, chop: 2, foamRecovery: 3, shoalDepth: 4 })
  row().data.t = 17
  expect(spectrumOf(w)).toBe(first)
  // Read through another `w` over the same truth, as the editor's `reading` makes one a call.
  expect(spectrumOf({ ...w })).toBe(first)
  for (const [k, v] of [['windSpeed', 11], ['windDeg', 31], ['fetchKm', 200], ['swellScale', 0.3], ['swellDeg', 60], ['seed', 1], ['repeat', 100], ['patches', [250, 17, 4]]] as const) {
    const again = sea()
    const before = spectrumOf(again.w)
    ;(again.numbers as Record<string, unknown>)[k] = v
    expect(spectrumOf(again.w)).not.toBe(before)
  }
})

// ---------------------------------------------------------------- the drawn surface

test('waveAt is the height of the drawn cascade 0 at the displaced point, against a full 256² inverse transform, within 1 cm: the three-step inversion', () => {
  const { w, row } = sea()
  const s = spectrumOf(w)
  const L = SEA.patches[0]
  let most = 0
  for (const t of [0, 37.25, 123.9, 199.95]) {
    row().data.t = t
    const f = drawn(s, 0, SEA, t)
    const die = seeded(t * 100)
    for (let n = 0; n < 150; n++) {
      const x = Math.floor(die() * RES), y = Math.floor(die() * RES), i = y * RES + x
      const px = (x * L) / RES + SEA.chop * f.dx[i], pz = (y * L) / RES + SEA.chop * f.dz[i]
      const off = Math.abs(waveAt(w, px, pz, DEEP) - f.y[i])
      most = Math.max(most, off)
    }
    expect(rms(f.y)).toBeGreaterThan(1)
  }
  // Three fixed-point steps leave 2.6 mm at worst here; two leave 17 mm.
  expect(most).toBeLessThan(0.01)
})

test('the sea at t is the sea at t + repeat', () => {
  const { w, row } = sea()
  for (const t of [3.5, 88, 150.25]) {
    row().data.t = t
    const a = [waveAt(w, 12, -40, DEEP), waveAt(w, 300.5, 91, DEEP)]
    row().data.t = t + SEA.repeat
    const b = [waveAt(w, 12, -40, DEEP), waveAt(w, 300.5, 91, DEEP)]
    row().data.t = t + 7 * SEA.repeat
    const c = [waveAt(w, 12, -40, DEEP), waveAt(w, 300.5, 91, DEEP)]
    for (let i = 0; i < 2; i++) {
      expect(b[i]).toBeCloseTo(a[i], 9)
      expect(c[i]).toBeCloseTo(a[i], 9)
    }
  }
})

test('the clock moves by dt and wraps at repeat', () => {
  const { t, row } = sea({}, 199.5)
  t.step(0.25)
  expect(row().data.t).toBeCloseTo(199.75, 12)
  t.step(0.5)
  expect(row().data.t).toBeCloseTo(0.25, 12)
  for (let i = 0; i < 1000; i++) t.step(1 / 30)
  expect(row().data.t).toBeCloseTo((0.25 + 1000 / 30) % 200, 9)
})

test('shoaling is shoalFloor + (1 − shoalFloor)·smoothstep(0, shoalDepth, depth): it reaches shoalFloor at the shore and scales the chop too', () => {
  expect(shoal(SEA, 0)).toBe(0)
  expect(shoal(SEA, 60)).toBe(1)
  expect(shoal(SEA, 30)).toBeCloseTo(0.5, 12)
  expect(shoal({ shoalDepth: 10, shoalFloor: 0.25 }, 0)).toBe(0.25)
  expect(shoal({ shoalDepth: 10, shoalFloor: 0.25 }, 2.5)).toBeCloseTo(0.25 + 0.75 * (0.25 ** 2 * 2.5), 12)
  const { w } = sea()
  expect(Math.abs(waveAt(w, 10, 20, { depth: () => 0 }))).toBe(0)
  const floor = sea({ shoalFloor: 0.3 })
  const deep = waveAt(floor.w, 10, 20, DEEP)
  expect(Math.abs(deep)).toBeGreaterThan(0.05)
  // At the floor both the height and the chop are 0.3 of the deep sea's, so it is the deep sea's
  // surface drawn at 0.3 of its size: waveAt at the shore is 0.3 of waveAt over (x, z) of a sea whose
  // chop is 0.3 of its own.
  const smaller = sea({ shoalFloor: 0.3, chop: SEA.chop * 0.3 })
  expect(waveAt(floor.w, 10, 20, { depth: () => 0 })).toBeCloseTo(0.3 * waveAt(smaller.w, 10, 20, DEEP), 12)
  // The depth is read once, at (x, z).
  const asked: number[][] = []
  waveAt(w, 4, 5, { depth: (x, z) => { asked.push([x, z]); return 100 } })
  expect(asked).toEqual([[4, 5]])
})

test('floatAt is the mean of waveAt at the four corners of a span square, its normal the plane through them', () => {
  const { w, row } = sea()
  row().data.t = 61
  const [x, z, span] = [40, -12, 3]
  const a = waveAt(w, x - 1.5, z - 1.5, DEEP), b = waveAt(w, x + 1.5, z - 1.5, DEEP), c = waveAt(w, x - 1.5, z + 1.5, DEEP), d = waveAt(w, x + 1.5, z + 1.5, DEEP)
  const got = floatAt(w, x, z, span, DEEP)
  expect(got.y).toBeCloseTo((a + b + c + d) / 4, 12)
  expect(Math.hypot(...got.normal)).toBeCloseTo(1, 12)
  // The plane through the corners rises (b + d − a − c)/2 over a span in x, and (c + d − a − b)/2 in z.
  const n = got.normal
  expect(-n[0] / n[1]).toBeCloseTo((b + d - a - c) / 2 / span, 12)
  expect(-n[2] / n[1]).toBeCloseTo((c + d - a - b) / 2 / span, 12)
})

test('a float over a short ripple moves less than one sample does', () => {
  // A light wind over a short fetch, no swell, drawn 5 times up: its kept pairs are the waves just
  // over 2.83 m long at the top of cascade 0, and the float is 3 m across.
  const { w, row } = sea({ windSpeed: 2, fetchKm: 8.9, swellScale: 0, amp: 5 })
  const one: number[] = [], float: number[] = []
  for (let n = 0; n < 200; n++) {
    row().data.t = n * 0.1
    one.push(waveAt(w, 7, 3, DEEP))
    float.push(floatAt(w, 7, 3, 3, DEEP).y)
  }
  const spread = (v: number[]) => { const m = v.reduce((a, b) => a + b) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) }
  expect(spread(one)).toBeGreaterThan(0.01)
  expect(spread(float)).toBeLessThan(0.5 * spread(one))
})

