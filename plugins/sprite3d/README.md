# sprite3d

Rows drawn as billboards in render3d's world: each row of a listed kind is an upright plane showing a
frame of a sprite sheet, turned about y to face the camera, standing on its `pos`, the run of its clip
picked by which side the camera sees it from, as Doom draws its monsters.

## Why use it

Use sprite3d for Doom- or Build-style monsters and pickups, 2.5D characters in a 3D level, trees or
props drawn as cards, rockets and fireballs, anything that is pixel art in a 3D world. Eight
rotations drawn 1 to 8 are runs of one clip, so a monster looks the right way from every side.

## How it works

sprite3d has a browser half only and no row. The table is `world.sprite3d`: `ppm` (sheet pixels per
metre), `alphaTest`, and `kinds`, each with its `turn` (the facing of a whole turn) and optionally
`sheet`, `clip` and `facing` for a kind whose every row looks one way (read there and never sent; a row
carrying one throws). A scene the manager starts takes the manager's `world.sprite3d` when it gives
none.

A row carries `sheet`, `clip` (or null while it shows nothing yet), `frame` (set by its rule),
`facing` (`facing` × a whole turn / `turn` counter-clockwise from +x seen from above) and `pos`. The
run drawn is the one the camera sees: a thing seen from in front faces down the screen, and from a
camera a quarter turn round to its left faces left, so eight rotations drawn 1 to 8 are runs facing
from 3/4 of a turn by −1/8. A mirrored run is drawn flipped; a clip of one run that mirrors nothing
looks the same from every side. The frame's anchor stands on `pos` at `ppm` pixels to the metre (a
monster's feet on the floor, a rocket's middle on its path), and a trimmed frame stands where it would
untrimmed.

The planes are placed in `afterTick`, so they face the camera the seat's actor moved this frame.
`round(ahead, pos, x, z)` is how far round to a thing's left a camera stands.

## Using it

1. List `sprite3d` before `render3d` (after it, sprites face last frame's camera and that throws).
2. Catalogue each sheet in the loader with its `facing` (`{ first, step, mirror }`).
3. Give `world.sprite3d: { ppm, alphaTest, kinds: { <kind>: { turn, sheet?, clip?, facing? } } }`, and
   each row `sheet`, `clip`, `frame`, `facing`, `pos` as its entry does not give them.

## Plugins it works with

- **render3d**: the scene and the camera the planes face.
- **loader**: sheets, clips, facings and `play`.
- **sprite2d** is the 2D counterpart; **particle3d** draws camera-facing quads for effects.

## Keywords

billboard, sprites in 3D, 2.5D, Doom style, Build engine, boomer shooter, retro FPS, eight
rotations, directional sprites, sprite sheet, pixel art, cards, impostor, alpha test, facing camera,
`look`, `round`, `world.sprite3d`
