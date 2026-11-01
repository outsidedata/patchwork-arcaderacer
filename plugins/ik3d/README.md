# ik3d

Two-bone inverse kinematics on the page: a body's arms and legs bent so its hands and feet reach
points on what it holds (a rifle's grip and foregrip) or on what another plugin says it reaches for
(a steering wheel, pedals, a ladder's rungs), and a held prop set against the body by a point of its
own (a rifle's stock in the shoulder).

## Why use it

Use ik3d when a character's hands must land on something that animation clips alone cannot line up
with: both hands on a gun whatever the aim, hands on a car's wheel as it turns, feet on pedals,
hands on a handle or a lever. It runs on the page from rows every seat already has, so it costs
nothing on the wire and every seat bends the same limbs.

## How it works

ik3d has a browser half only, no row and no prefab. Its numbers are `world.ik3d`. The bodies and the
extra limbs come through mods, `world.ik3d.mods`:

- `body(plugins, row)` (required): the body the page draws for the row, `{ kind, root, props, limp }`
  (anim's, `anim.ik3d.ts`).
- `limbs(plugins, row)` (optional): limbs another plugin hands for the row this frame,
  `[{ bones, pole, target }]`, `target` a three.js object (interact's, `interact.ik3d.ts`). A row
  whose kind `world.ik3d.kinds` does not list is solved for these alone.

Each frame, in its `tick` (so an actor's tick reads the reached pose, the muzzle where the hands
hold it) and again in its `afterTick` (after the body's plugin hangs its props again):

1. The anchor: the prop named by `anchor.prop` is set so its `point` empty stands at the frame of the
   bone ending `anchor.bone`, that frame's scale taken off, moved by `at` metres and turned by `turn`
   degrees; turning `turn` turns the prop about the point, so a stock stays in the shoulder while
   the muzzle aims.
2. Each limb, in order: `reach` (`ik3d.solve.ts`) is the exact two-bone solve. The distance from the
   upper bone to the target, cut to what the two bones can span, sets the middle joint by the law of
   cosines, on the side toward `pole` (the way the elbow or knee points, in the body root's frame).
   The upper and lower bones turn by the shortest arc, so their twist is kept; the end bone takes the
   target's rotation. The bones' own lengths are used, so a limb never stretches.

Each bone a solve turns is put back to the clip's pose before the next solve (unless its clip has
written it since), so every solve starts from the animation and solving twice in a frame lands the
same. On a Mixamo model with several skeleton copies, the solve runs on the copy the clips drive and
lends each turned bone's rotation to the same bone in every other copy. A limp body is not solved
and is let go of.

`short(id)` is how far each limb's end ended from its target on the last solve, in metres.

## Using it

1. List `ik3d` after the body's plugin (anim) and the limbs' plugin (interact), and before
   `render3d`; any other order throws.
2. Give `world.ik3d`:

   ```json
   "ik3d": {
     "mods": { "body": "anim", "limbs": "interact" },
     "kinds": {
       "<kind>": {
         "anchor": { "prop": "<model>", "bone": "<bone suffix>", "at": [0, 0, 0], "turn": [0, 0, 0], "point": "<empty>" },
         "limbs": [{ "bones": ["<upper>", "<lower>", "<end>"], "prop": "<model>", "target": "<empty>", "pole": [0, 0, 0] }]
       }
     }
   }
   ```

   Bones are named by the end of their names (`RightArm`, `RightForeArm`, `RightHand`). The numbers
   are checked whenever they change; a bone, prop or empty that is not there throws, naming it.
3. Put named empties in the prop's model where the hands go (a grip, a foregrip, a stock).

`anchor` and `reach` in `ik3d.solve.ts` import nothing at run time (three is handed in), so a page
can run the same solve on its own.

## Plugins it works with

- **anim**: the mod `anim.ik3d.ts` (`world.ik3d.mods: { body: 'anim' }`) hands the bodies and props
  anim draws.
- **interact**: the mod `interact.ik3d.ts` (`world.ik3d.mods: { limbs: 'interact' }`) hands the hands
  and feet of a body in an interaction, reaching its machine's points (a car's grips through
  box3dvehicle's points).
- **motion3d**: bends the limbs of the bodies it draws itself, with `anchor` and `reach` from
  `ik3d.solve.ts`; it needs no `world.ik3d` and no mod.
- **render3d**: draws the bent limbs; ik3d is listed before it.

## Keywords

IK, inverse kinematics, two-bone IK, limb IK, hand IK, foot IK, arm, leg, elbow, knee, pole vector,
law of cosines, hands on gun, foregrip, weapon holding, stock, shoulder, steering wheel, pedals,
grab, reach, procedural animation, Mixamo, skeleton, bones, three.js, `reach`, `anchor`, `short`,
`world.ik3d`
