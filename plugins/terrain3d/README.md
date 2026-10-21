# terrain3d

Endless 3D terrain from one field file, the same to the byte on the server, every page and every
worker: a node graph of noise (value, simplex, worley), warps, folds (ridges, billows, terraces),
remaps, craters, a clearing at spawn and biomes; a sea that floods below the waterline; painted
layers of raise, lower, flatten, smooth, road-cutting bench and surface strokes; a land record of
slope, aspect, curvature, occlusion, landform, cliffs, wetness, biomes, surfaces and ground layers;
ground textures laid by rules with noise edges and warps; and on the page, seamless rings round the
camera built in workers, with baked far rings, near maps, prepared places for camera jumps, and a
`ground` every other plugin stands on.

## Why use it

Use terrain3d for any open 3D landscape: hills, mountains, islands, deserts, moons, a racing
circuit's countryside, a flight game's world. A rule on the server asks `heightAt` and gets exactly
the height a seat sees, so bodies, cars, planes, trees, splashes and gore all stand where they are
drawn. The whole land is one data file, so a designer tunes it by numbers and paints it with strokes.

## How it works

**Server half (`terrain3d.sim.ts`).** No row. `world.terrain3d.field` names a loader `json` entry
(preloaded); the land is made from it the first time a query asks.

The field file:

- `program`: `{ world, hscale, sea, flood, out, nodes }`. Nodes run in order, each input an earlier
  node (so no cycle can be written): `const`, `noise` (`value`, `simplex`, `worley` with `f1`, `f2`,
  `f2-f1`, at `freq` cells across `world`, `seed`, `rotate`, `stretch`), `warp`, `fold` (`ridge`,
  `billow`, `abs`, `terrace`), `remap` (`linear`, `smooth`, `smoother`), `combine` (`add`, `sub`,
  `mul`, `min`, `max`, `lerp`), `scale`, `craters` (floor, rim, ejecta), `clearing` (levelled at the
  origin), and one `biomes` node mixing each biome's own ground by its strength.
- The sea: the waterline is y = 0; with `flood` the height is the water's surface and `depthAt` how
  deep it is.
- `analysis`: the steps and radii the land record reads the ground with.
- `ground`: the look's texture layers (`terrain3d.warp.ts`: each `{ name, map, normal, scale,
  strength, tri, sharp, where, noise, edge, warp }`), written once in TS and once as GLSL from the same
  numbers with integer hashing, so `layer:<name>` on the server is what the shader draws.
- `surfaces`: what a `surface` stroke paints: `colour`, `cover` (scatter's density, 0 on a road),
  `grip`, `drag`, `spray`, `mark`, `edge`.
- `layers`: squares of painted ground, each `{ at, size, px, strokes }`, baked from their strokes
  deterministically. A stroke is `{ verb, radius, hardness, strength, level, surface, path }`, `verb`
  one of `raise`, `lower`, `flatten`, `smooth`, `bench` (flat across the path, following the hill
  along it: a road) and `surface`.

The queries take `w`: `heightAt`, `rawAt` (under water too), `depthAt`, `normalAt`, `restsAt` (the
mean of a span square's corners, so a body stands still over rough ground), `paintAt` (`{ weight,
surface, cover, grip, drag, spray, mark }`), `occludes(a, b)`, `ray(origin, dir, far)`, `analyse(x, z)`
(the land record: `height`, `relief`, `slope`, `aspect`, `profile`, `plan`, `position`, `occlusion`,
`form` (the geomorphon: peak, ridge, shoulder, spur, slope, hollow, footslope, valley, pit), `cliffAbove`,
`cliffBelow`, `wet`, `water`, `biome:<n>`, `surface:<n>`, `layer:<n>`), `ramp(rule, x, z)` and
`edits`. `shape(v, lo, hi)` is the one ramp every rule uses. `compile(program)` runs a program alone.

**Browser half (`terrain3d.plugin.ts`).** Makes its own land from this client's parse of the field and
draws it as square rings (`rings: [{ reach, seg }]`, finest first) that recentre as the camera
crosses half a snap, rebuilt a slice a frame within `budget` milliseconds or in a pool of workers
(`terrain3d.worker.ts`, the same arithmetic, so the floats are the page's). Seams share every vertex
bit for bit, so no crack shows; only the outermost ring hangs a skirt. The land record's values are
carried in a float texture array, so a field carries as many as it likes. Colour and normal are made
per pixel and dressed by render3d, so the sky's weather and lights reach them.

- `static`: the rings stand still at the origin, for a small place.
- `seabed`: the ground under the sea is drawn.
- `bake`: far rings rendered once into albedo and normal textures, faded in past `bake.near`, cliffs
  kept live (`terrain3d.bake.ts`).
- `maps: { near, reach, step, small }`: full maps only for the layers near the camera hits, small
  copies of the rest (`terrain3d.present.ts`).
- `prepare(x, z)`: builds a place the camera is about to jump to (a cut, a teleport, a respawn) off the
  scene; `prepared()` says when it and every `mods.ready` plugin's share is done; `preload` prepares
  the first place before anything is shown.
- `task(url, input)` lends the workers to other plugins.

It hands out `land`, `rings`, `building()`, `shown()`, `prepare`, `prepared`, `unprepare`, `task`,
`bake`, `baked`, `focus`, `carry`, and `ground`: `{ height, raw, depth, at, cover, spray, mark, ramp,
rules, edits, ray, mix, layers, shown, prepare, prepared, unprepare, task }` over this client's land.

## Using it

1. List `terrain3d` before every plugin that stands on its `ground` in its `afterTick` (scatter3d,
   skydome3d, ocean3d, box3dvehicle's dust), and before `render3d`.
2. Catalogue the field as a `json` entry with `preload`, and every texture its ground layers name.
3. Give `world.terrain3d: { field, rings, shadowReach, budget, seabed, static?, preload?, bake?, maps?,
   mods: { ready? } }`.
4. Name terrain3d in each other plugin's mods (below). In a rule, `heightAt(w, x, z)`.

## Plugins it works with

terrain3d hands its ground to almost every 3D plugin through a mod of its own:

- **walker** (`terrain3d.walker.ts`: `height`, `depth`, `cell`): bodies stand and wade on it.
- **box3d** (`terrain3d.box3d.ts`: `ground`): height-field chunks for physics.
- **box3dvehicle** (`terrain3d.box3dvehicle.ts`: `land`, `grip`, `drag`): dust, tracks and tyre grip.
- **hitscan3d** (`terrain3d.hitscan3d.ts`: `ground`): shots stop at the land.
- **flight3d** (`terrain3d.flight3d.ts`: `ground`): planes land and crash.
- **scatter3d** (`terrain3d.scatter3d.ts`: `ground`, `land`): trees and grass stand on it; scatter3d's
  `scatter3d.terrain3d.ts` is a `ready` for prepared places.
- **ocean3d** (`terrain3d.ocean3d.ts`: `land`): the seabed the sea shoals over.
- **skydome3d** (`terrain3d.skydome3d.ts`: `land`): rain splashes and biome weather.
- **ragdoll3d** (`terrain3d.ragdoll3d.ts`: `land`), **dismember3d** (`terrain3d.dismember3d.ts`:
  `land`), **solids** (`terrain3d.solids.ts`: `land`), **cutscene** (`terrain3d.cutscene.ts`: `land`,
  with `prepare` for cuts).
- **render3d** draws it; **loader** reads the field and the maps; **math** keeps it deterministic.

## Keywords

terrain, landscape, heightmap, procedural terrain, noise, simplex, worley, Voronoi, fBm, domain warp,
ridged noise, terraces, craters, biomes, sea, water level, flood, islands, mountains, terrain painting,
sculpt, raise, lower, flatten, smooth, roads, bench, surfaces, splat map, texture layers, triplanar,
slope, aspect, curvature, ambient occlusion, geomorphon, cliffs, clipmap, geometry clipmap, rings, LOD,
seams, infinite terrain, streaming, web workers, virtual texturing, baked terrain, near maps,
prepared places, teleport, preload, deterministic, `heightAt`, `rawAt`, `depthAt`, `paintAt`, `ray`,
`analyse`, `ground`, `world.terrain3d`
