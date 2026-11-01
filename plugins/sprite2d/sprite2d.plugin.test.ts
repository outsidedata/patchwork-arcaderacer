// Rows drawn as sprites in render2d's world. The test writes its own scene: a side-on world whose y
// grows down the screen, with a floor, a layer of shadows and a sorted layer of things; a fighter
// kind whose sheet has hand-cut frames drawn facing right and mirrored for left; a lamp of one
// frame; and a loader standing in for the page's that hands over a sheet once the test says it has
// landed, cut the way the loader cuts one, and three palettes: the fighter's own, drawn in red,
// the same drawn in green, and one too short to swap it.
import { expect, test } from 'vitest'
import * as PIXI from 'pixi.js'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { frameOf, pick, read, type Sheet } from '#plugins/loader/loader.sim.ts'
import { sprite2d } from './sprite2d.plugin.ts'

// Node has no canvas for PixiJS to ask how precise a filter's shader may be: one with no WebGL,
// which leaves it at PixiJS's own default, stands in for the page's.
PIXI.DOMAdapter.set({ ...PIXI.DOMAdapter.get(), createCanvas: () => ({ getContext: () => null }) as any })

// An Aseprite JSON-Array of frames each whole on the page, `[id, x, y, w, h, anchor, ms]`.
const cells = (list: [string, number, number, number, number, [number, number], number][]) => list.map(([filename, x, y, w, h, [ax, ay], duration]) => ({
  filename, frame: { x, y, w, h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h }, pivot: { x: ax / w, y: ay / h }, duration,
}))
const fighterFile = {
  frames: cells([
    ['stand', 0, 0, 20, 40, [8, 40], 1000 / 6],
    ['blot', 80, 0, 30, 10, [15, 5], 1000],
    ['wind', 20, 0, 24, 40, [8, 40], 1000 / 12],
    ['punch', 44, 0, 36, 40, [8, 40], 1000 / 12],
  ]),
  meta: {
    app: 'test', image: 'fighter.png',
    frameTags: [{ name: 'idle', from: 0, to: 0 }, { name: 'shadow', from: 1, to: 1 }, { name: 'attack', from: 2, to: 3, repeat: '1' }],
  },
}
const fighter = read(fighterFile, '/fighter.json', { nearest: true, facing: { first: 0, mirror: true } })
// The fighter again, its catalogue entry naming its palette.
const painted = read(structuredClone(fighterFile), '/fighter.json', { nearest: true, palette: 'red' })
const lamp = read({ frames: cells([['lit', 0, 0, 16, 16, [8, 16], 1000]]), meta: { app: 'test', image: 'lamp.png', frameTags: [{ name: 'glow', from: 0, to: 0 }] } }, '/lamp.json')

const prefabs = {
  engine: { width: 400, height: 300 },
}
const world = {
  render2d: { ground: [[1, 0], [0, 1]], up: [0, -1], zoom: 1, look: [200, 150], layers: ['floor', 'shadows', { name: 'things', sort: true }] },
  sprite2d: {
    kinds: {
      foe: { layer: 'things', turn: 2, shadow: { layer: 'shadows', size: [13, 4], alpha: 0.28, fade: 0.004 } },
      hero: { layer: 'things', turn: 2, shadow: { layer: 'shadows', size: [13, 4], alpha: 0.28, fade: 0.004 } },
      lamp: { layer: 'things', turn: 1 },
      // A kind whose every row looks one way: its entry gives the look, its rows carry none.
      torch: { layer: 'things', turn: 1, sheet: 'lamp', clip: 'glow', facing: 0 },
      plane: { layer: 'things', turn: 2, shadow: { layer: 'shadows', clip: 'shadow', alpha: 0.5, fade: 0.01 } },
    },
  },
}

const decode = (data: Sheet) => {
  const pages = data.pages.map(() => new PIXI.Texture({ source: new PIXI.TextureSource({ width: 256, height: 256 }) }))
  const cut = new Map<string, PIXI.Texture>()
  return {
    data,
    pages,
    texture(id: string) {
      if (!cut.has(id)) {
        const [x, y, w, h] = data.frames[id].box
        cut.set(id, new PIXI.Texture({ source: pages[0].source, frame: new PIXI.Rectangle(x, y, w, h) }))
      }
      return cut.get(id)
    },
    pick: (clip: string, turns: number) => pick(data, clip, turns),
    frameOf: (clip: string, run: number, i: number) => frameOf(data, clip, run, i),
  }
}

const page = (scene: any = world) => {
  const sheets: Record<string, any> = {
    fighter: decode(fighter), lamp: decode(lamp), painted: decode(painted),
    red: [0x000000, 0xff0000], green: [0x000000, 0x00ff00], short: [0x000000], wide: Array.from({ length: 33 }, (_, i) => i),
  }
  const landed = new Set<string>()
  const asked: string[] = []
  const plugins: any = {
    wire: { rows: [] as any[], scene: { prefabs, world: scene } },
    render2d: render2d(),
    loader: { get: (name: string) => (landed.has(name) ? sheets[name] : undefined), load: (name: string) => asked.push(name) },
  }
  plugins.render2d.tick(plugins)
  const land = (...names: string[]) => names.forEach(n => landed.add(n))
  return { plugins, land, asked, me: sprite2d() }
}

const hero = (data: any = {}) => ({ id: 7, kind: 'hero', data: { sheet: 'fighter', clip: 'idle', frame: 0, facing: 0, pos: [100, 60], ...data } })
const things = (plugins: any) => plugins.render2d.layer('things').children
const shadows = (plugins: any) => plugins.render2d.layer('shadows').children

test('a row of a listed kind is its frame, its anchor standing on the point its pos is drawn at, on its kind\'s layer', () => {
  const { plugins, land, me } = page()
  land('fighter')
  plugins.wire.rows = [hero(), { id: 8, kind: 'wall', data: { pos: [0, 0] } }]
  me.afterTick(plugins)
  expect(things(plugins)).toHaveLength(1)
  const [s] = things(plugins)
  expect([s.texture.frame.x, s.texture.frame.width]).toEqual([0, 20])
  expect([s.anchor.x, s.anchor.y]).toEqual([8 / 20, 1])
  expect([s.position.x, s.position.y]).toEqual([100, 60])
  expect(s.scale.x).toBe(1)
  expect(s.visible).toBe(true)
})

test('a row naming a layer is drawn on it in place of its kind\'s, and moves back to its kind\'s when it names none', () => {
  const { plugins, land, me } = page()
  land('fighter')
  plugins.wire.rows = [hero({ layer: 'floor' })]
  me.afterTick(plugins)
  expect(things(plugins)).toHaveLength(0)
  expect(plugins.render2d.layer('floor').children).toHaveLength(1)
  const [s] = plugins.render2d.layer('floor').children
  plugins.wire.rows = [hero({ layer: null })]
  me.afterTick(plugins)
  expect(plugins.render2d.layer('floor').children).toHaveLength(0)
  expect(things(plugins)).toEqual([s])
  plugins.wire.rows = [hero({ layer: 'floor' })]
  me.afterTick(plugins)
  expect(things(plugins)).toHaveLength(0)
  expect(plugins.render2d.layer('floor').children).toEqual([s])
})

test('the frame drawn is the row\'s frame of its clip, and a clip that changes is drawn at the frame the row says', () => {
  const { plugins, land, me } = page()
  land('fighter')
  const row = hero({ clip: 'attack', frame: 1 })
  plugins.wire.rows = [row]
  me.afterTick(plugins)
  expect(things(plugins)[0].texture.frame.x).toBe(44)
  row.data.frame = 0
  me.afterTick(plugins)
  expect(things(plugins)[0].texture.frame.x).toBe(20)
})

test('a row with no frame, of a kind that never plays, shows its clip\'s first', () => {
  const { plugins, land, me } = page()
  land('fighter', 'lamp')
  plugins.wire.rows = [hero({ clip: 'attack', frame: undefined }), { id: 3, kind: 'torch', data: { pos: [10, 10] } }]
  me.afterTick(plugins)
  expect(things(plugins).map((s: any) => s.texture.frame.x)).toEqual([20, 0])
})

test('a fighter heading left is its right-facing frame flipped about the anchor', () => {
  const { plugins, land, me } = page()
  land('fighter')
  plugins.wire.rows = [hero({ facing: 1 })]
  me.afterTick(plugins)
  const [s] = things(plugins)
  expect(s.scale.x).toBe(-1)
  expect([s.position.x, s.position.y]).toEqual([100, 60])
})

test('a thing off the ground is drawn lifted and sorted by the ground under it', () => {
  const { plugins, land, me } = page()
  land('fighter')
  plugins.wire.rows = [hero({ pos: [100, 60, 23] })]
  me.afterTick(plugins)
  const [s] = things(plugins)
  expect(s.position.y).toBe(37)
  expect(s.zIndex).toBeCloseTo(60)
})

test('a thing nearer the bottom of the screen is drawn over one further up, and of two at one depth the kind listed later', () => {
  const { plugins, land, me } = page()
  land('fighter')
  plugins.wire.rows = [hero({ pos: [100, 60] }), { ...hero({ pos: [110, 60] }), id: 9, kind: 'foe' }, { ...hero({ pos: [90, 70] }), id: 10, kind: 'foe' }]
  me.afterTick(plugins)
  plugins.render2d.layer('things').sortChildren()
  expect(things(plugins).map((s: any) => s.position.x)).toEqual([110, 100, 90])
})

test('a shadow lies on the ground under its thing, fading with height, and a row whose shadow is 0 casts none', () => {
  const { plugins, land, me } = page()
  land('fighter')
  const row = hero({ pos: [100, 60, 20] })
  plugins.wire.rows = [row]
  me.afterTick(plugins)
  const [shadow] = shadows(plugins)
  expect([shadow.position.x, shadow.position.y]).toEqual([100, 60])
  expect(shadow.alpha).toBeCloseTo(0.28 - 0.004 * 20)
  row.data.shadow = 0
  me.afterTick(plugins)
  expect(shadow.alpha).toBe(0)
})

test('a shadow with a clip is that clip\'s frame of the thing\'s own sheet on the ground under it, facing and mirrored as the thing is', () => {
  const { plugins, land, me } = page()
  land('fighter')
  const row = { id: 9, kind: 'plane', data: { sheet: 'fighter', clip: 'idle', frame: 0, facing: 1, pos: [100, 60, 30] } }
  plugins.wire.rows = [row]
  me.afterTick(plugins)
  const [shadow] = shadows(plugins)
  expect(shadow.texture.frame.x).toBe(80)
  expect([shadow.anchor.x, shadow.anchor.y]).toEqual([0.5, 0.5])
  expect([shadow.position.x, shadow.position.y]).toEqual([100, 60])
  expect(shadow.alpha).toBeCloseTo(0.5 - 0.01 * 30)
  expect(shadow.scale.x).toBe(-1)
  row.data.facing = 0
  me.afterTick(plugins)
  expect(shadow.scale.x).toBe(1)
})

test('a kind with no shadow casts none', () => {
  const { plugins, land, me } = page()
  land('lamp')
  plugins.wire.rows = [{ id: 3, kind: 'lamp', data: { sheet: 'lamp', clip: 'glow', frame: 0, facing: 0.5, pos: [10, 10] } }]
  me.afterTick(plugins)
  expect(shadows(plugins)).toHaveLength(0)
  expect(things(plugins)[0].scale.x).toBe(1)
})

test('a sheet of pixel art is drawn on whole pixels', () => {
  const { plugins, land, me } = page()
  land('fighter', 'lamp')
  plugins.wire.rows = [hero({ pos: [100.4, 60.6] }), { id: 3, kind: 'lamp', data: { sheet: 'lamp', clip: 'glow', frame: 0, facing: 0, pos: [10.4, 10.6] } }]
  me.afterTick(plugins)
  const [f, l] = things(plugins)
  expect([f.position.x, f.position.y, f.roundPixels]).toEqual([100, 61, true])
  expect([l.position.x, l.position.y, l.roundPixels]).toEqual([10.4, 10.6, false])
})

test('a sprite is hidden, its sheet asked for, until the sheet lands; a row that ends takes its sprite and shadow; close frees the rest', () => {
  const { plugins, land, asked, me } = page()
  const other = { ...hero({ pos: [50, 50] }), id: 11 }
  plugins.wire.rows = [hero(), other]
  me.afterTick(plugins)
  expect(asked).toContain('fighter')
  expect(things(plugins).every((s: any) => !s.visible)).toBe(true)
  land('fighter')
  me.afterTick(plugins)
  expect(things(plugins).every((s: any) => s.visible)).toBe(true)
  const [gone, rest] = things(plugins)
  const [gonesShadow] = shadows(plugins)
  plugins.wire.rows = [other]
  me.afterTick(plugins)
  expect(things(plugins)).toEqual([rest])
  expect(gone.destroyed).toBe(true)
  expect(gonesShadow.destroyed).toBe(true)
  me.close()
  expect(rest.destroyed).toBe(true)
  expect(things(plugins)).toHaveLength(0)
  expect(shadows(plugins)).toHaveLength(0)
})

test('a kind whose entry gives its look is drawn from the entry, and a row carrying a field its entry gives throws, naming both', () => {
  const { plugins, land, asked, me } = page()
  plugins.wire.rows = [{ id: 3, kind: 'torch', data: { frame: 0, pos: [10, 10] } }]
  me.afterTick(plugins)
  expect(asked).toEqual(['lamp'])
  land('lamp')
  me.afterTick(plugins)
  const [lit] = things(plugins)
  expect([lit.visible, lit.texture.frame.width, lit.position.x, lit.position.y]).toEqual([true, 16, 10, 10])
  plugins.wire.rows = [{ id: 3, kind: 'torch', data: { frame: 0, pos: [10, 10], clip: 'glow' } }]
  expect(() => me.afterTick(plugins)).toThrow('torch 3 carries clip, which world.sprite2d gives for every torch')
})

test('a clip the sheet does not have throws, and so does a scene with no world.sprite2d', () => {
  const { plugins, land, me } = page()
  land('fighter')
  plugins.wire.rows = [hero({ clip: 'fly' })]
  expect(() => me.afterTick(plugins)).toThrow('the sheet has no clip fly')
  plugins.wire.scene = { prefabs: { engine: prefabs.engine }, world: {} }
  expect(() => me.afterTick(plugins)).toThrow('the scene names sprite2d but gives no world.sprite2d')
})

test('a row\'s alpha is how much of its sprite shows, all of it when left out', () => {
  const { plugins, land, me } = page()
  land('fighter')
  const row = hero({ alpha: 0.25 })
  plugins.wire.rows = [row]
  me.afterTick(plugins)
  expect(things(plugins)[0].alpha).toBe(0.25)
  delete row.data.alpha
  me.afterTick(plugins)
  expect(things(plugins)[0].alpha).toBe(1)
})

test('a row that flips is drawn upside down in its frame\'s place, its feet where its head was, and mirrored too when it heads the other way', () => {
  const { plugins, land, me } = page()
  land('fighter')
  const row = hero({ flip: true })
  plugins.wire.rows = [row]
  me.afterTick(plugins)
  const [s] = things(plugins)
  // anchored at the middle of its bottom edge, flipped it hangs from the same point by its top
  expect([s.scale.x, s.scale.y, s.anchor.x, s.anchor.y, s.position.x, s.position.y]).toEqual([1, -1, 8 / 20, 0, 100, 60])
  row.data.facing = 1
  me.afterTick(plugins)
  expect([s.scale.x, s.scale.y]).toEqual([-1, -1])
  row.data.flip = false
  me.afterTick(plugins)
  expect([s.scale.x, s.scale.y, s.anchor.y]).toEqual([-1, 1, 1])
})

test('a row with a rot is turned about its anchor the way its x axis is drawn, upright again without one, mirrored and flipped before it turns', () => {
  const { plugins, land, me } = page()
  land('fighter')
  const a = 0.6
  const row = hero({ rot: [Math.cos(a), Math.sin(a)] })
  plugins.wire.rows = [row]
  me.afterTick(plugins)
  const [s] = things(plugins)
  // y grows down the screen here, so the world's angle is the stage's.
  expect(s.rotation).toBeCloseTo(a, 12)
  expect([s.anchor.x, s.anchor.y, s.position.x, s.position.y]).toEqual([8 / 20, 1, 100, 60])
  row.data.facing = 1
  row.data.flip = true
  me.afterTick(plugins)
  expect([s.scale.x, s.scale.y]).toEqual([-1, -1])
  expect(s.rotation).toBeCloseTo(a, 12)
  row.data.rot = null
  me.afterTick(plugins)
  expect(s.rotation).toBe(0)
  delete row.data.rot
  me.afterTick(plugins)
  expect(s.rotation).toBe(0)
})

test('in a world whose y grows up the screen, a rot is drawn turning the other way on the stage', () => {
  const up = { ...world, render2d: { ...world.render2d, ground: [[1, 0], [0, -1]] } }
  const { plugins, land, me } = page(up)
  land('fighter')
  const a = 0.6
  plugins.wire.rows = [hero({ rot: [Math.cos(a), Math.sin(a)] })]
  me.afterTick(plugins)
  expect(things(plugins)[0].rotation).toBeCloseTo(-a, 12)
})

test('a row naming another palette is drawn through a filter swapping each colour of its sheet\'s palette for the same one of its own, hidden until both land', () => {
  const { plugins, land, asked, me } = page()
  land('painted')
  const a = hero({ sheet: 'painted', palette: 'green' }), b = { ...hero({ sheet: 'painted', palette: 'green' }), id: 8 }
  plugins.wire.rows = [a, b]
  me.afterTick(plugins)
  expect(asked).toEqual(expect.arrayContaining(['red', 'green']))
  expect(things(plugins).map((s: any) => s.visible)).toEqual([false, false])
  land('red', 'green')
  me.afterTick(plugins)
  const [one, two] = things(plugins)
  expect([one.visible, one.filters.length]).toEqual([true, 1])
  const { uFrom, uTo, uCount } = one.filters[0].resources.swap.uniforms
  expect([...uFrom.slice(0, 8)]).toEqual([0, 0, 0, 1, 1, 0, 0, 1])
  expect([...uTo.slice(0, 8)]).toEqual([0, 0, 0, 1, 0, 1, 0, 1])
  expect(uCount).toBe(2)
  const filter = one.filters[0]
  // Its own palette, or none, left out or null, is no swap.
  a.data.palette = 'red'
  delete b.data.palette
  me.afterTick(plugins)
  expect([one.filters, two.filters]).toEqual([null, null])
  b.data.palette = null
  me.afterTick(plugins)
  expect(two.filters).toBe(null)
  me.close()
  expect(filter.resources).toBe(null)
})

test('a palette swap on a sheet naming no palette, to a palette shorter than the sheet\'s, or of more than 32 colours, throws', () => {
  const { plugins, land, me } = page()
  land('fighter', 'painted', 'red', 'green', 'short', 'wide')
  plugins.wire.rows = [hero({ palette: 'green' })]
  expect(() => me.afterTick(plugins)).toThrow('hero 7 draws its sheet fighter in palette green, and the sheet\'s entry names no palette of its own')
  plugins.wire.rows = [hero({ sheet: 'painted', palette: 'short' })]
  expect(() => me.afterTick(plugins)).toThrow('palette short has 1 colours, fewer than the 2 of red')
  painted.palette = 'wide'
  plugins.wire.rows = [hero({ sheet: 'painted', palette: 'green' })]
  expect(() => me.afterTick(plugins)).toThrow('palette wide has 33 colours, more than the 32 a swap takes')
  painted.palette = 'red'
})
