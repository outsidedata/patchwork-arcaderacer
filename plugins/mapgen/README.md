# mapgen

Procedural level generation from a recipe and a seed: rooms and corridors (BSP), caves (cellular
automata) or halls over a hazard, set pieces stamped in, everything joined so every walkable cell is
reachable, up and down stairs a path apart, actors placed by rules, and an isometric dungeon's walls,
arches and columns autotiled from a Tiled tileset theme. It hands back a Tiled map and a list of
`actors` entries the scene loads as it would hand-drawn ones.

## Why use it

Use mapgen for a roguelike, a dungeon crawler, endless caves, a randomly laid out base: a fresh
level every run, the same level for the same seed, tile for tile and actor for actor. Every number is
in the recipe, a data file of the game's, and the art is the theme, a Tiled tileset, so the same
generator dresses any look.

## How it works

mapgen has a server half only and is a library: no row, no Kind, nothing kept between calls, no
numbers of its own.

`build(die, recipe, theme, source, pieces)` → `{ map, actors, roles }`. `die` hands out numbers in
[0, 1) (the engine's `seeded(seed)`); `source` is the path the map names its tileset by.

- **Carving**, by `algorithm`:
  - `rooms` `{ leaf, room, door }`: the map is split in two across its longer side, and again, while a
    side is at least 2 × `leaf`; each leaf holds one room; each split's halves are joined by an
    L-shaped corridor between their nearest rooms; `door` is the chance a corridor cell on a room's
    ring is a door.
  - `caves` `{ fill, steps, born, stays, keep }`: random fill, `steps` rounds of cellular automata over
    8 neighbours, small regions under `keep` filled.
  - `halls` `{ count, room, gap, door }`: rooms with walls standing over hazard (lava, water, a pit),
    joined by walkways.
- **Set pieces**: fixed Tiled maps stamped on `floor` or `solid`, their object layers becoming actors.
- **Settling**: walls the theme draws no tile for are opened, every walkable region is joined to the
  largest by tunnels `width` wide, and doors are kept only where they stand between two walls.
- **Stairs**: up on a rolled floor cell, down at least `apart` steps from it by path.
- **Placing**: each `place` entry is an `actors` entry with `{ on, count, apart, away, blocks, faces }`:
  on `floor`, `door` (carrying `role`) or `wall` (carrying `face`); how many; how far apart; how far
  from the up stairs by path; `blocks` only where every walkable cell stays reachable.
- **Roles**: each cell's role (`floor`, `floor-n`, `floor-w`, `floor-nw`, `floor-c`, `door-ns`,
  `door-ew`, `door-ns-w`, `door-ew-n`, `hazard`, `void`, `wall-n`, `wall-w`, `wall-nw`, `wall-c`) says
  what it draws on its upper sides and top corner, as an isometric dungeon kit draws walls on the
  edge where walking stops. `autotile(ground)` works the roles out.
- **The theme**: a Tiled `.tsj` whose tiles' `type` is their role and `probability` their weight
  (`palette`, `pick`). A walkable role's tile with collision, or any other role's without, throws, so
  the map blocks where tilemap reads it blocking.
- `tries`: a map that finds no place for a room, a piece, the stairs or a placement is thrown away and
  the next made from where the die stands, up to `tries`, then it throws.

What comes back: `map`, a Tiled map with its ground layer first; `actors`, each `{ is, pos, ...fields }`
(set pieces' first, then the stairs, then the recipe's in order); and `roles[r][c]`.

## Using it

1. Write the recipe as a data file of the game's: `size`, `layer`, `ground`, `width`, `tries`,
   `algorithm` and its block, `stairs`, `place`, `pieces`.
2. Make a theme tileset in Tiled with a `type` per tile.
3. Call `build(seeded(seed), recipe, theme, source, pieces)` from a script or a rule and write the
   `map` as the scene's `.tmj` and `actors` into the scene, then load them through the loader and
   tilemap.

## Plugins it works with

- **tilemap**: draws and collides the map it writes, reading tile collision as mapgen checks it.
- **loader**: reads the recipe, the theme and the set pieces, which the caller hands in.
- **render2d**: the isometric ground `[[64, 32], [-64, 32]]` its roles are named on.
- **math**: deterministic maths.

## Keywords

procedural generation, procgen, dungeon generator, level generator, roguelike, map generator, BSP,
binary space partition, rooms and corridors, cellular automata, caves, halls, lava, set pieces,
prefabs, stairs, seed, deterministic, reproducible, autotile, isometric dungeon, walls, doors,
arches, columns, Tiled, tileset, tmj, tsj, actor placement, connectivity, flood fill, `build`,
`autotile`, `ROLES`
