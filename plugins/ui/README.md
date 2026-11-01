# ui

The HUD and menus: a PixiJS stage of its own on a transparent canvas laid over the game's, panels
placed by anchors in `world.ui`, things shown by key every frame and destroyed the frame nobody shows
them, styles, buttons, bars and an iris wipe, nameplates pinned to world points, modals that take the
input with keyboard and gamepad focus, menus the player opens by key in groups, and panels drawn on a
surface for a 3D screen to show.

## Why use it

Use ui for everything drawn over the game: score, health, ammo, lives, timers, health bars and
nameplates over heads, a minimap, an inventory, a pause menu, a game-over screen, dialogs, settings,
chat and party frames, a cutscene's bars, a cockpit's screens. Actors write plain PixiJS; ui adds
the panel layout, the show-every-frame lifecycle (so a row that ends takes its UI with it and nothing
needs tearing down), and modals and focus that work with mouse, keyboard and gamepad.

## How it works

ui has a browser half only and no row. `world.ui` (in `<game>.scene.json`, every scene's until a scene
gives its own) holds:

- `panels`: name to `{ anchor, at?, size?, clip?, layer?, modal?, backdrop?, key?, scale?, group?,
  screen? }`. `anchor` is a corner, an edge's middle or `center`; `at` moves it; `size` is its box;
  `clip` hides what is outside; `layer` orders panels; `scale` draws its pixels bigger, for art drawn
  for a smaller screen.
- `styles`: name to an options object for PixiJS or for `button`; `style(name)` hands back a copy.
- `keys`: `up`, `down`, `left`, `right`, `press`, `back`, each a key or list (keyboard or `Pad` keys,
  as the player plugin names them).

**Showing.** `show(panel, key, make)` in an actor's `tick`, every frame it wants the thing: `make`
runs the first time, the same object comes back after, and a frame nobody shows it destroys it.
`show` is the only way onto a panel. `panel(name)` is the container, `boundsArea` its size.

**Pieces.** `button(options)` (a menu button drawn alike everywhere, with focus fill; `bitmap`
draws its label as a `BitmapText`, and `baselineOffset`, 0 when left out, is pixels added to the
label's y, down positive, for a font that draws its words high or low in the button), `bar(options)`
(fills to a fraction: health, progress), `iris(options)` (a circle a screen change closes on a point,
cut a pixel row at a time as a SNES did), and `PIXI` itself.

**Placing in the world.** `project(point)` asks render3d or render2d; `pin(thing, point)` holds a
shown thing at a world point's canvas point after every actor has ticked, so a nameplate is placed
by this frame's camera, and hides it where the camera draws nothing.

**Modals.** A `modal` panel showing anything has the input: a backdrop blocks clicks, every key goes to
the UI (but `back` on a screen the game put up), and the player plugin lets go of held keys and the
pointer lock. `modal()` names the one with the input; focus moves by `up`/`down`/`left`/`right` to the
nearest interactive thing, `press` taps it, `focus` and `blur` are sent, and only keys pressed after
the modal came up act.

**Menus the player opens.** `open(name)`, `dismiss(name)`, `opened(name)`; a panel's `key` opens it,
panels of one `group` close each other, and `back` closes a menu the player opened. A screen the game
put up stays until a row takes it down.

**Surfaces.** `surface(name)` draws that panel this frame onto a shared canvas instead of over the
game, handing back `{ canvas, box }` for a 3D renderer to use as a texture: a screen in a cockpit.

`hit(x, y)`, `took(e)`, `keyDown(key)` and `keyUp(key)` are how the player plugin asks the UI first.
Everything on the stage is drawn between steps, so a dial turned from a row turns smoothly. A frame
draws a moment before the newest step, so a thing first shown on the newest step is not drawn until
the clock reaches it, and a thing nobody showed on the newest step is drawn, where it was last set,
until the clock reaches that step, and destroyed then: a screen handed from one thing to another on
one step, a cover to a cutscene's veil, draws one or the other on every frame.

**Fonts and the first frame.** A style's `fontFamily` names a font the page has, or a `font` entry of
the loader's catalogue. The UI draws nothing, its canvas still hidden, until the loader says every
font has landed or failed, so no text is drawn in a stand-in font and kept in it. In a scene that
names render3d, the UI covers the world in black (`ui.cover` in render3d's overlay) from its first
tick until the frame it first draws, so the world never shows bare before the HUD's own cover or
veil is up.

A client
with no page shows, destroys, places and hit-tests the same and draws nothing, so HUDs are tested in
node; no layout measures text, so columns are numbers in the scene file.

## Using it

1. List `ui` after the plugins that draw on its panels in their `afterTick` (chat, party, cutscene)
   and after the game renderer; give `world.ui: { panels, styles, keys }`.
2. In a kind's `<kind>.client.ts` tick:

   ```ts
   const t = plugins.ui.show('hud', 'score', () => new plugins.ui.PIXI.Text({ style: plugins.ui.style('score') }))
   t.text = `${row.data.score}`
   ```

3. A pause screen: show it on a `modal` panel behind `if (row.data.paused)`; a menu the player opens:
   give its panel a `key`, show it behind `if (plugins.ui.opened('inventory'))`.

## Plugins it works with

- **player**: asks the UI first for every click and key; lets go of the game's keys under a modal.
- **render2d** / **render3d**: the canvas it lies over, its `size` and `scale`, and `project`.
- **loader**: images and bitmap fonts with `for: "ui"`, and `font` entries, which it waits on
  before it draws.
- **chat**, **party**, **cutscene**: draw on its panels with its styles.
- **store**: the settings menus write.
- **renderdom** is the HTML layer.

## Keywords

UI, HUD, GUI, interface, menu, pause menu, game over screen, title screen, settings, inventory,
dialog, modal, popup, button, health bar, progress bar, score, ammo, lives, timer, nameplate, world
space UI, minimap, focus, keyboard navigation, gamepad navigation, back button, toggle menu, screen
transition, iris wipe, cockpit screen, render to texture, PixiJS, anchors, panels, `show`, `panel`,
`button`, `bar`, `iris`, `pin`, `project`, `open`, `dismiss`, `opened`, `modal`, `surface`, `world.ui`
