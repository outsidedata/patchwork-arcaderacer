---
name: building-the-hud
description: Use in core, or any clone of it, when drawing anything over the game - a score, health, lives, ammo, a timer, a health bar or nameplate over a thing, a minimap, an inventory, a menu, a pause or game-over screen, a dialog or modal, a settings screen for the volume or mute, chat and party frames, a cutscene's bars and lines. That covers the `ui` plugin (`world.ui` panels, keys and styles, `show`, `button`, `bar`, `iris`, `pin`, `surface`, modals, `open`/`dismiss`/`opened`, focus), the `store` plugin for values only the page keeps, a picture the HUD shows (`"for": "ui"`), reading what the HUD shows off the rows the seat is sent (the seat's own score, health, ammo and lives off its own `player` row, `possessed` or `mine`, drawn the frame after the key on a page that runs ahead), and testing a HUD on a page in node. Also use it when the HUD does not show, throws `ui has not ticked yet` or `holds a child show did not hand out`, a menu takes no keys, or Escape will not leave a pause screen.
---

# Building the HUD

Everything drawn over the game is the `ui` plugin's (`plugins/ui/ui.plugin.ts`): a PixiJS stage of its
own, drawn by its own renderer on a transparent canvas the page lays over the game's, the same size.
A score, a health bar, a pause screen and a chat log are each a thing an actor or a plugin shows on one
of its panels, every frame it wants it shown. What the HUD shows comes off the rows the seat is sent.
What only the page keeps, a volume or a mute, comes off the `store` (`plugins/store/store.plugin.ts`).
The whole of both is in the headers of those two files and the tests beside them,
`plugins/ui/ui.plugin.test.ts` and `plugins/store/store.plugin.test.ts`. The engine is frozen and the
`ui` and `store` plugins are not changed for a game: a HUD is the game's own content.

## When it applies

It applies to whatever is drawn over the game for the player to read or press: readouts, bars,
icons, a minimap, a thing pinned over a thing in the world, a menu the player opens, a screen the game
puts up, a settings screen of values only the page keeps, and the pictures any of them draw. Other
skills instead:

- A controls or key-bindings screen, and every key a seat plays with: `input-and-seats`. That screen
  is built the way this skill builds a screen, on a `ui` modal, with the player plugin's `actions`,
  `listen`, `rebind`, `restore`, `conflicts`, `settings`, `configure` and `device`.
- The rule that makes the value the HUD shows, the kind that holds it, and where each of its numbers
  goes: `designing-a-kind`.
- What the volume does to the sound, the cues and the ledger: `sound`.
- Getting a picture, a sheet or a font into the game: `bringing-in-art`. This skill says only what is
  different when the HUD draws it.
- Drawing in the game's world, on render2d's or render3d's stage: `writing-the-look`.
- A title screen or menu that is a scene of its own, and moving between scenes: `scene-flow`.
- The editor's panels: `building-an-extension`. The editor's design system is not this (below).
- Chat and parties across a network, and keeping each seat's lines to it: `going-multiplayer`.
- Writing a plugin of the game's own: `building-a-plugin`.
- Tests and playing in general: `proving-a-game`.

## Where each piece goes

- The value shown changes while the game runs, so it is a field of a row. Which row is the prime
  directive's first question, Row or local:
  - The seat's own state, its health, ammo, score, lives, laps, progress, is a field of its `player`
    row, since the `player` row is the thing the seat plays as (`designing-a-seat`). Every seat is sent
    every `player` row, and a page running the scene ahead draws its own from the copy that runs ahead
    (`addons/predict`), so a readout of it changes on the frame after the press that changed it. A
    score only its own seat may read is listed in the scene's `security` block,
    `{ "player": { "score": "me" } }` with `masks: []` on the player prefab, never moved to another
    row to hide it. A seat's own state is never kept on a row of another kind, a tally the `player`
    row spawns say (`designing-a-seat`).
  - A value the seats share, a team's score, the round's clock, is a kind of its own with one `actors`
    entry. A new system is a new kind, never a field added to a kind that exists for another reason
    (`designing-a-kind`).
  - A value carried in from the last scene arrives on the `player` row as `arrive`, which writes it
    onto the row's own field, `score` say, where it goes on changing (`scene-flow`, What crosses a
    move).
  - What only this page feels, a flash as the seat's own health drops, a number counting up to the
    score, is local: the look keeps what it last drew in its module and works the flash out from the
    row's field, and nothing of it is a row.
- A value only the page uses and the server never reads, the volume, the mute, a brightness, a theme,
  is a key of the store. The store is the page's: the server never reads it, writes it or is sent it.
- How one of the game's things looks, its readout included, is that kind's actor, `<kind>.client.ts`
  in the game's folder. A screen, a pause, a game over, a controls screen, is a kind of its own with
  one `actors` entry, whose look draws it: a screen the game puts up is up while its row says so, and
  a menu the player opens while `ui.opened` says so (below). A HUD that is a system of the game's,
  drawn from the rows of several of its kinds, is a plugin of the game's own (A HUD plugin of the
  game's own, below). Two screens that would be one code under two definitions, a title card and a
  game-over card, are one shared look of such a plugin, written once in its browser half, which draws
  the rows of both kinds, each by its own definition (`designing-a-kind`, Shared code and systems);
  never a second `<kind>.client.ts` copied from the first. Never logic in a page, and never one actor
  importing another.
- Where each panel sits, the keys a menu moves by, and the text and button styles are the ui's fixed
  numbers: `world.ui` in the scene file. The ui has no row, and `world.ui` is read off the scene, never
  sent. A `world.ui` in the manager's `<game>.scene.json` is every scene's until a scene gives its own.
- Every place and size inside a panel, every word a panel shows (a title, a button's label), and any
  step or range a screen uses, is on the definition of the kind whose look draws it, its entry in
  `assets/<game>.json`, read with `def(plugins.wire, row.kind)` (`plugins/loader/loader.sim.ts`). So are the angle a ring or an arc starts at, a cooldown
  sweeping from the top say, which is a knob and not a direction, and the order of a line's fields and
  the gaps between them, spaces in a string among them: a line of several values is written on the
  definition whole, each field named in braces where the look fills it in. A thing centred in its
  panel is placed like any other: its x on the definition as well as its y, and the point of it that
  stands there, a `Text`'s `anchor`, on the definition too, never an x worked out in the look from the
  panel's width. The panel's size is `world.ui`'s and a place inside it the definition's, so a look
  that halves the one to get the other splits one place across two files. A look writes no number of
  its own.
- A picture the HUD shows is an entry of the scene's loader catalogue, `world.loader.assets`, with
  `"for": "ui"`. A surface with a context of its own, the UI's over the game's, is decoded for
  separately: a file both the game and the HUD draw is an entry for each, with one url. Under render3d
  the game's entry is a three.js texture, which the ui's PixiJS cannot draw. Under render2d both
  entries go through PixiJS's `Assets.load`, which keeps one texture per url, so in the page the two
  come back as one texture (`plugins/loader/loader.plugin.ts`); the scene still gives both.
- The page: nothing. `index.html` and `client.html` as `yarn new-game` writes them already make a
  canvas for `ui` over the game's whenever the scene lists it (the `MOUNT` lines of
  `extensions/games/games.route.ts`), and the editor's game view does the same (`editor/session.ts`).
  `client.html` wraps its link in `predict` (the prime directive's The pages), which the template does
  not write yet; a game's `client.html` is put in that shape before its HUD is checked over a network.
  A page mounts things: no rule, number, readout, listener or scene name. `dev.html`, the testbed, is
  the one page that may add readouts of its own while something is being found out, and nothing of it
  reaches the game.

## Reading what the HUD shows

A look is handed its own row each frame, and `plugins.wire.rows` holds every row the seat was sent.
The HUD can only show what the seat is sent:

- Every `player` row is sent to every seat (`addons/player/player.addon.ts`), so its look runs on every
  page once per seat, and a value on it is seen by every seat unless the scene's `security` block
  lists it. The seat's own is the one that carries `mine: true`, a field no other seat is sent.
  `player.client.ts` draws the seat's own readouts behind `if (row.data.mine)`; any other kind's look
  or a plugin finds the seat's own row with `possessed(plugins.wire.rows)`, imported from
  `#plugins/player/player.plugin.ts`, never with `rows.find(r => r.kind === 'player')`, which is
  whichever seat's row came first. A scoreboard that draws every seat places each `player` row by its
  own fields.
- On a page that runs the scene ahead (`client.html`, wrapping `predict`), every row is the copy's,
  so a readout of anything a press changed shows it the frame after the key.
- Under a `security` block, a field the seat was not sent is not a key of the row's `data` at all, so
  a look that reads one tests for it with `in`.
- Under `interest` a seat is sent only the rows near it, and under `vision` only what its team sees
  (`addons/interest/interest.addon.ts`, `addons/vision/vision.addon.ts`). A minimap drawn from
  `plugins.wire.rows` shows those rows and no others.
- A value a rule sets for one step and clears is missed whenever two packets land in one frame. The
  HUD's answer to the seat's own thing is read off the seat's own `player` row as its fields change: a
  hit flash is the row's `health` lower than the look last saw it, a shot's kick is `ammo` lower, and
  a sound of it is raised `from` the row and rides its `voiced` list (`sound`). An event of another
  kind's row the page shows once is raised on a ledger (`designing-a-kind`, `sound`).

## What the ui plugin does

`world.ui` has three tables:

```json
"ui": {
  "panels": {
    "hud": { "anchor": "top-left", "at": [16, 16], "size": [200, 24] },
    "pause": { "anchor": "center", "size": [320, 200], "modal": true, "layer": 1, "backdrop": { "color": 0, "alpha": 0.6 } }
  },
  "keys": { "up": "ArrowUp", "down": "ArrowDown", "left": "ArrowLeft", "right": "ArrowRight", "press": ["Enter", " "], "back": "Escape" },
  "styles": {
    "score": { "fontFamily": "monospace", "fontSize": 20, "fill": 16777215, "stroke": { "color": 0, "width": 3, "join": "round" } },
    "title": { "fontFamily": "monospace", "fontSize": 28, "fill": 16777215 },
    "button": { "size": [64, 32], "radius": 4, "fill": { "color": 3355443 }, "focus": { "color": 7829367 }, "text": { "fontFamily": "monospace", "fontSize": 16, "fill": 16777215 } },
    "wide": { "size": [136, 32], "radius": 4, "fill": { "color": 3355443 }, "focus": { "color": 7829367 }, "text": { "fontFamily": "monospace", "fontSize": 16, "fill": 16777215 } },
    "volume": { "size": [200, 12], "edge": 1, "frame": { "color": 0 }, "track": { "color": 3355443 }, "fill": { "color": 15057223 }, "muted": { "color": 7829367 } }
  }
}
```

- A panel is a PIXI.Container placed by its entry: `anchor` is a point of the canvas and the same
  point of the panel (`top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`,
  `bottom`, `bottom-right`, and any other throws), `at` moves it that many pixels, `size` is its box,
  `clip` hides what is drawn outside the box (and throws without a `size`), `layer` draws it over every
  panel of a lower layer, and of two on one layer the one listed later is drawn over. `scale` draws the
  panel that many canvas pixels to each of its own. `modal`, `backdrop`, `key` and `group` are below,
  and `surface`'s `screen`. A panel is placed again by its anchor when the canvas changes size.
- `keys` names, each as one key or a list, the keys that move the focus `up`, `down`, `left` and
  `right`, `press` the focused thing, and go `back` out of a modal. A key is named by its place on the
  keyboard, as the player plugin's `keyOf` names it (`a`, `' '`, `Enter`, `Escape`, `ArrowUp`), and a
  gamepad's (`Pad0` and on) reach the ui when the player plugin plays by actions (`control`). A scene
  with a modal names all six: a key pressed while a modal is up throws `world.ui has no keys.<what>`
  when the table lacks one.
- `style(name)` hands back a copy of one of `styles`, an options object passed as it is to PixiJS or
  to `button` and `bar`. A style may carry more than they read, as `volume` above carries the bar's
  `fill` and `muted` colours for the look to pick from.
- A text style's outline, `stroke`, always carries `"join": "round"`, as `score` above does. PixiJS
  draws it with the canvas's `strokeText`, whose corners are mitred by default: at every sharp point
  of a glyph (the tips of W, V, A, M and 1, a serif's ends) the outline runs out up to 10 times its
  width, and a 3 px outline grows spikes all round the words. A round join keeps the outline on the
  glyph.

An actor puts a thing on a panel with `ui.show(panel, key, make)` in its `tick`, every frame it wants
the thing shown. `make` runs the first time and the same object comes back every frame after, for the
actor to write this frame's values on. After a frame in which nobody showed it, the thing is destroyed
with its children and its Graphics contexts; a texture it draws is the loader's and stays. So a row
that ends takes its HUD with it, a thing drawn only sometimes is shown behind an `if`, and nothing is
torn down in `remove`. A key shown twice in one frame throws `ui showed <panel> <key> twice in one
frame`, and a child put on a panel any other way throws `ui panel <name> holds a child show did not
hand out` at the end of the frame. The key is the thing's PixiJS `label`, so a test reads it back with
`ui.panel(name).getChildByLabel(key)`.

What an actor draws with: plain PixiJS off `ui.PIXI` (`Text`, `BitmapText`, `Sprite`, `Graphics`,
`Container`, PixiJS's pointer events), and three pieces. `button(options)` is a Container of a
background and a label centred on it, hit as one thing, filled with `focus` while focused and `fill`
otherwise, its label a `BitmapText` with `bitmap`; what it does is `.on('pointertap', ...)`, which hands
the button back. `bar(options)` is a track with a frame round it, and `set(k, fill)` fills `k` of it,
0 to 1, from the left. `iris(options)` covers a box but for a circle, `set(x, y, r)`, cut a pixel row
at a time, the circle a screen change closes on. No layout measures text: node cannot measure PixiJS
text, so every column and place is a number on a definition.

`ui.project(point)` is a world point's canvas point through the scene's renderer, render3d's or
render2d's. `ui.pin(thing, point)` puts a shown thing at a world point's canvas point once every actor
has ticked, so it is placed by the camera the frame is drawn with, and hides it while the point is
behind the camera: a nameplate or a health bar over a head, shown and pinned by the look of the row
whose head it is.

`ui.surface(name)`, asked in a frame, draws that panel for the frame on a canvas a 3D renderer reads
as a picture, a screen inside a cockpit, instead of over the game. Its `screen` is the colour under it,
and a frame that does not ask puts the panel back in its corner. Asked of a panel with no `size` it
throws `ui panel <name> is drawn on a surface but has no size`, and of a modal `ui panel <name> is a
modal, which is never drawn on a surface`.

The player plugin asks the ui first: a click on something on the UI that takes the pointer (a button,
anything with `eventMode` `static`) is the UI's and is sent nowhere, and a key the UI took is not a
game key.

The order:

- The ui reads `world.ui` once it has ticked. An actor's `tick` runs after every plugin's `tick`, so a
  look shows things in its `tick`, wherever `ui` stands in the scene's `plugins`. `ui.show` in `setup`
  never works (`engine/browser.ts`): a row in the first packet is set up before any plugin has ticked,
  and `ui` throws `ui has not ticked yet`; a row born later is set up in the same frame, before the
  plugins tick, so the `tick` that shows the same key that frame throws `ui showed <panel> <key> twice
  in one frame`, and a thing shown in `setup` alone is drawn that one frame and destroyed at the end of
  the next. `store.get` in `setup` throws `store has not ticked yet` for a row in the first packet and
  works for a row born later; a look reads the store in its `tick` too.
- A plugin that shows things in its `afterTick` is listed before `ui`, whose `afterTick` destroys what
  nobody showed and draws; chat, party and cutscene throw when listed after it. One that shows in its
  `tick` is listed after `ui`. The `local` plugin ticks its actors in its own `tick`, so a local actor
  that shows things needs `local` after `ui`. A game's own plugin ticks at `shipped`'s place in the
  list, so `shipped` stands where that plugin would (below).

With no canvas, as in a node test or for a bot, the ui shows, destroys, places and hit-tests the same
things and draws and listens for nothing. It listens for keys and the pointer from its first tick
after the page gave it a canvas.

## Menus the player opens, and screens the game puts up

A panel whose entry says `modal` has the input while it shows anything. A see-through backdrop the
size of the canvas lies under it, so every click lands on the modal; every key from the keyboard goes
to the UI but `back` on a screen the game puts up (below); no gamepad key reaches the game at all
(below); and the player plugin, which asks `ui.modal()` each frame, lets go of every key the game held
and of the pointer lock, so a seat's `player` row walking when the screen came up stops. Of two modals showing
things, the one on the higher layer has the input, and of two on one layer the one `world.ui` lists
later. When a modal takes the input the focus goes to the first interactive thing on it, in the order
its things were first shown, so the thing to focus first is shown first; when a modal over it closes
and it has the input again, the focus goes back to what it had focused. `up`, `down`, `left` and
`right` move the focus to the nearest interactive thing that way and `press` taps the focused one, as
a click does. A key already held as it came up, and every repeat, does nothing until it is let go. The
focus and press keys act only on a modal, so the buttons of a panel that is not one answer the pointer
only.

There are two kinds of modal, and which one a screen is decides who takes it down:

- A menu the player opens. Its entry names a `key`, which opens it when no modal has the input; `back`
  or its own key closes it; `ui.open(name)`, `ui.dismiss(name)` and `ui.opened(name)` do the same from
  code; of the panels naming one `group`, one is open at a time. Its look shows it behind
  `if (ui.opened(name))`. What is open is the page's alone: the server never hears of it, the game plays
  on under it, and a scene the seat moves to starts with none open. An inventory, a map, an options
  menu the game does not stop for. Its entry says `modal` too: `back` and the panel's key close only
  the modal that has the input, so on a panel with a `key` and no `modal` a second press of the key
  leaves it open, `back` does nothing, and only `dismiss` or opening another of its `group` closes it.
- A screen the game puts up. Its look shows it because a row says so, `if (row.data.on)`, and it goes
  the frame the row says otherwise. A pause the server holds, a game over, a dialog, party's invite.
  On it `back` is not the UI's: the UI leaves that key alone, the player plugin hears it as a game key,
  and a game that binds the same key to the act that clears the row backs out of the screen with it.
  The panel's own `key` does nothing there. Only a key from the keyboard gets through. While any modal
  has the input the player plugin presses no gamepad key, under `bind` or `control`
  (`plugins/player/player.plugin.ts`, Gamepads), so a pad button named in `world.ui`'s `back` and bound
  to the act takes the screen down from no pad. Under `control` a pad's keys are offered to the UI, so
  a pad moves the focus to a button on the screen and presses it; under `bind` a pad does nothing on a
  modal. A game that wants a pad button to back out of its screen first builds that in
  `plugins/player`, tested in `plugins/player/player.plugin.test.ts`, and then binds it.

A pause that stops the game, or anything every seat must see, is a screen the game puts up. A menu the
player looks at while the game goes on is one the player opens.

## A HUD plugin of the game's own

A HUD drawn from the rows of several of the game's kinds, a status bar of the seat's own `player` row's
health and ammo beside the round's clock and the boss's health, or a minimap of every `player` row and
door, is a plugin of the game's own: a system
of one game's (`plugins/shipped/shipped.plugin.ts`, and the prime directive's third home question).

- Its browser half is `games/<game>/plugins/<name>/<name>.plugin.ts`, exporting `export function
  <name>()`, with no arguments, which `shipped` calls once per client and which hands back what the
  plugin does: its `tick`, `afterTick` and `close`, each handed `plugins`. Everything it keeps is
  inside that function, never at the top of the file: a page makes a new client per scene, and a
  value at the top of the file is made once and read by every scene after.
- The scene lists `shipped` in its `plugins` and names `<name>` in `world.shipped.plugins`.
  `shipped`'s first tick imports `plugins/<name>/<name>.plugin.ts` from the game's folder and puts it
  on `plugins.<name>`; a name the scene's `plugins` already gives throws.
- Its `tick` and `afterTick` run at `shipped`'s place in the scene's `plugins`. One that shows things
  in its `tick` needs `shipped` after `ui`, whose first tick reads `world.ui`; one that shows them in
  its `afterTick` needs `shipped` before `ui`, whose `afterTick` destroys what nobody showed.
- It uses the ui as `plugins.ui`, handed to it, and never imports `plugins/ui`. A pure function that
  holds nothing of another plugin's state, the loader's `def`, is imported.
- It may name the game's kinds. It has no numbers and no prefab of its own: it reads each number off
  the definition of the kind whose row it is drawing, `def(plugins.wire, row.kind)`, and its panels
  and styles are `world.ui`'s. Its one entry in `world` is `world.<name>.mods`.
- Drawing several rows, it shows each thing by a key that holds the row's id,
  `` ui.show(panel, `${row.id}.heading`, make) ``. That key is its map from row id to drawing: `make`
  runs the first frame a row is shown, and a row no longer there takes its drawing with it after the
  first frame nobody shows it. Two rows of one kind never share a key, or the second `show` throws
  `ui showed <panel> <key> twice in one frame` (`designing-a-kind`, Shared code and systems).
- Its test is `games/<game>/plugins/<name>/<name>.plugin.test.ts`. It boots the game's manager with
  `load` and a page with `view(link(loopback(accept(manager(truth)))), file, base, () => {})`, `base`
  the game's folder, `new URL('../../', import.meta.url).href`, so `shipped` finds the plugin there.
  The page has no canvas, and the ui shows, places and destroys the same things without one. It steps
  the truth, frames the page, and reads what the plugin showed off the panels by key.

Building it is `building-a-plugin`.

## The work in order

The example all the way through: a coin a seat's `player` row takes raises that seat's score, shown in
its corner, Escape pauses, and the pause screen sets the volume. A game made with `yarn new-game`
starts with a `player` row that spawns a `body` and forwards `move` to it; that `body` is folded into
the `player` row first, its fields onto the `player` prefab, its rule into `player.sim.ts`, its look
into `player.client.ts`, and `body` gone from the sim, the scene, the data file and the test
(`designing-a-seat`). The template is the editor's, which is on hold; it is never the model.

1. Ask the person making the game what the HUD shows, where, and what each screen does. That is
   content, and it is theirs.
2. The value on a row. Here the seat's own score: a `score` field of the `player` prefab,
   `"player": { "seat": 0, "pos": [0, 0], "move": [0, 0], "score": 0 }`, beside the fields of the thing
   the seat plays as (`designing-a-seat`). The coin's rule raises it through an act of the `player` row
   that does nothing when a seat sent it, so no seat sends itself points (`designing-a-seat`, Acts a
   seat can send):

   ```ts
   // player.sim.ts, among its acts
   score(me, _w, seat, worth: number) {
     if (seat >= 0) return
     me.data.score += worth
   },

   // coin.sim.ts
   after(me, _dt, w) {
     const { reach, worth } = def(w, me.kind)
     const [x, y] = me.data.pos
     const p = w.all('player').find(p => math.hypot(p.data.pos[0] - x, p.data.pos[1] - y) <= reach)
     if (!p) return
     w.call(p, 'score', -1, worth)
     w.end(me)
   },
   ```

   Each with its `<kind>.sim.test.ts`, a seat sending `score` at its own row among them, refused and
   changing nothing. A score the seats share, a team's, is a kind of its own with one `actors` entry,
   a `tally` with `{ "count": 0 }` and an act `add` the coin's rule calls the same way
   (`designing-a-kind`), drawn by the tally's own look.
3. The scene file, `games/<game>/<scene>.scene.json`: list `ui` in `plugins`, and `store` when a
   screen sets page-only values. A plugin that draws on the ui in its `afterTick` goes before `ui`.
4. `world.ui` in the same file: a panel per region (the `hud` corner, the `pause` modal), the six keys,
   and every style a look asks for.
5. The definitions in `games/<game>/assets/<game>.json`: every place inside a panel and every word
   shown there, keyed by the kind whose look draws it, and the name of any picture it draws:

   ```json
   "player": { "speed": 240, "size": 32, "colour": "#e8c547",
               "hud": { "picture": "coin.ui", "icon": [0, 4], "score": [24, 0] } },
   "pause": { "title": { "at": [24, 16], "text": "Paused" }, "bar": { "at": [24, 92] },
              "down": { "at": [24, 116], "text": "-" }, "up": { "at": [96, 116], "text": "+" },
              "mute": { "at": [168, 116], "text": "Mute" }, "resume": { "at": [24, 156], "text": "Resume" },
              "volume": { "steps": 10, "least": 0, "most": 1 } }
   ```

   `steps` is how many steps the volume moves from 0 to 1: a whole number, so each value the screen
   writes is a whole number of steps over `steps` and exact. A step of 0.1 added and rounded writes
   values such as 0.30000000000000004.

6. A picture on the HUD: its own catalogue entry with `"for": "ui"`, beside the game's entry for the
   same file, with `preload: true`. `plugins.loader.get(name)` hands back what has landed and starts
   nothing: an entry that is neither preloaded nor asked for with `load` or `on` never comes, and the
   icon never shows. An entry for the ui in a scene that lists no `ui` fails, and the failure is written
   to the console once (`plugins/loader/loader.plugin.ts`).

   ```json
   "coin": { "type": "texture", "url": "/games/<game>/assets/coin.png", "preload": true },
   "coin.ui": { "type": "texture", "url": "/games/<game>/assets/coin.png", "for": "ui", "preload": true }
   ```

7. The look, `games/<game>/player.client.ts`, everything the HUD shows in `tick`. The look is loaded
   once for every `player` row the page is sent; it draws the thing for every row, so each seat sees
   the others, and shows the HUD only for the row that is `mine`, so a page shows its own seat's score
   and never every seat's on top of each other (`designing-a-seat`, The look). On a page running the
   scene ahead, this row is the copy's, so the score turns over on the frame after the coin is taken:

   ```ts
   import type * as PIXI from 'pixi.js'
   import type { Row } from '#engine/engine.ts'
   import type { Plugins } from '#engine/browser.ts'
   import { def } from '#plugins/loader/loader.sim.ts'

   export function setup(row: Row, plugins: Plugins) {
     // the thing made for every seat's row, and its keys bound only for the row that is `mine`
   }

   export function tick(row: Row, plugins: Plugins) {
     // the thing placed from `row`, for every seat's row
     if (!row.data.mine) return
     const { ui } = plugins
     const { Sprite, Text } = ui.PIXI as typeof PIXI
     const d = def(plugins.wire, row.kind).hud
     const texture = plugins.loader.get(d.picture)
     if (texture) ui.show('hud', 'icon', () => new Sprite(texture)).position.set(d.icon[0], d.icon[1])
     const score = ui.show('hud', 'score', () => new Text({ text: '', style: ui.style('score') }))
     score.position.set(d.score[0], d.score[1])
     score.text = `${row.data.score}`
   }

   export function remove(plugins: Plugins) {
     // the thing dropped, and the keys unbound for the row that was `mine`
   }
   ```

   A look of another kind, or a HUD plugin of the game's own, reads the same field off
   `possessed(plugins.wire.rows)` (Reading what the HUD shows).

8. A screen the game puts up. A `pause` kind, `{ "on": false }` and one `actors` entry, whose act
   `toggle` turns `on` over and which lists no `open`. The seat reaches it through its own `player`
   row: `player.sim.ts` gains `pause(_me, w, seat) { w.call(w.find('pause'), 'toggle', seat) }`, and
   `player.client.ts` binds the key, `press: { Escape: ['pause'] }`. The press goes up the wire, and
   the screen is up when the packet that carries the row's `on` arrives. Every rule that must stop
   honours it, as the `player` row's `tick` returns while `w.find('pause').data.on`.
   The key bound to `pause` is a keyboard key that is `world.ui`'s `back`: on a screen the game put up
   the UI leaves `back` to the game and takes every other key, so a pause key that is not `back`
   pauses and then cannot play again, and no gamepad key reaches the game while the screen is up
   (Menus the player opens, and screens the game puts up). A pad leaves the screen by its Resume
   button, which a pad reaches under `control` once `world.ui.keys` names the pad's keys beside the
   keyboard's (`"press": ["Enter", " ", "Pad0"]`), since the UI acts only on the keys it names. The
   look, `pause.client.ts`, shows the screen while the row is on, the thing to focus first shown
   first (its imports as in step 7, with an empty `setup` and `remove`):

   ```ts
   export function tick(row: Row, plugins: Plugins) {
     if (!row.data.on) return
     const { ui, store } = plugins
     const d = def(plugins.wire, row.kind)
     const at = <T extends PIXI.Container>(c: T, [x, y]: number[]): T => { c.position.set(x, y); return c }
     const { steps, least, most } = d.volume
     const turn = (by: number) => store.set('volume', Math.min(most, Math.max(least, (Math.round((store.get('volume') as number) * steps) + by) / steps)))
     at(ui.show('pause', 'resume', () => ui.button({ ...ui.style('wide'), label: d.resume.text }).on('pointertap', () => plugins.player.pause())), d.resume.at)
     at(ui.show('pause', 'title', () => new ui.PIXI.Text({ text: '', style: ui.style('title') })), d.title.at).text = d.title.text
     const look = ui.style('volume')
     at(ui.show('pause', 'bar', () => ui.bar(look)), d.bar.at).set(store.get('volume') as number, store.get('muted') ? look.muted : look.fill)
     at(ui.show('pause', 'down', () => ui.button({ ...ui.style('button'), label: d.down.text }).on('pointertap', () => turn(-1))), d.down.at)
     at(ui.show('pause', 'up', () => ui.button({ ...ui.style('button'), label: d.up.text }).on('pointertap', () => turn(1))), d.up.at)
     at(ui.show('pause', 'mute', () => ui.button({ ...ui.style('button'), label: d.mute.text }).on('pointertap', () => store.set('muted', !store.get('muted')))), d.mute.at)
   }
   ```

   Every word the screen shows is the definition's, as every place is: the title is written on what
   `show` hands back each frame, as the score is, and a button's label is the definition's when
   `make` builds it.

   `plugins.player.pause()` sends `pause` at the seat's player row, as a call of any name the player
   plugin has no function of its own for does. A menu the player opens is built the same way, with a
   `key` on its panel and `if (ui.opened(name))` in place of the row's field, and its row holds no
   field saying it is up.
9. The store. The scene lists `store`, before any plugin that reads it in its `tick` (the player plugin
   under `control`, `synthaudio`), and gives the starting value of every key the game reads. `get`
   throws `store has no <key>` for a key with no starting value; `has` asks. A value is any JSON value.
   The table lives on the page's link, so every scene the page visits reads and writes the one table,
   and it survives the scene that wrote it. `world.audio.volume: { "level": "volume", "muted": "muted" }`
   names the keys audio plays every sound through (`plugins/audio/audio.plugin.ts`); the same with
   `world.synthaudio.volume`.

   The starting values are `world.store`, `"store": { "volume": 0.8, "muted": false }` in the scene's
   `world`, each given to the page's table every tick while the table lacks that key; a `world.store`
   in the manager's `<game>.scene.json` is every scene's until a scene gives its own. The store has no
   row, and the prime directive gives a plugin with no row no prefab: its fixed numbers are
   `world.<plugin>`. `plugins/store/store.plugin.ts` reads them off a `store` prefab today
   (`p.wire.scene.prefabs.store`), and throws `scene lists store but has no store prefab` without
   one. So the job that uses the store moves them to `world.store` first, in one change: that read
   and the store's header, `plugins/store/store.plugin.test.ts`, every other test that gives a `store`
   prefab (`plugins/player/player.plugin.test.ts`), every game's scene file that gives one, and the
   lines of the skills that name the prefab. Then its scene gives `world.store`. The prefab is never
   copied as a pattern for another plugin.
10. The tests beside each file written (How it is proven), run, and the game played.

## Chat, party, cutscene and stats

- `chat` (`plugins/chat/`) draws channel tabs, the open channel's lines and a line of text entry on the
  panels `chat.tabs`, `chat.log` and `chat.entry`, in the styles `chat.tab`, `chat.tab.on`,
  `chat.<channel>`, `chat.label` and `chat.entry`, from the `chat` row and the seat's own `chatbox`.
  It is listed before `ui`, and it throws when the scene talks on `party` or `whisper` and its
  `security` lists no `chatbox` channels. Its text entry is `ui.entry(panel, key, { max, style })`,
  which the ui plugin does not have; chat's own test hands its ui an `entry` of the test's own
  (`plugins/chat/chat.plugin.test.ts`), so a chat box on a real page throws. A game that puts chat on a
  page first builds `entry` in `plugins/ui/ui.plugin.ts`, to the contract `plugins/chat/chat.plugin.ts`
  gives it: shown every frame as `show` is, by panel and key, `max` the most characters it takes and
  `style` the name of a ui style; it hands back a PIXI.Container to place, whose `take()` hands back
  the line the player sent with Enter since the last frame, once, or undefined. It is tested in
  `plugins/ui/ui.plugin.test.ts`, and chat's test then uses it in place of its own `entry`, in the same
  change.
- `party` (`plugins/party/`) draws a frame per other member and an invite prompt on `party.frames` and
  `party.invite`; a `party.invite` the scene makes `modal` takes the input while the prompt shows.
  Listed before `ui`.
- `cutscene` (`plugins/cutscene/`) draws bars, a veil and a spoken line on `cutscene.top`,
  `cutscene.bottom`, `cutscene.veil` and `cutscene.line` while a scene runs. Listed before `ui`.
- The panels and styles these three name are `world.ui`'s like any other; their headers call them
  "ui's prefab", and the ui reads them off `world.ui`.
- `stats` (`plugins/stats/stats.plugin.ts`) is three.js's frame-rate panel, the page's frames a second,
  milliseconds a frame and heap. It is not a game's stat. It shows only once something calls its
  `mount(parent)`, and neither the page `yarn new-game` writes nor the editor's game view calls it. A
  frame-rate readout is a readout of `dev.html`'s own: before the boot it lists `stats` in its copy of
  the scene in memory, after the plugins that draw, as its header asks, and its `mount` calls
  `me.plugins.stats.mount(document.body)` beside the canvases.

## The editor's design system is another thing

The editor is a React web app, and its design system is React components in `editor/ui/` with themes
that are CSS (`editor/themes/`). It builds the editor's panels and nothing else. The game's `ui` plugin
is PixiJS on a canvas over the game, and the two have nothing to do with each other: a game's HUD never
imports `editor/ui/`, and an extension never draws its panel with the `ui` plugin. Nothing a game runs
imports `editor/` at all.

## What goes wrong

- The HUD drawn in `index.html`, or a readout or listener added to a page. A page mounts things; the
  HUD is a kind's look or a plugin of the game's own.
- The seat's own score, health, ammo or lives kept on a row of another kind, a tally or a body the
  `player` row spawns. It is a field of the seat's `player` row, listed in `security` when only its own seat may read it (`designing-a-seat`).
- The seat's own row found with `rows.find(r => r.kind === 'player')`. That is whichever seat's row
  came first, so a seat's HUD shows another seat's score. `player.client.ts` draws the HUD behind
  `if (row.data.mine)`; anything else uses `possessed(plugins.wire.rows)`.
- The HUD drawn for every `player` row in `player.client.ts`. Every seat's readout is shown on one
  key, and the second `show` throws `ui showed <panel> <key> twice in one frame`. It is drawn only for
  the row that is `mine`.
- A hit flash or a pickup's glow of the seat's own thing raised on a ledger or a row of its own: a
  second row for what the look already has. The look sees the change on the seat's own `player` row's fields, health
  lower than it last drew it, and works the flash out itself, as local state in its module.
- `ui.show` in `setup`. It throws `ui has not ticked yet` for a row in the first packet, and for a row
  born later the `tick` that shows the same key throws `ui showed <panel> <key> twice in one frame`.
  `store.get` in `setup` throws for a row in the first packet. Everything is shown and read in `tick`.
- Building the HUD once in `setup` and adding it to a panel, or tearing it down in `remove`. A panel
  takes only what `show` hands out, every frame.
- A number in the look: a place, a size, a step, the angle a ring starts at, the order of a line's
  fields or the gaps between them. It is on the kind's definition, and the panel's place in
  `world.ui`.
- A word in the look: a title, a button's label. It is on the kind's definition too.
- A screen called done from its tests alone. It is looked at in Chrome in every state it has, and
  what was seen is reported.
- The HUD's picture drawn from the game's catalogue entry. Under render3d that is a three.js texture,
  which the ui's PixiJS cannot draw. The HUD draws its own `"for": "ui"` entry.
- A volume screen that adds a step of 0.1 and rounds, writing 0.30000000000000004 into the store. It
  counts whole steps and divides.
- An icon asked for with `loader.get` alone, never preloaded, `load`ed or awaited with `on`: it never
  starts, and nothing shows.
- A pause bound to a key other than `world.ui`'s `back`. On the screen the game put up the UI takes
  every key but `back`, so the game pauses and that key cannot play it again; only a button on the
  screen can.
- A pad button bound to the pause and named in `back`. While a modal has the input the player plugin
  presses no gamepad key, so the pad pauses the game and cannot play it again. The pad reaches the
  screen's Resume under `control`; a pad button that backs out is built in `plugins/player` first.
- A menu panel with a `key` and no `modal`: its key never closes it, nor does `back`.
- A pause built as a menu the player opens, with a `key` on the panel, when the game must stop. The
  server never hears of an open menu: the game plays on under it, and in a game of several seats
  everyone else plays on too.
- The button to focus first shown after the others. The focus goes to the first interactive thing the
  modal showed.
- A layout that measures text. Nothing in core does; places are numbers.
- The volume, the mute or a theme put on a row or sent in a message. They are the store's.
- A key the game reads with no starting value in `world.store`: `store has no <key>`.
- A `store` prefab written so the store runs. The job that uses the store moves its starting values
  to `world.store` first (step 9).
- A row's value copied into the store to show it on the next scene, a score on a game-over screen.
  The store holds only what the page alone keeps; what a seat carries crosses a move as `go`'s args
  (`scene-flow`, What crosses a move).
- In a test, an arrow pressed while a modal is up to walk the seat's `player` row: it moves the focus,
  and the row does not move.

## How it is proven

Each file written has its test beside it, named after it, `.test.ts`, run in node with
`yarn vitest run <file>`:

- The rule that changes the value, `<kind>.sim.test.ts`, as `designing-a-kind` writes it: boot the
  manager, `load` it, make a seat with `connection`, drive it, and read the value off `room.rows` and off
  the seat's last packet, which is where its page reads it. A screen's kind gets one too: the act a seat
  reaches it through turns it over, a seat sending the act at the row itself is refused and changes
  nothing, and the rules that must stop do.
- The look, `<kind>.client.test.ts`, on a page made as `index.html` makes one:
  `view(link(loopback(accept(manager(truth)))), file, import.meta.url, mount)`, stepping the truth and
  calling `frame()`, as `plugins/store/store.plugin.test.ts` makes its pages. Read what it shows off
  the panel by key, `ui.panel('hud').getChildByLabel('score').text`, and the picture's texture against
  `plugins.loader.get` of the ui's entry and not the game's. For a screen: the press of its key
  (`ui.took(e)` false on a screen the game puts up), `ui.modal()`, `ui.focused(...)` on the thing shown
  first, a button tapped with `emit('pointertap', ...)` or the focus moved and pressed with
  `world.ui`'s keys, what lands in the store (`plugins.store.get` and the link's `store`) with no row of
  the truth holding it, `back` taking the screen down through the game, and the rows that hold still
  while it is up. Where a thing stands is read off the page too: the panel's place on the canvas is
  `ui.panel(name).position`, where the ui put it by its anchor, and a thing's place inside the panel
  is its own `position`. The test never works the anchor, `at`, `scale` and the canvas's size through
  again to find it, which would prove only that it does the ui's arithmetic the ui's way.
- Keys reach a page in node through the page's listeners: give `globalThis` an `addEventListener` and
  a `removeEventListener` of the test's own (`vi.stubGlobal`) that keep each listener with its phase,
  and hand a key event, with the `code` `keyCode(name)` gives (`plugins/player/player.plugin.ts`), to
  the capture phase's listeners first, where the ui listens, then the rest, where the player plugin
  does. The ui listens only once it has a canvas: hand it one with `style`, `addEventListener`,
  `removeEventListener` and `remove`, either through `mount`, with PixiJS's `autoDetectRenderer`
  mocked to a renderer that keeps its size and `devicePixelRatio` given a value, as
  `plugins/ui/ui.plugin.test.ts` does, or set on `ui.canvas` directly. Node decodes no image, so a test
  whose HUD draws a picture stands in for `PIXI.Assets.load`, with a stand-in that hands back a new
  texture on every call, `vi.spyOn(PIXI.Assets, 'load').mockImplementation((async () => new
  PIXI.Texture()) as typeof PIXI.Assets.load)`. Then the ui's entry and the game's entry are two
  textures, and the test can tell which one the HUD drew; PixiJS's own `Assets.load` hands back one
  texture for one url, under which the two would be one. A test never reads a `Text`'s size.
- Any test that presses a key the player plugin handles, the pause key bound in `player.client.ts`
  among them, or clicks something that sends through it, a mouse button a table binds or a button on
  a screen whose tap calls `plugins.player.<act>()` (the Resume button), pins the step the press
  lands on: the row as it was on the step before, and changed on that step (`input-and-seats`, How it
  is proven). It never steps a count of frames, `step(2)` say, and reads the rows within a few steps.
- A readout of the seat's own state is checked on a page that runs the scene ahead, as `client.html`
  runs it, beside the game's `<game>.predict.test.ts` (`designing-a-seat`, The proof): two pages made
  with `predict(link(loopback(accept(manager(truth)), time, net)), file, base, mount)` on a clock the
  test moves, one on a clean wire and one on each of the network panel's bad ones. The seat presses
  what changes the field, a shot that spends ammo or a walk onto a coin; on the frame after the frame
  the press was sent on, its page's `player` row (`possessed(page.client.plugins.wire.rows)`) holds
  the new value and its HUD shows it, read off the panel by key, and the other seat's page shows its
  own HUD unchanged. A readout read off any row but the seat's own `player` row fails this on every
  bad wire.
- A test that attaches the game to the editor's session (`session.attach`) in jsdom is a
  `.view.test.tsx` instead, run with `yarn test:view <file>`.
- Once the tests pass, break the thing on purpose and see its test fail: change `world.ui`'s `back`,
  or point the HUD at the game's catalogue entry (which the test sees only through a stand-in that
  makes a new texture per call).
- `yarn tsc` checks the game's files.

Then play it: `yarn editor <game>`, open `localhost:5173/games/<game>/index.html`, take a coin and see
the score change, pause, move through the screen with the keys and the pointer, change the volume and
hear it, and leave the screen with the same key. Then run `<game>.server.ts` on node, open
`client.html` in two tabs, and see each tab's score turn over on the frame after its own seat takes a
coin, and the other tab's stay its own. How it looks is checked in Chrome
(`.claude/skills/good-webviews/`): the HUD, and each screen in every state it has, closed and open,
muted and not, a screenshot of each read for every line standing inside its background and every
label inside its button. The work is not done until what those shots showed is reported.

## Questions never asked

- Should the page draw this? No: a kind's look, or a plugin of the game's own.
- Can the seat's own score, health or ammo be a field of its `player` row? Yes: that is where it goes,
  listed in `security` when only its own seat may read it. A score the seats share is a kind of its
  own with one `actors` entry.
- Can the seat's own score go on a row the `player` row spawns, to keep the `player` row small? No: the seat's
  own state is a field of its `player` row (`designing-a-seat`).
- Can this place, size or word go in the look's code? No: the kind's definition, and the panel's
  place in `world.ui`.
- Can the HUD draw the texture the game decoded? No: its own `"for": "ui"` entry.
- Can the volume go on a row or to the server? No: the store.
- Should the `ui` plugin get a setting so this game's HUD can…? No: this game's kind draws it.
- Should a HUD component come from `editor/ui/`? No: that is the editor's.
- Should the controls screen go here? No: `building-a-controls-screen`.
- Do you want the full version? Always.

Ask the person making the game what the HUD shows and what each screen does. That is content, and it
is theirs.
