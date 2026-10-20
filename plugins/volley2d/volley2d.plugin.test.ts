// Every bullet in the air drawn from the ledger row, and the page's own volleys, which no row holds.
// The test writes its own scene, stepping 1/60 s a frame: a world whose y grows down the screen, a
// layer for bullets and one for shots, a patterns file, and a loader standing in for the page's
// that hands over a sheet of two bullet frames once the test says it has landed, cut the way the
// loader cuts one.
import { expect, test } from 'vitest'
import * as PIXI from 'pixi.js'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { frameOf, jsonAt, read, written } from '#plugins/loader/loader.sim.ts'
import { volley2d } from './volley2d.plugin.ts'

PIXI.DOMAdapter.set({ ...PIXI.DOMAdapter.get(), createCanvas: () => ({ getContext: () => null }) as any })

const url = '/volley2d-plugin-test/patterns.json'
written(url, JSON.stringify({
  patterns: {
    ring: [{ n: 4, ring: true, speed: 60, sheet: 'bullets', clip: 'ball' }],
    rice: [{ speed: 60, sheet: 'bullets', clip: 'rice', orient: true, layer: 'shots' }],
    bare: [{ speed: 60 }],
  },
}))
await jsonAt('patterns', url)

const sheet = read({
  frames: [
    { filename: 'ball', frame: { x: 0, y: 0, w: 8, h: 8 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 8, h: 8 }, sourceSize: { w: 8, h: 8 }, pivot: { x: 0.5, y: 0.5 } },
    { filename: 'rice', frame: { x: 8, y: 0, w: 4, h: 10 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 4, h: 10 }, sourceSize: { w: 4, h: 10 }, pivot: { x: 0.5, y: 0.5 } },
  ],
  meta: { app: 'test', image: 'bullets.png', frameTags: [{ name: 'ball', from: 0, to: 0 }, { name: 'rice', from: 1, to: 1 }] },
}, '/bullets.json', { nearest: true })

const scene = {
  prefabs: { engine: { width: 288, height: 384, dt: 1 / 60 } },
  world: {
    render2d: { ground: [[1, 0], [0, 1]], up: [0, -1], zoom: 1, look: [144, 192], layers: ['map', 'bullets', 'shots'] },
    loader: { assets: { patterns: { type: 'json', url, preload: true } } },
    volley2d: { patterns: 'patterns', bounds: [0, 0, 288, 384], layer: 'bullets' },
  },
}

const page = () => {
  const pages = [new PIXI.Texture({ source: new PIXI.TextureSource({ width: 16, height: 16 }) })]
  const decoded = {
    data: sheet, pages,
    texture: (id: string) => {
      const [x, y, w, h] = sheet.frames[id].box
      return new PIXI.Texture({ source: pages[0].source, frame: new PIXI.Rectangle(x, y, w, h) })
    },
    frameOf: (clip: string, run: number, i: number) => frameOf(sheet, clip, run, i),
  }
  let landed = false
  const asked: string[] = []
  const plugins: any = {
    wire: { rows: [] as any[], scene },
    render2d: render2d(),
    loader: { get: (name: string) => (landed && name === 'bullets' ? decoded : undefined), load: (name: string) => asked.push(name) },
  }
  plugins.render2d.tick(plugins)
  return { plugins, asked, land: () => { landed = true }, me: volley2d() }
}

const ledger = (live: any[], frame = [0, 0]) => ({ id: 1, kind: 'volley2d', data: { next: live.length + 1, live, frame } })
const entry = (pattern: string, age: number, more: any = {}) => ({ id: 1, pattern, side: 'foe', at: [100, 100], dir: 0, age, gone: [], grazed: [], ...more })
const shown = (layer: any) => layer.children.filter((s: any) => s.visible)

test('each bullet of each entry is drawn where its age puts it, carried by the frame, on the default layer', () => {
  const { plugins, land, me } = page()
  land()
  plugins.wire.rows = [ledger([entry('ring', 0.5)], [0, -40])]
  me.afterTick(plugins)
  const drawn = shown(plugins.render2d.layer('bullets'))
  // four bullets 30 px out along 0, π/2, π, 3π/2, the frame 40 up
  expect(drawn.map((s: any) => [s.position.x, s.position.y])).toEqual([[130, 60], [100, 90], [70, 60], [100, 30]])
  expect(drawn.every((s: any) => s.anchor.x === 0.5 && s.anchor.y === 0.5 && s.rotation === 0)).toBe(true)
})

test('an oriented bullet turns its down along its heading, on its pattern\'s layer', () => {
  const { plugins, land, me } = page()
  land()
  plugins.wire.rows = [ledger([entry('rice', 0.1, { dir: 0 }), entry('rice', 0.1, { id: 2, dir: Math.PI / 2 })])]
  me.afterTick(plugins)
  const [right, down] = shown(plugins.render2d.layer('shots'))
  expect(right.rotation).toBeCloseTo(-Math.PI / 2, 12)
  expect(down.rotation).toBeCloseTo(0, 12)
  expect(shown(plugins.render2d.layer('bullets'))).toEqual([])
})

test('a bullet whose pattern names no sheet is not drawn; one whose sheet has not landed is hidden and its sheet asked for', () => {
  const { plugins, asked, land, me } = page()
  plugins.wire.rows = [ledger([entry('ring', 0.2), entry('bare', 0.2, { id: 2 })])]
  me.afterTick(plugins)
  expect(shown(plugins.render2d.layer('bullets'))).toEqual([])
  expect(asked).toContain('bullets')
  land()
  me.afterTick(plugins)
  expect(shown(plugins.render2d.layer('bullets'))).toHaveLength(4)
})

test('a bullet the row says is gone, or an entry the row no longer holds, is no longer drawn; close frees the pool', () => {
  const { plugins, land, me } = page()
  land()
  plugins.wire.rows = [ledger([entry('ring', 0.2)])]
  me.afterTick(plugins)
  plugins.wire.rows = [ledger([entry('ring', 0.3, { gone: [1, 3] })])]
  me.afterTick(plugins)
  expect(shown(plugins.render2d.layer('bullets'))).toHaveLength(2)
  plugins.wire.rows = [ledger([])]
  me.afterTick(plugins)
  expect(shown(plugins.render2d.layer('bullets'))).toEqual([])
  const layer = plugins.render2d.layer('bullets')
  me.close()
  expect(layer.children).toEqual([])
})

test('a volley of the page\'s own is drawn as a row\'s entry is, aged a dt a frame, carried by the frame, and on no row', () => {
  const { plugins, land, me } = page()
  land()
  plugins.wire.rows = [ledger([], [0, -40])]
  const rows = JSON.stringify(plugins.wire.rows)
  const e = me.fire('ring', [100, 60], 0)
  expect(me.preview).toEqual([e])
  me.afterTick(plugins)
  // its first frame at age 0, its point taken into the frame: four bullets on the point
  expect(e.age).toBe(0)
  expect(e.at).toEqual([100, 100])
  expect(shown(plugins.render2d.layer('bullets')).map((s: any) => [s.position.x, s.position.y])).toEqual([[100, 60], [100, 60], [100, 60], [100, 60]])
  for (let i = 0; i < 30; i++) me.afterTick(plugins)
  expect(e.age).toBeCloseTo(0.5, 12)
  expect(shown(plugins.render2d.layer('bullets')).map((s: any) => [s.position.x, s.position.y])).toEqual([[130, 60], [100, 90], [70, 60], [100, 30]])
  // drawn beside the row's own, which it never joins
  plugins.wire.rows = [ledger([entry('ring', 0.5)], [0, -40])]
  me.afterTick(plugins)
  expect(shown(plugins.render2d.layer('bullets'))).toHaveLength(8)
  expect(JSON.stringify(plugins.wire.rows[0].data.live)).toBe(JSON.stringify([entry('ring', 0.5)]))
  plugins.wire.rows = JSON.parse(rows)
  me.afterTick(plugins)
  expect(shown(plugins.render2d.layer('bullets'))).toHaveLength(4)
})

test('a page\'s volley loses each bullet out of the bounds, leaves preview once every one is gone, and one whose pattern the file lacks leaves at once', () => {
  const { plugins, land, me } = page()
  land()
  plugins.wire.rows = [ledger([])]
  const e = me.fire('ring', [100, 100], 0)
  me.afterTick(plugins)
  // at 60 px/s the left and the up bullets leave the bounds after 100 / 60 s, the right after 188 / 60
  for (let i = 0; i < 101; i++) me.afterTick(plugins)
  expect(e.gone).toEqual([2, 3])
  expect(shown(plugins.render2d.layer('bullets'))).toHaveLength(2)
  for (let i = 0; i < 88; i++) me.afterTick(plugins)
  expect(e.gone).toEqual([0, 2, 3])
  for (let i = 0; i < 300 && me.preview.length; i++) me.afterTick(plugins)
  expect(me.preview).toEqual([])
  expect(e.gone).toEqual([0, 1, 2, 3])
  expect(shown(plugins.render2d.layer('bullets'))).toEqual([])

  me.fire('nothing', [100, 100], 0)
  me.afterTick(plugins)
  expect(me.preview).toEqual([])
  me.fire('ring', [100, 100], 0)
  me.close()
  expect(me.preview).toEqual([])
})
