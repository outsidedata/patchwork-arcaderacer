# solids

Low-poly models made of convex solids, written as data: lofts between two rectangles and prisms of
any number of sides, hung on a tree of nodes, flat-shaded in named paints (with glow, blinking and
glass), with real point and spot lights hung on the nodes. It draws still rows as such models, and
hands other plugins the meshes to build machines of their own.

## Why use it

Use solids for props and machines modelled straight in a JSON file rather than in Blender: buildings,
crates, signs, lamp posts, turrets, a mech's hull, a vehicle's cabin, anything faceted and stylised.
A model is a few lines of numbers anyone can tune, its facets show, and the sky's light, wet and snow
reach it because every paint is dressed by render3d.

## How it works

solids has no row, no prefab and no server half. It does two things:

- **It draws still rows.** Each row of a kind `world.solids.kinds` names (`{ <kind>: <model> }`, the
  model a loader `json` entry), or a kind a `models` mod hands a model for (`world.solids.mods.models`,
  one plugin or a list, each `models(plugins) → { <kind>: <model> }`, laid over `kinds` in the list's
  order: shapes3d's plain shapes), is drawn from its model at the row's `pos`, turned by its `rot`
  (a quaternion `[x, y, z, w]`) where it carries one, as shapes3d's tilting shapes do, else facing its
  `yaw`, standing on the land the `land` mod hands. When a model changes, every row of that kind is made
  again. `group(id)` is a row's three.js group.
- **It hands out the parts** for other plugins: `meshes`, `lights`, `blink`, `solid`, `place`,
  `triangles`, `uvs`.

A model is:

- `nodes`: `{ <name>: { parent?, at, turn?, mirror? } }`, listed parent first: each `at` metres from its
  parent's origin, turned `[rx, ry]`, x flipped by `mirror`.
- `parts`: each `{ node, paint, loft | prism, frame? }`. A `loft` runs along an axis from `from` to
  `to` between rectangles `a` and `b` (`[centre j, centre k, half j, half k]`); a `prism` has `sides`
  from radius `r[0]` to `r[1]` round `at`. `solid(part)` finds its corners and outward faces (Newell's
  method, so winding in the file does not matter) and `triangles` fans them.
- `paints`: `{ <name>: { colour, roughness?, metalness?, glow?, blink?: [hz, on], opacity?, map?,
  scale? } }`: a flat-shaded standard material; `glow` is emissive in its own colour; `blink` lights it
  part of each cycle; `opacity` below 1 is glass that writes no depth and casts no shadow. `map` names
  a texture entry of the loader's catalogue, a picture laid on every face in the paint and tinted by
  its `colour`, `scale` metres of a face to one span of it, so a checker's squares are one size on
  every face whatever its size; give the entry `wrap: 'repeat'` to repeat it. A row whose model lays a
  picture is drawn once the loader holds it.
- `lights`: `[{ node, colour, intensity, at, distance?, decay?, spot?: { aim, angle, penumbra },
  shadow?, paint? }]`: real point or spot lights, `paint` naming the paint they are the glow of.

`meshes(THREE, dress, paints, parts, whose, maps?)` makes one mesh per node and paint, keyed by node,
`maps(name)` handing it the decoded picture of each `map` its paints lay, and returns `materials`,
`owned` (to dispose) and `blinks`; `uvs(solid, scale)` is where a solid's triangles lie on a picture; `lights(THREE, lamps)` makes the lights keyed
by node; `blink(blinks, now)` lights blinking paints by the page's clock.

## Using it

1. List `solids` before `render3d` and after the land's plugin. Give `world.solids: { kinds,
   mods: { land: 'terrain3d' } }` to draw rows; a scene that only uses its parts leaves `world.solids`
   out.
2. Write each model as a `json` file and catalogue it.
3. Give the kind's rows `pos` and `yaw`, or `rot` for a model that tilts.

## Plugins it works with

- **render3d**: every paint is dressed through `render3d.dress`.
- **terrain3d**: the mod `terrain3d.solids.ts` (`mods: { land: 'terrain3d' }`) stands every model on
  the land.
- **shapes3d**: the mod `shapes3d.solids.ts` (`mods: { models: 'shapes3d' }`) hands a plain model of
  each of its kinds that gives a `look`.
- **loader**: the model files, and the pictures paints lay.
- **lights3d**: draws the point lights a model hangs, however many.

## Keywords

low poly, low-poly models, procedural models, data-driven models, JSON models, convex solids, loft,
prism, faceted, flat shading, props, buildings, machines, mech, turret, lamps, point light, spot
light, glow, emissive, blinking lights, glass, transparency, paints, materials, nodes, hierarchy,
three.js, `meshes`, `lights`, `blink`, `solid`, `group`, `world.solids`
