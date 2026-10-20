# Patchwork

Patchwork is a multiplayer game engine shipped as source, made to be built with an agent. A game is
made by cloning this repo: the engine, every plugin and addon built on it, and the editor are folders
you can read, change and commit, and nothing is published to npm. Each piece is documented in the
header of its own file and proven by the tests beside it, and `.claude/` holds the rules and the
skills an agent such as Claude Code reads before it writes a line, so you can say what the game
should do and have it built in the right place.

## What you get

- **2D and 3D.** 2D draws with PixiJS (`render2d`), 3D with three.js (`render3d`). Core's three is
  `outsidedata/three.js`, whose math hands back the same bits on every engine.
- **Physics.** Box2D v3 and Box3D, Erin Catto's engines, as WebAssembly (`box2d.js`, `box3d.js`),
  the same bytes on the server and in every page.
- **Multiplayer.** The server holds the truth and sends each seat its rows every step. A page across
  a network runs its scene ahead of the server, so a press answers on the next frame, and the server
  puts a late press back on the step it was made on. One scene runs in one tab, over a WebSocket on
  node, or on a simulated bad network, with the same code.
- **52 plugins and 13 addons**, below.
- **The editor**: a React page and a Node server that opens any game in `games/`, plays it in the
  page or on node, stops time, steps forward and back, shows every row and writes the game's files,
  every edit undoable. Every command it has is a tool on its MCP server, so an agent drives it too.

### Plugins

A plugin lives in the world (rows, the step) or in the player's browser (drawing, input, camera,
sound, UI): a server half, `<p>.sim.ts`, a browser half, `<p>.plugin.ts`, or both.

| plugin | what it is |
|---|---|
| `anim` | Skeletal clips from a rig file, played on the rows that carry them: playheads, gaits from movement, markers, an upper-body channel. |
| `audio` | Sounds the rules raise, on a ledger, played once each on every page where they were raised; loops; one AudioContext. |
| `box2d` | 2D rigid bodies, joints, sensors and queries by Box2D v3 (WebAssembly). |
| `box3d` | 3D rigid bodies, joints, sensors and queries by Box3D (WebAssembly). |
| `box3dvehicle` | A car made of box3d rows from one description, driven by throttle, brake and steer, on a suspension of its own. |
| `cel3d` | The 3D scene drawn as cel animation: light in flat bands and ink round every shape. |
| `chasecamera3d` | render3d's camera held on one row, a rigid orbit about it. |
| `chat` | Lines a seat says, on four channels, and the panel that shows and takes them. |
| `cover3d` | Where a body can stand out of a threat's sight, behind the solids on the ground. |
| `cull3d` | Many copies of a mesh drawn only where the camera sees them, at the detail their distance picks. |
| `cutscene` | A scene played from a cue file: shots, bars, a veil and the line, directing the rows it casts. |
| `dither3d` | The frame drawn as the PlayStation drew it: an ordered dither over too few colours, at too few pixels. |
| `environment3d` | The lights and the floor of a 3D scene. |
| `flight3d` | A fixed-wing aeroplane as forces and moments, with a stalling lift polar, drawn from its model. |
| `grid` | A map of cells that changes while the game runs, held in rows, drawn on render2d. |
| `hitscan3d` | A shot along a line through a 3D world, answered with the first thing it meets, on the step it was aimed at. |
| `light2d` | Darkness over render2d's world, and the lights that cut through it. |
| `lights3d` | Every point light of the 3D scene drawn by clusters (Forward+), as many as the scene likes. |
| `loader` | The scene's catalogue of files, fetched and decoded once, for rules, actors and plugins. |
| `local` | Actors that live in the page only: no row, nothing on the wire. |
| `mapgen` | A level made from a recipe and a seed: its tiles and its actors. |
| `math` | `sin`, `cos`, `pow` and the rest with the same bits on every JavaScript engine. |
| `nav` | Ways through a grid: windowed A*, distance fields, line of sight, routes pulled straight. |
| `ocean3d` | A spectral sea, the same on every machine, and the height of its surface anywhere. |
| `pancamera` | A spectator's camera over render2d's world: edge pan, held keys, wheel zoom, inside bounds. |
| `particle2d` | Effects the rules spawn in a flat world, on a ledger, drawn by each page. |
| `particle3d` | Effects the rules spawn in a 3D world, on a ledger, drawn by each page. |
| `party` | Who plays together, held in the hub and mirrored into every truth a member is in, with its frames and invites. |
| `persist` | The rule side of the persist addon: a truth's durable records as rows. |
| `player` | The seat's thing: presses sent up the wire as acts on the seat's `player` row, and taking hold of other rows. |
| `playtester` | A seat that plays itself: a think reads the rows and names a press each frame. |
| `ragdoll3d` | A limp body on a Mixamo skeleton, stepped on the sim's clock, the same on every seat. |
| `render2d` | The PixiJS stage, its canvas and its camera. |
| `render3d` | The three.js scene, the camera it is seen through, and the look it is drawn with. |
| `roomcamera` | render2d's camera in a world cut into rooms. |
| `scatter3d` | Trees, grass and boulders, where each stands a pure function of its cell; the solid ones a body walks round. |
| `scenemanager` | The table of scenes on a row, and the page's side: one client for the scene the seat is on. |
| `shipped` | Loads the plugins a game ships in its own folder. |
| `skydome3d` | The one sky: the day clock, the sun and moon, weather and wind, fog, rain, snow and lightning. |
| `solids` | Models made of low-poly solids, and their meshes for the plugins that draw them. |
| `sprite2d` | Rows drawn as frames of a sprite sheet in render2d's world. |
| `sprite3d` | Rows drawn as billboards of a sprite sheet that stand on the floor. |
| `stats` | three.js's stats panel: frames a second, milliseconds a frame, heap. |
| `store` | The page's values the server never reads: volume, a tint, rebound keys. |
| `synthaudio` | Music as notes: a song as one file, played by Tone.js instruments in the page. |
| `terrain3d` | The ground as a pure function of a field file, drawn as rings that follow the camera, never ending. |
| `tilemap` | A tiled level from a file: the questions a rule asks of it, and drawing it on render2d. |
| `ui` | The HUD: its own PixiJS stage over the game, with panels, buttons, bars, modals and focus. |
| `vision` | The fog of war drawn over render2d's world: seen now, seen before, never seen. |
| `volley2d` | Bullets in a flat world, none of them a row: each a closed-form function of its volley's age. |
| `volley3d` | Launched rounds in a 3D world, rockets, shells, grenades and missiles, none of them a row. |
| `walker` | A kinematic body on any ground: walk, slide, seek. |

### Addons

An addon holds a truth: seats, connections, sockets, files, timers, more than one truth, what a
packet carries. It runs where the truth is.

| addon | what it is |
|---|---|
| `accounts` | Who a connection is, settled before anything it sends reaches a truth. |
| `heard` | What a truth's steps answered, for a test or the simulator to read. |
| `interest` | Each seat sent only the rows near it. |
| `loopback` | The in-memory wire: a page and its server in one process, on any network shape. |
| `persist` | Durable records as rows, loaded into a truth and written back as they change. |
| `player` | The seats a scene declares: a connection takes a slot and gets its `player` row. |
| `predict` | A scene run ahead of its server on the page, so a press is drawn on the next frame. |
| `recorder` | A game under the editor's clock: every step rebuilt by booting again and replaying. |
| `rewind` | A late press put back on the step it was made on. |
| `scenemanager` | Many truths in one process, and a seat moved between them. |
| `simulator` | Pages against a server with no time passing, every frame, step, packet and message written down. |
| `socket` | The WebSocket wire: a page and its server in two processes. |
| `vision` | Team vision: each seat sent only the rows its team sees. |

## The model

- A **scene** is a file: how a world starts and which plugins it uses. Its `world` holds its fixed
  numbers, its `prefabs` what a new row of each kind starts as, and its `actors` the rows it starts
  with. A game's manager scene holds its scenes.
- A **row** is one thing in the world, and its **kind** is what it is. A kind's code is its actor:
  its rule, `<kind>.sim.ts`, run on the server every step, and its look, `<kind>.client.ts`, run in
  the page.
- A running world is a **truth**, and one tick of its time a **step**. Every step it sends each
  seat a packet of the rows it may see.
- A **seat** is a player's place in a truth. What it plays as is its own `player` row, and a
  press is a message asking that row to act.
- A **plugin** lives in the world or in the browser; an **addon** holds a truth. The engine,
  `engine/`, is frozen; everything new is a plugin, an addon, or a game's own kind.

## Requirements

- Node 22.6 or later (it runs TypeScript with `--experimental-strip-types`).
- Yarn 1.
- To bake art: Blender, the library of raw parts the bakes read, the native gltfpack 1.3 or later
  (it packs WebP textures; the npm one cannot), and ImageMagick built with libwebp. Copy
  `.env.example` to `.env` and set `BLENDER`, `PATCHWORK_LIBRARY`, `GLTFPACK` and `MAGICK` where
  yours differ from the defaults it lists. Playing a game needs none of them.

`yarn health` checks all of it: it runs each tool and prints what passes, what fails and how to fix it.

## Getting started

```
git clone --origin upstream https://github.com/outsidedata/patchwork.git mygame
cd mygame
yarn install
yarn new-game mygame
yarn editor mygame
```

`--origin upstream` names Patchwork's remote `upstream`, leaving `origin` for your own repo.

`yarn new-game <name>` writes `games/<name>/`: one scene, `main`, on render2d, with a seat that
starts at a `start` actor and moves a square with the arrow keys. It is what the editor's
File → New Game writes. Play it from `games/<name>/index.html`, or run its server with
`node --experimental-strip-types games/<name>/<name>.server.ts` and open `client.html`. Run it again
to make a second game.

The example games are in their own repo, `outsidedata/patchwork-games`. Clone it as `games/`:

```
git clone https://github.com/outsidedata/patchwork-games.git games
yarn editor <game>
```

The editor serves on port 5173. When another server holds it, the editor says so and exits: start
it on another with `yarn editor <game> --port 5174`, or on any free one with `--port 0`, and open
the url it prints.

## For agents

Start at `.claude/CLAUDE.md`: the commands, and where every fact lives. Then
`.claude/skills/prime-directive/SKILL.md`: the engine is frozen, where every new thing goes, and
which phase skill carries each kind of work. Beside it in `.claude/skills/` are the phase skills:
making a game (`starting-a-game` through `auditing-a-game`) and distributing it
(`going-multiplayer`, `persisting-players`, `committing-a-game`, `publishing-a-game`).

Whether a game can be built on Patchwork is answered from the tables above and the headers of those
files: each says what the piece does, what it is handed and what it hands back.

## Your repo

It has two remotes:

- `upstream`: Patchwork. You read from it and never push to it.
- `origin`: your own repo, which you add when you make it (`git remote add origin <url>`, then
  `git push -u origin master`).

Everything you change is a commit in your repo: your game, a new plugin such as
`plugins/terrain4d/`, an edit to Patchwork's own `plugins/terrain3d/`. You push to `origin`.

## Taking updates

1. `git fetch upstream`: downloads Patchwork's new commits. It changes none of your files.
2. `git switch -c update-core`: a branch to merge on, so `master` is untouched until the merge is
   proven.
3. `git merge upstream/master`: joins Patchwork's changes into yours.
4. `yarn install`, `yarn tsc`, the tests beside what Patchwork changed, and your game played.
5. `git switch master`, `git merge update-core`, `git push origin master`.

Git merges line by line, file by file:

- A file only you have (`plugins/terrain4d/`, `games/mygame/`): Patchwork has no such file, so the
  merge never touches it.
- A file only Patchwork changed: takes Patchwork's version.
- A file both changed, in different places: both changes kept.
- A file both changed on the same lines, a file one side deleted and the other changed, or a file
  both created at the same path (Patchwork later ships its own `terrain4d`): the merge stops and
  names the file, with both versions marked inside it. Nothing is overwritten. You, or your agent,
  write what the lines should be and commit; `git merge --abort` puts everything back as it was
  before step 3.
- `yarn.lock` in conflict: take Patchwork's (`git checkout --theirs yarn.lock`) and run
  `yarn install`, which writes it again with both sides' dependencies.

A merge with no conflict can still break your game: Patchwork renames a function `terrain4d` calls,
and the lines never touched each other. Step 4 is how that is found: `yarn tsc` names every call
that no longer matches, and the tests and the game show the rest.

## Giving back

A plugin worth having in Patchwork goes to it as a pull request from a fork of
`outsidedata/patchwork` on GitHub; once merged, the next update brings it back as Patchwork's. The
steps are in `.claude/skills/publishing-a-game/SKILL.md`, Giving back.

## Licence

MIT (`LICENSE`), Copyright (c) 2026 Outside Data. Make games, sell them, keep the money.
