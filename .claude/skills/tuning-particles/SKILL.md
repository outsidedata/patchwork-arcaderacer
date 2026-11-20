---
name: tuning-particles
description: Use in core, or any clone of it, when tuning how a game's effects look while it runs - particles (particle3d's effects file, its layers and their numbers), the effects a look plugin throws off a thing (a boost's flame, a drift's smoke and marks, sparks off a hit, a pop), and any other look that only shows in some moment of play. Covers holding an effect on in the game's `dev.html` with toggles, so it can be looked at as long as needed while a bot drives, by handing the look plugin a forced copy of the frame's rows; which numbers to turn (the effects file, the kind's definition); and the loop of looking, editing and looking again. Triggers on "tune the particles", "tune the sparks", "keep the boost on", "hold the drift effect", "debug toggles for the look", "I want to see the effect longer", "make the fx easier to tune", and on adding a `look` folder to a `dev.html` panel. Also covers the particle workshop (`tools/workshop/particles.html`), where a game's effects are built and tuned layer by layer with no game running and saved into its effects file, and particle3d's `swirl` and `axis` for vortices, whirlpools, spirals and orbits; triggers on "particle workshop", "build an effect", "a portal", "a rift", "swirl", "vortex", "layers of particles".
---

# Tuning particles

An effect built from scratch, or tuned layer by layer away from the game, is made in the particle
workshop (The particle workshop, below). An effect that only shows for a moment of play, a hit's sparks, a drift's smoke, a boost's flame, is
hard to tune: by the time it is on screen it is gone. The way core tunes one is to hold it on in the
game's `dev.html` while the game runs as it always does, a bot driving, and to change its numbers
until it looks right.

## How an effect is designed

Every effect is built round one thing the player has to read. Everything else in it is quieter than
that thing. An effect is designed by taking away, never by adding paint: the muddy, washed-out mess
comes from every layer bright, every layer adding light, and a new layer laid on whenever something
looked weak. These are the rules, read before any number is written and checked before any effect
is called done (`yarn particle-score`, below, measures each one when it is asked for).

1. **One sentence first.** Before any number: what the player must read off this effect, where it
   hits, how big it is, which way it goes. That part is the primary. Every other layer is secondary
   and is there to support it.
2. **Only the primary gets the extremes.** The brightest value, the darkest value, the highest
   saturation and the sharpest shape belong to the primary alone. Secondary layers sit in the
   middle: lower opacity (`alphas`), lower saturation, softer shapes (`puff`, `glow`), slower. The
   body of an effect is mid values; the brightest is kept for the instant of the hit.
3. **Light needs dark beside it.** A layer that `add`s only ever adds light, so layers that add,
   stacked, go white. The body of an effect is laid over the scene (no `add`), with its own colour
   and its own darks in `tints`: particle3d's particles are unlit, so smoke is dark only where its
   `tints` make it dark. `add` is a small, short highlight on top of that body.
4. **`gain` above 1 is the flash.** It goes on the core, for a few frames, so the bloom picks out
   one spot. A body, a stream or a cloud with `gain` above 1 is the wash-out. A lamp lights what is
   round the effect for a moment; it never makes a weak effect strong.
5. **Value first, then colour.** The effect has to read in grey alone. One hue leads; a hue across
   the wheel from it is small and grey-ish, or the two fight and read as noise. No layer is pure
   white for long, and no colour is fully saturated or fully grey.
6. **Fast in, short peak, long thinning tail.** A burst is at its strongest within the first quarter
   of its life, then falls away. If it feels long, it is far too long.
7. **Every layer earns its place.** Mute it (the workshop's mute, or `off` in a view). If the
   effect is no worse without it, it is deleted. When something looks weak, first lower or take
   away what competes with it; a layer is added only after that.
8. **No `streak` unless the person asked for it.** Claude's instinct to reach for `streak` (with
   `stretch`) is faulty: it puts streaks into nearly every effect it builds, for glints, sparks,
   speed, magic, water and spray, and every time they are wrong. They read as rain dashes, needles
   or scratches, and they point wherever the particle happens to be moving, not where the effect
   needs them to. A layer with `"shape": "streak"` is banned unless the person working with you
   named streaks for that effect. Use another shape, or no layer at all.
9. **Lighting is done last.** A `lamp` lights everything round the effect, so every layer judged
   while it is on is judged under its wash, and the effect is tuned against that wash instead of
   standing on its own. No `lamp` goes in until the effect reads right with none; a lamp then
   adds to an effect that already works, and is the last layer added.

### One effect for many kinds: the kind says the numbers, the effect reads them as they are

When one effect serves several kinds (one dust for every walker, one splash for every boat), each kind's
definition says what its effect is, in plain numbers, and the effect's fields read those drivers
directly: `"n": ["count", "count"]`, `"size": ["size", "size"]`, `"alphas": [[0, 0], [0.12, "opacity"], [1, 0]]`.
A number that changes with how the thing moves is given at both ends on the definition, `walk` and
`run`, and the plugin that throws the effect moves each between the two by one share (its speed over its
top speed) and hands them over. Nothing else is worked out anywhere.

Never one "size" or "heft" number on the kind that the effects file turns into counts, lives, speeds and
opacities through a chain of derived drivers (`sqrt(heft)`, `clamp(log(heft) / 4, 0, 1)`, `0.18 + 0.4 *
kick`). It was built so once, for mech's footfall dust, and failed: the colossus's dust could not be
seen and nobody could say why without working the maze backwards, and making it right meant changing
equations instead of saying "24 puffs, 18 m across, 10 seconds". Whoever tunes it has to be able to read
a kind's two lines and know what will be drawn. Mech's `look.dust` and `footfall` are the example.

### Scoring an effect: `yarn particle-score`

```
yarn particle-score <effects file> [--effect <name>]... [--camera x,y,z] [--target x,y,z] [--out <folder>]
```

plays each effect on the particle workshop's stage in a headless Chrome and judges the rules above
from its pictures: how much of it is washed white, at its brightest and after the hit; whether one
small part is the brightest or all of it is; whether it has darks (over a bright sky, where a body
laid over shows dark and added light cannot); its range of brightness; the saturation of its light;
whether one hue leads; whether it still reads over a bright sky; whether a burst peaks in its first
quarter; and, muting each layer in turn at every moment, which layers change nothing. It prints each
rule passed or failed with the number it measured and the line, the moment that did worst, and a
score; `--out` keeps every picture it measured. The rules' lines and how each is measured are in the
header of `scripts/particle-score.ts`.

`yarn particle-score` is run only when the person working with you asks for it. Never run it on
your own, never tune an effect to pass it, and never score before and after a change unless asked.
When it has been asked for, a failed rule names the change: `blown` and `one focus`
are too much `gain` or too many layers that `add`; `darks` and `on bright` are a body that is all
added light; `every layer` names the layers to delete. The score never replaces looking: read the
pictures it wrote, then the numbers.

Where the rules came from: Riot's League of Legends VFX style guide and their "anatomy of a missile"
breakdown (areas of focus: the primary has the highest and lowest value, the highest saturation,
the most detail; "if everything is important, nothing is important"), Blizzard's Diablo III talk at
GDC 2013 (add blending alone ends in white; their blend-add is a laid-over body with light added on
top, which particle3d's one premultiplied material already draws: `add` per layer), and the
GDC 2017 Artistic Principles of VFX talk (shape, contrast and focus, colour, timing).

## Why it can be held on

A look plugin, a game's `fx` or any plugin whose browser half throws effects, draws each frame from
the rows the page was sent: it reads a row's fields (a boost left, a drift, the seconds since a hit)
and decides what to throw. Nothing reads back what it drew: no rule, no other plugin, no packet. So
if the look plugin is handed a copy of the frame's rows in which one row's fields say "boosting",
it draws the boost, and nothing else in the game is any different. The car drives, the truth steps,
the server and every other seat see what they would.

Two things follow:

- **The fake goes into a copy, never into the row.** The page's rows are what a page that runs
  ahead (`addons/predict`) predicts from, and in a tab with its own truth (`?tab`) they may be the
  truth's. A field written on the real row is a car that really boosts. The copy is made fresh each
  frame, `{ ...row, data: { ...row.data, boost: 1 } }`, and handed to the look plugin alone.
- **The plugin never knows.** It has no "debug" field, no setting, no flag. The testbed is the one
  place a shortcut is allowed (`prime-directive`, Testbed), and nothing but `dev.html` knows the
  toggles exist. `index.html` and `client.html` never get them.

## How `dev.html` reaches in

(The rest of the testbed, the panel's wiring and every other way a page reaches into its plugins, is
`using-the-dev-page`.)

`dev.html` already holds the page (`window.page`) and, each frame, its current client's plugins
(`page.client.plugins`). A plugin's browser half is an object whose `tick(plugins)` the page calls
each frame (`engine/browser.ts`): every plugin's `tick`, then every actor's, then every plugin's
`afterTick`. So `dev.html` wraps the look plugin's `tick` once per client and hands it a `plugins`
whose `wire.rows` are the forced copy:

```js
// What is held on, and the panel's folder for it.
const force = { boost: false, drift: false, slip: 0.5, sparks: false, pop: false }
const look = gui.addFolder('look')
look.add(force, 'boost').name('boost on')
look.add(force, 'drift').name('drift on')
look.add(force, 'slip', 0, 1.2, 0.01).name('drift slip at least')
look.add(force, 'sparks').name('sparks on')
look.add({ pop: () => { force.pop = true } }, 'pop').name('pop once')

// The frame's rows with the watched row's fields as `force` says; every other row as it is.
// `watched(rows)` is the row the camera and the readout follow (The row to watch, below).
const forced = rows => {
  const it = watched(rows)
  if (!it) return rows
  const d = { ...it.data }
  if (force.boost) d.boost = Math.max(d.boost, 1)
  if (force.drift) {
    d.drift = d.drift || 1
    d.slip = d.drift * Math.max(Math.abs(d.slip), force.slip)
  }
  if (force.sparks) d.scrape = 0
  if (force.pop) {            // an effect fired on an edge: the field jumps for one frame
    d.boost += 1
    force.pop = false
  }
  return rows.map(r => (r === it ? { ...r, data: d } : r))
}

// Each client's look plugin wrapped once: a scene change makes a new client and a new plugin.
const looking = new WeakSet()
const lookThrough = fx => {
  if (!fx || looking.has(fx)) return
  looking.add(fx)
  const tick = fx.tick.bind(fx)
  fx.tick = p => tick({ ...p, wire: { ...p.wire, rows: forced(p.wire.rows) } })
}

// in the frame loop, before `page.frame(now)`:
lookThrough(page.client?.plugins.fx)
```

The field names above are one look plugin's. Each look plugin's header says which field of a row
starts each of its effects and past what threshold (a slip over so many radians, a speed over so
many m/s, a hit within so many seconds). Read that header, and force each field just past its
threshold: a toggle for an effect that holds while a field holds (a flame while `boost` > 0), a slider
where how far past the threshold sets how much (smoke and marks that grow with the slip), and a
button that bumps the field for one frame where the effect fires on an edge (a pop the frame a value
grows).

## The row to watch, and someone to drive it

Hold the effect on the row being looked at, which `dev.html` already picks: the seat's own thing
(`holding(rows)`), or another row by its query (`?watch=<g>`), the same row the camera and the
readout follow. Then let a bot drive it so it moves as it does in play: the `cpu driver` toggle,
which presses the seat's keys from the pilot the CPU drives by (`?cpu`, or `?tab&cpu` for the truth in
the tab). A stopped car throws nothing that needs a speed, so it has to be moving.

## What to turn

Two places hold every number of an effect, and neither is code:

- **The effects file** (`world.particle3d.effects` names it, an entry of the loader's catalogue):
  each effect is a list of layers, and each layer is an emitter. Its numbers are in the header of
  `plugins/particle3d/particle3d.plugin.ts`: how many a burst (`n`) and how often (`every`), how long
  each lives (`life`, `fade`, `a0`, `a1`), how big (`size`, `grow`), which way and how fast (`dir`,
  `spread`, `speed`, `outward` straight away from the point, `g`, `drag`), whether it stays with the
  moving point (`follow`) or is left behind as a trail, its colour as it cools (`tint`, `tint1`), how
  bright for the bloom (`gain`), blended by adding light (`add`) and turned along its path (`stretch`),
  and an effect each particle carries as it flies (`carry`), so flung chunks trail smoke of their own,
  nested as deep as wanted, what they shed going on the chunk's way with `inherit`. Its size, colour and
  opacity over its life are stops, `grows`, `tints` and `alphas`, each `[part of its life, value]`: as
  many colours as wanted, and a fade in as well as out. What a particle
  looks like is a `sheet` the game makes (a flipbook, Building a flipbook effect, below), or one of particle3d's own soft `shape`s, which every file
  has with no art: `puff`/`puff2` for smoke, `glow`, `halo`, `spark`, `streak` (with `stretch`), `ring`,
  `star`, and `bolt`/`bolt2` for lightning (with `beam`). A layer with neither is a hard square, so start smoke on `puff`. `bounce` (0 to 1)
  bounces a particle off the spawn's `floor` (the workshop's stage spawns with floor 0, its ground) and
  off the solids `world.particle3d.mods.solids` hands over (shapes3d's shapes); gpuparticle3d's
  particles, moved on the GPU, bounce off what gpgpu3d holds there, the land too
  (`world.gpuparticle3d.mods.solids: 'gpgpu3d'`, `using-gpgpu3d`). A layer that gives a
  word a mod delivers is drawn by it in place of quads: `"mesh": { rows, look, seed? }`, with
  `world.particle3d.mods.behaviors: ['instances3d']` and instances3d listed, draws each particle as an
  instanced 3D mesh (rocks, shards) that tumbles with `spin`, falls and bounces. One effect thrown in more than one
  moment and wanted different in each (sparks off a wall and off a car) is two effects, and the
  definition names which is thrown when.
- **The kind's definition**: where on the thing an effect is thrown from, in the thing's own frame,
  which way, and the thresholds that start it (the look plugin's header lists them).

An effect a look plugin keeps running, thrown with the page's `emit`, is handed back, and the plugin
may write it while it runs: `at`, `dir` and `to` move it, `life` stops it, `floor` is the height its
particles rest at (box3dvehicle writes the ground under the wheel there each frame), `rate` runs its
bursts that many times as often and `force` throws every particle from then on that many times as
hard, both 1 as `emit` hands it back. A flame that grows with the throttle is one effect whose `rate`
and `force` the plugin writes from a field of the row, its numbers on the definition, not two effects.

## The loop

1. Open `/games/<game>/dev.html` (with `?tab&cpu` for a bot in one tab), and turn the effect on in
   the `look` folder.
2. Change one number in the effects file or the definition, save, and reload the page: `yarn dev`
   builds it again from the files. The panel's toggles start off again, so turn the effect back on.
3. Look, and go again. Bill does the looking: the person tuning says what is wrong, and that is the
   next change.

## The particle workshop

An effect that needs building rather than catching in play, a portal, a rift, a spell, a fire, is made
in the particle workshop (`tools/workshop/particles.html`, `tools/workshop/particles.ts`): a game's
effects played by core's own particle3d on the game's own render3d (its tone, exposure and bloom), with
no game running, every layer tuned live and saved into the game's effects file. It is served by the
asset workshop's server:

```
yarn workshop particles <game>
```

which starts the server and opens `http://127.0.0.1:5180/particles?game=<game>` (`WORKSHOP_PORT` runs it
on another port; `--file <repo path>` for one of several effects files, `--effect <name>` to open on
one). Any effects file at all, a game's or one no game names, is opened with
`yarn workshop particles --effects <path>`, with `--sheet <key>=<path>` for each sheet a file no game
names draws from: a game's file in that game's light, any other on the workshop's own
stage (`tools/workshop/particles.stage.json`). The full
account is the header of `tools/workshop/particles.ts`. A game needs nothing of its own to join it:
every scene that lists `particle3d` with a `world.particle3d` is found, and its effects file, sheets,
render3d prefab and `dt` are read from it.

- **The left column**: every effect of the file, and a new one made by its name.
- **The stage**: the effect thrown from the middle of a grid of 1 m squares, beside a 1.8 m stick, a
  person, the camera turned round it with the mouse. An effect with an `every` on any layer is a
  stream and runs without end, as the game runs it while it is on. Any other is a burst: a Throw
  button, and a toggle (on to start) that throws it again every so many whole seconds (2 to start).
  **From** puts the effect on a bomb box3d throws across the stage, bouncing, thrown again every few
  seconds (`tools/workshop/thrown.ts`, its numbers `particles.stage.json`'s `thrown`), so a trail, a
  wake or a smoke is seen on a thing that moves, its `at` written each step as a game writes it.
  Under it, as a rule's `emit` would give them: its scale, its `dir` (which a layer with no `dir`
  throws along and swirls about), its `to` (where a beam ends), and how fast time runs, down to a
  twentieth, so a burst can be watched.
- **The left column, under the effects**: the file's drivers and its force generators. A generator
  picked shows its entries in the right column, each a card of every field an entry has (the header of
  `particle3d.plugin.ts`, Force generators): its push, pull, drag and swirl, its range and falloff, its
  noise and turbulence, its wind, the shell or the line its pull draws toward, and its strength over a
  particle's life and over the effect's age.
- **The right column**: each layer a card, shut on load, its title saying what it throws, how many
  and how often. Opened, it shows its headline fields (how many, how often, how long, size, colour,
  brightness, speed, swirl), and under them folders shut until opened: Timing, Colour and fade,
  Picture, Where it starts, Forces and Light. Each setting is one line: its name, its fields, and ×. A
  number is typed, or dragged: dragging across a setting's name moves its numbers by a step a pixel
  (Shift ten, Alt a tenth). A field left out shows greyed in its box what particle3d does without it. A set value's
  name is white, one changed since the file was read amber, and × takes the field out. A layer can be
  muted or played alone (on the page only, never saved), moved, copied, removed, or added, and an
  `{ effect, at }` layer names its effect and where it is thrown from.

A change shows from the next step, in the particles already in the air too. **Save to game** writes
each changed effect whole into the effects file, with the rest of the file and its layout kept, and
checked by particle3d's own `check` first. **Revert** drops every change.

An opened layer's **Shape** picks one of particle3d's own soft shapes (choosing a sheet clears it, and
it clears the sheet), and **Each carries** picks an effect every particle of the layer takes along as
it flies; the layer's title names both. `tools/workshop/assets/effects/smokebomb.json`'s `explosion` is an example of
each: a glow flash, a halo shockwave, sparks that each carry `chunktrail` (puffs and streaks), and a
puff2 cloud.

### Looking at an effect without the page: `yarn particle-views`

```
yarn particle-views <views.json> <out folder>
```

writes a picture of an effect from any camera, at any moment, with any of its layers off, in a headless
Chrome. Each view of `<views.json>` names its effects file and effect, where the camera stands and the
point it looks at, the seconds the effect has run (`preroll`), and the layers `off` or the `only` ones
played; a view with no `effect` is one picture of every effect of its file. The same view is the same
picture every time, so two pictures differ only by what was changed between them. The fields are in the
header of `scripts/particle-views.ts`, with an example in `tools/workshop/README.md`.

Use it to look at an effect while it is built: one layer alone from the front and the side, then the
layers together, at several moments of its life. Read every picture before changing a number.

### Building a compound effect

A portal or a rift is many layers, each one thing: a soft glow under it all, a slow cloud of motes
circling the middle and drawn in, fast sparks flung out, a few long-lived embers drifting off. Build
it one layer at a time with **Alone** on, then play them together. The edge is where the circling
layers thin out, not a drawn rim: give those layers a `box` or `jitter` wide enough to spread them
round the middle, and fade them out (`a1`, `fade`) toward the end of their lives.

The swirl is particle3d's `swirl` and `axis`: each particle is carried round the point it was thrown
from, `swirl` radians a second about `axis` (the layer's `dir`, else the spawn's, else straight up),
its way of going turned with it.

- Standing off the point (a `box` or `jitter`, no `speed`), a particle **orbits**.
- With `pull`, it is **drawn in** as it goes round: a whirlpool.
- Thrown out with `speed`, it runs out along an **arm that turns**: a spiral.
- A negative `swirl` turns the other way, so two layers turning against each other read as churning.

For an upright portal, `axis` is the way the portal faces.

`tools/workshop/assets/effects/portal.json` is one built this way, and `tools/workshop/portal.views.json` the views it
was looked at through: `yarn particle-views tools/workshop/portal.views.json <out folder>`. What it uses:

- **Force generators** hold the forces more than one layer shares, or that one layer's fields cannot
  say. `turn` is one swirl about the way the portal faces, `inward` one pull to the middle, and each
  layer names how hard it is in each (`"forces": { "inward": 11.5 }`), so the whole portal's turn or
  draw is one number. `cone` is a pull to a point 1.7 m behind the mouth (an entry's `at`) and a swirl
  about the facing: two entries, which a layer's single `pull` and `swirl` about its own point could
  not be.
- **Drivers** are the numbers turned live for the whole effect: `amplitude` (every stream's `every` is
  written `"0.04 / rate"`, and the lamp's `intensity` `"40 * amplitude"`), `spin` (every swirl), `draw`
  (every pull) and `storm` (how often a cloud throws a bolt). A game writes one with particle3d's
  `drive`; the workshop's left column turns them. A driver that divides is kept off 0 by a second
  driver, `"rate": "max(amplitude, 0.05)"`.
- **A ring of smoke that narrows back** is particles that draw nothing (`size` [0, 0]) thrown from one
  point on the rim just in front of the mouth, in `cone`, each carrying a small stream of smoke
  (`carry`): they wind round and back toward the point behind, so the smoke is laid down as a cone.
- **A vortex of light** is `streak`s with `stretch`, thrown along the ring's tangent with a `pull`
  toward the middle of their speed² over the ring's radius, which holds them on a circle, and a little
  `drag`, which lets them wind in. They really move along their path, so they are stretched along it; a
  `swirl` moves a particle without changing the way it is going, so a stretched one would not be.
- **Depth** is smoke and a dark disc: particles laid over what is behind them (no `add`) hide the light
  behind them and not the light in front, from any side, since every particle of a mesh is drawn the
  farthest first. Too much `gain` on many particles that `add` turns a blue white; lower it before
  adding more. Behind the mouth, `halo`s thrown slowly back along the way the portal faces and shrinking
  (`grow` below 1) are a throat, and small `spark`s in a `box` just behind it are stars that slide
  against the rim as the camera moves; keep both within the smoke's own thickness, or they stick out
  the back from the side. In front, thin low `puff2` mist with a little `pull` is drawn in over the
  ground.
- **Lightning** is one more shape, `bolt` (and `bolt2`, so a flicker is not one picture), on a `beam`
  layer of a carried effect. A carried effect's `to` is the point of the effect its particle is of, so
  its beam reaches from the particle back to the middle. The carrier is a layer of particles that draw
  nothing (`size` [0, 0]) and live a fifth of a second, rolled in a `box` where the bolts are to start
  (for bolts inside smoke, the carrier is a layer of the smoke's own carried effect, its `box` no wider
  than the cloud, so each bolt ends at its cloud's middle and the smoke in front hides part of it); what each carries is two `beam` layers, `bolt`
  and `bolt2`, each living a twentieth of a second and thrown again every 0.06, the second `after`
  0.03, so the bolt jumps. `size` is how far the bolt strays from the straight line. Keep `gain` near 3:
  more and the bloom swells it to a blob. A `glow` layer of one short burst in the carried effect is
  the flash that lights the cloud where the bolt starts.

### Building a burst

An explosion, an impact, a blast: one event, over in a few seconds. `tools/workshop/assets/effects/explosions/blast.json`
is one, and `explosions/blast.views.json` the views it was looked at through. What it uses:

- **A plan of what reads when**, written before any number: a flash for two frames, a burst that leaps
  out and stops, a hang while it cools, then smoke, dust and falling rocks. Each layer is there for one
  of those moments.
- **A handful of burst layers, each hundreds of particles.** Fire, smoke, dust and dirt are one layer
  each, `n` in the hundreds, thrown once. An effect carried by every puff of a layer is a thousand
  emitters; `carry` is for the few things that leave a trail: the rocks, the spark jets, the wisps.
- **Shared force generators, and no forces on a layer.** `blast` throws, `air` slows, `gravity` pulls
  down, `heat` lifts, `column` gathers. Each layer names how hard it is in each, so the fire, the dust
  and the rocks are thrown by the one push and stopped by the one air.
- **The push is an impulse.** `blast` is a negative `pull` anchored to the effect with an `overAge`
  that ends it a fifth of a second in, so smoke born after it is left where it is. A push with no
  `overAge` goes on pushing whatever is born inside it.
- **A strength is a range.** `"forces": { "blast": [60, 380] }` rolls each particle its own, so one
  layer fills a ball. One strength throws every particle as far, and the layer is a hollow shell.
- **Where a layer starts says which way it goes.** The push is out from one centre just above the
  ground: dust started under it is driven down and runs along the floor, fire started round it makes a
  ball, and dirt and rocks started over it go up in a cone.
- **The air stops the fast hard.** `air` is a `drag` with a `dragBySpeed`, so the fire leaps and stops
  dead, and what is slow drifts on.
- **Colour, opacity and size are stops.** The fire's `tints` run white, yellow, orange, dark red, near
  black; with lives rolled over a wide range, short-lived puffs are already dark beside long-lived ones
  still bright, which is the mottled look of a fireball. Smoke and dust fade in with `alphas` instead of
  popping, and swell fast and then slowly with `grows`.
- **Smoke billows by turbulence.** `heat` is a lift with a `turbulence` and a `noiseScroll`, and
  `column` a pull to the vertical line through the middle (`toAxis`), so the smoke folds as it rises and
  draws into a column. A `swirl` on a burst turns the whole of it like a top; leave it out.
- **What a carrier sheds goes its way.** The spark jets' sparks have `inherit`, so they are stretched
  along the jet's path and trail behind its head.

Build it one element at a time and look at each alone (`only` in a view) before the next, the fire
first. A still shows a moment and nothing of the motion: after the pictures read right, watch it play in
the workshop.

### Building a flipbook effect

A flipbook is a sprite sheet whose frames a particle plays through as it lives: tongues of flame that
lick, smoke that billows, a bolt that strikes. It is never painted and never a simulation. It is
rendered by Blender from a procedural node tree, one plane seen straight on, once a frame, and time is
one more input of the noise that draws the shape: a 4D noise's `W` keyed from the first frame to the
last is the shape changing. Use one where particle3d's soft `shape`s cannot give the detail: a fire's
tongues, a smoke's lit lobes, a bolt's forks.

- **The effects file says what is rendered.** Its `flipbooks` list is every flipbook its layers draw:
  each entry's `name` (the sheet it writes, `<name>.json`, beside the file), `clip`, `frames`, `loop`
  (frames laid back over the first so a stream's clip runs round without a jump), `across`, `cell`,
  `plane`, `samples`, `fps`, `pivot`, its `nodes` written out whole, and its `images`. The whole of an
  entry is the header of `tools/workshop/flipbooks.py`; particle3d does not read it.
- **The picture is masks, not colours.** Each of an image's four `channels` is worked out of a field
  of the node tree by its `op`: `value`, `alpha`, `light` (the light that reaches each pixel from one
  side through what is before it), `shade`, `volume` (lobes that shadow the lobes behind them),
  `glow`, `motion`, `const`. The layer then says how the channels are drawn with `channels`,
  `{ value, alpha, hot }`, four weights each, and its colour is its `tints`: one smoke sheet is soot
  in one layer and steam in another. A sheet of smoke whose channels are its light from the right, the
  top and the left and how much it hides, drawn lit from the upper right, is
  `{ "value": [0.55, 0.45, 0, 0], "alpha": [0, 0, 0, 1], "hot": [0, 0, 0, 0] }`.
- **A flipbook layer's own fields.** `sheet` and `clip`; `start`, the part of the clip each particle
  begins on, rolled, so a stream never plays one frame in step (`[0, 1]` for a looping clip, a short
  range like `[0, 0.15]` for one played once from its start); `blend`, each frame faded into the next,
  so few frames play smoothly; `erode`, stops of how much of its cover is cut away over its life, so a
  puff thins at its wisps first in place of fading all at once. Their lines are in the header of
  `plugins/particle3d/particle3d.plugin.ts`.
- **`ppm` is the main file's.** A frame is drawn its pixels / `ppm` metres across, and particle3d reads
  `ppm` off the effects file the scene names, never off a file its `files` lists: a game that lists a
  file of flipbook effects gives its main file the same `ppm`.
- **Each sheet is a catalogue entry.** The scene's loader catalogue names each flipbook's sheet by its
  name, `{ "type": "sheet", "url": ".../<name>.json" }`, so a layer of any file draws it by that name:
  `games/demo_particle3d/main.scene.json`'s campfire draws `tongues` and `coals` from its own folder and
  `smoke` and `embers` from theirs.
- **Names are one space.** A file's `files` are laid over it, their effects and force generators by
  name, and the later file's wins without a word. An effect or a generator brought in from another
  file is renamed when its name is taken (demo_particle3d's flipbook `smoke` is `billow`, its `arc`
  `crackle`, since the demo's smoke and the portal's arc were there first).
- **The game's bake renders them.** `flipbooks(file)`, a tool of `scripts/bake.ts`, runs
  `flipbooks.py` in Blender on an effects file and writes its pictures and sheets beside it; a game's
  `<game>.bake.ts` calls it for each file with `flipbooks`, and the pictures and sheets are committed
  (`committing-a-game`), so the game plays as downloaded with no Blender. Rendering reads nothing from
  the library. By hand: `blender -b --python tools/workshop/flipbooks.py -- <effects file>`.
- **Looked at with the sheets given.** A view of `yarn particle-views` names the sheets its effect
  draws, `"sheets": { "<name>": "<path of its sheet json>" }`, and the workshop opens a file no game
  names with `--sheet <name>=<path>` for each.

`tools/workshop/assets/effects/` holds the thirteen built so: `campfire/`, `flame/`, `embers/`,
`column/`, `smoke/`, `steam/`, `swirl/`, `splash/`, `bolt/`, `arc/`, `fireball/`, `shockwave/` and
`dust/`, each `<name>/<name>Config.json` and what it renders, looked at through
`flipbooks.views.json`, `campfire.views.json`, `bolt.views.json` and `arc.views.json`.
`games/demo_particle3d` ships all thirteen, each on a tile of its own, and its older effects, built with
`puff` and `puff2`, draw from them: a puff laid over is the `smoke` flipbook (`"sheet": "smoke",
"clip": "billow", "start": [0, 0.2], "blend": true`, its smoke `channels` and an `erode`), and a puff that
adds is the `fireball` flipbook (`"clip": "bloom"`, `"blend": true`, `"channels": { "value": [1, 0, 0, 0],
"alpha": [1, 0, 0, 0], "hot": [0.6, 0, 0, 0] }`), every other field as it was: both sheets' frames are a
metre across at 256 `ppm`, as the shapes are. The campfire is one built
whole: a lamp; two layers of `tongues`, one laid over in deep orange and one added in pale yellow,
each started at a rolled part of the clip and blended; two layers of `coals`, a dark mound laid over and
its cracks added; a `smoke` layer eroding as it rises; `spark`s; and `embers` drifting up.

## Never

- A field written on the real row to show an effect: it changes the game.
- A debug setting, flag or field on the look plugin, or a toggle in `index.html` or `client.html`.
- A number of an effect written into the plugin's code: it is the effects file's or the definition's.
- One effect's layers bent to serve two moments that want different looks: make it two effects.
