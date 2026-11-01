// render2d's stage, on a client this test puts together from render2d and a scene it writes: an
// isometric world whose height goes up the screen.
import * as PIXI from 'pixi.js'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { drawn } from '#editor/drawn.ts'
import { editor } from '#editor/test/editor.ts'
import type { Plugins } from '#engine/browser.ts'
import { render2d as extension } from './render2d.extension.tsx'
import { render2d } from './render2d.plugin.ts'

let undo = () => {}
beforeEach(() => { undo = drawn() })
afterEach(() => undo())

// Runs `f` as the actor of row `id` runs, from a module named `<kind>.client.ts?row=<id>`.
const asActor = (id: number, f: () => void) =>
  new Function('f', `f()\n//# sourceURL=http://localhost/games/fake/pad.client.ts?row=${id}`)(f)
const box = (x: number, y: number) => new PIXI.Graphics().rect(x, y, 10, 10).fill(0xffffff)

async function made(prefab: object | null = { ground: [[32, 16], [-32, 16]], up: [0, -32], zoom: 1, look: [0, 0], layers: ['floor', 'things'] }) {
  const { ed } = await editor()
  ed.use('render2d', extension)
  const r = render2d()
  const scene = { plugins: ['render2d'], world: prefab ? { render2d: prefab } : {}, prefabs: { engine: { width: 400, height: 300 } } }
  const plugins = { wire: { rows: [], scene }, render2d: r } as unknown as Plugins
  const st = ed.providers[0].provider(plugins)!
  r.tick(plugins)
  r.afterTick()
  return { ed, r, st }
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the topmost drawing under a point is picked with the ground under it, and a row is boxed round all it draws', async () => {
  const { r, st } = await made(null)
  const layer = new PIXI.Container()
  r.stage.addChild(layer)
  asActor(3, () => layer.addChild(box(0, 0), box(20, 0)))
  asActor(4, () => {
    const c = new PIXI.Container()
    c.addChild(box(5, 5))
    layer.addChild(c)
  })
  layer.addChild(box(100, 100))
  expect(st.pick(2, 2)).toEqual({ id: 3, point: [2, 2, 0] })
  expect(st.pick(7, 7)?.id).toBe(4)
  expect(st.pick(22, 2)?.id).toBe(3)
  expect(st.pick(105, 105)).toBeUndefined()
  expect(st.bounds(3)).toEqual([0, 0, 30, 10])
  expect(st.bounds(9)).toBeUndefined()
  expect(st.orbit).toBeUndefined()
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a canvas point is a line of world points, one per height: ray, ground and plane run back through the world', async () => {
  const { r, st } = await made()
  for (const p of [[1, 0], [2.5, -1], [0, 3, 2]]) {
    const { x, y } = r.project(p)
    const on = st.plane(x, y, [9, 9, p[2] ?? 0])!
    on.forEach((v, i) => expect(v).toBeCloseTo(p[i] ?? 0, 9))
  }
  // A step of height is drawn a step of `up` up the screen, so the point one step up over [1, 1] is
  // drawn where [0, 0] is; and one step of `up` up the screen at the ground is a cell back along both
  // axes.
  const { x, y } = r.project([0, 0])
  const ray = st.ray(x, y)!
  ray.origin.forEach((v, i) => expect(v).toBeCloseTo([0, 0, 0][i], 9))
  ray.dir.forEach((v, i) => expect(v).toBeCloseTo([1, 1, 1][i], 9))
  st.ground(x, y - 32)!.forEach((v, i) => expect(v).toBeCloseTo([-1, -1, 0][i], 9))
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('render2d\'s placer moves `pos` in every scene that names render2d, flat or with a height it keeps; the overlay is over every layer, moves with the world and is never picked', async () => {
  const { ed, r, st } = await made()
  const placer = ed.drawnPlacers.find(p => p.renderer === 'render2d')!.placer
  expect(placer.axes).toEqual(['x', 'y', 'h'])
  expect(placer.at({ pos: [1, 2] })).toEqual([1, 2, 0])
  expect(placer.at({ pos: [1, 2, 3] })).toEqual([1, 2, 3])
  expect(placer.at({ at: [1, 2] })).toBeUndefined()
  expect(placer.to({ pos: [1, 2] }, [4, 5, 0])).toEqual({ pos: [4, 5] })
  expect(placer.to({ pos: [1, 2, 3] }, [4, 5, 3])).toEqual({ pos: [4, 5, 3] })
  const overlay = st.overlay as PIXI.Container
  expect(overlay.parent).toBe(r.world)
  expect(r.world!.children.at(-1)).toBe(overlay)
  asActor(6, () => r.layer('things').addChild(box(0, 0)))
  // Something put on the world after the overlay: the next frame puts the overlay over it.
  r.world!.addChild(new PIXI.Container())
  r.afterTick()
  expect(r.world!.children.at(-1)).toBe(overlay)
  // Drawings in the overlay are never picked, even one added as a row's actor adds one.
  asActor(7, () => overlay.addChild(box(0, 0), box(-100, -100)))
  const { x, y } = r.project([0, 0])
  expect(st.pick(x + 1, y + 1)?.id).toBe(6)
  expect(st.pick(x - 95, y - 95)).toBeUndefined()
  expect(st.bounds(7)).toBeUndefined()
  st.close()
  expect(overlay.destroyed).toBe(true)
  expect(r.world!.children).not.toContain(overlay)
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a mark is a line through world points with a dot on each, drawn where render2d places them, until it is taken away', async () => {
  const { r, st } = await made()
  const overlay = st.overlay as PIXI.Container
  const off = st.mark([[0, 0], [1, 0], [0, 1, 1]], 0xff0000)
  r.afterTick()
  const g = overlay.children.at(-1) as PIXI.Graphics
  expect(g).toBeInstanceOf(PIXI.Graphics)
  // [0, 0] is at the world's origin, [1, 0] a step along x, and [0, 1] a step along y, lifted a step
  // of `up`; each dot reaches 2.5 pixels round its point.
  const b = g.getLocalBounds()
  expect([b.minX, b.maxX, b.minY, b.maxY].map(v => Math.round(v * 10) / 10)).toEqual([-34.5, 34.5, -18.5, 18.5])
  off()
  expect(g.destroyed).toBe(true)
  expect(overlay.children).not.toContain(g)
  off()
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('on a dense screen a canvas point is its own pixels, so many to each of render2d\'s points: ground, pick and bounds take them so', async () => {
  const { r, st } = await made()
  // A canvas drawn at two canvas pixels to each point, as render2d sets it on a screen of density 2.
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.style.width = '400px'
  r.canvas = canvas
  const { x, y } = r.project([1, 2])
  st.ground(2 * x, 2 * y)!.forEach((v, i) => expect(v).toBeCloseTo([1, 2, 0][i], 9))
  const layer = new PIXI.Container()
  r.stage.addChild(layer)
  asActor(5, () => layer.addChild(box(10, 10)))
  expect(st.pick(30, 30)?.id).toBe(5)
  expect(st.pick(15, 15)).toBeUndefined()
  expect(st.bounds(5)).toEqual([20, 20, 20, 20])
})
