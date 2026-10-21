# sprite2d

Rows drawn as sprites in render2d's world: each row of a listed kind is a frame of a sprite sheet
standing on its `pos`, picking the run that faces its heading (eight-way, mirrored runs), sorted by
the depth of the ground under it, with drop shadows (ellipses or a silhouette clip), alpha, flips,
rotation with a box2d body, a layer of its own, and palette swaps.

## Why use it

Use sprite2d for the characters, enemies, pickups, projectiles and props of a 2D game: an
eight-direction RPG hero, a top-down tank, a platformer's player, an isometric unit, a coin that
spins, a monster recoloured by palette for each variant. The frame is a row field the rule moves on,
so every seat and every rule agree which frame shows.

## How it works

sprite2d has a browser half only and no row. The table is `world.sprite2d.kinds`: for each kind its
`layer` (render2d layer), `turn` (the facing of a whole turn), optional `shadow` (`{ layer, size,
alpha, fade }` for an ellipse that fades with height, or `{ layer, clip, alpha, fade }` for a
silhouette of the thing's own sheet), and optionally `sheet`, `clip` and `facing` for a kind whose
every row looks one way (read there, never sent; a row carrying one of those throws).

A row carries `sheet`, `clip`, `frame` (moved on by its rule with the loader's `play`), `facing`
(`facing` × a whole turn / `turn` counter-clockwise from the world's x toward −y) and `pos` (`[x, y]`
or `[x, y, h]`). It may carry `shadow` (a multiplier, 0 for none), `alpha`, `flip` (upside down, a
thing knocked over), `palette` (a loader palette whose colours replace the sheet's palette's, up to
32, exactly), `layer` (its own layer for a while: behind the ground in a pipe, a fallen body under
the living), and `rot` (`[c, s]`, as box2d writes a body, turning the sprite about its anchor).

The run drawn is the sheet's run facing nearest the heading as drawn on the screen (render2d's
`turns`); a mirrored run is drawn flipped. The frame's anchor stands on `place(pos)`, on whole pixels
for pixel art. On a sorted layer, sprites order by the depth of the ground under them, so a jump
lifts a sprite without changing what it stands in front of; ties go to the kind listed later.

Sprites are placed in `afterTick`. A sprite whose sheet or palettes have not landed is hidden and
asked for.

## Using it

1. List `sprite2d` before `render2d`. Catalogue each sheet (Aseprite, TexturePacker or a Tiled
   tileset) and palette in the loader.
2. Give `world.sprite2d: { kinds: { <kind>: { layer, turn, shadow?, sheet?, clip?, facing? } } }`.
3. Give each row `sheet`, `clip`, `frame`, `facing`, `pos` (those its entry does not give), and move
   `frame` on in its rule with `play(sheet(w, name), clip, frame, ft, dt)`.
4. `look(spec, row)` is a row's sheet, clip and facing, for a rule that reads them.

## Plugins it works with

- **render2d**: the layers, `place`, `turns` and depth sorting.
- **loader**: sheets, clips, `play`, facings and palettes.
- **box2d**: a body's `rot` turns its sprite with it.
- **particle2d**: an effect at a thing's depth draws just over its sprite.
- **sprite3d** is the billboard counterpart in 3D.

## Keywords

sprites, sprite sheet, 2D characters, animation, frames, clips, eight directions, 8-way, facing,
mirrored sprites, isometric sprites, depth sorting, y-sort, drop shadow, blob shadow, silhouette
shadow, palette swap, recolour, alpha, blink, flip, rotate, pixel art, Aseprite, TexturePacker,
render2d, PixiJS, `look`, `world.sprite2d`
