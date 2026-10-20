---
name: building-a-level
description: Use in core, or any clone of it, when laying out the place a game is played in: a level, map, stage, room, arena or dungeon, its ground, walls and collision. Covers a Tiled map (`.tmj`, `.tsj`) as a data file in `assets/` the scene names, the `tilemap` plugin (`world.tilemap`, `blocked`, `slide`, `sweep`, `clear`, `edits`) on render2d's world, the other plugins that hold ground and layout (`grid`, `terrain3d`, `scatter3d`, `solids`, `nav`, `mapgen`, the `interest` addon), placing actors and each seat's `start` on a level (`actors`, `<level>.actors.json`, `actorsFile`), levels generated from a seed, a game of many levels, a game's own level tool, and the editor's Actors, Hierarchy, Inspector and Tiles panels. Also when the seat's `player` row walks through a wall, a start stands in one, part of a level cannot be reached, or the map does not draw.
---

# Building a level

A level is the place a game is played in: its ground, its walls, and what stands on them. In core a
scene is a tiled environment and actors (the "A scene is" paragraph of
`addons/scenemanager/scenemanager.addon.ts`). The environment is everything static, the art and the
collision: one data file in the game's `assets/`, an entry of the scene's loader catalogue that the
scene names, which a ground plugin draws and its rules ask. Nothing in it makes a row. The actors
are everything that has a row: the scene file's `actors` entries, then those of the
`<level>.actors.json` its `actorsFile` names. A level drawn by hand is its map and the actors
written in its scene file. A level a generator makes is the two files it writes, loaded the same
way. Nothing makes a level while the game runs. Several scenes played on one level share a
`<name>.partial_scene.json` of the level, its ground, its world and the actors every one of them
places alike, and each `<scene>.scene.json` names it as `"extends"` and holds only what is its own
(`scene-flow`, Scenes that share most of what they hold); never a copy of the level in each scene
file. A road or a track that no ground plugin draws is no
part of that environment: it is an actor, a kind with one `actors` entry (Where a level's pieces
go).

The engine is frozen and the ground plugins are built: making a level is writing data files and
scene files, and the rules that ask them.

## When it applies

Laying out, painting, generating and proving the place a game is played in, and placing what stands
on it. It does not cover:

- a thing on the level with rules, a door, a chest, a monster, an exit: `designing-a-kind`. This
  skill places it.
- a seat: its `player` row, its keys, what it plays when it arrives: `input-and-seats`. This skill
  puts its `start` on the level.
- a new ground plugin, or a plugin of the game's own that holds its level: `building-a-plugin`.
- how an editor extension is built, tested and drawn: `building-an-extension`. This skill says what
  a level tool does and where it goes.
- the tileset's picture, models, sprite sheets: `bringing-in-art`.
- the game itself, from `yarn new-game` on: `starting-a-game`.

## Where a level's pieces go

- The map is fixed and big, so it is a data file of its own in the game's `assets/`: never on a
  row, a prefab or inline in `world`. A row is sent to every seat every step. What changes in a map
  while the game runs is the tilemap row's `edits`, one key per changed cell, and nothing else is on
  that row: not the map, not the name of its file.
- Every file the level uses reaches a rule, an actor or a plugin through the loader and nothing
  else. The map is an entry of the scene's catalogue, `world.loader.assets`; the loader reads the
  tilesets it names and the pictures they name, each path from the folder of the file that names
  it, so those are no entries of their own. A rule names the entry by the name the scene gives
  (`w.world.tilemap.file`), never by a path. Nothing fetches or decodes a file, or writes its path,
  in code. A kind of file the loader cannot hold yet is a type added to the loader, never a fetch
  beside it.
- A level's own few fixed numbers, how render2d lays the world out, where the camera starts, are
  fields of the scene's `world`, which no packet carries. A plugin's fixed numbers are
  `world.<plugin>`. Every number is in the scene file or a data file it names.
- Where a seat starts is never on `world` (no `world.pads`, `world.spawns`, `world.starts`), never a
  list in a definition and never an object in the map. It is a `start` actor per slot, an `actors`
  entry `{ "is": "start", "slot": <n>, "pos": [...] }` of the `start.sim.ts` that `yarn new-game`
  writes (`export const start: Kind = {}`: no rule, no drawing), standing on the level in the
  level's own units, where the seat's `player` row, of the size its definition gives, stands clear
  of every wall. The seat's `player` row is the thing the seat plays as (`designing-a-seat`) and
  stands itself on its own start in `before`, `w.find('start', s => s.data.slot === me.data.seat)`,
  spawning nothing. A scene has as many starts as it has slots.
- Everything else with a row is an actor too: an `actors` entry of its kind. A Tiled object in the
  map makes no row; the map's object layers are for rules that ask about a fixed area.
- A road or a track that no ground plugin draws, a kart's circuit say, is a kind with one `actors`
  entry, `{ "is": "<kind>" }`, and a prefab of `{}` when nothing of it changes. Its definition holds
  its numbers, its width and its colours, and names the data file of its points, a catalogue entry
  of its own in `assets/`. Its look draws it: its own `<kind>.client.ts`, or the browser half of a
  plugin of the game's own when the drawing is shared with other kinds (`designing-a-kind`, Shared
  code and systems). A rule that asks it, how far along it a `player` row or a rival is or which way
  is out of it,
  calls a function of the game's own plugin handed that row, which reads the row's definition and
  the file it names; a rule never reads the road's definition itself. A plugin of the game's own
  handed no row has no definition to read, so the road's numbers are never that plugin's
  (`building-a-plugin`, Numbers, rows and prefabs).
- A level's cast, as placed, is `w.world.scenemanager.actors`, which the scenemanager writes for
  every child scene, so a level that starts over spawns its cast again from its entries and no row
  keeps a copy.
- Actors are placed, dragged and deleted with the editor's own Actors panel, which every game has
  (The editor on a level, below). The Tiles panel edits the environment and nothing else. A game's
  own level tool is for what is that game's alone: running its generator with its recipe and seed,
  or showing its own things its own way (A game's own level tool, below).

## The plugins that hold ground and layout

Each one's header says what it reads and from where; read it before using the plugin.

- `tilemap`, a 2D level: a Tiled map, the `tilemap` catalogue entry `world.tilemap.file` names. Its
  one row holds `edits`. The server half answers questions of the map (`plugins/tilemap/tilemap.sim.ts`),
  the browser half draws it on render2d's layers, the Tiles panel edits it, and box2d stands on it
  through `world.box2d.mods: { ground: 'tilemap' }` (`plugins/tilemap/tilemap.box2d.ts`).
- `grid`, a 2D map every cell of which changes while the game runs, as a city's: its cells are held
  in chunk rows, one `actors` entry `{ "is": "grid" }` with the prefab `{ "k": 0, "cells": {} }`, and
  its numbers are `world.grid` (`size`, `chunk`, `layers`). A rule reads and writes cells through
  `cells(w)`; a starting map is a picture, a `pixels` entry a rule reads and hands to `fill`. The
  browser half draws with the look the game hands it; the Cells panel and Paint Cells (G) edit it
  (`plugins/grid/`).
- `terrain3d`, 3D ground: a field file, the `json` entry `world.terrain3d.field` names, a height
  program, colour bands and painted layers. It has no row. The Terrain panel and its brush write the
  field file. Other plugins stand on it through its mods, `terrain3d.<p>.ts` beside it (walker,
  box3d, scatter3d, solids, hitscan3d, ocean3d among them), named in `world.<p>.mods`. The whole of
  it is `using-terrain3d`.
- `scatter3d`, trees, grass and boulders, each where a hash of its cell puts it, from the packs of
  `world.scatter3d`, on the ground its mods name; the solid ones are walked round
  (`scatter3d.walker.ts`). No row; the Scatter panel edits it.
- `solids`, still models: every row of a kind `world.solids.kinds` names is drawn from its model, a
  `json` entry, at the row's `pos` and `yaw`. A prop is an actor of such a kind, standing on the
  land `world.solids.mods: { land: 'terrain3d' }` names.
- `walker`, kinematic bodies on any ground, through `world.walker.mods` (`height`, `depth`,
  `solids`).
- `nav`, ways through a grid the caller describes: `grid(across, down, blocked, sub, window)` over
  tilemap's `blocked`, `path`, `field` and `down`, `sight`, `pull` (`plugins/nav/nav.sim.ts`).
- `mapgen`, a level made from a recipe and a seed: a library that hands back a map and a list of
  actors entries (A generated level, below).
- The `interest` addon, for a level too big to send whole: each seat is sent only the rows within
  `radius` of it, from the scene file's top-level `"interest"` block. Writing the block does nothing
  yet: `interest(truth, possessed)` is called by its own test alone, and `addons/player`, which
  attaches `vision` when the scene's `world` has a `vision` block, does not attach it. The attach is
  built in `addons/player/player.addon.ts` beside the `vision` line, with its test, before a level
  counts on it; `going-multiplayer` carries that work.
- Over a level, `roomcamera` holds render2d's camera inside the room an actor hands it, `pancamera`
  pans it, and `light2d` darkens it; each reads what its scene and its actors hand it.

## The work in order: a tilemap level

The game `yarn new-game <name>` writes is one scene, `main`, on render2d with no world of its own,
so its points are the canvas's pixels. Its `player` row spawns a `body` and forwards `move` to it;
that is the editor's template, which is on hold, and never the model. Before a level is laid, the
`body` is folded into the `player` row: its `pos`, `move` and definition onto the `player` prefab and
definition, its rule into `player.sim.ts`, whose `before` stands the row on its start in place of
spawning one, its look into `player.client.ts`, drawn for every row and keyed only for the row that is
`mine`, and `body` taken out of the sim, the scene and the test (`designing-a-seat`). The mover below
is that `player` row. Giving it a level:

1. Ask the person making the game what the level is: its shape, where each seat starts, what stands
   where, how it plays. That is content, and it is theirs.

2. The map, in `games/<game>/assets/`: `<scene>.tmj`, a Tiled map saved as JSON (a `.tmx` or `.tsx`
   is refused), orthogonal or isometric (a staggered or hexagonal map is refused); its tileset, a
   `.tsj` beside it that the map names by `source`, or one embedded in it; and the tileset's picture,
   which the `.tsj` names by `image` (`bringing-in-art`). Naming the map after its scene is a
   convention, not a rule: nothing requires it, and the editor's New scene follows it, naming a
   scene's own copy of a map after the new scene, beside the first. Each tile layer
   is drawn on the render2d layer its Tiled name names. A hidden layer is drawn on nothing and needs
   no render2d layer, so a layer that only says where things may walk costs the page nothing.
   Collision is the tileset's, each tile's Tiled collision objects, rectangles and convex polygons,
   one whose type is `top` one-way; the Tiles panel's Tile section writes them from presets, full,
   one-way, and slopes of 45° and 22.5°. A tile with no collision is walked on. To a mover that walks
   cell by cell (`blocked`, `slide`, `clear`) a cell with no tile on any layer blocks, as a cell off
   the map does, so its floor is painted with a floor tile; a box that sweeps is stopped by collision
   shapes alone. The Tiles panel edits a map a scene already names and makes no new one: the first
   map is made in Tiled, or written as Tiled writes one.

3. The scene names it. In `<scene>.scene.json`, for 32-pixel tiles and a map 30 cells by 16:

   ```json
   "world": {
     "defs": "<game>",
     "loader": { "assets": {
       "<game>": { "type": "json", "url": "/games/<game>/assets/<game>.json", "preload": true },
       "<scene>": { "type": "tilemap", "url": "/games/<game>/assets/<scene>.tmj", "preload": true, "nearest": true }
     } },
     "tilemap": { "file": "<scene>" },
     "render2d": { "ground": [[32, 0], [0, 32]], "up": [0, -32], "zoom": 1, "look": [15, 8],
                   "layers": ["ground", { "name": "things", "sort": true }] }
   },
   "plugins": ["loader", "scenemanager", "player", "tilemap", "render2d"],
   "prefabs": { "tilemap": { "edits": {} } },
   "actors": [
     { "is": "scenemanager" },
     { "is": "loader" },
     { "is": "tilemap" },
     { "is": "start", "slot": 0, "pos": [2.5, 2.5] }
   ]
   ```

   beside the prefabs the scene had, and the scene's sim lists `tilemap`, imported from
   `#plugins/tilemap/tilemap.sim.ts`. The `start` is the one `yarn new-game` wrote, its `pos`
   changed from the canvas's middle, `[480, 270]`, to a cell of the map; never a second entry for
   its slot, since `w.find` hands the `player` row the first start of the slot, and the row would
   stand on the old one, off the map. The catalogue entry is `preload`, so the loader has the
   map before the first step, and `nearest` for pixel art. `tilemap` is listed before `render2d`.
   render2d's `ground` lays the cells out as Tiled does, `[[w, 0], [0, h]]` for an orthogonal map of
   w × h pixel tiles and `[[w/2, h/2], [-w/2, h/2]]` for an isometric one, or the tilemap throws.
   render2d also reads `up`, `zoom`, `look` and `layers`, and, when given, `fit` and `background`,
   and each layer's `sort` and `parallax` (its header). `layers` names every visible tile layer of
   the map and the layer the things stand on. The Assets panel writes a catalogue entry too
   (`loader.entry`).

4. The level's units are now the game's. With a world every point is in the level's cells, x along
   a row and y down the rows, so the pixels `yarn new-game` wrote are wrong: the start it put at the
   canvas's middle, `[480, 270]`, is far off the map and is placed again on it; the `player`
   definition's `speed` is cells a second and its `size` in pixels gives way to a `radius` in cells;
   and `player.client.ts`, which drew a square on `render2d.stage` at `pos` as pixels, draws on a
   layer of the world (`render2d.layer('things')`) at `render2d.place(pos)`, ordered by
   `render2d.depth(pos)` and sized from `render2d.ground()`. render2d answers `ground`, `place` and
   `depth` only from its first tick on, so a look asks them in its `tick`, never in `setup`.

5. The rules ask the level. A rule reads the map through the loader, by the name the scene gives
   it, with the tilemap row's edits in it:

   ```ts
   // player.sim.ts: the seat's thing, a circle of `radius` cells running `speed` cells a second along `move`
   tick(me, dt, w) {
     const [x, y] = me.data.move
     if (!x && !y) return
     const { speed, radius } = def(w, me.kind)
     const map = tiled(w, w.world.tilemap.file)
     const edits = w.find('tilemap').data.edits
     const [px, py] = me.data.pos
     const nx = slide(map, edits, [px, py], 0, px + x * speed * dt, radius)
     const ny = slide(map, edits, [nx, py], 1, py + y * speed * dt, radius)
     me.data.pos = [nx, ny]
   },
   ```

   `slide` stops a circle against every cell `blocked` says blocks and every box handed to it as
   `solids` (rows standing in the way); moving along x and then along y runs it along a wall it meets
   slantwise. A thing that stands and falls, a platformer's, is a box that `sweep`s against the
   tiles' collision shapes, slopes and one-way tops; `clear` says whether a circle put down somewhere
   stands clear; `solidAt`, `overlaps`, `tileAt`, `shapes`, `objects` and `tileOfType` answer the
   rest. A changed cell, a block broken or a coin taken, is one key of the tilemap row's `edits`,
   `"<layer>:<c>,<r>": <gid>`, or -1 for no tile: every question and the drawing read the map with it,
   and a seat that arrives late is sent it. Another kind's rule never writes that key straight: the
   field would have rules in two files (`designing-a-kind`, Kinds acting on each other). It calls an act
   of the tilemap's row with `w.call`, which writes the cell. `tilemap` has no act today
   (`export const tilemap: Kind = {}` in `plugins/tilemap/tilemap.sim.ts`), so the job that first
   changes a cell builds it there, general, with its test in
   `plugins/tilemap/tilemap.sim.test.ts` and the header saying it, and then calls it.

6. Place what stands on it: a `start` per slot, and an `actors` entry for each door, chest or
   monster, with the fields it starts with, its kind in the scene's sim with a prefab. They go in the
   scene file's `actors`, or in a list of entries beside the map, `assets/<scene>.actors.json`, which
   the scene file names at its top level as `"actorsFile": "assets/<scene>.actors.json"`, from the
   scene file's folder. A file not named `.actors.json`, or not a list, is refused. In the editor,
   below.

7. Write the tests beside what changed and run them (How it is proven).

8. Play it.

## Many levels

Each level is a scene: `<level>.scene.json` with its own map and actors, `<level>.sim.ts` handing
out the sim of a scene it shares its kinds with (`export { sim } from './main.sim.ts'`), and an
entry in the manager's `scenemanager.scenes`. The sim file also imports its scene file and exports
it, `export const scene = file as Scene`, or loading throws `<level>.sim.ts exports no scene`. The
Scenes panel's New scene (`scenes.new`, `plugins/scenemanager/scenemanager.extension.tsx`) makes one
from another as one change, both sim lines too: a name, the scene it is made from, the kinds whose
actors it keeps (keep `start`), and the files its world names that it gets its own copy of (the
map), each copy named after the new scene, beside the first, and catalogued in its place.

A child scene's `world` is the manager's with its own over it key by key, so a key a level gives
replaces the manager's whole. Numbers every level shares go once in the manager's `world`; a level
that gives its own `world.loader` gives its whole catalogue, the definitions' entry too, so a map of
a level whose catalogue is the manager's is catalogued there beside the others, as New scene does.

A seat moves on when a level's rule calls `go` on its own `scenemanager` row
(`plugins/scenemanager/scenemanager.sim.ts`); the thing that sends it, an exit or a door, is a kind
(`designing-a-kind`) whose field naming the next scene is bound to the `scenemanager.scene` type. To
play one level straight away, `dev.html` enters it, `file.prefabs.scenemanager.entry = '<level>'`,
and no other page or file does.

## A generated level

`build(die, recipe, theme, source, pieces)` of `plugins/mapgen/mapgen.sim.ts` hands back
`{ map, actors, roles }`, a Tiled map and a list of `actors` entries, each `{ is, pos, ...fields }` at
its cell's centre. `die` is `seeded(seed)` of `engine/engine.ts`: the same seed and the same inputs
make the same map, tile for tile, and the same actors. Every number `build` reads is in the recipe,
a data file of the game's in `assets/`: its size, layers, corridor width, tries, its algorithm
(`rooms`, `caves`, `halls`) and that algorithm's knobs, the stairs, the actors it places and the set
pieces it stamps. `build` reads no seed of its own: the seed is a `seed` key of the same recipe
file, which the tool hands `seeded`. Never `world.seed`: that seeds the scene's dice, `w.die`
(`engine/engine.ts`), and a level seed there would be one seed with them. The recipe, its seed and
the set pieces need no catalogue entry, since the game never reads them: they are what its level is
made from, which a game keeps beside the files it reads (the `assets/` paragraph of
`addons/scenemanager/scenemanager.addon.ts`).

The theme is a Tiled tileset (`.tsj`) whose tiles' `type` is the role they draw (`floor`, `wall-n`,
`door-ns`, `hazard`, `void` and the rest the header lists) and whose collision is the game's: a tile
of a walkable role with collision, or of any other without, throws. Set pieces are `.tmj` maps whose
objects become actors. `source` is the path the map names the theme by, from where the map will be
written.

What comes back is written as `<level>.tmj` and `<level>.actors.json`, and the scene names them as
it names a level drawn by hand: the map in its catalogue and `world.tilemap.file`, the list as its
`actorsFile`. A seat's start comes out as any entry does: the recipe's `stairs.up` as
`{ "is": "start", "slot": 0 }` stands it on the up stairs, or a `place` entry
`{ "is": "start", "slot": 0, "on": "floor", "count": 1 }`, one per slot. mapgen walls the map's edge,
joins every walkable cell to every other, keeps them joined round anything that `blocks`, and puts
the stairs `apart` steps from each other by path.

The generator is run by the game's level tool, which reads the recipe file, seed and all, and writes
both files through the editor's files before the game boots on them, so the same recipe makes the
same files again. Nothing makes a level while the game runs.

## A game's own level tool

Actors are placed with the editor's own Actors panel, which every game has: a game's own level tool
never re-builds Place and Arrange. It is for what is that game's alone: running its generator with
its recipe and seed, or showing its own things its own way, a door's link to the scene it leads to,
a patrol's route, an area drawn as its outline. The header of `plugins/tilemap/tilemap.extension.tsx`
says whatever a game places on its maps is placed by that game's own level editor; the Actors panel
does that for every game, so that header disagrees with the code, and is a doc fixed in the change
that next touches it.

The tool is an editor extension. It goes in `games/<game>/extensions/<name>/<name>.extension.tsx`
when it uses several plugins, in `games/<game>/<game>.extension.tsx` or `<kind>.extension.tsx`, or
beside one of the game's own plugins; the editor loads every `.extension.tsx` in the game's folder
and in each folder of its `extensions/` and `plugins/` (`editor/server/listing.ts`) while the game
is open.

It shows the map with `MapView` of `plugins/tilemap/tilemap.components.tsx`, drawn as the Tiles
panel draws one, with marks for the game's things and the pointer handed back in the map's cells;
`docOf` and `mapIn` of `plugins/tilemap/tilemap.extension.tsx` hand it the map and its tilesets as
the loader reads them, to ask `clear` and `blocked` whether a thing stands clear of the collision.
It writes the level's data files through the editor's files and nothing else: a value of a file
that is there with `Edits.editFile`, `saveFile` or `editFiles`, a file that is not yet there (a
generated level's two files the first time) through its own route run as one change, `Edits.route`,
as New scene writes a scene's files; each action one undo, in `together` (`editor/editor.ts`). The
route is `<name>.route.ts` beside `<name>.extension.tsx`, exporting a function `<name>`. The server
finds a route by its file's name across `extensions/`, `plugins/`, `addons/` and `games/`, and a
second file of that name anywhere in them throws (`editor/server/routes.ts`), so the name is one no
other route uses. The tool adds nothing of its own to a scene or data file, nothing a game runs
imports it, and what its panel does is a command an LLM can call too. Building it:
`building-an-extension`.

## The editor on a level

`yarn editor <game>` serves `http://localhost:5173/editor/?game=<game>`, and every command named
below is a tool of its MCP endpoint (`.mcp.json`), with each `.` a `_`.

- Place (P) writes an entry of the kind picked in the Actors panel where the game view is clicked,
  snapped to the snap picked, at the end of the scene's actors or of its actors file. A kind is
  placeable when the scene's sim hands it out, the scene has a prefab of it, and a placer stands that
  prefab on a point: render2d's reads and writes `pos`, `[x, y]` or `[x, y, h]`; render3d's `pos`,
  `[x, y, z]`.
- In 3D, Place writes y = 0: render3d's stage's ground is the plane y = 0, not the terrain. solids
  draws its model at the land's height, but the row's `pos[1]` stays 0; walker lifts its body onto
  the land on its first `walk`; anything else, a box3d body or a kind its own look draws, stays at
  0, in or under the land. Write the land's height into `pos[1]` of its entry, with `actors.move` or
  the Inspector.
- Arrange (A) selects the actor drawn under the pointer, drags it, and writes where it is let go
  into its entry; a spawned row is said to be so and not moved. Select (V) moves a running row from
  this step on and writes no file. Delete takes the entry out. Each is one undo, and the game is
  rebuilt from the files. The commands are `actors.kinds`, `actors.place`, `actors.move`,
  `actors.remove`. A point is as long as the placer's `axes`, which `actors.kinds` answers: three
  numbers in 2D too, `[x, y, h]`, so a start on cell [2, 2] is moved with `[2.5, 2.5, 0]`, and a
  point of two numbers is refused.
- The Hierarchy lists every row of every scene and marks those an entry made; the Inspector shows a
  row's live data, its actor entry, where an edit writes the entry (`inspect.entry`), and its prefab.
  `inspect.saveAsActor` saves a spawned row as an entry, so a thing moved while playing can be kept.
- A `start` is an actor the editor shows, selects and drags where it stands, as it does every other.
  The game view picks what is drawn (`Stage.pick`, through the tags of `editor/drawn.ts`), and a
  `start` draws nothing, so picking an actor that draws nothing is built in its home, the editor's
  own actors extension (`extensions/actors/`), with its test beside it, when a level's starts are
  to be dragged: a mark in the stage's overlay for each placed actor that draws nothing, which
  Arrange picks and drags as it does a drawn one. Selecting a start in the Hierarchy and setting
  its `pos` in the Inspector's actor entry moves it too, as `actors.move` does.
- The Tiles panel (`tiles.read`, `tiles.paint`, `tiles.tile`, `tiles.layer`, `tiles.object`,
  `tiles.resize`) edits the map named by the `world.tilemap.file` of a scene with a tilemap row, and
  its tilesets, each edit written as it is made, one undo each.
- A map, a tileset or another file of the catalogue that the editor writes is read by the running
  game at once: the `datafiles` extension refills the loader's copies in place before the step is
  rebuilt. A scene file or an actors file written rebuilds the step from the files.

## Level design as play

What a level should do is the person's. Core gives tools for checking what makes it read and play:

- every start stands clear of the walls: `clear`, for the radius of the seat's `player` row;
- nothing is drawn that nobody can reach: nav's `field` over a `grid` of `blocked`, from each start,
  is Infinity where no way leads; mapgen joins every generated floor into one;
- how far things are by the way a mover walks, not as the crow flies: `field` is the cost of the way
  from every cell to a goal; mapgen's `stairs.apart`, `away` and `apart` set it for a generated level,
  and a test holds it for one drawn by hand;
- what can be seen from where: nav's `sight`, with a mover's radius; in 3D, `cover3d`'s `spots`, where
  a mover hides from a threat behind solids;
- a level cut into rooms, a room being a fixed area of the level, so level data: `roomcamera` holds
  the view inside the room an actor hands it and scrolls from room to room;
- a level too big to send whole: the `interest` addon, once `addons/player` attaches it (The plugins
  that hold ground and layout, above).

## What goes wrong

- A tilemap added to the game `yarn new-game` writes with no `world.render2d`: the tilemap's browser
  half asks render2d's `ground`, which throws with no world. A `ground` that does not match the
  map's tiles throws too.
- The pixels left in: the start at `[480, 270]`, a `speed` of 240, a square of `size` 32, all read
  as cells. The start test catches the start; a `speed` of 240 is 240 cells a second.
- The `player` row still drawn on `render2d.stage` at `pos`, or `place` asked in `setup`, which
  throws.
- The generated `body` kept as the mover, the `player` row spawning it and forwarding `move`. It is folded into the `player`
  row (The work in order).
- A tile layer named for no layer of `world.render2d.layers`: render2d throws `render2d has no
  layer <name>`.
- Floor left as empty cells. `blocked` says a cell with no tile blocks, so a mover stops at the edge
  of every cell left unpainted.
- Starts, enemies or pickups put in the map's object layer or on `world`. They are actors.
- The map's path written in code, or the map fetched. It is a catalogue entry, read with `tiled`.
- A level whose own `world.loader` dropped the manager's catalogue, definitions and all.
- A level generated when the scene boots, or in a rule. It is two files, written before.
- The map, or the name of its file, put on the tilemap row or a prefab. The row holds `edits`.
- A second `start` entry added for a slot that has one. `w.find` takes the first; the start a level
  moves is the one there.
- A 2D point of two numbers handed to `actors.move` or `actors.place`. It is `[x, y, h]`.
- A coin's or a block's rule writing a key of the tilemap row's `edits` straight. It calls the
  tilemap's act, built in `plugins/tilemap` when the first job needs it.
- A level that must be winnable proven by a list of moves typed into the test. The test finds the
  moves by a search over the map and walks them through the rules (How it is proven).
- A 3D actor placed and left at y = 0 under the land.

## How it is proven

Two tests beside what the level adds, each a `.test.ts` run in node, booting the game's manager as
its page does.

The scene's test, `games/<game>/<scene>.sim.test.ts`: the level as the game boots it.

```ts
import { expect, test } from 'vitest'
import { boot, type Scene } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { prepared, type Tiled } from '#plugins/loader/loader.sim.ts'
import { blocked, clear } from '#plugins/tilemap/tilemap.sim.ts'
import { at, field, grid } from '#plugins/nav/nav.sim.ts'
import { sim } from './<game>.sim.ts'
import file from './<game>.scene.json' with { type: 'json' }
import defs from './assets/<game>.json' with { type: 'json' }

async function level() {
  const room = (await load(boot(file as Scene, sim), import.meta.url)).get('<scene>')!
  const map: Tiled = await prepared(room.world, room.world.tilemap.file)
  const edits = room.rows.find(r => r.kind === 'tilemap')!.data.edits
  return { map, edits, seats: room.scene.seats!, starts: room.rows.filter(r => r.kind === 'start') }
}

test('every start stands clear of the walls for the player', async () => {
  const { map, edits, seats, starts } = await level()
  expect(starts.map(s => s.data.slot)).toEqual(Array.from({ length: seats }, (_, slot) => slot))
  for (const s of starts) expect(clear(map, edits, s.data.pos, defs.player.radius)).toBe(true)
})

test('every cell the player can stand in is reachable from every start', async () => {
  const { map, edits, starts } = await level()
  const nav = grid(map.width, map.height, (c, r) => blocked(map, edits, c, r), 1, map.width + map.height)
  const open = [...nav.open.keys()].filter(c => nav.open[c])
  for (const s of starts) {
    const { cost } = field(nav, at(nav, s.data.pos), map.width * map.height)
    expect(open.filter(c => cost[c] === Infinity).map(c => [c % nav.w, Math.floor(c / nav.w)])).toEqual([])
  }
})
```

The mover's test, `games/<game>/player.sim.test.ts`: a seat joins with `connection`, its `move` is
sent with `seat.take` at its `player` row as the page sends it (the press helper of
`designing-a-kind`), and the `player` row is driven into walls. Driven at a wall it stops touching the wall's face, a radius off the first
blocking cell; driven slantwise into one it slides along it, at the share of its speed that points
along the wall; driven every way for hundreds of steps, `clear` holds at every step and it never
leaves the map. The map is read with `prepared`, as above, and every number comes from the
definitions and the map. Every place it drives the row from or to, a cell beside a start, a wall's
row, is found on the map by the test, never typed.

A level that must be winnable is proven in the scene's test by a search the test runs over the map
read with `prepared`: nav's `path` over a `grid` of `blocked` from each start to the goal, or, where
playing changes the level (a crate pushed, a door opened), a breadth-first search of the test's own
over the level's states, its moves the acts a seat sends. The moves it finds are then walked through
the rules: pressed with `seat.take` as the page sends them, stepped, until the rule that decides the
win says so on the rows. The moves are never a list pasted into the test.

The game replays: the scene's test plays it under the recorder and seeks back (`proving-a-game`, A
kind's test, and a scene's).

The game's own `<game>.sim.test.ts`, which `yarn new-game` wrote, still passes. Then break the level
on purpose and see each test fail: a start moved to a fraction of a cell from a wall fails the clear
test, and a room sealed off by `edits` keys in the tilemap prefab, `"<layer>:<c>,<r>": <a wall's
gid>` across its mouth, fails the reachability test, naming the cells cut off. Put both back.

```
yarn vitest run games/<game>/<scene>.sim.test.ts
yarn vitest run games/<game>/player.sim.test.ts
yarn vitest run games/<game>/<game>.sim.test.ts
yarn tsc
```

Then play it: `yarn editor <game>`, and `http://localhost:5173/games/<game>/index.html`. The map is
drawn, the seat's `player` row stands on its start, and held keys walk it up to every wall and along
it, never through. Against `<game>.server.ts` on `client.html`, which runs the scene ahead, it moves
on the frame after the key and stops at a wall on the frame it reaches it. In the editor the Actors panel lists the starts, and `tiles.read` answers the map. A 404
for `<kind>.client.ts` of a kind with no look (`start`, `tilemap`, `loader`, `scenemanager`) is the
client finding no actor for it, as it should. A blank page whose console shows a 504 for a file
under `node_modules/.vite/deps` is the dev server optimizing a dependency: reload.

## Questions never asked

- Should this go in the engine? No.
- Can the map, or the name of its file, ride on the tilemap row because the row is easy to reach?
  No: the map is a catalogue entry, its name is `world.tilemap.file`, and the row holds `edits`.
- Can where each seat starts be `world.spawns`, a list in a definition, or objects in the map? No:
  a `start` actor per slot, standing on the level.
- Can an enemy or a pickup be a Tiled object the game turns into a row? No: an `actors` entry, in
  the scene file or the level's `.actors.json`.
- Can the level be generated when the scene boots? No: two files, written before.
- Should the Tiles panel, or a game's own level tool, place the game's actors? No: the Actors panel,
  which every game has. A game's own tool does what is that game's alone.
- Should a ground plugin get a setting so this one level can…? No: this game's kind.
- Should I work around what is missing? No: build it in its home.
- Do you want the full version? Always.

Ask the person making the game what the level should be and how it plays. That is content, and it is
theirs.
