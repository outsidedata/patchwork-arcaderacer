// The world render2d draws through: where its points land on the stage and on the canvas, which way on the screen
// its headings face, which way through it a direction on the screen goes, its layers, and the
// camera, each layer's parallax and mosaic, the canvas's background and its fit to the window. Each test writes
// the `world.render2d` of a scene of its own. Node has no WebGL, so the renderer a mounted canvas
// gets is a stand-in that keeps what it is told; the world is placed as it would be for a real one.
import { afterEach, expect, test, vi } from 'vitest'
import * as PIXI from 'pixi.js'
import { render2d } from './render2d.plugin.ts'

// Every renderer a mount makes: the colour it clears to, the stages it drew, and the resolution it
// was made at and last resized to.
const renderers = vi.hoisted(() => [] as { background: { color: unknown }; drew: unknown[]; destroyed: boolean; resolution: number }[])
// The failure the next renderer is made with, as a canvas taken off the page fails one.
const failing = vi.hoisted(() => ({ next: undefined as Error | undefined }))
vi.mock('pixi.js', async original => ({
  ...(await original<typeof import('pixi.js')>()),
  autoDetectRenderer: async ({ resolution }: { resolution: number }) => {
    const failure = failing.next
    failing.next = undefined
    if (failure) throw failure
    const r = {
      background: { color: 0 as unknown },
      drew: [] as unknown[],
      destroyed: false,
      resolution,
      render(s: unknown) { r.drew.push(s) },
      resize(_w: number, _h: number, res: number) { r.resolution = res },
      destroy() { r.destroyed = true },
    }
    renderers.push(r)
    return r
  },
}))

// Node has no canvas for PixiJS to ask how precise a filter's shader may be: one with no WebGL,
// which leaves it at PixiJS's own default, stands in for the page's.
PIXI.DOMAdapter.set({ ...PIXI.DOMAdapter.get(), createCanvas: () => ({ getContext: () => null }) as any })

const iso = { ground: [[32, 16], [-32, 16]], up: [0, -32], zoom: 1, look: [0, 0], layers: ['floor', { name: 'things', sort: true }, 'over'] }
const plugins = (table: any, engine = { width: 960, height: 600 }) => ({ wire: { scene: { world: { render2d: table }, prefabs: { engine } } } }) as any

const made = (table: any) => {
  const me = render2d()
  me.tick(plugins(table))
  return me
}

test('a world point is placed along the ground from the origin, and lifted by its height', () => {
  const me = made(iso)
  expect(me.place([0, 0])).toEqual([0, 0])
  expect(me.place([1, 0])).toEqual([32, 16])
  expect(me.place([0, 1])).toEqual([-32, 16])
  expect(me.place([2.5, 1.5])).toEqual([32, 64])
  expect(me.place([1, 1, 0.5])).toEqual([0, 16])
})

test('ground is world.render2d\'s ground, a copy that changes nothing when changed, and throws before the first tick', () => {
  expect(() => render2d().ground()).toThrow('render2d has no world: it has not ticked, or the scene gives no world.render2d')
  const me = made(iso)
  const got = me.ground()
  expect(got).toEqual([[32, 16], [-32, 16]])
  got[0][0] = 99
  expect(me.ground()).toEqual([[32, 16], [-32, 16]])
  expect(me.place([1, 0])).toEqual([32, 16])
})

test('the depth of a point is the stage y of the ground under it, whatever its height', () => {
  const me = made(iso)
  expect(me.depth([1, 1])).toBe(32)
  expect(me.depth([1, 1, 3])).toBe(32)
})

test('a direction on the screen walks the world direction the ground puts that way on the screen', () => {
  const me = made(iso)
  const [x, y] = me.along([1, 0])
  expect(x).toBeCloseTo(Math.SQRT1_2)
  expect(y).toBeCloseTo(-Math.SQRT1_2)
  const [dx, dy] = me.along([0, 1])
  expect(dx).toBeCloseTo(Math.SQRT1_2)
  expect(dy).toBeCloseTo(Math.SQRT1_2)
  expect(me.along([0, 0])).toEqual([0, 0])
  const flat = made({ ...iso, ground: [[1, 0], [0, -1]] })
  expect(flat.along([0, 1])).toEqual([0, -1])
})

test('a world heading faces the way on the screen its direction is drawn', () => {
  const me = made(iso)
  // Along −y of the map is up and to the right on an isometric screen.
  expect(me.turns(0.25)).toBeCloseTo(Math.atan2(16, 32) / (2 * Math.PI))
  // Down the screen is along x and y alike.
  expect(me.turns(-0.125)).toBeCloseTo(-0.25)
  const side = made({ ...iso, ground: [[1, 0], [0, 1]] })
  expect(side.turns(0)).toBeCloseTo(0)
  expect(side.turns(0.5)).toBeCloseTo(0.5)
})

test('the layers are on the world in `world.render2d`\'s order, a sorted one sorting its things, and one asked for before the first tick is the same one', () => {
  const me = render2d()
  const early = me.layer('over')
  me.tick(plugins(iso))
  expect(me.world!.children).toEqual([me.layer('floor'), me.layer('things'), me.layer('over')])
  expect(me.layer('over')).toBe(early)
  expect(me.layer('things').sortableChildren).toBe(true)
  expect(me.layer('floor').sortableChildren).toBe(false)
  expect(me.stage.children[0]).toBe(me.world)
})

test('a layer `world.render2d` does not give throws, before the first tick or after it', () => {
  const me = render2d()
  me.layer('sky')
  expect(() => me.tick(plugins(iso))).toThrow('render2d has no layer sky')
  expect(() => made(iso).layer('sky')).toThrow('render2d has no layer sky')
})

test('a scene with no world.render2d has no world, and asking for one throws', () => {
  const me = render2d()
  me.tick(plugins(undefined))
  expect(me.world).toBeUndefined()
  expect(() => me.place([0, 0])).toThrow('render2d has no world: it has not ticked, or the scene gives no world.render2d')
  const asked = render2d()
  asked.layer('floor')
  expect(() => asked.tick(plugins(undefined))).toThrow('render2d was asked for the layer floor, and the scene gives no world.render2d')
})

test('the camera puts the looked-at point in the middle of the canvas, zoomed, on a whole pixel', () => {
  const me = made({ ...iso, zoom: 2, look: [1, 0] })
  me.afterTick()
  expect(me.world!.scale.x).toBe(2)
  expect([me.world!.position.x, me.world!.position.y]).toEqual([480 - 64, 300 - 32])
  me.look([0.3, 0.1])
  me.afterTick()
  const [x, y] = me.place([0.3, 0.1])
  expect([me.world!.position.x, me.world!.position.y]).toEqual([Math.round(480 - x * 2), Math.round(300 - y * 2)])
})

test('project is the canvas point of a world point, placed by the camera the next draw uses, and never behind', () => {
  const me = made({ ...iso, zoom: 2, look: [1, 0] })
  me.afterTick()
  const drawn = (p: number[]) => {
    const [x, y] = me.place(p)
    return { x: me.world!.position.x + x * me.world!.scale.x, y: me.world!.position.y + y * me.world!.scale.y, behind: false }
  }
  expect(me.project([1, 0])).toEqual({ x: 480, y: 300, behind: false })
  expect(me.project([2.5, 1.5, 1])).toEqual(drawn([2.5, 1.5, 1]))
  // A look an actor makes this frame is the camera the next draw uses, so project answers with it
  // before the world has been moved.
  me.look([0.3, 0.1])
  const next = me.project([2, -1, 0.5])
  me.afterTick()
  expect(next).toEqual(drawn([2, -1, 0.5]))
  // The looked-at point is in the middle of the canvas, to within the whole pixel the world is put on.
  const middle = me.project([0.3, 0.1])
  expect(Math.abs(middle.x - 480)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(middle.y - 300)).toBeLessThanOrEqual(0.5)
})

test('unproject is the world point at a height that project puts at a canvas point, under any camera', () => {
  const me = made({ ...iso, zoom: 2, look: [1, 0] })
  me.afterTick()
  for (const p of [[1, 0, 0], [2.5, 1.5, 1], [-3, 7, 0], [0.25, -0.5, 2.5]]) {
    const { x, y } = me.project(p)
    me.unproject(x, y, p[2]).forEach((v, i) => expect(v).toBeCloseTo(p[i], 9))
  }
  me.zoom(0.75)
  me.look([4, -2])
  const { x, y } = me.project([3, 3, 0])
  me.unproject(x, y).forEach((v, i) => expect(v).toBeCloseTo([3, 3, 0][i], 9))
  // The same canvas point, a step up: the ground point one step of `up` below the one under it.
  const [hx, hy] = me.unproject(x, y, 1)
  const [ux, uy] = me.place([hx, hy, 1])
  const [gx, gy] = me.place([3, 3])
  expect(ux).toBeCloseTo(gx, 9)
  expect(uy).toBeCloseTo(gy, 9)
})

test('zoom sets the camera\'s zoom while the game runs, a fraction too, and the looked-at point stays in the middle on a whole pixel', () => {
  const me = made({ ...iso, zoom: 2, look: [1, 0] })
  expect(me.camera()).toEqual({ look: [1, 0], zoom: 2 })
  me.zoom(0.75)
  me.look([0.3, 0.1])
  expect(me.camera()).toEqual({ look: [0.3, 0.1], zoom: 0.75 })
  // project answers with the zoom the next draw uses, before the world has been scaled.
  const next = me.project([2, -1, 0.5])
  me.afterTick()
  expect(me.world!.scale.x).toBe(0.75)
  const [x, y] = me.place([0.3, 0.1])
  expect([me.world!.position.x, me.world!.position.y]).toEqual([Math.round(480 - x * 0.75), Math.round(300 - y * 0.75)])
  const [px, py] = me.place([2, -1, 0.5])
  expect(next).toEqual({ x: me.world!.position.x + px * 0.75, y: me.world!.position.y + py * 0.75, behind: false })
  const middle = me.project([0.3, 0.1])
  expect(Math.abs(middle.x - 480)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(middle.y - 300)).toBeLessThanOrEqual(0.5)
  // The camera handed out is a copy: writing it moves nothing.
  me.camera().look[0] = 9
  expect(me.camera().look).toEqual([0.3, 0.1])
})

test('a zoom that is not a positive number throws, and so do zoom and camera before the first tick', () => {
  const me = made(iso)
  for (const z of [0, -1, NaN, Infinity]) expect(() => me.zoom(z)).toThrow(`render2d's zoom is a positive number, not ${z}`)
  expect(me.camera().zoom).toBe(1)
  const early = render2d()
  expect(() => early.zoom(2)).toThrow('render2d has no world')
  expect(() => early.camera()).toThrow('render2d has no world')
})

test('fit "window" puts the looked-at point in the middle of the window, and follows the window as it is resized', () => {
  const g = globalThis as any
  const had = [g.innerWidth, g.innerHeight]
  try {
    g.innerWidth = 1000
    g.innerHeight = 500
    const me = made({ ...iso, fit: 'window', look: [0, 0] })
    me.afterTick()
    expect(me.project([0, 0])).toEqual({ x: 500, y: 250, behind: false })
    g.innerWidth = 600
    g.innerHeight = 400
    me.afterTick()
    expect(me.project([0, 0])).toEqual({ x: 300, y: 200, behind: false })
    // without fit the canvas keeps the engine's size, whatever the window
    const kept = made({ ...iso, look: [0, 0] })
    kept.afterTick()
    expect(kept.project([0, 0])).toEqual({ x: 480, y: 300, behind: false })
  } finally {
    ;[g.innerWidth, g.innerHeight] = had
  }
})

test('size is the canvas\'s in its own pixels: none before the first tick, the engine\'s, or the window\'s under fit "window" as it is resized', () => {
  const g = globalThis as any
  const had = [g.innerWidth, g.innerHeight]
  try {
    g.innerWidth = 1000
    g.innerHeight = 500
    const early = render2d()
    expect(early.size).toEqual([0, 0])
    early.tick(plugins(iso))
    expect(early.size).toEqual([960, 600])
    early.afterTick()
    expect(early.size).toEqual([960, 600])
    const fitted = made({ ...iso, fit: 'window' })
    expect(fitted.size).toEqual([960, 600])
    fitted.afterTick()
    expect(fitted.size).toEqual([1000, 500])
    g.innerWidth = 600
    g.innerHeight = 400
    fitted.afterTick()
    expect(fitted.size).toEqual([600, 400])
    // A size handed out is a copy: changing it changes nothing drawn.
    fitted.size[0] = 1
    expect(fitted.size).toEqual([600, 400])
    // A scene with no world.render2d has no canvas size of render2d's.
    const none = render2d()
    none.tick(plugins(undefined))
    expect(none.size).toEqual([0, 0])
  } finally {
    ;[g.innerWidth, g.innerHeight] = had
  }
})

// ---------------------------------------------------------------- parallax

// A side-view world, as a platformer's, 256 × 224, with a sky, hills and the ground.
const side = { ground: [[16, 0], [0, 16]], up: [0, 0], zoom: 1, look: [0, 0], layers: ['sky', { name: 'hills', parallax: [0.5, 0.25] }, 'ground'] }
const smw = (table: any) => {
  const me = render2d()
  me.tick(plugins(table, { width: 256, height: 224 }))
  return me
}
// Where a layer's origin is drawn on the canvas this frame.
const drawnAt = (me: ReturnType<typeof render2d>, name: string) => {
  const l = me.layer(name)
  return [me.world!.position.x + l.position.x * me.world!.scale.x, me.world!.position.y + l.position.y * me.world!.scale.y]
}

test('a layer the camera moves at a factor moves that many times as far on the screen as the world, each on a whole pixel', () => {
  const me = smw(side)
  me.afterTick()
  // Looking at the world's origin, every layer lines up with the world.
  for (const name of ['sky', 'hills', 'ground']) expect(drawnAt(me, name)).toEqual([128, 112])
  me.look([10.3, 2.2])
  me.afterTick()
  const [x, y] = me.place([10.3, 2.2])
  expect(drawnAt(me, 'ground')).toEqual([Math.round(128 - x), Math.round(112 - y)])
  expect(drawnAt(me, 'sky')).toEqual(drawnAt(me, 'ground'))
  expect(drawnAt(me, 'hills')).toEqual([Math.round(128 - 0.5 * x), Math.round(112 - 0.25 * y)])
  expect([me.layer('ground').position.x, me.layer('ground').position.y]).toEqual([0, 0])
  // `parallax` sets a factor from the next draw on: at 0 a layer stays where it is on the screen,
  // and at 1 it is with the world again.
  me.parallax('sky', 0, 0)
  me.parallax('hills', 1, 1)
  me.afterTick()
  expect(drawnAt(me, 'sky')).toEqual([128, 112])
  expect(drawnAt(me, 'hills')).toEqual(drawnAt(me, 'ground'))
  me.look([40, 2.2])
  me.afterTick()
  expect(drawnAt(me, 'sky')).toEqual([128, 112])
  expect(drawnAt(me, 'hills')).toEqual([128 - 640, Math.round(112 - 16 * 2.2)])
})

test('a zoomed layer\'s origin is on a whole screen pixel of its own', () => {
  const me = smw({ ...side, zoom: 3 })
  me.look([1.37, 0.51])
  me.afterTick()
  const [x, y] = me.place([1.37, 0.51])
  const [hx, hy] = drawnAt(me, 'hills')
  expect(hx).toBeCloseTo(Math.round(128 - 0.5 * x * 3), 9)
  expect(hy).toBeCloseTo(Math.round(112 - 0.25 * y * 3), 9)
})

test('a factor set before the first tick is set after `world.render2d`\'s, and a layer `world.render2d` does not give throws', () => {
  const me = render2d()
  me.parallax('hills', 0.1, 0)
  me.tick(plugins(side, { width: 256, height: 224 }))
  me.look([16, 0])
  me.afterTick()
  expect(drawnAt(me, 'hills')).toEqual([Math.round(128 - 0.1 * 256), 112])
  expect(() => me.parallax('clouds', 0.5, 0.5)).toThrow('render2d has no layer clouds')
  const early = render2d()
  early.parallax('clouds', 0.5, 0.5)
  expect(() => early.tick(plugins(side))).toThrow('render2d has no layer clouds')
})

// ---------------------------------------------------------------- mosaic

test('a mosaic draws the layers it names in squares of its size over the whole canvas, and 1 draws them as they are', () => {
  const me = smw(side)
  me.mosaic(4, ['sky', 'hills'])
  me.look([10.3, 2.2])
  me.afterTick()
  const sky = me.layer('sky'), hills = me.layer('hills'), ground = me.layer('ground')
  expect(sky.filters).toHaveLength(1)
  expect(hills.filters).toHaveLength(1)
  expect((sky.filters![0] as any).resources.mosaic.uniforms.uSize).toBe(4)
  // PixiJS's frame uniforms at the precision its vertex shader gives them, or the program does not link
  for (const u of ['uInputSize', 'uInputClamp', 'uOutputFrame']) expect((sky.filters![0] as any).glProgram.fragment).toContain(`uniform highp vec4 ${u};`)
  expect(ground.filters).toBeFalsy()
  // The filter's area is the canvas, in each layer's own pixels, whatever the camera and the
  // layer's parallax put it at: its top left in the layer is the canvas's top left.
  for (const name of ['sky', 'hills']) {
    const l = me.layer(name), a = l.filterArea!
    const [x, y] = drawnAt(me, name)
    expect([a.x + x, a.y + y, a.width, a.height]).toEqual([0, 0, 256, 224])
    expect(l.position.x + me.world!.position.x + a.x).toBeCloseTo(0, 9)
  }
  // A layer not named keeps its size; another size is another filter; 1 takes the filter off.
  me.mosaic(8, ['hills'])
  me.afterTick()
  expect((me.layer('hills').filters![0] as any).resources.mosaic.uniforms.uSize).toBe(8)
  expect((sky.filters![0] as any).resources.mosaic.uniforms.uSize).toBe(4)
  me.mosaic(1, ['sky', 'hills'])
  me.afterTick()
  expect([sky.filters, hills.filters]).toEqual([null, null])
  // Zoomed, the area is still the canvas.
  const big = smw({ ...side, zoom: 2 })
  big.mosaic(2, ['ground'])
  big.look([3, 1])
  big.afterTick()
  const a = big.layer('ground').filterArea!
  expect([big.world!.position.x + a.x * 2, big.world!.position.y + a.y * 2, a.width * 2, a.height * 2]).toEqual([0, 0, 256, 224])
  for (const bad of [0, 1.5, -2]) expect(() => me.mosaic(bad, ['sky'])).toThrow(`render2d mosaic ${bad} is not a whole number of pixels, 1 or more`)
  expect(() => me.mosaic(2, ['clouds'])).toThrow('render2d has no layer clouds')
})

// ---------------------------------------------------------------- the canvas: background and fit

// The page's window and screen as `fit` reads them, with the listeners it adds to each: the
// window's by type, and every media query asked, with its change listener while it has one.
type Media = { query: string; change?: () => void }
const screen = (width: number, height: number, ratio: number) => {
  const on = new Map<string, () => void>()
  const media: Media[] = []
  vi.stubGlobal('innerWidth', width)
  vi.stubGlobal('innerHeight', height)
  vi.stubGlobal('devicePixelRatio', ratio)
  vi.stubGlobal('addEventListener', (type: string, f: () => void) => on.set(type, f))
  vi.stubGlobal('removeEventListener', (type: string, f: () => void) => { if (on.get(type) === f) on.delete(type) })
  vi.stubGlobal('matchMedia', (query: string) => {
    const m: Media = { query }
    media.push(m)
    return { addEventListener: (_: string, f: () => void) => { m.change = f }, removeEventListener: (_: string, f: () => void) => { if (m.change === f) m.change = undefined } }
  })
  return { on, media }
}
afterEach(() => { vi.unstubAllGlobals() })
const surface = () => ({ width: 256, height: 224, style: {} as Record<string, string>, remove() {} })

test('fit draws a canvas pixel across the most whole physical pixels the window has room for, and refits', () => {
  const { on, media } = screen(1000, 700, 1)
  const me = smw({ ...side, fit: 'integer' })
  const canvas = surface()
  me.canvas = canvas as any
  expect(me.scale).toBe(1)
  me.afterTick()
  // 1000 / 256 is 3.9 and 700 / 224 is 3.125: three pixels a pixel.
  expect(canvas.style).toMatchObject({ width: '768px', height: '672px', imageRendering: 'pixelated', display: '' })
  expect(me.scale).toBe(3)
  expect(media.at(-1)!.query).toBe('(resolution: 1dppx)')
  // Moved to a screen of two physical pixels a CSS pixel, 2000 × 1400 of them: six a canvas pixel,
  // three CSS pixels.
  vi.stubGlobal('devicePixelRatio', 2)
  media.at(-1)!.change!()
  expect(canvas.style).toMatchObject({ width: '768px', height: '672px' })
  expect(me.scale).toBe(3)
  // At one and a half, 1500 × 1050: four a canvas pixel, which is 2⅔ CSS pixels.
  vi.stubGlobal('devicePixelRatio', 1.5)
  media.at(-1)!.change!()
  expect(me.scale).toBeCloseTo(4 / 1.5, 12)
  expect(parseFloat(canvas.style.width) * 1.5).toBeCloseTo(1024, 9)
  expect(parseFloat(canvas.style.height) * 1.5).toBeCloseTo(896, 9)
  expect(media.at(-1)!.query).toBe('(resolution: 1.5dppx)')
  expect(media.filter(m => m.change)).toHaveLength(1)
  // A window resized smaller refits, and one smaller than the canvas still gives a canvas pixel
  // one physical pixel.
  vi.stubGlobal('devicePixelRatio', 1)
  vi.stubGlobal('innerWidth', 600)
  on.get('resize')!()
  expect(canvas.style).toMatchObject({ width: '512px', height: '448px' })
  vi.stubGlobal('innerWidth', 100)
  on.get('resize')!()
  expect(canvas.style).toMatchObject({ width: '256px', height: '224px' })
  expect(me.scale).toBe(1)
  me.close()
  expect(on.size).toBe(0)
  expect(media.filter(m => m.change)).toHaveLength(0)
})

test('fit "contain" draws the canvas as big as the window has room for at its own shape, sharp, and refits', async () => {
  const { on, media } = screen(1000, 700, 2)
  const me = render2d()
  const canvas = surface()
  me.mount(canvas as any)
  await Promise.resolve()
  const r = renderers.at(-1)!
  expect(r.resolution).toBe(2)
  me.tick(plugins({ ...side, fit: 'contain' }, { width: 256, height: 224 }))
  me.afterTick()
  // 1000 / 256 is 3.906 and 700 / 224 is 3.125: the window's height is the one that fits.
  expect(me.scale).toBe(3.125)
  expect(canvas.style).toMatchObject({ width: '800px', height: '700px', display: '' })
  expect(canvas.style.imageRendering).toBeUndefined()
  // Drawn at two physical pixels a CSS pixel, 3.125 CSS pixels a canvas pixel.
  expect(r.resolution).toBe(6.25)
  // A window resized narrower than its shape fits across it, and one smaller than the canvas draws it
  // smaller still.
  vi.stubGlobal('innerWidth', 512)
  on.get('resize')!()
  expect(me.scale).toBe(2)
  expect(canvas.style).toMatchObject({ width: '512px', height: '448px' })
  vi.stubGlobal('innerWidth', 128)
  on.get('resize')!()
  me.afterTick()
  expect(me.scale).toBe(0.5)
  expect(canvas.style).toMatchObject({ width: '128px', height: '112px' })
  expect(r.resolution).toBe(1)
  // Moved to a screen of three physical pixels a CSS pixel, it is drawn at three times its scale.
  vi.stubGlobal('devicePixelRatio', 3)
  media.at(-1)!.change!()
  me.afterTick()
  expect(r.resolution).toBe(1.5)
  expect(canvas.style).toMatchObject({ width: '128px', height: '112px' })
  expect(media.at(-1)!.query).toBe('(resolution: 3dppx)')
  me.close()
  expect(on.size).toBe(0)
  expect(media.filter(m => m.change)).toHaveLength(0)
})

test('without fit the canvas keeps the size the page gave it, and a fit that is none of the three throws', () => {
  const { on, media } = screen(1000, 700, 2)
  const me = smw(side)
  const canvas = surface()
  me.canvas = canvas as any
  me.afterTick()
  expect(canvas.style).toEqual({ display: '' })
  expect(me.scale).toBe(1)
  expect(on.size).toBe(0)
  expect(media).toHaveLength(0)
  expect(() => smw({ ...side, fit: 'cover' })).toThrow('render2d fit "cover" is none of "window", "integer" and "contain"')
})

test('the canvas is cleared to `world.render2d`\'s background until `background` says another, and a scene that gives none keeps the renderer\'s', async () => {
  const mounted = async (table: any) => {
    const me = render2d()
    me.mount(surface() as any)
    await Promise.resolve()
    me.tick(plugins(table, { width: 256, height: 224 }))
    me.afterTick()
    return { me, r: renderers.at(-1)! }
  }
  const { me, r } = await mounted({ ...side, background: '#5C94FC' })
  expect(r.background.color).toBe(0x5c94fc)
  expect(r.drew).toEqual([me.stage])
  me.background(0x000030)
  expect(r.background.color).toBe(0x5c94fc)
  me.afterTick()
  expect(r.background.color).toBe(0x000030)
  expect((await mounted({ ...side, background: 0x102030 })).r.background.color).toBe(0x102030)
  expect((await mounted(side)).r.background.color).toBe(0)
  // `background` before the first tick was said after `world.render2d`'s.
  const early = render2d()
  early.mount(surface() as any)
  await Promise.resolve()
  early.background(0xffffff)
  early.tick(plugins({ ...side, background: '#5c94fc' }))
  early.afterTick()
  expect(renderers.at(-1)!.background.color).toBe(0xffffff)
  for (const bad of ['#fff', 'blue', 0x1000000, 1.5]) expect(() => smw({ ...side, background: bad })).toThrow(`render2d background ${bad} is not`)
  me.close()
  expect(r.destroyed).toBe(true)
})

test('a renderer still being made when the client closes is destroyed as it arrives, and one that fails to be made then is let go', async () => {
  const me = render2d()
  me.mount(surface() as any)
  me.close()
  await new Promise(r => setTimeout(r))
  expect(renderers.at(-1)!.destroyed).toBe(true)
  const gone = render2d()
  failing.next = new Error('the canvas has no context')
  const count = renderers.length
  gone.mount(surface() as any)
  gone.close()
  await new Promise(r => setTimeout(r))
  expect(renderers).toHaveLength(count)
})
