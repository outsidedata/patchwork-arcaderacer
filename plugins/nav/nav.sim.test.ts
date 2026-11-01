// Routes over grids the test draws as text: `#` is a wall, `.` open. A step is to any of the eight
// neighbours, a diagonal costing √2 and only past two open sides. Then the same maps as `grid` takes
// them, a map cell of sub-cells: fields against a search of every cell, lines, and routes pulled.
import { expect, test } from 'vitest'
import { seeded } from '#engine/engine.ts'
import { at, centre, down, field, grid as navGrid, path, pull, sight, type Blocked, type Grid, type Point } from './nav.sim.ts'

const grid = (rows: string[], window = 56): Grid & { at: (x: number, y: number) => number } => {
  const w = rows[0].length, h = rows.length
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== '#'
  return {
    w, h, window, at: (x, y) => y * w + x,
    *around(c) {
      const x = c % w, y = (c / w) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (!open(x + dx, y + dy)) continue
        if (dx && dy && !(open(x + dx, y) && open(x, y + dy))) continue
        yield [(y + dy) * w + x + dx, dx && dy ? Math.SQRT2 : 1] as const
      }
    },
  }
}
const cost = (g: Grid, from: number, route: number[]) => {
  let at = from, sum = 0
  for (const c of route) {
    const step = [...g.around(at)].find(([n]) => n === c)
    expect(step, `${at} to ${c} is not a step`).toBeDefined()
    sum += step![1]
    at = c
  }
  return sum
}

// the cheapest cost from one cell to another, by trying everything (Dijkstra without a heap)
const cheapest = (g: Grid, from: number, to: number) => {
  const best = new Map([[from, 0]]), done = new Set<number>()
  for (;;) {
    const [c, d] = [...best].filter(([k]) => !done.has(k)).sort((a, b) => a[1] - b[1])[0]
    if (c === to) return d
    done.add(c)
    for (const [n, step] of g.around(c)) if (d + step < (best.get(n) ?? Infinity)) best.set(n, d + step)
  }
}

test('an open field is crossed straight, and the route ends on the goal', () => {
  const g = grid(['.....', '.....', '.....'])
  const r = path(g, g.at(0, 0), g.at(4, 2))
  expect(r.at(-1)).toBe(g.at(4, 2))
  expect(cost(g, g.at(0, 0), r)).toBeCloseTo(2 + 2 * Math.SQRT2)
})

test('a wall is walked round by the cheapest way, every step one the grid allows', () => {
  const g = grid([
    '.......',
    '...#...',
    '...#...',
    '...#...',
    '.......',
    '.......',
  ])
  const r = path(g, g.at(1, 2), g.at(5, 2))
  expect(r.at(-1)).toBe(g.at(5, 2))
  expect(cost(g, g.at(1, 2), r)).toBeCloseTo(cheapest(g, g.at(1, 2), g.at(5, 2)))
  expect(r).not.toContain(g.at(3, 2))
})

test('an unreachable goal gives the route to the closest cell reached', () => {
  const g = grid([
    '....#..',
    '....#..',
    '....#..',
  ])
  const r = path(g, g.at(0, 1), g.at(6, 1))
  expect(r.at(-1)).toBe(g.at(3, 1))
})

test('a goal outside the window is clipped to its edge', () => {
  const g = grid([Array(40).fill('.').join('')], 10)
  const r = path(g, g.at(0, 0), g.at(39, 0))
  expect(r.at(-1)).toBe(g.at(5, 0))
})

test('from the goal, or walled in, the route is empty', () => {
  const g = grid(['.#', '##'])
  expect(path(g, g.at(0, 0), g.at(0, 0))).toEqual([])
  expect(path(g, g.at(0, 0), g.at(1, 1))).toEqual([])
})

// A cell whose estimate falls while it is in the heap is handed out by its new estimate, ahead of a
// parent it now beats: a heap keyed by one live estimate per cell would hand it out behind that
// parent, and on this grid walk 31.49 where the cheapest route is 30.90.
test('the heap hands out cells in order, so the route found is the cheapest', () => {
  const g = grid([
    '.......#.................',
    '.........................',
    '.....#...#.......#.......',
    '...............#.........',
    '#....#.......#..#........',
    '.#....#...#........#..#..',
    '...#.#............#......',
    '.......................#.',
    '........#.....#........#.',
    '.........#..............#',
    '.........................',
    '...#...............#.....',
    '........#.#.......#......',
    '..#......#...............',
    '.................#.......',
    '..........#..#.....#.....',
    '......................#..',
    '.............##..........',
    '.........................',
    '.............#..#....#.#.',
    '..................#......',
    '.........................',
    '........#................',
    '..............#..........',
    '.#.....#.................',
    '......#.#.........#......',
    '....#....................',
    '.....#......#........#..#',
    '..........#..............',
    '.........#...............',
    '.................#..#....',
    '..#...#...........#......',
    '..#....#...............#.',
  ], 99)
  const from = g.at(11, 30), to = g.at(4, 2)
  const r = path(g, from, to)
  expect(r.at(-1)).toBe(to)
  expect(cost(g, from, r)).toBeCloseTo(cheapest(g, from, to), 9)
  expect(cheapest(g, from, to)).toBeCloseTo(30.899494936611667, 9)
})

test('one grid and one ask give one route, however often it is asked', () => {
  const rows = ['.........', '...#.....', '...#.#...', '.....#...', '.........']
  const r = path(grid(rows), 0, 44)
  for (let i = 0; i < 5; i++) expect(path(grid(rows), 0, 44)).toEqual(r)
})

// A map the tests draw as text, as `grid` takes it: [c, r] blocks where the text has `#`, and off
// the map.
const map = (rows: string[]): Blocked => (c, r) => r < 0 || c < 0 || r >= rows.length || c >= rows[0].length || rows[r][c] === '#'
const nav = (rows: string[], sub = 2, window = 64) => navGrid(rows[0].length, rows.length, map(rows), sub, window)

test('a map cell is sub × sub nav cells, each blocked when the map cell is, and a point is in the nav cell under it', () => {
  const g = nav(['..', '.#'])
  expect([g.w, g.h, g.window]).toEqual([4, 4, 128])
  expect(at(g, [1.2, 1.7])).toBe(3 * 4 + 2)
  expect(g.open[at(g, [1.2, 1.7])]).toBe(0)
  expect(g.open[at(g, [0.9, 1.9])]).toBe(1)
  expect(at(g, [-0.1, 1])).toBe(-1)
  expect(at(g, [1, 2])).toBe(-1)
  expect(centre(g, 3 * 4 + 2)).toEqual([1.25, 1.75])
})

test('a route over the nav grid goes round a wall and never cuts the corner of a blocked cell', () => {
  const rows = [
    '......',
    '..#...',
    '..#...',
    '..##..',
    '......',
  ]
  const g = nav(rows)
  const blocked = map(rows)
  const from = at(g, [1.5, 2.5]), to = at(g, [4.5, 1.5])
  const r = path(g, from, to)
  expect(r.at(-1)).toBe(to)
  let prev = from
  for (const c of r) {
    const [x, y] = centre(g, c), [px, py] = centre(g, prev)
    expect(blocked(Math.floor(x), Math.floor(y))).toBe(false)
    // a diagonal step has both cells beside it open
    if (x !== px && y !== py) {
      expect(blocked(Math.floor(x), Math.floor(py))).toBe(false)
      expect(blocked(Math.floor(px), Math.floor(y))).toBe(false)
    }
    prev = c
  }
  expect(cost(g, from, r)).toBeCloseTo(cheapest(g, from, to), 9)
})

test('two blocked cells touching at a corner let no route and no line through between them', () => {
  const rows = [
    '...',
    '.#.',
    '#..',
  ]
  const g = nav(rows, 1)
  // from [0, 1] to [1, 2] is one diagonal between [1, 1] and [0, 2], both blocked
  expect([...g.around(g.w * 1 + 0)].map(([n]) => n)).not.toContain(2 * g.w + 1)
  expect(sight(map(rows), [0.5, 1.5], [1.5, 2.5])).toBe(false)
  expect(sight(map(rows), [0.5, 0.5], [2.5, 0.5])).toBe(true)
})

// A cost from each cell to `goal` by trying every cell in turn, as `cheapest` does, over the whole
// grid at once.
const brute = (g: Grid, goal: number) => {
  const d = new Float64Array(g.w * g.h).fill(Infinity), done = new Uint8Array(g.w * g.h)
  d[goal] = 0
  for (;;) {
    let c = -1
    for (let i = 0; i < d.length; i++) if (!done[i] && d[i] < Infinity && (c < 0 || d[i] < d[c])) c = i
    if (c < 0) return d
    done[c] = 1
    for (const [n, step] of g.around(c)) if (d[c] + step < d[n]) d[n] = d[c] + step
  }
}

test('a field is every cell\'s cheapest cost to the goal on random maps, in map cells, and Infinity past its limit', () => {
  const die = seeded(11)
  for (let t = 0; t < 30; t++) {
    const across = 4 + Math.floor(die() * 10), rowsDown = 4 + Math.floor(die() * 10)
    const rows = Array.from({ length: rowsDown }, () => Array.from({ length: across }, () => (die() < 0.3 ? '#' : '.')).join(''))
    const g = nav(rows)
    const open = [...g.open.keys()].filter(c => g.open[c])
    if (!open.length) continue
    const goal = open[Math.floor(die() * open.length)]
    const want = brute(g, goal)
    const f = field(g, goal, Infinity)
    for (let c = 0; c < want.length; c++) {
      if (want[c] === Infinity) expect(f.cost[c]).toBe(Infinity)
      else expect(f.cost[c]).toBeCloseTo(want[c] / g.sub, 9)
    }
    const limit = 3
    const near = field(g, goal, limit)
    for (let c = 0; c < want.length; c++) {
      if (want[c] / g.sub <= limit + 1e-9) expect(near.cost[c]).toBeCloseTo(want[c] / g.sub, 9)
      else expect(near.cost[c]).toBe(Infinity)
    }
    // downhill from every reached cell walks to the goal, each step one the grid allows, for what
    // the field says it costs
    for (const c of open) {
      if (f.cost[c] === Infinity) {
        expect(down(f, c)).toBe(-1)
        continue
      }
      let here = c, walked = 0
      while (here !== goal) {
        const next = down(f, here)
        const step = [...g.around(here)].find(([n]) => n === next)
        expect(step).toBeDefined()
        walked += step![1]
        here = next
      }
      expect(walked / g.sub).toBeCloseTo(f.cost[c], 9)
      expect(down(f, goal)).toBe(-1)
    }
  }
})

test('a field round a blocked goal, or off the map, reaches nothing', () => {
  const g = nav(['.#'])
  expect([...field(g, at(g, [1.5, 0.5]), 9).cost].every(v => v === Infinity)).toBe(true)
  expect([...field(g, -1, 9).cost].every(v => v === Infinity)).toBe(true)
})

test('a line passes through a gap in a wall and is stopped by the wall beside it', () => {
  const rows = [
    '.......',
    '.......',
    '###.###',
    '.......',
  ]
  const b = map(rows)
  expect(sight(b, [3.5, 0.5], [3.5, 3.5])).toBe(true)
  expect(sight(b, [3.1, 0.2], [3.9, 3.8])).toBe(true)
  expect(sight(b, [0.5, 0.5], [0.5, 3.5])).toBe(false)
  expect(sight(b, [0.5, 1.5], [6.5, 3.5])).toBe(false)
  // along a row, and to itself
  expect(sight(b, [0.5, 1.5], [6.5, 1.5])).toBe(true)
  expect(sight(b, [2.5, 1.5], [2.5, 1.5])).toBe(true)
  // from or to a blocked cell
  expect(sight(b, [0.5, 2.5], [0.5, 1.5])).toBe(false)
  expect(sight(b, [0.5, 1.5], [0.5, 2.5])).toBe(false)
})

test('a route pulled straight keeps only the corners it turns, and every leg is a line that passes', () => {
  const rows = [
    '......',
    '.####.',
    '.#....',
    '.#....',
  ]
  const b = map(rows)
  const g = nav(rows)
  const from: Point = [0.5, 3.5], to: Point = [4.5, 2.5]
  const r = [from, ...path(g, at(g, from), at(g, to)).map(c => centre(g, c))]
  const p = pull(r, b)
  expect(p[0]).toEqual(from)
  expect(p.at(-1)).toEqual(r.at(-1))
  expect(p.length).toBeLessThan(r.length)
  expect(p.length).toBeGreaterThanOrEqual(3)
  for (let i = 1; i < p.length; i++) expect(sight(b, p[i - 1], p[i])).toBe(true)
  // an open run pulls to its two ends
  const line: Point[] = [[0.5, 0.5], [1.5, 0.5], [2.5, 0.5], [3.5, 0.5]]
  expect(pull(line, b)).toEqual([[0.5, 0.5], [3.5, 0.5]])
})

test('given a radius, a nav cell\'s point is where a body of it touches no blocked cell round it', () => {
  const rows = [
    '....',
    '.#..',
    '....',
  ]
  const g = nav(rows)
  const r = 0.3
  // the nav cell above the block, its middle 0.25 from the block's top
  const above = at(g, [1.25, 0.75])
  expect(centre(g, above)).toEqual([1.25, 0.75])
  expect(centre(g, above, r)[0]).toBe(1.25)
  expect(centre(g, above, r)[1]).toBeCloseTo(1 - r, 12)
  // the nav cell off the block's top right corner, its middle 0.25 across and 0.25 up from it: out
  // of reach of a body of 0.3, pushed off the corner by one of 0.4
  expect(centre(g, at(g, [2.25, 0.75]), r)).toEqual([2.25, 0.75])
  const corner = centre(g, at(g, [2.25, 0.75]), 0.4)
  expect(Math.hypot(corner[0] - 2, corner[1] - 1)).toBeCloseTo(0.4, 12)
  expect(corner[0] - 2).toBeCloseTo(1 - corner[1], 12)
  // a nav cell with nothing blocked within reach keeps its middle; the map's edge blocks
  expect(centre(g, at(g, [2.75, 1.25]), r)).toEqual([2.75, 1.25])
  expect(centre(g, at(g, [3.75, 2.75]), r)).toEqual([4 - r, 3 - r])
})

test('given a radius, a line passes only where a body of it would, and a route is pulled for that body', () => {
  const rows = [
    '.....',
    '.....',
    '..#..',
    '.....',
  ]
  const b = map(rows)
  // passing 0.2 above the block's top left corner
  expect(sight(b, [0.5, 1.8], [4.5, 1.8])).toBe(true)
  expect(sight(b, [0.5, 1.8], [4.5, 1.8], 0.3)).toBe(false)
  expect(sight(b, [0.5, 1.5], [4.5, 1.5], 0.3)).toBe(true)
  const g = nav(rows)
  const from: Point = [0.5, 2.5], to: Point = [4.5, 2.5]
  const r = [from, ...path(g, at(g, from), at(g, to)).map(c => centre(g, c, 0.3))]
  const p = pull(r, b, 0.3)
  // each leg one the body passes, or two points next to each other on the route, where no line
  // from the first passes: the sides of the body are lines as long as its middle's, which reach
  // past its round ends
  for (let i = 1; i < p.length; i++) expect(sight(b, p[i - 1], p[i], 0.3) || r.indexOf(p[i]) === r.indexOf(p[i - 1]) + 1).toBe(true)
  expect(p.length).toBeLessThan(r.length)
})
