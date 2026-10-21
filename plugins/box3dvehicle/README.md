# box3dvehicle

Driveable cars on box3d: a chassis, a wheel per corner and a wheel joint each, made from one
description, driven by throttle, brake, steer and gear, riding on a suspension of springs, dampers,
bump stops and anti-roll bars. Direct-drive, petrol (torque curve, manual or automatic gearbox) or
electric engines. The page draws the whole car (body, open jeep tub, fenders, bumpers, grille,
lamps that light, tyres with tread, springs, dampers, arms, solid axles) or a baked model, with
exhaust smoke, dust, tyre tracks and engine sound.

## Why use it

Use box3dvehicle when a 3D game has something to drive: a car, a jeep, a monster truck, a trailer, a
buggy, a tractor. One entry in the scene file is the whole vehicle, which the physics, the look and
the sound are all made from, so a number changed there changes the car everywhere at once. Every
part is a box3d row, so the car is predicted, rewound and sent like any other body.

## How it works

**Server half (`box3dvehicle.sim.ts`).** There is one `box3dvehicle` row per car. It holds
`vehicle` (the name of its Vehicle in `world.box3dvehicle.vehicles`), `throttle` (−1 to 1), `brake`
(0 to 1), `steer` (−1 to 1, positive left), `gear`, and the ids of its `chassis`, `wheels` and
`joints`. On its first step it spawns the parts where its actor entry put it; a rule making a car
mid-step calls `vehicle(w, name, pos, rot)` and gets it whole. `scrap(w, car)` ends a car and every
part.

Each step, in `before`, the throttle, brake and steer become each wheel joint's `spinSpeed`,
`maxSpinTorque` and `targetSteeringAngle`, and each corner's suspension is set on Box3D's own spring
on the wheel joint, solved inside the step with the contacts, so it never overshoots however stiff.
Springs are preloaded to carry their share of the chassis at `sag` in the scene's gravity. The row
writes `compression`, `load` and `grounded` per wheel, and a petrol or electric car writes `rpm` and
`torque`.

A seat drives a car through its acts, `pedal(v)`, `throttle(v)`, `steer(v)`, `brake(v)` and
`shift(by)`, passed on by the `player` row that holds the car (`relay` in `plugins/player`). None is
`open`. `pedal` is the arcade one-pedal: on a car with an automatic box, held back it brakes and,
below `pedal.stop`, reverses.

With `hit` and the `bodies` and `strike` mods, a chassis moving at `hit.speed` or faster strikes the
bodies its box meets for `hit.damage` per m/s.

**Browser half (`box3dvehicle.plugin.ts`).** Every car is drawn from its Vehicle's `look` and
placed each frame from its rows. Without `model` it builds the body box and cabin, or an open jeep
(tub, hood, dash, seats, steering wheel, windshield, roll bar), fenders, bumpers, grille, headlights
that throw spot lights, tail, brake and reverse lights, a spare, revolved tyres with chevron tread on
dished rims, and at each corner a coil spring, damper and arms that squash with the wheel, or a solid
axle (`solid`) with links, shocks and a driveshaft. With `model` a baked glb is drawn on the chassis
instead, its lamps and steering wheel found by node name. `points` are named empties (a seat, the
grips on the wheel) for a body to sit at and hold. Parts that never move against each other are
merged into one mesh per material. `exhaust` and `dust` throw particle3d effects, `tracks` lays
fading tyre ribbons on the land, and `sound` plays the engine as layered loops crossfaded by `rpm`
and throttle.

## Using it

1. List `box3d`, `box3dvehicle` and `render3d` in that order in `plugins` (with `particle3d` after
   box3dvehicle for exhaust or dust, and the land's plugin before it for dust or tracks).
2. Give `world.box3d.mods.kinds: ['box3dvehicle']`, so box3d is handed the parts' kinds, and
   `world.box3dvehicle`:
   - `chassis`, `wheel`, `joint`: the kinds of the parts' rows.
   - `vehicles`: name to Vehicle: `body` (`length`, `height`, `width`, `mass`, `center`, `friction`,
     `cabin`), `bodies`, `axles` (each `at`, `track`, `mount`, `wheel`, `spring`, `damper`,
     `bumpStop`, `antiRoll`, `driven`, `steered`), `engine` (direct, petrol or electric), `steering`,
     `pedal`, `look`, `hit`.
   - `mods`: `{ gravity, land, grip, drag, bodies, strike, sound }`. `gravity` is required.
3. Put a `box3dvehicle` row in `actors` with `vehicle`, `pos` and `rot`, or call
   `vehicle(w, name, pos, rot)` from a rule.
4. Drive it by writing `throttle`, `brake`, `steer` on the row, or have the seat's `player` row hold
   the car and relay its presses to the car's acts.

Helpers: `design(world, row)` (a car's Vehicle), `pointOf(v, name)`, `corners(v)`, `wheelAt`,
`loads(v, g)`, `ride(v, g)`, `torqueAt(curve, rpm)`, `automatic(v)`, `pedals(v, car)`,
`shift(me, v, by)`, `solidParts`. On the page, `plugins.box3dvehicle.point(id, name)` is a point's
empty as drawn this frame.

`truck/` holds the Blender scripts that build a vehicle's `look.model` to its scene numbers
(`truck.py`, on the building blocks of `kit.py`), and the checker (`parts.ts` then `look.py`) that
measures the model's clearance against every wheel at rest, full bump, full droop, crossed and at
full lock, and prints coplanar faces that z-fight:

```
Blender -b --factory-startup --python plugins/box3dvehicle/truck/truck.py -- <scene.json> <vehicle> <out.glb>
node --experimental-strip-types plugins/box3dvehicle/truck/parts.ts <scene.json> <vehicle> <outdir>
Blender -b --python plugins/box3dvehicle/truck/look.py -- <scene.json> <vehicle> <model.glb> <outdir>
```

## Plugins it works with

- **box3d**: every part is a box3d body or joint. box3dvehicle's mod `box3dvehicle.box3d.ts`
  (`world.box3d.mods.kinds`) builds them; box3d's mod `box3d.box3dvehicle.ts`
  (`mods: { gravity: 'box3d' }`) hands back the gravity the springs are preloaded against.
- **terrain3d**: the mod `terrain3d.box3dvehicle.ts` (`mods: { land: 'terrain3d' }`, and `grip` and
  `drag` from the ground's surfaces) gives the ground height for dust and tracks, what each surface
  sprays, how marked it gets, how well it grips and how much it drags.
- **audio**: the mod `audio.box3dvehicle.ts` (`mods: { sound: 'audio' }`) plays each engine.
- **hitscan3d**: the mod `hitscan3d.box3dvehicle.ts` (`mods: { bodies: 'hitscan3d', strike:
  'hitscan3d' }`) hands the bodies a shot can hit as the bodies a car runs into, and hurts each one
  as a shot does.
- **dismember3d**: the mod `dismember3d.box3dvehicle.ts` (`mods: { strike: 'dismember3d' }`) has a car
  crush a body that comes apart, taking off limbs on the side it met, and throw it limp through
  ragdoll3d.
- **interact**: the mod `box3dvehicle.interact.ts` (`world.interact.mods: { point: 'box3dvehicle',
  object: 'box3dvehicle' }`) places a body getting in, driving and getting out at the car's points.
- **scatter3d**: the mod `box3dvehicle.scatter3d.ts` (`world.scatter3d.mods: { hollows:
  ['box3dvehicle'] }`) keeps grass and bushes from drawing inside a car.
- **particle3d**: exhaust and dust effects.
- **render3d**: draws the car and dresses its materials, so the sky, wet and snow reach it.
- **loader**: a `look.model` glb and the engine sound manifest.
- **player**: a seat's `player` row relays presses to the car it holds.

## Keywords

vehicle, car, driving, jeep, truck, monster truck, buggy, trailer, physics car, wheel joint, suspension, spring, damper, shock absorber, bump stop, anti-roll bar, sway
bar, preload, sag, throttle, brake, steer, steering, handbrake, gearbox, gears, automatic, manual,
clutch, rpm, torque curve, redline, petrol, electric motor, regen, four-wheel drive, front-wheel
drive, rear-wheel drive, one pedal, arcade driving, reverse, tyre grip, friction, rolling resistance,
mud, skid marks, tyre tracks, dust, exhaust smoke, headlights, brake lights, engine sound, solid
axle, procedural car model, Blender, get in the car, enter vehicle, `vehicle`, `scrap`,
`world.box3dvehicle`
