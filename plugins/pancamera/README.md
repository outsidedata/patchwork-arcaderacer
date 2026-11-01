# pancamera

An RTS or city-builder camera over a render2d world: pan by pushing the pointer to the canvas's
edge or by held keys, step the zoom with the wheel through a list of zooms, held inside bounds, and
jump to a point when a minimap is clicked.

## Why use it

Use pancamera for a strategy game, a city builder, a tower defence, a god game, a spectator view: a
camera nobody's body carries, which the player moves over the map. It moves rigidly (no easing, no
speed carried between frames) and by the page's time, so a display drawing twice as often moves it
half as far a frame.

## How it works

pancamera has no row and no server half. Its numbers are `world.pancamera`. Each frame, in its
`tick`, it starts from the point render2d looks at (so a `look` an actor made is where the pan goes
on from), works out a way on the screen from the pointer's edge and the held keys, moves the point
through the world the way render2d's `along` says at `speed` for the frame's time, holds it inside
`bounds`, and hands render2d the point with `look`. The wheel steps render2d's zoom to the next
smaller or larger in `zooms` each `notch` pixels.

The keys and wheel are read through `player`'s bind table, so the UI takes a click or key first, a
modal lets every key go, and an arrow key does not scroll the page. The pointer is the page's last
`mousemove` against render2d's canvas; there is no edge pan before it moves, after it leaves the page
or the focus, under pointer lock, while a ui modal has the input, or in node.

## Using it

1. List it after `render2d` and after `player`: `"plugins": [..., "player", "render2d", "pancamera"]`.
   Otherwise, or with no `world.render2d`, its tick throws.
2. Give `world.pancamera`: `speed` (world units a second), `edge` (canvas pixels), `keys: { left,
   right, up, down }` (each a key or list of keys in `player`'s names), `zooms`, `notch`, `bounds:
   [[x0, y0], [x1, y1]]`, and `look`, the point to start on.
3. In the seat's actor's setup, hand the camera's binds to `player.bind`, alone or with its own:

   ```ts
   const cam = plugins.pancamera.binds(plugins)
   plugins.player.bind({ ...cam, press: { ...cam.press, /* the game's own */ } })
   ```

4. `plugins.pancamera.look(plugins, point)` jumps the camera (a minimap click).

## Plugins it works with

- **render2d**: the camera it moves (`look`, `camera()`, zoom, `along`, the canvas).
- **player**: the bind table its keys and wheel are read through.
- **ui**: a modal holding the input stops the edge pan.
- **roomcamera** is the 2D camera that follows a body room by room; **chasecamera3d** the 3D one.

## Keywords

camera, 2D camera, RTS camera, strategy camera, edge scrolling, edge pan, screen edge, WASD pan,
arrow keys, scroll, mouse wheel zoom, zoom levels, bounds, clamp, minimap click, spectator, city
builder, tower defence, top-down, isometric, render2d, `look`, `binds`, `world.pancamera`
