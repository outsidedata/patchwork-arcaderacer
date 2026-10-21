# chasecamera3d

A third-person camera for render3d: the camera held on one row in a rigid orbit about it, from the
row's own `pos`, `lift` and `look { yaw, pitch, dist, side? }`.

## Why use it

Use chasecamera3d for a third-person game: a character, a car or a ship the camera sits behind, an
over-the-shoulder view with the body off the middle of the screen, orbited by the mouse or stick.
The camera moves exactly as the row does, so it is as smooth and as predicted as the row is, and
every seat sees the same framing from the same fields.

## How it works

It has no row, no prefab and no server half. Every frame, in its `tick`, it reads the followed row
from this frame's rows and places render3d's camera:

- the pivot is `pos` raised by `lift`, and moved `side` metres to the right of the way `yaw` looks
  when the row gives a `side` (over the shoulder);
- the eye is the pivot plus `dist` times (−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch);
- up is world up, and the camera looks at the pivot.

That is the whole of it: no easing, no floor, no collision, no smoothing of its own. Anything that
should turn or rise gradually (a lock-on's yaw, a crouch's pivot, a zoom) is a field of the row that
its rule moves at a rate, and the camera sits on that field. A camera that shakes on a body that
shakes is fixed in the body.

It places the camera only while `render3d.claimed()` is empty, and never claims it, so a cutscene
holding the camera keeps it, and the frame it lets go the camera is back on the row. Before
`follow`, or on a frame without the followed row, the camera stays where it was.

## Using it

1. List `chasecamera3d` in the scene's `plugins` after `render3d` (whose first tick makes the camera
   from its prefab). Listed before it, or with no render3d camera, its tick throws.
2. Give the followed row `pos`, `lift` and `look: { yaw, pitch, dist, side? }`, and have its rule move
   `look` from the seat's mouse or stick.
3. From the seat's own actor's setup, call `plugins.chasecamera3d.follow(row.id)`.
4. `plugins.chasecamera3d.eye()` is `{ pos, dir }`, where the camera stands and the way it looks,
   whoever placed it: what a crosshair, an aim ray or a hitscan shot from the screen centre reads.

## Plugins it works with

- **render3d**: the camera it places, and `claimed()`, which tells it when someone else holds the
  camera.
- **cutscene**: claims the camera while it plays, and chasecamera3d gives way.
- **player**: the seat's own `player` row is what it usually follows, the row's rule moving `look`
  from the seat's mouse or stick.
- **pancamera** and **roomcamera** are the 2D cameras.

## Keywords

camera, third-person camera, chase camera, follow camera, orbit camera, over the shoulder, OTS,
shoulder cam, pivot, yaw, pitch, distance, zoom, look, mouse look, free look, render3d camera,
claimed, cutscene camera hand-off, eye, crosshair ray, `follow`, `eye`
