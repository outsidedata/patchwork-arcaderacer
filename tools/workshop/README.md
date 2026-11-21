# The asset workshop

A page for looking at a game's models and characters and tuning where things go on them, without
editing files by hand. It reads one game from its own files, draws everything with the game's own
plugins (so what you see is what the game draws), and writes your changes back into the game's files.

## Start it

```
yarn workshop <game>                         # the asset workshop
yarn workshop ui <game>                      # the UI workshop
yarn workshop particles <game>               # the particle workshop (--effect <name>, --file <repo path>)
yarn workshop particles --effects <path>     # the particle workshop on any effects file (--sheet <key>=<path>)
yarn workshop poses                          # the pose lab
yarn workshop puppet3d <game>                # the puppet3d workshop
yarn workshop hair3d <game>                  # the hair workshop
yarn workshop grass3d <game>                 # the grass workshop
```

Each starts the server and opens its page in the browser. The asset workshop is at
`http://127.0.0.1:5180/?game=<game>`, for example `?game=mech`. Add `&model=<name>` to open
one model straight away, `&body=<kind>` to open one character, `&vehicle=<name>` to open one car
(`?game=vehicles&vehicle=jeep`), or `&move=<name>&step=<n>` to open one move at one of its steps
(`?game=demo_walker&move=floor&step=12`).

Use `127.0.0.1`, not `localhost`, if another program on the machine also listens on port 5180.
`WORKSHOP_PORT` in the shell serves it on another port.

The same server serves six more pages, each described below: the pose lab at `/poses`, the UI
workshop at `/ui?game=<game>`, the particle workshop at `/particles?game=<game>`, the puppet3d
workshop at `/puppet3d?game=<game>`, the hair workshop at `/hair3d?game=<game>` and the grass workshop
at `/grass3d?game=<game>`.

It reads `.env` at the repo's root (copied from `.env.example`), under what the shell sets:

- `PATCHWORK_CLIPS`: the clip collection, whose `packs/` folder holds the Mixamo packs the clip
  lists offer and the pose lab writes to. Unset, it is `~/troupe-collection`.
- `PATCHWORK_LIBRARY`: the library, whose rigged characters (`characters/<name>/<name>.fbx`) the pose
  lab poses. Unset, it is `~/patchwork-library`.
- `BLENDER`: Blender, which bakes a pack clip into a rig on **Save to game** and writes the pose
  lab's clips. Unset, it is the macOS application's.

## The words

- **Body:** a character the game animates (a raider, the mech worker, a farmer).
- **Prop:** a model a body holds and carries with it (a rifle). Its mount points (`stock`, `grip`,
  `support`) are where the body holds it.
- **Machine:** a model a body gets onto or into and works (a jimmy, a car, a tractor). It doesn't
  move with the body; the body moves with it.
- **Point:** an empty on a model, a place in its own frame: where a hand grips, a foot rests, the
  hips sit, the body stands to climb on.
- **Interaction:** a body doing one thing with a machine, from start to finish: boarding a jimmy,
  getting into a car, climbing up onto a tractor. It is a list of steps played in order.
- **Step:** one part of an interaction, tuned on its own. A step pairs:
  - a **clip**, the animation the body plays during it, which can be swapped for any other;
  - its **anchor**, the machine's point the body stands at (`at`) the whole step, facing the point's
    way turned by `turn` degrees;
  - the machine's **pose** during it (a jimmy knelt or standing), which is the game's, not the step's;
  - its **IK targets**, the machine's points the body's hands and feet reach while it lasts, each limb
    bent the way its **pole** points.

  The jimmy's boarding is three steps: **climb** (at `board`, the jimmy knelt), **sit** (at `edge`,
  knelt), and **seated** (at `seat`, standing, hands on `gripL`/`gripR` and feet on
  `footL`/`footR`). It is `games/mech/assets/jimmy.board.interaction.json`; the kneeling is the jimmy's
  definition in `mech.json` (`interact.board`).

  Drive's cars have three interactions, shared by every car: **enter** (step **in**, the body walking
  into the seat as its clip walks, then **seated**, hands on the steering wheel's `gripL`/`gripR` and
  feet on `footL`/`footR`), **sit** (seated alone) and **exit** (step **out**, walking out of the
  seat). They are `games/vehicles/assets/box3dvehicle.{enter,sit,exit}.interaction.json`.
- **Tuning a step:** choosing its clip and moving its anchor and IK targets while it plays, with
  nothing of any other step in reach.

## The screen

- **Left column:** the game's models and its cars with interactions (`vehicle · <name>`), then its
  characters (bodies), then its moves and the models it marks. Click one to open it.
- **Middle:** the 3D view. Drag to orbit, scroll to zoom. The buttons along the top switch to front,
  side, top and close-up views, and turn on wireframe, the bounding box and the empties.
- **Bottom left, the Fit box:** what you can change for the thing that's open, and **Save to game**.
- **Right column:** notes on the open model.

Whenever a file of the game changes on disk, the view reloads itself and keeps the camera where it was.

The view uses the game's own tone, shadows and ambient occlusion, but never its bloom: a game's bloom
is set for its own lights, and under the workshop's studio lights it would make a white model glow.

## What you can do

### Watch a character play its animations

Open a body. The **Clip** box searches every clip of its rig, plus every clip in the Mixamo packs
folder, marked "(not baked)": type words of the name or the pack. Pick one and it plays on the character on a loop, with play/pause and a
scrubber. An unbaked clip is a preview: the game only has it once it's added to the rig and baked
(`.claude/skills/using-mixamo-assets/`).

### Fit a held prop to a character (a gun in the hands)

Each glb model has an "on <body>" button for each character. Click one to open the fit:

- **IK off:** move the prop in the hand with the gizmo or the six number fields.
- **IK on:** set where the prop sits against the body (the anchor) and where each hand grips it (the
  prop's mount points, such as `stock`, `grip` and `support`). The arms bend to reach them, and the
  box shows each hand "on it" or how many millimetres short.
- **Take from this pose:** pause a clip on a good pose and press it, to start the fit from where the
  hands already are.
- **Save to game** writes the mount points into the prop's glb, and the hold and the IK into every
  scene of the game that draws that character with that prop.

### Move the points on a solids model (mechs, modules, buildings)

Open a solids model (its subtitle starts with `solids`). It's drawn as the game draws it: a mech
standing on its legs, a building as the base draws it, a module on its own. Its nodes show as small
labelled frames (amber ones are mounts) and its empties as dots.

- Click a node or empty in the Fit box, then drag the gizmo or type into the fields.
- **Add** makes a new node or empty.
- **Save to game** writes them into the model's json, leaving the rest of the file as it was.

An empty can ride a moving part, such as a grip on a stick that tilts. The workshop moves its point
and keeps the part it rides.

### Tune an interaction (boarding a jimmy)

Open a machine that has interactions (in mech, `jimmy-model`). The box, now titled **Interaction**,
shows a row **Interaction**: **model** (the machine alone, its nodes and empties) and a button for
each interaction; then a row **Step** with the interaction's steps.
The machine is fitted as the game fits it (the jimmy with its seat and shields) and posed as the game
poses it in the step, and the body plays the step beside it, placed and bent exactly as the game does.

Click a step. Only that step is in reach:

- **Clip:** click the box and type: the list narrows to the clips (the body's own, then every pack
  clip) whose name and pack hold every word you type. Click one, or ↑/↓ and Enter. A pack clip plays as a
  preview straight away.
- **Facing:** degrees the body faces from its point's way (the step's `turn`). Beside it, how long the
  step lasts (its clip's length), or that it holds until the game ends it.
- **<limb> bends:** three numbers per hand or foot (the limb's `pole`), the way its elbow or knee
  bends. Under them, each hand and foot "on it" or how many millimetres short.
- **Point:** only the points this step uses (Move places one; Rotate, or the three turn fields in
  degrees, turns it, and a hand or foot bent onto it takes that turn, as a hand on a gun's grip does) (`board` for climb; `edge` and `seat` for sit;
  `seat`, the grips and the pedals for seated). Click one, then drag the gizmo or type. The body
  follows as you move it.
- **<machine> <field>:** what the machine does during the step, a number for each field of its pose
  (`jimmy kneel`, 0 standing to 1 knelt), set on it every frame as you change it.

**Save to game** writes the moved points into their models (the jimmy's own, or the seat's), bakes each
pack clip you chose into the body's rig (named after its file, `Stand To Sit.fbx` becoming
`standToSit`, every body of the rig baked again in Blender), writes the interaction's file, and writes
the machine's pose in each step into the game's definitions file (the jimmy's `interact.board` in
`mech.json`), leaving the rest of the file as it was.
**Revert** drops everything not saved.

### Tune a car's interactions (getting into a jeep)

In vehicles, each car with interactions is listed under the models as `vehicle · jeep`, `vehicle · cart`,
`vehicle · truck`. Open one: it is drawn by the game's own car plugin, standing still on its wheels,
and the box shows **vehicle** (the car alone, with every one of its points) and **enter**, **sit** and
**exit**. Everything above works the same: the step's clip, facing, poles, playhead, the step's points
to move or turn, Save and Revert.

- **Steer:** turns the steering wheel (−1 to 1, left positive), and the hands on it follow, so you can
  check the grips at full lock. It is only for looking: it is not saved.
- A car's points are in the car's own frame (+x forward, +y up, +z right); a grip on the steering wheel
  moves in the wheel's frame as it is turned now.
- **Save to game** writes the points into the car's look in `games/vehicles/vehicles.scene.json`
  (`world.box3dvehicle.vehicles.<car>.look.points`), leaving the rest of the file as it was.
- A car has no notes of its own (the truck's glb, listed as the model `truck`, does).

### Look at a game's moves (a ladder, a chair, a wall)

A game with a `games/<game>/<game>.workshop.ts` lists its moves under **Moves**: the body against
each thing of its level it makes a move against (demo_walker: its ladder, each chair, the walls it
takes cover at, vaults and runs up, and the floor). The game's own code places the body, on the game's
own level drawn by its own looks, so what you see is where the game puts it, with no walking there.

- **Step:** each part of the move (the ladder's mount, climb and top). The playhead plays it; drag it,
  or step a frame either way with the buttons or `,` and `.`.
- **Dots:** where the clip touches something now (a sole on the floor, a ball on a rung, a palm on a
  wall's top, the seat on the chair), each with how far it stands off it in millimetres, + over and −
  under: green on it, red further off than the game allows, grey where nothing is measured. The panel
  lists them.
- **Views:** Free, Front (from ahead of the body as the step begins), Side (from its left), Top, and
  Close-up on the dots, each framing the body over the whole step.
- **Key frames:** the step at its start, at every moment a contact begins or ends, and at its end,
  side by side, each with its contacts. Click one to put the playhead there.

A move saves nothing: change the game's level or numbers, and the page loads again on the same step
with the camera where it was.

### Mark points and sizes on a model written from elsewhere (canyonracer's podracers)

Some models are written again by Blender's export every time they change, so anything marked inside
the glb would be lost. A game's `<game>.workshop.ts` can name such models (its `annotate`); they are
listed under **Marks**, and their points and sizes are kept in a file beside the glb,
`<stem>.points.json`, never in the glb.

- The model is drawn by the game's own plugins, from rows the file's sliders set.
- Each point the model needs is listed with what it is for; one not marked yet is red. A point with a
  mirror is drawn mirrored across the model's middle and is written whenever its pair is marked.
  Points the model may have more of are added and taken out in the panel.
- Sizes are set by dragging the corners of the wire guides drawn from them; the rest are measured off
  the model.
- **Save to game** writes the points marked, every size and the measured ones into the points file.
  A click on the model leaves a note on its glb.

### Notes

Click the model to leave a note pinned to that spot. Clicking a note's card puts the camera back
where it was when the note was written.

### Bring a prop from another game

**Bring…** copies a glb from another game into this one, adds it to the game's catalogue, and can
hand it to a character held the way the other game held it, as a starting point for the fit.

## The pose lab (`/poses`)

Pose one of the library's rigged characters by hand and save the poses as one clip, a frame a pose.

- Click a joint and turn it with the gizmo; the hips move too.
- Add a pose at rest, as a copy of the one chosen, or from a frame of any pack clip laid on this body.
- The tween shows two poses mixed by the slider, or played to and fro over a second: what anim draws
  while it fades from one clip to another.
- **Save** writes the clip to `poses/<name>.fbx` in the packs folder, through Blender, with
  `<name>.poses.json` beside it naming each frame's pose. A saved clip opens again from the clip list,
  each frame a pose under its name.

## The puppet3d workshop (`/puppet3d?game=<game>`)

Where a game's animals are made to move, with no game running. Pick an animal, set what it is doing,
pick one of its motions, and shape it on the animal itself. `&kind=<kind>` opens one animal straight
away (`?game=demo_puppet3d&kind=lion`).

- **The animal** (top): one button for each kind a scene of the game lists in `world.puppet3d.kinds`.
  It is a row the page moves over flat ground, a step of the scene's `dt` at a time, stood, stepped,
  sensed and posed by the plugin's own code (`stand`, `stepped`, `sensed`, `stood`) with the solvers the
  scene's `world.puppet3d.mods.behaviors` deliver: what the game draws for the same row. The camera
  follows it; side, front, back and above look at it from there.
- **What it's doing** (left): standing still, or going at one of the paces the game moves it at (a
  sheet's `gait.paces` named by its `sheet` and `paces`, or its definition's `speeds`, its `stride` going
  round once every `stride` metres), each named with its speed; how fast it turns; **on its hind legs**
  for a kind that senses `rowUpright`; **Leap**, to a height, for a solver that leaps; **Back to the
  start**.
- **Its motions** (left): each of its drivers, with when it plays in words. The box leaves one out
  here (never saved); **✕** takes a motion off the animal. **Give it another** puts a sheet of the
  library (`$PATCHWORK_LIBRARY/cues/`) on it, offered only the sheets that move one of its parts: copied
  into the game's `assets/cues/`, listed in the scene's catalogue and played all the time
  (`POST /api/puppet3d/<game>/layer`). Adding and taking off are written at once, and ask for changes
  not saved to be saved or reverted first.
- **The motion picked** (right) is played on the animal in full, whatever its timing, unless **show it
  as in the game** is ticked. **Plays** is its timing (its `weight`): all the time, every so often (every
  so many seconds, for so long, easing in and out over so long, starting so far in), while standing
  (gone by a speed), while moving (full by a speed), or never. A timing none of these says (a walk's
  crossfade onto its hind legs) is told in words and kept as written.
- **Body parts it moves**: the parts its cue sheet names, and the animal's other parts folded under
  them; a finer part (a Mixamo hand's fingers, `Spine1` and `Spine2`) is listed under the part its name
  starts with and shown once that part is picked. A solver's motion (the walk) lists only the parts its
  sheet carries, since it stands the rest. The parts it moves are amber dots on the animal, the rest
  grey; click a dot to pick that part.
- **Turning a part**: the part picked has three rings on the animal, one for each way it turns: red up
  and down (`bend`), green side to side (`swing`), blue roll (`twist`), on the axes the plugin turns it
  about. Drag a ring round and the part turns with the pointer. Beside it, each way it turns has
  **held at** (degrees), **sways** (degrees each way) and **every** (seconds). A part the motion did not
  move is given one at its rest turn as soon as it is turned. A part also moved by many keys (a walk
  written from a clip) keeps them, and what is held here is added on top. **Stop moving** takes the part
  out of the motion, leaving it to the motions under it.
- **How it walks**: a solver's motion carries its numbers, its block of the body's sheet, each read on
  the solver's next step; **Stand again** makes its body anew from them.
- **Send to the library**: a motion whose sheet the library has too, once saved, is copied over the
  library's (`POST /api/puppet3d/<game>/library`), so every game can take this one.
- **The clock** (bottom): play or pause (Space), and drag to any moment.
- **Save** writes each change in place, layout kept: a timing into the scene's definitions file, a part
  into the motion's cue sheet (`<name>.cues.json`, the whole sheet when a part was given or taken out),
  a solver's number into its sheet (`POST /api/puppet3d/<game>`). **Revert** reads the files again.

## The hair workshop (`/hair3d?game=<game>`)

A game's hairs grown by core's own hair3d on test subjects, with no game running: the hair hangs, swings
and blows as it does in the game, while every number of it is changed and saved into the game's hairs
file (`world.hair3d.hairs`). Add `&file=<repo path>` for one of several hairs files, and
`&hair=<name>&subject=<name>&motion=<name>` to open on one hair, subject and motion
(`?game=demo_puppet3d&hair=horseMane&subject=neck&motion=walk`); the page keeps them in its address.

- **Hair** (left): every hair of the file. The one picked is the one grown and the one the right column
  shows.
- **Test subject**: what the hair is grown on here, each a plain shape carried by one bone, its anchor:
  `head` (a head-sized ball, hair on its crown and back), `ball` (hair all over), `neck` (a neck lying
  along the way it runs, hair along its top: a mane), `dock` (a tail's root, hair on its back half),
  `body` (a trunk standing up, hair all over: a coat) and `pelt` (a flat patch facing up). Where a hair
  grows on a subject is the subject's own; where it grows in the game (its `on`) is not shown or changed.
- **Motion**: how the anchor moves, so the hair is seen doing what a body does to it. A button for each
  motion the workshop has (`still`, `walk`, `run`, `nod`, `shake`, `toss`, `shove`, `spin`) sets every
  field under it, and each field can be typed: `forward`, metres a second it runs ahead, the grid
  passing under it; `move 1` and `move 2`, each how far it is moved either way along x, y and z and how
  many times a second; `turn 1` and `turn 2`, the same in degrees about x (a nod), y (a shake) and z
  (a tilt); `spin`, degrees a second it turns without end. The motion is never saved.
- **The stage**: the hair on its subject over a ground of 1 m squares, lit by the stage's own sky and
  sun, drawn through the game's render3d prefab. Drag to orbit, wheel to zoom; side, front, back and
  above look from there. The top left says how many locks are simulated and strands drawn.
- **The numbers** (right): every number of the hair, a slider and a field each, and those of the nodes
  of its `program` where it has one (the ops, the wiring and the `out` are written in the file), then the
  file's wind and gust, which every hair of the file blows in. Each change is drawn that frame; the first
  group and a program's numbers root and build the hair again, as they do in the game. A number changed
  since the file was read is amber. A hair with `ties` has a group for each tie (place, reach, share, the
  centre the hair is laid round, how it hangs, the bundle's width, a second tie below, stiffness and a
  braid's swing and pitch): a tie's place, reach and share root the hair again, the rest are read as it
  draws. Only the `head` subject carries ties (its `ties.origin` in the stage file is where a game's head
  bone, whose origin is at the neck, is in the ball); on any other subject a hair with ties hangs loose.
  Ties are written in the file, never added or taken out here.
- **Save to game** writes each changed number in place into the hairs file, checked by hair3d's own
  check and, for each hair's program, compiled over the ops the first scene that names the file delivers,
  so a number an op refuses is not written (`POST /api/hair3d/<game>`). **Revert** reads the file again.

The subjects, their motions and the stage's light are `tools/workshop/hair3d.stage.json`; a subject or a
motion added there is on the page. The subjects are drawn by the workshop's own plugin,
`tools/workshop/plugins/subjects/`, which hands hair3d the subject through its `skins` mod as a game's
plugins hand it their bodies.

## The grass workshop (`/grass3d?game=<game>`)

A game's grasses grown by core's own grass3d on test grounds, with no game running: the grass stands,
blows and is trodden down as it is in the game, while every number of it is changed and saved into the
game's grasses file (`world.grass3d.grasses`). Add `&file=<repo path>` for one of several grasses files,
and `&grass=<name>&ground=<name>&treader=<name>&view=<name>` to open on one grass, test ground, treader
and view, with `&together=1` to grow the file's other grasses with it
(`?game=demo_grass3d&grass=meadow&ground=rolling&treader=car&view=treader`); the page keeps them in its
address.

- **Grass** (left): every grass of the file. The one picked is the one the right column shows, and the
  one grown; tick **with the file's other grasses** and every grass of the file is grown over the same
  ground, as a game that names them all grows them.
- **Test ground**: what the grass is grown on here, a field 240 m a side: `flat`, `rolling` (low hills),
  `steep` (a 7 m ridge), `patchy` (flat, with bare patches, so the ragged edge of a grass is seen) and
  `rough` (the hills and the patches). Where a grass grows on a test ground is the ground's own; where it
  grows in the game (its `rules`) is not shown or changed. The ground is cut as finely as the game's land
  where the scene's land is terrain3d, so a blade stands, and is trodden, on the same lattice.
- **Trodden by**: what treads the grass, going round the middle of the field: `nothing`, `standing` (a
  body standing still), `walker`, `runner` and `car` (a body and four wheels). A body presses the grass
  as a walking body does in a game, a car's body and wheels as a car's do. Under them, the circle it goes
  round and how fast, which can be typed. It is never saved.
- **The stage**: the grass on its ground, a line on the ground every metre, lit by the stage's own sky
  and sun, drawn through the game's render3d prefab. Drag to orbit, wheel to zoom; `feet`, `across`,
  `wind` and `above` look from there, and `treader` goes with what treads it. The top left says how many
  blocks of the ground are filled, and how many chunks are drawn and cast shadows.
- **The numbers** (right): every number of the grass, a slider and a field each, and those of the nodes
  of its `program` where it has one (the ops, the wiring and the `out` are written in the file), then the
  file's wind, gusts, bend and trampling, which every grass of the file shares. Each change is drawn that
  frame. A number changed since the file was read is amber.
- **Save to game** writes each changed number in place into the grasses file, checked by grass3d's own
  check and, for each grass's program, compiled over the ops the first scene that names the file delivers,
  so a number an op refuses is not written (`POST /api/grass3d/<game>`). **Revert** reads the file again.

The field, the test grounds, the treaders, the views and the stage's light are
`tools/workshop/grass3d.stage.json`; a ground, a treader or a view added there is on the page. The
ground and the treader are drawn by the workshop's own plugin, `tools/workshop/plugins/grounds/`, which
hands grass3d the ground through its `land` mod as terrain3d hands it a game's land, and hands gpgpu3d
the treader as a game's plugins hand it their cars and bodies.

## The UI workshop (`/ui?game=<game>`)

A game's title screen, HUD and messages, drawn by the game's own looks on core's ui plugin over a
frame of the game, with no game running. Add `&screen=<screen>&state=<state>` to open one screen in
one state. The screens come from `games/<game>/<game>.screens.ts`; a game with none is drawn from its
scenes alone, a screen per scene showing every style of its `world.ui`.

- **Left column:** every screen and its states.
- **Right column:** the screen's things. Click one there or on the canvas; it is outlined and its card
  opens: its words, its type (typeface, size, colour, bold, outline, letter spacing), a button's or a
  bar's look, where it stands, and any other colour or number the screens file names.
- Each change shows on the next frame, and a changed control's name turns amber.
- **Save to game** writes every change into the scene's ui and the definitions file, leaving the rest
  of each file as it was. **Revert** drops them.

A file of the game written on disk loads the page again on the same screen and state, unless there are
changes not yet saved.

## The particle workshop (`/particles?game=<game>`)

A game's particle effects played by core's particle3d on the game's own render3d (its tone, exposure
and bloom), with no game running, on a grid of 1 m squares beside a 1.8 m figure. Add
`&file=<path>` to open one effects file and `&effect=<name>` to open one effect.

Every control of the page is in its address, and the address changes as each is turned, so a copied
address opens the page as it was. A value the page cannot take is named on it.

| Key | What it sets |
| --- | --- |
| `effect` | the effect shown |
| `drawer` | `particle3d` or `gpuparticle3d` |
| `from` | `still` or `thrown` |
| `scale` | the effect's scale |
| `dir`, `to` | `x,y,z`: its dir, and where a beam ends |
| `time` | how fast time runs, 0.05 to 2 |
| `auto`, `every` | a burst thrown again (`1` or `0`), every so many whole seconds |
| `grid` | the grid and the stick, `1` or `0` |
| `dither` | the scene's dither3d, `1` or `0`, when the scene lists it; the stage draws through it as the game does |
| `background` | `rrggbb` |
| `sky`, `sun`, `exposure` | the stage's light |
| `camera`, `look` | `x,y,z`: where the camera stands, and the point it turns round |
| `mute`, `solo`, `open` | layers by their card's number from 1: muted, played alone, opened |
| `generator` | the force generator shown |
| `ui3d` | `<scene>/<look>`: a look of the scene's ui3d looks file shown on the stage (below) |
| `d.<driver>` | a driver's number or expression, not yet saved |

`/particles?effect=portal2&drawer=particle3d&time=0.25&solo=4&d.storm=3&camera=1.6,2.2,2.4&look=0.6,1.6,0`

Any effects file, in a game or not, is opened by starting the workshop on it:

```
yarn workshop particles --effects <path> [--sheet <key>=<path>]… [--effect <name>]
```

which opens `/particles` (`--effect <name>` on one effect). A file a game's scene names is played in
that scene's light, with its sheets. Any other is played on the workshop's own stage,
`particles.stage.json` (neutral tone, bloom, lights3d for lamps), and each sheet its layers draw from is
given with `--sheet`, its key as the layers name it and the path of its sheet json; the page names any
that is missing. **Save** writes into that file.

**Drawn by**, in the header, picks the plugin that plays the effects: particle3d, every particle on the
CPU, or gpuparticle3d, every particle on the GPU, from the same file. Switching drops the particles in the
air and throws the effect again on the other; the browser keeps the choice across reloads.

- **Left column:** every effect of the file; type a name to make a new one. Under them, the file's
  **Drivers**, each a name and its number or its expression of the others: type one, or drag across its
  name, and every number of the file that names it moves as it does, in the particles in the air too.
  Under those, the file's **Force generators**: pick one and the right column shows its entries, each
  a card of every field an entry has: its gravity, drag, pull, swirl and swirl axis, the offset of the
  point it pulls toward and turns about and what that is anchored to, its push along a direction, its
  range and falloff, its noise (amplitude, frequency, turbulence and scroll), its wind and drag by
  speed, the shell or the axis line its pull draws toward, and its strength over a particle's life and
  over the effect's age; **Back to** the effect shows the layers again. `assets/effects/portal.json` has
  both, and `assets/effects/explosions/blast.json` is a burst moved by five generators.
- **From:** still, from the middle of the grid; or thrown, riding a small bomb box3d throws across the
  stage, bouncing until it rests, then put back and thrown again (`thrown.ts`; how it is thrown, how it
  bounces and how often are the `thrown` numbers of `particles.stage.json`). A stream runs on the bomb
  as it flies, the way an effect on a moving thing does in a game; a burst is thrown with it each time.
- **Under the stage:** an effect that bursts again and again plays without end; any other is thrown by
  **Throw**, and again every few seconds while its toggle is on. Beside it, the effect's `scale`, `dir`
  and `to`, and how fast time runs, to watch a quick burst slowly.
- **Right column:** the effect's layers, each a card: mute it or play it alone (never saved), move it,
  copy it, remove it, or add one. An open layer shows its main fields, then folders for Timing, Colour
  and fade, Picture, Where it starts, Forces and Light. A field left out shows greyed what particle3d
  does without it; × takes a field out. Every particle in the air takes a changed number on the next
  step. Any number field takes an expression of the file's drivers in place of a number
  (`0.2 / amplitude`), shown blue, and outlined red until it reads as one. Under Forces, **Force
  generators** lists each of the file's with how hard it acts on this layer: one strength, or with a
  second after `to`, a range each particle is rolled in; × takes the layer out of it. A field of stops
  (**Colours over life**, **Opacity over life**, **Size over life**, and an entry's **Strength over
  life** and **Strength over age**) is a line for each stop, where it is and its value, a colour picked
  for a colour stop; **Add a stop** puts one after the last and × takes one out. **Shape** draws the layer as one of particle3d's own soft pictures (puff, puff2, glow, halo,
  spark, streak, ring, star, bolt, bolt2), with no sheet needed, and **Each carries** gives every
  particle of the layer its own running copy of another effect, which flies along with it: an
  explosion's chunks each trailing smoke. A carried effect's **Beam to target** layer reaches from its
  particle back to the point the particle was thrown from, so drawn as `bolt` it is lightning:
  `assets/effects/portal.json`'s `arc`, carried inside its `ringsmoke`. A layer's words (a field that is none of particle3d's own, such as instances3d's
  `mesh`) each show as a line of JSON. The stage lists instances3d and names it in
  `world.particle3d.mods.behaviors`, and lights the stage with a sky and a sun, so a `mesh` layer draws
  real lit rocks; its ground is y 0, which a layer with `bounce` bounces off. `assets/effects/smokebomb.json`'s
  `explosion` uses all of these.
- **Save to game** writes each changed effect, and the drivers and the force generators when they
  changed, into the effects file, checked by particle3d first, leaving the rest of the file as it was.
  **Revert** drops every change.

The file written on disk loads the page again on the same effect, unless there are changes
not yet saved.

### ui3d mode: a game's title and its particles

A scene that plays the effects file and lists ui3d with a looks file (`world.ui3d.looks`) is found the
way the effects file is, and the left column's **ui3d** section lists every look of its file under the
scene's name. Click one: ui3d shows it on the stage in front of the camera, with the scene's own words
(starfighter's `logo`, its name flying in and burning) and its `particles` played from the effects as
they are on the page, so a number changed in `title_ember` shows on the title from the next step. The
effect chosen on the left is not thrown while a look is shown. The pointer over a look that can be
selected selects it, so an effect driven by its `selected` changes as it would in the game. **Replay**
shows the look again from its first frame, as does any change that throws the effect again. Click it
again to put it away.

`/particles?game=starfighter&ui3d=title/title`

### Pictures of effects (`yarn particle-views`)

```
yarn particle-views <views.json> <out folder>
```

takes a picture of an effect from any camera, at any moment, with any of its layers off, in a headless
Chrome, with nothing on the screen. `<views.json>` is a list of views, each one picture written as
`<out folder>/<name>.png`:

```json
[
  { "file": "assets/effects/smokebomb.json", "camera": [6, 3.5, 8], "target": [0, 1.2, 0], "preroll": 0.5 },
  { "name": "blast-smoke", "file": "assets/effects/smokebomb.json", "effect": "explosion",
    "camera": [0, 2, 12], "target": [0, 2, 0], "preroll": 1.5,
    "only": [6, 10, 11], "off": { "chunktrail": [1] }, "stage": false, "size": [800, 800] }
]
```

- `file`: the effects file, a path from the views file's folder. Each view names its own, so one views
  file can go through many.
- `effect`: the effect thrown. Left out, the view is one picture of every effect of the file.
- `camera`, `target`: where the camera stands and the point it looks at, in metres, y up, the ground y 0.
- `preroll`: the seconds the effect has run when the picture is taken. It is stepped by the scene's
  `dt` from the moment it is thrown and rolled from `seed`, so a view is the same picture every time.
- `off`, `only`: the layers not played, or the only ones played. A list is layers of `effect`, each its
  place in the effect's list from 0; `{ "<effect>": [layers] }` reaches any effect of the file, the ones
  `effect` names and the ones its particles carry.
- Also `name`, `fov`, `size`, `at`, `dir`, `to`, `scale`, `seed`, `from` (`still` or `thrown`, riding the
  bomb), `stage` (false leaves out the grid and the stick) and `sheets`; the header of
  `scripts/particle-views.ts` says what each is when left out.

The stage is the workshop's, `stage.ts`, which the page above plays on too. It prints each picture as it
is written, with the particles and effects in the air in it.

## For agents

The full map of the files, the API and the rules is `.claude/skills/asset-workshop/SKILL.md`. Each
file's header says what it does. The tests are `yarn vitest run tools/workshop`.
