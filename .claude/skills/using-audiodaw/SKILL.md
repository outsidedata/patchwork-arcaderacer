---
name: using-audiodaw
description: Use in core, or any clone of it, whenever audiodaw comes up - the Tone.js song plugin (`plugins/audiodaw/`), a project (`rack` of devices, `tracks` of patterns, `clips`, `buses`, `master`, `loop`, `span`), an instrument's `voices`, a drum kit's pads, effects and sends, writing a song as data and playing it, a game playing a song behind its play, and `world.audiodaw` (`lookAhead`, `latencyHint`). Also when a song stutters, chokes, crackles or drops notes, when it plays in a studio page and not in a game, when nothing is heard until a key is pressed, or when a page full of synths is slow.
---

# Using audiodaw

audiodaw plays a song through Tone.js. The song is plain data, a project, and the plugin turns it
into Tone objects and plays them. It has no row and no server half that runs: a song is heard on
the page alone, and nothing of it goes down the wire. The facts are the headers of
`plugins/audiodaw/audiodaw.sim.ts` (the data and every edit of it) and
`plugins/audiodaw/audiodaw.plugin.ts` (the Tone side), and the tests beside them.

## The project

A project is one JSON object (`Project` in `audiodaw.sim.ts`):

- `bpm`, `timeSignature`, `swing`, `swingSubdivision`, `ppq`: Tone's transport. Every time in the
  project is a tick at `ppq`.
- `rack`: the devices that sound. A device is an `instrument`, its `effects` in order, its
  `channel` (`volume`, `pan`, `mute`, `solo`) and its `sends` (bus name to dB).
- `tracks`: values sent to things that sound, sounding nothing of their own, in one list of two
  kinds in the order the user keeps them.
  - A note track (`kind: 'notes'`): its `target` is the index of the device it plays; any number of
    tracks target one device and share its voices. It holds `patterns` by name, each
    `{ length, from?, notes }`, a note `{ time, note, duration, velocity }` with `note` in Tone's
    names ("C4").
  - An automation track (`kind: 'automation'`): its `target` is one `Knob`, an instrument's or an
    effect's option at its path in Tone's options, a channel's volume or pan, or a send. Its
    patterns hold automation notes `{ time, duration, points }`, each point `{ at, value, shape }`:
    `at` a tick from the note's start (the first at 0, the last at its duration), `value` from 0 to
    1 of the knob's travel, `shape` how the line reaches it (`linear`, `exp`, `step`). Moving or removing a
    device, an effect, a bus or a send keeps every knob on its thing, or leaves the track with no
    target when its thing is gone.
- `clips`: `{ track, pattern, start }`, a pattern placed on the song once, from its `from` to its
  `length`. A pattern longer than its run is placed again at its end.
- `buses`: return channels with effects (an echo, a room), fed by the devices' sends.
- `master`: the volume and effects every sound goes out through.
- `loop`: `{ start, end }` in ticks, where the transport loops when the cycle is on.
- `span`: where the song starts and stops; with none, from 0 to the last clip's end.

Every `options` is Tone's own constructor object, untranslated, so Tone's docs are the docs of
every knob.

## Instruments and voices

An instrument is `{ is, voices?, options }`: `voices` of `new Tone[is](options)`, 1 when left out.
The plugin's `synth` makes all of them when the song loads, into one Gain, and keeps them until the
song is thrown away. Nothing is made or freed while the song plays. Each note goes to the next voice
in turn, the first again after the last, whatever that voice was playing; a note let go lets go of
the voice last struck with it. No note is ever dropped.

A drum kit is `{ is: "DrumKit", options: { pads, volume } }`, one Tone drum per pad, keyed by the
note that strikes it, each with a `pitch` (none for a NoiseSynth) and optionally a `choke` group.
A kit has no `voices`: each pad is one voice.

So what a song costs is known before it plays: the sum over its devices of voices times what one
voice is. Conserve them:

- **Every voice runs from load to unload.** Tone's signals inside a synth are always-on nodes, so a
  voice costs the audio thread even while it is silent. Give a device only as many voices as its
  notes overlap: 1 for a bass, a lead or anything with `portamento` (a slide needs the same voice),
  2 for a line and its thirds, the size of the biggest chord for a pad. A chord struck while the
  last one's release still rings takes over the oldest voices and cuts their tails.
- **A fat oscillator is `count` oscillators.** `fatsawtooth` with `count: 3` is three per voice; a
  plain `sawtooth` is one. Six voices of a three-count fat saw are eighteen oscillators.
- **A MonoSynth voice carries its own filter and filter envelope**, a DuoSynth voice two whole
  MonoSynths, an FMSynth or AMSynth two oscillators; a MetalSynth pad is six FM oscillators.
- **Effects run all the time.** Freeverb is eight comb filters running in JavaScript worklets even
  in silence; Reverb is one native convolver. A Phaser is `stages` allpass filters per channel.
  Put one reverb on a bus and send to it, never one per device.
- A long `release` keeps a voice sounding into the next notes; it does not add voices, since there
  are only `voices` of them.

## Automation

An automation note holds its knob while it lasts and lets go of it at its end, when the knob goes
back to its own value (the song's, else Tone's default). Two notes on one knob at once have no rule.

- **Ranges.** A note's values are 0 to 1 of the knob's travel, so the page hands `load(project,
  ranges)` a function giving each knob's `Range` (`min`, `max`, `curve: 'log'`, `step`); `level`
  turns a value into the knob's units. A knob with no range is not automated. A studio takes them
  from the definition its faceplates are drawn with.
- **Glide or step.** Of the 255 knobs the studio shows, 119 are a Tone Param or Signal (volumes,
  pans, sends, detune, a Filter's cutoff and Q, every LFO rate and depth, wet, delay times,
  compressor and EQ settings) and glide on the audio clock, each point reached by its shape. A line
  is even along the knob's travel: on a log knob, and on a decibel knob (Tone keeps a gain behind
  it), it is a ramp of the same ratio each second; a straight ramp of a decibel Param would be
  straight in gain and jump up at its start. The other 132 are plain properties
  (envelope times, a filter envelope's base frequency, which is a synth's CUTOFF, a Phaser's or
  AutoFilter's base frequency, distortion, reverb decay) and are set on every 16th note the
  automation note covers, nothing between.
- **When a set lands.** Tone writes a setter's Param at its own `now()`, the context's time plus the
  look-ahead, so a set sent at its tick is heard a whole look-ahead late. Each step is sent the
  look-ahead before its tick.
- **Offline cannot hear a step.** `Tone.Offline` runs every transport callback before it renders, so
  a knob Tone only sets is heard at its last value for the whole render. Prove a step in a live
  context: a real-time `AudioContext` to no device (`sinkId: { type: 'none' }`), its output copied
  block by block by a `ScriptProcessorNode` on Tone's destination at each block's `playbackTime`.
- **The transport.** A play from the middle of a note, a locate and the loop's jump back take every
  knob up where the song lands; a stop or a pause puts every knob back.

## Timing: the buffer

Tone works out every note on the page's main thread and hands it to the audio thread `lookAhead`
seconds early. A page busy longer than that (drawing, loading, a long frame) hands it late, and the
song stutters or chokes mid-song. The browser's own audio buffer, `latencyHint`, is how much audio
is mixed ahead of the speaker; too small, and a heavy graph runs it dry and crackles.

Both are the scene's `world.audiodaw`, required by any scene that lists `audiodaw`:

```json
"audiodaw": { "lookAhead": 0.5, "latencyHint": 0.2 }
```

- `lookAhead`: seconds. The plugin sets both on a Tone context of its own on its first tick, before
  any song is made, so `audiodaw` is listed in `plugins` ahead of whatever loads a song.
- `latencyHint`: seconds of the browser's buffer. The browser rounds it to what it can give.
- A song that is only played back, a game's music, wants both large: nobody plays it live, and a
  bigger buffer only delays when it starts. Raise them until it no longer chokes. A page where a key
  plays a note wants them small, at the cost of a busy page stuttering.

A `dev.html` can set both live with lil-gui: `Tone.getContext().lookAhead = v` takes effect at
once. A buffer is fixed when a context is made, so a new one is `Tone.getTransport().stop()`,
`Tone.setContext(new Tone.Context({ context: new AudioContext({ latencyHint }), lookAhead }))`, then
`plugins.audiodaw.load(project)` again. Tone's own `latencyHint` option takes only the names
("interactive", "balanced", "playback"); the browser's `AudioContext` takes seconds, so the context
is made with it and handed to Tone, as the plugin does. `rawContext.baseLatency + rawContext.outputLatency` is the buffer the browser actually gave.

## The calls

`plugins.audiodaw`, the page's:

- `load(project, ranges?)`: makes every Tone object of the song and schedules its notes and its
  automation, each automated knob's travel from `ranges`. A second `load` throws the first song away.
- `edit(project)`: hands only what changed to the Tone object that holds it.
- `start()`: lets Tone's context run (`Tone.start()`). A browser allows it only after the page has
  had a key or a click; before, it stays suspended and nothing is heard.
- `play(tick?)`, `stop()`, `pause()`, `locate(tick)`, `cycle(on)` (loop on `project.loop`),
  `position()`, `playing`.
- `attack(device, note, velocity)` and `release(device, note)`: a key played live.
- `meter(on)`, `optionsOf(device)`, `effectOptionsOf(chain, i)`: what Tone holds now.
- `glides(knob)`: whether a knob sweeps (a Param or a Signal) or is set on 16ths, asked of the live
  Tone object; undefined for a knob the song does not have.
- `render(project, seconds)`: the song rendered offline.
- `dispose()`: throws the song away.

## Writing a song

A song is data, so write it the way that is easiest to read and keep, then save the project as
JSON. A script in TypeScript that builds the notes with small helpers (a note at a sixteenth, a
chord, a pattern of bars, clips filling a run of bars) and devices from named presets is the way
the longer songs are written: the form of the song stays readable as code, and the project it
returns is plain data. The script lives beside the JSON it writes, in the game's `assets/`, as every
file a game reads is kept beside what it is made from (`bringing-in-art`), and the game reads only
the JSON.

A script that imports Tone in node imports `#plugins/audiodaw/nodeaudio.ts` first, which puts
node-web-audio-api where a page has Web Audio. Tone's context then keeps node alive, so the script
ends with `process.exit(0)` once the file is written. It runs with
`node --experimental-strip-types <script>` from the repo's root.

## Playing a song in a game

This is the work as done to play a song behind the races of one course of a game:

1. **The song as a file.** Its project written to `games/<game>/assets/music/<song>.json` by its
   script beside it, and a `json` entry for it in the manager scene's catalogue, `"preload": true`,
   so it has landed before the course draws.
2. **A kind whose job it is.** `music.sim.ts` with no rule (`export const music: Kind = {}`), listed
   in the course's sim; its definition in the game's data file names the song, `"music": { "song":
   "<song>" }`; the course scene gets a `music` prefab (`{}`) and one `{ "is": "music" }` actor. A
   course with no such actor plays no song, so one course can have music and the rest none.
3. **Its look plays it.** `music.client.ts`, on its first frame: `plugins.audiodaw.load(json(wire,
   def(wire, 'music').song))` and `cycle(true)`. Then, on the first frame where
   `navigator.userActivation.hasBeenActive` (the page has had a key or a click), `start()` and then
   `play(0)`. Its `remove` calls `stop()` and `dispose()`, so leaving the course silences it.
   Waiting on the browser's own activation flag needs no listener of the page's.
4. **The scene lists `audiodaw`** in its `plugins` and gives `world.audiodaw` with a large buffer,
   since nothing in a race plays a note live.
5. **Checked in Chrome**: the course entered with a real Enter key (a scripted `resume()` never
   unlocks audio), `AudioScheduledSourceNode.prototype.start` wrapped by a readout to count the
   sources started, and the count read twice, seconds apart. It climbs while the song plays; Tone's
   always-on nodes start once when the song loads, so one count alone proves nothing.

## What goes wrong

- **A song chokes mid-song, plays fine at first.** The page was busier than `lookAhead`, or the
  buffer ran dry. Raise `world.audiodaw`'s two numbers before touching anything in the song. Cutting
  voices does not fix a song whose notes arrive late.
- **Nothing is heard.** The context is still suspended: `start()` ran before the page had a key or
  a click, or never ran.
- **A scene lists `audiodaw` and throws reading `lookAhead`.** It gives no `world.audiodaw`.
- **The page is slow with the song loaded and stopped.** Every voice and effect runs from load:
  count voices times oscillators, and the effects (Instruments and voices).
- **A slide does not glide.** The device has more than one voice, so the next note took another
  voice. A sliding line is `voices: 1`.
- **A game imports a studio's song code.** A game reads the project JSON only; the script that
  builds it is kept beside the JSON and run by hand.
