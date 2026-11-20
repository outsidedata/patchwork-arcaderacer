// The browser half of particle3d: the page's ledger of live effects, each effect's particles, and
// their drawing. An effect is spawned at a point with a lifetime, and this plugin runs it from then
// until its last particle is gone; whoever spawned it does nothing more.
//
// Two things spawn one. A rule, through `emit` in `particle3d.sim.ts`: the entry is on the ledger
// row, and this half takes it the first frame it sees it, at the age it has on the row, and while
// the row still holds it follows the `at`, `dir`, `to`, `life` and `drivers` the rule may have written
// there. Anything in the page — an actor, a local actor, another plugin — through this half's `emit`,
// which hands the effect back: writing its `at`, `dir` or `to` moves it, writing its `life` stops it,
// and writing its `drivers` drives it alone: `fx.drivers.slip = 3` holds the file's driver `slip` at
// 3 for this effect and the effects its particles carry, over the ledger row's and the page's, while
// every other effect plays at the page's (Drivers, below). Its `drivers` are `{}` as it is handed back,
// or a copy of the spawn's.
// Its rolls come from `seed` when the spawn gives one, so pages that emit one effect with one seed
// draw the same particles, and from `Math.random` when it gives none. `has(name)` says whether the
// effects file has an effect of that name, false until the file has been read; this half asks the
// loader for it in its `tick`, before any actor ticks, so an actor can ask. `advance(plugins, seconds)`
// runs every effect on that many seconds at once, a frame of the engine's `dt` at a time (`step`,
// what `afterTick` runs each frame), so a shot shows effects as they stand once they have run a while.
//
// The space is the world's, in metres: y is up, and a direction is a vector [x, y, z], so [0, 1, 0]
// is straight up.
//
// The effects are in a data file, the entry of the scene's `loader` catalogue that
// `world.particle3d.effects` names, which this half reads off the scene (the ledger row goes to every seat
// every step, so neither the file nor its name is on the row). It holds `cap`, the most
// particles this page draws at once, past which new ones are dropped; `alphaTest`, 0 when left out;
// for effects drawn from sheets, `ppm`, pixels of a sheet per metre; `files`, other files of effects,
// each a path from this file's folder, whose effects, force generators and drivers are this file's too;
// `forceGenerators` and `drivers` (Force generators and Drivers, below); `flipbooks`, what
// tools/workshop/flipbooks.py bakes the file's flipbook sheets from, which particle3d does not read; and `effects`, each a list of
// layers. A layer `{ "effect": name }` stands for every layer of that effect,
// whichever of the files it is in, so effects are built
// out of effects, and `{ "effect": name, "at": [x, y, z] }` for every layer of it thrown from x, y,
// z metres off the point. Every other layer is an emitter, in metres and seconds:
//
//   n        [min, max] particles a burst, 1 when left out. One burst at the effect's start, and
//   every    one more this many seconds after each, while the effect's life lasts.
//   after    the seconds into the effect its first burst is thrown, 0 when left out; `every` counts
//            on from it.
//   life     [min, max] seconds a particle lives; with `lasts` instead, it lives until its effect's
//            life is over, however long that turns out to be: the body of a round carried with its
//            point (`follow`) for as long as the round flies. A layer has one or the other.
//   skip     a particle starts up to this many seconds into its life, so a burst's frames are not all
//            in step.
//   sheet    a loader sheet, and `clip` a clip of it, whose frames play evenly over a particle's
//            life, each its whole frame / `ppm` metres, its pixels where the sheet trimmed them
//            from, filtered as the sheet says; with `play` they play at the sheet's own times for
//            them from its birth instead, round again or held on the last as the clip says. Without
//            one a particle is a flat square one metre on a side.
//   start    [min, max] the part of its clip, 0 to 1, a particle's frames begin at, rolled for each: they
//            play on from there and round past the clip's last frame to its first, so a burst of a
//            flipbook does not show one picture many times over.
//   blend    each frame laid into the next as the particle's time runs between them, so a flipbook of
//            few frames plays smoothly.
//   channels how the channels of a flipbook's picture are drawn, for a sheet whose red, green, blue and
//            alpha are masks a bake wrote and not colours (tools/workshop/flipbooks.py): { value, alpha,
//            hot }, each four weights, one for each channel: its brightness the channels weighed by
//            `value`, its colour's times that; its opacity weighed by `alpha`; and how white-hot it is
//            weighed by `hot`, its colour lifted toward white that much. A smoke whose channels are its
//            light from the right, the top and the left and how much it hides, lit from the upper right,
//            is { "value": [0.55, 0.45, 0, 0], "alpha": [0, 0, 0, 1], "hot": [0, 0, 0, 0] }.
//   erode    [[part, cut], ...] in order, as `alphas` is written: its opacity over its life cut away
//            below `cut`, what is left stretched back to whole, so a puff thins at its wisps first and
//            breaks up before it is gone.
//   shape    one of particle3d's own soft pictures, a metre on a side, which every effects file has
//            with no sheet and no catalogue entry (`shapes.ts` draws them): `puff` and `puff2`,
//            smoke; `glow`, a round of light; `halo`, a glowing ring; `spark`, a hot dot; `streak`, a
//            line of light for a stretched layer; `ring`, a thin shockwave; `star`, a four-pointed
//            flare; `bolt` and `bolt2`, a jagged, forked line of light from the middle of its left
//            edge to the middle of its right, lightning for a `beam`. A layer has a shape or a sheet, not both.
//   size     [min, max] times that, 1 when left out; `grow` times the size at birth is its size at death.
//   grows    [[part, times], ...] in order, in place of `grow`: its size over its life, each `part` from
//            0, its birth, to 1, its death, and `times` its size at birth; a straight line from each to
//            the next, the first's before it and the last's after it. [[0, 0.2], [0.1, 1], [1, 1.4]]
//            swells it fast and then slowly.
//   dir      the direction it is thrown along, else the spawn's `dir`; `spread` the most radians off
//            it; no `spread` throws it any way at all. `speed` [min, max] metres a second.
//   outward  [min, max] metres a second it is thrown straight away from the effect's point, beside its
//            `speed` along `dir`: a particle started off the point by a `box` or a `jitter` goes out
//            along the line from the point through where it starts, so a burst flies apart from its
//            middle. One that starts on the point goes the way `dir` and `spread` aim it.
//   jitter   [x, y, z] metres a particle starts off the point, per axis, the difference of two rolls.
//   box      [x0, y0, z0, x1, y1, z1] metres off the point: a particle starts at a point rolled
//            evenly in it, so a box whose corners are one point starts every particle there.
//   g        metres a second² down, negative rising; `drag` the fraction of its speed shed a second;
//            `pull` metres a second² toward the point it was thrown from, negative away.
//   swirl    radians a second it is carried round the point it was thrown from, about `axis`, its way
//            of going turned with it, so a particle thrown out from the point spirals and one that
//            stands off it orbits; negative turns the other way. With `pull` it is drawn in as it
//            goes round, a whirlpool; with `speed` out from the point, it is flung out in arms.
//   axis     [x, y, z] the line through that point it swirls about, the right-hand way: the layer's
//            `dir`, else the spawn's, else straight up, when left out.
//   pace     [[seconds, k], ...] in order: from that many seconds into its life on, it goes k times
//            as far a step as its speed says, so one that slows in steps and stops is [[t, 0.5],
//            [t2, 0]]; 1 before the first.
//   bounce   from 0 to 1: it bounces off the effect's `floor` and off every solid a mod hands over
//            (`world.particle3d.mods.solids`, below): its speed into the surface mirrored out of it,
//            then its whole speed times the bounce; 0 stops it dead. Its spin is then that of a ball
//            of its size rolling at its speed along the surface, so it tumbles as fast as it skids and
//            stops turning as it stops.
//            Without it a particle passes through solids and rests on the floor.
//   follow   it keeps its place about the effect's point as the point moves, where without it a
//            particle is left where it was thrown.
//   flips    [[seconds, x, y], ...] in order: from that many seconds into its life on it is
//            mirrored across when x is 1 and upside down when y is 1, in its frame's own place, as
//            a sprite's tiles are flipped; neither before the first.
//   tint     its colour, else the spawn's, else white; `tint1` the colour it has cooled to at death,
//            each an sRGB number as a three.js material's colour is.
//   tints    [[part, colour], ...] in order, in place of `tint` and `tint1`: its colour over its life,
//            each `part` from 0 to 1 as `grows`' are, as many colours as the list gives: white hot,
//            then yellow, orange, and black is [[0, 16777215], [0.15, 16769696], [0.5, 16747050], [1, 0]].
//   gain     times its colour's light, 1 when left out: above 1 a particle is brighter than white,
//            light a renderer that blooms (render3d's `bloom`) spills round it, as a flash's is.
//   a0, a1   its opacity at birth and at death, 1 when left out; `fade` the seconds before its death
//            over which it goes from the one to the other, holding `a0` until then, its whole life
//            when left out.
//   alphas   [[part, opacity], ...] in order, in place of `a0`, `a1` and `fade`: its opacity over its
//            life, as `grows` is written: [[0, 0], [0.1, 1], [0.6, 1], [1, 0]] fades it in, holds it and
//            fades it out.
//   spin     the most radians a second it turns, either way, from a turn it was rolled at birth;
//            without it a particle stands upright.
//   origin   the point of a particle, as fractions of its width from the left and of its height from
//            the top, that is on its place: the anchor of its frame when left out, or the middle of
//            a square; [0.5, 1] stands it there, so one that comes to rest on a floor sits on it.
//   add      drawn adding its light; `stretch` turned along the way it is going, with its head on
//            its place (`origin` [1, 0.5] unless it gives one); `face` turned along the effect's `dir`.
//   beam     drawn from the effect's point to its `to`, as long as the gap between them and as thick
//            as its frame at its size, turned about its length to face the camera, wherever the
//            effect is moved: a beam or a tracer that reaches its target. An effect with a beam is
//            spawned with a `to`, or carried (`carry`), which gives it one. Drawn as a `bolt`, it is
//            lightning between the two.
//   carry    the name of an effect each particle carries: thrown at it the moment it is, its point
//            the particle's place every frame as the particle flies, falls and slows, its `dir` the
//            way the particle is going, its `to` the point of the effect the particle is of, so a
//            `beam` of its reaches from the particle back to where it was thrown from, as lightning
//            does from each thing round a middle; its `tint`, `scale` and `floor` the carrier's, its
//            rolls off the carrier's. It goes on emitting while the particle lives and stops the frame it dies,
//            its own particles living out their lives. An effect carried may carry another, as deep as
//            the file likes; one that comes back to itself by carrying, or by naming effects that
//            carry, throws the first frame the file is read, naming the path round.
//   inherit  how much of its effect's speed it starts with, beside its own: 1 the whole of it, 0 (when
//            left out) none. A carried effect's speed is that of the particle carrying it, so what a
//            flung chunk sheds goes on the way the chunk is going; any other effect's is how fast its
//            point is moving, as it flies, follows a row or has its `at` written.
//   forces   { <force generator>: strength, ... }: the force generators of the file its particles are
//            in, each acting on every one of them that many times as hard (Force generators, below). A
//            strength [min, max] is rolled for each particle between the two, so the particles of one
//            layer are thrown, slowed or lifted each a little differently and fill a space where one
//            strength would lay them all on one shell.
//
// Force generators. `g`, `drag`, `pull` and `swirl` are a layer's forces, each one field of the layer, so
// a layer has one of each and they reach its own particles alone. A force generator is forces kept apart
// from any layer, by name, in the file's `forceGenerators`: a list of entries, each any of `g`, `drag`,
// `pull`, `swirl` and `axis`, meaning what they mean on a layer, and `at`, [x, y, z] metres off the point
// a particle was thrown from, times the effect's `scale`, the point its `pull` draws toward and its
// `swirl` turns about. A layer names the generators it is in and how hard each acts, `"forces": { "cone":
// 0.5, "chaos": 2.1 }`: every entry of the generator acts on every particle of the layer, its `g`, `drag`,
// `pull` and `swirl` times that strength, beside the layer's own. So one generator moves many layers, a
// layer is in as many as it names, and a generator of two entries is two pulls to two points or two
// swirls about two lines. An entry's `swirl` with no `axis` turns about the layer's (its `axis`, else its
// `dir`, else the spawn's, else straight up). A generator the file has none of throws, naming the layer.
// An entry has more than a layer's forces:
//
//   direction   [x, y, z] a push along that vector, its length how hard in metres a second a second,
//               times the effect's `scale`: [0, -9.8, 0] is gravity, [3, 0, 0] a wind along x.
//   anchor      what `at` is off: `particle` (when left out), the point each particle was thrown from;
//               `effect`, the point of the effect thrown, which for a particle of a carried effect is
//               the point of the effect the carrying began from, so every particle of it, however
//               deep it is carried, is pulled toward and swirled about the one point.
//   range       metres off that point, times the effect's `scale`, past which none of the entry reaches.
//   falloff     how it weakens toward the edge of its `range`, which it needs: within the range it is
//               (1 - distance / range) to the falloff, so 0 (when left out) is the whole of it up to the
//               edge, 1 fades it evenly, 2 more at the middle. A pull of negative strength anchored to
//               the effect, with a falloff and a short range, is a blast's push out, hardest at the middle.
//   noiseFrequency, noiseAmplitude   a still field of noise over space (`noise.ts`) that the particles
//               fly through, which scales how hard the entry acts where each particle is: 1 +
//               noiseAmplitude times the field there, the field from -1 to 1 and changing over 1 /
//               noiseFrequency metres (1 when left out). An amplitude of 0 (when left out) is the force
//               the same everywhere; 0.5, from half as hard to half as hard again.
//   turbulence  a push along a second noise field, one of directions (`noise.ts`'s `curl`), this many
//               metres a second a second hard, times the effect's `scale`, changing over 1 /
//               noiseFrequency metres: particles are turned and folded as they fly through it, never
//               gathered to a point, so smoke billows. It is the one noise that moves a particle; the
//               amplitude above only scales forces.
//   noiseScroll [x, y, z] metres a second both noise fields move, times the effect's `scale`, from the
//               moment the effect is thrown: a particle standing still is then pushed a different way
//               from one moment to the next. Still when left out.
//   wind        [x, y, z] metres a second, times the effect's `scale`: the speed of the air the entry's
//               drag is in. Its drag sheds a particle's speed against that air in place of its speed
//               over the ground, so a particle is carried up to the wind's speed and then rides it. It
//               needs a `drag` or a `dragBySpeed`.
//   dragBySpeed more drag the faster a particle goes through the air: this much more of its speed shed
//               a second for each metre a second of it, beside `drag`. A fast particle is stopped hard
//               and a slow one drifts on.
//   shell       metres off the centre, times the effect's `scale`: the entry's `pull` draws a particle
//               toward the sphere of that radius about the centre in place of the centre, out from
//               inside it and in from outside it, so particles settle on a shell.
//   toAxis      on, the entry's `pull` draws a particle toward the nearest point of the line through
//               the centre along its `axis` (as its swirl's is found) in place of the centre: a column,
//               where a pull to a point makes a ball. With `shell`, toward a tube of that radius round
//               the line.
//   overLife    [[part, times], ...] in order, as a layer's `grows` is written: how hard the entry acts
//               on a particle over that particle's life, times its strength: [[0, 1], [0.2, 0]] lets go
//               of it a fifth of the way through its life.
//   overAge     [[seconds, times], ...] in order: how hard the entry acts over the age of the effect
//               thrown (for a carried particle, the effect the carrying began from), times its strength,
//               a straight line from each to the next: [[0, 1], [0.1, 0]] is an impulse, a blast that
//               pushes for a tenth of a second and is gone, so what is born after it is left alone.
//
// The range, the falloff, the noise amplitude, `overLife` and `overAge` scale every force of the entry: its
// drag, its pull, its gravity, its direction, its turbulence and its swirl. A falloff with no range, a wind
// with no drag, an anchor that is neither word, a `toAxis` that is not on or off, stops that are not a
// list of pairs in order, and a falloff, a range, a noiseFrequency, a noiseAmplitude, a dragBySpeed or a
// shell below 0 throw, naming the entry.
//
// Drivers. The file's `drivers` are numbers by name, `"drivers": { "amplitude": 1 }`, and a number of a
// layer, of a lamp, of an `{ effect, at }` or of a force generator's entry, a number in a range, a point
// or a box too, may be written as a string in place of the number: an expression of the drivers
// (`drivers.ts` says what one is made of), `"every": "0.2 / amplitude"`. It is read once, when the file
// is, and is its value each frame from then on, in the particles already in the air too, so one driver
// written moves every number that names it. A driver may itself be an expression of other drivers, and of
// `time`, the seconds this page's particle3d has run. A file with no string where a number goes plays as
// it always did. What is not a number is never driven: `sheet`, `clip`, `shape`, `carry`, an `effect`, a
// field that is on or off, and a word's numbers, which are the word's own.
//
// A driver is written while the game runs. On the page, `drive(name, value)` holds it at that number in
// place of the file's, and `drive(name)` lets it go back; `drivers` is every driver's value this frame.
// From a rule, `drive(w, name, value)` (`particle3d.sim.ts`) writes it on the ledger row, so every seat's
// page is driven alike; the page's own `drive` is over the row's, and the row's over the file's.
//
// One effect is driven apart from the rest by its own `drivers`, written on the effect `emit` hands back
// or on a ledger entry, or given in the spawn: its values are over the page's, the row's and the file's,
// for it alone. Two cars each write their own `rpm` and `slip` on their own effects, and each car's
// exhaust and dust play by its own. An effect a particle carries is driven by the same drivers as the
// effect that carries it, the one object, so writing the effect thrown drives the whole chain of what it
// carries; an effect thrown where another lands takes a copy of the landing effect's when its own land
// entry gives none. An effect with no driver of its own plays from the page's copy of its layers, which
// every such effect of its name shares; one with any plays from a copy of its own, its layers, lamps and
// force generators' entries, made the first frame it has one, written from its values each frame, and let
// go when it and every effect driven by the same drivers are over. A driver driven that the file has none
// of throws, naming it, and the effect when it is the effect's.
//
// An expression's value that is not a finite number, or is outside what its field takes (a `bounce` or a
// `flicker` from 0 to 1, an `every` or a lamp's `intensity`, `distance` or `decay` below 0, an `axis` of
// no length), throws the frame it is, naming the effect, the field and the expression. A layer's next
// burst is `every` seconds after its last at the `every` of now, so a driven `every` quickens or slows a
// stream from where it is, at once. An `every` driven to 0 holds the stream: it throws nothing while it is
// 0, its first burst too, its effect runs on while its life lasts, and the frame it is above 0 again it
// bursts at once (a first burst at its `after`, if that is still to come) and `every` on from then, with
// none rolled for the seconds it was held. A page that first sees an effect late rolls the bursts it missed
// at the drivers' values now.
//
// A layer `{ "lamp": { ... } }` throws no particles: it is one light at the effect's point, made the
// first frame the effect runs and taken away when it is over, riding with the point as it moves. It
// keeps the effect running for as long as the effect's `life` lasts, as a stream does, so an effect of
// lamps alone shines for its life; an effect of life 0 shines while its particles fly. Its fields:
//
//   intensity, distance, decay   as three's own lights: its strength, how far it reaches in metres
//            times the effect's `scale`, and its fall off. Each is needed.
//   at       [x, y, z] metres off the point, times the effect's `scale`; moved by an `{ effect, at }`.
//   tint     its colour, an sRGB number as a layer's `tint` is, else the spawn's, else white.
//   shadow   it casts shadows, which lights3d draws from its atlas.
//   flicker  from 0 to 1: its strength wavers between whole and `1 - flicker` of it, a flame's.
//   spot     { angle, penumbra }: a spot light of three's own cone, pointed along the effect's `dir`,
//            or straight down for one spawned with none, in place of a point light.
//
// A lamp is drawn by lights3d, and where the scene does not list lights3d it is not drawn at all.
//
// A field the file has that is none of these throws, naming it, the first frame the file is read and
// the first frame after it is written; so does a `dir`, `jitter`, `box` or `at` of the wrong count of
// numbers, a layer with both a `life` and `lasts` or neither, a lamp layer with more than its `lamp`, a
// lamp field it does not know, a lamp without its `intensity`, `distance` or `decay` or with one below
// 0, a `flicker` outside 0 to 1, a `spot` that is not { angle, penumbra } of an angle above 0 and no
// more than π/2 and a penumbra from 0 to 1, a `bounce` outside 0 to 1, a string where a number goes that
// is no expression or names a driver the file has none of, a string in a field that is on or off, a
// force generator's entry with a field that is none of its own, a layer's `forces` that are not
// strengths by generator, and a field of `world.particle3d` that is not `effects`, `hold`, `attach` or
// `mods`.
//
// Words. Every other field of an emitter is a word, its value that word's numbers, and the layer's
// particles are drawn by the Drawer a mod delivers for that word (`world.particle3d.mods.behaviors`, each
// plugin it names exporting `behaviors()` → `{ <word>: Drawer }`) in place of quads: `"mesh": { ... }`
// draws each particle as one of instances3d's instanced meshes (`instances3d.particle3d.ts`), so debris
// is rocks and shards that tumble, fall and bounce as the layer's particles do. A word no plugin delivers
// throws as an unknown field does, naming `world.particle3d.mods.behaviors`. A Drawer:
//
//   check(data, what, world)    throws a sentence naming `what` for numbers it cannot draw by
//   draw(data, { plugins, name })  a Drawing of those numbers, or undefined while what it draws loads
//
// and a Drawing:
//
//   put(list)   once a frame, every particle drawn by it: `{ at, rot, size, pick }`, its place, its turn
//               [x, y, z, w] (its spin, about the line square to its way and up), its size now, and a
//               number from 0 to 1 rolled at its birth, for the drawer to choose by
//   dispose()   lets go of everything it made
//
// One Drawing is made for each word's numbers the first frame a particle of them is drawn, and kept
// until `close`. A word's particles are drawn at their place, turn and size; their tint and fade are
// the word's own to draw or not.
//
// What a particle that bounces bounces off is handed over by the plugins `world.particle3d.mods.solids`
// lists (`addons/scenemanager`'s mods), each exporting `solids(plugins)`, asked once a frame, which hands
// back a `Meet`: where a line from a point along a unit way first meets something within so many metres,
// `{ t, normal }`, the normal facing out, or undefined. shapes3d's (`shapes3d.particle3d.ts`) is its shapes.
//
// Attachments. Effects thrown from what other plugins know: the plugins `world.particle3d.mods.sources`
// lists, each exporting `sources(plugins)`, asked once a frame, each hand back their sources this frame, a
// list of `Source`s:
//
//   key      what the source is, the same every frame it is there: one effect is kept running on it
//   on       its word, which an attachment names: box3dvehicle's are `wheel` and `exhaust`
//   of       what it is of, which an attachment may name too: box3dvehicle's is the car's vehicle
//   at       its point this frame; `dir` the way it throws, `floor` the height its particles rest at
//   drivers  numbers by name, each a driver of the effects file, which drive its effect alone
//   effect   left out by most: an effect of the file the source throws by itself, kept running on it as an
//            attachment's is, with no attachment written (item3d's are each item's own effects, which its
//            sidecar names); one the file has not throws, naming the source
//
// and `world.particle3d.attach` is a list, each `{ on, effect, of?, when? }`: the effect `effect` thrown
// from every source whose `on` is `on` (and whose `of` is `of`, where the attachment gives one), kept
// running on it, its point, `dir` and `floor` the source's and its drivers the source's alone, every frame,
// a driver the source gives no more going back to the file's; while `when`, an expression of the drivers
// (the source's over the page's), is not 0, from the first frame it holds, and stopped the frame it does
// not, or the source is gone, its particles living out their lives. Two attachments on one word are two
// effects on every source of it. An attachment that is no such entry, names an effect the file has none
// of, or has a `when` that is no expression of its drivers, throws the first frame the file is read; so
// does an `attach` with no `mods.sources`, and a source's driver the file has none of, the frame it is
// handed.
//
// A spawn, a rule's entry or what a page's `emit` is handed, is the effect's point `at` and:
//
//   life     the seconds it goes on emitting; left out, 0, one burst.
//   dir      the direction a layer that gives none throws along.
//   to       a second point of the world, where its beams end and where it lands.
//   tint     the colour of a layer that gives none.
//   scale    the effect's size: times every length of its layers, a particle's size and its speed,
//            its jitter, its box, its g and its pull, so an effect scaled up goes as far in its
//            sizes as it did before; its lives, drags and paces are times, not lengths, and stay.
//   floor    the height its particles come to rest at.
//   from     the id of the row the effect comes from: while this page's rows hold that row, the
//            effect goes on whatever its `life`, its point that row's `pos` when the row has one;
//            the frame they no longer do, its life is over. A smoulder on a wreck for as long as it
//            lies, a trail on a comet, a glow on an item on the floor.
//   fly      how fast its point is carried from `at` to `to`, in the world's units a second; its
//            `life` is the time that takes.
//   land     effects thrown at its `to`, or at its point when it has none, the frame its life is
//            over: each `{ "effect": name }` and the spawn it is thrown with. Where a round lands,
//            what a wreck leaves when it goes. Each rolls from its `seed`, else from a roll of the
//            effect it lands from, so every page that draws the one draws the same others.
//
// A particle's rolls come from a generator seeded with the ledger entry's id, in the same order on
// every page, so every page draws the same particles; a page that first sees an entry late rolls the
// bursts it missed and ages their particles to now, as a page that saw it from the start has them.
//
// Every particle is a quad facing the camera, and all the particles on one page of one sheet, or of
// particle3d's own shapes, are one mesh whose buffers are written every frame: one draw for all of them,
// those laid over what is behind them and those that `add` their light alike. They are written the
// farthest from the camera first, so smoke nearer than a light hides it and smoke behind it does not,
// from wherever the camera looks; particles of two sheets are two meshes, each in that order within
// itself. That is done in
// `afterTick`, after every actor has ticked, so the quads face the camera the seat's own actor moved
// this frame, and so this plugin is listed before `render3d`, whose `afterTick` draws; listed after
// it, every particle would be drawn facing last frame's camera, and that throws. A sheet the loader
// has not handed over yet draws nothing. Each frame moves every effect one step of the scene's `dt`.
// A mesh whose sheet or effects file written since it was made draws with the new
// page and `alphaTest` from the next frame, and the effects file written (the loader's `onWritten`)
// makes every running effect read its layers again, its particles too, so they draw as it now says.
// `close` frees every mesh and the texture of particle3d's own shapes; the sheets are the loader's and stay.
import type { Plugins } from '#engine/browser.ts'
import { seeded, type Die } from '#engine/engine.ts'
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { play, type Frame } from '#plugins/loader/loader.sim.ts'
import { flight, type Entry, type Land, type Spawn } from './particle3d.sim.ts'
import { CELL, SHAPES, corners, strip, type Shape } from './shapes.ts'
import { driven, plan, type Compiled, type Values } from './drivers.ts'
import { curlInto, noise } from './noise.ts'

// The batch key of particle3d's own shapes, which no catalogue name begins with.
const OWN = '#shapes'

type Range = [number, number]
type V3 = [number, number, number]
// The forces of a layer, and of one entry of a force generator, which has an `at`, a `direction`, an
// `anchor`, a `falloff` and `range`, its noise, its wind, the shape its pull draws toward and its
// strength over time too (the header, Force generators).
export type Anchor = 'particle' | 'effect'
export type Force = {
  g?: number; drag?: number; pull?: number; swirl?: number; axis?: number[]; at?: number[]
  direction?: number[]; anchor?: Anchor; falloff?: number; range?: number; noiseFrequency?: number; noiseAmplitude?: number
  turbulence?: number; noiseScroll?: number[]; wind?: number[]; dragBySpeed?: number
  shell?: number; toAxis?: boolean; overLife?: number[][]; overAge?: number[][]
}
export const ANCHORS = ['particle', 'effect'] as const satisfies readonly Anchor[]
// How a flipbook's channels are drawn: four weights each, red, green, blue and alpha (the header, `channels`).
export type Channels = { value: number[]; alpha: number[]; hot: number[] }
export const CHANNELS = ['value', 'alpha', 'hot'] as const satisfies readonly (keyof Channels)[]
export type Emitter = {
  n?: Range; every?: number; after?: number; life?: Range; lasts?: boolean; skip?: number
  sheet?: string; clip?: string; play?: boolean; shape?: Shape
  start?: Range; blend?: boolean; channels?: Channels; erode?: number[][]
  size?: Range; grow?: number; grows?: number[][]
  dir?: number[]; spread?: number; speed?: Range; outward?: Range; jitter?: number[]; box?: number[]
  g?: number; drag?: number; pull?: number; swirl?: number; axis?: number[]; pace?: number[][]; bounce?: number; follow?: boolean
  tint?: number; tint1?: number; tints?: number[][]; gain?: number; a0?: number; a1?: number; fade?: number; alphas?: number[][]
  spin?: number; origin?: [number, number]; add?: boolean; stretch?: boolean; face?: boolean; beam?: boolean; flips?: number[][]
  carry?: string; inherit?: number; forces?: Record<string, number | Range>
}
export type Lamp = {
  at?: number[]; tint?: number; intensity: number; distance: number; decay: number
  shadow?: boolean; flicker?: number; spot?: { angle: number; penumbra: number }
}
export type Lit = { lamp: Lamp }
// As the file writes it: every number a number or a driver's expression (the header, Drivers).
export type Driven<T> = T extends number ? number | string : T extends string | boolean | undefined ? T : { [K in keyof T]: Driven<T[K]> }
export type Layer = Driven<Emitter> | { effect: string; at?: (number | string)[] } | Driven<Lit>
export type Effects = {
  cap: number; alphaTest?: number; ppm?: number; files?: string[]; flipbooks?: unknown[]
  forceGenerators?: Record<string, Driven<Force>[]>; drivers?: Record<string, number | string>
  effects: Record<string, Layer[]>
}
// A file the effects file lists: its effects, and its force generators and drivers when it has them.
export type Listed = Pick<Effects, 'effects' | 'forceGenerators' | 'drivers'>

// Every field an emitter may have, in the order the header gives them; the fields of an `{ effect }`
// layer; the fields of the file; and the count of numbers each field that is a point or a box has.
export const FIELDS = [
  'n', 'every', 'after', 'life', 'lasts', 'skip', 'start', 'blend', 'channels', 'erode', 'sheet', 'clip', 'play', 'shape', 'size', 'grow', 'grows', 'dir', 'spread', 'speed', 'outward', 'jitter', 'box',
  'g', 'drag', 'pull', 'swirl', 'axis', 'pace', 'bounce', 'follow', 'flips', 'tint', 'tint1', 'tints', 'gain', 'a0', 'a1', 'fade', 'alphas', 'spin', 'origin', 'add', 'stretch', 'face', 'beam', 'carry', 'inherit', 'forces',
] as const satisfies readonly (keyof Emitter)[]
export const REF = ['effect', 'at'] as const
export const LAMP = ['at', 'tint', 'intensity', 'distance', 'decay', 'shadow', 'flicker', 'spot'] as const satisfies readonly (keyof Lamp)[]
export const FORCE = [
  'g', 'drag', 'pull', 'swirl', 'axis', 'at', 'direction', 'anchor', 'falloff', 'range', 'noiseFrequency', 'noiseAmplitude',
  'turbulence', 'noiseScroll', 'wind', 'dragBySpeed', 'shell', 'toAxis', 'overLife', 'overAge',
] as const satisfies readonly (keyof Force)[]
// A layer's fields that are stops over a particle's life, each `[part, value]` with its part from 0 to 1.
export const STOPS = ['grows', 'tints', 'alphas', 'erode'] as const satisfies readonly (keyof Emitter)[]
// What a layer's stops are written in place of.
const INSTEAD: Record<(typeof STOPS)[number], (keyof Emitter)[]> = { grows: ['grow'], tints: ['tint', 'tint1'], alphas: ['a0', 'a1', 'fade'], erode: [] }
export const FILE = ['cap', 'alphaTest', 'ppm', 'files', 'forceGenerators', 'drivers', 'flipbooks', 'effects'] as const satisfies readonly (keyof Effects)[]
export const WORLD = ['effects', 'hold', 'attach', 'mods'] as const
// One attachment of `world.particle3d.attach`, and a source a `sources` mod hands back (the header,
// Attachments).
export type Attach = { on: string; effect: string; of?: string; when?: string }
export const ATTACH = ['on', 'effect', 'of', 'when'] as const satisfies readonly (keyof Attach)[]
export type Source = { key: string; on: string; of?: string; effect?: string; at: number[]; dir?: number[]; floor?: number; drivers: Record<string, number> }
export type Sources = (plugins: Plugins) => readonly Source[]
// The fields of an emitter that are not numbers, which no driver drives: its names, and what is on or off.
export const NAMES = ['sheet', 'clip', 'shape', 'carry'] as const satisfies readonly (keyof Emitter)[]
export const SWITCHES = ['lasts', 'play', 'blend', 'follow', 'add', 'stretch', 'face', 'beam'] as const satisfies readonly (keyof Emitter)[]
// What a number driven is kept within, by its field: [least, most].
const LIMITS: Record<string, [number, number]> = {
  every: [0, Infinity], bounce: [0, 1], intensity: [0, Infinity], distance: [0, Infinity], decay: [0, Infinity], flicker: [0, 1],
  angle: [0, Math.PI / 2], penumbra: [0, 1],
  falloff: [0, Infinity], range: [0, Infinity], noiseFrequency: [0, Infinity], noiseAmplitude: [0, Infinity],
  dragBySpeed: [0, Infinity], shell: [0, Infinity],
}
// Where a line from `from` along the unit `dir` first meets a solid within `far` metres: a mod's answer.
export type Meet = (from: number[], dir: number[], far: number) => { t: number; normal: number[] } | undefined
// What a `solids` mod exports: asked once a frame.
export type Solids = (plugins: Plugins) => Meet
// A word's Drawer, its Drawing, and one particle as a Drawing is handed it (the header, Words).
export type Put = { at: number[]; rot: number[]; size: number; pick: number }
export type Drawing = { put(list: Put[]): void; dispose(): void }
export type Drawer = {
  check(data: any, what: string, world: Record<string, any>): void
  draw(data: any, made: { plugins: Plugins; name: string }): Drawing | undefined
}
// The words a scene's mods deliver: each plugin `world.particle3d.mods.behaviors` names, laid over the last.
export const drawers = (world: Record<string, any>): Record<string, Drawer> =>
  Object.assign({}, ...modsOf<() => Record<string, Drawer>>(world, 'particle3d', 'behaviors').map(f => f()))
const OWN_FIELDS: ReadonlySet<string> = new Set(FIELDS)
// One word of an emitter: its name, its numbers, and the key its Drawing is kept by.
type Word = { word: string; data: unknown; key: string }
// The words of an emitter: its fields that are none of particle3d's own. A played layer is a copy whose
// keys never change and whose words are handed over as the file writes them (`playing`), so each
// layer's are found once.
const layerWords = new WeakMap<Emitter, Word[]>()
const wordsOf = (l: Emitter): Word[] => {
  let got = layerWords.get(l)
  if (!got) {
    got = Object.keys(l)
      .filter(k => !OWN_FIELDS.has(k))
      .map(word => ({ word, data: (l as any)[word], key: `${word} ${JSON.stringify((l as any)[word])}` }))
    layerWords.set(l, got)
  }
  return got
}
const COUNTS: Record<string, number> = { dir: 3, axis: 3, jitter: 3, box: 6, at: 3, direction: 3, wind: 3, noiseScroll: 3 }

// What `emit` hands back. `at`, `dir`, `to`, `floor` and `life` may be written, and its `drivers`
// written into; `age` is read.
export type Effect = { readonly name: string; at: number[]; dir?: number[]; to?: number[]; floor?: number; life: number; readonly drivers: Record<string, number>; readonly age: number }

type Live = Effect & {
  age: number; tint?: number; scale: number; die: Die
  from?: number; fly?: number; land?: Land[]; landed: boolean
  layers?: Emitter[]; bursts: number[] // per layer, how many of its bursts have been fired
  last: number[] // per layer, the seconds into the effect its last burst was thrown at
  held: boolean[] // per layer, whether it is a stream held at an `every` of 0
  play?: Play // what its layers are played from now: the page's, or its drivers' own
  uses: Set<Play> // every play its layers have been played from, which its particles may still be of
  lamps?: Lamp[] // its lamp layers, each at its place off the point
  parts: number; server?: number
  root?: Live // for an effect a particle carries, the effect thrown that the chain of carrying began from
  vel: number[] // how fast its point is moving: its carrier's speed, else its point's from the last frame to this
  was?: number[] // where its point was the last frame
}
type Part = {
  fx: Live; layer: Emitter; p: V3; v: V3; o: V3
  age: number; life: number; lasts?: number; s0: number; s1: number; rot: number; spin: number
  carried?: Live // the effect it carries, its point kept on the particle's place
  pick: number // rolled at its birth for a word's drawer to choose by
  begin: number // the part of its clip its frames begin at, its layer's `start` rolled at its birth, else 0
  rolls?: Record<string, number> // for each force generator its layer is in by a range, where in the range it was rolled, 0 to 1
}
type Group = { mesh: any; capacity: number }
// One particle placed in a batch this frame: the particle, its frame of the sheet and that frame's
// corners on the page, and how far it is behind the camera's place along the way the camera looks back
// (the less, the farther in front). Kept by its batch and written over the next frame.
// With `blend`, the corners of the next frame too, and how far it is laid into it.
type Placed = { q: Part; f?: Frame; uv?: number[]; uv2?: number[]; mixed: number; back: number }
// How a layer's picture is drawn beyond its colour and opacity: its `channels`, whether it lays one
// frame into the next, whether it erodes; layers drawn alike share a mesh, and `key` says which.
type How = { key: string; channels?: Channels; blend: boolean; erode: boolean }
// The particles of one page of one sheet (or none), drawn one way, by one mesh: the first `n` of
// `list` are this frame's, and the batch and its entries are kept from frame to frame.
type Batch = { sheet?: string; page: number; how: How; group?: Group; list: Placed[]; n: number }

const lerp = (r: Range | undefined, u: number, fallback: number) => (r ? r[0] + (r[1] - r[0]) * u : fallback)
// Of a list of [seconds, ...] in order, the last entry whose seconds a particle `age` old has reached.
const reached = (list: number[][] | undefined, age: number) => {
  if (!list) return undefined
  let got: number[] | undefined
  for (const e of list) {
    if (e[0] > age + 1e-9) break
    got = e
  }
  return got
}
const mix = (a: number, b: number, k: number) => {
  const c = (s: number) => {
    const x = (a >> s) & 255, y = (b >> s) & 255
    return Math.round(x + (y - x) * k) << s
  }
  return c(16) | c(8) | c(0)
}
const unit = (a: number[]): V3 => {
  const l = Math.hypot(a[0], a[1], a[2])
  return [a[0] / l, a[1] / l, a[2] / l]
}
const cross = (a: number[], b: number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
// Of stops `[at, value]` in order, the value at `at`: a straight line from each to the next, the first
// stop's before it and the last's after it.
const stop = (list: number[][], at: number) => {
  if (at <= list[0][0]) return list[0][1]
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i]
    if (at <= b[0]) return a[1] + (b[1] - a[1]) * (b[0] > a[0] ? (at - a[0]) / (b[0] - a[0]) : 1)
  }
  return list[list.length - 1][1]
}
// Of colour stops `[at, 0xrrggbb]` in order, the colour at `at`, each channel a straight line from each
// stop to the next.
const tintAt = (list: number[][], at: number) => {
  if (at <= list[0][0]) return list[0][1]
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i]
    if (at <= b[0]) return mix(a[1], b[1], b[0] > a[0] ? (at - a[0]) / (b[0] - a[0]) : 1)
  }
  return list[list.length - 1][1]
}
// Each own shape's corners on the strip, worked out once.
const SHAPE_CORNERS = new Map<Shape, number[]>(SHAPES.map(s => [s, corners(s)]))
// A whole frame's corners, top left, top right, bottom left, bottom right, for a particle drawn from no
// sheet and no shape.
const WHOLE = [0, 1, 1, 1, 0, 0, 1, 0]

// The seconds a particle lives: its `life`, or for one that lasts, until its effect's life is over.
const span = (q: Part) => (q.lasts === undefined ? q.life : q.fx.life - q.lasts)
// Whether a particle has life left. An age is a sum of steps, which falls short of a whole number
// of them by a rounding, so a particle living n steps is gone after its nth.
const alive = (q: Part) => q.age < span(q) - 1e-9
// How far through its life a particle is, 0 to 1.
const part = (q: Part) => Math.min(1, q.age / span(q))
// A particle's size now: its `grows` times its size at birth, else from its size at birth to that at death.
const sized = (q: Part) => (q.layer.grows ? q.s0 * stop(q.layer.grows, part(q)) : q.s0 + (q.s1 - q.s0) * part(q))
// How hard a force generator acts on a particle: the strength its layer names it by, or where the
// particle was rolled in a strength that is a range.
const strength = (q: Part, name: string) => {
  const s = q.layer.forces![name]
  return typeof s === 'number' ? s : s[0] + (s[1] - s[0]) * q.rolls![name]
}
// Where an effect's point is: its `at`, or for one that flies, carried from there toward its `to`.
const point = (fx: Live): number[] => {
  if (fx.fly === undefined) return fx.at
  const k = fx.life > 0 ? Math.min(1, fx.age / fx.life) : 1
  return [0, 1, 2].slice(0, Math.max(fx.at.length, fx.to!.length)).map(i => (fx.at[i] ?? 0) + ((fx.to![i] ?? 0) - (fx.at[i] ?? 0)) * k)
}
// Where a particle is drawn: its place, or for one that follows, kept about its effect's point.
const place = (q: Part): number[] => {
  if (!q.layer.follow) return q.p
  const at = point(q.fx)
  return [0, 1, 2].map(i => q.p[i] + at[i] - q.o[i])
}
// The effect a particle carries kept on it: at its place, along the way it goes, its `to` the point
// of the effect the particle is of.
// Written into the carried effect's own `at`, `to`, `vel` and `dir`, each its own from the frame it is
// first made, which nothing else holds.
const ride = (q: Part) => {
  const fx = q.carried!, v = q.v
  const there = point(q.fx), from = q.layer.follow ? there : undefined
  const to = (fx.to ??= [0, 0, 0]), vel = fx.vel
  for (let i = 0; i < 3; i++) {
    fx.at[i] = from ? q.p[i] + from[i] - q.o[i] : q.p[i]
    to[i] = there[i]
    vel[i] = v[i]
  }
  const speed = Math.hypot(v[0], v[1], v[2])
  if (speed > 1e-9) {
    const dir = (fx.dir ??= [0, 0, 0])
    dir[0] = v[0] / speed
    dir[1] = v[1] / speed
    dir[2] = v[2] / speed
  }
}

// Throws for the first field of the file, of an effect's layer, or of `world.particle3d` that this plugin
// does not read, and for a point or a box of the wrong count of numbers.
// `words` are the Drawers the scene's mods deliver (`drawers(world)`), and `world` the scene's, which a
// Drawer's check reads.
export function check(file: Effects, own: Record<string, unknown>, words: Record<string, Drawer> = {}, world: Record<string, any> = {}) {
  for (const k of Object.keys(own)) if (!(WORLD as readonly string[]).includes(k)) throw new Error(`world.particle3d has ${k}, which particle3d does not know`)
  for (const k of Object.keys(file)) if (!(FILE as readonly string[]).includes(k)) throw new Error(`particle3d's effects file has ${k}, which particle3d does not know`)
  const names = plan(file.drivers).names
  if (own.attach !== undefined) {
    if (!Array.isArray(own.attach)) throw new Error(`world.particle3d.attach is ${JSON.stringify(own.attach)}, and it is a list, each { ${ATTACH.join(', ')} }`)
    if (!modsOf(world, 'particle3d', 'sources').length) throw new Error('world.particle3d has an attach, and its mods name no sources')
    own.attach.forEach((a: unknown, i: number) => {
      const at = `world.particle3d.attach ${i}`
      if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error(`${at} is ${JSON.stringify(a)}, and an attachment is { ${ATTACH.join(', ')} }`)
      for (const k of Object.keys(a)) if (!(ATTACH as readonly string[]).includes(k)) throw new Error(`${at} has ${k}, and an attachment is { ${ATTACH.join(', ')} }`)
      const { on, effect, of, when } = a as Record<string, unknown>
      if (typeof on !== 'string') throw new Error(`${at} has an on of ${JSON.stringify(on)}, and on is the word of the sources it is thrown from`)
      if (of !== undefined && typeof of !== 'string') throw new Error(`${at} has an of of ${JSON.stringify(of)}, and of is what the sources it is thrown from are of`)
      if (typeof effect !== 'string' || !(effect in file.effects)) throw new Error(`${at} throws ${JSON.stringify(effect)}, which the effects file has no effect of`)
      if (when !== undefined) {
        if (typeof when !== 'string') throw new Error(`${at} has a when of ${JSON.stringify(when)}, and when is an expression of the drivers`)
        driven(when, names, `${at}'s when`)
      }
    })
  }
  // Every string where a number goes, however deep in a range, a point or a list, is an expression.
  const numbers = (v: unknown, what: string) => {
    if (typeof v === 'string') driven(v, names, what)
    else if (Array.isArray(v)) v.forEach(e => numbers(e, what))
    else if (v && typeof v === 'object') for (const [k, e] of Object.entries(v)) numbers(e, `${what}'s ${k}`)
  }
  // Stops: a list of [at, value] pairs, at least one, in the order of their `at`, none past `most`.
  const stops = (v: unknown, what: string, of: string, most: number) => {
    const said = `${what} of ${JSON.stringify(v)}, and they are [[<${of}>, <value>], ...] in order`
    if (!Array.isArray(v) || !v.length || !v.every(e => Array.isArray(e) && e.length === 2 && e.every(n => typeof n === 'number' || typeof n === 'string'))) throw new Error(said)
    v.forEach(([a], i) => {
      if (typeof a !== 'number') return
      const before = v[i - 1]?.[0]
      if (a < 0 || a > most || (typeof before === 'number' && a < before)) throw new Error(said)
    })
  }
  const generators = file.forceGenerators ?? {}
  for (const [name, entries] of Object.entries(generators)) {
    if (!Array.isArray(entries)) throw new Error(`particle3d force generator ${name} is ${JSON.stringify(entries)}, and a force generator is a list of entries, each any of ${FORCE.join(', ')}`)
    entries.forEach((f, i) => {
      const at = `particle3d force generator ${name} entry ${i}`
      if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error(`${at} is ${JSON.stringify(f)}, and an entry is any of ${FORCE.join(', ')}`)
      for (const [k, v] of Object.entries(f)) {
        if (!(FORCE as readonly string[]).includes(k)) throw new Error(`${at} has ${k}, and an entry is any of ${FORCE.join(', ')}`)
        if (k === 'anchor') {
          if (!(ANCHORS as readonly unknown[]).includes(v)) throw new Error(`${at} has an anchor ${JSON.stringify(v)}, and an anchor is ${ANCHORS.join(' or ')}`)
          continue
        }
        if (k === 'toAxis') {
          if (typeof v !== 'boolean') throw new Error(`${at} has a toAxis of ${JSON.stringify(v)}, and toAxis is on or off`)
          continue
        }
        if (k === 'overLife') stops(v, `${at} has overLife`, 'part of a particle\'s life, 0 to 1', 1)
        if (k === 'overAge') stops(v, `${at} has overAge`, 'seconds of the effect\'s age', Infinity)
        if (k in COUNTS && (!Array.isArray(v) || v.length !== COUNTS[k])) throw new Error(`${at} has a ${k} of ${JSON.stringify(v)}, and particle3d reads ${COUNTS[k]} numbers`)
        if (k === 'axis' && (v as unknown[]).every(n => typeof n === 'number') && Math.hypot(...(v as number[])) === 0) throw new Error(`${at} has an axis of no length, and particle3d swirls about a line`)
        const [least] = LIMITS[k] ?? [-Infinity]
        if (typeof v === 'number' && v < least) throw new Error(`${at} has a ${k} of ${v}, and it is ${least} or more`)
        numbers(v, `${at}'s ${k}`)
      }
      if (f.falloff !== undefined && f.range === undefined) throw new Error(`${at} has a falloff and no range, and a force falls off over its range`)
      if (f.wind !== undefined && f.drag === undefined && f.dragBySpeed === undefined) throw new Error(`${at} has a wind and no drag, and a wind is the air its drag is in`)
    })
  }
  for (const [name, layers] of Object.entries(file.effects)) {
    layers.forEach((l, i) => {
      const at = `particle3d effect ${name} layer ${i}`
      if ('lamp' in l) return lamped(name, i, l, numbers)
      const known: readonly string[] = 'effect' in l ? REF : FIELDS
      if (!('effect' in l) && !l.life === !l.lasts) throw new Error(`${at} ${l.life ? 'has a life and lasts' : 'has no life and does not last'}, and it has one or the other`)
      for (const [k, v] of Object.entries(l)) {
        if (!known.includes(k)) {
          if ('effect' in l || !words[k]) throw new Error(`${at} has ${k}, which particle3d does not know${'effect' in l ? '' : ', and no plugin world.particle3d.mods.behaviors names delivers it'}`)
          words[k].check(v, `${at} ${k}`, world)
          continue
        }
        if (k in COUNTS && (!Array.isArray(v) || v.length !== COUNTS[k])) throw new Error(`${at} has a ${k} of ${JSON.stringify(v)}, and particle3d reads ${COUNTS[k]} numbers`)
        if (k === 'axis' && (v as unknown[]).every(n => typeof n === 'number') && Math.hypot(...(v as number[])) === 0) throw new Error(`${at} has an axis of no length, and particle3d swirls about a line`)
        if (k === 'shape' && !(SHAPES as readonly unknown[]).includes(v)) throw new Error(`${at} has a shape ${JSON.stringify(v)}, and particle3d draws ${SHAPES.join(', ')}`)
        if (k === 'shape' && 'sheet' in l) throw new Error(`${at} has a shape and a sheet, and it is drawn as one or the other`)
        if (k === 'bounce' && typeof v !== 'string' && !(typeof v === 'number' && v >= 0 && v <= 1)) throw new Error(`${at} has a bounce of ${JSON.stringify(v)}, and a bounce is from 0 to 1`)
        if (k === 'carry' && !(typeof v === 'string' && v in file.effects)) throw new Error(`${at} carries ${JSON.stringify(v)}, which there is none of`)
        if ((SWITCHES as readonly string[]).includes(k) && typeof v === 'string') throw new Error(`${at} has a ${k} of ${JSON.stringify(v)}, and ${k} is on or off, which no driver drives`)
        if (k === 'forces') {
          if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${at} has forces of ${JSON.stringify(v)}, and its forces are { <force generator>: strength }`)
          for (const g of Object.keys(v)) if (!(g in generators)) throw new Error(`${at} is in the force generator ${g}, which there is none of${Object.keys(generators).length ? `: the file's are ${Object.keys(generators).join(', ')}` : ''}`)
          const one = (s: unknown) => typeof s === 'number' || typeof s === 'string'
          for (const [g, s] of Object.entries(v)) if (!one(s) && !(Array.isArray(s) && s.length === 2 && s.every(one))) throw new Error(`${at} is in the force generator ${g} by ${JSON.stringify(s)}, and its strength is a number, or [min, max]`)
        }
        if ((k === 'start' || k === 'blend' || k === 'channels') && !('sheet' in l)) throw new Error(`${at} has ${k} and no sheet, and ${k} is how a sheet's frames are drawn`)
        if (k === 'blend' && 'play' in l) throw new Error(`${at} has blend and play, and blend lays its frames into each other evenly over its life`)
        if (k === 'channels') {
          const c = v as Record<string, unknown>
          if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error(`${at} has channels of ${JSON.stringify(v)}, and its channels are { ${CHANNELS.join(', ')} }`)
          for (const w of CHANNELS) {
            const ws = c[w]
            if (!Array.isArray(ws) || ws.length !== 4 || !ws.every(n => typeof n === 'number')) throw new Error(`${at} has channels whose ${w} is ${JSON.stringify(ws)}, and it is four weights, red, green, blue and alpha`)
          }
          for (const w of Object.keys(c)) if (!(CHANNELS as readonly string[]).includes(w)) throw new Error(`${at} has channels with ${w}, and its channels are { ${CHANNELS.join(', ')} }`)
          continue
        }
        if ((STOPS as readonly string[]).includes(k)) {
          stops(v, `${at} has ${k}`, 'part of its life, 0 to 1', 1)
          for (const o of INSTEAD[k as (typeof STOPS)[number]]) if (o in l) throw new Error(`${at} has ${k} and ${o}, and ${k} are written in place of ${o}`)
        }
        if (k === 'effect' || (NAMES as readonly string[]).includes(k)) continue
        numbers(v, `${at}'s ${k}`)
      }
    })
  }
  carrying(file.effects)
}

// Throws for an effect that comes back to itself by carrying: a path from it along `carry`s and named
// effects, at least one of them a `carry`, that reaches it again. A path round of named effects alone
// is `flatten`'s to throw for.
function carrying(effects: Record<string, Layer[]>) {
  const next = (name: string) =>
    (effects[name] ?? []).flatMap(l => ('lamp' in l ? [] : 'effect' in l ? [{ to: l.effect, carried: false }] : l.carry ? [{ to: l.carry, carried: true }] : []))
  const walk = (name: string, path: string[], carried: boolean[]) => {
    for (const { to, carried: c } of next(name)) {
      const at = path.indexOf(to)
      if (at >= 0) {
        if ([...carried.slice(at), c].some(Boolean)) throw new Error(`particle3d effect ${to} carries itself: ${[...path.slice(at), to].join(' > ')}`)
        continue
      }
      walk(to, [...path, to], [...carried, c])
    }
  }
  for (const name of Object.keys(effects)) walk(name, [name], [])
}

// Throws for a lamp layer that is anything but `{ lamp }`, for a field of its lamp this plugin does not
// read, and for a lamp missing a number it needs or holding one it cannot light by.
// A number of it that is a string is an expression, which `numbers` throws for when it is none.
function lamped(name: string, i: number, l: Driven<Lit>, numbers: (v: unknown, what: string) => void) {
  const at = `particle3d effect ${name} layer ${i}`
  for (const k of Object.keys(l)) if (k !== 'lamp') throw new Error(`${at} is a lamp and has ${k}, and a lamp layer is { lamp } alone`)
  const lamp = l.lamp
  if (!lamp || typeof lamp !== 'object') throw new Error(`${at} has a lamp of ${JSON.stringify(lamp)}, and particle3d reads { intensity, distance, decay, ... }`)
  for (const k of Object.keys(lamp)) if (!(LAMP as readonly string[]).includes(k)) throw new Error(`${at} has a lamp with ${k}, which particle3d does not know`)
  const said = (v: unknown) => typeof v === 'string'
  for (const k of ['intensity', 'distance', 'decay'] as const) if (!said(lamp[k]) && !(typeof lamp[k] === 'number' && lamp[k] >= 0)) throw new Error(`${at} has a lamp whose ${k} is ${lamp[k]}, and it is a number of 0 or more`)
  if (lamp.at !== undefined && !(Array.isArray(lamp.at) && lamp.at.length === 3)) throw new Error(`${at} has a lamp at ${JSON.stringify(lamp.at)}, and particle3d reads 3 numbers`)
  if (lamp.flicker !== undefined && !said(lamp.flicker) && !(lamp.flicker >= 0 && lamp.flicker <= 1)) throw new Error(`${at} has a lamp whose flicker is ${lamp.flicker}, and it is from 0 to 1`)
  if (said(lamp.shadow)) throw new Error(`${at} has a lamp whose shadow is ${JSON.stringify(lamp.shadow)}, and shadow is on or off, which no driver drives`)
  const s = lamp.spot
  if (s !== undefined && !(s && typeof s === 'object' && (said(s.angle) || (s.angle > 0 && s.angle <= Math.PI / 2)) && (said(s.penumbra) || (s.penumbra >= 0 && s.penumbra <= 1)) && Object.keys(s).length === 2))
    throw new Error(`${at} has a lamp whose spot is ${JSON.stringify(s)}, and particle3d reads { angle, penumbra }, an angle above 0 and no more than π/2 and a penumbra from 0 to 1`)
  numbers(lamp, `${at}'s lamp`)
}

// Every layer an effect stands for, its `{ effect }` layers opened out, in order, each thrown from
// its `at` off the point: an emitter's box moved by it, or a box of that one point for one with none;
// a lamp's `at` moved by it.
function flatten(effects: Record<string, Layer[]>, name: string, path: string[] = []): (Driven<Emitter> | Driven<Lit>)[] {
  if (path.includes(name)) throw new Error(`particle3d effect ${name} is made of itself: ${[...path, name].join(' > ')}`)
  const layers = effects[name]
  if (!layers) throw new Error(path.length ? `particle3d effect ${path[path.length - 1]} names ${name}, which there is none of` : `particle3d has no effect ${name}`)
  // Two numbers of the file added: their sum, or where either is an expression, the expression of it.
  const plus = (a: number | string, b: number | string) => (typeof a === 'number' && typeof b === 'number' ? a + b : `(${a}) + (${b})`)
  return layers.flatMap(l => {
    if (!('effect' in l)) return [l]
    const inner = flatten(effects, l.effect, [...path, name])
    if (!l.at) return inner
    const [x, y, z] = l.at
    return inner.map(e => {
      if ('lamp' in e) {
        const [ax, ay, az] = e.lamp.at ?? [0, 0, 0]
        return { lamp: { ...e.lamp, at: [plus(ax, x), plus(ay, y), plus(az, z)] } }
      }
      const [x0, y0, z0, x1, y1, z1] = e.box ?? [0, 0, 0, 0, 0, 0]
      return { ...e, box: [plus(x0, x), plus(y0, y), plus(z0, z), plus(x1, x), plus(y1, y), plus(z1, z)] }
    })
  })
}

// An effect's layers opened out, its emitters and its lamps apart, as the file writes them.
function split(effects: Record<string, Layer[]>, name: string): { layers: Driven<Emitter>[]; lamps: Driven<Lamp>[] } {
  const all = flatten(effects, name)
  return { layers: all.filter((l): l is Driven<Emitter> => !('lamp' in l)), lamps: all.filter((l): l is Driven<Lit> => 'lamp' in l).map(l => l.lamp) }
}

// One number of a played layer, lamp or force generator's entry that the file writes as an expression:
// where it is written each frame, its function, and what it is kept within.
type Bind = { on: any; key: string | number; run: Compiled; what: string; text: string; least: number; most: number; axis?: number[] }
// The file played at one set of drivers' values: the page's, or one effect's own `drivers` (with every
// effect it carries) over the page's. Its values this frame, the numbers it writes from them, each
// effect's layers and lamps and each force generator's entries copied from the file the first time this
// play plays them, and the layers whose `every` is driven, so a stream held at 0 is told from one burst.
type Play = {
  values: Values; binds: Bind[]
  played: Map<string, { layers: Emitter[]; lamps: Lamp[] }>
  generators: Map<string, Force[]>
  streams: WeakSet<Emitter>
}

export function particle3d() {
  let ledger: Live[] = []
  let fresh = new Set<Live>() // spawned since the last frame, so starting at the age it was given
  const seen = new Set<number>() // the server entries this page has taken
  let file: Effects | undefined
  let unchecked = true // the file has been read or written since it was last checked
  let asked = false
  let stale = false // the effects file has been written since the running effects read their layers
  let checked = false
  let parts: Part[] = []
  // Every batch made, by sheet, then page, then how it is drawn, and every batch in the order it was made.
  const batches = new Map<string | undefined, Map<number, Map<string, Batch>>>()
  const made: Batch[] = []
  // The batches with a particle this frame, in the order their first particle came.
  const drawn: Batch[] = []
  // Each running effect's lamps' lights, one for each of its lamp layers in order.
  const lamps = new Map<Live, any[]>()

  // The file as it is played. Its drivers' plan, the seconds this half has run (`time`), and the drivers
  // the page holds (`drive`). `page` is the file played at the page's values, which every effect with no
  // driver of its own plays from; `plays` is each set of an effect's own drivers' play, by the drivers
  // object, which the effects it carries share. In a play, each effect's layers and lamps, and each force
  // generator's entries, are copied from the file the first time one is played, every number a number:
  // one the file writes as an expression is a `Bind`, written into the copy then and once a frame from
  // then on, so every effect of a name played from one play plays from the one copy and a driver moves
  // them all. The generators each played layer is in. All of it is made again when the file is read or
  // written.
  let solver: ReturnType<typeof plan> | undefined
  let time = 0
  const held: Values = {}
  const blank = (): Play => ({ values: { time: 0 }, binds: [], played: new Map(), generators: new Map(), streams: new WeakSet() })
  let page = blank()
  let plays = new Map<Record<string, number>, Play>()
  let fields = new WeakMap<Emitter, { name: string; list: Force[] }[]>()

  const write = (b: Bind, values: Values) => {
    const v = b.run(values)
    if (!(Number.isFinite(v) && v >= b.least && v <= b.most))
      throw new Error(`${b.what} is ${JSON.stringify(b.text)}, which is ${v} now, and it is a ${b.least === -Infinity ? 'finite number' : b.most === Infinity ? `number of ${b.least} or more` : `number from ${b.least} to ${b.most}`}`)
    b.on[b.key] = v
    if (b.axis && Math.hypot(...b.axis) === 0) throw new Error(`${b.what} is ${JSON.stringify(b.text)}, which leaves an axis of no length now, and particle3d swirls about a line`)
  }
  // A copy of a layer, a lamp or a force generator's entry as the file writes it, its numbers numbers:
  // each string where a number goes a Bind of the play, written now. The fields `kept` names are handed
  // over as they are.
  const live = (play: Play, raw: Record<string, unknown>, what: string, kept: readonly string[] = []): any => {
    const names = solver!.names
    const copy = (v: unknown, on: any, key: string | number, what: string, field: string, axis?: number[]) => {
      if (typeof v === 'string') {
        const [least, most] = LIMITS[field] ?? [-Infinity, Infinity]
        const b: Bind = { on, key, run: driven(v, names, what), what, text: v, least, most, axis }
        play.binds.push(b)
        write(b, play.values)
      } else if (Array.isArray(v)) {
        // not a number until each is written, so an axis half written is not one of no length
        const list: any[] = (on[key] = v.map(() => NaN))
        v.forEach((e, i) => copy(e, list, i, what, field, field === 'axis' ? list : undefined))
      } else if (v && typeof v === 'object') {
        const o: any = (on[key] = {})
        // a layer's `forces` are strengths by generator, whose names are no field's
        for (const [k, e] of Object.entries(v)) copy(e, o, k, `${what}'s ${k}`, field === 'forces' ? '' : k)
      } else on[key] = v
    }
    const out: any = {}
    for (const [k, v] of Object.entries(raw)) {
      if (kept.includes(k)) out[k] = v
      else copy(v, out, k, `${what}'s ${k}`, k)
    }
    return out
  }
  const generator = (play: Play, name: string): Force[] => {
    let g = play.generators.get(name)
    if (!g) play.generators.set(name, (g = (file!.forceGenerators?.[name] ?? []).map((f, i) => live(play, f, `particle3d force generator ${name} entry ${i}`, ['anchor']) as Force)))
    return g
  }
  // An effect's layers opened out and its lamps, as they are played by a play.
  const playing = (play: Play, name: string) => {
    let p = play.played.get(name)
    if (p) return p
    const raw = split(file!.effects, name)
    const layers = raw.layers.map(l => {
      const e: Emitter = live(play, l, `particle3d effect ${name}`, [...NAMES, 'channels', ...Object.keys(l).filter(k => !OWN_FIELDS.has(k))])
      if (e.forces) fields.set(e, Object.keys(e.forces).map(g => ({ name: g, list: generator(play, g) })))
      if (typeof l.every === 'string') play.streams.add(e)
      return e
    })
    const lamps = raw.lamps.map(l => live(play, l, `particle3d effect ${name}'s lamp`) as Lamp)
    play.played.set(name, (p = { layers, lamps }))
    return p
  }
  // The play an effect plays from now: its drivers' own when it has any, else the page's.
  const playOf = (fx: Live): Play => {
    if (!Object.keys(fx.drivers).length) return page
    let p = plays.get(fx.drivers)
    if (!p) {
      plays.set(fx.drivers, (p = blank()))
      p.values = solver!.run({ ...over, ...fx.drivers }, time)
    }
    return p
  }
  // The file read or written: its drivers planned again, and nothing of it played yet.
  const reread = () => {
    solver = plan(file!.drivers)
    page = blank()
    plays = new Map()
    fields = new WeakMap()
    whens = new Map()
  }

  // Attachments (the header): each source's effect of each attachment, by the attachment's place in the
  // list and the source's key, and each attachment's `when` read, by its text.
  const attached = new Map<string, Live>()
  let whens = new Map<string, Compiled>()
  const attach = (plugins: Plugins, list: Attach[]) => {
    const { world } = plugins.wire.scene
    const sources = modsOf<Sources>(world!, 'particle3d', 'sources').flatMap(f => f(plugins))
    const kept = new Set<string>()
    const driving = (s: Source) => {
      for (const [n, v] of Object.entries(s.drivers)) {
        if (!solver!.names.includes(n)) throw new Error(unknown(n, `particle3d's ${s.on} source ${s.key}`))
        if (!Number.isFinite(v)) throw new Error(`particle3d's ${s.on} source ${s.key} has its driver ${n} at ${v}, and a driver is a finite number`)
      }
    }
    // The effect `effect` kept running on the source, under `key`.
    const keep = (key: string, effect: string, s: Source) => {
      kept.add(key)
      let fx = attached.get(key)
      if (!fx) attached.set(key, (fx = spawn(effect, s.at, { dir: s.dir, floor: s.floor, life: Infinity, drivers: s.drivers }, Math.floor(Math.random() * 2 ** 32))))
      fx.at = [...s.at]
      fx.dir = s.dir && [...s.dir]
      fx.floor = s.floor
      for (const n of Object.keys(fx.drivers)) if (!(n in s.drivers)) delete fx.drivers[n]
      Object.assign(fx.drivers, s.drivers)
    }
    list.forEach((a, i) => {
      for (const s of sources) {
        if (s.on !== a.on || (a.of !== undefined && s.of !== a.of)) continue
        driving(s)
        if (a.when !== undefined) {
          let run = whens.get(a.when)
          if (!run) whens.set(a.when, (run = driven(a.when, solver!.names, `world.particle3d.attach ${i}'s when`)))
          if (run(solver!.run({ ...over, ...s.drivers }, time)) === 0) continue
        }
        keep(`${i}:${s.key}`, a.effect, s)
      }
    })
    // a source that names its own effect, thrown from it with no attachment
    for (const s of sources) {
      if (s.effect === undefined) continue
      if (!(s.effect in file!.effects)) throw new Error(`particle3d's ${s.on} source ${s.key} throws the effect ${s.effect}, which the effects file has not: list the file that holds it under the effects file's files`)
      driving(s)
      keep(`:${s.key}`, s.effect, s)
    }
    for (const [key, fx] of attached) {
      if (kept.has(key)) continue
      fx.life = fx.age
      attached.delete(key)
    }
  }
  // The page's drivers this frame, its own over the ledger row's over the file's.
  let over: Values = {}
  // A driver driven that the file has none of: the sentence it throws.
  const unknown = (n: string, by: string) =>
    `${by} is driven by ${n}, which its effects file has no driver of${solver!.names.length ? `: its drivers are ${solver!.names.join(', ')}` : ''}`
  // Every driver's value this frame, the page's own over the ledger row's over the file's, and each
  // effect's own over those for its play, and every number driven written from them. A play whose
  // drivers no running effect has any more is let go.
  const solve = (plugins: Plugins) => {
    const row = plugins.wire.rows.find(r => r.kind === 'particle3d')
    over = { ...(row?.data.drivers ?? {}), ...held }
    for (const n of Object.keys(over)) if (!solver!.names.includes(n)) throw new Error(unknown(n, 'particle3d'))
    page.values = solver!.run(over, time)
    for (const b of page.binds) write(b, page.values)
    const driving = new Map<Record<string, number>, Live>()
    for (const fx of ledger) if (Object.keys(fx.drivers).length && !driving.has(fx.drivers)) driving.set(fx.drivers, fx)
    for (const [drivers, fx] of driving)
      for (const [n, v] of Object.entries(drivers)) {
        if (!solver!.names.includes(n)) throw new Error(unknown(n, `particle3d effect ${fx.name}`))
        if (!Number.isFinite(v)) throw new Error(`particle3d effect ${fx.name} has its driver ${n} at ${v}, and a driver is a finite number`)
      }
    // kept while an effect running plays from it or has particles of it
    const kept = new Set(ledger.flatMap(fx => [...fx.uses]))
    for (const [drivers, p] of plays) if (!kept.has(p) && !driving.has(drivers)) plays.delete(drivers)
    for (const [drivers, p] of plays) {
      p.values = solver!.run({ ...over, ...drivers }, time)
      for (const b of p.binds) write(b, p.values)
    }
  }

  const spawn = (name: string, at: number[], s: Spawn, seed: number, server?: number, drivers?: Record<string, number>): Live => {
    const fx: Live = {
      name, at: [...at], dir: s.dir ? [...s.dir] : undefined, to: s.to ? [...s.to] : undefined, life: s.life ?? 0, drivers: drivers ?? { ...s.drivers }, age: 0,
      tint: s.tint, scale: s.scale ?? 1, floor: s.floor, die: seeded(seed), bursts: [], last: [], held: [], uses: new Set(), parts: 0, server,
      from: s.from, fly: s.fly, land: s.land && structuredClone(s.land), landed: false, vel: [0, 0, 0],
    }
    if (fx.from !== undefined) fx.life = Infinity
    if (fx.fly !== undefined) fx.life = flight(name, fx.at, fx.to, fx.fly)
    ledger.push(fx)
    fresh.add(fx)
    return fx
  }

  // An effect from a row that has gone: its life is over now, and one that has thrown nothing yet is
  // gone with it.
  const end = (fx: Live) => {
    fx.from = undefined
    fx.life = fx.age
    if (!fx.layers) ledger = ledger.filter(f => f !== fx)
  }

  // The effects an effect throws where it lands, the frame its life is over: each thrown this frame,
  // one step older the next, driven by its land entry's own drivers, else a copy of the landing effect's.
  const land = (fx: Live) => {
    if (!fx.land || fx.landed || fx.age < fx.life - 1e-9) return
    fx.landed = true
    const at = fx.to ?? point(fx)
    for (const { effect, seed, ...s } of fx.land) fresh.delete(spawn(effect, at, { ...s, drivers: s.drivers ?? fx.drivers }, seed ?? Math.floor(fx.die() * 2 ** 32)))
  }

  // The words the scene's mods deliver, read once; each word's numbers' Drawing and this frame's particles
  // of it, by the word and its numbers.
  let words_: Record<string, Drawer> = {}
  const drawings = new Map<string, { drawing?: Drawing; list: Put[] }>()
  // Every Drawing handed this frame's particles of it, none for one that has none.
  const drawWords = () => {
    for (const d of drawings.values()) {
      d.drawing?.put(d.list)
      d.list = []
    }
  }

  // What the `solids` mods hand over this frame, nearest first.
  let meets: Meet[] = []
  const meet: Meet = (from, dir, far) => {
    let best: ReturnType<Meet>
    for (const m of meets) {
      const h = m(from, dir, far)
      if (h && (!best || h.t < best.t)) best = h
    }
    return best
  }

  // A particle that bounces striking a surface whose outward normal is `n`, `into` its speed along it
  // (below 0): its speed into the surface mirrored out of it, and its whole speed then times its
  // bounce; its spin then that of a ball of its size rolling at its speed along the surface, turning
  // the way it turned, so it tumbles as fast as it skids and stops turning as it stops.
  const strike = (q: Part, n: number[], into: number) => {
    const v = q.v, b = q.layer.bounce!
    for (let i = 0; i < 3; i++) v[i] = (v[i] - 2 * into * n[i]) * b
    const along = v[0] * n[0] + v[1] * n[1] + v[2] * n[2]
    const slide = Math.hypot(v[0] - along * n[0], v[1] - along * n[1], v[2] - along * n[2])
    const radius = sized(q) / 2
    // a layer with no `spin` stands upright, struck or not
    if (q.layer.spin && radius > 0) q.spin = (q.spin < 0 ? -1 : 1) * (slide / radius)
  }

  // The point a set of forces pulls toward and swirls about: its `at` off where it is anchored, times the
  // effect's scale. Anchored to the particle (as a layer's own forces always are), that is the point the
  // particle was thrown from; to the effect, the point of the effect thrown that the particle's chain of
  // carrying began from, so every particle of it, carried or not, shares one.
  // Written into `out`, as each of the step's points and lines below is: the step runs one particle
  // and one set of forces at a time, so each is kept from call to call and makes nothing.
  const centre = (q: Part, f: Force, out: V3): V3 => {
    const s = q.fx.scale, c = f.at
    const from = f.anchor === 'effect' ? point(q.fx.root ?? q.fx) : q.o
    out[0] = from[0] + (c ? c[0] * s : 0)
    out[1] = from[1] + (c ? c[1] * s : 0)
    out[2] = from[2] + (c ? c[2] * s : 0)
    return out
  }
  const middle: V3 = [0, 0, 0], axis: V3 = [0, 0, 0], spot: V3 = [0, 0, 0], swept: V3 = [0, 0, 0], way: number[] = [0, 0, 0]
  const UP = [0, 1, 0]
  // How much of a set of forces reaches a particle where it is: with a `range`, nothing beyond it, and
  // within it (1 - distance / range) to the `falloff` (0, the default, the whole of it up to the edge),
  // the range times the effect's scale; times 1 + `noiseAmplitude` times the noise field at the
  // particle's place times `noiseFrequency`, so 0 amplitude is the force as it is everywhere.
  const reach = (q: Part, f: Force, m: V3) => {
    let w = 1
    if (f.range !== undefined) {
      const r = f.range * q.fx.scale, p = q.p
      const d = Math.hypot(p[0] - m[0], p[1] - m[1], p[2] - m[2])
      if (d >= r) return 0
      if (f.falloff) w *= Math.pow(1 - d / r, f.falloff)
    }
    if (f.overLife) w *= stop(f.overLife, part(q))
    if (f.overAge) w *= stop(f.overAge, since(q))
    if (f.noiseAmplitude) {
      const at = field(q, f, spot)
      w *= Math.max(0, 1 + f.noiseAmplitude * noise(at[0], at[1], at[2]))
    }
    return w
  }
  // The seconds since the effect thrown that a particle's chain of carrying began from was thrown, as of
  // the step being run: `behind` seconds back for a burst a page is catching up.
  let behind = 0
  const since = (q: Part) => (q.fx.root ?? q.fx).age - behind
  // Where a particle is in an entry's noise fields: its place, less how far they have scrolled since the
  // effect was thrown, times the noise's frequency.
  const field = (q: Part, f: Force, out: V3): V3 => {
    const n = f.noiseFrequency ?? 1, p = q.p, s = f.noiseScroll, t = s ? since(q) * q.fx.scale : 0
    out[0] = (p[0] - (s ? s[0] * t : 0)) * n
    out[1] = (p[1] - (s ? s[1] * t : 0)) * n
    out[2] = (p[2] - (s ? s[2] * t : 0)) * n
    return out
  }
  // The line an entry's swirl turns about, and its pull to the axis draws toward: its `axis`, else the
  // layer's, else the layer's `dir`, else the spawn's, else straight up.
  const line = (q: Part, f: Force, out: V3): V3 => {
    const a = f.axis ?? q.layer.axis ?? q.layer.dir ?? q.fx.dir ?? UP
    const l = Math.hypot(a[0], a[1], a[2])
    out[0] = a[0] / l
    out[1] = a[1] / l
    out[2] = a[2] / l
    return out
  }
  // What one set of forces, a layer's own or an entry of a force generator it is in, does to a particle's
  // speed in a step, `k` times as hard, times how much of it reaches the particle: its drag, its pull
  // toward its centre, its gravity, and its push along `direction`.
  const push = (q: Part, f: Force, k: number, dt: number) => {
    const { p, v } = q, s = q.fx.scale
    const m = centre(q, f, middle)
    const w = k * reach(q, f, m)
    if (!w) return
    if (f.drag || f.dragBySpeed) {
      // its speed through the entry's air, which the wind carries: shed toward the air's speed
      const wind = f.wind
      const ax = wind ? wind[0] * s : 0, ay = wind ? wind[1] * s : 0, az = wind ? wind[2] * s : 0
      const through = f.dragBySpeed ? Math.hypot(v[0] - ax, v[1] - ay, v[2] - az) / s : 0
      const d = Math.max(0, 1 - ((f.drag ?? 0) + (f.dragBySpeed ?? 0) * through) * w * dt)
      v[0] = ax + (v[0] - ax) * d
      v[1] = ay + (v[1] - ay) * d
      v[2] = az + (v[2] - az) * d
    }
    if (f.pull) {
      // toward the centre, or the nearest point of the line through it along the axis
      let dx = m[0] - p[0], dy = m[1] - p[1], dz = m[2] - p[2]
      if (f.toAxis) {
        const a = line(q, f, axis), along = dx * a[0] + dy * a[1] + dz * a[2]
        dx -= a[0] * along
        dy -= a[1] * along
        dz -= a[2] * along
      }
      const len = Math.hypot(dx, dy, dz)
      // with a shell, toward the surface that far off: in from outside it, out from inside it
      const sign = f.shell === undefined ? 1 : Math.sign(len - f.shell * s)
      if (len > 0) {
        v[0] += (dx / len) * f.pull * sign * w * s * dt
        v[1] += (dy / len) * f.pull * sign * w * s * dt
        v[2] += (dz / len) * f.pull * sign * w * s * dt
      }
    }
    if (f.g) v[1] -= f.g * w * s * dt
    if (f.direction) for (let i = 0; i < 3; i++) v[i] += f.direction[i] * w * s * dt
    if (f.turbulence) {
      const at = field(q, f, spot), c = curlInto(swept, at[0], at[1], at[2])
      for (let i = 0; i < 3; i++) v[i] += c[i] * f.turbulence * w * s * dt
    }
  }
  // Its swirl: the particle carried round the line through its centre along the axis, Rodrigues' turn,
  // and its way of going with it. `turn` is the radians, the swirl of the step times its strength and
  // pace, times how much of it reaches the particle.
  const whirl = (q: Part, f: Force, turn: number) => {
    const { p, v } = q
    const a = line(q, f, axis)
    const m = centre(q, f, middle)
    turn *= reach(q, f, m)
    if (!turn) return
    const cos = Math.cos(turn), sin = Math.sin(turn)
    // its place turned about the line through the centre, and its way of going turned with it
    const x0 = p[0] - m[0], x1 = p[1] - m[1], x2 = p[2] - m[2]
    const d = a[0] * x0 + a[1] * x1 + a[2] * x2
    p[0] = m[0] + (x0 * cos + (a[1] * x2 - a[2] * x1) * sin + a[0] * d * (1 - cos))
    p[1] = m[1] + (x1 * cos + (a[2] * x0 - a[0] * x2) * sin + a[1] * d * (1 - cos))
    p[2] = m[2] + (x2 * cos + (a[0] * x1 - a[1] * x0) * sin + a[2] * d * (1 - cos))
    const v0 = v[0], v1 = v[1], v2 = v[2]
    const e = a[0] * v0 + a[1] * v1 + a[2] * v2
    v[0] = v0 * cos + (a[1] * v2 - a[2] * v1) * sin + a[0] * e * (1 - cos)
    v[1] = v1 * cos + (a[2] * v0 - a[0] * v2) * sin + a[1] * e * (1 - cos)
    v[2] = v2 * cos + (a[0] * v1 - a[1] * v0) * sin + a[2] * e * (1 - cos)
  }
  // The gravity on a layer's particles, which a particle resting on the floor is let lie still under: its
  // own and that of every generator it is in, a generator's `direction` downward counted with its `g`,
  // each at its whole strength.
  const weight = (q: Part) => {
    const l = q.layer
    let g = l.g ?? 0
    const among = fields.get(l)
    if (among) for (const { name, list } of among) for (const f of list) g += ((f.g ?? 0) - (f.direction?.[1] ?? 0)) * strength(q, name)
    return g
  }

  // One step of a particle's motion.
  const move = (q: Part, dt: number) => {
    const { layer: l, p, v } = q
    const among = fields.get(l)
    push(q, l, 1, dt)
    if (among) for (const { name, list } of among) {
      const s = strength(q, name)
      if (s) for (const f of list) push(q, f, s, dt)
    }
    const k = l.pace ? (reached(l.pace, q.age)?.[1] ?? 1) : 1
    // A particle that bounces goes as far as the first solid on its way, leaves it mirrored, and goes
    // the rest of its step the new way; up to four times a step, a corner's walls.
    let left = dt * k
    for (let bounces = 0; l.bounce !== undefined && meets.length && bounces < 4 && left > 0; bounces++) {
      const speed = Math.hypot(v[0], v[1], v[2]), far = speed * left
      way[0] = v[0] / speed
      way[1] = v[1] / speed
      way[2] = v[2] / speed
      const hit = far > 0 ? meet(p, way, far) : undefined
      if (!hit) break
      const s = hit.t / speed
      for (let i = 0; i < 3; i++) p[i] += v[i] * s
      left -= s
      const n = hit.normal, into = v[0] * n[0] + v[1] * n[1] + v[2] * n[2]
      if (into < 0) strike(q, n, into)
      for (let i = 0; i < 3; i++) p[i] += n[i] * 1e-4
    }
    for (let i = 0; i < 3; i++) p[i] += v[i] * left
    if (l.swirl) whirl(q, l, l.swirl * dt * k)
    if (among) for (const { name, list } of among) {
      const s = strength(q, name)
      if (s) for (const f of list) if (f.swirl) whirl(q, f, f.swirl * s * dt * k)
    }
    const floor = q.fx.floor
    if (floor !== undefined && p[1] < floor) {
      p[1] = floor
      // one that bounces goes back up with that much of its fall, unless that is less than a step of
      // its fall, when it comes to rest
      if (v[1] < 0) {
        if (l.bounce === undefined) v[1] = 0
        else {
          // its fall struck as a surface facing up strikes it, then left at rest when what it goes back
          // up with is less than two steps of its fall
          strike(q, UP, v[1])
          if (v[1] <= weight(q) * q.fx.scale * dt * 2) v[1] = 0
        }
      }
    }
    q.rot += q.spin * dt
    q.age += dt
  }

  // A unit direction for a particle of this layer, off `die`.
  const aim = (fx: Live, l: Emitter): V3 => {
    const u = fx.die(), w = fx.die()
    const d = l.dir ?? fx.dir
    if (l.spread === undefined) {
      const y = 2 * u - 1, r = Math.sqrt(1 - y * y), a = 2 * Math.PI * w
      return [r * Math.cos(a), y, r * Math.sin(a)]
    }
    if (!d) throw new Error(`a particle3d layer of ${fx.name} has a spread and no dir, and neither has its spawn`)
    const z = unit(d)
    // Two unit vectors square to z and to each other.
    const x = unit(cross(Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], z))
    const y = cross(z, x)
    const cos = 1 - u * (1 - Math.cos(l.spread)), sin = Math.sqrt(1 - cos * cos), a = 2 * Math.PI * w
    return [0, 1, 2].map(i => z[i] * cos + (x[i] * Math.cos(a) + y[i] * Math.sin(a)) * sin) as V3
  }

  // One burst of a layer, thrown at `t` seconds into the effect and aged to the effect's age now.
  const burst = (fx: Live, l: Emitter, t: number, dt: number, cap: number) => {
    const at = point(fx)
    const n = Math.round(lerp(l.n, fx.die(), 1))
    for (let i = 0; i < n; i++) {
      const dir = aim(fx, l)
      const speed = lerp(l.speed, fx.die(), 0) * fx.scale
      const life = lerp(l.life, fx.die(), 0)
      const skip = (l.skip ?? 0) * fx.die()
      const size = lerp(l.size, fx.die(), 1) * fx.scale
      const j = l.jitter ?? [0, 0, 0]
      const p: V3 = [0, 1, 2].map(k => at[k] + (fx.die() - fx.die()) * j[k] * fx.scale) as V3
      const spin = l.spin ? (fx.die() * 2 - 1) * l.spin : 0
      const rot = l.spin ? fx.die() * 2 * Math.PI : 0
      if (l.box) for (let k = 0; k < 3; k++) p[k] += (l.box[k] + (l.box[k + 3] - l.box[k]) * fx.die()) * fx.scale
      // rolled whether or not the particle is kept, so every page rolls the same
      const seed = l.carry ? Math.floor(fx.die() * 2 ** 32) : 0
      const pick = wordsOf(l).length ? fx.die() : 0
      const begin = l.start ? lerp(l.start, fx.die(), 0) : 0
      // straight away from the point, for one that starts off it; the way it was aimed for one on it
      const out = l.outward ? lerp(l.outward, fx.die(), 0) * fx.scale : 0
      const off = [p[0] - at[0], p[1] - at[1], p[2] - at[2]], far = Math.hypot(off[0], off[1], off[2])
      const away = far > 1e-9 ? [off[0] / far, off[1] / far, off[2] / far] : dir
      // where in each strength that is a range this particle is
      let rolls: Record<string, number> | undefined
      for (const [g, s] of Object.entries(l.forces ?? {})) if (typeof s !== 'number') (rolls ??= {})[g] = fx.die()
      if (parts.length >= cap) continue
      const share = l.inherit ?? 0
      const q: Part = {
        fx, layer: l, p, v: [0, 1, 2].map(k => dir[k] * speed + away[k] * out + fx.vel[k] * share) as V3, o: [at[0], at[1], at[2]],
        age: skip, life, lasts: l.lasts ? t - skip : undefined, s0: size, s1: size * (l.grow ?? 1), rot, spin, pick, begin, rolls,
      }
      const thrown = q.age
      for (let left = fx.age - t; left > 1e-9 && alive(q); left -= dt) {
        behind = left
        move(q, Math.min(dt, left))
      }
      behind = 0
      if (!alive(q)) continue
      parts.push(q)
      fx.parts++
      if (!l.carry) continue
      // Its effect, as old as the particle has flown, from where the particle is now, driven by the
      // drivers of the effect that throws it, the one object. It is run this frame by the loop that fired
      // this burst, so it is not left among those spawned since the last.
      const c = spawn(l.carry, place(q), { tint: fx.tint, scale: fx.scale, floor: fx.floor, life: Infinity }, seed, undefined, fx.drivers)
      fresh.delete(c)
      c.age = q.age - thrown
      c.root = fx.root ?? fx
      c.vel = [...q.v]
      q.carried = c
      ride(q)
    }
  }

  // A layer's next burst, in seconds into the effect: its first at its `after` (or when a stream held
  // before it is let go, whichever is later), then `every` on from its last at the `every` of now.
  const next = (fx: Live, l: Emitter, i: number) => (fx.bursts[i] === 0 ? Math.max(l.after ?? 0, fx.last[i]) : fx.last[i] + (l.every ?? 0))
  // A stream held: a layer whose `every` is driven, at 0 now.
  const paused = (fx: Live, l: Emitter) => !l.every && fx.play!.streams.has(l)

  // Fires every burst of the effect due now, in time order and layer order, which is the order every page
  // rolls them in. A stream whose `every` is driven to 0 is held: it throws nothing while it is, its first
  // burst too, and the frame it is driven above 0 again it bursts at once (or at its `after`, for a first
  // burst not yet due) and `every` on from then, none rolled for the seconds it was held.
  const fire = (fx: Live, dt: number, cap: number) => {
    const due: [number, number][] = []
    fx.layers!.forEach((l, i) => {
      if (paused(fx, l)) {
        fx.held[i] = true
        return
      }
      // let go this frame: its next burst is now
      if (fx.held[i]) {
        fx.held[i] = false
        fx.last[i] = fx.bursts[i] > 0 ? fx.age - l.every! : fx.age
      }
      for (;;) {
        const t = next(fx, l, i)
        if (fx.bursts[i] > 0 && !l.every) break
        if (fx.bursts[i] > 0 && t >= fx.life) break
        if (t > fx.age + 1e-9) break
        due.push([t, i])
        fx.bursts[i]++
        fx.last[i] = t
      }
    })
    due.sort((a, b) => a[0] - b[0] || a[1] - b[1])
    for (const [t, i] of due) burst(fx, fx.layers![i], t, dt, cap)
  }

  // An effect's layers read again from the play it plays from now: the effects file written again, or
  // its drivers' play another than the one it played from. Each of its particles follows its layer's new
  // numbers from then on, and a layer it did not have before fires the bursts it would have fired by now,
  // as a page that first sees the effect late does.
  const relayer = (fx: Live) => {
    const play = playOf(fx)
    const { layers: next, lamps } = playing(play, fx.name)
    for (const q of parts) if (q.fx === fx) q.layer = next[fx.layers!.indexOf(q.layer)] ?? q.layer
    fx.bursts = next.map((_, i) => fx.bursts[i] ?? 0)
    fx.last = next.map((_, i) => fx.last[i] ?? 0)
    fx.held = next.map((_, i) => fx.held[i] ?? false)
    fx.layers = next
    fx.lamps = lamps
    fx.play = play
    fx.uses.add(play)
  }

  // Whether a layer has another burst to come: a stream held at an `every` of 0 while the effect's life
  // lasts, else its first, or one more `every` before the effect's life is over.
  const more = (fx: Live) => fx.layers!.some((l, i) =>
    paused(fx, l) ? fx.age < fx.life - 1e-9 : fx.bursts[i] === 0 || (!!l.every && next(fx, l, i) < fx.life))

  // A mesh's material: `map`, a page of a sheet, or none for flat squares. One material draws both
  // blends, so a mesh's particles are drawn in one order, far to near, smoke and light together: each
  // pixel's colour times its alpha is laid over what is behind it less that alpha, and a vertex's `keep`,
  // 1 for a particle laid over and 0 for one that adds its light, is times the alpha it hides by, so a
  // particle that adds hides nothing.
  //
  // A batch drawn another way (`How`) reads its picture so: with `blend`, the next frame's corners
  // (`frame2`) and how far it is laid into it; with `channels`, the picture's channels, back in the
  // numbers the bake wrote, weighed into its brightness, its opacity and how white-hot it is; with
  // `erode`, its opacity cut below the particle's cut and stretched back to whole.
  const material = (plugins: Plugins, map: any, how: How) => {
    const { THREE } = plugins.render3d
    const m = new THREE.MeshBasicMaterial({
      map, vertexColors: true, transparent: true, depthWrite: false, alphaTest: file!.alphaTest ?? 0,
      premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    const vec = (w: number[]) => `vec4(${w.map(n => n.toFixed(6)).join(', ')})`
    const c = how.channels
    const read = [
      'vec4 t = texture2D(map, vMapUv);',
      how.blend ? 't = mix(t, texture2D(map, vFrame2), vLook.x);' : '',
      c ? 't = vec4(sRGBTransferOETF(vec4(t.rgb, 1.0)).rgb, t.a);' : '',
      c ? `float cover = dot(t, ${vec(c.alpha)});` : 'float cover = t.a;',
      how.erode ? 'cover = clamp((cover - vLook.y) / max(1.0 - vLook.y, 1e-3), 0.0, 1.0);' : '',
      c
        ? `float hot = clamp(dot(t, ${vec(c.hot)}), 0.0, 1.0); float top = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);` +
          ` diffuseColor.rgb = mix(diffuseColor.rgb * dot(t, ${vec(c.value)}), vec3(top), hot);`
        : 'diffuseColor.rgb *= t.rgb;',
      'diffuseColor.a *= cover;',
    ].join('\n')
    m.onBeforeCompile = (shader: { vertexShader: string; fragmentShader: string }) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float keep;\nvarying float vKeep;\nattribute vec2 frame2;\nattribute vec2 look;\nvarying vec2 vFrame2;\nvarying vec2 vLook;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKeep = keep;\nvLook = look;\n#ifdef USE_MAP\nvFrame2 = (mapTransform * vec3(frame2, 1.0)).xy;\n#endif')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vKeep;\nvarying vec2 vFrame2;\nvarying vec2 vLook;')
        .replace('#include <map_fragment>', `#ifdef USE_MAP\n${read}\n#endif`)
        .replace('#include <premultiplied_alpha_fragment>', '#include <premultiplied_alpha_fragment>\ngl_FragColor.a *= vKeep;')
    }
    m.customProgramCacheKey = () => `particle3d ${how.key}`
    return m
  }

  // How each layer is drawn, worked out once for it.
  const hows = new WeakMap<Emitter, How>()
  const howOf = (l: Emitter): How => {
    let h = hows.get(l)
    if (!h) hows.set(l, (h = { key: JSON.stringify([l.channels ?? null, !!l.blend, !!l.erode]), channels: l.channels, blend: !!l.blend, erode: !!l.erode }))
    return h
  }

  // The mesh of a page of a sheet, with room for `count` quads. Its material is made again when the
  // page or the file's `alphaTest` it was made with is no longer the one there is: a sheet or the
  // effects file written again.
  const group = (plugins: Plugins, b: Batch, count: number): Group => {
    const { THREE, scene } = plugins.render3d
    const { sheet, page } = b
    const map = sheet === OWN ? shapes(plugins) : sheet ? plugins.loader.get(sheet).pages[page] : null
    let g = b.group
    if (!g) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material(plugins, map, b.how))
      mesh.frustumCulled = false
      scene.add(mesh)
      b.group = g = { mesh, capacity: 0 }
    }
    if (g.mesh.material.map !== map || g.mesh.material.alphaTest !== (file!.alphaTest ?? 0)) {
      g.mesh.material.dispose()
      g.mesh.material = material(plugins, map, b.how)
    }
    if (count > g.capacity) {
      const capacity = Math.max(count, g.capacity * 2, 16)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 12), 3))
      geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(capacity * 8), 2))
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity * 16), 4))
      geometry.setAttribute('keep', new THREE.BufferAttribute(new Float32Array(capacity * 4), 1))
      geometry.setAttribute('frame2', new THREE.BufferAttribute(new Float32Array(capacity * 8), 2))
      geometry.setAttribute('look', new THREE.BufferAttribute(new Float32Array(capacity * 8), 2))
      const index = new Uint32Array(capacity * 6)
      for (let i = 0; i < capacity; i++) index.set([4 * i, 4 * i + 1, 4 * i + 2, 4 * i, 4 * i + 2, 4 * i + 3], 6 * i)
      geometry.setIndex(new THREE.BufferAttribute(index, 1))
      g.mesh.geometry.dispose()
      g.mesh.geometry = geometry
      g.capacity = capacity
    }
    return g
  }

  // particle3d's own shapes as one texture, made the first time a particle is drawn as one, with
  // mipmaps so a shape far off stays soft.
  let own: any
  const shapes = (plugins: Plugins) => {
    if (own) return own
    const { THREE } = plugins.render3d
    own = new THREE.DataTexture(strip(), CELL * SHAPES.length, CELL, THREE.RGBAFormat)
    own.colorSpace = THREE.SRGBColorSpace
    own.magFilter = THREE.LinearFilter
    own.minFilter = THREE.LinearMipmapLinearFilter
    own.generateMipmaps = true
    own.needsUpdate = true
    return own
  }

  const ppm = () => {
    if (!file!.ppm) throw new Error('particle3d draws an effect from a sheet, and its effects file gives no ppm')
    return file!.ppm
  }

  // Every running effect's lamps, each a light at the effect's point and its `at` times the effect's
  // `scale` off it, a spot turned along the effect's `dir`, or straight down where it has none; its
  // colour its `tint`, else the spawn's, else white; its strength dimmed by its flicker. A lamp is made
  // the first frame its effect runs and taken away the frame the effect is gone, or the file no longer
  // gives the effect that lamp.
  const lamp = (plugins: Plugins) => {
    const { THREE, scene } = plugins.render3d
    const away = (lights: any[]) => {
      for (const light of lights) {
        scene.remove(light)
        if (light.target) scene.remove(light.target)
        light.dispose()
      }
    }
    for (const [fx, lights] of lamps) {
      if (ledger.includes(fx) && lights.length === (fx.lamps?.length ?? 0)) continue
      away(lights)
      lamps.delete(fx)
    }
    for (const fx of ledger) {
      if (!fx.lamps?.length) continue
      let lights = lamps.get(fx)
      if (!lights || lights.some((light, i) => !!light.isSpotLight !== !!fx.lamps![i].spot)) {
        if (lights) away(lights)
        lights = fx.lamps.map(l => {
          const light = l.spot ? new THREE.SpotLight() : new THREE.PointLight()
          scene.add(light)
          if (l.spot) scene.add(light.target)
          return light
        })
        lamps.set(fx, lights)
      }
      const at = point(fx)
      fx.lamps.forEach((l, i) => {
        const light = lights![i]
        const [x, y, z] = l.at ?? [0, 0, 0]
        light.position.set(at[0] + x * fx.scale, at[1] + y * fx.scale, at[2] + z * fx.scale)
        light.color.setHex(l.tint ?? fx.tint ?? 0xffffff)
        // three waves of no common beat, so a lamp's light wavers without a pattern: from its whole
        // strength down to `1 - flicker` of it, the same on every page, which share the effect's age
        const t = fx.age, w = 0.5 + 0.5 * (0.5 * Math.sin(t * 7.3 + i) + 0.3 * Math.sin(t * 13.1 + 2 * i) + 0.2 * Math.sin(t * 23.7 + 3 * i))
        light.intensity = l.intensity * (1 - (l.flicker ?? 0) * w)
        light.distance = l.distance * fx.scale
        light.decay = l.decay
        light.castShadow = !!l.shadow
        if (l.spot) {
          const d = unit(fx.dir ?? [0, -1, 0])
          light.angle = l.spot.angle
          light.penumbra = l.spot.penumbra
          light.target.position.set(light.position.x + d[0], light.position.y + d[1], light.position.z + d[2])
          light.target.updateMatrixWorld()
        }
      })
    }
  }

  // Each of a colour channel's 256 values made linear, made by three.js the first frame anything is drawn.
  let linear: Float64Array | undefined
  // The picture's corners `c`, top left, top right, bottom left, bottom right, written at `o` onto the
  // quad's bottom left, bottom right, top right and top left, swapped side for side or top for bottom
  // when it is flipped.
  const quad = (to: { [i: number]: number }, o: number, c: number[], fx: boolean, fy: boolean) => {
    const bottom = fy ? 0 : 4, top = fy ? 4 : 0, left = fx ? 2 : 0, right = fx ? 0 : 2
    to[o] = c[bottom + left]
    to[o + 1] = c[bottom + left + 1]
    to[o + 2] = c[bottom + right]
    to[o + 3] = c[bottom + right + 1]
    to[o + 4] = c[top + right]
    to[o + 5] = c[top + right + 1]
    to[o + 6] = c[top + left]
    to[o + 7] = c[top + left + 1]
  }

  // Writes every particle of each mesh into its buffers, as quads facing the camera.
  const draw = (plugins: Plugins) => {
    for (const b of made) {
      b.group?.mesh.geometry.setDrawRange(0, 0)
      b.n = 0
    }
    drawn.length = 0
    if (!parts.length) return
    const { THREE, camera } = plugins.render3d
    if (!camera) throw new Error('particle3d has particles to draw and render3d has no camera')
    // A colour in the file is sRGB, as a three.js material's is, and the buffer's are linear: each of
    // a channel's 256 values made linear once, by three.js itself, and looked up from then on.
    if (!linear) {
      const colour = new THREE.Color()
      linear = new Float64Array(256)
      for (let i = 0; i < 256; i++) linear[i] = colour.setHex(i << 16).r
    }
    const lin = linear
    camera.updateMatrixWorld()
    const e = camera.matrixWorld.elements
    const R = unit([e[0], e[1], e[2]]), U = unit([e[4], e[5], e[6]]), B = unit([e[8], e[9], e[10]])
    // Each running effect's point this frame, worked out once however many of its particles ask.
    const points = new Map<Live, number[]>()
    const pointNow = (fx: Live) => {
      let at = points.get(fx)
      if (!at) points.set(fx, (at = point(fx)))
      return at
    }
    // Each particle's frame now, and the mesh of its page and its blend; a particle whose sheet the
    // loader has not handed over yet draws nothing. Each layer's sheet, and each frame of a clip and its
    // corners on the page, is looked up once this frame, however many particles show it.
    const sheets = new Map<Emitter, any>()
    const frames = new Map<any, Map<string, ({ f: Frame; uv: number[] } | undefined)[]>>()
    const look = (sheet: any, clip: string, n: number) => {
      let clips = frames.get(sheet)
      if (!clips) frames.set(sheet, (clips = new Map()))
      let list = clips.get(clip)
      if (!list) clips.set(clip, (list = []))
      let got = list[n]
      if (!got) {
        const frame: Frame = sheet.frameOf(clip, 0, n)
        list[n] = got = { f: frame, uv: sheet.uv(frame.id) }
      }
      return got
    }
    for (const q of parts) {
      if (!alive(q)) continue
      const l = q.layer, k = q.age / span(q)
      // where it is drawn: its place, or for one that follows, kept about its effect's point
      let px = q.p[0], py = q.p[1], pz = q.p[2]
      if (l.follow) {
        const at = pointNow(q.fx)
        px += at[0] - q.o[0]
        py += at[1] - q.o[1]
        pz += at[2] - q.o[2]
      }
      const said = wordsOf(l)
      if (said.length) {
        // drawn by its words' drawings, at its place, turned by its spin about the line square to its
        // way and up, at its size now
        const v = q.v, flat = Math.hypot(v[0], v[2])
        const sx = flat > 1e-9 ? -v[2] / flat : 1, sz = flat > 1e-9 ? v[0] / flat : 0
        const half = q.rot / 2, s = Math.sin(half)
        const put = { at: [px, py, pz], rot: [sx * s, 0, sz * s, Math.cos(half)], size: sized(q), pick: q.pick }
        for (const w of said) {
          let d = drawings.get(w.key)
          if (!d) drawings.set(w.key, (d = { list: [] }))
          if (!d.drawing) d.drawing = words_[w.word].draw(w.data, { plugins, name: `particle3d's ${w.word} of ${q.fx.name}` })
          d.list.push(put)
        }
        continue
      }
      let f: Frame | undefined, uv: number[] | undefined, uv2: number[] | undefined, mixed = 0
      if (l.sheet) {
        let sheet = sheets.get(l)
        if (sheet === undefined) sheets.set(l, (sheet = plugins.loader.get(l.sheet) ?? null))
        if (!sheet) {
          plugins.loader.load(l.sheet)
          continue
        }
        const run = sheet.data.clips[l.clip!]?.runs[0]
        if (!run) throw new Error(`particle3d draws clip ${l.clip} of ${l.sheet}, which it does not have`)
        // where in its clip it is, from the part its frames begin at, round past the last when it
        // has a `start`; the frame it shows, the next, and how far it is between them
        const len = run.length, along = (k + q.begin) * len
        const i = l.play ? play(sheet.data, l.clip!, 0, 0, q.age + 1e-9)[0] : l.start ? Math.floor(along) % len : Math.min(len - 1, Math.floor(along))
        const after = l.start ? (i + 1) % len : Math.min(len - 1, i + 1)
        const got = look(sheet, l.clip!, i)
        f = got.f
        uv = got.uv
        if (l.blend) {
          uv2 = look(sheet, l.clip!, after).uv
          mixed = along - Math.floor(along)
        }
      } else if (l.shape) uv = SHAPE_CORNERS.get(l.shape)
      const b = batch(l.shape ? OWN : l.sheet, f?.page ?? 0, howOf(l))
      if (!b.n) drawn.push(b)
      // how far it is behind the camera's place, along the way the camera looks back
      let bx = px, by = py, bz = pz
      if (l.beam) {
        const at = pointNow(q.fx)
        bx = at[0]
        by = at[1]
        bz = at[2]
      }
      const back = (bx - e[12]) * B[0] + (by - e[13]) * B[1] + (bz - e[14]) * B[2]
      const at = b.list[b.n]
      if (at) {
        at.q = q
        at.f = f
        at.uv = uv
        at.uv2 = uv2
        at.mixed = mixed
        at.back = back
      } else b.list.push({ q, f, uv, uv2, mixed, back })
      b.n++
    }
    for (const b of drawn) {
      const { list, n: count } = b
      // this frame's particles alone, the farthest from the camera first, so a near one is laid over a
      // far one; two as far as each other in the order they were thrown
      list.length = count
      list.sort((x, y) => x.back - y.back)
      const g = group(plugins, b, count)
      const geometry = g.mesh.geometry
      const pos = geometry.attributes.position.array, uv = geometry.attributes.uv.array, col = geometry.attributes.color.array, keep = geometry.attributes.keep.array
      const frame2 = geometry.attributes.frame2.array, look = geometry.attributes.look.array
      for (let n = 0; n < count; n++) {
        const { q, f, uv: box, uv2, mixed } = list[n]
        const l = q.layer, k = q.age / span(q)
        const size = sized(q)
        let w = (f ? f.size[0] / ppm() : 1) * size
        const h = (f ? f.size[1] / ppm() : 1) * size
        // Where the quad's place is, and its right and up.
        let ax = q.p[0], ay = q.p[1], az = q.p[2]
        let rx: number, ry: number, rz: number, ux: number, uy: number, uz: number
        let ox: number, oy: number
        if (l.origin) {
          ox = l.origin[0]
          oy = l.origin[1]
        } else if (l.stretch) {
          ox = 1
          oy = 0.5
        } else if (f) {
          ox = f.anchor[0] / f.size[0]
          oy = f.anchor[1] / f.size[1]
        } else ox = oy = 0.5
        if (l.follow) {
          const at = pointNow(q.fx)
          ax += at[0] - q.o[0]
          ay += at[1] - q.o[1]
          az += at[2] - q.o[2]
        }
        if (l.beam) {
          if (!q.fx.to) throw new Error(`particle3d effect ${q.fx.name} has a beam and was spawned with no to`)
          const from = pointNow(q.fx), to = q.fx.to
          const gx = to[0] - from[0], gy = to[1] - from[1], gz = to[2] - from[2]
          w = Math.hypot(gx, gy, gz)
          ax = from[0]
          ay = from[1]
          az = from[2]
          if (w) {
            rx = gx / w
            ry = gy / w
            rz = gz / w
          } else {
            rx = R[0]
            ry = R[1]
            rz = R[2]
          }
          // up is square to the beam and to the way the camera looks back
          const cx = B[1] * rz - B[2] * ry, cy = B[2] * rx - B[0] * rz, cz = B[0] * ry - B[1] * rx
          const cl = Math.hypot(cx, cy, cz)
          if (cl > 1e-9) {
            ux = cx / cl
            uy = cy / cl
            uz = cz / cl
          } else {
            ux = U[0]
            uy = U[1]
            uz = U[2]
          }
          ox = 0
          oy = 0.5
        } else {
          let turn = q.rot
          const along = l.stretch ? q.v : l.face ? (l.dir ?? q.fx.dir) : undefined
          if (along) {
            const x = along[0] * R[0] + along[1] * R[1] + along[2] * R[2], y = along[0] * U[0] + along[1] * U[1] + along[2] * U[2]
            if (x || y) turn = Math.atan2(y, x)
          }
          const cos = Math.cos(turn), sin = Math.sin(turn)
          rx = cos * R[0] + sin * U[0]
          ry = cos * R[1] + sin * U[1]
          rz = cos * R[2] + sin * U[2]
          ux = -sin * R[0] + cos * U[0]
          uy = -sin * R[1] + cos * U[1]
          uz = -sin * R[2] + cos * U[2]
        }
        // The quad spans the pixels the sheet kept, where they were in the whole frame, mirrored
        // across or upside down in the frame's own place.
        const flip = reached(l.flips, q.age)
        const fx = !!flip?.[1], fy = !!flip?.[2]
        let tx = 0, ty = 0, tw = 1, th = 1
        if (f) {
          tx = f.trim[0] / f.size[0]
          ty = f.trim[1] / f.size[1]
          tw = f.trim[2] / f.size[0]
          th = f.trim[3] / f.size[1]
        }
        if (fx) tx = 1 - tx - tw
        if (fy) ty = 1 - ty - th
        const left = (tx - ox) * w, right = (tx + tw - ox) * w, bottom = (oy - ty - th) * h, top = (oy - ty) * h
        // its corners: bottom left, bottom right, top right, top left
        const p = 12 * n
        pos[p] = ax + left * rx + bottom * ux
        pos[p + 1] = ay + left * ry + bottom * uy
        pos[p + 2] = az + left * rz + bottom * uz
        pos[p + 3] = ax + right * rx + bottom * ux
        pos[p + 4] = ay + right * ry + bottom * uy
        pos[p + 5] = az + right * rz + bottom * uz
        pos[p + 6] = ax + right * rx + top * ux
        pos[p + 7] = ay + right * ry + top * uy
        pos[p + 8] = az + right * rz + top * uz
        pos[p + 9] = ax + left * rx + top * ux
        pos[p + 10] = ay + left * ry + top * uy
        pos[p + 11] = az + left * rz + top * uz
        const c = box ?? WHOLE
        quad(uv, 8 * n, c, fx, fy)
        // the next frame's corners and how far it is laid in, and where its opacity is cut
        quad(frame2, 8 * n, uv2 ?? c, fx, fy)
        const cut = l.erode ? stop(l.erode, k) : 0
        for (let v = 0; v < 4; v++) {
          look[8 * n + 2 * v] = mixed
          look[8 * n + 2 * v + 1] = cut
        }
        const from = l.tint ?? q.fx.tint ?? 0xffffff
        const rgb = Math.floor(l.tints ? tintAt(l.tints, k) : l.tint1 === undefined ? from : mix(from, l.tint1, k))
        const fading = l.fade === undefined ? k : Math.max(0, 1 - (span(q) - q.age) / l.fade)
        const a = l.alphas ? stop(l.alphas, k) : (l.a0 ?? 1) + ((l.a1 ?? 1) - (l.a0 ?? 1)) * fading
        const gain = l.gain ?? 1
        const cr = lin[(rgb >> 16) & 255] * gain, cg = lin[(rgb >> 8) & 255] * gain, cb = lin[rgb & 255] * gain
        for (let v = 0; v < 4; v++) {
          const o = 16 * n + 4 * v
          col[o] = cr
          col[o + 1] = cg
          col[o + 2] = cb
          col[o + 3] = a
        }
        keep.fill(l.add ? 0 : 1, 4 * n, 4 * n + 4)
      }
      geometry.attributes.position.needsUpdate = geometry.attributes.uv.needsUpdate = geometry.attributes.color.needsUpdate = geometry.attributes.keep.needsUpdate = true
      geometry.attributes.frame2.needsUpdate = geometry.attributes.look.needsUpdate = true
      geometry.setDrawRange(0, count * 6)
    }
  }

  // The batch of a sheet's page, made the first time one is asked for.
  const batch = (sheet: string | undefined, page: number, how: How): Batch => {
    let pages = batches.get(sheet)
    if (!pages) batches.set(sheet, (pages = new Map()))
    let ways = pages.get(page)
    if (!ways) pages.set(page, (ways = new Map()))
    let b = ways.get(how.key)
    if (!b) {
      ways.set(how.key, (b = { sheet, page, how, list: [], n: 0 }))
      made.push(b)
    }
    return b
  }

  // `world.particle3d`, once the order of the plugins has been checked and the loader asked for the file.
  const setup = (plugins: Plugins) => {
    const { scene } = plugins.wire
    const own = scene.world?.particle3d
    if (!own) throw new Error('the scene names particle3d but gives no world.particle3d')
    if (!checked) {
      checked = true
      const order = scene.plugins!
      if (order.indexOf('render3d') < order.indexOf('particle3d'))
        throw new Error('particle3d is listed after render3d, which would draw every particle before it is turned')
    }
    if (!asked) {
      if (!plugins.loader) throw new Error('particle3d reads its effects through loader, which this scene does not name')
      asked = true
      words_ = drawers(scene.world!)
      plugins.loader.on(own.effects, (it: Effects) => gather(plugins, own.effects, it))
      plugins.loader.onWritten(own.effects, () => { stale = unchecked = true })
    }
    return own
  }

  // The effects file read, and every file it lists from its folder, their effects added to its own:
  // the one file particle3d plays from.
  const gather = (plugins: Plugins, name: string, it: Effects) => {
    if (!it.files) {
      file = it
      unchecked = true
      return
    }
    Promise.all(it.files.map(async (p): Promise<Listed> => JSON.parse(new TextDecoder().decode(await plugins.loader.beside(name, p)))))
      .then(listed => {
        file = { ...it, effects: Object.assign({}, it.effects, ...listed.map(l => l.effects)) }
        if (it.forceGenerators || listed.some(l => l.forceGenerators)) file.forceGenerators = Object.assign({}, it.forceGenerators, ...listed.map(l => l.forceGenerators))
        if (it.drivers || listed.some(l => l.drivers)) file.drivers = Object.assign({}, it.drivers, ...listed.map(l => l.drivers))
        unchecked = true
      })
  }

  const me = {
    // A page's own effect, from this frame on, its rolls seeded with `seed` when it is given. With
    // `age`, it has already run that many seconds: its bursts of those seconds are rolled and their
    // particles aged to now, as a page that joins a ledger entry late sees it, so a stream opens full.
    emit(effect: string, at: number[], s: Spawn & { seed?: number; age?: number } = {}): Effect {
      const fx = spawn(effect, at, s, s.seed ?? Math.floor(Math.random() * 2 ** 32))
      if (s.age !== undefined) fx.age = s.age
      return fx
    },
    // Whether the effects file has an effect of this name; false until it has been read.
    has(effect: string): boolean { return !!file && effect in file.effects },
    // A driver of the effects file held at `value` from the next frame, in place of what the file and the
    // ledger row say; with no value, let go back to them. One the file has none of throws that frame.
    drive(name: string, value?: number) {
      if (value === undefined) delete held[name]
      else held[name] = value
    },
    // Every driver's value as of the last frame, by name, and `time`, as the page plays them: an effect
    // with drivers of its own plays at those over these.
    get drivers(): Readonly<Values> { return page.values },
    // The ledger: every effect this page is running.
    get effects(): readonly Effect[] { return ledger },
    get count() { return parts.length },
    // Asks the loader for the effects file before the actors tick, so `has` answers them.
    tick(plugins: Plugins) { setup(plugins) },
    afterTick(plugins: Plugins) {
      const dt = plugins.wire.scene.prefabs.engine?.dt
      if (!dt) throw new Error('scene has no engine prefab with dt')
      me.step(plugins, dt)
    },
    // Every effect run on `seconds` at once, in steps no longer than the engine's `dt`, as that many
    // frames would run it: a shot of effects as they stand once they have been running a while.
    advance(plugins: Plugins, seconds: number) {
      const dt = plugins.wire.scene.prefabs.engine?.dt
      if (!dt) throw new Error('scene has no engine prefab with dt')
      if (!(seconds >= 0)) throw new Error(`particle3d: advance is a number of seconds, 0 or more, not ${seconds}`)
      for (let left = seconds; left > 1e-9; left -= dt) me.step(plugins, Math.min(dt, left))
    },
    // One frame of `dt` seconds: what `afterTick` runs each frame.
    step(plugins: Plugins, dt: number) {
      const { scene } = plugins.wire
      const own = setup(plugins)

      // The file checked the first frame it is read and the first after it is written, and its drivers
      // planned; then every driver's value this frame, before anything moves by a number driven.
      time += dt
      if (file && unchecked) {
        unchecked = false
        check(file, own, words_, scene.world)
        reread()
      }
      if (solver) solve(plugins)
      // The attachments' effects started, moved and driven by their sources, or stopped, before anything
      // moves this frame, as an actor's `emit` in its tick is.
      if (solver && (own.attach || modsOf(scene.world!, 'particle3d', 'sources').length)) attach(plugins, own.attach ?? [])

      meets = modsOf<Solids>(scene.world!, 'particle3d', 'solids').map(f => f(plugins))
      for (const q of parts) move(q, dt)
      // A particle that carries an effect takes it along, and the frame it dies its effect stops.
      let kept = 0
      for (const q of parts) {
        if (alive(q)) {
          if (q.carried) ride(q)
          parts[kept++] = q
          continue
        }
        q.fx.parts--
        // as old as it is about to be this frame, the frame its particle died
        if (q.carried) q.carried.life = q.carried.age + dt
      }
      parts.length = kept
      for (const fx of ledger) if (!fresh.has(fx)) fx.age += dt

      const row = plugins.wire.rows.find(r => r.kind === 'particle3d')
      const live: Entry[] = row?.data.live ?? []
      for (const e of live) {
        if (seen.has(e.id)) {
          const fx = ledger.find(f => f.server === e.id)
          if (fx) {
            fx.at = [...e.at]
            fx.dir = e.dir && [...e.dir]
            fx.to = e.to && [...e.to]
            // its drivers as the entry has them now, in the one object its carried effects share
            for (const n of Object.keys(fx.drivers)) if (!e.drivers || !(n in e.drivers)) delete fx.drivers[n]
            Object.assign(fx.drivers, e.drivers)
            if (e.from === undefined && fx.fly === undefined) {
              fx.from = undefined
              fx.life = e.life
            }
          }
          continue
        }
        seen.add(e.id)
        const fx = spawn(e.effect, e.at, e, e.id, e.id)
        fx.age = e.age
      }
      for (const id of seen) {
        if (live.some(e => e.id === id)) continue
        seen.delete(id)
        // An entry from a row, gone from the ledger row before this page saw it end, ends here.
        const fx = ledger.find(f => f.server === id && f.from !== undefined)
        if (fx) end(fx)
      }
      fresh = new Set()
      for (const fx of ledger) {
        if (fx.from !== undefined) {
          const from = plugins.wire.rows.find(r => r.id === fx.from)
          if (!from) end(fx)
          else if (Array.isArray(from.data.pos)) fx.at = [...from.data.pos]
        }
        if (fx.fly !== undefined) fx.life = flight(fx.name, fx.at, fx.to, fx.fly)
      }

      if (!file || !solver) return
      if (stale) {
        stale = false
        for (const fx of ledger) if (fx.layers) relayer(fx)
      }
      for (const fx of ledger) {
        if (!fx.layers) {
          fx.play = playOf(fx)
          fx.uses.add(fx.play)
          const { layers, lamps } = playing(fx.play, fx.name)
          fx.layers = layers
          fx.lamps = lamps
          fx.bursts = fx.layers.map(() => 0)
          fx.last = fx.layers.map(() => 0)
        } else if (playOf(fx) !== fx.play) relayer(fx)
        // how fast its point is moving, which a layer that inherits starts with; a carried effect's is
        // its carrier's, written as it rides
        if (!fx.root) {
          const now = point(fx)
          fx.vel = fx.was ? [0, 1, 2].map(k => ((now[k] ?? 0) - (fx.was![k] ?? 0)) / dt) : [0, 0, 0]
          fx.was = [...now]
        }
        fire(fx, dt, file.cap)
        land(fx)
      }
      ledger = ledger.filter(fx => fx.parts > 0 || more(fx) || (!!fx.land && !fx.landed) || (!!fx.lamps?.length && fx.age < fx.life - 1e-9))
      draw(plugins)
      drawWords()
      if (scene.plugins!.includes('lights3d')) lamp(plugins)
    },
    close(plugins: Plugins) {
      for (const { group: g } of made) {
        if (!g) continue
        plugins.render3d.scene.remove(g.mesh)
        g.mesh.geometry.dispose()
        g.mesh.material.dispose()
      }
      batches.clear()
      made.length = 0
      own?.dispose()
      own = undefined
      for (const d of drawings.values()) d.drawing?.dispose()
      drawings.clear()
      drawn.length = 0
      for (const lights of lamps.values()) {
        for (const light of lights) {
          plugins.render3d.scene.remove(light)
          if (light.target) plugins.render3d.scene.remove(light.target)
          light.dispose()
        }
      }
      lamps.clear()
      attached.clear()
      ledger = []
      parts = []
    },
  }
  return me
}
