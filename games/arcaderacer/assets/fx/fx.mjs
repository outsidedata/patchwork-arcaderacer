// Draws `fx.png` and its sheet `fx.json`, the pictures arcaderacer's effects are drawn from: run
// `node games/arcaderacer/assets/fx/fx.mjs` and both are written beside this file. Every frame is
// 64 × 64, white, its shape in its alpha, so an effect's `tint` colours it:
//   puff 0–3   tyre smoke: a soft ball of value noise, each a different roll, edges faded out.
//   streak     a thin line fading at both ends: sparks drawn along their flight.
//   glow       a soft round glow: a spark's flash, the boost's flame seen from behind, its pop.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const S = 64
const names = ['puff0', 'puff1', 'puff2', 'puff3', 'streak', 'glow']
const W = S * names.length
const rgba = new Uint8Array(W * S * 4)

// a seeded roll, so the picture is the same every time it is drawn
let state = 0x2f6b1d3
const roll = () => {
  state ^= state << 13; state >>>= 0
  state ^= state >>> 17
  state ^= state << 5; state >>>= 0
  return state / 2 ** 32
}

// value noise on a 16-cell lattice that wraps, smoothly stepped
const lattice = (n) => Float32Array.from({ length: n * n }, roll)
const noise = (grid, n, x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
  const at = (i, j) => grid[((j % n) + n) % n * n + ((i % n) + n) % n]
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx
  const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx
  return a + (b - a) * sy
}

const put = (frame, x, y, alpha) => {
  const k = ((y * W) + frame * S + x) * 4
  rgba[k] = rgba[k + 1] = rgba[k + 2] = 255
  rgba[k + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
}

for (let f = 0; f < 4; f++) {
  const n = 8, g1 = lattice(n), g2 = lattice(n * 2)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1
    const r = Math.hypot(u, v)
    const cloud = 0.65 * noise(g1, n, x / 8, y / 8) + 0.35 * noise(g2, n * 2, x / 4, y / 4)
    const edge = Math.max(0, 1 - r) ** 1.4
    put(f, x, y, edge * (0.35 + cloud * 0.9) * 0.95)
  }
}
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1
  const r = Math.hypot(u, v)
  put(4, x, y, Math.exp(-(v * v) * 300) * Math.max(0, 1 - Math.abs(u)) ** 1.5)
  put(5, x, y, Math.max(0, 1 - r) ** 2.2)
}

// a PNG of 8-bit RGBA rows, each with filter 0
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (bytes) => {
  let c = 0xffffffff
  for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  Buffer.from(data).copy(out, 8)
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}
const raw = Buffer.alloc((W * 4 + 1) * S)
for (let y = 0; y < S; y++) Buffer.from(rgba.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1)
const header = Buffer.alloc(13)
header.writeUInt32BE(W, 0)
header.writeUInt32BE(S, 4)
header.set([8, 6, 0, 0, 0], 8)
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
const here = new URL('./', import.meta.url)
writeFileSync(new URL('fx.png', here), png)

const frames = names.map((filename, k) => ({
  filename, frame: { x: k * S, y: 0, w: S, h: S }, rotated: false, trimmed: false,
  spriteSourceSize: { x: 0, y: 0, w: S, h: S }, sourceSize: { w: S, h: S }, pivot: { x: 0.5, y: 0.5 },
}))
const tag = (name, from, to) => ({ name, from, to, direction: 'forward' })
const sheet = {
  frames,
  meta: {
    app: 'arcaderacer fx', version: '1', image: 'fx.png', format: 'RGBA8888', size: { w: W, h: S }, scale: '1',
    frameTags: [tag('puff', 0, 3), tag('streak', 4, 4), tag('glow', 5, 5)],
  },
}
writeFileSync(new URL('fx.json', here), JSON.stringify(sheet, null, 2) + '\n')
console.log('fx.png', W, 'x', S, 'and fx.json written')
