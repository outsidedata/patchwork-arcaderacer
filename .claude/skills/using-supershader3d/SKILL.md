---
name: using-supershader3d
description: Use in core, or any clone of it, whenever supershader3d, pro-ng or world3d comes up - drawing a 3D scene in the library's pro-ng looks (one shader, every material behind one switch, at most three draw calls), the looks file (`<name>.looks.json`, `world.supershader3d.looks`, `materials`, `calls`, `settings`, `needs`, `pictures`), baking it (`yarn bake <game>`, the bake's `looks` tool, pro-ng's `build.mjs`, `packLooks`, `scripts/pack-looks.ts`), a material or a look (`materials.json`, `pro-ng/material/looks/<look>.js`), tagging geometry with `lookId`, `lookInfo` and the slots `s0`-`s3`, a shapes3d or solids `look` paint, a terrain3d `look` ground layer, a glowing material and the glowmap, the course table (`courses`, `csCourses`), world3d's place (`world.world3d.place`, its parts glb, looks, clips, shapes3d, nav, hollows, effects, crowd, its catalogue entries, its mods for supershader3d, shapes3d, nav3d, lod3d and npc3d, its clips and people), and a pro-ng kit thing or scene in a game with no world3d.
---

# Using supershader3d

supershader3d (`plugins/supershader3d/`) draws every surface of a scene with one shader: every material is a look of
the library's pro-ng, put together at bake time, every vertex carries its material's number, and the whole scene is
drawn in at most three calls. Its README says every setting and what it hands out; its header is the source. This
skill is how the pieces fit: pro-ng, the bake, world3d, and the scenes that use none of world3d.

## pro-ng

pro-ng is the library's place maker (`$PATCHWORK_LIBRARY/pro-ng/`, `~/patchwork-library` by default). Its own
`README.md`, `ONE-SHADER.md` (how the one shader works, end to end) and `material/LOOKS.md` (how a look is written)
are where to read more.

- **A look** is one file, `pro-ng/material/looks/<look>.js`: its settings (`params`), the pictures it reads, its GLSL
  `body` that fills a `Look` struct (colour, roughness, metalness, height, normal, cavity, glow, clear coat, sheen,
  thin film, light through), and optionally a `vertex`, a `shadow` (which puts it in the relief call) and
  `seeThrough`. 251 looks, 8 of them reading a photo texture (`concrete`, `fast_stone`, `garage_slab`, `rock`,
  `tarmac`, `timber`, `wall_stone`, `wall_wood`), counted 2026-11-09; the rest are noise and arithmetic.
- **A material** is a look and the settings it gives over the look's own, and a flat colour for the debug view. pro-ng's
  own scenes take theirs from `pro-ng/materials.json`. A game's bake can name any look with any settings.
- **`compose.js`** takes a scene's materials and writes the GLSL of each draw call: every material's body as
  `look_<id>`, behind one `switch` in `lookRun(id)`, grouped into `solid`, `relief` (a look with a `shadow`) and
  `seeThrough`.
- **A place.** pro-ng's scenes (`pro-ng/scenes/`) are buildings, rooms and towns stated as JSON, and kit things
  (furniture, fittings, props), each kind a Python file in `pro-ng/kit/` built in Blender from its numbers.
  `pro-ng/build.mjs <scene> <out>` cuts a scene into every file a game boots from: `<name>.glb` (every mesh, each
  vertex its material's number and slots, packed by `pack.mjs`, which keeps the attributes gltfpack drops),
  `<name>.looks.json` and its pictures in `looks/`, `.clips.json`, `.shapes3d.json`, `.terrain3d_layers.json`,
  `.hollows.json`, `.effects.json`, `.hairs.json` (the hair each kit thing grows and the part it grows on),
  `.fabrics.json` (the cloth each hangs and its pins), `.nav.json` and `.crowd.json`. For a kit item, the bake's
  `items` tool reads its effects, hairs and fabrics files and item3d burns, grows and hangs them on every copy of
  the item (`plugins/item3d/README.md`). The library's `stronghold/build.mjs` compiles a
  solver's run into a pro-ng scene and then runs the same steps (demo_world3d's village, tavern and hills).

A game never loads the library. Its bake reads the library and writes files into the game's `assets/`, and the game
ships those. A look changed in the library reaches a game only when the game is baked again (`yarn bake <game>`).

## The game bakes it; world3d is optional

Everything supershader3d draws comes from a looks file the game's bake wrote. world3d is one way to use it, for a
whole pro-ng place. A scene with no world3d uses supershader3d the same way: a looks file in its catalogue,
`world.supershader3d.looks` naming it, and geometry tagged with the materials' numbers.

| The scene wants | Its bake | It draws through | Example |
|---|---|---|---|
| materials of its own choosing, on blocks, posts, paths, ground, its own meshes | the bake's `looks` tool | shapes3d and solids' `look` paints, terrain3d's `look` layers, its own tagged geometry | `games/demo_supershader3d` |
| a pro-ng kit thing or scene that stands still | pro-ng's `build`, then `packLooks` or the `looks` tool | a plugin of the game's own that reads the glb (demo_lights3d's `prong`) | `games/demo_lights3d`, `glow` scene |
| a whole pro-ng place: walked on, routed over, its things moving, its people | pro-ng's (or stronghold's) `build`, every part copied in | world3d | `games/demo_world3d`, `games/demo_library` |

A scene has one looks file. Every material it draws is in it, whichever route made it.

### Materials of the game's own: the `looks` tool

```ts
// games/<game>/assets/<game>.bake.ts
import path from 'node:path'
import type { Tools } from '#scripts/bake.ts'
const here = import.meta.dirname
export default async ({ looks }: Tools) => {
  await looks({
    materials: {
      grass: { look: 'grass', colour: '#2679e6' },
      timber: { look: 'timber', colour: '#8a5a2b', settings: { repeat: 1 } },
    },
    out: path.join(here, 'main.looks.json'),
    pictures: path.join(here, 'looks'),
  })
}
```

`materials` are in the order their numbers count (a vertex's `lookId`). The tool composes them with the library's
`compose.js`, moves every setting into the settings table (`packLooks`), cuts every picture the looks read to 1024
square WebP into `pictures` (downloading its cc0-textures set into the library first when it is missing), and
writes `out`. List each picture in the scene's catalogue by its `asset` name: a colour picture plain, every other
with `"space": "linear"`, each `"wrap": "repeat"` and `preload`ed (`games/demo_supershader3d/main.scene.json`).

Then draw in it:

- a shapes3d kind `"look": { "look": "timber", "sides": 12 }` (a cylinder needs `sides`, a plane `thick`), with
  `"solids": { "mods": { "models": "shapes3d", "looks": "supershader3d" } }`;
- a solids model's paint `{ "look": "<material>" }`, with no colour, map, roughness, metalness, glow, blink or
  opacity beside it;
- a terrain3d ground layer `{ "name": "grass", "look": "grass" }`, with `"terrain3d": { "mods": { "behaviors":
  ["supershader3d"] } }`;
- a game's own mesh: every vertex given `lookId` (`plugins.supershader3d.idOf(name)`) and `lookInfo` (that number, a
  number of the thing's own, a part number), its `uv` in metres, its material `plugins.supershader3d.material(
  plugins.supershader3d.callOf(name))`, set once `looks()` has landed. `plugins/supershader3d/bench/swatch.client.ts`
  is the smallest whole example; demo_lights3d's `stage.client.ts` (`wearing`) does it to a Mixamo body, whose
  glow then lights the room through the glowmap.

### A pro-ng thing outside world3d

`games/demo_lights3d/assets/demo_lights3d.bake.ts`: it imports the library's `pro-ng/build.mjs` and runs
`build(scene, out, blender)` with the bake's own Blender, copies the glb and the looks file in, and composes the
looks again with the `looks` tool to add a material only its people wear: the glb's materials first, in the order
its looks file lists them (the order its vertices count them), then the new ones. A looks file straight out of pro-ng
holds `uniforms` in place of `settings`; one shipped as it is must go through `packLooks` (`scripts/pack-looks.ts`)
first, as demo_world3d's bake does.

The glb is drawn by the game's own plugin, `games/demo_lights3d/plugins/prong/prong.plugin.ts`, loaded by `shipped`:
`mesh(glb)` reads the glb's node `pro-ng` (its extras' `vertex`: the meshes, each shader input's attributes, each
input's default), puts every mesh in one geometry, and groups its triangles by call. It refuses a glb whose kit
moves: only world3d plays a skin, its animations and morph targets.

What only world3d gives:

- **The course table.** The wall looks `wall_stone`, `wall_wood` and `fast_stone` read `courses` (`csCourses`), each
  building's course heights and wall thickness. world3d makes it and fills it from its glb's extras. A scene with
  one of those looks and no world3d throws `supershader3d has no behavior for the shared texture courses`, unless a
  plugin of the game's own delivers `courses` through `world.supershader3d.mods.behaviors` (it exports
  `behaviors(plugins)` → `{ courses: plugins => texture }`, as `plugins/world3d/world3d.supershader3d.ts` does).
- **Moving kit**: the skin, the clips, the morph targets.
- **The place's other files**: walk shapes, the nav graph, the hollows, the effects, the people.

### A place: world3d

world3d (`plugins/world3d/`, its header in `world3d.sim.ts`) is a pro-ng place in a scene. The place is no row: its
one row, the `world3d` actor, spawns the place's people on its first step. The scene names the place, and world3d
hands each file pro-ng wrote for it to the plugin that uses it, so nothing of the place is wired by hand.

`world.world3d.place` is the place's name as pro-ng's build names it (`smallville.town`, `tavern.art`). Every part is
a catalogue entry named `<place>.<part>`, each `preload`ed:

| Part | Entry | Who reads it |
|---|---|---|
| `glb` | `binary` | world3d's browser half: unpacks it, builds one mesh in supershader3d's three calls, plays its clips |
| `looks` | `json` | supershader3d, through world3d's `looks` mod |
| `clips` | `json` | world3d's browser half: every moving thing's clips, played on the mesh by one mixer |
| `effects` | `json` | world3d's browser half: particle3d effects burning for as long as the place is drawn |
| `shapes3d` | `json` | shapes3d, through world3d's `shapes` mod: what a body stands on and bumps into |
| `nav` | `json` | nav3d, through world3d's `graphs` mod, as the graph `place` |
| `hollows` | `json` | lod3d, through world3d's `hollows` mod: no grass, tree or stone inside a building |
| `crowd` | `json` | the `world3d` actor, which spawns a row of `world.world3d.people` for each person, and npc3d's `loiter` and `transfer` behaviours through world3d's `behaviors` mod |

The browser half reads `glb`, `clips` and `effects` on its first tick, and supershader3d reads `looks`. The others
are read only where the scene names world3d in that plugin's mods, or has the `world3d` actor. The scene's side:

```json
"world3d": { "place": "smallville.town", "people": "person" },
"supershader3d": { "mods": { "looks": "world3d", "behaviors": ["world3d"] } },
"shapes3d": { "mods": { "shapes": ["world3d"] } },
"nav3d": { "mods": { "graphs": ["world3d"] } },
"lod3d": { "mods": { "hollows": ["world3d"] } },
"npc3d": { "mods": { "behaviors": ["world3d"] } }
```

with `world3d` in `plugins` after supershader3d and particle3d, as demo_world3d's scenes list it. For the people: the
`world3d` actor, its prefab `{ "peopled": false }`, and `world3d` in the scene's sim.

**The bake writes the scene's side.** `games/demo_world3d/assets/demo_world3d.bake.ts` builds each place, copies every
part in, renames the crowd's clips and models to the rig's names, runs `packLooks` on the looks file, copies the
pictures, writes `world.world3d.place` and an entry for every part (`PARTS`, `world3d.sim.ts`), lists every picture,
and lays the place's flatten into the terrain3d field's `layers`. A new world3d game copies that bake's shape.

**Clips.** A kit thing that moves (a tavern's ceiling fan) is part of the one mesh, skinned. Each clip of the clips
file whose `start` is `on` plays from the moment the place is built. A game starts and stops one by its thing's name
and its own, `plugins.world3d.clip('tavern/tavern fan', 'spin', true)`, `false` to stop it.

**The course table.** `plugins.world3d.courses(three)` is one float texture, a row for each thing and look that
courses it; the place's rows are written into it as the place is built. supershader3d binds it as `courses`.

## Where to read

- `plugins/supershader3d/README.md`, and `supershader3d.plugin.ts`'s header: the looks file, what it makes, what it
  hands out.
- `plugins/supershader3d/supershader3d.solids.ts`, `.terrain3d.ts`, `.lights3d.ts`, `supershader3d.glowmap.ts`: its
  mods and the glowmap.
- `plugins/world3d/world3d.sim.ts` (the parts, the people, the scene's side), `world3d.plugin.ts` (the place, the
  course table, the clips, the effects), `world3d.place.ts` (the glb and the clips unpacked), and its mods beside them.
- `scripts/bake.ts` (the `looks` tool) and `scripts/pack-looks.ts`.
- The library's `pro-ng/README.md`, `pro-ng/ONE-SHADER.md`, `pro-ng/material/LOOKS.md`, `pro-ng/build.mjs`.
- The games: `demo_supershader3d` (materials only), `demo_lights3d` (a kit thing and a dancer outside world3d,
  glowing), `demo_world3d` (places), `demo_library` (pro-ng's builds and materials drawn through world3d).
