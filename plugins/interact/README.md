# interact

A body doing one thing with a machine, start to finish: getting into a car and driving it, getting
out, climbing onto a tractor, boarding a mech and sitting in its seat. An interaction is a list of
steps played in order on the body's row; in each the body plays one clip, stands on a point of the
machine (walking along the clip's measured travel where the step says), and bends its hands and feet
onto other points of it.

## Why use it

Use interact for enter-vehicle and exit-vehicle animations, mounting, sitting, operating a machine,
climbing aboard: anything where a character's animation has to stay glued to a moving thing. The
server stands the body on the machine's point every step, so every seat sees it there; the page then
lays it on the point as drawn (with the machine's bob, sway and spring roll), so it never slides off.

## How it works

**Server half (`interact.sim.ts`).** No row of its own: functions a body's rule calls on its own
row. The body's row carries `interact`: null when in none, else `{ machine, kind, name, step, t }`.

- `begin(me, w, machine, name)`: starts the machine's interaction at its first step (its clip played
  from 0 through anim's `play`, the body placed at its point).
- `advance(me, w, dt)`: called each step, after the machine has moved. `t` goes up; a step whose clip
  has run gives way to the next; past the last step that does not `hold`, the interaction ends. The
  body is placed on the step's point (facing the point's yaw turned by `turn`, or where its `travel`
  has it) and held still. Returns `{ name, done }`, or undefined when in none. A machine whose row
  ended ends the interaction.
- `end(me, w)`: ends it where it is (anim's `stop`), so the body is back in its gears.
- `stepOf(me, w)`: the name of the step it is in, for the game to drive the machine (kneel, open a
  door) by.
- `interactionOf(w, kind, name)`, `placeOf(w, machine, name)`, `startOf(w, me, machine, name)` (where
  a body should stand to begin, and how near it must be), `travelOf(from, me, step, t)`.

**An interaction file** (`<machine>.<interaction>.interaction.json`, a loader `json` entry) is
`{ body, steps }`: `body` the anim kind whose rig its clips are; each step `{ name, clip, at, turn?,
travel?, hold?, ik? }`: the clip to play, the machine's point the body stands at, a turn in degrees,
`travel: "from"` (start at the point and go where the clip takes it) or `"to"` (end at the point),
`hold` (only the last step: last until `end`, its clip looping), and `ik` limbs `[{ bones, target,
pole }]` reaching machine points. A file out of shape throws naming the interaction and field.

**Browser half (`interact.plugin.ts`).** No drawing of its own. In its `tick` and `afterTick`, for
each row in an interaction whose body the `body` mod hands and whose point the `object` mod draws, it
puts the body's root at the point as drawn this frame (moved by the step's travel), and moves the
props hung on it with it.

## Using it

1. Give `world.interact: { kinds: { <machine kind>: { <interaction>: <catalogue key> } }, mods:
   { point, object, body } }`.
2. Put `interact: null` in the body kind's prefab.
3. From a seat's act (a "use" key near a car), check `startOf` for distance, then `begin`; call
   `advance` every step from the body's rule; call `end` to get out early.
4. List the `body` and `object` mods' plugins before `interact`, and `interact` before `ik3d`.
5. For hands and feet, name `world.ik3d.mods: { limbs: 'interact' }`.

## Plugins it works with

- **anim**: plays each step's clip, measures its travel; the mod `anim.interact.ts`
  (`world.interact.mods: { body: 'anim' }`) hands the drawn body.
- **box3dvehicle**: the mod `box3dvehicle.interact.ts` (`mods: { point: 'box3dvehicle', object:
  'box3dvehicle' }`) hands a car's seat, grips and other `look.points` on the server and as drawn.
- **ik3d**: interact's mod `interact.ik3d.ts` (`world.ik3d.mods: { limbs: 'interact' }`) hands the
  limbs a step bends.
- **loader**: the interaction files are `json` entries.
- **math**: deterministic maths.

## Keywords

interaction, enter vehicle, exit vehicle, get in the car, get out, board, mount, dismount, sit,
seat, drive, climb, ladder, operate, machine, use, sync animation to object, attach character,
vehicle entry, door, steering wheel, hands on wheel, IK targets, points, steps, clip sequence,
travel, root motion, `begin`, `advance`, `end`, `stepOf`, `startOf`, `world.interact`
