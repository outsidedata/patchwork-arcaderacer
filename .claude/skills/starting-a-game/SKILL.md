---
name: starting-a-game
description: Use when starting a new game in core or a clone of it, from `yarn new-game <name>` or the editor's File → New Game to the first thing of its own playing. Triggers on "make a new game", "new game", "start a game", "set up a game folder", "what is this file in my game for" (`<game>.scene.json`, `<scene>.scene.json`, `<scene>.sim.ts`, `start.sim.ts`, `player.sim.ts`, `assets/<game>.json`, `index.html`, `client.html`, `<game>.server.ts`), folding the `body` the template writes into the seat's `player` row and writing `client.html` again with `predict` and the scene's `world.predict`, the press test `<game>.predict.test.ts`, where a new game's first numbers go, giving a scene a seed, adding the game's first kind of its own, its first texture or model (`assets/cc0-textures.json`, `assets/<game>.bake.ts`, `yarn bake <game>`, never a fetch script of its own or jpgs in `assets/`), writing a `dev.html` testbed, opening the game with `yarn editor <game>`, playing it in one tab, and running it on node against its server with `client.html`.
---

# Starting a game

A game is a folder of `games/`, made by `yarn new-game <name>`, that plays one scene with one seat
the moment it is written. This skill takes it from there to the first thing of its own playing: what
each file is for, where its first numbers go, how a second kind joins it, the `dev.html` testbed, and
how it is opened, played and proven.

It applies from an empty `games/` to a game whose own first kind plays in one tab and against its
server. How a kind is designed past that first one, its rule, its look, which of its numbers are on
its row and which on its definition, is the `designing-a-kind` skill's. Keys, actions, remapping and a
second seat's input are `input-and-seats`'. Where anything else goes is `prime-directive`'s.

## Making it

From the repo's root, `yarn new-game <name>` (`scripts/new-game.ts`) writes `games/<name>/`: one
scene, `main` (`play` for a game named `main`, whose manager is `main.scene.json`), 960 by 540, on
the port after the highest the games in `games/` use, or 9001. It prints the files and the port. It
refuses, writing nothing, a name that is not a lower-case letter then letters, digits and underscores,
`start`, `player` or `body` (the new game's kinds), the name of a plugin or an addon (`plugins/<name>`,
`addons/<name>`), and a game that is there.

The editor's File → New Game… (the Games panel, and the `games.new` command for an LLM) writes the
same files through `make` in `extensions/games/games.route.ts`, whose header lists them. It asks the
game's name, its scene's name and its canvas's width and height (the form starts at `main`, 960 by
600). Beside what `yarn new-game` refuses, it refuses a scene name that is not lower-case letters,
digits and dashes, a scene named as the game, and a size that is not a whole number of pixels from 1
to 8192; so a game named `main` is refused until its scene is renamed, where `yarn new-game` names
that scene `play` itself. It goes to the new game's page. No undo takes it back.

Name the game after the game, never after a kind it will have: `<game>.sim.ts` is the manager's, and
a kind's rule is `<kind>.sim.ts`, so a kind named as its game would be the manager's file. The editor's
New kind refuses the game's own name for the same reason.

The game folder is yours: in a clone of core it is committed to your repo like any other file
(`README.md`, Your repo). Run its test at once, before changing anything:

```
yarn vitest run games/<name>/<name>.sim.test.ts
```

Then, before anything else, fold the `body` it wrote into the `player` row (Fold the body into the
player row, below). The template (`gameFiles` in `extensions/games/games.route.ts`) still writes the
seat's square as a `body` row that the `player` row spawns and forwards its keys to, and a
`client.html` that does not run the scene ahead. That pattern drew the controlled thing of every game
in core a round trip after its key. The editor and its routes are on hold, so the template is not
changed: every new game is folded by hand, and the `body` files are never read as the model of
anything.

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
  catalogue (`loader.assets`). Its `plugins` are `loader`, `scenemanager`, `player` and `render2d`;
  `seats` is 1. Its `prefabs`: `engine` (`dt`, and the `width` and `height` the page makes its canvases
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
- `player.sim.ts`: the row a seat possesses. `addons/player/player.addon.ts` spawns it when a
  connection takes a slot, writes the slot into `seat` and `mine: true`, and sends it to every seat,
  `mine` to its own seat alone. As written, its `before` finds the start of its slot, spawns a `body`
  there and keeps the body's id, and its `move` hands the press on to the body with `w.call`: the
  pattern the fold takes out.
- `player.client.ts`: the arrow keys bound as a stick with `plugins.player.bind`, sent as `move`, for
  every row it is loaded for. Its keys and how they are bound are `input-and-seats`'.
- `body.sim.ts` and `body.client.ts`: the seat's square on a row of its own, run and drawn, which ends
  itself when no `player` row names it. The fold moves all of it onto the `player` row and deletes
  both files.
- `assets/<game>.json`: the definitions, one entry per kind, every number of it that never changes.
  A rule reads one with `def(w, me.kind)`, an actor with `def(plugins.wire, row.kind)`, both from
  `plugins/loader/loader.sim.ts`.
- `index.html`, `client.html`, `<game>.server.ts`: the pages (below). `client.html` as written does
  not wrap its link in `predict`; the fold writes it again.
- `<game>.sim.test.ts`: the manager booted as the page boots it, a seat joined, its body on its start,
  and `move` running it; the fold points it at the `player` row.

It writes no `dev.html`, no `world.seed`, no `world.render2d` and no `world.predict`. The fold adds
`world.predict`; each of the others is added when the game needs it. A game whose seat stands
nowhere, a quiz or a hand of cards, takes out the start and the `pos`, `placed` and `before` that use
it, and keeps `player.sim.ts` and `player.client.ts` as the seat's row, the thing it plays as, and its
binding (`input-and-seats`, Where a seat starts).

## Fold the body into the player row

The `player` row is the thing the seat plays as (`designing-a-seat`), and the `body` the template
writes is a second row standing in for it. So, in one change, on a game named `<game>` whose scene is `<scene>`
(`main`, or `play` for a game named `main`):

1. `<scene>.scene.json`: the `player` prefab takes the body's fields and a mark that it stood,
   `"player": { "seat": 0, "placed": false, "pos": [0, 0], "move": [0, 0] }`; the `body` prefab goes.
   `world` gains the block that runs the scene ahead (`addons/rewind`, `predicts`):
   `"predict": { "epsilon": 0.000001, "cutoff": 60, "halflife": 100, "snap": 5, "below": 0.001 }`,
   the block core's scenes give. `epsilon`, `snap` and `below` are in the rows' units, here the
   canvas's pixels; `cutoff` is whole steps the server may go back; `halflife` is milliseconds (`going-multiplayer`, A scene run ahead). Every scene a seat plays in gives it.
2. `assets/<game>.json`: the `body` entry becomes the `player` entry, `"player": { "speed": 240,
   "size": 32, "colour": "#e8c547" }`, its numbers as they were.
3. `player.sim.ts`: the body's rule on the player row. `Math.hypot` becomes `math.hypot` from
   `plugins/math`, since the page's copy runs this rule too and `games/games.test.ts` fails a rule
   that calls `Math.hypot` (`designing-a-kind`, Maths in a rule):

   ```ts
   // The seat's square, its `player` row. `addons/player` spawns it when a connection takes a slot,
   // writes that slot into `seat`, and `mine: true` on the copy its own seat is sent; every seat is
   // sent it. A page running the scene ahead (`addons/predict`) draws its own from its copy, so the
   // square answers the key on the next frame. `before` stands it once on the scene's `start` actor
   // for its slot, at that start's `pos`, and marks it `placed`. `move` is the way the seat's keys
   // point, kept to a unit's length at most; each step the square runs its definition's `speed` along
   // it, in the canvas's pixels a second (`assets/<game>.json`).
   import type { Kind } from '#engine/engine.ts'
   import { def } from '#plugins/loader/loader.sim.ts'
   import * as math from '#plugins/math/math.sim.ts'

   export const player: Kind = {
     before(me, _dt, w) {
       if (me.data.placed) return
       me.data.pos = [...w.find('start', s => s.data.slot === me.data.seat).data.pos]
       me.data.placed = true
     },
     tick(me, dt, w) {
       const [x, y] = me.data.move
       if (!x && !y) return
       const step = def(w, me.kind).speed * dt
       me.data.pos = [me.data.pos[0] + x * step, me.data.pos[1] + y * step]
     },
     acts: {
       // A way across the canvas, from the page: two numbers, kept to a unit's length at most.
       move(me, _w, _seat, x: unknown, y: unknown) {
         if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return
         const len = math.hypot(x, y)
         me.data.move = len > 1 ? [x / len, y / len] : [x, y]
       },
     },
   }
   ```

4. `player.client.ts`: the body's look, drawn for every seat's row, and the keys for the row that is
   `mine` alone, since the file is loaded once for every `player` row the page is sent:

   ```ts
   // One seat's square, its `player` row, drawn for every seat: a square of the player's definition's
   // `size` and `colour` in `assets/<game>.json`, centred on the row's `pos`, on render2d's stage in
   // the canvas's pixels. A page running the scene ahead draws its own seat's row from its copy, so its
   // own square moves on the frame after the key. For the row that is `mine` alone, its keys: the
   // arrows are a stick, the way they point sent as `move`, y growing down the canvas.
   import type { Row } from '#engine/engine.ts'
   import type { Plugins } from '#engine/browser.ts'
   import { def } from '#plugins/loader/loader.sim.ts'
   import type { Binds } from '#plugins/player/player.plugin.ts'

   let square: any
   let ours = false

   export function setup(row: Row, plugins: Plugins) {
     const { size, colour } = def(plugins.wire, row.kind)
     square = new plugins.render2d.PIXI.Graphics().rect(-size / 2, -size / 2, size, size).fill(colour)
     plugins.render2d.stage.addChild(square)
     tick(row)
     ours = row.data.mine === true
     if (!ours) return
     plugins.player.bind({
       stick: [{ keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], send: (x, y) => ['move', x, y] }],
     } satisfies Binds)
   }

   export function tick(row: Row) {
     square.position.set(row.data.pos[0], row.data.pos[1])
   }

   export function remove(plugins: Plugins) {
     plugins.render2d.stage.removeChild(square)
     square.destroy()
     if (ours) plugins.player.unbind()
   }
   ```

5. `body.sim.ts` and `body.client.ts` are deleted; `<scene>.sim.ts` drops `body`'s import and its
   name in `sim`, `{ scenemanager, loader, player, start }`, and its header and `start.sim.ts`'s say
   the seat's square, which the `player` row stands on its start, where they said the body.
6. `client.html` is written again as every game's is (prime directive, The pages; The pages, below):
   the link wrapped in `predict`, `page.input()` then `await page.frame(now)` each frame.
7. `<game>.sim.test.ts` finds the seat's row with `possessed` and reads the square there:

   ```ts
   // <game>: the manager booted as its page boots it and <scene> loaded; a seat joins, its `player`
   // row, its square, stands on its slot's start, and runs its definition's `speed` along the way
   // `move` sends.
   import { expect, test } from 'vitest'
   import { boot, type Scene } from '#engine/engine.ts'
   import { connection, load, manager, type Down } from '#addons/scenemanager/scenemanager.addon.ts'
   import { possessed } from '#addons/player/player.addon.ts'
   import { sim } from './<game>.sim.ts'
   import file from './<game>.scene.json' with { type: 'json' }
   import defs from './assets/<game>.json' with { type: 'json' }

   const DT = file.prefabs.engine.dt

   test('a seat joins <scene>, its square stands on its start, and move runs it', async () => {
     const truth = boot(file as Scene, sim)
     const room = (await load(truth, import.meta.url)).get('<scene>')!
     const heard: Down[] = []
     const seat = connection(manager(truth), d => heard.push(d))
     truth.step(DT)
     const last = heard[heard.length - 1]
     const me = possessed(last.packet.rows)!
     const square = () => room.rows.find(r => r.id === me.id)!
     const start = room.rows.find(r => r.kind === 'start' && r.data.slot === me.data.seat)!
     expect(square().data.pos).toEqual(start.data.pos)

     seat.take({ scene: last.scene, seat: last.seat, msg: { seq: 1, n: last.packet.n, id: me.id, action: 'move', args: [1, 0] } })
     for (let i = 0; i < 30; i++) truth.step(DT)
     expect(square().data.pos[0]).toBeCloseTo(start.data.pos[0] + defs.player.speed * DT * 30)
     expect(square().data.pos[1]).toBe(start.data.pos[1])
   })
   ```

8. `<game>.predict.test.ts`, the press test: a predicting page on the game's server over loopbacks,
   a clean wire and bad ones, a `move` sent every frame, and on every frame the square the page draws
   has taken every press sent up to the frame before. Its whole text for this game is in
   `going-multiplayer` (How it is proven).

Then run both tests, `yarn vitest run games/<game>/<game>.sim.test.ts` and
`yarn vitest run games/<game>/<game>.predict.test.ts`, `yarn tsc`, and `yarn vitest run
games/games.test.ts`, which holds every game's rules to `plugins/math`; and play `client.html`
against the server: the square moves on the frame after the arrow goes down.

## Names

A file in a game folder is named after a kind, a scene or the game. The page loads a row's look as
`<kind>.client.ts` beside it (`engine/browser.ts`): a look named anything else is never loaded, and a
file named after a plugin is loaded as the look of that plugin's row, so a `loader.client.ts` in the
folder is set up on the loader's row. A kind's rule is `<kind>.sim.ts`, which the scene's
`<scene>.sim.ts` imports. `assets/` holds the data
files and the art; `plugins/<name>/`, `addons/<name>/` and `extensions/<name>/` hold the game's own,
laid out and named as the top-level ones are. A test sits beside the file it tests and is named after
it: `coin.sim.test.ts` beside `coin.sim.ts`.

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
  is an actor because it is a place in the level: the editor shows it, selects it and drags it.

The canvas's `width` and `height` are the scene's `engine` prefab, and they size the page's canvases.
A rule never sees a prefab (`W` in `engine/engine.ts` has none), so a number a rule needs about the
field is written where the rule reads it: on the kind's definition when it is that kind's own, where
a coin may land; on the scene's `world` when every kind shares it, the field things wrap across. It
says again what the `engine` prefab says, so a test reads both files and checks them together: the
world's field equal to `engine.width` and `engine.height`, a kind's bounds inside them.

Every file the game reads is an entry of its scene's catalogue, `world.loader.assets`, as the
definitions are when the game is made, and reaches whatever uses it through the loader and nothing
else. Nothing else fetches a file or writes its path in code. A url there is the file's path from the
repo's root, `/games/<game>/assets/<game>.json`; in a tab it is fetched from the page's server, and on node
the loader reads it under the working directory, which is why the server and vitest are started from
the repo's root.

The seed. `w.die()` is the scene's own seeded random, and it is seeded from the scene's
`world.seed`. A new scene has none, and the first roll throws `scene has no seed` on the step that
rolls it, not at boot. A scene whose rules roll the die gives its `world` a `seed`. Each scene has its
own die and its own count of rolls, and a `suspend: true` scene nobody is in keeps its count where it
was. A rule never calls `Math.random`: the editor goes back in time by booting again and replaying
what reached the truth (`addons/recorder/recorder.addon.ts`), which reproduces the die's rolls
exactly and could not reproduce those.

## The first thing of its own

A kind of its own that the seat sees and that starts from the scene file is, in this order (here a
coin that jumps somewhere new when a seat's square, its `player` row, reaches it):

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
8. Its test, `coin.sim.test.ts` (Proof, below).

The seat sees it without anything more: in a scene with no `security` block and no `vision`, every
seat is sent every row, the other seats' `player` rows without their `mine`
(`addons/player/player.addon.ts`).

In the editor, the Kinds panel's New kind (`extensions/kinds/kinds.extension.tsx`) writes the kind as
one change and one undo. Made like another kind of the game, that kind's rule, look, prefab and
definition are copied under the new name, the prefab into the scene file that holds the other's.
Made blank, it is a rule that does nothing, the `sim` entry, and an empty prefab written into the
manager's file, `<game>.scene.json`, not the scene's; every scene still has it, since a scene's
prefabs are the manager's with its own over them, and it stays there unless it is moved. Place
(`extensions/actors/actors.extension.tsx`) writes an `actors` entry with a click on the game view, for
a kind its scene's sim lists, whose prefab the scene has, and which a placer can stand on a point. On
render2d that is a prefab with `pos` (`plugins/render2d/render2d.extension.tsx`), so a blank kind
gets `pos` in its prefab before the Actors panel lists it. The entry Place writes is `{ is, pos }`
and nothing else; every other field the row needs comes from the prefab or is written into the entry
by hand.

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
- `client.html`: one seat on `<game>.server.ts`, `tap(dial(url), wire => predict(link(wire), file,
  import.meta.url, mount))`, calling `page.input()` then `await page.frame(now)` each frame. Every
  scene a seat plays in gives `world.predict`, so the page runs it ahead and draws between steps: the
  seat's own `player` row from its copy, on the frame after the key, and every other row from the
  server's packets (`going-multiplayer`, step 7). With `?tap=<name>` in its address it records every
  frame (`addons/simulator/simulator.addon.ts`). `yarn new-game` writes it without `predict`, so the
  fold writes it again, as this, with the game's names in place of `<game>`:

  ```html
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title><game> client</title>
      <style>
        body { margin: 0; background: #0b0b0e; display: grid; place-items: center; height: 100vh }
        canvas { grid-area: 1 / 1 }
      </style>
    </head>
    <body>
      <script type="module">
        // One seat over a socket. The server is `node --experimental-strip-types games/<game>/<game>.server.ts`.
        // The page runs the scene its seat is on ahead of the server (`addons/predict`): it draws the
        // seat's own `player` row from its copy, on the frame after the key, and every other row from the
        // server's packets. The view `predict` makes holds one client, for the scene the seat is on, and
        // `mount` gives each one its canvases: the game's, and the UI's over it in the same grid cell, for
        // a scene that names each. `tap` records every frame when the page's address asks for it,
        // `?tap=<name>` (addons/simulator).
        import { link } from '#addons/scenemanager/scenemanager.addon.ts'
        import { predict } from '#addons/predict/predict.addon.ts'
        import { tap } from '#addons/simulator/simulator.addon.ts'
        import { dial } from '#addons/socket/socket.addon.ts'
        import file from './<game>.scene.json'

        const page = tap(dial(`ws://${location.hostname}:${file.prefabs.scenemanager.port}`), wire => predict(link(wire), file, import.meta.url, (me, scene) => {
          for (const surface of [me.plugins.render3d ?? me.plugins.render2d, me.plugins.ui]) {
            if (!surface) continue
            const canvas = document.createElement('canvas')
            canvas.width = scene.prefabs.engine.width
            canvas.height = scene.prefabs.engine.height
            document.body.appendChild(canvas)
            surface.mount(canvas)
          }
        }))

        const loop = async now => {
          page.input()
          await page.frame(now)
          requestAnimationFrame(loop)
        }
        requestAnimationFrame(loop)
      </script>
    </body>
  </html>
  ```

- `<game>.server.ts`: boots and loads the manager, `serve(manager(truth).data.port,
  accept(manager(truth)))`, and `run(truth)`, which steps it as often as the clock owes a step.
- `dev.html`: the one page that is the game's own, a testbed, any readout, any number of seats
  (The testbed, below). A cpu driver, a network panel, a readout, two panes go there, never in
  `index.html` or `client.html`.

A page mounts things. It holds no rule, number, readout, listener or scene name, and every line of it
is the same in every game but the file names it imports. Nothing about how the game plays is changed
by editing a page: the change goes into the scene file, a data file, an actor or a plugin, and
`index.html`, `client.html` and `<game>.server.ts` stay as above.

Every page is written by `gameFiles` in `extensions/games/games.route.ts`, so a change to what the
pages do is made there, never in one game's page. A page added to `gameFiles`, or a page changed
there, is written into every game in `games/` in the same change, with that game's names, so every
game keeps the pages a new one gets; the change is proven by its test making the page's views as its
lines make them, and by playing it (`proving-a-game`). While the editor is on hold `gameFiles` still
writes the `client.html` of before `predict`; the page above is the one every game has, and the
template is brought to it when the editor's work resumes.

## The testbed: `dev.html`

`dev.html`, beside `index.html`, is where the game is played to find something out, and the one place
a shortcut is allowed. Make it by copying `index.html` and adding lines before the boot. It may enter
any scene directly, override any value of a scene file, a prefab, `world` or a definition, start a
seat already carrying things, and add readouts and keys of its own. It boots, mounts and steps as
`index.html` does, over a loopback, so what it shows is the game; handed a clock and a `Net`, the
loopback is a network of any shape (`addons/loopback/loopback.addon.ts`). What it changes it changes
in the page's own copy in memory, never in a file.

The objects to change are the ones the page imports: the manager file, and the `scene` each
`<scene>.sim.ts` exports. The scenemanager imports those same modules when it loads, and the page's
view reads them again, so a change made before `load` is what the truth and the page both run, as the
editor's own edits of a running game are (`editor/session.ts`). Every change is made before `boot`
and `load`: the rows, the world and the die are made from the files then. A definition is changed in
the tab's one decoded copy of the definitions file, which `prepared` from the loader hands back and
which every rule and actor in the tab reads. The lines before the boot, in a game whose scene is
`main`:

```js
import { boot } from '#engine/engine.ts'
import { accept, load, manager, link, scene as truthOf, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { prepared } from '#plugins/loader/loader.sim.ts'
import { sim } from './<game>.sim.ts'
import { scene as main } from './main.sim.ts'
import file from './<game>.scene.json'

file.prefabs.scenemanager.entry = 'main'                       // enter a scene directly
const seed = new URLSearchParams(location.search).get('seed')
if (seed !== null) main.world.seed = Number(seed)              // a scene's world: `dev.html?seed=5`
main.actors.find(a => a.is === 'start').pos = [100, 100]       // a scene's actors entry
const defs = await prepared(main.world, main.world.defs)       // the tab's one copy of the definitions
defs.player.speed *= 2                                         // a definition
```

A seat starts carrying things through a prefab: `main.prefabs.player` is what the seat's `player` row
is spawned as, and the thing the seat plays is that row, so every field it starts with is there
(`main.prefabs.player.ammo = 99`). After these lines come
`index.html`'s boot, load, view and `mount` as they are. Then the testbed's own: the scene's truth,
`const room = truthOf(manager(truth), 'main')`, whose `rows`, `world` and step `n` are the ones the
game runs on; a key, a listener of the page's own on a key the game binds to nothing; and
`index.html`'s loop with one line added inside it, after the steps and before `page.frame(owed / dt)`,
that writes the readout from `room`.

Nothing of it bleeds out. `index.html`, `client.html` and `<game>.server.ts` are written as if it did
not exist; no scene file, rule, actor, plugin, addon, extension or test imports it, reads what it
set, or asks whether it is running, and the game plays the same with it deleted. What it finds out
that the game needs is built in its home (a number into the scene file or the definitions, a rule into
its actor) and reaches `index.html` through the files, never by copying a line of `dev.html` across.

## Opening and playing

`yarn editor <game>` serves the editor at `localhost:5173/editor/?game=<game>` and every page of
every game beside it: `localhost:5173/games/<game>/index.html`, `dev.html` and `client.html`.
`PORT=<n> yarn editor <game>` serves on another port. It opens a game whose folder holds
`<game>.scene.json` with a `scenemanager` prefab naming `scenes`, and `<game>.sim.ts`
(`editor/server/listing.ts`), and refuses any other by name. It has no hot reload: a page takes in or
reloads for every change to its game's files (`editor/server/server.ts`). Its Game panel plays the
game as `index.html` does, one seat, under the editor's clock (`editor/session.ts`).

Played in one tab, the game is `index.html`. Played against its server, it is

```
node --experimental-strip-types games/<game>/<game>.server.ts
```

run from the repo's root, which prints nothing and listens on the manager's `port`, and a tab of
`client.html` per seat. The editor's Node panel does the same, Run on node and Open a seat
(`extensions/servers/servers.extension.tsx`), and starts the server again when a file it runs
changes. Stop a server when you are done with it: it holds its port.

A new scene has `"seats": 1`, so a second `client.html` against the server is refused (`no seat
free: 1 declared`, and its socket closed with 1013). A second seat is the scene's `seats` raised and a
`start` entry for slot 1, `{ "is": "start", "slot": 1, "pos": [x, y] }`. A start placed with Place is
`{ is, pos }` and takes the prefab's `slot`, 0, so its `"slot": 1` is written by hand. The second
seat is taken, and its `player` row spawned, the moment its page connects
(`addons/player/player.addon.ts`); with no start for its slot, that row's `before` on the next step
throws `no start matches`, and on node a throw inside `run`'s timer ends the server today; what the
server does with a rule's throw is built in the scenemanager addon (`going-multiplayer`, step 6),
never caught in a game's server file. What the second
seat presses and sees is `input-and-seats`'. Chrome stops
`requestAnimationFrame` in a tab behind another, so of two tabs in one window only the front one
plays; the server keeps stepping.

## What goes wrong

- The server started from inside `games/<game>/` (`node --experimental-strip-types
  <game>.server.ts`), or vitest started there without yarn, cannot read the definitions: the loader
  reads each url under the working directory and fails with `loader <game>: loader could not read
  /games/<game>/assets/<game>.json: ENOENT`. Start the server and vitest from the repo's root. `yarn
  vitest run games/<game>/…` works from anywhere in the repo, since yarn runs it from the root.
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
- The generated `body` kept, or read as the way a game's thing is made. It is folded into `player` first (Fold the
  body into the player row), and a car, a gun or a hero is the `player` row from the start
  (`designing-a-seat`).
- `client.html` left as `yarn new-game` wrote it, or a scene a seat plays in with no `world.predict`:
  nothing is run ahead, whatever row the thing is on.
- `games/games.test.ts` failing on the generated `body.sim.ts`: its `move` calls `Math.hypot`, which
  a rule never does. The fold writes `math.hypot`.
- A game given a fetch script of its own that downloads cc0-textures sets and writes full-size jpgs
  into `assets/`: megabytes of raw pictures in the game's repo, which `raw.mjs` names, and sets the
  library never holds. The sets are named in `assets/cc0-textures.json` and the bake cuts them to
  `.webp` (Its first art, and its bake).

## Proof

Each kind's test sits beside its rule and is named after it, `<kind>.sim.test.ts`, as
`<game>.sim.test.ts` sits beside the manager's. It boots the game's manager as the page does, `boot(file,
sim)` and `load(truth, import.meta.url)`; seats a connection, `connection(manager(truth), d =>
heard.push(d))`; steps; presses as the page would, `seat.take({ scene, seat, msg: { seq, n, id,
action, args } })` aimed at the seat's `player` row; and reads what the kind wrote off the scene's
rows. What the seat sees is the packet it was sent, `heard[heard.length - 1].packet.rows`. Expected
values are read from the scene file and the definitions the test imports, never typed in again, and a
value the die chose is checked against `seeded(world.seed)` from `engine/engine.ts`. The seat's own
row is `possessed(rows)` from `addons/player/player.addon.ts`, never the first `player` row. The
coin's test checks that the seat is sent the coin where its `actors` entry stands it, that the seat's
square run onto it takes it, that it jumps to the point the seed's first two rolls give inside its
`bounds`, and that those `bounds` lie inside the scene's `engine.width` and `engine.height`.

Run the game's own test and the test files beside what changed:

```
yarn vitest run games/<game>/<game>.sim.test.ts
yarn vitest run games/<game>/<kind>.sim.test.ts
yarn vitest run games/<game>/<game>.predict.test.ts
```

`yarn tsc` typechecks the game with the rest of the repo. Then the game is played: `index.html` in
Chrome under `yarn editor <game>`, so its look is seen drawn; `dev.html` for whatever has to be found
out; and the server with a `client.html` tab, which shows that the game serves, that a seat on it
plays, and that the seat's square moves on the frame after its key. A game is started when its own
first thing does all of that, on the folded game.
