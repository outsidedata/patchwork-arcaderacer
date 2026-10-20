---
name: building-a-plugin
description: Use in core, or any clone of it, when building or changing a plugin or an addon, a top-level one in `plugins/<p>/` or `addons/<a>/`, or a game's own in `games/<game>/plugins/<p>/` or `games/<game>/addons/<a>/`. That covers deciding plugin or addon, the server half (`<p>.sim.ts`) and the browser half (`<p>.plugin.ts`) and how each is loaded (`plugins`, `shipped`, `world.shipped.plugins`), a plugin's fixed numbers on `world.<p>`, whether it has a row and what its prefab holds, browser state, wrapping a library such as a physics world or a renderer, and moving code several kinds share into a game's own plugin and on to a top-level one. It covers mods, one plugin using what another knows (`<a>.<p>.ts`, `world.<p>.mods`, `mod`, `provided`, `ahead`), where the file goes and its test. Also use it when a plugin throws that a mod is not exported, not loaded or not listed, a game's plugin is not found or not on `plugins`, or a plugin is listed in the wrong order.
---

# Building a plugin or an addon

A plugin or an addon is content built on the base. Nothing in `engine/` changes for one. This skill
takes one from the question of where it goes to its tests and the game played. The facts are the
headers of `engine/engine.ts`, `engine/browser.ts`, `addons/scenemanager/scenemanager.addon.ts` (its
Mods header and the list of what a game folder holds), `plugins/shipped/shipped.plugin.ts`, and the
plugins and addons named below with the tests beside them. Where this skill and the prime directive
disagree, the directive wins.

## When it applies

It applies to a system a game runs that is not one kind's rule: code several kinds of one game
share, a system of one game's (its level, its HUD), anything that could be described without naming
a game, a wrapper round a library, and anything that holds a truth. Other work has its own skill:

- one kind's rule, look and numbers, and how kinds call a game's own plugin: `designing-a-kind`.
- using a look plugin in a scene, and naming its mods there: `writing-the-look`. Sound: `sound`.
- the `player` plugin, seats, presses and ledgers as a game uses them: `input-and-seats`.
- transports, `interest`, `vision` and `security` as a game uses them: `going-multiplayer`.
- a file type the loader lacks, and art: `bringing-in-art`.
- the extension a plugin ships, `<p>.extension.tsx`: `building-an-extension`.
- proving a game in general, playtesters and the simulator: `proving-a-game`.

## Which home

Ask the prime directive's questions in order; the first yes is the home.

- It is a value only the page uses and the server never reads (a volume, a brightness, audio on or
  off, a theme): a key of the store (`plugins/store/store.plugin.ts`), never a plugin's number. A
  plugin that reads one names its store key in `world.<p>`, as `world.audio.volume` names the keys
  `{ level, muted }` that `plugins/audio/audio.plugin.ts` reads the volume from.
- It is used by one game only, however general it could be described, shared by several of its
  kinds or a system of that game's: a plugin or an addon of the game's own, `games/<game>/plugins/<name>/` or `games/<game>/addons/<name>/`, by the
  rules below, except that it may name that game's kinds and has no prefab of numbers: it reads
  every number off the definition of the kind whose row it is handed, as that kind's rule would, or
  off a file that definition names. Kinds share code through it, never by one actor importing
  another.
- It is used by a second game or by core itself, and it lives in the world (rows, the step) or in
  the player's browser (drawing, input, camera, sound, UI): a plugin, `plugins/<p>/`, with a server
  half, a browser half, or both, moved up from the game that had it (Moving shared code into a
  plugin, below).
- It is used by a second game or by core itself, and it holds a truth (seats, connections, sockets,
  files, timers, more than one truth, what a packet carries): an addon, `addons/<a>/`. It runs where
  the truth is; a transport's page side and the scenemanager's `view` run in the page.

A new folder in `plugins/` or `addons/`, or a new exported piece of an existing one (a call, a
setting, a mod), is asked of the person you are working for in planning, before any code, with which games and core code use
it and why it cannot stay in the game (prime directive, A new top-level plugin or addon is asked
for). No answer is a no.

Addon or plugin is never a question to ask: it is question 4 or question 5. Nothing goes in the
engine. A setting only one game would set is that game's actor, never a plugin's setting.

## The files

A top-level plugin is a folder of files named after it, each test beside the file it tests:

- `plugins/<p>/<p>.sim.ts`: the server half. It exports the kind of its row under the plugin's name
  when it has a row (`export const particle2d: Kind`), and the functions a rule calls with its `w`
  and the row it is working on (`walk(me, w, dt, ground)` in `plugins/walker/walker.sim.ts`,
  `emit(w, effect, at)` in `plugins/particle2d/particle2d.sim.ts`). The engine never loads it by
  name: a scene's `<scene>.sim.ts` imports it and names its kind in `sim`.
- `plugins/<p>/<p>.plugin.ts`: the browser half, exporting `export function <p>()`, which takes no
  arguments: the client calls it once per client and puts what it hands back on `plugins.<p>`
  (`engine/browser.ts`), as `shipped` does for a game's own (`plugins/shipped/shipped.plugin.ts`). It
  hands back an object with any of `tick(plugins)`, `afterTick(plugins)`, `close(plugins)`, and
  whatever it offers actors and other plugins; `plugins` reaches it there, never as an argument of
  `<p>`. The client imports `../plugins/<name>/<name>.plugin.ts` for every name in the scene's
  `plugins`, so a plugin is listed there only when it has a browser half.
- `plugins/<p>/<a>.<p>.ts` beside a plugin `a`: a mod of `a`'s for `p` (Mods, below).
- `plugins/<p>/<p>.extension.tsx`, `<p>.components.tsx`, `<p>.route.ts`: the editor extension it
  ships (below).
- `<p>.sim.test.ts`, `<p>.plugin.test.ts`, `<a>.<p>.test.ts` and the rest, beside each file.

A game's own plugin is laid out the same in `games/<game>/plugins/<p>/`. Its server half is imported
by the game's files, `import { … } from './plugins/<p>/<p>.sim.ts'`. Its browser half is not loaded by
the client, which looks in the top-level `plugins/` alone; the `shipped` plugin loads it
(`plugins/shipped/shipped.plugin.ts`). A scene that uses it lists `shipped` in its `plugins` and names
the plugin in `world.shipped.plugins`:

```json
"world": {
  "shipped": { "plugins": ["<p>"] },
  "<p>": { "mods": { "<function>": "<a>" } }
},
"plugins": ["loader", "scenemanager", "player", "shipped", "render2d"]
```

`shipped` imports `plugins/<n>/<n>.plugin.ts` from the page's folder for every name the list gives,
on its first tick, in the list's order, and runs each one's `tick` and `afterTick` at its own place
in `plugins`; `close` closes them in the reverse order. A listed name the scene's `plugins` also gives
throws. In a scene that lists `shipped`, every name the list gives needs a browser half, since
`shipped` imports each one and a missing file rejects its tick. The same list is the only way the
scenemanager knows a plugin is the game's when it looks for a mod (`modUrl`, Mods, below), and
`world.<p>.mods` is the one entry a game's own plugin has in `world`. So in a scene that lists
`shipped`, a game's own plugin with a server half alone can neither take nor give a mod: listed, it
breaks `shipped`; unlisted, its mods are looked for in the top-level `plugins/`. A scene that does
not list `shipped` may list it, as the forge scene of `addons/scenemanager/scenemanager.addon.test.ts`
lists two plugins with no browser half. Letting `shipped` pass over a listed plugin that has no
browser half is `plugins/shipped`'s to build, never a game's to work around.

An addon is `addons/<a>/<a>.addon.ts` with `<a>.addon.test.ts` beside it, and it may ship an
extension and a route as a plugin does (`addons/simulator/`). A game's own addon is
`games/<game>/addons/<a>/`, laid out the same.

## The work, in order, for a plugin

1. Find its home (above). Read the headers of the plugins it stands on: what each hands out, what it
   needs listed before or after it, what it throws on.
2. Write the header first, at the top of each file, in the voice of core's: what it is, every field of
   its `world.<p>` (or, for a game's own, of the definition entry it reads) with its unit, its row's
   fields when it has one, every function and what it hands back, each mod it asks for and what it
   does with none named, and the order it must be listed in. The header is the documentation; no
   other file says what the plugin is.
3. Write the server half when the plugin has rules: `<p>.sim.ts`. It reads what changes off rows and
   what never changes off `w.world.<p>` (a game's own plugin: off the definitions, `def(w, me.kind)`
   from `plugins/loader/loader.sim.ts`). A function a rule calls works on the row it is handed and
   writes that row; another kind's row is reached through `w.call` on one of its acts. What it works
   out on the way that a rule may need is in what it hands back: a value it works out and drops, as
   `strike` in `plugins/volley2d/volley2d.sim.ts` works out each bullet's heading and hands back its
   hits without it, is added to what it returns, in the plugin, with its test, the moment a rule needs
   it. A rule never runs the plugin's arithmetic again off the plugin's row to get it back; code that
   does is old code, never a pattern. A ledger row is the exception to writing only the row handed:
   `emit` in `plugins/particle2d/particle2d.sim.ts` appends to the ledger row directly (below).
   Arrays it changes it writes as new arrays, `me.data.pos = [x, y]`, as
   `plugins/walker/walker.sim.ts` says, never element by element. It computes with `plugins/math`,
   `math.sin(a)` for `Math.sin(a)` and `math.pow(a, b)` for `a ** b`, and so does a mod a server half
   asks: a page that runs the scene ahead steps the same code, and engines differ in the last bit of
   `Math`'s functions (`designing-a-kind`, Maths in a rule; `plugins/math/math.sim.test.ts` fails on
   a top-level plugin that does not).
4. Write the browser half when the plugin draws, listens or plays: `<p>.plugin.ts`, its state inside
   the exported function. It reads the last packet's rows off `plugins.wire.rows`, its fixed numbers
   off `plugins.wire.scene.world.<p>` (a game's own: the definitions, `def(plugins.wire, row.kind)`),
   and the plugins it draws through off `plugins` (`plugins.render2d`, `plugins.loader`). The seat's
   own row is `possessed(plugins.wire.rows)`, imported from `#plugins/player/player.plugin.ts`, the
   `player` row that carries `mine`; never `rows.find(r => r.kind === 'player')`, which is whichever
   seat's row came first, since every seat is sent every `player` row. On a page running the scene
   ahead (`addons/predict`) every row is the copy's, on the frame after the key. It may import its own server half's pure functions, as
   `plugins/volley2d/volley2d.plugin.ts` imports `./volley2d.sim.ts`.
5. The scene's side, in the game's scene file: the fixed numbers in `world.<p>` (for a scene
   manager's children, written once in the manager's `world` when every child shares them), the
   plugin in `plugins` in the order its header asks (a game's own with a browser half: `shipped` there
   and its name in `world.shipped.plugins`, with what that means for mods, above), and when it has a
   row: its kind in the scene's `sim`, a prefab of that
   row's changing fields in `prefabs.<p>`, and an `actors` entry for it. Each mod it wants in
   `world.<p>.mods`.
6. Write the tests beside each file (How it is proven), run each with `yarn vitest run <file>`, run
   the tests of every game file the change touched, and `yarn tsc`.
7. Play it (How it is proven).

## Numbers, rows and prefabs

A plugin's fixed numbers are `world.<p>`, always: the server half reads them as `w.world.<p>` and the
browser half as `plugins.wire.scene.world.<p>`, whichever half reads them, and whether the plugin has a
row or not. No packet carries `world`: the server boots from the scene file and the page reads the
same file. A catalogue, a cue table, the kinds it acts on, a size, a rate: fixed, so on `world`, never
on a row or a prefab, however convenient the row is to reach. The kinds a top-level plugin acts on are
named there too, as `world.walker.kinds` and `world.box3d.kinds` name theirs. The thing a seat plays
as is its `player` row (`designing-a-seat`), so a scene whose seat drives, walks or flies through
such a plugin gives it an entry for `player`, never for a kind the `player` row spawns.

A child scene's `world` is the manager's with the child's own over it key by key
(`child` in `addons/scenemanager/scenemanager.addon.ts`). A child that gives `world.<p>` has its own
whole `world.<p>`; the manager's is not merged into it field by field.

A plugin has a row only when its server half has state that changes, and that row carries that state
and nothing else: never its catalogue, table or settings. An `actors` entry copies the whole prefab
onto the row, and a row is sent to every seat every step, so a prefab is the starting value of the
row's changing fields and nothing else. A plugin with no row, or one only its browser half reads,
has no prefab. Fixed data is never put in `prefabs`, even where no row is ever made from it.
`particle2d`'s and `volley2d`'s rows check this themselves: their `before` throws on a field of the
row they do not know, naming it.

A top-level plugin's row is of the kind named as the plugin, its rule exported under that name from
`plugins/<p>/<p>.sim.ts`. A game draws a plugin's row with a `<p>.client.ts` in its folder, since a
file named after a plugin is loaded as the actor of that plugin's row.

A row that only appends events for the page to play or draw once is a ledger: `audio`'s,
`particle2d`'s, `particle3d`'s, `volley2d`'s, `volley3d`'s. A page draws only the last packet of a
frame, so a value a rule sets for one step and clears is missed whenever two packets land in one
frame; an entry stays on a ledger longer than a step (audio's, particle2d's, particle3d's and
volley3d's for their `world.<p>.hold` seconds), and the page plays or draws each entry once, by its
id. A new plugin whose row only appends events is a ledger, and its header says
so.

A page running the scene ahead (`addons/predict`) draws a ledger row from its copy like every other
row, so an entry a press raises is seen on the frame after the key. Audio's `sound` puts an entry
raised `from` a `player` row on that row's own `voiced` list and every other entry on the ledger, its
`before` takes the old entries off both, and its browser half plays both lists once each
(`plugins/audio/audio.sim.ts`, `audio.plugin.ts`).

A game's own plugin has no numbers of its own. Its one entry in `world` is `world.<p>.mods`, and it
has no prefab of numbers. It reads each number off the definition of the kind whose row it is handed
(`def(w, me.kind)`), in an entry its header names, and what it remembers of a row from one step to
the next is a field on that row, its starting value in that kind's prefab beside the kind's other
fields. When its server half has changing state of its own that is no kind's row, it has a row of its
own, as any plugin may; the engine boots and spawns no row without a prefab (`engine/engine.ts`), so
that row's prefab holds its changing fields and nothing else. A browser that arrives later is sent
rows and nothing else, so memory kept anywhere else is lost to it and to the recorder's replay.

A game's own plugin handed no row has no definition to read. A thing of the game's that no plugin
of core draws and that holds numbers of its own, a road or a track no ground plugin draws, is
therefore a kind with one `actors` entry: its definition holds its numbers, or names the data file
of its points in `assets/`, and its look draws it, its own `<kind>.client.ts`, or this plugin's
browser half when the drawing is shared with other kinds, drawing that kind's row by its
definition as it draws theirs. A rule that asks it, how far along the road a `player` row or a
rival is or which way is out of it, calls a function of this plugin handed that row, `w.find('<kind>')`, which reads
`def(w, row.kind)` and the file it names. The plugin never takes a `world.<p>` of numbers to get
round having no row: its numbers are the definitions of the kinds whose rows it is handed, and the
road's are its own kind's (`building-a-level`, Where a level's pieces go).

## The browser half

Browser state is inside the exported function, never at the top of the file. A page makes a new
client per scene and calls the function once for each, while the module is imported once per page,
so a value at the top of the file is made once and read by every scene after. Everything the browser
half makes (sprites, pools, listeners, a canvas) is let go in `close`.

Its `tick` runs before the actors tick and its `afterTick` after, in the order of the scene's
`plugins`; `render2d` and `render3d` draw in their `afterTick`. A plugin that places things for
another to draw is listed before it, and checks that it is: `plugins/volley3d/volley3d.plugin.ts`
emits through particle3d in its `afterTick`, is listed before particle3d, and throws when it is listed
after, which would draw every round a frame late. One that reads what another made earlier in the
same frame is listed after it, and checks that with `ahead` (below).

A game's own plugin is not on `plugins` until `shipped` has ticked, and on a client's first frame
the actors are set up before any plugin ticks (`engine/browser.ts`). An actor uses a game's own plugin
from its `tick`, never its `setup`.

## Wrapping a library

A library's own memory between steps, such as a physics world's, is held by its plugin one per truth,
built from the rows when it has none, and sent to no seat and read by no rule. `plugins/box3d/box3d.sim.ts`
is the pattern, and `plugins/box2d/box2d.sim.ts` the same in 2D:

- The library is loaded once per process when the file is imported (`export const b3 = await
  Box3D()`).
- Its world is kept in a `WeakMap` keyed by the plugin's row, so each truth has its own, and freed by
  a `FinalizationRegistry` when the row is collected.
- The row's tick makes the world the first time it finds none (`made.get(me) ?? make(me, w)`). A truth
  booted again, which is how the recorder goes back, has new rows and builds a new world from them.
- Each step it pushes every row's changes into the library, steps it, and writes back onto the rows
  everything a seat or a rule needs. The rows are all the state a seat is sent and a rule reads and
  writes, so two runs of the same presses land on the same bytes.
- A rule asks the library through the plugin's queries, handed its `w` and answered in row ids
  (`castRayClosest(w, …)`), never by holding the library's objects.
- Every number of the library's own that the scene does not give is the library's default, read from
  the library, never written in the plugin.
- The library reaches the plugin as a package dependency, imported, as `box3d.js` and `box2d.js` are.
  Any file it reads, and a library shipped as a file of the game's own (a compiled module), is an
  entry of the scene's loader catalogue, `world.loader.assets`, and reaches the plugin through the
  loader and nothing else: box3d's mesh `{ asset }` is a `json` entry read with `json(w, name)`, and a
  module is a `binary` entry, awaited and compiled in the kind's `prepare` with `prepared(world, name)`
  (`Prepare` in `addons/scenemanager/scenemanager.addon.ts`, and `binary` and `prepared` in
  `plugins/loader/loader.sim.ts`), which the scenemanager awaits before the first step. Nothing else
  fetches or decodes a file or writes its path in code.

A renderer is wrapped in the browser half: one per client, made by the exported function, mounted by
the page, let go of in `close` (`plugins/render2d/render2d.plugin.ts`).

## Mods

A mod is how one plugin gives another what it knows without either naming the other in its code. The
whole of it is the Mods header of `addons/scenemanager/scenemanager.addon.ts`.

What it is. Plugin `a` provides for plugin `p` with a file `<a>.<p>.ts` that exports functions under
the names `p` asks for, written with everything `a` knows. `p` declares the type `F` of each function
it asks for and asks `mod<F>(world, '<p>', '<function>')`, which hands back the function, or undefined
when the scene names none. A scene switches one on with `world.<p>.mods: { <function>: '<a>' }`.
A `p` that takes one function from several plugins at once, as box3d takes `props` (the fixed
things standing on the land) from every placer a scene names, asks `modsOf<F>(world, '<p>',
'<function>')`, which hands back each one's function in the list's order, and the scene names them
`{ <function>: ['<a>', '<b>'] }`; a single name is a list of one. `mod` throws on an entry naming
more than one, since it hands back one. Before the first step, on the server and on the page alike, the scenemanager imports every mod a
scene's `world` names and throws `<url> does not export <function>` for a file that does not export the
function it is named for. So `p` never imports `a`, `a` never changes `p`, and swapping one provider
for another is changing that one value.

Mod or handed. Anything `p` needs that a scene could give it from another plugin, or from none,
comes through a mod: a ground (`land`, every `terrain3d.<p>.ts`), a sky's light and wind
(`plugins/skydome3d/skydome3d.ocean3d.ts`), a model and its pose (`plugins/anim/anim.ragdoll3d.ts`),
the gravity of a physics world (`plugins/box3d/box3d.box3dvehicle.ts`), a sound
(`plugins/audio/audio.cutscene.ts`). Never a field of `p`'s that names the plugin, `ground:
'terrain3d'` then `plugins[ground]` or `w.find(world.p.sound)`; never `plugins.<a>` for it; and never
`p` reading `world.<a>`, `a`'s table: `a` hands out the number, as a method on `plugins.<a>`
(render2d's `ground()`, the loader's `catalogued(name)`) or a mod. A
plugin `p` is built on and always draws or loads through (render3d, render2d, loader, ui, store,
player, particle3d, solids, box3d for box3dvehicle) is handed to it as `plugins.<a>`, and a pure
function of `a`'s that holds nothing of `a`'s state (player's `keyOf`, loader's `json` and `def`) is
imported.

Where the file is. In the one folder that may know both names, tested beside it, `<a>.<p>.test.ts`:

- both top-level: beside `a`, `plugins/<a>/<a>.<p>.ts`, naming no game;
- `a` a game's own plugin, whatever `p` is: beside `a` in the game, `games/<game>/plugins/<a>/<a>.<p>.ts`;
- only `p` the game's: beside `p` in the game, `games/<game>/plugins/<p>/<a>.<p>.ts`
  (`terrain3d.<p>.ts` for a game's own `p` that stands on the land), since a top-level plugin names
  no game's.

A game's own plugins are the names `world.shipped.plugins` lists, and the game's folder is
`world.scenemanager.home`, which the scenemanager writes into every child's `world`; the scene never
says where a mod is. Every placement is shown in the forge test of
`addons/scenemanager/scenemanager.addon.test.ts`.

Server and page. A server mod takes `w` and reads the truth (`ground(w, key)` in
`plugins/terrain3d/terrain3d.box3d.ts`, `wind(w)` in `plugins/skydome3d/skydome3d.ocean3d.ts`). A browser
half calls a server mod through a `w`-shaped reader of the wire's rows, as `reading` in
`plugins/ocean3d/ocean3d.plugin.ts` does. A browser mod takes `plugins` first and hands back what
`a`'s browser half holds (`land(plugins)` in `plugins/terrain3d/terrain3d.ocean3d.ts` is terrain3d's
live `ground`, unsaved strokes and all; `light(plugins)` in `plugins/skydome3d/skydome3d.ocean3d.ts`;
`whisper(plugins, …)` in `plugins/chat/chat.party.ts`); a
browser half asks it with `mod(plugins.wire.scene.world!, …)`. The server loads every mod a scene
names, the browser ones too, so a mod imports types alone of anything that draws.

What `p` does. Its header says, for each mod, what it does with none named: the same as when the
provider has nothing yet (no `land`: the sea is open ocean, scatter3d draws nothing, no rain splashes;
no `wind`: the sea's own amplitude), or it throws naming the key when it cannot work without one (a
ragdoll with no `model`, a car with no `gravity`); ocean3d with no `light` mod draws in
`world.ocean3d.light`, and throws with neither. A browser half that hands a mod `plugins` calls
`provided(scene, p, name)`, which throws when the scene names a plugin it does not list. One that
reads what `a` made earlier the same frame, in the same phase (its `afterTick` what `a` placed in its
own, or its `tick` what `a` made in its own), calls `ahead(scene, p, name)` instead, which also
throws unless `a` ticks first. `listed(scene)` is the tick order, a game's own plugins in `shipped`'s
place. A mod never checks that its plugin is listed: `p` does, since `p` knows when it reads.

The scene's side. It names each mod in `world.<p>.mods`, lists the plugin each names, and lists it
before `p` where `p` asks `ahead`. That is all: a scene that wanted terrain under its sea says
`ocean3d.mods: { land: 'terrain3d' }` where it once said `ocean3d.ground: 'terrain3d'`.

## Addons

An addon takes a truth and runs where the truth is: the node process of `<game>.server.ts`, or the
tab of `index.html`, which holds the truths too. It knows no game and no kind; a game's own addon may
know that game's. It reaches a truth through what the engine hands out (`engine/engine.ts`):

- `truth.attach(piece)`: a `Piece` of `show(seat, row)`, `hide(seat, row)`, `accept(seat, msg)`,
  `advance()` and `spawn(row, by)`; every piece must say yes to `show`, `accept` and `advance`, and
  `hide` names fields a seat is sent without. `addons/interest/interest.addon.ts` is one whole piece
  in a page of code.
- `truth.onStep(f)`, after each step, as `addons/persist/persist.addon.ts` writes its records.
- `truth.rows`, `truth.world`, `truth.scene`, `truth.spawn`, `truth.end`, `truth.packet(seat)`.

Its state is per truth, in a `WeakMap` keyed by the truth (`seated` in `addons/player/player.addon.ts`):
every scene of a manager is a truth of its own in one process. It reads its numbers off the scene the
truth was booted from: `world.<a>`, as `addons/vision/vision.addon.ts` reads `world.vision`, the block
the vision plugin's browser half reads too, or a top-level block of the scene file, as `interest` and
the player addon's `security` do. Those come from outside the program, so a block of the wrong shape
throws naming the value, as both do. It is attached by whatever holds the truth: the page or the
server file, as the scenemanager and the transports are and as `persist` is with the store each
opens (its header), or another addon, as `addons/player` attaches `vision` when the scene's `world`
has a `vision` block. Nothing loads a game's own addon by its name the way `shipped` loads a game's
own plugins, and the editor lists no extension in a game's `addons/` folder (`GAME_LISTED` in
`editor/editor.ts` lists a game's own extensions and its plugins' alone).

Nothing but a transport carries a packet. An addon that needs a page and a truth joined, as the
recorder and every test that makes a page on a game do, takes a transport (`loopback` or `socket`)
and never joins them itself: a copy works, passes its own tests and leaves the real transport
untested beside it.

## Moving shared code into a plugin

Two kinds of one game need the same code: it goes into a plugin of the game's own,
`games/<game>/plugins/<p>/<p>.sim.ts`, functions each kind's rule calls with its own row; the numbers
go on each kind's definition under one key, and what it remembers goes on each kind's rows. A rule
the kinds share is a `Kind` exported from it under the name of what it is, never `<p>`, which is the
name of the plugin's own row, and each kind's rule file hands it out in one line. A look it draws
goes in `<p>.plugin.ts`, loaded through `shipped`, which draws every row of those kinds from
`plugins.wire.rows` with a map from row id to drawing inside its exported function; those kinds have
no `<kind>.client.ts` (`designing-a-kind`, Shared code and systems). On the UI that map is
`ui.show` keyed by the row's id, `` ui.show(panel, `${row.id}.heading`, make) ``, which makes a row's
drawing the first frame it is shown and destroys it after the first frame nobody shows it; two rows
of one kind never share a key, or the second `show` throws `ui showed <panel> <key> twice in one
frame`. Each kind imports the server half from `./plugins/<p>/<p>.sim.ts`.

When another game wants it, and the person you are working for says yes in planning, it moves to `plugins/<p>/`, and in the
same change:

- its numbers move off the kinds' definitions into `world.<p>`, the kinds it acts on named there too,
  keyed by kind, as `world.walker.kinds` is; it names none of the game's kinds;
- its imports in each game become `#plugins/<p>/<p>.sim.ts`; the scene drops it from
  `world.shipped.plugins` and lists it in `plugins` when it has a browser half;
- the mods it takes: a top-level `a`'s for it moves from `games/<game>/plugins/<p>/<a>.<p>.ts` to
  `plugins/<a>/<a>.<p>.ts`; one of a game's own plugin `b` stays beside `b`,
  `games/<game>/plugins/<b>/<b>.<p>.ts`;
- the mods it gives, which sat beside it in the game: one for a top-level `x` moves to
  `plugins/<p>/<p>.<x>.ts`, and one for a game's own `x` moves beside `x`,
  `games/<game>/plugins/<x>/<p>.<x>.ts`;
- its tests move with it and boot scenes they write themselves; each game keeps the tests of its own
  content;
- every game that used the old one is moved to it, every file and every test.

## The extension it ships

What presents or edits what a plugin owns (its `world.<p>`, its data files, what it draws) is the
extension the plugin ships, `plugins/<p>/<p>.extension.tsx`, a function named `<p>` handed the
editor, its React components in `<p>.components.tsx` and any backend in `<p>.route.ts`. It is on while
a scene of the open game names the plugin in its `plugins`, as a key of its `world` or as a top-level
block (`editor/editor.ts`); an addon's, `addons/<a>/<a>.extension.tsx`, the same. A game's own plugin's
is `games/<game>/plugins/<p>/<p>.extension.tsx`, on while that game is open. Nothing a game runs
imports an extension. The editor never gets a panel for a plugin; the plugin ships it. Building one
is `building-an-extension`.

## What imports what

- A plugin, both halves: from `engine/` and `addons/`, never from `games/`. A plugin it is built on is
  handed to it, `plugins.<a>`, never imported; what another plugin knows reaches it through a mod; a
  pure function of another plugin's is imported (`json`, `def`). Types from anywhere, as `import type`.
- Its browser half: its own server half's pure functions, `./<p>.sim.ts`.
- Its server half: `mod` from `#addons/scenemanager/scenemanager.addon.ts` for each mod it asks for,
  and `math` from `#plugins/math/math.sim.ts` for any function `Math` leaves to the engine.
- A mod `<a>.<p>.ts`: `a`'s own server half for what `a` knows, and `p`'s types alone.
- A game's own plugin: the same, and it may name that game's kinds. The game's kinds import its
  server half; no kind imports another.
- No look or rule imports a `.plugin.ts` for what it makes. The client, or `shipped`, calls `<p>()`
  once per client, and a look reaches what it made as `plugins.<p>`, from its `tick`; a look that
  called `<p>` itself, or a function of it that draws, would make one per row, outside the client's
  ticks and its `close`. A look imports from a `.plugin.ts` only its types, `import type`, and a pure
  function that holds nothing of the plugin's, as the ui imports player's `keyOf`. A rule runs on node
  and imports no `.plugin.ts` at all but for types.
- An addon: from `engine/` and other addons, never from `games/` and never from a plugin.
- Nothing a game runs imports `editor/`, an extension or a route.

## What goes wrong

- A fixed number put on a row or in a prefab because the row is easy to reach. It is sent to every
  seat every step. It is `world.<p>`, or a definition for a game's own plugin.
- A game's own plugin given a `world.<p>` of numbers. Its one entry is `world.<p>.mods`; its numbers
  are the definitions of the kinds it is handed.
- A game's own plugin listed in `plugins`. The client looks for it in the top-level folder and fails;
  it is `shipped` in `plugins` and the name in `world.shipped.plugins`.
- A name in `world.shipped.plugins` with no `<n>.plugin.ts`, in a scene that lists `shipped`. It
  imports every name the list gives, and the frame throws.
- A mod written beside the wrong plugin. The scenemanager looks for it in one place only, from
  `world.shipped.plugins` and `world.scenemanager.home`, and throws naming the file it looked for.
- A plugin booted in a test with a bare `boot` and a mod named: `mod` throws `the <a> mod of <p> is not
  loaded: prepare loads it`, or that the scene has no `world.scenemanager.home`. A test of `p` that names
  a mod boots its scene through the scenemanager's `load` or `view`.
- A game's own plugin's questions tested on a `W` the test built by hand. It is a world no truth
  ever was; the questions are proven through the rule that asks them, on the booted game.
- A game's own plugin's test that hands `load` its own `import.meta.url`. The base is the game's
  folder, `new URL('../../', import.meta.url).href` from `games/<game>/plugins/<p>/`, or the child
  scenes are not found and `world.scenemanager.home` names the plugin's folder, where no mod is.
- Memory kept in a module-level map keyed by row id, or in the browser half, of something a rule
  needs next step: a later browser and the recorder never see it. It is a field of the row; its
  starting value is in the prefab.
- An actor that asks a game's own plugin in its `setup`. On the first frame it is not on `plugins` yet.
- A look that imports a `.plugin.ts` and calls what it exports for its own row, or a browser half no
  scene's `world.shipped.plugins` names. The plugin is made once per client, by the client or
  `shipped`, and draws every row it is for.
- A browser half written to take arguments, `<p>(plugins)` or `<p>(row, plugins)`. It is called with
  none; `plugins` reaches its `tick`, `afterTick` and `close`.
- A function that works out a value and drops it, and a rule that works it out again off the row.
  The function hands it back.
- Browser state at the top of the file, read by the next scene's client.
- A change to a game's scene that moves what the game's other tests read: placing things where
  `<game>.sim.test.ts` drives the seat's `player` row fails it. Run the tests of every file the change touched.
- Something short-lived (a flash, a burst) judged from a screenshot taken too late. Read it off the
  rows, or add a readout in `dev.html`.

## How it is proven

Each file has its test beside it, named after it, and each is run with `yarn vitest run <file>`.

- A top-level plugin's server half, `<p>.sim.test.ts`: it boots a scene it writes itself, never a game
  in `games/`. When mods or `prepare` matter it writes a manager and a child to a temp folder (a scene
  file, and a sim file that imports plugins by their paths) and boots them through `load`, as
  `plugins/terrain3d/terrain3d.box3d.test.ts` does; it drives rows and reads what the plugin wrote off
  them.
- Its browser half, `<p>.plugin.test.ts`: a real page on such a scene through the loopback transport,
  `view(link(loopback(accept(manager(truth)))), top, base, () => {})`, stepped and framed, as
  `plugins/box2d/box2d.plugin.test.ts` does; or the plugin handed a `plugins` of a wire and the plugins it
  draws through, as `plugins/vision/vision.plugin.test.ts` does. No canvas is mounted in node, so what
  it drew is read off the objects it made. A page whose actors bind keys needs `globalThis.addEventListener`
  and `removeEventListener` given functions, as `plugins/player/player.plugin.test.ts` gives them. Two
  pages in one process share an actor's module for a row of one id, so a plugin's per-client state is
  tested with two of its own instances, not two pages of a game whose actors keep state at the top of
  their file.
- Each mod, `<a>.<p>.test.ts`: it loads a scene that names the mod through `load`, checks
  `mod(world, p, name)` is the function, then what it hands back, as
  `plugins/terrain3d/terrain3d.box3d.test.ts` and `plugins/chat/chat.party.test.ts` do. A test that writes a
  game folder of its own ships the game's plugins and mods there, `plugins/<n>/<n>.plugin.ts` and each
  `<a>.<p>.ts` at its place, re-exporting the real files or a provider of the test's own, as the forge
  of `addons/scenemanager/scenemanager.addon.test.ts` writes providers of its own.
- A game's own plugin, in its folder: its tests boot the game's manager with the game's folder as
  base, join a seat with `connection(manager(truth), …)`, drive it and read the rows; its browser half
  through a real page on the game; its mods through the game's scene. They are that game's tests. A
  plugin of pure questions, functions that write nothing and hand back an answer (whether two rows
  touch, say), is tested through the rule that asks them, booted so: its answer read off what that
  rule did to the rows, never off a `W` the test builds by hand.
- An addon, `<a>.addon.test.ts`: it boots a scene it writes, attaches the addon, steps, and reads what
  each seat is sent (`truth.packet(seat)`) or what it wrote.
- `yarn tsc` for the types of every file written.

Then it is played: the game's `index.html` in Chrome, served by `yarn editor <game>`, and `client.html`
against `node --experimental-strip-types games/<game>/<game>.server.ts`, where node loads every mod
the scene names. What a plugin draws or plays for a moment is checked in `dev.html`, beside
`index.html`, which may add readouts of its own and override a definition or `world` in its own copy
in memory, and which nothing else reads.

## When something is missing

Build it in its home: general, set from the scene file, tested, and used by every game it belongs
in. Then use it. Never instead work around it in the game (an actor importing another, a test faking
what a plugin should do, a number written into code), give a plugin a setting only one game would set,
edit the engine, or leave a note that it is missing. A plugin that cannot be built without the engine
handing out something new is brought to core as an issue, with the attempt. A line in a header or a
skill that tells a game to add a guard, keep a layout, or never hand a plugin or an addon a copy, so
that it does not break, means the plugin or addon is missing a piece: the piece is built in it, with
its test, and the line is never written.

## When old code disagrees

A plugin or an addon that breaks these rules (fixed numbers on its row, a field naming the plugin it
stands on, browser state at the top of its file) is never copied as a pattern. When it is in the way
of the job, migrating it is part of the job: every file that uses it and every test.

## Questions never asked

- Should this go in the engine? No.
- Addon or plugin? Question 4 or question 5.
- Can this number go in the code? No: the scene file.
- Should this plugin get a setting so one game can…? No: that game's actor.
- Can this fixed data ride on the row because the row is easy to reach? No: `world.<p>`, a definition
  or a data file.
- Can a plugin with no row, or only a browser half, keep its fixed numbers in a prefab? No:
  `world.<p>`.
- Should plugin `p` import plugin `a` to use what `a` knows? No: `a` writes a mod for `p`, named in
  `world.<p>.mods`.
- Can a plugin take a field naming the plugin it stands on and look it up in `plugins`? No: a mod.
- Can `p` read `world.<a>` for one of `a`'s numbers? No: `a` hands it out, a method on `plugins.<a>` or
  a mod.
- A game's plugin needs a top-level plugin's knowledge, and the top-level plugin can't name the game's.
  Where does the mod go? Beside the game's plugin, `games/<game>/plugins/<p>/<a>.<p>.ts`.
- Should a mod check that its plugin is listed, or listed first? No: `p` does, with `provided` or
  `ahead`.
- Should the editor get a panel for this plugin? No: the plugin ships it, `<p>.extension.tsx`.
- Should I work around this for now? No: build it in its home.
- Do you want the full version? Always.

What the plugin should do in a game, how a system plays, is the person's to say: ask them.
