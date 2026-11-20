# grass3d

A meadow of grass made on the GPU round the camera, blade by blade. What a blade is, where it stands, how
tall and wide it is, which way it faces and leans, and its colour, is worked out once and kept in a
texture; each frame works out only what moves. The blades thin out with distance one at a time so nothing pops, sway in the
wind as gusts roll across the field, bend away from cars and bodies, and lie down in the tracks they leave,
standing back up over time. It has no row and nothing goes down the wire: every seat grows the same blades
from the same ground.

## Why use it

Use grass3d for ground cover: a meadow, a lawn, a prairie, the grass round a track. lod3d places things a
rule cares about, the trees bodies walk round and the rocks shots stop at, and places each one on the CPU;
grass is too many things too small for that. Here a field of hundreds of thousands of blades costs one
draw a chunk, comes in as fast as the ground under it is read, and is alive: the wind moves it and so does
everything that drives or walks through it.

## How it works

**Shared half (`grass3d.sim.ts`).** No row. The scene's numbers and their check, the levels a grass is
drawn in, the window of ground held round the camera, and `fill`, which reads a block of that ground off
the land.

`world.grass3d`:

- `grasses`: the name in the scene's loader catalogue of the grasses file, a `json` entry with
  `preload`, as particle3d's `effects` names its effects file. Every number of the grass is in that file.
- `mods`: `land` (required: `terrain3d`), `keeper` (required: `gpgpu3d`, whose keeper keeps what each
  blade is once it is worked out, and compiles a grass's `program` with it), `wind` (optional:
  `weather3d`), `pressed` (optional: `gpgpu3d`, the things that may press the grass, held on the GPU)
  and `behaviors`
  (optional, a list: `box3dvehicle`, `walker`), how a thing of each word presses it. A thing of a word
  none delivers presses nothing.

The grasses file:

- `budget`: milliseconds a frame the page fills ground in where it has no workers.
- `wind`: `{ toward, speed }`, the wind with no `wind` mod: degrees clockwise from north it blows toward,
  and metres a second.
- `gust`: `{ scale, strength, flutter, rate }`: gusts are patches `scale` metres across carried over the
  field by the wind's drift, the bend at a blade 1 − strength + 2·strength·g of its mean; every blade
  flutters `flutter` of its height at `rate` radians a second.
- `bend`: the share of a blade's height its tip is blown over by each metre a second of wind.
- `trample`: `{ recover, reach }`: seconds a trampled blade takes to stand back up, and metres from a
  thing that presses it over which a blade bends away from it.
- `grasses`: name to a grass, each drawn over the same ground.

A grass:

- `rules`: ramps over terrain3d's land record (`layer:<name>`, `slope`, `water`, …) multiplying the share
  of the ground it covers, times the painted surface's `cover` (a road's 0). Each blade has its own roll
  against that share, so an edge is ragged, never a line.
- `density` (blades a square metre), `full` (metres within which it is that dense; past it the density
  falls as (full / d)²), `reach` and `fade` (metres it reaches, and over which it shrinks into the ground).
- `tile`: metres a side of the square a blade is rolled in. A blade is the i-th of its tile at every
  distance, and is drawn while the density at it times tile² is over i, so the field thins blade by blade.
- `program`: a program of ops (below) worked out on the GPU for each blade, at its foot.
- `height`, `width`: `[base metres, spread]`; `widen` and `widest`: far blades grow wider,
  ((d / full)²)^widen times, at most `widest`, so the far field covers as the near one does.
- `lean`: each blade's own bend with no wind. `segments`: a blade's segments in each level, nearest first.
  `chunks`: chunks a level is drawn in across each side.
- `colours` `{ root, tip, dry }`, `dry` `{ amount, scale }` (patches turned toward the dry colour), `vary`
  (brightness from blade to blade), `translucency` (light through a blade lit from behind), `roughness`,
  `ao` (darker at the root, near the camera) and `shadow` (metres within which blades cast shadows).

**A program of ops.** `height: [base, spread]` is the variation from blade to blade, a roll for each
blade. Where grass grows tall, short, dry or bare over a field (a patch of lush meadow, tufts, a worn
edge) is a program: gpgpu3d's list of operations (`plugins/gpgpu3d/gpgpu3d.ops.ts` says every op and the
form of the list), written in the grass's own entry:

```json
"program": {
  "nodes": [
    { "id": "lush", "op": "noise", "kind": "simplex", "freq": 0.045, "seed": 3, "octaves": 3 },
    { "id": "patches", "op": "remap", "input": "lush", "inLo": 0.3, "inHi": 0.7, "outLo": 0.55, "outHi": 1.5, "ease": "smooth" },
    { "id": "clumps", "op": "noise", "kind": "worley", "metric": "f1", "freq": 0.8, "seed": 9 },
    { "id": "tufts", "op": "remap", "input": "clumps", "inLo": 0, "inHi": 0.6, "outLo": 1.25, "outHi": 0.75 },
    { "id": "tall", "op": "combine", "a": "patches", "b": "tufts", "mode": "mul" },
    { "id": "pale", "op": "remap", "input": "lush", "inLo": 0.5, "inHi": 0.3, "outLo": 0, "outHi": 1, "ease": "smooth" }
  ],
  "out": { "height": "tall", "dry": "pale" }
}
```

Each node is an `op` and its inputs and numbers; an input names an earlier node. `out` gives each name
below the node whose value it is, worked out for each blade at its foot, `(x, ground height, z)`:

- Each of these but `dry` multiplies the field of the same name that the grass has: `height`, `width`,
  `lean`, `vary`, `ao`, `translucency`, `roughness` (at most 1), `bend` (so 0 is a blade the wind never
  moves) and `dryAmount` (`dry.amount`). `bright` multiplies the blade's brightness. `cover` multiplies the
  share of the ground the grass covers there, so 0 grows none. `dry`, 0 to 1, is where the patches turned
  toward the dry colour lie, in place of the grass's own noise. A name `out` leaves out is as the grass's
  other numbers make it. Roughness and translucency are worked out for each blade and read in the fragment.
- `rootColour`, `tipColour` and `dryColour` are colours, in place of `colours.root`, `colours.tip` and
  `colours.dry` where the blade stands. Each is a tint, `{ "to": "#d9506a", "by": "blooms" }`, the grass's own
  colour mixed toward the hex by a node (0 none of it, 1 all), or `{ "r": "a", "g": "b", "b": "c" }`, three
  nodes 0 to 1. Both are written in sRGB, as `colours` is. A colour given as a node, or a number as a colour,
  throws.
- gpgpu3d's `roll` (`salt`) is the blade's own random number, another for each salt. Beside gpgpu3d's
  ops, a program reads `dist` (the blade's metres from the camera), which grass3d delivers to gpgpu3d
  (`grass3d.gpgpu3d.ts`).
- The sheet decides how much it costs: a node `out` does not reach is not compiled. A name of `out` whose
  nodes read no `time` and no `dist` is the same every frame, so it is worked out once for a blade and kept
  with it. A name that reads one moves: it is worked out for every blade drawn each frame, the names that
  shape a blade (`cover`, `height`, `width`, `lean`, `bend`) in the shadow pass too, and the nodes it reads
  that do not move are kept and read back.

The program is compiled by the keeper every scene with grass names (`keeper: 'gpgpu3d'` in
`world.grass3d.mods`). A program that reads `dist` has grass3d under `ops` in `world.gpgpu3d.mods`.

**Browser half (`grass3d.plugin.ts`, `grass3d.glsl.ts`).** Each `afterTick`:

- **The ground** round the camera is held in two float textures in blocks of 32 × 32 lattice points, the
  land's `cell` apart (terrain3d's finest ring), so a blade stands on the very triangle that is drawn. The
  window moves a block at a time and only the blocks coming into it are filled, nearest first, in a pool
  of grass3d's own workers (`grass3d.worker.ts`, `grass3d.blocks.ts`), or on the page within `budget`.
  A new version of the land (a stroke of the brush) fills every block again, the old drawn until the new
  comes.
- **The levels**: level 0 is every tile within 2·full, level k the band from full·2^k to full·2^(k+1),
  each drawing a quarter the blades a tile of the one inside it, so every level costs about the same.
  Each level is a square of chunks round the camera, each chunk one instanced draw, hidden where none of
  it reaches its band and culled to the camera and the lights by a sphere round its tiles and ground.
- **What is kept**: a blade's place, height, width, facing, lean and colour, rolled from an integer hash
  of its tile and number, the ground it stands on and what its program gives that does not move, are
  worked out once by gpgpu3d's keeper (`plugins/gpgpu3d/gpgpu3d.keeper.ts`), which grass3d hands each
  value of a blade, and held in its level's textures, a texel a blade (`kept()` gives their sizes and how
  many tiles each level has written). A tile is kept when it comes into its level's square round the camera, and again when a
  block of ground under it is written or wiped. A level whose square stands still on unchanged ground
  draws nothing into them. The demo's meadow keeps 1,044,384 blades in five textures a level, 50 MB.
- **The blades** are drawn from what was kept, the vertex shader working out only what moves: how thin
  the grass is at its distance; bent by the wind and its gusts, by every thing that presses it, read off
  gpgpu3d's texture, and by where it was trampled; a Bézier kept its own length. They are a dressed MeshStandardMaterial, so the sky's fog, the
  weather's wet and snow, lights3d's lights and the shadows reach them, and light comes through a blade
  lit from behind.
- **Trampling**: each thing the `pressed` mod holds tramples the lattice points its word's behavior says
  it treads: a car's box every point within a tread of it (a wheel at any turn of its spin, a body only
  where it sits on the ground), a walking body's cylinder every point under it while its foot is on the
  ground. The blade there lies away from the middle of what pressed it, standing back up over
  `trample.recover` seconds.
- **Prepared places**: a place terrain3d prepares (a cut, a teleport) is filled ahead, and `ready()` says
  whether it is; terrain3d waits on it through `grass3d.terrain3d.ts`.

It hands out `ready()`, `blocks()`, `at(i, j)` (the ground held at lattice point (i, j)) and `chunks()`.

## Using it

1. List `grass3d` after `terrain3d`, after `weather3d` when it takes its wind, after `gpgpu3d` when
   things press it, and before `render3d`, with `loader`.
2. Write the grasses file (below) in the game's `assets/` and list it in the scene's catalogue:
   `"grasses": { "type": "json", "url": "/games/<game>/assets/grasses.json", "preload": true }`.
3. Give `world.grass3d: { "grasses": "grasses", "mods": { "land": "terrain3d", "keeper": "gpgpu3d" } }`,
   with gpgpu3d listed before grass3d and given its `world.gpgpu3d: { "reach": 110 }`, and
   `wind: 'weather3d'` in grass3d's mods for the weather's wind. For cars and bodies to press it, add
   `pressed: 'gpgpu3d', behaviors: ['box3dvehicle', 'walker']`, and give gpgpu3d their things:
   `"gpgpu3d": { "reach": 110, "mods": { "things": ["box3dvehicle", "walker"], "behaviors": ["box3dvehicle", "shapes3d"] } }`
   (a walking body is a `cylinder`, shapes3d's word). Where gpgpu3d holds more than those, name the
   ones the grass meets in `world.gpgpu3d.meets.grass3d`.
4. For a prepared place to wait on the grass, `world.terrain3d.mods: { ready: ['grass3d'] }`.
5. Give the ground the grass stands on a ground layer of the same colour (a cc0 grass map): where the
   blades thin out with distance, it carries the field on.

The grasses file:

```json
{
  "budget": 3,
  "wind": { "toward": 210, "speed": 2.5 },
  "gust": { "scale": 14, "strength": 0.7, "flutter": 0.05, "rate": 2.4 },
  "bend": 0.07,
  "trample": { "recover": 25, "reach": 0.35 },
  "grasses": {
    "meadow": {
      "rules": [{ "q": "layer:rock", "lo": 0.5, "hi": 0.15 }, { "q": "slope", "lo": 0.45, "hi": 0.3 }],
      "density": 260, "full": 6, "reach": 110, "fade": 25, "tile": 3,
      "height": [0.42, 0.7], "width": [0.045, 0.5], "widen": 0.5, "widest": 6, "lean": 0.25,
      "segments": [5, 4, 3, 2, 1], "chunks": 4,
      "colours": { "root": "#1d3010", "tip": "#8fae4c", "dry": "#b9a462" }, "dry": { "amount": 0.45, "scale": 11 },
      "vary": 0.18, "translucency": 0.55, "roughness": 0.7, "ao": 0.55, "shadow": 14
    }
  }
}
```

A grass is tuned away from the game in the grass workshop, `yarn workshop grass3d <game>`: each grass of
the game's grasses file grown on a test ground (flat, hills, a ridge, bare patches) and trodden by a
body or a car going round it, every number changed as it draws and saved into the file
(`tools/workshop/README.md`).

demo_grass3d is a hatch driven through a meadow of it under skydome3d's sky and weather3d's wind; its
`dev.html` tunes every number of its grasses file live and holds the camera at the feet, across the meadow, over a hill, into
the wind and over the tracks.

## Plugins it works with

- **terrain3d**: `terrain3d.grass3d.ts` (`land`) is the land the grass stands on, its lattice and its
  workers' land; `grass3d.terrain3d.ts` is terrain3d's `ready` for prepared places.
- **weather3d**: `weather3d.grass3d.ts` (`wind`) is the wind as it gusts now and its drift, which carries
  the gusts across the field as it carries the clouds.
- **gpgpu3d**: `gpgpu3d.grass3d.ts` (`keeper`) keeps what each blade is and compiles a grass's program
  with it; its `pressed` is the things that may press the grass, on the GPU for the blades and as a list
  for the trampling. The other way, `grass3d.gpgpu3d.ts` (`ops`) delivers gpgpu3d the op `dist`.
- **box3dvehicle**: `box3dvehicle.grass3d.ts` (`behaviors`) is how a `hyperbox`, a car's body or wheel,
  presses the grass.
- **walker**: `walker.grass3d.ts` (`behaviors`) is how a `cylinder`, a walking body, presses it.
- **render3d**: dresses the blades and draws them; **lights3d** lights them and draws their shadows each
  frame.

## Keywords

grass, meadow, lawn, prairie, ground cover, foliage, vegetation, GPU grass, procedural grass, instancing,
level of detail, LOD, density falloff, wind, gusts, sway, flutter, trample, tracks, tyre tracks, bend,
translucency, Ghost of Tsushima, patches of tall grass, tufts, program, ops, `world.grass3d`, grasses file, `ready`, `blocks`, `at`, `chunks`
