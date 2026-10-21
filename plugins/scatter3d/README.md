# scatter3d

Trees, grass, bushes and boulders scattered over the land as a pure function of each cell, drawn
round the camera in level-of-detail shells, bedded and tilted onto the ground, thinned by the land's
rules and biomes, cleared from roads, moved by terrain edits, kept out of cars, and solid where they
should be, so the trunk a body walks round, a shot stops at and a car hits is the trunk every seat
sees.

## Why use it

Use scatter3d for vegetation and rocks over a 3D landscape: forests that stop at a treeline, grass
that fills meadows, boulders in the hills, nothing on the road. Nothing of it is a row, since nothing
of it changes while the game runs: the server and every page place the same instance in the same cell
from the same hashes, so collisions and visuals agree with no network cost at all.

## How it works

**Server half (`scatter3d.sim.ts`).** No row. Its numbers are `world.scatter3d`, and the ground is
handed in through a mod, never imported: `{ height, cover, ramp, rules, edits }`.

- A pack is a grid of square `cell`s, at most one instance each. Cell (i, j)'s point, keep, yaw,
  tint, row and size are hashes of i, j and the pack's `seed`. A cell is kept when its hash is under
  `density` × the ground's `cover` there (0 on a road) × each rule's ramp over the land record (an
  inverted ramp on height is a treeline) × Σ weight·share of the `biomes` it names; none inside
  `clearing` of the origin.
- `place(pack, i, j, ground)` is a cell's instance `{ i, j, x, z, row, size, yaw, tint }` or undefined.
- `solids(w, x, z, r, ground)`: every kept instance of a row with `solid` whose circle reaches within
  r, `{ x, z, radius, tall? }`, remembering up to `remember` cells per truth and dropping those a
  terrain edit reaches.
- `placed(w)`: the ground the `ground` mod names, for the mods that place on the server.

A pack is `asset` (a loader `model` whose meshes are named `<row>-<lod>[-<part>]`) or `shape`
(boulders: lumpy icosahedra, with an optional noise `surface` of albedo, bump, moss on up-facing
faces and roughness), with `rows` (`{ weight, solid?, tall? }`), `cell`, `reach`, `seed`, `lods`,
`shadow`, `leaf`, `density`, `rules`, `biomes?`, `clearing`, `size`, `vary`.

**Browser half (`scatter3d.plugin.ts`).** Each pack is a field of cells following render3d's camera
in shells: shell k reaches `lods[k]` metres and draws LOD k, the last out to `reach`; shells ending
within `shadow` cast shadows. Each row and shell is an InstancedMesh sized so it never overflows.
Crossing a cell only asks the rings that change shell; new cells are queued nearest first and placed
within `budget` milliseconds a frame, or in the land's workers (`scatter3d.cells.ts`, the same
arithmetic to the bit). Each instance is bedded: tilted `lean` of the way to the ground's fitted plane
(a tussock follows the slope, a fir stands up straight) and sunk so its foot touches.

Cards: every BLEND material becomes alpha-tested at `cutout`, alpha gains `coverage` per mip level so
far firs do not thin to sticks, and `leaf` bends card normals toward the sky so a crown is lit and
takes snow as one mass. A terrain edit re-takes the cells it reaches, so a tree rises with raised
ground and one on a new road goes. A prepared place (a camera about to jump) is placed ahead.
`hollows` mods hand boxes nothing is drawn inside (a car's body and wheels).

It hands out `solids(x, z, r)`, `packs()` and `ready()`.

## Using it

1. List the land's plugin (terrain3d) before `scatter3d`, and `scatter3d` before `render3d`.
2. Give `world.scatter3d`: `mods: { ground: 'terrain3d', land: 'terrain3d', hollows? }`, `cutout`,
   `coverage`, `budget`, `hollows`, `remember`, and `packs`.
3. Model each pack in Blender with meshes named `<row>-<lod>`, catalogue it as a loader `model`.
4. Name scatter3d in the mods of whatever should meet its solids (below).

## Plugins it works with

- **terrain3d**: the mod `terrain3d.scatter3d.ts` (`mods: { ground, land: 'terrain3d' }`) is the
  ground both halves stand on; scatter3d's mod `scatter3d.terrain3d.ts` (`world.terrain3d.mods:
  { ready: ['scatter3d'] }`) holds a prepared place until the scatter on it is placed too.
- **walker**: the mod `scatter3d.walker.ts` (`world.walker.mods: { solids: 'scatter3d' }`): bodies walk
  round trunks.
- **hitscan3d**: the mod `scatter3d.hitscan3d.ts` (`mods: { solids: 'scatter3d' }`): shots stop at
  trunks and boulders.
- **box3d**: the mod `scatter3d.box3d.ts` (`mods: { props: ['scatter3d'] }`): trunks and boulders are
  fixed bodies cars hit.
- **cover3d**: the mod `scatter3d.cover3d.ts`: bodies take cover behind them.
- **ragdoll3d**: the mod `scatter3d.ragdoll3d.ts`: limp bodies are pushed out of trunks.
- **box3dvehicle**: its mod `box3dvehicle.scatter3d.ts` (`mods: { hollows: ['box3dvehicle'] }`) keeps
  grass out of cars.
- **render3d**: dresses every material, so the sky's snow and wet reach the trees; **loader**: the
  models.

## Keywords

vegetation, foliage, trees, forest, grass, bushes, rocks, boulders, scatter, instancing,
InstancedMesh, procedural placement, LOD, level of detail, billboard cards, alpha test, alpha to
coverage, treeline, biomes, density, roads, clearing, slope alignment, ground bedding, terrain edits,
streaming, workers, collision with trees, solids, line of sight, cover, deterministic, `place`,
`solids`, `ready`, `world.scatter3d`
