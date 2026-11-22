# box3dvehicle

Driveable cars on box3d: a chassis, a wheel per corner and a wheel joint each, made from one
description, driven by throttle, brake, steer and gear, riding on a suspension of springs, dampers,
bump stops and anti-roll bars. Direct-drive, petrol (torque curve, manual or automatic gearbox) or
electric engines. The page draws a pro-ng kit model from the library (its body rigged so its
suspension and steering move as the physics does, its lamps lit as it brakes, reverses and has its
headlights on), or a car of its own (body, fenders, bumpers, grille, lamps that light, tyres with
tread, springs, dampers, arms), with exhaust smoke, dust, tyre tracks and engine sound.

## Why use it

Use box3dvehicle when a 3D game has something to drive: a car, a jeep, a monster truck, a trailer, a
buggy, a tractor. One entry in the scene file is the whole vehicle, which the physics, the look and
the sound are all made from, so a number changed there changes the car everywhere at once. Every
part is a box3d row, so the car is predicted, rewound and sent like any other body.

## How it works

**Server half (`box3dvehicle.sim.ts`).** There is one `box3dvehicle` row per car. It holds
`vehicle` (the name of its Vehicle in `world.box3dvehicle.vehicles`), `throttle` (−1 to 1), `brake`
(0 to 1), `steer` (−1 to 1, positive left), `gear`, and the ids of its `chassis`, `wheels` and
`joints`. On its first step it spawns the parts where its actor entry put it, moving at the entry's
`initialVelocity` when it has one (`[x, y, z]` m/s in the car's own axes, +x forward); a rule making
a car mid-step calls `vehicle(w, name, pos, rot, initialVelocity?)` and gets it whole. `scrap(w, car)`
ends a car and every part.

Each step, in `before`, the throttle, brake and steer become each wheel joint's `spinSpeed`,
`maxSpinTorque` and `targetSteeringAngle` (a wheel on an axle that is not `steered` has its
steering off, so it is held straight and never toes in under drive), and each corner's suspension is set on Box3D's own spring
on the wheel joint, solved inside the step with the contacts, so it never overshoots however stiff.
Springs are preloaded to carry their share of the chassis at `sag` in the scene's gravity. The row
writes `compression`, `load` and `grounded` per wheel, and a petrol or electric car writes `rpm` and
`torque`.

A seat drives a car through its acts, `pedal(v)`, `throttle(v)`, `steer(v)`, `brake(v)`,
`shift(by)` and `lights(on)` (true or false, kept on the row as `lights`, the headlights on or off),
passed on by the `player` row that holds the car (`relay` in `plugins/player`). None is
`open`. `pedal` is the arcade one-pedal: on a car with an automatic box, held back it brakes and,
below `pedal.stop`, reverses.

With `hit` and the `bodies` and `strike` mods, a chassis moving at `hit.speed` or faster strikes the
bodies its box meets for `hit.damage` per m/s.

**Browser half (`box3dvehicle.plugin.ts`).** Every car is drawn from its Vehicle's `look` and
placed each frame from its rows. Without `model` it builds the body box and cabin, fenders, bumpers,
grille, headlights that throw spot lights, tail, brake and reverse lights, a spare, revolved tyres
with chevron tread on dished rims, and at each corner a coil spring, damper and arms that squash with
the wheel; it draws no steering wheel. With `model` a glb is drawn on the chassis instead. A pro-ng
kit model (it names its `looks`, drawn through the `models` mod, supershader3d's) is the way a game's
car is made: the library's vehicles (`pro-ng/kit/modern/vehicles/`) are built to the contract in
`pro-ng/kit/modern/vehicles/BOX3DVEHICLE.md`. Its body's skeleton is the suspension and steering, and
`look.rig` names the kit thing whose clips box3dvehicle poses every frame: `steer` from the row's
steer, and each wheel's `travel <axle> <side>` from its compression. Its lamps are materials with lit
twins, named in `look.lamps`, drawn lit while their group is (`head`, `tail`, `reverse`, `amber`). Its
`steer…` node is the steering wheel, turned by `look.lock`, and `look.wheel` (and `look.hubs`) are
models of their own on each wheel. A loader `model` glb has its lamps and steering wheel found by node
name. `points` are named empties (a seat, the grips on the wheel) for a body to sit at and hold.
Parts that never move against each other are merged into one mesh per material.

The lamps, `look.lights`: the headlight beams aim `beam.dip` radians down and `beam.toe` radians out
to each side; with `beam.at` `[x, y, z]` the two beams stand there on the chassis (the left at −z,
the right at +z) instead of in the lamps. `tail.lens` is the tail lens's own colour under its glow,
so a dark lens with no `glow` stays near black until the brake lights it. With
`world.box3dvehicle.lightsOff: true` no car of the scene makes a brake or reverse light (the lenses
still glow as it brakes and backs), and its headlight beams are dark until the car row's `lights` is
on. Every light is made with the car and kept, so switching one never changes how many lights a
frame draws.

A car throws no particles itself. Its mod for particle3d, `box3dvehicle.particle3d.ts`
(`world.particle3d.mods.sources: ['box3dvehicle']`), hands particle3d every car's sources each frame: a
`wheel` at the ground under each wheel, and an `exhaust` at each tailpipe `{ at, dir, pipe }` of its look,
each `of` the car's vehicle. The scene's `world.particle3d.attach` says which effect each throws, so
every car's dirt and smoke is one list in the scene:

```json
"particle3d": {
  "effects": "effects",
  "mods": { "sources": ["box3dvehicle"] },
  "attach": [{ "on": "wheel", "effect": "tyre" }, { "on": "exhaust", "effect": "exhaust" }]
}
```

Each source drives its own effect alone: `rpm`, `throttle`, `speed`, `slide` (how fast the tread
slides over the ground), `slip` (how fast the wheel goes sideways), `load` (newtons the wheel's
suspension pushes it down on the ground with), and a wheel's own `compression`, `grounded`, `height`
over the land, the way its tread pushes the ground (`backX`, `backZ`) and the way it slides (`sideX`,
`sideZ`), with the drivers the ground under it hands (terrain3d's surfaces' `drivers`, a mud's tint).
So the dynamics of the car are in its dirt: how many a wheel kicks up is its load, which way is its
slide and its slip, and what colour is the ground's.

```json
"drivers": { "load": 0, "slip": 0, "sideX": 0, "sideZ": 0, "tint": 9075296 },
"effects": {
  "tyre": [{ "every": "load > 500 ? 0.4 / load * 1000 : 0", "tint": "tint", "dir": ["sideX", 0.2, "sideZ"], "speed": ["0.3 * slip", "0.6 * slip"], "life": [0.5, 0.8] }]
}
```

`tracks` lays fading tyre ribbons on the land, and `sound` plays the engine as layered loops
crossfaded by `rpm` and throttle.

## Using it

1. List `box3d`, `box3dvehicle` and `render3d` in that order in `plugins` (with `particle3d` before
   `render3d` for the cars' effects, and the land's plugin before box3dvehicle for tracks).
2. Give `world.box3d.mods.kinds: ['box3dvehicle']`, so box3d is handed the parts' kinds, and
   `world.box3dvehicle`:
   - `chassis`, `wheel`, `joint`: the kinds of the parts' rows.
   - `vehicles`: name to Vehicle: `body` (`length`, `height`, `width`, `mass`, `center`, `friction`,
     `cabin`), `bodies`, `axles` (each `at`, `track`, `mount`, `wheel`, `spring`, `damper`,
     `bumpStop`, `antiRoll`, `driven`, `steered`, and `one`, `rake`, `brakeTorque`), `engine` (direct, petrol
     or electric), `steering`, `balance`, `pedal`, `look`, `hit`. A **one-wheel axle** (`one: true`, `track` 0)
     carries one wheel on the middle line, and a vehicle of two of them is a motorcycle: it has no tilt across
     to stand on, so its springs carry the lever rule's shares, and its `balance` (`hertz`, `dampingRatio`,
     `torque`, `lean`, `rate`, `reference`, `floor`) holds it up and leans it into its turns with a roll torque
     on the chassis (`box3dvehicle.sim.ts`, Balance); the row writes `aim`, `lean` and `speed`. An axle's `rake`
     tips its spring's line, which its wheel steers about too, back from up (a fork's), `at` and `mount` the
     spring's top where that line puts it from the wheel's rest place. An axle's `brakeTorque` is its wheels'
     torque at brake 1 in place of the engine's (a bike brakes mostly with its front). The body's `inertia`
     [roll, yaw, pitch] replaces the box's own. A vehicle with a one-wheel axle is drawn by its `look.model`,
     its `look.wheel` a `{ centre }` model, or a list of them for each axle, and its rig's clips
     `travel <axle> centre` (`pro-ng/kit/modern/vehicles/BOX3DVEHICLE.md`, "A one-wheel axle").
   - `lightsOff`: true for no brake or reverse lights, and headlights lit only by the `lights` act.
   - `mods`: `{ gravity, land, grip, drag, bodies, strike, sound }`. `gravity` is required.
3. Put a `box3dvehicle` row in `actors` with `vehicle`, `pos`, `rot` and, if it starts moving,
   `initialVelocity`, or call `vehicle(w, name, pos, rot, initialVelocity?)` from a rule.
4. Drive it by writing `throttle`, `brake`, `steer` on the row, or have the seat's `player` row hold
   the car and relay its presses to the car's acts.

Helpers: `design(world, row)` (a car's Vehicle), `pointOf(v, name)`, `corners(v)`, `wheelAt`,
`loads(v, g)`, `ride(v, g)`, `torqueAt(curve, rpm)`, `along(points, x)` (a curve of `[x, y]` points
read at `x`), `automatic(v)`, `pedals(v, car)`,
`shift(me, v, by)`, `turned(v, corner, steer, mid)` (a steered wheel's angle, with `steering.ackermann`).
On the page, `plugins.box3dvehicle.point(id, name)` is a point's empty as drawn this frame.

A game makes its cars from the library's kit with its bake: each car a body scene (the compound with
its wheels and steering wheel left out, and its `interior/steering` placed alone as the thing `steer`)
and a scene for each side's wheel, cut and packed into `<name>.kit.glb` and `<name>.kit.looks.json`, the
spring and steering numbers of the car's entry written into its body scene as the kit's ride keys.
`games/vehicles/assets/kit.make.ts` and `ride.make.ts` are the model, and its
`vehicles.models.test.ts` and `vehicles.rig.test.ts` the standard every car is held to.
## Plugins it works with

- **gpgpu3d**: the mod `box3dvehicle.gpgpu3d.ts` (`world.gpgpu3d.mods: { things: ['box3dvehicle'],
  behaviors: ['box3dvehicle'] }`) hands gpgpu3d every car's body and wheels, the same boxes lod3d is
  handed, each a `hyperbox`, a box turned any way, so what is moved on the GPU meets a car.
- **grass3d**: the mod `box3dvehicle.grass3d.ts` (`world.grass3d.mods: { pressed: 'gpgpu3d', behaviors:
  ['box3dvehicle'] }`) says how a `hyperbox` presses the grass: the grass bends away from the car, and
  the wheels lay tracks of grass lying down behind it.
- **box3d**: every part is a box3d body or joint. box3dvehicle's mod `box3dvehicle.box3d.ts`
  (`world.box3d.mods.kinds`) builds them; box3d's mod `box3d.box3dvehicle.ts`
  (`mods: { gravity: 'box3d' }`) hands back the gravity the springs are preloaded against.
- **terrain3d**: the mod `terrain3d.box3dvehicle.ts` (`mods: { land: 'terrain3d' }`, and `grip` and
  `drag` from the ground's surfaces) gives the ground height for tracks and the wheels' effects, the
  drivers each surface hands what is on it, how marked it gets, how well it grips and how much it drags.
- **audio**: the mod `audio.box3dvehicle.ts` (`mods: { sound: 'audio' }`) plays each engine.
- **hitscan3d**: the mod `hitscan3d.box3dvehicle.ts` (`mods: { bodies: 'hitscan3d', strike:
  'hitscan3d' }`) hands the bodies a shot can hit as the bodies a car runs into, and hurts each one
  as a shot does.
- **dismember3d**: the mod `dismember3d.box3dvehicle.ts` (`mods: { strike: 'dismember3d' }`) has a car
  crush a body that comes apart, taking off limbs on the side it met, and throw it limp through
  ragdoll3d.
- **interact**: the mod `box3dvehicle.interact.ts` (`world.interact.mods: { point: 'box3dvehicle',
  object: 'box3dvehicle' }`) places a body getting in, driving and getting out at the car's points.
- **lod3d**: the mod `box3dvehicle.lod3d.ts` (`world.lod3d.mods: { hollows: ['box3dvehicle'] }`, with
  `world.lod3d.hollows`) hands lod3d each car's body and wheels as boxes, so no grass or bush is drawn
  inside a car.
- **particle3d**: the mod `box3dvehicle.particle3d.ts` (`world.particle3d.mods.sources:
  ['box3dvehicle']`) hands every wheel and tailpipe as a source, for `world.particle3d.attach`.
- **gpuparticle3d**: the mod `box3dvehicle.gpuparticle3d.ts` (`world.gpuparticle3d.mods.sources:
  ['box3dvehicle']`) hands it the same sources, for `world.gpuparticle3d.attach`.
- **render3d**: draws the car and dresses its materials, so the sky, wet and snow reach it.
- **loader**: a `look.model` glb and the engine sound manifest.
- **supershader3d**: the mod `supershader3d.box3dvehicle.ts` (`mods: { models: 'supershader3d' }`) builds a
  pro-ng model's mesh in the scene's one shader, plays its rig's clips and hands the look numbers of each
  lamp's lit twin.
- **player**: a seat's `player` row relays presses to the car it holds.

## Keywords

vehicle, car, driving, jeep, truck, monster truck, buggy, trailer, physics car, wheel joint, suspension, spring, damper, shock absorber, bump stop, anti-roll bar, sway
bar, preload, sag, throttle, brake, steer, steering, handbrake, gearbox, gears, automatic, manual,
clutch, rpm, torque curve, redline, petrol, electric motor, regen, four-wheel drive, front-wheel
drive, rear-wheel drive, one pedal, arcade driving, reverse, tyre grip, friction, rolling resistance,
mud, skid marks, tyre tracks, dust, exhaust smoke, headlights, brake lights, engine sound, solid
axle, independent suspension, pro-ng, kit, rig, ride clips, lit twin, Ackermann, get in the car, enter vehicle, `vehicle`, `scrap`,
`world.box3dvehicle`
