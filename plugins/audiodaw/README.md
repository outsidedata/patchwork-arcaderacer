# audiodaw

A song sequencer on Tone.js, laid out like a DAW (Ableton's MIDI and instrument tracks): a rack of
instruments with effect chains, channels, sends and buses, note tracks and automation tracks of
patterns placed on the song as clips, a drum kit, presets, play, stop, loop and locate on Tone's
Transport, and offline render.

## Why use it

Use audiodaw when a page plays or builds music: a song a game plays in the background, a music
toy, a tracker or a studio page where notes, clips, instruments and knobs are edited while the song
plays. The song is plain data (`Project`), every edit is a pure function that hands back a new
project, so undo is the project before, and the page plays whatever project it is handed.

## How it works

audiodaw has no row and runs only in the page. `audiodaw.sim.ts` is the song and its edits;
`audiodaw.plugin.ts` makes the Tone objects and plays them.

**The song (`audiodaw.sim.ts`).** A `Project` holds `bpm`, `timeSignature`, `swing`,
`swingSubdivision`, `ppq`, an optional `loop` and `span`, and:

- `rack`: devices, each a Tone instrument (`voices` of `new Tone[is](options)` played in turn, or a
  `DrumKit` of pads, each pad a Tone drum on one note with an optional choke group), its effects in
  order, its `Tone.Channel` (`volume`, `pan`, `mute`, `solo`) and its sends to buses.
- `tracks`: note tracks (`kind: 'notes'`) that send their notes to the device they `target`, and
  automation tracks (`kind: 'automation'`) that drive one `Knob`: an instrument's option, an
  effect's, a channel's volume or pan, a send, a bus's or the master's.
- Patterns per track (`length`, `from`, notes), and `clips` that place a pattern on the song once
  at a tick. Trimming a pattern trims every clip of it and hides notes, never deletes them.
- `buses` and `master`, each with effects.

Every `options` is Tone's own constructor object, untranslated. Edits include `addNote`,
`moveNote`, `removeNote`, `addClip`, `moveClip`, `moveClipsTo`, `removeClip`, `addTrack`,
`moveTrack`, `setTarget`, `setKnob`, `addDevice`, `deviceFrom`, `loadPreset`, `setInstrument`,
`setChannel`, `setSend`, `addEffect`, `setEffect`, `turnEffect`, `moveEffect`, `addBus`, and the
automation edits (`addAutomationNote`, `addPoint`, `movePoint`, …).

**Playing it (`audiodaw.plugin.ts`).** `load(project, ranges?)` sets the Transport from the project
and makes every instrument, effect (LFOs started), channel, bus and the master chain, and one
`Tone.Part` per clip. A Part reads its track as the song is when the note falls, so muting or
retargeting while it plays is heard at the next note. `edit(project)` hands only what changed to the
Tone object that holds it (`set`, `wet = 0` for an effect turned off, channel values, a send's gain,
`part.add`/`part.remove`), and makes an instrument again only when its `is` or `voices` change. The
transport stops itself at the song's span end and lets go of every held note.

Tone's timing is `world.audiodaw`: `lookAhead` (seconds of notes handed ahead, so a busy page plays
no note late) and `latencyHint` (the browser's audio buffer), set on a Tone context of audiodaw's own
on its first tick. `retime(timing)` makes a new context on other values and makes the loaded song
again on it.

## Using it

1. List `audiodaw` in the scene's `plugins` and give `world.audiodaw: { lookAhead, latencyHint }`.
2. On the page: `plugins.audiodaw.start()` (Tone's unlock, from a click), `load(project, ranges)`,
   then `play(tick?)`, `stop()`, `pause()`, `locate(tick)`, `cycle(on)`, `position()`, `stamp()`.
3. Edit with the functions of `audiodaw.sim.ts` and hand the result to `edit(project)`.
4. Play a device live with `attack(device, note, velocity)` and `release(device, note)` (a keyboard).
5. Read Tone's current options with `optionsOf(device)` and `effectOptionsOf(chain, i)`, a level
   with `meter(on)`, whether a knob sweeps with `glides(knob)`.
6. `render(project, seconds)` renders the song offline through `Tone.Offline`.
7. Tests on node import `nodeaudio.ts` first: it puts node-web-audio-api's classes where a page has
   them, so Tone renders offline on node.

## Plugins it works with

audiodaw imports no other plugin and no plugin imports it. It makes its own Tone context, apart from
the `AudioContext` the **audio** plugin plays sound effects through.

## Keywords

music, song, sequencer, DAW, Ableton, MIDI, tracker, piano roll, notes, patterns, clips, arrangement,
timeline, Tone.js, Transport, Part, synth, polyphony, voices, drum machine, drum kit, pads, choke
group, closed hat, open hat, instrument, preset, effects chain, reverb, delay, chorus, filter,
compressor, EQ, channel, volume, pan, mute, solo, send, bus, master, automation, envelope, knob,
sweep, step, look-ahead, latency, offline render, bpm, swing, ppq, loop, `load`, `edit`, `play`,
`render`, `world.audiodaw`

## Automation: what sweeps and what steps

An automation track holds one knob through its automation notes, each a line of points from 0 to 1
of the knob's travel. How that line reaches the knob depends on what Tone holds at the knob's path.

### How a knob is sorted

audiodaw keeps no list. When an automation note plays, `reach` in `audiodaw.plugin.ts` walks the
knob's path on the live Tone object (every voice of a synth, the drum of a kit's pad, the effect,
the channel or the send) and looks at what is there:

- **A Tone `Param` or `Signal` on every object: it sweeps.** At the note's first tick the whole line
  is scheduled on the audio clock, each point reached by its shape (linear, exp, step). The line is
  even along the knob's own travel: on a knob of the log curve, and on a decibel knob (Tone keeps a
  gain behind it), the ramp is of the same ratio each second; on any other it is straight. An exp
  segment is drawn as 16 short ramps along its bend.
- **Anything else (a plain property, or a getter and setter): it steps.** It is set on the note's
  first tick and on every 16th note of the song the note covers, to the line's value there, with
  nothing in between, and set back to its own value at the note's end.

So a knob added later, a new effect or a preset with another oscillator is sorted by Tone itself,
with nothing to keep up to date. A page asks the same question with `glides(knob)`: true for a
sweep, false for a step, undefined for a knob the loaded song does not have.

### When a step lands

Tone writes a setter's Param at its own `now()`, which is the context's time plus the look-ahead. A
set sent at its tick is therefore heard a whole look-ahead late (0.5 s at a look-ahead of 0.5). Each
step is sent the look-ahead before its tick, from a transport event that many ticks early, and
lands on it. Measured: sent at its time, heard 0.50 s late; sent a look-ahead early, heard on time.

A transport callback runs 250 to 500 ms before its time at a look-ahead of 0.5; a set made inside
it is early by that much plus late by the look-ahead.

### Offline cannot hear a step

`Tone.Offline` runs every transport callback before it renders any audio, up to 2.8 s ahead, so a
stepped knob is heard at its last value for the whole render. Sweeps render offline correctly. A
step is proven in a live context: a real-time `AudioContext({ sinkId: { type: 'none' } })` wrapped
in a `Tone.Context`, its output copied block by block by a `ScriptProcessorNode` on Tone's
destination at each block's `playbackTime`.

### Which knobs sweep and which step

Every numeric option of every Tone class audiodaw makes an instrument or an effect from, read off
each made object's `get()`, with a channel's volume and pan and a send: 255 options, **119 sweep,
132 step**, and 4 are not on the object at all (Tone takes them only when it makes the object, so
audiodaw makes the effect again to change them).

#### Sweep (a Param or a Signal)

| Owner | Options |
| --- | --- |
| Every instrument | `volume`; `detune` (all but NoiseSynth and PluckSynth) |
| MonoSynth | `filter.Q`, `filter.detune`, `filter.gain`, `oscillator.detune`; `filter.frequency` and `oscillator.frequency`, which the filter envelope and the note drive |
| FMSynth | `harmonicity`, `modulationIndex` |
| AMSynth | `harmonicity` |
| DuoSynth | `vibratoAmount`, `vibratoRate`, `harmonicity`; each voice's `filter.Q`, `filter.detune`, `filter.gain`, `oscillator.detune` (and its driven `filter.frequency`, `oscillator.frequency`) |
| Every effect with a mix | `wet` |
| BitCrusher | `bits` |
| Chorus | `feedback`, `frequency` |
| Phaser | `frequency`, `Q` |
| Tremolo | `frequency`, `depth` |
| Vibrato | `frequency`, `depth` |
| AutoFilter | `frequency`, `depth`, `filter.Q` |
| AutoPanner | `frequency`, `depth` |
| AutoWah | `Q`, `gain` |
| FrequencyShifter | `frequency` |
| PitchShift | `feedback`, `delayTime` |
| FeedbackDelay, PingPongDelay | `feedback`, `delayTime` |
| Freeverb, JCReverb | `roomSize` |
| StereoWidener | `width` |
| Filter | `frequency`, `Q`, `detune`, `gain` |
| EQ3 | `low`, `mid`, `high`, `lowFrequency`, `highFrequency` |
| Compressor | `threshold`, `ratio`, `attack`, `release`, `knee` |
| MultibandCompressor | `lowFrequency`, `highFrequency`; each band's `threshold`, `ratio`, `attack`, `release`, `knee` |
| Limiter | `threshold` |
| A channel, a bus, the master | `volume`, `pan` (the master has no pan) |
| A send | its level (a `Gain` in decibels) |

#### Step (set on 16ths)

| Owner | Options |
| --- | --- |
| Every synth with an amp envelope | `envelope.attack`, `.decay`, `.sustain`, `.release`; `portamento` (not NoiseSynth) |
| Every oscillator | `phase`, `partialCount`; a fat oscillator's `count` and `spread` |
| MonoSynth, each DuoSynth voice | `filterEnvelope.attack`, `.decay`, `.sustain`, `.release`, `.baseFrequency` (the CUTOFF), `.octaves`, `.exponent`; `filter.rolloff` |
| FMSynth, AMSynth | `modulation.phase`, `modulation.partialCount`; `modulationEnvelope.attack`, `.decay`, `.sustain`, `.release` |
| MembraneSynth | `octaves`, `pitchDecay` |
| MetalSynth | `harmonicity`, `modulationIndex`, `octaves`, `resonance` |
| NoiseSynth | `noise.fadeIn`, `noise.fadeOut`, `noise.playbackRate` |
| PluckSynth | `attackNoise`, `dampening`, `resonance`, `release` |
| Distortion | `distortion` |
| Chebyshev | `order` |
| Chorus | `delayTime`, `depth`, `spread` |
| Phaser | `octaves`, `baseFrequency` |
| Tremolo | `spread` |
| AutoFilter | `baseFrequency`, `octaves`, `filter.rolloff` |
| AutoPanner | `channelCount` |
| AutoWah | `baseFrequency`, `octaves`, `sensitivity`, `follower` |
| PitchShift | `pitch`, `windowSize` |
| Freeverb | `dampening` |
| Reverb | `decay`, `preDelay` (each set makes its impulse again) |
| Filter | `rolloff` |
| Gate | `threshold`, `smoothing` |

#### Not on the object (the effect is made again)

Phaser `stages`; Vibrato, FeedbackDelay and PingPongDelay `maxDelay`.

### Ranges

A note's values are 0 to 1 of the knob's travel. The page hands `load(project, ranges)` a function
giving each knob's `Range` (`min`, `max`, `curve: 'log'`, `step`), and `level` in `audiodaw.sim.ts`
turns a value into the knob's units. A knob with no range is not automated. A knob's own value, the
one it goes back to at a note's end, is the song's option at its path, else Tone's default for it.
