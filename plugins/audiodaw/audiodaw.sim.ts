// audiodaw: the song, in Tone.js's own words, and the edits the studio makes to it.
//
// The song is a rack and tracks, as Ableton's MIDI tracks and instrument tracks are. The rack
// (`rack`) is the devices that sound: each a Tone instrument with its effects, its `Tone.Channel`
// and its sends, the one place its audio is mixed. A track sounds nothing of its own: it is notes,
// its patterns and their clips, sent to the device it targets (`target`, an index into `rack`; a
// track with none plays nothing). Any number of tracks target one device, and their notes meet in
// its one instrument, so two tracks into one synth share its voices and two into a DrumKit play one
// kit. A track's `mute` and `solo` hold back its notes, not a device's sound.
//
// A track's notes are in its patterns, and a clip places one of them on the song, played once: a
// clip is as long as the ticks its pattern plays, `from` to `length`, so lengthening or trimming a
// pattern lengthens or trims every clip of it. Notes outside those ticks are kept, unheard.
//
// There are two kinds of track, in one list in the order the user keeps them. A note track
// (`kind: 'notes'`) sends notes to a device. An automation track (`kind: 'automation'`) sends one
// knob its values: it targets a `Knob` (an instrument's option, an effect's, a channel's volume or
// pan, a send, a bus's or the master's), and its patterns hold automation notes, each a time, a
// duration and points. An automation note holds the knob from its time for its duration, through its
// points: each point a tick from the note's start (`at`), a value from 0 to 1 of the knob's travel,
// and how the line reaches it from the point before (`shape`: linear, exp or step). Its first point
// is at 0 and its last at its duration. When the note ends, the knob goes back to its own value.
// What 0 and 1 are in the knob's units is the caller's (its range and curve), so a track retargeted
// to another knob plays the same shapes across that knob's travel. Nothing ties an automation track
// to a note track: either may sit anywhere in the list.
//
// Every tick is Tone's tick at the project's `ppq`. Every `options` is the Tone constructor's own
// object, untranslated: an instrument is `voices` of `new Tone[is](options)`, made when the song
// loads and kept until it unloads; an effect is `new Tone[is](options)`. The browser half,
// `audiodaw.plugin.ts`, makes those objects and hands each edit to the one that holds it.
//
// Every edit returns a new project and leaves the one it was handed as it was, so undo is the
// project before.

export type Note = { time: number; note: string; duration: number; velocity: number }
// A pattern: its notes, and the ticks of them a clip of it plays, from `from` (0 when left out) to
// `length`. Notes outside those are kept and not played: trimming a pattern hides, never deletes.
export type Pattern = { length: number; from?: number; notes: Note[] }
// An instrument: `voices` of Tone's `is` (1 when left out), each note played on the next of them in
// turn. A DrumKit's pads are a voice each, so a kit has no `voices`.
export type Instrument = { is: string; voices?: number; options: object }
export type Effect = { is: string; on: boolean; options: object }

// A drum machine, `{ is: 'DrumKit', options: { pads } }`: one instrument a track plays by note, as
// any drum machine is. Each pad is the note that triggers it (Tone's name, "C1"), its name, the Tone
// drum it sounds (`new Tone[is](options)`), the pitch that drum plays (a NoiseSynth has none) and,
// optionally, a choke group: a pad struck cuts every other pad of its group (the closed hat the open).
export const DRUM_KIT = 'DrumKit'
export type Pad = { name: string; is: string; pitch?: string; choke?: string; options: object }
export type KitOptions = { pads: Record<string, Pad>; volume?: number }
export type Channel = { volume: number; pan: number; mute: boolean; solo: boolean }
export type Bus = { volume: number; pan: number; effects: Effect[] }
// A clip: its track's pattern played once, never repeated, the pattern's tick `from` at the song's
// tick `start`, until the pattern's `length`. Every clip of a pattern is as long as the pattern plays.
export type Clip = { track: number; pattern: string; start: number }

// A device of the rack: an instrument, its effects in order, its channel and its sends.
export type Device = {
  name: string
  instrument: Instrument
  effects: Effect[]
  channel: Channel
  sends: Record<string, number>
}

// A note track: notes sent to the device it targets, drawn in its own colour (CSS).
export type NoteTrack = {
  kind: 'notes'
  name: string
  color: string
  target?: number
  patterns: Record<string, Pattern>
  mute: boolean
  solo: boolean
}

// One value Tone holds: an instrument's option or an effect's at its path in Tone's options (the
// path `instrument.set` and `effect.set` take), a channel's volume or pan (the master has a volume
// and no pan), or a device's send to a bus.
export type Knob =
  | { part: 'instrument'; device: number; path: string[] }
  | { part: 'effect'; chain: Chain; effect: number; path: string[] }
  | { part: 'volume'; strip: Chain }
  | { part: 'pan'; strip: { device: number } | { bus: string } }
  | { part: 'send'; device: number; bus: string }

// How the line reaches a point from the one before it.
export type Shape = 'linear' | 'exp' | 'step'
export type Point = { at: number; value: number; shape: Shape }
export type AutomationNote = { time: number; duration: number; points: Point[] }
export type AutomationPattern = { length: number; from?: number; notes: AutomationNote[] }

// An automation track: the values of one knob, drawn in its own colour. Muted, it holds the knob
// back from nothing: the knob keeps its own value.
export type AutomationTrack = {
  kind: 'automation'
  name: string
  color: string
  target?: Knob
  patterns: Record<string, AutomationPattern>
  mute: boolean
}

export type Track = NoteTrack | AutomationTrack
// Either kind's pattern: what a clip plays, `from` to `length`.
export type Lane = Pattern | AutomationPattern

export type Project = {
  bpm: number
  timeSignature: number
  swing: number
  swingSubdivision: string
  ppq: number
  loop?: { start: number; end: number }
  // The song's own bounds, in ticks: play starts at `start` and stops at `end`. Clips outside them
  // are kept and not heard. With none, the song runs from 0 to its last clip's end (`spanOf`).
  span?: { start: number; end: number }
  rack: Device[]
  tracks: Track[]
  buses: Record<string, Bus>
  master: { volume: number; effects: Effect[] }
  clips: Clip[]
}

// A preset's `effects` are what a new device made from it starts with; loading it into a device
// that has effects of its own leaves them.
export type Preset = { name: string; instrument: Instrument; effects?: Effect[] }

// Where an effect chain is: a device's, a bus's or the master's.
export type Chain = { device: number } | { bus: string } | 'master'

function track(p: Project, t: number, change: (track: Track) => Track): Project {
  if (!p.tracks[t]) throw new Error(`audiodaw: no track ${t}`)
  return { ...p, tracks: p.tracks.map((x, i) => (i === t ? change(x) : x)) }
}

function device(p: Project, d: number, change: (device: Device) => Device): Project {
  if (!p.rack[d]) throw new Error(`audiodaw: no device ${d}`)
  return { ...p, rack: p.rack.map((x, i) => (i === d ? change(x) : x)) }
}

// The ticks of a pattern a clip plays: from its `from` to its `length`.
export const fromOf = (x: Lane) => x.from ?? 0
export const playedOf = (x: Lane) => x.length - fromOf(x)

// A clip's pattern, which its track must have.
export function patternOf(p: Project, c: Clip): Lane {
  const x = p.tracks[c.track]?.patterns[c.pattern]
  if (!x) throw new Error(`audiodaw: track ${c.track} has no pattern ${c.pattern}`)
  return x
}

// A note track, or a throw: track `t` is one of the song's and sends notes.
export function noteTrack(p: Project, t: number): NoteTrack {
  const x = p.tracks[t]
  if (!x) throw new Error(`audiodaw: no track ${t}`)
  if (x.kind !== 'notes') throw new Error(`audiodaw: track ${t} is an automation track`)
  return x
}

// An automation track, or a throw.
export function automationTrack(p: Project, t: number): AutomationTrack {
  const x = p.tracks[t]
  if (!x) throw new Error(`audiodaw: no track ${t}`)
  if (x.kind !== 'automation') throw new Error(`audiodaw: track ${t} is a note track`)
  return x
}

// A clip's length: the ticks its pattern plays.
export const clipLength = (p: Project, c: Clip) => playedOf(patternOf(p, c))

// Where a clip ends.
export const clipEnd = (p: Project, c: Clip) => c.start + clipLength(p, c)

// The song's bounds: its `span`, or from 0 to the end of its last clip.
export function spanOf(p: Project): { start: number; end: number } {
  return p.span ?? { start: 0, end: p.clips.reduce((most, c) => Math.max(most, clipEnd(p, c)), 0) }
}

// A name not among `taken`: `base`, else `base` and the least number from 2 that is free.
export function freeName(taken: Iterable<string>, base: string): string {
  const has = new Set(taken)
  if (!has.has(base)) return base
  let k = 2
  while (has.has(`${base}${k}`)) k++
  return `${base}${k}`
}

// Patterns ---------------------------------------------------------------------------------------

// A pattern's end set, every clip of it with it, a tick past its `from` at least; its notes are left
// as they are.
export function setLength(p: Project, t: number, name: string, length: number): Project {
  return pattern(p, t, name, (x) => {
    if (!Number.isInteger(length) || length <= fromOf(x)) throw new Error(`audiodaw: a pattern ending at ${length} that starts at ${fromOf(x)}`)
    return { ...x, length }
  })
}

// A pattern's start moved to the pattern's tick `from`, kept a tick before its end; every clip of it
// moves with it, so each note it still plays stays where it was in the song. Notes before `from` are
// kept and not played. A clip is kept from before the song's start, which holds the move back.
export function setFrom(p: Project, t: number, name: string, from: number): Project {
  const x = p.tracks[t]?.patterns[name]
  if (!x) throw new Error(`audiodaw: track ${t} has no pattern ${name}`)
  const mine = p.clips.filter((c) => c.track === t && c.pattern === name)
  const least = -Math.min(fromOf(x), ...mine.map((c) => c.start))
  const by = Math.max(least, Math.min(x.length - 1 - fromOf(x), Math.round(from) - fromOf(x)))
  if (!by) return p
  const next = fromOf(x) + by
  const moved = pattern(p, t, name, ({ from: _was, ...rest }) => (next ? { ...rest, from: next } : rest))
  return { ...moved, clips: moved.clips.map((c) => (c.track === t && c.pattern === name ? { ...c, start: c.start + by } : c)) }
}

export function addPattern(p: Project, t: number, name: string, x: Pattern): Project {
  noteTrack(p, t)
  return put(p, t, name, x)
}

export function addAutomationPattern(p: Project, t: number, name: string, x: AutomationPattern): Project {
  automationTrack(p, t)
  return put(p, t, name, x)
}

// A pattern put on track `t` under a free name, of the track's kind: a copy of one of its own, or of
// a track of its kind.
function put(p: Project, t: number, name: string, x: Lane): Project {
  if (!p.tracks[t]) throw new Error(`audiodaw: no track ${t}`)
  if (p.tracks[t]!.patterns[name]) throw new Error(`audiodaw: track ${t} has a pattern ${name} already`)
  return track(p, t, (tr) => lanes(tr, (patterns) => ({ ...patterns, [name]: x })))
}

// A pattern renamed, every clip of it with it.
export function renamePattern(p: Project, t: number, name: string, to: string): Project {
  const tr = p.tracks[t]
  if (!tr?.patterns[name]) throw new Error(`audiodaw: track ${t} has no pattern ${name}`)
  if (name === to) return p
  if (tr.patterns[to]) throw new Error(`audiodaw: track ${t} has a pattern ${to} already`)
  return {
    ...track(p, t, (x) => lanes(x, (patterns) => Object.fromEntries(Object.entries(patterns).map(([k, v]) => [k === name ? to : k, v])))),
    clips: p.clips.map((c) => (c.track === t && c.pattern === name ? { ...c, pattern: to } : c)),
  }
}

// A pattern taken away with every clip of it.
export function removePattern(p: Project, t: number, name: string): Project {
  if (!p.tracks[t]?.patterns[name]) throw new Error(`audiodaw: track ${t} has no pattern ${name}`)
  return {
    ...track(p, t, (x) => lanes(x, ({ [name]: _gone, ...patterns }) => patterns)),
    clips: p.clips.filter((c) => !(c.track === t && c.pattern === name)),
  }
}

// A clip given a pattern of its own: a copy of the one it plays, under a free name, which only it
// plays, so editing it edits no other clip.
export function uniqueClip(p: Project, i: number): Project {
  slot(p.clips, i)
  const c = p.clips[i]!
  const name = freeName(Object.keys(p.tracks[c.track]!.patterns), c.pattern)
  const copied = put(p, c.track, name, structuredClone(patternOf(p, c)))
  return { ...copied, clips: copied.clips.map((x, j) => (j === i ? { ...x, pattern: name } : x)) }
}

// Clips moved onto other tracks: each to the track `to[k]` (by index into `which`), carrying its
// pattern there. A track that has the very pattern under its name already plays that; else the
// pattern is copied in, under its name where that is free and a free name where not, once for all
// the clips of it moved together. A clip moved onto a track of the other kind stays where it is: a
// note track has no use for automation notes, nor an automation track for notes.
export function moveClipsTo(p: Project, which: number[], to: number[]): Project {
  let out = p
  const carried = new Map<string, string>() // `${from}:${pattern}:${to}` → its name on `to`
  const clips = [...p.clips]
  which.forEach((i, k) => {
    slot(p.clips, i)
    const c = p.clips[i]!
    const dest = to[k]!
    if (!p.tracks[dest]) throw new Error(`audiodaw: no track ${dest}`)
    if (dest === c.track || p.tracks[dest]!.kind !== p.tracks[c.track]!.kind) return
    const key = `${c.track}:${c.pattern}:${dest}`
    let name = carried.get(key)
    if (!name) {
      const x = patternOf(p, c)
      const there = out.tracks[dest]!.patterns
      if (there[c.pattern] === x) name = c.pattern
      else {
        name = freeName(Object.keys(there), c.pattern)
        out = put(out, dest, name, x)
      }
      carried.set(key, name)
    }
    clips[i] = { ...c, track: dest, pattern: name }
  })
  return { ...out, clips }
}

// Whether a note track's notes are let through: not muted, and soloed when any note track is. An
// automation track's values reach its knob when it is not muted, whatever is soloed.
export function sounds(p: Project, t: number): boolean {
  const x = p.tracks[t]
  if (!x || x.mute) return false
  if (x.kind === 'automation') return true
  return x.solo || !p.tracks.some(o => o.kind === 'notes' && o.solo)
}

// The device a note track targets, or undefined when it targets none or is an automation track.
export function deviceOf(p: Project, t: number): Device | undefined {
  const x = p.tracks[t]
  return x?.kind !== 'notes' || x.target === undefined ? undefined : p.rack[x.target]
}

// A track with its patterns changed by `change`, which keeps every pattern of the kind it was: it
// renames, removes, adds one of the track's own kind, or changes a pattern's `length` or `from`.
function lanes(x: Track, change: (patterns: Record<string, Lane>) => Record<string, Lane>): Track {
  return x.kind === 'notes'
    ? { ...x, patterns: change(x.patterns) as Record<string, Pattern> }
    : { ...x, patterns: change(x.patterns) as Record<string, AutomationPattern> }
}

// A pattern of either kind changed in its `length` or `from`.
function pattern(p: Project, t: number, name: string, change: (pattern: Lane) => Lane): Project {
  return track(p, t, (x) => lanes(x, (patterns) => {
    const was = patterns[name]
    if (!was) throw new Error(`audiodaw: track ${t} has no pattern ${name}`)
    return { ...patterns, [name]: change(was) }
  }))
}

// A note track's pattern changed.
function notes(p: Project, t: number, name: string, change: (pattern: Pattern) => Pattern): Project {
  const x = noteTrack(p, t)
  const was = x.patterns[name]
  if (!was) throw new Error(`audiodaw: track ${t} has no pattern ${name}`)
  return track(p, t, () => ({ ...x, patterns: { ...x.patterns, [name]: change(was) } }))
}

// An automation track's pattern changed.
function automation(p: Project, t: number, name: string, change: (pattern: AutomationPattern) => AutomationPattern): Project {
  const x = automationTrack(p, t)
  const was = x.patterns[name]
  if (!was) throw new Error(`audiodaw: track ${t} has no pattern ${name}`)
  return track(p, t, () => ({ ...x, patterns: { ...x.patterns, [name]: change(was) } }))
}

function effects(p: Project, at: Chain, change: (effects: Effect[]) => Effect[]): Project {
  if (at === 'master') return { ...p, master: { ...p.master, effects: change(p.master.effects) } }
  if ('bus' in at) {
    const bus = p.buses[at.bus]
    if (!bus) throw new Error(`audiodaw: no bus ${at.bus}`)
    return { ...p, buses: { ...p.buses, [at.bus]: { ...bus, effects: change(bus.effects) } } }
  }
  return device(p, at.device, (x) => ({ ...x, effects: change(x.effects) }))
}

function slot<T>(list: T[], i: number): void {
  if (i < 0 || i >= list.length || !Number.isInteger(i)) throw new Error(`audiodaw: no slot ${i}`)
}

// Notes ------------------------------------------------------------------------------------------

export function addNote(p: Project, t: number, name: string, note: Note): Project {
  return notes(p, t, name, (x) => ({ ...x, notes: [...x.notes, note] }))
}

export function moveNote(p: Project, t: number, name: string, i: number, to: Partial<Note>): Project {
  return notes(p, t, name, (x) => {
    slot(x.notes, i)
    return { ...x, notes: x.notes.map((n, j) => (j === i ? { ...n, ...to } : n)) }
  })
}

export function removeNote(p: Project, t: number, name: string, i: number): Project {
  return notes(p, t, name, (x) => {
    slot(x.notes, i)
    return { ...x, notes: x.notes.filter((_, j) => j !== i) }
  })
}

// Automation notes -------------------------------------------------------------------------------

// How far an exp segment's line has come at fraction `u` of its way: the one bend every exp segment
// takes, slow and then fast.
const bend = (u: number) => (Math.exp(3 * u) - 1) / (Math.exp(3) - 1)

// An automation note's value, 0 to 1, `at` ticks from its start: its first point's before it, its
// last point's after it, and between two points the line the later one's shape draws. A step holds
// the value before it until its tick.
export function valueAt(n: AutomationNote, at: number): number {
  const p = n.points
  if (at <= 0) return p[0]!.value
  for (let j = 1; j < p.length; j++) {
    const a = p[j - 1]!, b = p[j]!
    if (at > b.at) continue
    if (b.shape === 'step') return at < b.at ? a.value : b.value
    const u = b.at === a.at ? 1 : (at - a.at) / (b.at - a.at)
    return a.value + (b.value - a.value) * (b.shape === 'exp' ? bend(u) : u)
  }
  return p.at(-1)!.value
}

// A knob's travel: its least and most, on a curve (`log`: the same ratio for the same turn, as a
// frequency is heard), and the step a knob of whole numbers moves by. The page hands it, from the
// definition its faceplates are drawn from.
export type Range = { min: number; max: number; curve?: 'log'; step?: number }

// A value from 0 to 1 of a knob's travel in the knob's own units.
export function level(r: Range, v: number): number {
  const x = r.curve === 'log' ? r.min * Math.pow(r.max / r.min, v) : r.min + (r.max - r.min) * v
  return r.step ? Math.round(x / r.step) * r.step : x
}

// An automation note from tick `time` for `duration` ticks, from value `start` to value `end` in a
// straight line: its two points, at 0 and at its duration.
export function automationNote(time: number, duration: number, start: number, end: number): AutomationNote {
  return { time, duration, points: [{ at: 0, value: start, shape: 'linear' }, { at: duration, value: end, shape: 'linear' }] }
}

// An automation note's points as the song keeps them: the first at 0, the last at its duration, the
// rest in order between, every value from 0 to 1. Values and ticks come from a pointer or a file, so
// they are checked here.
function held(n: AutomationNote): AutomationNote {
  if (!(n.duration > 0)) throw new Error(`audiodaw: an automation note ${n.duration} ticks long`)
  if (n.points.length < 2) throw new Error('audiodaw: an automation note needs a start and an end point')
  if (n.points[0]!.at !== 0 || n.points.at(-1)!.at !== n.duration) throw new Error(`audiodaw: an automation note's points run from ${n.points[0]!.at} to ${n.points.at(-1)!.at}, not from 0 to ${n.duration}`)
  n.points.forEach((q, j) => {
    if (!(q.value >= 0 && q.value <= 1)) throw new Error(`audiodaw: a point's value ${q.value} is outside 0 to 1`)
    if (j && q.at < n.points[j - 1]!.at) throw new Error('audiodaw: an automation note\'s points are out of order')
  })
  return n
}

export function addAutomationNote(p: Project, t: number, name: string, note: AutomationNote): Project {
  return automation(p, t, name, (x) => ({ ...x, notes: [...x.notes, held(note)] }))
}

// An automation note moved to another time, or made another length: its points stretch with it, each
// at the same fraction of the note it was.
export function moveAutomationNote(p: Project, t: number, name: string, i: number, to: { time?: number; duration?: number }): Project {
  return automation(p, t, name, (x) => {
    slot(x.notes, i)
    return {
      ...x,
      notes: x.notes.map((n, j) => {
        if (j !== i) return n
        const duration = to.duration ?? n.duration
        const k = duration / n.duration
        return held({ time: to.time ?? n.time, duration, points: n.points.map((q, m) => ({ ...q, at: m === n.points.length - 1 ? duration : q.at * k })) })
      }),
    }
  })
}

export function removeAutomationNote(p: Project, t: number, name: string, i: number): Project {
  return automation(p, t, name, (x) => {
    slot(x.notes, i)
    return { ...x, notes: x.notes.filter((_, j) => j !== i) }
  })
}

// An automation note's points changed by `change`, and kept as the song keeps them.
function points(p: Project, t: number, name: string, i: number, change: (points: Point[]) => Point[]): Project {
  return automation(p, t, name, (x) => {
    slot(x.notes, i)
    return { ...x, notes: x.notes.map((n, j) => (j === i ? held({ ...n, points: change(n.points) }) : n)) }
  })
}

// A point put in among an automation note's, in order of `at`, between its first and its last.
export function addPoint(p: Project, t: number, name: string, i: number, point: Point): Project {
  return points(p, t, name, i, (list) => {
    if (!(point.at > 0 && point.at < list.at(-1)!.at)) throw new Error(`audiodaw: a point at ${point.at} is not inside its note`)
    const k = list.findIndex((q) => q.at > point.at)
    return [...list.slice(0, k), point, ...list.slice(k)]
  })
}

// A point moved or reshaped. The first point stays at 0 and the last at the note's end: only their
// value and shape change. One between stays between its neighbours.
export function movePoint(p: Project, t: number, name: string, i: number, j: number, to: Partial<Point>): Project {
  return points(p, t, name, i, (list) => {
    slot(list, j)
    const last = list.length - 1
    const at = j === 0 ? 0 : j === last ? list[last]!.at : Math.max(list[j - 1]!.at, Math.min(list[j + 1]!.at, to.at ?? list[j]!.at))
    return list.map((q, m) => (m === j ? { ...q, ...to, at } : q))
  })
}

// A point between the first and the last taken away.
export function removePoint(p: Project, t: number, name: string, i: number, j: number): Project {
  return points(p, t, name, i, (list) => {
    slot(list, j)
    if (j === 0 || j === list.length - 1) throw new Error('audiodaw: an automation note keeps its start and end points')
    return list.filter((_, m) => m !== j)
  })
}

// Clips ------------------------------------------------------------------------------------------

export function addClip(p: Project, clip: Clip): Project {
  if (!p.tracks[clip.track]?.patterns[clip.pattern]) {
    throw new Error(`audiodaw: track ${clip.track} has no pattern ${clip.pattern}`)
  }
  return { ...p, clips: [...p.clips, clip] }
}

export function moveClip(p: Project, i: number, to: Partial<Clip>): Project {
  slot(p.clips, i)
  const clip = { ...p.clips[i]!, ...to }
  if (!p.tracks[clip.track]?.patterns[clip.pattern]) {
    throw new Error(`audiodaw: track ${clip.track} has no pattern ${clip.pattern}`)
  }
  return { ...p, clips: p.clips.map((c, j) => (j === i ? clip : c)) }
}

export function removeClip(p: Project, i: number): Project {
  slot(p.clips, i)
  return { ...p, clips: p.clips.filter((_, j) => j !== i) }
}

// Tracks -----------------------------------------------------------------------------------------

export function addTrack(p: Project, t: Track): Project {
  if (t.kind === 'notes' && t.target !== undefined && !p.rack[t.target]) throw new Error(`audiodaw: no device ${t.target}`)
  if (t.kind === 'automation' && t.target) there(p, t.target)
  return { ...p, tracks: [...p.tracks, t] }
}

// A track goes with its clips; the clips of the tracks after it follow them down.
export function removeTrack(p: Project, t: number): Project {
  if (!p.tracks[t]) throw new Error(`audiodaw: no track ${t}`)
  return {
    ...p,
    tracks: p.tracks.filter((_, i) => i !== t),
    clips: p.clips.filter((c) => c.track !== t).map((c) => (c.track > t ? { ...c, track: c.track - 1 } : c)),
  }
}

// The device a note track sends its notes to, or none.
export function setTarget(p: Project, t: number, target: number | undefined): Project {
  if (target !== undefined && !p.rack[target]) throw new Error(`audiodaw: no device ${target}`)
  const { target: _was, ...x } = noteTrack(p, t)
  return track(p, t, () => (target === undefined ? x : { ...x, target }))
}

// The knob an automation track sends its values to, or none.
export function setKnob(p: Project, t: number, knob: Knob | undefined): Project {
  if (knob) there(p, knob)
  const { target: _was, ...x } = automationTrack(p, t)
  return track(p, t, () => (knob ? { ...x, target: knob } : x))
}

// A track's name, colour or mute, or a note track's solo: an automation track has no solo.
export function setTrack<K extends 'name' | 'color' | 'mute' | 'solo'>(p: Project, t: number, field: K, value: NoteTrack[K]): Project {
  if (field === 'solo') noteTrack(p, t)
  return track(p, t, (x) => ({ ...x, [field]: value }))
}

// A knob the song has: its device, bus and effect are there. Indices come from a pointer or a file,
// so they are checked here.
function there(p: Project, k: Knob): void {
  const device = (d: number) => { if (!p.rack[d]) throw new Error(`audiodaw: no device ${d}`) }
  const bus = (b: string) => { if (!p.buses[b]) throw new Error(`audiodaw: no bus ${b}`) }
  const strip = (c: Chain) => { if (c !== 'master') 'bus' in c ? bus(c.bus) : device(c.device) }
  switch (k.part) {
    case 'instrument': device(k.device); break
    case 'effect': strip(k.chain); slot(chainOf(p, k.chain), k.effect); break
    case 'volume': case 'pan': strip(k.strip); break
    case 'send': device(k.device); bus(k.bus); break
  }
}

// A chain's effects.
function chainOf(p: Project, c: Chain): Effect[] {
  return c === 'master' ? p.master.effects : 'bus' in c ? p.buses[c.bus]!.effects : p.rack[c.device]!.effects
}

const sameChain = (a: Chain, b: Chain) => a === b || (a !== 'master' && b !== 'master' && ('bus' in a ? 'bus' in b && a.bus === b.bus : 'device' in b && a.device === b.device))

// How an edit moved the things knobs name: where each device went (undefined: gone), where each
// effect of a chain went, which buses, instruments and sends are still there.
type Moved = {
  device?: (d: number) => number | undefined
  effect?: (c: Chain, e: number) => number | undefined
  bus?: (b: string) => boolean
  instrument?: (d: number) => boolean
  send?: (d: number, b: string) => boolean
}

// A knob where it is after an edit, or undefined when what it names is gone. Every function of `m`
// reads the song as it was before the edit.
function moved(k: Knob, m: Moved): Knob | undefined {
  const device = (d: number) => (m.device ? m.device(d) : d)
  const strip = (c: Chain): Chain | undefined => {
    if (c === 'master') return c
    if ('bus' in c) return !m.bus || m.bus(c.bus) ? c : undefined
    const d = device(c.device)
    return d === undefined ? undefined : { device: d }
  }
  switch (k.part) {
    case 'instrument': {
      const d = device(k.device)
      return d === undefined || (m.instrument && !m.instrument(k.device)) ? undefined : { ...k, device: d }
    }
    case 'effect': {
      const e = m.effect ? m.effect(k.chain, k.effect) : k.effect
      const c = strip(k.chain)
      return c === undefined || e === undefined ? undefined : { ...k, chain: c, effect: e }
    }
    case 'volume': {
      const c = strip(k.strip)
      return c === undefined ? undefined : { ...k, strip: c }
    }
    case 'pan': {
      const c = strip(k.strip)
      return c === undefined || c === 'master' ? undefined : { ...k, strip: c }
    }
    case 'send': {
      const d = device(k.device)
      return d === undefined || (m.bus && !m.bus(k.bus)) || (m.send && !m.send(k.device, k.bus)) ? undefined : { ...k, device: d }
    }
  }
}

// Every automation track's knob where it is after an edit; a track whose knob is gone targets none.
function retarget(tracks: Track[], m: Moved): Track[] {
  return tracks.map((x) => {
    if (x.kind !== 'automation' || !x.target) return x
    const k = moved(x.target, m)
    if (k) return { ...x, target: k }
    const { target: _gone, ...rest } = x
    return rest
  })
}

// Where each place of a list went when the one at `from` moved to `to`.
function order(length: number, from: number, to: number): Map<number, number> {
  const was = Array.from({ length }, (_, i) => i)
  was.splice(from, 1)
  was.splice(to, 0, from)
  return new Map(was.map((w, now) => [w, now]))
}

// A track moved to place `to` among the tracks, its clips with it.
export function moveTrack(p: Project, from: number, to: number): Project {
  slot(p.tracks, from)
  slot(p.tracks, to)
  if (from === to) return p
  const at = order(p.tracks.length, from, to)
  const tracks: Track[] = []
  at.forEach((now, was) => { tracks[now] = p.tracks[was]! })
  return { ...p, tracks, clips: p.clips.map((c) => ({ ...c, track: at.get(c.track)! })) }
}

// The rack ---------------------------------------------------------------------------------------

export function addDevice(p: Project, d: Device): Project {
  return { ...p, rack: [...p.rack, d] }
}

// A device made from a preset: its instrument and effects, a channel at 0 dB in the middle, no sends.
export function deviceFrom(name: string, preset: Preset): Device {
  return {
    name,
    instrument: structuredClone(preset.instrument),
    effects: structuredClone(preset.effects ?? []),
    channel: { volume: 0, pan: 0, mute: false, solo: false },
    sends: {},
  }
}

// A device goes; the tracks that targeted it or one of its knobs target none, and those targeting a
// device after it follow it down.
export function removeDevice(p: Project, d: number): Project {
  if (!p.rack[d]) throw new Error(`audiodaw: no device ${d}`)
  const tracks = p.tracks.map((x) => {
    if (x.kind !== 'notes' || x.target === undefined || x.target < d) return x
    const { target, ...rest } = x
    return target === d ? rest : { ...rest, target: target - 1 }
  })
  return {
    ...p,
    rack: p.rack.filter((_, i) => i !== d),
    tracks: retarget(tracks, { device: (i) => (i === d ? undefined : i > d ? i - 1 : i) }),
  }
}

export function renameDevice(p: Project, d: number, name: string): Project {
  return device(p, d, (x) => ({ ...x, name }))
}

// A device moved to place `to` in the rack; every track keeps targeting the device, or the knob, it
// did.
export function moveDevice(p: Project, from: number, to: number): Project {
  slot(p.rack, from)
  slot(p.rack, to)
  if (from === to) return p
  const at = order(p.rack.length, from, to)
  const rack: Device[] = []
  at.forEach((now, was) => { rack[now] = p.rack[was]! })
  const tracks = p.tracks.map((x) => (x.kind !== 'notes' || x.target === undefined ? x : { ...x, target: at.get(x.target)! }))
  return { ...p, rack, tracks: retarget(tracks, { device: (d) => at.get(d) }) }
}

// The strip and sends ----------------------------------------------------------------------------

export function setChannel<K extends keyof Channel>(p: Project, d: number, field: K, value: Channel[K]): Project {
  return device(p, d, (x) => ({ ...x, channel: { ...x.channel, [field]: value } }))
}

export function setSend(p: Project, d: number, bus: string, dB: number): Project {
  if (!p.buses[bus]) throw new Error(`audiodaw: no bus ${bus}`)
  return device(p, d, (x) => ({ ...x, sends: { ...x.sends, [bus]: dB } }))
}

// A send taken away; a track targeting it targets none.
export function removeSend(p: Project, d: number, bus: string): Project {
  const out = device(p, d, (x) => {
    const { [bus]: _gone, ...sends } = x.sends
    return { ...x, sends }
  })
  return { ...out, tracks: retarget(out.tracks, { send: (e, b) => !(e === d && b === bus) }) }
}

// Effects ----------------------------------------------------------------------------------------

// An effect put in a chain at `i` (its end when left out); the knobs of the effects after it follow
// them up.
export function addEffect(p: Project, at: Chain, effect: Effect, i?: number): Project {
  let to = 0
  const out = effects(p, at, (list) => {
    to = i ?? list.length
    if (to < 0 || to > list.length) throw new Error(`audiodaw: no slot ${to}`)
    return [...list.slice(0, to), effect, ...list.slice(to)]
  })
  return { ...out, tracks: retarget(out.tracks, { effect: (c, e) => (sameChain(c, at) && e >= to ? e + 1 : e) }) }
}

// An effect taken away; a track targeting one of its knobs targets none, and the knobs of the effects
// after it follow them down.
export function removeEffect(p: Project, at: Chain, i: number): Project {
  const out = effects(p, at, (list) => {
    slot(list, i)
    return list.filter((_, j) => j !== i)
  })
  return { ...out, tracks: retarget(out.tracks, { effect: (c, e) => (!sameChain(c, at) ? e : e === i ? undefined : e > i ? e - 1 : e) }) }
}

// An effect moved along its chain, every knob of the chain's effects going with its effect.
export function moveEffect(p: Project, at: Chain, from: number, to: number): Project {
  let length = 0
  const out = effects(p, at, (list) => {
    slot(list, from)
    slot(list, to)
    length = list.length
    const next = list.filter((_, j) => j !== from)
    next.splice(to, 0, list[from]!)
    return next
  })
  const went = order(length, from, to)
  return { ...out, tracks: retarget(out.tracks, { effect: (c, e) => (sameChain(c, at) ? went.get(e) : e) }) }
}

export function setEffect(p: Project, at: Chain, i: number, options: object): Project {
  return effects(p, at, (list) => {
    slot(list, i)
    return list.map((e, j) => (j === i ? { ...e, options: merge(e.options, options) } : e))
  })
}

// An effect put in place of the one at `i`, its options as they are handed, merged with nothing. One
// of another kind (`is`) has other options, so a track targeting a knob of the old one targets none.
export function putEffect(p: Project, at: Chain, i: number, effect: Effect): Project {
  let was = ''
  const out = effects(p, at, (list) => {
    slot(list, i)
    was = list[i]!.is
    return list.map((e, j) => (j === i ? effect : e))
  })
  if (was === effect.is) return out
  return { ...out, tracks: retarget(out.tracks, { effect: (c, e) => (sameChain(c, at) && e === i ? undefined : e) }) }
}

export function turnEffect(p: Project, at: Chain, i: number, on: boolean): Project {
  return effects(p, at, (list) => {
    slot(list, i)
    return list.map((e, j) => (j === i ? { ...e, on } : e))
  })
}

// Buses ------------------------------------------------------------------------------------------

export function addBus(p: Project, name: string, bus: Bus): Project {
  if (p.buses[name]) throw new Error(`audiodaw: bus ${name} is already there`)
  return { ...p, buses: { ...p.buses, [name]: bus } }
}

// A bus goes with every send to it; a track targeting one of its knobs, or a send to it, targets none.
export function removeBus(p: Project, name: string): Project {
  if (!p.buses[name]) throw new Error(`audiodaw: no bus ${name}`)
  const { [name]: _gone, ...buses } = p.buses
  return {
    ...p,
    buses,
    rack: p.rack.map((x) => {
      const { [name]: _send, ...sends } = x.sends
      return { ...x, sends }
    }),
    tracks: retarget(p.tracks, { bus: (b) => b !== name }),
  }
}

// Instruments ------------------------------------------------------------------------------------

// A preset is loaded into a device's instrument and nothing else: its channel, sends and effects
// stay. An instrument of another kind (`is`) has other options, so a track targeting a knob of the
// old one targets none.
export function loadPreset(p: Project, d: number, preset: Preset): Project {
  return putInstrument(p, d, structuredClone(preset.instrument))
}

// A device's instrument put in place of the one it had, as it is handed, merged with nothing; a
// track targeting a knob of an instrument of another kind targets none.
export function putInstrument(p: Project, d: number, instrument: Instrument): Project {
  const was = p.rack[d]?.instrument.is
  const out = device(p, d, (x) => ({ ...x, instrument }))
  if (was === instrument.is) return out
  return { ...out, tracks: retarget(out.tracks, { instrument: (e) => e !== d }) }
}

// One setting of the instrument, as `instrument.set(options)` takes it: nested objects merge.
export function setInstrument(p: Project, d: number, options: object): Project {
  return device(p, d, (x) => ({ ...x, instrument: { ...x.instrument, options: merge(x.instrument.options, options) } }))
}

function merge(into: object, from: object): object {
  const out: Record<string, unknown> = { ...into }
  for (const [k, v] of Object.entries(from)) {
    const was = out[k]
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && was && typeof was === 'object' && !Array.isArray(was)
        ? merge(was, v)
        : v
  }
  return out
}
