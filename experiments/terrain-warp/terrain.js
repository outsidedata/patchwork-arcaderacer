// The test ground: a 4096 m square heightfield with a flat valley floor, slopes, ridged peaks up past
// the snow line and terraced cliff bands, so every layer rule (height, slope) has ground to act on.
//
// The mesh is an 8 m grid (as coarse as terrain3d's). The ground's shape is also baked at 2 m into a
// normal map, which the shader reads per pixel for the slope rules, the triplanar weights and the
// light, so a cliff narrower than a triangle is still drawn as a cliff and not as the triangle. The JS
// `sample` reads the same bake with the same bilinear arithmetic, so the sim's weights match the GPU's.
import { biomeWeights, noise, smoothstep } from './warp.js'

export const SIZE = 4096
export const N = 512
export const STEP = SIZE / N
export const BAKE = 2048
export const BAKE_STEP = SIZE / BAKE

function fbm(x, z, octaves, seed) {
  let a = 0.5, f = 1, s = 0, t = 0
  for (let i = 0; i < octaves; i++) {
    s += a * noise(x * f, 0.5, z * f, seed + i)
    t += a
    a *= 0.5
    f *= 2.03
  }
  return s / t
}

// Rolling dunes: transverse ridges across the wind, each a long gentle windward climb and a short
// steeper lee, rounded at crest and trough. The crest lines wander (their phase is bent by slow
// noise), fork and fade (their height is modulated by noise), a second smaller set crosses at an
// angle, and a broad swell lifts whole fields of them. `d` is the biome's dune settings.
function dunesAt(x, z, d) {
  const a = (d.wind * Math.PI) / 180, ux = Math.cos(a), uz = Math.sin(a)
  const along = x * ux + z * uz, across = -x * uz + z * ux
  const profile = (s, lee) => {
    // s in [0, 1): climb to the crest over 1 − lee, drop over lee; smoothstep rounds both ends
    const t = s < 1 - lee ? s / (1 - lee) : (1 - s) / lee
    return t * t * (3 - 2 * t)
  }
  const bend = d.wavelength * 0.9 * (fbm(x / (d.wavelength * 4), z / (d.wavelength * 4), 3, 980) - 0.5)
  const p1 = (along + bend) / d.wavelength
  const s1 = p1 - Math.floor(p1)
  const fade = smoothstep(0.25, 0.75, fbm(across / (d.wavelength * 2.5), along / (d.wavelength * 6), 3, 985))
  const a2 = a + 0.9, along2 = x * Math.cos(a2) + z * Math.sin(a2)
  const p2 = (along2 + bend * 0.6) / (d.wavelength * 0.43)
  const s2 = p2 - Math.floor(p2)
  const swell = fbm(x / 900, z / 900, 3, 990)
  return d.base + d.swell * swell + d.height * (0.35 + 0.65 * fade) * profile(s1, d.lee) + d.height * 0.25 * profile(s2, d.lee)
}

// The ground's height: each biome's own landform, blended by the biomes' height weights, which use
// the same border as the textures but a wider edge, so a mountain runs down into the sand instead of
// stopping at a cliff where the texture changes.
export function heightAt(x, z, biomes) {
  const w = biomes ? biomeWeights(biomes, x, z, true) : [1]
  let h = 0
  w.forEach((v, j) => {
    if (v === 0) return
    const land = biomes ? biomes[j].land : { form: 'alpine' }
    h += v * (land.form === 'dunes' ? dunesAt(x, z, land) : alpineAt(x, z))
  })
  return h
}

function alpineAt(x, z) {
  const b = smoothstep(0.32, 0.72, fbm(x / 1100, z / 1100, 5, 900))
  // ridges: each octave folded about its middle, so crests are sharp lines; the domain is bent by a slow
  // noise first so ridges wander instead of running in rows. Raised to a power, a crest's flanks steepen
  // into irregular cliffs where the ridge is tall, and the valleys between stay soft.
  const wx = x + 300 * (fbm(x / 900, z / 900, 2, 960) - 0.5), wz = z + 300 * (fbm(x / 900 + 5.3, z / 900 - 2.1, 2, 970) - 0.5)
  let r = 0, a = 0.5, f = 1 / 520, t = 0
  for (let i = 0; i < 5; i++) {
    const n = 1 - Math.abs(2 * noise(wx * f, 0.5, wz * f, 920 + i) - 1)
    r += a * n * n
    t += a
    a *= 0.5
    f *= 2.1
  }
  r /= t
  // the ridges stand only where the broad landform is up, so the low ground opens into valleys
  return 30 + 220 * b * b + 520 * Math.pow(r, 2.2) * b * b
}

export function buildGrid(biomes) {
  // the bake: heights every 2 m, and from them a normal per texel
  const nb = BAKE + 1
  const bh = new Float32Array(nb * nb)
  for (let j = 0; j < nb; j++) for (let i = 0; i < nb; i++) bh[j * nb + i] = heightAt(-SIZE / 2 + i * BAKE_STEP, -SIZE / 2 + j * BAKE_STEP, biomes)
  const hb = (i, j) => bh[Math.min(nb - 1, Math.max(0, j)) * nb + Math.min(nb - 1, Math.max(0, i))]
  const bake = new Float32Array(nb * nb * 4)
  for (let j = 0; j < nb; j++) {
    for (let i = 0; i < nb; i++) {
      const nx = hb(i - 1, j) - hb(i + 1, j), nz = hb(i, j - 1) - hb(i, j + 1), ny = 2 * BAKE_STEP
      const l = Math.hypot(nx, ny, nz), o = (j * nb + i) * 4
      bake[o] = nx / l
      bake[o + 1] = ny / l
      bake[o + 2] = nz / l
      bake[o + 3] = 1
    }
  }

  // the mesh: every fourth bake height
  const n = N + 1, every = BAKE / N
  const heights = new Float32Array(n * n)
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = bh[j * every * nb + i * every]
  const positions = new Float32Array(n * n * 3)
  const normals = new Float32Array(n * n * 3)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = j * n + i, o = (j * every * nb + i * every) * 4
      positions[v * 3] = -SIZE / 2 + i * STEP
      positions[v * 3 + 1] = heights[v]
      positions[v * 3 + 2] = -SIZE / 2 + j * STEP
      normals[v * 3] = bake[o]
      normals[v * 3 + 1] = bake[o + 1]
      normals[v * 3 + 2] = bake[o + 2]
    }
  }
  // each cell is two triangles, (a, b, d) and (b, c, d), a at (i, j), b at (i, j+1), c at (i+1, j+1), d at (i+1, j)
  const index = new Uint32Array(N * N * 6)
  let o = 0
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * n + i, b = (j + 1) * n + i, c = (j + 1) * n + i + 1, d = j * n + i + 1
      index.set([a, b, d, b, c, d], o)
      o += 6
    }
  }

  // The baked normal at (x, z), blended from its four texels: the same arithmetic as the shader's twBaked.
  const normalAt = (x, z) => {
    const gx = Math.min(BAKE - 1e-3, Math.max(0, (x + SIZE / 2) / BAKE_STEP)), gz = Math.min(BAKE - 1e-3, Math.max(0, (z + SIZE / 2) / BAKE_STEP))
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j
    const t = (ii, jj, c) => bake[((j + jj) * nb + i + ii) * 4 + c]
    const v = [0, 1, 2].map(c => (t(0, 0, c) * (1 - fx) + t(1, 0, c) * fx) * (1 - fz) + (t(0, 1, c) * (1 - fx) + t(1, 1, c) * fx) * fz)
    const l = Math.hypot(v[0], v[1], v[2])
    return [v[0] / l, v[1] / l, v[2] / l]
  }
  // The height the GPU draws at (x, z) (the mesh's triangle, barycentric) and the baked normal there.
  const sample = (x, z) => {
    const gx = Math.min(N - 1e-6, Math.max(0, (x + SIZE / 2) / STEP)), gz = Math.min(N - 1e-6, Math.max(0, (z + SIZE / 2) / STEP))
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j
    const a = j * n + i, b = (j + 1) * n + i, c = (j + 1) * n + i + 1, d = j * n + i + 1
    const tri = fx + fz <= 1
      ? [[a, 1 - fx - fz], [b, fz], [d, fx]]
      : [[b, 1 - fx], [c, fx + fz - 1], [d, 1 - fz]]
    let h = 0
    for (const [v, w] of tri) h += heights[v] * w
    const [nx, ny, nz] = normalAt(x, z)
    return { h, nx, ny, nz }
  }
  return { positions, normals, index, sample, bake, bakeSize: nb }
}
