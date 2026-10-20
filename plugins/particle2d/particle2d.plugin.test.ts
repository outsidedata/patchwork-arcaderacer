// The page's ledger of effects and their drawing in render2d's world. The test writes its own
// effects file and hands the plugin a page: render2d with a world whose points are the stage's, or
// an isometric one, and a stand-in loader that hands over the file, and each sheet once the test
// says it has landed, cut the way the loader cuts one, and runs what waits on the file being written
// when the test writes it. The stage's y grows down.
import { expect, onTestFinished, test } from 'vitest'
import * as PIXI from 'pixi.js'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { frameOf, read } from '#plugins/loader/loader.sim.ts'
import { particle2d, type Effects } from './particle2d.plugin.ts'
import type { Entry } from './particle2d.sim.ts'

const DT = 1 / 60

const file: Effects = {
  ppm: 0.5,
  cap: 50,
  layer: 'effects',
  effects: {
    rise: [{ life: [1, 1], dir: [0, -1], spread: 0, speed: [60, 60] }],
    square: [{ life: [0.3, 0.3], grow: 30, tint: 0xff3300 }],
    puff: [{ sheet: 'puff', clip: 'all', life: [0.4, 0.4] }],
    late: [{ sheet: 'puff', clip: 'tail', life: [0.4, 0.4] }],
    spray: [{ n: [3, 5], life: [0.5, 0.9], speed: [60, 180], g: 600, drag: 0.5, spin: 2, jitter: [6, 6], size: [5, 15] }],
    hose: [{ every: 0.05, life: [0.075, 0.075] }],
    drop: [{ life: [2, 2], dir: [0, -1], spread: 0, speed: [120, 120], g: 2400, origin: [0.5, 1] }],
    cool: [{ life: [1, 1], tint: 0xffffff, tint1: 0x000000, a0: 1, a1: 0 }, { life: [1, 1] }],
    pop: [{ life: [0.7, 0.7], a0: 1, a1: 0, fade: 0.25 }],
    streak: [{ life: [1, 1], dir: [1, 1], spread: 0, speed: [240, 240], stretch: true }],
    pointer: [{ life: [1, 1], face: true }],
    ray: [{ life: [1, 1], size: [3, 3], beam: true }],
    both: [{ effect: 'puff' }, { effect: 'square' }, { life: [1, 1], add: true }],
    lost: [{ spread: 0.3, life: [1, 1] }],
    ring: [{ effect: 'loop' }],
    loop: [{ effect: 'ring' }],
    many: [{ n: [80, 80], life: [1, 1] }],
    spark: [{ sheet: 'sparks', clip: 'spark', life: [1, 1] }],
    timed: [{ sheet: 'puff', clip: 'timed', play: true, life: [1, 1] }],
    boxed: [{ n: [20, 20], life: [1, 1], box: [2, -4, 6, -1] }],
    pinned: [{ life: [1, 1], box: [3, 5, 3, 5] }],
    flash: [{ life: [1, 1], tint: 0x804020, gain: 3 }],
    later: [{ after: 0.1, life: [0.2, 0.2] }],
    steps: [{ life: [1, 1], dir: [0, -1], spread: 0, speed: [60, 60], pace: [[0.1, 0.5], [0.2, 0]] }],
    tracking: [{ life: [1, 1], follow: true }, { life: [1, 1] }],
    flipping: [{ sheet: 'puff', clip: 'all', life: [1, 1], flips: [[0.05, 1, 0], [0.1, 1, 1], [0.15, 0, 0]] }],
    pair: [{ effect: 'pinned', at: [10, 0] }, { effect: 'rise', at: [0, -7] }],
  },
}

// Four frames of 15 pixels, each standing on the middle of its bottom edge.
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
// The first three again, timed at 50 ms each and held on the last: `timed`.
const puff = read(aseprite('puff.png', [...grid(0, 4, 1, 15, 15, [7.5, 15]), ...grid(0, 3, 1, 15, 15, [7.5, 15], 50).map(([id, ...rest]): Cell => [`timed/${id}`, ...rest])], [
  { name: 'all', from: 0, to: 3 }, { name: 'tail', from: 2, to: 3 }, { name: 'timed', from: 4, to: 6, repeat: '1' },
]), '/puff.json', { nearest: true })
const source = new PIXI.TextureSource({ width: 60, height: 15 })
const decoded = {
  data: puff,
  texture: (id: string) => {
    const [x, y, w, h] = puff.frames[id].box
    return new PIXI.Texture({ source, frame: new PIXI.Rectangle(x, y, w, h) })
  },
  frameOf: (clip: string, run: number, i: number) => frameOf(puff, clip, run, i),
}

const flat = { ground: [[1, 0], [0, 1]], up: [0, -1], zoom: 1, look: [0, 0], layers: ['things', 'effects'] }

const page = (order = ['loader', 'particle2d', 'render2d'], sheetsLanded = true, world: any = flat) => {
  const landed = new Set<string>(sheetsLanded ? ['puff'] : [])
  const plugins: any = {
    wire: {
      scene: { plugins: order, world: { particle2d: { effects: 'effects', hold: 0.1 }, render2d: world }, prefabs: { engine: { dt: DT, width: 400, height: 300 } } },
      rows: [] as any[],
    },
    render2d: render2d(),
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
  plugins.render2d.tick(plugins)
  const me = particle2d()
  return {
    plugins, me, land: (name: string) => landed.add(name), frame: () => me.afterTick(plugins),
    own: () => (effects = structuredClone(file)),
    written: () => { for (const f of heard) f() },
  }
}

const layer = (plugins: any) => plugins.render2d.layer('effects')
// Every particle drawn: the sprites of the normal container, then of the adding one.
const sprites = (plugins: any): any[] => layer(plugins).children.flatMap((c: any) => c.children)
const at = (s: any) => [s.position.x, s.position.y]
const entry = (id: number, effect: string, age: number, more: Partial<Entry> = {}): Entry => ({ id, effect, at: [0, 0], age, life: 0, ...more })

test('an effect is thrown from where render2d draws its world point, and moves a step each frame after', () => {
  const { plugins, me, frame } = page()
  me.emit('rise', [10, 20])
  frame()
  expect(sprites(plugins).map(at)).toEqual([[10, 20]])
  frame()
  const [s] = sprites(plugins)
  expect(s.position.x).toBeCloseTo(10, 9)
  expect(s.position.y).toBeCloseTo(20 - 60 * DT, 9)
  const iso = page(undefined, true, { ...flat, ground: [[32, 16], [-32, 16]], up: [0, -32] })
  iso.me.emit('rise', [2, 1, 0.5])
  iso.frame()
  expect(sprites(iso.plugins).map(at)).toEqual([[32, 48 - 16]])
})

test('the ledger keeps an effect until its life is over and its last particle is gone, and its sprites go back to the pool', () => {
  const { plugins, me, frame } = page()
  const hose = me.emit('hose', [0, 0], { life: 0.2 })
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
  expect(sprites(plugins)).toEqual([])
})

test('a rule\'s entry is taken the frame the page first sees it, and every page draws the same particles, one that sees it late caught up', () => {
  const a = page(), b = page(), late = page()
  for (const p of [a, b]) p.plugins.wire.rows = [{ id: 1, kind: 'particle2d', data: { live: [entry(7, 'spray', 0)] } }]
  a.frame()
  b.frame()
  expect(sprites(a.plugins).length).toBeGreaterThanOrEqual(3)
  expect(sprites(a.plugins).map(at)).toEqual(sprites(b.plugins).map(at))
  for (let f = 0; f < 6; f++) a.frame()
  late.plugins.wire.rows = [{ id: 1, kind: 'particle2d', data: { live: [entry(7, 'spray', 6 * DT)] } }]
  late.frame()
  const now = sprites(a.plugins), caught = sprites(late.plugins)
  expect(caught.length).toBe(now.length)
  caught.forEach((s: any, i: number) => {
    expect(s.position.x).toBeCloseTo(now[i].position.x, 9)
    expect(s.position.y).toBeCloseTo(now[i].position.y, 9)
    expect(s.rotation).toBeCloseTo(now[i].rotation, 9)
  })
})

test('a page\'s own effect given a seed rolls the same particles on every page, and another seed rolls others', () => {
  const a = page(), b = page(), c = page()
  a.me.emit('spray', [0, 0], { seed: 41 })
  b.me.emit('spray', [0, 0], { seed: 41 })
  c.me.emit('spray', [0, 0], { seed: 42 })
  for (let f = 0; f < 5; f++) { a.frame(); b.frame(); c.frame() }
  expect(sprites(a.plugins).length).toBeGreaterThan(0)
  expect(sprites(a.plugins).map(at)).toEqual(sprites(b.plugins).map(at))
  expect(sprites(a.plugins).map(at)).not.toEqual(sprites(c.plugins).map(at))
})

test('a beam is drawn from the effect\'s point to its to, as long as the gap and turned along it, and follows the effect as it moves', () => {
  const { plugins, me, frame } = page()
  const fx = me.emit('ray', [10, 20], { to: [40, 60], seed: 1 })
  frame()
  const [s] = sprites(plugins)
  expect(at(s)).toEqual([10, 20])
  expect(s.width).toBeCloseTo(50)
  expect(s.height).toBeCloseTo(3)
  expect(s.rotation).toBeCloseTo(Math.atan2(40, 30))
  fx.to = [10, 80]
  frame()
  expect(s.width).toBeCloseTo(60)
  expect(s.rotation).toBeCloseTo(Math.PI / 2)
  expect(() => { me.emit('ray', [0, 0], { seed: 2 }); frame() }).toThrow(/no to/)
})

test('the page follows a rule\'s entry while the row holds it; a page\'s own effect moves or stops when its at or life is written', () => {
  const { plugins, me, frame } = page()
  plugins.wire.rows = [{ id: 1, kind: 'particle2d', data: { live: [entry(3, 'hose', 0, { life: 1 })] } }]
  frame()
  plugins.wire.rows = [{ id: 1, kind: 'particle2d', data: { live: [entry(3, 'hose', DT, { life: 1, at: [5, 0] })] } }]
  for (let f = 0; f < 4; f++) frame()
  // The burst at 0.05 was thrown from where the row had moved it.
  expect(sprites(plugins).map(at)).toContainEqual([5, 0])
  const own = me.emit('hose', [0, 0], { life: 10 })
  frame()
  own.at = [9, 9]
  for (let f = 0; f < 3; f++) frame()
  expect(sprites(plugins).map(at)).toContainEqual([9, 9])
  own.life = own.age
  // Stopped: no burst after, and it leaves the ledger once its particles are gone.
  const left = me.count
  for (let f = 0; f < 3; f++) frame()
  expect(me.count).toBeLessThanOrEqual(left)
  for (let f = 0; f < 10; f++) frame()
  expect(me.effects.includes(own)).toBe(false)
})

test('a clip\'s frames play evenly over a particle\'s life, each its box / ppm pixels, standing on its anchor; nothing of it is drawn before its sheet lands', () => {
  const { plugins, me, frame, land } = page(undefined, false)
  me.emit('puff', [0, 0])
  me.emit('late', [0, 0])
  frame()
  expect(sprites(plugins)).toEqual([])
  land('puff')
  frame()
  const [first, late] = sprites(plugins)
  expect(first.texture.frame.x).toBe(0)
  expect(late.texture.frame.x).toBe(30)
  expect([first.width, first.height]).toEqual([30, 30])
  expect([first.anchor.x, first.anchor.y]).toEqual([0.5, 1])
  // A quarter of its life on, the next frame.
  for (let f = 0; f < 6; f++) frame()
  expect(sprites(plugins)[0].texture.frame.x).toBe(15)
})

test('with play, a clip\'s frames show for the sheet\'s own times from a particle\'s birth, and one that does not loop holds its last', () => {
  const { plugins, me, frame } = page()
  me.emit('timed', [0, 0])
  // 20 frames a second: each frame of the clip shows for three steps of the page.
  const xs: number[] = []
  for (let f = 0; f < 12; f++) { frame(); xs.push(sprites(plugins)[0].texture.frame.x) }
  expect(xs).toEqual([0, 0, 0, 15, 15, 15, 30, 30, 30, 30, 30, 30])
})

test('box starts each particle at a point rolled evenly in it, off the effect\'s point; one whose corners are a point starts every particle there', () => {
  const { plugins, me, frame } = page()
  me.emit('boxed', [10, 20])
  frame()
  const xs = sprites(plugins).map((s: any) => s.position.x), ys = sprites(plugins).map((s: any) => s.position.y)
  expect(xs).toHaveLength(20)
  expect(Math.min(...xs)).toBeGreaterThanOrEqual(12)
  expect(Math.max(...xs)).toBeLessThanOrEqual(16)
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(16)
  expect(Math.max(...ys)).toBeLessThanOrEqual(19)
  expect(new Set(xs).size).toBeGreaterThan(10)
  const pinned = page()
  pinned.me.emit('pinned', [10, 20])
  pinned.frame()
  expect(sprites(pinned.plugins).map(at)).toEqual([[13, 25]])
})

test('after holds a layer\'s first burst that many seconds into the effect, and the page keeps the effect until it is thrown and gone, a rule\'s entry of no life too', () => {
  const { plugins, frame } = page()
  plugins.wire.rows = [{ id: 1, kind: 'particle2d', data: { live: [entry(4, 'later', 0)] } }]
  const counts: number[] = []
  for (let f = 0; f < 24; f++) {
    frame()
    if (f === 1) plugins.wire.rows = []
    counts.push(sprites(plugins).length)
  }
  // Thrown on the step the effect is 0.1 old, and living 0.2 from then.
  expect(counts.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0])
  expect(counts.slice(6, 18)).toEqual(Array(12).fill(1))
  expect(counts.slice(18)).toEqual(Array(6).fill(0))
})

test('pace moves a particle that many times as far a step as its speed says from each of its seconds on, so it slows and stops', () => {
  const { plugins, me, frame } = page()
  me.emit('steps', [0, 0])
  const ys: number[] = []
  for (let f = 0; f < 20; f++) { frame(); ys.push(sprites(plugins)[0].position.y) }
  // A pixel a step for its first 0.1 seconds, half of one for the next 0.1, and none after.
  expect(ys[6]).toBeCloseTo(-6, 9)
  expect(ys[12]).toBeCloseTo(-9, 9)
  expect(ys[19]).toBeCloseTo(-9, 9)
})

test('a particle that follows keeps its place about its effect\'s point as the point moves; one that does not stays where it was thrown', () => {
  const { plugins, me, frame } = page()
  const fx = me.emit('tracking', [10, 20])
  frame()
  fx.at = [15, 27]
  frame()
  expect(sprites(plugins).map(at)).toEqual([[15, 27], [10, 20]])
})

test('flips mirror a particle across and upside down in its frame\'s own place from their seconds on, and neither before the first', () => {
  const { plugins, me, frame } = page()
  me.emit('flipping', [0, 0])
  // the puff's frames stand on the middle of their bottom edge: flipped, on the middle of the top
  const seen: number[][] = []
  for (let f = 0; f < 12; f++) {
    frame()
    const [s] = sprites(plugins)
    seen.push([Math.sign(s.scale.x), Math.sign(s.scale.y), s.anchor.x, s.anchor.y])
  }
  expect(seen[0]).toEqual([1, 1, 0.5, 1])
  expect(seen[3]).toEqual([-1, 1, 0.5, 1])
  expect(seen[6]).toEqual([-1, -1, 0.5, 0])
  expect(seen[9]).toEqual([1, 1, 0.5, 1])
  expect(Math.abs(sprites(plugins)[0].width)).toBe(30)
})

test('a particle falls down the stage onto the ground under its effect, or `floor` above it, and stays there', () => {
  const { plugins, me, frame } = page()
  // Thrown from 10 above the ground at y 110: it comes to rest on the ground.
  me.emit('drop', [0, 110, 10], { floor: 0 })
  const ys: number[] = []
  for (let f = 0; f < 60; f++) {
    frame()
    ys.push(sprites(plugins)[0].position.y)
  }
  expect(Math.min(...ys)).toBeLessThan(100)
  expect(Math.max(...ys)).toBe(110)
  expect(ys.slice(-10)).toEqual(Array(10).fill(110))
  expect([sprites(plugins)[0].anchor.x, sprites(plugins)[0].anchor.y]).toEqual([0.5, 1])
  // With `floor` 4 it comes to rest 4 above the ground.
  const raised = page()
  raised.me.emit('drop', [0, 110, 10], { floor: 4 })
  for (let f = 0; f < 60; f++) raised.frame()
  expect(sprites(raised.plugins)[0].position.y).toBe(106)
})

test('a particle drawn from a sheet of pixel art stands on whole pixels', () => {
  const { plugins, me, frame } = page()
  me.emit('puff', [10.4, 20.6])
  frame()
  const [s] = sprites(plugins)
  expect([s.position.x, s.position.y, s.roundPixels]).toEqual([10, 21, true])
  me.emit('rise', [10.4, 20.6])
  frame()
  const square = sprites(plugins).find((q: any) => q.texture === PIXI.Texture.WHITE)
  expect([square.position.x, square.roundPixels]).toEqual([10.4, false])
})

test('tint cools to tint1 and a0 fades to a1 over a life; the spawn\'s tint colours a layer that names none; scale and grow size the sprite', () => {
  const { plugins, me, frame } = page()
  me.emit('cool', [0, 0], { tint: 0x0000ff, scale: 2 })
  frame()
  expect(sprites(plugins).map((s: any) => [s.tint, s.alpha])).toEqual([[0xffffff, 1], [0x0000ff, 1]])
  for (let f = 0; f < 30; f++) frame()
  const [cooling] = sprites(plugins)
  expect(cooling.tint).toBe(0x808080)
  expect(cooling.alpha).toBeCloseTo(0.5, 9)
  expect(cooling.width).toBeCloseTo(2, 9)
  const grown = page()
  grown.me.emit('square', [0, 0])
  for (let f = 0; f < 10; f++) grown.frame()
  // Growing from 1 at birth to 30 at death: 9 steps into its 0.3 s.
  expect(sprites(grown.plugins)[0].width).toBeCloseTo(1 + 29 * ((9 * DT) / 0.3), 9)
  expect(sprites(grown.plugins)[0].tint).toBe(0xff3300)
})

test('gain brightens each channel of a particle\'s colour as far as white; scale times every length of an effect, its sizes, speeds, jitter and g, and none of its times', () => {
  const { plugins, me, frame } = page()
  me.emit('flash', [0, 0])
  frame()
  expect(sprites(plugins)[0].tint).toBe(0xffc060)
  const run = (scale?: number) => {
    const it = page()
    it.me.emit('spray', [10, 20], { seed: 7, scale })
    for (let f = 0; f < 20; f++) it.frame()
    return sprites(it.plugins)
  }
  const one = run(), two = run(2)
  expect(two).toHaveLength(one.length)
  one.forEach((s: any, i: number) => {
    expect(two[i].position.x - 10).toBeCloseTo(2 * (s.position.x - 10), 6)
    expect(two[i].position.y - 20).toBeCloseTo(2 * (s.position.y - 20), 6)
    expect(two[i].width).toBeCloseTo(2 * s.width, 6)
    expect(two[i].alpha).toBe(s.alpha)
  })
})

test('with fade, a particle holds a0 until the last seconds of its life and fades to a1 over them', () => {
  const { plugins, me, frame } = page()
  me.emit('pop', [0, 0])
  const alphas: number[] = []
  for (let f = 0; f < 42; f++) { frame(); alphas.push(sprites(plugins)[0]?.alpha) }
  // 0.45 seconds at full, then down to nothing by 0.7.
  expect(alphas.slice(0, 27).every(a => a === 1)).toBe(true)
  expect(alphas[34]).toBeCloseTo(1 - (34 * DT - 0.45) / 0.25, 9)
  expect(alphas[40]).toBeCloseTo(1 - (40 * DT - 0.45) / 0.25, 9)
})

test('stretch turns a particle along its way with its head on its point; face turns it along the spawn\'s dir', () => {
  const { plugins, me, frame } = page()
  me.emit('streak', [0, 0])
  for (let f = 0; f < 5; f++) frame()
  const [s] = sprites(plugins)
  const step = (240 * 4 * DT) / Math.SQRT2
  expect(s.position.x).toBeCloseTo(step, 9)
  expect(s.position.y).toBeCloseTo(step, 9)
  expect(s.rotation).toBeCloseTo(Math.PI / 4, 9)
  expect([s.anchor.x, s.anchor.y]).toEqual([1, 0.5])
  const facing = page()
  facing.me.emit('pointer', [0, 0], { dir: [0, -1] })
  facing.frame()
  expect(sprites(facing.plugins)[0].rotation).toBeCloseTo(-Math.PI / 2, 9)
})

test('effects are made of effects, each thrown from its at off the point; the ones that add their light are drawn over the rest; an effect made of itself throws', () => {
  const { plugins, me, frame } = page()
  me.emit('both', [0, 0])
  frame()
  const [under, over] = layer(plugins).children
  expect(under.children.map((s: any) => s.blendMode)).toEqual(['normal', 'normal'])
  expect(over.children.map((s: any) => s.blendMode)).toEqual(['add'])
  const offset = page()
  offset.me.emit('pair', [100, 50])
  offset.frame()
  // pinned's box moved 10 across; rise, which has none, thrown from 7 up.
  expect(sprites(offset.plugins).map(at)).toEqual([[113, 55], [100, 43]])
  const bad = page()
  bad.me.emit('ring', [0, 0])
  expect(() => bad.frame()).toThrow('particle2d effect ring is made of itself: ring > loop > ring')
})

test('particles are drawn on the render2d layer the effects file names, and nowhere else', () => {
  const { plugins, me, frame } = page()
  me.emit('rise', [0, 0])
  frame()
  frame()
  expect(layer(plugins).children).toHaveLength(2)
  expect(plugins.render2d.layer('things').children).toHaveLength(0)
})

test('past cap, new particles are dropped', () => {
  const { me, frame } = page()
  me.emit('many', [0, 0])
  frame()
  expect(me.count).toBe(file.cap)
})

test('listed after render2d it throws, as it does for an effect the file has not got, a clip its sheet has not got and a spread with no dir', () => {
  const late = page(['loader', 'render2d', 'particle2d'])
  expect(() => late.frame()).toThrow('particle2d is listed after render2d, which would draw every particle a frame late')
  const missing = page()
  missing.me.emit('fog', [0, 0])
  expect(() => missing.frame()).toThrow('particle2d has no effect fog')
  const lost = page()
  lost.me.emit('lost', [0, 0])
  expect(() => lost.frame()).toThrow('a particle2d layer of lost has a spread and no dir, and neither has its spawn')
  const clipless = page()
  file.effects.odd = [{ sheet: 'puff', clip: 'none', life: [1, 1] }]
  clipless.me.emit('odd', [0, 0])
  expect(() => clipless.frame()).toThrow('particle2d draws clip none of puff, which it does not have')
  delete file.effects.odd
})

// An isometric world whose `things` sort, and an effects file drawn among them.
const sorting = { ...flat, ground: [[32, 16], [-32, 16]], up: [0, -32], layers: ['ground', { name: 'things', sort: true }, 'effects'] }
const among = () => {
  const p = page(undefined, true, sorting)
  const mine = p.own()
  mine.layer = 'things'
  return p
}
const things = (plugins: any): any[] => plugins.render2d.layer('things').children
// A thing standing on a point of the world, as sprite2d stands one on a sorted layer.
const stand = (plugins: any, pos: number[]) => {
  const s = new PIXI.Sprite()
  s.zIndex = plugins.render2d.depth(pos)
  plugins.render2d.layer('things').addChild(s)
  return s
}
// The things of `things` in the order PixiJS draws them: by zIndex, ties in their order.
const drawn = (plugins: any): any[] => [...things(plugins)].map((k, i) => ({ k, i })).sort((a, b) => a.k.zIndex - b.k.zIndex || a.i - b.i).map(e => e.k)

test('on a layer that sorts, each effect is drawn in a container of its own at the depth of its point, so a wall before it hides it and one behind it does not', () => {
  const { plugins, me, frame } = among()
  const wall = stand(plugins, [2, 2])
  const behind = me.emit('rise', [1, 1], { life: 1 }), before = me.emit('square', [3, 3], { life: 1 })
  frame()
  const boxes = things(plugins).filter((c: any) => c !== wall)
  expect(boxes).toHaveLength(2)
  const [back, front] = [behind, before].map(fx => boxes.find((b: any) => b.zIndex === plugins.render2d.depth(fx.at) + 0.5))
  expect(drawn(plugins)).toEqual([back, wall, front])
  // each box holds its own effect's particles, the ones drawn normally and then the ones adding light
  expect(back.children).toHaveLength(2)
  expect(back.children[0].children).toHaveLength(1)
  expect(front.children[0].children).toHaveLength(1)
  expect(sprites(plugins)).toEqual([])
  // however far up the screen its particles fly, the burst behind stays behind
  for (let i = 0; i < 30; i++) frame()
  expect(back.children[0].children[0].position.y).toBeLessThan(plugins.render2d.place([1, 1])[1] - 20)
  expect(drawn(plugins).indexOf(back)).toBeLessThan(drawn(plugins).indexOf(wall))
})

test('an effect is drawn over a thing standing on its own point, its container follows the point, and goes when the effect does', () => {
  const { plugins, me, frame } = among()
  const monster = stand(plugins, [3, 3])
  const fx = me.emit('pop', [3, 3])
  frame()
  const [box] = things(plugins).filter((c: any) => c !== monster)
  expect(drawn(plugins)).toEqual([monster, box])
  fx.at = [4, 5]
  frame()
  expect(box.zIndex).toBe(plugins.render2d.depth([4, 5]) + 0.5)
  for (let i = 0; i < 60 && me.effects.length; i++) frame()
  expect(me.effects).toEqual([])
  expect(things(plugins)).toEqual([monster])
  expect(box.destroyed).toBe(true)
})

test('a spawn\'s layer draws its effect there in place of the file\'s, shared as on any layer that does not sort, and what it lands is drawn there too', () => {
  const { plugins, me, frame } = among()
  me.emit('pop', [2, 2], { layer: 'effects', land: [{ effect: 'square' }] })
  frame()
  expect(things(plugins)).toEqual([])
  expect(layer(plugins).children).toHaveLength(2)
  // the pop's one particle and, landed at its point the frame its life of one burst was over, the square's
  expect(sprites(plugins)).toHaveLength(2)
  expect(me.effects.map(f => f.name).sort()).toEqual(['pop', 'square'])
})

test('close frees every sprite and takes both containers off the layer', () => {
  const { plugins, me, frame } = page()
  me.emit('both', [0, 0])
  frame()
  const drawn = sprites(plugins)
  me.close()
  expect(layer(plugins).children).toEqual([])
  expect(drawn.every((s: any) => s.destroyed)).toBe(true)
  expect(me.effects).toEqual([])
})

test('the effects file written: the particles move to its new layer, and a running effect draws with its layers\' new numbers and blends', () => {
  const { plugins, me, frame, own, written } = page()
  const mine = own()
  const fx = me.emit('cool', [0, 0], { life: 1 })
  frame()
  expect(sprites(plugins).map((s: any) => s.tint)).toEqual([0xffffff, 0xffffff])
  // As the loader refills the file in place: the particles are drawn on `things`, the first layer
  // now starts black, and the second adds its light.
  Object.assign(mine, structuredClone({ ...file, layer: 'things', effects: { ...file.effects, cool: [{ life: [1, 1], tint: 0x000000, a0: 1, a1: 1 }, { life: [1, 1], add: true }] } }))
  written()
  frame()
  expect(me.effects).toContain(fx)
  expect(layer(plugins).children).toEqual([])
  const [under, over] = plugins.render2d.layer('things').children
  expect(under.children.map((s: any) => [s.tint, s.blendMode])).toEqual([[0x000000, 'normal']])
  expect(over.children.map((s: any) => [s.tint, s.blendMode])).toEqual([[0xffffff, 'add']])
})

test('a trimmed frame is its whole frame / ppm, with its kept pixels where they were in it', () => {
  // A spark 12 pixels square of which the middle 6 are kept, its pivot its middle, cut as the
  // loader cuts one: the whole frame its orig, the kept pixels its trim.
  const sparks = read({
    frames: { spark: { frame: { x: 0, y: 0, w: 6, h: 6 }, rotated: false, trimmed: true, spriteSourceSize: { x: 3, y: 3, w: 6, h: 6 }, sourceSize: { w: 12, h: 12 }, pivot: { x: 0.5, y: 0.5 } } },
    animations: { spark: ['spark'] },
    meta: { image: 'spark.png' },
  }, '/spark.json')
  const cut = new PIXI.Texture({ source, frame: new PIXI.Rectangle(0, 0, 6, 6), orig: new PIXI.Rectangle(0, 0, 12, 12), trim: new PIXI.Rectangle(3, 3, 6, 6) })
  const { plugins, me, frame } = page()
  plugins.loader.get = (name: string) => (name === 'sparks' ? { data: sparks, texture: () => cut, frameOf: (c: string, r: number, i: number) => frameOf(sparks, c, r, i) } : undefined)
  me.emit('spark', [10, 20])
  frame()
  const [s] = sprites(plugins)
  expect([s.width, s.height, s.anchor.x, s.anchor.y]).toEqual([24, 24, 0.5, 0.5])
  const { minX, maxX } = s.visualBounds
  expect([minX, maxX]).toEqual([-3, 3])
})

// Effects the tests below add to the file, and take away after.
const spawned: Effects['effects'] = {
  body: [{ lasts: true, follow: true }],
  marker: [{ life: [1, 1], box: [3, 5, 3, 5] }],
}
const adding = () => {
  Object.assign(file.effects, spawned)
  onTestFinished(() => { for (const k of Object.keys(spawned)) delete file.effects[k] })
}
const thing = (id: number, pos: number[]) => ({ id, kind: 'thing', data: { pos } })

test('an effect from a row goes on whatever its life, its point that row\'s pos, and its life is over the frame the page\'s rows no longer hold it', () => {
  const { plugins, me, frame } = page()
  const row = thing(5, [10, 20])
  plugins.wire.rows = [row]
  const fx = me.emit('hose', [0, 0], { from: 5 })
  frame()
  expect([fx.at, fx.life]).toEqual([[10, 20], Infinity])
  row.data.pos = [30, 20]
  for (let f = 0; f < 30; f++) frame()
  // still bursting half a second on, from where the row is now
  expect(sprites(plugins).map(at)).toContainEqual([30, 20])
  plugins.wire.rows = []
  frame()
  expect(fx.life).toBe(fx.age)
  for (let f = 0; f < 10; f++) frame()
  expect(me.effects.includes(fx)).toBe(false)
  // from a row the page has not got: gone at once, having thrown nothing
  const none = me.emit('hose', [0, 0], { from: 6 })
  frame()
  expect(me.effects.includes(none)).toBe(false)
  expect(sprites(plugins)).toEqual([])
})

test('a rule\'s entry from a row goes on while the ledger row holds it and the page\'s rows hold the row, and ends when the entry leaves', () => {
  const { plugins, me, frame } = page()
  const ledger = (live: Entry[]) => ({ id: 1, kind: 'particle2d', data: { live } })
  plugins.wire.rows = [ledger([entry(3, 'hose', 0, { from: 5 })]), thing(5, [7, 7])]
  for (let f = 0; f < 30; f++) frame()
  const [fx] = me.effects
  expect([fx.at, fx.life]).toEqual([[7, 7], Infinity])
  plugins.wire.rows = [ledger([]), thing(5, [7, 7])]
  frame()
  expect(fx.life).toBe(fx.age)
})

test('an effect that flies is carried from its point to its to at fly, its life the time that takes, and lands its effects there that frame', () => {
  adding()
  const a = page(), b = page()
  const fly = (p: ReturnType<typeof page>) => p.me.emit('body', [0, 0], { to: [0, 60], fly: 600, seed: 3, land: [{ effect: 'marker' }, { effect: 'rise', seed: 9, dir: [1, 0] }] })
  const round = fly(a)
  fly(b)
  expect(round.life).toBeCloseTo(0.1, 12)
  const ys: number[] = []
  for (let f = 0; f < 6; f++) {
    a.frame()
    b.frame()
    // the body lasts as long as the flight, on the point as it is carried
    expect(sprites(a.plugins)).toHaveLength(1)
    ys.push(sprites(a.plugins)[0].position.y)
  }
  ys.forEach((y, f) => expect(y).toBeCloseTo(10 * f, 9))
  a.frame()
  b.frame()
  // there: the body gone, the marker at the to off its box, rise thrown at the to along its own dir
  expect(landed(a).map(e => [e.name, e.at, e.age])).toEqual([['marker', [0, 60], 0], ['rise', [0, 60], 0]])
  expect(sprites(a.plugins).map(at)).toEqual([[3, 65], [0, 60]])
  // a landing with no seed of its own rolls from the flight's, the same on every page
  expect(sprites(a.plugins).map(at)).toEqual(sprites(b.plugins).map(at))
  a.frame()
  expect(landed(a).map(e => e.age)).toEqual([DT, DT])
})
const landed = (p: ReturnType<typeof page>) => p.me.effects.filter(e => e.name !== 'body')

test('has says whether the effects file has an effect, from the tick before the actors\' on', () => {
  const { plugins, me } = page()
  expect(me.has('rise')).toBe(false)
  me.tick(plugins)
  expect([me.has('rise'), me.has('fog')]).toEqual([true, false])
})

test('a field the file, a layer or world.particle2d has that particle2d does not know throws, naming it, as does a point of the wrong count and a layer with both or neither of life and lasts', () => {
  const cases: [(f: any, own: any) => void, string][] = [
    [f => { f.colour = 1 }, 'particle2d\'s effects file has colour, which particle2d does not know'],
    [f => { f.effects.rise[0].colour = 1 }, 'particle2d effect rise layer 0 has colour, which particle2d does not know'],
    [f => { f.effects.both[0].scale = 2 }, 'particle2d effect both layer 0 has scale, which particle2d does not know'],
    [f => { f.effects.rise[0].dir = [0, -1, 0] }, 'particle2d effect rise layer 0 has a dir of [0,-1,0], and particle2d reads 2 numbers'],
    [f => { f.effects.pair[0].at = [1, 2, 3] }, 'particle2d effect pair layer 0 has a at of [1,2,3], and particle2d reads 2 numbers'],
    [f => { f.effects.rise[0].lasts = true }, 'particle2d effect rise layer 0 has a life and lasts, and it has one or the other'],
    [f => { delete f.effects.rise[0].life }, 'particle2d effect rise layer 0 has no life and does not last, and it has one or the other'],
    [(_, own) => { own.effect = 'effects' }, 'world.particle2d has effect, which particle2d does not know'],
  ]
  for (const [spoil, message] of cases) {
    const p = page()
    spoil(p.own(), p.plugins.wire.scene.world.particle2d)
    expect(() => p.frame()).toThrow(message)
  }
  // Written by the editor, the file is checked again.
  const p = page()
  const mine = p.own()
  p.frame()
  ;(mine.effects.rise[0] as any).sped = [1, 1]
  p.written()
  expect(() => p.frame()).toThrow('particle2d effect rise layer 0 has sped, which particle2d does not know')
})
