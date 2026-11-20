import { describe, expect, it } from 'vitest'
import { judge, measure, score, type Moment, type Picture } from './score.ts'

// A picture of `w`×`h` filled with `bg`, and `paint(x, y)` the colour over it where it gives one.
const picture = (w: number, h: number, bg: number[], paint: (x: number, y: number) => number[] | undefined = () => undefined): Picture => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = paint(x, y) ?? bg
    data.set([c[0], c[1], c[2], 255], (y * w + x) * 4)
  }
  return { width: w, height: h, data }
}

describe('score', () => {
  it('scores a burst that washes the screen white below one with a dark body and a small hot core', () => {
    const W = 64, H = 64, dark = [11, 11, 14], sky = [191, 200, 210]
    const stage = picture(W, H, dark), brightStage = picture(W, H, sky)
    const inside = (x: number, y: number, r: number) => (x - 32) ** 2 + (y - 32) ** 2 < r * r
    // all added light: a cream-white disc over most of the screen, gone on the bright sky
    const washed = picture(W, H, dark, (x, y) => (inside(x, y, 28) ? [255, 252, 240] : undefined))
    const washedBright = picture(W, H, sky, (x, y) => (inside(x, y, 28) ? [255, 255, 250] : undefined))
    // a dark smoke body laid over the stage, a ring of orange fire, and a small hot core
    const good = picture(W, H, dark, (x, y) => (inside(x, y, 3) ? [255, 230, 160] : inside(x, y, 9) ? [230, 110, 30] : inside(x, y, 20) ? [4, 3, 3] : undefined))
    const goodBright = picture(W, H, sky, (x, y) => (inside(x, y, 3) ? [255, 230, 160] : inside(x, y, 9) ? [230, 110, 30] : inside(x, y, 20) ? [40, 35, 32] : undefined))
    const moments = (pic: Picture, bright: Picture): Moment[] =>
      [0, 0.5, 1].map(t => ({ t, m: measure(pic, stage, { pic: bright, stage: brightStage }), b: measure(bright, brightStage) }))

    const bad = judge(moments(washed, washedBright), 2, [{ layer: 'washed[1] glow add', change: 1 }])
    const fine = judge(moments(good, goodBright), 2, [{ layer: 'good[1] puff over', change: 0.6 }, { layer: 'good[2] glow add', change: 0.2 }])
    const failed = (rules: ReturnType<typeof judge>) => rules.filter(r => r.pass === false).map(r => r.rule)

    expect(failed(bad)).toEqual(expect.arrayContaining(['blown at peak', 'blown after', 'one focus', 'darks', 'on bright']))
    expect(failed(fine)).toEqual([])
    expect(score(fine).passed).toBeGreaterThan(score(bad).passed)
  })
})
