// Ways through a grid: windowed A* (`path`), a distance field (`field`, `down`), a straight line
// that does or does not pass (`sight`), and a route pulled straight (`pull`).
//
// `path` runs over a grid the caller describes. It knows nothing of what a cell is: the caller hands
// it the grid's width and height in cells, a window, and `around(c)`, the cells a mover may step to
// from cell c with what each step costs. Cells are numbered along each row and on down,
// c = y × w + x.
//
// The search looks only inside a square `window` cells across centred on `from`, so a fine grid
// costs detail rather than time. A goal outside the window is clipped to the window's edge along
// the way it lies, and the mover asks again when it gets there. An unreachable goal is not a
// failure: the route to the cell the search reached closest to it comes back, so a mover walled off
// walks up to the wall. The estimate is the octile distance, exact on a grid of unit and diagonal
// steps. The route leaves out `from` and ends at the goal, or at that closest cell; it is empty when
// `from` is the goal or nothing nearer can be reached. Of two cells as promising, the one reached
// first is searched first, so one grid and one ask give one route, on every machine.
//
// A cell is in the search's heap once for every time a cheaper way to it is found, each time with
// the key it had then; a copy whose key is no longer the cell's is skipped when it comes out. A heap
// that kept one copy per cell and read its key off the live score would hold a cell whose score
// fell below its parent's where the heap put it, and hand out cells in the wrong order.
//
// `grid` describes a map of `across` × `down` cells for the rest: `blocked(c, r)` says whether the
// map's cell [c, r] blocks (tilemap's `blocked`, say), and each map cell is `sub` × `sub` nav cells,
// each blocked when the map cell it is in blocks. A step is to any of the eight neighbours, costing
// 1 along a row or column and √2 on a diagonal, taken only when both cells beside the diagonal are
// open, so no route cuts a corner. `window` is in map cells. `at` is the nav cell under a point of
// the map, [x, y] in map cells, or -1 off the map; `centre` the point in the middle of a nav cell,
// or, given a `radius`, the point nearest it where a body of that radius touches none of the blocked
// map cells round the one it is in: a nav cell along a wall has its middle nearer the wall than a
// body's radius, and a body steering for it would be held there by the wall.
//
// `field(g, goal, limit)` is the cost from every nav cell to `goal`, in map cells, by Dijkstra from
// the goal: Infinity where the goal cannot be reached within `limit` map cells. A field serves every
// mover heading for one goal. `down(f, c)` is the neighbour of c one step downhill on the cheapest
// way to the goal: of the neighbours with a cost below c's, the one whose cost and the step to it
// come to least, of equal ones the first in `around`'s order; -1 at the goal, and where the field
// never reached.
//
// `sight(blocked, from, to)` is whether the straight line between two points of the map crosses no
// cell that blocks, with `blocked` as `grid` takes it. A line through a corner where four cells
// meet passes only when both cells beside it are open, as a step does. Given a `radius`, it is
// whether a body of that radius passes: the line through its middle and the two along its sides,
// `radius` off either way, all pass. A cell is a whole cell across, wider than a body of a radius
// under a half, so a cell in the body's way crosses one of the three. The sides run as long as the
// middle, past the body's round ends, so a line to a point by a corner can be refused that the body
// would pass.
//
// `pull(route, blocked, radius)` is a route of points of the map, its first the mover's own, pulled
// straight: the first point, then each time the furthest point on from the last one kept that
// `sight` reaches for a body of `radius`, 0 when left out, down to the last.
//
// It has no numbers of its own and no row: a window is the caller's, as are the costs.
import * as math from '#plugins/math/math.sim.ts'

export type Grid = { w: number; h: number; window: number; around: (c: number) => Iterable<readonly [number, number]> }
export type Nav = Grid & { sub: number; open: Uint8Array; blocked: Blocked }
export type Field = { g: Nav; cost: Float64Array }
export type Blocked = (c: number, r: number) => boolean
export type Point = readonly number[]

// A binary min-heap of cells, each pushed with its own key; of two with one key, the one pushed
// first comes out first. A cell pushed again with a lower key is in it twice, and the caller skips the
// copy whose key is no longer the cell's.
class Heap {
  private cell: number[] = []
  private key: number[] = []
  private order: number[] = []
  private pushed = 0
  get size() { return this.cell.length }
  private less(i: number, j: number) {
    return this.key[i] < this.key[j] || (this.key[i] === this.key[j] && this.order[i] < this.order[j])
  }
  private swap(i: number, j: number) {
    for (const a of [this.cell, this.key, this.order]) [a[i], a[j]] = [a[j], a[i]]
  }
  push(c: number, key: number) {
    this.cell.push(c)
    this.key.push(key)
    this.order.push(this.pushed++)
    for (let i = this.cell.length - 1; i > 0;) {
      const p = (i - 1) >> 1
      if (!this.less(i, p)) break
      this.swap(i, p)
      i = p
    }
  }
  // The cell with the lowest key, and that key.
  pop(): [number, number] {
    const top: [number, number] = [this.cell[0], this.key[0]]
    const n = this.cell.length - 1
    this.swap(0, n)
    this.cell.pop()
    this.key.pop()
    this.order.pop()
    for (let i = 0; ;) {
      const l = i * 2 + 1, r = l + 1
      let m = i
      if (l < n && this.less(l, m)) m = l
      if (r < n && this.less(r, m)) m = r
      if (m === i) break
      this.swap(m, i)
      i = m
    }
    return top
  }
}

export function path(g: Grid, from: number, to: number): number[] {
  if (from === to) return []
  const half = g.window >> 1
  const fx = from % g.w, fy = (from / g.w) | 0
  const x0 = Math.max(0, fx - half), y0 = Math.max(0, fy - half)
  const x1 = Math.min(g.w - 1, fx + half), y1 = Math.min(g.h - 1, fy + half)
  const gx = Math.min(x1, Math.max(x0, to % g.w)), gy = Math.min(y1, Math.max(y0, (to / g.w) | 0))
  const goal = gy * g.w + gx
  if (goal === from) return []

  const n = g.w * g.h
  const cost = new Float64Array(n).fill(Infinity)
  const est = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const h = (c: number) => {
    const dx = Math.abs((c % g.w) - gx), dy = Math.abs(((c / g.w) | 0) - gy)
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
  }
  const open = new Heap()
  cost[from] = 0
  est[from] = h(from)
  open.push(from, est[from])
  let best = from, bestH = est[from]
  while (open.size) {
    const [c, key] = open.pop()
    if (key > est[c]) continue
    if (c === goal) { best = goal; break }
    const ch = h(c)
    if (ch < bestH) { bestH = ch; best = c }
    for (const [nb, step] of g.around(c)) {
      const nx = nb % g.w, ny = (nb / g.w) | 0
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue
      const nc = cost[c] + step
      if (nc >= cost[nb]) continue
      cost[nb] = nc
      est[nb] = nc + h(nb)
      prev[nb] = c
      open.push(nb, est[nb])
    }
  }
  const out: number[] = []
  for (let c = best; c !== from && c >= 0; c = prev[c]) out.push(c)
  return out.reverse()
}

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const

export function grid(across: number, down: number, blocked: Blocked, sub: number, window: number): Nav {
  const w = across * sub, h = down * sub
  const open = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) open[y * w + x] = blocked(Math.floor(x / sub), Math.floor(y / sub)) ? 0 : 1
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && open[y * w + x] === 1
  return {
    w, h, sub, open, blocked, window: window * sub,
    *around(c) {
      const x = c % w, y = (c / w) | 0
      for (const [dx, dy] of STEPS) {
        if (!free(x + dx, y + dy)) continue
        if (dx && dy && !(free(x + dx, y) && free(x, y + dy))) continue
        yield [(y + dy) * w + x + dx, dx && dy ? Math.SQRT2 : 1] as const
      }
    },
  }
}

export function at(g: Nav, p: Point): number {
  const x = Math.floor(p[0] * g.sub), y = Math.floor(p[1] * g.sub)
  return x < 0 || y < 0 || x >= g.w || y >= g.h ? -1 : y * g.w + x
}

export function centre(g: Nav, c: number, radius = 0): [number, number] {
  const p: [number, number] = [((c % g.w) + 0.5) / g.sub, (((c / g.w) | 0) + 0.5) / g.sub]
  if (!radius) return p
  const mx = Math.floor(p[0]), my = Math.floor(p[1])
  // the sides first, then the corners (STEPS' order)
  for (const [dx, dy] of STEPS) {
    if (!g.blocked(mx + dx, my + dy)) continue
    const nx = Math.max(mx + dx, Math.min(p[0], mx + dx + 1)), ny = Math.max(my + dy, Math.min(p[1], my + dy + 1))
    const ox = p[0] - nx, oy = p[1] - ny, d = math.hypot(ox, oy)
    if (d >= radius) continue
    if (!dx) p[1] = ny + Math.sign(-dy) * radius
    else if (!dy) p[0] = nx + Math.sign(-dx) * radius
    else {
      p[0] = nx + (ox / d) * radius
      p[1] = ny + (oy / d) * radius
    }
  }
  return p
}

export function field(g: Nav, goal: number, limit: number): Field {
  const cost = new Float64Array(g.w * g.h).fill(Infinity)
  const out = { g, cost }
  if (goal < 0 || !g.open[goal]) return out
  const most = limit * g.sub
  const open = new Heap()
  cost[goal] = 0
  open.push(goal, 0)
  while (open.size) {
    const [c, key] = open.pop()
    if (key > cost[c]) continue
    for (const [nb, step] of g.around(c)) {
      const d = key + step
      if (d > most || d >= cost[nb]) continue
      cost[nb] = d
      open.push(nb, d)
    }
  }
  for (let c = 0; c < cost.length; c++) cost[c] /= g.sub
  return out
}

export function down(f: Field, c: number): number {
  if (c < 0 || f.cost[c] === Infinity) return -1
  let best = -1, low = Infinity
  for (const [nb, step] of f.g.around(c)) {
    const via = f.cost[nb] + step / f.g.sub
    if (f.cost[nb] < f.cost[c] && via < low) { low = via; best = nb }
  }
  return best
}

export function sight(blocked: Blocked, from: Point, to: Point, radius = 0): boolean {
  const len = math.hypot(to[0] - from[0], to[1] - from[1])
  if (!radius || !len) return line(blocked, from, to)
  const ox = (-(to[1] - from[1]) / len) * radius, oy = ((to[0] - from[0]) / len) * radius
  return [0, 1, -1].every(s => line(blocked, [from[0] + ox * s, from[1] + oy * s], [to[0] + ox * s, to[1] + oy * s]))
}

// Amanatides and Woo's walk through the cells a segment crosses.
function line(blocked: Blocked, from: Point, to: Point): boolean {
  let x = Math.floor(from[0]), y = Math.floor(from[1])
  const ex = Math.floor(to[0]), ey = Math.floor(to[1])
  if (blocked(x, y)) return false
  const dx = to[0] - from[0], dy = to[1] - from[1]
  const sx = Math.sign(dx), sy = Math.sign(dy)
  const tx = dx ? Math.abs(1 / dx) : Infinity, ty = dy ? Math.abs(1 / dy) : Infinity
  let nx = dx ? (sx > 0 ? x + 1 - from[0] : from[0] - x) * tx : Infinity
  let ny = dy ? (sy > 0 ? y + 1 - from[1] : from[1] - y) * ty : Infinity
  while (x !== ex || y !== ey) {
    if (nx > 1 && ny > 1) break
    if (nx === ny) {
      if (blocked(x + sx, y) || blocked(x, y + sy)) return false
      x += sx
      y += sy
      nx += tx
      ny += ty
    } else if (nx < ny) {
      x += sx
      nx += tx
    } else {
      y += sy
      ny += ty
    }
    if (blocked(x, y)) return false
  }
  return !blocked(ex, ey)
}

export function pull(route: Point[], blocked: Blocked, radius = 0): Point[] {
  if (route.length < 3) return route.slice()
  const out = [route[0]]
  let from = 0
  while (from < route.length - 1) {
    let next = from + 1
    for (let k = route.length - 1; k > from + 1; k--) {
      if (sight(blocked, route[from], route[k], radius)) { next = k; break }
    }
    out.push(route[next])
    from = next
  }
  return out
}
