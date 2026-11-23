// audiodaw: the song played through Tone.js, a thin wrapper.
//
// `load(project)` sets Tone's Transport from the project and makes the Tone objects it names: each
// rack device's instrument (`voices` of `new Tone[is](options)` played in turn, `synth`, or a
// `DrumKit` of Tone drums, one per note, `drumKit`), its effects (`new Tone[is](options)`, chained
// in order, a Chorus's, a Tremolo's, an AutoPanner's and an AutoFilter's LFO started, which Tone
// makes stopped) and its `Tone.Channel`; each bus, a `Tone.Channel` that `receive`s its name into its
// effects; the master's effects, chained on `Tone.getDestination()`; and one looping `Tone.Part` per
// note clip, whose events are its pattern's notes, its loop the pattern's `from` to `length`, started
// at the clip's start with its offset into the loop and stopped at the clip's end. A Part's callback
// reads its track as the song is when the note falls: a track let through (`sounds`) plays
// `triggerAttackRelease(note, duration, time, velocity)` on the instrument of the device it targets
// then, so a track retargeted or muted while playing is heard so at its next note.
//
// The session (`launch`, `launchScene`, `halt`, `haltAll`, `arrange`, `session`) plays the song's
// slots: each a looping Part of its pattern on its track, started and stopped on a launch's tick. Its
// header is the session's section below.
//
// `edit(project)` hands each value that changed to the Tone object that holds it: `set` on an
// instrument or an effect, an effect off as `wet = 0`, the channel's `volume`, `pan`, `mute` and
// `solo`, a send's gain, a clip's Part made again when the clip or its pattern changed, and the
// instrument made again when its `is` or its `voices` changed. A rack of another length is made again, device by device; tracks have no
// Tone object of their own, so tracks come and go as their clips' Parts do. Everything else is the
// Transport's own: `play`, `stop`, `pause`, `locate`, `cycle`, `position` (`transport.ticks`) and
// `stamp` (`transport.getTicksAtTime(Tone.now())`). `optionsOf(device)` and `effectOptionsOf(chain,
// i)` are Tone's `get()` of what it holds, every option it has now.
//
// The song's span (`spanOf`) is where the transport stops itself: an event at its end calls
// `transport.stop`. Where play starts is the caller's (`play(tick)`). A stop or a pause, pressed or
// at the span's end, lets go of every note every instrument holds.
//
// An automation track's clips hold its knob (`automate`). The page hands `load` the knobs' ranges
// (`Ranges`), which turn a note's 0 to 1 into the knob's units (`level`); a knob with none, a muted
// track and a track with no target hold nothing. A knob Tone holds as a Param or a Signal on every
// object it lives on glides: at an automation note's first tick it is handed the whole line, each
// point reached by its shape on the audio clock, and at the note's end it goes back to its own value,
// the song's (or Tone's default), unless another note of the track takes it there. A knob Tone only
// sets is set on the note's first tick and every 16th of the song it covers, to the line's value
// there, and back to its own at its end; each set is sent the look-ahead before its tick, since Tone
// writes a setter's Param at its now(), which is the look-ahead past the context's time. A play from
// the middle of a note, a locate and the loop's jump back take every knob up where the song lands; a
// stop or a pause puts every knob back and takes back every set still waiting; an edit that mutes,
// retargets or takes away an automation track puts its knob back.
//
// `render(project, seconds)` is `Tone.Offline` over the same `load` and `transport.start()`. A knob
// Tone only sets is not heard in it: Offline runs every transport callback before it renders.
//
// Every tick is Tone's tick at the project's `ppq`, written to Tone as `<n>i`.
//
// Tone's timing is the scene's `world.audiodaw`, set on a context of its own on the plugin's first
// tick, before any song is made: `lookAhead`, the seconds ahead of the audio that Tone's clock hands
// it each note (so the page may be busy that long and no note is late), and `latencyHint`, the
// seconds of the browser's audio buffer. `retime(timing)` puts other values in their place while the
// page runs: the transport stopped, the song thrown away, a new context made on them and the old one
// closed (its closing handed back), and the song last loaded (with its edits since) made again on
// the new one, so its next `play` is heard through it. A browser's buffer is fixed when its context is made, which is why it
// takes a new one. `timing` is what the context holds: its `lookAhead`, the `latencyHint` it was made
// with, and `buffer`, the seconds the browser gave (`baseLatency + outputLatency`), which it rounds
// the hint to.

import type { Plugins } from '#engine/browser.ts'
import * as Tone from 'tone'
import { AudioContext as StandardAudioContext } from 'standardized-audio-context'
import { DRUM_KIT, fromOf, launchOf, lengthOn, passesOn, playedOf, round, slotOf, sounds, spanOf, type Bus, type Chain, type Clip, type Device, type Effect, type Instrument, type KitOptions, type Lane, type Note, type Pad, type Pattern, type Project, type Knob, type Range, type AutomationNote, type AutomationPattern, level, valueAt } from './audiodaw.sim'

// What every Tone instrument and effect has: a setting, an input, an output.
type Settable = Tone.ToneAudioNode & { set(options: object): unknown; get(): object }
// A device's instrument, a synth's voices or a kit's pads, struck and let go by note.
type Sounding = Settable & {
  triggerAttackRelease(note: string, duration: Tone.Unit.Time, time?: Tone.Unit.Time, velocity?: number): unknown
  triggerAttack(note: string, time?: Tone.Unit.Time, velocity?: number): unknown
  triggerRelease(note: string, time?: Tone.Unit.Time): unknown
  releaseAll(time?: Tone.Unit.Time): unknown
  // The Tone objects an instrument's option at `path` lives on, and its path on each: every voice of
  // a synth; the drum of a kit's pad for `pads.<note>.options...`, else the kit itself.
  parts(path: string[]): { objects: Settable[]; rest: string[] }
}
type Wet = Settable & { wet?: Tone.Signal<'normalRange'> }

const ticks = (n: number) => `${n}i`

// Tone takes a transport time only through seconds (`n·60/bpm/ppq` and back), which comes back a
// hair off the whole tick, and `schedule` floors it: a note at 7680 was kept at 7679, a tick early,
// and outside a loop starting at 7680, so never played in it. `at` schedules `callback` and puts the
// event back on the whole tick `tick`. The floored tick is the one below or the same, so the
// event stays in its place in Tone's sorted timeline.
type Events = { _scheduledEvents: Record<string, { event: { time: number } }> }
function at(transport: ReturnType<typeof Tone.getTransport>, callback: (when: number) => void, tick: number): number {
  const id = transport.schedule(callback, ticks(tick))
  ;(transport as unknown as Events)._scheduledEvents[id.toString()]!.event.time = tick
  return id
}

function constructor(is: string): new (options?: object) => Settable {
  const made = (Tone as unknown as Record<string, unknown>)[is]
  if (typeof made !== 'function') throw new Error(`audiodaw: Tone has no ${is}`)
  return made as new (options?: object) => Settable
}

// One note on one Tone synth at `pitch`, held until let go when no `duration` is given. A NoiseSynth
// has no pitch: its triggers are (duration, time, velocity).
function strike(synth: Settable, pitch: string, duration: Tone.Unit.Time | undefined, time: Tone.Unit.Time, velocity?: number) {
  const s = synth as unknown as Tone.NoiseSynth & Tone.MembraneSynth
  if (synth instanceof Tone.NoiseSynth) {
    if (duration === undefined) s.triggerAttack(time, velocity)
    else s.triggerAttackRelease(duration, time, velocity)
  } else if (duration === undefined) s.triggerAttack(pitch, time, velocity)
  else s.triggerAttackRelease(pitch, duration, time, velocity)
}

// One Tone synth let go at `time`.
const letGo = (synth: Settable, time: Tone.Unit.Time) => (synth as unknown as { triggerRelease(time: Tone.Unit.Time): unknown }).triggerRelease(time)

// A synth: `voices` of Tone's `is` (1 when left out), made now into one Gain and kept until it is
// disposed. Each note is played on the next voice in turn, the first again after the last, whatever
// that voice was playing. A note let go lets go of the voice last struck with it.
export function synth(of: Instrument): Sounding {
  const out = new Tone.Gain() as unknown as Sounding
  const gain = out as unknown as Tone.Gain
  // The Gain's own dispose, kept before the synth's takes its place on the same object.
  const free = gain.dispose.bind(gain)
  const voices = Array.from({ length: of.voices ?? 1 }, () => {
    const v = new (constructor(of.is))(of.options)
    v.connect(gain)
    return v
  })
  // The note each voice was last struck with, until it is let go.
  const notes: (string | undefined)[] = voices.map(() => undefined)
  let next = 0
  const take = (note: string) => {
    const v = voices[next]!
    notes[next] = note
    next = (next + 1) % voices.length
    return v
  }

  Object.assign(out, {
    triggerAttackRelease(note: string, duration: Tone.Unit.Time, time: Tone.Unit.Time = Tone.now(), velocity?: number) {
      strike(take(note), note, duration, time, velocity)
      return out
    },
    triggerAttack(note: string, time: Tone.Unit.Time = Tone.now(), velocity?: number) {
      strike(take(note), note, undefined, time, velocity)
      return out
    },
    triggerRelease(note: string, time: Tone.Unit.Time = Tone.now()) {
      for (let k = 1; k <= voices.length; k++) {
        const i = (next - k + voices.length) % voices.length
        if (notes[i] !== note) continue
        letGo(voices[i]!, time)
        notes[i] = undefined
        break
      }
      return out
    },
    releaseAll(time: Tone.Unit.Time = Tone.now()) {
      for (const v of voices) letGo(v, time)
      notes.fill(undefined)
      return out
    },
    set(options: object) {
      for (const v of voices) v.set(options)
      return out
    },
    // The options its voices hold now, Tone's `get()` of the first.
    get() { return voices[0]!.get() },
    parts(path: string[]) { return { objects: voices, rest: path } },
    dispose() {
      for (const v of voices) v.dispose()
      free()
      return out
    },
  })
  return out
}

type Drum = { pad: Pad; synth: Settable }

// A drum machine (`DRUM_KIT`): a Gain every pad's Tone drum sums into, whose triggerAttackRelease,
// triggerAttack and triggerRelease are dispatched by note to the pad of that note, a note no pad has
// sounding nothing. `set({ pads, volume })` sets the pads that changed in place, and makes again a pad
// whose `is` changed, one that is new, and takes away one gone.
export function drumKit(start: KitOptions): Sounding {
  const out = new Tone.Gain() as unknown as Sounding & { volume: Tone.Param<'decibels'> }
  const gain = out as unknown as Tone.Gain
  // The Gain's own dispose, kept before the kit's takes its place on the same object.
  const free = gain.dispose.bind(gain)
  let kit = start
  const drums = new Map<string, Drum>()
  const make = (note: string, pad: Pad) => {
    const synth = new (constructor(pad.is))(pad.options) as Drum['synth']
    synth.connect(gain)
    drums.set(note, { pad, synth })
  }
  const level = (dB = 0) => { gain.gain.value = Tone.dbToGain(dB) }
  for (const [note, pad] of Object.entries(kit.pads)) make(note, pad)
  level(kit.volume)

  // The pad of `note`, every other pad of its choke group let go.
  const pad = (note: string, time: Tone.Unit.Time) => {
    const d = drums.get(note)
    if (!d) return undefined
    if (d.pad.choke !== undefined)
      for (const [other, o] of drums) if (other !== note && o.pad.choke === d.pad.choke) letGo(o.synth, time)
    return d
  }

  Object.assign(out, {
    triggerAttackRelease(note: string, duration: Tone.Unit.Time, time: Tone.Unit.Time = Tone.now(), velocity?: number) {
      const d = pad(note, time)
      if (d) strike(d.synth, d.pad.pitch ?? 'C1', duration, time, velocity)
      return out
    },
    triggerAttack(note: string, time: Tone.Unit.Time = Tone.now(), velocity?: number) {
      const d = pad(note, time)
      if (d) strike(d.synth, d.pad.pitch ?? 'C1', undefined, time, velocity)
      return out
    },
    triggerRelease(note: string, time: Tone.Unit.Time = Tone.now()) {
      const d = drums.get(note)
      if (d) letGo(d.synth, time)
      return out
    },
    // Every pad let go at `time`.
    releaseAll(time: Tone.Unit.Time = Tone.now()) {
      for (const d of drums.values()) letGo(d.synth, time)
      return out
    },
    set(options: Partial<KitOptions>) {
      const now: KitOptions = { ...kit, ...options, pads: options.pads ? { ...kit.pads, ...options.pads } : kit.pads }
      if (options.volume !== undefined) level(options.volume)
      if (options.pads) {
        for (const [note, d] of drums) {
          if (now.pads[note]) continue
          d.synth.dispose()
          drums.delete(note)
        }
        for (const [note, pad] of Object.entries(now.pads)) {
          const d = drums.get(note)
          if (!d) { make(note, pad); continue }
          if (d.pad === pad) continue
          if (d.pad.is !== pad.is) {
            d.synth.dispose()
            make(note, pad)
            continue
          }
          const delta = changed(d.pad.options, pad.options)
          if (delta) d.synth.set(delta)
          d.pad = pad
        }
      }
      kit = now
      return out
    },
    // The kit, each pad's options as its Tone drum holds them now (`get()`).
    get() {
      const pads: Record<string, Pad> = {}
      for (const [note, d] of drums) pads[note] = { ...d.pad, options: d.synth.get() }
      return { ...kit, pads }
    },
    parts(path: string[]) {
      const d = path[0] === 'pads' && path[2] === 'options' ? drums.get(path[1]!) : undefined
      return d ? { objects: [d.synth], rest: path.slice(3) } : { objects: [out], rest: path }
    },
    dispose() {
      for (const d of drums.values()) d.synth.dispose()
      drums.clear()
      free()
      return out
    },
  })
  return out
}

// A device's instrument, as Tone makes it.
export function instrument(of: Instrument): Sounding {
  return of.is === DRUM_KIT ? drumKit(of.options as KitOptions) : synth(of)
}

// The effects Tone makes with their LFOs stopped, to be run by a `start()`: unstarted, a Chorus is a
// still delay, a Tremolo a fixed gain, an AutoPanner a fixed pan, an AutoFilter a fixed filter. A
// Vibrato and a Phaser start their own.
const STOPPED = [Tone.Chorus, Tone.Tremolo, Tone.AutoPanner, Tone.AutoFilter]

// An effect, as Tone makes it, its LFO running; off is `wet = 0`.
export function effect(of: Effect): Wet {
  const made = new (constructor(of.is))(of.options) as Wet
  if (STOPPED.some(kind => made instanceof kind)) (made as unknown as { start(): unknown }).start()
  turn(made, of)
  return made
}

function turn(made: Wet, of: Effect) {
  if (!made.wet) {
    if (!of.on) throw new Error(`audiodaw: Tone's ${of.is} has no wet, so it cannot be turned off`)
    return
  }
  made.wet.value = of.on ? ((of.options as { wet?: number }).wet ?? 1) : 0
}

// The values of `now` that differ from `was`, nested as Tone's options are, or undefined when none
// does: what `set` is handed, so Tone sets only what changed (a WaveShaper's curve, a Distortion's
// or a FrequencyEnvelope's exponent, is made once per change, not on every edit).
function changed(was: object, now: object): object | undefined {
  if (was === now) return undefined
  const out: Record<string, unknown> = {}
  const a = was as Record<string, unknown>
  for (const [k, v] of Object.entries(now)) {
    const w = a[k]
    if (v === w) continue
    if (v && w && typeof v === 'object' && typeof w === 'object' && !Array.isArray(v)) {
      const inner = changed(w, v)
      if (inner) out[k] = inner
    } else out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

// Whether every option of `delta` is one Tone's `made` can be `set`: it has a property of that
// name. One it takes only when it is made (a Phaser's `stages`, a delay's `maxDelay`) it has none.
function settable(made: object, delta: object): boolean {
  return Object.keys(delta).every(k => k in made)
}

// Effects that changed only in their settings and on are set in place; any other change makes the
// chain again, and an effect handed an option it takes only when made is made again. Returns the
// chain to wire, or undefined when it stands as it was.
function effects(made: Wet[], was: Effect[], now: Effect[]): Wet[] | undefined {
  const same = was.length === now.length && was.every((e, i) => e.is === now[i]!.is)
  if (same) {
    let remade = false
    const chain = now.map((e, i) => {
      const delta = changed(was[i]!.options, e.options)
      if (delta && !settable(made[i]!, delta)) {
        made[i]!.dispose()
        remade = true
        return effect(e)
      }
      if (delta) made[i]!.set(delta)
      if (e.on !== was[i]!.on || delta) turn(made[i]!, e)
      return made[i]!
    })
    return remade ? chain : undefined
  }
  for (const m of made) m.dispose()
  return now.map(effect)
}

// `value` at `path`, every object on the way made: what `set` is handed for one option.
const nest = (path: string[], value: unknown): object => path.reduceRight<unknown>((v, k) => ({ [k]: v }), value) as object

// A Tone class's option at `path` as the song gives it, else Tone's own default for it.
function optionAt(is: string, options: object, path: string[]): number | undefined {
  const read = (o: unknown) => path.reduce<unknown>((x, k) => (x as Record<string, unknown> | undefined)?.[k], o)
  const given = read(options)
  if (typeof given === 'number') return given
  const made = (Tone as unknown as Record<string, { getDefaults?: () => object }>)[is]
  const own = read(made?.getDefaults?.())
  return typeof own === 'number' ? own : undefined
}

// A chain's effects in the song.
const effectsOf = (p: Project, c: Chain): Effect[] | undefined => (c === 'master' ? p.master.effects : 'bus' in c ? p.buses[c.bus]?.effects : p.rack[c.device]?.effects)

// The page's knob ranges: the travel of a knob in the song, or undefined for a knob it has none for,
// which is then not automated.
export type Ranges = (knob: Knob, project: Project) => Range | undefined

type Strip = { device: Device; instrument: Sounding; effects: Wet[]; channel: Tone.Channel; sends: Map<string, Tone.Gain<'decibels'>> }
type Return = { bus: Bus; channel: Tone.Channel; effects: Wet[] }
// The last of `list` that `ok` takes, or undefined.
function latest<T>(list: T[], ok: (x: T) => boolean): T | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (ok(list[i]!)) return list[i]
  return undefined
}

// A note of a Part, at its tick in its pattern.
type Ev = { time: string; n: Note }
// A clip on the song: a note clip's looping Part, or an automation clip's scheduled events.
type Playing = { clip: Clip; pattern: Lane; ids: number[]; part?: Tone.Part<Ev> }

// A Part of a pattern's loop: the notes from its `from` to its `length`, looped there, each handed to
// `play` at its time. Tone's Part does the rest: started at a tick with an offset into the loop, it
// plays from where the song is, follows the transport's starts, locates and loop, and swing.
function loopPart(x: Pattern, play: (when: number, n: Note) => void): Tone.Part<Ev> {
  const from = fromOf(x)
  const part = new Tone.Part<Ev>((when, e) => play(when, e.n), x.notes.filter(n => n.time >= from && n.time < x.length).map(n => ({ time: ticks(n.time), n })))
  part.loop = true
  part.loopStart = ticks(from)
  part.loopEnd = ticks(x.length)
  return part
}

// A slot launched on a track of the session: its track (its place in the song, kept as tracks move),
// the kind of its pattern, its scene and pattern, and what plays it, a note pattern's looping Part
// (`loopPart`) or an automation pattern's (`automationPart`). `anchor` is the song's tick its loop's
// first pass began on, kept through every jump of the transport, so its place in its loop at a tick
// is `round(tick - anchor, played)`; `begun` and `offset` are its Part's last start, the tick and the
// offset into the pattern, to make it again with; `started` whether that start has been handed to
// Tone, `gone` whether it has been let go; `stop` the tick it stops at once another slot or a stop is
// launched. `heard` and `until` are the audio times it is heard from and to, for the page to read.
type Player = {
  track: number
  kind: 'notes' | 'automation'
  scene: number
  name: string
  lane: Lane
  part: Tone.Part<Ev> | Tone.Part<Cue>
  anchor: number
  begun?: number
  offset: number
  started: boolean
  gone: boolean
  // Launched while the transport stood: started before the transport is (`begin`), heard from its start.
  ready: boolean
  // Each of its Part's events, by its tick in the pattern, and what it does at an audio time: what
  // `catchUp` plays of a pass Tone began past its start.
  events: { at: number; fire: (when: number) => void }[]
  stop?: number
  heard?: number
  until?: number
}
// An automation pattern's events in a Part: a glide at a note's start and the knob let go at its end,
// for a knob that glides; for one Tone only sets, a set of the value `at` ticks into the note, and the
// knob let go at its end, each sent `early` ticks ahead (`automationPart`).
// `on` is its tick in the Part, `time` the same as Tone takes it; `at` the ticks into the note it is for,
// and `tick` the pattern's tick it is for.
type Cue = { time: string; on: number; kind: 'glide' | 'end' | 'step' | 'release'; n: AutomationNote; at: number; tick: number }
// A track of the session: the slots launched on it, the one playing and the one coming in at its
// launch; whether the session holds it (Ableton's: its arrangement is not heard until BACK TO
// ARRANGEMENT); and the launch waiting, the scene coming in (none for a stop) at a tick.
type Deck = { players: Player[]; held: boolean; next?: { scene?: number; at: number } }
// What the page is shown of a track of the session (`session()`).
export type Launched = {
  // The slot heard now, by its scene, and how far through its loop the song is, 0 to 1.
  scene?: number
  through?: number
  // The launch waiting: the scene coming in, none for a stop, and the tick it comes in at.
  next?: { scene?: number; at: number }
  // Whether the session holds the track, so its arrangement is not heard.
  held: boolean
}

let songs = 0

// The Tone objects of one project in the context that is Tone's now, and the edits on them; `ranges`
// is how far each automated knob travels.
export function song(start: Project, ranges?: Ranges) {
  const transport = Tone.getTransport()
  const destination = Tone.getDestination()
  let project = start
  let master: Wet[] = []
  const strips: Strip[] = []
  const returns = new Map<string, Return>()
  const parts: Playing[] = []
  const meters = new Map<string, Tone.Meter>()
  // Tone keeps every send's bus in one map of names for all its contexts, so a bus is named for its
  // song too, and a render's buses never meet the page's.
  const id = ++songs
  const named = (bus: string) => `${id}:${bus}`

  const time = (p: Project) => {
    transport.PPQ = p.ppq
    transport.bpm.value = p.bpm
    transport.timeSignature = p.timeSignature
    transport.swing = p.swing
    transport.swingSubdivision = p.swingSubdivision as Tone.Unit.Subdivision
    if (p.loop) {
      transport.setLoopPoints(ticks(p.loop.start), ticks(p.loop.end))
      // Tone keeps the loop points as `toTicks` of what it is handed, which goes through seconds and
      // comes back a hair off the whole tick (7679.9999… for "7680i"), while every scheduled note's
      // tick is floored to a whole one. On wrapping, Tone fires the notes whose tick equals its loop
      // start exactly, so with the hair off, no note on the loop's first tick was ever played. The
      // points are put back as the whole ticks the song holds.
      const exact = transport as unknown as { _loopStart: number; _loopEnd: number }
      exact._loopStart = p.loop.start
      exact._loopEnd = p.loop.end
    }
  }

  // The transport stops itself at the song's end (`spanOf`), each time it passes it.
  let ending: number | undefined
  const bound = (p: Project) => {
    if (ending !== undefined) transport.clear(ending)
    const { end } = spanOf(p)
    // While a slot of the session plays or waits to, the song plays on past its end, as Ableton's does.
    ending = end > 0 ? at(transport, (when) => { if (!launched()) transport.stop(when) }, end) : undefined
  }

  const wireMaster = () => destination.chain(...master)

  const wireStrip = (s: Strip) => {
    s.instrument.disconnect()
    for (const e of s.effects) e.disconnect()
    s.instrument.chain(...s.effects, s.channel)
  }

  const send = (s: Strip, bus: string, dB: number) => {
    const gain = s.channel.send(named(bus), dB)
    s.sends.set(bus, gain)
  }

  const strip = (device: Device): Strip => {
    const channel = new Tone.Channel(device.channel).toDestination()
    const s: Strip = { device, instrument: instrument(device.instrument), effects: device.effects.map(effect), channel, sends: new Map() }
    wireStrip(s)
    for (const [bus, dB] of Object.entries(device.sends)) send(s, bus, dB)
    return s
  }

  const unstrip = (s: Strip) => {
    for (const g of s.sends.values()) g.dispose()
    s.instrument.dispose()
    for (const e of s.effects) e.dispose()
    s.channel.dispose()
  }

  // A device's meters go with its strip; the master's and the buses' stay.
  const unmeter = () => {
    for (const [key, m] of meters) {
      if (key === 'master' || returns.has(key)) continue
      m.dispose()
      meters.delete(key)
    }
  }

  // The session's tracks, by the track's place in the song.
  const decks: Deck[] = []
  const deck = (t: number): Deck => (decks[t] ??= { players: [], held: false })

  // The strip a note track's notes go to now, or undefined when they are held back or go nowhere. Its
  // arrangement's notes (`arranged`) are held back too while the session holds the track.
  const heard = (t: number, arranged = true): Strip | undefined => {
    const x = project.tracks[t]
    if (x?.kind !== 'notes' || x.target === undefined || !sounds(project, t)) return undefined
    if (arranged && decks[t]?.held) return undefined
    return strips[x.target]
  }

  // Every instrument's every voice let go at `time`.
  const silence = (time: number) => {
    for (const s of strips) s.instrument.releaseAll(time)
  }
  // The transport stopped or paused (a press, or the song's end): every instrument is let go at that
  // time, and again once Tone's look-ahead has passed, for a note the transport had already handed
  // an instrument to begin before the stop, which begins after this first let go. A stop at or before
  // the song was made is not its own: Tone sends the stop a load makes before it makes the song on a
  // later tick of its clock, and that one would let go of the keys first played on the new song.
  const made = transport.context.now()
  let later: number | undefined
  const stopped = (time: number) => {
    if (time <= made) return
    silence(time)
    unautomate(time)
    if (later !== undefined) transport.context.clearTimeout(later)
    later = transport.context.setTimeout(() => {
      later = undefined
      silence(Math.max(time, transport.context.now()))
    }, transport.context.lookAhead)
  }
  transport.on('stop', stopped)
  transport.on('pause', stopped)

  const ret = (name: string, bus: Bus): Return => {
    const channel = new Tone.Channel({ volume: bus.volume, pan: bus.pan })
    channel.receive(named(name))
    const r: Return = { bus, channel, effects: bus.effects.map(effect) }
    channel.chain(...r.effects, destination)
    return r
  }

  // A note clip is a Tone.Part of its pattern's loop (`loopPart`), started at the clip's start with
  // its offset into the loop and stopped at its end, so its pattern repeats to fill it. Tone plays a
  // Part from where the song is, so a clip made while playing sounds from there, and again each time
  // the song's loop or a locate brings it back over it. Its track is read as each note falls: a clip
  // moved to another track plays through that one, and none plays while the session holds its track.
  // An automation clip is its notes' events on the transport (`automate`).
  const part = (clip: Clip): Playing => {
    const track = project.tracks[clip.track]!
    const pattern = track.patterns[clip.pattern]!
    const playing: Playing = { clip, pattern, ids: [] }
    if (track.kind !== 'notes') {
      automate(playing, pattern as AutomationPattern)
      return playing
    }
    const x = pattern as Pattern
    const made = loopPart(x, (when, n) => {
      const s = heard(playing.clip.track)
      if (s) s.instrument.triggerAttackRelease(n.note, ticks(n.duration), when, n.velocity)
    })
    const [pass] = passesOn(x, clip)
    made.start(ticks(clip.start), ticks(fromOf(x) + clip.start - pass!.base))
    made.stop(ticks(clip.start + lengthOn(x, clip)))
    playing.part = made
    return playing
  }
  const unpart = (p: Playing) => {
    for (const id of p.ids) transport.clear(id)
    p.ids = []
    p.part?.dispose()
    p.part = undefined
  }

  // Automation ------------------------------------------------------------------------------------
  //
  // Where a knob is on the Tone objects: the Params it glides on, when Tone holds it as one on each
  // object (a Param or a Signal), else how it is set; and the value it goes back to, its own.
  type Reached = { params?: Tone.Param<Tone.Unit.UnitName>[]; set(v: number): void; own: number }
  const reach = (k: Knob): Reached | undefined => {
    const param = (p: Tone.Param<Tone.Unit.UnitName> | undefined, own: number): Reached | undefined =>
      p ? { params: [p], set: (v) => { p.value = v }, own } : undefined
    const on = (objects: Settable[], rest: string[], own: number): Reached => {
      const found = objects.map(o => rest.reduce<unknown>((x, key) => (x as Record<string, unknown> | undefined)?.[key], o))
      const glides = found.length > 0 && found.every(x => x instanceof Tone.Param || x instanceof Tone.Signal)
      return {
        ...(glides ? { params: found as Tone.Param<Tone.Unit.UnitName>[] } : {}),
        set: (v) => { for (const o of objects) o.set(nest(rest, v)) },
        own,
      }
    }
    switch (k.part) {
      case 'instrument': {
        const s = strips[k.device]
        const d = project.rack[k.device]
        if (!s || !d) return undefined
        const { objects, rest } = s.instrument.parts(k.path)
        const kit = d.instrument.is === DRUM_KIT ? (d.instrument.options as KitOptions) : undefined
        const pad = kit && k.path[0] === 'pads' ? kit.pads[k.path[1]!] : undefined
        // A kit's own level is its `volume`, 0 dB when the song gives none.
        const own = pad ? optionAt(pad.is, pad.options, rest) : kit ? (k.path.join('.') === 'volume' ? (kit.volume ?? 0) : undefined) : optionAt(d.instrument.is, d.instrument.options, k.path)
        return own === undefined ? undefined : on(objects, rest, own)
      }
      case 'effect': {
        const made = chainMade(k.chain)?.[k.effect]
        const e = effectsOf(project, k.chain)?.[k.effect]
        if (!made || !e) return undefined
        // An effect turned off is its wet at 0, which automating its wet would undo.
        if (!e.on && k.path[0] === 'wet') return undefined
        const own = optionAt(e.is, e.options, k.path)
        return own === undefined ? undefined : on([made], k.path, own)
      }
      case 'volume': {
        if (k.strip === 'master') return param(destination.volume, project.master.volume)
        if ('bus' in k.strip) return param(returns.get(k.strip.bus)?.channel.volume, project.buses[k.strip.bus]?.volume ?? 0)
        return param(strips[k.strip.device]?.channel.volume, project.rack[k.strip.device]?.channel.volume ?? 0)
      }
      case 'pan': {
        if ('bus' in k.strip) return param(returns.get(k.strip.bus)?.channel.pan, project.buses[k.strip.bus]?.pan ?? 0)
        return param(strips[k.strip.device]?.channel.pan, project.rack[k.strip.device]?.channel.pan ?? 0)
      }
      case 'send': {
        const dB = project.rack[k.device]?.sends[k.bus]
        return dB === undefined ? undefined : param(strips[k.device]?.sends.get(k.bus)?.gain as Tone.Param<Tone.Unit.UnitName> | undefined, dB)
      }
    }
  }
  const chainMade = (c: Chain): Wet[] | undefined => (c === 'master' ? master : 'bus' in c ? returns.get(c.bus)?.effects : strips[c.device]?.effects)

  // The knob an automation track sends its values to now, reached, with its range: undefined while
  // the track is muted, targets none, or its knob has no range the page gave. Its arrangement's values
  // (`arranged`) reach none while the session holds the track.
  const aimed = (t: number, arranged = true): { knob: Knob; r: Reached; range: Range } | undefined => {
    const x = project.tracks[t]
    if (x?.kind !== 'automation' || !x.target || !sounds(project, t)) return undefined
    if (arranged && decks[t]?.held) return undefined
    const range = ranges?.(x.target, project)
    const r = range && reach(x.target)
    return r && range ? { knob: x.target, r, range } : undefined
  }

  // The seconds of a tick now, and the look-ahead in ticks: a set is sent that long before its tick.
  const second = () => 60 / (transport.bpm.value * project.ppq)
  const ahead = () => Math.ceil(transport.context.lookAhead / second())
  // The sets of knobs Tone only sets, sent and waiting, so a stop can take them back.
  const waiting = new Set<ReturnType<typeof setTimeout>>()
  // A value set at audio time `when`: Tone writes a setter's Param at its own now(), the context's
  // time plus the look-ahead, so the set is sent the look-ahead before `when`.
  const setAt = (r: Reached, v: number, when: number) => {
    const id = setTimeout(() => { waiting.delete(id); r.set(v) }, Math.max(0, (when - transport.context.lookAhead - transport.context.currentTime) * 1000))
    waiting.add(id)
  }

  // A knob that glides held from tick `at0` of automation note `n` to its end, the note heard from
  // audio time `time`: each point reached by its shape on the audio clock. A line is even along the
  // knob's own travel: on a knob of the log curve, and on one in decibels, which Tone keeps as a gain,
  // the same turn is the same ratio, so its ramp is of the same ratio each second; on any other, a
  // straight ramp. An exp line is drawn as short ramps between its values along the bend.
  // Where each Param's line last handed to it ends, in audio time (`glide`), for `restore`.
  const ends = new WeakMap<Tone.Param<Tone.Unit.UnitName>, number>()
  const glide = (a: { r: Reached; range: Range }, n: AutomationNote, at0: number, until: number, time: number) => {
    const s = second()
    const heardAt = (tick: number) => time + (tick - at0) * s
    for (const p of a.r.params!) {
      ends.set(p, heardAt(until))
      const log = a.range.curve === 'log' || (p.units === 'decibels' && p.convert)
      p.cancelScheduledValues(time)
      p.setValueAtTime(level(a.range, valueAt(n, at0)), time)
      let last = at0
      for (const q of n.points) {
        if (q.at <= at0) continue
        const end = Math.min(q.at, until)
        if (q.shape === 'step') { if (q.at <= until) p.setValueAtTime(level(a.range, q.value), heardAt(q.at)) }
        else if (q.shape === 'exp') {
          for (let k = 1; k <= 16; k++) {
            const tick = last + ((end - last) * k) / 16
            if (log) p.exponentialRampToValueAtTime(level(a.range, valueAt(n, tick)), heardAt(tick))
            else p.linearRampToValueAtTime(level(a.range, valueAt(n, tick)), heardAt(tick))
          }
        } else if (log) p.exponentialRampToValueAtTime(level(a.range, valueAt(n, end)), heardAt(end))
        else p.linearRampToValueAtTime(level(a.range, valueAt(n, end)), heardAt(end))
        last = end
        if (q.at >= until) break
      }
    }
  }
  // A knob back to its own value at audio time `time`. A stop, a locate or an edit takes back what was
  // scheduled after it (`cut`); a note's own end does not, since its line's last ramp ends at that
  // very time and would be taken back with it. A note's end is set no earlier than its line's last
  // ramp ends: the line's end is worked out from ticks and the note's end is the time Tone hands its
  // event, the same tick a hair apart, and a set a hair before the ramp's end is ramped from, back down
  // to the line's last value, which then holds (`experiments/session/dip.ts` heard it at a look-ahead
  // of 0.1 s).
  const restore = (r: Reached, time: number, cut = true) => {
    if (r.params) for (const p of r.params) {
      const end = ends.get(p)
      ends.delete(p)
      if (cut) p.cancelScheduledValues(time)
      p.setValueAtTime(r.own, cut || end === undefined ? time : Math.max(time, end))
    } else setAt(r, r.own, time)
  }

  // An automation note sounding on the song: the note, the song's tick it began on (`begins`, before
  // `start` when the clip's offset or its pass cut its front), and the ticks it is heard, `start` to
  // `end`.
  type Span = { n: AutomationNote; begins: number; start: number; end: number }

  // Where each automation note of a clip sounds in the song, pass by pass of its loop: from its
  // pattern's `from` to its `length`, each note cut at its pass's end and the clip's.
  const spans = (clip: Clip, x: AutomationPattern): Span[] => {
    const from = fromOf(x)
    return passesOn(x, clip).flatMap(pass => x.notes.flatMap(n => {
      if (n.time < from || n.time >= x.length) return []
      const begins = pass.base + n.time - from
      const start = Math.max(begins, pass.start)
      const end = Math.min(pass.base + Math.min(n.time + n.duration, x.length) - from, pass.end)
      return end > start ? [{ n, begins, start, end }] : []
    }))
  }
  // Whether automation track `t`'s arrangement has a note sounding at `tick` other than one ending
  // there.
  const holds = (t: number, tick: number) => parts.some(p => p.clip.track === t && project.tracks[t]?.kind === 'automation' &&
    spans(p.clip, p.pattern as AutomationPattern).some(s => s.start <= tick && tick < s.end))

  // An automation clip's notes, each a `transport.schedule` at its tick on each pass: at its first
  // tick a knob that glides is handed the note's line from there, and at its end goes back to its own
  // value unless another note of the track takes it there. A knob Tone only sets is set on every 16th
  // of the song the note covers, and at its end, each event a look-ahead of ticks early so its set is
  // sent in time. Each reads its track as it falls: a track muted, retargeted or held by the session
  // is heard so from its next event.
  const automate = (playing: Playing, x: AutomationPattern) => {
    const sixteenth = project.ppq / 4
    const early = ahead()
    for (const { n, begins, start, end } of spans(playing.clip, x)) {
      playing.ids.push(at(transport, (when) => {
        const a = aimed(playing.clip.track)
        if (a?.r.params) glide(a, n, start - begins, end - begins, when)
      }, start))
      playing.ids.push(at(transport, (when) => {
        const a = aimed(playing.clip.track)
        if (a?.r.params && !holds(playing.clip.track, end)) restore(a.r, when, false)
      }, end))
      const steps = [start]
      for (let k = Math.ceil((start + 1) / sixteenth) * sixteenth; k < end; k += sixteenth) steps.push(k)
      for (const k of steps) playing.ids.push(at(transport, (when) => {
        const a = aimed(playing.clip.track)
        if (a && !a.r.params) setAt(a.r, level(a.range, valueAt(n, k - begins)), when + early * second())
      }, Math.max(0, k - early)))
      playing.ids.push(at(transport, (when) => {
        const a = aimed(playing.clip.track)
        if (a && !a.r.params && !holds(playing.clip.track, end)) setAt(a.r, a.r.own, when + early * second())
      }, Math.max(0, end - early)))
    }
  }

  // The automation note sounding on track `t` at the song's `tick`: the session's, from the slot
  // playing there, while the session holds the track; the arrangement's otherwise.
  const soundingAt = (t: number, tick: number): Span | undefined => {
    const d = decks[t]
    if (!d?.held) return parts.filter(p => p.clip.track === t).flatMap(p => spans(p.clip, p.pattern as AutomationPattern)).find(s => s.start <= tick && tick < s.end)
    const pl = playerAt(d, tick)
    if (!pl) return undefined
    const x = pl.lane as AutomationPattern
    const from = fromOf(x)
    const at = from + round(tick - pl.anchor, playedOf(x))
    const n = x.notes.find(n => n.time >= from && n.time < x.length && n.time <= at && at < Math.min(n.time + n.duration, x.length))
    if (!n) return undefined
    const begins = tick - (at - n.time)
    return { n, begins, start: tick, end: begins + Math.min(n.time + n.duration, x.length) - n.time }
  }

  // Automation track `t`'s knob where the song is at `tick`, heard from audio time `time`: a note
  // sounding there is taken up from that tick, and a knob with none goes back to its own value. A knob
  // Tone only sets is set there and on each 16th of the note the look-ahead after it, whose own events
  // were handed to Tone before the song got there.
  const resumeTrack = (t: number, tick: number, time: number) => {
    const a = aimed(t, false)
    if (!a) return
    const sounding = soundingAt(t, tick)
    if (!sounding) { restore(a.r, time); return }
    const { n, begins, end } = sounding
    if (a.r.params) { glide(a, n, tick - begins, end - begins, time); return }
    setAt(a.r, level(a.range, valueAt(n, tick - begins)), time)
    const sixteenth = project.ppq / 4
    const s = second()
    for (let k = Math.ceil((tick + 1) / sixteenth) * sixteenth; k < Math.min(end, tick + ahead()); k += sixteenth) {
      setAt(a.r, level(a.range, valueAt(n, k - begins)), time + (k - tick) * s)
    }
  }

  // Every automated knob where the song is at `tick`, heard from audio time `time`. A play from the
  // middle of a note, a locate, and the loop's jump back each land here.
  const resume = (tick: number, time: number) => {
    project.tracks.forEach((x, t) => {
      if (x.kind === 'automation') resumeTrack(t, tick, time)
    })
  }
  // Every automated knob back to its own value, every set still waiting taken back: the transport
  // stopped or paused.
  const unautomate = (time: number) => {
    for (const id of waiting) clearTimeout(id)
    waiting.clear()
    for (const x of project.tracks) {
      if (x.kind !== 'automation' || !x.target) continue
      const r = reach(x.target)
      if (r) restore(r, time)
    }
  }
  // The session --------------------------------------------------------------------------------------
  //
  // A slot launched is a Tone.Part of its pattern looped on its track: a note pattern's `loopPart`, an
  // automation pattern's `automationPart`. Tone starts and stops it on the launch's tick
  // (`part.start(tick, offset)`, `part.stop(tick)`). The tick is the next multiple of the song's
  // `launch` from the first tick Tone has not handed over (`boundary`), so a press within the
  // look-ahead of a bar waits for the bar after. (Tone's own "@1m" is no use from a press: called
  // outside a transport callback it lands off the bar, which `experiments/session/launch.ts` measured.)
  //
  // Tone holds a Part's start and stop at ticks of the song, and the song's loop wraps those ticks: a
  // Part started inside the loop reads as not yet started on the ticks before its start, after the
  // wrap. So on every wrap (the transport's 'loop' event, which Tone emits before it hands over the
  // loop's first tick) and every locate, each playing slot's Part is started again at the tick the
  // song lands on, its offset the place in its loop it had reached, its `anchor` moved with it; and a
  // launch whose tick is past the loop's end is the loop's start, done in that same event.
  //
  // What else changes at a launch's tick is done by a transport event a tick before it (`onTick`),
  // handed that tick's time plus one tick: the session takes hold of the track there (its arrangement
  // is held back from the launch's tick on, Tone handing a tick's events in the order they were
  // scheduled), the knob of an automation track is taken up where the slot coming in has it, and the
  // slots going out are let go.

  // The first tick a launch made now can wait for: two past the ticks of the context's now(), so the
  // event a tick before it is still to be handed over.
  const soonest = () => Math.floor(transport.getTicksAtTime(transport.context.now())) + 2
  // A launch's tick: the next multiple of the song's `launch` from the soonest; while the transport
  // cycles, one at or past the loop's end is the loop's start, which the transport wraps to.
  type Boundary = { at: number; wrap: boolean }
  const boundary = (): Boundary => {
    const n = soonest()
    const q = launchOf(project)
    const at = q ? Math.ceil(n / q) * q : n
    const loop = transport.loop ? project.loop : undefined
    return loop && at >= loop.end ? { at: loop.start, wrap: true } : { at, wrap: false }
  }
  // What waits for the next wrap, handed its time.
  const wraps: { fn: (time: number) => void }[] = []
  // What a deck has waiting at a launch's tick: its event or its wrap, the slots going and the one
  // coming, and the launch itself, made again after a locate.
  type Pending = { id?: number; wrap?: { fn: (time: number) => void }; going: Player[]; coming?: Player; again: (t: number) => void }
  const pending = new Map<Deck, Pending>()

  // `fn` at a launch's tick, handed its time: from an event a tick before it, or from the wrap.
  const onTick = (b: Boundary, fn: (time: number) => void): Pick<Pending, 'id' | 'wrap'> => {
    if (b.wrap) {
      const w = { fn }
      wraps.push(w)
      return { wrap: w }
    }
    const id = at(transport, (when) => fn(when + second()), b.at - 1)
    return { id }
  }

  // An automation pattern's Part for a slot: each note's end first and its glide (a knob that glides),
  // its sets on each 16th of the pattern it covers and its let go (a knob Tone only sets), each of
  // those `early` ticks ahead and sent that far, round the loop. The slot's first pass has no sets of
  // its first `early` ticks: `resumeTrack` makes them when it comes in.
  const automationPart = (pl: Player): { part: Tone.Part<Cue>; events: Player['events'] } => {
    const x = pl.lane as AutomationPattern
    const from = fromOf(x), played = playedOf(x)
    const early = ahead()
    const sixteenth = project.ppq / 4
    // A cue put on the Part at the pattern's tick `tick`, round the loop.
    const cue = (tick: number, c: Omit<Cue, 'time' | 'on'>): Cue => {
      const on = from + round(tick - from, played)
      return { ...c, time: ticks(on), on }
    }
    const notes = x.notes.filter(n => n.time >= from && n.time < x.length)
    const cues: Cue[] = []
    for (const n of notes) {
      const end = Math.min(n.time + n.duration, x.length)
      cues.push(cue(end, { kind: 'end', n, at: end - n.time, tick: end }))
    }
    for (const n of notes) {
      const end = Math.min(n.time + n.duration, x.length)
      cues.push(cue(n.time, { kind: 'glide', n, at: end - n.time, tick: n.time }))
      for (let k = n.time; k < end; k = Math.floor(k / sixteenth) * sixteenth + sixteenth) cues.push(cue(k - early, { kind: 'step', n, at: k - n.time, tick: k }))
      cues.push(cue(end - early, { kind: 'release', n, at: end - n.time, tick: end }))
    }
    // Whether another note of the pattern sounds at its tick `tick`, round the loop.
    const holding = (tick: number) => {
      const p = from + round(tick - from, played)
      return notes.some(n => n.time <= p && p < Math.min(n.time + n.duration, x.length))
    }
    const fire = (when: number, c: Cue) => {
      const a = aimed(pl.track, false)
      if (!a) return
      if (c.kind === 'glide') { if (a.r.params) glide(a, c.n, 0, c.at, when) }
      else if (c.kind === 'end') { if (a.r.params && !holding(c.tick)) restore(a.r, when, false) }
      else if (c.kind === 'step') { if (!a.r.params) setAt(a.r, level(a.range, valueAt(c.n, c.at)), when + early * second()) }
      else if (!a.r.params && !holding(c.tick)) setAt(a.r, a.r.own, when + early * second())
    }
    const part = new Tone.Part<Cue>(fire, cues)
    part.loop = true
    part.loopStart = ticks(from)
    part.loopEnd = ticks(x.length)
    return { part, events: cues.map(c => ({ at: c.on, fire: (when: number) => fire(when, c) })) }
  }

  // A slot's Part, of its pattern's kind, and its events; a note slot plays its track's device, the
  // session's own.
  const playerPart = (pl: Player): { part: Player['part']; events: Player['events'] } => {
    if (pl.kind === 'automation') return automationPart(pl)
    const x = pl.lane as Pattern
    const play = (when: number, n: Note) => {
      const s = heard(pl.track, false)
      if (s) s.instrument.triggerAttackRelease(n.note, ticks(n.duration), when, n.velocity)
    }
    const from = fromOf(x)
    return { part: loopPart(x, play), events: x.notes.filter(n => n.time >= from && n.time < x.length).map(n => ({ at: n.time, fire: (when: number) => play(when, n) })) }
  }

  // A slot's Part just started at the song's `tick`, heard at audio time `time`, from a transport
  // event handed over past that tick (a wrap): Tone places each of the Part's notes from the ticks at
  // the context's now(), so a note between `tick` and those ticks is put off to the next pass. Each
  // such note is played here at its own time.
  const catchUp = (pl: Player, tick: number, time: number) => {
    const n = transport.getTicksAtTime(transport.context.now())
    const played = playedOf(pl.lane)
    const s = second()
    for (const e of pl.events) {
      const o = tick + round(e.at - pl.offset, played)
      if (o < n) e.fire(time + (o - tick) * s)
    }
  }

  // The slot of a deck playing at the song's `tick`: the last one started and not stopped by then.
  const playerAt = (d: Deck, tick: number) => latest(d.players, p => p.started && !p.gone && (p.stop === undefined || p.stop > tick))

  // A slot let go of at once: its Part thrown away.
  const drop = (pl: Player) => {
    pl.part.dispose()
    pl.gone = true
  }

  // What a deck had waiting taken back: its event or its wrap cleared, the slot coming thrown away.
  const unpend = (d: Deck): Pending | undefined => {
    const w = pending.get(d)
    if (!w) return undefined
    pending.delete(d)
    if (w.id !== undefined) transport.clear(w.id)
    if (w.wrap) wraps.splice(wraps.indexOf(w.wrap), 1)
    if (w.coming) {
      drop(w.coming)
      d.players = d.players.filter(p => p !== w.coming)
    }
    return w
  }

  // A deck changed at a launch's tick: the slots playing there stopped, `coming` started (none for a
  // stop), the session's hold on the track `hold` from then on. A launch waiting on the deck is taken
  // back first, its slots going going still.
  const change = (t: number, b: Boundary, coming: Player | undefined, hold: boolean, again: (t: number) => void) => {
    const d = deck(t)
    const was = unpend(d)
    const going = [...(was?.going ?? []), ...d.players.filter(p => !p.gone && p.stop === undefined && p !== coming)]
    for (const o of going) o.stop = b.at
    // At the wrap (`time`), the notes of the slot coming in that Tone put off are played (`catchUp`).
    const go = (tick: number, time?: number) => {
      for (const o of going) o.part.stop(ticks(tick))
      if (coming) {
        coming.anchor = tick
        coming.begun = tick
        coming.started = true
        coming.part.start(ticks(tick), ticks(coming.offset))
        if (time !== undefined) catchUp(coming, tick, time)
      }
    }
    if (!b.wrap) go(b.at)
    if (coming) d.players.push(coming)
    d.next = { ...(coming ? { scene: coming.scene } : {}), at: b.at }
    const next = d.next
    const w: Pending = {
      ...onTick(b, (time) => {
        pending.delete(d)
        if (b.wrap) go(b.at, time)
        d.held = hold
        if (d.next === next) d.next = undefined
        for (const o of going) {
          o.until = time
          drop(o)
        }
        if (coming) coming.heard = time
        // The deck's track where it is now: an edit may have moved it since the launch. Its knob is
        // taken up where the slot coming in has it, or let go with none.
        const here = decks.indexOf(d)
        if (project.tracks[here]?.kind === 'automation') resumeTrack(here, b.at, time)
      }),
      going,
      ...(coming ? { coming } : {}),
      again,
    }
    pending.set(d, w)
  }

  // A slot of track `t` made for scene `s`, not yet started.
  const slot = (t: number, s: number): Player | undefined => {
    const x = project.tracks[t]
    if (!x) throw new Error(`audiodaw: no track ${t}`)
    const name = slotOf(project, t, s)
    if (name === undefined) return undefined
    const lane = x.patterns[name]!
    const pl: Player = { track: t, kind: x.kind, scene: s, name, lane, part: undefined as unknown as Tone.Part<Ev>, events: [], anchor: 0, offset: fromOf(lane), started: false, gone: false, ready: false }
    Object.assign(pl, playerPart(pl))
    return pl
  }

  // While the transport is not running, a launch waits for play: the deck's slots let go, the one
  // launched kept to start where play starts (`begin`), the session holding the track at once.
  const ready = (t: number, coming: Player | undefined, hold: boolean) => {
    const d = deck(t)
    unpend(d)
    for (const o of d.players) drop(o)
    if (coming) coming.ready = true
    d.players = coming ? [coming] : []
    d.held = hold
    d.next = coming ? { scene: coming.scene, at: transport.ticks } : undefined
  }

  // Track `t`'s slot of scene `s` launched: its pattern looped from the launch's tick, the slot playing
  // stopped there; an empty slot stops the track.
  const launch = (t: number, s: number, b = boundary()) => {
    const coming = slot(t, s)
    if (transport.state !== 'started') return ready(t, coming, true)
    change(t, b, coming, true, (here) => launch(here, s))
  }
  // Track `t`'s slot stopped at the launch's tick; the session keeps hold of the track.
  const halt = (t: number, b = boundary()) => {
    if (transport.state !== 'started') return ready(t, undefined, true)
    change(t, b, undefined, true, (here) => halt(here))
  }
  // Every track's slot of scene `s` launched at one tick: an empty one stops its track.
  const launchScene = (s: number) => {
    const b = boundary()
    project.tracks.forEach((_, t) => {
      if (slotOf(project, t, s) !== undefined) launch(t, s, b)
      else if (decks[t]?.players.some(p => !p.gone) || pending.has(deck(t))) halt(t, b)
    })
  }
  // Every track's slot stopped at one tick.
  const haltAll = () => {
    const b = boundary()
    decks.forEach((d, t) => { if (d && (d.players.some(p => !p.gone) || pending.has(d))) halt(t, b) })
  }
  // Every track back to its arrangement, at the soonest tick: the slots stopped and the session's hold
  // let go.
  const arrange = () => {
    const b: Boundary = { at: soonest(), wrap: false }
    decks.forEach((d, t) => {
      if (!d || (!d.held && !d.players.some(p => !p.gone) && !pending.has(d))) return
      if (transport.state !== 'started') return ready(t, undefined, false)
      change(t, b, undefined, false, (here) => change(here, { at: soonest(), wrap: false }, undefined, false, () => {}))
    })
  }

  // Every slot playing started again at the song's `tick`, its place in its loop kept: its anchor moved
  // by `by` ticks, the jump the song made to get there. At a wrap (`time`), the notes Tone put off are
  // played (`catchUp`); at a locate Tone's own start, which follows, places them.
  const reanchor = (tick: number, by: number, time?: number) => {
    for (const d of decks) {
      if (!d) continue
      for (const pl of d.players) {
        if (!pl.started || pl.gone || pl.stop !== undefined) continue
        pl.anchor += by
        pl.begun = tick
        pl.offset = fromOf(pl.lane) + round(tick - pl.anchor, playedOf(pl.lane))
        pl.part.stop(ticks(tick))
        pl.part.start(ticks(tick), ticks(pl.offset))
        if (time !== undefined) catchUp(pl, tick, time)
      }
    }
  }

  // Play about to start at the song's `tick` from a transport standing: each slot launched while it
  // stood started there, before the transport, so Tone's own start places its notes.
  const begin = (tick: number) => {
    for (const d of decks) {
      if (!d) continue
      for (const pl of d.players) {
        if (!pl.ready || pl.started || pl.gone) continue
        pl.anchor = tick
        pl.begun = tick
        pl.started = true
        pl.part.start(ticks(tick), ticks(pl.offset))
      }
    }
  }

  // The transport started (a play, a locate, the start after a pause): the slots launched while it
  // stood are heard from here; every knob is taken up where the song is.
  const started = (time: number) => {
    const tick = Math.round(transport.getTicksAtTime(time))
    for (const d of decks) {
      if (!d) continue
      for (const pl of d.players) {
        if (!pl.ready || !pl.started) continue
        pl.ready = false
        pl.heard = time
        d.next = undefined
      }
    }
    resume(tick, time)
  }
  // The song's loop wrapped: every slot playing anchored again on the loop's start, then each launch
  // waiting for the wrap done, then every knob taken up there.
  const looped = (time: number) => {
    const loop = project.loop
    if (loop) {
      reanchor(loop.start, loop.start - loop.end, time)
      for (const w of wraps.splice(0)) w.fn(time)
    }
    resume(loop?.start ?? 0, time)
  }

  // The song located from tick `was` to `to` while it plays: every slot playing started again there,
  // its place in its loop kept, and each launch waiting made again from there.
  // Called before the transport jumps, so the knobs it takes up at its start are the slots' as moved;
  // hands back the launches to make again, called once it has landed.
  const jump = (was: number, to: number): (() => void) => {
    const again: (() => void)[] = []
    decks.forEach((d, t) => {
      if (!d) return
      const w = unpend(d)
      if (!w) return
      // The slots it was letting go of play on, from where the song lands.
      for (const o of w.going) o.stop = undefined
      again.push(() => w.again(t))
    })
    reanchor(to, to - was)
    return () => { for (const f of again) f() }
  }

  // A slot's pattern edited while it is launched: its Part made again of the pattern as it is now, at
  // its place in its loop, from the soonest tick it can start at (or its launch's tick, still to come),
  // and stopped where it was to stop.
  const remake = (pl: Player, lane: Lane) => {
    pl.part.dispose()
    pl.lane = lane
    Object.assign(pl, playerPart(pl))
    if (!pl.started) {
      pl.offset = fromOf(lane)
      return
    }
    const tick = Math.max(soonest(), pl.begun ?? 0)
    pl.begun = tick
    pl.offset = fromOf(lane) + round(tick - pl.anchor, playedOf(lane))
    pl.part.start(ticks(tick), ticks(pl.offset))
    if (pl.stop !== undefined) pl.part.stop(ticks(pl.stop))
  }

  // The session kept to an edit of the song. Each deck moves with its track: to the place of the same
  // track object (a track moved, or others added or taken away), else to its own place when the track
  // there is new (the track edited). A deck whose track is gone, or a slot of the other kind, is let
  // go; a slot whose pattern is gone is let go, one renamed plays on under its new name, one edited is
  // made again (`remake`). Hands back whether any slot was let go, so knobs are taken up again.
  const follow = (was: Project, now: Project): boolean => {
    if (was.tracks === now.tracks) return false
    let lost = false
    const taken = new Set<number>()
    const to = was.tracks.map((x) => {
      const j = now.tracks.indexOf(x)
      if (j >= 0) taken.add(j)
      return j
    })
    was.tracks.forEach((_, i) => {
      if (to[i]! >= 0 || i >= now.tracks.length || taken.has(i) || was.tracks.includes(now.tracks[i]!)) return
      to[i] = i
      taken.add(i)
    })
    const moved: Deck[] = []
    decks.forEach((d, i) => {
      if (!d) return
      const j = to[i]!
      const x = j >= 0 ? now.tracks[j] : undefined
      if (!x) {
        unpend(d)
        for (const pl of d.players) drop(pl)
        lost ||= d.players.length > 0
        return
      }
      moved[j] = d
      for (const pl of d.players) {
        pl.track = j
        if (pl.gone) continue
        let lane: Lane | undefined = x.kind === pl.kind ? x.patterns[pl.name] : undefined
        if (!lane && x.kind === pl.kind) {
          const renamed = Object.entries(x.patterns).find(([, v]) => v === pl.lane)
          if (renamed) [pl.name, lane] = renamed
        }
        if (!lane) {
          drop(pl)
          lost = true
        } else if (lane !== pl.lane) remake(pl, lane)
      }
      d.players = d.players.filter(p => !p.gone || p.until !== undefined)
    })
    decks.length = 0
    moved.forEach((d, j) => { decks[j] = d })
    return lost
  }

  // Every slot let go of and every launch taken back: the transport stopped. The session keeps hold of
  // its tracks until they are sent back to the arrangement.
  const unlaunch = () => {
    for (const d of decks) {
      if (!d) continue
      unpend(d)
      for (const pl of d.players) drop(pl)
      d.players = []
      d.next = undefined
    }
    wraps.length = 0
  }

  // Whether any slot plays or waits to: the song's end does not stop the transport while one does.
  const launched = () => decks.some(d => d?.players.some(p => !p.gone)) || pending.size > 0

  // What the page is shown of each track of the session, read at the context's now(), where the
  // playhead is: the slot heard there and how far through its loop, and the launch waiting.
  const session = (): Launched[] => {
    const now = transport.context.now()
    const tick = transport.ticks
    return project.tracks.map((_, t) => {
      const d = decks[t]
      if (!d) return { held: false }
      d.players = d.players.filter(p => !(p.gone && (p.until === undefined || p.until <= now)))
      const on = latest(d.players, p => p.heard !== undefined && p.heard <= now && (p.until === undefined || p.until > now))
      return {
        held: d.held,
        ...(on ? { scene: on.scene, through: round(tick - on.anchor, playedOf(on.lane)) / playedOf(on.lane) } : {}),
        ...(d.next ? { next: d.next } : {}),
      }
    })
  }
  transport.on('start', started)
  transport.on('loop', looped)

  // Buses first, so every send finds its bus.
  time(project)
  bound(project)
  destination.volume.value = project.master.volume
  master = project.master.effects.map(effect)
  wireMaster()
  for (const [name, bus] of Object.entries(project.buses)) returns.set(name, ret(name, bus))
  for (const device of project.rack) strips.push(strip(device))
  for (const clip of project.clips) parts.push(part(clip))

  const dispose = () => {
    transport.off('stop', stopped)
    transport.off('pause', stopped)
    transport.off('start', started)
    transport.off('loop', looped)
    for (const id of waiting) clearTimeout(id)
    waiting.clear()
    if (later !== undefined) transport.context.clearTimeout(later)
    later = undefined
    unlaunch()
    decks.length = 0
    for (const p of parts) unpart(p)
    if (ending !== undefined) transport.clear(ending)
    ending = undefined
    for (const s of strips) unstrip(s)
    for (const r of returns.values()) {
      for (const e of r.effects) e.dispose()
      r.channel.dispose()
    }
    for (const e of master) e.dispose()
    for (const m of meters.values()) m.dispose()
    master = []
    wireMaster()
    parts.length = 0
    strips.length = 0
    returns.clear()
    meters.clear()
  }

  const edit = (now: Project) => {
    const was = project
    if (now === was) return
    project = now
    const lost = follow(was, now)
    if (now.bpm !== was.bpm || now.timeSignature !== was.timeSignature || now.swing !== was.swing ||
      now.swingSubdivision !== was.swingSubdivision || now.ppq !== was.ppq || now.loop !== was.loop) time(now)
    const [a, b] = [spanOf(now), spanOf(was)]
    if (a.start !== b.start || a.end !== b.end || now.ppq !== was.ppq) bound(now)

    if (now.master !== was.master) {
      destination.volume.value = now.master.volume
      const chain = effects(master, was.master.effects, now.master.effects)
      if (chain) {
        master = chain
        wireMaster()
      }
    }

    for (const [name, r] of returns) {
      const bus = now.buses[name]
      if (bus) continue
      for (const e of r.effects) e.dispose()
      r.channel.dispose()
      returns.delete(name)
    }
    for (const [name, bus] of Object.entries(now.buses)) {
      const r = returns.get(name)
      if (!r) { returns.set(name, ret(name, bus)); continue }
      if (r.bus === bus) continue
      r.channel.volume.value = bus.volume
      r.channel.pan.value = bus.pan
      const chain = effects(r.effects, r.bus.effects, bus.effects)
      if (chain) {
        r.channel.disconnect()
        for (const e of r.effects) e.disconnect()
        r.effects = chain
        r.channel.chain(...r.effects, destination)
      }
      r.bus = bus
    }

    // A device added or taken away moves the ones after it, so the rack is made again.
    if (now.rack.length !== was.rack.length) {
      for (const s of strips) unstrip(s)
      unmeter()
      strips.splice(0, strips.length, ...now.rack.map(strip))
    }
    now.rack.forEach((device, d) => {
      const s = strips[d]!
      const old = s.device
      if (device === old) return
      s.device = device
      const a = device.instrument
      const b = old.instrument
      let rewire = false
      if (a.is !== b.is || a.voices !== b.voices) {
        s.instrument.dispose()
        s.instrument = instrument(a)
        rewire = true
      } else {
        // A kit is handed its whole pads, and sets in each pad only what changed.
        const delta = a.is === DRUM_KIT ? (a.options === b.options ? undefined : a.options) : changed(b.options, a.options)
        if (delta) s.instrument.set(delta)
      }
      const chain = effects(s.effects, old.effects, device.effects)
      if (chain) { s.effects = chain; rewire = true }
      if (rewire) wireStrip(s)
      const c = device.channel
      if (c !== old.channel) {
        s.channel.volume.value = c.volume
        s.channel.pan.value = c.pan
        s.channel.mute = c.mute
        s.channel.solo = c.solo
      }
      for (const [bus, gain] of s.sends) {
        const dB = device.sends[bus]
        if (dB === undefined || !now.buses[bus]) { gain.dispose(); s.sends.delete(bus) } else gain.gain.value = dB
      }
      for (const [bus, dB] of Object.entries(device.sends)) if (!s.sends.has(bus)) send(s, bus, dB)
    })

    // A clip is kept while it starts where it did, runs as long from the same place in its loop, and
    // plays the very same pattern object; anything else of it changed (its notes, its pattern's length
    // or `from`, its start, length or offset) makes it again.
    const kept: Playing[] = []
    now.clips.forEach((clip, i) => {
      const p = parts[i]
      const pattern = now.tracks[clip.track]!.patterns[clip.pattern]!
      if (p && p.clip.start === clip.start && p.clip.length === clip.length && p.clip.offset === clip.offset && p.pattern === pattern) {
        p.clip = clip
        kept.push(p)
        return
      }
      if (p) unpart(p)
      kept.push(part(clip))
    })
    for (const p of parts.slice(now.clips.length)) unpart(p)
    parts.splice(0, parts.length, ...kept)

    // An automation track muted, retargeted or gone lets go of the knob it held, which goes back to
    // its own value; playing, every knob is then taken up where the song is.
    const changedKnobs = was.tracks.some((x, t) => {
      const y = now.tracks[t]
      return x.kind === 'automation' && x !== y &&
        !(y?.kind === 'automation' && y.mute === x.mute && JSON.stringify(y.target) === JSON.stringify(x.target))
    }) || now.tracks.length !== was.tracks.length || lost
    if (changedKnobs) {
      const time = transport.context.now()
      for (const x of was.tracks) {
        if (x.kind !== 'automation' || !x.target) continue
        const r = reach(x.target)
        if (r) restore(r, time)
      }
      if (transport.state === 'started') resume(transport.getTicksAtTime(time), time)
    }
  }

  // A meter on a device's channel, a bus's or the master.
  const meter = (on: number | string) => {
    const key = String(on)
    let m = meters.get(key)
    if (m) return m
    m = new Tone.Meter()
    if (on === 'master') destination.connect(m)
    else if (typeof on === 'number') {
      const s = strips[on]
      if (!s) throw new Error(`audiodaw: no device ${on}`)
      s.channel.connect(m)
    } else {
      const r = returns.get(on)
      if (!r) throw new Error(`audiodaw: no bus ${on}`)
      r.channel.connect(m)
    }
    meters.set(key, m)
    return m
  }

  // A key played on a device's instrument now, and let go: Tone's triggerAttack and triggerRelease.
  const attack = (d: number, note: string, velocity: number) => {
    const s = strips[d]
    if (!s) throw new Error(`audiodaw: no device ${d}`)
    s.instrument.triggerAttack(note, Tone.now(), velocity)
  }
  const release = (d: number, note: string) => {
    const s = strips[d]
    if (!s) throw new Error(`audiodaw: no device ${d}`)
    s.instrument.triggerRelease(note, Tone.now())
  }

  // What Tone holds now, `get()`: a device's instrument (a synth's as its voices', a kit's with each
  // pad's drum), and an effect of a chain. Each option Tone has is there, with the ones a kind
  // of oscillator brings (a fat one's `count` and `spread`, an FM one's `modulationIndex`).
  const optionsOf = (d: number): object => {
    const s = strips[d]
    if (!s) throw new Error(`audiodaw: no device ${d}`)
    return s.instrument.get()
  }
  const effectOptionsOf = (chain: Chain, i: number): object => {
    const list = chain === 'master' ? master : 'bus' in chain ? returns.get(chain.bus)?.effects : strips[chain.device]?.effects
    const of = chain === 'master' ? project.master.effects : 'bus' in chain ? project.buses[chain.bus]?.effects : project.rack[chain.device]?.effects
    const e = list?.[i]
    if (!e || !of?.[i]) throw new Error(`audiodaw: no effect ${i} on ${JSON.stringify(chain)}`)
    // An option Tone takes only when it makes the effect is not one `get()` reads back: it is the
    // song's. An effect turned off reads its `wet` off the song too, not the 0 Tone holds.
    const got = e.get() as unknown as Record<string, unknown>
    const asked = of[i]!.options as Record<string, unknown>
    for (const [k, v] of Object.entries(asked)) if (!(k in e) || k === 'wet') got[k] = v
    return got
  }

  // Whether a knob sweeps (Tone holds it as a Param or a Signal on every object it lives on) or is set
  // on 16ths; undefined for a knob the song does not have.
  const glides = (k: Knob): boolean | undefined => {
    const r = reach(k)
    return r ? r.params !== undefined : undefined
  }

  return {
    edit, meter, attack, release, optionsOf, effectOptionsOf, glides, dispose,
    launch: (t: number, s: number) => launch(t, s), halt: (t: number) => halt(t), launchScene, haltAll, arrange, session, jump, unlaunch, begin,
    get project() { return project },
  }
}

export type Song = ReturnType<typeof song>

// The project rendered offline for `seconds`, from tick 0, through the same `song`.
export async function render(project: Project, seconds: number, during?: (s: Song) => void, ranges?: Ranges) {
  return Tone.Offline(({ transport }) => {
    const s = song(project, ranges)
    during?.(s)
    transport.start()
  }, seconds)
}

export type Timing = { lookAhead: number; latencyHint: number }

export function audiodaw() {
  let timed: Timing | undefined
  // The browser's own context under the one the plugin made last: the buffer is read off it.
  let browsers: AudioContext | undefined
  let playing: Song | undefined
  // The song last loaded, as last edited, and its knobs' ranges: what `retime` makes again.
  let last: { project: Project; ranges: Ranges | undefined } | undefined
  const transport = () => Tone.getTransport()
  const loaded = () => {
    if (!playing) throw new Error('audiodaw: no song is loaded')
    return playing
  }
  // A context of Tone's on `t`, made the one Tone plays through; the one it replaces handed back.
  // Tone takes a buffer only by name; an AudioContext takes it in seconds. It is the one Tone itself
  // makes, standardized-audio-context's: Firefox's own has no `positionX` on its listener, and Tone's
  // Listener throws "param must be an AudioParam" on it. It reports no `outputLatency`; the browser's
  // context it wraps, held in its `_nativeAudioContext` (the version is pinned in package.json), does.
  const contextOn = (t: Timing) => {
    const was = Tone.getContext()
    const context = new StandardAudioContext({ latencyHint: t.latencyHint })
    browsers = (context as unknown as { _nativeAudioContext: AudioContext })._nativeAudioContext
    Tone.setContext(new Tone.Context({ context: context as unknown as AudioContext, lookAhead: t.lookAhead }))
    timed = t
    return was
  }
  return {
    tick(p: Plugins) {
      if (timed) return
      contextOn(p.wire.scene.world!.audiodaw as Timing)
    },
    // Other timing while the page runs: the transport stopped and the song made again on a new
    // context of `t` at once; the old context's closing handed back.
    retime(t: Timing): Promise<void> {
      transport().stop()
      playing?.dispose()
      playing = undefined
      // The context the plugin made last; Tone hands it back as its base type.
      const was = contextOn(t) as Tone.Context
      if (last) playing = song(last.project, last.ranges)
      return was.close()
    },
    // What the context holds, and the buffer the browser gave for the hint.
    get timing(): Timing & { buffer: number } {
      const c = Tone.getContext()
      const raw = browsers ?? (c.rawContext as AudioContext)
      return { lookAhead: c.lookAhead, latencyHint: timed?.latencyHint ?? 0, buffer: (raw.baseLatency ?? 0) + (raw.outputLatency ?? 0) }
    },
    // A song made and its notes and automation scheduled; `ranges` gives each automated knob's travel.
    load(project: Project, ranges?: Ranges) {
      playing?.dispose()
      transport().stop()
      transport().cancel()
      playing = song(project, ranges)
      last = { project, ranges }
    },
    edit(project: Project) {
      loaded().edit(project)
      last = { project, ranges: last?.ranges }
    },
    // Tone's context let run, which a page allows after a press or a key.
    start() { return Tone.start() },
    // Play from `tick`. From a pause somewhere else, the session's slots play on from there, each at
    // the place in its loop it had reached (`jump`).
    play(tick = transport().ticks) {
      const tr = transport()
      const was = tr.ticks
      const after = tr.state === 'paused' && tick !== was ? playing?.jump(was, tick) : undefined
      if (tr.state !== 'started') playing?.begin(tick)
      tr.start(undefined, ticks(tick))
      after?.()
    },
    // Whether the transport is running: Tone's `state`.
    get playing() { return transport().state === 'started' },
    attack(device: number, note: string, velocity: number) { loaded().attack(device, note, velocity) },
    release(device: number, note: string) { loaded().release(device, note) },
    // The transport stopped, and with it every slot of the session (Ableton's stop).
    stop() {
      playing?.unlaunch()
      transport().stop()
    },
    pause() { transport().pause() },
    // The song put at `tick`. Playing, the session's slots play on from there, each at the place in
    // its loop it had reached, and a launch waiting waits again from there.
    locate(tick: number) {
      const tr = transport()
      if (tr.state !== 'started' || !playing) {
        tr.ticks = tick
        return
      }
      const after = playing.jump(Math.ceil(tr.getTicksAtTime(tr.now())), tick)
      tr.ticks = tick
      after()
    },
    // The session (`audiodaw.sim.ts`): a slot launched by its track and scene, a track stopped, a
    // scene launched, every track stopped, every track back to its arrangement; what each track plays.
    launch(track: number, scene: number) { loaded().launch(track, scene) },
    halt(track: number) { loaded().halt(track) },
    launchScene(scene: number) { loaded().launchScene(scene) },
    haltAll() { loaded().haltAll() },
    arrange() { loaded().arrange() },
    session(): Launched[] { return playing?.session() ?? [] },
    cycle(on: boolean) { transport().loop = on },
    position() { return transport().ticks },
    stamp() { return transport().getTicksAtTime(Tone.now()) },
    meter(on: number | string) { return loaded().meter(on) },
    optionsOf(device: number) { return loaded().optionsOf(device) },
    effectOptionsOf(chain: Chain, i: number) { return loaded().effectOptionsOf(chain, i) },
    glides(knob: Knob) { return loaded().glides(knob) },
    render,
    dispose() { playing?.dispose(); playing = undefined; last = undefined },
  }
}
