// The browser half of particle2d: the page's ledger of live effects in render2d's world, each
// effect's particles, and their drawing. An effect is spawned at a point with a lifetime, and this
// plugin runs it from then until its last particle is gone; whoever spawned it does nothing more.
//
// Two things spawn one. A rule, through `emit` in `particle2d.sim.ts`: the entry is on the ledger
// row, and this half takes it the first frame it sees it, at the age it has on the row, and while
// the row still holds it follows the `at`, `dir`, `to`, `life` and `drivers` the rule may have written
// there. Anything in the page — an actor, a local actor, another plugin — through this half's `emit`,
// which hands the effect back: writing its `at`, `dir` or `to` moves it, writing its `life` stops it,
// writing its `floor` moves the height its particles rest at, and writing its `drivers` drives it alone:
// `fx.drivers.slip = 3` holds the file's driver `slip` at 3 for this effect and the effects its particles
// carry, over the ledger row's and the page's, while every other effect plays at the page's (Drivers,
// below). Its `drivers` are `{}` as it is handed back, or a copy of the spawn's.
// Its rolls come from `seed` when the spawn gives one, so pages that emit one effect with one seed
// draw the same particles, and from `Math.random` when it gives none. `has(name)` says whether the
// effects file has an effect of that name, false until the file has been read; this half asks the
// loader for it in its `tick`, before any actor ticks, so an actor can ask.
//
// An effect's point, `at`, is a point of the world, [x, y] or [x, y, h] (`plugins/render2d`), and
// its particles are thrown from where render2d draws that point. From there every length, speed and
// pull is in the stage's pixels, as it looks on the screen: x grows to the right and y down, and a
// direction is a vector [x, y], so [0, -1] is straight up the screen. A turn is in radians, the way
// PixiJS turns a sprite: a positive one turns clockwise on the screen.
//
// The effects are in a data file, the entry of the scene's `loader` catalogue that
// `world.particle2d.effects` names, which this half reads off the scene (the ledger row goes to every seat
// every step, so neither the file nor its name is on the row). It holds `cap`, the most
// particles this page draws at once, past which new ones are dropped; `layer`, the render2d layer
// an effect's particles are drawn on, unless its spawn names another (below); for effects drawn
// from sheets, `ppm`, pixels of a sheet per pixel of the stage; `files`, other files of effects, each a
// path from this file's folder, whose effects, force generators and drivers are this file's too;
// `forceGenerators` and `drivers` (Force generators and Drivers, below); and `effects`, each a list of
// layers. A layer `{ "effect": name }` stands for every layer of that effect, whichever of the files it
// is in, so effects are built out of effects, and `{ "effect": name, "at": [x, y] }` for every layer of
// it thrown from x, y pixels off the point. Every other layer is an emitter, in the stage's pixels and
// seconds:
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
//            life, each its whole frame / `ppm` pixels, filtered as the sheet says; with `play`
//            they play at the sheet's own times for them from its birth instead, round again or
//            held on the last as the clip says. Without one a particle is a flat square one pixel
//            on a side.
//   shape    one of particle2d's own soft pictures, a pixel on a side, which every effects file has
//            with no sheet and no catalogue entry (particle3d's `shapes.ts` draws them, for both):
//            `puff` and `puff2`, smoke; `glow`, a round of light; `halo`, a glowing ring; `spark`, a
//            hot dot; `streak`, a line of light for a stretched layer; `ring`, a thin shockwave;
//            `star`, a four-pointed flare; `bolt` and `bolt2`, a jagged, forked line of light from the
//            middle of its left edge to the middle of its right, lightning for a `beam`. A layer has a
//            shape or a sheet, not both.
//   size     [min, max] times that, 1 when left out; `grow` times the size at birth is its size at death.
//   grows    [[part, times], ...] in order, in place of `grow`: its size over its life, each `part` from
//            0, its birth, to 1, its death, and `times` its size at birth; a straight line from each to
//            the next, the first's before it and the last's after it. [[0, 0.2], [0.1, 1], [1, 1.4]]
//            swells it fast and then slowly.
//   dir      the direction it is thrown along, else the spawn's `dir`; `spread` the most radians off
//            it either way; no `spread` throws it any way at all. `speed` [min, max] pixels a second.
//   outward  [min, max] pixels a second it is thrown straight away from the effect's point, beside its
//            `speed` along `dir`: a particle started off the point by a `box` or a `jitter` goes out
//            along the line from the point through where it starts, so a burst flies apart from its
//            middle. One that starts on the point goes the way `dir` and `spread` aim it.
//   jitter   [x, y] pixels a particle starts off the point, per axis, the difference of two rolls.
//   box      [left, top, right, bottom] pixels off the point: a particle starts at a point rolled
//            evenly in it, so a box whose corners are one point starts every particle there.
//   g        pixels a second² down the stage (y growing), negative rising; `drag` the fraction of
//            its speed shed a second; `pull` pixels a second² toward the point it was thrown from,
//            negative away.
//   swirl    radians a second it is carried round the point it was thrown from, its way of going
//            turned with it, so a particle thrown out from the point spirals and one that stands off
//            it orbits; positive turns clockwise on the screen, negative the other way. With `pull` it
//            is drawn in as it goes round, a whirlpool; with `speed` out from the point, it is flung
//            out in arms.
//   pace     [[seconds, k], ...] in order: from that many seconds into its life on, it goes k times
//            as far a step as its speed says, so one that slows in steps and stops is [[t, 0.5],
//            [t2, 0]]; 1 before the first.
//   bounce   from 0 to 1: it bounces off the effect's `floor` and off every solid a mod hands over
//            (`world.particle2d.mods.solids`, below): its speed into the surface mirrored out of it,
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
//            each an sRGB number as a PixiJS tint is.
//   tints    [[part, colour], ...] in order, in place of `tint` and `tint1`: its colour over its life,
//            each `part` from 0 to 1 as `grows`' are, as many colours as the list gives: white hot,
//            then yellow, orange, and black is [[0, 16777215], [0.15, 16769696], [0.5, 16747050], [1, 0]].
//   gain     times its colour's light, 1 when left out. The stage draws nothing brighter than
//            white, so here a gain above 1 brightens each of the colour's channels as far as white.
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
//            a square or a shape; [0.5, 1] stands it there, so one that comes to rest on a floor sits on it.
//   add      drawn adding its light; `stretch` turned along the way it is going, with its head on
//            its place (`origin` [1, 0.5] unless it gives one); `face` turned along the effect's `dir`.
//   beam     drawn from the effect's point to its `to`, as long as the gap between them on the stage
//            and as thick as its frame at its size, turned along it, wherever the effect is moved:
//            a beam or a tracer that reaches its target. An effect with a beam is spawned with a `to`,
//            or carried (`carry`), which gives it one. Drawn as a `bolt`, it is lightning between the two.
//   carry    the name of an effect each particle carries: thrown at it the moment it is, its point
//            the particle's place every frame as the particle flies, falls and slows, its `dir` the
//            way the particle is going, its `to` the point of the effect the particle is of, so a
//            `beam` of its reaches from the particle back to where it was thrown from, as lightning
//            does from each thing round a middle; its `tint`, `scale`, `floor` and render2d layer the
//            carrier's, its rolls off the carrier's. It goes on emitting while the particle lives and
//            stops the frame it dies, its own particles living out their lives. An effect carried may
//            carry another, as deep as the file likes; one that comes back to itself by carrying, or by
//            naming effects that carry, throws the first frame the file is read, naming the path round.
//            A carried effect's point and `to` are points of the stage, the particles' own, where any
//            other effect's are points of the world; on a layer that sorts it is drawn at the depth of
//            the point of the effect the carrying began from.
//   inherit  how much of its effect's speed it starts with, beside its own: 1 the whole of it, 0 (when
//            left out) none. A carried effect's speed is that of the particle carrying it, so what a
//            flung chunk sheds goes on the way the chunk is going; any other effect's is how fast its
//            point is moving on the stage, as it flies, follows a row or has its `at` written.
//   forces   { <force generator>: strength, ... }: the force generators of the file its particles are
//            in, each acting on every one of them that many times as hard (Force generators, below). A
//            strength [min, max] is rolled for each particle between the two, so the particles of one
//            layer are thrown, slowed or lifted each a little differently and fill a space where one
//            strength would lay them all on one ring.
//
// Force generators. `g`, `drag`, `pull` and `swirl` are a layer's forces, each one field of the layer, so
// a layer has one of each and they reach its own particles alone. A force generator is forces kept apart
// from any layer, by name, in the file's `forceGenerators`: a list of entries, each any of `g`, `drag`,
// `pull` and `swirl`, meaning what they mean on a layer, `axis` (below), and `at`, [x, y] pixels off the
// point a particle was thrown from, times the effect's `scale`, the point its `pull` draws toward and its
// `swirl` turns about. A layer names the generators it is in and how hard each acts, `"forces": { "cone":
// 0.5, "chaos": 2.1 }`: every entry of the generator acts on every particle of the layer, its `g`, `drag`,
// `pull` and `swirl` times that strength, beside the layer's own. So one generator moves many layers, a
// layer is in as many as it names, and a generator of two entries is two pulls to two points or two
// swirls about two points. A generator the file has none of throws, naming the layer. An entry has more
// than a layer's forces:
//
//   direction   [x, y] a push along that vector, its length how hard in pixels a second a second, times
//               the effect's `scale`: [0, 600] is a gravity down the stage, [80, 0] a wind to the right.
//   anchor      what `at` is off: `particle` (when left out), the point each particle was thrown from;
//               `effect`, the point of the effect thrown, which for a particle of a carried effect is
//               the point of the effect the carrying began from, so every particle of it, however
//               deep it is carried, is pulled toward and swirled about the one point.
//   range       pixels off that point, times the effect's `scale`, past which none of the entry reaches.
//   falloff     how it weakens toward the edge of its `range`, which it needs: within the range it is
//               (1 - distance / range) to the falloff, so 0 (when left out) is the whole of it up to the
//               edge, 1 fades it evenly, 2 more at the middle. A pull of negative strength anchored to
//               the effect, with a falloff and a short range, is a blast's push out, hardest at the middle.
//   noiseFrequency, noiseAmplitude   a still field of noise over the stage (particle3d's `noise.ts`, on
//               its plane z = 0) that the particles fly through, which scales how hard the entry acts
//               where each particle is: 1 + noiseAmplitude times the field there, the field from -1 to 1
//               and changing over 1 / noiseFrequency pixels (1 when left out). An amplitude of 0 (when
//               left out) is the force the same everywhere; 0.5, from half as hard to half as hard again.
//   turbulence  a push along a second noise field, one of directions (`noise.ts`'s `curl2`), this many
//               pixels a second a second hard, times the effect's `scale`, changing over 1 /
//               noiseFrequency pixels: particles are turned and folded as they fly through it, never
//               gathered to a point, so smoke billows. It is the one noise that moves a particle; the
//               amplitude above only scales forces.
//   noiseScroll [x, y] pixels a second both noise fields move, times the effect's `scale`, from the
//               moment the effect is thrown: a particle standing still is then pushed a different way
//               from one moment to the next. Still when left out.
//   wind        [x, y] pixels a second, times the effect's `scale`: the speed of the air the entry's drag
//               is in. Its drag sheds a particle's speed against that air in place of its speed over the
//               stage, so a particle is carried up to the wind's speed and then rides it. It needs a
//               `drag` or a `dragBySpeed`.
//   dragBySpeed more drag the faster a particle goes through the air: this much more of its speed shed
//               a second for each pixel a second of it, beside `drag`. A fast particle is stopped hard
//               and a slow one drifts on.
//   shell       pixels off the centre, times the effect's `scale`: the entry's `pull` draws a particle
//               toward the circle of that radius about the centre in place of the centre, out from
//               inside it and in from outside it, so particles settle on a ring.
//   toAxis      on, the entry's `pull` draws a particle toward the nearest point of the line through the
//               centre along its `axis` in place of the centre: a column, where a pull to a point makes a
//               ball. With `shell`, toward the two lines that far either side of it, a band.
//   axis        [x, y] the way that line runs: the layer's `dir`, else the spawn's, else straight up the
//               screen, when left out. A swirl on the stage turns about a point, never a line, so an
//               axis is the line of a `toAxis` alone.
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
// (particle3d's `drivers.ts` says what one is made of), `"every": "0.2 / amplitude"`. It is read once,
// when the file is, and is its value each frame from then on, in the particles already in the air too, so
// one driver written moves every number that names it. A driver may itself be an expression of other
// drivers, and of `time`, the seconds this page's particle2d has run. A file with no string where a
// number goes plays as it always did. What is not a number is never driven: `sheet`, `clip`, `shape`,
// `carry`, an `effect`, a field that is on or off, and a word's numbers, which are the word's own.
//
// A driver is written while the game runs. On the page, `drive(name, value)` holds it at that number in
// place of the file's, and `drive(name)` lets it go back; `drivers` is every driver's value this frame.
// From a rule, `drive(w, name, value)` (`particle2d.sim.ts`) writes it on the ledger row, so every seat's
// page is driven alike; the page's own `drive` is over the row's, and the row's over the file's.
//
// One effect is driven apart from the rest by its own `drivers`, written on the effect `emit` hands back
// or on a ledger entry, or given in the spawn: its values are over the page's, the row's and the file's,
// for it alone. Two karts each write their own `speed` and `slip` on their own effects, and each kart's
// exhaust and dust play by its own. An effect a particle carries is driven by the same drivers as the
// effect that carries it, the one object, so writing the effect thrown drives the whole chain of what it
// carries; an effect thrown where another lands takes a copy of the landing effect's when its own land
// entry gives none. An effect with no driver of its own plays from the page's copy of its layers, which
// every such effect of its name shares; one with any plays from a copy of its own, its layers, lamps and
// force generators' entries, made the first frame it has one, written from its values each frame, and let
// go when it and every effect driven by the same drivers are over. A driver driven that the file has none
// of throws, naming it, and the effect when it is the effect's.
//
// An expression's value that is not a finite number, or is outside what its field takes (a `bounce`, or a
// lamp's `intensity` or `flicker`, from 0 to 1, an `every` or a lamp's `distance` below 0, an `axis` of
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
//   intensity   how much of its colour it adds at its middle, from 0 to 1, as light2d's lights do.
//   distance    how far it reaches, where it has fallen to nothing: in the world's steps along the
//               ground, as light2d lays a light's radius, times the effect's `scale`. Each is needed.
//   at       [x, y] pixels off the point, times the effect's `scale`; moved by an `{ effect, at }`.
//   tint     its colour, an sRGB number as a layer's `tint` is, else the spawn's, else white.
//   flicker  from 0 to 1: its strength wavers between whole and `1 - flicker` of it, a flame's.
//
// A lamp is drawn by light2d, which takes them from this plugin when its scene names it
// (`world.light2d.mods: { lights: ['particle2d'] }`, `particle2d.light2d.ts`): `lamps` is every lamp
// shining this frame, each `{ key, at, colour, radius, intensity }`, its point on the stage, its radius
// its `distance` scaled and its intensity flickered. Where the scene does not name it, no lamp is drawn.
//
// A field the file has that is none of these throws, naming it, the first frame the file is read and
// the first frame after it is written; so does a `dir`, `jitter`, `box` or `at` of the wrong count of
// numbers, a layer with both a `life` and `lasts` or neither, a lamp layer with more than its `lamp`, a
// lamp field it does not know, a lamp without its `intensity` or `distance`, an intensity or a `flicker`
// outside 0 to 1, a distance below 0, a `bounce` outside 0 to 1, a string where a number goes that is no
// expression or names a driver the file has none of, a string in a field that is on or off, a force
// generator's entry with a field that is none of its own, a layer's `forces` that are not strengths by
// generator, and a field of `world.particle2d` that is not `effects`, `hold`, `attach` or `mods`.
//
// Words. Every other field of an emitter is a word, its value that word's numbers, and the layer's
// particles are drawn by the Drawer a mod delivers for that word (`world.particle2d.mods.behaviors`, each
// plugin it names exporting `behaviors()` → `{ <word>: Drawer }`) in place of sprites. A word no plugin
// delivers throws as an unknown field does, naming `world.particle2d.mods.behaviors`. A Drawer:
//
//   check(data, what, world)    throws a sentence naming `what` for numbers it cannot draw by
//   draw(data, { plugins, name })  a Drawing of those numbers, or undefined while what it draws loads
//
// and a Drawing:
//
//   put(list)   once a frame, every particle drawn by it: `{ at, rot, size, pick, layer, depth }`, its
//               place on the stage, its turn in radians (its spin), its size now, a number from 0 to 1
//               rolled at its birth, for the drawer to choose by, the render2d layer its effect is drawn
//               on, and on a layer that sorts, the depth its effect is drawn at there (undefined on one
//               that does not)
//   dispose()   lets go of everything it made
//
// One Drawing is made for each word's numbers the first frame a particle of them is drawn, and kept
// until `close`. A word's particles are drawn at their place, turn and size; their tint and fade are
// the word's own to draw or not.
//
// What a particle that bounces bounces off is handed over by the plugins `world.particle2d.mods.solids`
// lists (`addons/scenemanager`'s mods), each exporting `solids(plugins)`, asked once a frame, which hands
// back a `Meet`: where a line on the stage from a point along a unit way first meets something within so
// many pixels, `{ t, normal }`, the normal facing out, or undefined. tilemap's (`tilemap.particle2d.ts`)
// is its walls.
//
// Attachments. Effects thrown from what other plugins know: the plugins `world.particle2d.mods.sources`
// lists, each exporting `sources(plugins)`, asked once a frame, each hand back their sources this frame, a
// list of `Source`s:
//
//   key      what the source is, the same every frame it is there: one effect is kept running on it
//   on       its word, which an attachment names
//   of       what it is of, which an attachment may name too
//   at       its point of the world this frame; `dir` the way it throws on the stage, `floor` the height
//            its particles rest at
//   drivers  numbers by name, each a driver of the effects file, which drive its effect alone
//
// and `world.particle2d.attach` is a list, each `{ on, effect, of?, when? }`: the effect `effect` thrown
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
//   floor    the height its particles come to rest at: none goes further down the stage than the
//            point `floor` above the ground under the effect's point is drawn, so `floor` 0 is the
//            ground itself. It is found again each frame from where the effect's point is then.
//   from     the id of the row the effect comes from: while this page's rows hold that row, the
//            effect goes on whatever its `life`, its point that row's `pos` when the row has one;
//            the frame they no longer do, its life is over. A smoulder on a wreck for as long as it
//            lies, a trail on a comet, a glow on an item on the floor.
//   fly      how fast its point is carried from `at` to `to`, in the world's units a second; its
//            `life` is the time that takes.
//   land     effects thrown at its `to`, or at its point when it has none, the frame its life is
//            over: each `{ "effect": name }` and the spawn it is thrown with. Where a round lands,
//            what a wreck leaves when it goes. Each rolls from its `seed`, else from a roll of the
//            effect it lands from, so every page that draws the one draws the same others. Each is
//            drawn on the layer the one it lands from is, unless its own spawn names another.
//   layer    the render2d layer its particles are drawn on, in place of the effects file's: air
//            that fills the canvas drawn over the world, say, where the file's effects stand in it.
//   drivers  numbers by name, each a driver of the effects file, which drive this effect alone.
//
// A particle drawn from a sheet of pixel art is drawn on whole pixels. A particle's rolls come from a
// generator seeded with the ledger entry's id, in the same order on every page, so every page draws
// the same particles; a page that first sees an entry late rolls the bursts it missed and ages their
// particles to now, as a page that saw it from the start has them.
//
// Every particle is a sprite, taken from a pool this plugin keeps and given back when it dies, in two
// containers on its effect's render2d layer: the ones drawn normally, then the ones that add their
// light over them. On a layer that does not sort, every effect drawn there shares the layer's two, so
// each is one batch per sheet. On one that sorts, each effect has two of its own, in a container
// drawn in the order of the depth of the effect's point, as render2d sorts a thing standing there:
// a burst behind a wall is drawn under the wall and one before it over it, however far up the
// screen its particles fly. Of an effect and a thing at one depth, the effect is drawn over, half a
// stage pixel of depth after it, more than sprite2d's ties and less than any two places apart: an
// impact on a monster over the monster. The effect's container follows its point, and goes when the
// effect does. That is done in `afterTick`, after every actor has ticked, and so this plugin is
// listed before `render2d`, whose `afterTick` draws; listed after it, every particle would be
// drawn a frame late, and that throws.
// A sheet the loader has not handed over yet draws nothing. Each frame moves every effect one step
// of the scene's `dt`. The effects file written while the game runs (the loader's `onWritten`), the
// effects that draw on its `layer` move to its new one on the next frame, and every running effect
// reads its layers again, its particles too, so they draw as it now says. `close` frees every sprite,
// container and frame, and the texture of particle2d's own shapes; the sheets are the loader's and stay.
import type { Plugins } from '#engine/browser.ts'
import { seeded, type Die } from '#engine/engine.ts'
import { modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { play } from '#plugins/loader/loader.sim.ts'
import { driven, plan, type Compiled, type Values } from '#plugins/particle3d/drivers.ts'
import { curl2, noise } from '#plugins/particle3d/noise.ts'
import { CELL, SHAPES, strip, type Shape } from '#plugins/particle3d/shapes.ts'
import { flight, type Entry, type Land, type Spawn } from './particle2d.sim.ts'

type Range = [number, number]
type V2 = [number, number]
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
export type Emitter = {
  n?: Range; every?: number; after?: number; life?: Range; lasts?: boolean; skip?: number
  sheet?: string; clip?: string; play?: boolean; shape?: Shape
  size?: Range; grow?: number; grows?: number[][]
  dir?: number[]; spread?: number; speed?: Range; outward?: Range; jitter?: number[]; box?: number[]
  g?: number; drag?: number; pull?: number; swirl?: number; pace?: number[][]; bounce?: number; follow?: boolean
  tint?: number; tint1?: number; tints?: number[][]; gain?: number; a0?: number; a1?: number; fade?: number; alphas?: number[][]
  spin?: number; origin?: [number, number]; add?: boolean; stretch?: boolean; face?: boolean; beam?: boolean; flips?: number[][]
  carry?: string; inherit?: number; forces?: Record<string, number | Range>
}
export type Lamp = { at?: number[]; tint?: number; intensity: number; distance: number; flicker?: number }
export type Lit = { lamp: Lamp }
// As the file writes it: every number a number or a driver's expression (the header, Drivers).
export type Driven<T> = T extends number ? number | string : T extends string | boolean | undefined ? T : { [K in keyof T]: Driven<T[K]> }
export type Layer = Driven<Emitter> | { effect: string; at?: (number | string)[] } | Driven<Lit>
export type Effects = {
  cap: number; layer: string; ppm?: number; files?: string[]
  forceGenerators?: Record<string, Driven<Force>[]>; drivers?: Record<string, number | string>
  effects: Record<string, Layer[]>
}
// A file the effects file lists: its effects, and its force generators and drivers when it has them.
export type Listed = Pick<Effects, 'effects' | 'forceGenerators' | 'drivers'>

// Every field an emitter may have, in the order the header gives them; the fields of an `{ effect }`
// layer; the fields of a lamp; the fields of a force generator's entry; the fields of the file; and the
// count of numbers each field that is a point or a box has.
export const FIELDS = [
  'n', 'every', 'after', 'life', 'lasts', 'skip', 'sheet', 'clip', 'play', 'shape', 'size', 'grow', 'grows', 'dir', 'spread', 'speed', 'outward', 'jitter', 'box',
  'g', 'drag', 'pull', 'swirl', 'pace', 'bounce', 'follow', 'flips', 'tint', 'tint1', 'tints', 'gain', 'a0', 'a1', 'fade', 'alphas', 'spin', 'origin', 'add', 'stretch', 'face', 'beam', 'carry', 'inherit', 'forces',
] as const satisfies readonly (keyof Emitter)[]
export const REF = ['effect', 'at'] as const
export const LAMP = ['at', 'tint', 'intensity', 'distance', 'flicker'] as const satisfies readonly (keyof Lamp)[]
export const FORCE = [
  'g', 'drag', 'pull', 'swirl', 'axis', 'at', 'direction', 'anchor', 'falloff', 'range', 'noiseFrequency', 'noiseAmplitude',
  'turbulence', 'noiseScroll', 'wind', 'dragBySpeed', 'shell', 'toAxis', 'overLife', 'overAge',
] as const satisfies readonly (keyof Force)[]
// A layer's fields that are stops over a particle's life, each `[part, value]` with its part from 0 to 1.
export const STOPS = ['grows', 'tints', 'alphas'] as const satisfies readonly (keyof Emitter)[]
// What a layer's stops are written in place of.
const INSTEAD: Record<(typeof STOPS)[number], (keyof Emitter)[]> = { grows: ['grow'], tints: ['tint', 'tint1'], alphas: ['a0', 'a1', 'fade'] }
export const FILE = ['cap', 'layer', 'ppm', 'files', 'forceGenerators', 'drivers', 'effects'] as const satisfies readonly (keyof Effects)[]
export const WORLD = ['effects', 'hold', 'attach', 'mods'] as const
// One attachment of `world.particle2d.attach`, and a source a `sources` mod hands back (the header,
// Attachments).
export type Attach = { on: string; effect: string; of?: string; when?: string }
export const ATTACH = ['on', 'effect', 'of', 'when'] as const satisfies readonly (keyof Attach)[]
export type Source = { key: string; on: string; of?: string; at: number[]; dir?: number[]; floor?: number; drivers: Record<string, number> }
export type Sources = (plugins: Plugins) => readonly Source[]
// A lamp shining this frame, as light2d is handed it (`lamps`, `particle2d.light2d.ts`): its point on the
// stage, its colour, its radius along the ground in the world's steps, and its intensity, flickered.
export type Glow = { key: string; at: number[]; colour: number; radius: number; intensity: number }
// The fields of an emitter that are not numbers, which no driver drives: its names, and what is on or off.
export const NAMES = ['sheet', 'clip', 'shape', 'carry'] as const satisfies readonly (keyof Emitter)[]
export const SWITCHES = ['lasts', 'play', 'follow', 'add', 'stretch', 'face', 'beam'] as const satisfies readonly (keyof Emitter)[]
// What a number driven is kept within, by its field: [least, most].
const LIMITS: Record<string, [number, number]> = {
  every: [0, Infinity], bounce: [0, 1], intensity: [0, 1], distance: [0, Infinity], flicker: [0, 1],
  falloff: [0, Infinity], range: [0, Infinity], noiseFrequency: [0, Infinity], noiseAmplitude: [0, Infinity],
  dragBySpeed: [0, Infinity], shell: [0, Infinity],
}
// Where a line on the stage from `from` along the unit `dir` first meets a solid within `far` pixels: a
// mod's answer.
export type Meet = (from: number[], dir: number[], far: number) => { t: number; normal: number[] } | undefined
// What a `solids` mod exports: asked once a frame.
export type Solids = (plugins: Plugins) => Meet
// A word's Drawer, its Drawing, and one particle as a Drawing is handed it (the header, Words).
export type Put = { at: number[]; rot: number; size: number; pick: number; layer: string; depth?: number }
export type Drawing = { put(list: Put[]): void; dispose(): void }
export type Drawer = {
  check(data: any, what: string, world: Record<string, any>): void
  draw(data: any, made: { plugins: Plugins; name: string }): Drawing | undefined
}
// The words a scene's mods deliver: each plugin `world.particle2d.mods.behaviors` names, laid over the last.
export const drawers = (world: Record<string, any>): Record<string, Drawer> =>
  Object.assign({}, ...modsOf<() => Record<string, Drawer>>(world, 'particle2d', 'behaviors').map(f => f()))
// The words of an emitter: its fields that are none of particle2d's own.
const wordsOf = (l: Emitter) => Object.keys(l).filter(k => !(FIELDS as readonly string[]).includes(k))
const COUNTS: Record<string, number> = { dir: 2, axis: 2, jitter: 2, box: 4, at: 2, direction: 2, wind: 2, noiseScroll: 2 }

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
  serial: number // which effect it is on this page, so each of its lamps has a key of its own
  layer?: string // the render2d layer its spawn names, else the file's
  own?: Pair & { box: any } // its two containers, in one of its own, on a layer that sorts
  root?: Live // for an effect a particle carries, the effect thrown that the chain of carrying began from
  staged: boolean // its point and `to` are points of the stage, as a carried effect's are, not of the world
  ground?: number // the stage y its particles rest at this frame, from its `floor`
  vel: number[] // how fast its point is moving on the stage: its carrier's speed, else its point's from the last frame to this
  was?: number[] // where its point was on the stage the last frame
}
// A layer's or an effect's two containers: the particles drawn normally, then those adding their light.
type Pair = { under: any; over: any }

// Of an effect and a thing at one depth on a sorted layer, how much further the effect is drawn.
const AFTER = 0.5
type Part = {
  fx: Live; layer: Emitter; p: V2; v: V2; o: V2
  age: number; life: number; lasts?: number; s0: number; s1: number; rot: number; spin: number; sprite?: any
  carried?: Live // the effect it carries, its point kept on the particle's place
  pick: number // rolled at its birth for a word's drawer to choose by
  rolls?: Record<string, number> // for each force generator its layer is in by a range, where in the range it was rolled, 0 to 1
}

const lerp = (r: Range | undefined, u: number, fallback: number) => (r ? r[0] + (r[1] - r[0]) * u : fallback)
// Of a list of [seconds, ...] in order, the last entry whose seconds a particle `age` old has reached.
const reached = (list: number[][] | undefined, age: number) => {
  let got: number[] | undefined
  for (const e of list ?? []) {
    if (e[0] > age + 1e-9) break
    got = e
  }
  return got
}
// A colour times `gain`, each channel as far as white.
const brighten = (c: number, gain: number) => {
  if (gain === 1) return c
  const ch = (s: number) => Math.min(255, Math.round(((c >> s) & 255) * gain)) << s
  return ch(16) | ch(8) | ch(0)
}
const mix = (a: number, b: number, k: number) => {
  const c = (s: number) => {
    const x = (a >> s) & 255, y = (b >> s) & 255
    return Math.round(x + (y - x) * k) << s
  }
  return c(16) | c(8) | c(0)
}
const unit = (a: number[]): V2 => {
  const l = Math.hypot(a[0], a[1])
  return [a[0] / l, a[1] / l]
}
// Of stops `[at, value]` in order, the two `at` is between and how far from the first to the second it
// is, 0 to 1: the first stop twice before it, and the last twice after it.
const between = (list: number[][], at: number): [number[], number[], number] => {
  if (at <= list[0][0]) return [list[0], list[0], 0]
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i]
    if (at <= b[0]) return [a, b, b[0] > a[0] ? (at - a[0]) / (b[0] - a[0]) : 1]
  }
  const last = list[list.length - 1]
  return [last, last, 0]
}
// The value of stops at `at`: a straight line from each to the next.
const stop = (list: number[][], at: number) => {
  const [a, b, k] = between(list, at)
  return a[1] + (b[1] - a[1]) * k
}

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

// Throws for the first field of the file, of an effect's layer, or of `world.particle2d` that this plugin
// does not read, and for a point or a box of the wrong count of numbers.
// `words` are the Drawers the scene's mods deliver (`drawers(world)`), and `world` the scene's, which a
// Drawer's check reads.
export function check(file: Effects, own: Record<string, unknown>, words: Record<string, Drawer> = {}, world: Record<string, any> = {}) {
  for (const k of Object.keys(own)) if (!(WORLD as readonly string[]).includes(k)) throw new Error(`world.particle2d has ${k}, which particle2d does not know`)
  for (const k of Object.keys(file)) if (!(FILE as readonly string[]).includes(k)) throw new Error(`particle2d's effects file has ${k}, which particle2d does not know`)
  const names = plan(file.drivers, 'particle2d\'s effects file').names
  if (own.attach !== undefined) {
    if (!Array.isArray(own.attach)) throw new Error(`world.particle2d.attach is ${JSON.stringify(own.attach)}, and it is a list, each { ${ATTACH.join(', ')} }`)
    if (!modsOf(world, 'particle2d', 'sources').length) throw new Error('world.particle2d has an attach, and its mods name no sources')
    own.attach.forEach((a: unknown, i: number) => {
      const at = `world.particle2d.attach ${i}`
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
    if (!Array.isArray(entries)) throw new Error(`particle2d force generator ${name} is ${JSON.stringify(entries)}, and a force generator is a list of entries, each any of ${FORCE.join(', ')}`)
    entries.forEach((f, i) => {
      const at = `particle2d force generator ${name} entry ${i}`
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
        if (k in COUNTS && (!Array.isArray(v) || v.length !== COUNTS[k])) throw new Error(`${at} has a ${k} of ${JSON.stringify(v)}, and particle2d reads ${COUNTS[k]} numbers`)
        if (k === 'axis' && (v as unknown[]).every(n => typeof n === 'number') && Math.hypot(...(v as number[])) === 0) throw new Error(`${at} has an axis of no length, and particle2d pulls to a line`)
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
      const at = `particle2d effect ${name} layer ${i}`
      if ('lamp' in l) return lamped(name, i, l, numbers)
      const known: readonly string[] = 'effect' in l ? REF : FIELDS
      if (!('effect' in l) && !l.life === !l.lasts) throw new Error(`${at} ${l.life ? 'has a life and lasts' : 'has no life and does not last'}, and it has one or the other`)
      for (const [k, v] of Object.entries(l)) {
        if (!known.includes(k)) {
          if ('effect' in l || !words[k]) throw new Error(`${at} has ${k}, which particle2d does not know${'effect' in l ? '' : ', and no plugin world.particle2d.mods.behaviors names delivers it'}`)
          words[k].check(v, `${at} ${k}`, world)
          continue
        }
        if (k in COUNTS && (!Array.isArray(v) || v.length !== COUNTS[k])) throw new Error(`${at} has a ${k} of ${JSON.stringify(v)}, and particle2d reads ${COUNTS[k]} numbers`)
        if (k === 'shape' && !(SHAPES as readonly unknown[]).includes(v)) throw new Error(`${at} has a shape ${JSON.stringify(v)}, and particle2d draws ${SHAPES.join(', ')}`)
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
        if ([...carried.slice(at), c].some(Boolean)) throw new Error(`particle2d effect ${to} carries itself: ${[...path.slice(at), to].join(' > ')}`)
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
  const at = `particle2d effect ${name} layer ${i}`
  for (const k of Object.keys(l)) if (k !== 'lamp') throw new Error(`${at} is a lamp and has ${k}, and a lamp layer is { lamp } alone`)
  const lamp = l.lamp
  if (!lamp || typeof lamp !== 'object') throw new Error(`${at} has a lamp of ${JSON.stringify(lamp)}, and particle2d reads { intensity, distance, ... }`)
  for (const k of Object.keys(lamp)) if (!(LAMP as readonly string[]).includes(k)) throw new Error(`${at} has a lamp with ${k}, which particle2d does not know`)
  const said = (v: unknown) => typeof v === 'string'
  if (!said(lamp.intensity) && !(typeof lamp.intensity === 'number' && lamp.intensity >= 0 && lamp.intensity <= 1)) throw new Error(`${at} has a lamp whose intensity is ${lamp.intensity}, and it is a number from 0 to 1`)
  if (!said(lamp.distance) && !(typeof lamp.distance === 'number' && lamp.distance >= 0)) throw new Error(`${at} has a lamp whose distance is ${lamp.distance}, and it is a number of 0 or more`)
  if (lamp.at !== undefined && !(Array.isArray(lamp.at) && lamp.at.length === 2)) throw new Error(`${at} has a lamp at ${JSON.stringify(lamp.at)}, and particle2d reads 2 numbers`)
  if (lamp.flicker !== undefined && !said(lamp.flicker) && !(lamp.flicker >= 0 && lamp.flicker <= 1)) throw new Error(`${at} has a lamp whose flicker is ${lamp.flicker}, and it is from 0 to 1`)
  numbers(lamp, `${at}'s lamp`)
}

// Every layer an effect stands for, its `{ effect }` layers opened out, in order, each thrown from
// its `at` off the point: an emitter's box moved by it, or a box of that one point for one with none;
// a lamp's `at` moved by it.
function flatten(effects: Record<string, Layer[]>, name: string, path: string[] = []): (Driven<Emitter> | Driven<Lit>)[] {
  if (path.includes(name)) throw new Error(`particle2d effect ${name} is made of itself: ${[...path, name].join(' > ')}`)
  const layers = effects[name]
  if (!layers) throw new Error(path.length ? `particle2d effect ${path[path.length - 1]} names ${name}, which there is none of` : `particle2d has no effect ${name}`)
  // Two numbers of the file added: their sum, or where either is an expression, the expression of it.
  const plus = (a: number | string, b: number | string) => (typeof a === 'number' && typeof b === 'number' ? a + b : `(${a}) + (${b})`)
  return layers.flatMap(l => {
    if (!('effect' in l)) return [l]
    const inner = flatten(effects, l.effect, [...path, name])
    if (!l.at) return inner
    const [x, y] = l.at
    return inner.map(e => {
      if ('lamp' in e) {
        const [ax, ay] = e.lamp.at ?? [0, 0]
        return { lamp: { ...e.lamp, at: [plus(ax, x), plus(ay, y)] } }
      }
      const [x0, y0, x1, y1] = e.box ?? [0, 0, 0, 0]
      return { ...e, box: [plus(x0, x), plus(y0, y), plus(x1, x), plus(y1, y)] }
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

export function particle2d() {
  let ledger: Live[] = []
  let fresh = new Set<Live>() // spawned since the last frame, so starting at the age it was given
  const seen = new Set<number>() // the server entries this page has taken
  let file: Effects | undefined
  let unchecked = true // the file has been read or written since it was last checked
  let asked = false
  let stale = false // the effects file has been written since the running effects read their layers
  let checked = false
  let parts: Part[] = []
  let serials = 0
  const shared = new Map<string, Pair>() // on each layer that does not sort, the two every effect there shares
  const pool: any[] = []
  // Every lamp shining this frame, as light2d is handed it.
  let glows: Glow[] = []
  // Where render2d draws a point of the world on the stage, this frame's.
  let place: (at: number[]) => number[] = () => { throw new Error('particle2d placed a point before its first afterTick') }

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
    if (b.axis && Math.hypot(...b.axis) === 0) throw new Error(`${b.what} is ${JSON.stringify(b.text)}, which leaves an axis of no length now, and particle2d pulls to a line`)
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
    if (!g) play.generators.set(name, (g = (file!.forceGenerators?.[name] ?? []).map((f, i) => live(play, f, `particle2d force generator ${name} entry ${i}`, ['anchor']) as Force)))
    return g
  }
  // An effect's layers opened out and its lamps, as they are played by a play.
  const playing = (play: Play, name: string) => {
    let p = play.played.get(name)
    if (p) return p
    const raw = split(file!.effects, name)
    const layers = raw.layers.map(l => {
      const e: Emitter = live(play, l, `particle2d effect ${name}`, [...NAMES, ...Object.keys(l).filter(k => !(FIELDS as readonly string[]).includes(k))])
      if (e.forces) fields.set(e, Object.keys(e.forces).map(g => ({ name: g, list: generator(play, g) })))
      if (typeof l.every === 'string') play.streams.add(e)
      return e
    })
    const lamps = raw.lamps.map(l => live(play, l, `particle2d effect ${name}'s lamp`) as Lamp)
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
    solver = plan(file!.drivers, 'particle2d\'s effects file')
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
    const sources = modsOf<Sources>(world!, 'particle2d', 'sources').flatMap(f => f(plugins))
    const kept = new Set<string>()
    list.forEach((a, i) => {
      for (const s of sources) {
        if (s.on !== a.on || (a.of !== undefined && s.of !== a.of)) continue
        for (const [n, v] of Object.entries(s.drivers)) {
          if (!solver!.names.includes(n)) throw new Error(unknown(n, `particle2d's ${s.on} source ${s.key}`))
          if (!Number.isFinite(v)) throw new Error(`particle2d's ${s.on} source ${s.key} has its driver ${n} at ${v}, and a driver is a finite number`)
        }
        if (a.when !== undefined) {
          let run = whens.get(a.when)
          if (!run) whens.set(a.when, (run = driven(a.when, solver!.names, `world.particle2d.attach ${i}'s when`)))
          if (run(solver!.run({ ...over, ...s.drivers }, time)) === 0) continue
        }
        const key = `${i}:${s.key}`
        kept.add(key)
        let fx = attached.get(key)
        if (!fx) attached.set(key, (fx = spawn(a.effect, s.at, { dir: s.dir, floor: s.floor, life: Infinity, drivers: s.drivers }, Math.floor(Math.random() * 2 ** 32))))
        fx.at = [...s.at]
        fx.dir = s.dir && [...s.dir]
        fx.floor = s.floor
        for (const n of Object.keys(fx.drivers)) if (!(n in s.drivers)) delete fx.drivers[n]
        Object.assign(fx.drivers, s.drivers)
      }
    })
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
    const row = plugins.wire.rows.find(r => r.kind === 'particle2d')
    over = { ...(row?.data.drivers ?? {}), ...held }
    for (const n of Object.keys(over)) if (!solver!.names.includes(n)) throw new Error(unknown(n, 'particle2d'))
    page.values = solver!.run(over, time)
    for (const b of page.binds) write(b, page.values)
    const driving = new Map<Record<string, number>, Live>()
    for (const fx of ledger) if (Object.keys(fx.drivers).length && !driving.has(fx.drivers)) driving.set(fx.drivers, fx)
    for (const [drivers, fx] of driving)
      for (const [n, v] of Object.entries(drivers)) {
        if (!solver!.names.includes(n)) throw new Error(unknown(n, `particle2d effect ${fx.name}`))
        if (!Number.isFinite(v)) throw new Error(`particle2d effect ${fx.name} has its driver ${n} at ${v}, and a driver is a finite number`)
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
      serial: serials++, from: s.from, fly: s.fly, land: s.land && structuredClone(s.land), landed: false, layer: s.layer, staged: false, vel: [0, 0],
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
  // one step older the next, on its layer unless its own spawn names another, and driven by its land
  // entry's own drivers, else a copy of the landing effect's.
  const land = (fx: Live) => {
    if (!fx.land || fx.landed || fx.age < fx.life - 1e-9) return
    fx.landed = true
    const at = fx.to ?? point(fx)
    for (const { effect, seed, ...s } of fx.land) fresh.delete(spawn(effect, at, { layer: fx.layer, ...s, drivers: s.drivers ?? fx.drivers }, seed ?? Math.floor(fx.die() * 2 ** 32)))
  }

  // Where an effect's point is on the stage: a carried effect's own, else where render2d draws its point
  // of the world.
  const spot = (fx: Live): number[] => (fx.staged ? point(fx) : place(point(fx)))
  // Where its `to` is on the stage.
  const end2 = (fx: Live): number[] => (fx.staged ? fx.to! : place(fx.to!))
  // Where a particle is drawn: its place, or for one that follows, kept about its effect's point.
  const placed = (q: Part): number[] => {
    if (!q.layer.follow) return q.p
    const at = spot(q.fx)
    return [q.p[0] + at[0] - q.o[0], q.p[1] + at[1] - q.o[1]]
  }
  // The effect a particle carries kept on it: at its place, along the way it goes, its `to` the point
  // of the effect the particle is of, its floor the carrier's.
  const ride = (q: Part) => {
    const fx = q.carried!
    fx.at = [...placed(q)]
    fx.to = [...spot(q.fx)]
    fx.vel = [...q.v]
    fx.ground = q.fx.ground
    if (Math.hypot(q.v[0], q.v[1]) > 1e-9) fx.dir = unit(q.v)
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
    for (let i = 0; i < 2; i++) v[i] = (v[i] - 2 * into * n[i]) * b
    const along = v[0] * n[0] + v[1] * n[1]
    const slide = Math.hypot(v[0] - along * n[0], v[1] - along * n[1])
    const radius = sized(q) / 2
    // a layer with no `spin` stands upright, struck or not
    if (q.layer.spin && radius > 0) q.spin = (q.spin < 0 ? -1 : 1) * (slide / radius)
  }

  // The point a set of forces pulls toward and swirls about: its `at` off where it is anchored, times the
  // effect's scale. Anchored to the particle (as a layer's own forces always are), that is the point the
  // particle was thrown from; to the effect, the point of the effect thrown that the particle's chain of
  // carrying began from, so every particle of it, carried or not, shares one.
  const centre = (q: Part, f: Force): V2 => {
    const s = q.fx.scale, c = f.at ?? [0, 0]
    const from = f.anchor === 'effect' ? spot(q.fx.root ?? q.fx) : q.o
    return [from[0] + c[0] * s, from[1] + c[1] * s]
  }
  // How much of a set of forces reaches a particle where it is: with a `range`, nothing beyond it, and
  // within it (1 - distance / range) to the `falloff` (0, the default, the whole of it up to the edge),
  // the range times the effect's scale; times 1 + `noiseAmplitude` times the noise field at the
  // particle's place times `noiseFrequency`, so 0 amplitude is the force as it is everywhere.
  const reach = (q: Part, f: Force, m: V2) => {
    let w = 1
    if (f.range !== undefined) {
      const r = f.range * q.fx.scale, p = q.p
      const d = Math.hypot(p[0] - m[0], p[1] - m[1])
      if (d >= r) return 0
      if (f.falloff) w *= Math.pow(1 - d / r, f.falloff)
    }
    if (f.overLife) w *= stop(f.overLife, part(q))
    if (f.overAge) w *= stop(f.overAge, since(q))
    if (f.noiseAmplitude) {
      const [x, y] = field(q, f)
      w *= Math.max(0, 1 + f.noiseAmplitude * noise(x, y, 0))
    }
    return w
  }
  // The seconds since the effect thrown that a particle's chain of carrying began from was thrown, as of
  // the step being run: `behind` seconds back for a burst a page is catching up.
  let behind = 0
  const since = (q: Part) => (q.fx.root ?? q.fx).age - behind
  // Where a particle is in an entry's noise fields: its place, less how far they have scrolled since the
  // effect was thrown, times the noise's frequency.
  const field = (q: Part, f: Force): V2 => {
    const n = f.noiseFrequency ?? 1, p = q.p, s = f.noiseScroll, t = s ? since(q) * q.fx.scale : 0
    return s ? [(p[0] - s[0] * t) * n, (p[1] - s[1] * t) * n] : [p[0] * n, p[1] * n]
  }
  // The line an entry's pull to the axis draws toward: its `axis`, else the layer's `dir`, else the
  // spawn's, else straight up the screen.
  const line = (q: Part, f: Force) => unit(f.axis ?? q.layer.dir ?? q.fx.dir ?? [0, -1])
  // What one set of forces, a layer's own or an entry of a force generator it is in, does to a particle's
  // speed in a step, `k` times as hard, times how much of it reaches the particle: its drag, its pull
  // toward its centre, its gravity, and its push along `direction`.
  const push = (q: Part, f: Force, k: number, dt: number) => {
    const { p, v } = q, s = q.fx.scale
    const m = centre(q, f)
    const w = k * reach(q, f, m)
    if (!w) return
    if (f.drag || f.dragBySpeed) {
      // its speed through the entry's air, which the wind carries: shed toward the air's speed
      const air = f.wind ? [f.wind[0] * s, f.wind[1] * s] : [0, 0]
      const through = f.dragBySpeed ? Math.hypot(v[0] - air[0], v[1] - air[1]) / s : 0
      const d = Math.max(0, 1 - ((f.drag ?? 0) + (f.dragBySpeed ?? 0) * through) * w * dt)
      for (let i = 0; i < 2; i++) v[i] = air[i] + (v[i] - air[i]) * d
    }
    if (f.pull) {
      // toward the centre, or the nearest point of the line through it along the axis
      const d = [m[0] - p[0], m[1] - p[1]]
      if (f.toAxis) {
        const a = line(q, f), along = d[0] * a[0] + d[1] * a[1]
        for (let i = 0; i < 2; i++) d[i] -= a[i] * along
      }
      const len = Math.hypot(d[0], d[1])
      // with a shell, toward the circle (or the two lines) that far off: in from outside, out from inside
      const way = f.shell === undefined ? 1 : Math.sign(len - f.shell * s)
      if (len > 0) for (let i = 0; i < 2; i++) v[i] += (d[i] / len) * f.pull * way * w * s * dt
    }
    if (f.g) v[1] += f.g * w * s * dt
    if (f.direction) for (let i = 0; i < 2; i++) v[i] += f.direction[i] * w * s * dt
    if (f.turbulence) {
      const [x, y] = field(q, f), c = curl2(x, y)
      for (let i = 0; i < 2; i++) v[i] += c[i] * f.turbulence * w * s * dt
    }
  }
  // Its swirl: the particle carried round its centre, and its way of going with it, clockwise on the
  // screen for a positive turn. `turn` is the radians, the swirl of the step times its strength and
  // pace, times how much of it reaches the particle.
  const whirl = (q: Part, f: Force, turn: number) => {
    const { p, v } = q
    const m = centre(q, f)
    turn *= reach(q, f, m)
    if (!turn) return
    const cos = Math.cos(turn), sin = Math.sin(turn)
    const rx = p[0] - m[0], ry = p[1] - m[1]
    p[0] = m[0] + rx * cos - ry * sin
    p[1] = m[1] + rx * sin + ry * cos
    const vx = v[0]
    v[0] = vx * cos - v[1] * sin
    v[1] = vx * sin + v[1] * cos
  }
  // The gravity on a layer's particles, which a particle resting on the floor is let lie still under: its
  // own and that of every generator it is in, a generator's `direction` down the stage counted with its
  // `g`, each at its whole strength.
  const weight = (q: Part) => {
    const l = q.layer
    let g = l.g ?? 0
    for (const { name, list } of fields.get(l) ?? []) for (const f of list) g += ((f.g ?? 0) + (f.direction?.[1] ?? 0)) * strength(q, name)
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
      const speed = Math.hypot(v[0], v[1]), far = speed * left
      const hit = far > 0 ? meet(p, [v[0] / speed, v[1] / speed], far) : undefined
      if (!hit) break
      const s = hit.t / speed
      for (let i = 0; i < 2; i++) p[i] += v[i] * s
      left -= s
      const n = hit.normal, into = v[0] * n[0] + v[1] * n[1]
      if (into < 0) strike(q, n, into)
      for (let i = 0; i < 2; i++) p[i] += n[i] * 1e-4
    }
    for (let i = 0; i < 2; i++) p[i] += v[i] * left
    if (l.swirl) whirl(q, l, l.swirl * dt * k)
    if (among) for (const { name, list } of among) {
      const s = strength(q, name)
      if (s) for (const f of list) if (f.swirl) whirl(q, f, f.swirl * s * dt * k)
    }
    const floor = q.fx.ground
    if (floor !== undefined && p[1] > floor) {
      p[1] = floor
      // one that bounces goes back up with that much of its fall, unless that is less than a step of
      // its fall, when it comes to rest
      if (v[1] > 0) {
        if (l.bounce === undefined) v[1] = 0
        else {
          // its fall struck as a surface facing up the screen strikes it, then left at rest when what it
          // goes back up with is less than two steps of its fall
          strike(q, [0, -1], -v[1])
          if (-v[1] <= weight(q) * q.fx.scale * dt * 2) v[1] = 0
        }
      }
    }
    q.rot += q.spin * dt
    q.age += dt
  }

  // A unit direction for a particle of this layer, off `die`.
  const aim = (fx: Live, l: Emitter): V2 => {
    const u = fx.die()
    const d = l.dir ?? fx.dir
    if (l.spread === undefined) return [Math.cos(2 * Math.PI * u), Math.sin(2 * Math.PI * u)]
    if (!d) throw new Error(`a particle2d layer of ${fx.name} has a spread and no dir, and neither has its spawn`)
    const a = Math.atan2(d[1], d[0]) + (2 * u - 1) * l.spread
    return [Math.cos(a), Math.sin(a)]
  }

  // One burst of a layer, thrown at `t` seconds into the effect from where its point is on the stage,
  // and aged to the effect's age now.
  const burst = (fx: Live, l: Emitter, t: number, dt: number, cap: number) => {
    const [ox, oy] = spot(fx)
    const n = Math.round(lerp(l.n, fx.die(), 1))
    for (let i = 0; i < n; i++) {
      const dir = aim(fx, l)
      const speed = lerp(l.speed, fx.die(), 0) * fx.scale
      const life = lerp(l.life, fx.die(), 0)
      const skip = (l.skip ?? 0) * fx.die()
      const size = lerp(l.size, fx.die(), 1) * fx.scale
      const j = l.jitter ?? [0, 0]
      const p: V2 = [ox + (fx.die() - fx.die()) * j[0] * fx.scale, oy + (fx.die() - fx.die()) * j[1] * fx.scale]
      const spin = l.spin ? (fx.die() * 2 - 1) * l.spin : 0
      const rot = l.spin ? fx.die() * 2 * Math.PI : 0
      if (l.box) {
        const [x0, y0, x1, y1] = l.box
        p[0] += (x0 + (x1 - x0) * fx.die()) * fx.scale
        p[1] += (y0 + (y1 - y0) * fx.die()) * fx.scale
      }
      // rolled whether or not the particle is kept, so every page rolls the same
      const seed = l.carry ? Math.floor(fx.die() * 2 ** 32) : 0
      const pick = wordsOf(l).length ? fx.die() : 0
      // straight away from the point, for one that starts off it; the way it was aimed for one on it
      const out = l.outward ? lerp(l.outward, fx.die(), 0) * fx.scale : 0
      const off = [p[0] - ox, p[1] - oy], far = Math.hypot(off[0], off[1])
      const away = far > 1e-9 ? [off[0] / far, off[1] / far] : dir
      // where in each strength that is a range this particle is
      let rolls: Record<string, number> | undefined
      for (const [g, s] of Object.entries(l.forces ?? {})) if (typeof s !== 'number') (rolls ??= {})[g] = fx.die()
      if (parts.length >= cap) continue
      const share = l.inherit ?? 0
      const q: Part = {
        fx, layer: l, p, v: [dir[0] * speed + away[0] * out + fx.vel[0] * share, dir[1] * speed + away[1] * out + fx.vel[1] * share], o: [ox, oy],
        age: skip, life, lasts: l.lasts ? t - skip : undefined, s0: size, s1: size * (l.grow ?? 1), rot, spin, pick, rolls,
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
      // Its effect, as old as the particle has flown, from where the particle is now on the stage, driven
      // by the drivers of the effect that throws it, the one object, on its layer. It is run this frame by
      // the loop that fired this burst, so it is not left among those spawned since the last.
      const c = spawn(l.carry, placed(q), { tint: fx.tint, scale: fx.scale, floor: fx.floor, life: Infinity, layer: fx.layer }, seed, undefined, fx.drivers)
      fresh.delete(c)
      c.staged = true
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

  const ppm = () => {
    if (!file!.ppm) throw new Error('particle2d draws an effect from a sheet, and its effects file gives no ppm')
    return file!.ppm
  }

  // particle2d's own shapes, one texture of particle3d's strip with its rows turned top first,
  // premultiplied and mipmapped so a shape drawn small stays soft, and a texture of each shape's cell of
  // it; made the first time a particle is drawn as one.
  let soft: { source: any; cells: Map<Shape, any> } | undefined
  const shapes = (PIXI: any) => {
    if (soft) return soft
    const raw = strip(), w = CELL * SHAPES.length, row = w * 4
    const data = new Uint8Array(raw.length)
    for (let y = 0; y < CELL; y++) data.set(raw.subarray((CELL - 1 - y) * row, (CELL - y) * row), y * row)
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255
      data[i] = Math.round(data[i] * a)
      data[i + 1] = Math.round(data[i + 1] * a)
      data[i + 2] = Math.round(data[i + 2] * a)
    }
    const source = new PIXI.BufferImageSource({ resource: data, width: w, height: CELL, alphaMode: 'premultiplied-alpha', autoGenerateMipmaps: true, scaleMode: 'linear' })
    const cells = new Map<Shape, any>(SHAPES.map((s, i) => [s, new PIXI.Texture({ source, frame: new PIXI.Rectangle(i * CELL, 0, CELL, CELL) })]))
    soft = { source, cells }
    return soft
  }

  // The frame a layer's particle shows now, its texture and its size and anchor, or undefined while
  // the loader has not handed its sheet over; a soft shape or a flat square for a layer with no sheet.
  const frame = (plugins: Plugins, q: Part) => {
    const { PIXI } = plugins.render2d
    const l = q.layer
    if (l.shape) return { texture: shapes(PIXI).cells.get(l.shape), size: [1, 1], anchor: [0.5, 0.5], nearest: false }
    if (!l.sheet) return { texture: PIXI.Texture.WHITE, size: [1, 1], anchor: [0.5, 0.5], nearest: false }
    const sheet = plugins.loader.get(l.sheet)
    if (!sheet) {
      plugins.loader.load(l.sheet)
      return undefined
    }
    const run = sheet.data.clips[l.clip!]?.runs[0]
    if (!run) throw new Error(`particle2d draws clip ${l.clip} of ${l.sheet}, which it does not have`)
    const i = l.play ? play(sheet.data, l.clip!, 0, 0, q.age + 1e-9)[0] : Math.min(run.length - 1, Math.floor((q.age / span(q)) * run.length))
    const f = sheet.frameOf(l.clip, 0, i)
    const [w, h] = f.size
    return { texture: sheet.texture(f.id), size: [w / ppm(), h / ppm()], anchor: [f.anchor[0] / w, f.anchor[1] / h], nearest: sheet.data.nearest }
  }

  const give = (q: Part) => {
    if (!q.sprite) return
    q.sprite.removeFromParent()
    pool.push(q.sprite)
    q.sprite = undefined
  }

  // An effect's own containers gone, what is left in them given back first.
  const unbox = (fx: Live) => {
    if (!fx.own) return
    for (const q of parts) if (q.fx === fx) give(q)
    fx.own.box.destroy({ children: true })
    fx.own = undefined
  }

  // The render2d layer an effect draws on: its spawn's, else the file's.
  const layerOf = (fx: Live) => fx.layer ?? file!.layer
  // The depth an effect is drawn at on a layer that sorts: that of its point, or for a carried effect, of
  // the point of the effect the carrying began from; half a stage pixel after a thing standing there.
  const depthOf = (plugins: Plugins, fx: Live) => plugins.render2d.depth(point(fx.root ?? fx)) + AFTER

  // The two containers an effect's particles go in this frame: on a layer that sorts, its own, at
  // the depth of its point; on any other, the layer's, which every effect drawn there shares.
  const pairOf = (plugins: Plugins, fx: Live): Pair => {
    const { PIXI, layer } = plugins.render2d
    const name = layerOf(fx), on = layer(name)
    if (on.sortableChildren) {
      if (!fx.own) {
        const own = { box: new PIXI.Container(), under: new PIXI.Container(), over: new PIXI.Container() }
        own.box.addChild(own.under, own.over)
        fx.own = own
      }
      if (fx.own.box.parent !== on) on.addChild(fx.own.box)
      fx.own.box.zIndex = depthOf(plugins, fx)
      return fx.own
    }
    unbox(fx)
    let pair = shared.get(name)
    if (!pair) shared.set(name, (pair = { under: new PIXI.Container(), over: new PIXI.Container() }))
    if (pair.under.parent !== on) on.addChild(pair.under, pair.over)
    return pair
  }

  // Puts every particle's sprite where the particle is, as it looks at its age now; a particle of a word
  // is handed to its word's Drawing in place of a sprite.
  const draw = (plugins: Plugins) => {
    const { PIXI } = plugins.render2d
    const pairs = new Map<Live, Pair>()
    for (const q of parts) if (!pairs.has(q.fx) && !wordsOf(q.layer).length) pairs.set(q.fx, pairOf(plugins, q.fx))
    for (const q of parts) {
      const l = q.layer, k = part(q)
      const words = wordsOf(l)
      if (words.length) {
        give(q)
        if (!alive(q)) continue
        const sorts = plugins.render2d.layer(layerOf(q.fx)).sortableChildren
        const put: Put = { at: [...placed(q)], rot: q.rot, size: sized(q), pick: q.pick, layer: layerOf(q.fx), ...(sorts ? { depth: depthOf(plugins, q.fx) } : {}) }
        for (const w of words) {
          const key = `${w} ${JSON.stringify((l as any)[w])}`
          let d = drawings.get(key)
          if (!d) drawings.set(key, (d = { list: [] }))
          if (!d.drawing) d.drawing = words_[w].draw((l as any)[w], { plugins, name: `particle2d's ${w} of ${q.fx.name}` })
          d.list.push(put)
        }
        continue
      }
      const f = !alive(q) ? undefined : frame(plugins, q)
      if (!f) {
        give(q)
        continue
      }
      q.sprite ??= pool.pop() ?? new PIXI.Sprite()
      const pair = pairs.get(q.fx)!, into = l.add ? pair.over : pair.under
      if (q.sprite.parent !== into) into.addChild(q.sprite)
      const s = q.sprite
      const size = sized(q)
      s.texture = f.texture
      s.blendMode = l.add ? 'add' : 'normal'
      const flip = reached(l.flips, q.age)
      const [ax, ay] = l.origin ?? (l.stretch ? [1, 0.5] : f.anchor)
      s.anchor.set(flip?.[1] ? 1 - ax : ax, flip?.[2] ? 1 - ay : ay)
      const [x, y] = placed(q)
      s.position.set(f.nearest ? Math.round(x) : x, f.nearest ? Math.round(y) : y)
      s.roundPixels = f.nearest
      s.width = f.size[0] * size
      s.height = f.size[1] * size
      s.scale.set(Math.abs(s.scale.x) * (flip?.[1] ? -1 : 1), Math.abs(s.scale.y) * (flip?.[2] ? -1 : 1))
      let turn = q.rot
      const along = l.stretch ? q.v : l.face ? (l.dir ?? q.fx.dir) : undefined
      if (along && (along[0] || along[1])) turn = Math.atan2(along[1], along[0])
      if (l.beam) {
        if (!q.fx.to) throw new Error(`particle2d effect ${q.fx.name} has a beam and was spawned with no to`)
        const [x0, y0] = spot(q.fx), [x1, y1] = end2(q.fx)
        s.anchor.set(0, 0.5)
        s.position.set(x0, y0)
        s.width = Math.hypot(x1 - x0, y1 - y0)
        turn = Math.atan2(y1 - y0, x1 - x0)
      }
      s.rotation = turn
      const from = l.tint ?? q.fx.tint ?? 0xffffff
      let rgb = l.tint1 === undefined ? from : mix(from, l.tint1, k)
      if (l.tints) {
        const [c0, c1, t] = between(l.tints, k)
        rgb = mix(c0[1], c1[1], t)
      }
      s.tint = brighten(rgb, l.gain ?? 1)
      const fading = l.fade === undefined ? k : Math.max(0, 1 - (span(q) - q.age) / l.fade)
      s.alpha = l.alphas ? stop(l.alphas, k) : (l.a0 ?? 1) + ((l.a1 ?? 1) - (l.a0 ?? 1)) * fading
    }
    // A layer's shared two, once no effect draws there, off it.
    const using = new Set(pairs.values())
    for (const [name, pair] of shared) if (!using.has(pair)) {
      pair.under.destroy()
      pair.over.destroy()
      shared.delete(name)
    }
  }

  // Every running effect's lamps, each at the effect's point on the stage and its `at` times the effect's
  // `scale` off it; its colour its `tint`, else the spawn's, else white; its radius its `distance` times the
  // scale; its strength dimmed by its flicker, three waves of no common beat on the effect's age, so a
  // lamp's light wavers without a pattern from its whole strength down to `1 - flicker` of it, the same on
  // every page, which share the effect's age.
  const shine = () => {
    glows = []
    for (const fx of ledger) {
      if (!fx.lamps?.length) continue
      const at = spot(fx)
      fx.lamps.forEach((l, i) => {
        const [x, y] = l.at ?? [0, 0]
        const t = fx.age, w = 0.5 + 0.5 * (0.5 * Math.sin(t * 7.3 + i) + 0.3 * Math.sin(t * 13.1 + 2 * i) + 0.2 * Math.sin(t * 23.7 + 3 * i))
        glows.push({
          key: `${fx.serial}:${i}`, at: [at[0] + x * fx.scale, at[1] + y * fx.scale], colour: l.tint ?? fx.tint ?? 0xffffff,
          radius: l.distance * fx.scale, intensity: l.intensity * (1 - (l.flicker ?? 0) * w),
        })
      })
    }
  }

  // `world.particle2d`, once the order of the plugins has been checked and the loader asked for the file.
  const setup = (plugins: Plugins) => {
    const { scene } = plugins.wire
    const own = scene.world?.particle2d
    if (!own) throw new Error('the scene names particle2d but gives no world.particle2d')
    if (!checked) {
      checked = true
      const order = scene.plugins!
      if (order.indexOf('render2d') < order.indexOf('particle2d'))
        throw new Error('particle2d is listed after render2d, which would draw every particle a frame late')
    }
    if (!asked) {
      if (!plugins.loader) throw new Error('particle2d reads its effects through loader, which this scene does not name')
      asked = true
      words_ = drawers(scene.world!)
      plugins.loader.on(own.effects, (it: Effects) => gather(plugins, own.effects, it))
      plugins.loader.onWritten(own.effects, () => { stale = unchecked = true })
    }
    return own
  }

  // The effects file read, and every file it lists from its folder, their effects added to its own:
  // the one file particle2d plays from.
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

  return {
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
    // Every lamp shining as of the last frame, as light2d is handed it.
    get lamps(): readonly Glow[] { return glows },
    // Asks the loader for the effects file before the actors tick, so `has` answers them.
    tick(plugins: Plugins) { setup(plugins) },
    afterTick(plugins: Plugins) {
      const { scene } = plugins.wire
      const own = setup(plugins)
      const dt = scene.prefabs.engine?.dt
      if (!dt) throw new Error('scene has no engine prefab with dt')
      place = plugins.render2d.place

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
      if (solver && own.attach) attach(plugins, own.attach)

      meets = modsOf<Solids>(scene.world!, 'particle2d', 'solids').map(f => f(plugins))
      for (const q of parts) move(q, dt)
      // A particle that carries an effect takes it along, and the frame it dies its effect stops.
      parts = parts.filter(q => {
        if (alive(q)) {
          if (q.carried) ride(q)
          return true
        }
        q.fx.parts--
        give(q)
        // as old as it is about to be this frame, the frame its particle died
        if (q.carried) q.carried.life = q.carried.age + dt
        return false
      })
      for (const fx of ledger) if (!fresh.has(fx)) fx.age += dt

      const row = plugins.wire.rows.find(r => r.kind === 'particle2d')
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
        spawn(e.effect, e.at, e, e.id, e.id).age = e.age
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
        // the stage y its particles rest at, from where its point is now, and how fast its point is
        // moving, which a layer that inherits starts with; a carried effect's are its carrier's, written as
        // it rides
        if (!fx.root) {
          const at = point(fx), now = place(at)
          fx.ground = fx.floor === undefined ? undefined : place([at[0], at[1], fx.floor])[1]
          fx.vel = fx.was ? [(now[0] - fx.was[0]) / dt, (now[1] - fx.was[1]) / dt] : [0, 0]
          fx.was = [...now]
        }
        fire(fx, dt, file.cap)
        land(fx)
      }
      const going = ledger.filter(fx => !(fx.parts > 0 || more(fx) || (!!fx.land && !fx.landed) || (!!fx.lamps?.length && fx.age < fx.life - 1e-9)))
      for (const fx of going) unbox(fx)
      ledger = ledger.filter(fx => !going.includes(fx))
      draw(plugins)
      drawWords()
      shine()
    },
    close() {
      for (const q of parts) give(q)
      for (const fx of ledger) unbox(fx)
      for (const s of pool) s.destroy()
      for (const { under, over } of shared.values()) { under.destroy(); over.destroy() }
      if (soft) {
        for (const t of soft.cells.values()) t.destroy()
        soft.source.destroy()
        soft = undefined
      }
      for (const d of drawings.values()) d.drawing?.dispose()
      drawings.clear()
      pool.length = 0
      shared.clear()
      attached.clear()
      glows = []
      ledger = []
      parts = []
    },
  }
}
