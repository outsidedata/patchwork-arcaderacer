---
name: building-a-controls-screen
description: Use in core, or any clone of it, when a game gets a screen where the player sees and changes its controls - a controls, key-bindings, remap or input settings menu - and when moving a game's keys from `bind` to `control` so they can be rebound. Covers how such a screen is designed (one line per thing the player's thing does, named in the player's words, keys spelled out, grouped by purpose), where it lives (the menu before play), giving a menu scene the player plugin, its definition, its actor, its fonts and fills, and its tests. Also use it when a controls screen reads like line noise ("−: CTRL, −", "UP: W, ↑"), its labels show huge, black or in a serif font, or the menu shows through it.
---

# Building a controls screen

A controls screen answers one question for the player: "what do I press to do X?" Everything about
how it is designed follows from that question. The facts of the API are the headers of
`plugins/player/player.plugin.ts` (Actions, and what a screen calls) and `plugins/ui/ui.plugin.ts`;
`input-and-seats` covers `bind`, `control`, `world.player.actions` and the store. Load
`prime-directive` too; nothing here overrides it.

## How it is designed

Design it from what the player does, never from how the input is stored. The player plugin stores
an action as a shape (a button's list, an axis's two lists, a stick's four), and a screen that draws
the shape ("LEFT: A, ←", "−: CTRL, −", "+: SHIFT, =") makes the player decode it. It reads as line
noise, and it is the first thing a screen built from the data looks like. Build it the other way:

1. **One line per thing the player's thing does.** Every part of every action is its own line: a
   stick is four lines, an axis two, a button one. Never a row of an action's parts side by side.
2. **Each line named for what happens, in the player's words.** Read the rule the act reaches before
   naming a direction: which way a part moves the thing is in its code, not in the key's name. A
   stick's up key that pitches the nose down is NOSE DOWN, not UP; an axis that moves a throttle is
   THROTTLE DOWN and THROTTLE UP, not − and +; a stick side that rolls on some ships and yaws on
   others is TURN LEFT. A button action's line is its `label`, written as a verb phrase: FIRE GUNS,
   CHANGE CAMERA, CENTRE VIEW; a button held to work says so: LOOK AROUND (HOLD).
3. **Keys spelled out in words.** The definition's `names` gives every key the game binds a name a
   player reads: SPACE, BACKTICK, MINUS, EQUALS, CTRL, LEFT ARROW, RIGHT MOUSE, and for a pad LEFT
   TRIGGER, RIGHT BUMPER, STICK RIGHT, D-PAD UP, A. Never a glyph (`` ` ``, `−`, `←`) or a code
   (`Pad7`, `RMB`, `LT`). Several keys on one line are joined by `  or  `. A line with none says
   NOT SET.
4. **Only the device in the player's hands.** Show the keyboard's keys, or the pad's, by
   `player.device()`, and say which in the hint: SHOWING KEYBOARD · ESC TO GO BACK. Rebinding a line
   replaces that device's keys and keeps the other's.
5. **Grouped by purpose, in order of use.** Columns, each a list of actions in order: moving the
   thing in one (steer, then rudder, then throttle), acting with it in the other (fire, the second
   weapon, boost, target, the camera). The player scans one column for the kind of thing they want.
6. **Every message a sentence.** A key two actions share: `F does both BOOST and FIRE MISSILE`.
   While listening: PRESS A KEY · ESC TO CANCEL.
7. **Where it lives: the menu before play.** A player sets their controls before they fly, from the
   main menu, a CONTROLS button beside the game's other choices. Not on the pause screen in play
   unless the person making the game asks for it there.

## Where its pieces go

- **The actions:** `world.player.actions` of the manager scene, `<game>.scene.json`, so every child
  scene reads the same ones, with `world.player.deadzone` when a side of the left stick is bound.
  Give each action keyboard and pad keys both. Labels are the verb phrases of step 2.
- **The thing's look:** `player.client.ts` calls `plugins.player.control(...)` in place of `bind`,
  typed `satisfies Controls`; `drag` names its button action by `action`, not `key`; a `press` that
  is the page's alone (a camera mode) is a function there as on `bind`.
- **The store:** `store` listed before `player` in `plugins` of every scene that lists `player`. The
  store still reads its starting values off a `store` prefab (`plugins/store/store.plugin.ts`), which
  every game in core gives today; give the manager's prefabs `"store": {}`.
- **The screen:** a kind of the game's own, `controls`: `controls.sim.ts` is
  `export const controls: Kind = {}`, the menu scene's `sim` lists it, the manager's prefabs give
  `"controls": {}`, and the menu scene's `actors` holds `{ "is": "controls" }`.
- **Every word, place and size:** the `controls` definition in `assets/<game>.json` (below).
- **The menu's button:** the menu's own definition, a button with `"open": "controls"` that its actor
  answers with `ui.open(b.open)`.

### The menu scene needs the player plugin

`actions()`, `listen`, `rebind` and the rest are the player plugin's, so the menu scene lists
`player` (after `store`). A scene that lists it seats every connection with a `player` row
(`addons/scenemanager`'s `own`, `addons/player`'s `join`), so:

- the menu scene declares `seats`: as many as could ever be in it at once, every child scene's
  seats added up;
- its `sim` lists the game's `player` kind, which must do nothing to a seat that holds no thing: read
  its `before` and `after` and check that each returns at once for a row that has not boarded;
- `player.client.ts` binds its table on the menu too; the menu's modal panel takes every key, so it
  flies nothing, and its camera code returns while the row holds no thing;
- anything that took "the scene lists `player`" to mean "a seat comes in to play here" (a sky that
  runs an arrival, a jump-in) reads a world flag instead, `world.<kind>.arrive`, true on the
  manager and false on the menu scene;
- a test that said the menu's seat has no row says it has one that holds nothing.

## The scene's ui

On the menu scene's `world.ui`:

- the panel: `"controls": { "anchor": "center", "size": [1000, 640], "modal": true, "layer": 2, "backdrop": { "color": …, "alpha": 0.72 } }`,
  on a layer over the menu's own panel;
- the keys, with the pad's, so a pad reaches the screen and moves through it:
  `"up": ["ArrowUp", "Pad12"], "down": ["ArrowDown", "Pad13"], "left": ["ArrowLeft", "Pad14"], "right": ["ArrowRight", "Pad15"], "press": ["Enter", " ", "Pad0"], "back": ["Escape", "Pad1"]`;
- a button style for the key buttons, small text in the menu's font:
  `"controls.key": { "radius": 2, "fill": {…}, "focus": {…}, "text": { "fontFamily": "<the menu's monospace>", "fontSize": 12, "fontWeight": "600", "letterSpacing": 1, "fill": <light> } }`.
  The lines' names and the hint reuse the menu's own text styles, so the screen is the menu's.

## The definition

```json
"controls": {
  "panel": "controls",
  "back": { "radius": 4, "colour": 395022, "alpha": 1 },
  "title": { "at": [500, 36], "anchor": [0.5, 0.5], "text": "CONTROLS", "style": "menu.heading" },
  "columns": [
    { "at": [40, 84], "actions": ["stick", "rudder", "lever", "cut", "full"] },
    { "at": [520, 84], "actions": ["fire", "launch", "boost", "target", "camera", "centre", "look"] }
  ],
  "step": 40,
  "label": { "style": "menu.blurb", "drop": 9 },
  "parts": { "at": 200, "size": [240, 30], "label": [10, 8], "between": "  or  ", "style": "controls.key" },
  "sides": {
    "stick": ["TURN LEFT", "TURN RIGHT", "NOSE DOWN", "NOSE UP"],
    "lever": ["THROTTLE DOWN", "THROTTLE UP"]
  },
  "none": "NOT SET",
  "names": { " ": "SPACE", "`": "BACKTICK", "ArrowLeft": "LEFT ARROW", "Mouse2": "RIGHT MOUSE", "Pad7": "RIGHT TRIGGER", "…": "…" },
  "restore": { "at": [40, 548], "size": [200, 34], "text": "RESTORE DEFAULTS" },
  "close": { "at": [256, 548], "size": [130, 34], "text": "DONE" },
  "listening": { "at": [410, 556], "text": "PRESS A KEY  ·  ESC TO CANCEL", "style": "menu.full" },
  "conflicts": { "at": [40, 598], "line": "{key} does both {actions}", "between": " and ", "gap": "   ·   ", "style": "menu.blurb" },
  "hint": { "at": [964, 612], "anchor": [1, 0.5], "text": "SHOWING {device}  ·  ESC TO GO BACK", "style": "menu.hint" },
  "devices": { "keyboard": "KEYBOARD", "xbox": "GAMEPAD", "playstation": "GAMEPAD", "pad": "GAMEPAD" }
}
```

`sides` names each side of every axis and stick action, in its keys' order (left, right, up, down;
the −1 side, the +1 side). `names` names every key any action binds, and every key a player could
bind (each letter is its own upper case without an entry). Every action is in exactly one column.

Size it from the text. Nothing measures text in core: a monospace character at size `s` with
`letterSpacing` `l` is about `0.6 s + l` pixels wide, so the longest key line ("RIGHT ARROW  or  D",
18 characters at 12 and 1, about 150 px) fits a 240 px button with room for a second key, and the
longest name (THROTTLE DOWN) fits the 200 px before the buttons. The columns plus their buttons fit
inside the panel's width; the longest column's lines plus the buttons under them fit its height.

## The actor, `controls.client.ts`

```ts
import type * as PIXI from 'pixi.js'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Bound, Shown } from '#plugins/player/player.plugin.ts'
import { def } from '#plugins/loader/loader.sim.ts'

const pad = (key: string) => key.startsWith('Pad')
const line = (form: string, fields: Record<string, string>) => form.replace(/\{(\w+)\}/g, (_, f: string) => fields[f])

// An action's keys with part `part`'s keys of `key`'s device replaced by `key`.
function replaced(a: Shown, part: number, key: string): Bound {
  const swap = (held: string[]) => [key, ...held.filter(k => pad(k) !== pad(key))]
  return a.shape === 'button' ? swap(a.keys as string[]) : (a.keys as string[][]).map((held, i) => (i === part ? swap(held) : held))
}

function listen(player: Plugins['player'], name: string, part: number) {
  player.listen((key: string | undefined) => {
    if (key === undefined) return // Escape: nothing changes
    const now = (player.actions() as Shown[]).find(a => a.name === name)!
    player.rebind(name, replaced(now, part, key))
  })
}

export function setup() {}

export function tick(row: Row, plugins: Plugins) {
  const { ui, player, wire } = plugins
  const d = def(wire, row.kind)
  const P = d.panel as string
  if (!ui.opened(P)) return
  const T = ui.PIXI as typeof PIXI
  const named = (key: string): string => d.names[key] ?? key.toUpperCase()
  const text = (key: string, style: string | object, [x, y]: number[], value: string, anchor = [0, 0]) => {
    const t = ui.show(P, key, () => new T.Text({ text: value, style: typeof style === 'string' ? ui.style(style) : style })) as PIXI.Text
    t.text = value
    t.anchor.set(anchor[0], anchor[1])
    t.position.set(x, y)
  }
  const button = (key: string, [x, y]: number[], size: number[], value: string, tap: () => void) => {
    const b = ui.show(P, key, () => ui.button({ ...ui.style(d.parts.style), size, label: '' }).on('pointertap', tap)) as PIXI.Container
    b.position.set(x, y)
    // The label's style is the button style's own `text`, never the button style itself.
    text(`${key}.label`, ui.style(d.parts.style).text, [x + d.parts.label[0], y + d.parts.label[1]], value)
  }

  // The fill first, so the rest is over it; then the buttons, so the first line takes the focus.
  const box = ui.panel(P).boundsArea
  ui.show(P, 'back', () => new T.Graphics().roundRect(0, 0, box.width, box.height, d.back.radius).fill({ color: d.back.colour, alpha: d.back.alpha }))
  const actions = player.actions() as Shown[]
  const device = player.device() as string
  const mine = device === 'keyboard' ? (k: string) => !pad(k) : pad
  const byName = new Map(actions.map(a => [a.name, a]))
  for (const col of d.columns as { at: number[]; actions: string[] }[]) {
    let y = col.at[1]
    for (const name of col.actions) {
      const a = byName.get(name)!
      const parts = a.shape === 'button' ? [a.keys as string[]] : (a.keys as string[][])
      parts.forEach((keys, j) => {
        button(`part.${name}.${j}`, [col.at[0] + d.parts.at, y], d.parts.size, keys.filter(mine).map(named).join(d.parts.between) || d.none, () => listen(player, name, j))
        text(`label.${name}.${j}`, d.label.style, [col.at[0], y + d.label.drop], a.shape === 'button' ? a.label.toUpperCase() : d.sides[name][j])
        y += d.step
      })
    }
  }
  button('restore', d.restore.at, d.restore.size, d.restore.text, () => player.restore())
  button('close', d.close.at, d.close.size, d.close.text, () => ui.dismiss(P))
  text('title', d.title.style, d.title.at, d.title.text, d.title.anchor)
  text('hint', d.hint.style, d.hint.at, line(d.hint.text, { device: d.devices[device] }), d.hint.anchor)
  if (player.listening) text('listening', d.listening.style, d.listening.at, d.listening.text)
  const label = new Map(actions.map(a => [a.name, a.label.toUpperCase()]))
  const clash = (player.conflicts() as { key: string; actions: string[] }[])
    .map(c => line(d.conflicts.line, { key: named(c.key), actions: c.actions.map(n => label.get(n)!).join(d.conflicts.between) }))
  if (clash.length) text('conflicts', d.conflicts.style, d.conflicts.at, clash.join(d.conflicts.gap))
}

export function remove() {}
```

The order matters: buttons are shown before the texts so the first key button takes the focus, and
the fill is shown first so everything is over it. A thing not shown in a frame is gone the next
(`ui.show`), so the listening line and the conflicts line are shown behind an `if` and need no
removing.

## What goes wrong

- **Line noise.** Parts of an action side by side as "SIDE: KEY, KEY" with glyphs. One line per part,
  named in words, keys in words (How it is designed).
- **A direction named after its key.** "UP" for a key that puts the nose down. Read the rule.
- **Labels huge, black, in a serif font.** The label `Text` was handed the whole button style
  (`radius`, `fill`, `focus`, `text`), which PixiJS does not read as a text style, so it drew its
  default: 26 px, black, its own font. Hand it `ui.style(<button style>).text`.
- **The menu shows through.** The screen's own fill under 1 alpha lets the menu's buttons and
  tagline ghost through it. The fill is opaque; the panel's `backdrop` dims what is round it.
- **A button sized by guess.** Work its width out from its longest text (The definition), then look.
- **The menu scene lists no `player`.** Every call the screen makes throws on `plugins.player`
  being undefined. It lists `store` then `player` (The menu scene needs the player plugin).
- **A pad cannot reach the screen.** `world.ui.keys` without `Pad12`–`Pad15`, `Pad0`, `Pad1`.
- **Calling it done from tests.** The tests read the text; they do not see a font, a size or a
  colour. It is looked at in Chrome before anything is said about it.

## How it is proven

`games/<game>/controls.client.test.ts`, a `.test.ts`-style page test in node (not a view test), with
the page's listeners stubbed by type and phase, a gamepad on `navigator.getGamepads`, and a canvas
stand-in handed to the ui in the view's `mount` (all three as `input-and-seats`, How it is proven,
writes them). A menu behind an intro is reached as a player reaches it: step until the cutscene row
is `running`, send its open `skip` (`plugins.wire.send(id, 'skip')`), step until `done`, then step
through the menu's appear. Then:

- the menu's CONTROLS opens the screen, `ui.modal()` is `controls`, and every part of every action
  has its line, its name (`label.<action>.<part>`) the label or the definition's side, and its key
  button (`part.<action>.<part>.label`) its keys in words;
- the arrows move the focus down the lines and fly nothing;
- a part pressed listens (`player.listening`), the next key lands in the store
  (`link.store['player.keys']`) with the other device's keys kept, its button says the new key, and
  no row and no `world` on the server holds it;
- Escape while listening changes nothing and leaves the screen up; the next closes it;
- a shared key is named on the conflicts line; RESTORE DEFAULTS empties `player.keys`; DONE closes;
- a pad's d-pad moves the focus, `device()` turns to the pad, the buttons show the pad's keys, and
  its A then a pad button rebinds that line's pad key;
- a key rebound on the screen plays in the game: go to a playing scene, board the thing, and the new
  key changes the thing's row on the step after it goes down, while the old key changes nothing.

Then it is looked at in Chrome: open the menu, press CONTROLS, and take a screenshot closed, open,
listening and showing a conflict, with a pad and without. Read each shot for every name in plain
words, every label inside its button in the button's font, and nothing of the menu showing through.
