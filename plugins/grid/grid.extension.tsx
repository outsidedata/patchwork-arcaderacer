// The grid's extension: the Cells panel and the Paint Cells tool, over the grid of the scene the game
// view shows, or failing that the scene `focus('grid')` says.
//
// The Cells panel (`grid.components.tsx`) shows the grid's layers as `world.grid` names them, each
// with its bits and scale, and the brush: a layer picked, a value from 0 to the most its bits hold,
// and a size, cells across; and the cell under the pointer while Paint Cells is in hand, every
// layer's value there.
//
// Paint Cells (Tools, key G) paints the grid of the scene the view shows. The cell under the pointer
// is the one whose top is drawn there (`pick` of the grid's browser half, by the heights the cells are
// drawn at), outlined at that top; pressed and dragged, every cell the brush covers, the cell under
// the pointer and `size` − 1 more right and down, less half of them back, has its value of the layer
// set, the cells of each chunk shown at once through the recorder's preview; let go, what was painted
// is one change the editor can undo: for each chunk the stroke touched, one edit of its row's
// `cells.<layer>`, the string that holds that layer's values. A stroke the tool is put away in the
// middle of is taken back, every chunk as it was.
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here, on the
// rows of any scene with a grid, whatever the game view shows:
//   grid.paint   one stroke of Paint Cells: a value of a layer set in each cell of a list, or of a
//                rectangle, one edit of each chunk's `cells.<layer>` it touched, one undo
//                (`painting`, which the tool's stroke is too), answering the layer's values about
//                the cells painted; called while a stroke of the tool is dragged over the same grid,
//                it paints the rows as they are without that stroke, and the stroke takes each chunk
//                it wrote with its own cells over it (`rebase`), so letting it go keeps both;
//   grid.read    the grid's size, chunks and layers, as the panel lists them, and each layer's values
//                over a rectangle of cells, as the panel reads the cell under the pointer (`valuesAt`).
// A cell is [x, y], x along a row and y down the rows, as `cells` reads it, and a rectangle of cells
// [x0, y0, x1, y1], between two corner cells, both in it.
import { z } from 'zod'
import { CELL as cell, RECT as rect, type Edits, type Editor, type Pointer } from '#editor/editor.ts'
import { cells, spec, type Cells, type Spec } from './grid.sim.ts'
import { CellsPanel } from './grid.components.tsx'

export type Brush = { layer?: string; value: number; size: number }
// Where the pointer is over the grid: the scene, and the cell, and every layer's value there.
export type Over = { scene: string; x: number; y: number; values: Record<string, number> }

// What the Cells panel and Paint Cells share: the brush and the cell the pointer is over.
export type Painter = {
  subscribe(f: () => void): () => void
  version(): number
  brush: Brush
  over: Over | undefined
  set(patch: Partial<Brush>): void
  hover(over: Over | undefined): void
}

function painter(): Painter {
  let version = 0
  const listeners = new Set<() => void>()
  const changed = () => {
    version++
    for (const f of listeners) f()
  }
  const me: Painter = {
    subscribe(f) {
      listeners.add(f)
      return () => { listeners.delete(f) }
    },
    version: () => version,
    brush: { value: 0, size: 1 },
    over: undefined,
    set(patch) {
      me.brush = { ...me.brush, ...patch }
      changed()
    },
    hover(over) {
      if (JSON.stringify(over) === JSON.stringify(me.over)) return
      me.over = over
      changed()
    },
  }
  return me
}

// The scene whose grid the panel is on: the one the view shows, when it has a grid, else the one
// `focus('grid')` says.
export function gridScene(ed: Editor): string | undefined {
  const s = ed.session
  if (!s) return undefined
  if (s.viewing && s.scene(s.viewing).world?.grid) return s.viewing
  return ed.focus('grid')?.scene
}

// The most a value of a layer of `g` holds.
export const most = (g: Spec, layer: string) => 2 ** g.layers[layer].bits - 1

// Every layer's value at cell [x, y] of `c`: what the panel shows of the cell under the pointer.
export const valuesAt = (c: Cells, x: number, y: number): Record<string, number> => Object.fromEntries(c.layers.map(l => [l, c.get(l, x, y)]))

// A cell outside the grid of `c`, refused, naming the grid's size.
const outside = (c: Cells, x: number, y: number) => new Error(`cell [${x}, ${y}] is not inside the grid of ${c.size[0]} × ${c.size[1]}`)

// A stroke of `value` into `layer` of the grid of `scene`, painted into copies of its chunks' rows:
// `paint` sets each cell it is handed and answers the rows of the chunks it touched, and `save` makes
// one edit of each chunk's `cells.<layer>` the stroke touched, through `e`. `was` holds each touched
// chunk's string as the rows had it before the stroke. Refused when the grid has no layer `layer`, or
// the layer holds no value `value`; a cell outside the map is refused before any is painted, naming
// the map's size.
//
// A stroke of the tool being dragged over the same grid, `beneath`, shows its cells through the
// recorder's preview, which are none of the rows' yet: this stroke starts from the rows as they are
// without them. Once this one is saved, `beneath.rebase` takes each chunk it wrote as the rows now
// hold it, with its own cells painted over it again, so letting it go writes both.
export function painting(ed: Editor, scene: string, layer: string, value: number, beneath?: { scene: string; layer: string; was: ReadonlyMap<number, string> }) {
  const truth = ed.sceneOf(scene, 'grid')
  const g = spec(truth.world)
  if (!(layer in g.layers)) throw new Error(`the grid of ${scene} has no layer ${layer}: its layers are ${Object.keys(g.layers).join(', ')}`)
  if (!Number.isInteger(value) || value < 0 || value > most(g, layer)) throw new Error(`${layer} holds whole numbers from 0 to ${most(g, layer)}, not ${value}`)
  const under = beneath?.scene === scene ? beneath : undefined
  const copies = truth.rows.filter(r => r.kind === 'grid').map(r => {
    const saved = under?.was.get(r.id)
    return { ...r, data: { ...r.data, cells: { ...r.data.cells, ...(saved !== undefined && { [under!.layer]: saved }) } } }
  })
  const c = cells({ world: truth.world, rows: copies })
  const across = g.size[0] / g.chunk
  const chunkOf = (x: number, y: number) => Math.floor(y / g.chunk) * across + Math.floor(x / g.chunk)
  const was = new Map<number, string>()
  // Every cell painted, so a chunk taken anew is painted again.
  const painted: number[][] = []
  return {
    scene, layer, value, was,
    paint(at: number[][]) {
      for (const [x, y] of at) if (!c.inside(x, y)) throw outside(c, x, y)
      const touched = new Set(at.map(([x, y]) => chunkOf(x, y)))
      const rows = copies.filter(r => touched.has(r.data.k))
      for (const r of rows) if (!was.has(r.id)) was.set(r.id, r.data.cells[layer])
      for (const [x, y] of at) c.set(layer, x, y, value)
      painted.push(...at)
      return rows
    },
    save(e: Edits) {
      for (const id of was.keys()) e.editRow(scene, id, ['cells', layer], copies.find(r => r.id === id)!.data.cells[layer])
    },
    // The cells of the rectangle `r`, [x0, y0, x1, y1], a row at a time from its top left.
    rect: (r: number[]) => within(c, r),
    // The stroke's cells: the rows as they were, and what it painted.
    cells: c,
    // Chunk row `id` taken as the rows now hold its string of this stroke's layer, `now`, and, when
    // this stroke has touched it, what the stroke painted there painted over it again: that row,
    // or undefined for a row this stroke has not touched.
    rebase(id: number, now: string) {
      const r = copies.find(r => r.id === id)!
      r.data.cells[layer] = now
      if (!was.has(id)) return undefined
      was.set(id, now)
      for (const [x, y] of painted) if (chunkOf(x, y) === r.data.k) c.set(layer, x, y, value)
      return r
    },
  }
}

// The most values `grid.read` answers at once, cells times layers: about twenty thousand characters
// of JSON, well inside what an LLM is handed of one call.
const READ = 4096

// A rectangle's corners in the grid of `c`, its top left and its bottom right; a corner outside the
// grid is refused, naming its size, before a cell of the rectangle is counted.
const corners = (c: Cells, [a, b, x, y]: number[]) => {
  for (const [i, j] of [[a, b], [x, y]]) if (!c.inside(i, j)) throw outside(c, i, j)
  return { x0: Math.min(a, x), y0: Math.min(b, y), x1: Math.max(a, x), y1: Math.max(b, y) }
}
// The cells of a rectangle, a row at a time from its top left.
const within = (c: Cells, r: number[]): number[][] => {
  const { x0, y0, x1, y1 } = corners(c, r)
  const out: number[][] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y])
  return out
}

// The grid of `scene` as `grid.read` answers it: its size, chunk and layers, as the panel lists them,
// and, over the rectangle `r`, the values of `layer`, or of every layer, a row of cells at a time from
// its top left, as the panel reads the cell under the pointer (`valuesOver`); a corner outside the map
// is refused, naming the map's size.
export function readGrid(ed: Editor, scene: string, layer?: string, r?: number[]) {
  const g = spec(ed.sceneOf(scene, 'grid').world)
  if (layer !== undefined && !(layer in g.layers)) throw new Error(`the grid of ${scene} has no layer ${layer}: its layers are ${Object.keys(g.layers).join(', ')}`)
  const layers = Object.fromEntries(Object.entries(g.layers).map(([name, l]) => [name, { bits: l.bits, scale: l.scale }]))
  const out = { scene, size: g.size, chunk: g.chunk, layers }
  if (!r) return out
  const truth = ed.sceneOf(scene, 'grid')
  return { ...out, ...valuesOver(cells({ world: truth.world, rows: truth.rows }), layer === undefined ? Object.keys(g.layers) : [layer], r) }
}

// The values of each layer of `names` of the cells `c` over the rectangle `r`, a row of cells at a
// time from its top left, and the rectangle by its top left and bottom right; more than `READ`
// values is refused.
function valuesOver(c: Cells, names: string[], r: number[]) {
  const { x0, y0, x1, y1 } = corners(c, r)
  const count = (x1 - x0 + 1) * (y1 - y0 + 1) * names.length
  if (count > READ) throw new Error(`${count} values asked for, and a read answers at most ${READ}: narrow the rectangle, or name a layer`)
  const values: Record<string, number[][]> = Object.fromEntries(names.map(n => [n, []]))
  for (let y = y0; y <= y1; y++) {
    for (const n of names) values[n].push([])
    for (let x = x0; x <= x1; x++) {
      const v = valuesAt(c, x, y)
      for (const n of names) values[n][y - y0].push(v[n])
    }
  }
  return { rect: [x0, y0, x1, y1], values }
}

// The cells a brush of `size` covers about cell [x, y], on a map of `size`.
export function covered([w, h]: [number, number], x: number, y: number, size: number): [number, number][] {
  const out: [number, number][] = []
  const from = Math.floor((size - 1) / 2)
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
    const cx = x - from + dx, cy = y - from + dy
    if (cx >= 0 && cy >= 0 && cx < w && cy < h) out.push([cx, cy])
  }
  return out
}

export function grid(ed: Editor) {
  const p = painter()
  function Panel() {
    return <CellsPanel painter={p} />
  }
  ed.panel({ id: 'grid', title: 'Cells', area: 'right', component: Panel })

  // The grid's browser half and render2d's, for the scene the view shows, when it has a grid.
  const drawn = (scene: string) => {
    const s = ed.session
    const plugins = s?.viewing === scene ? s.client?.plugins : undefined
    return plugins?.grid && plugins.render2d ? plugins : undefined
  }
  // The cell whose top is drawn under the pointer, and the grid it is of.
  const under = (at: Pointer) => {
    const plugins = drawn(at.scene)
    const truth = ed.session?.scene(at.scene)
    if (!plugins || !truth?.world?.grid) return undefined
    const canvas = plugins.render2d.canvas as HTMLCanvasElement | undefined
    const css = canvas ? parseFloat(canvas.style.width) : NaN
    const dense = canvas && css > 0 ? canvas.width / css : 1
    const cell = plugins.grid.pick(at.x / dense, at.y / dense) as [number, number] | undefined
    return cell && { cell, plugins, truth, g: spec(truth.world) }
  }

  // The stroke being dragged.
  let stroke: ReturnType<typeof painting> | undefined
  let unmark: (() => void) | undefined
  const outline = (at: Pointer | undefined) => {
    unmark?.()
    unmark = undefined
    if (!at) return p.hover(undefined)
    const got = under(at)
    if (!got) return p.hover(undefined)
    const [x, y] = got.cell
    p.hover({ scene: at.scene, x, y, values: valuesAt(cells({ world: got.truth.world, rows: got.truth.rows }), x, y) })
    const h = got.plugins.grid.top(x, y)
    unmark = at.stage.mark([[x, y, h], [x + 1, y, h], [x + 1, y + 1, h], [x, y + 1, h], [x, y, h]], 0xffffff)
  }
  // The cells the brush covers under the pointer painted, each chunk they touched shown at once.
  const paint = (at: Pointer) => {
    const got = under(at)
    const st = stroke
    if (!got || !st || at.scene !== st.scene) return
    for (const r of st.paint(covered(got.g.size, got.cell[0], got.cell[1], p.brush.size))) ed.session!.preview(st.scene, r.id, ['cells', st.layer], r.data.cells[st.layer])
  }
  // A stroke put away unsaved: every chunk it touched shown as it was.
  const takeBack = () => {
    const st = stroke
    stroke = undefined
    if (!st) return
    for (const [id, was] of st.was) ed.session?.preview(st.scene, id, ['cells', st.layer], was)
  }

  ed.tool({
    id: 'grid.paint',
    title: 'Paint Cells',
    key: 'G',
    cursor: 'crosshair',
    hover: outline,
    down(at) {
      outline(at)
      takeBack()
      const got = under(at)
      const { layer, value } = p.brush
      if (!got || layer === undefined) return
      try {
        stroke = painting(ed, at.scene, layer, value)
      } catch (e) {
        return ed.error(`Paint Cells: ${(e as Error).message}`)
      }
      paint(at)
    },
    move(at) {
      outline(at)
      paint(at)
    },
    up() {
      const st = stroke
      stroke = undefined
      if (!st || !st.was.size) return
      try {
        ed.together(one => st.save(one))
      } catch (e) {
        for (const [id, was] of st.was) ed.session?.preview(st.scene, id, ['cells', st.layer], was)
        ed.error(`Paint Cells: ${(e as Error).message}`, (e as Error).stack)
      }
    },
    off() {
      takeBack()
      outline(undefined)
    },
  })

  ed.command({
    id: 'grid.paint',
    title: 'Grid: paint cells',
    input: z.object({
      scene: z.string().describe('a scene with grid rows'),
      layer: z.string().describe('the layer painted'),
      value: z.number().int().describe('0 to the most the layer\'s bits hold'),
      cells: z.array(cell.describe('[x, y]')).min(1).optional().describe('the cells painted, x along a row and y down the rows'),
      rect: rect.optional().describe('or the cells of a rectangle, [x0, y0, x1, y1], its corners in it'),
    }).describe(`One stroke of Paint Cells: a value set in a grid layer's cells, one edit of each chunk row it touches, one undo. Answers the cells and chunks (k) painted, and the layer's values over the rectangle about them, if at most ${READ}.`),
    run: ({ scene, layer, value, cells: list, rect: r }, e) => {
      if (!list === !r) throw new Error('grid.paint paints the cells of a list or of a rectangle: name cells or rect, and not both')
      const under = stroke
      const st = painting(ed, scene, layer, value, under)
      const at = list ?? st.rect(r!)
      const rows = st.paint(at)
      st.save(e)
      // The rectangle about what was painted: the one given, or the list's, taken a cell at a time.
      let box: number[]
      if (r) {
        const { x0, y0, x1, y1 } = corners(st.cells, r)
        box = [x0, y0, x1, y1]
      } else {
        box = [Infinity, Infinity, -Infinity, -Infinity]
        for (const [x, y] of at) box = [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)]
      }
      const area = (box[2] - box[0] + 1) * (box[3] - box[1] + 1)
      const answer = {
        scene, layer, value,
        cells: new Set(at.map(c => c.join())).size,
        chunks: rows.map(r => r.data.k as number).sort((a, b) => a - b),
        rect: box,
        ...(area <= READ && { values: valuesOver(st.cells, [layer], box).values[layer] }),
      }
      // A stroke of the tool being dragged on this layer takes the chunks this one wrote, and shows
      // them with its own cells over them.
      if (under?.scene === scene && under.layer === layer) for (const row of rows) {
        const again = under.rebase(row.id, row.data.cells[layer])
        if (again) ed.session!.preview(scene, row.id, ['cells', layer], again.data.cells[layer])
      }
      return answer
    },
  })
  ed.command({
    id: 'grid.read',
    title: 'Grid: read cells',
    input: z.object({
      scene: z.string().describe('a scene with grid rows'),
      layer: z.string().optional().describe('the one layer read; every layer when left out'),
      rect: rect.optional().describe('the cells whose values are read, [x0, y0, x1, y1], its corners in it; none when left out'),
    }).describe(`A scene's grid as the Cells panel shows it: its size in cells, its chunk, each layer's bits and scale; and over a rectangle a layer's values, or every layer's, as the panel reads the cell under the pointer, a row of cells at a time from its top left. At most ${READ} values.`),
    run: ({ scene, layer, rect }) => readGrid(ed, scene, layer, rect),
  })
}
