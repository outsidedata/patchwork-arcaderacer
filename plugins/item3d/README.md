# item3d

Kit items of the library's pro-ng in a game: a wrench, a helmet, a lantern, each one kit kind built with its keys,
drawn in supershader3d's one shader. world3d is a place, everything that stands still and is stood on. item3d is the
things that move: lying loose in the scene, or held by a body.

## Why use it

A kit item is listed once, in the game's items sheet, and every plugin that can hold a thing holds it by that name:
anim's props, motion3d's props and carries, crowd3d's items. It is drawn in the same looks as the place round it, in
at most three draw calls a copy (one a call for every copy crowd3d's people hold), and its materials are in the
scene's one looks file.

A glb from anywhere still goes in a hand as it always did. A prop or an item that names a `model` is the loader's,
and nothing of item3d touches it.

## How it works

item3d has no row and no server half. Its numbers are the scene's `world.item3d`:

| field | what |
|---|---|
| `items` | `{ <item>: { glb, file } }`: each item's glb, a `binary` entry of the catalogue, and its sidecar, a `json` entry with `preload` |
| `kinds` | `{ <kind>: { item } }`: every row of a kind listed lies loose as that item, at its `pos` [x, y, z], turned by its `rot` [x, y, z, w] |

An item's vertices count its own materials from 0, and its sidecar lists their names in that order. As the item is
made, each vertex is renumbered to the number its material has in the scene's looks file. A material the looks file
has not throws, naming the item and the material.

An item that stands still is one geometry every copy shares. An item that moves (a skin, morph targets) is an object
with bones of its own for each copy, and every clip of its sidecar that starts on plays on it.

## Using it

### 1. The sheet and the bake

The sheet is pro-ng's own (`pro-ng/build_item.mjs` in the library):

```json
{ "items": {
  "wrench": { "kind": "modern/colonial/garage/tools/adjustable_wrench", "keys": { "Length": 0.3 } },
  "skullcap": { "kind": "armor_basic/head/skullcap", "keys": { "Body": "soldier" } }
} }
```

The game's bake builds every item with the `items` tool and composes the scene's looks with the items' materials
after its own:

```ts
const built = await items({ sheet: path.join(here, '<game>.items.json'), out: path.join(here, 'items') })
await looks({ materials: { cobble: { look: 'cobble' }, ...built.materials }, out: path.join(here, 'main.looks.json'), pictures: path.join(here, 'looks') })
```

It writes `items/<item>.glb` and `items/<item>.item.json` (`scripts/items.ts`), and for an item that has effects
`items/<item>.effects.json`, and hands back their names as `built.effects`.

**An item's effects.** A kit kind's particles and lamps (the library's `pro-ng/KIT.md`, "Effects") burn on every copy
of the item, wherever it is: lying loose, on a bone of an anim or motion3d body, in a crowd3d person's hand. Nothing is
written for it by hand:

- the sidecar's `spawns`, `[{ effect, at, dir }]`, say what burns and where on the item;
- the scene's particle3d effects file lists each `items/<item>.effects.json` under `files` (demo_item3d's bake writes
  that list from `built.effects`);
- the scene names `world.particle3d.mods: { sources: ['item3d'] }` (`item3d.particle3d.ts`), lists `particle3d` after
  the plugins that pose the bodies, and lists `lights3d` for the lamps to shine.

**An item's hair.** The hair a kit kind grows on its parts (`pro-ng/KIT.md`, "Hair") grows on every copy of the item
through hair3d:

- the sidecar's `grows`, `[{ row, number, part, hair }]`, say which parts grow which hair;
- the game's bake lays `built.hairs` (`{ kinds, hairs }`) into the scene's hairs file;
- the scene names item3d under `world.hair3d.mods.skins` and `behaviors` (`item3d.hair3d.ts`).

**An item's cloth.** The fabrics a kit kind hangs (`pro-ng/KIT.md`, "Cloth") hang on every copy of the item through
fabric3d:

- the sidecar's `wears` names them;
- the game's bake lays `built.fabrics`, each with its pins, into the scene's fabrics file;
- the scene names item3d under `world.fabric3d.mods.sources` and as its `attach` (`item3d.fabric3d.ts`).

A hair or a fabric that names a look is drawn in that material of the scene's looks (`using-hair3d`,
`using-fabric3d`).

The kit kind `item3d_test_item` is a test stand that does everything a kit item can, each on a part of its own: still
parts in several materials, a see-through globe, a rune strip whose look reads its part's hints, a rotor on a bone
carrying two placed weights, a sliding drawer, a tossed ball with a release, an arm, hand and finger of joints, a
whip weighted by hand, a bellows of poses, a flame with a lamp, a plume and a tuft of hair, a cape and a pennant. A
sheet entry `{ "kind": "item3d_test_item", "keys": {} }` bakes it; the header of the library's
`pro-ng/kit/item3d_test_item.py` says which part is which.

### 2. The scene

```json
"loader": { "assets": {
  "wrench-glb": { "type": "binary", "url": "/games/<game>/assets/items/wrench.glb", "preload": true },
  "wrench-item": { "type": "json", "url": "/games/<game>/assets/items/wrench.item.json", "preload": true }
} },
"item3d": {
  "items": { "wrench": { "glb": "wrench-glb", "file": "wrench-item" } },
  "kinds": { "wrench": { "item": "wrench" } }
}
```

`item3d` is listed after `loader` and `supershader3d`, and before `anim`, `motion3d`, `crowd3d` and `render3d`.

### 3. In a hand

Each is the holding plugin's own entry, naming `item` where it would name `model`, and item3d under that plugin's
`mods`:

```json
"anim":     { "kinds": { "<kind>": { "props": [{ "item": "wrench", "bone": "RightHand", "at": [0, 0.08, 0.03], "turn": [0, 0, 0] }] } },
              "mods": { "props": "item3d" } },
"motion3d": { "kinds": { "<kind>": { "props": [{ "item": "wrench", "bone": "RightHand", "at": [0, 0.08, 0.03], "turn": [0, 0, 0] }] } },
              "mods": { "props": "item3d" } },
"crowd3d":  { "items": { "wrench": { "item": "wrench", "leftHand": { "at": [0, 0.08, 0.03] } } },
              "mods": { "items": "item3d" } }
```

A motion3d carry names the prop by its item's name. crowd3d holds only items that stand still: each copy is posed on
the GPU by one bone.

### 4. The bodies sheet

What each body holds and where, what it wears and its capsules can live in one sheet in place of the scene, a
`json` entry of the catalogue named by `world.item3d.bodies` (`item3d.bodies.ts` says every field):

```json
{ "bodies": {
  "worker":  { "holds": [{ "item": "wrench", "bone": "RightHand", "at": [0, 0.08, 0.03], "turn": [0, 0, 0] }] },
  "soldier": { "holds": [{ "item": "skullcap", "place": "head", "at": [0, -1.56, 0.04], "turn": [0, 180, 0] }] },
  "guard":   { "wears": ["tee"], "capsules": [{ "from": "Hips", "to": "Spine2", "radius": 0.15 }] }
} }
```

A body is named as the plugin that draws it knows it: a kind of anim's or motion3d's, or a body of crowd3d's. Each
part reaches that plugin through a mod of item3d's the scene names:

```json
"anim":     { "mods": { "props": "item3d", "capsules": "item3d" } },
"motion3d": { "mods": { "props": "item3d", "capsules": "item3d" } },
"crowd3d":  { "mods": { "items": "item3d" } },
"fabric3d": { "mods": { "attach": "item3d" } }
```

A hold on a `bone` is anim's and motion3d's, a hold on a `place` crowd3d's. `wears` and `capsules` are for a body
anim or motion3d draws: a body of crowd3d's is posed on the GPU, and the sheet refuses them on one. A fabric's own
numbers and its pins stay in fabric3d's fabrics file.

`yarn workshop item3d <game>` opens the item3d workshop on a game's sheet: the game's own scene run in the page,
each body with its holds, its garment's pins and its capsules on panels, the capsules drawn over the body, the
clock held on the frame the cloth is laid and stepped a substep at a time, and what is changed saved into the
sheet and the fabrics file.

### What it hands out

| | |
|---|---|
| `ready(item)` | whether the item is made |
| `mesh(item)` | a new object of the item at its own zero, in supershader3d's materials, casting and taking shadows; the caller adds it to the scene and takes it away, and never dresses it |
| `parts(item)` | the item as a geometry for each call that draws it, for a plugin that instances it; an item that moves throws |
| `sidecar(item)` | the item's sidecar: its kind, its keys, its materials, its clips |
## Plugins it works with

- **supershader3d**: its looks, its materials, and `surfaced`, the material crowd3d's copies are posed in.
- **anim**, **motion3d**: a prop that names an `item` (`item3d.anim.ts`, `item3d.motion3d.ts`).
- **crowd3d**: an item that names an `item` (`item3d.crowd3d.ts`).
- **loader**: the glbs and the sidecars.

## Where to try it

`games/demo_item3d`: a worker (walker and anim), a villager (crowd3d) and a runner (motion3d), each holding items of
item3d's beside a plain glb sword, and a wrench lying loose that the villager picks up on F.
