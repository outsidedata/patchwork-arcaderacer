# lod3d

Instances placed round the camera by level of detail: forests, grass, ferns, boulders, stones. Each
layer places its things on surfaces (terrain3d's land, shapes3d's shapes) or round the instances of
another layer, the same to the bit on the server, every page and every worker, in tiles that are held
nearer or farther from the camera in shells. lod3d knows no ground and draws nothing itself: every
surface, and every way an instance is drawn, comes from a mod.

## Why use it

Use lod3d for anything a landscape has thousands of: trees, clumps, flowers, rocks, ferns under each
tree and stones round each fern. Ground cover, a meadow of grass blades, is grass3d's: it is made on the
GPU, thins out blade by blade with distance and moves in the wind. A rule on the server asks for the trunks near a point and gets
exactly the trunks a seat sees, so bodies walk round them, shots stop at them, cars hit them and AI
hides behind them. The whole of it is numbers in the scene, so a designer tunes a forest by its
spacing, density and rules over the land.

## How it works

**Server half (`lod3d.sim.ts`).** No row. What the page and the server both read: `world.lod3d`,
its check, and `tile(name, layers, i, j, …)`, the instances of a layer whose foot is in tile (i, j),
[i·cell, (i+1)·cell) across x and z, the same every time.

`world.lod3d`:

- `mods`: `surfaces` (the server's surfaces, `surfaces(w)`), `seen` (the page's, `seen(plugins)`,
  with a `version` that moves when a surface moves, `shown`, `prepared` and `worker`), `behaviors`
  (`behaviors()`, the geometry of a surface of each word, and what draws a layer that gives each
  word) and `hollows` (the page's boxes nothing is drawn inside). With no `surfaces`, `seen` or
  `behaviors` named it throws.
- `rings`: metres, nearest first; shell k of a layer reaches out to `rings[k]`.
- `budget`, `hollows`: the browser half's (below).
- `layers`: name to a layer, or to `{ use: [<layer>, …], on? }`, those layers under `<name>/<used>`,
  each on this `on` where it gives one. A layer a use names is drawn only through it.

A layer:

- `on`: surface names, as their mods name them (`["land"]`), or one layer's name: then it stands
  round each of that layer's instances, on the same surface.
- `rows`: name to `{ weight?, solid?, tall?, sink? }`. `weight` is how often it is picked (1);
  `solid` and `tall` are read by the mods that walk, shoot and drive round it; `sink` is the row's
  own, in place of the layer's.
- `cell` (its tile's side in metres), `seed`.
- On surfaces, `spacing`: metres between its cells over a surface, one try a cell. Round a layer,
  `count` tries round each instance, each `ring` [inner, outer] metres out times that instance's
  size, set evenly round it and shaken by `jitter` (0 even, 1 anywhere).
- `density`: the share of tries kept, times the surface's `keep` there (terrain3d's paint `cover`).
- `rules`: `[{ q, lo, hi }]`, each a ramp the keep is multiplied by: `up` the normal's y, `height`
  the foot's y, any other asked of the surface (terrain3d's land record, `layer:<name>` too).
- `clearing`: metres across x and z from the world's origin inside which no foot is kept.
- `size` [base, spread] (times the parent's size round a layer), `spin`, `lean`, `sink`
  [base, spread], `vary` (how far its grey strays from 1).
- Every other field is a word a mod draws: `mesh` (instances3d's, `{ asset | shape, lods, shadow,
  leaf, … }`) or `emitter` (particle3d's). A layer gives one word or more, each drawn over the same
  instances, and is held out to the ring of the most shells any of them draws.

**Browser half (`lod3d.plugin.ts`).** Each `afterTick` it asks every `seen` plugin for its surfaces,
holds each layer's tiles round render3d's camera, each tile in the shell its distance from the
camera's tile puts it in (⌈rings[k] / cell⌉ tiles out), and hands them to the Drawings of the layer's
words. Nothing is held until every `seen` plugin has handed its surfaces, and nothing is shown until
every one is `shown`. A `version` that moves takes every held tile again.

- `budget`: milliseconds a frame taking tiles new to reach, nearest the camera first, at least one.
- `hollows`: with `mods.hollows`, the most boxes, `{ at, rot, half }`, nearest the camera, handed each
  Drawing every frame (box3dvehicle's cars, so no grass grows inside one).
- Height: `plugins.lod3d.height(h)` is the camera's height above the ground in metres, held until it
  is called again. It starts at -1, where the shells are the x and z distances alone. At h ≥ 0 shell k
  reaches ⌈√(rings[k]² − h²) / cell⌉ tiles, and is gone while rings[k] is not above h, so a camera
  flying high draws the ground under it coarse. `height(-1)` puts the shells back.
- Workers: where the page has `Worker`, a layer whose `seen` plugins all hand a `worker` is worked in
  a pool of lod3d's own module workers (`lod3d.worker.ts`), one fewer than the cores, with the same
  arithmetic, so a tile is the same to the bit. Elsewhere, as in node, every tile is worked on the
  page.
- Prepared places: a `seen` plugin's `prepared` `[x, z]` (terrain3d's `prepare`) is a place the camera
  is about to jump to. Every tile in reach of it is worked ahead, off the scene, and held the frame
  the camera arrives, so the field there is never seen half held. `ready()` is whether this field's
  share of the place is done.

It hands out `layers()` (each layer's `{ layer, held }`, every held tile's `things`) and `ready()`.

## Using it

1. List `lod3d` after every plugin its `seen` mods name (terrain3d; it throws otherwise), after
   `instances3d`, and before `render3d`.
2. Give `world.lod3d`: `mods: { surfaces, seen, behaviors, hollows? }`, `rings`, `budget`,
   `hollows?`, and `layers`. Give `world.instances3d: { cutout, coverage }` where a model has cards.
3. For trunks and rocks that are solid, give their rows `solid` (and `tall`), name `lod3d` in the
   other plugins' mods (below), and give `world.lod3d.widest` (the widest `solid`·size circle any
   instance has, metres) and `remember` (how many tiles the server keeps, oldest asked forgotten
   first).
4. For a prepared place that waits on the trees, `world.terrain3d.mods: { ready: ['lod3d'] }`; with
   terrain3d's `preload` and `world.loader.mods.ready: ['terrain3d']`, the loading screen waits on them
   too.

```json
"instances3d": { "cutout": 0.45, "coverage": 0.25 },
"lod3d": {
  "mods": { "surfaces": ["terrain3d"], "seen": ["terrain3d"], "behaviors": ["terrain3d", "instances3d"] },
  "rings": [128, 512, 2048, 9000],
  "budget": 3,
  "layers": {
    "trees": {
      "on": ["land"],
      "rows": { "tall": { "weight": 5, "solid": 0.35 }, "small": { "weight": 2, "solid": 0.35 } },
      "cell": 14, "spacing": 14, "seed": 91, "density": 0.5,
      "rules": [{ "q": "slope", "lo": 0.46, "hi": 0.32 }, { "q": "layer:meadow", "lo": 0.5, "hi": 0.85 }],
      "size": [0.75, 0.8], "vary": 0.18,
      "mesh": { "asset": "firs", "lods": [0, 1, 3], "shadow": 150, "leaf": 0.55 }
    }
  }
}
```

## Plugins it works with

- **terrain3d**: terrain3d's mod `terrain3d.lod3d.ts` (`surfaces`, `seen`, `behaviors`) is the land
  as the surface `land`, of the word `land`; lod3d's `lod3d.terrain3d.ts` is terrain3d's `ready`
  for prepared places.
- **shapes3d**: shapes3d's mod `shapes3d.lod3d.ts` (`surfaces`, `seen`, `behaviors`) is every part of
  its shapes and every point of its kinds as surfaces.
- **instances3d**: instances3d's mod `instances3d.lod3d.ts` (`behaviors`) draws a layer that gives
  `mesh` as instanced meshes, one shell for each of its `lods`.
- **particle3d**: particle3d's mod `particle3d.lod3d.ts` (`behaviors`) runs the effect of a layer that
  gives `emitter` on each of its instances held near enough.
- **box3dvehicle**: box3dvehicle's mod `box3dvehicle.lod3d.ts` (`hollows`) hands every car's body and
  wheels as boxes, so nothing is drawn inside a car.
- **walker**: lod3d's mod `lod3d.walker.ts` (`world.walker.mods: { fixed: 'lod3d' }`, or `solids`)
  has bodies walk round each solid instance, a circle `solid`·size round.
- **hitscan3d**: `lod3d.hitscan3d.ts` (`solids`) stops a shot at a trunk or a boulder.
- **box3d**: `lod3d.box3d.ts` (`props`) makes each solid instance a fixed capsule, or a sunk ball,
  in box3d's chunks; a solid row with no `tall` throws.
- **cover3d**: `lod3d.cover3d.ts` (`solids`) is somewhere to take cover behind.
- **ragdoll3d**: `lod3d.ragdoll3d.ts` (`solids`) pushes limp bodies out of the instances this page's
  lod3d holds.
- **render3d**: the camera the tiles are held round; **math**: deterministic maths.

## Keywords

level of detail, LOD, vegetation, foliage, forest, trees, grass, flowers, rocks, boulders, scatter,
procedural placement, instancing, tiles, streaming, shells, rings, layers, ferns round trees,
clearing, density, rules, web workers, prepared places, teleport, solid trunks, collision, cover,
deterministic, `tile`, `ready`, `layers`, `world.lod3d`
