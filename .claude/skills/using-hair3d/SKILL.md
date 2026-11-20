---
name: using-hair3d
description: Use in core, or any clone of it, whenever hair3d comes up - hair, fur, a beard, a mane, a tail or a coat grown on the skin of a body its bones pose, simulated lock by lock on the GPU - `world.hair3d` (`hairs`, `mods.skins`, `mods.behaviors`, `mods.keeper`, `mods.wind`, `mods.solids`), a hair's `program` of ops (a parting, a bare patch, stripes, long and short patches, `out`'s `cover`, `length`, `combX`, `rootColour` and the rest), the hairs file (`wind`, `gust`, `kinds`, and each hair's `on` with `meshes`, `bones`, `weight`, `cuts`, `planes`, `faces`, then `density`, `strands`, `length`, `width`, `taper`, `thin`, `links`, `segments`, `comb`, `stiffness`, `gravity`, `damping`, `drag`, `clump`, `curl`, `ragged`, `colours`, `vary`, `ao`, `roughness`, `shine`, `translucency`, `shadow`), hair on a body drawn by anim, motion3d, puppet3d or crowd3d, hair lying on a head and shoulders (`capsules`), the hair workshop (`yarn workshop hair3d <game>`), or a game's own bodies wearing hair (`<a>.hair3d.ts`). Also when no hair grows, hair grows on the face or the whole body, hangs through the head or the neck, stands straight out, whips or stretches, pops as a body teleports, or hair3d throws "grows on no skin", "has no behavior for a skin", "grows on skins, and the scene names no world.hair3d.mods.skins", "need a texture ... more than this GPU's" or "is listed after render3d".
---

# Using hair3d

hair3d (`plugins/hair3d/`) grows hair on a model that has none. Each lock is rooted on the skin where
the hairs file says, simulated on the GPU so it hangs, swings as the body moves and blows in the wind,
and drawn as strands made there every frame. It has no row and nothing goes down the wire: every seat
grows the same locks on the same skin, and no rule reads one. The header of `hair3d.sim.ts` and the
README say every number; this is how a scene is put together with it.

## What the scene gives

```json
"loader": { "assets": { "hairs": { "type": "json", "url": "/games/<game>/assets/hairs.json", "preload": true } } },
"hair3d": { "hairs": "hairs", "mods": { "skins": ["anim"], "behaviors": ["render3d"], "keeper": "gpgpu3d", "solids": "gpgpu3d" } },
"gpgpu3d": { "reach": 30, "mods": { "things": ["anim"], "behaviors": ["anim"] } }
```

`plugins` lists `loader`, the plugins that draw the bodies, `gpgpu3d` (every scene with hair: it keeps
the locks, and needs its `world.gpgpu3d.reach`), then `hair3d`, then `render3d`. hair3d listed after render3d throws, and so does a mod naming a plugin
the scene does not list.

| mod | | what it gives |
|---|---|---|
| `skins` | required, a list | who hands the wearers: every body the plugin draws, its kind and its skins |
| `behaviors` | a list | who delivers the word each skin is handed under |
| `keeper` | required | `gpgpu3d`: keeps what each lock and each strand is once it is worked out, and compiles a hair's `program` with it (`using-gpgpu3d`, The keeper) |
| `wind` | optional | `weather3d`: the wind as it gusts now. With none, the hairs file's `wind` |
| `solids` | optional | `gpgpu3d`: what every lock is kept out of. With none, a lock meets nothing |

| bodies drawn by | `skins` | `behaviors` | a wearer's kind is | bone names |
|---|---|---|---|---|
| anim | `anim` | `render3d` | the kind its row's `as` names, else its own | the glb's as three names them, a space an underscore and dots taken out (`tail 5` is `tail_5`) |
| motion3d | `motion3d` | `render3d` | the same | the same |
| puppet3d | `puppet3d` | `render3d` | the row's kind | as its skeleton file gives them (`neck`, `tail 5`) |
| crowd3d | `crowd3d` | `crowd3d` | the body's name in `world.crowd3d.bodies` | the body's |

anim's, motion3d's and puppet3d's skins are three SkinnedMeshes, render3d's word `skinned`. A crowd3d
body's mesh groups are crowd3d's own word `posed`: every person of a body is one wearer, and each mesh
group a hair grows on is one pass and one draw for all of them.

## The hairs file

`wind` and `gust` for every hair of the file, `kinds`, and `hairs`:

```json
"kinds": { "xbot": { "hairs": ["scalp"] } },
"hairs": {
  "scalp": {
    "on": { "meshes": "Alpha_Surface", "bones": ["Head"], "weight": 0.5, "cuts": [{ "bone": "Head", "normal": [0, 0.75, -0.66], "offset": 0.07 }], "planes": [], "faces": [] },
    "density": 9000, "strands": 20,
    "length": [0.3, 0.4], "width": [0.0035, 0.5], "taper": 0.3, "thin": 0.0012,
    "links": 6, "segments": 10,
    "comb": [0, -1.1, -0.7], "stiffness": [12, 0.3],
    "gravity": 9.8, "damping": 2.5, "drag": 1.5,
    "clump": { "radius": 0.012, "tight": 0.6 }, "curl": { "radius": 0.004, "turns": 2 }, "ragged": 0.25,
    "colours": { "root": "#2a160c", "tip": "#8a5a2e" }, "vary": 0.25, "ao": 0.5,
    "roughness": 0.55, "shine": { "strength": 0.1, "power": 60 }, "translucency": 0.3,
    "shadow": true
  }
}
```

A wearer of a kind `kinds` does not list wears none. A kind wears as many hairs as it lists, and the
same hair goes on every body of the kind. `kinds` holds at least one kind, each listing at least one
hair of `hairs`. Every field of a hair is required.

## Where a hair grows: `on`

Every part of `on` narrows where a lock roots, and a lock roots only where all of them pass:

- `meshes`: a regular expression matched against the name of each of the wearer's skins.
- `bones` and `weight`: bones named by the end of their names. A lock roots only where those bones
  together hold at least `weight` of the skin. A `weight` of 0 roots it everywhere on the skins.
- `cuts`: `[{ bone, normal, offset }]`, planes in a bone's frame as the skin was bound. A lock roots
  only where the skin is at least `offset` metres along `normal` from the bone.
- `planes`: `[{ normal, offset }]`, the same in the skin's own frame (+y up, +z ahead).
- `faces`: `[{ toward, within }]`. A lock roots only where the skin's normal is within `within` degrees
  of `toward`.

Three that are in the demos:

| hair | `on` | how it reads |
|---|---|---|
| a scalp (demo_hair3d) | `bones: ["Head"]`, `weight: 0.5`, one cut on `Head` with `normal: [0, 0.75, -0.66]`, `offset: 0.07` | the head bone's skin, above a cut that leaves out the face |
| a coat of fur (demo_hair3d) | `bones: []`, `weight: 0`, nothing else | all of the skin |
| a horse's mane (demo_puppet3d) | `bones: ["neck", "head"]`, `weight: 0.5`, three `planes` (`[1, 0, 0]` and `[-1, 0, 0]`, each `offset: -0.045`, and `[0, 0, -1]`, `offset: -1.5`), `faces: [{ toward: [0, 1, 0], within: 55 }]` | the neck's and head's skin that faces up, within 0.045 m either side of the body's middle and no further than 1.5 m ahead |

The names come from the model: its skinned meshes' names and its bones' are in its glb.

## How it lies and moves

- `comb`: `[x, y, z]` added to the skin's normal, in the skin's own frame as it was bound, to make the
  way a lock lies with nothing pulling on it. `[0, 0, 0]` stands it straight out of the skin; a comb that
  points into the skin lays the lock along it. The scalp is combed down and back, `[0, -1.1, -0.7]`.
- `stiffness`: `[root, tip]`, how hard each link is pulled back to that way, a second. Long hair is
  stiff at the root and loose at the tip (`[12, 0.3]`); short fur is stiff all along (`[60, 12]`).
- `gravity`, `damping` (the share of its speed lost a second) and `drag` (how fast it takes the wind's
  speed).
- `links`: the points a lock is simulated with, from 1 to 16. The scalp has 6, the fur 2.
  `segments`: the pieces a strand is drawn in along the curve through them.

## How many, and how it looks

- `density`: locks a square metre of the skin it grows on. `strands`: strands drawn a lock. A lock is
  simulated; its strands are only drawn. One hair roots at most 65536 locks on one skin, and throws
  past it.
- `length` and `width`: `[base metres, spread]`. `taper`: the share of its width left at the tip.
  `thin`: the least width a strand is drawn, in metres a metre from the eye, so a far strand is not
  thinner than a pixel.
- `clump` `{ radius, tight }`: a lock's strands root within `radius` of it and close toward the tip.
  `curl` `{ radius, turns }`: each strand winds round its lock. `ragged`: the share of the lock's length
  a strand may fall short by.
- `colours` `{ root, tip }`, `vary`, `ao` (darker at the root), `roughness`, `shine` `{ strength, power
  }` (the highlight across the strands), `translucency` (light through hair lit from behind), `shadow`
  (true or false).

The strands are a dressed standard material, so the sky's fog, lights3d's lights and the shadows reach
them. Their mesh is marked `userData.moving`, so lights3d draws its shadow every frame
(`using-lights3d`).

A change to `on`, `density`, `strands`, `length`, `links`, `segments`, `shadow` or `program` roots and
builds the hair again. Every other number is read as it draws.

## A program: a pattern over the skin

A hair's `program` is a program of gpgpu3d's ops (`using-gpgpu3d`, Ops), run for each lock at its root on
the skin as it was bound, in metres, so a pattern stays put on the body as it moves. Each name of its
`out` works on one field, and a name it does not give leaves the field as the file has it.

| `out` | what it does |
|---|---|
| `cover` | 0 to 1, the share of the locks that stand. 0 is bare skin: a parting, a hairline, a patch |
| `length`, `width`, `taper`, `ragged`, `clumpRadius`, `clumpTight`, `curlRadius`, `curlTurns` | multiply the lock's shape |
| `combX`, `combY`, `combZ` | added to `comb`: a swirl, a cowlick, a parting |
| `stiffnessRoot`, `stiffnessTip`, `gravity`, `damping`, `drag` | multiply how it moves |
| `vary`, `ao`, `roughness`, `shineStrength`, `shinePower`, `translucency` | multiply its look |
| `rootColour`, `tipColour` | a colour: `{ r, g, b }` of nodes, or a tint `{ "to": "#d02020", "by": <node> }` of the hair's own |

- `roll` (`salt`) is the lock's own random number.
- `freq` is cycles a metre of skin: 6 is a patch about 17 cm across.
- What a program gives is worked out once for each lock and kept. A name that reads `time` is worked out
  each frame.
- `bodies()` gives each patch's `kept`, `{ locks, strands }`, how many times each was written: 1 each
  until a number of the hair changes.

## What hair lies on

A lock's first link is always kept above the skin under its root. Everything else is the `solids` mod's:
`"solids": "gpgpu3d"`, and gpgpu3d holding the things (`using-gpgpu3d`). Long hair lies on its wearer's
head, neck and shoulders only when the wearer's kind gives capsules and balls for them:

- anim: `world.anim.kinds.<kind>.capsules`, with `"things": ["anim"], "behaviors": ["anim"]`.
  demo_hair3d's X Bot:
  ```json
  "capsules": [
    { "bone": "Head", "at": [0, 0.09, 0.015], "radius": 0.105 },
    { "bone": "Neck", "at": [0, 0.03, 0], "radius": 0.065 },
    { "bone": "Spine2", "at": [0, 0.04, 0], "radius": 0.17 },
    { "bone": "LeftArm", "at": [0, 0.02, 0], "radius": 0.075 },
    { "bone": "RightArm", "at": [0, 0.02, 0], "radius": 0.075 }
  ]
  ```
- motion3d: `world.motion3d.kinds.<kind>.capsules`, with `"things": ["motion3d"], "behaviors": ["anim"]`.
- puppet3d: `world.puppet3d.capsules.<kind>`, with `"things": ["puppet3d"], "behaviors": ["anim"]`.
  demo_puppet3d's horse is three balls, on `neck`, `chest` and `pelvis`.
- crowd3d's people hand gpgpu3d nothing, so their hair meets no body: demo_puppet3d's `herd` scene names
  no `solids`.

With shapes3d or terrain3d under gpgpu3d's `things`, hair lies on shapes and the land too. Where it is
not to, `world.gpgpu3d.meets.hair3d` names what it meets.

## The clock, and a teleport

The locks are moved the moment render3d first draws the scene in a frame, when every bone stands where
it is drawn, a frame never longer than a thirtieth of a second. A lock whose root is more than a metre
from where it was the frame before is laid afresh where it lies with nothing on it, not swung: a
teleport or a respawn needs no flag for its hair.

## Tuning: the hair workshop

`yarn workshop hair3d <game>` opens `/hair3d?game=<game>`: each hair of the game's hairs file grown by
hair3d on a test subject (`head`, `ball`, `neck`, `dock`, `body`, `pelt`) that is moved, turned and run
forward (`still`, `walk`, `run`, `nod`, `shake`, `toss`, `shove`, `spin`), every number a slider, changed
as it draws and saved into the file. `&file=<repo path>` picks one of several hairs files, and
`&hair=<name>&subject=<name>&motion=<name>` opens on one.

- How a hair hangs, swings, clumps, curls and is coloured is tuned there, and the numbers of the nodes of
  its `program` (a frequency, a salt, a threshold): its own group in the right column, each slider in the
  range its op gives it. The ops, the wiring and the `out` are written in the file, not added there. A
  save compiles each hair's program over the ops the game's scene delivers, so a number an op refuses
  is not written.
- Where it grows in the game, its `on`, is not shown or changed there: the subject grows it where the
  subject says. `on` is written in the file and looked at in the game.

`tools/workshop/README.md` says every control (`asset-workshop`). In the game, the hairs file is checked
again whenever it is written, so a `dev.html` panel changes it live: demo_hair3d's has every number of
each hair and of the wind.

## Reading it

`plugins.hair3d` hands out `bodies()` (`[{ id, kind, patches: [{ hair, skin, locks, strands, copies,
room, wide, high }] }]`), `roots(id, hair)` (where that wearer's locks are rooted) and `state(id, hair)`
(the target its locks stand in now, read with the renderer's `readRenderTargetPixels`), for a readout
and a test. A wearer's `id` is `anim <row id>`, `motion3d <row id>`, `puppet3d <row id>` or
`crowd3d <body>`.

## A game's own bodies

A game whose own plugin draws skinned bodies hands them over with
`games/<game>/plugins/<a>/<a>.hair3d.ts`, exporting `skins(plugins)` → `[{ id, kind, skins }]`, each
skin `{ skinned: <a three SkinnedMesh> }`, with `<a>` under `world.hair3d.mods.skins`, `render3d` under
`behaviors` and `<a>` in `world.shipped.plugins`. The hair workshop's
`tools/workshop/plugins/subjects/subjects.hair3d.ts` does this for its subjects. A body that is not a
three SkinnedMesh is a word of the game's own: the same file exports `behaviors()`, as
`plugins/crowd3d/crowd3d.hair3d.ts` does for `posed`.

## A pro-ng kit item's hair

A kit kind of the library's pro-ng says its own hair: its `<kind>.hairs.json` holds hairs with every field here but
`on`, and its file names the part each grows on. pro-ng's build writes them beside the glb as `<name>.hairs.json`:
`hairs`, and `grows`, each `{ thing, row, part, number, hair }` (the library's `pro-ng/KIT.md`, "Hair"; the kind
`item3d_test_item` grows two).

item3d grows it on every copy of the item, wherever it is: lying loose, on a bone of an anim or motion3d body, in a
crowd3d person's hand. Nothing is written by hand:

- The bake's `items` tool hands back `built.hairs`, `{ kinds, hairs }`: each hair with its `on` the item's parts
  that grow it, and each item's wearers' kind, `item3d/<item>`, to its hairs. The game's bake lays both into its
  hairs file (demo_item3d's does).
- The scene names item3d under hair3d's `skins` and `behaviors`: `"mods": { "skins": ["anim", "item3d"],
  "behaviors": ["render3d", "item3d"], "keeper": "gpgpu3d" }` (`plugins/item3d/item3d.hair3d.ts`).
- Each part that grows hair is a skin of its own, named `<row> <part>`. Every stiff copy of an item is one wearer,
  drawn in one draw; a copy with bones of its own is a wearer by itself, and hair on a part a bone carries moves
  with that bone.

## A hair drawn in a look

A hair that gives `"look": "<material>"`, a material of the scene's looks file (`using-supershader3d`), is drawn by
supershader3d's shader in that material, in place of its `colours`, `vary`, `ao`, `roughness`, `shine` and
`translucency`. The scene names `"looks": "supershader3d"` in `world.hair3d.mods`
(`plugins/supershader3d/supershader3d.hair3d.ts`). The hair is grown once the looks have landed.

## What it throws

| message | cause |
|---|---|
| `hair3d grows on skins, and the scene names no world.hair3d.mods.skins` | `skins` missing |
| `hair3d keeps what each lock is once it is worked out, and the scene names no world.hair3d.mods.keeper` | `keeper` missing: name `gpgpu3d`, list it and give it `world.gpgpu3d.reach` |
| `hair3d hair <name> program node <k> (<id>) ...` / `... out <x> is none of cover, length, ...` | a node or an `out` gpgpu3d's compiler refuses: the sentence names the node, the field and what it should be |
| `hair3d's <mod> is <a>'s, which this scene does not list` | a plugin a mod names is not in `plugins` |
| `hair3d is listed after render3d` | the order of `plugins` |
| `hair3d has no behavior for a skin of <who>, of the word <word>` | `behaviors` lacks `render3d` (for `skinned`) or `crowd3d` (for `posed`) |
| `hair3d hair <name> grows on no skin of <id>, of kind <kind>: its on.meshes ... matches none of ...` | the hair's `meshes` matches none of the wearer's skins; the message lists their names |
| `hair3d hair <name> roots nowhere on the skin: its on ... leaves no part of it` | `bones`, `weight`, `cuts`, `planes` and `faces` together leave no skin on a skin its `meshes` matches |
| `hair3d hair <name>: on.bones names the bone <b>, and no bone of the skin ends with it` | a bone under `on.bones`, or a cut's `bone`, the skin does not have |
| `hair3d hair <name> roots <n> locks on one skin, more than the 65536 it holds` | `density` too high for the skin's area |
| `hair3d draws through render3d` / `hair3d reads its hairs file through the loader` / `world.hair3d.hairs ... is not the name of the hairs file` | `render3d` or `loader` not listed, or `hairs` no catalogue name |
| `hair3d was handed the wearer <id> twice by its skins mods` | two `skins` mods hand one id |
| `hair3d: a skin of <who> gives <n> words` | a skin handed under more than one word |
| `hair3d: the mesh <name> has no position, normal, skinIndex or skinWeight to root hair on` | a skinned mesh without them |
| `hair3d hair <name> on <id>: <n> copies of <m> locks need a texture ... more than this GPU's` | a crowd's copies times its locks: lower `density` or `links` |
| `hair3d: the hairs file's <what> <value> is not <what it is>` | the first value of the file that is wrong, with what it has to be |

## What goes wrong without a throw

- **No hair.** Nothing is grown until the hairs file has landed. Then: the wearer's kind is not under
  the file's `kinds`. For anim and motion3d that is the kind the row's `as` names, where it names one.
- **Hair hangs through the head or the shoulders.** No `solids`, gpgpu3d does not hold the body's
  capsules, or the kind gives none there.
- **Hair on the face, or all over the body.** `on` has nothing that leaves it out: a `weight` of 0
  roots everywhere, and a scalp with no cut covers the whole of the head bone's skin.

## Proving it

`yarn vitest run plugins/hair3d/hair3d.sim.test.ts`, `plugins/hair3d/hair3d.plugin.test.ts`, and the
test beside each mod: `plugins/anim/anim.hair3d.test.ts`, `plugins/motion3d/motion3d.hair3d.test.ts`,
`plugins/puppet3d/puppet3d.hair3d.test.ts`, `plugins/crowd3d/crowd3d.hair3d.test.ts`,
`plugins/render3d/render3d.hair3d.test.ts`, `plugins/weather3d/weather3d.hair3d.test.ts`. How it looks
is judged in the page (`verifying-3d-visuals`), and what it costs with `benchmarking-a-game`.

## Where to try it

`games/demo_hair3d`: an X Bot with long hair walked round a yard among X Bots in fur. `games/demo_puppet3d`:
a horse with a mane and a tail and a lion with a mane, on puppet3d's bodies in its paddock and on
crowd3d's in its herd (`dev.html?scene=herd`), each scene with a hairs file of its own.
