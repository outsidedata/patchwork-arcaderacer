---
name: designing-a-seat
description: Use in core, or any clone of it, whenever a game gives a player something to control, and before writing or changing any `player.sim.ts`, `player.client.ts`, a `player` prefab or definition, or a page that runs a scene ahead. Covers the two paths: the simple one, where the player row is the thing itself (the gun, the hero, the hand — never a row that spawns them), and complex behavior, where the player row is the seat and holds rows of other kinds with core's take, letGo, holding, holderOf and relay; every seat being sent every player row with `mine` on its own, `possessed(rows)`, private fields through `security`, what a player look draws for every seat and what only for its own, acts a seat could send to cheat, a seat whose thing has more than one mode or takes hold of other rows (getting in and out of a vehicle, a mount, a turret, a crane, a spectator mode), and the press test that proves the seat's own thing is predicted. Triggers on "the player", "a seat", "what the player controls", "my car lags", "input delay", "prediction does nothing", "the other player's car", "spawn the body", "get in the car", "enter the vehicle", "get out", "mount", "switch what the player controls", "hand control to", and on reading a game whose player row spawns its car, body or gun.
---

# Designing a seat

## The rule

**The `player` row is the seat.** A seat possesses one row, and the acts it sends are that row's
(`answer` in `engine/engine.ts`). A page that runs ahead (`addons/predict`) draws every row from its
copy, so whatever row a press moves answers it on the next frame. There are two paths, and which
one a game takes is decided by what its seat controls.

**The simple path: the `player` row is the thing.** When the seat plays one thing for its whole
visit and nothing of it outlives the seat, that thing is the `player` row: the gun, the hero, the
plane, the ship, the falling well, the poker chair. Every field of the thing is a field of the
`player` row, and nothing else is needed. A `player` row that spawns a `body`, `gun` or `hero` for
itself and forwards its acts to it is wrong: two rows and a hop where one row does the job.

**Complex behavior: the `player` row holds rows of other kinds.** When the seat gets in and out of
things, controls a row that stands in the world without it (a vehicle, a mount, a turret, a crane),
plays a row that must outlive the seat (a car that stays on the road after its driver leaves), or
is sometimes a driver and sometimes only watching, the `player` row is the seat (a driver, a rider,
a gunner, a spectator) and takes hold of those rows with core's hold functions,
`plugins/player/player.sim.ts`: "A thing that takes hold of rows that are not it", below. Every game
with such behavior uses them; none builds its own.

## What a seat is sent

- Every seat is sent every `player` row (`addons/player/player.addon.ts`). Other seats see your car
  because they are sent your player row.
- The seat's own row carries `mine: true`, a field no other seat is sent. `possessed(rows)` finds it:
  import it from `#plugins/player/player.plugin.ts` on a page, a look or a browser plugin, and from
  `#addons/player/player.addon.ts` in a rule, a test or a node script. Never `rows.find(r => r.kind
  === 'player')`: that is whichever seat's row comes first.
- A field only its own seat may read (a hand of cards, a stock, a score kept private) is listed in the
  scene's top-level `security` block, `{ "player": { "hole": "me" } }`, with `masks: []` on the player
  prefab. Never hide it by moving it to another row.
- The `player` row's `seat` field is its slot, the lowest free one below the scene's `seats`. It is
  not the seat's number. The `seat` an act is handed, and the seat an addon knows a connection by, is
  the truth's seat number, which counts every seat the truth has opened, so a connection that leaves
  and comes back gets a higher one (`addons/player/player.addon.ts`). Find a `start`, a grid place or
  anything else per player by the slot, `me.data.seat`. Where an addon's records go by seat number,
  the rule that hears from the addon writes that number onto the `player` row as a field of its own.

## The rule file, `player.sim.ts`, on the simple path

- Every field of the controlled thing is a field of the `player` prefab: position, velocity, health,
  ammo, laps, its controls. The kind's fixed numbers are the `player` definition in the game's data
  file.
- `before` stands the row once, from its slot's `start` actor (`w.find('start', s => s.data.slot ===
  me.data.seat)`), and marks it (`stood`, `placed`, `seg >= 0`): never by spawning a row.
- Its hooks run the thing itself: drive, walk, fly, fall. A shared rule several kinds use (a rival
  that drives like a seat's car) lives in a game plugin that every kind calls on its own row, so
  `player` and the other kind each call the same function on themselves.
- Respawning resets the same row's fields. The seat keeps its row id, so the page keeps predicting it.
- Another kind that looks for the seat's thing looks for `player` rows: an enemy targets
  `w.all('player')`, a race orders `player` and `rival` rows, a pickup touches a player row.
- A plugin keyed by kind (`world.box2d.kinds`, a sprite or walker table, `world.flight3d.kinds`)
  gets an entry for `player`.

## When the seat controls more than one kind

A seat possesses one row from the moment it opens (`open(possess)` in `engine/engine.ts`) until it
leaves. Nothing moves a seat onto another row, and `answer` refuses an act on any row but the one it
possesses unless the act is `open`. So whatever the player controls over a visit, every press lands
on its one `player` row, and what that press does to anything else is code in the rules. There are
two shapes, and each is solved by the same few pieces of code.

### One thing, several modes

The thing changes what it does but stays one thing: walking and swimming, a fighter and a ghost, a
person and a beast. It is one `player` row with a mode field on its prefab.

- Every hook reads the mode and runs that mode's rule, each a function of a game plugin called on
  the row, so a mode shared with another kind (a rival that races, a creature that swims) is the
  same code.
- Every act checks the mode and does nothing in a mode it is not for, as well as checking its args.
  An act for one mode sent in another is a press the seat made at the wrong moment, not an error.
- The mode changes only in a rule or an act of the row (an open act sent by another seat counts),
  never on a page and never from a closed act an addon sends: those reach a copy that runs ahead a
  round trip late, so the copy would play the old mode for that long and then jump.
- A thing that must outlive its seat (a car that stays on the road after its driver's seat leaves)
  is not a mode: it is a row of its own kind that the `player` row holds (below), and it stands on
  when the `player` row ends with its seat.

### A thing that takes hold of rows that are not it

The seat's thing climbs into, mounts or takes the controls of rows that stand in the world without
it, and that something else drives, or holds still, while no seat has them: a vehicle, a horse, a
turret, a crane. Those rows keep their own kinds. The `player` row is the one that holds them: the
driver, the rider, the gunner. Its prefab keeps the row it holds in `held`, `{ kind, id }`, null when
it holds none. The pieces are core's, `plugins/player/player.sim.ts`, and the whole of their
contract is its header:

- `take(me, w, row)`: `me` takes hold of `row`, and true; false, and nothing changes, when `me`
  already holds a row, `row` is a `player` row, or another `player` row holds it.
- `letGo(me)`: `me` holds nothing.
- `holding(w, me)`: the row `me` holds, or undefined (a held row that ended is let go of by being
  gone).
- `holderOf(w, row)`: the `player` row that holds `row`, or undefined.
- `relay({ <held kind>: [<act>, …] })`: acts for the `player` kind that pass a press, with its seat
  and args, to the held row by `w.call`, when the row held is of a kind that lists the act, and do
  nothing otherwise.
- On a page, `holding(rows)` from `#plugins/player/player.plugin.ts`: the row this page's `player`
  row holds, among the rows it was sent.

```ts
// player.sim.ts: the game decides when, core's functions do the holding
import { holding, letGo, relay, take } from '#plugins/player/player.sim.ts'

export const player: Kind = {
  after(me, dt, w) {
    const car = holding(w, me)
    if (car) seat(me, car, w)        // the body placed at the held row's seat point, every step
    else walk(me, dt, w)             // the body's own rule
  },
  acts: {
    use(me, w) {                     // take hold, or let go
      const car = holding(w, me)
      if (car) { if (slowEnough(car, w)) letGo(me); return }
      const it = nearest(me, w)      // a holdable kind, within reach of its door
      if (it) take(me, w, it)        // false while another player row holds it
    },
    ...relay({ box3dvehicle: ['pedal', 'steer', 'brake'] }),
  },
}

// the held kind: its own acts, none of them `open`, each checking its args
export const box3dvehicle: Kind = {
  acts: { steer(me, _w, _seat, v: unknown) { if (finite(v)) me.data.steer = clamp(v, -1, 1) } },
}
```

- **The held row is the world's.** It stands in the scene's `actors`, or a rule that is not the
  `player` row's makes it: a park that makes a vehicle, a match that makes each driver's car. The
  `player` row never spawns the row it holds.
- **Taking hold** is the game's act or rule, which checks what only the game knows (in reach, a door
  free, the seat sent to drive) and then calls `take`. A seat's press can start it, or a rule can
  hand the seat a row it never asked for, before anything moves. `take` refuses a row another
  `player` row holds, so one row is held by at most one seat.
- **The controls are the held kind's own acts**, and a seat reaches them only through `relay` on the
  `player` row that holds it: none is in the held kind's `open`, so a seat cannot press a row it does
  not hold. A press for a car while on foot is a press at the wrong moment and does nothing.
- **A row nobody holds** is its own kind's to rest or to drive: its rule asks `holderOf` each step
  and, with no holder, sets its controls at rest (or drives itself). So a row let go of, or whose
  holder's seat left, is at rest from the next step, with no act having to remember to clear it.
- **The body goes with it**, where the `player` row is a body. While it holds, the `player` row's
  position and facing are set every step from the held row and its seat point, so every look,
  camera, enemy and query that finds `player` rows finds the seat's thing where it is. Where the
  `player` row is only a driver, with no body, it has no place of its own: every reader, the camera,
  the HUD, a race's order, goes through `holding`, and a rule that counts what is driven counts the
  held kind's rows.
- **Letting go** is the same act. The rule checks the held row allows it (slow enough), finds the
  step-out point free, puts the body there, and calls `letGo`. The held row's own rule rests it
  from that step.
- **The seat leaving** ends its `player` row, and with it the hold; the held row has no holder from
  the next step and rests. Nothing is spawned, since the held row never was the seat's row.
- **Prediction needs nothing more**, because of where each piece runs. A page that runs ahead holds
  a copy of every row and runs every rule (`addons/predict`): the take-hold press is answered on the
  step it was stamped with, so `held` changes on that step in the copy and on the server alike, and
  every relayed press lands on the held row on the same step there as on the server. The held row
  answers the keys on the next frame, as the `player` row does. What breaks it is anything that
  decides control outside the rules: a page or a look choosing what is held or writing controls, or
  a held kind whose rules call `Math` instead of `plugins/math`. A closed act an addon sends, such as
  a lobby handing a seat its vehicle, is a message of number 0 that every copy takes on the step the
  server did; it reaches the copy a round trip late, so give it to a moment nothing yet moves (the
  vehicle standing at its start), never mid-play.
- **The look** reads `holding(rows)` each frame from the rows it is drawn (the copy's, on a page that
  runs ahead), and the frame it changes, it unbinds the keys and binds the other set, and the camera
  follows the held row or the body. The same frame the rules switch, the keys and camera switch.
- **A HUD** finds the held row with `holding(rows)`.

### The proof

A rule test boots the scene, takes hold, drives, lets go and leaves: `held` set only in reach and
only on an unheld row, the held row moving by the seat's relayed presses and by no one else's, at
rest the step after it is let go and the step after the seat leaves, the body at the seat point
while held and at the step-out point after. The press test (The proof, below) presses take-hold and
then the controls: on the frame after the take-hold press the seat's own `player` row it draws has
`held` set, and on every frame after a control press the held row it draws has taken it.

## Acts a seat can send

A seat may send any act its own `player` row has (`answer` in `engine/engine.ts`). So an act on the
player row that another kind uses to change it, such as `hit`, `hurt`, `award`, `gain`, `heal` or
`power`, is a cheat: a seat sends itself `award(99)`. Such an effect is a plain function of a game
plugin that other kinds call, or an act that does nothing when a seat sent it (`seat >= 0`). Every
act a seat does send checks its args: type, finite, range.

## The look, `player.client.ts`

It is loaded once for every player row the page is sent. It:

- draws the thing for every row, so each seat sees the others' cars;
- binds keys, moves the camera and starts a playtester only for the row that is `mine`;
- keeps what it holds per row inside the module, which the browser loads once per row.

```ts
let ours = false
export function setup(row: Row, plugins: Plugins) {
  // the model, for every seat's row
  ours = row.data.mine === true
  if (ours) plugins.player.bind({ ... })
}
export function tick(row: Row, plugins: Plugins) {
  // place the model from `row`, for every seat's row
  if (ours) { /* camera */ }
}
export function remove(plugins: Plugins) {
  // drop the model
  if (ours) plugins.player.unbind()
}
```

A HUD, a page's cpu driver or a camera reads the seat's own thing as `possessed(plugins.wire.rows)`.

## Prediction on

A scene the seat plays in gives `world.predict`, and its `client.html` wraps the link in
`predict(link(wire), file, base, mount)` (`going-multiplayer`, A scene run ahead). Without both, the
page draws packets and nothing is predicted, whatever row the thing is on.

## The proof

Beside the game, `<game>.predict.test.ts`: two pages run ahead on the game's server over loopbacks,
one on a clean wire and one on each of the network panel's bad ones. A page presses every frame, and
on every frame the seat's own `player` row it draws (`possessed(page.client.plugins.wire.rows)`) has
taken every press sent up to the frame before. Its whole shape is `going-multiplayer`'s (How it is
proven). Then the page in Chrome against
`<game>.server.ts`: press a key and see your thing move on the next frame.

Tests of a seat number each visit's messages from 1, as the client does: a scene that runs ahead
takes a seat's messages in order from 1, and a message numbered past a gap waits for ever.

## What goes wrong

- Every seat sees nothing of the others: a look draws only for `mine`. Draw for every row.
- Both seats' keys drive one car: a look binds keys for every row. Bind only for `mine`.
- A seat's HUD shows the other seat: it used `rows.find(r => r.kind === 'player')`. Use `possessed`.
- A seat gives itself lives: a rule-only act is on the player row. Move it out or refuse a seat.
- A vehicle drives on by itself after its driver gets out: the held kind's rule does not rest it
  when `holderOf` finds no holder. Rest it there, every step it has none.
- Getting in shows a round trip late on a page that runs ahead: `held` was set from the page, or by
  an addon's message mid-play. Call `take` in the `player` row's own act or rule.
- Two seats drive one vehicle: `held` was written by hand instead of through `take`, which refuses a
  row another `player` row holds.
- A seat drives a car it does not hold: the held kind lists its control acts in `open`. Keep them
  out; `relay` is the only way in.
- `holding` throws or finds nothing: something else writes `held` on the `player` row (a timer, a
  game field). `held` is core's; name the game's field something else.
