---
name: benchmarking-a-game
description: Use in core, or any clone of it, whenever a game or a scene runs slow, its frame rate drops, a change made it slower, or Bill asks what is expensive, where the time goes, to profile a scene, to profile on node, to profile the GPU, which material or pass costs, or for percents a step. Profiles the whole scene as it plays, every system of it timed where it is called (each kind's rules, each plugin's page half, the rows' looks, the draw), its rules alone on node under the CPU profiler, and what its drawing costs the GPU, each material, pass and the shadow map taken away in turn. Never a piece of the scene picked out and timed alone, never a guess at what is slow.
---

# Benchmarking a game

A scene is profiled whole, as it plays. On the CPU, everything that runs in it is timed where it is
called, every frame, and laid out as each system's share of the frame. On the GPU, everything it draws
is taken away in turn (each material, each pass, the shadow map) and what each saves is measured. Then
what is expensive is read off the numbers. Never pick a piece out of the scene and time it alone, never
guess: the profile says where the time goes.

Always run both. A frame's CPU work far under the frame's time while the rate is under 60 means the page
is held by the GPU, and the CPU profile will not name the cost: the GPU profile does, and its materials
most often (a pixel shader over much of the screen).

Four scripts beside this file do it, and a fifth, `testbed.mjs`, opens the page for the two that run in
Chrome.

## Basic and deep: `bench.mjs`

```
node .claude/skills/benchmarking-a-game/bench.mjs <server base url> <game> [--deep] [--out <folder>] [scene]…
```

"Benchmark the game" is this: every scene the manager's table names (or those given), one after
another, each through its ticks (`rules-profile.ts`, below) and its page on the GPU
(`gpu-profile.mjs`, below), and one table of every scene at the end. Every run's whole output is
written to `<out>`.

Both modes run the GPU profile whole: the page as it is, then each pass, the shadows and each
material taken away in turn. The table gives each scene's frame as it is and the thing whose taking
away saved the most.

- **Basic, the default**: it just runs the GPU profile, once, as it runs by itself: 3 s a window, one
  run.
- **`--deep`**: the GPU profile with `--each 4 --runs 2`: each window 4 s, the whole of it twice, the
  medians and each row's least and most saved. Mech's title, 23 materials, took 385 s.

## What the game's `dev.html` has to add first

Both Chrome profilers open `games/<game>/dev.html?scene=<scene>` and read the page and its truths off
`window`. A game's page does not keep them on its own: before the first run, the game's `dev.html` (made
from its `index.html` when it has none) gets three changes, and nothing else in it changes:

1. The scene named in the address is the one entered, put right after the scene file's import:

   ```js
   file.prefabs.scenemanager.entry = new URLSearchParams(location.search).get('scene') ?? file.prefabs.scenemanager.entry
   ```

2. The truths `load` hands back are kept, where the CPU profile times the rules:

   ```js
   window.__scenes = await load(truth, import.meta.url)
   ```

   in place of `await load(truth, import.meta.url)`.

3. The page `view` hands back is kept, where both profilers find the client:

   ```js
   window.__page = page
   ```

   right after `const page = view(...)`.

Without 1 the page enters the game's own entry whatever `<scene>` says; without 2 or 3 the run stops
after three minutes on `no window.__scenes` or `no window.__page`.

## The page, opened and waited on: `testbed.mjs`

`scene-profile.mjs` and `gpu-profile.mjs` both open `games/<game>/dev.html?scene=<scene>` in a headless
Chrome on the GPU (its own window and profile, nothing on the screen) and wait on it in stages, each
printed with the seconds since it was opened and the client's step:

- **up**: the testbed keeps its page on `window.__page`, the page has a client, and the client has
  taken a packet (and `window.__scenes` for the CPU profile, render3d's renderer for the GPU's);
- **loaded**: every plugin that says it is still loading is done. Terrain3d: its rings are on the
  scene (with `preload`, the land prepared whole where the camera stands, its maps landed and
  scatter3d's share placed), no rebuild in hand, and every bake with nothing `left`. Scatter3d: its
  share of the prepared place placed. A land built in workers is waited on with no flag at all;
  `--loading` skips this stage, to measure the loading itself;
- **ready**: `--ready "<page expression>"` true, when given, for what no plugin reports (a set piece
  shown, a race started);
- **past step n**: `--after <n>`, the client has taken `n` steps. The testbed steps by the clock, so
  the step goes up 60 a second however slow the frame is: 600 is ten seconds.

The page is a 1280 by 800 screen of `--dpr` device pixels a pixel (1 when left out). render3d's
`pixelRatio` only caps the screen's, so a scene asking for 2 draws at 1 there: `--dpr 2` is a Mac's
Retina screen, four times the pixels. The line the measuring starts on prints the ratio drawn at and the
drawing buffer (`drawn at pixel ratio 2, 2560x1440`).

Then it clicks the page's middle, presses each `--press` key for real (a key that starts the race, an
autopilot) and settles `--settle` seconds (4 when left out). A stage still waited on after three
minutes stops the run and names what it waits on (`no window.__page: the testbed keeps its page there`,
`terrain3d: bakes, 4, 16, 16 left`) and the first error the page threw.

**Stopping time.** `--still` stops time once the page has settled, before anything is measured; `open`
hands back `stop()` and `go()` for a script that stops and starts it itself. Stopped, the client the
page holds drops every packet it is handed, so its rows stay as the last one left them, and the page
draws every frame at the newest step, with nothing drawn between steps. The sea, the clouds and the
sky move by the rows' clock, so they stand still with the rows. The truth in the tab goes on stepping;
only the page stops taking its steps. Two screenshots of a stopped page differ only by what was changed
between them: the AO pass switched off, a material made flat, a ring hidden.

Every exception and `console.error` from the moment the page opens is caught: those while it loaded
and settled are counted and the first printed before the numbers, and each profiler counts its own
(below). Any other Chrome driven over a debugging port is named, by its profile folder, before the page
opens and again as it is measured: it draws on the same GPU. On 2026-10-21 two another session's
profilers had left open for an hour and a half took demo_terrain3d's HD tier from 16.7 frames a second
to 11.0. Its own Chrome is killed however the profiler ends (done, a throw, SIGINT, SIGTERM, SIGHUP),
so a timed-out run leaves nothing drawing.

## 1. The scene, as it plays: `scene-profile.mjs`

```
node .claude/skills/benchmarking-a-game/scene-profile.mjs <server base url> <game> <scene> <seconds> \
  [--press <key>]… [--settle <s>] [--loading] [--ready "<page expression>"] [--after <steps>] [--still] [--out <folder>]
```

The page, opened, loaded, pressed and settled by `testbed.mjs`, timed for `seconds`:

- **rules**: each kind's `before`, `tick`, `after` and each act, in every truth the page holds, a
  plugin's rules among them (box3d, skydome3d, …), and each truth's step whole, so the engine's own
  share of the step (messages, seats, packets) is what is left of it;
- **page**: each plugin's page half, its `input`, `tick` and `afterTick` (render3d's draw is its
  `afterTick`);
- **the frame**: each animation frame's work whole; what is left after the rules and the page plugins is
  the rows' looks (`<kind>.client.ts`) and the engine's own page work.

It prints the frames counted and their rate, the mean milliseconds of a frame's work, each system's mean
milliseconds a frame and share, and the five slowest frames with their biggest systems. It needs the
game's server (`yarn editor`, its port) and the game's `dev.html` with the three changes above. If the
page threw while it was
timed, it says how often and the first error above the numbers and ends with 1: a frame that throws
stops part way, and reads less work than it is.

Read it this way: a frame's work well under 16.67 ms while the rate is under 60 means the page waits on
something none of the scene's code is, the GPU most often; a frame's work over 16.67 ms names the
systems that take it. A slowest frame far over the rest, all in one system (render3d's draw compiling a
shader, say), is a hitch, not the rate.

## 2. The ticks, timed, on node: `rules-profile.ts`

```
node --experimental-strip-types [--cpu-prof --cpu-prof-dir=<folder>] \
  .claude/skills/benchmarking-a-game/rules-profile.ts <game> <scene> <seconds> [--act <act>]…
```

The game's business logic, timed: the scene booted alone in memory, as `load` boots each child, with
no manager, no prediction and no rewind, one seat joined (its entry act sent when the manager's table
names one), each `--act` sent on the seat's `player` row (the acts its page would send: `ready`,
`auto`), stepped for `seconds` of game time, as fast as node goes. Every kind's `before`, `tick`,
`after` and each act is timed for its own time, each kind name apart, so the rows add up to the step
and what is left is the engine's own. It prints the steps' mean, 95% and most milliseconds, and each
kind's pass's milliseconds a step and share, most first. With `--cpu-prof`, node's CPU profiler writes
a `.cpuprofile` into `<folder>` for `cpu-hot.mjs`. No page, no draw, no wire: what the scene's own
rules cost a step.

"Profile the scenes" starts here: every scene of the game through this, one table each.

## 3. Which functions: `cpu-hot.mjs`

```
node .claude/skills/benchmarking-a-game/cpu-hot.mjs <file.cpuprofile> [how many]
```

Any `.cpuprofile`, node's or Chrome's: the functions most first by their own time and by their whole
time (with what they called), as shares of the time sampled, with file and line. Read it after 2, or
after 1 has named a system, to find the function inside it.

## 4. The GPU: `gpu-profile.mjs`

```
node .claude/skills/benchmarking-a-game/gpu-profile.mjs <server base url> <game> <scene> \
  [--each <s>] [--runs <n>] [--press <key>]… [--settle <s>] [--loading] [--ready "<page expression>"] \
  [--after <steps>] [--still] [--out <folder>]
```

The same page, opened, loaded, pressed and settled by `testbed.mjs`. It counts the frames over `--each`
seconds (3 when left out) as it is, then with one thing of the scene's drawing taken away at a time,
put back before the next:

- **each pass** of render3d's composer but the scene's own draw (bloom, a plugin's effect, the output),
  switched off;
- **shadows**: every light that casts a shadow let go of it, so no shadow map is drawn;
- **each material**: every mesh drawn with it put in one plain material instead, three's
  MeshBasicMaterial in one colour, unlit and untextured. What that saves is what the material's shaders
  cost over every pixel and vertex it draws: its pixel shader, most often, where it covers much of the
  screen. Materials of one label (each pod's own, each particle sheet's) are taken away together;
- **every material flat** at once.

The whole of it is done `--runs` times (1 when left out). Each run measures the page as it is at its
start and at its end, and each thing's saving in that run is against the mean of the two, so a page that
drifts over the run is not read as a saving. It prints each run's start and end, the frame as it is (the
median of the runs), and for each thing taken away the frames a second, the frame's milliseconds and the
milliseconds saved, the medians of the runs, with the least and most saved when there is more than one,
most saved first. The page has to be held by the GPU for this to read anything: a page already at 60 saves
nothing it can show, and a saving that reaches 60 frames a second is that much or more. A swapped
material compiles the first time it is drawn, so each swap settles a second before its frames count.

A mesh wears the plain material only inside the renderer's `render`, and its own again the moment that
returns: skydome3d writes its precipitation's uniforms through `mesh.material.uniforms` every frame,
and a mesh left in the plain material made its `afterTick` throw, and after it the ui throw every frame
(`showed caption title twice in one frame`) with the material put back. A frame that throws before it
draws is a fast frame: that run read 60 frames a second for every row after it. So every exception and
`console.error` while a thing is taken away is counted beside its row, and a page still throwing a
second after the thing is put back stops the run there.

Each material is labelled by its own name, its type, the keys of its `userData` in braces (the
plugin that made it: terrain3d's ground is `{terrain3d, terrain3dValues}`), and the first mesh's name,
or its geometry's type in angle brackets where it has none (skydome3d's dome is `<SphereGeometry>`, its
precipitation `<InstancedBufferGeometry>`). Each material's mesh count is printed before the steps.

One window counts whole frames, so a row reads to one frame over `--each`: 1.2 ms at 17 frames a second
over 3 s. Run to run, a row moved up to 4 ms at that rate; a slow page wants `--each 6` and `--runs 2`
or more before a small row is believed, and a row whose least..most crosses 0 is not a saving.

## A scene that loads in a worker

The frame rate while the land is still building is not the scene's: demo_terrain3d's HD tier drew 59
frames a second in the seconds its rings were built in workers, and 15 to 19 from the second they were
shown, for the 83 s more it was watched. The rings were shown 9 s after the page opened and the bakes
done 1 s later. `testbed.mjs`'s **loaded** stage waits on exactly that, with no flag; `--after` waits
on so many steps more, for a scene that settles some while after it loads (a cutscene, a weather that
blends in).

The GPU's own timer (WebGL2's `EXT_disjoint_timer_query_webgl2`) is not used: on Chrome's ANGLE Metal
on an M1 it read 204 ms of GPU a frame on a page making 27 frames a second, and 35 ms for one line.

## canyonracer's set pieces scene, 2026-10-21

```
node .claude/skills/benchmarking-a-game/scene-profile.mjs http://localhost:5173 canyonracer open 15 \
  --press f --ready "!window.__page.client.plugins.openspace || window.__page.client.plugins.openspace.shown()"
```

472 frames in 15 s, 31.5 a second, a frame's work 5.6 ms: the scene's code took a third of the frame,
so the page was waiting on the GPU. Of the work, render3d's draw 34%, particle3d's page half 31%, the
looks 10%, the rivals' rules 7%, the HUD 6%. On node the same scene's rules ran 30 s of game in 0.39 s,
0.22 ms a step.

```
node .claude/skills/benchmarking-a-game/gpu-profile.mjs http://localhost:5173 canyonracer gym \
  --ready "!window.__page.client.plugins.openspace || window.__page.client.plugins.openspace.shown()"
```

32.7 frames a second, 30.6 ms a frame. Canyon3d's ground look made flat: 60 frames a second, 13.9 ms or
more saved, all of the frame past 60 (its pixel shader: two layers, the rock projected three ways, a
noise edge, a height blend, the far blend, the sky's cloud shadow). The sky dome's material 5.2 ms,
bloom 4.7, the output pass 3.1, the set pieces' material 2.6, the heat shimmer 1.5, the shadow map 0.6.
Bill had found the same by hand: the ground flat and the sky off, 60.

## demo_terrain3d's three tiers, 2026-10-21

```
node .claude/skills/benchmarking-a-game/scene-profile.mjs http://localhost:5181 demo_terrain3d hd 15 --settle 5
node .claude/skills/benchmarking-a-game/gpu-profile.mjs http://localhost:5181 demo_terrain3d hd --each 6 --runs 2 --settle 5
```

Its `dev.html` had the three changes above for these runs; they were not kept. Each tier was run
waiting on terrain3d's load (then a `--ready` of the same; now the **loaded** stage) and `--settle 5`,
the GPU with `--each 6`. Every one of these runs was made while two another session's headless
Chromes drew on the same GPU (open from 12:49 and 13:10, the runs 13:37 to 13:58). The page alone
was not measured that day; read the order of the costs, and run again with no other Chrome named
before taking the milliseconds as the page's.

On the CPU every tier waits on the GPU: HD 16.7 frames a second on 3.42 ms of work, UHD 9.0 on 4.90 ms,
lofi 55.7 on 1.51 ms. render3d's draw and ocean3d's page half are the largest named systems. On node
HD's rules ran 30 s of game in 1.02 s, 0.569 ms a step, 1.043 ms at 95%.

On the GPU:

- **HD**: 62.5 ms a frame (58.3 at the end), every material flat 16.95 ms. Terrain3d's ground 25.0 ms
  saved (22.0 and 22.0 on two 3 s runs), the sky dome 11.7 (8.3, 10.0), the firs' leaf 11.2 (8.3, 10.0),
  then ocean3d's depth, the reeds, the bark, the precipitation, ocean3d and the grass each 4 to 7 ms on
  this run and 1 to 5 on the others; shadows 2.5.
- **UHD**: 111.1 ms a frame (115.4 at the end), every material flat still 42.6 ms. Terrain3d's ground
  25.4, the firs' leaf 14.3, the AO pass 7.7; the rest within the run's spread (rows of −8.9 ms).
- **lofi**: 18.0 ms a frame, 55.5 frames a second, every material flat 59.8; the ground 1.1.

Those runs drew every tier at pixel ratio 1 (the screen's was 1). Three test scenes, each a tier with
one thing changed, were then measured on a Retina screen (`--dpr 2`), 6 s each, three other Chromes on
the GPU throughout, and dropped after: `uhd_px1` (UHD at pixel ratio 1), `hd_px2` (HD at 2) and `uhd_hdgeo` (UHD with HD's
terrain3d rings, scatter cells, reaches, densities, lods and shadow distances, and ocean3d rings and
segments). Triangles and draw calls are a whole frame's, every render call in it.

| scene | triangles | draw calls | pixels | ms a frame |
|---|---|---|---|---|
| hd | 2,188,103 | 126 | 0.92 M | 63.9 |
| hd_px2 | 2,188,103 | 126 | 3.69 M | 150.0 |
| uhd_px1 | 12,978,598 | 154 | 0.92 M | 122.5 |
| uhd_hdgeo | 2,188,121 | 144 | 3.69 M | 193.6 |
| uhd | 12,978,598 | 154 | 3.69 M | 261.0 |

On Retina, UHD's four times the pixels cost 138.5 ms (uhd against uhd_px1), its 10.8 M triangles more
than HD's 67.4 ms (uhd against uhd_hdgeo), and the rest of what UHD sets (2048² ground, AO, bloom, a
512 m shadow reach) 43.6 ms (uhd_hdgeo against hd_px2).
