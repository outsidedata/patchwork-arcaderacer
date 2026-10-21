# render2d

The 2D renderer: PixiJS's stage, its canvas and a world drawn through a camera, with any ground
projection (flat, y-up, isometric), heights, named layers that sort by depth or scroll with parallax,
zoom, pixel-perfect integer scaling or window fitting, drawing between steps, project and unproject
for clicks, and a SNES-style mosaic.

## Why use it

Use render2d for any 2D game: a platformer, a top-down shooter, an isometric RPG, a city builder, a
puzzle game, pixel art. Actors draw PixiJS objects on its stage or layers; it moves everything
between the last two steps every frame so motion is smooth at any frame rate, and holds the camera on
whole screen pixels so pixel art never shimmers.

## How it works

render2d has a browser half only, one per client: made when the seat arrives on its scene and closed
when it leaves. It draws at the screen's pixel density after every frame, once the page has mounted a
canvas (`mount(canvas)`), and hides the canvas until the first packet has been drawn.

**The world.** A scene whose things stand in a world of their own gives `world.render2d`:

- `ground`: where a step along the world's x and y goes on the stage, `[[x, y], [x, y]]` in pixels:
  `[[1, 0], [0, 1]]` the stage itself, `[[1, 0], [0, -1]]` y up the screen, `[[32, 16], [-32, 16]]`
  isometric diamonds 64 pixels across.
- `up`: where a step of height goes, so `[x, y, h]` is drawn `h` steps of `up` above `[x, y]`.
- `zoom`, `look`: the starting camera.
- `layers`: bottom first, each a name or `{ name, sort, parallax }`: `sort` draws things in order of
  the stage y of the ground point under each, so nearer is over further whatever its height;
  `parallax: [fx, fy]` moves the layer by that factor of the camera, as Tiled's layers do.
- `fit`: `"window"` (the canvas is the window), `"integer"` (the largest whole multiple of the
  `engine` prefab's `width` × `height`, pixelated), `"contain"` (the largest multiple, whole or not,
  drawn sharp), or left out (the engine size).
- `background`: `"#rrggbb"` or `0xRRGGBB`.

A scene with no `world.render2d` draws on the stage in canvas pixels.

**Between steps.** Each frame, just before drawing, every thing on the stage is put between where the
last two steps left it (position in a line, turn the short way round, scale), and put back once the
frame is drawn.

## Using it

1. List `render2d` in `plugins` (after the plugins that place things in their `afterTick`: sprite2d,
   light2d, particle2d), and give `world.render2d`.
2. In a kind's `<kind>.client.ts`, add PixiJS objects to `plugins.render2d.layer('things')` (or
   `stage`), using `plugins.render2d.PIXI`, and set their position from `place(row.data.pos)`.
3. The calls:
   - `layer(name)`, `stage`, `world`, `canvas`, `PIXI`, `size`, `scale`.
   - `ground()` (a copy of the ground, for a plugin that lays its own things out on it).
   - `place(point)` (a world point on the world), `depth(point)` (its sort key), `along(dir)` (the
     world direction a screen direction goes, for turning held keys into a way), `turns(heading)`.
   - `project(point)` → `{ x, y, behind }` on the canvas; `unproject(x, y, h?)` → the world point under
     a canvas point, for clicks.
   - `look(point)`, `zoom(z)`, `camera()`, `parallax(name, fx, fy)`, `background(colour)`,
     `mosaic(size, layers)`.

   `place`, `project`, `depth`, `along` and `turns` read `world.render2d`, which the first tick reads,
   so they are asked in an actor's `tick`, not its `setup`.

## Plugins it works with

- **sprite2d**, **tilemap**, **grid**, **particle2d**, **light2d**: draw on its layers.
- **box2d**: moves followed objects through `place`.
- **pancamera** and **roomcamera**: move its camera.
- **ui**: lays its own canvas over render2d's at `size` and `scale`.
- **player**: clicks and hovers are measured in its canvas pixels.
- **loader**: decodes images for it through `PIXI.Assets`.
- **audio**: listens from its view.
- **render3d** is the 3D renderer; **renderdom** draws in the DOM.

## Keywords

2D rendering, renderer, PixiJS, canvas, WebGL, WebGPU, sprites, stage, layers, z-order, depth sort,
y-sort, isometric, top-down, side-scroller, parallax, camera, zoom, pixel art, pixel perfect, integer
scaling, nearest neighbour, letterbox, fit to window, resize, interpolation, smooth motion, between
steps, project, unproject, screen to world, click to world, mosaic, SNES, background colour, `place`,
`project`, `unproject`, `layer`, `look`, `zoom`, `world.render2d`
