# tilemap

Tiled maps as levels: drawn in render2d's world (orthogonal or isometric, tile and image layers,
flips, opacity, tint, parallax, repeating backgrounds, animated tiles on the step counter, depth
sorting with walls), changed by rules one cell at a time on a single row, and asked by rules for
tiles, objects and collision: platformer sweeps with slopes and one-way platforms, top-down circle
movement, and the collision shapes a physics world is handed.

## Why use it

Use tilemap for any 2D game whose levels are painted in Tiled: a platformer, a top-down adventure,
an isometric dungeon, a shmup's background. The map never changes, so no row carries it; what
changes (a block broken, a coin taken, a door opened) is one key on one row, which a seat that joins
late is sent too.

## How it works

**Server half (`tilemap.sim.ts`).** `world.tilemap.file` names the map, a loader `tilemap` entry with
`preload`. A rule reads it with the loader's `tiled(w, w.world.tilemap.file)` and hands it to the
questions. The one `tilemap` row carries `edits`, `{ "<layer>:<c>,<r>": gid }` (−1 for no tile). A
point is `[x, y]` in cells, x along a row and y down.

- `tileAt(map, edits, layer, c, r)`, `overlaps(map, edits, box)`, `objects(map, layer?)` (the object
  layers' objects: spawns, triggers, rooms), `tileOfType(map, type)`.
- `solidAt(map, edits, box)`: whether a box would stand inside the level's walls.
- `shapes(map, edits, box)`: every collision shape (Tiled's rectangles and convex polygons, flipped as
  the cell flips, `top`-typed ones one-way) in world points, for a physics world.
- `sweep(map, edits, box, axis, to, solids?)`: a platformer move along x or y against tiles and
  moving solids, returning the box where it stopped and a `Hit` per thing touched (`side`, `cell`,
  `tile`, `solid`, `type`, `slope`). Feet rest on the middle of the bottom edge, 45° and gentler slopes
  carry it and it walks down them without leaving them, it steps up low ledges, one-way platforms
  hold it only from above, and everything is measured to `EPS` so nothing sinks, jitters or catches on
  seams.
- `blocked(map, edits, c, r)`, `clear(map, edits, pos, radius, solids?)` and `slide(map, edits, pos,
  axis, to, radius, solids?)`: a top-down thing as a circle walking cell by cell.

**Browser half (`tilemap.plugin.ts`).** Once the row is in the packet it asks the loader for the map
and draws it in `afterTick`. render2d's `ground` must lay cells out as Tiled does (`[[w, 0], [0, h]]`
orthogonal, `[[w/2, h/2], [-w/2, h/2]]` isometric), or it throws. Each tile and image layer is drawn on
the render2d layer its Tiled `name` names; hidden layers and object layers cost nothing. On a sorted
layer each tile sorts by a point of its cell (its tile's `sort` property, 0 to 1, for a wall that
things stand in front of). Animated tiles show the frame the step counter has reached, so every seat
shows the same frame. Repeating image layers become tiling sprites covering the view. The map's
`backgroundcolor` and each layer's parallax go to render2d. Changed edits redraw only their cells;
a rewritten map redraws the whole.

## Using it

1. List `tilemap` before `render2d`; add one `tilemap` row (`{ "edits": {} }`); catalogue the `.tmj`
   (with its `.tsj` tilesets beside it) as a `tilemap` entry with `preload`; give `world.tilemap:
   { file }`, and render2d a `ground` and the layers the map's layers name.
2. In a rule: `const map = tiled(w, w.world.tilemap.file)`, then `sweep(map, row.data.edits, box, 0,
   x + vx * dt)` for movement, and write `edits` to break a block.
3. Give tiles collision in Tiled's collision editor; type a shape `top` for a one-way platform.

## Plugins it works with

- **render2d**: the world, layers, background and parallax it draws into.
- **loader**: reads the Tiled map and tilesets (`tiled`), decodes the images.
- **box2d**: the mod `tilemap.box2d.ts` (`world.box2d.mods: { ground: 'tilemap' }`) hands box2d each
  chunk of the map's collision shapes, one-way tiles included.
- **nav**: pathfinds over `blocked`.
- **mapgen**: writes Tiled maps tilemap draws and collides.
- **light2d** and **sprite2d**: light and draw what stands on the map.
- **grid** is the counterpart for maps whose every cell changes.

## Keywords

tilemap, tile map, Tiled, tmj, tsj, tileset, level, level editor, platformer, collision, slopes,
one-way platforms, jump through, sweep, AABB, top-down, isometric, autotile, animated tiles, layers,
parallax, background, depth sort, walls, breakable blocks, edits, objects, spawn points, triggers,
rooms, physics ground, `sweep`, `solidAt`, `shapes`, `blocked`, `slide`, `clear`, `tileAt`,
`objects`, `world.tilemap`
