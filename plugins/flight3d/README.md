# flight3d

Fixed-wing flight: an aeroplane as forces and moments, a linearised stability-derivative airframe
with a stalling lift polar, thrust that falls with altitude and propeller speed, engine torque and
gyroscopic precession, control surfaces that slew at their rates, retractable sprung landing gear
with brakes, steering and grip, crashes, and a swept check so a fast plane never passes through a
ridge. The page draws each plane's model with its ailerons, elevator, rudder, airbrakes, gear,
wheels and propeller moving as flown.

## Why use it

Use flight3d for a flight game: a dogfight, a biplane, a jet, a bush plane, a racing plane, a
flight school. A plane is designed from a sheet of what was bought (thrust, wing area, span,
derivatives), and its mass is priced from its parts, so a designer trades power, wing and structure
against each other. It holds no library and no memory between steps: everything a plane is doing is
on its row, so the server, a predicting page and a replay fly the identical plane.

## How it works

**Server half (`flight3d.sim.ts`).** A plane is one row (of kind `flight3d`, or of the kinds
`world.flight3d.kinds` lists, such as a seat's own `player`). It carries `type`, `pos`, `rot` (body
to world quaternion), `vel`, `spin`, the surfaces `aileron`, `elevator`, `rudder`, the stick
`pitch`, `roll`, `yaw` (−1 to 1), `throttle` and `throttling`, `airbrake`, `brake`, `gear` and
`gearDown`, `press` (each wheel's compression, for drawing) and `crashed`. A rule writes `type`, the
stick, `throttling`, `airbrake`, `brake` and `gearDown`; flight3d writes the rest.

Each step: the surfaces slew toward the stick; the lever moves; the air's and engine's forces and
moments are worked out (`aero`) and the gear's added (`contact`); the angular velocity then the
attitude, and the velocity then the position, are stepped semi-implicitly (a circling turn does not
spiral out); and the path flown is checked against the ground every `sweep` metres.

- The aerodynamics are written in the aviation frame (x forward, y right, z down, rates p, q, r),
  so every derivative keeps a textbook's sign: roll `clDeltaA`, `clP`; pitch `cm0`, `cmAlpha`, `cmQ`,
  `cmDeltaE`; yaw `cnBeta`, `cnR`, `cnDeltaR`; lift `clAlpha` to `alphaStall` and past it
  `clPostStall`, blended over `stallBlend`; drag `cd0`, `oswald`, `cdFlatPlate`, `brakeCd`.
- Thrust is `maxThrust` times the lever, falling with the air's density (`e^(−y/scaleHeight)`), and a
  propeller's also falls as `propSpeed`/speed above `propSpeed`. `engineTorque` rolls the airframe
  against the prop, and the spinning engine's angular momentum precesses the nose when it turns.
- The gear: wheels as springs and dampers along the ground's normal, rolling friction, brakes, side
  grip and nose-wheel steering; retractable gear travels over `retract` seconds and is held down
  while a wheel bears weight. A plane crashes when a wheel meets the ground faster than `sink`, is
  pressed past its radius, or a `touch` point (a wingtip, the prop tip, the tail) goes below ground.

Helpers: `windAngles(p, air)` (`{ aoa, slip, speed }` for a HUD), `aero`, `step(p, f, dt, ground?)`
(for a kind that flies its own row), `price`, `massOf`, `topSpeed`, `stallSpeed`, `thrustOf`,
`densityAt`, `fromHeading`, `fromAttitude`, `noseOf`, `rotate`, `unrotate`, `groundOf`.

**Browser half (`flight3d.plugin.ts`).** Every plane row is drawn from the loader model its
`look.model` names, in flight3d's body frame (+X the right wing, +Y up, −Z the nose), with a node for
each moving part on its hinge, found by name: `aileron_left…`, `aileron_right…`, `elevator`,
`rudder`, `airbrake…`, `gear_<n>`, `prop`, `steer_<n>`, `wheel_<n>`. Each frame every part is turned
by the angle on the row; wheels roll by the distance covered while pressed and slide up their legs
by `press`; the propeller turns `look.spin` rad/s at full throttle.

## Using it

1. List `flight3d` after `loader` and before `render3d` in `plugins`.
2. Give `world.flight3d`: `gravity`, `air: { density, scaleHeight, calm }`, `materials:
   { engineDensity, wingDensity, structureDrag }`, `planes: { <name>: { airframe, gear, look } }`,
   `overspeed`, `sweep`, `mods: { ground }`, and `kinds` if the planes are rows of another kind.
3. Spawn a row with `type` and a starting `pos`, `rot`, and have the seat's input write the stick,
   `throttling`, `airbrake`, `brake` and `gearDown`.
4. Model each plane in Blender in the body frame with its moving parts as named, hinged nodes, and
   catalogue the glb as a loader `model`.

## Plugins it works with

- **terrain3d**: the mod `terrain3d.flight3d.ts` (`world.flight3d.mods: { ground: 'terrain3d' }`)
  hands the land's height, the sea's surface where it floods, so a plane that flies into the sea has
  hit it. With no `ground` the plane flies over nothing and never crashes.
- **loader** and **render3d**: the models and the drawing.
- **chasecamera3d**: a camera on the plane's row.
- **math**: deterministic maths, so every machine flies the same plane.

## Keywords

flight, flight sim, flight model, aeroplane, airplane, plane, aircraft, fixed wing, biplane, jet,
dogfight, aerodynamics, lift, drag, stall, angle of attack, AoA, sideslip, stability derivatives,
thrust, propeller, torque, gyroscopic precession, P-factor, ailerons, elevator, rudder, flaps,
airbrake, throttle, stick, landing gear, retractable gear, wheels, brakes, taxi, take-off, landing,
crash, altitude, air density, semi-implicit integration, `step`, `aero`, `windAngles`,
`world.flight3d`
