# arcaderacer — build checklist

Ridge Racer-style arcade racer. Branch `ridge-racer-clone` of the games repo (off `dev`). Core is not
changed.

## Phase 1 — the track and the driving

- [x] `yarn new-game arcaderacer` scaffold
- [x] supercar.glb (and the .blend and scripts that make it) in `assets/supercar/`
- [x] scene on render3d (neutral tone mapping), `shipped` with the game's own plugins
- [x] `track` plugin: closed circuit from `world.seed`, a spline with elevation and banking, sampled
      by arc length; nearest point, progress and checkpoints; tested
- [x] `circuit` kind: the track's definition; its look draws the road, lines, kerbs, verges, walls,
      the chequered line and the banks
- [x] `drive` plugin: arcade handling, grip ↔ drift (handbrake or brake tap), clean-drift boost,
      walls, car-on-car; tested
- [x] `car` kind: the seat's car, its controls as acts; tested
- [x] `drive` browser half draws every car with supercar.glb, the paint per car, wheels spin and
      steer, brake lamps
- [x] chase camera on the seat's car (rigid on row fields; `cam` swung by the rule)
- [x] `start` grid behind the line (grid place per start)
- [x] seen running in Chrome: the track, the car, driving and steering (drift seen in phase 2's
      corners)

## Phase 2 — racing

- [x] `rival` kind: CPU driver on the racing line, braking for corners, drifting the tight ones;
      tested with a playtester seat holding the grid while all five race 3 laps
- [x] `race` kind: grid hold, countdown, laps, checkpoints, order, lap and best times, finish;
      tested with a playtester driving the seat's car the whole race
- [x] drive tests moved onto playtester seats; wall glance (the car swings along a wall)
- [x] `dash` HUD plugin: place, lap, times, speed, boost bar, drift, countdown/GO, checkpoints,
      minimap, finish and results; tested on a page over the loopback
- [x] drive look test: pose, paint per grid place, steering hubs, brake lamps (found and fixed the
      glTF loader's dot-less node names)
- [x] `dev.html` testbed: ?seed, ?laps, ?finished, ?watch=<grid> (camera on a rival, readout)
- [x] seen in Chrome: countdown, rivals racing, a rival drifting a banked bend, finish and results

## Phase 3 — three courses

Three courses, each a scene of its own picked from a title screen, each its own seed and a course
data file (`assets/courses/<name>.json`): the track's shape and features, the road's look, the land.

- [x] scenes: `title` (a plain seat, course select on a ui modal), `forest`, `tokyo`, `paris`
      sharing the racing kinds; the definitions and catalogue moved up to the manager; the title has
      a catalogue of its own (it has no renderer to decode the car)
- [x] track features from the course file: a mountain tunnel, a bay bridge (deck raised over the
      water on the straightest stretch), underground tunnels (the road dips below the street); every
      seed makes a circuit, its bends no sharper than `tightest` and its slopes no steeper than
      `steepest` (the first bridge ramps climbed at 35%)
- [x] the corridor: terrain cut round the road, skirts from the walls to the ground, retaining walls
      capped at `retain` with a bank above, tunnel bores, lids, portals and ceiling lights; the plain
      a ring round the land so it never buries a road below level 0
- [x] Forest (Pacific Northwest, day): rainforest hills, Douglas firs and cedars, ferns, rocks, a
      snow-capped volcano and a range, a cutting into a tunnel through a mountain
- [x] Tokyo (day): the bay, the white suspension bridge (towers, main cables, hangers, piers),
      windowed blocks, neon, expressway signs, a lattice tower, Fuji
- [x] Paris (dusk): authored Haussmann buildings (`assets/paris/haussmann.py`, three levels of
      detail, pan-coupé corners) lining the road and round the blocks, the Eiffel Tower lit gold
      (`eiffel.py`), Paris street lamps with a pool of real lights (`lamp.py`), a low sun with
      shafts, trenches into cut-and-cover tunnels, headlights; bloom at 0.01 (Bill: "basically zero")
- [x] the way back: Escape quits to the title, Enter or start after the finish; a course entered
      again starts its race over (the race's `enter` act)
- [x] rivals race every course: all five finish three laps on each, drifting, with at most two wall
      touches a lap (a CPU `room` factor under the limit)
- [x] tests for the land (both halves), the features, the title card, the circuit look, the seat's
      keys and camera, the flow; each course seen in Chrome
- [x] the game's extension: the title card's course scenes and the player's exit are scene picks

## Phase 4 — the match (games#10)

One seat, the leader, starts every race; the seats in the lobby when it starts race in it, and the
rest wait or spectate. The way back above is gone: a racer has no key back to the title, and a course
starts over for each race (the match plugin's `reset`), not on entering.

- [x] the match addon (`addons/match`): every connection in join order, keyed by the connection; the
      leader, promoted first in, first out; the match's mode and each connection's; each change
      broadcast to the `match` row of every scene; seats moved with `go`; `<game>.server.ts`,
      `index.html` and `dev.html` hand it to their transport
- [x] the `match` row in the title and each course, and the match plugin: `arrive`, `role` (a
      racer's `player` row takes hold of a `car` made for it), `watch`, `leaderCar` for the kinds; the lobby's message and spectate button, the spectator's
      free camera and follow, and the results with the leader's exit on the page
- [x] every course has 8 seats and 8 grid places, a `start` per slot; racers take the front of the
      grid and rivals the rest; courses are no longer `suspend: true`
- [x] a refreshed racer's car stands on, held by nobody, with no control
- [x] the race ends on the leader's finish (`results`), and every seat on the course sees the results
- [x] proven in node: every row of the transition table on the server
      (`addons/match/match.addon.test.ts`), and the pages (`plugins/match/match.plugin.test.ts`)

## Phase 5 — the intro and the title

- [x] the title in 3D on Tokyo's circuit and land, eight rivals racing behind it for as long as it runs
- [x] the intro: core's cutscene filming the title's real race, written from the race by
      `assets/intro.ts` (grid, launch, sweep, slide, chase, the bay bridge, the hangers, the title);
      every frame of every shot checked: the car on screen inside the bars, in reach, nothing between,
      the camera above the ground and in no building
- [x] the `curtain`: black until the car and Tokyo's textures are in (or `wait`), then the intro and
      the race's `flag` in one step; any key or click skips
- [x] the `rival` a cutscene cast member (`name`, `advance`), the race's closed `flag`
- [x] the title's words in 3D, `assets/title/title.py` (Orbitron Black, leaning forward), baked, drawn
      by the title card in render3d's overlay with an environment of its own: ARCADE RACER in chrome
      on candy red, and the course select as PORTLAND (green), TOKYO (blue) and PARIS (sunset), each a
      gradient up its face on chrome sides, the ui's buttons laid over them as the camera draws them
- [x] the intro's frame check knows the corridor as land draws it (walls, retaining walls, banks,
      rails, bores): the launch camera, which stood inside the bank, stands over it
- [x] tests: `title.sim.test.ts`; the match page test skips the intro and finds the words' buttons

## Done

- [x] every kind and plugin has its test beside it, each run alone (14 files, 85 tests)
- [x] `yarn tsc` and `yarn lint` clean
- [ ] audit against the phase skills
