---
name: porting-a-game
description: Use in core, or any clone of it, when bringing a game that exists elsewhere into core - porting, converting or remaking a plain canvas, JavaScript or HTML5 game, a game in another engine (Unity, Godot, Phaser, GameMaker), or a design on paper. It is the map from the old game's parts to core's homes and the order of work - its game loop and update function into kinds' `before`/`tick`/`after`, its globals into rows, definitions, `world` or the store, the thing its player controls (a paddle, a ship, a hero) and its score and lives into the seat's `player` row, its constants into the scene file and `assets/<game>.json`, per-frame numbers into per-second ones, its key handlers into `player.client.ts`, its draw function into `<kind>.client.ts` and the `ui` plugin, its images and sounds into the loader catalogue and the `audio` plugin (the seat's own sounds on its `player` row, the rest on the ledger), its screens into scenes or screens the game puts up, its reset into spawning the cast again, its `Math.random` into `w.die()` with a seed. Also how the port is proven to play the same - tests beside each kind, a replay, the old game run headless in step with it, both played in Chrome.
---

# Porting a game

A port is a new game made the way core makes games, with an old one as its specification. The old
game is read for what it does, every rule and number of it, and each part is built again in its home
in core. Its code is never copied as a pattern: its globals, its numbers inside its draw calls, its
listeners on the page, its `Math.random` and its one update function that does everything all break
the prime directive, and each is rebuilt where the directive puts it. This skill is the map from the
old game's parts to core's homes and the order of the work. Each piece in depth is another skill,
named where the work meets it.

The engine is frozen. A port changes no file in `engine/`, and no top-level plugin, addon, extension
or editor file to suit one game. What the old game does that nothing in core does is built in its
home, general and tested, and then used (step 10).

## When it applies

From an old game in hand, as code, a running page or a design on paper, to the port proven to play
the same. What applies instead:

- A game from nothing, or what each file `yarn new-game` writes is for: `starting-a-game`.
- One kind's rule, look and numbers past what the map here says: `designing-a-kind`.
- Keys, the mouse, a pad, rebinding, seats and presses: `input-and-seats`.
- A level's map, its walls and where things stand: `building-a-level`.
- Images, sheets, models and fonts: `bringing-in-art`, and `making-game-assets` to make new ones.
- How it looks, render2d or render3d, light and sky: `writing-the-look`.
- Titles, menus, levels in sequence: `scene-flow`.
- Score, lives, menus and screens over the game: `building-the-hud`.
- Sounds and music: `sound`.
- How fast things move and how a press feels: `tuning-feel`.
- A system the old game had that no plugin has: `building-a-plugin`.
- Tests, bots, replays and the simulator: `proving-a-game`.
- A high score or a save kept between runs: `persisting-players`.
- More than one player over a network: `going-multiplayer`.
- Checking the finished port against every rule: `auditing-a-game`.

Load `prime-directive` too. Where it and this skill disagree about where something goes, it wins.

## Read the old game first

Before any file is written, read the whole of the old game and write down:

- its constants, each with its unit: pixels, pixels a frame, seconds, frames;
- its state: every global, field or variable that changes while it plays, and what changes it;
- its update: the statements in the order they run, and whether they run once per drawn frame or
  over the time that passed;
- its drawing: what is drawn, from what, anchored at which point (a canvas rectangle is drawn from
  its top-left corner);
- its input: which keys, and what each does in which state;
- its screens and states: title, play, pause, game over, won, and what moves between them;
- every call to `Math.random`, and the formula each feeds;
- its timers: `setTimeout`, `setInterval`, frame counters;
- its files: images, sounds, fonts, levels;
- what it keeps between runs (`localStorage`), and what it sends over a network;
- the libraries it uses (a physics engine, a tween library).

Then ask the person making the game what the port must keep exactly and where it may differ. That is
content, and it is theirs. Every difference the work finds (below) goes back to them.

## The map

### The game loop

The old loop (`requestAnimationFrame(loop)`, `setInterval(update, 16)`, an engine's main loop) is not
ported. `index.html`, as `yarn new-game` writes it, steps the manager by the manager's
`prefabs.engine.dt` on `requestAnimationFrame`, and `<game>.server.ts` steps it as often as the clock
owes a step. The pages stay as they were written: no listener, no loop, no number goes in a page.

The old update most often ran once per drawn frame, so its speeds are per frame and it ran faster on
a faster display. A port's step is fixed: every rate in a definition is per second, and a rule
multiplies it by the `dt` its hook is handed, the manager's `scenemanager.dt`. A speed of 4 pixels a
frame, from a game tuned at 60 frames a second, is 240 pixels a second; with the step at 1/60, as
`yarn new-game` writes it, each step then moves the same 4 pixels the old frame did. Measure the
frame rate the old game was played at before converting (the old Breakout this skill was written
from drew 60 frames a second in Chrome). An old update that already used the time since the last frame has per-second numbers, which
carry over as they are. The step rate itself is `tuning-feel`'s: three `dt`s change together.

### The update function

The old update becomes the rules of kinds: each statement goes in the `before`, `tick` or `after` of
the kind whose state it changes. Each noun of the old state is a kind (`designing-a-kind`): the
paddle (the seat's `player` row, below), the ball, a brick, the game-over screen. The whole update
ported into one kind, a `game` row with every field on it, puts every system on one kind; each system
is a kind of its own.
A kind is never named after the game (`<game>.sim.ts` is the manager's), a scene (`<scene>.sim.ts` is
that scene's sim) or a plugin (the page loads a file named after a plugin as that plugin row's look).
The thing the person plays, the old game's `player` object, its paddle, ship or hero, is the seat's
`player` row (`designing-a-seat`): its rule is `player.sim.ts`, its look `player.client.ts`, its
fixed numbers the `player` definition, and everything of it that changes, its place and the score and
lives of the one who plays it, fields of the `player` prefab. It is never a kind of its own that the
`player` row spawns. Every other noun takes a
name of its own: `grid`, `stats`, `store` and `ui`, among the names in `plugins/`, are taken, so an
old `ui` or `grid` object is ported under another.

Keep the old order. A step runs every row's `before`, then every `tick`, then every `after`
(`engine/engine.ts`), each pass over the rows in the order they stand: the scene's `actors`, then its
`actorsFile`'s, then the rows spawned, oldest first. The seat's own thing is its `player` row, spawned
when the seat joins, so it stands after every row the scene placed. The old Breakout moved the paddle
and then moved the ball against where the paddle now was. Ported with the paddle (the `player` row)
in `tick` and the ball also in
`tick`, the ball met the paddle where the last step had left it: the old game and the port ran the
same for 306 frames, and at frame 307 the ball left the paddle at another angle. With the ball in
`after` they ran the same through every life, a game over, a play again and a second game. What the
old update did later in a frame, against what it had already moved, goes in a later pass.

A collision the old code tested in one place stays in the rule of the one kind that held it, the ball
here, which finds the other rows with `w.all`. The test of touching itself is a game's own plugin,
`games/<game>/plugins/<name>/<name>.sim.ts` (`designing-a-kind`, Shared code and systems): a rule
reads fixed numbers off its own kind's definition, and a game's own plugin reads them off the
definition of the kind of each row it is handed. The port's is `games/<game>/plugins/touch/touch.sim.ts`:
the ball calls its `lands`, `overlaps`, `atop` and `across` with itself, its point this step and the
paddle or brick row, and it reads the ball's `radius` and the other row's `size` off their own
definitions. It has a server half alone, imported by the ball as `./plugins/touch/touch.sim.ts`, so
the scene lists no `shipped` for it (`building-a-plugin`). What the ball changes on another row it
changes through that row's act, `w.call(row, 'hit', -1)`, so each field has its rule in one file; a
hook has no seat, and passes `-1`. Every act a seat's message reaches checks its arguments, which came
from outside the program.

### The state

Each piece of the old state goes in one of these:

- What changes while it plays is a field of a row. The old `x`, `y`, `dx`, `dy` are the ball's
  `pos` and `vel`. `paddleX` is the `player` row's `pos`. `bricks[i].alive` is no field at all: each
  brick is a row, and a brick knocked out is `w.end`. `score` and `lives` are the seat's own, so they
  are fields of its `player` row beside its `pos`, which a page running the scene ahead draws on the
  frame after the press; a value only its own seat may read is listed in the scene's `security`
  block (`designing-a-seat`). What the seats share and no seat owns, a wave count or a round's clock,
  is a kind of its own with one `actors` entry. The old `state` string is the game-over screen's own
  row, an `ending` with `ended` (Screens, below).
  Its starting value is the prefab's, `prefabs.<kind>` in the scene file, which holds what changes
  and nothing else.
- What only this page feels and no other seat needs, the old game's screen shake, a flash on a hit, a
  camera that eases after the paddle, is local: the look keeps it in its module and works it out from
  the `player` row's fields as they change. It is never a row and never sent.
- What never changes is a kind's definition, in `assets/<game>.json`, read with `def(w, me.kind)`
  in a rule and `def(plugins.wire, row.kind)` in a look (`plugins/loader/loader.sim.ts`), or a field
  of the scene's `world`: the scene's own (its `seed`) or a plugin's (`world.ui`).
- What only the page uses is the store's (`plugins/store/store.plugin.ts`): a volume, a mute. The
  old game's key flags (`left = true` on keydown) are nobody's to port: the player plugin holds which
  keys are down and sends the way they point, and the row holds the way it was sent (`move`).
- Anything a kind remembers from one step to the next is on its row. The old game's module-level
  variables are never module-level variables of a rule file: every truth in the process runs the one
  module, and a page that arrives later is sent rows and nothing else.

### The constants

Each old constant goes in one place, by the prime directive's first question:

- a speed, a size, a colour, a worth, a reach: the definition of the kind it belongs to, in its
  unit per second; an angle in radians as the rule uses it;
- a starting value of something that changes (`LIVES = 3`): that kind's prefab;
- the canvas's width and height: the scene's `prefabs.engine.width` and `height`, which size the
  page's canvases (`yarn new-game` writes 960 by 540);
- where the player's thing starts: a `start` actor per slot, `{ "is": "start", "slot": 0, "pos":
  [x, y] }`, which the `player` row finds in its `before`; never `world.spawns` or a list in a
  definition;
- the edges of the field, which a rule needs and cannot read off a prefab: the definition of the
  kind that keeps inside them (`bounds`);
- a loop that lays out the level when the game starts (the rows and columns of bricks from
  `BRICK_ROWS`, `BRICK_GAP`, `BRICK_LEFT`): run once, outside the game, and written as `actors`
  entries, in the scene file or in the list its `actorsFile` names, `assets/<scene>.actors.json`
  (`building-a-level`). Nothing makes a level while the game runs. The offsets and gaps are then
  only in the places they made, and the editor places and drags each entry;
- a table the old game indexes per thing (a colour and a worth per row of bricks): kinds. A thing
  whose fixed numbers differ from another's is another kind, two kinds with one rule handed out from
  a game's own plugin (`designing-a-kind`). Then every rule that named the one kind names each of
  them, through a list of the kinds on a definition and never in code: the kinds the ball breaks,
  the kinds a win counts down, the kinds that start over. The old Breakout's bricks are
  one colour and one worth, so its port has one `brick` kind, named as it is below.

Convert the anchor as each number moves. A canvas rectangle is drawn from its top-left corner; a
row's `pos` in the game `yarn new-game` writes is the thing's middle, as its look draws it. The old
`paddleX` is the `player` row's `pos[0]` less half its width, and a brick at `BRICK_LEFT + c *
(BRICK_W + BRICK_GAP)` stands at that plus half `BRICK_W`.

### Input

The old `keydown` and `keyup` listeners become the table `player.client.ts` hands the player plugin
in its `setup` (`plugins/player/player.plugin.ts`): `bind` on keys, as `yarn new-game` writes it, or
`control` on named actions when the person wants the player to rebind keys (`input-and-seats`). Left
and right arrows are an `axis`, `send: v => ['move', v]`, bound only for the row that is `mine`,
since the look runs for every seat's `player` row. Each message names an act on the seat's `player`
row, which is the paddle and moves itself; the act checks its arguments (`move` takes -1, 0 or 1 and
nothing else). An act another kind uses to change the `player` row, a brick's worth added to its
`score` or a life taken by `lose`, does nothing when a seat sent it (`seat >= 0`), or a seat sends
itself points (`designing-a-seat`, Acts a seat can send). A key the old game read in one state only, Enter
on its game-over screen, is no key of the table: it presses the focused button of the screen the
game puts up (below), and the button calls `plugins.player.again()`, which sends `again` at the
seat's `player` row as any call of a name the player plugin has no function of its own for does.

### Drawing

The old draw function cleared the canvas and drew everything every frame. A kind's look,
`<kind>.client.ts`, makes its drawing once in `setup`, holds it in a variable at the top of its file
(the page imports the file once per row of each client, `<kind>.client.ts?row=<id>&client=<c>`,
`engine/browser.ts`), moves it
in `tick` from the row, and takes it off in `remove`. Its sizes and colours are its definition's;
`fillRect(x, y, w, h)` with a colour constant becomes a `Graphics` rect of the definition's `size`
and `colour` centred on `pos`. Which renderer, and anything about light, sky or background, is
`writing-the-look`'s.

Text over the game, the score and lives, and every overlay go on the `ui` plugin
(`plugins/ui/ui.plugin.ts`, `building-the-hud`): shown with `ui.show` in the look's `tick` every
frame, never in `setup`, on a panel `world.ui` places, in a style `world.ui.styles` names, at a place
and with an anchor from the definition. `textAlign = 'right'` is an anchor of `[1, 0]` on the
definition; a label (`'Score: '`) is a word of the definition. The seat's own score and lives are
shown by `player.client.ts` for the row that is `mine`, off that row's fields, so each page shows its
own seat's and shows it on the frame after the press.

### Files and sounds

Every image, sheet, font and level the old game loaded with `new Image()`, `fetch` or an engine's
loader is an entry of the scene's catalogue, `world.loader.assets`, drawn through `plugins.loader` or
a plugin's table (`bringing-in-art`). Every sound it played with `new Audio()` or an engine's audio
call is a cue the rule raises with `sound(w, cue, at, from)` from `plugins/audio/audio.sim.ts`
(`sound`). A sound of the seat's thing, the paddle's knock, is raised `from` its `player` row, rides
that row's `voiced` list and is heard on the frame after the key; a sound of any other row, a brick
breaking, goes on the `audio` ledger. No look plays a sound or fetches a file.

### Screens, and starting over

A screen of the old game that is a place of its own, a title, a menu, the next level, is a scene
(`scene-flow`). A screen drawn over play that shows what the game ended with, a game over with the
score, a pause, is a screen the game puts up: a kind of its own with one `actors` entry, whose look
draws it on a `ui` modal while its row says so and takes it down the frame the row says otherwise
(`building-the-hud`), as the `pause` kind there is. The port's is `ending`: its prefab
`{ "ended": "" }`, its act `end(how)`, which the `player` row's `lose` calls with `'lost'` on the last
life and the brick's `hit` with `'won'` on the last brick, and `ending.client.ts`, which shows the
definition's words for `ended` and a button while `ended` is set. Every rule that must stop honours
it, as the `player` row's and the ball's return while `w.find('ending').data.ended`, which is what the
old `if (state !== 'play') return` was. `player.client.ts` draws the score and the lives on the HUD
for the row that is `mine`. A game-over scene of its own
lists no `player`, as a menu lists none, and the args of `go` reach a scene only as `arrive` on its
`player` row, which such a scene drops (`connection` in `addons/scenemanager/scenemanager.addon.ts`).
Showing the score there needs its `enter` act handed the `go` args, which core lacks and which is
built in `connection` when a job needs it (`scene-flow`, What crosses a move), never by listing
`player` on the screen. A modal names all six of `world.ui.keys`.

The old `reset()` that rebuilt everything is an act, the port's `ending`'s `again`. A scene is never
booted again. The act ends every row of the kinds that start over and spawns each of the scene's
`actors` entries of those kinds again from `w.world.scenemanager.actors`, which holds the scene
file's entries and its `actorsFile`'s as placed and which no packet carries. Each entry there keeps
its `is` (`child` in `addons/scenemanager/scenemanager.addon.ts`), and `w.spawn` writes every field it
is handed over the prefab (`engine/engine.ts`), so the act spawns the entry's `is` with a copy of the
rest of it, `for (const { is, ...entry } of w.world.scenemanager.actors) if (cast.includes(is))
w.spawn(is, structuredClone(entry))`; handed the whole entry, every row it made carried an `is` field.
So the bricks stand where the scene put them and the screen is its prefab's. The kinds that start
over are a list on the definition of the kind whose act it is (`"cast": ["brick", "ball", "ending"]`
on `ending`'s). The seat's thing is its `player` row, which is never ended for a new game: the seat
keeps its row and its id, so a page running the scene ahead goes on predicting it
(`designing-a-seat`). Its `again`, which does nothing until the screen's `ended` is set, calls the
screen's and writes its own `score`, `lives` and `stood` back to the prefab's, and its `before` stands
it on its start again.

### Randomness

Every `Math.random()` in the rules becomes `w.die()`, and the scene's `world` gets a `seed`; a rule
that rolls with no seed throws `scene has no seed` on the step it rolls. Keep the formula: one roll
per old call, `(w.die() * 2 - 1) * spread` for `(Math.random() * 2 - 1) * SERVE_SPREAD`. Then the old
game, with `Math.random` stood in by `seeded(world.seed)` from `engine/engine.ts`, rolls the same
numbers in the same order, which is what lets the two be run side by side (How it is proven). A
`Math.random` left in a rule rolls numbers no replay gets back: the recorder rebuilt the port's first
step with another serve the moment one was planted. One roll per thing per step that must not move the
scene's die is `seeded` over the row's id and a step counter on the row (`designing-a-kind`).

Every `Math.sin`, `cos`, `atan2`, `hypot`, `exp`, `pow`, `**` and the rest of `Math`'s functions that
engines round differently becomes the same call on `plugins/math`, `math.sin(a)` and `math.pow(a, b)`,
in the rules; three's vectors, quaternions and matrices may stay, and nothing else of three's
(`designing-a-kind`, Maths in a rule). The looks keep `Math`.

A seed is fixed in the scene file, so every run deals the same rolls: the port served the same
angles on every load, in `index.html` and against its server alike, where the old game served
another each time. Tell the person.

### Timers, saves and libraries

- A `setTimeout` or a frame counter is a field on the row that a hook counts down by `dt`, its
  length on the definition. A rule cannot read the engine's step counter.
- What the old game kept in `localStorage` is not the store's: the store lasts while the page is
  open. A record kept between runs is `persisting-players`'.
- A physics library the old game used is a physics plugin (`plugins/box2d/box2d.sim.ts` and the rest
  of `tuning-feel`'s table) set from `world.<plugin>`. A library core does not wrap is wrapped as a
  plugin in its home (`building-a-plugin`, Wrapping a library).

### From another engine, or from paper

The same map holds. This part is reasoning from the homes above, not a port that was done: the
Breakout was the one game ported for this skill. An engine's object, node or sprite class is a kind
and each instance a row. Its per-frame update is `tick`, a late update that runs after every update is
`after`, a fixed-step update is the step. Its prefab is split: the fields that change are core's
prefab, the fields that never change are the kind's definition. A scene is a scene. A singleton
manager is split by what it holds: what it kept of the one who plays, their score, lives and ammo, are
fields of the seat's `player` row, which is the thing they play, and what every seat shares is one
kind with one `actors` entry per system (the wave, the round's clock), never one row holding them all.
A player controller that drives a separate pawn or character is one `player` row: the controller's
input acts and the pawn's fields are the same row (`designing-a-seat`). A data asset of fixed numbers
for one type of thing, a stats sheet, is that kind's definition; only a big table, a level or a cast, is a data file of its
own in `assets/`, a catalogue entry. Instantiate and destroy are `w.spawn` and `w.end`; a message,
signal or event sent to another object is a call of one of its acts with `w.call`. A coroutine or
timer is a field counted down on the row. A static or global variable is never ported as one. A
setting it kept in its player preferences is a key of the store, which lasts only while the page is
open: a reload starts from the scene's values, where the old game kept the player's, a difference to
tell the person. A save kept between runs is `persisting-players`'.

A design on paper has no code to read: each noun is a kind, each number goes to its home as above,
and anything it leaves unsaid is asked of the person.

## The work in order

The example is the old Breakout this skill was written from: a single-file canvas game, paddle on the
arrows, a ball served at a random angle, 21 bricks, score, three lives, game over and win, Enter to
play again.

1. Read the old game and write the inventory (above). Ask the person what must stay exact.
2. `yarn new-game <name>` from the repo's root (`scripts/new-game.ts`), and run its test,
   `yarn vitest run games/<name>/<name>.sim.test.ts` (`starting-a-game`). Set the canvas in
   `games/<name>/main.scene.json`'s `prefabs.engine` (480 by 320 here) and place slot 0's `start`
   where the old game put the player's thing, converted to its middle (`[240, 301]`).
3. The kinds. Name each from the old state, none after the game, a scene or a plugin. The seat's
   thing is the `player` row, so the generated `body` is folded into it: its fields go onto the
   `player` prefab with the paddle's own (`prefabs.player`: `{ "seat": 0, "stood": false, "pos": [0,
   0], "move": 0, "score": 0, "lives": 3 }`), its rule into `player.sim.ts`, whose `before` stands the
   row once on its slot's `start` and marks it `stood` in place of spawning a row, its look into
   `player.client.ts`, which draws the paddle for every row and binds keys for the row that is
   `mine`, and its definition into the `player` definition; `body.sim.ts`, `body.client.ts`, the
   `body` prefab and definition and `body` in `main.sim.ts`'s `sim` are deleted. A seat that leaves
   takes its paddle with it, since its `player` row ends. List every kind in `main.sim.ts`'s `sim`. An
   `actors` entry of a kind the sim leaves out throws `no code for kind <kind>` at boot; a spawned
   row of one throws a TypeError at its first step; a kind with no prefab throws `no prefab for
   <kind>`. The generated `<name>.sim.test.ts` checks the body, and changes with it to the `player`
   row.
4. The numbers. Every definition in `assets/<name>.json`, per-frame rates turned per second; the
   prefabs; `world.seed`; the level's entries in `assets/main.actors.json`, named by the scene's
   top-level `"actorsFile"`; the global kinds' entries (`{ "is": "ball" }`, `{ "is": "ending" }`) in
   the scene's `actors`; `world.predict`, so `client.html` runs the scene ahead (`going-multiplayer`,
   A scene run ahead).
5. The rules, kind by kind, from the old update in its order across the passes: `player.sim.ts`
   (`tick`, held inside its `bounds`; `score(worth)` and `lose()`, which do nothing when a seat sent
   them, `lose` ending the game lost on the last life), `ball.sim.ts` (`after`: serve, walls, the
   `player` rows, keeping in `by` the id of the one it last came off, bricks, lost, which calls `lose`
   on every `player` row, the one under `seats: 1`),
   the game's own `plugins/touch/touch.sim.ts` (where the ball meets a `player` row or a brick),
   `brick.sim.ts` (`hit(by)`: end, hand the `player` row `by` names its worth through `score`, and on
   the last of the kinds a win counts down end the game won), `ending.sim.ts` (`end`, `again`). The
   old `if (state !== 'play') return` is each rule's own check of the screen's row. A header comment
   in each file says what its fields mean and what it does.
6. Input: `player.client.ts` (`bind`, an `axis`, for the row that is `mine`), the `player` row's acts
   (`move`, `again`).
7. Looks: `player.client.ts` (the paddle, for every row; the score and the lives on the HUD, for the
   row that is `mine`), `ball.client.ts`, `brick.client.ts` on render2d's stage; the panels, keys and
   styles in `world.ui`, `ui` in the scene's `plugins`.
8. Screens and starting over: `ending.client.ts` showing the modal while `ended` is set, its button
   shown first and so focused, pressed by Enter, `again` spawning the cast again and the `player` row
   standing again on its start (above).
9. Files and sounds into the catalogue, a sound of the paddle raised `from` its `player` row and every
   other on the ledger (the old Breakout had neither).
10. Anything the old game does that no plugin does: built in its home first, general, set from the
    scene file, tested and used by every game it belongs in, never worked around in the port
    (`building-a-plugin`).
11. The tests beside every file written, run one file at a time, and `yarn tsc` (How it is proven).
12. The old game and the port run side by side, headless and in Chrome. Every difference goes to the
    person: a fault of the port is fixed in its home, and a difference core makes (below) is theirs
    to accept.

## What goes wrong

- A kind's rule in the wrong pass: the ball in `tick` met the paddle as the last step left it, and
  the port drifted from the old game at frame 307. The old update's order is kept across the passes.
- A per-frame number left per frame: a speed of 4 is 4 pixels a second under `dt`.
- A top-left corner taken for the middle: everything stands half a size off and the collisions with
  it.
- The whole update ported into one kind, a `game` row with every field on it. Each system is its own
  kind.
- The seat's thing ported as a kind of its own, a `paddle`, `ship` or `hero` the `player` row spawns
  and forwards its acts to, or its score and lives put on a `round` or a `tally` row. The thing and
  all its own state are the `player` row (`designing-a-seat`).
- The old game's `ui`, `grid` or `store` object ported under its own name. Those are plugins: it takes
  a name of its own. The old `player` object is the `player` row.
- A rule-only act on the `player` row, `score` or `lose`, that a seat may send at its own row. It does
  nothing when a seat sent it.
- A rule reading another kind's numbers off that kind's definition to test a touch. The test is a
  function of a game's own plugin, handed both rows.
- The game-over screen drawn by the look of the kind that ends the game. A screen is a kind of its
  own, whose row says it is up.
- A level-building loop run when the scene boots, or the level's numbers kept in a rule. The loop is
  run once, outside, and its result is `actors` entries.
- The old reset ported as a reload or a fresh boot. A scene is never booted again; the act spawns the
  cast again from `w.world.scenemanager.actors`, each entry's `is` taken off before the rest is
  handed to `w.spawn`.
- `Math.random` kept in a rule. The replay fails at the first roll.
- A fixed seed taken for the old game's chance: every run deals the same rolls.
- Old code copied as it is because it works: a global at the top of a file, a number in a draw call,
  a listener added to a page. Each is read for what it does and built in its home.

## How it is proven

Each test sits beside the file it tests, is a `.test.ts` run in node, boots the game's manager as its
page does, and reads every number it checks off the scene file, the actors file and the definitions
(`proving-a-game`). Run each with `yarn vitest run games/<name>/<file>`. The port's tests, the
paddle being the `player` row:

- `<kind>.sim.test.ts` beside each rule. A seat joins with `connection(manager(truth), …)` and is
  steered by `seat.take` of `move` at its `player` row, as its keys would. `player.sim.test.ts`:
  standing on its start, speed, the bounds, a bad way refused, still once the game is over, gone when
  its seat leaves; a life a ball lost, the game ended lost on the last life; `score` and `lose` sent by
  the seat at its own row refused and changing nothing; `again` ignored while playing and, once over,
  the row on its start again with the prefab's score and lives and the same id. `ball.sim.test.ts`: the
  serve at the angle `seeded(world.seed)`'s first roll gives, the walls, the angle off the paddle, a
  brick, a life lost and the serve with the next roll, still once over. `brick.sim.test.ts`: every
  brick where its entry stands it, `hit` refused from a seat, the first brick reached and its worth on
  the `player` row's `score`, the game ended won on the last brick with every brick's worth.
  `ending.sim.test.ts`: `again` ignored while playing and, once over, every brick's row the data of its
  entry with no `is`, the screen its prefab and the ball served with the next roll; a seat refused the
  screen's acts. It failed with the whole entry handed to `w.spawn`.
- `<name>.predict.test.ts` (`designing-a-seat`, The proof): two pages run ahead on the game's server
  over loopbacks, one on a clean wire and one on each of the network panel's bad ones; an arrow sent
  every frame, and on every frame the page's own `player` row
  (`possessed(page.client.plugins.wire.rows)`) has taken every press sent up to the frame before.
- `plugins/touch/touch.sim.test.ts` beside the game's own plugin: the manager booted with the game's
  folder as base, `new URL('../../', import.meta.url).href`, and a page on it, each function asked
  with the page's wire and the rows the seat was sent, at the edges where its answer turns. Its
  functions take a rule's `W` or a page's `Wire`, as `def` does (`plugins/loader/loader.sim.ts`), so
  the test asks them with the wire rather than a stand-in for the engine's world.
- `<name>.sim.test.ts`, the generated one, changed from the `body` to the `player` row.
- `main.sim.test.ts` beside `main.sim.ts`: the game under the recorder
  (`addons/recorder/recorder.addon.ts`), a page on its seat playing a thousand steps through the
  player plugin, then steps rebuilt with `seek`, each holding the rows it held when played. It failed
  at step 1 with a `Math.random` planted in the serve.
- `player.client.test.ts` for the paddle on every seat's page and the HUD on its own seat's alone,
  `<kind>.client.test.ts` for each other look and `ending.client.test.ts` for the game-over screen,
  on a page made as `index.html` makes it,
  `view(link(loopback(accept(manager(truth)))), file, here, mount)`, with the page's listeners kept by
  `vi.stubGlobal` and keys handed to them with `keyCode` from the player plugin, capture listeners
  first; the UI handed a canvas stand-in in `mount` so it listens. They check one drawing per row of
  the definition's size and colour (`getLocalBounds()`, the `Graphics` context's fill) on the row's
  `pos`, gone and destroyed when the row ends or the client closes; the HUD's text off
  `ui.panel('hud').getChildByLabel('score')`, following the row; the modal up with its button focused
  when the game is over, the arrows taken from the game, and Enter starting the game over on the
  server.

What those tests met:

- A paddle collision is checked against the paddle where this step's `tick` left it, read after the
  step, since that is where the ball met it.
- A test's steering that keeps the paddle under the ball returns it straight up and never reaches
  a side wall. It aims a quarter of the paddle off its middle.
- An arrow held through the game-over screen plays the paddle again on the keyboard's next repeat
  once the modal is gone, as the old game's held arrow kept its paddle moving: with no modal up the UI
  takes no key (`pressKey` in `plugins/ui/ui.plugin.ts`), and the player plugin holds a key on every
  keydown, a repeat too (`onDown` in `plugins/player/player.plugin.ts`). `ending.client.test.ts`
  hands it a repeat and reads `move` -1 on the server. The comment in the Gamepads part of
  `player.plugin.ts`'s tick that says a key held through a modal is held "only on a new press" is
  true of a pad, which has no repeat, and not of a keyboard: a doc to fix when met.

Side by side, headless. While the old game is in hand, it is run frame for frame beside the port, in
a script outside the game folder: the old game is no file of the port, and every test beside the port
passes with it gone. Outside the repo, the script imports core's files by their absolute paths
(`/…/core/engine/engine.ts`, the game's `<name>.sim.ts`), since a `#engine/…` import resolves only
from a file under the repo's `package.json`, whose `imports` map it; the files it imports resolve their
own. Run from the repo's root with `node --experimental-strip-types <script>.ts`, the script takes the old
page's `<script>` text and runs it in `new Function('document', 'requestAnimationFrame', 'Math',
text + 'return () => ({ … })')`, so the returned function reads the old `let` state; `document` hands
back a canvas whose context does nothing and keeps the key listeners; `requestAnimationFrame` keeps
the loop to be called once a frame; and `Math` is `Math` with `random` stood in by
`seeded(world.seed)`. It boots the port with `boot`, `load` and `connection` and steers both from one
pilot each frame: key events to the old listeners, `move` to the port's seat. The port's first step
stands the `player` row on its start and serves, which the old game did before its first frame, so the port's step k + 1
is the old frame k. Every frame it compares the paddle's middle, the ball, the score, the lives, the
state and the bricks left, and prints the first frame they differ. The Breakout ran 4640 frames
through two wins, and 1372 through game over, play again and a second game over, every position
within 1e-13; the ball moved into `tick` showed at frame 307.

Played. `yarn editor <name>`, or `PORT=<n> yarn editor <name>` when another holds 5173, serves
`localhost:<port>/games/<name>/index.html`; the old game opens beside it from its file. Both are
looked at in Chrome through `.claude/skills/good-webviews/webview.mjs` under a `WEBVIEW_TAB` of your
own, and played with the same keys. A `dev.html` testbed may put the scene's truth on `window`, show a
readout of the rows, and add a key of its own that turns on a pilot dispatching `KeyboardEvent`s with
their `code` on `window`, which the player plugin and the UI hear as a person's keys; nothing else
reads it. good-webviews' `eval` does not wait on a promise: start a measurement in one call and read
it in the next, as the old game's frame rate was counted. Then `<name>.server.ts` on node and a tab of
`client.html`, which wraps its link in `predict` (the prime directive's The pages) and plays the same
game against the server: the paddle moves on the frame after the arrow. Stop every server you started.

## Questions never asked

- Can the old update stay one function in one kind? No: each statement goes to the kind whose state it
  changes, in its order across the passes.
- Can the old globals stay module-level variables? No: rows, definitions, `world` or the store.
- Can the old per-frame speeds stay as they are? No: per second, multiplied by `dt`.
- Can the old reset reboot the scene? No: an act spawns the cast again from its entries.
- Can the old game's `player` object, the paddle or the hero, be a kind of its own the `player` row
  spawns? No: it is the `player` row, with its score and lives on it.
- Can the score and lives go on a `round` row so the `player` row stays small? No: the seat's own
  state is its `player` row's, which is the one row drawn on the frame after the key.
- Can the ball read the paddle's size off the paddle's definition? No: the touch test is a game's own
  plugin, handed both rows.
- Can `Math.random` stay because the old game used it? No: `w.die()` and a `world.seed`.
- Can the old game's loop or key listeners go in `index.html`? No: the page mounts things.
- Can the old screen's words and places stay in the draw code? No: the definition and `world.ui`.
- Should a plugin get a setting so the port plays like the old game? No: that game's kind.
- Should I work around what core lacks? No: build it in its home.
- Do you want the full version? Always.

Ask the person making the game what the port must keep and what each difference found should be.
That is content, and it is theirs.
