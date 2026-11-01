// Darkness over render2d's world and the lights in it. Each test writes its own scene: an isometric
// world, or a flat one whose y grows down the screen, with a floor, things and the darkness layer
// over them; torches, whose light is their kind's, and heroes, who carry some of their own. No canvas
// is mounted, so nothing is drawn, and the darkness and its lights are placed as they would be for one.
// Node has no document for PixiJS to make the canvas it asks WebGL's precision of when a filter is
// made, so it is handed one with no WebGL, which PixiJS answers as a GPU of the lowest precision.
import { expect, test } from 'vitest'
import * as PIXI from 'pixi.js'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { light2d } from './light2d.plugin.ts'

PIXI.DOMAdapter.set({ ...PIXI.DOMAdapter.get(), createCanvas: () => ({ getContext: () => null }) as any })

const DT = 1 / 60
const iso = { ground: [[32, 16], [-32, 16]], up: [0, -32], zoom: 2, look: [4, 4], layers: ['floor', { name: 'things', sort: true }, 'dark'] }
const flat = { ground: [[1, 0], [0, 1]], up: [0, -1], zoom: 1, look: [0, 0], layers: ['floor', 'dark'] }

const light = {
  layer: 'dark',
  ambient: { colour: 0x8090ff, level: 0.15 },
  kinds: {
    torch: { colour: 0xffa040, radius: 3, intensity: 0.9, flicker: true },
    hero: { colour: 0xffffff, radius: 5 },
  },
  budget: 2,
  falloff: { size: 64, core: 0.25, power: 2 },
  flicker: { rate: 8, depth: 0.3 },
}

const page = (world: any = iso, table: any = light, order = ['light2d', 'render2d']) => {
  const plugins: any = {
    wire: { n: 0, rows: [] as any[], scene: { plugins: order, world: { render2d: world, light2d: table }, prefabs: { engine: { dt: DT, width: 400, height: 300 } } } },
    render2d: render2d(),
  }
  plugins.render2d.tick(plugins)
  const me = light2d()
  const frame = () => { me.afterTick(plugins); plugins.render2d.afterTick() }
  return { plugins, me, frame }
}

const torch = (id: number, pos: number[], data: any = {}) => ({ id, kind: 'torch', data: { pos, ...data } })
const hero = (id: number, pos: number[], l: any = { intensity: 0.8 }) => ({ id, kind: 'hero', data: { pos, light: l } })

test('lights come from rows of the listed kinds only, each its kind\'s light with its own row\'s written over it', () => {
  const { plugins, me, frame } = page(iso, { ...light, budget: 10 })
  plugins.wire.rows = [
    torch(1, [4, 4]),
    hero(2, [5, 4], { intensity: 0.6, colour: 0x00ff00 }),
    { id: 3, kind: 'wall', data: { pos: [4, 5], light: { colour: 0xffffff, radius: 9, intensity: 1 } } },
    hero(4, [3, 4], { intensity: 0 }),
  ]
  frame()
  expect(me.lights.map(l => l.id).sort()).toEqual([1, 2])
  const h = me.lights.find(l => l.id === 2)!
  expect([h.colour, h.radius, h.intensity]).toEqual([0x00ff00, 5, 0.6])
  expect(h.sprite.tint).toBe(0x00ff00)
  expect(h.sprite.alpha).toBeCloseTo(0.6)
  expect(h.sprite.blendMode).toBe('add')
  const t = me.lights.find(l => l.id === 1)!
  expect([t.colour, t.radius]).toEqual([0xffa040, 3])
})

test('a light of a listed kind missing a field of its light, or a pos, throws', () => {
  const { plugins, me } = page()
  plugins.wire.rows = [{ id: 1, kind: 'hero', data: { pos: [0, 0] } }]
  expect(() => me.afterTick(plugins)).toThrow('light2d: row 1 of kind hero gives light with no intensity')
  plugins.wire.rows = [{ id: 2, kind: 'torch', data: {} }]
  expect(() => me.afterTick(plugins)).toThrow('light2d: row 2 of kind torch gives light and has no pos')
})

test('past the budget, the lights drawn are those nearest the point the camera looks at, the lower id first of two as near', () => {
  const { plugins, me, frame } = page(iso, { ...light, budget: 2 })
  plugins.wire.rows = [hero(1, [9, 9]), hero(2, [4, 5]), hero(3, [4, 3]), hero(4, [4.2, 4])]
  frame()
  expect(me.lights.map(l => l.id)).toEqual([4, 2])
  // Rows 2 and 3 are as far from the look point; the lower id is kept.
  plugins.render2d.look([4, 4])
  plugins.wire.rows = [hero(3, [4, 3]), hero(2, [4, 5]), hero(1, [9, 9])]
  frame()
  expect(me.lights.map(l => l.id)).toEqual([2, 3])
  // The camera moves to row 1, and it comes first.
  plugins.render2d.look([9, 9])
  frame()
  expect(me.lights.map(l => l.id)).toEqual([1, 2])
  // Only the lights drawn are on the darkness.
  const dark = me.lights[0].sprite.parent
  expect(dark.children.filter((c: any) => c.blendMode === 'add')).toHaveLength(2)
})

test('a flickering light is at the same intensity on every page at one step, moves as the steps go by, and never dips past its depth', () => {
  const a = page(), b = page()
  const rows = [torch(5, [4, 4]), hero(6, [4, 4])]
  const at = (p: ReturnType<typeof page>, n: number) => {
    p.plugins.wire.n = n
    p.plugins.wire.rows = rows
    p.frame()
    return p.me.lights.map(l => l.intensity)
  }
  const seen = new Set<number>()
  for (const n of [0, 7, 60, 61, 1000, 123456]) {
    const [ta, ha] = at(a, n)
    expect(at(b, n)).toEqual([ta, ha])
    // The hero's light does not flicker.
    expect(ha).toBe(0.8)
    expect(ta).toBeLessThanOrEqual(0.9)
    expect(ta).toBeGreaterThanOrEqual(0.9 * (1 - 0.3))
    seen.add(ta)
  }
  expect(seen.size).toBeGreaterThan(3)
  // Two torches at one step flicker each its own way.
  a.plugins.wire.rows = [torch(5, [4, 4]), torch(9, [4, 4])]
  a.frame()
  expect(a.me.lights[0].intensity).not.toBe(a.me.lights[1].intensity)
  // A row's own flicker is written over the table's: no depth, no flicker.
  a.plugins.wire.rows = [torch(5, [4, 4], { light: { flicker: { depth: 0 } } })]
  a.frame()
  expect(a.me.lights[0].intensity).toBe(0.9)
})

test('the darkness is the ambient colour times its level, covers the canvas under the camera, and is multiplied onto the world', () => {
  const { plugins, me, frame } = page()
  plugins.wire.rows = [hero(1, [4, 4])]
  frame()
  const dark = me.lights[0].sprite.parent
  expect(dark.parent).toBe(plugins.render2d.layer('dark'))
  expect(dark.filters).toHaveLength(1)
  expect(dark.filters[0].blendMode).toBe('multiply')
  const ambient = dark.children[0]
  expect(ambient.tint).toBe((Math.round(0x80 * 0.15) << 16) | (Math.round(0x90 * 0.15) << 8) | Math.round(0xff * 0.15))
  // Its corners, drawn through the camera, are the canvas's.
  const world = plugins.render2d.world
  const canvas = (x: number, y: number) => [world.position.x + x * world.scale.x, world.position.y + y * world.scale.y]
  const b = ambient.getBounds()
  const local = dark.parent.toLocal(new PIXI.Point(b.x, b.y))
  expect(canvas(local.x, local.y).map(Math.round)).toEqual([0, 0])
  const end = dark.parent.toLocal(new PIXI.Point(b.x + b.width, b.y + b.height))
  expect(canvas(end.x, end.y).map(Math.round)).toEqual([400, 300])
  // The camera moves, and the darkness goes with it the same frame.
  plugins.render2d.look([7, 2])
  frame()
  expect([ambient.x * world.scale.x + world.position.x, ambient.y * world.scale.y + world.position.y].map(Math.round)).toEqual([0, 0])
})

test('an ambient set for the next draw is that draw\'s alone, and the table\'s comes back after it', () => {
  const { plugins, me, frame } = page()
  plugins.wire.rows = [hero(1, [4, 4])]
  const tint = ({ colour, level }: { colour: number; level: number }) =>
    (Math.round((colour >> 16 & 255) * level) << 16) | (Math.round((colour >> 8 & 255) * level) << 8) | Math.round((colour & 255) * level)
  frame()
  const ambient = me.lights[0].sprite.parent.children[0]
  expect(ambient.tint).toBe(tint(light.ambient))
  const night = { colour: 0x203060, level: 0.5 }
  me.ambient(night)
  frame()
  expect(ambient.tint).toBe(tint(night))
  frame()
  expect(ambient.tint).toBe(tint(light.ambient))
})

test('a light stands where render2d draws its pos, and its edge is every ground point its radius away: an ellipse the ground\'s diamonds in an isometric world', () => {
  const { plugins, me, frame } = page()
  plugins.wire.rows = [torch(1, [4, 3]), hero(2, [6, 5, 0.5])]
  frame()
  const r2d = plugins.render2d
  const at = (id: number, u: number, v: number) => {
    const s = me.lights.find(l => l.id === id)!.sprite
    s.updateLocalTransform()
    const p = s.localTransform.apply(new PIXI.Point(u, v))
    return [p.x, p.y]
  }
  const half = light.falloff.size / 2
  const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 6))
  // The middle of the falloff picture is on the point render2d draws the torch's pos at.
  close(at(1, 0, 0), r2d.place([4, 3]))
  // Its right edge is 3 along the world's x, its bottom 3 along the world's y.
  close(at(1, half, 0), r2d.place([7, 3]))
  close(at(1, 0, half), r2d.place([4, 6]))
  // A point on the edge between is still 3 from the torch along the ground.
  const a = Math.PI / 5
  close(at(1, half * Math.cos(a), half * Math.sin(a)), r2d.place([4 + 3 * Math.cos(a), 3 + 3 * Math.sin(a)]))
  // A light at a height is lifted as render2d lifts it, its edge on the ground at that height.
  close(at(2, 0, 0), r2d.place([6, 5, 0.5]))
  close(at(2, half, 0), r2d.place([11, 5, 0.5]))
  // On a flat world it is a circle.
  const f = page(flat)
  f.plugins.wire.rows = [torch(1, [100, 80])]
  f.frame()
  const s = f.me.lights[0].sprite
  expect([s.x, s.y]).toEqual([100, 80])
  expect(s.width).toBeCloseTo(6)
  expect(s.height).toBeCloseTo(6)
})

test('listed after render2d it throws, and a scene with no world.light2d throws', () => {
  const late = page(iso, light, ['render2d', 'light2d'])
  expect(() => late.me.afterTick(late.plugins)).toThrow('light2d is listed after render2d, which would draw the darkness a frame behind the camera')
  const none = page(iso, null)
  expect(() => none.me.afterTick(none.plugins)).toThrow('the scene names light2d but gives no world.light2d')
})

test('close frees every sprite, the falloff picture and the filter, and takes the darkness off its layer', () => {
  const { plugins, me, frame } = page(iso, { ...light, budget: 3 })
  plugins.wire.rows = [hero(1, [4, 4]), hero(2, [5, 4]), hero(3, [6, 4])]
  frame()
  const dark = me.lights[0].sprite.parent
  const sprites = [...dark.children]
  plugins.wire.rows = [hero(1, [4, 4])]
  frame()
  // Two lights went out: their sprites are off the darkness, and still freed on close.
  expect(dark.children).toHaveLength(2)
  const texture = me.lights[0].sprite.texture
  let freed = false
  dark.filters[0].on('destroy', () => { freed = true })
  me.close()
  expect(me.lights).toEqual([])
  expect(plugins.render2d.layer('dark').children).toEqual([])
  expect(dark.destroyed).toBe(true)
  expect(sprites).toHaveLength(4)
  for (const s of sprites) expect(s.destroyed).toBe(true)
  expect(texture.destroyed).toBe(true)
  expect(freed).toBe(true)
})

test('closed after render2d, as a page closes its plugins, it still frees the filter and the falloff picture', () => {
  const { plugins, me, frame } = page(iso, light)
  plugins.wire.rows = [hero(1, [4, 4])]
  frame()
  const dark = me.lights[0].sprite.parent
  const texture = me.lights[0].sprite.texture
  let freed = false
  dark.filters[0].on('destroy', () => { freed = true })
  plugins.render2d.close()
  expect(dark.destroyed).toBe(true)
  expect(() => me.close()).not.toThrow()
  expect(freed).toBe(true)
  expect(texture.destroyed).toBe(true)
})
