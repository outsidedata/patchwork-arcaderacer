// The browser half of audio: one AudioContext, the ledger's sounds played once each where they were
// raised and heard from where the scene's renderer looks, and loops. The context is made with the
// client, and the loader decodes every `sound` entry through it (`context.decodeAudioData`), so
// nothing else touches Web Audio. Node has no Web Audio: a client made there has no context and
// plays nothing, so a game's node tests run with audio listed.
//
// Its numbers are the scene's `world.audio`, which a child scene inherits from the manager's
// (`addons/scenemanager`). The ledger row carries none of them, and this half reads only the row's
// `next` and `live`.
//   hold    the seconds an entry stays on the ledger, read only by the server half (`audio.sim.ts`).
//   space   { model, ref, max, rolloff }: how a placed sound fades with distance where render3d's
//           camera listens: a PannerNode's distanceModel, refDistance, maxDistance and
//           rolloffFactor, in metres. A scene that places a sound under render3d gives it.
//   screen  { model, ref, max, rolloff }: the same four where render2d's view listens, the distance
//           measured in the canvas's pixels from the edge of the view (below). A scene that places
//           a sound under render2d gives it.
//   cues    name to { sounds, gain, rate?, range?, cut? }: `sounds`, loader `sound` names, one of
//           which each entry plays; `gain`; `rate` [lo, hi], the playback rate, 1 without it;
//           `range`, the distance this cue fades out over in place of the listener's `max`, in the
//           listener's unit, metres or pixels; `cut`, whether it stops the last sound still playing
//           from the same row.
//   loops   name to one of:
//           { sound, field { kind, path }, over [lo, hi], gain [lo, hi], loop? }: `path` is fields
//             joined by dots (`"mix.rain"`), read off the first row of `kind`, 0 while there is none;
//           { sound, listener: "height", over, gain, loop? }: the listener's height in place of a
//             field: render3d's camera's, and 0 under any other listener;
//           { named { kind, path }, fade, loop? }: the sound the field names, or none, crossfaded
//             over `fade` seconds when it changes: music.
//           `loop` is the region of the sound that repeats, [start, end] in seconds, Web Audio's
//           `loopStart` and `loopEnd`: the sound plays from 0, and once it reaches `end` goes back
//           to `start` for good, as a song with an intro does. A named loop gives it per sound, name
//           to [start, end], since its field names one song now and another later. A sound given
//           none repeats whole, as Web Audio repeats one whose region ends at or before its start.
//   volume  { level, muted }: the names of the store keys the volume is read from. Without it, or
//           without a store, the volume is 1.
//
// The listener is whichever renderer the scene has: render3d's camera, else render2d's view of a
// world (a scene with a `world.render2d`), else none, and a scene with none hears every sound
// unplaced.
//
// Each frame, after every actor has ticked:
// - The loader is asked for every sound the cues and loops name, on the first frame.
// - Under render3d, the Web Audio listener takes the camera's pose, set directly.
// - Each entry plays exactly once: the ledger's, and each `player` row's own (`voiced`, which a sound
//   raised `from` a player row rides on: `audio.sim.ts`). The seat's own player row is drawn from the
//   copy that runs ahead, so its sounds play the frame after the key; another seat's come with its
//   row in the packets. The entries a list holds the first frame this page sees it are never played,
//   so a seat that arrives late hears nothing raised before it came; each later entry plays the first
//   frame it is seen. An entry seen while the context is still locked, or before its sound
//   has landed, is let go without playing: played later, it would sound where nothing is happening.
// - The sound is picked from `sounds` by a hash of the id, and `rate` the same way, so every seat
//   hears the same pick.
// - A placed sound sits on the `pos` of its `from` while the frame's rows hold that row, and stays
//   where it last was once the row has gone; with no such row it sits at its `at`. An entry with
//   neither plays unplaced. It is put where it sits before it starts, so it never sweeps in from
//   elsewhere, and again every frame while it plays.
// - Under render3d it plays through a PannerNode at that point, with `space`'s numbers.
// - Under render2d it plays through a StereoPannerNode and a gain. The point is taken to the canvas
//   by render2d's `project`, through the camera as it stands this frame. Its pan is its x across the
//   canvas, the `engine` prefab's `width`: the left edge full left, −1, the right edge full right,
//   1, the middle centred, and a point past an edge as far as that edge. Its gain is `screen`'s
//   distance model, the formula a PannerNode's would be, at the distance in canvas pixels from the
//   point to the nearest point of the canvas, `width` × `height`: 0 anywhere on the view, so a
//   sound on screen plays whole and one off it fades with how far off it is.
// - A loop's gain follows its field, or the listener's height, through `over` to `gain`, clamped to
//   the ends. The numbers move once a step, so each new gain is ramped with `setTargetAtTime` over a
//   time constant of one `engine.dt`. A loop starts once its sound has landed, and a named loop's
//   new sound from its start, 0 s.
// - The volume is the store's, 0 while muted, on the one gain every sound goes out through.
//
// `audition(plugins, what)` is the editor's: a catalogue sound by name, or a cue, played once and
// unplaced, the cue's sound and rate picked as an entry's are, by a hash of a count of auditions.
//
// `hold(plugins, buffer, { rate, gain, at?, range? })` is a sound another plugin keeps going for as
// long as something it draws is there, as box3dvehicle keeps each car's engine, through audio's mod for
// it (`audio.box3dvehicle.ts`): `buffer` repeated whole from now, at playback rate `rate` and gain
// `gain`, through the volume. With `at` it is placed there for the listener the scene has, as a placed
// cue is, `range` standing in for the listener's `max` as a cue's does; with no listener, or no `at`,
// it plays unplaced. It hands back the held sound: `set(rate, gain)` sends both toward new values,
// ramped with `setTargetAtTime` over a time constant of one `engine.dt`, as a loop's gain is; `put(at)`
// places it again; `stop()` fades it out over the same time constant and stops it five of them later,
// so it ends with no click. Where there is no context it hands back undefined.
//
// `once(plugins, buffer, { rate, gain, at?, range? })` is a sound another plugin plays once, now, as
// legs3d plays each foot of a mech landing through audio's mod for it: `buffer` played whole a single
// time at playback rate `rate` and gain `gain`, through the volume, placed at `at` as `hold` places a
// held sound, and left where it was put. It is let go while the context is locked, as an entry is, so
// a page that unlocks late never hears every sound it was handed at once; where there is no context it
// does nothing.
//
// `stream({ rate, lead, most })` is sound a page makes as it goes rather than a file's: a machine's
// sound chip, say, whose samples come a frame's worth at a time. Each block `push` hands it, `rate`
// samples a second, plays unplaced through the volume every sound goes out through, starting where
// the last block ends, so the blocks join with no gap. A block that comes after the last has run
// out starts `lead` seconds ahead of the context's clock, so the next frame's block, a little late,
// still joins it; a block that would start more than `most` seconds ahead is let go, so a page whose
// frames run faster than the context's clock never builds up a delay. A block is let go while the
// context is locked, or where there is none. `close` stops the stream's blocks still playing.
//
// The context resumes on the first pointerdown or keydown on the page. The listeners come off once
// the context runs, by that or on its own, as it does a moment after it is made on a page that lets
// audio play; a context running at once puts none on the page. `close` stops every sound and loop,
// takes the listeners off the page, and closes the context.
import { seeded } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Entry } from './audio.sim.ts'

type Range = [number, number]
type Field = { kind: string; path: string }
export type Space = { model: DistanceModelType; ref: number; max: number; rolloff: number }
export type Cue = { sounds: string[]; gain: number; rate?: Range; range?: number; cut?: boolean }
export type Loop =
  | { sound: string; field: Field; over: Range; gain: Range; loop?: Range }
  | { sound: string; listener: 'height'; over: Range; gain: Range; loop?: Range }
  | { named: Field; fade: number; loop?: Record<string, Range> }
// How a held sound starts (`hold`), and the sound itself.
export type Holding = { rate: number; gain: number; at?: number[]; range?: number }
export type Held = { set(rate: number, gain: number): void; put(at: number[]): void; stop(): void }
export type Table = {
  hold: number
  space?: Space
  screen?: Space
  cues: Record<string, Cue>
  loops?: Record<string, Loop>
  volume?: { level: string; muted: string }
}

// A sound playing: the row it comes from, and while it is placed, the point it sits at and what puts
// it there.
type Voice = { source: AudioBufferSourceNode; from?: number; where?: number[]; put?: Put }
// What puts a placed sound at a world point, for the listener it was placed for.
type Put = (p: Plugins, where: number[]) => void
// A loop playing: its source and its gain, and the gain it was last sent toward, or for a named loop
// the name it plays.
type Playing = { source: AudioBufferSourceNode; gain: GainNode; target?: number; name?: string }

const read = (rows: Plugins['wire']['rows'], f: Field) => {
  const row = rows.find(r => r.kind === f.kind)
  return row ? f.path.split('.').reduce((o, k) => o?.[k], row.data) : undefined
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const through = (v: number, [a, b]: Range, [lo, hi]: Range) => lo + (hi - lo) * clamp((v - a) / (b - a), 0, 1)
// A PannerNode's gain at distance `d` under the distance model `s`, fading out over `max`: Web
// Audio's formulas, the rolloff of the linear one held within 0 and 1 as a PannerNode holds it.
const fall = ({ model, ref, rolloff }: Space, max: number, d: number) => {
  if (model === 'linear') {
    const f = clamp(rolloff, 0, 1)
    return max === ref ? 1 - f : 1 - (f * (clamp(d, ref, max) - ref)) / (max - ref)
  }
  if (model === 'inverse') return ref / (ref + rolloff * (Math.max(d, ref) - ref))
  return Math.pow(Math.max(d, ref) / ref, -rolloff)
}

export function audio() {
  const Context = globalThis.AudioContext
  const context: AudioContext | undefined = Context ? new Context() : undefined
  const master = context?.createGain()
  master?.connect(context!.destination)
  const sources = new Set<AudioBufferSourceNode>()
  const voices = new Set<Voice>() // every sound placed or from a row, while it plays
  const last = new Map<number, Voice>() // per row, the last sound from it still playing
  const loops = new Map<string, Playing>()
  // Every entry this page has played or let go, by the row it rides and its id, as the last frame saw
  // them; and every ledger and player row the last frame saw, so a row seen for the first time plays
  // none of what it already holds.
  let heard = new Set<string>()
  let lists = new Set<string>()
  let asked = false
  let height = 0

  let listening = false
  const unlock = () => {
    void context!.resume()
    off()
  }
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
    // A page that lets audio play starts its context suspended all the same and runs it a moment later.
    context.addEventListener('statechange', () => { if (context.state === 'running') off() })
  }

  // A source of the buffer into `out`, not yet started, repeating `region` when `loop`, the whole
  // buffer without one; `ended` runs once it has played out.
  const play = (buffer: AudioBuffer, out: AudioNode, loop: boolean, rate = 1, ended = () => {}, region?: Range) => {
    const source = context!.createBufferSource()
    source.buffer = buffer
    source.loop = loop
    if (region) [source.loopStart, source.loopEnd] = region
    source.playbackRate.value = rate
    source.connect(out)
    source.onended = () => { sources.delete(source); ended() }
    sources.add(source)
    return source
  }
  const gainInto = (value: number, out: AudioNode = master!) => {
    const gain = context!.createGain()
    gain.gain.value = value
    gain.connect(out)
    return gain
  }
  const numbers = (table: Table, key: 'space' | 'screen', listener: string) => {
    const s = table[key]
    if (!s) throw new Error(`audio has no ${key}, the numbers a sound placed where ${listener} listens fades by`)
    return s
  }

  // Where a placed sound of `cue` goes out through, for the listener the scene has, and what puts it
  // at a world point; nothing with no listener, and the sound plays unplaced.
  function spatial(p: Plugins, table: Table, cue: Cue): { into: AudioNode; put: Put } | undefined {
    if (p.render3d?.camera) {
      const s = numbers(table, 'space', 'render3d')
      const panner = context!.createPanner()
      panner.distanceModel = s.model
      panner.refDistance = s.ref
      panner.maxDistance = cue.range ?? s.max
      panner.rolloffFactor = s.rolloff
      panner.connect(master!)
      return {
        into: panner,
        put(_p, [x, y, z]) {
          panner.positionX.value = x
          panner.positionY.value = y
          panner.positionZ.value = z
        },
      }
    }
    if (p.render2d?.world) {
      const s = numbers(table, 'screen', 'render2d')
      const max = cue.range ?? s.max
      const pan = context!.createStereoPanner()
      const fade = gainInto(1)
      pan.connect(fade)
      return {
        into: pan,
        put(p, where) {
          const { width, height } = p.wire.scene.prefabs.engine
          const { x, y } = p.render2d.project(where)
          pan.pan.value = clamp((2 * x) / width - 1, -1, 1)
          fade.gain.value = fall(s, max, Math.hypot(x - clamp(x, 0, width), y - clamp(y, 0, height)))
        },
      }
    }
    return undefined
  }

  function listen(p: Plugins) {
    const camera = p.render3d?.camera
    if (!camera) return
    const { x, y, z } = camera.position
    height = y
    // The camera's forward and up, turned by its quaternion, in vectors of three's own kind.
    const f = camera.position.clone().set(0, 0, -1).applyQuaternion(camera.quaternion)
    const u = camera.position.clone().set(0, 1, 0).applyQuaternion(camera.quaternion)
    const l = context!.listener
    if (!l.positionX) {
      l.setPosition(x, y, z)
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z)
      return
    }
    l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z
    l.forwardX.value = f.x; l.forwardY.value = f.y; l.forwardZ.value = f.z
    l.upX.value = u.x; l.upY.value = u.y; l.upZ.value = u.z
  }

  function hear(p: Plugins, table: Table, e: Entry) {
    const cue = table.cues[e.cue]
    if (!cue) throw new Error(`audio has no cue ${e.cue}`)
    const die = seeded(e.id)
    const name = cue.sounds[Math.floor(die() * cue.sounds.length)]
    const rate = cue.rate ? cue.rate[0] + (cue.rate[1] - cue.rate[0]) * die() : 1
    const buffer: AudioBuffer | undefined = p.loader.get(name)
    if (context!.state !== 'running' || !buffer) return
    const from = e.from
    const where = (from !== undefined && p.wire.rows.find(r => r.id === from)?.data.pos) || e.at
    const space = where ? spatial(p, table, cue) : undefined
    if (space) space.put(p, where)
    const was = from === undefined ? undefined : last.get(from)
    if (cue.cut && was) was.source.stop()
    const voice: Voice = {
      source: play(buffer, gainInto(cue.gain, space?.into), false, rate, () => {
        voices.delete(voice)
        if (from !== undefined && last.get(from) === voice) last.delete(from)
      }),
      from,
      where,
      put: space?.put,
    }
    if (from !== undefined) last.set(from, voice)
    if (from !== undefined || space) voices.add(voice)
    voice.source.start()
  }

  function loop(p: Plugins, name: string, l: Loop, dt: number) {
    const now = context!.currentTime
    const had = loops.get(name)
    if ('named' in l) {
      const want: string | null = read(p.wire.rows, l.named) ?? null
      if ((had?.name ?? null) === want) return
      const buffer: AudioBuffer | undefined = want === null ? undefined : p.loader.get(want)
      if (want !== null && !buffer) return void p.loader.load(want)
      if (had) {
        const g = had.gain.gain
        g.cancelScheduledValues(now)
        g.setValueAtTime(g.value, now)
        g.linearRampToValueAtTime(0, now + l.fade)
        had.source.stop(now + l.fade)
        loops.delete(name)
      }
      if (!buffer) return
      const gain = gainInto(1)
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(1, now + l.fade)
      const source = play(buffer, gain, true, 1, undefined, l.loop?.[want!])
      source.start()
      loops.set(name, { source, gain, name: want! })
      return
    }
    const v = 'field' in l ? Number(read(p.wire.rows, l.field) ?? 0) : height
    const target = through(v, l.over, l.gain)
    if (had) {
      if (target === had.target) return
      had.target = target
      had.gain.gain.setTargetAtTime(target, now, dt)
      return
    }
    const buffer: AudioBuffer | undefined = p.loader.get(l.sound)
    if (!buffer) return
    const gain = gainInto(target)
    const source = play(buffer, gain, true, 1, undefined, l.loop)
    source.start()
    loops.set(name, { source, gain, target })
  }

  // What the editor plays when asked: a catalogue sound, or a cue as an entry of it would sound, once,
  // unplaced, now. Asked from a press, it resumes the context the press has unlocked.
  let auditions = 0
  async function audition(p: Plugins, what: string | Cue) {
    if (!context) return
    const cue: Cue = typeof what === 'string' ? { sounds: [what], gain: 1 } : what
    const die = seeded(++auditions)
    const name = cue.sounds[Math.floor(die() * cue.sounds.length)]
    const rate = cue.rate ? cue.rate[0] + (cue.rate[1] - cue.rate[0]) * die() : 1
    if (name === undefined) return
    const buffer: AudioBuffer = await p.loader.load(name)
    await context.resume()
    play(buffer, gainInto(cue.gain), false, rate).start()
  }

  function hold(p: Plugins, buffer: AudioBuffer, { rate, gain, at, range }: Holding): Held | undefined {
    if (!context) return undefined
    const space = at ? spatial(p, p.wire.scene.world!.audio as Table, { sounds: [], gain: 1, range }) : undefined
    if (space) space.put(p, at!)
    const level = gainInto(gain, space?.into)
    const source = play(buffer, level, true, rate)
    source.start()
    const dt = () => p.wire.scene.prefabs.engine.dt as number
    return {
      set(r, g) {
        const now = context.currentTime
        source.playbackRate.setTargetAtTime(r, now, dt())
        level.gain.setTargetAtTime(g, now, dt())
      },
      put(where) { space?.put(p, where) },
      stop() {
        const now = context.currentTime
        level.gain.setTargetAtTime(0, now, dt())
        source.stop(now + 5 * dt())
      },
    }
  }

  function once(p: Plugins, buffer: AudioBuffer, { rate, gain, at, range }: Holding) {
    if (!context || context.state !== 'running') return
    const space = at ? spatial(p, p.wire.scene.world!.audio as Table, { sounds: [], gain: 1, range }) : undefined
    if (space) space.put(p, at!)
    play(buffer, gainInto(gain, space?.into), false, rate).start()
  }

  function stream({ rate, lead, most }: { rate: number; lead: number; most: number }) {
    const playing = new Set<AudioBufferSourceNode>()
    let next = 0
    return {
      push(samples: Float32Array) {
        if (!context || context.state !== 'running' || !samples.length) return
        const now = context.currentTime
        if (next < now) next = now + lead
        if (next > now + most) return
        const buffer = context.createBuffer(1, samples.length, rate)
        buffer.getChannelData(0).set(samples)
        const source = play(buffer, master!, false, 1, () => playing.delete(source))
        playing.add(source)
        source.start(next)
        next += samples.length / rate
      },
      close() {
        for (const source of playing) source.stop()
        playing.clear()
      },
    }
  }

  return {
    context,
    audition,
    hold,
    once,
    stream,
    afterTick(p: Plugins) {
      if (!context) return
      const table = p.wire.scene.world!.audio as Table
      const loopTable = table.loops ?? {}
      if (!asked) {
        asked = true
        const names = new Set([...Object.values(table.cues).flatMap(c => c.sounds), ...Object.values(loopTable).flatMap(l => ('sound' in l ? [l.sound] : []))])
        for (const name of names) void p.loader.load(name)
      }
      const v = table.volume
      master!.gain.value = v && p.store ? (p.store.get(v.muted) ? 0 : (p.store.get(v.level) as number)) : 1
      listen(p)
      // The ledger's entries, and each player row's own (`voiced`): each plays once, the first frame it
      // is seen, but those a list already held the first frame the page saw that list.
      const now = new Set<string>(), present = new Set<string>()
      for (const row of p.wire.rows) {
        if (row.kind !== 'audio' && row.kind !== 'player') continue
        const where = `${row.id}`
        present.add(where)
        const list = row.kind === 'audio' ? row.data.live : row.data.voiced
        if (!Array.isArray(list)) continue
        for (const e of list as Entry[]) {
          const key = `${where}/${e.id}`
          now.add(key)
          if (!heard.has(key) && lists.has(where)) hear(p, table, e)
        }
      }
      heard = now
      lists = present
      for (const voice of voices) {
        const pos = voice.from === undefined ? undefined : p.wire.rows.find(r => r.id === voice.from)?.data.pos
        if (pos) voice.where = pos
        if (voice.put) voice.put(p, voice.where!)
      }
      for (const [name, l] of Object.entries(loopTable)) loop(p, name, l, p.wire.scene.prefabs.engine.dt)
    },
    close() {
      if (!context) return
      for (const source of sources) source.stop()
      sources.clear()
      off()
      void context.close()
    },
  }
}
