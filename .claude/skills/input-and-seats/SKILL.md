---
name: input-and-seats
description: Use in core, or any clone of it, when a game's player controls anything. That covers keys, the mouse, a gamepad or controller, binding them in `player.client.ts` (`plugins.player.bind` or `control`), named actions in `world.player.actions`, letting the player rebind or remap keys, a controls or key-bindings screen, toggles, the stick's deadzone and key repeat. It also covers seats and players: the `player` row a seat possesses, slots, a second seat or player, where each player starts or spawns (`start` actors), what a seat may send (acts, `open`), a press drawn on the frame after the key from the page's copy (`client.html` wrapping `predict`, `possessed`, `mine`), and why the seat's own sound rides its `player` row and every other sound or effect is raised on a ledger row. It also covers a seat that plays itself (the `playtester` plugin, `playtest`).
---

# Input and seats

How a player controls a game in core: the seat and the `player` row it possesses, where the seat
starts, how its keys, mouse and gamepad become acts on that row, how a player rebinds them, how a
press reaches the server and is drawn, and a seat that plays itself. The facts are the headers of
`plugins/player/player.plugin.ts` (Actions, rebinding, Gamepads), `addons/player/player.addon.ts`,
`plugins/store/store.plugin.ts`, `plugins/ui/ui.plugin.ts`, `plugins/playtester/playtester.plugin.ts`,
`engine/engine.ts`, and the tests beside them. Load `prime-directive` too; nothing here overrides it.

Other phase skills instead:

- Making the game folder, and what each file `yarn new-game` writes is for: `starting-a-game`.
- What a kind does with the act a press reaches, its rows, definitions and `w.call`: `designing-a-kind`.
- Moving a seat to another scene, `go`, `arrive`: `scene-flow`.
- Panels, styles and the HUD in general: `building-the-hud`. This skill covers only the controls
  screen.
- What a sound plays and its cues: `sound`. This skill covers only why its kind is a ledger.
- Seats over a socket, what each seat may see (`security`, `masks`, `vision`): `going-multiplayer`.
- Proving a game plays, playtests and gyms: `proving-a-game`.

## Seats, slots and the `player` row

- A connection is one seat on one scene at a time (`addons/scenemanager/scenemanager.addon.ts`,
  `connection`). In a scene that lists the `player` plugin, `addons/player/player.addon.ts`'s `join`
  gives it the lowest slot below the scene's `seats` that no seat holds and no `player` row sits in,
  spawns a `player` row with that slot in its `seat` field, and opens the seat possessing that row.
  A scene that lists no `player` plugin, a menu, gives a plain seat with no row (`own` in the
  scenemanager addon).
- The seat possesses its `player` row, so every message the page sends names an act on that row
  (`engine/engine.ts`, `answer`: a message at any other row is refused unless that row's kind lists
  the act in `open`). The `player` row is the thing the seat plays as, the car, the gun, the hero, so
  its acts change its own fields: `move` sets the way it runs, `fire` spawns a shot from where it
  stands. What the `player` row is, and how its rule, look, acts and test are built, is
  `designing-a-seat`: the row is the thing, never a row it spawns and forwards its acts to.
- `yarn new-game`'s template still writes the seat's square as a `body` row that `player.sim.ts`
  spawns in `before` and forwards `move` to with `w.call(w.get(me.data.body), ...)`. It is folded
  into `player` before anything else (`starting-a-game`, Fold the body into the player row), and never copied.
- Every seat is sent every `player` row. The seat's own carries `mine: true`, a field no other seat
  is sent, and `possessed(rows)` (exported by the player plugin and `addons/player`) finds it among
  the rows a page holds, never `rows.find(r => r.kind === 'player')`, which is whichever seat's row
  came first. A `player.client.ts` draws the thing for every row and binds keys and moves the camera
  only for the row that is `mine`, since it is loaded for every seat's. A page running the scene
  ahead (`addons/predict`, which `client.html` always wraps) draws every row from its copy, so the
  seat's own row and every row its press makes or moves answer the key on the next frame.
  Everything of the seat's own, its place, its health, its ammo, its score, is a field of its
  `player` row, never of a row it spawns. A field only the seat itself may see is listed in the
  scene's `security` block, never moved to another row to hide it.
- The slot is not the seat's number. The `seat` an act is handed is the truth's seat number, which
  counts every seat the truth ever opened, so a seat that leaves and comes back gets a higher one. A
  rule about who is who (whose turn, which side, which colour) reads the slot off the `player` row,
  `me.data.seat`, and passes that on.
- A second seat in a scene is its `seats` raised to 2 and, where a seat stands somewhere, a second
  `start` actor, slot 1 (Where a seat starts). The seats that count are the entry scene's, the
  child's: `join` reads the child's `seats`, and the manager's `seats` in `<game>.scene.json` is
  never read. A third connection to a scene of two seats throws `no seat free: 2 declared`.
- Which links are one seat is the page's to say (`link` in `addons/scenemanager/scenemanager.addon.ts`):
  one link is one seat, and two links on one manager in one process are two seats, as
  `plugins/store/store.plugin.test.ts` makes them. The pages `yarn new-game` writes make one link
  each: `index.html` holds a truth of its own in its tab, so a second tab of it is a second game, and
  two seats on one game are two `client.html` pages against `<game>.server.ts`.

## Where a seat starts

Where a seat starts is never on `world`: no `world.pads`, `world.spawns` or `world.starts`, and no
list of places in a definition. It is a `start` actor in the scene file, one `actors` entry per slot:

- `start.sim.ts` in the game's folder is `export const start: Kind = {}`, with no rule and no drawing.
- Each entry holds the slot in `slot` and where that slot begins, `pos`, and whatever else the thing
  it becomes starts with (a `look`, a heading, a speed): `{ "is": "start", "slot": 1, "pos": [700, 270] }`.
- The seat's `player` row finds its own in `before`,
  `w.find('start', s => s.data.slot === me.data.seat)`, stands itself there once, copying the start's
  `pos` and whatever else it hands on into its own fields, and marks itself stood (`placed`): never by
  spawning a row. A respawn resets the same row's fields from its start, so the seat keeps its row id
  and its page keeps predicting it (`designing-a-seat`).
- A start is an actor because it is a place in the level, an `actors` entry like every other. A scene has as many as it has slots. A slot with no start throws
  `no start matches` from the step that seats it, and nothing catches it: on node it ends
  `<game>.server.ts` (`run` steps inside a timer), and in `index.html` the loop never asks for its
  next frame, so the game stops. What the server does with a rule's throw is built in the
  scenemanager addon (`going-multiplayer`, step 6), never caught in a game; the start the slot lacks
  is written in the scene file.

A seat that stands nowhere, a quiz's or a hand of cards', has no `start`: nothing of it is a place in
a level. Once the body is folded into `player` (`starting-a-game`), what stood the seat goes:
`start.sim.ts`, the `start` prefab, the `start` entry in `actors`, its import and name in
`<scene>.sim.ts`'s `sim`, the player row's `pos`, `placed` and the `before` that finds a start, and
the start checks of `<game>.sim.test.ts`, which is rewritten to prove what the seat does play.
`player.sim.ts` and `player.client.ts` stay: the seat's row, which is still the thing it plays as, a
hand of cards or a quiz's answer sheet, every field of it on that row, and its binding, the keys
bound to its acts.

## Binding input: `bind` and `control`

The game's `player.client.ts` hands the player plugin one table in its `setup` and holds no
listener, queue or tick of its own; its `remove` calls `plugins.player.unbind()`. The plugin listens
on the page. A key is named by its place on the keyboard (`keyOf`): `a`, `1`, `' '`, `Shift`,
`ArrowLeft`, `Escape`; a mouse button is `Mouse0` to `Mouse2`; a gamepad button is `Pad0` to `Pad16`
in the browser's standard mapping, down while the browser calls it `pressed` and its `value` is past
`world.player.deadzone` when the scene gives one, so a trigger resting a little in is not down; the left stick's sides are `PadStickLeft`, `PadStickRight`,
`PadStickUp` and `PadStickDown`, and the right stick's `PadRightStickLeft`, `PadRightStickRight`,
`PadRightStickUp` and `PadRightStickDown`, each held past `world.player.deadzone` on either avenue.
There are two avenues, side by side:

- `bind(table: Binds)` binds behaviour straight to keys: `press`, `release`, `axis`, `stick`, `hold`,
  `every`, `click`, `pointer`, `drag`, `hover`, `stroke`, `wheel`, `locked`, each keyed or listed by
  keys. Games that use it stay on it: no sweep moves them to `control`. Gamepad keys never reach
  the UI on this avenue, so a gamepad cannot move through a menu. A key in `press` sends its message
  on every keydown, the keyboard's repeats of a held key among them; a key that `release` also names
  is pressed once a hold (`onDown` and `pressed` in `plugins/player/player.plugin.ts`). So a header
  that says how often a held key acts is proven by a test that sends the key's keydown a second time,
  with `repeat: true`, before its keyup, and counts the presses the server took.
- `control(table: Controls)` binds behaviour to the scene's actions, and the scene binds keys to the
  actions, so a player can change which keys play which action and the game never knows. It is the
  way for a game that wants its player to rebind keys or change how its controls play.

A game is moved to `control` when it wants remapping, or when a gamepad must move through its
menus, which the UI hears from a pad only on `control`; never as a sweep of every game. A new game
from `yarn new-game` is on `bind`, and stays there until its person asks for either.

## Analog, and rumble

On either avenue an `axis`, a `stick` or a `hold` may be read analog: `analog: true` on its entry in
`bind`'s table, or its action named in `control`'s `analog` list (which throws on one no `axis`,
`stick` or `hold` of the table reads). Read so it sends how far each key holds it, not only whether
(`plugins/player/player.plugin.ts`, Analog): a key of the keyboard or a mouse button is 1, a gamepad
button its `value` (a trigger from where the browser calls it pressed to 1), a side of a stick how
far past the dead zone it is pushed, 0 at the dead zone and 1 at the rim. Each value is a whole number
of steps over `world.player.resolution`, a whole number above 0, so a stick held still sends nothing
however its reading wanders inside a step; a table that reads anything analog in a scene with no
`resolution` throws. The `player` row's act takes the value as data from outside the program: it
does nothing with one that is not a finite number and keeps one past its range to it.

An `axis`, `stick` or `hold` function may hand back nothing, `undefined`, and so send nothing: a
look that keeps what the right stick holds for its own camera, which no rule reads, reads it so.

`plugins.player.rumble({ strong, weak, seconds })` shakes the gamepad that last had a key go down, its
two motors 0 to 1 for `seconds`, and nothing once a key of the keyboard or a mouse button went down
after it, so a pad on the desk stays still while the player is on the keyboard. It is the page's
alone, as a camera is: a look calls it from what it reads off the rows it draws, the seat's own car's
chassis jolting say, and no message goes up.

A screen that shows what the plugin hears, a controls screen or a debug view, reads it back with
`plugins.player.pads()`, every gamepad as the last read found it (its place, `id`, family, `mapping`,
whether it was used last, each button's `pressed` and `value`, each axis before any dead zone, all
copies), and `plugins.player.held()`, every key held now by its table name. Neither is a message.

A gamepad key already down on a client's first frame is held only on a new press, as a keyboard key
held through a page's opening sends no keydown: the button that pressed a menu's button to move the
seat presses nothing in the scene it moves to.

On `control`:

- The scene names each action in `world.player.actions`, fixed for the scene, so on `world` and
  never on the player prefab: `{ "label": "Dash", "keys": [" ", "Pad0"] }`. The shape of `keys` is
  the shape of the action: one list of keys is a button, held while any of them is down; two lists
  are an axis, the keys that push it to -1 and to 1; four lists are a stick, left, right, up, down.
- The table is `bind`'s keyed by action names: `press`, `release` and `hold` name buttons, `axis`
  axes, `stick` sticks, `every` is handed whether a button action is held, `locked` names button
  actions, `drag` and `stroke` name the button action whose keys they follow; `click`, `pointer`,
  `hover` and `wheel` are as on `bind`. It throws on an action the scene does not name and on one
  whose keys are not the shape the part of the table reads.
- The sticks read the store's `player.deadzone` over `world.player.deadzone`, as on `bind`, and a
  scene whose actions hold a side of a stick and gives none throws.
- A gamepad key going down is offered to the UI (`keyDown`, then `keyUp`) before it is the game's, so
  a pad moves through the UI's menus.
- What the player chooses is the page's, never the server's: four keys of the store, which the scene
  lists before `player` in `plugins`, or `control` throws `store is listed after player`. They are
  `player.keys` (the actions rebound, each in its scene shape), `player.toggle` (button actions played
  as toggles), `player.deadzone` and `player.repeat` (seconds between presses while a `press` action
  is held; `world.player.repeat` gives the scene's, 0 when left out). A scene that lists no store
  plays its own actions and settings and changes none (`rebind` throws `the scene lists no store`).
- `bind` and `control` replace each other as the table in force; `unbind` drops either.

## Moving a game from `bind` to `control`

In order, for a game made by `yarn new-game` (`games/<game>/`, scene `main`). Moving `move` to an
action changes no act: the page sends the same messages, and `<game>.sim.test.ts` is unchanged. A new
action that does something new, `dash` here, needs its act before anything binds it: a press of an
act the `player` kind does not have is refused by the engine (`answer` in `engine/engine.ts`), so
the key does nothing and nothing says why.

1. The act first. `dash(me, w, seat)` on `player.sim.ts`, writing the player row's own fields, its
   numbers on the `player` definition in `assets/<game>.json` (`designing-a-seat`, `designing-a-kind`),
   with its test in `<game>.sim.test.ts`, and the press test, `<game>.predict.test.ts`, showing the
   dash on screen by the frame after the key (`going-multiplayer`, How it is proven).
2. `main.scene.json`: add `world.player`, the actions and the deadzone.

   ```json
   "player": {
     "actions": {
       "move": { "label": "Move", "keys": [["ArrowLeft", "a", "Pad14", "PadStickLeft"], ["ArrowRight", "d", "Pad15", "PadStickRight"], ["ArrowUp", "w", "Pad12", "PadStickUp"], ["ArrowDown", "s", "Pad13", "PadStickDown"]] },
       "dash": { "label": "Dash", "keys": [" ", "Pad0"] }
     },
     "deadzone": 0.25
   }
   ```

3. `main.scene.json`: list `store` before `player` in `plugins`, and give `world.store`, the
   starting value of each key the game reads, `{}` when it reads none of its own. The store has no
   row, and a plugin with no row has no prefab; yet `plugins/store/store.plugin.ts` reads its
   starting values off a `store` prefab today, and throws `scene lists store but has no store
   prefab` without one. So the job that uses the store moves them to `world.store` first, in one
   change, as `building-the-hud` (step 9) lists it, and then writes `world.store`. It is no pattern
   for any other plugin.
4. `player.client.ts`: `control` in place of `bind`, typed with `Controls` from
   `#plugins/player/player.plugin.ts`, for the row that is `mine` alone, beside the drawing every
   row gets:

   ```ts
   let ours = false
   export function setup(row: Row, plugins: Plugins) {
     // the square, for every seat's row
     ours = row.data.mine === true
     if (!ours) return
     plugins.player.control({
       stick: { move: (x, y) => ['move', x, y] },
       press: { dash: ['dash'] },
     } satisfies Controls)
   }
   ```

5. A game of several scenes: a child's `world` is the manager's with the child's own keys over it,
   one top-level key at a time (`child` in the scenemanager addon). `world.player` written in
   `<game>.scene.json` is every child's; a child that gives its own `player` key replaces all of it,
   its `actions`, `deadzone` and `repeat` together. The store is one
   table for every scene of the page, so an action's rebound keys follow the player into the next
   scene, and an action of the same name with keys of another shape there throws `the store's
   player.keys gives <name> keys of another shape than the scene's`.

## A controls screen

The screen that shows and changes the actions is the game's own actor on a `ui` modal, built on
the player plugin's `actions`, `listen`, `rebind`, `restore`, `conflicts`, `settings`, `configure` and
`device`, its words and places on its kind's definition. How it is designed (one line per thing the
player's thing does, named in the player's words, keys spelled out, grouped by purpose), where it
lives (the menu before play, which then lists `store` and `player`), its definition, its actor, its
fonts and fills, and its tests are the `building-a-controls-screen` skill; load it for the screen.

What the player plugin and the UI do around it, which the actor relies on and never rebuilds:

- While the modal shows anything it has the input: every key goes to the UI but `back` on a screen
  the game put up, the player plugin lets go of every key and the pointer lock each frame, and the
  seat stops. So the arrows move the focus, Space presses the focused button, and `w a s d` do
  nothing.
- The key that pressed a button (Enter, Space, `Pad0`) began the listening and is not heard by it:
  the UI listens in the capture phase and took it, and the player plugin skips a key the UI took.
- While the player plugin listens, the UI takes no key, from the keyboard or a pad: the next key,
  mouse button or gamepad button goes to `listen`'s function and nothing else, and `Escape` hands it
  `undefined`. So Escape cancels a listen and leaves the screen up; the next Escape closes it.
- `rebind(action, keys)` writes `player.keys` in the store, throws on keys of another shape, and the
  new keys play at once. `restore(action?)` gives back the scene's keys and toggle for one action,
  or with none every action's, the deadzone and the repeat. `settings()` and `configure({ toggle,
  deadzone, repeat })` read and write the rest; a deadzone is above 0 and below 1, a repeat 0 or more
  seconds, and only a button toggles.
- `device()` is `keyboard`, `xbox`, `playstation` or `pad`, what was used last, and on `control`
  only: on `bind` no gamepad key sets it. A gamepad key sets it even when the UI takes the key; a
  keyboard key the UI takes does not, so after a pad has moved the focus, arrow keys on the screen
  leave it at the pad's until a key reaches the game or a listen. A mouse button going down anywhere
  sets it back to `keyboard`, over the UI or not.
- The store is the link's table (`plugins/store/store.plugin.ts`): one per page, every scene of the
  page reads it, and no server and no other page sees it. Nothing in core writes it to the browser's
  storage, so a choice lasts while the page is open and a reload starts from the scene's keys.

## Mouse and gamepad, briefly

- A mouse button is a key in any table. `click` is asked for a message from where the page was
  clicked, in the canvas's pixels; `pointer` takes the pointer lock on a click and sends the pixels
  moved each frame; `locked` names keys the game hears only under the lock; `drag`, `hover`,
  `stroke` and `wheel` are in the header. A click over something on the UI that takes the pointer is
  the UI's and sends nothing.
- A key, a mouse button or a call on `plugins.player` goes up the moment it happens. What is read
  once a frame, the gamepads, the repeat, `every`, and what the mouse, a drag, the hover, a stroke and
  the wheel added up to, goes up in the player plugin's `input`, which `index.html`'s and
  `client.html`'s loops call (`page.input()`) before the frame's steps, `index.html`'s of the truth
  and `client.html`'s of the copy `page.frame(now)` runs, so the steps run that frame take it; a page
  that calls no `input` reads it in the plugin's `tick` (the header, When).
- Every connected gamepad is read each frame. Its keys work in `press`,
  `axis`, `stick`, `hold`, `every` and `locked` (the header, Gamepads), on either avenue. On `bind` a
  gamepad button coming up runs no `release`; `release` hears a pad only on `control`. `stroke`
  begins only from a mouse button. A pad key has no repeat of its own (on `control`, `player.repeat`
  presses a held action again from a pad as from a key). A key or mouse button a table names has its
  browser default cancelled, except under Control, Command or Alt.

## Presses and ledgers

A press, a key's message or any call on `plugins.player` that is not one of the plugin's own
functions, is sent up the wire at the seat's `player` row (`wire.send`). Where it shows depends on
the page:

- `index.html`: the truth is in the tab, and the loop's next step takes the press, so it is drawn on
  the next frame, with no lag.
- `client.html`: the page wraps its link in `predict`, and every scene a seat plays in gives
  `world.predict`. The page's copy of the scene answers the press on the step it is about to run, and
  the view draws every row from that copy: the press, and everything it makes or moves, is on screen
  the frame after the key, at any lag.
- A scene that gives no `world.predict`, a title or a menu: the page draws the last packet's rows,
  and a press shows when the packet carrying what the server did with it arrives. No scene a seat
  plays in is left so.

A sound the seat's own thing makes, its jump, its shot, its hurt, is raised `from` its `player` row,
and rides on that row's `voiced` list, so it is heard on the frame after the key with the row
(`plugins/audio/audio.sim.ts`, `sound`). A hit flash reads the row's health, a camera follows the
row's place: none of it waits on another row (prime directive, Row or local).

Every other event goes on a ledger: a row that only appends events for the page to play or draw
once, a sound on `audio`'s, an effect on `particle3d`'s or `particle2d`'s, a launched round on
`volley3d`'s or `volley2d`'s. A value a rule sets for one step and clears is missed whenever two
packets land in one frame, since the page draws only the last; an entry stays on the ledger longer
than a step (audio's for `world.audio.hold` seconds, and a `voiced` entry as long), and each page
plays or draws it once by its id (`plugins/audio/audio.plugin.ts`: each ledger id plays exactly
once). A new plugin whose row only appends events is a ledger.

## Open acts

A kind may list acts any seat may send at its rows directly, `open: ['go']` on the `Kind`
(`engine/engine.ts`). The page sends one with `plugins.wire.send(row.id, act, ...args)`, as the
scenemanager plugin's `go` and the chat plugin's `say` do. It is for what any
seat may ask of a row it does not possess: a seat moving on (`plugins/scenemanager/scenemanager.sim.ts`),
skipping a cutscene (`plugins/cutscene/cutscene.sim.ts`), a menu scene's plain seat that has no
`player` row. A game's own shared row is reached through the seat's `player` row and its acts, with
the slot (the player addon header); a kind reached only that way lists no `open`, and `w.call` runs
its acts without the check because the `player` act already passed one. The other way round, a seat
may send any act its own `player` row has, so an act there that other kinds call to change it,
`hurt`, `award`, `heal`, is one the seat could send itself: it returns at once when a seat sent it
(`seat >= 0`; a hook passes `-1`), or it is a plain function of a game plugin that other kinds call
(`designing-a-seat`, Acts a seat can send). Every act's arguments come from outside the program, so
an act checks them and does nothing with a bad one, as the folded new game's `player` `move` checks
for two finite numbers and the scenemanager's `go` refuses a scene it has not got.

## A seat that plays itself

Two ways, both pressing acts and not keys, so a game on `control` plays alike:

- On the page, the `playtester` plugin: the scene lists it, and an actor's `setup` hands it the
  player and a think, `plugins.playtester.play(plugins.player, rows => [...] | undefined)`. Each frame
  the think reads the rows this seat sees and names an act and its arguments, `['move', 1, 0]`, which
  goes through the player plugin as a press does (`plugins/playtester/playtester.plugin.test.ts`).
- On the server, `playtest(truth, think)` from `addons/player/player.addon.ts`: a seat the server
  drives itself with no page (`addons/player/player.addon.test.ts`, two playtesters on two seats).

How a game is proven with them is `proving-a-game`.

## What goes wrong

- Every game moved to `control` because input mapping sounds good everywhere. A game moves when its
  person wants rebinding; `bind` stays for the rest.
- Rebound keys put on a row, the player prefab, or sent to the server. They are the store's, the
  page's own table; `rebind` writes them there.
- Actions or the deadzone written on the `player` prefab. They are fixed for the scene, so
  `world.player`, which both avenues read; a `deadzone` on the prefab is read by nothing.
- A trigger or a stick bound as a plain `axis` or `hold` where the act takes a fraction: it sends
  only whole ways, 1 for the lightest squeeze. It is read analog, with `world.player.resolution`.
- The right stick's look sent up the wire for a camera only the page moves. Its function keeps the
  value and hands back `undefined`.
- `store` listed after `player`: `control` throws `store is listed after player`.
- A `store` prefab written so the store runs. The store's starting values are `world.store`, and the
  job that uses the store makes that move first (step 3 of Moving a game from `bind` to `control`).
- An action bound in `player.client.ts` before its act is on `player.sim.ts`: the engine refuses
  every press of it, and the key does nothing with nothing said. The act comes first.
- A child scene given `world.player: { "deadzone": 0.3 }` alone, which drops the manager's actions
  for that scene.
- The controls screen built inside `player.client.ts`, or as a plugin. It is a kind of its own, the
  game's actor, `controls.sim.ts` and `controls.client.ts`, with its numbers on its definition.
- Places, sizes or words of the screen written in the actor's code. They are its definition.
- A button sized by guess. Nothing measures text; size it in the definition for its longest label,
  and look at it in Chrome.
- An act's `seat` taken for the slot. Who is who is `me.data.seat` on the `player` row.
- Where a seat starts put on `world` or in a definition. It is a `start` actor per slot.
- A listener, a key table or a readout added to `index.html`. A page mounts things; a key is the
  player plugin's, bound by the game's actor. A shortcut to try something is `dev.html`'s alone.
- `world.ui.keys` written into a scene with no modal and no panel a key opens, where nothing reads
  it.
- A start, a `pos`, a `placed` and their checks kept for a seat that stands nowhere, a quiz's or a
  hand of cards'. They go; `player.sim.ts` and `player.client.ts` stay (Where a seat starts).
- The `body` that `yarn new-game` writes kept, or copied as the model for a car, a gun or a hero: a
  row the `player` row spawns and forwards its acts to. Fold it into `player` (`starting-a-game`).
- The seat's own health, ammo or score kept on a row the `player` row spawns, or moved there to hide
  it from the other seats. It is a field of the `player` row, and a private one is listed in
  `security`.
- Both seats' keys driving one thing: `player.client.ts` binds for every row. It binds only for the
  row that is `mine`.
- No seat sees the others: `player.client.ts` draws only for `mine`. It draws for every row.
- A seat's HUD or camera on another seat's thing: it found its row with
  `rows.find(r => r.kind === 'player')`. It is `possessed(rows)`.
- A seat that gives itself lives or points: an act on the `player` row that other kinds call to
  change it, with no refusal of a seat (Open acts).
- A test that steps a few frames and then reads the rows, or reads them against a range of steps. It
  pins the step a press lands on.
- The pad keys left out of `world.ui.keys` on a screen that shows or rebinds pad keys: a pad can
  neither reach the screen nor move through it.

## How it is proven

Each test sits beside the file it tests, is a `.test.ts` (node), and is run alone with
`yarn vitest run <file>`.

- The rule, server side: `games/<game>/<game>.sim.test.ts`, as `yarn new-game` writes it: boot the
  manager, `load`, make a seat with `connection`, send `seat.take({ scene, seat, msg: { seq, n, id,
  action, args } })` at the seat's `player` row, step, and read what the kind wrote off the scene's
  rows. A new act (`dash`) gets its test here. Moving to `control` changes nothing in it.
- A second seat, in the same file: a `connection` on the manager for each of the scene's `seats`;
  their `player` rows hold the slots from 0 up, and each stands on its slot's start; each seat is
  sent every `player` row, its own the one that is `mine` (`possessed`, from
  `#addons/player/player.addon.ts`); one more `connection`
  throws `no seat free: <seats> declared`; after one seat's `close()` and a step, its `player` row is
  gone and the other seats' remain. Every number is the scene file's: the seats, and so the slots,
  are read off the scene, never typed. A scene of more than one seat is played over a socket, so it
  also gets `going-multiplayer`'s server test, `<game>.server.test.ts`.

  ```ts
  const seats = room.scene.seats!
  const heard = Array.from({ length: seats }, () => [] as Down[])
  const tabs = heard.map(h => connection(manager(truth), d => h.push(d)))
  truth.step(DT)
  const players = room.rows.filter(r => r.kind === 'player')
  expect(players.map(p => p.data.seat)).toEqual(tabs.map((_, slot) => slot))
  for (const p of players) {
    const start = room.rows.find(r => r.kind === 'start' && r.data.slot === p.data.seat)!
    expect(p.data.pos).toEqual(start.data.pos)
  }
  for (const [slot, h] of heard.entries()) {
    const rows = h.at(-1)!.packet.rows
    expect(rows.filter(r => r.kind === 'player').map(r => r.id)).toEqual(players.map(p => p.id))
    expect(possessed(rows)!.data.seat).toBe(slot)
  }
  expect(() => connection(manager(truth), () => {})).toThrow(`no seat free: ${seats} declared`)
  tabs[0].close()
  truth.step(DT)
  expect(room.rows.filter(r => r.kind === 'player').map(r => r.id)).toEqual(players.slice(1).map(p => p.id))
  for (const t of tabs.slice(1)) t.close()
  ```
- The seat's keys, on a page: `games/<game>/player.client.test.ts`. Boot and `load` the manager as
  `index.html` does, make the page with `view(link(loopback(accept(manager(truth)))), file,
  import.meta.url, mount)`, step the manager and `await` the view's `frame()` once a step, hand key
  events and a gamepad to the page, and read the server's rows: each action from each of its keys,
  the d-pad, the stick inside and past `world.player.deadzone`, a button action's act, and how often
  a held key acts, its keydown sent again with `repeat: true`. It pins the step a press lands on: the
  row as it was on the step before, and changed on that step, never "within a few steps". A test of
  `player.repeat` above 0 holds the page's clock with `vi.spyOn(performance, 'now')`, moved a step
  with each step it takes, since the player plugin times the repeat by it. With two seats it also
  shows the keys of one page move only its own `player` row: the look binds for `mine` alone. What
  this test proves is the binding and the step the truth takes each press on; it says nothing of
  what the player sees on `client.html`.
- What a press puts on screen, on `client.html`: `games/<game>/<game>.predict.test.ts`, the press
  test (`designing-a-seat`, The proof; written as `going-multiplayer`, How it is proven, gives it).
  Predicting pages on the game's server over loopbacks, a clean wire and bad ones, a press every
  frame, and on every frame the seat's own `player` row the page draws,
  `possessed(page.client.plugins.wire.rows)`, has taken every press sent up to the frame before.
  A game whose seat controls anything has it; a test that only reads the server's rows never sees
  what the page draws.
- Every test that presses a key the player plugin handles, the controls screen's below and any other
  page test, or clicks something that sends through it, a mouse button a table binds or a UI button
  whose tap calls `plugins.player.<act>()`, pins the step each press lands on; none steps a count of
  frames, `step(2)` say, and reads the rows within a few steps.
- The game replays: the scene's test plays it under the recorder and seeks back (`proving-a-game`, A
  kind's test, and a scene's).
- The controls screen, on a page: `games/<game>/controls.client.test.ts`, as
  `building-a-controls-screen` (How it is proven) lists it.

What those page tests need, all of it learned writing them:

```ts
// The page's listeners by type and phase. The UI listens in the capture phase and the player plugin
// asks it `took(e)`, so a key reaches the capture listeners first, as in a browser.
type On = { type: string; f: (e: unknown) => void; capture: boolean }
const page: On[] = []
vi.stubGlobal('addEventListener', (type: string, f: (e: unknown) => void, o?: unknown) => { page.push({ type, f, capture: o === true }) })
vi.stubGlobal('removeEventListener', (type: string, f: (e: unknown) => void, o?: unknown) => {
  const i = page.findIndex(x => x.type === type && x.f === f && x.capture === (o === true))
  if (i >= 0) page.splice(i, 1)
})
// `repeat` true is the keyboard's repeat of a key held down.
const key = (type: 'keydown' | 'keyup', k: string, repeat = false) => {
  const e = { code: keyCode(k), key: k, repeat, preventDefault() {} } // keyCode from the player plugin
  for (const capture of [true, false]) for (const o of page.filter(o => o.type === type && o.capture === capture)) o.f(e)
}
// One gamepad, read by the player plugin each frame.
const pad = { connected: true, id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0] }
vi.stubGlobal('navigator', { getGamepads: () => [pad] })

// The UI listens for keys only once it has a canvas. `mount` would ask PixiJS for a renderer, so the
// test hands the UI a canvas stand-in directly, as the player plugin's test sets `render3d.canvas`.
const tab = view(link(loopback(accept(manager(truth)))), file as Scene, import.meta.url, me => {
  me.plugins.ui.canvas = { style: {}, addEventListener() {}, removeEventListener() {}, remove() {} }
})
```

The other route lets `mount` run as `index.html` runs it: fake PixiJS's renderer with
`vi.mock('pixi.js', …)` replacing `autoDetectRenderer` by a stand-in that keeps its size and draws
nothing, as `plugins/ui/ui.plugin.test.ts` does, stub `devicePixelRatio` (`vi.stubGlobal`), and mount
a canvas stand-in (`width`, `height`, `style`, `addEventListener`, `removeEventListener`, `remove`)
on render2d and on `ui` in the view's `mount`. The keys then reach the seat as they do on a page.

On this page, as on `index.html`, the truth is in the test's process: a key pressed between frames
is in the truth's inbox the moment it goes down, and its next step answers it, so that step is
known: the test reads the row before that step, unchanged, and after it, changed. On `client.html`
the page's copy answers it on the step it is about to run, which the press test measures. Close
every view after its test (`tab.close()`), which unbinds the player and the UI from the page's
listeners.

What is played: `yarn dev`, then the game at `localhost:5173/games/<game>/index.html`. Move with every key of each action; open the screen with its
key; rebind a part; look that every label fits its button and the conflicts line names a shared key;
play the new key; Restore. With a gamepad at hand, move through the screen with it and rebind a pad
key. The screen is looked at in Chrome closed, open, listening and showing a conflict, a screenshot of
each read for every line standing inside its background and every label inside its button; the work
is not done until what those shots showed is reported.

A second seat is played against the server, `yarn serve <game>`, with `client.html` open twice, at
`localhost:5173/games/<game>/client.html`. Chrome pauses
`requestAnimationFrame` in a background tab, so of two such tabs in one window only the one in front
plays (the scenemanager header): open them in two windows side by side. In each, a key moves that
seat's own thing on the next frame, and the other seat's thing moves as its keys are pressed.

## Questions never asked

- Can where each seat starts go on `world`, as `pads` or `spawns`? No: a `start` actor per slot,
  which the seat's `player` finds by `slot`.
- Should every game move to `control` so input mapping is everywhere? No: a game moves when it wants
  its player to rebind, and `bind` stays for the rest.
- Can a game's rebound keys go on a row or be sent to the server? No: they are the store's, the page's.
- Can the actions or the deadzone go on the player prefab? No: `world.player.actions` and
  `world.player.deadzone`, fixed for the scene.
- Can the controls screen's numbers go in its code? No: its kind's definition.
- Should the page listen for this key? No: the player plugin does, and the game's actor binds it.
- Can the car, the gun or the hero be a row the `player` row spawns, as the new game's `body` is? No:
  it is the `player` row (`designing-a-seat`).
- Can a seat's own score or health live on another row? No: a field of its `player` row, listed in
  `security` when only it may read it.
- Is a round trip of lag on anything a press moves a fact of the network? No: on `client.html` every
  row is drawn from the copy, on the frame after the key.
- Do you want the full version? Always.

Ask the person making the game what its controls should be: which actions there are, their default
keys, whether the player may rebind them. That is content, and it is theirs.
