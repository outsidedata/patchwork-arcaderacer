# environment3d

The lights and the floor of a simple 3D scene, from one prefab: a sun with a shadow that follows the
camera without crawling, a sky hemisphere light, an ambient light, extra directional lights, and a
flat floor.

## Why use it

Use environment3d to light a render3d scene that has no sky plugin: a test scene, an arena, an
interior, a product view, a board game. One prefab gives the sun, the fill, the bounce and a floor,
and the sun's shadow box is kept centred on the camera, so a large level has sharp shadows wherever
the camera is. For a full sky with a moving sun, clouds and weather, use skydome3d instead.

## How it works

environment3d has no row and no server half. Its numbers are the scene's `environment3d` prefab,
read off the scene (as `ui` reads its own) on its first tick, built on render3d's scene, and never
read again. Each piece is built only when the prefab has it:

- `sun`: a directional light of `color` and `power` shining from `at` toward the origin; with
  `shadow` it casts one.
- `sky`: a hemisphere light of `color` over `ground` at `power`.
- `ambient`: an ambient light of `color` at `power`.
- `lights`: more directional lights, each `{ at, color, power }`, casting no shadow (a moon, a
  bounce off a wall).
- `floor`: a square of `size` in `color` lying on y = 0.

The sun's shadow, `sun.shadow: { map, half, near, far, distance, bias, normalBias }`, is a map of
`map` texels a side covering a box `half` metres each way across the light, `near` to `far` along it,
the light standing `distance` metres sunward of the box's centre. Each frame, in its `afterTick`, the
centre is render3d's camera snapped to whole texels across the light, so shadow edges do not crawl as
the camera moves. Under render3d's reversed depth (`ao`) the bias is handed negated, since three's
PCF shadow compares the other way there. Only what casts and receives shadows takes part, and only
with render3d's `shadows` on.

`close` takes everything off the scene and disposes it.

## Using it

1. List `environment3d` in the scene's `plugins` after anything that places the camera in its own
   `afterTick`, and before `render3d`, whose `afterTick` draws.
2. Give the scene an `environment3d` prefab with any of `sun`, `sky`, `ambient`, `lights` and `floor`.
   A scene that lists it with no prefab throws.

## Plugins it works with

- **render3d**: the scene it builds on, the camera its shadow box follows, and the `shadows` and `ao`
  settings it honours.
- **skydome3d** is the full sky, sun and weather; **lights3d** draws many placed lamps.

## Keywords

lighting, lights, sun, directional light, sunlight, shadow, shadow map, stable shadows, texel snapping, shadow acne, bias, normal bias, hemisphere light, sky light, ambient
light, fill light, moon, floor, ground plane, test scene, three.js, render3d, `environment3d` prefab
