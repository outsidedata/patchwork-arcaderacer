---
name: starting-a-game
description: Use when starting a new game in core or a clone of it, from `yarn new-game <name>` to the first thing of its own playing. Triggers on "make a new game", "new game", "start a game", "set up a game folder", "what is this file in my game for" (`<game>.scene.json`, `<scene>.scene.json`, `<scene>.sim.ts`, `start.sim.ts`, `player.sim.ts`, `assets/<game>.json`, `index.html`, `client.html`, `<game>.server.ts`), where a new game's first numbers go, giving a scene a seed, adding the game's first kind of its own, its first texture or model (`assets/cc0-textures.json`, `assets/<game>.bake.ts`, `yarn bake <game>`, never a fetch script of its own or jpgs in `assets/`), writing a `dev.html` testbed, serving the game with `yarn dev`, playing it in one tab, and running it on node against its server with `client.html`.
---

# Starting a game

A game is a folder of `games/`, made by `yarn new-game <name>`, that plays one scene with one seat
the moment it is written. This skill takes it from there to the first thing of its own playing: what
each file is for, where its first numbers go, how a second kind joins it, the `dev.html` testbed, and
how it is opened and played.

It applies from an empty `games/` to a game whose own first kind plays in one tab and against its
server. The seat, its `player` row and what it plays as are the `designing-a-seat` skill's. How a
kind is designed past that first one, its rule, its look, which of its numbers are on its row and
which on its definition, is the `designing-a-kind` skill's. Keys, actions, remapping and a second
seat's input are `input-and-seats`'. Where anything else goes is `prime-directive`'s.

## Making it

From the repo's root, `yarn new-game <name>` (`scripts/new-game.ts`) writes `games/<name>/`: one
scene, `main` (`play` for a game named `main`, whose manager is `main.scene.json`), 960 by 540, on
the port after the highest the games in `games/` use, or 9001. It prints the files and the port. It
refuses, writing nothing, a name that is not a lower-case letter then letters, digits and underscores,
`start`, `player` or `body` (the new game's kinds), the name of a plugin or an addon (`plugins/<name>`,
`addons/<name>`), and a game that is there. The header of `scripts/new-game.ts` lists the files.

Name the game after the game, never after a kind it will have: `<game>.sim.ts` is the manager's, and
a kind's rule is `<kind>.sim.ts`, so a kind named as its game would be the manager's file.

The game folder is yours: in a clone of core it is committed to your repo like any other file
(`README.md`, Your repo).

## An empty shell

An empty shell is exactly what `yarn new-game <name>` writes, plus the basic `dev.html`
(`using-the-dev-page`, The basic page), and nothing else. Asked for a new game, an empty shell or a
simple shell, run `yarn new-game <name>`, write the basic `dev.html` with the game's name in place of `<game>`, and
stop. No other file is changed, added or deleted, nothing is folded, and no test, typecheck or server
is run.

## What the folder holds

- `<game>.scene.json`, the manager. `"plugins": ["scenemanager"]`, `"seats": 1` (which nothing
  reads: no connection is seated on the manager, and each scene's own `seats` counts), one
  `actors` entry for the `scenemanager` row, an `engine` prefab whose `dt` the page and the server
  step it by, and
  the `scenemanager` prefab: `scenes` (each scene's name to `{ file, suspend }`), `dt`, `entry` (the
  scene every connection enters) and `port` (which the server serves and `client.html` dials; no two
  games share one). Its `world` and `prefabs` are under every scene's own, key by key, so a value
  every scene uses, a plugin's `world.<plugin>` say, is written once here. A new scene is a new entry
  of `scenes`. The whole of what a game folder holds is the header of
  `addons/scenemanager/scenemanager.addon.ts`.
- `<game>.sim.ts`: `export const sim: Sim = { scenemanager }` and nothing else.
- `main.scene.json`, the scene. Its `world` names the definitions (`defs`) and holds the asset
  catalogue (`loader.assets`). Its `plugins` are `loader`, `scenemanager`, `player`, `render2d` and
  `stats`, three.js's frame-rate panel, which has no row and no prefab and shows only on a page that
  mounts it, `dev.html` (`plugins/stats/stats.plugin.ts`, `using-the-dev-page`); `seats` is 1. Its `prefabs`: `engine` (`dt`, and the `width` and `height` the page makes its canvases
  at), `scenemanager` (`out: {}`), `loader`, `player`, `start` and `body`. Its `actors`: the
  scenemanager's row, the loader's, and slot 0's `start` at the canvas's middle. It gives render2d no
  `world.render2d`, so its points are the canvas's pixels (`plugins/render2d/render2d.plugin.ts`).
  `world.scenemanager` is the scenemanager's own, written as the scene loads (its `actors` list and
  the game's folder, `home`); a scene file never writes it.
- `main.sim.ts`: imports each kind's rule and lists it in `sim`, and exports the scene file as
  `scene`. The scenemanager imports this file, never the JSON beside it, so the two are always the
  pair. Every kind the scene makes rows of is listed here, one whose prefab only the manager gives
  included.
- `start.sim.ts`: `export const start: Kind = {}`, where a seat starts. No rule, no look.
- `player.sim.ts`, `player.client.ts`, `body.sim.ts` and `body.client.ts`: the seat, its keys and
  the square it moves, as the template writes them. What the seat's `player` row is and plays as is
  `designing-a-seat`'s.
- `assets/<game>.json`: the definitions, one entry per kind, every number of it that never changes.
  A rule reads one with `def(w, me.kind)`, an actor with `def(plugins.wire, row.kind)`, both from
  `plugins/loader/loader.sim.ts`.
- `index.html`, `client.html`, `<game>.server.ts`: the pages (below).
- `<game>.sim.test.ts`: the manager booted as the page boots it, as the template writes it.

It writes no `dev.html` (the basic one is written beside it: `using-the-dev-page`), no `world.seed`
and no `world.render2d`; each of the last two is added when the game needs it.

## Names

A file in a game folder is named after a kind, a scene or the game. The page loads a row's look as
`<kind>.client.ts` beside it (`engine/browser.ts`): a look named anything else is never loaded, and a
file named after a plugin is loaded as the look of that plugin's row, so a `loader.client.ts` in the
folder is set up on the loader's row. A kind's rule is `<kind>.sim.ts`, which the scene's
`<scene>.sim.ts` imports. `assets/` holds the data
files and the art; `plugins/<name>/` and `addons/<name>/` hold the game's own,
laid out and named as the top-level ones are.

## Where the first numbers go

Every number a game has is in its scene file or in a data file the scene names, so anyone reading the
scene finds every knob. None is written in code. Ask of each one, in order:

- It changes while the game runs: its starting value is a field of its kind's prefab in the scene
  file, `prefabs.<kind>`, and the row carries it from there. An `actors` entry writes its own fields
  over the prefab for the one row it makes. A prefab holds what changes and nothing else.
- It never changes and is a kind's: its definition, `assets/<game>.json` under the kind's name. No row
  carries it, because a row is sent to every seat every step.
- It is the scene's own, one of a few: a field of that scene file's `world`, which no packet carries.
  One every scene shares goes in the manager's `world`.
- It is a plugin's fixed number: `world.<plugin>`, in the manager's `world` when every scene uses it.
- It is big, a level say: a data file of its own in `assets/`, an entry of the catalogue.
- It is where a seat starts: a `start` actor in the scene file, one `actors` entry per slot, holding
  `slot` and `pos` and whatever the thing it becomes starts with (a `look`, a heading, a speed). Never
  `world.pads`, `world.spawns` or `world.starts`, and never a list of places in a definition. A start
  is an actor because it is a place in the level.

The canvas's `width` and `height` are the scene's `engine` prefab, and they size the page's canvases.
A rule never sees a prefab (`W` in `engine/engine.ts` has none), so a number a rule needs about the
field is written where the rule reads it: on the kind's definition when it is that kind's own, where
a coin may land; on the scene's `world` when every kind shares it, the field things wrap across.

Every file the game reads is an entry of its scene's catalogue, `world.loader.assets`, as the
definitions are when the game is made, and reaches whatever uses it through the loader and nothing
else. Nothing else fetches a file or writes its path in code. A url there is the file's path from the
repo's root, `/games/<game>/assets/<game>.json`; in a tab it is fetched from the page's server, and on node
the loader reads it under the working directory, which is why the server is started from the repo's
root.

The seed. `w.die()` is the scene's own seeded random, and it is seeded from the scene's
`world.seed`. A new scene has none, and the first roll throws `scene has no seed` on the step that
rolls it, not at boot. A scene whose rules roll the die gives its `world` a `seed`. Each scene has its
own die and its own count of rolls, and a `suspend: true` scene nobody is in keeps its count where it
was. A rule never calls `Math.random`: the recorder goes back in time by booting again and replaying
what reached the truth (`addons/recorder/recorder.addon.ts`), which reproduces the die's rolls
exactly and could not reproduce those.

## The first thing of its own

A kind of its own that the seat sees and that starts from the scene file is, in this order (here a
coin that jumps somewhere new when the seat's thing reaches it):

1. Its prefab in the scene file, the fields that change and nothing else:
   `prefabs.coin: { "pos": [0, 0], "taken": 0 }`.
2. Its `actors` entry, the row the scene boots with, standing where the scene says:
   `{ "is": "coin", "pos": [640, 270] }`.
3. Its definition in `assets/<game>.json`: `coin: { "reach": 24, "size": 16, "colour": "#5ad1e8",
   "bounds": [[16, 16], [944, 524]] }`.
4. Its rule, `coin.sim.ts`, exporting `export const coin: Kind = { … }`, reading every fixed number
   with `def(w, me.kind)`.
5. Its look, `coin.client.ts`, exporting `setup`, `tick` and `remove`, drawing on
   `plugins.render2d.stage` with its definition's `size` and `colour` read with
   `def(plugins.wire, row.kind)`.
6. Its import and its name in `main.sim.ts`'s `sim`. A scene whose `actors` name a kind its `sim`
   does not list fails to load with `no code for kind coin`; one with no prefab for it, with `no prefab
   for coin`.
7. A `world.seed` in the scene file, when its rule rolls the die.

The seat sees it without anything more: in a scene with no `security` block and no `vision`, every
seat is sent every row, the other seats' `player` rows without their `mine`
(`addons/player/player.addon.ts`).

## Its first art, and its bake

The first texture or model a game draws comes in the way it will ship, from the start: there is no
"for now" file that is fixed at the commit. The rule is `bringing-in-art` (Where a file and its entry
go) and the check is `committing-a-game`; what a new game sets up for it is:

- **Textures from cc0-textures.com** (a ground, a wall, a floor) are named in
  `games/<game>/assets/cc0-textures.json`, `{ folder, sizes, sets: { <name>: { set, maps } } }`, each
  `set` a name in the library's list (`textures/cc0-textures.json` in `PATCHWORK_LIBRARY`), each map
  `color`, `normal` or `roughness` (the header of `scripts/cc0.ts`). `yarn bake <game>` downloads the
  set into the library once and cuts each map to `assets/<folder>/<name>-<map>-<size>.webp`, which the
  scene's catalogue names and the game commits. A set not in the library's list is swapped for one
  that is. The game never fetches a set itself: no script of its own that downloads a zip and writes
  jpgs or pngs into `assets/`, and no full-size map copied in.
- **A model a script builds** (a Blender script of the game's, in `assets/<model>/`) is run by the
  game's `assets/<game>.bake.ts`: `blender` into the bake's `scratch`, then `pack` into the glb the
  catalogue names, so the game commits the script and the packed glb, never Blender's raw export
  (`scripts/bake.ts`, its header).
- **Art a script draws from nothing** (a sprite sheet, a sound from a recipe) is that script, kept
  beside what it writes, and what it writes; it reads nothing from the library.

`yarn bake <game>` then `node .claude/skills/committing-a-game/scripts/raw.mjs games/<game>` says
there is no raw file before the game is committed the first time.

## The pages

Every game has the same two pages, line for line but the files they import (prime directive, The
pages), and `dev.html`, which is its own:

- `index.html`: the truth in this tab, over a `loopback`, stepped by the page's clock, with no
  prediction and no lag: a press lands on the next step in the same tab. It boots and loads the
  manager, makes the page's view of it, `view(link(loopback(accept(manager(truth)))), file,
  import.meta.url, mount)`, where `mount` makes a canvas the scene's `engine` size for its renderer
  and one for `ui` when the scene names it, and on `requestAnimationFrame` calls `page.input()`, so
  what the page reads once a frame (the gamepads, the mouse) goes up before the steps; steps the
  manager by `engine.dt`; then calls `page.frame(owed / dt)`: what the loop still owes over a step's
  seconds, so every renderer draws each thing between where the last two steps put it, as smoothly
  at 144 Hz as at 60 (`engine/browser.ts`, Input before the steps, Drawing between steps). A key goes
  up the moment it goes down. It is one seat on a truth of its own: a second tab is a second game.
  `yarn new-game` writes it so.
- `client.html`: one seat on `<game>.server.ts`, dialled over a socket on the manager's `port`.
  Running the seat's scene ahead on the page is `designing-a-seat`'s.
- `<game>.server.ts`: boots and loads the manager, `serve(manager(truth).data.port,
  accept(manager(truth)))`, and `run(truth)`, which steps it as often as the clock owes a step.
- `dev.html`: the one page that is the game's own, a testbed, any readout, any number of seats
  (`using-the-dev-page`). A cpu driver, a network panel, a readout, two panes go there, never in
  `index.html` or `client.html`.

A page mounts things. It holds no rule, number, readout, listener or scene name, and every line of it
is the same in every game but the file names it imports. Nothing about how the game plays is changed
by editing a page: the change goes into the scene file, a data file, an actor or a plugin, and
`index.html`, `client.html` and `<game>.server.ts` stay as above.

Every page is written by `gameFiles` in `scripts/new-game.ts`, so a change to what the
pages do is made there, never in one game's page. A page added to `gameFiles`, or a page changed
there, is written into every game in `games/` in the same change, with that game's names, so every
game keeps the pages a new one gets.

## The testbed: `dev.html`

`dev.html`, beside `index.html`, is where the game is played to find something out, and the one place
a shortcut is allowed: `index.html` with changes made to the page's own copy of the scene files in
memory and to the plugins its client holds, never to a file. How it is built, from the basic page
every game starts with to everything the game pages do in it (the stats panel, the profiler hooks,
the overrides before the boot, the lil-gui panel wired so it never breaks the game's keys, mouse or
dropdowns, live tuning, wrapping a plugin, taking the camera, time, errors, readouts, bots, networks,
audio), is `using-the-dev-page`.

Nothing of it bleeds out. `index.html`, `client.html` and `<game>.server.ts` are written as if it did
not exist; no scene file, rule, actor, plugin, addon or test imports it, reads what it
set, or asks whether it is running, and the game plays the same with it deleted. What it finds out
that the game needs is built in its home (a number into the scene file or the definitions, a rule into
its actor) and reaches `index.html` through the files, never by copying a line of `dev.html` across.

## Opening and playing

`yarn dev`, from the repo's root, serves every page of every game:
`localhost:5173/games/<game>/index.html`, `dev.html` and `client.html`. `localhost:5173` itself
lists every game in `games/` with a link to each of its pages, and beside `dev` a link to
`dev.html?scene=<scene>` for each scene its manager names; a game whose server runs under `yarn
serve` says so, with its port (`scripts/home.ts`). `yarn dev --port <n>`
serves on another port. A page is built again each time it is asked for (`vite.config.ts`), so a
change to the game's files reaches it on the next reload.

Played in one tab, the game is `index.html`. Played against its server, it is

```
yarn serve <game>
```

which serves the pages as `yarn dev` does and runs `games/<game>/<game>.server.ts` on node beside
them, listening on the manager's `port` and started again on every change to a file it runs, and a
tab of `client.html` per seat; it prints the `client.html` address. Stop it with ctrl-C when you are
done with it: the server holds its port.

A new scene has `"seats": 1`, so a second `client.html` against the server is refused (`no seat
free: 1 declared`, and its socket closed with 1013). A second seat is the scene's `seats` raised and a
`start` entry for slot 1, `{ "is": "start", "slot": 1, "pos": [x, y] }`. What the second
seat presses and sees is `input-and-seats`'. Chrome stops `requestAnimationFrame` in a tab behind
another, so of two tabs in one window only the front one plays; the server keeps stepping.

## What goes wrong

- The server started from inside `games/<game>/` (`node --experimental-strip-types
  <game>.server.ts`) cannot read the definitions: the loader reads each url under the working
  directory and fails with `loader <game>: loader could not read /games/<game>/assets/<game>.json:
  ENOENT`. Start the server from the repo's root.
- A rule rolls `w.die()` and the scene has no `world.seed`: `scene has no seed`, thrown the first step
  it rolls.
- A kind is written and placed but not listed in its scene's `sim`: `no code for kind <kind>`. Or
  listed with no prefab: `no prefab for <kind>`.
- A fixed number is put on the prefab or on an `actors` entry because the row is easy to reach. It is
  the kind's definition: a row is copied to every seat every step.
- Where a seat starts is put on `world` or in a definition. It is a `start` actor per slot, which the
  `player` row finds by `slot`.
- A file in the game folder is named for what it does (`helpers.ts`, `coins.ts`). The page loads a
  look or a rule by the kind's name and nothing else, so a kind's files are named after the kind, and
  code its kinds share is a plugin of the game's own in `games/<game>/plugins/<name>/`, never one
  actor importing another (`designing-a-kind`).
- `index.html` is edited to try something out, or a line of `dev.html` is copied into it. The trial
  is `dev.html`'s, and what it found goes into the files.
- A port is copied from another game. `yarn new-game` gives each game its own; two games on one port
  cannot both run.
- A second tab of `index.html` is taken for a second seat. It is a second game. Seats on one game are
  tabs of `client.html` against its server.
- A game given a fetch script of its own that downloads cc0-textures sets and writes full-size jpgs
  into `assets/`: megabytes of raw pictures in the game's repo, which `raw.mjs` names, and sets the
  library never holds. The sets are named in `assets/cc0-textures.json` and the bake cuts them to
  `.webp` (Its first art, and its bake).
