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
  `spread`, `speed`, `g`, `drag`), whether it stays with the moving point (`follow`) or is left behind
  as a trail, its colour as it cools (`tint`, `tint1`), how bright for the bloom (`gain`), blended by
  adding light (`add`) and turned along its path (`stretch`). One effect thrown in more than one
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
node --experimental-strip-types tools/workshop/workshop.server.ts
```

and opened at `http://localhost:5180/particles?game=<game>` (`WORKSHOP_PORT` runs it on another port;
add `&file=<repo path>` for one of several effects files, `&effect=<name>` to open on one). The full
account is the header of `tools/workshop/particles.ts`. A game needs nothing of its own to join it:
every scene that lists `particle3d` with a `world.particle3d` is found, and its effects file, sheets,
render3d prefab and `dt` are read from it.

- **The left column**: every effect of the file, and a new one made by its name.
- **The stage**: the effect thrown from the middle of a grid of 1 m squares, beside a 1.8 m stick, a
  person, the camera turned round it with the mouse. An effect with an `every` on any layer is a
  stream and runs without end, as the game runs it while it is on. Any other is a burst: a Throw
  button, and a toggle (on to start) that throws it again every so many whole seconds (2 to start).
  Under it, as a rule's `emit` would give them: its scale, its `dir` (which a layer with no `dir`
  throws along and swirls about), its `to` (where a beam ends), and how fast time runs, down to a
  twentieth, so a burst can be watched.
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

## Never

- A field written on the real row to show an effect: it changes the game.
- A debug setting, flag or field on the look plugin, or a toggle in `index.html` or `client.html`.
- A number of an effect written into the plugin's code: it is the effects file's or the definition's.
- One effect's layers bent to serve two moments that want different looks: make it two effects.
