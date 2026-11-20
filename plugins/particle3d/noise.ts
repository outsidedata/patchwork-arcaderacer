// A still field of numbers over space for the force generators of particle3d and particle2d:
// `noise(x, y, z)` is a smooth value from -1 to 1 at that point, the same on every page and every run,
// changing over about one unit. A force generator's entry samples it at a particle's place times its
// `noiseFrequency`, and scales its force by 1 + `noiseAmplitude` times what it reads there, so particles
// flying through feel the force stronger in some places and weaker in others (particle3d's header and
// particle2d's, Force generators). particle2d reads it on the plane z = 0.
//
// It is value noise: a number rolled for each whole point of space by hashing its three coordinates,
// and between them a blend of the eight round a point, eased so the field has no creases at the whole
// points.
//
// `curl(x, y, z)` is a still field of pushes over the same space: a vector [x, y, z] at that point, the
// same on every page and every run, changing over about one unit. It is the curl of three such noise
// fields, so it neither gathers the particles it carries to a point nor spreads them from one: they are
// turned and folded, as smoke in moving air is. A force generator's entry pushes a particle along it,
// `turbulence` metres a second a second hard. `curl2(x, y)` is the same on a plane, particle2d's: a
// vector [x, y] at that point, the curl of the noise on the plane z = 0 read a little off the whole
// points, which runs along the noise's lines of one value and so neither gathers nor spreads what it
// carries either.

// A number from -1 to 1 for the whole point i, j, k, the same every time.
const hash = (i: number, j: number, k: number) => {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return ((h >>> 0) / 4294967295) * 2 - 1
}
// Eased from 0 to 1, flat at both ends.
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function noise(x: number, y: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z)
  const u = ease(x - i), v = ease(y - j), w = ease(z - k)
  const edge = (dj: number, dk: number) => lerp(hash(i, j + dj, k + dk), hash(i + 1, j + dj, k + dk), u)
  return lerp(lerp(edge(0, 0), edge(1, 0), v), lerp(edge(0, 1), edge(1, 1), v), w)
}

// How fast `ease` rises at t.
const rise = (t: number) => 30 * t * t * (t - 1) * (t - 1)
// How fast the noise changes at a point along x, y and z, written into `out` from `o`.
const slope = (x: number, y: number, z: number, out: number[], o: number) => {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z)
  const fx = x - i, fy = y - j, fz = z - k
  const u = ease(fx), v = ease(fy), w = ease(fz)
  const a = hash(i, j, k), b = hash(i + 1, j, k), c = hash(i, j + 1, k), d = hash(i + 1, j + 1, k)
  const e = hash(i, j, k + 1), f = hash(i + 1, j, k + 1), g = hash(i, j + 1, k + 1), h = hash(i + 1, j + 1, k + 1)
  const near = lerp(a, b, u), far = lerp(c, d, u), near1 = lerp(e, f, u), far1 = lerp(g, h, u)
  out[o] = rise(fx) * lerp(lerp(b - a, d - c, v), lerp(f - e, h - g, v), w)
  out[o + 1] = rise(fy) * lerp(far - near, far1 - near1, w)
  out[o + 2] = rise(fz) * (lerp(near1, far1, v) - lerp(near, far, v))
}
// The three slopes a curl reads, kept from call to call.
const slopes = [0, 0, 0, 0, 0, 0, 0, 0, 0]

// The curl of three noise fields, the second and third the first read far off it, written into `out`.
export function curlInto(out: number[], x: number, y: number, z: number): number[] {
  const s = slopes
  slope(x, y, z, s, 0)
  slope(x + 31.4, y - 17.2, z + 8.9, s, 3)
  slope(x - 12.7, y + 43.1, z + 27.6, s, 6)
  out[0] = s[7] - s[5]
  out[1] = s[2] - s[6]
  out[2] = s[3] - s[1]
  return out
}
export function curl(x: number, y: number, z: number): [number, number, number] {
  return curlInto([0, 0, 0], x, y, z) as [number, number, number]
}

// The curl of the noise on the plane z = 0: its slope turned a quarter, [∂n/∂y, -∂n/∂x]. The noise has no
// slope at its whole points, and a stage's pixels times a round frequency are whole numbers, so it is read
// off them by a part of a unit that no round number makes whole: a particle thrown from a round pixel is
// pushed as any other is.
export function curl2(x: number, y: number): [number, number] {
  slope(x + 0.3819, y + 0.6180, 0, slopes, 0)
  return [slopes[1], -slopes[0]]
}
