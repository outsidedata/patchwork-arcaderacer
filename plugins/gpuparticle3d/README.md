# gpuparticle3d

particle3d with every particle on the GPU. It plays particle3d's effects files unchanged: every layer
field, force generator, driver, lamp, `carry`, `land`, word, flipbook field (`start`, `blend`, `channels`,
`erode`) and attachment means what particle3d's README says it means. What differs is where a particle lives. No particle is on the CPU. Each one is a texel of float
textures, moved, thrown, sorted and drawn by shader passes, so an effect can hold as many particles as
its file's `cap` without any per-particle work in JavaScript.

## Why use it

Use it in place of particle3d where a scene throws more particles than the CPU can move each frame:
big explosions, dense smoke, storms of sparks. A scene changes from one to the other by naming
`gpuparticle3d` where it named `particle3d`, in `plugins`, `world`, the ledger row and the mods. The
effects file stays the same.

## How it works

**Server half (`gpuparticle3d.sim.ts`).** It is particle3d's ledger under gpuparticle3d's name: one
`gpuparticle3d` row with `next` and `live`. `emit(w, effect, at, spawn)` adds an entry, and each step
ages the entries and drops the ones past their life or past `world.gpuparticle3d.hold`.

**Browser half (`gpuparticle3d.plugin.ts`).** The CPU keeps the effects: their clocks, their bursts
and which slot each particle is in. It rolls each particle's life the way the GPU rolls it
(`hash.ts`), so it knows the step each particle dies and frees the slot without reading anything back.
Each step, through render3d's renderer, it runs these passes:

- **step:** moves every particle by its forces and force generators (`glsl.ts`'s `move`), bounces it
  off the solids and the floor, and frees its slot when it dies.
- **carry:** puts each effect a particle carries where that particle is.
- **spawn:** draws one point per particle thrown, into its slot.

Once per drawn frame, for the camera drawing it, it runs:

- **keys and sort:** each particle's distance from the camera, bitonic-sorted so the draw lays the
  farthest first.
- **look:** each particle's quad worked out once: its place, axes, edges, frame, flips and colour, and
  for a flipbook the next frame, how far it is laid into it and where its opacity is cut.
- **draw:** one instanced mesh per sheet page and per way a layer reads its picture (its `channels`,
  `blend` and `erode`), plus the same for the built-in shapes and for flat squares, each instance
  reading its corner off the look.

Free slots are handed out lowest first, so the particles held sit low in the textures. The step, the
sort, the look and the draw cover only the slots up to the highest one held, not the whole cap.

The layers, force generators and frames are packed into one float texture (`pack.ts`, laid out in
`layout.ts`). The running effects are another texture, one row each, holding the time the effect was
born, so the GPU works out its age. The CPU uploads a table only when something in it changed: a
driven number, an effect that moved, a new burst.

Each played layer has a slot of its own in the table, and a particle holds its layer's offset on the
GPU. An effect driven by its own `drivers` (particle3d's README, Drivers) plays from layers of its own,
so two cars' exhausts are two sets of records; a layer keeps its slot while any running effect plays
from it or has particles of it, and its slot goes to another layer only after.

The file's `cap` sets the size of the state textures: S × S texels, where S is the smallest power of
two whose square holds the cap. A particle thrown when every slot is taken is dropped, as particle3d
drops it.

Nothing is read back from the GPU. One result: a lamp or a landing on an effect that a particle
carries stays where that effect was thrown, instead of following the particle.

### Words

A layer field that is not one of particle3d's is a word, drawn by a Drawer that a mod delivers
(`world.gpuparticle3d.mods.behaviors`). The particles are on the GPU, so a Drawing is handed the
textures they are in, not a list of places. Each frame, `frame(view)` gets:

- `S`, `slots` and the five state textures;
- the table, effects and live textures;
- `prelude`, the GLSL that reads them;
- `particles`, each `{ slot, pick }` of its layers. This is the same list object while none of them is
  thrown or dies, so a Drawing can skip its work when the list has not changed.

instances3d delivers `mesh` (`instances3d.gpuparticle3d.ts`). It draws each particle as an instanced
mesh placed on the GPU.

## Using it

1. List `gpuparticle3d` before `render3d` (listed after it, it throws), add one `gpuparticle3d` row
   (`{ "next": 0, "live": [] }`), and give `world.gpuparticle3d: { effects, hold }`. Add
   `mods: { solids: 'gpgpu3d', behaviors: ['instances3d'] }` for bouncing particles and mesh
   particles, with gpgpu3d listed before gpuparticle3d and holding what they bounce off
   (`"gpgpu3d": { "reach": 64, "mods": { "things": ["shapes3d", "terrain3d"], "behaviors": ["shapes3d", "terrain3d"] } }`). Add `attach` and `mods: { sources: ['box3dvehicle'] }` to throw effects from what other
   plugins hand over, a car's wheels and tailpipes (particle3d's README, Attachments).
2. Write the effects file (particle3d's format) and add it to the scene's `loader` catalogue, with any
   sheets it names.
3. In a rule: `emit(w, 'blast', pos, { scale: 2 })`. On the page:
   `plugins.gpuparticle3d.emit('spark', at)`, `has(name)`, `drive(name, value)`, `drivers`, `effects`,
   `count`.

`games/demo_gpuparticle3d` is demo_particle3d's scene played by gpuparticle3d, and its `bounce` scene
is particles bouncing off the land and shapes gpgpu3d holds. The particle workshop's
"Drawn by" setting plays any effects file with either plugin.

## Plugins it works with

- **render3d:** the renderer its passes run through, and the scene and camera it draws in.
- **gpgpu3d:** `gpgpu3d.gpuparticle3d.ts` is the solids for `bounce`: the things gpgpu3d holds on the
  GPU, shapes3d's boxes, planes, hyperplanes and cylinders and terrain3d's land.
- **instances3d:** `instances3d.gpuparticle3d.ts` delivers the `mesh` word.
- **box3dvehicle:** `box3dvehicle.gpuparticle3d.ts` hands each car's wheels and tailpipes as sources
  for `attach`.
- **lights3d:** draws every `lamp`. Without it, lamps are not drawn.
- **loader:** the effects file and the sheets.
- **particle3d:** the CPU original, with the same files and the same fields.

## Keywords

GPU particles, GPGPU, particle simulation on the GPU, float textures, ping-pong, bitonic sort,
instanced quads, three.js, render3d, explosions, smoke, sparks, `emit`, `world.gpuparticle3d`
