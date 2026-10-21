# player

Input for the seat: keyboard, mouse, pointer lock, wheel, drags, hovers, strokes and gamepads
(buttons, triggers, both sticks, rumble), bound straight to the seat's `player` row's acts or through
the scene's named actions so the player can rebind them, with analog values, toggles, repeat,
dead zones and a controls-screen API. On the rule side, a seat's `player` row taking hold of other
rows (a car, a mount, a turret) and relaying presses to them.

## Why use it

Every game whose seat controls something uses player. A press becomes a message up the wire the
moment the key goes down, at the seat's own `player` row, and a page that runs ahead draws that row
from its copy the frame after the key, so controls feel instant even online. The UI takes keys and
clicks first, typing in a page field plays nothing, and an arrow key does not scroll the page.

## How it works

**Browser half (`player.plugin.ts`).** Any function called on it, `plugins.player.jump()` or
`plugins.player.move(x, y)`, becomes a message up the wire at this seat's `player` row. The seat's
actor hands `bind` one table in its setup and holds no listener, queue or tick of its own:

- `press`: key to a message sent the moment it goes down (or a function run on the page, such as a
  store key); `release`: a function run when it comes up.
- `axis` (two keys), `stick` (four keys, one message for both axes) and `hold` (a button held), each
  sent through `send` when its value changes; `analog: true` sends how far each is held, in whole
  steps of `world.player.resolution`.
- `every` (asked each frame from what is held), `click` (where the page was clicked, in canvas
  pixels), `pointer` (mouse movement under the pointer lock, taken by a click), `drag`, `hover`,
  `stroke` (start, move, end, cancel of a mouse-button drag, a road laid from where it began), `wheel`,
  and `locked` (keys heard only under the pointer lock).

Keys are named by their place on the keyboard (`a`, `1`, `' '`, `Shift`, `ArrowLeft`, `Escape`), the
same four keys under the left hand on every layout. Mouse buttons are `Mouse0`, `Mouse1`, `Mouse2`.
Gamepad buttons are `Pad0` to `Pad16` in the standard mapping (A/cross, B/circle, X/square,
Y/triangle, shoulders, triggers, select, start, sticks, d-pad, home); the sticks are
`PadStickLeft/Right/Up/Down` and `PadRightStickLeft/Right/Up/Down` past `world.player.deadzone`.
`rumble({ strong, weak, seconds })` shakes the pad last used.

The ui plugin is asked first: a click on the UI is the UI's, every key goes while a modal has the
input, and a pointer lock is given back so the pointer can reach the menu.

**Actions, the rebindable avenue.** `control(table)` is `bind`'s table keyed by the scene's actions,
`world.player.actions`, each `{ label, keys }`: a list of keys is a button, two lists an axis, four
a stick. What the player changes is the page's, kept in the store: `player.keys`, `player.toggle`
(hold actions played as toggles), `player.deadzone`, `player.repeat`. A controls screen calls
`actions()`, `listen(fn)` (the next key goes to `fn` alone), `rebind(action, keys)`, `restore(action?)`,
`conflicts()`, `settings()`, `configure(changes)` and `device()` (`keyboard`, `xbox`, `playstation`,
`pad`, for showing the right glyphs). `pads()` and `held()` show what it hears. `unbind()` drops the
table and its listeners.

`possessed(rows)` is this page's own `player` row, and `holding(rows)` the row it holds.

**Server half (`player.sim.ts`).** No row and no hook: functions a game's `player` kind calls. The
row it holds is its `held` field, `{ kind, id }`.

- `take(me, w, row)`: takes hold of a row, unless it already holds one, the row is a `player`, or
  another seat holds it.
- `letGo(me)`, `holding(w, me)`, `holderOf(w, row)`.
- `relay({ <held kind>: [<act>, …] })`: acts for the `player` kind that pass a press on to the held
  row when it is of a kind that lists it, and do nothing otherwise. The held kind keeps those acts
  out of its `open`, so a seat reaches them only through the `player` row that holds it.

## Using it

1. List `player` in `plugins` (after `store` when using actions); give `world.player: { deadzone?,
   resolution?, repeat?, actions? }`.
2. In the seat's `player.client.ts` setup:

   ```ts
   plugins.player.bind({
     press: { ' ': ['jump'] },
     stick: [{ keys: [['a', 'ArrowLeft', 'PadStickLeft'], ['d', 'ArrowRight', 'PadStickRight'],
                      ['w', 'ArrowUp', 'PadStickUp'], ['s', 'ArrowDown', 'PadStickDown']],
               send: (x, y) => ['move', x, y] }],
   })
   ```

3. Give the `player` kind the acts those messages name, each checking its args.
4. For vehicles: the game's own `enter` act checks reach and calls `take`; spread `relay({ car:
   ['steer', 'pedal'] })` into the `player` kind's acts.

## Plugins it works with

- **ui**: takes clicks and keys first; its modals hold the input; `world.ui`'s `back` key.
- **store**: the rebound keys, toggles, dead zone and repeat of the actions avenue.
- **render2d** / **render3d**: the canvas clicks and hovers are measured against.
- **pancamera**: its keys and wheel are handed in through `player.bind`.
- **box3dvehicle**: a car's acts are relayed from the `player` row that holds it.
- **chat** and **party**: a `player` row usually stands for the seat that speaks.
- The **player** addon (`addons/player`) is where `possessed` and `mine` come from; **predict** runs
  the seat's row ahead.

## Keywords

input, controls, keyboard, mouse, gamepad, controller, Xbox, PlayStation, joystick, analog stick,
trigger, dead zone, rumble, vibration, pointer lock, mouse look, FPS controls, WASD, key bindings,
rebinding, remap keys, controls screen, toggle, hold, repeat, axis, stick, click, drag, hover,
stroke, wheel, input glyphs, device detection, seat, possess, take control, enter vehicle, mount,
turret, relay, held, `bind`, `control`, `take`, `letGo`, `holding`, `holderOf`, `relay`,
`world.player`
