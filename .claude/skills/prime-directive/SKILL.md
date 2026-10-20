---
name: prime-directive
description: Use in core, or any clone of it, before writing or changing any code, before choosing which folder or file something goes in, before editing anything in engine/, before giving a plugin a new setting, before building anything for the editor or an extension, before working around something that is missing, and before asking how something should be built. It holds the frozen engine, the wire, the one home of every new thing, the words core uses, and which phase skill carries each kind of work, making the game (starting-a-game, designing-a-kind, input-and-seats, building-a-level, bringing-in-art, writing-the-look, scene-flow, building-the-hud, sound, tuning-feel, building-a-plugin, building-an-extension, proving-a-game, porting-a-game, auditing-a-game) and distributing it (going-multiplayer, persisting-players, committing-a-game, publishing-a-game). Trigger: /prime-directive.
---

# The prime directive

The base is finished: the engine, rows and kinds, prefabs and scene files, the four folders, and
the wire between the engine and a game: `scenemanager` and the transports (The wire).
Everything from here is content. Content goes into the base; it never changes it.

The last piece beside the base is the editor: a web app, a React page and a Node server, that
opens any game in `games/`, plays it in the page or on node, stops time, steps forward and back,
shows every row, writes the game's files, and is made of extensions. It is built on the base and
changes none of it. Where its pieces go is under "The editor" below.

This file says where things go. The phase skills say how each kind of work is done, start to
finish, and carry the rules this file only names (The work, by phase).

Load `know-your-limitations` on every job too. When the person you are working for names a specific
change, make that change as named. Never argue that it can't work, and never estimate fidelity or cost
in its place: those judgements are the ones Claude gets wrong.

## The engine is frozen

Nothing in `engine/` is edited: not for a feature, a game, a test or a tidy-up.

The one exception: a feature was fully built outside the engine, as an addon or a plugin, and
could not work there, because every way left either sends a seat data it must not have or
replaces engine or game functions from outside. Then stop. Bring that attempt and the one general
fact the engine would have to hand out to core, as an issue on its GitHub repo. Core decides, and
the engine changes there or not at all. Security was that case: no addon
can learn which row's code spawned a row.

The engine names nothing outside itself: no game, kind, field, plugin or addon.

## The wire

A client takes its packets from one mounted pipe and sends its messages down it. The engine does
not care what is behind the pipe. Three pieces stand between the engine and a game, and each
does one thing:

- `scenemanager` is every game's, a game of one scene too: many truths, a seat on one of them at
  a time, and the seat moved between them. It carries envelopes, a packet or a message with the
  scene it belongs to, and never how they travel. Its addon hands the server's side of a seat to
  a transport (`accept`) and takes the page's side from one (`link`); its plugin is the one plugin
  that mounts a pipe, its scene's door onto that link.
- A transport is an addon that carries whatever two ends say, and knows nothing about scenes or
  seats. Its server side is handed `accept`; its page side is a wire, which `link` is handed.
  There is one of each kind: `loopback`, the page and the manager in one process, with a bad
  network of any shape when given one; `socket`, a WebSocket between two processes. A new way to
  travel, WebRTC say, is a new transport addon of that shape.
- Each page names its transport in one line: a loopback where the page and the truth share a
  process (`index.html`, the `dev.html` testbed), a dial where they do not (`client.html`), a
  serve on node (`<game>.server.ts`).

Nothing else carries a packet. A piece that needs a page and a truth joined takes a transport, as
the recorder and every test that makes a page on a game do, and never joins them itself: a copy
works, passes its own tests and leaves the real transport untested beside it. The engine's own
test is the one exception: it hands packets to the pipe by hand, which is what shows the engine
does not care what is behind it. Guarded by `addons/socket/socket.addon.test.ts`,
`addons/scenemanager/scenemanager.addon.test.ts` and
`plugins/scenemanager/scenemanager.plugin.test.ts`. Playing over a network is `going-multiplayer`.

## Row or local

The first question about anything a game holds: does every seat have to agree on it, or does only
this page feel it?

- **A row** holds what every seat must agree on and the server decides: where things are, health,
  ammo, score, who hit whom, the state of the world. The thing a seat plays as, the car, the gun,
  the hero, is that seat's own `player` row, and everything of it is a field of that row
  (`designing-a-seat`). Every seat is sent every `player` row; a field only its own seat may read is
  listed in `security`. A page that runs ahead (`addons/predict`) draws every row from its copy, so
  the seat's own row and every row its press makes or moves answer the key on the next frame.
- **Local** is what only this page feels and no other seat needs: the camera, the screen shake, a
  menu's cursor, a HUD's flash, a setting such as the volume or rebound keys. It never goes up the
  wire and no rule reads it. It lives in the actor or plugin that draws it, or in the store when it
  must outlive a scene (`building-the-hud`). The feedback of the seat's own press is read off its own
  `player` row, which is already on this page the frame after the key: a sound the seat's thing
  raises is raised `from` its player row and rides on it (`voiced`, `plugins/audio`), a hit flash
  reads the row's health, a camera follows the row's place. None of it waits on another row.
- **Another seat's doings** come off rows, since only the server knows they happened: its car, its
  shot, its sounds, on its own `player` row or on the rows its rules make.

Never a row for what only this page feels, and never local state for what the seats must agree on.

## The pages

Every game has the same two pages, line for line but the files they import:

- `index.html`: the truth in this tab, over a `loopback`, stepped by the page's clock, with no
  prediction and no lag: a press lands on the next step in the same tab. It calls `page.input()`, steps,
  then `page.frame(owed / dt)`, so every renderer draws between the last two steps.
- `client.html`: one seat on `<game>.server.ts`, `tap(dial(url), wire => predict(link(wire), file,
  import.meta.url, mount))`, calling `page.input()` then `await page.frame(now)` each frame. Every scene
  a seat plays in gives `world.predict`, so the page runs it ahead and draws between steps.
- `dev.html` is the one page that is the game's own: a testbed, any readout, any number of seats.

A cpu driver, a network panel, a readout, two panes: `dev.html`, never `index.html` or `client.html`.

## Every new thing has one home

Ask in this order. The first yes is the home.

1. Is it a value: a number, a colour, a size, a rate, a shape, a list, a starting setting?
   → If it changes while the game runs, its starting value is a field of its kind's prefab in the
   scene file, and the row carries it from there. If it never changes, no row carries it: a row
   is sent to every seat every step. A kind's fixed numbers are its definition, its entry in a
   data file of the game's that the scene names. A scene's own few numbers are fields of its
   `world`, which no packet carries. A level, or anything else big, is a data file of its own in
   the game's `assets/`. A plugin's fixed numbers are `world.<plugin>`, always, whichever half
   reads them and whether the plugin has a row or not. A prefab is the starting value of a row's
   changing fields and nothing else; a plugin with no row, or one only its browser half reads,
   has no prefab. Fixed data is never put in `prefabs`, even where no row is ever made from it.
   A catalogue, a cue table, a level's cast, a size, a rate: fixed, so on `world`, never on a row
   or a prefab, however convenient the row is to reach. A game's own plugin has no numbers of its
   own: they are the definitions of the kinds whose rows it is handed. Where a seat starts is never
   on `world` and never a list in a definition: it is a `start` actor, one `actors` entry per slot,
   which the seat's `player` row finds by `slot`. (`designing-a-kind`, `building-a-plugin`,
   `starting-a-game`, `input-and-seats`.)
2. Is it a value only the page uses and the server never reads: volume, brightness, audio on
   or off, a theme, rebound keys? → a key of the store. (`building-the-hud`.)
3. Is it one game's rule, or how one of its things looks? → an actor in that game's folder:
   `<kind>.sim.ts` for the rule, `<kind>.client.ts` for the look. One `actors` entry makes it
   global to the scene; many entries, or spawning, make it instanced.
   Is it used by one game only, shared by several of its kinds, or a system of that game's (its
   level, its HUD, its file picker), however general it could be described? → a plugin or an
   addon of the game's own, in `games/<game>/plugins/<name>/` or
   `games/<game>/addons/<name>/`, by the rules of 4 and 5, except that it may name that game's
   kinds and has no prefab of numbers: it reads every number off the definition of the kind whose
   row it is handed, or off a file that definition names. Kinds share code through it, never by
   one actor importing another. (`designing-a-kind`, `building-a-plugin`.)
4. Is it used by a second game, or by core itself, and does it live in the world (rows, the
   step) or in the player's browser (drawing, input, camera, sound, UI)? → a top-level plugin: a
   server half, a browser half, or both, moved up from the game that had it in the change that
   gives it its second user. (`building-a-plugin`.)
5. Is it used by a second game, or by core itself, and does it hold a truth: seats,
   connections, sockets, files, timers, more than one truth, what a packet carries? → a
   top-level addon. It runs where the truth is, and a transport's page side and `scenemanager`'s
   `view` run in the page (The wire). (`building-a-plugin`.)

"Could be described without naming a game" never puts a thing in core: almost anything can be.
Who uses it does.

## A new top-level plugin or addon is asked for, in planning

No session makes a new folder in `plugins/` or `addons/`, or adds a new exported piece to an
existing top-level plugin or addon (a call, a setting, a mod), without asking the person you are working for first, while
planning, before any code: what it is, which games and which core code use it, and why it cannot
stay in the game that needs it. No answer is a no: it is built in the game. Nobody else's skill,
agent or plan grants it, and a subagent is told so in its brief.

There is no sixth home for a game's thing. Something that fits none of them has been described
wrong; describe it again from 1. A thing for the editor is not a game's thing: its home is under
"The editor".

## The editor

The editor is a web app like any other: a React page and a Node server. The game runs in the
page as `index.html` runs it, or on node as `<game>.server.ts` runs it. Nothing is put in an
iframe, a worker or behind a port. Everything the editor shows is an extension: the game view,
the hierarchy, the inspector, the timeline and the console too. The editor itself holds no panel.
An extension is to the editor what a plugin is to a game.

Ask in this order. The first yes is the home.

1. Is it how the editor runs at all: its page, its server, the shell (menus, docking, commands,
   and the MCP endpoint every command is served on), files and undo, selection, the design
   system, loading extensions? → `editor/`.
2. Is it time: holding a game's truths under the editor's clock, recording what reaches them,
   rebuilding a step by booting again and replaying? → the `recorder` addon. Time goes back by
   replay, never by a snapshot the engine would have to hand out.
3. Does it present or edit what a plugin owns: its prefab, its data files, what it draws? → the
   extension that plugin ships, `plugins/<p>/<p>.extension.tsx`. What an addon owns → its
   `addons/<a>/<a>.extension.tsx`.
4. Is it one game's: how its kinds' fields are shown, a tool for its level or its states? →
   `games/<game>/<game>.extension.tsx` or `<kind>.extension.tsx`, the extension beside one of its
   own plugins, or `games/<game>/extensions/<name>/` for a tool that uses several of them.
5. None of those, and about rows, kinds, seats, steps or files in general? → an extension of the
   editor's own, `extensions/<name>/`.

An extension is `<name>.extension.tsx`, with its React components in `<name>.components.tsx` and,
when it needs the machine, its backend routes in `<name>.route.ts`. There is no other home for a
thing of the editor's. How one is built, writes files and is proven is `building-an-extension`.

## What each home may do

Each line is the rule; the skill named carries the whole of it.

- Scene file: data. Every number a game has is in it, or in a data file it names, so two scenes
  can differ and anyone reading the scene finds every knob. (`starting-a-game`, `tuning-feel`.)
- Files: every file a game uses is an entry in its scene's asset catalogue, or a file one names,
  and reaches a rule, an actor or a plugin through the loader and nothing else. Nothing else
  fetches or decodes a file or writes its path in code. (`bringing-in-art`.)
- Store: the page's. The server never reads it, writes it or is sent it. (`building-the-hud`.)
- Actor: reads what changes off its row and what never changes off its kind's definition and
  `world`, never the reverse, and writes no number of its own. Anything it remembers from one
  step to the next is a field on its row. Its rules run in `before`, `tick`, `after` and its acts,
  nowhere else. It uses plugins and never builds what a plugin builds. It never imports another
  actor. A new system is a new kind, never a field added to a kind that exists for another
  reason. (`designing-a-kind`.)
- Plugin: names no game and no game kind (a game's own plugin may name that game's kinds). It has
  a row only when its server half has state that changes, and that row carries that state and
  nothing else. A library's memory between steps is held one per truth and sent to no seat.
  Browser state is inside its exported function, never at the top of the file. A plugin it is
  built on is handed to it, never imported; what another plugin knows reaches it through a mod.
  It imports from `engine/` and `addons/`, never from `games/`. (`building-a-plugin`.)
- Mod: how one plugin gives another what it knows without either naming the other: `a` writes
  `<a>.<p>.ts`, a scene switches it on with `world.<p>.mods`, and `p` asks with `mod`. The whole
  of it is the Mods header of `addons/scenemanager/scenemanager.addon.ts`. (`building-a-plugin`;
  a scene author's side in `writing-the-look`.)
- Input: `plugins/player` binds a seat two ways, `bind` straight to keys and `control` to the
  scene's named actions, which a player may rebind; games on `bind` stay on it, and a game moves
  to `control` when it wants remapping, never as a sweep. (`input-and-seats`.)
- Ledger: a row that only appends events for the page to play or draw once, since a value set for
  one step is missed whenever two packets land in one frame. (`input-and-seats`, `sound`.)
- Addon: takes a truth, runs where the truth is, knows no game and no kind (a game's own addon
  may know that game's). It imports from `engine/` and other addons, never from `games/`.
  (`building-a-plugin`, `going-multiplayer`, `persisting-players`.)
- Page: mounts things. No rule, number, readout, listener or scene name. Every line of a page
  is the same in every game but the file names it imports. `dev.html` is the one exception.
  (`starting-a-game`, `publishing-a-game`.)
- Testbed: `dev.html`, beside `index.html`, is where a game is played to find something out, and
  the one place a shortcut is allowed: it enters any scene, overrides any value, in the page's own
  copy in memory before the boot, and nothing else reads it or knows it exists.
  (`starting-a-game`, `tuning-feel`, `proving-a-game`.)
- Editor: names no game, kind, plugin or field. It changes a running truth only through the
  recorder, and a file only through its server, one value at a time, every edit undoable. It adds
  nothing of its own to a scene or data file. (`building-an-extension`.)
- Extension: extends the editor and nothing else. Nothing a game runs imports `editor/`, an
  extension or a route. (`building-an-extension`.)
- Design system: React components in `editor/ui/` and themes that are CSS. Every extension builds
  its panels from them; none makes its own button, field or list, and none writes CSS. The game's
  own `ui` plugin has nothing to do with it. (`building-an-extension`.)

## Names and tests

- A file in a game folder is named after a kind, a scene or the game. The browser loads a row's
  actor by its kind's name, so a file named anything else is never loaded, and a file named
  after a plugin is loaded as the actor of that plugin's row. Beside them, `assets/` holds the
  game's data files and art, and beside those what they are made from, which the game never reads:
  the script that draws, writes or cuts them is kept there, so they can be made again
  (`bringing-in-art`). `plugins/<name>/`, `addons/<name>/` and `extensions/<name>/` hold its own
  plugins, addons and extensions, laid out and named as the top-level ones are.
- `editor/` and `extensions/` sit beside the four folders and hold the editor, which is not part
  of any game.
- A kind is never named after its game, a scene or a plugin.
- A test sits beside the file it tests and is named after it. A kind's test boots its game's
  manager, drives seats, and reads what the kind wrote off the rows. An addon's or a plugin's
  test boots a scene it writes itself. A test outside `games/` never uses a game in `games/`: core
  ships none. No file, header, test or skill outside `games/` names a game in `games/` as an
  example or a model either; it cites core's own tests. An extension's test boots a scene it writes
  under the recorder and reads what changed off the rows and the files. (`proving-a-game`.)

## When something is missing

Build it in its home: in the game that needs it, set from the scene file and tested; it moves
to core when a second game needs it, and only with their yes (above). Then use it. Never
instead:

- work around it in the game: an actor importing another, a test faking what a plugin
  should do, a number written into code, a rule redoing what a plugin computes;
- give a plugin a setting only one game would set; that setting is that game's actor;
- edit the engine;
- leave a note that it is missing.

## When old code disagrees

Code that breaks this directive is never copied as a pattern. When it is in the way of the job,
migrating it is part of the job: every file that uses it and every test.

## When a doc disagrees

The code says what exists; this directive says where things go. A doc that disagrees with the
code is wrong and is fixed in the same change. A doc brought in line with the code says what the
code does; it never adds a rule for content to follow to get around what the base lacks. A doc
that disagrees with this directive about where something goes is wrong. This file is core's: it
is changed only in core, never in a game's job, and the lists in it are examples, so no content
change can make it wrong.

## The words

- scene: a scene file, how a world starts and which plugins it uses. The manager scene,
  `<game>.scene.json`, holds the game's scenes; each child scene is `<scene>.scene.json`.
- world: a scene's fixed numbers and settings, `world`, which no packet carries.
- prefab: what a new row of a kind starts as, its changing fields.
- actors: the rows a scene starts with, one entry each.
- row: one thing in the world. kind: what a row is. definition: a kind's fixed numbers, its entry
  in the game's data file.
- actor: a kind's code, its rule (`<kind>.sim.ts`) and its look (`<kind>.client.ts`).
- hook: a rule that runs every step, `before`, `tick` or `after`. act: something a row can be asked
  to do. open: the acts any seat may ask for, not only the one that possesses the row.
- spawn, end: make a row, take one out. seed, die: `world.seed` and `w.die()`, so the rolls are
  the same every time.
- truth: a running world. step: one tick of its time.
- seat: a player's place in a truth; slot: which one. possess: the row a seat plays as, its
  `player` row.
- message: a seat asking a row to act. packet: what a seat is sent each step, the rows it may see.
  piece: what decides what each seat may see and send.
- client: the page's side of a seat. pipe: what a client takes its packets from and sends its
  messages down, mounted by the `scenemanager` plugin. wire: a transport's page side, which `link`
  is handed; on the page, `plugins.wire` is what the client last took (`rows`, `n`, `scene`) and
  its `send`. transport: the addon that carries the packets and the messages.
- plugin, addon, mod, ledger, store, catalogue: as in "Every new thing has one home" and "What
  each home may do".
- extension: a piece of the editor. recorder: what holds a game's truths under the editor's clock.

## The work, by phase

Making the game:

- `starting-a-game`: a new game, from `yarn new-game` to the first thing of its own playing.
- `designing-a-kind`: a thing with rules, and things acting on each other.
- `designing-a-seat`: the `player` row is the thing the seat plays as, never a row it spawns; read
  before any `player.sim.ts` or `player.client.ts`.
- `input-and-seats`: how a player controls the game; seats, starts, presses, ledgers.
- `building-a-controls-screen`: the screen where a player sees and rebinds the controls.
- `building-a-level`: the place a game is played in.
- `bringing-in-art`: pictures, sheets, models and files into a game and drawn.
- `writing-the-look`: how a game looks, 2D or 3D.
- `scene-flow`: more than one scene: titles, menus, levels, game over.
- `session-flow`: the loop around play: a menu, a choice, joining a running scene and taking over a
  thing in it, respawn, a free-for-all, results and back to the menu, a fresh round.
- `building-the-hud`: what is drawn over the game.
- `sound`: sound and music.
- `tuning-feel`: movement, physics, cameras, and the numbers that make it feel right.
- `guide-to-smooth-gameplay`: drawing between steps, a teleport (`userData.teleport`), and anything
  that slides, streaks, judders or pops on screen.
- `building-a-plugin`: a plugin, an addon or a mod, top-level or a game's own.
- `building-an-extension`: anything added to the editor.
- `proving-a-game`: tests, bots, the simulator, replay, playing it.
- `experimenting-with-features`: a feature nobody knows the behaviour of yet, found one visible step at
  a time in a scene of its own through the game's `dev.html`, Bill checking each step.
- `porting-a-game`: a game that exists elsewhere, brought into core.
- `auditing-a-game`: a game checked against every rule above and moved into its homes.

Distributing the game:

- `going-multiplayer`: playing with other people over a network.
- `persisting-players`: who a player is, and what is kept for them.
- `committing-a-game`: what of a game is committed: its source and its baked art, never the raw
  parts its bake reads from the library.
- `publishing-a-game`: getting a game to people, and keeping its repo alongside core.

Using a plugin, the whole of one top-level plugin in one place, `using-<plugin>`:

- `using-terrain3d`: the 3D ground, its field file, its queries, its rings and its mods.
- `using-3d-physics`: box3d, box3dvehicle, walker, hitscan3d, volley3d, flight3d, ragdoll3d,
  interact and cover3d, and which mods make a thing solid, stood on or hit in each.

## Questions never asked

- Should this go in the engine? No.
- Addon or plugin? Question 4 or question 5.
- Should this go in `plugins/` or `addons/` because it is general? No: one game uses it, so it is
  that game's. A new top-level one is asked of the person you are working for in planning, every time.
- Can this number go in the code? No: the scene file.
- Should this plugin get a setting so one game can…? No: that game's actor.
- Can where each seat starts go on `world`, as `pads` or `spawns`? No: a `start` actor per
  slot, which the seat's `player` finds by `slot`.
- Can this fixed data ride on the row because the row is easy to reach? No: `world`, the
  definition or a data file. A row is copied to every seat every step.
- Can a plugin with no row, or only a browser half, keep its fixed numbers in a prefab? No:
  `world.<plugin>`. A prefab is what a row starts as, and holds only what changes.
- Should every game move to `control` so input mapping is everywhere? No: a game moves when it wants
  its player to rebind, and `bind` stays for the rest.
- Can a game's rebound keys go on a row or be sent to the server? No: they are the store's, the page's.
- Should the page do this? No.
- Can I play this scene directly, or override this value to see what happens? Yes, in `dev.html`,
  and in no other page or file.
- Should I work around this for now? No: build it in its home.
- Should I rewrite this directive, or add a rule to a doc, so my workaround is allowed? No: the
  directive is core's, and a doc says what the code does.
- Should the editor get a panel for this plugin? No: the plugin ships it, `<p>.extension.tsx`.
- Should the editor run the game in an iframe, a worker or behind a port? No: in the page, as
  `index.html` does, or on node, as `<game>.server.ts` does.
- Does the engine need to hand out its state so the editor can go back? No: the recorder replays.
- Should plugin `p` import plugin `a` to use what `a` knows? No: `a` writes a mod for `p`,
  `plugins/<a>/<a>.<p>.ts`, and the scene names it in `world.<p>.mods`.
- Can a plugin take a field naming the plugin it stands on, `ground: 'terrain3d'`, and look it up
  with `plugins[ground]`? No: a `land` mod, `terrain3d.<p>.ts`, named in `world.<p>.mods`.
- Can `p` read `world.<a>` for one of `a`'s numbers? No: `a` hands it out, a method on `plugins.<a>`
  or a mod.
- A game's plugin needs a top-level plugin's knowledge, and the top-level plugin can't name the
  game's. Where does the mod go? Beside the game's plugin, `games/<game>/plugins/<p>/<a>.<p>.ts`.
- Should a mod check that its plugin is listed, or listed first? No: `p` does, with `provided` or
  `ahead`, since `p` knows when it reads.
- Should this piece carry its own packets, just this once? No: it takes a transport (The wire).
- Should scenemanager move into the engine? No: it is a layer over truths, which the engine
  is one of.
- Do you want the full version? Always.

Ask the person making the game what it should do: what a monster does, how a level plays. That is
content, and it is theirs.
