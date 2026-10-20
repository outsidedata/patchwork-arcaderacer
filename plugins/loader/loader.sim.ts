// The sim half of loader. The catalogue is the scene's `world.loader.assets`: a name, a url, a type
// and whether it is fetched the moment the loader row exists. It never changes, so no row carries it
// and no packet sends it; a child of the scenemanager takes the manager's `world.loader` unless it
// gives its own. The `loader` row is empty: it is there so `before` and `prepare` run, and so each
// truth's asks are remembered once for it. This half gets the same bytes the browser half
// does and keeps them for the life of the process: a file has one content, so the process holds one
// copy of its bytes and one decoded copy of it, which every truth's rules and every actor's `def`
// read. What the browser half decodes from them is each client's own (`loader.plugin.ts`).
//
// A url in the catalogue, and a page or a file named inside one, is a plain path from the folder the
// dev server serves, which is the working directory, written as the file is named: a space is a
// space and a `%` is a `%`. A path a file names is read from that file's own folder. It is encoded
// once, with `encodeURI`, where it is fetched, and never decoded. In a tab — index.html holds the
// truths, so this file runs in the browser too — the page has a `location` and the encoded url is
// fetched. In node there is no page to resolve it against, so the file at that path under the
// working directory is read. The files a file names, a multipack's packs or a map's tilesets, are
// fetched together once it has landed.
//
// A wad is many files sealed into one, so art whose licence forbids handing it on is never at rest
// as itself: in the repo, on the server, or in a player's cache. `world.loader.wads` lists the wads a
// scene reads, each a url as an entry's is. Each is fetched once per process and opened in memory,
// and every file in it is then at its own path, its name in the wad read from the wad's folder: a
// wad at `/games/g/assets/art.wad` holding `hero.png` holds `/games/g/assets/hero.png`. From then on
// every read of that path, a catalogue entry's url, a sheet's page, a map's tileset or image, a font's
// page or a file `beside` an entry, is handed the wad's bytes and never fetched, by both halves, in a
// tab and in node. A path no wad holds is fetched as ever. Every read waits for the wads that have
// started opening, so one started before the first read is open before anything is read: `prepare`
// and `before` start them, and the browser half on its first tick. A wad that cannot be fetched or
// opened fails `prepare`, its reason starting `loader wad <url>: `, and is fetched again the next time
// one is asked to open it; the reads waiting on it go on as if it held nothing. Two wads holding one
// path: the one opened last is read. `seal` makes a wad of files by name, `unseal` opens one.
//
// A wad is `PWAD`, a version byte (1), twelve bytes of IV and the rest AES-GCM over its contents with
// `SEAL`, the one key every wad is sealed with, which ships with core. Its contents are four bytes,
// little-endian, the length of a JSON list `[[name, length], ...]`, then that list, then each file's
// bytes in its order. The IV is the first twelve bytes of the contents' SHA-256, so the same files make
// the same wad, byte for byte, and two different wads never share an IV. This hides the files and no
// more: the key ships with every game, and a page decodes the pictures onto its GPU, where they can be
// read. It is WebCrypto's (`crypto.subtle`), which a tab has only on https or localhost.
//
// A fetch that fails rejects, and the url is forgotten, so the next ask fetches it again: the next
// `prepare`, or a test's `jsonAt`. What the steps ask is remembered per loader row instead:
// `before` starts the row's preloads once, on its first step, and `load(w, name)`, a rule starting
// a file it does not preload, starts that name once for the row, the first time its rules ask. So a
// rule may ask on every step until `ready`, and a file that fails is fetched and reported once for
// the row, not once a step; a new loader row, a scene booted again, asks again. `fetched` reads a
// url once more and keeps nothing: the browser half's models and sounds, which no rule reads and
// each client decodes from bytes of its own.
//
// Six types are files a rule reads, and this half decodes them, once per url, for every rule and
// actor in the process: `json`, `sheet`, `palette`, `tilemap`, `pixels` and `binary`. A rule reads one handed its `w`,
// an actor handed its `plugins.wire`. A rule reads a file on whatever step it needs it, and the step
// cannot wait for a fetch, so the files are here before the first step: `prepare`, handed the loader
// row, resolves once every `preload` entry of those six types has landed, with every other file it
// names, and the scenemanager addon awaits it before it boots a scene and before a page makes a
// scene's client, so the page's actors find the files there from their first frame. A file that is
// fetched but cannot be decoded fails `prepare` with the reason, so a broken file stops the scene
// before its first step rather than on the step that reads it. Another kind's own `prepare`, which
// runs beside the loader's and not after it, awaits a file its first step reads with
// `prepared(world, name)`, the decoded entry once it has landed.
//
// `binary` is a file read byte for byte, in a format of its own that no other type decodes: a ROM, a
// disk image, a compiled module. `binary` hands its bytes as a `Uint8Array` over the process's one
// copy of them, which nothing writes into. A file written while the game runs hands its new bytes
// from the next call on, so a rule asks each time it reads rather than keeping the array.
//
// `json` is a data file: a table of definitions, anything a rule reads that never changes, so no
// row has to carry it to every seat every step. `json` hands the parsed file. A scene's definitions
// are one such file, named by the scene's `world.defs`, with an entry per kind: every number of that
// kind that never changes. `def` reads one. The row keeps what changes, so a row is its state and
// nothing else, and every knob of a kind is in one place.
//
// `pixels` is a PNG read as data, not drawn: a level's heights, a saved city, anything a rule reads
// a value a pixel from. `pixels` hands `{ width, height, data, text }`: `data` every pixel as red,
// green, blue and alpha from 0 to 255, a row at a time from the top, byte for byte as the file holds
// it, whatever its colour type, bit depth, filters and interlacing, a 16-bit sample read as its high
// byte; and `text` the file's text chunks by keyword, `tEXt`, `zTXt` and `iTXt` alike. It is decoded
// here, never by a canvas: a canvas multiplies a colour by its alpha and back, so a pixel of alpha 0
// comes back black and one of alpha 1 comes back rounded, and a value stored in a channel is lost.
// `encodePng` writes the same shape back as an 8-bit RGBA PNG with its text as `iTXt`, so what
// `decodePng` reads of it is what was written, pixel for pixel and word for word.
//
// `palette` is a GIMP palette, a `.gpl`: the line `GIMP Palette`, then `Name:` and `Columns:` lines,
// `#` comments and blank lines, which are skipped, and a colour a line, `R G B` from 0 to 255 and
// its name after them. `palette` hands the colours as 0xRRGGBB, in the order the file lists them.
//
// `sheet` is a sprite sheet: frames cut from page images, and clips that play them. Two files are
// sheets:
//
//   An Aseprite or TexturePacker JSON: `frames`, a list (JSON-Array) or an object by name
//   (JSON-Hash), and `meta`, whose `image` is its page. A frame's id is its `filename` (its key in a
//   hash); `frame` is where it is on the page, turned a quarter clockwise there when `rotated`;
//   `spriteSourceSize` and `sourceSize`, when it is `trimmed`, where the pixels kept are in the
//   whole frame; `pivot`, a fraction of the whole frame, is its anchor, and a pivot outside 0..1
//   is an anchor outside the frame; `duration` is how many milliseconds it shows. Each
//   `meta.frameTags` entry is a clip of the frames `from` to `to`, played `direction` (`forward`,
//   `reverse`, `pingpong`, `pingpong_reverse`), round forever or `repeat` times, a number or a
//   string, 0 or left out being forever; of a ping-pong, each pass one way is one time. Each of
//   `animations`, beside `frames` (TexturePacker's, where PixiJS reads it), is a clip of the frames
//   it names, played forward, round forever. A clip named `<clip>@<k>` is run k of `<clip>`, so a
//   clip with runs for eight facings is eight tags. `meta.slices` are Aseprite's slices by name,
//   each a list of keys `{ frame, bounds, pivot?, center? }`: from frame `frame` of the file's order
//   on, until the next key, the slice is `bounds` in the whole frame, with `pivot` a point from the
//   bounds' top left and `center` the middle a nine-slice stretches. `meta.related_multi_packs`
//   names the other packs of a multipack, each read as this one is, its image the next page.
//   A Tiled tileset, a `.tsj`: each tile is a frame, its id the tile's id, cut from the tileset's
//   image by `columns`, `margin` and `spacing`, or its own `image` in a tileset of images. It
//   stands on the point Tiled stands a tile object on, `objectalignment` (`unspecified` being
//   bottom-left), moved by `tileoffset`. Every tile with a Tiled `type` (`class` before Tiled 1.10)
//   is a clip named by that type, the first tile of a type when there are several: its
//   `animation`, round forever, when it has one, and else the tile alone, still. A tile with an
//   animation and no type is a clip named by its id. So a tile can be drawn as a sprite.
//
// A clip whose frames carry no `duration` is not timed: a rule picks its frames one by one, or a
// particle spreads them over its life.
//
// What the catalogue entry of a sheet says of it, beside its url: `nearest`, pixel art, every page
// drawn with nearest filtering and on whole pixels; `facing`, which way each run of a clip faces;
// and `palette`, the name of a `palette` entry, the colours the sheet is drawn in, which a row may
// swap for another palette's (sprite2d). Aseprite drops what it does not know from a file it
// writes, so these are the catalogue's and never the file's.
//
// `sheet` hands either in one shape, a `Sheet`:
//
//   pages    each page, a plain path from the working directory.
//   frames   by id, each `{ id, page, box, rotated, size, trim, anchor }`: `box` is [x, y, w, h],
//            the pixels on the page as they lie there; `rotated`, they lie turned a quarter
//            clockwise, so `box` is the upright picture's height across and its width down; `size`
//            [w, h] is the whole frame upright, and `trim` [x, y, w, h] where the pixels kept lie in
//            it; `anchor` is the point of the whole frame, in pixels from its top left, that stands
//            on the place the frame is drawn at, a thing's feet. A pivot a whole pixel to within a
//            millionth is that whole pixel.
//   order    the frame ids in the file's order, a multipack's packs one after another, which a
//            slice's keys count frames in.
//   clips    by name, each `{ runs, loop, durations? }`: `runs` a list of frame ids per facing, each
//            the frames in the order they play, a ping-pong's way back and every repeat written out;
//            `loop`, round again after the last, else held on it; `durations`, the seconds each place
//            of a run shows, when the file times its frames.
//   slices   by name, each a list of keys `{ frame, bounds, pivot?, center? }`, `bounds` and
//            `center` [x, y, w, h] and `pivot` [x, y]: from frame `order[frame]` on, until the next
//            key, the slice is `bounds` in the whole frame, so a point p of it stands p − `anchor`
//            from the anchor as the frame is drawn. Only Aseprite writes them; every other sheet
//            has none.
//   facing   `{ first, step, mirror }`: run k faces `first` + k × `step` of a whole turn,
//            counter-clockwise from facing right on the screen, and with `mirror` a way no run faces
//            is drawn as the run facing its mirror image across the up-down line, flipped. Left
//            out, a clip's one run faces right and nothing is mirrored.
//   nearest, palette  as the entry says.
//
// The questions below are what a rule and the browser half both ask of it: which run faces a way and
// whether it is mirrored (`pick`), a frame of a clip (`frameOf`), how a clip moves on (`play`), how
// long it lasts (`span`), and how far a frame reaches each way from its anchor as it is drawn
// (`reach`).
//
// `tilemap` is a Tiled map, a `.tmj`, with its tilesets, embedded or `.tsj` files beside it. A `.tmx`
// or a `.tsx` is refused: Tiled saves the same map as JSON. `tiled` hands it as a `Tiled`, below, in
// which a tile is named by its gid, its tileset's `firstgid` plus its id. Read:
//
//   the map: `orientation`, `orthogonal` or `isometric` (a staggered or hexagonal map is refused, as
//     render2d's `ground` lays a world out on straight lines); `width` and `height` in cells,
//     `tilewidth` and `tileheight` in pixels; `infinite`; `backgroundcolor`, as 0xRRGGBB, or null
//     when it has none; `renderorder`; `properties`.
//   tilesets, and every tile of them in `tiles` by gid: its page and its box there, its Tiled `type`
//     (`class` before 1.10) or '', its properties, its `animation` of gids and milliseconds, and its
//     collision `shapes`, the rectangles and convex polygons of its `objectgroup`, each a convex
//     list of points in the tile's own pixels going round clockwise on the screen, one whose type is
//     `top` one-way. A tileset drawing its tiles at the grid's size, not their own, is refused.
//   layers, bottom first, groups flattened into them: each keeps its own `name`; its offsets are its
//     groups' added to its own, in pixels on the screen in `offset` and in cells in `shift`, which is
//     where everything on it is; its parallax factors are multiplied down; its opacity too;
//     it is visible only when every group over it is; and its tint is multiplied down, as 0xRRGGBB,
//     or null for none. A tile layer holds `data`, the gid of each cell a row at a time, 0 for none,
//     and `flips` beside it, each cell's flip bits: 4 horizontal, 2 vertical, 1 diagonal, as Tiled
//     writes them over the gid; its cells are read from a CSV list or base64, uncompressed or zlib,
//     gzip or zstd, and an infinite map's chunks are laid into one grid whose first cell is [x, y].
//     An image layer holds its `image`, a plain path, and `repeat` [x, y]. An object layer holds its
//     objects: `id`, `name`, `type` (`class` before 1.10; a tile object's own, or its tile's), `x`,
//     `y`, `w`, `h`, the box's top left and size, in cells, a tile object's too, which Tiled places
//     by its bottom; `polygon` or `polyline`, points from `x`, `y` in cells; `point` or `ellipse`;
//     for a tile object its gid in `tile` and flip bits in `flip`; and `properties`, a tile
//     object's own over its tile's. Every object has the layer's offset in it. An object that is
//     rotated or made from a template is refused.
//
// A cell is 1 across and 1 down: a point [x, y] of the world is in cells, x along a row and y down
// the rows. An orthogonal map's pixels are `tilewidth` across and `tileheight` down a cell; an
// isometric map's objects are `tileheight` pixels a cell both ways, as Tiled writes them, and an
// offset on its screen goes on a cell's diamond.
//
// The editor writes a file while the game runs: `written` hands this half the file's new text, or a
// `pixels` file's new bytes, which become its bytes, and every decoded copy that read that url — a
// json, a palette, a sheet or a pack of it, a map or a tileset of it, a picture — is refilled in place from it, so every rule and actor
// already holding one reads what the file now says. A file the new text names that the process does
// not hold yet is fetched first. `holds(url)` says whether the process has read the file. A picture
// this half never reads, a sheet's page, written on the machine is `rewritten`: `writes(url)` counts
// both, and the browser half fetches a picture written since the process began anew by that count,
// as a renderer keeps a picture it has decoded by its url.
import type { Kind, Row, W } from '#engine/engine.ts'
import type { Wire } from '#engine/browser.ts'
import type { Prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Memory } from '#addons/rewind/rewind.addon.ts'
import { gunzipSync, unzlibSync, zlibSync } from 'fflate'
import { decompress as unzstd } from 'fzstd'

export type Frame = {
  id: string
  page: number
  box: [number, number, number, number]
  rotated: boolean
  size: [number, number]
  trim: [number, number, number, number]
  anchor: [number, number]
}
export type Clip = { durations?: number[]; loop: boolean; runs: string[][] }
export type Facing = { first: number; step: number; mirror: boolean }
type Box = [number, number, number, number]
export type Slice = { frame: number; bounds: Box; pivot?: [number, number]; center?: Box }
export type Sheet = {
  pages: string[]
  nearest: boolean
  facing: Facing
  palette?: string
  frames: Record<string, Frame>
  order: string[]
  clips: Record<string, Clip>
  slices: Record<string, Slice[]>
}

// A picture read as data: `width` × `height` pixels, a row at a time from the top, each red, green,
// blue and alpha from 0 to 255, alpha not multiplied in; and the file's text chunks by keyword.
export type Pixels = { width: number; height: number; data: Uint8ClampedArray; text: Record<string, string> }

// A catalogue entry.
export type Entry = {
  type: string; url: string; preload?: boolean; for?: string; nearest?: boolean; facing?: Partial<Facing>; palette?: string
  space?: 'linear'; wrap?: 'repeat'; anisotropy?: number
}

export type Props = Record<string, unknown>
export type Shape = { points: [number, number][]; top: boolean }
export type Tile = {
  gid: number
  tileset: number
  id: number
  page: string
  box: [number, number, number, number]
  type: string
  properties: Props
  shapes: Shape[]
  animation?: { tile: number; duration: number }[]
}
export type Tileset = { name: string; firstgid: number; count: number; tilewidth: number; tileheight: number; offset: [number, number]; source: string }
type Common = { name: string; visible: boolean; opacity: number; tint: number | null; offset: [number, number]; shift: [number, number]; parallax: [number, number]; properties: Props }
export type TileLayer = Common & { kind: 'tiles'; x: number; y: number; width: number; height: number; data: number[]; flips: number[] }
export type ImageLayer = Common & { kind: 'image'; image: string; repeat: [boolean, boolean] }
export type TiledObject = {
  id: number
  name: string
  type: string
  x: number
  y: number
  w: number
  h: number
  polygon?: [number, number][]
  polyline?: [number, number][]
  point?: true
  ellipse?: true
  tile?: number
  flip?: number
  visible: boolean
  properties: Props
}
export type ObjectLayer = Common & { kind: 'objects'; objects: TiledObject[] }
export type Layer = TileLayer | ImageLayer | ObjectLayer
export type Tiled = {
  url: string
  orientation: 'orthogonal' | 'isometric'
  renderorder: 'right-down' | 'right-up' | 'left-down' | 'left-up'
  width: number
  height: number
  tilewidth: number
  tileheight: number
  infinite: boolean
  background: number | null
  properties: Props
  tilesets: Tileset[]
  tiles: Record<string, Tile>
  layers: Layer[]
}

// Tiled's flip bits over a gid, and the bits that are the gid.
export const FLIPS = 0xe0000000
export const GID = 0x0fffffff

// The files a decode read that have not landed.
class Missing extends Error {
  readonly urls: string[]
  constructor(urls: string[]) {
    super(`${urls.join(', ')} has not landed`)
    this.urls = urls
  }
}

// `f` of each of a list, where every file any of them read that has not landed is missing together,
// so a multipack's packs and a map's tilesets are fetched at once, not one landing at a time.
function each<T, U>(list: T[], f: (x: T, i: number) => U): U[] {
  const missing: string[] = []
  const out = list.map((x, i) => {
    try {
      return f(x, i)
    } catch (e) {
      if (!(e instanceof Missing)) throw e
      missing.push(...e.urls)
      return undefined as U
    }
  })
  if (missing.length) throw new Missing(missing)
  return out
}

// The types this half decodes, which a rule reads.
const DECODED = ['json', 'sheet', 'palette', 'tilemap', 'pixels', 'binary']

const bytes = new Map<string, ArrayBuffer>()
const taking = new Map<string, Promise<void>>()
// The process's one decoded copy of each entry, by its type, url and what the entry says of it, and
// every url the decode read.
const made = new Map<string, { entry: Entry; value: any; urls: string[] }>()

// A tab, which has a `location`, or node, which has none. The browser half asks this too.
export const inPage = () => typeof location !== 'undefined'

// The bytes of the file at `url`, read once more: a wad's own when one holds it, else fetched in a
// tab and read from disk in node.
export async function fetched(url: string): Promise<ArrayBuffer> {
  const own = await sealed(url)
  return own ?? stored(url)
}

// The bytes of the file at `url` where it is stored: fetched in a tab, read from disk in node.
async function stored(url: string): Promise<ArrayBuffer> {
  if (inPage()) {
    const res = await fetch(encodeURI(url))
    if (!res.ok) throw new Error(`loader could not fetch ${url}: ${res.status}`)
    return res.arrayBuffer()
  }
  const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')])
  const file = await fs.readFile(path.join(process.cwd(), url)).catch(e => { throw new Error(`loader could not read ${url}: ${e.code}`) })
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer
}

// The key every wad is sealed with.
const SEAL = new Uint8Array([
  0x5b, 0x1e, 0xc4, 0x93, 0x27, 0xa8, 0x6f, 0xd0, 0x3a, 0x81, 0xe9, 0x54, 0x0c, 0xb7, 0x62, 0xf5,
  0x98, 0x2d, 0x47, 0xbe, 0x13, 0xca, 0x7e, 0x05, 0xe1, 0x6b, 0x9f, 0x38, 0xd4, 0x40, 0xa3, 0x76,
])
const MAGIC = [0x50, 0x57, 0x41, 0x44] // PWAD
const VERSION = 1
const IV = 12

const sealKey = () => crypto.subtle.importKey('raw', SEAL, 'AES-GCM', false, ['encrypt', 'decrypt'])

// A wad of `files`, each by its name from the wad's folder.
export async function seal(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  const names = Object.keys(files)
  for (const name of names) if (!name || name.startsWith('/') || name.split('/').some(part => part === '..' || part === '.' || part === '')) {
    throw new Error(`a wad holds files by their names from its folder, and ${JSON.stringify(name)} is not one`)
  }
  const index = new TextEncoder().encode(JSON.stringify(names.map(name => [name, files[name].byteLength])))
  const contents = new Uint8Array(4 + index.byteLength + names.reduce((n, name) => n + files[name].byteLength, 0))
  new DataView(contents.buffer).setUint32(0, index.byteLength, true)
  contents.set(index, 4)
  let at = 4 + index.byteLength
  for (const name of names) {
    contents.set(files[name], at)
    at += files[name].byteLength
  }
  const iv = new Uint8Array(await crypto.subtle.digest('SHA-256', contents)).slice(0, IV)
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(), contents))
  const wad = new Uint8Array(MAGIC.length + 1 + IV + sealed.byteLength)
  wad.set(MAGIC, 0)
  wad[MAGIC.length] = VERSION
  wad.set(iv, MAGIC.length + 1)
  wad.set(sealed, MAGIC.length + 1 + IV)
  return wad
}

// The files a wad holds, each by its name from the wad's folder.
export async function unseal(wad: Uint8Array): Promise<Record<string, Uint8Array>> {
  if (wad.byteLength < MAGIC.length + 1 + IV || MAGIC.some((b, i) => wad[i] !== b)) throw new Error('it is not a wad')
  if (wad[MAGIC.length] !== VERSION) throw new Error(`it is a wad of version ${wad[MAGIC.length]}, and this opens version ${VERSION}`)
  const iv = wad.slice(MAGIC.length + 1, MAGIC.length + 1 + IV)
  let contents: Uint8Array
  try {
    contents = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await sealKey(), wad.slice(MAGIC.length + 1 + IV)))
  } catch {
    throw new Error('it does not open with the key: it was sealed with another, or it is damaged')
  }
  const length = new DataView(contents.buffer, contents.byteOffset).getUint32(0, true)
  const index: [string, number][] = JSON.parse(new TextDecoder().decode(contents.subarray(4, 4 + length)))
  const files: Record<string, Uint8Array> = {}
  let at = 4 + length
  for (const [name, n] of index) {
    files[name] = contents.slice(at, at + n)
    at += n
  }
  return files
}

// Each wad opening or open, by its url, and every file the open ones hold, by its path.
const wads = new Map<string, Promise<void>>()
const unsealed = new Map<string, ArrayBuffer>()

// Starts opening every wad `world.loader.wads` names that is not open or opening, and resolves once
// each has opened; it rejects with the first that cannot be, which is started again on the next ask.
export function mount(world: Record<string, any>): Promise<void> {
  const urls: string[] = world.loader?.wads ?? []
  return Promise.all(urls.map(url => {
    const had = wads.get(url)
    if (had) return had
    const opening = stored(url)
      .then(b => unseal(new Uint8Array(b)))
      .then(files => { for (const [name, file] of Object.entries(files)) unsealed.set(beside(url, name), file.buffer as ArrayBuffer) })
      .catch(e => {
        wads.delete(url)
        throw new Error(`loader wad ${url}: ${e.message}`)
      })
    wads.set(url, opening)
    return opening
  })).then(() => {})
}

// The bytes of the file at `url` when a wad holds it, a copy of its own, once every wad that has
// started opening has opened or failed; else undefined.
export async function sealed(url: string): Promise<ArrayBuffer | undefined> {
  if (wads.size) await Promise.allSettled([...wads.values()])
  return unsealed.get(url)?.slice(0)
}

// The one fetch of a url, however many names and callers ask for it. One that fails is forgotten.
const start = (name: string, url: string): Promise<void> => {
  const had = taking.get(url)
  if (had) return had
  const got = fetched(url).then(
    b => { bytes.set(url, b) },
    e => { taking.delete(url); throw new Error(`loader ${name}: ${e.message}`) },
  )
  taking.set(url, got)
  return got
}

const bytesOf = (url: string) => {
  const b = bytes.get(url)
  if (!b) throw new Missing([url])
  return b
}
const textOf = (url: string) => new TextDecoder().decode(bytesOf(url))

// What an entry's file decodes to, made anew from the process's bytes, and every url it read.
function decodeFile(e: Entry): { value: any; urls: string[] } {
  const urls: string[] = []
  const text = (url: string) => { urls.push(url); return textOf(url) }
  const json = (url: string) => JSON.parse(text(url))
  if (e.type === 'json') return { value: json(e.url), urls }
  if (e.type === 'palette') return { value: gpl(text(e.url), e.url), urls }
  if (e.type === 'sheet') return { value: read(json(e.url), e.url, e, json), urls }
  if (e.type === 'tilemap') return { value: readMap(json(e.url), e.url, json), urls }
  if (e.type === 'pixels') {
    urls.push(e.url)
    return { value: decodePng(new Uint8Array(bytesOf(e.url))), urls }
  }
  // held in a table, so a write refills the table every holder of it reads
  if (e.type === 'binary') {
    urls.push(e.url)
    return { value: { bytes: new Uint8Array(bytesOf(e.url)) }, urls }
  }
  throw new Error(`the sim half decodes no ${e.type}`)
}

const keyOf = (e: Entry) => [e.type, e.url, ...(e.type === 'sheet' ? [JSON.stringify([e.nearest, e.facing, e.palette])] : [])].join('\n')

// The process's decoded copy of an entry, made the first time every file it reads is here; until
// then it throws Missing.
// Each entry's copy, by the entry, once it is made: a rule asks for a definition many times a step,
// and a copy is refilled in place and never replaced.
const byEntry = new WeakMap<Entry, any>()

function decoded(e: Entry): any {
  const quick = byEntry.get(e)
  if (quick !== undefined) return quick
  const key = keyOf(e)
  const had = made.get(key)
  if (had) {
    byEntry.set(e, had.value)
    return had.value
  }
  const { value, urls } = decodeFile(e)
  made.set(key, { entry: e, value, urls })
  byEntry.set(e, value)
  return value
}

// A url of a map, and of a tileset it names, that Tiled writes as XML.
function refuse(e: Entry) {
  if (e.type === 'tilemap' && /\.tmx$/i.test(e.url)) throw new Error(`${e.url} is a .tmx: save as .tmj`)
}

// Fetches every file an entry reads, and resolves once they have all landed and it has decoded.
async function need(name: string, e: Entry): Promise<void> {
  try {
    refuse(e)
  } catch (err) {
    throw new Error(`loader ${name}: ${(err as Error).message}`)
  }
  await start(name, e.url)
  if (!DECODED.includes(e.type)) return
  for (;;) {
    try {
      decoded(e)
      return
    } catch (err) {
      if (!(err instanceof Missing)) throw new Error(`loader ${name}: ${(err as Error).message}`)
      await Promise.all(err.urls.map(url => start(name, url)))
    }
  }
}

// The preloads a rule reads. A texture, a model and a sound are the browser half's to fetch and
// decode, and a rule never reads one, so this half never fetches or keeps them.
const preloads = (world: Record<string, any>) => Object.entries(catalogue(world)).filter(([, a]) => a.preload && DECODED.includes(a.type))

// The scene's catalogue, `world.loader.assets`, which no packet carries.
const catalogue = (world: Record<string, any>): Record<string, Entry> => {
  const it = world.loader?.assets
  if (!it) throw new Error('the scene\'s world has no loader catalogue')
  return it
}

// The loader rows whose preloads `before` has started: one start each, whatever it comes to.
const begun = new WeakSet<Row>()

export const loader: Kind & Required<Prepare> & Memory = {
  // Whether the preloads were started and the names the rules asked `load` for, which a truth's
  // snapshot does not carry: handed out with a save and taken by the truth loaded from it (`Memory`
  // in `addons/rewind`), so nothing there is started again that was started before.
  hold(me) { return { begun: begun.has(me), asked: [...asked.get(me) ?? []] } },
  take(me, held) {
    const h = held as { begun: boolean; asked: string[] }
    if (h.begun) begun.add(me)
    asked.set(me, new Set(h.asked))
  },
  before(me, _dt, w) {
    if (begun.has(me)) return
    begun.add(me)
    mount(w.world).catch(e => console.error(e))
    for (const [name, a] of preloads(w.world)) need(name, a).catch(e => console.error(e))
  },
  async prepare(_me, world) {
    await mount(world)
    await Promise.all(preloads(world).map(([name, a]) => need(name, a)))
  },
}

const entry = (w: W, name: string): Entry => {
  const it = catalogue(w.world)[name]
  if (!it) throw new Error(`loader has no ${name}`)
  return it
}

// Whether the entry's every file has landed, and, for the types a rule reads, decoded.
export const ready = (w: W, name: string) => {
  const it = entry(w, name)
  if (!DECODED.includes(it.type)) return bytes.has(it.url)
  try {
    decoded(it)
    return true
  } catch (e) {
    if (e instanceof Missing) return false
    throw e
  }
}

// The bytes of an entry's file, which throws while they have not landed.
export const asset = (w: W, name: string): ArrayBuffer => {
  const got = bytes.get(entry(w, name).url)
  if (!got) throw new Error(`loader has not finished ${name}`)
  return got
}

// The decoded catalogue entry `name` of type `type`: off the truth's `world` for a rule, off the
// scene's own `world` for an actor. The page made the client only once its loader row was prepared, so a
// preloaded file is here from the first frame, in an actor's `setup` too. It throws while a file it
// reads has not landed, so nothing reads half of one.
const landed = (from: W | Wire, name: string, type: string) => {
  const it: Entry | undefined = 'find' in from ? entry(from, name) : catalogue(from.scene.world ?? {})[name]
  if (!it) throw new Error(`loader has no ${name}`)
  if (it.type !== type) throw new Error(`loader ${name} is a ${it.type}, not ${type}`)
  try {
    return decoded(it)
  } catch (e) {
    if (e instanceof Missing) throw new Error(`loader has not finished ${name}`)
    throw e
  }
}

export const json = (from: W | Wire, name: string): any => landed(from, name, 'json')
export const sheet = (from: W | Wire, name: string): Sheet => landed(from, name, 'sheet')
export const palette = (from: W | Wire, name: string): number[] => landed(from, name, 'palette')
export const tiled = (from: W | Wire, name: string): Tiled => landed(from, name, 'tilemap')
export const pixels = (from: W | Wire, name: string): Pixels => landed(from, name, 'pixels')
export const binary = (from: W | Wire, name: string): Uint8Array => landed(from, name, 'binary').bytes

// The decoded entry `name` of a scene's catalogue, once every file it reads has landed, fetched
// first if nothing has: what a kind's `prepare` awaits for a file its first step reads, since it
// runs beside the loader's `prepare` and not after it. A `binary` entry is its bytes. It rejects with
// the reason a file cannot be fetched or decoded.
export const prepared = async (world: Record<string, any>, name: string): Promise<any> => {
  const it = catalogue(world)[name]
  if (!it) throw new Error(`loader has no ${name}`)
  if (!DECODED.includes(it.type)) throw new Error(`loader ${name} is a ${it.type}, which a rule does not read`)
  await need(name, it)
  const value = decoded(it)
  return it.type === 'binary' ? value.bytes : value
}

// ---------------------------------------------------------------- pictures

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
export const isPng = (bytes: Uint8Array) => SIGNATURE.every((b, i) => bytes[i] === b)

// How many samples a pixel of each colour type has: grey, RGB, a palette index, grey and alpha, RGBA.
const SAMPLES: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
// Adam7's seven passes, each [x0, y0, dx, dy] over the whole image.
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]

const latin1 = (b: Uint8Array) => String.fromCharCode(...b)
const utf8 = (b: Uint8Array) => new TextDecoder().decode(b)

// A text chunk's keyword and its text: `tEXt` Latin-1, `zTXt` Latin-1 deflated, `iTXt` UTF-8,
// deflated when its flag says so.
function textChunk(name: string, body: Uint8Array): [string, string] {
  const nul = body.indexOf(0)
  if (nul < 0) throw new Error(`a PNG ${name} chunk with no keyword`)
  const keyword = latin1(body.subarray(0, nul))
  if (name === 'tEXt') return [keyword, latin1(body.subarray(nul + 1))]
  if (name === 'zTXt') return [keyword, latin1(unzlibSync(body.subarray(nul + 2)))]
  const deflated = body[nul + 1] === 1
  const language = body.indexOf(0, nul + 3)
  const translated = body.indexOf(0, language + 1)
  if (language < 0 || translated < 0) throw new Error(`a PNG iTXt chunk ${keyword} cut short`)
  const text = body.subarray(translated + 1)
  return [keyword, utf8(deflated ? unzlibSync(text) : text)]
}

// A PNG's pixels and text: every colour type, every bit depth, a palette's and a colour's
// transparency (`tRNS`), and Adam7 interlacing. A 16-bit sample is read as its high byte.
export function decodePng(bytes: Uint8Array): Pixels {
  if (!isPng(bytes)) throw new Error('not a PNG')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0
  let palette: Uint8Array | undefined, trns: Uint8Array | undefined
  const idat: Uint8Array[] = []
  const text: Record<string, string> = {}
  for (let at = 8; at + 8 <= bytes.length;) {
    const length = view.getUint32(at)
    const name = latin1(bytes.subarray(at + 4, at + 8))
    const body = bytes.subarray(at + 8, at + 8 + length)
    if (name === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      ;[depth, type] = [body[8], body[9]]
      interlace = body[12]
    } else if (name === 'PLTE') palette = body
    else if (name === 'tRNS') trns = body
    else if (name === 'IDAT') idat.push(body)
    else if (name === 'tEXt' || name === 'zTXt' || name === 'iTXt') {
      const [keyword, value] = textChunk(name, body)
      text[keyword] = value
    } else if (name === 'IEND') break
    at += 12 + length
  }
  const samples = SAMPLES[type]
  if (!samples || ![1, 2, 4, 8, 16].includes(depth)) throw new Error(`a PNG of colour type ${type} at ${depth} bits, which no PNG is`)
  if (type === 3 && !palette) throw new Error('a PNG of palette colours with no palette')
  const joined = new Uint8Array(idat.reduce((n, b) => n + b.length, 0))
  idat.reduce((at, b) => (joined.set(b, at), at + b.length), 0)
  const raw = unzlibSync(joined)
  const data = new Uint8ClampedArray(width * height * 4)
  const bits = samples * depth
  // How many bytes back the byte a filter predicts from is: a whole pixel, or one byte below 8 bits.
  const back = Math.max(1, bits >> 3)
  const most = (1 << depth) - 1
  // Sample `s` of the pixel at `x` of an unfiltered row, at its full depth.
  const sample = (row: Uint8Array, x: number, s: number) => {
    if (depth === 16) return (row[(x * samples + s) * 2] << 8) | row[(x * samples + s) * 2 + 1]
    if (depth === 8) return row[x * samples + s]
    const bit = (x * samples + s) * depth
    return (row[bit >> 3] >> (8 - depth - (bit & 7))) & most
  }
  const byte = (v: number) => (depth === 16 ? v >> 8 : depth === 8 ? v : Math.round((v * 255) / most))
  // The transparent colour of a grey or RGB image, at full depth.
  const clear = trns && (type === 0 || type === 2) ? Array.from({ length: type === 0 ? 1 : 3 }, (_, i) => (trns![i * 2] << 8) | trns![i * 2 + 1]) : undefined
  let at = 0
  for (const [x0, y0, dx, dy] of interlace ? ADAM7 : [[0, 0, 1, 1]]) {
    const pw = Math.ceil((width - x0) / dx), ph = Math.ceil((height - y0) / dy)
    if (pw <= 0 || ph <= 0) continue
    const stride = Math.ceil((pw * bits) / 8)
    let above = new Uint8Array(stride)
    for (let r = 0; r < ph; r++) {
      const filter = raw[at]
      const row = raw.slice(at + 1, at + 1 + stride)
      at += stride + 1
      unfilter(filter, row, above, back)
      above = row
      const line = ((y0 + r * dy) * width + x0) * 4
      // An RGBA row of 8 bits, laid out as the picture's own, is the picture's row as it is.
      if (type === 6 && depth === 8 && dx === 1) {
        data.set(row, line)
        continue
      }
      for (let x = 0; x < pw; x++) {
        const o = line + x * dx * 4
        if (type === 3) {
          const k = sample(row, x, 0)
          data[o] = palette![k * 3]
          data[o + 1] = palette![k * 3 + 1]
          data[o + 2] = palette![k * 3 + 2]
          data[o + 3] = trns && k < trns.length ? trns[k] : 255
          continue
        }
        const grey = type === 0 || type === 4
        const v0 = sample(row, x, 0), v1 = grey ? v0 : sample(row, x, 1), v2 = grey ? v0 : sample(row, x, 2)
        data[o] = byte(v0)
        data[o + 1] = byte(v1)
        data[o + 2] = byte(v2)
        data[o + 3] = type === 4 ? byte(sample(row, x, 1)) : type === 6 ? byte(sample(row, x, 3)) : 255
        if (clear && clear[0] === v0 && (type === 0 || (clear[1] === v1 && clear[2] === v2))) data[o + 3] = 0
      }
    }
  }
  return { width, height, data, text }
}

// A row's bytes unfiltered in place against the row above it, `back` bytes to a pixel.
function unfilter(filter: number, row: Uint8Array, above: Uint8Array, back: number) {
  for (let i = 0; i < row.length; i++) {
    const a = i >= back ? row[i - back] : 0, b = above[i], c = i >= back ? above[i - back] : 0
    if (filter === 1) row[i] += a
    else if (filter === 2) row[i] += b
    else if (filter === 3) row[i] += (a + b) >> 1
    else if (filter === 4) row[i] += paeth(a, b, c)
    else if (filter !== 0) throw new Error(`a PNG row filtered with ${filter}, which no PNG is`)
  }
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// One chunk: its length, its name, its body and the CRC of the name and body.
function chunkOf(name: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

// Pixels as an 8-bit RGBA PNG, each row filtered whichever of the five ways leaves the smallest
// bytes, as most encoders choose, and each text as an uncompressed `iTXt`, UTF-8, keyed as given.
// A keyword is 1 to 79 Latin-1 characters with no NUL, as PNG allows.
export function encodePng(p: Pixels): Uint8Array {
  const { width, height, data } = p
  if (data.length !== width * height * 4) throw new Error(`pixels of ${width} × ${height} hold ${data.length} bytes, not ${width * height * 4}`)
  const stride = width * 4
  const lines = new Uint8Array((stride + 1) * height)
  let above: Uint8Array = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const row = new Uint8Array(data.buffer, data.byteOffset + y * stride, stride)
    let best: Uint8Array | undefined, bestFilter = 0, bestCost = Infinity
    for (let f = 0; f < 5; f++) {
      const out = new Uint8Array(stride)
      let cost = 0
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? row[i - 4] : 0, b = above[i], c = i >= 4 ? above[i - 4] : 0
        const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]
        out[i] = (row[i] - predicted) & 255
        cost += out[i] < 128 ? out[i] : 256 - out[i]
      }
      if (cost < bestCost) [best, bestFilter, bestCost] = [out, f, cost]
    }
    lines[y * (stride + 1)] = bestFilter
    lines.set(best!, y * (stride + 1) + 1)
    above = row
  }
  const head = new Uint8Array(13)
  new DataView(head.buffer).setUint32(0, width)
  new DataView(head.buffer).setUint32(4, height)
  head.set([8, 6, 0, 0, 0], 8)
  const texts = Object.entries(p.text).map(([keyword, value]) => {
    if (!/^[\x20-\x7e\xa1-\xff]{1,79}$/.test(keyword)) throw new Error(`a PNG text keyword is 1 to 79 Latin-1 characters, not ${JSON.stringify(keyword)}`)
    const words = new TextEncoder().encode(value)
    const body = new Uint8Array(keyword.length + 5 + words.length)
    for (let i = 0; i < keyword.length; i++) body[i] = keyword.charCodeAt(i)
    body.set(words, keyword.length + 5)
    return chunkOf('iTXt', body)
  })
  const parts = [new Uint8Array(SIGNATURE), chunkOf('IHDR', head), ...texts, chunkOf('IDAT', zlibSync(lines)), chunkOf('IEND', new Uint8Array())]
  const out = new Uint8Array(parts.reduce((n, b) => n + b.length, 0))
  parts.reduce((at, b) => (out.set(b, at), at + b.length), 0)
  return out
}

// ---------------------------------------------------------------- palettes

// A GIMP palette's colours, as 0xRRGGBB, in the file's order.
export function gpl(text: string, url: string): number[] {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== 'GIMP Palette') throw new Error(`palette ${url} does not start with the line GIMP Palette`)
  const colours: number[] = []
  lines.forEach((line, i) => {
    const t = line.trim()
    if (i === 0 || !t || t.startsWith('#') || /^(Name|Columns)\s*:/i.test(t)) return
    const m = t.match(/^(\d+)\s+(\d+)\s+(\d+)(\s.*)?$/)
    const rgb = m ? [m[1], m[2], m[3]].map(Number) : []
    if (!m || rgb.some(v => v > 255)) throw new Error(`palette ${url} line ${i + 1} is no colour: ${line}`)
    colours.push((rgb[0] << 16) | (rgb[1] << 8) | rgb[2])
  })
  return colours
}

// ---------------------------------------------------------------- sheets

// A file another names, parsed: what `read` and `readMap` are handed to read a multipack's other
// packs and a map's tilesets.
type More = (url: string) => any

// A sheet file, found at `url`, read into a `Sheet`; `entry` is what its catalogue entry says of it,
// and `more` hands the other files it names.
export function read(file: any, url: string, entry: Partial<Entry> = {}, more: More = u => { throw new Error(`sheet ${url} names ${u}, which was not handed to it`) }): Sheet {
  const facing = entry.facing
  const shape = shapeOf(file, url) === 'tileset' ? tileSheet(file, url) : atlas(file, url, more)
  return {
    pages: shape.pages,
    nearest: !!entry.nearest,
    facing: { first: facing?.first ?? 0, step: facing?.step ?? 0, mirror: !!facing?.mirror },
    ...(entry.palette !== undefined && { palette: entry.palette }),
    frames: shape.frames,
    order: shape.order,
    clips: shape.clips,
    slices: shape.slices,
  }
}

type Cut = { pages: string[]; frames: Record<string, Frame>; order: string[]; clips: Record<string, Clip>; slices: Record<string, Slice[]> }

// Which of the two a sheet file at `url` is: a Tiled tileset, or an Aseprite or TexturePacker JSON.
export const shapeOf = (file: any, url: string): 'tileset' | 'atlas' =>
  file.type === 'tileset' || /\.tsj$/i.test(url) ? 'tileset' : 'atlas'

// Where a file of the loader's names another file: the path of the name in the file, the name, and
// the url it names, from the file's own folder (`beside`). A Tiled map, a file whose `type` is `map`,
// the one `readMap` opens, names each tileset it names by `source`, what a tileset it holds names, and
// each image layer's image, groups too, as `readMap` opens them; a Tiled tileset, any `.tsj` or a file
// whose `type` says so (`shapeOf`), names its image and each tile's; and an Aseprite or TexturePacker
// pack names its page and its other packs, as `read` opens them. A file whose JSON is no object names
// nothing. What a copy of a sheet renames, and what a scene's files reach.
export type Named = { at: (string | number)[]; name: string; url: string }
export function namesIn(file: any, url: string): Named[] {
  if (file === null || typeof file !== 'object' || Array.isArray(file)) return []
  const out: Named[] = []
  const name = (at: (string | number)[], v: unknown) => { if (typeof v === 'string') out.push({ at, name: v, url: beside(url, v) }) }
  const tileset = (ts: any, at: (string | number)[]) => {
    name([...at, 'image'], ts.image)
    ;((ts.tiles ?? []) as any[]).forEach((t, k) => name([...at, 'tiles', k, 'image'], t.image))
  }
  if (file.type === 'map') {
    ;((file.tilesets ?? []) as any[]).forEach((t, k) => (t.source !== undefined ? name(['tilesets', k, 'source'], t.source) : tileset(t, ['tilesets', k])))
    const walk = (list: any[], at: (string | number)[]) => list.forEach((l, k) => {
      if (l.type === 'imagelayer') name([...at, k, 'image'], l.image)
      if (l.type === 'group') walk(l.layers ?? [], [...at, k, 'layers'])
    })
    walk(file.layers ?? [], ['layers'])
    return out
  }
  if (shapeOf(file, url) === 'tileset') {
    tileset(file, [])
    return out
  }
  name(['meta', 'image'], file.meta?.image)
  ;((file.meta?.related_multi_packs ?? []) as unknown[]).forEach((p, k) => name(['meta', 'related_multi_packs', k], p))
  return out
}

// A frame whose whole is its box, upright, with nothing trimmed.
const whole = (id: string, page: number, box: [number, number, number, number], anchor: [number, number]): Frame =>
  ({ id, page, box, rotated: false, size: [box[2], box[3]], trim: [0, 0, box[2], box[3]], anchor })

// A clip whose every frame is on the sheet and whose runs are of one length.
function checked(url: string, name: string, frames: Record<string, Frame>, c: Clip): Clip {
  for (const id of c.runs.flat()) if (!(id in frames)) throw new Error(`sheet ${url} clip ${name} names frame ${id}, which it does not have`)
  if (c.runs.some(run => run.length !== c.runs[0].length)) throw new Error(`sheet ${url} clip ${name} has runs of different lengths`)
  return c
}

// A number that is a whole number to within a millionth, made that whole number.
const snapped = (v: number) => (Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : v)

// An Aseprite or TexturePacker frame.
function atlasFrame(url: string, id: string, page: number, f: any): Frame {
  const r = f.frame
  if (!r) throw new Error(`sheet ${url} frame ${id} has no frame`)
  const trimmed = f.trimmed !== false && f.spriteSourceSize && f.sourceSize
  const size: [number, number] = trimmed ? [f.sourceSize.w, f.sourceSize.h] : [r.w, r.h]
  const pivot = f.pivot ?? f.anchor ?? { x: 0, y: 0 }
  return {
    id,
    page,
    box: f.rotated ? [r.x, r.y, r.h, r.w] : [r.x, r.y, r.w, r.h],
    rotated: !!f.rotated,
    size,
    trim: trimmed ? [f.spriteSourceSize.x, f.spriteSourceSize.y, r.w, r.h] : [0, 0, r.w, r.h],
    anchor: [snapped(pivot.x * size[0]), snapped(pivot.y * size[1])],
  }
}

export const DIRECTIONS = ['forward', 'reverse', 'pingpong', 'pingpong_reverse']

// The frames of a tag in the order they play: once round, for a tag played forever, or every time
// it is played, a ping-pong turning at each end without showing the end frame twice.
export function played(ids: string[], direction: string, repeat: number): { run: string[]; loop: boolean } {
  if (!DIRECTIONS.includes(direction)) throw new Error(`direction ${direction} is none of ${DIRECTIONS.join(', ')}`)
  if (!Number.isInteger(repeat) || repeat < 0) throw new Error(`repeat ${repeat} is no count of times`)
  const back = [...ids].reverse()
  const [there, again] = direction.endsWith('reverse') ? [back, ids] : [ids, back]
  const pingpong = direction.startsWith('pingpong')
  if (repeat === 0) return { run: pingpong ? [...there, ...again.slice(1, -1)] : there, loop: true }
  if (!pingpong) return { run: Array.from({ length: repeat }, () => there).flat(), loop: false }
  const run = [...there]
  for (let k = 1; k < repeat; k++) run.push(...(k % 2 ? again : there).slice(1))
  return { run, loop: false }
}

// Run k of clip `<clip>@<k>`, or run 0 of a clip named without one.
export const runOf = (name: string): [string, number] => {
  const m = name.match(/^(.*)@(\d+)$/)
  return m ? [m[1], Number(m[2])] : [name, 0]
}

// An Aseprite or TexturePacker sheet and the other packs of its multipack.
function atlas(file: any, url: string, more: More): Cut {
  if (!file.frames || !file.meta) throw new Error(`sheet ${url} is no sheet the loader reads: an Aseprite or TexturePacker JSON, or a Tiled .tsj`)
  const packs = [{ file, url }, ...each((file.meta.related_multi_packs ?? []) as string[], p => ({ file: more(beside(url, p)), url: beside(url, p) }))]
  const frames: Record<string, Frame> = {}
  const seconds = new Map<string, number>()
  const pages = packs.map(({ file: p, url: at }) => {
    if (typeof p.meta?.image !== 'string') throw new Error(`sheet ${at} has no meta.image`)
    return beside(at, p.meta.image)
  })
  // Each pack's frames in its file's order, which its tags count in.
  const orders = packs.map(({ file: p, url: at }, page) => {
    const list: [string, any][] = Array.isArray(p.frames) ? p.frames.map((f: any) => [f.filename, f]) : Object.entries(p.frames)
    return list.map(([id, f]) => {
      if (typeof id !== 'string') throw new Error(`sheet ${at} has a frame with no filename`)
      if (id in frames) throw new Error(`sheet ${url} has two frames ${id}`)
      frames[id] = atlasFrame(at, id, page, f)
      if (f.duration !== undefined) {
        if (!(f.duration > 0)) throw new Error(`sheet ${at} frame ${id} shows for ${f.duration} ms`)
        seconds.set(id, f.duration / 1000)
      }
      return id
    })
  })
  // Each clip's runs as the tags and animations write them.
  const named = new Map<string, Map<number, { run: string[]; loop: boolean }>>()
  const add = (at: string, name: string, it: { run: string[]; loop: boolean }) => {
    const [clip, k] = runOf(name)
    const runs = named.get(clip) ?? new Map()
    if (runs.has(k)) throw new Error(`sheet ${at} has run ${k} of clip ${clip} twice`)
    named.set(clip, runs.set(k, it))
  }
  packs.forEach(({ file: p, url: at }, i) => {
    for (const tag of p.meta.frameTags ?? []) {
      const ids = orders[i].slice(tag.from, tag.to + 1)
      if (tag.from > tag.to || tag.to >= orders[i].length) throw new Error(`sheet ${at} tag ${tag.name} runs from ${tag.from} to ${tag.to} of ${orders[i].length} frames`)
      try {
        add(at, tag.name, played(ids, tag.direction ?? 'forward', Number(tag.repeat ?? 0)))
      } catch (e) {
        throw new Error(`sheet ${at} tag ${tag.name}: ${(e as Error).message}`)
      }
    }
    for (const [name, ids] of Object.entries((p.animations ?? {}) as Record<string, string[]>)) add(at, name, { run: ids.map(String), loop: true })
  })
  const clips: Record<string, Clip> = {}
  for (const [name, byRun] of named) {
    const runs = [...byRun.keys()].sort((a, b) => a - b)
    runs.forEach((k, i) => { if (k !== i) throw new Error(`sheet ${url} clip ${name} has run ${k} and no run ${i}`) })
    const all = runs.map(k => byRun.get(k)!)
    if (all.some(r => r.loop !== all[0].loop)) throw new Error(`sheet ${url} clip ${name} has runs that loop and runs that do not`)
    const clip = checked(url, name, frames, { loop: all[0].loop, runs: all.map(r => r.run) })
    const timed = clip.runs.flat().filter(id => seconds.has(id)).length
    if (timed && timed !== clip.runs.flat().length) throw new Error(`sheet ${url} clip ${name} has frames with a duration and frames without`)
    if (timed) {
      const durations = clip.runs[0].map(id => seconds.get(id)!)
      if (clip.runs.some(run => run.some((id, i) => seconds.get(id) !== durations[i]))) throw new Error(`sheet ${url} clip ${name} has runs timed differently`)
      clip.durations = durations
    }
    clips[name] = clip
  }
  const order = orders.flat()
  const slices: Record<string, Slice[]> = {}
  const box = (b: any): Box => [b.x, b.y, b.w, b.h]
  for (const sl of file.meta.slices ?? []) {
    if (sl.name in slices) throw new Error(`sheet ${url} has two slices ${sl.name}`)
    slices[sl.name] = (sl.keys as any[]).map((k): Slice => {
      if (!(Number.isInteger(k.frame) && k.frame >= 0 && k.frame < order.length)) throw new Error(`sheet ${url} slice ${sl.name} has a key at frame ${k.frame} of ${order.length}`)
      return {
        frame: k.frame,
        bounds: box(k.bounds),
        ...(k.pivot && { pivot: [k.pivot.x, k.pivot.y] as [number, number] }),
        ...(k.center && { center: box(k.center) }),
      }
    })
  }
  return { pages, frames, order, clips, slices }
}

// Where Tiled stands a tile object, as a fraction of the tile across and down, by
// `objectalignment`.
const ALIGN: Record<string, [number, number]> = {
  unspecified: [0, 1], bottomleft: [0, 1], bottom: [0.5, 1], bottomright: [1, 1],
  left: [0, 0.5], center: [0.5, 0.5], right: [1, 0.5],
  topleft: [0, 0], top: [0.5, 0], topright: [1, 0],
}

const typeOf = (o: any): string => o.type ?? o.class ?? ''

// A Tiled tileset as a sheet: a frame a tile and a clip a type.
function tileSheet(file: any, url: string): Cut {
  const align = ALIGN[file.objectalignment ?? 'unspecified']
  if (!align) throw new Error(`tileset ${url} has objectalignment ${file.objectalignment}`)
  const [ox, oy] = [file.tileoffset?.x ?? 0, file.tileoffset?.y ?? 0]
  const frames: Record<string, Frame> = {}
  const pages: string[] = []
  const frame = (id: number, page: number, box: [number, number, number, number]) => {
    frames[id] = whole(String(id), page, box, [align[0] * box[2] - ox, align[1] * box[3] - oy])
  }
  const tiles: any[] = [...(file.tiles ?? [])].sort((a, b) => a.id - b.id)
  if (file.image) {
    pages.push(beside(url, file.image))
    for (let id = 0; id < file.tilecount; id++) frame(id, 0, gridBox(file, id))
  } else for (const t of tiles) frame(t.id, pages.push(beside(url, t.image)) - 1, [t.x ?? 0, t.y ?? 0, t.width ?? t.imagewidth, t.height ?? t.imageheight])
  const clips: Record<string, Clip> = {}
  for (const t of tiles) {
    if (t.animation?.some((a: any) => !(a.duration > 0))) throw new Error(`tileset ${url} tile ${t.id} has an animation frame that shows for no time`)
    const name = typeOf(t) || (t.animation ? String(t.id) : '')
    if (!name || name in clips) continue
    clips[name] = checked(url, name, frames, t.animation
      ? { loop: true, runs: [t.animation.map((a: any) => String(a.tileid))], durations: t.animation.map((a: any) => a.duration / 1000) }
      : { loop: true, runs: [[String(t.id)]] })
  }
  return { pages, frames, order: Object.keys(frames), clips, slices: {} }
}

// Where tile `id` is on the image of a tileset cut as a grid.
const gridBox = (ts: any, id: number): [number, number, number, number] => {
  const margin = ts.margin ?? 0, spacing = ts.spacing ?? 0, c = id % ts.columns, r = Math.floor(id / ts.columns)
  return [margin + c * (ts.tilewidth + spacing), margin + r * (ts.tileheight + spacing), ts.tilewidth, ts.tileheight]
}

// The path `p`, written from the folder of the file at `url`, as a plain path from the working
// directory: its `.` and `..` walked, and nothing encoded.
export function beside(url: string, p: string): string {
  if (p.startsWith('/')) return p
  const at = url.split('/').slice(0, -1)
  for (const part of p.split('/')) {
    if (part === '..') at.pop()
    else if (part !== '.') at.push(part)
  }
  return at.join('/')
}

const clipOf = (s: Sheet, clip: string) => {
  const c = s.clips[clip]
  if (!c) throw new Error(`the sheet has no clip ${clip}`)
  return c
}

// How many seconds place `i` of a clip shows: its duration.
const showing = (c: Clip, clip: string) => {
  const { durations } = c
  if (!durations) throw new Error(`clip ${clip} is not timed: its frames have no duration`)
  return (i: number) => durations[i]
}

// How far apart two ways are, in turns, the short way round.
const apart = (a: number, b: number) => Math.abs(((((a - b) % 1) + 1.5) % 1) - 0.5)

// The run of `clip` that faces `turns`, a fraction of a whole turn counter-clockwise from right on
// the screen, and whether it is drawn mirrored: the run, or the mirror image of a run, facing
// nearest it, a run before its mirror image and an earlier run before a later one. A clip of one
// run on a sheet that mirrors nothing faces every way.
export function pick(s: Sheet, clip: string, turns: number): { run: number; mirror: boolean } {
  const { runs } = clipOf(s, clip)
  const { first, step, mirror } = s.facing
  let best = { run: 0, mirror: false }, gap = Infinity
  for (let k = 0; k < runs.length; k++) {
    const faces = first + k * step
    const d = apart(turns, faces)
    if (d < gap - 1e-9) { gap = d; best = { run: k, mirror: false } }
    if (!mirror) continue
    const m = apart(turns, 0.5 - faces)
    if (m < gap - 1e-9) { gap = m; best = { run: k, mirror: true } }
  }
  return best
}

// Frame `i` of run `run` of `clip`.
export function frameOf(s: Sheet, clip: string, run: number, i: number): Frame {
  const id = clipOf(s, clip).runs[run]?.[i]
  if (id === undefined) throw new Error(`clip ${clip} has no frame ${i} in run ${run}`)
  return s.frames[id]
}

// The frame a clip shows and the seconds it has shown it, `dt` seconds on: it moves on a frame when
// the one it shows has shown for its duration, round to the first after the last, or, for a clip
// that does not loop, held on the last with no time on it. A clip of one frame that is not timed
// holds it.
export function play(s: Sheet, clip: string, frame: number, ft: number, dt: number): [number, number] {
  const c = clipOf(s, clip), n = c.runs[0].length
  if (n === 1 && !c.durations) return [0, 0]
  const per = showing(c, clip)
  ft += dt
  while (ft >= per(frame)) {
    ft -= per(frame)
    if (frame + 1 < n) frame++
    else if (c.loop) frame = 0
    else { ft = 0; break }
  }
  return [frame, ft]
}

// The seconds a clip takes to play through once.
export const span = (s: Sheet, clip: string) => {
  const c = clipOf(s, clip), per = showing(c, clip)
  return c.runs[0].reduce((sum, _, i) => sum + per(i), 0)
}

// How far a frame's pixels reach from its anchor as it is drawn, in pixels: [left, right, up, down].
// A mirrored frame reaches left as far as the frame reaches right.
export function reach(f: Frame, mirror: boolean): [number, number, number, number] {
  const [tx, ty, tw, th] = f.trim, [ax, ay] = f.anchor
  const left = ax - tx, right = tx + tw - ax
  return mirror ? [right, left, ay - ty, ty + th - ay] : [left, right, ay - ty, ty + th - ay]
}

// ---------------------------------------------------------------- Tiled maps

const props = (list: any): Props => Object.fromEntries(((list ?? []) as any[]).map(p => [p.name, p.value]))

// A Tiled colour, `#rrggbb` or `#aarrggbb`, as 0xRRGGBB and its alpha from 0 to 1.
function colour(text: string, where: string): { rgb: number; alpha: number } {
  const m = /^#?([0-9a-f]{2})?([0-9a-f]{6})$/i.exec(text)
  if (!m) throw new Error(`${where} is no colour: ${text}`)
  return { rgb: parseInt(m[2], 16), alpha: m[1] === undefined ? 1 : parseInt(m[1], 16) / 255 }
}

// Two tints over each other, channel by channel; null is none.
const tinted = (a: number | null, b: number | null): number | null => {
  if (a === null) return b
  if (b === null) return a
  const ch = (k: number) => Math.round((((a >> k) & 255) * ((b >> k) & 255)) / 255) << k
  return ch(16) | ch(8) | ch(0)
}

const b64 = (text: string) => Uint8Array.from(atob(text.trim()), c => c.charCodeAt(0))

// The raw cells of a tile layer or a chunk, each its gid with its flip bits over it: a CSV list, or
// base64, uncompressed or compressed. The Tiles panel reads a layer it paints with it.
export function cells(where: string, data: any, encoding: string | undefined, compression: string | undefined, count: number): number[] {
  let got: number[]
  if (encoding === 'base64') {
    const packed = b64(data)
    const raw = !compression ? packed
      : compression === 'zlib' ? unzlibSync(packed)
      : compression === 'gzip' ? gunzipSync(packed)
      : compression === 'zstd' ? unzstd(packed)
      : undefined
    if (!raw) throw new Error(`${where} is compressed with ${compression}, which is none of zlib, gzip and zstd`)
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    got = Array.from({ length: raw.byteLength >> 2 }, (_, i) => view.getUint32(i * 4, true))
  } else if (Array.isArray(data)) got = data.map(Number)
  else throw new Error(`${where} has data encoded ${encoding}, which is neither csv nor base64`)
  if (got.length !== count) throw new Error(`${where} has ${got.length} cells, not ${count}`)
  return got
}

// Whether a list of points goes round a convex shape; and the same points going round clockwise on
// the screen, where y grows down, with points on one place joined.
function convex(points: [number, number][], where: string): [number, number][] {
  const pts = points.filter((p, i) => { const q = points[(i + points.length - 1) % points.length]; return p[0] !== q[0] || p[1] !== q[1] })
  let area = 0, sign = 0
  for (let i = 0; i < pts.length; i++) {
    const [a, b, c] = [pts[i], pts[(i + 1) % pts.length], pts[(i + 2) % pts.length]]
    area += a[0] * b[1] - b[0] * a[1]
    const turn = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (turn === 0) continue
    if (sign && Math.sign(turn) !== sign) throw new Error(`${where} is a polygon that is not convex`)
    sign = Math.sign(turn)
  }
  if (pts.length < 3 || area === 0) throw new Error(`${where} has no area`)
  return area > 0 ? pts : pts.reverse()
}

// A tile's collision objects, in its own pixels.
function shapesOf(tile: any, where: string): Shape[] {
  const og = tile.objectgroup
  if (!og) return []
  const [gx, gy] = [og.offsetx ?? 0, og.offsety ?? 0]
  return (og.objects as any[]).map(o => {
    const at = `${where} collision object ${o.id}`
    if (o.template) throw new Error(`${at} is made from a template; detach it in Tiled`)
    if (o.rotation) throw new Error(`${at} is rotated; tilemap collides with shapes that are not`)
    if (o.ellipse || o.polyline || o.point || o.gid || o.text) throw new Error(`${at} is not a rectangle or a polygon, which is all tilemap collides with`)
    const x = o.x + gx, y = o.y + gy
    if (!o.polygon && !(o.width > 0 && o.height > 0)) throw new Error(`${at} is a rectangle of no size`)
    const points: [number, number][] = o.polygon
      ? o.polygon.map((p: any) => [x + p.x, y + p.y])
      : [[x, y], [x + o.width, y], [x + o.width, y + o.height], [x, y + o.height]]
    return { points: convex(points, at), top: typeOf(o) === 'top' }
  })
}

// Every tile of a tileset, by gid.
function tilesOf(ts: any, at: string, index: number, firstgid: number, into: Record<string, Tile>) {
  const where = `tileset ${ts.name ?? at}`
  const own = new Map<number, any>(((ts.tiles ?? []) as any[]).map(t => [t.id, t]))
  const ids = ts.image ? Array.from({ length: ts.tilecount }, (_, i) => i) : [...own.keys()].sort((a, b) => a - b)
  for (const id of ids) {
    const t = own.get(id) ?? {}
    const gid = firstgid + id
    if (!ts.image && !t.image) throw new Error(`${where} tile ${id} has no image`)
    into[gid] = {
      gid,
      tileset: index,
      id,
      page: beside(at, ts.image ?? t.image),
      box: ts.image ? gridBox(ts, id) : [t.x ?? 0, t.y ?? 0, t.width ?? t.imagewidth, t.height ?? t.imageheight],
      type: typeOf(t),
      properties: props(t.properties),
      shapes: shapesOf(t, `${where} tile ${id}`),
      ...(t.animation && { animation: (t.animation as any[]).map(a => ({ tile: firstgid + a.tileid, duration: a.duration })) }),
    }
  }
}

const ORIENTATIONS = ['orthogonal', 'isometric']
const ORDERS = ['right-down', 'right-up', 'left-down', 'left-up']

// A Tiled map, found at `url`, read into a `Tiled`; `more` hands each tileset file it names.
export function readMap(file: any, url: string, more: More = u => { throw new Error(`tilemap ${url} names ${u}, which was not handed to it`) }): Tiled {
  if (/\.tmx$/i.test(url)) throw new Error(`${url} is a .tmx: save as .tmj`)
  if (file.type !== 'map') throw new Error(`tilemap ${url} is no Tiled map`)
  if (!ORIENTATIONS.includes(file.orientation)) throw new Error(`tilemap ${url} is ${file.orientation}: tilemap reads orthogonal and isometric maps, and neither staggered nor hexagonal ones`)
  if (file.parallaxoriginx || file.parallaxoriginy) throw new Error(`tilemap ${url} has its parallax origin away from 0, 0`)
  const tw: number = file.tilewidth, th: number = file.tileheight, iso = file.orientation === 'isometric'
  const tiles: Record<string, Tile> = {}
  const tilesets: Tileset[] = each((file.tilesets ?? []) as any[], (ref, i) => {
    let ts = ref, at = url
    if (ref.source !== undefined) {
      at = beside(url, ref.source)
      if (/\.tsx$/i.test(at)) throw new Error(`${at} is a .tsx: save as .tsj`)
      ts = more(at)
    }
    if (ts.tilerendersize === 'grid') throw new Error(`tileset ${ts.name} draws its tiles at the grid's size, not their own`)
    tilesOf(ts, at, i, ref.firstgid, tiles)
    return { name: ts.name, firstgid: ref.firstgid, count: ts.tilecount, tilewidth: ts.tilewidth, tileheight: ts.tileheight, offset: [ts.tileoffset?.x ?? 0, ts.tileoffset?.y ?? 0], source: at }
  })
  // Pixels on the screen, and pixels of an object, as cells.
  const screen = ([x, y]: [number, number]): [number, number] => (iso ? [x / tw + y / th, y / th - x / tw] : [x / tw, y / th])
  const unit = iso ? [th, th] : [tw, th]
  const layers: Layer[] = []
  const walk = (list: any[], up: { offset: [number, number]; parallax: [number, number]; opacity: number; visible: boolean; tint: number | null }) => {
    for (const l of list) {
      const where = `tilemap ${url} layer ${l.name}`
      const tint = l.tintcolor ? colour(l.tintcolor, `${where} tintcolor`) : { rgb: null, alpha: 1 }
      const here = {
        offset: [up.offset[0] + (l.offsetx ?? 0), up.offset[1] + (l.offsety ?? 0)] as [number, number],
        parallax: [up.parallax[0] * (l.parallaxx ?? 1), up.parallax[1] * (l.parallaxy ?? 1)] as [number, number],
        opacity: up.opacity * (l.opacity ?? 1) * tint.alpha,
        visible: up.visible && l.visible !== false,
        tint: tinted(up.tint, tint.rgb),
      }
      if (l.type === 'group') { walk(l.layers ?? [], here); continue }
      const common: Common = { name: l.name, ...here, shift: screen(here.offset), properties: props(l.properties) }
      if (l.type === 'tilelayer') layers.push(tileLayer(where, l, common, tiles))
      else if (l.type === 'imagelayer') layers.push({ ...common, kind: 'image', image: beside(url, l.image), repeat: [!!l.repeatx, !!l.repeaty] })
      else if (l.type === 'objectgroup') layers.push({ ...common, kind: 'objects', objects: ((l.objects ?? []) as any[]).map(ob => objectOf(`${where} object ${ob.id}`, ob, unit, common.shift, tiles)) })
      else throw new Error(`${where} is a ${l.type}, which tilemap does not read`)
    }
  }
  walk(file.layers ?? [], { offset: [0, 0], parallax: [1, 1], opacity: 1, visible: true, tint: null })
  const names = layers.filter(l => l.kind === 'tiles').map(l => l.name)
  const twice = names.find((n, i) => names.indexOf(n) !== i)
  if (twice !== undefined) throw new Error(`tilemap ${url} has two tile layers named ${twice}`)
  const bg = file.backgroundcolor ? colour(file.backgroundcolor, `tilemap ${url} backgroundcolor`) : undefined
  const renderorder = file.renderorder ?? 'right-down'
  if (!ORDERS.includes(renderorder)) throw new Error(`tilemap ${url} has renderorder ${renderorder}`)
  return {
    url,
    orientation: file.orientation,
    renderorder,
    width: file.width,
    height: file.height,
    tilewidth: tw,
    tileheight: th,
    infinite: !!file.infinite,
    background: bg && bg.alpha > 0 ? bg.rgb : null,
    properties: props(file.properties),
    tilesets,
    tiles,
    layers,
  }
}

// A tile layer, its chunks laid into one grid, each cell's gid and flip bits apart.
function tileLayer(where: string, l: any, common: Common, tiles: Record<string, Tile>): TileLayer {
  let x = 0, y = 0, width = l.width, height = l.height, raw: number[]
  if (l.chunks) {
    const chunks = l.chunks as any[]
    x = Math.min(...chunks.map(c => c.x))
    y = Math.min(...chunks.map(c => c.y))
    width = chunks.length ? Math.max(...chunks.map(c => c.x + c.width)) - x : 0
    height = chunks.length ? Math.max(...chunks.map(c => c.y + c.height)) - y : 0
    if (!chunks.length) x = y = 0
    raw = new Array(width * height).fill(0)
    for (const c of chunks) {
      const got = cells(`${where} chunk ${c.x}, ${c.y}`, c.data, l.encoding, l.compression, c.width * c.height)
      for (let r = 0; r < c.height; r++) for (let k = 0; k < c.width; k++) raw[(c.y - y + r) * width + (c.x - x + k)] = got[r * c.width + k]
    }
  } else raw = cells(where, l.data, l.encoding, l.compression, width * height)
  const data = raw.map(v => v & GID)
  data.forEach((gid, i) => { if (gid && !tiles[gid]) throw new Error(`${where} cell ${x + (i % width)}, ${y + Math.floor(i / width)} holds tile ${gid}, which no tileset has`) })
  return { ...common, kind: 'tiles', x, y, width, height, data, flips: raw.map(v => v >>> 29) }
}

// An object of an object layer, in cells, with its layer's offset in it.
function objectOf(where: string, o: any, [ux, uy]: number[], [ox, oy]: [number, number], tiles: Record<string, Tile>): TiledObject {
  if (o.template) throw new Error(`${where} is made from a template; detach it in Tiled`)
  if (o.rotation) throw new Error(`${where} is rotated; tilemap reads objects that are not`)
  const tile = o.gid !== undefined ? tiles[o.gid & GID] : undefined
  if (o.gid !== undefined && !tile) throw new Error(`${where} is tile ${o.gid & GID}, which no tileset has`)
  const w = (o.width ?? 0) / ux, h = (o.height ?? 0) / uy
  const pts = (list: any[]) => list.map((p): [number, number] => [p.x / ux, p.y / uy])
  return {
    id: o.id,
    name: o.name ?? '',
    type: typeOf(o) || tile?.type || '',
    x: o.x / ux + ox,
    y: o.y / uy + oy - (tile ? h : 0),
    w,
    h,
    ...(o.polygon && { polygon: pts(o.polygon) }),
    ...(o.polyline && { polyline: pts(o.polyline) }),
    ...(o.point && { point: true as const }),
    ...(o.ellipse && { ellipse: true as const }),
    ...(tile && { tile: tile.gid, flip: o.gid >>> 29 }),
    visible: o.visible !== false,
    properties: { ...tile?.properties, ...props(o.properties) },
  }
}

// ---------------------------------------------------------------- definitions

// The definition of a kind: its entry in the json asset the scene's `world.defs` names.
export const def = (from: W | Wire, kind: string): any => {
  const name = ('find' in from ? from.world : from.scene.world)?.defs
  if (typeof name !== 'string') throw new Error('the scene\'s world names no defs')
  const it = json(from, name)[kind]
  if (it === undefined) throw new Error(`${name} has no definition of ${kind}`)
  return it
}

// The names each loader row's rules have asked `load` for: one start each, whatever it comes to.
const asked = new WeakMap<Row, Set<string>>()

export const load = (w: W, name: string) => {
  const me = w.find('loader')
  const it = entry(w, name)
  const names = asked.get(me) ?? new Set<string>()
  if (names.has(name)) return
  asked.set(me, names.add(name))
  need(name, it).catch(e => console.error(e))
}

// The process's decoded file at `url`, fetched first if nothing has fetched it yet: what a test
// awaits to hold the copy every rule and `def` reads.
const at = (name: string, e: Entry) => need(name, e).then(() => decoded(e))
export const jsonAt = (name: string, url: string): Promise<any> => at(name, { type: 'json', url })
export const sheetAt = (name: string, url: string, entry: Partial<Entry> = {}): Promise<Sheet> => at(name, { ...entry, type: 'sheet', url })
export const paletteAt = (name: string, url: string): Promise<number[]> => at(name, { type: 'palette', url })
export const tiledAt = (name: string, url: string): Promise<Tiled> => at(name, { type: 'tilemap', url })
export const pixelsAt = (name: string, url: string): Promise<Pixels> => at(name, { type: 'pixels', url })
export const binaryAt = (name: string, url: string): Promise<Uint8Array> => at(name, { type: 'binary', url }).then(v => v.bytes)

// An entry's file decoded anew from the process's bytes, fetched first if nothing has, and every url
// it read: what the browser half parses a client's own copy with.
export const fresh = (name: string, e: Entry): Promise<{ value: any; urls: string[] }> => need(name, e).then(() => decodeFile(e))

// Whether the process has read the file at `url` into anything it decoded.
export const holds = (url: string) => [...made.values()].some(m => m.urls.includes(url))

// How many times the file at `url` has been written on the machine while the process ran.
const rewrites = new Map<string, number>()
export const writes = (url: string) => rewrites.get(url) ?? 0
// The file at `url` was written on the machine: counted, so a picture of it is fetched anew.
export function rewritten(url: string) { rewrites.set(url, writes(url) + 1) }

// Empties `into` and gives it everything `from` has, so whatever holds `into` reads `from`: a list's
// items, or an object's fields.
export function refill(into: any, from: any) {
  if (Array.isArray(into)) {
    into.splice(0, into.length, ...from)
    return
  }
  for (const key of Object.keys(into)) delete into[key]
  Object.assign(into, from)
}

// A decoded copy made again from the bytes as they are now, and refilled in place; a file the new
// text names that has not landed is fetched first.
function remake(m: { entry: Entry; value: any; urls: string[] }) {
  try {
    const next = decodeFile(m.entry)
    refill(m.value, next.value)
    m.urls = next.urls
  } catch (e) {
    if (!(e instanceof Missing)) throw e
    Promise.all(e.urls.map(url => start(m.entry.url, url))).then(() => remake(m), err => console.error(err))
  }
}

// The file at `url` now holds `content`: its bytes are the new text, or the new bytes of a file
// that is not text, a `pixels` PNG or a `binary` file, and every decoded copy that read it is
// refilled in place from it.
export function written(url: string, content: string | Uint8Array) {
  rewritten(url)
  const b = typeof content === 'string' ? new TextEncoder().encode(content) : content
  bytes.set(url, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
  taking.set(url, Promise.resolve())
  for (const m of made.values()) if (m.urls.includes(url)) remake(m)
}
