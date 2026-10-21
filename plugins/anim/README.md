# anim

Skeletal animation for 3D characters: a rigged model per row, clips picked from how the row moves,
crossfades, an upper-body layer for gestures, markers on the timeline, travel carried by one-shot
clips, an aim that pitches the upper body, and props hung on bones.

## Why use it

Use anim when a kind is a rigged character (a Mixamo body, an X Bot, a soldier, a townsperson) that
walks, runs, strafes, jumps, falls, lands, attacks, rolls or waves. The rule that moves the body
writes where it is and how fast it goes; anim turns that into the clip every seat sees, the same on
every page, including a seat that joins late.

## How it works

anim has a server half (`anim.sim.ts`) and a browser half (`anim.plugin.ts`). It has no row of its
own: everything it plays is a field on the row of the kind that plays it.

**Server half.** A kind's rule calls `animate(me, w, dt)` every step. It reads the row's position,
facing, velocity, `grounded` and `limp` (by the field names the kind's `reads` gives), and writes the
playhead fields: `state`, `clip`, `clipT`, `rate`, `blend`, `from`, `fromT`, the upper channel's
`upper`, `upperT`, `upperW`, `was`, `wasT`, `wasW`, and `sink`, `holds`, `cancel`, `rig`.

- On the ground and moving, it picks a gear: the loop clips of the row's stance whose direction is
  nearest the way the body moves against its facing, and of those the fastest one the body is fast
  enough for. The playhead runs at speed / gear speed, so the feet stay planted at any speed.
- Slower than `world.anim.still`, the body plays its stance's `still` role.
- Leaving the ground it plays `jump` or `leap` (by speed over the ground), in the air `fall`, and on
  touching down faster than `landFall`, `land`.
- `play(me, clip, { holds, rate })` starts a one-shot as an act. A one-shot that moves the body
  (a roll, a vault, a turn on the spot) carries travel: `animate` returns `{ move, yaw }` measured from
  the clip's table, and the caller slides the body by it.
- `gesture(me, clip)` plays a clip on the upper channel (the bones under the rig's `mask`) over
  whatever the legs are doing: a shot, a reload, a wave.
- Markers (`"peak"`, `"50%"` or seconds) fire as the playhead crosses them, and `animate` returns them
  in order, so a rule can land a hit or play a footstep on the frame the clip says.
- Crossfades are row fields that rise by dt/`fade` a step, never a page clock, so every seat draws
  the same fade.
- `stop(me, w)` ends an act, `rest(me)` puts a row back as if it had played nothing (a respawn),
  `committed(me)` says whether an act still holds the body.
- `posed(from, me)` poses the row's whole skeleton on the server exactly as the browser half draws
  it: every joint of the model, as a matrix in the body's frame. It reads the model's own packed glb
  (the kind's `glb`, a loader `binary` entry of the same file), decoded with three's meshopt decoder
  and sampled as three's interpolants sample it, blends the same clips at the same weights (the
  crossfade, the upper-body gestures), pins the hips the same way and turns the aim on after, with
  three's own math classes. So a rule knows where a hand, a head or a sword is on the frame a seat
  sees it, mid-crossfade too: the joints it gives stand within a micron of the drawn ones. A row is
  posed once a step, however many rules ask.
- `ends(w, me, segment)` is one limb segment's two ends in one clip at one playhead, read straight
  between the two baked frames the playhead falls between.

**Browser half.** Each row of a kind `world.anim.kinds` lists gets its own clone of the kind's model
from the loader, added to render3d's scene. The three.js mixer is scrubbed, never run: every frame
each action's time and weight are written from the row's fields and `mixer.update(0)` evaluates
them. The hips are pinned so the travel the row already carries is not drawn twice. Mirrored clips
(a left strafe made into a right one) are built on the page from their source. A rig's `meshes` and
`show` hide and show meshes by stance (a helmet, a holstered gun). A kind's `aim` turns listed bones
by shares of the row's aim pitch, and `props` hangs loader models on bones (a rifle in the hand).

A row whose `limp` field is true is not drawn by anim: whatever made it limp (ragdoll3d) owns the
model.

## Using it

1. List `anim` in the scene's `plugins` before `render3d` (the other order throws). It needs
   `loader` and `render3d`.
2. Give the scene `world.anim`:

   ```json
   "anim": {
     "still": 0.05, "shift": 0.75, "leap": 0.5, "landFall": 7.5, "moves": 0.05, "turns": 30,
     "kinds": {
       "body": {
         "rig": "rig", "model": "model", "glb": "glb", "fade": 0.2,
         "reads": { "pos": "pos", "yaw": "yaw", "vel": "vel", "grounded": "grounded", "limp": "limp" }
       }
     }
   }
   ```

   (the numbers of anim's own test). `rig` is a loader `json` entry (the rig file), `model` a loader
   `model` entry, and `glb` a preloaded loader `binary` entry of the model's same file, which the
   server poses the body by (a kind no rule poses may leave it out). `still`, `leap` and `landFall` are m/s, `moves` metres, `turns` degrees,
   `shift` a share of a gear's speed, `fade` seconds. A kind may add `reads.aim` (a field, or a dotted
   path such as `"look.pitch"`), `aim: { bones: { <bone suffix>: <share> } }` and
   `props: [{ model, bone, at, turn }]`. A row draws as the kind its `as` field names when it names
   one, so a `player` row can draw as another kind's body.
3. Write the rig file: `clips` (name to FBX, or `{ file, loop, gear, markers, scale, rate, stance,
   mirror, rebase }`), `roles`, `stances`, `mask`, `meshes`, `show`, `blades` (the roles of `meshes`
   that are rigid weapons the body holds, a sword), and the measured `table`, `ends` and `grips`. The
   header of `anim.sim.ts` describes every key.
4. Bake it: `anim.export.py` runs in Blender, bakes every clip onto each body the rig names, packs
   each body's glb with gltfpack, and measures the `table` (each clip's length, travel, turn, hips
   height, the second of its peak), the `ends` (where each limb segment is on every frame, and each
   blade from its guard to its tip) and the `grips` (each blade's guard and tip in the frame of the
   glb's joint that carries it). A blade's mesh must be weighted to one bone; its tip is found as its
   furthest point from that bone and its guard as the crossguard. The skill's `merge-table.mjs` writes
   the table, `ends` and `grips` into the rig file:

   ```
   Blender -b --factory-startup --python plugins/anim/anim.export.py -- \
       <rig.json> <table.json> <body>=<out.glb> [<body>=<out.glb> ...]
   ```

   Bodies are read from the library (`PATCHWORK_LIBRARY`, else `~/patchwork-library`), clips from
   `~/troupe-collection`. Specular/gloss materials (Adobe Fuse, Mixamo) are turned into metal/rough
   so skin and cloth do not come out as polished metal.
5. In the kind's `<kind>.sim.ts`, call `animate(me, w, dt)` every step and apply the travel it
   returns; call `play`, `gesture`, `stop` from acts.
6. On the page, `plugins.anim.model(id)`, `socket(id, suffix)` (an object by the end of its name,
   say a muzzle) and `props(id)` reach the drawn body once anim's `tick` has run.
   `pose(id, clip, t)` draws a row in one clip at one time and hands back the model.

## Plugins it works with

- **loader**: reads the rig file (`json`) and the models (`model`).
- **render3d**: anim draws into its scene and dresses every material through `render3d.dress`.
- **ragdoll3d**: the mod `anim.ragdoll3d.ts` (`world.ragdoll3d.mods: { model: 'anim', pose: 'anim' }`)
  lays limp bodies on the models anim draws. ragdoll3d comes after anim in `plugins`.
- **ik3d**: the mod `anim.ik3d.ts` (`world.ik3d.mods: { body: 'anim' }`) bends the limbs of anim's
  bodies (hands on a wheel, feet on pedals).
- **interact**: the mod `anim.interact.ts` (`world.interact.mods: { body: 'anim' }`) hands interact the
  body of a row in an interaction (sitting in a seat, holding a handle).
- **dismember3d** and **ragdoll3d** read `ends(w, me, segment)`, a limb segment's two ends at the
  row's playhead, off the rig's measured `ends`.
- **melee3d** reads `posed` and the rig's `grips`: where each sword and each limb stands on a step,
  so a swing hits where the drawn blade passes.
- Whatever moves the body (walker, or the kind's own rule) writes the position, facing, velocity
  and `grounded` fields anim reads.
- **math**: the server half's vector maths; `posed` uses three's math classes (`Quaternion`,
  `Matrix4`, `Vector3`), which turn angles with math's code, and three's meshopt decoder to read the
  packed glb.

## Keywords

animation, skeletal animation, skinning, rig, Mixamo, mixamorig, Adobe Fuse, FBX, glb, glTF,
AnimationMixer, clip, crossfade, blend, locomotion, gears, walk, run, strafe, idle, jump, fall, land,
one-shot, root motion, travel, upper body layer, mask, gesture, markers, footsteps, events, aim
offset, pitch, props, attach to bone, socket, muzzle, stance, mirrored clips, Blender bake,
gltfpack, server-side pose, forward kinematics, bone matrices, blade, sword, weapon, `animate`,
`play`, `gesture`, `stop`, `rest`, `committed`, `posed`, `ends`, `world.anim`
