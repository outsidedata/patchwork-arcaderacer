---
name: using-ui3d
description: Use in core, or any clone of it, whenever ui3d comes up - things in 3D over the game in render3d's overlay, placed in the camera's frame, moved by words, selected and pressed by the pointer and keys - and above all when building a game's title or logo in 3D (its name as a model, its particles, the attract mode a menu plays on its own). Covers `world.ui3d` (`overlay`, `keys`, `looks`, `mods`), a scene's looks file and `show(key, name)`, a game's own words (`<a>.ui3d.ts`), particle3d's `particles` word and a thing's state driving its effects (`selected`, `chosen`, `age`), the logo's model from Blender, and tuning a look's particles in the particle workshop's ui3d mode. Also when a look throws that the file has no look of a name, a look by name shows nothing, a title's particles do not move with hover, or a page serves `[]` for a looks file.
---

# Using ui3d

ui3d (`plugins/ui3d/`) shows 3D things over the game in render3d's overlay. Its header is the whole of
it, and its README says it plainly; this skill is how a game uses it, the title above all.

## The door: a scene's looks file

A game's 3D UI is data in one place. `world.ui3d.looks` names a `json` entry of the scene's loader
catalogue; the file is looks by name. A look gives `model` (a `model` entry of the catalogue), `at`
(metres right, up and ahead of the camera), `scale`, `select`, and every other field is a word:

```json
{
  "title": {
    "model": "logo",
    "at": [0, 2.6, -15],
    "logo": { "...": "the game's own word" },
    "particles": [
      { "effect": "title_burst", "at": [0, 0, -0.4] },
      { "effect": "title_ember", "at": [0, 0, 0], "drivers": { "heat": "selected" } }
    ]
  }
}
```

An actor shows it by name every frame it wants it: `plugins.ui3d.show('logo', 'title')`. ui3d makes the
thing from the model, with materials of its own, once the file and the model have landed. The first
frame nobody shows it, it is taken out, and its effects end.

The file is never named `looks.json`: the dev server answers every `<folder>/looks.json` with the
engine's list of kinds that have a look, so the page reads `[]`. starfighter's is `assets/ui3d.json`,
its catalogue key `ui3d`.

```json
"ui3d": {
  "overlay": [0.1, 100],
  "keys": { "next": ["ArrowDown"], "previous": ["ArrowUp"], "press": ["Enter", " "] },
  "looks": "ui3d",
  "mods": { "behaviors": ["particle3d", "look"] }
}
```

and `ui3d` in `plugins` before `particle3d` (so the effects move the frame their points are written)
and before `render3d`.

## Words

A word is what a look does to its thing each frame. ui3d's own are `grow`, `glow` and `dim`. Every
other comes from a mod, `<a>.ui3d.ts` exporting `behaviors()`, named in `world.ui3d.mods.behaviors`
(`connecting-plugins-using-mods`). A game's own word is a mod beside a plugin of the game's,
`games/<game>/plugins/<a>/<a>.ui3d.ts`, `<a>` listed in `world.shipped.plugins`. A word knows its one
thing: starfighter's `logo` (`plugins/look/look.ui3d.ts`) is the whole of how its name flies in, sways,
burns and is lit, its numbers the look's.

## Particles and the thing's state

particle3d delivers `particles` (`plugins/particle3d/particle3d.ui3d.ts`): each entry an effect of the
game's effects file, kept running at `at` in the thing's frame for as long as it is shown, and its
`drivers` held at the thing's state every frame:

- `selected`: 1 while it is the selected thing (the pointer came onto it, or a key moved to it), else 0
- `chosen`: 1 while any thing of the menu is selected
- `age`: the seconds since it was first shown

What a driver does is the effects file's: its numbers are expressions of the drivers. A menu item
whose embers rise faster under the pointer names `{ "rise": "selected" }` and its layer says
`"speed": ["1 + 3 * rise", "2 + 3 * rise"]`. When in an effect's life a layer starts is the layer's
`after`: the title's burst lands 70% through the reveal with `"after": 1.54`. A stream's rate is its
`every`.

## A game's logo title

The attract mode a title plays on its own is a look, its words and its particles. To make one:

1. The name as a model: a Blender script in the game's `assets/`, starfighter's `logo.py` the one to
   copy. It extrudes and bevels the name in the game's font (a `.ttf` beside it, with its licence)
   and gives each face one of two materials by the way it points: `face` for the fronts and backs,
   `EMIT_rim` for the walls and the bevel, the light a word drives. Exported as a glb, catalogued as a
   `model` (`making-3d-assets-in-blender`, `bringing-in-art`).
2. The look in the scene's looks file: `model`, `at`, the game's word for its finish and motion, and
   its `particles`.
3. The word, `<a>.ui3d.ts` beside a plugin of the game's: what the name does on its clock (`it.age`):
   comes in, sways, burns, its light. Metal reflects the sky, so the actor hands ui3d the scene's
   environment each frame: `ui3d.environment(render3d.scene.environment)`.
4. The actor: shows the look by name when the title is up, and nothing else of the name.
5. Tune it in the particle workshop's ui3d mode (below), and look at it in the game.

## Tuning in the particle workshop

`yarn workshop particles <game>`: every scene that plays the effects file and gives `world.ui3d.looks` is
found as the effects file is, and the left column's ui3d section lists every look of its file. Choose
one: it is shown on the stage by ui3d with that scene's words, every frame, its particles played from
the working effects, so a number changed shows on it from the next step. The pointer over a look that
can be selected selects it, so a driver held at `selected` moves. Replay shows it from its first frame.
The address is `?game=<game>&ui3d=<scene>/<look>` (`tools/workshop/README.md`).

## What goes wrong

- A look by name in a scene with no `world.ui3d.looks`, a name the file has none of, or `show(key,
  name)` of a look with no `model`: each throws, naming it.
- The looks file named `looks.json`: the page reads `[]`, and the first `show` throws that the file
  has no look of that name.
- The effects of a look behind its name: particle3d draws in the world, under the overlay, so a
  particle in front of the letters is drawn behind them.
- A dull, dark name: metal with no environment. Hand ui3d the scene's.
