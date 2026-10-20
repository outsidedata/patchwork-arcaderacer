---
name: building-a-cutscene-intro
description: Use in core, or any clone of it, when a game gets an intro, an attract mode, an opening cutscene before its title or menu, a "camera flies around the real game then lands on the logo", a 3D game name or 3D menu words drawn over a running scene, or when an intro's shots miss their subject, show a wall or the ground, start before the art has loaded, drift out of step with the action, or leave the menu showing during the intro. Also when a cutscene's cast are a game's own self-driving kinds (CPU racers, AI ships, bots) rather than walkers, and when a cue file is to be written from the game's own deterministic run instead of by hand.
---

# Building a cutscene intro

An intro is core's `cutscene` plugin filming the game's own scene: the real kinds, run by their real
rules, in the entry scene itself, the camera cutting and sweeping between them, then letting go onto
the title, the scene still running behind it. Nothing is faked: no recorded positions played back, no
stand-in rows, no scene of its own. The plugin's whole contract is the header of
`plugins/cutscene/cutscene.sim.ts` (cue file, cast, clocks, skip) and `plugins/cutscene/cutscene.plugin.ts`
(camera, bars, veil, line, `land`). This skill is how a game uses it for an intro, start to finish.

What applies instead:

- Scenes, the entry, `go` and `enter`: `scene-flow` (its "A cutscene" section).
- The menu on a ui panel, its keys and focus: `building-the-hud`.
- A kind's rule and its definition: `designing-a-kind`. A plugin or a mod: `building-a-plugin`.
- A 3D model made in Blender, its script and its viewer: `making-3d-assets-in-blender`, then
  `bringing-in-art` for its catalogue entry.
- Tests in general: `proving-a-game`.

## Where it plays

In the entry scene, the title, before its menu. The title becomes a 3D scene of the game: its
renderer, its look plugins, its set (a level, a course, a map) and a cast of the game's own kinds,
running under their own rules for as long as the scene runs. The intro's last shot hands the camera
to the title's look, and the menu comes up over the scene still running. A separate intro scene that
`go`es to the title is wrong for an attract intro: the scene behind the menu would be another truth,
started over, and the cut would show it.

The title stays a plain seat when it was one (`scene-flow`, step 4): the cast are CPU rows, never a
seat's `player` row. Its plugins gain what the set and the cast draw with (render3d and the look
plugins the levels use, `cutscene` after render3d and before `ui`), its `world` gains
`world.cutscene` (`script`, `kinds`, `settle`, `tremor`), and its catalogue gains the cue file. A
title that gives its own `world.loader` lists only what its set draws, so the page can know when all
of it has landed (below).

## The parts, each in its home

| Part | Home | What it does |
|---|---|---|
| `cutscene` row | `actors` entry, prefab `{}` | the playhead; listed before every cast row (lower id) |
| cast rows | `actors` entries of the game's own kinds, each with a `name` | filmed; driven by their own rules |
| the start | a kind of the game's own, one row (a `curtain`) | starts the cutscene and the action in one step |
| the cue file | `assets/intro.json`, catalogue `json` entry, `preload` | written by a script, never by hand |
| the script | `assets/intro.ts` beside it | plays the scene, lays the shots, checks every frame |
| the title | the title's kind's look (`<kind>.client.ts`) | menu, 3D name, camera after the intro |
| the 3D words | `assets/<name>/<name>.py` → `.glb`, in the game's bake | the name and any 3D menu words |

## The cast

A cast kind keeps the contract in the header of `cutscene.sim.ts`: it carries `name` (its prefab has
`name: ""` and `direct: null`; the `actors` entries give each its name), it reads `direct` in its
`tick`, it has a closed act `advance(dt)` that runs exactly its own step (`before` then `tick`), and a
`go` act only when the cue file has `go`.

A kind that drives itself (a CPU racer, an AI ship, a bot) is filmed, not directed: with `direct` set
it goes on by its own rule exactly as without, so the camera films the real thing. It takes no
`walk`, `face`, `play` or `gesture`, and throws naming the verb when handed one, since the cue file is
data from outside the program and a silent no-op hides a wrong file. Its `before` and `tick` are
plain functions the kind's hooks and its `advance` both call.

Cast every row that moves in the shots, not only the ones a shot names. A skip plays the scene through
inside the cutscene row's `before`, calling `advance` on the cast and nothing else: a row left out
stands still while the cast leap ahead, and the scene behind the menu is torn. Rows that are not the
cast (a race's or a match's clock) are not stepped by a skip; the intro is laid out so that does not
matter (the action runs on under its own clock afterwards).

## Starting it: the art, and one step

`auto: true` is wrong for an intro: the page that just arrived is still fetching the models and
textures, and the intro plays to an empty set. A kind of the game's own, one row (call it `curtain`;
never named after the scene), holds it:

- its open act `ready`, sent once by its look on the first frame every `model` and `texture` of the
  scene's catalogue has landed or failed (`Promise.allSettled` over `plugins.loader.load`), and its
  `before` after its definition's `wait` seconds, both do the same once: `w.call(w.find('cutscene'),
  'start', -1)` and, in the same step, start the action (a closed act on the row that holds the
  action's clock, a race's `flag` say). `started` on its row makes it once only.
- its look covers a `curtain` panel in black until the cutscene runs or is done, and sends the
  cutscene's open `skip` on any `keydown` or `pointerdown` while it runs, once; listeners on the window,
  taken off in `remove`.

Starting the cutscene and the action in one step is what makes the cue file right: the cue clock `e`
and the action's clock then run together from the same step, on the server and in the script alike,
whenever the page happens to be ready. Anything that lets the action begin before the intro (a race
that counts down on its own, a fight already going) puts every car or ship somewhere else than where
the cue file was written for it.

## Writing the cue file from the run

A game whose action is a pure function of its seed and its numbers (CPU drivers, a seeded map) runs the
same every time, so the shots are written from it, not guessed. `assets/intro.ts`, run with
`node --experimental-strip-types games/<game>/assets/intro.ts`:

1. Boot the manager as the server does (`boot`, `load`, `connection(manager(truth), …)`), step once,
   and send the curtain `ready` as a page would (`seat.take` with the last `Down`'s scene, seat and
   `n`). This is exactly the start path the game runs.
2. The cutscene needs a cue file to begin, and its cast is fixed, so write a first file with the cast
   and no cues; nothing the cutscene does changes how a self-driving cast moves, so the run it records
   is the run the finished file plays. After each write call the loader's `written(url, text)`
   (`plugins/loader/loader.sim.ts`): the process keeps every file it has read, and a second boot reads
   the old one otherwise.
3. Record every cast row each step: place, heading, speed, its state (a drift, a target), progress.
4. Lay the shots on what really happens, every time read off the recording: when the action goes, the
   first big event (a drift, a kill), when the leader reaches a landmark (a bridge, a tower). Fixed
   points come from the set's own functions (the track's `sample`, the land's `height` and
   landmarks), follow offsets from the cast row's heading at that moment. Alternate wide and high
   (aerial sweeps, `over` > 0 dollies from a fixed point looking at a cast name) with close and low
   (follows, `frame: "body"` for a bumper or wing camera).
5. Write the file and check every frame (below). Throw on the first that fails, naming the shot and
   the time.

On a set with no ground plugin, or one whose `land` mod the scene does not name, the server half is
`cutscene(() => 0)` and the browser half flat at 0: then every point the script writes is a world point
with its height in it. The two halves must agree on the ground, or the server's `shot.from` and the
page's pose differ.

The first shot has `over: 0` (the check refuses otherwise). The last shot is the title's: a follow of
one cast member with an offset in the world's axes, so the title's camera can carry it on.

## Checking every frame

A shot that "should" show its subject is a guess. The script plays the finished file and, at every
step of every shot, takes the camera the cutscene draws (`pose(d, rows, height)` from
`cutscene.sim.ts`) and the cast row the shot `look`s at, and requires:

- the subject on the screen: its point in the camera's axes, divided out to the screen's −1…1 across
  (`tan(fov/2) × aspect`) and up (`tan(fov/2)`), inside a margin, and up and down inside the bars
  (`1 − 2 × bar height / canvas height`) while they are on;
- within a distance;
- nothing between camera and subject, and the camera itself inside nothing, against the set as its
  plugin draws it, read off that plugin's own code: the ground outside the road's or the level's
  corridor, each building's box, and the corridor's walls, retaining walls, banks, rails and tunnel
  bores at their drawn heights. A camera stood "just beyond the wall" is inside the bank where the
  ground beside the road is higher; only a check of the bank finds it.

The same check runs in the title's test on the file as written. Add every new way a shot went wrong
on screen to the check before fixing the shot, and see it fail on the old shot.

## The title after the intro

- The menu and anything else on the title's panel draw nothing while the `cutscene` row is not
  `done` (the lobby's own text too, wherever it is drawn). From the first frame it is done they come
  up on the page's clock (`performance.now()`, an `appear` { after, seconds, rise } in the
  definition); a page that arrives after shows them at once.
- The camera: the title's look claims render3d's camera once it is done and carries on the last shot:
  `view({ pos, look, fov, head, follows }, d.cast, rows, height)` from `cutscene.sim.ts`, the shot's
  world offset turned about the upright `orbit` radians a second on the page's clock, so the scene
  behind the menu keeps moving and the hand-over does not jump. `d.cast` stays on the row after the
  end.
- A 3D name, and 3D menu words, drawn in render3d's `overlay` (never in the scene, where the action
  would pass in front of it), placed in the camera's frame each frame, its own `near`/`far` set on the
  overlay camera. The overlay has no environment: chrome and clear coats reflect black. The look
  builds one once, a sphere coloured sky / horizon band / ground through the renderer's
  `PMREMGenerator`, and sets it as each of its materials' `envMap` (none in node, where there is no
  renderer). Every colour, finish, place and reveal is the title kind's definition.
- 3D menu words stay ui buttons: each a `ui.button` with clear fills, its `hitArea` set each frame to
  the word's box as `render3d.project` draws it, so the pointer and the ui's keys and focus work as on
  any menu; `focus` and `blur` on the button tell the look which word to grow and light.
- The words are one glb from one Blender script that reads them off the title's definition (a node per
  word), built by the game's bake and packed like every model.

## Testing it

`<title>.sim.test.ts`, booting the manager as the script does (export the script's `enter` and its
frame check and import them, with `if (import.meta.main)` round the script's own run):

- the cast stands where it starts and the cutscene waits until `ready`;
- `ready` starts the cutscene and the action in the same step (`e` is one step, the action's clock one
  step on);
- every frame of every shot passes the check, and every shot of the file is seen;
- at the end the cast's `direct` is null and the action runs on;
- a skip ends it at once and the action still runs on;
- the curtain starts it alone after `wait`, and a `ready` after does nothing;
- no seat can send the action's start act, and a cast kind handed a cue it cannot obey throws.

A page test of anything on the title skips the intro first, as a player would: wait for the
cutscene to run, press a key, wait for `done`. A helper that steps "until `e` reaches t" also stops
at `done`, since `e` stops there: it otherwise steps forever.

Then play it and look: `yarn editor <game>`, the game's `index.html`.

## What goes wrong

- `auto: true`, so the intro plays before the art lands, to an empty set.
- The action starts on its own clock, not in the step the cutscene starts, so every shot points at
  where the cast is not.
- Shots typed by hand from guessed positions.
- Only the named rows cast, so a skip leaves the others behind.
- A camera beside the road or the level stood inside a bank, a wall or a building: the check knew only
  the open ground.
- The script's second boot reads the cue file it wrote before (`written` not called).
- The menu or the lobby's text drawn during the intro.
- The 3D name put in the scene, where the action passes in front of it, or in the overlay with no
  environment, so its chrome is black.
- A separate intro scene, so the scene behind the menu is not the one the intro filmed.
- A test's step loop that waits on `e` past the end.

Ask the person making the game what the intro shows: its set, its beats, whether it has words, what
stays behind the menu, and how the name and the menu look. That is content, and it is theirs.
