// A frame is cut, stood upright, turned over and drawn in other colours pixel for pixel. Its pages
// are PNGs the loader's `decodePng` reads, whose own tests are the loader's. A picture drawn on as a
// canvas is drawn on has its lines, rectangles and pictures where a canvas would have them.
import { expect, test } from 'vitest'
import { rgba } from '../test/png.ts'
import { decodePng } from '#plugins/loader/loader.sim.ts'
import { blank, cut, inkBottom, mirrored, raster, swapped, type Pixels } from './pixels.ts'

const px = (p: Pixels, x: number, y: number) => [...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)]
const all = (p: Pixels) => Array.from({ length: p.height }, (_, y) => Array.from({ length: p.width }, (_, x) => px(p, x, y)))

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a frame turned a quarter clockwise on its page is stood upright, its kept pixels in their place in the whole frame', () => {
  // The upright picture, 3 across and 2 down, kept at [2, 1] of a 6 by 4 frame, lies on the page at
  // [1, 1] turned: 2 across and 3 down, its top row down the box's right edge.
  const up = [[1, 2, 3], [4, 5, 6]]
  const page = decodePng(rgba(5, 5, (x, y) => {
    const u = y - 1, v = 1 - (x - 1)
    return x >= 1 && x <= 2 && y >= 1 && y <= 3 ? [up[v][u] * 10, 0, 0, 255] : [0, 0, 0, 0]
  }))
  const frame = cut(page, [1, 1, 2, 3], true, [6, 4], [2, 1, 3, 2])
  expect([frame.width, frame.height]).toEqual([6, 4])
  expect(all(frame).map(row => row.map(p => (p[3] ? p[0] / 10 : 0)))).toEqual([
    [0, 0, 0, 0, 0, 0],
    [0, 0, 1, 2, 3, 0],
    [0, 0, 4, 5, 6, 0],
    [0, 0, 0, 0, 0, 0],
  ])
  // The same picture lying upright on its page is cut the same.
  const flat = decodePng(rgba(3, 2, (x, y) => [up[y][x] * 10, 0, 0, 255]))
  expect(all(cut(flat, [0, 0, 3, 2], false, [6, 4], [2, 1, 3, 2]))).toEqual(all(frame))
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('turned over, a picture\'s columns run the other way; swapped, only the exact colours change', () => {
  const p = decodePng(rgba(3, 1, x => [[10, 20, 30, 255], [40, 50, 60, 255], [10, 20, 30, 0]][x]))
  expect(all(mirrored(p))[0]).toEqual([[10, 20, 30, 0], [40, 50, 60, 255], [10, 20, 30, 255]])
  const s = swapped(p, [0x0a141e, 0x28323d], [0xff0000, 0x00ff00])
  // The first matches; the second is 60, not 61, so it stays; a clear pixel stays clear.
  expect(all(s)[0]).toEqual([[255, 0, 0, 255], [40, 50, 60, 255], [10, 20, 30, 0]])
  expect(all(p)[0][0]).toEqual([10, 20, 30, 255])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('the lowest ink is the lowest row at least half opaque', () => {
  const p = decodePng(rgba(2, 5, (x, y) => [0, 0, 0, y === 3 ? 127 : y === 2 && x === 1 ? 128 : 0]))
  expect(inkBottom(p)).toBe(2)
  expect(inkBottom(blank(3, 3))).toBeUndefined()
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a picture drawn on as a canvas is: a wide line over the pixels within half its width, a dashed one broken as the dash says, a wide rectangle square at its corners, and a picture drawn larger by its nearest pixels, blended by their alpha', async () => {
  const drawn = async (r: ReturnType<typeof raster>) => decodePng(new Uint8Array(await r.png().arrayBuffer()))
  // A line 3 wide along the middle of row 4 covers rows 3 to 5, and ends where it ends.
  const wide = raster(12, 10, 0)
  wide.pen.strokeStyle = '#ff0000'
  wide.pen.lineWidth = 3
  wide.pen.beginPath()
  wide.pen.moveTo(2, 4.5)
  wide.pen.lineTo(10, 4.5)
  wide.pen.stroke()
  const w = await drawn(wide)
  expect([2, 3, 4, 5, 6].map(y => px(w, 5, y)[0])).toEqual([0, 255, 255, 255, 0])
  expect([px(w, 1, 4)[0], px(w, 2, 4)[0], px(w, 9, 4)[0], px(w, 10, 4)[0]]).toEqual([0, 255, 255, 0])
  // A line a pixel wide dashed 2 on, 2 off, from the left of row 8.
  const dashed = raster(12, 10, 0)
  dashed.pen.strokeStyle = '#00ff00'
  dashed.pen.setLineDash([2, 2])
  dashed.pen.beginPath()
  dashed.pen.moveTo(0, 8.5)
  dashed.pen.lineTo(8, 8.5)
  dashed.pen.stroke()
  const d = await drawn(dashed)
  expect([0, 1, 2, 3, 4, 5, 6, 7].map(x => px(d, x, 8)[1])).toEqual([255, 255, 0, 0, 255, 255, 0, 0])
  // A rectangle 2 wide on whole pixels covers a pixel each side of its edges, its corners too.
  const box = raster(12, 10, 0)
  box.pen.strokeStyle = '#0000ff'
  box.pen.lineWidth = 2
  box.pen.strokeRect(3, 3, 4, 4)
  const b = await drawn(box)
  expect([px(b, 2, 2)[2], px(b, 3, 3)[2], px(b, 4, 4)[2], px(b, 7, 7)[2], px(b, 8, 8)[2], px(b, 5, 2)[2]]).toEqual([255, 255, 0, 255, 0, 255])
  // A picture of two pixels drawn twice as large: the first opaque, the second half clear over the
  // ground, each pixel of the picture two of the ground's.
  const pic = raster(6, 4, 0x000000)
  pic.image({ width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 128]) }, 1, 1, 4, 2)
  const p = await drawn(pic)
  expect([px(p, 1, 1), px(p, 2, 2), px(p, 3, 1), px(p, 4, 2), px(p, 5, 1), px(p, 0, 1)]).toEqual([[255, 0, 0, 255], [255, 0, 0, 255], [0, 0, 128, 255], [0, 0, 128, 255], [0, 0, 0, 255], [0, 0, 0, 255]])
})
