# particle3d

3D particle effects for render3d: camera-facing quads from sheets, from particle3d's own soft shapes
(smoke puffs, glows, halos, sparks, streaks, rings, flares) or flat squares, bursts and
streams with speed, spread, gravity, drag, pull, swirl round a line, pacing, spin, tint that cools, fade, additive
light and bloom-bright gain, stretch along the motion, beams and tracers to a target, particles
that carry effects of their own (flung chunks trailing smoke, nested as deep as wanted), effects
that fly and throw more where they land, effects that ride on a
row, and every seat drawing the same particles, all in one draw per sheet, smoke and light sorted
by how far they are from the camera, so smoke in front of a light hides it from any side.

## Why use it

Use particle3d for explosions, muzzle flashes, sparks, smoke, dust kicked up by wheels, exhaust,
blood and gore, magic, tracers and lasers, rain splashes, embers, a smouldering wreck, a comet's
trail. A particle is drawn and never read by a rule, so no particle is a row: a rule says once which
effect, where and for how long, and each page draws the rest from the same seed.

## How it works

**Server half (`particle3d.sim.ts`).** One `particle3d` row is the ledger: `next` and `live` and
nothing else. `emit(w, effect, at, spawn)` adds an entry at a world point `[x, y, z]` in metres (y up)
with the spawn's `life`, `dir`, `to`, `tint`, `scale`, `floor`, `from`, `fly`, `land`, and hands it
back; `entry(w, id)` finds it again, and a rule moves it by writing `at` or stops it by writing
`life`. Each step ages every entry and drops those past their life, or past `world.particle3d.hold`
when that is longer, so a page that takes two packets in a frame still sees it. An entry `from` a row
stays while the row is there.

**Browser half (`particle3d.plugin.ts`).** The page's own ledger of live effects. It takes each
ledger entry the first frame it sees it (rolling bursts it missed, so a late page draws what an
early one does), and anything on the page can `emit(...)` an effect of its own (dismember3d's gore),
seeded or not. `emit` hands the effect back: writing its `at`, `dir` or `to` moves it, `life` stops
it, `floor` is the height its particles rest on, and writing into its `drivers` drives it alone
(Drivers, below). Effects thrown from what other plugins know are attachments (Attachments, below). Every particle is a quad facing the camera; all
the particles on one page of one sheet, or of particle3d's own shapes, are one mesh whose buffers are
written every frame, the farthest from the camera first. A particle laid over what is behind it and
one that adds its light (`add`) are in that one mesh and that one order, so smoke nearer the camera than
a light hides it and smoke behind it does not. Particles of two sheets are two meshes, each in that
order within itself.

The effects are a data file (the loader entry `world.particle3d.effects` names) with `cap`,
`alphaTest`, `ppm` (sheet pixels per metre) and `effects`, each a list of layers. A layer
`{ "effect": name, "at"? }` reuses another effect; every other layer is an emitter, in metres and
seconds: `n`, `every`, `after`, `life` or `lasts`, `skip`, `sheet` and `clip` (with `play`), `shape`, `size`,
`grow` or `grows`, `dir`, `spread`, `speed`, `outward`, `jitter`, `box`, `g`, `drag`, `pull`, `swirl` and
`axis` (carried round the point it was thrown from, a vortex or a whirlpool), `pace`, `bounce`, `follow`,
`flips`, `tint` and `tint1` or `tints`, `gain` (above 1 brighter than white, for render3d's `bloom`),
`a0`, `a1` and `fade` or `alphas`, `spin`, `origin`, `add`, `stretch`, `face`, `beam`, `carry` and
`inherit`. An unknown field throws, naming it.

`grows`, `tints` and `alphas` are a particle's size, colour and opacity over its life, each a list of
stops `[part, value]` in order, `part` from 0 at its birth to 1 at its death, a straight line from each
stop to the next. They are written in place of `grow`, of `tint` and `tint1`, and of `a0`, `a1` and
`fade`, which say only a start and an end:

```json
{ "life": [0.6, 1.4], "shape": "puff",
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

`shape` draws a particle as one of particle3d's own soft pictures, with no sheet, no art and no
catalogue entry: `puff` and `puff2` (smoke), `glow` (a round of light), `halo` (a glowing ring),
`spark` (a hot dot), `streak` (a line of light, for `stretch`), `ring` (a thin shockwave), `star`
(a four-pointed flare), and `bolt` and `bolt2` (a jagged, forked line of light from one edge to the
other, lightning for a `beam`). They are drawn in numbers by `shapes.ts` into one white strip, the shape in its
alpha, so `tint` and `gain` colour them and every particle drawn as a shape is in one draw. A layer with neither
`shape` nor `sheet` is a hard square; with both it throws.

Any other field of an emitter is a word, drawn by what a mod delivers for it
(`world.particle3d.mods.behaviors`, each plugin exporting `behaviors()` → `{ <word>: Drawer }`) in place
of quads. instances3d delivers `mesh` (`instances3d.particle3d.ts`): `"mesh": { rows, look, seed? }`
draws each particle as an instanced mesh, so a layer of debris is rocks that tumble with its `spin`,
fall with its `g` and bounce with its `bounce`. A Drawer is `check(data, what, world)` and
`draw(data, { plugins, name })` → a Drawing, `put(list)` once a frame with each particle's `{ at, rot,
size, pick }`, and `dispose()`. A word nothing delivers throws, naming `world.particle3d.mods.behaviors`.

`bounce` (0 to 1) makes a particle bounce, its whole speed times the bounce at each strike, and a
particle with `spin` then turning as a ball of its size rolling at its speed along the surface, so it
tumbles as fast as it skids and stops turning as it stops: off the spawn's `floor`, coming to rest when its bounce is
less than a step's fall, and off every solid the plugins `world.particle3d.mods.solids` names hand over,
each exporting `solids(plugins)`, asked once a frame, which answers where a line first meets something
(`{ t, normal }`). shapes3d's (`shapes3d.particle3d.ts`) is its boxes, planes, hyperplanes and
cylinders, so sparks skitter off a crate and debris rattles down a ramp. Without `bounce` a particle
passes through solids and rests on the floor.

`carry: name` makes each particle of the layer an emitter: it carries its own running copy of that
effect, whose point is the particle's place every frame as it flies, falls and slows, whose `dir` is
the way it goes, and which stops emitting the frame the particle dies. An explosion flings chunks that
each trail smoke, and each chunk's smoke may carry sparks of its own, as deep as the file nests. An
effect that comes back to itself by carrying throws when the file is read, naming the path round.

A carried effect's `to` is the point of the effect its particle is of, kept there every frame, so a
`beam` layer of a carried effect reaches from the particle back to where it was thrown from. Lightning
is that and a shape: a layer of particles that draw nothing (`size` [0, 0]) and live a moment, each
carrying an effect of two `beam` layers drawn as `bolt` and `bolt2`, short-lived and thrown again every
few hundredths of a second, so the bolt flickers and jumps:

```json
"portal": [{ "every": 0.15, "life": [0.15, 0.35], "size": [0, 0], "box": [-1.3, -1.3, 0, 1.3, 1.3, 0.1], "carry": "arc" }],
"arc": [
  { "every": 0.06, "life": [0.04, 0.07], "shape": "bolt", "beam": true, "size": [0.25, 0.5], "gain": 3, "add": true },
  { "after": 0.03, "every": 0.06, "life": [0.04, 0.07], "shape": "bolt2", "beam": true, "size": [0.25, 0.5], "gain": 3, "add": true }
]
```

A bolt's `size` is how far it strays from the straight line, in metres; its length is the gap.
`tools/workshop/assets/effects/portal.json` has it inside its smoke: the carriers are a layer of `ringsmoke`, the
effect each point of its `funnel` carries, so every bolt runs from a spot in a cloud back to that
cloud's middle, and the smoke nearer the camera hides part of it. The same file moves its layers by
three force generators (`turn`, `inward`, `cone`) and four drivers (`amplitude`, `spin`, `draw`,
`storm`), below.

A layer `{ "lamp": { intensity, distance, decay, at?, tint?, shadow?, flicker?, spot? } }` throws no
particles: it is one light at the effect's point (and `at` off it), riding with it, for as long as the
effect runs, keeping an effect of lamps alone running for its `life`. `shadow` casts shadows from
lights3d's atlas, `flicker` (0 to 1) wavers its strength like a flame's, and `spot: { angle, penumbra }`
makes it a spot light pointed along the effect's `dir`, or straight down. A torch is a lamp and its
flames in one effect. Without lights3d in the scene a lamp is not drawn.

### Force generators

`g`, `drag`, `pull` and `swirl` are a layer's forces: each is one field of the layer, so a layer has one
of each, and they reach that layer's particles alone. A force generator is forces kept apart from any
layer, by name, in the file's `forceGenerators`. It is a list of entries, each any of `g`, `drag`,
`pull`, `swirl` and `axis`, and `at`, the point its pull draws toward and its swirl turns about, in
metres off the point a particle was thrown from. A layer names the generators it is in and how hard
each acts on its particles:

```json
"forceGenerators": {
  "cone": [{ "pull": 0.24, "at": [0, 0, -1.7] }, { "swirl": 1.5, "axis": [0, 0, 1] }],
  "inward": [{ "pull": 1 }]
},
"effects": {
  "smoke": [{ "every": 0.15, "life": [4, 4], "shape": "puff", "box": [1, 0, 0.2, 1.15, 0, 0.5], "forces": { "cone": 1 } }],
  "streaks": [{ "every": 0.03, "life": [2, 2], "shape": "streak", "drag": 0.7, "forces": { "inward": 11.5, "cone": 0.2 } }]
}
```

Every entry of a generator acts on every particle of a layer in it, times the layer's strength, beside
the layer's own forces. One generator moves as many layers as name it, a layer is in as many as it
names, and a generator of two entries is two pulls to two points or two swirls about two lines, which
one layer's fields cannot say. A strength written `[min, max]` is rolled for each particle between the
two, `"forces": { "blastwave": [200, 800] }`, so the particles of one layer are thrown each a little
differently and fill a ball where one strength would lay them all on its shell.

An entry has more than a layer's forces, so many layers can share one air:

- `direction: [x, y, z]`: a push along that vector, as hard as it is long (m/s²). `[0, -9.8, 0]` is
  gravity, `[3, 0, 0]` a wind.
- `anchor`: what `at` is off. `"particle"` (the default) is where each particle was thrown from;
  `"effect"` is the point of the effect thrown, and for a particle of a carried effect the point of the
  effect the carrying began from, so every particle, however deep it is carried, shares one centre.
- `range`: metres off the centre past which the entry reaches nothing.
- `falloff`: how it weakens toward the edge of its `range`: (1 − distance / range) to the falloff. 0
  is the whole of it up to the edge, 1 fades evenly, 2 more at the middle.
- `noiseFrequency`, `noiseAmplitude`: a still field of noise the particles fly through (`noise.ts`),
  which scales how hard the entry acts where each particle is, 1 + amplitude × the field (−1 to 1) at
  its place × frequency. 0 amplitude is the force the same everywhere.
- `turbulence`: a push along a second noise field, one of directions (`noise.ts`'s `curl`), that many
  m/s² hard, changing over 1 / `noiseFrequency` metres. Particles flying through it are turned and
  folded and never gathered to a point, so smoke billows. It is the one noise that moves a particle.
- `noiseScroll: [x, y, z]`: metres a second both noise fields move, from the moment the effect is thrown,
  so a particle standing still is pushed a different way from one moment to the next.
- `wind: [x, y, z]`: the speed of the air the entry's drag is in, m/s. Its drag sheds a particle's speed
  against that air, so the particle is carried up to the wind's speed and rides it. It needs a `drag` or
  a `dragBySpeed`.
- `dragBySpeed`: more drag the faster a particle goes through the air, that much more of its speed shed a
  second for each m/s of it. A fast particle is stopped hard and a slow one drifts on.
- `shell`: metres off the centre. The entry's `pull` draws a particle toward the sphere of that radius,
  out from inside it and in from outside it, so particles settle on a shell.
- `toAxis`: the entry's `pull` draws a particle toward the nearest point of the line through the centre
  along its `axis`: a column, where a pull to a point makes a ball. With `shell`, a tube round the line.
- `overLife: [[part, times], ...]`: how hard the entry acts on a particle over that particle's life, as
  `grows` is written. `[[0, 1], [0.2, 0]]` lets go of it a fifth of the way through.
- `overAge: [[seconds, times], ...]`: how hard the entry acts over the age of the effect thrown.
  `[[0, 1], [0.1, 0]]` is an impulse: a blast that pushes for a tenth of a second and is gone, so what is
  born after it is left alone.

The range, falloff, noise amplitude, `overLife` and `overAge` scale every force of the entry. A blast's
push out is a negative `pull` anchored to the effect with a short `range`, a `falloff` and an `overAge`
that ends it; the air everything slows in is a `drag` with a `dragBySpeed`, and a `wind` when it moves;
one updraft that lifts the fire and the smoke alike is a `direction` both are in, with a `turbulence`
that folds the rising smoke into billows; and the column the smoke is drawn up is a `pull` to the axis.

```json
"forceGenerators": {
  "blastwave": [{ "pull": -60, "anchor": "effect", "range": 4, "falloff": 2, "overAge": [[0, 1], [0.15, 0]] }],
  "air": [{ "drag": 1, "dragBySpeed": 0.2, "wind": [0.6, 0, 0] }],
  "buoyancy": [{ "direction": [0, 2.5, 0], "turbulence": 3, "noiseFrequency": 0.8, "noiseScroll": [0, 0.5, 0] }],
  "column": [{ "pull": 1.5, "anchor": "effect", "toAxis": true, "axis": [0, 1, 0], "range": 8, "falloff": 1 }]
}
```

`tools/workshop/assets/effects/explosions/blast.json` is a ground burst built this way: a flash, a
fireball, dust, dirt, rocks, spark jets and smoke, every one moved by five generators and none by a
force of its own.

### Drivers

The file's `drivers` are numbers by name. Any number of a layer, a lamp, an `{ effect, at }` or a force
generator's entry, a number inside a range, a point or a box too, may be written as a string in place
of the number: an expression of the drivers, read once when the file is and worked out once a frame.

```json
"drivers": { "amplitude": 1, "rate": "max(amplitude, 0.05)" },
"effects": {
  "sparks": [{ "every": "0.2 / rate", "life": [0.8, 1.4], "shape": "spark", "speed": [2.5, "5 * amplitude"] }],
  "light": [{ "lamp": { "intensity": "40 * amplitude", "distance": 10, "decay": 2 } }]
}
```

One driver written moves every number that names it, in the particles already in the air too. A driver
may be an expression of other drivers and of `time`, the seconds the page's particle3d has run. An
expression is numbers, names, `+ - * /`, comparisons, `and`, `or`, `not`, `c ? a : b`, `pi`, and the
functions `min`, `max`, `abs`, `floor`, `ceil`, `trunc`, `round`, `sin`, `cos`, `tan`, `asin`, `acos`,
`atan`, `atan2`, `exp`, `log`, `sqrt`, `pow`, `fmod`, `radians`, `degrees`, `lerp`, `clamp` and
`smoothstep` (`drivers.ts`). A file with no string where a number goes plays as it always did, and what
is not a number (`sheet`, `clip`, `shape`, `carry`, a field that is on or off, a word's numbers) is
never driven.

A game writes a driver while it runs. On the page, `plugins.particle3d.drive('amplitude', 2)` holds it
at 2 and `drive('amplitude')` lets it go back to the file's; `plugins.particle3d.drivers` is every
driver's value this frame. From a rule, `drive(w, 'amplitude', 2)` (`particle3d.sim.ts`) writes it on
the ledger row, so every seat's page is driven alike. The page's own is over the row's, and the row's
over the file's. An expression that names no driver of the file throws when the file is read; a value
that is not a finite number, or is outside what its field takes, throws the frame it is.

One effect is driven apart from the rest by its own `drivers`: `fx.drivers.slip = 3` on the effect
`emit` hands back, `{ drivers: { slip: 3 } }` in a spawn, or `drivers` written on a rule's ledger entry.
They are over the page's, for that effect alone and every effect its particles carry, so two cars that
each hand their own `rpm` and `slip` to their own exhaust and dust each throw by their own, from the
one effects file. An effect thrown where another lands takes a copy of the landing one's unless its
land entry gives its own. An effect with no driver of its own plays from the copy of its layers every
such effect shares; one with any plays from a copy of its own, made the first frame it has one.

A driven `every` paces a stream from its last burst at the `every` of now, so it quickens or slows at
once. Driven to 0 it holds the stream without ending it: nothing is thrown, the first burst neither,
and the frame it is above 0 again the stream bursts at once and goes on from then, with nothing rolled
for the time it was held. A wheel's dust written `"every": "speed > 1 ? 0.06 : 0"` is quiet while the
wheel stands and starts the moment it rolls.

### Attachments

The plugins `world.particle3d.mods.sources` lists hand particle3d their sources each frame: points
that throw, each with a `key`, a word (`on`), what it is `of`, its `at`, `dir` and `floor`, and its
own drivers. box3dvehicle's are a `wheel` under each wheel and an `exhaust` at each tailpipe, `of` the
car's vehicle, driven by the car (its `load`, `slip`, `slide`, the ground's `tint`, and the rest).
`world.particle3d.attach` is the list of what they throw:

```json
"attach": [
  { "on": "wheel", "effect": "tyre" },
  { "on": "wheel", "effect": "mud", "when": "wet and grounded" },
  { "on": "exhaust", "of": "truck", "effect": "diesel" }
]
```

Each attachment keeps one effect running on every source of its word (of its `of`, when it gives
one), moved and driven by the source alone every frame, while its `when` (an expression of the
drivers) holds; the frame it does not, or the source is gone, the effect stops and its particles live
out their lives. Every driver a source hands is a driver of the effects file.

## Using it

1. List `particle3d` before `render3d` (after it, particles face last frame's camera and that
   throws), add one `particle3d` row (`{ "next": 0, "live": [] }`), and give
   `world.particle3d: { effects, hold }`, with `mods: { solids: ['shapes3d'] }` for particles that
   bounce off shapes3d's shapes, and `attach` with `mods: { sources: [...] }` for effects thrown from
   other plugins' sources.
2. Write the effects file and catalogue it, with any sheets it names.
3. In a rule: `emit(w, 'blast', pos, { scale: 2, land: [{ effect: 'smoke' }] })`. On the page:
   `plugins.particle3d.emit('spark', at, { seed })`; `plugins.particle3d.has(name)`.

## Plugins it works with

- **render3d**: the scene and camera the quads face, and its `bloom` for bright particles.
- **shapes3d**: `shapes3d.particle3d.ts` hands over its shapes as the `solids` a `bounce` bounces off.
- **instances3d**: `instances3d.particle3d.ts` delivers the `mesh` word, particles drawn as instanced meshes.
- **skydome3d**: `skydome3d.particle3d.ts` (`world.particle3d.mods: { light: 'skydome3d' }`, skydome3d listed
  before particle3d) hands the sky's light, a share of its brightest, which every particle's colour is times:
  particles are unlit, so without it they stand out at night. A fire that must shine at night is a `lamp`.
- **lights3d**: draws every `lamp`; where the scene does not list lights3d, particle3d draws no lamp.
- **loader**: the effects file and the sheets.
- **box3dvehicle**: `box3dvehicle.particle3d.ts` hands every car's wheels and tailpipes as `sources`,
  each driven by its car and wheel, for `attach`.
- **dismember3d**: its sever burst and drip are particle3d effects.
- **lod3d**: `particle3d.lod3d.ts` (`world.lod3d.mods: { behaviors: [..., 'particle3d'] }`) delivers the
  `emitter` word, so a lod3d layer runs an effect on each instance it holds near the camera: fireflies
  round demo_lod3d's firs.
- **ui3d**: `particle3d.ui3d.ts` (`world.ui3d.mods: { behaviors: [..., 'particle3d'] }`) delivers the
  `particles` word, `[{ effect, at, drivers? }]`: each effect kept running at `at` in a ui3d thing's frame
  for as long as it is shown, ended the frame it is taken out, and each of its `drivers` held at the
  thing's `selected`, `chosen` or `age`, so a title's embers flare as the pointer comes onto it. ui3d is
  listed before particle3d. The particles are drawn in the world, under ui3d's overlay.
- **particle2d** is the 2D counterpart: the same fields, force generators, drivers, carried effects,
  lamps, words and attachments on render2d's stage, its shapes this plugin's `shapes.ts`, its noise
  `noise.ts`'s and its expressions `drivers.ts`'s.

## Keywords

particles, particle system, 3D particles, VFX, billboards, camera-facing quads, emitter, burst,
explosion, muzzle flash, sparks, smoke, dust, exhaust, fire, embers, blood, gore, magic, tracer,
beam, laser, trail, impact, gravity, drag, swirl, vortex, whirlpool, portal, spiral, orbit, spread, fade, additive blending, bloom, HDR, glow,
sprite sheet particles, batching, one draw call, deterministic particles, seeded, late join,
ledger, three.js, render3d, `emit`, `entry`, `world.particle3d`
