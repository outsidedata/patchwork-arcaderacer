// The measure of a sheet's frames (`loader.extension.tsx`), on pages this test draws. `slip` is
// checked against the export's own measure, written out here as the export has it, one inked pixel
// at a time.
import { expect, test } from 'vitest'
import { type Entry, type Frame, type Sheet } from './loader.sim.ts'
import { apart, check, feet, jsonsOf, namedIn, pairs, slip, stands, stillNamed, unrelated, verdict, type Pixels } from './loader.extension.tsx'

test('a catalogue\'s json entries, and where in them a name is named, which a name taken out is refused for unless the caller says anyway', () => {
  const assets = { a: { type: 'json', url: '/g/a.json' }, b: { type: 'json', url: '/g/b.json' }, s: { type: 'sheet', url: '/g/s.json' } } as Record<string, Entry>
  expect(jsonsOf(assets, 'g/a.json')).toEqual(['g/b.json'])
  const named = namedIn([{ path: 'g/b.json', value: { gun: { muzzle: 'x', list: ['y', 'x'], note: 'xx' } } }], 'x')
  expect(named).toEqual([{ file: 'g/b.json', at: ['gun', 'muzzle'] }, { file: 'g/b.json', at: ['gun', 'list', 1] }])
  expect(stillNamed('an effect', 'x', named, false)).toBe('x is named in 2 places, each of which would name an effect there is none of: g/b.json gun.muzzle, g/b.json gun.list.1; anyway takes it out all the same')
  expect(stillNamed('an effect', 'x', named, true)).toBeUndefined()
  expect(stillNamed('an effect', 'x', [], false)).toBeUndefined()
})

// diorama's tools/export.ts, `slip`, over frames on one page with anchors on the page.
function exported(img: Pixels, a: Frame, b: Frame) {
  const placed = (f: Frame) => ({ x: f.box[0], y: f.box[1], w: f.box[2], h: f.box[3], ax: f.box[0] + f.anchor[0], ay: f.box[1] + f.anchor[1] })
  const inkOf = (f: ReturnType<typeof placed>) => {
    const pts: number[] = []
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) if (img.data[(y * img.width + x) * 4 + 3] > 0) pts.push(x - Math.round(f.ax), y - Math.round(f.ay))
    return pts
  }
  const pa = inkOf(placed(a)), pb = inkOf(placed(b))
  if (!pa.length || !pb.length) return { miss: 1, dx: 0, dy: 0 }
  const key = (x: number, y: number) => (x + 4096) * 8192 + (y + 4096)
  const onA = new Set<number>()
  for (let i = 0; i < pa.length; i += 2) onA.add(key(pa[i], pa[i + 1]))
  const total = pa.length / 2 + pb.length / 2
  let best = { miss: Infinity, dx: 0, dy: 0 }
  for (let dy = -8; dy <= 8; dy++)
    for (let dx = -8; dx <= 8; dx++) {
      let both = 0
      for (let i = 0; i < pb.length; i += 2) if (onA.has(key(pb[i] + dx, pb[i + 1] + dy))) both++
      const miss = (total - 2 * both) / total
      if (miss < best.miss - 1e-9 || (Math.abs(miss - best.miss) < 1e-9 && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))) best = { miss, dx, dy }
    }
  return best
}

test('slip gives the export\'s shift and miss for every pair, one drawing or not', () => {
  // Six frames: a body, the body moved in its box, the body moved with more drawn on it, the body
  // moved the most the export looks, something else, and nothing; each anchored somewhere else.
  const { pixels, ink } = page(32 * 6, 32)
  const body = (k: number, dx: number, dy: number) => { ink(k * 32 + 11 + dx, 10 + dy, 10, 14); ink(k * 32 + 9 + dx, 14 + dy, 14, 4); ink(k * 32 + 12 + dx, 6 + dy, 3, 3) }
  body(0, 0, 0)
  body(1, 3, -1)
  body(2, -2, 2)
  ink(2 * 32 + 20, 22, 6, 6)
  body(3, 5, 4)
  ink(4 * 32 + 2, 2, 28, 3)
  ink(4 * 32 + 4, 26, 4, 4)
  const frames = [frame('0', 0), frame('1', 1, [15, 31]), frame('2', 2, [17, 30]), frame('3', 3, [12, 28]), frame('4', 4, [16, 16]), frame('5', 5)]
  for (const a of frames)
    for (const b of frames) expect(slip(pixels, a, pixels, b), `${a.id} → ${b.id}`).toEqual(exported(pixels, a, b))
})

// The one set of thresholds: a verdict agrees with `apart` and `unrelated` at every miss.
test('verdict says a miss in words, on the thresholds apart and unrelated use', () => {
  expect([0, 0.15, 0.17, 0.2, 0.59, 0.6, 1].map(verdict)).toEqual(['one drawing', 'one drawing', 'unsure', 'two drawings', 'two drawings', 'unrelated', 'unrelated'])
  for (const miss of [0, 0.15, 0.16, 0.5, 0.6, 0.9]) {
    expect(apart({ miss, dx: 3, dy: 0 })).toBe(verdict(miss) === 'one drawing')
    expect(unrelated({ miss, dx: 0, dy: 0 })).toBe(verdict(miss) === 'unrelated')
  }
})

// ---------------------------------------------------------------- a sheet this test draws

// A page `w` × `h`, every pixel clear, with `ink` to draw rectangles on it in a colour.
function page(w: number, h: number) {
  const data = new Uint8ClampedArray(w * h * 4)
  const ink = (x: number, y: number, rw: number, rh: number, rgb: [number, number, number] = [200, 50, 50]) => {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) data.set([...rgb, 255], (j * w + i) * 4)
  }
  return { pixels: { width: w, height: h, data }, ink }
}

// Frames 32 × 32 in a row along the page, whole and upright, each anchored on its bottom middle.
const frame = (id: string, k: number, anchor: [number, number] = [16, 32]): Frame => ({ id, page: 0, box: [k * 32, 0, 32, 32], rotated: false, size: [32, 32], trim: [0, 0, 32, 32], anchor })
const sheetOf = (frames: Frame[], clips: Sheet['clips'], slices: Sheet['slices'] = {}): Sheet => ({
  pages: ['page.png'], nearest: true, facing: { first: 0, step: 0, mirror: false },
  frames: Object.fromEntries(frames.map(f => [f.id, f])), order: frames.map(f => f.id), clips, slices,
})

test('one drawing left apart, two unrelated, feet off the line and a slice short of a heading are each found and said', () => {
  const { pixels, ink } = page(32 * 6, 32)
  // A body 10 wide, feet on the bottom row: frame 0 in the middle, frame 1 the same drawing 4 px to
  // the right in its box, frame 2 something else, frame 3 the body again 2 px above the bottom.
  const body = (k: number, dx: number, dy: number) => { ink(k * 32 + 11 + dx, 12 + dy, 10, 20); ink(k * 32 + 9 + dx, 16 + dy, 14, 4) }
  body(0, 0, 0)
  body(1, 4, 0)
  ink(2 * 32 + 2, 2, 28, 3)
  body(3, 0, -2)
  body(4, 0, 0)
  const s = sheetOf([0, 1, 2, 3, 4].map(k => frame(String(k), k)), {
    walk: { loop: false, runs: [['0', '1']] },
    odd: { loop: false, runs: [['0', '2']] },
    lift: { loop: false, runs: [['3', '3']] },
    idle: { loop: true, runs: [['0'], ['4']] },
  }, { muzzle: [{ frame: 0, bounds: [20, 14, 1, 1] }] })

  expect(pairs(s, [pixels], 'walk', 0)).toEqual([{ from: 0, to: 1, slip: { miss: 0, dx: -4, dy: 0 } }])
  expect(feet(pixels, s.frames['3'])).toEqual({ feet: 30 })
  const got = check(s, [pixels])
  expect(got.stands).toBe('lines')
  expect(got.problems).toEqual([
    { clip: 'walk', run: 0, kind: 'apart', what: 'frame 1 is one drawing with frame 0 but -4,0 off it' },
    { clip: 'odd', run: 0, kind: 'unrelated', what: expect.stringMatching(/^frames 0 and 1 look unrelated \(miss 0\.\d\d\)$/) },
    { clip: 'lift', run: 0, kind: 'line', what: 'lowest feet 2 px above the line' },
    { clip: 'idle', kind: 'slice', what: 'slice muzzle has no key on run 1' },
  ])
  // Said to travel, a clip's neighbours are not compared; its line still is.
  expect(check(s, [pixels], ['walk', 'odd', 'lift']).problems.map(p => p.kind)).toEqual(['line', 'slice'])
})

test('a sheet with a clip of shadow ink stands in the air; one with no run on its line stands on nothing; a turned frame is read turned back', () => {
  const { pixels, ink } = page(32 * 3, 32)
  ink(8, 4, 16, 8)
  ink(32 + 6, 10, 20, 6, [0, 0, 0])
  const flown = sheetOf([frame('0', 0, [16, 8]), frame('1', 1, [16, 13])], { still: { loop: true, runs: [['0']] }, shadow: { loop: true, runs: [['1']] } })
  expect(check(flown, [pixels])).toEqual({ stands: 'air', shadows: ['shadow'], problems: [] })
  const sparks = sheetOf([frame('0', 0, [16, 8])], { spark: { loop: true, runs: [['0']] } })
  expect(check(sparks, [pixels])).toEqual({ stands: 'nothing', shadows: [], problems: [] })

  // Frame 2 is frame 0's picture stored turned a quarter clockwise: drawn back, it is one drawing.
  const turned = page(32 * 3, 32)
  turned.ink(8, 4, 16, 8)
  const [x, y, w, h] = [8, 4, 16, 8]
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) turned.ink(64 + (32 - 1 - (y + v)), x + u, 1, 1)
  const a = frame('0', 0, [16, 8]), b: Frame = { id: '2', page: 0, box: [64, 0, 32, 32], rotated: true, size: [32, 32], trim: [0, 0, 32, 32], anchor: [16, 8] }
  expect(slip(turned.pixels, a, turned.pixels, b)).toEqual({ miss: 0, dx: 0, dy: 0 })
})

test('a hovering body stands on its shadow\'s middle, a walking one on its feet', () => {
  const { pixels, ink } = page(32 * 2, 32)
  // Frame 0 a body 4 px above a shadow 4 rows deep, anchored on the shadow's middle; frame 1 a body
  // whose feet are on the bottom row, anchored there.
  ink(8, 4, 16, 16)
  ink(6, 24, 20, 4, [0, 0, 0])
  ink(32 + 8, 12, 16, 20)
  const s = sheetOf([frame('0', 0, [16, 26]), frame('1', 1)], { still: { loop: true, runs: [['0']] }, walk: { loop: true, runs: [['1']] } })
  expect(feet(pixels, s.frames['0'])).toEqual({ feet: 20, shadow: 26 })
  expect(stands(s, [pixels], s.clips.still.runs[0], false).on).toBe('shadow')
  expect(stands(s, [pixels], s.clips.walk.runs[0], false).on).toBe('feet')
})
