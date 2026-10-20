// math: the same bits on every engine. JavaScript leaves `Math.sin`, `cos`, `tan`, `asin`, `acos`,
// `atan`, `atan2`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `exp`, `expm1`, `log`, `log1p`,
// `log2`, `log10`, `pow` (and `**`), `cbrt` and `hypot` to each engine, and engines differ in the last
// bit: node 22 against Chrome 157 differed on 2 to 16 in every 100 inputs of each but `hypot`. A page
// that runs a scene ahead (`addons/predict`) steps the same rules as the server, so a rule that called
// one of them ended a hair from the server's truth.
//
// Each function here is written with `+`, `-`, `*`, `/` and `Math.sqrt` alone, which IEEE 754 rounds
// exactly and every engine computes to the same bit, and with integer work on the two 32-bit halves of
// a double. So each hands back the same double for the same arguments on node, in every browser and
// in every version of either. They are fdlibm (Sun, 1993), ported line for line from V8 12.4's
// `src/base/ieee754.cc`, the same code node 22's `Math` runs but for its `sin` and `cos`; `hypot` is
// V8's own: each argument scaled by the largest, the squares summed with Kahan's compensation, and the
// root scaled back. Each is within 1 ulp of the true value, and each takes and hands back what its
// `Math` namesake does for NaN, ±0 and ±Infinity.
//
// It has a server half only, and no row, no `world.math`, and nothing in `plugins`: a rule, a plugin's
// server half or a mod imports it, `import * as math from '#plugins/math/math.sim.ts'`, and calls
// `math.sin(a)` where it would call `Math.sin(a)`, and `math.pow(a, b)` where it would write `a ** b`.
// What `Math` computes exactly (`sqrt`, `abs`, `floor`, `ceil`, `round`, `trunc`, `sign`, `min`, `max`,
// `fround`, `imul`, `clz32`, `PI`, `E` and the other constants) stays on `Math`. A look, a browser half
// and an extension only draw, and may use `Math`.
//
// Core's three is `outsidedata/three.js`, whose `src/math/DeterministicMath.js` is this file with its
// types taken out, its test pinning the same hashes; every method of three's `src/math` that turns an
// angle calls it, so a rule may use three's vectors, quaternions and matrices. A change here is made
// there too, the fork built and pinned again in `package.json`.

// The two 32-bit halves of a double, read and written through one buffer: `high` is the sign, the
// exponent and the top 20 bits of the mantissa as a signed int, `low` the bottom 32 as an unsigned one.
const f64 = new Float64Array(1)
const i32 = new Int32Array(f64.buffer)
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0
const LO = 1 - HI
const high = (x: number): number => { f64[0] = x; return i32[HI] }
const low = (x: number): number => { f64[0] = x; return i32[LO] >>> 0 }
const words = (hi: number, lo: number): number => { i32[HI] = hi; i32[LO] = lo; return f64[0] }
const withHigh = (x: number, hi: number): number => { f64[0] = x; i32[HI] = hi; return f64[0] }
const withLow = (x: number, lo: number): number => { f64[0] = x; i32[LO] = lo; return f64[0] }

// x·2ⁿ, rounded once.
function scalbn(x: number, n: number): number {
  const two54 = 1.80143985094819840000e+16, twom54 = 5.55111512312578270212e-17, huge = 1.0e+300, tiny = 1.0e-300
  let hx = high(x)
  const lx = low(x)
  let k = (hx & 0x7FF00000) >> 20
  if (k === 0) {
    if ((lx | (hx & 0x7FFFFFFF)) === 0) return x
    x *= two54
    hx = high(x)
    k = ((hx & 0x7FF00000) >> 20) - 54
    if (n < -50000) return tiny * x
  }
  if (k === 0x7FF) return x + x
  k = k + n
  if (k > 0x7FE) return huge * (x < 0 ? -huge : huge)
  if (k > 0) return withHigh(x, (hx & 0x800FFFFF) | (k << 20))
  if (k <= -54) {
    if (n > 50000) return huge * (x < 0 ? -huge : huge)
    return tiny * (x < 0 ? -tiny : tiny)
  }
  k += 54
  return withHigh(x, (hx & 0x800FFFFF) | (k << 20)) * twom54
}

// 396 hex digits of 2/π, 24 bits an entry.
const TWO_OVER_PI = [
  0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C,
  0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A, 0x424DD2, 0xE00649,
  0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44,
  0x84E99C, 0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C, 0x845F8B,
  0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D,
  0x367ECF, 0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5,
  0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330,
  0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08,
  0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA,
  0x73A8C9, 0x60E27B, 0xC08C6B,
]
const NPIO2_HW = [
  0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C,
  0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C,
  0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A,
  0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
  0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
  0x404858EB, 0x404921FB,
]
const PIO2 = [
  1.57079625129699707031e+00, 7.54978941586159635335e-08, 5.39030252995776476554e-15,
  3.28200341580791294123e-22, 1.27065575308067607349e-29, 1.22933308981111328932e-36,
  2.73370053816464559624e-44, 2.16741683877804819444e-51,
]

// __kernel_rem_pio2: the last three bits of N and y[0] + y[1] = x − N·π/2 for a large x, broken into
// `nx` 24-bit pieces of exponent `e0`; double precision (prec 2).
function remPio2Kernel(x: number[], y: number[], e0: number, nx: number): number {
  const two24 = 1.67772160000000000000e+07, twon24 = 5.96046447753906250000e-08
  const jk = 4, jp = jk
  const iq = new Array<number>(20).fill(0), f = new Array<number>(20).fill(0)
  const fq = new Array<number>(20).fill(0), q = new Array<number>(20).fill(0)
  const jx = nx - 1
  let jv = ((e0 - 3) / 24) | 0
  if (jv < 0) jv = 0
  let q0 = e0 - 24 * (jv + 1)
  let i: number, j: number, k: number, fw: number, z: number, n: number, ih: number, carry: number
  j = jv - jx
  const m = jx + jk
  for (i = 0; i <= m; i++, j++) f[i] = j < 0 ? 0 : TWO_OVER_PI[j]
  for (i = 0; i <= jk; i++) {
    for (j = 0, fw = 0.0; j <= jx; j++) fw += x[j] * f[jx + i - j]
    q[i] = fw
  }
  let jz = jk
  for (;;) {
    for (i = 0, j = jz, z = q[jz]; j > 0; i++, j--) {
      fw = (twon24 * z) | 0
      iq[i] = (z - two24 * fw) | 0
      z = q[j - 1] + fw
    }
    z = scalbn(z, q0)
    z -= 8.0 * Math.floor(z * 0.125)
    n = z | 0
    z -= n
    ih = 0
    if (q0 > 0) {
      i = iq[jz - 1] >> (24 - q0)
      n += i
      iq[jz - 1] -= i << (24 - q0)
      ih = iq[jz - 1] >> (23 - q0)
    } else if (q0 === 0) {
      ih = iq[jz - 1] >> 23
    } else if (z >= 0.5) {
      ih = 2
    }
    if (ih > 0) {
      n += 1
      carry = 0
      for (i = 0; i < jz; i++) {
        j = iq[i]
        if (carry === 0) {
          if (j !== 0) {
            carry = 1
            iq[i] = 0x1000000 - j
          }
        } else {
          iq[i] = 0xFFFFFF - j
        }
      }
      if (q0 > 0) {
        if (q0 === 1) iq[jz - 1] &= 0x7FFFFF
        else if (q0 === 2) iq[jz - 1] &= 0x3FFFFF
      }
      if (ih === 2) {
        z = 1 - z
        if (carry !== 0) z -= scalbn(1, q0)
      }
    }
    if (z === 0) {
      j = 0
      for (i = jz - 1; i >= jk; i--) j |= iq[i]
      if (j === 0) {
        for (k = 1; jk >= k && iq[jk - k] === 0; k++) { /* k = the terms needed */ }
        for (i = jz + 1; i <= jz + k; i++) {
          f[jx + i] = TWO_OVER_PI[jv + i]
          for (j = 0, fw = 0.0; j <= jx; j++) fw += x[j] * f[jx + i - j]
          q[i] = fw
        }
        jz += k
        continue
      }
    }
    break
  }
  if (z === 0.0) {
    jz -= 1
    q0 -= 24
    while (iq[jz] === 0) {
      jz--
      q0 -= 24
    }
  } else {
    z = scalbn(z, -q0)
    if (z >= two24) {
      fw = (twon24 * z) | 0
      iq[jz] = (z - two24 * fw) | 0
      jz += 1
      q0 += 24
      iq[jz] = fw
    } else {
      iq[jz] = z | 0
    }
  }
  fw = scalbn(1, q0)
  for (i = jz; i >= 0; i--) {
    q[i] = fw * iq[i]
    fw *= twon24
  }
  for (i = jz; i >= 0; i--) {
    for (fw = 0.0, k = 0; k <= jp && k <= jz - i; k++) fw += PIO2[k] * q[i + k]
    fq[jz - i] = fw
  }
  fw = 0.0
  for (i = jz; i >= 0; i--) fw += fq[i]
  y[0] = ih === 0 ? fw : -fw
  fw = fq[0] - fw
  for (i = 1; i <= jz; i++) fw += fq[i]
  y[1] = ih === 0 ? fw : -fw
  return n & 7
}

// __ieee754_rem_pio2: n, and y[0] + y[1] = x − n·π/2 in [−π/4, π/4].
function remPio2(x: number, y: number[]): number {
  const half = 5.00000000000000000000e-01, two24 = 1.67772160000000000000e+07
  const invpio2 = 6.36619772367581382433e-01
  const pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11
  const pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21
  const pio2_3 = 2.02226624871116645580e-21, pio2_3t = 8.47842766036889956997e-32
  let z = 0, w: number, t: number, r: number, fn: number, i: number, j: number, n: number
  const hx = high(x)
  const ix = hx & 0x7FFFFFFF
  if (ix <= 0x3FE921FB) {
    y[0] = x
    y[1] = 0
    return 0
  }
  if (ix < 0x4002D97C) {
    if (hx > 0) {
      z = x - pio2_1
      if (ix !== 0x3FF921FB) {
        y[0] = z - pio2_1t
        y[1] = (z - y[0]) - pio2_1t
      } else {
        z -= pio2_2
        y[0] = z - pio2_2t
        y[1] = (z - y[0]) - pio2_2t
      }
      return 1
    } else {
      z = x + pio2_1
      if (ix !== 0x3FF921FB) {
        y[0] = z + pio2_1t
        y[1] = (z - y[0]) + pio2_1t
      } else {
        z += pio2_2
        y[0] = z + pio2_2t
        y[1] = (z - y[0]) + pio2_2t
      }
      return -1
    }
  }
  if (ix <= 0x413921FB) {
    t = Math.abs(x)
    n = (t * invpio2 + half) | 0
    fn = n
    r = t - fn * pio2_1
    w = fn * pio2_1t
    if (n < 32 && ix !== NPIO2_HW[n - 1]) {
      y[0] = r - w
    } else {
      j = ix >> 20
      y[0] = r - w
      i = j - ((high(y[0]) >> 20) & 0x7FF)
      if (i > 16) {
        t = r
        w = fn * pio2_2
        r = t - w
        w = fn * pio2_2t - ((t - r) - w)
        y[0] = r - w
        i = j - ((high(y[0]) >> 20) & 0x7FF)
        if (i > 49) {
          t = r
          w = fn * pio2_3
          r = t - w
          w = fn * pio2_3t - ((t - r) - w)
          y[0] = r - w
        }
      }
    }
    y[1] = (r - y[0]) - w
    if (hx < 0) {
      y[0] = -y[0]
      y[1] = -y[1]
      return -n
    }
    return n
  }
  if (ix >= 0x7FF00000) {
    y[0] = y[1] = x - x
    return 0
  }
  z = withLow(z, low(x))
  const e0 = (ix >> 20) - 1046
  z = withHigh(z, ix - (e0 << 20))
  const tx = [0, 0, 0]
  for (i = 0; i < 2; i++) {
    tx[i] = z | 0
    z = (z - tx[i]) * two24
  }
  tx[2] = z
  let nx = 3
  while (tx[nx - 1] === 0) nx--
  n = remPio2Kernel(tx, y, e0, nx)
  if (hx < 0) {
    y[0] = -y[0]
    y[1] = -y[1]
    return -n
  }
  return n
}

// __kernel_cos: cos(x + y) for |x| ≤ π/4, y the tail of x.
function cosKernel(x: number, y: number): number {
  const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03
  const C3 = 2.48015872894767294178e-05, C4 = -2.75573143513906633035e-07
  const C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11
  const ix = high(x) & 0x7FFFFFFF
  if (ix < 0x3E400000) {
    if ((x | 0) === 0) return 1
  }
  const z = x * x
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))))
  if (ix < 0x3FD33333) return 1 - (0.5 * z - (z * r - x * y))
  const qx = ix > 0x3FE90000 ? 0.28125 : words(ix - 0x00200000, 0)
  const iz = 0.5 * z - qx
  const a = 1 - qx
  return a - (iz - (z * r - x * y))
}

// __kernel_sin: sin(x + y) for |x| ≤ π/4, y the tail of x, iy 0 when y is 0.
function sinKernel(x: number, y: number, iy: number): number {
  const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03
  const S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06
  const S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10
  const ix = high(x) & 0x7FFFFFFF
  if (ix < 0x3E400000) {
    if ((x | 0) === 0) return x
  }
  const z = x * x
  const v = z * x
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))
  if (iy === 0) return x + v * (S1 + z * r)
  return x - ((z * (0.5 * y - v * r) - y) - v * S1)
}

const T = [
  3.33333333333334091986e-01, 1.33333333333201242699e-01, 5.39682539762260521377e-02,
  2.18694882948595424599e-02, 8.86323982359930005737e-03, 3.59207910759131235356e-03,
  1.45620945432529025516e-03, 5.88041240820264096874e-04, 2.46463134818469906812e-04,
  7.81794442939557092300e-05, 7.14072491382608190305e-05, -1.85586374855275456654e-05,
  2.59073051863633712884e-05,
]

// __kernel_tan: tan(x + y) for |x| ≤ π/4 when iy is 1, −1/tan(x + y) when iy is −1.
function tanKernel(x: number, y: number, iy: number): number {
  const pio4 = 7.85398163397448278999e-01, pio4lo = 3.06161699786838301793e-17
  let z: number, r: number, v: number, w: number, s: number
  const hx = high(x)
  const ix = hx & 0x7FFFFFFF
  if (ix < 0x3E300000) {
    if ((x | 0) === 0) {
      if (((ix | low(x)) | (iy + 1)) === 0) return 1 / Math.abs(x)
      if (iy === 1) return x
      z = w = x + y
      z = withLow(z, 0)
      v = y - (z - x)
      const a = -1 / w
      let t = a
      t = withLow(t, 0)
      s = 1 + t * z
      return t + a * (s + t * v)
    }
  }
  if (ix >= 0x3FE59428) {
    if (hx < 0) {
      x = -x
      y = -y
    }
    z = pio4 - x
    w = pio4lo - y
    x = z + w
    y = 0.0
  }
  z = x * x
  w = z * z
  r = T[1] + w * (T[3] + w * (T[5] + w * (T[7] + w * (T[9] + w * T[11]))))
  v = z * (T[2] + w * (T[4] + w * (T[6] + w * (T[8] + w * (T[10] + w * T[12])))))
  s = z * x
  r = y + z * (s * (r + v) + y)
  r += T[0] * s
  w = x + r
  if (ix >= 0x3FE59428) {
    v = iy
    return (1 - ((hx >> 30) & 2)) * (v - 2.0 * (x - (w * w / (w + v) - r)))
  }
  if (iy === 1) return w
  z = w
  z = withLow(z, 0)
  v = r - (z - x)
  const a = -1.0 / w
  let t = a
  t = withLow(t, 0)
  s = 1.0 + t * z
  return t + a * (s + t * v)
}

const reduced = [0, 0]

export function sin(x: number): number {
  const ix = high(x) & 0x7FFFFFFF
  if (ix <= 0x3FE921FB) return sinKernel(x, 0, 0)
  if (ix >= 0x7FF00000) return x - x
  const n = remPio2(x, reduced)
  switch (n & 3) {
    case 0: return sinKernel(reduced[0], reduced[1], 1)
    case 1: return cosKernel(reduced[0], reduced[1])
    case 2: return -sinKernel(reduced[0], reduced[1], 1)
    default: return -cosKernel(reduced[0], reduced[1])
  }
}

export function cos(x: number): number {
  const ix = high(x) & 0x7FFFFFFF
  if (ix <= 0x3FE921FB) return cosKernel(x, 0)
  if (ix >= 0x7FF00000) return x - x
  const n = remPio2(x, reduced)
  switch (n & 3) {
    case 0: return cosKernel(reduced[0], reduced[1])
    case 1: return -sinKernel(reduced[0], reduced[1], 1)
    case 2: return -cosKernel(reduced[0], reduced[1])
    default: return sinKernel(reduced[0], reduced[1], 1)
  }
}

export function tan(x: number): number {
  const ix = high(x) & 0x7FFFFFFF
  if (ix <= 0x3FE921FB) return tanKernel(x, 0, 1)
  if (ix >= 0x7FF00000) return x - x
  const n = remPio2(x, reduced)
  return tanKernel(reduced[0], reduced[1], 1 - ((n & 1) << 1))
}

// The rational approximation asin and acos share, R(t) = p/q.
const pS0 = 1.66666666666666657415e-01, pS1 = -3.25565818622400915405e-01
const pS2 = 2.01212532134862925881e-01, pS3 = -4.00555345006794114027e-02
const pS4 = 7.91534994289814532176e-04, pS5 = 3.47933107596021167570e-05
const qS1 = -2.40339491173441421878e+00, qS2 = 2.02094576023350569471e+00
const qS3 = -6.88283971605453293030e-01, qS4 = 7.70381505559019352791e-02
const pio2_hi = 1.57079632679489655800e+00, pio2_lo = 6.12323399573676603587e-17

export function acos(x: number): number {
  const pi = 3.14159265358979311600e+00
  let z: number, p: number, q: number, r: number, w: number, s: number
  const hx = high(x)
  const ix = hx & 0x7FFFFFFF
  if (ix >= 0x3FF00000) {
    if (((ix - 0x3FF00000) | low(x)) === 0) {
      if (hx > 0) return 0.0
      return pi + 2.0 * pio2_lo
    }
    return NaN
  }
  if (ix < 0x3FE00000) {
    if (ix <= 0x3C600000) return pio2_hi + pio2_lo
    z = x * x
    p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))))
    q = 1 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)))
    r = p / q
    return pio2_hi - (x - (pio2_lo - x * r))
  } else if (hx < 0) {
    z = (1 + x) * 0.5
    p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))))
    q = 1 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)))
    s = Math.sqrt(z)
    r = p / q
    w = r * s - pio2_lo
    return pi - 2.0 * (s + w)
  }
  z = (1 - x) * 0.5
  s = Math.sqrt(z)
  const df = withLow(s, 0)
  const c = (z - df * df) / (s + df)
  p = z * (pS0 + z * (pS1 + z * (pS2 + z * (pS3 + z * (pS4 + z * pS5)))))
  q = 1 + z * (qS1 + z * (qS2 + z * (qS3 + z * qS4)))
  r = p / q
  w = r * s + c
  return 2.0 * (df + w)
}

export function asin(x: number): number {
  const huge = 1.000e+300, pio4_hi = 7.85398163397448278999e-01
  let t = 0, w: number, p: number, q: number, c: number, r: number
  const hx = high(x)
  const ix = hx & 0x7FFFFFFF
  if (ix >= 0x3FF00000) {
    if (((ix - 0x3FF00000) | low(x)) === 0) return x * pio2_hi + x * pio2_lo
    return NaN
  } else if (ix < 0x3FE00000) {
    if (ix < 0x3E400000) {
      if (huge + x > 1) return x
    } else {
      t = x * x
    }
    p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))))
    q = 1 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)))
    w = p / q
    return x + x * w
  }
  w = 1 - Math.abs(x)
  t = w * 0.5
  p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))))
  q = 1 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)))
  const s = Math.sqrt(t)
  if (ix >= 0x3FEF3333) {
    w = p / q
    t = pio2_hi - (2.0 * (s + s * w) - pio2_lo)
  } else {
    w = withLow(s, 0)
    c = (t - w * w) / (s + w)
    r = p / q
    p = 2.0 * s * r - (pio2_lo - 2.0 * c)
    q = pio4_hi - 2.0 * w
    t = pio4_hi - (p - q)
  }
  return hx > 0 ? t : -t
}

const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00]
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17]
const AT = [
  3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01,
  -1.11111104054623557880e-01, 9.09088713343650656196e-02, -7.69187620504482999495e-02,
  6.66107313738753120669e-02, -5.83357013379057348645e-02, 4.97687799461593236017e-02,
  -3.65315727442169155270e-02, 1.62858201153657823623e-02,
]

export function atan(x: number): number {
  const huge = 1.0e300
  let id: number
  const hx = high(x)
  const ix = hx & 0x7FFFFFFF
  if (ix >= 0x44100000) {
    if (ix > 0x7FF00000 || (ix === 0x7FF00000 && low(x) !== 0)) return x + x
    if (hx > 0) return ATANHI[3] + ATANLO[3]
    return -ATANHI[3] - ATANLO[3]
  }
  if (ix < 0x3FDC0000) {
    if (ix < 0x3E400000) {
      if (huge + x > 1) return x
    }
    id = -1
  } else {
    x = Math.abs(x)
    if (ix < 0x3FF30000) {
      if (ix < 0x3FE60000) {
        id = 0
        x = (2.0 * x - 1) / (2.0 + x)
      } else {
        id = 1
        x = (x - 1) / (x + 1)
      }
    } else if (ix < 0x40038000) {
      id = 2
      x = (x - 1.5) / (1 + 1.5 * x)
    } else {
      id = 3
      x = -1.0 / x
    }
  }
  let z = x * x
  const w = z * z
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))))
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))))
  if (id < 0) return x - x * (s1 + s2)
  z = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x)
  return hx < 0 ? -z : z
}

export function atan2(y: number, x: number): number {
  const tiny = 1.0e-300, pi_o_4 = 7.8539816339744827900e-01, pi_o_2 = 1.5707963267948965580e+00
  const pi = 3.1415926535897931160e+00, pi_lo = 1.2246467991473531772e-16
  let z: number
  const hx = high(x), lx = low(x)
  const ix = hx & 0x7FFFFFFF
  const hy = high(y), ly = low(y)
  const iy = hy & 0x7FFFFFFF
  if ((ix | ((lx | -lx) >>> 31)) > 0x7FF00000 || (iy | ((ly | -ly) >>> 31)) > 0x7FF00000) return x + y
  if (((hx - 0x3FF00000) | lx) === 0) return atan(y)
  let m = ((hy >> 31) & 1) | ((hx >> 30) & 2)
  if ((iy | ly) === 0) {
    switch (m) {
      case 0:
      case 1: return y
      case 2: return pi + tiny
      default: return -pi - tiny
    }
  }
  if ((ix | lx) === 0) return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny
  if (ix === 0x7FF00000) {
    if (iy === 0x7FF00000) {
      switch (m) {
        case 0: return pi_o_4 + tiny
        case 1: return -pi_o_4 - tiny
        case 2: return 3.0 * pi_o_4 + tiny
        default: return -3.0 * pi_o_4 - tiny
      }
    }
    switch (m) {
      case 0: return 0
      case 1: return -0
      case 2: return pi + tiny
      default: return -pi - tiny
    }
  }
  if (iy === 0x7FF00000) return hy < 0 ? -pi_o_2 - tiny : pi_o_2 + tiny
  const k = (iy - ix) >> 20
  if (k > 60) {
    z = pi_o_2 + 0.5 * pi_lo
    m &= 1
  } else if (hx < 0 && k < -60) {
    z = 0.0
  } else {
    z = atan(Math.abs(y / x))
  }
  switch (m) {
    case 0: return z
    case 1: return -z
    case 2: return pi - (z - pi_lo)
    default: return (z - pi_lo) - pi
  }
}

export function exp(x: number): number {
  const halF = [0.5, -0.5]
  const o_threshold = 7.09782712893383973096e+02, u_threshold = -7.45133219101941108420e+02
  const ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01]
  const ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10]
  const invln2 = 1.44269504088896338700e+00
  const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03
  const P3 = 6.61375632143793436117e-05, P4 = -1.65339022054652515390e-06
  const P5 = 4.13813679705723846039e-08, E = 2.718281828459045
  const huge = 1.0e+300, twom1000 = 9.33263618503218878990e-302, two1023 = 8.988465674311579539e307
  let hi = 0.0, lo = 0.0, t: number, k = 0
  let hx = high(x)
  const xsb = (hx >> 31) & 1
  hx &= 0x7FFFFFFF
  if (hx >= 0x40862E42) {
    if (hx >= 0x7FF00000) {
      if (((hx & 0xFFFFF) | low(x)) !== 0) return x + x
      return xsb === 0 ? x : 0.0
    }
    if (x > o_threshold) return huge * huge
    if (x < u_threshold) return twom1000 * twom1000
  }
  if (hx > 0x3FD62E42) {
    if (hx < 0x3FF0A2B2) {
      if (x === 1.0) return E
      hi = x - ln2HI[xsb]
      lo = ln2LO[xsb]
      k = 1 - xsb - xsb
    } else {
      k = (invln2 * x + halF[xsb]) | 0
      t = k
      hi = x - t * ln2HI[0]
      lo = t * ln2LO[0]
    }
    x = hi - lo
  } else if (hx < 0x3E300000) {
    if (huge + x > 1) return 1 + x
  } else {
    k = 0
  }
  t = x * x
  const twopk = k >= -1021 ? words((0x3FF00000 + (k << 20)) | 0, 0) : words((0x3FF00000 + ((k + 1000) << 20)) | 0, 0)
  const c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))))
  if (k === 0) return 1 - ((x * c) / (c - 2.0) - x)
  const y = 1 - ((lo - (x * c) / (2.0 - c)) - hi)
  if (k >= -1021) {
    if (k === 1024) return y * 2.0 * two1023
    return y * twopk
  }
  return y * twopk * twom1000
}

export function expm1(x: number): number {
  const tiny = 1.0e-300, o_threshold = 7.09782712893383973096e+02
  const ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10
  const invln2 = 1.44269504088896338700e+00
  const Q1 = -3.33333333333331316428e-02, Q2 = 1.58730158725481460165e-03
  const Q3 = -7.93650757867487942473e-05, Q4 = 4.00821782732936239552e-06
  const Q5 = -2.01099218183624371326e-07
  const huge = 1.0e+300
  let y: number, hi: number, lo: number, c = 0, t: number, e: number, k: number
  let hx = high(x)
  const xsb = hx & 0x80000000
  hx &= 0x7FFFFFFF
  if (hx >= 0x4043687A) {
    if (hx >= 0x40862E42) {
      if (hx >= 0x7FF00000) {
        if (((hx & 0xFFFFF) | low(x)) !== 0) return x + x
        return xsb === 0 ? x : -1.0
      }
      if (x > o_threshold) return huge * huge
    }
    if (xsb !== 0) {
      if (x + tiny < 0.0) return tiny - 1
    }
  }
  if (hx > 0x3FD62E42) {
    if (hx < 0x3FF0A2B2) {
      if (xsb === 0) {
        hi = x - ln2_hi
        lo = ln2_lo
        k = 1
      } else {
        hi = x + ln2_hi
        lo = -ln2_lo
        k = -1
      }
    } else {
      k = (invln2 * x + (xsb === 0 ? 0.5 : -0.5)) | 0
      t = k
      hi = x - t * ln2_hi
      lo = t * ln2_lo
    }
    x = hi - lo
    c = (hi - x) - lo
  } else if (hx < 0x3C900000) {
    t = huge + x
    return x - (t - (huge + x))
  } else {
    k = 0
  }
  const hfx = 0.5 * x
  const hxs = x * hfx
  const r1 = 1 + hxs * (Q1 + hxs * (Q2 + hxs * (Q3 + hxs * (Q4 + hxs * Q5))))
  t = 3.0 - r1 * hfx
  e = hxs * ((r1 - t) / (6.0 - x * t))
  if (k === 0) return x - (x * e - hxs)
  const twopk = words((0x3FF00000 + (k << 20)) | 0, 0)
  e = (x * (e - c) - c)
  e -= hxs
  if (k === -1) return 0.5 * (x - e) - 0.5
  if (k === 1) {
    if (x < -0.25) return -2.0 * (e - (x + 0.5))
    return 1 + 2.0 * (x - e)
  }
  if (k <= -2 || k > 56) {
    y = 1 - (e - x)
    if (k === 1024) y = y * 2.0 * 8.98846567431158e+307
    else y = y * twopk
    return y - 1
  }
  t = 1
  if (k < 20) {
    t = withHigh(t, 0x3FF00000 - (0x200000 >> k))
    y = t - (e - x)
    y = y * twopk
  } else {
    t = withHigh(t, (0x3FF - k) << 20)
    y = x - (e + t)
    y += 1
    y = y * twopk
  }
  return y
}

const Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01
const Lg4 = 2.222219843214978396e-01, Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01
const Lg7 = 1.479819860511658591e-01
const ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10
const two54 = 1.80143985094819840000e+16

export function log(x: number): number {
  let hfsq: number, R: number, dk: number
  let k = 0, i: number
  let hx = high(x)
  const lx = low(x)
  if (hx < 0x00100000) {
    if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity
    if (hx < 0) return NaN
    k -= 54
    x *= two54
    hx = high(x)
  }
  if (hx >= 0x7FF00000) return x + x
  k += (hx >> 20) - 1023
  hx &= 0x000FFFFF
  i = (hx + 0x95F64) & 0x100000
  x = withHigh(x, hx | (i ^ 0x3FF00000))
  k += i >> 20
  const f = x - 1.0
  if ((0x000FFFFF & (2 + hx)) < 3) {
    if (f === 0) {
      if (k === 0) return 0
      dk = k
      return dk * ln2_hi + dk * ln2_lo
    }
    R = f * f * (0.5 - 0.33333333333333333 * f)
    if (k === 0) return f - R
    dk = k
    return dk * ln2_hi - ((R - dk * ln2_lo) - f)
  }
  const s = f / (2.0 + f)
  dk = k
  const z = s * s
  i = hx - 0x6147A
  const w = z * z
  const j = 0x6B851 - hx
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6))
  const t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)))
  i |= j
  R = t2 + t1
  if (i > 0) {
    hfsq = 0.5 * f * f
    if (k === 0) return f - (hfsq - s * (hfsq + R))
    return dk * ln2_hi - ((hfsq - (s * (hfsq + R) + dk * ln2_lo)) - f)
  }
  if (k === 0) return f - s * (f - R)
  return dk * ln2_hi - ((s * (f - R) - dk * ln2_lo) - f)
}

export function log1p(x: number): number {
  const Lp1 = Lg1, Lp2 = Lg2, Lp3 = Lg3, Lp4 = Lg4, Lp5 = Lg5, Lp6 = Lg6, Lp7 = Lg7
  let f = 0, c = 0, R: number, u: number
  let k: number, hu = 0
  const hx = high(x)
  const ax = hx & 0x7FFFFFFF
  k = 1
  if (hx < 0x3FDA827A) {
    if (ax >= 0x3FF00000) {
      if (x === -1.0) return -Infinity
      return NaN
    }
    if (ax < 0x3E200000) {
      if (two54 + x > 0 && ax < 0x3C900000) return x
      return x - x * x * 0.5
    }
    if (hx > 0 || hx <= (0xBFD2BEC4 | 0)) {
      k = 0
      f = x
      hu = 1
    }
  }
  if (hx >= 0x7FF00000) return x + x
  if (k !== 0) {
    if (hx < 0x43400000) {
      u = 1.0 + x
      hu = high(u)
      k = (hu >> 20) - 1023
      c = k > 0 ? 1.0 - (u - x) : x - (u - 1.0)
      c /= u
    } else {
      u = x
      hu = high(u)
      k = (hu >> 20) - 1023
      c = 0
    }
    hu &= 0x000FFFFF
    if (hu < 0x6A09E) {
      u = withHigh(u, hu | 0x3FF00000)
    } else {
      k += 1
      u = withHigh(u, hu | 0x3FE00000)
      hu = (0x00100000 - hu) >> 2
    }
    f = u - 1.0
  }
  const hfsq = 0.5 * f * f
  if (hu === 0) {
    if (f === 0) {
      if (k === 0) return 0
      c += k * ln2_lo
      return k * ln2_hi + c
    }
    R = hfsq * (1.0 - 0.66666666666666666 * f)
    if (k === 0) return f - R
    return k * ln2_hi - ((R - (k * ln2_lo + c)) - f)
  }
  const s = f / (2.0 + f)
  const z = s * s
  R = z * (Lp1 + z * (Lp2 + z * (Lp3 + z * (Lp4 + z * (Lp5 + z * (Lp6 + z * Lp7))))))
  if (k === 0) return f - (hfsq - s * (hfsq + R))
  return k * ln2_hi - ((hfsq - (s * (hfsq + R) + (k * ln2_lo + c))) - f)
}

// k_log1p: log(1 + f) − f, for 1 + f in about [√2/2, √2].
function log1pKernel(f: number): number {
  const s = f / (2.0 + f)
  const z = s * s
  const w = z * z
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6))
  const t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)))
  const R = t2 + t1
  const hfsq = 0.5 * f * f
  return s * (hfsq + R)
}

export function log2(x: number): number {
  const ivln2hi = 1.44269504072144627571e+00, ivln2lo = 1.67517131648865118353e-10
  let k = 0
  let hx = high(x)
  const lx = low(x)
  if (hx < 0x00100000) {
    if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity
    if (hx < 0) return NaN
    k -= 54
    x *= two54
    hx = high(x)
  }
  if (hx >= 0x7FF00000) return x + x
  if (hx === 0x3FF00000 && lx === 0) return 0.0
  k += (hx >> 20) - 1023
  hx &= 0x000FFFFF
  const i = (hx + 0x95F64) & 0x100000
  x = withHigh(x, hx | (i ^ 0x3FF00000))
  k += i >> 20
  const y = k
  const f = x - 1.0
  const hfsq = 0.5 * f * f
  const r = log1pKernel(f)
  let hi = f - hfsq
  hi = withLow(hi, 0)
  const lo = (f - hi) - hfsq + r
  let val_hi = hi * ivln2hi
  let val_lo = (lo + hi) * ivln2lo + lo * ivln2hi
  const w = y + val_hi
  val_lo += (y - w) + val_hi
  val_hi = w
  return val_lo + val_hi
}

export function log10(x: number): number {
  const ivln10 = 4.34294481903251816668e-01
  const log10_2hi = 3.01029995663611771306e-01, log10_2lo = 3.69423907715893078616e-13
  let k = 0
  let hx = high(x)
  let lx = low(x)
  if (hx < 0x00100000) {
    if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity
    if (hx < 0) return NaN
    k -= 54
    x *= two54
    hx = high(x)
    lx = low(x)
  }
  if (hx >= 0x7FF00000) return x + x
  if (hx === 0x3FF00000 && lx === 0) return 0.0
  k += (hx >> 20) - 1023
  const i = (k & 0x80000000) >>> 31
  hx = (hx & 0x000FFFFF) | ((0x3FF - i) << 20)
  const y = k + i
  x = words(hx, lx)
  const z = y * log10_2lo + ivln10 * log(x)
  return z + y * log10_2hi
}

export function cbrt(x: number): number {
  const B1 = 715094163, B2 = 696219795
  const P0 = 1.87595182427177009643, P1 = -1.88497979543377169875, P2 = 1.621429720105354466140
  const P3 = -0.758397934778766047437, P4 = 0.145996192886612446982
  let hx = high(x)
  const lx = low(x)
  const sign = hx & 0x80000000
  hx ^= sign
  if (hx >= 0x7FF00000) return x + x
  let t = 0.0
  if (hx < 0x00100000) {
    if ((hx | lx) === 0) return x
    t = withHigh(t, 0x43500000)
    t *= x
    t = words(sign | (Math.floor((high(t) & 0x7FFFFFFF) / 3) + B2), 0)
  } else {
    t = words(sign | (Math.floor(hx / 3) + B1), 0)
  }
  let r = (t * t) * (t / x)
  t = t * ((P0 + r * (P1 + r * P2)) + ((r * r) * r) * (P3 + r * P4))
  // Round t away from zero to 23 bits: add 2³¹ to its 64 bits and clear the low 30.
  let lo = low(t) + 0x80000000
  let hi = high(t)
  if (lo >= 0x100000000) {
    lo -= 0x100000000
    hi = (hi + 1) | 0
  }
  t = words(hi, lo & 0xC0000000)
  const s = t * t
  r = x / s
  const w = t + t
  r = (r - t) / (w + r)
  return t + t * r
}

export function cosh(x: number): number {
  const KCOSH_OVERFLOW = 710.4758600739439, huge = 1.0e+300
  const ix = high(x) & 0x7FFFFFFF
  if (ix < 0x3FD62E43) {
    const t = expm1(Math.abs(x))
    const w = 1 + t
    if (ix < 0x3C800000) return w
    return 1 + (t * t) / (w + w)
  }
  if (ix < 0x40360000) {
    const t = exp(Math.abs(x))
    return 0.5 * t + 0.5 / t
  }
  if (ix < 0x40862E42) return 0.5 * exp(Math.abs(x))
  if (Math.abs(x) <= KCOSH_OVERFLOW) {
    const w = exp(0.5 * Math.abs(x))
    const t = 0.5 * w
    return t * w
  }
  if (ix >= 0x7FF00000) return x * x
  return huge * huge
}

export function sinh(x: number): number {
  const KSINH_OVERFLOW = 710.4758600739439, TWO_M28 = 3.725290298461914e-9, LOG_MAXD = 709.7822265625
  const shuge = 1.0e307
  const h = x < 0 ? -0.5 : 0.5
  const ax = Math.abs(x)
  if (ax < 22) {
    if (ax < TWO_M28) return x
    const t = expm1(ax)
    if (ax < 1) return h * (2 * t - t * t / (t + 1))
    return h * (t + t / (t + 1))
  }
  if (ax < LOG_MAXD) return h * exp(ax)
  if (ax <= KSINH_OVERFLOW) {
    const w = exp(0.5 * ax)
    const t = h * w
    return t * w
  }
  return x * shuge
}

export function tanh(x: number): number {
  const tiny = 1.0e-300, huge = 1.0e300
  let t: number, z: number
  const jx = high(x)
  const ix = jx & 0x7FFFFFFF
  if (ix >= 0x7FF00000) {
    if (jx >= 0) return 1 / x + 1
    return 1 / x - 1
  }
  if (ix < 0x40360000) {
    if (ix < 0x3E300000) {
      if (huge + x > 1) return x
    }
    if (ix >= 0x3FF00000) {
      t = expm1(2 * Math.abs(x))
      z = 1 - 2 / (t + 2)
    } else {
      t = expm1(-2 * Math.abs(x))
      z = -t / (t + 2)
    }
  } else {
    z = 1 - tiny
  }
  return jx >= 0 ? z : -z
}

export function asinh(x: number): number {
  const ln2 = 6.93147180559945286227e-01, huge = 1.00000000000000000000e+300
  let t: number, w: number
  const hx = high(x)
  const ix = hx & 0x7FFFFFFF
  if (ix >= 0x7FF00000) return x + x
  if (ix < 0x3E300000) {
    if (huge + x > 1) return x
  }
  if (ix > 0x41B00000) {
    w = log(Math.abs(x)) + ln2
  } else if (ix > 0x40000000) {
    t = Math.abs(x)
    w = log(2.0 * t + 1 / (Math.sqrt(x * x + 1) + t))
  } else {
    t = x * x
    w = log1p(Math.abs(x) + t / (1 + Math.sqrt(1 + t)))
  }
  return hx > 0 ? w : -w
}

export function acosh(x: number): number {
  const ln2 = 6.93147180559945286227e-01
  let t: number
  const hx = high(x), lx = low(x)
  if (hx < 0x3FF00000) return NaN
  if (hx >= 0x41B00000) {
    if (hx >= 0x7FF00000) return x + x
    return log(x) + ln2
  }
  if (((hx - 0x3FF00000) | lx) === 0) return 0.0
  if (hx > 0x40000000) {
    t = x * x
    return log(2.0 * x - 1 / (x + Math.sqrt(t - 1)))
  }
  t = x - 1
  return log1p(t + Math.sqrt(2.0 * t + t * t))
}

export function atanh(x: number): number {
  const huge = 1e300
  let t: number
  const hx = high(x), lx = low(x)
  const ix = hx & 0x7FFFFFFF
  if ((ix | ((lx | -lx) >>> 31)) > 0x3FF00000) return NaN
  if (ix === 0x3FF00000) return x > 0 ? Infinity : -Infinity
  if (ix < 0x3E300000 && (huge + x) > 0) return x
  x = withHigh(x, ix)
  if (ix < 0x3FE00000) {
    t = x + x
    t = 0.5 * log1p(t + t * x / (1 - x))
  } else {
    t = 0.5 * log1p((x + x) / (1 - x))
  }
  return hx >= 0 ? t : -t
}

export function pow(x: number, y: number): number {
  const bp = [1.0, 1.5], dp_h = [0.0, 5.84962487220764160156e-01], dp_l = [0.0, 1.35003920212974897128e-08]
  const two53 = 9007199254740992.0, huge = 1.0e300, tiny = 1.0e-300
  const L1 = 5.99999999999994648725e-01, L2 = 4.28571428578550184252e-01, L3 = 3.33333329818377432918e-01
  const L4 = 2.72728123808534006489e-01, L5 = 2.30660745775561754067e-01, L6 = 2.06975017800338417784e-01
  const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05
  const P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08
  const lg2 = 6.93147180559945286227e-01, lg2_h = 6.93147182464599609375e-01, lg2_l = -1.90465429995776804525e-09
  const ovt = 8.0085662595372944372e-0017
  const cp = 9.61796693925975554329e-01, cp_h = 9.61796700954437255859e-01, cp_l = -7.02846165095275826516e-09
  const ivln2 = 1.44269504088896338700e+00, ivln2_h = 1.44269502162933349609e+00, ivln2_l = 1.92596299112661746887e-08
  let z: number, ax: number, z_h: number, z_l: number, p_h: number, p_l: number
  let y1: number, t1: number, t2: number, r: number, s: number, t: number, u: number, v: number, w: number
  let i: number, j: number, k: number, n: number
  const hx = high(x), lx = low(x)
  const hy = high(y), ly = low(y)
  let ix = hx & 0x7FFFFFFF
  const iy = hy & 0x7FFFFFFF
  if ((iy | ly) === 0) return 1
  if (ix > 0x7FF00000 || (ix === 0x7FF00000 && lx !== 0) || iy > 0x7FF00000 || (iy === 0x7FF00000 && ly !== 0)) return x + y
  // Whether y is an integer when x < 0: 0 not one, 1 odd, 2 even.
  let yisint = 0
  if (hx < 0) {
    if (iy >= 0x43400000) {
      yisint = 2
    } else if (iy >= 0x3FF00000) {
      k = (iy >> 20) - 0x3FF
      if (k > 20) {
        j = ly >>> (52 - k)
        if (((j << (52 - k)) | 0) === (ly | 0)) yisint = 2 - (j & 1)
      } else if (ly === 0) {
        j = iy >> (20 - k)
        if ((j << (20 - k)) === iy) yisint = 2 - (j & 1)
      }
    }
  }
  if (ly === 0) {
    if (iy === 0x7FF00000) {
      if (((ix - 0x3FF00000) | lx) === 0) return y - y
      if (ix >= 0x3FF00000) return hy >= 0 ? y : 0
      return hy < 0 ? -y : 0
    }
    if (iy === 0x3FF00000) return hy < 0 ? 1 / x : x
    if (hy === 0x40000000) return x * x
    if (hy === 0x3FE00000) {
      if (hx >= 0) return Math.sqrt(x)
    }
  }
  ax = Math.abs(x)
  if (lx === 0) {
    if (ix === 0x7FF00000 || ix === 0 || ix === 0x3FF00000) {
      z = ax
      if (hy < 0) z = 1 / z
      if (hx < 0) {
        if (((ix - 0x3FF00000) | yisint) === 0) z = NaN
        else if (yisint === 1) z = -z
      }
      return z
    }
  }
  n = (hx >> 31) + 1
  if ((n | yisint) === 0) return NaN
  s = 1
  if ((n | (yisint - 1)) === 0) s = -1
  if (iy > 0x41E00000) {
    if (iy > 0x43F00000) {
      if (ix <= 0x3FEFFFFF) return hy < 0 ? huge * huge : tiny * tiny
      if (ix >= 0x3FF00000) return hy > 0 ? huge * huge : tiny * tiny
    }
    if (ix < 0x3FEFFFFF) return hy < 0 ? s * huge * huge : s * tiny * tiny
    if (ix > 0x3FF00000) return hy > 0 ? s * huge * huge : s * tiny * tiny
    t = ax - 1
    w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25))
    u = ivln2_h * t
    v = t * ivln2_l - w * ivln2
    t1 = u + v
    t1 = withLow(t1, 0)
    t2 = v - (t1 - u)
  } else {
    let s2: number, s_h: number, t_h: number, t_l: number
    n = 0
    if (ix < 0x00100000) {
      ax *= two53
      n -= 53
      ix = high(ax)
    }
    n += (ix >> 20) - 0x3FF
    j = ix & 0x000FFFFF
    ix = j | 0x3FF00000
    if (j <= 0x3988E) {
      k = 0
    } else if (j < 0xBB67A) {
      k = 1
    } else {
      k = 0
      n += 1
      ix -= 0x00100000
    }
    ax = withHigh(ax, ix)
    u = ax - bp[k]
    v = 1 / (ax + bp[k])
    const ss = u * v
    s_h = ss
    s_h = withLow(s_h, 0)
    t_h = 0
    t_h = withHigh(t_h, ((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18))
    t_l = ax - (t_h - bp[k])
    const s_l = v * ((u - s_h * t_h) - s_h * t_l)
    s2 = ss * ss
    r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))))
    r += s_l * (s_h + ss)
    s2 = s_h * s_h
    t_h = 3.0 + s2 + r
    t_h = withLow(t_h, 0)
    t_l = r - ((t_h - 3.0) - s2)
    u = s_h * t_h
    v = s_l * t_h + t_l * ss
    p_h = u + v
    p_h = withLow(p_h, 0)
    p_l = v - (p_h - u)
    z_h = cp_h * p_h
    z_l = cp_l * p_h + p_l * cp + dp_l[k]
    t = n
    t1 = ((z_h + z_l) + dp_h[k]) + t
    t1 = withLow(t1, 0)
    t2 = z_l - (((t1 - t) - dp_h[k]) - z_h)
  }
  y1 = y
  y1 = withLow(y1, 0)
  p_l = (y - y1) * t1 + y * t2
  p_h = y1 * t1
  z = p_l + p_h
  j = high(z)
  i = low(z) | 0
  if (j >= 0x40900000) {
    if (((j - 0x40900000) | i) !== 0) return s * huge * huge
    if (p_l + ovt > z - p_h) return s * huge * huge
  } else if ((j & 0x7FFFFFFF) >= 0x4090CC00) {
    if (((j - 0xC090CC00) | i) !== 0) return s * tiny * tiny
    if (p_l <= z - p_h) return s * tiny * tiny
  }
  i = j & 0x7FFFFFFF
  k = (i >> 20) - 0x3FF
  n = 0
  if (i > 0x3FE00000) {
    n = j + (0x00100000 >> (k + 1))
    k = ((n & 0x7FFFFFFF) >> 20) - 0x3FF
    t = 0
    t = withHigh(t, n & ~(0x000FFFFF >> k))
    n = ((n & 0x000FFFFF) | 0x00100000) >> (20 - k)
    if (j < 0) n = -n
    p_h -= t
  }
  t = p_l + p_h
  t = withLow(t, 0)
  u = t * lg2_h
  v = (p_l - (t - p_h)) * lg2 + t * lg2_l
  z = u + v
  w = v - (z - u)
  t = z * z
  t1 = z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))))
  r = (z * t1) / ((t1 - 2) - (w + z * w))
  z = 1 - (r - z)
  j = high(z)
  j = (j + (n << 20)) | 0
  if ((j >> 20) <= 0) z = scalbn(z, n)
  else z = withHigh(z, (high(z) + (n << 20)) | 0)
  return s * z
}

// √(Σ xᵢ²) without overflow or underflow on the way, as `Math.hypot` takes it: any argument ±Infinity
// is +Infinity, then any NaN is NaN, then all zero is +0.
export function hypot(...xs: number[]): number {
  if (xs.length === 0) return 0
  const abs = new Array<number>(xs.length)
  let nan = false, max = 0
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i]
    if (Number.isNaN(v)) {
      nan = true
      abs[i] = 0
    } else {
      const a = Math.abs(v)
      abs[i] = a
      if (a > max) max = a
    }
  }
  if (max === Infinity) return Infinity
  if (nan) return NaN
  if (max === 0) return 0
  let sum = 0, compensation = 0
  for (let i = 0; i < xs.length; i++) {
    const n = abs[i] / max
    const summand = n * n - compensation
    const preliminary = sum + summand
    compensation = (preliminary - sum) - summand
    sum = preliminary
  }
  return Math.sqrt(sum) * max
}
