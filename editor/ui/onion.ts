// Onionskinning: the frames of one animation put on top of each other, each on its own place, so a
// frame the packer moved shows as a fringe of colour where the others agree in white. Whether two
// frames are one drawing is the loader's measure (`slip` and `verdict`, `plugins/loader/loader.extension.tsx`).
//
// A frame is its picture and `at`, where the picture's top left lies from a point every frame shares,
// the point a thing stands on, so the frames are laid over each other as they are drawn. An anchor on
// a half pixel makes `at` a half pixel too; it is rounded to the pixel, as every frame of a sheet
// anchored on halves is, so they keep their places against each other.
import { blank, type Pixels } from './pixels.ts'

export type Layer = { pixels: Pixels; at: [number, number] }

// Inked as the loader's measure inks a pixel: any alpha above 0.
const inked = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3] > 0
const placed = (l: Layer): [number, number] => [Math.round(l.at[0]), Math.round(l.at[1])]

// Frame k of n's colour, along a ramp of hues round the wheel; one frame alone is white.
export function tint(k: number, n: number): [number, number, number] {
  if (n === 1) return [1, 1, 1]
  const h = (k / Math.max(1, n)) * 6
  const f = (o: number) => {
    const t = (h + o) % 6
    return Math.max(0, Math.min(1, Math.abs(t - 3) - 1))
  }
  return [f(0), f(4), f(2)]
}

// Every frame's inked pixels in its own colour, added together over black and scaled so that a pixel
// every frame inks is white; and where the picture's top left lies from the shared point.
export function onion(layers: Layer[]): Layer {
  if (!layers.length) return { pixels: blank(0, 0), at: [0, 0] }
  const ats = layers.map(placed)
  const x0 = Math.min(...ats.map(a => a[0])), y0 = Math.min(...ats.map(a => a[1]))
  const x1 = Math.max(...layers.map((l, k) => ats[k][0] + l.pixels.width)), y1 = Math.max(...layers.map((l, k) => ats[k][1] + l.pixels.height))
  const out = blank(x1 - x0, y1 - y0)
  const tints = layers.map((_, k) => tint(k, layers.length))
  const whole = [0, 1, 2].map(c => tints.reduce((s, t) => s + t[c], 0))
  const sum = new Float32Array(out.width * out.height * 3)
  layers.forEach((l, k) => {
    for (let y = 0; y < l.pixels.height; y++) for (let x = 0; x < l.pixels.width; x++) {
      if (!inked(l.pixels, x, y)) continue
      const o = (y + ats[k][1] - y0) * out.width + (x + ats[k][0] - x0)
      for (let c = 0; c < 3; c++) sum[o * 3 + c] += tints[k][c]
    }
  })
  for (let i = 0; i < out.width * out.height; i++) {
    for (let c = 0; c < 3; c++) out.data[i * 4 + c] = Math.round((255 * sum[i * 3 + c]) / whole[c])
    out.data[i * 4 + 3] = 255
  }
  // Laid back by what rounding moved the first frame, so the picture stands where the frames are drawn.
  return { pixels: out, at: [x0 + layers[0].at[0] - ats[0][0], y0 + layers[0].at[1] - ats[0][1]] }
}

// A frame's inked pixels in one colour, [r, g, b] from 0 to 1, and every other pixel clear.
export function silhouette(p: Pixels, [r, g, b]: [number, number, number]): Pixels {
  const out = blank(p.width, p.height)
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    if (inked(p, x, y)) out.data.set([r * 255, g * 255, b * 255, 255], (y * p.width + x) * 4)
  }
  return out
}
