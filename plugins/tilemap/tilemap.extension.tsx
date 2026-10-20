// The tilemap's extension: the Tiles panel, a level editor for the Tiled map the tilemap row of the
// scene selected names, a `tilemap` entry (`tilemap.sim.ts`), or else of the scene the game view
// shows, drawn as render2d lays it out. It is edited with its tilesets: every tile layer and image
// layer drawn, each tile flipped and animated as the game draws it, with the cells the game has
// changed at the step the editor is at, its tilemap row's `edits`, as the game has them, and the
// object layers drawn over them with their names and classes. Its tiles are painted, erased, filled
// and picked from a palette of every tileset the map names, laid out as the tileset's image lays
// them out, flipped along x and y and across the diagonal and turned as Tiled flips and turns them;
// its tile layers are chosen, shown and hidden in the panel alone, added and taken out, named for
// the render2d layer each draws on, and resized with every layer's cells, the objects staying where
// they are. Its objects, rectangles, ellipses, points, polygons and tiles, are placed, selected,
// moved, resized and deleted, and given a name, a class and properties, the classes and their
// members offered from the game's Tiled project, a `.tiled-project` in its folder, when it has one.
// A tile is given a class, and collision from presets, full, one-way along its top, and slopes of
// 45° and 22.5° up and down, written into its tileset as Tiled writes a tile's collision, and every
// tile's collision is shown over the map and the palette; a tile with no collision has none to make
// one-way.
//
// Every edit is written as it is made (`editor/live.ts`), a stroke or a drag once it is let go: each
// value that changed, into the map and its tileset files alike, as one change the editor can undo, in
// the shape the files had, a layer packed as base64 packed again and compressed as it was, through
// `tilemap.route.ts`; the game is rebuilt from the files. The editor's undo is the only undo. Every
// edit, a stroke of tiles, an object placed, moved or resized and a layer added too, is written as
// what it does to the map and its tilesets as their files are when it is written, so a command's
// write asked for before it, or made while it is dragged, is kept; an object or a layer it makes is
// selected by the id the files give it then.
//
// It edits the environment and nothing else: whatever a game places on its maps is placed by that
// game's own level editor, which shows a map with `MapView` of the components here, drawn as this
// panel draws one, with marks on it, points drawn as diamonds or as their sprites and areas as their
// outlines, and the pointer, its double clicks and the keys handed back in the map's cells.
//
// What the panel's tools, fields and buttons do to the map is done by functions here, which they and
// the commands call alike, each a map and its tilesets (`Doc`) made anew: tiles painted, erased or
// filled by `stroked`; a tile's class, collision and one-way by `tileSet`; a layer added by
// `layerAdded`, moved by `layerMoved`, taken out by `layerRemoved` and its fields set by `layerSet`;
// an object placed by `added`, its fields set by `withObject` and taken out by `withoutObject`; and
// the map resized by `resized`. Each is written through the editor's `liveWrite`, the panel's writes
// and the commands' on one chain, and each value one of the choices the panel offers.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), on the map of any scene with a tilemap row,
// whatever the game view shows. A cell is [c, r], its column and its row, and a rectangle of cells
// [c0, r0, c1, r1], between two corner cells, both in it, as grid's commands take them, and as each
// command answers one, so an answer can be handed back; a layer is named by its name or its id.
//   tiles.read    the map as the panel shows it: its size, tilesets, layers, each tile layer's with
//                 the rectangle its cells lie in, the names a tile layer may have and the project's
//                 classes; or a layer: a tile layer's cells over a rectangle, its whole bounds unless
//                 one is named, with the cells the game has changed and every tile in it, or an
//                 object layer's objects;
//   tiles.paint   one stroke of Paint or Erase over a list of cells, or one Fill from a cell, a tile
//                 painted by its gid, flipped as Tiled's bits say;
//   tiles.tile    a tile's class, collision preset and one-way, as the Tile section sets them;
//   tiles.layer   a layer added, its fields set, moved among its siblings or taken out, as the Layers
//                 section does;
//   tiles.object  an object placed, set or taken out, as the object tools and the Objects section do;
//   tiles.resize  the map's columns and rows, as the Map section sets them.
// Each write is one undo, refused naming the choices, answering what it left.
import { z } from 'zod'
import { CELL, changedIssue, outlined, OUTLINE, RECT, routeOf, type Edits as EditorEdits, type Editor } from '#editor/editor.ts'
import { liveWrite, type Codec } from '#editor/live.ts'
import type { Truth } from '#engine/engine.ts'
import { beside, cells, GID, readMap, type Tiled } from '#plugins/loader/loader.sim.ts'
import type { Edits } from './tilemap.sim.ts'
import { Tiles } from './tilemap.components.tsx'

export type V2 = [number, number]
type Asset = { type: string; url: string }
// `world.render2d`, as a map is laid out by it: its ground and its layers.
export type R2 = { ground?: [V2, V2]; up?: V2; layers?: (string | { name: string })[] }

// ================================================================ a Tiled map
//
// The copy is the map's JSON and each tileset file's, by path, as Tiled writes them, with one
// difference: every tile layer's cells, and each chunk's, are a list of numbers, each cell's gid with
// its flip bits over it, whatever the file packs them as. Save packs each layer back as its file
// does, a CSV list as a list and base64 as base64, compressed as it was, and a layer whose cells
// did not change keeps the very text it had.

export type Prop = { name: string; type: string; value: unknown; propertytype?: string }
export type Pt = { x: number; y: number }
export type TObject = {
  id: number; name?: string; type?: string; class?: string; x: number; y: number; width?: number; height?: number
  rotation?: number; visible?: boolean; point?: boolean; ellipse?: boolean; polygon?: Pt[]; polyline?: Pt[]; gid?: number; properties?: Prop[]
  [k: string]: unknown
}
export type TChunk = { x: number; y: number; width: number; height: number; data: number[] }
export type TLayer = {
  id: number; name: string; type: string; visible?: boolean; opacity?: number; offsetx?: number; offsety?: number
  layers?: TLayer[]; data?: number[]; chunks?: TChunk[]; encoding?: string; compression?: string
  width?: number; height?: number; startx?: number; starty?: number; objects?: TObject[]
  [k: string]: unknown
}
export type TTile = { id: number; type?: string; class?: string; objectgroup?: { objects: TObject[]; [k: string]: unknown }; [k: string]: unknown }
export type TTileset = { name: string; tilewidth: number; tileheight: number; tiles?: TTile[]; [k: string]: unknown }
export type TMap = {
  orientation: string; width: number; height: number; tilewidth: number; tileheight: number; infinite?: boolean
  compressionlevel?: number; nextlayerid: number; nextobjectid: number; layers: TLayer[]
  tilesets: ({ firstgid: number; source?: string } & Partial<TTileset>)[]
  editorsettings?: { chunksize?: { width: number; height: number } }
  [k: string]: unknown
}
export type Doc = { map: TMap; sets: Record<string, TTileset> }
// A place in the map's layers: its index in the map's list, then in each group's down to it.
export type LPath = number[]
// A tileset of the map: its place in the map's list, its first gid, and its file, when it is one.
export type SetRef = { index: number; firstgid: number; path?: string }

// Tiled's flip bits, as the loader counts them: 4 along x, 2 along y and 1 across the diagonal,
// written over a cell's gid from its top bit down.
export const FLIP_H = 4, FLIP_V = 2, FLIP_D = 1
export const rawOf = (gid: number, flip: number) => (gid | (flip << 29)) >>> 0
export const flipOf = (raw: number) => raw >>> 29
// A tile turned a quarter right and left, as its flip bits: the masks Tiled's own `Cell::rotate` uses.
export const RIGHT = [5, 4, 1, 0, 7, 6, 3, 2], LEFT = [3, 2, 7, 6, 1, 0, 5, 4]

export const layerAt = (m: TMap, p: LPath): TLayer => p.slice(1).reduce((l, i) => l.layers![i], m.layers[p[0]])
export function withLayer(m: TMap, p: LPath, f: (l: TLayer) => TLayer): TMap {
  const inside = (list: TLayer[], k: number): TLayer[] => list.map((l, i) => (i !== p[k] ? l : k === p.length - 1 ? f(l) : { ...l, layers: inside(l.layers ?? [], k + 1) }))
  return { ...m, layers: inside(m.layers, 0) }
}
// The map with the list the layer at `p` is in made anew by `f`.
export const withSiblings = (m: TMap, p: LPath, f: (list: TLayer[]) => TLayer[]): TMap =>
  p.length === 1 ? { ...m, layers: f(m.layers) } : withLayer(m, p.slice(0, -1), g => ({ ...g, layers: f(g.layers ?? []) }))

// Every layer, groups too, in the map's order, with how deep it is and, for one the loader reads, its
// place in the loader's list, which leaves groups out.
export type Flat = { path: LPath; layer: TLayer; depth: number; drawn: number }
export function flat(m: TMap): Flat[] {
  const out: Flat[] = []
  let k = 0
  const walk = (list: TLayer[], base: LPath, depth: number) => list.forEach((layer, i) => {
    const path = [...base, i]
    out.push({ path, layer, depth, drawn: layer.type === 'group' ? -1 : k++ })
    if (layer.type === 'group') walk(layer.layers ?? [], path, depth + 1)
  })
  walk(m.layers, [], 0)
  return out
}
export const pathOf = (m: TMap, id: number | undefined) => flat(m).find(f => f.layer.id === id)?.path

export const mapLayers = (list: TLayer[], f: (l: TLayer) => TLayer): TLayer[] => list.map(l => (l.type === 'group' ? { ...l, layers: mapLayers(l.layers ?? [], f) } : f(l)))

export const refsOf = (m: TMap, url: string): SetRef[] =>
  (m.tilesets ?? []).map((t, index) => ({ index, firstgid: t.firstgid, ...(t.source !== undefined && { path: beside(url, t.source).replace(/^\//, '') }) }))

// Every tile layer's cells, and each chunk's, as numbers.
export function unpacked(m: TMap, url: string): TMap {
  return {
    ...m,
    layers: mapLayers(m.layers ?? [], l => {
      if (l.type !== 'tilelayer') return l
      const where = `tilemap ${url} layer ${l.name}`
      if (l.chunks) return { ...l, chunks: l.chunks.map(c => ({ ...c, data: cells(`${where} chunk ${c.x}, ${c.y}`, c.data, l.encoding, l.compression, c.width * c.height) })) }
      return { ...l, data: cells(where, l.data, l.encoding, l.compression, l.width! * l.height!) }
    }),
  }
}

export const base64 = (bytes: Uint8Array) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// Cells packed as Tiled stores them: four bytes each, lowest first, as base64, compressed by the
// editor's server, which has zstd where a page has none (`tilemap.route.ts`), at the map's level.
export async function pack(raw: number[], compression: string | undefined, level: number): Promise<string> {
  const bytes = new Uint8Array(raw.length * 4)
  const view = new DataView(bytes.buffer)
  raw.forEach((v, i) => view.setUint32(i * 4, v >>> 0, true))
  if (!compression) return base64(bytes)
  return (await routeOf<{ data: string }>('tilemap', 'compress', { compression, level, data: base64(bytes) })).data
}

export const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i])

// The map as its file holds it: each base64 layer and chunk packed, keeping the text the file has
// where its cells are what they were.
export async function packed(m: TMap, was: TMap, url: string): Promise<unknown> {
  // The file's layers, whose cells are still packed.
  const old = new Map(flat(was).map(f => [f.layer.id, f.layer as Record<string, unknown>]))
  const level = m.compressionlevel ?? -1
  const walk = (list: TLayer[]): Promise<unknown[]> => Promise.all(list.map(async l => {
    if (l.type === 'group') return { ...l, layers: await walk(l.layers ?? []) }
    if (l.type !== 'tilelayer' || l.encoding !== 'base64') return l
    const o = old.get(l.id)
    const kept = o && o.encoding === l.encoding && o.compression === l.compression ? o : undefined
    const text = (data: unknown, count: number, now: number[]) =>
      kept && typeof data === 'string' && same(cells(url, data, l.encoding, l.compression, count), now) ? Promise.resolve(data) : pack(now, l.compression, level)
    if (l.chunks) {
      const had = (kept?.chunks ?? []) as { x: number; y: number; width: number; height: number; data: unknown }[]
      return {
        ...l,
        chunks: await Promise.all(l.chunks.map(async c => {
          const oc = had.find(k => k.x === c.x && k.y === c.y && k.width === c.width && k.height === c.height)
          return { ...c, data: await text(oc?.data, c.width * c.height, c.data) }
        })),
      }
    }
    return { ...l, data: await text(kept?.data, l.width! * l.height!, l.data!) }
  }))
  return { ...m, layers: await walk(m.layers) }
}

export const mapCodec = (path: string, url: string): Codec<Doc> => ({
  read: files => ({
    map: unpacked(files[path] as TMap, url),
    sets: Object.fromEntries(Object.entries(files).filter(([p]) => p !== path)) as Record<string, TTileset>,
  }),
  write: async (doc, files) => ({ [path]: await packed(doc.map, files[path] as TMap, url), ...doc.sets }),
})

// The map as the loader reads it, its cells already numbers.
export const drawable = (m: TMap): TMap => ({
  ...m,
  layers: mapLayers(m.layers, l => {
    if (l.type !== 'tilelayer' || l.encoding === undefined) return l
    return without(l, 'encoding', 'compression')
  }),
})

// ---------------------------------------------------------------- cells

export const chunkSize = (m: TMap) => m.editorsettings?.chunksize ?? { width: 16, height: 16 }

export function cellOf(l: TLayer, c: number, r: number): number {
  if (l.chunks) {
    const ch = l.chunks.find(k => c >= k.x && c < k.x + k.width && r >= k.y && r < k.y + k.height)
    return ch ? ch.data[(r - ch.y) * ch.width + (c - ch.x)] : 0
  }
  return c >= 0 && r >= 0 && c < l.width! && r < l.height! ? l.data![r * l.width! + c] : 0
}

// The cells a layer's cells lie in: its size, or an infinite map's chunks' bounds.
export function bounds(l: TLayer): [number, number, number, number] {
  if (!l.chunks) return [0, 0, l.width!, l.height!]
  if (!l.chunks.length) return [0, 0, 0, 0]
  const x = Math.min(...l.chunks.map(k => k.x)), y = Math.min(...l.chunks.map(k => k.y))
  return [x, y, Math.max(...l.chunks.map(k => k.x + k.width)) - x, Math.max(...l.chunks.map(k => k.y + k.height)) - y]
}
// The same cells as a rectangle between two corner cells, both in it, [c0, r0, c1, r1], as a command
// takes one (`RECT`), so what a command answers can be handed back to it; null for a layer with none.
export function rectOf(l: TLayer): [number, number, number, number] | null {
  const [x, y, w, h] = bounds(l)
  return w && h ? [x, y, x + w - 1, y + h - 1] : null
}

// A tile layer with cells set, each [c, r, raw]. A finite map's cells off the map are left; an
// infinite map grows a chunk, at the map's chunk size and on its grid, for a tile put where none is,
// and keeps its chunks in Tiled's order, row by row, with the layer's bounds round them.
export function withCells(m: TMap, l: TLayer, set: [number, number, number][]): TLayer {
  if (!l.chunks) {
    const [w, h] = [l.width!, l.height!]
    let data: number[] | undefined
    for (const [c, r, v] of set) {
      if (c < 0 || r < 0 || c >= w || r >= h || (data ?? l.data!)[r * w + c] === v) continue
      data ??= [...l.data!]
      data[r * w + c] = v
    }
    return data ? { ...l, data } : l
  }
  const size = chunkSize(m)
  let chunks: TChunk[] | undefined
  const fresh = new Set<TChunk>()
  for (const [c, r, v] of set) {
    const list = chunks ?? l.chunks
    let k = list.findIndex(ch => c >= ch.x && c < ch.x + ch.width && r >= ch.y && r < ch.y + ch.height)
    if (k < 0 && !v) continue
    chunks ??= [...l.chunks]
    if (k < 0) {
      const x = Math.floor(c / size.width) * size.width, y = Math.floor(r / size.height) * size.height
      const made = { x, y, width: size.width, height: size.height, data: new Array<number>(size.width * size.height).fill(0) }
      fresh.add(made)
      chunks.push(made)
      chunks.sort((a, b) => a.y - b.y || a.x - b.x)
      k = chunks.indexOf(made)
    }
    let ch: TChunk = chunks[k]
    const i = (r - ch.y) * ch.width + (c - ch.x)
    if (ch.data[i] === v) continue
    if (!fresh.has(ch)) {
      ch = { ...ch, data: [...ch.data] }
      fresh.add(ch)
      chunks[k] = ch
    }
    ch.data[i] = v
  }
  if (!chunks) return l
  const out: TLayer = { ...l, chunks }
  const [x, y, w, h] = bounds(out)
  return { ...out, startx: x, starty: y, width: w, height: h }
}

// Every cell joined to [c, r] along its sides through cells holding what it holds, within the
// layer's bounds.
export function fillCells(l: TLayer, c: number, r: number, v: number): [number, number, number][] {
  const [x0, y0, w, h] = bounds(l)
  const inside = (x: number, y: number) => x >= x0 && y >= y0 && x < x0 + w && y < y0 + h
  if (!inside(c, r)) return []
  const was = cellOf(l, c, r)
  if (was === v) return []
  const seen = new Set<number>(), out: [number, number, number][] = []
  const todo: V2[] = [[c, r]]
  while (todo.length) {
    const [x, y] = todo.pop()!
    const key = (y - y0) * w + (x - x0)
    if (!inside(x, y) || seen.has(key) || cellOf(l, x, y) !== was) continue
    seen.add(key)
    out.push([x, y, v])
    todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  return out
}

// Every finite tile layer made `cols` by `rows`, cut from the right and the bottom or grown there
// with no tile; the objects stay where they are.
export function resizedMap(m: TMap, cols: number, rows: number): TMap {
  return {
    ...m,
    width: cols,
    height: rows,
    layers: mapLayers(m.layers, l => {
      if (l.type !== 'tilelayer' || l.chunks) return l
      const data = new Array<number>(cols * rows).fill(0)
      for (let r = 0; r < Math.min(rows, l.height!); r++) for (let c = 0; c < Math.min(cols, l.width!); c++) data[r * cols + c] = l.data![r * l.width! + c]
      return { ...l, width: cols, height: rows, data }
    }),
  }
}

// ---------------------------------------------------------------- tilesets, and collision

export const setOf = (d: Doc, ref: SetRef): TTileset => (ref.path ? d.sets[ref.path] : (d.map.tilesets[ref.index] as TTileset))
export const withSet = (d: Doc, ref: SetRef, f: (t: TTileset) => TTileset): Doc =>
  ref.path
    ? { ...d, sets: { ...d.sets, [ref.path]: f(d.sets[ref.path]) } }
    : { ...d, map: { ...d.map, tilesets: d.map.tilesets.map((t, i) => (i === ref.index ? (f(t as TTileset) as typeof t) : t)) } }

// A tileset with tile `id`'s entry made anew by `f`: put in, in order of ids, when it had none, and
// taken out when it is left with nothing but its id, as Tiled writes a tileset.
export function withTile(ts: TTileset, id: number, f: (t: TTile) => TTile): TTileset {
  const tiles = ts.tiles ?? []
  const at = tiles.findIndex(t => t.id === id)
  const next = f(at >= 0 ? tiles[at] : { id })
  const bare = Object.keys(next).length === 1
  let list: TTile[]
  if (at >= 0) list = bare ? tiles.filter((_, i) => i !== at) : tiles.map((t, i) => (i === at ? next : t))
  else if (bare) return ts
  else {
    const i = tiles.findIndex(t => t.id > id)
    list = [...tiles]
    list.splice(i < 0 ? tiles.length : i, 0, next)
  }
  if (list.length) return { ...ts, tiles: list }
  return without(ts, 'tiles')
}

// `o` with none of `keys`.
export const without = <T extends object>(o: T, ...keys: string[]): T => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as T

// The key a class is written under: Tiled 1.9 wrote `class`, before and after it `type`.
export const classKey = (o: { class?: unknown; type?: unknown }) => (o.class !== undefined && o.type === undefined ? 'class' : 'type')
export const classOf = (o: { class?: string; type?: string }) => o.type ?? o.class ?? ''

// The collision a tile can be given in one choice: its shape in a W × H tile, and whether it is
// one-way. The slopes rise or fall across the tile, 45° in one tile and 22.5° over two, each half
// its own tile.
export type Preset = { id: string; title: string; rect?: true; top?: boolean; pts?: (w: number, h: number) => V2[] }
export const PRESETS: Preset[] = [
  { id: 'none', title: 'none' },
  { id: 'full', title: 'full', rect: true, top: false },
  { id: 'top', title: 'top (one-way)', rect: true, top: true },
  { id: '45 up', title: '45° up', pts: (w, h) => [[0, h], [w, 0], [w, h]] },
  { id: '45 down', title: '45° down', pts: (w, h) => [[0, 0], [w, h], [0, h]] },
  { id: '22 up low', title: '22.5° up, low half', pts: (w, h) => [[0, h], [w, h / 2], [w, h]] },
  { id: '22 up high', title: '22.5° up, high half', pts: (w, h) => [[0, h / 2], [w, 0], [w, h], [0, h]] },
  { id: '22 down high', title: '22.5° down, high half', pts: (w, h) => [[0, 0], [w, h / 2], [w, h], [0, h]] },
  { id: '22 down low', title: '22.5° down, low half', pts: (w, h) => [[0, h / 2], [w, h], [0, h]] },
]

// Which preset a tile's collision is, or 'custom'.
export function presetOf(t: TTile | undefined, w: number, h: number): string {
  const objs = t?.objectgroup?.objects ?? []
  if (!objs.length) return 'none'
  if (objs.length > 1) return 'custom'
  const o = objs[0]
  if (!o.polygon && o.x === 0 && o.y === 0 && o.width === w && o.height === h && !o.ellipse && !o.point) return classOf(o) === 'top' ? 'top' : 'full'
  const pts = o.polygon?.map(p => `${p.x + o.x},${p.y + o.y}`).join(' ')
  return PRESETS.find(p => p.pts && p.pts(w, h).map(q => q.join()).join(' ') === pts)?.id ?? 'custom'
}

// Tile `id` given a preset's collision, its objects written as Tiled writes a tile's collision; a
// slope keeps whether the tile was one-way.
export function withPreset(ts: TTileset, id: number, preset: string, w: number, h: number): TTileset {
  const p = PRESETS.find(x => x.id === preset)!
  return withTile(ts, id, t => {
    if (!p.rect && !p.pts) return without(t, 'objectgroup')
    const had = t.objectgroup?.objects ?? []
    const top = p.top ?? (had.length > 0 && had.every(o => classOf(o) === 'top'))
    const key = had[0] ? classKey(had[0]) : 'type'
    const shape = p.rect ? { width: w, height: h } : { width: 0, height: 0, polygon: p.pts!(w, h).map(([x, y]) => ({ x, y })) }
    const object: TObject = { id: 1, name: '', [key]: top ? 'top' : '', rotation: 0, visible: true, x: 0, y: 0, ...shape }
    const group = t.objectgroup ?? { type: 'objectgroup', draworder: 'index', id: 2, name: '', opacity: 1, visible: true, x: 0, y: 0, objects: [] }
    return { ...t, objectgroup: { ...group, objects: [object] } }
  })
}

// Every collision object of tile `id` one-way, or none of them.
export const withOneWay = (ts: TTileset, id: number, top: boolean): TTileset =>
  withTile(ts, id, t => (t.objectgroup ? { ...t, objectgroup: { ...t.objectgroup, objects: t.objectgroup.objects.map(o => ({ ...o, [classKey(o)]: top ? 'top' : '' })) } } : t))

export const withTileClass = (ts: TTileset, id: number, cls: string): TTileset =>
  withTile(ts, id, t => (cls ? { ...t, [classKey(t)]: cls } : without(t, 'type', 'class')))

// ---------------------------------------------------------------- objects, and the project's classes

export type Member = { name: string; type: string; value?: unknown; propertyType?: string }
export type PropType = { name: string; type: string; useAs?: string[]; members?: Member[]; values?: string[]; storageType?: string; color?: string }

export const blankOf = (type: string): unknown => (type === 'int' || type === 'float' || type === 'object' ? 0 : type === 'bool' ? false : type === 'class' ? {} : '')

export const withObjects = (d: Doc, lp: LPath, f: (os: TObject[]) => TObject[]): Doc => ({ ...d, map: withLayer(d.map, lp, l => ({ ...l, objects: f(l.objects ?? []) })) })
export const withObject = (d: Doc, lp: LPath, id: number, f: (o: TObject) => TObject): Doc => withObjects(d, lp, os => os.map(o => (o.id === id ? f(o) : o)))

// A new object, as Tiled writes one, numbered with the map's next id, its class under the key the
// map's other objects write theirs under.
export type Shape = Partial<TObject> & { x: number; y: number }
export function added(d: Doc, lp: LPath, o: Shape): { doc: Doc; id: number } {
  const id = d.map.nextobjectid
  const others = flat(d.map).flatMap(f => f.layer.objects ?? [])
  const key = others.some(x => x.class !== undefined && x.type === undefined) ? 'class' : 'type'
  const { x, y, width, height, type, class: cls } = o
  const rest = without(o, 'id', 'x', 'y', 'width', 'height', 'type', 'class') as Omit<Shape, 'id' | 'x' | 'y' | 'width' | 'height' | 'type' | 'class'>
  const made: TObject = { id, name: '', [key]: type ?? cls ?? '', x, y, width: width ?? 0, height: height ?? 0, rotation: 0, visible: true, ...rest }
  const next = withObjects(d, lp, os => [...os, made])
  return { doc: { ...next, map: { ...next.map, nextobjectid: id + 1 } }, id }
}

export const withProp = (o: TObject, p: Prop): TObject => {
  const list = o.properties ?? []
  const i = list.findIndex(x => x.name === p.name)
  return { ...o, properties: i >= 0 ? list.map((x, j) => (j === i ? p : x)) : [...list, p] }
}
export const withoutProp = (o: TObject, name: string): TObject => {
  const list = (o.properties ?? []).filter(x => x.name !== name)
  return list.length ? { ...o, properties: list } : without(o, 'properties')
}
// What kind of object an object is.
export const kindOf = (o: TObject) => (o.point ? 'point' : o.ellipse ? 'ellipse' : o.polygon ? 'polygon' : o.polyline ? 'polyline' : o.gid !== undefined ? 'tile' : 'rectangle')

// ---------------------------------------------------------------- a scene's map, and its project

// The map as the loader reads it, its tilesets out of the copy.
export function tiledOf(d: Doc, url: string): Tiled {
  return readMap(drawable(d.map), url, u => {
    const s = d.sets[u.replace(/^\//, '')]
    if (!s) throw new Error(`${u} has not been read`)
    return s
  })
}

// The tilemap row of a scene, the file its `world.tilemap` names, and the entry of its catalogue of
// that name.
export function entryOf(truth: Truth) {
  const tm = truth.rows.find(r => r.kind === 'tilemap')
  const assets = (truth.world.loader?.assets ?? {}) as Record<string, Asset>
  const file = truth.world.tilemap?.file as string | undefined
  return { tm, file, assets, asset: tm && file !== undefined ? assets[file] : undefined }
}

// The map of scene `scene`, a scene with a tilemap row, refused naming those that have one: its file
// and url, the cells the game has changed at the step the editor is at, and the files it is edited
// with, its own and each of its tilesets'.
export async function mapIn(ed: Editor, scene: string) {
  const { tm, file, assets, asset } = entryOf(ed.sceneOf(scene, 'tilemap'))
  if (!asset || asset.type !== 'tilemap') {
    const maps = Object.keys(assets).filter(n => assets[n].type === 'tilemap')
    throw new Error(`the world.tilemap of ${scene} names ${String(file)}, which is no tilemap entry of its catalogue: they are ${maps.join(', ') || 'none'}`)
  }
  const path = asset.url.replace(/^\//, '')
  const map = JSON.parse(await ed.text(path)) as TMap
  const paths = [path, ...refsOf(map, asset.url).flatMap(r => (r.path ? [r.path] : []))]
  return { scene, path, url: asset.url, paths, edits: (tm!.data.edits ?? {}) as Edits }
}
type MapOf = Awaited<ReturnType<typeof mapIn>>

// The map and its tilesets as their files are now, and as the loader reads them: what a game's level
// editor asks whether a thing stands clear of the map's collision with.
export async function docOf(ed: Editor, m: MapOf): Promise<{ doc: Doc; tiled: Tiled }> {
  const files: Record<string, unknown> = {}
  for (const p of m.paths) files[p] = JSON.parse(await ed.text(p))
  const doc = mapCodec(m.path, m.url).read(files)
  return { doc, tiled: tiledOf(doc, m.url) }
}

// The `world.render2d` a scene boots with: the scene's own, else the game's; and the names of its
// layers, which a tile layer is named for, one to each.
export function render2dOf(ed: Editor, scene: string): R2 {
  const s = ed.need()
  return (s.files.get(ed.worldFile(scene, 'render2d'))?.world?.render2d ?? {}) as R2
}
export const layerNames = (prefab: R2) => (prefab.layers ?? []).map(l => (typeof l === 'string' ? l : l.name))

// The game's Tiled project, a `.tiled-project` in its folder, when it has one, and its types.
export async function projectIn(ed: Editor, folder: string): Promise<string | undefined> {
  return (await ed.files.list(folder)).find(f => f.endsWith('.tiled-project'))
}
export const typesIn = (text: string) => (JSON.parse(text).propertyTypes ?? []) as PropType[]
// The classes an object may have, and a tile, of the project's types.
export const objectClasses = (types: PropType[]) => types.filter(t => t.type === 'class' && (!t.useAs || t.useAs.includes('object')))
export const tileClasses = (types: PropType[]) => types.filter(t => t.type === 'class' && t.useAs?.includes('tile'))
async function typesOf(ed: Editor): Promise<PropType[]> {
  const s = ed.need()
  const project = await projectIn(ed, s.game.path.split('/').slice(0, -1).join('/'))
  if (project === undefined) return []
  try {
    return typesIn(await ed.text(project))
  } catch (e) {
    throw new Error(`${project} is no JSON: ${(e as Error).message}`)
  }
}

// ---------------------------------------------------------------- what the panel does

// A stroke of the tile tools at a cell of tile layer `layer`: `paint` sets it to `raw`, a gid with its
// flip bits over it, `erase` empties it, and `fill` floods the cells joined to it through cells like
// it with `raw`. A layer the map no longer has, or one of another type, is left.
export function stroked(d: Doc, layer: number, tool: 'paint' | 'erase' | 'fill', [c, r]: V2, raw: number): Doc {
  const p = pathOf(d.map, layer)
  if (!p || layerAt(d.map, p).type !== 'tilelayer') return d
  const set: [number, number, number][] = tool === 'fill' ? fillCells(layerAt(d.map, p), c, r, raw) : [[c, r, tool === 'erase' ? 0 : raw]]
  return { ...d, map: withLayer(d.map, p, l => withCells(d.map, l, set)) }
}

// A stroke of a tile tool that writes: its tool, the gid and flips it paints, the layer it paints on
// and the cells it passes over, each stroked in turn (`stroked`), as a drag of Paint or Erase passes
// over them, or the one Fill floods from.
export type Stroke = { tool: 'paint' | 'erase' | 'fill'; raw: number; layer: number; cells: V2[] }
export const strokeOn = (d: Doc, s: Stroke): Doc => s.cells.reduce((x, c) => stroked(x, s.layer, s.tool, c, s.raw), d)

// An object placed on object layer `layer` (`added`), and its id; none, and the map as it was, when
// the map has no such layer.
export function objectAdded(d: Doc, layer: number, o: Shape): { doc: Doc; id: number | undefined } {
  const lp = pathOf(d.map, layer)
  return lp && layerAt(d.map, lp).type === 'objectgroup' ? added(d, lp, o) : { doc: d, id: undefined }
}

// Object `id` of object layer `layer` made anew by `f`.
export function objectSet(d: Doc, layer: number, id: number, f: (o: TObject) => TObject): Doc {
  const lp = pathOf(d.map, layer)
  return lp ? withObject(d, lp, id, f) : d
}

// Tile `id` of the tileset `ref`, `w` by `h`, given a class ('' for none), a collision preset, and
// its collision one-way or not: what is handed, in that order.
export function tileSet(d: Doc, ref: SetRef, id: number, w: number, h: number, to: { class?: string; collision?: string; oneWay?: boolean }): Doc {
  let out = d
  if (to.class !== undefined) out = withSet(out, ref, ts => withTileClass(ts, id, to.class!))
  if (to.collision !== undefined) out = withSet(out, ref, ts => withPreset(ts, id, to.collision!, w, h))
  if (to.oneWay !== undefined) out = withSet(out, ref, ts => withOneWay(ts, id, to.oneWay!))
  return out
}

// The names a new tile layer may have: render2d's layers no tile layer has; and the name a new
// object layer is given: the first of render2d's no layer has, else `objects <id>`.
export const freeTileNames = (m: TMap, names: string[]) => {
  const taken = new Set(flat(m).filter(f => f.layer.type === 'tilelayer').map(f => f.layer.name))
  return names.filter(n => !taken.has(n))
}
const objectName = (m: TMap, names: string[], id: number) => names.find(n => !flat(m).some(f => f.layer.name === n)) ?? `objects ${id}`

// A layer added after the layer at `after`, the top list's last when none: a tile layer named `name`
// the size of the map, empty, packed as the map's first tile layer is; or an object layer, named
// `name` when one is handed. Answers the map and the layer's id.
export function layerAdded(d: Doc, type: 'tilelayer' | 'objectgroup', after: LPath | undefined, names: string[], name?: string): { doc: Doc; id: number } {
  const map = d.map
  const id = map.nextlayerid
  const at = after ?? [map.layers.length - 1]
  const first = flat(map).find(f => f.layer.type === 'tilelayer')?.layer
  const made: TLayer = type === 'tilelayer'
    ? {
        id, name: name ?? freeTileNames(map, names)[0], type, x: 0, y: 0,
        ...(map.infinite
          ? { startx: 0, starty: 0, width: 0, height: 0, opacity: 1, visible: true, chunks: [] }
          : { width: map.width, height: map.height, opacity: 1, visible: true, data: new Array<number>(map.width * map.height).fill(0) }),
        ...(first?.encoding !== undefined && { encoding: first.encoding }), ...(first?.compression !== undefined && { compression: first.compression }),
      }
    : { id, name: name ?? objectName(map, names, id), type, draworder: 'topdown', opacity: 1, visible: true, x: 0, y: 0, objects: [] }
  const i = at[at.length - 1] + 1
  return { doc: { ...d, map: { ...withSiblings(map, at, list => [...list.slice(0, i), made, ...list.slice(i)]), nextlayerid: id + 1 } }, id }
}

// Layer `id` swapped with its sibling `by` places on, when it has one there.
export function layerMoved(d: Doc, id: number, by: number): Doc {
  const lp = pathOf(d.map, id)
  if (!lp) return d
  const i = lp[lp.length - 1]
  return { ...d, map: withSiblings(d.map, lp, list => {
    if (i + by < 0 || i + by >= list.length) return list
    const next = [...list]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    return next
  }) }
}
// Layer `id` taken out, with the layers in it.
export function layerRemoved(d: Doc, id: number): Doc {
  const lp = pathOf(d.map, id)
  return lp ? { ...d, map: withSiblings(d.map, lp, list => list.filter((_, j) => j !== lp[lp.length - 1])) } : d
}
// Layer `id` made anew by `f`.
export function layerSet(d: Doc, id: number, f: (l: TLayer) => TLayer): Doc {
  const lp = pathOf(d.map, id)
  return lp ? { ...d, map: withLayer(d.map, lp, f) } : d
}
// A layer's opacity, as the panel's field keeps it.
export const OPACITY = z.number().min(0).max(1)

// Object `id` of object layer `layer` taken out.
export function withoutObject(d: Doc, layer: number, id: number): Doc {
  const lp = pathOf(d.map, layer)
  return lp ? withObjects(d, lp, os => os.filter(o => o.id !== id)) : d
}

// The map `cols` by `rows` cells, as the Map section's fields keep them: whole numbers from 1.
export const SIZE = z.number().int().min(1)
export const resized = (d: Doc, cols: number, rows: number): Doc => ({ ...d, map: resizedMap(d.map, cols, rows) })

// ---------------------------------------------------------------- what a command writes

const point = z.strictObject({ x: z.number(), y: z.number() })
const TYPES = ['string', 'int', 'float', 'bool', 'color', 'file', 'object', 'class'] as const
// A property, as Tiled writes one: its value of its type, a class's an object.
const PROP = z.strictObject({ name: z.string().min(1), type: z.enum(TYPES), value: z.json(), propertytype: z.string().optional() }).superRefine((p, ctx) => {
  const v = p.value
  const ok = p.type === 'int' || p.type === 'object' ? Number.isInteger(v)
    : p.type === 'float' ? typeof v === 'number'
    : p.type === 'bool' ? typeof v === 'boolean'
    : p.type === 'class' ? v !== null && typeof v === 'object' && !Array.isArray(v)
    : p.type === 'color' ? typeof v === 'string' && /^(#([0-9a-f]{2})?[0-9a-f]{6})?$/i.test(v)
    : typeof v === 'string'
  if (!ok) ctx.addIssue({ code: 'custom', path: ['value'], message: `a property of type ${p.type} holds ${p.type === 'int' || p.type === 'object' ? 'a whole number' : p.type === 'float' ? 'a number' : p.type === 'bool' ? 'true or false' : p.type === 'class' ? 'an object of its members' : p.type === 'color' ? '#rrggbb, #aarrggbb or nothing' : 'text'}, not ${JSON.stringify(v)}` })
})
// An object, as the object tools and the Objects section write one.
const OBJECT = z.strictObject({
  id: z.number().int(), name: z.string(), type: z.string(), class: z.string(),
  x: z.number(), y: z.number(), width: z.number().min(0), height: z.number().min(0), rotation: z.number(), visible: z.boolean(),
  point: z.literal(true), ellipse: z.literal(true), polygon: z.array(point).min(3), polyline: z.array(point).min(2), gid: z.number().int().min(1),
  properties: z.array(PROP),
}).partial().required({ x: true, y: true })

// Layer `which` of the map, by its id or its name, of a type `types` has when handed: one the map
// has not got, or a name two layers have, refused naming the choices.
function layerIn(m: TMap, which: string | number, types?: string[]): Flat {
  const all = flat(m).filter(f => !types || types.includes(f.layer.type))
  const what = !types ? 'layer' : types.length > 1 ? 'such layer' : { tilelayer: 'tile layer', objectgroup: 'object layer' }[types[0]] ?? `${types[0]} layer`
  const got = all.filter(f => (typeof which === 'number' ? f.layer.id === which : f.layer.name === which))
  if (got.length === 1) return got[0]
  if (got.length > 1) throw new Error(`${got.length} layers are named ${which}: name one by its id, ${got.map(f => f.layer.id).join(' or ')}`)
  throw new Error(`the map has no ${what} ${which}: its ${what === 'such layer' ? 'layers of those types' : `${what}s`} are ${all.map(f => `${f.layer.name} (${f.layer.id})`).join(', ') || 'none'}`)
}

// The gids of a map's tilesets, each tileset's first to last.
const gidsOf = (t: Tiled) => t.tilesets.map(s => `${s.name} ${s.firstgid}–${s.firstgid + s.count - 1}`).join(', ')

// How many cells a command reads at most.
const READ = 16384

// A tile layer's cells over a rectangle, as `tiles.read` answers them: each row's gids, the cells
// flipped with their bits, the cells the game has changed, and every tile shown there.
function cellsRead(doc: Doc, tiled: Tiled, f: Flat, rect: number[] | undefined, edits: Edits) {
  const l = f.layer
  const whole = rectOf(l)
  // A layer with no cells, as an infinite map's new one is, has none to read over its bounds.
  if (!rect && !whole) return { layer: { id: l.id, name: l.name }, rect: null, rows: [], flips: [], game: [], tiles: {} }
  const [c0, r0, c1, r1] = rect ?? whole!
  if (c1 < c0 || r1 < r0) throw new Error(`the rectangle [${[c0, r0, c1, r1].join(', ')}] has its corners the wrong way round: [c0, r0, c1, r1], c0 ≤ c1 and r0 ≤ r1`)
  const area = (c1 - c0 + 1) * (r1 - r0 + 1)
  if (area > READ) throw new Error(`[${[c0, r0, c1, r1].join(', ')}] is ${area} cells, more than the ${READ} read at once: name a smaller rectangle`)
  const rows: number[][] = [], flips: [number, number, number][] = [], game: [number, number, number][] = []
  const shown = new Set<number>()
  for (let r = r0; r <= r1; r++) {
    const row: number[] = []
    for (let c = c0; c <= c1; c++) {
      const raw = cellOf(l, c, r)
      row.push(raw & GID)
      if (raw & GID) shown.add(raw & GID)
      if (flipOf(raw)) flips.push([c, r, flipOf(raw)])
      const e = edits[`${l.name}:${c},${r}`]
      if (e !== undefined) {
        game.push([c, r, e < 0 ? 0 : e])
        if (e > 0) shown.add(e)
      }
    }
    rows.push(row)
  }
  const refs = refsOf(doc.map, tiled.url)
  const tiles = Object.fromEntries([...shown].sort((a, b) => a - b).map(gid => {
    const t = tiled.tiles[gid]
    if (!t) return [gid, { missing: 'no tileset of the map has it' }]
    const entry = setOf(doc, refs[t.tileset]).tiles?.find(x => x.id === t.id)
    return [gid, { tileset: tiled.tilesets[t.tileset].name, id: t.id, class: classOf(entry ?? { id: t.id }), collision: presetOf(entry, t.box[2], t.box[3]), ...(t.animation && { animated: t.animation.length }) }]
  }))
  return { layer: { id: l.id, name: l.name }, rect: [c0, r0, c1, r1], rows, flips, game, tiles }
}

// The map as `tiles.read` answers it with no layer named.
function overview(doc: Doc, tiled: Tiled, names: string[], types: PropType[], m: MapOf) {
  const map = doc.map
  return {
    scene: m.scene, file: m.path, orientation: map.orientation, cols: map.width, rows: map.height, tile: [map.tilewidth, map.tileheight], infinite: !!map.infinite,
    tilesets: tiled.tilesets.map((s, i) => ({ name: s.name, firstgid: s.firstgid, count: s.count, ...(refsOf(map, m.url)[i]?.path && { file: refsOf(map, m.url)[i].path }) })),
    layers: flat(map).map(f => ({
      id: f.layer.id, name: f.layer.name, type: f.layer.type, depth: f.depth, visible: f.layer.visible !== false, opacity: f.layer.opacity ?? 1,
      offset: [f.layer.offsetx ?? 0, f.layer.offsety ?? 0],
      ...(f.layer.type === 'tilelayer' && { cells: rectOf(f.layer) }), ...(f.layer.type === 'objectgroup' && { objects: (f.layer.objects ?? []).length }),
    })),
    names, free: freeTileNames(map, names),
    classes: { object: objectClasses(types).map(t => t.name), tile: tileClasses(types).map(t => t.name) },
  }
}

export function tilemap(ed: Editor) {
  ed.panel({ id: 'tilemap', title: 'Tiles', area: 'center', component: Tiles })

  // Scene `scene`'s map written as `op` makes it of the map and its tilesets as their files are when
  // it is written, on the chain the Tiles panel writes on, as the change `e` makes; what `op` throws
  // is the call's refusal, and nothing is written. Answers what `op` answered.
  const write = async (e: EditorEdits, m: MapOf, op: (d: Doc, tiled: Tiled) => { doc: Doc; answer: unknown }): Promise<unknown> => {
    let answer: unknown
    await liveWrite(ed, e, m.paths, mapCodec(m.path, m.url), d => {
      const got = op(d, tiledOf(d, m.url))
      answer = got.answer
      return got.doc
    })
    return answer
  }
  const scene = z.string().describe('a scene with a tilemap row')
  const layer = z.union([z.string(), z.number().int()]).describe('a layer, by its name or its id')
  const cell = CELL
  const rect = RECT.describe('[c0, r0, c1, r1], its corners in it')

  ed.command({
    id: 'tiles.read',
    title: 'Tiles: read',
    input: z.object({
      scene,
      layer: layer.optional().describe('a layer, by its name or its id; the map when left out'),
      rect: rect.optional().describe(`a tile layer's cells read, [c0, r0, c1, r1], its corners in it; its bounds when left out; at most ${READ}`),
    }).describe(`The map as the Tiles panel shows it: its size, tilesets, layers, a tile layer's cells as the rectangle [c0, r0, c1, r1] they lie in, its corners in it, or null for none, the names a tile layer may have and the Tiled project's classes; or a tile layer's cells over a rectangle, by gid, with its flipped cells, the cells the game has changed and each tile shown; or an object layer's objects. ${OUTLINE}`),
    run: async ({ scene, layer: which, rect: r }) => {
      const m = await mapIn(ed, scene)
      const { doc, tiled } = await docOf(ed, m)
      if (which === undefined) return overview(doc, tiled, layerNames(render2dOf(ed, scene)), await typesOf(ed), m)
      const f = layerIn(doc.map, which)
      if (f.layer.type === 'tilelayer') return cellsRead(doc, tiled, f, r, m.edits)
      if (r) throw new Error(`${f.layer.name} is no tile layer, and has no cells to read over a rectangle`)
      if (f.layer.type === 'objectgroup') return { layer: { id: f.layer.id, name: f.layer.name }, objects: outlined((f.layer.objects ?? []).map(o => ({ ...o, kind: kindOf(o) }))) }
      return { layer: without(f.layer, 'layers'), ...(f.layer.type === 'group' && { layers: (f.layer.layers ?? []).map(l => ({ id: l.id, name: l.name, type: l.type })) }) }
    },
  })
  ed.command({
    id: 'tiles.paint',
    title: 'Tiles: paint',
    input: z.object({
      scene,
      layer: layer.describe('the tile layer'),
      gid: z.number().int().min(1).optional().describe('the tile, by its gid; left out with erase'),
      flips: z.number().int().min(0).max(7).optional().describe('Tiled\'s flip bits: 4 along x, 2 along y, 1 across the diagonal'),
      cells: z.array(cell.describe('[c, r]')).min(1).optional().describe('the cells painted, as a stroke of Paint'),
      fill: cell.optional().describe('or the cell Fill floods from, through the cells joined to it that hold what it holds'),
      erase: z.boolean().optional().describe('true: the cells, or the fill, emptied'),
    }).describe('One stroke of the Tiles panel\'s Paint, Erase or Fill on a tile layer: one undo. Answers how many cells changed and the layer\'s cells about them.'),
    run: async ({ scene, layer: which, gid, flips, cells: list, fill, erase = false }, e) => {
      if (!list === !fill) throw new Error('tiles.paint paints a list of cells or fills from one: name cells or fill, and not both')
      if (erase ? gid !== undefined || flips !== undefined : gid === undefined) throw new Error(erase ? 'an erase empties cells, and takes no gid or flips' : 'name the tile painted by its gid, or erase')
      const m = await mapIn(ed, scene)
      return write(e, m, (d, tiled) => {
        const f = layerIn(d.map, which, ['tilelayer'])
        if (gid !== undefined && !tiled.tiles[gid]) throw new Error(`the map has no tile ${gid}: its tilesets' gids are ${gidsOf(tiled)}`)
        const at = list ?? [fill!]
        if (!d.map.infinite) {
          const off = at.find(([c, r]) => c < 0 || r < 0 || c >= d.map.width || r >= d.map.height)
          if (off) throw new Error(`cell [${off.join(', ')}] is off the map, which is ${d.map.width} × ${d.map.height} cells`)
        }
        const doc = strokeOn(d, { tool: fill ? 'fill' : erase ? 'erase' : 'paint', raw: erase ? 0 : rawOf(gid!, flips ?? 0), layer: f.layer.id, cells: at as V2[] })
        const before = f.layer, after = layerIn(doc.map, f.layer.id).layer
        const changed: V2[] = []
        const [bx, by, bw, bh] = bounds(after)
        for (let r = by; r < by + bh; r++) for (let c = bx; c < bx + bw; c++) if (cellOf(before, c, r) !== cellOf(after, c, r)) changed.push([c, r])
        const box = changed.length ? [Math.min(...changed.map(c => c[0])), Math.min(...changed.map(c => c[1])), Math.max(...changed.map(c => c[0])), Math.max(...changed.map(c => c[1]))] : undefined
        const read = box && (box[2] - box[0] + 1) * (box[3] - box[1] + 1) <= READ ? cellsRead(doc, tiled, layerIn(doc.map, f.layer.id), box, {}) : undefined
        return { doc, answer: { scene, layer: { id: f.layer.id, name: f.layer.name }, changed: changed.length, ...(read && { cells: read }) } }
      })
    },
  })
  ed.command({
    id: 'tiles.tile',
    title: 'Tiles: tile',
    input: z.object({
      scene,
      tileset: z.string().describe('the tileset, by its name'),
      id: z.number().int().min(0).describe('the tile, by its id in the tileset'),
      class: z.string().optional().describe('its class; \'\' for none'),
      collision: z.enum(PRESETS.map(p => p.id) as [string, ...string[]]).optional().describe(PRESETS.map(p => `${p.id}: ${p.title}`).join('; ')),
      oneWay: z.boolean().optional().describe('its collision one-way along its top'),
    }).describe('Sets a tile\'s class, collision and one-way in its tileset, as the Tiles panel\'s Tile section does: one undo. Answers the tile.'),
    run: async ({ scene, tileset, id, class: cls, collision, oneWay }, e) => {
      if (cls === undefined && collision === undefined && oneWay === undefined) throw new Error('hand a class, a collision or oneWay to set')
      const m = await mapIn(ed, scene)
      const classes = tileClasses(await typesOf(ed)).map(t => t.name)
      return write(e, m, (d, tiled) => {
        const k = tiled.tilesets.findIndex(s => s.name === tileset)
        if (k < 0) throw new Error(`the map has no tileset ${tileset}: its tilesets are ${tiled.tilesets.map(s => s.name).join(', ')}`)
        const tile = Object.values(tiled.tiles).find(t => t.tileset === k && t.id === id)
        if (!tile) throw new Error(`${tileset} has no tile ${id}: its tiles are 0 to ${tiled.tilesets[k].count - 1}`)
        const ref = refsOf(d.map, m.url)[k]
        const had = setOf(d, ref).tiles?.find(t => t.id === id)
        if (cls !== undefined && cls !== '' && classes.length && cls !== classOf(had ?? { id }) && !classes.includes(cls))
          throw new Error(`the Tiled project has no tile class ${cls}: its tile classes are ${classes.join(', ')}`)
        const shaped = collision !== undefined ? collision !== 'none' : !!had?.objectgroup?.objects.length
        if (oneWay !== undefined && !shaped) throw new Error(`tile ${id} of ${tileset} has no collision to make one-way: give it a collision first`)
        const doc = tileSet(d, ref, id, tile.box[2], tile.box[3], { class: cls, collision, oneWay })
        const entry = setOf(doc, ref).tiles?.find(t => t.id === id)
        return { doc, answer: { scene, tileset, id, gid: tile.gid, class: classOf(entry ?? { id }), collision: presetOf(entry, tile.box[2], tile.box[3]), oneWay: !!entry?.objectgroup?.objects.length && entry.objectgroup.objects.every(o => classOf(o) === 'top'), entry: entry ?? { id } } }
      })
    },
  })
  ed.command({
    id: 'tiles.layer',
    title: 'Tiles: layer',
    input: z.object({
      scene,
      op: z.enum(['add', 'set', 'move', 'remove']).describe('add a layer, set a layer\'s fields, move it among its siblings, or take it out'),
      layer: layer.optional().describe('the layer set, moved or taken out, or the one added after; the last when left out'),
      type: z.enum(['tiles', 'objects']).optional().describe('the layer added'),
      name: z.string().optional().describe('its name: a tile layer\'s one of render2d\'s layers'),
      visible: z.boolean().optional().describe('visible in the game'),
      opacity: z.number().optional().describe('0 to 1'),
      offset: z.array(z.number()).length(2).optional().describe('[x, y] in pixels'),
      by: z.union([z.literal(-1), z.literal(1)]).optional().describe('-1 moves it down, 1 up'),
    }).describe('Adds a tile or object layer, sets a layer\'s name, visibility, opacity and offset, moves it, or takes it out, as the Tiles panel\'s Layers section does: one undo. Answers the layers.'),
    run: async ({ scene, op, layer: which, type, name, visible, opacity, offset, by }, e) => {
      const m = await mapIn(ed, scene)
      const names = layerNames(render2dOf(ed, scene))
      const fields = { name, visible, opacity, offset }
      const given = Object.entries({ type, ...fields, by }).filter(([, v]) => v !== undefined).map(([k]) => k)
      const takes = ({ add: ['type', 'name'], set: ['name', 'visible', 'opacity', 'offset'], move: ['by'], remove: [] } as Record<string, string[]>)[op]
      const odd = given.filter(k => !takes.includes(k))
      if (odd.length) throw new Error(`${op} takes ${takes.length ? takes.join(', ') : 'nothing but the layer'}, and not ${odd.join(', ')}`)
      if (op !== 'add' && which === undefined) throw new Error(`name the layer to ${op}`)
      return write(e, m, d => {
        const layers = () => flat(doc.map).map(f => ({ id: f.layer.id, name: f.layer.name, type: f.layer.type, depth: f.depth }))
        let doc = d
        if (op === 'add') {
          if (!type) throw new Error('name the type of the layer added: tiles or objects')
          const after = which === undefined ? undefined : layerIn(d.map, which).path
          const free = freeTileNames(d.map, names)
          if (type === 'tiles' && !free.length) throw new Error('each of render2d\'s layers has a tile layer: a tile layer is drawn on the render2d layer its name names, one to each')
          if (type === 'tiles' && name !== undefined && !free.includes(name)) throw new Error(`a tile layer is named for a render2d layer no tile layer has: they are ${free.join(', ')}`)
          const made = layerAdded(d, type === 'tiles' ? 'tilelayer' : 'objectgroup', after, names, name)
          doc = made.doc
          return { doc, answer: { scene, added: made.id, layers: layers() } }
        }
        const f = layerIn(d.map, which!)
        if (op === 'remove') {
          doc = layerRemoved(d, f.layer.id)
          return { doc, answer: { scene, removed: f.layer.id, layers: layers() } }
        }
        if (op === 'move') {
          if (by === undefined) throw new Error('name how it moves: by -1, down, or 1, up')
          const i = f.path[f.path.length - 1], n = f.path.length === 1 ? d.map.layers.length : layerAt(d.map, f.path.slice(0, -1)).layers!.length
          if (i + by < 0 || i + by >= n) throw new Error(`${f.layer.name} is ${by < 0 ? 'the lowest' : 'the highest'} of its siblings already`)
          doc = layerMoved(d, f.layer.id, by)
          return { doc, answer: { scene, moved: f.layer.id, layers: layers() } }
        }
        if (!given.length) throw new Error('hand a name, visible, opacity or offset to set')
        if (name !== undefined && f.layer.type === 'tilelayer' && name !== f.layer.name && !names.includes(name))
          throw new Error(`a tile layer is named for one of render2d's layers: they are ${names.join(', ')}`)
        if (opacity !== undefined && !OPACITY.safeParse(opacity).success) throw new Error(`an opacity is 0 to 1, not ${opacity}`)
        doc = layerSet(d, f.layer.id, l => ({
          ...l, ...(name !== undefined && { name }), ...(visible !== undefined && { visible }), ...(opacity !== undefined && { opacity }),
          ...(offset && { offsetx: offset[0], offsety: offset[1] }),
        }))
        return { doc, answer: { scene, layer: without(layerIn(doc.map, f.layer.id).layer, 'layers', 'objects', 'data', 'chunks'), layers: layers() } }
      })
    },
  })
  ed.command({
    id: 'tiles.object',
    title: 'Tiles: object',
    input: z.object({
      scene,
      layer: layer.describe('the object layer'),
      id: z.number().int().optional().describe('the object set or taken out; a new one is placed when left out'),
      object: z.record(z.string(), z.unknown()).nullable().describe('every field it is to have: x, y, name?, type?, width?, height?, rotation?, visible?, point? | ellipse? | polygon? | polyline? [{x, y}] | gid?, properties? [{name, type, value}]; null takes it out'),
    }).describe('Places an object on an object layer, sets its fields, or takes it out, as the Tiles panel\'s object tools and Objects section do: one undo; a class held to the Tiled project\'s. Answers the object.'),
    run: async ({ scene, layer: which, id, object }, e) => {
      const m = await mapIn(ed, scene)
      const types = await typesOf(ed)
      const classes = objectClasses(types).map(t => t.name)
      return write(e, m, (d, tiled) => {
        const f = layerIn(d.map, which, ['objectgroup'])
        const objs = f.layer.objects ?? []
        const had = id === undefined ? undefined : objs.find(o => o.id === id)
        if (id !== undefined && !had) throw new Error(`${f.layer.name} has no object ${id}: its objects are ${objs.map(o => o.id).join(', ') || 'none'}`)
        if (object === null) {
          if (id === undefined) throw new Error('name the object taken out by its id')
          return { doc: withoutObject(d, f.layer.id, id), answer: { scene, layer: f.layer.id, removed: id } }
        }
        const o = { ...object, ...(had && { id: had.id }) } as TObject
        const shaped = changedIssue(OBJECT, had, o)
        if (shaped) throw new Error(`the object ${shaped.at ? `${shaped.at} ` : ''}${shaped.message}`)
        const cls = o.type ?? o.class
        if (cls && classes.length && cls !== (had && classOf(had)) && !classes.includes(cls)) throw new Error(`the Tiled project has no object class ${cls}: its object classes are ${classes.join(', ')}`)
        if (o.gid !== undefined && o.gid !== had?.gid && !tiled.tiles[o.gid & GID]) throw new Error(`the map has no tile ${o.gid}: its tilesets' gids are ${gidsOf(tiled)}`)
        // A property of a type the project names, an enum's value one of its values, as its field offers them.
        const kept = new Set((had?.properties ?? []).map(q => JSON.stringify(q)))
        for (const q of o.properties ?? []) {
          if (kept.has(JSON.stringify(q)) || q.propertytype === undefined) continue
          const t = types.find(x => x.name === q.propertytype)
          if (!t) throw new Error(`property ${q.name} is of type ${q.propertytype}, which the Tiled project has not got: its types are ${types.map(x => x.name).join(', ') || 'none'}`)
          const values = t.values
          if (values && !(t.storageType === 'int' ? Number.isInteger(q.value) && (q.value as number) >= 0 && (q.value as number) < values.length : values.includes(q.value as string)))
            throw new Error(`property ${q.name} is a ${t.name}, whose values are ${t.storageType === 'int' ? values.map((v, i) => `${i} (${v})`).join(', ') : values.join(', ')}, and not ${JSON.stringify(q.value)}`)
        }
        const made = had ? { doc: objectSet(d, f.layer.id, had.id, () => o), id: had.id } : objectAdded(d, f.layer.id, o)
        return { doc: made.doc, answer: { scene, layer: f.layer.id, object: layerIn(made.doc.map, f.layer.id).layer.objects!.find(x => x.id === made.id) } }
      })
    },
  })
  ed.command({
    id: 'tiles.resize',
    title: 'Tiles: resize',
    input: z.object({
      scene,
      cols: SIZE.describe('its columns'),
      rows: SIZE.describe('its rows'),
    }).describe('Makes the map cols by rows cells, every tile layer cut or grown at its right and bottom, its objects where they are, as the Tiles panel\'s Map section does: one undo. Answers each tile layer\'s cells, [c0, r0, c1, r1], its corners in it.'),
    run: async ({ scene, cols, rows }, e) => {
      const m = await mapIn(ed, scene)
      return write(e, m, d => {
        if (d.map.infinite) throw new Error('the map is infinite: it grows where it is painted, and has no size to set')
        const doc = resized(d, cols, rows)
        return { doc, answer: { scene, cols, rows, layers: flat(doc.map).filter(f => f.layer.type === 'tilelayer').map(f => ({ id: f.layer.id, name: f.layer.name, cells: rectOf(f.layer) })) } }
      })
    },
  })
}
