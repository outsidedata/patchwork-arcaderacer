# fabric3d

Fabric moved on the GPU: a flag on a mast, a cape on a body, a ribbon on a stick, a banner behind a plane,
a cloth dropped over a table, a skirt or a shirt from the garment shop worn by a body. A fabric is its
points: a grid of them, or the sewn mesh of a garment. Each point is a texel of float textures, moved by
shader passes through render3d's renderer and drawn as one mesh. No point is on the CPU and nothing is
read back.

## Why use it

Use it for cloth that hangs, flies, trails and drapes, and that nothing in the game's rules needs to know
about. A fabric is the page's alone: it has no row, no prefab and no server half, every page moves its
own, and two seats never see exactly the same folds.

## How it works

fabric3d knows no cloth, no shape and no body. It keeps a table from a word to that word's behavior, and
is handed what a fabric meets and what holds it by mods. It owns what is the same for every fabric: the
passes, the pins, the clock and the mesh.

**The fabrics file** (`world.fabric3d.fabrics`, a `json` entry of the loader's catalogue) is
`{ fabrics: { <name>: fabric } }`. A fabric gives its `weight`, how hard it holds its lengths (`stretch`,
`bend`), its `drag`, how much wind it catches (`catch`), its `friction`, how `thick` it is, its `pins`, and
two words: its cut and how it is drawn. The header of `fabric3d.plugin.ts` says every field and its unit.

**Words.** Each plugin `world.fabric3d.mods.behaviors` names delivers words:

| word | from | what |
|---|---|---|
| `plane` | shapes3d | a grid's cut: `{ size: [x, z] }`, a rectangle `x` metres across its columns and `z` along its rows |
| `garment` | loader | a sewn cut: `{ model, file }`, a garment a bake draped on a body the game draws, its glb and its sidecar |
| `paint` | solids | a drawing: `{ colour, roughness?, metalness?, glow?, opacity?, map?, scale? }`, a lit material |

A fabric has one cut and one drawing. A word nothing delivers throws when the file is read.

**Cuts.** A cut is a grid or sewn. A grid gives `points` `[columns, rows]` and `shear`, and each point is
held to its neighbours along the weave, across it and two along. A sewn fabric is a mesh of triangles in
pieces, a garment's pattern pieces: each point is held to the points it shares a triangle's edge with and
to the point across each edge. It gives no `points` and no `shear`.

**A garment.** A bake's `garment` tool (`scripts/bake.ts`, `scripts/garment.ts`) has the library's garment
shop drape one of its kits on the game's own baked body, and writes the garment as it came to rest there:
a glb with a mesh for each pattern piece, and a sidecar with the frame each of the body's bones stood in.
The catalogue lists the two, the fabrics file names them in a fabric's `garment`, and the fabric is worn by
every body of the kind an `attach` names, pinned by its pieces.

**Things.** A fabric is held to things, each handed by a mod as `{ key, of, point(on) }`: what it is
(`of`) and its points by their words.

| key | from | the things | their points |
|---|---|---|---|
| `sources` | anim | every body anim draws | its bones, its props, the empties in its props |
| `sources` | motion3d | every body motion3d draws | the same |
| `sources` | shapes3d | every box, plane, hyperplane and cylinder | `pos` |
| `sources` | a game's own plugin | whatever it draws | whatever it names |

**Pins.** A pin `{ on, from, to?, at?, turn? }` holds the points from column and row `from` to `to` to the
thing's point `on`. The first point sits at `at` in that point's frame and the rest keep their places from
it, turned by `turn`: one point pins a corner, an edge pins the fabric stiff along a pole. A sewn fabric's
pin is `{ on, piece }`: every point of that piece, held where it lay from the bone `on` when the garment
was draped, as the bone has since moved: a skirt's waistband on the hips.

**Attach.** `world.fabric3d.attach` puts fabrics in the scene: `{ fabric, of }` keeps one on every thing
that is `of`, and `{ fabric, at, turn? }` lays one with no pins at a place and lets it fall.

**What it meets.** What a fabric drapes on is the `solids` mod's, held on the GPU: gpgpu3d's
(`world.fabric3d.mods.solids: 'gpgpu3d'`), the things the scene's `world.gpgpu3d` holds for fabric3d.
Every fabric is kept `thick` clear of each: out of shapes3d's boxes and cylinders, off its planes and
hyperplanes from the side it was on, off terrain3d's land, and out of the capsules of anim's and
motion3d's bodies (`world.anim.kinds.<kind>.capsules`, `[{ from, to, radius }]` between bones). A fabric
does not meet itself or another fabric.

**The wind** is the `wind` mod's (weather3d's, `weather3d.fabric3d.ts`), or `world.fabric3d.wind`, [x, y,
z] metres a second, with
`turbulence` `{ size, strength }` for gusts. It pushes each point across the fabric's face there.

**The clock.** A fabric is moved to the moment the frame draws, inside the scene's draw, once a frame,
before anything of the frame is drawn. There every bone and prop stands where render3d draws it, between
the steps, so a pinned edge never trails or leads what holds it. A frame's time is cut into substeps no
longer than `substep`; each one moves the points, pulls them back to their lengths `passes` times, and
pushes them out of what they meet. A thing that teleports (`userData.teleport`) has its fabrics laid
again where it now is.

## Using it

1. List `fabric3d` before `render3d` (listed after it, it throws). It needs `loader` and `render3d`, and
   `gpgpu3d` for what its fabrics meet.
2. Write the fabrics file and add it to the scene's `loader` catalogue.
3. Give `world.fabric3d`:

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
   "gpgpu3d": { "reach": 60, "mods": { "things": ["shapes3d", "anim"], "behaviors": ["shapes3d", "anim"] } },
   "anim": { "kinds": { "xbot": { "capsules": [{ "from": "Spine2", "to": "Neck", "radius": 0.16 }] } } }
   ```

4. On the page, `plugins.fabric3d.fabrics` lists each fabric in the scene, and `places(key)` reads one's
   points back from the GPU for a testbed's readout.

A game hands its own things over with a mod beside its own plugin,
`games/<game>/plugins/<a>/<a>.fabric3d.ts`, exporting `sources(plugins)`.

`games/demo_fabric3d` shows each of these in one yard; its `dev.html` tunes the wind and every fabric
while it runs.

## Plugins it works with

- **render3d:** the renderer its passes run through, the scene it draws in, and `dress`, which lights its
  materials.
- **loader:** the fabrics file, and a paint's picture. `loader.fabric3d.ts` delivers the cut `garment`,
  from a garment's glb and sidecar in the catalogue.
- **gpgpu3d:** `gpgpu3d.fabric3d.ts` is what every fabric meets: the things gpgpu3d holds on the GPU,
  filled again the moment the fabrics are moved.
- **shapes3d:** `shapes3d.fabric3d.ts` delivers the cut `plane` and hands every shape as a thing to hold
  a fabric to, between its last two steps as it is drawn.
- **solids:** `solids.fabric3d.ts` delivers the drawing `paint`.
- **anim, motion3d:** `anim.fabric3d.ts` and `motion3d.fabric3d.ts` hand every body they draw, to hold a
  fabric to.
- **weather3d:** `weather3d.fabric3d.ts` hands the wind as the weather blows it.
- **lights3d:** a fabric's mesh is marked moving and carries its own distance material, so its shadow is
  drawn every frame.

## Keywords

cloth, fabric, flag, cape, cloak, ribbon, banner, curtain, tablecloth, drape, garment, skirt, shirt, dress,
clothes, sewing pattern, GarmentCode, GPU cloth, GPGPU, position
based dynamics, float textures, ping-pong, pins, capsules, wind, three.js, render3d, `world.fabric3d`
