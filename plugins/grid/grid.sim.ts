// The server half of grid: a map of cells that changes while the game runs, every cell of it, as a
// city's does. A tilemap is a file with a few edits on one row; a grid is its cells, held in rows.
//
// The map is cut into square chunks, and each chunk is a row of this kind: `k`, its place, counting
// along the chunks of the top row and then down, and `cells`, one string per layer, the chunk's
// values packed into it. A row per cell would be copied, diffed and patched for every seat on every
// step, 16384 of them for a map 128 across; a chunk's string is copied as one value and compared as
// one value, so a grid of 64 chunks costs a step about what 64 small rows do, and a cell that
// changes sends its chunk's string of that layer, a few hundred characters, and nothing else.
//
// Every number of it is fixed, in `world.grid`:
//
//   size    [w, h], the map in cells, each a whole number of chunks.
//   chunk   how many cells across and down one chunk is.
//   layers  by name, in order, `{ bits, scale }`: every value of the layer a whole number from 0 up
//           to 2^bits − 1, `bits` from 1 to 30; and `scale`, 1 when left out, how many cells across
//           and down share one value, so a layer of scale 4 holds one value for each 4 × 4 block, as
//           a coarse field (pollution, land value) is kept. A chunk is a whole number of blocks.
//
// A value is written in the string as ⌈bits / 6⌉ characters of `A`–`Z`, `a`–`z`, `0`–`9`, `-` and
// `_`, six bits each, the highest first, so no character of it is one JSON escapes. A layer's values
// lie a row of the chunk's blocks at a time, from its top left.
//
// Rows of this kind are made by the grid itself. The scene's `actors` list one, `{ "is": "grid" }`,
// whose prefab is `{ "k": 0, "cells": {} }`: chunk 0. The grid is made whole by chunk 0's `before`
// and by every `cells` handed a truth's `w`, whichever comes first in the step: every chunk the map
// has that is not a row is spawned, each with every value 0, and a chunk with no string for a layer,
// chunk 0 as the scene makes it, or one kept by the persist addon before the layer was added to the
// scene, is given that layer at 0. So a rule reads the whole map on the first step whether its row
// runs before the grid's or after it, and a page is sent every chunk whole from the first packet. A
// grid kept by persist, which spawns its records before the first step
// (`addons/persist/persist.addon.ts`, key `k`), is found whole and nothing is made again.
//
// A rule reads and writes cells through `cells(w)`, which makes the grid whole, finds the chunks and
// hands back `get(layer, x, y)` and `set(layer, x, y, v)` of a cell [x, y], x along a row and y down
// the rows, with `inside`, `size` and the layers' names. A value is set by writing its characters
// into its chunk's string, so what the rule wrote is the row's, sent to every seat at the step's
// end. A cell of a layer of scale s reads and writes its block's one value. A cell outside the map, a
// layer the scene does not name, or a value that is not a whole number the layer's bits hold,
// throws, naming it. The browser half reads the same rows the same way, off the packet:
// `cells({ world, rows })`.
//
// A picture holds a grid: `picture` writes one and `fill` reads one into the chunks, with the
// loader's `pixels` and `encodePng` doing the PNG. The loader is not imported: a rule reads the
// picture through it and hands it here. The layers are packed into a pixel's 32 bits, in their
// order, each value's lowest bit first from the lowest bit of red, then green, blue and alpha; a
// layer that would run past the 32nd bit starts the next plane, and the planes lie one under
// another, so the picture is `w` across and `h` × planes down. A cell of a layer of scale s holds its
// block's value. `picture` writes the layers' names, bits and scales as JSON in the text `grid`, and
// `fill` reads a picture by them, by name: a layer the picture holds and the scene does not is left
// out, one the scene holds and the picture does not is 0, and one whose bits or scale differ throws.
// A picture with no `grid` text, a height map painted in an image program, is read as holding the
// scene's own layers in the scene's own order. A picture whose size is not the grid's throws, and so
// does one with a layer of other bits, before any cell is written, so no picture fills half a grid.
import type { Kind, Row, W } from '#engine/engine.ts'
import type { Pixels } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

export type Layer = { bits: number; scale: number }
export type Spec = { size: [number, number]; chunk: number; layers: Record<string, Layer> }

const DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const VALUE = new Map([...DIGITS].map((c, i) => [c, i]))

// How many characters one value of `bits` takes.
export const width = (bits: number) => Math.ceil(bits / 6)

export function encode(v: number, chars: number): string {
  let s = ''
  for (let i = chars - 1; i >= 0; i--) s += DIGITS[Math.floor(v / math.pow(64, i)) % 64]
  return s
}

export function decode(s: string, at: number, chars: number): number {
  let v = 0
  for (let i = 0; i < chars; i++) {
    const d = VALUE.get(s[at + i])
    if (d === undefined) throw new Error(`grid string holds ${JSON.stringify(s[at + i])}, which is no digit of a value`)
    v = v * 64 + d
  }
  return v
}

// The scene's `world.grid`, read once per world and checked: it comes from a file.
const specs = new WeakMap<object, Spec>()
export function spec(world: any): Spec {
  const had = world && specs.get(world)
  if (had) return had
  const g = world?.grid
  if (!g) throw new Error('the scene\'s world has no grid')
  const { size, chunk, layers } = g
  const whole = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0
  if (!whole(chunk)) throw new Error(`world.grid.chunk is ${JSON.stringify(chunk)}, not a whole number above 0`)
  if (!Array.isArray(size) || size.length !== 2 || !size.every(n => whole(n) && n % chunk === 0)) throw new Error(`world.grid.size is ${JSON.stringify(size)}, not [w, h] of whole chunks of ${chunk}`)
  if (!layers || typeof layers !== 'object' || !Object.keys(layers).length) throw new Error('world.grid.layers names no layer')
  const out: Spec = { size: [size[0], size[1]], chunk, layers: {} }
  for (const [name, l] of Object.entries<any>(layers)) {
    const bits = l?.bits, scale = l?.scale ?? 1
    if (!Number.isInteger(bits) || bits < 1 || bits > 30) throw new Error(`world.grid.layers.${name}.bits is ${JSON.stringify(bits)}, not a whole number from 1 to 30`)
    if (!whole(scale) || chunk % scale !== 0) throw new Error(`world.grid.layers.${name}.scale is ${JSON.stringify(scale)}, not a whole number a chunk of ${chunk} is made of`)
    out.layers[name] = { bits, scale }
  }
  if (world) specs.set(world, out)
  return out
}

// How many values a chunk holds of a layer.
const count = (s: Spec, l: Layer) => math.pow(s.chunk / l.scale, 2)
const chunks = (s: Spec) => (s.size[0] / s.chunk) * (s.size[1] / s.chunk)
const zeros = (s: Spec, l: Layer) => 'A'.repeat(count(s, l) * width(l.bits))

// Every chunk a row holding every layer, as the header says.
function whole(w: W, s: Spec) {
  const rows = w.all('grid')
  for (const r of rows) for (const [name, l] of Object.entries(s.layers)) if (typeof r.data.cells[name] !== 'string') r.data.cells[name] = zeros(s, l)
  if (rows.length >= chunks(s)) return
  const have = new Set(rows.map(r => r.data.k))
  const blank = Object.fromEntries(Object.entries(s.layers).map(([name, l]) => [name, zeros(s, l)]))
  for (let k = 0; k < chunks(s); k++) if (!have.has(k)) w.spawn('grid', { k, cells: { ...blank } })
}

export const grid: Kind = {
  before(me, _dt, w) {
    if (me.data.k === 0) whole(w, spec(w.world))
  },
}

export type Cells = {
  size: [number, number]
  chunk: number
  layers: string[]
  inside(x: number, y: number): boolean
  get(layer: string, x: number, y: number): number
  set(layer: string, x: number, y: number, v: number): void
}

// Each row's layers decoded, kept while the row's string is the one decoded: a truth keeps its rows
// from step to step, so a rule reading a chunk every step decodes it once for each time it changes.
const decoded = new WeakMap<Row, Map<string, { s: string; values: number[] }>>()
function valuesOf(row: Row, layer: string, l: Layer): number[] {
  const s: string = row.data.cells[layer]
  let byLayer = decoded.get(row)
  if (!byLayer) decoded.set(row, (byLayer = new Map()))
  const had = byLayer.get(layer)
  if (had && had.s === s) return had.values
  const chars = width(l.bits)
  if (typeof s !== 'string') throw new Error(`grid chunk ${row.data.k} has no ${layer}`)
  const values = Array.from({ length: s.length / chars }, (_, i) => decode(s, i * chars, chars))
  byLayer.set(layer, { s, values })
  return values
}

// The cells of the grid whose rows are `rows`: a truth's, handed its `w`, or any rows and the world
// they are of, as the browser half reads a packet's.
export function cells(from: W | { world: any; rows: Row[] }): Cells {
  const world = from.world
  const s = spec(world)
  if ('all' in from) whole(from, s)
  const rows = 'all' in from ? from.all('grid') : from.rows.filter(r => r.kind === 'grid')
  const across = s.size[0] / s.chunk
  const byK: Row[] = []
  for (const r of rows) byK[r.data.k] = r
  const layerOf = (name: string) => {
    const l = s.layers[name]
    if (!l) throw new Error(`the grid has no layer ${name}`)
    return l
  }
  const inside = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < s.size[0] && y < s.size[1]
  // The chunk row a cell is in and the place of its value in that chunk's string of the layer.
  const place = (name: string, x: number, y: number) => {
    const l = layerOf(name)
    if (!inside(x, y)) throw new Error(`cell [${x}, ${y}] is not inside the grid of ${s.size[0]} × ${s.size[1]}`)
    const k = Math.floor(y / s.chunk) * across + Math.floor(x / s.chunk)
    const row = byK[k]
    if (!row) throw new Error(`grid chunk ${k} is not a row`)
    const per = s.chunk / l.scale
    const i = Math.floor((y % s.chunk) / l.scale) * per + Math.floor((x % s.chunk) / l.scale)
    return { l, row, i }
  }
  return {
    size: s.size,
    chunk: s.chunk,
    layers: Object.keys(s.layers),
    inside,
    get(name, x, y) {
      const { l, row, i } = place(name, x, y)
      return valuesOf(row, name, l)[i]
    },
    set(name, x, y, v) {
      const { l, row, i } = place(name, x, y)
      if (!Number.isInteger(v) || v < 0 || v >= math.pow(2, l.bits)) throw new Error(`${v} is not a value of ${name}, a whole number from 0 to ${math.pow(2, l.bits) - 1}`)
      const values = valuesOf(row, name, l)
      if (values[i] === v) return
      const chars = width(l.bits)
      const was: string = row.data.cells[name]
      const now = was.slice(0, i * chars) + encode(v, chars) + was.slice((i + 1) * chars)
      row.data.cells[name] = now
      values[i] = v
      decoded.get(row)!.set(name, { s: now, values })
    },
  }
}

// Where each layer lies in a picture's pixels: its plane and the bit it starts at in that plane.
function packing(layers: [string, Layer][]): { planes: number; at: Map<string, { plane: number; bit: number }> } {
  const at = new Map<string, { plane: number; bit: number }>()
  let plane = 0, bit = 0
  for (const [name, l] of layers) {
    if (bit + l.bits > 32) [plane, bit] = [plane + 1, 0]
    at.set(name, { plane, bit })
    bit += l.bits
  }
  return { planes: plane + 1, at }
}

// The 32 bits of a pixel, red lowest.
const word = (d: Uint8ClampedArray, o: number) => d[o] + d[o + 1] * math.pow(2, 8) + d[o + 2] * math.pow(2, 16) + d[o + 3] * math.pow(2, 24)
const bitsOf = (u: number, bit: number, bits: number) => Math.floor(u / math.pow(2, bit)) % math.pow(2, bits)

// The grid as a picture, its layers packed as the header says, and their names, bits and scales in
// the text `grid`.
export function picture(from: W | { world: any; rows: Row[] }): Pixels {
  const c = cells(from)
  const s = spec(from.world)
  const layers = Object.entries(s.layers)
  const { planes, at } = packing(layers)
  const [w, h] = s.size
  const words = new Float64Array(w * h * planes)
  for (const [name] of layers) {
    const { plane, bit } = at.get(name)!
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) words[(plane * h + y) * w + x] += c.get(name, x, y) * math.pow(2, bit)
  }
  const data = new Uint8ClampedArray(w * h * planes * 4)
  words.forEach((u, i) => { for (let b = 0; b < 4; b++) data[i * 4 + b] = Math.floor(u / math.pow(2, 8 * b)) % 256 })
  return { width: w, height: h * planes, data, text: { grid: JSON.stringify(layers.map(([name, l]) => ({ name, ...l }))) } }
}

// Every chunk's layers read from a picture, as the header says.
export function fill(w: W, p: Pixels): void {
  const s = spec(w.world)
  const [gw, gh] = s.size
  let held: [string, Layer][]
  if (p.text.grid === undefined) held = Object.entries(s.layers)
  else {
    let list: unknown
    try { list = JSON.parse(p.text.grid) } catch { throw new Error('the picture\'s grid text is not JSON') }
    if (!Array.isArray(list) || !list.every(e => typeof e?.name === 'string' && Number.isInteger(e.bits) && Number.isInteger(e.scale))) throw new Error('the picture\'s grid text is not a list of layers with a name, bits and scale')
    held = list.map(e => [e.name, { bits: e.bits, scale: e.scale }])
  }
  const { planes, at } = packing(held)
  if (p.width !== gw || p.height !== gh * planes) throw new Error(`a picture of ${p.width} × ${p.height} holds no grid of ${gw} × ${gh} in ${planes} plane${planes === 1 ? '' : 's'}`)
  const c = cells(w)
  for (const [name, l] of Object.entries(s.layers)) {
    const had = held.find(([n]) => n === name)?.[1]
    if (had && (had.bits !== l.bits || had.scale !== l.scale)) throw new Error(`the picture's layer ${name} is ${had.bits} bits at scale ${had.scale}, and the scene's ${l.bits} bits at scale ${l.scale}`)
  }
  for (const [name, l] of Object.entries(s.layers)) {
    const had = held.find(([n]) => n === name)?.[1]
    const where = had && at.get(name)!
    for (let y = 0; y < gh; y += l.scale) for (let x = 0; x < gw; x += l.scale) {
      c.set(name, x, y, where ? bitsOf(word(p.data, ((where.plane * gh + y) * gw + x) * 4), where.bit, l.bits) : 0)
    }
  }
}
