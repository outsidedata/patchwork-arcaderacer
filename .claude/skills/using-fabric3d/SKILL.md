---
name: using-fabric3d
description: Use in core, or any clone of it, whenever fabric3d comes up - cloth moved on the GPU - a flag on a mast, a cape or cloak on a body, a ribbon on a stick, a banner towed behind a vehicle, a curtain, a cloth dropped over a table - `world.fabric3d` (`fabrics`, `attach`, `gravity`, `wind`, `turbulence`, `substep`, `passes`, `most`, `mods`), the fabrics file (`points`, `weight`, `stretch`, `shear`, `bend`, `drag`, `catch`, `friction`, `thick`, `pins`, the cut `plane`, the drawing `paint`), pinning a fabric to a bone, a prop, an empty or a shape, a game's own things handed to it (`<a>.fabric3d.ts`, `sources`), or a new cut or drawing. Also when a cape passes through its wearer, a cloth falls through a table or the ground, a flag hangs sideways or from the wrong end, a fabric stretches like rubber, trails behind what holds it, is not drawn at all, or fabric3d throws "has no behavior for the fabric", "has no cut", "has no drawing", "is held to the point ..., which the ... has none of", "names no sources", "has no pins" or "is listed after render3d".
---

# Using fabric3d

fabric3d (`plugins/fabric3d/`) moves cloth on the GPU. A fabric is a grid of points, each a texel of
float textures, moved by shader passes and drawn as one mesh. It has no row, no prefab and no server
half: every page moves its own, two seats never see the same folds, and no rule reads one. Use it for
cloth nothing in the game's rules needs to know about. The header of `fabric3d.plugin.ts` says every
field and its unit; this is how the pieces fit.

## What the scene gives

```json
"fabric3d": {
  "fabrics": "fabrics",
  "attach": [
    { "fabric": "flag", "of": "mast" },
    { "fabric": "cloth", "at": [0, 1.7, 0] },
    { "fabric": "cape", "of": "xbot" }
  ],
  "gravity": [0, -9.81, 0],
  "wind": [5, 0, 1.5],
  "turbulence": { "size": 2.5, "strength": 0.6 },
  "substep": 0.004166666666666667,
  "passes": 6,
  "most": 0.05,
  "mods": {
    "behaviors": ["shapes3d", "solids"],
    "solids": "gpgpu3d",
    "sources": ["shapes3d", "anim"]
  }
},
"gpgpu3d": { "reach": 60, "mods": { "things": ["shapes3d", "anim"], "behaviors": ["shapes3d", "anim"] } }
```

1. The fabrics file is a `json` entry of the scene's loader catalogue, named by
   `world.fabric3d.fabrics` (the demo's has `preload`).
2. `plugins` lists `loader`, `gpgpu3d` when fabrics meet anything, then `fabric3d`, then `render3d`.
   fabric3d listed after render3d throws.
3. `fabrics`, `gravity`, `substep`, `passes` and `most` are required. `wind` and `turbulence` may be left out.

## The four mods

| mod | how many | from | what it gives |
|---|---|---|---|
| `behaviors` | a list | `shapes3d`, `solids`, a game's own | the words a fabric is cut and drawn by |
| `sources` | a list | `shapes3d`, `anim`, `motion3d`, a game's own | the things a fabric is pinned to |
| `solids` | one | `gpgpu3d` | what every fabric drapes on |
| `wind` | one | `weather3d` | the wind as the weather blows it; with none, `world.fabric3d.wind`; with neither, still air |

With no `solids` a fabric meets nothing and falls through everything.

## A fabric

```json
"cape": {
  "plane": { "size": [0.8, 1.2] },
  "paint": { "colour": "#5a2a82", "roughness": 0.8 },
  "points": [17, 25],
  "weight": 0.3, "stretch": 1, "shear": 0.5, "bend": 0.1,
  "drag": 1, "catch": 0.3, "friction": 0.2, "thick": 0.035,
  "pins": [{ "on": "Neck", "from": [5, 0], "to": [11, 0], "at": [-0.15, 0.02, -0.11], "turn": [90, 0, 0] }]
}
```

- **Its two words.** Every field that is not one of fabric3d's own is a word. A fabric has exactly one
  word that cuts it and one that draws it:
  - `plane` (shapes3d's): `{ size: [x, z] }`, a rectangle `x` metres across its columns and `z` along its
    rows, flat in its own frame, its middle at the frame's middle.
  - `paint` (solids'): `{ colour, roughness?, metalness?, glow?, opacity?, map?, scale? }`. `map` is a
    `texture` entry of the catalogue, laid once over the whole fabric, or every `scale` metres. A look
    paint (`{ look }`) and a paint that blinks throw.
- **`points`** `[columns, rows]`, each 2 or more. The demo's flag is 37 by 25 over 2.4 by 1.6 metres, its
  cape 17 by 25, its ribbon 3 by 61.
- **`weight`** kilograms a square metre. **`stretch`**, **`shear`**, **`bend`** from 0 to 1: how much of
  the way each pass pulls a point back to its rest length along the weave, across it, and two points
  along. Every fabric of the demo has `stretch` 1.
- **`drag`** how much of its speed a point loses a second to the air. **`catch`** how hard the wind pushes its face.
- **`friction`** from 0 to 1, how much of its move across a thing it meets is held back. **`thick`**
  metres it is kept clear of what it meets.

## Pins

A pin `{ on, from, to?, at?, turn? }` holds the points from column and row `from` to `to` to the point
`on` of the thing the fabric is attached to.

- `from` alone pins one point: a corner. `from` and `to` pin every point of the rectangle between
  them, held stiff: an edge along a pole. `to` is at or past `from` in column and in row.
- The point `from` sits at `at` metres in the frame of the thing's point, and the rest of the pin's
  points keep their places from it in the fabric's cut, turned by `turn` degrees.
- A `plane` lies flat, so a hanging fabric's pin turns it: the demo's flag, cape, ribbon and colours
  have `"turn": [90, 0, 0]`, and its banner `[90, 0, -90]`.
- Two pins may not hold the same point.

What `on` names is the source's to say:

| source | a thing is | its `of` | `on` finds |
|---|---|---|---|
| `shapes3d` | every box, plane, hyperplane and cylinder | its kind | `pos` only: where it stands. `at` reaches the rest of it: the top of a mast 6 metres tall is `"at": [0.06, 5.9, 0]` |
| `anim`, `motion3d` | every body drawn, once its model and props are made | the kind it is drawn as (its `as`, else its kind) | the first of: a bone whose name ends with `on`; its prop of the model `on`; an object in a prop whose name ends with `on`, an empty |
| a game's own | whatever it hands | whatever it says | whatever it names |

demo_fabric3d's ribbon is pinned `"on": "tip"`, an empty in the stick its X Bot holds
(`world.anim.kinds.xbot.props`).

## Attach

`world.fabric3d.attach` puts fabrics in the scene:

- `{ fabric, of }` keeps one fabric on every thing whose `of` is that, from the frame the thing is
  handed until the frame it is not. The fabric has pins, and `mods.sources` names someone.
- `{ fabric, at, turn? }` lays one fabric of no pins at a place and lets it fall: a cloth over a table.
  A fabric with pins laid at a place throws, and so do an entry with both `of` and `at` and one with
  `of` and `turn`: a fabric held to a thing is turned by its pins.

One kind may wear several: the demo's X Bot has `cape` and `ribbon`.

## What a fabric drapes on

`"solids": "gpgpu3d"`, with `world.gpgpu3d` holding the things (`using-gpgpu3d`): shapes3d's boxes and
cylinders (kept out of), its planes and hyperplanes (kept off, on the side it was on), terrain3d's land,
and the capsules of anim's, motion3d's and puppet3d's bodies.

- A body is met only where its kind gives `capsules`. demo_fabric3d's X Bot gives fourteen, hips to feet
  (`world.anim.kinds.xbot.capsules`).
- A cape is to meet its wearer's capsules and not the cylinder its wearer walks as: where `walker` is
  under gpgpu3d's `things`, `world.gpgpu3d.meets.fabric3d` leaves it out.
- A fabric does not meet itself or another fabric.

## The clock

A fabric is moved inside the scene's draw, once a frame, before anything of the frame is drawn, to the
moment the frame draws. Every bone and prop stands there where render3d draws it, between the steps, so
a pinned edge neither trails nor leads what holds it. The frame's time, at most `most` seconds, is cut
into substeps no longer than `substep`; each moves the points, pulls them to their lengths `passes`
times, and pushes them out of what they meet. The demo runs `substep` 1/240 and `passes` 6.

A thing that teleports raises `userData.teleport` on its object, or one above it
(`guide-to-smooth-gameplay`), and its fabrics are laid again where it now is.

## A game's own things, cuts and drawings

- **Things.** `games/<game>/plugins/<a>/<a>.fabric3d.ts` exports `sources(plugins)`, asked once a frame,
  handing `{ key, of, point(on) }` for each thing: `key` the same every frame, `point(on)` a three.js
  object, read where the frame draws it, or `{ at, rot? }`. The scene names `<a>` under `mods.sources`
  with `<a>` in `world.shipped.plugins`. `games/demo_fabric3d/plugins/towing/towing.fabric3d.ts` hands each
  tug as a thing of `tug` whose point `tail` is the object solids draws it by.
- **A cut or a drawing.** The same file exports `behaviors()`, `{ <word>: Behavior }`: `check(data, what,
  world)`, and `rest(data, u, v)` for a cut or `material(data, { plugins, name })` for a drawing, which
  hands back `{ material, span? }` or undefined while what it draws with loads. fabric3d dresses the
  material, draws it from both sides and has it cast and take shadows. `shapes3d.fabric3d.ts` and
  `solids.fabric3d.ts` are the two to read.

## A pro-ng kit item's cloth

A kit kind of the library's pro-ng says its own cloth: its `<kind>.fabrics.json` holds fabrics with every field here
but `pins`, and its file pins each as it builds. pro-ng's build writes them beside the glb as `<name>.fabrics.json`:
`fabrics`, and `hangs`, each `{ thing, fabric, pins }`, a pin `{ from, to, at, across, down, bone? }` in three's axes
as the thing stands at rest (the library's `pro-ng/KIT.md`, "Cloth"; the kind `item3d_test_item` hangs two).

item3d hangs it on every copy of the item, wherever it is: lying loose, on a bone of an anim or motion3d body, in a
crowd3d person's hand. Nothing is written by hand:

- The bake's `items` tool hands back `built.fabrics`: each fabric with its `pins`, a pin `on` the item (`item`) or
  the bone of the item that carries it, its `at` in the item's own frame and its `turn` worked out from `across`
  and `down`. The game's bake lays them into its fabrics file (demo_item3d's does).
- The scene names item3d under fabric3d's `attach` and `sources`: `"mods": { "sources": ["anim", "item3d"],
  "attach": "item3d" }` (`plugins/item3d/item3d.fabric3d.ts`). Each copy of an item is a thing of
  `item3d/<item>`, and each fabric the item hangs is held to every one.

## A fabric drawn in a look

A fabric that gives `"look": { "material": "<name>" }` in place of `paint` is drawn by supershader3d's shader in that
material of the scene's looks file (`using-supershader3d`). The scene names `supershader3d` under
`world.fabric3d.mods.behaviors` (`plugins/supershader3d/supershader3d.fabric3d.ts`). The looks read each vertex's
place as the fabric was cut, so a weave stays on the cloth as it folds.

## Tuning and reading it

- The fabrics file is read again when it is written, and every fabric is made again.
- `plugins.fabric3d.fabrics` lists each fabric in the scene, `{ key, fabric, of?, thing?, mesh, columns,
  rows }`. `places(key)` reads one's points back from the GPU: a testbed's readout, which stalls the
  frame it is asked in and is never asked by a game.
- demo_fabric3d's `dev.html` has the wind, the turbulence, gravity, the substep, the passes and every
  fabric's numbers on a panel. `?cam=x,y,z,tx,ty,tz` stands the camera somewhere, `?hold=<n>` pauses at
  step n.

## Shadows and light

A fabric's mesh casts and takes shadows, is marked `userData.moving` and carries its own depth and
distance materials, so three's shadows and lights3d's moving atlas draw it where it is each frame
(`using-lights3d`).

## What it throws

| message | cause |
|---|---|
| `fabric3d is listed after render3d` | the order of `plugins` |
| `the scene names fabric3d but gives no world.fabric3d` | the block is missing |
| `fabric3d draws through render3d, which this scene does not name` / `fabric3d reads its fabrics through loader, which this scene does not name` | `render3d` or `loader` not listed |
| `fabric3d's solids is gpgpu3d's, which this scene does not list` (`wind` and weather3d the same) | the plugin `solids` or `wind` names is not listed |
| `world.fabric3d has <k>, which fabric3d does not know` | a field that is not its own: `capsules` belongs to the body's plugin (`world.anim.kinds.<kind>.capsules`) |
| `world.fabric3d.mods has <k>, and fabric3d's mods are behaviors, solids, sources, wind` | a mod it does not take |
| `fabric3d's solids names ..., and fabric3d takes it from one plugin` | `solids` or `wind` given a list of several |
| `fabric3d has no behavior for the fabric <name>, of the word <w>` | a field of the fabric that is no field of fabric3d's and no word `mods.behaviors` delivers: a misspelt field, or `shapes3d` or `solids` missing from `behaviors` |
| `fabric <name> has no cut` / `has no drawing` / `has the cuts ...` | not exactly one of each |
| `attach <i> holds <fabric> to every <of>, and <fabric> has no pins` | an `of` for a fabric of no pins |
| `attach <i> holds ..., and world.fabric3d.mods names no sources` | `sources` missing |
| `fabric <name> is held to the point <on>, which the <of> <key> has none of` | a pin's `on` the thing has no point of: a bone name, or anything but `pos` on a shape |
| `pin <i> holds the point [c, r], which pin <j> holds` | two pins over one point |

## What goes wrong without a throw

- **Nothing is drawn.** No thing of the attach's `of` is handed: the kind is not one the source draws,
  or the source is not under `mods.sources`. An anim body is handed only once its model and every prop
  its kind names are made. A paint with a `map` is drawn once the loader holds the picture.
- **It falls through everything.** No `mods.solids`, or gpgpu3d does not hold the thing
  (`using-gpgpu3d`).
- **It hangs in the wrong plane, or from the wrong end.** The pin's `turn`, and which edge `from` and
  `to` name: row 0 is the fabric's first row.

## Proving it

`yarn vitest run plugins/fabric3d/fabric3d.plugin.test.ts`, and the test beside each mod:
`plugins/anim/anim.fabric3d.test.ts`, `plugins/motion3d/motion3d.fabric3d.test.ts`,
`plugins/shapes3d/shapes3d.fabric3d.test.ts`. How it looks is judged in the page
(`verifying-3d-visuals`), and what it costs with `benchmarking-a-game`.

## Where to try it

`games/demo_fabric3d`: a flag on a mast, cloths over a table, a drum, a ramp and a slope, capes on X
Bots, a ribbon from a stick, colours from a pole, and a banner towed behind a tug by the game's own
`towing` plugin.
