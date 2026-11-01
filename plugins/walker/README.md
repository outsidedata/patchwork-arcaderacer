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

walker has a server half only. Its row, `walker`, has no fields: at the start of every step it makes
the ground the scene keeps and files the crowd its agents walk among. `world.walker.kinds` is the table
of kinds whose rows walk; each entry is `radius`, `height`, `accel`, `airAccel`, `turnRate`, `turnMax`,
`gravity`, `jumpH`, `step`, `maxSlope`, `wade`, `span`, `probe`, `slopeBand`, `slide`, `seekSpeed`,
`bodies` (the kinds whose bodies are solid to it) and `agent`. A row walks as the kind its `as` names
when it names one. `check` throws naming a number out of range.

A kind with `agent` (metres) walks as an agent, for crowds: walker makes a map of the ground in squares
that wide, each either standable for that kind or not and at what height, worked out once by the whole
body's rules, and each step an agent eases and turns, is pushed clear of the other bodies, moves if the
square it reaches is standable and no more than `step` up, slides along one axis if not, and stands at
the map's height. A body standing on stairs or a kerb is as fine as the squares; the player keeps the
whole body.

A walking row carries `pos`, `yaw`, `vel`, `grounded`, `sliding`, `speed`, `side`, `turned`; its rule
sets the intents `want` [x, z] (the horizontal velocity asked for), `face` (a yaw to turn to, or null)
and `jump`.

The ground is handed in: `{ height(x, z), depth?(x, z), solids(x, z, r), cell?, footing?(pos, yaw) }`.
`footing`, where the ground gives one, is where a body standing at `pos` facing `yaw` is now that the
floor under it has moved (shapes3d's shapes that `move`): `walk` puts a grounded body there before it
moves it, so a body rides a moving floor. Terrain never moves and gives none. `groundOf(w)` makes
it from the scene's mods, `world.walker.mods: { height, depth?, solids?, cell?, fixed?, behaviors? }`.
With a `cell` (the finest ring terrain3d draws) the ground is stood on as the triangles that are drawn.

`groundOf(w)` makes the ground once for each truth and hands back that same ground every step, and
keeps every corner of the lattice it has asked. Solids come two ways: `fixed`, what never moves (a
level's walls, scatter3d's trunks, shapes3d's shapes), and `solids`, what moves. Both are asked by
area, `(w, x, z, r)`, every solid within r of (x, z); `fixed` may name a list of plugins. An agent's
map asks `fixed` once a tile and never again.

**Solids and their footprints.** walker never knows what a solid is: it walks round each by its
footprint, a convex outline on the ground rounded by some metres. A solid names its word by the key its
numbers sit under, `{ cylinder: { pos, radius } }`, and that word's behavior, `(shape) → { points,
round }`, makes its footprint. walker's own word is `cylinder`, a circle. A plugin that hands walker
solids of another word delivers that word's behavior through `world.walker.mods.behaviors` (shapes3d's
`box`, its four corners); a delivered word takes the place of walker's own of that word, and a later
plugin's the place of an earlier one's. A solid of a word nothing delivered throws, naming it. A solid
handed bare, `{ x, z, radius }`, as older providers hand them, is read as the cylinder it always was
(`fromBare`, the one fallback), and walked round by the same sums as before.

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
  group of footprints in the way by the shorter side, and returns whether it has arrived.
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

## Crowds: a fixed world and agents

A player gets the whole body. Enemies by the dozen or the hundred walk as agents on a world handed to
walker once. A game does four things:

1. **List walker's row.** `"walker": {}` in `prefabs`, `{ "is": "walker" }` in `actors`, and `walker`
   (from `#plugins/walker/walker.sim.ts`) in the scene's `sim`. At the start of every step it keeps the
   ground (made on the first step, so it is ready before any body walks) and files the crowd.
2. **Hand walker what never moves through `fixed`.** scatter3d already does: name it,
   `world.walker.mods.fixed: 'scatter3d'`, in place of `solids: 'scatter3d'`. A game's level plugin
   writes `<plugin>.walker.ts` exporting `fixed(w, x, z, r)`, every solid that never moves within r of
   (x, z) (walls, planters), and the scene names both, `fixed: ['scatter3d', '<plugin>']`; or the
   scene places them as shapes3d's shapes, `fixed: ['scatter3d', 'shapes3d']`. Each agent
   map tile asks it once. Anything that does move stays in `solids`, asked each step.
3. **Give the crowd's kind `agent`**, the side of its map's squares in metres (0.5 for a body 0.3 m
   across), in its `world.walker.kinds` entry. Its rule calls `walk` as before; nothing else changes,
   and anim, ragdoll3d and the rest read the same row fields.
4. **Keep its rules from reading every row.** An agent costs a few microseconds a step, so a rule that
   finds its target with `w.all(...)` for every body, every step, costs more than the walking: work the
   target out once a step on one row (horde's `wave` writes the chassis its farmers chase) and keep
   anything that never changes once per world.

What an agent does not do: jump, fall or slide (it stands on its map's height); stand on finer ground
than its squares; or notice the ground changing after its map was made (the map is kept for as long as
the ground is, so a level whose floors are built or torn down in play needs its squares made again
when they change, which walker does not do yet). `seek` and `carry` are the whole body's for every
kind.

In horde, the farmers' rules went from 0.182 ms a step for 12 to 0.048 ms, and 1000 farmers walk at
4.9 ms a step on node.

## Plugins it works with

- **terrain3d**: the mod `terrain3d.walker.ts` (`world.walker.mods: { height, depth, cell:
  'terrain3d' }`) stands bodies on the land, wading on the seabed.
- **scatter3d**: the mod `scatter3d.walker.ts` (`mods: { fixed: 'scatter3d' }`, or `solids`) makes
  trunks and boulders solid; as `fixed`, an agent's map asks for them once a tile.
- **shapes3d**: the mod `shapes3d.walker.ts` (`mods: { fixed: 'shapes3d', behaviors: 'shapes3d' }`)
  makes its cylinders and boxes solid, delivering `box`.
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
WASD, root motion, carry, footprint, terrain following, deterministic, prediction, baked ground,
fixed world, crowds, hordes, agents, navmesh, walkable grid, walls, boxes, footprints, behaviors,
`walk`, `slide`, `carry`, `seek`, `relative`, `groundOf`, `fixed`, `agent`, `world.walker`
