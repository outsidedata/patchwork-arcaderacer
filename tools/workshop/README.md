# The asset workshop

A page for looking at a game's models and characters and tuning where things go on them, without
editing files by hand. It reads one game from its own files, draws everything with the game's own
plugins (so what you see is what the game draws), and writes your changes back into the game's files.

## Start it

```
node --experimental-strip-types tools/workshop/workshop.server.ts
```

Then open `http://127.0.0.1:5180/?game=<game>`, for example `?game=mech`. Add `&model=<name>` to open
one model straight away, `&body=<kind>` to open one character, `&vehicle=<name>` to open one car
(`?game=vehicles&vehicle=jeep`), or `&move=<name>&step=<n>` to open one move at one of its steps
(`?game=demo_walker&move=floor&step=12`).

Use `127.0.0.1`, not `localhost`, if another program on the machine also listens on port 5180.
`WORKSHOP_PORT` in the shell serves it on another port.

The same server serves three more pages, each described below: the pose lab at `/poses`, the UI
workshop at `/ui?game=<game>` and the particle workshop at `/particles?game=<game>`.

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

- **Left column:** every effect of the file; type a name to make a new one.
- **Under the stage:** an effect that bursts again and again plays without end; any other is thrown by
  **Throw**, and again every few seconds while its toggle is on. Beside it, the effect's `scale`, `dir`
  and `to`, and how fast time runs, to watch a quick burst slowly.
- **Right column:** the effect's layers, each a card: mute it or play it alone (never saved), move it,
  copy it, remove it, or add one. An open layer shows its main fields, then folders for Timing, Colour
  and fade, Picture, Where it starts, Forces and Light. A field left out shows greyed what particle3d
  does without it; × takes a field out. Every particle in the air takes a changed number on the next
  step.
- **Save to game** writes each changed effect into the effects file, checked by particle3d first,
  leaving the rest of the file as it was. **Revert** drops every change.

A file of the game written on disk loads the page again on the same effect, unless there are changes
not yet saved.

## For agents

The full map of the files, the API and the rules is `.claude/skills/asset-workshop/SKILL.md`. Each
file's header says what it does. The tests are `yarn vitest run tools/workshop`.
