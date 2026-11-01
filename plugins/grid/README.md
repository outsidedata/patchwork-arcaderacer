# grid

A 2D map of cells that changes while the game runs, every cell of it: layers of whole-number values
(terrain, height, roads, zoning, buildings, pollution, land value) packed into chunk rows so that a
changed cell sends only its chunk's string, drawn on a sorted render2d layer by a look the game
hands it, with build previews, picking under the mouse on raised ground, and save and load as a PNG.

## Why use it

Use grid for a city builder, a colony sim, a farming game, an isometric strategy map, a tile-painting
sandbox: anywhere the player changes many cells and every seat must agree on them. A row per cell
would be copied, diffed and patched for every seat every step (16384 of them for a map 128 across);
a chunk's string is copied and compared as one value, so a grid of 64 chunks costs a step about what
64 small rows do. A tilemap is a fixed file with a few edits on one row; a grid is its cells, held in
rows.

## How it works

**Server half (`grid.sim.ts`).** Each chunk is a row of kind `grid`: `k`, its place (along the chunks
of the top row, then down), and `cells`, one string per layer, its values packed into it at
⌈bits / 6⌉ characters each from `A–Z a–z 0–9 - _` (six bits each, highest first, nothing JSON
escapes). The scene lists one `grid` actor, chunk 0 (`{ "k": 0, "cells": {} }`); the first step, or
the first `cells(w)`, spawns every other chunk at 0 and gives any chunk missing a layer that layer
at 0. A grid kept by the persist addon is found whole and nothing is made again.

- `cells(w)` hands back `get(layer, x, y)`, `set(layer, x, y, v)`, `inside`, `size` and the layers'
  names. A layer of `scale` s keeps one value per s × s block (a coarse field). A cell outside the
  map, an unknown layer or a value the layer's bits cannot hold throws, naming it.
- `picture(w)` writes the grid as a picture (layers packed into a pixel's 32 bits, extra planes
  below), with the layers' names, bits and scales as JSON in its `grid` text; `fill(w, pixels)` reads
  one back by name, and reads a picture with no `grid` text (a height map painted in an image
  program) as the scene's own layers in order. The loader's `pixels` and `encodePng` do the PNG.

**Browser half (`grid.plugin.ts`).** Draws the cells on `world.grid.layer`, a render2d layer that
sorts by depth, redrawing a cell only when a value it is drawn from changes. The game hands it
`look(fn, reach)`: `fn(cells, x, y)` returns the draws for a cell, each a frame of a loader `sheet`
(`frame`, or a `clip` or `frames` played on the page's clock), at a world point `at`, `lift` steps of
render2d's `up` above it, ordered by a `sort` point and `tie`, with `alpha` and `tint`. `reach` is how
far away a value can change a cell's look (a road picks its piece from its neighbours, a slope from
the heights round it). A sheet rewritten while the game runs redraws every cell.

- `preview(edits)` draws `[layer, x, y, value]` edits over the packets' cells (what a drag would
  build) until the next `preview`; `preview(null)` stops.
- `pick(x, y, height?)` is the cell whose top is drawn at a canvas point, searching heights from the
  top down so a hill in front hides cells behind it; `top(x, y)` the height a cell is drawn at.
- `cells()` is the grid as drawn, with the preview; `ahead()` the packets' cells without it.

## Using it

1. List `grid` in the scene's `plugins` (with `render2d` and `loader` on the page) and give
   `world.grid: { size: [w, h], chunk, layers: { <name>: { bits, scale? } }, layer }`. The map is a
   whole number of chunks and each chunk a whole number of blocks.
2. Add one `{ "is": "grid" }` actor with prefab `{ "k": 0, "cells": {} }`.
3. In rules, `const c = cells(w); c.set('road', x, y, 1)` from a seat's act.
4. On the page, from an actor's setup, `plugins.grid.look((c, x, y) => [...draws], reach)`; drive
   building with `preview`, and the cursor with `pick`.
5. Save or load with `picture` and `fill`.

## Plugins it works with

- **render2d**: the sorted layer the cells are drawn on, its `up`, and its projection for `pick`.
- **loader**: the `sheet` entries the draws name, and `pixels` / `encodePng` for `picture` and
  `fill`.
- **math**: deterministic maths.
- **tilemap** is the fixed-level counterpart: a Tiled map with a few edits.

## Keywords

grid, cells, tiles, map, city builder, SimCity, colony sim, isometric, tile map, layers, terrain,
height map, roads, zoning, buildings, land value, pollution, chunks, chunked map, bit packing,
network efficient, autotile, neighbours, sprite sheet, sorted layer, depth sort, picking, mouse
pick, hover, build preview, ghost, save map, load map, PNG, persist, `cells`, `look`, `preview`,
`pick`, `picture`, `fill`, `world.grid`
