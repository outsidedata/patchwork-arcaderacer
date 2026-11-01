// particle2d's extension: the Effects panel, the Fire Effect tool, and the types of an effects file's
// fields (`particle2d.plugin.ts` says what the file holds and what every emitter field means). The
// panel, the tool and the types are the same for particle3d, whose extension
// (`plugins/particle3d/particle3d.extension.tsx`) makes them with `effects` and its own `Space`: the
// plugin, the renderer its particles are drawn by, the units of its lengths, the file's own fields,
// and how the preview aims and ends a beam in its space. What follows is said of particle2d; for
// particle3d read its name, and render3d for render2d.
//
// The panel (`particle2d.components.tsx`) works on the effects file of the scene selected, else of the
// one the game view shows, else of the first scene that names particle2d in its `plugins`: the json
// entry of that scene's catalogue its `world.particle2d.effects` names, in the scene's file or else
// the game's, as a child's `world` is the manager's with its own over it. The panel shows the file's own fields (particle2d's `cap`, `layer` and `ppm`; particle3d's
// `cap`, `alphaTest` and `ppm`), and every effect, filtered by name, with how many layers it has and
// how many places name it; one is selected. The selected effect's layers are a list: each emitter
// shows its set fields by their meaning, with a strip of what one particle does over its life, and a
// field it does not set is added with the value the plugin reads when it is left out, but `lasts`,
// added true; an `{ effect }` layer names another effect, and its `at` off the point. Every change
// is written into the file a value at a time, and is one undo:
//   - a field, a layer dropped or added, a file number: that one value;
//   - layers reordered: each layer whose place changed, set whole in its new place;
//   - a field added whose meaning needs another (a `sheet` needs a `clip`), or removed with the one
//     that needs it (a `clip` or a `play` with its `sheet`): both;
//   - `life` added to a layer that `lasts`, or `lasts` to one with a `life`: the one in, the other
//     out, since a layer has one of the two; the one it has has no remove;
//   - an effect added: one emitter under its name; removed: its key, once the panel has said which
//     `{ effect }` layers and which data files name it; renamed: its layers set under the new name,
//     which goes to the end of `effects`, the old key removed, and every `{ effect }` layer that named
//     the old name made to name the new. A name already taken is refused.
// Where an effect is named: every `{ effect }` layer of the file, and every string value equal to the
// name in any other json entry of the scene's catalogue, each with its path from that file's top.
//
// The preview. While the game view shows the panel's scene and the panel is open, the selected
// effect is emitted through the view's client's particle2d, the page's own effect and never a row, at
// the loop's point: the last point the Fire Effect tool was pressed at on that scene, else the ground
// under the middle of the view. With Loop on it is emitted again after the first frame of the editor's
// clock (`Session.onFrame`) that finds it no longer on the plugin's ledger, so an edit to the file, which the datafiles extension refills the plugin's copy
// of, shows on the next emit. Fire Once emits it once more. The spawn is the panel's: `dir` from a
// dial, a bearing clockwise from up the screen (particle3d's a vector of the world); `to` the loop's
// point moved by an offset in world units, for an effect with a beam, which throws without one; a
// `tint` for the layers that set none; `scale`; `life`, the seconds an effect with `every` or a layer
// that `lasts` goes on; and a `seed`, so every emit throws the same particles, else each its own. An
// effect that would throw as the plugin runs it (one it names is missing, it is made of itself, a
// layer has both or neither of `life` and `lasts`, it draws a sheet with no `ppm` in the file, or a
// clip its sheet does not have, or a sheet that is no sheet entry) is not emitted, and the panel says
// why; one whose sheet's file has not been read yet waits for it. The point, and the end of a beam,
// are marked on the stage. The spawn and the selection are this viewer's own, kept in localStorage.
//
// The Fire Effect tool (X; particle3d's Fire Effect 3D, Z) fires the selected effect at the ground
// point pressed on, and makes that point the loop's.
//
// What the panel's buttons, its list and the tool do is done by functions here, which they and the
// commands call alike: the file read as `effectsIn` reads it; a field of the file's own set, or left
// out, by `fileEdits`; an effect added, its layers set, or taken out by `effectEdits`, and its
// layers, whether the list adds, drops or moves one or a layer's field is set, added or taken out,
// written as the editor's `listEdits` writes a list; renamed by `renamed`; each change written as one
// by the editor's `written`; and an effect emitted as `firing` emits it. What other extensions read
// the same way is theirs: a sheet's clips, where a name is named across the catalogue, and how a file
// of named lists, as the effects file is, is read, written and answered for by the panel and the
// commands are the loader's (`clipsIn`, `surveyedReady`, `namedLists`, `putEdits`), a scene's render2d
// layers render2d's (`layersOf`), the client a preview is drawn with the session's
// (`Session.clientOn`), and a theme's colours the design system's (`themed`).
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here, on the
// effects file of any scene that draws particle2d's effects, whatever the game view shows (particle3d's
// are the same, named `particle3d.*`, in its space):
//   particle2d.effects  the scenes that draw effects and each one's file; or a scene's: its file's own
//                       fields, and every effect as the panel lists it, with how many layers it has,
//                       how many places name it and why it would not be emitted; or one effect as
//                       the panel shows it selected: its layers, where it is named, why it would not
//                       be emitted, whether it draws a beam and whether its spawn's life says how long
//                       it goes on;
//   particle2d.effect   an effect's layers set, written as the list and the layer's fields write them,
//                       the effect added with them when the file has none of its name, or it taken out,
//                       which is refused while a layer or a data file names it unless the call says
//                       `anyway`, as Remove anyway does; a layer that is none the plugin reads is
//                       refused, naming the fields it reads, and so is one that would make the effect
//                       throw as the plugin runs it (every reason `survey` gives, each sheet it draws
//                       read first) for a reason it did not have;
//   particle2d.rename   an effect renamed, with every `{ effect }` layer that names it;
//   particle2d.file     a field of the file's own set, or left out where it may be, held to what the
//                       panel's field for it may be;
//   particle2d.fire     an effect fired once at a world point, as Fire Once and the tool fire it, with
//                       the spawn the call hands it in place of the panel's. It is a preview, so the
//                       game view must show the scene; a frame is drawn first where none has mounted
//                       the view's client yet, as before the clock's next frame or with no clock.
// Each write is one undo, answering the state it left.
//
// The types, wherever the file is shown (every effects file a `world.particle2d` of the open game
// names, `bindFile`):
//   particle2d.range    `n`, `life`, `size` and `speed`: [min, max], min kept at or under max, whole
//                       numbers for `n`, over a bar of the span;
//   particle2d.opacity  `a0` and `a1`: a slider from 0 to 1;
//   particle2d.clip     `clip`: a clip of the layer's sheet, read through the scene's catalogue;
//   particle2d.effect   an `{ effect }` layer's `effect`: an effect of the file;
//   particle2d.layer    the file's `layer`: a layer of the scene's `world.render2d`;
// and `tint`, `tint1` a colour, `spread`, `spin` an angle, `cap` an integer, `sheet` a sheet of the
// catalogue (`loader.sheet`). particle3d's are `particle3d.range`, `.opacity`, `.clip` and `.effect`,
// and its `alphaTest` is an opacity.
import type { ComponentType } from 'react'
import { z } from 'zod'
import { looseInput, OUTLINE, strictFields, written, type Editor, type FieldProps, type Pointer } from '#editor/editor.ts'
import type { Session } from '#editor/session.ts'
import { themed } from '#editor/ui/theme.ts'
import type { Plugins } from '#engine/browser.ts'
import { clipsIn, namedLists, surveyedReady, valueAt, type Edit, type Lister } from '#plugins/loader/loader.extension.tsx'
import type { Entry } from '#plugins/loader/loader.sim.ts'
import { layersOf } from '#plugins/render2d/render2d.extension.tsx'
import { FIELDS, type Effect, type Emitter, type Layer } from './particle2d.plugin.ts'
import { Clip, EffectName, Effects as Panel, LayerName, Opacity, Range } from './particle2d.components.tsx'

export type Asset = Entry
type V2 = [number, number]

// An effects file, particle2d's or particle3d's: the fields they share, and the file's own.
export type Effects = { cap: number; ppm?: number; effects: Record<string, Layer[]>; [own: string]: unknown }

// ---------------------------------------------------------------- the space

// What the panel, the tool and the types are made with for one plugin: its name, the renderer it
// draws on, the Fire Effect tool's title and key, the units its lengths are in, the fields of its
// file the panel shows, the emitter a new effect has, the preview's first spawn, and how the
// preview's spawn aims and ends a beam in its space.
export type Space = {
  plugin: string
  renderer: string
  title: string
  tool: { title: string; key: string }
  // A length's unit, as a label shows it, and the words for where a direction is.
  unit: string
  where: string
  // The count of numbers a point, a direction and an offset have.
  axes: 2 | 3
  file: FileSpec[]
  emitter: Emitter
  spawn: Spawn
  // The direction the preview throws along, and a beam's end off the point `at`.
  dir(sp: Spawn): number[]
  to(at: number[], sp: Spawn): number[]
}
// A field of the file: its label and what it is; the type it is bound to; and, for one that may be
// left out, what the panel says it is then and the value setting it writes. `value` is every value
// the panel's field for it may be, which `must` says in words, and `choices`, when given, the names
// it may be of those.
export type FileSpec = {
  key: string; title: string; type?: string; absent?: { note: string; set: unknown }
  value: z.ZodType; must: string; choices?(ed: Editor, w: Where): string[]
}

// particle2d's: on render2d's stage, in its pixels.
export const SPACE: Space = {
  plugin: 'particle2d',
  renderer: 'render2d',
  title: 'Effects',
  tool: { title: 'Fire Effect', key: 'X' },
  unit: 'px',
  where: 'a vector on the stage',
  axes: 2,
  file: [
    { key: 'cap', title: 'the most particles a page draws at once', type: 'integer', value: z.number().int().min(0), must: 'a whole number, 0 or more' },
    { key: 'layer', title: 'the render2d layer the particles are drawn on', type: 'particle2d.layer', value: z.string(), must: 'a layer of the scene\'s render2d', choices: (ed, w) => layersOf(ed, w.scene) },
    { key: 'ppm', title: 'pixels of a sheet per pixel of the stage', absent: { note: 'none: a layer drawn from a sheet needs one', set: 1 }, value: z.number().positive(), must: 'a number above 0' },
  ],
  // A burst of flat squares thrown every way that fade out, so it shows when previewed.
  emitter: { n: [8, 12], life: [0.4, 0.8], size: [2, 3], speed: [40, 120], a1: 0 },
  spawn: { angle: 90, aim: [], to: [120, 0], scale: 1, life: 1 },
  dir: sp => along(sp.angle),
  to: (at, sp) => [at[0] + sp.to[0], at[1] + sp.to[1], at[2] ?? 0],
}

// ---------------------------------------------------------------- the emitter's fields

// Each field of an emitter, in the order the plugin's header gives them: its label with its unit,
// what it is, the type it is bound to when its shape does not say, and the value the plugin reads
// when the layer leaves it out, which is what adding it writes (`lasts` is added true).
export type Spec = { key: keyof Emitter; label: string; title: string; type?: string; absent(l: Emitter, c: Context): unknown }
// What a field's value when left out depends on: the catalogue's sheets, the clips of the layer's
// sheet, and the preview's direction.
export type Context = { sheets: string[]; clips: string[] | undefined; dir: number[] }

// The fields of an emitter of `space`, in its units.
export function specs(space: Pick<Space, 'plugin' | 'unit' | 'where' | 'axes'>): Spec[] {
  const { plugin: p, unit: u, where, axes } = space
  const zero = Array<number>(axes).fill(0)
  return [
    { key: 'n', label: 'n', title: 'particles a burst', type: `${p}.range`, absent: () => [1, 1] },
    { key: 'every', label: 'every (s)', title: 'one more burst this many seconds after each, while the effect lasts; 0 for one', absent: () => 0 },
    { key: 'after', label: 'after (s)', title: 'the seconds into the effect its first burst is thrown', absent: () => 0 },
    { key: 'life', label: 'life (s)', title: 'seconds a particle lives', type: `${p}.range`, absent: () => [0.5, 1] },
    { key: 'lasts', label: 'lasts', title: 'it lives until its effect\'s life is over, in place of a life', absent: () => true },
    { key: 'skip', label: 'skip (s)', title: 'a particle starts up to this many seconds into its life', absent: () => 0 },
    { key: 'sheet', label: 'sheet', title: 'the sheet its frames are from; without one a particle is a flat square', type: 'loader.sheet', absent: (_, c) => c.sheets[0] },
    { key: 'clip', label: 'clip', title: 'the clip of the sheet played over its life', type: `${p}.clip`, absent: (_, c) => c.clips?.[0] },
    { key: 'play', label: 'play', title: 'its clip played at the sheet\'s own frame times from its birth, not evenly over its life', absent: () => false },
    { key: 'size', label: 'size (×)', title: `times its frame, or one ${u === 'px' ? 'pixel' : 'metre'}`, type: `${p}.range`, absent: () => [1, 1] },
    { key: 'grow', label: 'grow (×)', title: 'its size at death, times its size at birth', absent: () => 1 },
    { key: 'dir', label: 'dir', title: `the way it is thrown, ${where}; else the spawn's`, absent: (_, c) => c.dir },
    { key: 'spread', label: 'spread (°)', title: 'the most off dir either way; left out, any way at all', type: 'angle', absent: () => Math.PI },
    { key: 'speed', label: `speed (${u}/s)`, title: `${u === 'px' ? 'stage pixels' : 'metres'} a second it is thrown at`, type: `${p}.range`, absent: () => [0, 0] },
    { key: 'jitter', label: `jitter (${u})`, title: 'how far it starts off the point, per axis', absent: () => zero },
    { key: 'box', label: `box (${u})`, title: 'its first corner then its last, off the point: it starts at a point rolled evenly in it', absent: () => [...zero, ...zero] },
    { key: 'g', label: `g (${u}/s²)`, title: `down${u === 'px' ? ' the stage' : ''}; negative rises`, absent: () => 0 },
    { key: 'drag', label: 'drag (/s)', title: 'the fraction of its speed shed a second', absent: () => 0 },
    { key: 'pull', label: `pull (${u}/s²)`, title: 'toward the point it was thrown from; negative away', absent: () => 0 },
    { key: 'pace', label: 'pace', title: '[[seconds, k], ...]: from each of its seconds on it goes k times as far a step', absent: () => [[0, 1]] },
    { key: 'follow', label: 'follow', title: 'it keeps its place about the effect\'s point as the point moves', absent: () => false },
    { key: 'flips', label: 'flips', title: '[[seconds, x, y], ...]: from each of its seconds on, mirrored across when x is 1, upside down when y is 1', absent: () => [[0, 0, 0]] },
    { key: 'tint', label: 'tint', title: 'its colour; else the spawn\'s, else white', type: 'color', absent: () => 0xffffff },
    { key: 'tint1', label: 'tint1', title: 'the colour it has cooled to at death', type: 'color', absent: l => l.tint ?? 0xffffff },
    { key: 'gain', label: 'gain (×)', title: 'times its colour\'s light; above 1 brighter than white, which a renderer that blooms spills round it', absent: () => 1 },
    { key: 'a0', label: 'a0', title: 'its opacity at birth', type: `${p}.opacity`, absent: () => 1 },
    { key: 'a1', label: 'a1', title: 'its opacity at death', type: `${p}.opacity`, absent: () => 1 },
    { key: 'fade', label: 'fade (s)', title: 'the seconds before death it goes from a0 to a1 over, holding a0 until then; left out, its whole life', absent: l => l.life?.[1] ?? 1 },
    { key: 'spin', label: 'spin (°/s)', title: 'the most it turns a second, either way; left out, it stands upright', type: 'angle', absent: () => 0 },
    { key: 'origin', label: 'origin (w, h)', title: 'the point of it on its place, as fractions of its width and height', absent: l => (l.stretch ? [1, 0.5] : [0.5, 0.5]) },
    { key: 'add', label: 'add', title: 'drawn adding its light', absent: () => false },
    { key: 'stretch', label: 'stretch', title: 'turned along the way it goes, its head on its place', absent: () => false },
    { key: 'face', label: 'face', title: 'turned along the effect\'s dir', absent: () => false },
    { key: 'beam', label: 'beam', title: 'drawn from the effect\'s point to its to', absent: () => false },
  ]
}
// A field whose meaning needs another: offered only while the layer has that one, and removed with
// it; and of those, the ones it cannot do without, added with it.
export const NEEDS: Partial<Record<keyof Emitter, keyof Emitter>> = { clip: 'sheet', play: 'sheet' }
export const BOUND: (keyof Emitter)[] = ['clip']
// The two fields a layer has one of: adding the one takes the other out, and the one it has has no
// remove.
export const EITHER: (keyof Emitter)[] = ['life', 'lasts']

// ---------------------------------------------------------------- where the effects are

// The scene a panel works on, the `world.<plugin>` it reads, the file that names (by its path from the
// repo, and its name in the catalogue), the scene's catalogue, and the space it is drawn in.
export type Where = { scene: string; world: { effects: string }; name: string; path: string; assets: Record<string, Asset>; space: Space }

const pathOf = (url: string) => url.replace(/^\//, '')

// Whether a scene draws effects of `space`'s plugin, and where from.
export function whereIn(ed: Editor, scene: string, space: Space): Where | undefined {
  const s = ed.session
  if (!s) return undefined
  const file = s.files.get(s.path(scene))
  if (!file?.plugins?.includes(space.plugin)) return undefined
  const world = (file.world?.[space.plugin] ?? s.game.file.world?.[space.plugin]) as { effects: string } | undefined
  if (!world) return undefined
  const assets = ((file.world?.loader ?? s.game.file.world?.loader)?.assets ?? {}) as Record<string, Asset>
  const entry = assets[world.effects]
  if (!entry || entry.type !== 'json') return undefined
  return { scene, world, name: world.effects, path: pathOf(entry.url), assets, space }
}

// The scenes of the open game that draw `space`'s effects, in the scene table's order.
export function drawing(ed: Editor, space: Space): Where[] {
  const s = ed.session
  if (!s) return []
  return [...s.scenes().keys()].flatMap(n => whereIn(ed, n, space) ?? [])
}

// The effects a panel works on: of the scene selected, else of the one the game view shows, else of
// the first that draws effects.
export function focus(ed: Editor, space: Space): Where | undefined {
  const all = drawing(ed, space)
  const sel = ed.selection && 'scene' in ed.selection ? ed.selection.scene : undefined
  return all.find(w => w.scene === sel) ?? all.find(w => w.scene === ed.session?.viewing) ?? all[0]
}

// The effects a field of `owner` names from: the file itself when it is an effects file, else the
// file of the owner's scene, else of the scene the panel works on.
export function whereFor(ed: Editor, owner: FieldProps['owner'], space: Space): Where | undefined {
  const all = drawing(ed, space)
  return (owner.file ? all.find(w => w.path === owner.file) : undefined) ?? (owner.scene ? all.find(w => w.scene === owner.scene) : undefined) ?? focus(ed, space)
}

// An effects file as the panel and the commands read and write it, as the loader reads and writes a
// file of named lists (`namedLists`): an effect a list of layers, an `{ effect }` layer naming another.
const EFFECTS = namedLists<Effects, Layer>({ key: 'effects', ref: 'effect', noun: 'effect', a: 'an effect' })

// An effects file's text as the panel and the commands read it, or why it holds no effects.
export const effectsIn = EFFECTS.read

// The layers of effect `name` of the file at `path`, refused, naming its effects, when it has none of
// that name.
export const effectIn = EFFECTS.entry

// ---------------------------------------------------------------- reading the file

// A layer's `{ effect }`, or undefined for an emitter.
export const named = EFFECTS.named

// The value at `at` inside `v`, or undefined (the loader's).
export { valueAt }

// What running an effect takes, found as the plugin opens its `{ effect }` layers out: its emitters,
// whether one draws a beam (so its spawn needs a `to`), and whether its spawn's `life` says how long
// it goes on (a layer bursts `every` so often, or `lasts`), the sheets whose files it needs read
// before it can be checked, and every reason it would throw or draw nothing as the plugin runs it.
export type Survey = { emitters: Emitter[]; beam: boolean; lives: boolean; waiting: string[]; problems: string[] }

// A layer that is not what `space`'s plugin reads, a field of the wrong shape or one it has not got,
// is a problem, said as the commands refuse it (`layerShapes`), and it is opened no further.
export function survey(file: Effects, name: string, assets: Record<string, Asset>, clipsOf: (sheet: string) => string[] | undefined, space: Pick<Space, 'plugin' | 'axes'>): Survey {
  const out: Survey = { emitters: [], beam: false, lives: false, waiting: [], problems: [] }
  const shape = shapeOf(space)
  const open = (n: string, path: string[]) => {
    if (path.includes(n)) return void out.problems.push(`${n} is made of itself: ${[...path, n].join(' > ')}`)
    const layers = Object.hasOwn(file.effects, n) ? file.effects[n] : undefined
    if (!layers) return void out.problems.push(path.length ? `${path[path.length - 1]} names ${n}, which there is none of` : `there is no effect ${n}`)
    layers.forEach((l, i) => {
      const got = shape.safeParse(l)
      if (!got.success) return void out.problems.push(...got.error.issues.map(q => `layer ${i} of ${n}${q.path.length ? ` ${q.path.join('.')}` : ''}: ${q.message}`))
      const e = named(l)
      if (e !== undefined) open(e, [...path, n])
      else out.emitters.push(l as Emitter)
    })
  }
  open(name, [])
  for (const l of out.emitters) {
    if (l.beam) out.beam = true
    if (l.every || l.lasts) out.lives = true
    if (Array.isArray(l.life) === !!l.lasts) out.problems.push(l.lasts ? 'a layer has a life and lasts' : 'a layer has no life and does not last')
    if (l.sheet === undefined) continue
    if (!file.ppm) out.problems.push(`a layer draws from ${l.sheet}, and the file gives no ppm`)
    if (assets[l.sheet]?.type !== 'sheet') {
      out.problems.push(`${l.sheet} is no sheet entry of the catalogue`)
      continue
    }
    const clips = clipsOf(l.sheet)
    if (!clips) {
      if (!out.waiting.includes(l.sheet)) out.waiting.push(l.sheet)
      continue
    }
    if (l.clip === undefined || !clips.includes(l.clip)) out.problems.push(`a layer plays clip ${l.clip} of ${l.sheet}, which it does not have`)
  }
  out.problems = [...new Set(out.problems)]
  return out
}

// Every place that names the effect `name`: the `{ effect }` layers of its own file, and every string
// value equal to it in the other files, each a parsed json entry of the catalogue (the loader's
// `namedIn`).
export const namings = EFFECTS.namings

// Where every effect of the file is named, by name, each file walked once for all of them and kept
// until the file or one of the other files is another (the loader's `namingsOf`): what the panel
// counts.
export const namingsOf = EFFECTS.namingsOf

// The edits that rename effect `from` to `to`: every `{ effect }` layer naming it made to name `to`,
// its layers set under `to`, and `from` removed.
export const renaming = EFFECTS.renaming

// ---------------------------------------------------------------- writing the file

// One value written into a file, as the editor writes it (`FileEdit`); a change is written as one by
// the editor's `written` (the loader's).
export type { Edit }

// The edits that set the layers of effect `name` of the file at `path` as the panel's list writes
// them, whether it adds, drops or moves a layer or a layer's field is set, added or taken out (the
// editor's `listEdits`); or, when the file has no effect of that name, add it with them at the end
// of `effects`; or with null take it out, refused, naming the effects, when there is none of it.
export const effectEdits = EFFECTS.edits

// The edits that rename effect `from` to `to` (`renaming`), none when that is its name already:
// refused when there is no effect `from`, when `to` is empty, and when another effect has it.
export const renamed = EFFECTS.renamed

// The edit that sets field `f` of the file's own at `w`, or leaves it out when `value` is undefined:
// one that may not be left out is refused, and so is a value the panel's field for it could not be,
// saying what it may be. One left out that the file has not got is no edit.
export function fileEdits(ed: Editor, w: Where, file: Effects, f: FileSpec, value: unknown): Edit[] {
  if (value === undefined) {
    if (!f.absent) throw new Error(`${f.key} may not be left out of ${w.path}`)
    return f.key in file ? [{ file: w.path, at: [f.key], value: undefined }] : []
  }
  if (!f.value.safeParse(value).success) throw new Error(`${f.key} is ${f.must}, not ${JSON.stringify(value)}`)
  const choices = f.choices?.(ed, w)
  if (choices && !choices.includes(value as string)) throw new Error(`${f.key} is ${f.must}: ${choices.length ? `${choices.join(', ')}, not ${value}` : `${w.scene}'s has none`}`)
  return [{ file: w.path, at: [f.key], value }]
}

// What `survey` says of effect `name` of the file at `w` for a command, which waits on no sheet:
// every sheet it draws from read first (the loader's `clipsReady`), and one that still has no clips a problem,
// since it does not read as a sheet.
export const surveyed = (ed: Editor, w: Where, file: Effects, name: string): Promise<Survey> =>
  surveyedReady(ed, w.assets, clipsOf => survey(file, name, w.assets, clipsOf, w.space))

// ---------------------------------------------------------------- one particle's life

const mix = (a: number, b: number, k: number) => {
  const c = (s: number) => {
    const x = (a >> s) & 255, y = (b >> s) & 255
    return Math.round(x + (y - x) * k) << s
  }
  return c(16) | c(8) | c(0)
}

// What a particle of an emitter that lives `life` seconds, its longest life when left out, is at `k`
// of it, as the plugin draws it: its colour from `tint` (else the spawn's, else white) to `tint1`,
// its opacity from `a0` to `a1` holding until `fade` before its death, and its size from 1 to `grow`.
// A layer that lasts is handed the life its effect is previewed with.
export function sample(l: Emitter, tint: number | undefined, k: number, life = l.life?.[1] ?? 0): { color: number; alpha: number; size: number } {
  const from = l.tint ?? tint ?? 0xffffff
  const fading = l.fade === undefined ? k : Math.max(0, 1 - (life - k * life) / l.fade)
  const a0 = l.a0 ?? 1, a1 = l.a1 ?? 1
  return { color: l.tint1 === undefined ? from : mix(from, l.tint1, k), alpha: a0 + (a1 - a0) * fading, size: 1 + ((l.grow ?? 1) - 1) * k }
}

// Round values from 0 to `span`, about `n` of them: steps of 1, 2 or 5 times a power of ten.
export function marks(span: number, n = 4): number[] {
  if (!(span > 0)) return [0]
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p
  const step = p * (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10)
  const out: number[] = []
  for (let v = 0; v <= span + step * 1e-9; v += step) out.push(+v.toPrecision(12))
  return out
}

// ---------------------------------------------------------------- the preview

// The spawn the preview emits with: particle2d's `angle`, the bearing of its dir in degrees
// clockwise from up the screen, or particle3d's `aim`, its dir in the world; `to` a beam's end as an
// offset from the point in world units; and `tint` and `seed` when set.
export type Spawn = { angle: number; aim: number[]; to: number[]; tint?: number; scale: number; life: number; seed?: number }

// The stage direction a bearing points: 0 up the screen, 90 right.
// A nine-place figure, so a right angle's cosine is 0, and never −0.
export const along = (angle: number): V2 => {
  const a = (angle * Math.PI) / 180
  const r = (v: number) => Math.round(v * 1e9) / 1e9 + 0
  return [r(Math.sin(a)), r(-Math.cos(a))]
}

// What an effect is emitted with besides its point, in the plugin's own terms: the direction a layer
// that gives none throws along, where a beam ends from the point, the tint of the layers that set
// none, its scale, the seconds it goes on, and the seed of its rolls.
export type Emit = { dir: number[]; to(at: number[]): number[]; tint?: number; scale: number; life: number; seed?: number }

// Emitting effect `name` of `file` at the point `at` through the plugins of a client, as the preview,
// the tool and `fire` emit it: its life only for an effect whose spawn's life says how long it goes on,
// and a `to` only for one that draws a beam; or why it is not, when it would throw as the plugin runs
// it, waits for a sheet to be read, or has no point.
export function firing(plugins: Plugins, space: Space, file: Effects, assets: Record<string, Asset>, name: string, at: number[] | undefined, emit: Emit, clipsOf: (sheet: string) => string[] | undefined): { go: () => Effect } | { why: string } {
  const sv = survey(file, name, assets, clipsOf, space)
  if (sv.problems.length) return { why: `${name} is not emitted: ${sv.problems.join('; ')}` }
  if (sv.waiting.length) return { why: `${name} waits for ${sv.waiting.join(', ')} to be read` }
  if (!at) return { why: 'the view has no ground to emit on yet' }
  return {
    go: () => plugins[space.plugin].emit(name, at, {
      dir: emit.dir,
      scale: emit.scale,
      life: sv.lives ? emit.life : 0,
      ...(sv.beam ? { to: emit.to(at) } : {}),
      ...(emit.tint !== undefined ? { tint: emit.tint } : {}),
      ...(emit.seed !== undefined ? { seed: emit.seed } : {}),
    }),
  }
}

// ---------------------------------------------------------------- the commands' layers

// What the plugin of `space` reads in a layer, as a call hands it (the editor's `looseInput`), a
// field at a time: an emitter's every field, a direction, a jitter and a box of the space's count of
// numbers, a [min, max] its min at or under its max, whole for `n`, a colour and an opacity from 0 to
// 1; or an `{ effect }`, thrown from its `at`, a point of the space. A field of neither is refused,
// naming the fields. Which of `life` and `lasts` a layer has is `survey`'s to say.
export function layerShapes(space: Pick<Space, 'plugin' | 'axes'>) {
  const a = space.axes
  const vec = (k: number) => z.array(z.number()).length(k)
  const range = (item: z.ZodNumber) => z.array(item).length(2).refine(([lo, hi]) => lo <= hi, 'its min is above its max')
  const since = z.number().min(0)
  const colour = z.number().int().min(0).max(0xffffff)
  const opacity = z.number().min(0).max(1)
  const shape: Record<(typeof FIELDS)[number], z.ZodType> = {
    n: range(z.number().int().min(0)), every: since, after: since, life: range(since), lasts: z.boolean(), skip: since,
    sheet: z.string(), clip: z.string(), play: z.boolean(), size: range(since), grow: since,
    dir: vec(a), spread: z.number(), speed: range(z.number()), jitter: vec(a), box: vec(2 * a),
    g: z.number(), drag: z.number(), pull: z.number(), pace: z.array(vec(2)), follow: z.boolean(), flips: z.array(vec(3)),
    tint: colour, tint1: colour, gain: since, a0: opacity, a1: opacity, fade: since, spin: z.number(), origin: vec(2),
    add: z.boolean(), stretch: z.boolean(), face: z.boolean(), beam: z.boolean(),
  }
  const emitter = strictFields(space.plugin, 'an emitter', shape)
  const ref = strictFields(space.plugin, 'an { effect } layer', { effect: z.string().min(1), at: vec(a) }, ['effect'])
  return looseInput(l => ('effect' in l ? ref : emitter))
}
// `layerShapes` of a space, made once.
const shapeOf = (space: Pick<Space, 'plugin' | 'axes'>) => EFFECTS.shape(`${space.plugin} ${space.axes}`, () => layerShapes(space))

// The panel's and the tool's shared state: the space, the effect selected, the loop, the spawn, the
// loop's point, and what the last emit found.
export type Studio = {
  space: Space
  subscribe(f: () => void): () => void
  version(): number
  effect: string | undefined
  select(name: string | undefined): void
  loop: boolean
  setLoop(on: boolean): void
  spawn: Spawn
  setSpawn(patch: Partial<Spawn>): void
  // The last point the tool was pressed at, on the scene it was pressed on.
  point: { scene: string; at: number[] } | undefined
  setPoint(point: { scene: string; at: number[] } | undefined): void
  // Why the selected effect is not being emitted, when it is not.
  held: string | undefined
  // Emits the selected effect once, and says why when it cannot.
  fire(): void
  // The panel is open while the call it hands back has not been made.
  open(): () => void
}

// The panel, the tool and the types for `space`'s plugin, and `own`, the types of its file's own
// fields.
export function effects(ed: Editor, space: Space, own: Record<string, ComponentType<FieldProps<string>>> = {}) {
  const { plugin } = space
  const store = `${plugin}.preview`
  const listeners = new Set<() => void>()
  let version = 0
  const changed = () => {
    version++
    for (const f of listeners) f()
  }

  let kept: { effect?: string; loop?: boolean; spawn?: Partial<Spawn> } = {}
  try {
    kept = JSON.parse(localStorage.getItem(store) ?? '{}')
  } catch {
    kept = {}
  }
  const keep = () => {
    try {
      localStorage.setItem(store, JSON.stringify({ effect: studio.effect, loop: studio.loop, spawn: studio.spawn }))
    } catch {
      // A page that keeps nothing previews all the same.
    }
  }

  // Each file's text read once, as JSON or as `as` reads it, under `key`; undefined until the editor
  // has read the file, or when it does not read.
  const parsed = new Map<string, { text: string; value: unknown }>()
  const reading = new Set<string>()
  const parse = (path: string, as: (text: string) => unknown = JSON.parse, key = path): unknown => {
    const text = ed.texts.get(path)
    if (text === undefined) {
      if (!reading.has(path)) {
        reading.add(path)
        void ed.text(path).catch(e => ed.error(`${path}: ${(e as Error).message}`)).finally(() => reading.delete(path))
      }
      return undefined
    }
    const had = parsed.get(key)
    if (had?.text === text) return had.value
    let value: unknown
    try {
      value = as(text)
    } catch {
      value = undefined
    }
    parsed.set(key, { text, value })
    return value
  }
  const clipsOf = (w: Where) => (sheet: string) => {
    const a = w.assets[sheet]
    return a?.type === 'sheet' ? clipsIn(ed, a) : undefined
  }

  // The view's client's plugins, while the view shows the panel's scene.
  const target = () => {
    const w = focus(ed, space)
    const s = ed.session
    return w && s && s.viewing === w.scene && s.client ? { w, plugins: s.client.plugins } : undefined
  }
  // Where the preview emits on the scene: the tool's last point there, else the ground under the
  // middle of the view.
  const pointOn = (scene: string, plugins: Plugins): number[] | undefined => {
    if (studio.point?.scene === scene) return studio.point.at
    const canvas = plugins[space.renderer]?.canvas as HTMLCanvasElement | undefined
    return canvas && ed.staged?.ground(canvas.width / 2, canvas.height / 2)
  }

  let last: Effect | undefined
  // The emit the preview would make now, or why there is none.
  const next = (): { go: () => Effect } | { why: string } | undefined => {
    const t = target()
    const name = studio.effect
    if (!t || !name) return undefined
    const file = parse(t.w.path) as Effects | undefined
    if (!file?.effects) return { why: `${t.w.path} has not been read` }
    const sp = studio.spawn
    const emit = { dir: space.dir(sp), to: (at: number[]) => space.to(at, sp), tint: sp.tint, scale: sp.scale, life: sp.life, seed: sp.seed }
    return firing(t.plugins, space, file, t.w.assets, name, pointOn(t.w.scene, t.plugins), emit, clipsOf(t.w))
  }
  const hold = (why: string | undefined) => {
    if (studio.held === why) return
    studio.held = why
    changed()
  }

  // The loop's point, and a beam's end, marked on the stage the view has.
  let marked: { stage: unknown; key: string; off: () => void } | undefined
  const unmark = () => {
    marked?.off()
    marked = undefined
  }
  const mark = () => {
    const t = target()
    const stage = ed.staged
    const file = t && (parse(t.w.path) as Effects | undefined)
    const at = t && studio.effect && file?.effects?.[studio.effect] ? pointOn(t.w.scene, t.plugins) : undefined
    if (!t || !stage || !at || !file) return unmark()
    const beam = survey(file, studio.effect!, t.w.assets, () => [], space).beam
    const points = beam ? [at, space.to(at, studio.spawn)] : [at]
    const key = JSON.stringify(points)
    if (marked?.stage === stage && marked.key === key) return
    unmark()
    marked = { stage, key, off: stage.mark(points, themed('--accent', 0x4c8dff)) }
  }

  // After each frame of the editor's clock while the panel is open (`Session.onFrame`): the mark, and
  // the loop's next emit once the last has finished.
  let opened = 0
  const frame = () => {
    try {
      mark()
      const plugins = target()?.plugins
      const running = !!last && !!plugins && (plugins[plugin].effects as readonly Effect[]).includes(last)
      if (studio.loop && !running) {
        const n = next()
        if (n && 'go' in n) {
          last = n.go()
          hold(undefined)
        } else hold(n?.why)
      }
    } catch (e) {
      ed.error(`${plugin} preview: ${(e as Error).message}`, (e as Error).stack)
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
    space,
    subscribe(f) {
      listeners.add(f)
      return () => { listeners.delete(f) }
    },
    version: () => version,
    effect: kept.effect,
    select(name) {
      if (studio.effect === name) return
      studio.effect = name
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
    spawn: { ...space.spawn, ...kept.spawn },
    setSpawn(patch) {
      const next = { ...studio.spawn, ...patch }
      for (const k of Object.keys(next) as (keyof Spawn)[]) if (next[k] === undefined) delete next[k]
      studio.spawn = next
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
        const w = focus(ed, space)
        const why = !studio.effect ? 'no effect is selected' : w ? `the game view does not show ${w.scene}` : 'no scene draws effects'
        hold(why)
        return ed.info(`${plugin}: ${why}`)
      }
      if ('why' in n) {
        hold(n.why)
        return ed.error(`${plugin}: ${n.why}`)
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

  function EffectsPanel() {
    return <Panel studio={studio} />
  }
  ed.panel({ id: plugin, title: space.title, area: 'right', component: EffectsPanel })

  ed.tool({
    id: `${plugin}.fire`,
    title: space.tool.title,
    key: space.tool.key,
    cursor: 'crosshair',
    down(p: Pointer) {
      const at = p.stage.ground(p.x, p.y)
      if (!at) return
      const w = focus(ed, space)
      if (w?.scene !== p.scene) return ed.info(`${plugin}: the effects are ${w ? `${w.scene}'s` : 'no scene\'s'}, and the view shows ${p.scene}`)
      studio.setPoint({ scene: p.scene, at: at.map(v => Math.round(v * 1000) / 1000) })
      studio.fire()
    },
  })

  // The types bound to the space: a clip and an effect found through its own scenes.
  function SpaceClip(props: FieldProps<string>) {
    return <Clip {...props} space={space} />
  }
  function SpaceEffect(props: FieldProps<string>) {
    return <EffectName {...props} space={space} />
  }
  ed.field(`${plugin}.range`, Range)
  ed.field(`${plugin}.opacity`, Opacity)
  ed.field(`${plugin}.clip`, SpaceClip)
  ed.field(`${plugin}.effect`, SpaceEffect)
  for (const [type, component] of Object.entries(own)) ed.field(type, component)
  const each = (key: string, type: string) => ({ [`effects.*.*.${key}`]: type })
  ed.bindFile(path => drawing(ed, space).some(w => w.path === path), {
    ...Object.fromEntries(space.file.filter(f => f.type).map(f => [f.key, f.type!])),
    ...Object.assign({}, ...specs(space).filter(s => s.type).map(s => each(s.key, s.type!))),
    ...each('effect', `${plugin}.effect`),
  })

  // ---------------------------------------------------------------- the commands

  // Effect `name` as the panel shows it selected.
  const shown = async (w: Where, file: Effects, name: string) => {
    const layers = effectIn(file, w.path, name)
    const sv = await surveyed(ed, w, file, name)
    return { scene: w.scene, file: w.path, name, layers, named: namings(file, w.path, name, await EFFECTS.others(ed, w)), problems: sv.problems, beam: sv.beam, lives: sv.lives }
  }
  // The file's own fields it has, by name.
  const fieldsOf = (file: Effects) => Object.fromEntries(space.file.filter(f => file[f.key] !== undefined).map(f => [f.key, file[f.key]]))
  // What the commands on the effects are handed: the scenes that draw them, and how an effect is
  // surveyed and shown.
  const on: Lister<Effects, Where, Survey> = {
    ed, scenes: () => drawing(ed, space), does: `draws ${plugin} effects`, fails: 'would not be emitted',
    surveyed: (w, file, name) => surveyed(ed, w, file, name), shown, own: file => ({ fields: fieldsOf(file) }),
  }
  const scene = z.string().describe(`a scene that draws ${plugin} effects`)
  const point = z.array(z.number()).min(space.axes).max(3).describe(space.axes === 2 ? 'a world point [x, y] or [x, y, h]' : 'a world point [x, y, z]')
  const layer = shapeOf(space).describe(`an emitter, by the fields ${plugin} reads, or { effect, at? }`)

  ed.command({
    id: `${plugin}.effects`,
    title: `${space.title}: effects`,
    input: z.object({
      scene: scene.optional().describe(`a scene that draws ${plugin} effects; every one, with its file, when left out`),
      name: z.string().optional().describe('one effect of the scene\'s file, shown as the panel shows it selected'),
    }).describe(`The ${space.title} panel's effects: every scene that draws them, with its file; a scene's file's own fields and every effect, with its layers, how many places name it and why it would not be emitted; or one effect, its layers, where it is named, why it would not be emitted, and whether it draws a beam or lives. ${OUTLINE}`),
    run: ({ scene, name }) => EFFECTS.listed(on, scene, name),
  })
  ed.command({
    id: `${plugin}.effect`,
    title: `${space.title}: effect`,
    input: z.object({
      scene,
      name: z.string().min(1).describe('the effect; one the file has not got is added'),
      layers: z.array(layer).nullable().describe('its layers, in order; null takes it out'),
      anyway: z.boolean().optional().describe('takes it out though a layer or a data file names it'),
    }).describe(`Sets an effect's layers, adds it, or takes it out, as the ${space.title} panel does: one undo, refused where a layer would make the effect throw as ${plugin} runs it. Answers the effect.`),
    run: ({ scene, name, layers, anyway = false }, e) => EFFECTS.set(on, e, scene, name, layers as Layer[] | null, anyway),
  })
  ed.command({
    id: `${plugin}.rename`,
    title: `${space.title}: rename`,
    input: z.object({
      scene,
      from: z.string().describe('the effect'),
      to: z.string().describe('its new name, which no other effect has'),
    }).describe(`Renames an effect and every { effect } layer that names it, as the ${space.title} panel does: one undo. Answers the effect, and where else its old name is still named.`),
    run: ({ scene, from, to }, e) => EFFECTS.rename(on, e, scene, from, to),
  })
  ed.command({
    id: `${plugin}.file`,
    title: `${space.title}: file`,
    input: z.object({
      scene,
      key: z.enum(space.file.map(f => f.key) as [string, ...string[]]).describe(space.file.map(f => `${f.key}: ${f.title}`).join('; ')),
      value: z.union([z.number(), z.string()]).nullable().describe('its value; null leaves it out, where it may be'),
    }).describe(`Sets a field of a scene's effects file's own, or leaves it out, as the ${space.title} panel's File section does: one undo, refused only for a value the field may not be, not for effects it leaves that would not be emitted. Answers the file's own fields, and those effects.`),
    run: async ({ scene, key, value }, e) => {
      const { w, file } = await EFFECTS.fileOf(on, scene)
      await written(e, fileEdits(ed, w, file, space.file.find(f => f.key === key)!, value ?? undefined))
      const now = (await EFFECTS.fileOf(on, scene)).file
      const broken = []
      for (const n of Object.keys(now.effects)) if ((await surveyed(ed, w, now, n)).problems.length) broken.push(n)
      return { file: w.path, fields: fieldsOf(now), broken }
    },
  })
  ed.command({
    id: `${plugin}.fire`,
    title: `${space.title}: fire`,
    input: z.object({
      scene,
      effect: z.string().describe('the effect'),
      at: point,
      dir: z.array(z.number()).length(space.axes).optional().describe(`the way a layer giving none goes, ${space.where}`),
      to: point.optional().describe('a beam\'s end'),
      tint: z.number().int().min(0).max(0xffffff).optional().describe('colour of layers giving none'),
      scale: z.number().min(0).default(1).describe('times every length'),
      life: z.number().min(0).default(1).describe('seconds it goes on'),
      seed: z.number().int().min(0).optional().describe('same particles each fire'),
    }).describe(`Fires an effect once in the game view, which must show the scene, as ${space.tool.title} does, on no row; dir and to as the panel's first when left out. Answers it.`),
    run: async ({ scene, effect, at, dir, to, tint, scale, life, seed }) => {
      const { w, file } = await EFFECTS.fileOf(on, scene)
      effectIn(file, w.path, effect)
      const { problems } = await surveyed(ed, w, file, effect)
      if (problems.length) throw new Error(`${effect} is not emitted: ${problems.join('; ')}`)
      const client = await ed.need().clientOn(scene)
      const emit = { dir: dir ?? space.dir(space.spawn), to: (p: number[]) => to ?? space.to(p, space.spawn), tint, scale, life, seed }
      const got = firing(client.plugins, space, file, w.assets, effect, at, emit, sheet => clipsIn(ed, w.assets[sheet]))
      if ('why' in got) throw new Error(got.why)
      const fx = got.go()
      return { scene, effect: fx.name, at: fx.at, dir: fx.dir, to: fx.to, life: fx.life, live: (client.plugins[plugin].effects as readonly Effect[]).filter(f => f.name === effect).length }
    },
  })
}

export function particle2d(ed: Editor) {
  effects(ed, SPACE, { 'particle2d.layer': LayerName })
}
