// terrain3d's ground look as one shared, deterministic field: which texture layer covers each point
// of the ground, and by how much. It is written twice, here in TS, which the land record answers
// `layer:<name>` with (`terrain3d.sim.ts`), so the server, the workers and scatter3d read it, and as
// GLSL from the same numbers (`glsl`), which the ground's shader draws (`terrain3d.plugin.ts`). There
// is no `sin` hash: every bit of the hash is integer arithmetic, which a GPU and JS do the same way.
//
// The field's `ground`:
//   layers       `[{ name, map, normal?, scale, strength?, tri?, sharp?, where?, noise?, edge?, warp? }]`,
//                in order: the first covers everything, and each later one lies over the ones before
//                it where its mask is.
//     map, normal  catalogue `texture` entries: the colour (sRGB) and an OpenGL normal map. Every
//                  layer's maps are drawn into two texture arrays, so the ground binds two maps
//                  however many layers it has.
//     scale        metres a repeat.
//     strength     the normal map's xy multiplied, 1 when absent.
//     tri, sharp   projected along all three axes, each axis's share its normal's part to the power
//                  `sharp` (4 when absent), so a cliff does not stretch the map down its face; else
//                  straight down.
//     where        rules `{ q, lo, hi }` on the land record (`terrain3d.sim.ts`), their ramps
//                  multiplied: the layer's coarse mask. `height` and `slope` are worked out per pixel
//                  on the GPU; every other key, `biome:<name>` among them, is carried by each vertex
//                  as the product of those rules and blended between vertices.
//     noise        `{ freq, amp }`: the coarse mask v moved by ±amp × 4v(1 − v) of four octaves of
//                  value noise at `freq` cycles a metre, read at the warped point, so the 0.5
//                  crossing, the layer's edge, wanders at every scale; where the rules give 0 or 1
//                  the noise moves nothing, so no layer shows where its rules put none.
//     edge         how wide that crossing is drawn, from 0, a cut, to 1; 0.3 when absent.
//     warp         `[{ freq, amp, stretch: [x, y, z], rotate }]`: octaves of 3D noise of world xyz,
//                  each turned `rotate` radians about y and scaled by freq × stretch per axis, adding
//                  amp metres of offset. The texture is read at the warped point, which hides its
//                  repeat; the mask's noise is read there too. Stretching y alone draws strata.
//   compose      how the masks become weights summing to 1: `stack` (each layer over the ones before
//                it, w_k = m_k × Π_{j>k}(1 − m_j)), `normalise` (m / Σ m) or `sharpened` (m⁴ / Σ m⁴).
//   heightBlend  `{ amount, depth }`: at a boundary the layer whose texture stands taller (its
//                luminance) wins, within `depth`. The GPU's alone: the twin cannot read a texture.
//   far          `{ amount, scale }`: a second read of each map at `scale` times its repeat, laid on as
//                a ratio to the map's mean colour, so the far ground varies at a scale no repeat has.
//   roughness    the ground's one roughness.
//
// A layer's mask is exactly 0 where its coarse mask plus its noise cannot reach the edge, and exactly
// 1 where minus it cannot fall below; the twins skip the warp and noise there, which changes no value.

import type { Rule } from './terrain3d.sim.ts'

// terrain3d's one ramp (`terrain3d.sim.ts`'s `shape`), here so the sim can import this file.
const shape = (v: number, lo: number, hi: number) => (lo === hi ? (v >= lo ? 1 : 0) : clamp01((v - lo) / (hi - lo)))

export type Octave = { freq: number; amp: number; stretch: number[]; rotate: number }
export type GroundLayer = {
  name: string; map: string; normal?: string; scale: number; strength?: number; tri?: boolean; sharp?: number
  where?: Rule[]; noise?: { freq: number; amp: number }; edge?: number; warp?: Octave[]
}
export type Look = {
  layers: GroundLayer[]; compose?: 'stack' | 'normalise' | 'sharpened'
  heightBlend?: { amount: number; depth: number }; far?: { amount: number; scale: number }; roughness?: number
}

// The hash's constants: three lattice primes and the two multipliers of a 32-bit finaliser.
const C = { x: 0x8da6b343, y: 0xd8163841, z: 0xcb1ab31f, m1: 0x7feb352d, m2: 0x846ca68b }

// [0, 1) from an integer lattice point and a seed.
export function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(x, C.x) ^ Math.imul(y, C.y) ^ Math.imul(z, C.z) ^ seed) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, C.m1) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, C.m2) >>> 0
  h ^= h >>> 16
  return (h >>> 8) / 16777216
}

const quintic = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// Value noise of a point, [0, 1].
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const ux = quintic(x - ix), uy = quintic(y - iy), uz = quintic(z - iz)
  const h = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz, seed)
  return lerp(
    lerp(lerp(h(0, 0, 0), h(1, 0, 0), ux), lerp(h(0, 1, 0), h(1, 1, 0), ux), uy),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), ux), lerp(h(0, 1, 1), h(1, 1, 1), ux), uy),
    uz,
  )
}

// The offset layer k's octaves move a point by.
export function warp(x: number, y: number, z: number, octaves: Octave[], k: number): number[] {
  let dx = 0, dy = 0, dz = 0
  octaves.forEach((o, i) => {
    if (o.freq === 0 || o.amp === 0) return
    const c = Math.cos(o.rotate), s = Math.sin(o.rotate)
    const qx = (c * x - s * z) * o.freq * o.stretch[0]
    const qy = y * o.freq * o.stretch[1]
    const qz = (s * x + c * z) * o.freq * o.stretch[2]
    const seed = k * 16 + i * 4
    dx += o.amp * (noise3(qx, qy, qz, seed) * 2 - 1)
    dy += o.amp * (noise3(qx, qy, qz, seed + 1) * 2 - 1)
    dz += o.amp * (noise3(qx, qy, qz, seed + 2) * 2 - 1)
  })
  return [dx, dy, dz]
}

function edgeNoise(qx: number, qy: number, qz: number, k: number) {
  let n = 0, a = 1, f = 1, t = 0
  for (let o = 0; o < 4; o++) { n += a * noise3(qx * f, qy * f, qz * f, k * 16 + 12 + o); t += a; a *= 0.5; f *= 2.03 }
  return n / t
}

const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }
export const edgeOf = (l: GroundLayer) => Math.max(l.edge ?? 0.3, 0.001)
// Whether a rule is worked out per pixel, from the ground point and its normal, and not carried.
export const perPixel = (r: Rule) => r.q === 'height' || r.q === 'slope'

// Layer k's mask at ground point (x, y, z) of slope `slope`, `read` the land record's other keys.
export function mask(l: GroundLayer, k: number, x: number, y: number, z: number, slope: number, read: (q: string) => number): number {
  if (k === 0) return 1
  let v = 1
  for (const r of l.where ?? []) v *= shape(r.q === 'height' ? y : r.q === 'slope' ? slope : read(r.q), r.lo, r.hi)
  const e = edgeOf(l), lo = 0.5 - e / 2, hi = 0.5 + e / 2, reach = (l.noise?.amp ?? 0) * near(v)
  if (v + reach <= lo) return 0
  if (v - reach >= hi) return 1
  if (reach !== 0) {
    const [wx, wy, wz] = warp(x, y, z, l.warp ?? [], k)
    const f = l.noise!.freq
    v += reach * (edgeNoise((x + wx) * f, (y + wy) * f, (z + wz) * f, k) - 0.5) * 2
  }
  return smooth(lo, hi, v)
}

// How much of its noise a coarse mask v takes: all of it at 0.5, where the layer's edge is, and none
// at 0 or 1, so the noise moves an edge the rules make and never puts a layer where they say none
// or takes it away where they say all.
export const near = (v: number) => 4 * clamp01(v) * (1 - clamp01(v))

// The masks composed into weights summing to 1.
export function compose(m: number[], how: Look['compose'] = 'stack'): number[] {
  if (how === 'stack') {
    const w = new Array(m.length)
    let above = 1
    for (let k = m.length - 1; k >= 0; k--) { w[k] = m[k] * above; above *= 1 - m[k] }
    return w
  }
  const p = how === 'sharpened' ? m.map(v => v ** 4) : m
  const s = p.reduce((a, b) => a + b, 0)
  return p.map(v => v / s)
}

// Every layer's weight at a ground point: what the shader draws there before its height blend.
export function weights(look: Look, x: number, y: number, z: number, slope: number, read: (q: string) => number): number[] {
  return compose(look.layers.map((l, k) => mask(l, k, x, y, z, slope, read)), look.compose)
}

// Throws naming the first thing in a look it cannot draw; `known` the record keys a rule may read.
export function checked(look: Look, known: readonly string[]) {
  if (!look.layers?.length) throw new Error('terrain3d ground has no layers')
  if (!['stack', 'normalise', 'sharpened', undefined].includes(look.compose)) throw new Error(`terrain3d ground compose ${look.compose} is none of stack, normalise, sharpened`)
  const names = new Set<string>()
  look.layers.forEach((l, k) => {
    const what = `terrain3d ground layer ${k}`
    if (!l.name) throw new Error(`${what} has no name`)
    if (names.has(l.name)) throw new Error(`terrain3d ground has two layers ${l.name}`)
    names.add(l.name)
    if (!l.map) throw new Error(`${what} names no map`)
    if (!(l.scale > 0)) throw new Error(`${what} scale ${l.scale} is not above 0`)
    ;(l.where ?? []).forEach((r, j) => {
      if (!known.includes(r.q)) throw new Error(`${what} rule ${j} reads ${r.q}, which is none of the land record's keys: ${known.join(', ')}`)
    })
    if (l.noise && !(l.noise.freq > 0)) throw new Error(`${what} noise freq ${l.noise.freq} is not above 0`)
    ;(l.warp ?? []).forEach((o, j) => {
      if (o.stretch?.length !== 3) throw new Error(`${what} warp octave ${j} stretch is not [x, y, z]`)
    })
  })
}

const n6 = (v: number) => (Number.isFinite(v) ? v.toFixed(6) : v > 0 ? '1.0e9' : '-1.0e9')
const u = (v: number) => `0x${(v >>> 0).toString(16)}u`

// The GLSL twin for `look`: `twMask<k>(p, slope, carried)`, each layer's mask at world point p, with
// `carried` the product of its carried rules (1 for a layer with none), and `twWarp<k>(p)` its warp.
export function glsl(look: Look): string {
  const ramp = (v: string, r: Rule) => (r.lo === r.hi ? `step(${n6(r.lo)}, ${v})` : `clamp((${v} - ${n6(r.lo)}) / ${n6(r.hi - r.lo)}, 0.0, 1.0)`)
  const layers = look.layers.map((l, k) => {
    const oct = (l.warp ?? []).map((o, i) => {
      if (o.freq === 0 || o.amp === 0) return ''
      const c = Math.cos(o.rotate), s = Math.sin(o.rotate)
      const sc = `vec3(${n6(o.freq * o.stretch[0])}, ${n6(o.freq * o.stretch[1])}, ${n6(o.freq * o.stretch[2])})`
      const seed = k * 16 + i * 4
      return `  { vec3 q = vec3(${n6(c)} * p.x - ${n6(s)} * p.z, p.y, ${n6(s)} * p.x + ${n6(c)} * p.z) * ${sc};
    d += ${n6(o.amp)} * (vec3(twNoise(q, ${seed}u), twNoise(q, ${seed + 1}u), twNoise(q, ${seed + 2}u)) * 2.0 - 1.0); }`
    }).join('\n')
    const e = edgeOf(l), amp = l.noise?.amp ?? 0
    const pix = (l.where ?? []).filter(perPixel).map(r => ramp(r.q === 'height' ? 'p.y' : 'slope', r))
    return `vec3 twWarp${k}(vec3 p) { vec3 d = vec3(0.0);
${oct}
  return d; }
float twCoarse${k}(vec3 p, float slope, float carried) { return carried${pix.map(t => ` * ${t}`).join('')}; }
float twMask${k}(vec3 p, float v, vec3 wv) {
  ${k === 0 ? 'return 1.0;' : `${amp !== 0 ? `v += ${n6(amp)} * twNear(v) * (twEdgeNoise((p + wv) * ${n6(l.noise!.freq)}, ${k}) - 0.5) * 2.0;` : ''}
  return twStep(${n6(0.5 - e / 2)}, ${n6(0.5 + e / 2)}, v);`} }
// whether layer ${k}'s mask is 0, or 1, whatever its noise does
bool twNone${k}(float v) { return ${k === 0 ? 'false' : `v + ${n6(amp)} * twNear(v) <= ${n6(0.5 - e / 2)}`}; }
bool twAll${k}(float v) { return ${k === 0 ? 'true' : `v - ${n6(amp)} * twNear(v) >= ${n6(0.5 + e / 2)}`}; }`
  })
  return `
float twHash(ivec3 c, uint seed) {
  uvec3 q = uvec3(c);
  uint h = (q.x * ${u(C.x)}) ^ (q.y * ${u(C.y)}) ^ (q.z * ${u(C.z)}) ^ seed;
  h ^= h >> 16u; h *= ${u(C.m1)}; h ^= h >> 15u; h *= ${u(C.m2)}; h ^= h >> 16u;
  return float(h >> 8u) / 16777216.0;
}
float twQuintic(float t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float twNoise(vec3 p, uint seed) {
  vec3 fl = floor(p); ivec3 i = ivec3(fl); vec3 f = p - fl;
  vec3 v = vec3(twQuintic(f.x), twQuintic(f.y), twQuintic(f.z));
  return mix(
    mix(mix(twHash(i, seed), twHash(i + ivec3(1, 0, 0), seed), v.x), mix(twHash(i + ivec3(0, 1, 0), seed), twHash(i + ivec3(1, 1, 0), seed), v.x), v.y),
    mix(mix(twHash(i + ivec3(0, 0, 1), seed), twHash(i + ivec3(1, 0, 1), seed), v.x), mix(twHash(i + ivec3(0, 1, 1), seed), twHash(i + ivec3(1, 1, 1), seed), v.x), v.y),
    v.z);
}
float twNear(float v) { v = clamp(v, 0.0, 1.0); return 4.0 * v * (1.0 - v); }
float twStep(float a, float b, float v) { float t = clamp((v - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float twEdgeNoise(vec3 q, int k) {
  float nn = 0.0, a = 1.0, f = 1.0, t = 0.0;
  for (int o = 0; o < 4; o++) { nn += a * twNoise(q * f, uint(k * 16 + 12 + o)); t += a; a *= 0.5; f *= 2.03; }
  return nn / t;
}
${layers.join('\n')}
`
}
