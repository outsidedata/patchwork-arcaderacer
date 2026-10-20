---
name: designing-a-kind
description: Use in core, or any clone of it, when adding a thing with rules to a game, a new kind (an enemy, a pickup, a coin, a door, a switch, a score, a counter, a spawner), writing its `<kind>.sim.ts` rule or `<kind>.client.ts` look, or making things in a game act on each other (picks up, hits, opens, counts, spawns, ends). Also when deciding whether a value is a seat's own (a field of its `player` row: its score, health, ammo) or no seat's (a kind of its own: a team's total, a shared tally), whether an act on the `player` row could be sent by the seat itself, whether a value goes on a row, in a kind's definition (`def`, `assets/<game>.json`), on `world` or in a prefab; whether a thing is one `actors` entry or many, or spawned; how one kind finds or changes another (`w.find`, `w.all`, `w.get`, `w.call`, `open`, `w.spawn`, `w.end`, before/tick/after); when several kinds share code through a game's own plugin in `games/<game>/plugins/<name>/`; and when a rule needs random numbers (`world.seed`, `w.die`).
---

# Designing a kind

A kind is one sort of thing in a game that has rules: a coin, a door, a score, a monster. Its rule
is `<kind>.sim.ts` and its look `<kind>.client.ts`, both in the game's folder, `games/<game>/`, and
each thing of it is a row. The engine's whole API for a kind is the top of `engine/engine.ts`
(`Kind`, `Hook`, `Act`, `W`) and of `engine/browser.ts` (`Actor`, `Plugins`, `Wire`), with the order
a step runs in shown by `engine/engine.test.ts`. The engine is frozen: nothing here edits it. The
game `yarn new-game` writes (its files are listed in the header of
`extensions/games/games.route.ts`) still makes the seat's square a `body` row its `player` row spawns,
the pattern that drew every game's thing a round trip after its key; it is folded into `player`
before anything else (`starting-a-game`, Fold the body into the player row), and the `body` files are
never read as a model. Once folded, its working kinds to read first are `player.sim.ts` and
`player.client.ts`, the `player` entry of `assets/<game>.json`, and the `start.sim.ts` it stands on;
how the seat's own kind is built is `designing-a-seat`.

## When it applies

It applies to a game's own thing that has a rule or a look, and to kinds acting on each other. It
does not cover:

- a seat: binding keys or a pad, what a seat may send, where it starts. That is `input-and-seats`.
  Its `player` row, the thing the seat plays as with every field of its own, and how its rule and
  look are built, is `designing-a-seat`.
- building a plugin, a top-level one or the browser half or row of a game's own. That is
  `building-a-plugin`. When this work shows a plugin is needed, the plugin is built there and
  used here.

## Where each value goes

Every value a kind has goes in one of five places. Ask in this order.

- It changes while the game runs: a field of the row. Its starting value is a field of the kind's
  prefab, `prefabs.<kind>` in the scene file, and each `actors` entry or `w.spawn` may start a
  row with other values. A prefab holds what changes and nothing else.
- It never changes and is the kind's: its definition, the kind's entry in the game's data file,
  `assets/<game>.json`, which the scene's `world.defs` names and its loader catalogue,
  `world.loader.assets`, lists as a `json` entry with `preload`. A rule reads it with
  `def(w, me.kind)`, a look with `def(plugins.wire, row.kind)` (`plugins/loader/loader.sim.ts`).
  Speeds, sizes, colours, reaches, worths, timings: all here.
- It never changes and is the scene's own: a field of the scene's `world`, which no packet
  carries. A rule reads `w.world`, a look `plugins.wire.scene.world`. A child scene's `world` is
  the manager's with its own over it, key by key (`addons/scenemanager/scenemanager.addon.ts`).
- It is big and never changes, a table, a level, a cast: a data file of its own in `assets/`, an
  entry of the catalogue, named by a field of the kind's definition, read with `json(w, name)`.
  `json` throws `loader has not finished <name>` until the file has landed, so the entry has
  `preload`, which the scenemanager awaits before the first step, or the rule asks `load(w, name)`
  and reads it only once `ready(w, name)` says so (`plugins/loader/loader.sim.ts`).
- Only the page uses it and the server never reads it, a volume, a brightness, sound on or off: a
  key of the store, which a look reads and writes with `plugins.store.get` and `set`
  (`plugins/store/store.plugin.ts`). It is never sent, never on a row, a definition or `world`, and
  no rule reads it.

A row is sent to every seat every step, so a fixed number never rides on a row or a prefab,
however easy the row is to reach. A thing whose fixed numbers differ from another's is another
kind: two kinds with one rule are two one-line files handing out the one rule under each name,
each with its own definition. That is for the rule alone. A look is imported once per row, and a
look handed out by re-export is one module for every row of every kind that re-exports it, so a
look several kinds share is drawn another way (Shared code and systems). Where a seat starts is
never on `world` or in a definition: it is a `start` actor per slot, which `yarn new-game` writes and
`input-and-seats` covers. No number is written in code, the rule's or the look's.

## The work in order

1. Ask the person making the game what the thing does: what the monster does, when the door
   opens, what the coin is worth. That is content, and it is theirs. Ask nothing else.
2. Decide whether it is a new kind, and whose it is. A new system is a new kind, never a field
   added to a kind that exists for another reason. But what a seat owns is no new system: it is a
   field of that seat's `player` row, the thing the seat plays as. Its place, health, ammo, lives and
   score, its laps, its hand of cards: each a field of its `player` row (`designing-a-seat`). A score only its own seat may read stays on that row and is listed in
   the scene's `security` block, never moved to another row to hide it. A value carried in from the
   last scene arrives as `arrive` on that row's own field and goes on changing there (`scene-flow`,
   step 7). A value no seat owns is a kind of its own: a team's total, the coins left in the level, a
   match's clock, a shared `tally`. Name the kind by what it is, a lower-case identifier that is not
   the game's name (`<game>.sim.ts` is the manager's) and not a plugin's (the page would load that
   plugin's file as its look).
3. Its definition: an entry keyed by the kind in `assets/<game>.json`, every fixed number of it.
4. Its prefab: `prefabs.<kind>` in the scene file, every field that changes at its starting value,
   `{}` when it has none (a kind with no prefab throws `no prefab for <kind>`: at boot for an
   `actors` entry, at the `w.spawn` call for a spawned row). A prefab
   every scene of the game uses may go in the manager's `<game>.scene.json` instead, written once.
   A thing that stands somewhere keeps `pos` there, which the editor's placer for the scene's
   renderer moves (`plugins/render2d/render2d.extension.tsx`).
5. Its rule: `games/<game>/<kind>.sim.ts`, exporting `export const <kind>: Kind = { ... }`, with a
   header comment saying what each field means and what the rule does (below).
6. The scene's sim: `<scene>.sim.ts` imports the rule and lists it in `sim`. Every kind the scene
   makes rows of is listed, a spawned one too and one whose prefab only the manager's file gives.
   An `actors` entry of a kind the sim leaves out throws `no code for kind <kind>` at boot; a
   spawned row of one throws a TypeError at its first step, reading a pass of a kind the sim has
   not got.
7. Its rows. Global, one of it in the scene: one `actors` entry, `{ "is": "<kind>" }`. Instanced:
   an entry per thing the scene places, in the scene file's `actors` or the `<level>.actors.json`
   its `actorsFile` names, or rows a rule makes with `w.spawn` while the game runs.
8. Its look, when it is drawn: `games/<game>/<kind>.client.ts` (below). No file, no drawing.
9. Its test beside the rule, `<kind>.sim.test.ts`, run (How it is proven).
10. Play it.

The editor's New kind (the Kinds panel, or `kinds.make` on its MCP endpoint,
`extensions/kinds/kinds.extension.tsx` and `kinds.route.ts` beside it) makes a kind as one change
with one undo, blank or like another kind of the game. Made blank, it writes a rule that does
nothing, `export const <kind>: Kind = {}`, the import and entry in each scene sim picked, and an
empty prefab, and no look and no definition: steps 3 and 8 stay to be done, and until the
definition is written every `def(w, me.kind)` throws `<defs> has no definition of <kind>`. Made
like another kind, it copies that kind's rule, its look when it has one, its prefab and its
definition under the new name, and puts the new kind beside it in the tables and lists of the
game's data picked.
The job is the whole kind, steps 1 to 10, either way.

## The rule

A `Kind` is `{ before?, tick?, after?, acts?, open? }`, and a rule runs in those and nowhere else.

- A hook is `(me, dt, w) => void`: `me` the row, `dt` the seconds the step covers (a child scene
  is stepped by its manager's `scenemanager.dt`), `w` the world. A rate is multiplied by `dt`. A
  rule cannot read the engine's step counter: a kind that counts steps or time keeps the count on
  its row, as the ledger in `plugins/audio/audio.sim.ts` counts its own `step`.
- A step answers every seat's messages first, then runs every row's `before`, then every row's
  `tick`, then every row's `after`, each pass over the rows in the order they stand: the scene's
  `actors` in its order, then the rows spawned, oldest first. So a rule that reads what another
  row did this step reads it in `after`; in `tick` it reads that row as the last step left it
  whenever that row stands later in the list.
- An act is `(me, w, seat, ...args) => void`, under `acts`. A seat's message names a row and an
  act, and the engine runs it only when the seat possesses that row, its own `player` row, or the
  act is in the kind's `open`. Every other message is refused and runs nothing. `open` is for an
  act any seat may send at a row it does not own, as `go` on the `scenemanager` row is
  (`plugins/scenemanager/scenemanager.sim.ts`). A kind reached only through rules or through the
  `player` row lists no `open`.
- Arguments that came from a seat, straight or passed on through `w.call`, came from outside the
  program, and the act checks them, as the folded `player.sim.ts`'s `move` checks its two numbers
  and `go` refuses a scene it does not name. An act only rules call takes its arguments as typed.
- `w.spawn(kind, data)` makes a row of a kind with a prefab, `data` over the prefab's fields, and
  returns it. A row spawned during the passes runs from the next step's `before`; one spawned by an
  act a seat sent, or between steps, runs that step. `w.all` and `w.find` see it at once.
- `w.end(row)` takes a row out. It runs nothing more, in that pass or the ones after it, and the
  seat's next packet lists it as ended, which calls its look's `remove`. A row may end itself.
- Anything a kind remembers from one step to the next is a field on its row, because a browser
  that arrives later is sent rows and nothing else. Never `w.world` (no packet carries it), never a
  variable at the top of the rule file (every truth in the process runs the one module).
- The engine copies a prefab into each row, but not the data handed to `w.spawn`. A row spawned
  with another row's array, or with an entry of `w.world.scenemanager.actors` as its data, holds
  that very array, and a write into it in place moves the other row, or the entry every later
  spawn from it starts from. So a rule spawns with copies, `w.spawn('shot', { pos: [...me.data.pos] })`,
  takes a copy of another row's array, `me.data.pos = [...start.data.pos]`, as the folded
  `player.sim.ts` does, and writes an array or object field whole, `me.data.pos = [x, y]`, as its
  `tick` and `plugins/walker/walker.sim.ts` do. A row booted from an
  `actors` entry holds that entry's arrays too, but the scenemanager hands the engine its own copy
  of the scene's list on every boot (`addons/scenemanager/scenemanager.addon.ts`), so a write there
  moves only that boot's copy.

## The look

`<kind>.client.ts` exports `setup(row, plugins)`, `tick(row, plugins)` and `remove(plugins)`. The
page's client calls `setup` when a row of the kind is born in a packet, `tick` every frame with the
row as that frame took it, and `remove` when the row ends or the client closes
(`engine/browser.ts`). It draws through the plugins the scene lists, `plugins.render2d`,
`plugins.render3d`, `plugins.ui`, and builds nothing a plugin builds. It reads what changes off
`row.data` and every number it draws by off the kind's definition, `def(plugins.wire, row.kind)`;
it writes no number of its own. That includes the numbers a drawing call hides: the angle a ring or
an arc starts at, which is a knob and not a direction, and the order of a line's fields and the gaps
between them, spaces in a string among them. `plugins.wire.rows` holds every row the seat was sent,
for a look that draws another row's state beside its own.

A look that draws a picture, a sprite sheet, a model or a sound reaches the file through the scene's
loader catalogue, `world.loader.assets`, and `plugins.loader`, and nothing else: no path in its
code, no fetch, no decode of its own. Art the UI draws, on its own canvas, is an entry of its own
with `"for": "ui"`, and a file both draw is two entries. How art comes in is `bringing-in-art`.

The client imports the file once per row, as `<kind>.client.ts?row=<id>&client=<c>`, `c` the
client's own number, so what it drew, held in a variable at the top of the file, is that row's
alone, as the folded `player.client.ts` holds its square, and no other client, a second seat's in
the same tab or the next scene's, runs that module. The look sets every such variable in `setup`,
never where it is declared.

A look is set up for every row of its kind the page is sent, other seats' among them. The `player`
look draws every seat's thing and binds keys and moves the camera only for the row that is `mine`
(`designing-a-seat`, The look). A HUD, a camera or any look that wants the seat's own row finds it
with `possessed(plugins.wire.rows)` from `#plugins/player/player.plugin.ts`, never
`rows.find(r => r.kind === 'player')`, which is whichever seat's row came first.

## Kinds acting on each other

One kind never imports another's file. They meet through the rows:

- Reading. A rule reads its own kind's definition, `def(w, me.kind)`, and a look its own,
  `def(plugins.wire, row.kind)`, and neither reads another kind's. Another kind's numbers reach it two
  ways. A check that needs both rows' numbers, a touch that needs both sizes, is a function of a
  plugin of the game's own, handed the other row and reading that row's definition, `def(w,
  other.kind)`, as it reads each row's it is handed (Shared code and systems). A big table both kinds
  read is a data file of its own in `assets/`, catalogued, named by a field of each definition and
  read with `json(w, name)`.
- Finding. `w.find(kind)` is the one row of a global kind; `w.find(kind, pred)` the first row that
  matches; `w.all(kind)` every row of it; `w.get(id)` a row by id. `w.find` throws
  `no <kind> matches` and `w.get` throws `no row <id>`, so they are for a row that must be there;
  a row that may not be is asked with `w.all(kind).some(...)` or `.find(...)`. Ids are never used
  again in a truth, so an id a row keeps names that row or none: a kept id is tested with
  `w.all(kind).some(r => r.id === id)` before `w.get` whenever that row can end. A scene booted
  by the scenemanager also has `w.world.scenemanager.actors`, its `actors` entries as placed, for a
  rule that makes again what the scene placed.
- Changing. A rule changes another kind's row by calling one of that kind's acts,
  `w.call(row, act, seat, ...args)`, which runs at once, inside the caller's pass, with no `open`
  check, and throws `no action <kind>.<act>` when there is none. The act is where that row's
  fields are written, so each field has its rule in one file. An act passes on the `seat` it was
  handed. A hook has no seat: it passes `-1` to an act that does not read it, as
  `plugins/cutscene/cutscene.sim.ts` and `plugins/volley3d/volley3d.sim.ts` do. An act that does
  read it does nothing for anyone with `-1`: `go` on the `scenemanager` row keys the move by the
  seat's number on that truth, so a hook that sends a seat on passes the number its `player` row
  kept from the `arrive` act it was handed (`plugins/scenemanager/scenemanager.sim.ts`).
- Changing a seat's `player` row. A seat may send any act its own `player` row has (`answer` in
  `engine/engine.ts`), so an act there that other kinds call to change it, `hurt`, `award`, `heal`,
  `gain`, `power`, is one the seat could send itself: `award(99)` from the page. Each such effect is
  an act that returns at once when a seat sent it, `if (seat >= 0) return`, called by rules with
  `-1`; or a plain function of a game plugin that other kinds call, handed the player row, when the
  same effect serves several kinds (`designing-a-seat`, Acts a seat can send). Either way the field
  has its rule in one place. Only the acts the seat's keys send take a seat's message, and each
  checks its args.
- Making and taking away. `w.spawn` and `w.end`, on any kind.
- Asking a plugin. A rule takes what a plugin's function hands back. A value the plugin works out
  and drops, as volley2d's `strike` works out each bullet's heading and hands back hits without it
  (`plugins/volley2d/volley2d.sim.ts`), is added to what the function returns, in the plugin, with its
  test (`building-a-plugin`). A rule never runs the plugin's arithmetic again off the plugin's row to
  get it back; one that does is old code, never a pattern.
- Events the page plays once, a sound or an effect, are raised on a ledger plugin's row through its
  function or act (`sound(w, cue, at, from)` or `play` in `plugins/audio/audio.sim.ts`), never as a
  field a kind sets for one step: a page reads only the last packet a frame takes, so a field set
  for one step is missed whenever two packets land in one frame. A sound raised `from` a `player`
  row rides that row's own `voiced` list instead of the ledger, so the seat's own jump or shot is
  heard on the frame after the key, drawn from the copy that runs ahead; a rule of the seat's thing
  raises its sounds `from` it. How a game's sounds are raised and played is the `sound` skill.

For example, a coin a seat's `player` row picks up: its worth goes to that seat's own `score`, a
field of its `player` row, and the coins taken in the level, which no seat owns, to a `tally`. The
coin's definition is `{ "reach": 24, "worth": 5, "size": 16, "colour": "#f2a93b" }`, its prefab
`{ "pos": [0, 0] }`, with an `actors` entry per coin; the `player` prefab holds `"score": 0`; the
tally's prefab is `{ "taken": 0 }`, with one entry.

```ts
// coin.sim.ts
export const coin: Kind = {
  after(me, _dt, w) {
    const { reach, worth } = def(w, me.kind)
    const [x, y] = me.data.pos
    const by = w.all('player').find(p => math.hypot(p.data.pos[0] - x, p.data.pos[1] - y) <= reach)
    if (!by) return
    w.call(by, 'award', -1, worth)
    w.call(w.find('tally'), 'add', -1, 1)
    w.end(me)
  },
}

// player.sim.ts, among its acts: rules award points, a seat never does.
award(me, _w, seat, worth: number) {
  if (seat >= 0) return
  me.data.score += worth
},

// tally.sim.ts
export const tally: Kind = {
  acts: {
    add(me, _w, _seat, n: number) {
      me.data.taken += n
    },
  },
}
```

The coin reads the `player` rows in `after`, once they have moved this step. `award` returns for a
seat's message, so a seat cannot send itself points, and the seat's page draws its new score off its
own row on the frame after the touch. The tally lists no `open`, so no seat can send it `add`.

## Shared code and systems

Kinds share code through a plugin of the game's own, never by one importing another. When two or
more kinds need the same code (a test of touching, a grid's cells), or the game has a system (its
level, its HUD), it is `games/<game>/plugins/<name>/`, laid out as a top-level plugin is:
`<name>.sim.ts`, its server half, functions a rule imports from `./plugins/<name>/<name>.sim.ts`
and calls with the row it is working on, as a rule calls `plugins/walker/walker.sim.ts`'s `walk` for
its own row; and `<name>.plugin.ts`, its browser half, which the `shipped` plugin loads when the
scene lists `shipped` in `plugins` and names `<name>` in `world.shipped.plugins`
(`plugins/shipped/shipped.plugin.ts`). A look imports the server half's functions too when it
draws from them.

It may name the game's kinds. It has no numbers of its own and no prefab of numbers: it reads every
number off the definition of the kind whose row it was handed, `def(w, me.kind)` in its server half
and `def(plugins.wire, row.kind)` in its browser half, as that kind's rule or look would, or off a
file that definition names. Its one entry in `world` is `world.<name>.mods`. It has a row only when
its server half has state that changes, and that row carries that state and nothing else; the row's
prefab holds those changing fields, because the engine boots no row without one.

A rule several kinds share is a `Kind` exported from the plugin's server half, named for what it is,
`rock`, and never the plugin's own name: what a server half exports under its plugin's name is the
kind of that plugin's own row (`building-a-plugin`). Each kind's rule file is one line handing it
out under the kind's name, and each kind has its own definition, which the shared rule reads with
`def(w, me.kind)`.

A look several kinds share is the plugin's browser half, never a file the kinds' looks import or
re-export: a look is imported once per row, and a module they share would be one for every row. Two
looks that would be one code under two definitions, a title card and a game-over card that differ
only in their words and places, are such a look, written once there; never a second
`<kind>.client.ts` copied from the first and its names changed. The
browser half, loaded by `shipped`, draws every row of those kinds from `plugins.wire.rows` in its
`tick`, which runs before the renderer draws in its `afterTick`. It keeps a map from row id to
drawing inside its exported function, makes a drawing for a row it has not seen, moves each by its
row, and takes off the drawing of a row no longer there; its `close` disposes every one. Drawn on
the UI, that map is `ui.show` keyed by the row's id, `` ui.show(panel, `${row.id}.heading`, make) ``:
`make` runs for a row the first frame it is shown, the same object comes back every frame after,
and the drawing of a row no longer there is destroyed after the first frame nobody shows it
(`building-the-hud`, What the ui plugin does). Two rows of one kind never share a key, or the second
`show` throws `ui showed <panel> <key> twice in one frame`. Those kinds
have no `<kind>.client.ts`, and no look or rule imports a `.plugin.ts` for what it makes: a look that
needs the plugin reaches it as `plugins.<name>`, from its `tick`.

Building it is `building-a-plugin`.

## The seed and the die

`w.die()` is a number from 0 up to 1 from the truth's own generator, seeded with the scene's
`world.seed`; a scene whose `world` has no `seed` throws `scene has no seed` on the first roll. A
child scene's `world` is the manager's with its own over it, so a `seed` in the manager's `world`
seeds every scene, each with a generator and a counter of its own. Only `w.die()` moves it, so a
step booted again and replayed with the same inputs rolls the same numbers, which is how the
recorder goes back (`addons/recorder/recorder.addon.ts`). `Math.random` in a rule rolls numbers no
replay gets back and no page agrees with. A roll
that must not move the scene's generator, and is the same on every machine for one row on one
step, is `seeded` from `engine/engine.ts` over a hash of the row's id and a step counter the row
keeps on itself: `seeded(Math.imul(me.id, 0x9e3779b1) ^ me.data.step)()`, with `step` a field of
the prefab its `before` adds one to. `chance` in `plugins/audio/audio.sim.ts` is the same hash
over the audio ledger's own `step`, for any row of a scene with that ledger.

## Maths in a rule

A rule runs on the server's node, and again in every page that runs its scene ahead
(`world.predict`, `going-multiplayer`). JavaScript leaves `Math.sin`, `cos`, `tan`, `asin`, `acos`,
`atan`, `atan2`, `sinh`, `cosh`, `tanh`, `asinh`, `acosh`, `atanh`, `exp`, `expm1`, `log`, `log1p`,
`log2`, `log10`, `pow`, `**`, `cbrt` and `hypot` to each engine, and node and Chrome differ in the last
bit on 2 to 16 in every 100 inputs of each but `hypot`, so a page's copy computed with them ends a
hair from the server's. A rule imports `plugins/math`, `import * as math from
'#plugins/math/math.sim.ts'`, and calls `math.sin(a)` where it would call `Math.sin(a)` and
`math.pow(a, b)` where it would write `a ** b`: each hands back the same bits on every engine. What
`Math` computes exactly stays on `Math`: `sqrt`, `abs`, `floor`, `ceil`, `round`, `trunc`, `sign`,
`min`, `max`, `fround`, `imul`, `clz32` and the constants, `PI` and the rest. Core's three is
`outsidedata/three.js`, whose `src/math` turns every angle with a copy of the same code, so a rule
may use three's vectors, quaternions, matrices, `Euler` and `MathUtils` (`setFromAxisAngle`, `slerp`,
`angleTo` and all); the rest of three, its curves and its scene graph, calls `Math` as the engine has
it and stays out of rules. `games/games.test.ts` fails on a rule of any game that breaks either, and
`plugins/math/math.sim.test.ts` on a plugin's server half. A look only draws, and may use `Math`.

## What goes wrong

- A rule in `tick` reads another row's move a step late. A coin's touch test written in `tick`
  took the coin one step after the seat's square reached it; in `after` it took it on the step.
- A fixed number put on the prefab, a row or the code, because it was close. It goes in the
  definition, `world` or a data file.
- A new system added as a field of a kind that exists for another reason: a team's total or a
  match's clock on a monster, or on one seat's `player` row. A value no seat owns is a kind of its
  own.
- What a seat owns, its health, ammo, lives or score, kept on a row its `player` row spawns, or on a
  shared kind keyed by slot. It is a field of its `player` row. One only its own seat may read is listed in
  `security`, never moved to another row to hide it (`designing-a-seat`).
- An act on the `player` row that other kinds call to change it, with no refusal of a seat: the seat
  sends it to itself. It returns for `seat >= 0`, or is a game plugin's function.
- A look that finds the seat's own row with `rows.find(r => r.kind === 'player')`: that is whichever
  seat's row came first. It is `possessed(rows)`.
- A rule writing another kind's fields straight. The field then has rules in two files. It calls
  that kind's act.
- A row spawned with another row's array, or with an entry of `w.world.scenemanager.actors`, and
  then written in place, moving the other row or the entry with it. Spawn with copies.
- Memory kept in a variable at the top of the rule file or on `w.world`. It goes on the row.
- `w.find` or `w.get` asked for a row that may have ended, which throws. Ask with `w.all`.
- The kind left out of the scene's `sim`, which throws `no code for kind <kind>` at boot for an
  `actors` entry and a TypeError at a spawned row's first step; or given no prefab, which throws
  `no prefab for <kind>` at boot or at the `w.spawn` call.
- A look that draws by a number of its own, or keeps a variable set where it is declared rather
  than in `setup`: a ring's starting angle and a line's field order and gaps are numbers too.
- A rule or a look reading another kind's definition, `def(w, 'player')` or `def(w, other.kind)`. A
  touch that needs both sizes is a function of the game's own plugin, handed the other row.
- Two kinds sharing code by one importing the other. It is a plugin of the game's own.
- A look shared by re-export or by importing a `.plugin.ts`, one module for every row. The plugin's
  browser half, loaded by `shipped`, draws every row of those kinds.
- A look copied from another kind's, one code under two definitions. It is one shared look, the
  plugin's browser half, drawing each row by its own kind's definition.
- A shared rule named after the plugin it lives in. It is named for what it is.
- A rule working out again, off a plugin's row, what the plugin's function worked out and dropped.
  The plugin hands it back.
- A top-level plugin given a setting only this game would set. That behaviour is this game's kind.

## How it is proven

Every kind has a test beside its rule, `games/<game>/<kind>.sim.test.ts`, a `.test.ts`, run in
node. It boots the game's manager as the page boots it and reads what the kind wrote off the rows:

```ts
import { expect, test } from 'vitest'
import { boot, type Arg, type Scene } from '#engine/engine.ts'
import { connection, load, manager, type Down } from '#addons/scenemanager/scenemanager.addon.ts'
import { possessed } from '#addons/player/player.addon.ts'
import { sim } from './<game>.sim.ts'
import file from './<game>.scene.json' with { type: 'json' }
import defs from './assets/<game>.json' with { type: 'json' }

const DT = file.prefabs.engine.dt

test('<what the kind does, in a sentence>', async () => {
  const truth = boot(file as Scene, sim)
  const room = (await load(truth, import.meta.url)).get('<scene>')!
  const heard: Down[] = []
  const seat = connection(manager(truth), d => heard.push(d))
  let seq = 0
  const press = (action: string, ...args: Arg[]) => {
    const last = heard[heard.length - 1]
    const me = possessed(last.packet.rows)!
    seat.take({ scene: last.scene, seat: last.seat, msg: { seq: ++seq, n: last.packet.n, id: me.id, action, args } })
  }
  truth.step(DT)
  // drive, step, read
})
```

Then it drives the seat with `press`, steps with `truth.step(DT)`, and reads the kind's rows off
`room.rows`, and off the last packet in `heard` to show the seat is sent them. Every number it
checks against comes from `defs` and the rows, never written again in the test. Where the pass
matters it pins the step a thing happens on, stepping one step at a time. A seat sending an act it
may not send, at a row it does not own, is checked to change nothing, and so is a seat sending its
own `player` row an act only rules may call (`award`, `hurt`): the step runs and the row is as it
was. Messages are numbered from 1 for each visit, as the client numbers them: a scene that runs
ahead takes a seat's messages in order from 1, and one numbered past a gap waits for ever. A kind
that changes what the seat's own thing does also shows on screen by the frame after the key, which
the game's press test, `<game>.predict.test.ts`, holds (`going-multiplayer`, How it is proven).
Once the test passes, break
the rule on purpose, move it to the wrong pass or drop the act, and see the test fail. A test
never fakes what a plugin should do.

A screen kind with no rule, `export const <kind>: Kind = {}`, a title card a shared look draws, has
nothing for the server to run. What it shows is proven by the shared look's page test,
`games/<game>/plugins/<name>/<name>.plugin.test.ts` (`building-the-hud`, A HUD plugin of the game's
own), which reads what each row shows off the panel by its key against that row's own definition.
Its `<kind>.sim.test.ts` holds the one check left: a message a seat sends at its row, naming an act,
`seat.take({ scene, seat, msg: { seq, n, id: <its row's id>, action, args } })`, is refused, the step
runs, and the row is as it was.

Run the tests beside what changed, and the game's own:

```
yarn vitest run games/<game>/<kind>.sim.test.ts
yarn vitest run games/<game>/<game>.sim.test.ts
yarn tsc
```

`yarn tsc` checks the game's files; `yarn lint` does not reach them. A test that attaches the game
view, so the client is made and draws frames, is `<kind>.view.test.tsx`, run with
`yarn test:view <path>`.

Then play it: `yarn editor <game>`, and open `http://localhost:5173/games/<game>/index.html`, or
the editor at `http://localhost:5173/editor/?game=<game>`. The thing is drawn where its row says,
it acts on what it should, and a row that ends leaves nothing drawn. A kind that draws is looked at in
Chrome (`.claude/skills/good-webviews/`), and a screen in each state it has, a screenshot of each read
for every line standing inside its background; the work is not done until what those shots showed is
reported.

## Questions never asked

- Should this go in the engine? No.
- Can this number go in the code? No: the definition, `world` or a data file, or the prefab when it
  changes.
- Can this fixed number ride on the row, or sit in the prefab, because the row is easy to reach?
  No: the definition. A row is copied to every seat every step.
- Should this new behaviour be a field on a kind that exists? No: a new system is a new kind. What a
  seat owns, its score, health or ammo, is a field of its `player` row.
- Can a seat's own state live on a row its `player` row spawns, to hide it or to tidy it? No: a field
  of the `player` row, listed in `security` when only that seat may read it.
- Can one kind's rule or look import another's? No: a plugin of the game's own, which both import.
- Can a rule read another kind's definition for a touch test? No: the game's own plugin, handed that
  row, reads its definition.
- Can several kinds share one look file? No: the game's own plugin's browser half draws every row of
  them.
- Can a kind remember this on `world`, or in a variable of its file? No: a field on its row.
- Can where each seat starts go on `world`, as `pads` or `spawns`? No: a `start` actor per slot.
- Should this top-level plugin get a setting so this game can…? No: this game's kind.
- Should I work around what is missing? No: build it in its home.
- Do you want the full version? Always.

Ask the person making the game what the thing should do. That is content, and it is theirs.
