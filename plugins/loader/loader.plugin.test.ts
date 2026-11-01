// The browser half of loader: which decoder each catalogue entry goes through, what each client
// keeps, and what a failure does. An entry for the scene's renderer is decoded by that renderer —
// in a 3D scene in a page, three's TextureLoader — and an entry `for` the ui by the ui's PixiJS, so
// a 3D scene's HUD is handed a texture PixiJS can draw. The page's decoders are stood in for by
// ones that hand back what they were asked for, marked with the url. A test that runs as a page
// gives the process a `location` while it runs, and a `fetch` that writes down each url it is
// handed and answers from the working directory, as the dev server does. Node itself has no page,
// and there an image is a 1×1 white data texture, so a model with a texture decodes too: the model
// here is a glb this file builds, one skinned triangle with a png on it and a clip. A json entry
// goes through no decoder: an actor is handed its own client's parse of the bytes the sim half
// fetched. The files this file writes are in a folder of its own in the system's temporary folder,
// named by a url that is their path from the working directory, where the loader reads a url from in
// node, and go when it is done. A failure is written to the console
// once; the tests that fail on purpose count those writes and keep them off the output.
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import * as PIXI from 'pixi.js'
import { loader } from './loader.plugin.ts'
import { jsonAt, rewritten, tiledAt, writes, written } from './loader.sim.ts'

const folder = mkdtempSync(join(tmpdir(), 'loader-plugin-'))
afterAll(() => rmSync(folder, { recursive: true }))
// A file of this test's, and its url: a plain path from the working directory.
const file = (name: string, bytes: string | Uint8Array) => {
  writeFileSync(join(folder, name), bytes)
  return '/' + relative(process.cwd(), join(folder, name))
}

const wireOf = (assets: Record<string, any>) => ({ rows: [{ id: 1, kind: 'loader', data: {} }], scene: { world: { loader: { assets } } } })

// Every failure the loader writes to the console, and every rejection nobody handled.
let errors: unknown[] = []
const unhandled: unknown[] = []
process.on('unhandledRejection', e => { unhandled.push(e) })
beforeEach(() => {
  errors = []
  vi.spyOn(console, 'error').mockImplementation((e: unknown) => { errors.push(e) })
})
afterEach(async () => {
  await new Promise(r => setTimeout(r, 0))
  vi.restoreAllMocks()
  expect(unhandled).toEqual([])
})

// Each url a page fetched.
const fetchedUrls: string[] = []
// While `f` runs, and until what it waits for has landed, the process is a page.
async function asPage(f: () => Promise<void>) {
  fetchedUrls.length = 0
  vi.stubGlobal('location', { href: 'http://page/' })
  vi.stubGlobal('fetch', async (url: string) => {
    fetchedUrls.push(url)
    try { return new Response(readFileSync(join(process.cwd(), decodeURIComponent(url)))) } catch { return new Response('', { status: 404 }) }
  })
  try { await f() } finally { vi.unstubAllGlobals() }
}

const frame = () => new Promise(r => setTimeout(r, 2))

const assets = {
  coin: { type: 'texture', url: '/coin.png', preload: true },
  'coin-icon': { type: 'texture', url: '/coin.png', preload: true, for: 'ui' },
  odd: { type: 'texture', url: '/odd.png', for: 'hud' },
}
const wire = wireOf(assets)

const asked: string[] = []
const pageThree = {
  THREE: {
    SRGBColorSpace: 'srgb',
    NearestFilter: 'nearest',
    TextureLoader: class {
      load(url: string, ok: (t: any) => void, _progress: unknown, no: () => void) {
        asked.push(url)
        if (url.includes('missing')) setTimeout(no, 1)
        else ok({ three: url })
      }
    },
  },
}
const ui = { PIXI: { Assets: { load: async (url: string) => ({ pixi: url }) } } }

test('in a 3D scene in a page, an entry for the ui is a PixiJS texture and an entry for the scene is three\'s', () => asPage(async () => {
  const me = loader()
  me.tick({ wire, render3d: pageThree, ui } as any)
  await vi.waitFor(() => expect(me.ready('coin-icon')).toBe(true))
  expect(me.get('coin')).toEqual({ three: '/coin.png', colorSpace: 'srgb' })
  expect(me.get('coin-icon')).toEqual({ pixi: '/coin.png' })
}))

test('in node an image is a 1×1 white data texture', async () => {
  const me = loader()
  me.tick({ wire: wireOf({ coin: assets.coin }), render3d: { THREE } } as any)
  await vi.waitFor(() => expect(me.ready('coin')).toBe(true))
  const tex = me.get('coin')
  expect(tex).toBeInstanceOf(THREE.DataTexture)
  expect([tex.image.width, tex.image.height, [...tex.image.data]]).toEqual([1, 1, [255, 255, 255, 255]])
  expect(tex.colorSpace).toBe(THREE.SRGBColorSpace)
})

test('a texture entry\'s space, wrap and anisotropy are set as it is decoded, and refused on anything else or of any other value', async () => {
  const me = loader()
  const entries = {
    plain: { type: 'texture', url: '/plain.png' },
    normal: { type: 'texture', url: '/normal.png', space: 'linear', wrap: 'repeat', anisotropy: 8 },
    'normal-ui': { type: 'texture', url: '/normal.png', for: 'ui', space: 'linear' },
    data: { type: 'json', url: '/data.json', wrap: 'repeat' },
    odd: { type: 'texture', url: '/odd.png', space: 'srgb' },
    bent: { type: 'texture', url: '/bent.png', wrap: 'mirror' },
    blur: { type: 'texture', url: '/blur.png', anisotropy: 0.5 },
  }
  me.tick({ wire: wireOf(entries), render3d: { THREE }, ui } as any)
  const plain = await me.load('plain'), normal = await me.load('normal')
  expect([plain.colorSpace, plain.wrapS, plain.wrapT, plain.anisotropy]).toEqual([THREE.SRGBColorSpace, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, 1])
  expect([normal.colorSpace, normal.wrapS, normal.wrapT, normal.anisotropy]).toEqual([THREE.NoColorSpace, THREE.RepeatWrapping, THREE.RepeatWrapping, 8])
  await expect(me.load('normal-ui')).rejects.toThrow('loader normal-ui: space, wrap and anisotropy are a texture\'s that render3d samples')
  await expect(me.load('data')).rejects.toThrow('loader data: space, wrap and anisotropy are a texture\'s that render3d samples')
  await expect(me.load('odd')).rejects.toThrow('loader odd: its space is srgb, and a texture\'s is linear or left out')
  await expect(me.load('bent')).rejects.toThrow('loader bent: its wrap is mirror, and a texture\'s is repeat or left out')
  await expect(me.load('blur')).rejects.toThrow('loader blur: its anisotropy is 0.5, and a texture\'s is a whole number from 1')
})

test('an entry that cannot start here rejects and never throws: one for the ui in a scene with no ui, one for anything but the ui, one the catalogue has not', async () => {
  const bare = loader()
  expect(() => bare.tick({ wire, render3d: { THREE } } as any)).not.toThrow()
  await expect(bare.load('coin-icon')).rejects.toThrow('loader coin-icon: it is for ui, which this scene does not name')
  const me = loader()
  me.tick({ wire, render3d: { THREE }, ui } as any)
  await expect(me.load('odd')).rejects.toThrow('loader odd: it is for hud; an entry is for the scene\'s renderer, or for ui')
  await expect(me.load('nothing')).rejects.toThrow('loader nothing: the catalogue has no such entry')
  expect(errors.map(e => (e as Error).message)).toEqual([
    'loader coin-icon: it is for ui, which this scene does not name',
    'loader odd: it is for hud; an entry is for the scene\'s renderer, or for ui',
    'loader nothing: the catalogue has no such entry',
  ])
})

test('the catalogue is the scene\'s world.loader, and a scene whose world has none throws on the first tick', () => {
  expect(() => loader().tick({ wire: { rows: [], scene: { world: {} } } } as any)).toThrow('the scene\'s world has no loader catalogue')
})

test('catalogued is the catalogue\'s entry of a name, or undefined for a name it has not, and throws before the first tick', () => {
  const me = loader()
  expect(() => me.catalogued('odd')).toThrow('the loader has not ticked yet')
  me.tick({ wire, render3d: { THREE }, ui } as any)
  expect(me.catalogued('odd')).toEqual(assets.odd)
  expect(me.catalogued('nothing')).toBeUndefined()
})

// An actor's `setup` may ask before the loader's first tick has read the scene's catalogue.
test('a name asked for before the first tick waits for it, and is not failed', async () => {
  const url = file('waits.json', '{"ok":1}')
  const me = loader()
  const got = me.load('t')
  const wire = wireOf({ t: { type: 'json', url } })
  me.tick({ wire } as any)
  expect(await got).toEqual({ ok: 1 })
  me.tick({ wire } as any)
  expect(me.get('t')).toEqual({ ok: 1 })
  expect(me.progress()).toEqual({ done: 1, started: 1 })
  expect(errors).toEqual([])
})

test('every failure\'s message starts with loader, its name and a colon', async () => {
  const me = loader()
  me.tick({ wire: wireOf({
    a: { type: 'blob', url: '/a' },
    b: { type: 'model', url: '/b.gltf' },
    c: { type: 'json', url: '/plugins/loader/no-such-file.json' },
    d: { type: 'sound', url: '/d.wav' },
    e: { type: 'sheet', url: '/e.json' },
  }) } as any)
  for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) await me.load(name).catch(() => {})
  const said = errors.map(e => (e as Error).message)
  expect(said).toHaveLength(6)
  said.forEach((m, i) => expect(m.startsWith(`loader ${'abcdef'[i]}: `)).toBe(true))
})

test('a json entry needs no renderer, and an actor gets its own client\'s parse of the file', async () => {
  const url = file('table.json', '{"prefabs":{"scenemanager":{"port":8123}}}')
  const me = loader()
  me.tick({ wire: wireOf({ table: { type: 'json', url, preload: true } }) } as any)
  await vi.waitFor(() => expect(me.ready('table')).toBe(true))
  expect(me.get('table')).toEqual(await jsonAt('table', url))
  expect(me.get('table')).not.toBe(await jsonAt('table', url))
  expect(me.get('table')).toEqual(JSON.parse(readFileSync(url.slice(1), 'utf8')))
  expect(await me.file('table')).toBe(me.get('table'))
})

// The page's PixiJS decoder, stood in for by one that hands back a blank texture of 768 square and
// writes down each url it is asked for.
const pixi = () => {
  const asked: string[] = []
  return { asked, PIXI: { ...PIXI, Assets: { load: async (url: string) => { asked.push(url); return new PIXI.Texture({ source: new PIXI.TextureSource({ width: 768, height: 768 }) }) } } } }
}

// A page drawn in the DOM, with no renderer: the loader fetches the image itself. The page's image
// is stood in for by one that decodes at once.
test('two clients in a page with no renderer each fetch and decode their own image', () => asPage(async () => {
  vi.stubGlobal('Image', class { src = ''; decode() { return Promise.resolve() } })
  const url = file('dom.png', new Uint8Array([1]))
  const both = [loader(), loader()]
  for (const me of both) me.tick({ wire: wireOf({ pic: { type: 'texture', url, preload: true } }) } as any)
  await vi.waitFor(() => expect(both.every(me => me.ready('pic'))).toBe(true))
  expect(both[0].get('pic')).not.toBe(both[1].get('pic'))
  expect(fetchedUrls).toEqual([url, url])
}))

test('a file whose name holds a space and a % is read at the path as it is written', async () => {
  const url = file('a 100% b.json', '{"said":"hello"}')
  const me = loader()
  me.tick({ wire: wireOf({ odd: { type: 'json', url } }) } as any)
  expect(await me.load('odd')).toEqual({ said: 'hello' })
})

test('in a page a url is encoded once, with encodeURI, and a texture that cannot be fetched fails once and is kept failed until retry', () => asPage(async () => {
  asked.length = 0
  const me = loader()
  me.tick({ wire: wireOf({ spaced: { type: 'texture', url: '/a 100% b.png' }, gone: { type: 'texture', url: '/missing.png' } }), render3d: pageThree } as any)
  expect(await me.load('spaced')).toEqual({ three: '/a%20100%25%20b.png', colorSpace: 'srgb' })
  await expect(me.load('gone')).rejects.toThrow('loader gone: loader could not fetch /missing.png')
  expect(me.progress()).toEqual({ done: 1, started: 1 })
  await expect(me.load('gone')).rejects.toThrow('loader gone')
  expect(asked).toEqual(['/a%20100%25%20b.png', '/missing.png'])
  await expect(me.retry('gone')).rejects.toThrow('loader gone')
  expect(asked).toEqual(['/a%20100%25%20b.png', '/missing.png', '/missing.png'])
  expect(errors).toHaveLength(2)
}))

// What sprite3d, sprite2d, the particles and a game's hud do each frame with a sheet not yet
// here: ask for it again.
test('a missing sheet asked for every frame for ten frames is fetched once and reported once', () => asPage(async () => {
  const url = '/plugins/loader/no-such-sheet.json'
  const me = loader()
  const w = { wire: wireOf({ gone: { type: 'sheet', url } }), render2d: pixi() } as any
  for (let f = 0; f < 10; f++) {
    me.tick(w)
    if (!me.get('gone')) me.load('gone')
    await frame()
  }
  expect(fetchedUrls).toEqual([url])
  expect(errors.map(e => (e as Error).message)).toEqual([`loader gone: loader could not fetch ${url}: 404`])
}))

test('a json file that is not there rejects, and a preload that failed is not started again by the ticks after', async () => {
  const me = loader()
  const w = { wire: wireOf({ gone: { type: 'json', url: '/plugins/loader/no-such-file.json', preload: true } }) } as any
  me.tick(w)
  await expect(me.load('gone')).rejects.toThrow('loader gone: loader could not read /plugins/loader/no-such-file.json: ENOENT')
  me.tick(w)
  me.tick(w)
  await frame()
  expect(me.progress()).toEqual({ done: 0, started: 0 })
  expect(errors).toHaveLength(1)
})

test('a failed file at a url the editor writes is started again, and lands', async () => {
  const url = '/' + relative(process.cwd(), join(folder, 'later.json'))
  const me = loader()
  me.tick({ wire: wireOf({ later: { type: 'json', url, preload: true } }) } as any)
  await expect(me.load('later')).rejects.toThrow('loader later')
  written(url, '{"here":true}')
  await me.written(url)
  me.tick({ wire: wireOf({ later: { type: 'json', url, preload: true } }) } as any)
  await vi.waitFor(() => expect(me.get('later')).toEqual({ here: true }))
})

// ---------------------------------------------------------------- models

// A glb: one triangle skinned to one bone, `hips`, with a 1×1 png as its colour unless it is left
// untextured, and a clip that moves the bone.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64')
function glb(textured = true): Uint8Array {
  const parts: Uint8Array[] = []
  const views: { buffer: 0; byteOffset: number; byteLength: number }[] = []
  let at = 0
  const put = (bytes: Uint8Array) => {
    views.push({ buffer: 0, byteOffset: at, byteLength: bytes.byteLength })
    const padded = new Uint8Array(Math.ceil(bytes.byteLength / 4) * 4)
    padded.set(bytes)
    parts.push(padded)
    at += padded.byteLength
    return views.length - 1
  }
  const f32 = (xs: number[]) => new Uint8Array(new Float32Array(xs).buffer)
  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [{ name: 'body', mesh: 0, skin: 0 }, { name: 'hips' }],
    skins: [{ joints: [1], inverseBindMatrices: 3 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2, TEXCOORD_0: 4 }, ...(textured && { material: 0 }) }] }],
    ...(textured && {
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }],
      images: [{ bufferView: put(PNG), mimeType: 'image/png' }],
    }),
    accessors: [
      { bufferView: put(f32([0, 0, 0, 1, 0, 0, 0, 1, 0])), componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: put(new Uint8Array(12)), componentType: 5121, count: 3, type: 'VEC4' },
      { bufferView: put(f32([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])), componentType: 5126, count: 3, type: 'VEC4' },
      { bufferView: put(f32([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])), componentType: 5126, count: 1, type: 'MAT4' },
      { bufferView: put(f32([0, 0, 1, 0, 0, 1])), componentType: 5126, count: 3, type: 'VEC2' },
      { bufferView: put(f32([0, 1])), componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: put(f32([0, 0, 0, 0, 1, 0])), componentType: 5126, count: 2, type: 'VEC3' },
    ],
    animations: [{ name: 'rise', samplers: [{ input: 5, output: 6 }], channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }] }],
    bufferViews: views,
    buffers: [{ byteLength: at }],
  }
  const text = new TextEncoder().encode(JSON.stringify(json))
  const head = new Uint8Array(Math.ceil(text.byteLength / 4) * 4).fill(0x20)
  head.set(text)
  const bin = new Uint8Array(at)
  let o = 0
  for (const p of parts) { bin.set(p, o); o += p.byteLength }
  const out = new Uint8Array(12 + 8 + head.byteLength + 8 + bin.byteLength)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, out.byteLength, true)
  v.setUint32(12, head.byteLength, true)
  v.setUint32(16, 0x4e4f534a, true)
  out.set(head, 20)
  v.setUint32(20 + head.byteLength, bin.byteLength, true)
  v.setUint32(24 + head.byteLength, 0x004e4942, true)
  out.set(bin, 28 + head.byteLength)
  return out
}

const render3d = { THREE, GLTFLoader, SkeletonUtils }

test('a glb loads in node with its texture, each model() is a scene with a skeleton of its own, and node has no document after', async () => {
  const url = file('one bone.glb', glb())
  const me = loader()
  me.tick({ wire: wireOf({ bone: { type: 'model', url } }), render3d } as any)
  expect((globalThis as any).document).toBeUndefined()
  await me.load('bone')
  expect((globalThis as any).document).toBeUndefined()
  expect((globalThis as any).self).toBeUndefined()
  const one = me.model('bone'), two = me.model('bone')
  const skinned = (s: any) => { let m: any; s.traverse((o: any) => { if (o.isSkinnedMesh) m = o }); return m }
  const a = skinned(one.scene), b = skinned(two.scene)
  expect(a.skeleton.bones.map((x: any) => x.name)).toEqual(['hips'])
  expect(a.skeleton).not.toBe(b.skeleton)
  expect(a.skeleton.bones[0]).not.toBe(b.skeleton.bones[0])
  expect(one.scene.getObjectByName('hips')).toBe(a.skeleton.bones[0])
  expect(two.scene.getObjectByName('hips')).toBe(b.skeleton.bones[0])
  expect(a.material.map.image.width).toBe(1)
  expect(one.animations.map((c: any) => c.name)).toEqual(['rise'])
})

test('a glb packed by gltfpack with meshopt compression decodes: its triangle, its bone and its clip as they were', async () => {
  const raw = join(folder, 'unpacked.glb'), packed = join(folder, 'packed.glb')
  writeFileSync(raw, glb(false))
  execFileSync(join(process.cwd(), 'node_modules/.bin/gltfpack'), ['-cc', '-kn', '-km', '-i', raw, '-o', packed])
  const bytes = readFileSync(packed)
  expect(JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()).extensionsRequired).toContain('EXT_meshopt_compression')
  const me = loader()
  me.tick({ wire: wireOf({ packed: { type: 'model', url: '/' + relative(process.cwd(), packed) } }), render3d } as any)
  await me.load('packed')
  const { scene, animations } = me.model('packed')
  let skinned: any
  scene.traverse((o: any) => { if (o.isSkinnedMesh) skinned = o })
  expect(skinned.skeleton.bones.map((x: any) => x.name)).toEqual(['hips'])
  skinned.updateMatrixWorld(true)
  const at = skinned.geometry.getAttribute('position'), corner = new THREE.Vector3()
  const corners = [0, 1, 2].map(i => corner.fromBufferAttribute(at, i).applyMatrix4(skinned.matrixWorld).toArray().map(v => Math.round(v * 1000) / 1000))
  expect(corners).toEqual(expect.arrayContaining([[0, 0, 0], [1, 0, 0], [0, 1, 0]]))
  expect(animations.map((c: any) => c.name)).toEqual(['rise'])
  const track = animations[0].tracks.find((t: any) => t.name === 'hips.position')
  // gltfpack resamples a clip at 30 Hz: the bone rises from 0 to 1 over the second, at its time.
  expect(track.times[0]).toBe(0)
  expect(track.times[track.times.length - 1]).toBe(1)
  for (let i = 0; i < track.times.length; i++) {
    expect(track.values[3 * i]).toBeCloseTo(0, 3)
    expect(track.values[3 * i + 1]).toBeCloseTo(track.times[i], 3)
    expect(track.values[3 * i + 2]).toBeCloseTo(0, 3)
  }
})

test('a document put in place while a model decodes is not taken away when the decoding ends', async () => {
  const url = file('lent.glb', glb())
  const g = globalThis as { document?: { createElementNS: unknown } }
  let page: unknown
  // The moment the model starts decoding, something else puts a document of its own in place.
  class Swapped extends GLTFLoader {
    parse(...args: Parameters<GLTFLoader['parse']>) {
      page = g.document = { createElementNS: g.document!.createElementNS }
      return super.parse(...args)
    }
  }
  const me = loader()
  me.tick({ wire: wireOf({ bone: { type: 'model', url } }), render3d: { ...render3d, GLTFLoader: Swapped } } as any)
  await me.load('bone')
  expect(page).toBeDefined()
  expect(g.document).toBe(page)
  delete g.document
})

test('a model that starts while another decodes, after a document was put in place, keeps its self until it has decoded too', async () => {
  const one = file('first.glb', glb()), two = file('second.glb', glb())
  const g = globalThis as { document?: { createElementNS: unknown }; self?: unknown }
  let page: unknown, selfThen: unknown
  let firstParsing!: () => void, secondParsing!: () => void, firstLanded!: () => void
  const started = new Promise<void>(ok => { firstParsing = ok })
  const second = new Promise<void>(ok => { secondParsing = ok }), first = new Promise<void>(ok => { firstLanded = ok })
  // The first model puts a document of its own in place and decodes only once the second has
  // started; the second starts once the first is decoding, and decodes only once the first has
  // landed and given back what it was lent.
  let parses = 0
  class Held extends GLTFLoader {
    parse(...args: Parameters<GLTFLoader['parse']>) {
      if (++parses === 1) {
        page = g.document = { createElementNS: g.document!.createElementNS }
        firstParsing()
        void second.then(() => super.parse(...args))
        return
      }
      secondParsing()
      void first.then(() => {
        selfThen = g.self
        super.parse(...args)
      })
    }
  }
  const me = loader()
  me.tick({ wire: wireOf({ one: { type: 'model', url: one }, two: { type: 'model', url: two } }), render3d: { ...render3d, GLTFLoader: Held } } as any)
  const a = me.load('one').then(firstLanded)
  await started
  const b = me.load('two')
  await a
  expect(me.model('one').animations).toHaveLength(1)
  await b
  expect(selfThen).toBe(globalThis)
  expect(me.model('two').animations).toHaveLength(1)
  expect(errors).toEqual([])
  expect(g.self).toBeUndefined()
  expect(g.document).toBe(page)
  delete g.document
})

test('a model decoding in a process that has a document of its own and no self is lent a self, and the document is left alone', async () => {
  const url = file('own.glb', glb())
  const g = globalThis as { document?: { createElementNS: unknown }; self?: unknown }
  // A page's document of its own, whose images load the moment they are given a `src`.
  const own = {
    createElementNS() {
      const heard = new Map<string, () => void>()
      return { width: 1, height: 1, addEventListener(type: string, f: () => void) { heard.set(type, f) }, removeEventListener() {}, set src(_: string) { queueMicrotask(() => heard.get('load')?.()) } }
    },
  }
  g.document = own
  const me = loader()
  me.tick({ wire: wireOf({ bone: { type: 'model', url } }), render3d } as any)
  await me.load('bone')
  expect(me.model('bone').animations).toHaveLength(1)
  expect(errors).toEqual([])
  expect(g.self).toBeUndefined()
  expect(g.document).toBe(own)
  delete g.document
})

test('a model\'s .glb is matched in any case', async () => {
  const url = file('SHOUT.GLB', glb())
  const me = loader()
  me.tick({ wire: wireOf({ bone: { type: 'model', url } }), render3d } as any)
  await me.load('bone')
  expect(me.model('bone').animations).toHaveLength(1)
})

test('a model that is not one .glb fails once, even preloaded and ticked every frame, and model() of a name not landed throws', async () => {
  const me = loader()
  const w = { wire: wireOf({ split: { type: 'model', url: '/a/b.gltf', preload: true }, bone: { type: 'model', url: '/a/b.glb' } }), render3d } as any
  for (let f = 0; f < 5; f++) { expect(() => me.tick(w)).not.toThrow(); await frame() }
  await expect(me.load('split')).rejects.toThrow('loader split: a model is one .glb')
  expect(errors.map(e => (e as Error).message)).toEqual(['loader split: a model is one .glb'])
  expect(() => me.model('bone')).toThrow('loader has not finished bone')
})

test('a model at a bad url rejects', async () => {
  const me = loader()
  me.tick({ wire: wireOf({ bone: { type: 'model', url: '/plugins/loader/no-such-model.glb' } }), render3d } as any)
  await expect(me.load('bone')).rejects.toThrow('loader bone: ')
  expect(me.progress().started).toBe(0)
})

test('in a page a model and a sound are fetched with their urls encoded once', () => asPage(async () => {
  const model = file('a 100% b.glb', glb(false)), sound = file('a 100% b.wav', new Uint8Array([7]))
  const audio = { context: { decodeAudioData: async () => ({ duration: 1 }) } }
  const me = loader()
  me.tick({ wire: wireOf({ bone: { type: 'model', url: model }, chime: { type: 'sound', url: sound } }), render3d, audio } as any)
  await me.load('bone')
  await me.load('chime')
  expect(fetchedUrls).toEqual([encodeURI(model), encodeURI(sound)])
  expect(fetchedUrls[0]).toMatch(/\/a%20100%25%20b\.glb$/)
}))

// ---------------------------------------------------------------- sounds

test('a sound is decoded through audio\'s context and is its AudioBuffer', async () => {
  const url = file('a chime.wav', new Uint8Array([1, 2, 3, 4, 5]))
  const handed: number[][] = []
  const audio = { context: { decodeAudioData: async (b: ArrayBuffer) => { handed.push([...new Uint8Array(b)]); return { duration: 0.5 } } } }
  const me = loader()
  me.tick({ wire: wireOf({ chime: { type: 'sound', url } }), audio } as any)
  await me.load('chime')
  expect(me.sound('chime')).toEqual({ duration: 0.5 })
  expect(handed).toEqual([[1, 2, 3, 4, 5]])
  expect(() => me.model('chime')).toThrow('loader chime is a sound, not a model')
})

test('a sound that cannot be decoded rejects, and a scene with no audio cannot start one', async () => {
  const url = file('noise.wav', new Uint8Array([9]))
  const audio = { context: { decodeAudioData: async () => { throw new Error('unable to decode audio data') } } }
  const me = loader()
  me.tick({ wire: wireOf({ noise: { type: 'sound', url } }), audio } as any)
  await expect(me.load('noise')).rejects.toThrow('loader noise: unable to decode audio data')
  const bare = loader()
  bare.tick({ wire: wireOf({ noise: { type: 'sound', url } }) } as any)
  await expect(bare.load('noise')).rejects.toThrow('loader noise: a sound, and this scene names no audio to decode it')
})

// ---------------------------------------------------------------- fonts

test('in node a font starts on the first tick unasked, is its name once its file reads, and fonts() says when every font of the catalogue has landed or failed', async () => {
  const url = file('face.ttf', new Uint8Array([1, 2, 3]))
  const me = loader()
  expect(me.fonts()).toBe(false)
  me.tick({ wire: wireOf({ face: { type: 'font', url }, gone: { type: 'font', url: '/no/gone.ttf' }, data: { type: 'json', url: '/no/data.json' } }) } as any)
  expect(me.fonts()).toBe(false)
  await vi.waitFor(() => expect(me.ready('face')).toBe(true))
  expect(me.get('face')).toEqual({ family: 'face' })
  await vi.waitFor(() => expect(me.fonts()).toBe(true))
  expect(me.ready('gone')).toBe(false)
  expect(errors.map(e => (e as Error).message)).toEqual([expect.stringMatching(/^loader gone: loader could not read \/no\/gone\.ttf/)])
  const bare = loader()
  bare.tick({ wire: wireOf({ data: { type: 'json', url: '/no/data.json' } }) } as any)
  expect(bare.fonts()).toBe(true)
})

// The page's FontFace and its fonts, each face made written down with the bytes it was made from, and
// each face added to the page's fonts.
function pageFonts(fails = false) {
  const made: { family: string; bytes: number[] }[] = [], added: unknown[] = []
  vi.stubGlobal('FontFace', class {
    constructor(public family: string, bytes: ArrayBuffer) { made.push({ family, bytes: [...new Uint8Array(bytes)] }) }
    async load() { if (fails) throw new Error('A network error occurred.'); return this }
  })
  vi.stubGlobal('document', { fonts: { add: (f: unknown) => added.push(f) } })
  return { made, added }
}

test('in a page a font is installed in the page\'s fonts as its name from its file\'s bytes, once for the page, and every client is handed the one face', () => asPage(async () => {
  delete (globalThis as any)[Symbol.for('loader: fonts')]
  const url = file('a 100% face.ttf', new Uint8Array([4, 5, 6]))
  const { made, added } = pageFonts()
  const one = loader(), two = loader()
  one.tick({ wire: wireOf({ Ithaca: { type: 'font', url, for: 'ui' } }), ui } as any)
  await vi.waitFor(() => expect(one.fonts()).toBe(true))
  two.tick({ wire: wireOf({ Ithaca: { type: 'font', url } }) } as any)
  await vi.waitFor(() => expect(two.fonts()).toBe(true))
  expect(errors).toEqual([])
  expect(made).toEqual([{ family: 'Ithaca', bytes: [4, 5, 6] }])
  expect(added).toEqual([one.get('Ithaca')])
  expect(two.get('Ithaca')).toBe(one.get('Ithaca'))
  expect(fetchedUrls).toEqual([encodeURI(url)])
  delete (globalThis as any)[Symbol.for('loader: fonts')]
}))

test('in a page a file that does not load as a font fails once, is never added to the page\'s fonts, and counts as in for fonts()', () => asPage(async () => {
  delete (globalThis as any)[Symbol.for('loader: fonts')]
  const url = file('broken.ttf', new Uint8Array([0]))
  const { added } = pageFonts(true)
  const me = loader()
  me.tick({ wire: wireOf({ broken: { type: 'font', url } }) } as any)
  await expect(me.load('broken')).rejects.toThrow('loader broken: A network error occurred.')
  expect(me.fonts()).toBe(true)
  expect(added).toEqual([])
  expect(errors.map(e => (e as Error).message)).toEqual(['loader broken: A network error occurred.'])
  delete (globalThis as any)[Symbol.for('loader: fonts')]
}))

// ---------------------------------------------------------------- written

test('a file written while the game runs refills the process\'s copy and a client\'s copy in place', async () => {
  const url = file('table.json', '{"speed":3}')
  const me = loader()
  me.tick({ wire: wireOf({ table: { type: 'json', url, preload: true } }) } as any)
  const mine = await me.load('table'), process = await jsonAt('table', url)
  written(url, '{"speed":7}')
  await me.written(url)
  expect(mine).toEqual({ speed: 7 })
  expect(process).toEqual({ speed: 7 })
  const later = loader()
  later.tick({ wire: wireOf({ table: { type: 'json', url, preload: true } }) } as any)
  expect(await later.load('table')).toEqual({ speed: 7 })
})

// A sheet of one frame, `a`, 4 pixels square at [x, 0] on its one page.
const strip = (page: string, x: number) => JSON.stringify({
  frames: [{ filename: 'a', frame: { x, y: 0, w: 4, h: 4 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 4, h: 4 }, sourceSize: { w: 4, h: 4 } }],
  meta: { app: 'test', image: page },
})

test('a sheet written while the game runs has its data, its pages and its cut frames made again', async () => {
  const url = file('strip.json', strip('one.png', 0))
  const render2d = pixi()
  const me = loader()
  me.tick({ wire: wireOf({ strip: { type: 'sheet', url, preload: true } }), render2d } as any)
  const sheet = await me.load('strip')
  const before = sheet.texture('a'), page = sheet.pages[0]
  written(url, strip('two.png', 2).replace('"y":0', '"y":3'))
  await me.written(url)
  expect(me.get('strip')).toBe(sheet)
  expect(sheet.data.pages).toEqual([url.replace('strip.json', 'two.png')])
  expect(render2d.asked).toEqual([url.replace('strip.json', 'one.png'), url.replace('strip.json', 'two.png')].map(encodeURI))
  expect(sheet.pages[0]).not.toBe(page)
  expect(before.destroyed).toBe(true)
  const after = sheet.texture('a')
  expect([after.frame.x, after.frame.y]).toEqual([2, 3])
  expect(after.source).toBe(sheet.pages[0].source)
})

test('a sheet\'s page written on the machine is fetched anew by how many times it has been written, and the sheet made again from it, by this client and every client made after', async () => {
  const url = file('paged.json', strip('paged.png', 0))
  const page = url.replace('paged.json', 'paged.png')
  const render2d = pixi()
  const me = loader()
  me.tick({ wire: wireOf({ paged: { type: 'sheet', url, preload: true } }), render2d } as any)
  const sheet = await me.load('paged')
  const [before] = sheet.pages, frame = sheet.texture('a')
  const heard = vi.fn()
  me.onWritten('paged', heard)
  rewritten(page)
  expect(writes(page)).toBe(1)
  await me.written(page)
  expect(render2d.asked).toEqual([encodeURI(page), encodeURI(`${page}?written=1`)])
  expect(sheet.pages[0]).not.toBe(before)
  expect(frame.destroyed).toBe(true)
  expect(sheet.texture('a').source).toBe(sheet.pages[0].source)
  expect(heard).toHaveBeenCalledTimes(1)
  // A picture no sheet of the client draws from is nothing of its own.
  await me.written(url.replace('paged.json', 'elsewhere.png'))
  expect(render2d.asked).toHaveLength(2)
  expect(heard).toHaveBeenCalledTimes(1)
  // A client made after fetches the page as it now is.
  const after = pixi()
  const next = loader()
  next.tick({ wire: wireOf({ paged: { type: 'sheet', url, preload: true } }), render2d: after } as any)
  await next.load('paged')
  expect(after.asked).toEqual([encodeURI(`${page}?written=1`)])
})

// A PixiJS that holds each page until the test lets it land, and fails a page named `missing`.
const slow = () => {
  const held: (() => void)[] = []
  const asked: string[] = []
  const load = (url: string) => new Promise((ok, no) => {
    asked.push(url)
    held.push(() => (url.includes('missing') ? no(new Error(`could not fetch ${url}`)) : ok(new PIXI.Texture({ source: new PIXI.TextureSource({ width: 8, height: 8 }) }))))
  })
  // `land` lands every page held, in the order they were asked for; `landAt(i)` the i-th still held.
  return { asked, land: () => { for (const f of held.splice(0)) f() }, landAt: (i: number) => held.splice(i, 1)[0](), PIXI: { ...PIXI, Assets: { load } } }
}

test('a rewritten sheet keeps the old data and pages until every new page has landed, then swaps both', async () => {
  const url = file('swap.json', strip('one.png', 0))
  const render2d = slow()
  const me = loader()
  me.tick({ wire: wireOf({ swap: { type: 'sheet', url, preload: true } }), render2d } as any)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(1))
  render2d.land()
  const sheet = await me.load('swap')
  const [page] = sheet.pages
  written(url, strip('two.png', 2))
  const writing = me.written(url)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(2))
  expect([sheet.data.pages[0].endsWith('one.png'), sheet.data.frames.a.box[0], sheet.pages[0]]).toEqual([true, 0, page])
  render2d.land()
  await writing
  expect([sheet.data.pages[0].endsWith('two.png'), sheet.data.frames.a.box[0]]).toEqual([true, 2])
  expect(sheet.pages[0]).not.toBe(page)
})

test('of two rewrites of a sheet whose pages land out of order, the later one is the sheet, and the earlier one never swaps in', async () => {
  const url = file('twice.json', strip('one.png', 0))
  const render2d = slow()
  const me = loader()
  me.tick({ wire: wireOf({ twice: { type: 'sheet', url, preload: true } }), render2d } as any)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(1))
  render2d.land()
  const sheet = await me.load('twice')
  written(url, strip('two.png', 2))
  const first = me.written(url)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(2))
  written(url, strip('three.png', 3))
  const second = me.written(url)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(3))
  // The later write's page lands first and swaps in; the earlier one's lands after, and is dropped.
  render2d.landAt(1)
  await second
  const later = sheet.pages[0]
  const frame = sheet.texture('a')
  expect([sheet.data.pages[0].endsWith('three.png'), sheet.data.frames.a.box[0]]).toEqual([true, 3])
  render2d.landAt(0)
  await first
  expect([sheet.data.pages[0].endsWith('three.png'), sheet.data.frames.a.box[0], sheet.pages[0], sheet.texture('a'), frame.destroyed]).toEqual([true, 3, later, frame, false])
})

test('a rewritten sheet whose new page fails stays the old sheet, whole, and the failure is reported once', async () => {
  const url = file('keep.json', strip('one.png', 0))
  const render2d = slow()
  const me = loader()
  me.tick({ wire: wireOf({ keep: { type: 'sheet', url, preload: true } }), render2d } as any)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(1))
  render2d.land()
  const sheet = await me.load('keep')
  const [page] = sheet.pages, frame = sheet.texture('a')
  written(url, strip('missing.png', 2))
  const writing = me.written(url)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(2))
  render2d.land()
  await writing
  expect([sheet.data.pages[0].endsWith('one.png'), sheet.data.frames.a.box[0], sheet.pages[0], sheet.texture('a'), frame.destroyed]).toEqual([true, 0, page, frame, false])
  expect(errors.map(e => (e as Error).message)).toEqual([`loader keep: could not fetch ${encodeURI(url.replace('keep.json', 'missing.png'))}`])
})

test('what waits on a file being written runs once this client\'s copy holds the new text, for a name at that url it never parsed too, and for no other file', async () => {
  const url = file('heard.json', '{"speed":3}'), other = file('unheard.json', '{}')
  const me = loader()
  me.tick({ wire: wireOf({ heard: { type: 'json', url, preload: true }, same: { type: 'json', url }, unheard: { type: 'json', url: other } }) } as any)
  const mine = await me.load('heard')
  const seen: unknown[] = []
  me.onWritten('heard', () => seen.push(['heard', mine.speed]))
  me.onWritten('same', () => seen.push('same'))
  me.onWritten('unheard', () => seen.push('unheard'))
  written(url, '{"speed":7}')
  await me.written(url)
  expect(seen).toHaveLength(2)
  expect(seen).toEqual(expect.arrayContaining([['heard', 7], 'same']))
})

test('what waits on a sheet being written runs once its new pages have swapped in, and never for a write a later one overtook or whose page failed', async () => {
  const url = file('told.json', strip('one.png', 0))
  const render2d = slow()
  const me = loader()
  me.tick({ wire: wireOf({ told: { type: 'sheet', url, preload: true } }), render2d } as any)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(1))
  render2d.land()
  const sheet = await me.load('told')
  const heard: number[] = []
  me.onWritten('told', () => heard.push(sheet.data.frames.a.box[0]))
  written(url, strip('two.png', 2))
  const first = me.written(url)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(2))
  written(url, strip('three.png', 3))
  const second = me.written(url)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(3))
  expect(heard).toEqual([])
  render2d.landAt(1)
  await second
  expect(heard).toEqual([3])
  render2d.landAt(0)
  await first
  expect(heard).toEqual([3])
  written(url, strip('missing.png', 4))
  const failing = me.written(url)
  await vi.waitFor(() => expect(render2d.asked).toHaveLength(4))
  render2d.land()
  await failing
  expect(heard).toEqual([3])
})

// A packer's sheet, TexturePacker's JSON-Hash: `up` stored as it is drawn, `turned` stored a quarter
// turn clockwise, so its 10 × 30 covers 30 × 10 of the page. The entry says it is pixel art.
const packedSheet = JSON.stringify({
  frames: {
    up: { frame: { x: 0, y: 0, w: 10, h: 30 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 10, h: 30 }, sourceSize: { w: 10, h: 30 } },
    turned: { frame: { x: 20, y: 40, w: 10, h: 30 }, rotated: true, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 10, h: 30 }, sourceSize: { w: 10, h: 30 } },
  },
  meta: { app: 'https://www.codeandweb.com/texturepacker', image: 'packed.png', size: { w: 768, h: 768 } },
})

test('a packer\'s sheet is drawn as its entry says, and a frame stored turned is cut turned back, its uvs turned as PixiJS turns them', async () => {
  const url = file('packed.json', packedSheet)
  const render2d = pixi()
  const me = loader()
  me.tick({ wire: wireOf({ packed: { type: 'sheet', url, preload: true, nearest: true } }), render2d } as any)
  const got = await me.load('packed')
  expect(got.data.nearest).toBe(true)
  expect(got.pages[0].source.scaleMode).toBe('nearest')
  const up = got.texture('up'), turned = got.texture('turned')
  expect([up.frame.width, up.frame.height, up.rotate, up.width, up.height]).toEqual([10, 30, 0, 10, 30])
  expect([turned.frame.x, turned.frame.y, turned.frame.width, turned.frame.height, turned.rotate, turned.width, turned.height]).toEqual([20, 40, 30, 10, 2, 10, 30])
  // Three's uvs are PixiJS's, with v counted up: PixiJS's corners run top left, top right, bottom
  // right, bottom left, and `uv`'s top left, top right, bottom left, bottom right.
  const three = (t: any) => [[t.uvs.x0, 1 - t.uvs.y0], [t.uvs.x1, 1 - t.uvs.y1], [t.uvs.x3, 1 - t.uvs.y3], [t.uvs.x2, 1 - t.uvs.y2]].flat()
  got.pages[0].image = { width: 768, height: 768 }
  for (const [id, t] of [['up', up], ['turned', turned]] as const) {
    got.uv(id).forEach((c: number, i: number) => expect(c).toBeCloseTo(three(t)[i], 12))
  }
})

// ---------------------------------------------------------------- trimmed and turned frames

// A PixiJS whose every image is 64 pixels square.
const small = () => ({ PIXI: { ...PIXI, Assets: { load: async () => new PIXI.Texture({ source: new PIXI.TextureSource({ width: 64, height: 64 }) }) } } })
const coinPack = {
  frames: {
    'coin 1.png': { frame: { x: 2, y: 4, w: 10, h: 12 }, rotated: false, trimmed: true, spriteSourceSize: { x: 3, y: 2, w: 10, h: 12 }, sourceSize: { w: 16, h: 16 }, pivot: { x: 0.5, y: 1 } },
    'coin 2.png': { frame: { x: 20, y: 4, w: 10, h: 12 }, rotated: true, trimmed: true, spriteSourceSize: { x: 3, y: 2, w: 10, h: 12 }, sourceSize: { w: 16, h: 16 }, pivot: { x: 0.5, y: 1 } },
    'coin 3.png': { frame: { x: 40, y: 0, w: 16, h: 16 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 }, sourceSize: { w: 16, h: 16 } },
  },
  meta: { image: 'coins.png' },
}

test('a trimmed frame is cut with its whole frame as orig and its kept pixels as trim, and a turned one turned back upright', async () => {
  const url = file('coins.json', JSON.stringify(coinPack))
  const me = loader()
  me.tick({ wire: wireOf({ coins: { type: 'sheet', url } }), render2d: small() } as any)
  const coins = await me.load('coins')
  const one = coins.texture('coin 1.png'), two = coins.texture('coin 2.png'), three = coins.texture('coin 3.png')
  const rect = (r: any) => r && [r.x, r.y, r.width, r.height]
  expect([rect(one.frame), rect(one.orig), rect(one.trim), one.rotate]).toEqual([[2, 4, 10, 12], [0, 0, 16, 16], [3, 2, 10, 12], 0])
  expect([rect(two.frame), rect(two.orig), rect(two.trim), two.rotate]).toEqual([[20, 4, 12, 10], [0, 0, 16, 16], [3, 2, 10, 12], 2])
  expect([rect(three.orig), three.trim]).toEqual([[0, 0, 16, 16], undefined])
  // A sprite stands the whole frame's anchor on its place: its pixels sit where they were trimmed from.
  const sprite = new PIXI.Sprite({ texture: one })
  sprite.anchor.set(8 / 16, 16 / 16)
  const { minX, minY, maxX, maxY } = sprite.visualBounds
  expect([minX, minY, maxX, maxY]).toEqual([3 - 8, 2 - 16, 13 - 8, 14 - 16])
})

test('uv is where a frame\'s upright corners lie on its page, a turned frame\'s as PixiJS turns it', () => asPage(async () => {
  const url = file('coins3d.json', JSON.stringify(coinPack))
  const me = loader()
  me.tick({ wire: wireOf({ coins: { type: 'sheet', url } }), render3d: pageThree } as any)
  const coins = await me.load('coins')
  coins.pages[0].image = { width: 64, height: 64 }
  expect(coins.uv('coin 1.png')).toEqual([2 / 64, 1 - 4 / 64, 12 / 64, 1 - 4 / 64, 2 / 64, 1 - 16 / 64, 12 / 64, 1 - 16 / 64])
  expect(coins.uv('coin 2.png')).toEqual([32 / 64, 1 - 4 / 64, 32 / 64, 1 - 14 / 64, 20 / 64, 1 - 4 / 64, 20 / 64, 1 - 14 / 64])
  // PixiJS's own corners of the same frame, top left, top right, bottom right, bottom left.
  const { uvs } = new PIXI.Texture({ source: new PIXI.TextureSource({ width: 64, height: 64 }), frame: new PIXI.Rectangle(20, 4, 12, 10), orig: new PIXI.Rectangle(0, 0, 10, 12), rotate: 2 })
  const pixi = [uvs.x0, 1 - uvs.y0, uvs.x1, 1 - uvs.y1, uvs.x3, 1 - uvs.y3, uvs.x2, 1 - uvs.y2]
  coins.uv('coin 2.png').forEach((v: number, i: number) => expect(v).toBeCloseTo(pixi[i], 12))
}))

// ---------------------------------------------------------------- palettes and maps

test('a palette entry needs no renderer and is this client\'s own list of colours', async () => {
  const url = file('base.gpl', 'GIMP Palette\nName: base\n  0   0   0\tblack\n248 248 248\twhite\n')
  const me = loader()
  me.tick({ wire: wireOf({ base: { type: 'palette', url, preload: true } }) } as any)
  await vi.waitFor(() => expect(me.ready('base')).toBe(true))
  expect(me.get('base')).toEqual([0x000000, 0xf8f8f8])
  expect(await me.file('base')).toBe(me.get('base'))
})

const land = {
  type: 'tileset', name: 'land', tilewidth: 16, tileheight: 16, tilecount: 4, columns: 2, image: 'land.png', imagewidth: 32, imageheight: 32,
  tiles: [{ id: 1, type: 'coin' }],
}
const world = {
  type: 'map', orientation: 'orthogonal', width: 2, height: 1, tilewidth: 16, tileheight: 16, infinite: false,
  tilesets: [{ firstgid: 1, source: 'land.tsj' }],
  layers: [
    { type: 'imagelayer', name: 'sky', image: 'sky.png', visible: true, opacity: 1 },
    { type: 'tilelayer', name: 'ground', width: 2, height: 1, data: [1, 4], visible: true, opacity: 1 },
  ],
}

test('a tilemap entry lands once its tilesets\' and image layers\' images have, each tile cut from its image once', async () => {
  const tsj = file('land.tsj', JSON.stringify(land))
  const url = file('world.tmj', JSON.stringify(world))
  const render2d = pixi()
  const me = loader()
  me.tick({ wire: wireOf({ world: { type: 'tilemap', url, nearest: true } }), render2d } as any)
  const got = await me.load('world')
  expect(render2d.asked).toEqual([tsj.replace('land.tsj', 'land.png'), tsj.replace('land.tsj', 'sky.png')].map(encodeURI))
  expect(got.map.tiles[2].type).toBe('coin')
  expect(got.map).not.toBe(await tiledAt('world', url))
  const tile = got.texture(4)
  expect([tile.frame.x, tile.frame.y, tile.frame.width, tile.source.scaleMode]).toEqual([16, 16, 16, 'nearest'])
  expect(got.texture(4)).toBe(tile)
  expect(got.image(tsj.replace('land.tsj', 'sky.png')).source.scaleMode).toBe('nearest')
  expect(() => got.image('/nowhere.png')).toThrow('the map draws no image /nowhere.png')
  expect(got.version).toBe(0)
  expect(await me.file('world')).toBe(got.map)
  me.close()
  expect(tile.destroyed).toBe(true)
})

test('a rewritten tileset of a map refills the map in place, cuts its tiles again, and counts the write', async () => {
  const tsj = file('land2.tsj', JSON.stringify(land))
  const url = file('world2.tmj', JSON.stringify({ ...world, tilesets: [{ firstgid: 1, source: 'land2.tsj' }] }))
  const me = loader()
  me.tick({ wire: wireOf({ world: { type: 'tilemap', url } }), render2d: pixi() } as any)
  const got = await me.load('world')
  const map = got.map, tile = got.texture(2)
  const text = JSON.stringify({ ...land, tiles: [{ id: 1, type: 'gem' }] })
  written(tsj, text)
  await me.written(tsj)
  expect(got.map).toBe(map)
  expect(map.tiles[2].type).toBe('gem')
  expect(got.version).toBe(1)
  expect(tile.destroyed).toBe(true)
  expect(got.texture(2)).not.toBe(tile)
})

test('an image of a map written on the machine is fetched anew, and the map\'s tiles cut again from it', async () => {
  const tsj = file('land4.tsj', JSON.stringify({ ...land, image: 'land4.png' }))
  const url = file('world4.tmj', JSON.stringify({ ...world, tilesets: [{ firstgid: 1, source: 'land4.tsj' }] }))
  const image = tsj.replace('land4.tsj', 'land4.png')
  const render2d = pixi()
  const me = loader()
  me.tick({ wire: wireOf({ world: { type: 'tilemap', url } }), render2d } as any)
  const got = await me.load('world')
  const tile = got.texture(2)
  rewritten(image)
  await me.written(image)
  expect(render2d.asked.slice(-2)).toEqual([encodeURI(`${image}?written=1`), encodeURI(tsj.replace('land4.tsj', 'sky.png'))])
  expect(got.version).toBe(1)
  expect(tile.destroyed).toBe(true)
})

test('a tilemap in a scene with no render2d fails', async () => {
  const url = file('world3.tmj', JSON.stringify(world))
  file('land.tsj', JSON.stringify(land))
  const me = loader()
  me.tick({ wire: wireOf({ world: { type: 'tilemap', url } }), render3d: { THREE } } as any)
  await expect(me.load('world')).rejects.toThrow('loader world: a tilemap, and this scene names no render2d to draw it')
})

// A music project and the samples it names beside it: one in its own folder, one in a folder
// under it, one a folder up.
const project = () => {
  mkdirSync(join(folder, 'song', 'kit'), { recursive: true })
  const url = file('song/song.json', '{"tracks":[]}')
  file('song/kit/kick.wav', new Uint8Array([1, 2, 3]))
  file('song/snare.wav', new Uint8Array([4, 5]))
  file('hat.wav', new Uint8Array([6]))
  return url
}
const bytesOf = (b: ArrayBuffer | undefined) => [...new Uint8Array(b!)]

test('beside is the bytes of a file named from the folder of an entry\'s file, nested, beside it and a folder up', async () => {
  const me = loader()
  me.tick({ wire: wireOf({ song: { type: 'json', url: project() } }) } as any)
  expect(bytesOf(await me.beside('song', 'kit/kick.wav'))).toEqual([1, 2, 3])
  expect(bytesOf(await me.beside('song', './snare.wav'))).toEqual([4, 5])
  expect(bytesOf(await me.beside('song', '../hat.wav'))).toEqual([6])
})

test('in a page beside fetches the file once, at its path from the root, encoded once, and a second ask is the same bytes', () => asPage(async () => {
  const url = project()
  const me = loader()
  me.tick({ wire: wireOf({ song: { type: 'json', url } }) } as any)
  const kick = url.replace('song.json', 'kit/kick.wav')
  const first = await me.beside('song', 'kit/kick.wav')
  expect(bytesOf(first)).toEqual([1, 2, 3])
  expect(await me.beside('song', 'kit/kick.wav')).toBe(first)
  expect(fetchedUrls).toEqual([encodeURI(kick)])
  await me.written(kick)
  expect(bytesOf(await me.beside('song', 'kit/kick.wav'))).toEqual([1, 2, 3])
  expect(fetchedUrls).toEqual([encodeURI(kick), encodeURI(kick)])
}))

test('a missing file beside an entry is undefined, writes nothing to the console, and is looked for again on every ask', () => asPage(async () => {
  const warned: unknown[] = []
  vi.spyOn(console, 'warn').mockImplementation((e: unknown) => { warned.push(e) })
  const url = project()
  const me = loader()
  me.tick({ wire: wireOf({ song: { type: 'json', url } }) } as any)
  const gone = url.replace('song.json', 'kit/gone.wav')
  expect(await me.beside('song', 'kit/gone.wav')).toBeUndefined()
  expect(await me.beside('song', 'kit/gone.wav')).toBeUndefined()
  expect(fetchedUrls).toEqual([encodeURI(gone), encodeURI(gone)])
  file('song/kit/gone.wav', new Uint8Array([9]))
  expect(bytesOf(await me.beside('song', 'kit/gone.wav'))).toEqual([9])
  expect(errors).toEqual([])
  expect(warned).toEqual([])
}))

test('a missing file beside an entry in node is undefined too, with nothing written to the console', async () => {
  const warned: unknown[] = []
  vi.spyOn(console, 'warn').mockImplementation((e: unknown) => { warned.push(e) })
  const me = loader()
  me.tick({ wire: wireOf({ song: { type: 'json', url: project() } }) } as any)
  expect(await me.beside('song', 'nowhere/none.wav')).toBeUndefined()
  expect(errors).toEqual([])
  expect(warned).toEqual([])
})

test('beside throws for a name the catalogue has no entry for, and before the first tick', () => {
  const me = loader()
  expect(() => me.beside('song', 'kick.wav')).toThrow('the loader has not ticked yet')
  me.tick({ wire: wireOf({ song: { type: 'json', url: '/song.json' } }) } as any)
  expect(() => me.beside('tune', 'kick.wav')).toThrow('loader has no tune')
})

// ---------------------------------------------------------------- wads

import { encodePng, seal } from './loader.sim.ts'

// A scene whose world names wads beside its catalogue.
const wadWire = (wads: string[], assets: Record<string, any>) => ({ rows: [{ id: 1, kind: 'loader', data: {} }], scene: { world: { loader: { wads, assets } } } })

// A wad of its own folder, since a wad open in the process stays open: a sheet of one 3 × 2 frame, its
// json and its page sealed in it and neither on disk, and a picture that is no PNG.
const wadded = async (name: string) => {
  mkdirSync(join(folder, name))
  const at = '/' + relative(process.cwd(), join(folder, name))
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 0, 10, 20, 30, 40, 50, 60, 70, 80])
  const page = encodePng({ width: 3, height: 2, data, text: {} })
  const sheetJson = JSON.stringify({ frames: [{ filename: 'gem/0', frame: { x: 0, y: 0, w: 3, h: 2 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 3, h: 2 }, sourceSize: { w: 3, h: 2 } }], meta: { image: 'gem.png', size: { w: 3, h: 2 }, frameTags: [] } })
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
  writeFileSync(join(folder, name, 'art.wad'), await seal({ 'gem.png': page, 'gem.json': new TextEncoder().encode(sheetJson), 'photo.jpg': jpeg }))
  return { at, wad: `${at}/art.wad`, page, data }
}

test('in node a sheet sealed in a wad is drawn by PixiJS from its own pixels, for the scene and for the ui, and no picture is asked of PixiJS\'s Assets', async () => {
  const { at, wad, data } = await wadded('node-sheet')
  const render2d = pixi(), hud = pixi()
  const me = loader()
  me.tick({ wire: wadWire([wad], { gem: { type: 'sheet', url: `${at}/gem.json`, preload: true, nearest: true }, 'gem-ui': { type: 'sheet', url: `${at}/gem.json`, preload: true, for: 'ui' } }), render2d, ui: hud } as any)
  for (const name of ['gem', 'gem-ui']) {
    const got = await me.load(name)
    const source = got.pages[0].source
    expect(source).toBeInstanceOf(PIXI.BufferImageSource)
    expect([source.width, source.height, [...source.resource]]).toEqual([3, 2, [...data]])
    expect(got.texture('gem/0').frame.width).toBe(3)
  }
  expect((await me.load('gem')).pages[0].source.scaleMode).toBe('nearest')
  expect([render2d.asked, hud.asked]).toEqual([[], []])
})

test('in node a picture sealed in a wad is the 1×1 white data texture under render3d, and one that is no PNG is refused for PixiJS, saying so', async () => {
  const { at, wad } = await wadded('node-three')
  const three = loader()
  three.tick({ wire: wadWire([wad], { gem: { type: 'texture', url: `${at}/gem.png`, preload: true } }), render3d: { THREE } } as any)
  const tex = await three.load('gem')
  expect(tex).toBeInstanceOf(THREE.DataTexture)
  expect([tex.image.width, tex.image.height]).toEqual([1, 1])
  const flat = loader()
  flat.tick({ wire: wadWire([wad], { photo: { type: 'texture', url: `${at}/photo.jpg` } }), render2d: pixi() } as any)
  await expect(flat.load('photo')).rejects.toThrow(`loader photo: node decodes no picture but a PNG out of a wad, and ${at}/photo.jpg is not one`)
  expect(errors.length).toBe(1)
})

// The page's ImageBitmap, stood in for by one that writes down the bytes and the options it was handed.
const bitmaps = () => {
  const made: { bytes: number[]; options: any }[] = []
  vi.stubGlobal('createImageBitmap', async (blob: Blob, options?: any) => {
    made.push({ bytes: [...new Uint8Array(await blob.arrayBuffer())], options })
    return { width: 3, height: 2, close() {} }
  })
  return made
}

test('in a page only the wad is fetched, and a picture sealed in it is decoded by the browser from its bytes: for PixiJS, for three turned over, and for the DOM', () => asPage(async () => {
  const { at, wad, page } = await wadded('page')
  const made = bitmaps()
  const render2d = pixi()
  const flat = loader()
  flat.tick({ wire: wadWire([wad], { gem: { type: 'sheet', url: `${at}/gem.json`, preload: true } }), render2d } as any)
  const sheet = await flat.load('gem')
  expect(sheet.pages[0].source).toBeInstanceOf(PIXI.ImageSource)
  expect([sheet.pages[0].source.width, sheet.pages[0].source.height]).toEqual([3, 2])
  expect(made).toEqual([{ bytes: [...page], options: undefined }])
  expect(render2d.asked).toEqual([])

  const deep = loader()
  deep.tick({ wire: wadWire([wad], { gem: { type: 'texture', url: `${at}/gem.png`, preload: true, wrap: 'repeat' } }), render3d: { THREE } } as any)
  const tex = await deep.load('gem')
  expect(tex).toBeInstanceOf(THREE.Texture)
  expect([tex.image.width, tex.flipY, tex.colorSpace, tex.wrapS]).toEqual([3, false, THREE.SRGBColorSpace, THREE.RepeatWrapping])
  expect(made[1]).toEqual({ bytes: [...page], options: { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' } })

  const srcs: string[] = []
  vi.stubGlobal('Image', class { set src(s: string) { srcs.push(s) } decode() { return Promise.resolve() } })
  const dom = loader()
  dom.tick({ wire: wadWire([wad], { gem: { type: 'texture', url: `${at}/gem.png`, preload: true } }) } as any)
  await dom.load('gem')
  expect(srcs.length).toBe(1)
  expect(srcs[0].startsWith('blob:')).toBe(true)
  expect(fetchedUrls).toEqual([encodeURI(wad)])
}))

test('a wad that cannot be fetched is written to the console once by the first tick, and the pictures go on as if it held nothing', () => asPage(async () => {
  const url = file('loose.json', '{"loose":true}')
  const me = loader()
  me.tick({ wire: wadWire([url.replace('loose.json', 'nowhere.wad')], { loose: { type: 'json', url, preload: true } }) } as any)
  expect(await me.load('loose')).toEqual({ loose: true })
  expect(errors.map(e => (e as Error).message)).toEqual([`loader wad ${url.replace('loose.json', 'nowhere.wad')}: loader could not fetch ${url.replace('loose.json', 'nowhere.wad')}: 404`])
}))
