# simulator

A game's pages played against its server on a timeline, with no real time passing: a network, a
display and a server's timer of your choosing, the same run from the same seed every time, and every
frame, step, packet and message written down as it happens, one JSON object a line (JSONL). It can
also play the same pages over a real socket on real clocks, and record a real page in a browser.

## Why use it

Use the simulator to find out what a player on a bad connection, a 144 Hz screen or a stalling tab
actually sees, and to prove it in a test: "every frame moves one step", "the camera holds still on the
player's car". It runs the real code on both ends (the engine, the scenemanager, the loopback, the
player plugin, the game's own rules and actors), so what it records is what the game does. A run of a
minute takes as long as the code takes to run it, and a seed makes every roll of the network, the
displays and the server the same each time.

## How it works

It is an addon: nothing in a scene switches it on. A test, or node from the command line, calls it
with a game's manager scene.

**`simulate(run)`** boots the manager scene `run.file` with `run.sim`, loads its scenes from
`run.base`, and plays `run.ms` milliseconds of the timeline.

- **The server** is the manager stepped as each `<game>.server.ts` steps it, on the timeline's clock.
  `run.server` sets its timer:

  | Field | What it does |
  | --- | --- |
  | `ppm` | its clock runs this many parts in a million fast |
  | `grain` | each wait rounds down to this many ms (1 when unset, as node does; 0 fires on the very millisecond asked for) |
  | `late` | ms a timer fires late on the mean |
  | `pause` | `{ every, ms }`: the process stops for `ms` every `every` seconds on the mean, and every timer due in it fires as it ends |
  | `loop` | `'interval'` steps as `setInterval` does, which loses steps |
  | `steps` | times of the timeline: steps at each and at no other, as a recording's server did |

- **Each page** in `run.pages` opens its link at `join` ms, its wire opening `open` ms later as a
  socket's handshake does. With `predict` it runs its scene ahead (`addons/predict`), as `client.html`
  makes it; else it draws what it is sent. Its `up` and `down` legs are the loopback's (`delay`,
  `jitter`, `tail`, `loss`, `reorder`, `dup`, `burst`). Its `display`:

  | Field | What it does |
  | --- | --- |
  | `hz` | frames a second |
  | `phase` | ms past each frame's time the vsyncs fall (from the seed when unset) |
  | `wobble` | a frame is called up to this many ms after its vsync |
  | `drop` | the fraction of vsyncs that draw nothing |
  | `long` | `{ every, ms }`: a long frame of `ms` every `every` seconds on the mean, drawing nothing on the vsyncs it covers |
  | `hidden` | `[from, to]` spans in ms when nothing is drawn, as a hidden tab's |
  | `stall` | ms the first frame waits after the page joins, as a page still loading |
  | `at` | times of the timeline: a frame at each and at no other, as a recording's page drew |

  `clock: { offset, ppm }` is the page's own clock (what its code reads as `performance.now`).
- **Input.** A page's `presses` come at ms of the timeline, between frames: an `act`, sent through the
  player plugin as a bound key's message is, or a `key`, the `KeyboardEvent.code` of a key going down
  (or `up: true`), handed to the listeners the page's code bound. A `think` (`addons/player`) is asked
  before every frame for a press.
- `ready(truth)`, when given, is handed the server once its scenes are loaded, before anything runs,
  to set things up: a playtester's seat, rows spawned.
- `turns`, `[{ at, turn }]`, are calls at ms of the timeline, to change a knob mid-run, such as a
  page's `up` or `down` leg, which its link reads live.
- `watch` says what is written down: `kinds` and `fields` of the rows (every row and every field when
  unset); `own`, which row is the page's own (`[]` for its `player` row itself, a field of the
  `player` row naming it, or a list of fields, each naming the next row, as `['held', 'chassis']`
  reaches the body of the car a `player` row holds); and `drawn`, where the page drew things.
- `cost: true` writes the processor ms each frame and step took. `write(line)` is handed each line as
  it is written.

**`real(run)`** plays the same pages with the same records on the machine's clocks over a real
socket: each page dials `run.url`, or the manager booted here and served on `run.port` (the
manager's own port when unset, a free one when 0). Its pages draw `hz` frames a second. A real run
and a simulated one can be put side by side.

**`timing(records)`** takes a recording, a real run's above all, and hands back `{ ms, server, pages }`
for `simulate`: when its server stepped, when each page drew, how long its wire took to open, and
when each envelope and message arrived, or that it never did. A simulation given it draws what the
recording drew, so what the game did can be told from what the machine's timers did.

**`tap(wire, make)`** records a page in a real browser. The page that `yarn new-game` writes as
`client.html` already goes through it. Without `?tap=<name>` in the page's address it is the view
itself and records nothing. With it, every frame is a frame record, and the lines are sent once a
second and as the page is hidden, posted to `/api/x/simulator/tap` unless a `send` is handed in. The
address's `kinds` and `fields` (split by commas), `own` (fields split by dots) and `drawn` are its
watch. A name may hold letters, digits, `_`, `.` and `-` only.

**`running()`** says whose time it is at the moment it is asked: a page's (`{ page }`), the server's
(`'server'`), or neither.

## What it records

Each line has a `type`:

- `run`: what was played: the mode, the seed, the ms, the server's and each page's knobs, `watch`,
  and `clocks`, each page's clock at the timeline's 0.
- `frame`: one page's frame. `t` the timeline's ms, `clock` the page's clock; `n` the step of the
  packet it drew; `took`, each envelope that arrived since the frame before (`k`, `n`, `sent`, `at`);
  `rows`, the watched rows; `own`, the id of the page's own row; `eye`, the camera as the actor that
  exports `eye()` holds it, or else the first of the scene's plugins that exports `eye()`
  (chasecamera3d does); with `watch.drawn`, `drawn` (the camera's place, each row's drawn place and
  every mesh tied to no row, as render3d's `drew` hands them) and `between`, how far past the step
  the page drew. Read smoothness off `drawn`, never off `rows`, which hold a step's places.
- `step`: one manager step: `n`, each scene's step in `scenes`, `applied` (each page's message a
  scene answered, with the step that answered it), `rows`, and `cost` when asked for.
- `press`: an input handed to a page, and `taken`, whether the page had a client to take it.
- `packet` and `message`: each envelope down and each message up, when it was sent and each time it
  arrived: none when it was lost, two when it was doubled; and for an envelope, each time the page's
  word that it got it reached the server. Written once the run is over.

**Reading a run back.** `parse(text)` reads a JSONL file's records. `summary(records)` sums up any
run, a real one's too, from these parts, each for one page:

- `histogram(records, page)`: how many frames moved the step they drew by 0, 1, 2… steps, from the
  frame after the first packet's, and when that first frame was.
- `standoff(records, page, field)`: the distance from the camera to the page's own row frame by
  frame, and how much it changed from one frame to the next (`jitter`, `max` and `rms`): a camera that
  follows smoothly changes it little.
- `packets(records, page)`: how many frames took 0, 1, 2… envelopes.

`report(summary)` prints it as lines.

## Using it

In a test:

```ts
import { simulate, histogram } from '#addons/simulator/simulator.addon.ts'

const records = await simulate({
  file, sim, base, seed: 1, ms: 3000,
  pages: [{ display: { hz: 60 }, up: { delay: 40, jitter: 20 }, down: { delay: 40, loss: 0.02 }, predict: true }],
  watch: { kinds: ['car'], fields: ['pos'], own: 'held' },
})
expect(histogram(records, 0).counts).toEqual({ 1: expect.any(Number) })
```

`file` is the game's manager scene, `sim` its sim, `base` the folder its scenes load from.

From node, with a config that is a run as JSON, with `game`, the manager scene file's path, in place
of `file`, `sim` and `base` (the sim is the `<game>.sim.ts` beside it):

```
node --experimental-strip-types addons/simulator/simulator.addon.ts run <config.json> [out.jsonl]
node --experimental-strip-types addons/simulator/simulator.addon.ts real <config.json> [out.jsonl]
node --experimental-strip-types addons/simulator/simulator.addon.ts summary <run.jsonl>
```

`run` and `real` write the lines to `out.jsonl` when it is given, and print the report.

## What it works with

- **scenemanager** (`addons/scenemanager`): the manager, its links and views, stepped as a game's
  server steps it.
- **loopback**: each page's wire in a simulation, with its legs.
- **socket**: the wire of a real run.
- **predict**: a page that runs its scene ahead.
- **player** (`addons/player`): a seat's `think`, and the page's own row.
- **heard**: which page's message each step answered.
- **render3d** and **chasecamera3d**: where a frame drew things, and its camera.

## Keywords

network simulation, lag, latency, jitter, packet loss, duplicate packets, bursts, refresh rate,
vsync, dropped frames, hidden tab, clock drift, server timer, setInterval, deterministic, seed,
replay a recording, JSONL, frame records, smoothness, judder, steps a frame, real socket, browser
recording, `simulate`, `real`, `timing`, `tap`, `running`, `parse`, `summary`, `histogram`,
`standoff`, `packets`, `report`
