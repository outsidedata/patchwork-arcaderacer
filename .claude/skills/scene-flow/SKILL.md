---
name: scene-flow
description: Use in core, or any clone of it, when a game has, or is getting, more than one scene. That covers a title or start screen, a main menu, levels in sequence, a game over and back, a cutscene or intro between scenes, a hub and its rooms, "go to another scene", "switch scenes", "next level", "back to the menu", "restart the level" and "carry the score to the next level". It covers the manager scene and its children (`<game>.scene.json`, `scenes`, `entry`, `suspend`, `enter`), the `scenemanager` addon and plugin (`go`, `out`, `arrive`, envelopes, `view` making one client per scene), a menu's plain seat, and what crosses a move and what does not (the store, `arrive`, a scene that is never booted again). It also covers the `cutscene` plugin's `go` at its end, whether `party` moves seats together (it does not), the editor's Scenes panel and fields that name a scene (`scenemanager.scene`), and entering a scene directly from `dev.html`.
---

# Scene flow

A game of more than one scene: the files a scene is, how a seat goes from one scene to the next,
what goes with it, and how that is proven. Every game is already built on the scenemanager, a game
of one scene too. The whole of it is the header of `addons/scenemanager/scenemanager.addon.ts`.
This is the work of giving a game its second scene and moving seats between them.

What applies instead:

- Making the game, what each file `yarn new-game` writes is for, and the testbed in general:
  `starting-a-game`.
- The rule of the kind that decides a move (a door, an exit, a clock that ends the round) and where
  its values go: `designing-a-kind`. This skill says only how that rule calls `go`.
- How a seat binds keys, the `player` row, slots and `start` actors: `input-and-seats`.
- Laying out a level, its map and its actors (`actorsFile`, `<level>.actors.json`):
  `building-a-level`.
- More than one person over a network, `client.html` against the server: `going-multiplayer`.
- Any editor work beyond binding a field to a type and the scene check of step 8:
  `building-an-extension`.
- A new plugin, or a mod (the Mods header of `addons/scenemanager/scenemanager.addon.ts`):
  `building-a-plugin`. A scene author only names a mod in `world.<p>.mods`.

## How it works

The manager scene, `<game>.scene.json`, holds one `scenemanager` row. Its prefab names every scene:
`scenes`, a name to `{ file, suspend, enter? }`; `entry`, the scene every connection enters; `dt`,
the seconds each child step is given; and `port`. `load` boots one truth per name, once for the
life of the process, and never boots one again. A child's `prefabs` and `world` are the manager's
with its own over them, key by key at the top level. So a prefab or a `world.<plugin>` every scene
uses is written once, in the manager's file. A child that gives its own `world.loader` has only its
own catalogue, not the manager's and its own together.

### Scenes that share most of what they hold: a partial

Scenes played on one place, a skirmish and its missions, a level by day and by night, share a
partial: `<name>.partial_scene.json`, purposefully incomplete, never a scene of its own and never in
the manager's `scenes`. Each scene, `<scene>.scene.json`, names it as `"extends"` (relative to
itself) and holds only what is its own. When a scene loads (`extended` in
`addons/scenemanager/scenemanager.addon.ts`, called by `child`):

- its `world` and `prefabs` deep-merge onto the partial's, the scene's values winning field by field;
- its `actors` are combined with the partial's, the partial's first;
- the rest of the scene file (`plugins`, `seats`) is the scene's own;
- a partial extends nothing.

Whatever differs between the scenes cannot be shared: it is in none of the partial and in each
scene. A row two scenes place differently (a yard that is a ruin in one, each scene's `start` with
its own loadout) is an actor of each scene, not of the partial. A catalogue entry, a prefab or an
actor added to the partial reaches every scene that extends it. A new variation is a new
`<scene>.scene.json` naming the partial and giving only what makes it different.

A scene file is read whole only through the scenemanager. Anything that imports
`<scene>.scene.json` directly, or reads the `scene` a `<scene>.sim.ts` exports, gets the scene's own
part without its partial; that is wrong, and it breaks. A test or a testbed that needs a scene as the
game runs it loads it with `child` (`proving-a-game`).

Each step of the manager steps every child whose entry says `suspend: false`, and every child a
seat is on. A `suspend: true` child nobody is in is not stepped at all: its rows, its step counter
and its die stay as they are, and it carries on from there when a seat comes back. When the last
seat leaves such a child it is given one more step, so a row that ends itself once no `player` row
names it, a marker the seat's rules left behind say, is gone before the scene stops. (The `body`
`yarn new-game` writes ends itself so; it is folded into the `player` row before a game gets a second
scene, `designing-a-seat`, and never copied as the shape of a seat.)

A connection is one seat on one child at a time, and it enters `entry` first. A child that lists the
`player` plugin seats it through `addons/player/player.addon.ts`: a `player` row holding the
lowest free slot below that child's own `seats`. A child that does not, a menu, gives it a plain
seat that possesses no row and may send only the acts a kind lists in `open`. A scene that lists
`player` and has every slot taken takes no one more: the seat stays where it was, as though it had
not asked. The manager scene's `seats`, in `<game>.scene.json`, is read by nothing, since no
connection is seated on the manager: the entry scene's `seats` is what counts at the door, and an
entry that is a menu refuses nobody there.

A seat moves when its scene writes the seat's next scene on the scene's own `scenemanager` row
(`plugins/scenemanager/scenemanager.sim.ts`). The act is `go`, and it is open. It refuses a name the
manager's table does not hold (`names`, which `load` writes on each child's row), and otherwise
writes `out[seat] = { scene, args }`. A second `go` before the step ends replaces the first. Since
`go` is open, any seat may ask for any scene the table holds, with any args: the table is the only
bound. After that child's step the addon takes the seat out (its `player` row, when it has one,
ends), seats it in the next scene with a new seat number, and sends the page that scene's first
packet. Each seat moves on its own: two seats of one game, two tabs against its server, may be on
two scenes. When `args` is not empty and the next scene lists `player`, the args reach the seat's
new `player` row as its act `arrive`, at the start of that scene's next step, before any `before`.
Args sent to a scene that lists no `player` are dropped, and the seat still moves. A seat sent to
the scene it is on leaves and enters again: a new `player` row and a new seat number, every other
row as it was. A `suspend: true` scene it was alone in takes its one more step between the leaving
and the entering, so what ends when no `player` row names it ends first.

On the page, `view` holds one client, for the scene the seat is on. On `client.html`, `predict` makes
the view itself and runs each scene that gives `world.predict` ahead of the server, drawing the seat's
own `player` row from its copy (`addons/predict/predict.addon.ts`); a scene that gives none is drawn
from its packets as they come. Every envelope names a scene and
the seat's number there. On the frame after one names another scene or another number, the client is
closed (every actor's `remove`, every plugin's `close`: the renderer gives back its canvas and its
context, the keys stop listening, the UI's open panels go) and a new client is made, which `mount`
gives new canvases. A message sent on a visit that is over is dropped.

## The wire, as a game author meets it

`index.html`, `client.html` and `<game>.server.ts` are written by `yarn new-game` and are the same in
every game but the file names they import. `client.html` wraps its link in `predict`,
`tap(dial(url), wire => predict(link(wire), file, import.meta.url, mount))` (the prime directive's
The pages); the template still writes it with `view` alone, and it is put in that shape before the
game is played over a network (`publishing-a-game`). `index.html` and `client.html` hold no scene name.
`<game>.server.ts` names the scene `yarn new-game` made in its opening comment and nowhere in its
code; step 9 takes the name out. The page boots the manager, and `view` follows the envelopes
wherever the seat goes, so adding a scene, changing the entry or moving seats changes no line of
code in any page. The page names its transport in one line: `index.html` a loopback, `client.html` a
dial, the server a serve. The scenemanager carries envelopes over whichever transport it is handed,
and nothing else carries a packet. A scene name in a page, a listener on a page that moves the seat,
or a second client made by hand is a page doing a scene's work. `dev.html` is the one page that may
name a scene (below).

## The work

1. Write the scene.
   - A scene that shares its kinds with one already there, a second level: the editor's Scenes
     panel, New scene (the command `scenes.new`), makes it from that scene as one change and one
     undo (`plugins/scenemanager/scenemanager.extension.tsx`). It writes `<name>.scene.json` beside
     the manager's, a copy of the source's file with the actors of the kinds the form keeps (all of
     them unless unticked); `<name>.sim.ts`, which exports the scene file as `scene` and hands out
     as `sim` whichever sim the source hands out, `export { sim } from './<that>.sim.ts'`, the module
     the source's sim hands out another's from, else the source's own (`simOf`, `simText`); its own
     copy of each file the source's `world` names that not every scene names, its map say, catalogued
     where the source's entry was (unticked, the two share it); and, last, its entry in the table, a
     copy of the source's entry. `scenes.add` does the same with a scene file handed to it, or a
     copy of the source's, and copies no file.
   - A scene with kinds of its own, a title or a game-over screen: write `<scene>.scene.json` and
     `<scene>.sim.ts` beside the manager's by hand, and add `"<scene>": { "file":
     "<scene>.scene.json", "suspend": true }` to the manager's `scenes`. The sim imports the scene
     file, exports it as `scene` beside `sim`, and names every kind the scene makes rows of,
     `scenemanager` and `loader` among them. The scene file lists `scenemanager` in its `plugins`:
     its browser half is the one plugin that mounts a pipe, the client's only door onto the link,
     and `view` mounts it on every client it makes. It has a `"scenemanager": { "out": {} }` prefab
     and an `actors` entry for it, a `loader` prefab and entry so the definitions are fetched before
     its first step and its first frame, and an `engine` prefab with `dt`, `width` and `height`,
     which size the page's canvases.
   - Give the scene's own kind a name no scene has. A kind's rule is `<kind>.sim.ts` and a scene's
     sim is `<scene>.sim.ts`, so a `title` kind in a `title` scene would be one file. The editor
     holds to it (`extensions/kinds/kinds.route.ts`): New kind refuses a name whose `<kind>.sim.ts`
     is there already, and the kinds listing counts no `.sim.ts` that has a `.scene.json` beside it
     as any kind's rule. A `title` scene shows a `titlecard`, say.

2. Move up what every scene reads. `yarn new-game` writes `world.defs` and `world.loader`, the
   definitions file and its catalogue entry, into its one scene's file. A second scene that reads a
   definition needs both. Move them into the manager's `world`, where every child inherits them,
   and leave them out of the scenes; never copy them into each scene. The same goes for any
   `world.<plugin>` every scene uses. A scene that catalogues a file of its own by giving its own
   `world.loader` lists the manager's entries again, since its catalogue replaces the manager's.
   Every scene a seat plays in gives `world.predict`, so `client.html` runs it ahead and the seat's
   own `player` row answers the key on the next frame (`going-multiplayer`, A scene run ahead): it
   is written once in the manager's `world` when every scene is one a seat plays in, and otherwise
   in each level's own, a scene made with New scene taking its source's with the rest of its file.

3. Set the entry: `entry` in the manager's `scenemanager` prefab. The Scenes panel marks it and will
   not take it out.

4. A title screen, or any menu that leads somewhere.
   - It lists no `player`: `"plugins": ["loader", "scenemanager", "ui"]`, with no render2d or
     render3d when it draws only UI. It needs no `seats`, since a plain-seat scene takes every
     connection. A results or game-over screen is such a screen too. Listing `player` would change
     three things, each wrong for it. The seat would be seated by slot (`join` in
     `addons/player/player.addon.ts`), so a screen whose slots are all taken holds a later seat back
     where it was (`free`, which `connection` asks). It would run the level's `player` rule and bind
     the level's keys: the game's `player` kind is one per game folder, `player.sim.ts` and
     `player.client.ts` belong to every scene that lists `player`, and the rule `yarn new-game`
     writes looks up a `start` in `before` and throws in a scene that has none. And it would take
     `go`'s args as `arrive`, which is the same break as carrying a score through the store: a way
     round the piece core lacks, `enter` handed the args (What crosses a move).
   - Its screen is an actor of its own kind on a `ui` panel that `world.ui` makes `modal`: the
     actor shows the words and a button with `ui.show`, the modal focuses the first button, and
     `world.ui.keys.press` presses it as a click does (`plugins/ui/ui.plugin.ts`). Every word and
     every place on the panel is the kind's definition; the looks are `world.ui.styles`. A
     `world.ui` in the manager's file is every scene's until a scene gives its own. How the keys and
     a gamepad reach the UI is `input-and-seats`'s.
   - A second screen drawn as the first is, a game-over card beside the title card, is one look under
     two definitions: written once in the browser half of a plugin of the game's own, loaded by
     `shipped` in both scenes, drawing each kind's rows by its own definition, each thing shown with
     `ui.show` under a key that holds its row's id (`designing-a-kind`, Shared code and systems).
     Never a second `<kind>.client.ts` copied from the first.
   - The button moves the seat from the page: `plugins.scenemanager.go(name, ...args)` sends `go` at
     the scene's `scenemanager` row (`plugins/scenemanager/scenemanager.plugin.ts`). The name is
     never a string in code. A kind that appears in one scene holds it in its definition, read with
     `def(plugins.wire, row.kind)` (`plugins/loader/loader.sim.ts`); a name that differs from scene
     to scene is a field of the scene's own `world` (step 7). Where a rule must choose the scene,
     the kind's own act, listed in its `open`, calls `go` with the seat it was handed instead.
   - The table entry's `enter: { kind, act }` names an act run for each seat that enters the scene.
     `connection` in the scenemanager addon sends it at the first row of that kind at the start of
     the scene's next step, before `before`, with the seat's number and no args (a screen that shows
     what the seat carried needs the `go` args handed on, What crosses a move); a scene with no row
     of the kind throws `no <kind> row in <scene>` as the seat enters. The seat does not possess that
     row, so the act is in the kind's `open`. A door that sends every arrival straight on, showing
     nothing, calls `go` there with the seat it is handed; a level decides there whether to start
     over (step 6); a scene a cutscene plays in sends on a seat that comes back to it (A cutscene).

5. A move from a rule. The rule calls `w.call(w.find('scenemanager'), 'go', seat, name, ...args)`.
   `seat` is the truth's seat number, which `out` is keyed by: the number an act is handed. It is
   not the slot in the `player` row's `seat` field. The slot can be the same on every visit while
   the seat number is new on each. A key that moves the seat is an act of the game's `player` kind
   that calls `go` with the seat it was handed.
   - A hook (`before`, `tick`, `after`) has no seat. A rule that moves a seat from a hook (time up,
     lives gone, the exit reached) passes a seat number its row kept from an act. The one that comes
     on every arrival: `player.client.ts`'s `setup` calls an act of the `player` row,
     `plugins.player.<act>()`, which the player plugin sends at its first `input` or `tick` (a setup on
     a client's first frame runs before the plugin has its wire), and the act writes
     the seat it is handed on a field of the row. The hook passes that field. `player.client.ts` is
     loaded for every `player` row the page is sent, every seat's, and `plugins.player.<act>()` sends
     at the seat's own row, so the call stands behind `if (row.data.mine)`: without it a page of a
     scene of four seats sends the act four times, and again each time another seat arrives. `arrive` writes it
     too, but `arrive` comes only when the `go` that brought the seat carried args.
   - `arrive` can be forged. It is an act on the row the seat possesses, so the seat can send it
     whenever it likes, and `go` is open with any args, so a seat can send itself into a level with
     args it chose. `arrive` takes its args only while the fields they fill are still unset, and
     checks each as data from outside the program: its type and its range, a score up to the most
     the game can give by then, read off the definitions. So a value carried as args can be forged
     up to its checked bound: the check bounds it and never stops it, since the seat may send any
     value the check lets through. A value that must not be forged at all, a score kept on a
     high-score table say, is never carried as args: the server writes it itself, a record kept per
     account by the `persist` addon and read back by the next scene (`persisting-players`).

6. The way back, and a game over. Going back to the title is a `go` to it like any other. A game
   over is a rule deciding it and calling `go`, to a game-over scene (a plain-seat screen like the
   title, its button leading back; drawn as the title is, it shares the title's look, step 4) or to
   the title. A game-over screen that shows what the seat carried, the score it ended with, stays a
   plain seat and never lists `player` to take it as `arrive` (step 4): its `enter` act is handed the
   `go` args, which core lacks and which is built in `connection` in the scenemanager addon when a
   job needs it (What crosses a move). A level is never booted again. A seat that plays again
   enters it as it was left, its coins taken and its enemies dead, less what ended with the seat's
   `player` row. A level that starts over does so by a rule of its own, spawning its cast again from
   `w.world.scenemanager.actors`, the scene's `actors` entries, which no packet carries. The table
   entry's `enter` act, run with each seat that enters, is where that rule decides it: when the seat
   is the scene's only one, say. A `go` to the scene the seat is on, a
   restart key, gives a `suspend: true` scene it was alone in its one more step first, so whatever
   ends once no `player` row names it is gone before the new `player` row stands on its start.

   A `suspend: true` scene keeps its rows when the last seat leaves, and a `suspend: false` one keeps
   stepping, so on the server a level that was won, or stuck where nobody can go on, stays so for
   every seat that enters it after, until the server is started again: a seat that enters a race
   already won joins a race that is over, its finish written and nothing left to run. A game that
   can be won or stuck needs a way back of its own: a restart act, or an `enter` act that starts the
   level over. Which one is the person's to say: they are asked, and told that without one the level
   stays as it was left. A level that starts itself over after a win, with no seat asking, is a way
   back too, and as much the person's choice: it is asked, never written unasked.

7. Levels in sequence. Each level is a scene made from the first, sharing its sim. Where a level
   leads never changes, so no row carries it.
   - One way on per level: a field of that level's own `world`, `world.<field>`, which no packet
     carries. The rule that sees the exit reached reads it off `w.world` and calls `go` with the seat
     and that name.
   - Several exits leading to different scenes: each exit's `actors` entry holds only which exit it
     is, a key, as a `start` holds `slot`; the level's `world` maps each key to the scene it leads
     to. The rule reads `w.world.<field>[me.data.<key>]`.
   - A name every level would give alike is a field of a kind's definition.
   - What the level hands on, a score or the lives left, goes as args and arrives as `arrive` on the
     next level's `player` row, checked to the most the game can give and so forgeable up to that;
     a value that must not be forged is a per-account record instead (step 5 says both). `arrive`
     writes each value onto the `player` row's own field, `score` or `lives` say, which its prefab
     holds as `null` or `-1`, and its `before` stands the row on its start only once `arrive` has
     written them. The count goes on changing on that field while the level plays, and how far the
     seat has got is a field of the same row: the seat's own state is a field of the row it plays as
     (`designing-a-seat`). Never a `tally` or a `carried` field the `player`
     row spawns a count from. Every `go` into that level carries args, the title's button included: a
     `go` with none brings no `arrive`, and the row never stands.

8. Bind every field that names a scene. The game's own extension, `games/<game>/<game>.extension.tsx`,
   exports the function `<game>` and binds each such field to the scenemanager's field type,
   `scenemanager.scene`: a definition's field with `ed.bind('<kind>', { <field>: 'scenemanager.scene'
   })`, a `world` field of the scene files with `ed.bindFile(path => path.endsWith('.scene.json'), {
   'world.<field>': 'scenemanager.scene' })`, or `'world.<field>.*'` for a map of exits. The editor
   then shows each as a pick of the game's scenes, and the manager's `entry` is bound already. Remove
   refuses to take out a scene a bound field names, unless told to anyway, but it looks only in the
   scenes' prefabs and `actors` entries, their actors files and the definitions (`namingsOf` in
   `plugins/scenemanager/scenemanager.extension.tsx`), not in `world`. The first game that names a
   scene in `world` extends `namingsOf` to walk each scene file's `world` against the file bindings,
   with its test beside it; the value never moves onto a row to be seen.

9. Fix what assumed one scene. The `<game>.sim.test.ts` that `yarn new-game` writes connects a seat
   and reads its `body` in the first scene; once the `body` is folded into the `player` row it reads
   the seat's `player` row instead. With a title as the entry it fails, and it is rewritten to
   go from the entry first. The comments `yarn new-game` writes name the one scene: `<game>.sim.ts`
   and `<game>.server.ts` say the manager holds it and every connection enters it, and
   `<scene>.sim.ts` says its scene names the definitions. In the same change the scene's name comes
   out of the two manager files' comments, which then hold for any entry, and `<scene>.sim.ts`
   names the manager's `world.defs`.

## What crosses a move and what does not

Crosses:

- The page's store (`plugins/store/store.plugin.ts`): one table per link, so every scene of a page
  reads and writes the same values. A scene's starting values, `world.store` (`building-the-hud`,
  step 9), fill only the keys not set yet. It carries only what the page alone keeps, a volume or
  rebound keys. A row's value copied into it to cross a move, a score a game-over screen shows, is a
  break: no rule reads the store, so nothing of the server's ever reads that copy, and the page may
  write any value there.
- The args of `go`, as `arrive` on the next scene's `player` row, when that scene lists `player`. A
  scene that lists no `player`, a plain-seat game-over screen, gets none of them: `connection` in the
  scenemanager addon drops them, and hands the scene's `enter` act no args (`args: []`). So a
  plain-seat screen that shows what the seat carried needs `enter` handed the `go` args, which core
  does not have. When a job meets it, it is built in its home, `connection` in
  `addons/scenemanager/scenemanager.addon.ts`, with its test in
  `addons/scenemanager/scenemanager.addon.test.ts` and the header's lines on args saying it, and the
  screen's `enter` act checks each arg as `arrive` does (step 5). It is never carried through the
  store, a row of the game's own, or `player` listed on the screen so `arrive` takes it, instead:
  listed, the screen seats by slot and runs the level's `player` rule (step 4). A screen that shows
  nothing the seat carried needs none of it.
- The scene the seat left, which keeps its rows for the life of the process: still if it is
  `suspend: true`, stepping if it is `false`.

Does not cross:

- A value at the top of a `<kind>.client.ts`. The page imports it per row of each client, as
  `<kind>.client.ts?row=<id>&client=<c>` (`engine/browser.ts`), and every scene the seat enters is a
  new client with a number of its own, so a row on the next visit runs a new module, even with the
  id the last one had.
- The seat's `player` row, every field of its own on it (its score, its lives), and what the scene
  spawned for it: they end, and the next scene's are new. What the seat keeps crosses as `go`'s args.
  The seat number changes, and the slot is whichever the next scene has free.
- Anything else on the page. The actors, the plugins' state, the keys, the UI's open panels, the
  renderer and its canvas go with the client. A plugin's browser state is inside its exported
  function for that reason: a value at the top of a plugin's file is made once and read by every
  scene after.
- Anything beyond the process. A record kept from one run to the next is the `persist` addon's
  (`addons/persist/persist.addon.ts`).

## A cutscene

`plugins/cutscene` plays a cue file inside a scene, from one `cutscene` row; the cue file, the cast
and the camera are the headers of `plugins/cutscene/cutscene.sim.ts` and `cutscene.plugin.ts`. What
bears on the flow:

- It starts with `auto: true` in its cue file, or when a game's rule calls its closed act `start`,
  `w.call(w.find('cutscene'), 'start', -1)`. Any seat may send `skip`, which skips it for every
  seat. An `auto` cutscene in a `suspend: false` scene plays from the manager's first step, with
  nobody there to see it.
- With `go` in its cue file, at its end, played or skipped, every row of the kinds
  `world.cutscene.kinds` names is sent `go(go, ...arrive)` with seat −1. Each of those kinds has a
  `go` act, or the call throws; the act calls the scenemanager's `go` with the seat number its row
  keeps, and does nothing on a row no seat plays as.
- It plays once per `cutscene` row, and the row lives as long as the truth. A seat that reaches the
  scene a second time in the same process finds it done, and nothing sends it on. A new row does not
  play it again: a scene holds one `cutscene` row, and one spawned later has a higher id than the
  cast's `actors` entries, which its start refuses. A flow that passes through a cutscene's scene
  twice names an `enter` act in that scene's table entry, on a kind of the game's own: the act reads
  whether the `cutscene` row is `done` and, when it is, calls `go` with the seat it is handed and the
  scene the cue file's `go` names, `json(w, w.world.cutscene.script).go`
  (`plugins/loader/loader.sim.ts`).

## Parties

`plugins/party` does not move seats. It holds who plays together in a hub truth and mirrors each
party into the truths its members are in, through a `post(w, to, kind, act, ...args)` the game hands
it; `instance(w, account)` is the key a party's dungeon would be instanced by. Core is missing the
two pieces under it: mail between truths, which no addon delivers, and instanced truths, more than
one truth of a scene, each keyed by a party, where the manager's table boots one truth per scene
name. Members in one scene are moved together by a rule there calling `go` for each member's seat,
as the cutscene's end does for its cast. Members in different scenes cannot be moved by one rule.

## `dev.html`: entering a scene directly

`dev.html`, beside `index.html`, is `index.html` with changes made before the boot to the page's own
copy in memory. Entering a scene directly is `file.prefabs.scenemanager.entry = '<scene>'` before
`boot(file, sim)`. A child scene's file is changed the same way by importing it, `import main from
'./main.scene.json'`: it is the module the scene's sim exports, so the manager boots the changed
copy. The entry is entered with no args, so a scene whose `player` row waits for `arrive` never
stands it when entered directly; `dev.html` writes those fields on its `player` prefab in memory.
Nothing else overrides the entry, and nothing reads what `dev.html` set. The rest of the testbed is
`starting-a-game`'s.

## What goes wrong

- A menu or a results screen lists `player`, so its seat can press keys or take `go`'s args as
  `arrive`. It then seats by slot, so a screen whose slots are all taken holds a later seat back; it
  runs the level's `player` rule and binds the level's keys; and it takes the args round the piece
  core lacks. It lists no `player`: its keys are the UI's, and what the seat carried reaches its
  `enter` act (What crosses a move).
- The manager scene's `seats` raised for a second player. Nothing reads it; the child's `seats` is
  the one that counts.
- A scene written by hand leaves `scenemanager` out of its `plugins`. Its client has no pipe and
  `view` cannot mount it.
- The slot (`me.data.seat` on the `player` row) is passed to `go` as the seat. It names no seat, or
  another one. `go` takes the seat number an act was handed.
- A hook calls `go` with a seat number nobody stored, because the seat entered with a `go` that
  carried no args and never pressed anything. The `player` actor's `setup` sends an act that stores
  it on every arrival, for the row that is `mine`.
- `arrive` writes whatever it is handed, whenever it is handed it. It fills only fields still unset,
  and checks each value as data from outside the program.
- A level's `player` waits for `arrive`, and the title's button sends `go` with no args. The row never
  stands on its start. Every `go` into that level carries args.
- A scene is expected to be fresh when a seat comes back. It is the same truth, as it was left. A
  level that starts over spawns its cast again by a rule.
- `world.defs` and `world.loader` are copied into each new scene. They go up into the manager's
  `world` once.
- The title's kind is named `title` in the `title` scene. A kind is named after no scene.
- A rule or an actor writes a scene name in its code, `go('main')`. The name is a field of the
  scene's `world` or of a kind's definition, bound to `scenemanager.scene`.
- An exit's destination is written on its `actors` entry, where the row carries it to every seat
  every step. The entry holds which exit it is; the level's `world` holds where each leads.
- A page, `index.html` or `client.html`, gets a scene name or a listener that moves the seat.
  Entering a scene to try it is `dev.html`'s.
- A title is made with New scene from a level. The new scene hands out the level's sim and copies
  its table entry. A scene with kinds of its own gets a sim of its own, written by hand.
- Args are sent to a plain-seat scene, expecting them to arrive. They are dropped: only a scene that
  lists `player` gets `arrive`, and core hands `enter` none (What crosses a move).
- A score copied into the store so a game-over screen can show it. The store is the page's alone;
  what a seat carries crosses as `go`'s args (What crosses a move).
- A game-over screen made by copying the title's `<kind>.client.ts`. One look under two definitions
  is one shared look, the browser half of a plugin of the game's own (step 4).
- A level that can be won or stuck on the server with no way back: every later seat finds it as it
  was left, and one that enters a race already won joins a race that is over (step 6).
- A level written to start itself over after a win without asking the person. Which way back a
  level has is theirs (step 6).
- A value that arrived moved onto a row of its own, a `tally` the `player` row spawns, to count there.
  It keeps counting on the `player` row's own field (step 7).
- `player.client.ts`'s `setup` sends the act that stores the seat's number without
  `if (row.data.mine)`. The look runs for every seat's `player` row, so the act goes once per seat on
  the page, and again as each later seat arrives (step 5).
- The generated `<game>.sim.test.ts` and the comments that name the one scene are left as they were
  when the entry changes. The test fails and the comments lie; the test is rewritten and the scene's
  name comes out of the comments.

## How it is proven

Each test sits beside the file it tests and is run alone: `yarn vitest run games/<game>/<file>`.

- The manager's test, `<game>.sim.test.ts`, boots the manager as the page does, `load`s it, makes a
  seat with `connection(manager(truth), send)`, steps, and reads the `Down`s it was sent. The first
  one is of the entry. A `go` sent at the entry's `scenemanager` row, `seat.take({ scene, seat, msg
  })` with the scene, seat and step of the last `Down`, moves the seat, and the next scene's rows are
  read off the map `load` hands back.
- A kind's test, `<kind>.sim.test.ts`, works the same way. The act or hook that calls `go` moves the
  seat to the scene its definition or its scene's `world` names. A scene entered again holds what it
  should, the seat's one `player` row on its start, and the seat's number there is new. `arrive` sent twice, or with a
  value of the wrong type or out of range, changes nothing.
- A page's test, `<kind>.client.test.ts`, runs in node. It makes the page as `index.html` does,
  `view(link(loopback(accept(manager(truth)))), file, here, mount)`, and steps the manager and calls
  `page.frame()` in turn. `page.name` is the scene the page holds and `page.client` its client. The
  player and the UI listen through the global `addEventListener`, so the test keeps the listeners it
  is handed and calls them with a key event, `{ key, code: keyCode(key), repeat: false, target:
  null, preventDefault() {} }` (`keyCode` from `plugins/player/player.plugin.ts`), capture listeners
  first. The UI listens only once it has a canvas, so `mount` sets `me.plugins.ui.canvas` to a
  stand-in with `addEventListener`, `removeEventListener`, `style` and `remove`, and no renderer is
  made. It checks that the press key presses the menu's button and the seat moves, that the old
  client is closed (its `plugins.scenemanager.here` is false) and its listeners are gone, and that
  the next scene's rows reach the new client. `plugins/store/store.plugin.test.ts` is core's own
  page test across two scenes.
- The game's extension test, `<game>.extension.test.tsx`, runs in jsdom on `editor/test/editor.ts`:
  `sandbox(['<game>'])`, then `editor('<game>', { scenemanager: async () => ({ scenemanager }),
  <game>: async () => ({ <game> }) })` and `ed.open()`, with the scenemanager's routes answered
  (`answer('scenemanager', routes)`). A definition's field is `ed.typeOf('<kind>', ['<field>'])` and
  a `world` field `ed.typeOf(undefined, ['world', '<field>'], 'games/<game>/<scene>.scene.json')`,
  each `scenemanager.scene`; and `removeScene` of a scene a bound field names is refused, naming the
  file and the field. The extension of `namingsOf` to `world` is tested beside the scenemanager's
  extension, on a game its test writes, since a test outside `games/` uses no game in `games/`.
- No test joins a page to a truth by hand, with a pipe of its own or packets handed to a client: it
  takes the loopback, as the pages do.

Played: `yarn editor <game>` serves every game's pages, `localhost:5173/games/<game>/index.html`
and `dev.html`. The entry draws first, its key moves the seat, the next scene's canvas takes the
place of the last, and the way back draws the entry again. `dev.html` draws the scene it enters
first.

## Questions never asked

- Can a menu, a results screen or a game-over screen list `player`, so its seat presses keys or
  takes `arrive`? No: it stays a plain seat. Its keys are the UI's, and what the seat carried reaches
  its `enter` act as args, built in `connection` in the scenemanager addon when a job needs it.
- Can a score cross to the next scene in the store? No: it crosses as `go`'s args, checked where it
  lands, or it is a record kept per account.
- Can the score keep counting on the `player` row once it has arrived? Yes: the seat's own state is
  a field of its `player` row, and it counts there.
- Can the arrived score be handed to a `tally` row the `player` row spawns? No: the seat's own state is
  a field of its `player` row (`designing-a-seat`).
- Can a scene's name be written in code? No: a field of the scene's `world` or of a kind's
  definition, bound to `scenemanager.scene`.
- Can a level be booted again so it starts fresh? No: a rule spawns its cast again from
  `w.world.scenemanager.actors`.
- Can a page name a scene or move the seat? No: `dev.html` enters a scene, and a rule or a button
  moves the seat with `go`.
- Does the manager scene's `seats` say how many play? No: nothing reads it; each child's `seats`
  does.
- Do you want the full version? Always.

Ask the person making the game what its scenes are, where each leads, and how a level that is won or
stuck starts over. That is content, and it is theirs.
