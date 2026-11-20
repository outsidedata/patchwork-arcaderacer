---
name: using-motion3d
description: Use in core, or any clone of it, whenever a body animated by motion3d gets a new animation or a new motion - a clip added to a character's rig, a strafe, an aim, a rifle or cup carried, a jump, a hang, a seat, a climb, a vault, a walk blended into a run, strafes blended by direction, a start, a stop, a pivot - or when a body motion3d draws gets hair, a cape or capsules, or when a character's motion3d file (`<character>.motion3d.json`), its rig (`<character>.rig.json`), a clip's sidecar (`<clip>.motion3d.json` beside its FBX) or the bake (`yarn bake <game>`) comes up. Also when a clip does not play, plays the wrong way, pops or snaps as it changes, a bake stops on a clip with no sidecar, or motion3d throws about a kind's `blend`, a `gait`, a `mix`, a `warp` or `move.reverse`.
---

# Using motion3d

A new thing a body does is a new motion. Every step is a file of the game's or of the library's,
then the bake. Nothing in motion3d's code changes for a new motion.

## The steps

1. **The clip in the rig.** Each clip the motion plays is an entry in the game's
   `assets/<character>.rig.json` `clips`, its FBX in the clip collection (`PATCHWORK_CLIPS`, from the
   shell or `.env`, else `~/troupe-collection`):
   `"riflewalkleft": { "file": "packs/Rifle 8-Way Locomotion Pack 30FPS/walk left.fbx", "loop": true }`.
   A loop says `"loop": true`; a one-shot says nothing. A clip that is another mirrored is
   `{ "mirror": "<clip>" }`.

2. **Its sidecar.** Beside every FBX, `<file>.motion3d.json` in the clip collection, says which
   bones are the clip's spot and how it meets its point. Without it the bake stops, naming the clip.
   - anything on the ground (idle, walk, run, strafe, aim): `{ "spot": ["LeftFoot", "RightFoot"], "on": "both" }`
   - a hang: `{ "spot": ["LeftHand", "RightHand"], "on": "both" }`
   - a sit-down: `{ "spot": ["Hips"], "on": "end" }`
   - a wall run: `{ "spot": ["LeftFoot", "RightFoot"], "on": "face", "facing": "along" }`
   - a climb: `{ "spot": ["LeftHand", "RightHand", "LeftFoot", "RightFoot"], "on": "face", "facing": "into" }`

3. **The motion.** In `assets/<character>.motion3d.json`, under the activity it belongs to
   (`walk` for anything done while walking about), the motion and its clips:
   - `clips`: the clips it plays. A motion of several clips that each go a different way (a strafe:
     forward, left, right, back and the four between) plays the one that goes the way the body is
     moving.
   - `mix`: `"way"`, on a loop on the triangles: its clips drawn together as a blend space, the two
     whose measured travel goes either side of the way the body is walked, each by how near it is, kept
     in step by the left foot coming down. The row's `clip` is the heavier and its `mix` the other. The
     motion3d file's `down`, metres, is how far over its lowest an ankle stands while its foot is down.
   - `gait`: the motion of the same activity it pairs with by speed, each naming the other (a walk's
     `"gait": "run"`, the run's `"gait": "walk"`), both loops on the triangles. Both sets of clips are
     drawn, the other's share (the row's `gaitW`) eased toward where the body's speed stands between
     the two, so a body that has just begun to run is still drawn mostly walking. A gait that is not
     named back throws.
   - `when`: the states that must hold, `!word` for one that must not. kinematics3d's own are `ground`,
     `rest`, `rising`, `falling`, `landed` and `stopped`; motion3d's are `pushed` (the stick held),
     `moving` and `still` (faster or slower than the kind's `move.still`) and `reversed` (the stick
     pushed further than the kind's `move.reverse` degrees, 0 to 180, from the way the body faces; a
     kind that gives none throws when a motion asks it). Any other word, such as
     `fast`, is the game's own, from a `states()` mod named in `world.kinematics3d.mods.states`; a word
     nothing gives throws, naming it. A walk goes on `pushed`, a stand on
     `!pushed`: the body goes as fast as its clip carries it, so a clip that goes nowhere never makes it
     `moving`.
   - `from`: the motions it may follow, the body's or its upper half's. A strafe that plays while
     the rifle is up is `"from": ["aim"]`.
   - `stick`: the way the stick must point, `forward`, `back`, `across` or `none`.
   - `press`: the key that plays it. `then`: the motion after it plays out.
   - `over`: the bone it plays from, over the body (`"Spine"`), for an upper half: an aim, a draw.
   - `carry`: the carry that holds a prop while it plays (`carries` at the top of the file).
   - `target`: `point`, `line`, `spline`, `plane` or `triangles` (the ground, for anything done
     walking about), what it plays against.
   - `behavior`: how kinematics3d moves the body while it plays: `move` (none named) or `jump` (a
     jump, on `"press": "jump"`). A body in the air is moved by kinematics3d's fall, whatever its
     behavior; a motion that plays then says `"when": ["!ground"]`. The jump leaves the ground on its
     clip's takeoff; the rule's `jumpHeld` let go while rising keeps kinematics3d's `jump.cut` of its rise.
   - `then`: a motion of the same activity, or `"<activity>.<motion>"` for one of another (a weapon put
     away, then the next drawn).
   - `add`: laid on top of whatever plays, at its `weight`, from its `over` bone up: a flinch on `"press":
     "hit"` over a run, breathing on `"when": ["!pushed"]`.
   - `warp`: a one-shot bent from where the body is onto where it must be by `until`, a time of its
     clip (seconds, `"NN%"`, or a moment: `"strike"`, `"plant"`). On the triangles, `{ until, reach,
     turn, accel }` (metres, degrees, m/s²): an attack whose blow at `until` lands on the row's
     `target` (the rule sets it). On a space's point, `{ until }` alone: a vault or a station begun
     where the body stands, facing as it faces, and on its point by `until` with no snap. The one given
     the other's fields throws.
   - `begin`, `end`: times of a one-shot's clip it begins at and is over at (a start handed to the walk
     at its second foot down, a stop begun where it starts to stop).
   - `yields`: `true`, a one-shot with no key that is over once its `when` stops holding, as a loop is
     (a stop the stick pushes again, a start let go).
   - `steer`: `true`, a one-shot on the triangles that turns toward the way the body is walked as it
     plays (a start pushed off to the side). With none it faces as the body faced when it began, turned
     by its clip's own turn (a 180).

   An activity may give `solid` (`{ over, at, facing, points }`) instead of being offered by a station:
   the sides of plain solid boxes offer it, so running into a box vaults it or mantles onto it with no
   space placed. Its `points` stand off the side where the clips measure them (`point { out }`,
   `line { out, down }`, `plane { out }`); the scene names `faces: "shapes3d"` in `world.motion3d.mods`.

   The file's `buffer`, `{ hold, cancel }`, holds keys the rule `queue`s until a move may play them;
   `cancel[<key playing>][<key pressed>]` is when one may cut the one playing: seconds, `"NN%"`, or
   `"strike"`, where the clip's blow lands. A clip of the rig gives `markers`, each a time or a window
   `[from, to]` (`"strike-0.08"`), which `drive` writes to the row's `markers` and `windows`.

   The order matters: ground motions are looked for top to bottom, so a strafe goes above `run` and
   `walk`, and a fast one above the slow one. A pivot asks `reversed` and goes above the walk and run
   it cuts, which say `!reversed`.

4. **Bake.** `yarn bake <game>`. It measures every clip into `<character>.rig.baked.json` and
   writes every clip's offsets into `<character>.motion3d.baked.json`; the bake prints one line per
   clip. Its art goes in the game's commit (committing-a-game).

5. **Look at it.** `yarn dev`, open the game, and do it: press what plays it and move the way it
   goes.

## The kind's numbers

A motion that needs a number of the kind finds it in the scene, not the motion3d file.

- `world.motion3d.kinds.<kind>.blend`: `cross` or `inertial`, how the body goes from one clip to the
  next over its `fade`. A kind that gives neither throws. `inertial` draws the clip it goes to whole
  at once and lets each joint's offset from the pose it left decay over the fade; a change cut short
  by another goes on from the pose drawn.
- `world.motion3d.kinds.<kind>.lean`: `{ most, ease }`, radians and seconds, a body on the triangles
  leaned into its turns.
- `world.motion3d.kinds.<kind>.capsules`: `[{ from, to, radius }]` between bones, or `{ bone, at,
  radius }`, a ball a bone carries: the body as gpgpu3d holds it, so a cape drapes on it and hair lies
  on it.
- `world.kinematics3d.kinds.<kind>.move`: `{ accel, turnRate, turnMax?, still, reverse? }`.
- `world.kinematics3d.kinds.<kind>.jump`: `{ jumpH, jumpVelocityBoostMagnitude, cut? }`. The second is
  what a jump's speed across is multiplied by: 1 keeps it, 0 jumps straight up.

## Hair, fabric and what the GPU meets

Each is the other plugin's `mods` naming motion3d:

- Hair: `world.hair3d.mods: { skins: ['motion3d'], behaviors: ['render3d'] }`
  (`plugins/motion3d/motion3d.hair3d.ts`). A wearer's kind is the one its row's `as` names, else its
  own (`using-hair3d`).
- Fabric: `world.fabric3d.mods: { sources: ['motion3d'] }` (`plugins/motion3d/motion3d.fabric3d.ts`). A
  pin's `on` finds a bone, a prop or an empty in a prop, as the body stands bent, aimed and carried
  (`using-fabric3d`).
- What the GPU meets: `world.gpgpu3d.mods: { things: ['motion3d'], behaviors: ['anim'] }`
  (`plugins/motion3d/motion3d.gpgpu3d.ts`) hands the kind's `capsules`, of anim's word `capsule`. A
  capsule that names a bone the body has none of throws. Hair and fabric lie on them once hair3d and
  fabric3d each name `solids: 'gpgpu3d'` in their mods (`using-gpgpu3d`).

## Example: strafing with the rifle up

- Rig: `rifleidle` (`idle aiming.fbx`), and the eight `walk ...` and eight `run ...` clips of the
  Rifle 8-Way Locomotion pack.
- Sidecars: every one of them `{ "spot": ["LeftFoot", "RightFoot"], "on": "both" }`.
- Motion file, in `walk`:
  - `"aim": { "clips": ["rifleidle"], "over": "Spine", "carry": "rifle" }`: the upper half holds the
    rifle up.
  - `"strafefast"`: the eight run clips, `"target": "triangles", "from": ["aim"], "when": ["ground",
    "pushed", "fast"]`.
  - `"strafe"`: the eight walk clips, `"target": "triangles", "from": ["aim"], "when": ["ground",
    "pushed"]`, above `run` and `walk`.
  - `"strafestand"`: `rifleidle` on the legs too, `"target": "triangles", "from": ["aim"], "when":
    ["ground", "!pushed"]`. A
    clip played over the body from the spine up takes its spine from that clip and its hips from the
    legs' clip. The rifle pack's clips stand with the hips turned about 50° and the spine turned back,
    so the legs under a rifle-pack upper half must play rifle-pack clips too, or the upper body ends up
    turned 50° off.
- Bake.
- The aim limits are the rig's: `"aim": { "across", "up", "down" }`, radians.
- Where the rifle sits: in `demo_motion3d`'s `dev.html`, draw the rifle (G) standing still, open
  `rifle carry`, and press `fit it to the clip's hands`. It puts the rifle's grip where the clip's right
  hand is and turns it until the front grip lines up with the left hand. The readout then says how far
  the spine turns to aim straight ahead (a few degrees is the clip's own sway). Copy the anchor JSON
  into the carry's `anchor`.
