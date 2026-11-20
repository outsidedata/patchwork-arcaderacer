# gpgpu3d

The things of a scene held on the GPU: the land, the shapes that stand on it, the bodies and the cars,
packed into one float texture each frame, with the GLSL that tells any shader where a line first meets
one and how far a point has to move to stand clear of one. It has no row, makes no pass and draws
nothing. The plugins whose own work is on the GPU read it: gpuparticle3d's particles, fabric3d's
fabrics, hair3d's locks and grass3d's blades. It also compiles programs of ops, the operations a sheet
lists (noise, folds, remaps, the clock), to GLSL for any of them, and keeps what each of a plugin's
things is, worked out once, so the plugin's shader works out each frame only what moves.

## Why use it

A plugin that moves particles, strands, blades or cloth on the GPU cannot ask the CPU what is in their
way. Each one used to be handed its own solids, pack them its own way and meet them with its own GLSL.
gpgpu3d does that once for the scene. A plugin that owns a kind of thing says how it is packed and met
in a file of its own, and every plugin that reads gpgpu3d meets it from then on.

The same goes for the numbers a GPU plugin works out. Noise, folds, remaps and the clock are gpgpu3d's
**ops**, and a plugin writes none of them: its sheet lists the ops it wants, as terrain3d's height program
does, and gpgpu3d compiles the list to GLSL the plugin's shader calls. A sheet that wants little lists
little, and one that wants a lot lists a lot; nothing else sets how much a plugin does.

Most of what a blade of grass or a lock of hair is never changes: where it stands, how tall it is, its
colour, what the sheet's program says there. A shader that works that out as it draws works it out for
every vertex of every frame. The **keeper** works it out once and keeps it in textures, a texel a thing.
A plugin hands the keeper its values and reads each one back through a function the keeper writes, and
it has no other way to a program's output, so a plugin written on the keeper cannot run what stands
still each frame.

## How it works

**Shared half (`gpgpu3d.sim.ts`).** No row. The table of words, the GLSL made from it, and the packing.

`world.gpgpu3d`:

- `reach`: metres round the camera within which things are held.
- `meets` (optional): `{ <plugin>: [<plugin>, …] }`, which plugins' things each plugin that reads
  gpgpu3d meets. A plugin it does not list meets every thing. Grass is pressed by cars and bodies and
  not by the land; a cape meets the bones of the body that wears it and not the cylinder that body
  walks as.
- `mods`:
  - `things` (a list): each plugin's `things(plugins, near)` hands back the things it has within
    `near`, `{ at, reach }`, the camera's place and `reach`. A thing is `{ <word>: <numbers> }`.
  - `behaviors` (a list): each plugin's `behaviors()` delivers `{ <word>: Behavior }`.
  - `ops` (a list): each plugin's `ops()` delivers `{ <word>: Op }`, ops laid over gpgpu3d's own.

gpgpu3d has no word of its own for a thing. A thing of a word nothing delivers throws, naming the word.

A Behavior is what a word's owner writes:

- `size`: how many numbers a thing of the word is on the GPU.
- `pack(data, { own, three })`: those numbers, from the thing's numbers.
- `moves(data)` (optional): `{ key, at }` for a thing that moves. gpgpu3d holds the metres a second the
  point `at` has moved since the frame before.
- `uniforms()` (optional): uniforms of the word's own, made once a page, for what numbers alone do not
  hold. `pack` may write their `value`. The land's heights are a texture of its own.
- `glsl`: GLSL ES 3.00 that defines, of thing `s`,
  - `bool <word>Line(int s, vec3 o, vec3 d, float far, out float t, out vec3 normal)`: where the line
    from `o` along the unit `d` first meets it within `far` metres;
  - `bool <word>Push(int s, vec3 x, vec3 was, float clear, out vec3 normal, out float depth)`: whether
    the point `x` is nearer than `clear` to it, or inside it, and how far along `normal` it has to move
    to stand `clear` clear. A face with no inside keeps `x` on the side `was` was on.

  It reads the thing's numbers with `gp(s, k)` or four at a time with `gpRow(s, j)`. Every name it
  defines begins with its word.

**Ops (`gpgpu3d.ops.ts`).** A program is a list of nodes that run in order, each an `op` and the numbers
and inputs that op takes, an input naming an earlier node so a cycle cannot be written, and an `out` naming
the nodes whose values a plugin asks for:

```json
{
  "nodes": [
    { "id": "patch", "op": "noise", "kind": "simplex", "freq": 0.07, "seed": 3, "octaves": 3 },
    { "id": "tall", "op": "remap", "input": "patch", "inLo": 0.3, "inHi": 0.7, "outLo": 0.6, "outHi": 1.5, "ease": "smooth" },
    { "id": "tuft", "op": "noise", "kind": "worley", "metric": "f1", "freq": 1.8, "seed": 9 },
    { "id": "both", "op": "combine", "a": "tall", "b": "tuft", "mode": "mul" }
  ],
  "out": { "height": "both" }
}
```

- Every node is a float and a function of a point; what the point is, is the plugin's (grass3d hands the
  foot of the blade). The plugin gives the point once and every node is worked out at most once at it, however
  many outputs read it. `warp` runs its input at another point, which costs that input's nodes again.
- gpgpu3d brings `const`, `coord`, `time` (the page's clock, which it sets each frame), `roll` (the random
  number of the thing being worked out, a blade or a lock, which the reader's shader answers), `noise` (value,
  simplex, worley and cell, with octaves, stretch and rotation), `warp`, `fold`, `remap`, `ramp`, `combine`,
  `blend` and `scale`, over libraries of its own (an integer hash, the noise, a ramp, the clock). A plugin
  writes an op only for what it alone has in scope: grass3d's `dist` is a blade's metres from the camera.
- An `Op` is its `inputs`, its `params` (each a number, a whole number, a choice or a vec3, with what it may
  be), the libraries it `needs`, GLSL of its own (`lib`) and `expr(c)`, which writes the GLSL expression of a
  node. The numbers go into the GLSL as they are, so a sheet that changes is compiled again.
- A node no `out` reaches is not compiled. A sheet that holds a cheap algorithm and a dear one costs what the
  nodes its `out` reaches cost.
- An `out` name is a node (a number) or, where the plugin takes a colour, `{ "r", "g", "b" }` of three nodes or
  a tint `{ "to": "#rrggbb", "by": "<node>" }`, the plugin's own colour mixed toward the hex by the node. Both
  are sRGB, as a sheet writes colours, and come out linear. The plugin says which names are numbers and
  which colours (`allowed`, `{ <name>: 'number' | 'colour' }`), and a name given the other form throws.
- `compile(table, program, name, what, allowed?, part?)` throws a sentence naming the node, the field and what it
  should be, and `rangeOf(param, value)` is the slider a tool shows for a number of a node.
- An op that `moves` gives another value from frame to frame at the same point: `time`, and grass3d's `dist`.
  `compile` hands back `moves`, whether each name of `out` reads one. A plugin that keeps what it works out
  compiles the program in two halves with `part`, `{ live, of: 'still' | 'live', outs? }`: the still half for
  the shader it runs once, the live half for the one it runs each frame, and `kept`, the nodes that do not
  move and that the live half reads, which the plugin keeps from the one and hands to the other, so nothing
  that stands still is worked out twice. The keeper does all of it (`gpgpu3d.ops.ts`, Still and moving).

**The keeper (`gpgpu3d.keeper.ts`).** A plugin that works its things out on the GPU hands the keeper a spec:

- `values`: each value of a thing, its `name`, its `size` (1 to 4 channels), the names of the program's
  `out` it reads (`outs`), whether something of the thing's own is in it (`own`: a roll, its place), the
  `group` of shaders that read it, and its GLSL, an expression. `half` keeps it in half floats, and `gate`
  stops keeping a thing whose value is 0 or under.
- `outs`: each name the program may give, a number or a colour, with what it is when the program does not
  give it (`none`) and what is put round the program's value (`wrap`).
- `program`: the sheet's program, if it has one.
- `keeping`: the GLSL the keeping shader needs of the plugin: its uniforms and rolls (`head`), and the
  statements that set a thing up and say the point the program is run at (`begin`).

The keeper decides what becomes of each value:

- **live**: it reads a name of the program that moves, so it runs in the plugin's shader each frame.
- **kept**: it is the thing's own or reads a name the program gives, so it is worked out once.
- **plain**: it is the sheet's own number, kept nowhere.

`room({ cols, rows, count, uniforms })` makes the textures: a grid of slots of `count` things each, a texel
a thing. The plugin says which slot is to hold what with `want(col, row, a, b)`, says a slot is no longer
right with `stale(col, row)`, and calls `keep(renderer)`, which draws the keeping shader over the slots
wanted and not held, and draws nothing when there are none. `reading(groups?)` is the GLSL the plugin's
shader holds and the uniforms it reads: `<prefix>ValOf(slot, i)` picks the thing, `<prefix>ValPoint(p)`
gives the program its point, and `<prefix>Val<Name>()` reads a value, whatever became of it. `drew()` is
how many slots a room has written, so a plugin that writes everything every frame is seen at once.

grass3d keeps each blade of each tile round the camera this way, and hair3d each lock and each strand.

**Browser half (`gpgpu3d.plugin.ts`).** `keeper(plugins, spec)` makes a keeper from a spec. `program(plugins, name, program, allowed?, what?)` compiles a program
over the ops the scene delivers: `{ glsl, outs, kinds, at, uniforms }`, the GLSL for the plugin's shader, the name of
the function of each of its outputs (`float f()`, or for a colour `vec3 f( vec3 base )`, `base` the plugin's own
colour), `kinds` (each name's `'number'` or `'colour'`), `at` (`void f( vec3 p )`, which the shader calls once with
the point before it reads an output), and the shared uniforms it reads (`gpTime`). `fill(plugins)` asks every `things` mod, packs what they hand
back, and writes the texture when it has changed. Its `afterTick` fills it; a plugin whose pass runs as
the scene is drawn fills it again there, so a capsule stands where its bones are drawn. It hands out
`shader(plugins, who)` for the plugin `who`:

- `glsl`: the uniforms, `gp`, `gpRow`, `gpWord`, `gpVel`, every word's GLSL, and for the things `who`
  meets: `gpCount`, `gpThing(i)`, `gpLineOf(s, …)`, `gpPushOf(s, …)`, and `gpLine(from, dir, far, t,
  normal)`, where a line first meets any of them.
- `uniforms`: what that GLSL reads, each the same object for as long as the page lives.
- `words`: the words in the order `gpWord` numbers them, for a plugin that keeps a table of its own over
  the same things, as grass3d does.
- `things()`: the things `who` meets as they were last filled, for what a plugin does with them on the
  CPU, as grass3d tramples its ground.

## Using it

1. List `gpgpu3d` with `render3d`, before gpuparticle3d and grass3d.
2. Give `world.gpgpu3d` its reach, who hands it things, who delivers their words, and who meets what:

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

3. Name gpgpu3d where a plugin asks what is in the way:
   - `"gpuparticle3d": { "mods": { "solids": "gpgpu3d" } }`: particles with a `bounce` bounce off it.
   - `"fabric3d": { "mods": { "solids": "gpgpu3d" } }`: fabrics drape on it.
   - `"hair3d": { "mods": { "solids": "gpgpu3d" } }`: locks are kept out of it.
   - `"hair3d": { "mods": { "keeper": "gpgpu3d" } }`: what each lock and each strand is, is kept by
     gpgpu3d's keeper, a hair's `program` compiled with it. hair3d needs it.
   - `"grass3d": { "mods": { "pressed": "gpgpu3d", "behaviors": ["box3dvehicle", "walker"] } }`: it
     presses the grass, each thing as grass3d's behavior of its word says.
   - `"grass3d": { "mods": { "keeper": "gpgpu3d" } }`: what each blade is, is kept by gpgpu3d's keeper, a
     grass's `program` compiled with it. grass3d needs it. With `ops: ["grass3d"]` in
     `world.gpgpu3d.mods`, a program reads grass3d's `dist` beside gpgpu3d's ops.

A plugin of its own pass puts `shader(plugins, '<its name>').glsl` in its shader, spreads the `uniforms`
into its material's uniforms, and calls `gpLine`, or walks `gpThing(i)` for `i` under `gpCount` and
calls `gpPushOf`.

The demos: demo_gpuparticle3d's `bounce` scene (hail on hills and shapes), demo_fabric3d (cloths on
shapes, capes on bodies), demo_grass3d (a car's tracks through a meadow) and demo_hair3d (long hair
lying on a body's shoulders).

## Plugins it works with

- **render3d**: three.js and the camera the reach is measured from.
- **shapes3d**: `shapes3d.gpgpu3d.ts` (`things`, `behaviors`) hands every box, plane, hyperplane and
  cylinder within reach, where the frame draws it, and delivers those four words.
- **terrain3d**: `terrain3d.gpgpu3d.ts` (`things`, `behaviors`) hands the land round the camera as a
  window of heights on the finest ring's lattice, filled in terrain3d's workers, and delivers `land`.
- **anim**: `anim.gpgpu3d.ts` (`things`, `behaviors`) hands the capsules `world.anim.kinds.<kind>.capsules`
  makes of each body's bones, each between two bones or a ball one bone carries, and delivers `capsule`.
- **motion3d**: `motion3d.gpgpu3d.ts` (`things`) hands its bodies' capsules, of anim's word.
- **puppet3d**: `puppet3d.gpgpu3d.ts` (`things`) hands the capsules `world.puppet3d.capsules.<kind>` makes
  of each body's bones, of anim's word.
- **box3dvehicle**: `box3dvehicle.gpgpu3d.ts` (`things`, `behaviors`) hands each car's body and wheels
  and delivers `hyperbox`, a box turned any way.
- **walker**: `walker.gpgpu3d.ts` (`things`) hands each walking body as a `cylinder`, shapes3d's word.
- **gpuparticle3d**, **fabric3d**, **hair3d**, **grass3d**: `gpgpu3d.<plugin>.ts` hands each what it
  asks for; `gpgpu3d.grass3d.ts` and `gpgpu3d.hair3d.ts` have `keeper` too.
- **grass3d**: `grass3d.gpgpu3d.ts` (`ops`) delivers `dist`, the op of a blade.

## Keywords

GPGPU, GPU collision, colliders on the GPU, float texture, heightfield, ray cast in a shader, line cast,
push out, capsule, oriented box, bounce, cloth collision, hair collision, trampled grass, particles,
terrain collision, shapes, noise on the GPU, procedural fields, operations, op list, program, shader
compiler, keeper, kept values, work it out once, render target cache, `gpLine`, `gpPushOf`,
`world.gpgpu3d`, `things`, `behaviors`, `ops`, `meets`, `shader`, `program`, `keeper`
