// The browser half of the player. Any function called on it becomes a message up the wire,
// carrying the name and the inputs, at this seat's player row, sent the moment it is called: a key
// that goes down between frames is in the truth's inbox before the page's loop runs its next step.
// A call made before the plugin has its wire, as an actor's setup makes on a client's first frame,
// is sent at its first `input` or `tick`.
//
// When. What is read once a frame (the gamepads, the repeat, `every`, and what the mouse, a drag, the
// hover, a stroke and the wheel added up to) is read in `input`, which a page whose loop steps the
// truth calls before its steps (`client.input()`, `engine/browser.ts`), as `index.html`'s and
// `client.html`'s do, so the steps it runs next take it. In a frame whose page calls no `input`, as a
// test's may, it is read in `tick`.
//
// This plugin runs no rule. A message goes up the wire and nothing else happens here. Where it lands
// first is the page's: on `index.html` the truth in the tab takes it on its next step; on
// `client.html` the copy that runs ahead (`addons/predict`) takes it on its next step and the seat's
// own `player` row is drawn from that copy the frame after the key, while every other row is drawn
// as the server's packets bring it. A message the pipe refuses is numbered 0 by `wire.send`, and is
// a press that never happened.
//
// One of these per client. The key table and the listeners on the page belong to the one scene it
// was made for, and go when the page closes that scene's client: a key pressed after the seat moved
// on cannot reach the rows of the scene it left.
//
// Keys, mouse and clicks. A game's player actor hands `bind` one table in its setup and holds no
// listener, no queue and no tick of its own. The plugin listens on the page, and a key that goes
// down in a field of the page, an input, a text area, a select or anything editable, is the
// field's and not the seat's, so typing in a panel beside the game plays nothing: a key in `press`
// sends its message the moment the key goes down, or, for a key `press` gives a function, runs it
// then and sends nothing, for what is the page's alone, such as a key of the store; `release` gives
// a key a function run when it comes up, or when the page lets go of every key, and a key it names
// is pressed once per hold, the keyboard's repeats of it running nothing, as a synth's note is; each `axis` is two keys whose held value,
// -1, 0 or 1, is sent through `send` when it changes; each `stick` is four keys, left, right, up
// and down, whose held value, an x and a y each -1, 0 or 1 with y growing down, is sent through
// `send` as one message when either changes, so a rule hears a way at once rather than two halves
// of it a message apart; each `hold` is a button of one or more keys,
// held while any of them is down, whose value, 1 held and 0 let go, is sent through `send` when
// it changes, so a rule can do a thing for as long as it is held; `every` is asked each frame (When,
// above) for a message from what is held; `click` is asked for a message from where the
// page was clicked, in the canvas's pixels: the page's CSS pixels divided by the renderer's
// `scale`, which is more than 1 when render2d's `fit` draws a canvas pixel across several. A mouse
// button is a key named `Mouse` and the button's number — `Mouse0` the left, `Mouse1` the middle,
// `Mouse2` the right — held while it is down and sent from `press` the moment it goes down. Each key
// an `axis` or a `stick` names may be a list of keys, any of which holds it: the arrows and w a s d
// for one stick.
// The scene's `ui` is asked first. A click, or a mouse button going down, over something on the UI
// that takes the pointer is the UI's: it is not held, sends nothing and asks `click` nothing. A
// key the UI took — every key while a modal has the input, but `world.ui`'s `back` key on a
// screen the game put up, which is the game's to bind — does not go down here. Each frame a modal has the input, every key
// and button held is let go, the way their release would, so an `axis` sends 0 and the seat stops,
// and a pointer lock this plugin took is given back, so the pointer can reach the menu; while the
// modal's backdrop covers the page, no click takes it again.
// A key is named by its place on the keyboard, the event's `code`, as `keyOf` names it: what that
// key types on a US keyboard without Shift, so `a`, `1`, `' '`, `-`, `Shift`, `ArrowLeft`,
// `Escape`. So it is one key with Shift down or not: `w` is held from its press as `W` to its release
// as `w`, and `1` from its press to its release as `!`. A key on another layout is named by where it
// is, so a table's `w a s d` are the same four keys under the left hand on every keyboard. A key with
// no place, as an on-screen keyboard's, is named by what it typed, a letter in lower case.
//
// Gamepads. Every gamepad connected is read each frame (When, above), and its buttons and
// its two sticks are keys like any other, in any table and with the same `press`, `axis`, `stick`,
// `hold`, `every` and `locked`: a key goes down the frame it is first seen down on any gamepad and
// comes up the frame none has it down, and has no repeat. A button is `Pad` and its number in the
// browser's standard mapping: `Pad0` the bottom face button (A on an Xbox pad, cross on a
// PlayStation's), `Pad1` the right, `Pad2` the left, `Pad3` the top, `Pad4` and `Pad5` the left and
// right shoulders, `Pad6` and `Pad7` the triggers, `Pad8` select, `Pad9` start, `Pad10` and `Pad11`
// the sticks pressed in, `Pad12` to `Pad15` the d-pad's up, down, left and right, `Pad16` the home
// button; a button is down while the browser calls it `pressed` and its `value` is past
// `world.player.deadzone`, so a trigger resting a little in is not down. A gamepad the browser does not map
// to the standard numbers its buttons its own way. The left stick holds `PadStickLeft`,
// `PadStickRight`, `PadStickUp` and `PadStickDown` while it is pushed that way past
// `world.player.deadzone`, a fraction of the way out, each axis on its own, so a push both ways holds
// a diagonal; the right stick, the standard mapping's third and fourth axes, holds
// `PadRightStickLeft`, `PadRightStickRight`, `PadRightStickUp` and `PadRightStickDown` the same way.
// A scene that gives no `deadzone` reads no stick, and a table that names a side of either there
// throws. So `stick` keys of `[['ArrowLeft', 'a', 'Pad14', 'PadStickLeft'], …]` move a seat from the
// arrows, the keys, the d-pad or the stick. While a modal has the input no gamepad key goes down,
// and one down as it came up is held only on a new press. So is one already down the first time a
// client reads the gamepads, as a key of the keyboard held down as a page opens sends no keydown:
// the button that pressed a menu's button to move the seat presses nothing in the scene it moves to,
// whose UI has not ticked on its client's first frame.
//
// Analog. An `axis`, a `stick` or a `hold` read analog (`analog: true` on its entry in `bind`'s table,
// its action named in `control`'s `analog`) sends how far each key is held, not only whether: a key
// of the keyboard or a mouse button held is 1; a gamepad button held is its `value`, so a trigger
// sends from where the browser first calls it pressed to 1 at the floor; a side of a stick held is
// how far past the dead zone it is pushed, 0 at the dead zone and 1 at the rim. A side of an axis or
// a stick is the most any of its keys holds, and the value sent is the positive side's less the
// negative side's; a hold is the most any of its keys holds, and 1 while it is toggled on. Each
// value sent is a whole number of steps over `world.player.resolution`, a whole number above 0,
// rounded away from the middle at a half: a stick swept slowly sends one message each time it
// crosses a step, and one held still, however its reading wanders inside a step, sends nothing. A
// table that reads anything analog in a scene that gives no `resolution` throws.
//
// Rumble. `rumble({ strong, weak, seconds })` shakes the gamepad that last had a key go down (a
// button pressed, a side of a stick pushed past the dead zone) for `seconds`, its heavy motor at
// `strong` and its light one at `weak`, each 0 to 1, replacing a rumble it is playing. A key of the
// keyboard or a mouse button pressed since, or no gamepad used yet, and nothing shakes: a pad left on
// the desk while the player is on the keyboard stays still. Neither does a gamepad the browser gives
// no `vibrationActuator`, as Firefox gives none. It is the plugin's own and not a message, as `bind`
// is: what the page feels of the seat's own thing, which no other seat and no rule hears.
//
// Actions: the second avenue. `bind`'s table binds what a seat does straight to keys. `control`'s
// binds it to the scene's actions instead, and the scene binds the keys to the actions, so a player
// can change which keys play which action and the game never knows. The scene names each action in
// `world.player.actions`, fixed for the scene and so carried by no row, with the `label` a screen
// shows it by and its `keys`, whose shape is what it is: a list of keys is a button, held while any
// of them is down; two lists are an axis, the keys that push it to -1 and the ones that push it to
// 1; four lists are a stick, left, right, up and down. `control`'s table is `bind`'s keyed by those
// actions: `press`, `release` and `hold` name buttons, `axis` axes and `stick` sticks, `every` is
// handed whether a button action is held, `locked` names button actions, and `drag` and `stroke`
// each name the button action whose keys they follow; `click`, `pointer`, `hover` and `wheel` are
// as they are in `bind`; `analog` names the axis, stick and hold actions read analog (Analog, above).
// It throws on an action the scene does not name, on one whose keys are not the shape the part of
// the table naming it reads, and on an `analog` action no `axis`, `stick` or `hold` of it reads.
// `bind` and `control` each replace the other as the table in force, and `unbind` drops either. On
// this avenue:
// - the sticks read the store's `player.deadzone` over `world.player.deadzone`, as `bind`'s do;
// - a gamepad key going down is offered to the UI (`keyDown`, and `keyUp` as it comes up) before it
//   is the game's, as a key from the keyboard is, so a pad moves through the UI's menus;
// - what the player chose is the page's, never the server's: four keys of the store, which the
//   scene lists before `player`, or it throws, so the store has ticked when they are read. A scene
//   that lists no store plays the scene's actions and settings and changes none.
//   - `player.keys`, the actions rebound, each to keys of the shape the scene gives it; an action
//     it leaves out has the scene's.
//   - `player.toggle`, the button actions played as toggles: a press of one of its keys holds it
//     and the next lets it go, so a `hold` sends the 1 and the 0 a held key sends, and no rule can
//     tell. A modal, or the pointer lock lost, lets a toggle go as it lets a key go.
//   - `player.deadzone`, in place of `world.player.deadzone`.
//   - `player.repeat`, in place of `world.player.repeat` (0 when the scene gives none): the seconds
//     between presses while a `press` action is held. Above 0 the keyboard's own repeats press
//     nothing and the action is pressed again every that many seconds, the first that long after it
//     went down, from a gamepad as from a key; at 0 a keyboard's repeat presses it again, as
//     `bind`'s does. An action with a `release` is pressed once a hold either way.
// What a screen that shows and changes the actions calls, all of it on the page:
// - `actions()`: each action the scene names, in its order, with its `name`, `label`, `shape`
//   (`button`, `axis` or `stick`), the `keys` it has now, the scene's `defaults`, and `bound`, the
//   parts of the table in force that name it.
// - `listen(fn)`: the next key, mouse button or gamepad button that goes down is handed to `fn` and
//   to nothing else, neither the game nor the UI, and `listening` is true until it is; `Escape`
//   hands `fn` undefined, as does `unbind`, and a click after a mouse button it took is nobody's.
// - `rebind(action, keys)`: `player.keys` given the action's new keys, in its shape, or it throws.
// - `restore(action?)`: the action's keys and its toggle back to the scene's; with no action, every
//   action's, and the deadzone and the repeat.
// - `conflicts()`: each key more than one action holds, with the actions holding it.
// - `settings()` and `configure(changes)`: the toggles, the deadzone and the repeat in force, and a
//   change to any of them, written to the store. A toggle is a button action; a deadzone is above 0
//   and below 1; a repeat is 0 or more seconds.
// - `device()`: what was used last: `keyboard` (a key or a mouse button), `xbox` or `playstation`
//   by the gamepad's `id`, or `pad` for any other.
// Each is the plugin's own and not a message, as `bind` is.
//
// What it read. On either avenue, for a screen that shows what the plugin hears, a controls screen's
// or a debug view's, two reads, each the plugin's own and on the page alone:
// - `pads()`: every gamepad connected as the last read of the gamepads found it (When, above), in the
//   order `getGamepads()` lists them: `{ index, id, family, mapping, used, buttons, axes }`, its place
//   in that list, its `id`, its family as `device()` names one (`xbox`, `playstation`, `pad`), the
//   browser's `mapping` (`standard`, or `''` for a gamepad it does not map), whether it is the one that
//   last had a key go down (Rumble, below), each button's `pressed` and `value`, and each axis, −1 to 1,
//   as the browser gave them, before any dead zone. Each is a copy, the page's to keep. Before the first
//   read, or with no gamepad connected, it is empty.
// - `held()`: every key held now, by the name a table gives it (`ArrowUp`, `Shift`, `Mouse0`, `Pad7`,
//   `PadStickLeft`), in the order each went down: what `press`, `axis` and the rest are asked of, so a
//   key a modal has let go of, or a `locked` key without the pointer lock, is not in it.
//
// A key or a mouse button the table names anywhere has its browser default cancelled, as the wheel
// does when `wheel` is in the table: Tab would move the focus off the page, the right button open a
// menu, the wheel scroll it.
// With Control, Command or Alt down it keeps its default, the wheel too, so the browser's shortcuts
// (zoom, find, copy, and zoom on the wheel or a trackpad's pinch) still work on a page that binds the
// key; the game still hears it.
// `locked` names keys the game hears only while the page holds the pointer lock, pressed under it:
// without it they are not held and `press` hears nothing of them, and one already down when a click
// takes the lock is not held until it is pressed again. So a strike on the left button and a block
// on the right are the game's while the mouse looks, and a click without the lock only takes it.
// The frame the page loses the pointer lock, every key held is let go, as its release would, and
// each is held again only on a new press.
// With `drag` in the table, `{ key, send }`, the mouse's movement while that key is down and the
// page holds no pointer lock is added up, and `send` is asked once each frame for a message from the
// page pixels it moved across and down; a frame it did not move asks nothing. `wheel` is asked once each
// frame the wheel turned, for a message from the pixels it turned down since the last one.
// With `hover` in the table, it is asked once each frame the mouse moved without the pointer lock,
// for a message from where the pointer is now, `[x, y]` in the canvas's pixels as `click` has them,
// or from `null` the frame it went over something on the UI that takes the pointer, or off the page:
// what the pointer is over, a cell a tool would build on, is drawn from it.
// With `stroke` in the table, `{ key, start, move, end, cancel }`, a press of `key`, a mouse button,
// that is not the UI's begins a stroke: `start` is asked for a message from where it went down,
// `move` once each frame the mouse moved while it is down from where it is now, and `end` from where
// it came up, which ends it, over the UI or not, so a road is laid from where a drag began to where
// it ended. A stroke the plugin lets go of without its release, as a modal lets every key go, asks
// `cancel` and nothing more. Each is left out to ask nothing, and each point is in the canvas's
// pixels.
// With `pointer` in the table, a click on the page takes the pointer lock for the element
// clicked, and while the page holds the lock the mouse's movement is added up and `pointer` is
// asked once each frame (When, above) for a message from the page pixels it moved across and
// down since the last one; a frame it did not move asks nothing. The
// table in force is the last one bound; `unbind` drops it and the
// listeners, and gives back a pointer lock this plugin took. Where there is no `document`, as in
// node, or one with no pointer lock, as the one the loader lends node while a model decodes, nothing
// holds the pointer lock and there is none to give back.
import type { Arg, Row } from '#engine/engine.ts'
import type { Plugins, Wire } from '#engine/browser.ts'
import { possessed } from '#addons/player/player.addon.ts'

// The `player` row this page plays as, among the rows it was sent: every seat is sent every `player`
// row, and its own is the one that is `mine` (`addons/player`).
export { possessed }

// The row this page's `player` row holds (`player.sim.ts`), among the rows it was sent, or undefined
// while it holds none: what a look binds the keys for and the camera follows, the frame the hold
// changes.
export function holding(rows: Row[]): Row | undefined {
  const h = possessed(rows)?.data.held as { kind: string; id: number } | null | undefined
  return h ? rows.find(r => r.id === h.id && r.kind === h.kind) : undefined
}

export type Input = [action: string, ...args: Arg[]]
export type Keys = string | string[]
export type Binds = {
  press?: Record<string, Input | (() => void)>
  release?: Record<string, () => void>
  axis?: { keys: [neg: Keys, pos: Keys]; send: (v: number) => Input | undefined; analog?: boolean }[]
  stick?: { keys: [left: Keys, right: Keys, up: Keys, down: Keys]; send: (x: number, y: number) => Input | undefined; analog?: boolean }[]
  hold?: { keys: string[]; send: (v: number) => Input | undefined; analog?: boolean }[]
  every?: (held: (key: string) => boolean) => Input | undefined
  click?: (x: number, y: number) => Input | undefined
  pointer?: (dx: number, dy: number) => Input | undefined
  drag?: { key: string; send: (dx: number, dy: number) => Input | undefined }
  hover?: (at: [number, number] | null) => Input | undefined
  stroke?: {
    key: string
    start?: (x: number, y: number) => Input | undefined
    move?: (x: number, y: number) => Input | undefined
    end?: (x: number, y: number) => Input | undefined
    cancel?: () => Input | undefined
  }
  wheel?: (dy: number) => Input | undefined
  locked?: string[]
}

// The action avenue (Actions, above). An action's keys, whose shape is what it is: a button's list,
// an axis's two lists, a stick's four.
export type Bound = string[] | string[][]
export type Shape = 'button' | 'axis' | 'stick'
// An action as the scene names it in `world.player.actions`.
export type Action = { label: string; keys: Bound }
// An action as a screen reads it, from `actions()`.
export type Shown = { name: string; label: string; shape: Shape; keys: Bound; defaults: Bound; bound: string[] }
export type Settings = { toggle: string[]; deadzone: number | undefined; repeat: number }
export type Device = 'keyboard' | 'xbox' | 'playstation' | 'pad'
// A shake of the gamepad last used (Rumble, above): each motor 0 to 1, for `seconds`.
export type Rumble = { strong: number; weak: number; seconds: number }
// A gamepad as the last read found it, from `pads()` (What it read, above).
export type Pad = {
  index: number; id: string; family: Exclude<Device, 'keyboard'>; mapping: string; used: boolean
  buttons: { pressed: boolean; value: number }[]; axes: number[]
}
// `control`'s table: `Binds` keyed by the scene's actions instead of keys.
export type Controls = {
  press?: Record<string, Input | (() => void)>
  release?: Record<string, () => void>
  axis?: Record<string, (v: number) => Input | undefined>
  stick?: Record<string, (x: number, y: number) => Input | undefined>
  hold?: Record<string, (v: number) => Input | undefined>
  analog?: string[]
  every?: (held: (action: string) => boolean) => Input | undefined
  click?: (x: number, y: number) => Input | undefined
  pointer?: (dx: number, dy: number) => Input | undefined
  drag?: { action: string; send: (dx: number, dy: number) => Input | undefined }
  hover?: (at: [number, number] | null) => Input | undefined
  stroke?: {
    action: string
    start?: (x: number, y: number) => Input | undefined
    move?: (x: number, y: number) => Input | undefined
    end?: (x: number, y: number) => Input | undefined
    cancel?: () => Input | undefined
  }
  wheel?: (dy: number) => Input | undefined
  locked?: string[]
}

// The shape of an action's keys: a list of keys is a button, two lists an axis, four a stick.
export function shapeOf(keys: Bound): Shape {
  if (keys.every(k => typeof k === 'string')) return 'button'
  if (keys.every(k => Array.isArray(k) && k.every(x => typeof x === 'string'))) {
    if (keys.length === 2) return 'axis'
    if (keys.length === 4) return 'stick'
  }
  throw new Error(`keys ${JSON.stringify(keys)} are not a button's list, an axis's two lists or a stick's four`)
}

// The keys whose name is not their `code` with a side or a prefix taken off: what each types on a
// US keyboard without Shift, or with NumLock on for the number pad's.
const TYPED: Record<string, string> = {
  Space: ' ', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';',
  Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/', OSLeft: 'Meta', OSRight: 'Meta',
  NumpadDecimal: '.', NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/',
  NumpadEnter: 'Enter', NumpadEqual: '=', NumpadComma: ',',
}

// The four sides of the left stick and of the right, each a key, left, right, up and down.
const STICK = ['PadStickLeft', 'PadStickRight', 'PadStickUp', 'PadStickDown']
const RIGHT = ['PadRightStickLeft', 'PadRightStickRight', 'PadRightStickUp', 'PadRightStickDown']
const SIDES = [...STICK, ...RIGHT]

// The name a binding gives the key at `code`, a `KeyboardEvent.code`: `KeyA` is `a`, `Digit1` and
// `Numpad1` are `1`, `Space` is `' '`, `ShiftLeft` and `ShiftRight` are `Shift` (and so Control, Alt
// and Meta), a punctuation key is what it types without Shift (`Minus` is `-`), and any other key is
// its code, which for every key the page names alike is its `key` too (`ArrowLeft`, `Escape`,
// `Enter`, `Tab`, `F1`).
export function keyName(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code[3].toLowerCase()
  if (/^(Digit|Numpad)\d$/.test(code)) return code[code.length - 1]
  const side = /^(Shift|Control|Alt|Meta)(Left|Right)$/.exec(code)
  return side ? side[1] : (TYPED[code] ?? code)
}

// The `code` of the key a table names, the one a key event from that key carries: `keyName` run
// backwards, taking the main keyboard's key over the number pad's and the left of a pair of
// modifiers. A letter may be given in either case, as the page types it with Shift down. It is what
// a test builds a key event from, as the browser would send it.
export function keyCode(name: string): string {
  if (/^[a-z]$/i.test(name)) return `Key${name.toUpperCase()}`
  if (/^\d$/.test(name)) return `Digit${name}`
  if (/^(Shift|Control|Alt|Meta)$/.test(name)) return `${name}Left`
  return Object.keys(TYPED).find(c => !/^(Numpad|OS)/.test(c) && TYPED[c] === name) ?? name
}

// The name of the key a key event is from, the one every table names it by, `world.ui`'s
// too: `keyName` of its `code`, so the key that comes up is the one that went down whatever Shift
// did in between. A key with no place, as an on-screen keyboard's, is named by what it typed, a
// letter in lower case.
export function keyOf(e: KeyboardEvent): string {
  return e.code && e.code !== 'Unidentified' ? keyName(e.code) : /^[A-Z]$/.test(e.key) ? e.key.toLowerCase() : e.key
}

export function player() {
  let wire: Wire | undefined
  let all: Plugins | undefined
  // Calls made before the plugin has its wire, as an actor's setup makes them on a client's first
  // frame: sent at its first `input` or `tick`.
  const waiting: (() => void)[] = []
  let gathered = false // this frame's polled input went up in `input`, before the page's steps

  const send = (name: string, args: Arg[]) => {
    const me = possessed(wire!.rows)
    if (!me) throw new Error('no player row on this seat')
    wire!.send(me.id, name, ...args)
  }
  // A message up the wire now, or, before the plugin has its wire, at its first `input` or `tick`.
  const post = (name: string, args: Arg[]) => { if (wire) send(name, args); else waiting.push(() => send(name, args)) }

  function take(p: Plugins) {
    all = p
    wire = p.wire
    for (const f of waiting.splice(0)) f()
  }

  // Before the page's steps (`client.input()`, the Header): what is read once a frame, sent now, so
  // the steps the page's loop is about to run take it.
  function feed(p: Plugins) {
    take(p)
    gather()
    gathered = true
  }

  // In a frame whose page called no `input`, as `client.html`'s and a test's frames call none, what is
  // read once a frame is read here instead.
  function tick(p: Plugins) {
    take(p)
    if (!gathered) gather()
  }

  // What is read once a frame: the gamepads, the repeat, `every`, and what the mouse and the wheel
  // added up to since the last time.
  function gather() {
    const now = performance.now()
    if (controls) refresh()
    // Every key held as the lock was lost is let go, and every toggle with them.
    const hasLock = !!lockedTo()
    if (hadLock && !hasLock) { down.clear(); armed.clear(); latched.clear() }
    hadLock = hasLock
    // A gamepad key going down is pressed and held as a key's is, but not while a modal has the
    // input: one down then is held only on a new press, as a key is once a modal has let it go.
    // Every key a poll moved is moved before the axes are asked, so a stick swung from one side to
    // the other between two frames sends the one way it holds now.
    if ((binds || controls) && sticks && deadzone() === undefined) throw new Error('the player table holds a side of a stick, and the scene gives no world.player.deadzone')
    // The gamepad keys down on this client's first frame were pressed before it: taken as down
    // already, so each is held only on a new press. The sticks are read by the scene's dead zone, as
    // the store may tick after this on the first frame; the frame after reads by the player's own.
    if (!polled) {
      polled = true
      pads = poll(wire?.scene.world?.player?.deadzone)
    }
    if (binds) {
      const now = poll(deadzone()), modal = !!all?.ui?.modal()
      for (const k of pads) if (!now.has(k)) { down.delete(k); armed.delete(k) }
      for (const k of now) {
        if (pads.has(k)) continue
        touched = padAt.get(k)
        if (!modal) { hold(k); pressed(k) }
      }
      pads = now
    }
    // On the action avenue a gamepad key going down is handed to a `listen` waiting for one, else
    // offered to the UI, as a key from the keyboard is, and is the game's only when neither takes it;
    // each one handed to the UI is handed it again as it comes up.
    if (controls) {
      const now = poll(deadzone()), modal = !!all?.ui?.modal()
      for (const k of pads) if (!now.has(k)) { down.delete(k); armed.delete(k); all?.ui?.keyUp?.(k) }
      for (const k of now) {
        if (pads.has(k)) continue
        used = family(padOf.get(k) ?? '')
        touched = padAt.get(k)
        if (listener) hear(k)
        else if (all?.ui?.keyDown?.(k)) continue
        else if (!modal) { hold(k); act(k, true) }
      }
      pads = now
    }
    axes()
    if (all?.ui?.modal()) letGo()
    if (controls) repeating(now)
    const t = binds ?? controls
    if (binds?.every) input(binds.every(held))
    if (controls?.every) input(controls.every(heldAction))
    if (t?.pointer && (moved[0] || moved[1])) input(t.pointer(moved[0], moved[1]))
    if (t?.drag && (dragged[0] || dragged[1])) input(t.drag.send(dragged[0], dragged[1]))
    if (t?.hover && hovered !== undefined) input(t.hover(hovered))
    hovered = undefined
    if (stroking && stroked) input(t?.stroke?.move?.(...stroked))
    stroked = undefined
    if (t?.wheel && turned) input(t.wheel(turned))
    moved = [0, 0]
    dragged = [0, 0]
    turned = 0
  }

  let binds: Binds | undefined
  let listening = false
  const down = new Set<string>()
  let values: number[] = [] // per axis, the value last sent
  let pushed: [number, number][] = [] // per stick, the value last sent
  let holding: number[] = [] // per hold, the value last sent
  let moved = [0, 0] // pixels across and down since the last tick, while the page holds the lock
  let dragged = [0, 0] // pixels across and down since the last tick, while the drag's key is down without the lock
  let turned = 0 // the wheel's pixels down since the last tick
  let hovered: [number, number] | null | undefined // where the pointer moved to since the last tick, null over the UI or off the page
  let stroking = false // the stroke's key went down off the UI and has not come up
  let stroked: [number, number] | undefined // where the pointer moved to during the stroke since the last tick
  let locked = false // this plugin asked for the pointer lock and has not given it back
  let bound = new Set<string>() // every key the table names
  let lockOnly = new Set<string>() // the table's `locked` keys
  const armed = new Set<string>() // the `locked` keys pressed while the page held the lock
  let hadLock = false // the page held the pointer lock at the last tick
  let sticks = false // the table names a side of the left stick
  let pads = new Set<string>() // the gamepad keys down at the last poll
  const padOf = new Map<string, string>() // each gamepad key down at the last poll, and the `id` of a gamepad holding it
  const padAt = new Map<string, number>() // each gamepad key down at the last poll, and where that gamepad is in `getGamepads()`
  const level = new Map<string, number>() // each gamepad key down at the last poll, and how far the most of any gamepad holds it, 0 to 1
  let seen: Omit<Pad, 'used'>[] = [] // every gamepad connected at the last poll, copied
  let touched: number | undefined // where in `getGamepads()` the gamepad that last had a key go down is, unless a key or a mouse button went down since
  let polled = false // the gamepads have been read on this client's first frame
  let used: Device = 'keyboard' // what was used last

  // ------------------------------------------------ the action avenue (`control`)

  let controls: Controls | undefined
  let keysOf = new Map<string, Bound>() // every action the scene names, with the keys it has now
  let toggles = new Set<string>() // the button actions played as toggles
  const latched = new Set<string>() // the toggled actions a press turned on
  let acted = new Map<string, number>() // per axis, stick side and hold, the value last sent
  let wasHeld = new Set<string>() // the release actions held when the actions were last settled
  const due = new Map<string, number>() // per press action held under the repeat, the page's time it is pressed again
  let listener: ((key: string | undefined) => void) | undefined // what `listen` hands the next key to
  let swallow = false // a mouse button `listen` took, whose click is nobody's

  const scened = (): Record<string, Action> => wire?.scene.world?.player?.actions ?? {}
  const stored = (key: string): any => {
    const s = all?.store
    if (!s || !s.has(key)) return undefined
    const v = s.get(key)
    return v === null ? undefined : v
  }
  const store = () => {
    if (!all?.store) throw new Error('the scene lists no store, so nothing the player changes can be kept')
    return all.store
  }
  const deadzone = (): number | undefined => stored('player.deadzone') ?? wire?.scene.world?.player?.deadzone
  const repeat = (): number => stored('player.repeat') ?? wire?.scene.world?.player?.repeat ?? 0
  const action = (name: string): Action => {
    const a = scened()[name]
    if (!a) throw new Error(`the scene's world.player.actions names no ${name}`)
    return a
  }
  const shape = (name: string) => shapeOf(keysOf.get(name) ?? action(name).keys)
  const buttonKeys = (name: string) => keysOf.get(name) as string[]
  // Every part of a table naming an action, with the shape that part reads.
  const parts = (t: Controls): [part: string, name: string, shape: Shape][] => [
    ...Object.keys(t.press ?? {}).map((a): [string, string, Shape] => ['press', a, 'button']),
    ...Object.keys(t.release ?? {}).map((a): [string, string, Shape] => ['release', a, 'button']),
    ...Object.keys(t.hold ?? {}).map((a): [string, string, Shape] => ['hold', a, 'button']),
    ...Object.keys(t.axis ?? {}).map((a): [string, string, Shape] => ['axis', a, 'axis']),
    ...Object.keys(t.stick ?? {}).map((a): [string, string, Shape] => ['stick', a, 'stick']),
    ...(t.locked ?? []).map((a): [string, string, Shape] => ['locked', a, 'button']),
    ...(t.drag ? [['drag', t.drag.action, 'button'] as [string, string, Shape]] : []),
    ...(t.stroke ? [['stroke', t.stroke.action, 'button'] as [string, string, Shape]] : []),
  ]
  // The keys every action has now: the store's where the player rebound it, else the scene's. Read
  // each frame and after every change, so what the store says is what the keys do.
  function refresh() {
    if (!wire || !controls) return
    const order: string[] = wire.scene.plugins ?? []
    if (order.includes('store') && order.indexOf('store') > order.indexOf('player')) throw new Error('store is listed after player, so the player would read the store of the frame before')
    const acts = scened(), chosen: Record<string, Bound> = stored('player.keys') ?? {}
    keysOf = new Map()
    for (const [name, a] of Object.entries(acts)) {
      const mine = chosen[name]
      if (mine !== undefined && shapeOf(mine) !== shapeOf(a.keys)) throw new Error(`the store's player.keys gives ${name} keys of another shape than the scene's`)
      keysOf.set(name, mine ?? a.keys)
    }
    toggles = new Set(stored('player.toggle') ?? [])
    for (const [part, name, want] of parts(controls)) {
      if (!(name in acts)) throw new Error(`the player table's ${part} names ${name}, which the scene's world.player.actions does not`)
      if (shape(name) !== want) throw new Error(`the player table's ${part} reads ${name} as a ${want}, and the scene gives it the keys of a ${shape(name)}`)
    }
    for (const name of controls.analog ?? []) {
      if (!(name in (controls.axis ?? {})) && !(name in (controls.stick ?? {})) && !(name in (controls.hold ?? {}))) throw new Error(`the player table reads ${name} analog, and no axis, stick or hold of it names ${name}`)
    }
    bound = new Set([...keysOf.values()].flatMap(k => k.flat()))
    lockOnly = new Set((controls.locked ?? []).flatMap(buttonKeys))
    sticks = SIDES.some(k => bound.has(k))
  }
  // A button action is held while any of its keys is, or, played as a toggle, from one press to the next.
  const pushedDown = (name: string) => buttonKeys(name).some(held)
  const isHeld = (name: string) => (toggles.has(name) ? latched.has(name) : pushedDown(name))
  // What `every` is handed on the action avenue: whether a button action is held.
  const heldAction = (name: string) => {
    if (shape(name) !== 'button') throw new Error(`every asked whether ${name} is held, and it is not a button`)
    return isHeld(name)
  }
  const dragging = () =>
    binds?.drag ? down.has(binds.drag.key) : !!controls?.drag && buttonKeys(controls.drag.action).some(k => down.has(k))
  const strokes = (key: string) =>
    binds?.stroke ? key === binds.stroke.key : !!controls?.stroke && buttonKeys(controls.stroke.action).includes(key)
  // Each action's value against the one last sent: an axis's, a stick's and a hold's sent when it
  // changed, and a release run when its action stopped being held.
  const settle = () => {
    const c = controls!
    const changed = (k: string, v: number) => {
      if (v === (acted.get(k) ?? 0)) return false
      acted.set(k, v)
      return true
    }
    const analog = new Set(c.analog ?? [])
    const along = (name: string, neg: string[], pos: string[]) => (analog.has(name) ? reach(neg, pos) : way(neg, pos))
    for (const [name, f] of Object.entries(c.axis ?? {})) {
      const [neg, pos] = keysOf.get(name) as string[][]
      const v = along(name, neg, pos)
      if (changed(`axis ${name}`, v)) input(f(v))
    }
    for (const [name, f] of Object.entries(c.stick ?? {})) {
      const [left, right, up, dn] = keysOf.get(name) as string[][]
      const x = along(name, left, right), y = along(name, up, dn)
      const moved = [changed(`x ${name}`, x), changed(`y ${name}`, y)]
      if (moved[0] || moved[1]) input(f(x, y))
    }
    for (const [name, f] of Object.entries(c.hold ?? {})) {
      const v = !analog.has(name) || toggles.has(name) ? (isHeld(name) ? 1 : 0) : stepped(most(buttonKeys(name)))
      if (changed(`hold ${name}`, v)) input(f(v))
    }
    for (const [name, f] of Object.entries(c.release ?? {})) {
      if (isHeld(name)) wasHeld.add(name)
      else if (wasHeld.delete(name)) f()
    }
  }
  const fire = (name: string) => {
    const it = controls?.press?.[name]
    if (typeof it === 'function') it()
    else input(it)
  }
  // A key going down, `fresh` unless it is the keyboard's repeat of one already down: each button
  // action it is a key of is turned on or off when played as a toggle, and pressed. An action with a
  // `release` is pressed once per hold; any other on each fresh press, and on the keyboard's repeats
  // too while the repeat setting is 0.
  const act = (key: string, fresh: boolean) => {
    if (lockOnly.has(key) && !lockedTo()) return
    const r = repeat()
    for (const [name, keys] of keysOf) {
      if (shapeOf(keys) !== 'button' || !(keys as string[]).includes(key)) continue
      if (toggles.has(name) && fresh && !latched.delete(name)) latched.add(name)
      if (controls?.press?.[name] === undefined) continue
      if (controls.release?.[name]) {
        if (!wasHeld.has(name) && isHeld(name)) fire(name)
        continue
      }
      if (!fresh && r > 0) continue
      fire(name)
      if (r > 0) due.set(name, performance.now() + r * 1000)
    }
  }
  // Each press action held under the repeat, pressed again each time its time comes round.
  const repeating = (now: number) => {
    const r = repeat()
    if (!(r > 0)) return due.clear()
    for (const [name, at] of due) {
      if (!controls?.press?.[name] || !pushedDown(name)) { due.delete(name); continue }
      let next = at
      while (now >= next) { fire(name); next += r * 1000 }
      due.set(name, next)
    }
  }
  // The key `listen` waited for, handed on; Escape hands it nothing.
  const hear = (key: string) => {
    const f = listener!
    listener = undefined
    f(key === 'Escape' ? undefined : key)
  }
  // A gamepad's kind, by the name its `id` gives it or the USB vendor in it: Microsoft's is 045e,
  // Sony's 054c.
  const family = (id: string): Device =>
    /xbox|xinput|045e/i.test(id) ? 'xbox' : /playstation|dualshock|dualsense|054c/i.test(id) ? 'playstation' : 'pad'
  // The gamepad keys down on every gamepad connected: each button pressed, and each side of either
  // stick past the dead zone. Each key is also written into `padOf` with the `id` of a gamepad
  // holding it, into `padAt` with where that gamepad is, and into `level` with how far the most of
  // any gamepad holds it: a button its `value`, a side of a stick how far past the dead zone it is
  // pushed, out of the rest of the way to the rim.
  const poll = (deadzone: number | undefined): Set<string> => {
    const now = new Set<string>()
    padOf.clear()
    padAt.clear()
    level.clear()
    seen = []
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return now
    navigator.getGamepads().forEach((pad, at) => {
      if (!pad?.connected) return
      seen.push({
        index: at, id: pad.id, family: family(pad.id) as Pad['family'], mapping: pad.mapping,
        buttons: pad.buttons.map(b => ({ pressed: b.pressed, value: b.value })), axes: [...pad.axes],
      })
      const add = (k: string, v: number) => {
        if (!now.has(k)) { padOf.set(k, pad.id ?? ''); padAt.set(k, at) }
        now.add(k)
        level.set(k, Math.max(level.get(k) ?? 0, v))
      }
      // A button is down past the dead zone too: a trigger resting a little in is not pressed.
      pad.buttons.forEach((b, i) => { if (b.pressed && (deadzone === undefined || b.value > deadzone)) add(`Pad${i}`, b.value) })
      if (deadzone === undefined) return
      const past = (a: number) => Math.min(1, (Math.abs(a) - deadzone) / (1 - deadzone))
      // A gamepad of one stick has two axes; the standard mapping's right stick is the third and fourth.
      const sides = pad.axes.length >= 4 ? [STICK, RIGHT] : [STICK]
      sides.forEach((names, s) => {
        const [x, y] = [pad.axes[2 * s], pad.axes[2 * s + 1]]
        if (x < -deadzone) add(names[0], past(x))
        if (x > deadzone) add(names[1], past(x))
        if (y < -deadzone) add(names[2], past(y))
        if (y > deadzone) add(names[3], past(y))
      })
    })
    return now
  }
  // How far a key is held, 0 to 1 (Analog, above): a gamepad key as far as the last poll found it,
  // any other key held all the way.
  const amount = (key: string) => (held(key) ? (level.get(key) ?? 1) : 0)
  const most = (keys: Keys) => (typeof keys === 'string' ? amount(keys) : Math.max(0, ...keys.map(amount)))
  // A value to a whole number of steps over `world.player.resolution`, a half rounded away from 0.
  const stepped = (v: number) => {
    const r = wire?.scene.world?.player?.resolution
    if (!(Number.isInteger(r) && r > 0)) throw new Error(`the player table reads a key analog, and the scene's world.player.resolution is ${r}, not a whole number of steps above 0`)
    return (Math.sign(v) * Math.round(Math.abs(v) * r)) / r || 0
  }
  // An axis or a side of a stick read analog: how far its positive keys hold it, less its negative ones.
  const reach = (neg: Keys, pos: Keys) => stepped(most(pos) - most(neg))
  // The element holding the pointer lock, or null.
  const lockedTo = () => (typeof document === 'undefined' ? null : document.pointerLockElement ?? null)
  const held = (key: string) => down.has(key) && (!lockOnly.has(key) || (armed.has(key) && !!lockedTo()))
  // A bound key keeps its browser default under Control, Command or Alt.
  const cancel = (e: KeyboardEvent | MouseEvent, key: string) => { if (bound.has(key) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault() }
  const hold = (key: string) => {
    down.add(key)
    if (lockOnly.has(key) && lockedTo()) armed.add(key)
  }
  const lift = (key: string) => {
    if (down.has(key)) binds?.release?.[key]?.()
    down.delete(key)
    armed.delete(key)
    axes()
  }
  const any = (keys: Keys) => (typeof keys === 'string' ? held(keys) : keys.some(held))
  const way = (neg: Keys, pos: Keys) => (any(pos) ? 1 : 0) - (any(neg) ? 1 : 0)
  const input = (i: Input | undefined) => { if (i) post(i[0], i.slice(1)) }
  const axes = () => {
    if (controls) return settle()
    binds?.axis?.forEach((a, i) => {
      const v = (a.analog ? reach : way)(a.keys[0], a.keys[1])
      if (v !== values[i]) { values[i] = v; input(a.send(v)) }
    })
    binds?.stick?.forEach((st, i) => {
      const [left, right, up, down] = st.keys
      const along = st.analog ? reach : way
      const x = along(left, right), y = along(up, down)
      if (x !== pushed[i][0] || y !== pushed[i][1]) { pushed[i] = [x, y]; input(st.send(x, y)) }
    })
    binds?.hold?.forEach((h, i) => {
      const v = h.analog ? stepped(most(h.keys)) : h.keys.some(held) ? 1 : 0
      if (v !== holding[i]) { holding[i] = v; input(h.send(v)) }
    })
  }
  const pressed = (key: string) => {
    if (controls) return act(key, true)
    if (lockOnly.has(key) && !lockedTo()) return
    const it = binds?.press?.[key]
    if (typeof it === 'function') it()
    else input(it)
  }
  // A key typed into a field of the page, a panel's text box or number, say, is the field's.
  const typed = (e: KeyboardEvent) => {
    const t = e.target as { tagName?: string; isContentEditable?: boolean } | null
    return !!t && (t.isContentEditable === true || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')
  }
  const onDown = (e: KeyboardEvent) => {
    // The UI takes no key while this listens, so a key it took is the one that began the listening.
    if (all?.ui?.took(e)) return
    if (listener && !typed(e)) {
      used = 'keyboard'
      e.preventDefault()
      if (!e.repeat) hear(keyOf(e))
      return
    }
    if (typed(e)) return
    used = 'keyboard'
    touched = undefined
    const key = keyOf(e)
    cancel(e, key)
    const fresh = !down.has(key)
    const again = !fresh && !!binds?.release?.[key]
    hold(key)
    if (controls) act(key, fresh)
    else if (!again) pressed(key)
    axes()
  }
  const onUp = (e: KeyboardEvent) => lift(keyOf(e))
  const button = (e: MouseEvent) => `Mouse${e.button}`
  // `offsetX` is measured against the element under the pointer, which over the game is the UI's
  // canvas, laid in the same box as the game's: the same numbers either way. They are CSS pixels,
  // and the canvas's are those divided by the renderer's `scale`, which render2d's `fit` sets.
  const point = (e: MouseEvent): [number, number] => {
    const s = (all?.render3d ?? all?.render2d)?.scale ?? 1
    return [e.offsetX / s, e.offsetY / s]
  }
  const ui = (e: MouseEvent) => !!all?.ui?.hit(...point(e))
  const onPress = (e: MouseEvent) => {
    used = 'keyboard'
    touched = undefined
    if (listener) {
      e.preventDefault()
      swallow = true
      hear(button(e))
      return
    }
    if (ui(e)) return
    cancel(e, button(e))
    hold(button(e))
    pressed(button(e))
    axes()
    const t = binds ?? controls
    if (t?.stroke && strokes(button(e)) && !lockedTo()) {
      stroking = true
      stroked = undefined
      input(t.stroke.start?.(...point(e)))
    }
  }
  const onRelease = (e: MouseEvent) => {
    lift(button(e))
    const t = binds ?? controls
    if (stroking && t?.stroke && strokes(button(e))) {
      stroking = false
      stroked = undefined
      input(t.stroke.end?.(...point(e)))
    }
  }
  const onMenu = (e: MouseEvent) => { if (bound.has('Mouse2')) e.preventDefault() }
  const onMove = (e: MouseEvent) => {
    if (lockedTo()) {
      moved[0] += e.movementX
      moved[1] += e.movementY
      return
    }
    if (dragging()) {
      dragged[0] += e.movementX
      dragged[1] += e.movementY
    }
    if ((binds ?? controls)?.hover) hovered = ui(e) ? null : point(e)
    if (stroking) stroked = point(e)
  }
  // The pointer leaving the page, into nothing, is over nothing to hover.
  const onOut = (e: MouseEvent) => { if ((binds ?? controls)?.hover && !e.relatedTarget) hovered = null }
  const onWheel = (e: WheelEvent) => {
    if (!(binds ?? controls)?.wheel || ui(e)) return
    if (!e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault()
    turned += e.deltaY
  }
  // One door. A click on the UI is the UI's, which PixiJS hands to the thing clicked, and is not a
  // game message.
  const onClick = (e: MouseEvent) => {
    if (swallow) { swallow = false; return }
    if (ui(e)) return
    const t = binds ?? controls
    if (t?.pointer && !lockedTo()) {
      locked = true
      void (e.target as Element).requestPointerLock()
    }
    input(t?.click?.(...point(e)))
  }

  function bind(table: Binds) {
    controls = undefined
    binds = table
    const each = (k: Keys) => (typeof k === 'string' ? [k] : k)
    bound = new Set([
      ...Object.keys(table.press ?? {}),
      ...Object.keys(table.release ?? {}),
      ...(table.axis ?? []).flatMap(a => a.keys.flatMap(each)),
      ...(table.stick ?? []).flatMap(st => st.keys.flatMap(each)),
      ...(table.hold ?? []).flatMap(h => h.keys),
      ...(table.drag ? [table.drag.key] : []),
      ...(table.stroke ? [table.stroke.key] : []),
      ...(table.locked ?? []),
    ])
    lockOnly = new Set(table.locked ?? [])
    sticks = SIDES.some(k => bound.has(k))
    values = (table.axis ?? []).map(() => 0)
    pushed = (table.stick ?? []).map(() => [0, 0])
    holding = (table.hold ?? []).map(() => 0)
    attach()
  }

  function attach() {
    if (listening) return
    listening = true
    addEventListener('keydown', onDown)
    addEventListener('keyup', onUp)
    addEventListener('click', onClick)
    addEventListener('mousedown', onPress)
    addEventListener('mouseup', onRelease)
    addEventListener('mousemove', onMove)
    addEventListener('mouseout', onOut)
    addEventListener('contextmenu', onMenu)
    addEventListener('wheel', onWheel, { passive: false })
  }

  // Nothing held, and no pointer lock this plugin took.
  function letGo() {
    armed.clear()
    due.clear()
    for (const key of down) binds?.release?.[key]?.()
    if (down.size || latched.size) {
      down.clear()
      latched.clear()
      axes()
    }
    moved = [0, 0]
    dragged = [0, 0]
    turned = 0
    if (stroking) {
      stroking = false
      stroked = undefined
      input(binds?.stroke?.cancel?.())
    }
    if (locked) {
      locked = false
      if (typeof document !== 'undefined' && typeof document.exitPointerLock === 'function') document.exitPointerLock()
    }
  }

  function unbind() {
    letGo()
    if (listener) hear('Escape')
    binds = undefined
    controls = undefined
    if (!listening) return
    listening = false
    removeEventListener('keydown', onDown)
    removeEventListener('keyup', onUp)
    removeEventListener('click', onClick)
    removeEventListener('mousedown', onPress)
    removeEventListener('mouseup', onRelease)
    removeEventListener('mousemove', onMove)
    removeEventListener('mouseout', onOut)
    removeEventListener('contextmenu', onMenu)
    removeEventListener('wheel', onWheel)
  }

  function control(table: Controls) {
    binds = undefined
    controls = table
    acted = new Map()
    wasHeld = new Set()
    latched.clear()
    due.clear()
    refresh()
    attach()
  }

  // ------------------------------------------------ rebinding (the action avenue's, the page's alone)

  function actions(): Shown[] {
    const t = controls ? parts(controls) : []
    return Object.entries(scened()).map(([name, a]) => ({
      name,
      label: a.label,
      shape: shapeOf(a.keys),
      keys: keysOf.get(name) ?? stored('player.keys')?.[name] ?? a.keys,
      defaults: a.keys,
      bound: t.filter(([, n]) => n === name).map(([part]) => part),
    }))
  }

  function listen(fn: (key: string | undefined) => void) {
    if (listener) hear('Escape')
    letGo()
    listener = fn
  }

  function rebind(name: string, keys: Bound) {
    const a = action(name)
    if (shapeOf(keys) !== shapeOf(a.keys)) throw new Error(`${name} is a ${shapeOf(a.keys)} and was given ${JSON.stringify(keys)}`)
    store().set('player.keys', { ...(stored('player.keys') ?? {}), [name]: keys })
    refresh()
  }

  function restore(name?: string) {
    if (name === undefined) {
      store().set('player.keys', {})
      store().set('player.toggle', [])
      store().set('player.deadzone', null)
      store().set('player.repeat', null)
    } else {
      action(name)
      const { [name]: _, ...rest } = stored('player.keys') ?? {}
      store().set('player.keys', rest)
      store().set('player.toggle', (stored('player.toggle') ?? []).filter((t: string) => t !== name))
    }
    latched.clear()
    due.clear()
    refresh()
  }

  function conflicts(): { key: string; actions: string[] }[] {
    const by = new Map<string, string[]>()
    for (const name of Object.keys(scened())) {
      const keys: Bound = keysOf.get(name) ?? stored('player.keys')?.[name] ?? action(name).keys
      for (const k of new Set(keys.flat())) by.set(k, [...(by.get(k) ?? []), name])
    }
    return [...by].filter(([, names]) => names.length > 1).map(([key, names]) => ({ key, actions: names }))
  }

  function settings(): Settings {
    return { toggle: [...(stored('player.toggle') ?? [])], deadzone: deadzone(), repeat: repeat() }
  }

  function configure(changes: Partial<Settings>) {
    if (changes.toggle) {
      for (const name of changes.toggle) if (shapeOf(action(name).keys) !== 'button') throw new Error(`${name} is not a button, and only a button toggles`)
      store().set('player.toggle', [...changes.toggle])
      latched.clear()
    }
    if (changes.deadzone !== undefined) {
      if (!(changes.deadzone > 0 && changes.deadzone < 1)) throw new Error(`a deadzone is a fraction of the way out, above 0 and below 1, not ${changes.deadzone}`)
      store().set('player.deadzone', changes.deadzone)
    }
    if (changes.repeat !== undefined) {
      if (!(changes.repeat >= 0)) throw new Error(`a repeat is 0 or more seconds, not ${changes.repeat}`)
      store().set('player.repeat', changes.repeat)
      due.clear()
    }
    refresh()
  }

  // ------------------------------------------------ rumble (the page's alone)

  function rumble({ strong, weak, seconds }: Rumble) {
    if (!(strong >= 0 && strong <= 1 && weak >= 0 && weak <= 1 && seconds > 0)) throw new Error(`a rumble's strong and weak are 0 to 1 and its seconds above 0, not ${strong}, ${weak} and ${seconds}`)
    if (touched === undefined || typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return
    const pad = navigator.getGamepads()[touched]
    // The browser's own: Firefox gives a gamepad no actuator.
    const motors = pad?.connected ? pad.vibrationActuator : undefined
    if (!motors) return
    // A rumble begun while another plays preempts it, and the browser rejects the one cut short: no failure.
    motors.playEffect('dual-rumble', { startDelay: 0, duration: seconds * 1000, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {})
  }

  return new Proxy(
    // Closing the client drops the table and every listener on the page, as `unbind` does.
    {
      tick, input: feed, afterTick() { gathered = false }, bind, unbind, close: unbind,
      control, actions, listen, rebind, restore, conflicts, settings, configure, device: () => used, rumble,
      pads: (): Pad[] => seen.map(p => ({ ...p, used: p.index === touched, buttons: p.buttons.map(b => ({ ...b })), axes: [...p.axes] })),
      held: (): string[] => [...down].filter(held),
      get listening() { return !!listener },
    },
    {
      get: (t: any, name: string) =>
        name in t ? t[name] : (...args: Arg[]) => post(name, args),
    },
  ) as Record<string, (...args: any[]) => void>
}
