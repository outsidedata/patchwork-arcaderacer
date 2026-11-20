# particle2d

2D particle effects for a render2d world: bursts and streams of particles from sheets, from
particle2d's own soft shapes (smoke puffs, glows, halos, sparks, streaks, rings, flares, lightning) or
flat squares, with speed, spread, gravity, drag, pull, swirl round a point, pacing, bounce off the
floor and off walls, spin, tint that cools, fade, additive light, stretch along the motion, beams and
tracers to a target, particles that carry effects of their own (flung chunks trailing smoke, nested
as deep as wanted), force generators that many layers share, drivers that turn the numbers live,
lamps that light the world through light2d, effects thrown from other plugins' sources, effects that
fly from one point to another and throw more where they land, effects that ride on a row, and every
seat drawing the same particles.

## Why use it

Use particle2d for explosions, sparks, smoke, dust, blood, magic, muzzle flashes, tracers, lasers,
rain splashes, pickups glittering, fire on a wreck, a comet's trail, a torch's flame and its light. A
particle is drawn and never read by a rule, so no particle is a row: a rule says once which effect,
where and for how long, and each page draws the rest from the same seed.

## How it works

**Server half (`particle2d.sim.ts`).** One `particle2d` row is the ledger: `next` and `live`, and
`drivers` once a rule has driven one (any other field throws). `emit(w, effect, at, spawn)` adds an
entry with the effect's name, its world point `at` (`[x, y]` or `[x, y, h]`, as render2d reads one),
its `age`, and the spawn's `life`, `dir`, `to`, `tint`, `scale`, `floor`, `from`, `fly`, `land`,
`layer` and `drivers`. It hands the entry back; `entry(w, id)` finds it again, and a rule moves it by
writing `at`, drives it by writing `drivers`, or stops it by writing `life`. `drive(w, name, value)`
holds a driver of the effects file at a number on every seat's page, and `drive(w, name)` lets it go.
Each step ages every entry and drops those past their life, or past `world.particle2d.hold` when that
is longer, so a page that takes two packets in a frame still sees it. An entry `from` a row stays
while the row is there.

**Browser half (`particle2d.plugin.ts`).** The page's own ledger of live effects. It takes each
ledger entry the first frame it sees it (rolling any bursts it missed, so a late page draws what an
early one does), and anything on the page can `emit(...)` an effect of its own, seeded or not, and
with an `age` to open it as one that has run that long. `emit` hands the effect back: writing its
`at`, `dir` or `to` moves it, `life` stops it, `floor` is the height its particles rest on, and
writing into its `drivers` drives it alone (Drivers, below). Particles are pooled sprites in containers
on the effect's render2d layer: on a layer that sorts, each effect is sorted by its point's depth, so
a burst behind a wall draws under it.

Every length, speed and pull is in the stage's pixels as they look on the screen, x to the right and
y down, so `[0, -1]` is straight up the screen. A turn is in radians, and a positive one turns
clockwise on the screen, as PixiJS turns a sprite.

The effects are a data file (the loader entry `world.particle2d.effects` names) with `cap` (the most
particles at once), `layer`, `ppm` (sheet pixels per stage pixel), `files` (other files of effects
beside it, whose effects, force generators and drivers are its own too), `forceGenerators`, `drivers`
and `effects`, each a list of layers. A layer `{ "effect": name, "at"? }` reuses another effect; every
other layer is an emitter: `n`, `every`, `after`, `life` or `lasts`, `skip`, `sheet` and `clip` (with
`play`), `shape`, `size`, `grow` or `grows`, `dir`, `spread`, `speed`, `outward`, `jitter`, `box`, `g`,
`drag`, `pull`, `swirl`, `pace`, `bounce`, `follow`, `flips`, `tint` and `tint1` or `tints`, `gain`,
`a0`, `a1` and `fade` or `alphas`, `spin`, `origin`, `add`, `stretch`, `face`, `beam`, `carry`,
`inherit` and `forces`. An unknown field throws, naming it.

`grows`, `tints` and `alphas` are a particle's size, colour and opacity over its life, each a list of
stops `[part, value]` in order, `part` from 0 at its birth to 1 at its death, a straight line from each
stop to the next. They are written in place of `grow`, of `tint` and `tint1`, and of `a0`, `a1` and
`fade`, which say only a start and an end:

```json
{ "life": [0.6, 1.4], "shape": "puff", "size": [12, 20],
  "grows": [[0, 0.3], [0.15, 1], [1, 1.6]],
  "tints": [[0, 16777215], [0.15, 16769696], [0.5, 16747050], [1, 1312260]],
  "alphas": [[0, 0], [0.08, 1], [0.6, 1], [1, 0]] }
```

That puff swells fast and then slowly, cools from white through yellow and orange to near black, and
fades in, holds and fades out.

`outward: [min, max]` throws a particle straight away from the effect's point, beside its `speed` along
`dir`: one started off the point by a `box` or a `jitter` goes out along the line from the point through
where it starts, so a burst flies apart from its middle. `inherit` is how much of its effect's speed a
particle starts with: a carried effect's speed is that of the particle carrying it, so with `inherit` 1
what a flung chunk sheds goes on the way the chunk is going.

`swirl` carries a particle round the point it was thrown from, that many radians a second, its way of
going turned with it: one standing off the point orbits, one with a `pull` is drawn in as it goes round,
a whirlpool, and one thrown out with `speed` runs out along an arm that turns, a spiral.

`shape` draws a particle as one of particle2d's own soft pictures, with no sheet, no art and no
catalogue entry: `puff` and `puff2` (smoke), `glow` (a round of light), `halo` (a glowing ring),
`spark` (a hot dot), `streak` (a line of light, for `stretch`), `ring` (a thin shockwave), `star`
(a four-pointed flare), and `bolt` and `bolt2` (a jagged, forked line of light from one edge to the
other, lightning for a `beam`). They are particle3d's (`plugins/particle3d/shapes.ts`), drawn in
numbers into one white strip, the shape in its alpha, so `tint` and `gain` colour them; each is a stage
pixel on a side times its `size`. A layer with neither `shape` nor `sheet` is a hard square; with both
it throws.

Any other field of an emitter is a word, drawn by what a mod delivers for it
(`world.particle2d.mods.behaviors`, each plugin exporting `behaviors()` → `{ <word>: Drawer }`) in place
of sprites. A Drawer is `check(data, what, world)` and `draw(data, { plugins, name })` → a Drawing,
`put(list)` once a frame with each particle's `{ at, rot, size, pick, layer, depth }`, and `dispose()`.
A word nothing delivers throws, naming `world.particle2d.mods.behaviors`.

`bounce` (0 to 1) makes a particle bounce, its whole speed times the bounce at each strike, and a
particle with `spin` then turning as a ball of its size rolling at its speed along the surface: off the
spawn's `floor`, coming to rest when its bounce is less than a step's fall, and off every solid the
plugins `world.particle2d.mods.solids` names hand over, each exporting `solids(plugins)`, asked once a
frame, which answers where a line on the stage first meets something (`{ t, normal }`). tilemap's
(`tilemap.particle2d.ts`) is the map's walls, so sparks skitter off a wall and a one-way ledge catches
what falls on it. Without `bounce` a particle passes through solids and rests on the floor.

`carry: name` makes each particle of the layer an emitter: it carries its own running copy of that
effect, whose point is the particle's place on the stage every frame as it flies, falls and slows,
whose `dir` is the way it goes, and which stops emitting the frame the particle dies. An explosion
flings chunks that each trail smoke, and each chunk's smoke may carry sparks of its own, as deep as the
file nests. An effect that comes back to itself by carrying throws when the file is read, naming the
path round. A carried effect's `to` is the point of the effect its particle is of, so a `beam` layer
of it reaches from the particle back to where it was thrown from: lightning, drawn as `bolt` and
`bolt2`:

```json
"storm": [{ "every": 0.15, "life": [0.15, 0.35], "size": [0, 0], "box": [-40, -40, 40, 40], "carry": "arc" }],
"arc": [
  { "every": 0.06, "life": [0.04, 0.07], "shape": "bolt", "beam": true, "size": [8, 16], "gain": 3, "add": true },
  { "after": 0.03, "every": 0.06, "life": [0.04, 0.07], "shape": "bolt2", "beam": true, "size": [8, 16], "gain": 3, "add": true }
]
```

A layer `{ "lamp": { intensity, distance, at?, tint?, flicker? } }` throws no particles: it is one
light at the effect's point (and `at` off it), riding with it, for as long as the effect runs, keeping
an effect of lamps alone running for its `life`. `intensity` is how much of its colour it adds at its
middle (0 to 1), `distance` how far it reaches along the ground in the world's steps, as a light2d
light's radius, and `flicker` (0 to 1) wavers it like a flame's. light2d draws them where the scene
says `world.light2d.mods: { lights: ['particle2d'] }` (`particle2d.light2d.ts`); `lamps` on the page is
every lamp shining this frame. A torch is a lamp and its flames in one effect.

### Force generators

`g`, `drag`, `pull` and `swirl` are a layer's forces: each is one field of the layer, so a layer has one
of each, and they reach that layer's particles alone. A force generator is forces kept apart from any
layer, by name, in the file's `forceGenerators`. It is a list of entries, each any of `g`, `drag`,
`pull` and `swirl`, and `at`, the point its pull draws toward and its swirl turns about, in pixels off
the point a particle was thrown from. A layer names the generators it is in and how hard each acts on
its particles:

```json
"forceGenerators": {
  "drain": [{ "pull": 40, "at": [0, 30] }, { "swirl": 1.5 }],
  "inward": [{ "pull": 1 }]
},
"effects": {
  "smoke": [{ "every": 0.15, "life": [4, 4], "shape": "puff", "size": [10, 16], "box": [30, -4, 36, 4], "forces": { "drain": 1 } }],
  "streaks": [{ "every": 0.03, "life": [2, 2], "shape": "streak", "stretch": true, "drag": 0.7, "forces": { "inward": 300, "drain": 0.2 } }]
}
```

Every entry of a generator acts on every particle of a layer in it, times the layer's strength, beside
the layer's own forces. One generator moves as many layers as name it, a layer is in as many as it
names, and a generator of two entries is two pulls to two points or two swirls about two points, which
one layer's fields cannot say. A strength written `[min, max]` is rolled for each particle between the
two, `"forces": { "blastwave": [200, 800] }`, so the particles of one layer are thrown each a little
differently and fill a disc where one strength would lay them all on its ring.

An entry has more than a layer's forces, so many layers can share one air:

- `direction: [x, y]`: a push along that vector, as hard as it is long (px/s²). `[0, 600]` is a
  gravity down the stage, `[80, 0]` a wind to the right.
- `anchor`: what `at` is off. `"particle"` (the default) is where each particle was thrown from;
  `"effect"` is the point of the effect thrown, and for a particle of a carried effect the point of the
  effect the carrying began from, so every particle, however deep it is carried, shares one centre.
- `range`: pixels off the centre past which the entry reaches nothing.
- `falloff`: how it weakens toward the edge of its `range`: (1 − distance / range) to the falloff. 0
  is the whole of it up to the edge, 1 fades evenly, 2 more at the middle.
- `noiseFrequency`, `noiseAmplitude`: a still field of noise the particles fly through (particle3d's
  `noise.ts`, on its plane z = 0), which scales how hard the entry acts where each particle is, 1 +
  amplitude × the field (−1 to 1) at its place × frequency. 0 amplitude is the force the same everywhere.
- `turbulence`: a push along a second noise field, one of directions (`noise.ts`'s `curl2`), that many
  px/s² hard, changing over 1 / `noiseFrequency` pixels. Particles flying through it are turned and
  folded and never gathered to a point, so smoke billows. It is the one noise that moves a particle.
- `noiseScroll: [x, y]`: pixels a second both noise fields move, from the moment the effect is thrown,
  so a particle standing still is pushed a different way from one moment to the next.
- `wind: [x, y]`: the speed of the air the entry's drag is in, px/s. Its drag sheds a particle's speed
  against that air, so the particle is carried up to the wind's speed and rides it. It needs a `drag` or
  a `dragBySpeed`.
- `dragBySpeed`: more drag the faster a particle goes through the air, that much more of its speed shed
  a second for each px/s of it. A fast particle is stopped hard and a slow one drifts on.
- `shell`: pixels off the centre. The entry's `pull` draws a particle toward the circle of that radius,
  out from inside it and in from outside it, so particles settle on a ring.
- `toAxis`: the entry's `pull` draws a particle toward the nearest point of the line through the centre
  along its `axis` (`[x, y]`, else the layer's `dir`, else the spawn's, else straight up the screen): a
  column, where a pull to a point makes a ball. With `shell`, a band either side of the line.
- `overLife: [[part, times], ...]`: how hard the entry acts on a particle over that particle's life, as
  `grows` is written. `[[0, 1], [0.2, 0]]` lets go of it a fifth of the way through.
- `overAge: [[seconds, times], ...]`: how hard the entry acts over the age of the effect thrown.
  `[[0, 1], [0.1, 0]]` is an impulse: a blast that pushes for a tenth of a second and is gone, so what is
  born after it is left alone.

The range, falloff, noise amplitude, `overLife` and `overAge` scale every force of the entry. A blast's
push out is a negative `pull` anchored to the effect with a short `range`, a `falloff` and an `overAge`
that ends it; the air everything slows in is a `drag` with a `dragBySpeed`, and a `wind` when it moves;
one updraft that lifts the fire and the smoke alike is a `direction` up the stage both are in, with a
`turbulence` that folds the rising smoke into billows; and the column the smoke is drawn up is a `pull`
to the axis.

```json
"forceGenerators": {
  "blastwave": [{ "pull": -2000, "anchor": "effect", "range": 120, "falloff": 2, "overAge": [[0, 1], [0.15, 0]] }],
  "air": [{ "drag": 1, "dragBySpeed": 0.006, "wind": [20, 0] }],
  "buoyancy": [{ "direction": [0, -80], "turbulence": 100, "noiseFrequency": 0.03, "noiseScroll": [0, -15] }],
  "column": [{ "pull": 45, "anchor": "effect", "toAxis": true, "axis": [0, -1], "range": 240, "falloff": 1 }]
}
```

### Drivers

The file's `drivers` are numbers by name. Any number of a layer, a lamp, an `{ effect, at }` or a force
generator's entry, a number inside a range, a point or a box too, may be written as a string in place
of the number: an expression of the drivers, read once when the file is and worked out once a frame.

```json
"drivers": { "amplitude": 1, "rate": "max(amplitude, 0.05)" },
"effects": {
  "sparks": [{ "every": "0.2 / rate", "life": [0.8, 1.4], "shape": "spark", "size": [3, 5], "speed": [80, "160 * amplitude"] }],
  "light": [{ "lamp": { "intensity": "0.4 * amplitude", "distance": 4 } }]
}
```

One driver written moves every number that names it, in the particles already in the air too. A driver
may be an expression of other drivers and of `time`, the seconds the page's particle2d has run. An
expression is numbers, names, `+ - * /`, comparisons, `and`, `or`, `not`, `c ? a : b`, `pi`, and the
functions `min`, `max`, `abs`, `floor`, `ceil`, `trunc`, `round`, `sin`, `cos`, `tan`, `asin`, `acos`,
`atan`, `atan2`, `exp`, `log`, `sqrt`, `pow`, `fmod`, `radians`, `degrees`, `lerp`, `clamp` and
`smoothstep` (particle3d's `drivers.ts`, which both plugins read their files by). A file with no string
where a number goes plays as it always did, and what is not a number (`sheet`, `clip`, `shape`,
`carry`, a field that is on or off, a word's numbers) is never driven.

A game writes a driver while it runs. On the page, `plugins.particle2d.drive('amplitude', 2)` holds it
at 2 and `drive('amplitude')` lets it go back to the file's; `plugins.particle2d.drivers` is every
driver's value this frame. From a rule, `drive(w, 'amplitude', 2)` (`particle2d.sim.ts`) writes it on
the ledger row, so every seat's page is driven alike. The page's own is over the row's, and the row's
over the file's. An expression that names no driver of the file throws when the file is read; a value
that is not a finite number, or is outside what its field takes, throws the frame it is.

One effect is driven apart from the rest by its own `drivers`: `fx.drivers.slip = 3` on the effect
`emit` hands back, `{ drivers: { slip: 3 } }` in a spawn, or `drivers` written on a rule's ledger entry.
They are over the page's, for that effect alone and every effect its particles carry, so two karts that
each hand their own `speed` and `slip` to their own exhaust and dust each throw by their own, from the
one effects file. An effect thrown where another lands takes a copy of the landing one's unless its
land entry gives its own.

A driven `every` paces a stream from its last burst at the `every` of now, so it quickens or slows at
once. Driven to 0 it holds the stream without ending it: nothing is thrown, the first burst neither,
and the frame it is above 0 again the stream bursts at once and goes on from then, with nothing rolled
for the time it was held. A wheel's dust written `"every": "speed > 1 ? 0.06 : 0"` is quiet while the
wheel stands and starts the moment it rolls.

### Attachments

The plugins `world.particle2d.mods.sources` lists hand particle2d their sources each frame: points
that throw, each with a `key`, a word (`on`), what it is `of`, its world point `at`, the `dir` it throws
along on the stage, its `floor`, and its own drivers. `world.particle2d.attach` is the list of what they
throw:

```json
"attach": [
  { "on": "wheel", "effect": "dust" },
  { "on": "wheel", "effect": "mud", "when": "wet and moving" },
  { "on": "exhaust", "of": "truck", "effect": "diesel" }
]
```

Each attachment keeps one effect running on every source of its word (of its `of`, when it gives
one), moved and driven by the source alone every frame, while its `when` (an expression of the
drivers) holds; the frame it does not, or the source is gone, the effect stops and its particles live
out their lives. Every driver a source hands is a driver of the effects file.

A spawn's `scale` scales every length; `floor` stops particles at a height above the ground under the
effect's point, found again each frame; `from` rides the effect on a row's `pos`; `fly` carries the
point from `at` to `to`; `land` throws effects where it lands; `layer` draws it on another render2d
layer; `drivers` drive it alone.

## Using it

1. List `particle2d` before `render2d` (after it, particles lag a frame and that throws), add one
   `particle2d` row (`{ "next": 0, "live": [] }`), and give `world.particle2d: { effects, hold }`,
   with `mods: { solids: ['tilemap'] }` for particles that bounce off the map's walls, and `attach`
   with `mods: { sources: [...] }` for effects thrown from other plugins' sources.
2. Write the effects file and catalogue it, with any sheets it names.
3. For lamps, list `light2d` after `particle2d` and give it `mods: { lights: ['particle2d'] }`.
4. In a rule: `emit(w, 'explosion', me.data.pos, { scale: 2, land: [{ effect: 'smoke' }] })`. On the
   page: `plugins.particle2d.emit('sparkle', at, { seed })`; `plugins.particle2d.has(name)` once the
   file has been read.

## Plugins it works with

- **render2d**: the layers particles are drawn on and the projection of each world point.
- **loader**: the effects file, the files it lists, and the sheets its emitters draw from (`play`, `clip`).
- **light2d**: `particle2d.light2d.ts` hands it every `lamp`, which it draws in its darkness.
- **tilemap**: `tilemap.particle2d.ts` hands over the map's walls as the `solids` a `bounce` bounces off.
- **sprite2d**: a thing's sprite at the same depth is drawn under its effect.
- **particle3d** is the 3D counterpart, whose shapes, noise and drivers particle2d reads too.

## Keywords

particles, particle system, particle effects, VFX, emitter, burst, explosion, sparks, smoke, dust,
fire, blood, magic, muzzle flash, tracer, beam, laser, lightning, trail, projectile, impact, landing
effect, gravity, drag, swirl, vortex, whirlpool, orbit, spiral, bounce, force generators, turbulence,
wind, drivers, lamps, attachments, spread, fade, additive blending, glow, stretch, sprite sheet
particles, pixel art, deterministic particles, seeded, late join, ledger, render2d, PixiJS, `emit`,
`entry`, `drive`, `world.particle2d`
