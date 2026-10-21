# audio

Game sound: one-shot sound effects raised by the rules and heard by every seat, placed in 3D or
panned in 2D, ambient loops driven by a field, music that crossfades, loops held on every row of a
kind (a motor, a weapon's hum), guns heard as layered stems mixed by distance, and a volume read
from the store.

## Why use it

A sound is heard, never read by a rule, so it is not a row. audio lets a rule say once "this cue,
here, from this row" and every page plays it, the same pick on every seat. Use it for footsteps,
shots, hits, pickups, explosions, UI clicks raised by the server, rain and wind beds, engine hums,
and background music.

## How it works

**Server half (`audio.sim.ts`): the ledger.** The scene has one row of kind `audio`. Its prefab is
`step`, `next` and `live` and nothing else. `sound(w, cue, at?, from?, t?)` appends an entry
`{ id, cue, at?, from?, step, t? }`; the ledger counts its own steps in its `before` and drops an
entry once `world.audio.hold` seconds have passed, so a page that takes two packets in one frame
still sees it.

- Given `from` and no `at`, the entry is placed at that row's `pos` as it stands, so it still plays
  where it was raised after the row is gone.
- A sound `from` a `player` row goes on that row's own `voiced` list instead of the ledger. A page
  that runs ahead draws its own player row from its copy, so the seat's own jump or shot is heard the
  frame after the key.
- `t` is the seconds into its step a sound happens, for a gun firing several rounds a step.
- The act `play(cue, x, y, z, from)` is `sound` for another plugin's row, through `w.call`. No seat
  may send it.
- `chance(w, id, odds)` is a roll for row `id` this step from a hash of the id and the ledger's step,
  the same on every machine, which moves no roll of the scene's generator.

List the ledger's actor before any actor that raises a sound in its own `before`, or the entry is
stamped a step early.

**Browser half (`audio.plugin.ts`).** One `AudioContext`, made with the client; the loader decodes
every `sound` entry through it. After every actor has ticked:

- Each ledger entry and each `voiced` entry plays exactly once, the first frame it is seen. Entries
  already on the list the first frame a page sees it are not played, so a seat that joins late
  hears nothing raised before it came. An entry seen while the context is locked, or before its
  sound has loaded, is dropped.
- The sound and its playback rate are picked from the cue by a hash of the entry's id, so every seat
  hears the same pick.
- The listener is render3d's camera (a `PannerNode` with `world.audio.space`), else render2d's view
  (a `StereoPannerNode` panned across the canvas and faded with `world.audio.screen` by pixels off
  the edge of the view), else none, and everything plays unplaced.
- A placed sound follows the `pos` of its `from` row while the row is there.
- Loops follow a field on the first row of a kind, or the listener's height, through `over` to
  `gain`; a named loop plays the sound a field names and crossfades on change (music).
- Held loops (`held`) run on every row of a kind while a field is over 0, placed on the row, gain
  and rate ramped from the field, faded out when it drops to 0 or the row ends.
- A gun cue reads a stems manifest and plays every stem of one variant, each stem's level eased
  between `near` and `far` by the listener's distance; the next round from the same row chokes the
  stems `mix.choke` names, so a burst sounds like one gun.
- The context resumes on the first pointerdown or keydown.

Node has no Web Audio: a client made there plays nothing, so a game's node tests run with audio
listed.

## Using it

1. List `audio` in the scene's `plugins`, add one `audio` row to `actors` (its prefab `{ "step": 0,
   "next": 0, "live": [] }`), and put each sound file in the loader catalogue as a `sound` entry.
2. Give the scene `world.audio`:
   - `hold`: seconds an entry stays on the ledger.
   - `space`: `{ model, ref, max, rolloff }`, the 3D distance fade in metres (render3d).
   - `screen`: the same four in canvas pixels (render2d).
   - `cues`: name to `{ sounds, gain, rate?, range?, cut? }`, or to `{ gun, gain, rate?, range? }` for
     a stems manifest (a loader `json` entry the library's `sounds/sounds.mjs` writes).
   - `loops`: `{ sound, field: { kind, path }, over, gain, loop? }`,
     `{ sound, listener: "height", over, gain, loop? }`, or `{ named: { kind, path }, fade, loop? }`.
     `loop` is the `[start, end]` region that repeats, for a song with an intro.
   - `held`: name to `{ kind, field, sound, over, gain, rate?, range? }`.
   - `volume`: `{ level, muted }`, the store keys the volume and mute are read from.
3. In a rule, `sound(w, 'jump', undefined, me.id)` raises a cue from a row, `sound(w, 'boom', pos)` at
   a point.
4. Other plugins on the page use `plugins.audio.hold(plugins, buffer, { rate, gain, at?, range? })`
   for a sound kept going (it returns `{ set, put, stop }`), `once(plugins, buffer, ...)` for a sound
   played once now, and `stream({ rate, lead, most })` for samples made as the page goes (a sound
   chip): `push(samples)` joins each block to the last with no gap, `close()` stops it.

## Plugins it works with

- **loader**: decodes every `sound` entry, and a gun's manifest and stem files, through audio's
  context.
- **render3d** / **render2d**: whichever the scene has is the listener.
- **store**: the volume and mute, by the keys `world.audio.volume` names.
- **cutscene**: the mod `audio.cutscene.ts` (`world.cutscene.mods: { play: 'audio' }`) sounds a
  cutscene's sound and voice cues through the ledger.
- **box3dvehicle**: the mod `audio.box3dvehicle.ts` (`world.box3dvehicle.mods: { sound: 'audio' }`)
  plays each car's engine loops through audio's context, listener and volume.

## Keywords

sound, sound effects, SFX, audio, Web Audio, AudioContext, PannerNode, StereoPannerNode, spatial
audio, positional audio, 3D sound, stereo pan, distance attenuation, rolloff, listener, cue, ledger,
one-shot, loop, ambient, ambience, music, crossfade, intro loop, loopStart, loopEnd, engine hum,
held loop, gun sound, stems, near far mix, choke, burst, volume, mute, footsteps, late join, `sound`,
`chance`, `voiced`, `hold`, `once`, `stream`, `world.audio`
