// The pixels of pictures a panel reads, not only draws: an image's every pixel as RGBA, a frame cut
// out of a sheet's page and stood upright, the same turned over left to right or drawn in other
// colours. A PNG is decoded by the loader's `decodePng`, byte for byte as the file holds it, so a
// colour is the colour written and never one a canvas has multiplied by its alpha and back; an image
// of any other kind is decoded by the browser. And a picture drawn on as a canvas is (`raster`), so
// what a panel draws on its canvas a command answers as a PNG, drawn by the one function that draws
// it on both.
import { useEffect, useState } from 'react'
import { decodePng, encodePng, isPng } from '#plugins/loader/loader.sim.ts'
import { rgbaOf } from './theme.ts'

// `data` is `width` × `height` pixels, a row at a time from the top, each red, green, blue and
// alpha from 0 to 255, alpha not multiplied in.
export type Pixels = { width: number; height: number; data: Uint8ClampedArray }

export const blank = (width: number, height: number): Pixels => ({ width, height, data: new Uint8ClampedArray(width * height * 4) })

// An image of any kind the browser decodes, read off a canvas.
async function decodeOther(bytes: Uint8Array): Promise<Pixels> {
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  return { width: bitmap.width, height: bitmap.height, data }
}

// The pixels of the image at `url`, a plain path, encoded once, with `encodeURI`, where it is fetched:
// read once for the page, which a change to the file on disk reloads, and read again after a failure.
const read = new Map<string, Promise<Pixels>>()
export function pixelsAt(url: string): Promise<Pixels> {
  const had = read.get(url)
  if (had) return had
  const got = fetch(encodeURI(url)).then(async res => {
    if (!res.ok) throw new Error(`could not fetch ${url}: ${res.status}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    return isPng(bytes) ? decodePng(bytes) : decodeOther(bytes)
  })
  read.set(url, got)
  got.catch(() => read.delete(url))
  return got
}

// The pixels of the images at `urls`, in order, once every one has been read; undefined until then,
// and the reason when one could not be.
export function usePixels(urls: string[]): { pixels?: Pixels[]; error?: string } {
  const key = urls.join('\n')
  const [got, setGot] = useState<{ key: string; pixels?: Pixels[]; error?: string }>()
  useEffect(() => {
    let gone = false
    Promise.all(key.split('\n').filter(Boolean).map(pixelsAt)).then(
      pixels => { if (!gone) setGot({ key, pixels }) },
      (e: Error) => { if (!gone) setGot({ key, error: e.message }) },
    )
    return () => { gone = true }
  }, [key])
  return got?.key === key ? got : {}
}

// A frame of a page stood upright in its whole frame: `box` [x, y, w, h] where its pixels lie on the
// page, turned a quarter clockwise there when `rotated`, so the upright picture's top row runs down
// the box's right edge; `size` [w, h] the whole frame; `trim` [x, y, w, h] where the pixels kept lie
// in it. Every pixel of the whole frame outside the kept ones is clear.
export function cut(page: Pixels, box: number[], rotated: boolean, size: number[], trim: number[]): Pixels {
  const [bx, by, bw] = box, [tx, ty, tw, th] = trim
  const out = blank(size[0], size[1])
  for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) {
    const [px, py] = rotated ? [bx + bw - 1 - v, by + u] : [bx + u, by + v]
    const x = tx + u, y = ty + v
    if (px < 0 || py < 0 || px >= page.width || py >= page.height || x >= size[0] || y >= size[1]) continue
    const from = (py * page.width + px) * 4
    out.data.set(page.data.subarray(from, from + 4), (y * size[0] + x) * 4)
  }
  return out
}

// The picture turned over left to right.
export function mirrored(p: Pixels): Pixels {
  const out = blank(p.width, p.height)
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
    const from = (y * p.width + x) * 4
    out.data.set(p.data.subarray(from, from + 4), (y * p.width + p.width - 1 - x) * 4)
  }
  return out
}

// The picture with colour k of `from` drawn as colour k of `to`, both as 0xRRGGBB: every pixel with
// any alpha of exactly that colour, to within a 255th, and no other, the first of `from` it matches.
export function swapped(p: Pixels, from: number[], to: number[]): Pixels {
  const out = { ...p, data: new Uint8ClampedArray(p.data) }
  const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
  const pairs = from.map((c, k) => [rgb(c), rgb(to[k])])
  for (let i = 0; i < out.data.length; i += 4) {
    if (!out.data[i + 3]) continue
    const hit = pairs.find(([f]) => Math.abs(f[0] - out.data[i]) < 1 && Math.abs(f[1] - out.data[i + 1]) < 1 && Math.abs(f[2] - out.data[i + 2]) < 1)
    if (hit) out.data.set(hit[1], i)
  }
  return out
}

// The lowest row with a pixel at least half opaque, or undefined for a picture with none.
export function inkBottom(p: Pixels): number | undefined {
  for (let y = p.height - 1; y >= 0; y--) for (let x = 0; x < p.width; x++) if (p.data[(y * p.width + x) * 4 + 3] >= 128) return y
  return undefined
}

// A canvas holding the picture at its own pixels, to draw from: one per picture.
const canvases = new WeakMap<Pixels, HTMLCanvasElement>()
export function canvasOf(p: Pixels): HTMLCanvasElement | undefined {
  const had = canvases.get(p)
  if (had) return had
  const canvas = document.createElement('canvas')
  canvas.width = p.width
  canvas.height = p.height
  const ctx = canvas.getContext('2d')
  if (!ctx || !p.width || !p.height) return undefined
  ctx.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0)
  canvases.set(p, canvas)
  return canvas
}

// What drawing a picture asks of what it draws on: a panel's canvas's context, or a picture's pixels
// (`raster`).
export type Pen = Pick<CanvasRenderingContext2D, 'strokeStyle' | 'fillStyle' | 'globalAlpha' | 'lineWidth' | 'setLineDash' | 'strokeRect' | 'fillRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'stroke'>

// A picture `width` by `height` of the colour `ground`, 0xrrggbb, drawn on as a canvas is: a line a
// pixel wide through each pixel it passes through, one on the far edge of the picture in its last
// pixel, which a canvas's line a pixel wide there half covers; a wider line over each pixel whose
// middle is within half its width of it and between its ends, a rectangle's sides meeting square at
// its corners; each dashed as `setLineDash` says, along its path from where the path starts; a
// rectangle filled over each pixel whose middle is in it; and a picture drawn at any size, each pixel
// the nearest of its own, as a canvas that does not smooth draws it (`image`). Each is blended over
// what is there at the pen's opacity times its colour's alpha, a colour being any CSS colour the page
// reads (`rgbaOf`), and anything else a grey, and a picture's pixel's alpha. `png` is it as a PNG.
export function raster(width: number, height: number, ground: number) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set([ground >> 16, (ground >> 8) & 255, ground & 255, 255], i * 4)
  // Each style read once, as the page reads it.
  const styles = new Map<string, [number, number, number, number]>()
  const colourOf = (style: unknown) => {
    const css = String(style)
    let got = styles.get(css)
    if (!got) styles.set(css, (got = rgbaOf(css) ?? [136, 136, 136, 1]))
    return got
  }
  // The first pixel whose middle is at `v` or past it.
  const from = (v: number) => Math.max(0, Math.ceil(v - 0.5))
  const put = (i: number, r: number, g: number, b: number, alpha: number) => {
    for (const [j, v] of [r, g, b].entries()) data[i + j] = data[i + j] + (v - data[i + j]) * alpha
  }
  const blend = (at: Iterable<number>, style: unknown) => {
    const [r, g, b, a] = colourOf(style)
    for (const i of at) put(i, r, g, b, a * pen.globalAlpha)
  }
  // The dash a path is drawn in, each length drawn then skipped by turns, a list of an odd count
  // being itself twice, as a canvas reads it; none, a line unbroken. Whether the path is drawn
  // `d` along it.
  let dash: number[] = []
  const drawnAt = (d: number) => {
    const whole = dash.reduce((s, v) => s + v, 0)
    if (!whole) return true
    let t = d % whole
    for (const [k, v] of dash.entries()) {
      if (t < v) return k % 2 === 0
      t -= v
    }
    return true
  }
  // The pixels, by their place in `data`, the line from one point to another covers, `from` along its
  // path where it starts, and `past` further than each end for a side meeting another square.
  const line = (into: Set<number>, x0: number, y0: number, x1: number, y1: number, from: number, past: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (pen.lineWidth <= 1) {
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
      const at = (v: number, most: number) => (v === most ? most - 1 : Math.floor(v))
      for (let s = 0; s <= n; s++) {
        if (!drawnAt(from + (len * s) / n)) continue
        const px = at(x0 + ((x1 - x0) * s) / n, width), py = at(y0 + ((y1 - y0) * s) / n, height)
        if (px >= 0 && py >= 0 && px < width && py < height) into.add((py * width + px) * 4)
      }
      return
    }
    if (!len) return
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len, half = pen.lineWidth / 2, reach = half + past
    const [l, r] = [Math.min(x0, x1) - reach, Math.max(x0, x1) + reach], [t, b] = [Math.min(y0, y1) - reach, Math.max(y0, y1) + reach]
    for (let py = Math.max(0, Math.floor(t)); py < Math.min(height, Math.ceil(b)); py++)
      for (let px = Math.max(0, Math.floor(l)); px < Math.min(width, Math.ceil(r)); px++) {
        const cx = px + 0.5 - x0, cy = py + 0.5 - y0
        const along = cx * ux + cy * uy, off = cy * ux - cx * uy
        if (along >= -past && along < len + past && off >= -half && off < half && drawnAt(from + along)) into.add((py * width + px) * 4)
      }
  }
  let runs: number[][][] = []
  const pen: Pen = {
    strokeStyle: '#888888',
    fillStyle: '#888888',
    globalAlpha: 1,
    lineWidth: 1,
    setLineDash(list: number[]) { dash = list.length % 2 ? [...list, ...list] : [...list] },
    strokeRect(x, y, w, h) {
      const at = new Set<number>()
      let along = 0
      for (const [a, b, c, d] of [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]]) {
        line(at, a, b, c, d, along, pen.lineWidth / 2)
        along += Math.hypot(c - a, d - b)
      }
      blend(at, pen.strokeStyle)
    },
    fillRect(x, y, w, h) {
      const at = new Set<number>()
      // Each pixel whose middle is in it.
      for (let py = from(y); py < Math.min(height, Math.ceil(y + h - 0.5)); py++) for (let px = from(x); px < Math.min(width, Math.ceil(x + w - 0.5)); px++) at.add((py * width + px) * 4)
      blend(at, pen.fillStyle)
    },
    beginPath() { runs = [] },
    moveTo(x, y) { runs.push([[x, y]]) },
    lineTo(x, y) { runs.at(-1)?.push([x, y]) },
    stroke() {
      const at = new Set<number>()
      for (const run of runs) {
        let along = 0
        for (let i = 1; i < run.length; i++) {
          line(at, run[i - 1][0], run[i - 1][1], run[i][0], run[i][1], along, 0)
          along += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1])
        }
      }
      blend(at, pen.strokeStyle)
    },
  }
  // The picture `p` drawn over [x, y] to [x + w, y + h]: each pixel whose middle is in it takes the
  // pixel of `p` under that middle, blended in by its alpha.
  const image = (p: Pixels, x: number, y: number, w: number, h: number) => {
    if (!p.width || !p.height || w <= 0 || h <= 0) return
    for (let py = from(y); py < Math.min(height, Math.ceil(y + h - 0.5)); py++) {
      const sy = Math.min(p.height - 1, Math.floor(((py + 0.5 - y) * p.height) / h))
      for (let px = from(x); px < Math.min(width, Math.ceil(x + w - 0.5)); px++) {
        const sx = Math.min(p.width - 1, Math.floor(((px + 0.5 - x) * p.width) / w))
        const s = (sy * p.width + sx) * 4
        if (p.data[s + 3]) put((py * width + px) * 4, p.data[s], p.data[s + 1], p.data[s + 2], (p.data[s + 3] / 255) * pen.globalAlpha)
      }
    }
  }
  return { pen, image, png: () => new Blob([encodePng({ width, height, data, text: {} }) as BlobPart], { type: 'image/png' }) }
}
