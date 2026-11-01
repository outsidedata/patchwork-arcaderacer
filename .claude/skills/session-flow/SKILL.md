---
name: session-flow
description: Use in core, or any clone of it, when a game needs the whole loop a person goes through around play, from opening the game to playing again. That covers a main menu that leads into play, choosing a side, a team, a class, a ship, a car or a character before entering, joining a game already running (drop-in, join in progress, "no lobby lockout"), taking over a bot or CPU-driven thing when a person joins ("99 CPU + 1 player"), handing it back when they leave, respawning at once or by choosing again, a free-for-all where every seat is everyone's foe, a round that ends with a results screen, every seat sent back to the menu, and the next arrival finding a fresh round. Triggers include "session flow", "game flow", "joining a game", "lobby", "pick a side", "take over a bot", "respawn", "results then back to the menu", "deathmatch" and "duel". It does not cover finding strangers to play with (matchmaking), accounts, or carrying anything past the visit.
---

# Session flow

The loop a person goes through around the playing itself: the game opens on a menu; they choose
what to play and as what; they enter a scene that is already running, at any moment, and take over
one of the things in it; they lose it and get another; the round ends, everyone sees how it went and
is sent back to the menu; and the next person in finds a new round. None of it is matchmaking. There
is no lobby, no queue, no ready check and no waiting for a start. A scene is always running when
somebody is in it, and a seat walks into it as it is.

Every piece of the loop is a piece core already has: the scenemanager's `go`, `arrive` and `enter`
(`addons/scenemanager/scenemanager.addon.ts`), core's hold functions (`plugins/player/player.sim.ts`),
and the `ui` plugin's modal panels (`plugins/ui/ui.plugin.ts`). The engine is frozen and none of
this edits it. What a game writes is its own rules on its own kinds, its definitions and its looks.

What applies instead:

- Scenes, `go`, `arrive`, `enter`, `suspend` and the manager's table, in general: `scene-flow`.
  This skill is one way of using them, end to end.
- The `player` row, holding rows of other kinds, `take`, `letGo`, `holderOf`, `relay`:
  `designing-a-seat`. This skill says when a seat takes hold and of what.
- Drawing the menu, the results, the pause and the wreck screens: `building-the-hud`.
- The seat count, what each seat is sent, running the server: `going-multiplayer`.
- A player who is somebody across visits, and anything kept for them: `persisting-players`.

## The loop, piece by piece

### 1. The menu is the entry scene, and it is a plain seat

The manager's `entry` is a menu scene whose `plugins` are `["loader", "scenemanager", "ui"]` and
nothing else: no `player`, no renderer of the world. A scene without the `player` plugin seats every
connection with no slot and no limit, so nobody is refused at the door, however full the play
scenes are (`scene-flow`, step 4).

- Its look is one kind's actor on a `ui` panel that `world.ui` makes `modal`. Its pages (the first
  page, then a side or a class to pick) are this page's alone, a variable in the look's module, and
  never a row: nobody else needs to know which page one person is reading.
- A button that enters play sends the seat with core's `go`:
  `plugins.scenemanager.go(<scene>, <choice>)`. The scene name and the choice are the menu kind's
  definition (`to` and each button's `with`), never strings in the look.
- The menu scene gives no `world.predict`, and so the manager's `world` gives none either when the
  entry is a menu: each play scene gives its own. A menu that inherited `world.predict` from the
  manager was observed to throw out of the rewind addon's `back_` (`seats[seat]` undefined) when a
  seat moved off it, a message landing for a seat that an older saved step did not have. A scene
  that is only buttons has nothing to run ahead.

### 2. A full scene leaves the seat on the menu, and the menu says so

A play scene takes as many seats as its own `seats` says. A `go` to one with every slot taken does
nothing: the seat stays on the menu, as though it had not asked (`scene-flow`). The menu tells the
person: when a button sends the seat, the look keeps the page's clock, and if the page is still on
the menu `full.after` seconds later it shows the definition's `full` line until the next press. No
row and no reply from the server is needed, since a seat that was let in has left the menu's page
by then.

### 3. The choice arrives on the `player` row, once, checked

`go`'s args reach the play scene's `player` row as its act `arrive`, before its first `before`. The
row's prefab holds each choice as `null` (`side`, `pick`), and `arrive`:

- writes the seat number it was handed onto a field of the row (`conn`), so a rule that later sends
  the seat somewhere has it (`scene-flow`, step 5: a hook has no seat);
- takes each choice only while its field is still `null`, and only when it is a key the definitions
  name (a side in the round's `seats` table, a class in the free-for-all's list); anything else is
  ignored. `go` is open, and `arrive` is an act on the seat's own row, so both can be sent by hand
  with anything in them.

In a team scene, the side decides what the seat may fly: `seats: { <side>: { class, arrive } }` on
the round's definition, so `pick` is the side's class. In a free-for-all, `pick` is any class on the
list.

### 4. Joining a running scene: nothing refuses it

Every play scene is `suspend: true` and runs from the moment its first seat enters. A seat that
enters a round half played joins it as it is: it takes a thing and plays. **There is no flag that
refuses a seat once the round has started.** Some games in core have one (a race that will not take
a seat once its countdown has gone); it is that game's rule, not a part of this loop, and is never
carried into a game built from this skill. The only things that keep a seat out are the scene's
`seats` and the moment a round is over (step 9, which shows it the results and sends it back).

### 5. The thing a seat plays is the world's, and the seat takes it over

Every thing a seat can play stands in the scene without a seat, driven by its own brain: the
round's rules spawn the full cast, the same count whether nobody is in or eight are. The `player`
row is a pilot, a driver, a commander: it holds a thing with core's `take` (`designing-a-seat`, A
thing that takes hold of rows that are not it). The thing's kind asks `holderOf` every step: held,
its controls are the seat's (its own acts, reached through `relay` on the `player` row and never in
its `open`); unheld, its brain drives. So when the seat's connection closes, the `player` row ends,
the thing has no holder on the next step, and its brain takes it on from where it is. Nothing hands
it back by hand.

Taking over "one of the CPU's", with the count kept:

- **The first time** a seat takes a thing in this round (a `boarded` field on the `player` row,
  `false` in the prefab), a new one of its class and side comes in for it by the side's way in (out
  of hyperspace at a point, out of a hangar, onto a grid), placed by the seat's slot so no two seats
  arrive on one spot (a per-slot `spacing`, or a queue per bay). In the same act, one free thing of
  that class and side, the newest, is ended, so the scene holds as many of them as before and one of
  them is now the seat's.
- **Every time after**, the thing having died, the seat takes the nearest free thing of its class
  and side at once, and only when none is left does a new one come in the first way.
- A thing taken is gripped: every control let go and its throttle (or speed, or whatever the brain
  set) left where the brain had it, so it goes on as it was until the person touches the controls.
- What the brain remembers on the row stays there while it is held, and the brain picks up from it
  when the seat leaves.
- Every rule that steers the cast leaves a held thing alone: a leash that recycles stragglers, an
  order that puts things on an objective, a script that picks which ones attack. Each skips a thing
  `holderOf` finds a holder for, and reads the held thing's side as a member, not a puppet.

The seat's arrival point and facing are definitions per side, and every one is tested with nobody
touching the controls (The proof): a thing that comes in at a spot and heading where flying straight
on hits something is lost before the person has found the keys.

### 6. The page decides when the seat is ready

An entry may be a show: a tunnel, a launch countdown, a camera on the thing as it goes. That show is
the page's, in a look, and the server waits for it. The seat takes its thing only when its page
sends an act of its own `player` row, `board`, at the end of the show; until then the round goes on
without it. The page:

- covers the screen until its own `player` row carries the choice (`pick`), so the first frame is
  never the wrong side's view;
- picks the show from the row (one side's way in, the other's), runs it for at least its
  definition's seconds and until its models have loaded, then sends `board`;
- sends `board` again each `resend` seconds until `holding(rows)` finds the thing;
- hands the camera back (`render3d.release`) when its show is over, so the HUD, which draws only
  while the camera is the seat's, comes up.

### 7. Losing the thing: respawn at once, or choose again

Two shapes, each a few lines on the `player` row:

- **At once.** In `before`: a seat that has `boarded` and holds nothing boards again (step 5's
  "every time after"). The person is flying again on the next step.
- **By choosing.** Nothing happens until the page sends `board(<class>)`. The page puts up a screen
  while its row has `boarded` and holds nothing: a screen the game puts up, shown because the rows
  say so, with a button per class on the definition, each sending `board` with its class, and one
  that goes to the menu. `board` checks the class against the list and falls back on `pick`.

### 8. Teams, and the free-for-all

Two fields on a thing, never one: `faction`, what it is (its looks, colours, the side its model and
markings belong to), and `team`, who its friends are. Every rule that asks "friend or foe" compares
`team`: aiming, locking, the brain's choice of target, a friendly-fire check, the HUD's brackets
and radar.

- In a round of sides, `team` is the side, set when the thing is made.
- In a free-for-all, `team` is the seat's own, `p<player row id>`, written when the seat takes the
  thing, so two seats in two identical things are each other's foe. No cast is needed: the
  free-for-all scene's sim leaves out the round's kinds, its `world` turns off what the round would
  mount on the map's things (`armed: false`, read where the mounting is), and its `world.arena`
  block gives its boundary and tells the things' rule that one nobody holds ends, since its seat has
  gone.
- The free-for-all's starts are `start` actors, one per slot, each `{ slot, pos, rot }`, on a ring
  clear of everything, facing into the middle, at alternating heights. The seat's thing is made at
  its slot's start every time. A small script that writes them from the ring's middle, radius and
  rise, rerun when the arena moves, keeps them right.

### 9. The round ends: results, then everyone back to the menu

The round's own row (its rules, the state every seat shares) counts the seconds since it ended,
`overFor`. Then:

- Every page shows the results while the row says it is over, a screen the game puts up (a `ui`
  modal shown because the row says so): the title in the colour of how it went for **this seat's
  side** (won or lost, read from the row and the `player` row's side, never the thing's), what
  happened, the time, and a countdown to `resultsSeconds`. A button goes to the menu now.
- On the step `overFor` crosses `resultsSeconds`, the round's rule sends every seat still there to
  the menu: for each `player` row, `w.call(w.find('scenemanager'), 'go', p.data.conn, <menu>)`, the
  menu scene's name a definition. "Crosses" is checked as before-the-step below, after-the-step at or
  above, so it happens once.
- A seat that arrives while the results are up sees them and is sent back with the rest.

### 10. The next arrival finds a fresh round

A `suspend: true` scene keeps its rows when the last seat leaves, so without a rule the next person
walks into the ended round. The manager's table names an `enter` act for the play scene,
`enter: { kind: <round kind>, act: 'enter' }`, which core sends with each seat that enters. The act is
in the round kind's `open`, and starts the round over only when the round has been staged and the
entering seat is the only `player` row there:

- end everything the round made (the cast, its groups, what was mounted on the map's things, its
  shared-effects row) and mark what was mounted as unmounted, so it is mounted again;
- end the round's row itself, and spawn the round's row and the shared-effects row again from the
  scene's own `actors` entries, `w.world.scenemanager.actors`, so the round is staged on the next
  step exactly as the first time.

A seat that enters with others there changes nothing, so a seat sending `enter` by hand cannot reset
a round people are in.

### 11. Leaving whenever

- A pause the person opens, a `ui` modal with a `key` (Escape), with "resume" and "main menu": the
  game plays on under it, and "main menu" is a `go` to the menu like any other.
- Closing the tab ends the `player` row; step 5 hands the thing back.
- Every way back to the menu is `go` to the same definition's `menu`.

## Where each piece goes

- The menu: its own scene file and sim beside the manager's, its own kind with a look on a modal
  panel, its own `loader` with only the definitions file (`scene-flow`, step 4).
- The choice, `conn`, `boarded`, `held`: fields of the `player` prefab. `arrive`, `board` and the
  `relay`ed controls: acts of the `player` kind.
- Who takes what, the way in, respawn, the boundary: one plugin of the game's own (`building-a-plugin`),
  called by the `player` rule on its own row. Spawning a thing clear of the map's solids is a second
  one, used by both the round's arrivals and the seats'.
- The round's end and its fresh start: the round kind's own rules and its open `enter`.
- The free-for-all: its own scene, with its `start` actors and `world.arena`; it shares the kinds and
  the sim of the round scene.
- The results, the wreck and the pause screens: the HUD's (`building-the-hud`), every word and place on
  the definition.
- Every number: the definitions. Every scene name: a definition.

## The proof

Rule tests boot the manager as the server does, seat connections through `connection(manager(truth))`
and move them with real `go` messages from the menu, never by writing a `player` row by hand:

- a connection enters the menu as a plain seat, and the menu's `go` takes it to the play scene with
  its choice on its row;
- a scene whose seats are all taken leaves the seat on the menu, and the menu shows the full line
  after `full.after`;
- a seat joining a round in progress holds a thing on the step after it boards, of its side's class,
  and the count of that class and side is what it was before;
- the thing a seat holds moves by its presses and by no one else's; the step after the seat leaves
  it is the brain's again, and the round goes on for the seats still in it;
- the thing lost, the seat holds another on the next step (at once), or holds nothing until it sends
  `board`, and a class not on the list stands in for nothing;
- in the free-for-all, two seats in the same class are on two teams and one's shots hurt the other;
- for every side and every slot, a seat that boards and touches nothing stays inside the play area
  for as long as flying straight lasts and hits nothing: run it with the earlier, wrong poses and
  see it fail before trusting it passes;
- the round over, every seat is sent to the menu at `resultsSeconds` and not before; a seat that
  enters alone afterwards finds a fresh round staged, and one that joins somebody finds theirs as it
  was.

Page tests (`building-the-hud`, `proving-a-game`) show each screen and press each of its buttons.

Then Chrome, through `dev.html`: a `?scene=` that sets the manager's `entry` and writes the choice
into the `player` prefab before boot, so the testbed starts in play as the menu would have put it
there, and `window.scenes` (the `load` result) for a driver to put a thing somewhere that kills it.
Look at the menu, each side's way in, the free-for-all's pick, the wreck screen and a press on it,
the pause and its way out, and the results for each side and the return to the menu.

## What goes wrong

- The menu throws in the rewind addon when a seat leaves it: it inherited `world.predict` from the
  manager. Put `world.predict` on each play scene.
- People arrive on one spot, or fly into a wall on arrival: the way in has no per-slot spacing, or a
  pose nobody tested hands-off.
- The ended round greets the next player: no `enter` act, or one that does not check it is alone.
- The scene runs one more seat's worth of things than it should: the first board spawned a thing
  for the seat and did not end a free one.
- A seat's thing is steered off by the round's script: a rule that steers the cast did not skip
  held things.
- Both sides see "won": the results read the side from the thing (gone when it died) instead of the
  `player` row's side.
- A seat in a free-for-all cannot hurt another in the same class: hostility compares `faction`.
- Joining is refused once the round starts: a "started" flag was copied from a game that has one.
