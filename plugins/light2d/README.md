# light2d

Darkness over a render2d world and the lights that cut through it: an ambient colour and level,
torches, lanterns and glows with a colour, radius, intensity and flicker, a budget of lights nearest
the middle of the view, lights standing at a height, and in an isometric world each light an ellipse
the shape of the ground's diamonds.

## Why use it

Use light2d for a dungeon crawler, a horror game, night time in a top-down or isometric game, a cave
lit by torches, a spell that glows. Every seat sees every light flicker alike, since the flicker runs
on the game's step and each light's noise is seeded by its row id.

## How it works

light2d has no row and no server half. Its numbers are `world.light2d`, read off the scene (a child
scene takes the manager's unless it gives its own).

The darkness is a picture the size of the canvas, multiplied into every world layer under it: white
shows the world as drawn, black hides it. Each frame it starts as the ambient colour × level, and
every light is added onto it, brightest at its middle and falling to nothing at its radius, so a light
brings the world back up to as drawn and never past. It is drawn on the render2d layer
`world.light2d.layer`, which the scene lists last.

- Each row of a kind `kinds` lists gives the light its entry says; a row's own `light` field, when it
  has one, is written over that entry field by field (a torch carries none; a lantern turned down
  carries what changed). A light is `{ colour, radius, intensity, flicker? }`; intensity 0 gives none.
- A light stands on its row's `pos`, `[x, y]` or `[x, y, h]` at a height, drawn where render2d's
  `place` draws that point, so a torch on a wall lights round its flame. Its radius is laid along the
  ground as render2d lays the world: a circle seen from above, an ellipse in isometric.
- `budget` lights are drawn at most: those nearest the middle of the canvas, ties to the lower row id.
- `falloff: { size, core, power }`: brightness is 1 out to `core` of the radius, then falls as
  `(1 − (d − core) / (1 − core))^power`, drawn once per client into a picture `size` pixels across.
- `flicker: { rate, depth }`: a flickering light's intensity is multiplied by 1 − depth × a smooth
  noise that takes a new value `rate` times a second.

Everything is placed in `afterTick`, after every actor moved the camera, so light2d is listed before
`render2d`; after it, the darkness would lag a frame, and that throws.

## Using it

1. List `light2d` before `render2d` in `plugins`, give render2d a layer for the darkness listed last,
   and give `world.light2d: { layer, ambient: { colour, level }, kinds, budget, falloff, flicker }`.
   Colours are sRGB numbers, as a PixiJS tint is.
2. Give each light-giving kind an entry in `kinds`, and a `light` field on rows whose light changes.
3. From an actor's tick, `plugins.light2d.ambient({ colour, level })` sets another ambient for the
   next draw alone (a dark room the seat stands in, every frame it is there).
4. `plugins.light2d.lights` is what was drawn last (each light's row id, `pos`, radius, colour,
   flickered intensity and sprite), for a pass that masks lights, such as shadows cast by walls.

## Plugins it works with

- **render2d**: the layer the darkness is drawn on, and `place`, which stands each light where its
  point is drawn.
- **tilemap**, **sprite2d** and **grid** draw the world it darkens.

## Keywords

2D lighting, lights, darkness, ambient light, night, torch, lantern, glow, light radius, falloff,
flicker, candle, fire light, dungeon, cave, horror, top-down, isometric, multiply blend, light map,
PixiJS, render2d, `ambient`, `lights`, `world.light2d`
