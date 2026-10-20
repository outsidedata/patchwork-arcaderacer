// The level's questions, asked of Tiled maps the test writes as text: a tileset of 16-pixel tiles
// with collision shapes as the grass tileset has them, laid out a row of characters to a row of
// cells, and read by the loader as the game's would be. A box is 0.75 cells across and 1 down, a
// small hero. Moving is a sweep along x and then one along y, as a rule moves a thing a step.
import { expect, test } from 'vitest'
import { readMap } from '#plugins/loader/loader.sim.ts'
import { blocked, clear, objects, overlaps, slide, solidAt, sweep, tileAt, tileOfType, type Box, type Edits, type Hit } from './tilemap.sim.ts'

const rect = (x: number, y: number, w: number, h: number, type = '') => ({ id: 1, x, y, width: w, height: h, type })
const poly = (points: number[][], type = '') => ({ id: 1, x: 0, y: 0, polygon: points.map(([x, y]) => ({ x, y })), type })
const shapes = (...objects: any[]) => ({ objectgroup: { type: 'objectgroup', objects } })

// The tiles, by the character that lays one.
const TILESET = {
  name: 't', tilewidth: 16, tileheight: 16, tilecount: 12, columns: 4, image: 't.png', imagewidth: 64, imageheight: 48,
  tiles: [
    { id: 0, type: 'ground', ...shapes(rect(0, 0, 16, 16)) },
    { id: 1, ...shapes(poly([[0, 16], [16, 0], [16, 16]])) },
    { id: 2, ...shapes(poly([[0, 0], [16, 16], [0, 16]])) },
    { id: 3, ...shapes(poly([[0, 16], [16, 8], [16, 16]])) },
    { id: 4, ...shapes(poly([[0, 8], [16, 0], [16, 16], [0, 16]])) },
    { id: 5, type: 'ledge', ...shapes(rect(0, 0, 16, 16, 'top')) },
    { id: 6, type: 'coin' },
    { id: 7, ...shapes(poly([[0, 16], [16, 0], [16, 16]], 'top')) },
    { id: 8, type: 'question', ...shapes(rect(0, 0, 16, 16)) },
    { id: 9, ...shapes(poly([[0, 0], [16, 8], [16, 16], [0, 16]])) },
    { id: 10, ...shapes(poly([[0, 8], [16, 16], [0, 16]])) },
    { id: 11, type: 'coin' },
  ],
}
const GIDS: Record<string, number> = { '#': 1, '/': 2, '\\': 3, a: 4, b: 5, '=': 6, o: 7, '^': 8, '?': 9, c: 10, d: 11 }

// A map of one tile layer, `ground`, laid out by rows of characters, and any other layers.
function level(rows: string[], more: any[] = [], map: any = {}) {
  const width = Math.max(...rows.map(r => r.length))
  const data = rows.flatMap(r => [...r.padEnd(width, '.')].map(ch => GIDS[ch] ?? 0))
  return readMap({
    type: 'map', orientation: 'orthogonal', width, height: rows.length, tilewidth: 16, tileheight: 16, infinite: false,
    tilesets: [{ firstgid: 1, ...TILESET }],
    layers: [{ type: 'tilelayer', name: 'ground', width, height: rows.length, data, visible: true, opacity: 1, x: 0, y: 0 }, ...more],
    ...map,
  }, '/t.tmj')
}

const W = 0.75, H = 1
const at = (x: number, y: number): Box => ({ x, y, w: W, h: H })

// A step: along x by dx, then along y by dy, each swept; every hit of both.
function step(map: ReturnType<typeof level>, box: Box, dx: number, dy: number, edits?: Edits, solids?: Box[]): { box: Box; hits: Hit[] } {
  const a = sweep(map, edits, box, 0, box.x + dx, solids)
  const b = sweep(map, edits, a.box, 1, a.box.y + dy, solids)
  return { box: b.box, hits: [...a.hits, ...b.hits] }
}

const FLOOR = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '##############################',
  '##############################',
]

test('a box falling onto the floor lands on it, and resting there it stays exactly where it landed', () => {
  const map = level(FLOOR)
  const landed = sweep(map, {}, at(4.5, 5), 1, 9.6)
  expect(landed.box).toEqual(at(4.5, 9))
  expect(landed.hits).toEqual([{ side: 'bottom', cell: [4, 10], tile: 1, solid: -1, type: 'ground', slope: 0 }, { side: 'bottom', cell: [5, 10], tile: 1, solid: -1, type: 'ground', slope: 0 }])
  // A box whose size rounds, resting for ten seconds of steps under gravity: never a hair lower.
  let box: Box = { x: 3.3, y: 10 - 0.3, w: 0.3, h: 0.3 }
  const rest = box.y
  for (let i = 0; i < 600; i++) {
    const s = step(map, box, 0, 0.05)
    box = s.box
    expect(box.y).toBe(rest)
    expect(s.hits.some(h => h.side === 'bottom')).toBe(true)
  }
})

test('a box a rounding error inside the floor or a wall is put back touching it', () => {
  const map = level(['.#', '##'])
  expect(sweep(map, {}, at(0, 1 - H + 1e-12), 1, 1 - H + 0.1).box.y).toBe(1 - H)
  const inWall = sweep(map, {}, { x: 1 - W + 1e-12, y: 0.3, w: W, h: 0.4 }, 0, 1)
  expect(inWall.box.x).toBe(1 - W)
  expect(inWall.hits.map(h => [h.side, h.cell])).toEqual([['right', [1, 0]]])
})

test('walking along a floor of many tiles, a box never meets a wall at the seams between them', () => {
  const map = level(FLOOR)
  let box = at(0.5, 9)
  for (let i = 0; i < 200; i++) {
    const s = step(map, box, 0.13, 0.05)
    expect(s.hits.filter(h => h.side !== 'bottom')).toEqual([])
    box = s.box
    expect(box.y).toBe(9)
  }
  expect(box.x).toBeCloseTo(0.5 + 200 * 0.13, 9)
  // And back, in the air a hair over it: no seam catches a box that is not standing either.
  box = { ...box, y: 9 - 1e-12 }
  for (let i = 0; i < 50; i++) box = sweep(map, {}, box, 0, box.x - 0.2).box
  expect(box.x).toBeCloseTo(0.5 + 200 * 0.13 - 10, 9)
})

test('a wall stops a box at its face from either side, and a box against it slides up and down it', () => {
  const map = level([
    '..........',
    '.....#....',
    '.....#....',
    '.....#....',
    '##########',
  ])
  let s = sweep(map, {}, at(2, 3), 0, 6)
  expect(s.box.x).toBe(5 - W)
  expect(s.hits).toEqual([{ side: 'right', cell: [5, 3], tile: 1, solid: -1, type: 'ground', slope: 0 }, { side: 'bottom', cell: [4, 4], tile: 1, solid: -1, type: 'ground', slope: 0 }])
  s = sweep(map, {}, at(8, 3), 0, 3)
  expect(s.box.x).toBe(6)
  expect(s.hits[0]).toMatchObject({ side: 'left', cell: [5, 3] })
  // Up and down its three stacked cells, touching it: nothing stops it but the floor.
  let box = at(5 - W, 3)
  for (let i = 0; i < 20; i++) {
    const up = sweep(map, {}, box, 1, box.y - 0.1)
    expect(up.hits).toEqual([])
    box = up.box
  }
  expect(sweep(map, {}, box, 0, 5).box.x).toBe(5 - W)
  expect(sweep(map, {}, box, 1, 3.5).box.y).toBe(3)
  // In the air, spanning the seam between two of its cells, both stop it.
  const across = sweep(map, {}, at(3, 1.5), 0, 5)
  expect(across.box.x).toBe(5 - W)
  expect(across.hits.map(h => h.cell)).toEqual([[5, 1], [5, 2]])
})

test('a ceiling stops a box rising into it, and nothing stops it rising where there is none', () => {
  const map = level(['......', '######', '......', '......', '......', '######'])
  const s = sweep(map, {}, at(2.5, 4), 1, 0)
  expect(s.box.y).toBe(2)
  expect(s.hits).toEqual([{ side: 'top', cell: [2, 1], tile: 1, solid: -1, type: 'ground', slope: 0 }, { side: 'top', cell: [3, 1], tile: 1, solid: -1, type: 'ground', slope: 0 }])
  expect(sweep(map, {}, at(2.5, 4), 1, 2.5)).toEqual({ box: at(2.5, 2.5), hits: [] })
})

// The height of the ground under x of a run of slopes that starts at `from`, rising `rise` a cell,
// between the floor at 10 and a plateau `cells` × `rise` higher.
const ground = (x: number, from: number, cells: number, rise: number) => 10 - rise * Math.min(Math.max(x - from, 0), cells)

for (const [name, run, rise, slope] of [['45°', '/', 1, -1], ['22.5°', 'ab', 0.5, -0.5]] as const) {
  test(`a ${name} slope carries a box up it and down it, its feet on the surface every step and never in the air`, () => {
    const map = level([
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      `..........${run}#################`.slice(0, 30),
      '##############################',
      '##############################',
    ])
    const top = 10 + run.length
    for (const speed of [0.07, 0.25]) {
      let box = at(6, 9)
      while (box.x < top + 2) {
        const s = step(map, box, speed, 0.05)
        box = s.box
        const feet = box.x + W / 2
        expect(box.y + H).toBeCloseTo(ground(feet, 10, run.length, rise), 9)
        expect(s.hits.filter(h => h.side !== 'bottom')).toEqual([])
        const under = s.hits.find(h => h.side === 'bottom')!
        expect(under).toBeDefined()
        if (feet > 10.01 && feet < top - 0.01) expect(under.slope).toBe(slope)
      }
      while (box.x > 5) {
        const s = sweep(map, {}, box, 0, box.x - speed)
        box = s.box
        expect(box.y + H).toBeCloseTo(ground(box.x + W / 2, 10, run.length, rise), 9)
        expect(s.hits.filter(h => h.side !== 'bottom')).toEqual([])
        expect(s.hits.some(h => h.side === 'bottom')).toBe(true)
      }
    }
  })
}

test('slopes falling to the right carry a box down them and up them, 45° and 22.5°', () => {
  const map = level([
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '##########\\.......',
    '###########cd.....',
    '##################',
  ])
  // From the top at 5, down the 45° cell to 6 and on down the 22.5° pair to 7.
  const surface = (x: number) => (x <= 10 ? 5 : x <= 11 ? 5 + (x - 10) : 6 + 0.5 * Math.min(x - 11, 2))
  const slopes: number[] = []
  let box = at(7, 4)
  while (box.x < 15) {
    const s = sweep(map, {}, box, 0, box.x + 0.1)
    box = s.box
    expect(box.y + H).toBeCloseTo(surface(box.x + W / 2), 9)
    expect(s.hits.filter(h => h.side !== 'bottom')).toEqual([])
    slopes.push(s.hits.find(h => h.side === 'bottom')!.slope)
  }
  expect(slopes.filter((s, i) => s !== slopes[i - 1])).toEqual([0, 1, 0.5, 0])
  while (box.x > 7) {
    box = sweep(map, {}, box, 0, box.x - 0.1).box
    expect(box.y + H).toBeCloseTo(surface(box.x + W / 2), 9)
  }
})

test('over a hill of two 45° slopes a box is carried up to its peak and down its far side without leaving it', () => {
  const map = level(['......', '......', '../\\..', '######'])
  const surface = (x: number) => 3 - Math.max(0, 1 - Math.abs(x - 3))
  let box = at(0.5, 2)
  while (box.x < 4.5) {
    const s = sweep(map, {}, box, 0, box.x + 0.1)
    box = s.box
    expect(box.y + H).toBeCloseTo(surface(box.x + W / 2), 9)
    expect(s.hits.filter(h => h.side !== 'bottom')).toEqual([])
  }
})

test('a box falling onto a slope lands with its feet on it, and sinks its lower corner into it', () => {
  const map = level(['....', '....', '../#', '####'])
  const s = sweep(map, {}, at(2, 0), 1, 3)
  const feet = 2 + W / 2
  expect(s.box.y + H).toBeCloseTo(3 - (feet - 2), 12)
  expect(s.hits).toEqual([{ side: 'bottom', cell: [2, 2], tile: 2, solid: -1, type: '', slope: -1 }])
})

test('the high side of a slope standing alone is a wall; its foot, met at the floor, is walked up', () => {
  const map = level(['......', '......', '.../..', '######'])
  const s = sweep(map, {}, at(5.1, 2), 0, 3)
  expect(s.box.x).toBe(4)
  expect(s.hits[0]).toEqual({ side: 'left', cell: [3, 2], tile: 2, solid: -1, type: '', slope: 0 })
  expect(sweep(map, {}, at(1.5, 2), 0, 2.5).hits.filter(h => h.side !== 'bottom')).toEqual([])
})

test('a slope met in the air above half the box from its feet is a wall; lower, the box is put onto it', () => {
  const map = level(['......', '..../.', '......', '######'])
  // Its foot is at [4, 2], in the air: a box whose feet are 0.6 under it meets that tip.
  const high = sweep(map, {}, at(3, 2.6 - H), 0, 4)
  expect(high.box.x).toBe(4 - W)
  expect(high.hits).toEqual([{ side: 'right', cell: [4, 1], tile: 2, solid: -1, type: '', slope: -1 }])
  // One whose feet are 0.1 under it goes on and stands on the slope.
  const low = sweep(map, {}, at(3.5, 2.1 - H), 0, 4)
  expect(low.box.x).toBe(4)
  expect(low.box.y + H).toBeCloseTo(2 - W / 2, 12)
  expect(low.hits).toEqual([{ side: 'bottom', cell: [4, 1], tile: 2, solid: -1, type: '', slope: -1 }])
})

test('a one-way ledge lets a box up through it and along beside it, and lands one falling onto it from above', () => {
  const map = level([
    '..........',
    '..........',
    '..........',
    '.....====.',
    '..........',
    '..........',
    '####################',
  ])
  const under = at(6, 5)
  const jumped = sweep(map, {}, under, 1, 2.5)
  expect(jumped).toEqual({ box: at(6, 2.5), hits: [] })
  // Falling again, its feet started under the ledge's top: it falls on through.
  expect(sweep(map, {}, jumped.box, 1, 5).box.y).toBe(5)
  // Along through it from the side.
  expect(sweep(map, {}, at(2, 3), 0, 7)).toEqual({ box: at(7, 3), hits: [] })
  // From above, it lands.
  const landed = sweep(map, {}, at(6.5, 1), 1, 2.8)
  expect(landed.box.y).toBe(2)
  expect(landed.hits).toEqual([{ side: 'bottom', cell: [6, 3], tile: 6, solid: -1, type: 'ledge', slope: 0 }, { side: 'bottom', cell: [7, 3], tile: 6, solid: -1, type: 'ledge', slope: 0 }])
  // Along it, it is carried; off its end, it walks off and falls.
  let box = landed.box
  for (let i = 0; i < 20; i++) box = step(map, box, 0.1, 0.05).box
  expect(box.y).toBe(2)
  for (let i = 0; i < 30; i++) box = step(map, box, 0.1, 0.2).box
  expect(box.y).toBe(5)
})

test('a one-way slope carries a box up from the floor, lands one from above, and lets one up through it from below', () => {
  const map = level(['......', '......', '......', '..^...', '######'])
  let box = at(0.5, 3)
  for (let i = 0; i < 18; i++) box = step(map, box, 0.1, 0.05).box
  expect(box.y + H).toBeCloseTo(4 - (box.x + W / 2 - 2), 9)
  const from = sweep(map, {}, at(2, 0), 1, 3)
  expect(from.box.y + H).toBeCloseTo(4 - W / 2, 12)
  expect(from.hits[0]).toMatchObject({ side: 'bottom', cell: [2, 3], slope: -1 })
  // A box in the floor's row beside it, whose feet are under it, jumps up through it.
  expect(sweep(map, {}, at(2, 3), 1, 1).box.y).toBe(1)
})

test('an edit taking a tile away opens a hole a box falls through, and one putting a tile in makes a wall', () => {
  const map = level(FLOOR)
  const edits: Edits = { 'ground:6,10': -1, 'ground:6,11': -1, 'ground:9,9': 9 }
  expect(sweep(map, edits, at(6.1, 9), 1, 20).box.y).toBe(20)
  expect(sweep(map, {}, at(6.1, 9), 1, 20).box.y).toBe(9)
  const wall = sweep(map, edits, at(7.5, 9), 0, 10)
  expect(wall.box.x).toBe(9 - W)
  expect(wall.hits[0]).toEqual({ side: 'right', cell: [9, 9], tile: 9, solid: -1, type: 'question', slope: 0 })
  expect(tileAt(map, edits, 'ground', 9, 9)).toBe(9)
  expect(tileAt(map, edits, 'ground', 6, 10)).toBe(0)
  expect(tileAt(map, undefined, 'ground', 6, 10)).toBe(1)
})

test('a solid handed in from a row is ground, wall and ceiling like a tile, with no cell and no tile', () => {
  const map = level(FLOOR)
  const platform: Box = { x: 4, y: 7, w: 2, h: 0.5 }
  const landed = sweep(map, {}, at(4.5, 5), 1, 9, [platform])
  expect(landed.box.y).toBe(6)
  expect(landed.hits).toEqual([{ side: 'bottom', cell: null, tile: 0, solid: 0, type: '', slope: 0 }])
  expect(sweep(map, {}, at(4.5, 7.8), 1, 5, [platform]).box.y).toBe(7.5)
  expect(sweep(map, {}, at(1, 6.8), 0, 5, [platform]).box.x).toBe(4 - W)
})

test('solidAt says whether a box reaches into a tile\'s collision: resting on it or beside it is clear, a slope counts where it rises, a one-way shape and a tile with none never', () => {
  const map = level([
    '......',
    '..o=/.',
    '######',
  ])
  expect(solidAt(map, {}, { x: 0, y: 1, w: 1, h: 1 })).toBe(false)
  expect(solidAt(map, {}, { x: 0, y: 1.5, w: 1, h: 0.6 })).toBe(true)
  // A coin tile has no shape; a one-way ledge is stood on, never in.
  expect(solidAt(map, {}, { x: 2, y: 1, w: 1, h: 1 })).toBe(false)
  expect(solidAt(map, {}, { x: 3, y: 1, w: 1, h: 1 })).toBe(false)
  // The slope from its bottom left to its top right: its top left corner is clear, its bottom right
  // is not; the box beside the wall is clear.
  expect(solidAt(map, {}, { x: 4, y: 1, w: 0.4, h: 0.4 })).toBe(false)
  expect(solidAt(map, {}, { x: 4.6, y: 1.6, w: 0.4, h: 0.4 })).toBe(true)
  expect(solidAt(map, {}, { x: 5, y: 0, w: 1, h: 2 })).toBe(false)
})

test('two solids met at once are two hits, each naming its place in the solids handed in', () => {
  const map = level(FLOOR)
  const left: Box = { x: 3, y: 4, w: 1, h: 1 }, right: Box = { x: 4, y: 4, w: 1, h: 1 }, apart: Box = { x: 8, y: 4, w: 1, h: 1 }
  const rose = sweep(map, {}, at(3.6, 7), 1, 3, [apart, left, right])
  expect(rose.box.y).toBe(5)
  expect(rose.hits).toEqual([
    { side: 'top', cell: null, tile: 0, solid: 1, type: '', slope: 0 },
    { side: 'top', cell: null, tile: 0, solid: 2, type: '', slope: 0 },
  ])
})

test('standing, a box steps up onto anything lower than half its width; in the air, the same thing is a wall', () => {
  const map = level(FLOOR)
  const kerb: Box = { x: 12, y: 9.75, w: 3, h: 0.25 }
  let box = at(10, 9)
  for (let i = 0; i < 30; i++) {
    const s = step(map, box, 0.1, 0.05, {}, [kerb])
    expect(s.hits.filter(h => h.side !== 'bottom')).toEqual([])
    box = s.box
  }
  expect(box.y).toBe(9.75 - H)
  const flying = sweep(map, {}, at(10, 8.9), 0, 13, [kerb])
  expect(flying.box.x).toBe(12 - W)
  expect(flying.hits[0]).toMatchObject({ side: 'right', cell: null })
})

test('a box whose feet a slope would lift into a ceiling stays where it was, touching the side it moved toward', () => {
  const map = level(['..........', '..........#####', '........../####', '###############'])
  let box = at(8, 2)
  let last: Hit[] = []
  for (let i = 0; i < 20; i++) {
    const s = step(map, box, 0.1, 0.05)
    box = s.box
    last = s.hits
  }
  expect(box.x + W / 2).toBeLessThanOrEqual(10)
  expect(box.y).toBe(2)
  expect(last).toContainEqual({ side: 'right', cell: [10, 1], tile: 1, solid: -1, type: 'ground', slope: 0 })
})

test('a flipped tile collides as its picture is drawn: a slope flipped across is the slope falling the other way', () => {
  const flipped = level(['....', '....', '####'])
  const layer = flipped.layers[0] as any
  layer.data[1 * 4 + 1] = 2
  layer.flips[1 * 4 + 1] = 4
  const mirrored = level(['....', '.\\..', '####'])
  for (const x of [0.8, 1, 1.2, 1.5]) {
    const a = sweep(flipped, {}, at(x, -1), 1, 5), b = sweep(mirrored, {}, at(x, -1), 1, 5)
    expect(a.box.y).toBeCloseTo(b.box.y, 12)
    expect(a.hits[0].slope).toBe(b.hits[0].slope)
  }
  // Across its diagonal, the low 22.5° cell rising to the right stands up as a wedge on the cell's
  // right side, 8 pixels across at its foot and the whole cell high at its right edge: steeper than
  // 45°, so a box lands on its highest point under the box's bottom edge.
  layer.data[1 * 4 + 1] = 4
  layer.flips[1 * 4 + 1] = 1
  const wedge = sweep(flipped, {}, at(1.5 - W / 2, -1), 1, 5)
  expect(wedge.box.y + H).toBeCloseTo(2 - 2 * (1.5 + W / 2 - 1.5), 6)
  expect(wedge.hits[0]).toMatchObject({ cell: [1, 1], slope: -2 })
  expect(sweep(flipped, {}, at(2 - W / 2 - 0.01, -1), 1, 5).box.y + H).toBe(1)
})

test('a layer that is hidden collides, and a layer moved by its offset collides where it is moved to', () => {
  const map = level(['......', '######'], [
    { type: 'tilelayer', name: 'hidden', width: 6, height: 2, data: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], visible: false, opacity: 1 },
    { type: 'tilelayer', name: 'moved', width: 6, height: 2, data: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], offsetx: 8, offsety: -8, visible: true, opacity: 1 },
  ])
  expect(sweep(map, {}, at(2, 0), 0, 5).box.x).toBe(4 - W)
  // The moved layer's tile is over [0.5, 1.5] across and [-0.5, 0.5] down.
  expect(sweep(map, {}, at(0.7, -3), 1, 0).box.y).toBe(-0.5 - H)
  expect(sweep(map, {}, at(1.5, -0.2), 0, 1).box.x).toBe(1.5)
})

test('in an isometric map a tile with any collision shape is its whole cell', () => {
  const map = readMap({
    type: 'map', orientation: 'isometric', width: 3, height: 1, tilewidth: 64, tileheight: 32, infinite: false,
    tilesets: [{ firstgid: 1, ...TILESET }],
    layers: [{ type: 'tilelayer', name: 'ground', width: 3, height: 1, data: [0, 7, 3], visible: true, opacity: 1 }],
  }, '/iso.tmj')
  const box = { x: 0.2, y: 0.3, w: 0.4, h: 0.4 }
  expect(sweep(map, {}, box, 0, 1.5).box.x).toBe(1.5)
  expect(sweep(map, {}, box, 0, 2.5).box.x).toBe(2 - 0.4)
})

test('overlaps is every tile of every layer whose cell a box overlaps, collision or not, a box touching a cell overlapping none of it', () => {
  const map = level(['..o.', '..?.', '####'], [{ type: 'tilelayer', name: 'coins', width: 4, height: 3, data: [0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 0], visible: false, opacity: 1 }])
  expect(overlaps(map, {}, { x: 2.5, y: 0.2, w: 1, h: 0.5 })).toEqual([
    { layer: 'ground', cell: [2, 0], tile: 7, type: 'coin' },
    { layer: 'coins', cell: [3, 0], tile: 12, type: 'coin' },
  ])
  expect(overlaps(map, {}, { x: 3, y: 1, w: 1, h: 1 })).toEqual([])
  expect(overlaps(map, { 'ground:2,0': -1 }, { x: 2.5, y: 0.2, w: 0.2, h: 0.2 })).toEqual([])
  expect(overlaps(map, {}, { x: 1.5, y: 1.5, w: 1, h: 1 }).map(o => o.cell)).toEqual([[2, 1], [1, 2], [2, 2]])
})

test('tileAt is a cell\'s gid, 0 off the layer, and throws for a layer the map has not', () => {
  const map = level(['#?'])
  expect([tileAt(map, {}, 'ground', 1, 0), tileAt(map, {}, 'ground', 2, 0), tileAt(map, {}, 'ground', 0, -1)]).toEqual([9, 0, 0])
  expect(tileAt(map, { 'ground:5,5': 3 }, 'ground', 5, 5)).toBe(3)
  expect(() => tileAt(map, {}, 'sky', 0, 0)).toThrow('the map has no tile layer sky')
})

test('tileOfType is the first gid of a type, and throws for a type no tile has', () => {
  const map = level(['#'])
  expect(tileOfType(map, 'coin')).toBe(7)
  expect(tileOfType(map, 'question')).toBe(9)
  expect(() => tileOfType(map, 'berry')).toThrow('the map has no tile of type berry')
})

test('objects are every object layer\'s, or one layer\'s, in cells', () => {
  const map = level(['#'], [
    { type: 'objectgroup', name: 'spawns', objects: [{ id: 3, name: 'start', type: 'hero', x: 32, y: 48, width: 16, height: 16, properties: [{ name: 'lives', type: 'int', value: 3 }] }] },
    { type: 'objectgroup', name: 'items', objects: [{ id: 4, name: '', x: 16, y: 32, width: 16, height: 16, gid: 9 }] },
  ])
  expect(objects(map, 'spawns')).toEqual([{ id: 3, name: 'start', type: 'hero', x: 2, y: 3, w: 1, h: 1, visible: true, properties: { lives: 3 } }])
  expect(objects(map).map(o => [o.id, o.type, o.x, o.y])).toEqual([[3, 'hero', 2, 3], [4, 'question', 1, 1]])
  expect(() => objects(map, 'foes')).toThrow('the map has no object layer foes')
})

// ---------------------------------------------------------------- a mover on the grid

// Four cells across and three down: a floor layer of tiles without collision with a hole at [3, 2],
// and a layer of things with one tile with collision at [2, 1].
const floorOf = (rows: string[][], things: string[][], map: any = {}) => readMap({
  type: 'map', orientation: 'isometric', width: 4, height: 3, tilewidth: 64, tileheight: 32, infinite: false,
  tilesets: [{ firstgid: 1, name: 'g', tilewidth: 64, tileheight: 32, tilecount: 2, columns: 2, image: 'g.png', imagewidth: 128, imageheight: 32,
    tiles: [{ id: 1, ...shapes(rect(0, 0, 64, 32)) }] }],
  layers: [
    { type: 'tilelayer', name: 'floor', width: 4, height: 3, data: rows.flat().map(ch => (ch === 'g' ? 1 : 0)), visible: true, opacity: 1 },
    { type: 'tilelayer', name: 'things', width: 4, height: 3, data: things.flat().map(ch => (ch === 'B' ? 2 : 0)), visible: true, opacity: 1 },
  ],
  ...map,
}, '/grid.tmj')
const grid = (rows: string[]) => rows.map(r => [...r])
const generated = floorOf(grid(['gggg', 'gg.g', 'ggg.']), grid(['....', '..B.', '....']))
const R = 0.25

test('a cell blocks outside the map, with no tile on any tile layer, or with a tile with collision on any', () => {
  expect(blocked(generated, {}, 0, 0)).toBe(false)
  expect(blocked(generated, {}, 3, 1)).toBe(false)
  for (const [c, r] of [[-1, 0], [0, -1], [4, 0], [0, 3]]) expect(blocked(generated, {}, c, r)).toBe(true)
  expect(blocked(generated, {}, 3, 2)).toBe(true)
  expect(blocked(generated, {}, 2, 1)).toBe(true)
})

test('a cell blocks as the row\'s edits leave it', () => {
  expect(blocked(generated, { 'floor:0,0': -1 }, 0, 0)).toBe(true)
  expect(blocked(generated, { 'things:2,1': -1 }, 2, 1)).toBe(true)
  expect(blocked(generated, { 'things:2,1': -1, 'floor:2,1': 1 }, 2, 1)).toBe(false)
  expect(blocked(generated, { 'things:0,0': 2 }, 0, 0)).toBe(true)
})

test('a layer moved by a part of a cell has no cells to answer for', () => {
  const moved = floorOf(grid(['gggg', 'gggg', 'gggg']), grid(['....', '....', '....']))
  ;(moved.layers[1] as any).shift = [0.5, 0]
  expect(() => blocked(moved, {}, 0, 0)).toThrow('the tile layer things is moved off the grid')
})

test('a mover stops a radius short of a cell that blocks, and goes all the way where none does', () => {
  expect(slide(generated, {}, [1, 1.5], 0, 1.9, R)).toBe(2 - R)
  expect(slide(generated, {}, [2.5, 0.5], 1, 0.9, R)).toBe(1 - R)
  expect(slide(generated, {}, [0.5, 0.5], 0, -1, R)).toBe(R)
  expect(slide(generated, {}, [0.5, 2.5], 1, 4, R)).toBe(3 - R)
  expect(slide(generated, {}, [0.5, 0.5], 0, 3.2, R)).toBe(3.2)
  expect(slide(generated, {}, [1.5, 1.5], 0, 0.5, R)).toBe(0.5)
})

test('beside a cell, a mover passes it; by its corner it stops where the circle touches the corner', () => {
  expect(slide(generated, {}, [1, 0.7], 0, 3, R)).toBe(3)
  const off = 1 - 0.85
  expect(slide(generated, {}, [1, 0.85], 0, 3, R)).toBeCloseTo(2 - Math.sqrt(R * R - off * off), 12)
})

test('a mover that starts a rounding error inside a cell that blocks moves out of it, never deeper', () => {
  const inside = 2 - R + 1e-12
  expect(slide(generated, {}, [inside, 1.5], 0, inside + 0.1, R)).toBe(inside)
  expect(slide(generated, {}, [inside, 1.5], 0, 1.2, R)).toBe(1.2)
})

test('a mover a stop left touching a wall of many cells slides along it past every seam between them', () => {
  const r = 0.3
  const pos = [0.5, 2]
  pos[1] = slide(generated, {}, pos, 1, 3.5, r)
  expect(pos[1]).toBe(3 - r)
  expect(3 - pos[1]).toBeLessThan(r)
  pos[0] = slide(generated, {}, pos, 0, 2.6, r)
  expect(pos[0]).toBe(2.6)
  expect(slide(generated, {}, pos, 0, 3.5, r)).toBe(3 - r)
})

test('a mover is clear where no cell that blocks is nearer than its radius, and not where one is', () => {
  expect(clear(generated, {}, [0.5, 0.5], R)).toBe(true)
  expect(clear(generated, {}, [1.5, 1.5], R)).toBe(true)
  // Over the edge of the map, into the hole at [3, 2], into the thing at [2, 1].
  expect(clear(generated, {}, [0.1, 0.5], R)).toBe(false)
  expect(clear(generated, {}, [2.9, 2.5], R)).toBe(false)
  expect(clear(generated, {}, [1.9, 1.5], R)).toBe(false)
  // By the thing's corner: clear where the circle falls short of the corner, not where it reaches it.
  const d = (R / Math.SQRT2) * 1.01
  expect(clear(generated, {}, [2 - d, 1 - d], R)).toBe(true)
  expect(clear(generated, {}, [2 - d / 1.1, 1 - d / 1.1], R)).toBe(false)
  // As the row's edits leave the cells.
  expect(clear(generated, { 'things:2,1': -1, 'floor:2,1': 1 }, [1.9, 1.5], R)).toBe(true)
})

test('a mover a stop left touching a cell that blocks is clear of it', () => {
  for (const [pos, axis, to] of [[[1, 1.5], 0, 1.9], [[2.5, 0.5], 1, 0.9], [[0.5, 0.5], 0, -1], [[0.5, 2], 1, 3.5], [[1, 0.85], 0, 3]] as [number[], 0 | 1, number][]) {
    for (const r of [R, 0.3]) {
      const at = [...pos]
      at[axis] = slide(generated, {}, pos, axis, to, r)
      expect(clear(generated, {}, at, r), `${pos} along ${axis} to ${to}`).toBe(true)
    }
  }
})

test('a mover a stop left touching a cell\'s corner is clear of it, however the square roots round', () => {
  // Stopped rising under the thing's bottom left corner, a little left of it: the stop reaches the
  // corner by the across it is off, and the clear works back from the down, and at the corner the two
  // square roots agree only to within a rounding error (a boid of the ecco bay, off by 0.0171).
  for (const off of [0.01714567508571, 0.001, 0.05, 0.1234567, 0.1999, 0.2 - 1e-9]) {
    for (let k = 0; k < 50; k++) {
      const r = 0.2, at = [2 - off, 2.5 + k * 0.005]
      at[1] = slide(generated, {}, at, 1, 1.5, r)
      expect(at[1]).toBeGreaterThan(2)
      expect(clear(generated, {}, at, r), `${off} from ${2.5 + k * 0.005}`).toBe(true)
    }
  }
})

test('a solid box handed in stops a mover as a blocked cell does: a radius short of it, by its corner, and out of it but no deeper', () => {
  // A crate on the top row of the map, between its open cells.
  const crate: Box = { x: 1.5, y: 0.25, w: 1, h: 0.5 }
  // Along x into its side, along y into its bottom, and none of it where none is handed in.
  expect(slide(generated, {}, [0.5, 0.5], 0, 2, R, [crate])).toBe(1.5 - R)
  expect(slide(generated, {}, [1.6, 1.5], 1, 0.5, R, [crate])).toBe(0.75 + R)
  expect(slide(generated, {}, [0.5, 0.5], 0, 2, R)).toBe(2)
  // A radius off its side, a mover passes; by its corner it stops where the circle touches the corner.
  expect(slide(generated, {}, [0.5, 1], 0, 1.4, R, [crate])).toBe(1.4)
  const off = 0.9 - 0.75
  expect(slide(generated, {}, [0.5, 0.9], 0, 1.4, R, [crate])).toBeCloseTo(1.5 - Math.sqrt(R * R - off * off), 12)
  // Started a rounding error inside, it moves out and no deeper; a stop against it leaves it clear.
  const inside = 1.5 - R + 1e-12
  expect(slide(generated, {}, [inside, 0.5], 0, inside + 0.1, R, [crate])).toBe(inside)
  expect(slide(generated, {}, [inside, 0.5], 0, 0.6, R, [crate])).toBe(0.6)
  const at = [slide(generated, {}, [0.5, 0.5], 0, 2, R, [crate]), 0.5]
  expect(clear(generated, {}, at, R, [crate])).toBe(true)
  expect(clear(generated, {}, [at[0] + 0.01, 0.5], R, [crate])).toBe(false)
  expect(clear(generated, {}, [at[0] + 0.01, 0.5], R)).toBe(true)
})

test('along x and then along y, a mover running slantwise into a wall slides along it', () => {
  const pos = [0.5, 0.5]
  const s = Math.SQRT1_2
  pos[0] = slide(generated, {}, pos, 0, pos[0] - s, R)
  pos[1] = slide(generated, {}, pos, 1, pos[1] - s, R)
  expect(pos).toEqual([R, R])
  pos[0] = slide(generated, {}, pos, 0, pos[0] + s, R)
  pos[1] = slide(generated, {}, pos, 1, pos[1] - s, R)
  expect(pos[0]).toBeCloseTo(R + s, 12)
  expect(pos[1]).toBe(R)
})
