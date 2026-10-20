// The one shared, deterministic field of issue #20: an integer-lattice hash, 3D value noise of world
// xyz, a warp made of stretched and turned octaves, each biome's mask, each layer's mask (its height
// and slope ramps, moved per pixel by warped noise, through its edge) and the composition of the masks
// into weights.
//
// The ground is BIOMES biomes of PER layers each, LAYERS layers in all. Biome j's layers are layers
// j × PER to j × PER + PER − 1, and the first of them is its base. A biome's mask is warped noise of
// xz around its `cover`, through its `edge`; the masks are stacked into biome weights that sum to 1.
// A layer's weight is its biome's weight times its share of that biome, so where only one biome
// reaches, only its PER layers are worked out.
//
// It is written twice, once here in JS (what the sim and scatter3d would run) and once in GLSL (what
// the ground's shader runs), and `glsl()` writes the GLSL from the same constants. There is no `sin`
// hash: every bit of the hash is integer arithmetic, which a GPU and JS do the same way. The page's
// agreement check renders the GPU's weights and compares them with these.

export const BIOMES = 2
export const PER = 4
export const LAYERS = BIOMES * PER
export const OCTAVES = 3
// A biome whose weight is below this is dropped and the others are scaled back up to sum to 1, so
// the shader can skip its layers outright; both twins drop it the same way.
export const BIOME_CUT = 0.01

// The hash's constants: three lattice primes and the two multipliers of a 32-bit finaliser.
export const C = { x: 0x8da6b343, y: 0xd8163841, z: 0xcb1ab31f, m1: 0x7feb352d, m2: 0x846ca68b }

// [0, 1) from an integer lattice point and a seed.
export function hash(x, y, z, seed) {
  let h = (Math.imul(x, C.x) ^ Math.imul(y, C.y) ^ Math.imul(z, C.z) ^ seed) >>> 0
  h ^= h >>> 16
  h = Math.imul(h, C.m1) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, C.m2) >>> 0
  h ^= h >>> 16
  return (h >>> 8) / 16777216
}

const quintic = t => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v)

// Value noise of a point, [0, 1].
export function noise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const ux = quintic(x - ix), uy = quintic(y - iy), uz = quintic(z - iz)
  const h = (dx, dy, dz) => hash(ix + dx, iy + dy, iz + dz, seed)
  return lerp(
    lerp(lerp(h(0, 0, 0), h(1, 0, 0), ux), lerp(h(0, 1, 0), h(1, 1, 0), ux), uy),
    lerp(lerp(h(0, 0, 1), h(1, 0, 1), ux), lerp(h(0, 1, 1), h(1, 1, 1), ux), uy),
    uz,
  )
}

// The offset slot k's octaves move a point by. Slots 0 … LAYERS − 1 are the layers, LAYERS + j is
// biome j. An octave turns the point about y, scales it by its freq times its stretch per axis, and
// adds amp × a noise vector in [-1, 1]³.
export function warp(x, y, z, octaves, k) {
  let dx = 0, dy = 0, dz = 0
  octaves.forEach((o, i) => {
    if (o.freq === 0 || o.amp === 0) return
    const c = Math.cos(o.rotate), s = Math.sin(o.rotate)
    const qx = (c * x - s * z) * o.freq * o.stretch[0]
    const qy = y * o.freq * o.stretch[1]
    const qz = (s * x + c * z) * o.freq * o.stretch[2]
    const seed = k * 16 + i * 4
    dx += o.amp * (noise(qx, qy, qz, seed) * 2 - 1)
    dy += o.amp * (noise(qx, qy, qz, seed + 1) * 2 - 1)
    dz += o.amp * (noise(qx, qy, qz, seed + 2) * 2 - 1)
  })
  return [dx, dy, dz]
}

// A trapezoid on v: 0 below a, up to 1 at b, 1 to c, down to 0 at d. a = b, or c = d, is a hard step.
export function ramp(v, [a, b, c, d]) {
  const up = b <= a ? (v >= a ? 1 : 0) : clamp01((v - a) / (b - a))
  const down = d <= c ? (v < c ? 1 : 0) : 1 - clamp01((v - c) / (d - c))
  return up * down
}

export function smoothstep(a, b, v) {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// Four octaves of value noise around q, [0, 1], seeded from slot k, so an edge is ragged down to a
// small fraction of its own size and not one smooth blob.
function edgeNoise(qx, qy, qz, k) {
  let n = 0, a = 1, f = 1, t = 0
  for (let o = 0; o < 4; o++) { n += a * noise(qx * f, qy * f, qz * f, k * 16 + 12 + o); t += a; a *= 0.5; f *= 2.03 }
  return n / t
}

// How much layer k covers a ground point (x, y, z) whose normal's y is ny. The first layer of each
// biome is its base and covers everything. The ramps give a coarse 0..1; warped noise moves it by
// ±amp, so the 0.5 crossing (the layer's edge) wanders per pixel; `edge` is how wide the crossing is,
// 0 a cut.
export function mask(layer, k, x, y, z, ny) {
  if (k % PER === 0) return 1
  if (!layer.on) return 0
  let v = ramp(y, layer.height) * ramp(1 - ny, layer.slope)
  if (layer.noise.amp !== 0) {
    const [wx, wy, wz] = warp(x, y, z, layer.warp, k)
    const f = layer.noise.freq
    v += layer.noise.amp * (edgeNoise((x + wx) * f, (y + wy) * f, (z + wz) * f, k) - 0.5) * 2
  }
  const e = Math.max(layer.edge, 0.001)
  return smoothstep(0.5 - e / 2, 0.5 + e / 2, v)
}

// How much biome j covers ground point (x, z). Biome 0 is the base and covers everything. It is
// noise of xz alone (y = 0), so a biome's border runs across the land without bending up a cliff:
// warped by the biome's octaves, `cover` plus ±amp of it, through the biome's `edge`.
// With `height` the mask uses the biome's land.edge, the wider border its landform is blended over.
export function biomeMask(biome, j, x, z, height = false) {
  if (j === 0) return 1
  if (!biome.on) return 0
  const k = LAYERS + j
  const [wx, wy, wz] = warp(x, 0, z, biome.warp, k)
  const f = biome.noise.freq
  const v = biome.cover + biome.noise.amp * (edgeNoise((x + wx) * f, wy * f, (z + wz) * f, k) - 0.5) * 2
  const e = Math.max(height ? biome.land.edge : biome.edge, 0.001)
  return smoothstep(0.5 - e / 2, 0.5 + e / 2, v)
}

// The biome weights at (x, z), summing to 1: stacked as the layers are (each biome lies over the ones
// before it), then each below BIOME_CUT dropped and the rest scaled back up.
export function biomeWeights(biomes, x, z, height = false) {
  const m = biomes.map((b, j) => biomeMask(b, j, x, z, height))
  const b = new Array(BIOMES)
  let above = 1
  for (let j = BIOMES - 1; j >= 0; j--) { b[j] = m[j] * above; above *= 1 - m[j] }
  let s = 0
  for (let j = 0; j < BIOMES; j++) { if (b[j] < BIOME_CUT) b[j] = 0; s += b[j] }
  return b.map(v => v / s)
}

// The composition of a biome's four layer masks into shares that sum to 1.
//   0 stack: each layer lies over the ones before it, w_k = m_k × Π_{j>k} (1 − m_j)
//   1 normalise: w_k = m_k / Σ m
//   2 sharpened: w_k = m_k⁴ / Σ m⁴
export const COMPOSE = { stack: 0, normalise: 1, sharpened: 2 }
export function compose(m, mode) {
  if (mode === 0) {
    const [, m1, m2, m3] = m
    return [(1 - m1) * (1 - m2) * (1 - m3), m1 * (1 - m2) * (1 - m3), m2 * (1 - m3), m3]
  }
  const p = mode === 2 ? m.map(v => v ** 4) : m
  const s = p[0] + p[1] + p[2] + p[3]
  return p.map(v => v / s)
}

// The LAYERS weights at a ground point: `ground.mix` of the issue. A dropped biome's layers are 0.
export function weights(biomes, mode, x, y, z, ny) {
  const b = biomeWeights(biomes, x, z)
  const w = new Array(LAYERS).fill(0)
  biomes.forEach((biome, j) => {
    if (b[j] === 0) return
    const share = compose(biome.layers.map((l, r) => mask(l, j * PER + r, x, y, z, ny)), mode)
    for (let r = 0; r < PER; r++) w[j * PER + r] = b[j] * share[r]
  })
  return w
}

// The uniforms the GLSL twin reads, from the same biome and layer objects the JS twin reads. The
// noise and octave arrays hold the layers' slots first and then the biomes'.
export function packField(biomes) {
  const height = [], slope = [], noiseU = [], oct = [], str = [], cover = []
  const octaves = (list) => {
    for (let i = 0; i < OCTAVES; i++) {
      const o = list[i]
      oct.push([o.freq, o.amp, Math.cos(o.rotate), Math.sin(o.rotate)])
      str.push(o.stretch)
    }
  }
  biomes.forEach((biome) => biome.layers.forEach((l, r) => {
    height.push(l.height)
    slope.push(l.slope)
    noiseU.push([l.noise.freq, l.noise.amp, l.edge, r === 0 || l.on ? 1 : 0])
    octaves(l.warp)
  }))
  biomes.forEach((biome, j) => {
    noiseU.push([biome.noise.freq, biome.noise.amp, biome.edge, j === 0 || biome.on ? 1 : 0])
    cover.push(biome.cover)
    octaves(biome.warp)
  })
  return { height, slope, noise: noiseU, oct, str, cover }
}

const u = v => `0x${(v >>> 0).toString(16)}u`

// The GLSL twin. Shared by the vertex and fragment shaders.
export function glsl() {
  const SLOTS = LAYERS + BIOMES
  return `
#define TW_BIOMES ${BIOMES}
#define TW_PER ${PER}
#define TW_LAYERS ${LAYERS}
uniform vec4 uHeight[${LAYERS}];
uniform vec4 uSlope[${LAYERS}];
uniform vec4 uNoise[${SLOTS}];
uniform vec4 uOct[${SLOTS * OCTAVES}];
uniform vec3 uStr[${SLOTS * OCTAVES}];
uniform float uCover[${BIOMES}];

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
vec3 twWarp(vec3 p, int k) {
  vec3 d = vec3(0.0);
  for (int i = 0; i < ${OCTAVES}; i++) {
    vec4 o = uOct[k * ${OCTAVES} + i];
    if (o.x == 0.0 || o.y == 0.0) continue;
    vec3 q = vec3(o.z * p.x - o.w * p.z, p.y, o.w * p.x + o.z * p.z) * o.x * uStr[k * ${OCTAVES} + i];
    uint s = uint(k * 16 + i * 4);
    d += o.y * (vec3(twNoise(q, s), twNoise(q, s + 1u), twNoise(q, s + 2u)) * 2.0 - 1.0);
  }
  return d;
}
float twRamp(float v, vec4 r) {
  float up = r.y <= r.x ? (v >= r.x ? 1.0 : 0.0) : clamp((v - r.x) / (r.y - r.x), 0.0, 1.0);
  float down = r.w <= r.z ? (v < r.z ? 1.0 : 0.0) : 1.0 - clamp((v - r.z) / (r.w - r.z), 0.0, 1.0);
  return up * down;
}
float twStep(float a, float b, float v) { float t = clamp((v - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float twEdgeNoise(vec3 q, int k) {
  float nn = 0.0, a = 1.0, f = 1.0, t = 0.0;
  for (int o = 0; o < 4; o++) { nn += a * twNoise(q * f, uint(k * 16 + 12 + o)); t += a; a *= 0.5; f *= 2.03; }
  return nn / t;
}
// wv is twWarp(p, k), passed in so the fragment works it out once for the mask and the read
float twMask(vec3 p, float ny, int k, vec3 wv) {
  if (k % TW_PER == 0) return 1.0;
  vec4 n = uNoise[k];
  if (n.w == 0.0) return 0.0;
  float v = twRamp(p.y, uHeight[k]) * twRamp(1.0 - ny, uSlope[k]);
  if (n.y != 0.0) v += n.y * (twEdgeNoise((p + wv) * n.x, k) - 0.5) * 2.0;
  float e = max(n.z, 0.001);
  return twStep(0.5 - e * 0.5, 0.5 + e * 0.5, v);
}
float twBiomeMask(vec2 xz, int j) {
  if (j == 0) return 1.0;
  int k = TW_LAYERS + j;
  vec4 n = uNoise[k];
  if (n.w == 0.0) return 0.0;
  vec3 p = vec3(xz.x, 0.0, xz.y);
  vec3 wv = twWarp(p, k);
  float v = uCover[j] + n.y * (twEdgeNoise((p + wv) * n.x, k) - 0.5) * 2.0;
  float e = max(n.z, 0.001);
  return twStep(0.5 - e * 0.5, 0.5 + e * 0.5, v);
}
void twBiomes(vec2 xz, out float b[TW_BIOMES]) {
  float above = 1.0;
  for (int j = TW_BIOMES - 1; j >= 0; j--) { float m = twBiomeMask(xz, j); b[j] = m * above; above *= 1.0 - m; }
  float s = 0.0;
  for (int j = 0; j < TW_BIOMES; j++) { if (b[j] < ${BIOME_CUT.toFixed(4)}) b[j] = 0.0; s += b[j]; }
  for (int j = 0; j < TW_BIOMES; j++) b[j] /= s;
}
vec4 twCompose(vec4 m, float mode) {
  if (mode < 0.5) return vec4((1.0 - m.y) * (1.0 - m.z) * (1.0 - m.w), m.y * (1.0 - m.z) * (1.0 - m.w), m.z * (1.0 - m.w), m.w);
  vec4 p = mode > 1.5 ? m * m * m * m : m;
  return p / (p.x + p.y + p.z + p.w);
}
`
}
