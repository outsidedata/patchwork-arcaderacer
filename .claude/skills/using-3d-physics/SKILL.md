---
name: using-3d-physics
description: Use in core, or any clone of it, whenever a 3D thing moves, stands, falls, collides, is shot, drives, flies, goes limp or is stood in the way of — box3d bodies, box3dvehicle cars, walker bodies, hitscan3d shots, volley3d rounds, ragdoll3d, flight3d, interact, cover3d — and whenever something clips through a floor, falls through the ground, walks through a wall, is not hit by a shot, or a structure, prop or building has to be solid or stood on. Also on "physics", "collision", "collider", "rigid body", "kinematic", "ground", "floor", "heightfield", "static", "solids", "bodies", "mods.ground", "mods.height", "mods.solids", "mods.props".
---

# 3D physics in core

There is no single physics engine in core. Five plugins move or test things in 3D, each with its own
model, and each is handed the world it moves in — the ground, what stands in the way, what can be hit —
through **mods** (`world.<p>.mods`, the Mods header of `addons/scenemanager/scenemanager.addon.ts`). No
plugin knows another's shapes. A floor, a wall or a tree is solid to a plugin only if some mod hands it
to that plugin. **Solid to one plugin is not solid to another.**

The facts are the headers of the files named here and the tests beside them. Where they disagree with
this file, the code is right and this file is fixed. Load `prime-directive` first; a new piece of any of
these plugins is asked for in planning (`building-a-plugin`).

## Which model moves the thing

| Plugin | Model | Runs | State | Use for |
|---|---|---|---|---|
| `box3d` (`plugins/box3d/box3d.sim.ts`) | Box3D rigid bodies (Erin Catto's, `box3d.js` wasm), real contacts, joints | server half; the page's copy steps it too when predicting | rows + Box3D's own memory per truth | crates, debris, anything that tumbles, cars' parts |
| `box3dvehicle` (`plugins/box3dvehicle/`) | a car of real box3d rows: chassis, sphere wheels, wheel joints | server | its row + the part rows | cars, trucks, jeeps |
| `walker` (`plugins/walker/walker.sim.ts`) | kinematic: a footprint stood on a height function, circles pushed out of circles | server | the walking row | people, mechs, monsters, anything that walks |
| `flight3d` (`plugins/flight3d/flight3d.sim.ts`) | stability-derivative airframe, stalling lift polar, gear springs | server | the plane row | planes |
| `ragdoll3d` (`plugins/ragdoll3d/ragdoll3d.plugin.ts`) | verlet points, sticks, joint limits | **page only**, stepped once per sim step | none sent | a body gone limp |

And three that test lines and places, moving nothing:

| Plugin | What it answers |
|---|---|
| `hitscan3d` (`plugins/hitscan3d/hitscan3d.sim.ts`) | where a shot along a line meets the ground, a solid cylinder or a body; lag-compensated |
| `volley3d` (`plugins/volley3d/volley3d.sim.ts`) | rounds in flight (closed-form arcs, guided turns) that ask a `shoot` mod each step |
| `cover3d` (`plugins/cover3d/cover3d.sim.ts`) | spots behind solids out of a threat's sight |

`solids` (`plugins/solids/solids.plugin.ts`) only **draws** still models; it gives no collision to
anything. Do not confuse it with the mod name `solids` that walker, hitscan3d, ragdoll3d and cover3d ask
for, which is circles or cylinders some provider hands out.

## How the world reaches each plugin: the mods

`mod(world, p, name)` hands back **one** provider's function, and throws
`<p>'s <name> names a, b, and <p> takes it from one plugin: name one` on a list of more than one.
`modsOf` hands back a list, one per plugin named. Which one each key uses decides whether several
plugins can contribute to it.

| Plugin | Key | One or many | Shape | With none named |
|---|---|---|---|---|
| walker | `height` | one (`mod`) | `(w, x, z) => y` | `groundOf` throws `…names no world.walker.mods.height` |
| walker | `depth` | one | `(w, x, z) => metres of water` | no water; the wade limit is skipped |
| walker | `solids` | one | `(w, x, z, r) => {x, z, radius}[]` | `[]` |
| walker | `cell` | one | `(w) => metres` | the ground is asked at every point |
| box3d | `ground` | one | `(w, [i, j]) => Static` | fine until the row lists a chunk, then throws |
| box3d | `props` | **many** (`modsOf`) | `(w, [i, j]) => Static \| undefined` | nothing added |
| box3d | `kinds` | one | `(w) => { bodies?, joints? }` | only `world.box3d.kinds` / `joints` |
| box3dvehicle | `gravity` | one | `(w) => Vec3` | the car throws on its first step |
| box3dvehicle | `grip`, `drag` | one | `(w, x, z) => number` | wheel friction everywhere; no drag |
| box3dvehicle | `land` (page) | one | `(plugins) => {height, spray?, mark?}` | no dust, no tracks |
| box3dvehicle | `bodies`, `strike` | one | hitscan3d's bodies; `(w, row, struck)`, a `Struck` with `what: 'car'` and `speed` | no car hits anything |
| box3dvehicle | `sound` (page) | one | `(plugins) => { decode, hold }` or undefined with no Web Audio (audio's, `audio.box3dvehicle.ts`) | a car with `look.sound` throws |
| hitscan3d | `ground` | one | `(w, from, dir, far) => {t, normal} \| undefined` | the ground stops nothing |
| hitscan3d | `solids` | one | `(w, from, dir, far) => {x, z, radius, base, tall?}[]` | nothing |
| hitscan3d | `bodies` | one | `(w) => {id, kind, pos, shapes}[]`, each shape `{part, cylinder}` or `{part, capsule}` | nothing |
| volley3d | `shoot`, `bodies` | one | hitscan3d's shot; splash's bodies | rounds hit nothing |
| flight3d | `ground` | one | `(w, x, z) => y` | never touches down, never crashes |
| ragdoll3d | `model`, `pose` (`ahead`), `gravity` | one | anim's model and pose; walker's gravity | throws |
| ragdoll3d | `land`, `solids` | one | page ground; `(plugins, x, z, r) => circles` | no ground, no solids |
| cover3d | `solids` | one | `(w, x, z, r) => {x, z, radius, tall?}[]` | throws |

The providers core ships:

| File | Gives |
|---|---|
| `plugins/terrain3d/terrain3d.walker.ts` | `height` = `rawAt` (the bed, so bodies wade), `depth` = `depthAt`, `cell` = the finest ring's cell |
| `plugins/terrain3d/terrain3d.box3d.ts` | `ground`: chunk [i, j] as a height field of `world.box3d.chunk.count`² `heightAt`s, `cell` apart |
| `plugins/terrain3d/terrain3d.hitscan3d.ts` | `ground` from terrain3d's `ray` |
| `plugins/terrain3d/terrain3d.flight3d.ts` | `ground` = `heightAt` (the water's surface where it floods) |
| `plugins/terrain3d/terrain3d.box3dvehicle.ts` | `land`, `grip` and `drag` off the painted surface |
| `plugins/terrain3d/terrain3d.ragdoll3d.ts`, `terrain3d.solids.ts` | `land` = the page's ground |
| `plugins/scatter3d/scatter3d.walker.ts` | `solids`: trunks and boulders as circles |
| `plugins/scatter3d/scatter3d.hitscan3d.ts` | `solids`: the same as cylinders with `base`, `tall` |
| `plugins/scatter3d/scatter3d.box3d.ts` | `props`: a capsule (or a sunk sphere) per solid in the chunk; throws on a solid with no `tall` |
| `plugins/scatter3d/scatter3d.ragdoll3d.ts`, `scatter3d.cover3d.ts` | `solids` for those two |
| `plugins/walker/walker.hitscan3d.ts` | `bodies`: every row of `world.walker.kinds` as one upright cylinder |
| `plugins/ragdoll3d/ragdoll3d.hitscan3d.ts` | `bodies`: every standing anim body whose rig carries `ends` as its bone capsules, the rest from `world.ragdoll3d.mods.bodies` |
| `plugins/dismember3d/dismember3d.hitscan3d.ts` | `bodies`: every body of `world.dismember3d.kinds` as its joint spheres, which its `hit` cuts off, the rest from `world.dismember3d.mods.bodies` |
| `plugins/dismember3d/dismember3d.box3dvehicle.ts` | `strike`: a car crushes a body of `world.dismember3d.kinds` (the arm and thigh on the side it met) and lays it down with ragdoll3d's `die`; every other row is struck as hitscan3d strikes it |
| `plugins/walker/walker.ragdoll3d.ts` | `gravity` of a walker kind |
| `plugins/box3d/box3d.box3dvehicle.ts` | `gravity`: the row's, else `world.box3d.gravity`, else Box3D's default |
| `plugins/audio/audio.box3dvehicle.ts` | `sound`: an engine's loops decoded and held going through audio (the `sound` skill) |
| `plugins/box3dvehicle/box3dvehicle.box3d.ts` | `kinds`: the chassis, wheel and joint bodies |
| `plugins/hitscan3d/hitscan3d.volley3d.ts` | `shoot` (with no rewind) and `bodies` |
| `plugins/anim/anim.ragdoll3d.ts` | `model`, `pose` |

### One slot, several sources: chain

A key read with `mod` takes one plugin. When a game has more than one thing to hand in, a game plugin
takes the slot and hands back its own things **plus** whatever its own mod names — the chain. A game's
plugin `a` provides `solids` to walker in `games/<game>/plugins/<a>/<a>.walker.ts`, returns its own
circles, and asks `mod(w.world, '<a>', 'solids')` for scatter3d's, which the scene names in
`world.<a>.mods.solids: 'scatter3d'`. The same works for `height`: a game plugin that gives `height`
answers its own floors where they stand and hands every other point to the `height` its own mod names
(terrain3d's `rawAt`). Find the provider once per `world` (a `WeakMap` on `w.world`), as the mod is
asked many times a step.

The scene then names the game plugin in the consumer's slot and the old provider in the game plugin's
own: `world.walker.mods.height: '<a>'` with `world.<a>.mods.height: 'terrain3d'`;
`world.hitscan3d.mods.ground: '<a>'` with `world.<a>.mods.ground: 'terrain3d'`. `<a>` is listed in
`world.shipped.plugins` so the scenemanager looks for its mods in the game's folder.

What a chained walker `height` meets, by walker's own rules:
- `height(x, z)` is one y a point. A deck over walkable ground, or two storeys, cannot be said: below a
  floor a body would stand on it. A second level needs walker to take a height that knows the body's
  own y, a change to walker in its home, asked for first.
- A floor whose top stands more than the kind's `step` above the ground beside it is a ledge: the step
  rule refuses the move onto it. A doorway is a ramp (heights rising less than `step` a footprint), or
  the floor's top within `step` of the land at its edge.
- With `cell` named, walker reads `height` only at the lattice corners and lays the two triangles of
  each cell between them, so a floor's edge between corners is drawn into a slope a cell wide. A floor
  whose edges must be sharp either stands on the lattice's lines or the scene names no `cell` there,
  and then terrain3d's own ground is read at every point too, not as it is drawn.

## box3d

**One world per truth.** `export const b3 = await Box3D()` loads the wasm once per process. Each
`box3d` row has its world in a `WeakMap` keyed by the row, freed by a `FinalizationRegistry`. The world
is made on the row's first tick from `world.box3d`; a kind's entry is read when its body is made.
Editing `world.box3d.static` after does not rebuild it.

**`world.box3d`**: `subStepCount`, `static` and `kinds` required; `joints`; the b3WorldDef fields
(`gravity`, `restitutionThreshold`, `hitEventThreshold`, `contactHertz`, `contactDampingRatio`,
`contactSpeed`, `maximumLinearSpeed`, `enableSleep`, `enableContinuous`); `capacity`;
`enableWarmStarting`, `enableSpeculative`, `contactRecycleDistance`; `chunk: {count, cell}`; `mods`.
Anything left out is Box3D's own `b3Default…Def` value, never a number in the plugin.

**A Body** (`world.box3d.kinds.<kind>`): `shapes`, and `type` (`dynamic`, `kinematic`, `static`),
damping, `gravityScale`, sleep, `motionLocks`, `isBullet`, `mass`. **A shape**: `box [hx, hy, hz]`,
`sphere`, `capsule`, `hull {points}` (≤ 128 vertices), `cylinder`, `cone`, `rock`, `mesh` (inline,
`{asset}` a loader `json` entry of `positions` and `indices`, or a `make`), `heightField`, `compound`
(static only); with `density`, `baseMaterial {friction, restitution, rollingResistance, …}`, `filter`,
`isSensor`, the event switches, and `oneWay` (a one-way platform).

**Rows.** box3d writes back `pos`, `rot` (quaternion x y z w), `vel`, `spin`, `awake`, and when the
shapes ask for them `touching`, `hits` and `visitors`. A rule writes `pos`/`rot`/`vel`/`spin` (pushed
when they differ from what box3d wrote), `force` and `torque` (held), `pushes` (one step's impulses,
deleted after), `target {pos, rot}` (kinematic), `wind`, `friction`, and the live body settings. The
`box3d` row takes the live world fields, `ground: [[i, j], …]` and the `explode` act. Joint rows: `a`,
`b`, live fields in; `measured`, `strained` out.

**Fixed things.** Four ways something that never moves is solid to box3d:
1. `world.box3d.static`: `{pos, rot, shapes}` placed once when the world is made. Queries name static
   i as `-(i + 1)`.
2. Ground chunks: a rule writes the list `ground: [[i, j], …]` on the `box3d` row each step — box3d never
   chooses them. A new key is built from the `ground` mod and then every `props` mod; a dropped key is
   freed. Chunks and their props are named `0` in queries.
3. A `props` mod of a game's own plugin, `games/<game>/plugins/<a>/<a>.box3d.ts` returning a Static for
   what of it stands in chunk [i, j]; named in `world.box3d.mods.props` beside scatter3d. Needs a
   `ground` mod and `chunk` too.
4. A row of a kind whose Body is `type: 'static'`: answered by its row id.

**Queries** (answered in row ids, sorted, so their order is the same on every run): `castRayClosest`,
`castRay`, `castShape`, `overlapShape`, `overlapAABB`, `castMover`, `collideMover`, `solvePlanes`,
`clipVector`, `contacts`, `massOf`, `pointVelocity`, `boundsOf`, `counters`, `staticAt`, `outline`.
Each throws `box3d has not stepped yet, so there is no world to ask` before the first step.

**Prediction and rewind.** Box3D's warm starting, contacts and sleep timers are not on rows. `hold(me)`
saves Box3D's own snapshot bytes with the tables, and `take` moves the world to the new row, so
`addons/rewind` and `addons/predict` carry it; `box3d.sim.test.ts` shows a page that loads the image
steps bit for bit with the server, and drifts without it.

**Browser half**: `follow(id, object)` and `drop(id)`; each `afterTick` sets every followed object
from its row's `pos` and normalised `rot`. It draws nothing; the kind's look builds the mesh.

## box3dvehicle

A car is real box3d rows: one chassis (a box, plus a `cabin` hull), one sphere wheel per corner, one
Box3D wheel joint each. Box3D's wheel-joint spring is re-set every step in `before` so it pushes like
the corner's spring, bump stop and anti-roll bar. The scene names `box3dvehicle` in
`world.box3d.mods.kinds` and `box3d` in `world.box3dvehicle.mods.gravity` (or the car throws).

`world.box3dvehicle`: `chassis`, `wheel`, `joint` (the part kinds), `vehicles.<name>` (`body`, `bodies`,
`axles[]` with `wheel`, `spring {stiffness, length, travel, sag}`, `damper {bump, rebound}`,
`bumpStop`, `antiRoll`, `driven`, `steered`; `engine` direct, petrol or electric; `steering`;
`pedal`; `look`), `mods`. Acts (not open; a seat reaches the car through its `player` row's `relay`):
`pedal`, `throttle`, `steer`, `brake`, `shift`. Out: `compression`, `load`, `grounded`, and `rpm` and
`torque` for petrol and electric. `vehicle(w, name, pos, rot)` spawns one whole; `scrap(w, car)` ends
it. Listed after box3d and before render3d, after the `land` mod's plugin, before particle3d when it
has dust or exhaust.

## walker

A kinematic body on any ground. A rule builds the ground with `groundOf(w)` from `world.walker.mods`
(or hands a `Ground` it built: `{ height, depth?, solids, cell? }`) and calls `walk`, `slide`, `carry`
or `seek` on its own row.

- **Standing.** The feet are the four corners of a `span` square plus its centre. S is the mean height
  of the feet within `step` of the highest. A body stands on S, follows rises and drops of up to `step`
  on the ground, and falls by `gravity` otherwise.
- **Limits** in `slide`, in order: wade (water deeper than `wade`), step (a foot's ground rising more
  than `step`), slope (steeper than `maxSlope`, with `slopeBand` hysteresis and a look ahead of
  `probe`). A refused move slides along the refusal.
- **Solids are 2D circles** `{x, z, radius}` with no height: they push a body out sideways. **They never
  hold one up.** A body stands only on `height`. A wall made of solids stops a body; a floor needs
  `height`.
- **`bodies`** in a kind's numbers names the kinds (or `player`) whose rows are solid circles to it.
- **`cell`**: on a ground with one, height is read at the lattice corners and split into the two
  triangles terrain3d draws, so a body stands on the ground that is drawn. A body standing wrong is fixed
  by drawing the ground finer, never in walker.
- `world.walker.kinds.<kind>`: `radius`, `height`, `accel` (a rate a second), `airAccel?` (the same
  rate in the air, `accel` when absent; 0 keeps a leap's or a fling's horizontal speed until it lands), `turnRate`, `turnMax?`,
  `gravity`, `jumpH`, `step`, `maxSlope`, `slopeBand`, `slide`, `wade`, `span`, `probe`, `seekSpeed`,
  `bodies?`. `check` throws naming a number that is missing or out of range, and
  `maxSlope·span·√2 … not under step`. The table is checked the first time each object is read.
- Row: `pos`, `yaw`, `vel`, `grounded`, `sliding`, `speed`, `side`, `turned`; the rule sets `want`,
  `face`, `jump`. `as` reads another kind's numbers.

## hitscan3d and volley3d

A shot is a line tested against the `ground` mod, then the `solids` mod's upright cylinders
`{x, z, radius, base, tall?}` (endless with no `tall`), then every shape of the `bodies` mod's bodies
(upright cylinders and capsules, each named by its `part`), the nearest kept:
`shoot(w, from, dir, far, {skip, seen, bodies, grow, hurt})` hands back
`{t, point, normal, what: 'ground' | 'solid' | 'body', id?, kind?, part?}`, `part` the shape met.
`world.hitscan3d.kinds.<kind>` is `{off?, tall?}`: the kinds that can be hit, a field that turns a body
off, and a field that sets its cylinders' height (a crouch). A shot given a `hurt` (`{damage, by, …}`,
`damage` a number or by part) hurts the body it meets: hitscan3d calls its row's one `hit` act with a
`Struck` (`{...hurt, damage, part, point, dir, what}`); `strike(w, row, struck)` is that call for a
rule's own burst. A `Struck`'s `what` says what hurt it: `'body'` a shot, `'splash'` a round's
splash, `'blast'` a rule's burst, `'car'` a car's chassis (with its `speed`). The plugin that hurts
names its own `what`, and whatever handles the hit tells one from another by it, or the scene names a
different `strike` for the hurting plugin (box3dvehicle's `strike: 'dismember3d'` crushes where a
round cuts). Every kind that can be hurt has the one `hit(struck)` act. `sees(w, from, to)`: only
the ground and solids block. An optional `hitscan3d` row keeps the bodies' shapes for `rewind` steps
(held off the wire, carried by `addons/rewind`), so a shot `seen` at an older step meets them where
the shooter saw them.

volley3d rounds fly a closed-form arc (`g` per pattern) or turn toward a target by `seek`, and each step
hand their segment to the `shoot` mod with `grow: radius` and the round's `hurt` (given to `fire`), so
the body met is hurt; `splash` asks `bodies` and calls `hit` on each body near with the damage scaled by
its distance, `what: 'splash'`. With hitscan3d as the mod, a round meets what a shot meets.

## flight3d, ragdoll3d, interact, cover3d

- **flight3d**: the airframe is priced from `world.flight3d.materials`; the gear are spring-dampers
  that only push. It crashes on a hard touchdown, a wheel pressed past its radius, a `touch` point under
  the ground or a swept path into it (`sweep` metres apart), all against the `ground` mod.
- **ragdoll3d**: the page steps it once per sim step, the same on every seat. A rule writes `limp`,
  `limpFor`, `blow`, `pose` on the dying row and leaves `pos` and `yaw` alone.
- **interact**: a body plays a list of anim steps stood on a machine's named points (`point` and
  `object` mods, box3dvehicle's for a car). `begin`, `advance`, `end`, `startOf`, `travelOf`; it writes
  the body row's pos, yaw, vel 0 and grounded through anim's `readsOf`. What the machine does meanwhile
  is the game's.
- **cover3d**: `spots(w, at, threat, {reach, radius, low})` behind each `solids` cylinder at least
  `low` tall.

## Determinism

Every rule and every server mod computes with `plugins/math` (`math.sin`, `math.pow`, `math.hypot`, …)
and never with `Math`'s transcendental functions: node and Chrome differ in the last bit, and a page
running ahead would drift from the server. Box3D's own stepping is the wasm's, the same bytes on both.
Rows are all the state a seat is sent; two runs of the same presses land on the same bytes
(`box3d.sim.test.ts`). A mod's answer must be a pure function of `w` — never of a module variable a
second truth would share.

## Making something solid: the checklist

For each thing that must stop, carry or be hit, ask each plugin that meets it, one by one:

| It must… | The plugin | Through |
|---|---|---|
| hold a walker body up (a floor, a deck, a ramp) | walker | `height` (chained with terrain3d's) |
| stop a walker body sideways (a wall, a pillar) | walker | `solids` circles |
| stop a shot or a round | hitscan3d (and volley3d through it) | `solids` cylinders with `base` and `tall`; a floor or roof a shot can meet needs the `ground`-style answer `{t, normal}` for its surface |
| be hit and hurt | hitscan3d | `bodies`, and a `hit(struck)` act on its kind |
| carry or stop a box3d body or a car | box3d | `static`, `props`, or a static row |
| be landed on by a plane | flight3d | `ground` |
| catch a limp body | ragdoll3d | `land`, `solids` |
| hide a bot | cover3d | `solids` |

The numbers of the shape (a floor's rectangle and top, a wall's circles) are the definition of the kind
whose row stands there, in its own frame, placed by the row's `pos` and `yaw`; the provider reads them
with `def(w, row.kind)`. The floor's top comes from the model's floor, measured, so a body stands on the
floor that is drawn.

## Common mistakes

| Mistake | Fix |
|---|---|
| A building's walls given to walker as `solids`, and bodies sink through its floor | Solids never hold a body up. Give walker a `height` that answers the floor, chained with terrain3d's |
| Two plugins named for walker's `height` or `solids` | `mod` throws: one provider. Chain through a game plugin |
| A box3d static added and a walker body still falls through it | box3d's statics are box3d's alone. walker reads only its own mods |
| A structure solid to walker but shots pass through | hitscan3d needs its own `solids` (cylinders with `base`, `tall`) or `ground` |
| Ground chunks expected to appear on their own | A rule writes `ground: [[i, j], …]` on the `box3d` row each step |
| A `props` mod with no `ground` mod or no `world.box3d.chunk` | props are built only with chunks; box3d throws when chunks are listed with no ground |
| `Math.sin` in a rule or a server mod | `math.sin`: the page's copy drifts otherwise |
| A mod's provider found on every call | Find it once per `w.world` in a `WeakMap` |
| walker's `accel` written as m/s² | It is a rate a second |
| A car with no `gravity` mod | `world.box3dvehicle.mods.gravity: 'box3d'` |
| A plugin's top-level `solids` plugin mistaken for collision | It only draws |

## Where it is proven

Beside each file, run one at a time with `yarn vitest run <file>`: `plugins/box3d/box3d.sim.test.ts`,
`box3d.plugin.test.ts`, `plugins/terrain3d/terrain3d.box3d.test.ts`, `terrain3d.walker.test.ts`,
`plugins/scatter3d/scatter3d.box3d.test.ts`, `plugins/walker/walker.sim.test.ts`,
`plugins/box3dvehicle/box3dvehicle.sim.test.ts`, `box3dvehicle.plugin.test.ts`,
`plugins/hitscan3d/hitscan3d.sim.test.ts`, `plugins/volley3d/volley3d.sim.test.ts`,
`plugins/flight3d/flight3d.sim.test.ts`, `plugins/interact/interact.sim.test.ts`,
`addons/rewind/rewind.addon.test.ts`. A new mod gets `<a>.<p>.test.ts` beside it, booting a scene that
names it through `load` (`building-a-plugin`); a game's own provider is proven through the rule that
walks, drives or shoots on the booted game.

Related: `using-terrain3d` (the ground every one of these stands on), `building-a-plugin` (writing a
mod), `tuning-feel` (the numbers), `designing-a-seat` (a seat that drives or gets in), `going-multiplayer`
(prediction and rewind).
