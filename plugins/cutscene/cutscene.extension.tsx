// The cutscene's extension: the Cutscene panel, where a scene's cue file is made, and the Cutscene
// tool of the game view, which picks targets on the stage and drags shots (`cutscene.sim.ts` says
// what the file holds and how it plays).
//
// The panel (`cutscene.components.tsx`) works on the cue file of the scene the game view shows, or
// else of the first scene with a cutscene row: its `world.cutscene.script`, a loader `json` entry. Every
// change is written to the file through the editor, one value at a time, as one change the editor
// can undo: a whole drag, a whole run of nudges on one selection, a paste. Changes are written one
// after another in the order they were made, each from the file as the one before left it, and a
// run of nudges not yet written is written before any other change. A change is refused,
// written nowhere, and said in the panel's error line and the console, when the runtime's `check`
// refuses the file it would make, or when it would name a target that is neither a cast member nor a
// mark (`strangers`), a clip or a gear the member's rig lacks or a sound the scene has no cue of
// (`badNames`), or a `go` that is no scene of the game, where the file did not already; each refusal
// names the choices. A name the file had already is let be, wherever a change moves its cue. In a
// scene with no sound cues the sound lane's `+` and the form's `sound` kind are off, saying so, since
// a sound there plays nothing.
//
// The run. The panel runs the session with the scene started at step 1: an edit through the
// recorder at step 1 sets the row's `starts`, so the scene plays from the first step its cast is
// there, whatever the game's rule does. Elapsed time `e` is then step `start + e/dt`, `start` the
// step `e` counts from, which the measure pass finds; scrubbing seeks the recorder there, stepping
// on past the recording's end when it has to, and so previews the scene as it plays, bodies, bars,
// veil and line, and edits nothing. A file edit reruns the session to the step it is at.
//
// The measure pass. Once per version of a scene's cue file and scene file, a second recorder replays
// the session's own recording headless, in slices of `SLICE` ms with the page let go between them
// (the editor's `turn`), from its boot to the scene's end, and reads the cutscene row each step: the
// step it started at, the elapsed time each cue fired, how long each wait held and whether it had
// anything to wait for, when each walk ended and whether at its limit, and each cast member's feet
// every `EVERY` seconds of `e`. It stops short of the end once the scene has had the steps the file
// can play at most (`longest`) from the step it started on, or from the recording's end while it has
// not started, and when the session it replays is closed. A version whose pass throws is not measured
// again. Each scene keeps its own measure, so the panel's and a command's on another scene are two.
//
// The timeline, in elapsed seconds. A chip is drawn at its `at` plus every hold before it, and a
// chip moved to elapsed time E goes back to the cue clock by taking off the holds before E. Lanes are
// each cast member, then camera, say, sound and screen (fade, bars and shake); a wait is a point on
// its member's lane, or on say for the line, and a hatched hold in the ruler.
//
// The stage, drawn in the overlay of the stage the game view has while the panel is open, over the
// ground the game view's client has for the scene (`heightOf`), and not while it shows another
// scene, has no ground yet or the extension is off: each mark as a ring of 1 m, each shot as its
// camera's frustum where it stands on the rows as they are, with the path a dolly takes from the
// shot before it, and each cast member's measured path. With the Cutscene tool (K) a frustum's apex
// is dragged across the level it stands on, which moves the shot's `pos`, and a target picked for a
// walk or a face writes the mark within 1 m of the point under the pointer, or the point. A shot
// that follows nobody is written as the point `[x, up, z]` over the ground, so the stage camera
// taken into it, or its apex dragged, is written as the height above the ground under it; with no
// ground there is nothing to write it over, and the panel says so. `look` holds the orbit off, so
// the game view shows the cutscene's own camera, which its browser half places from the row.
//
// What the panel's buttons, its timeline, its keys and the tool do is done by functions here, which
// they and the commands call alike: a cue added on a lane by `addEdits`; its fields set, or its kind
// changed, by `patched`; cues moved, onto another member's lane and to another length, by
// `moveEdits`; taken out by `removeEdits`; copied, as a paste and a duplicate copy them, by
// `pasteEdits`; the file's end, `go` and `arrive` by `fileEdits`; the stage's camera taken into a
// shot by `takeEdits`; a shot's camera stood on a world point, as its apex is dragged, by
// `standEdits`; a target picked on the stage by `pickEdits`; the session put at an elapsed time, and
// played from there, by `seekTo`. Each change goes through `queue`, the panel's and a command's
// alike, on the editor's one chain of writes (`onChain`), and is refused by one check (`refusal`).
//
// Its commands, for an LLM calling them (`editor/mcp.ts`), each doing what a person does here, on the
// cue file of any scene with a cutscene row. A cue is named by its place in the file, and a time is
// elapsed seconds, as the timeline shows it, but for a cue's own `at`, which is the cue clock's:
//   cutscene.read    the file as the panel shows it: its lanes, every cue with its lane, the elapsed
//                    time and length it is drawn at and its note, the holds, the end on both clocks,
//                    `go` and `arrive`, the cast, the marks, the sounds, the playhead and the problems;
//   cutscene.report  what the measure pass found: the problems, the step the scene started at, when
//                    each cue fired, how long each wait held and whether it passed, when each walk
//                    ended and whether at its limit, and each member's path;
//   cutscene.add     a cue made at a time on a lane, as the lane's `+` makes it, with fields of a
//                    call's own over it;
//   cutscene.edit    a cue's fields set, or taken out, and its kind changed, as its form does;
//   cutscene.move    cues moved to times, onto other members' lanes, and to other lengths, as a drag,
//                    a nudge and a resize move them, together;
//   cutscene.remove  cues taken out, as Delete takes the selection;
//   cutscene.copy    cues copied after the file's last, at a time as a paste puts them, or after
//                    their end as Duplicate does;
//   cutscene.end     the file's end, as its bracket is dragged, and its `go` and `arrive`;
//   cutscene.take    the view the game view is drawn from taken into a shot, as `take the view`
//                    does: the orbit's, which `view.pose` puts;
//   cutscene.shot    a shot's camera stood on a world point, as dragging its frustum's apex does;
//   cutscene.pick    a walk's or a face's target picked at a world point, as the tool picks it;
//   cutscene.seek    the session put at an elapsed time of the scene, and played from there, as the
//                    ruler and `▶ here` do;
//   cutscene.look    the cutscene's own camera shown in the game view, or the orbit given it back,
//                    which is the editor's to hold whatever the view shows, and never refused.
// Each write is one undo, answering the cues it left. A name a call writes is held to the choices the
// form offers, a cast member, a mark, a clip or a gear of the member's rig, a sound cue of the scene,
// a scene of the game for `go`, and refused naming them. Those that read what only the game view
// holds, its camera and its ground (take, and a shot that follows nobody), draw a frame first where
// none has mounted the view's client, whether or not the editor's clock has drawn one, and are refused
// while it shows another scene; every other works from the files and the rows, whatever the view
// shows.
import * as THREE from 'three'
import type { KeyboardEvent } from 'react'
import { z } from 'zod'
import { edited, outlined, OUTLINE, Refusal, strictFields, turn, type Edits, type Editor, type Pointer } from '#editor/editor.ts'
import type { At } from '#editor/files.ts'
import { onChain } from '#editor/live.ts'
import type { Move } from '#editor/ui/timeline.tsx'
import type { Row, Scene } from '#engine/engine.ts'
import { recorder, type Recorder } from '#addons/recorder/recorder.addon.ts'
import { manager, scenes } from '#addons/scenemanager/scenemanager.addon.ts'
import { Cutscene } from './cutscene.components.tsx'
import { CUES, RULES, check, said, longest, placed, rooted, sorted, strangers, view, type Cue, type Height, type Pose, type Script, type View } from './cutscene.sim.ts'
import { heightOf } from './cutscene.plugin.ts'

// The measure pass works this many milliseconds at a time at most.
const SLICE = 8
// The measured paths take each cast member's feet this often, in seconds of `e`.
const EVERY = 0.25
// The timeline's grain, the nudge, in seconds.
export const GRAIN = 0.05
// A frustum is drawn this deep, in metres, at 16:9; a press this many canvas pixels from its apex
// drags it.
const DEPTH = 1.5
const ASPECT = 16 / 9
const GRAB = 14
// A picked point writes the mark within this many metres of it.
const NEAR = 1
// How long a run of nudges waits for the next before it is written, in milliseconds.
const NUDGED = 600
const TOLERANCE = 1e-9
// How far past the end a time moved to may be, as the timeline rounds one it has kept at the end.
const PAST = 1e-6

type Asset = { type: string; url: string }
type Rig = { clips: Record<string, string | Record<string, unknown>>; table?: Record<string, { dur: number }> }

// The cue file the panel works on: the scene, its file, the cutscene row and the file of cues.
export type Target = { scene: string; scenePath: string; row: number; path: string; name: string }

// What the measure pass read off one play of the scene.
export type Measured = {
  key: string
  // The step `e` counts from; undefined when the scene never started.
  start: number | undefined
  // `e` when it ended, or where the pass stopped.
  total: number
  done: boolean
  // By the cue's place in the file: the `e` it fired at (NaN never), the seconds a wait held, a wait
  // that had nothing to wait for, the `e` a walk ended at and whether at its limit.
  fired: number[]
  holds: number[]
  passed: boolean[]
  arrive: number[]
  limited: boolean[]
  paths: Record<string, number[][]>
}

export type Chip = { id: string; lane: string; at: number; length?: number; open?: boolean; look?: 'bar' | 'stripe' | 'ramp' | 'loop'; label: string; warn: boolean; lanes?: string[]; resize?: boolean }

// Everything the panel shows, worked out from the file, the scene and the measure.
export type Model = {
  target: Target
  file: Script
  cast: string[]
  // Each cast member's lane, then camera, say, sound and screen.
  lanes: string[]
  marks: { name: string; at: number[] }[]
  sounds: string[]
  rigs: Record<string, Rig | undefined>
  measured: Measured | undefined
  chips: Chip[]
  holdMarks: { at: number; length: number }[]
  problems: { cue: number; text: string }[]
  // A cue's elapsed time and the holds before it, and the elapsed time of the end.
  elapsed(i: number): number
  held(i: number): number
  end: number
  span: number
  toCue(e: number, self?: number): number
  clips(who: string): string[]
  gears(who: string): string[]
  note(i: number): string[]
}

export type Studio = {
  subscribe(f: () => void): () => void
  version(): number
  selected: string[]
  error: string | undefined
  picking: { cue: number; field: string } | undefined
  problems: boolean
  scrub: number | undefined
  // A run of nudges not yet written: the chips and by how much.
  nudging(): { ids: string[]; by: number } | undefined
  model(): Model | undefined
  head(): number
  looking(): boolean
  mounted(on: boolean): void
  select(ids: string[]): void
  seek(e: number, done: boolean): void
  here(): void
  move(moves: Move[], done: boolean): void
  resize(id: string, length: number, done: boolean): void
  setEnd(e: number, done: boolean): void
  key(e: KeyboardEvent): void
  add(lane: string): void
  set(i: number, field: string, value: unknown): void
  patch(i: number, values: Record<string, unknown>): void
  setFile(field: string, value: unknown): void
  convert(i: number, to: string): void
  take(i: number): void
  pick(i: number, field: string): void
  look(on: boolean): void
  showProblems(on: boolean): void
  target(value: string): unknown
}

const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0
const text = (v: unknown) => JSON.stringify(v)

// The kinds of cue, in the order the form offers them.
export const DOS = ['play', 'gesture', 'walk', 'face', 'say', 'wait', 'shot', 'fade', 'bars', 'shake', 'sound', 'music']
// The lanes after the cast's, and the kind of cue each lane's `+` makes; a cast member's makes a play.
const LANES: Record<string, string> = { camera: 'shot', say: 'say', sound: 'sound', screen: 'fade' }
// The kinds of cue with a length, the field it is, which the timeline draws and resizes.
const LENGTHS: Record<string, string> = { say: 'for', shot: 'over', fade: 'over', bars: 'over', shake: 'over' }
// The kinds of cue whose target is picked on the stage.
const PICKED = ['walk', 'face']

// Why a sound cannot be made in the model's scene: it has no sound cues. The sound lane's `+` and the
// form's `sound` kind are off for this reason, and a sound made by a call refused with it.
export const soundless = (m: Model) => (m.sounds.length ? undefined : `${m.target.scene} has no sound cues, in its world.audio.cues, for a sound to play`)

// The lane a cue sits on.
const laneOf = (c: Cue) => {
  if (['play', 'gesture', 'walk', 'face'].includes(c.do)) return c.who
  if (c.do === 'wait') return c.who === 'line' ? 'say' : c.who
  if (c.do === 'shot') return 'camera'
  if (c.do === 'say') return 'say'
  if (c.do === 'sound' || c.do === 'music') return 'sound'
  return 'screen'
}

// A rig's clip entry, followed through `mirror`.
const entryOf = (rig: Rig, clip: string): Record<string, unknown> | undefined => {
  const e = rig.clips[clip]
  if (e === undefined) return undefined
  if (typeof e === 'string') return { file: e }
  if (typeof e.mirror === 'string') return { ...entryOf(rig, e.mirror), ...e, mirror: undefined }
  return e
}
// The clips of a member's rig, and those with a gear, which a walk is walked in: the choices the
// form offers and the ones a change is held to.
const clipsOf = (rig: Rig | undefined) => Object.keys(rig?.clips ?? {})
const gearsOf = (rig: Rig | undefined) => clipsOf(rig).filter(c => typeof entryOf(rig!, c)?.gear === 'number')
const durOf = (rig: Rig | undefined, clip: string) => {
  if (!rig) return undefined
  const e = rig.clips[clip]
  const own = rig.table?.[clip]?.dur
  if (own !== undefined) return own
  return typeof e === 'object' && typeof e.mirror === 'string' ? rig.table?.[e.mirror]?.dur : undefined
}

// A value of a cue's field as a call hands it: a name, a number, true or false, a point, or null.
const VALUE = z.union([z.number(), z.boolean(), z.string(), z.array(z.number()), z.null()])

// The fields a call hands for a cue of kind `does` in `file`, `at` among them when `at`: each held to
// the rule the runtime's `check` holds it to (`CUES`, `RULES`), one that may be left out also null, and
// a field the kind has not got refused, naming those it has.
function fieldsOf(file: Script, does: string, at: boolean) {
  const rules: Record<string, string> = { ...(at && { at: 'number' }), ...CUES[does] }
  const shape: Record<string, z.ZodType> = { do: z.enum(DOS as [string, ...string[]]) }
  for (const [field, spec] of Object.entries(rules)) {
    const optional = spec.endsWith('?')
    const rule = RULES[optional ? spec.slice(0, -1) : spec]
    const kept = z.custom(v => rule[0](v, file), { error: i => `${text(i.input)} is not ${said(rule, file)}` })
    shape[field] = optional ? kept.nullable() : kept
  }
  return strictFields('cutscene', `a ${does} cue`, shape)
}

export function cutscene(ed: Editor) {
  const listeners = new Set<() => void>()
  let version = 0
  const changed = () => {
    version++
    for (const f of listeners) f()
    draw()
  }
  let mounted = 0
  // By scene: the last measure, the pass running and the version it measures, and the start edit
  // being made; by version, why its pass threw.
  const measures = new Map<string, Measured>()
  const passes = new Map<string, { key: string; done: Promise<void> }>()
  const failed = new Map<string, string>()
  const armings = new Map<string, Promise<void>>()
  let clipboard: Cue[] = []
  let nudging: { ids: string[]; by: number; timer: ReturnType<typeof setTimeout> } | undefined
  // A frustum being dragged: the shot's place, its apex where the drag began, and the level point it
  // was grabbed at; `to` where it is now.
  let dragging: { cue: number; apex: number[]; grab: number[]; to?: number[] } | undefined
  let pointed: number[] | undefined

  // ---------------------------------------------------------------- the file

  // A plugin's fixed numbers, `world.<key>`, as the scenemanager composes a child's `world`.
  const world = (scene: Scene, key: string) => scene.world?.[key] ?? ed.session?.game.file.world?.[key]
  const assetOf = (scene: Scene, name: string): Asset | undefined => (world(scene, 'loader')?.assets as Record<string, Asset> | undefined)?.[name]
  const pathOf = (url: string) => url.replace(/^\//, '')

  // Every scene of the open game with a cutscene row and a cue file, the one the game view shows
  // first; the panel works on the first.
  const targets = (): Target[] => {
    const s = ed.session
    if (!s) return []
    const names = ed.scenesWith('cutscene')
    const order = [...names.filter(n => n === s.viewing), ...names.filter(n => n !== s.viewing)]
    return order.flatMap(name => {
      const scenePath = s.path(name)
      const scene = s.files.get(scenePath)
      if (!scene || !scene.actors?.some(a => a.is === 'cutscene')) return []
      const script = world(scene, 'cutscene')?.script as string | undefined
      const asset = script === undefined ? undefined : assetOf(scene, script)
      const row = ed.sceneOf(name).rows.find(r => r.kind === 'cutscene')!
      return asset ? [{ scene: name, scenePath, row: row.id, path: pathOf(asset.url), name: script! }] : []
    })
  }
  const target = (): Target | undefined => targets()[0]
  // Scene `scene`'s, for a command; one that has none is refused, naming those that have.
  const targetOf = (scene: string): Target => {
    const s = ed.need()
    const all = targets()
    const t = all.find(t => t.scene === scene)
    if (!t) throw new Error(`no scene ${scene} of ${s.game.name} has a cutscene row with a cue file: ${all.length ? `${all.map(t => t.scene).join(', ')} does` : 'none does'}`)
    return t
  }

  const parsed = new Map<string, unknown>()
  const reading = new Set<string>()
  const read = (path: string): unknown => {
    const t = ed.texts.get(path)
    if (t === undefined) {
      if (!reading.has(path)) {
        reading.add(path)
        void ed.text(path).catch(e => ed.error(`${path}: ${(e as Error).message}`)).finally(() => reading.delete(path))
      }
      return undefined
    }
    if (!parsed.has(t)) {
      try {
        parsed.set(t, JSON.parse(t))
      } catch {
        parsed.set(t, undefined)
      }
    }
    return parsed.get(t)
  }

  // The file of the rig each cast member plays from, off anim's `world.anim`: its kind's `rig` entry.
  const rigPath = (scene: Scene, kind: string): string | undefined => {
    const name = (world(scene, 'anim')?.kinds as Record<string, { rig: string }> | undefined)?.[kind]?.rig
    const asset = name === undefined ? undefined : assetOf(scene, name)
    return asset && pathOf(asset.url)
  }
  const rigOf = (scene: Scene, kind: string): Rig | undefined => {
    const path = rigPath(scene, kind)
    return path === undefined ? undefined : read(path) as Rig | undefined
  }

  // The sound cues of a scene, off audio's `world.audio.cues`.
  const soundsOf = (scene: Scene) => Object.keys((world(scene, 'audio')?.cues as Record<string, unknown> | undefined) ?? {})

  // Names a file gives that are none of the choices the form offers, as `{ cue, text }`, each naming
  // them: a clip a play or a gesture plays that its member's rig lacks, a gear a walk is walked in
  // that is no clip of its rig with a gear, a rig not read yet giving no choices to hold them to;
  // and a sound that is none of the scene's sound cues.
  const badNames = (file: Script, rigs: Record<string, Rig | undefined>, sounds: string[]) => file.cues.flatMap((c, i) => {
    const rig = typeof c.who === 'string' ? rigs[c.who] : undefined
    if ((c.do === 'play' || c.do === 'gesture') && rig && !Object.hasOwn(rig.clips, c.clip)) {
      return [{ cue: i, text: `${c.clip} is not a clip of ${c.who}'s rig: its clips are ${clipsOf(rig).join(', ')}` }]
    }
    if (c.do === 'walk' && rig && typeof c.gear === 'string' && !gearsOf(rig).includes(c.gear)) {
      return [{ cue: i, text: `${c.gear} is no gear of ${c.who}'s rig, a clip it walks in: ${gearsOf(rig).length ? `its gears are ${gearsOf(rig).join(', ')}` : 'it has none'}, and null walks at the file's pace` }]
    }
    if (c.do === 'sound' && typeof c.cue === 'string' && !sounds.includes(c.cue)) {
      return [{ cue: i, text: `${JSON.stringify(c.cue)} is no sound cue of the scene: ${sounds.length ? `its sound cues are ${sounds.join(', ')}` : 'it has none'}` }]
    }
    return []
  })

  // The model of `t`, the panel's target when none is handed, is made again when anything it is made
  // from changes: the target, the cue file's text, the scene file's and the game's, which hold the
  // marks, the sounds and the rigs' entries, each rig as read, and the scene's measure.
  let last: { from: unknown[]; model: Model } | undefined
  const model = (t = target()): Model | undefined => {
    const s = ed.session
    if (!t || !s) return undefined
    const scene = s.files.get(t.scenePath)!
    const file = read(t.path) as Script | undefined
    if (!file || !Array.isArray(file.cues) || !file.cast) return undefined
    const rigs = Object.fromEntries(Object.entries(file.cast).map(([name, m]) => [name, rigOf(scene, m.kind)]))
    const me = measures.get(t.scene)
    const from = [t.scene, t.path, t.row, ed.texts.get(t.path), ed.texts.get(t.scenePath), ed.texts.get(s.game.path), me, ...Object.values(rigs)]
    if (last && last.from.length === from.length && last.from.every((v, k) => v === from[k])) return last.model
    const m = build(t, scene, file, rigs, me)
    last = { from, model: m }
    return m
  }

  function build(t: Target, scene: Scene, file: Script, rigs: Record<string, Rig | undefined>, me: Measured | undefined): Model {
    const cast = Object.keys(file.cast)
    const marks = (scene.actors ?? []).filter(a => a.is === 'mark').map(a => ({ name: String(a.name ?? ''), at: (a.at as number[]) ?? [0, 0] }))
    const sounds = soundsOf(scene)
    const order = sorted(file.cues)
    const rank = new Map(order.map((i, k) => [i, k]))
    const holdOf = (i: number) => (me && file.cues[i].do === 'wait' ? me.holds[i] ?? 0 : 0)
    const held = (i: number) => order.slice(0, rank.get(i)).reduce((a, w) => a + holdOf(w), 0)
    const elapsed = (i: number) => round3(file.cues[i].at + held(i))
    const waits = order.filter(i => file.cues[i].do === 'wait' && holdOf(i) > 0)
    const toCue = (e: number, self?: number) => {
      let acc = 0
      for (const w of waits) {
        if (w === self) continue
        const from = file.cues[w].at + acc
        if (e <= from + TOLERANCE) break
        if (e < from + holdOf(w)) return round3(file.cues[w].at)
        acc += holdOf(w)
      }
      return round3(Math.max(0, e - acc))
    }
    const allHolds = waits.filter(w => file.cues[w].at <= file.end + TOLERANCE).reduce((a, w) => a + holdOf(w), 0)
    const end = round3(file.end + allHolds)
    const clips = (who: string) => clipsOf(rigs[who])
    const gears = (who: string) => gearsOf(rigs[who])

    const problems: { cue: number; text: string }[] = []
    for (const u of strangers(file, marks.map(m => m.name))) problems.push({ cue: u.cue, text: `${u.field} names ${u.name}, which is no cast member or mark` })
    problems.push(...badNames(file, rigs, sounds))
    file.cues.forEach((c, i) => {
      if (c.at > file.end + TOLERANCE) problems.push({ cue: i, text: `at ${c.at} is past the end, ${file.end}` })
      if (me?.limited[i]) problems.push({ cue: i, text: 'the walk ends at its limit' })
      if (me?.passed[i]) problems.push({ cue: i, text: 'the wait has nothing to wait for' })
    })
    const warned = new Set(problems.map(p => p.cue))

    // The next cue on a lane of one of `dos` after cue i, by elapsed time.
    const next = (i: number, dos: string[], lane: string) => {
      const e = elapsed(i)
      const later = file.cues.map((_, j) => j).filter(j => j !== i && dos.includes(file.cues[j].do) && laneOf(file.cues[j]) === lane && elapsed(j) > e + TOLERANCE)
      return later.length ? Math.min(...later.map(elapsed)) : undefined
    }
    const total = Math.max(end, me?.total ?? 0)
    const chips: Chip[] = file.cues.map((c, i) => {
      const lane = laneOf(c)
      const at = elapsed(i)
      const base = { id: String(i), lane, at, warn: warned.has(i), label: c.do }
      const castLanes = typeof c.who === 'string' && cast.includes(c.who) ? { lanes: cast } : {}
      // The length of a cue of a kind with one, by the field `LENGTHS` names: resized, but for a cut,
      // a fade, the bars or a shake of none, which are points.
      const sized = Object.hasOwn(LENGTHS, c.do) ? (c[LENGTHS[c.do]] as number) : 0
      const resized = sized > 0 ? { length: sized, resize: true } : {}
      switch (c.do) {
        case 'play': {
          const loop = !!(rigs[c.who] && entryOf(rigs[c.who]!, c.clip)?.loop)
          const dur = durOf(rigs[c.who], c.clip)
          const length = loop ? (next(i, ['play'], lane) ?? total) - at : dur !== undefined ? dur / (c.rate || 1) : undefined
          return { ...base, ...castLanes, label: `play ${c.clip}`, length, look: loop ? 'stripe' : 'bar' }
        }
        case 'gesture': return { ...base, ...castLanes, label: `gesture ${c.clip}`, length: durOf(rigs[c.who], c.clip) }
        case 'walk': {
          const to = me && Number.isFinite(me.arrive[i]) ? me.arrive[i] - at : c.limit ?? file.limit
          return { ...base, ...castLanes, label: `walk to ${typeof c.to === 'string' ? c.to : c.to.join(', ')}`, length: Math.max(0, to), open: true }
        }
        case 'face': return { ...base, ...castLanes, label: `face ${c.to === null ? 'nothing' : typeof c.to === 'string' ? c.to : c.to.join(', ')}` }
        case 'wait': return { ...base, ...castLanes, label: `wait for ${c.who}` }
        case 'shot': return { ...base, label: `shot ${c.name}`, ...resized, ...(sized > 0 && { look: 'ramp' as const }) }
        case 'fade': case 'shake': case 'bars':
          return { ...base, label: `${c.do} ${c.do === 'fade' ? c.to : c.do === 'bars' ? (c.on ? 'in' : 'out') : c.amp}`, ...resized }
        case 'sound': return { ...base, label: `sound ${c.cue}` }
        case 'music': return { ...base, label: `music ${c.name || 'off'}`, length: (next(i, ['music'], lane) ?? total) - at, look: 'loop' }
        case 'say': return { ...base, label: `${c.who}: ${c.text}`, length: sized, resize: true }
        default: return base
      }
    })
    const holdMarks = waits.map(w => ({ at: elapsed(w), length: holdOf(w) }))
    const note = (i: number) => {
      const c = file.cues[i]
      const lines = [`${elapsed(i)} s elapsed, after ${round3(held(i))} s of waits`]
      if (c.do === 'wait') lines.push(me?.passed[i] ? 'passes: nothing to wait for' : `holds ${round3(holdOf(i))} s`)
      if (c.do === 'walk' && me) lines.push(me.limited[i] ? 'ends at its limit' : Number.isFinite(me.arrive[i]) ? `arrives ${round3(me.arrive[i])} s` : 'arrives with the end')
      if (c.do === 'play') {
        const ch = chips[i]
        lines.push(ch.look === 'stripe' ? 'runs to the next cue on the lane' : ch.length !== undefined ? `ends ${round3(elapsed(i) + ch.length)} s` : 'a clip of no measured length')
      }
      if (c.do === 'shot') lines.push(c.over > 0 ? 'a dolly' : 'a cut')
      return lines
    }
    return {
      target: t, file, cast, lanes: [...cast, ...Object.keys(LANES)], marks, sounds, rigs, measured: me, chips, holdMarks, problems,
      elapsed, held, end, span: Math.max(total, end) + 1, toCue, clips, gears, note,
    }
  }

  // ---------------------------------------------------------------- the run

  // A version of the files a measure reads: the cue file's text and the scene file's, as the editor last
  // wrote them. The recording the pass replays is the one there is when a version is first measured.
  const measureKey = (t: Target) => `${t.scene}\n${ed.texts.get(t.path)}\n${ed.texts.get(t.scenePath) ?? ''}`
  const armed = (t: Target) => ed.session!.rec.journal.some(e => 'set' in e && e.set.scene === t.scene && e.set.id === t.row && e.set.path[0] === 'starts')
  const dt = () => ed.session!.rec.dt
  const startOf = (t: Target) => measures.get(t.scene)?.start ?? 1
  // The playhead of `t`'s scene: the elapsed time of the step the session is at.
  const headOf = (t: Target) => round3(Math.max(0, (ed.session!.n - startOf(t)) * dt()))

  // Puts the session at step k: forward by stepping, which plays on past the recording's end, and
  // back by seeking.
  async function goTo(k: number) {
    const s = ed.session!
    if (k < s.n) await s.seek(k)
    while (s.n < k) {
      const n = s.n
      await s.step()
      if (s.n === n) break
    }
  }

  // The start edit at step 1 of `t`'s scene, once per recording.
  function arm(t: Target): Promise<void> {
    const s = ed.session
    if (!s || armed(t)) return Promise.resolve()
    let going = armings.get(t.scene)
    if (!going) {
      going = (async () => {
        const back = s.n
        await goTo(1)
        if (!armed(t)) s.edit({ set: { scene: t.scene, id: t.row, path: ['starts'], value: true } })
        await goTo(Math.max(1, back))
      })().catch(e => { ed.error(`cutscene: ${(e as Error).message}`) }).finally(() => { armings.delete(t.scene); changed() })
      armings.set(t.scene, going)
    }
    return going
  }

  // The measure pass of `t`'s scene, once per version, while the session it replays is open: done
  // when the version is measured, or its pass has thrown or stopped.
  function measure(t: Target): Promise<void> {
    const s = ed.session
    if (!s || !armed(t) || !ed.texts.has(t.path)) return Promise.resolve()
    const key = measureKey(t)
    if (measures.get(t.scene)?.key === key || failed.has(key)) return Promise.resolve()
    const running = passes.get(t.scene)
    if (running?.key === key) return running.done
    const done = pass(t, key)
    passes.set(t.scene, { key, done })
    return done
  }
  async function pass(t: Target, key: string) {
    const s = ed.session!
    let replaying: Recorder | undefined
    const going = () => passes.get(t.scene)?.key === key && ed.session === s
    try {
      const file = read(t.path) as Script
      const rec = replaying = await recorder(s.game.file, s.sim, s.game.base, [...s.rec.journal], s.rec.end)
      const n = file.cues.length
      const got: Measured = {
        key, start: undefined, total: 0, done: false,
        fired: Array(n).fill(NaN), holds: Array(n).fill(0), passed: Array(n).fill(false), arrive: Array(n).fill(NaN), limited: Array(n).fill(false),
        paths: {},
      }
      const order = sorted(file.cues)
      const truthOf = () => scenes(manager(rec.truth)).get(t.scene)
      const rowOf = () => truthOf()?.rows.find(r => r.id === t.row)
      // The pass ends at the scene's end, or once the scene has had the steps the file can play at most
      // from the step it started on, or from the recording's end while it has not: `longest`, and a
      // step a cue for the part of a step each wait can overrun. The recording's end is the one it
      // replays, which the steps it plays past move on.
      const most = Math.ceil(longest(file) / rec.dt) + n + 2
      const end = rec.end
      const cap = () => (got.start ?? end) + most
      let was = structuredClone(rowOf()?.data ?? {})
      // The hold every wait before the one holding had held, as `e - t`.
      let gapBefore = 0
      let sample = 0
      while (rec.n < cap() && going()) {
        const slice = performance.now()
        while (rec.n < cap() && performance.now() - slice < SLICE) {
          const stopped = rec.step()
          if (stopped) {
            await stopped
            throw new Error(`the measure pass stopped at step ${rec.failure?.at}: ${rec.failure?.message}`)
          }
          const d = rowOf()?.data
          if (!d) continue
          if (d.running && got.start === undefined) got.start = rec.n - Math.round(d.e / rec.dt)
          if (!d.running && !d.done) { was = structuredClone(d); continue }
          // A wait that let go this step held to here, the step it let go on included; one that holds
          // from this step on starts from there, or, after no wait, from where the step before stood.
          if (was.wait && was.wait.cue !== d.wait?.cue) got.holds[was.wait.cue] = round3(d.e - d.t - gapBefore)
          for (let k = was.fired ?? 0; k < d.fired; k++) {
            const i = order[k]
            got.fired[i] = d.e
            if (file.cues[i].do === 'wait' && d.wait?.cue !== i) got.passed[i] = true
            if (file.cues[i].do === 'wait' && d.wait?.cue === i) gapBefore = was.wait ? d.e - d.t : (was.e ?? 0) - (was.t ?? 0)
          }
          if (d.wait) got.holds[d.wait.cue] = round3(d.e - d.t - gapBefore)
          for (const [who, w] of Object.entries((was.walks ?? {}) as Record<string, { cue: number; since: number }>)) {
            if (d.walks?.[who]?.cue === w.cue) continue
            const c = file.cues[w.cue]
            got.arrive[w.cue] = d.e
            got.limited[w.cue] = !d.done && d.e - w.since >= (c.limit ?? file.limit) - TOLERANCE
          }
          while (d.e >= sample * EVERY - TOLERANCE) {
            for (const [name, id] of Object.entries(d.cast as Record<string, number>)) {
              const r = truthOf()!.rows.find(r => r.id === id)
              if (r) (got.paths[name] ??= []).push([...r.data.pos])
            }
            sample++
          }
          got.total = d.e
          was = structuredClone(d)
          if (d.done) {
            got.done = true
            break
          }
        }
        if (got.done) break
        await turn()
      }
      if (!going()) return
      measures.set(t.scene, got)
    } catch (e) {
      failed.set(key, (e as Error).message)
      ed.error(`cutscene: ${(e as Error).message}`)
    } finally {
      // Its seat let go; a closed recorder steps nothing (`recorder.addon.ts`).
      replaying?.link.close()
      if (passes.get(t.scene)?.key === key) passes.delete(t.scene)
      changed()
    }
  }

  // Puts the session at elapsed time `e` of `t`'s scene, the scene started at step 1 first, and plays
  // it from there with `play`.
  async function seekTo(t: Target, e: number, play: boolean) {
    const s = ed.need()
    await arm(t)
    await goTo(startOf(t) + Math.round(e / dt()))
    if (play) s.play()
    changed()
  }

  // ---------------------------------------------------------------- edits

  // Writes edits of a cue file as one change through `e`, or refuses them, saying why. The edits are
  // made by `make`, and the panel's selection after them by `select`, from the file of `scene`, the
  // panel's when it is undefined, as the change written before this one left it: each waits on the
  // editor's one chain of writes (`onChain`), every write of the editor's asked for before it made,
  // and a run of nudges not yet written is written first. The edits are written as `make` makes
  // them, a cue whose kind changed written whole, and not field by field as `liveWrite` would.
  // Answers the model the edits were made from, and throws what `make` threw, the refusal, or the
  // write's failure.
  type Edit = { at: At; value: unknown }
  type Make = (m: Model) => Edit[]
  function queue(scene: string | undefined, make: Make, select: ((m: Model) => string[]) | undefined, e: Pick<Edits, 'editFiles'>): Promise<Model | undefined> {
    flushNudge()
    return onChain(ed, () => land(scene, make, select, e))
  }
  // Once every write asked for before it is made.
  const settled = () => onChain(ed, () => {})
  // A change of the panel's, whose refusal is said in its error line and the console.
  function write(make: Make, select?: (m: Model) => string[]): Promise<void> {
    return queue(undefined, make, select, ed).then(() => {}, (e: Error) => {
      studio.error = e instanceof Refusal ? e.why : e.message
      if (!ed.said(e)) ed.error(e instanceof Refusal ? e.message : `cutscene: ${e.message}`)
      changed()
    })
  }
  async function land(scene: string | undefined, make: Make, select: ((m: Model) => string[]) | undefined, through: Pick<Edits, 'editFiles'>) {
    const m = scene === undefined ? model() : model(targetOf(scene))
    if (!m) return undefined
    const edits = make(m)
    if (!edits.length) return m
    const why = refusal(m, edited(m.file, edits))
    if (why) throw new Refusal(m.target.path, why)
    // The error line is the panel's last change refused: a change of its own clears it.
    if (scene === undefined) studio.error = undefined
    if (select) studio.selected = select(m)
    try {
      await through.editFiles(edits.map(e => ({ file: m.target.path, ...e })))
    } finally {
      changed()
    }
    return m
  }

  const refusal = (m: Model, next: Script): string | undefined => {
    try {
      check(m.target.name, next)
    } catch (e) {
      return (e as Error).message
    }
    const marks = m.marks.map(k => k.name)
    const stranger = fresh(strangers(m.file, marks), strangers(next, marks), u => `${u.field} ${u.name}`)
    if (stranger) return `no cast member or mark is named ${stranger.name}: the cast is ${m.cast.join(', ')}, and the marks are ${marks.join(', ') || 'none'}`
    const s = ed.session!
    const scenes = ed.scenesWith()
    if (next.go !== undefined && next.go !== m.file.go && !scenes.includes(next.go)) return `go ${next.go} is no scene of ${s.game.name}: its scenes are ${scenes.join(', ')}`
    const rigs = Object.fromEntries(Object.entries(next.cast).map(([name, c]) => [name, m.rigs[name] ?? rigOf(s.files.get(m.target.scenePath)!, c.kind)]))
    return fresh(badNames(m.file, m.rigs, m.sounds), badNames(next, rigs, m.sounds), b => b.text)?.text
  }
  // The first of `after` that `before` has fewer of, by `key`, which names the name and not the cue's
  // place: a name the change writes, and not one the file had that a cue taken out before it moves.
  function fresh<T>(before: T[], after: T[], key: (v: T) => string): T | undefined {
    const had = new Map<string, number>()
    for (const v of before) had.set(key(v), (had.get(key(v)) ?? 0) + 1)
    return after.find(v => {
      const n = had.get(key(v)) ?? 0
      had.set(key(v), n - 1)
      return n <= 0
    })
  }

  // Cue `i` of the file, which a call may name wrongly: one it has not got is refused, naming those
  // it has.
  const cueAt = (m: Model, i: number): Cue => {
    const c = m.file.cues[i]
    if (!c) throw new Error(`${m.target.path} has no cue ${i}: ${m.file.cues.length ? `its cues are 0 to ${m.file.cues.length - 1}` : 'it has no cues'}`)
    return c
  }
  // Cues `ids`, each named once.
  const cuesAt = (m: Model, ids: number[]): Cue[] => ids.map((i, k) => {
    if (ids.indexOf(i) !== k) throw new Error(`cue ${i} is named twice`)
    return cueAt(m, i)
  })
  // The fields a call hands for a cue of kind `values.do`, else `does`, parsed as `fieldsOf` holds
  // them, with null taken out, as undefined, from a field that may be left out.
  const fieldsFor = (m: Model, values: Record<string, unknown>, does: string, at: boolean): Record<string, unknown> => {
    const to = values.do ?? does
    if (typeof to !== 'string' || !Object.hasOwn(CUES, to)) throw new Error(`do ${text(to)} is no kind of cue: the kinds are ${DOS.join(', ')}`)
    const got = fieldsOf(m.file, to, at).safeParse(values)
    if (!got.success) throw new Error(`a ${to} cue: ${z.prettifyError(got.error)}`)
    return Object.fromEntries(Object.entries(got.data).map(([k, v]) => [k, v === null && CUES[to][k]?.endsWith('?') ? undefined : v]))
  }

  // A new cue of kind `to` at `at`, from what `from` had that it keeps. A shot is named for the first
  // number after the shots there are that no shot has; a sound in a scene with no sound cues is
  // refused, since it could play none (`soundless`).
  const made = (m: Model, to: string, at: number, from: Partial<Cue> = {}): Cue => {
    const who = typeof from.who === 'string' && m.cast.includes(from.who) ? from.who : m.cast[0]
    const firstClip = (w: string) => m.clips(w)[0] ?? 'idle'
    const mark = m.marks[0]?.name ?? [0, 0]
    switch (to) {
      case 'play': return { at, do: 'play', who, clip: firstClip(who), holds: false, rate: 1 }
      case 'gesture': return { at, do: 'gesture', who, clip: firstClip(who) }
      case 'walk': return { at, do: 'walk', who, to: from.to ?? mark, gear: m.gears(who)[0] ?? null }
      case 'face': return { at, do: 'face', who, to: from.to ?? mark }
      case 'say': return { at, do: 'say', who, text: typeof from.text === 'string' ? from.text : '…', for: 3 }
      case 'wait': return { at, do: 'wait', who: from.who === 'line' ? 'line' : who }
      case 'shot': return { at, do: 'shot', ...view3(m), over: 0 }
      case 'fade': return { at, do: 'fade', to: 1, over: 1 }
      case 'bars': return { at, do: 'bars', on: true, over: 1 }
      case 'shake': return { at, do: 'shake', over: 1, amp: 0.3 }
      case 'sound': {
        const none = soundless(m)
        if (none) throw new Error(none)
        return { at, do: 'sound', cue: m.sounds[0] }
      }
      case 'music': return { at, do: 'music', name: '' }
    }
    throw new Error(`${to} is not a cue`)
  }

  // Cue `c` with `values` set on it, a value undefined taken out, and `do` left as it is. A shot
  // given nobody to follow lets go of its `frame` with it, and one given somebody, while its `pos` is
  // no offset [x, y, z] and the values give none, is set 4 m behind and 2 m over its member.
  const overlay = (c: Cue, values: Record<string, unknown>): Cue => {
    const next: Cue = { ...c }
    for (const [f, v] of Object.entries(values)) {
      if (f === 'do') continue
      if (v === undefined) delete next[f]
      else next[f] = structuredClone(v)
    }
    if (next.do === 'shot' && 'follows' in values) {
      if (next.follows === undefined && !('frame' in values)) delete next.frame
      if (next.follows !== undefined && !('pos' in values) && !(Array.isArray(next.pos) && next.pos.length === 3)) next.pos = [0, 2, -4]
    }
    return next
  }

  // Cue i's fields set to `values`, as its form sets them: a `do` of another kind makes it a cue of
  // that kind at its `at`, from what it had that the kind keeps (`made`), written whole; else each
  // field that changed is written, and one set to undefined taken out.
  const patched = (m: Model, i: number, values: Record<string, unknown>): Edit[] => {
    const c = cueAt(m, i)
    const to = typeof values.do === 'string' ? values.do : c.do
    if (to !== c.do) return [{ at: ['cues', i], value: overlay(made(m, to, c.at, c), values) }]
    const next = overlay(c, values)
    return [...new Set([...Object.keys(c), ...Object.keys(next)])].filter(k => text(c[k]) !== text(next[k])).map(k => ({ at: ['cues', i, k] as At, value: next[k] }))
  }

  // The kind of cue lane `lane`'s `+` makes; a lane there is not is refused, naming those there are.
  const laneDo = (m: Model, lane: string) => {
    if (!m.lanes.includes(lane)) throw new Error(`no lane ${lane}: the lanes are ${m.lanes.join(', ')}`)
    return m.cast.includes(lane) ? 'play' : LANES[lane]
  }
  // A cue made on `lane` at elapsed time `at`, as the lane's `+` makes it, with `values` over it: its
  // kind the values' `do`, else the lane's, and a cast member's lane its `who`.
  const addEdits = (m: Model, lane: string, at: number, values: Record<string, unknown> = {}): Edit[] => {
    const own = laneDo(m, lane)
    const to = typeof values.do === 'string' ? values.do : own
    return [{ at: ['cues', m.file.cues.length], value: overlay(made(m, to, m.toCue(at), m.cast.includes(lane) ? { who: lane } : {}), values) }]
  }

  // Cues moved as the timeline moves them: each to elapsed time `at`, back on the cue clock without
  // the holds before it but its own; onto the lane `lane` names, another cast member's, which it
  // is then the cue of; and a say, a shot, a fade, the bars or a shake to length `len` in seconds.
  // A time past the end, a lane the cue may not go to, or a length a cue has none of, is refused.
  type Moving = { cue: number; at?: number; lane?: string; len?: number }
  const moveEdits = (m: Model, moves: Moving[]): Edit[] => {
    cuesAt(m, moves.map(mv => mv.cue))
    return moves.flatMap(({ cue: i, at, lane, len }) => {
      const c = m.file.cues[i], chip = m.chips[i]
      const out: Edit[] = []
      if (at !== undefined) {
        if (at > m.end + PAST) throw new Error(`cue ${i} moved to ${at} s would be past the end, ${m.end} s elapsed`)
        out.push({ at: ['cues', i, 'at'], value: m.toCue(at, i) })
      }
      if (lane !== undefined && lane !== chip.lane) {
        if (!chip.lanes?.includes(lane)) throw new Error(`cue ${i}, a ${c.do} on ${chip.lane}, goes onto ${chip.lanes ? `a cast member's lane: ${chip.lanes.join(', ')}` : 'no other lane'}`)
        out.push({ at: ['cues', i, 'who'], value: lane })
      }
      if (len !== undefined) {
        const field = Object.hasOwn(LENGTHS, c.do) ? LENGTHS[c.do] : undefined
        if (!field) throw new Error(`cue ${i}, a ${c.do}, has no length: the cues with one are ${Object.entries(LENGTHS).map(([d, f]) => `${d} (${f})`).join(', ')}`)
        out.push({ at: ['cues', i, field], value: round3(len) })
      }
      return out.filter(o => text(o.value) !== text(c[o.at[2] as string]))
    })
  }

  // Cues taken out, the last first, so each is where it was.
  const removeEdits = (m: Model, ids: number[]): Edit[] => {
    cuesAt(m, ids)
    return [...ids].sort((a, b) => b - a).map(i => ({ at: ['cues', i] as At, value: undefined }))
  }

  // Copies of `cues` put after the file's last, the earliest at `from` on the cue clock and the rest
  // as far after it as they were.
  const pasteEdits = (m: Model, cues: Cue[], from: number): Edit[] => {
    if (!cues.length) return []
    const lo = Math.min(...cues.map(c => c.at))
    return cues.map((c, k) => ({ at: ['cues', m.file.cues.length + k] as At, value: { ...structuredClone(c), at: round3(from + c.at - lo) } }))
  }
  // Where Duplicate puts copies of cues `ids`: after their end, in elapsed time, and half a second
  // after it when they are points at one time; on the cue clock.
  const after = (m: Model, ids: number[]) => {
    const chips = ids.map(i => m.chips[i])
    const lo = Math.min(...chips.map(c => c.at)), hi = Math.max(...chips.map(c => c.at + (c.length ?? 0)))
    return m.toCue(hi) + (hi === lo ? GRAIN * 10 : 0)
  }

  // The file's own `end`, `go` and `arrive` set to `values`, each that changed; undefined takes one out.
  const fileEdits = (m: Model, values: Record<string, unknown>): Edit[] =>
    Object.entries(values).filter(([f, v]) => text((m.file as Record<string, unknown>)[f]) !== text(v)).map(([f, value]) => ({ at: [f], value }))

  // The camera the game view draws from; and where a camera stands, the way it looks and its fov, as
  // they are now.
  const camera = () => ed.session?.client?.plugins.render3d?.camera as THREE.PerspectiveCamera | undefined
  type Eye = { pos: number[]; dir: number[]; fov: number }
  const eyeOf = (c: THREE.PerspectiveCamera): Eye => {
    c.updateMatrixWorld()
    return { pos: c.getWorldPosition(new THREE.Vector3()).toArray(), dir: c.getWorldDirection(new THREE.Vector3()).toArray(), fov: c.fov }
  }
  // The point 10 m ahead of an eye.
  const ahead = (eye: Eye) => eye.pos.map((v, k) => v + eye.dir[k] * 10)
  // The ground the scene's points stand on, as the game view's client has it: undefined while the
  // game view shows another scene or its ground is not made yet.
  const heightIn = (m: Model): Height | undefined => {
    const client = ed.session?.client
    return client && ed.session?.viewing === m.target.scene ? heightOf(client.plugins) : undefined
  }
  // A shot of the current view: its pos, a point 10 m ahead to look at, its fov, both points over the
  // ground; with no camera or no ground, 2 m up and 6 m back from the origin, looking at the first
  // cast member.
  const view3 = (m: Model) => {
    const c = camera(), height = heightIn(m)
    const shots = m.file.cues.filter(c => c.do === 'shot')
    let k = shots.length + 1
    while (shots.some(s => s.name === `shot${k}`)) k++
    if (!c || !height) return { name: `shot${k}`, pos: [0, 2, -6], look: m.cast[0] ?? [0, 0], fov: m.file.fov }
    const eye = eyeOf(c)
    return { name: `shot${k}`, pos: rooted(eye.pos, height).map(round3), look: rooted(ahead(eye), height).map(round3), fov: Math.min(179, Math.max(1, Math.round(eye.fov))) }
  }

  // The live rows of the scene the panel works on, and the cast's ids among them by name.
  const live = (t: Target) => ed.session?.scenes().get(t.scene)?.rows ?? []
  const castIds = (m: Model, rows: Row[]) => Object.fromEntries(Object.entries(m.file.cast).flatMap(([name, c]) => {
    const r = rows.find(r => r.kind === c.kind && r.data.name === name) ?? rows.find(r => r.kind === c.kind && r.data.name === c.name)
    return r ? [[name, r.id]] : []
  }))
  const shotView = (m: Model, c: Cue): View => ({
    pos: c.pos, look: c.look, fov: c.fov ?? m.file.fov, head: m.file.head,
    ...(c.follows !== undefined && { follows: c.follows }), ...(c.frame !== undefined && { frame: c.frame }),
  })

  // Cue i, which must be a shot.
  const shotAt = (m: Model, i: number): Cue => {
    const c = cueAt(m, i)
    if (c.do !== 'shot') throw new Error(`cue ${i} is a ${c.do}, not a shot: the shots are ${m.file.cues.flatMap((c, k) => (c.do === 'shot' ? [k] : [])).join(', ') || 'none'}`)
    return c
  }
  const noGround = (m: Model) => `the game view has no ground of ${m.target.scene} yet to write a shot that follows nobody over`
  // The `pos` that stands shot c's camera on world point p: the point `[x, up, z]` over the ground
  // for a shot that follows nobody; else its offset from the member it follows as that member stands
  // now, turned into the member's own axes for `frame: "body"`.
  const posAt = (m: Model, c: Cue, p: number[], height: Height | undefined): number[] => {
    if (c.follows === undefined) {
      if (!height) throw new Error(noGround(m))
      return rooted(p, height).map(round3)
    }
    const rows = live(m.target)
    const r = rows.find(r => r.id === castIds(m, rows)[c.follows])
    if (!r) throw new Error(`${c.follows}, whom shot ${c.name} follows, has no row to stand its camera by`)
    const [dx, dy, dz] = [p[0] - r.data.pos[0], p[1] - r.data.pos[1], p[2] - r.data.pos[2]]
    if (c.frame !== 'body') return [dx, dy, dz].map(round3)
    const co = Math.cos(r.data.yaw), si = Math.sin(r.data.yaw)
    return [dx * co - dz * si, dy, dx * si + dz * co].map(round3)
  }
  // The view a camera has, `eye`, into shot i: `pos` (`posAt`) and `fov`; a `look` that names
  // something is kept, and a point is made the point 10 m ahead, over the ground.
  const takeEdits = (m: Model, i: number, eye: Eye, height: Height | undefined): Edit[] => {
    const c = shotAt(m, i)
    if (!height && (c.follows === undefined || typeof c.look !== 'string')) throw new Error('the game view has no ground of this scene to take the view over')
    const edits: Edit[] = [
      { at: ['cues', i, 'pos'], value: posAt(m, c, eye.pos, height) },
      { at: ['cues', i, 'fov'], value: Math.min(120, Math.max(10, Math.round(eye.fov))) },
    ]
    if (typeof c.look !== 'string') edits.push({ at: ['cues', i, 'look'], value: rooted(ahead(eye), height!).map(round3) })
    return edits
  }
  // Shot i's camera stood on world point `to`, as its frustum's apex is dragged there.
  const standEdits = (m: Model, i: number, to: number[], height: Height | undefined): Edit[] =>
    [{ at: ['cues', i, 'pos'], value: posAt(m, shotAt(m, i), to, height) }]
  // A target picked at world point `at`, [x, y, z] or [x, z], for field `field` of a walk or a face:
  // the mark within `NEAR` of it on the ground, or the point.
  const pickEdits = (m: Model, i: number, field: string, at: number[]): Edit[] => {
    const c = cueAt(m, i)
    if (!PICKED.includes(c.do)) throw new Error(`cue ${i} is a ${c.do}, and a target is picked for a walk or a face: the walks and faces are ${m.file.cues.flatMap((c, k) => (PICKED.includes(c.do) ? [k] : [])).join(', ') || 'none'}`)
    const [x, z] = [at[0], at[at.length - 1]]
    const mark = m.marks.find(k => Math.hypot(k.at[0] - x, k.at[k.at.length - 1] - z) <= NEAR)
    return [{ at: ['cues', i, field], value: mark ? mark.name : [round3(x), round3(z)] }]
  }

  // A drag's selection, nudged by `by` seconds, kept inside the scene.
  const nudged = (m: Model, ids: string[], by: number) =>
    moveEdits(m, ids.filter(id => m.file.cues[Number(id)]).map(id => ({ cue: Number(id), at: Math.min(m.end, Math.max(0, m.elapsed(Number(id)) + by)) })))
  function flushNudge() {
    const n = nudging
    if (!n) return
    clearTimeout(n.timer)
    nudging = undefined
    void write(m => nudged(m, n.ids, n.by))
  }

  // Cues pasted after the file's last, as `pasteEdits` puts them, and selected.
  const paste = (cues: (m: Model) => Cue[], at: (m: Model) => number) =>
    write(m => pasteEdits(m, cues(m), at(m)), m => cues(m).map((_, k) => String(m.file.cues.length + k)))

  // ---------------------------------------------------------------- the studio

  const studio: Studio = {
    subscribe(f) {
      listeners.add(f)
      return () => { listeners.delete(f) }
    },
    version: () => version,
    selected: [],
    error: undefined,
    picking: undefined,
    problems: false,
    scrub: undefined,
    nudging: () => nudging && { ids: nudging.ids, by: nudging.by },
    model() {
      const m = model()
      if (m && ed.session) {
        if (!armed(m.target)) void arm(m.target)
        else void measure(m.target)
      }
      return m
    },
    head() {
      if (studio.scrub !== undefined) return studio.scrub
      const t = target()
      return t ? headOf(t) : 0
    },
    looking: () => ed.holds.some(h => h.who === 'cutscene.look'),
    mounted(on) {
      mounted += on ? 1 : -1
      if (!on && !mounted) flushNudge()
      draw()
    },
    select(ids) {
      if (nudging && text(nudging.ids) !== text(ids)) flushNudge()
      studio.selected = ids
      changed()
    },
    seek(e, done) {
      const t = target()
      if (!t) return
      if (!done) {
        studio.scrub = e
        changed()
        return
      }
      studio.scrub = undefined
      void seekTo(t, e, false)
    },
    here() {
      const t = target()
      if (!t) return
      flushNudge()
      void settled().then(() => seekTo(t, studio.head(), true))
    },
    move(moves, done) {
      if (!done) return
      void write(m => moveEdits(m, moves.filter(mv => m.file.cues[Number(mv.id)]).map(mv => ({ cue: Number(mv.id), at: mv.at, lane: mv.lane }))))
    },
    resize(id, length, done) {
      if (!done) return
      void write(m => (m.file.cues[Number(id)] ? moveEdits(m, [{ cue: Number(id), len: length }]) : []))
    },
    setEnd(e, done) {
      if (!done) return
      void write(m => fileEdits(m, { end: m.toCue(e) }))
    },
    key(e) {
      const m = model()
      if (!m) return
      const mod = e.metaKey || e.ctrlKey
      const ids = studio.selected.filter(id => m.file.cues[Number(id)])
      if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
        e.preventDefault()
        // The selection goes at once, so a press again before this is written takes nothing more.
        const at = ids.map(Number)
        studio.selected = []
        changed()
        void write(m => removeEdits(m, at))
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && ids.length) {
        e.preventDefault()
        const by = e.key === 'ArrowRight' ? GRAIN : -GRAIN
        if (nudging && text(nudging.ids) === text(ids)) {
          clearTimeout(nudging.timer)
          nudging.by = round3(nudging.by + by)
        } else {
          flushNudge()
          nudging = { ids, by, timer: 0 as unknown as ReturnType<typeof setTimeout> }
        }
        nudging.timer = setTimeout(flushNudge, NUDGED)
        changed()
      } else if (mod && e.key.toLowerCase() === 'c' && ids.length) {
        e.preventDefault()
        clipboard = ids.map(id => structuredClone(m.file.cues[Number(id)]))
        void navigator.clipboard?.writeText(JSON.stringify(clipboard)).catch(() => {})
      } else if (mod && e.key.toLowerCase() === 'v' && clipboard.length) {
        e.preventDefault()
        const cues = clipboard, head = studio.head()
        void paste(() => cues, m => m.toCue(head))
      } else if (mod && e.key.toLowerCase() === 'd' && ids.length) {
        e.preventDefault()
        const some = (m: Model) => ids.map(Number).filter(i => m.file.cues[i])
        void paste(m => some(m).map(i => m.file.cues[i]), m => after(m, some(m)))
      }
    },
    add(lane) {
      const head = studio.head()
      void write(m => addEdits(m, lane, head), m => [String(m.file.cues.length)])
    },
    set(i, field, value) { studio.patch(i, { [field]: value }) },
    // Fields of one cue, set together as one change; a field set to undefined is taken out.
    patch(i, values) {
      void write(m => (m.file.cues[i] ? patched(m, i, values) : []))
    },
    setFile(field, value) {
      void write(m => fileEdits(m, { [field]: value }))
    },
    convert(i, to) {
      void write(m => (m.file.cues[i] ? patched(m, i, { do: to }) : []))
    },
    // The view the stage camera has as it is pressed, into a shot (`takeEdits`).
    take(i) {
      const cam = camera()
      if (!cam) return
      const eye = eyeOf(cam)
      void write(m => takeEdits(m, i, eye, heightIn(m)))
    },
    pick(i, field) {
      studio.picking = { cue: i, field }
      ed.activate('cutscene')
      changed()
    },
    look(on) {
      if (on) ed.holdOrbit('cutscene.look')
      else ed.releaseOrbit('cutscene.look')
      changed()
    },
    showProblems(on) {
      studio.problems = on
      changed()
    },
    // A target typed as text: a cast member's or a mark's name, or two or three numbers, [x, z] or
    // [x, up, z]; anything
    // else is refused, with the reason, as undefined.
    target(value) {
      const m = model()
      const v = value.trim()
      if (m && (m.cast.includes(v) || m.marks.some(k => k.name === v))) return v
      const nums = v.split(/[\s,]+/).filter(Boolean).map(Number)
      if ((nums.length === 2 || nums.length === 3) && nums.every(Number.isFinite)) return nums
      studio.error = `${JSON.stringify(value)} is neither a cast member, a mark nor [x, z] or [x, up, z]`
      ed.error(`cutscene: refused: ${studio.error}`)
      changed()
      return undefined
    },
  }

  function CutscenePanel() {
    return <Cutscene studio={studio} />
  }
  ed.panel({ id: 'cutscene', title: 'Cutscene', area: 'bottom', component: CutscenePanel })

  // ---------------------------------------------------------------- the stage

  const drawing = new THREE.Group()
  const clear = () => {
    for (const o of drawing.children as THREE.Line[]) {
      o.geometry.dispose()
      ;(o.material as THREE.Material).dispose()
    }
    drawing.clear()
  }
  const colour = (name: string) => new THREE.Color().setStyle(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'white')
  // Each thing drawn is named for what it shows: `mark <name>`, `shot <cue>`, `dolly <cue>`, `path
  // <member>` and `pick`.
  const lines = (name: string, points: number[][], c: THREE.Color, strip = true) => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(points.flat()), 3))
    const mat = new THREE.LineBasicMaterial({ color: c, depthTest: false })
    const line = strip ? new THREE.Line(g, mat) : new THREE.LineSegments(g, mat)
    line.name = name
    drawing.add(line)
  }
  const ring = (name: string, at: number[], r: number, c: THREE.Color) =>
    lines(name, Array.from({ length: 49 }, (_, s) => [at[0] + r * Math.cos((s / 48) * 2 * Math.PI), at[1] + 0.05, at[2] + r * Math.sin((s / 48) * 2 * Math.PI)]), c)
  const frustum = (name: string, p: Pose, c: THREE.Color) => {
    const q = new THREE.Quaternion(...p.quat)
    const h = DEPTH * Math.tan((p.fov * Math.PI) / 360), w = h * ASPECT
    const at = (x: number, y: number) => new THREE.Vector3(x, y, -DEPTH).applyQuaternion(q).add(new THREE.Vector3(...p.pos)).toArray()
    const k = [at(-w, -h), at(w, -h), at(w, h), at(-w, h)]
    lines(name, [p.pos, k[0], p.pos, k[1], p.pos, k[2], p.pos, k[3], k[0], k[1], k[1], k[2], k[2], k[3], k[3], k[0]], c, false)
  }
  // Each shot's cue and its pose on the rows as they stand, with a dragged apex where it is dragged to.
  const poses = (m: Model) => {
    const rows = live(m.target)
    const cast = castIds(m, rows)
    const height = heightIn(m)
    if (!height) return []
    return sorted(m.file.cues).filter(i => m.file.cues[i].do === 'shot').flatMap(i => {
      const p = view(shotView(m, m.file.cues[i]), cast, rows, height)
      if (!p) return []
      if (dragging?.cue === i && dragging.to) p.pos = dragging.to
      return [{ cue: i, pose: p }]
    })
  }
  function draw() {
    clear()
    const overlay = ed.staged?.overlay as THREE.Scene | undefined
    const m = mounted && overlay ? model() : undefined
    if (!m || !overlay) {
      drawing.removeFromParent()
      return
    }
    if (drawing.parent !== overlay) overlay.add(drawing)
    const accent = colour('--accent'), dim = colour('--dim'), warn = colour('--warn')
    const rows = live(m.target)
    const height = heightIn(m)
    if (height) for (const r of rows.filter(r => r.kind === 'mark')) ring(`mark ${r.data.name}`, placed(r.data.at, height), NEAR, dim)
    let before: Pose | undefined
    for (const { cue, pose } of poses(m)) {
      const on = studio.selected.includes(String(cue))
      frustum(`shot ${cue}`, pose, on ? accent : dim)
      if (before && m.file.cues[cue].over > 0) lines(`dolly ${cue}`, [before.pos, pose.pos], on ? accent : dim)
      before = pose
    }
    for (const [who, path] of Object.entries(m.measured?.paths ?? {})) if (path.length > 1) lines(`path ${who}`, path.map(p => [p[0], p[1] + 0.1, p[2]]), warn)
    if (pointed && studio.picking) ring('pick', pointed, NEAR, accent)
  }
  // Drawn again for a change of what it is drawn from: the game (the rows, the client's ground), the
  // texts its model is made from, the stage, and the theme, whose colours it is drawn in.
  const off = ed.subscribe(() => { if (mounted) draw() }, ['game', 'texts', 'tools', 'theme'])
  // Turned off, the stage is drawn no more and what is on it is taken away.
  ed.onDrop(() => {
    off()
    clear()
    drawing.removeFromParent()
  })

  // The world point drawn under a canvas point: the first surface of render3d's scene, else the
  // ground.
  const under = (p: Pointer): number[] | undefined => {
    const r = ed.session?.client?.plugins.render3d
    const ray = p.stage.ray(p.x, p.y)
    if (r?.scene && ray) {
      const caster = new THREE.Raycaster(new THREE.Vector3(...ray.origin), new THREE.Vector3(...ray.dir))
      for (const h of caster.intersectObject(r.scene as THREE.Scene, true)) {
        const mat = (h.object as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
        const one = Array.isArray(mat) ? mat[0] : mat
        if (h.object.visible && one?.visible !== false && one?.depthWrite) return h.point.toArray()
      }
    }
    return p.stage.ground(p.x, p.y)
  }
  // The canvas point a world point is drawn at.
  const onCanvas = (at: number[]) => {
    const c = camera(), cv = ed.session?.client?.plugins.render3d?.canvas as HTMLCanvasElement | undefined
    if (!c || !cv) return undefined
    c.updateMatrixWorld()
    const v = new THREE.Vector3(...at).project(c)
    return v.z > 1 ? undefined : [((v.x + 1) / 2) * cv.width, ((1 - v.y) / 2) * cv.height]
  }

  ed.tool({
    id: 'cutscene',
    title: 'Cutscene',
    key: 'K',
    cursor: 'crosshair',
    hover(p) {
      pointed = p && studio.picking ? under(p) : undefined
      draw()
    },
    down(p) {
      const m = model()
      if (!m) return
      if (studio.picking) {
        const at = under(p)
        const { cue, field } = studio.picking
        studio.picking = undefined
        if (!at) return changed()
        void write(m => pickEdits(m, cue, field, at))
        return
      }
      const hit = poses(m).map(s => ({ ...s, px: onCanvas(s.pose.pos) })).filter(s => s.px && Math.hypot(s.px[0] - p.x, s.px[1] - p.y) <= GRAB)
      if (!hit.length) return
      const { cue, pose } = hit[0]
      const grab = p.stage.plane(p.x, p.y, pose.pos)
      if (!grab) return
      dragging = { cue, apex: pose.pos, grab }
      studio.select([String(cue)])
    },
    move(p) {
      const d = dragging
      if (!d) return
      const now = p.stage.plane(p.x, p.y, d.apex)
      if (!now) return
      d.to = d.apex.map((v, k) => v + now[k] - d.grab[k])
      draw()
    },
    up() {
      const d = dragging
      dragging = undefined
      if (!d?.to) return draw()
      const to = d.to
      void write(m => standEdits(m, d.cue, to, heightIn(m))).then(draw)
    },
    off() {
      dragging = undefined
      pointed = undefined
      studio.picking = undefined
      draw()
    },
  })

  // ---------------------------------------------------------------- the commands

  // Scene `scene`'s cue file for a command, with every rig its cast plays from read, and the changes
  // made before it written; with `timed`, the session started at step 1 and this version of the files
  // measured, as the panel's is once it has drawn. Answers its target and model.
  async function prepared(scene: string, timed = false): Promise<{ t: Target; m: Model }> {
    const t = targetOf(scene)
    await ed.text(t.path)
    const file = read(t.path) as Script | undefined
    if (!file || !Array.isArray(file.cues) || !file.cast) throw new Error(`${t.path} is no cue file: it has no cast and no list of cues`)
    const sceneFile = ed.need().files.get(t.scenePath)!
    for (const c of Object.values(file.cast)) {
      const path = rigPath(sceneFile, c.kind)
      if (path !== undefined) await ed.text(path)
    }
    flushNudge()
    await settled()
    if (timed) {
      await arm(t)
      if (!armed(t)) throw new Error(`${scene} could not be started at step 1: the console says why`)
      await measure(t)
    }
    return { t, m: model(t)! }
  }
  // The client the game view draws `scene` with, for what only it holds: its camera and its ground.
  const clientOf = (scene: string) => ed.need().clientOn(scene)
  // The cues `ids` of `t`'s file as its change left them, each with its place.
  const cuesOf = (t: Target, ids: number[]) => {
    const file = read(t.path) as Script
    return { file: t.path, cues: ids.map(i => ({ cue: i, fields: file.cues[i] })) }
  }
  // A change of a command's, through the edits of its call, and the cues it left: `ids` of the file
  // as the change was made from it.
  const change = async (t: Target, e: Edits, make: Make, ids: (m: Model) => number[]) => {
    const m = await queue(t.scene, make, undefined, e)
    return cuesOf(t, m ? ids(m) : [])
  }
  // Whether the measure is of the files as they are, and, when its pass threw, why.
  const measuredNow = (t: Target) => {
    const key = measureKey(t)
    return { measured: measures.get(t.scene)?.key === key, ...(failed.has(key) && { failed: failed.get(key) }) }
  }
  const finite = (v: number) => (Number.isFinite(v) ? v : null)

  const scene = z.string().describe('a scene with a cutscene row')
  const cue = z.number().int().min(0).describe('a cue, by its place in the file')
  const cues = z.array(cue).min(1).describe('cues, by their places in the file')
  const fields = z.record(z.string(), VALUE)
  const point = z.array(z.number()).length(3).describe('a world point [x, y, z]')

  ed.command({
    id: 'cutscene.read',
    title: 'Cutscene: read',
    input: z.object({ scene }).describe(`A scene's cue file as the Cutscene panel shows it: lanes, each cue with its lane, elapsed time e, length and note, holds, end (cue clock) and ends (elapsed), go, arrive, cast, marks, sounds, playhead and problems. Times are elapsed seconds, all waits held, but a cue's own at, on the cue clock. ${OUTLINE}`),
    run: async ({ scene }) => {
      const { t, m } = await prepared(scene, true)
      return {
        scene, file: t.path, ...measuredNow(t), lanes: m.lanes,
        cues: outlined(m.file.cues.map((c, i) => {
          const chip = m.chips[i]
          return { cue: i, fields: c, lane: chip.lane, e: chip.at, ...(chip.length !== undefined && { length: round3(chip.length) }), note: m.note(i) }
        })),
        holds: m.holdMarks.map(h => ({ e: h.at, length: round3(h.length) })),
        end: m.file.end, ends: m.end, go: m.file.go ?? null, arrive: m.file.arrive ?? null,
        cast: m.file.cast, marks: m.marks, sounds: m.sounds, playhead: headOf(t), looking: studio.looking(), problems: m.problems,
      }
    },
  })
  ed.command({
    id: 'cutscene.report',
    title: 'Cutscene: report',
    input: z.object({ scene }).describe('What the measure pass found playing the scene\'s cue file: its problems, the step e counts from, the e it reached and whether it ended, and by cue the e each fired at, the seconds each wait held and whether it passed with nothing to wait for, the e each walk ended at and whether at its limit; and each cast member\'s feet every 0.25 s.'),
    run: async ({ scene }) => {
      const { t, m } = await prepared(scene, true)
      const now = measuredNow(t)
      const me = now.measured ? m.measured! : undefined
      return {
        scene, file: t.path, ...now, problems: m.problems,
        ...(me && {
          start: me.start ?? null, total: me.total, done: me.done,
          fired: me.fired.map(finite), holds: me.holds, passed: me.passed, arrive: me.arrive.map(finite), limited: me.limited, paths: me.paths,
        }),
      }
    },
  })
  ed.command({
    id: 'cutscene.add',
    title: 'Cutscene: add a cue',
    input: z.object({
      scene,
      lane: z.string().describe('a lane: a cast member\'s, camera, say, sound or screen'),
      at: z.number().min(0).describe('elapsed seconds; past the end, as + at a playhead past it, it is listed as a problem'),
      cue: fields.default({}).describe('fields over the cue the lane\'s + makes (a play, shot, say, sound or fade), do among them: of kinds play, gesture, walk, face, say, wait, shot, fade, bars, shake, sound, music'),
    }).describe('Adds a cue on a lane at an elapsed time, as the lane\'s + in the Cutscene panel does, with fields of your own over it, each as the runtime checks it: one undo. Answers the cue.'),
    run: async ({ scene, lane, at, cue }, e) => {
      const { t } = await prepared(scene, true)
      return change(t, e, m => addEdits(m, lane, at, fieldsFor(m, cue, laneDo(m, lane), false)), m => [m.file.cues.length])
    },
  })
  ed.command({
    id: 'cutscene.edit',
    title: 'Cutscene: edit a cue',
    input: z.object({
      scene,
      cue,
      fields: fields.describe('fields to set, by the cue\'s kind (cutscene.read shows them); at is on the cue clock; do makes it a cue of that kind at its at; null takes out a field that may be left out'),
    }).describe('Sets fields of a cue, as its form in the Cutscene panel does, each as the runtime checks it; a shot given nobody to follow drops its frame. One undo, refused when the file would not play. Answers the cue.'),
    run: async ({ scene, cue, fields }, e) => {
      const { t } = await prepared(scene)
      return change(t, e, m => patched(m, cue, fieldsFor(m, fields, cueAt(m, cue).do, true)), () => [cue])
    },
  })
  ed.command({
    id: 'cutscene.move',
    title: 'Cutscene: move cues',
    input: z.object({
      scene,
      cues: z.array(z.object({
        cue,
        at: z.number().min(0).optional().describe('the elapsed seconds it goes to, at most the end; left out, it stays'),
        lane: z.string().optional().describe('another cast member\'s lane, for a cue on one'),
        len: z.number().min(0).optional().describe('seconds: a say\'s for, or a shot\'s, fade\'s, bars\' or shake\'s over'),
      }).describe('a cue and where it goes')).min(1).describe('each cue moved'),
    }).describe('Moves cues together as the Cutscene panel\'s timeline does: to elapsed times, back on the cue clock without the holds before them, onto another member\'s lane, and to other lengths. One undo. Answers the cues.'),
    run: async ({ scene, cues }, e) => {
      const { t } = await prepared(scene, true)
      return change(t, e, m => moveEdits(m, cues), () => cues.map(c => c.cue))
    },
  })
  ed.command({
    id: 'cutscene.remove',
    title: 'Cutscene: remove cues',
    input: z.object({ scene, cues }).describe(`Takes cues out of the file, as Delete does in the Cutscene panel: one undo. Answers the cues left. ${OUTLINE}`),
    run: async ({ scene, cues }, e) => {
      const { t } = await prepared(scene)
      await queue(t.scene, m => removeEdits(m, cues), undefined, e)
      const file = read(t.path) as Script
      const left = cuesOf(t, file.cues.map((_, i) => i))
      return { ...left, cues: outlined(left.cues) }
    },
  })
  ed.command({
    id: 'cutscene.copy',
    title: 'Cutscene: copy cues',
    input: z.object({
      scene,
      cues,
      at: z.number().min(0).optional().describe('elapsed seconds of the earliest copy, as a paste at the playhead; past the end, a problem; left out, after the cues\' end, as Duplicate'),
    }).describe('Copies cues after the file\'s last, the rest as far after the earliest as they were, as copy and paste, or Duplicate, do in the Cutscene panel: one undo. Answers the copies.'),
    run: async ({ scene, cues, at }, e) => {
      const { t } = await prepared(scene, true)
      return change(t, e, m => pasteEdits(m, cuesAt(m, cues), at === undefined ? after(m, cues) : m.toCue(at)), m => cues.map((_, k) => m.file.cues.length + k))
    },
  })
  ed.command({
    id: 'cutscene.end',
    title: 'Cutscene: end',
    input: z.object({
      scene,
      e: z.number().min(0).optional().describe('elapsed seconds the scene ends at, as its bracket is dragged'),
      go: z.string().min(1).nullable().optional().describe('the scene every seat\'s body goes to at the end; null for none'),
      arrive: z.array(z.union([z.number(), z.string(), z.boolean(), z.null()])).nullable().optional().describe('what it arrives with; null for nothing'),
    }).describe('Sets the cue file\'s end, go and arrive, as the Cutscene panel\'s end bracket and End form do: one undo. Answers them.'),
    run: async ({ scene, e: at, go, arrive }, e) => {
      if (at === undefined && go === undefined && arrive === undefined) throw new Error('hand e, go or arrive to set')
      const { t } = await prepared(scene, at !== undefined)
      await queue(t.scene, m => fileEdits(m, {
        ...(at !== undefined && { end: m.toCue(at) }),
        ...(go !== undefined && { go: go ?? undefined }),
        ...(arrive !== undefined && { arrive: arrive ?? undefined }),
      }), undefined, e)
      const file = read(t.path) as Script
      return { file: t.path, end: file.end, go: file.go ?? null, arrive: file.arrive ?? null }
    },
  })
  ed.command({
    id: 'cutscene.take',
    title: 'Cutscene: take the view',
    input: z.object({ scene, cue }).describe('Takes the view the game view is drawn from into a shot, as take the view does in the Cutscene panel: its pos over the ground, or its offset from the member it follows, and its fov, and a look that is a point. Put the view with view.pose first. One undo. Answers the shot.'),
    run: async ({ scene, cue }, e) => {
      const { t, m } = await prepared(scene)
      shotAt(m, cue)
      const client = await clientOf(scene)
      const cam = client.plugins.render3d?.camera as THREE.PerspectiveCamera | undefined
      if (!cam) throw new Error(`the game view draws ${scene} with no render3d camera to take`)
      const eye = eyeOf(cam)
      return change(t, e, m => takeEdits(m, cue, eye, heightOf(client.plugins)), () => [cue])
    },
  })
  ed.command({
    id: 'cutscene.shot',
    title: 'Cutscene: stand a shot',
    input: z.object({ scene, cue, to: point.describe('the world point [x, y, z] its camera stands on') }).describe('Stands a shot\'s camera on a world point, as dragging its frustum\'s apex with the Cutscene tool does: pos over the ground, or the offset from the member it follows. One undo. Answers the shot.'),
    run: async ({ scene, cue, to }, e) => {
      const { t, m } = await prepared(scene)
      const height = shotAt(m, cue).follows !== undefined ? undefined : heightOf((await clientOf(scene)).plugins)
      return change(t, e, m => standEdits(m, cue, to, height), () => [cue])
    },
  })
  ed.command({
    id: 'cutscene.pick',
    title: 'Cutscene: pick a target',
    input: z.object({
      scene,
      cue,
      at: z.array(z.number()).min(2).max(3).describe('the world point picked, [x, y, z], or [x, z] on the ground'),
    }).describe('Picks a walk\'s or a face\'s target at a world point, as pick on stage does with the Cutscene tool: the mark within 1 m of it, or the point [x, z]. One undo. Answers the cue.'),
    run: async ({ scene, cue, at }, e) => {
      const { t } = await prepared(scene)
      return change(t, e, m => pickEdits(m, cue, 'to', at), () => [cue])
    },
  })
  ed.command({
    id: 'cutscene.seek',
    title: 'Cutscene: seek',
    input: z.object({
      scene,
      e: z.number().min(0).describe('elapsed seconds of the scene'),
      play: z.boolean().default(false).describe('plays from there, as ▶ here does'),
    }).describe('Puts the session at an elapsed time of the scene, as clicking the Cutscene panel\'s ruler does, the scene started at step 1 first, whatever the game view shows; edits nothing. Answers the step and the cutscene row.'),
    run: async ({ scene, e, play }) => {
      const { t, m } = await prepared(scene, true)
      if (e > m.span) throw new Error(`e ${e} is past the timeline, which runs to ${m.span} s`)
      await seekTo(t, e, play)
      const s = ed.need()
      return { scene, step: s.n, playing: s.playing, playhead: headOf(t), row: ed.rowOf(scene, t.row).data }
    },
  })
  ed.command({
    id: 'cutscene.look',
    title: 'Cutscene: look',
    input: z.object({
      on: z.boolean().describe('true shows the cutscene\'s own camera; false gives the camera back to the orbit'),
    }).describe('Holds the orbit off so the game view is drawn from the camera the cutscene of the scene it shows places, while a tool stays on, as the camera lane\'s look does; or lets go. Answers whether it looks.'),
    run: ({ on }) => {
      studio.look(on)
      return { looking: studio.looking() }
    },
  })
}
