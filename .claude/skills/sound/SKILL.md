---
name: sound
description: Use in core, or any clone of it, when a game needs sound or music. That covers a sound effect when something happens (a jump, a hit, a coin, footsteps, a door, a shot), sound files in the loader catalogue, the `audio` plugin's cues, its ledger and the `voiced` list a sound of the seat's own `player` row rides so it is heard the frame after the key (`sound(w, cue, at, from)`, `world.audio`), and ambient loops that follow a field or the camera's height. It also covers music that changes with the game (a named loop, `synthaudio` projects, notes played from keys, Tone.js), volume and mute as store keys, a cutscene's sounds and voice lines (`audio.cutscene.ts`), and sound placed in 3D or 2D (`space`, `screen`). Also use it when a sound plays twice, plays late, plays in the wrong place or does not play at all.
---

# Sound

Sound is the page's. No rule reads it, so no sound is ever a row. Three plugins make the sound a
game has, and the engine knows none of them:

- `audio` (`plugins/audio/`): sound files. Its server half, `audio.sim.ts`, holds the sounds the
  rules raise: which cue, from which row, at which point. A sound raised `from` a `player` row goes on
  that row's own `voiced` list; every other sound goes on the ledger, one row of its own (The rule,
  below). Its browser half, `audio.plugin.ts`, plays each entry of both once on every page, and it
  plays the loops and the music made of files. It holds the AudioContext every sound file plays through, and the loader decodes each
  `sound` entry through it, so no actor touches Web Audio.
- `synthaudio` (`plugins/synthaudio/`): notes played by Tone.js synthesizers, over an AudioContext
  each client makes of its own, with a volume gain of its own. It is the page's alone, with no row
  and no server half that runs. A page's actors play its notes directly, and a row's field can
  choose the project every seat hears.
- `store` (`plugins/store/`): every loudness: the volume, the mute, and how loud each sound a
  plugin plays is, all keys of the page's store. The server never reads them.

A cutscene's sounds reach the ledger through audio's mod for it, `plugins/audio/audio.cutscene.ts`.
The headers of those files, and the tests beside them, are where the facts are. This skill is the
work done with them.

## The rule: how loud a sound is, is the store's

How loud a sound plays is the page's alone: no rule reads it, no seat must agree on it, and the
person playing changes it, from a tuning page while the game is made and from a settings screen once
it ships. So every gain a plugin plays a sound at is a key of the store, never a number:

- A kind's definition names the key, never the gain: `"step": { "sounds": ["step"], "gain":
  "strider.step" }`, `"sound": { "engine": "diesel-engine", "gain": "diesel.engine" }`. Two kinds
  that should sound alike name the same key.
- The scene's `store` prefab starts every key, in the manager's `<game>.scene.json`, so every scene
  has it and a later scene never resets what the player set: `"store": { "strider.step": 0.45,
  "diesel.engine": 0.25 }`.
- The plugin reads the key every time it plays: `plugins.store.get(key)` as each sound starts and
  every frame for a held one, so a change is heard on the next sound and the next frame, with
  nothing rebuilt and nothing reloaded. A scene that draws the thing lists `store` before the plugin
  that reads it, and the plugin throws, naming the kind, where the scene lists none.
- A tuning page (`tune.html`, `dev.html`) and a settings screen set the key with
  `plugins.store.set(key, value)` on the page's client, and nothing else. A slider bound to a number
  in a definition is not how a loudness is changed.

What is not a loudness, a pitch, an rpm, a range, stays in the definition.

## The rule: a sound of the seat's thing rides its `player` row

Every sound is raised by a rule, with `sound(w, cue, at?, from?)`, and which list it lands on decides
when each page hears it:

- A sound of the thing a seat plays as, its jump, its shot, its hurt, its footsteps, the coin it
  takes, is raised `from` its `player` row: `sound(w, cue, undefined, me.id)` in `player.sim.ts`, or
  by the coin's rule with the id of the `player` row that took it. `sound` sees the row is a `player`
  row and puts the entry on that row's `voiced` list, not the ledger (`plugins/audio/audio.sim.ts`).
  The row needs no field for it in its prefab: `sound` makes the list, and the ledger's `before`
  takes each entry off it after `hold`, as it does its own.
- A page that runs ahead (`addons/predict`) draws every row from its copy, and the copy runs the same
  rules, so a sound a press raises, on the `player` row or the ledger, is heard on the frame after
  the key, at any lag. Every seat is sent every `player` row, so every other seat hears it too.
- A sound of any other row, a door, a monster, a barrel, a cutscene's cue, goes on the ledger, `from`
  that row or `at` a point.
- A note a player plays on their own instrument is the page's alone, and no rule raises it
  (`synthaudio`, Loops and music).

So the seat's own sound is never raised from a row of another kind, a `body` or a `gun` the `player`
row spawned, and never `at` the thing's point with no `from`: both land on the ledger, away from the
row the sound belongs to. A game
whose seat plays a row other than its `player` row folds that row into the `player` row first
(`designing-a-seat`).

## When it applies

It applies to every sound and every piece of music a game plays, and to the volume. Other skills
apply instead in these cases:

- How a press reaches the server, how keys are bound, and what a seat may send:
  `input-and-seats`. This skill restates only what a sound needs from it.
- A settings screen that shows and changes the volume: `building-the-hud`. The volume's keys and
  what reads them are here.
- Any other file in the catalogue, such as an image, a sheet or a model: `bringing-in-art`.
- A new plugin that plays sound, or a new ledger plugin: `building-a-plugin`.
- The rest of the kind that raises the sound: `designing-a-kind`.

## Where each piece goes

- The sound file goes in `games/<game>/assets/` and is an entry in the scene's loader catalogue,
  `world.loader.assets`, of type `sound`: `"knock1": { "type": "sound", "url":
  "/games/<game>/assets/knock.wav" }`. The loader decodes it through audio's AudioContext
  (`plugins.audio.context.decodeAudioData`). A scene with a `sound` entry and no `audio` in its
  `plugins` fails that entry. Nothing else fetches or decodes a sound, and no path to one is
  written in code.
- The cue table is fixed, so it goes on `world`, as `world.audio`. It never goes on the ledger's
  prefab or row, however close at hand the row is. A row is sent to every seat every step. If every
  scene of the game uses the same table, it is written once in the manager's `<game>.scene.json`.
  A child scene's `world` is the manager's with the child's own keys over it, one top-level key at
  a time. So a child that gives `audio` replaces the whole table.
- The ledger is a row, so its prefab holds only what changes: `"audio": { "step": 0, "next": 1,
  "live": [] }`, those three fields and nothing more. A scene that raises sounds has exactly one
  `{ "is": "audio" }` entry in its `actors`. `sound` throws `audio needs one ledger row, and the
  scene has N` for none or for two.
- The cue a kind plays is fixed for the kind, so it goes in the kind's definition in
  `assets/<game>.json`, as a `sounds` table of event to cue: `"player": { ..., "sounds": { "bump":
  "knock" } }`. The rule reads `def(w, me.kind).sounds.bump`.
- The volume and the mute are keys of the store. `world.audio.volume: { "level": "volume", "muted":
  "muted" }` names the keys. The scene lists `store` in its `plugins`, and `world.store` gives the
  keys their first values, `"store": { "volume": 0.8, "muted": false }`. The store has no row, and a
  plugin with no row has no prefab; `plugins/store/store.plugin.ts` reads those values off a `store`
  prefab today, and throws `scene lists store but has no store prefab` without one. So the job that
  uses the store moves them to `world.store` first, in one change, as `building-the-hud` (step 9)
  lists it, and then writes `world.store`. It is never copied as a pattern for another plugin. These
  are the store's rules, from `plugins/store/store.plugin.ts`:
  - The starting values hold every key the volume names, because `store.get` throws `store has no
    <key>` otherwise.
  - The table lives on the link the page mounted, not on a client, so it outlives every scene. A
    starting value is given to a key only while the page's table has no such key. A later scene
    never resets a volume the player changed.
  - A child scene's `world` is the manager's with its own over it, key by key, so a `world.store`
    every scene uses is written once, in the manager's `<game>.scene.json`.
  - A table with no `volume`, or a scene with no store, plays at a volume of 1.
  - `synthaudio` has a volume gain of its own. For one mute and one volume to govern both,
    `world.synthaudio.volume` names the same store keys as `world.audio.volume`.
- The song playing now changes, so it is a field of a row: the cutscene row's `music`, or a field
  of a kind of the game's whose job it is. A loop or `synthaudio`'s `music` reads that field off the
  first row of the kind it names.

## A sound a rule raises, start to finish

This is the work as done on the game `yarn new-game <game>` writes. That game is one scene, `main`,
on render2d with no world of its own (`scripts/new-game.ts` lists its files). Its
`player` row spawns a `body` and forwards `move` to it, which is never the model: the `body` is folded into the `player` row first, its fields onto the `player` prefab, its rule
into `player.sim.ts`, its look into `player.client.ts`, its definition into the `player` definition,
and `body` taken out of the sim, the scene and the test (`designing-a-seat`). The example below then
makes Space hop the seat's `player` row and knock.

1. Put the file in `games/<game>/assets/knock.wav`. A file the browser's `decodeAudioData` takes
   will work. Add its `sound` entry to `world.loader.assets` in `main.scene.json`. A cue's sound
   needs no `preload`, because audio asks the loader for every sound its cues and field loops name
   on its first frame. The server never fetches a sound: the sim half of the loader fetches only
   the file types a rule reads.
2. Write the table in `main.scene.json`:
   ```json
   "audio": {
     "hold": 0.25,
     "cues": { "knock": { "sounds": ["knock1"], "gain": 0.8 } },
     "volume": { "level": "volume", "muted": "muted" }
   }
   ```
   These fields are what each part of the table does:
   - `hold` is how many seconds an entry stays on the ledger. A page reads only the last packet of
     each frame. If an entry were on the row for one step only, a page that took two packets in
     one frame would miss it. So `hold` is longer than the longest gap between a page's frames,
     network jitter included.
   - In a cue, `sounds` lists catalogue names. Each entry plays one of them, picked by a hash of
     the entry's id, so every seat hears the same pick.
   - The other fields of a cue: `gain`; `rate`, a `[lo, hi]` range of playback rate picked the same
     way; `range`, the distance this cue fades out over in place of the listener's `max`; and `cut`,
     which stops the last sound from the same row that is still playing.
   - `volume` names the store keys the volume is read from.
   - A cue may instead be `{ gun, gain, rate?, range? }`: a round of a gun, a blast, anything heard
     as layers mixed by how far off it is. `gun` is the catalogue's `json` entry of its manifest,
     which the library's `sounds/sounds.mjs` writes beside its files, `{ mix?, variants: [{ <stem>:
     <file> }] }`; each file is read beside it through the loader on the first frame. An entry plays
     every stem of one variant, picked by the same hash, each stem as loud as `mix.stems` `[near,
     far]` makes the distance to the listener (`mix.near` and `mix.far`, in metres), and the stems
     `mix.choke` names are faded out by the next round from the same row, so a burst's echo is heard
     once (the header of `audio.plugin.ts`).
3. Put `store` and `audio` in the scene's `plugins` (here `["loader", "scenemanager", "store",
   "player", "render2d", "stats", "audio"]`). Add the `audio` prefab, and `world.store` with the volume's
   keys, the store's starting values moved there first (Where each piece goes). Put
   `{ "is": "audio" }` in `actors` ahead of every actor that raises a sound in its own `before`.
   Add the kind to the scene's sim in `main.sim.ts`: `import { audio } from
   '#plugins/audio/audio.sim.ts'` and `sim = { scenemanager, loader, audio, player, start }`.
   Name no file in the game folder after the plugin. The page loads `<kind>.client.ts` for every
   row, so a `games/<game>/audio.client.ts` would become the ledger row's actor.
4. Put the cue in the kind's definition, `"sounds": { "bump": "knock" }`, beside the kind's other
   fixed numbers (here `"hop": 24`, in the `player` definition).
5. Write the rule. The act in `player.sim.ts` changes the row and raises the cue from it, so the
   knock rides the row's `voiced` list (The rule):
   ```ts
   bump(me, w) {
     const d = def(w, me.kind)
     me.data.pos = [me.data.pos[0], me.data.pos[1] - d.hop]
     sound(w, d.sounds.bump, undefined, me.id)
   },
   ```
   `sound(w, cue, at?, from?, t?)` comes from `#plugins/audio/audio.sim.ts` and has three forms:
   - At a point: `at`.
   - From a row: `from`. The entry keeps where the row stood, and a page follows the row while it
     has it. From a `player` row it goes on that row's `voiced` list; from any other, on the ledger.
   - With neither: the sound has no place, and goes on the ledger.

   `t` is the seconds into its step the sound happens, for a rule that knows: a gun firing several
   rounds a step gives each its share of the step, and the page starts each that far into the step
   on its own clock, so the rounds keep their spacing however the packets bunch. Left out, the entry
   plays the frame it is seen.

   A cue raised twice in one step plays twice. `chance(w, id, odds)` says whether something happens
   to a row this step, from a hash, so an idle sound now and then moves no roll of the scene's die.

   A game's own kind raises its sound with `sound`, as above. Another plugin `p` never names
   audio. Audio writes a mod for it, `plugins/audio/audio.<p>.ts`, which exports `play(w, cue,
   at?, from?)` and calls the ledger's act `play` through `w.call`, as `audio.cutscene.ts` does.
   `p` asks `mod(w.world, '<p>', 'play')`, and a scene switches it on with
   `world.<p>.mods: { "play": "audio" }`. The act is `play(cue, x, y, z, from)`, with nulls for a
   missing point or row, and no seat may send it.
6. Make the press reach the act. In `player.client.ts`, the `bind` its `setup` makes for the row that
   is `mine` gets `press: { ' ': ['bump'] }`; the act is the `player` row's own, so the press names it
   straight. On `index.html` the press lands on the next step in the same tab. On `client.html`,
   which runs ahead every scene that gives `world.predict`, the copy answers the press on its next step, and the hop and the knock
   both come on the frame after the key; the other seat's page hears it when the packet with this
   seat's `player` row arrives. The knock plays once on each page: each entry plays exactly once
   (`audio.plugin.ts`).
7. Make the mute the page's. Give the mute key a function, which runs on the page and sends
   nothing: `m: () => plugins.store.set('muted', !plugins.store.get('muted'))`. Audio reads the
   store each frame, so the volume is 0 from the next frame.

What a page does with the ledger and each `player` row's `voiced` list is in the header of
`audio.plugin.ts`. These parts of it shape the work:

- Each entry plays once. The entries already on a list when a page first sees it never play, so a
  seat that arrives late hears nothing raised before it came.
- The seat's own `player` row is drawn from the copy that runs ahead, so its `voiced` entries play
  the frame after the key; another seat's come with its row in the packets; the ledger's come with
  the packets.
- An entry is let go without playing if the page sees it while the AudioContext is still locked,
  or before its sound has landed.
- The context resumes on the first `pointerdown` or `keydown` on the page, and `resume()` finishes
  in its own time. An entry that arrives before it has finished is let go, so the press that
  unlocks the context may go unheard. Whether it is heard is a race between the resume and the
  packet, not a rule. When this was tried in Chrome, the first press went unheard and the second
  was heard.
- A sound raised in an act is carried on one packet fewer than `hold`'s steps. This comes from the
  order of a step's passes: a seat's message is answered before every `before`, and the ledger
  counts its step in its own `before`, so the entry is stamped with the step before. A sound raised
  in the `before` of a row listed ahead of the ledger is stamped the same way. The scratch game this
  skill was written from counted it so.

Where a placed sound is heard depends on which renderer the scene has:

- Under render3d's camera, each placed sound plays through a PannerNode, and `world.audio.space`
  (`{ model, ref, max, rolloff }`, in metres) is required.
- Under render2d with a `world.render2d`, a placed sound is panned across the canvas and fades
  with its distance off the view, and `world.audio.screen` (the same four numbers, in canvas
  pixels) is required.
- Without either listener, as in the scene `yarn new-game` writes, every sound plays unplaced and
  neither table is read.

Audio throws `audio has no space` (or `screen`) at a placed sound under a renderer whose numbers
the table does not give.

Audio's sounds, its loops and its music go out through one gain, which is the volume. synthaudio's
notes go out through a gain of its own, which reads the store keys `world.synthaudio.volume` names.

## Loops and music

`world.audio.loops` maps a name to a loop. A loop plays once its sound has landed, and comes in
three forms:

- `{ sound, field: { kind, path }, over, gain }`: the gain follows a field of the first row of
  `kind`. `path` is fields joined by dots. The gain is clamped through `over` to `gain`, as rain
  follows a sky's mix.
- `{ sound, listener: "height", over, gain }`: the gain follows the height of render3d's camera
  through `over` to `gain`. Under any other listener the height reads 0, and the gain is what 0
  comes to through `over`.
- `{ named: { kind, path }, fade }`: music. It plays the sound the field names, or none, and
  crossfades over `fade` seconds when the field changes.

`loop: [start, end]` is the region that repeats, as a song with an intro has. A named loop gives
it per sound.

`world.audio.held` maps a name to a loop held going on every row of a kind, placed on its `pos`,
while its gain is over 0: the hum of a weapon while it fires, a motor while it turns. It is `{ kind,
field, sound, over, gain, rate?, range? }`: `field` is fields joined by dots read off the row, a
boolean read as 1 or 0; its gain is the field through `over` to `gain`, its playback rate through
`over` to `rate`. It starts the first frame the row's gain is over 0 and fades out the frame it is 0
again or the row is gone.

A cue's, a field loop's or a held loop's sound is asked for on the first frame. A named loop's sound is asked for
only when the field first names it, so give each song's catalogue entry `"preload": true`. That
way a song starts when it is named, not one fetch later.

`synthaudio` plays music as notes instead of files. A song is a project: one file, a loader
`json` entry, holding its tempo, its length, its master and its tracks, each track one instrument
(with its own bank of presets), its patterns and the clips that place them
(`plugins/synthaudio/synthaudio.sim.ts`). Its numbers are `world.synthaudio`:

- `projects`: the loader `json` entries that are projects.
- `music: { kind, path, fade? }`: the field that chooses the project. It changes on the next bar
  line, or fades when `fade` is given.
- `volume`: store keys, read as audio reads its own. Name the same keys as `world.audio.volume`
  for one mute to govern both.

A game puts a project's file in its `assets/`, with any samples it names beside it at the paths it
names them by.

A note a player plays on their own instrument is heard on their page alone. It is a key the page
handles, on a track of the project the page uses (`use`, or the one playing): `press: { a: () =>
plugins.synthaudio.attack('lead', 'C4') }` with `release: { a: () =>
plugins.synthaudio.release('lead', 'C4') }`, and no message is sent. `synthaudio` reads the
store's volume in its `tick`, so the scene lists `store` before `synthaudio`. Listed after it,
`store.get` throws `store has not ticked yet` on the first frame, but only where
`world.synthaudio.volume` is set and the page has an AudioContext. synthaudio reads nothing
without a context, so a node test never catches the wrong order.

`audiodaw` (`plugins/audiodaw/`) plays a whole song, a project of devices, tracks and clips, through
Tone.js, with every voice made when the song loads. A game plays one behind its play with a kind of
its own whose look loads it, and `world.audiodaw` sets Tone's buffer. All of it is `using-audiodaw`.

A page that makes its sound as it goes, such as a machine's sound chip, hands its samples to
`plugins.audio.stream({ rate, lead, most })` and calls `push` with each block. The numbers come
from the definition of the kind that pushes.

## A car's engine, and sound made from recipes

An engine is not a cue: it goes on for as long as the car is there, and its pitch and loudness follow
the car's row. box3dvehicle's browser half plays it, and no rule raises anything:

- The sound is made offline, from a recipe, by the library's `sounds/sounds.mjs`
  (`PATCHWORK_LIBRARY`, `~/patchwork-library`), and no one brings a recorded file. A game keeps a
  spec, `assets/<game>.sounds.json`, naming each sound and its species (`species/<name>.json` in
  the library: a two-stroke single, an inline four, cross- and flat-plane V8s, a V12, a straight-six
  and a V8 diesel, an electric motor). Its bake writes the files into `assets/sounds/` with
  `sounds(spec, out)`, imported from the library as a bake imports its other tools, and commits them
  with the spec and the bake. `yarn sounds <spec> <out>` in the library does the same by hand;
  `yarn sounds:all <out>` makes every species to listen to.
- An engine is loops held at several rpms, in stems: `on` (the exhaust under load), `off` (the
  overrun), `intake`, `mech`. Beside them the bake writes the engine's manifest,
  `<sound>.engine.json`: its layers' rpms, each stem's file, and its default `mix` (each stem's gain
  from throttle shut to full, and `ease`).
- The scene names the manifest once in its catalogue, a `json` entry, and the car names it:
  `look.sound: { engine: "<entry>", at?, range?, stems?, ease? }`, with `world.box3dvehicle.mods:
  { sound: "audio" }` and `audio` in the scene's `plugins` with a `world.audio` table (its `space`
  places the engine under render3d). The scene lists no WAV: box3dvehicle reads each file beside the
  manifest through the loader (`beside`) and decodes it through audio's mod, `audio.box3dvehicle.ts`.
  `stems` and `ease` lie over the manifest's mix, one stem at a time, only where the scene changes
  them. The whole of it is the header of `plugins/box3dvehicle/box3dvehicle.plugin.ts` (`sound`).
- Each stem's loop nearest the row's `rpm` plays pitched by the rpm over its own, crossfaded into the
  next at equal power, as loud as its `[shut, full]` gain at the heard throttle, which follows the
  row's throttle by e every `ease` seconds.
- audio's `hold(plugins, buffer, { rate, gain, at?, range? })` is what plays it: a sound another
  plugin keeps going, placed for the scene's listener, `set(rate, gain)` ramped over a step, `put(at)`,
  and `stop()` faded out. Its sibling `once(plugins, buffer, { rate, gain, at?, range? })` plays a
  sound another plugin hands it a single time, now, placed as `hold` places one, and let go while the
  context is locked. Another plugin reaches either only through a mod audio writes for it.
- Tuning after the bake is a game's `dev.html`, the one page that may change the scene in memory: a
  car's `look.sound` replaced there, a new object, makes box3dvehicle make every car again with it,
  and its JSON is what goes back into the scene file or the species' `mix`.

## A cutscene's sound

The cutscene plugin never imports audio. A scene switches its sound on with
`world.cutscene.mods: { "play": "audio" }`, and lists `audio` in its `plugins` with the ledger's
actor ahead of the cutscene row. A `sound` cue (`cue`, then `where` or `who`) and a `say` with a
`voice` are then raised on the ledger. Their names are cues of `world.audio.cues`. In a scene that
names no `play`, the cues fire and nothing is heard. A skipped cutscene raises no sound. Its
`music` cue sets the row's `music`. A named loop `{ "named": { "kind": "cutscene", "path": "music" },
"fade": 1 }`, or `synthaudio`'s `music` on the same field, plays it. The whole of it is in the
headers of `plugins/cutscene/cutscene.sim.ts` and `plugins/audio/audio.cutscene.ts`.

## What goes wrong

- A sound played from a `<kind>.client.ts` with `new Audio(url)`, an AudioContext of its own, or a
  fetch. That is a second way to a file and a second Web Audio, outside the catalogue, the store's
  volume and audio's unlock. Every sound a rule causes is raised with `sound`: the seat's thing's
  `from` its `player` row, the rest on the ledger.
- The seat's own jump, shot or hurt heard a round trip after the key on `client.html`. The scene gives
  no `world.predict`, or `client.html` does not wrap its link in `predict`, so nothing runs ahead and
  the page plays the packets (`going-multiplayer`, A scene run ahead).
- A ledger of the game's own made for the seat's own sounds. The `player` row's `voiced` list already
  plays each entry once.
- A sound played from an actor's `tick` when a field changes. The rows an actor is handed are the
  last packet's, so a change that lasts one step is missed whenever two packets land in one frame.
  Raise the cue in the rule that made the change.
- A cue name, a gain or any other fixed value written in the rule. The cue name goes in the kind's
  definition, and the gain goes in the cue.
- The cue table on the ledger's prefab or row, or the volume on a row or in a message. The table
  goes on `world`, and the volume goes in the store.
- A gain a plugin plays its sound at, written as a number in a kind's definition or a plugin's
  `world` table, and a tuning slider bound to it. How loud a sound is, is the store's: the definition
  names a key, the `store` prefab starts it, the plugin reads it each time it plays, and the slider
  sets it (The rule: how loud a sound is, is the store's).
- A key that `world.audio.volume` names with no starting value in `world.store`. Audio throws
  `store has no <key>` on its first frame.
- A cue a kind's definition names that `world.audio.cues` lacks. The server raises it without a
  word. The page throws `audio has no cue <name>` on the frame its entry arrives. Audio does
  nothing without an AudioContext, so a node test that does not stand one in never sees it.
- A node test that expects a sound to play. Node has no Web Audio. Audio makes no context there,
  plays nothing and asks for nothing, and the loader cannot decode a `sound` there. A test stands
  in an AudioContext before the page is made.

## Proving it

The tests sit beside the files they test and run with `yarn vitest run <file>`.

- `games/<game>/<kind>.sim.test.ts` is the kind's test, on the server. It boots the manager as
  the page does (`boot`, `load`), makes a seat with `connection`, and sends the press with
  `seat.take`. After a step it reads where the entry landed in the child truth. A sound of the
  seat's thing is on the seat's `player` row's `voiced` list, and the ledger holds nothing of it; a
  sound of any other row is the ledger's one entry. Either way `cue` is
  `defs.<kind>.sounds.<event>`, `from` is the row's id and `at` is its `pos`. It also checks the
  row's own change. Stepping on, it counts the packets that carry the entry, which is `hold`'s steps
  less one for a sound raised in an act. Then the list is empty. It reads `hold` and every number off
  the scene file and the definitions, and writes none.
- `games/<game>/player.client.test.ts` (the test beside the file that binds the key) is the page's
  test. It makes a page in node as `index.html` does, `view(link(loopback(accept(manager(truth)))),
  file, import.meta.url, () => {})`, as `plugins/store/store.plugin.test.ts` does. It sets these
  globals with `vi.stubGlobal` before the page is made:
  - `addEventListener` and `removeEventListener`, keeping each listener so the test can hand it a
    key event `{ code: keyCode(' '), key: ' ' }`, its code from `keyCode` in
    `plugins/player/player.plugin.ts`.
  - `AudioContext`, as a stand-in that starts `running`, records each source started and the
    gains it goes out through, and has a `decodeAudioData` that hands back a buffer. Audio lets go
    of an entry while its context is not `running`. `plugins/audio/audio.plugin.test.ts` is the
    model for the graph, but its stand-in has no `decodeAudioData`, because that test stands in
    the loader too. With the real loader, a stand-in without one fails the sound, and
    `plugins.loader.load` rejects. The model for the decoding is the test "a sound is decoded
    through audio's context and is its AudioBuffer" in `plugins/loader/loader.plugin.test.ts`.

  Each check below is pinned to a step, never read within a few steps (`input-and-seats`, How it is
  proven). It awaits `plugins.loader.load('<sound>')`, because the real loader reads the file off
  the disk in its own time. Then it checks, in this order:
  - After the key and one frame with no step, neither the row drawn nor the server's has changed,
    and nothing has started.
  - After a step and a frame, the row is drawn changed and one source has started, playing the
    decoded file. It goes through the cue's gain and then a gain at the store's volume, out to the
    context's destination.
  - After thirty more frames, there is still one source.
  - The mute key sets the store and puts that gain to 0, and nothing reaches the server.
- These hold for every press that raises a sound, whatever sends it. A button on the UI whose tap
  calls `plugins.player.<act>()` sends its act through the player plugin as a key's press is sent
  (any name it has no function of its own for becomes a press, `plugins/player/player.plugin.ts`).
  So a sound raised from a button gets the same server test, the entry counted on `hold`'s packets
  less one, and the same page test, the button tapped with `emit('pointertap', ...)` in place of the
  key: one source started, once.
- A sound of the seat's thing is checked on a page that runs the scene ahead, as `client.html` runs
  it, in the game's `<game>.predict.test.ts` (`designing-a-seat`, The proof): two pages made with
  `predict(link(loopback(accept(manager(truth)), time, net)), file, base, mount)` on a clock the test
  moves, with the `AudioContext` stand-in above, one on a clean wire and one on each of the network
  panel's bad ones. On the frame after the frame the press was sent on, the pressing page has started
  one source for the cue, and its own `player` row (`possessed(page.client.plugins.wire.rows)`) holds
  the entry in `voiced`; the other page starts it once that row's packet reaches it, and neither
  starts it twice. A sound raised from any row but the `player` row fails the first check on every
  bad wire.
- Played: `games/<game>/index.html` on `yarn dev`. In
  `dev.html`, the testbed, a readout before the boot can wrap `AudioBufferSourceNode.prototype.start`
  to count the sounds started. Keys sent as real input events (Chrome's DevTools `Input` events)
  unlock the context as a person's would. A `resume()` called from a script before any input
  leaves it `suspended`. That is the browser's autoplay rule, not core's, and it stops holding
  once the page has had a person's gesture. Then `<game>.server.ts` on node and
  `client.html` in two tabs: the seat's own jump is heard on the key, and the other tab hears it after.

## Questions never asked

- Can the cue table ride on the ledger row or its prefab? No. It goes on `world.audio`, because a
  row is copied to every seat every step.
- Can the volume be a field of the player row, or sent to the server? No. It is a key of the
  store, which is the page's.
- Can a kind's definition hold the gain a plugin plays its sound at, as a number? No. It names a key
  of the store, which the scene's `store` prefab starts and the plugin reads every time it plays
  (The rule: how loud a sound is, is the store's).
- Can a tuning page change a loudness by writing into a definition? No. It sets the store's key.
- Can an actor fetch or play a sound file itself? No. The file is a catalogue entry, the loader
  decodes it through audio, and the rule raises it with `sound`.
- Does the seat's own jump go on the ledger, as every sound once did? No. It is raised `from` its
  `player` row, rides `voiced`, and is heard on the frame after the key.
- Can the seat's own sound be raised from the `body` or `gun` its `player` row spawned? No. The thing
  is the `player` row (`designing-a-seat`).
- Can the cue name be written in the rule? No. It goes in the kind's definition, in `sounds`.
- Can a plugin find audio's ledger and call `play` on it itself? No. Audio writes a mod for it,
  `plugins/audio/audio.<p>.ts`, and the scene names it in `world.<p>.mods`.
- Does the cutscene import audio to sound its cues? No. Audio's mod does it, named in
  `world.cutscene.mods`.
