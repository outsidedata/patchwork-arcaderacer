# dither3d

A PlayStation look for a render3d scene: an ordered 4×4 dither over too few colours, at a low
resolution, each pixel a hard square. It can be switched on and off and retuned while the page runs.

## Why use it

Use dither3d for a retro, PS1, low-poly or "lo-fi" look: 15-bit colour banding broken up by the
PlayStation's own dither pattern, and big chunky pixels. It works on top of whatever render3d draws,
with no change to any material or model.

## How it works

dither3d has no row and no server half. On its first tick it reads `world.dither3d`, checks every
number (one it cannot draw throws, naming it) and, the first time it is on, hands render3d a
full-screen pass after its tone mapping (render3d's `finish`, under `dither3d`). The pass works on the
colours the screen shows, in sRGB, as the PlayStation's GPU dithered the 24-bit colour it lit a pixel
with before writing it to its 15-bit frame buffer: each channel is rounded to 8 bits, the pixel's
offset from `matrix` (by where it falls in its 4×4 tile) is added, the sum is held between 0 and 255
and cut to `bits`. With every offset 0 it is a plain cut to `bits` with no dither.

While it is on and gives a `ratio`, render3d draws that many pixels per canvas pixel in `blocks`
mode, so each drawn pixel is a hard square and the dither tile is 4 drawn pixels: 0.25 draws a
1280×720 canvas at 320×180. Turning it off passes the pass over (`enabled`) and puts render3d back to
its prefab's resolution.

A scene that starts with it off draws exactly as it would without it until it is turned on.

## Using it

1. List `dither3d` in the scene's `plugins` (render3d must be listed too) and give `world.dither3d`:
   - `on`: whether it draws at first.
   - `bits`: the bits each of red, green and blue keeps, 1 to 8 (the PlayStation's 15-bit colour
     keeps 5).
   - `matrix`: the 16 offsets, in steps of 1/255 of full scale, row by row from the top left. The
     PlayStation's is `[-4, 0, -3, 1, 2, -2, 3, -1, -3, 1, -4, 0, 3, -1, 2, -2]`.
   - `ratio`: optional, the drawn pixels per canvas pixel while on.
2. At run time, `plugins.dither3d.on`, `bits` and `ratio` read and write live (a settings menu, a
   toggle key), each value checked as the scene's are. A read or write before the first tick throws.
3. `Dither` (the pass) is exported for a page that wants it on its own.

## Plugins it works with

- **render3d**: the pass goes through its `finish` and the resolution through its `ratio`.
- **cel3d** is another look laid over render3d's frame, as bands and ink.

## Keywords

dither, ordered dither, Bayer matrix, PlayStation, PS1, PSX, retro, low-poly, lo-fi, 15-bit colour,
colour depth, colour banding, posterize, quantize, pixelated, low resolution, chunky pixels, render
scale, post-processing, shader pass, three.js, render3d, `world.dither3d`
