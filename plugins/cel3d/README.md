# cel3d

Toon shading for a render3d scene: light in flat bands, shadows that take a hue, one hard
highlight, an optional rim light, and ink outlines round every shape found from the depth buffer.

## Why use it

Use cel3d to make a 3D game look like cel animation, a cartoon or a comic, without changing a single
material: it reaches every material render3d dresses (standard, physical, Lambert and Phong) and
every model the loader brings in.

## How it works

cel3d has no row and no server half; it runs only in the page. On its first tick, once render3d has
a camera, it reads `world.cel3d` once, checks every number (one it cannot draw throws, naming it),
and hands render3d two things:

- **The bands**, a shader splice (render3d's `splice`, under the name `cel3d`) after three.js's
  `lights_fragment_end` chunk. It works out how lit each fragment is by the scene's directional
  lights (1 facing an unshadowed sun, 0 in shadow or facing away), snaps that to the level of the last
  band reached (blended over ±`soft`), multiplies the sky's light out of the light by `shade` so
  shadows take a hue, turns the specular into a single highlight in `gloss` where it passes `spec`,
  and with `rim` adds a band of light where a face turns away from the eye. With no directional light
  the splice changes nothing. A splice listed earlier (skydome3d's cloud shadows) is kept, so list
  skydome3d before cel3d.
- **The ink**, a full-screen pass (render3d's `pass`) that reads the depth the scene was drawn with.
  It turns depth into 1/distance, which runs straight over any flat face, and takes its second
  difference `width` pixels each way: nothing on a flat face, a little at a crease, a lot where one
  shape stands in front of another. Past `depth` a pixel starts to ink, fully at twice `depth`,
  fading out over `fade` [near, far] metres; inked, its colour is multiplied by `ink` and `colour`, so
  a line is a darker shade of what it outlines. It handles render3d's reversed depth under `ao`.

## Using it

List `cel3d` in the scene's `plugins` (render3d must be listed too) and give `world.cel3d`:

- `bands`: `[{ at, level }]`, `at` rising from 0 (the first must be at 0).
- `soft`: the blend either side of each band edge, 0 or more.
- `shade`: the CSS colour shadows are tinted by.
- `spec`: where the highlight starts, and `gloss`: its colour.
- `rim`: optional `{ width, strength, colour }`, `width` between 0 and 1.
- `outline`: optional `{ width, depth, ink, colour, fade: [near, far] }`; with none there is no ink
  pass.

`lighting(settings, THREE)` (the splice's GLSL) and `Outline` (the pass) are exported for a page that
wants them on their own.

## Plugins it works with

- **render3d**: cel3d is built on render3d's `splice` and `pass`, and reads its camera and depth.
- **skydome3d**: its cloud shadow splice lands on the light before cel3d's bands when skydome3d is
  listed first.
- **dither3d** is another whole-frame look on render3d.

## Keywords

cel shading, toon shading, toon shader, cartoon, anime, comic, NPR, non-photorealistic rendering,
banded lighting, ramp, posterize light, outline, ink lines, edge detection, depth edges, silhouette,
rim light, fresnel, specular highlight, shader splice, post-processing pass, three.js, render3d,
`world.cel3d`
