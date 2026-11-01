// The browser half of grid: draws the cells of the grid's chunk rows (`grid.sim.ts`) on a render2d
// layer, redrawing a cell only when a value it is drawn from changes.
//
// What a cell looks like is not the grid's to say. A game hands it a look, `look(fn, reach)`: `fn` is
// handed the grid's cells, as a rule reads them (`cells`), and a cell [x, y], and hands back what is
// drawn for that cell, a list of draws, each a frame of a loader `sheet` entry:
//
//   sheet   the name of a `sheet` entry of the scene's loader catalogue.
//   frame   the id of a frame of it; or
//   clip    a clip of it, played on the page's own clock and never the step counter's, since a grid
//           that steps once a second would play it at one frame a second: each frame for the
//           duration the sheet gives it, or for 1 / `fps` seconds when the sheet times none; or
//   frames  a list of its frames' ids, played the same way, each for 1 / `fps` seconds, as a ripped
//           sheet with no clips in it has its palette's cycles drawn out frame by frame. Every cell
//           showing one clip, or one list, shows the same frame at the same moment.
//   at      the world point the frame's anchor stands on, [x, y]; the cell's bottom corner, the one
//           nearest the viewer, [x + 1, y + 1], when left out.
//   lift    how many steps of render2d's `up` above that point, 0 when left out: a cell's height.
//   sort    the world point whose depth orders it among everything on the layer, `at` when left out;
//           and `tie`, 0 when left out, which orders the draws of one depth, the higher over.
//   alpha, tint  as a sprite has them, 1 and 0xffffff when left out.
//
// `fn` may read any cell, and a cell is drawn from its neighbours as well as itself (a road's piece
// is chosen by the roads beside it, a slope's by the heights around it). `reach` is how many cells
// away a value may be and still change what a cell looks like: when a value changes, every cell
// within `reach` of it across and down is drawn again. So `fn` is asked about a cell only when one
// of those changed, when the look is handed over, or while a sheet a draw names has not landed.
//
// The layer is `world.grid.layer`, a render2d layer that sorts, so a draw is ordered by the depth of
// its `sort` point: a building stood on its footprint's front cell is drawn over the ground behind
// it and under what stands in front. Every frame is drawn on whole pixels when its sheet is
// `nearest`, as pixel art is. A sheet a draw names that is written while the game runs, its file or
// a page of it, is drawn again: every cell, once the loader holds the sheet as it now is
// (`onWritten`), since the frames cut from the sheet before are gone.
//
// `preview(edits)` draws edits, each `[layer, x, y, value]`, over the cells the packets bring until
// the next `preview`, and `preview(null)` stops: what a seat would build, drawn while it drags and
// before it asks, as the city's own pieces.
//
// `pick(x, y, height)` is the cell whose top is drawn at the canvas point [x, y], in render2d's
// canvas pixels, or undefined when no cell is: `height(cx, cy)` is how many steps up a cell's top is;
// left out, it is the top the cell is drawn at, the highest `lift` of the draws that stand on the
// cell itself, those with no `at`, 0 for a cell not drawn yet. The point is unprojected at heights
// from `top`, the most any cell reaches, the highest any cell is drawn at when left out, down to 0 in
// steps of 1/16, the nearest the viewer first, and the first cell found whose top is at or above the
// height it was found at is the one: a hill in front hides the cells behind it. `top(x, y)` is the
// top cell [x, y] is drawn at, as `pick` reads it. `cells()` is the grid as it is drawn, the packets'
// cells with the preview in them, for whatever else the page shows of it; `ahead()` is the packets'
// cells without the preview, which a seat plans its next change on.
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { cells, spec, width, type Cells, type Spec } from './grid.sim.ts'

export type Draw = {
  sheet: string
  frame?: string
  clip?: string
  frames?: string[]
  fps?: number
  at?: [number, number]
  lift?: number
  sort?: [number, number]
  tie?: number
  alpha?: number
  tint?: number
}
export type Look = (c: Cells, x: number, y: number) => Draw[]
export type Edit = [layer: string, x: number, y: number, value: number]

// How much a tie moves a draw's depth: far under the 1 pixel two neighbouring cells' depths differ by.
const TIE = 1 / 1024

export function grid() {
  let looker: { fn: Look; reach: number } | undefined
  let previewed: Edit[] = []
  // What each chunk's strings were when its cells were last drawn, by `k`.
  let seen = new Map<number, Record<string, string>>()
  // Each cell's sprites, by its place, y × w + x, and the cells to draw again.
  let sprites: any[][] = []
  // Each cell's top as it is drawn, by its place, and the highest of them.
  let tops = new Map<number, number>()
  let highest = 0
  const dirty = new Set<number>()
  // The sheets a draw has named, each heard being written.
  const heard = new Set<string>()
  // Every sprite that plays a clip, with the clip.
  const playing = new Map<any, { sheet: string; clip?: string; frames?: string[]; fps?: number }>()
  let plugins: Plugins | undefined
  let s: Spec | undefined
  let view: Cells | undefined
  let settled: Cells | undefined

  const layerName = (p: Plugins) => {
    const name = p.wire.scene.world?.grid?.layer
    if (typeof name !== 'string') throw new Error('world.grid.layer names no render2d layer to draw the grid on')
    return name
  }

  // The rows the grid is drawn from: the packet's, and when `preview` is true and there is one, each
  // chunk copied and the preview's edits made in the copies.
  const rowsOf = (p: Plugins, preview: boolean): Row[] => {
    const chunks = p.wire.rows.filter(r => r.kind === 'grid')
    if (!(preview && previewed.length)) return chunks
    const copies = chunks.map(r => ({ ...r, data: { ...r.data, cells: { ...r.data.cells } } }))
    const c = cells({ world: p.wire.scene.world, rows: copies })
    for (const [layer, x, y, v] of previewed) c.set(layer, x, y, v)
    return copies
  }

  // Every cell within `reach` of the cells of chunk `k` whose values of `layer` changed from `was`
  // to `now`, marked to be drawn again; all of them when there was nothing before.
  const mark = (k: number, layer: string, was: string | undefined, now: string) => {
    const g = s!
    const l = g.layers[layer]
    const chars = width(l.bits), per = g.chunk / l.scale
    const across = g.size[0] / g.chunk
    const cx = (k % across) * g.chunk, cy = Math.floor(k / across) * g.chunk
    const reach = looker?.reach ?? 0
    for (let i = 0; i < per * per; i++) {
      if (was !== undefined && was.substr(i * chars, chars) === now.substr(i * chars, chars)) continue
      const bx = cx + (i % per) * l.scale, by = cy + Math.floor(i / per) * l.scale
      for (let y = by - reach; y < by + l.scale + reach; y++) for (let x = bx - reach; x < bx + l.scale + reach; x++) {
        if (x >= 0 && y >= 0 && x < g.size[0] && y < g.size[1]) dirty.add(y * g.size[0] + x)
      }
    }
  }

  const all = () => {
    if (!s) return
    for (let i = 0; i < s.size[0] * s.size[1]; i++) dirty.add(i)
  }

  // The frame a clip, or a list of frames, shows now, on the page's clock.
  const frameNow = (sheet: any, { clip, frames, fps }: { clip?: string; frames?: string[]; fps?: number }): string => {
    const c = clip === undefined ? undefined : sheet.data.clips[clip]
    if (clip !== undefined && !c) throw new Error(`sheet has no clip ${clip}`)
    const run: string[] = c ? c.runs[0] : frames!
    if (!run.length) throw new Error('a draw plays a list of no frames')
    const durations: number[] = c?.durations ?? run.map(() => {
      if (!(typeof fps === 'number' && fps > 0)) throw new Error(`${clip === undefined ? 'a list of frames' : `clip ${clip}`} times none of its frames, and the draw gives no fps above 0`)
      return 1 / fps
    })
    const loop = durations.reduce((a, b) => a + b, 0)
    let t = (performance.now() / 1000) % loop
    for (let i = 0; i < run.length; i++) {
      if (t < durations[i]) return run[i]
      t -= durations[i]
    }
    return run[run.length - 1]
  }

  const drop = (sprite: any) => {
    playing.delete(sprite)
    sprite.destroy()
  }

  // Draws cell i again. False when a sheet it needs has not landed, so it stays to be drawn.
  const redraw = (p: Plugins, i: number): boolean => {
    const { render2d, loader } = p
    const { PIXI } = render2d
    const g = s!
    const x = i % g.size[0], y = Math.floor(i / g.size[0])
    const draws = looker!.fn(view!, x, y)
    const sheets = draws.map(d => {
      const it = loader.get(d.sheet)
      if (!it) loader.load(d.sheet)
      return it
    })
    if (sheets.some(it => !it)) return false
    for (const d of draws) if (!heard.has(d.sheet)) {
      heard.add(d.sheet)
      loader.onWritten(d.sheet, all)
    }
    const have = (sprites[i] ??= [])
    const top = Math.max(0, ...draws.filter(d => !d.at).map(d => d.lift ?? 0))
    tops.set(i, top)
    highest = Math.max(highest, top)
    const layer = render2d.layer(layerName(p))
    while (have.length > draws.length) drop(have.pop())
    draws.forEach((d, j) => {
      const sheet = sheets[j]
      let sprite = have[j]
      if (!sprite) layer.addChild((sprite = have[j] = new PIXI.Sprite()))
      const plays = d.clip !== undefined || d.frames !== undefined
      if (plays) playing.set(sprite, { sheet: d.sheet, clip: d.clip, frames: d.frames, fps: d.fps })
      else playing.delete(sprite)
      const id = plays ? frameNow(sheet, d) : d.frame
      if (id === undefined) throw new Error(`a draw of cell [${x}, ${y}] names neither a frame, a clip nor frames of ${d.sheet}`)
      const f = sheet.data.frames[id]
      if (!f) throw new Error(`sheet ${d.sheet} has no frame ${id}, which cell [${x}, ${y}] draws`)
      const at = d.at ?? [x + 1, y + 1]
      const [px, py] = render2d.place([at[0], at[1], d.lift ?? 0])
      const nearest = sheet.data.nearest
      sprite.texture = sheet.texture(id)
      sprite.anchor.set(f.anchor[0] / f.size[0], f.anchor[1] / f.size[1])
      sprite.roundPixels = nearest
      sprite.position.set(nearest ? Math.round(px) : px, nearest ? Math.round(py) : py)
      sprite.zIndex = render2d.depth(d.sort ?? at) + (d.tie ?? 0) * TIE
      sprite.alpha = d.alpha ?? 1
      sprite.tint = d.tint ?? 0xffffff
    })
    return true
  }

  const me = {
    // The look every cell is drawn with from the next frame on, and how far a change reaches.
    look(fn: Look, reach = 1) {
      if (!Number.isInteger(reach) || reach < 0) throw new Error(`a look's reach is a whole number of cells, not ${reach}`)
      looker = { fn, reach }
      all()
    },
    preview(edits: Edit[] | null) { previewed = (edits ?? []).map(e => [...e] as Edit) },
    cells(): Cells | undefined { return view },
    ahead(): Cells | undefined { return settled },
    pick(x: number, y: number, height?: (cx: number, cy: number) => number, top?: number): [number, number] | undefined {
      if (!plugins || !s) return undefined
      const w = s.size[0]
      height ??= (cx, cy) => tops.get(cy * w + cx) ?? 0
      top ??= highest
      for (let h = top; h >= 0; h -= 1 / 16) {
        const [wx, wy] = plugins.render2d.unproject(x, y, h)
        const cx = Math.floor(wx), cy = Math.floor(wy)
        if (cx < 0 || cy < 0 || cx >= s.size[0] || cy >= s.size[1]) continue
        if (height(cx, cy) >= h) return [cx, cy]
      }
      return undefined
    },
    top(x: number, y: number): number {
      return s ? (tops.get(y * s.size[0] + x) ?? 0) : 0
    },
    afterTick(p: Plugins) {
      plugins = p
      const world = p.wire.scene.world
      const layer = p.render2d.layer(layerName(p))
      if (!layer.sortableChildren) throw new Error(`world.grid.layer ${layerName(p)} is a render2d layer that does not sort`)
      s = spec(world)
      const rows = rowsOf(p, true)
      const count = (s.size[0] / s.chunk) * (s.size[1] / s.chunk)
      if (rows.length < count) return
      view = cells({ world, rows })
      settled = previewed.length ? cells({ world, rows: rowsOf(p, false) }) : view
      const now = new Map<number, Record<string, string>>()
      for (const r of rows) {
        const was = seen.get(r.data.k)
        for (const layer of Object.keys(s.layers)) if (was?.[layer] !== r.data.cells[layer]) mark(r.data.k, layer, was?.[layer], r.data.cells[layer])
        now.set(r.data.k, { ...r.data.cells })
      }
      seen = now
      if (looker) for (const i of [...dirty]) if (redraw(p, i)) dirty.delete(i)
      for (const [sprite, play] of playing) {
        const it = p.loader.get(play.sheet)
        sprite.texture = it.texture(frameNow(it, play))
      }
    },
    close() {
      for (const list of sprites) for (const sprite of list ?? []) drop(sprite)
      sprites = []
      tops = new Map()
      highest = 0
      seen = new Map()
      dirty.clear()
    },
  }
  return me
}
