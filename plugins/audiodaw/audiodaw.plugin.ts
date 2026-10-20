// audiodaw: the song played through Tone.js, a thin wrapper.
//
// `load(project)` sets Tone's Transport from the project and makes the Tone objects it names: each
// rack device's instrument (`voices` of `new Tone[is](options)` played in turn, `synth`, or a
// `DrumKit` of Tone drums, one per note, `drumKit`), its effects (`new Tone[is](options)`, chained
// in order, a Chorus's, a Tremolo's, an AutoPanner's and an AutoFilter's LFO started, which Tone
// makes stopped) and its `Tone.Channel`; each bus, a `Tone.Channel` that `receive`s its name into its
// effects; the master's effects, chained on `Tone.getDestination()`; and one `Tone.Part` per clip,
// whose events are its pattern's notes. A Part's callback reads its track as the song is when the
// note falls: a track let through (`sounds`) plays `triggerAttackRelease(note, duration, time,
// velocity)` on the instrument of the device it targets then, so a track retargeted or muted while
// playing is heard so at its next note.
//
// `edit(project)` hands each value that changed to the Tone object that holds it: `set` on an
// instrument or an effect, an effect off as `wet = 0`, the channel's `volume`, `pan`, `mute` and
// `solo`, a send's gain, `part.add` and `part.remove` on a clip's live Part, and the instrument made
// again when its `is` or its `voices` changed. A rack of another length is made again, device by device; tracks have no
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
import { DRUM_KIT, fromOf, sounds, spanOf, type Bus, type Chain, type Clip, type Device, type Effect, type Instrument, type KitOptions, type Lane, type Pad, type Project, type Knob, type Range, type AutomationNote, type AutomationPattern, level, valueAt } from './audiodaw.sim'

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
type Playing = { clip: Clip; pattern: Lane; ids: number[] }

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
    ending = end > 0 ? at(transport, (when) => transport.stop(when), end) : undefined
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

  // The strip a note track's notes go to now, or undefined when they are held back or go nowhere.
  const heard = (t: number): Strip | undefined => {
    const x = project.tracks[t]
    if (x?.kind !== 'notes' || x.target === undefined || !sounds(project, t)) return undefined
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

  // A clip's notes, each a `transport.schedule` at its tick in the song: the clip's start plus the
  // note's time past the pattern's `from`, only the notes from `from` to the pattern's `length`, so
  // the clip plays once and notes kept outside those ticks are not heard. The transport fires each
  // whenever it passes its tick, so a clip made while playing sounds from where the song is, and
  // again each time a loop or a locate brings the song back over it. Its track is read as the note
  // falls: a clip moved to another track plays through that one. A clip of an automation track
  // schedules no notes.
  const part = (clip: Clip): Playing => {
    const track = project.tracks[clip.track]!
    const pattern = track.patterns[clip.pattern]!
    const playing: Playing = { clip, pattern, ids: [] }
    if (track.kind !== 'notes') {
      automate(playing, track.patterns[clip.pattern]!)
      return playing
    }
    const notes = track.patterns[clip.pattern]!
    const from = fromOf(notes)
    for (const n of notes.notes) {
      if (n.time < from || n.time >= notes.length) continue
      playing.ids.push(at(transport, (when) => {
        const s = heard(playing.clip.track)
        if (s) s.instrument.triggerAttackRelease(n.note, ticks(n.duration), when, n.velocity)
      }, clip.start + n.time - from))
    }
    return playing
  }
  const unpart = (p: Playing) => {
    for (const id of p.ids) transport.clear(id)
    p.ids = []
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
  // the track is muted, targets none, or its knob has no range the page gave.
  const aimed = (t: number): { knob: Knob; r: Reached; range: Range } | undefined => {
    const x = project.tracks[t]
    if (x?.kind !== 'automation' || !x.target || !sounds(project, t)) return undefined
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
  const glide = (a: { r: Reached; range: Range }, n: AutomationNote, at0: number, until: number, time: number) => {
    const s = second()
    const heardAt = (tick: number) => time + (tick - at0) * s
    for (const p of a.r.params!) {
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
  // very time and would be taken back with it.
  const restore = (r: Reached, time: number, cut = true) => {
    if (r.params) for (const p of r.params) {
      if (cut) p.cancelScheduledValues(time)
      p.setValueAtTime(r.own, time)
    } else setAt(r, r.own, time)
  }

  // Where each automation note of a clip sounds in the song, from its pattern's `from` to its
  // `length`: its first tick and the tick it ends.
  const spans = (clip: Clip, x: AutomationPattern) => {
    const from = fromOf(x)
    return x.notes.flatMap(n => {
      const start = clip.start + n.time - from
      const end = clip.start + Math.min(n.time + n.duration, x.length) - from
      return n.time >= from && n.time < x.length && end > start ? [{ n, start, end }] : []
    })
  }
  // Whether automation track `t` has a note sounding at `tick` other than one ending there.
  const holds = (t: number, tick: number) => parts.some(p => p.clip.track === t && project.tracks[t]?.kind === 'automation' &&
    spans(p.clip, p.pattern as AutomationPattern).some(s => s.start <= tick && tick < s.end))

  // An automation clip's notes, each a `transport.schedule` like a note: at its first tick a knob that
  // glides is handed the whole note's line, and at its end goes back to its own value unless another
  // note of the track takes it there. A knob Tone only sets is set on every 16th of the song the note
  // covers, and at its end, each event a look-ahead of ticks early so its set is sent in time. Each
  // reads its track as it falls: a track muted or retargeted is heard so from its next event.
  const automate = (playing: Playing, x: AutomationPattern) => {
    const sixteenth = project.ppq / 4
    const early = ahead()
    for (const { n, start, end } of spans(playing.clip, x)) {
      playing.ids.push(at(transport, (when) => {
        const a = aimed(playing.clip.track)
        if (a?.r.params) glide(a, n, 0, end - start, when)
      }, start))
      playing.ids.push(at(transport, (when) => {
        const a = aimed(playing.clip.track)
        if (a?.r.params && !holds(playing.clip.track, end)) restore(a.r, when, false)
      }, end))
      const steps = [start]
      for (let k = Math.ceil((start + 1) / sixteenth) * sixteenth; k < end; k += sixteenth) steps.push(k)
      for (const k of steps) playing.ids.push(at(transport, (when) => {
        const a = aimed(playing.clip.track)
        if (a && !a.r.params) setAt(a.r, level(a.range, valueAt(n, k - start)), when + early * second())
      }, Math.max(0, k - early)))
      playing.ids.push(at(transport, (when) => {
        const a = aimed(playing.clip.track)
        if (a && !a.r.params && !holds(playing.clip.track, end)) setAt(a.r, a.r.own, when + early * second())
      }, Math.max(0, end - early)))
    }
  }

  // Every automated knob where the song is at `tick`, heard from audio time `time`: a note sounding
  // there is taken up from that tick, and a knob with none goes back to its own value. A play from
  // the middle of a note, a locate, and the loop's jump back each land here.
  const resume = (tick: number, time: number) => {
    project.tracks.forEach((x, t) => {
      if (x.kind !== 'automation') return
      const a = aimed(t)
      if (!a) return
      const sounding = parts.filter(p => p.clip.track === t).flatMap(p => spans(p.clip, p.pattern as AutomationPattern)).find(s => s.start <= tick && tick < s.end)
      if (!sounding) { restore(a.r, time); return }
      if (a.r.params) glide(a, sounding.n, tick - sounding.start, sounding.end - sounding.start, time)
      else setAt(a.r, level(a.range, valueAt(sounding.n, tick - sounding.start)), time)
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
  const started = (time: number) => resume(transport.getTicksAtTime(time), time)
  const looped = (time: number) => resume(project.loop?.start ?? 0, time)
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

    // A clip is kept while it starts where it did and plays the very same pattern object; anything
    // else of it changed (its notes, its pattern's length or `from`, its start) schedules it again.
    const kept: Playing[] = []
    now.clips.forEach((clip, i) => {
      const p = parts[i]
      const pattern = now.tracks[clip.track]!.patterns[clip.pattern]!
      if (p && p.clip.start === clip.start && p.pattern === pattern) {
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
    }) || now.tracks.length !== was.tracks.length
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

  return { edit, meter, attack, release, optionsOf, effectOptionsOf, glides, dispose, get project() { return project } }
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
  let playing: Song | undefined
  // The song last loaded, as last edited, and its knobs' ranges: what `retime` makes again.
  let last: { project: Project; ranges: Ranges | undefined } | undefined
  const transport = () => Tone.getTransport()
  const loaded = () => {
    if (!playing) throw new Error('audiodaw: no song is loaded')
    return playing
  }
  // A context of Tone's on `t`, made the one Tone plays through; the one it replaces handed back.
  // Tone takes a buffer only by name; the browser's AudioContext takes it in seconds.
  const contextOn = (t: Timing) => {
    const was = Tone.getContext()
    Tone.setContext(new Tone.Context({ context: new AudioContext({ latencyHint: t.latencyHint }), lookAhead: t.lookAhead }))
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
      const raw = c.rawContext as AudioContext
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
    play(tick = transport().ticks) { transport().start(undefined, ticks(tick)) },
    // Whether the transport is running: Tone's `state`.
    get playing() { return transport().state === 'started' },
    attack(device: number, note: string, velocity: number) { loaded().attack(device, note, velocity) },
    release(device: number, note: string) { loaded().release(device, note) },
    stop() { transport().stop() },
    pause() { transport().pause() },
    locate(tick: number) { transport().ticks = tick },
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
