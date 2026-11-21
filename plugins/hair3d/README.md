# hair3d

Hair, fur and manes grown on the skin of a body that its bones pose. Each lock is rooted on the skin where
the scene says, simulated on the GPU so it hangs, swings as the body moves and blows in the wind, and drawn
as strands made there every frame. What a lock is, its length, comb, stiffness, curl and colour, is the
hairs file's numbers and, where a hair has one, a program of ops that varies them over the skin (a
parting, a bare patch, a stripe); it is worked out once for each lock and kept. It has no row and nothing goes down the wire: every seat grows the same
locks on the same skin.

## Why use it

A model with no hair gets hair, a beard, a mane, a tail or a coat of fur from a block of the scene file,
with no hair modelled, textured or animated for it: where it grows, how thick, how long, how it lies and
how it moves are all numbers. The same hair goes on every body of a kind, and a kind wears as many hairs
as the scene lists.

## How it works

**Shared half (`hair3d.sim.ts`).** No row. The scene's numbers and their check, and `rootsOf`, which rolls
where a hair's locks root on a skin.

`world.hair3d`:

- `hairs`: the name in the scene's loader catalogue of the hairs file, a `json` entry with `preload`, as
  particle3d's `effects` names its effects file. Every number of the hair is in that file.
- `mods`: `skins` (required, a list: `anim`, `motion3d`, `puppet3d`, `crowd3d`, whichever draw the
  bodies), `behaviors` (a list: `render3d`, `crowd3d`), `keeper` (required: `gpgpu3d`, whose keeper
  keeps what each lock and each strand is once it is worked out, and compiles a hair's `program` with
  it), `wind` (optional: `weather3d`) and `solids`
  (optional: `gpgpu3d`, what every lock is kept out of; with none a lock meets nothing). Each `skins`
  mod hands every wearer its plugin draws: its kind and its skins, each what it is under its word. Each
  `behaviors` mod delivers the skin of a thing of its word: render3d's `skinned` is a three SkinnedMesh,
  which anim, motion3d and puppet3d hand; crowd3d's `posed` is a mesh group of one of its bodies. A skin
  of a word nothing delivers throws.

The hairs file:

- `wind`: `{ toward, speed }`, the wind with no `wind` mod: degrees clockwise from north it blows toward,
  and metres a second.
- `gust`: `{ scale, strength, rate }`: gusts are patches `scale` metres across, the wind at a lock
  1 − strength + 2·strength·g of its mean, moving on at `rate` radians a second.
- `kinds`: kind to `{ hairs }`, the hairs it wears. A wearer's kind is its mod's to say: for anim and
  motion3d the kind a row's `as` names when it names one, else its own; for puppet3d the row's kind; for
  crowd3d the body's name. What a hair is kept out of, its wearer's head and neck among it, is not in
  this file: it is the `solids` mod's, the capsules and balls the body's own plugin hands gpgpu3d.
- `hairs`: name to a hair.

A hair:

- `on`: where it grows. `meshes`, a regular expression matched against each skin's name; `bones`, bones
  named by the end of their names, and `weight`, the least share of the skin those bones hold where a
  lock roots (0 roots it everywhere on the skins); `cuts`, `[{ bone, normal, offset }]`, planes in a
  bone's frame as the skin was bound: a lock roots only where the skin is at least `offset` metres along
  `normal` from the bone, for every cut; `planes`, `[{ normal, offset }]`, the same in the skin's own
  frame (+y up, +z ahead); `faces`, `[{ toward, within }]`: a lock roots only where the skin's normal is
  within `within` degrees of `toward`. A scalp is the head bone's skin above a cut that leaves out the
  face; a horse's mane is the neck's skin that faces up, between two planes either side of its middle.
- `density` (locks a square metre of that skin) and `strands` (strands drawn a lock).
- `length`, `width`: `[base metres, spread]`; `taper`, the share of its width left at a strand's tip;
  `thin`, the least width it is drawn, in metres a metre from the eye.
- `links`: the points a lock is simulated with; `segments`: the pieces a strand is drawn in.
- `comb`: `[x, y, z]` added to the skin's normal, in the model's own frame, to make the way a lock lies
  with nothing pulling on it. `stiffness`: `[root, tip]`, how hard it is pulled back to that way, a second.
- `gravity` (metres a second squared), `damping` (the share of its speed lost, a second) and `drag` (how
  fast it takes the wind's speed, a second).
- `clump`: `{ radius, tight }`: a lock's strands root within `radius` of it and close toward the tip.
  `curl`: `{ radius, turns }`: each strand winds round its lock. `ragged`: the share of the lock's length
  a strand may fall short by.
- `colours` `{ root, tip }`, `vary`, `ao` (darker at the root), `roughness`, `shine` `{ strength, power }`
  (the highlight across the strands), `translucency` (light through hair lit from behind) and `shadow`
  (whether it casts shadows).
- `program` (optional): a program of ops (`plugins/gpgpu3d/README.md`, Ops), run for each lock at its
  root on the skin as it was bound, in metres, so a pattern stays where it is on the body however the
  body moves. gpgpu3d's `roll` is the lock's own random number. Each name of its `out` works on one
  field of the hair:
  - `cover`: 0 to 1, the share of the locks that stand. 0 is bare skin: a parting, a hairline, a patch.
  - `length`, `width`, `taper`, `ragged`, `clumpRadius`, `clumpTight`, `curlRadius`, `curlTurns`:
    multiply the lock's shape.
  - `combX`, `combY`, `combZ`: added to `comb`, so a swirl or a parting is a program.
  - `stiffnessRoot`, `stiffnessTip`, `gravity`, `damping`, `drag`: multiply how it moves.
  - `vary`, `ao`, `roughness`, `shineStrength`, `shinePower`, `translucency`: multiply its look.
  - `rootColour`, `tipColour`: colours, `{ r, g, b }` of nodes or a tint `{ "to": "#c8b040", "by": <node> }`
    of the hair's own.

  A name the program does not give leaves that field as the file has it. What a program gives is worked
  out once for each lock and kept; a name that reads the clock (`time`) is worked out each frame.
- `ties` (optional): where the hair is gathered, as a hair tie gathers it: a list of points, each carried
  by a bone and never drawn. A ponytail is one, pigtails two, a head of braids a dozen. A hair with ties
  has at least 3 `links`. Each tie:
  - `bone`, `at`: the bone that carries it, named as `on.bones` names one, and its place in that bone's
    frame as the skin was bound, metres.
  - `reach`, `share`: a lock whose root is within `reach` metres of the tie, and whose own length reaches
    it, is gathered to the nearest such tie; of those, `share` (0 to 1) are, each by a roll of its own, so
    some hairs stay loose. Two ties either side of a head part the hair between them.
  - `around`, `lift`: the centre the hair is laid round (the middle of the head), in the same frame, and
    the metres the hair stands off the skin on its way: the links before the tie lie along an arc round the
    centre from the lock's root to the tie, so the hair lies on the head and not through it.
  - `hang`, `fall`, `side`: the way the hair hangs from the tie in the bone's frame, how far it gives in to
    straight down (0 to 1), and the way across it, which a braid is woven across.
  - `spread`, `flare`, `band`: the hair is `spread` metres wide round the way it hangs at the tie and opens
    out to `flare` by its end; with a `band`, a second tie that many metres below the first, it stays
    `spread` down to it and opens out past it, a tassel below a braid's tie. 0 is no band.
  - `stiffness`: `[gathered, hanging]`, how hard the links are pulled back to where the tie holds them, a
    second: the ones along the arc and the ones that hang. Low for a ponytail that swings, high for a braid.
  - `braid`: `{ radius, pitch }`. With a `radius` above 0 each gathered lock is one of the three strands
    of a plait, picked by a roll of its own, and the strands weave over and under each other: `radius`
    metres either way across the hair, `pitch` metres for the six crossings it takes to come round. A plait
    is only as fine as the links along it: a crossing wants about two links, so `links` is high (up to 32)
    for a braid.

  A lock gathered to a tie keeps its own length: as long as it is, less what the arc to the tie takes of
  it, hangs below the tie, so the hair is ragged at its end as it was. The links that lie along the arc and
  the one at the tie are laid by the tie, carried by its bone; the ones below hang, swing and meet the
  body as any link does. A lock that is not gathered hangs as its `comb` and `stiffness` lay it.

```json
"ties": [
  { "bone": "Head", "at": [0, 0.13, -0.13], "around": [0, 0.09, 0.015], "lift": 0.02, "hang": [0, -1, -0.4], "fall": 0.6,
    "reach": 0.35, "share": 1, "spread": 0.02, "flare": 0.07, "band": 0, "side": [1, 0, 0], "stiffness": [40, 2.5],
    "braid": { "radius": 0, "pitch": 0.12 } }
]
```

```json
"program": {
  "nodes": [
    { "id": "patch", "op": "noise", "kind": "simplex", "freq": 6, "seed": 4 },
    { "id": "long", "op": "remap", "input": "patch", "inLo": 0.2, "inHi": 0.8, "outLo": 0.5, "outHi": 2.5 },
    { "id": "bare", "op": "ramp", "input": "patch", "lo": 0.15, "hi": 0.3 },
    { "id": "stripe", "op": "ramp", "input": "patch", "lo": 0.45, "hi": 0.55 }
  ],
  "out": { "length": "long", "cover": "bare", "tipColour": { "to": "#d02020", "by": "stripe" } }
}
```

**Browser half (`hair3d.plugin.ts`, `hair3d.glsl.ts`).** Each `afterTick`:

- **The hairs file** is read through the loader; nothing is grown until it has landed, and it is checked
  whenever it changes.
- **The wearers.** Every `skins` mod is asked for its wearers, and each skin is made by its word's
  behavior. A wearer of a listed kind gets, for each hair it wears, a patch on each of its skins the
  hair's `on.meshes` matches.
- **A skin** is what a hair is rooted on and carried by, whoever poses it: its geometry as it was bound,
  its bones' frames, and each frame the float texture its bones' matrices stand in. A three SkinnedMesh
  is one copy on its skeleton's own bone texture; a crowd3d body is as many copies as it has people, a
  row of crowd3d's pose each, and all of them are one patch: one pass and one draw.
- **The locks** are rooted once for each skin's geometry and hair, on the skin as it was bound, and
  shared by every patch of that geometry: its place, the skin's normal, the four bones that hold it, its
  length. The rolls are a hash of the hair's name.
- **The pass.** The moment render3d first draws the scene in a frame, with every bone where it is drawn,
  each patch's locks are moved a frame on in a float texture, every copy's side by side: the root is the
  skin as its bones hold it now; each link in turn is carried on by the speed it had, gravity and the
  gusting wind, pulled toward the way the lock lies, kept out of the skin under its root and
  out of what the `solids` mod holds (gpgpu3d's bodies' capsules and balls, shapes and land), and
  put a link's length from the link before. So a lock keeps its length, hangs, and
  swings as its root is carried. A lock whose root is more than a metre from where it was the frame
  before is laid afresh, not swung.
- **The strands** are made whole in the vertex shader from the instance's number: each runs along the
  curve through its lock's points, set off within the clump, wound by the curl, a ribbon facing the eye.
  They are a dressed MeshStandardMaterial lit with the skin's normal under the lock, so the sky's fog,
  lights3d's lights and the shadows reach them, with a highlight across the strands.
- **What is kept.** What a lock is that is the same every frame (its own rolls, and every field its
  program gives) and each strand's own rolls are worked out once by gpgpu3d's keeper
  (`plugins/gpgpu3d/gpgpu3d.keeper.ts`), which hair3d hands each value, and held in textures, a texel a
  lock and a texel a strand, shared by every body of the same geometry. The pass and the strands read
  them back and work out only what moves. A number of the hair changed keeps its locks again.
  `bodies()` gives how many times each has been written.
- **The ties** are rooted with the locks: each lock keeps which tie it is gathered to, which of a plait's
  three strands it is and two rolls that put it in its bundle. The ties' own numbers are a row of a small
  texture each, in the skin's own frame as it was bound, written again when they change. The pass lays a
  gathered lock's links in its own way: the links before its tie on the arc round the tie's centre, the
  link at its tie where the tie's bone holds the tie, and the links after it hanging, each moved on by
  where the bundle opens out and where the plait weaves.
- A body's hair is built again when what it is rooted and built from changes (`on`, `density`, `strands`,
  `length`, `links`, `segments`, `shadow`, `program`, and of its ties which locks they gather: their bone,
  place, `reach` and `share`); every other number, the rest of a tie's among them, is read as it draws.

It hands out `bodies()`, `roots(id, hair)`, `state(id, hair)` and `close()`.

## Using it

1. List `hair3d` before `render3d`, with `loader`, `gpgpu3d` (given `world.gpgpu3d: { "reach": 30 }`)
   and the plugins its mods name.
2. Write the hairs file (below) in the game's `assets/` and list it in the scene's catalogue:
   `"hairs": { "type": "json", "url": "/games/<game>/assets/hairs.json", "preload": true }`.
3. Give `world.hair3d`, the file's entry and the mods:
   `"hair3d": { "hairs": "hairs", "mods": { "skins": ["anim"], "behaviors": ["render3d"], "keeper": "gpgpu3d" } }`
   for bodies anim draws (`motion3d`, `puppet3d` the same), `"skins": ["crowd3d"], "behaviors": ["crowd3d"]`
   for crowd3d's people, `"wind": "weather3d"` for the weather's wind, and `"solids": "gpgpu3d"`, with
   gpgpu3d listed, for the hair to lie on what gpgpu3d holds: the body's own capsules and balls
   (`world.anim.kinds.<kind>.capsules`, each `{ from, to, radius }` between two bones or
   `{ bone, at, radius }`, a ball a bone carries, as a head is:
   `"gpgpu3d": { "reach": 30, "mods": { "things": ["anim"], "behaviors": ["anim"] } }`; motion3d's kinds
   the same, and puppet3d's in `world.puppet3d.capsules.<kind>` with `"things": ["puppet3d"]`),
   shapes3d's shapes, terrain3d's land. crowd3d's people hand it none, so their hair meets no body.
4. Name the meshes, the bones and the cuts of each hair from the model: its skinned meshes' names and its
   bones' are in its glb. three takes the spaces and dots out of a glb's names (`tail 5` is `tail_5`);
   puppet3d's bones keep the names its skeleton file gives them.

The hairs file:

```json
{
  "wind": { "toward": 210, "speed": 1.5 },
  "gust": { "scale": 3, "strength": 0.7, "rate": 1.6 },
  "kinds": {
    "xbot": { "hairs": ["scalp"] }
  },
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
}
```

A hair is tuned away from the game in the hair workshop, `yarn workshop hair3d <game>`: each hair of the
game's hairs file grown on a test subject (a head, a ball, a neck, a tail's root, a trunk, a pelt) that
is moved, turned and run forward, every number changed as it draws, those of a hair's `program`'s nodes
among them, and saved into the file (`tools/workshop/README.md`).

demo_hair3d is an X Bot with long hair walked round a yard among X Bots in fur, a ponytail, pigtails, a long
braid, braided pigtails tied at their ends and a head of braids; its `dev.html` tunes every number of its
hairs file live. demo_puppet3d's horse wears a mane and a tail and its lion a mane, on
puppet3d's bodies in its paddock and on crowd3d's in its herd (`dev.html?scene=herd`), each scene with a
hairs file of its own.

## Plugins it works with

- **render3d**: `render3d.hair3d.ts` (`behaviors`) delivers `skinned`, the skin of a three SkinnedMesh.
  render3d also dresses the strands and draws them.
- **anim**: `anim.hair3d.ts` (`skins`) is every row anim draws, its skins its model's skinned meshes.
- **motion3d**: `motion3d.hair3d.ts` (`skins`) is every row motion3d draws, the same.
- **puppet3d**: `puppet3d.hair3d.ts` (`skins`) is every row puppet3d draws, its skins its layouts' bodies.
- **crowd3d**: `crowd3d.hair3d.ts` (`skins`, `behaviors`) is every body that has people, all of them one
  wearer, its skins its mesh groups; it delivers `posed`, the skin of such a group, its bones crowd3d's
  pose.
- **weather3d**: `weather3d.hair3d.ts` (`wind`) is the wind as it gusts now and its drift.
- **gpgpu3d**: `gpgpu3d.hair3d.ts` (`keeper`) keeps what each lock and each strand is and compiles a
  hair's program with it; its `solids` is everything a lock is kept out of, its wearer's body among it,
  filled again the moment the locks are moved.
- **lights3d** lights the strands and draws their shadows each frame.

## Keywords

hair, fur, mane, tail, beard, coat, strands, locks, guide hairs, GPU hair, hair simulation, follow the
leader, Verlet, skinned mesh, bones, scalp, comb, clump, curl, hair tie, ponytail, pigtails, braid, plait,
ties, wind, gusts, Kajiya-Kay, program of ops,
parting, bald patch, stripes, hair pattern, `world.hair3d`, hairs file, `program`, `keeper`,
`bodies`, `roots`, `state`
