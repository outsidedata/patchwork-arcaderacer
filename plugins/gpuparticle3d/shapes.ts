// gpuparticle3d's own shapes, particle3d's (`plugins/particle3d/shapes.ts`) drawn alike, so a layer's `shape`
// looks the same in either plugin and neither imports the other: soft pictures every effects file can draw a
// particle as, by a layer's `shape`, with no sheet and no entry in any catalogue. They are drawn here, in
// numbers, into one strip of square cells, white, their shape in their alpha, so a layer's tint and gain
// colour them as they colour a square, and every particle drawn as one is in one mesh of its blend.
//
//   puff     a lumpy, soft round of smoke, lit a little from above.
//   puff2    another, lumpier, so a cloud of both is not one picture over and over.
//   glow     a round of light, brightest in the middle and fading out to nothing at its edge.
//   halo     a glowing ring round a faint middle, a shockwave's or a light's halo.
//   spark    a small hot dot with a soft edge.
//   streak   a line of light along x, faint at its tail on the left and bright at its head on the
//            right, for a layer that is stretched along its path.
//   ring     a thin, sharp ring at the edge of its cell.
//   star     a four-pointed flare round a bright core.
//   bolt     a jagged line of light along x from the middle of its left edge to the middle of its
//            right, with one fork, for a layer drawn as a `beam`: lightning between two points.
//   bolt2    another, jagged otherwise and forked the other way, so a flicker of both is not one
//            picture over and over.
//
// `SHAPES` lists them in their cells' order; `strip()` is the strip's pixels, `CELL` pixels a side
// each, from the bottom row up, as a three.js DataTexture reads them; `corners(name)` the strip's
// corners of a shape's cell, in the order gpuparticle3d lays a frame's: top left, top right, bottom
// left, bottom right.
export const SHAPES = ['puff', 'puff2', 'glow', 'halo', 'spark', 'streak', 'ring', 'star', 'bolt', 'bolt2'] as const
export type Shape = (typeof SHAPES)[number]
export const CELL = 128

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
// A round's fall off to nothing at its edge: exp(-(k r)²), less its value at r = 1.
const fall = (r: number, k: number) => Math.max(0, (Math.exp(-((k * r) ** 2)) - Math.exp(-k * k)) / (1 - Math.exp(-k * k)))

// Value noise at x, y, the same numbers on every machine: a lattice of hashed corners, eased between.
const hash = (x: number, y: number, seed: number) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const noise = (x: number, y: number, seed: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
const fbm = (x: number, y: number, seed: number) => {
  let sum = 0, amp = 0.5, f = 1
  for (let o = 0; o < 4; o++) {
    sum += amp * noise(x * f, y * f, seed + o)
    f *= 2
    amp *= 0.5
  }
  return sum / 0.9375
}

// A puff of smoke: a round whose edge the noise pushes in and out, its middle mottled, lit from above.
const puff = (seed: number, lumps: number) => (x: number, y: number) => {
  const r = Math.hypot(x, y), n = fbm(x * lumps + 4, y * lumps + 4, seed)
  const edge = r + (n - 0.5) * 0.55
  const a = smooth(0.95, 0.35, edge) * (0.55 + 0.45 * fbm(x * lumps * 2 + 9, y * lumps * 2 + 9, seed + 10)) * smooth(1, 0.85, r)
  return [0.72 + 0.28 * smooth(-0.8, 0.8, y), a]
}

// How far x, y is from the line between a and b.
const off = (x: number, y: number, a: number[], b: number[]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t)
}

// A bolt of lightning: a line from the middle of the left edge to the middle of the right through
// `knots` points between, each thrown up or down off the straight line by the seed, less so near the
// ends; and a fork, thinner and fainter, leaving one of the points `side` way (1 up, -1 down) and
// running on toward the right. A hot thin core in a soft glow, fading out at the cell's two ends.
const bolt = (seed: number, knots: number, side: number) => {
  const line: number[][] = [[-1, 0]]
  for (let i = 1; i <= knots; i++) {
    const along = i / (knots + 1)
    line.push([along * 2 - 1 + (hash(i, 1, seed) - 0.5) * (1 / knots), (hash(i, 0, seed) * 2 - 1) * 0.5 * Math.min(1, 4 * along, 4 * (1 - along))])
  }
  line.push([1, 0])
  const from = 1 + Math.floor(hash(0, 2, seed) * (knots - 2))
  const fork: number[][] = [line[from]]
  for (let i = 1; i <= 3; i++) {
    const [x, y] = fork[i - 1]
    fork.push([x + 0.16 + 0.1 * hash(i, 3, seed), Math.max(-0.8, Math.min(0.8, y + side * (0.1 + 0.16 * hash(i, 4, seed))))])
  }
  const near = (x: number, y: number, pts: number[][]) => {
    let d = Infinity
    for (let i = 1; i < pts.length; i++) d = Math.min(d, off(x, y, pts[i - 1], pts[i]))
    return d
  }
  const lit = (d: number, core: number) => Math.exp(-((d / core) ** 2)) + 0.22 * Math.exp(-((d / (core * 4)) ** 2))
  return (x: number, y: number) => [
    1,
    Math.min(1, lit(near(x, y, line), 0.03) + 0.55 * lit(near(x, y, fork), 0.022)) * smooth(0.98, 0.86, Math.abs(x)) * smooth(1, 0.92, Math.abs(y)),
  ]
}

// Each shape's light and alpha at x, y, each from -1 to 1 across its cell, y up.
const DRAW: Record<Shape, (x: number, y: number) => number[]> = {
  puff: puff(1, 1.6),
  puff2: puff(7, 2.4),
  glow: (x, y) => [1, fall(Math.hypot(x, y), 2.2)],
  halo: (x, y) => {
    const r = Math.hypot(x, y)
    return [1, Math.min(1, Math.exp(-(((r - 0.68) / 0.13) ** 2)) + 0.18 * fall(r, 1.6)) * smooth(1, 0.9, r)]
  },
  spark: (x, y) => {
    const r = Math.hypot(x, y)
    return [1, Math.min(1, smooth(0.32, 0.12, r) + 0.45 * fall(r, 2.6))]
  },
  streak: (x, y) => {
    const along = (x + 1) / 2
    return [1, Math.exp(-((y / 0.13) ** 2)) * along ** 1.6 * smooth(0.98, 0.75, x) * smooth(-1, -0.9, x)]
  },
  ring: (x, y) => [1, Math.exp(-(((Math.hypot(x, y) - 0.86) / 0.05) ** 2)) * smooth(1, 0.96, Math.hypot(x, y))],
  star: (x, y) => {
    const r = Math.hypot(x, y)
    const ray = (a: number, b: number) => Math.exp(-((b / (0.05 + 0.04 * (1 - Math.abs(a)))) ** 2)) * (1 - Math.abs(a)) ** 2
    return [1, Math.min(1, ray(x, y) + ray(y, x) + 0.8 * fall(r, 3.2)) * smooth(1, 0.92, r)]
  },
  bolt: bolt(3, 7, 1),
  bolt2: bolt(11, 9, -1),
}

// The strip's pixels, RGBA, CELL × CELL a shape, left to right in SHAPES' order, from the bottom row up.
export function strip(): Uint8Array {
  const w = CELL * SHAPES.length, out = new Uint8Array(w * CELL * 4)
  SHAPES.forEach((s, i) => {
    for (let py = 0; py < CELL; py++)
      for (let px = 0; px < CELL; px++) {
        const [light, a] = DRAW[s](((px + 0.5) / CELL) * 2 - 1, ((py + 0.5) / CELL) * 2 - 1)
        const o = 4 * (py * w + i * CELL + px), l = Math.round(255 * light)
        out[o] = out[o + 1] = out[o + 2] = l
        out[o + 3] = Math.round(255 * Math.min(1, Math.max(0, a)))
      }
  })
  return out
}

// The strip's corners of a shape's cell, half a pixel in so no neighbour's edge bleeds in: top left,
// top right, bottom left, bottom right, each u, v.
export function corners(s: Shape): number[] {
  const w = CELL * SHAPES.length, i = SHAPES.indexOf(s)
  const u0 = (i * CELL + 0.5) / w, u1 = ((i + 1) * CELL - 0.5) / w, v0 = 0.5 / CELL, v1 = 1 - 0.5 / CELL
  return [u0, v1, u1, v1, u0, v0, u1, v0]
}
