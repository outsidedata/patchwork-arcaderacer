// A sheet's frame is drawn with every pixel of its page where it stands in the upright whole
// picture: kept pixels moved by `trim`, and a frame stored turned on its page turned back.
import { expect, test } from 'vitest'
import { drawFrame } from './images.ts'

// A context that keeps its transform and, for each picture drawn, where every page pixel's middle
// lands on the surface.
function recorder() {
  let m = [1, 0, 0, 1, 0, 0]
  const saved: number[][] = []
  const landed = new Map<string, [number, number]>()
  const apply = ([a, b, c, d, e, f]: number[], x: number, y: number): [number, number] => [a * x + c * y + e, b * x + d * y + f]
  const ctx = {
    save: () => saved.push(m),
    restore: () => { m = saved.pop()! },
    translate: (x: number, y: number) => { m = [m[0], m[1], m[2], m[3], ...apply(m, x, y)] },
    rotate: (r: number) => {
      const [cos, sin] = [Math.cos(r), Math.sin(r)]
      m = [m[0] * cos + m[2] * sin, m[1] * cos + m[3] * sin, m[2] * cos - m[0] * sin, m[3] * cos - m[1] * sin, m[4], m[5]]
    },
    drawImage: (_: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => {
      for (let py = sy; py < sy + sh; py++) for (let px = sx; px < sx + sw; px++) {
        const [x, y] = apply(m, dx + (px + 0.5 - sx) * (dw / sw), dy + (py + 0.5 - sy) * (dh / sh))
        landed.set(`${px},${py}`, [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6])
      }
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, landed }
}

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a trimmed frame lies upright, its kept pixels moved by the trim', () => {
  const { ctx, landed } = recorder()
  // Kept pixels 3 across and 2 down at [1, 1] of a whole picture 5 by 4, at [10, 20] on the page.
  drawFrame(ctx, {} as CanvasImageSource, { box: [10, 20, 3, 2], rotated: false, trim: [1, 1, 3, 2] }, 100, 200, 2)
  expect(landed.get('10,20')).toEqual([100 + 1.5 * 2, 200 + 1.5 * 2])
  expect(landed.get('12,21')).toEqual([100 + 3.5 * 2, 200 + 2.5 * 2])
})

// OCT-24-EDITOR-ALPHA-SWEEP
test.skip('a frame turned a quarter clockwise on its page is drawn turned back, where its trim puts it', () => {
  const { ctx, landed } = recorder()
  // The same kept pixels stored turned: the box is their height across and their width down, and
  // upright pixel [u, v] lies on the page at [10 + 2 - 1 - v, 20 + u].
  drawFrame(ctx, {} as CanvasImageSource, { box: [10, 20, 2, 3], rotated: true, trim: [1, 1, 3, 2] }, 100, 200, 2)
  expect(landed.size).toBe(6)
  for (let v = 0; v < 2; v++) for (let u = 0; u < 3; u++) {
    expect(landed.get(`${10 + 1 - v},${20 + u}`)).toEqual([100 + (1 + u + 0.5) * 2, 200 + (1 + v + 0.5) * 2])
  }
})
