---
name: making-3d-assets-in-blender
description: Use in core, or any clone of it, when a game's 3D thing (a vehicle, a machine, a prop, a building, a cockpit or cab seen from inside) needs a real model instead of boxes drawn in code, built in Blender from a script and exported as glTF for the loader. Covers settling the design before building, writing down what the player sees it from, the build script and its kit, reading every size off the scene file, the viewers that check the export (view.py for any glb, eye.py from an eye inside it, a model's own look.py against the physics), byte-identical rebuilds, hooking the model into the scene, and the loop of looking in the game until it agrees. Triggers on "refresh the model", "make a model for", "it looks like boxes", "build it in Blender", "cockpit", "interior", "glb", "kit.py", "look.py", "view.py", "eye.py".
---

# Making 3D assets in Blender

A model is a Python script run headless in Blender that writes a `.glb`. The script, its kit and its
viewer sit beside the glb in the game's `assets/`, so the model can always be made again. The engine
and the plugins stay as they are: a look that needs something the export cannot carry is baked into
the model (the user skill `making-game-assets` holds that law and the pipeline for levels and props).

Blender: `/Applications/Blender.app/Contents/MacOS/Blender -b --python <script.py> -- <args>`.
One plain command per call. Logic goes in a script file, never in `-c`.

Beside this file, three scripts that run on any glb, with nothing of a game in them:

```
view.py     the model from outside: nodes, triangles, bounds, COPLANAR, and render sheets
            (turntable high and at eye height, plan, the model in thirds up close, --look points)
eye.py      the model from inside, from the eye: EYE room, VIEW (what stands above the line),
            SCREEN (each display's middle and four corners seen, facing, size, place), UV, COPLANAR,
            renders from the eye with a test card on every screen
checks.py   what the two share: the frame change, a ray tree that names the node a ray meets,
            the COPLANAR check, the render sheet
```

Run them by their path here; a model's own `look.py` adds only what is the model's own (a vehicle's
wheels against its body, below).

## The whole of it, in one line each

0. Settle the design with the person you are working for, before building.
1. Write down what the player sees the thing from, and what must be true from there.
2. Look: reference photos, the thing in the game as it is, the plugin that draws it, the numbers.
3. Build from a script, every size read off the scene.
4. The viewer prints a line for every thing from step 1, computed off the glb. Fix until all pass.
5. Look in the game. What the game shows wrong and the viewer missed becomes a viewer line.
6. Repeat 4 and 5 until the viewer, the game and the reference agree. Build twice, `cmp`. Report.

## Know when to stop

The job is done when three things agree: every viewer line passes, the game's picture of the thing
looks like the reference, and nothing the player sees is wrong in the game's screenshots. Not before:
a build that runs is not a model that is right. And not long after: do not invent more measuring once
they agree (no extra diff scripts, no frame-rate studies, no hand-reading of material values, no
re-running tests to prove failures were there before). A check worth having goes into the viewer once
and runs from then on.

## 0. Settle the design before building

What the thing is to look like is the person's to say, and they cannot say it once it is built. Before
any script, ask the questions only they can answer, in rounds, with the choices laid out: what it is
to feel like (a reference they name, a film, a real machine), its shape (a wraparound canopy or a
framed window; a pickup or a van), how much of it is seen and from where, its style (sleek, rugged,
period), what it shows (screens, lamps, damage), how dark or bright. Decide yourself what they say is
yours to decide, and say what you chose. Write every answer where the next session finds it (the
game's issue for the job), before the build.

Do not start designing on a guess and ask afterwards. On a walking machine's cockpit the first attempt jumped to
a design; it was stopped with "you need to reason this out and ask me questions … you do not have
enough information", and seven rounds of questions later the build went right the first time it was
looked at.

## 1. Write down what the player sees it from

A model is right or wrong from where the player stands. Before building, write the list of what must
be true from there; each item becomes a viewer line in step 4.

- **A vehicle, seen from the chase camera and from beside it:** its size against the physics shapes
  it stands for; every wheel clear of the body at rest, at full lock each way, at full bump, at bump
  and lock; room for what the plugin draws round it (springs, arms, tailpipes); no faces lying on
  faces. Its viewer is its own `look.py` (SIZE, CLEAR, ROOM, TYRE, below) and `view.py`.
- **An interior, seen from one eye:** room for the head; nothing but glass above the line the world
  shows over (a glareshield's lip); every screen seen whole, all four corners, by the eye, turned to
  it, big enough to read, inside the view held level; every screen's picture the right way round; no
  faces lying on faces. Its viewer is `eye.py`, with a `look.py` of its own only for what is
  particular.
- **A prop or a building, seen at play distance:** its silhouette from the camera's height and
  distance; its size against what it stands for; where it meets the ground; no faces lying on faces.
  `view.py`, with `--look` at the places that matter.

Each line names its threshold and why it is that number: the line `--line -8` because the lip
stands at about 9° below level by design, not because −8 passes. A threshold comes from the design and
is written in the viewer's header with its reason; it is never moved to turn a FAIL into a PASS.

## 2. Look before building

- **Get a reference picture first, and model off it.** Download photos of the real thing (Wikimedia
  Commons: `https://commons.wikimedia.org/wiki/Special:FilePath/<File>.jpg?width=1600`, with curl,
  into a folder of their own) and read them. Take the proportions off the photo against a known
  size (a person, a tyre, the roof height the physics gives): rocker height, body depth, cab and hood
  and bed lengths, how far the wheels stand out. Then list what makes the thing itself (for a 1970s
  pickup: the crease down the side, cut wheel arches, a flat hood, an egg-crate grille, chrome
  stacks; for a fighter's cockpit: one panoramic display, a glareshield, a frameless canopy) and build
  every one. A model made from memory with no reference comes out as boxes.
- Screenshot the thing as it is now in the game (the game's `dev.html?tab`, headless, the
  `good-webviews` skill), from the angles of step 1. Say what is wrong in what you see.
- Read the plugin that draws it, all of it: what the model replaces, what the plugin still draws
  round it, and how it finds the model's parts (by node name: lamps, `beam.L/R`, `screen.*`).
  For a vehicle that is `plugins/box3dvehicle/box3dvehicle.plugin.ts`; for a game's interior, the
  game's own plugin that puts the cabin round the camera.
- Work out the hard numbers by arithmetic, before drawing anything.
  - A vehicle: the ground under the chassis (hub at rest = `mount − spring.length + spring.sag`,
    ground = hub − wheel radius); each wheel at full bump rises `travel − sag`; a steered wheel's
    inner corners swing in by about `w/2·cos(a) + r·sin(a)` at full lock; where the plugin's parts
    stand (a coil spring `coilRadius + wire` round each mount).
  - An interior: the eye, read off the node or the file the game takes it from; the game camera's
    vertical field of view and aspect; its near plane (nothing of the cabin nearer the eye); the
    lowest pitch the player can look; the space the cabin has (from the eye to the hull it sits in).
  These decide the model's shape: a body the wheel sweeps through gets narrowed or cut; a hood that
  rises into the view above the line gets lowered.

## 3. Where the files go

```
games/<game>/assets/<model>/
  kit.py        the building blocks (copied from a game that has one, then the game's own)
  <model>.py    the build: Blender -b --python <model>.py  → writes <model>.glb beside it
  look.py       the model's own viewer, for what view.py and eye.py do not check
  <model>.glb
```

Hook it in: an entry in the scene's loader catalogue (`world.loader.assets.<model>`, `type: model`,
`url` under `/games/<game>/assets/...`, `preload: true`) in every scene that shows it, and the thing's
look pointing at it (box3dvehicle: `look.model: { asset }`). Drop look blocks the model now replaces
(`bumpers`, `grille`, `fenders`, `spare`, a cabin drawn from boxes): left in, they are numbers nobody
reads.

## 4. The build script

- Build in the game's frame, metres, +y up (a vehicle: +x forward, +z right). The kit's `B()` turns
  that into Blender's frame and the glTF export turns it back, so a vertex built at `[x, y, z]` is at
  `[x, y, z]` in the glb.
- Read every number that is the scene's off the scene file (`json.load`), never copy it in: paint
  colours from `look.paint`, the exhaust's tip from `look.exhaust`, axle positions, the beam's dip, an
  interior's eye. A hand-copied number drifts the day the scene is tuned. Place an interior's every
  part from the eye: its distance, its yaw and pitch from there.
- The header says what the frame's numbers make the model (why the front is narrower, why the hood
  falls where it does, where the drawn parts stand), the nodes it exports, and the command.
- One `Part` per node. Parts the plugin finds by name are their own nodes, named as it asks: `beam.L/R`
  empties (+x along the beam, turned nose-down by `lights.beam.dip`), `tail.*`, `reverse.*`, `amber.*`,
  `screen.*`, and `steer`, the steering wheel without its column, at its hub, its +x down the column
  into the dash, +y up its face and +z right (a kit `Part` given a `turn`), which box3dvehicle turns
  about its x with the steering.
- A screen something is drawn on is its own node with UVs running 0 to 1 over its face, u to the
  viewer's right and v up, its corners at the UV square's corners. The plugin lays its picture over
  those UVs.
- Give it an inside where there is glass: a hollow cab with a floor, seat, dash and wheel, not a
  solid block with glass painted on.
- Leave the plugin's parts room: the drawn coil spring, the arms' start at the body's side, the
  tailpipe's 0.3 m. Brackets reach to them, never into them.
- A part that does nothing the player sees is taken out, not tuned. On the cockpit a brow over the
  display, raised to clear a screen, pushed through the hood and blocked the view; it had no job, and
  removing it fixed both.

## 5. The kit's traps (each one cost a rebuild)

- **A box built with its corners swapped is inside out.** `block(lo, hi)` must order each axis
  itself; with `s * a, s * b` on the left side the corners swap and every face looks in.
- **A thickened quad grows to one side only**: away from `(b − a) × (d − a)`. Mirror a quad to the
  other side and it grows the other way unless its winding is flipped there. Where the thickness
  side matters, use a `slab` with explicit start and end instead.
- **A solidified curved sheet flips sides with its winding.** For a curved panel of a given thickness
  (a hood, a fascia), build a `solid`: the two surfaces given, and the rim joining them.
- **A screen needs its own UVs.** A kit that drops UVs gives a screen nothing to draw on; the
  `screen` piece keeps them, u right and v up.
- **The bevel leaves slivers of no area** where it clamps. Drop faces under 1e-10 m² after
  triangulating.
- **Flat panels shade in a cross** between rounded edges: their corners take normals from the
  bevel. Put a Weighted Normal modifier (`FACE_AREA`, `keep_sharp`) on every part; the export
  applies it.
- **Nothing lies on anything.** Two same-facing faces within 4 mm of each other z-fight. Trim, seams
  and panes stand 5–6 mm off the skin (a seam 12 mm thick centred on it); a wall between two sides
  ends inside them, never flush across their ends; a part that sits on another starts a few mm inside
  it; a hairline under a bezel's foot stands clear of the foot, not on it.
- **The build must be the same bytes every time.** Blender's bmesh ops hand out faces in a different
  order, each from a different first corner, from run to run, and both the triangulation and the
  export follow that order. The kit rebuilds each part canonically before writing it: every face
  from its least corner (winding kept), faces sorted by material, centre, normal and corners
  (6 places), triangulated, and made canonical again.

## 6. The viewers, and what they must print

Run them on every build. Each line is computed from the exported glb, never from the script's plan.
Each prints its number beside PASS (`covered=0.354 … PASS`), so a change shows before it fails. A FAIL
names its cause, the part and where (`VIEW blocked by hood at yaw=-36° pitch=-7.9°`, `SCREEN
screen.left corner u=0 v=1 behind hood`): a viewer that only says FAIL leaves the fix to a guess.

Any model, `view.py`:

```
Blender -b --python .claude/skills/making-3d-assets-in-blender/view.py -- <model.glb> <outdir> [--look x,y,z,r ...]

NODE ...                       every node, its kind, parent, place, triangles and materials
BBOX ...                       the bounds and size
COPLANAR faces=<n> pairs=0     same-facing triangles in one plane (4 mm) sharing > 5 × 5 mm, each
                               pair's two parts and place listed above it
RENDER <name>-high.png, -eye.png, -plan.png, -near-<k>.png, -look-<k>.png
```

An interior, `eye.py` (its header lists every option):

```
Blender -b --python .claude/skills/making-3d-assets-in-blender/eye.py -- <model.glb> <outdir> \
  --eye x,y,z [--forward x,y,z] [--fov 60] [--aspect 1.7778] [--clear glass,crack] [--line -8] \
  [--room 0.15] [--screens screen.] [--down 20] [--hide crack.,sparks]

EYE room=<m> PASS              the least distance from the eye to the cabin ≥ --room
VIEW level covered=<share>  above-8°=0/<n> PASS
                               rays across the level view: the share that meet the cabin, and how
                               many above --line meet anything not clear
SCREEN <n> first=<n> corners=4/4 facing=<cos> across=<°> tall=<°> at yaw= pitch= inview=True PASS
                               the ray to its middle and to each corner (3% in) meets the screen first
UV <n> u-right=True v-up=True PASS
COPLANAR faces=<n> pairs=0 PASS
RENDER <name>-eye.png          from the eye: level, --down, 45° left, 45° right, up, behind, each
                               screen showing a test card (arrow up its left side, arrow right along
                               its foot)
RENDER <name>-out.png          from outside: front three-quarter, side, above, behind
```

A box3dvehicle vehicle, `plugins/box3dvehicle/truck/look.py` (with `parts.ts` beside it for a look with `solid`):

```
SIZE x.min ... PASS            the model's bounds against the physics shapes it stands for
                               (body box ∪ cabin hull), within a tolerance (0.35 m)
CLEAR axle=<i> L <state> PASS  each wheel at rest, full lock each way, full bump, bump + lock:
                               the least distance from the model's surface to the wheel ≥ 0
ROOM axle=<i> L <state> coil   what the plugin draws round the model (coil, upper/lower arm where
ROOM pipe <i>                  it draws them, each tailpipe), as solid cylinders: room ≥ 0
TYRE axle=<i> L <state> coil   each drawn coil against its own tyre in every state: gap ≥ 0
RENDER <name>-plan.png         side, top, front, back, with ghost wheels at full lock and full bump
```

Check a thing where it can fail, not where it is easy to check. A screen seen at its middle can still
have its top edge behind the hood: the cockpit's first SCREEN line cast one ray to each middle and
passed while the game showed every screen's title cut off; rays to the four corners failed all five,
and named the hood.

Then build twice and `cmp` the two glbs: identical, or the kit has an order leak.

Read every render sheet at full size. They must look like the thing, and every test card's arrows
must point up and right. Fix and rebuild until every line passes and the renders are right.

## 7. Feedback: compare, list, fix, again

Making a thing is a loop, not a shot; it takes many rounds. After each build:

1. Put the game's picture of it beside the reference from the same angle.
2. Write down every way it differs (proportion, a missing part, colour, a part running through another,
   one of something there are two of, a screen's picture cut off).
3. Fix them, rebuild, and run every viewer line again, not only the one the fix was for: a fix to one
   thing moves another. On the cockpit, raising the lip 8 mm to clear a screen's title put the hood's
   ends into the view above the line; the viewer named the hood at −7.9°, and 4 mm cleared both.
4. Look in the game again.

Look at what is drawn round and on the model as hard as at the model: a vehicle's springs, arms,
tyres and smoke; a cabin's screens and what they show. Anything wrong the player sees that the viewer
passed is a missing check: the check that would have caught it goes into the viewer before the fix,
and it must FAIL on the build that shows it (the TYRE line came from a coil seen running through its
tyre; the SCREEN corners from titles seen cut off). When the plugin cannot draw what the reference
has, change the plugin: every scene that uses what changed moves in the same change, then `yarn tsc`.

## 8. Prove it in the game

Open the game headless (`dev.html?tab`, the `good-webviews` skill), bring the thing on screen, and
screenshot the angles of step 1, the same as the "before". It must agree with the Blender renders.

What the game does to a glb that Blender does not:

- **three's GLTFLoader strips the dots from node names**: `screen.left` becomes `screenleft`, and
  the original stays on `node.userData.name`. A plugin finds parts by `child.userData.name ??
  child.name`.
- **A clone shares materials and geometry with the original** (`SkeletonUtils.clone`). A plugin that
  lights one copy's lamps or rewrites one copy's screen UVs clones those materials and that geometry
  per copy, or every copy changes.
- **A model is not there on the first frames.** The plugin waits for the loader's entry
  (`loader.get(asset) === undefined` is "not yet"), and so does anything that reads the camera the
  model sits round.
- **The camera's field of view and near plane are the game's.** The viewer's `--fov`, `--aspect` and
  the eye are read off the game's own numbers, so what passes in Blender is what the game shows.

Then stop and report: what it was, what it is now, the viewer's lines with their numbers, the
triangle count, the `cmp`, the screenshots (the `provide-evidence` skill's page).

A model is art. Do not run the game's test suite for it, and never stash, revert or check out the
game's files to compare against the old look: the screenshots from step 2 are the "before".
