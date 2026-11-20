---
name: using-gpgpu3d
description: Use in core, or any clone of it, whenever gpgpu3d comes up - the things of a scene held on the GPU for what is moved there - `world.gpgpu3d` (`reach`, `meets`, `mods.things`, `mods.behaviors`, `mods.ops`), a program of ops a sheet lists (noise, folds, remaps, the clock, compiled to GLSL: `gpgpu3d.ops.ts`, `program`, an op of a plugin's own, `<a>.gpgpu3d.ts`'s `ops()`), particles that bounce off the land or shapes (gpuparticle3d's `bounce`), cloth that drapes on a table or a body (fabric3d), hair that lies on a head or shoulders (hair3d), grass pressed by cars and bodies (grass3d), a body's `capsules` (`world.anim.kinds.<kind>.capsules`, `world.motion3d.kinds.<kind>.capsules`, `world.puppet3d.capsules`), a game's own things handed to it (`<a>.gpgpu3d.ts`), or a shader of a game's own that asks `gpLine` or `gpPushOf`. Also when cloth, hair or particles pass through something, a cape hangs inside its wearer, grass is flattened everywhere or not at all, or gpgpu3d throws "has no behavior for thing", "names ..., which world.gpgpu3d.mods.things does not", or a capsule "runs to the bone ..., which the body has none of".
---

# Using gpgpu3d

gpgpu3d (`plugins/gpgpu3d/`) holds the things that stand round the camera in one float texture, and
hands any shader the GLSL that asks two questions of them: where a line first meets one, and how far a
point has to move to stand clear of one. It has no row, makes no pass and draws nothing. Four plugins
read it: gpuparticle3d, fabric3d, hair3d and grass3d. The header of `gpgpu3d.sim.ts` and the README say
every field; this is how a scene is put together with it.

## Three lists in the scene

```json
"gpgpu3d": {
  "reach": 64,
  "mods": {
    "things": ["shapes3d", "terrain3d", "anim", "box3dvehicle", "walker"],
    "behaviors": ["shapes3d", "terrain3d", "anim", "box3dvehicle"]
  },
  "meets": { "grass3d": ["box3dvehicle", "walker"], "fabric3d": ["shapes3d", "terrain3d", "anim"] }
}
```

- `mods.things`: the plugins that hand it things. Each thing is `{ <word>: <numbers> }`.
- `mods.behaviors`: the plugins that deliver the words: how a thing of the word is packed and the GLSL
  that meets it. gpgpu3d has no word of its own.
- `meets`: which plugins' things each reader meets. A reader it does not list meets every thing.
- `reach`: metres round the camera. Each `things` mod hands back only what of its own is within it.

A plugin may hand things of a word another plugin delivers, and the scene then names both: walker's
bodies are shapes3d's `cylinder`, so `things` has `walker` and `behaviors` has `shapes3d`.

## Who hands what

| `things` | the things | word | `behaviors` | where its numbers are |
|---|---|---|---|---|
| `shapes3d` | every box, plane, hyperplane and cylinder, where the frame draws it; a `triangles` shape is met by nothing | `box`, `plane`, `hyperplane`, `cylinder` | `shapes3d` | `world.shapes3d.kinds` |
| `terrain3d` | the land round the camera, a window of heights on the finest ring's lattice | `land` | `terrain3d` | the field file |
| `anim` | each body's capsules and balls | `capsule` | `anim` | `world.anim.kinds.<kind>.capsules` |
| `motion3d` | each body's capsules and balls | `capsule` | `anim` | `world.motion3d.kinds.<kind>.capsules` |
| `puppet3d` | each body's capsules and balls | `capsule` | `anim` | `world.puppet3d.capsules.<kind>` |
| `box3dvehicle` | each car's body and wheels | `hyperbox` | `box3dvehicle` | the car's own |
| `walker` | each walking body that is not limp, an upright cylinder of its kind's `radius` and `height` | `cylinder` | `shapes3d` | `world.walker.kinds` |

A plugin named under `behaviors` only delivers a word, and need not be in the scene's `plugins`:
demo_puppet3d names `"behaviors": ["anim"]` and lists no anim. A `things` mod reads the rows this page
holds and what its own plugin's browser half holds, so a plugin with no browser half (shapes3d, walker)
need not be listed either. anim, motion3d, puppet3d and box3dvehicle are read through their browser
halves, so each is listed when it is under `things`. gpgpu3d does not check it: one left out fails
inside its mod, on `plugins.<a>`.

## A body's capsules

A body is met as capsules and balls its bones carry:

```json
"capsules": [
  { "from": "Spine2", "to": "Neck", "radius": 0.16 },
  { "bone": "Head", "at": [0, 0.09, 0.015], "radius": 0.105 }
]
```

- `{ from, to, radius }` is a capsule `radius` metres round between two bones.
- `{ bone, at, radius }` is a ball the bone carries, `at` metres in the bone's frame.
- A bone is named by the end of its name. One the body has none of throws, naming the kind and the bone.
- A kind with no `capsules` hands nothing: its body is met by nothing.

demo_fabric3d's X Bot is fourteen capsules from hips to feet, for a cape to drape on. demo_hair3d's is
five balls (head, neck, upper spine, both upper arms), for long hair to lie on. demo_puppet3d's horse is
three balls (neck, chest, pelvis) for its mane and tail.

## Who reads it

| reader | named by | what it asks | listing |
|---|---|---|---|
| gpuparticle3d | `world.gpuparticle3d.mods.solids: 'gpgpu3d'` | `gpLine`: a particle of a layer with a `bounce` bounces where its path meets a thing | gpgpu3d before gpuparticle3d, which throws otherwise |
| fabric3d | `world.fabric3d.mods.solids: 'gpgpu3d'` | `gpPushOf` and `gpVel`: every point kept the fabric's `thick` clear of each thing, its `friction` measured against the speed of a thing that has one (of core's words, only `capsule` gives `moves`) | gpgpu3d listed |
| hair3d | `world.hair3d.mods.solids: 'gpgpu3d'` | `gpPushOf`: every link of a lock put out of each thing | gpgpu3d listed |
| hair3d | `world.hair3d.mods.keeper: 'gpgpu3d'` (required) | the keeper: what each lock and strand is, kept | gpgpu3d listed |
| grass3d | `world.grass3d.mods.pressed: 'gpgpu3d'`, with `mods.behaviors` | the things on the GPU for the blades, and as a list for the trampling | gpgpu3d before grass3d, which throws otherwise |
| grass3d | `world.grass3d.mods.keeper: 'gpgpu3d'` (required) | the keeper: what each blade is, kept | gpgpu3d before grass3d |

gpgpu3d fills its texture in its `afterTick`. fabric3d and hair3d move their points as the scene is
drawn, when every bone stands where the frame draws it, and fill gpgpu3d again there first, so a capsule
is where its bone is drawn.

The rest of each reader: `plugins/gpuparticle3d/README.md`, `using-fabric3d`, `using-hair3d`,
`using-grass3d`.

## `meets`: who meets whom

With no `meets`, every reader meets every thing. Name a reader in it when the scene holds things that
reader is not to meet:

- Grass is pressed by cars and bodies and not by the land: `"grass3d": ["box3dvehicle", "walker"]`.
- A cape meets the capsules of the body that wears it and not the cylinder that body walks as: leave
  `walker` out of `"fabric3d"`.

Each name in a `meets` list is one `mods.things` names, or it throws.

## The scenes that use it

| scene | `world.gpgpu3d` |
|---|---|
| demo_gpuparticle3d's `bounce` | `{ "reach": 64, "mods": { "things": ["shapes3d", "terrain3d"], "behaviors": ["shapes3d", "terrain3d"] } }` |
| demo_fabric3d | `{ "reach": 60, "mods": { "things": ["shapes3d", "anim"], "behaviors": ["shapes3d", "anim"] } }` |
| demo_hair3d | `{ "reach": 30, "mods": { "things": ["anim"], "behaviors": ["anim"] } }` |
| demo_puppet3d | `{ "reach": 60, "mods": { "things": ["puppet3d"], "behaviors": ["anim"] } }` |
| demo_grass3d | `{ "reach": 110, "mods": { "things": ["box3dvehicle"], "behaviors": ["box3dvehicle"] } }` |

Each lists `gpgpu3d` after the plugins that hand it things and before its reader and `render3d`.

## Ops: a sheet's list of operations, compiled to GLSL

Besides the things, gpgpu3d compiles a plugin's sheet of operations: noise, folds, remaps, the clock. It is
terrain3d's height program on the GPU, and any plugin whose shader works a number out can ask for one
(`plugins/gpgpu3d/gpgpu3d.ops.ts` holds the whole form). Nothing is worked out on the CPU: gpgpu3d writes
GLSL, and the plugin's shader calls it at a point.

```json
"program": {
  "nodes": [
    { "id": "lush", "op": "noise", "kind": "simplex", "freq": 0.045, "seed": 3, "octaves": 3 },
    { "id": "patches", "op": "remap", "input": "lush", "inLo": 0.3, "inHi": 0.7, "outLo": 0.55, "outHi": 1.5 }
  ],
  "out": { "height": "patches" }
}
```

- A node is an `op` and its inputs and numbers; an input names an earlier node. `out` names the nodes whose
  values the plugin asks for. A node `out` does not reach is not compiled, so the sheet sets what it costs.
- An `out` is a node, or for a name the plugin takes as a colour `{ "r", "g", "b" }` (three nodes) or a tint
  `{ "to": "#rrggbb", "by": "<node>" }` (the plugin's colour mixed toward the hex); both in sRGB.
- Built-in: `const`, `coord`, `time`, `roll` (`salt`: the random number of the thing being worked out, a blade
  or a lock, which the reader's shader answers as `float gpRollOf( int salt )`), `noise` (`value`, `simplex`,
  `worley`, `cell`; `freq` cycles a metre, `octaves`, `stretch`, `rotate`), `warp`, `fold`, `remap`, `ramp`,
  `combine`, `blend`, `scale`. A plugin writes an op only for what its own shader has in scope; grass3d's
  `dist` is the example.
- A plugin whose sheet carries a program asks `plugins.gpgpu3d.program(plugins, name, program, allowed,
  what)`: `{ glsl, outs, kinds, at, uniforms }`, `allowed` being `{ <name>: 'number' | 'colour' }`. Its GLSL
  goes in the shader once, ahead of the calls; the shader calls `at( p )` once with the point, then reads each
  `outs[name]`, `float f()` or for a colour `vec3 f( vec3 base )`, so a node the outputs share is worked out once; `uniforms` (`gpTime`) go into its material. A plugin whose things are worked out on the GPU does not ask
  this itself: it hands the program to the keeper (The keeper, below).
- An op that `moves` (`time`, grass3d's `dist`) gives another value each frame at the same point, and
  `program` hands back `moves`, whether each name of `out` reads one. A plugin that keeps what it works out
  asks for the program in two halves with a last argument `part`, `{ live, of: 'still' | 'live', outs? }`,
  and gets `kept`, the nodes that stand still and that the live half reads: it works the still half out
  once, keeps it, and hands the kept nodes to the live half (`gpgpu3d.ops.ts`, Still and moving). The keeper
  does all of this.
- A plugin delivers ops with `<a>.gpgpu3d.ts` exporting `ops()`, `{ <word>: Op }`, and the scene names `a`
  under `world.gpgpu3d.mods.ops`. An op is `inputs`, `params`, the libraries it `needs`, GLSL of its own and
  `expr(c)`, which writes the GLSL expression of a node. A delivered op takes the place of a built-in of its word.
- A program that is wrong throws a sentence naming the node, the field and what it should be, and an op
  none of the scene's `ops` mods deliver lists the ops there are.
- Proven in node (`gpgpu3d.ops.test.ts`: what is checked, the GLSL written) and on a GPU
  (`gpgpu3d.ops.gpu.html` under `yarn dev`: each op run in a shader and read back, `window.gpu`).

## The keeper: work a thing out once

Most of what a blade, a lock or any thing made on the GPU is never changes. A plugin that works it out in
the shader that draws it works it out for every vertex of every frame, the sheet's program with it. That
was grass3d's mistake. A plugin whose things are made on the GPU keeps them with the keeper
(`gpgpu3d.keeper.ts`, whose header says every field), and reads a program's output no other way.

1. The plugin takes a `keeper` mod, as grass3d and hair3d do (`gpgpu3d.grass3d.ts`:
   `keeper: plugins => spec => plugins.gpgpu3d.keeper(plugins, spec)`), required, and throws with none.
2. It writes a spec: its `values` (each a `name`, a `size`, the `outs` of the program it reads, whether
   it is the thing's `own`, its `group` and its GLSL expression), its `outs` (each name a program may
   give, with `none` and `wrap`), the sheet's `program`, and `keeping` (`head`, the GLSL the keeping
   shader needs, with `float gpRollOf( int salt )`; `begin`, which sets a thing up and gives `point`).
3. It makes a room, `kept.room({ cols, rows, count, uniforms, what, hint })`: a grid of slots of `count`
   things, a texel a thing. grass3d's slot is a tile of its level's square; hair3d has one slot of every
   lock.
4. Each frame it says what each slot is to hold, `room.want(col, row, a, b)`, says `room.stale(col, row)`
   when what a slot holds is no longer right (the ground changed, a number of the sheet changed), and
   calls `room.keep(renderer)`. A slot that holds what is wanted costs nothing.
5. Its shader holds `room.reading(groups).glsl` after its own uniforms and globals, spreads
   `.uniforms` into its material, calls `<prefix>ValOf( slot, i )` and `<prefix>ValPoint( p )`, and reads
   each value with `<prefix>Val<Name>()`. A shadow's shader asks for the group that shapes a thing alone.

- A value is **kept** (the thing's own, or it reads a name the program gives), **live** (it reads a name
  that moves: `time`, grass3d's `dist`) or **plain** (the sheet's own number, kept nowhere). The plugin's
  shader reads all three the same way.
- `room.drew()` is how many slots have been written. A room that writes every slot every frame is being
  told `stale` every frame.
- `specOf` in `grass3d.glsl.ts` and `lockSpec` in `hair3d.glsl.ts` are the examples.

## A game's own things

A game hands gpgpu3d what its own plugin draws with a mod beside that plugin,
`games/<game>/plugins/<a>/<a>.gpgpu3d.ts`, named in `world.gpgpu3d.mods.things`, with `<a>` in
`world.shipped.plugins`:

- `things(plugins, near)` hands back `{ <word>: <numbers> }` for each thing within `near.reach` of
  `near.at`. A thing of a word core already has needs nothing more: the hair workshop's subjects are
  handed as anim's `capsule` (`tools/workshop/plugins/subjects/subjects.gpgpu3d.ts`, which has one
  subject and hands it whatever the reach), with `anim` under `behaviors`. `carried(matrixWorld.elements, at)` from `gpgpu3d.sim.ts` is the point a bone carries.
- A shape no word covers is a word of the game's own: the same file exports `behaviors()`, returning
  `{ <word>: Behavior }`, and the scene names `<a>` under `behaviors` too. A Behavior is `size`,
  `pack(data, made)`, optional `moves(data)` and `uniforms()`, and `glsl` that defines
  `<word>Line(int s, vec3 o, vec3 d, float far, out float t, out vec3 normal)` and
  `<word>Push(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth)`, reading its
  numbers with `gp(s, k)` or `gpRow(s, j)`. Every name the GLSL defines begins with its word.
  `plugins/anim/anim.gpgpu3d.ts` (`capsule`) is the one to read first; `box3dvehicle.gpgpu3d.ts`
  (`hyperbox`) turns a box any way; `terrain3d.gpgpu3d.ts` (`land`) keeps a texture of its own.
- A thing that moves gives `moves(data)`, `{ key, at }`, the same `key` every frame, and gpgpu3d holds
  its speed for `gpVel`.

For grass to be pressed by a thing of a new word, the game's plugin also delivers grass3d a Press for it
(`using-grass3d`).

## A shader of a game's own

A game's plugin with a pass of its own reads gpgpu3d as the four do:
`plugins.gpgpu3d.shader(plugins, '<its name>')` hands `{ glsl, uniforms, words, things() }`. Put `glsl`
in the shader, spread `uniforms` into the material's uniforms once (each is the same object for as long
as the page lives), and call `gpLine(from, dir, far, t, normal)`, or walk `gpThing(i)` for `i` under
`gpCount` and call `gpPushOf` and `gpVel`. The name handed is the one `meets` lists it by.
`gpgpu3d.gpuparticle3d.ts` shows `gpLine`; `gpgpu3d.fabric3d.ts` and `gpgpu3d.hair3d.ts` show
`gpThing` and `gpPushOf`. A pass that runs
as the scene is drawn calls `plugins.gpgpu3d.fill(plugins)` first.

## What it throws

| message | cause |
|---|---|
| `gpgpu3d is listed, and the scene has no world.gpgpu3d` | the block is missing |
| `world.gpgpu3d has <k>, which gpgpu3d does not know` | a field other than `reach`, `meets`, `mods` |
| `world.gpgpu3d.meets.<who> names "<n>", which world.gpgpu3d.mods.things does not` | a `meets` entry not under `things` |
| `gpgpu3d has no behavior for thing <s>, of the word <word>` | a `things` plugin hands a word no `behaviors` plugin delivers: `walker` without `shapes3d`, `motion3d` or `puppet3d` without `anim` |
| `world.gpgpu3d.reach is ..., and it is the metres round the camera things are held within` | `reach` missing or not above 0 |
| `world.gpgpu3d.meets is ...` / `world.gpgpu3d.meets.<who> is ...` | `meets` is not `{ <plugin>: [<plugin>, …] }` |
| `anim kinds.<kind>.capsules runs to the bone <b>, which the body has none of` (`motion3d kinds.<kind>.capsules ...`, `puppet3d capsules.<kind> ...`) | a bone name the model does not have |
| `fabric3d's solids is gpgpu3d's, which this scene does not list` (hair3d's the same) | a reader names gpgpu3d and `plugins` does not list it |
| `gpuparticle3d is listed before gpgpu3d, whose solids it reads that frame` (grass3d's `pressed` the same) | the reader is listed first |

## What goes wrong without a throw

- **Cloth, hair or particles pass through a thing**: its plugin is not under `things`, the thing is
  further than `reach` from the camera, the reader's `meets` leaves its plugin out, or the body's kind
  has no `capsules`.
- **A cape or hair hangs inside the body**: the capsules are thinner than the body. Fit each `radius`
  to the model.
- **Nothing presses the grass**: grass3d's `mods.behaviors` names no plugin that delivers a Press for
  the thing's word (`using-grass3d`).

## Proving it

`yarn vitest run plugins/gpgpu3d/gpgpu3d.plugin.test.ts`, and the test beside each mod that hands it
things: `plugins/anim/anim.gpgpu3d.test.ts`, `plugins/motion3d/motion3d.gpgpu3d.test.ts`,
`plugins/puppet3d/puppet3d.gpgpu3d.test.ts`, `plugins/terrain3d/terrain3d.gpgpu3d.test.ts`,
`plugins/walker/walker.gpgpu3d.test.ts`. Its ops: `plugins/gpgpu3d/gpgpu3d.ops.test.ts` and
`plugins/grass3d/grass3d.gpgpu3d.test.ts` in node, and on a GPU `plugins/gpgpu3d/gpgpu3d.ops.gpu.html`
under `yarn dev`, which runs each op in a shader and reads the numbers back (`window.gpu`).
What it costs is measured with `benchmarking-a-game`.
