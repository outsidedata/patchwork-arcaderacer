// The loader's slice and paint routes over HTTP, on a repo of their own, and the slicing beneath the
// first.
import { afterAll, beforeAll, expect, test } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { edit } from '#editor/server/files.ts'
import { start } from '#editor/server/server.ts'

const here = path.join(process.cwd(), 'plugins/loader')
const root = mkdtempSync(path.join(tmpdir(), 'loader-route-'))
// The repo holds the route as the real one is, and a game's folder for the catalogue.
mkdirSync(path.join(root, 'plugins/loader'), { recursive: true })
mkdirSync(path.join(root, 'games/x'), { recursive: true })
for (const f of ['loader.route.ts', 'loader.sim.ts']) symlinkSync(path.join(here, f), path.join(root, 'plugins/loader', f))

let server: Awaited<ReturnType<typeof start>>
beforeAll(async () => { server = await start({ root, port: 0 }) })
afterAll(async () => {
  await server.close()
  rmSync(root, { recursive: true, force: true })
})

const refused = async (res: Response) => {
  expect(res.status).toBe(400)
  return (await res.json()).error as string
}

// A scene's catalogue, as the file that gives it writes it, for the entry a route writes.
const CATALOGUE = 'games/x/x.scene.json'
const SCENE = '{\n  "world": {\n    "loader": {\n      "assets": {\n        "ship": { "type": "sheet", "url": "/games/x/assets/sheets/ship.json", "nearest": true }\n      }\n    }\n  }\n}\n'
const catalogue = () => readFileSync(path.join(root, CATALOGUE), 'utf8')

// ---------------------------------------------------------------- slicing a rip
//
// A rip this test draws, 200 × 120, in tiles 32 across: a building two tiles wide with a puff of smoke
// over it and no marks; a car in a tile marked at all four corners; a slab on a slope, its left mark
// a step above its right; a thin piece with a lone pixel under its middle; a label and a badge no
// frame takes; a lone grey mark, the ripper's own colour, under nothing; and a piece two tiles
// across whose bottom mark lies where a one-tile frame's right mark would.
import { slice, sheetOf } from './loader.route.ts'
import { decodePng, encodePng, read, type Pixels } from './loader.sim.ts'

const RED = [200, 0, 0, 255], BROWN = [112, 80, 32, 255], GREY = [215, 215, 215, 255]
function rip(): Pixels {
  const p: Pixels = { width: 200, height: 120, data: new Uint8ClampedArray(200 * 120 * 4), text: {} }
  const put = (x: number, y: number, c: number[]) => p.data.set(c, (y * 200 + x) * 4)
  const box = (x0: number, y0: number, x1: number, y1: number, c = RED) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c) }
  box(8, 10, 71, 39) // the building, 64 wide
  box(30, 2, 34, 6) // its smoke, three pixels over it
  box(98, 33, 107, 37) // the car
  for (const [x, y] of [[103, 28], [88, 36], [119, 36], [103, 44]]) put(x, y, BROWN)
  box(131, 18, 156, 38) // the slab
  for (const [x, y] of [[128, 24], [159, 36], [143, 44]]) put(x, y, BROWN)
  box(5, 55, 25, 60) // the thin piece, its middle between columns 15 and 16
  put(15, 64, BROWN)
  box(170, 60, 189, 64) // the label
  box(110, 5, 199, 8) // a ripper's badge over the slab, wider than it by more than a tile, which joins nothing
  put(150, 76, GREY)
  // A frame two tiles across: its sides 63 apart, its bottom mark under their middle half a tile
  // down, a tile over and half a tile down from its left side as a one-tile frame's right mark would be.
  box(62, 70, 121, 100)
  for (const [x, y] of [[60, 96], [123, 96], [91, 112]]) put(x, y, BROWN)
  return p
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('slice finds each frame and where it stands, from its marks, its width or the lone pixel under it, and names them by row', () => {
  const cut = slice(rip(), 32, [0xd7d7d7])
  expect(cut.frames).toEqual([
    { id: '0-0', box: [8, 2, 64, 38], anchor: [40, 40] },
    { id: '0-1', box: [98, 33, 10, 5], anchor: [104, 45] },
    { id: '0-2', box: [131, 18, 26, 21], anchor: [144, 45] },
    { id: '1-0', box: [5, 55, 21, 6], anchor: [16, 65] },
    { id: '2-0', box: [62, 70, 60, 31], anchor: [92, 113] },
  ])
  const px = (x: number, y: number) => [...cut.page.data.subarray((y * 200 + x) * 4, (y * 200 + x) * 4 + 4)]
  // Every mark is taken off the page; everything else stays, the label too.
  for (const [x, y] of [[103, 28], [88, 36], [119, 36], [103, 44], [128, 24], [159, 36], [143, 44], [15, 64], [150, 76], [60, 96], [123, 96], [91, 112]]) expect(px(x, y)).toEqual([0, 0, 0, 0])
  expect(px(100, 35)).toEqual(RED)
  expect(px(180, 62)).toEqual(RED)
  // As a sheet the loader reads, each frame's pivot is its anchor, below its box for the car.
  const sheet = read(sheetOf(cut, 'rip.png'), '/rip.json')
  expect(sheet.frames['0-1'].anchor).toEqual([6, 12])
  expect(sheet.frames['0-0'].anchor).toEqual([32, 38])
  expect(() => slice(rip(), 31, [])).toThrow('a tile is an even number of pixels across, not 31')
  // Loose, what no frame took is a frame of its own when it has enough pixels: the label, 100 of
  // them, and the badge, 360; not with fewer than it has.
  const loose = slice(rip(), 32, [0xd7d7d7], 100).frames
  expect(loose.filter(f => !cut.frames.some(c => c.box.join() === f.box.join())).map(f => f.box)).toEqual([[110, 5, 90, 4], [170, 60, 20, 5]])
  expect(slice(rip(), 32, [0xd7d7d7], 361).frames.map(f => f.box).some(b => b[0] === 110)).toBe(false)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a frame stands on the bottom mark nearest a flat footprint\'s, not the top mark of a tall frame the next row down', () => {
  const p: Pixels = { width: 40, height: 70, data: new Uint8ClampedArray(40 * 70 * 4), text: {} }
  const put = (x: number, y: number) => p.data.set(BROWN, (y * 40 + x) * 4)
  const box = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.data.set(RED, (y * 40 + x) * 4) }
  // Cars on a flat road: sides at 20, bottom a quarter tile under them.
  box(10, 17, 25, 23)
  for (const [x, y] of [[17, 12], [2, 20], [33, 20], [17, 28]]) put(x, y)
  // Cars on a steep road the next row down: sides at 52, top mark twenty pixels up at 32, as near
  // the row over as a flat footprint's bottom corner and a step.
  box(8, 36, 27, 55)
  for (const [x, y] of [[17, 32], [2, 52], [33, 52], [17, 60]]) put(x, y)
  expect(slice(p, 32, []).frames).toEqual([
    { id: '0-0', box: [10, 17, 16, 7], anchor: [18, 29] },
    { id: '1-0', box: [8, 36, 20, 20], anchor: [18, 61] },
  ])
})

const sliceAt = (body: unknown) => fetch(`${server.url}/api/x/loader/slice`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the slice route writes the sheet and its page beside it, and its entry into the catalogue', async () => {
  mkdirSync(path.join(root, 'games/x/rips'), { recursive: true })
  writeFileSync(path.join(root, 'games/x/rips/city.png'), encodePng(rip()))
  const got = await (await sliceAt({ from: 'games/x/rips/city.png', to: 'games/x/sheets/city.json', tile: 32, marks: [0xd7d7d7] })).json()
  expect(got).toEqual({ url: '/games/x/sheets/city.json', files: ['games/x/sheets/city.json', 'games/x/sheets/city.png'] })
  const sheet = JSON.parse(readFileSync(path.join(root, 'games/x/sheets/city.json'), 'utf8'))
  expect(Object.keys(sheet.frames)).toEqual(['0-0', '0-1', '0-2', '1-0', '2-0'])
  expect(sheet.meta.image).toBe('city.png')
  expect([...decodePng(readFileSync(path.join(root, 'games/x/sheets/city.png'))).data]).toEqual([...slice(rip(), 32, [0xd7d7d7]).page.data])
  // With an entry: added to the catalogue, its url the sheet; one by that name there refused.
  writeFileSync(path.join(root, CATALOGUE), SCENE)
  const entry = { file: CATALOGUE, name: 'city', value: { type: 'sheet', preload: true } }
  expect(await (await sliceAt({ from: 'games/x/rips/city.png', to: 'games/x/sheets/cut.json', tile: 32, marks: [], entry })).json()).toEqual({ url: '/games/x/sheets/cut.json', files: ['games/x/sheets/cut.json', 'games/x/sheets/cut.png'] })
  const added = edit(SCENE, ['world', 'loader', 'assets', 'city'], { type: 'sheet', url: '/games/x/sheets/cut.json', preload: true })
  expect(catalogue()).toBe(added)
  expect(await refused(await sliceAt({ from: 'games/x/rips/city.png', to: 'games/x/sheets/cut.json', tile: 32, marks: [], entry }))).toBe(`${CATALOGUE} has an entry city already`)
  expect(catalogue()).toBe(added)
  expect(await refused(await sliceAt({ from: 'games/x/rips/city.gif', to: 'games/x/a.json', tile: 32, marks: [] }))).toBe('from is a path of the repo ending .png')
  expect(await refused(await sliceAt({ from: 'games/x/rips/city.png', to: 'games/x/a.txt', tile: 32, marks: [] }))).toBe('to is a path of the repo ending .json')
  expect(await refused(await sliceAt({ from: 'games/x/rips/city.png', to: 'games/x/a.json', tile: 32, marks: ['brown'] }))).toBe('marks is a list of colours 0xRRGGBB')
  expect(await refused(await sliceAt({ from: 'games/x/rips/city.png', to: 'games/x/a.json', tile: 32, marks: [], loose: -1 }))).toBe('loose is a whole number of pixels, 0 or more')
  expect(await refused(await sliceAt(null))).toBe('a slice names the picture to cut, the sheet to write, a tile\'s width and the marks\' colours')
})

// ---------------------------------------------------------------- painting a sheet
//
// Sheets this test writes into the repo: a house of two frames on a page of 4 × 2 whose file has a
// text of its own; a multipack of two, each on a page of its own, in a folder beside it; and a Tiled
// tileset cut from one image.
const paintAt = (body: unknown) => fetch(`${server.url}/api/x/loader/paint`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const PAINT = path.join(root, 'games/paint')
const frameOf = (x: number) => ({ frame: { x, y: 0, w: 2, h: 2 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 2, h: 2 }, sourceSize: { w: 2, h: 2 } })
const HOUSE = JSON.stringify({ frames: { a: frameOf(0), b: frameOf(2) }, meta: { image: 'house.png', size: { w: 4, h: 2 }, frameTags: [] } }, null, 1) + '\n'
const page = (seed: number): Pixels => ({ width: 4, height: 2, data: Uint8ClampedArray.from({ length: 32 }, (_, i) => (seed + i * 7) & 255), text: { Software: 'the test' } })
const disk = (p: string) => readFileSync(path.join(PAINT, p))
const pixelsOf = (p: string) => decodePng(disk(p))
beforeAll(() => {
  mkdirSync(path.join(PAINT, 'packs'), { recursive: true })
  writeFileSync(path.join(PAINT, 'house.json'), HOUSE)
  writeFileSync(path.join(PAINT, 'house.png'), encodePng(page(1)))
  writeFileSync(path.join(PAINT, 'packs/one.json'), JSON.stringify({ frames: { a: frameOf(0) }, meta: { image: 'one.png', related_multi_packs: ['two.json'] } }, null, 2))
  writeFileSync(path.join(PAINT, 'packs/two.json'), JSON.stringify({ frames: { b: frameOf(2) }, meta: { image: 'two.png' } }, null, 2))
  writeFileSync(path.join(PAINT, 'packs/one.png'), encodePng(page(2)))
  writeFileSync(path.join(PAINT, 'packs/two.png'), encodePng(page(3)))
  writeFileSync(path.join(PAINT, 'tiles.tsj'), JSON.stringify({ type: 'tileset', image: 'tiles.png', imagewidth: 4, imageheight: 2, tilewidth: 2, tileheight: 2, tilecount: 2, columns: 2 }))
  writeFileSync(path.join(PAINT, 'tiles.png'), encodePng(page(4)))
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('paint sets pixels on a sheet\'s own page, the rest of it and its text as they were', async () => {
  const was = disk('house.png')
  const got = await (await paintAt({ sheet: 'games/paint/house.json', pixels: { '/games/paint/house.png': [1, 0, 0x11223344, 3, 1, 0] } })).json()
  expect(got).toEqual({ url: '/games/paint/house.json', files: ['games/paint/house.png'] })
  const want = page(1)
  want.data.set([0x11, 0x22, 0x33, 0x44], 4)
  want.data.set([0, 0, 0, 0], 28)
  const now = pixelsOf('house.png')
  expect([...now.data]).toEqual([...want.data])
  expect(now.text).toEqual({ Software: 'the test' })
  expect(disk('house.json').toString()).toBe(HOUSE)
  // Naming the sheet itself as `to` is a paint of its own pages.
  const again = await (await paintAt({ sheet: 'games/paint/house.json', to: '/games/paint/house.json', pixels: { '/games/paint/house.png': [0, 0, 0xff] } })).json()
  expect(again.files).toEqual(['games/paint/house.png'])
  expect([...pixelsOf('house.png').data.subarray(0, 4)]).toEqual([0, 0, 0, 0xff])
  // The page as the tests after this one find it.
  writeFileSync(path.join(PAINT, 'house.png'), was)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('paint to another path copies the sheet there, its page named after it and set, the file naming its new page and otherwise as it was, the sheet left as it was, and its entry added', async () => {
  const was = disk('house.png')
  const body = { sheet: 'games/paint/house.json', to: 'games/paint/blue/house-blue.json', pixels: { '/games/paint/house.png': [2, 1, 0x0000ffff] } }
  const got = await (await paintAt(body)).json()
  expect(got).toMatchObject({ url: '/games/paint/blue/house-blue.json', files: ['games/paint/blue/house-blue.json', 'games/paint/blue/house-blue.png'] })
  expect(disk('blue/house-blue.json').toString()).toBe(HOUSE.replace('"house.png"', '"house-blue.png"'))
  const want = page(1)
  want.data.set([0, 0, 0xff, 0xff], 24)
  expect([...pixelsOf('blue/house-blue.png').data]).toEqual([...want.data])
  expect(disk('house.png').equals(was)).toBe(true)
  // The loader reads the copy as it reads the sheet, from the copy's own page.
  expect(read(JSON.parse(disk('blue/house-blue.json').toString()), '/games/paint/blue/house-blue.json').pages).toEqual(['/games/paint/blue/house-blue.png'])
  // Made again, it would write over the copy: refused, unless it says to replace.
  expect(await refused(await paintAt(body))).toBe('games/paint/blue/house-blue.json is there already: tick replace to write over it')
  expect((await paintAt({ ...body, replace: true, pixels: {} })).status).toBe(200)
  expect(disk('blue/house-blue.png').equals(was)).toBe(true)
  // With an entry: the copy added to the catalogue as the sheet's own entry is, but for its url.
  writeFileSync(path.join(root, CATALOGUE), SCENE)
  const like = { type: 'sheet', url: '/games/paint/house.json', preload: true, nearest: true }
  await paintAt({ ...body, to: 'games/paint/house-red.json', entry: { file: CATALOGUE, name: 'house-red', value: like } })
  expect(catalogue()).toBe(edit(SCENE, ['world', 'loader', 'assets', 'house-red'], { ...like, url: '/games/paint/house-red.json' }))
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a multipack painted to a copy: every pack and page named after the copy, each name one gives another written to name the copy\'s, a page with no pixel set copied byte for byte', async () => {
  const got = await (await paintAt({ sheet: 'games/paint/packs/one.json', to: 'games/paint/packs/one-old.json', pixels: { '/games/paint/packs/two.png': [0, 1, 0xabcdef01] } })).json()
  const files = ['one-old.json', 'one-old-two.json', 'one-old.png', 'one-old-two.png'].map(f => `games/paint/packs/${f}`)
  expect(got).toMatchObject({ url: '/games/paint/packs/one-old.json', files })
  const one = JSON.parse(disk('packs/one-old.json').toString()), two = JSON.parse(disk('packs/one-old-two.json').toString())
  expect(one.meta).toEqual({ image: 'one-old.png', related_multi_packs: ['one-old-two.json'] })
  expect(two.meta).toEqual({ image: 'one-old-two.png' })
  expect(disk('packs/one-old.png').equals(disk('packs/one.png'))).toBe(true)
  expect([...pixelsOf('packs/one-old-two.png').data.subarray(16, 20)]).toEqual([0xab, 0xcd, 0xef, 0x01])
  const sheet = read(one, '/games/paint/packs/one-old.json', {}, u => JSON.parse(disk(u.replace('/games/paint/', '')).toString()))
  expect(sheet.pages).toEqual(['/games/paint/packs/one-old.png', '/games/paint/packs/one-old-two.png'])
  expect(sheet.order).toEqual(['a', 'b'])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a Tiled tileset painted to a copy names the copy\'s image', async () => {
  const got = await (await paintAt({ sheet: 'games/paint/tiles.tsj', to: 'games/paint/tiles-dry.tsj', pixels: {} })).json()
  expect(got.files).toEqual(['games/paint/tiles-dry.tsj', 'games/paint/tiles-dry.png'])
  expect(JSON.parse(disk('tiles-dry.tsj').toString()).image).toBe('tiles-dry.png')
  expect(disk('tiles-dry.png').equals(disk('tiles.png'))).toBe(true)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('paint refuses, and writes nothing, for a page not the sheet\'s, a pixel off its page, a colour that is none, nothing set, a copy onto the sheet\'s own files, or a body that is not one', async () => {
  const was = disk('house.png')
  const house = (pixels: unknown, more = {}) => paintAt({ sheet: 'games/paint/house.json', pixels, ...more })
  expect(await refused(await house({ '/games/paint/tiles.png': [0, 0, 0] }))).toBe('sheet /games/paint/house.json has no page /games/paint/tiles.png')
  expect(await refused(await house({ '/games/paint/house.png': [4, 0, 0] }))).toBe('/games/paint/house.png is 4 × 2, and has no pixel 4, 0')
  expect(await refused(await house({ '/games/paint/house.png': [0, 0, -1] }))).toBe('-1 is no colour 0xRRGGBBAA')
  expect(await refused(await house({ '/games/paint/house.png': [0, 0] }))).toBe('the pixels of /games/paint/house.png are x, y and a colour, three numbers each')
  expect(await refused(await house({}))).toBe('no pixel of /games/paint/house.json is set')
  expect(await refused(await house({}, { to: 'games/paint/house.tsj' }))).toBe('to is a path of the repo ending .json')
  expect(await refused(await house({}, { replace: 1 }))).toBe('replace is true or false')
  expect(await refused(await house([]))).toBe('pixels are the pixels set on each page, by its url')
  expect(await refused(await paintAt({ sheet: 'games/paint/packs/one.json', to: 'games/paint/packs/two.json', pixels: {} }))).toBe('the copy of /games/paint/packs/one.json at games/paint/packs/two.json would write /games/paint/packs/one.json over games/paint/packs/two.json, a file of the sheet it copies')
  expect(await refused(await paintAt({ sheet: 'games/paint/gone.json', pixels: {} }))).toMatch(/^games\/paint\/gone\.json does not read: /)
  expect(await refused(await paintAt(null))).toBe('a paint names a sheet and the pixels set on its pages')
  expect(disk('house.png').equals(was)).toBe(true)
  expect(existsSync(path.join(PAINT, 'house.tsj'))).toBe(false)
})
