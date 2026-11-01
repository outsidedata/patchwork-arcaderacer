# roomcamera

A room-by-room camera for render2d: the view held on a point but never showing past the edges of the
room it stands in, centred on a room smaller than the view, and scrolling from one room to the next
as the body walks through, as a top-down adventure's camera does.

## Why use it

Use roomcamera for a Zelda-style adventure cut into screens, a Metroidvania's rooms, a dungeon of
chambers, or any game whose whole map is one room the camera must stay inside. It has no row, no
numbers and no server half, and knows only what it is handed, so the game decides what a room is and
when the scroll runs.

## How it works

Each frame an actor calls `look(plugins, at, room, from?, through?)`:

- `at` is the point to look at, `room` the rectangle `[x, y, w, h]` of the world it stands in.
- The view's size in the world is render2d's canvas `size` over the zoom, over the stage pixels a
  step of the world's x and y are drawn across (from `place`).
- Along each axis the view is held in far enough that nothing past the room's edges shows, or, where
  the room is no bigger than the view, on the room's middle.
- While the body walks from one room to the next, the actor also hands `from` (the room it left) and
  `through` (0 to 1, how far through the walk), and the view is that far between where it was held in
  the old room and where it is held in the new: the screen scrolls.

It hands render2d the point with `look`.

## Using it

1. List `roomcamera` in `plugins` beside `render2d`.
2. Keep the rooms in the level's data and the walk between them on the seat's row (`room`, `from`,
   `through`), so every seat scrolls alike.
3. In the seat's actor's `tick` (after render2d's first tick):
   `plugins.roomcamera.look(plugins, row.data.pos, room, from, through)`.

## Plugins it works with

- **render2d**: its `place`, `camera()`, `size` and `look`.
- **tilemap**: the map whose object layer usually holds the rooms.
- **pancamera** is the free-panning 2D camera; **chasecamera3d** the 3D one.

## Keywords

camera, 2D camera, room camera, screen transition, scrolling rooms, Zelda camera, Metroidvania,
flip screen, clamp camera to room, camera bounds, follow camera, top-down adventure, dungeon rooms,
render2d, `look`
