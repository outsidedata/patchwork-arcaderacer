# box2d

2D rigid-body physics: Erin Catto's Box2D v3 through box2d.js, a WebAssembly build, run the same on
the server and the page. Bodies, shapes, joints, sensors, contact and hit events, one-way
platforms, explosions, wind, ray and shape casts, a character mover's plane solver, and ground built
in chunks.

## Why use it

Use box2d when a 2D game needs real physics: things that fall, stack, bounce, roll and collide; a
platformer's character and one-way platforms; ragdolls of joints; cars on wheel joints; destructible
piles blown apart; triggers that see who is inside them. Every name is Box2D's own, so Box2D's
manual reads straight onto the scene file: https://box2d.org/documentation/md_simulation.html.

box2d adds nothing to the physics (no wake-up, nudge or clamp of its own): whatever Box2D does is
what the game gets. Two runs of the same presses land on the same bytes; box2d.js's own test runs
Box2D's cross-platform determinism scene to Box2D's expected hash.

## How it works

**Server half (`box2d.sim.ts`).** The `box2d` row is the world. The first step it ticks, it makes the
Box2D world and keeps it as long as the row lives (contact impulses, sleep timers and islands are
the solver's memory, not the game's state). Every step, before the world steps:

- a body whose row ended leaves the world, a row of a kind `world.box2d.kinds` lists that has no body
  gets one, and every row's changes are pushed into Box2D;
- a joint row (a kind `world.box2d.joints` lists) is made the first step both its ends are bodies,
  and goes with either;
- the ground's chunks listed on the world row's `ground` are built through the scene's `ground` mod,
  and chunks no longer listed are dropped.

After the step every body's row gets `pos`, `rot` (`[c, s]`, Box2D's b2Rot), `vel`, `spin` and
`awake`, and every joint's row its `measured` readings (`constraintForce`, `angle`, `translation`,
`motorTorque`, …) and `strained` when its force or torque passed its threshold. A body reports
`touching`, `hits` (`{ with, point, normal, speed }`) and `visitors` (bodies in its sensor) only when
its shapes ask for those events.

A rule moves a body by writing its fields (`pos`, `rot`, `vel`, `spin`, `awake`), and drives it with
`force`, `torque` (held while the row carries them), `pushes` (one-shot impulses), `target` (a
kinematic body moved there over the next step) and `wind`. Any Body field Box2D can change on a live
body (`type`, `gravityScale`, `isBullet`, …) may be written on the row and overrides its kind's. The
act `explode(x, y, radius, falloff, impulsePerLength, maskBits?)` blows the world apart next step.

The world and box2d's tables are handed to a page that runs the scene ahead and to a server that
rewinds (`hold` and `take`, the `addons/rewind` Memory), so prediction and rewind restore the solver
exactly.

**Browser half (`box2d.plugin.ts`).** An actor calls `plugins.box2d.follow(id, object)` and, after
every frame, the object stands at the row's `pos` and turns by its `rot`. With a render2d world the
point goes through render2d's `place`; without one it is the canvas's pixels. `drop(id)` stops
following.

## Using it

1. List `box2d` in the scene's `plugins`, add one `box2d` row to `actors`, and give `world.box2d`:
   - `subStepCount` (required) and any of b2WorldDef's fields: `gravity`, `contactHertz`,
     `contactDampingRatio`, `maximumLinearSpeed`, `enableSleep`, `enableContinuous`, … A field left
     out is Box2D's own default.
   - `static`: bodies that never move and that no row carries, each `{ pos, rot, shapes }`. Static
     body i is named `-(i + 1)` in answers.
   - `kinds`: kind to Body: `type` (`dynamic`, `kinematic`, `static`), damping, `gravityScale`,
     `motionLocks`, `isBullet`, `mass`, events, and `shapes`.
   - `joints`: kind to Joint: `type` (`distance`, `filter`, `motor`, `mover`, `pogo`, `prismatic`,
     `revolute`, `weld`, `wheel`) and b2JointDef's fields. A joint row carries `a` and `b`.
   - `chunk` and `mods: { ground: '<plugin>' }` for ground built in chunks.
2. A Shape is one geometry — `circle`, `capsule`, `segment`, `box` (half extents), `polygon` (at most
   8 points, its convex hull), or `chain` (one-sided segments, or `{ asset }`, a loader `json` entry
   for a level-long ground) — with `density`, `material` (`friction`, `restitution`, …), `filter`
   (`categoryBits`, `maskBits`, `groupIndex`), `isSensor`, the event switches, and `oneWay` (a
   direction: a platform a body jumps up through and lands on).
3. Ask the world from a rule: `castRayClosest`, `castRay`, `castShape`, `overlapShape`,
   `overlapAABB`, `castMover`, `collideMover`, `contacts`, `massOf`, `pointVelocity`, `boundsOf`,
   `counters`, `stateHash`. Answers are row ids. `solvePlanes` and `clipVector` are the character
   mover's plane solver; `b2` is the Box2D module itself for standalone geometry; `bodyOf` and
   `jointOf` hand back the Box2D ids for any `b2Body_…` and `b2Joint_…` call. `staticAt(world, point)`
   says whether a point is inside a static body, and `outline` gives a static shape's points to draw.
4. On the page, `plugins.box2d.follow(row.id, sprite)` from the kind's `<kind>.client.ts`.

## Plugins it works with

- **tilemap**: the mod `tilemap.box2d.ts` (`world.box2d.mods: { ground: 'tilemap' }`) hands box2d each
  chunk of a tile map's collision shapes as a static body, one-way tiles included.
- **loader**: a `chain` given as `{ asset }` is read through the loader's `json`.
- **render2d**: the browser half places followed objects through render2d's `place` when the scene
  gives render2d a world.
- **sprite2d**: turns a sprite the way box2d turns a body, so a sprite drawn on a body lines up.
- **box3d** is the 3D counterpart: Box3D, by the same author, through box3d.js, which box2d.js is
  built like.

## Keywords

physics, 2D physics, rigid body, Box2D, box2d.js, WebAssembly, wasm, deterministic, collision,
collider, shape, circle, capsule, segment, box, polygon, chain, ground, terrain, one-way platform,
platformer, joint, revolute, prismatic, wheel joint, distance joint, weld, motor, spring, ragdoll,
sensor, trigger, contact events, hit events, explosion, impulse, force, torque, wind, kinematic,
raycast, shape cast, overlap, character controller, mover, plane solver, sleep, bullet, continuous,
filter, collision category, mask, rewind, prediction, `world.box2d`, `follow`
