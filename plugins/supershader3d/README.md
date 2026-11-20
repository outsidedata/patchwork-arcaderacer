# supershader3d

One shader for every surface of a 3D scene. Every material the scene uses is a look of the library's pro-ng, put
together at bake time into one shader per draw call. Every vertex carries the number of its material, so a whole
scene, however many materials it uses, is drawn in at most three calls: the solid looks, the relief looks (a parallax
with the sun's shadow marched inside it), and the see-through looks. Every photo texture any of the looks reads is
one layer of one texture array.

## Why use it

In three.js each material is its own program with its own textures and its own draw call, so a town of fifty
materials is fifty programs, each mesh split by material, and a texture unit for every map. supershader3d draws the
same town as one mesh: pro-ng's library holds 251 looks, 243 of them noise and arithmetic with no picture at all
(counted 2026-11-09), and a scene names the ones it uses. pro-ng's JOURNAL.md records its town as 16 materials of 14 looks, 9 pictures in one
stack and 3 draw calls.

Use it for anything a game draws in pro-ng's looks: a place pro-ng built (through world3d), a kit thing pro-ng cut,
shapes3d's and solids' blocks and posts, terrain3d's ground layers, or a game's own geometry (a body, a floor)
tagged with a material's number. A scene needs no world3d to use it. It needs a looks file, which the game's bake
writes.

## How it works

supershader3d has no row and no server half. Its numbers are the scene's `world.supershader3d`, read off the page's
own scene. It reads one file through the loader, the looks file. It builds on render3d, which it takes out of
`plugins`.

### The looks file

The looks file is JSON that a bake writes (Getting a looks file, below), never a person. It holds:

- `materials`, in the order a vertex's `lookId` counts them, each `{ name, look, call, colour }`: its look's name in
  the library, the draw call that draws it (`solid`, `relief` or `seeThrough`), and its flat colour for the debug
  view.
- `calls`, each call's GLSL, `{ ids, fragmentPars, features }` or null where no material is drawn by it, and `all`,
  every material behind one switch, for a program that draws any of them (terrain3d's ground, the glowmap's pass).
- `vertexPars` and `vertexMain`, the vertex side.
- `settings`, every material's settings, `{ width, materials }`, `materials[id]` its list of `{ name, type, value }`.
- `needs`, the shared textures the looks read: `noise`, `random`, `courses`.
- `pictures`, the stack's layers in order, each `{ asset, file, set, source, colour }`, `asset` the catalogue name
  of a `texture` entry, each cut by the bake to `picture` pixels square (1024).

### What it makes

On the first tick the file has landed, it makes:

- **One `MeshPhysicalMaterial` for each call that draws anything**, dressed by render3d (so every splice the scene's
  plugins register reaches it), then patched. The looks' preamble goes right before `void main`. `lookRun(id)` runs
  after `map_fragment` and fills a `Look` struct. Its colour, alpha, roughness, metalness, normal (the look's own, or
  its height bent into the normal), glow and cavity replace three's. three's `lights_physical_fragment` and
  `transmission_fragment` are swapped to read the look's ior, clear coat, sheen, thin film, dispersion and light
  through. In `lights_fragment_begin` the sun's light is multiplied by `lookShadow(id, direction)`, the relief looks'
  shadow inside their own relief. Each chunk's text is checked against three's as the materials are made, so a three
  that changed one throws then, naming it. A feature of three's (clear coat, sheen, iridescence, dispersion,
  transmission) is turned on for a call only when one of its looks writes it.
- **`lookPictures`**, one `DataArrayTexture` of every picture, once each has landed or failed (a failed one is a
  black layer), with repeat wrap, trilinear mips and the GPU's anisotropy, and `lookMeans`, each colour picture's
  mean linear lightness, which a look reads to take a picture grey before tinting it.
- **`lookSettings`**, every setting of every material in one float texture, a row a material and a texel a setting.
  A GPU holds only so many uniforms a program, and a scene of many materials passes it, so no setting is a uniform:
  the bake writes each look to read its settings with `texelFetch(lookSettings, ivec2(<slot>, <id>), 0)`. The
  program holds one sampler however many settings the scene has.
- **The shared textures** the file `needs`: `noise` (`csNoise`, a 256 square tiling value noise) and `random`
  (`cbRand`, a 256 square table of random numbers) are its own; every other word is delivered by a plugin the scene
  names in `world.supershader3d.mods.behaviors`. `courses` (`csCourses`, the buildings' course table, which the
  library's wall looks `wall_stone`, `wall_wood` and `fast_stone` read) is world3d's. A need nothing delivers throws,
  naming the word.
- **`lookTime`**, the looks' clock, seconds since the file landed, on by the engine's `dt` each tick, which a look
  that moves reads on either side.

### What a vertex carries

A geometry drawn by one of its materials carries on each vertex:

| attribute | what |
|---|---|
| `lookId` | its material's number in the looks file |
| `lookInfo` | three numbers a look seeds itself from: its material, its thing's row, its part, so no two parts are alike |
| `uv` | in metres, so one setting means the same size on every part |
| `s0` (3), `s1` (3), `s2` (4), `s3` (2) | the slots, whatever the look's geometry hands it; a vertex without one reads zeros |

Every triangle of a mesh drawn by these materials goes in the group of its material's call, and each group is
drawn by `material(call)`. world3d and solids do this for what they draw. A game drawing its own geometry sets
`lookId` and `lookInfo` on it and hands it the material of its call (Drawing with it, below).

### The glowmap

With `world.supershader3d.glowmap: { resolution, cells: [across, up] }`, the glow the camera sees is made each frame
into one float texture. The scene is drawn again at `resolution` of the frame, each glowing pixel's glow worked out
by its material's own `lookRun`, and summed into `cells`, each its power, area, place and facing. lights3d lights
the scene from it through `supershader3d.lights3d.ts`, so a thing in a glowing material lights the room by being
drawn. A skinned or morphed mesh is drawn posed. Glow off the screen or behind something is not in it.
`supershader3d.glowmap.ts` says the texture's layout. It needs the file's `all` call.

## Using it

### 1. Getting a looks file

A game ships the looks file and its pictures, and never loads the library. Each of these runs in the game's bake,
`assets/<game>.bake.ts`, run by `yarn bake <game>` (`scripts/bake.ts`):

- **Materials of the game's choosing**: the bake's `looks` tool, `looks({ materials, out, pictures })`. `materials`
  is `{ <name>: { look, settings?, colour? } }` in the order their numbers count, each `look` a file of the library's
  `pro-ng/material/looks/`. It writes `out` with its settings already in the table, and cuts every picture the looks
  read to 1024 square WebP into `pictures`, each named after its file. `games/demo_supershader3d/assets/` does this.
- **A pro-ng scene or kit thing**: the library's `pro-ng/build.mjs`, `build(scene, out, blender)`, handed the bake's
  own Blender. It writes the scene's glb and its `<name>.looks.json` beside it, its settings still uniforms: run
  `packLooks` (`scripts/pack-looks.ts`) on it before the game ships it. To add materials the glb does not draw (a
  glowing look a person wears), compose it again with the `looks` tool, the glb's materials first in the order the
  file lists them, then the new ones after. `games/demo_lights3d/assets/demo_lights3d.bake.ts` does both.
- **A place for world3d**: the same build, every part of it copied in, its looks packed, and the scene's catalogue
  and `world.world3d.place` written by the bake. `games/demo_world3d/assets/demo_world3d.bake.ts` does it.

Each picture of the file is listed in the scene's catalogue as a `texture` entry named by its `asset`, colour
pictures in sRGB and every other `"space": "linear"`, `"wrap": "repeat"`, `preload`ed. A bake can write the entries
(demo_lights3d's and demo_world3d's do) or the scene lists them by hand (demo_supershader3d's does). A change to a
look in the library reaches a game only when the game is baked again.

### 2. The scene

```json
"loader": { "assets": {
  "looks": { "type": "json", "url": "/games/<game>/assets/main.looks.json", "preload": true },
  "Rock013_4K_Color": { "type": "texture", "url": "/games/<game>/assets/looks/Rock013_4K_Color.webp", "wrap": "repeat", "preload": true }
} },
"supershader3d": { "looks": "looks" }
```

with `supershader3d` in `plugins`, render3d listed, and supershader3d before every plugin that reads it (solids,
terrain3d, lights3d, world3d), which solids and terrain3d check with `ahead`. A scene has one looks file. For
world3d's place, the `looks` mod names it in place of `looks`, and world3d delivers `courses`:

```json
"supershader3d": { "mods": { "looks": "world3d", "behaviors": ["world3d"] } }
```

### 3. Drawing with it

- **shapes3d and solids.** A shapes3d kind's `look: { look: <material> }` (with `sides` for a cylinder, `thick` for a
  plane), or a solids paint `{ look: <material> }`, is drawn in that material, given
  `"solids": { "mods": { "models": "shapes3d", "looks": "supershader3d" } }` (`supershader3d.solids.ts`). A paint
  that wears a look gives no colour, map, roughness, metalness, glow, blink or opacity, since the look works those out.
- **terrain3d.** With `"terrain3d": { "mods": { "behaviors": ["supershader3d"] } }`, a ground layer
  `{ name, look: <material>, where?, noise?, edge?, warp? }` is drawn by that material
  (`supershader3d.terrain3d.ts`). The ground is a standard material, so a look's clear coat, sheen, thin film and
  light through do not reach it.
- **world3d.** A place pro-ng built, drawn whole, each call by its material (`plugins/world3d/world3d.sim.ts`).
- **A game's own geometry.** Set `lookId` (the material's number, `idOf(name)`) and `lookInfo` on every vertex, its
  `uv` in metres, and draw it with `material(callOf(name))`. The bench's swatch (`bench/swatch.client.ts`) and
  demo_lights3d's glowing dancer (`stage.client.ts`) do this.
- **A pro-ng glb that stands still**, outside world3d: demo_lights3d's own plugin, `plugins/prong/prong.plugin.ts`,
  reads the glb's node `pro-ng` and makes one mesh in the three calls. It refuses a glb whose kit moves.

### What it hands out

| | |
|---|---|
| `material(call)` | the call's material, undefined before the file lands or where the call draws nothing |
| `idOf(name)`, `callOf(name)` | a material's number and call by its name, undefined for a name the file does not hold |
| `looks()` | the file |
| `glsl()` | the `all` call's preamble with its vertex side's varyings made plain globals, for another plugin's program that sets them itself |
| `uniforms` | the one set every material and such a program binds: `lookView` (0 shaded, 1 each piece its own colour, 2 the relief, 3 the normal), `lookDebug` (1 draws every material in its flat colour), `lookTime`, `lookPictures`, `lookMeans`, `lookSettings` and the shared textures |
| `setting(material, name)`, `set(material, name, value)` | a setting's value, a number or `[r, g, b]`, and a new one written into the table for the next frame; each throws on a material or setting the file does not hold, `set` on a value of the wrong type |
| `ready()` | the file has landed and every picture has landed or failed |
| `glowmap()` | `{ texture, cells }` as the last frame drew it, undefined without one |

`close` disposes every material and texture it made and gives the scene its hooks back.

## Plugins it works with

- **render3d**: dresses its materials, so every splice reaches them.
- **world3d**: hands it a place's looks file (`looks` mod) and the course table (`courses`), and draws the place in
  its materials.
- **solids** and **shapes3d**: a look paint, through `supershader3d.solids.ts`.
- **terrain3d**: a look ground layer, through `supershader3d.terrain3d.ts`.
- **lights3d**: lights the scene from its glowmap, through `supershader3d.lights3d.ts`.
