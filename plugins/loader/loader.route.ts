// The loader's routes: a sheet on this machine, outside the repo, looked at and copied into it, for
// the Assets panel's add and swap; a picture of the repo cut into a sheet, for its slice; and a
// sheet's pixels set, on its own pages or on a copy of it, for the Sprites panel's Save and Save as
// (`loader.extension.tsx`).
//
//   GET  look?path=      what the sheet file at `path` is before anything is copied: its frames,
//                        its clips with their runs, its slices with their keys, the other packs of
//                        a multipack, and its pages, each with whether its file is there. Refused
//                        with the loader's own words for a sheet `read` cannot read.
//   POST copy            { from, to, replace?, entry? }: the sheet file `from`, every other pack it
//                        names and every page they name copied into the repo's folder `to`, byte
//                        for byte, through the server's files, and the catalogue entry `entry`
//                        written for it (below); answers { url, files }, the catalogue url of the
//                        copied sheet and every file of the sheet written, by its path from the
//                        repo. Nothing is written when the sheet cannot be read, a page is not
//                        there, or a file it would write is there already, unless `replace`.
//
//   POST slice           { from, to, tile, marks, loose?, entry? }: the picture `from`, a PNG of the
//                        repo whose frames lie loose on it, as a ripper leaves a game's tiles, cut
//                        into a sheet: `to`, a `.json` of the repo, an Aseprite hash, and beside it
//                        its page, the same name ending `.png`, the picture with only the frames'
//                        ink on it; and `entry` written for it. Answers { url, files } as a copy
//                        does. How it is cut is `slice`, below, `tile` the width of a tile in
//                        pixels, `marks` the colours, 0xRRGGBB each, of the ripper's marks, and
//                        `loose` the fewest pixels a sprite on no tile has to be a frame, 0 when
//                        left out.
//
//   POST paint           { sheet, pixels, to?, replace?, entry? }: pixels of the pages of `sheet`, a
//                        sheet file of the repo, set, for the Sprites panel's Save and Save as:
//                        `pixels` holds, for each page by its url as the sheet names it, the pixels
//                        set on it, three numbers each, x, y and the colour 0xRRGGBBAA. Without
//                        `to`, or with `to` the sheet itself, each page with a pixel set is written
//                        over. With `to`, a path of the repo ending as `sheet` does, the sheet is
//                        copied there, every pack and page of it with it, and the pixels are set on
//                        the copy's pages (`painted`, below); nothing is written when a file the
//                        copy would write is there already, unless `replace`; and `entry` is
//                        written for the copy. Answers { url, files } as a copy does, `url` the
//                        sheet written.
//
// `entry`, { file, name, value? }, is the catalogue entry `name` of `world.loader.assets` in the
// scene file `file`, written once the sheet's files are, one value through `files.edit`. With
// `value`, the entry is added as `value` with its `url` the sheet written, `type` first, then `url`,
// then the rest of `value` as it has them; a catalogue with an entry `name` already refuses it.
// Without `value`, the entry is there already, and its `url` is set to the sheet written when it
// names another, as Swap sets it. Each is run inside a change (`Edits.route`,
// `editor/server/changes.ts`), so the sheet's files and the entry are one change, which one undo
// takes back, and a route that throws part-way, an entry refused once the files are written say,
// leaves nothing written.
//
// `path` and `from` are absolute paths on this machine of a `.json` sheet file. A sheet names its
// packs and its pages from its own folder (`loader.sim.ts`), so the copy lands as the source lies:
// the file in `to` and each pack and page at the same place from it, and every path in the files
// still names its file. A sheet naming a pack or a page outside its own folder, which a copy could
// not keep beside it, is refused.
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { RouteFiles, Router } from '#editor/server/routes.ts'
import { applyEdits, modify, parse } from 'jsonc-parser'
import { decodePng, encodePng, namesIn, read, type Pixels, type Sheet } from './loader.sim.ts'

export type Look = {
  file: string
  frames: number
  clips: { name: string; runs: number; length: number; loop: boolean }[]
  slices: { name: string; keys: number }[]
  packs: { name: string; path: string }[]
  pages: { name: string; path: string; there: boolean }[]
}
// What a copy answers, and a slice and a paint as a copy does.
export type Copied = Awaited<ReturnType<typeof copy>>

// An absolute path of a `.json` file, as a page sent it.
function sheetPath(v: unknown, what: string): string {
  if (typeof v !== 'string' || !path.isAbsolute(v) || !/\.json$/i.test(v)) throw new Error(`${what} is the absolute path of a sheet's .json file`)
  return path.normalize(v)
}

const there = (p: string) => stat(p).then(s => s.isFile(), () => false)

// A JSON file on this machine, parsed.
async function jsonAt(at: string): Promise<unknown> {
  const text = await readFile(at, 'utf8').catch((e: NodeJS.ErrnoException) => { throw new Error(`${at} does not read: ${e.code ?? e.message}`) })
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${at} is not JSON: ${(e as Error).message}`)
  }
}

// The sheet at `from`, read as the loader reads it, handed each other pack it names as the read asks
// for it; and each pack and page by its place from the file's folder.
async function source(from: string) {
  const folder = path.dirname(from)
  const beside = (p: string, what: string) => {
    const name = path.relative(folder, p)
    if (name.startsWith('..') || path.isAbsolute(name)) throw new Error(`sheet ${from} names the ${what} ${p}, outside its own folder, which a copy could not keep beside it`)
    return { name: name.split(path.sep).join('/'), path: p }
  }
  const file = await jsonAt(from)
  const more = new Map<string, unknown>()
  const packs: { name: string; path: string }[] = []
  let sheet
  for (;;) {
    let wanted: string | undefined
    try {
      sheet = read(file, from, {}, u => {
        if (more.has(u)) return more.get(u)
        wanted = u
        throw new Error(`${u} has not been read`)
      })
      break
    } catch (e) {
      if (wanted === undefined || more.has(wanted)) throw e
      packs.push(beside(wanted, 'pack'))
      more.set(wanted, await jsonAt(wanted))
    }
  }
  const pages = [...new Set(sheet.pages)].map(p => beside(p, 'page'))
  return { sheet, packs, pages }
}

// The folder of the repo a copy goes into, as a page sent it: a path from the repo.
function folderOf(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error('to is a folder of the repo')
  const to = path.posix.normalize(v.trim().replace(/^\/+|\/+$/g, ''))
  if (to === '.' || to.startsWith('..')) throw new Error(`${v} is not a folder of the repo`)
  return to
}

async function copy(body: unknown, files: RouteFiles) {
  const b = body as { from?: unknown; to?: unknown; replace?: unknown; entry?: unknown } | null
  if (!b || typeof b !== 'object') throw new Error('a copy names a sheet to copy from and a folder to copy to')
  const from = sheetPath(b.from, 'from')
  const to = folderOf(b.to)
  if (b.replace !== undefined && typeof b.replace !== 'boolean') throw new Error('replace is true or false')
  const { packs, pages } = await source(from)
  const out = [
    { from, to: `${to}/${path.basename(from)}` },
    ...[...packs, ...pages].map(p => ({ from: p.path, to: `${to}/${p.name}` })),
  ]
  for (const p of pages) if (!(await there(p.path))) throw new Error(`sheet ${from} names the page ${p.name}, which is not there`)
  if (!b.replace)
    for (const o of out) if (await there(await files.resolve(o.to))) throw new Error(`${o.to} is there already: tick replace to write over it`)
  // Every file read before any is written, so a copy is whole or is not made.
  const bytes = await Promise.all(out.map(o => readFile(o.from)))
  for (const [i, o] of out.entries()) await files.write(o.to, new Uint8Array(bytes[i]))
  const url = `/${out[0].to}`
  await enter(b.entry, url, files)
  return { url, files: out.map(o => o.to) }
}

// The catalogue entry a copy, a slice or a paint writes for the sheet at `url` it wrote, as a page
// sent it (`entry`, in the header): added as `value` with its url, or its url set when it is another.
async function enter(entry: unknown, url: string, files: RouteFiles) {
  if (entry === undefined) return
  const e = entry as { file?: unknown; name?: unknown; value?: unknown } | null
  if (!e || typeof e !== 'object') throw new Error('entry names the file of a catalogue and the entry in it')
  if (typeof e.file !== 'string') throw new Error('entry.file is a path of the repo')
  if (typeof e.name !== 'string' || !e.name) throw new Error('entry.name is the name of an entry')
  const v = e.value
  if (v !== undefined && (!v || typeof v !== 'object' || Array.isArray(v))) throw new Error('entry.value is an entry, its fields by name')
  const at = ['world', 'loader', 'assets', e.name]
  const assets = (parse(await files.read(e.file)) as { world?: { loader?: { assets?: Record<string, unknown> } } } | undefined)?.world?.loader?.assets ?? {}
  const had = Object.hasOwn(assets, e.name)
  if (v !== undefined) {
    if (had) throw new Error(`${e.file} has an entry ${e.name} already`)
    await files.edit(e.file, at, Object.assign('type' in v ? { type: (v as { type: unknown }).type } : {}, { url }, v, { url }))
    return
  }
  if (!had) throw new Error(`${e.file} has no entry ${e.name}`)
  if ((assets[e.name] as { url?: unknown } | null)?.url !== url) await files.edit(e.file, [...at, 'url'], url)
}

// ---------------------------------------------------------------- slicing a rip
//
// A rip is a game's tiles laid loose on one picture, a few pixels apart, in rows, with the ripper's
// labels among them: DarkWolf's SimCity 2000 rips say so. `slice` finds the frames on it:
//
// - Ink is every pixel whose alpha is above 0, and a piece of ink is ink joined to itself across its
//   8 neighbours.
// - A mark is a lone pixel, a piece of one or two with no other such piece within three pixels of
//   it, the ripper put where a frame's corners are when the frame's own ink does not reach them;
//   lone pixels close together are a plume's dust, which a mark never lies among. A frame stands on
//   a footprint of k tiles across, 1 to 4; its left mark is in its first column and its right mark
//   in its last, k × `tile` − 1 across, level on flat ground and up to half a tile apart down on a
//   slope, of any colour, the ripper's colours being his own; its top and bottom marks are in its
//   middle column, or the one after it, as the ripper was a pixel out now and then, above and below
//   them. The bottom is the one nearest k quarters of a tile below the lower of the two sides, the
//   lower of two as near, and at most three eighths of a tile more: a footprint's bottom corner is k
//   quarter tiles below its sides on flat ground, and a step more on a slope, SimCity's step being
//   three eighths of a tile; the next row's top mark can be as near as that when that row's sprites
//   stand tall, as a steep road's do, and is never nearer. A left mark takes, of the right marks it could have, one with a bottom mark
//   under their middle, of the fewest tiles across and then the nearest level with it, and none when
//   none has one: so a bottom mark a tile over and half a tile down is never taken for the right
//   mark of a frame two tiles across, and two specks of smoke a frame's width apart are never taken
//   for its sides. The frame stands on the middle of its bottom edge, halfway between its sides,
//   under the bottom mark, [x, y + 1]. A lone pixel exactly one of the colours `marks`, the ripper's
//   own for a bottom mark put alone, with no sides, is a mark too, and its frame stands under its
//   middle, [x + 1, y + 1], a tile wide.
// - A piece of ink at least half a tile wide with a lone pixel under the middle of its bottom, no
//   more than a quarter tile below it, in its middle column or the one after, stands on that pixel
//   as on a bottom mark: a tile whose own ink covers one of its side marks has the other and its
//   bottom, just under its ink, where a speck of a plume is not.
// - A piece of ink a whole number of tiles wide, and at least a quarter tile tall, so no ruled line
//   of the ripper's is taken for one, stands on its own bottom middle, as a ripped
//   building stands on its footprint's bottom corner, unless a bottom mark under it, no more than
//   half a tile below its bottom, stands it.
// - Every other piece joins the frame nearest under it whose column holds its middle, or failing
//   one, a frame holding ink already whose column widened half a tile each way does when the piece
//   lies wholly over the top of what the frame holds and within four pixels of a piece it holds, as
//   smoke drifts off a stack over a building a speck at a time and a ripper's marks and specks
//   beside one do not, when it is no wider than that frame's
//   column and a tile more, so no ripper's badge over a row joins, and when the gap
//   between its bottom and the top of what that frame holds so far is no more than half a tile, or
//   a whole tile between it and the anchor of a marked frame that holds nothing yet, as a bridge's
//   deck stands over the water its marks stand on, and it is not below the frame's anchor: smoke over a stack, a tree over its cell. A piece joining a
//   frame can bring another over it, so a plume of several puffs joins as a whole.
// - With `loose` above 0, what no frame takes and has `loose` pixels or more, a sprite that stands on
//   no tile such as a plane or a helicopter, is a frame of its own, with every other piece so left
//   within two pixels of it, standing on its bottom middle. A piece no frame takes, a label or a
//   ripper's badge where `loose` is 0, is in no frame. The page `slice` hands back
//   is the picture with every mark taken off, so no mark is drawn with a frame it lay beside, and
//   everything else left where it was, so a frame these rules missed can be written in by hand.
//
// Frames are named by row and place, `<row>-<place>`, from 0: a row is every frame whose anchor is
// within a quarter tile of the first's, down the picture, and a row is read left to right. Each is
// its box on the page, [x, y, w, h], and its anchor from the page's top left.
export type Sliced = { frames: { id: string; box: [number, number, number, number]; anchor: [number, number] }[]; page: Pixels }

export function slice(p: Pixels, tile: number, marks: number[], loose = 0): Sliced {
  if (!Number.isInteger(tile) || tile < 2 || tile % 2) throw new Error(`a tile is an even number of pixels across, not ${tile}`)
  const { width: w, height: h, data } = p
  const ink = (i: number) => data[i * 4 + 3] > 0
  const isMark = (i: number) => data[i * 4 + 3] === 255 && marks.includes((data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2])
  // Every piece of ink: its pixels and box.
  const piece = new Int32Array(w * h).fill(-1)
  type Piece = { pixels: number[]; x0: number; y0: number; x1: number; y1: number }
  const pieces: Piece[] = []
  for (let start = 0; start < w * h; start++) {
    if (!ink(start) || piece[start] >= 0) continue
    const it: Piece = { pixels: [], x0: w, y0: h, x1: -1, y1: -1 }
    const stack = [start]
    piece[start] = pieces.length
    while (stack.length) {
      const i = stack.pop()!
      const x = i % w, y = (i - x) / w
      it.pixels.push(i)
      it.x0 = Math.min(it.x0, x); it.x1 = Math.max(it.x1, x); it.y0 = Math.min(it.y0, y); it.y1 = Math.max(it.y1, y)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (ink(j) && piece[j] < 0) { piece[j] = pieces.length; stack.push(j) }
      }
    }
    pieces.push(it)
  }
  const half = tile / 2, quarter = tile / 4
  const small = pieces.filter(q => q.pixels.length <= 2)
  const smallAt = new Map<number, Piece>()
  for (const q of small) for (const i of q.pixels) smallAt.set(i, q)
  const crowded = (q: Piece) => {
    for (let y = q.y0 - 3; y <= q.y1 + 3; y++) for (let x = q.x0 - 3; x <= q.x1 + 3; x++) {
      const o = x >= 0 && y >= 0 && x < w && y < h ? smallAt.get(y * w + x) : undefined
      if (o && o !== q) return true
    }
    return false
  }
  const lone = small.filter(q => !crowded(q))
  const byPlace = new Map<number, Piece>()
  for (const q of lone) byPlace.set(q.pixels[0], q)
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? byPlace.get(y * w + x) : undefined)
  const marked = new Set<Piece>()
  type Frame = { ax: number; ay: number; left: number; right: number; top: number; holds: Piece[] }
  const frames: Frame[] = []
  // Each frame's sides: a left mark and the right mark of the fewest tiles across nearest level with it.
  const rightTaken = new Set<Piece>()
  // The lone pixel under a frame's sides, in its middle columns, within reach of a bottom mark, nearest
  // where a flat footprint's bottom corner is.
  const bottomOf = (l: Piece, r: Piece, k: number): Piece | undefined => {
    const low = Math.max(l.y0, r.y0), flat = low + k * quarter
    for (let d = 0; d <= Math.max(k * quarter, (tile * 3) / 8); d++) for (const y of d ? [flat + d, flat - d] : [flat]) {
      if (y <= low || y > flat + (tile * 3) / 8) continue
      for (const x of [l.x0 + k * half - 1, l.x0 + k * half]) {
        const b = at(x, y)
        if (b) return b
      }
    }
    return undefined
  }
  for (const l of lone) {
    const choices: { r: Piece; k: number; dy: number; bottom: Piece | undefined }[] = []
    for (let k = 1; k <= 4; k++) for (let dy = 0; dy <= half; dy++) for (const y of dy ? [l.y0 - dy, l.y0 + dy] : [l.y0]) {
      const c = at(l.x0 + k * tile - 1, y)
      if (c && !rightTaken.has(c)) choices.push({ r: c, k, dy, bottom: bottomOf(l, c, k) })
    }
    const pick = choices.find(c => c.bottom)
    if (!pick) continue
    const { r, k } = pick
    const bottom = pick.bottom!
    rightTaken.add(r)
    marked.add(l).add(r)
    const high = Math.min(l.y0, r.y0), mids = [l.x0 + k * half - 1, l.x0 + k * half]
    for (let y = high - 1; y >= high - k * quarter - (tile * 3) / 8; y--) for (const x of mids) { const top = at(x, y); if (top) marked.add(top) }
    marked.add(bottom)
    const ax = (l.x0 + r.x0 + 1) / 2, ay = bottom.y0 + 1
    frames.push({ ax, ay, left: l.x0, right: r.x0 + 1, top: ay - 1, holds: [] })
  }
  for (const q of lone) {
    if (marked.has(q) || !q.pixels.every(isMark)) continue
    marked.add(q)
    if (frames.some(f => q.x0 >= f.left && q.x0 < f.right && Math.abs(f.ay - 1 - q.y0) <= quarter)) continue
    frames.push({ ax: q.x0 + 1, ay: q.y0 + 1, left: q.x0 + 1 - half, right: q.x0 + 1 + half, top: q.y0, holds: [] })
  }
  const inks = pieces.filter(q => !marked.has(q))
  for (const q of inks) {
    const wide = q.x1 - q.x0 + 1, mid = q.x0 + wide / 2
    if (wide < half) continue
    if (frames.some(f => mid >= f.left && mid <= f.right && f.ay > q.y1 && f.ay <= q.y1 + 1 + half)) continue
    let under: Piece | undefined
    for (let y = q.y1 + 1; y <= q.y1 + quarter && !under; y++) for (const x of [Math.ceil(mid) - 1, Math.ceil(mid)]) {
      const m = at(x, y)
      if (m && !marked.has(m)) { under = m; break }
    }
    if (!under) continue
    marked.add(under)
    const ax = under.x0 + 1, ay = under.y0 + 1
    frames.push({ ax, ay, left: ax - half, right: ax + half, top: ay - 1, holds: [] })
  }
  const left = inks.filter(q => !marked.has(q))
  for (const q of left) {
    const wide = q.x1 - q.x0 + 1
    if (wide % tile || q.y1 - q.y0 + 1 < quarter) continue
    const bottom = q.y1 + 1, mid = q.x0 + wide / 2
    if (frames.some(f => f.ax > q.x0 && f.ax <= q.x1 && f.ay >= bottom && f.ay <= bottom + half)) continue
    frames.push({ ax: mid, ay: bottom, left: q.x0, right: q.x1 + 1, top: q.y0, holds: [q] })
  }
  const taken = new Set(frames.flatMap(f => f.holds))
  for (let joined = true; joined;) {
    joined = false
    for (const q of left) {
      if (taken.has(q)) continue
      const bottom = q.y1 + 1, mid = (q.x0 + q.x1 + 1) / 2
      let best: Frame | undefined, bestInside = false
      for (const f of frames) {
        const touching = () => f.holds.some(o => q.x0 - 4 <= o.x1 && o.x0 - 4 <= q.x1 && q.y0 - 4 <= o.y1 && o.y0 - 4 <= q.y1)
        const reach = f.holds.length && bottom <= f.top && touching() ? half : 0
        if (mid < f.left - reach || mid > f.right + reach || q.x1 - q.x0 + 1 > f.right - f.left + tile) continue
        if (bottom > f.ay || f.top - bottom > (f.holds.length ? half : tile)) continue
        const inside = mid >= f.left && mid <= f.right
        if (!best || (inside && !bestInside) || (inside === bestInside && f.ay - bottom < best.ay - bottom)) [best, bestInside] = [f, inside]
      }
      if (!best) continue
      best.holds.push(q)
      best.top = Math.min(best.top, q.y0)
      taken.add(q)
      joined = true
    }
  }
  if (loose > 0) {
    // What no frame took, gathered with every other such piece within two pixels of it.
    const left = inks.filter(q => !taken.has(q))
    const near = (a: Piece, b: Piece) => a.x0 - 2 <= b.x1 && b.x0 - 2 <= a.x1 && a.y0 - 2 <= b.y1 && b.y0 - 2 <= a.y1
    const seen = new Set<Piece>()
    for (const start of left) {
      if (seen.has(start)) continue
      const group = [start]
      seen.add(start)
      for (let i = 0; i < group.length; i++) for (const q of left) if (!seen.has(q) && near(group[i], q)) { seen.add(q); group.push(q) }
      if (group.reduce((n, q) => n + q.pixels.length, 0) < loose) continue
      const x0 = Math.min(...group.map(q => q.x0)), x1 = Math.max(...group.map(q => q.x1)), y1 = Math.max(...group.map(q => q.y1))
      frames.push({ ax: (x0 + x1 + 1) / 2, ay: y1 + 1, left: x0, right: x1 + 1, top: Math.min(...group.map(q => q.y0)), holds: group })
    }
  }
  const kept = frames.filter(f => f.holds.length).sort((a, b) => a.ay - b.ay || a.ax - b.ax)
  const page: Pixels = { width: w, height: h, data: new Uint8ClampedArray(data), text: {} }
  for (const m of marked) for (const i of m.pixels) page.data.fill(0, i * 4, i * 4 + 4)
  const out: Sliced['frames'] = []
  // Rows first, then each row left to right.
  const rows: Frame[][] = []
  let rowY = -Infinity
  for (const f of kept) {
    if (f.ay - rowY > tile / 4) { rows.push([]); rowY = f.ay }
    rows[rows.length - 1].push(f)
  }
  rows.forEach((list, r) => {
    let place = 0
    for (const f of list.sort((a, b) => a.ax - b.ax)) {
      const x0 = Math.min(...f.holds.map(q => q.x0)), y0 = Math.min(...f.holds.map(q => q.y0))
      const x1 = Math.max(...f.holds.map(q => q.x1)), y1 = Math.max(...f.holds.map(q => q.y1))
      out.push({ id: `${r}-${place++}`, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], anchor: [f.ax, f.ay] })
    }
  })
  return { frames: out, page }
}

// A slice as an Aseprite hash of its frames on `image`, each whole and untrimmed, its pivot its
// anchor as a fraction of its box, which may lie outside it.
export function sheetOf(s: Sliced, image: string) {
  const frames = Object.fromEntries(s.frames.map(f => {
    const [x, y, w, h] = f.box
    return [f.id, {
      frame: { x, y, w, h }, rotated: false, trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h },
      pivot: { x: (f.anchor[0] - x) / w, y: (f.anchor[1] - y) / h },
    }]
  }))
  return { frames, meta: { image, size: { w: s.page.width, h: s.page.height }, frameTags: [] } }
}

// A path of the repo, as a page sent it, ending as it must.
function repoPath(v: unknown, what: string, ending: RegExp): string {
  if (typeof v !== 'string' || !ending.test(v)) throw new Error(`${what} is a path of the repo ending ${ending.source.replace(/\\|\$/g, '')}`)
  const p = path.posix.normalize(v.trim().replace(/^\/+/, ''))
  if (p.startsWith('..')) throw new Error(`${v} is not in the repo`)
  return p
}

async function sliceRoute(body: unknown, files: RouteFiles): Promise<Copied> {
  const b = body as { from?: unknown; to?: unknown; tile?: unknown; marks?: unknown; loose?: unknown; entry?: unknown } | null
  if (!b || typeof b !== 'object') throw new Error('a slice names the picture to cut, the sheet to write, a tile\'s width and the marks\' colours')
  const from = repoPath(b.from, 'from', /\.png$/i)
  const to = repoPath(b.to, 'to', /\.json$/i)
  if (typeof b.tile !== 'number') throw new Error('tile is a number of pixels')
  const colour = (c: unknown) => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 0xffffff
  if (!Array.isArray(b.marks) || !b.marks.every(colour)) throw new Error('marks is a list of colours 0xRRGGBB')
  if (b.loose !== undefined && !(typeof b.loose === 'number' && Number.isInteger(b.loose) && b.loose >= 0)) throw new Error('loose is a whole number of pixels, 0 or more')
  const cut = slice(decodePng(await files.bytes(from)), b.tile, b.marks, b.loose ?? 0)
  const pageName = path.posix.basename(to).replace(/\.json$/i, '.png')
  const pageAt = path.posix.join(path.posix.dirname(to), pageName)
  await files.write(pageAt, encodePng(cut.page))
  await files.write(to, new TextEncoder().encode(JSON.stringify(sheetOf(cut, pageName), null, 1) + '\n'))
  await enter(b.entry, `/${to}`, files)
  return { url: `/${to}`, files: [to, pageAt] }
}

// ---------------------------------------------------------------- painting a sheet
//
// A sheet's pixels set, on its own pages or on a copy's. A copy is the sheet at `to` and every pack
// and page of it at the same place from `to`'s folder as it is from the sheet's, each named after
// `to`: a file whose name begins with the sheet's name begins with `to`'s instead, so
// `residential.png` beside `residential.json` is `residential-blue.png` beside
// `residential-blue.json`, and any other file is `to`'s name, a dash, and its own name. Every name a
// file of the copy gives another, a pack's `meta.image`, the sheet's `meta.related_multi_packs`, a
// tileset's `image` or a tile's, is written to name the copy's file instead, one value at a time, so
// the rest of the file is as it was. A page with no pixel set is copied byte for byte; one with pixels
// set is its pixels, as `decodePng` read them, with those set, and its text, written as `encodePng`
// writes them.
export type Paint = { sheet: string; pixels: Record<string, number[]>; to?: string; replace?: boolean }
// What a paint reads: a file's text and bytes, and whether it is there, each by its path from the repo.
export type Reader = { text(p: string): Promise<string>; bytes(p: string): Promise<Uint8Array>; there(p: string): Promise<boolean> }
// What a paint writes: the sheet's url and each file, by its path from the repo, in the order written.
export type Painted = { url: string; writes: { path: string; data: string | Uint8Array }[] }

const SHEET = /\.(json|tsj)$/i

export async function painted(b: Paint, files: Reader): Promise<Painted> {
  const sheet = repoPath(b.sheet, 'sheet', SHEET)
  const ending = sheet.slice(sheet.lastIndexOf('.'))
  const to = b.to === undefined ? sheet : repoPath(b.to, 'to', new RegExp(`\\${ending}$`, 'i'))
  const url = `/${sheet}`
  // The sheet and every pack of it, read as the loader reads them.
  const json = async (p: string) => {
    const text = await files.text(p).catch((e: Error) => { throw new Error(`${p} does not read: ${e.message}`) })
    try {
      return { text, json: JSON.parse(text) }
    } catch (e) {
      throw new Error(`${p} is not JSON: ${(e as Error).message}`)
    }
  }
  const packs = new Map([[url, await json(sheet)]])
  let got: Sheet
  for (;;) {
    let wanted: string | undefined
    try {
      got = read(packs.get(url)!.json, url, {}, u => {
        if (packs.has(u)) return packs.get(u)!.json
        wanted = u
        throw new Error(`${u} has not been read`)
      })
      break
    } catch (e) {
      if (wanted === undefined || packs.has(wanted)) throw e
      packs.set(wanted, await json(wanted.replace(/^\/+/, '')))
    }
  }
  const pages = [...new Set(got.pages)]
  // Each page with pixels set, its pixels read and set.
  const set = new Map<string, Pixels>()
  for (const [page, list] of Object.entries(b.pixels)) {
    if (!pages.includes(page)) throw new Error(`sheet ${url} has no page ${page}`)
    if (!Array.isArray(list) || list.length % 3) throw new Error(`the pixels of ${page} are x, y and a colour, three numbers each`)
    if (!list.length) continue
    const p = decodePng(await files.bytes(page.replace(/^\/+/, '')))
    for (let i = 0; i < list.length; i += 3) {
      const [x, y, c] = [list[i], list[i + 1], list[i + 2]]
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= p.width || y >= p.height) throw new Error(`${page} is ${p.width} × ${p.height}, and has no pixel ${x}, ${y}`)
      if (!Number.isInteger(c) || c < 0 || c > 0xffffffff) throw new Error(`${c} is no colour 0xRRGGBBAA`)
      p.data.set([(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255], (y * p.width + x) * 4)
    }
    set.set(page, p)
  }
  if (to === sheet) {
    if (!set.size) throw new Error(`no pixel of ${url} is set`)
    return { url, writes: [...set].map(([page, p]) => ({ path: page.replace(/^\/+/, ''), data: encodePng(p) })) }
  }

  // Where each file of the sheet goes in the copy.
  const from = path.posix.dirname(sheet), into = path.posix.dirname(to)
  const was = path.posix.basename(sheet, ending), now = path.posix.basename(to, ending)
  const placed = new Map<string, string>([[url, to]])
  for (const u of [...packs.keys(), ...pages]) {
    if (placed.has(u)) continue
    const rel = path.posix.relative(from, u.replace(/^\/+/, ''))
    if (rel.startsWith('..') || path.posix.isAbsolute(rel)) throw new Error(`sheet ${url} names ${u}, outside its own folder, which a copy could not keep beside it`)
    const name = path.posix.basename(rel)
    placed.set(u, path.posix.join(into, path.posix.dirname(rel), name.startsWith(was) ? now + name.slice(was.length) : `${now}-${name}`))
  }
  const targets = [...placed.values()]
  if (new Set(targets).size !== targets.length) throw new Error(`the copy of ${url} at ${to} would write two of its files to one`)
  for (const [u, t] of placed) if ([...placed.keys()].some(k => k.replace(/^\/+/, '') === t)) throw new Error(`the copy of ${url} at ${to} would write ${u} over ${t}, a file of the sheet it copies`)
  if (!b.replace) for (const t of targets) if (await files.there(t)) throw new Error(`${t} is there already: tick replace to write over it`)

  // Each file's names of the others, written to name the copy's files.
  const writes: Painted['writes'] = []
  for (const [u, { text, json: j }] of packs) {
    const at = placed.get(u)!
    let out = text
    for (const { at: key, url: named } of namesIn(j, u)) {
      const target = placed.get(named)
      if (target === undefined) continue
      const value = path.posix.relative(path.posix.dirname(at), target)
      out = applyEdits(out, modify(out, key, value, { formattingOptions: { insertSpaces: true, tabSize: 1 } }))
    }
    writes.push({ path: at, data: out })
  }
  for (const page of pages) {
    const p = set.get(page)
    writes.push({ path: placed.get(page)!, data: p ? encodePng(p) : await files.bytes(page.replace(/^\/+/, '')) })
  }
  return { url: `/${to}`, writes }
}

async function paint(body: unknown, files: RouteFiles): Promise<Copied> {
  const b = body as { sheet?: unknown; pixels?: unknown; to?: unknown; replace?: unknown; entry?: unknown } | null
  if (!b || typeof b !== 'object') throw new Error('a paint names a sheet and the pixels set on its pages')
  if (typeof b.sheet !== 'string') throw new Error('sheet is a path of the repo')
  if (!b.pixels || typeof b.pixels !== 'object' || Array.isArray(b.pixels)) throw new Error('pixels are the pixels set on each page, by its url')
  if (b.to !== undefined && typeof b.to !== 'string') throw new Error('to is a path of the repo')
  if (b.replace !== undefined && typeof b.replace !== 'boolean') throw new Error('replace is true or false')
  const { url, writes } = await painted(
    { sheet: b.sheet, pixels: b.pixels as Record<string, number[]>, to: b.to, replace: b.replace },
    { text: p => files.read(p), bytes: p => files.bytes(p), there: async p => there(await files.resolve(p)) },
  )
  for (const w of writes) await files.write(w.path, w.data)
  await enter(b.entry, url, files)
  return { url, files: writes.map(w => w.path) }
}

export function loader(r: Router) {
  r.get('look', async ({ query }): Promise<Look> => {
    const at = sheetPath(query.get('path'), 'path')
    const { sheet, packs, pages } = await source(at)
    return {
      file: at,
      frames: sheet.order.length,
      clips: Object.entries(sheet.clips).map(([name, c]) => ({ name, runs: c.runs.length, length: c.runs[0]?.length ?? 0, loop: c.loop })),
      slices: Object.entries(sheet.slices).map(([name, keys]) => ({ name, keys: keys.length })),
      packs,
      pages: await Promise.all(pages.map(async p => ({ ...p, there: await there(p.path) }))),
    }
  })
  r.post('copy', ({ body, files }) => copy(body, files))
  r.post('slice', ({ body, files }) => sliceRoute(body, files))
  r.post('paint', ({ body, files }) => paint(body, files))
}
