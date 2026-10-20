// A synthaudio project: one song, as one file, and everything that reads or changes it without
// playing it. The browser half (`synthaudio.plugin.ts`) plays a project; a studio edits one with the
// edits below; nothing here touches Web Audio, so it runs anywhere.
//
// A project is `{ bpm, length, master, tracks }`. Time is counted in sixteenth notes, whole numbers,
// 16 to a bar, and the song loops over `length` of them.
//   master   what every track goes out through: `compressor` { threshold dB, ratio, attack s,
//            release s }, then a limiter at `limiter` dB. And the two effects every track sends to:
//            `echo` { time, feedback }, a delay `time` long (a Tone time, "8n") feeding back
//            `feedback` of itself, and `room` { decay }, a reverb `decay` seconds long.
//   tracks   by name, in the order they are listed. A track is `{ instrument, patterns, clips }`:
//            one instrument, the patterns written for it, and the clips that place them in the song.
//
// An instrument is `{ is, params, presets, loaded }`. `is` is what it is, one of `INSTRUMENTS`, and
// fixes the params it has; another `is` is another instrument. `params` holds every value it plays
// with, always all of them, and is all a project plays from. `presets` is its own bank by name, each
// preset holding exactly the keys of its `params`: loading one copies it over `params`, saving one
// copies `params` into it (`load`, `keep`). `loaded` is the name of the preset last loaded, or null: a
// label for whoever edits it, which nothing plays from.
//
// The params of each instrument, `INSTRUMENTS[is]`, and what each is:
//   wave         the oscillator's shape, one of `WAVES`.
//   attack, decay, release   seconds; sustain, 0 to 1 of full.
//   cutoff       a lowpass filter's corner, Hz; resonance, its Q.
//   harmonicity  an FM synth's modulator over its carrier; modulation, its modulation index.
//   brightness   a plucked string's dampening, Hz; its resonance, 0 to 1; its release, seconds.
//   echo, room   how much of the track is sent to the master's echo and room, 0 to 1.
//   gain         the track's level, 0 to 1 and up; pan, -1 left to 1 right.
//   pads         a drumkit's pads by name. A pad is `{ voice, decay, gain }` and by its voice:
//                `membrane` and `metal` a `pitch`, a note; `noise` nothing more; `sample` a `sample`, a
//                path. A drum note names the pad it hits.
//   samples      a sampler's samples, note to path; a note between two is played by the nearest,
//                pitched to it.
// A path is relative to the project's own file. A sample that is not there plays nothing, and nothing
// says so.
//
// A pattern is `{ length, notes }`, a note `[sixteenth, note, sixteenths long, velocity 0 to 1]`, its
// sixteenth inside the pattern. A note is a name Tone reads ("C4", "F#3"), or, on a drumkit's track,
// the name of a pad. A clip is `[sixteenth, pattern, repeats]`: the pattern played `repeats` times
// one after another from that sixteenth of the song. A note past the song's end is not played.
//
// `check(project)` throws on anything a project may not hold, naming where it is, before anything
// plays it: a file comes from outside the program. `flatten(project)` is every note the song plays,
// in time.
//
// The edits change the project they are handed and check what they are handed, throwing, naming it,
// on anything that would leave the project unplayable, so a studio's undo is a copy of the project
// before the edit.

export const WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const
export const VOICES = ['membrane', 'noise', 'metal', 'sample'] as const
export type Wave = (typeof WAVES)[number]
export type Voice = (typeof VOICES)[number]

// What a param holds: a number, one of a list, a note name, a drumkit's pads, or a sampler's samples.
type Param = 'number' | readonly string[] | 'pads' | 'samples'
const SEND = { echo: 'number', room: 'number', gain: 'number', pan: 'number' } as const
const ADSR = { attack: 'number', decay: 'number', sustain: 'number', release: 'number' } as const

export const INSTRUMENTS = {
  synth: { wave: WAVES, ...ADSR, ...SEND },
  monosynth: { wave: WAVES, ...ADSR, cutoff: 'number', resonance: 'number', ...SEND },
  fmsynth: { wave: WAVES, ...ADSR, harmonicity: 'number', modulation: 'number', ...SEND },
  pluck: { brightness: 'number', resonance: 'number', release: 'number', ...SEND },
  drumkit: { pads: 'pads', ...SEND },
  sampler: { samples: 'samples', attack: 'number', release: 'number', cutoff: 'number', resonance: 'number', ...SEND },
} as const satisfies Record<string, Record<string, Param>>
export type Is = keyof typeof INSTRUMENTS

// The keys a pad of each voice holds.
const PAD: Record<Voice, readonly string[]> = {
  membrane: ['voice', 'pitch', 'decay', 'gain'],
  metal: ['voice', 'pitch', 'decay', 'gain'],
  noise: ['voice', 'decay', 'gain'],
  sample: ['voice', 'sample', 'decay', 'gain'],
}

export type Pad = { voice: Voice; decay: number; gain: number; pitch?: string; sample?: string }
export type Params = Record<string, any>
export type Instrument = { is: Is; params: Params; presets: Record<string, Params>; loaded: string | null }
export type Note = [at: number, note: string, len: number, vel: number]
export type Pattern = { length: number; notes: Note[] }
export type Clip = [at: number, pattern: string, repeats: number]
export type Track = { instrument: Instrument; patterns: Record<string, Pattern>; clips: Clip[] }
export type Master = {
  compressor: { threshold: number; ratio: number; attack: number; release: number }
  limiter: number
  echo: { time: string; feedback: number }
  room: { decay: number }
}
export type Project = { bpm: number; length: number; master: Master; tracks: Record<string, Track> }
// A note the song plays, at a sixteenth of the song.
export type Played = { at: number; track: string; note: string; len: number; vel: number }

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLATS: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' }
// A note's name as a number of semitones, C-1 at 0, as MIDI counts them; its name back.
export const midi = (name: string) => {
  const m = /^([A-G][#b]?)(-?\d+)$/.exec(name)
  if (!m) throw new Error(`synthaudio: ${name} is not a note`)
  return NAMES.indexOf(FLATS[m[1]] ?? m[1]) + 12 * (Number(m[2]) + 1)
}
export const named = (n: number) => NAMES[n % 12] + (Math.floor(n / 12) - 1)
const isNote = (v: unknown) => typeof v === 'string' && /^([A-G][#b]?)(-?\d+)$/.test(v)

// The seconds one sixteenth lasts at `bpm`.
export const sixteenth = (bpm: number) => 60 / bpm / 4

const record = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)
function fail(at: string, what: string): never { throw new Error(`synthaudio project: ${at} ${what}`) }
const count = (v: unknown, at: string, least: number) => {
  if (!Number.isInteger(v) || (v as number) < least) fail(at, `is ${JSON.stringify(v)}, and not a whole number from ${least}`)
}
const num = (v: unknown, at: string) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail(at, `is ${JSON.stringify(v)}, and not a number`) }
const keys = (v: Record<string, unknown>, want: readonly string[], at: string) => {
  for (const k of want) if (!(k in v)) fail(at, `has no ${k}`)
  for (const k of Object.keys(v)) if (!want.includes(k)) fail(at, `has ${k}, which it does not take`)
}

function pad(v: unknown, at: string) {
  if (!record(v)) return fail(at, 'is not a pad')
  if (!VOICES.includes(v.voice)) fail(`${at}.voice`, `is ${JSON.stringify(v.voice)}, and not one of ${VOICES.join(', ')}`)
  keys(v, PAD[v.voice as Voice], at)
  num(v.decay, `${at}.decay`)
  num(v.gain, `${at}.gain`)
  if ('pitch' in v && !isNote(v.pitch)) fail(`${at}.pitch`, `is ${JSON.stringify(v.pitch)}, and not a note`)
  if ('sample' in v && typeof v.sample !== 'string') fail(`${at}.sample`, 'is not a path')
}

// `params` checked against what instrument `is` takes.
export function checkParams(is: Is, params: unknown, at: string) {
  const want = INSTRUMENTS[is] as Record<string, Param>
  if (!record(params)) return fail(at, 'is not params')
  keys(params, Object.keys(want), at)
  for (const [k, kind] of Object.entries(want)) {
    const v = params[k], here = `${at}.${k}`
    if (kind === 'number') num(v, here)
    else if (kind === 'pads') {
      if (!record(v)) fail(here, 'is not pads by name')
      for (const [name, p] of Object.entries(v)) pad(p, `${here}.${name}`)
    } else if (kind === 'samples') {
      if (!record(v)) fail(here, 'is not samples by note')
      for (const [note, path] of Object.entries(v)) {
        if (!isNote(note)) fail(here, `has ${note}, which is not a note`)
        if (typeof path !== 'string') fail(`${here}.${note}`, 'is not a path')
      }
    } else if (!kind.includes(v)) fail(here, `is ${JSON.stringify(v)}, and not one of ${kind.join(', ')}`)
  }
}

function instrument(v: unknown, at: string) {
  if (!record(v)) return fail(at, 'is not an instrument')
  keys(v, ['is', 'params', 'presets', 'loaded'], at)
  if (!Object.hasOwn(INSTRUMENTS, v.is)) fail(`${at}.is`, `is ${JSON.stringify(v.is)}, and not one of ${Object.keys(INSTRUMENTS).join(', ')}`)
  checkParams(v.is, v.params, `${at}.params`)
  if (!record(v.presets)) fail(`${at}.presets`, 'is not presets by name')
  for (const [name, p] of Object.entries(v.presets)) checkParams(v.is, p, `${at}.presets.${name}`)
  if (v.loaded !== null && typeof v.loaded !== 'string') fail(`${at}.loaded`, 'is neither a name nor null')
}

// A note's name on a track of instrument `i`: a pad's name on a drumkit, a note's name on the rest.
function playable(i: Instrument, note: unknown, at: string) {
  if (i.is === 'drumkit') {
    if (typeof note !== 'string' || !Object.hasOwn(i.params.pads, note)) fail(at, `is ${JSON.stringify(note)}, and not a pad of the drumkit`)
  } else if (!isNote(note)) fail(at, `is ${JSON.stringify(note)}, and not a note`)
}

function note(i: Instrument, n: unknown, length: number, at: string) {
  if (!Array.isArray(n) || n.length !== 4) return fail(at, 'is not [sixteenth, note, length, velocity]')
  count(n[0], `${at}[0]`, 0)
  if (n[0] >= length) fail(`${at}[0]`, `is ${n[0]}, past the pattern's length ${length}`)
  playable(i, n[1], `${at}[1]`)
  count(n[2], `${at}[2]`, 1)
  num(n[3], `${at}[3]`)
}

function track(v: unknown, at: string) {
  if (!record(v)) return fail(at, 'is not a track')
  keys(v, ['instrument', 'patterns', 'clips'], at)
  instrument(v.instrument, `${at}.instrument`)
  if (!record(v.patterns)) fail(`${at}.patterns`, 'is not patterns by name')
  for (const [name, p] of Object.entries(v.patterns)) {
    const here = `${at}.patterns.${name}`
    if (!record(p)) fail(here, 'is not a pattern')
    keys(p, ['length', 'notes'], here)
    count(p.length, `${here}.length`, 1)
    if (!Array.isArray(p.notes)) fail(`${here}.notes`, 'is not a list')
    p.notes.forEach((n: unknown, k: number) => note(v.instrument, n, p.length, `${here}.notes[${k}]`))
  }
  if (!Array.isArray(v.clips)) fail(`${at}.clips`, 'is not a list')
  v.clips.forEach((c: unknown, k: number) => {
    const here = `${at}.clips[${k}]`
    if (!Array.isArray(c) || c.length !== 3) return fail(here, 'is not [sixteenth, pattern, repeats]')
    count(c[0], `${here}[0]`, 0)
    if (typeof c[1] !== 'string' || !Object.hasOwn(v.patterns, c[1])) fail(`${here}[1]`, `is ${JSON.stringify(c[1])}, and not a pattern of the track`)
    count(c[2], `${here}[2]`, 1)
  })
}

export function check(v: unknown): asserts v is Project {
  if (!record(v)) return fail('', 'is not a project')
  keys(v, ['bpm', 'length', 'master', 'tracks'], 'the project')
  num(v.bpm, 'bpm')
  if (v.bpm <= 0) fail('bpm', 'is not above 0')
  count(v.length, 'length', 1)
  const m = v.master
  if (!record(m)) fail('master', 'is not a master')
  keys(m, ['compressor', 'limiter', 'echo', 'room'], 'master')
  if (!record(m.compressor)) fail('master.compressor', 'is not a compressor')
  keys(m.compressor, ['threshold', 'ratio', 'attack', 'release'], 'master.compressor')
  for (const k of ['threshold', 'ratio', 'attack', 'release']) num(m.compressor[k], `master.compressor.${k}`)
  num(m.limiter, 'master.limiter')
  if (!record(m.echo)) fail('master.echo', 'is not an echo')
  keys(m.echo, ['time', 'feedback'], 'master.echo')
  if (typeof m.echo.time !== 'string' && typeof m.echo.time !== 'number') fail('master.echo.time', 'is not a time')
  num(m.echo.feedback, 'master.echo.feedback')
  if (!record(m.room)) fail('master.room', 'is not a room')
  keys(m.room, ['decay'], 'master.room')
  num(m.room.decay, 'master.room.decay')
  if (!record(v.tracks)) fail('tracks', 'is not tracks by name')
  for (const [name, t] of Object.entries(v.tracks)) track(t, `tracks.${name}`)
}

// Every note the song plays, in time: each clip's pattern, repeated, from where the clip is.
export function flatten(p: Project): Played[] {
  const out: Played[] = []
  for (const [name, t] of Object.entries(p.tracks)) {
    for (const [at, pattern, repeats] of t.clips) {
      const pat = t.patterns[pattern]
      for (let k = 0; k < repeats; k++) {
        for (const [n, note, len, vel] of pat.notes) {
          const when = at + k * pat.length + n
          if (when < p.length) out.push({ at: when, track: name, note, len, vel })
        }
      }
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

// Every sample path a project names, each once.
export function samples(p: Project): string[] {
  const out = new Set<string>()
  for (const t of Object.values(p.tracks)) {
    const { is, params } = t.instrument
    if (is === 'drumkit') for (const pad of Object.values(params.pads as Record<string, Pad>)) { if (pad.voice === 'sample') out.add(pad.sample!) }
    if (is === 'sampler') for (const path of Object.values(params.samples as Record<string, string>)) out.add(path)
  }
  return [...out]
}

// ---------------------------------------------------------------- the edits

const trackOf = (p: Project, name: string) => {
  const t = p.tracks[name]
  if (!t) throw new Error(`synthaudio: the project has no track ${name}`)
  return t
}
const patternOf = (p: Project, name: string, pattern: string) => {
  const pat = trackOf(p, name).patterns[pattern]
  if (!pat) throw new Error(`synthaudio: track ${name} has no pattern ${pattern}`)
  return pat
}
const fresh = (taken: Record<string, unknown>, name: string) => {
  if (Object.hasOwn(taken, name)) throw new Error(`synthaudio: ${name} is taken`)
  if (!name) throw new Error('synthaudio: a name is not empty')
}

// A track `name` of an instrument `is`, with the bank `presets`, the first of them loaded; no
// patterns and no clips. It goes last.
export function addTrack(p: Project, name: string, is: Is, presets: Record<string, Params>) {
  fresh(p.tracks, name)
  const first = Object.keys(presets)[0]
  if (first === undefined) throw new Error(`synthaudio: a ${is} needs a preset to start from`)
  const i: Instrument = { is, params: structuredClone(presets[first]), presets: structuredClone(presets), loaded: first }
  instrument(i, `tracks.${name}.instrument`)
  p.tracks[name] = { instrument: i, patterns: {}, clips: [] }
}

export function removeTrack(p: Project, name: string) {
  trackOf(p, name)
  delete p.tracks[name]
}

// Track `name` renamed `to`, kept in its place among the tracks.
export function renameTrack(p: Project, name: string, to: string) {
  trackOf(p, name)
  if (to === name) return
  fresh(p.tracks, to)
  p.tracks = Object.fromEntries(Object.entries(p.tracks).map(([k, t]) => [k === name ? to : k, t]))
}

// Track `name`'s instrument made a new `is`, with the bank `presets`, its first loaded. The track's
// notes stay; a drumkit's pad names and other notes do not mean the same thing, so a change between
// a drumkit and anything else takes its patterns and clips away.
export function changeInstrument(p: Project, name: string, is: Is, presets: Record<string, Params>) {
  const t = trackOf(p, name)
  const drums = (x: Is) => x === 'drumkit'
  const made: Project = { ...p, tracks: {} }
  addTrack(made, name, is, presets)
  const next = made.tracks[name]
  if (drums(t.instrument.is) === drums(is)) Object.assign(next, { patterns: t.patterns, clips: t.clips })
  p.tracks[name] = next
}

// Preset `preset` of track `name`'s bank copied over its params. On a drumkit, a note hitting a pad
// the preset has not got is taken away with the pad, as `setPad` takes one away.
export function load(p: Project, name: string, preset: string) {
  const t = trackOf(p, name), i = t.instrument
  const values = i.presets[preset]
  if (!values) throw new Error(`synthaudio: track ${name}'s ${i.is} has no preset ${preset}`)
  i.params = structuredClone(values)
  i.loaded = preset
  if (i.is !== 'drumkit') return
  for (const pat of Object.values(t.patterns)) pat.notes = pat.notes.filter(n => Object.hasOwn(i.params.pads, n[1]))
}

// Track `name`'s params copied into its bank as `preset`, over one of that name.
export function keep(p: Project, name: string, preset: string) {
  if (!preset) throw new Error('synthaudio: a name is not empty')
  const i = trackOf(p, name).instrument
  i.presets[preset] = structuredClone(i.params)
  i.loaded = preset
}

// One of track `name`'s params set, at `path` inside its params (`['cutoff']`, `['pads', 'kick',
// 'decay']`). Only a value of the kind already there is taken.
export function set(p: Project, name: string, path: (string | number)[], value: unknown) {
  const i = trackOf(p, name).instrument
  const next = structuredClone(i.params)
  let at: any = next
  for (const k of path.slice(0, -1)) {
    if (!record(at) || !(k in at)) throw new Error(`synthaudio: track ${name} has no param ${path.join('.')}`)
    at = at[k]
  }
  const last = path[path.length - 1]
  if (!record(at) || !(last in at)) throw new Error(`synthaudio: track ${name} has no param ${path.join('.')}`)
  at[last] = value
  checkParams(i.is, next, `tracks.${name}.instrument.params`)
  i.params = next
}

// A pad `pad` added to track `name`'s drumkit, or taken away with `undefined` (and every note
// hitting it with it).
export function setPad(p: Project, name: string, pad: string, value: Pad | undefined) {
  const t = trackOf(p, name), i = t.instrument
  if (i.is !== 'drumkit') throw new Error(`synthaudio: track ${name} is a ${i.is}, which has no pads`)
  const pads = { ...i.params.pads }
  if (value === undefined) {
    delete pads[pad]
    for (const pat of Object.values(t.patterns)) pat.notes = pat.notes.filter(n => n[1] !== pad)
  } else pads[pad] = value
  checkParams(i.is, { ...i.params, pads }, `tracks.${name}.instrument.params`)
  i.params.pads = pads
}

// A pattern `pattern` of `length` sixteenths with no notes added to track `name`.
export function addPattern(p: Project, name: string, pattern: string, length: number) {
  const t = trackOf(p, name)
  fresh(t.patterns, pattern)
  count(length, 'length', 1)
  t.patterns[pattern] = { length, notes: [] }
}

// A pattern taken away, with every clip that plays it.
export function removePattern(p: Project, name: string, pattern: string) {
  const t = trackOf(p, name)
  patternOf(p, name, pattern)
  delete t.patterns[pattern]
  t.clips = t.clips.filter(c => c[1] !== pattern)
}

export function renamePattern(p: Project, name: string, pattern: string, to: string) {
  const t = trackOf(p, name)
  patternOf(p, name, pattern)
  if (to === pattern) return
  fresh(t.patterns, to)
  t.patterns = Object.fromEntries(Object.entries(t.patterns).map(([k, v]) => [k === pattern ? to : k, v]))
  for (const c of t.clips) if (c[1] === pattern) c[1] = to
}

// A pattern's length changed; a note that would start past it is taken away.
export function resizePattern(p: Project, name: string, pattern: string, length: number) {
  const pat = patternOf(p, name, pattern)
  count(length, 'length', 1)
  pat.length = length
  pat.notes = pat.notes.filter(n => n[0] < length)
}

// A note added to a pattern; its index among the pattern's notes. One at the same sixteenth and
// note is put in its place.
export function addNote(p: Project, name: string, pattern: string, n: Note) {
  const pat = patternOf(p, name, pattern)
  note(trackOf(p, name).instrument, n, pat.length, 'the note')
  const had = pat.notes.findIndex(m => m[0] === n[0] && m[1] === n[1])
  if (had >= 0) {
    pat.notes[had] = [...n]
    return had
  }
  pat.notes.push([...n])
  return pat.notes.length - 1
}

// Note `k` of a pattern set to `n`.
export function setNote(p: Project, name: string, pattern: string, k: number, n: Note) {
  const pat = patternOf(p, name, pattern)
  if (!pat.notes[k]) throw new Error(`synthaudio: pattern ${pattern} has no note ${k}`)
  note(trackOf(p, name).instrument, n, pat.length, 'the note')
  pat.notes[k] = [...n]
}

export function removeNote(p: Project, name: string, pattern: string, k: number) {
  const pat = patternOf(p, name, pattern)
  if (!pat.notes[k]) throw new Error(`synthaudio: pattern ${pattern} has no note ${k}`)
  pat.notes.splice(k, 1)
}

// A step of a pattern hit, or its hit taken away when it has one: the note `note` at sixteenth
// `at`, one long, at velocity `vel`. Whether it is hit now.
export function step(p: Project, name: string, pattern: string, at: number, note: string, vel: number) {
  const pat = patternOf(p, name, pattern)
  const had = pat.notes.findIndex(m => m[0] === at && m[1] === note)
  if (had >= 0) {
    pat.notes.splice(had, 1)
    return false
  }
  addNote(p, name, pattern, [at, note, 1, vel])
  return true
}

// A clip of `pattern` added to track `name`; its index among the track's clips.
export function addClip(p: Project, name: string, c: Clip) {
  const t = trackOf(p, name)
  patternOf(p, name, c[1])
  count(c[0], 'the clip\'s sixteenth', 0)
  count(c[2], 'the clip\'s repeats', 1)
  t.clips.push([...c])
  return t.clips.length - 1
}

export function setClip(p: Project, name: string, k: number, c: Clip) {
  const t = trackOf(p, name)
  if (!t.clips[k]) throw new Error(`synthaudio: track ${name} has no clip ${k}`)
  patternOf(p, name, c[1])
  count(c[0], 'the clip\'s sixteenth', 0)
  count(c[2], 'the clip\'s repeats', 1)
  t.clips[k] = [...c]
}

export function removeClip(p: Project, name: string, k: number) {
  const t = trackOf(p, name)
  if (!t.clips[k]) throw new Error(`synthaudio: track ${name} has no clip ${k}`)
  t.clips.splice(k, 1)
}

// The song's tempo and length.
export function setSong(p: Project, bpm: number, length: number) {
  num(bpm, 'bpm')
  if (bpm <= 0) throw new Error('synthaudio: bpm is above 0')
  count(length, 'length', 1)
  p.bpm = bpm
  p.length = length
}
