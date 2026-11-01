// The fog of war on the page, worked out from the rows the seat is sent. Each test writes the
// scene's `world.vision` and `world.render2d` and hands the plugin rows as a wire would. The map is
// 8 × 4 cells of 10 world units; a `scout` sees 1 cell, so from its cell it sees the four beside
// it. The seat's own `player` row, the one that is `mine`, holds slot 0.
//
// No canvas is mounted, so nothing is drawn: render2d's canvas is a stand-in, and node has no page,
// so the fog's own canvas is one that keeps the last picture put on it, whose pixels' opacity is
// what the fog covers each cell with. PixiJS takes it for a canvas as it takes a page's.
import { expect, test } from 'vitest'
import * as PIXI from 'pixi.js'
import { render2d } from '#plugins/render2d/render2d.plugin.ts'
import { vision } from './vision.plugin.ts'

PIXI.DOMAdapter.set({ ...PIXI.DOMAdapter.get(), createCanvas: () => ({ getContext: () => null }) as any })

class Canvas {
  width = 0
  height = 0
  put: ImageData | undefined
  getContext() {
    return {
      createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image: ImageData) => { this.put = image },
    }
  }
}
;(globalThis as any).HTMLCanvasElement = Canvas
const made: Canvas[] = []
;(globalThis as any).document = { createElement: () => { const c = new Canvas(); made.push(c); return c } }

const W = 8, H = 4
const fog = { cell: 10, size: [W, H], at: 'pos', slot: 'slot', sight: { scout: 1 }, always: [], layer: 'fog', unexplored: 1, explored: 0.5 }
const flat = { ground: [[1, 0], [0, 1]], up: [0, -1], zoom: 1, look: [40, 20], layers: ['things', 'fog'] }

const page = (world: any = { vision: fog }) => {
  const plugins: any = { wire: { n: 0, rows: [] as any[], scene: { world: { ...world, render2d: flat }, prefabs: { engine: { width: 400, height: 300 } } } }, render2d: render2d() }
  plugins.render2d.tick(plugins)
  plugins.render2d.canvas = { width: 400, height: 300 }
  const me = vision()
  const frame = (rows: any[]) => {
    plugins.wire.rows = rows
    me.afterTick(plugins)
  }
  // Each cell's opacity on the fog's last picture, a byte, row by row.
  const opacity = () => {
    const px = made.at(-1)!.put!.data
    return Array.from({ length: W * H }, (_, c) => px[c * 4 + 3])
  }
  return { plugins, me, frame, opacity }
}

const player = { id: 1, kind: 'player', data: { seat: 0, mine: true } }
const scout = (id: number, slot: number, cell: [number, number]) => ({ id, kind: 'scout', data: { slot, pos: [cell[0] * 10 + 5, cell[1] * 10 + 5] } })
// The map as a picture, a line of cells a row, each cell's value on `cells()`.
const map = (cells: ArrayLike<number>) => Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => cells[y * W + x]).join(''))

test('a cell never seen is dark, one seen before and no more is dimmed, and one seen now is clear', () => {
  const { me, frame, opacity } = page()
  expect(me.cells()).toBeUndefined()
  frame([player, scout(2, 0, [1, 1])])
  expect(map(me.cells()!)).toEqual([
    '02000000',
    '22200000',
    '02000000',
    '00000000',
  ])
  // The scout walks to (5, 2): the cells it left are explored, dimmed, and those it sees now clear.
  frame([player, scout(2, 0, [5, 2])])
  expect(map(me.cells()!)).toEqual([
    '01000000',
    '11100200',
    '01002220',
    '00000200',
  ])
  // The fog was drawn from what `cells()` hands: clear, explored's opacity, unexplored's.
  const want = { 0: Math.round(255 * fog.unexplored), 1: Math.round(255 * fog.explored), 2: 0 }
  expect(opacity()).toEqual(Array.from(me.cells()!, c => want[c as 0 | 1 | 2]))
})

test('the fog clears for the seers of the seat\'s own team, a team the block\'s teams may give two slots', () => {
  // An enemy scout the seat was sent sees nothing for it, and nor does the enemy's own player row,
  // which every seat is sent without `mine`.
  const alone = page()
  alone.frame([{ id: 9, kind: 'player', data: { seat: 1 } }, player, scout(2, 1, [6, 2])])
  expect(alone.me.cells()!.every(c => c === 0)).toBe(true)
  // A teammate's scout, slot 2 on slot 0's team, clears it as the seat's own would.
  const shared = page({ vision: { ...fog, teams: ['red', 'blue', 'red'] } })
  shared.frame([player, scout(2, 1, [1, 1]), scout(3, 2, [6, 2])])
  expect(map(shared.me.cells()!)).toEqual([
    '00000000',
    '00000020',
    '00000222',
    '00000020',
  ])
})

test('before the seat\'s player row arrives the whole map is dark', () => {
  const { me, frame, opacity } = page()
  frame([scout(2, 0, [1, 1])])
  expect(me.cells()!.every(c => c === 0)).toBe(true)
  expect(opacity().every(a => a === 255 * fog.unexplored)).toBe(true)
})

test('a scene that names vision and gives no world.vision throws', () => {
  const { frame } = page({})
  expect(() => frame([player])).toThrow('the scene names vision but gives no world.vision')
})
