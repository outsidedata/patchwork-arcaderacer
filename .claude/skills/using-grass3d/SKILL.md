---
name: using-grass3d
description: Use in core, or any clone of it, whenever grass3d comes up - a meadow, a lawn, a prairie, ground cover made blade by blade on the GPU round the camera on terrain3d's land - `world.grass3d` (`grasses`, `mods.land`, `mods.wind`, `mods.keeper`, `mods.pressed`, `mods.behaviors`), a grass's `program` of ops (patches of tall, short or dry grass, tufts, `out`'s `height`, `width`, `lean`, `cover`, `bright`, `vary`, `ao`, `translucency`, `roughness`, `bend`, `dryAmount`, `dry`, and the colours `rootColour`, `tipColour`, `dryColour`: flowers, a patch of another colour, the ops `roll` and `dist`), the grasses file (`budget`, `wind`, `gust`, `bend`, `trample`, and each grass's `rules`, `density`, `full`, `reach`, `fade`, `tile`, `height`, `width`, `widen`, `widest`, `lean`, `segments`, `chunks`, `colours`, `dry`, `vary`, `translucency`, `roughness`, `ao`, `shadow`), where grass grows and where it does not (a road, rock, a slope, water), wind and gusts, grass bent and trampled by cars and bodies (tyre tracks), a prepared place waiting on its grass (`world.terrain3d.mods.ready`), the grass workshop (`yarn workshop grass3d <game>`), or a game's own thing pressing the grass (`<a>.grass3d.ts`). Also when no grass is drawn, grass grows on a road or through a car, the far field looks bare or pops, nothing leaves tracks, grass fills in after a cut or a teleport, or grass3d throws "stands on a land", "is listed before" or "is listed after render3d".
---

# Using grass3d

grass3d (`plugins/grass3d/`) draws a meadow round the camera, blade by blade on the GPU: what a blade is
(its place, size, facing, lean and colour) is worked out once and kept in a texture, and each frame works
out only what moves it (the wind, what presses it, the thinning with distance). It has no row and nothing goes down the wire:
every seat grows the same blades from the same ground, and no rule reads one. The header of
`grass3d.sim.ts` and the README say every number; this is how a scene is put together with it.

Grass is ground cover: too many things, too small, for a rule to care about. The trees bodies walk round
and the rocks shots stop at are lod3d's (`building-a-level`).

## What the scene gives

```json
"loader": { "assets": { "grasses": { "type": "json", "url": "/games/<game>/assets/grasses.json", "preload": true } } },
"grass3d": { "grasses": "grasses", "mods": { "land": "terrain3d", "keeper": "gpgpu3d", "wind": "weather3d", "pressed": "gpgpu3d", "behaviors": ["box3dvehicle"] } },
"gpgpu3d": { "reach": 110, "mods": { "things": ["box3dvehicle"], "behaviors": ["box3dvehicle"], "ops": ["grass3d"] } },
"terrain3d": { "mods": { "ready": ["grass3d"] } }
```

`plugins` lists `loader`, then `terrain3d`, `weather3d` and `gpgpu3d` (each one its mods name), then
`grass3d`, then `render3d`. Once the grasses file has landed grass3d checks the order every frame and
throws naming the plugin out of place. The plugins under gpgpu3d's `things` that have a browser half
(box3dvehicle) are listed too, before gpgpu3d.

| mod | | from | what it gives |
|---|---|---|---|
| `land` | required | `terrain3d` | the ground the blades stand on, on the finest ring's lattice, so a blade stands on the triangle that is drawn |
| `wind` | optional | `weather3d` | the wind as it gusts now and its drift, which carries the gusts over the field as it carries the clouds. With none, the grasses file's `wind` blows |
| `pressed` | optional | `gpgpu3d` | the things that may press the grass. With none, nothing does |
| `keeper` | required | `gpgpu3d` | keeps what each blade is once it is worked out, and compiles a grass's `program` of ops with it (`using-gpgpu3d`, The keeper). gpgpu3d's `ops` names `grass3d` for a program that reads `dist` |
| `behaviors` | optional, a list | `box3dvehicle`, `walker`, a game's own | how a thing of each word presses it |

Every other number is in the grasses file, and `world.grass3d` holds nothing else.

## Where grass grows

Each grass of the file is drawn over the same ground. Where it stands is its `rules` and the land's paint:

- `rules` is `[{ q, lo, hi }]`, ramps over terrain3d's land record (`layer:<name>`, `slope`, `water` and
  the rest, `using-terrain3d`). Each multiplies the share of the ground the grass covers there.
  demo_grass3d's meadow thins out onto rock and steep ground:
  `[{ "q": "layer:rock", "lo": 0.5, "hi": 0.15 }, { "q": "slope", "lo": 0.45, "hi": 0.3 }]`.
- That share is multiplied by the painted surface's `cover`: a road painted with a surface of cover 0
  grows none. No rule is written for a road.
- Each blade has its own roll against the share, so an edge is ragged, never a line.
- Erased ground has no grass.
- A rule the land cannot answer throws, naming the grass and the rule.

Give the ground under the grass a ground layer of the grass's colour (a cc0 grass map). Where the blades
thin out with distance, the ground carries the field on.

## Tall, short and dry: a program

`height: [base, spread]` is the variation from blade to blade. Where grass is tall or short or dry over a
field (a patch of lush meadow, tufts, a worn edge) is a `program` in the grass's entry: gpgpu3d's list of
ops (`using-gpgpu3d`, Ops), worked out on the GPU for each blade at its foot, `(x, ground height, z)`:

```json
"program": {
  "nodes": [
    { "id": "lush", "op": "noise", "kind": "simplex", "freq": 0.045, "seed": 3, "octaves": 3 },
    { "id": "patches", "op": "remap", "input": "lush", "inLo": 0.3, "inHi": 0.7, "outLo": 0.55, "outHi": 1.5, "ease": "smooth" },
    { "id": "pale", "op": "remap", "input": "lush", "inLo": 0.5, "inHi": 0.3, "outLo": 0, "outHi": 1, "ease": "smooth" }
  ],
  "out": { "height": "patches", "dry": "pale" }
}
```

- `out` names that multiply the blade's own: `height`, `width`, `lean`, `bright`, `vary`, `ao`,
  `translucency`, `roughness` (at most 1), `bend` (0 is a blade the wind never moves), `dryAmount`
  (`dry.amount`); `cover` multiplies the share of the ground the grass covers (0 grows none); `dry` (0 to 1)
  is where the dry patches lie, in place of the grass's own noise. A name left out changes nothing, so a
  grass with no program is drawn as it always was.
- `out` colours, in place of the grass's own where the blade stands: `rootColour`, `tipColour`, `dryColour`.
  Each is a tint, `{ "to": "#d9506a", "by": "<node>" }` (the grass's colour mixed toward the hex by the node,
  0 to 1), or `{ "r": "<node>", "g": "<node>", "b": "<node>" }`, written in sRGB as `colours` is. A grass's
  flowers are a tint by a sparse noise: `{ "id": "bloom", "op": "noise", "kind": "value", "freq": 0.35 }`,
  `remap`ped from 0.7 to 0.76 onto 0 to 1, `"tipColour": { "to": "#d9506a", "by": "blooms" }`.
- `freq` is cycles a metre: 0.045 is a patch about 22 m across.
- gpgpu3d's `roll` (`salt`) is a blade's own random number. grass3d's own op is `dist` (metres from the
  camera).
- What it costs is the nodes `out` reaches. A name whose nodes read no `time` and no `dist` is worked out
  once for a blade and kept with it. A name that reads one is worked out for every blade drawn each frame,
  and again in the shadow pass when it shapes the blade (`cover`, `height`, `width`, `lean`, `bend`).
  Measure it with `benchmarking-a-game`; demo_grass3d's `dev.html?grass=0` is the scene without grass.
- Everything of the program is sheet-driven: the scene names two mods (`keeper: 'gpgpu3d'` in
  `world.grass3d.mods`, which every scene with grass names, and `ops: ['grass3d']` in
  `world.gpgpu3d.mods` for `dist`) and gpgpu3d is listed before grass3d.

## How far it reaches, and what that costs

- `density`: blades a square metre within `full` metres of the camera. Past `full` the density falls as
  (full / d)², so the blades on screen stay the same in number however far the grass reaches.
- `reach`: metres from the camera it reaches, beyond `full`. `fade`: the metres inside `reach` over
  which the blades shrink into the ground.
- `widen` and `widest`: far blades are drawn wider, ((d / full)²)^widen times, at most `widest`, so the
  far field covers as the near one does.
- `tile`: metres a side of the square a blade's place is rolled in. A blade is the i-th of its tile at
  every distance, so the field thins blade by blade and nothing pops.
- `segments`: a blade's segments in each level, nearest first: `[5, 4, 3, 2, 1]`. `chunks`: the squares
  each level is drawn in across each side, each one draw, culled on its own.
- `shadow`: metres from the camera within which blades cast shadows; 0 for none.

A grass is drawn in levels: level 0 every tile within 2·full, level k the band from full·2^k to
full·2^(k+1), each drawing a quarter the blades a tile of the one inside it.

The ground is held round the camera in blocks of 32 by 32 lattice points, filled in grass3d's own
workers, nearest first, or on the page within `budget` milliseconds a frame where there are no workers.
A stroke of terrain3d's brush fills every block again, the old drawn until the new comes.

What a field costs is measured with `benchmarking-a-game`; demo_grass3d's `dev.html?grass=0` is the same
scene without grass3d, to measure it against.

## How it looks

- `height` and `width`: `[base metres, spread]`. `lean`: each blade's own bend with no wind.
- `colours` `{ root, tip, dry }`, and `dry` `{ amount, scale }`: patches `scale` metres across turned
  toward the dry colour. `vary`: brightness from blade to blade.
- `translucency`: light through a blade lit from behind. `roughness`. `ao`: darker at the root, near
  the camera.

The blades are a dressed standard material, so the sky's fog, the weather's wet and snow, lights3d's
lights and the shadows reach them.

## Wind

- The file's `wind` `{ toward, speed }`: degrees clockwise from north it blows toward (0 toward −z, 90
  toward +x) and metres a second. `mods.wind: 'weather3d'` takes the weather's in its place.
- `gust` `{ scale, strength, flutter, rate }`: gusts are patches `scale` metres across carried over the
  field by the wind's drift; `strength` from 0 to 1 is how far a gust swings the bend either side of its
  mean; every blade flutters `flutter` of its height at `rate` radians a second.
- `bend`: the share of a blade's height its tip is blown over by each metre a second of wind, at most
  0.85.

## Bent and trampled

The grass bends away from a thing that stands over it, within `trample.reach` metres of its footprint,
and lies down where the thing treads the ground, standing back up over `trample.recover` seconds. Three
things make it happen, and each is needed:

1. gpgpu3d holds the thing: its plugin is under `world.gpgpu3d.mods.things`, with its word's plugin
   under `world.gpgpu3d.mods.behaviors` (`using-gpgpu3d`).
2. `world.grass3d.mods.pressed: 'gpgpu3d'`, with gpgpu3d listed before grass3d.
3. `world.grass3d.mods.behaviors` names the plugin that says how a thing of that word presses grass.

| things | their word | gpgpu3d `things` / `behaviors` | grass3d `behaviors` | it tramples |
|---|---|---|---|---|
| a car's body and wheels | `hyperbox` | `box3dvehicle` / `box3dvehicle` | `box3dvehicle` | where a wheel meets the ground at any turn of its spin; under the body only where it sits on the ground |
| a walking body | `cylinder` | `walker` / `shapes3d` | `walker` | under it while its foot is on the ground |

A thing of a word no `behaviors` plugin delivers presses nothing, and nothing throws: the land is a
thing too. `pressed` and `behaviors` are read on the first frame and kept until the scene closes. Where gpgpu3d holds more than cars and bodies, name the ones the grass meets:
`"meets": { "grass3d": ["box3dvehicle", "walker"] }`.

A new version of the land keeps what was trampled. A block of ground that leaves the window round the
camera is wiped, its tracks with it.

### A game's own thing

A game's plugin that hands gpgpu3d a thing of its own word delivers grass3d a Press for it,
`games/<game>/plugins/<a>/<a>.grass3d.ts`, exporting `behaviors()` → `{ <word>: Press }`, and the scene
names `<a>` under `world.grass3d.mods.behaviors`. A Press is `glsl` defining
`bool <word>Press(int s, vec3 root, float tall, out float out_, out vec2 middle)`, `span(data)` and
`trodden(data, x, y, z, { tread, cell })` (`grass3d.sim.ts`, Pressing). `plugins/walker/walker.grass3d.ts`
is thirty lines and the one to read.

## A cut or a teleport onto grass

A place terrain3d prepares (`prepare`) is filled ahead by grass3d. With
`world.terrain3d.mods: { ready: ['grass3d'] }` terrain3d counts the place ready only once the grass
there is, so the camera lands on grass already standing. Without it, the grass fills in after arriving.

## Tuning and reading it

- `yarn workshop grass3d <game>` opens `/grass3d?game=<game>`, the grass workshop: each grass of the
  game's grasses file grown by grass3d on a test ground (`flat`, `rolling`, `steep`, `patchy`, `rough`)
  and trodden by `nothing`, `standing`, `walker`, `runner` or `car` going round it, every number a
  slider, changed as it draws and saved into the file. `&file=<repo path>` picks one of several grasses
  files, `&grass=<name>&ground=<name>&treader=<name>&view=<name>` opens on one, and `&together=1`
  grows the file's other grasses with it. How a grass looks, blows and is trodden is tuned there, and
  the numbers of its `program`'s nodes too (a save is compiled over the ops the game's scene delivers,
  and a number the ops refuse is not written; the ops, the wiring and the `out` are written in the file).
  Where it grows in the game, its `rules`, is not shown or changed there: it is written in the file and
  looked at in the game (`tools/workshop/README.md`, The grass workshop; `asset-workshop`).
- The grasses file changing makes everything again, so a `dev.html` panel writes it live.
  demo_grass3d's `dev.html` has every number of the grass and of its program's nodes, the gusts and the
  trampling, the weather and the hour, and views that hold the camera: `?view=feet`, `meadow`, `hill`,
  `wind`, `track`.
- `plugins.grass3d` hands out `ready()`, `blocks()` (`{ held, of, asked, queued, flight }`), `at(i, j)`
  (lattice point (i, j) as held: `{ height, trampled, lies, keeps }`) and `chunks()` (each grass's
  levels, each level's chunks: `{ visible, castShadow, at, count }`), for a readout and a test.

## What it throws

| message | cause |
|---|---|
| `grass3d stands on a land, and the scene names no world.grass3d.mods.land` | `land` missing |
| `grass3d is listed before <a>, whose land` (or `wind`, `pressed`) `it reads that frame` | terrain3d, weather3d or gpgpu3d listed after grass3d |
| `grass3d's <mod> is <a>'s, which this scene does not list` | the plugin `land`, `wind` or `pressed` names is not in `plugins`; a `behaviors` plugin is not checked |
| `grass3d is listed after render3d` | the order of `plugins` |
| `grass3d draws round render3d's camera, and this scene does not list render3d` | `render3d` not listed |
| `grass3d reads its grasses file through the loader` | `loader` not listed |
| `world.grass3d.grasses ... is not the name of the grasses file` | `grasses` is not a catalogue name |
| `grass3d <what> <value> is not <what it is>` | the first number of the grasses file that is wrong, with what it has to be |
| `grass3d keeps what each blade is once it is worked out, and the scene names no world.grass3d.mods.keeper` | `keeper` missing: name `gpgpu3d`, list it before grass3d and give it `world.gpgpu3d.reach` |
| `grass3d grass <name>: level <k>, ... is kept in a texture <w> by <h>, more than this GPU's <n>` | more blades a tile, or tiles a side, than the GPU's largest texture holds: lower `density`, `tile` or `reach` |
| `grass3d grass <name> program node <k> (<id>) ...` / `... out <x> is none of height, width, ...` | a node or an `out` gpgpu3d's compiler refuses: the sentence names the node, the field and what it should be; an op none of `world.gpgpu3d.mods.ops` delivers lists the ops there are |

## What goes wrong without a throw

- **No grass anywhere.** Nothing is drawn until the grasses file has landed and the land is shown.
  Then: a rule that leaves no share, or a surface of cover 0 painted over the whole ground.
- **Grass on the road.** The road's surface has a `cover` above 0 (`using-terrain3d`).
- **No tracks, and nothing bends.** One of the three under Bent and trampled is missing. A missing
  `mods.behaviors` entry throws nothing.
- **Tracks that don't line up with the wheels, trodden in blocks.** The blades stand, and the
  trampling is kept, on the points of terrain3d's finest ring: its spacing is `2 · reach / seg`.
  demo_grass3d's finest ring is `{ "reach": 64, "seg": 256 }`, a point every 0.5 m. A scene built
  before grass3d often has a coarse first ring (vehicles' plains had 256 / 128, 4 m), and its tracks
  come out in 4 m blocks. When grass goes into a scene, check `world.terrain3d.rings[0]`, in the scene
  and in the partial it `extends`, and put a ring of 0.5 m or finer inside the others.

## Proving it

`yarn vitest run plugins/grass3d/grass3d.sim.test.ts`, `plugins/grass3d/grass3d.plugin.test.ts`, and the
tests beside its mods: `plugins/terrain3d/terrain3d.grass3d.test.ts`,
`plugins/weather3d/weather3d.grass3d.test.ts`, `plugins/box3dvehicle/box3dvehicle.grass3d.test.ts`.
How it looks is judged in the page (`verifying-3d-visuals`).

## Where to try it

`games/demo_grass3d`: a hatch driven through a meadow under skydome3d's sky and weather3d's wind, over
land written by `assets/meadow.mjs` with rock on the steep slopes and a gravel track no grass grows on.
