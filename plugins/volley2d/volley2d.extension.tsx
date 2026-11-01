// volley2d's extension: the Patterns panel, the Fire Pattern tool, and the types of a patterns file's
// fields (`volley2d.sim.ts` says what the file holds and what every emitter field means;
// `volley2d.plugin.ts` how a page draws it and fires volleys of its own).
//
// The panel (`volley2d.components.tsx`) works on the patterns file of the scene selected, else of the
// one the game view shows, else of the first scene that names volley2d in its `plugins`: the json
// entry of that scene's catalogue its `world.volley2d.patterns` names, in the scene's file or else the
// game's, as a child's `world` is the manager's with its own over it. It lists every pattern,
// filtered by name, with how many layers it has, how many bullets a volley of it fires (every bullet
// it can ever fire, as the server numbers them), and how many places name it; one is selected. The
// selected pattern's layers are a list: each emitter shows its set fields by their meaning, and a
// field it does not set is added with the value volley2d reads when it is left out; where that is no
// value a file can hold, no bound or no end, it is added at the value that changes nothing yet: `min`
// at 0 or its speed, whichever is less, `max` at its speed or 0, whichever is more, and `life` at the
// seconds its last bullet fired from the middle of the bounds takes to leave them. A `{ pattern }`
// layer names another pattern, with its `at`, `dir` and `after`. Every change is written into the
// file a value at a time, and is one undo:
//   - a field, a layer dropped or added: that one value;
//   - layers reordered: each layer whose place changed, set whole in its new place;
//   - a field added whose meaning needs another (a `clip` needs a `sheet`), or removed with the one
//     that needs it (a `clip` or an `orient` with its `sheet`): both;
//   - a pattern added: one emitter under its name, a ring of 8 drawn as the first bullet of the file
//     that is drawn; removed: its key, once the panel has said which `{ pattern }` layers and which
//     data files name it; renamed: its layers set under the new name, which goes to the end of
//     `patterns`, the old key removed, and every `{ pattern }` layer that named the old name made to
//     name the new. A name already taken is refused.
// Where a pattern is named: every `{ pattern }` layer of the file, and every string value equal to the
// name in any other json entry of the scene's catalogue, each with its path from that file's top.
//
// The plot. The selected pattern is drawn in the panel as a still: every bullet's path from when it
// is fired until its life ends, it leaves the bounds, or the plot's seconds are up, a faint line in
// the bounds, the volley fired from their middle along the preview's aim; with the most bullets in
// the air at once and when, and when the last is gone, found a frame of the scene's `dt` at a time as
// the server finds them gone. So how dense a pattern is reads without playing it.
//
// The preview. While the game view shows the panel's scene and the panel is open, the selected
// pattern is fired through the view's client's volley2d as a volley of the page's own (`fire`), never
// a row, at the loop's point: the last point the Fire Pattern tool was pressed at on that scene, else
// the ground under the middle of the view. With Loop on it is fired again after the first frame of
// the editor's clock (`Session.onFrame`) that finds its last volley no longer in the plugin's
// `preview`, so an edit to the file, which the datafiles extension
// refills the plugin's copy of, shows on the next volley. Fire Once fires it once more. The aim is
// the panel's, from a dial: a heading as volley2d has it, radians from the world's x toward its y,
// shown on the dial as a world whose y grows down the screen draws it, 0 right and π/2 straight
// down. A pattern that would throw as the plugin draws it (one it names is missing, it is built out
// of itself, a layer draws a sheet that is no sheet entry or a clip its sheet does not have, or on a
// render2d layer the scene has none of) is not fired, and the panel says why; one whose sheet's file
// has not been read yet waits for it. The point and the aim are marked on the stage. The aim, the
// plot's seconds and the selection are this viewer's own, kept in localStorage.
//
// The Fire Pattern tool (B) fires the selected pattern at the ground point pressed on, and makes that
// point the loop's.
//
// What the panel's buttons, its list, its plot and the tool do is done by functions here, which they
// and the commands call alike: the file read as `patternsIn` reads it; a pattern added, its layers
// set, or taken out by `patternEdits`, and its layers, whether the list adds, drops or moves one or a
// layer's field is set, added or taken out, written as the editor's `listEdits` writes a list;
// renamed by `renamed`; each change written as one by the editor's `written`; the plot worked out by
// `plotted` and drawn by `drawPlot`, on the panel's canvas or a picture's pixels (the design system's
// `raster`); and a pattern fired as `firing` fires it. What other extensions read the same way is theirs: a sheet's
// clips, where a name is named across the catalogue, and how a file of named lists, as the patterns
// file is, is read, written and answered for by the panel and the commands are the loader's
// (`clipsIn`, `surveyedReady`, `namedLists`, `putEdits`), a scene's render2d layers render2d's
// (`layersOf`), the client a preview is drawn with the session's (`Session.clientOn`), and a theme's
// colours the design system's (`themed`).
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here, on the
// patterns file of any scene that fires volleys, whatever the game view shows:
//   volley2d.patterns  the scenes that fire volleys and each one's file; or a scene's patterns as the
//                      panel lists them, with how many layers each has, how many bullets a volley of
//                      it fires, how many places name it and why it would not be fired; or one
//                      pattern as the panel shows it selected: its layers, where it is named, why it
//                      would not be fired, and its plot's numbers, the most bullets in the air at once
//                      and when, and when the last is gone, for an aim and a span of seconds;
//   volley2d.pattern   a pattern's layers set, written as the list and the layer's fields write them,
//                      the pattern added with them when the file has none of its name, or it taken out,
//                      which is refused while a layer or a data file names it unless the call says
//                      `anyway`, as Remove anyway does; a layer that is none volley2d reads is refused,
//                      naming the fields it reads, and so is one that would make the pattern throw as
//                      the page draws it (every reason `survey` gives, each sheet it draws read first)
//                      for a reason it did not have;
//   volley2d.rename    a pattern renamed, with every `{ pattern }` layer that names it;
//   volley2d.plot      the plot as a PNG, for an aim and a span of seconds, worked out from the file as
//                      the panel works it out, so it needs no game view;
//   volley2d.fire      a pattern fired once at a world point [x, y] along an aim, as Fire Once and the
//                      tool fire it. It is a preview, so the game view must show the scene; a frame is
//                      drawn first where none has mounted the view's client yet, as before the clock's
//                      next frame or with no clock.
// Each write is one undo, answering the state it left.
//
// The types, wherever the file is shown (every patterns file a `world.volley2d` of the open game
// names, `bindFile`):
//   volley2d.pattern   a `{ pattern }` layer's `pattern`: a pattern of the file;
//   volley2d.clip      `clip`: a clip of the layer's sheet, read through the scene's catalogue;
//   volley2d.layer     `layer`: a layer of the scene's `world.render2d`;
// and `n`, `bursts` an integer, `spread`, `turn`, `offset`, `curve` and a `{ pattern }` layer's `dir`
// an angle, `sheet` a sheet of the catalogue (`loader.sheet`).
import { z } from 'zod'
import { looseInput, OUTLINE, strictFields, type Editor, type FieldProps, type Pointer } from '#editor/editor.ts'
import type { Session } from '#editor/session.ts'
import { raster, type Pen } from '#editor/ui/pixels.ts'
import { hexOf, themed } from '#editor/ui/theme.ts'
import type { Plugins } from '#engine/browser.ts'
import { clipsIn, namedLists, surveyedReady, valueAt, type Edit, type Lister } from '#plugins/loader/loader.extension.tsx'
import type { Entry as Asset } from '#plugins/loader/loader.sim.ts'
import { layersOf } from '#plugins/render2d/render2d.extension.tsx'
import { ahead, shots, type Emitter, type Entry, type Layer, type Patterns, type Shot } from './volley2d.sim.ts'
import { ClipName, LayerName, PatternName, Patterns as Panel } from './volley2d.components.tsx'

export type { Asset }
type V2 = [number, number]

// ---------------------------------------------------------------- where the patterns are

// `world.volley2d`, as the scene reads it.
export type World = { patterns: string; bounds: [number, number, number, number]; layer: string }
// The scene a panel works on, the `world.volley2d` it reads, the file that names (by its path from the
// repo, and its name in the catalogue), the scene's catalogue, and the seconds the game steps by.
export type Where = { scene: string; world: World; name: string; path: string; assets: Record<string, Asset>; dt: number }

const pathOf = (url: string) => url.replace(/^\//, '')

// Whether a scene fires volleys, and from which file.
export function whereIn(ed: Editor, scene: string): Where | undefined {
  const s = ed.session
  if (!s) return undefined
  const file = s.files.get(s.path(scene))
  if (!file?.plugins?.includes('volley2d')) return undefined
  const world = (file.world?.volley2d ?? s.game.file.world?.volley2d) as World | undefined
  if (!world) return undefined
  const assets = ((file.world?.loader ?? s.game.file.world?.loader)?.assets ?? {}) as Record<string, Asset>
  const entry = assets[world.patterns]
  if (!entry || entry.type !== 'json') return undefined
  return { scene, world, name: world.patterns, path: pathOf(entry.url), assets, dt: s.rec.dt }
}

// The scenes of the open game that fire volleys, in the scene table's order.
export function drawing(ed: Editor): Where[] {
  const s = ed.session
  if (!s) return []
  return [...s.scenes().keys()].flatMap(n => whereIn(ed, n) ?? [])
}

// The patterns a panel works on: of the scene selected, else of the one the game view shows, else of
// the first that fires volleys.
export function focus(ed: Editor): Where | undefined {
  const all = drawing(ed)
  const sel = ed.selection && 'scene' in ed.selection ? ed.selection.scene : undefined
  return all.find(w => w.scene === sel) ?? all.find(w => w.scene === ed.session?.viewing) ?? all[0]
}

// The patterns a field of `owner` names from: the file itself when it is a patterns file, else the
// file of the owner's scene, else of the scene the panel works on.
export function whereFor(ed: Editor, owner: FieldProps['owner']): Where | undefined {
  const all = drawing(ed)
  return (owner.file ? all.find(w => w.path === owner.file) : undefined) ?? (owner.scene ? all.find(w => w.scene === owner.scene) : undefined) ?? focus(ed)
}

// A patterns file as the panel and the commands read and write it, as the loader reads and writes a
// file of named lists (`namedLists`): a pattern a list of layers, a `{ pattern }` layer naming another.
const PATTERNS = namedLists<Patterns, Layer>({ key: 'patterns', ref: 'pattern', noun: 'pattern', a: 'a pattern' })

// A patterns file's text as the panel and the commands read it, or why it holds no patterns.
export const patternsIn = PATTERNS.read

// The layers of pattern `name` of the file at `path`, refused, naming its patterns, when it has none
// of that name.
export const patternIn = PATTERNS.entry

// ---------------------------------------------------------------- the fields

// A field of a layer: its label with its unit, what it is, the type it is bound to when its shape
// does not say, and the value adding it writes, the one volley2d reads when the layer leaves it out.
export type Spec<L> = { key: keyof L & string; label: string; title: string; type?: string; absent(l: L, c: Context): unknown }
// What a field's value when left out depends on: the catalogue's sheets, those the file draws from
// first, the clips of the layer's sheet, and the scene's `world.volley2d` and step.
export type Context = { sheets: string[]; clips: string[] | undefined; world: World; dt: number }

// Every field of an emitter, in the order the sim's header gives them.
export const SPECS: Spec<Emitter>[] = [
  { key: 'n', label: 'n', title: 'bullets a burst, fanned evenly across spread about the aim', type: 'integer', absent: () => 1 },
  { key: 'spread', label: 'spread (°)', title: 'the fan a burst\'s bullets are spread across', type: 'angle', absent: () => 0 },
  { key: 'ring', label: 'ring', title: 'a burst\'s bullets evenly round the whole turn, the first on the aim', absent: () => false },
  { key: 'bursts', label: 'bursts', title: 'how many bursts, every seconds apart', type: 'integer', absent: () => 1 },
  { key: 'every', label: 'every (s)', title: 'the seconds between one burst and the next', absent: () => 0 },
  { key: 'after', label: 'after (s)', title: 'the seconds into the volley its first burst is fired', absent: () => 0 },
  { key: 'turn', label: 'turn (°)', title: 'each burst\'s aim turned this much more than the last\'s: a spiral', type: 'angle', absent: () => 0 },
  { key: 'offset', label: 'offset (°)', title: 'added to the volley\'s aim for this layer', type: 'angle', absent: () => 0 },
  { key: 'from', label: 'from (x, y)', title: 'off the volley\'s point its bullets start from, not turned by the aim', absent: () => [0, 0] },
  { key: 'speed', label: 'speed (/s)', title: 'world units a second at its start', absent: () => 0 },
  { key: 'accel', label: 'accel (/s²)', title: 'added to its speed every second', absent: () => 0 },
  { key: 'min', label: 'min (/s)', title: 'the speed it holds once it slows to it; left out, none', absent: l => Math.min(0, l.speed ?? 0) },
  { key: 'max', label: 'max (/s)', title: 'the speed it holds once it speeds up to it; left out, none', absent: l => Math.max(0, l.speed ?? 0) },
  { key: 'curve', label: 'curve (°/s)', title: 'its heading turns this much every second', type: 'angle', absent: () => 0 },
  { key: 'life', label: 'life (s)', title: 'the seconds it flies before it is gone; left out, until it leaves the bounds', absent: (l, c) => lifeOf(l, c.world.bounds, c.dt) },
  { key: 'radius', label: 'radius', title: 'how near its centre must come to what it may hit to hit it', absent: () => 0 },
  { key: 'damage', label: 'damage', title: 'what it deals', absent: () => 1 },
  { key: 'sheet', label: 'sheet', title: 'the loader sheet it is drawn from; without one and a clip it is not drawn', type: 'loader.sheet', absent: (_, c) => c.sheets[0] },
  { key: 'clip', label: 'clip', title: 'the clip of the sheet whose frame 0 it is drawn as', type: 'volley2d.clip', absent: (_, c) => c.clips?.[0] },
  { key: 'orient', label: 'orient', title: 'its frame turned so its down lies along its heading', absent: () => false },
  { key: 'layer', label: 'layer', title: 'the render2d layer it is drawn on; left out, world.volley2d\'s', type: 'volley2d.layer', absent: (_, c) => c.world.layer },
]
// The fields of a `{ pattern }` layer but its `pattern`.
export type Ref = { pattern: string; at?: V2; dir?: number; after?: number }
export const REF: Spec<Ref>[] = [
  { key: 'at', label: 'at (x, y)', title: 'off the volley\'s point its bullets start from', absent: () => [0, 0] },
  { key: 'dir', label: 'dir (°)', title: 'turns its bullets\' aim', type: 'angle', absent: () => 0 },
  { key: 'after', label: 'after (s)', title: 'the seconds later its bullets are fired', absent: () => 0 },
]
// A field whose meaning needs another: offered only while the layer has that one, and removed with
// it; and of those, the ones it cannot do without, added with it.
export const NEEDS: Partial<Record<keyof Emitter, keyof Emitter>> = { clip: 'sheet', orient: 'sheet' }
export const BOUND: (keyof Emitter)[] = ['clip']

// ---------------------------------------------------------------- reading the file

// A layer's `{ pattern }`, or undefined for an emitter.
export const named = PATTERNS.named

// The value at `at` inside `v`, or undefined (the loader's).
export { valueAt }

// What firing a pattern takes, found as the sim opens its `{ pattern }` layers out: its emitters, its
// bullets, the sheets whose files it needs read before it can be checked, and every reason it would
// throw as the plugin draws it.
export type Survey = { emitters: Emitter[]; shots: Shot[]; waiting: string[]; problems: string[] }

// A layer that is not what volley2d reads, a field of the wrong shape or one it has not got, is a
// problem, said as the commands refuse it (`layerShapes`), and it is opened no further.
export function survey(file: Patterns, name: string, assets: Record<string, Asset>, clipsOf: (sheet: string) => string[] | undefined, w: { world: World; layers: string[] }): Survey {
  const out: Survey = { emitters: [], shots: [], waiting: [], problems: [] }
  const shape = shapeOf()
  const open = (n: string, path: string[]) => {
    if (path.includes(n)) return void out.problems.push(`${n} is built out of itself: ${[...path, n].join(' > ')}`)
    const layers = Object.hasOwn(file.patterns, n) ? file.patterns[n] : undefined
    if (!layers) return void out.problems.push(path.length ? `${path[path.length - 1]} names ${n}, which there is none of` : `there is no pattern ${n}`)
    layers.forEach((l, i) => {
      const got = shape.safeParse(l)
      if (!got.success) return void out.problems.push(...got.error.issues.map(q => `layer ${i} of ${n}${q.path.length ? ` ${q.path.join('.')}` : ''}: ${q.message}`))
      const p = named(l)
      if (p !== undefined) open(p, [...path, n])
      else out.emitters.push(l as Emitter)
    })
  }
  open(name, [])
  if (out.problems.length) {
    out.problems = [...new Set(out.problems)]
    return out
  }
  out.shots = shots(file, name)
  for (const l of out.emitters) {
    const layer = l.layer ?? w.world.layer
    if (w.layers.length && !w.layers.includes(layer)) out.problems.push(`a layer draws on ${layer}, which render2d has no layer of`)
    if (l.sheet === undefined || l.clip === undefined) continue
    if (assets[l.sheet]?.type !== 'sheet') {
      out.problems.push(`${l.sheet} is no sheet entry of the catalogue`)
      continue
    }
    const clips = clipsOf(l.sheet)
    if (!clips) {
      if (!out.waiting.includes(l.sheet)) out.waiting.push(l.sheet)
      continue
    }
    if (!clips.includes(l.clip)) out.problems.push(`a layer draws clip ${l.clip} of ${l.sheet}, which it does not have`)
  }
  out.problems = [...new Set(out.problems)]
  return out
}

// Every place that names the pattern `name`: the `{ pattern }` layers of its own file, and every
// string value equal to it in the other files, each a parsed json entry of the catalogue (the
// loader's `namedIn`).
export const namings = PATTERNS.namings

// The edits that rename pattern `from` to `to`: every `{ pattern }` layer naming it made to name `to`,
// its layers set under `to`, and `from` removed.
export const renaming = PATTERNS.renaming

// One value written into a file, as the editor writes it (`FileEdit`) (the loader's).
export type { Edit }

// The edits that set the layers of pattern `name` of the file at `path` as the panel's list writes
// them, whether it adds, drops or moves a layer or a layer's field is set, added or taken out (the
// editor's `listEdits`); or, when the file has no pattern of that name, add it with them at the end
// of `patterns`; or with null take it out, refused, naming the patterns, when there is none of it.
export const patternEdits = PATTERNS.edits

// The edits that rename pattern `from` to `to` (`renaming`), none when that is its name already:
// refused when there is no pattern `from`, when `to` is empty, and when another pattern has it.
export const renamed = PATTERNS.renamed

// What `survey` says of pattern `name` of the file at `w` for a command, which waits on no sheet:
// every sheet it draws from read first (the loader's `clipsReady`), and one that still has no clips a
// problem, since it does not read as a sheet.
export function surveyed(ed: Editor, w: Where, file: Patterns, name: string): Promise<Survey> {
  const on = { world: w.world, layers: layersOf(ed, w.scene) }
  return surveyedReady(ed, w.assets, clipsOf => survey(file, name, w.assets, clipsOf, on))
}

// What volley2d reads in a layer, as a call hands it (the editor's `looseInput`), a field at a time:
// an emitter's every field, whole numbers for `n` and `bursts`, seconds of 0 or more, a `from` of two
// numbers; or a `{ pattern }`, fired from its `at`, turned by its `dir`, `after` seconds later. A field
// of neither is refused, naming the fields.
export function layerShapes() {
  const since = z.number().min(0)
  const whole = z.number().int().min(0)
  const shape: Record<keyof Emitter, z.ZodType> = {
    n: whole, spread: z.number(), ring: z.boolean(), bursts: whole, every: since, after: since, turn: z.number(), offset: z.number(),
    from: z.array(z.number()).length(2), speed: z.number(), accel: z.number(), min: z.number(), max: z.number(), curve: z.number(),
    life: since, radius: since, damage: z.number(), sheet: z.string(), clip: z.string(), orient: z.boolean(), layer: z.string(),
  }
  const ref = { pattern: z.string().min(1), at: z.array(z.number()).length(2), dir: z.number(), after: since }
  const emitter = strictFields('volley2d', 'an emitter', shape)
  const pattern = strictFields('volley2d', 'a { pattern } layer', ref, ['pattern'])
  return looseInput(l => ('pattern' in l ? pattern : emitter))
}
// `layerShapes`, made once.
const shapeOf = () => PATTERNS.shape('volley2d', layerShapes)

// ---------------------------------------------------------------- the plot

// A volley's bullets, fired from the frame point `at` along `dir` and stepped `dt` at a time as the
// server steps them, until `span` seconds: each bullet's path, the frame points it is at each step
// from when it is fired until it is gone (its life ended or out of `bounds`) or the span is up; the
// most bullets in the air at once and the first second that many are; and the second the last is
// gone, undefined when one is still in the air at the span's end.
export type Plot = { paths: V2[][]; peak: number; when: number; clear: number | undefined }

export function plot(list: Shot[], at: V2, dir: number, bounds: number[], span: number, dt: number): Plot {
  const [l, t, r, b] = bounds
  const e = { at, dir } as Entry
  const steps = Math.floor(span / dt + 1e-9)
  const air = new Array<number>(steps + 1).fill(0)
  const paths: V2[][] = []
  let clear: number | undefined = 0
  for (const shot of list) {
    const path: V2[] = []
    let gone = false
    for (let i = Math.max(0, Math.ceil(shot.t0 / dt - 1e-9)); i <= steps; i++) {
      const p = ahead(shot, e, [0, 0], i * dt)
      if (!p || p.pos[0] < l || p.pos[0] > r || p.pos[1] < t || p.pos[1] > b) {
        gone = true
        if (clear !== undefined) clear = Math.max(clear, i * dt)
        break
      }
      path.push(p.pos)
      air[i]++
    }
    if (!gone) clear = undefined
    paths.push(path)
  }
  const peak = Math.max(0, ...air)
  return { paths, peak, when: peak ? air.indexOf(peak) * dt : 0, clear }
}

// The plot of a pattern's bullets `shots` in a scene of `bounds` stepped `dt` at a time, fired from
// the middle of the bounds along `dir` and followed `seconds`, as the panel plots it and
// `volley2d.plot` draws it.
export function plotted(bounds: number[], dt: number, shots: Shot[], dir: number, seconds: number): Plot {
  const [l, t, r, b] = bounds
  return plot(shots, [(l + r) / 2, (t + b) / 2], dir, bounds, seconds, dt)
}

// The plot drawn on `c`, the panel's canvas's context or a picture's pixels (`raster`), `width` by
// `height`, in the theme's colours as `color` reads them: `bounds` as large as they fit, outlined;
// every bullet's path, faint; and the point it is fired from, their middle.
export function drawPlot(c: Pen, color: (name: string) => string, got: Plot, bounds: number[], width: number, height: number) {
  const [l, t, r, b] = bounds
  const k = Math.min(width / (r - l), height / (b - t))
  const ox = (width - (r - l) * k) / 2, oy = (height - (b - t) * k) / 2
  const x = (v: number) => ox + (v - l) * k, y = (v: number) => oy + (v - t) * k
  c.strokeStyle = color('--border')
  c.strokeRect(x(l), y(t), (r - l) * k, (b - t) * k)
  c.strokeStyle = color('--accent')
  c.globalAlpha = 0.25
  c.lineWidth = 1
  for (const path of got.paths) {
    if (path.length < 2) continue
    c.beginPath()
    c.moveTo(x(path[0][0]), y(path[0][1]))
    for (const p of path.slice(1)) c.lineTo(x(p[0]), y(p[1]))
    c.stroke()
  }
  c.globalAlpha = 1
  c.fillStyle = color('--accent')
  c.fillRect(x((l + r) / 2) - 2, y((t + b) / 2) - 2, 4, 4)
}

// The life that changes nothing yet for a layer that leaves it out: the seconds its last bullet fired
// from the middle of `bounds` takes to leave them, to the step above, found over a minute; a minute
// when one never does.
export function lifeOf(l: Emitter, bounds: number[], dt: number): number {
  const lone = shots({ patterns: { lone: [{ ...l, life: undefined, after: 0, bursts: 1 }] } }, 'lone')
  const p = plot(lone, [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], 0, bounds, 60, dt)
  return p.clear === undefined ? 60 : +(Math.ceil(p.clear * 10 - 1e-9) / 10).toFixed(1)
}

// ---------------------------------------------------------------- the preview

// The dial's degrees, clockwise from up the screen, of a heading of volley2d's, radians from the
// world's x toward its y, as a world whose y grows down the screen draws it; and back.
export const bearing = (dir: number) => ((Math.round((dir * 180) / Math.PI + 90) % 360) + 360) % 360
export const heading = (deg: number) => +(((deg - 90) * Math.PI) / 180).toFixed(9)

// The preview's aim, a heading, and the seconds the plot runs to.
export type Spawn = { dir: number; plot: number }
const SPAWN: Spawn = { dir: Math.PI / 2, plot: 4 }

// A new pattern's one layer: a ring of 8, drawn as the first bullet of the file that is drawn.
export function fresh(file: Patterns): Emitter {
  const drawn = Object.values(file.patterns).flat().find((l): l is Emitter => named(l) === undefined && !!(l as Emitter).sheet && !!(l as Emitter).clip)
  return { n: 8, ring: true, speed: 80, ...(drawn ? { sheet: drawn.sheet, clip: drawn.clip } : {}) }
}

// Firing pattern `name` of `file` from the point `at` along the heading `dir` through the plugins of a
// client, as the preview, the tool and `fire` fire it; or why it is not, when it would throw as the
// page draws it (`layers` are the scene's render2d's), waits for a sheet to be read, or has no point.
export function firing(plugins: Plugins, file: Patterns, w: Where, layers: string[], name: string, at: number[] | undefined, dir: number, clipsOf: (sheet: string) => string[] | undefined): { go: () => Entry } | { why: string } {
  const sv = survey(file, name, w.assets, clipsOf, { world: w.world, layers })
  if (sv.problems.length) return { why: `${name} is not fired: ${sv.problems.join('; ')}` }
  if (sv.waiting.length) return { why: `${name} waits for ${sv.waiting.join(', ')} to be read` }
  if (!at) return { why: 'the view has no ground to fire on yet' }
  return { go: () => plugins.volley2d.fire(name, at, dir) }
}

// The panel's and the tool's shared state: the pattern selected, the loop, the aim and the plot's
// seconds, the loop's point, and what the last volley found.
export type Studio = {
  subscribe(f: () => void): () => void
  version(): number
  pattern: string | undefined
  select(name: string | undefined): void
  loop: boolean
  setLoop(on: boolean): void
  spawn: Spawn
  setSpawn(patch: Partial<Spawn>): void
  // The last point the tool was pressed at, on the scene it was pressed on.
  point: { scene: string; at: number[] } | undefined
  setPoint(point: { scene: string; at: number[] } | undefined): void
  // Why the selected pattern is not being fired, when it is not.
  held: string | undefined
  // Fires the selected pattern once, and says why when it cannot.
  fire(): void
  // The panel is open while the call it hands back has not been made.
  open(): () => void
}

export function volley2d(ed: Editor) {
  const store = 'volley2d.preview'
  const listeners = new Set<() => void>()
  let version = 0
  const changed = () => {
    version++
    for (const f of listeners) f()
  }

  let kept: { pattern?: string; loop?: boolean; spawn?: Partial<Spawn> } = {}
  try {
    kept = JSON.parse(localStorage.getItem(store) ?? '{}')
  } catch {
    kept = {}
  }
  const keep = () => {
    try {
      localStorage.setItem(store, JSON.stringify({ pattern: studio.pattern, loop: studio.loop, spawn: studio.spawn }))
    } catch {
      // A page that keeps nothing previews all the same.
    }
  }

  // The patterns file's text read once; undefined until the editor has read it, or when it is not JSON.
  const parsed = new Map<string, { text: string; value: unknown }>()
  const reading = new Set<string>()
  const parse = (path: string): unknown => {
    const text = ed.texts.get(path)
    if (text === undefined) {
      if (!reading.has(path)) {
        reading.add(path)
        void ed.text(path).catch(e => ed.error(`${path}: ${(e as Error).message}`)).finally(() => reading.delete(path))
      }
      return undefined
    }
    const had = parsed.get(path)
    if (had?.text === text) return had.value
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      value = undefined
    }
    parsed.set(path, { text, value })
    return value
  }
  const clipsOf = (w: Where) => (sheet: string) => {
    const a = w.assets[sheet]
    return a?.type === 'sheet' ? clipsIn(ed, a) : undefined
  }

  // The view's client's plugins, while the view shows the panel's scene.
  const target = () => {
    const w = focus(ed)
    const s = ed.session
    return w && s && s.viewing === w.scene && s.client ? { w, plugins: s.client.plugins } : undefined
  }
  // Where the preview fires on the scene: the tool's last point there, else the ground under the
  // middle of the view.
  const pointOn = (scene: string, plugins: Plugins): number[] | undefined => {
    if (studio.point?.scene === scene) return studio.point.at
    const canvas = plugins.render2d?.canvas as HTMLCanvasElement | undefined
    return canvas && ed.staged?.ground(canvas.width / 2, canvas.height / 2)
  }

  let last: Entry | undefined
  // The volley the preview would fire now, or why there is none.
  const next = (): { go: () => Entry } | { why: string } | undefined => {
    const t = target()
    const name = studio.pattern
    if (!t || !name) return undefined
    const file = parse(t.w.path) as Patterns | undefined
    if (!file?.patterns) return { why: `${t.w.path} has not been read` }
    return firing(t.plugins, file, t.w, layersOf(ed, t.w.scene), name, pointOn(t.w.scene, t.plugins), studio.spawn.dir, clipsOf(t.w))
  }
  const hold = (why: string | undefined) => {
    if (studio.held === why) return
    studio.held = why
    changed()
  }

  // The loop's point and the aim from it marked on the stage the view has.
  let marked: { stage: unknown; key: string; off: () => void } | undefined
  const unmark = () => {
    marked?.off()
    marked = undefined
  }
  const mark = () => {
    const t = target()
    const stage = ed.staged
    const file = t && (parse(t.w.path) as Patterns | undefined)
    const at = t && studio.pattern && file?.patterns?.[studio.pattern] ? pointOn(t.w.scene, t.plugins) : undefined
    if (!t || !stage || !at) return unmark()
    const d = studio.spawn.dir
    const reach = (t.w.world.bounds[2] - t.w.world.bounds[0]) / 8
    const points = [[at[0], at[1]], [at[0] + reach * Math.cos(d), at[1] + reach * Math.sin(d)]]
    const key = JSON.stringify(points)
    if (marked?.stage === stage && marked.key === key) return
    unmark()
    marked = { stage, key, off: stage.mark(points, themed('--accent', 0x4c8dff)) }
  }

  // After each frame of the editor's clock while the panel is open (`Session.onFrame`): the mark, and
  // the loop's next volley once the last is gone.
  let opened = 0
  const frame = () => {
    try {
      mark()
      const plugins = target()?.plugins
      const flying = !!last && !!plugins && (plugins.volley2d.preview as readonly Entry[]).includes(last)
      if (studio.loop && !flying) {
        const n = next()
        if (n && 'go' in n) {
          last = n.go()
          hold(undefined)
        } else hold(n?.why)
      }
    } catch (e) {
      ed.error(`volley2d preview: ${(e as Error).message}`, (e as Error).stack)
    }
  }
  // The session whose clock the preview follows, the open game's while the panel is open, and the
  // call that stops following it; followed anew as a game is opened or closed (`game`).
  let following: { session: Session; off: () => void } | undefined
  const follow = () => {
    const s = opened ? ed.session : undefined
    if (following?.session === s) return
    following?.off()
    following = s && { session: s, off: s.onFrame(frame) }
  }
  let unwatch: (() => void) | undefined

  const studio: Studio = {
    subscribe(f) {
      listeners.add(f)
      return () => { listeners.delete(f) }
    },
    version: () => version,
    pattern: kept.pattern,
    select(name) {
      if (studio.pattern === name) return
      studio.pattern = name
      studio.held = undefined
      last = undefined
      keep()
      changed()
    },
    loop: kept.loop ?? true,
    setLoop(on) {
      studio.loop = on
      studio.held = undefined
      keep()
      changed()
    },
    spawn: { ...SPAWN, ...kept.spawn },
    setSpawn(patch) {
      studio.spawn = { ...studio.spawn, ...patch }
      keep()
      changed()
    },
    point: undefined,
    setPoint(point) {
      studio.point = point
      changed()
    },
    held: undefined,
    fire() {
      const n = next()
      if (!n) {
        const w = focus(ed)
        const why = !studio.pattern ? 'no pattern is selected' : w ? `the game view does not show ${w.scene}` : 'no scene fires volleys'
        hold(why)
        return ed.info(`volley2d: ${why}`)
      }
      if ('why' in n) {
        hold(n.why)
        return ed.error(`volley2d: ${n.why}`)
      }
      last = n.go()
      hold(undefined)
    },
    open() {
      opened++
      if (opened === 1) unwatch = ed.subscribe(follow, ['game'])
      follow()
      return () => {
        opened--
        if (opened) return
        unwatch?.()
        unwatch = undefined
        follow()
        unmark()
      }
    },
  }

  function PatternsPanel() {
    return <Panel studio={studio} />
  }
  ed.panel({ id: 'volley2d', title: 'Patterns', area: 'right', component: PatternsPanel })

  ed.tool({
    id: 'volley2d.fire',
    title: 'Fire Pattern',
    key: 'B',
    cursor: 'crosshair',
    down(p: Pointer) {
      const at = p.stage.ground(p.x, p.y)
      if (!at) return
      const w = focus(ed)
      if (w?.scene !== p.scene) return ed.info(`volley2d: the patterns are ${w ? `${w.scene}'s` : 'no scene\'s'}, and the view shows ${p.scene}`)
      studio.setPoint({ scene: p.scene, at: at.map(v => Math.round(v * 1000) / 1000) })
      studio.fire()
    },
  })

  ed.field('volley2d.pattern', PatternName)
  ed.field('volley2d.clip', ClipName)
  ed.field('volley2d.layer', LayerName)
  const each = (key: string, type: string) => ({ [`patterns.*.*.${key}`]: type })
  ed.bindFile(path => drawing(ed).some(w => w.path === path), {
    ...Object.assign({}, ...SPECS.filter(s => s.type).map(s => each(s.key, s.type!))),
    ...each('pattern', 'volley2d.pattern'),
    ...each('dir', 'angle'),
  })

  // ---------------------------------------------------------------- the commands

  // Pattern `name` as the panel shows it selected, with its plot's numbers.
  const shown = async (w: Where, file: Patterns, name: string, dir = SPAWN.dir, seconds = SPAWN.plot) => {
    const layers = patternIn(file, w.path, name)
    const sv = await surveyed(ed, w, file, name)
    const got = sv.problems.length ? undefined : plotted(w.world.bounds, w.dt, sv.shots, dir, seconds)
    return {
      scene: w.scene, file: w.path, name, layers, named: namings(file, w.path, name, await PATTERNS.others(ed, w)), problems: sv.problems, bullets: sv.shots.length,
      ...(got && { plot: { dir, seconds, peak: got.peak, when: got.when, clear: got.clear ?? null } }),
    }
  }
  // What the commands on the patterns are handed: the scenes that fire them, and how a pattern is
  // surveyed and shown, with how many bullets a volley of it fires.
  const on: Lister<Patterns, Where, Survey> = {
    ed, scenes: () => drawing(ed), does: 'fires volley2d volleys', fails: 'would not be fired',
    surveyed: (w, file, name) => surveyed(ed, w, file, name), shown: (w, file, name) => shown(w, file, name), more: sv => ({ bullets: sv.shots.length }),
  }
  const scene = z.string().describe('a scene that fires volley2d volleys')
  const aim = z.number().default(SPAWN.dir).describe('the heading, radians from x toward y: π/2 straight down')
  const seconds = z.number().positive().default(SPAWN.plot).describe('how long the plot follows each bullet')
  const layer = shapeOf().describe('an emitter, by the fields volley2d reads, or { pattern, at?, dir?, after? }')

  ed.command({
    id: 'volley2d.patterns',
    title: 'Patterns: patterns',
    input: z.object({
      scene: scene.optional().describe('a scene that fires volley2d volleys; every one, with its file, when left out'),
      name: z.string().optional().describe('one pattern of the scene\'s file, shown as the panel shows it selected'),
      dir: aim,
      seconds,
    }).describe(`The Patterns panel's patterns: every scene that fires them, with its file; a scene's patterns, with their layers, bullets, how many places name each and why it would not be fired; or one, its layers, where it is named, and its plot's peak in the air, when, and when the last is gone. ${OUTLINE}`),
    run: ({ scene, name, dir, seconds }) => PATTERNS.listed({ ...on, shown: (w, file, n) => shown(w, file, n, dir, seconds) }, scene, name),
  })
  ed.command({
    id: 'volley2d.pattern',
    title: 'Patterns: pattern',
    input: z.object({
      scene,
      name: z.string().min(1).describe('the pattern; one the file has not got is added'),
      layers: z.array(layer).nullable().describe('its layers, in order; null takes it out'),
      anyway: z.boolean().optional().describe('takes it out though a layer or a data file names it'),
    }).describe('Sets a pattern\'s layers, adds it, or takes it out, as the Patterns panel does: one undo, refused where a layer would make the pattern throw as the page draws it. Answers the pattern.'),
    run: ({ scene, name, layers, anyway = false }, e) => PATTERNS.set(on, e, scene, name, layers as Layer[] | null, anyway),
  })
  ed.command({
    id: 'volley2d.rename',
    title: 'Patterns: rename',
    input: z.object({
      scene,
      from: z.string().describe('the pattern'),
      to: z.string().describe('its new name, which no other pattern has'),
    }).describe('Renames a pattern and every { pattern } layer that names it, as the Patterns panel does: one undo. Answers the pattern, and where else its old name is still named.'),
    run: ({ scene, from, to }, e) => PATTERNS.rename(on, e, scene, from, to),
  })
  ed.command({
    id: 'volley2d.plot',
    title: 'Patterns: plot',
    input: z.object({
      scene,
      name: z.string().describe('the pattern'),
      dir: aim,
      seconds,
      width: z.number().int().min(16).max(2048).default(400).describe('pixels across; its height is the bounds\' at that scale'),
    }).describe('The Patterns panel\'s plot as a PNG: every bullet\'s path over the scene\'s bounds, faint, fired from their middle, worked out from the file, a step of the scene\'s dt at a time.'),
    run: async ({ scene, name, dir, seconds, width }) => {
      const { w, file } = await PATTERNS.fileOf(on, scene)
      patternIn(file, w.path, name)
      const sv = await surveyed(ed, w, file, name)
      if (sv.problems.length) throw new Error(`${name} cannot be plotted until it builds: ${sv.problems.join('; ')}`)
      const got = plotted(w.world.bounds, w.dt, sv.shots, dir, seconds)
      const [l, t, r, b] = w.world.bounds
      // The theme's colours, as the panel's canvas draws them, over the panel's own, else black.
      const color = (key: string) => hexOf(themed(key, 0x888888))
      const height = Math.max(1, Math.round((width * (b - t)) / (r - l)))
      const picture = raster(width, height, themed('--panel', 0))
      drawPlot(picture.pen, color, got, w.world.bounds, width, height)
      return picture.png()
    },
  })
  ed.command({
    id: 'volley2d.fire',
    title: 'Patterns: fire',
    input: z.object({
      scene,
      name: z.string().describe('the pattern'),
      at: z.array(z.number()).length(2).describe('the world point [x, y] it is fired from'),
      dir: aim,
    }).describe('Fires a pattern once in the game view, as Fire Pattern does: a volley of the page\'s own, on no row. The view must show the scene. Answers the volley.'),
    run: async ({ scene, name, at, dir }) => {
      const { w, file } = await PATTERNS.fileOf(on, scene)
      patternIn(file, w.path, name)
      const sv = await surveyed(ed, w, file, name)
      if (sv.problems.length) throw new Error(`${name} is not fired: ${sv.problems.join('; ')}`)
      const client = await ed.need().clientOn(scene)
      const got = firing(client.plugins, file, w, layersOf(ed, w.scene), name, at, dir, sheet => clipsIn(ed, w.assets[sheet]))
      if ('why' in got) throw new Error(got.why)
      const volley = got.go()
      return { scene, pattern: volley.pattern, at: volley.at, dir: volley.dir, bullets: sv.shots.length, live: (client.plugins.volley2d.preview as readonly Entry[]).length }
    },
  })
}
