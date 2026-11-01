# cull3d

Per-instance frustum culling, shadow-aware culling, level of detail and front-to-back sorting for
the copies of an InstancedMesh in render3d's scene, and a splitter that cuts a big mesh into tiles
three.js can cull.

## Why use it

three.js culls a mesh whole, by one sphere round all of it. An InstancedMesh of a city's buildings
or a forest's trees stands all round the camera, so it is always drawn whole: every copy behind the
camera along with the ones in front, in the order they were made, so far copies are shaded and then
painted over by near ones. cull3d hands each copy to the GPU only when it can reach a pixel, nearest
first, at the level of detail its distance picks. Use it for forests, cities, rocks, crowds, any
large set of repeated meshes, and `split` for a huge mesh (a level, a road network) that should be
culled in pieces.

## How it works

cull3d has no row and no server half. On its first tick it reads `world.cull3d` and hooks the
scene's `onBeforeRender`, so its work runs every time three draws the scene, through whatever camera
draws it (render3d's own and any pass's).

- Copies are sorted into squares `cell` metres a side across the ground. Each square is tested whole
  against the view first, and only the copies of a square that passes are tested one by one, each by
  the sphere round every level's meshes set on its matrix.
- The visible copies are written nearest first into each level's meshes: a copy draws in the nearest
  level whose `within` it is inside, and not at all past the last level's. Every mesh of a level (a
  model's materials, a tree's trunk and crown) shares one matrix attribute and one colour attribute,
  so each copy is written once for all of them. A level's `renderOrder` is its place in `levels`.
- A level any of whose meshes casts a shadow also draws each copy in the view of a light whose shadow
  is drawn (a directional or spot light's shadow camera, a point light's reach), since a shadow from
  something out of view may fall in it.
- Each mesh's `boundingSphere` is set round the copies it draws, so three can cull a level none of
  whose copies is in view.
- A draw through the same camera, lights and copies as the last writes nothing.

`split(geometry)` cuts a geometry into `tile`-metre squares by each triangle's middle, with every
attribute, each piece's bounding sphere made, so three culls and sorts each piece. A geometry with
groups or morph targets throws.

## Using it

1. List `cull3d` in the scene's `plugins` before whatever hands it crowds or asks it to split
   (otherwise they throw `cull3d has not ticked yet`), and give `world.cull3d: { cell, tile }` in
   metres, both above 0.
2. Make the InstancedMeshes yourself, with any count, add them to render3d's scene at the world's
   origin, unturned and unscaled (one standing elsewhere throws, naming it), then:

   ```ts
   const crowd = plugins.cull3d.crowd({ matrices, colours, levels: [
     { meshes: [trunkNear, crownNear], within: 80 },
     { meshes: [trunkFar, crownFar], within: 400 },
   ] })
   ```

   From then on cull3d writes their matrices, colours and count. The crowd is `{ copies, drawn,
   forget }`: how many copies it was handed, how many each level drew last frame, and `forget()`.
3. `plugins.cull3d.split(geometry)` for a big mesh, then a mesh per piece.
4. `plugins.cull3d.drawn` is the copies drawn last frame and `crowds` every crowd; `close` forgets
   every crowd and gives the scene its hook back.

## Plugins it works with

- **render3d**: cull3d needs it and works on its scene, its camera, and every camera a pass draws
  the scene through.

## Keywords

culling, frustum culling, instancing, InstancedMesh, GPU instancing, level of detail, LOD, impostor,
draw distance, front-to-back sorting, overdraw, early z, shadow culling, shadow casters, forest,
trees, city, buildings, crowd, performance, draw calls, split mesh, tiles, chunking, bounding sphere,
onBeforeRender, three.js, `crowd`, `split`, `world.cull3d`
