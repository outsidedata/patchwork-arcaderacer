# walker

A kinematic character controller for 3D: a body that walks, turns, jumps, falls, lands, wades, steps
up kerbs, slides down slopes too steep to climb, walks round trees and other bodies, is carried by
animation travel, and seeks a point round obstacles, on any ground it is handed, the same on the
server and a predicting page.

## Why use it

Use walker for anything that walks in 3D: the player's character, enemies, NPCs, townspeople,
animals, a mech. Every number a game tunes is in one table per kind (speed easing, turn rate, gravity,
jump height, step height, max slope, wade depth), and it stands its bodies on the ground the game
draws, so feet never float or sink.

## How it works

walker has a server half only and no row. `world.walker.kinds` is the table of kinds whose rows walk;
each entry is `radius`, `height`, `accel`, `airAccel`, `turnRate`, `turnMax`, `gravity`, `jumpH`,
`step`, `maxSlope`, `wade`, `span`, `probe`, `slopeBand`, `slide`, `seekSpeed` and `bodies` (the kinds
whose bodies are solid to it). A row walks as the kind its `as` names when it names one. `check`
throws naming a number out of range.

A walking row carries `pos`, `yaw`, `vel`, `grounded`, `sliding`, `speed`, `side`, `turned`; its rule
sets the intents `want` [x, z] (the horizontal velocity asked for), `face` (a yaw to turn to, or null)
and `jump`.

The ground is handed in: `{ height(x, z), depth?(x, z), solids(x, z, r), cell? }`. `groundOf(w)` makes
it from the scene's mods, `world.walker.mods: { height, depth?, solids?, cell? }`. With a `cell` (the
finest ring terrain3d draws) the ground is stood on as the triangles that are drawn.

- The footprint: the four corners of a `span` square and its centre; the stand height is the mean of
  the feet within `step` of the highest, so a body stands still on noise and a ledge.
- `walk(me, w, dt, ground)`: eases `vel` toward `want` (`airAccel` in the air), turns `yaw` toward
  `face` or the way it moves, jumps at √(2·gravity·jumpH), moves by `slide`, follows rises and drops on
  the ground, falls by the exact gravity sum in the air, and lands. Ground steeper than `maxSlope` is
  not ground: the body slides down it and cannot jump.
- `slide(me, w, delta, ground)`: the horizontal move within the limits: pushed out of solids (and of
  other bodies of its `bodies` kinds), refused into water deeper than `wade`, refused up a riser taller
  than `step` (sliding along the edge's tangent), refused up a slope taller than `step` within `probe`.
- `carry(me, w, delta, ground)`: an animation clip's measured travel, cut where it meets a solid, then
  stood on the ground.
- `seek(me, w, target, stop, ground)`: sets `want` toward a point at `seekSpeed`, going round the
  group of circles in the way by the shorter side, and returns whether it has arrived.
- `relative(stick, yaw)`: the camera-relative stick, forward along (sin yaw, cos yaw).
- `stand(k, ground, x, z)` and `numbers(me, w)`.

## Using it

1. Give `world.walker: { kinds: { <kind>: { … } }, mods: { height: 'terrain3d', depth: 'terrain3d',
   cell: 'terrain3d', solids: 'scatter3d' } }`.
2. In the kind's rule, each step:

   ```ts
   const ground = groundOf(w)
   me.data.want = relative(stick, look.yaw).map(v => v * speed)
   walk(me, w, dt, ground)
   ```

   and `carry(me, w, travel.move, ground)` with the travel anim's `animate` returns.

## Plugins it works with

- **terrain3d**: the mod `terrain3d.walker.ts` (`world.walker.mods: { height, depth, cell:
  'terrain3d' }`) stands bodies on the land, wading on the seabed.
- **scatter3d**: the mod `scatter3d.walker.ts` (`mods: { solids: 'scatter3d' }`) makes trunks and
  boulders solid.
- **hitscan3d**: walker's mod `walker.hitscan3d.ts` (`world.hitscan3d.mods: { bodies: 'walker' }`)
  hands each body as an upright cylinder of its `radius` and `height`.
- **ragdoll3d**: walker's mod `walker.ragdoll3d.ts` (`world.ragdoll3d.mods: { gravity: 'walker' }`)
  drops a limp body at the gravity it walked under; a `limp` body is not solid to others.
- **anim**: reads the `pos`, `yaw`, `vel` and `grounded` walker writes; its one-shot travel is what
  `carry` takes.
- **cutscene**: a cast member walks by `seek`.
- **cover3d**: the spot it finds is where `seek` walks to.
- **math**: deterministic maths, so a predicting page walks the server's body.

## Keywords

character controller, kinematic controller, movement, walk, run, turn, jump, gravity, fall, land,
slopes, max slope, slide, step height, stairs, kerb, ledge, wading, water depth, collision, obstacles,
trees, steering, seek, go to, avoid, obstacle avoidance, NPC movement, camera-relative movement,
WASD, root motion, carry, footprint, terrain following, deterministic, prediction, `walk`, `slide`,
`carry`, `seek`, `relative`, `groundOf`, `world.walker`
