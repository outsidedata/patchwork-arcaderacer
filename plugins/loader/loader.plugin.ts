// The browser half of loader. The catalogue is the scene's `world.loader.assets`, which no packet
// carries: this client reads it off its own scene. Every entry starts on the first tick unless it
// says `preload: false`; one that does starts when something calls `load` or `on`. A name asked for before the first
// tick waits for it, and is neither started nor failed until then.
//
// Every table this half keeps is this client's own and goes with it: what it has decoded, what is
// on its way, and the files it parsed. A page makes a new client per scene, and two clients share
// nothing this half made, so one client letting go of a texture or a model leaves every other
// client's whole. What a library keeps of its own is the library's: PixiJS's `Assets` hands two
// clients one texture for one url, and the browser's own cache keeps the bytes it fetched.
//
// The fetching and the decoding of an image belong to the renderer the scene named, and this file
// never imports one — it takes `render3d` or `render2d` out of `plugins`, so it binds to the
// renderer of the client it is ticking for. Whichever of the two is there decides what a texture
// is: a texture three's `TextureLoader` made, or one `PIXI.Assets` made.
//
// Node is where there is no `location`, the sim half's own test (`inPage`), so the two halves agree
// on which one they are in. Node has no page and so decodes no image: there an image is a 1×1 white
// data texture, so a client runs with every texture, sheet and model it asks for. Three's glTF
// loader turns an image a model holds into an `<img>` it makes with `document.createElementNS`,
// through `self.URL`, so while a model decodes in node this half lends the process a `self` and a
// `document` whose `createElementNS` makes an image that loads at once and is 1×1, and nothing
// else, each only where the process has none, and takes back what is still as it lent it when the
// last model decoding has finished: a `self` is never taken from a model still decoding, however
// the `document` has been swapped meanwhile. A process with no page has no `document` otherwise,
// and whatever reads one, such as the player's pointer lock, finds none.
//
// An entry whose `for` is `ui` is drawn by the UI, not by the scene's renderer, so it is decoded
// through the `ui` plugin's PixiJS and is a PixiJS texture whatever the scene draws with: a 3D
// scene's HUD shows an image the 3D scene also puts on a mesh through a second entry for the same
// url. A scene that names no `ui` has nothing to hand it to, and such an entry fails.
//
// An entry of type `texture` decoded for render3d is a picture whose colours are sRGB, decoded to
// linear light as it is sampled, unless the entry says `space: 'linear'`, a picture of numbers, a
// normal or a roughness map, which is sampled as it is stored. `wrap: 'repeat'` repeats it past its
// edges, both ways, for a surface that tiles it, and `anisotropy: n` samples it along n texels where a
// surface is seen at a slant, which three caps at what the GPU allows. Each is set as the texture is
// decoded, so whatever draws it never sets it on a texture another drawing shares.
//
// KTX2. A `texture` entry whose file is `.ktx2` (in any case) is GPU-compressed: Basis Universal,
// written by a bake (`scripts/bake.ts`, `ktx2`), and transcoded in a page by three's KTX2 reader into the
// compressed format this GPU reads (BC7, ASTC, ETC2…), so it reaches the GPU several times smaller than
// a picture's own pixels and is uploaded as it is, with the mips the bake made, none built on the page.
// One holding several layers is three's CompressedArrayTexture, one array a shader samples. It is
// decoded once render3d has a renderer, which it is transcoded for; the transcoder is
// `plugins/loader/basis/`, three's own files copied beside this one so a published site serves them as
// it serves this file. Its colour space is the one its file says unless the entry gives `space`; `wrap`
// and `anisotropy` are set as on any texture. In node it is the 1×1 white data texture every picture is
// there. One for the ui, or in a scene with no render3d, fails.
//
// A picture a wad holds (`world.loader.wads`, `loader.sim.ts`) is never fetched: this half starts the
// wads opening on its first tick, and every picture waits for them. One a wad holds is decoded from its
// bytes, never from its url: in a tab, by the browser into an ImageBitmap, a PixiJS texture of it or a
// three texture of it (turned over as it is decoded, so three draws it upright, sRGB, sampled as its
// entry says) or an `<img>` of it; in node, as a fetched one would be under render3d, and for PixiJS a
// PNG read pixel for pixel, its real size, and nothing else.
//
// A scene naming neither of them still gets its images: a game drawn in the DOM has no renderer to
// ask, so this fetches the file itself and hands back an HTMLImageElement, which is what an `<img>`
// or a CSS background wants.
//
// An entry of type `json`, `palette`, `pixels` or `binary` belongs to no renderer. Its value is this
// client's own decode of the bytes the sim half fetched and decoded for the rules and every actor's
// `def` (`loader.sim.ts`), so the file is downloaded once per page and decoded once per client: a
// json file's parse, a palette's colours as 0xRRGGBB, a picture's pixels and text, and a binary
// file's `{ bytes }`. An actor must not write into it.
//
// An entry of type `sheet` (`loader.sim.ts` says what its files hold) is this client's own read of
// the sheet, with every page decoded as a texture entry would be, for the renderer or for the ui,
// and is handed over once every page has landed as `{ data, pages, texture, uv, pick, frameOf }`:
// `data` is the sheet the rules read; `pages` the decoded pages; `texture(id)` one frame, cut out
// of its page once, for a PixiJS surface, its whole frame its `orig`, the pixels kept its `trim`, and
// turned back upright when they lie turned on the page, so a sprite's anchor is a fraction of the
// whole frame; `uv(id)` where the pixels kept are on their page for three.js, the upright picture's
// top-left, top-right, bottom-left and bottom-right corners, [u, v] each, from 0 to 1 with a page's
// top at v 1, as three turns an image over when it uploads it, for a quad spanning the kept pixels'
// place in the whole frame (the exported `uv`); `pick` and `frameOf` the sim half's questions about
// the sheet. A sheet with `nearest` has every page filtered nearest. A scene with neither renderer
// nor ui has nothing to cut a frame for, and a sheet in one fails. `close` frees the cut frames.
//
// An entry of type `tilemap` is drawn by render2d, and a scene without one fails it. It is handed
// over once every image its tilesets draw from and every image layer's image have landed, as
// `{ map, texture, image, version }`: `map` is this client's own read of the Tiled map; `texture(gid)`
// one tile, cut out of its image once; `image(url)` an image layer's image; and `version` counts the
// times the map has been written, so what drew it knows to draw it again. The entry's `nearest`
// filters every image nearest.
//
// `written(url)` refills every file of
// this client that read that url in place from the file as the sim half now holds it, so the sim
// half's `written` is called first: a json, a palette, a sheet or a pack of it, a map or a tileset of
// it, or a picture a sheet or a map draws from, a page say, which the sim half has counted
// (`rewritten`). A picture written since the process began is fetched by its url with that count in
// its query, `?written=<n>`, so a renderer that keeps a picture by its url, as PixiJS's `Assets`
// does, decodes the file as it now is. A sheet's or a map's new images are decoded first, and its data and images are swapped
// together only once every one has landed, its frames then cut again; if an image fails, it stays
// the old one, whole, and the failure is written to the console once. Of two writes of one file
// whose images land out of order, only the later swaps in: each name counts its writes, and a write
// a later one has followed is dropped when its images land. A name at that url that had failed may
// start again. What a plugin built once from a file, a level's meshes say, it builds again from
// `onWritten(name, f)`, which runs `f` each time a file `name` read is written, once this client's
// copy holds the new text: after the swap for a sheet or a map, and never for a write whose images
// failed or that a later write overtook.
//
// An entry of type `bitmapfont` is an AngelCode BMFont: its `.fnt`, text or XML, and the page images
// it names beside it, decoded for the ui (`for: "ui"`) or for render2d, filtered nearest when the
// entry says `nearest`. It is installed as PixiJS's bitmap font of the entry's name, so a
// `BitmapText` whose style's `fontFamily` is that name, a ui style say, draws with it, and handed
// over as the `BitmapFont`; a name PixiJS already has a font of is that font, one per page. A scene
// with neither to draw it fails it.
//
// An entry of type `font` is a TrueType, OpenType or WOFF file (`.ttf`, `.otf`, `.woff`, `.woff2`),
// installed in the page as the font of the entry's name, so a `Text` whose style's `fontFamily` is
// that name, a ui style say, draws with it, and every other text on the page too: the ui's, render2d's
// and the DOM's alike, whatever the entry is `for`. It is handed over as the `FontFace`. A name the
// page already has a font of from this loader is that font, one per page, so a client made for the
// next scene installs nothing again. Every font is preloaded: each starts on the first tick, whatever
// its entry says, and `fonts()` says whether every font of the catalogue has landed or failed, which
// the ui waits on before it draws its first frame, so no text is ever drawn in the font after it and
// kept in it. Where there is no `FontFace` to install, in node or jsdom, nothing draws text, and a font
// whose file reads is `{ family }`, its name.
//
// An entry of type `model` is one self-contained `.glb` (in any case), decoded once with render3d's
// glTF loader, with three's meshopt decoder, so a glb packed by gltfpack (`EXT_meshopt_compression`)
// decodes as any other; a `.gltf`, which names files beside it, is refused. `model(name)` is `{ scene,
// animations }`, the scene cloned with its skeleton each call, so every row that draws it has a
// skeleton of its own: its meshes' geometry and materials are the decoded model's, shared by every
// copy. In a page, a meshopt-packed glb's buffers are unpacked off the page, in three workers, and no
// more than four models are fetched and decoded at once, the rest waiting their turn in the order they
// were asked for. No entry of any type starts, a model, a binary, a json or a texture alike, until every
// font and every preloaded entry `for: "ui"` has landed or failed: what the ui draws first, a loading
// screen's words and pictures among it (`loader.ui.ts`), comes down before the rest crowds it out.
//
// Whatever has been decoded does not land the moment it is: each tick hands over what has been decoded,
// in the order it was, those fonts and ui entries ahead of everything else, until four milliseconds of
// the tick have gone, and at least one picture each
// tick. A model's pictures and a texture's picture are sent to render3d's GPU first, one picture at a
// time, so the frame that first draws a model does not upload them; the thing then lands, its `on`
// callbacks run and its `load` resolves. So a scene that asks for many models at once has them land
// over several frames, each frame's share of the work no more than four milliseconds, the frame that
// crosses it once its last picture is sent. A client that is never ticked again lands nothing more.
//
// An entry of type `sound` is decoded with `plugins.audio.context.decodeAudioData`, so this half
// never touches Web Audio itself. `sound(name)` is the AudioBuffer.
//
// `beside(name, path)` is the bytes of a file no entry names that entry `name`'s file names, such as
// a music project's samples: `path` read from the folder of the entry's `url`, as a sheet's pages
// and a font's pages are, an `ArrayBuffer`, fetched in a tab and read from disk in node. A file that
// is not there, or cannot be fetched, is `undefined`, and nothing is written to the console: a
// missing file beside an entry is just missing. A name the catalogue has no entry for throws, as
// does any ask before the first tick. The bytes of a file that landed are kept by its url, so asking
// again does not fetch again, until `written` for that url; a missing file is not remembered, and
// every ask for it looks again, so a file put there while the game runs is found.
//
// `shaders()` is how many things are still having their shaders compiled, as the plugin named in the
// scene's `world.loader.mods.shaders` counts them (`render3d.loader.ts`: render3d's own count of what it
// compiles before drawing), 0 when the scene names none; the loading screen waits on it too and says it
// is compiling shaders. It throws, as `provided` does, when the scene names a plugin it does not list.
//
// `settled()` is whether every plugin the scene's `world.loader.mods.ready` names says what it draws
// of the world is whole, each its `ready(plugins)` → boolean (`terrain3d.loader.ts`: the land and
// everything terrain3d's own `mods.ready` waits on, lod3d's tiles say, done where the camera stands);
// true when it names none. The loading screen waits on it too, so the game is never shown in a world
// still being made. It throws, as `provided` does, when the scene names a plugin it does not list.
//
// `preloads()` is `{ done, of }`: how many entries the first tick starts, every one not marked `preload: false` and every
// font, and how many of them have landed or failed, so a loading screen (`loader.ui.ts`) knows how far
// it is and when it is over. Asked before the first tick, it throws, as the catalogue does.
//
// `load(name)` is a promise of the thing, and it never throws. A name that cannot be started — no
// such entry, a type this does not know, a `.gltf`, a scene with nothing to decode it — or a file
// that cannot be fetched or decoded, fails: its promise rejects, and the error, whose message starts
// `loader <name>: `, is written to the console once. A failed name is remembered and never fetched again by itself,
// however many frames ask for it: every later `load` hands back the same rejected promise.
// `retry(name)` starts it again; `written` for its url lets the next tick or `load` start it again.
//
// A fetch takes a different number of milliseconds on every machine, so no row ever carries whether
// an asset has landed — the sim would branch on it and two machines would disagree. An actor asks
// this plugin, or hands it a callback and draws something else until then.
import type { Plugins } from '#engine/browser.ts'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { mod, modsOf, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { uncover } from './loader.ui.ts'
import { beside, decodePng, fetched, frameOf, fresh, inPage, isPng, mount, pick, preloaded as preloads, refill, sealed, writes as rewrites, type Entry, type Frame, type Sheet, type Tiled } from './loader.sim.ts'

export type { Sheet, Tiled }

// The corners of a frame's upright picture: top left, top right, bottom left and bottom right, [u, v]
// each, one after another.
export type Corners = [number, number, number, number, number, number, number, number]

// Where the corners of frame `f`'s kept pixels, upright, are on its page of `width` × `height`
// pixels, for three.js: each [u, v] from 0 to 1 with the page's top at v = 1, as three turns an
// image over when it uploads it. A frame lying turned a quarter clockwise on its page has its top
// row running down its box's right edge.
export function uv(f: Frame, width: number, height: number): Corners {
  const [x, y, w, h] = f.box
  const at = (px: number, py: number) => [px / width, 1 - py / height]
  const corners = f.rotated ? [at(x + w, y), at(x + w, y + h), at(x, y), at(x, y + h)] : [at(x, y), at(x + w, y), at(x, y + h), at(x + w, y + h)]
  return corners.flat() as Corners
}

// A sheet as a page draws it.
export type Decoded = {
  data: Sheet
  pages: any[]
  texture(id: string): any
  uv(id: string): Corners
  pick(clip: string, turns: number): { run: number; mirror: boolean }
  frameOf(clip: string, run: number, i: number): Frame
}

// A Tiled map as a page draws it.
export type DecodedMap = {
  map: Tiled
  texture(gid: number): any
  image(url: string): any
  readonly version: number
}

// Every image a map draws from: its tiles' and its image layers'.
const imagesOf = (m: Tiled) => [...new Set([...Object.values(m.tiles).map(t => t.page), ...m.layers.flatMap(l => (l.kind === 'image' ? [l.image] : []))])]

const white = () => new Uint8Array([255, 255, 255, 255])

// A texture entry's file that is GPU-compressed (KTX2).
const KTX2 = /\.ktx2$/i

// An image as node decodes one: 1×1, and loaded the moment it is given a `src`.
function blank() {
  const heard = new Map<string, (this: unknown) => void>()
  const img = {
    width: 1,
    height: 1,
    addEventListener(type: string, f: (this: unknown) => void) { heard.set(type, f) },
    removeEventListener(type: string) { heard.delete(type) },
    set src(_url: string) { queueMicrotask(() => heard.get('load')?.call(img)) },
  }
  return img
}

// What this half has lent the process and how many models are decoding with it: kept on the global
// object, which every client in the process shares, and not on the lent `document`, which something
// else may take away or put its own in place of while a model decodes.
const LENT = Symbol.for('loader: lent')

// Each font this half installed in the page or is installing, by its name: kept on the global object,
// as the page's fonts are the page's, so every client of the page has the one font of a name.
const FACES = Symbol.for('loader: fonts')
type Lent = { decoding: number; document?: object; self: boolean }

// Lends node the `self` and the `document` three's glTF loader decodes a model's images with, for
// as long as any model is decoding, and hands back the function that gives them back. Each start
// lends whichever of the two is missing, so a model that starts after something took a lent
// `document` away, or put its own in place, decodes too. The count of models decoding is one for
// both, so neither is taken back while any model decodes; once the last has finished, each is
// taken back if it is still the one lent, and one this did not lend is left alone.
function lend(): () => void {
  const g = globalThis as any
  const lent: Lent = (g[LENT] ??= { decoding: 0, self: false })
  if (g.document === undefined) g.document = lent.document = { createElementNS: blank }
  if (g.self === undefined) {
    g.self = g
    lent.self = true
  }
  lent.decoding++
  return () => {
    if (--lent.decoding > 0) return
    if (lent.document !== undefined && g.document === lent.document) delete g.document
    if (lent.self && g.self === g) delete g.self
    delete g[LENT]
  }
}

export function loader() {
  const made = new Map<string, any>()
  const waiting = new Map<string, ((thing: any) => void)[]>()
  const going = new Map<string, Promise<any>>() // every name started, a failed one included
  const failed = new Set<string>() // the names whose start failed, until `retry` or `written`
  const wanted = new Set<string>()
  const files = new Map<string, Promise<any>>() // each json, sheet, palette and tilemap file this client decoded, by name
  const urlsOf = new Map<string, string[]>() // every url each of those read, by name
  const picturesOf = new Map<string, string[]>() // every picture each sheet and map draws from, by name
  const images = new Map<string, Promise<HTMLImageElement>>() // each DOM image, by url
  const cutOf = new Map<string, Map<string | number, any>>() // each sheet's frames and map's tiles cut, by name, freed on close
  const imagesFor = new Map<string, Map<string, any>>() // each map's images, by name, then url
  const versions = new Map<string, { n: number }>() // how many times each map has been written, by name
  const writes = new Map<string, number>() // how many times each name has been written, so only the last swaps in
  const heard = new Map<string, (() => void)[]>() // what each name's `onWritten` runs
  const besides = new Map<string, Promise<ArrayBuffer | undefined>>() // each file beside an entry landed or on its way, by url
  let plugins: Plugins | undefined
  let preloaded = false
  // How many models are fetched and decoded at once, the milliseconds of a tick spent handing over
  // what has decoded, and the workers that unpack a meshopt glb's buffers.
  const decoding = 4, budget = 4, workers = 3
  let decodingNow = 0 // models fetching or decoding
  const turns: (() => void)[] = [] // each model waiting for its turn to decode, first first
  let firstIn: Promise<unknown> = Promise.resolve() // every font and preloaded ui entry landed or failed, from the first tick
  // render3d's renderer, the first tick it has one: what a KTX2 texture is transcoded for
  let haveRenderer!: (r: any) => void
  const rendered = new Promise<any>(ok => { haveRenderer = ok })
  let ktx2: KTX2Loader | undefined // three's KTX2 reader, made the first time a page decodes a KTX2 texture
  // What has decoded and waits to land in a page: its pictures not yet sent to the GPU, first first.
  const settling: { name: string; thing: any; pictures: any[]; ok: (thing: any) => void }[] = []
  let ticked!: () => void
  const first = new Promise<void>(ok => { ticked = ok })

  // The catalogue, off the scene's `world` on the first tick.
  let assets: Record<string, Entry> | undefined
  const catalogue = (): Record<string, Entry> => {
    if (!assets) throw new Error('the loader has not ticked yet')
    return assets
  }
  const entry = (name: string): Entry => {
    const it = catalogue()[name]
    if (!it) throw new Error(`loader has no ${name}`)
    return it
  }

  const land = (name: string, thing: any) => {
    made.set(name, thing)
    for (const f of waiting.get(name) ?? []) f(thing)
    waiting.delete(name)
  }

  // A model's turn to fetch and decode, and the function that ends it: once every font and every
  // preloaded entry for the ui is in, at once while fewer than `decoding` are, else once one ahead of
  // it has finished.
  const turn = (): Promise<() => void> => firstIn.then(() => {
    const end = () => {
      decodingNow--
      turns.shift()?.()
    }
    if (decodingNow < decoding) {
      decodingNow++
      return end
    }
    return new Promise<() => void>(ok => turns.push(() => { decodingNow++; ok(end) }))
  })

  // Every picture of render3d's that `thing`, an entry of type `type` decoded for the scene's
  // renderer, draws: a texture's own, and every texture of every material of a model's meshes.
  const uploads = (type: string, ui: boolean, thing: any): any[] => {
    if (ui || !plugins?.render3d) return []
    if (type === 'texture') return [thing]
    if (type !== 'model') return []
    const found = new Set<any>()
    thing.scene.traverse((o: any) => {
      if (!o.material) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const v of Object.values(m)) if ((v as any)?.isTexture) found.add(v)
      }
    })
    return [...found]
  }

  // What the ui draws first, the loading screen among it: every font, and every entry for the ui the
  // first tick starts.
  const uiFirst = (it: Entry) => it.type === 'font' || (it.for === 'ui' && preloads(it))

  // `thing` landed as `name` on a tick, once its pictures are on the GPU; what the ui draws first goes
  // ahead of everything else waiting.
  const settle = (name: string, thing: any): Promise<any> => {
    const it = catalogue()[name]
    return new Promise(ok => {
      const s = { name, thing, pictures: uploads(it.type, it.for === 'ui', thing), ok }
      if (!uiFirst(it)) return settling.push(s)
      const at = settling.findIndex(w => !uiFirst(catalogue()[w.name]))
      settling.splice(at < 0 ? settling.length : at, 0, s)
    })
  }

  // Hands over what has decoded, first first, until `budget` milliseconds have gone, sending each
  // thing's pictures to the GPU before it lands; at least one picture, or one thing with none.
  const settleSome = (p: Plugins) => {
    const began = performance.now()
    const renderer = p.render3d?.renderer
    while (settling.length) {
      const s = settling[0]
      while (s.pictures.length) {
        const picture = s.pictures.shift()
        if (renderer) renderer.initTexture(picture)
        if (s.pictures.length && performance.now() - began >= budget) return
      }
      settling.shift()
      land(s.name, s.thing)
      s.ok(s.thing)
      if (performance.now() - began >= budget) return
    }
  }

  // The DOM's image of `blob`.
  const element = (blob: Blob) => {
    const img = new Image()
    img.src = URL.createObjectURL(blob)
    return img.decode().then(() => img)
  }

  // The DOM's image at `url`.
  const image = (url: string) => {
    const at = current(url)
    const had = images.get(at)
    if (had) return had
    const img = fetch(encodeURI(at))
      .then(res => { if (!res.ok) throw new Error(`loader could not fetch ${url}: ${res.status}`); return res.blob() })
      .then(element)
    images.set(at, img)
    img.catch(() => images.delete(at))
    return img
  }

  // The url a picture is fetched at: its own, with how many times it has been written in the query
  // once it has been.
  const current = (url: string) => (rewrites(url) ? `${url}?written=${rewrites(url)}` : url)

  // The image at `url`, decoded for the ui, else for the scene's renderer, else for the DOM: from a
  // wad's bytes when one holds it, else fetched.
  const decode = (p: Plugins, url: string, ui: boolean): Promise<any> =>
    sealed(url).then(bytes => (bytes ? unwrapped(p, url, bytes, ui) : stored(p, url, ui)))

  // The image of the bytes a wad holds at `url`, decoded as `decode` decodes a fetched one. A tab
  // decodes any picture its browser does, into an ImageBitmap; node decodes none, so under render3d it
  // is the 1×1 white data texture a fetched one is, and for PixiJS a PNG is read pixel for pixel
  // (`decodePng`) and anything else refused.
  const unwrapped = async (p: Plugins, url: string, bytes: ArrayBuffer, ui: boolean): Promise<any> => {
    if (!ui && p.render3d) {
      const { THREE } = p.render3d
      if (!inPage()) return stored(p, url, ui)
      const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      const tex = new THREE.Texture(bitmap)
      tex.flipY = false
      tex.colorSpace = THREE.SRGBColorSpace
      tex.needsUpdate = true
      return tex
    }
    const PIXI = ui ? p.ui.PIXI : p.render2d?.PIXI
    if (!PIXI) return element(new Blob([bytes]))
    if (inPage()) return new PIXI.Texture({ source: new PIXI.ImageSource({ resource: await createImageBitmap(new Blob([bytes])) }) })
    const b = new Uint8Array(bytes)
    if (!isPng(b)) throw new Error(`node decodes no picture but a PNG out of a wad, and ${url} is not one`)
    const { width, height, data } = decodePng(b)
    return new PIXI.Texture({ source: new PIXI.BufferImageSource({ resource: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width, height }) })
  }

  // The image at `url`, fetched, decoded for the ui, else for the scene's renderer, else for the DOM.
  const stored = (p: Plugins, url: string, ui: boolean): Promise<any> => {
    if (ui) return p.ui.PIXI.Assets.load(encodeURI(current(url)))
    if (p.render3d) {
      const { THREE } = p.render3d
      if (!inPage()) {
        const tex = new THREE.DataTexture(white(), 1, 1)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.needsUpdate = true
        return Promise.resolve(tex)
      }
      return new Promise((ok, no) => new THREE.TextureLoader().load(
        encodeURI(current(url)),
        (tex: any) => { tex.colorSpace = THREE.SRGBColorSpace; ok(tex) },
        undefined,
        () => no(new Error(`loader could not fetch ${url}`)),
      ))
    }
    if (p.render2d) return p.render2d.PIXI.Assets.load(encodeURI(current(url)))
    return image(url)
  }

  // The GPU-compressed texture of the `.ktx2` file at `url`, transcoded by three's KTX2 reader into what
  // this GPU reads (KTX2, below): in node, the 1×1 white data texture every picture is there.
  const compressed = async (p: Plugins, url: string): Promise<any> => {
    if (!inPage()) return stored(p, url, false)
    const bytes = await fetched(url)
    const renderer = await rendered
    if (!ktx2) {
      ktx2 = new KTX2Loader().setTranscoderPath(new URL('./basis/', import.meta.url).href)
      ktx2.detectSupport(renderer)
    }
    // the reader hands the bytes to its worker, which takes them from this thread: a copy, so the bytes
    // the loader keeps for the url stay whole
    return new Promise((ok, no) => ktx2!.parse(bytes.slice(0), ok, no))
  }

  // A three texture sampled as its entry says: its colour space, its wrapping and its anisotropy.
  const sampled = (p: Plugins, tex: any, it: Entry) => {
    if (it.space === undefined && it.wrap === undefined && it.anisotropy === undefined) return tex
    const { THREE } = p.render3d
    if (it.space === 'linear') tex.colorSpace = THREE.NoColorSpace
    if (it.wrap === 'repeat') tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    if (it.anisotropy !== undefined) tex.anisotropy = it.anisotropy
    tex.needsUpdate = true
    return tex
  }

  // Images, each filtered nearest for pixel art.
  const imagesAt = (p: Plugins, urls: string[], nearest: boolean, ui: boolean): Promise<any[]> => Promise.all(urls.map(url => decode(p, url, ui))).then(pages => {
    if (nearest) for (const page of pages) {
      if (p.render3d && !ui) {
        const { THREE } = p.render3d
        page.magFilter = page.minFilter = THREE.NearestFilter
        page.generateMipmaps = false
        page.needsUpdate = true
      } else page.source.scaleMode = 'nearest'
    }
    return pages
  })
  const pagesOf = (p: Plugins, data: Sheet, ui: boolean) => imagesAt(p, data.pages, data.nearest, ui)
  // A map's images, by url.
  const mapImages = (p: Plugins, map: Tiled, nearest: boolean): Promise<Map<string, any>> => {
    const urls = imagesOf(map)
    return imagesAt(p, urls, nearest, false).then(got => new Map(urls.map((u, i) => [u, got[i]])))
  }

  // The sheet `name` as a page draws it, its frames cut from its pages once each.
  const decoded = (p: Plugins, name: string, data: Sheet, pages: any[], ui: boolean): Decoded => {
    const PIXI = ui ? p.ui.PIXI : p.render2d?.PIXI
    const textures = new Map<string, any>()
    cutOf.set(name, textures)
    return {
      data,
      pages,
      texture(id) {
        const had = textures.get(id)
        if (had) return had
        if (!PIXI) throw new Error('a sheet\'s frames are cut as textures for a PixiJS surface, and this one is decoded for three')
        const f = data.frames[id]
        if (!f) throw new Error(`the sheet has no frame ${id}`)
        const page = pages[f.page], [x, y, w, h] = f.box, [tx, ty, tw, th] = f.trim
        const trimmed = tx !== 0 || ty !== 0 || tw !== f.size[0] || th !== f.size[1]
        const made = new PIXI.Texture({
          source: page.source,
          frame: new PIXI.Rectangle(page.frame.x + x, page.frame.y + y, w, h),
          orig: new PIXI.Rectangle(0, 0, f.size[0], f.size[1]),
          ...(trimmed && { trim: new PIXI.Rectangle(tx, ty, tw, th) }),
          // PixiJS's quarter turn, which undoes TexturePacker's.
          rotate: f.rotated ? 2 : 0,
        })
        textures.set(id, made)
        return made
      },
      uv(id) {
        const f = data.frames[id]
        if (!f) throw new Error(`the sheet has no frame ${id}`)
        const { width, height } = pages[f.page].image
        return uv(f, width, height)
      },
      pick: (clip, turns) => pick(data, clip, turns),
      frameOf: (clip, run, i) => frameOf(data, clip, run, i),
    }
  }

  // A map as a page draws it, its tiles cut from its images once each.
  const decodedMap = (p: Plugins, name: string, map: Tiled, images: Map<string, any>): DecodedMap => {
    const { PIXI } = p.render2d
    const textures = new Map<string | number, any>()
    const written = { n: 0 }
    cutOf.set(name, textures)
    imagesFor.set(name, images)
    versions.set(name, written)
    return {
      map,
      texture(gid) {
        const had = textures.get(gid)
        if (had) return had
        const t = map.tiles[gid]
        if (!t) throw new Error(`the map has no tile ${gid}`)
        const page = images.get(t.page), [x, y, w, h] = t.box
        const made = new PIXI.Texture({ source: page.source, frame: new PIXI.Rectangle(page.frame.x + x, page.frame.y + y, w, h) })
        textures.set(gid, made)
        return made
      },
      image(url) {
        const got = images.get(url)
        if (!got) throw new Error(`the map draws no image ${url}`)
        return got
      },
      get version() { return written.n },
    }
  }

  // This client's decode of a json, sheet, palette or tilemap entry's file, from the bytes the sim
  // half fetched.
  const parsed = (name: string, it: Entry): Promise<any> => {
    const had = files.get(name)
    if (had) return had
    const made = fresh(name, it).then(({ value, urls }) => {
      urlsOf.set(name, urls)
      return value
    })
    files.set(name, made)
    made.catch(() => files.delete(name))
    return made
  }

  // What an entry decodes to, once whatever it needs has landed.
  const decodeEntry = (p: Plugins, name: string, it: Entry): Promise<any> => {
    const ui = it.for === 'ui'
    if (it.type === 'json' || it.type === 'palette' || it.type === 'pixels' || it.type === 'binary') return parsed(name, it)
    if (it.type === 'texture' && KTX2.test(it.url)) return compressed(p, it.url).then(tex => sampled(p, tex, it))
    if (it.type === 'texture') return decode(p, it.url, ui).then(tex => (p.render3d && !ui ? sampled(p, tex, it) : tex))
    if (it.type === 'sheet') return parsed(name, it).then((data: Sheet) => {
      picturesOf.set(name, data.pages)
      return pagesOf(p, data, ui).then(pages => decoded(p, name, data, pages, ui))
    })
    if (it.type === 'tilemap') return parsed(name, it).then((map: Tiled) => {
      picturesOf.set(name, imagesOf(map))
      return mapImages(p, map, !!it.nearest).then(images => decodedMap(p, name, map, images))
    })
    if (it.type === 'bitmapfont') {
      const { PIXI } = ui ? p.ui : p.render2d
      // one font of a name, the same file whichever client decodes it: the first one installed
      const had = PIXI.Cache.has(`${name}-bitmap`) ? PIXI.Cache.get(`${name}-bitmap`) : undefined
      if (had) return Promise.resolve(had)
      return fetched(it.url).then(async bytes => {
        const text = new TextDecoder().decode(bytes)
        const data = PIXI.bitmapFontTextParser.test(text) ? PIXI.bitmapFontTextParser.parse(text) : PIXI.bitmapFontXMLStringParser.parse(text)
        const pages = await imagesAt(p, data.pages.map((page: { file: string }) => beside(it.url, page.file)), !!it.nearest, ui)
        const font = new PIXI.BitmapFont({ data: { ...data, fontFamily: name }, textures: pages })
        PIXI.Cache.set(`${name}-bitmap`, font)
        return font
      })
    }
    if (it.type === 'font') {
      if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) return fetched(it.url).then(() => ({ family: name }))
      // one font of a name in the page, whichever client installs it first
      const g = globalThis as any
      const faces: Map<string, Promise<FontFace>> = (g[FACES] ??= new Map())
      const had = faces.get(name)
      if (had) return had
      const coming = fetched(it.url).then(async bytes => {
        const face = new FontFace(name, bytes)
        await face.load()
        document.fonts.add(face)
        return face
      })
      faces.set(name, coming)
      coming.catch(() => faces.delete(name))
      return coming
    }
    if (it.type === 'model') {
      const { GLTFLoader } = p.render3d
      return turn().then(end => fetched(it.url).then(bytes => {
        const giveBack = inPage() ? () => {} : lend()
        return new Promise((ok, no) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(bytes, '', ok, no)).finally(giveBack)
      }).finally(end))
    }
    return fetched(it.url).then(bytes => p.audio.context.decodeAudioData(bytes))
  }

  // What `name` decodes to; it throws for an entry that cannot be started here.
  const begin = (p: Plugins, name: string): Promise<any> => {
    const it = catalogue()[name]
    if (!it) throw new Error('the catalogue has no such entry')
    if (!['json', 'palette', 'pixels', 'binary', 'texture', 'sheet', 'tilemap', 'bitmapfont', 'font', 'model', 'sound'].includes(it.type)) throw new Error(`no type ${it.type} is known`)
    if (it.for !== undefined && it.for !== 'ui') throw new Error(`it is for ${it.for}; an entry is for the scene's renderer, or for ui`)
    if (it.for === 'ui' && !p.ui) throw new Error('it is for ui, which this scene does not name')
    if (it.type === 'sheet' && it.for !== 'ui' && !p.render3d && !p.render2d) throw new Error('a sheet, and this scene names no renderer and no ui to cut it for')
    if (it.type === 'tilemap' && (it.for !== undefined || !p.render2d)) throw new Error('a tilemap, and this scene names no render2d to draw it')
    if (it.type === 'bitmapfont' && !(it.for === 'ui' ? p.ui : p.render2d)) throw new Error('a bitmap font, and this scene names no render2d, nor ui with the entry for it, to draw it')
    if (it.type === 'model' && !/\.glb$/i.test(it.url)) throw new Error('a model is one .glb')
    if (it.type === 'texture' && KTX2.test(it.url) && (it.for === 'ui' || !p.render3d)) throw new Error('a .ktx2 texture is GPU-compressed for render3d, and this one is for ui or a scene with no render3d')
    if (it.type === 'model' && !p.render3d) throw new Error('a model, and this scene names no render3d to decode it')
    if (it.type === 'sound' && !p.audio) throw new Error('a sound, and this scene names no audio to decode it')
    if ((it.space !== undefined || it.wrap !== undefined || it.anisotropy !== undefined) && (it.type !== 'texture' || it.for === 'ui' || !p.render3d)) {
      throw new Error('space, wrap and anisotropy are a texture\'s that render3d samples')
    }
    if (it.space !== undefined && it.space !== 'linear') throw new Error(`its space is ${it.space}, and a texture's is linear or left out`)
    if (it.wrap !== undefined && it.wrap !== 'repeat') throw new Error(`its wrap is ${it.wrap}, and a texture's is repeat or left out`)
    if (it.anisotropy !== undefined && !(Number.isInteger(it.anisotropy) && it.anisotropy >= 1)) throw new Error(`its anisotropy is ${it.anisotropy}, and a texture's is a whole number from 1`)
    // What the ui draws first starts at once; everything else waits until it is in.
    return uiFirst(it) ? decodeEntry(p, name, it) : firstIn.then(() => decodeEntry(p, name, it))
  }

  // Every failure of `name` says so first, in these words.
  const failure = (name: string, e: Error) => new Error(e.message.startsWith(`loader ${name}: `) ? e.message : `loader ${name}: ${e.message}`)

  // An actor's `setup` runs before any plugin's `tick` on the frame its row is born, so on the
  // first frame this plugin has no packet yet and cannot read the catalogue. A name asked for then
  // starts once the first tick has read it.
  //
  // Every start carries its one handler, which writes a failure to the console, so a promise no
  // caller holds on to is never an unhandled rejection, and a failure is written once.
  const start = (name: string): Promise<any> => {
    const had = going.get(name)
    if (had) return had
    if (!plugins) {
      const later = first.then(() => start(name))
      later.catch(() => {})
      return later
    }
    let attempt: Promise<any>
    try { attempt = begin(plugins, name) } catch (e) { attempt = Promise.reject(e) }
    const coming = attempt.then(
      thing => settle(name, thing),
      (e: Error) => {
        failed.add(name)
        throw failure(name, e)
      },
    )
    coming.catch(e => console.error(e))
    going.set(name, coming)
    return coming
  }

  // `name` may be started again.
  const forget = (name: string) => {
    if (!failed.delete(name)) return
    going.delete(name)
  }

  // The landed thing `name`, which is of type `type`.
  const landed = (name: string, type: string) => {
    const it = entry(name)
    if (it.type !== type) throw new Error(`loader ${name} is a ${it.type}, not a ${type}`)
    if (!made.has(name)) throw new Error(`loader has not finished ${name}`)
    return made.get(name)
  }

  return {
    tick(p: Plugins) {
      plugins = p
      assets = p.wire.scene.world?.loader?.assets
      if (!assets) throw new Error('the scene\'s world has no loader catalogue')
      if (!preloaded) {
        if (inPage()) MeshoptDecoder.useWorkers(workers)
        preloaded = true
        mount(p.wire.scene.world ?? {}).catch(e => console.error(e))
        for (const [name, it] of Object.entries(catalogue())) if (preloads(it) || it.type === 'font') wanted.add(name)
        firstIn = Promise.allSettled(Object.entries(catalogue()).filter(([, it]) => uiFirst(it)).map(([name]) => start(name)))
        // The page's loading cover (`loader.cover.ts`) stays up until the ui's loading screen is drawn
        // under it (`loader.ui.ts`); a scene that shows none takes it off now.
        const panels = Object.values((p.wire.scene.world?.ui?.panels ?? {}) as Record<string, { loading?: unknown }>)
        if (!p.ui || !panels.some(panel => panel.loading)) uncover()
        ticked()
      }
      if (p.render3d?.renderer) haveRenderer(p.render3d.renderer)
      for (const name of wanted) void start(name)
      settleSome(p)
    },
    // The catalogue's entry `name`, or undefined when it has none: for a plugin that asks what kind of
    // file a name is, and so never reads `world.loader` itself.
    catalogued(name: string): Entry | undefined { return catalogue()[name] },
    // The thing, or undefined while it is still coming.
    get(name: string) { return made.get(name) },
    ready(name: string) { return made.has(name) },
    load(name: string): Promise<any> { wanted.add(name); return start(name) },
    // Starts a failed name again.
    retry(name: string): Promise<any> { forget(name); wanted.add(name); return start(name) },
    // Runs once the asset is here, or straight away if it already is.
    on(name: string, f: (thing: any) => void) {
      const had = made.get(name)
      if (had) return f(had)
      waiting.set(name, [...(waiting.get(name) ?? []), f])
      wanted.add(name)
      void start(name)
    },
    // A model's scene, cloned with its skeleton, and its clips.
    model(name: string): { scene: any; animations: any[] } {
      const gltf = landed(name, 'model')
      return { scene: plugins!.render3d.SkeletonUtils.clone(gltf.scene), animations: gltf.animations }
    },
    sound(name: string): AudioBuffer { return landed(name, 'sound') },
    // The bytes of the file at `path` beside entry `name`'s file, or undefined when it is not there.
    beside(name: string, path: string): Promise<ArrayBuffer | undefined> {
      const url = beside(entry(name).url, path)
      const had = besides.get(url)
      if (had) return had
      const coming = fetched(url).then(bytes => bytes, () => {
        besides.delete(url)
        return undefined
      })
      besides.set(url, coming)
      return coming
    },
    // Runs `f` each time a file `name` read is written, once this client's copy of it holds the new
    // text.
    onWritten(name: string, f: () => void) {
      heard.set(name, [...(heard.get(name) ?? []), f])
    },
    async written(url: string) {
      besides.delete(url)
      if (!plugins) return
      const p = plugins
      const at = Object.entries(catalogue()).filter(([name, it]) => it.url === url || urlsOf.get(name)?.includes(url) || picturesOf.get(name)?.includes(url))
      for (const [name] of at) forget(name)
      // Whether this client's copy of `name` now holds the new text: a copy it never decoded is the
      // sim half's, which holds it already.
      const refilled = async (name: string, it: Entry): Promise<boolean> => {
        if (!files.has(name)) return true
        const write = (writes.get(name) ?? 0) + 1
        writes.set(name, write)
        const data = await files.get(name)!
        const next = await fresh(name, it)
        if (writes.get(name) !== write) return false
        const drawn = made.get(name)
        if ((it.type !== 'sheet' && it.type !== 'tilemap') || !drawn) {
          urlsOf.set(name, next.urls)
          refill(data, next.value)
          return true
        }
        // The new images first: what is drawn stays the old one, whole, until every one has landed,
        // and stays it if one fails.
        let images: any
        try {
          images = it.type === 'sheet' ? await pagesOf(p, next.value, it.for === 'ui') : await mapImages(p, next.value, !!it.nearest)
        } catch (e) {
          if (writes.get(name) === write) console.error(failure(name, e as Error))
          return false
        }
        // A later write has started since: its images are the ones to swap in, whenever they land.
        if (writes.get(name) !== write) return false
        urlsOf.set(name, next.urls)
        picturesOf.set(name, it.type === 'sheet' ? next.value.pages : imagesOf(next.value))
        refill(data, next.value)
        if (it.type === 'sheet') drawn.pages.splice(0, drawn.pages.length, ...images)
        else {
          const had = imagesFor.get(name)!
          had.clear()
          for (const [u, image] of images) had.set(u, image)
          versions.get(name)!.n++
        }
        const cut = cutOf.get(name)!
        for (const t of cut.values()) t.destroy()
        cut.clear()
        return true
      }
      await Promise.all(at.map(async ([name, it]) => {
        if (await refilled(name, it)) for (const f of heard.get(name) ?? []) f()
      }))
    },
    // Whether every font of the catalogue has landed or failed; false before the first tick.
    fonts(): boolean {
      return !!assets && Object.entries(assets).every(([name, it]) => it.type !== 'font' || made.has(name) || failed.has(name))
    },
    // How many of the ones started and not failed are here.
    progress() { return { done: made.size, started: going.size - failed.size } },
    // How many things are still having their shaders compiled, by the plugin the scene's
    // `world.loader.mods.shaders` names; 0 when it names none.
    shaders(): number {
      const world = plugins!.wire.scene.world!
      const f = mod<(p: Plugins) => number>(world, 'loader', 'shaders')
      if (!f) return 0
      provided(plugins!.wire.scene, 'loader', 'shaders')
      return f(plugins!)
    },
    // Whether every plugin the scene's `world.loader.mods.ready` names says the world it draws is
    // whole; true when it names none.
    settled(): boolean {
      const scene = plugins!.wire.scene
      provided(scene, 'loader', 'ready')
      return modsOf<(p: Plugins) => boolean>(scene.world!, 'loader', 'ready').every(f => f(plugins!))
    },
    // Of the catalogue's entries the first tick starts, every `preload` and every font, how many there
    // are and how many have landed or failed: what a loading screen waits on.
    // `file` is the name of a file still coming down, '' once none is.
    preloads(): { done: number; of: number; file: string } {
      const first = Object.entries(catalogue()).filter(([, it]) => preloads(it) || it.type === 'font')
      const coming = first.find(([name]) => !made.has(name) && !failed.has(name))
      const file = coming ? coming[1].url.split('/').pop()! : ''
      return { done: first.filter(([name]) => made.has(name) || failed.has(name)).length, of: first.length, file }
    },
    close() {
      for (const frames of cutOf.values()) for (const t of frames.values()) t.destroy()
      cutOf.clear()
      settling.length = 0
      ktx2?.dispose()
      ktx2 = undefined
    },
  }
}
