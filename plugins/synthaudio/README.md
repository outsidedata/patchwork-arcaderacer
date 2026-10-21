# synthaudio

Music as notes on Tone.js: songs as one project file each (tracks of synth, monosynth, FM synth,
pluck, drumkit or sampler instruments, patterns of notes on a sixteenth-note grid, clips that place
them, a master compressor and limiter with echo and room sends), played as background music chosen by
a row's field and changed on the bar line with a fade, and played live by the page's keys.

## Why use it

Use synthaudio for a game's music made of notes rather than recordings: a chiptune soundtrack, music
that changes with the level or the danger, a rhythm game, a playable instrument, a music toy. A note
is sound, which no rule reads, so it is the page's; a row's field picks the song, so every seat hears
the one the game is in.

## How it works

**The project (`synthaudio.sim.ts`).** `{ bpm, length, master, tracks }`, time in sixteenth notes (16
to a bar), the song looping over `length`.

- `master`: `compressor { threshold, ratio, attack, release }`, a `limiter`, `echo { time, feedback }`
  and `room { decay }`.
- A track is `{ instrument, patterns, clips }`. An instrument is `{ is, params, presets, loaded }`:
  `is` one of `synth`, `monosynth`, `fmsynth`, `pluck`, `drumkit`, `sampler` (`INSTRUMENTS` fixes its
  params: `wave`, ADSR, `cutoff`, `resonance`, `harmonicity`, `modulation`, `brightness`, `pads`,
  `samples`, and every track's `echo`, `room`, `gain`, `pan`); `presets` its own bank.
- A pattern is `{ length, notes }`, each note `[sixteenth, note, length, velocity]` (a pad's name on a
  drumkit); a clip is `[sixteenth, pattern, repeats]`.
- `check(project)` throws naming where a file goes wrong; `flatten(project)` is every note played, in
  time; `samples(project)` every sample path.
- Edits change the project in place and check what they are handed: `addTrack`, `removeTrack`,
  `renameTrack`, `changeInstrument`, `load` and `keep` (presets), `set`, `setPad`, `addPattern`,
  `resizePattern`, `addNote`, `setNote`, `removeNote`, `step`, `addClip`, `setClip`, `removeClip`,
  `setSong`. Undo is a copy of the project before.

**Playing (`synthaudio.plugin.ts`).** No server half that runs and no row. Its numbers are
`world.synthaudio`: `projects` (loader `json` entries), `music: { kind, path, fade? }` (the field on
the first row of a kind naming the project to play; a change lands on the next bar line, faded over
`fade` seconds), and `volume: { level, muted }` (store keys). Each track's instrument is built on Tone
from its `is` and `params` (a PolySynth of Synths, a MonoSynth with a lowpass, an FM PolySynth, a
PluckSynth, a drumkit of Membrane, Metal, Noise or sample voices, a Sampler), out through gain and
pan with sends to the echo and room, then the compressor, limiter, fade and volume. Only a track whose
`is` or `params` changed is rebuilt. Samples are fetched with the loader's `beside`, next to the
project's file.

It hands a page `play(name)`, `stop()`, `playing()`, `audition(project, base, from?)`,
`use(project, base)`, `attack(track, note, vel?)`, `release(track, note)`, `at()`, `position()`,
`project()`, `held()` and `quiet(tracks)` (mute and solo). Each client has its own Tone context; in node
there is none and nothing plays. The context resumes on the first pointerdown or keydown.

## Using it

1. Write each song as a project `json` file and catalogue it, with its samples beside it.
2. List `synthaudio` in `plugins` and give `world.synthaudio: { projects, music?, volume? }`.
3. For music that follows the game: `music: { kind: 'level', path: 'song', fade: 1 }`, and the level
   row's `song` field names the project.
4. For a playable instrument: `use(project, base)`, then `attack` and `release` from key handlers.

## Plugins it works with

- **loader**: the project files and their samples (`beside`).
- **store**: the volume and mute, as audio reads them.
- **audio** plays sound effects and recorded music; **audiodaw** is the fuller DAW-style sequencer
  with automation.

## Keywords

music, chiptune, synth, synthesizer, Tone.js, sequencer, tracker, patterns, clips, notes, sixteenth
notes, drum machine, drumkit, sampler, FM synth, pluck, presets, background music, adaptive music,
dynamic music, music change, bar line, crossfade, playable instrument, keyboard, compressor, limiter,
echo, delay, reverb, mute, solo, `play`, `stop`, `attack`, `release`, `world.synthaudio`
