// The components of the tilemap extension (tilemap.extension.tsx).
//
// A Tiled map is the editor's copy of the map's file and of each tileset file it names, and is drawn
// from what the loader's own reading of that copy makes of it (`readMap`), so the panel lays out,
// flips, animates and collides each tile as the game does and cuts nothing itself. The copy, and
// what each tool, field and button does to it, are the extension's (`tilemap.extension.tsx`), which
// its commands do too; here is how it is drawn and how the pointer and the keys reach it.
//
// `MapView` shows a map and does not edit it, drawn by the same code as the Tiles panel's, with marks
// on it, points of its cells, drawn as diamonds or as a sheet's frames, and areas of them, and hands
// the pointer and the keys to whoever shows it: the ground a game's own level editor builds on,
// placing its things on the map as it likes.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useEditor, useText, useTexts } from '#editor/context.ts'
import { useLive, type Live } from '#editor/live.ts'
import { Check, JsonField, NumberField, Select, TextField, VecField } from '#editor/ui/fields.tsx'
import { Badge, Button, Empty, LabelledRow, Note, PanelBody, Row, Section, Split, Strip, Toolbar } from '#editor/ui/layout.tsx'
import { drawFrame, useImages } from '#editor/ui/images.ts'
import { FrameImage, Surface, type SurfacePointer } from '#editor/ui/sheet.tsx'
import { Tree, type TreeItem } from '#editor/ui/tree.tsx'
import { GID, readMap, type Frame, type Tiled, type TiledObject, type Tile } from '#plugins/loader/loader.sim.ts'
import {
  blankOf, bounds, cellOf, classKey, classOf, drawable, entryOf, FLIP_D, FLIP_H, FLIP_V, flat, flipOf, freeTileNames, kindOf, layerAdded, layerAt,
  layerMoved, layerNames, layerRemoved, layerSet, LEFT, mapCodec, objectAdded, objectClasses, objectSet, OPACITY, pathOf, PRESETS, presetOf, projectIn,
  rawOf, refsOf, render2dOf, resized, RIGHT, setOf, SIZE, strokeOn, tiledOf, tileClasses, tileSet, typesIn, unpacked, withObject, withoutObject, withoutProp, withProp,
  type Doc, type Flat, type Shape, type Stroke, type PropType, type Pt, type R2, type TLayer, type TMap, type TObject, type V2,
} from './tilemap.extension.tsx'
import { flipped } from './tilemap.plugin.ts'
import type { Edits } from './tilemap.sim.ts'
// Where the map is on the surface: a world point [x, y] is drawn at its projection times `zoom`,
// plus `pan`.
type View = { zoom: number; pan: V2 }

// ---------------------------------------------------------------- the picture

// How render2d lays the world out: a step along x and along y on the ground, and a step of height.
type Ground = { gx: V2; gy: V2; up: V2 }
const project = (g: Ground, p: number[]): V2 => [p[0] * g.gx[0] + p[1] * g.gy[0], p[0] * g.gx[1] + p[1] * g.gy[1]]
const unproject = (g: Ground, [x, y]: V2): V2 => {
  const det = g.gx[0] * g.gy[1] - g.gy[0] * g.gx[1]
  return [(x * g.gy[1] - y * g.gy[0]) / det, (y * g.gx[0] - x * g.gx[1]) / det]
}
const toScreen = (g: Ground, v: View, p: number[]): V2 => {
  const [x, y] = project(g, p)
  return [x * v.zoom + v.pan[0], y * v.zoom + v.pan[1]]
}
const cellAt = (g: Ground, v: View, sx: number, sy: number): V2 => {
  const [x, y] = unproject(g, [(sx - v.pan[0]) / v.zoom, (sy - v.pan[1]) / v.zoom])
  return [Math.floor(x), Math.floor(y)]
}

// The view that shows the whole of a `cols` by `rows` map on a `w` by `h` surface, with a margin.
function fit(g: Ground, cols: number, rows: number, w: number, h: number, reach: number): View {
  const corners = [[0, 0], [cols, 0], [0, rows], [cols, rows]].map(p => project(g, p))
  const xs = corners.map(p => p[0]), ys = corners.map(p => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - reach, y1 = Math.max(...ys)
  const zoom = Math.min(w / Math.max(1, x1 - x0), h / Math.max(1, y1 - y0)) * 0.9
  return { zoom, pan: [w / 2 - ((x0 + x1) / 2) * zoom, h / 2 - ((y0 + y1) / 2) * zoom] }
}

// A view zoomed by the wheel about the pointer. Each turn of the wheel zooms the view the one before
// it left, so turns faster than the panel draws each count.
const zoomed = (v: View, p: SurfacePointer, dy: number): View => {
  const zoom = Math.min(64, Math.max(0.05, v.zoom * Math.exp(-dy * 0.0015)))
  const f = zoom / v.zoom
  return { zoom, pan: [p.x - (p.x - v.pan[0]) * f, p.y - (p.y - v.pan[1]) * f] }
}

const cellPath = (ctx: CanvasRenderingContext2D, g: Ground, v: View, c: number, r: number) => {
  const pts = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]].map(p => toScreen(g, v, p))
  ctx.beginPath()
  ctx.moveTo(...pts[0])
  for (const p of pts.slice(1)) ctx.lineTo(...p)
  ctx.closePath()
}

// ---------------------------------------------------------------- the panel

// The cells a game that has changed none has changed: one list, so the map is not drawn again for an
// empty one made anew.
const NO_EDITS: Edits = {}

export function Tiles() {
  const ed = useEditor(['game', 'selection'])
  const s = ed.session
  // The level of the scene selected, else of the one the game view shows, else the first with one.
  const tiled = ed.scenesWith('tilemap')
  const sel = ed.selection && 'scene' in ed.selection ? ed.selection.scene : undefined
  const scene = [sel, s?.viewing].find(n => n && tiled.includes(n)) ?? tiled[0] ?? s?.viewing
  const { tm, file, asset } = scene ? entryOf(s!.scene(scene)) : { tm: undefined, file: undefined, asset: undefined }
  const path = asset?.url.replace(/^\//, '')
  const text = useText(path)

  if (!s) return <Empty>Open a game, and the level of the scene selected is edited here.</Empty>
  if (!scene) return <Empty>No scene of {s.game.name} has a tilemap.</Empty>
  if (!tm) return <Empty>The scene {scene} has no tilemap.</Empty>
  if (!asset || asset.type !== 'tilemap') return <Empty>The scene's world.tilemap names {String(file)}, which is no tilemap entry of the loader: a Tiled map is edited here.</Empty>
  if (text === undefined) return <Empty>Reading {path}…</Empty>
  const prefab = render2dOf(ed, scene)
  const folder = s.game.path.split('/').slice(0, -1).join('/')
  return <MapFiles key={`${scene}:${path}`} path={path!} url={asset.url} text={text} prefab={prefab} folder={folder} edits={(tm.data.edits ?? NO_EDITS) as Edits} />
}

// A Tiled colour, `#rrggbb` or `#aarrggbb`, for a canvas.
const cssOf = (c: string | undefined) => {
  const m = /^#([0-9a-f]{2})?([0-9a-f]{6})$/i.exec(c ?? '')
  if (!m) return undefined
  const n = parseInt(m[2], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${m[1] ? parseInt(m[1], 16) / 255 : 1})`
}

// ---------------------------------------------------------------- the files

// The map's file, its tilesets' files and the game's Tiled project, read, then the editor on them.
function MapFiles({ path, url, text, prefab, folder, edits }: { path: string; url: string; text: string; prefab: R2; folder: string; edits: Edits }) {
  const ed = useEditor([])
  let map: TMap | undefined, bad: string | undefined
  try {
    map = JSON.parse(text)
  } catch (e) {
    bad = (e as Error).message
  }
  const setPaths = map ? refsOf(map, url).flatMap(r => (r.path ? [r.path] : [])) : []
  const setTexts = useTexts(setPaths)
  // The game's Tiled project, a `.tiled-project` in its folder, when it has one.
  const [project, setProject] = useState<string | null>()
  useEffect(() => {
    let gone = false
    projectIn(ed, folder).then(
      found => { if (!gone) setProject(found ?? null) },
      e => {
        ed.error(`${folder}: ${(e as Error).message}`)
        if (!gone) setProject(null)
      },
    )
    return () => { gone = true }
  }, [ed, folder])
  const projectText = useText(project ?? undefined)
  // The project's types, read once for each text of it, so the map is drawn again only when they
  // change.
  const { types, typesBad } = useMemo((): { types: PropType[]; typesBad?: string } => {
    if (!project || projectText === undefined) return { types: [] }
    try {
      return { types: typesIn(projectText) }
    } catch (e) {
      return { types: [], typesBad: `${project} is no JSON: ${(e as Error).message}` }
    }
  }, [project, projectText])

  if (bad) return <Empty>{path} is no JSON: {bad}</Empty>
  if (setTexts.some(t => t === undefined) || project === undefined || (project && projectText === undefined)) return <Empty>Reading {path}…</Empty>
  const texts: Record<string, string> = { [path]: text, ...Object.fromEntries(setPaths.map((p, i) => [p, setTexts[i]!])) }
  try {
    mapCodec(path, url).read(Object.fromEntries(Object.entries(texts).map(([p, t]) => [p, JSON.parse(t)])))
  } catch (e) {
    return <Empty>{(e as Error).message}</Empty>
  }
  return <MapEditor path={path} url={url} texts={texts} types={types} typesBad={typesBad} projectFile={project ?? undefined} prefab={prefab} edits={edits} />
}

// ---------------------------------------------------------------- the editor

type Tool = 'paint' | 'erase' | 'fill' | 'pick' | 'select' | 'rect' | 'ellipse' | 'point' | 'polygon' | 'tile'
const TILE_TOOLS: { tool: Tool; title: string }[] = [
  { tool: 'paint', title: 'Paint' },
  { tool: 'erase', title: 'Erase' },
  { tool: 'fill', title: 'Fill' },
  { tool: 'pick', title: 'Pick' },
]
const OBJECT_TOOLS: { tool: Tool; title: string }[] = [
  { tool: 'select', title: 'Select' },
  { tool: 'rect', title: 'Rectangle' },
  { tool: 'ellipse', title: 'Ellipse' },
  { tool: 'point', title: 'Point' },
  { tool: 'polygon', title: 'Polygon' },
  { tool: 'tile', title: 'Tile object' },
]

type Snap = 'pixel' | 'half' | 'cell'
// An edit that makes an object or a layer: what it made, once it is written, and how many choices had
// been made as it was asked for.
type Landing = { object?: number; layer?: number; type?: 'tilelayer' | 'objectgroup'; chosen: number }
// How near, in pixels, the pointer must be to a handle or a point to take it.
const GRAB = 6
// What a press of the pointer is doing until it is let go.
type Drag =
  | { mode: 'stroke'; last: string; stroke: Stroke }
  | { mode: 'pan'; from: V2; was: View }
  | { mode: 'move'; from: V2; obj: TObject; set?: Partial<TObject> }
  | { mode: 'corner'; fixed: V2; obj: TObject; set?: Partial<TObject> }
  | { mode: 'vertex'; i: number; obj: TObject; set?: Partial<TObject> }
  | { mode: 'make'; from: V2; id?: number; ellipse: boolean; box?: [number, number, number, number] }

// How the map's cells are laid out, as the tilemap plugin has render2d lay them out.
const groundOf = (m: { orientation: string; tilewidth: number; tileheight: number }): Ground =>
  m.orientation === 'isometric'
    ? { gx: [m.tilewidth / 2, m.tileheight / 2], gy: [-m.tilewidth / 2, m.tileheight / 2], up: [0, -1] }
    : { gx: [m.tilewidth, 0], gy: [0, m.tileheight], up: [0, -1] }
const onScreen = (v: View, [x, y]: number[]): V2 => [x * v.zoom + v.pan[0], y * v.zoom + v.pan[1]]

// The gid a tile shows `ms` into its animation, round and round; its own without one.
function showing(t: Tiled, gid: number, ms: number): number {
  const anim = t.tiles[gid]?.animation
  if (!anim) return gid
  const total = anim.reduce((s, a) => s + a.duration, 0)
  let at = ms % total
  for (const a of anim) {
    if (at < a.duration) return a.tile
    at -= a.duration
  }
  return anim[anim.length - 1].tile
}

// A tile drawn with its top left at [x, y] on a canvas, `w` by `h`, flipped as its bits say; `over`
// draws in the tile's own pixels, flipped with it.
function drawTile(ctx: CanvasRenderingContext2D, img: HTMLImageElement | undefined, tile: Tile, flip: number, x: number, y: number, w: number, h: number, over?: (tw: number, th: number) => void) {
  const [bx, by, tw, th] = tile.box
  const { rotation, scale } = flipped(flip)
  // Turned and scaled about its middle, as the tilemap plugin's sprite is.
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate(rotation)
  ctx.scale(scale[0], scale[1])
  if (img) ctx.drawImage(img, bx, by, tw, th, -w / 2, -h / 2, w, h)
  if (over) {
    ctx.translate(-w / 2, -h / 2)
    ctx.scale(w / tw, h / th)
    over(tw, th)
  }
  ctx.restore()
}

const shapePath = (ctx: CanvasRenderingContext2D, pts: number[][]) => {
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.closePath()
}

// ---------------------------------------------------------------- a picture of a map

// A colour of the design system's, as the canvas's theme sets it.
const colorsOf = (ctx: CanvasRenderingContext2D) => {
  const css = getComputedStyle(ctx.canvas)
  return (name: string) => css.getPropertyValue(name).trim() || '#888'
}

// What a map is drawn from: the map as the loader reads it and as its file holds it, its layers, how
// its cells are laid out, the view, and what a panel shows over the game's own look.
type Picture = {
  tiled: Tiled
  map: TMap
  layers: Flat[]
  g: Ground
  view: View
  // The cells the map lies in, and how far a tile reaches up out of its cell, in pixels.
  extent: [number, number, number, number]
  reach: number
  // The step animations have reached, in milliseconds.
  now: number
  imageOf(url: string): HTMLImageElement | undefined
  // Layers this panel does not draw, and the layers worked on, drawn faintly when hidden in the game.
  hidden?: Set<number>
  current?: (number | undefined)[]
  // The cells the game has changed, on its tilemap row.
  edits?: Edits
  showShapes?: boolean
  showGrid?: boolean
  types?: PropType[]
  // The object selected: its layer's id and its own.
  chosen?: { layer: number | undefined; id: number | undefined }
}

// Where a tile of a cell stands on the screen: its top left, and its size.
function tileRectOf(p: Picture, tile: Tile, shift: V2, c: number, r: number): [number, number, number, number] {
  const iso = p.map.orientation === 'isometric', k = p.view.zoom
  const ts = p.tiled.tilesets[tile.tileset], [, , tw, th] = tile.box
  const [bx, by] = project(p.g, [c + (iso ? 1 : 0) + shift[0], r + 1 + shift[1]])
  const [sx, sy] = onScreen(p.view, [bx - (iso ? tw / 2 : 0) + ts.offset[0], by - th + ts.offset[1]])
  return [sx, sy, tw * k, th * k]
}

// The map drawn as the game draws it, on a `w` by `h` surface: its ground in its background colour,
// every layer, the objects of its object layers with their names or classes, the grid while a cell
// is big enough on the screen for it, and the map's edge.
function drawPicture(ctx: CanvasRenderingContext2D, w: number, h: number, p: Picture) {
  const { tiled, map, g, view: shown, extent, reach, now, edits = {}, hidden, current = [], types = [], chosen } = p
  const iso = map.orientation === 'isometric'
  const color = colorsOf(ctx)
  const k = shown.zoom
  // The cells the surface shows, with room for tiles taller than their cells.
  const corners = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => unproject(g, [(x - shown.pan[0]) / k, (y - shown.pan[1]) / k]))
  const more = Math.ceil(reach / map.tileheight) + 1
  const [c0, c1] = [Math.floor(Math.min(...corners.map(q => q[0]))) - more, Math.ceil(Math.max(...corners.map(q => q[0]))) + more]
  const [r0, r1] = [Math.floor(Math.min(...corners.map(q => q[1]))) - more, Math.ceil(Math.max(...corners.map(q => q[1]))) + more]
  const outline = (x: number, y: number, cw: number, ch: number) => shapePath(ctx, [[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch]].map(q => toScreen(g, shown, q)))

  // The map's ground, in its background colour.
  outline(extent[0], extent[1], extent[2], extent[3])
  ctx.fillStyle = tiled.background !== null ? `#${tiled.background.toString(16).padStart(6, '0')}` : color('--canvas')
  ctx.fill()

  // A tile's collision shapes, filled and outlined a screen pixel wide: a one-way one in the warning
  // colour, anything else in the danger colour.
  const shapes = (tile: Tile) => () => {
    ctx.lineWidth = 1 / k
    for (const s of tile.shapes) {
      ctx.fillStyle = ctx.strokeStyle = color(s.top ? '--warn' : '--danger')
      shapePath(ctx, s.points)
      ctx.globalAlpha = 0.4
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.stroke()
    }
  }
  p.layers.forEach(({ layer: raw, drawn }) => {
    if (drawn < 0 || hidden?.has(raw.id)) return
    const l = tiled.layers[drawn]
    // A layer hidden in the game is drawn faintly while it is the one worked on, so it can be seen.
    const alpha = l.opacity * (l.visible ? 1 : current.includes(raw.id) ? 0.4 : 0)
    if (!alpha) return
    ctx.globalAlpha = alpha
    ctx.imageSmoothingEnabled = false
    if (l.kind === 'tiles') {
      // A cell as the game draws it: the gid and flip bits the map gives it, or the game's edit of it.
      const cell = (c: number, r: number): [number, number] => {
        const e = edits[`${l.name}:${c},${r}`]
        if (e !== undefined) return [e < 0 ? 0 : e, 0]
        const i = (r - l.y) * l.width + (c - l.x)
        return c < l.x || r < l.y || c >= l.x + l.width || r >= l.y + l.height ? [0, 0] : [l.data[i], l.flips[i]]
      }
      const one = (c: number, r: number) => {
        const [gid, flip] = cell(c, r)
        if (!gid) return
        const tile = tiled.tiles[showing(tiled, gid, now)]
        const [sx, sy, sw, sh] = tileRectOf(p, tiled.tiles[gid], l.shift, c, r)
        drawTile(ctx, p.imageOf(tile.page), tile, flip, sx, sy, sw, sh)
        if (!p.showShapes || !tiled.tiles[gid].shapes.length) return
        if (iso) {
          // An isometric map's tile with any shape collides as its whole cell.
          ctx.fillStyle = ctx.strokeStyle = color(tiled.tiles[gid].shapes.every(s => s.top) ? '--warn' : '--danger')
          ctx.lineWidth = 1
          outline(c + l.shift[0], r + l.shift[1], 1, 1)
          ctx.globalAlpha = 0.4
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.stroke()
        } else drawTile(ctx, undefined, tiled.tiles[gid], flip, sx, sy, sw, sh, shapes(tiled.tiles[gid]))
        ctx.globalAlpha = alpha
      }
      const lc0 = Math.max(l.x, c0 - Math.ceil(l.shift[0])), lc1 = Math.min(l.x + l.width, c1 - Math.floor(l.shift[0]))
      const lr0 = Math.max(l.y, r0 - Math.ceil(l.shift[1])), lr1 = Math.min(l.y + l.height, r1 - Math.floor(l.shift[1]))
      for (let r = lr0; r < lr1; r++) for (let c = lc0; c < lc1; c++) one(c, r)
      // The game's edits past the layer's cells, as an infinite map's.
      for (const key of Object.keys(edits)) {
        if (!key.startsWith(`${l.name}:`)) continue
        const [c, r] = key.slice(l.name.length + 1).split(',').map(Number)
        if (c < l.x || r < l.y || c >= l.x + l.width || r >= l.y + l.height) one(c, r)
      }
    } else if (l.kind === 'image') {
      const img = p.imageOf(l.image)
      if (!img) return
      const [ox, oy] = [(iso ? -(map.height * map.tilewidth) / 2 : 0) + l.offset[0], l.offset[1]]
      // A layer that repeats is laid across the whole of the map along that axis.
      const [ex0, ey0] = project(g, [extent[0], extent[1]]), [ex1, ey1] = project(g, [extent[0] + extent[2], extent[1] + extent[3]])
      const xs = l.repeat[0] ? range(ox, ex0, ex1, img.width) : [ox]
      const ys = l.repeat[1] ? range(oy, ey0, ey1, img.height) : [oy]
      for (const x of xs) for (const y of ys) {
        const [sx, sy] = onScreen(shown, [x, y])
        ctx.drawImage(img, sx, sy, img.width * k, img.height * k)
      }
    } else {
      for (const o of l.objects) drawObject(o, raw)
    }
  })
  ctx.globalAlpha = 1

  // One object: its shape in its class's colour, a tile object's tile, and its name or class.
  function drawObject(o: TiledObject, layer: TLayer) {
    const cls = types.find(t => t.name === o.type)
    const tone = cssOf(cls?.color) ?? color('--series-1')
    const on = layer.id === chosen?.layer && o.id === chosen?.id
    ctx.strokeStyle = on ? color('--accent') : tone
    ctx.fillStyle = tone
    ctx.lineWidth = on ? 2 : 1
    const at = (x: number, y: number) => toScreen(g, shown, [x, y])
    const [lx, ly] = at(o.x, o.y)
    if (o.point) {
      ctx.beginPath()
      ctx.arc(lx, ly, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(lx, ly - 10)
      ctx.stroke()
    } else if (o.polygon || o.polyline) {
      const pts = (o.polygon ?? o.polyline)!.map(([x, y]) => at(o.x + x, o.y + y))
      ctx.beginPath()
      pts.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)))
      if (o.polygon) ctx.closePath()
      ctx.stroke()
      if (o.polygon) {
        ctx.globalAlpha = 0.25
        ctx.fill()
        ctx.globalAlpha = 1
      }
    } else if (o.tile !== undefined) {
      const tile = tiled.tiles[showing(tiled, o.tile, now)]
      const [sx, sy] = at(o.x, o.y), [ex, ey] = at(o.x + o.w, o.y + o.h)
      drawTile(ctx, p.imageOf(tile.page), tile, o.flip ?? 0, sx, sy, ex - sx, ey - sy)
      ctx.strokeRect(sx, sy, ex - sx, ey - sy)
    } else if (o.ellipse) {
      const pts = Array.from({ length: 32 }, (_, i) => {
        const a = (i / 32) * Math.PI * 2
        return at(o.x + o.w / 2 + (Math.cos(a) * o.w) / 2, o.y + o.h / 2 + (Math.sin(a) * o.h) / 2)
      })
      shapePath(ctx, pts)
      ctx.stroke()
      ctx.globalAlpha = 0.25
      ctx.fill()
      ctx.globalAlpha = 1
    } else {
      shapePath(ctx, [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]].map(([x, y]) => at(x, y)))
      ctx.stroke()
      ctx.globalAlpha = 0.25
      ctx.fill()
      ctx.globalAlpha = 1
    }
    const label = o.name || o.type
    if (label) {
      ctx.font = '11px sans-serif'
      ctx.fillStyle = on ? color('--accent') : color('--fg')
      ctx.fillText(label, lx + 5, ly - (o.point ? 12 : 3))
    }
  }

  // The grid, while a cell is big enough on the screen for it to show the cells and not hide them.
  if (p.showGrid && Math.min(map.tilewidth, map.tileheight) * k >= 6) {
    ctx.strokeStyle = color('--border')
    ctx.lineWidth = 1
    const [gx0, gx1] = [Math.max(extent[0], c0), Math.min(extent[0] + extent[2], c1)], [gy0, gy1] = [Math.max(extent[1], r0), Math.min(extent[1] + extent[3], r1)]
    ctx.beginPath()
    for (let c = gx0; c <= gx1; c++) { ctx.moveTo(...toScreen(g, shown, [c, gy0])); ctx.lineTo(...toScreen(g, shown, [c, gy1])) }
    for (let r = gy0; r <= gy1; r++) { ctx.moveTo(...toScreen(g, shown, [gx0, r])); ctx.lineTo(...toScreen(g, shown, [gx1, r])) }
    ctx.stroke()
  }
  // The map's edge.
  ctx.strokeStyle = color('--dim')
  outline(extent[0], extent[1], extent[2], extent[3])
  ctx.stroke()
}

// ---------------------------------------------------------------- marks, and a map shown

// A sheet's frame a mark is drawn as: the frame, on its page's image, its anchor on the mark's point
// as sprite2d stands a row's on its `pos`, and drawn flipped about its anchor when `mirror`.
export type Sprite = { image: CanvasImageSource; frame: Frame; mirror?: boolean }
// A thing of a panel's on the map, in its cells as the map's objects are, with a label. A point is a
// diamond where it stands, filled, or hollow for one shown and not to be moved; given a `sprite` it
// is drawn as that and labelled only while it is selected, the picture saying what it is. An area,
// given a `size`, is the `size` cells from `at`, its top-left corner, outlined, its label inside it
// where it is wide enough to hold it, and always while it is selected.
// A panel on a map makes its marks of whatever it places on it.
export type Mark = { id: string; label: string; at: [number, number]; hollow?: boolean; size?: [number, number]; sprite?: Sprite }
// How near, in pixels, the pointer must be to a mark or a handle to take it, and a mark's size.
const MARK = 6

// Whether two lists of marks draw the same: each mark's id, label, place, size and whether it is
// hollow the same, and its sprite the same image, frame and mirroring.
const sameMarks = (a: Mark[], b: Mark[]) => a.length === b.length && a.every((m, i) => {
  const n = b[i]
  return m.id === n.id && m.label === n.label && m.at[0] === n.at[0] && m.at[1] === n.at[1] && m.hollow === n.hollow
    && m.size?.[0] === n.size?.[0] && m.size?.[1] === n.size?.[1]
    && m.sprite?.image === n.sprite?.image && m.sprite?.frame === n.sprite?.frame && m.sprite?.mirror === n.sprite?.mirror
})

// The marks in the order they are drawn: the areas under the points, each in the order given.
const drawOrder = (marks: Mark[]) => [...marks.filter(m => m.size), ...marks.filter(m => !m.size)]

// Where a point's sprite covers on the screen, the point drawn at [x, y]: its left, top, width and
// height.
function spriteBox(s: Sprite, x: number, y: number, k: number): [number, number, number, number] {
  const [w, h] = s.frame.size, [ax, ay] = s.frame.anchor
  return [x - (s.mirror ? w - ax : ax) * k, y - ay * k, w * k, h * k]
}

// Each mark over everything the map draws: an area outlined in the fourth series colour, its label
// inside its top-left corner where the area is wide enough on the screen to hold it; a point as its sprite, or a diamond, filled in the
// second series colour and hollow in the third, its label beside it; the one selected in the accent
// colour, an area faintly filled, always labelled, and with the handle that resizes it on its
// bottom-right corner.
function drawMarks(ctx: CanvasRenderingContext2D, g: Ground, v: View, marks: Mark[], selected: string | undefined) {
  const color = colorsOf(ctx)
  ctx.font = '11px sans-serif'
  for (const m of drawOrder(marks)) {
    const [x, y] = toScreen(g, v, m.at)
    const on = m.id === selected
    ctx.lineWidth = on ? 2 : 1
    if (m.size) {
      const [w, h] = m.size
      ctx.strokeStyle = ctx.fillStyle = on ? color('--accent') : color('--series-4')
      const corners = [[0, 0], [w, 0], [w, h], [0, h]].map(([dx, dy]) => toScreen(g, v, [m.at[0] + dx, m.at[1] + dy]))
      shapePath(ctx, corners)
      if (on) {
        ctx.globalAlpha = 0.2
        ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.stroke()
      const across = Math.max(...corners.map(q => q[0])) - Math.min(...corners.map(q => q[0]))
      if (on || ctx.measureText(m.label).width + 8 <= across) ctx.fillText(m.label, x + 4, y + 13)
      if (on) {
        const [hx, hy] = toScreen(g, v, [m.at[0] + w, m.at[1] + h])
        ctx.fillRect(hx - MARK / 2, hy - MARK / 2, MARK, MARK)
      }
      continue
    }
    ctx.strokeStyle = ctx.fillStyle = on ? color('--accent') : color(m.hollow ? '--series-3' : '--series-2')
    if (m.sprite) {
      const [bx, by, bw, bh] = spriteBox(m.sprite, x, y, v.zoom)
      ctx.imageSmoothingEnabled = false
      if (m.sprite.mirror) {
        ctx.save()
        ctx.translate(x, 0)
        ctx.scale(-1, 1)
        drawFrame(ctx, m.sprite.image, m.sprite.frame, -m.sprite.frame.anchor[0] * v.zoom, by, v.zoom)
        ctx.restore()
      } else drawFrame(ctx, m.sprite.image, m.sprite.frame, bx, by, v.zoom)
      if (on) {
        ctx.strokeRect(bx, by, bw, bh)
        ctx.fillText(m.label, bx + bw + 3, by + 9)
      }
      continue
    }
    ctx.lineWidth = 2
    shapePath(ctx, [[x, y - MARK], [x + MARK, y], [x, y + MARK], [x - MARK, y]])
    if (!m.hollow || on) {
      ctx.globalAlpha = 0.6
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.stroke()
    ctx.fillText(m.label, x + MARK + 3, y + 4)
  }
}

// The mark under a screen point, the topmost: the last drawn whose sprite, diamond or area holds it.
function markAt(g: Ground, v: View, marks: Mark[], sx: number, sy: number): Mark | undefined {
  const [px, py] = unproject(g, [(sx - v.pan[0]) / v.zoom, (sy - v.pan[1]) / v.zoom])
  return drawOrder(marks).reverse().find(m => {
    if (m.size) return px >= m.at[0] && py >= m.at[1] && px <= m.at[0] + m.size[0] && py <= m.at[1] + m.size[1]
    const [x, y] = toScreen(g, v, m.at)
    if (!m.sprite) return Math.abs(x - sx) + Math.abs(y - sy) <= MARK + 3
    const [bx, by, bw, bh] = spriteBox(m.sprite, x, y, v.zoom)
    return sx >= bx && sy >= by && sx <= bx + bw && sy <= by + bh
  })
}

// The mark in a cell, the topmost: a point standing in it, else an area holding it.
const markIn = (marks: Mark[], [c, r]: V2): Mark | undefined =>
  drawOrder(marks).reverse().find(m => (m.size ? c >= m.at[0] && r >= m.at[1] && c + 1 <= m.at[0] + m.size[0] && r + 1 <= m.at[1] + m.size[1] : Math.floor(m.at[0]) === c && Math.floor(m.at[1]) === r))

// Whether a screen point is on the handle of the area selected, on its bottom-right corner.
function onHandle(g: Ground, v: View, marks: Mark[], selected: string | undefined, sx: number, sy: number): boolean {
  const m = marks.find(k => k.id === selected)
  if (!m?.size) return false
  const [hx, hy] = toScreen(g, v, [m.at[0] + m.size[0], m.at[1] + m.size[1]])
  return Math.abs(hx - sx) <= MARK && Math.abs(hy - sy) <= MARK
}

// Where the pointer is on a map shown: the point in the map's cells, the cell it is in, and the mark
// under it; `corner` when it is on the handle of the area selected, which is then the mark.
export type MapPointer = { at: [number, number]; cell: [number, number]; mark: string | undefined; corner: boolean; shift: boolean }
// A view that keeps a point of the map in the middle of the surface, whatever its size.
type Centred = { zoom: number; centre: V2 }

// A Tiled map shown, drawn as the Tiles panel draws one, and not edited: `map` is the map's JSON,
// which need not be a file yet, as a generator makes it, and `url` where it is, or would be, which
// its tilesets are named from, read through the editor's files. It is fitted to the surface, zoomed
// by the wheel, and moved by a right or middle drag, or a left one with shift, or with no `onDown`.
// Each new `seek` centres the view on its point, at the view's zoom and no less than a screen pixel
// to a map pixel, and holds the point in the middle as the panel is resized, until the view is moved.
// Over it are `marks`, `selected` the one drawn selected; a left press, a move with it held and its
// release are handed to `onDown`, `onMove` and `onUp` in the map's cells, with the mark under the
// pointer, and a double click to `onDouble`. The arrows move a cursor from cell to cell while the
// map has the focus, and every other key is handed to `onKey` with the cell the cursor is on. The
// bar names the cell under the pointer and the mark there, after the `tools` a panel puts on it.
export function MapView({ map, url, label, marks = [], selected, seek, onDown, onMove, onUp, onDouble, onKey, tools }: {
  map: unknown
  url: string
  label: string
  marks?: Mark[]
  selected?: string
  seek?: { at: [number, number] }
  onDown?(p: MapPointer): void
  onMove?(p: MapPointer): void
  onUp?(p: MapPointer): void
  onDouble?(p: MapPointer): void
  onKey?(e: KeyboardEvent, cursor: [number, number] | undefined): void
  tools?: ReactNode
}) {
  const m = map as TMap
  const setPaths = refsOf(m, url).flatMap(r => (r.path ? [r.path] : []))
  const setTexts = useTexts(setPaths)
  const [view, setView] = useState<View | Centred | undefined>(() => (seek ? { zoom: 1, centre: seek.at } : undefined))
  const [size, setSize] = useState<V2>([0, 0])
  const [hover, setHover] = useState<V2>()
  const drag = useRef<{ pan: true; from: V2; was: View } | { pan: false } | undefined>(undefined)
  // The marks as they were last drawn while a new list draws the same, so a panel that makes its marks
  // anew at each drawing has the map drawn again only for marks that changed.
  const [held, setHeld] = useState(marks)
  const steady = sameMarks(held, marks) ? held : marks
  if (steady !== held) setHeld(steady)
  // The theme, whose colours the map and its marks are drawn in.
  const theme = useEditor(['theme']).theme
  useEffect(() => {
    if (seek) setView(v => ({ zoom: Math.max(1, v?.zoom ?? 1), centre: seek.at }))
  }, [seek])
  const read = useMemo((): { tiled?: Tiled; error?: string } => {
    if (setTexts.some(t => t === undefined)) return {}
    try {
      return { tiled: readMap(drawable(unpacked(m, url)), url, u => {
        const i = setPaths.indexOf(u.replace(/^\//, ''))
        if (i < 0) throw new Error(`${u} has not been read`)
        return JSON.parse(setTexts[i]!)
      }) }
    } catch (e) {
      return { error: (e as Error).message }
    }
  // `setTexts` is every tileset's text, and changes whenever one does.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, url, setTexts.join('\n')])
  const tiled = read.tiled
  const pages = tiled ? [...new Set([...Object.values(tiled.tiles).map(t => t.page), ...tiled.layers.flatMap(l => (l.kind === 'image' ? [l.image] : []))])] : []
  const loaded = useImages(pages)
  if (read.error) return <Empty>{read.error}</Empty>
  if (!tiled) return <Empty>Reading the tilesets of {url}…</Empty>

  const g = groundOf(m)
  const layers = flat(m)
  const extent: [number, number, number, number] = [0, 0, m.width, m.height]
  const reach = Math.max(0, ...Object.values(tiled.tiles).map(t => t.box[3]))
  const centred = (c: Centred): View => {
    const [x, y] = project(g, c.centre)
    return { zoom: c.zoom, pan: [size[0] / 2 - x * c.zoom, size[1] / 2 - y * c.zoom] }
  }
  const shown: View = !view ? (size[0] ? fit(g, m.width, m.height, size[0], size[1], reach) : { zoom: 1, pan: [0, 0] }) : 'centre' in view ? centred(view) : view
  const under = hover && markIn(marks, hover)
  const pointer = (p: SurfacePointer): MapPointer => {
    const at = unproject(g, [(p.x - shown.pan[0]) / shown.zoom, (p.y - shown.pan[1]) / shown.zoom])
    const corner = onHandle(g, shown, marks, selected, p.x, p.y)
    return { at, cell: [Math.floor(at[0]), Math.floor(at[1])], mark: corner ? selected : markAt(g, shown, marks, p.x, p.y)?.id, corner, shift: p.shift }
  }

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (w !== size[0] || h !== size[1]) queueMicrotask(() => setSize([w, h]))
    drawPicture(ctx, w, h, { tiled, map: m, layers, g, view: shown, extent, reach, now: 0, imageOf: u => loaded?.[pages.indexOf(u)], showGrid: true })
    drawMarks(ctx, g, shown, marks, selected)
    if (hover) {
      ctx.strokeStyle = colorsOf(ctx)('--accent')
      ctx.lineWidth = 2
      cellPath(ctx, g, shown, hover[0], hover[1])
      ctx.stroke()
    }
  }
  const key = (e: KeyboardEvent) => {
    const step: Record<string, V2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    if (step[e.key]) {
      setHover(([c, r] = [0, 0]) => [c + step[e.key][0], r + step[e.key][1]])
      e.preventDefault()
      e.stopPropagation()
      return
    }
    onKey?.(e, hover)
    if (e.defaultPrevented) e.stopPropagation()
  }
  return (
    <PanelBody bar={
      <Toolbar label={`${label} tools`}>
        {tools}
        <Button title="Fit" onClick={() => setView(undefined)}>Fit</Button>
        <span className="ui-spacer" />
        <Badge tone={hover ? undefined : 'dim'}>{hover ? `cell ${hover[0]}, ${hover[1]}${under ? ` · ${under.label}` : ''}` : `${m.width} × ${m.height} cells, ${marks.length} marked`}</Badge>
      </Toolbar>
    }>
      <Surface
        label={label}
        version={[m, steady, selected, shown.zoom, shown.pan[0], shown.pan[1], hover, loaded, read, theme]}
        draw={draw}
        onDown={p => {
          if (p.button !== 0 || p.shift || !onDown) {
            drag.current = { pan: true, from: [p.x, p.y], was: shown }
            return
          }
          drag.current = { pan: false }
          onDown(pointer(p))
        }}
        onMove={p => {
          const here = pointer(p)
          if (!hover || hover[0] !== here.cell[0] || hover[1] !== here.cell[1]) setHover(here.cell)
          const d = drag.current
          if (!d || !p.buttons) return
          if (d.pan) setView({ zoom: d.was.zoom, pan: [d.was.pan[0] + p.x - d.from[0], d.was.pan[1] + p.y - d.from[1]] })
          else onMove?.(here)
        }}
        onUp={p => {
          const d = drag.current
          drag.current = undefined
          if (d && !d.pan) onUp?.(pointer(p))
        }}
        onDouble={onDouble && (p => onDouble(pointer(p)))}
        onLeave={() => setHover(undefined)}
        onWheel={(p, dy) => setView(zoomed(shown, p, dy))}
        onKey={key}
      />
    </PanelBody>
  )
}

function MapEditor({ path, url, texts, types, typesBad, projectFile, prefab, edits }: {
  path: string
  url: string
  texts: Record<string, string>
  types: PropType[]
  typesBad: string | undefined
  projectFile: string | undefined
  prefab: R2
  // The cells the game has changed since the map was read, on its tilemap row as the view's step leaves it.
  edits: Edits
}) {
  const codec = useMemo(() => mapCodec(path, url), [path, url])
  const live: Live<Doc> = useLive<Doc>(texts, codec)
  // The theme, whose colours the map is drawn in.
  const theme = useEditor(['theme']).theme
  const doc = live.value
  const map = doc.map
  const read = useMemo((): { tiled: Tiled; error?: undefined } | { error: string; tiled?: undefined } => {
    try {
      return { tiled: tiledOf(doc, url) }
    } catch (e) {
      return { error: (e as Error).message }
    }
  // `doc` is made anew with its map or its tilesets.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, doc.sets, url])
  const tiled = read.tiled
  const layers = useMemo(() => flat(map), [map])
  const refs = useMemo(() => refsOf(map, url), [map, url])
  const g = groundOf(map)
  const iso = map.orientation === 'isometric'
  const unit: V2 = iso ? [map.tileheight, map.tileheight] : [map.tilewidth, map.tileheight]

  const firstGid = refs[0]?.firstgid ?? 1
  const [tool, setTool] = useState<Tool>('paint')
  const [brush, setBrush] = useState(firstGid)
  const [setAt, setSetAt] = useState(0)
  const [paintOn, setPaintOn] = useState(() => layers.find(f => f.layer.type === 'tilelayer')?.layer.id)
  const [placeOn, setPlaceOn] = useState(() => layers.find(f => f.layer.type === 'objectgroup')?.layer.id)
  const [looked, setLooked] = useState(() => paintOn)
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [showGrid, setShowGrid] = useState(true)
  const [showShapes, setShowShapes] = useState(false)
  const [snap, setSnap] = useState<Snap>('half')
  const [hover, setHover] = useState<V2>()
  const [view, setView] = useState<View>()
  const [size, setSize] = useState<V2>([0, 0])
  const [sel, setSel] = useState<number>()
  const [poly, setPoly] = useState<V2[]>()
  const [newProp, setNewProp] = useState<{ name: string; type: string }>({ name: '', type: 'string' })
  const drag = useRef<Drag | undefined>(undefined)
  // What the last edit that makes an object or a layer made, filled in as it is written, and how many
  // times an object or a layer has been chosen, by the pointer, the keys or a list. The edit is state,
  // set with the write it waits on, so the drawing that selects it sees it and that write together: an
  // effect of a drawing from before it, run late, finds no edit there.
  const [landing, setLanding] = useState<Landing>()
  const chosen = useRef(0)
  const choose = (id: number | undefined) => {
    chosen.current++
    setSel(id)
  }

  // The step animations have reached, in milliseconds, moved on as often as the shortest frame.
  const animated = tiled ? Object.values(tiled.tiles).filter(t => t.animation) : []
  const beat = animated.length ? Math.max(16, Math.min(...animated.flatMap(t => t.animation!.map(a => a.duration)))) : 0
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!beat) return
    const t = setInterval(() => setNow(n => n + beat), beat)
    return () => clearInterval(t)
  }, [beat])

  // Every image the map draws: its tiles' pages and its image layers'.
  const pages = tiled ? [...new Set([...Object.values(tiled.tiles).map(t => t.page), ...tiled.layers.flatMap(l => (l.kind === 'image' ? [l.image] : []))])] : []
  const loaded = useImages(pages)
  const imageOf = (url: string) => loaded?.[pages.indexOf(url)]

  const paintPath = pathOf(map, paintOn)
  const paintLayer = paintPath && layerAt(map, paintPath).type === 'tilelayer' ? layerAt(map, paintPath) : undefined
  const placePath = pathOf(map, placeOn)
  const placeLayer = placePath && layerAt(map, placePath).type === 'objectgroup' ? layerAt(map, placePath) : undefined
  const shiftOf = (id: number | undefined): V2 => {
    const f = layers.find(x => x.layer.id === id)
    return f && tiled && f.drawn >= 0 ? tiled.layers[f.drawn].shift : [0, 0]
  }
  const placeShift = shiftOf(placeOn)
  const selected = placeLayer?.objects?.find(o => o.id === sel)
  const tileSize = (gid: number): V2 => {
    const t = tiled?.tiles[gid & GID]
    return t ? [t.box[2], t.box[3]] : unit
  }

  // The extent of the map, in cells: its size, or an infinite one's layers' bounds.
  const extent = ((): [number, number, number, number] => {
    if (!map.infinite) return [0, 0, map.width, map.height]
    const bs = layers.filter(f => f.layer.type === 'tilelayer').map(f => bounds(f.layer))
    if (!bs.length) return [0, 0, 1, 1]
    const x = Math.min(...bs.map(b => b[0])), y = Math.min(...bs.map(b => b[1]))
    return [x, y, Math.max(1, Math.max(...bs.map(b => b[0] + b[2])) - x), Math.max(1, Math.max(...bs.map(b => b[1] + b[3])) - y)]
  })()
  const reach = tiled ? Math.max(0, ...Object.values(tiled.tiles).map(t => t.box[3])) : 0
  const fitted = (): View => {
    const v = fit(g, extent[2], extent[3], size[0], size[1], reach)
    const [ox, oy] = project(g, [extent[0], extent[1]])
    return { zoom: v.zoom, pan: [v.pan[0] - ox * v.zoom, v.pan[1] - oy * v.zoom] }
  }
  const shown = view ?? (size[0] ? fitted() : { zoom: 1, pan: [0, 0] as V2 })

  const { change, edit } = live

  // ---- where the pointer is

  const cellAtScreen = (sx: number, sy: number): V2 => cellAt(g, shown, sx, sy)
  // A point of the screen in the objects' own units, from the top left of the layer placed on.
  const objectAt = (sx: number, sy: number): V2 => {
    const [cx, cy] = unproject(g, [(sx - shown.pan[0]) / shown.zoom, (sy - shown.pan[1]) / shown.zoom])
    return [(cx - placeShift[0]) * unit[0], (cy - placeShift[1]) * unit[1]]
  }
  const snapped = ([x, y]: V2): V2 => {
    const step = snap === 'cell' ? unit : snap === 'half' ? [unit[0] / 2, unit[1] / 2] : [1, 1]
    return [Math.round(x / step[0]) * step[0], Math.round(y / step[1]) * step[1]]
  }
  // An object point on the screen.
  const objScreen = ([x, y]: number[]): V2 => toScreen(g, shown, [x / unit[0] + placeShift[0], y / unit[1] + placeShift[1]])

  // ---- what the tools do

  // Whether the tool in hand is one that writes tiles, and a stroke of it, with the brush, on the
  // layer painted on, while there is one.
  const painting = tool === 'paint' || tool === 'erase' || tool === 'fill'
  const stroke = (cells: V2[]): Stroke | undefined =>
    paintOn === undefined || !paintLayer || !painting ? undefined : { tool: tool as Stroke['tool'], raw: brush, layer: paintOn, cells }
  // Pick takes the tile and flips of a cell into the brush.
  const pick = ([c, r]: V2) => {
    if (!paintLayer) return
    const v = cellOf(paintLayer, c, r)
    if (!(v & GID)) return
    setBrush(v)
    const ref = [...refs].reverse().find(x => x.firstgid <= (v & GID))
    if (ref) setSetAt(ref.index)
    setTool('paint')
  }
  // An object placed on the layer placed on, over the files as they are when it is written, and
  // selected once that write has landed, by the id the files gave it then, unless another was chosen
  // in the meantime (`landing`).
  const put = (shape: Shape) => {
    if (placeOn === undefined) return
    const layer = placeOn
    const l: Landing = { chosen: chosen.current }
    setLanding(l)
    edit(d => {
      const made = objectAdded(d, layer, shape)
      l.object = made.id
      return made.doc
    })
  }
  // An object placed at a point in object units by the tool in hand.
  const place = (at: V2) => {
    const [x, y] = snapped(at)
    if (tool === 'point') put({ x, y, point: true })
    else if (tool === 'rect' || tool === 'ellipse') put({ x, y, width: unit[0], height: unit[1], ...(tool === 'ellipse' && { ellipse: true }) })
    else if (tool === 'tile') put({ x, y, width: tileSize(brush)[0], height: tileSize(brush)[1], gid: brush })
  }
  const finishPolygon = () => {
    if (poly && poly.length >= 3) {
      const [x, y] = poly[0]
      put({ x, y, polygon: poly.map(([px, py]) => ({ x: px - x, y: py - y })) })
    }
    setPoly(undefined)
  }
  // The keyboard's point in a cell: its bottom middle for a point, its bottom left for a tile object,
  // which stands there, and its top left for anything else.
  const cellPoint = ([c, r]: V2): V2 => {
    const [cx, cy] = tool === 'point' ? [c + 0.5, r + 1] : tool === 'tile' ? [c, r + 1] : [c, r]
    return [(cx - placeShift[0]) * unit[0], (cy - placeShift[1]) * unit[1]]
  }

  // The object of the layer placed on under a screen point, the topmost.
  const hit = (sx: number, sy: number): TObject | undefined => {
    if (!placeLayer || !tiled) return undefined
    const decoded = tiled.layers[layers.find(f => f.layer.id === placeOn)!.drawn]
    const objs = decoded.kind === 'objects' ? decoded.objects : []
    const [px, py] = unproject(g, [(sx - shown.pan[0]) / shown.zoom, (sy - shown.pan[1]) / shown.zoom])
    for (const o of [...objs].reverse()) {
      const raw = placeLayer.objects!.find(x => x.id === o.id)
      if (!raw) continue
      if (o.point) {
        const [ox, oy] = toScreen(g, shown, [o.x, o.y])
        if (Math.hypot(ox - sx, oy - sy) <= GRAB + 2) return raw
      } else if (o.polygon || o.polyline) {
        const pts = (o.polygon ?? o.polyline)!.map(([x, y]) => toScreen(g, shown, [o.x + x, o.y + y]))
        if (o.polygon && insidePoly(pts, [sx, sy])) return raw
        if (pts.some((p, i) => i + (o.polygon ? 0 : 1) < pts.length && nearSegment(p, pts[(i + 1) % pts.length], [sx, sy]) <= GRAB)) return raw
      } else if (px >= o.x && px <= o.x + o.w && py >= o.y && py <= o.y + o.h) {
        if (!o.ellipse) return raw
        const [ex, ey] = [(px - o.x - o.w / 2) / (o.w / 2), (py - o.y - o.h / 2) / (o.h / 2)]
        if (ex * ex + ey * ey <= 1) return raw
      }
    }
    return undefined
  }
  // The handles of the object selected: a box's corners, or a polygon's points, on the screen.
  const handles = (o: TObject | undefined): V2[] => {
    if (!o || o.point) return []
    if (o.polygon || o.polyline) return (o.polygon ?? o.polyline)!.map(p => objScreen([o.x + p.x, o.y + p.y]))
    const [x, y, w, h] = boxOf(o)
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(objScreen)
  }

  const down = (p: SurfacePointer) => {
    if (p.button !== 0 || p.shift) {
      drag.current = { mode: 'pan', from: [p.x, p.y], was: shown }
      return
    }
    const cell = cellAtScreen(p.x, p.y)
    if (tool === 'pick') return pick(cell)
    if (painting) {
      const st = stroke([cell])
      if (!st) return
      drag.current = { mode: 'stroke', last: cell.join(), stroke: st }
      change(strokeOn(doc, st))
      return
    }
    if (!placePath) return
    const at = objectAt(p.x, p.y)
    if (tool === 'select') {
      const hs = handles(selected)
      const k = hs.findIndex(h => Math.hypot(h[0] - p.x, h[1] - p.y) <= GRAB)
      if (selected && k >= 0) {
        if (selected.polygon || selected.polyline) drag.current = { mode: 'vertex', i: k, obj: selected }
        else {
          const [x, y, w, h] = boxOf(selected)
          const corners: V2[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
          drag.current = { mode: 'corner', fixed: corners[(k + 2) % 4], obj: selected }
        }
        return
      }
      const o = hit(p.x, p.y)
      choose(o?.id)
      if (o) drag.current = { mode: 'move', from: at, obj: o }
      return
    }
    if (tool === 'polygon') {
      const pt = snapped(at)
      if (poly && poly.length >= 3) {
        const first = objScreen(poly[0])
        if (Math.hypot(first[0] - p.x, first[1] - p.y) <= GRAB) return finishPolygon()
      }
      setPoly([...(poly ?? []), pt])
      return
    }
    if (tool === 'rect' || tool === 'ellipse') {
      drag.current = { mode: 'make', from: snapped(at), ellipse: tool === 'ellipse' }
      return
    }
    place(at)
  }

  const move = (p: SurfacePointer) => {
    const cell = cellAtScreen(p.x, p.y)
    if (!hover || hover[0] !== cell[0] || hover[1] !== cell[1]) setHover(cell)
    const d = drag.current
    if (!d) return
    if (d.mode === 'pan') {
      setView({ zoom: d.was.zoom, pan: [d.was.pan[0] + p.x - d.from[0], d.was.pan[1] + p.y - d.from[1]] })
      return
    }
    if (!(p.buttons & 1)) return
    if (d.mode === 'stroke') {
      if (d.stroke.tool === 'fill' || d.last === cell.join()) return
      d.last = cell.join()
      d.stroke.cells.push(cell)
      change(strokeOn(doc, d.stroke))
      return
    }
    if (!placePath) return
    const at = objectAt(p.x, p.y)
    if (d.mode === 'move') {
      const [dx, dy] = [at[0] - d.from[0], at[1] - d.from[1]]
      const [x, y] = snapped([d.obj.x + dx, d.obj.y + dy])
      d.set = { x, y }
      change(withObject(doc, placePath, d.obj.id, o => ({ ...o, ...d.set })))
    } else if (d.mode === 'corner') {
      const [ax, ay] = snapped(at)
      const [x0, x1] = [Math.min(ax, d.fixed[0]), Math.max(ax, d.fixed[0])], [y0, y1] = [Math.min(ay, d.fixed[1]), Math.max(ay, d.fixed[1])]
      if (x1 - x0 <= 0 || y1 - y0 <= 0) return
      // A tile object stands on its bottom left.
      d.set = { x: x0, y: d.obj.gid !== undefined ? y1 : y0, width: x1 - x0, height: y1 - y0 }
      change(withObject(doc, placePath, d.obj.id, o => ({ ...o, ...d.set })))
    } else if (d.mode === 'vertex') {
      const [ax, ay] = snapped(at)
      const key = d.obj.polygon ? 'polygon' : 'polyline'
      d.set = { [key]: (d.obj[key] as Pt[]).map((q, i) => (i === d.i ? { x: ax - d.obj.x, y: ay - d.obj.y } : q)) }
      change(withObject(doc, placePath, d.obj.id, o => ({ ...o, ...d.set })))
    } else if (d.mode === 'make') {
      const [ax, ay] = snapped(at)
      const [x, y, w, h] = [Math.min(ax, d.from[0]), Math.min(ay, d.from[1]), Math.abs(ax - d.from[0]), Math.abs(ay - d.from[1])]
      if (!w || !h) return
      d.box = [x, y, w, h]
      if (d.id === undefined) {
        const made = objectAdded(doc, placeOn!, { x, y, width: w, height: h, ...(d.ellipse && { ellipse: true }) })
        if (made.id === undefined) return
        d.id = made.id
        setSel(made.id)
        change(made.doc)
      } else change(withObject(doc, placePath, d.id, o => ({ ...o, x, y, width: w, height: h })))
    }
  }

  const up = () => {
    const d = drag.current
    drag.current = undefined
    // A stroke is its cells over the files as they are when it is written.
    if (d?.mode === 'stroke') return live.commit(files => strokeOn(files, d.stroke))
    // A box made by a click and no drag is one cell; one dragged is the box it was dragged to, put
    // over the files as they are when it is written; either is selected once its write has landed.
    if (d?.mode === 'make') {
      const [x, y, w, h] = d.box ?? [d.from[0], d.from[1], unit[0], unit[1]]
      const shape = { x, y, width: w, height: h, ...(d.ellipse && { ellipse: true as const }) }
      if (!d.box) return put(shape)
      if (placeOn === undefined) return
      const layer = placeOn
      const l: Landing = { chosen: chosen.current }
      setLanding(l)
      return live.commit(files => {
        const made = objectAdded(files, layer, shape)
        l.object = made.id
        return made.doc
      })
    }
    // An object moved, resized or reshaped is its fields set over the files as they are then.
    if ((d?.mode === 'move' || d?.mode === 'corner' || d?.mode === 'vertex') && d.set && placeOn !== undefined) {
      const [layer, id, set] = [placeOn, d.obj.id, d.set]
      return live.commit(files => objectSet(files, layer, id, o => ({ ...o, ...set })))
    }
  }
  const wheel = (p: SurfacePointer, dy: number) => setView(v => zoomed(v ?? shown, p, dy))
  const turn = (masks: number[]) => setBrush(b => rawOf(b & GID, masks[flipOf(b)]))
  const flip = (bit: number) => setBrush(b => rawOf(b & GID, flipOf(b) ^ bit))
  const remove = () => {
    if (!placePath || placeOn === undefined || sel === undefined) return
    const [layer, id] = [placeOn, sel]
    edit(d => withoutObject(d, layer, id))
    choose(undefined)
  }
  // The keys, while the map has the focus: the arrows move the cursor, Enter or Space uses the tool
  // there, X and Y flip the brush and Z turns it, as in Tiled, Delete removes the object selected,
  // Escape lets go of a polygon being drawn. Undo and redo are the editor's.
  const key = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey
    const step: Record<string, V2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const k = e.key.toLowerCase()
    if (step[e.key]) setHover(([c, r] = [0, 0]) => [c + step[e.key][0], r + step[e.key][1]])
    else if ((e.key === 'Enter' || e.key === ' ') && hover) {
      const pt = cellPoint(hover)
      const st = stroke([hover])
      if (tool === 'pick') pick(hover)
      else if (painting) {
        if (st) edit(d => strokeOn(d, st))
      }
      // A polygon's points one by one, closed by the first one again.
      else if (tool === 'polygon' && poly && poly.length >= 3 && pt[0] === poly[0][0] && pt[1] === poly[0][1]) finishPolygon()
      else if (tool === 'polygon') setPoly([...(poly ?? []), pt])
      else if (tool === 'select') choose(hit(...toScreen(g, shown, [hover[0] + 0.5, hover[1] + 0.5]))?.id)
      else place(cellPoint(hover))
    } else if (e.key === 'Escape') setPoly(undefined)
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== undefined) remove()
    else if (!mod && k === 'x') flip(FLIP_H)
    else if (!mod && k === 'y') flip(FLIP_V)
    else if (!mod && k === 'z') turn(e.shiftKey ? LEFT : RIGHT)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  // An object or a layer an edit made is selected once its write has landed, by the id the files gave
  // it then, and not while an edit is being written over them again; and not at all when another was
  // chosen in the meantime.
  useEffect(() => {
    const l = landing
    if (live.writing || !l) return
    setLanding(undefined)
    if (chosen.current !== l.chosen) return
    if (l.object !== undefined && placeLayer?.objects?.some(o => o.id === l.object)) setSel(l.object)
    if (l.layer !== undefined && layers.some(f => f.layer.id === l.layer)) {
      setLooked(l.layer)
      if (l.type === 'tilelayer') setPaintOn(l.layer)
      else setPlaceOn(l.layer)
    }
  })

  // ---- the picture

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (w !== size[0] || h !== size[1]) queueMicrotask(() => setSize([w, h]))
    if (!tiled) return
    const color = colorsOf(ctx)
    const picture: Picture = {
      tiled, map, layers, g, view: shown, extent, reach, now, imageOf, hidden, current: [paintOn, placeOn], edits, showShapes, showGrid, types,
      chosen: { layer: placeOn, id: sel },
    }
    drawPicture(ctx, w, h, picture)

    // The brush where it would paint, and the cursor.
    if (hover && tool === 'paint' && paintLayer && tiled.tiles[brush & GID]) {
      const tile = tiled.tiles[brush & GID]
      const [sx, sy, sw, sh] = tileRectOf(picture, tile, shiftOf(paintOn), hover[0], hover[1])
      ctx.globalAlpha = 0.6
      drawTile(ctx, imageOf(tiled.tiles[showing(tiled, brush & GID, now)].page), tiled.tiles[showing(tiled, brush & GID, now)], flipOf(brush), sx, sy, sw, sh)
      ctx.globalAlpha = 1
    }
    if (hover) {
      ctx.strokeStyle = color('--accent')
      ctx.lineWidth = 2
      cellPath(ctx, g, shown, hover[0], hover[1])
      ctx.stroke()
    }
    // The polygon being drawn, and the handles of the object selected.
    if (poly) {
      ctx.strokeStyle = color('--accent')
      ctx.lineWidth = 2
      ctx.beginPath()
      poly.map(objScreen).forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)))
      ctx.stroke()
      for (const p of poly.map(objScreen)) ctx.strokeRect(p[0] - 3, p[1] - 3, 6, 6)
    }
    ctx.fillStyle = color('--accent')
    for (const p of handles(selected)) ctx.fillRect(p[0] - GRAB / 2, p[1] - GRAB / 2, GRAB, GRAB)
  }

  // ---- the side

  const ref = refs[setAt] ?? refs[0]
  const brushTile = tiled?.tiles[brush & GID]
  const brushRef = brushTile && refs.find(r => r.index === brushTile.tileset)
  const brushEntry = brushRef && brushTile ? setOf(doc, brushRef).tiles?.find(t => t.id === brushTile.id) : undefined
  const paletteTiles = tiled && ref ? Object.values(tiled.tiles).filter(t => t.tileset === ref.index).sort((a, b) => a.id - b.id) : []
  // A tile's collision drawn over it in the palette, made once for each tile and state of the overlay.
  const overs = useMemo(() => new Map<number, (ctx: CanvasRenderingContext2D) => void>(), [tiled, showShapes])
  const overOf = (t: Tile) => {
    if (!showShapes || !t.shapes.length) return undefined
    let f = overs.get(t.gid)
    if (!f) {
      f = (ctx: CanvasRenderingContext2D) => {
        const css = getComputedStyle(ctx.canvas)
        ctx.globalAlpha = 0.5
        for (const s of t.shapes) {
          ctx.fillStyle = css.getPropertyValue(s.top ? '--warn' : '--danger').trim() || '#e44'
          shapePath(ctx, s.points)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      overs.set(t.gid, f)
    }
    return f
  }
  const objectKinds = objectClasses(types)
  const tileKinds = tileClasses(types)
  const render2dLayers = layerNames(prefab)
  const tileNames = new Set(layers.filter(f => f.layer.type === 'tilelayer').map(f => f.layer.name))
  const freeName = freeTileNames(map, render2dLayers)[0]
  const lookedFlat = layers.find(f => f.layer.id === looked)
  const hoverRaw = hover && paintLayer ? cellOf(paintLayer, hover[0], hover[1]) : undefined
  // What the game has made of the cell, when it has changed it.
  const hoverEdit = hover && paintLayer ? edits[`${paintLayer.name}:${hover[0]},${hover[1]}`] : undefined

  // A layer added after the one looked at, over the files as they are when it is written, and looked
  // at once that write has landed, by the id the files gave it then, unless another was chosen in the
  // meantime (`landing`).
  const addLayer = (type: 'tilelayer' | 'objectgroup') => {
    const after = looked
    const l: Landing = { chosen: chosen.current, type }
    setLanding(l)
    edit(d => {
      const made = layerAdded(d, type, after === undefined ? undefined : pathOf(d.map, after), render2dLayers)
      l.layer = made.id
      return made.doc
    })
  }
  const layerItems = (list: TLayer[]): TreeItem[] => list.map(l => ({
    id: String(l.id),
    label: l.name || '(no name)',
    badge: <Badge tone={hidden.has(l.id) ? 'dim' : l.id === paintOn || l.id === placeOn ? 'accent' : undefined}>{{ tilelayer: 'tiles', objectgroup: 'objects', imagelayer: 'image', group: 'group' }[l.type] ?? l.type}</Badge>,
    ...(l.type === 'group' && { children: layerItems(l.layers ?? []) }),
  }))
  const lookAt = (id: number) => {
    chosen.current++
    setLooked(id)
    const l = layers.find(f => f.layer.id === id)?.layer
    if (l?.type === 'tilelayer') setPaintOn(id)
    if (l?.type === 'objectgroup') {
      setPlaceOn(id)
      setSel(undefined)
    }
  }
  const setLookedLayer = (f: (l: TLayer) => TLayer) => {
    if (looked !== undefined) edit(d => layerSet(d, looked, f))
  }
  // Whether the layer looked at is the last of its siblings, which Move layer up cannot move.
  const topmost = !!lookedFlat && lookedFlat.path[lookedFlat.path.length - 1] === (lookedFlat.path.length === 1 ? map.layers : layerAt(map, lookedFlat.path.slice(0, -1)).layers ?? []).length - 1
  // The tile in the brush given a class, a collision, or one-way, in its tileset.
  const setTile = (to: { class?: string; collision?: string; oneWay?: boolean }) => {
    if (!brushTile || !brushRef) return
    const [ref, id, w, h] = [brushRef, brushTile.id, brushTile.box[2], brushTile.box[3]]
    edit(d => tileSet(d, ref, id, w, h, to))
  }
  const brushName = brushTile ? `tile ${brushTile.id}${refs.length > 1 ? ` of ${tiled!.tilesets[brushTile.tileset].name}` : ''}` : 'no tile'
  const flips = flipOf(brush)

  const bar = (
    <Toolbar label="tiles">
      {TILE_TOOLS.map(t => <Button key={t.tool} title={t.title} pressed={tool === t.tool} disabled={!paintLayer} onClick={() => setTool(t.tool)}>{t.title}</Button>)}
      <Button title="Flip horizontally" pressed={!!(flips & FLIP_H)} onClick={() => flip(FLIP_H)}>⇆</Button>
      <Button title="Flip vertically" pressed={!!(flips & FLIP_V)} onClick={() => flip(FLIP_V)}>⇅</Button>
      <Button title="Flip diagonally" pressed={!!(flips & FLIP_D)} onClick={() => flip(FLIP_D)}>⤡</Button>
      <Button title="Rotate left" onClick={() => turn(LEFT)}>⟲</Button>
      <Button title="Rotate right" onClick={() => turn(RIGHT)}>⟳</Button>
      {OBJECT_TOOLS.map(t => <Button key={t.tool} title={t.title} pressed={tool === t.tool} disabled={!placeLayer} onClick={() => { setTool(t.tool); setPoly(undefined) }}>{t.title}</Button>)}
      <Button title="Fit" onClick={() => setView(undefined)}>Fit</Button>
      <span className="ui-spacer" />
      <Badge tone={hover ? undefined : 'dim'}>
        {hover ? `cell ${hover[0]}, ${hover[1]}${hoverRaw ? ` · tile ${tiled?.tiles[hoverRaw & GID]?.id ?? hoverRaw & GID}${flipOf(hoverRaw) ? ` flipped ${flipOf(hoverRaw)}` : ''}` : ''}${hoverEdit === undefined ? '' : hoverEdit > 0 ? ` · tile ${tiled?.tiles[hoverEdit]?.id ?? hoverEdit} in the game` : ' · none in the game'}` : path}
      </Badge>
      {live.writing && <Badge tone="dim">writing</Badge>}
    </Toolbar>
  )

  const side = (
    <>
      <Section title="Palette" extra={<Badge>{brushName}{flips ? ` · flipped ${flips}` : ''}</Badge>}>
        {refs.length > 1 && (
          <LabelledRow label="tileset">
            <Select<number> label="tileset" value={ref.index} options={refs.map(r => ({ value: r.index, label: tiled?.tilesets[r.index]?.name ?? String(r.index) }))} onChange={setSetAt} />
          </LabelledRow>
        )}
        {tiled && ref ? (
          <Strip
            label="tiles"
            // As the tileset's image lays its tiles out; a tileset of images, eight to a row.
            columns={Number(setOf(doc, ref).columns) || 8}
            selected={brush & GID}
            onSelect={id => {
              // A tile taken from the palette lies unflipped, as one taken from a tileset in Tiled does.
              setBrush(Number(id))
              if (tool === 'erase' || tool === 'pick') setTool('paint')
            }}
            items={paletteTiles.map(t => {
              const f = tiled.tiles[showing(tiled, t.gid, now)]
              return { id: t.gid, title: `tile ${t.id}`, node: <FrameImage image={imageOf(f.page)} box={f.box} label={`tile ${t.id}`} over={overOf(t)} /> }
            })}
          />
        ) : <Note>{refs.length ? 'Reading the tilesets…' : 'The map has no tileset.'}</Note>}
      </Section>
      {brushTile && brushRef && (
        <Section title={`Tile ${brushTile.id}`}>
          <LabelledRow label="class">
            {tileKinds.length
              ? <Select<string> label="tile class" value={classOf(brushEntry ?? { id: 0 })} options={[{ value: '', label: 'none' }, ...[...new Set([classOf(brushEntry ?? { id: 0 }), ...tileKinds.map(t => t.name)])].filter(Boolean).map(n => ({ value: n }))]} onChange={v => setTile({ class: v })} />
              : <TextField label="tile class" value={classOf(brushEntry ?? { id: 0 })} onChange={v => setTile({ class: v })} />}
          </LabelledRow>
          <LabelledRow label="collision">
            <Select<string>
              label="collision"
              value={presetOf(brushEntry, brushTile.box[2], brushTile.box[3])}
              options={[...PRESETS.map(p => ({ value: p.id, label: p.title })), ...(presetOf(brushEntry, brushTile.box[2], brushTile.box[3]) === 'custom' ? [{ value: 'custom', label: 'its own shapes' }] : [])]}
              onChange={v => v !== 'custom' && setTile({ collision: v })}
            />
          </LabelledRow>
          <LabelledRow label="one-way">
            {brushEntry?.objectgroup?.objects.length
              ? <Check label="one-way" value={brushEntry.objectgroup.objects.every(o => classOf(o) === 'top')} onChange={v => setTile({ oneWay: v })} />
              : <Note>No collision to make one-way.</Note>}
          </LabelledRow>
          <Note>{brushTile.shapes.length ? `${brushTile.shapes.length} collision shape${brushTile.shapes.length > 1 ? 's' : ''}` : 'Nothing collides with it.'}{brushTile.animation ? ` Animated, ${brushTile.animation.length} frames.` : ''}</Note>
        </Section>
      )}
      <Section title="Layers">
        <Tree label="layers" items={layerItems(map.layers)} selected={looked === undefined ? undefined : String(looked)} onSelect={id => lookAt(Number(id))} open={layers.filter(f => f.layer.type === 'group').map(f => String(f.layer.id))} />
        {lookedFlat && (
          <>
            <LabelledRow label="name">
              {lookedFlat.layer.type === 'objectgroup' || lookedFlat.layer.type === 'group'
                ? <TextField label="layer name" value={lookedFlat.layer.name} onChange={v => setLookedLayer(l => ({ ...l, name: v }))} />
                : <Select<string> label="layer name" value={lookedFlat.layer.name} options={[...new Set([lookedFlat.layer.name, ...render2dLayers])].map(n => ({ value: n, label: n === lookedFlat.layer.name || !tileNames.has(n) || lookedFlat.layer.type !== 'tilelayer' ? n : `${n} (a tile layer has it)` }))} onChange={v => setLookedLayer(l => ({ ...l, name: v }))} />}
            </LabelledRow>
            <LabelledRow label="shown here"><Check label="shown here" value={!hidden.has(lookedFlat.layer.id)} onChange={v => setHidden(h => { const n = new Set(h); if (v) n.delete(lookedFlat.layer.id); else n.add(lookedFlat.layer.id); return n })} /></LabelledRow>
            <LabelledRow label="visible in game"><Check label="visible in game" value={lookedFlat.layer.visible !== false} onChange={v => setLookedLayer(l => ({ ...l, visible: v }))} /></LabelledRow>
            <LabelledRow label="opacity"><NumberField label="opacity" value={lookedFlat.layer.opacity ?? 1} onChange={(v, done) => done && OPACITY.safeParse(v).success && setLookedLayer(l => ({ ...l, opacity: v }))} /></LabelledRow>
            <LabelledRow label="offset">
              <VecField label="offset" value={[lookedFlat.layer.offsetx ?? 0, lookedFlat.layer.offsety ?? 0]} onChange={([x, y], done) => done && setLookedLayer(l => ({ ...l, offsetx: x, offsety: y }))} />
            </LabelledRow>
            <Row>
              <Button title="Move layer down" disabled={lookedFlat.path[lookedFlat.path.length - 1] === 0} onClick={() => edit(d => layerMoved(d, lookedFlat.layer.id, -1))}>↓</Button>
              <Button title="Move layer up" disabled={topmost} onClick={() => edit(d => layerMoved(d, lookedFlat.layer.id, 1))}>↑</Button>
              <Button title="Remove layer" onClick={() => { edit(d => layerRemoved(d, lookedFlat.layer.id)); setLooked(undefined) }}>Remove</Button>
            </Row>
          </>
        )}
        <Row>
          <Button title="Add tile layer" disabled={!freeName} onClick={() => addLayer('tilelayer')}>Add tile layer</Button>
          <Button title="Add object layer" onClick={() => addLayer('objectgroup')}>Add object layer</Button>
        </Row>
        {!freeName && <Note>Each of render2d's layers has a tile layer: a tile layer is drawn on the render2d layer its name names, one to each.</Note>}
      </Section>
      <Section title="Objects">
        {typesBad && <Note>{typesBad}</Note>}
        {!placeLayer ? <Note>The map has no object layer.</Note> : (
          <>
            <Tree
              label="objects"
              items={(placeLayer.objects ?? []).map(o => ({ id: String(o.id), label: o.name || classOf(o) || `object ${o.id}`, badge: <Badge tone="dim">{kindOf(o)}</Badge> }))}
              selected={sel === undefined ? undefined : String(sel)}
              onSelect={id => choose(Number(id))}
            />
            {selected && (
              <ObjectFields
                o={selected}
                classes={objectKinds}
                types={types}
                projectFile={projectFile}
                newProp={newProp}
                setNewProp={setNewProp}
                set={f => placeOn !== undefined && edit(d => objectSet(d, placeOn, selected.id, f))}
                remove={remove}
              />
            )}
          </>
        )}
      </Section>
      <Section title="Map">
        {map.infinite ? <Note>The map is infinite: it grows where it is painted.</Note> : (
          <>
            <LabelledRow label="columns"><NumberField label="columns" integer value={map.width} onChange={(v, done) => done && SIZE.safeParse(v).success && edit(d => resized(d, v, d.map.height))} /></LabelledRow>
            <LabelledRow label="rows"><NumberField label="rows" integer value={map.height} onChange={(v, done) => done && SIZE.safeParse(v).success && edit(d => resized(d, d.map.width, v))} /></LabelledRow>
          </>
        )}
        <LabelledRow label="grid"><Check label="grid" value={showGrid} onChange={setShowGrid} /></LabelledRow>
        <LabelledRow label="collision shapes"><Check label="collision shapes" value={showShapes} onChange={setShowShapes} /></LabelledRow>
        <LabelledRow label="snap">
          <Select<Snap> label="snap" value={snap} options={[{ value: 'pixel', label: 'to pixels' }, { value: 'half', label: 'to half cells' }, { value: 'cell', label: 'to cells' }]} onChange={setSnap} />
        </LabelledRow>
      </Section>
    </>
  )

  if (read.error) return <PanelBody bar={bar}><Empty>{read.error}</Empty></PanelBody>
  return (
    <PanelBody bar={bar}>
      <Split
        main={
          <Surface
            label="map"
            version={[doc, edits, shown.zoom, shown.pan[0], shown.pan[1], hover, hidden, showGrid, showShapes, loaded, now, sel, poly, tool, brush, paintOn, placeOn, types, theme]}
            draw={draw}
            onDown={down}
            onMove={move}
            onUp={up}
            onLeave={() => setHover(undefined)}
            onWheel={wheel}
            onKey={key}
          />
        }
        side={side}
      />
    </PanelBody>
  )
}

// An object's box in its own units, top left and size: a tile object stands on its bottom left.
const boxOf = (o: TObject): [number, number, number, number] => {
  const [w, h] = [o.width ?? 0, o.height ?? 0]
  return [o.x, o.gid !== undefined ? o.y - h : o.y, w, h]
}
// Where a layer repeating every `step` from `at` lies over `from` to `to`.
function range(at: number, from: number, to: number, step: number): number[] {
  const out: number[] = []
  for (let x = at - Math.ceil((at - from) / step) * step; x < to; x += step) out.push(x)
  return out
}
const insidePoly = (pts: V2[], [x, y]: V2) => {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const nearSegment = ([ax, ay]: V2, [bx, by]: V2, [x, y]: V2) => {
  const [dx, dy] = [bx - ax, by - ay]
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(ax + t * dx - x, ay + t * dy - y)
}

// A property's value, by its Tiled type: a number, a whole one for `int` and `object`, true or
// false, one of an enum's values, a class's members as JSON, or text.
function PropField({ label, type, value, enumOf, onChange }: { label: string; type: string; value: unknown; enumOf?: PropType; onChange(v: unknown): void }) {
  if (enumOf?.values) {
    const byIndex = enumOf.storageType === 'int'
    return <Select<string> label={label} value={byIndex ? enumOf.values[Number(value)] ?? '' : String(value ?? '')} options={enumOf.values.map(v => ({ value: v }))} onChange={v => onChange(byIndex ? enumOf.values!.indexOf(v) : v)} />
  }
  if (type === 'int' || type === 'float' || type === 'object') return <NumberField label={label} integer={type !== 'float'} value={Number(value ?? 0)} onChange={(v, done) => done && onChange(v)} />
  if (type === 'bool') return <Check label={label} value={!!value} onChange={v => onChange(v)} />
  if (type === 'class') return <JsonField label={label} value={value ?? {}} onChange={v => onChange(v)} />
  return <TextField label={label} value={String(value ?? '')} onChange={v => onChange(v)} />
}

// An object's name, class, place, size and properties: the members of its class, from the game's
// Tiled project, each at its default until it is set, and the properties of its own.
function ObjectFields({ o, classes, types, projectFile, newProp, setNewProp, set, remove }: {
  o: TObject
  classes: PropType[]
  types: PropType[]
  projectFile: string | undefined
  newProp: { name: string; type: string }
  setNewProp(p: { name: string; type: string }): void
  set(f: (o: TObject) => TObject): void
  remove(): void
}) {
  const cls = classOf(o)
  const members = classes.find(c => c.name === cls)?.members ?? []
  const own = (o.properties ?? []).filter(p => !members.some(m => m.name === p.name))
  const boxed = !o.point && !o.polygon && !o.polyline
  const rows: ReactNode[] = members.map(m => {
    const had = o.properties?.find(p => p.name === m.name)
    const enumOf = m.propertyType ? types.find(t => t.name === m.propertyType && t.type === 'enum') : undefined
    const type = enumOf ? (enumOf.storageType === 'int' ? 'int' : 'string') : m.propertyType ? 'class' : m.type
    return (
      <LabelledRow key={`m ${m.name}`} label={m.name} title={had ? undefined : 'the class\'s default'} extra={had && <Button title={`reset ${m.name}`} onClick={() => set(x => withoutProp(x, m.name))}>↺</Button>}>
        <PropField label={m.name} type={type} enumOf={enumOf} value={had ? had.value : m.value ?? blankOf(type)} onChange={v => set(x => withProp(x, { name: m.name, type, value: v, ...(m.propertyType && { propertytype: m.propertyType }) }))} />
      </LabelledRow>
    )
  })
  for (const p of own) {
    const enumOf = p.propertytype ? types.find(t => t.name === p.propertytype && t.type === 'enum') : undefined
    rows.push(
      <LabelledRow key={`p ${p.name}`} label={p.name} extra={<Button title={`remove property ${p.name}`} onClick={() => set(x => withoutProp(x, p.name))}>✕</Button>}>
        <PropField label={p.name} type={p.type} enumOf={enumOf} value={p.value} onChange={v => set(x => withProp(x, { ...p, value: v }))} />
      </LabelledRow>,
    )
  }
  const names = [...new Set([cls, ...classes.map(c => c.name)])].filter(Boolean)
  return (
    <>
      <LabelledRow label="name"><TextField label="object name" value={o.name ?? ''} onChange={v => set(x => ({ ...x, name: v }))} /></LabelledRow>
      <LabelledRow label="class">
        {classes.length
          ? <Select<string> label="object class" value={cls} options={[{ value: '', label: 'none' }, ...names.map(n => ({ value: n }))]} onChange={v => set(x => ({ ...x, [classKey(x)]: v }))} />
          : <TextField label="object class" value={cls} onChange={v => set(x => ({ ...x, [classKey(x)]: v }))} />}
      </LabelledRow>
      <LabelledRow label="position"><VecField label="position" value={[o.x, o.y]} onChange={([x, y], done) => done && set(q => ({ ...q, x, y }))} /></LabelledRow>
      {boxed && <LabelledRow label="size"><VecField label="size" names={['w', 'h']} value={[o.width ?? 0, o.height ?? 0]} onChange={([w, h], done) => done && w > 0 && h > 0 && set(q => ({ ...q, width: w, height: h }))} /></LabelledRow>}
      <LabelledRow label="visible"><Check label="visible" value={o.visible !== false} onChange={v => set(q => ({ ...q, visible: v }))} /></LabelledRow>
      {!classes.length && projectFile === undefined && <Note>The game has no Tiled project, so no class offers its members.</Note>}
      {rows}
      <Row>
        <TextField label="new property name" value={newProp.name} onChange={v => setNewProp({ ...newProp, name: v })} />
        <Select<string> label="new property type" value={newProp.type} options={['string', 'int', 'float', 'bool', 'color', 'file', 'object'].map(v => ({ value: v }))} onChange={v => setNewProp({ ...newProp, type: v })} />
        <Button
          title="Add property"
          disabled={!newProp.name || (o.properties ?? []).some(p => p.name === newProp.name) || members.some(m => m.name === newProp.name)}
          onClick={() => {
            set(x => withProp(x, { name: newProp.name, type: newProp.type, value: blankOf(newProp.type) }))
            setNewProp({ name: '', type: newProp.type })
          }}
        >
          Add
        </Button>
      </Row>
      {newProp.name && ((o.properties ?? []).some(p => p.name === newProp.name) || members.some(m => m.name === newProp.name)) && <Note>Not added: it has a property {newProp.name} already.</Note>}
      <Button title="Delete object" onClick={remove}>Delete object</Button>
    </>
  )
}
