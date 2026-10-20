// The onionskin is white where the frames agree and each frame's own colour where only it is inked,
// frames laid on whole pixels whatever their anchors. Whether two frames are one drawing is the
// loader's measure, tested beside it.
import { expect, test } from 'vitest'
import { onion, silhouette, tint, type Layer } from './onion.ts'
import { blank, type Pixels } from './pixels.ts'

// A picture of `w` by `h` inked where `on` says.
function drawn(w: number, h: number, on: (x: number, y: number) => boolean): Pixels {
  const p = blank(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) p.data.set([200, 100, 50, 255], (y * w + x) * 4)
  return p
}
// A body: a box with an arm out to the right, drawn 12 by 12 standing at the bottom middle.
const body = (x: number, y: number) => (x >= 3 && x < 8 && y >= 2 && y < 12) || (y === 5 && x >= 8 && x < 11)
const at = (p: Pixels, x: number, y: number): Layer => ({ pixels: p, at: [x, y] })

test('the onionskin is white where every frame is inked, and a frame\'s own colour where only it is', () => {
  const a = at(drawn(4, 1, x => x < 3), 0, 0)
  const b = at(drawn(4, 1, x => x > 0), 0, 0)
  const skin = onion([a, b])
  expect(skin.at).toEqual([0, 0])
  const px = (x: number) => [...skin.pixels.data.subarray(x * 4, x * 4 + 4)]
  expect(tint(0, 2)).toEqual([1, 0, 0])
  expect(tint(1, 2)).toEqual([0, 1, 1])
  expect([px(0), px(1), px(2), px(3)]).toEqual([[255, 0, 0, 255], [255, 255, 255, 255], [255, 255, 255, 255], [0, 255, 255, 255]])
  // Frames laid on different places make a picture wide enough for both.
  const moved = onion([a, at(b.pixels, 2, 1)])
  expect([moved.pixels.width, moved.pixels.height, ...moved.at]).toEqual([6, 2, 0, 0])
  expect(onion([a]).pixels.data.subarray(0, 4)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]))
  expect([...silhouette(a.pixels, [0, 1, 0]).data.subarray(0, 8)]).toEqual([0, 255, 0, 255, 0, 255, 0, 255])
})

test('a frame anchored on a half pixel and one on a whole pixel are laid over each other as whole pixels', () => {
  // One drawing in two frames, 13 and 12 wide, each anchored across its middle: 6.5 and 6. Rounded,
  // both stand at -6, so the drawing lies on the same pixels of both.
  const a = at(drawn(13, 12, body), -6.5, -12)
  const b = at(drawn(12, 12, body), -6, -12)
  // White where both ink, and standing where the first frame is drawn.
  const skin = onion([a, b])
  expect(skin.at).toEqual([-6.5, -12])
  expect(skin.pixels.width).toBe(13)
  expect(skin.pixels.data.subarray((5 * 13 + 4) * 4, (5 * 13 + 4) * 4 + 4)).toEqual(new Uint8ClampedArray([255, 255, 255, 255]))
})
