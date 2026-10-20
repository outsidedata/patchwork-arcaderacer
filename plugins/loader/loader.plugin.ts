// The browser half of loader. The catalogue is the scene's `world.loader.assets`, which no packet
// carries: this client reads it off its own scene. Everything marked `preload` starts on the first
// tick; anything else starts when something calls `load` or `on`. A name asked for before the first
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
// `file(name)` is a json, palette, pixels, binary or tilemap entry's value or a sheet entry's `data`, without an
// image decoded: what the editor reads off the running game. `written(url)` refills every file of
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
// An entry of type `model` is one self-contained `.glb` (in any case), decoded once with render3d's
// glTF loader, with three's meshopt decoder, so a glb packed by gltfpack (`EXT_meshopt_compression`)
// decodes as any other; a `.gltf`, which names files beside it, is refused. `model(name)` is `{ scene,
// animations }`, the scene cloned with its skeleton each call, so every row that draws it has a
// skeleton of its own.
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
import { beside, decodePng, fetched, frameOf, fresh, inPage, isPng, mount, pick, refill, sealed, writes as rewrites, type Entry, type Frame, type Sheet, type Tiled } from './loader.sim.ts'

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
    if (it.type === 'model') {
      const { GLTFLoader } = p.render3d
      return fetched(it.url).then(bytes => {
        const giveBack = inPage() ? () => {} : lend()
        return new Promise((ok, no) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(bytes, '', ok, no)).finally(giveBack)
      })
    }
    return fetched(it.url).then(bytes => p.audio.context.decodeAudioData(bytes))
  }

  // What `name` decodes to; it throws for an entry that cannot be started here.
  const begin = (p: Plugins, name: string): Promise<any> => {
    const it = catalogue()[name]
    if (!it) throw new Error('the catalogue has no such entry')
    if (!['json', 'palette', 'pixels', 'binary', 'texture', 'sheet', 'tilemap', 'bitmapfont', 'model', 'sound'].includes(it.type)) throw new Error(`no type ${it.type} is known`)
    if (it.for !== undefined && it.for !== 'ui') throw new Error(`it is for ${it.for}; an entry is for the scene's renderer, or for ui`)
    if (it.for === 'ui' && !p.ui) throw new Error('it is for ui, which this scene does not name')
    if (it.type === 'sheet' && it.for !== 'ui' && !p.render3d && !p.render2d) throw new Error('a sheet, and this scene names no renderer and no ui to cut it for')
    if (it.type === 'tilemap' && (it.for !== undefined || !p.render2d)) throw new Error('a tilemap, and this scene names no render2d to draw it')
    if (it.type === 'bitmapfont' && !(it.for === 'ui' ? p.ui : p.render2d)) throw new Error('a bitmap font, and this scene names no render2d, nor ui with the entry for it, to draw it')
    if (it.type === 'model' && !/\.glb$/i.test(it.url)) throw new Error('a model is one .glb')
    if (it.type === 'model' && !p.render3d) throw new Error('a model, and this scene names no render3d to decode it')
    if (it.type === 'sound' && !p.audio) throw new Error('a sound, and this scene names no audio to decode it')
    if ((it.space !== undefined || it.wrap !== undefined || it.anisotropy !== undefined) && (it.type !== 'texture' || it.for === 'ui' || !p.render3d)) {
      throw new Error('space, wrap and anisotropy are a texture\'s that render3d samples')
    }
    if (it.space !== undefined && it.space !== 'linear') throw new Error(`its space is ${it.space}, and a texture's is linear or left out`)
    if (it.wrap !== undefined && it.wrap !== 'repeat') throw new Error(`its wrap is ${it.wrap}, and a texture's is repeat or left out`)
    if (it.anisotropy !== undefined && !(Number.isInteger(it.anisotropy) && it.anisotropy >= 1)) throw new Error(`its anisotropy is ${it.anisotropy}, and a texture's is a whole number from 1`)
    return decodeEntry(p, name, it)
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
      thing => { land(name, thing); return thing },
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

  // A json, palette, pixels, binary or tilemap entry's value, or a sheet entry's `data`, with no image decoded.
  const file = async (name: string): Promise<any> => {
    if (!plugins) await first
    const it = entry(name)
    if (!['json', 'sheet', 'palette', 'pixels', 'binary', 'tilemap'].includes(it.type)) throw new Error(`loader ${name} is a ${it.type}, not a json, sheet, palette, pixels, binary or tilemap file`)
    return parsed(name, it)
  }

  return {
    tick(p: Plugins) {
      plugins = p
      assets = p.wire.scene.world?.loader?.assets
      if (!assets) throw new Error('the scene\'s world has no loader catalogue')
      if (!preloaded) {
        preloaded = true
        mount(p.wire.scene.world ?? {}).catch(e => console.error(e))
        for (const [name, it] of Object.entries(catalogue())) if (it.preload) wanted.add(name)
        ticked()
      }
      for (const name of wanted) void start(name)
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
    file,
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
    // How many of the ones started and not failed are here.
    progress() { return { done: made.size, started: going.size - failed.size } },
    close() {
      for (const frames of cutOf.values()) for (const t of frames.values()) t.destroy()
      cutOf.clear()
    },
  }
}
