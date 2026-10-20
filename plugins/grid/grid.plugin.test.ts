// The browser half draws a grid's cells with the look a game hands it, from the chunk rows a truth
// of this test's makes, through the real loader reading a sheet this test writes, whose page a
// PixiJS handing back a blank texture stands in for decoding. The grid is 4 × 4 cells in chunks of
// 2, isometric as SimCity is, 32 × 16 pixel diamonds, 12 pixels a step of height.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, afterEach, expect, test, vi } from 'vitest'
import * as PIXI from 'pixi.js'
import { boot, type Row, type W } from '#engine/engine.ts'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { loader } from '#plugins/loader/loader.plugin.ts'
import { rewritten } from '#plugins/loader/loader.sim.ts'
import { cells, grid as gridKind } from './grid.sim.ts'
import { grid, type Draw } from './grid.plugin.ts'

const folder = mkdtempSync(join(tmpdir(), 'grid-plugin-'))
afterAll(() => rmSync(folder, { recursive: true }))
afterEach(() => vi.restoreAllMocks())
const fileOf = (name: string, text: string) => {
  writeFileSync(join(folder, name), text)
  return '/' + relative(process.cwd(), join(folder, name))
}

// Three frames: a flat tile 32 × 17 and a tall one 32 × 29, both standing on their bottom middle, and
// a wave clip of two timed frames.
const frame = (x: number, h: number, duration = 100) => ({ frame: { x, y: 0, w: 32, h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 32, h }, sourceSize: { w: 32, h }, pivot: { x: 0.5, y: 1 }, duration })
const sheetUrl = fileOf('tiles.json', JSON.stringify({
  frames: { flat: frame(0, 17), tall: frame(32, 29), wave0: frame(64, 17, 250), wave1: frame(96, 17, 750) },
  meta: { image: 'tiles.png', size: { w: 128, h: 29 }, frameTags: [{ name: 'wave', from: 2, to: 3, direction: 'forward' }] },
}))

const ISO = { ground: [[16, 8], [-16, 8]], up: [0, -12], zoom: 1, look: [2, 2], layers: ['under', { name: 'city', sort: true }] }
const GRID = { size: [4, 4], chunk: 2, layers: { height: { bits: 4 }, kind: { bits: 4 } }, layer: 'city' }

// A truth holding the grid, stepped once so its chunks are rows, and a page on its rows.
function page(world: any = { grid: GRID }) {
  let job: (w: W) => void = () => {}
  const truth = boot({ world, prefabs: { grid: { k: 0, cells: {} }, writer: {} }, actors: [{ is: 'grid' }, { is: 'writer' }] },
    { grid: gridKind, writer: { tick: (_me: Row, _dt: number, w: W) => job(w) } })
  truth.step(1)
  const seat = truth.open()
  const r2: any = render2d()
  r2.PIXI = { ...PIXI, Assets: { load: async () => new PIXI.Texture({ source: new PIXI.TextureSource({ width: 128, height: 29 }) }) } }
  const assets = { tiles: { type: 'sheet', url: sheetUrl, nearest: true } }
  const plugins: any = {
    wire: { n: 0, rows: truth.packet(seat).rows, scene: { world: { ...world, loader: { assets }, render2d: ISO }, prefabs: { engine: { dt: 1, width: 320, height: 200 }, loader: {} } } },
    render2d: r2,
    loader: loader(),
  }
  plugins.wire.rows.push({ id: 99, kind: 'loader', data: {} })
  const me = grid()
  plugins.grid = me
  const frameOnce = () => {
    plugins.loader.tick(plugins)
    r2.tick(plugins)
    me.afterTick(plugins)
  }
  // A step of the truth with `f` as its rule, and its packet taken.
  const step = (f: (w: W) => void = () => {}) => {
    job = f
    truth.step(1)
    job = () => {}
    plugins.wire.rows = [...truth.packet(seat).rows, { id: 99, kind: 'loader', data: {} }]
  }
  return { plugins, me, frameOnce, step, truth }
}

// Sprites on the grid's layer in the order they are drawn: each [frame id, x, y].
const drawn = (plugins: any) => [...plugins.render2d.layer('city').children]
  .sort((a: any, b: any) => a.zIndex - b.zIndex)
  .map((s: any) => [idOf(s), s.position.x, s.position.y])
const idOf = (s: any) => ['flat', 'tall', 'wave0', 'wave1'][s.texture.frame.x / 32]

// A look drawing `tall` where `kind` is 1 and `flat` elsewhere, lifted by `height`, counting the cells
// it is asked about.
const asked: string[] = []
const look = (c: any, x: number, y: number): Draw[] => {
  asked.push(`${x},${y}`)
  return [{ sheet: 'tiles', frame: c.get('kind', x, y) === 1 ? 'tall' : 'flat', lift: c.get('height', x, y) }]
}

async function ready(p: ReturnType<typeof page>) {
  p.me.look(look)
  await vi.waitFor(() => { p.frameOnce(); expect(p.plugins.loader.ready('tiles')).toBe(true) })
  p.frameOnce()
}

test('each cell is drawn with the look, its frame\'s anchor on its bottom corner, lifted by its height, back to front', async () => {
  const p = page()
  p.step(w => { const c = cells(w); c.set('kind', 1, 2, 1); c.set('height', 3, 3, 2) })
  await ready(p)
  const list = drawn(p.plugins)
  expect(list).toHaveLength(16)
  // Cell [x, y]'s bottom corner [x + 1, y + 1] is ((x − y) × 16, (x + y + 2) × 8) on the stage.
  expect(list[0]).toEqual(['flat', 0, 16])
  expect(list).toContainEqual(['tall', -16, 40])
  // Cell [3, 3], two steps up: 24 pixels above its corner at (0, 64); drawn last, nearest the viewer.
  expect(list[15]).toEqual(['flat', 0, 40])
  const sprites = p.plugins.render2d.layer('city').children
  expect(sprites.every((s: any) => s.anchor.x === 0.5 && s.anchor.y === 1 && s.roundPixels)).toBe(true)
})

test('a sheet a draw names written while the game runs draws every cell again from its new page', async () => {
  const p = page()
  await ready(p)
  const before = p.plugins.render2d.layer('city').children.map((s: any) => s.texture)
  const pageUrl = sheetUrl.replace('tiles.json', 'tiles.png')
  rewritten(pageUrl)
  await p.plugins.loader.written(pageUrl)
  asked.length = 0
  p.frameOnce()
  expect(asked).toHaveLength(16)
  const after = p.plugins.render2d.layer('city').children.map((s: any) => s.texture)
  expect(before.every((t: any) => t.destroyed)).toBe(true)
  expect(after.every((t: any, i: number) => t !== before[i] && !t.destroyed)).toBe(true)
  expect(after[0].source).toBe(p.plugins.loader.get('tiles').pages[0].source)
})

test('a cell is asked about again only when a value within reach of it changes', async () => {
  const p = page()
  await ready(p)
  asked.length = 0
  p.frameOnce()
  expect(asked).toEqual([])
  p.step(w => cells(w).set('kind', 0, 0, 1))
  p.frameOnce()
  // Reach 1: the cell and its neighbours inside the grid.
  expect(asked.sort()).toEqual(['0,0', '0,1', '1,0', '1,1'])
  expect(drawn(p.plugins)[0]).toEqual(['tall', 0, 16])
  asked.length = 0
  p.me.look(look, 0)
  p.frameOnce()
  expect(asked).toHaveLength(16)
  asked.length = 0
  p.step(w => cells(w).set('height', 2, 2, 5))
  p.frameOnce()
  expect(asked).toEqual(['2,2'])
})

test('a clip plays on the page\'s clock, each frame for its duration, every cell showing the same frame', async () => {
  const p = page()
  const now = vi.spyOn(performance, 'now').mockReturnValue(0)
  p.me.look(() => [{ sheet: 'tiles', clip: 'wave' }])
  await vi.waitFor(() => { p.frameOnce(); expect(p.plugins.loader.ready('tiles')).toBe(true) })
  p.frameOnce()
  const ids = () => [...new Set(p.plugins.render2d.layer('city').children.map(idOf))]
  expect(ids()).toEqual(['wave0'])
  now.mockReturnValue(300)
  p.frameOnce()
  expect(ids()).toEqual(['wave1'])
  now.mockReturnValue(990)
  p.frameOnce()
  expect(ids()).toEqual(['wave1'])
  // The loop is a second long, so 1.2 s is 0.2 s into it again.
  now.mockReturnValue(1200)
  p.frameOnce()
  expect(ids()).toEqual(['wave0'])
})

test('a list of frames plays on the page\'s clock at its fps, as a clip the sheet does not time', async () => {
  const p = page()
  const now = vi.spyOn(performance, 'now').mockReturnValue(0)
  p.me.look(() => [{ sheet: 'tiles', frames: ['flat', 'tall', 'wave0'], fps: 4 }])
  await vi.waitFor(() => { p.frameOnce(); expect(p.plugins.loader.ready('tiles')).toBe(true) })
  p.frameOnce()
  const ids = () => [...new Set(p.plugins.render2d.layer('city').children.map(idOf))]
  expect(ids()).toEqual(['flat'])
  now.mockReturnValue(260)
  p.frameOnce()
  expect(ids()).toEqual(['tall'])
  now.mockReturnValue(760)
  p.frameOnce()
  expect(ids()).toEqual(['flat'])
  p.me.look(() => [{ sheet: 'tiles', frames: ['flat', 'tall'] }])
  expect(() => p.frameOnce()).toThrow('a list of frames times none of its frames, and the draw gives no fps above 0')
})

test('a preview is drawn over the cells the packets bring until the next preview replaces it, and ahead is without it', async () => {
  const p = page()
  p.step(w => cells(w).set('kind', 1, 0, 1))
  await ready(p)
  p.me.preview([['kind', 1, 0, 0], ['kind', 2, 0, 1]])
  p.frameOnce()
  expect(p.me.cells()!.get('kind', 1, 0)).toBe(0)
  expect(drawn(p.plugins)).toContainEqual(['tall', 32, 32])
  // Ahead is the packets' cells, without the preview.
  expect([p.me.ahead()!.get('kind', 1, 0), p.me.ahead()!.get('kind', 2, 0)]).toEqual([1, 0])
  p.me.preview([['height', 2, 0, 3]])
  p.frameOnce()
  expect([p.me.cells()!.get('kind', 1, 0), p.me.cells()!.get('kind', 2, 0), p.me.cells()!.get('height', 2, 0)]).toEqual([1, 0, 3])
  expect(p.me.ahead()!.get('height', 2, 0)).toBe(0)
  p.me.preview(null)
  p.frameOnce()
  expect(p.me.cells()!.get('height', 2, 0)).toBe(0)
})

test('pick finds the cell whose top is drawn at a canvas point, a hill in front hiding what is behind it', async () => {
  const p = page()
  p.step(w => cells(w).set('height', 2, 2, 3))
  await ready(p)
  const height = (x: number, y: number) => p.me.cells()!.get('height', x, y)
  const r = p.plugins.render2d
  // The middle of cell [3, 1]'s diamond on flat ground, clear of the hill.
  const flat = r.project([3.5, 1.5, 0])
  expect(p.me.pick(flat.x, flat.y, height, 3)).toEqual([3, 1])
  // The top of cell [2, 2], three steps up.
  const hill = r.project([2.5, 2.5, 3])
  expect(p.me.pick(hill.x, hill.y, height, 3)).toEqual([2, 2])
  // Cell [1, 1]'s ground is straight behind the hill on the screen: its side hides it.
  const behind = r.project([1.5, 1.5, 0])
  expect(p.me.pick(behind.x, behind.y, height, 3)).toEqual([2, 2])
  expect(p.me.pick(behind.x, behind.y, () => 0, 0)).toEqual([1, 1])
  // With no heights handed, each cell's top is the one it is drawn at, the look's lift, and the most
  // is the highest drawn: the hill hides [1, 1] just the same.
  expect(p.me.pick(behind.x, behind.y)).toEqual([2, 2])
  expect(p.me.pick(hill.x, hill.y)).toEqual([2, 2])
  expect(p.me.pick(flat.x, flat.y)).toEqual([3, 1])
  // Off the map.
  const off = r.project([-3, 7, 0])
  expect(p.me.pick(off.x, off.y, height, 3)).toBeUndefined()
  // Flattened, with a draw standing on another cell, a building's, for [1, 1]: it does not raise
  // the cell it is drawn for, so nothing hides [1, 1] now.
  p.me.look((_c: any, x: number, y: number) => [{ sheet: 'tiles', frame: 'flat' }, ...(x === 1 && y === 1 ? [{ sheet: 'tiles', frame: 'tall', at: [3, 3] as [number, number], lift: 5 }] : [])])
  p.frameOnce()
  expect(p.me.pick(behind.x, behind.y)).toEqual([1, 1])
})

test('a draw waits for its sheet, and a layer that does not sort, a missing frame or no layer named throws', async () => {
  const p = page()
  p.me.look(look)
  p.frameOnce()
  // Nothing drawn until the sheet has landed.
  expect(p.plugins.render2d.layer('city').children).toHaveLength(0)
  await vi.waitFor(() => { p.frameOnce(); expect(p.plugins.render2d.layer('city').children).toHaveLength(16) })
  p.me.look(() => [{ sheet: 'tiles', frame: 'gone' }])
  expect(() => p.frameOnce()).toThrow('sheet tiles has no frame gone, which cell [0, 0] draws')
  const flat = page({ grid: { ...GRID, layer: 'under' } })
  expect(() => flat.frameOnce()).toThrow('world.grid.layer under is a render2d layer that does not sort')
  const none = page({ grid: { ...GRID, layer: undefined } })
  expect(() => none.frameOnce()).toThrow('world.grid.layer names no render2d layer to draw the grid on')
  expect(() => p.me.look(look, -1)).toThrow('a look\'s reach is a whole number of cells, not -1')
})
