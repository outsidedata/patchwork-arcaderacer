---
name: making-game-assets
description: Use when a game needs levels, terrain, props, characters or textures — anything the renderer will draw. The asset is finished in Blender and exported as plain glTF; the engine never grows a feature to fix an asset. Also when a validator says "stairs", "quilt", "blockout", "floating", "untextured", or a build is on its third fix pass.
---

# Making game assets

Assets are made in Blender. The engine reads plain glTF (PBR materials, baked images,
KHR_texture_transform) and a collider mesh. That is the whole contract. Written after the vale
run (2026-09-05/06) burned four build rounds on one terrain.

## The law

**The asset carries everything. The engine stays plain.** If a look needs a shader, a mask, a
custom extra, a splat, a decal system, a runtime blend — stop. Bake it in Blender and ship the
bake. An engine feature written to rescue an asset is the most expensive fix there is: it
needs its own tests, its own validators, and every other asset now has two paths.

Corollary: a Blender render of the exported glb must look like the game. If it does not, the
asset is not finished — no matter what the game shows.

## The viewer comes first

Nothing is looked at by loading it into a world. `tools/look.py` in the rpg repo is the asset
viewer: any glb from four turntable angles, top and eye level, beside a 1.8 m figure, with its
size printed and checked against the registry:

```bash
Blender -b --python tools/look.py -- $PATCHWORK_LIBRARY/props/shrub/shrub.glb /tmp/look 1.35
#   SIZE want=1.350 got=11.695 FAIL      ← the shrub is authored 10× over; caught in ten seconds
Blender -b --python tools/look.py -- field /tmp/look        # a zone: spawn eye-lines, portals,
                                                           # the ground boundary with the cube
```

Run it on every prop before it is placed and on every exported level before it enters the repo.
Read the images at full size. A game that adds an asset kind adds a view to this script, never
a debug mode to the game. The vale run's hedge shipped at 100× because the first look was a
six-minute bake and a page load; the viewer would have said FAIL before the build started.

## The clock

Before the first build, a table in the run dir: one row per element, a minute budget that is
the honest cost of doing it once, `start` and `end` filled from `date` as you go. Past budget
the element is shipped as is or cut, one line says which, and the next row starts. A second
attempt is the user's call, asked at the end of the level, never taken. No agent runs on an
asset: a subagent's clock is invisible. The assets run of 2026-09-06 did three levels in
69 minutes under this table; the run before it spent 3.5 hours on three builds of one method.

## Measure the export, never guess at it

A defect in a render gets a measurement of the exported glb before any fix: a ray-cast down
the line that looks wrong (which mesh, what height, what normal), the baked tile image pulled
out of the glb and looked at, a top-down orthographic render of the spot. Each is one Blender
call and two minutes. A hypothesis fix ("must be the tile normals") is a rebuild and a bake
you pay for whether it was right or not — the seam that looked like a bake edge was the fence
rails, and the normals fix changed nothing.

## The pipeline, in order

1. **Textures**: real PBR sets at real scale (`cc0-textures` skill; the library's `textures/`,
   `$PATCHWORK_LIBRARY`).
   A material is `(set, size_m)`; the size is metres per repeat and it is measured, not guessed
   (a brick course is 0.09 m, a cobble 0.10 m, a plain roof tile 0.28 × 0.09 m). Non-square
   maps keep their aspect. Every image ≤ 1024 px in the export.
2. **Props**: from the library (`$PATCHWORK_LIBRARY/props`, look at `_thumbs` first), highest
   LOD under ~4 000 tris, registry unit fix applied, bbox collider. A 0.5 m prop never wears a
   3 m tile — a prop gets its own material size ≤ its extent. Never a cone, sphere, 16-gon or
   box where a real prop exists (rocks, mushrooms, logs, trees, shrubs are all in the collection).
   A registry tag is a claim, not a fact: the turntable decides what a prop is (the "shrub" was a
   houseplant in a planter). A prop's unit fix lives in its object scale — apply it into the mesh
   (`transform_apply(scale=True)`) before the template is instanced, because any placer that sets
   `o.scale` throws the fix away and ships the prop at 100×.
3. **Ground**: a heightfield with ONE material per tile whose colour/normal/roughness are
   **baked in Blender** from a layer blend (a weight mask painted in metres with a feather, then
   `bake` per 16 m tile at 64 px/m). Never a material per face — a per-face assignment cannot
   feather, and refining the cell only makes smaller stairs at more triangles (three builds
   proved it: 1 m stairs, 0.25 m stairs, still stairs).
   Bake only where the player walks. An apron or a far ground is one plain material: a
   200 × 160 m apron is 190 tiles and 33 MB, and the bake budget (20 MB) drops every tile of the
   real ground to 512 px to pay for it.
4. **UVs**: box projection in ONE world frame per dominant axis. A frame derived from each
   face's own normal makes every face of a displaced wall its own crop — a quilt at the grid.
5. **Placement**: every solid registers its footprint in ONE clearance list and every placement
   tests against that list. A second list (the rock placer's own) is where the overlaps live.
   Every base samples all four footprint corners and stands on the lowest. A landmark (spawn,
   portal, npc, den) is ≥ 1.5 m from every footprint.
6. **Export**: glb (visual) + `{v, i}` collider json (y-up, floors +y, no ceiling in it) +
   landmarks json (spawns, portals, npcs, dens, lights, bounds). Reproducible: build twice,
   `cmp` all three. The script exports a plain glb; the game never ships it. Its bake,
   `games/<game>/assets/<game>.bake.ts` run by `yarn bake <game>`, runs the script into a scratch
   file and packs it with gltfpack into the game (meshopt geometry, WebP textures, names, extras and
   float positions kept: `-cc -kn -km -ke -vpf -tw`), and cuts each loose texture to WebP. The raw
   inputs stay in the library; the game commits the built files and the scripts
   (`committing-a-game`). `yarn health`
   checks Blender, the library, gltfpack and ImageMagick first.

## The asserts every build must print

One line each, asserted in the build script, or the build is not done:

```
CLEAR n=<solids> overlaps=0          pairwise AABB over the ONE list
STAND objects=<n> max_gap=<m>        ≤ 0.01
COPLANAR faces=<n> pairs=0           ALL orientations, overlap floor 0.005 m, sep 0.004 m
TEX <material> set=<set> size=<m>    per rock/masonry/plank material
BAKE obj=<ground> tiles=<n> px=1024
REPRO identical=3
```

An assert that compares a value with itself (`gap = zb[1] - zb[1]`) is not an assert. Every
assert measures the EXPORTED mesh, not the variable the script planned from.

## Proving the look

Blender renders of the exported glb, Eevee 1280×720, the level's own light rows plus a weak
fill, read at full size, one row per image:

- 3/4 overhead; eye level at every spawn along its yaw; every portal at 6 m.
- Every ground boundary at 1.5 m and from 3 m above with a 1.8 m reference cube: measure the
  ramp in metres on the pixels. A step is a fail.
- A rock/wall at 1.5 m under raking light: relief visible, no panel seams.
- From below the ground (holes, inverted faces); the perimeter from inside (nothing straight-edged).
- An albedo pass (lamps hidden, white world) when a seam might be shading: if the seam survives,
  it is the texture/UV.

The renders come from `tools/look.py` (above), which every level and prop goes through.
Then the walk-check headlessly (`plugins/level` + `plugins/nav`): every landmark unblocked and
on ground, all pairs path, corridor widths. Then one screenshot in the engine — it must agree
with the Blender render; if it does not, the asset is wrong, not the engine.

## When a validator refutes a build

Fix ladder (`coding-rpg-game-systems`): delete → ticket → patch, rung named. **The third pass on
one subsystem is a rewrite from the facts**, not a fourth patch — and the rewrite stays in the
asset pipeline. The vale run's mistake was to read "three rounds of stairs" as "the engine
needs a shader" instead of "bake the blend".

## What each of these cost (do not repeat)

| defect | rounds | root |
|---|---|---|
| ground boundary stairs at the cell | 3 | material per face; feather impossible by construction |
| wall texture quilt at 0.6 m | 2 | UV frame from each face's normal |
| rock reads as concrete | 2 | Concrete036 named "rock"; no relief measured before choosing |
| rocks, stalagmites, menhirs as primitives | 3 | cones/spheres where the collection has rocks |
| rock props blurred and faceted | 1 | LOD4 (150 tris, 256²) picked by default |
| props inside boulders / ruin walls | 2 | a second clearance list |
| a hedge as an extruded prism | 1 | a blockout element shipped as "perimeter" |
| a fire as glowing eggs | 2 | primitives again; no logs, no flame card |
| crate / pier floating 2–45 cm | 2 | base placed on one sample, not four corners |
| arch gap assert that cannot fail | 1 | asserting the plan, not the export |
| an engine splat shader | 1 pass + revert | fixing an asset in the engine |
| a hedge of 270 houseplants at 100× | 1 build | prop trusted by its tag; unit fix lost in object scale; no viewer |
| a baked apron | 1 killed bake | ground() on a mesh nobody walks |
| a normals fix for a seam that was the fence | 1 rebuild | hypothesis fix before a measurement of the export |
