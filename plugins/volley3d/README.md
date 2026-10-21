# volley3d

Launched rounds in 3D, none of them a row: rockets, shells, grenades and missiles that fly for a
while (accelerating, capped, falling under gravity, homing on a target or riding a laser spot) before
they meet the ground, a solid or a body, hurt what they hit, splash what is near, can be shot down,
and are drawn on every page with particle3d effects for the round, its trail and its burst.

## Why use it

Use volley3d for anything slower than a hitscan bullet: a rocket launcher, a grenade arc, artillery,
a tank shell, a guided missile, a laser-guided rocket, a fireball. A round is one ledger entry, so a
sky full of rockets costs a packet only those entries, and the server decides every hit and splash.

## How it works

**Server half (`volley3d.sim.ts`).** One ledger row: `next` and `live`. `world.volley3d` holds
`patterns` (a loader `json` entry), `hold` (seconds an ended entry stays so every page sees how it
ended) and `mods: { shoot, bodies }`.

A pattern, in metres and seconds: `speed`, `accel`, `max`, `g`, `life`, `radius` (how far off its line
a body is still met), `splash` (metres a splash reaches), `seek` (radians a second it turns toward its
target), `look: { body, trail, burst }` (particle3d effects). An unknown field throws.

- `fire(w, pattern, at, dir, { from, n, skip, target, ride, hurt })`: puts an entry on the ledger:
  `from` and `n` name the round, `skip` the bodies it passes through (its shooter), `hurt` what it does
  (hitscan3d's `{ damage, by, … }`), `target` a body to seek, `ride: { id, field }` a point a row carries
  to ride (a laser's spot).
- Each step, in `before`, every round in flight ages and flies: an unguided one in closed form
  (`flight(pattern, at, dir, t)`, `velocity`, `speedOf`), a guided one turning its aim toward its ride's
  point or its target's middle by at most `seek` a step. The line it flew is asked of the `shoot` mod,
  which hurts the body it meets; at the first thing met the entry writes `hit: { point, what, id, age }`.
  With `splash`, every other body nearer than `splash` to the point (its shooter's too) has its `hit`
  act called with a `Struck` whose damage falls off with distance, `what: 'splash'`.
- `intercept(w, id)`: shoots a round down where it is (a missile defence, a flak burst).

**Browser half (`volley3d.plugin.ts`).** Each frame draws every round of the ledger (keyed `[from, n]`,
where `flight` puts it at its age, or at its `pos` when guided), with its `body` effect carried along
and turned to its heading, its `trail` thrown behind it, and its `burst` where it met something, all
through particle3d's `emit`. `fire(pattern, at, dir)` on the page draws a preview round on no row.
`volleys()` is every round the page has, `{ key, pos, hit? }`.

## Using it

1. List `volley3d` before `particle3d`, and particle3d before `render3d` (otherwise it throws). Add
   one `volley3d` row (`{ "next": 0, "live": [] }`), catalogue the patterns file, and give
   `world.volley3d: { patterns, hold, mods: { shoot: 'hitscan3d', bodies: 'hitscan3d' } }`.
2. In the shooter's rule: `fire(w, 'rocket', muzzle, aim, { from: me.id, n: me.data.shots++, skip:
   [me.id], hurt: { damage: 50, by: me.id } })`.
3. Give every kind a round can hurt a `hit` act that reads the `Struck`.

## Plugins it works with

- **hitscan3d**: its mod `hitscan3d.volley3d.ts` (`world.volley3d.mods: { shoot: 'hitscan3d', bodies:
  'hitscan3d' }`) has rounds meet and hurt what a shot meets (ground, solids, bodies) in the present,
  and hands the bodies a splash reaches and a guided round turns toward.
- **particle3d**: draws every round's body, trail and burst.
- **loader**: the patterns file.
- **volley2d** is the 2D counterpart.
- **math**: deterministic maths.

## Keywords

projectiles, rockets, rocket launcher, grenades, grenade arc, artillery, shells, missiles, homing,
guided missile, laser guided, ballistic, gravity drop, splash damage, explosion radius, area damage,
falloff, intercept, shoot down, tracer effects, trail, impact burst, ledger, network efficient,
deterministic, `fire`, `intercept`, `flight`, `velocity`, `volleys`, `world.volley3d`
