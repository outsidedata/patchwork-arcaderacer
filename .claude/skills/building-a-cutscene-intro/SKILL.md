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
| the cue file | `assets/intro.json`, catalogue `json` entry, `preload` | laid in the cutscene's panel on the dev page (`dev.html?cutscene`) and saved from it |
| the check | `assets/intro.ts` beside it | plays the scene and checks every frame; `failing(script)` hands back each failing frame |
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

## Adding a cast member

A member is in the cast only when three files name it, and the panel's `who` and `follows` lists are
the cue file's `cast` and nothing else; a member missing from any of the three never appears there,
and the panel cannot add one. Its place lists (`look`, `pos`, `to`) are the cast and the scene's
`mark` rows.

1. The scene's `world.cutscene.kinds` holds the member's kind (`["driver", "gunner"]`): the kinds a
   member may be, and the rows a skip and a target are looked for in.
2. The member's `actors` entry gives it a `name` (`{ "is": "gunner", "name": "gunner" }`), listed
   after the `cutscene` row. Its kind keeps the cast contract (The cast, above): `name: ""` and
   `direct: null` in its prefab, and `advance(dt)`.
3. The cue file's `cast` maps the member's cue name to that kind and name
   (`"gunner": { "kind": "gunner", "name": "gunner" }`).

Then reload `dev.html?cutscene`: the member has its own lane and is in every list.

## Seeing as a thing in the game sees

The camera takes the point of view of anything in the game that has a row with `pos` and `yaw`: a
shot `follows` that row with `frame: "body"`, so `pos` is an offset in the row's own axes (x to its
left, y up, z ahead along its `yaw`, which faces (sin yaw, cos yaw); `cutscene.sim.ts`'s `view`) and the camera turns as the row turns. `frame` left out, or
`"world"`, keeps the offset in the world's axes, so the camera rides along without turning.

- **The thing turns by itself, apart from what carries it.** Follow the row that turns. In horde the
  chaingun turns on the jeep: the `gunner` sits on the gun's seat point, which turns with the gun
  (`games/horde/plugins/gun/gun.interact.ts`), so a shot following `gunner` in its body frame swings
  with the gun, and one following `driver` turns with the jeep. When nothing that turns that way has
  a row (a turret drawn as part of a car, a head bone), cast the row whose `yaw` it is, or give the
  thing a row of its own whose rule keeps its `pos` and `yaw` on it; the cutscene reads nothing but
  rows.
- **Looking where it looks.** `look` is a target, a member, a mark or a point, never a direction in
  the member's frame. To see along the thing's way, stand the camera behind it and a little above
  and look at it: `pos: [0, 1.5, -2.5]`, `look: "gunner"` is over the gunner's shoulder down the gun.
  The member's look point is `head` metres over its `pos`.
- **Its own eye.** An offset of `[0, eye, 0]` with `look` on the same member puts the camera on the
  look point and has nothing to aim at: put the camera behind the eye (z below 0) and look at the
  member, or look at a mark or a point ahead of where it is going.

## The game's own things: behaviors

A shot often needs the game to do something on cue: the gate opens as the camera reaches it, the boss
steps out, the rain starts, a lamp lights. That is a step in the game's own words, in the same cue
file, beside the shot it belongs with, never a rule of the game's that watches the cutscene's clock,
and never a change to core's cutscene. The game's plugin delivers it as a behavior (`plugins/cutscene/
cutscene.sim.ts`, Steps a game brings; the cutscene README, Steps a game brings):

- **Where.** A plugin of the game's own, `games/<game>/plugins/<a>/`, writes `<a>.cutscene.ts` beside
  itself, exporting `behaviors()`, `{ <word>: <step> }`. The scene lists `<a>` in
  `world.shipped.plugins` and names it in `world.cutscene.mods.behaviors: ['<a>']`. A plugin that
  exists only to deliver steps is that mod alone (`games/demo_cutscene/plugins/stagehand/`).
- **The word is the game's.** `open`, `spawn`, `rain`, `explode`: what the game calls the act, so the
  cue file reads as the game's script. The step does the act through the thing's own act, the way a
  rule would (`w.call(gate, 'open', -1, cue.over)`), or `w.spawn`; it never writes another kind's
  fields itself. The rule of what opening is stays in the kind.
- **Its fields** are rules from cutscene's `RULES`: `who` for a cast member it acts on (then `fire`
  is handed that member's row as `who`, and the step does not fire once that row has ended),
  `target` for a place (a cast name, a mark or a point, checked at the start like every place),
  `positive`, `text`, `flag` and the rest. A misspelt field or name in the file fails when it is read.
- **Waiting on it.** A step that takes time (a gate swinging, a bridge lowering) gives
  `wait: { holds(d, w), longest(file) }`, and the cue file holds the shots behind it with
  `{ "do": "wait", "on": "open" }`. `holds` reads the row it acted on (the gate's `open` below 1);
  `longest` is the most it can take, after which the wait lets go whatever `holds` says, so a skip
  always ends.
- **On a skip.** `fire` is handed `loud`. A step that changes the world (opens, spawns) acts whatever
  `loud` is, so the scene behind the menu is the one a played intro leaves; a step that is only felt
  (a sound, a flash) does nothing while `loud` is false. A row a step acts on and that moves over
  time is cast, as every row that moves in the shots is (The cast, above), so the skip advances it.
- **Drawing it.** A step that draws on the page beyond what its rows' looks draw gives
  `page: { tick(plugins, d), close?() }`, reading what its `fire` kept under `d.steps.<word>`; it takes
  down what it drew when the scene stops and in `close`. Anything a row of the game's carries is drawn
  by that kind's own look, not here.
- **Overriding.** A delivered word of cutscene's own name (`shake`, `sound`) takes the place of
  cutscene's own in the scenes that name the plugin, and a later plugin's word takes an earlier one's.
- **Testing it.** The game's test plays the intro and reads the rows: the act lands at its cue, the
  wait holds until it is done, what is behind the wait comes after, and a skip leaves the same world
  (`games/demo_cutscene/demo_cutscene.sim.test.ts`).

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

Once it starts, a shot the page cannot place yet (the land's ground not there, a member it names
not among the rows) is covered in black by the cutscene itself, in render3d's overlay, and
`plugins.cutscene.waiting()` is true while it is, so the curtain's look can show a spinner on the ui
over it (`cutscene.plugin.ts`, Waiting).

Starting the cutscene and the action in one step is what makes the cue file right: the cue clock `e`
and the action's clock then run together from the same step, on the server and in the script alike,
whenever the page happens to be ready. Anything that lets the action begin before the intro (a race
that counts down on its own, a fight already going) puts every car or ship somewhere else than where
the cue file was written for it.

## Laying the shots on the dev page

The shots are laid on the game itself, in the cutscene's panel (`plugins/cutscene/cutscene.panel.ts`,
the plugin's README, Editing a cutscene on the dev page). The game's `dev.html` calls the panel's
`edit` when its address has `?cutscene`, before it boots anything of its own (mech's does), and
`yarn dev` serves it: the game behind core's recorder, entering the title, the curtain starting the
intro as it does in the game, every skip held off. The playhead scrubs the real run; each change plays
at once; Save writes `assets/intro.json`.

1. Write a first cue file by hand with the cast and the game's own start cues (mech's `land`), and no
   shots: the cutscene needs one to begin, and its cast is fixed.
2. Open `dev.html?cutscene`, play the intro, and lay the shots on what really happens: when the action
   goes, the first big event (a drift, a kill), when the leader reaches a landmark (a bridge, a tower).
   Alternate wide and high (aerial sweeps, `over` > 0 dollies from a fixed point looking at a cast
   name) with close and low (follows, `frame: "body"` for a bumper or wing camera). A shot's camera is
   dragged with the gizmo; Look shows the real shot.
3. Every frame the check fails (below) is red on the camera lane; fix each, and Save.

On a set with no ground plugin, or one whose `land` mod the scene does not name, the server half is
`cutscene(() => 0)` and the browser half flat at 0: then every point is a world point with its height in
it. The two halves must agree on the ground, or the server's `shot.from` and the page's pose differ.

The first shot has `over: 0` (the check refuses otherwise). The last shot is the title's: a follow of
one cast member with an offset in the world's axes, so the title's camera can carry it on.

## Checking every frame

A shot that "should" show its subject is a guess. `assets/intro.ts` beside the cue file writes nothing:
it boots the manager as the server does (`boot`, `load`, `connection(manager(truth), …)`), steps once,
sends the curtain `ready` as a page would (`seat.take` with the last `Down`'s scene, seat and `n`),
exactly the start path the game runs, plays the file and, at every step of every shot, takes the camera
the cutscene draws (`pose(d, rows, height)` from
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

It exports `failing(script)`, which calls the loader's `written(url, text)` with the file handed to it
(`plugins/loader/loader.sim.ts`: the process keeps every file it has read) and hands back each failing
frame, `{ shot, e, text }`: the dev server runs it on the file as it stands in the panel, which draws
those frames red. Run on its own (`node --experimental-strip-types games/<game>/assets/intro.ts`) it
checks the file on the disk, prints each shot's failures and exits 1 when one fails. Its test runs it on
a short file of its own (mech's `assets/intro.game.test.ts`). Add every new way a shot went wrong on
screen to the check before fixing the shot, and see it fail on the old shot.

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

Then play it and look: `yarn dev`, the game's `index.html`; and `dev.html?cutscene` to scrub and edit it.

## What goes wrong

- `auto: true`, so the intro plays before the art lands, to an empty set.
- The action starts on its own clock, not in the step the cutscene starts, so every shot points at
  where the cast is not.
- Shots typed into the cue file from guessed positions, never laid on the run in the panel.
- Only the named rows cast, so a skip leaves the others behind.
- A camera beside the road or the level stood inside a bank, a wall or a building: the check knew only
  the open ground.
- The check's boot reads the cue file on the disk, not the one handed to `failing` (`written` not
  called).
- The menu or the lobby's text drawn during the intro.
- The 3D name put in the scene, where the action passes in front of it, or in the overlay with no
  environment, so its chrome is black.
- A separate intro scene, so the scene behind the menu is not the one the intro filmed.
- A test's step loop that waits on `e` past the end.
- A game's act timed by its own rule watching the cutscene's `e`, or added to core's cutscene, instead
  of a step in the game's words delivered through `world.cutscene.mods.behaviors`.
- A delivered step that writes another kind's fields itself instead of calling that kind's act.
- A row a delivered step sets moving left out of the cast, so a skip leaves it half done.

Ask the person making the game what the intro shows: its set, its beats, whether it has words, what
stays behind the menu, and how the name and the menu look. That is content, and it is theirs.
