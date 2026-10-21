# box3d

3D rigid-body physics: Erin Catto's Box3D through box3d.js, a WebAssembly build, run the same on the
server and the page. Bodies, shapes (boxes, spheres, capsules, hulls, cylinders, cones, rocks,
triangle meshes, height fields, compounds), joints, sensors, contact and hit events, one-way
platforms, explosions, wind, ray and shape casts, a character mover's plane solver, and ground and
props streamed in chunks.

## Why use it

Use box3d when a 3D game needs things that fall, stack, tumble, roll, collide and get knocked over:
crates, barrels, debris, balls, doors on hinges, cars (through box3dvehicle), ragdolls (ragdoll3d's
physics mode), severed limbs (dismember3d), and a world of ground and trees they hit. Every name is
Box3D's own, so Box3D's manual reads straight onto the scene file:
https://box2d.org/documentation3d/md_simulation.html.

## How it works

**Server half (`box3d.sim.ts`).** The `box3d` row is the world. The first step it ticks, it makes the
Box3D world and keeps it as long as the row lives (contact impulses, sleep timers and islands are the
solver's memory, not the game's state). Every step, before the world steps:

- a body whose row ended leaves the world and wakes what it touched; a row of a kind
  `world.box3d.kinds` lists (or a `kinds` mod makes) gets a body; every row's changes are pushed in;
- a joint row (a kind `world.box3d.joints` lists) is made the first step both ends are bodies, and
  goes with either;
- the chunks listed on the world row's `ground` are built through the `ground` mod and every `props`
  mod, and chunks no longer listed are dropped, ground and props together.

After the step every body's row gets `pos`, `rot` (a quaternion, x y z w), `vel`, `spin` and `awake`,
and every joint's row its `measured` readings (`constraintForce`, `angle`, `spinSpeed`,
`steeringAngle`, `twistAngle`, …) and `strained` when its force or torque passed its threshold. A
body reports `touching`, `hits` (`{ with, point, normal, speed }`) and `visitors` only when its
shapes ask for those events.

A rule moves a body by writing `pos`, `rot`, `vel`, `spin` or `awake`, and drives it with `force`,
`torque` (held while the row carries them), `pushes` (one-shot impulses), `target` (a kinematic body
moved there over the next step), `wind` and `friction`. Any Body field Box3D can change on a live
body overrides its kind's when written on the row. The act
`explode(x, y, z, radius, falloff, impulsePerArea, maskBits?)` blows the world apart next step.

The world and box3d's tables are handed to a page that runs the scene ahead (`addons/predict`) and to
a server that rewinds (`addons/rewind`), through `hold` and `take`, so the solver is restored
exactly.

**Browser half (`box3d.plugin.ts`).** An actor calls `plugins.box3d.follow(id, object)` and after
every frame the object takes the row's `pos` and `rot` (made a unit quaternion again, since a page
that runs ahead eases it). The object is tagged `userData.row`, which render3d uses to report what it
drew by row. `drop(id)` stops following.

## Using it

1. List `box3d` in the scene's `plugins`, add one `box3d` row to `actors`, and give `world.box3d`:
   - `subStepCount` (required) and any of b3WorldDef's fields: `gravity`, `contactHertz`,
     `contactDampingRatio`, `maximumLinearSpeed`, `enableSleep`, `enableContinuous`, … plus
     `enableWarmStarting`, `enableSpeculative`, `contactRecycleDistance`. A field left out is Box3D's
     own default.
   - `static`: bodies that never move, each `{ pos, rot, shapes }`, named `-(i + 1)` in answers.
   - `kinds`: kind to Body (`type`, damping, `gravityScale`, `motionLocks`, `isBullet`, `mass`,
     `shapes`, …).
   - `joints`: kind to Joint (`distance`, `revolute`, `prismatic`, `wheel`, `weld`, `spherical`,
     `motor`, `parallel`, `filter`). A joint row carries `a` and `b`.
   - `chunk: { count, cell }`: each ground chunk `count` heights a side, `cell` metres apart.
   - `mods: { ground: '<plugin>', props: ['<plugin>', …], kinds: ['<plugin>', …] }`.
2. A Shape is one geometry — `box` (half extents), `sphere`, `capsule`, `hull` (at most 128 vertices),
   `cylinder`, `cone`, `rock`, `mesh` (inline, `{ asset }` from the loader, or one of Box3D's makers),
   `heightField`, `compound` (static bodies only) — with `density`, `baseMaterial` (`friction`,
   `restitution`, `rollingResistance`, …), `explosionScale`, `filter`, `isSensor`, the event switches,
   and `oneWay`. A box, hull, cylinder, cone or rock may carry `pos`, `rot` and `scale` on its body.
3. Ask the world from a rule: `castRayClosest`, `castRay`, `castShape`, `overlapShape`,
   `overlapAABB`, `castMover`, `collideMover`, `contacts`, `massOf`, `pointVelocity`, `boundsOf`,
   `counters`. Answers are row ids. `solvePlanes` and `clipVector` are the character mover's plane
   solver, `b3` is the Box3D module itself, `staticAt(world, point)` says whether a point is inside a
   static body, and `outline` gives a static shape's points to draw.
4. On the page, `plugins.box3d.follow(row.id, mesh)` from the kind's `<kind>.client.ts`.

## Plugins it works with

- **terrain3d**: the mod `terrain3d.box3d.ts` (`world.box3d.mods: { ground: 'terrain3d' }`) hands each
  chunk of the land as a height field of terrain3d's `heightAt`.
- **scatter3d**: the mod `scatter3d.box3d.ts` (`mods: { props: ['scatter3d'] }`) makes trunks and
  boulders fixed capsules and balls, so the tree a car hits is the tree a seat sees.
- **box3dvehicle**: the mod `box3dvehicle.box3d.ts` (`mods: { kinds: ['box3dvehicle'] }`) makes the
  chassis, wheels and joints of each car. box3d's own mod `box3d.box3dvehicle.ts`
  (`world.box3dvehicle.mods: { gravity: 'box3d' }`) hands box3dvehicle the gravity it preloads its
  springs against.
- **ragdoll3d**: the mod `ragdoll3d.box3d.ts` (`mods: { kinds: 'ragdoll3d' }`) makes each `bone` row a
  capsule and each `bonejoint` row its joint, for ragdoll3d's physics mode.
- **dismember3d**: a severed piece is a row of a kind box3d moves, drawn through box3d's `follow`.
- **render3d**: reports what it drew by the `userData.row` box3d tags on followed objects.
- **loader**: a `mesh` or `heightField` given as `{ asset }` is read through the loader's `json`.
- **math**: vector maths.
- **box2d** is the 2D counterpart, built the same way.

## Keywords

physics, 3D physics, rigid body, Box3D, box3d.js, WebAssembly, wasm, deterministic, collision,
collider, box, sphere, capsule, convex hull, cylinder, cone, rock, triangle mesh, trimesh, height
field, heightmap, compound, ground chunks, streaming, props, joint, hinge, revolute, prismatic,
slider, wheel joint, suspension, spherical, ball joint, weld, motor, ragdoll, sensor, trigger,
contact events, hit events, explosion, impulse, force, torque, wind, friction, kinematic, raycast,
shape cast, overlap, character controller, mover, plane solver, sleep, bullet, continuous, collision
filter, prediction, rewind, `world.box3d`, `follow`
