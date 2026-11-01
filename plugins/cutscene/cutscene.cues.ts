// A cue file as the cutscene's panel shows it and changes it (`cutscene.panel.ts`, a game's dev page):
// the model of the file the panel draws, every change it makes, the check every change is held to, and
// the measure pass. Lifted from the editor's Cutscene panel (`cutscene.extension.tsx`), its numbers,
// names and rules carried over; what the editor read off its session and its files is handed in here
// (`Context`), so the panel and the dev server's check before a save (`cutscene.cued.ts`) share it, and
// it runs in node.
//
// The model (`build`), in elapsed seconds. A chip is drawn at its `at` plus every hold before it, and a
// chip moved to elapsed time E goes back to the cue clock by taking off the holds before E (`toCue`).
// Lanes are each cast member, then camera, say, sound and screen; a wait on a member is a point on its
// lane, on say for the line, and a wait `on` a delivered step on the lane of the last cue of that step
// before it, else on screen; a hold is hatched in the ruler. Every kind of cue has a lane, a chip and a
// form: cutscene's own (`CUES`) and every step the scene's mods deliver (`Steps`, cutscene's Steps a game
// brings), each delivered step on its `who`'s lane when it has one, else on screen. Each failing frame
// of the cue file's check (`Failed`, the check script beside it, mech's `assets/intro.ts`) is a red
// mark on the camera lane at its elapsed time, and its shot's chip is outlined.
//
// The changes, each a list of `Edit`s of the file (`at` a path in it, a value undefined taking it out):
// a cue added on a lane by `addEdits`; its fields set, or its kind changed, by `patched`; cues moved,
// onto another member's lane and to another length, by `moveEdits`; taken out by `removeEdits`; copied,
// as a paste and a duplicate copy them, by `pasteEdits`; the file's end, `go` and `arrive` by
// `fileEdits`; a camera taken into a shot by `takeEdits`; a shot's camera stood on a world point, as it
// is dragged there, by `standEdits`; a target picked in the view by `pickEdits`. `edited` makes the file
// they leave. A change is refused, with why, by `refusal`: when cutscene's `check` refuses the file it
// would make with the scene's delivered steps, or when it would name a target that is neither a cast
// member nor a mark (`strangers`), a clip or a gear the member's rig lacks or a sound the scene has no
// cue of (`badNames`), or a `go` that is no scene of the game, where the file did not already; each
// refusal names the choices. A name the file had already is let be, wherever a change moves its cue.
//
// The measure pass (`pass`): a second recorder replaying the session's own recording headless, in
// slices of `SLICE` ms with the page let go between them (`turn`), from its boot to the scene's end,
// reading the cutscene row each step: the step it started at, the elapsed time each cue fired, how long
// each wait held and whether it had anything to wait for, when each walk ended and whether at its
// limit, and each cast member's feet every `EVERY` seconds of `e`. It stops short of the end once the
// scene has had the steps the file can play at most (`longest`) from the step it started on, or from
// the recording's end while it has not started, and when `going` says it is no longer wanted.
import type { Row } from '#engine/engine.ts'
import type { Rig } from '#plugins/anim/anim.sim.ts'
import { manager, scenes } from '#addons/scenemanager/scenemanager.addon.ts'
import type { Recorder } from '#addons/recorder/recorder.addon.ts'
import { CUES, RULES, check, said, longest, rooted, sorted, stepsOf, strangers, type Cue, type Height, type Script, type Steps, type View } from './cutscene.sim.ts'

// The measure pass works this many milliseconds at a time at most.
export const SLICE = 8
// The measured paths take each cast member's feet this often, in seconds of `e`.
export const EVERY = 0.25
// The timeline's grain, the nudge, in seconds.
export const GRAIN = 0.05
// A frustum is drawn this deep, in metres, at 16:9; a press this many canvas pixels from its apex
// takes it.
export const DEPTH = 1.5
export const ASPECT = 16 / 9
export const GRAB = 14
// A picked point writes the mark within this many metres of it.
export const NEAR = 1
// How long a run of nudges waits for the next before it is written, in milliseconds.
export const NUDGED = 600
const TOLERANCE = 1e-9
// How far past the end a time moved to may be, as the timeline rounds one it has kept at the end.
const PAST = 1e-6

// A frame the cue file's check found failing: its shot, its elapsed time and why.
export type Failed = { shot: string; e: number; text: string }

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

// What the editor read off its session: the scene the cue file is played in and the game round it.
//   scene, name   the scene's name and the cue file's catalogue key, `world.cutscene.script`
//   marks         the scene's marks, `{ name, at }`
//   sounds        the scene's sound cues, `world.audio.cues`
//   rig(kind)     the rig a cast kind plays from, `world.anim.kinds.<kind>.rig`, read, or undefined
//   steps         the steps the scene's mods deliver (cutscene's `stepsOf`)
//   scenes        the game's scenes, which `go` may name
//   eye()         the camera the page draws from now, `{ pos, dir, fov }`, or undefined
//   height()      the ground the scene's points stand on, as the page has it, or undefined
//   rows()        the scene's rows as they stand now
export type Context = {
  scene: string; name: string
  marks: { name: string; at: number[] }[]
  sounds: string[]
  rig(kind: string): Rig | undefined
  steps: Steps
  scenes: string[]
  eye?(): Eye | undefined
  height?(): Height | undefined
  rows?(): Row[]
}
export type Eye = { pos: number[]; dir: number[]; fov: number }

// Everything the page shows, worked out from the file, the scene, the measure and the check.
export type Model = {
  context: Context
  file: Script
  cast: string[]
  // Each cast member's lane, then camera, say, sound and screen.
  lanes: string[]
  marks: { name: string; at: number[] }[]
  sounds: string[]
  rigs: Record<string, Rig | undefined>
  measured: Measured | undefined
  failed: Failed[]
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
  // The kinds of cue the form offers: cutscene's own, then each the scene delivers.
  dos: string[]
}

export const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0
const text = (v: unknown) => JSON.stringify(v)

// cutscene's own kinds of cue, in the order the form offers them.
export const DOS = ['play', 'gesture', 'walk', 'face', 'say', 'wait', 'shot', 'fade', 'bars', 'shake', 'sound', 'music', 'prepare']
// The lanes after the cast's, and the kind of cue each lane's `+` makes; a cast member's makes a play.
export const LANES: Record<string, string> = { camera: 'shot', say: 'say', sound: 'sound', screen: 'fade' }
// The kinds of cue with a length, the field it is, which the timeline draws and resizes.
export const LENGTHS: Record<string, string> = { say: 'for', shot: 'over', fade: 'over', bars: 'over', shake: 'over' }
// The kinds of cue whose target is picked in the view.
export const PICKED = ['walk', 'face']

// Whether a cue's word is a step the scene delivers, which takes the place of cutscene's own of that word.
export const delivered = (steps: Steps, word: string) => Object.hasOwn(steps, word)
// A cue's fields and their rules: a delivered step's, else cutscene's own.
export const rulesOf = (steps: Steps, word: string): Record<string, string> | undefined =>
  delivered(steps, word) ? steps[word].fields : Object.hasOwn(CUES, word) ? CUES[word] : undefined

// Why a sound cannot be made in the scene: it has no sound cues. The sound lane's `+` and the form's
// `sound` kind are off for this reason, and a sound made otherwise refused with it.
export const soundless = (m: Model) => (m.sounds.length ? undefined : `${m.context.scene} has no sound cues, in its world.audio.cues, for a sound to play`)

// The lane a cue sits on, in a file whose cues are `cues`.
function laneOf(c: Cue, cues: Cue[], steps: Steps, cast: string[]): string {
  if (delivered(steps, c.do)) return typeof c.who === 'string' && cast.includes(c.who) ? c.who : 'screen'
  if (['play', 'gesture', 'walk', 'face'].includes(c.do)) return c.who
  if (c.do === 'wait' && c.on !== undefined) {
    const order = sorted(cues)
    const at = order.indexOf(cues.indexOf(c))
    const last = order.slice(0, at).reverse().find(j => cues[j].do === c.on)
    return last === undefined ? 'screen' : laneOf(cues[last], cues, steps, cast)
  }
  if (c.do === 'wait') return c.who === 'line' ? 'say' : c.who
  if (c.do === 'shot') return 'camera'
  if (c.do === 'say') return 'say'
  if (c.do === 'sound' || c.do === 'music') return 'sound'
  return 'screen'
}

// A rig's clip entry, followed through `mirror`.
const entryOf = (rig: Rig, clip: string): Record<string, unknown> | undefined => {
  const e = rig.clips[clip] as string | Record<string, unknown> | undefined
  if (e === undefined) return undefined
  if (typeof e === 'string') return { file: e }
  if (typeof e.mirror === 'string') return { ...entryOf(rig, e.mirror), ...e, mirror: undefined }
  return e
}
// The clips of a member's rig, and those with a gear, which a walk is walked in: the choices the
// form offers and the ones a change is held to.
export const clipsOf = (rig: Rig | undefined) => Object.keys(rig?.clips ?? {})
export const gearsOf = (rig: Rig | undefined) => clipsOf(rig).filter(c => typeof entryOf(rig!, c)?.gear === 'number')
const durOf = (rig: Rig | undefined, clip: string) => {
  if (!rig) return undefined
  const e = rig.clips[clip] as string | Record<string, unknown> | undefined
  const own = rig.table?.[clip]?.dur
  if (own !== undefined) return own
  return typeof e === 'object' && typeof e.mirror === 'string' ? rig.table?.[e.mirror]?.dur : undefined
}

// Names a file gives that are none of the choices the form offers, as `{ cue, text }`, each naming
// them: a clip a play or a gesture plays that its member's rig lacks, a gear a walk is walked in
// that is no clip of its rig with a gear, a rig not read yet giving no choices to hold them to;
// and a sound that is none of the scene's sound cues.
export const badNames = (file: Script, rigs: Record<string, Rig | undefined>, sounds: string[], steps: Steps = {}) => file.cues.flatMap((c, i) => {
  if (delivered(steps, c.do)) return []
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

// The rigs of a file's cast, by member.
export const rigsOf = (c: Context, file: Script) => Object.fromEntries(Object.entries(file.cast).map(([name, m]) => [name, c.rig(m.kind)]))

// The model of a cue file in its scene, with what the measure pass and the check found of it.
export function build(context: Context, file: Script, me?: Measured, failed: Failed[] = []): Model {
  const { steps } = context
  const rigs = rigsOf(context, file)
  const cast = Object.keys(file.cast)
  const marks = context.marks
  const sounds = context.sounds
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
  for (const u of strangers(file, marks.map(m => m.name), steps)) problems.push({ cue: u.cue, text: `${u.field} names ${u.name}, which is no cast member or mark` })
  problems.push(...badNames(file, rigs, sounds, steps))
  file.cues.forEach((c, i) => {
    if (c.at > file.end + TOLERANCE) problems.push({ cue: i, text: `at ${c.at} is past the end, ${file.end}` })
    if (me?.limited[i]) problems.push({ cue: i, text: 'the walk ends at its limit' })
    if (me?.passed[i]) problems.push({ cue: i, text: 'the wait has nothing to wait for' })
  })
  // A shot with a failing frame: the shot the check names, the last of that name to fire by then.
  const shotOf = (f: Failed) => order.filter(i => file.cues[i].do === 'shot' && file.cues[i].name === f.shot && elapsed(i) <= f.e + TOLERANCE).at(-1)
  const failing = new Map<number, Failed[]>()
  for (const f of failed) {
    const i = shotOf(f)
    if (i !== undefined) failing.set(i, [...(failing.get(i) ?? []), f])
  }
  for (const [i, fs] of failing) problems.push({ cue: i, text: `${fs.length} frame${fs.length === 1 ? '' : 's'} fail the check: ${fs[0].text}` })
  const warned = new Set(problems.map(p => p.cue))

  const lanes = (c: Cue) => laneOf(c, file.cues, steps, cast)
  // The next cue on a lane of one of `dos` after cue i, by elapsed time.
  const next = (i: number, dos: string[], lane: string) => {
    const e = elapsed(i)
    const later = file.cues.map((_, j) => j).filter(j => j !== i && dos.includes(file.cues[j].do) && lanes(file.cues[j]) === lane && elapsed(j) > e + TOLERANCE)
    return later.length ? Math.min(...later.map(elapsed)) : undefined
  }
  const total = Math.max(end, me?.total ?? 0)
  const named = (t: unknown) => (t === null ? 'nothing' : typeof t === 'string' ? t : Array.isArray(t) ? t.join(', ') : String(t))
  const chips: Chip[] = file.cues.map((c, i) => {
    const lane = lanes(c)
    const at = elapsed(i)
    const base = { id: String(i), lane, at, warn: warned.has(i), label: c.do }
    const castLanes = typeof c.who === 'string' && cast.includes(c.who) ? { lanes: cast } : {}
    if (delivered(steps, c.do)) {
      // A delivered step: its word and the places its fields name.
      const places = Object.entries(steps[c.do].fields).filter(([, r]) => ['target', 'facing'].includes(r.replace(/\?$/, ''))).map(([f]) => c[f]).filter(v => v !== undefined)
      return { ...base, ...castLanes, label: [c.do, ...places.map(named)].join(' ') }
    }
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
        return { ...base, ...castLanes, label: `walk to ${named(c.to)}`, length: Math.max(0, to), open: true }
      }
      case 'face': return { ...base, ...castLanes, label: `face ${named(c.to)}` }
      case 'wait': return { ...base, ...castLanes, label: c.on !== undefined ? `wait on ${c.on}` : `wait for ${c.who}` }
      case 'shot': return { ...base, label: `shot ${c.name}`, ...resized, ...(sized > 0 && { look: 'ramp' as const }) }
      case 'fade': case 'shake': case 'bars':
        return { ...base, label: `${c.do} ${c.do === 'fade' ? c.to : c.do === 'bars' ? (c.on ? 'in' : 'out') : c.amp}`, ...resized }
      case 'sound': return { ...base, label: `sound ${c.cue}` }
      case 'music': return { ...base, label: `music ${c.name || 'off'}`, length: (next(i, ['music'], lane) ?? total) - at, look: 'loop' }
      case 'say': return { ...base, label: `${c.who}: ${c.text}`, length: sized, resize: true }
      case 'prepare': return { ...base, label: `prepare ${named(c.where)}` }
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
    for (const f of failing.get(i) ?? []) lines.push(f.text)
    return lines
  }
  return {
    context, file, cast, lanes: [...cast, ...Object.keys(LANES)], marks, sounds, rigs, measured: me, failed, chips, holdMarks, problems,
    elapsed, held, end, span: Math.max(total, end) + 1, toCue, clips, gears, note,
    dos: [...DOS.filter(d => !delivered(steps, d)), ...Object.keys(steps)],
  }
}

// ---------------------------------------------------------------- edits

// A change of the file: the value at a path in it, undefined to take it out (an item of a list taken
// out of the list).
export type At = (string | number)[]
export type Edit = { at: At; value: unknown }

// The file `edits` leave of `from`, which is left as it was.
export function edited<T>(from: T, edits: Edit[]): T {
  const out = structuredClone(from) as Record<string | number, unknown>
  for (const { at, value } of edits) {
    const parent = at.slice(0, -1).reduce<Record<string | number, unknown>>((o, k) => (o[k] ??= {}) as Record<string | number, unknown>, out)
    const k = at[at.length - 1]
    if (value !== undefined) parent[k] = value
    else if (Array.isArray(parent) && typeof k === 'number') parent.splice(k, 1)
    else delete parent[k]
  }
  return out as T
}

// Why the file `next`, a change of the model's, may not be written, or undefined.
export function refusal(m: Model, next: Script): string | undefined {
  const c = m.context
  try {
    check(c.name, next, c.steps)
  } catch (e) {
    return (e as Error).message
  }
  const marks = m.marks.map(k => k.name)
  const stranger = fresh(strangers(m.file, marks, c.steps), strangers(next, marks, c.steps), u => `${u.field} ${u.name}`)
  if (stranger) return `no cast member or mark is named ${stranger.name}: the cast is ${m.cast.join(', ')}, and the marks are ${marks.join(', ') || 'none'}`
  if (next.go !== undefined && next.go !== m.file.go && !c.scenes.includes(next.go)) return `go ${next.go} is no scene of the game: its scenes are ${c.scenes.join(', ')}`
  const rigs = Object.fromEntries(Object.entries(next.cast).map(([name, k]) => [name, m.rigs[name] ?? c.rig(k.kind)]))
  return fresh(badNames(m.file, m.rigs, m.sounds, c.steps), badNames(next, rigs, m.sounds, c.steps), b => b.text)?.text
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

// Cue `i` of the file: one it has not got is refused, naming those it has.
export const cueAt = (m: Model, i: number): Cue => {
  const c = m.file.cues[i]
  if (!c) throw new Error(`the cue file has no cue ${i}: ${m.file.cues.length ? `its cues are 0 to ${m.file.cues.length - 1}` : 'it has no cues'}`)
  return c
}
// Cues `ids`, each named once.
const cuesAt = (m: Model, ids: number[]): Cue[] => ids.map((i, k) => {
  if (ids.indexOf(i) !== k) throw new Error(`cue ${i} is named twice`)
  return cueAt(m, i)
})

// The value a delivered step's field starts at, by its rule, for a new cue: `who` the member it came
// from, else the first; a place the first mark, else the origin.
function startOf(m: Model, rule: string, who: string) {
  const mark = m.marks[0]?.name ?? [0, 0]
  switch (rule) {
    case 'who': return who
    case 'waited': return who
    case 'target': return mark
    case 'facing': return null
    case 'text': return ''
    case 'flag': return false
    case 'clip': return null
    case 'positive': return 1
    case 'angle': return m.file.fov
    case 'frame': return 'world'
    case 'args': return []
    default: return 0
  }
}

// A new cue of kind `to` at `at`, from what `from` had that it keeps. A shot is named for the first
// number after the shots there are that no shot has; a sound in a scene with no sound cues is
// refused, since it could play none (`soundless`). A delivered step's fields start as `startOf` says,
// the ones that may be left out left out.
export const made = (m: Model, to: string, at: number, from: Partial<Cue> = {}): Cue => {
  const who = typeof from.who === 'string' && m.cast.includes(from.who) ? from.who : m.cast[0]
  const steps = m.context.steps
  if (delivered(steps, to)) {
    const cue: Cue = { at, do: to }
    for (const [field, rule] of Object.entries(steps[to].fields)) if (!rule.endsWith('?')) cue[field] = startOf(m, rule, who)
    return cue
  }
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
    case 'prepare': return { at, do: 'prepare', where: from.where ?? mark }
  }
  throw new Error(`${to} is not a cue`)
}

// Cue `c` with `values` set on it, a value undefined taken out, and `do` left as it is. A shot
// given nobody to follow lets go of its `frame` with it, and one given somebody, while its `pos` is
// no offset [x, y, z] and the values give none, is set 4 m behind and 2 m over its member. A wait
// given a `who` lets go of its `on`, and one given an `on` of its `who`.
export const overlay = (c: Cue, values: Record<string, unknown>): Cue => {
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
  if (next.do === 'wait' && values.who !== undefined) delete next.on
  if (next.do === 'wait' && values.on !== undefined) delete next.who
  return next
}

// Cue i's fields set to `values`, as its form sets them: a `do` of another kind makes it a cue of
// that kind at its `at`, from what it had that the kind keeps (`made`), written whole; else each
// field that changed is written, and one set to undefined taken out.
export const patched = (m: Model, i: number, values: Record<string, unknown>): Edit[] => {
  const c = cueAt(m, i)
  const to = typeof values.do === 'string' ? values.do : c.do
  if (to !== c.do) return [{ at: ['cues', i], value: overlay(made(m, to, c.at, c), values) }]
  const next = overlay(c, values)
  return [...new Set([...Object.keys(c), ...Object.keys(next)])].filter(k => text(c[k]) !== text(next[k])).map(k => ({ at: ['cues', i, k] as At, value: next[k] }))
}

// The kind of cue lane `lane`'s `+` makes; a lane there is not is refused, naming those there are.
export const laneDo = (m: Model, lane: string) => {
  if (!m.lanes.includes(lane)) throw new Error(`no lane ${lane}: the lanes are ${m.lanes.join(', ')}`)
  return m.cast.includes(lane) ? 'play' : LANES[lane]
}
// A cue made on `lane` at elapsed time `at`, as the lane's `+` makes it, with `values` over it: its
// kind the values' `do`, else the lane's, and a cast member's lane its `who`.
export const addEdits = (m: Model, lane: string, at: number, values: Record<string, unknown> = {}): Edit[] => {
  const own = laneDo(m, lane)
  const to = typeof values.do === 'string' ? values.do : own
  return [{ at: ['cues', m.file.cues.length], value: overlay(made(m, to, m.toCue(at), m.cast.includes(lane) ? { who: lane } : {}), values) }]
}

// Cues moved as the timeline moves them: each to elapsed time `at`, back on the cue clock without
// the holds before it but its own; onto the lane `lane` names, another cast member's, which it
// is then the cue of; and a say, a shot, a fade, the bars or a shake to length `len` in seconds.
// A time past the end, a lane the cue may not go to, or a length a cue has none of, is refused.
export type Moving = { cue: number; at?: number; lane?: string; len?: number }
export const moveEdits = (m: Model, moves: Moving[]): Edit[] => {
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
      const field = Object.hasOwn(LENGTHS, c.do) && !delivered(m.context.steps, c.do) ? LENGTHS[c.do] : undefined
      if (!field) throw new Error(`cue ${i}, a ${c.do}, has no length: the cues with one are ${Object.entries(LENGTHS).map(([d, f]) => `${d} (${f})`).join(', ')}`)
      out.push({ at: ['cues', i, field], value: round3(len) })
    }
    return out.filter(o => text(o.value) !== text(c[o.at[2] as string]))
  })
}

// Cues taken out, the last first, so each is where it was.
export const removeEdits = (m: Model, ids: number[]): Edit[] => {
  cuesAt(m, ids)
  return [...ids].sort((a, b) => b - a).map(i => ({ at: ['cues', i] as At, value: undefined }))
}

// Copies of `cues` put after the file's last, the earliest at `from` on the cue clock and the rest
// as far after it as they were.
export const pasteEdits = (m: Model, cues: Cue[], from: number): Edit[] => {
  if (!cues.length) return []
  const lo = Math.min(...cues.map(c => c.at))
  return cues.map((c, k) => ({ at: ['cues', m.file.cues.length + k] as At, value: { ...structuredClone(c), at: round3(from + c.at - lo) } }))
}
// Where Duplicate puts copies of cues `ids`: after their end, in elapsed time, and half a second
// after it when they are points at one time; on the cue clock.
export const after = (m: Model, ids: number[]) => {
  const chips = ids.map(i => m.chips[i])
  const lo = Math.min(...chips.map(c => c.at)), hi = Math.max(...chips.map(c => c.at + (c.length ?? 0)))
  return m.toCue(hi) + (hi === lo ? GRAIN * 10 : 0)
}

// The file's own `end`, `go` and `arrive` set to `values`, each that changed; undefined takes one out.
export const fileEdits = (m: Model, values: Record<string, unknown>): Edit[] =>
  Object.entries(values).filter(([f, v]) => text((m.file as Record<string, unknown>)[f]) !== text(v)).map(([f, value]) => ({ at: [f], value }))

// The point 10 m ahead of an eye.
const ahead = (eye: Eye) => eye.pos.map((v, k) => v + eye.dir[k] * 10)
// A shot of the current view: its pos, a point 10 m ahead to look at, its fov, both points over the
// ground; with no camera or no ground, 2 m up and 6 m back from the origin, looking at the first
// cast member.
const view3 = (m: Model) => {
  const eye = m.context.eye?.(), height = m.context.height?.()
  const shots = m.file.cues.filter(c => c.do === 'shot')
  let k = shots.length + 1
  while (shots.some(s => s.name === `shot${k}`)) k++
  if (!eye || !height) return { name: `shot${k}`, pos: [0, 2, -6], look: m.cast[0] ?? [0, 0], fov: m.file.fov }
  return { name: `shot${k}`, pos: rooted(eye.pos, height).map(round3), look: rooted(ahead(eye), height).map(round3), fov: Math.min(179, Math.max(1, Math.round(eye.fov))) }
}

// The scene's rows as they stand, and the cast's ids among them by name.
const live = (m: Model) => m.context.rows?.() ?? []
export const castIds = (m: Model, rows: Row[]) => Object.fromEntries(Object.entries(m.file.cast).flatMap(([name, c]) => {
  const r = rows.find(r => r.kind === c.kind && r.data.name === name) ?? rows.find(r => r.kind === c.kind && r.data.name === c.name)
  return r ? [[name, r.id]] : []
}))
// A shot's view, as the cutscene fires it.
export const shotView = (m: Model, c: Cue): View => ({
  pos: c.pos, look: c.look, fov: c.fov ?? m.file.fov, head: m.file.head,
  ...(c.follows !== undefined && { follows: c.follows }), ...(c.frame !== undefined && { frame: c.frame }),
})

// Cue i, which must be a shot.
export const shotAt = (m: Model, i: number): Cue => {
  const c = cueAt(m, i)
  if (c.do !== 'shot') throw new Error(`cue ${i} is a ${c.do}, not a shot: the shots are ${m.file.cues.flatMap((c, k) => (c.do === 'shot' ? [k] : [])).join(', ') || 'none'}`)
  return c
}
const noGround = (m: Model) => `the view has no ground of ${m.context.scene} yet to write a shot that follows nobody over`
// The `pos` that stands shot c's camera on world point p: the point `[x, up, z]` over the ground
// for a shot that follows nobody; else its offset from the member it follows as that member stands
// now, turned into the member's own axes for `frame: "body"`.
const posAt = (m: Model, c: Cue, p: number[], height: Height | undefined): number[] => {
  if (c.follows === undefined) {
    if (!height) throw new Error(noGround(m))
    return rooted(p, height).map(round3)
  }
  const rows = live(m)
  const r = rows.find(r => r.id === castIds(m, rows)[c.follows])
  if (!r) throw new Error(`${c.follows}, whom shot ${c.name} follows, has no row to stand its camera by`)
  const [dx, dy, dz] = [p[0] - r.data.pos[0], p[1] - r.data.pos[1], p[2] - r.data.pos[2]]
  if (c.frame !== 'body') return [dx, dy, dz].map(round3)
  const co = Math.cos(r.data.yaw), si = Math.sin(r.data.yaw)
  return [dx * co - dz * si, dy, dx * si + dz * co].map(round3)
}
// The view a camera has, `eye`, into shot i: `pos` (`posAt`) and `fov`; a `look` that names
// something is kept, and a point is made the point 10 m ahead, over the ground.
export const takeEdits = (m: Model, i: number, eye: Eye, height: Height | undefined): Edit[] => {
  const c = shotAt(m, i)
  if (!height && (c.follows === undefined || typeof c.look !== 'string')) throw new Error('the view has no ground of this scene to take the view over')
  const edits: Edit[] = [
    { at: ['cues', i, 'pos'], value: posAt(m, c, eye.pos, height) },
    { at: ['cues', i, 'fov'], value: Math.min(120, Math.max(10, Math.round(eye.fov))) },
  ]
  if (typeof c.look !== 'string') edits.push({ at: ['cues', i, 'look'], value: rooted(ahead(eye), height!).map(round3) })
  return edits
}
// Shot i's camera stood on world point `to`, as it is dragged there.
export const standEdits = (m: Model, i: number, to: number[], height: Height | undefined): Edit[] =>
  [{ at: ['cues', i, 'pos'], value: posAt(m, shotAt(m, i), to, height) }]
// A target picked at world point `at`, [x, y, z] or [x, z], for field `field` of a walk or a face:
// the mark within `NEAR` of it on the ground, or the point.
export const pickEdits = (m: Model, i: number, field: string, at: number[]): Edit[] => {
  const c = cueAt(m, i)
  if (!PICKED.includes(c.do)) throw new Error(`cue ${i} is a ${c.do}, and a target is picked for a walk or a face: the walks and faces are ${m.file.cues.flatMap((c, k) => (PICKED.includes(c.do) ? [k] : [])).join(', ') || 'none'}`)
  const [x, z] = [at[0], at[at.length - 1]]
  const mark = m.marks.find(k => Math.hypot(k.at[0] - x, k.at[k.at.length - 1] - z) <= NEAR)
  return [{ at: ['cues', i, field], value: mark ? mark.name : [round3(x), round3(z)] }]
}

// A selection, nudged by `by` seconds, kept inside the scene.
export const nudged = (m: Model, ids: string[], by: number) =>
  moveEdits(m, ids.filter(id => m.file.cues[Number(id)]).map(id => ({ cue: Number(id), at: Math.min(m.end, Math.max(0, m.elapsed(Number(id)) + by)) })))

// A target typed as text: a cast member's or a mark's name, or two or three numbers, [x, z] or
// [x, up, z]; anything else is refused, with the reason.
export function typed(m: Model, value: string): string | number[] {
  const v = value.trim()
  if (m.cast.includes(v) || m.marks.some(k => k.name === v)) return v
  const nums = v.split(/[\s,]+/).filter(Boolean).map(Number)
  if ((nums.length === 2 || nums.length === 3) && nums.every(Number.isFinite)) return nums
  throw new Error(`${JSON.stringify(value)} is neither a cast member, a mark nor [x, z] or [x, up, z]`)
}

// Whether a value keeps the rule a field's spec names (`CUES`, a delivered step's `fields`), in a file.
export const keeps = (spec: string, v: unknown, file: Script) => {
  const optional = spec.endsWith('?')
  if (optional && v === undefined) return true
  const rule = RULES[optional ? spec.slice(0, -1) : spec]
  return rule[0](v, file)
}
export const ruleSaid = (spec: string, file: Script) => said(RULES[spec.replace(/\?$/, '')], file)

// ---------------------------------------------------------------- the measure pass

// The page let go of, so it draws and takes presses, before the pass works on.
export function turn(): Promise<void> {
  return new Promise(done => {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = () => {
      port1.close()
      done()
    }
    port2.postMessage(null)
  })
}

// One play of `scene`'s cue file `file` measured on the recorder `rec` makes, a replay of the
// session's own recording, while `going()`; `key` names the version of the files it measures.
export async function pass(rec: Recorder, scene: string, file: Script, key: string, going: () => boolean): Promise<Measured | undefined> {
  try {
    const n = file.cues.length
    const got: Measured = {
      key, start: undefined, total: 0, done: false,
      fired: Array(n).fill(NaN), holds: Array(n).fill(0), passed: Array(n).fill(false), arrive: Array(n).fill(NaN), limited: Array(n).fill(false),
      paths: {},
    }
    const order = sorted(file.cues)
    const truthOf = () => scenes(manager(rec.truth)).get(scene)
    const rowOf = () => truthOf()?.rows.find(r => r.kind === 'cutscene')
    // The pass ends at the scene's end, or once the scene has had the steps the file can play at most
    // from the step it started on, or from the recording's end while it has not: `longest`, and a
    // step a cue for the part of a step each wait can overrun. The recording's end is the one it
    // replays, which the steps it plays past move on.
    const truth = truthOf()
    const most = Math.ceil(longest(file, truth ? stepsOf(truth.world) : {}) / rec.dt) + n + 2
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
    return going() ? got : undefined
  } finally {
    // Its seat let go; a closed recorder steps nothing (`recorder.addon.ts`).
    rec.link.close()
  }
}