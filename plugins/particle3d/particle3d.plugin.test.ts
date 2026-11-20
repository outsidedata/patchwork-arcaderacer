// The page's ledger of effects and their drawing. The test writes its own effects file and hands
// the plugin a page: a stand-in loader that hands over the file, and each sheet once the test says
// it has landed, decoded as the loader decodes one for three.js, and runs what waits on the file
// being written when the test writes it; a three.js scene, and a camera at z 10 looking down -z, so
// a quad's right is +x and its up is +y.
import { afterAll, expect, onTestFinished, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { uv } from '#plugins/loader/loader.plugin.ts'
import { frameOf, read, type Sheet } from '#plugins/loader/loader.sim.ts'
import { particle3d, type Effects, type Source } from './particle3d.plugin.ts'
import type { Entry } from './particle3d.sim.ts'
import { CELL, SHAPES, strip } from './shapes.ts'

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
    drip: [{ every: 0.1, life: [10, 10] }],
    climb: [{ every: 0.05, life: [1, 1], dir: [0, 1, 0], spread: 0, speed: [1, 1] }],
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
      // the files beside the effects file, the test's own, as the loader hands them
      beside: async (name: string, p: string) => (name === 'effects' && p in besides ? new TextEncoder().encode(JSON.stringify(besides[p])).buffer : undefined),
    },
  }
  const besides: Record<string, unknown> = {}
  // The effects file this page reads: the test's own, or a copy the test rewrites; and what the
  // loader runs when the file is written.
  let effects = file
  const heard: (() => void)[] = []
  const me = particle3d()
  return {
    plugins, me, pages, besides, land: (name: string) => landed.add(name), frame: () => me.afterTick(plugins),
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

test('a swirling particle is carried round the point it was thrown from about its axis, its way of going turned with it; with no axis it turns about its dir, then straight up', () => {
  const { me, frame, own, plugins } = page()
  const mine = own()
  // Thrown 1 m off the point along x, standing still, a quarter turn a second about +y: after one second
  // it stands 1 m off along −z (the right-hand way about +y carries +x to −z).
  mine.effects.orbit = [{ life: [2, 2], box: [1, 0, 0, 1, 0, 0], swirl: Math.PI / 2, axis: [0, 1, 0] }]
  me.emit('orbit', [5, 0, 0])
  frame()
  for (let f = 0; f < 60; f++) frame()
  const [q] = quads(plugins)
  expect(q.centre[0]).toBeCloseTo(5, 3)
  expect(q.centre[1]).toBeCloseTo(0, 6)
  expect(q.centre[2]).toBeCloseTo(-1, 3)
  me.close(plugins)

  // Thrown out along +x at 1 m/s with half a turn a second about +z: its way of going turns with it, so
  // it runs out along an arm that turns, a spiral. A second on, it is 1 m out and half a turn round,
  // along −x; half a second on, 0.5 m out a quarter turn round, along +y; never off the z = 0 plane.
  const arm = (frames: number) => {
    const round = page()
    round.own().effects.arm = [{ life: [3, 3], dir: [1, 0, 0], spread: 0, speed: [1, 1], swirl: Math.PI, axis: [0, 0, 1] }]
    round.me.emit('arm', [0, 0, 0])
    round.frame()
    for (let f = 0; f < frames; f++) round.frame()
    return quads(round.plugins)[0].centre
  }
  const half = arm(30), whole = arm(60)
  expect(half[0]).toBeCloseTo(0, 4)
  expect(half[1]).toBeCloseTo(0.5, 4)
  expect(whole[0]).toBeCloseTo(-1, 4)
  expect(whole[1]).toBeCloseTo(0, 4)
  expect(half[2]).toBeCloseTo(0, 6)
  expect(whole[2]).toBeCloseTo(0, 6)

  // No axis: about the layer's dir, here +z, so a particle off along +x goes to +y.
  const bydir = page()
  bydir.own().effects.spin = [{ life: [2, 2], box: [1, 0, 0, 1, 0, 0], dir: [0, 0, 1], spread: 0, swirl: Math.PI / 2 }]
  bydir.me.emit('spin', [0, 0, 0])
  bydir.frame()
  for (let f = 0; f < 60; f++) bydir.frame()
  const [d] = quads(bydir.plugins)
  expect(d.centre[0]).toBeCloseTo(0, 3)
  expect(d.centre[1]).toBeCloseTo(1, 3)
})

test('an axis of no length throws, naming the layer', () => {
  const p = page()
  p.own().effects.flat = [{ life: [1, 1], swirl: 1, axis: [0, 0, 0] }]
  expect(() => p.frame()).toThrow('particle3d effect flat layer 0 has an axis of no length, and particle3d swirls about a line')
})

test('a lamp layer is one light at the effect\'s point and its at, riding with it, of its tint, its reach scaled, for as long as the effect\'s life; then taken away', () => {
  const { plugins, me, frame, own } = page(['loader', 'particle3d', 'lights3d', 'render3d'])
  const mine = own()
  mine.effects.torch = [
    { lamp: { at: [0, 0.5, 0], tint: 0xffaa33, intensity: 6, distance: 4, decay: 2, shadow: true } },
    { n: [2, 2], every: 0.1, life: [0.2, 0.2] },
  ]
  const fx = me.emit('torch', [1, 2, 3], { life: 1, scale: 2 })
  frame()
  const lit = () => plugins.render3d.scene.children.filter((o: any) => o.isPointLight) as THREE.PointLight[]
  let [l] = lit()
  expect(lit().length).toBe(1)
  expect(l.position.toArray()).toEqual([1, 3, 3])
  expect(l.color.getHex()).toBe(0xffaa33)
  expect([l.intensity, l.distance, l.decay, l.castShadow]).toEqual([6, 8, 2, true])
  // it rides with the point
  fx.at = [4, 2, 3]
  frame()
  ;[l] = lit()
  expect(l.position.toArray()).toEqual([4, 3, 3])
  // the effect's life over and its particles gone, the lamp is taken away
  for (let f = 0; f < 80; f++) frame()
  expect(lit()).toEqual([])
})

test('a lamp of an effect of lamps alone shines for the effect\'s life; a spot points along the effect\'s dir, else down; flicker wavers it between whole and 1 - flicker', () => {
  const { plugins, me, frame, own } = page(['loader', 'particle3d', 'lights3d', 'render3d'])
  const mine = own()
  mine.effects.beam = [{ lamp: { intensity: 20, distance: 10, decay: 2, spot: { angle: 0.4, penumbra: 0.3 } } }]
  mine.effects.flame = [{ lamp: { intensity: 10, distance: 5, decay: 2, flicker: 0.4 } }]
  me.emit('beam', [0, 5, 0], { life: 0.5, dir: [1, 0, 0] })
  me.emit('beam', [0, 5, 0], { life: 0.5 })
  me.emit('flame', [0, 0, 0], { life: 2 })
  frame()
  const spots = plugins.render3d.scene.children.filter((o: any) => o.isSpotLight) as THREE.SpotLight[]
  expect(spots.length).toBe(2)
  for (const s of spots) expect([s.angle, s.penumbra]).toEqual([0.4, 0.3])
  const aims = spots.map(s => s.target.position.clone().sub(s.position).toArray())
  expect(aims).toEqual([[1, 0, 0], [0, -1, 0]])
  const flame = () => (plugins.render3d.scene.children.find((o: any) => o.isPointLight) as THREE.PointLight).intensity
  const seen: number[] = []
  for (let f = 0; f < 60; f++) { frame(); seen.push(flame()) }
  for (const i of seen) expect(i).toBeGreaterThanOrEqual(6 - 1e-9)
  for (const i of seen) expect(i).toBeLessThanOrEqual(10 + 1e-9)
  expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(1)
  // the spots' life over, they are gone; the flame shines on
  expect(plugins.render3d.scene.children.filter((o: any) => o.isSpotLight)).toEqual([])
  for (let f = 0; f < 60; f++) frame()
  expect(plugins.render3d.scene.children.filter((o: any) => o.isPointLight)).toEqual([])
})

test('a lamp is not drawn where the scene does not list lights3d; a lamp of the wrong shape throws, naming the layer', () => {
  const bare = page()
  bare.own().effects.torch = [{ lamp: { intensity: 1, distance: 1, decay: 2 } }]
  bare.me.emit('torch', [0, 0, 0], { life: 1 })
  bare.frame()
  expect(bare.plugins.render3d.scene.children.filter((o: any) => o.isLight)).toEqual([])
  const bad = (lamp: unknown, extra: object = {}) => {
    const p = page(['loader', 'particle3d', 'lights3d', 'render3d'])
    p.own().effects.torch = [{ lamp, ...extra } as any]
    return () => p.frame()
  }
  expect(bad({ intensity: 1, distance: 1, decay: 2 }, { n: [1, 1] })).toThrow('particle3d effect torch layer 0 is a lamp and has n, and a lamp layer is { lamp } alone')
  expect(bad({ intensity: 1, distance: 1, decay: 2, glow: 1 })).toThrow('particle3d effect torch layer 0 has a lamp with glow, which particle3d does not know')
  expect(bad({ intensity: 1, decay: 2 })).toThrow('particle3d effect torch layer 0 has a lamp whose distance is undefined, and it is a number of 0 or more')
  expect(bad({ intensity: 1, distance: 1, decay: 2, flicker: 2 })).toThrow('particle3d effect torch layer 0 has a lamp whose flicker is 2, and it is from 0 to 1')
  expect(bad({ intensity: 1, distance: 1, decay: 2, at: [0, 1] })).toThrow('particle3d effect torch layer 0 has a lamp at [0,1], and particle3d reads 3 numbers')
  expect(bad({ intensity: 1, distance: 1, decay: 2, spot: { angle: 2, penumbra: 0 } })).toThrow('particle3d effect torch layer 0 has a lamp whose spot is {"angle":2,"penumbra":0}')
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

test('advance runs every effect on that many seconds at once, as that many frames would: the same particles where the frames put them', () => {
  const a = page(), b = page()
  a.me.emit('rise', [1, 2, 3], { seed: 7 })
  b.me.emit('rise', [1, 2, 3], { seed: 7 })
  for (let f = 0; f < 10; f++) a.frame()
  b.me.advance(b.plugins, 9 * DT)
  b.frame()
  expect(quads(b.plugins).map((q: any) => q.centre)).toEqual(quads(a.plugins).map((q: any) => q.centre))
  expect(() => b.me.advance(b.plugins, -1)).toThrow('particle3d: advance is a number of seconds, 0 or more, not -1')
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

test('two effects of one name each driven by their own drivers play apart: each throws by its own, and one with none by the page\'s', () => {
  // Two cars' exhausts: each throws a particle straight up at its car's `speed` each tenth of a second.
  const { plugins, me, frame, own } = page()
  const mine = own()
  mine.drivers = { speed: 1 }
  mine.effects.pipe = [{ every: 0.1, life: [9, 9], dir: [0, 1, 0], spread: 0, speed: ['speed', 'speed'] }]
  const slow = me.emit('pipe', [0, 0, 0], { life: Infinity })
  const fast = me.emit('pipe', [5, 0, 0], { life: Infinity })
  const idle = me.emit('pipe', [9, 0, 0], { life: Infinity })
  slow.drivers.speed = 2
  fast.drivers.speed = 6
  for (let f = 0; f < 31; f++) frame()
  // each one's first particle, half a second up at its own speed
  const top = (x: number) => Math.max(...quads(plugins).filter((q: any) => Math.abs(q.centre[0] - x) < 1e-6).map((q: any) => q.centre[1]))
  expect(top(0)).toBeCloseTo(2 * 30 * DT, 6)
  expect(top(5)).toBeCloseTo(6 * 30 * DT, 6)
  expect(top(9)).toBeCloseTo(1 * 30 * DT, 6)
  // the page's own drive reaches the one with no driver of its own, and not the two driven
  me.drive('speed', 3)
  fast.drivers.speed = 1
  for (let f = 0; f < 7; f++) frame()
  const newest = (x: number) => Math.min(...quads(plugins).filter((q: any) => Math.abs(q.centre[0] - x) < 1e-6).map((q: any) => q.centre[1]))
  // the bursts at 0.6 s, a step old: one step up at each one's speed now
  expect(newest(5)).toBeCloseTo(1 * DT, 6)
  expect(newest(0)).toBeCloseTo(2 * DT, 6)
  expect(newest(9)).toBeCloseTo(3 * DT, 6)
})

test('a stream whose every is driven to 0 throws nothing, its first burst too, and runs on; driven above 0 again it bursts from then, none rolled for the time it was held', () => {
  // A wheel's dust: no dust while the wheel stands, a puff each tenth of a second once it rolls.
  const { me, frame, own } = page()
  const mine = own()
  mine.drivers = { speed: 0 }
  mine.effects.dust = [{ every: 'speed > 1 ? 0.1 : 0', life: [20, 20] }]
  const fx = me.emit('dust', [0, 0, 0], { life: Infinity })
  for (let f = 0; f < 60; f++) frame()
  expect(me.count).toBe(0)
  expect(me.effects.includes(fx)).toBe(true)
  fx.drivers.speed = 4
  for (let f = 0; f < 60; f++) frame()
  // one at once and one each tenth of a second after: ten in the second, not the twenty it held through
  expect(me.count).toBe(10)
  fx.drivers.speed = 0
  for (let f = 0; f < 60; f++) frame()
  expect(me.count).toBe(10)
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

test('effects are made of effects, one mesh for each page of a sheet; an effect made of itself throws', () => {
  const { plugins, me, frame } = page()
  me.emit('both', [0, 0, 0])
  frame()
  expect(quads(plugins)).toHaveLength(3)
  expect(plugins.render3d.scene.children).toHaveLength(2)
  const bad = page()
  bad.me.emit('ring', [0, 0, 0])
  expect(() => bad.frame()).toThrow('particle3d effect ring is made of itself: ring > loop > ring')
})

test('a mesh\'s particles are drawn the farthest from the camera first, those that add their light among those laid over, each hiding what is behind it by its keep', () => {
  // the camera stands at z 10 and looks down -z: smoke at z 2, a light at z 0, smoke at z -3
  file.effects.depth = [
    { life: [1, 1], shape: 'puff', box: [0, 0, 2, 0, 0, 2] },
    { life: [1, 1], shape: 'glow', add: true },
    { life: [1, 1], shape: 'puff2', box: [0, 0, -3, 0, 0, -3] },
  ]
  onTestFinished(() => { delete file.effects.depth })
  const { plugins, me, frame } = page()
  me.emit('depth', [0, 0, 0])
  frame()
  const [mesh] = plugins.render3d.scene.children
  expect(plugins.render3d.scene.children).toHaveLength(1)
  expect(quads(plugins).map((q: any) => q.centre[2])).toEqual([-3, 0, 2])
  // each quad's four corners: the light between the two smokes hides nothing
  expect([...mesh.geometry.attributes.keep.array.slice(0, 12)]).toEqual([1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1])
  // from the other side the order is the other way round
  plugins.render3d.camera.position.set(0, 0, -10)
  plugins.render3d.camera.lookAt(0, 0, 0)
  frame()
  expect(quads(plugins).map((q: any) => q.centre[2])).toEqual([2, 0, -3])
})

test('each sheet\'s page is one batch, its mesh made the frame its first particle comes and kept, drawing that frame\'s particles of it', () => {
  file.effects.mixed = [
    { effect: 'square' },
    { sheet: 'puff', clip: 'all', life: [1, 1], n: [2, 2] },
    { life: [1, 1], add: true },
    { life: [1, 1], dir: [1, 0, 0], spread: 0, speed: [4, 4], stretch: true, sheet: 'puff', clip: 'long' },
    { sheet: 'puff', clip: 'all', life: [1, 1], add: true, n: [3, 3] },
  ]
  onTestFinished(() => { delete file.effects.mixed })
  const { plugins, me, frame, pages } = page()
  me.emit('mixed', [0, 0, 0])
  frame()
  // In the order each batch's first particle came: no sheet, puff's first page, puff's second page;
  // those that add their light in the mesh of their page with the rest.
  const meshes = plugins.render3d.scene.children.filter((o: any) => o.isMesh)
  // Each mesh's page (-1 for none) and quads.
  const batches = (ms: any[]) => ms.map((m: any) => [pages.indexOf(m.material.map), m.geometry.drawRange.count / 6])
  const want = [[-1, 2], [0, 5], [1, 1]]
  expect(batches(meshes)).toEqual(want)
  // The next frames draw the same particles in the same meshes, none counted twice.
  // The very meshes made, not new ones alike.
  const kept = () => {
    const now = plugins.render3d.scene.children.filter((o: any) => o.isMesh)
    return now.length === meshes.length && now.every((m: any, i: number) => m === meshes[i])
  }
  frame()
  frame()
  expect(kept()).toBe(true)
  expect(batches(meshes)).toEqual(want)
  // The square's life over, its mesh draws the one fewer and is kept; thrown again, it draws in that mesh.
  for (let f = 0; f < 20; f++) frame()
  expect(batches(meshes)).toEqual([[-1, 1], ...want.slice(1)])
  me.emit('square', [0, 0, 0])
  frame()
  expect(kept()).toBe(true)
  expect(batches(meshes)).toEqual([[-1, 2], ...want.slice(1)])
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
  // the one left behind first: it is the farther from the camera along its way
  expect(quads(plugins).map((q: any) => q.centre.map((v: number) => +v.toFixed(4)))).toEqual([[10, 20, 30], [15, 27, 31]])
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
  // pinned's box moved 10 across; rise, which has none, thrown from 7 up, and drawn first, the farther.
  expect(quads(plugins).map((q: any) => q.centre.map((v: number) => +v.toFixed(4)))).toEqual([[100, 57, 0], [113, 55, 7]])
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

test('a page\'s own effect given an age opens as one that has run that long: a stream already full', () => {
  const late = page(), early = page()
  late.me.emit('hose', [0, 0, 0], { life: 10, seed: 5, age: 4 * DT })
  early.me.emit('hose', [0, 0, 0], { life: 10, seed: 5 })
  late.frame()
  for (let f = 0; f < 5; f++) early.frame()
  expect(quads(late.plugins).length).toBeGreaterThan(1)
  expect(centres(late.plugins)).toEqual(centres(early.plugins))
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
  expect(centres(a.plugins)).toEqual([[0, 0, -6], [3, 5, 1]])
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
  // Written while the game runs, the file is checked again.
  const p = page()
  const mine = p.own()
  p.frame()
  ;(mine.effects.rise[0] as any).sped = [1, 1]
  p.written()
  expect(() => p.frame()).toThrow('particle3d effect rise layer 0 has sped, which particle3d does not know')
})

test('a particle that carries an effect takes it along its flight: thrown at it, its point the particle\'s place each frame, its dir the way it goes; it stops the frame the particle dies', () => {
  const p = page()
  const mine = p.own()
  // A chunk thrown along +x at 6 m/s, falling, that lives half a second; a trail it carries, one
  // still dot a frame, each living a second.
  mine.effects.chunk = [{ life: [0.5, 0.5], dir: [1, 0, 0], spread: 0, speed: [6, 6], g: 9.8, carry: 'trail' }]
  mine.effects.trail = [{ every: DT, life: [1, 1] }]
  p.me.emit('chunk', [0, 0, 0])
  p.frame()
  const trail = () => p.me.effects.find(f => f.name === 'trail')!
  expect(trail().at).toEqual([0, 0, 0])
  for (let f = 0; f < 10; f++) p.frame()
  // ten steps flown: x is 6 m/s along, y has fallen, and the trail's point is on the chunk
  const t = trail()
  expect(t.at[0]).toBeCloseTo(1, 5)
  expect(t.at[1]).toBeLessThan(0)
  expect(t.dir![0]).toBeGreaterThan(0.9)
  expect(t.dir![1]).toBeLessThan(0)
  // one chunk and a dot left behind at each place it has been, every dot where the chunk was
  const dots = quads(p.plugins).filter((q: any) => q.w < 1.01 && q.centre[0] < t.at[0] - 1e-6)
  expect(dots.length).toBe(10)
  expect(new Set(dots.map((q: any) => q.centre[0].toFixed(3))).size).toBe(10)
  // the chunk lives 30 frames: the frame it dies its trail stops, throwing no more, and its dots live on
  let frames = 11
  while (trail().life === Infinity) { p.frame(); frames++ }
  expect(frames).toBe(31)
  expect(trail().life).toBeCloseTo(trail().age, 9)
  const count = p.me.count
  for (let f = 0; f < 5; f++) p.frame()
  expect(p.me.count).toBe(count)
})

test('carried effects nest: a particle\'s effect carries effects of its own; every page with one seed draws them the same', () => {
  const run = () => {
    const p = page()
    const mine = p.own()
    mine.effects.blast = [{ n: [3, 3], life: [0.4, 0.4], speed: [4, 4], carry: 'shard' }]
    mine.effects.shard = [{ n: [2, 2], every: 0.1, life: [0.3, 0.3], speed: [2, 2], carry: 'spark' }]
    mine.effects.spark = [{ every: 0.05, life: [0.1, 0.1] }]
    p.me.emit('blast', [0, 0, 0], { seed: 7 })
    for (let f = 0; f < 12; f++) p.frame()
    return { names: p.me.effects.map(f => f.name), at: quads(p.plugins).map((q: any) => q.centre) }
  }
  const one = run()
  expect(one.names.filter(n => n === 'shard').length).toBe(3)
  expect(one.names.filter(n => n === 'spark').length).toBeGreaterThan(6)
  expect(run()).toEqual(one)
})

test('a carried effect\'s to is the point of the effect its particle is of, so its beam reaches from the particle back there, wherever either goes: lightning', () => {
  const p = page()
  const mine = p.own()
  // An orb thrown along +x at 6 m/s from the middle, carrying a bolt drawn afresh every frame.
  mine.effects.orb = [{ life: [0.5, 0.5], size: [0.01, 0.01], dir: [1, 0, 0], spread: 0, speed: [6, 6], carry: 'arc' }]
  mine.effects.arc = [{ every: DT, life: [DT, DT], size: [0.5, 0.5], shape: 'bolt', beam: true, add: true }]
  const orb = p.me.emit('orb', [5, 1, 0], { seed: 3 })
  for (let f = 0; f < 11; f++) p.frame()
  const arc = () => p.me.effects.find(f => f.name === 'arc')!
  const bolts = () => quads(p.plugins).filter((q: any) => q.h > 0.4)
  expect(arc().to).toEqual([5, 1, 0])
  // ten steps flown, the orb is a metre out: one bolt, from it back to the middle
  expect(bolts().length).toBe(1)
  expect(bolts()[0].w).toBeCloseTo(1, 5)
  expect(bolts()[0].h).toBeCloseTo(0.5, 5)
  expect(bolts()[0].centre.map((v: number) => +v.toFixed(4))).toEqual([5.5, 1, 0])
  // the middle moved: the bolt ends there from the next frame
  orb.at = [5, 3, 0]
  p.frame()
  expect(arc().to).toEqual([5, 3, 0])
  expect(bolts()[0].w).toBeCloseTo(Math.hypot(1.1, 2), 5)
})

test('an effect that comes back to itself by carrying throws the first frame the file is read, naming the path round; so does one that carries an effect there is none of', () => {
  const cases: [(f: any) => void, string][] = [
    [f => { f.effects.a = [{ life: [1, 1], carry: 'a' }] }, 'particle3d effect a carries itself: a > a'],
    [f => { f.effects.a = [{ life: [1, 1], carry: 'b' }]; f.effects.b = [{ effect: 'c' }]; f.effects.c = [{ life: [1, 1], carry: 'a' }] }, 'particle3d effect a carries itself: a > b > c > a'],
    [f => { f.effects.a = [{ life: [1, 1], carry: 'none' }] }, 'particle3d effect a layer 0 carries "none", which there is none of'],
  ]
  for (const [spoil, message] of cases) {
    const p = page()
    spoil(p.own())
    expect(() => p.frame()).toThrow(message)
  }
})

test('a layer drawn as one of particle3d\'s own shapes is a metre square times its size, cut from its cell of the shapes\' strip, every shape in one mesh; with no sheet or catalogue entry', () => {
  const p = page()
  const mine = p.own()
  mine.effects.soft = [{ life: [1, 1], shape: 'puff', size: [2, 2] }, { life: [1, 1], shape: 'glow' }]
  p.me.emit('soft', [0, 0, 0])
  p.frame()
  const drawn = quads(p.plugins)
  expect(drawn.length).toBe(2)
  expect(new Set(drawn.map((q: any) => q.mesh)).size).toBe(1)
  expect(drawn[0].w).toBeCloseTo(2, 5)
  expect(drawn[1].w).toBeCloseTo(1, 5)
  // puff is the first of 10 cells, glow the third; each cut half a pixel in
  const w = CELL * 10
  expect(drawn[0].u[0]).toBeCloseTo(0.5 / w, 6)
  expect(drawn[1].u).toEqual(f32([(2 * CELL + 0.5) / w, (3 * CELL - 0.5) / w]))
  expect(drawn[0].mesh.material.map.image.width).toBe(w)
})

test('the shapes\' strip is white with each shape in its alpha, nothing at its cell\'s edge, the round ones fullest in the middle', () => {
  const px = strip(), w = CELL * SHAPES.length
  const alpha = (cell: number, x: number, y: number) => px[4 * (y * w + cell * CELL + x) + 3]
  SHAPES.forEach((s, i) => {
    expect(alpha(i, 0, 0), s).toBe(0)
    expect(alpha(i, CELL - 1, CELL / 2), s).toBeLessThan(8)
  })
  for (const s of ['glow', 'spark', 'star'] as const) expect(alpha(SHAPES.indexOf(s), CELL / 2, CELL / 2)).toBeGreaterThan(240)
  // a halo is brighter on its ring than in its middle
  const halo = SHAPES.indexOf('halo')
  expect(alpha(halo, Math.round(CELL / 2 + 0.68 * CELL / 2), CELL / 2)).toBeGreaterThan(alpha(halo, CELL / 2, CELL / 2) + 100)
  // a bolt is one line from its left edge to its right: every column between its faded ends has a
  // hot pixel, it leaves the straight line between, and the two bolts are not one picture
  const column = (cell: number, x: number) => Array.from({ length: CELL }, (_, y) => alpha(cell, x, y))
  const peak = (cell: number, x: number) => column(cell, x).indexOf(Math.max(...column(cell, x)))
  for (const s of ['bolt', 'bolt2'] as const) {
    const cell = SHAPES.indexOf(s)
    for (let x = CELL / 8; x < CELL - CELL / 8; x++) expect(Math.max(...column(cell, x)), `${s} column ${x}`).toBeGreaterThan(200)
    for (const x of [CELL / 8, CELL - CELL / 8 - 1]) expect(Math.abs(peak(cell, x) - CELL / 2), `${s} end ${x}`).toBeLessThan(CELL / 4)
    const peaks = Array.from({ length: CELL - CELL / 4 }, (_, i) => peak(cell, i + CELL / 8))
    expect(Math.max(...peaks) - Math.min(...peaks), s).toBeGreaterThan(12)
  }
  const one = SHAPES.indexOf('bolt'), two = SHAPES.indexOf('bolt2')
  expect(Array.from({ length: CELL }, (_, x) => peak(one, x))).not.toEqual(Array.from({ length: CELL }, (_, x) => peak(two, x)))
})

test('a shape particle3d does not draw throws, naming the shapes it does, as does a layer with a shape and a sheet', () => {
  const cases: [(f: any) => void, string][] = [
    [f => { f.effects.rise[0].shape = 'blob' }, 'particle3d effect rise layer 0 has a shape "blob", and particle3d draws puff, puff2, glow, halo, spark, streak, ring, star, bolt, bolt2'],
    [f => { f.effects.puff[0].shape = 'glow' }, 'particle3d effect puff layer 0 has a shape and a sheet, and it is drawn as one or the other'],
  ]
  for (const [spoil, message] of cases) {
    const p = page()
    spoil(p.own())
    expect(() => p.frame()).toThrow(message)
  }
})

test('a particle with a bounce goes back up off the floor with that much of its fall, lower each time, and comes to rest on it; a bounce outside 0 to 1 throws', () => {
  const p = page()
  const mine = p.own()
  mine.effects.ball = [{ life: [6, 6], g: 10, bounce: 0.6 }]
  p.me.emit('ball', [0, 2, 0], { floor: 0 })
  const ys: number[] = []
  for (let f = 0; f < 300; f++) { p.frame(); ys.push(quads(p.plugins)[0].centre[1]) }
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
  // the peaks after each landing, each lower than the last: 0.6² of the height before
  const peaks = ys.filter((y, i) => i > 0 && y > ys[i - 1] && y >= (ys[i + 1] ?? 0) && y > 0.01)
  expect(peaks.length).toBeGreaterThan(2)
  expect(peaks[0]).toBeCloseTo(2 * 0.36, 1)
  expect(peaks[1]).toBeLessThan(peaks[0])
  expect(ys[299]).toBe(0)
  // one thrown along the floor: each strike keeps the bounce of its whole speed, and it turns as a ball
  // of its size rolling at its speed along the floor, until it stops and turns no more
  const s = page()
  s.own().effects.tumble = [{ life: [6, 6], dir: [1, 0, 0], spread: 0, speed: [4, 4], g: 10, bounce: 0.6, spin: 8, size: [1, 1] }]
  s.me.emit('tumble', [0, 1, 0], { floor: 0, seed: 1 })
  const at = () => quads(s.plugins)[0].centre
  const turn = () => { const q = quads(s.plugins)[0]; return Math.atan2(q.br[1] - q.bl[1], q.br[0] - q.bl[0]) }
  const step = (f: number) => { for (let i = 0; i < f; i++) s.frame() }
  // it lands after about 0.45 s at 4 m/s along; a little after, it rolls at its speed along over its radius
  step(40)
  const x0 = at()[0], a0 = turn(); step(1)
  const speed = (at()[0] - x0) * 60, rate = Math.abs(((turn() - a0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 60
  expect(speed).toBeLessThan(4 * 0.6 + 1e-6)
  expect(rate).toBeCloseTo(speed / 0.5, 1)
  step(240)
  const x1 = at()[0], a1 = turn(); step(1)
  expect(at()[0]).toBeCloseTo(x1, 9)
  expect(turn()).toBeCloseTo(a1, 9)
  const bad = page()
  ;(bad.own().effects.rise[0] as any).bounce = 1.5
  expect(() => bad.frame()).toThrow('particle3d effect rise layer 0 has a bounce of 1.5, and a bounce is from 0 to 1')
})

// Lets the listed files' reads land.
const settle = () => new Promise(r => setTimeout(r))

test('the effects of each file the effects file lists are its own: drawn, built into its effects and built of them', async () => {
  const p = page()
  const mine = p.own()
  mine.files = ['town/town.effects.json']
  mine.effects.smoky = [{ effect: 'chimney/puff' }, { effect: 'rise' }]
  p.besides['town/town.effects.json'] = {
    effects: { 'chimney/core': [{ n: [2, 2], life: [1, 1] }], 'chimney/puff': [{ effect: 'chimney/core' }, { effect: 'square' }] },
  }
  p.frame()
  expect(p.me.has('chimney/puff')).toBe(false)
  await settle()
  expect(['chimney/core', 'chimney/puff', 'smoky', 'rise'].map(n => p.me.has(n))).toEqual([true, true, true, true])
  p.me.emit('chimney/puff', [1, 2, 3])
  p.me.emit('smoky', [0, 0, 0])
  p.frame()
  // three from the puff, four from smoky: the puff's and the rise's
  expect(quads(p.plugins).length).toBe(7)
})


// A particle standing still under a steady pull or fall of `a` m/s² is, `n` steps on, this far along:
// its speed is stepped before its place.
const fallen = (a: number, n: number) => a * DT * DT * (n * (n + 1)) / 2

test('a layer in a force generator is moved by every entry of it, times the strength the layer names it by, beside its own forces; one generator moves every layer in it', () => {
  // Where each particle of these layers is a second after it is thrown from [5, 0, 0].
  const after = (layers: Effects['effects'][string]): number[][] => {
    const { me, frame, own, plugins } = page()
    const mine = own()
    mine.forceGenerators = {
      turn: [{ swirl: Math.PI / 2, axis: [0, 1, 0] }],
      fall: [{ g: 10 }],
      east: [{ pull: 1, at: [3, 0, 0] }],
      apart: [{ pull: 1, at: [3, 0, 0] }, { pull: 1, at: [-3, 0, 0] }],
    }
    mine.effects.it = layers
    me.emit('it', [5, 0, 0])
    frame()
    for (let f = 0; f < 60; f++) frame()
    return quads(plugins).map((q: { centre: number[] }) => q.centre)
  }
  // a quarter turn a second about +y carries one 1 m off along +x to 1 m off along −z, as a layer's own swirl does
  const [quarter] = after([{ life: [9, 9], box: [1, 0, 0, 1, 0, 0], forces: { turn: 1 } }])
  expect(quarter[0]).toBeCloseTo(5, 3)
  expect(quarter[2]).toBeCloseTo(-1, 3)
  // twice as hard, half a turn
  const [half] = after([{ life: [9, 9], box: [1, 0, 0, 1, 0, 0], forces: { turn: 2 } }])
  expect(half[0]).toBeCloseTo(4, 3)
  expect(half[2]).toBeCloseTo(0, 3)
  // a generator's gravity at half strength, and beside the layer's own
  expect(after([{ life: [9, 9], forces: { fall: 0.5 } }])[0][1]).toBeCloseTo(-fallen(5, 60), 3)
  expect(after([{ life: [9, 9], g: 5, forces: { fall: 0.5 } }])[0][1]).toBeCloseTo(-fallen(10, 60), 3)
  // an entry's pull draws toward its `at` off the point the particle was thrown from
  expect(after([{ life: [9, 9], forces: { east: 1 } }])[0][0]).toBeCloseTo(5 + fallen(1, 60), 3)
  // a generator of two entries is two pulls: to two points either side, they hold it where it is
  expect(after([{ life: [9, 9], forces: { apart: 1 } }])[0][0]).toBeCloseTo(5, 6)
  // a layer in two generators, and two layers in one
  const [both] = after([{ life: [9, 9], box: [1, 0, 0, 1, 0, 0], forces: { fall: 1, turn: 1 } }])
  expect(both[0]).toBeCloseTo(5, 3)
  expect(both[1]).toBeCloseTo(-fallen(10, 60), 3)
  expect(both[2]).toBeCloseTo(-1, 3)
  const two = after([{ life: [9, 9], forces: { fall: 1 } }, { life: [9, 9], box: [2, 0, 0, 2, 0, 0], forces: { fall: 1 } }])
  expect(two.map(c => c[1].toFixed(3))).toEqual([(-fallen(10, 60)).toFixed(3), (-fallen(10, 60)).toFixed(3)])
  // a strength of 0 leaves it be
  expect(after([{ life: [9, 9], forces: { fall: 0 } }])[0][1]).toBe(0)
})

test('a force generator\'s entry pushes along its direction, pulls toward a centre anchored to the particle or the effect, reaches only within its range, falls off toward its edge, and is scaled by the noise field it flies through', () => {
  // Where each particle of the layers is after `frames` frames, thrown from [5, 0, 0], with these generators.
  const after = (generators: Effects['forceGenerators'], effects: Effects['effects'], frames = 60): number[][] => {
    const { me, frame, own, plugins } = page()
    const mine = own()
    mine.forceGenerators = generators
    Object.assign(mine.effects, effects)
    me.emit('it', [5, 0, 0])
    frame()
    for (let f = 0; f < frames; f++) frame()
    return quads(plugins).map((q: { centre: number[] }) => q.centre)
  }
  // a direction is a push along its vector, as hard as it is long: a wind along +x, and gravity along -y
  const [wind] = after({ wind: [{ direction: [3, 0, 0] }] }, { it: [{ life: [9, 9], forces: { wind: 1 } }] })
  expect(wind[0]).toBeCloseTo(5 + fallen(3, 60), 3)
  expect(wind[1]).toBeCloseTo(0, 6)
  const [down] = after({ fall: [{ direction: [0, -10, 0] }] }, { it: [{ life: [9, 9], forces: { fall: 1 } }] })
  expect(down[1]).toBeCloseTo(-fallen(10, 60), 3)

  // anchored to the particle, a particle of a carried effect is pulled toward a point off where it was
  // itself thrown; anchored to the effect, toward the point of the effect the carrying began from. The
  // carrier sits 4 m along +x of the effect's point, still, and throws one particle there.
  const carried = (anchor: 'particle' | 'effect') => after(
    { home: [{ pull: 2, anchor }] },
    { it: [{ life: [9, 9], size: [0, 0], box: [4, 0, 0, 4, 0, 0], carry: 'child' }], child: [{ life: [9, 9], forces: { home: 1 } }] },
    30,
  ).map(c => c[0])
  // particle-anchored: its centre is where it was thrown, so it stays at 9 (the carrier too, which is still)
  for (const x of carried('particle')) expect(x).toBeCloseTo(9, 6)
  // effect-anchored: drawn back toward 5, by a pull of 2 m/s² for 30 steps; the carrier stays at 9
  expect(Math.min(...carried('effect'))).toBeCloseTo(9 - fallen(2, 30), 3)

  // a range: a pull reaches a particle within it and none beyond; the particles start 1 m and 3 m off
  // the centre [5, 0, 0] along +x, so a range of 2 reaches the first and not the second
  const ranged = after(
    { in: [{ pull: 1, anchor: 'effect', range: 2 }] },
    { it: [{ life: [9, 9], box: [1, 0, 0, 1, 0, 0], forces: { in: 1 } }, { life: [9, 9], box: [3, 0, 0, 3, 0, 0], forces: { in: 1 } }] },
    10,
  )
  expect(ranged[0][0]).toBeLessThan(6)
  expect(ranged[1][0]).toBe(8)
  // a falloff weakens it toward the edge: at half the range with a falloff of 1, half as hard as with none,
  // over one step of the push (its speed is stepped before its place)
  const one = (falloff?: number) => after(
    { out: [{ direction: [10, 0, 0], anchor: 'effect', range: 2, ...(falloff === undefined ? {} : { falloff }) }] },
    { it: [{ life: [9, 9], box: [0, 0, 1, 0, 0, 1], forces: { out: 1 } }] },
    1,
  )[0][0] - 5
  expect(one(1)).toBeCloseTo(one() / 2, 6)
  expect(one(2)).toBeCloseTo(one() / 4, 6)

  // the noise: an amplitude of 0 is the force as it is everywhere; with an amplitude, particles at
  // different places feel it differently, each 1 + amplitude times the field where it is, so a row of
  // particles thrown along z and pushed along x no longer keeps in line
  const row = (noiseAmplitude: number) => after(
    { gust: [{ direction: [3, 0, 0], noiseFrequency: 0.7, noiseAmplitude }] },
    { it: Array.from({ length: 6 }, (_, i) => ({ life: [9, 9], box: [0, 0, i, 0, 0, i], forces: { gust: 1 } })) },
  ).map(c => c[0])
  for (const x of row(0)) expect(x).toBeCloseTo(5 + fallen(3, 60), 3)
  const spread = row(0.8)
  expect(Math.max(...spread) - Math.min(...spread)).toBeGreaterThan(0.1)
  for (const x of spread) expect(x).toBeGreaterThanOrEqual(5)
})

test('a force generator or a layer\'s forces of the wrong shape throws, naming it', () => {
  const bad = (change: (f: Effects) => void) => {
    const p = page()
    change(p.own())
    return () => p.frame()
  }
  expect(bad(f => { f.effects.x = [{ life: [1, 1], forces: { cone: 1 } }] })).toThrow('particle3d effect x layer 0 is in the force generator cone, which there is none of')
  expect(bad(f => { f.forceGenerators = { chaos: [{}] }; f.effects.x = [{ life: [1, 1], forces: { cone: 1 } }] })).toThrow('particle3d effect x layer 0 is in the force generator cone, which there is none of: the file\'s are chaos')
  expect(bad(f => { f.forceGenerators = { cone: [{ pull: 1, speed: 2 } as never] } })).toThrow('particle3d force generator cone entry 0 has speed, and an entry is any of g, drag, pull, swirl, axis, at')
  expect(bad(f => { f.forceGenerators = { cone: { pull: 1 } as never } })).toThrow('particle3d force generator cone is {"pull":1}, and a force generator is a list of entries')
  expect(bad(f => { f.forceGenerators = { cone: [{ swirl: 1, axis: [0, 0, 0] }] } })).toThrow('particle3d force generator cone entry 0 has an axis of no length')
  expect(bad(f => { f.forceGenerators = { cone: [{ pull: 1, at: [1, 2] }] } })).toThrow('particle3d force generator cone entry 0 has a at of [1,2], and particle3d reads 3 numbers')
  expect(bad(f => { f.forceGenerators = { cone: [{ direction: [1, 0] }] } })).toThrow('particle3d force generator cone entry 0 has a direction of [1,0], and particle3d reads 3 numbers')
  expect(bad(f => { f.forceGenerators = { cone: [{ pull: 1, anchor: 'world' as never }] } })).toThrow('particle3d force generator cone entry 0 has an anchor "world", and an anchor is particle or effect')
  expect(bad(f => { f.forceGenerators = { cone: [{ pull: 1, falloff: 2 }] } })).toThrow('particle3d force generator cone entry 0 has a falloff and no range, and a force falls off over its range')
  expect(bad(f => { f.forceGenerators = { cone: [{ pull: 1, range: -1 }] } })).toThrow('particle3d force generator cone entry 0 has a range of -1, and it is 0 or more')
  expect(bad(f => { f.forceGenerators = { cone: [{ pull: 1, noiseAmplitude: -0.5 }] } })).toThrow('particle3d force generator cone entry 0 has a noiseAmplitude of -0.5, and it is 0 or more')
  expect(bad(f => { f.forceGenerators = { cone: [{ pull: 1, overLife: [[0.5, 1], [0.2, 0]] }] } })).toThrow('particle3d force generator cone entry 0 has overLife of [[0.5,1],[0.2,0]], and they are [[<part of a particle\'s life, 0 to 1>, <value>], ...] in order')
  expect(bad(f => { f.forceGenerators = { cone: [{ wind: [1, 0, 0] }] } })).toThrow('particle3d force generator cone entry 0 has a wind and no drag, and a wind is the air its drag is in')
  expect(bad(f => { f.effects.x = [{ life: [1, 1], tint: 0xff0000, tints: [[0, 0xffffff], [1, 0]] }] })).toThrow('particle3d effect x layer 0 has tints and tint, and tints are written in place of tint')
  expect(bad(f => { f.forceGenerators = { cone: [] }; f.effects.x = [{ life: [1, 1], forces: ['cone'] as never }] })).toThrow('particle3d effect x layer 0 has forces of ["cone"], and its forces are { <force generator>: strength }')
  expect(bad(f => { f.forceGenerators = { cone: [] }; f.effects.x = [{ life: [1, 1], forces: { cone: true as never } }] })).toThrow('particle3d effect x layer 0 is in the force generator cone by true, and its strength is a number')
})

test('a number written as a string is an expression of the file\'s drivers, its value each frame; a driver held by the page moves every number that names it, in the particles in the air too', () => {
  const { me, frame, own, plugins } = page()
  const mine = own()
  mine.drivers = { amplitude: 2, double: 'amplitude * 2' }
  mine.effects.fall = [{ life: [9, 9], g: 'amplitude' }, { life: [9, 9], box: [1, 0, 0, 1, 0, 0], g: 'double' }]
  me.emit('fall', [0, 0, 0])
  frame()
  expect(me.drivers).toEqual({ time: DT, amplitude: 2, double: 4 })
  for (let f = 0; f < 60; f++) frame()
  expect(quads(plugins).map(q => q.centre[1].toFixed(4))).toEqual([(-fallen(2, 60)).toFixed(4), (-fallen(4, 60)).toFixed(4)])
  // held at 0, neither falls any faster: each goes on at the speed it had
  me.drive('amplitude', 0)
  for (let f = 0; f < 60; f++) frame()
  expect(me.drivers).toMatchObject({ amplitude: 0, double: 0 })
  expect(me.drivers.time).toBeCloseTo(121 * DT, 9)
  expect(quads(plugins).map(q => q.centre[1].toFixed(4))).toEqual([(-fallen(2, 60) - 2).toFixed(4), (-fallen(4, 60) - 4).toFixed(4)])
  // let go, it is the file's again
  me.drive('amplitude')
  frame()
  expect(me.drivers).toMatchObject({ amplitude: 2, double: 4 })
})

test('a colour is a driver: a tint, a tint1, a tints stop and a lamp\'s tint written as an expression are its number each frame, an effect\'s own drivers colouring it alone', () => {
  const { me, frame, own, plugins } = page(['loader', 'particle3d', 'lights3d', 'render3d'])
  const mine = own()
  mine.drivers = { colour: 0xff0000, cooled: 0x0000ff }
  mine.effects.dust = [
    { life: [1, 1], tint: 'colour', tint1: 'cooled' },
    { life: [1, 1], box: [1, 0, 0, 1, 0, 0], tints: [[0, 'colour'], [1, 'colour']] },
    { lamp: { tint: 'colour', intensity: 1, distance: 5, decay: 2 } },
  ]
  me.emit('dust', [0, 0, 0], { life: 5 })
  frame()
  expect(quads(plugins).map(q => q.colour)).toEqual([linear(0xff0000, 1), linear(0xff0000, 1)])
  const light = plugins.render3d.scene.children.find((o: any) => o.isPointLight) as THREE.PointLight
  expect(light.color.getHex()).toBe(0xff0000)
  me.drive('colour', 0x00ff00)
  frame()
  expect(quads(plugins)[1].colour).toEqual(linear(0x00ff00, 1))
  expect(light.color.getHex()).toBe(0x00ff00)
  // an effect of its own colour: gravel and mud are the one dust
  const mud = me.emit('dust', [0, 0, 0], { life: 5 })
  mud.drivers.colour = 0x553311
  frame()
  frame()
  expect(quads(plugins).map(q => q.colour)).toContainEqual(linear(0x553311, 1))
  expect(quads(plugins).map(q => q.colour)).toContainEqual(linear(0x00ff00, 1))
})

test('a driven every quickens a stream from where it is: each burst is every seconds after the last, at the every of now', () => {
  const { me, frame, own } = page()
  const mine = own()
  mine.drivers = { amplitude: 1 }
  mine.effects.beat = [{ every: '0.1 / amplitude', life: [20, 20] }]
  me.emit('beat', [0, 0, 0], { life: 100 })
  frame()
  for (let f = 0; f < 60; f++) frame()
  // one at the start and one each tenth of the second
  expect(me.count).toBe(11)
  me.drive('amplitude', 2)
  for (let f = 0; f < 60; f++) frame()
  // twice as often from then on, about twenty more: not every burst it would have thrown had it always been so
  expect(me.count).toBeGreaterThanOrEqual(29)
  expect(me.count).toBeLessThanOrEqual(31)
})

test('a rule\'s drivers on the ledger row are over the file\'s, and the page\'s own over them', () => {
  const { me, frame, own, plugins } = page()
  own().drivers = { amplitude: 1, wind: 7 }
  plugins.wire.rows = [{ id: 1, kind: 'particle3d', data: { next: 1, live: [], drivers: { amplitude: 3 } } }]
  frame()
  expect(me.drivers).toMatchObject({ amplitude: 3, wind: 7 })
  me.drive('amplitude', 5)
  frame()
  expect(me.drivers.amplitude).toBe(5)
  me.drive('amplitude')
  frame()
  expect(me.drivers.amplitude).toBe(3)
  plugins.wire.rows = []
  frame()
  expect(me.drivers.amplitude).toBe(1)
})

test('drivers reach a range, a point, a box, an { effect, at }, a lamp and a force generator\'s entry and a layer\'s strength in it', () => {
  const { me, frame, own, plugins } = page(['loader', 'particle3d', 'lights3d', 'render3d'])
  const mine = own()
  mine.drivers = { amplitude: 2 }
  mine.forceGenerators = { fall: [{ g: 'amplitude * 5' }] }
  mine.effects.dot = [{ life: [9, 9], size: ['amplitude', 'amplitude * 1'], box: ['amplitude', 0, 0, 'amplitude', 0, 0] }]
  mine.effects.moved = [{ effect: 'dot', at: [0, 'amplitude * 10', 0] }, { lamp: { intensity: 'amplitude * 3', distance: 5, decay: 2, at: ['amplitude', 0, 0] } }]
  mine.effects.heavy = [{ life: [9, 9], forces: { fall: 'amplitude / 4' } }]
  me.emit('moved', [0, 0, 0], { life: 5 })
  frame()
  const [q] = quads(plugins)
  expect(q.centre.map(n => +n.toFixed(4))).toEqual([2, 20, 0])
  expect(q.w).toBeCloseTo(2, 5)
  const light = plugins.render3d.scene.children.find((o: any) => o.isPointLight) as THREE.PointLight
  expect(light.intensity).toBe(6)
  expect(light.position.x).toBe(2)
  me.drive('amplitude', 1)
  frame()
  expect(light.intensity).toBe(3)
  expect(light.position.x).toBe(1)
  me.close(plugins)
  // a generator's g of 10, by a strength of a half
  const p = page()
  const again = p.own()
  again.drivers = mine.drivers
  again.forceGenerators = mine.forceGenerators
  again.effects.heavy = mine.effects.heavy
  p.me.emit('heavy', [0, 0, 0])
  p.frame()
  for (let f = 0; f < 60; f++) p.frame()
  expect(quads(p.plugins)[0].centre[1]).toBeCloseTo(-fallen(5, 60), 3)
})

test('the file written with a driver changed plays by it from the next frame', () => {
  const { me, frame, own, written } = page()
  const mine = own()
  mine.drivers = { amplitude: 1 }
  mine.effects.fall = [{ life: [9, 9], g: 'amplitude' }]
  me.emit('fall', [0, 0, 0])
  frame()
  expect(me.drivers.amplitude).toBe(1)
  mine.drivers = { amplitude: 4 }
  written()
  frame()
  expect(me.drivers.amplitude).toBe(4)
})

test('a string where a number goes that is no expression, or names no driver, throws, naming the field; so does one in a field that is on or off, and a driver the file has none of', () => {
  const bad = (change: (f: Effects) => void, then: (p: ReturnType<typeof page>) => void = () => {}) => {
    const p = page()
    change(p.own())
    then(p)
    return () => { p.frame(); p.frame() }
  }
  expect(bad(f => { f.effects.x = [{ life: [1, 1], g: 'amplitude * 2' }] })).toThrow('particle3d effect x layer 0\'s g is "amplitude * 2", which names amplitude, and the effects file\'s drivers are none')
  expect(bad(f => { f.drivers = { amplitude: 1 }; f.effects.x = [{ life: [1, '2 *'] }] })).toThrow('particle3d effect x layer 0\'s life is "2 *", which ends where it wants a number or a name')
  expect(bad(f => { f.drivers = { amplitude: 1 }; f.effects.x = [{ life: [1, 1], add: 'amplitude' as never }] })).toThrow('particle3d effect x layer 0 has a add of "amplitude", and add is on or off, which no driver drives')
  expect(bad(f => { f.drivers = { amplitude: 1 }; f.forceGenerators = { cone: [{ pull: 'wind' }] } })).toThrow('particle3d force generator cone entry 0\'s pull is "wind", which names wind, and the effects file\'s drivers are amplitude')
  expect(bad(f => { f.drivers = { a: 'b', b: 'a' } })).toThrow('particle3d\'s effects file driver a is driven by itself: a > b > a')
  expect(bad(f => { f.drivers = { amplitude: 1 } }, p => p.me.drive('wind', 2))).toThrow('particle3d is driven by wind, which its effects file has no driver of: its drivers are amplitude')
})

test('a number driven outside what its field takes throws the frame it is, naming the effect, the field and the expression', () => {
  const p = page()
  const mine = p.own()
  mine.drivers = { amplitude: 0.5 }
  mine.effects.ball = [{ life: [9, 9], bounce: 'amplitude', swirl: 1, axis: ['amplitude', 'amplitude', 0] }]
  p.me.emit('ball', [0, 0, 0])
  p.frame()
  p.frame()
  p.me.drive('amplitude', 2)
  expect(() => p.frame()).toThrow('particle3d effect ball\'s bounce is "amplitude", which is 2 now, and it is a number from 0 to 1')
  p.me.drive('amplitude', 0)
  expect(() => p.frame()).toThrow('particle3d effect ball\'s axis is "amplitude", which leaves an axis of no length now, and particle3d swirls about a line')
  const q = page()
  const other = q.own()
  other.drivers = { amplitude: 1 }
  other.effects.beat = [{ every: '0 / (amplitude - 1)', life: [1, 1] }]
  q.me.emit('beat', [0, 0, 0])
  expect(() => { q.frame(); q.frame() }).toThrow('particle3d effect beat\'s every is "0 / (amplitude - 1)", which is NaN now, and it is a number of 0 or more')
})

test('the force generators and drivers of each file the effects file lists are its own', async () => {
  const p = page()
  const mine = p.own()
  mine.files = ['town/town.effects.json']
  mine.drivers = { amplitude: 1 }
  p.besides['town/town.effects.json'] = {
    drivers: { wind: 'amplitude * 10' },
    forceGenerators: { gust: [{ g: 'wind' }] },
    effects: { leaf: [{ life: [9, 9], forces: { gust: 1 } }] },
  }
  p.frame()
  await settle()
  p.me.emit('leaf', [0, 0, 0])
  p.frame()
  for (let f = 0; f < 60; f++) p.frame()
  expect(p.me.drivers).toMatchObject({ amplitude: 1, wind: 10 })
  expect(quads(p.plugins)[0].centre[1]).toBeCloseTo(-fallen(10, 60), 3)
})

// A page with these generators and effects, `it` thrown from [5, 0, 0] and drawn: `step(n)` runs n more
// frames and hands back where every particle is.
const thrown = (generators: Effects['forceGenerators'], effects: Effects['effects']) => {
  const { me, frame, own, plugins } = page()
  const mine = own()
  mine.forceGenerators = generators
  Object.assign(mine.effects, effects)
  me.emit('it', [5, 0, 0])
  frame()
  return {
    plugins,
    step: (n: number): number[][] => {
      for (let f = 0; f < n; f++) frame()
      return quads(plugins).map((q: { centre: number[] }) => q.centre)
    },
  }
}

test('grows, tints and alphas are a particle\'s size, colour and opacity over its life, a straight line from each stop to the next', () => {
  const { step, plugins } = thrown({}, {
    it: [{ life: [1, 1], grows: [[0, 1], [0.5, 3], [1, 3]], tints: [[0, 0xffffff], [0.5, 0xff0101], [1, 0x010101]], alphas: [[0, 0], [0.25, 1], [0.5, 1], [1, 0]] }],
  })
  // born a metre across, white, and not yet seen
  expect(quads(plugins)[0].w).toBeCloseTo(1, 6)
  expect(quads(plugins)[0].colour).toEqual(linear(0xffffff, 0))
  // a quarter of the way through its life: half way from 1 to 3 across, from white to red, and faded in
  step(15)
  expect(quads(plugins)[0].w).toBeCloseTo(2, 6)
  expect(quads(plugins)[0].colour).toEqual(linear(0xff8080, 1))
  // three quarters: as big as it gets, half way from red to black, and half faded out
  step(30)
  expect(quads(plugins)[0].w).toBeCloseTo(3, 6)
  expect(quads(plugins)[0].colour).toEqual(linear(0x800101, 0.5).map(v => expect.closeTo(v, 6)))
})

test('outward throws a particle straight away from the effect\'s point; a strength that is a range rolls each particle its own; inherit starts what a carried effect throws with its carrier\'s speed', () => {
  // one started a metre either side of the point, each thrown out at 2 m/s: half a second on, a metre further out
  const out = thrown({}, { it: [{ life: [9, 9], box: [1, 0, 0, 1, 0, 0], outward: [2, 2] }, { life: [9, 9], box: [-1, 0, 0, -1, 0, 0], outward: [2, 2] }] }).step(30)
  expect(out.map(c => c[0]).sort()).toEqual([expect.closeTo(3, 5), expect.closeTo(7, 5)])
  for (const c of out) expect(c[1]).toBeCloseTo(0, 9)

  // forty particles in one gravity by half to twice its strength: each falls its own way, none outside the two
  const rain = thrown({ fall: [{ g: 10 }] }, { it: [{ n: [40, 40], life: [9, 9], forces: { fall: [0.5, 2] } }] }).step(60).map(c => -c[1])
  expect(Math.min(...rain)).toBeGreaterThanOrEqual(fallen(5, 60) - 1e-6)
  expect(Math.max(...rain)).toBeLessThanOrEqual(fallen(20, 60) + 1e-6)
  expect(Math.max(...rain) - Math.min(...rain)).toBeGreaterThan(fallen(10, 60))

  // a chunk at 6 m/s that throws one particle with half its speed: half a second on, the chunk is 3 m
  // along and what it threw half that
  const shed = thrown({}, {
    it: [{ life: [9, 9], dir: [1, 0, 0], spread: 0, speed: [6, 6], carry: 'shed' }],
    shed: [{ life: [9, 9], inherit: 0.5 }],
  }).step(30)
  expect(shed.map(c => c[0]).sort()).toEqual([expect.closeTo(6.5, 5), expect.closeTo(8, 5)])
})

test('an entry\'s overAge is an impulse and its overLife lets a particle go; its wind carries what its drag holds; dragBySpeed stops the fast harder; its pull draws to a shell, or to its axis line; its turbulence pushes each particle its own way', () => {
  // a push that lasts the effect's first half second: one thrown at the start is pushed, and one thrown
  // a second in is left where it is
  const blast = thrown({ blast: [{ direction: [8, 0, 0], overAge: [[0.5, 1], [0.5, 0]] }] }, {
    it: [{ life: [9, 9], forces: { blast: 1 } }, { life: [9, 9], after: 1, box: [0, 2, 0, 0, 2, 0], forces: { blast: 1 } }],
  }).step(90)
  expect(blast.find(c => c[1] === 0)![0]).toBeGreaterThan(6)
  expect(blast.find(c => c[1] === 2)![0]).toBe(5)

  // a lift that lets go half way through a particle's life: from then on it climbs no faster
  const lift = thrown({ lift: [{ direction: [0, 6, 0], overLife: [[0.5, 1], [0.5, 0]] }] }, { it: [{ life: [2, 2], forces: { lift: 1 } }] })
  const [a] = lift.step(80), [b] = lift.step(1), [c] = lift.step(20), [d] = lift.step(1)
  expect(b[1] - a[1]).toBeGreaterThan(0.05)
  expect(d[1] - c[1]).toBeCloseTo(b[1] - a[1], 9)

  // still air moving at 3 m/s along x: a particle let go in it is carried up to the wind's speed
  const air = thrown({ air: [{ drag: 5, wind: [3, 0, 0] }] }, { it: [{ life: [9, 9], forces: { air: 1 } }] })
  const [w0] = air.step(180), [w1] = air.step(1)
  expect((w1[0] - w0[0]) / DT).toBeCloseTo(3, 3)

  // thrown at 2 m/s and at 20: the fast one is stopped far harder, and goes nowhere near ten times as far
  const drag = thrown({ thick: [{ dragBySpeed: 0.5 }] }, {
    it: [
      { life: [9, 9], dir: [1, 0, 0], spread: 0, speed: [2, 2], forces: { thick: 1 } },
      { life: [9, 9], dir: [1, 0, 0], spread: 0, speed: [20, 20], box: [0, 2, 0, 0, 2, 0], forces: { thick: 1 } },
    ],
  }).step(60)
  const slow = drag.find(c => c[1] === 0)![0] - 5, fast = drag.find(c => c[1] === 2)![0] - 5
  expect(fast).toBeGreaterThan(slow)
  expect(fast).toBeLessThan(slow * 4)

  // a pull to a shell 2 m off the effect's point: one started inside it and one outside both settle on it
  const shell = thrown({ hold: [{ pull: 20, anchor: 'effect', shell: 2 }, { drag: 4 }] }, {
    it: [{ life: [9, 9], box: [0.5, 0, 0, 0.5, 0, 0], forces: { hold: 1 } }, { life: [9, 9], box: [-4, 0, 0, -4, 0, 0], forces: { hold: 1 } }],
  }).step(180)
  for (const c of shell) expect(Math.abs(Math.abs(c[0] - 5) - 2)).toBeLessThan(0.1)

  // a pull to the line straight up through the effect's point: drawn in to the line, and no way along it
  const [column] = thrown({ column: [{ pull: 5, anchor: 'effect', toAxis: true, axis: [0, 1, 0] }, { drag: 3 }] }, {
    it: [{ life: [9, 9], box: [2, 3, 0, 2, 3, 0], forces: { column: 1 } }],
  }).step(180)
  expect(Math.abs(column[0] - 5)).toBeLessThan(0.1)
  expect(column[1]).toBeCloseTo(3, 9)

  // turbulence alone moves a row of still particles, each its own way; scrolled, the field has moved on
  // and pushes them otherwise
  const row = (noiseScroll?: number[]) => thrown({ churn: [{ turbulence: 6, noiseFrequency: 0.7, ...(noiseScroll ? { noiseScroll } : {}) }] }, {
    it: Array.from({ length: 6 }, (_, i) => ({ life: [9, 9] as [number, number], box: [i * 2, 0, 0, i * 2, 0, 0], forces: { churn: 1 } })),
  }).step(60).sort((p, q) => p[0] - q[0])
  const still = row(), moved = still.map((c, i) => [c[0] - 5 - i * 2, c[1], c[2]])
  for (const m of moved) expect(Math.hypot(...m)).toBeGreaterThan(0.01)
  expect(Math.max(...moved.map(m => m[1])) - Math.min(...moved.map(m => m[1]))).toBeGreaterThan(0.1)
  const scrolled = row([4, 0, 0])
  expect(Math.max(...scrolled.map((c, i) => Math.hypot(c[0] - still[i][0], c[1] - still[i][1], c[2] - still[i][2])))).toBeGreaterThan(0.1)
})

// ---------------------------------------------------------------- attachments

// A game's own plugin, `beacon`, whose mod for particle3d hands the sources the test puts on
// `globalThis.beacons` each frame.
const home = mkdtempSync(join(tmpdir(), 'particle3d-attach-'))
afterAll(() => rmSync(home, { recursive: true }))
mkdirSync(join(home, 'plugins', 'beacon'), { recursive: true })
writeFileSync(join(home, 'plugins', 'beacon', 'beacon.particle3d.ts'), 'export const sources = () => (globalThis as any).beacons\n')
const beacons = (list: Source[]) => { (globalThis as any).beacons = list }
// The effects file with drivers a source hands, and two streams; a page whose scene attaches `attach`
// to the beacon's sources, with the mod loaded.
const attached = async (attach: unknown, sources: string[] | undefined = ['beacon']) => {
  const p = page()
  const e = p.own()
  e.drivers = { load: 0, tint: 0, wet: 0, height: 1 }
  e.effects.dust = [{ every: 0.05, life: [0.2, 0.2], tint: 'tint' }]
  e.effects.mud = [{ every: 0.05, life: [0.2, 0.2] }]
  const world = p.plugins.wire.scene.world
  world.particle3d.attach = attach
  if (sources) world.particle3d.mods = { sources }
  world.shipped = { plugins: ['beacon'] }
  world.scenemanager = { home: pathToFileURL(home + '/').href }
  await prepare({} as any, [], world)
  return p
}
const running = (p: { me: ReturnType<typeof particle3d> }, name: string) => p.me.effects.filter(fx => fx.name === name && fx.life === Infinity)

test('an attachment throws its effect from every source of its word, kept on it, its point, way and floor the source\'s and its drivers the source\'s alone, a driver it gives no more going back to the file\'s', async () => {
  const p = await attached([{ on: 'wheel', effect: 'dust' }])
  beacons([
    { key: 'a', on: 'wheel', at: [1, 0, 0], dir: [0, 1, 0], floor: -0.5, drivers: { load: 4000, tint: 0xff0000 } },
    { key: 'b', on: 'wheel', at: [-1, 0, 0], drivers: { load: 100 } },
    { key: 'c', on: 'pipe', at: [0, 2, 0], drivers: {} },
  ])
  p.frame()
  const [a, b] = running(p, 'dust')
  expect(running(p, 'dust')).toHaveLength(2)
  expect([a.at, a.dir, a.floor, a.drivers]).toEqual([[1, 0, 0], [0, 1, 0], -0.5, { load: 4000, tint: 0xff0000 }])
  expect([b.at, b.dir, b.floor, b.drivers]).toEqual([[-1, 0, 0], undefined, undefined, { load: 100 }])
  // Moved, driven otherwise, and its tint let go: the same effects, now as the sources say.
  beacons([
    { key: 'a', on: 'wheel', at: [2, 0, 1], dir: [1, 0, 0], floor: 0, drivers: { load: 50 } },
    { key: 'b', on: 'wheel', at: [-1, 0, 3], drivers: { load: 100, tint: 0x00ff00 } },
  ])
  p.frame()
  expect(running(p, 'dust')).toEqual([a, b])
  expect([a.at, a.dir, a.floor, a.drivers]).toEqual([[2, 0, 1], [1, 0, 0], 0, { load: 50 }])
  expect(b.drivers).toEqual({ load: 100, tint: 0x00ff00 })
  // Its particles drawn in its own tint: b's green, a's the file's 0.
  for (let i = 0; i < 3; i++) p.frame()
  const colours = new Set(quads(p.plugins).map(q => q.colour.slice(0, 3).join()))
  expect(colours).toEqual(new Set([linear(0x00ff00, 1), linear(0, 1)].map(c => c.slice(0, 3).join())))
})

test('an attachment with an `of` throws from its word\'s sources of that alone, and two attachments on one word are two effects on every source of it', async () => {
  const p = await attached([{ on: 'wheel', of: 'jeep', effect: 'dust' }, { on: 'wheel', effect: 'mud' }])
  beacons([
    { key: 'a', on: 'wheel', of: 'jeep', at: [1, 0, 0], drivers: {} },
    { key: 'b', on: 'wheel', of: 'truck', at: [2, 0, 0], drivers: {} },
  ])
  p.frame()
  expect(running(p, 'dust').map(fx => fx.at[0])).toEqual([1])
  expect(running(p, 'mud').map(fx => fx.at[0])).toEqual([1, 2])
})

test('an attachment runs from the first frame its when holds, of the source\'s drivers over the file\'s, and stops the frame it does not, its particles living on', async () => {
  const p = await attached([{ on: 'wheel', effect: 'mud', when: 'wet and height < 0.2' }])
  const at = (wet: number, height?: number): Source[] => [{ key: 'a', on: 'wheel', at: [0, 0, 0], drivers: { wet, ...(height !== undefined && { height }) } }]
  // dry; then wet but at the file's height of 1
  beacons(at(0, 0.1))
  p.frame()
  beacons(at(1))
  p.frame()
  expect(running(p, 'mud')).toHaveLength(0)
  beacons(at(1, 0.1))
  p.frame()
  const [mud] = running(p, 'mud')
  expect(mud).toBeDefined()
  for (let i = 0; i < 6; i++) p.frame()
  expect(p.me.count).toBeGreaterThan(0)
  beacons(at(0, 0.1))
  p.frame()
  expect(mud.life).toBeLessThanOrEqual(mud.age)
  expect(running(p, 'mud')).toHaveLength(0)
  expect(p.me.effects).toContain(mud)
  // wet again: a new one
  beacons(at(1, 0.1))
  p.frame()
  expect(running(p, 'mud')).toHaveLength(1)
  expect(running(p, 'mud')[0]).not.toBe(mud)
})

test('a source gone stops its effect, and one that comes again starts another', async () => {
  const p = await attached([{ on: 'wheel', effect: 'dust' }])
  beacons([{ key: 'a', on: 'wheel', at: [0, 0, 0], drivers: {} }])
  p.frame()
  const [dust] = running(p, 'dust')
  beacons([])
  p.frame()
  expect(dust.life).toBeLessThanOrEqual(dust.age)
  expect(running(p, 'dust')).toHaveLength(0)
  beacons([{ key: 'a', on: 'wheel', at: [0, 0, 0], drivers: {} }])
  p.frame()
  expect(running(p, 'dust')).toHaveLength(1)
  expect(running(p, 'dust')[0]).not.toBe(dust)
})

test('an attach that is no list of attachments, names an effect the file has none of, has a when that is no expression of its drivers, or comes with no sources, throws when the file is read; a source\'s driver the file has none of, the frame it is handed', async () => {
  beacons([])
  const read = async (attach: unknown, sources?: string[]) => {
    const p = await attached(attach, sources)
    return () => p.frame()
  }
  expect(await read({ on: 'wheel' })).toThrow('world.particle3d.attach is {"on":"wheel"}, and it is a list, each { on, effect, of, when }')
  expect(await read([{ on: 'wheel', effect: 'dust', at: 1 }])).toThrow('world.particle3d.attach 0 has at, and an attachment is { on, effect, of, when }')
  expect(await read([{ effect: 'dust' }])).toThrow('world.particle3d.attach 0 has an on of undefined, and on is the word of the sources it is thrown from')
  expect(await read([{ on: 'wheel', effect: 'smoke' }])).toThrow('world.particle3d.attach 0 throws "smoke", which the effects file has no effect of')
  expect(await read([{ on: 'wheel', effect: 'dust', when: 'deep > 1' }])).toThrow('world.particle3d.attach 0\'s when is "deep > 1", which names deep, and the effects file\'s drivers are load, tint, wet, height')
  expect(await read([{ on: 'wheel', effect: 'dust', when: 'wet >' }])).toThrow('world.particle3d.attach 0\'s when is "wet >", which ends where it wants a number or a name')
  expect(await read([{ on: 'wheel', effect: 'dust' }], [])).toThrow('world.particle3d has an attach, and its mods name no sources')
  const p = await attached([{ on: 'wheel', effect: 'dust' }])
  beacons([{ key: 'a', on: 'wheel', at: [0, 0, 0], drivers: { grip: 1 } }])
  expect(() => p.frame()).toThrow('particle3d\'s wheel source a is driven by grip, which its effects file has no driver of: its drivers are load, tint, wet, height')
})

test('a source that names its own effect throws it with no attachment written, kept on it and stopped when it is gone; an effect the file has not throws, naming the source', async () => {
  const p = await attached(undefined)
  beacons([{ key: 'a', on: 'item', effect: 'mud', at: [1, 2, 3], dir: [0, 1, 0], drivers: {} }, { key: 'b', on: 'item', at: [0, 0, 0], drivers: {} }])
  p.frame()
  const [mud] = running(p, 'mud')
  expect(running(p, 'mud')).toHaveLength(1)
  expect([mud.at, mud.dir]).toEqual([[1, 2, 3], [0, 1, 0]])
  beacons([{ key: 'a', on: 'item', effect: 'mud', at: [4, 2, 3], drivers: {} }])
  p.frame()
  expect(running(p, 'mud')).toEqual([mud])
  expect(mud.at).toEqual([4, 2, 3])
  beacons([])
  p.frame()
  expect(running(p, 'mud')).toHaveLength(0)
  beacons([{ key: 'a', on: 'item', effect: 'smoke', at: [0, 0, 0], drivers: {} }])
  expect(() => p.frame()).toThrow('particle3d\'s item source a throws the effect smoke, which the effects file has not')
})
