---
name: asset-workshop
description: Use in core whenever a game's props, models or held items are made, fitted, looked at or moved between games — the asset workshop (`tools/workshop/`, localhost:5180) and the ik3d plugin it fits. Triggers on "the workshop", "asset workshop", "fit the gun", "the hands don't reach", "IK", "ik3d", "mount points", "stock / grip / support", "hold a prop", "bring this prop into another game", "notes on a model", "try a pack clip on the body", and on any job that changes a prop's `at`/`turn`, `world.ik3d`, or a glb's empties.
---

# The asset workshop

A page with no game running where a game's props are made and fitted to that game, drawn by the
game's own plugins. It reads a game from its own files and writes back into them. Nothing in it is a
copy of a game's numbers, and nothing it shows is something the game would not draw.

The facts live in the headers of these files; this skill is the map of how they connect.

## The words

Use these words with Bill and in every header, doc and UI label of the workshop; `tools/workshop/README.md`
holds the same list for a person.

- **body**: a character the game animates. **prop**: a model a body holds and carries (a rifle); its
  mount points (`stock`, `grip`, `support`) are where it is held.
- **machine**: a model a body gets onto or into and works (a jimmy, a car, a tractor); the body moves
  with it, not it with the body.
- **point**: an empty on a model, a place in its own frame.
- **interaction**: a body doing one thing with a machine, start to finish (boarding a jimmy, getting
  into a car, climbing onto a tractor): a list of **steps** played in order.
- **step**: one part of an interaction, tuned on its own, pairing a **clip** (swappable for any
  other, pack clips included), an **anchor** (`at`, the machine's point the body stands at the whole
  step, turned by `turn`), the machine's **pose** during it (knelt, standing: the
  game's, its machine definition's `interact.<interaction>.<step>`), and its **IK targets** (`ik`, the
  machine's points the hands and feet reach while it lasts, each limb with its `pole`).
- **tuning a step**: choosing its clip and moving its anchor and IK targets while it plays, with
  nothing of another step, or of the machine's own frames, in reach.

The pattern is general, not one game's: it is the top-level `plugins/interact` (its header is the
file format and the functions), and mech's jimmy boarding is the first interaction; cars and farm
machinery are the same shape. The jimmy's boarding (`games/mech/assets/jimmy.board.interaction.json`)
is climb (at `board`, knelt), sit (at `edge`, knelt) and seated (at `seat`, holding, standing,
hands on `gripL`/`gripR`, feet on `footL`/`footR`).

| File | What it is |
|---|---|
| `tools/workshop/workshop.server.ts` | The node server: serves the page, core's own plugins, a game's files; reads and writes a game |
| `tools/workshop/workshop.ts`, `workshop.html` | The page |
| `tools/workshop/scenes.ts` | Edits a scene file's text in place, keeping its hand-laid layout |
| `tools/workshop/loaded.ts` | Loads a scene whole through scenemanager's `child`, a fresh node process each read |
| `tools/workshop/glb.ts` | Reads and writes a glb's empties (mount points) in node, no Blender |
| `tools/workshop/beside.ts` | A glb's points file, `<stem>.points.json`, for a model written again from elsewhere |
| `tools/workshop/retarget.ts` | Clip retargeting, shared by the page's pack clips and the pose lab |
| `tools/workshop/poses.ts`, `poses.html`, `poses.export.py` | The pose lab (`/poses`) and the Blender script that writes its clip |
| `tools/workshop/solids.ts` | Reads a solids model's nodes and empties and edits them in its json in place, layout kept |
| `tools/workshop/drawn.ts` | A solids model's stand-in scene, and how the page finds its nodes and paints in a drawing |
| `plugins/solids/solids.plugin.ts` | The solids every solids model is meshed by, in the game and in the workshop |
| `plugins/ik3d/ik3d.plugin.ts` | The IK the game runs: limbs reach points on a held prop, and the limbs another plugin hands it (`limbs` mod) |
| `plugins/ik3d/ik3d.solve.ts` | The arithmetic, shared by the plugin and the page |
| `plugins/anim/anim.ik3d.ts` | anim's mod handing ik3d each body, its props, whether it is limp |
| `plugins/interact/interact.sim.ts` | Interactions: the file format, `begin`/`advance`/`end`, the body placed at a step's point |
| `plugins/interact/interact.ik3d.ts` | interact's mod handing ik3d a step's limbs, on the points a machine's plugin draws |
| `plugins/box3dvehicle/box3dvehicle.plugin.ts` | Draws a car from its rows and its look, its look's points as empties (`point(id, name)`) |
| `plugins/box3dvehicle/box3dvehicle.interact.ts` | box3dvehicle's mod for interact: a car's points, `point` (server) and `object` (page) |
| `games/<game>/<game>.workshop.ts` | A game's moves: its body against the things of its level, posed by the game's own code (demo_walker's is the first) |

## Running it

```
node --experimental-strip-types tools/workshop/workshop.server.ts
```
then `http://localhost:5180/?game=<game>` (also `&model=<key>&body=<kind>`). One background process;
restart it after changing the server. A page change needs only a reload. Its tests:
`yarn vitest run tools/workshop` and `yarn vitest run plugins/solids` and `yarn vitest run plugins/ik3d plugins/anim/anim.ik3d.test.ts plugins/interact`
and `yarn vitest run plugins/box3dvehicle/box3dvehicle.plugin.test.ts plugins/box3dvehicle/box3dvehicle.interact.test.ts`.

## How a game is read

- The manager scene `games/<game>/<game>.scene.json`, and every scene its
  `prefabs.scenemanager.scenes` names (or the manager alone when it names none), each loaded whole by
  scenemanager's `child` (`tools/workshop/loaded.ts`, a fresh node process each read, so a save is
  never hidden by node's import cache): the manager's world and prefabs under it, and the partial it
  `extends` between. A save writes each value into the file that gives it: a hold into the file whose
  own `world.anim.kinds` has the body (the scene's, else its partial's), an IK into the scene's own
  file when it gives one, else beside the hold, `ik3d` into each scene's `plugins`; a fit a partial's
  scene would draw without the prop is refused (409). Bring catalogues into the partial.
- **Models**: every `type: "model"` entry of `world.loader.assets` (a glb, `type: "glb"`), and every
  `type: "json"` entry whose file is a solids model, `paints` and `parts` (`type: "solids"`), across
  the scenes, each with its `file` (repo path). A solids model also carries `named`, how the game
  finds it: `by: "solids"` for a kind of `world.solids.kinds`, `by: "defs"` for a string at a `model`
  key of a definition in `world.defs` (`strider.model`, `strider.cabin.model`); and `stand`, how the
  page draws it as the game does: a still row of the kind, drawn by the solids plugin or by the
  scene's own plugins that draw solids models (a shipped plugin whose `.plugin.ts` calls
  `.solids.meshes(`), each one's `world.<p>` with its mods kept only among them.
- **Bodies**: every kind of `world.anim.kinds`: its model, its rig, its `props` (what it holds).
- **IK**: `world.ik3d.kinds.<body>`.
- **Interactions**: every interaction of `world.interact.kinds`, from the first scene that builds its
  machine with a `fit` (an actor whose `is` is the machine's kind or with a field naming it, as mech's
  `start` names its `mech`), else the first that has it: its machine's kind and name, its catalogue
  key, url and file, its `body`, that `fit`, `poses` (the machine definition's
  `interact.<name>`, `{ <step>: { <field>: value } }`) and `mods` (`world.interact.mods`).
- **Vehicles**: every vehicle of `world.box3dvehicle.vehicles` in a scene that lists `box3dvehicle`
  and gives `world.interact.kinds.box3dvehicle`, each a machine of the kind `box3dvehicle` (the
  interactions of that kind are every vehicle's), from the first such scene: its name, the scene,
  `files` (for each scene that has it, the first of its own file, its partial and the manager whose
  own `world` gives `box3dvehicle`, when that fleet has the vehicle's look: the files a save writes),
  `model` (its look's model key, or null for a look drawn in code), and how the page draws it:
  `plugins` (`box3dvehicle`, and `particle3d` when the scene lists it and the look has an exhaust or
  dust) and their `world` (the fleet with this vehicle alone and no `mods`, so no gravity and no land,
  and the scene's `world.particle3d`).
- **Drift**: a body whose anim kind or IK differs between scenes is flagged with the scenes that
  differ. The page shows the first scene's numbers; a save writes every scene.
- render3d's prefab (tone, shadows, AO) is the game's, so the look is the game's, but for its bloom:
  the workshop never blooms, even for a game that does (`unbloomed` in `drawn.ts`).

## How it draws: the game's plugins, not a copy

The page imports core's real `loader`, `anim`, `ik3d` and `render3d` (served with types stripped,
`#engine/ #plugins/ #addons/` and the loader's `fflate`/`fzstd` mapped in its import map) and ticks
them every frame on a stand-in scene built from the game's numbers: one row of the chosen body,
standing at the origin, playing a clip. scenemanager's `prepare` loads the mods the world names
(anim's `body` for ik3d). The page adds only a studio: lights, a grid, a floor, a 1.8 m figure.
Every edit changes that stand-in scene's numbers in place, which is exactly what a save writes, so
what you tune is what the game draws.

A **solids model** is drawn on a stand-in scene of its own (`drawn.ts`): the loader, the real solids
plugin, the game's own plugins that draw solids models (imported from `games/<game>/plugins/<p>/` as
`shipped` imports them, their mods loaded by `prepare`), render3d, and one still row of the kind
(`pos` 0, `yaw` 0, `vel` 0, `heading` 0, `kneel` 0). A drawer that throws on that row's first frame is let go of
and named in the hud (mech's mount3d does: a still strider has no `modules`). The strider is drawn
by legs3d, standing on its legs as the game stands it; a structure by base, its `standing` shown; a
module or the cockpit, which no plugin draws on a lone row, is hung by the page from solids' own
`meshes` and `lights`, its parts in pieces at the origin as mount3d and interior3d hang them. The page
finds each node's group and each mesh's node and paint in the drawing by the order every drawer
hangs them (nodes in model order before meshes; a node's meshes one per paint in the order its parts
name them). An edit is written into the loader's copy of the model (`written`), so the game's own
plugin draws it moved that frame.

A machine in an interaction adds to that scene what the game's scene lists: anim with the body's
kind, interact (`world.interact` with the one interaction and the scene's mods) and ik3d with
`limbs: "interact"`, in the order `loader, anim, solids, shipped…, interact, ik3d, render3d`. The
machine's row is fitted (`fit`, and a `modules` entry per fitted mount) and posed with the step's
`poses`; the body is row 2, and each frame the page sets its `interact` to the step at the playhead
and calls interact's own `advance` handed no time, so the body stands where the game stands it. Each
fitted module's solids model is put in the loader as edited here too; a step's point is the empty of
the first fitted model that has it, else the machine's own, as interact's point mod looks. The gizmo
sets a module's point in its module's frame, read off the empty's drawn object (interact's `object`
mod).

A **vehicle** (drive's cars) is the other kind of machine, on a stand-in scene of its own
(`buildCar` in `workshop.ts`): the loader, core's real box3dvehicle page plugin (and particle3d for
an exhaust), and, in an interaction, anim, interact and ik3d, then render3d, in the order
`loader, box3dvehicle, particle3d, anim, interact, ik3d, render3d`. Its rows are still: the car row
(1) naming the vehicle, its `steer` the panel's steer field; the body (2); the chassis row (3) at
`[0, standing(v), 0]` unturned; a wheel row (4 on) per corner at `wheelAt(corner, sag)` on it, still
(box3dvehicle's own `standing`, `corners` and `wheelAt`, as its `build` places a car's parts). The
body is placed by interact's own `advance` as for the jimmy, through box3dvehicle's point mod. Its
points are its look's `points`, kept under the key `vehicle:<name>` beside the solids models' files
and read and written through `/api/vehicle`; each edit is put in the stand-in's fleet, so box3dvehicle
draws the car again with it that frame. The dots sit on the empties box3dvehicle draws (`point`),
which ride the steering wheel as it turns; the gizmo sets a point in that empty's frame less its own
place and turn (the chassis's, or the turned wheel's for a `steer` point), the same `moduleFrame` as a
module's empty. A vehicle has no notes.

## A game's moves

A game whose own plugins move its body against its level (a ladder, a chair, a wall: demo_walker's
climber and moves, not `plugins/interact`) hands them to the workshop in `games/<game>/<game>.workshop.ts`
(the server's `workshop`). The file exports `scene` (a scene the manager names), `body` (the kind of the
row that makes the moves), `looks` (the kinds whose rows are drawn round it) and `moves(w, me)`: each
move `{ name, against, floor, steps }`, each step `{ name, clip, dur, loop, pose(t), marks() }`. `pose`
writes the body's row as the game's code has it `t` seconds in (calling the game's own plugins on the
row, never a copy of their arithmetic); `marks` is what the clip touches then, `{ name, on, at, gap?,
off? }`. The file's header says how each step is posed and what each mark's gap is measured against.

The page boots that scene as the game loads it (`child`, `boot`, `prepare`), spawns the body from its
prefab, and draws a move on a stand-in scene of the loader, anim and render3d with the scene's world:
each row of `looks` by a copy of its own look (the engine's `drawing`; the server serves any `.ts` with
`?instance` as `scripts/instance.ts` makes it), the body by anim, a solid floor at `floor`. Steps, the
playhead, a frame either way (`,` `.`), the dots and their list, the views turned by the body's facing
as the step begins, and Key frames (the step at every moment its marks change, side by side). A move
saves nothing; any file of the game written loads the page again on the same move and step, the camera
kept. `?game=<game>&move=<name>&step=<n>` opens one.

## What a solids model carries

- **Nodes**, `{ <name>: { parent?, at, turn?, mirror? } }`: frames, `at` metres in the parent's frame,
  `turn` [rx, ry] radians about x then y (three's `'ZYX'` with z 0). A node no part hangs in is a
  frame alone: a mount (the strider's `L1`…`B2`, where mount3d hangs a module), `eye`, a crate hook.
  legs3d throws on a `turn` given to a node it poses (body, torso, hips, knees, feet).
- **Empties**, `{ <name>: [x, y, z] | { at, part?, turn? } }`: points, a module's `muzzle`; one with
  a `part` rides that piece (the seat's grips on its sticks), moved here by its `at`; one with a `turn`
  (a quaternion, as a glb's empty holds) is drawn turned by mount3d, and ik3d turns a hand or foot bent
  onto it to that turn. The page turns an empty with Rotate or the three turn fields (degrees, XYZ, as
  a glb's point), written by `/api/frames`'s `turns`.
- These are its attachment points; a `stock`/`grip`/`support` on a solids model would be a node of
  those names (a frame with a turn, as a glb empty has). Nothing reads them yet: no body can hold a
  solids model (below).
- **Fitting one on a body is not built**: anim's `props` hang `plugins.loader.model(name)`, which is
  a `type: "model"` (glb) entry only, and ik3d reaches points on anim's prop roots. Holding a solids
  model needs anim and solids expanded (anim taking a prop's object from a mod, a `solids.anim.ts`
  handing a solids model's drawing, its nodes named), which waits on the yes of the person you are
  working for (`prime-directive`, Core is not touched).

## What a prop carries, and what a game carries

- **The prop carries its mount points**, as named empties in its glb, beside `muzzle`:
  `stock` (sits in the shoulder), `grip` (where the right hand's bone goes, with its turn),
  `support` (the left hand). They describe the object and travel with it to any game.
- **The game carries the fit**, per body, in its scenes:
  - the hold: `world.anim.kinds.<body>.props: [{ model, bone, at, turn }]` (metres, degrees, XYZ
    Euler in the bone's scale-free frame), which anim hangs the prop by;
  - the IK: `world.ik3d.kinds.<body>`: `anchor { prop, bone, at, turn, point }` (the prop set so
    its `point` empty sits at the bone's frame moved by `at`, turned by `turn`) and
    `limbs: [{ bones: [upper, lower, end], prop, target, pole }]` (each end bone reaches the
    target empty; `pole` is the elbow's way in the body root's frame).
  - `ik3d` listed in the scene's `plugins` right after `anim` (and before `render3d`), and
    `world.ik3d.mods: { body: "anim" }`.

With IK on, the hands find the points on any body in any clip; per game only the anchor needs a
minute's tuning. That is why it is "fire and forget".

## ik3d in the game

Browser half only, no row, nothing on the wire, prediction untouched. Each frame, after anim poses
the body and hangs its props: the prop is anchored, then each limb is bent (exact two-bone solve,
clamped a millimetre short of straight when out of reach). It runs in `tick` and again in
`afterTick` (after anim re-hangs props). Before each solve it puts back what the last solve turned,
since anim's mixer only writes a bone whose clip value moved; so it never drifts. A limp body, a
row gone, or a kind taken out of `world.ik3d` is let go of and stands as its clip draws it. A prop
still loading is waited for. Every Mixamo skeleton copy gets the solved turns.

## The page

- **Left column**: models (open notes count; "on <body>" buttons, outlined where that body holds
  it); bodies (what each holds; drift). **Bring…** at the top.
- **A model alone**: its bounds, tris, empties, notes, and its mount points to move.
- **A body alone**: the animation lab — its rig's clips by name, as the game plays them, with
  play/pause and a scrubber.
- **A model on a body** — the fit panel:
  - **IK** off: the gizmo sets the hold in the hand. IK on: it sets the **anchor** or a mount
    point (`stock`, `grip`, `support`, any empty). Move/Rotate, or type into the six fields.
  - **Take from this pose**: with IK off for a frame, each hand's pose becomes its mount point and
    the stock's place becomes the anchor; then IK is on and nothing moves. The way to start a fit:
    pause on a good pose, take, then move `support` onto the handguard.
  - The reach readout: each hand "on it" or how many mm short (out of reach: move the anchor).
  - **Save to game** writes only what changed: points into the glb; hold and IK into every scene of
    the game that draws the body and has the model (a body that did not hold it gets it).
  - **Revert** drops what is not saved.
- **Clips**: a search box (every typed word must be in the clip's name or pack, any case; ↑/↓,
  Enter, Escape) over the rig's clips, then every pack in `packs/` of the clip collection
  (`PATCHWORK_CLIPS` from the shell or `.env`, else `~/troupe-collection`; read no deeper than one
  pack folder) marked "(not baked)": retargeted as `anim.export.py`
  retargets and played by anim through a stand-in rig. A preview: the game has the clip only once
  it is in the rig and baked (`using-mixamo-assets`).
- **A solids model**: listed as `solids · <how the game names it>`, no body buttons. The hud says who
  drew it; its tris, meshes drawn, paints, parts, nodes, empties and bounds; each node a small frame
  with its name (amber: a mount, no part hangs in it), each empty a dot. The targets are its nodes
  and empties: Move/Rotate or the fields (a node's `turn` about x and y alone, in degrees, saved as
  radians; an empty's about x, y and z, saved as a quaternion); **Add** makes a node hung from the chosen node (an empty in a model with no
  nodes); **Save to game** writes them into the json in place; **Revert** drops them.
- **A machine with interactions** (in mech, the jimmy; in drive, `vehicle · jeep`, `vehicle · cart`,
  `vehicle · truck`, listed after the models, `&vehicle=<name>` in the url): **model** (a vehicle's
  **vehicle**, the car alone with every point of its look) and a button per interaction, then
  its steps. Choosing a step builds the scene for it alone and frames the machine and body. The
  targets are the step's points alone (`at` and each limb's `target`), drawn as dots where
  interact's point mod puts them, named with what the step does there. The clip search box is the
  step's clip (rig clips and pack clips, a pack clip played through a stand-in rig); `turn` (degrees);
  each limb's pole (three fields); the step's length or "holds"; the reach of each limb. **Save to
  game**: points into their solids models (`/api/frames`) or a vehicle's look in the scene file that
  gives it (`/api/vehicle`), each pack clip a step plays baked into the
  body's rig (`/api/bake`, named camel-case after its file), then the interaction (`/api/interaction`).
  **Revert** drops the points and the interaction's edits. A vehicle has a **steer** field (−1 to 1,
  the car row's `steer`, not saved): the wheel turns by it times the look's `lock`, and the hands
  bent onto its grips follow.
- **Notes**: click the model, type, ⌘↩. Kept in `<stem>.notes.json` beside the model's file (the glb,
  or the solids json: `strider.model.notes.json`) with the point in the model's frame, mesh and
  material (a solids model's: node and paint) and camera; a card puts the camera back; Claude marks
  them fixed with a reply (PATCH `/api/notes/<n>?file=<path>` with `status`, `reply`).
- **Bring…**: a glb model of another game copied into this one (`games/<game>/assets/<file>.glb`), a
  catalogue entry added to every scene that draws with anim, and optionally given to a body, fitted
  as the other game's body held it — the starting point to tune.
- Any file of the game written on disk (by Claude, Blender, a save) reloads the view in place with
  the camera kept; "reloaded" shows the time.

## The other pages of the same server

- `/poses`, the pose lab: a library character (`PATCHWORK_LIBRARY`, else `~/patchwork-library`,
  `characters/<name>/<name>.fbx`) posed by hand a pose at a time, any two tweened, the poses written
  by Blender (`poses.export.py`) as one clip, `poses/<name>.fbx` in the packs folder, a frame a pose,
  with its `<name>.poses.json` beside it.
- `/ui`, the UI workshop (`building-the-hud`), and `/particles`, the particle workshop
  (`tuning-particles`).

## The API, for Claude driving it without the page

`GET /api/games`, `GET /api/game/<game>` (the summary above), `GET|POST /api/points?file=<glb>`
(`{ points: { name: { at, turn: [x,y,z,w] } } }`), `GET|POST /api/beside?file=<glb>` (`{ points?, sizes?, drop? }`: its `<stem>.points.json`, each point
`drop` names taken out, each point and size named set, the rest kept),
`GET|POST /api/frames?file=<solids json>`
(`{ nodes?: { name: { at, turn?: [rx, ry], parent? } }, empties?: { name: [x,y,z] }, turns? }`,
written in place, a missing one added),
`POST /api/machine?file=<definitions file>` (`{ machine, name, poses }`: the machine's pose in each
step of interaction `name`, written in place into `world.defs`' file), `GET|POST /api/notes?file=<glb or solids json>`,
`PATCH /api/notes/<n>?file=<path>`, `POST /api/fit/<game>` (`{ body, prop, hold?, ik? }`),
`POST /api/bring/<game>` (`{ from, key, body?, like? }`), `POST /api/interaction?file=<.interaction.json>`
(the interaction, checked by interact's `check` and written each step on lines of its own),
`GET|POST /api/vehicle/<game>/<vehicle>` (a vehicle's look points as frames, `{ nodes: {}, empties,
turns }`; POST `{ empties?, turns? }` written in place into every file that gives the look, handing
back the points and `written`),
`POST /api/bake/<game>` (`{ body, clip: "pack:<pack>/<file>", name }`: the clip added to the body's
rig as `name`, every body of the rig baked by Blender, `BLENDER`, and the table merged; refused for a
name the rig gives another file), `GET /api/packs`, `GET /api/characters` (the library's rigged
characters), `GET|POST /api/poses` (the pose lab's clips; POST `{ name, body, rest, poses }` writes
one), `GET /api/events` (SSE
`changed <path>`). A JSON body is easiest sent from a file: `curl --data @file.json`.

## Rules that hold

- Scenes are edited only through `scenes.ts`: in place, layout kept. Saving numbers that are already
  there writes nothing (checked against mech's real scenes, and every point of drive's three vehicles
  through `points`).
- Solids models are edited only through `solids.ts`: each node on its own line, compact or spaced as
  the file is. Setting every node and empty of all 27 of mech's solids models to its own value writes
  every file byte for byte as it was.
- No game imports the workshop. It never changes how a game draws, only the game's files. It is the
  tool for props.
- `games/` is its own repo: a save changes files there, committed with `git -C games`.
- Never scan the disk for textures or clips: only the packs folder above, and only on request.

## Mech, as it stands

The raider rifle (`games/mech/assets/raiders/rifle.glb`) has `stock`, `grip`, `support`, `muzzle`.
xbot and ybot both hold it by ik3d in all five scenes that draw them (training, defense, night,
highlands, gym), anchored at `RightShoulder`, elbows posed `[-1,-1,0]` and `[1,-1,0]`.

The jimmy (`jimmy-model`) has the `board` interaction: climb at its own `board` empty, sit at the
seat's `edge`, seated at `seat` with hands and feet on the seat's grips and pedals, fitted
as salvage's start fits it (`S1: seat`, `B1`/`B2: shield`).

## Drive, as it stands

The jeep and the cart are `open` looks drawn in code; the truck is the glb `truck` (`look.model`).
Each has `seat`, `footL`, `footR` on the chassis and `gripL`, `gripR` riding `steer` with turns, in
`world.box3dvehicle.vehicles.<car>.look.points` of `games/vehicles/vehicles.scene.json` (the manager; road,
stylized, desert and gym inherit it). Its interactions are `world.interact.kinds.box3dvehicle`, every
car's: `enter` (`in`, travelling `to` the seat on the `enter` clip, then `seated`), `sit` (`seated`)
and `exit` (`out`, travelling `from` the seat), played by the anim kind `player` (mech's contractor
body and rig). The summary takes them from road, so road's look plugins draw them (particle3d for the
exhaust). The points in the file are the starting points; Bill tunes them in the workshop.

Mech's 34 solids models: strider, jimmy and lifter (legs3d, by `<kind>.model`); depot, hq, hangar,
pad, yard, crate and dropship; 20 modules, the seat among them (`<module>.model`, hung by the page;
their points are `empties`); and the four `socket-*` models, which nothing names. Shooter, sunrace and paladin have
none: their `"solids"` mods are scatter3d's collision solids, not this plugin.
