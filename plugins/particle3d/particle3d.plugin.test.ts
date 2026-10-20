// The page's ledger of effects and their drawing. The test writes its own effects file and hands
// the plugin a page: a stand-in loader that hands over the file, and each sheet once the test says
// it has landed, decoded as the loader decodes one for three.js, and runs what waits on the file
// being written when the test writes it; a three.js scene, and a camera at z 10 looking down -z, so
// a quad's right is +x and its up is +y.
import { expect, onTestFinished, test, vi } from 'vitest'
import * as THREE from 'three'
import { uv } from '#plugins/loader/loader.plugin.ts'
import { frameOf, read, type Sheet } from '#plugins/loader/loader.sim.ts'
import { particle3d, type Effects } from './particle3d.plugin.ts'
import type { Entry } from './particle3d.sim.ts'

const DT = 1 / 60

const file: Effects = {
  ppm: 32,
  alphaTest: 0.5,
  cap: 50,
  effects: {
    rise: [{ life: [1, 1], dir: [0, 1, 0], spread: 0, speed: [1, 1] }],
    square: [{ life: [0.3, 0.3], grow: 30, tint: 0xff3300 }],
    puff: [{ sheet: 'puff', clip: 'all', life: [0.4, 0.4] }],
    late: [{ sheet: 'puff', clip: 'tail', life: [0.4, 0.4] }],
    spray: [{ n: [3, 5], life: [0.5, 0.9], speed: [1, 3], g: 9.8, drag: 0.5, spin: 2, jitter: [0.1, 0.1, 0.1], size: [0.5, 1.5] }],
    hose: [{ every: 0.05, life: [0.075, 0.075] }],
    blood: [{ life: [2, 2], dir: [0, 1, 0], spread: 0, speed: [2, 2], g: 38.3, origin: [0.5, 1] }],
    cool: [{ life: [1, 1], tint: 0xffffff, tint1: 0x000000, a0: 1, a1: 0 }, { life: [1, 1] }],
    pop: [{ life: [0.7, 0.7], a0: 1, a1: 0, fade: 0.25 }],
    streak: [{ life: [1, 1], dir: [1, 0, 0], spread: 0, speed: [4, 4], stretch: true, sheet: 'puff', clip: 'long' }],
    both: [{ effect: 'puff' }, { effect: 'square' }, { life: [1, 1], add: true }],
    lost: [{ spread: 0.3, life: [1, 1] }],
    ring: [{ effect: 'loop' }],
    loop: [{ effect: 'ring' }],
    many: [{ n: [80, 80], life: [1, 1] }],
    spark: [{ sheet: 'puff', clip: 'spark', life: [1, 1] }],
    flash: [{ life: [1, 1], tint: 0xff8000, gain: 26 }],
  },
}

// Two pages: four frames of 15 pixels across the first, 60 by 15, each standing on its middle; and
// one long frame filling the second, 64 by 8.
// An Aseprite JSON-Array: frames each whole on its page, `[id, x, y, w, h, anchor, ms?]`, and tags.
type Cell = [string, number, number, number, number, [number, number], number?]
const aseprite = (image: string, cells: Cell[], frameTags: object[], more: object = {}) => ({
  frames: cells.map(([filename, x, y, w, h, [ax, ay], duration]) => ({
    filename, frame: { x, y, w, h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h },
    pivot: { x: ax / w, y: ay / h }, ...(duration !== undefined && { duration }),
  })),
  meta: { app: 'test', image, frameTags, ...more },
})
// `cols` × `rows` cells of `w` × `h` from a page's top left, numbered from `from`.
const grid = (from: number, cols: number, rows: number, w: number, h: number, anchor: [number, number], ms?: number): Cell[] =>
  Array.from({ length: cols * rows }, (_, i) => [String(from + i), (i % cols) * w, Math.floor(i / cols) * h, w, h, anchor, ms])
const puffPacks: Record<string, object> = {
  '/puff.json': aseprite('puff.png', grid(0, 4, 1, 15, 15, [7.5, 7.5]), [{ name: 'all', from: 0, to: 3 }, { name: 'tail', from: 2, to: 3 }], { related_multi_packs: ['streak.json'] }),
  '/streak.json': aseprite('streak.png', [['long', 0, 0, 64, 8, [32, 4]]], [{ name: 'long', from: 0, to: 0 }]),
}
const puff = read(puffPacks['/puff.json'], '/puff.json', {}, u => puffPacks[u])

const page = (order = ['loader', 'particle3d', 'render3d'], sheetsLanded = true, data: Sheet = puff) => {
  const pages = [new THREE.Texture({ width: 60, height: 15 }), new THREE.Texture({ width: 64, height: 8 })]
  const decoded = {
    data,
    pages,
    uv: (id: string) => {
      const f = data.frames[id], { width, height } = pages[f.page].image
      return uv(f, width, height)
    },
    frameOf: (clip: string, run: number, i: number) => frameOf(data, clip, run, i),
  }
  const landed = new Set<string>(sheetsLanded ? ['puff'] : [])
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(0, 0, 10)
  const plugins: any = {
    wire: {
      scene: { plugins: order, world: { particle3d: { effects: 'effects', hold: 0.1 } }, prefabs: { engine: { dt: DT } } },
      rows: [] as any[],
    },
    render3d: { THREE, scene: new THREE.Scene(), camera },
    loader: {
      on: (name: string, f: (it: any) => void) => { if (name === 'effects') f(effects) },
      get: (name: string) => (landed.has(name) ? decoded : undefined),
      load: () => {},
      onWritten: (name: string, f: () => void) => { if (name === 'effects') heard.push(f) },
    },
  }
  // The effects file this page reads: the test's own, or a copy the test rewrites; and what the
  // loader runs when the editor writes it.
  let effects = file
  const heard: (() => void)[] = []
  const me = particle3d()
  return {
    plugins, me, pages, land: (name: string) => landed.add(name), frame: () => me.afterTick(plugins),
    own: () => (effects = structuredClone(file)),
    written: () => { for (const f of heard) f() },
  }
}

// Every quad drawn, read back out of the meshes' buffers: corners bottom-left, bottom-right,
// top-right, top-left.
const quads = (plugins: any) =>
  plugins.render3d.scene.children.filter((o: any) => o.isMesh).flatMap((mesh: any) => {
    const g = mesh.geometry
    const pos = g.attributes.position.array, uv = g.attributes.uv.array, col = g.attributes.color.array
    return Array.from({ length: g.drawRange.count / 6 }, (_, i) => {
      const [bl, br, tr, tl] = [0, 1, 2, 3].map(v => [0, 1, 2].map(k => pos[12 * i + 3 * v + k]))
      return {
        mesh, bl, br,
        centre: [0, 1, 2].map(k => (bl[k] + br[k] + tr[k] + tl[k]) / 4),
        w: Math.hypot(...[0, 1, 2].map(k => br[k] - bl[k])),
        h: Math.hypot(...[0, 1, 2].map(k => tl[k] - bl[k])),
        u: [uv[8 * i], uv[8 * i + 2]],
        v: [uv[8 * i + 1], uv[8 * i + 5]],
        colour: [...col.slice(16 * i, 16 * i + 4)],
      }
    })
  })

// The buffers are 32-bit floats, and their colours linear: a colour in the file is sRGB, as a
// three.js material's is.
const f32 = (a: number[]) => Array.from(new Float32Array(a))
const linear = (hex: number, a: number) => { const c = new THREE.Color().setHex(hex); return f32([c.r, c.g, c.b, a]) }

const entry = (id: number, effect: string, age: number, more: Partial<Entry> = {}): Entry => ({ id, effect, at: [0, 0, 0], age, life: 0, ...more })

// The point lights on the scene that are shown.
const shown = (plugins: any) => plugins.render3d.scene.children.filter((o: any) => o.isPointLight && o.visible) as THREE.PointLight[]

test('a lit layer\'s every particle carries a point light where it is drawn, of its colour, faded with it; a gone particle\'s light is hidden and taken by the next', () => {
  const { plugins, me, frame, own } = page(['loader', 'particle3d', 'lights3d', 'render3d'])
  const mine = own()
  mine.effects.glow = [{ n: [3, 3], life: [0.5, 0.5], dir: [0, 1, 0], spread: 0, speed: [2, 2], tint: 0xff8000, tint1: 0x0080ff, a0: 1, a1: 0, gain: 4, light: { intensity: 10, distance: 4, decay: 2 } }]
  mine.effects.dark = [{ n: [2, 2], life: [0.5, 0.5] }]
  me.emit('glow', [1, 2, 3], { scale: 2 })
  me.emit('dark', [0, 0, 0])
  frame()
  let lights = shown(plugins)
  expect(lights.length).toBe(3)
  for (const l of lights) {
    expect(l.position.toArray()).toEqual([1, 2, 3])
    expect(l.color.getHex()).toBe(0xff8000)
    expect([l.intensity, l.distance, l.decay, l.castShadow]).toEqual([10, 8, 2, false])
  }
  // a quarter of its life on: risen with its particle, cooling, fading
  for (let f = 0; f < 15; f++) frame()
  lights = shown(plugins)
  const [q] = quads(plugins).filter((x: any) => x.colour[3] < 1)
  for (const l of lights) {
    expect(l.position.toArray().map(v => +v.toFixed(5))).toEqual(q.centre.map((v: number) => +v.toFixed(5)))
    expect(l.intensity).toBeCloseTo(10 * q.colour[3], 5)
    expect(l.color.r).toBeCloseTo(q.colour[0] / 4, 5)
  }
  // gone with its particles, and the same lights taken by the next
  const made = plugins.render3d.scene.children.filter((o: any) => o.isPointLight)
  for (let f = 0; f < 30; f++) frame()
  expect(shown(plugins)).toEqual([])
  me.emit('glow', [0, 0, 0])
  frame()
  expect(shown(plugins).length).toBe(3)
  expect(plugins.render3d.scene.children.filter((o: any) => o.isPointLight)).toEqual(made)
  // closing takes them off the scene
  me.close(plugins)
  expect(plugins.render3d.scene.children.filter((o: any) => o.isPointLight)).toEqual([])
})

test('a lit layer in a scene without lights3d throws, naming the effect; a light of the wrong shape throws, naming the layer', () => {
  const bare = page()
  bare.own().effects.glow = [{ life: [1, 1], light: { intensity: 1, distance: 1, decay: 2 } }]
  expect(() => bare.frame()).toThrow('particle3d effect glow gives its particles light, and the scene does not list lights3d to draw them')
  const wrong = page(['loader', 'particle3d', 'lights3d', 'render3d'])
  wrong.own().effects.glow = [{ life: [1, 1], light: { intensity: 1, distance: -1, decay: 2 } }]
  expect(() => wrong.frame()).toThrow('particle3d effect glow layer 0 has a light of {"intensity":1,"distance":-1,"decay":2}, and particle3d reads { intensity, distance, decay }, each 0 or more')
})

test('an effect a page emits is drawn the frame it is asked for, at its point, and moves a step each frame after', () => {
  const { plugins, me, frame } = page()
  me.emit('rise', [1, 2, 3])
  frame()
  expect(quads(plugins).map((q: any) => q.centre)).toEqual([[1, 2, 3]])
  frame()
  const [q] = quads(plugins)
  expect(q.centre[1]).toBeCloseTo(2 + DT, 6)
  expect(q.centre[0]).toBeCloseTo(1, 6)
})

test('the ledger keeps an effect until its life is over and its last particle is gone', () => {
  const { plugins, me, frame } = page()
  const hose = me.emit('hose', [0, 0, 0], { life: 0.2 })
  let most = 0, gone = -1
  for (let f = 0; f < 60 && gone < 0; f++) {
    frame()
    most = Math.max(most, me.count)
    if (!me.effects.includes(hose)) gone = f
  }
  // Bursts at 0, 0.05, 0.1 and 0.15, each living 0.075, so two at most at once; the last lives
  // to 0.225.
  expect(most).toBe(2)
  expect(gone * DT).toBeGreaterThanOrEqual(0.225 - 1e-9)
  expect((gone - 1) * DT).toBeLessThan(0.225)
  expect(quads(plugins)).toEqual([])
})

test('a rule\'s entry is taken the frame the page first sees it, and every page draws the same particles, one that sees it late caught up', () => {
  const a = page(), b = page(), late = page()
  for (const p of [a, b]) p.plugins.wire.rows = [{ id: 1, kind: 'particle3d', data: { live: [entry(7, 'spray', 0)] } }]
  a.frame()
  b.frame()
  expect(quads(a.plugins).length).toBeGreaterThanOrEqual(3)
  expect(quads(a.plugins).map((q: any) => q.centre)).toEqual(quads(b.plugins).map((q: any) => q.centre))
  for (let f = 0; f < 6; f++) a.frame()
  late.plugins.wire.rows = [{ id: 1, kind: 'particle3d', data: { live: [entry(7, 'spray', 6 * DT)] } }]
  late.frame()
  const now = quads(a.plugins), caught = quads(late.plugins)
  expect(caught.length).toBe(now.length)
  caught.forEach((q: any, i: number) => q.centre.forEach((c: number, k: number) => expect(c).toBeCloseTo(now[i].centre[k], 9)))
})

test('the page follows a rule\'s entry while the row holds it; a page\'s own effect moves or stops when its at or life is written', () => {
  const { plugins, me, frame } = page()
  plugins.wire.rows = [{ id: 1, kind: 'particle3d', data: { live: [entry(3, 'hose', 0, { life: 1 })] } }]
  frame()
  plugins.wire.rows = [{ id: 1, kind: 'particle3d', data: { live: [entry(3, 'hose', DT, { life: 1, at: [5, 0, 0] })] } }]
  for (let f = 0; f < 4; f++) frame()
  // The burst at 0.05 was thrown from where the row had moved it.
  expect(quads(plugins).map((q: any) => q.centre[0])).toContain(5)
  const own = me.emit('hose', [0, 0, 0], { life: 10 })
  frame()
  own.at = [9, 9, 9]
  for (let f = 0; f < 3; f++) frame()
  // Its burst at 0.05 left from where it was moved to.
  expect(quads(plugins).map((q: any) => q.centre)).toContainEqual([9, 9, 9])
  own.life = own.age
  // Stopped: no burst after, and it leaves the ledger once its particles are gone.
  const left = me.count
  for (let f = 0; f < 3; f++) frame()
  expect(me.count).toBeLessThanOrEqual(left)
  for (let f = 0; f < 10; f++) frame()
  expect(me.effects.includes(own)).toBe(false)
})

test('a clip\'s frames play evenly over a particle\'s life, each its box / ppm metres cut from its page; nothing of it is drawn before its sheet lands', () => {
  const { plugins, me, frame, land, pages } = page(undefined, false)
  me.emit('puff', [0, 0, 0])
  me.emit('late', [0, 0, 0])
  frame()
  expect(quads(plugins)).toEqual([])
  land('puff')
  frame()
  const [puff, late] = quads(plugins)
  expect(puff.u).toEqual([0, 0.25])
  expect(puff.v).toEqual([0, 1])
  expect(late.u).toEqual([0.5, 0.75])
  expect(puff.w).toBeCloseTo(15 / 32, 6)
  // A quarter of its life on, the next frame.
  for (let f = 0; f < 6; f++) frame()
  expect(quads(plugins)[0].u).toEqual([0.25, 0.5])
  expect(quads(plugins)[0].mesh.material.map).toBe(pages[0])
})

test('a particle falls onto the floor its spawn gives and stays on it; origin [0.5, 1] stands it there', () => {
  const { plugins, me, frame } = page()
  me.emit('blood', [0, 1, 0], { floor: 0.25 })
  const ys: number[] = []
  for (let f = 0; f < 60; f++) {
    frame()
    ys.push(quads(plugins)[0].bl[1])
  }
  expect(Math.max(...ys)).toBeGreaterThan(1)
  expect(Math.min(...ys)).toBe(0.25)
  expect(ys.slice(-10)).toEqual(Array(10).fill(0.25))
  const [q] = quads(plugins)
  expect(q.centre[1]).toBeCloseTo(0.75, 6)
})

test('tint cools to tint1 and a0 fades to a1 over a life; the spawn\'s tint colours a layer that names none; scale and grow size the quad', () => {
  const { plugins, me, frame } = page()
  me.emit('cool', [0, 0, 0], { tint: 0x0000ff, scale: 2 })
  frame()
  expect(quads(plugins).map((q: any) => q.colour)).toEqual([linear(0xffffff, 1), linear(0x0000ff, 1)])
  for (let f = 0; f < 30; f++) frame()
  const [cooling] = quads(plugins)
  expect(cooling.colour[0]).toBeCloseTo(new THREE.Color().setHex(0x808080).r, 2)
  expect(cooling.colour[3]).toBeCloseTo(0.5, 6)
  expect(cooling.w).toBeCloseTo(2, 6)
  const grown = page()
  grown.me.emit('square', [0, 0, 0])
  for (let f = 0; f < 10; f++) grown.frame()
  // Growing from 1 at birth to 30 at death: a third of the way through its 0.3 s.
  expect(quads(grown.plugins)[0].w).toBeCloseTo(1 + 29 * ((9 * DT) / 0.3), 9)
  expect(quads(grown.plugins)[0].colour).toEqual(linear(0xff3300, 1))
})

test('gain times a particle\'s light past white; scale times every length of an effect, its sizes, speeds, jitter and g, and none of its times', () => {
  const { plugins, me, frame } = page()
  me.emit('flash', [0, 0, 0])
  frame()
  const [r, g, b, a] = linear(0xff8000, 1)
  expect(quads(plugins)[0].colour).toEqual([r * 26, g * 26, b * 26, a].map(v => expect.closeTo(v, 4)))
  const at = [1, 2, 3]
  const run = (scale?: number) => {
    const it = page()
    it.me.emit('spray', at, { seed: 7, scale })
    for (let f = 0; f < 20; f++) it.frame()
    return quads(it.plugins)
  }
  const one = run(), two = run(2)
  expect(two).toHaveLength(one.length)
  one.forEach((q: any, i: number) => {
    for (let k = 0; k < 3; k++) expect(two[i].centre[k] - at[k]).toBeCloseTo(2 * (q.centre[k] - at[k]), 4)
    expect(two[i].w).toBeCloseTo(2 * q.w, 5)
    expect(two[i].colour[3]).toBe(q.colour[3])
  })
})

test('with fade, a particle holds a0 until the last seconds of its life and fades to a1 over them', () => {
  const { plugins, me, frame } = page()
  me.emit('pop', [0, 0, 0])
  const alphas: number[] = []
  for (let f = 0; f < 42; f++) { frame(); alphas.push(quads(plugins)[0]?.colour[3]) }
  expect(alphas.slice(0, 27).every(a => a === 1)).toBe(true)
  expect(alphas[34]).toBeCloseTo(1 - (34 * DT - 0.45) / 0.25, 6)
})

test('stretch lays a particle along its way with its head on its point; a frame on a second page is its own mesh', () => {
  const { plugins, me, frame, pages } = page()
  me.emit('streak', [0, 0, 0])
  for (let f = 0; f < 5; f++) frame()
  const [q] = quads(plugins)
  const head = 4 * 4 * DT
  expect(q.br[0]).toBeCloseTo(head, 6)
  expect(q.bl[0]).toBeCloseTo(head - 64 / 32, 6)
  expect(q.mesh.material.map).toBe(pages[1])
  expect([q.u, q.v]).toEqual([[0, 1], [0, 1]])
})

test('effects are made of effects, one mesh for each page of a sheet and each blend; an effect made of itself throws', () => {
  const { plugins, me, frame } = page()
  me.emit('both', [0, 0, 0])
  frame()
  expect(quads(plugins)).toHaveLength(3)
  expect(plugins.render3d.scene.children).toHaveLength(3)
  expect(plugins.render3d.scene.children.map((m: any) => m.material.blending)).toContain(THREE.AdditiveBlending)
  const bad = page()
  bad.me.emit('ring', [0, 0, 0])
  expect(() => bad.frame()).toThrow('particle3d effect ring is made of itself: ring > loop > ring')
})

test('past cap, new particles are dropped', () => {
  const { me, frame } = page()
  me.emit('many', [0, 0, 0])
  frame()
  expect(me.count).toBe(file.cap)
})

test('listed after render3d it throws, as it does for an effect the file has not got and a spread with no dir', () => {
  const late = page(['loader', 'render3d', 'particle3d'])
  expect(() => late.frame()).toThrow('particle3d is listed after render3d, which would draw every particle before it is turned')
  const missing = page()
  missing.me.emit('fog', [0, 0, 0])
  expect(() => missing.frame()).toThrow('particle3d has no effect fog')
  const lost = page()
  lost.me.emit('lost', [0, 0, 0])
  expect(() => lost.frame()).toThrow('a particle3d layer of lost has a spread and no dir, and neither has its spawn')
  const clipless = page()
  file.effects.odd = [{ sheet: 'puff', clip: 'none', life: [1, 1] }]
  clipless.me.emit('odd', [0, 0, 0])
  expect(() => clipless.frame()).toThrow('particle3d draws clip none of puff, which it does not have')
  delete file.effects.odd
})

test('close frees every mesh', () => {
  const { plugins, me, frame } = page()
  me.emit('both', [0, 0, 0])
  frame()
  const freed = plugins.render3d.scene.children.map((m: any) => vi.spyOn(m.geometry, 'dispose'))
  me.close(plugins)
  expect(plugins.render3d.scene.children).toEqual([])
  for (const f of freed) expect(f).toHaveBeenCalledOnce()
  expect(me.effects).toEqual([])
})

test('the effects file written: a running effect draws with its layers\' new numbers, a layer new to it fires what it would have by now, and each mesh takes the new alphaTest', () => {
  const { plugins, me, frame, own, written } = page()
  const mine = own()
  const fx = me.emit('cool', [0, 0, 0], { life: 1 })
  frame()
  const [mesh] = plugins.render3d.scene.children
  const before = mesh.material, disposed = vi.spyOn(before, 'dispose')
  expect(quads(plugins).map((q: any) => q.colour)).toEqual([linear(0xffffff, 1), linear(0xffffff, 1)])
  // As the loader refills the file in place: the first layer now starts black and never fades, and
  // the effect has a third layer.
  Object.assign(mine, structuredClone({ ...file, alphaTest: 0.25, effects: { ...file.effects, cool: [{ life: [1, 1], tint: 0x000000, a0: 1, a1: 1 }, { life: [1, 1] }, { life: [1, 1], tint: 0x00ff00 }] } }))
  written()
  frame()
  expect(me.effects).toContain(fx)
  expect(quads(plugins).map((q: any) => q.colour)).toEqual([linear(0x000000, 1), linear(0xffffff, 1), linear(0x00ff00, 1)])
  expect(mesh.material).not.toBe(before)
  expect(disposed).toHaveBeenCalledOnce()
  expect(mesh.material.alphaTest).toBe(0.25)
  // Nothing written since: nothing is made again.
  const now = mesh.material
  frame()
  expect(mesh.material).toBe(now)
})

test('a sheet written, its pages swapped by the loader, is drawn from its new page on the next frame', () => {
  const { plugins, me, frame, pages } = page()
  me.emit('puff', [0, 0, 0])
  frame()
  const [mesh] = plugins.render3d.scene.children
  expect(mesh.material.map).toBe(pages[0])
  const page0 = new THREE.Texture({ width: 60, height: 15 })
  pages.splice(0, 1, page0)
  frame()
  expect(mesh.material.map).toBe(page0)
})

test('a trimmed frame\'s quad spans the pixels its sheet kept, where they were in the whole frame', () => {
  // A spark 32 pixels square, of which the middle 16 are kept; its pivot its middle.
  const sparks = read({
    frames: { spark: { frame: { x: 0, y: 0, w: 16, h: 16 }, rotated: false, trimmed: true, spriteSourceSize: { x: 8, y: 8, w: 16, h: 16 }, sourceSize: { w: 32, h: 32 }, pivot: { x: 0.5, y: 0.5 } } },
    animations: { spark: ['spark'] },
    meta: { image: 'spark.png' },
  }, '/spark.json')
  const { plugins, me, frame } = page(undefined, true, sparks)
  me.emit('spark', [1, 2, 3])
  frame()
  const [q] = quads(plugins)
  expect([q.w, q.h]).toEqual([0.5, 0.5])
  expect(q.centre.map((v: number) => +v.toFixed(6))).toEqual([1, 2, 3])
  expect([q.u, q.v]).toEqual([[0, 16 / 60], [1 - 16 / 15, 1]].map(f32))
})

// Four frames 16 pixels square across a page 64 by 16, each standing on the middle of its bottom
// edge and showing for 50 ms: `timed` plays the first three once, `turning` all four round again.
const clock = read({
  frames: Object.fromEntries([0, 1, 2, 3].map(i => [`c ${i}`, {
    frame: { x: 16 * i, y: 0, w: 16, h: 16 }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
    sourceSize: { w: 16, h: 16 }, pivot: { x: 0.5, y: 1 }, duration: 50,
  }])),
  meta: { image: 'clock.png', frameTags: [{ name: 'timed', from: 0, to: 2, direction: 'forward', repeat: '1' }, { name: 'turning', from: 0, to: 3, direction: 'forward' }] },
}, '/clock.json')

// Effects the tests below add to the file, and take away after.
const more: Effects['effects'] = {
  timed: [{ sheet: 'puff', clip: 'timed', play: true, life: [1, 1] }],
  boxed: [{ n: [20, 20], life: [1, 1], box: [2, -4, 1, 6, -1, 3] }],
  pinned: [{ life: [1, 1], box: [3, 5, 7, 3, 5, 7] }],
  later: [{ after: 0.1, life: [0.2, 0.2] }],
  steps: [{ life: [1, 1], dir: [0, 1, 0], spread: 0, speed: [6, 6], pace: [[0.1, 0.5], [0.2, 0]] }],
  tracking: [{ life: [1, 1], follow: true }, { life: [1, 1] }],
  flipping: [{ sheet: 'puff', clip: 'turning', life: [1, 1], flips: [[0.05, 1, 0], [0.1, 1, 1], [0.15, 0, 0]] }],
  pair: [{ effect: 'pinned', at: [10, 0, 0] }, { effect: 'rise', at: [0, 7, 0] }],
  ray: [{ life: [1, 1], size: [0.5, 0.5], beam: true }],
  body: [{ lasts: true, follow: true }],
  tick: [{ life: [0.05, 0.05] }],
}
const adding = () => {
  Object.assign(file.effects, more)
  onTestFinished(() => { for (const k of Object.keys(more)) delete file.effects[k] })
}

test('with play, a clip\'s frames show for the sheet\'s own times from a particle\'s birth, and one that does not loop holds its last', () => {
  adding()
  const { plugins, me, frame } = page(undefined, true, clock)
  me.emit('timed', [0, 0, 0])
  // 20 frames a second: each frame of the clip shows for three steps of the page.
  const us: number[] = []
  for (let f = 0; f < 12; f++) { frame(); us.push(Math.round(quads(plugins)[0].u[0] * 4)) }
  expect(us).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2])
})

test('box starts each particle at a point rolled evenly in it, off the effect\'s point; one whose corners are a point starts every particle there', () => {
  adding()
  const { plugins, me, frame } = page()
  me.emit('boxed', [10, 20, 30])
  frame()
  const cs = quads(plugins).map((q: any) => q.centre)
  expect(cs).toHaveLength(20)
  for (const [k, lo, hi] of [[0, 12, 16], [1, 16, 19], [2, 31, 33]]) {
    expect(Math.min(...cs.map((c: number[]) => c[k]))).toBeGreaterThanOrEqual(lo - 1e-5)
    expect(Math.max(...cs.map((c: number[]) => c[k]))).toBeLessThanOrEqual(hi + 1e-5)
  }
  expect(new Set(cs.map((c: number[]) => c[0])).size).toBeGreaterThan(10)
  const pinned = page()
  pinned.me.emit('pinned', [10, 20, 30])
  pinned.frame()
  expect(quads(pinned.plugins).map((q: any) => q.centre.map((v: number) => +v.toFixed(4)))).toEqual([[13, 25, 37]])
})

test('after holds a layer\'s first burst that many seconds into the effect, and the page keeps the effect until it is thrown and gone, a rule\'s entry of no life too', () => {
  adding()
  const { plugins, frame } = page()
  plugins.wire.rows = [{ id: 1, kind: 'particle3d', data: { live: [entry(4, 'later', 0)] } }]
  const counts: number[] = []
  for (let f = 0; f < 24; f++) {
    frame()
    if (f === 1) plugins.wire.rows = []
    counts.push(quads(plugins).length)
  }
  // Thrown on the step the effect is 0.1 old, and living 0.2 from then.
  expect(counts.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0])
  expect(counts.slice(6, 18)).toEqual(Array(12).fill(1))
  expect(counts.slice(18)).toEqual(Array(6).fill(0))
})

test('pace moves a particle that many times as far a step as its speed says from each of its seconds on, so it slows and stops', () => {
  adding()
  const { plugins, me, frame } = page()
  me.emit('steps', [0, 0, 0])
  const ys: number[] = []
  for (let f = 0; f < 20; f++) { frame(); ys.push(quads(plugins)[0].centre[1]) }
  // A tenth of a metre a step for its first 0.1 seconds, half of that for the next 0.1, and none after.
  expect(ys[6]).toBeCloseTo(0.6, 5)
  expect(ys[12]).toBeCloseTo(0.9, 5)
  expect(ys[19]).toBeCloseTo(0.9, 5)
})

test('a particle that follows keeps its place about its effect\'s point as the point moves; one that does not stays where it was thrown', () => {
  adding()
  const { plugins, me, frame } = page()
  const fx = me.emit('tracking', [10, 20, 30])
  frame()
  fx.at = [15, 27, 31]
  frame()
  expect(quads(plugins).map((q: any) => q.centre.map((v: number) => +v.toFixed(4)))).toEqual([[15, 27, 31], [10, 20, 30]])
})

test('flips mirror a particle across and upside down in its frame\'s own place from their seconds on, and neither before the first', () => {
  adding()
  const { plugins, me, frame } = page(undefined, true, clock)
  me.emit('flipping', [0, 0, 0])
  const seen: { bl: number[]; u: number[]; v: number[] }[] = []
  for (let f = 0; f < 12; f++) {
    frame()
    const [q] = quads(plugins)
    seen.push({ bl: q.bl.map((v: number) => +v.toFixed(5) + 0), u: q.u, v: q.v })
  }
  // The quad never moves: the frame stands on its bottom middle, half a metre square at 32 a metre.
  for (const s of seen) expect(s.bl).toEqual([-0.25, 0, 0])
  const [u0, u1] = seen[0].u, [v0, v1] = seen[0].v
  expect([seen[3].u, seen[3].v]).toEqual([[u1, u0], [v0, v1]])
  expect([seen[6].u, seen[6].v]).toEqual([[u1, u0], [v1, v0]])
  expect([seen[9].u, seen[9].v]).toEqual([[u0, u1], [v0, v1]])
})

test('effects are thrown from their { effect, at } offset off the point', () => {
  adding()
  const { plugins, me, frame } = page()
  me.emit('pair', [100, 50, 0])
  frame()
  // pinned's box moved 10 across; rise, which has none, thrown from 7 up.
  expect(quads(plugins).map((q: any) => q.centre.map((v: number) => +v.toFixed(4)))).toEqual([[113, 55, 7], [100, 57, 0]])
})

test('a beam is drawn from the effect\'s point to its to, as long as the gap, as thick as its size, and turned about its length to face the camera', () => {
  adding()
  const { plugins, me, frame } = page()
  const fx = me.emit('ray', [1, 2, 3], { to: [4, 6, 3], seed: 1 })
  frame()
  const [q] = quads(plugins)
  expect(q.w).toBeCloseTo(5, 5)
  expect(q.h).toBeCloseTo(0.5, 5)
  expect(q.centre.map((v: number) => +v.toFixed(4))).toEqual([2.5, 4, 3])
  // the camera looks down -z, so the beam lies flat in z
  expect(q.bl[2]).toBeCloseTo(3, 5)
  expect(q.br[2]).toBeCloseTo(3, 5)
  fx.to = [1, 2, 13]
  frame()
  expect(quads(plugins)[0].w).toBeCloseTo(10, 5)
  expect(() => { me.emit('ray', [0, 0, 0], { seed: 2 }); frame() }).toThrow('particle3d effect ray has a beam and was spawned with no to')
})

test('a page\'s own effect given a seed rolls the same particles on every page, and another seed rolls others', () => {
  const a = page(), b = page(), c = page()
  a.me.emit('spray', [0, 0, 0], { seed: 41 })
  b.me.emit('spray', [0, 0, 0], { seed: 41 })
  c.me.emit('spray', [0, 0, 0], { seed: 42 })
  for (let f = 0; f < 5; f++) { a.frame(); b.frame(); c.frame() }
  expect(quads(a.plugins).length).toBeGreaterThan(0)
  expect(quads(a.plugins).map((q: any) => q.centre)).toEqual(quads(b.plugins).map((q: any) => q.centre))
  expect(quads(a.plugins).map((q: any) => q.centre)).not.toEqual(quads(c.plugins).map((q: any) => q.centre))
})

const thing = (id: number, pos: number[]) => ({ id, kind: 'thing', data: { pos } })
const centres = (plugins: any) => quads(plugins).map((q: any) => q.centre.map((v: number) => +v.toFixed(4) + 0))

test('an effect from a row goes on whatever its life, its point that row\'s pos, and its life is over the frame the page\'s rows no longer hold it', () => {
  const { plugins, me, frame } = page()
  const row = thing(5, [1, 2, 3])
  plugins.wire.rows = [row]
  const fx = me.emit('hose', [0, 0, 0], { from: 5 })
  frame()
  expect([fx.at, fx.life]).toEqual([[1, 2, 3], Infinity])
  row.data.pos = [4, 2, 3]
  for (let f = 0; f < 30; f++) frame()
  // still bursting half a second on, from where the row is now
  expect(centres(plugins)).toContainEqual([4, 2, 3])
  plugins.wire.rows = []
  frame()
  expect(fx.life).toBe(fx.age)
  for (let f = 0; f < 10; f++) frame()
  expect(me.effects.includes(fx)).toBe(false)
  // from a row the page has not got: gone at once, having thrown nothing
  const none = me.emit('hose', [0, 0, 0], { from: 6 })
  frame()
  expect(me.effects.includes(none)).toBe(false)
  expect(quads(plugins)).toEqual([])
})

test('a rule\'s entry from a row goes on while the ledger row holds it and the page\'s rows hold the row, and ends when the entry leaves', () => {
  const { plugins, me, frame } = page()
  const ledger = (live: Entry[]) => ({ id: 1, kind: 'particle3d', data: { live } })
  plugins.wire.rows = [ledger([entry(3, 'hose', 0, { from: 5 })]), thing(5, [7, 7, 7])]
  for (let f = 0; f < 30; f++) frame()
  const [fx] = me.effects
  expect([fx.at, fx.life]).toEqual([[7, 7, 7], Infinity])
  plugins.wire.rows = [ledger([]), thing(5, [7, 7, 7])]
  frame()
  expect(fx.life).toBe(fx.age)
})

test('an effect that flies is carried from its point to its to at fly, its life the time that takes, and lands its effects there that frame', () => {
  adding()
  const a = page(), b = page()
  const fly = (p: ReturnType<typeof page>) => p.me.emit('body', [0, 0, 0], { to: [0, 0, -6], fly: 60, seed: 3, land: [{ effect: 'pinned' }, { effect: 'rise', seed: 9 }] })
  const round = fly(a)
  fly(b)
  expect(round.life).toBeCloseTo(0.1, 12)
  const zs: number[] = []
  for (let f = 0; f < 6; f++) {
    a.frame()
    b.frame()
    // the body lasts as long as the flight, on the point as it is carried
    expect(quads(a.plugins)).toHaveLength(1)
    zs.push(quads(a.plugins)[0].centre[2])
  }
  zs.forEach((z, f) => expect(z).toBeCloseTo(-f, 5))
  a.frame()
  b.frame()
  // there: the body gone, pinned at the to off its box, rise thrown at the to
  expect(landed(a).map(e => [e.name, e.at, e.age])).toEqual([['pinned', [0, 0, -6], 0], ['rise', [0, 0, -6], 0]])
  expect(centres(a.plugins)).toEqual([[3, 5, 1], [0, 0, -6]])
  // a landing with no seed of its own rolls from the flight's, the same on every page
  expect(centres(a.plugins)).toEqual(centres(b.plugins))
  a.frame()
  expect(landed(a).map(e => e.age)).toEqual([DT, DT])
})
const landed = (p: ReturnType<typeof page>) => p.me.effects.filter(e => e.name !== 'body')

test('a field the file, a layer or world.particle3d has that particle3d does not know throws, naming it, as does a point of the wrong count and a layer with both or neither of life and lasts', () => {
  const cases: [(f: any, own: any) => void, string][] = [
    [f => { f.layer = 'effects' }, 'particle3d\'s effects file has layer, which particle3d does not know'],
    [f => { f.effects.rise[0].colour = 1 }, 'particle3d effect rise layer 0 has colour, which particle3d does not know'],
    [f => { f.effects.both[0].scale = 2 }, 'particle3d effect both layer 0 has scale, which particle3d does not know'],
    [f => { f.effects.rise[0].dir = [0, 1] }, 'particle3d effect rise layer 0 has a dir of [0,1], and particle3d reads 3 numbers'],
    [f => { f.effects.both[0].at = [1, 2] }, 'particle3d effect both layer 0 has a at of [1,2], and particle3d reads 3 numbers'],
    [f => { f.effects.rise[0].box = [0, 0, 1, 1] }, 'particle3d effect rise layer 0 has a box of [0,0,1,1], and particle3d reads 6 numbers'],
    [f => { f.effects.rise[0].lasts = true }, 'particle3d effect rise layer 0 has a life and lasts, and it has one or the other'],
    [f => { delete f.effects.rise[0].life }, 'particle3d effect rise layer 0 has no life and does not last, and it has one or the other'],
    [(_, own) => { own.effect = 'effects' }, 'world.particle3d has effect, which particle3d does not know'],
  ]
  for (const [spoil, message] of cases) {
    const p = page()
    spoil(p.own(), p.plugins.wire.scene.world.particle3d)
    expect(() => p.frame()).toThrow(message)
  }
  // Written by the editor, the file is checked again.
  const p = page()
  const mine = p.own()
  p.frame()
  ;(mine.effects.rise[0] as any).sped = [1, 1]
  p.written()
  expect(() => p.frame()).toThrow('particle3d effect rise layer 0 has sped, which particle3d does not know')
})

