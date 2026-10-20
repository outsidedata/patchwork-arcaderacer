# The asset workshop

A page for looking at a game's models and characters and tuning where things go on them, without
editing files by hand. It reads one game from its own files, draws everything with the game's own
plugins (so what you see is what the game draws), and writes your changes back into the game's files.

## Start it

```
node --experimental-strip-types tools/workshop/workshop.server.ts
```

Then open `http://127.0.0.1:5180/?game=<game>`, for example `?game=mech`. Add `&model=<name>` to open
one model straight away, `&body=<kind>` to open one character, or `&vehicle=<name>` to open one car
(`?game=vehicles&vehicle=jeep`).

Use `127.0.0.1`, not `localhost`, if another program on the machine also listens on port 5180.

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
  characters (bodies). Click one to open it.
- **Middle:** the 3D view. Drag to orbit, scroll to zoom. The buttons along the top switch to front,
  side, top and close-up views, and turn on wireframe, the bounding box and the empties.
- **Bottom left, the Fit box:** what you can change for the thing that's open, and **Save to game**.
- **Right column:** notes on the open model.

Whenever a file of the game changes on disk, the view reloads itself and keeps the camera where it was.

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

**Save to game** writes the moved points into their models (the jimmy's own, or the seat's), bakes each
pack clip you chose into the body's rig (named after its file, `Stand To Sit.fbx` becoming
`standToSit`, every body of the rig baked again in Blender), and writes the interaction's file.
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

### Notes

Click the model to leave a note pinned to that spot. Clicking a note's card puts the camera back
where it was when the note was written.

### Bring a prop from another game

**Bring…** copies a glb from another game into this one, adds it to the game's catalogue, and can
hand it to a character held the way the other game held it, as a starting point for the fit.

## For agents

The full map of the files, the API and the rules is `.claude/skills/asset-workshop/SKILL.md`. Each
file's header says what it does. The tests are `yarn vitest run tools/workshop`.
