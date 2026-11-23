// The loader's mod of the ui: the loading screen. A scene naming `loader` in
// `world.ui.mods.behaviors` is prepared as the scenemanager prepares one, which loads this mod; then a
// real loader and a real ui tick as a page's do, the loader listed first. The art comes down through
// the loader as a page's would: a json at once, the screen's picture through a stand-in for the ui's
// PixiJS loader, and a model whose decoding the test holds until it lets it go, so the screen is seen
// while something is still coming. Time is the page's clock, `performance.now`, which the test moves.
import { afterAll, afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import * as PIXI from 'pixi.js'
import * as THREE from 'three'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { modsOf, prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { ui } from '#plugins/ui/ui.plugin.ts'
import { loader } from './loader.plugin.ts'
import { behaviors } from './loader.ui.ts'

const folder = mkdtempSync(join(tmpdir(), 'loader-ui-'))
const file = (name: string, bytes: string | Uint8Array) => {
  writeFileSync(join(folder, name), bytes)
  return '/' + relative(process.cwd(), join(folder, name))
}

let clock = 0
afterEach(() => vi.restoreAllMocks())

// A model's decoding held until `release`, which is there once the decoding has started.
let release: (() => void) | undefined
class Held {
  setMeshoptDecoder() { return this }
  parse(_bytes: ArrayBuffer, _path: string, ok: (gltf: any) => void) {
    release = () => ok({ scene: new THREE.Group(), animations: [] })
  }
}
// Frames at the clock as it is until the loader has `n` of the first tick's entries in and the giant's
// decoding has started: what decodes lands on a tick.
const landed = async (L: ReturnType<typeof loader>, frame: (t: number) => void, n: number) => {
  await vi.waitFor(() => {
    frame(clock)
    expect([L.preloads().done, !!release]).toEqual([n, true])
  })
}
// Lets the giant go, and frames until it is in.
const letGo = async (L: ReturnType<typeof loader>, frame: (t: number) => void) => {
  release!()
  await landed(L, frame, 3)
}

const splash = new PIXI.Texture({ source: new PIXI.TextureSource({ width: 4, height: 4 }) })
const W = 400, H = 300

function scene(look: Record<string, unknown>, order = ['loader', 'ui'], shaders = false, ready = false) {
  const assets = {
    splash: { type: 'texture', url: file('splash.png', new Uint8Array([1])), for: 'ui', preload: true },
    level: { type: 'json', url: file('level.json', '{"rooms":3}'), preload: true },
    giant: { type: 'model', url: file('giant.glb', new Uint8Array(4)), preload: true },
    later: { type: 'json', url: file('later.json', '{}'), preload: false },
  }
  const world = {
    loader: { assets, mods: { ...(shaders && { shaders: 'render3d' }), ...(ready && { ready: ['terrain3d'] }) } },
    ui: {
      mods: { behaviors: ['loader'] },
      panels: { loading: { anchor: 'center', size: [200, 100], scale: 2, layer: 9, modal: true, loading: look } },
      styles: { tip: { fontFamily: 'monospace', fontSize: 12, fill: 16777215 } },
      keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', press: 'Enter', back: 'Escape' },
    },
  }
  return { prefabs: { engine: { width: W, height: H } }, plugins: order, world }
}

const look = {
  fill: { color: 0x102030 },
  pictures: [{ picture: 'splash', at: [10, 5], size: [180, 60] }],
  bar: { at: [20, 80], size: [160, 6], edge: 1, frame: { color: 0xffffff }, track: { color: 0x202020 }, fill: { color: 0xffcc00 } },
  lines: { style: 'tip', at: [100, 92], every: 2, text: ['Hold shift to run.', 'Giants sleep at dusk.'] },
  fade: 1,
}

// A page of the scene: a loader and a ui, each frame the loader's tick, the ui's, then the ui's
// afterTick, with the clock at `t` seconds.
async function page(s = scene(look)) {
  release = undefined
  await prepare({}, [], s.world)
  vi.spyOn(performance, 'now').mockImplementation(() => clock * 1000)
  const L = loader(), U = ui()
  const wire = { scene: s, rows: [] }
  // render3d's count of what it is compiling, which the test sets
  const gpu = { compiling: 0 }
  // whether terrain3d's land is on the scene, which the test sets
  const land = { shown: false }
  const forLoader = { wire, render3d: { THREE, GLTFLoader: Held, SkeletonUtils, compiling: () => gpu.compiling }, terrain3d: { shown: () => land.shown }, ui: { PIXI: { Assets: { load: async () => splash } } } } as any
  const forUi = { wire, loader: L, ui: U } as any
  const frame = (t: number) => {
    clock = t
    L.tick(forLoader)
    U.tick(forUi)
    U.afterTick()
  }
  return { L, U, frame, gpu, land }
}

// What the loading panel shows, by key.
const on = (U: ReturnType<typeof ui>) => new Map(U.panel('loading').children.map(c => [c.label, c]))
// How far a bar's fill reaches, in its pixels.
const filled = (bar: PIXI.Container) => (bar.children[1] as PIXI.Graphics).getLocalBounds().width

test('the scene that names it is handed the loading word by the loader\'s mod', async () => {
  const s = scene(look)
  await prepare({}, [], s.world)
  const delivered = modsOf<typeof behaviors>(s.world, 'ui', 'behaviors')
  expect(delivered.map(f => Object.keys(f()))).toEqual([['loading']])
  expect(delivered[0]().loading.toString()).toBe(behaviors().loading.toString())
})

test('while the art comes down the screen covers the canvas, shows its picture once it lands, fills its bar to what has landed, and holds the input', async () => {
  const { U, L, frame } = await page()
  frame(0)
  // Nothing has landed: the picture is not drawn yet, the bar is empty.
  let shown = on(U)
  expect([...shown.keys()]).toEqual(['cover', 'picture 0', 'bar', 'file', 'line'])
  expect((shown.get('file') as PIXI.Text).text).toBe('splash.png')
  expect(shown.get('picture 0')!.visible).toBe(false)
  expect(filled(shown.get('bar')!)).toBe(0)
  expect(U.modal()).toBe('loading')
  // The cover reaches every edge of the canvas: the panel is 400 × 200 at scale 2, centred.
  const box = U.panel('loading')
  expect([box.position.x, box.position.y, box.scale.x]).toEqual([(W - 400) / 2, (H - 200) / 2, 2])
  const b = (shown.get('cover') as PIXI.Graphics).getLocalBounds()
  expect([b.x * 2 + box.position.x, b.y * 2 + box.position.y, b.width * 2, b.height * 2]).toEqual([0, 0, W, H])
  // The picture and the json land; the giant is still decoding.
  await landed(L, frame, 2)
  frame(0.5)
  shown = on(U)
  expect(L.preloads()).toEqual({ done: 2, of: 3, file: 'giant.glb' })
  expect((shown.get('file') as PIXI.Text).text).toBe('giant.glb')
  const sprite = shown.get('picture 0') as PIXI.Sprite
  expect([sprite.visible, sprite.texture, sprite.x, sprite.y, sprite.width, sprite.height]).toEqual([true, splash, 10, 5, 180, 60])
  expect(filled(shown.get('bar')!)).toBe(Math.round(160 * 2 / 3))
  expect((shown.get('line') as PIXI.Text).text).toBe('Hold shift to run.')
  expect(shown.get('cover')!.alpha).toBe(1)
  // Two seconds in, the next line.
  frame(2.1)
  expect((on(U).get('line') as PIXI.Text).text).toBe('Giants sleep at dusk.')
  frame(4.2)
  expect((on(U).get('line') as PIXI.Text).text).toBe('Hold shift to run.')
  expect(U.modal()).toBe('loading')
  U.close()
})

test('a line that gives a picture shows it at the panel\'s corner at the size it was made, while that line shows, and a line with none shows none', async () => {
  const lines = { ...look.lines, text: [{ text: 'Hold shift to run.', picture: 'splash' }, 'Giants sleep at dusk.'] }
  const { U, L, frame } = await page(scene({ ...look, pictures: [], lines }))
  frame(0)
  expect((on(U).get('line picture') as PIXI.Sprite).visible).toBe(false)
  await landed(L, frame, 2)
  frame(0.5)
  const sprite = on(U).get('line picture') as PIXI.Sprite
  expect([sprite.visible, sprite.texture, sprite.x, sprite.y, sprite.width, sprite.height]).toEqual([true, splash, 0, 0, 4, 4])
  // The bar and the words are drawn over it, though it landed after them.
  expect([...on(U).keys()]).toEqual(['cover', 'line picture', 'bar', 'file', 'line'])
  frame(2.1)
  expect(sprite.visible).toBe(false)
  frame(4.2)
  expect(sprite.visible).toBe(true)
  U.close()
})

test('once everything the first tick started is in, the screen fades over its fade, then goes and lets go of the input, and never comes back', async () => {
  const { U, L, frame } = await page()
  frame(0)
  await landed(L, frame, 2)
  frame(10)
  await letGo(L, frame)
  frame(10)
  expect(L.preloads()).toEqual({ done: 3, of: 3, file: '' })
  expect(filled(on(U).get('bar')!)).toBe(160)
  for (const c of on(U).values()) expect(c.alpha).toBe(1)
  frame(10.25)
  for (const c of on(U).values()) expect(c.alpha).toBeCloseTo(0.75, 9)
  frame(11)
  expect(on(U).size).toBe(0)
  expect(U.modal()).toBeUndefined()
  // Something asked for after the screen went does not bring it back.
  void L.load('later')
  frame(12)
  expect(on(U).size).toBe(0)
  U.close()
})

test('once every file is in, the screen says it is compiling shaders while render3d is, its bar filling as they finish, and fades only once none is left', async () => {
  const words = { style: 'tip', at: [100, 92], text: 'Compiling shaders' }
  const { U, L, frame, gpu } = await page(scene({ ...look, shaders: words }, ['loader', 'render3d', 'ui'], true))
  gpu.compiling = 4
  frame(0)
  // Files still coming: the tips, and the bar counts files.
  expect((on(U).get('line') as PIXI.Text).text).toBe('Hold shift to run.')
  expect(on(U).has('shaders')).toBe(false)
  expect(L.shaders()).toBe(4)
  await landed(L, frame, 2)
  await letGo(L, frame)
  frame(5)
  expect(on(U).has('line')).toBe(false)
  expect((on(U).get('shaders') as PIXI.Text).text).toBe('Compiling shaders')
  expect(filled(on(U).get('bar')!)).toBe(0)
  gpu.compiling = 1
  frame(6)
  expect(filled(on(U).get('bar')!)).toBe(120)
  for (const c of on(U).values()) expect(c.alpha).toBe(1)
  gpu.compiling = 0
  frame(7)
  frame(7.5)
  for (const c of on(U).values()) expect(c.alpha).toBeCloseTo(0.5, 9)
  frame(8.5)
  expect(on(U).size).toBe(0)
  U.close()
})

test('a scene that names no shaders mod has none to wait on, and one that names a plugin it does not list is refused', async () => {
  const { L, U, frame } = await page()
  frame(0)
  expect(L.shaders()).toBe(0)
  U.close()
  const unlisted = await page(scene(look, ['loader', 'ui'], true))
  expect(() => unlisted.frame(0)).toThrow('loader\'s shaders is render3d\'s, which this scene does not list')
  unlisted.U.close()
})

test('once every file is in and no shader is compiling, the screen stays up while terrain3d\'s land is not on the scene, and fades the frame it is', async () => {
  const { U, L, frame, land } = await page(scene(look, ['loader', 'terrain3d', 'ui'], false, true))
  frame(0)
  await landed(L, frame, 2)
  await letGo(L, frame)
  frame(5)
  // Every file in: the bar full, the tips going round, the screen whole.
  expect(L.settled()).toBe(false)
  expect(filled(on(U).get('bar')!)).toBe(160)
  expect(on(U).has('line')).toBe(true)
  frame(30)
  for (const c of on(U).values()) expect(c.alpha).toBe(1)
  expect(U.modal()).toBe('loading')
  land.shown = true
  frame(31)
  expect(L.settled()).toBe(true)
  frame(31.5)
  for (const c of on(U).values()) expect(c.alpha).toBeCloseTo(0.5, 9)
  frame(32)
  expect(on(U).size).toBe(0)
  expect(U.modal()).toBeUndefined()
  U.close()
})

test('a scene that names no ready mod is settled, and one that names a plugin it does not list is refused', async () => {
  const { L, U, frame } = await page()
  frame(0)
  expect(L.settled()).toBe(true)
  U.close()
  const unlisted = await page(scene(look, ['loader', 'ui'], false, true))
  expect(() => unlisted.frame(0)).toThrow('loader\'s ready is terrain3d\'s, which this scene does not list')
  unlisted.U.close()
})

test('a fade of 0 takes the screen away the frame everything is in', async () => {
  const { U, L, frame } = await page(scene({ ...look, fade: 0 }))
  frame(0)
  await landed(L, frame, 2)
  await letGo(L, frame)
  frame(1)
  expect(on(U).size).toBe(0)
  U.close()
})

test('on a page with a loading cover, the bar never shows less than the cover had, and the cover comes off the frame after the screen drew every picture', async () => {
  const removed: number[] = []
  const element = { remove: () => removed.push(clock) }
  vi.stubGlobal('document', { getElementById: (id: string) => (id === 'loader-cover' ? element : null) })
  vi.stubGlobal(Symbol.for('loader: cover') as unknown as string, Object.assign(new Map(), { progress: () => 0.9 }))
  try {
    const { U, L, frame } = await page()
    frame(0)
    // Nothing has landed in the loader; the cover had nine tenths in, and the bar shows that much.
    expect(filled(on(U).get('bar')!)).toBe(144)
    expect(removed).toEqual([])
    // The picture lands: the frame that draws it keeps the cover, the one after takes it off.
    await vi.waitFor(() => { frame(clock); expect(L.get('splash')).toBe(splash) })
    const drew = clock
    expect(removed).toEqual([])
    frame(drew + 0.1)
    expect(removed).toEqual([drew + 0.1])
    // Past the cover's nine tenths, the bar is the loader's own.
    await landed(L, frame, 2)
    await letGo(L, frame)
    frame(clock)
    expect(filled(on(U).get('bar')!)).toBe(160)
    U.close()
  } finally {
    vi.unstubAllGlobals()
  }
})

test('numbers of the wrong shape throw the first frame, naming the panel', async () => {
  const bad = async (l: Record<string, unknown>) => (await page(scene(l))).frame
  await expect(bad({ ...look, fade: -1 }).then(f => f(0))).rejects.toThrow('ui panel loading\'s loading fade -1 is not a number of seconds from 0')
  await expect(bad({ ...look, pictures: [{ picture: 'level', at: [0, 0], size: [1, 1] }] }).then(f => f(0))).rejects.toThrow('ui panel loading\'s loading picture level is no preloaded texture entry for ui in world.loader.assets')
  await expect(bad({ ...look, lines: { ...look.lines, every: 0 } }).then(f => f(0))).rejects.toThrow('ui panel loading\'s loading lines every 0 is not a number of seconds above 0')
  await expect(bad({ ...look, lines: { ...look.lines, text: [{ text: 'x', picture: 'level' }] } }).then(f => f(0))).rejects.toThrow('ui panel loading\'s loading lines picture level is no preloaded texture entry for ui in world.loader.assets')
  await expect(bad({ ...look, lines: { ...look.lines, text: [] } }).then(f => f(0))).rejects.toThrow('ui panel loading\'s loading lines has no text')
})

test('a scene that lists the loader after the ui is refused', async () => {
  const { frame } = await page(scene(look, ['ui', 'loader']))
  expect(() => frame(0)).toThrow('ui is listed before loader, whose behaviors it reads that frame')
})

afterAll(() => rmSync(folder, { recursive: true }))
