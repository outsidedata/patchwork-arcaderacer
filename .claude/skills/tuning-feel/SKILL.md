---
name: tuning-feel
description: Use in core, or any clone of it, when making a game feel right - how fast a thing speeds up, stops, turns, jumps or falls, and where those numbers go (a kind's definition in `assets/<game>.json`, `world`, `world.<plugin>`). It covers the physics and movement plugins (box2d, box3d, box3dvehicle, walker, flight3d, ragdoll3d, volley2d, volley3d), a camera that follows (chasecamera3d, pancamera, roomcamera), the step rate (`engine.dt`, `scenemanager.dt`), how a press reaches the seat's thing, its `player` row, and is drawn the frame after the key, tuning a number while the game runs in `dev.html`, and measuring feel with tests and the simulator instead of guessing. Triggers on "feels floaty", "sluggish", "slippery", "heavy", "too fast", "laggy", "it snaps", "rubber-banding", "acceleration", "friction", "drag", "gravity", "jump height", "top speed", "tune the movement", "game feel".
---

# Tuning feel

Feel is numbers and the law that uses them: how fast a thing speeds up and slows down, what it
keeps from one step to the next, how a press reaches it, and how the camera sits on it. This work is
finding those numbers, putting each in its one home, turning them while the game runs, and proving
with a measurement that the game does what was meant.

Other work has its own skill. A new kind and its rules: `designing-a-kind`. Keys, actions, the
stick's deadzone, key repeat, seats and ledgers: `input-and-seats`. A bad network, a second seat,
the server on node: `going-multiplayer`. Tests, bots and the simulator in general: `proving-a-game`.
Walls, ground and collision with the level: `building-a-level`. A new game and its first `dev.html`:
`starting-a-game`. How a camera follows: Cameras, below. This skill points to them and does not
repeat them.

## Where every knob is

Every number has one home, by the prime directive's first question.

- What changes while the game runs is on the row, and its starting value is a field of the kind's
  prefab in the scene file. A thing that speeds up remembers its speed, so `vel` is a field of its row
  and of its prefab: the next step reads it, and a browser that arrives later is sent rows and
  nothing else. Never a module variable or a closure. The thing a seat drives is its `player` row
  (`designing-a-seat`), so its `vel`, its heading and every other field of its motion are fields of
  that row.
- What a kind is tuned by and never changes is its definition: its entry in the data file the
  scene's `world.defs` names (`assets/<game>.json`), read with `def(w, me.kind)` in its rule and
  `def(plugins.wire, row.kind)` in its look (`plugins/loader/loader.sim.ts`). Never on the row, which
  goes to every seat every step, and never a number in code.
- A plugin's fixed numbers are `world.<plugin>`, always: its server half reads `w.world.<plugin>`,
  its browser half `plugins.wire.scene.world.<plugin>`, whether it has a row or not, never its
  prefab. A child scene's `world` is the manager's with its own over it, key by key
  (`addons/scenemanager/scenemanager.addon.ts`), so a table every scene uses is written once in the
  manager's file.
- A scene's own few numbers are fields of its `world`.
- Never a setting only one game would set. A plugin that does not do what one game wants (a camera
  that eases, a coyote time on a jump) is not given a field for that game: the game's kind does it,
  its numbers on its definition. What is general and missing is built in the plugin, set from
  `world.<plugin>`, tested there, and used by every game it belongs in.

What the movement and camera plugins read, each from its own header:

| plugin | its fixed numbers | what the rows carry |
| --- | --- | --- |
| `box2d` | `world.box2d`: `subStepCount`, `static` and `kinds` required, `gravity`, the contact and sleep fields; `world.box2d.kinds.<kind>`, the Body: `linearDamping`, `gravityScale`, `shapes` with `density` and `material` (`friction`, `restitution`) | a body's `pos`, `rot`, `vel`, `spin`; a rule writes `force` and `torque` (held), `pushes` (one step's impulses), `target`, `wind` |
| `box3d` | `world.box3d`: `subStepCount`, `static` and `kinds` required, `gravity`, the contact and sleep fields and `enableSpeculative`; `world.box3d.kinds.<kind>`, the Body, a shape's surface under `baseMaterial` | a body's `pos`, `rot` (a quaternion), `vel`, `spin`, `force`, `torque`, `pushes`, `target`, `wind`, and `friction` over its shapes' |
| `box3dvehicle` | `world.box3dvehicle.vehicles.<name>`: `body`, `axles` (`wheel.friction`, `spring`, `damper`, `bumpStop`, `antiRoll`), `engine`, `steering` | `throttle`, `brake`, `steer`; it writes `compression`, `load`, `grounded`, and for a petrol or electric engine `rpm` and `torque` |
| `walker` | `world.walker.kinds.<kind>`: `accel` (the rate a second `vel` eases toward `want` by, the law's `friction` in step 1, not a push), `airAccel` (that rate in the air, `accel` when absent), `turnRate`, `turnMax`, `gravity`, `jumpH`, `step`, `maxSlope`, `slide`, … | `pos`, `yaw`, `vel`, `grounded`; the rule sets `want` (its speed, a number of its kind's definition, times `relative(stick, yaw)`), `face`, `jump` |
| `flight3d` | `world.flight3d`, every field required: `gravity`, `air`, `materials` (what an airframe's mass is priced from), `planes.<name>` (its `airframe`, the sheet, and `gear`), `overspeed`, `sweep` | the stick `pitch`, `roll`, `yaw`, `throttling`, `airbrake`, `brake`, `gearDown` |
| `ragdoll3d` | `world.ragdoll3d`: `kinds` (the kinds whose limp rows it lays down; a scene with none throws), `damp`, `friction`, `iter`, `vmax`, `limits`, …, and `physics` for a box3d ragdoll on the server | the dying row's `limp`, `limpFor`, `blow`, `pose` |
| `volley2d` | the patterns file `world.volley2d.patterns` names: each emitter layer of a pattern, its `speed`, `accel`, `min`, `max`, `curve`, `life`, … | the ledger row |
| `volley3d` | the patterns file `world.volley3d.patterns` names: each pattern's `speed`, `accel`, `max`, `g`, `life`, `seek`, …; a field it does not know throws | the ledger row |
| `chasecamera3d` | none | the followed row's `pos`, `lift`, `look` `{ yaw, pitch, dist, side }` |
| `pancamera` | `world.pancamera`: `speed`, `edge`, `keys`, `zooms`, `notch`, `bounds`, `look` | none |
| `roomcamera` | none | none: an actor hands `look` the point and its room each frame |

Two homes meet on a body a plugin moves. What the plugin does with it is the plugin's numbers, under
the kind's name in its table: how a box2d body collides and damps (`world.box2d.kinds.<kind>`), how
a walker eases, falls and jumps (`accel`, `gravity`, `jumpH` in `world.walker.kinds.<kind>`). What
the kind's own rule decides is the kind's definition: how hard it pushes the box2d body, how fast it
asks walker to go. box2d and box3d take a field left out as the library's own default; walker checks
its table and throws naming a number that is missing or out of its range.

The step rate is one number written three times, and `yarn new-game` writes all three as 1/60: the
manager's `prefabs.engine.dt` in `<game>.scene.json` (what `index.html`, `<game>.server.ts` and the
recorder step the manager by), the manager's `prefabs.scenemanager.dt` beside
it (what each child step is handed), and each child scene's `prefabs.engine.dt` (what the page's
plugins take as a step's seconds: skydome3d's time is the packet's step times it, and particle3d
moves its particles by it each frame). Changed, all three change together.

What a frame draws is what the view was handed, step by step. On `index.html` the view is handed the truth's packet after each step. On `client.html` the view is handed, after each
step of the page's copy, every row the seat may see as the copy has it: the seat's own `player` row
and every row its press moves answer on the next frame, and every other seat's row runs on from its
last press (`addons/predict`, What is drawn; `going-multiplayer`). Either way a frame's actors are handed rows of a step, and
render3d, render2d and ui put each thing they draw between where the last two steps handed put it,
as far as the frame's `between` says (`engine/browser.ts`, Drawing between steps). So a thing moving
at a steady speed moves the same distance every frame at any display rate, a step behind the newest
step it was handed. A page that hands no `between`, a test's, draws each step on as many frames as
fall in it.

## The work, in order

### 1. Write the motion as a law of the definition's numbers

A thing that moves at a fixed speed starts and stops on one step and feels like a cursor. Give it a
law instead, its numbers on its definition, so the top speed, how soon it gets there and how far it
glides are what the numbers make rather than numbers of their own. The game `yarn new-game` writes,
once its body is folded into the `player` row (`starting-a-game`, Fold the body into the player
row), runs the seat's square at `speed`; turned into a square that speeds up and glides:

```ts
// player.sim.ts: dv/dt = accel·move − friction·v, `accel` and `friction` its definition's. `glide` is
// the law solved over one step of `dt`: the velocity a step takes `vel` to under `move`. `math` is
// `plugins/math`, the same bits on every engine (`designing-a-kind`, Maths in a rule).
export function glide(vel: number[], move: number[], accel: number, friction: number, dt: number): number[] {
  const keep = math.exp(-friction * dt)
  const gain = friction > 0 ? (1 - keep) / friction : dt
  return [vel[0] * keep + accel * move[0] * gain, vel[1] * keep + accel * move[1] * gain]
}

// in `player`:
tick(me, dt, w) {
  const [mx, my] = me.data.move
  const [vx, vy] = me.data.vel
  if (!mx && !my && !vx && !vy) return
  const { accel, friction } = def(w, me.kind)
  const vel = glide(me.data.vel, me.data.move, accel, friction, dt)
  me.data.vel = vel
  me.data.pos = [me.data.pos[0] + vel[0] * dt, me.data.pos[1] + vel[1] * dt]
},
```

with `"player": { "accel": 1800, "friction": 7.5, … }` in `assets/<game>.json` and `"vel": [0, 0]` in
the `player` prefab. Held, it closes on accel / friction, 240 px/s, by 1 − e^(−friction·t), nine tenths
of the way in ln 10 / friction, 0.31 s; let go, it glides top / friction, 32 px. The step solves the
law exactly over its dt, so the same definition moves at the same speeds stepped 30, 60 or 120 times
a second; observed with the Euler step `v += (accel·move − friction·v)·dt` planted in its place, it
ran at 197 px/s where the law says 186 after 0.2 s at 30 Hz. walker eases `vel` toward `want` the
same way, by 1 − exp(−accel·dt): its `accel` is a rate a second, this law's `friction`, and its top
speed is the `want` the rule asks for. The law holds at every value a person can type into the
definition, 0 among them: the `gain` above keeps friction 0 from dividing by it.

The rule reads `def` where it uses the number, every step: a number kept in a module variable from
an earlier read is never the one `dev.html` changed. An actor that reads its definition in `setup`
never takes a change from a key of `dev.html`.

When the law changes, the test beside the manager, `<game>.sim.test.ts`, which after the fold checks
the seat's square runs at `speed`, changes with it.

### 2. Prove the law and the press with a test beside the rule

`<kind>.sim.test.ts` beside `<kind>.sim.ts` boots the game's manager, joins a seat with
`connection(manager(truth), send)`, presses through it with `seat.take({ scene, seat, msg })`, and
reads what the kind wrote off the rows. For the seat's square, `player.sim.test.ts`, it checks:

- the closed form: the first step at nine tenths of top speed is step ceil(ln 10 / friction / dt),
  held three seconds it is at accel / friction, and let go it glides top / friction to within a
  step's travel;
- the step rate: the law at 1/30, 1/60 and 1/120 gives the same speed at the same moment, to nine
  places. The test never changes the scene in memory to get there (`proving-a-game`). It calls the
  law the rule steps by, `glide`, with the definition's `accel` and `friction` read off
  `assets/<game>.json`, stepping each rate to the same moment; or it writes a manager and a child scene
  file of its own at each rate, its three `dt`s set together, into a temporary folder, with a
  `<scene>.sim.ts` importing the game's kinds by their absolute paths, and boots each through `load`,
  as a plugin's test writes its game;
- the press, in the game's press test, `<game>.predict.test.ts`, beside the manager. A press goes
  up the wire at the seat's `player` row; on `client.html` the page's copy takes it on the step it
  is about to run and the view draws that row from the copy, so the law's first step is on screen
  the frame after the key, at any lag, and the feel the numbers make is the feel the player gets.
  The test, whose one list is `going-multiplayer`'s (How it is proven), holds that on a clean wire
  and the bad ones: on every frame the row drawn has taken every press sent up to the frame before.
  What it reads is the field the press sets (`move`) and the place it drives (`pos`).

Each check is seen to fail before it is trusted: observed, with the Euler step the step-rate check
failed. The press test is seen to fail too, once, with its pages made by `view` in place of
`predict`, which draw the packets: on a wire of 30 ms each way a press is drawn at the soonest 60 ms,
three and a half frames, after it was sent, so the way drawn is neither this frame's nor the last.
Run the files beside what changed, `yarn vitest run games/<game>/player.sim.test.ts` and
`yarn vitest run games/<game>/<game>.predict.test.ts`.

### 3. A testbed that turns the numbers while the game plays

`dev.html`, beside `index.html`, is `index.html` with changes made before the boot, over a
loopback, and the one place a shortcut is allowed. `yarn new-game` does not write it; how it is built
is `using-the-dev-page`. For tuning it holds:

- The definition overridden. The tab holds one decoded copy of each data file, which the truth's
  rules and every actor's `def` read alike, and `jsonAt(name, url)` hands it out. A number written
  into it moves the seat's square from the next step:

  ```js
  import { jsonAt } from '#plugins/loader/loader.sim.ts'
  import main from './main.scene.json'
  // after `await load(truth, import.meta.url)`, before the loop
  const { defs } = main.world
  const table = await jsonAt(defs, main.world.loader.assets[defs].url)
  table.player.friction = Number(new URLSearchParams(location.search).get('friction') ?? 3)
  ```

- Every override of a scene file, a prefab or `world` before `load`. `load` boots each truth from the
  imported scene file there and then, its `world` copied and its actors made into rows, so a change
  made after it reaches no truth's `world` or rows; the page's client takes the imported file again
  when `view` makes it, so the page draws a number the server never steps with. A number to turn
  while the game plays is a definition, through `jsonAt` above, or for box2d and box3d a field of the
  world's row (`gravity`, `subStepCount`, …) or of a body's row (`linearDamping`, `gravityScale`, …,
  and box3d's `friction`), which they push into the live world each step it differs; `load` hands
  back the truths whose rows those are.
- Keys of its own that turn a number by a fraction, and a readout of the numbers, what they make (top
  speed, the seconds to nine tenths of it, the glide) and the speed of the seat's own `player` row as
  the page draws it, `possessed(client.plugins.wire.rows)` off the client `view` mounts. A
  network of a given shape is a `Net` handed to the loopback, and a page that runs ahead is
  `predict` on that loopback in place of `view`, as `client.html` makes it, so the testbed feels what
  a player on that network feels. A scene that lists
  `stats` gets its frames a second shown once `dev.html` mounts it,
  `me.plugins.stats?.mount(document.body)`.

Nothing of it bleeds out: no scene file, rule, actor, plugin or test reads it, and the game
plays the same with it deleted. What feels right is written into the definition file by hand; no
line of `dev.html` is copied into `index.html`.

### 4. Measure, never guess

- What the numbers make is arithmetic: put it in the readout and in the test, and the feel is
  stated, not eyeballed. "Floaty" is a glide too long for its top speed; "sluggish" is too many
  seconds to nine tenths.
- The simulator plays pages against a server on one timeline, with the real engine, scenemanager,
  loopback, player and the game's own rules and actors, and writes every frame, step, packet and
  message. From node: `node --experimental-strip-types addons/simulator/simulator.addon.ts run
  <config.json> [out.jsonl]`, a config being a `Run` with `game`, the manager scene file's path, in
  place of `file`, `sim` and `base`, and `seed` and `ms` required. A page standing for a player is
  `predict: true`, made as `client.html` makes it. Rows are recorded only when it gives a `watch`
  (`kinds`, `fields`, `own`); `own: []` names the seat's `player` row itself, the thing it drives
  (`frameOf` in the simulator), and a list of fields walks from that row to a row it names. It prints the server's steps and their rate, and for
  each page the steps the packet it drew moved each frame (`histogram`), the envelopes each frame took
  (`packets`), and `standoff`, how much the distance from the camera to the seat's own row changes
  frame to frame, a camera that judders changing it every frame; `standoff` needs a camera that
  exports `eye()`, an actor's, or `chasecamera3d`'s or `cutscene`'s. The JSONL's frame records hold
  the drawn rows and the step of the packet drawn, `n`, its step records the server's rows; laid
  side by side they show what the page drew of each step. Bad networks and their shapes are
  `going-multiplayer`'s, and the simulator's every record and part `proving-a-game`'s.

## Cameras

A camera is felt as much as the thing it follows. The seat's camera follows its own `player` row,
which the page draws from its copy, so it moves with the press on the frame after the key, and so does one that follows a row the
press moves. `chasecamera3d` is a rigid
orbit on one row: the
row's `pos` raised by `lift`, the eye `look.dist` out along `look.yaw` and `look.pitch`, `look.side`
to the right. It adds no easing, floor or speed of its own: whatever turns or rises gradually is a
field of the row that the kind's rule moves at a rate, the rate on the kind's definition, and a camera
that shakes on a body that shakes is fixed in the body. It is listed after `render3d`, or its tick
throws. `pancamera` pans rigidly at `world.pancamera.speed`, carrying no speed from frame to frame,
inside `bounds`, through `zooms`, from `look`, the world point it looks at first; it is listed after
`render2d` and after `player`, or its tick throws. `roomcamera` has no numbers: an actor hands
`look` the point and the room each frame, and the walk from one room to the next. A camera's measure
is the simulator's `standoff`.

## What goes wrong

- A fixed speed where a law belongs, or a top speed typed beside `accel` and `friction`: the top
  speed is accel / friction, and a second number for the same fact leaves one of them wrong.
- A velocity integrated with Euler: the feel changes with the step rate. The law is solved exactly
  over dt, and a test runs it at three rates.
- walker's `accel` written as a push in units a second²: it is a rate a second, the law's `friction`.
- What a kind remembers kept anywhere but its row, or a definition number kept from an earlier read.
- One of the three `dt`s changed alone.
- A defect of core met while tuning worked around in the game, in the testbed or by a way of looking
  round it, instead of fixed in its home with its test.
- A plugin given a setting for one game, a camera's easing say, instead of a field the kind's rule
  moves at a rate.
- An override of a scene file, a prefab or `world` made in `dev.html` after `load`: the page draws it
  and the server never steps with it. Or a number found in `dev.html` and never written into the
  definition file.
- A simulator run with no `watch`, read for rows it never recorded.
- A check that has never been seen to fail.
- "Laggy" on `client.html` tuned with smaller numbers: the scene gives no `world.predict`, or the
  page does not wrap `predict`, so the page draws the packets and the key shows a round trip late,
  which no definition can fix. Every scene a seat plays in gives the block, the page wraps, and the
  press test holds it.
- A round trip of lag on anything a press moves taken for a fact of the network. On a predicting
  page every row is drawn from the copy, the frame after the key.

## How it is proven

The kind's `<kind>.sim.test.ts` holds the closed form and the three step rates, and the game's
`<game>.predict.test.ts` the press drawn by the frame after the key (step 2), each seen to fail with
its fault planted; the game's `<game>.sim.test.ts` follows the new law. Then it is played: `dev.html`
in Chrome with the override in place, the readout's top speed matching the drawn speed when a key is
held, a key turning a number and the drawn speed following; `client.html` against the server, the
thing answering the key on the next frame.
