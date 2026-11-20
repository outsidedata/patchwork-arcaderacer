# instances3d

Many copies of one look drawn as instanced meshes: one InstancedMesh per part, row and shell, each copy
with its own place, turn, size and grey. It places nothing itself. Other plugins hand it what to draw
through mods, and a game picks in its scene which of its things are drawn this way.

## Why use it

Use instances3d when a scene has many of the same thing: a forest lod3d places, a pile of box3d crates,
a row of shapes3d pillars. Fifteen crates are one draw call instead of fifteen, and no kind needs a
look file of its own.

## How it works

**Server half (`instances3d.sim.ts`).** No row and no rule: the numbers of a look and their check, read
by the page and by the mods on either side.

A look is one of `asset` (a loader `model` whose meshes are named `<row>-<lod>[-<part>]`), `shape` (a
lumpy boulder) or a word a mod delivers geometry for (`body` from box3d, `form` from shapes3d), with
`lods`, `shadow`, `leaf`, and for a shape or a word its paint: `colour`, `roughness`, `metalness`, an
optional noise `surface`, a `map` laid at `scale` metres to a span, and `flat`.

**Browser half (`instances3d.plugin.ts`).** Two ways in:

- `instances(plugins, spec)` hands a placer an Instances of a look's rows out to its shells. The placer
  adds instances to a shell and takes them out again; instances3d keeps each row and shell packed,
  grows it when full, sends only the slots written each frame, and clips what it draws out of the boxes
  `frame` is handed. lod3d draws through it.
- `world.instances3d.kinds` names kinds whose rows it draws itself, one instance a row, each frame where
  its `instances` mods put them.

A model's cards are cut at `world.instances3d.cutout` and gain `coverage` per mip level; a part named
`billboard` faces the eye. An instance with a turn (`rot`) is drawn as turned; one without stands on
its normal, as a placed tree does.

## Using it

1. List `instances3d` before `render3d`.
2. Give `world.instances3d`: `cutout` and `coverage` when a model has cards, `kinds` for the kinds it
   draws itself, and `mods: { instances: [...], behaviors: [...] }` naming the plugins that hand it rows
   and geometry.
3. For lod3d, name `instances3d` in `world.lod3d.mods.behaviors` and give each layer a `mesh` look.
4. For particle3d, name `instances3d` in `world.particle3d.mods.behaviors` and give a layer
   `"mesh": { "rows": [...], "look": { ... }, "seed"?: n }`: each particle is one instance of one of the
   look's rows, where it flies, turned by its spin and at its size, so debris is real rocks that tumble,
   fall and bounce.

```json
"instances3d": {
  "mods": { "instances": ["box3d"], "behaviors": ["box3d"] },
  "kinds": { "crate": { "body": {}, "colour": "#b07a43", "roughness": 0.8, "lods": [0], "shadow": 1, "leaf": 0 } }
}
```

## Plugins it works with

- **lod3d**: `instances3d.lod3d.ts` delivers lod3d the `mesh` word, so a layer's instances are drawn
  here (demo_lod3d).
- **particle3d**: `instances3d.particle3d.ts` delivers particle3d the `mesh` word, so a layer's
  particles are drawn here as meshes (the particle workshop's `explosion`).
- **box3d**: `box3d.instances3d.ts` hands it every body row and the `body` geometry (demo_box3d).
- **shapes3d**: `shapes3d.instances3d.ts` hands it every shapes3d row and the `form` geometry, the same
  shapes solids draws.
- **box3dvehicle**: through lod3d's `hollows`, no instance is drawn inside a car.
- **render3d**: draws everything and dresses every material; **loader**: models and pictures.

## Keywords

instancing, InstancedMesh, draw calls, LOD, level of detail, billboard, alpha test, alpha to coverage,
vegetation, props, crates, bodies, shapes, `instances`, `world.instances3d`
