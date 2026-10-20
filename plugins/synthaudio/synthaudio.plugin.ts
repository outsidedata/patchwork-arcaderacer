// Music as notes: Tone.js instruments in the page, playing projects (`synthaudio.sim.ts`). A note is
// sound, which no rule reads, so this plugin is the page's: no server half that runs, and no row of
// its own. A page's actors play it directly, a key down attacking a note and the key up releasing
// it; and a scene may let a row's field choose the project, so every seat hears the one the game is in.
//
// A project is one song, one file: a `json` entry of the scene's loader catalogue. Its numbers are the
// scene's `world.synthaudio`:
//   projects  the loader `json` entries that are projects, by name.
//   music     { kind, path, fade? }: the project the field `path` (fields joined by dots) of the first
//             row of `kind` names plays, and none while it names none or there is no such row. When
//             the field changes the music changes on the next bar line of the project playing; with
//             `fade`, the music fades out over `fade` seconds, changes, and fades back in over as
//             many. The whole of it fades, the notes the keys play too. `play` and `stop` still play
//             one until the field next changes.
//   volume    { level, muted }: the store keys the volume is read from, as audio's. Without it, or
//             without a store, the volume is 1.
//
// How a project sounds. Each track is its instrument, built from its `is` and `params` (the bank of
// presets is never read here), out through its `gain` and `pan`, and sent at `echo` and `room` to
// the project's echo and room; every track, the echo and the room go out through the project's
// compressor and limiter, then a fade, then the volume. A track's instrument is built again when its
// `is` or `params` change, and only then, so a page that hands this the project it is editing after
// every edit hears each knob at once and keeps every other track ringing. Each instrument on Tone:
//   synth      a PolySynth of Synths: `wave` the oscillator, attack, decay, sustain, release its envelope.
//   monosynth  a MonoSynth: the same, and a lowpass at `cutoff` with Q `resonance`, which its filter
//              envelope holds still.
//   fmsynth    a PolySynth of FMSynths: the same as synth, `harmonicity`, and `modulation` its index.
//   pluck      a PluckSynth: `brightness` its dampening, `resonance`, `release`.
//   drumkit    a voice per pad: a MembraneSynth (`membrane`) or a MetalSynth (`metal`) at the pad's
//              `pitch`, a NoiseSynth (`noise`), or a Player of its `sample` (`sample`); each dies away
//              over the pad's `decay` and plays at its `gain`. A note names the pad it hits.
//   sampler    a Sampler of its `samples`, through a lowpass at `cutoff` with Q `resonance`, its
//              `attack` and `release`.
// A sample is fetched through the loader (`loader.beside`), beside the project's own catalogue entry,
// and decoded on this plugin's context. One that is not there plays nothing and nothing says so; a
// track waiting on its samples plays what has landed and is built again as each lands.
//
// What it hands a page:
//   play(name), stop(), playing(): a project of `projects`, looped over its length, from its start,
//   now; `playing` its name, '' for one auditioned, undefined for none.
//   audition(project, base, from?): a project handed as it is, as a studio holds it, looped, from
//   `from` sixteenths into it, its start without; `base` is the catalogue entry its sample paths are
//   beside. It is checked first, and throws where it goes wrong.
//   use(project, base): the project the keys play, built now, without playing it; a project
//   played or auditioned is used as well.
//   attack(track, note, vel?), release(track, note): a held note on a track of the project used, now.
//   On a drumkit the note is a pad's name.
//   at(): the sixteenth the project heard is at, or null; position(), the same unrounded; project(),
//   the project heard. A project asked for is heard from the moment it starts, so until the bar line
//   it waits for these are the one before it.
//   held(): every note a key holds now, `{ track, note }`, attacked and not yet released.
//   quiet(tracks): the tracks of every project whose notes the song does not play, from now until
//   it is handed others, as a mixer's mute and solo leave them out; the keys still play them.
//
// Each client has a Tone context of its own over an AudioContext of its own, never Tone's global
// one, since a page makes a client per scene. Node has no Web Audio: a client made there has no
// context and plays nothing, but checks what it is handed as one in a page does. The context resumes
// on the first pointerdown or keydown on the page, as audio's does. `close` stops every note and the
// project, and closes the context.
import * as Tone from 'tone'
import type { Plugins } from '#engine/browser.ts'
import { check, flatten, sixteenth, type Instrument, type Master, type Pad, type Project } from './synthaudio.sim.ts'

export type Music = { kind: string; path: string; fade?: number }
export type Table = { projects: string[]; music?: Music; volume?: { level: string; muted: string } }

const BAR = 16

// One instrument: a note attacked, released, played for a while, every note let go, and gone.
type Inst = { attack(n: string, t?: number, v?: number): void; release(n: string, t?: number): void; play(n: string, d: string, t: number, v?: number): void; hush(): void; dispose(): void }
const SILENT: Inst = { attack() {}, release() {}, play() {}, hush() {}, dispose() {} }
// A track as it sounds: its instrument, what it was built from, its level, pan and sends, and every
// node it goes out through.
type Built = { from: string; inst: Inst; gain: Tone.Gain; pan: Tone.Panner; echo: Tone.Gain; room: Tone.Gain; nodes: Tone.ToneAudioNode[] }
// A project's sound: the input every track goes into, its echo and room, its compressor and limiter,
// what its master was built from, and its tracks.
type Rig = { base: string; from: string; input: Tone.Gain; echo: Tone.FeedbackDelay; room: Tone.Reverb; nodes: Tone.ToneAudioNode[]; tracks: Map<string, Built> }
// A project on the transport: from the transport tick `from`, heard from context time `at`, and until
// context time `until` once something has been asked for in its place.
type Playing = { name: string; project: Project; part: Tone.Part; from: number; at: number; until?: number }

const read = (rows: Plugins['wire']['rows'], m: Music) => {
  const row = rows.find(r => r.kind === m.kind)
  const v = row ? m.path.split('.').reduce<any>((o, k) => o?.[k], row.data) : undefined
  return typeof v === 'string' ? v : null
}

export function synthaudio() {
  const Raw = globalThis.AudioContext
  const context = Raw ? new Tone.Context(new Raw()) : undefined
  // Every project's rig goes into the fader a fade moves, then the store's volume.
  let fader: Tone.Gain | undefined
  let volume: Tone.Gain | undefined
  let table: Table | undefined
  let plugins: Plugins | undefined
  const rigs = new Map<Project, Rig>()
  const songs: Playing[] = [] // the project heard, then those asked for after it
  let used: Project | undefined // the project the keys play
  let wanted: string | null | undefined // the project the music field named last
  const held = new Map<string, { track: string; note: string }>() // every note a key holds
  let quiet = new Set<string>() // the tracks the song leaves out
  // Each sample by catalogue entry and path: its buffer once landed, null when it is not there, and
  // undefined while it is on its way.
  const buffers = new Map<string, AudioBuffer | null | undefined>()

  let listening = false
  const unlock = () => { void context!.resume(); off() }
  const off = () => {
    if (!listening) return
    listening = false
    removeEventListener('pointerdown', unlock)
    removeEventListener('keydown', unlock)
  }
  if (context && context.state !== 'running') {
    listening = true
    addEventListener('pointerdown', unlock)
    addEventListener('keydown', unlock)
  }

  const out = () => {
    if (fader) return fader
    const c = context!
    fader = new Tone.Gain({ context: c })
    volume = new Tone.Gain({ context: c })
    fader.chain(volume, c.destination)
    return fader
  }

  // ------------------------------------------------------------ samples

  const sampleKey = (base: string, path: string) => `${base} ${path}`
  // A sample's buffer, asked for the first time it is wanted; what it landed as, or undefined.
  function sample(base: string, path: string): AudioBuffer | undefined {
    const k = sampleKey(base, path)
    if (buffers.has(k)) return buffers.get(k) ?? undefined
    buffers.set(k, undefined)
    void plugins!.loader.beside(base, path)
      .then((bytes: ArrayBuffer | undefined) => (bytes ? context!.rawContext.decodeAudioData(bytes) : null))
      .catch(() => null)
      .then((b: AudioBuffer | null) => {
        buffers.set(k, b)
        if (b) for (const [p, rig] of rigs) if (rig.base === base) sync(p, base, rig)
      })
    return undefined
  }

  // ------------------------------------------------------------ instruments

  function synthInst(s: any, mono: boolean): Inst {
    return {
      attack: (n, t, v) => s.triggerAttack(n, t, v),
      release: (n, t) => (mono ? s.triggerRelease(t) : s.triggerRelease(n, t)),
      play: (n, d, t, v) => s.triggerAttackRelease(n, d, t, v),
      hush: () => (mono ? s.triggerRelease() : s.releaseAll()),
      dispose: () => s.dispose(),
    }
  }

  // One pad's voice, into `into`: it dies away over the pad's decay.
  function padInst(p: Pad, into: Tone.ToneAudioNode, base: string): Inst {
    const c = context!
    const envelope = { decay: p.decay, sustain: 0 }
    if (p.voice === 'sample') {
      const b = sample(base, p.sample!)
      if (!b) return SILENT
      const player = new Tone.Player({ context: c, url: new Tone.ToneAudioBuffer(b) }).connect(into)
      return {
        attack: (_n, t) => player.start(t ?? c.now(), 0, p.decay),
        release() {},
        play: (_n, _d, t) => player.start(t, 0, p.decay),
        hush: () => player.stop(),
        dispose: () => player.dispose(),
      }
    }
    if (p.voice === 'noise') {
      const s = new Tone.NoiseSynth({ context: c, envelope }).connect(into)
      return {
        attack: (_n, t, v) => s.triggerAttack(t, v),
        release: (_n, t) => s.triggerRelease(t),
        play: (_n, d, t, v) => s.triggerAttackRelease(d, t, v),
        hush: () => s.triggerRelease(),
        dispose: () => s.dispose(),
      }
    }
    const s: any = p.voice === 'membrane' ? new Tone.MembraneSynth({ context: c, envelope }) : new Tone.MetalSynth({ context: c, envelope })
    s.connect(into)
    const at = p.pitch!
    return {
      attack: (_n, t, v) => s.triggerAttack(at, t, v),
      release: (_n, t) => s.triggerRelease(t),
      play: (_n, d, t, v) => s.triggerAttackRelease(at, d, t, v),
      hush: () => s.triggerRelease(),
      dispose: () => s.dispose(),
    }
  }

  // Instrument `i` into `into`, and any nodes of its own it goes out through.
  function build(i: Instrument, into: Tone.ToneAudioNode, base: string): { inst: Inst; nodes: Tone.ToneAudioNode[] } {
    const c = context!, q = i.params
    const envelope = { attack: q.attack, decay: q.decay, sustain: q.sustain, release: q.release }
    switch (i.is) {
      case 'synth':
        return { inst: synthInst(new Tone.PolySynth({ context: c, voice: Tone.Synth, options: { oscillator: { type: q.wave }, envelope } }).connect(into), false), nodes: [] }
      case 'fmsynth':
        return { inst: synthInst(new Tone.PolySynth({ context: c, voice: Tone.FMSynth, options: { oscillator: { type: q.wave }, envelope, harmonicity: q.harmonicity, modulationIndex: q.modulation } as any }).connect(into), false), nodes: [] }
      case 'monosynth':
        return {
          inst: synthInst(new Tone.MonoSynth({
            context: c, oscillator: { type: q.wave } as any, envelope,
            filter: { type: 'lowpass', Q: q.resonance }, filterEnvelope: { baseFrequency: q.cutoff, octaves: 0 },
          }).connect(into), true),
          nodes: [],
        }
      case 'pluck':
        return { inst: synthInst(new Tone.PluckSynth({ context: c, dampening: q.brightness, resonance: q.resonance, release: q.release }).connect(into), true), nodes: [] }
      case 'sampler': {
        const urls: Record<string, Tone.ToneAudioBuffer> = {}
        for (const [note, path] of Object.entries(q.samples as Record<string, string>)) {
          const b = sample(base, path)
          if (b) urls[note] = new Tone.ToneAudioBuffer(b)
        }
        if (!Object.keys(urls).length) return { inst: SILENT, nodes: [] }
        const filter = new Tone.Filter({ context: c, type: 'lowpass', frequency: q.cutoff, Q: q.resonance }).connect(into)
        return { inst: synthInst(new Tone.Sampler({ context: c, urls, attack: q.attack, release: q.release }).connect(filter), false), nodes: [filter] }
      }
      case 'drumkit': {
        const pads = new Map<string, Inst>()
        for (const [name, p] of Object.entries(q.pads as Record<string, Pad>)) {
          const gain = new Tone.Gain({ context: c, gain: p.gain }).connect(into)
          const inst = padInst(p, gain, base)
          pads.set(name, { ...inst, dispose: () => { inst.dispose(); gain.dispose() } })
        }
        return {
          inst: {
            attack: (n, t, v) => pads.get(n)?.attack(n, t, v),
            release: (n, t) => pads.get(n)?.release(n, t),
            play: (n, d, t, v) => pads.get(n)?.play(n, d, t, v),
            hush: () => { for (const p of pads.values()) p.hush() },
            dispose: () => { for (const p of pads.values()) p.dispose() },
          },
          nodes: [],
        }
      }
    }
  }

  // What a track's instrument is built from: what it is, its params but its level, pan and sends,
  // and which of its samples have landed.
  const builtFrom = (i: Instrument, base: string) => {
    const has = i.is === 'drumkit'
      ? Object.values(i.params.pads as Record<string, Pad>).filter(p => p.voice === 'sample').map(p => p.sample!)
      : i.is === 'sampler' ? Object.values(i.params.samples as Record<string, string>) : []
    const { gain: _g, pan: _p, echo: _e, room: _r, ...sound } = i.params
    return JSON.stringify([i.is, sound, has.filter(p => buffers.get(sampleKey(base, p)))])
  }

  function dropTrack(b: Built) {
    b.inst.hush()
    b.inst.dispose()
    for (const n of b.nodes) n.dispose()
  }

  function dropRig(r: Rig) {
    for (const b of r.tracks.values()) dropTrack(b)
    for (const n of r.nodes) n.dispose()
  }

  // The project's rig made like the project, its samples beside catalogue entry `base`: its master
  // made again when it changed, each track whose instrument changed, or whose samples landed, made
  // again, and every other track's level, pan and sends set.
  function sync(p: Project, base: string, had: Rig | undefined): Rig {
    const c = context!
    const master = JSON.stringify(p.master)
    let r = had
    if (r && (r.from !== master || r.base !== base)) {
      dropRig(r)
      r = undefined
    }
    if (!r) {
      const m: Master = p.master
      const input = new Tone.Gain({ context: c })
      const compressor = new Tone.Compressor({ context: c, ...m.compressor })
      const limiter = new Tone.Limiter({ context: c, threshold: m.limiter })
      const echo = new Tone.FeedbackDelay({ context: c, delayTime: m.echo.time, feedback: m.echo.feedback, wet: 1 })
      const room = new Tone.Reverb({ context: c, decay: m.room.decay, wet: 1 })
      echo.connect(input)
      room.connect(input)
      input.chain(compressor, limiter, out())
      r = { base, from: master, input, echo, room, nodes: [input, compressor, limiter, echo, room], tracks: new Map() }
    }
    rigs.set(p, r)
    const rig = r
    for (const [name, b] of rig.tracks) if (!Object.hasOwn(p.tracks, name)) { dropTrack(b); rig.tracks.delete(name) }
    for (const [name, t] of Object.entries(p.tracks)) {
      const i = t.instrument, q = i.params, from = builtFrom(i, base)
      let b = rig.tracks.get(name)
      if (b && b.from !== from) {
        dropTrack(b)
        b = undefined
      }
      if (!b) {
        const gain = new Tone.Gain({ context: c })
        const pan = new Tone.Panner({ context: c })
        const echo = new Tone.Gain({ context: c })
        const room = new Tone.Gain({ context: c })
        gain.chain(pan, rig.input)
        pan.connect(echo)
        pan.connect(room)
        echo.connect(rig.echo)
        room.connect(rig.room)
        const made = build(i, gain, base)
        b = { from, inst: made.inst, gain, pan, echo, room, nodes: [...made.nodes, gain, pan, echo, room] }
        rig.tracks.set(name, b)
      }
      // A level, a pan or a send moved builds no instrument.
      b.gain.gain.value = q.gain
      b.pan.pan.value = q.pan
      b.echo.gain.value = q.echo
      b.room.gain.value = q.room
    }
    return rig
  }

  // The rig of project `p`, its samples beside catalogue entry `base`, made like it now.
  const rigOf = (p: Project, base: string): Rig => sync(p, base, rigs.get(p))
  function sweep() {
    const keep = new Set<Project>(songs.map(s => s.project))
    if (used) keep.add(used)
    for (const [p, r] of rigs) if (!keep.has(p)) { dropRig(r); rigs.delete(p) }
  }

  // ------------------------------------------------------------ the transport

  // The transport's ticks in `n` sixteenths, and ticks as a Tone time.
  const ticks = (n: number) => (n * context!.transport.PPQ) / 4
  const T = (t: number) => `${Math.round(t)}i`

  // The project heard now: the last one asked for whose moment has come. Those it followed are gone.
  function heard(): Playing | undefined {
    if (!context) return undefined
    const now = context.immediate()
    let gone = false
    while (songs.length && songs[0].until !== undefined && songs[0].until <= now) {
      songs.shift()!.part.dispose()
      gone = true
    }
    if (gone) sweep()
    return songs[0] && songs[0].at <= now ? songs[0] : undefined
  }

  // `p` plays from context time `at`, from `offset` sixteenths into it, looped over its length, in
  // place of whatever plays then; none stops the music at `at`.
  function begin(name: string, p: Project | undefined, base: string, at: number, offset = 0) {
    const c = context!, t = c.transport
    for (let i = songs.length - 1; i >= 0; i--) if (songs[i].at >= at) songs.splice(i, 1)[0].part.dispose()
    for (const s of songs) {
      s.part.stop(at)
      s.until = at
    }
    if (!p) return sweep()
    used = p
    const rig = rigOf(p, base)
    if (t.state !== 'started') t.start(at)
    t.bpm.setValueAtTime(p.bpm, at)
    const from = t.getTicksAtTime(at) - ticks(offset)
    const events = flatten(p).map(n => ({ time: T(ticks(n.at)), track: n.track, note: n.note, dur: T(ticks(n.len)), vel: n.vel }))
    const part = new Tone.Part({
      context: c,
      events,
      loop: true,
      loopEnd: T(ticks(p.length)),
      callback: (time, e: any) => { if (!quiet.has(e.track)) rig.tracks.get(e.track)?.inst.play(e.note, e.dur, time, e.vel) },
    }).start(T(from + ticks(offset)), T(ticks(offset)))
    songs.push({ name, project: p, part, from, at })
    sweep()
    void c.resume()
  }

  // The context time of the next bar line of the project heard; now when none plays.
  function nextBar() {
    const c = context!, s = heard(), at = position()
    if (!s || at === null) return c.now()
    return c.immediate() + (BAR - (at % BAR)) * sixteenth(s.project.bpm)
  }

  // A project of `projects` by name, loaded and checked.
  async function project(name: string): Promise<Project> {
    if (!table!.projects.includes(name)) throw new Error(`synthaudio has no project ${name}`)
    const p = await plugins!.loader.load(name)
    check(p)
    return p
  }

  // The music moves to the project `name`, or to none: on the next bar line, or faded over `fade`.
  async function change(name: string | null, fade: number | undefined) {
    const c = context!
    const p = name === null ? undefined : await project(name)
    if (!fade || !heard()) return begin(name ?? '', p, name ?? '', nextBar())
    const now = c.now(), at = now + fade, g = fader!.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.getValueAtTime(now), now)
    g.linearRampToValueAtTime(0, at)
    g.linearRampToValueAtTime(1, at + fade)
    begin(name ?? '', p, name ?? '', at)
  }

  function stop() {
    if (!context) return
    for (const s of songs.splice(0)) s.part.dispose()
    for (const r of rigs.values()) for (const b of r.tracks.values()) b.inst.hush()
    sweep()
  }

  // Where the project heard is now, in sixteenths from its start, within its length: the transport's
  // ticks at the context's own clock, not at Tone's, which runs its lookahead ahead of what is heard.
  function position() {
    const s = heard()
    if (!s) return null
    const at = (context!.transport.getTicksAtTime(context!.immediate()) - s.from) / ticks(1)
    return ((at % s.project.length) + s.project.length) % s.project.length
  }

  // The track of the project used that a key plays.
  const keyed = (track: string) => {
    if (!used) throw new Error('synthaudio has no project to play keys on')
    if (!Object.hasOwn(used.tracks, track)) throw new Error(`synthaudio's project has no track ${track}`)
    return rigs.get(used)?.tracks.get(track)
  }

  return {
    context,
    tick(p: Plugins) {
      plugins = p
      table = p.wire.scene.world!.synthaudio as Table
      if (!context) return
      out()
      const v = table.volume
      volume!.gain.value = v && p.store ? (p.store.get(v.muted) ? 0 : (p.store.get(v.level) as number)) : 1
      const m = table.music
      if (!m) return
      const want = read(p.wire.rows, m)
      if (want === wanted) return
      wanted = want
      if (want !== null && !table.projects.includes(want)) throw new Error(`synthaudio has no project ${want}, which ${m.kind}.${m.path} names`)
      void change(want, m.fade)
    },
    async play(name: string) {
      const p = await project(name)
      if (context) begin(name, p, name, context.now())
    },
    audition(p: Project, base: string, from = 0) {
      check(p)
      if (context) begin('', p, base, context.now(), from % p.length)
      else used = p
    },
    use(p: Project, base: string) {
      check(p)
      used = p
      if (!context) return
      rigOf(p, base)
      sweep()
    },
    stop,
    playing: () => heard()?.name,
    attack(track: string, note: string, vel = 1) {
      const b = keyed(track)
      held.set(`${track} ${note}`, { track, note })
      b?.inst.attack(note, undefined, vel)
    },
    release(track: string, note: string) {
      const b = keyed(track)
      held.delete(`${track} ${note}`)
      b?.inst.release(note)
    },
    at() {
      const at = position()
      return at === null ? null : Math.floor(at)
    },
    position,
    project: () => heard()?.project,
    held: () => [...held.values()],
    quiet(tracks: string[]) { quiet = new Set(tracks) },
    close() {
      if (!context) return
      stop()
      for (const r of rigs.values()) dropRig(r)
      rigs.clear()
      for (const n of [fader, volume]) n?.dispose()
      off()
      void context.close()
    },
  }
}
