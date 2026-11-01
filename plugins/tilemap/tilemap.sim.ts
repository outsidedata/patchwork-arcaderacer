// The server half of tilemap: the questions a rule asks of a level. The scene's `world.tilemap`
// names the level's file, `file`, its name in the scene's `loader` catalogue, an entry with
// `preload`, so the loader has it before the first step (`plugins/loader/loader.sim.ts`). The loader
// is handed to this plugin, never imported by it: a rule reads the file through the loader, naming
// `w.world.tilemap.file`, and hands it to the questions below. The browser half draws the same file,
// naming `plugins.wire.scene.world.tilemap.file`.
//
// The file is a Tiled map, a `tilemap` entry, which the loader reads into a `Tiled` (what it holds
// is in the loader's header). A map never changes, so no row carries it, nor the name of its file,
// to every seat every step; what changes is on the one row of this kind: `edits`, `{ "<layer>:<c>,<r>": gid }`, each cell a rule has changed
// since the map was read, holding the tile's gid, drawn unflipped, or -1 for no tile there. So a
// block that is broken or a coin that is taken is one key on one row, a seat that arrives late is
// sent it, and every question below and the browser half read the map with its edits.
//
// A point of the world is [x, y] in cells, x along a row and y down the rows, so cell [c, r] is the
// square from [c, r] to [c + 1, r + 1], moved by its layer's `shift`, and render2d's `ground` says
// where that square is drawn. A `Box` is a thing's top left and size, in cells.
//
// `tileAt` is the gid of a cell of a tile layer, 0 for none; `overlaps` every tile of every tile
// layer, visible or not, whose cell a box overlaps, collision or not; `solidAt` whether any collision
// shape of a tile, one-way ones aside, reaches into the inside of a box by more than `EPS`, so a
// thing placed there would stand inside the level's ground or walls, and a box resting against a
// shape is clear of it; `shapes` every collision shape of every tile of every tile layer whose cell
// a box overlaps, with the edits in them, each its points in the world, clockwise, and whether it is
// one-way, as a physics world is handed the level's ground; `objects` the
// objects of the map's object layers, or of the ones of one name; `tileOfType` the first gid, by
// tileset and then by id, whose Tiled type is a type.
//
// `sweep` moves a box along one axis, x (0) or y (1), to `to`, its new x or y, against the
// collision shapes of every tile of every tile layer, visible or not, with the edits in them, and
// the `solids` handed to it, rectangles from rows such as a moving platform or a block while it is
// bumped. It hands back the box where it stopped and a `Hit` for each thing it touched: `side`, the
// side of the box that touched it, `bottom` for ground it stands on; `cell` and `tile`, its cell and
// gid, null and 0 for a solid; `solid`, the solid's place in the `solids` handed in, -1 for a tile,
// so the rule that handed them in knows which row it touched; `type`, its tile's type, '' when it
// has none; and `slope`, how far
// the surface it touched goes down for a cell along x where it touched it, so -1 is a 45° slope
// rising to the right and 0 is flat or a wall. A tile's shapes are its Tiled collision objects,
// rectangles and convex polygons, flipped as its cell flips it; one whose type is `top` is one-way.
// In an isometric map a tile with any is its whole cell, one-way if all of its shapes are.
//
// The rules of a sweep, all of them measured to within `EPS`, far under a pixel, so a box placed
// against something by one sweep is found touching it, never inside it or apart from it, by the
// next, however the sums round; that is what keeps a box resting on the ground from sinking or
// jittering, and a box sliding along a floor or a wall from catching on the seams between its
// tiles:
//
// - A box stands on its feet, the middle of its bottom edge: it rests on the top of any shape
//   under that point, and on any top edge under its bottom edge that is flat or steeper than 45°.
//   A slope, 45° or gentler, carries it only under its feet, so a box on a slope sinks its lower
//   corner into it, and walks off a ledge when its feet do not.
// - Moving down, it lands on what its feet meet from above: a one-way shape, rectangle or
//   polygon, as anything else, but only one whose top was at or under its feet.
// - Moving up, its top edge meets the underside of any shape but a one-way one.
// - Moving along x, its leading side meets the side of any shape but a one-way one that faces it,
//   except a side against another shape, as between two tiles of a wall, and a slope 45° or
//   gentler that it meets at its feet or no higher than half its width above them. A box standing
//   at the start of the move is met only above that same half width: it steps up onto anything
//   lower, as it walks onto a 45° slope. Its feet then follow the surface under their new place,
//   up by as much as it rose by half the box and the move, down, only when it was standing, by as
//   far as a 45° slope drops over the move, so a box walking down a slope never leaves it; a
//   one-way surface carries it only when its feet were at or over it before the move. A box its
//   feet would lift into a ceiling stays where it was, touching the side it moved toward.
// - A box that starts inside a shape moves out of it freely; nothing here pushes it out.
//
// A thing that walks the map cell by cell, as a top-down game's hero and monsters do, is a circle
// of `radius` cells that `slide`s, and a cell `blocked` stops it: outside the map, with no tile on
// any tile layer, or with a tile with any collision on any, which in an isometric map is its whole
// cell as for a sweep. So does every box of the `solids` handed to it, rectangles from rows that
// stand in the way (a crate, a door, someone standing there), as a sweep is handed them. `clear` is
// whether such a circle stands clear of every cell that blocks and every box of the solids, so a
// thing put down there would not stand in a wall, off the floor or in another thing; one a stop left
// touching a cell or a box is clear of it.
import type { Kind } from '#engine/engine.ts'
import type { TileLayer, Tiled, TiledObject } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

export type Box = { x: number; y: number; w: number; h: number }
export type Edits = Record<string, number>
export type Hit = { side: 'left' | 'right' | 'top' | 'bottom'; cell: [number, number] | null; tile: number; solid: number; type: string; slope: number }

export const tilemap: Kind = {}

// How near two places are to be one, in cells.
export const EPS = 1e-9

// ---------------------------------------------------------------- tiles

const layerOf = (map: Tiled, name: string): TileLayer => {
  const l = map.layers.find((l): l is TileLayer => l.kind === 'tiles' && l.name === name)
  if (!l) throw new Error(`the map has no tile layer ${name}`)
  return l
}

// A cell's gid and flip bits, with the edits in them.
function cellOf(l: TileLayer, edits: Edits | undefined, c: number, r: number): [number, number] {
  const e = edits?.[`${l.name}:${c},${r}`]
  if (e !== undefined) return [e < 0 ? 0 : e, 0]
  const i = c - l.x, j = r - l.y
  if (i < 0 || j < 0 || i >= l.width || j >= l.height) return [0, 0]
  return [l.data[j * l.width + i], l.flips[j * l.width + i]]
}

export const tileAt = (map: Tiled, edits: Edits | undefined, layer: string, c: number, r: number): number => cellOf(layerOf(map, layer), edits, c, r)[0]

// The cells [c, r] of a layer whose squares a box overlaps.
function cellsUnder(l: TileLayer, box: Box, f: (c: number, r: number) => void) {
  const [sx, sy] = l.shift
  for (let r = Math.floor(box.y - sy + EPS); r <= Math.ceil(box.y + box.h - sy - EPS) - 1; r++)
    for (let c = Math.floor(box.x - sx + EPS); c <= Math.ceil(box.x + box.w - sx - EPS) - 1; c++) f(c, r)
}

export function overlaps(map: Tiled, edits: Edits | undefined, box: Box): { layer: string; cell: [number, number]; tile: number; type: string }[] {
  const out: { layer: string; cell: [number, number]; tile: number; type: string }[] = []
  for (const l of map.layers) {
    if (l.kind !== 'tiles') continue
    cellsUnder(l, box, (c, r) => {
      const [gid] = cellOf(l, edits, c, r)
      if (gid) out.push({ layer: l.name, cell: [c, r], tile: gid, type: map.tiles[gid]?.type ?? '' })
    })
  }
  return out
}

export function objects(map: Tiled, layer?: string): TiledObject[] {
  const layers = map.layers.filter(l => l.kind === 'objects' && (layer === undefined || l.name === layer))
  if (layer !== undefined && !layers.length) throw new Error(`the map has no object layer ${layer}`)
  return layers.flatMap(l => (l.kind === 'objects' ? l.objects : []))
}

export function tileOfType(map: Tiled, type: string): number {
  const t = Object.values(map.tiles).find(t => t.type === type)
  if (!t) throw new Error(`the map has no tile of type ${type}`)
  return t.gid
}

export function solidAt(map: Tiled, edits: Edits | undefined, box: Box): boolean {
  const corners: P[] = [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]]
  // Two convex shapes overlap unless, along the axis of some side of one of them, they lie apart.
  const apart = (a: P[], b: P[]) => {
    for (let i = 0; i < a.length; i++) {
      const p = a[i], q = a[(i + 1) % a.length], n: P = [q[1] - p[1], p[0] - q[0]], len = math.hypot(n[0], n[1])
      if (!len) continue
      const on = (pts: P[]) => pts.map(v => (v[0] * n[0] + v[1] * n[1]) / len)
      const [ra, rb] = [on(a), on(b)]
      if (Math.min(...ra) >= Math.max(...rb) - EPS || Math.min(...rb) >= Math.max(...ra) - EPS) return true
    }
    return false
  }
  return solidsIn(map, edits, box, []).some(s => !s.oneway && !apart(s.pts, corners) && !apart(corners, s.pts))
}

// ---------------------------------------------------------------- shapes

type P = [number, number]
// A convex shape in cells, going round clockwise on the screen, and what it is.
type Solid = { pts: P[]; oneway: boolean; x0: number; x1: number; cell: [number, number] | null; tile: number; solid: number; type: string }

// Points going round clockwise on the screen, where y grows down.
const clockwise = (pts: P[]) => {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    area += a[0] * b[1] - b[0] * a[1]
  }
  return area < 0 ? [...pts].reverse() : pts
}

// Each tile's shapes flipped as a cell flips it, in cells from the cell's top left, made once per
// read of the map.
const local = new WeakMap<object, Map<number, { pts: P[]; oneway: boolean }[]>>()
function shapesOf(map: Tiled, gid: number, flip: number) {
  let made = local.get(map.tiles)
  if (!made) local.set(map.tiles, (made = new Map()))
  const key = gid * 8 + flip
  const had = made.get(key)
  if (had) return had
  const tile = map.tiles[gid]
  let out: { pts: P[]; oneway: boolean }[] = []
  if (tile?.shapes.length && map.orientation === 'isometric') out = [{ pts: [[0, 0], [1, 0], [1, 1], [0, 1]], oneway: tile.shapes.every(s => s.top) }]
  else if (tile?.shapes.length) {
    const ts = map.tilesets[tile.tileset], [, , W, H] = tile.box
    out = tile.shapes.map(s => ({
      oneway: s.top,
      // Tiled flips a tile across its diagonal first, then across its middle along x and along y,
      // and stands the picture's bottom left on the cell's, moved by its tileset's offset.
      pts: clockwise(s.points.map(([px, py]): P => {
        let x = px, y = py, w = W, h = H
        if (flip & 1) { [x, y] = [y, x]; [w, h] = [h, w] }
        if (flip & 4) x = w - x
        if (flip & 2) y = h - y
        return [(x + ts.offset[0]) / map.tilewidth, 1 + (y - h + ts.offset[1]) / map.tileheight]
      })),
    }))
  }
  made.set(key, out)
  return out
}

// How far past its own cell, in cells, any tile's shapes can reach.
const reachOf = (map: Tiled) => 1 + Math.max(0, ...map.tilesets.map(ts =>
  Math.ceil(Math.max(ts.tilewidth / map.tilewidth, ts.tileheight / map.tileheight) + Math.abs(ts.offset[0]) / map.tilewidth + Math.abs(ts.offset[1]) / map.tileheight)))

const solid = (pts: P[], oneway: boolean, cell: [number, number] | null, tile: number, index: number, type: string): Solid =>
  ({ pts, oneway, x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), cell, tile, solid: index, type })

// Every shape reaching into a region of the world, and the solids handed in.
function solidsIn(map: Tiled, edits: Edits | undefined, region: Box, solids: Box[]): Solid[] {
  const out: Solid[] = []
  const m = reachOf(map)
  const wide = { x: region.x - m, y: region.y - m, w: region.w + 2 * m, h: region.h + 2 * m }
  for (const l of map.layers) {
    if (l.kind !== 'tiles') continue
    const [sx, sy] = l.shift
    cellsUnder(l, wide, (c, r) => {
      const [gid, flip] = cellOf(l, edits, c, r)
      if (!gid) return
      for (const s of shapesOf(map, gid, flip)) out.push(solid(s.pts.map(([x, y]): P => [x + c + sx, y + r + sy]), s.oneway, [c, r], gid, -1, map.tiles[gid].type))
    })
  }
  solids.forEach((b, i) => out.push(solid([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]], false, null, 0, i, '')))
  return out
}

// Every collision shape of every tile whose cell a box overlaps, each its points in the world.
export function shapes(map: Tiled, edits: Edits | undefined, box: Box): { pts: [number, number][]; oneway: boolean; cell: [number, number]; tile: number }[] {
  const out: { pts: [number, number][]; oneway: boolean; cell: [number, number]; tile: number }[] = []
  for (const l of map.layers) {
    if (l.kind !== 'tiles') continue
    const [sx, sy] = l.shift
    cellsUnder(l, box, (c, r) => {
      const [gid, flip] = cellOf(l, edits, c, r)
      if (!gid) return
      for (const s of shapesOf(map, gid, flip)) out.push({ pts: s.pts.map(([x, y]): P => [x + c + sx, y + r + sy]), oneway: s.oneway, cell: [c, r], tile: gid })
    })
  }
  return out
}

// Each side of a shape, from one point to the next.
function* edges(s: Solid) {
  for (let i = 0; i < s.pts.length; i++) {
    const p = s.pts[i], q = s.pts[(i + 1) % s.pts.length]
    yield { p, q, dx: q[0] - p[0], dy: q[1] - p[1] }
  }
}

const yOn = (p: P, q: P, x: number) => (x === p[0] ? p[1] : x === q[0] ? q[1] : p[1] + ((x - p[0]) * (q[1] - p[1])) / (q[0] - p[0]))

// The top or the underside of a shape at x, and how it slopes there: of the sides over (or under)
// x, the one going on to the right of it, or at the shape's right end the one coming to it.
function along(s: Solid, x: number, top: boolean): { y: number; slope: number } | null {
  if (x < s.x0 || x > s.x1) return null
  let best: { y: number; slope: number } | null = null
  for (const pass of [0, 1]) {
    for (const { p, q, dx, dy } of edges(s)) {
      if (top ? dx <= 0 : dx >= 0) continue
      const lo = Math.min(p[0], q[0]), hi = Math.max(p[0], q[0])
      if (pass === 0 ? !(x >= lo && x < hi) : !(x > lo && x <= hi)) continue
      const y = yOn(p, q, x)
      if (!best || (top ? y < best.y : y > best.y)) best = { y, slope: dy / dx }
    }
    if (best) return best
  }
  return null
}

// The lowest point of a shape's underside over x from a to b, and how it slopes there.
function underside(s: Solid, a: number, b: number): { y: number; slope: number } | null {
  const xs = [a, b, ...s.pts.map(p => p[0]).filter(x => x > a && x < b)]
  let best: { y: number; slope: number } | null = null
  for (const x of xs) {
    const u = along(s, x, false)
    if (u && (!best || u.y > best.y)) best = u
  }
  return best
}

const inside = (s: Solid, [x, y]: P) => [...edges(s)].every(({ p, dx, dy }) => dx * (y - p[1]) - dy * (x - p[0]) >= -1e-12)

// Where a box's feet meet a shape from above: its top under the box's feet, and each top edge
// under the box's bottom edge that is flat or steeper than 45°, at its highest there.
function landings(s: Solid, box: Box): { y: number; slope: number }[] {
  const out: { y: number; slope: number }[] = []
  const feet = along(s, box.x + box.w / 2, true)
  if (feet) out.push(feet)
  for (const { p, q, dx, dy } of edges(s)) {
    if (dx <= 0 || (dy !== 0 && Math.abs(dy) <= dx)) continue
    const a = Math.max(p[0], box.x + EPS), b = Math.min(q[0], box.x + box.w - EPS)
    if (a >= b) continue
    out.push({ y: Math.min(yOn(p, q, a), yOn(p, q, b)), slope: dy / dx })
  }
  return out
}

// A slope of -0, a flat side met going left, is 0.
const hit = (side: Hit['side'], s: Solid, slope: number): Hit => ({ side, cell: s.cell, tile: s.tile, solid: s.solid, type: s.type, slope: slope + 0 })

// One hit per thing touched on one side.
function unique(hits: Hit[]): Hit[] {
  const seen = new Set<string>()
  return hits.filter(h => {
    const key = `${h.side} ${h.cell ?? ''} ${h.tile} ${h.solid}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// What a box stands on: every shape its feet rest on.
function standing(solids: Solid[], box: Box): Hit[] {
  const b = box.y + box.h
  return solids.flatMap(s => landings(s, box).filter(l => Math.abs(l.y - b) <= EPS).map(l => hit('bottom', s, l.slope)))
}

// A box moved down to `to`, landing on what its feet meet.
function down(solids: Solid[], box: Box, to: number): { box: Box; hits: Hit[] } {
  const b = box.y + box.h, end = to + box.h
  const met: { y: number; h: Hit }[] = []
  for (const s of solids) for (const l of landings(s, box)) if (l.y >= b - EPS && l.y <= end + EPS) met.push({ y: l.y, h: hit('bottom', s, l.slope) })
  if (!met.length) return { box: { ...box, y: to }, hits: [] }
  const stop = Math.min(...met.map(m => m.y))
  return { box: { ...box, y: stop - box.h }, hits: met.filter(m => m.y <= stop + EPS).map(m => m.h) }
}

// A box moved up to `to`, stopped by the underside of anything but a one-way shape.
function up(solids: Solid[], box: Box, to: number): { box: Box; hits: Hit[] } {
  const met: { y: number; h: Hit }[] = []
  for (const s of solids) {
    if (s.oneway || s.x1 <= box.x + EPS || s.x0 >= box.x + box.w - EPS) continue
    const u = underside(s, Math.max(s.x0, box.x), Math.min(s.x1, box.x + box.w))
    if (u && u.y <= box.y + EPS && u.y >= to - EPS) met.push({ y: u.y, h: hit('top', s, u.slope) })
  }
  if (!met.length) return { box: { ...box, y: to }, hits: [] }
  const stop = Math.max(...met.map(m => m.y))
  return { box: { ...box, y: stop }, hits: met.filter(m => m.y >= stop - EPS).map(m => m.h) }
}

// Whether the stretch of a side from y `lo` to `hi` lies against other shapes, so nothing can
// touch it: a straight up and down side all along its stretch, and a slanting one at its middle.
function against(solids: Solid[], s: Solid, p: P, q: P, lo: number, hi: number, dir: number): boolean {
  const others = solids.filter(o => o !== s && !o.oneway)
  if (p[0] === q[0]) {
    const X = p[0]
    const spans: [number, number][] = []
    for (const o of others) {
      if (dir > 0 ? !(o.x0 < X - EPS && o.x1 >= X - EPS) : !(o.x1 > X + EPS && o.x0 <= X + EPS)) continue
      const x = dir > 0 ? Math.min(X, o.x1) : Math.max(X, o.x0)
      const t = along(o, x, true), u = along(o, x, false)
      if (t && u) spans.push([t.y, u.y])
    }
    spans.sort((a, b) => a[0] - b[0])
    let reached = lo
    for (const [a, b] of spans) {
      if (a > reached + EPS) break
      reached = Math.max(reached, b)
    }
    return reached >= hi - EPS
  }
  const t = ((lo + hi) / 2 - p[1]) / (q[1] - p[1])
  const mid: P = [p[0] + t * (q[0] - p[0]), (lo + hi) / 2]
  const len = math.hypot(q[0] - p[0], q[1] - p[1])
  const out: P = [mid[0] + ((q[1] - p[1]) / len) * 1e-7, mid[1] - ((q[0] - p[0]) / len) * 1e-7]
  return others.some(o => inside(o, out))
}

// A box moved along x to `to`, stopped by the sides it meets, its feet then put on the surface under
// them.
function along0(solids: Solid[], box: Box, to: number): { box: Box; hits: Hit[] } {
  const d = to - box.x
  const b = box.y + box.h, half = box.w / 2
  const stood = standing(solids, box).length > 0
  let hits: Hit[] = []
  // How far the box goes, and where it stops: exactly `to`, or exactly against what it met.
  let limit = d, stop = to
  if (d !== 0) {
    const dir = Math.sign(d), lead = dir > 0 ? box.x + box.w : box.x
    const top = box.y + EPS, bottom = (stood ? b - half : b) - EPS
    for (const s of solids) {
      if (s.oneway) continue
      for (const { p, q, dx, dy } of edges(s)) {
        if (dir > 0 ? dy >= 0 : dy <= 0) continue
        const lo = Math.max(Math.min(p[1], q[1]), top), hi = Math.min(Math.max(p[1], q[1]), bottom)
        if (lo > hi) continue
        const xAt = (y: number) => p[0] + ((y - p[1]) * dx) / dy
        const [xl, xh] = [xAt(lo), xAt(hi)]
        const [x, y] = (dir > 0 ? xl <= xh : xl >= xh) ? [xl, lo] : [xh, hi]
        if (dx > 0 && Math.abs(dy) <= dx && y >= b - half - EPS) continue
        const gap = x - lead
        if (dir > 0 ? gap < -EPS : gap > EPS) continue
        if (dir > 0 ? gap > limit + EPS : gap < limit - EPS) continue
        if (against(solids, s, p, q, lo, hi, dir)) continue
        const h = hit(dir > 0 ? 'right' : 'left', s, dx === 0 ? 0 : dy / dx)
        if (Math.abs(gap - limit) <= EPS && hits.length) hits.push(h)
        else {
          limit = gap
          hits = [h]
          stop = dir > 0 ? x - box.w : x
        }
      }
    }
  }
  const moved: Box = { ...box, x: stop }
  // The feet onto the surface under their new place.
  const rise = half + Math.abs(limit), drop = stood ? Math.abs(limit) : 0
  const from = box.x + half, feet = moved.x + half
  let ground: number | undefined
  for (const s of solids) {
    const t = along(s, feet, true)
    if (!t || t.y < b - rise - EPS || t.y > b + drop + EPS) continue
    if (s.oneway) {
      const was = along(s, Math.min(Math.max(from, s.x0), s.x1), true)
      if (!was || b > was.y + EPS) continue
    }
    if (ground === undefined || t.y < ground) ground = t.y
  }
  if (ground !== undefined && ground < b - EPS) {
    const lifted = up(solids, moved, ground - box.h)
    if (lifted.hits.length && lifted.box.y > ground - box.h + EPS)
      return { box: { ...box }, hits: unique([...lifted.hits.map(h => ({ ...h, side: d > 0 ? 'right' as const : 'left' as const })), ...standing(solids, box)]) }
  }
  if (ground !== undefined) moved.y = ground - box.h
  return { box: moved, hits: unique([...hits, ...(stood || ground !== undefined ? standing(solids, moved) : [])]) }
}

export function sweep(map: Tiled, edits: Edits | undefined, box: Box, axis: 0 | 1, to: number, solids: Box[] = []): { box: Box; hits: Hit[] } {
  const from = axis === 0 ? box.x : box.y
  const reach = Math.abs(to - from) + box.w + box.h
  const region = { x: Math.min(box.x, axis === 0 ? to : box.x) - reach, y: Math.min(box.y, axis === 1 ? to : box.y) - reach, w: box.w + 2 * reach + Math.abs(to - from), h: box.h + 2 * reach + Math.abs(to - from) }
  const all = solidsIn(map, edits, region, solids)
  if (axis === 0) return along0(all, box, to)
  const went = to >= box.y ? down(all, box, to) : up(all, box, to)
  return { box: went.box, hits: unique(went.hits) }
}

// ---------------------------------------------------------------- a mover on the grid

// Whether cell [c, r] blocks a mover that walks the map cell by cell, a circle that `slide`s: when
// it is outside the map, holds no tile on any tile layer, or holds a tile with collision on any.
// A layer moved off the grid by a part of a cell has no cells to answer for, and throws.
export function blocked(map: Tiled, edits: Edits | undefined, c: number, r: number): boolean {
  if (!map.infinite && (c < 0 || r < 0 || c >= map.width || r >= map.height)) return true
  let any = false
  for (const l of map.layers) {
    if (l.kind !== 'tiles') continue
    const [sx, sy] = l.shift
    if (!Number.isInteger(sx) || !Number.isInteger(sy)) throw new Error(`the tile layer ${l.name} is moved off the grid`)
    const [gid] = cellOf(l, edits, c - sx, r - sy)
    if (!gid) continue
    if (map.tiles[gid]?.shapes.length) return true
    any = true
  }
  return !any
}

// Where a circle of `radius` moving along one axis from `from` toward `to` stops against what
// blocks it, a cell or a solid's box, that spans `lo` to `hi` on that axis and whose nearest point
// on the other axis is `off` from the circle's centre. A circle that starts inside it may move out
// of it but no deeper in. That is what keeps a contact shut: the place a stop writes is the touching
// place only to within rounding, so the next step can start a rounding error inside.
function stop(from: number, to: number, lo: number, hi: number, off: number, radius: number): number {
  if (off >= radius) return to
  const reach = Math.sqrt(radius * radius - off * off)
  const near = lo - reach, far = hi + reach
  if (from <= near) return Math.min(to, near)
  if (from >= far) return Math.max(to, far)
  const depth = (at: number) => Math.min(at - near, far - at)
  return depth(to) <= depth(from) ? to : from
}

// Whether a mover at `pos`, a circle of `radius`, is clear of every cell that blocks and every box
// of `solids`, measured with the sums a stop is: clear of a row of cells when it is a radius or more from the row, and of a cell
// in a row it is nearer than that when it is at or past `lo - reach` or `lo + 1 + reach` along x, to
// within `EPS`. At a cell's corner a stop along y reaches it by how far across the mover is, and this
// works back from how far down it is, and the two square roots agree only to within a rounding error:
// a mover a stop left 0.0171 cells across from a corner was found inside it by that error.
export function clear(map: Tiled, edits: Edits | undefined, pos: number[], radius: number, solids: Box[] = []): boolean {
  for (let r = Math.floor(pos[1] - radius); r <= Math.floor(pos[1] + radius); r++) {
    if (pos[1] <= r - radius || pos[1] >= r + 1 + radius) continue
    const off = Math.max(r - pos[1], 0, pos[1] - r - 1)
    if (off >= radius) continue
    const reach = Math.sqrt(radius * radius - off * off)
    for (let c = Math.floor(pos[0] - radius); c <= Math.floor(pos[0] + radius); c++)
      if (pos[0] > c - reach + EPS && pos[0] < c + 1 + reach - EPS && blocked(map, edits, c, r)) return false
  }
  for (const s of solids) {
    if (pos[1] <= s.y - radius || pos[1] >= s.y + s.h + radius) continue
    const off = Math.max(s.y - pos[1], 0, pos[1] - s.y - s.h)
    if (off >= radius) continue
    const reach = Math.sqrt(radius * radius - off * off)
    if (pos[0] > s.x - reach + EPS && pos[0] < s.x + s.w + reach - EPS) return false
  }
  return true
}

// Where a mover at `pos` going along axis 0 (x) or 1 (y) toward `to` stops against the cells that
// block and the boxes of `solids`. Moving along x and then along y, each stopped, slides a mover
// along a wall it runs into slantwise, and round a solid's corner.
//
// A mover is clear of a row of cells beside it when it is a radius or more from the row, and that is
// worked out with the same sums a stop puts a mover against a face with: `b - radius` and
// `b + 1 + radius`. Working it out as the gap between them, `b - (b - radius)`, comes to a hair under
// the radius for some `b` (8 - (8 - 0.3) is 0.2999999999999998), and a mover a stop left touching a
// wall would be caught at every seam between the wall's cells.
export function slide(map: Tiled, edits: Edits | undefined, pos: number[], axis: 0 | 1, to: number, radius: number, solids: Box[] = []): number {
  const other = 1 - axis
  let at = to
  for (let b = Math.floor(pos[other] - radius); b <= Math.floor(pos[other] + radius); b++) {
    if (pos[other] <= b - radius || pos[other] >= b + 1 + radius) continue
    const off = Math.max(b - pos[other], 0, pos[other] - b - 1)
    for (let a = Math.floor(Math.min(pos[axis], to) - radius); a <= Math.floor(Math.max(pos[axis], to) + radius); a++) {
      if (axis === 0 ? blocked(map, edits, a, b) : blocked(map, edits, b, a)) at = stop(pos[axis], at, a, a + 1, off, radius)
    }
  }
  for (const s of solids) {
    const [lo, size, olo, osize] = axis === 0 ? [s.x, s.w, s.y, s.h] : [s.y, s.h, s.x, s.w]
    if (pos[other] <= olo - radius || pos[other] >= olo + osize + radius) continue
    const off = Math.max(olo - pos[other], 0, pos[other] - olo - osize)
    at = stop(pos[axis], at, lo, lo + size, off, radius)
  }
  return at
}
