# kinematics3d

Where a body goes when it moves, and gravity. A body is on a target (the land, a ledge's lip, a rope,
a climbing wall, the water) and moved along the target's ways by the behavior its move names. Each
step kinematics3d asks whether anything holds the body up, and where nothing does, gravity moves it.
It never knows what a target is, and never picks what a body plays (motion3d does).

## Why use it

Use kinematics3d for anything that moves in 3D by its own rule: the player's character, an NPC, a body
held to a ledge or a rope that moves along it while its clip plays. Falling is its own: no move asks
for it, and no move can forget it.

## How it works

kinematics3d has a server half only (`kinematics3d.sim.ts`), with no row: the functions a rule calls on
its own row.

**Targets.** A target is plain data under its word, `{ <word>: <shape> }`: shapes3d's `point`, `line`,
`spline` and `plane`, terrain3d's `triangles` (the land), anything a plugin that supplies targets hands out.
Each word comes from that plugin through `world.kinematics3d.mods.behaviors: ['<a>', ...]`, each
`<a>.kinematics3d.ts` exporting `behaviors()`, `{ <word>: { step, at, nearest, ways } }`, laid over
one another in the list's order, a later one's word taking the place of an earlier one's. kinematics3d
has none of its own; a word nothing delivered throws, naming it. The place is the body's place in the
target's own space: nothing on a point, metres along a line or a spline from its start, [across, along]
metres on a plane from its middle, the body's `pos` on the triangles. A want is as many numbers as the
space has ways, metres a second.

- `step(w, target, place, want, dt, me)`: the body's step on the target (below).
- `at(w, target, place, me)`: where the place stands, the target's up there and its facing.
- `nearest(w, target, point, me)`: the place nearest a point in the world.
- `ways(w, target, place, me)`: the ways the place moves, each a direction in the world and its
  bounds; `spans(ways)`, whether they span the ground.
- A behavior may wrap another target, `{ move: { line: { ... } } }`, and answer through it. motion3d's
  `move` and `jump` (`plugins/motion3d/motion3d.kinematics3d.ts`) are how a body moves on any target.
- A behavior may also give `footing(pos, yaw, me, w)`: where a body standing at `pos` facing `yaw` is
  now that the floor under it has moved, or undefined where it has not. Before a body's step moves a
  grounded body whose place is its `pos`, it puts it where the first footing that answers says, so a
  body stands still on a moving floor and turns with it (shapes3d's behaviors give one for a shape
  `move` moved).
- `parts(place)` is a place's numbers, one to each way, and `joined(numbers, like)` the place of those
  numbers in the form of `like`.

**The body's step and gravity.** The outermost `step` is the body's own (a behavior stepping the
target it wraps is inside it). On its target, the body is moved by its behavior; then kinematics3d
asks whether the target holds it up: the body is not going up off the target (its `vel` less the part
along the target's ways, so a rope climb is held and a jump is not), and the target under where the
place stands (`nearest`, then `at`) reaches it. Held, the row's `grounded` is true. Else `grounded`
is false and gravity pulls the body down that same step. In the air the behavior does not run:
kinematics3d's fall moves the body, its `vel` across eased toward the want at `airAccel`, its height
carried down by its vertical speed through the target's own step, and stood on the target where it
comes down onto it (`landed` that step). It is the same on every target. A drop the target follows (the
land's stairs, up to its `step`) holds the body up all the way down, so walking down stairs is never
falling.

**States.** `is(me, w, word)`: whether the body is in a state, `!word` its opposite in a move's `when`.
Built in: `stopped` (its place stopped at a target's edge: the way it was pushed when it stopped, or
false), `ground` (held up by its target), `rest` (held up by its target with nothing asking it to move,
its rule's `want` none), `falling` (in the air, going down), `rising` (in the air, going up), `landed`
(come down onto its target this step). More from `world.kinematics3d.mods.states`, each
`<a>.kinematics3d.ts` exporting `states()`, laid over the built-in in the list's order (motion3d's
`still`, `moving`, `pushed`). A word nothing has throws, naming it.

**What stands on the land.** `world.kinematics3d.mods.solids` (shapes3d's shapes) and
`world.kinematics3d.mods.footprints` (their outlines, undersides and tops), which `triangles` stands a
body on and walks it round.

**Numbers.** `numbers(me, w)`: the row's kind's entry of `world.kinematics3d.kinds` (the kind its `as`
names, else its own, `kindOf`; a kind the table has none of throws), one block to
each behavior (`triangles`, `move`, `jump`), and kinematics3d's own, `fall`: `{ gravity, airAccel }`,
m/s² and 1/s (`fallOf`). `relative(stick, yaw)`: the camera-relative stick.

## Using it

1. Give `world.kinematics3d: { kinds: { <kind>: { triangles: { … }, move: { … }, jump: { jumpH },
   fall: { gravity, airAccel } } }, mods: { behaviors: ['shapes3d', 'terrain3d', 'motion3d'], states:
   ['motion3d'], solids: ['shapes3d'], footprints: ['shapes3d'] } }`.
2. In the kind's rule, each step: one `step(w, target, place, want, dt, me)` on the target it moves on
   (motion3d's `drive` does this for a body it plays). Never set `grounded`: kinematics3d writes it.

## Plugins it works with

- **shapes3d**: `shapes3d.kinematics3d.ts` brings point, line, spline and plane targets, its shapes as the
  solids standing on the land, and their footprints.
- **terrain3d**: `terrain3d.kinematics3d.ts` brings the `triangles` target, the land.
- **motion3d**: `motion3d.kinematics3d.ts` brings `move` and `jump` and its states.
- **math**: deterministic maths, so a predicting page moves the server's body.

## Keywords

kinematics, character controller, movement, walk, run, turn, jump, gravity, fall, falling, rising,
land, grounded, held up, rest, slopes, step, stairs, slide, collision, footprint, target, point, line,
spline, plane, triangles, place, want, edges, behaviors, states, solids, `step`, `at`, `nearest`, `ways`, `is`,
`fallOf`, `relative`, `world.kinematics3d`
