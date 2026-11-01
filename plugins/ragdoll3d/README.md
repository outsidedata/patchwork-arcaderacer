# ragdoll3d

Ragdolls for Mixamo bodies, the same on every seat: a body that dies goes limp from the pose it died
in, is thrown by the blow that killed it, falls under its own gravity, lands on the ground and
against trees, and settles. Two modes: a page-side verlet body of 15 points with sticks and joint
limits stepped on the game's clock, or a server-side box3d ragdoll of capsule bones and ball joints.
A shot can also meet a standing body's bones as capsules.

## Why use it

Use ragdoll3d when characters die, get knocked down or are run over: an enemy that crumples where it
was shot, a body flung by an explosion, a pedestrian hit by a car, a player who falls and gets up
again. The same three rule calls work in either mode, and a seat that arrives late sees the same
body lying in the same place.

## How it works

**Server half (`ragdoll3d.sim.ts`).**

- `die(w, me, blow, hits?)` on the step a body dies. `blow` is `{ dir: [x, z], speed, height }`. It
  writes `limp: true`, `limpFor: 0`, `blow`, and `pose` (the clip and playhead it died in). A body
  already limp is left as it lies. In physics mode it also falls on the server: one `bone` row per bone
  (a capsule from end to end as the body stood, off anim's measured `ends`) and one `bonejoint` row per
  joint (a ball joint limited to `limit.swing` and `limit.roll` degrees), pushed by `hits` or by the
  blow on the bone nearest its height.
- `lie(me)` each step a body lies: `limpFor` one more.
- `rise(w, me)` when it stands again or before its row ends: the bone and joint rows end and the
  dying fields go back to a standing row's.
- `capsules(w, me)`: a standing body's bones as capsules, for a shot to hit before it falls.
- `PHYSICS`: a Mixamo body's bones (radius, model bone), joints, limits and box3d settings.

**Browser half (`ragdoll3d.plugin.ts`), verlet mode.** No row and no prefab; its numbers are
`world.ragdoll3d`. A body's 15 points are joints of the model's skeleton (hips, spine, head, arms,
forearms, hands, up-legs, legs, feet), found by bone suffix on the copy anim's clips drive. Built from
the `pose` it died in, the struck point given the blow's speed and the rest `spread` of it. Each sim
step (never per frame): points move by damped velocity capped at `vmax` and fall at the kind's
gravity; then `iter` passes, each lifting points onto the ground's plane and out of solids and running
`sweeps` rounds of sticks (14 bones and braces so the torso stays a slab), angle limits (`elbow`,
`knee`, `spine`, `hip`, `shoulder`) and the ground; touching points take `friction`. A body is owed
min(limpFor, settle/dt) steps, so a late seat catches up, and sleeps when still for `calm` steps or at
`settle`. The bones are written back from the points, parent before child, keeping each bone's twist
from the death pose.

**Physics mode** (`world.ragdoll3d.physics: true`): the server makes the box3d ragdoll, and the page
turns each model bone to follow its body.

`body(id)` is `{ points, steps, asleep }` for a row lying limp.

## Using it

1. List it after `anim` in `plugins`. Give `world.ragdoll3d`: `kinds` (the kinds whose limp rows it
   ragdolls; a limp row of any other kind is left alone, and a scene with no `kinds` throws), `bones`
   (role to bone suffix for the 15 roles), `damp`, `iter`, `sweeps`, `radius`, `vmax`, `friction`, `spread`, `limits`, `still`,
   `calm`, `settle`, `physics?`, and `mods: { model: 'anim', pose: 'anim', land, solids, gravity,
   bodies? }`.
2. Name the body kind in `world.ragdoll3d.kinds`. Give it `limp: false`, `limpFor: 0`, `blow: null`, `pose: null` in its prefab and point
   anim's `reads.limp` at `limp`.
3. In the kind's rule: `die(w, me, { dir, speed, height })` from its `hit` act when its health runs
   out; `lie(me)` each step while limp; `rise(w, me)` on respawn (and anim's `rest(me)`).
4. In physics mode, list `bone` and `bonejoint` in the sim with prefabs, and name
   `world.box3d.mods: { kinds: 'ragdoll3d' }`.

## Plugins it works with

- **anim**: the mod `anim.ragdoll3d.ts` (`mods: { model: 'anim', pose: 'anim' }`) hands the model and
  draws the death pose; anim stops drawing a limp row; anim's `ends` measure every bone.
- **terrain3d**: the mod `terrain3d.ragdoll3d.ts` (`mods: { land: 'terrain3d' }`) is the ground.
- **scatter3d**: the mod `scatter3d.ragdoll3d.ts` (`mods: { solids: 'scatter3d' }`) pushes bodies out
  of trunks.
- **walker**: the mod `walker.ragdoll3d.ts` (`mods: { gravity: 'walker' }`) is the gravity each kind
  walked under.
- **hitscan3d**: ragdoll3d's mod `ragdoll3d.hitscan3d.ts` (`world.hitscan3d.mods: { bodies:
  'ragdoll3d' }`) hands a standing body's bone capsules as hit locations, beside the `bodies` mod
  ragdoll3d is itself handed (walker's).
- **box3d**: the physics mode's bones and joints, through `ragdoll3d.box3d.ts`.
- **dismember3d** and **box3dvehicle**: a car's crush and a lost head call `die`.
- **math**: deterministic maths.

## Keywords

ragdoll, ragdoll physics, death, die, knockdown, fall, limp, corpse, verlet, position based dynamics,
PBD, constraints, sticks, joint limits, ball joint, capsules, Mixamo, skeleton, bones, blow, impulse,
thrown, landing, settle, sleep, get up, respawn, rise, physics ragdoll, box3d ragdoll, hit locations,
deterministic, late join, `die`, `lie`, `rise`, `capsules`, `PHYSICS`, `world.ragdoll3d`
