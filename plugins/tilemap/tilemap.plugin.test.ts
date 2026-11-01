// The browser half draws the Tiled map the scene's `world.tilemap` names, read by the real loader from files of this
// test's, whose images a PixiJS handing back a blank one stands in for decoding.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, expect, test, vi } from 'vitest'
import * as PIXI from 'pixi.js'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { loader } from '#plugins/loader/loader.plugin.ts'
import { flipped, tilemap } from './tilemap.plugin.ts'

const on = (plugins: any, layer: string) => plugins.render2d.layer(layer).children

const folder = mkdtempSync(join(tmpdir(), 'tilemap-plugin-'))
afterAll(() => rmSync(folder, { recursive: true }))
const fileOf = (name: string, text: string) => {
  writeFileSync(join(folder, name), text)
  return '/' + relative(process.cwd(), join(folder, name))
}

const FH = 0x80000000, FV = 0x40000000, FD = 0x20000000
// A tileset of eight 16-pixel tiles, four across and two down; tile 2 turns into tile 3 and back.
const land = JSON.stringify({
  type: 'tileset', name: 'land', tilewidth: 16, tileheight: 16, tilecount: 8, columns: 4, image: 'land.png', imagewidth: 64, imageheight: 32,
  tiles: [{ id: 2, type: 'coin', animation: [{ tileid: 2, duration: 100 }, { tileid: 3, duration: 200 }] }],
})
const tiledMap = (more: Record<string, any> = {}) => ({
  type: 'map', orientation: 'orthogonal', renderorder: 'right-down', width: 4, height: 2, tilewidth: 16, tileheight: 16, infinite: false,
  backgroundcolor: '#5c94fc', tilesets: [{ firstgid: 1, source: 'land.tsj' }],
  layers: [
    { type: 'imagelayer', name: 'sky', image: 'sky.png', repeatx: true, offsetx: 5, offsety: 7, parallaxx: 0.5, visible: true, opacity: 1 },
    { type: 'tilelayer', name: 'ground', width: 4, height: 2, data: [1, 2 + FH, 0, 3, 0, 5 + FD, 6 + FV, 1], opacity: 0.5, tintcolor: '#ff8000', visible: true },
    { type: 'tilelayer', name: 'things', width: 4, height: 2, data: [0, 0, 7, 0, 0, 8, 0, 0], visible: true, opacity: 1 },
    { type: 'group', name: 'hidden', visible: false, layers: [{ type: 'tilelayer', name: 'front', width: 4, height: 2, data: [1, 0, 0, 0, 0, 0, 0, 0], visible: true, opacity: 1 }] },
    { type: 'objectgroup', name: 'spawns', objects: [{ id: 1, name: '', x: 0, y: 0, width: 16, height: 16 }] },
  ],
  ...more,
})
const SIDE = { ground: [[16, 0], [0, 16]], up: [0, -16], zoom: 1, look: [2, 1], layers: ['sky', 'ground', { name: 'things', sort: true }, 'front'] }

// A page on a Tiled map read by the real loader, whose images a PixiJS handing back a blank one 64
// by 32 stands in for decoding. render2d's `background` and `parallax` write down what they are
// handed.
async function tiledPage(map: any = tiledMap(), world: any = SIDE) {
  fileOf('land.tsj', JSON.stringify(JSON.parse(land)))
  const url = fileOf(`world-${Math.random().toString(36).slice(2)}.tmj`, JSON.stringify(map))
  const r2: any = render2d()
  r2.PIXI = { ...PIXI, Assets: { load: async () => new PIXI.Texture({ source: new PIXI.TextureSource({ width: 64, height: 32 }) }) } }
  const background: number[] = [], parallax: [string, number, number][] = []
  r2.background = (c: number) => background.push(c)
  r2.parallax = (name: string, fx: number, fy: number) => parallax.push([name, fx, fy])
  const assets = { world: { type: 'tilemap', url, preload: true, nearest: true } }
  const row = { id: 2, kind: 'tilemap', data: { edits: {} as Record<string, number> } }
  const plugins: any = {
    wire: { n: 0, rows: [{ id: 1, kind: 'loader', data: {} }, row], scene: { world: { loader: { assets }, render2d: world, tilemap: { file: 'world' } }, prefabs: { engine: { dt: 1 / 60, width: 256, height: 224 }, loader: {} } } },
    render2d: r2,
    loader: loader(),
  }
  const me = tilemap()
  const frame = () => {
    plugins.loader.tick(plugins)
    me.tick(plugins)
    r2.tick(plugins)
    me.afterTick(plugins)
  }
  // Until the map lands, the loader and this plugin tick and nothing is drawn.
  await vi.waitFor(() => { plugins.loader.tick(plugins); me.tick(plugins); expect(plugins.loader.ready('world')).toBe(true) })
  return { plugins, row, url, me, frame, background, parallax }
}

// The sprites of a Tiled layer drawn on a render2d layer that does not sort: its container's.
const box = (plugins: any, layer: string, i = 0) => on(plugins, layer)[i].children
const tileOf = (s: any) => (s.texture.frame.x / 16) + 4 * (s.texture.frame.y / 16) + 1

test('each tile of a Tiled map stands its picture\'s bottom left on its cell\'s, flipped as its bits say, on the layer its name names', async () => {
  const { plugins, frame } = await tiledPage()
  frame()
  const ground = box(plugins, 'ground')
  expect(ground.map(tileOf)).toEqual([1, 2, 3, 5, 6, 1])
  expect(ground.map((s: any) => [s.position.x, s.position.y])).toEqual([[8, 8], [24, 8], [56, 8], [24, 24], [40, 24], [56, 24]])
  expect(ground.map((s: any) => [s.rotation, s.scale.x, s.scale.y])).toEqual([[0, 1, 1], [0, -1, 1], [0, 1, 1], [Math.PI / 2, 1, -1], [0, 1, -1], [0, 1, 1]])
  expect(ground.every((s: any) => s.alpha === 0.5 && s.tint === 0xff8000 && s.visible && s.roundPixels)).toBe(true)
  // A tile layer hidden by its group, and an object layer, are not drawn: nothing is put on their layers.
  expect(['sky', 'ground', 'things', 'front'].map(l => on(plugins, l).length)).toEqual([1, 1, 2, 0])
})

test('a hidden layer needs no render2d layer of its name and sets no parallax', async () => {
  const map = tiledMap({ layers: [
    { type: 'tilelayer', name: 'ground', width: 4, height: 2, data: [1, 0, 0, 0, 0, 0, 0, 0], visible: true, opacity: 1 },
    { type: 'tilelayer', name: 'solid', width: 4, height: 2, data: [1, 1, 1, 1, 1, 1, 1, 1], parallaxx: 0.5, visible: false, opacity: 1 },
    { type: 'imagelayer', name: 'nowhere', image: 'sky.png', visible: false, opacity: 1 },
  ] })
  const { plugins, frame, parallax } = await tiledPage(map)
  frame()
  expect(box(plugins, 'ground').map(tileOf)).toEqual([1])
  expect(parallax.map(([name]) => name)).toEqual(['ground'])
})

test('on a render2d layer that sorts, each tile is drawn in the order of the depth of its cell\'s middle, or of the point its sort property names', async () => {
  const { plugins, frame } = await tiledPage()
  frame()
  const things = on(plugins, 'things')
  expect(things.map((s: any) => [tileOf(s), s.zIndex])).toEqual([[7, 8], [8, 24]])
  // tile 8 (id 7) sorted at a tenth of its cell: cell [1, 1]'s point [1.1, 1.1], 1.1 cells down
  const sortingAt = (value: number, name: string) => {
    fileOf(name, JSON.stringify({ ...JSON.parse(land), tiles: [...JSON.parse(land).tiles, { id: 7, properties: [{ name: 'sort', type: 'float', value }] }] }))
    return tiledPage(tiledMap({ tilesets: [{ firstgid: 1, source: name }] }))
  }
  const sorting = await sortingAt(0.1, 'sorting.tsj')
  sorting.frame()
  expect(on(sorting.plugins, 'things').map((s: any) => [tileOf(s), s.zIndex])).toEqual([[7, 8], [8, 1.1 * 16]])
  const wrong = await sortingAt(1.5, 'wrong.tsj')
  expect(() => wrong.frame()).toThrow('sorts at 1.5, not a fraction of its cell from 0 to 1')
})

test('the step counter picks a tile\'s animation frame, the same on every seat at the same step', async () => {
  const { plugins, frame } = await tiledPage()
  frame()
  const coin = box(plugins, 'ground')[2]
  expect(tileOf(coin)).toBe(3)
  plugins.wire.n = 7
  frame()
  expect(tileOf(coin)).toBe(4)
  plugins.wire.n = 17
  frame()
  expect(tileOf(coin)).toBe(4)
  plugins.wire.n = 19
  frame()
  expect(tileOf(coin)).toBe(3)
})

test('each animation frame shows for its duration in whole steps, so SMW\'s 8-frame beat stays on its step however long it plays', async () => {
  // Tile 2's frames are 133 ms each, four of them: 8 steps each at 60 a second, 32 to the loop.
  fileOf('beat.tsj', JSON.stringify({ ...JSON.parse(land), tiles: [{ id: 2, animation: [2, 3, 4, 3].map(tileid => ({ tileid, duration: 133 })) }] }))
  const { plugins, frame } = await tiledPage(tiledMap({ tilesets: [{ firstgid: 1, source: 'beat.tsj' }] }))
  const shown = (n: number) => {
    plugins.wire.n = n
    frame()
    return tileOf(box(plugins, 'ground')[2])
  }
  expect([0, 7, 8, 15, 16, 23, 24, 31, 32].map(shown)).toEqual([3, 3, 4, 4, 5, 5, 4, 4, 3])
  // A thousand loops on, still on the step, where counting 133 ms would have drifted 80 steps.
  expect([32000, 32007, 32008, 32016, 32024].map(shown)).toEqual([3, 3, 4, 5, 4])
})

test('an image layer that repeats is a TilingSprite reaching past the map by the canvas, its tiles lying where its offset puts one', async () => {
  const { plugins, frame } = await tiledPage()
  frame()
  const [sky] = box(plugins, 'sky')
  expect(sky).toBeInstanceOf(PIXI.TilingSprite)
  expect([sky.position.x, sky.position.y, sky.width, sky.height]).toEqual([-256, 7, 64 + 2 * 256, 32])
  expect([sky.tilePosition.x, sky.tilePosition.y]).toEqual([5 + 256, 0])
  const still = await tiledPage(tiledMap({ layers: [{ type: 'imagelayer', name: 'sky', image: 'sky.png', offsetx: 5, offsety: 7, visible: true, opacity: 1 }] }))
  still.frame()
  const [one] = box(still.plugins, 'sky')
  expect(one).not.toBeInstanceOf(PIXI.TilingSprite)
  expect([one.position.x, one.position.y]).toEqual([5, 7])
})

test('the map\'s background colour and each layer\'s parallax factors go to render2d; two factors on one render2d layer throw', async () => {
  const { frame, background, parallax } = await tiledPage()
  frame()
  expect(background).toEqual([0x5c94fc])
  expect(parallax).toEqual([['sky', 0.5, 1], ['ground', 1, 1], ['things', 1, 1]])
  const clash = await tiledPage(tiledMap({ layers: [
    { type: 'tilelayer', name: 'ground', width: 4, height: 2, data: new Array(8).fill(0), visible: true },
    { type: 'group', name: 'far', parallaxx: 0.5, layers: [{ type: 'tilelayer', name: 'ground2', width: 4, height: 2, data: new Array(8).fill(0), visible: true }] },
    { type: 'imagelayer', name: 'ground', image: 'sky.png', parallaxy: 0.25, visible: true },
  ] }), { ...SIDE, layers: ['ground', 'ground2'] })
  expect(() => clash.frame()).toThrow('draws two layers on render2d\'s ground at two parallax factors, 1, 1 and 1, 0.25')
})

test('a map whose orientation or tile size render2d\'s ground does not lay out throws, and an isometric one on its ground stands each tile on its cell\'s bottom corner', async () => {
  const wrong = await tiledPage(tiledMap(), { ...SIDE, ground: [[16, 8], [-16, 8]] })
  expect(() => wrong.frame()).toThrow('is orthogonal with tiles 16 by 16 pixels, which render2d\'s ground [[16,8],[-16,8]] does not lay out: that is [[16,0],[0,16]]')
  const iso = await tiledPage(tiledMap({ orientation: 'isometric', tilewidth: 32, tileheight: 16, layers: [{ type: 'tilelayer', name: 'ground', width: 4, height: 2, data: [1, 0, 0, 0, 0, 0, 0, 0], visible: true }] }),
    { ...SIDE, ground: [[16, 8], [-16, 8]] })
  iso.frame()
  const [tile] = box(iso.plugins, 'ground')
  // Cell [0, 0]'s bottom corner is [0, 16]; the 16-pixel picture's bottom middle stands on it.
  expect([tile.position.x, tile.position.y]).toEqual([0, 8])
})

test('when the row\'s edits change, only the cells they changed are drawn again, each in its place in its layer\'s order', async () => {
  const { plugins, row, frame } = await tiledPage()
  frame()
  const [first, second] = box(plugins, 'ground')
  row.data.edits = { 'ground:0,0': -1, 'ground:2,0': 4, 'ground:5,1': 7 }
  frame()
  expect(first.destroyed).toBe(true)
  expect(box(plugins, 'ground')[0]).toBe(second)
  expect(box(plugins, 'ground').map(tileOf)).toEqual([2, 4, 3, 5, 6, 1, 7])
  expect(box(plugins, 'ground')[1].scale.x).toBe(1)
  row.data.edits = { 'ground:2,0': 4 }
  frame()
  expect(box(plugins, 'ground').map(tileOf)).toEqual([1, 2, 4, 3, 5, 6, 1])
  row.data.edits = { 'sky:0,0': 1 }
  expect(() => frame()).toThrow('the tilemap\'s edits name sky, which is no tile layer of')
})

test('a tileset of the map written while it is drawn is drawn again from the map as it now is', async () => {
  const { plugins, frame } = await tiledPage()
  frame()
  const before = box(plugins, 'ground').slice()
  const tsj = fileOf('land.tsj', land)
  written(tsj, land.replace('"columns":4', '"columns":4,"tileoffset":{"x":0,"y":-4}'))
  await plugins.loader.written(tsj)
  frame()
  expect(before.every((s: any) => s.destroyed)).toBe(true)
  expect(box(plugins, 'ground').map((s: any) => s.position.y)).toEqual([4, 4, 4, 20, 20, 20])
})

test('close frees every sprite and container a Tiled map was drawn with', async () => {
  const { plugins, me, frame } = await tiledPage()
  frame()
  const all = ['sky', 'ground'].flatMap(l => box(plugins, l)).concat(on(plugins, 'things'))
  me.close()
  expect(all.every((s: any) => s.destroyed)).toBe(true)
  expect(['sky', 'ground', 'things', 'front'].map(l => on(plugins, l).length)).toEqual([0, 0, 0, 0])
})

test('a sprite turned and scaled as flipped says lies every point of a tile where Tiled\'s flips put it', () => {
  // A point of a tile, from its middle, flipped as Tiled flips: across the diagonal, then x, then y.
  const tiledFlip = (bits: number, [x, y]: number[]) => {
    if (bits & 1) [x, y] = [y, x]
    if (bits & 4) x = -x
    if (bits & 2) y = -y
    return [x, y]
  }
  for (let bits = 0; bits < 8; bits++) {
    const { rotation, scale } = flipped(bits)
    const m = new PIXI.Matrix().scale(...scale).rotate(rotation)
    for (const p of [[3, 1], [-2, 5]]) {
      const got = m.apply(new PIXI.Point(p[0], p[1]))
      expect([Math.round(got.x), Math.round(got.y)]).toEqual(tiledFlip(bits, p))
    }
  }
})

test('a world.tilemap naming an entry of the catalogue that is not a tilemap throws', () => {
  const assets = { hall: { type: 'json', url: '/hall.json' } }
  const plugins: any = {
    wire: { n: 0, rows: [{ id: 2, kind: 'tilemap', data: {} }], scene: { world: { loader: { assets }, tilemap: { file: 'hall' } }, prefabs: { loader: {} } } },
    loader: { on: () => {}, catalogued: (name: string) => (assets as Record<string, unknown>)[name] },
  }
  expect(() => tilemap().tick(plugins)).toThrow('world.tilemap names hall, which is no tilemap entry of the loader\'s catalogue')
})
