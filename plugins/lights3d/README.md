# lights3d

Clustered forward shading (Forward+) for render3d: every point light in the scene lit by clusters,
so a scene may hold as many point lights as it likes (street lamps, windows, neon, muzzle flashes,
car lights) and each fragment is lit only by the few that reach it.

## Why use it

three.js lights a fragment by looping over every light in the scene, each a uniform of every
program, so a scene with hundreds of lamps recompiles and slows to a crawl. lights3d takes the point
lights off that loop and lights each fragment from a small per-cell list. Use it for a city at
night, a lit interior with many lamps, a racing track lined with lights, a dungeon of torches in 3D.
Lights are added the ordinary three.js way (a `PointLight` on the scene) and are drawn exactly as
three would draw them, with three's own falloff.

## How it works

lights3d has no row and no server half. On its first tick it reads `world.lights3d` and hooks the
scene's `onBeforeRender` and `onAfterRender`. Each time the scene is drawn, through whatever camera
draws it:

1. Every visible `PointLight` that casts no shadow and is on a layer the camera sees has its layers
   turned off, so three's own loop leaves it out. A light that casts a shadow stays three's. Anything
   that reads the lights off the scene still finds them where they stand.
2. Each light's place in view space, `distance`, colour × `intensity` and `decay` are written into a
   float texture, two texels a light.
3. The frame is cut into `grid` cells across and up and `slices` along the view (each slice the same
   ratio deeper than the one before, so cells near the eye are as shallow as they are wide). Each light
   goes into every cell its sphere of `distance` reaches (a light of no `distance` reaches all), and
   each cell's run of light numbers is written into one list, with a texture of where each run starts.

A splice (render3d's `splice`, under `lights3d`, into the shaders that light: Lambert, Phong, standard,
physical and toon) finds a fragment's cell by its pixel and depth and hands each light of the cell to
the shader's own `RE_Direct`, as three's point light loop does, before `lights_fragment_maps` and
`lights_fragment_end`, so every later splice finds it as direct light. `onAfterRender` turns the
splice off again, so the overlay and any other scene through the same renderer is lit by its own
lights alone. No texture has a fixed size: each grows to what the frame needs.

## Using it

1. List `lights3d` anywhere in `plugins` (render3d must be listed) and give
   `world.lights3d: { grid: [across, up], slices }`, whole numbers above 0.
2. Add `PointLight`s to render3d's scene from any actor or plugin.
3. Read `plugins.lights3d.count` (lights clustered last draw), `entries` (light-in-cell pairs) and
   `cells`.
4. `close` gives every light its layers back, frees the textures and gives the scene its hooks back.

## Plugins it works with

- **render3d**: its scene, its cameras and its `splice`.
- **box3dvehicle**: a car's headlights are spot lights, three's own; its point lights are lit here.
- **environment3d** and **skydome3d** give the directional sun and sky light, which three lights as
  always.

## Keywords

Forward+, clustered shading, clustered forward, tiled lighting, many lights, point lights, light
culling, light clusters, froxels, street lamps, city at night, neon, performance, uniforms, shader
recompilation, three.js, render3d, splice, `world.lights3d`
