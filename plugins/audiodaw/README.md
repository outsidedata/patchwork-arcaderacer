# audiodaw: what automation can sweep and what it steps

An automation track holds one knob through its automation notes, each a line of points from 0 to 1
of the knob's travel. How that line reaches the knob depends on what Tone holds at the knob's path.

## How a knob is sorted

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

## When a step lands

Tone writes a setter's Param at its own `now()`, which is the context's time plus the look-ahead. A
set sent at its tick is therefore heard a whole look-ahead late (0.5 s at a look-ahead of 0.5). Each
step is sent the look-ahead before its tick, from a transport event that many ticks early, and
lands on it. Measured: sent at its time, heard 0.50 s late; sent a look-ahead early, heard on time.

A transport callback runs 250 to 500 ms before its time at a look-ahead of 0.5; a set made inside
it is early by that much plus late by the look-ahead.

## Offline cannot hear a step

`Tone.Offline` runs every transport callback before it renders any audio, up to 2.8 s ahead, so a
stepped knob is heard at its last value for the whole render. Sweeps render offline correctly. A
step is proven in a live context: a real-time `AudioContext({ sinkId: { type: 'none' } })` wrapped
in a `Tone.Context`, its output copied block by block by a `ScriptProcessorNode` on Tone's
destination at each block's `playbackTime`.

## Which knobs sweep and which step

Every numeric option of every Tone class audiodaw makes an instrument or an effect from, read off
each made object's `get()`, with a channel's volume and pan and a send: 255 options, **119 sweep,
132 step**, and 4 are not on the object at all (Tone takes them only when it makes the object, so
audiodaw makes the effect again to change them).

### Sweep (a Param or a Signal)

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

### Step (set on 16ths)

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

### Not on the object (the effect is made again)

Phaser `stages`; Vibrato, FeedbackDelay and PingPongDelay `maxDelay`.

## Ranges

A note's values are 0 to 1 of the knob's travel. The page hands `load(project, ranges)` a function
giving each knob's `Range` (`min`, `max`, `curve: 'log'`, `step`), and `level` in `audiodaw.sim.ts`
turns a value into the knob's units. A knob with no range is not automated. A knob's own value, the
one it goes back to at a note's end, is the song's option at its path, else Tone's default for it.
