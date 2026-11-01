// The loader's extension: the Assets panel, the Sheets panel, the inspector's Clip section, the field
// types `loader.sheet`, `loader.palette` and `loader.type`, and the measure of a sheet's frames, which the Assets
// panel's read-back, the Sheets panel and a game's own tools all ask.
//
// The Assets panel (`loader.components.tsx`) is the catalogue of the scene `focus('loader')` says,
// or of another scene with a loader row picked in the panel: every entry with its type, url,
// preload and drawing fields, whether it loads, and for a sheet its read-back. Selecting a json or
// sheet entry selects its file, so the inspector shows the file and the Clip panel the sheet, and
// the panel follows the selection to an entry whose file another panel selects. An entry's fields
// are edited in place, each change one value of `world.loader.assets.<name>` in the file that
// gives the scene's `world.loader`, and an entry is removed with one such change.
//
// Whether an entry loads is tried one of two ways, and each is shown with the way it was tried.
// While the game view shows the panel's scene, through that client's own loader, as the game
// loads it: an entry `ready` there has loaded, and Try every entry `retry`s the rest, each coming
// to what `load` comes to, the loader's own message when it fails. Always, through its files, as
// far as the editor can tell without the game (`tried`): a json file reads and parses; a sheet's
// file, and every other pack of it, reads, parses and is read by `read`, whose throws are the
// loader's own words, and each page it names loads as an image; a palette reads as a GIMP palette
// (`gpl`); a tilemap reads as a Tiled map with every tileset it names (`readMap`), and each image it
// draws from loads; a pixels file reads as a PNG (`decodePng`); a texture loads as an image; a font loads as a font (`FontFace`); a model's, a sound's or a bitmap font's file is in
// its folder. An entry neither way has tried is untried, and is never said to load. Check again tries
// every entry through its files anew and reads every sheet back again, its images read anew too.
//
// The read-back, the export's own, is `check` over every sheet of the catalogue, one at a time with
// the page let go for a turn before each (`turn`), each
// page's pixels read as the file holds them (`pixelsAt`, `editor/ui/pixels.ts`; `readBack`); it is kept by each sheet's url and text, so an
// edit to a sheet reads it back again. `travel`, the clips whose frames move across the ground on
// purpose, is the viewer's own, kept in the browser for each game (`loader.travel.<game>`); since
// `check` skips only a travelling clip's neighbours, the read-back is taken once with none, and a
// clip marked travelling drops its pairs' problems from it (`travelled`).
//
// A sheet from elsewhere on the machine comes in through the loader's routes (`loader.route.ts`):
// `look` says what it is, `copy` puts it and its pages into a folder of the repo and writes its
// catalogue entry. Add copies it into a folder and adds an entry for it, drawn as a sibling entry
// is. Swap copies it beside a sheet entry's file: when the copy has the entry's own file name it
// writes over the entry's files, which the running game reads anew; else the entry's url is set to
// it. Each is the one route, the files and the entry together, run as one change the editor can
// undo (`Edits.route`): the undo puts every file back as it was, or takes it away when it was not
// there, and a copy refused part-way leaves nothing written.
//
// A picture entry, a `pixels` PNG of the repo such as a ripper's page of a game's tiles, is cut into
// a sheet through the loader's `slice` route: Slice cuts it into the sheet it names, in tiles of the
// width it is given, with the ripper's marks in the colours it is given and sprites on no tile of
// the fewest pixels it is given, and adds an entry for the sheet, drawn as a sibling entry is, the
// one route as one change the editor can undo, which takes the sheet and its page away, or puts back
// any it wrote over, and the entry with them.
//
// What the Assets panel does is done by functions here, which it and its commands call alike: an
// entry's fields written, or the entry taken out, by `entryEdits`, which refuses a value the loader
// does not read; the game asked for its entries again by `tryInGame`, what it made of each kept for
// the session (`gameTried`), so the panel shows what a call asked; the travelling clips kept for
// the session and in this browser (`travelIn`, `travels`, `setTravel`); and how a sheet comes in,
// and why it may not, by `addPlan`, `slicePlan` and `swapPlan`, whose refusals disable the panel's
// buttons and are said beside them, then brought in by `addSheet`, `sliceSheet` and `swapSheet`.
// Its commands, for an LLM calling them (`editor/mcp.ts`): `loader.assets` answers a scene's
// catalogue as the panel shows it, each entry's fields, how it loads through its files and, while
// the game view shows the scene, through the game, and a sheet's read-back, or one entry with its
// read-back's problems and its slices; `loader.try` tries entries anew, through their files as
// Check again does, or through the game view's loader as Try every entry does, which awaits a frame
// of the view and is refused while it shows another scene; `loader.entry` sets, adds or takes out
// an entry; `loader.travel` says a clip travels, or no more; `loader.look` looks at a sheet on this
// machine; and `loader.add`, `loader.swap` and `loader.slice` are Add a sheet, Swap and Slice, each
// one undo. Every one but `loader.try` through the game works from the files, whatever the game
// view shows.
//
//
// The Sprites panel (`loader.components.tsx`) touches up a sheet's pixels a pixel at a time. On the
// sheets of the catalogue of the scene picked, or of the one whose catalogue has a sheet file
// selected, else of the one `focus('loader')` says, it shows the sheet a file selected names, else
// the one picked, and its frames: the frame picked is drawn upright at a whole-number zoom over a
// checker, a pixel of it a square, with a grid between them when it is drawn large, and the pixel
// under the pointer and its colour said; a right or middle drag moves it, so a frame drawn larger
// than the panel can be reached all over, and picking another frame or zoom puts it back. The
// pencil sets the pixels a press and a drag pass over, one line of them between two points the
// pointer was read at, to the colour, red, green, blue and alpha, so a colour of alpha 0 clears
// them; the picker, or the pencil with Alt, sets the colour to the pixel's. `B` and `I` pick the
// two, and each colour set is put first among the recent ones. The pixels set are the panel's until
// they are saved: kept for the game open, the session, a stroke at a time, each stroke one Undo
// stroke (Mod+Z on the picture) takes back, and Revert one more stroke that sets none, so Undo
// stroke takes a revert back too. Every frame is drawn with them.
//
// Save writes them onto the sheet's own pages, and Save as onto a copy of the sheet at the path
// given, every pack and page of it with it, named after it (`paint` of `loader.route.ts`), and, when
// asked, adds an entry for the copy by the name given to the catalogue, drawn and loaded as the
// sheet's own entry is, then shows it. Each is the one route as one change the editor can undo, the
// pages put back, or the copy and its entry taken away (`saveSheet`, `saveSheetAs`). A page written
// is read anew, by the panels (`readAt`) and by the running game (`extensions/datafiles`), which
// draws it at once.
//
// The Sprites panel's commands do what the panel does, for an LLM calling them (`editor/mcp.ts`):
// `sprites.sheets` and `sprites.frames` list the catalogues' sheets and a sheet's frames;
// `sprites.read` answers a frame's pixels upright, `#rrggbbaa` a row at a time, and `sprites.shot`
// the frame as a PNG, each with the pixels set; `sprites.show` shows a frame in the panel;
// `sprites.paint` sets pixels as one stroke, and shows the frame; `sprites.undo` and
// `sprites.revert` are Undo stroke and Revert; `sprites.save` and `sprites.saveAs` are Save and Save
// as, one undo each. What the panel shows, its strokes and its colour are the session's, so a call
// and the panel show and set the same pixels.
//
// The Sheets panel (`loader.components.tsx`) is the one clip viewer. On the sheets of the catalogue
// of the scene selected, else of the one the game view shows, else of the first scene with a loader
// row, it shows the sheet a row or a file selected names, and picks any `sheet` entry of that
// catalogue, an Aseprite or TexturePacker JSON or a Tiled `.tsj`, and lists its clips with their
// frames, how each plays (a tag's direction and repeat, a Tiled tile's animation) and how many runs
// it has, `<clip>@<k>` being run k; a filter narrows the list by name. It plays a clip as the game
// plays it: the loader's `read` of the files with the entry's `nearest`, `facing` and `palette`,
// and the loader's `play` a step of the game's `dt` at a time, so every frame shows for as many
// steps as it does in the game; it pauses, steps a frame on or back, and shows the frame's place,
// id and duration and the steps played. It draws the frame at a whole-number zoom with nearest
// filtering, on a checker or a colour, with the pivot as a cross, the foot line across it, the
// whole frame dashed and the pixels the frame keeps boxed. A frame packed turned is stood upright,
// and a trimmed one put back in its whole frame, as PixiJS draws them.
//
// The onionskin draws every frame of the run over the others, each in its own colour along a ramp of
// hues and added together, so where they agree is white and a frame the pack moved shows as a fringe
// (`editor/ui/onion.ts`); beside it, each frame's miss against the run's first at the whole-pixel
// shift that fits it best, and its `verdict`, by the measure below; a mirrored run's shift is
// mirrored with it. Facing shows the frame as the
// game draws it each way the sheet's runs face and, when the sheet mirrors, each mirror image,
// flipped; picking one plays that run that way. A sheet whose entry names a `palette` is drawn in it,
// or in any palette of the catalogue swapped for it colour for colour, as sprite2d swaps them.
//
// The clip list counts each clip's flagged pairs, over every run, and the run shown lists its own: a
// pair of neighbouring frames one drawing but `SLIP` pixels or more apart, or unrelated (`pairs`),
// in words; a pair apart is settled with one change, the later frame's anchor moved by the pair's
// shift onto the earlier.
//
// Edits are written into the sheet's files, one value at a time, each one undo: a frame's
// `duration`, that frame of every run of the clip, or every frame's to time a clip that has none; a
// tag's `direction` and `repeat`, every run's tag; where a frame stands, its anchor set or nudged a
// pixel, and a clip's pivot, every frame of the clip stood on one point of its whole frame, both by
// the one pivot writer: the fraction each frame's `pivot` (or `anchor`) is, a number at a time, in
// whichever pack holds the frame; and a slice's key (`sliceEdit`): with a slice picked, a pixel of
// the frame clicked keys the run's key of that slice on that frame at that pixel, a 1 × 1 `bounds`
// of the frame's whole picture as the export writes the muzzle, a slice by a new name made with its
// first key. `extensions/datafiles` refills the running game's copies, so the game view draws the
// change at once.
//
// What the Sheets panel reads, draws and writes is done by functions here, which it and its commands
// call alike: the sheet read from its files (`sheetFrom`), a frame drawn (`drawnOf`), the picture
// drawn on the panel's canvas or on a picture's pixels (`drawClip`, the design system's `raster`), and
// each edit's writes, refused where the panel offers no such edit (`durationEdit`, `tagEdit`,
// `anchorEdit`, `pivotEdit`, `settleEdit`, `sliceKeyEdit`), written by `sheetWrite`. Its commands,
// which work from the files whatever the game view shows: `sheets.clips` lists a sheet's clips as the
// panel does, or shows one clip, its timed frames, each run's places with the milliseconds and game
// steps each shows, its onionskin measures, flags and slice keys, where each frame stands, its ways
// and the palettes it may be drawn in; `sheets.shot` is a frame, or a run's onionskin, as the panel
// draws it, a PNG; and `sheets.duration`, `sheets.tag`, `sheets.anchor`, `sheets.pivot`,
// `sheets.settle` and `sheets.slice` are its edits, one undo each.
//
// Selecting a row that plays a clip, one that names a `sheet` of the catalogue and its `clip`, as
// sprite2d's and sprite3d's rows do, shows that clip in the panel at the row's frame and palette,
// facing the way sprite2d draws the row when the game view draws its scene; the inspector gets a
// section on such a row that names what it plays and shows the panel. A row of a kind sprite2d or
// sprite3d draws names them as that plugin reads them, from its kind's entry of `world.sprite2d` or
// `world.sprite3d` where that gives them (`plays`).
//
// What any extension asks of a catalogue it reads through the editor is asked here: a sheet entry's
// clips as the loader reads them, from files the editor has read (`clipsIn`) or once it has read
// them (`clipsReady`), and the files they are read from (`clipsFiles`); the catalogue's json entries, where a data file's names are named (`jsonsOf`,
// `jsonsRead`), and where in them a name is named (`namedIn`), which a name taken out is refused
// for unless the caller says to take it out all the same (`stillNamed`); what a survey of a file's
// entry says once every sheet it draws from has been read (`surveyedReady`); and a json entry that
// holds named lists of layers, a layer naming another list, as particle2d's effects and volley2d's
// patterns do, read, written a list at a time, a list renamed with every layer that names it, and
// its commands answered, as their panels and commands alike do it (`namedLists`), a panel's edits
// written as one change or refused (`putEdits`).
//
// The types: `loader.sheet` is a sheet entry of the catalogue of the owner's scene, else of the one
// `focus('loader')` says, a pick of the catalogue's sheets with a name not in it marked so;
// `loader.palette` the same of its palettes;
// `loader.type`, which an entry's `type` is wherever a scene's `world.loader` is shown, a pick of the
// types the loader knows.
//
// The measure (moved here from diorama's `tools/export.ts`, which exports every unit's sheet) is
// plain TypeScript over a page's RGBA bytes (`Pixels`), however they were read. It measures the
// pixels a frame keeps, stood upright as it is drawn, from its anchor: a trimmed frame's kept pixels
// where they were in its whole frame, and a frame packed turned turned back. A pixel is inked when its alpha is above 0; ink of
// pure black (0, 0, 0) is a baked shadow, which no body is drawn in.
//
//   slip     how two frames, each hung on its anchor, fail to overlap: every whole-pixel shift of
//            the second up to `SEEK` each way is scored by the share of the two frames' ink that
//            misses the other's, (|A| + |B| − 2·|A ∩ shifted B|) / (|A| + |B|), and the best shift
//            is the answer, of two as good the shorter. A miss of `ONE` or less is one drawing in
//            two crops; `apart` is such a pair whose best shift is `SLIP` pixels or more on either
//            axis, the packer's mistake and not the art's own sway; `unrelated` a pair whose miss
//            is `UNRELATED` or more even at its best shift, which says the frame list is wrong.
//            `verdict` says it in words: one drawing, unsure below `UNSURE`, two drawings (a
//            stride, a pump) below `UNRELATED`, else unrelated. Anchors are taken to the nearest
//            whole pixel, as pixel art stands on whole pixels. This is the one measure of frames:
//            the Sheets panel's onionskin, the read-back and a game's own tools all ask it.
//   feet     the row, in pixels from the top of a frame's whole picture as it is drawn, under its
//            lowest ink that is not shadow; and `shadow` the middle of the shadow ink under that,
//            where a hovering body stands. Undefined for a frame with no body in it.
//   stands   how a run stands on the line its anchors draw: `feet`, when its lowest feet are on it
//            and none below it; `shadow`, when that is true of each frame's ground instead, the
//            middle of the shadow under it where it has one, as a body that hovers stands; else
//            `off`, with how far below the line the lowest feet are (a negative number is above
//            it). A sheet that carries its own shadow, a clip whose every frame is drawn in shadow
//            ink alone, is drawn in the air over it: its runs stand `air`, where their anchors put
//            them, and the shadow clip itself is not measured.
//   check    the read-back of a whole sheet, as the export reads back what it wrote: every run of
//            every clip stands on its line, or in the air; no two neighbouring frames of a run are
//            one drawing left apart, nor unrelated, the last and the first of a clip that loops
//            counting as neighbours, except in the clips the caller says travel, whose frames
//            move across the ground on purpose, as a body falling does; and every slice keyed on a
//            run of a clip is keyed on every run of it, on the same frame of each. A sheet none of
//            whose runs stands on its line is not drawn standing at all, as a sheet of sparks is
//            not, and its lines are not checked.
import type { Row } from '#engine/engine.ts'
import type { Client } from '#engine/browser.ts'
import { changes, fetched, listEdits, outlined, strictFields, turn, written, type Edits, type Editor, type FileEdit } from '#editor/editor.ts'
import type { At } from '#editor/files.ts'
import type { Session } from '#editor/session.ts'
import { z } from 'zod'
import { onion, type Layer } from '#editor/ui/onion.ts'
import { blank, cut, inkBottom, mirrored, pixelsAt, raster, swapped, type Pen, type Pixels } from '#editor/ui/pixels.ts'
import { beside, decodePng, DIRECTIONS, encodePng, gpl, pick, play, read, readMap, runOf, shapeOf, span, type Entry, type Frame, type Sheet } from './loader.sim.ts'
import type { Copied, Look } from './loader.route.ts'
import { Assets, AssetType, PaletteName, PlaysClip, SheetName, Sheets, Sprites } from './loader.components.tsx'
import { look as look2d, SWAPS, type Spec as Spec2d, type Table as Sprites2d } from '#plugins/sprite2d/sprite2d.plugin.ts'
import { look as look3d, type Table as Sprites3d } from '#plugins/sprite3d/sprite3d.plugin.ts'

export type { Pixels }

export const SEEK = 8, ONE = 0.15, UNSURE = 0.2, SLIP = 3, UNRELATED = 0.6

export type Slip = { miss: number; dx: number; dy: number }

// The index in its page's bytes of the pixel a frame keeps at [u, v] from the top left of its kept
// pixels as they are drawn. A frame stored turned a quarter clockwise on its page has its drawn top
// row running down its box's right edge.
const index = (page: Pixels, f: Frame, u: number, v: number) => {
  const [x, y, w] = f.box
  return f.rotated ? ((y + u) * page.width + x + w - 1 - v) * 4 : ((y + v) * page.width + x + u) * 4
}
// The kept pixels' size as they are drawn, and where they are in the whole frame.
const kept = (f: Frame) => ({ w: f.trim[2], h: f.trim[3], x: f.trim[0], y: f.trim[1] })
const inked = (d: ArrayLike<number>, i: number) => d[i + 3] > 0
const shade = (d: ArrayLike<number>, i: number) => d[i + 3] > 0 && d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0

// A frame's ink, each pixel as [u, v] from its anchor taken to the nearest whole pixel, where the
// pixel is in its whole frame; read once for each page's pixels and frame.
const inks = new WeakMap<Pixels, WeakMap<Frame, number[]>>()
function ink(page: Pixels, f: Frame): number[] {
  let of = inks.get(page)
  if (!of) inks.set(page, (of = new WeakMap()))
  const had = of.get(f)
  if (had) return had
  const { w, h, x, y } = kept(f)
  const ax = Math.round(f.anchor[0]), ay = Math.round(f.anchor[1])
  const out: number[] = []
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) if (inked(page.data, index(page, f, u, v))) out.push(x + u - ax, y + v - ay)
  of.set(f, out)
  return out
}

// How many bits of a 32-bit word are set.
const count = (n: number) => {
  n -= (n >>> 1) & 0x55555555
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

// The best whole-pixel shift of frame `b` onto frame `a`, both hung on their anchors, and its miss.
// Each frame's ink is rows of bits over one span of x, and `b` is laid out once for each shift
// across, so a shift is scored a word of 32 pixels at a time. Shifts are tried as the export tried
// them, down then across, so of two as good at one length the answer is the export's too.
export function slip(pa: Pixels, a: Frame, pb: Pixels, b: Frame): Slip {
  const A = ink(pa, a), B = ink(pb, b)
  if (!A.length || !B.length) return { miss: 1, dx: 0, dy: 0 }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const pts of [A, B])
    for (let i = 0; i < pts.length; i += 2) {
      x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i])
      y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1])
    }
  x0 -= SEEK; x1 += SEEK; y0 -= SEEK; y1 += SEEK
  const words = ((x1 - x0) >> 5) + 1, rows = y1 - y0 + 1
  const lay = (pts: number[], dx: number) => {
    const bits = new Uint32Array(words * rows)
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i] + dx - x0, y = pts[i + 1] - y0
      bits[y * words + (x >> 5)] |= 1 << (x & 31)
    }
    return bits
  }
  const onA = lay(A, 0)
  const onB = Array.from({ length: 2 * SEEK + 1 }, (_, i) => lay(B, i - SEEK))
  // The rows of `b` that have ink, so an empty row costs nothing.
  const bRows: number[] = []
  for (let i = 1; i < B.length; i += 2) if (!bRows.includes(B[i] - y0)) bRows.push(B[i] - y0)
  const total = A.length / 2 + B.length / 2
  let best: Slip = { miss: Infinity, dx: 0, dy: 0 }
  for (let dy = -SEEK; dy <= SEEK; dy++)
    for (let dx = -SEEK; dx <= SEEK; dx++) {
      const bits = onB[dx + SEEK]
      let both = 0
      for (const r of bRows)
        for (let k = 0, i = r * words, j = (r + dy) * words; k < words; k++) {
          const m = bits[i + k]
          if (m) both += count(m & onA[j + k])
        }
      const miss = (total - 2 * both) / total
      if (miss < best.miss - 1e-9 || (Math.abs(miss - best.miss) < 1e-9 && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))) best = { miss, dx, dy }
    }
  return best
}

export const apart = (s: Slip) => s.miss <= ONE && Math.max(Math.abs(s.dx), Math.abs(s.dy)) >= SLIP
export const unrelated = (s: Slip) => s.miss >= UNRELATED
export type Verdict = 'one drawing' | 'unsure' | 'two drawings' | 'unrelated'
export const verdict = (miss: number): Verdict => (miss <= ONE ? 'one drawing' : miss < UNSURE ? 'unsure' : miss < UNRELATED ? 'two drawings' : 'unrelated')

// The row under a frame's lowest body ink, from the top of its whole picture as it is drawn, and the
// middle of the shadow ink under that; undefined for a frame with no body in it.
export function feet(page: Pixels, f: Frame): { feet: number; shadow?: number } | undefined {
  const { w, h, y } = kept(f)
  const d = page.data
  let body = -1
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) { const i = index(page, f, u, v); if (inked(d, i) && !shade(d, i)) body = v }
  if (body < 0) return undefined
  let lo = Infinity, hi = -Infinity
  for (let v = body + 1; v < h; v++) for (let u = 0; u < w; u++) if (shade(d, index(page, f, u, v))) { lo = Math.min(lo, v); hi = Math.max(hi, v + 1) }
  return { feet: y + body + 1, ...(lo !== Infinity && { shadow: y + Math.round((lo + hi) / 2) }) }
}

// Whether a clip is drawn in shadow ink alone: a sheet's own shadow.
export function shadowClip(sheet: Sheet, pages: Pixels[], clip: string): boolean {
  let any = false
  for (const id of sheet.clips[clip].runs.flat()) {
    const f = sheet.frames[id], { w, h } = kept(f)
    const page = pages[f.page]
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
      const i = index(page, f, u, v)
      if (!inked(page.data, i)) continue
      if (!shade(page.data, i)) return false
      any = true
    }
  }
  return any
}

export type Stand = { on: 'feet' | 'shadow' | 'air' } | { on: 'off'; by: number; shadow: number }

// How one run of frames stands on the line its anchors draw, read two ways: by its feet, and by
// where each frame's ground is, the middle of its shadow where it has shadow under it and its
// feet where it has none.
export function stands(sheet: Sheet, pages: Pixels[], run: string[], air: boolean): Stand {
  if (air) return { on: 'air' }
  let byFeet = -Infinity, byGround = -Infinity
  for (const id of run) {
    const f = sheet.frames[id], g = feet(pages[f.page], f)
    if (!g) continue
    byFeet = Math.max(byFeet, g.feet - f.anchor[1])
    byGround = Math.max(byGround, (g.shadow ?? g.feet) - f.anchor[1])
  }
  if (byFeet === -Infinity || Math.abs(byFeet) <= 1e-6) return { on: 'feet' }
  if (Math.abs(byGround) <= 1e-6) return { on: 'shadow' }
  return { on: 'off', by: byFeet, shadow: byGround }
}

// Each neighbouring pair of a run, frame k − 1 and frame k; for a clip that loops, the last and the
// first too, as pair 0.
export type Pair = { from: number; to: number; slip: Slip }
export function pairs(sheet: Sheet, pages: Pixels[], clip: string, run: number): Pair[] {
  const c = sheet.clips[clip], ids = c.runs[run]
  const out: Pair[] = []
  const one = (i: number, j: number) => {
    const a = sheet.frames[ids[i]], b = sheet.frames[ids[j]]
    out.push({ from: i, to: j, slip: slip(pages[a.page], a, pages[b.page], b) })
  }
  if (c.loop && ids.length > 2) one(ids.length - 1, 0)
  for (let k = 1; k < ids.length; k++) one(k - 1, k)
  return out
}

// A run's pairs, measured once for each set of pages' pixels and each way the run's frames lie on
// them: a frame's page, box, turn, trim and whole-pixel anchor, and whether the clip loops. An edit to
// one frame measures only the runs it is in again, and the pages of another game, read anew, are
// measured anew.
const sigOf = (f: Frame) => `${f.page}|${f.box.join(',')}|${f.rotated ? 'r' : ''}|${f.trim.join(',')}|${Math.round(f.anchor[0])},${Math.round(f.anchor[1])}`
const runs = new WeakMap<Pixels[], Map<string, Pair[]>>()
export function pairsOf(sheet: Sheet, pages: Pixels[], clip: string, run: number): Pair[] {
  let kept = runs.get(pages)
  if (!kept) runs.set(pages, (kept = new Map()))
  const c = sheet.clips[clip]
  const key = `${c.loop ? 'loop' : 'once'}#${c.runs[run].map(id => sigOf(sheet.frames[id])).join('#')}`
  const had = kept.get(key)
  if (had) return had
  const made = pairs(sheet, pages, clip, run)
  kept.set(key, made)
  return made
}
export const flagged = (p: Pair) => apart(p.slip) || unrelated(p.slip)

// A slice's keys on a clip: for each run the clip's frame it is keyed on, or undefined.
export function keyed(sheet: Sheet, slice: string, clip: string): (number | undefined)[] {
  return sheet.clips[clip].runs.map(run => {
    const key = sheet.slices[slice]?.find(k => run.includes(sheet.order[k.frame]))
    return key && run.indexOf(sheet.order[key.frame])
  })
}

// A flagged pair in words.
export const said = (p: Pair) => (apart(p.slip)
  ? `frame ${p.to} is one drawing with frame ${p.from} but ${p.slip.dx},${p.slip.dy} off it`
  : `frames ${p.from} and ${p.to} look unrelated (miss ${p.slip.miss.toFixed(2)})`)

// The colour a slice made in the editor is given, as the export gives the muzzle.
export const SLICE_COLOR = '#ff0000ff'
type Rect = { x: number; y: number; w: number; h: number }
// The slices of an Aseprite sheet's file, as it writes them.
type SliceFile = { meta?: { slices?: { name: string; color?: unknown; keys: { frame: number; bounds: Rect }[] }[] } }

// The one value that keys slice `name` of run `run` of `clip` on frame `id` at the pixel [u, v] of the
// frame's whole picture, from its top left: the key's `bounds` when the run's key is on that frame,
// the key `{ frame, bounds }` when it is on another, a key inserted in frame order when the run has
// none, and a slice `{ name, color, keys }` inserted when the file has none by that name.
export function sliceEdit(file: SliceFile, sheet: Sheet, name: string, clip: string, run: number, id: string, [u, v]: [number, number]): { at: At; value: unknown; insert: boolean } {
  const frame = sheet.order.indexOf(id)
  const key = { frame, bounds: { x: u, y: v, w: 1, h: 1 } }
  const slices = file.meta?.slices
  if (!slices) return { at: ['meta', 'slices'], value: [{ name, color: SLICE_COLOR, keys: [key] }], insert: false }
  const si = slices.findIndex(s => s.name === name)
  if (si < 0) return { at: ['meta', 'slices', -1], value: { name, color: SLICE_COLOR, keys: [key] }, insert: true }
  const keys = slices[si].keys
  const ids = sheet.clips[clip].runs[run]
  const ki = keys.findIndex(k => ids.includes(sheet.order[k.frame]))
  if (ki >= 0 && keys[ki].frame === frame) return { at: ['meta', 'slices', si, 'keys', ki, 'bounds'], value: key.bounds, insert: false }
  if (ki >= 0) return { at: ['meta', 'slices', si, 'keys', ki], value: key, insert: false }
  const later = keys.findIndex(k => k.frame > frame)
  return { at: ['meta', 'slices', si, 'keys', later < 0 ? -1 : later], value: key, insert: true }
}

// The slices of a sheet in the order a picker lists them: `muzzle` first, then as the file has them.
export const sliceNames = (sheet: Sheet) => Object.keys(sheet.slices).sort((a, b) => Number(b === 'muzzle') - Number(a === 'muzzle'))

// A slice's colour as the file gives it, `#rrggbb` or `#rrggbbaa`, as CSS takes it.
export const sliceColor = (file: SliceFile, name: string): string => {
  const c = file.meta?.slices?.find(s => s.name === name)?.color
  return typeof c === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c) ? c.slice(0, 7) : SLICE_COLOR.slice(0, 7)
}

export type Problem = { clip: string; run?: number; what: string; kind: 'line' | 'apart' | 'unrelated' | 'slice' }
// How a sheet's things stand: on the lines their anchors draw, in the air over a shadow clip of the
// sheet's own, or on nothing, as a sheet of sparks and flashes is drawn about its middles; a sheet
// none of whose runs stands on its line is taken to be one of those.
export type ReadBack = { stands: 'lines' | 'air' | 'nothing'; shadows: string[]; problems: Problem[] }

// The read-back of a whole sheet; `pages` are its pages' pixels, in its order, and `travel` the
// clips whose frames are drawn moving across the ground, as a body falling is, whose neighbours are
// not compared. A sheet with no problems is right.
export function check(sheet: Sheet, pages: Pixels[], travel: string[] = []): ReadBack {
  const problems: Problem[] = []
  const shadows = Object.keys(sheet.clips).filter(c => shadowClip(sheet, pages, c))
  const air = shadows.length > 0
  const measured = Object.entries(sheet.clips).filter(([clip]) => !shadows.includes(clip))
  const lines = measured.map(([, c]) => c.runs.map(run => stands(sheet, pages, run, air)))
  const standing = air || lines.some(runs => runs.some(s => s.on !== 'off'))
  measured.forEach(([clip, c], i) => {
    c.runs.forEach((_, k) => {
      const s = lines[i][k]
      if (standing && s.on === 'off')
        problems.push({ clip, run: k, kind: 'line', what: `lowest feet ${fmt(Math.abs(s.by))} px ${s.by > 0 ? 'below' : 'above'} the line${s.shadow !== s.by ? `, its ground ${fmt(s.shadow)} px off it` : ''}` })
      if (travel.includes(clip)) return
      for (const p of pairs(sheet, pages, clip, k)) {
        if (apart(p.slip) || unrelated(p.slip)) problems.push({ clip, run: k, kind: apart(p.slip) ? 'apart' : 'unrelated', what: said(p) })
      }
    })
  })
  for (const slice of Object.keys(sheet.slices))
    for (const clip of Object.keys(sheet.clips)) {
      const on = keyed(sheet, slice, clip)
      if (on.every(k => k === undefined)) continue
      const missing = on.flatMap((k, run) => (k === undefined ? [run] : []))
      if (missing.length) problems.push({ clip, kind: 'slice', what: `slice ${slice} has no key on run${missing.length > 1 ? 's' : ''} ${missing.join(', ')}` })
      const frames = [...new Set(on.filter(k => k !== undefined))]
      if (frames.length > 1) problems.push({ clip, kind: 'slice', what: `slice ${slice} is keyed on frames ${frames.join(', ')} of its runs, not one` })
    }
  return { stands: air ? 'air' : standing ? 'lines' : 'nothing', shadows, problems }
}

const fmt = (v: number) => String(+v.toFixed(2))

// ---------------------------------------------------------------- the extension

export function loader(ed: Editor) {
  ed.panel({ id: 'loader', title: 'Assets', area: 'center', component: Assets })
  ed.panel({ id: 'loader.sheets', title: 'Sheets', area: 'center', component: Sheets })
  ed.panel({ id: 'loader.sprites', title: 'Sprites', area: 'center', component: Sprites })
  ed.inspector({
    id: 'loader.clip',
    title: 'Clip',
    when: sel => {
      if (!sel || !('id' in sel)) return false
      const row = ed.session?.row(sel.scene, sel.id)
      if (!row) return false
      const { sheet, clip } = plays(ed, sel.scene, row)
      return typeof sheet === 'string' && typeof clip === 'string'
    },
    component: PlaysClip,
  })
  ed.field('loader.sheet', SheetName)
  ed.field('loader.palette', PaletteName)
  ed.field('loader.type', AssetType)
  ed.bind('loader', { 'assets.*.type': 'loader.type' })
  assetCommands(ed)
  sheetCommands(ed)
  sprites(ed)
  landing(ed)
}

// What the game view's own loader has landed, preloaded or asked for, told as the loader's topic
// (`x.loader`), so whatever is drawn from what the game loaded, through its loader or its wire, is
// drawn again as a file lands there: counted after each frame of the editor's clock, on whichever game
// is open and whichever client the view draws with.
function landing(ed: Editor) {
  let landed = -1
  let following: { s: Session; off: () => void } | undefined
  const follow = () => {
    const s = ed.session
    if (following?.s === s) return
    following?.off()
    following = s && {
      s,
      off: s.onFrame(() => {
        const n = s.client?.plugins.loader ? loaderOf(s.client).progress().done : -1
        if (n === landed) return
        landed = n
        ed.changed('x.loader')
      }),
    }
  }
  follow()
  ed.onDrop(ed.subscribe(follow, ['game']))
  ed.onDrop(() => following?.off())
}

// What a row plays, as the plugin that draws it reads it: a row of a kind sprite2d or sprite3d draws,
// its sheet, clip and facing from its kind's entry of `world.sprite2d` or `world.sprite3d` where that
// gives them, else off the row (each plugin's `look`), with `sprite2d` its kind's entry when sprite2d
// draws it; any other row, its own fields. A kind both draw throws.
export function plays(ed: Editor, scene: string, row: Row): { sheet: unknown; clip: unknown; facing: unknown; sprite2d?: Spec2d } {
  const world = ed.session!.scene(scene).world
  const flat = (world.sprite2d as Sprites2d | undefined)?.kinds[row.kind]
  const deep = (world.sprite3d as Sprites3d | undefined)?.kinds[row.kind]
  if (flat && deep) throw new Error(`${row.kind} is a kind of both world.sprite2d and world.sprite3d`)
  if (flat) return { ...look2d(flat, row), sprite2d: flat }
  if (deep) return look3d(deep, row)
  return { sheet: row.data.sheet, clip: row.data.clip, facing: row.data.facing }
}

// A catalogue entry, as a scene's `world.loader.assets` writes it.
export type Asset = Entry

// The file a url names, by its path from the repo.
export const pathOf = (url: string) => url.replace(/^\/+/, '')

// The scenes of the open game that have a loader row.
export const loaderScenes = (ed: Editor): string[] => ed.scenesWith('loader')

// A scene's catalogue: the file that gives its `world.loader`, the scene's own or else the game's,
// and the entries of the running truth's `world.loader.assets`.
export function catalogueOf(ed: Editor, scene: string): { file: string; assets: Record<string, Asset> } | undefined {
  if (!loaderScenes(ed).includes(scene)) return undefined
  return { file: ed.worldFile(scene, 'loader'), assets: ed.sceneOf(scene).world.loader.assets as Record<string, Asset> }
}

// The entries of a catalogue of one type, by name; and of a scene's catalogue.
export const entryNames = (assets: Record<string, Asset>, type: string): string[] => Object.keys(assets).filter(n => assets[n].type === type)
export const entriesOf = (ed: Editor, scene: string | undefined, type: string): string[] => entryNames((scene && catalogueOf(ed, scene)?.assets) || {}, type)
// The sheet entries of a scene's catalogue, by name.
export const sheetsOf = (ed: Editor, scene: string | undefined): string[] => entriesOf(ed, scene, 'sheet')

// What of an entry says how a sheet is drawn, as another sheet beside it would be drawn: its
// `nearest` and `facing`, where it gives them. Its `palette` is its own art's, and stays with it.
export const drawing = (a: Asset): Partial<Entry> => ({ ...(a.nearest !== undefined && { nearest: a.nearest }), ...(a.facing !== undefined && { facing: a.facing }) })

// The clips of the sheet entry `a`, read as the loader reads it, from its file and every other pack
// of it as the editor holds them, each read through the editor the first time it is asked for:
// undefined until every one has been read, and when they do not read as a sheet. Kept for the
// texts it was read from, so a file written reads it again, and for the game open, the session: a
// game opened, or opened again, reads them anew.
type Reads = {
  clips: Map<string, { paths: string[]; texts: string[]; clips: string[] | undefined }>
  asking: Set<string>
  packs: Map<string, { text: string; paths: string[] }>
}
const readsBy = new WeakMap<object, Reads>()
const readsOf = (ed: Editor): Reads => {
  const by = ed.session ?? ed
  let reads = readsBy.get(by)
  if (!reads) readsBy.set(by, (reads = { clips: new Map(), asking: new Set(), packs: new Map() }))
  return reads
}
export function clipsIn(ed: Editor, a: Entry): string[] | undefined {
  const { clips: known, asking } = readsOf(ed)
  const key = JSON.stringify(a)
  const had = known.get(key)
  if (had && had.paths.every((p, i) => ed.texts.get(p) === had.texts[i])) return had.clips
  const paths: string[] = [], texts: string[] = []
  let missing = false
  const file = (url: string) => {
    const path = pathOf(url), text = ed.texts.get(path)
    if (text === undefined) {
      missing = true
      if (!asking.has(path)) {
        asking.add(path)
        void ed.text(path).catch(e => ed.error(`${path}: ${(e as Error).message}`)).finally(() => asking.delete(path))
      }
      throw new Error(`${path} has not been read`)
    }
    paths.push(path)
    texts.push(text)
    return JSON.parse(text)
  }
  let clips: string[] | undefined
  try {
    clips = Object.keys(read(file(a.url), a.url, a, file).clips)
  } catch {
    clips = undefined
  }
  if (!missing) known.set(key, { paths, texts, clips })
  return clips
}

// The files the clips of the sheet entry `a` are read from (`clipsIn`), by their paths from the repo:
// its file, and once the editor holds that, every other pack it names (`packsNamed`), worked out
// again only when its text is another. The paths a panel showing the clips is drawn again for.
export function clipsFiles(ed: Editor, a: Entry): string[] {
  const path = pathOf(a.url), text = ed.texts.get(path)
  if (text === undefined) return [path]
  const { packs } = readsOf(ed)
  let had = packs.get(a.url)
  if (had?.text !== text) {
    let first: Json
    try {
      first = JSON.parse(text)
    } catch {
      first = undefined
    }
    packs.set(a.url, (had = { text, paths: [path, ...packsNamed(a, first).map(pathOf)] }))
  }
  return had.paths
}

// The clips of the sheet entry `a` as `clipsIn` reads them, once every file of it has been read
// through the editor: for a command, which waits for them where a panel shows them once they come.
// Undefined when they do not read as a sheet.
export async function clipsReady(ed: Editor, a: Entry): Promise<string[] | undefined> {
  try {
    const file = JSON.parse(await ed.text(pathOf(a.url)))
    await withFiles(ed, more => read(file, a.url, a, more))
  } catch {
    // Files that do not read are no sheet's, and `clipsIn` answers none for them.
  }
  return clipsIn(ed, a)
}

// The json entries of a catalogue but the file at `but`, by their paths from the repo: the data
// files a name of that one may be named in.
export const jsonsOf = (assets: Record<string, Entry>, but: string): string[] =>
  Object.values(assets).filter(a => a.type === 'json' && pathOf(a.url) !== but).map(a => pathOf(a.url))

// The files at `paths`, each read through the editor and parsed; one that is not JSON is left out.
export async function jsonsRead(ed: Editor, paths: string[]): Promise<{ path: string; value: unknown }[]> {
  return (await Promise.all(paths.map(async path => {
    try {
      return [{ path, value: JSON.parse(await ed.text(path)) as unknown }]
    } catch {
      return []
    }
  }))).flat()
}

// A place a name is written: the file, by its path from the repo, and the value's path in it.
export type Naming = { file: string; at: At }

// Every string value equal to one of `names` in the parsed files `files`, each with its path from its
// file's top, by name: each file walked once however many names there are, and a path made only for
// a value that is one of them.
export function namedInAll(files: { path: string; value: unknown }[], names: Iterable<string>): Map<string, Naming[]> {
  const want = new Set(names)
  const out = new Map<string, Naming[]>([...want].map(n => [n, []]))
  const at: At = []
  const walk = (file: string, v: unknown) => {
    if (typeof v === 'string') {
      if (want.has(v)) out.get(v)!.push({ file, at: [...at] })
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => {
        at.push(i)
        walk(file, x)
        at.pop()
      })
    } else if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        at.push(k)
        walk(file, x)
        at.pop()
      }
    }
  }
  for (const f of files) walk(f.path, f.value)
  return out
}

// Every string value equal to `name` in the parsed files `files`, each with its path from its file's
// top.
export const namedIn = (files: { path: string; value: unknown }[], name: string): Naming[] => namedInAll(files, [name]).get(name)!

// Why `name`, `what` ("an effect", say) that `users` name, is not taken out: each of them would
// name one there is none of. Undefined when none names it, or the caller says to take it out
// `anyway`.
export function stillNamed(what: string, name: string, users: Naming[], anyway: boolean): string | undefined {
  if (!users.length || anyway) return undefined
  return `${name} is named in ${users.length} ${users.length === 1 ? 'place' : 'places'}, each of which would name ${what} there is none of: ${users.map(u => `${u.file} ${u.at.join('.')}`).join(', ')}; anyway takes it out all the same`
}

// What a survey of a file's entry says for a command, which waits on no sheet: `survey` handed the
// clips of each sheet of `assets`, once every sheet it waits on has been read (`clipsReady`), and a
// sheet that still has no clips a problem, since it does not read as a sheet.
export async function surveyedReady<S extends { waiting: string[]; problems: string[] }>(ed: Editor, assets: Record<string, Entry>, survey: (clipsOf: (sheet: string) => string[] | undefined) => S): Promise<S> {
  const clipsOf = (sheet: string) => clipsIn(ed, assets[sheet])
  await Promise.all(survey(clipsOf).waiting.map(s => clipsReady(ed, assets[s])))
  const sv = survey(clipsOf)
  return { ...sv, waiting: [], problems: [...sv.problems, ...sv.waiting.map(s => `${s} does not read as a sheet`)] }
}

// The value at `at` inside `v`, or undefined.
export const valueAt = (v: unknown, at: At): unknown => at.reduce<unknown>((o, k) => (o !== null && typeof o === 'object' ? (o as Record<string | number, unknown>)[k] : undefined), v)

// ---------------------------------------------------------------- a file of named lists

// One value written into a file, as the editor writes it (`FileEdit`); a change is written as one by
// the editor's `written`.
export type Edit = FileEdit & { file: string }

// The edits `make` makes, written through `ed` as one change, as a panel's button writes them: when
// `make` throws, written nowhere and `refuse`d with why; else `clear` is called first, and the write
// handed back.
export function putEdits(ed: Editor, make: () => Edit[], refuse: (why: string) => void, clear: () => void): Promise<void> | undefined {
  let edits: Edit[]
  try {
    edits = make()
  } catch (e) {
    refuse((e as Error).message)
    return undefined
  }
  clear()
  return written(ed, edits).catch(() => {})
}

// A json entry of a catalogue a plugin reads named lists of layers from, under `key`, a layer naming
// another list by its `ref` field: particle2d's effects file (an effect, its layers of emitters) and
// volley2d's patterns file (a pattern, of bullets). `noun` is what a list is, and `a` that with its
// article, as what is said of one says it.
export type Listing = { key: string; ref: string; noun: string; a: string }

// A scene whose file it is, as a command finds it: the scene, the file by its path from the repo, and
// the scene's catalogue, where a list may be named.
export type Holder = { scene: string; path: string; assets: Record<string, Entry> }

// What a command on the lists is handed by the plugin: the scenes whose file it is, what those do, as
// a scene that is not one is refused (`draws particle2d effects`), and what a list that would not
// run is said to be (`would not be emitted`); what it says of a list (`surveyed`, its `problems` why
// it would not run), and how it shows one; and, for a list of the file's lists, what more it says of
// each than its layers, where it is named and its problems (`more`), and of the file (`own`).
export type Lister<F, W extends Holder, S extends { problems: string[] }> = {
  ed: Editor
  scenes(): W[]
  does: string
  fails: string
  surveyed(w: W, file: F, name: string): Promise<S>
  shown(w: W, file: F, name: string): Promise<object>
  more?(sv: S): Record<string, unknown>
  own?(file: F): Record<string, unknown>
}

// How a file of named lists `c` says is read, written and answered for, by its panel and its
// commands alike, a file being `F` and a layer `L`.
export function namedLists<F extends object, L extends object>(c: Listing) {
  const { key, ref, noun, a } = c
  const listsOf = (file: F) => (file as Record<string, unknown>)[key] as Record<string, L[]>

  // The file's text as the panel and the commands read it, or why it holds no lists.
  function read(text: string): { file: F } | { error: string } {
    try {
      const file = JSON.parse(text)
      if (file === null || typeof file !== 'object' || typeof file[key] !== 'object' || file[key] === null) return { error: `it holds no ${key}` }
      return { file }
    } catch (e) {
      return { error: `it is not JSON: ${(e as Error).message}` }
    }
  }

  // The layers of list `name` of the file at `path`, refused, naming its lists, when it has none of
  // that name.
  function entry(file: F, path: string, name: string): L[] {
    if (!Object.hasOwn(listsOf(file), name)) throw new Error(`${path} has no ${noun} ${name}: its ${key} are ${Object.keys(listsOf(file)).join(', ')}`)
    return listsOf(file)[name]
  }

  // The list a layer names, or undefined for one that names none.
  const named = (l: L): string | undefined => (ref in l ? (l as Record<string, string>)[ref] : undefined)

  // Every place that names the list `name`: the layers of its own file that name it, and every string
  // value equal to it in the other files, each a parsed json entry of the catalogue (`namedIn`). For a
  // list the file has, it is read off where every list of the file is named (`namingsOf`).
  function namings(file: F, path: string, name: string, others: { path: string; value: unknown }[]): Naming[] {
    if (Object.hasOwn(listsOf(file), name)) return namingsOf(file, path, others).get(name)!
    return [...ownNamings(file, path, [name]).get(name)!, ...namedIn(others.filter(o => o.path !== path), name)]
  }
  // The layers of the file that name each of `names`, by name.
  function ownNamings(file: F, path: string, names: string[]): Map<string, Naming[]> {
    const out = new Map<string, Naming[]>(names.map(n => [n, []]))
    for (const [n, layers] of Object.entries(listsOf(file))) layers.forEach((l, i) => { const r = named(l); if (r !== undefined) out.get(r)?.push({ file: path, at: [key, n, i, ref] }) })
    return out
  }
  // Where every list of the file is named, by name, each file walked once for all of them
  // (`namedInAll`); kept for the file, and worked out again once it, its path or one of the other
  // files is another, so a panel drawn again for nothing new walks nothing.
  const counted = new WeakMap<F, { path: string; others: { path: string; value: unknown }[]; got: Map<string, Naming[]> }>()
  function namingsOf(file: F, path: string, others: { path: string; value: unknown }[]): Map<string, Naming[]> {
    const rest = others.filter(o => o.path !== path)
    const had = counted.get(file)
    if (had && had.path === path && had.others.length === rest.length && had.others.every((o, i) => o.path === rest[i].path && o.value === rest[i].value)) return had.got
    const names = Object.keys(listsOf(file))
    const own = ownNamings(file, path, names)
    const elsewhere = namedInAll(rest, names)
    const got = new Map(names.map(n => [n, [...own.get(n)!, ...elsewhere.get(n)!]]))
    counted.set(file, { path, others: rest, got })
    return got
  }

  // The edits that rename list `from` to `to`: every layer naming it made to name `to`, its layers set
  // under `to`, and `from` removed.
  function renaming(file: F, path: string, from: string, to: string): Edit[] {
    const refs = namings(file, path, from, []).filter(n => n.at[1] !== from)
    const layers = listsOf(file)[from].map(l => (named(l) === from ? { ...l, [ref]: to } : l))
    return [
      ...refs.map(n => ({ file: path, at: n.at, value: to })),
      { file: path, at: [key, to], value: layers },
      { file: path, at: [key, from], value: undefined },
    ]
  }

  // The edits that set the layers of list `name` of the file at `path` as the panel's list writes
  // them, whether it adds, drops or moves a layer or a layer's field is set, added or taken out (the
  // editor's `listEdits`); or, when the file has no list of that name, add it with them at the end of
  // its lists; or with null take it out, refused, naming the lists, when there is none of it.
  function edits(file: F, path: string, name: string, layers: L[] | null): Edit[] {
    if (layers === null) {
      entry(file, path, name)
      return [{ file: path, at: [key, name], value: undefined }]
    }
    if (!Object.hasOwn(listsOf(file), name)) return [{ file: path, at: [key, name], value: layers }]
    return listEdits([key, name], listsOf(file)[name], layers).map(e => ({ file: path, ...e }))
  }

  // The edits that rename list `from` to `to` (`renaming`), none when that is its name already:
  // refused when there is no list `from`, when `to` is empty, and when another list has it.
  function renamed(file: F, path: string, from: string, to: string): Edit[] {
    entry(file, path, from)
    if (to === from) return []
    if (!to) throw new Error(`${a} needs a name`)
    if (Object.hasOwn(listsOf(file), to)) throw new Error(`there is ${a} ${to} already`)
    return renaming(file, path, from, to)
  }

  // The shape a layer is held to, made by `make` once for each `id`, since a survey holds every layer
  // to it each time its panel is drawn.
  const shapes = new Map<string, z.ZodType>()
  function shape<T extends z.ZodType>(id: string, make: () => T): T {
    let got = shapes.get(id) as T | undefined
    if (!got) shapes.set(id, (got = make()))
    return got
  }

  // The other json entries of `w`'s catalogue, each read and parsed, where a list may be named.
  const others = (ed: Editor, w: Holder) => jsonsRead(ed, jsonsOf(w.assets, w.path))

  // The file of `scene` for a command, as it is now: refused, naming the scenes whose file it is, when
  // it is none of them, and saying why when its file holds no lists.
  async function fileOf<W extends Holder>(on: Pick<Lister<F, W, never>, 'ed' | 'scenes' | 'does'>, scene: string): Promise<{ w: W; file: F }> {
    const s = on.ed.need()
    const all = on.scenes()
    const w = all.find(w => w.scene === scene)
    if (!w) throw new Error(`no scene ${scene} of ${s.game.name} ${on.does}: ${all.length ? `${all.map(w => w.scene).join(', ')} do` : 'none does'}`)
    const got = read(await on.ed.text(w.path))
    if ('error' in got) throw new Error(`${w.path}: ${got.error}`)
    return { w, file: got.file }
  }

  // The listing command's answer: with no scene, every scene whose file it is, with its file; a
  // scene's lists, each with how many layers it has, how many places name it and why it would not
  // run, in outline when long; or one list, as `shown` shows it.
  async function listed<W extends Holder, S extends { problems: string[] }>(on: Lister<F, W, S>, scene: string | undefined, name: string | undefined) {
    if (scene === undefined) {
      if (name !== undefined) throw new Error(`${a} is one scene's: name the scene too, one of ${on.scenes().map(w => w.scene).join(', ')}`)
      on.ed.need()
      return on.scenes().map(w => ({ scene: w.scene, file: w.path }))
    }
    const { w, file } = await fileOf(on, scene)
    if (name !== undefined) return on.shown(w, file, name)
    const read = await others(on.ed, w)
    const list = []
    for (const n of Object.keys(listsOf(file))) {
      const sv = await on.surveyed(w, file, n)
      list.push({ name: n, layers: listsOf(file)[n].length, ...on.more?.(sv), named: namings(file, w.path, n, read).length, ...(sv.problems.length ? { problems: sv.problems } : {}) })
    }
    return { scene, file: w.path, ...on.own?.(file), [key]: outlined(list) }
  }

  // The setting command's answer: list `asked` of `scene`'s file set to `layers`, added with them when
  // the file has none of its name, or with null taken out, which is refused while a layer or a data
  // file names it unless `anyway`; refused where the layers would make it not run for a reason it did
  // not have. One undo, as the change `e` makes.
  async function set<W extends Holder, S extends { problems: string[] }>(on: Lister<F, W, S>, e: Edits, scene: string, asked: string, layers: L[] | null, anyway: boolean) {
    const { w, file } = await fileOf(on, scene)
    // A list the file has is named as it is; a new one as the panel's Add names it, trimmed.
    const name = Object.hasOwn(listsOf(file), asked) ? asked : asked.trim()
    if (!name) throw new Error(`${a} needs a name`)
    if (layers === null) {
      entry(file, w.path, name)
      const users = namings(file, w.path, name, await others(on.ed, w))
      const why = stillNamed(a, name, users, anyway)
      if (why) throw new Error(why)
      await written(e, edits(file, w.path, name, null))
      return { file: w.path, removed: name, named: users, [key]: Object.keys(listsOf(file)).filter(n => n !== name) }
    }
    const was = (await on.surveyed(w, file, name)).problems
    const fresh = (await on.surveyed(w, { ...file, [key]: { ...listsOf(file), [name]: layers } }, name)).problems.filter(p => !was.includes(p))
    if (fresh.length) throw new Error(`${name} ${on.fails}: ${[...new Set(fresh)].join('; ')}`)
    await written(e, edits(file, w.path, name, layers))
    return on.shown(w, (await fileOf(on, scene)).file, name)
  }

  // The renaming command's answer: list `from` of `scene`'s file renamed `to`, trimmed, with every
  // layer that names it (`renamed`), one undo, as the change `e` makes; shown, with where else its
  // old name is still named.
  async function rename<W extends Holder, S extends { problems: string[] }>(on: Lister<F, W, S>, e: Edits, scene: string, from: string, to: string) {
    const { w, file } = await fileOf(on, scene)
    const name = to.trim()
    await written(e, renamed(file, w.path, from, name))
    const now = (await fileOf(on, scene)).file
    return { ...(await on.shown(w, now, name)), still: namings(now, w.path, from, await others(on.ed, w)) }
  }

  return { read, entry, named, namings, namingsOf, renaming, edits, renamed, shape, others, fileOf, listed, set, rename }
}

// A sheet or a map read as the loader reads it, handed every other file it names, each fetched
// through the editor as the read asks for it: a multipack's other packs, a map's tilesets.
export async function withFiles<T>(ed: Editor, decode: (more: (url: string) => unknown) => T): Promise<T> {
  const got = new Map<string, unknown>()
  for (;;) {
    let wanted: string | undefined
    try {
      return decode(url => {
        if (got.has(url)) return got.get(url)
        wanted = url
        throw new Error(`${url} has not been read`)
      })
    } catch (e) {
      if (wanted === undefined || got.has(wanted)) throw e
      const path = pathOf(wanted)
      let text: string
      try {
        text = await ed.text(path)
      } catch (err) {
        throw new Error(`${path} does not read: ${(err as Error).message}`)
      }
      try {
        got.set(wanted, JSON.parse(text))
      } catch (err) {
        throw new Error(`${path} is not JSON: ${(err as Error).message}`)
      }
    }
  }
}

// ---------------------------------------------------------------- whether an entry loads

// How an entry was tried, and what came of it: `what` is the loader's message when it failed.
export type Tried = { by: 'game' | 'files'; ok: boolean; what: string }

// What the extension keeps for the game open, the session: how many times the panel was told to check
// again; each sheet's read-back with no clip travelling, by its url, of the text and generation it was
// read at; what the game made of each entry it was asked for again, by the view's client it was
// asked through; the clips that travel, as this browser keeps them (`travelIn`); and the Sprites
// panel's: its strokes not saved yet, by each sheet's url, its colour and the colours set, the latest
// first, the scene and sheet it shows and the frame it shows of each sheet, by its url, and how many
// times any of these has changed. A game opened, or opened again, is a new session and starts with
// none, so nothing kept for one game outlives it. A url's generation is how many times its files are
// to be read anew: once for each time the panel checks again, and once for each time a route wrote
// the file (`Editor.writes`), a copy or its undo. An image is read with its generation in its query
// when it is not 0.0, since the browser keeps one it has already read.
type Kept = {
  again: number
  backs: Map<string, { text: string; generation: string; back: Promise<ReadBack> }>
  games: WeakMap<object, Map<string, Game>>
  travel?: string[]
  strokes: Map<string, Paints[]>
  colour: number
  recent: number[]
  shown: { scene?: string; sheet?: string; frames: Map<string, string> }
  version: number
}
const keptBy = new WeakMap<object, Kept>()
const keptOf = (ed: Editor): Kept => {
  const by = ed.session ?? ed
  let k = keptBy.get(by)
  if (!k) keptBy.set(by, (k = { again: 0, backs: new Map(), games: new WeakMap(), strokes: new Map(), colour: 0x000000ff, recent: [], shown: { frames: new Map() }, version: 0 }))
  return k
}
export const generation = (ed: Editor, url: string) => `${keptOf(ed).again}.${ed.writes(pathOf(url))}`
export const readAgain = (ed: Editor) => {
  keptOf(ed).again++
  ed.changed('x.loader')
}

// What the game made of an entry it was asked for again: `trying` until its loader answers.
export type Game = Tried | 'trying'
const LOADED: Tried = { by: 'game', ok: true, what: 'loaded by the game' }
// The game's loader, as the view's client has it: whether an entry has loaded, how many have, and an
// entry loaded again.
type GameLoader = { ready(name: string): boolean; retry(name: string): Promise<unknown>; progress(): { done: number } }
export const loaderOf = (client: Client) => client.plugins.loader as GameLoader

// What the game has made of entry `name` through the loader of `client`, the view's client of its
// scene: what it came to when it was asked for it again, else loaded once it has loaded, else
// undefined.
export const gameTried = (ed: Editor, client: Client, name: string): Game | undefined =>
  keptOf(ed).games.get(client)?.get(name) ?? (loaderOf(client).ready(name) ? LOADED : undefined)
// Those of `names` the game has not loaded and is not trying: what Try every entry asks it for.
export const untried = (ed: Editor, client: Client, names: string[]) =>
  names.filter(n => !loaderOf(client).ready(n) && keptOf(ed).games.get(client)?.get(n) !== 'trying')
// Asks the game's loader, through `client`, for each of `names` again, as Try every entry does: each
// is `trying` until the loader answers, then what it came to, the loader's own message when it fails.
// A sound is decoded, never played.
export async function tryInGame(ed: Editor, client: Client, names: string[]): Promise<Map<string, Tried>> {
  const k = keptOf(ed)
  const got = k.games.get(client) ?? new Map<string, Game>()
  k.games.set(client, got)
  for (const n of names) got.set(n, 'trying')
  ed.changed('x.loader')
  const out = await Promise.all(names.map(n => loaderOf(client).retry(n).then(
    () => LOADED,
    (e: Error): Tried => ({ by: 'game', ok: false, what: e.message }),
  ).then(t => {
    got.set(n, t)
    ed.changed('x.loader')
    return [n, t] as const
  })))
  return new Map(out)
}

// The url a panel reads a picture of the repo at: its own, with its generation in the query once it
// is not 0.0, since the browser keeps a picture it has already read.
export const readAt = (ed: Editor, url: string) => {
  const n = generation(ed, url)
  return n === '0.0' ? url : `${url}?read=${n}`
}

// The image at a url, loaded and decoded, or the reason it is not one.
export async function imageAt(ed: Editor, url: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = encodeURI(readAt(ed, url))
  try {
    await img.decode()
    if (img.naturalWidth > 0) return img
  } catch {
    // Said below, in the words every failure to load is said in.
  }
  throw new Error(`${url} does not load as an image`)
}

export const TYPES = ['json', 'texture', 'sheet', 'palette', 'pixels', 'binary', 'tilemap', 'bitmapfont', 'font', 'model', 'sound']

// What of an entry the loader reads, each as it reads it: `type` one of the types it knows, `url` the
// path of a file, `for` the ui alone, and `palette` a name, which `entryEdits` holds to the
// catalogue's palettes.
const ENTRY = {
  type: z.enum(TYPES as [string, ...string[]]),
  url: z.string().min(1),
  preload: z.boolean(),
  for: z.literal('ui'),
  nearest: z.boolean(),
  facing: z.strictObject({ first: z.number(), step: z.number(), mirror: z.boolean() }).partial(),
  palette: z.string(),
}

// The edits that make entry `name` of `scene`'s catalogue `entry`, or take it out for null, as the
// Assets panel writes a field of it or takes it out: each value that differs from what the file that
// gives the catalogue holds, written by itself (`changes`). Refused when a value it writes is not one
// the loader reads, or a palette the catalogue has not got, or it would leave the entry no type or no
// url, each naming what it may be; a value the file holds already is not the call's to refuse.
export function entryEdits(ed: Editor, scene: string, name: string, entry: Record<string, unknown> | null): (FileEdit & { file: string })[] {
  ed.sceneOf(scene, 'loader')
  const { file, value } = ed.worldOf(scene, 'loader')
  const assets = (value.assets ?? {}) as Record<string, Asset>
  const was = Object.hasOwn(assets, name) ? assets[name] as Record<string, unknown> : undefined
  const at = ['world', 'loader', 'assets', name]
  if (entry === null) {
    if (!was) throw new Error(`${scene}'s catalogue has no entry ${name}: its entries are ${Object.keys(assets).join(', ') || 'none'}`)
    return [{ file, at, value: undefined }]
  }
  if (!name) throw new Error('an entry has a name')
  const gone = ['type', 'url'].filter(k => entry[k] === undefined)
  if (gone.length) throw new Error(`entry ${name} has a type and a url: it would have no ${gone.join(' and no ')}`)
  // What the call writes: each key that differs from the file, and of a `facing` both have, each of
  // its own keys that differs.
  const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  const keys = Object.keys(entry).filter(k => !was || differs(entry[k], was[k]))
  const writes = (k: string) => {
    const now = entry[k], then = was?.[k]
    return k === 'facing' && object(now) && object(then) ? Object.fromEntries(Object.keys(now).filter(f => differs(now[f], then[f])).map(f => [f, now[f]])) : now
  }
  const got = strictFields('the loader', `entry ${name}`, ENTRY).safeParse(Object.fromEntries(keys.map(k => [k, writes(k)])))
  if (!got.success) throw new Error(`entry ${name}: ${z.prettifyError(got.error)}`)
  const palettes = entryNames(assets, 'palette')
  if (keys.includes('palette') && !palettes.includes(entry.palette as string))
    throw new Error(`${scene}'s catalogue has no palette ${entry.palette}: its palettes are ${palettes.join(', ') || 'none'}`)
  return changes(was, entry, at).map(c => ({ file, ...c }))
}

// An entry tried through its files, as far as the editor can tell without the game.
export async function tried(ed: Editor, name: string, a: Asset): Promise<Tried> {
  const fail = (what: string): Tried => ({ by: 'files', ok: false, what })
  const path = pathOf(a.url)
  const text = async () => {
    let t: string
    try {
      t = await ed.text(path)
    } catch (e) {
      throw new Error(`${path} does not read: ${(e as Error).message}`)
    }
    try {
      return JSON.parse(t)
    } catch (e) {
      throw new Error(`${path} is not JSON: ${(e as Error).message}`)
    }
  }
  try {
    if (!TYPES.includes(a.type)) return fail(`loader ${name}: no type ${a.type} is known`)
    if (a.type === 'json') {
      await text()
      return { by: 'files', ok: true, what: 'its file reads and parses' }
    }
    if (a.type === 'sheet') {
      const file = await text()
      const sheet = await withFiles(ed, more => read(file, a.url, a, more))
      await Promise.all(sheet.pages.map(u => imageAt(ed, u)))
      return { by: 'files', ok: true, what: `its file reads as a sheet, and its ${sheet.pages.length === 1 ? 'page loads' : `${sheet.pages.length} pages load`}` }
    }
    if (a.type === 'palette') {
      let t: string
      try {
        t = await ed.text(path)
      } catch (e) {
        throw new Error(`${path} does not read: ${(e as Error).message}`)
      }
      const colours = gpl(t, a.url)
      return { by: 'files', ok: true, what: `its file reads as a palette of ${colours.length} colour${colours.length === 1 ? '' : 's'}` }
    }
    if (a.type === 'pixels') {
      const res = await fetch(encodeURI(a.url))
      if (!res.ok) throw new Error(`${path} does not read: ${res.status}`)
      const p = decodePng(new Uint8Array(await res.arrayBuffer()))
      const words = Object.keys(p.text)
      return { by: 'files', ok: true, what: `its file reads as a picture of ${p.width} × ${p.height}${words.length ? `, its text ${words.join(', ')}` : ''}` }
    }
    if (a.type === 'binary') {
      const res = await fetch(encodeURI(a.url))
      if (!res.ok) throw new Error(`${path} does not read: ${res.status}`)
      const size = (await res.arrayBuffer()).byteLength
      return { by: 'files', ok: true, what: `its file reads, ${size} byte${size === 1 ? '' : 's'}` }
    }
    if (a.type === 'tilemap') {
      if (/\.tmx$/i.test(a.url)) return fail(`loader ${name}: ${a.url} is a .tmx: save as .tmj`)
      const file = await text()
      const map = await withFiles(ed, more => readMap(file, a.url, more))
      const images = [...new Set([...Object.values(map.tiles).map(t => t.page), ...map.layers.flatMap(l => (l.kind === 'image' ? [l.image] : []))])]
      await Promise.all(images.map(u => imageAt(ed, u)))
      return { by: 'files', ok: true, what: `its file reads as a map with ${map.tilesets.length} tileset${map.tilesets.length === 1 ? '' : 's'}, and its ${images.length === 1 ? 'image loads' : `${images.length} images load`}` }
    }
    if (a.type === 'texture') {
      await imageAt(ed, a.url)
      return { by: 'files', ok: true, what: 'its image loads' }
    }
    if (a.type === 'font') {
      const res = await fetch(encodeURI(a.url))
      if (!res.ok) throw new Error(`${path} does not read: ${res.status}`)
      // Loaded as a face of its own, never added to the page, so the editor's fonts stay its own.
      try {
        await new FontFace(name, await res.arrayBuffer()).load()
      } catch {
        throw new Error(`${path} does not load as a font`)
      }
      return { by: 'files', ok: true, what: 'its file loads as a font' }
    }
    if (a.type === 'model' && !/\.glb$/i.test(a.url)) return fail(`loader ${name}: a model is one .glb`)
    const folder = path.slice(0, path.lastIndexOf('/'))
    const listed = await ed.files.list(folder).catch(() => [] as string[])
    return listed.includes(path) ? { by: 'files', ok: true, what: 'its file is there' } : fail(`${path} is not there`)
  } catch (e) {
    return fail((e as Error).message)
  }
}

// ---------------------------------------------------------------- the read-back

// The read-back of the sheet at `url`, whose file holds `text`: every other pack of it read, its
// pages' pixels read as the files hold them, then measured with no clip travelling. Read once for
// each text and generation.
export function readBack(ed: Editor, url: string, text: string): Promise<ReadBack> {
  const { backs } = keptOf(ed)
  const had = backs.get(url)
  if (had && had.text === text && had.generation === generation(ed, url)) return had.back
  const back = (async () => {
    const file = JSON.parse(text)
    const sheet = await withFiles(ed, more => read(file, url, {}, more))
    const pages = await Promise.all(sheet.pages.map(p => pixelsAt(readAt(ed, p))))
    return check(sheet, pages)
  })()
  backs.set(url, { text, generation: generation(ed, url), back })
  back.catch(() => { if (backs.get(url)?.back === back) backs.delete(url) })
  return back
}

// A read-back taken with no clip travelling, as it is with `travel` travelling: a travelling clip's
// neighbours are not compared, and nothing else changes.
export const travelled = (rb: ReadBack, travel: string[]): ReadBack =>
  ({ ...rb, problems: rb.problems.filter(p => !((p.kind === 'apart' || p.kind === 'unrelated') && travel.includes(p.clip))) })

// Each slice of a sheet, and for each clip how many of its runs it is keyed on and the frames of
// those runs it is keyed on.
export type Keys = { slice: string; clips: { clip: string; on: number; runs: number; frames: number[] }[] }
export const slicesOf = (sheet: Sheet): Keys[] =>
  Object.keys(sheet.slices).map(slice => ({
    slice,
    clips: Object.keys(sheet.clips).map(clip => {
      const on = keyed(sheet, slice, clip)
      const at = on.filter(k => k !== undefined)
      return { clip, on: at.length, runs: on.length, frames: [...new Set(at)] }
    }),
  }))

// The clips a game's viewer has said travel, kept in this browser.
const travelKey = (game: string) => `loader.travel.${game}`
function travelOf(game: string): string[] {
  try {
    const got = JSON.parse(localStorage.getItem(travelKey(game)) ?? '[]')
    return Array.isArray(got) ? got.filter((c): c is string => typeof c === 'string') : []
  } catch {
    return []
  }
}
// The clips that travel in the open game, as this browser keeps them, read once a session.
export const travelIn = (ed: Editor): string[] => (keptOf(ed).travel ??= travelOf(ed.need().game.name))
// Clip `clip` said to travel, or to travel no more: the travelling clips it leaves, or why it is not,
// a clip with no name, one said to travel that travels already, or one that does not said to travel
// no more.
export function travels(ed: Editor, clip: string, on: boolean): { travel: string[] } | { why: string } {
  const was = travelIn(ed), name = clip.trim()
  if (!name) return { why: 'a travelling clip has a name' }
  if (on === was.includes(name)) return { why: `${name} ${on ? 'travels already' : 'does not travel'}: the travelling clips are ${was.length ? was.join(', ') : 'none'}` }
  return { travel: on ? [...was, name] : was.filter(c => c !== name) }
}
// The travelling clips set, kept for the session and in this browser; a browser that keeps nothing
// keeps them for the session.
export function setTravel(ed: Editor, travel: string[]) {
  keptOf(ed).travel = travel
  try {
    localStorage.setItem(travelKey(ed.need().game.name), JSON.stringify(travel))
  } catch {
    // Kept for the session alone.
  }
  ed.changed('x.loader')
}

// ---------------------------------------------------------------- bringing a sheet in

// What the sheet at `path` on this machine is, as the loader's route (`loader.route.ts`) looks at it.
export const look = (path: string) => fetched<Look>(`/api/x/loader/look?path=${encodeURIComponent(path)}`)
// The catalogue entry a copy, a slice or a paint writes with the sheet (`entry` of `loader.route.ts`):
// `name` of the catalogue in `file`, added as `value` with the sheet's url, or without `value` its url
// set to the sheet's.
type Entering = { file: string; name: string; value?: Partial<Asset> }

// The folder most of a catalogue's sheets are in, by its path from the repo.
export function sheetFolder(assets: Record<string, Asset>): string {
  const count = new Map<string, number>()
  for (const a of Object.values(assets)) if (a.type === 'sheet') {
    const p = pathOf(a.url), f = p.slice(0, p.lastIndexOf('/'))
    count.set(f, (count.get(f) ?? 0) + 1)
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

// A file's name without its folder or its `.json`.
export const baseName = (p: string) => p.slice(p.replace(/\\/g, '/').lastIndexOf('/') + 1).replace(/\.json$/i, '')
// The folder of a url's file, by its path from the repo, and a path's file name.
export const folderOf = (url: string) => pathOf(url).slice(0, pathOf(url).lastIndexOf('/'))
export const fileName = (p: string) => p.slice(p.replace(/\\/g, '/').lastIndexOf('/') + 1)

// How a sheet comes into a catalogue beside the sheets it has, as Add a sheet and Slice bring one in:
// as the entry `name`, else `named`; drawn as the sheet `like` is, else as the first sheet in the
// folder it goes into, else the first sheet; and preloaded as `preload` says, else as that sheet is.
// Why it may not come in: it has no name, the catalogue of `scene` has an entry by it already, or
// `like` is no sheet of the catalogue.
function comingIn(scene: string, assets: Record<string, Asset>, folder: string, named: string, choice: { name?: string; like?: string; preload?: boolean }) {
  const sheets = entryNames(assets, 'sheet')
  const entry = choice.name ?? named
  const sibling = choice.like ?? sheets.find(n => folderOf(assets[n].url) === folder) ?? sheets[0]
  const loads = choice.preload ?? !!(sibling && assets[sibling]?.preload)
  const why = !entry ? 'the entry has a name'
    : entry in assets ? `${scene}'s catalogue has an entry ${entry} already`
    : choice.like !== undefined && !sheets.includes(choice.like) ? `${scene}'s catalogue has no sheet ${choice.like} to draw it like: its sheets are ${sheets.join(', ') || 'none'}`
    : undefined
  return { entry, sibling, loads, like: sibling === undefined ? undefined : assets[sibling], why }
}

// The sheet at `typed`, a sheet file on this machine, its path as typed and trimmed (`from`), brought
// into `scene`'s catalogue as Add a sheet brings it in: copied into `folder`, else the folder most of
// the catalogue's sheets are in, as the entry named as the file is (`comingIn`); and why it may not
// be, as above or with no folder.
export function addPlan(scene: string, assets: Record<string, Asset>, typed: string, choice: { folder?: string; name?: string; like?: string; preload?: boolean }) {
  const from = typed.trim(), folder = choice.folder ?? sheetFolder(assets)
  const got = comingIn(scene, assets, folder, from ? baseName(from) : '', choice)
  return { ...got, from, folder, why: got.why ?? (!folder.trim() ? 'the sheet is copied into a folder of the repo' : undefined) }
}

// The picture entry `a` of `scene`'s catalogue cut into a sheet as Slice cuts it: in tiles `tile`
// pixels across, into the sheet file `into`, else one named as the picture is in the folder most of
// the catalogue's sheets are in, else the picture's own, and brought in as the entry named as the
// picture is (`comingIn`); and why it may not be, as above, or for a tile that is not an even number
// of pixels, 2 or more, or a sheet file that is no `.json`.
export function slicePlan(scene: string, assets: Record<string, Asset>, a: Asset, choice: { tile: number; into?: string; name?: string; like?: string; preload?: boolean }) {
  const base = fileName(pathOf(a.url)).replace(/\.png$/i, '')
  const into = choice.into ?? `${sheetFolder(assets) || folderOf(a.url)}/${base}.json`
  const got = comingIn(scene, assets, into.slice(0, into.lastIndexOf('/')), base, choice)
  const even = Number.isInteger(choice.tile) && choice.tile >= 2 && choice.tile % 2 === 0
  const why = !even ? `a tile is an even number of pixels across, 2 or more, not ${choice.tile}` : got.why ?? (!/\.json$/i.test(into) ? `${into} is no .json: the sheet is written as one` : undefined)
  return { ...got, into, why }
}

// A sheet at `typed`, its path as typed and trimmed (`from`), swapped into the sheet entry `name`,
// `a`, as Swap does: whether it has the entry's own file name, and so is written over its files; and
// why it may not be, one that is written over them only with `replace`.
export function swapPlan(name: string, a: Asset, typed: string, replace: boolean) {
  const from = typed.trim(), own = !!from && fileName(from) === fileName(pathOf(a.url))
  return { from, own, why: own && !replace ? `${fileName(from)} is ${name}'s own file name: its files are written over only with replace` : undefined }
}

// A sheet's entry as Add a sheet and Slice add it, but for its url, which the route writes: drawn as
// `like` is, and preloaded or not.
const comingEntry = (like: Asset | undefined, preload: boolean): Partial<Asset> => ({ type: 'sheet', ...(preload && { preload: true }), ...(like && drawing(like)) })

// Copies the sheet at `from` into `to` and adds the entry `name` for it, drawn as `like` is and
// preloaded or not, to the catalogue in `file`: one route, the change `e` makes, which one undo takes
// back, the copy and the entry.
export function addSheet(e: Edits, file: string, name: string, from: string, to: string, like: Asset | undefined, preload: boolean, replace: boolean) {
  const entry: Entering = { file, name, value: comingEntry(like, preload) }
  return e.route<Copied>('loader', 'copy', { from, to, replace, entry })
}

// Cuts the picture at `from`, a PNG of the repo, into the sheet `to`, as `cut` says (`slice` of the
// route), and adds the entry `name` for it, drawn as `like` is and preloaded or not, to the catalogue
// in `file`: one route, the change `e` makes, which one undo takes back, the sheet, its page and the
// entry.
export function sliceSheet(e: Edits, file: string, name: string, from: string, to: string, cut: { tile: number; marks: number[]; loose: number }, like: Asset | undefined, preload: boolean) {
  const entry: Entering = { file, name, value: comingEntry(like, preload) }
  return e.route<Copied>('loader', 'slice', { from, to, ...cut, entry })
}

// Copies the sheet at `from` beside the entry `name`'s file: one route, the change `e` makes, which
// one undo takes back. A copy with the entry's own file name writes over its files, which the game
// reads anew; any other is made the entry's url.
export function swapSheet(e: Edits, file: string, name: string, a: Asset, from: string, replace: boolean) {
  const entry: Entering = { file, name }
  return e.route<Copied>('loader', 'copy', { from, to: folderOf(a.url), replace, entry })
}

// ---------------------------------------------------------------- painting a sheet

// The pixels set on each page of a sheet, by the page's url as the sheet names it: three numbers a
// pixel, x, y and the colour 0xRRGGBBAA, as the `paint` route takes them.
export type Painting = Record<string, number[]>

// Sets `pixels` on the pages of the sheet at `url`: one route, the change `e` makes, which one undo
// takes back, the pages put back.
export function saveSheet(e: Edits, url: string, pixels: Painting) {
  return e.route<Copied>('loader', 'paint', { sheet: pathOf(url), pixels })
}

// Copies the sheet at `url` to `to`, a path of the repo, with `pixels` set on the copy's pages, and,
// given `add`, adds the entry `add.name` for it to the catalogue in `add.file`, as `add.like` is but
// for its url: one route, the change `e` makes, which one undo takes back, the copy and the entry
// taken away, or any file it wrote over put back.
export function saveSheetAs(e: Edits, url: string, pixels: Painting, to: string, replace: boolean, add?: { file: string; name: string; like: Asset }) {
  const entry: Entering | undefined = add && { file: add.file, name: add.name, value: add.like }
  return e.route<Copied>('loader', 'paint', { sheet: pathOf(url), to, pixels, replace, ...(entry && { entry }) })
}

// The pixels set on a sheet's pages and not saved yet: for each page by its url, its width and each
// pixel set, by its place on the page, y × width + x, and its colour 0xRRGGBBAA.
export type Paints = Map<string, { width: number; set: Map<number, number> }>

// How many times the Sprites panel's strokes, colour or what it shows have changed; and a change,
// told as the loader's own (`x.loader`), which draws again every panel that reads it.
export const spritesVersion = (ed: Editor) => keptOf(ed).version
export const bump = (ed: Editor) => {
  keptOf(ed).version++
  ed.changed('x.loader')
}

// A sheet's strokes not saved yet, each the pixels set once it was drawn, the last what is set now.
export function strokesOf(ed: Editor, url: string): Paints[] {
  const { strokes } = keptOf(ed)
  let had = strokes.get(url)
  if (!had) strokes.set(url, (had = []))
  return had
}
export const paintsOf = (ed: Editor, url: string): Paints => strokesOf(ed, url).at(-1) ?? new Map()
// A stroke begun: the pixels set now, each set by the stroke on top of them.
export function stroke(ed: Editor, url: string): Paints {
  const next: Paints = new Map([...paintsOf(ed, url)].map(([page, p]) => [page, { width: p.width, set: new Map(p.set) }]))
  strokesOf(ed, url).push(next)
  return next
}
// A stroke done: dropped when it set nothing the one before it had not.
export function stroked(ed: Editor, url: string) {
  const strokes = strokesOf(ed, url)
  if (same(strokes.at(-1) ?? new Map(), strokes.at(-2) ?? new Map())) strokes.pop()
  bump(ed)
}
// Whether two strokes set the same pixels to the same colours.
const same = (a: Paints, b: Paints) => {
  for (const page of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(page)?.set ?? new Map<number, number>(), y = b.get(page)?.set ?? new Map<number, number>()
    if (x.size !== y.size || [...x].some(([i, c]) => y.get(i) !== c)) return false
  }
  return true
}
// Every pixel set taken off, as a stroke of its own.
export const revert = (ed: Editor, url: string) => {
  strokesOf(ed, url).push(new Map())
  bump(ed)
}
export const undoStroke = (ed: Editor, url: string) => {
  strokesOf(ed, url).pop()
  bump(ed)
}
// Saved: nothing is left to save, and nothing to take back.
export const saved = (ed: Editor, url: string) => {
  keptOf(ed).strokes.delete(url)
  bump(ed)
}
export const unsaved = (p: Paints) => [...p.values()].reduce((n, v) => n + v.set.size, 0)
// The pixels set, as the `paint` route takes them.
export const paintingOf = (p: Paints): Painting =>
  Object.fromEntries([...p].filter(([, v]) => v.set.size).map(([page, { width, set }]) => [page, [...set].flatMap(([i, c]) => [i % width, Math.floor(i / width), c])]))

// The colour the Sprites panel paints in, 0xRRGGBBAA, and the colours set, the latest first.
export const colourOf = (ed: Editor) => keptOf(ed).colour
export const recentOf = (ed: Editor) => keptOf(ed).recent
export const RECENT = 16
// Sets the colour; `done`, as a picker says once it is let go, puts it first among the recent ones.
export function setColour(ed: Editor, c: number, done = true) {
  const k = keptOf(ed)
  k.colour = c >>> 0
  if (done) k.recent = [k.colour, ...k.recent.filter(r => r !== k.colour)].slice(0, RECENT)
  bump(ed)
}

// What the Sprites panel shows: the scene whose catalogue it shows, the sheet, and the frame it shows
// of each sheet, by the sheet's url; each undefined until one is picked.
export const shownOf = (ed: Editor) => keptOf(ed).shown
export function show(ed: Editor, at: { scene?: string; sheet?: string; frame?: { url: string; id: string } }) {
  const shown = keptOf(ed).shown
  if ('scene' in at) shown.scene = at.scene
  if ('sheet' in at) shown.sheet = at.sheet
  if (at.frame) shown.frames.set(at.frame.url, at.frame.id)
  bump(ed)
}

// A colour 0xRRGGBBAA as text, `#rrggbbaa`, and back from `#rrggbb` or `#rrggbbaa`.
export const hex8 = (c: number) => `#${(c >>> 0).toString(16).padStart(8, '0')}`
export const colourFrom = (t: string) => (parseInt(t.slice(1), 16) * (t.length === 7 ? 256 : 1) + (t.length === 7 ? 255 : 0)) >>> 0

// Where the pixel [u, v] of a frame's kept pixels, as they are drawn upright, lies on its page.
export const onPage = (f: Frame, u: number, v: number): [number, number] => {
  const [bx, by, bw] = f.box
  return f.rotated ? [bx + bw - 1 - v, by + u] : [bx + u, by + v]
}
// A page's own colour at [x, y].
export const pageColour = (page: Pixels, x: number, y: number) => {
  const i = (y * page.width + x) * 4, d = page.data
  return ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0
}
// A page's colour at [x, y] with the pixels set on it.
export const colourAt = (page: Pixels, set: Map<number, number> | undefined, x: number, y: number) => set?.get(y * page.width + x) ?? pageColour(page, x, y)
// A frame's kept pixels, upright, as its page holds them with the pixels set on it.
export function keptPixels(page: Pixels, set: Map<number, number> | undefined, f: Frame): Pixels {
  const w = f.trim[2], h = f.trim[3]
  const out = blank(w, h)
  for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
    const [x, y] = onPage(f, u, v)
    if (x < 0 || y < 0 || x >= page.width || y >= page.height) continue
    const c = colourAt(page, set, x, y)
    out.data.set([c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255], (v * w + u) * 4)
  }
  return out
}
// Sets the pixel [u, v] of frame `f`, upright, in the stroke `into`, to `colour`; a pixel set to its
// page's own colour is not set. Answers whether the frame has the pixel.
export function setPixel(into: Paints, page: Pixels, pageUrl: string, f: Frame, [u, v]: [number, number], colour: number): boolean {
  if (u < 0 || v < 0 || u >= f.trim[2] || v >= f.trim[3]) return false
  const [x, y] = onPage(f, u, v)
  if (x < 0 || y < 0 || x >= page.width || y >= page.height) return false
  let p = into.get(pageUrl)
  if (!p) into.set(pageUrl, (p = { width: page.width, set: new Map() }))
  const i = y * page.width + x
  if (colour === pageColour(page, x, y)) p.set.delete(i)
  else p.set.set(i, colour)
  return true
}

// Saves the pixels set on the sheet at `url` onto its own pages, as the change `e` makes, then reads
// the pages as they were written before letting the pixels set go, so a frame never shows the page
// as it was.
export async function saveSprites(ed: Editor, e: Edits, url: string) {
  const done = await saveSheet(e, url, paintingOf(paintsOf(ed, url)))
  await Promise.all(done.files.map(f => pixelsAt(readAt(ed, `/${f}`))))
  saved(ed, url)
  return done
}
// Saves the pixels set on sheet `sheet` of `scene`'s catalogue onto a copy at `to`, as the change `e`
// makes, with an entry `name` for it added to the catalogue when `add`, which the panel then shows,
// at the frame it showed of the sheet.
export async function saveSpritesAs(ed: Editor, e: Edits, { scene, sheet, to, name, add, replace }: { scene: string; sheet: string; to: string; name: string; add: boolean; replace: boolean }) {
  const { file, assets, entry } = sheetEntry(ed, scene, sheet)
  if (add && name in assets) throw new Error(`${scene}'s catalogue has an entry ${name} already`)
  const done = await saveSheetAs(e, entry.url, paintingOf(paintsOf(ed, entry.url)), to, replace, add ? { file, name, like: entry } : undefined)
  const frame = shownOf(ed).frames.get(entry.url)
  saved(ed, entry.url)
  if (add) show(ed, { scene, sheet: name, ...(frame !== undefined && { frame: { url: done.url, id: frame } }) })
  return done
}

// ---------------------------------------------------------------- the Sheets panel's sheet
//
// A sheet as its files write it, what the Sheets panel draws of it and what its edits write into it:
// the panel and the Sheets commands do each by the one function here.

// A sheet file as Aseprite, TexturePacker, Tiled or a person wrote it, which the loader's `read` checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any
// A JSON value in a file of the sheet's, and where it is in that file.
export type Ref = { file: string; at: At; json: Json }
// A value written into a file of the sheet's.
export type Write = { file: string; at: At; value: unknown; insert?: boolean }
// The sheet's file and every pack of it: its url, its path from the repo, and what it holds.
export type Pack = { url: string; file: string; json: Json }
// A sheet as its files write it: the files, the sheet the loader reads from them, each frame of an
// Aseprite or TexturePacker sheet where its file writes it, and each clip's first run's tag.
export type Got = { packs: Pack[]; sheet: Sheet; frames: Map<string, Ref>; tags: Map<string, Json> }

// How the files write a clip: an Aseprite or TexturePacker clip, its runs each the frames of a tag in
// the file's order (none for a TexturePacker animation); or a Tiled tile.
export type Source =
  | { shape: 'atlas'; runs: { ids: string[]; tag?: Ref }[] }
  | { shape: 'tiles'; tile: Ref }

// Seconds as milliseconds, to a thousandth.
export const ms = (s: number) => Math.round(s * 1000 * 1000) / 1000
const typeOf = (t: Json): string => t.type ?? t.class ?? ''

// Every frame an Aseprite or TexturePacker sheet has, by id, in whichever pack holds it.
function atlasFrames(packs: Pack[]): Map<string, Ref> {
  const out = new Map<string, Ref>()
  for (const p of packs) {
    if (Array.isArray(p.json.frames)) p.json.frames.forEach((f: Json, i: number) => out.set(f.filename, { file: p.file, at: ['frames', i], json: f }))
    else for (const [id, f] of Object.entries(p.json.frames ?? {})) out.set(id, { file: p.file, at: ['frames', id], json: f })
  }
  return out
}

// Each clip's first run's tag, of an Aseprite or TexturePacker sheet.
function firstTags(packs: Pack[]): Map<string, Json> {
  const out = new Map<string, Json>()
  for (const p of packs) for (const tag of p.json.meta?.frameTags ?? []) {
    const [clip, k] = runOf(tag.name)
    if (k === 0) out.set(clip, tag)
  }
  return out
}

// How the files write clip `clip` (`Source`).
export function sourceOf(packs: Pack[], clip: string): Source {
  const main = packs[0]
  if (shapeOf(main.json, main.url) === 'tileset') {
    const tiles = [...(main.json.tiles ?? [])].sort((a: Json, b: Json) => a.id - b.id)
    const t = tiles.find((t: Json) => (typeOf(t) || (t.animation ? String(t.id) : '')) === clip)
    return { shape: 'tiles', tile: { file: main.file, at: ['tiles', main.json.tiles.indexOf(t)], json: t } }
  }
  const runs: { ids: string[]; tag?: Ref }[] = []
  for (const p of packs) {
    const order: string[] = Array.isArray(p.json.frames) ? p.json.frames.map((f: Json) => f.filename) : Object.keys(p.json.frames ?? {})
    ;(p.json.meta?.frameTags ?? []).forEach((tag: Json, i: number) => {
      const [name, k] = runOf(tag.name)
      if (name === clip) runs[k] = { ids: order.slice(tag.from, tag.to + 1), tag: { file: p.file, at: ['meta', 'frameTags', i], json: tag } }
    })
    for (const [name, ids] of Object.entries((p.json.animations ?? {}) as Record<string, string[]>)) {
      const [c, k] = runOf(name)
      if (c === clip) runs[k] = { ids: ids.map(String) }
    }
  }
  return { shape: 'atlas', runs }
}

// The other packs a sheet entry's file, `first` as it parses, names, by their urls: a multipack's.
export const packsNamed = (entry: Entry, first: Json): string[] =>
  !first || shapeOf(first, entry.url) !== 'atlas' ? [] : ((first.meta?.related_multi_packs ?? []) as string[]).map(p => beside(entry.url, p))

// A sheet entry's sheet as the game reads it, from the texts of its file and every pack of it, in the
// order of their `urls` (its own, then `packsNamed`): the loader's `read` of them, with the entry's
// `nearest`, `facing` and `palette`; the loader's words, or the parser's, when it cannot be read.
export function sheetFrom(entry: Entry, urls: string[], texts: string[]): Got {
  const packs: Pack[] = urls.map((url, i) => ({ url, file: pathOf(url), json: JSON.parse(texts[i]) }))
  const byUrl = new Map(packs.map(p => [p.url, p.json]))
  const sheet = read(packs[0].json, entry.url, entry, u => {
    if (!byUrl.has(u)) throw new Error(`${u} is no pack this sheet names`)
    return byUrl.get(u)
  })
  const atlas = shapeOf(packs[0].json, entry.url) === 'atlas'
  return { packs, sheet, frames: atlas ? atlasFrames(packs) : new Map(), tags: atlas ? firstTags(packs) : new Map() }
}

// The sheet entry `name`, `entry`, read as `sheetFrom` reads it, its files through the editor; refused,
// in the words the panel says it in, when it cannot be read.
export async function sheetRead(ed: Editor, name: string, entry: Entry): Promise<Got> {
  try {
    const main = await ed.text(pathOf(entry.url))
    let first: Json
    try {
      first = JSON.parse(main)
    } catch {
      first = undefined
    }
    const urls = [entry.url, ...packsNamed(entry, first)]
    return sheetFrom(entry, urls, await Promise.all(urls.map(u => ed.text(pathOf(u)))))
  } catch (e) {
    throw new Error(`${name} cannot be read: ${(e as Error).message}`)
  }
}
// Sheet `sheet` of `scene`'s catalogue so read, with its pages' pixels as they are written.
export async function sheetGot(ed: Editor, scene: string, sheet: string): Promise<Got & { entry: Entry; pages: Pixels[] }> {
  const { entry } = sheetEntry(ed, scene, sheet)
  const got = await sheetRead(ed, sheet, entry)
  const pages = await Promise.all(got.sheet.pages.map(p => pixelsAt(readAt(ed, p))))
  return { ...got, entry, pages }
}

// A palette's colours, or why it cannot be read, by its entry's name.
export type Palettes = Map<string, number[] | string>
export const paletteOf = (text: string, url: string): number[] | string => {
  try {
    return gpl(text, url)
  } catch (e) {
    return (e as Error).message
  }
}
// Every palette of a catalogue, read through the editor.
export async function palettesOf(ed: Editor, assets: Record<string, Asset>): Promise<Palettes> {
  return new Map(await Promise.all(entryNames(assets, 'palette').map(async (n): Promise<[string, number[] | string]> => {
    try {
      return [n, paletteOf(await ed.text(pathOf(assets[n].url)), assets[n].url)]
    } catch (e) {
      return [n, (e as Error).message]
    }
  })))
}

// The palettes of the catalogue a sheet's own may be swapped for, as sprite2d swaps them, and why
// each other one may not.
export function paletteChoices(sheet: Sheet, palettes: Palettes): { ok: string[]; refused: [string, string][] } {
  const base = sheet.palette !== undefined ? palettes.get(sheet.palette) : undefined
  const ok: string[] = [], refused: [string, string][] = []
  if (sheet.palette !== undefined && base === undefined) refused.push([sheet.palette, 'the catalogue has no such palette'])
  if (typeof base === 'string') refused.push([sheet.palette!, base])
  if (!Array.isArray(base)) return { ok, refused }
  for (const [n, colours] of palettes) {
    if (typeof colours === 'string') refused.push([n, colours])
    else if (base.length > SWAPS) refused.push([n, `${sheet.palette} has ${base.length} colours, more than the ${SWAPS} a swap takes`])
    else if (colours.length < base.length) refused.push([n, `it has ${colours.length} colours, fewer than the ${base.length} of ${sheet.palette}`])
    else ok.push(n)
  }
  return { ok, refused }
}

// How a clip plays, in words: a tag's direction and how many times, ↻ for forever, as the clip list
// says it.
export function howPlays(tag: Json, shape: Source['shape']): string {
  if (shape === 'tiles') return 'Tiled ↻'
  if (!tag) return 'forward ↻'
  return `${tag.direction ?? 'forward'} ${Number(tag.repeat ?? 0) ? `×${Number(tag.repeat)}` : '↻'}`
}

// A way on the screen, as a fraction of a turn counter-clockwise from right, in words.
export function wayName(turns: number): string {
  const eighth = turns * 8
  const arrow = Math.abs(eighth - Math.round(eighth)) < 1e-6 ? ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'][Math.round(eighth) % 8] + ' ' : ''
  return `${arrow}${Math.round(turns * 3600) / 10}°`
}

// Every way a clip's runs face, and the mirror image of each on a sheet that mirrors, once each.
export function waysOf(sheet: Sheet, clip: string): number[] {
  const { first, step, mirror } = sheet.facing
  const all: number[] = []
  for (let k = 0; k < sheet.clips[clip].runs.length; k++) {
    const faces = first + k * step
    all.push(faces, ...(mirror ? [0.5 - faces] : []))
  }
  const round = (v: number) => ((v % 1) + 1) % 1
  return [...new Set(all.map(v => Math.round(round(v) * 1e6) / 1e6))].sort((a, b) => a - b)
}

// A frame as it is drawn: its pixels, the point of them it stands on, and where the pixels kept are;
// turned over left to right when `mirror`, and in the colours `colours` swapped when given.
export type Drawn = { pixels: Pixels; anchor: [number, number]; trim: number[] }
export function drawnOf(page: Pixels, f: Frame, mirror: boolean, colours?: [number[], number[]]): Drawn {
  let pixels = cut(page, f.box, f.rotated, f.size, f.trim)
  if (colours) pixels = swapped(pixels, ...colours)
  if (!mirror) return { pixels, anchor: f.anchor, trim: f.trim }
  const [tx, ty, tw, th] = f.trim
  return { pixels: mirrored(pixels), anchor: [f.size[0] - f.anchor[0], f.anchor[1]], trim: [f.size[0] - tx - tw, ty, tw, th] }
}
// A frame drawn, as the onionskin lays it on the point every frame stands on.
export const layerOf = (d: Drawn): Layer => ({ pixels: d.pixels, at: [-d.anchor[0], -d.anchor[1]] })

// Every frame of `ids` as it stands on its anchor, mirrored or not: how far they reach, [left, top,
// right, bottom] from the point they stand on, which the picture is fitted to.
export function runBox(sheet: Sheet, ids: string[], mirror: boolean): number[] {
  const reach = [...new Set(ids)].map(id => sheet.frames[id]).map(f => {
    const ax = mirror ? f.size[0] - f.anchor[0] : f.anchor[0]
    return [-ax, -f.anchor[1], f.size[0] - ax, f.size[1] - f.anchor[1]]
  })
  return [Math.min(...reach.map(r => r[0])), Math.min(...reach.map(r => r[1])), Math.max(...reach.map(r => r[2])), Math.max(...reach.map(r => r[3]))]
}

// How the Sheets panel draws a clip: its zoom, 0 to fit the run to the picture; on a checker, else on
// `colour`; the frame, else the run's onionskin.
export type ClipLook = { zoom: number; checker: boolean; colour: string; onion: boolean }

// What the Sheets panel draws, on `c`, `w` by `h`, in the theme's colours as `colour` reads them
// (a variable, and the colour when it is not set), a picture drawn by `image`: the frame `now` of the
// run whose frames reach `box` from where they stand, frame `id` of the sheet, or the run's onionskin
// `skin`, at the look's whole-number zoom about the middle, on a checker, a colour, or black under the
// onionskin, with nearest filtering; around the frame its whole picture dashed and the pixels it keeps
// boxed, and each slice keyed on it boxed in its own colour (`json` the sheet's file), mirrored with
// it; and the foot line across and the pivot's cross, over a shadow of their own so they show on any
// background. Answers where the frame's whole picture lies and at what zoom, for a click to be read
// back into a pixel of it; undefined under the onionskin.
export function drawClip(c: Pen, image: (p: Pixels, x: number, y: number, w: number, h: number) => void, colour: (name: string, or: string) => string, w: number, h: number,
  { look, box, now, skin, sheet, json, id, mirror }: { look: ClipLook; box: number[]; now: Drawn | undefined; skin: Layer | undefined; sheet: Sheet; json: Json; id: string; mirror: boolean }) {
  const z = look.zoom || Math.max(1, Math.floor(Math.min((w * 0.8) / Math.max(1, box[2] - box[0]), (h * 0.8) / Math.max(1, box[3] - box[1]))))
  if (look.onion) {
    c.fillStyle = '#000'
    c.fillRect(0, 0, w, h)
  } else if (look.checker) {
    const a = colour('--field', '#18191c'), b = colour('--hover', '#34373d')
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      c.fillStyle = ((x + y) / 8) % 2 ? a : b
      c.fillRect(x, y, 8, 8)
    }
  } else {
    c.fillStyle = look.colour
    c.fillRect(0, 0, w, h)
  }
  // The point every frame stands on, on the surface.
  const px = Math.round(w / 2 - ((box[0] + box[2]) / 2) * z), py = Math.round(h / 2 - ((box[1] + box[3]) / 2) * z)
  const pic = look.onion ? skin : now && layerOf(now)
  if (pic) image(pic.pixels, Math.round(px + pic.at[0] * z), Math.round(py + pic.at[1] * z), pic.pixels.width * z, pic.pixels.height * z)
  c.lineWidth = 1
  let placed: { left: number; top: number; z: number } | undefined
  if (now && !look.onion) {
    // The whole frame, dashed, and the pixels it keeps.
    const [ax, ay] = now.anchor, [tx, ty, tw, th] = now.trim
    c.strokeStyle = colour('--dim', '#8a8f98')
    c.setLineDash([3, 3])
    c.strokeRect(Math.round(px - ax * z) + 0.5, Math.round(py - ay * z) + 0.5, now.pixels.width * z - 1, now.pixels.height * z - 1)
    c.setLineDash([])
    c.strokeStyle = colour('--warn', '#eda100')
    c.strokeRect(Math.round(px + (tx - ax) * z) + 0.5, Math.round(py + (ty - ay) * z) + 0.5, tw * z - 1, th * z - 1)
    // Where the frame's whole picture lies, and the keys of every slice on this frame, each in its
    // own colour.
    const left = Math.round(px - ax * z), top = Math.round(py - ay * z)
    placed = { left, top, z }
    const at = sheet.order.indexOf(id), size = sheet.frames[id].size
    for (const [name, keys] of Object.entries(sheet.slices))
      for (const k of keys) {
        if (k.frame !== at) continue
        const [bx, by, bw, bh] = k.bounds, x = mirror ? size[0] - bx - bw : bx
        c.strokeStyle = sliceColor(json, name)
        c.lineWidth = 2
        c.strokeRect(left + x * z - 1, top + by * z - 1, bw * z + 2, bh * z + 2)
        c.lineWidth = 1
      }
  }
  // The foot line across, and the pivot's cross, over a shadow of their own.
  c.beginPath()
  c.moveTo(0, py + 0.5)
  c.lineTo(w, py + 0.5)
  c.moveTo(px + 0.5, py - 10)
  c.lineTo(px + 0.5, py + 11)
  c.lineWidth = 3
  c.strokeStyle = colour('--shadow', 'rgba(0, 0, 0, 0.45)')
  c.stroke()
  c.lineWidth = 1
  c.strokeStyle = colour('--accent', '#4c8dff')
  c.stroke()
  return placed
}

// ---------------------------------------------------------------- what a Sheets edit writes

// Frame `j` of the clip, as its tag lists them, shows for `value` milliseconds: that frame of every
// run, so the runs stay timed alike.
function durationWrites(src: Source, frames: Map<string, Ref>, j: number, value: number): Write[] {
  if (src.shape === 'tiles') return [{ file: src.tile.file, at: [...src.tile.at, 'animation', j, 'duration'], value }]
  return src.runs.map(r => frames.get(r.ids[j])!).filter(f => f.json.duration !== value).map(f => ({ file: f.file, at: [...f.at, 'duration'], value }))
}

// Every frame of the clip shows for `value` milliseconds: a clip whose frames are not timed, timed.
function timingWrites(src: Source, frames: Map<string, Ref>, value: number): Write[] {
  if (src.shape !== 'atlas') return []
  const ids = new Set(src.runs.flatMap(r => r.ids))
  return [...ids].map(id => frames.get(id)!).map(f => ({ file: f.file, at: [...f.at, 'duration'], value }))
}

// A key of every run's tag: its `direction`, or its `repeat`, left out for forever as Aseprite writes it.
function tagWrites(src: Source, key: 'direction' | 'repeat', value: string | number): Write[] {
  if (src.shape !== 'atlas') return []
  return src.runs.flatMap(r => {
    if (!r.tag) return []
    const was = r.tag.json[key]
    const next = key === 'repeat' ? (value === 0 ? undefined : typeof was === 'number' ? value : String(value)) : value
    return String(was ?? (key === 'repeat' ? undefined : 'forward')) === String(next) ? [] : [{ file: r.tag.file, at: [...r.tag.at, key], value: next }]
  })
}

// The one pivot writer: every frame of `ids` stands on the point [x, y] of its whole frame, in pixels.
// A pivot is that point as a fraction of the frame, written a number at a time where the frame has
// one (or an `anchor`, as TexturePacker may write it), in whichever pack holds the frame; a tile of a
// Tiled tileset stands on its tileset's `objectalignment` and `tileoffset`, and none is written. A
// clip's pivot is every frame of the clip; a frame set or nudged, or settled onto another, is that
// frame alone.
function anchorWrites(packs: Pack[], frames: Map<string, Ref>, sheet: Sheet, ids: string[], [x, y]: number[]): Write[] {
  const main = packs[0]
  if (shapeOf(main.json, main.url) !== 'atlas') return []
  const out: Write[] = []
  for (const id of new Set(ids)) {
    const f = frames.get(id)!, [w, h] = sheet.frames[id].size
    const key = f.json.pivot ? 'pivot' : f.json.anchor ? 'anchor' : 'pivot'
    const want = { x: x / w, y: y / h }
    const had = f.json[key]
    if (!had) out.push({ file: f.file, at: [...f.at, key], value: want })
    else for (const c of ['x', 'y'] as const) if (Math.abs(had[c] - want[c]) > 1e-9) out.push({ file: f.file, at: [...f.at, key, c], value: want[c] })
  }
  return out
}

// Clip `clip` of the sheet `name`, run `run` of it and place `place` of that run; each a sheet, clip
// or run has not got refused, naming those it has.
export function clipIn(sheet: Sheet, name: string, clip: string) {
  const c = sheet.clips[clip]
  if (!c) throw new Error(`${name} has no clip ${clip}: its clips are ${Object.keys(sheet.clips).join(', ') || 'none'}`)
  return c
}
export function runIn(sheet: Sheet, name: string, clip: string, run: number) {
  const runs = clipIn(sheet, name, clip).runs
  if (!Number.isInteger(run) || run < 0 || run >= runs.length) throw new Error(`${clip} of ${name} has ${runs.length === 1 ? 'one run, 0' : `${runs.length} runs, 0 to ${runs.length - 1}`}`)
  return runs[run]
}
export function placeIn(sheet: Sheet, name: string, clip: string, run: number, place: number) {
  const ids = runIn(sheet, name, clip, run)
  if (!Number.isInteger(place) || place < 0 || place >= ids.length) throw new Error(`run ${run} of ${clip} has ${ids.length === 1 ? 'one place, 0' : `${ids.length} places, 0 to ${ids.length - 1}`}`)
  return ids[place]
}

// The frames of a clip as its files time them, of its first run, in the order its tag, its animation
// or its tile's animation lists them: a frame's duration is written by its place in this list.
export function timedFrames(got: Got, clip: string): { id: string; ms?: number }[] {
  const src = sourceOf(got.packs, clip)
  if (src.shape === 'tiles') return ((src.tile.json.animation ?? []) as { tileid: number; duration: number }[]).map(a => ({ id: String(a.tileid), ms: a.duration }))
  return (src.runs[0]?.ids ?? []).map(id => ({ id, ms: got.frames.get(id)?.json.duration }))
}

// The writes that time frame `j` of `clip` of the sheet `name` (`timedFrames`) `value` milliseconds in
// every run, as the panel's duration does, or, with no `j`, every frame of a clip whose frames are not
// timed, as its timing does; refused where the panel offers neither.
export function durationEdit(got: Got, name: string, clip: string, j: number | undefined, value: number): Write[] {
  const c = clipIn(got.sheet, name, clip), src = sourceOf(got.packs, clip)
  if (j === undefined) {
    if (c.durations) throw new Error(`${clip} is timed: name the frame of it to time`)
    if (src.shape !== 'atlas') throw new Error(`${clip} is a tile with no animation: it has no frames to time`)
    return timingWrites(src, got.frames, value)
  }
  if (!c.durations) throw new Error(`${clip} is not timed: leave the frame out to time every frame of it`)
  const n = timedFrames(got, clip).length
  if (!Number.isInteger(j) || j < 0 || j >= n) throw new Error(`${clip} is timed a frame at a time over ${n === 1 ? 'one frame, 0' : `${n} frames, 0 to ${n - 1}`}`)
  return durationWrites(src, got.frames, j, value)
}

// The writes that set how `clip` plays, every run's tag's `direction` or `repeat`, as the panel does;
// refused for a clip with no tag, which plays forward, round forever.
export function tagEdit(got: Got, name: string, clip: string, key: 'direction' | 'repeat', value: string | number): Write[] {
  clipIn(got.sheet, name, clip)
  const src = sourceOf(got.packs, clip)
  if (src.shape === 'tiles') throw new Error(`${clip} is a Tiled tile's animation: forward, round forever`)
  if (!src.runs[0]?.tag) throw new Error(`${clip} is a TexturePacker animation: forward, round forever`)
  return tagWrites(src, key, value)
}

// The writes that stand the frames `ids` of the sheet `name` on the point `at` of each one's whole
// frame (`anchorWrites`); refused for a Tiled tileset, whose tiles stand where it says.
function standWrites(got: Got, name: string, ids: string[], at: number[]): Write[] {
  if (shapeOf(got.packs[0].json, got.packs[0].url) !== 'atlas') throw new Error(`${name} is a Tiled tileset: a tile stands on its tileset's objectalignment and tileoffset`)
  return anchorWrites(got.packs, got.frames, got.sheet, ids, at)
}
// Frame `id` of the sheet `name`; one it has not got refused, naming those it has.
export function frameIn(sheet: Sheet, name: string, id: string): Frame {
  const f = sheet.frames[id]
  if (!f) throw new Error(`${name} has no frame ${id}: its frames are ${sheet.order.join(', ')}`)
  return f
}
// Frame `id` stood on `at`, as the panel's anchor sets it.
export function anchorEdit(got: Got, name: string, id: string, at: number[]): Write[] {
  frameIn(got.sheet, name, id)
  return standWrites(got, name, [id], at)
}
// Where frame `id` stands moved by [dx, dy], as the panel's arrows nudge it: from its whole pixel on a
// sheet of pixel art, which stands on whole pixels.
export function nudged(sheet: Sheet, id: string, [dx, dy]: number[]): number[] {
  const [x, y] = sheet.frames[id].anchor
  return sheet.nearest ? [Math.round(x) + dx, Math.round(y) + dy] : [x + dx, y + dy]
}
// Every frame of `clip` stood on `at`, as the panel's pivot sets the clip's.
export const pivotEdit = (got: Got, name: string, clip: string, at: number[]): Write[] => standWrites(got, name, clipIn(got.sheet, name, clip).runs.flat(), at)
// The frame at place `to` of run `run` of `clip` settled onto the one before it, as Settle does: moved
// by the shift that lays it on that one, which the pair is one drawing apart by; refused for a place
// no such pair ends at, naming those that do.
export function settleEdit(got: Got, pages: Pixels[], name: string, clip: string, run: number, to: number): Write[] {
  const ids = runIn(got.sheet, name, clip, run)
  const apartOf = pairsOf(got.sheet, pages, clip, run).filter(p => apart(p.slip))
  const p = apartOf.find(q => q.to === to)
  if (!p) throw new Error(`run ${run} of ${clip} has no frame at place ${to} one drawing apart from the one before it: ${apartOf.length ? `the frames apart are at ${apartOf.map(q => q.to).join(', ')}` : 'none is'}`)
  const [x, y] = got.sheet.frames[ids[p.to]].anchor
  return standWrites(got, name, [ids[p.to]], [Math.round(x) - p.slip.dx, Math.round(y) - p.slip.dy])
}
// Slice `slice` keyed on the frame at `place` of run `run` of `clip`, at the pixel `at` of its whole
// picture, as a pixel clicked keys it (`sliceEdit`), in the sheet's own file; refused for a slice with
// no name, a pixel the frame has not got, or a Tiled tileset, which has no slices.
export function sliceKeyEdit(got: Got, name: string, clip: string, run: number, place: number, slice: string, [x, y]: number[]): Write[] {
  const id = placeIn(got.sheet, name, clip, run, place)
  if (sourceOf(got.packs, clip).shape !== 'atlas') throw new Error(`${name} is a Tiled tileset, which keys no slices`)
  const key = slice.trim()
  if (!key) throw new Error('a slice has a name')
  const [w, h] = got.sheet.frames[id].size
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= w || y >= h) throw new Error(`frame ${id} is ${w} × ${h}, and has no pixel ${x}, ${y}`)
  return [{ file: got.packs[0].file, ...sliceEdit(got.packs[0].json, got.sheet, key, clip, run, id, [x, y]) }]
}

// How many steps of `dt` seconds each place of a timed clip shows the first time it plays through,
// played as the game plays it (`play`) from its first place; undefined for a clip not timed.
export function stepsOf(sheet: Sheet, clip: string, dt: number): number[] | undefined {
  const c = sheet.clips[clip]
  if (!c.durations) return undefined
  const out = new Array<number>(c.runs[0].length).fill(0)
  let [at, ft] = [0, 0]
  for (let k = 0, n = Math.ceil(span(sheet, clip) / dt - 1e-9); k < n; k++) {
    out[at]++
    ;[at, ft] = play(sheet, clip, at, ft, dt)
  }
  return out
}

// Writes into the sheet's files, as the change `e` makes: one undo; none, nothing.
export const sheetWrite = (e: Edits, writes: Write[]) => (writes.length ? e.editFiles(writes) : Promise.resolve())

// ---------------------------------------------------------------- the Sprites panel's commands

// Sheet `sheet` of `scene`'s catalogue: the file that gives the catalogue, its entries and the sheet's.
export function sheetEntry(ed: Editor, scene: string, sheet: string) {
  ed.sceneOf(scene, 'loader')
  const cat = catalogueOf(ed, scene)!
  const entry = cat.assets[sheet]
  if (entry?.type !== 'sheet') throw new Error(`${scene}'s catalogue has no sheet ${sheet}: its sheets are ${sheetsOf(ed, scene).join(', ')}`)
  return { ...cat, entry }
}
// Frame `frame` of that sheet, with its page, and the pixels set on it.
async function frameRead(ed: Editor, scene: string, sheet: string, frame: string) {
  const got = await sheetGot(ed, scene, sheet)
  const f = got.sheet.frames[frame]
  if (!f) throw new Error(`${sheet} has no frame ${frame}`)
  const pageUrl = got.sheet.pages[f.page]
  return { ...got, f, page: got.pages[f.page], pageUrl, set: paintsOf(ed, got.entry.url).get(pageUrl)?.set }
}

const where = { scene: z.string().describe('a scene with a loader row, as sprites.sheets lists them'), sheet: z.string().describe('a sheet entry of that scene\'s catalogue') }
const frameAt = { ...where, frame: z.string().describe('a frame of the sheet, as sprites.frames lists them') }
const COLOUR = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i

function sprites(ed: Editor) {
  ed.command({
    id: 'sprites.sheets',
    title: 'Sprites: sheets',
    input: z.object({ scene: z.string().optional().describe('a scene with a loader row; every one when left out') }).describe('The scenes of the open game with a loader row, each with its catalogue\'s file and its sheets, by name and url; or only `scene`.'),
    run: ({ scene }) => {
      ed.need()
      if (scene !== undefined) ed.sceneOf(scene, 'loader')
      return (scene === undefined ? loaderScenes(ed) : [scene]).map(n => {
        const { file, assets } = catalogueOf(ed, n)!
        return { scene: n, catalogue: file, sheets: sheetsOf(ed, n).map(name => ({ name, url: assets[name].url })) }
      })
    },
  })
  ed.command({
    id: 'sprites.frames',
    title: 'Sprites: frames',
    input: z.object(where).describe('Every frame of a sheet, in its order: its id, its size upright, which page it is on and where, and whether it lies turned there; and the sheet\'s pages.'),
    run: async ({ scene, sheet }) => {
      const got = await sheetGot(ed, scene, sheet)
      return {
        pages: got.sheet.pages,
        frames: got.sheet.order.map(id => {
          const f = got.sheet.frames[id]
          return { id, width: f.trim[2], height: f.trim[3], page: f.page, x: f.box[0], y: f.box[1], rotated: f.rotated }
        }),
      }
    },
  })
  ed.command({
    id: 'sprites.read',
    title: 'Sprites: read a frame',
    input: z.object(frameAt).describe('A frame\'s pixels upright, a row at a time from the top, each #rrggbbaa, with the pixels set and not saved yet; x across a row, y down the rows, as sprites.paint takes them.'),
    run: async ({ scene, sheet, frame }) => {
      const got = await frameRead(ed, scene, sheet, frame)
      const p = keptPixels(got.page, got.set, got.f)
      const rows = Array.from({ length: p.height }, (_, y) => Array.from({ length: p.width }, (_, x) => {
        const i = (y * p.width + x) * 4
        return hex8(((p.data[i] << 24) | (p.data[i + 1] << 16) | (p.data[i + 2] << 8) | p.data[i + 3]) >>> 0)
      }))
      return { width: p.width, height: p.height, unsaved: unsaved(paintsOf(ed, got.entry.url)), rows }
    },
  })
  ed.command({
    id: 'sprites.shot',
    title: 'Sprites: picture of a frame',
    input: z.object({ ...frameAt, zoom: z.number().int().min(1).max(32).default(8).describe('screen pixels a pixel of the frame is drawn across') }).describe('A frame as a PNG, with the pixels set and not saved yet, each pixel drawn `zoom` pixels square.'),
    run: async ({ scene, sheet, frame, zoom }) => {
      const got = await frameRead(ed, scene, sheet, frame)
      const p = keptPixels(got.page, got.set, got.f)
      const w = p.width * zoom, h = p.height * zoom
      const data = new Uint8ClampedArray(w * h * 4)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const from = ((Math.floor(y / zoom) * p.width) + Math.floor(x / zoom)) * 4
        data.set(p.data.subarray(from, from + 4), (y * w + x) * 4)
      }
      return new Blob([encodePng({ width: w, height: h, data, text: {} }) as BlobPart], { type: 'image/png' })
    },
  })
  ed.command({
    id: 'sprites.show',
    title: 'Sprites: show a frame',
    input: z.object(frameAt).describe('Shows the frame in the Sprites panel, so the person in the editor sees the frame you work on.'),
    run: async ({ scene, sheet, frame }) => {
      const got = await frameRead(ed, scene, sheet, frame)
      show(ed, { scene, sheet, frame: { url: got.entry.url, id: frame } })
      ed.revealer?.('loader.sprites')
    },
  })
  ed.command({
    id: 'sprites.paint',
    title: 'Sprites: paint pixels',
    input: z.object({
      ...frameAt,
      pixels: z.array(z.object({
        x: z.number().int().describe('across the frame upright, from 0 at its left'),
        y: z.number().int().describe('down the frame upright, from 0 at its top'),
        colour: z.string().regex(COLOUR).describe('#rrggbb, or #rrggbbaa with alpha 00 to clear the pixel'),
      })).min(1).describe('the pixels to set, each at x, y of the frame upright, as sprites.read gives them'),
    }).describe('Sets pixels of a frame, as one stroke of the Sprites panel\'s pencil: not saved until sprites.save or sprites.saveAs, and taken back by sprites.undo. The panel shows the frame.'),
    run: async ({ scene, sheet, frame, pixels }) => {
      const got = await frameRead(ed, scene, sheet, frame)
      const off = pixels.find(p => p.x < 0 || p.y < 0 || p.x >= got.f.trim[2] || p.y >= got.f.trim[3])
      if (off) throw new Error(`frame ${frame} is ${got.f.trim[2]} × ${got.f.trim[3]}, and has no pixel ${off.x}, ${off.y}`)
      const into = stroke(ed, got.entry.url)
      for (const p of pixels) setPixel(into, got.page, got.pageUrl, got.f, [p.x, p.y], colourFrom(p.colour))
      stroked(ed, got.entry.url)
      show(ed, { scene, sheet, frame: { url: got.entry.url, id: frame } })
      return { unsaved: unsaved(paintsOf(ed, got.entry.url)) }
    },
  })
  ed.command({
    id: 'sprites.undo',
    title: 'Sprites: undo a stroke',
    input: z.object(where).describe('Takes back the last stroke on the sheet not saved yet, a revert too, as the panel\'s Undo stroke does.'),
    run: ({ scene, sheet }) => {
      const { entry } = sheetEntry(ed, scene, sheet)
      if (!strokesOf(ed, entry.url).length) throw new Error(`${sheet} has no stroke to take back`)
      undoStroke(ed, entry.url)
      return { unsaved: unsaved(paintsOf(ed, entry.url)) }
    },
  })
  ed.command({
    id: 'sprites.revert',
    title: 'Sprites: revert',
    input: z.object(where).describe('Takes every pixel set on the sheet and not saved off, as a stroke sprites.undo takes back.'),
    run: ({ scene, sheet }) => {
      const { entry } = sheetEntry(ed, scene, sheet)
      revert(ed, entry.url)
      return { unsaved: 0 }
    },
  })
  ed.command({
    id: 'sprites.save',
    title: 'Sprites: save',
    input: z.object(where).describe('Writes the pixels set onto the sheet\'s own pages: one change the editor\'s Undo takes back.'),
    run: async ({ scene, sheet }, e) => {
      const { entry } = sheetEntry(ed, scene, sheet)
      const done = await saveSprites(ed, e, entry.url)
      return { files: done.files }
    },
  })
  ed.command({
    id: 'sprites.saveAs',
    title: 'Sprites: save as a copy',
    input: z.object({
      ...where,
      to: z.string().describe('the copy\'s sheet file, a path of the repo ending as the sheet\'s does; every pack and page of the sheet is written beside it, named after it'),
      name: z.string().optional().describe('the copy\'s entry in the catalogue; its file\'s name when left out'),
      add: z.boolean().default(true).describe('whether to add the entry to the scene\'s catalogue, drawn and loaded as the sheet is'),
      replace: z.boolean().default(false).describe('whether to write over files the copy would write that are there already'),
    }).describe('Writes a copy of the sheet with the pixels set, and adds an entry for it to the catalogue, which the panel then shows: one change the editor\'s Undo takes back.'),
    run: async ({ scene, sheet, to, name, add, replace }, e) => {
      const entryName = name ?? baseName(to).replace(/\.tsj$/i, '')
      const done = await saveSpritesAs(ed, e, { scene, sheet, to, name: entryName, add, replace })
      return { url: done.url, files: done.files, ...(add && { entry: entryName }) }
    },
  })
}

// ---------------------------------------------------------------- the Assets panel's commands

// `scene`'s catalogue: the file that gives it and its entries; a scene with no loader row refused,
// naming those that have one.
function catalogueAt(ed: Editor, scene: string) {
  ed.sceneOf(scene, 'loader')
  return catalogueOf(ed, scene)!
}
// Entry `name` of a catalogue; one it has not got refused, naming those it has.
function entryAt(scene: string, assets: Record<string, Asset>, name: string, type?: string): Asset {
  const names = type === undefined ? Object.keys(assets) : entryNames(assets, type)
  if (!names.includes(name)) throw new Error(`${scene}'s catalogue has no ${type === undefined ? 'entry' : `${type} entry`} ${name}: its ${type === undefined ? 'entries' : `${type} entries`} are ${names.join(', ') || 'none'}`)
  return assets[name]
}
// What trying an entry came to, as a call answers it: `trying` while the game has not answered.
const answered = (t: Game) => (t === 'trying' ? { trying: true } : t)
// A read-back, travelling clips left out, as a call answers it in brief: clean, how many problems,
// or why it could not be read.
const brief = (b: ReadBack | { error: string }) => ('error' in b ? `unread: ${b.error}` : b.problems.length ? `${b.problems.length} problem${b.problems.length === 1 ? '' : 's'}` : 'clean')
// The read-back of the sheet entry `a` with the travelling clips left out, or why it could not be read.
async function backOf(ed: Editor, a: Asset): Promise<ReadBack | { error: string }> {
  try {
    return travelled(await readBack(ed, a.url, await ed.text(pathOf(a.url))), travelIn(ed))
  } catch (e) {
    return { error: (e as Error).message }
  }
}
// The entry `name` a call wrote, as the file that gives the catalogue holds it now.
const writtenEntry = (ed: Editor, scene: string, name: string) => (ed.worldOf(scene, 'loader').value.assets as Record<string, Asset>)[name]

const scene = where.scene
const onMachine = z.string().describe('the absolute path of a sheet\'s .json on this machine')
const drawnLike = {
  name: z.string().optional().describe('its entry; named as its file when left out'),
  like: z.string().optional().describe('a sheet it is drawn as, nearest and facing; the first in its folder when left out'),
  preload: z.boolean().optional().describe('fetched before the first step; as that sheet when left out'),
}

function assetCommands(ed: Editor) {
  ed.command({
    id: 'loader.assets',
    title: 'Assets: catalogue',
    input: z.object({
      scene,
      name: z.string().optional().describe('one entry, shown as the panel shows it selected'),
    }).describe('A scene\'s catalogue as the Assets panel shows it: each entry\'s fields, whether it loads through its files and, while the game view shows the scene, through the game, and a sheet\'s read-back, travelling clips left out; or one entry, with its read-back\'s problems and its slices.'),
    run: async ({ scene, name }) => {
      const { file, assets } = catalogueAt(ed, scene)
      if (name !== undefined) entryAt(scene, assets, name)
      const s = ed.need()
      if (s.viewing === scene) await s.frame()
      const client = s.viewing === scene ? s.client : undefined
      const one = async (n: string) => {
        const a = assets[n], byGame = client && gameTried(ed, client, n)
        const loads = { files: await tried(ed, n, a), ...(client && { game: byGame === undefined ? 'untried' : answered(byGame) }) }
        return { name: n, entry: a, loads, ...(a.type === 'sheet' && { back: await backOf(ed, a) }) }
      }
      const game = client ? 'tried through the game view\'s loader too' : `the game view shows ${s.viewing ?? 'no scene'}, not ${scene}: its entries are tried through their files, as far as the editor can tell without the game`
      if (name !== undefined) {
        const got = await one(name)
        const a = assets[name]
        const slices = a.type === 'sheet' ? await sheetRead(ed, name, a).then(g => slicesOf(g.sheet), (e: Error) => e.message) : undefined
        return { scene, catalogue: file, game, travel: travelIn(ed), ...got, ...(slices !== undefined && { slices }) }
      }
      const entries = []
      for (const n of Object.keys(assets)) {
        const got = await one(n)
        entries.push({ ...got, ...(got.back && { back: brief(got.back) }) })
        await turn()
      }
      return { scene, catalogue: file, game, travel: travelIn(ed), entries }
    },
  })
  ed.command({
    id: 'loader.try',
    title: 'Assets: try entries',
    input: z.object({
      scene,
      names: z.array(z.string().describe('an entry of the scene\'s catalogue')).optional().describe('the entries; every one when left out'),
      by: z.enum(['files', 'game']).default('files').describe('files: read anew, as far as the editor can tell without the game, as Check again; game: by the game view\'s loader, which must show the scene, as Try every entry'),
    }).describe('Tries entries of a scene\'s catalogue anew, as the Assets panel does, and answers what each came to; by its files, a sheet\'s read-back too. The game tries only those it has not loaded.'),
    run: async ({ scene, names, by }) => {
      const { assets } = catalogueAt(ed, scene)
      for (const n of names ?? []) entryAt(scene, assets, n)
      const all = names ?? Object.keys(assets)
      if (by === 'game') {
        const client = await ed.need().clientOn(scene)
        const got = await tryInGame(ed, client, untried(ed, client, all))
        return { scene, by, entries: all.map(n => ({ name: n, ...answered(got.get(n) ?? gameTried(ed, client, n)!) })) }
      }
      readAgain(ed)
      const entries = []
      for (const n of all) {
        const a = assets[n]
        entries.push({ name: n, ...(await tried(ed, n, a)), ...(a.type === 'sheet' && { back: brief(await backOf(ed, a)) }) })
        await turn()
      }
      return { scene, by, entries }
    },
  })
  const loose = z.unknown()
  ed.command({
    id: 'loader.entry',
    title: 'Assets: entry',
    input: z.object({
      scene,
      name: z.string().describe('the entry; one the catalogue has not got is added'),
      entry: z.looseObject({
        type: loose.describe(`${TYPES.join(', ')}`),
        url: loose.describe('its file, from the repo\'s root: /games/…'),
        preload: loose.optional().describe('true: fetched before the first step'),
        for: loose.optional().describe('ui, for a file the ui draws'),
        nearest: loose.optional().describe('true: pixel art'),
        facing: loose.optional().describe('{ first, step, mirror }: turns run 0 faces, each run on, mirrored'),
        palette: loose.optional().describe('a palette entry it is drawn in'),
      }).nullable().describe('every field it is to have; null takes it out'),
    }).describe('Sets, adds or takes out an entry of a scene\'s catalogue, as the Assets panel does: each value that changes written by itself, one undo; refused where one is not what the loader reads. Answers the entry.'),
    run: async ({ scene, name, entry }, e) => {
      await written(e, entryEdits(ed, scene, name, entry))
      return { scene, name, entry: writtenEntry(ed, scene, name) ?? null }
    },
  })
  ed.command({
    id: 'loader.travel',
    title: 'Assets: travelling clip',
    input: z.object({
      clip: z.string().describe('a clip, of any sheet of the open game'),
      travels: z.boolean().describe('true: its frames move across the ground on purpose, so its neighbours are not compared; false: they are'),
    }).describe('Says a clip travels, or no more, as the Assets panel does, for the read-back of every sheet of the open game; kept in this browser. Answers the travelling clips.'),
    run: ({ clip, travels: on }) => {
      const got = travels(ed, clip, on)
      if ('why' in got) throw new Error(got.why)
      setTravel(ed, got.travel)
      return { travel: got.travel }
    },
  })
  ed.command({
    id: 'loader.look',
    title: 'Assets: look at a sheet',
    input: z.object({ path: onMachine }).describe('What a sheet on this machine is, before it is added or swapped in, as Add a sheet and Swap look: its frames, clips and their runs, slices, packs, and pages, each with whether its file is there.'),
    run: ({ path }) => look(path.trim()),
  })
  ed.command({
    id: 'loader.add',
    title: 'Assets: add a sheet',
    input: z.object({
      scene,
      from: onMachine,
      folder: z.string().optional().describe('the repo\'s folder it is copied into; where most sheets are when left out'),
      ...drawnLike,
      replace: z.boolean().default(false).describe('write over files there already'),
    }).describe('Copies a sheet on this machine, its packs and pages, into the repo, and adds an entry for it to a scene\'s catalogue, as Add a sheet does: one undo. Answers the entry and the files.'),
    run: async ({ scene, from, folder, name, like, preload, replace }, e) => {
      const { file, assets } = catalogueAt(ed, scene)
      const plan = addPlan(scene, assets, from, { folder, name, like, preload })
      if (plan.why) throw new Error(plan.why)
      const done = await addSheet(e, file, plan.entry, plan.from, plan.folder, plan.like, plan.loads, replace)
      return { name: plan.entry, entry: writtenEntry(ed, scene, plan.entry), files: done.files }
    },
  })
  ed.command({
    id: 'loader.swap',
    title: 'Assets: swap a sheet',
    input: z.object({
      scene,
      name: z.string().describe('a sheet entry of the scene\'s catalogue'),
      from: onMachine,
      replace: z.boolean().default(false).describe('write over files there already, which one of the entry\'s own file name needs'),
    }).describe('Copies a sheet on this machine beside a sheet entry\'s file, as Swap does: of the entry\'s own file name it writes over its files, which the game reads anew; else the entry\'s url is set to it. One undo. Answers the entry and the files.'),
    run: async ({ scene, name, from, replace }, e) => {
      const { file, entry } = sheetEntry(ed, scene, name)
      const plan = swapPlan(name, entry, from, replace)
      if (plan.why) throw new Error(plan.why)
      const done = await swapSheet(e, file, name, entry, plan.from, replace)
      return { name, entry: writtenEntry(ed, scene, name), over: plan.own, files: done.files }
    },
  })
  ed.command({
    id: 'loader.slice',
    title: 'Assets: slice a picture',
    input: z.object({
      scene,
      picture: z.string().describe('a pixels entry, frames lying loose on it'),
      tile: z.number().int().describe('a tile\'s width in pixels, even, 2 or more'),
      marks: z.array(z.string().regex(/^#[0-9a-f]{6}$/i).describe('#rrggbb')).default([]).describe('the ripper\'s lone bottom marks\' colours'),
      loose: z.number().int().min(0).default(0).describe('fewest pixels a sprite off the tiles is a frame with; 0, none'),
      into: z.string().optional().describe('the .json written, its page beside it'),
      ...drawnLike,
    }).describe('Cuts a picture entry into a sheet, as Slice does, and adds its entry: one undo. Answers it and the files.'),
    run: async ({ scene, picture, tile, marks, loose: fewest, into, name, like, preload }, e) => {
      const { file, assets } = catalogueAt(ed, scene)
      const a = entryAt(scene, assets, picture, 'pixels')
      const plan = slicePlan(scene, assets, a, { tile, into, name, like, preload })
      if (plan.why) throw new Error(plan.why)
      const done = await sliceSheet(e, file, plan.entry, pathOf(a.url), plan.into, { tile, marks: marks.map(m => parseInt(m.slice(1), 16)), loose: fewest }, plan.like, plan.loads)
      return { name: plan.entry, entry: writtenEntry(ed, scene, plan.entry), files: done.files }
    },
  })
}

// ---------------------------------------------------------------- the Sheets panel's commands

// The most pixels a side a picture of a clip is drawn: past it, one call would hold a picture the
// page cannot.
const SHOT = 4096
const at2 = (what: string) => z.tuple([z.number().describe(`${what} across, from the whole frame's left`), z.number().describe(`${what} down, from its top`)])

function sheetCommands(ed: Editor) {
  const clip = z.string().describe('a clip of the sheet, as sheets.clips lists them')
  const run = z.number().int().min(0).default(0).describe('its run')
  ed.command({
    id: 'sheets.clips',
    title: 'Sheets: clips',
    input: z.object({ ...where, clip: z.string().optional().describe('one clip, shown as the panel shows it') }).describe('A sheet\'s clips as the Sheets panel lists them: frames, how each plays, runs, flagged pairs; or one clip: its timed frames, each run\'s places with the game steps each shows, onionskin measures, flags and slice keys, where each frame stands, its ways and palettes.'),
    run: async ({ scene, sheet, clip: name }) => {
      const got = await sheetGot(ed, scene, sheet), s = got.sheet
      const shape = shapeOf(got.packs[0].json, got.entry.url) === 'tileset' ? 'tiles' : 'atlas'
      if (name === undefined) return {
        sheet, url: got.entry.url, shape, nearest: s.nearest, facing: s.facing, ...(s.palette !== undefined && { palette: s.palette }), slices: sliceNames(s),
        clips: Object.entries(s.clips).map(([n, c]) => ({
          clip: n, frames: new Set(c.runs[0]).size, plays: howPlays(got.tags.get(n), shape), runs: c.runs.length,
          flagged: c.runs.flatMap((_, k) => pairsOf(s, got.pages, n, k).filter(flagged)).length,
        })),
      }
      const c = clipIn(s, sheet, name)
      const dt = ed.need().rec.dt, steps = stepsOf(s, name, dt)
      const slices = sliceNames(s)
      return {
        clip: name, loop: c.loop, plays: howPlays(got.tags.get(name), shape), dt,
        frames: timedFrames(got, name),
        runs: c.runs.map((ids, k) => {
          const distinct = [...new Set(ids)], first = s.frames[distinct[0]]
          return {
            run: k,
            places: ids.map((id, i) => ({ place: i, id, ...(c.durations && { ms: ms(c.durations[i]), steps: steps![i] }) })),
            onion: distinct.map(id => {
              const f = s.frames[id], m = slip(got.pages[first.page], first, got.pages[f.page], f)
              return { id, miss: +m.miss.toFixed(3), dx: m.dx, dy: m.dy, verdict: verdict(m.miss) }
            }),
            flags: pairsOf(s, got.pages, name, k).filter(flagged).map(p => ({ from: p.from, to: p.to, apart: apart(p.slip), said: said(p) })),
            slices: Object.fromEntries(slices.map(n => [n, keyed(s, n, name)[k] ?? null])),
          }
        }),
        stands: [...new Set(c.runs.flat())].map(id => {
          const f = s.frames[id]
          return { id, anchor: f.anchor, size: f.size, kept: f.trim, rotated: f.rotated, lowestInk: inkBottom(drawnOf(got.pages[f.page], f, false).pixels) ?? null }
        }),
        ways: waysOf(s, name).map(w => ({ way: wayName(w), turns: w, ...pick(s, name, w) })),
        ...(s.palette !== undefined && { palettes: paletteChoices(s, await palettesOf(ed, sheetEntry(ed, scene, sheet).assets)) }),
      }
    },
  })
  ed.command({
    id: 'sheets.shot',
    title: 'Sheets: picture of a frame',
    input: z.object({
      ...where,
      clip,
      run,
      place: z.number().int().min(0).default(0).describe('the frame\'s place in the run'),
      mirror: z.boolean().default(false).describe('turned over left to right'),
      onion: z.boolean().default(false).describe('the run\'s onionskin instead'),
      palette: z.string().optional().describe('a palette swapped for the sheet\'s own'),
      zoom: z.number().int().min(1).max(32).optional().describe('pixels drawn per pixel; fits 800 when left out'),
      background: z.string().regex(/^#[0-9a-f]{6}$/i).optional().describe('#rrggbb drawn on; a checker when left out'),
    }).describe('A clip\'s frame as the Sheets panel draws it, a PNG: whole frame dashed, kept pixels boxed, slice keys, foot line and pivot; or the run\'s onionskin.'),
    run: async ({ scene, sheet, clip: name, run: k, place, mirror, onion: skinned, palette, zoom, background }) => {
      const got = await sheetGot(ed, scene, sheet), s = got.sheet
      const id = placeIn(s, sheet, name, k, place), ids = s.clips[name].runs[k]
      let colours: [number[], number[]] | undefined
      if (palette !== undefined) {
        if (s.palette === undefined) throw new Error(`${sheet} names no palette to swap for another`)
        const palettes = await palettesOf(ed, sheetEntry(ed, scene, sheet).assets), choices = paletteChoices(s, palettes)
        if (!choices.ok.includes(palette)) throw new Error(`${sheet} is not drawn in ${palette}: it may be drawn in ${choices.ok.join(', ') || 'none'}${choices.refused.map(([n, why]) => `; ${n}: ${why}`).join('')}`)
        if (palette !== s.palette) colours = [palettes.get(s.palette) as number[], palettes.get(palette) as number[]]
      }
      const drawn = (i: string) => drawnOf(got.pages[s.frames[i].page], s.frames[i], mirror, colours)
      const box = runBox(s, ids, mirror), across = Math.max(1, box[2] - box[0]), down = Math.max(1, box[3] - box[1])
      const z = zoom ?? Math.max(1, Math.floor((800 * 0.8) / Math.max(across, down)))
      const w = Math.ceil((across * z) / 0.8), h = Math.ceil((down * z) / 0.8)
      if (w > SHOT || h > SHOT) {
        const most = Math.floor((SHOT * 0.8) / Math.max(across, down))
        throw new Error(`a picture of ${name} at zoom ${z} is ${w} × ${h}, over ${SHOT} pixels a side: ${most ? `zoom ${most} is the largest that fits` : 'its run is drawn larger than that at any zoom'}`)
      }
      const picture = raster(w, h, 0)
      const root = getComputedStyle(document.documentElement)
      drawClip(picture.pen, picture.image, (v, or) => root.getPropertyValue(v).trim() || or, w, h, {
        look: { zoom: z, checker: background === undefined, colour: background ?? '', onion: skinned },
        box, now: drawn(id), skin: skinned ? onion([...new Set(ids)].map(i => layerOf(drawn(i)))) : undefined,
        sheet: s, json: got.packs[0].json, id, mirror,
      })
      return picture.png()
    },
  })
  // A Sheets edit: the sheet read, `make` its writes, written as one undo, and the sheet read again
  // for `answer`.
  const edit = async <T,>(e: Edits, scene: string, sheet: string, make: (got: Awaited<ReturnType<typeof sheetGot>>) => Write[], answer: (got: Awaited<ReturnType<typeof sheetGot>>) => T) => {
    await sheetWrite(e, make(await sheetGot(ed, scene, sheet)))
    return answer(await sheetGot(ed, scene, sheet))
  }
  ed.command({
    id: 'sheets.duration',
    title: 'Sheets: frame duration',
    input: z.object({
      ...where,
      clip,
      frame: z.number().int().min(0).optional().describe('the frame\'s place among the clip\'s timed frames, as sheets.clips lists them; every frame of a clip not timed when left out'),
      ms: z.number().int().min(1).describe('milliseconds it shows'),
    }).describe('Times a frame of a clip in every run, or every frame of a clip whose frames are not timed, as the Sheets panel does: one undo. Answers the clip\'s timed frames.'),
    run: ({ scene, sheet, clip: name, frame, ms: value }, e) =>
      edit(e, scene, sheet, got => durationEdit(got, sheet, name, frame, value), got => ({ clip: name, frames: timedFrames(got, name) })),
  })
  ed.command({
    id: 'sheets.tag',
    title: 'Sheets: how a clip plays',
    input: z.object({
      ...where,
      clip,
      direction: z.enum(DIRECTIONS as [string, ...string[]]).optional().describe('the way its frames play'),
      repeat: z.number().int().min(0).optional().describe('times it plays; 0 round forever'),
    }).describe('Sets how a clip plays, every run\'s tag\'s direction or repeat, as the Sheets panel does: one undo. Answers how it plays and its places.'),
    run: ({ scene, sheet, clip: name, direction, repeat }, e) => {
      if (direction === undefined && repeat === undefined) throw new Error('name a direction, a repeat, or both')
      return edit(e, scene, sheet, got => [
        ...(direction !== undefined ? tagEdit(got, sheet, name, 'direction', direction) : []),
        ...(repeat !== undefined ? tagEdit(got, sheet, name, 'repeat', repeat) : []),
      ], got => ({ clip: name, plays: howPlays(got.tags.get(name), 'atlas'), loop: got.sheet.clips[name].loop, places: got.sheet.clips[name].runs[0] }))
    },
  })
  ed.command({
    id: 'sheets.anchor',
    title: 'Sheets: where a frame stands',
    input: z.object({
      ...where,
      frame: z.string().describe('a frame of the sheet, as sprites.frames lists them'),
      at: at2('pixels').optional().describe('the point of its whole frame it stands on'),
      by: z.tuple([z.number().int().describe('pixels right'), z.number().int().describe('pixels down')]).optional().describe('moves it, from its whole pixel on pixel art'),
    }).describe('Stands a frame on a point of its whole frame, or nudges it, as the Sheets panel\'s anchor does: its pivot a number at a time, one undo. Answers where it stands.'),
    run: ({ scene, sheet, frame, at, by }, e) => {
      if ((at === undefined) === (by === undefined)) throw new Error('name where it stands, at, or how far it moves, by: one of the two')
      return edit(e, scene, sheet, got => {
        frameIn(got.sheet, sheet, frame)
        return anchorEdit(got, sheet, frame, at ?? nudged(got.sheet, frame, by!))
      }, got => ({ frame, anchor: got.sheet.frames[frame].anchor }))
    },
  })
  ed.command({
    id: 'sheets.pivot',
    title: 'Sheets: a clip\'s pivot',
    input: z.object({ ...where, clip, at: at2('pixels').describe('the point of each whole frame they stand on') }).describe('Stands every frame of a clip on one point of its whole frame, as the Sheets panel\'s pivot does: one undo. Answers where each stands.'),
    run: ({ scene, sheet, clip: name, at }, e) =>
      edit(e, scene, sheet, got => pivotEdit(got, sheet, name, at), got => ({ clip: name, stands: [...new Set(got.sheet.clips[name].runs.flat())].map(id => ({ id, anchor: got.sheet.frames[id].anchor })) })),
  })
  ed.command({
    id: 'sheets.settle',
    title: 'Sheets: settle a frame',
    input: z.object({ ...where, clip, run, to: z.number().int().min(0).describe('the place of the frame one drawing apart from the one before it') }).describe('Settles a frame one drawing apart from the one before it back onto it, as the Sheets panel\'s Settle does: moved by the shift that lays it there, one undo. Answers the run\'s flags left.'),
    run: ({ scene, sheet, clip: name, run: k, to }, e) =>
      edit(e, scene, sheet, got => settleEdit(got, got.pages, sheet, name, k, to), got => ({ clip: name, run: k, flags: pairsOf(got.sheet, got.pages, name, k).filter(flagged).map(said) })),
  })
  ed.command({
    id: 'sheets.slice',
    title: 'Sheets: key a slice',
    input: z.object({
      ...where,
      clip,
      run,
      place: z.number().int().min(0).describe('the frame\'s place in the run'),
      slice: z.string().describe('a slice; one the sheet has not got is made'),
      at: z.tuple([z.number().int().describe('across, from the whole frame\'s left, unmirrored'), z.number().int().describe('down, from its top')]).describe('the pixel it is keyed at'),
    }).describe('Keys a slice on a frame at a pixel, as a pixel clicked in the Sheets panel does: the run\'s key moved there, or one put in, one undo. Answers the frame each run is keyed on.'),
    run: ({ scene, sheet, clip: name, run: k, place, slice, at }, e) =>
      edit(e, scene, sheet, got => sliceKeyEdit(got, sheet, name, k, place, slice, at), got => ({ slice: slice.trim(), clip: name, keyed: keyed(got.sheet, slice.trim(), name).map(f => f ?? null) })),
  })
}
