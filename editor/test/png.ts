// PNG files for a test to read: pixels written as a PNG of any colour type and bit depth, each row
// filtered as the test says, interlaced with Adam7 when asked, with a palette and a transparency
// chunk when given, so what a decoder makes of them can be checked against the pixels they came from.
import { crc32, deflateSync } from 'node:zlib'

export type Png = {
  width: number
  height: number
  // 0 grey, 2 RGB, 3 palette, 4 grey and alpha, 6 RGBA.
  type: 0 | 2 | 3 | 4 | 6
  depth: 1 | 2 | 4 | 8 | 16
  // Each pixel's samples at the image's depth, a row at a time from the top.
  samples: number[][]
  palette?: [number, number, number][]
  trns?: number[]
  // The filter of each row, 0 to 4, round again when there are more rows; 0 when left out.
  filters?: number[]
  interlace?: boolean
}

const SAMPLES = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]

const chunk = (name: string, body: Uint8Array) => {
  const out = Buffer.alloc(12 + body.length)
  out.writeUInt32BE(body.length, 0)
  out.write(name, 4, 'latin1')
  Buffer.from(body).copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length)
  return out
}

// One row's samples packed at `depth` bits, big-endian as PNG writes them.
function pack(samples: number[], depth: number): number[] {
  if (depth === 16) return samples.flatMap(v => [v >> 8, v & 255])
  if (depth === 8) return samples
  const out = new Array(Math.ceil((samples.length * depth) / 8)).fill(0)
  samples.forEach((v, i) => { out[(i * depth) >> 3] |= v << (8 - depth - ((i * depth) & 7)) })
  return out
}

// A row filtered with `f` against the row above it, both packed, `back` bytes to a pixel.
function filtered(f: number, row: number[], above: number[], back: number): number[] {
  return row.map((x, i) => {
    const a = i >= back ? row[i - back] : 0, b = above[i] ?? 0, c = i >= back ? above[i - back] ?? 0 : 0
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    const predicted = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]
    return (x - predicted) & 255
  })
}

export function png(p: Png): Uint8Array {
  const per = SAMPLES[p.type], back = Math.max(1, (per * p.depth) >> 3)
  const lines: number[] = []
  let k = 0
  for (const [x0, y0, dx, dy] of p.interlace ? ADAM7 : [[0, 0, 1, 1]]) {
    let above: number[] = []
    for (let y = y0; y < p.height; y += dy) {
      const pixels: number[] = []
      for (let x = x0; x < p.width; x += dx) pixels.push(...p.samples[y].slice(x * per, (x + 1) * per))
      if (!pixels.length) continue
      const row = pack(pixels, p.depth)
      const f = p.filters?.[k++ % p.filters.length] ?? 0
      lines.push(f, ...filtered(f, row, above, back))
      above = row
    }
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(p.width, 0)
  head.writeUInt32BE(p.height, 4)
  head.set([p.depth, p.type, 0, 0, p.interlace ? 1 : 0], 8)
  return new Uint8Array(Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    ...(p.palette ? [chunk('PLTE', new Uint8Array(p.palette.flat()))] : []),
    ...(p.trns ? [chunk('tRNS', new Uint8Array(p.trns))] : []),
    chunk('IDAT', deflateSync(Buffer.from(lines))),
    chunk('IEND', new Uint8Array()),
  ]))
}

// An RGBA picture as a PNG of 8-bit RGBA, each [r, g, b, a] a row at a time.
export const rgba = (width: number, height: number, at: (x: number, y: number) => number[]) =>
  png({ width, height, type: 6, depth: 8, samples: Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => at(x, y)).flat()) })
