---
name: importing-external-assets
description: Use in core, or any clone of it, whenever art made outside core comes in - a downloaded pack of FBX, glTF, OBJ or .blend files and their textures (Sketchfab, itch.io, a store, a zip someone hands over), a Mixamo or Fuse character with its clips, a prop pack, trees, bushes - and goes into the library, `PATCHWORK_LIBRARY` (~/patchwork-library), under `props/`, `characters/` or `textures/`. Also when a model shows grey, untextured or at the wrong size, when a texture is missing, when asked to "inspect" a model or a pack, and before any of a pack is baked into a game. It covers `yarn inspect` in the library and what it reports.
---

# Importing external assets

Art made elsewhere comes into the library as the raw files it was delivered as. The library holds the
raw parts; a game ships only what is built from them (`bringing-in-art`: a glb packed by gltfpack, a
`.webp` texture). Nothing raw goes into a game, and nothing built goes into the library.

## The library

`~/patchwork-library`, or `PATCHWORK_LIBRARY` from the shell or core's `.env`. It is not a git repo,
and it stays that way: never `git init` it, never commit it.

| Folder | Holds |
|---|---|
| `characters/<name>/<name>.fbx` | a rigged character, its clips in it or beside it |
| `props/<group>/<pack>/` | a prop pack as delivered: its model file and the textures it reads, at the paths it reads them from |
| `textures/cc0-textures/<zip>/` | a cc0-textures.com set (`yarn cc0-textures:download`) |
| `trees/` | `trees.py`, which grows trees with Blender's Sapling Tree Gen from a game's `<name>.trees.json`, and `species/` recipes; a game's bake runs it from the library (`trees/README.md`) |

A group is what the props are (`anime_trees`); a pack keeps the name it came with
(`jabami-anime-tree-v1`), so a file can be traced back to its download.

## The work, in order

1. **Find the model files in what was handed over.** The model files are what is wanted: `.fbx`,
   `.glb`, `.gltf`, `.obj`, `.blend`. When they are inside zips, the zip that holds the model and its
   textures is extracted straight into the library folder of its pack, one `unzip` per zip:
   `unzip -o "<pack>/source/<x>.zip" -d ~/patchwork-library/props/<group>/<pack>`. An FBX reads its
   textures from the `<name>.fbm/` folder beside it, so the folder the zip holds is kept as it is.
   Nothing is summarised about the zips; the files are moved.
2. **Inspect the pack where it now lies**: `yarn --cwd ~/patchwork-library inspect props/<group>`.
   Every PROBLEM is fixed before the pack is used: a missing texture is found in what was delivered
   (a loose `textures/` folder beside the zip often holds the same files) and put where the model
   reads it. A texture that is nowhere is reported to the person who handed the pack over, by its
   name, never replaced with another picture.
3. **Read the notes.** They are not problems, but each says something the bake must do:
   - `<object> is scaled 0.01 0.01 0.01`: the unit fix is on the object. The script that builds the
     game's glb applies it into the mesh (`transform_apply(scale=True)`) before anything instances the
     mesh, or the prop is drawn 100 times too big.
   - `picture <a> is read from <b>`: the model names one file and links another; the link is what is
     read, and it is there.
   - `unused picture`: a texture in the pack no model reads, often a spare leaf or bark variant.
4. **Into a game** only through the game's own script beside its art, which reads the library and
   writes built files into `games/<game>/assets/` (`bringing-in-art`, `making-game-assets`). The
   drive game's `assets/stylized/stylized.mjs` is one: Blender (`stylized.py`) builds a plain glb from the
   library's FBX, then gltfpack packs it beside the script. What such a script has to do for
   scatter3d, each found the hard way:
   - Apply the object's 0.01 scale and its place into the mesh, foot at the origin.
   - Split each row by material into nodes of one primitive each, named `<row>-<lod>-<part>`.
     gltfpack keeps node names and drops glTF mesh names, and three names the parts of a node of
     several primitives after the mesh, so a multi-material row arrives nameless: `has no LOD 0`.
   - Never name a part all digits: scatter3d reads `<row>-<lod>-<part>` greedily, so `tree1-0-0` is
     row `tree1-0`. The drive trees use `bark` and `leaf<k>`.
   - Set the Principled alpha to 1 on a material no picture feeds alpha to. The Jabami bark came in
     at alpha 0, which the glTF exporter writes as a cut-out material of alpha 0: trees with no
     trunk.
   - Read the packed glb back before the game loads it: every node named, bark `OPAQUE`, leaves
     `BLEND` (scatter3d cuts them at `cutout`).

## `yarn inspect`

`~/patchwork-library/inspect/`: `inspect.mjs` (the command and its module), `inspect.py` (Blender's
half), `inspect.test.mjs` and `inspect.fixture.py` (real models made by Blender for the tests;
`yarn --cwd ~/patchwork-library test`).

```
yarn --cwd ~/patchwork-library inspect <file or folder> [<file or folder> ...]
```

A folder is every model file under it. Blender (`BLENDER`, else the macOS application) imports each
one into an empty scene and the command prints, per file: each mesh with its triangles, size in
metres (Blender's axes, z up), UV layers and materials; each armature's bones; each material's blend
mode and which picture feeds which socket (`Base Color`, `Alpha`, `Normal`), with the picture's file
and pixel size; each animation clip with its frames and the frame rate. It exits 1 when any of these
is found, each printed as `PROBLEM:`:

| Problem | Means |
|---|---|
| `does not import: …` | Blender could not read the file |
| `holds no mesh` | no mesh and no armature: nothing to draw |
| `<o> has no faces` | a mesh with no polygons |
| `<o> has no material`, `has no material in slot k` | a mesh drawn with nothing on it |
| `<o> has textures but no UVs` | a mesh whose material reads a picture it cannot place |
| `… has an image texture that names no picture` | an empty image node |
| `picture <p>: <file> is not there` | a texture the model reads whose file is missing and not packed in it |
| `picture <p>: <file> is not a picture Blender reads` | a file that is there with no pixels in it |

The last line is `<n> models, <m> problems`.

## Worked: the anime trees (2026-10-19)

Bill's folder held six packs, each `ok/<pack>/source/<x>.zip` plus a loose `textures/` folder of the
same PNGs; the FBX files were only inside the zips. Each zip went into
`~/patchwork-library/props/anime_trees/<pack>/`, the bushes among them:

| Pack | Model | Meshes | Triangles | Size (x × y × z m) |
|---|---|---|---|---|
| `jabami-anime-tree-v1` | `animetree_jabami_01_mesh.fbx` | 1 | 4483 | 5.46 × 4.88 × 8.02 |
| `jabami-anime-tree-v2` | `animetree_jabami_02_mesh.fbx` | 1 | 5895 | 9.27 × 9.43 × 14.19 |
| `jabami-anime-tree-v4` | `medium01.fbx` | 1 | 945 | 4.72 × 4.56 × 8.85 |
| `jabami-anime-tree-v5` | `long01.fbx` | 1 | 909 | 4.56 × 4.30 × 12.79 |
| `jabami-anime-tree-v6` | `long02.fbx` | 1 | 878 | 5.08 × 5.19 × 11.07 |
| `jabami-anime-bush-v1` | `animebush_jabami_pack.fbx` | 4 bushes | 160–480 each | 3.5–6.3 wide, 1.8–2.2 high |

`yarn inspect props/anime_trees`: 6 models, 0 problems. Every mesh is scaled 0.01 on its object;
every leaf material reads one PNG for both its colour and its alpha (cards cut out by alpha, 1024²);
the bark is 512². Three trees name a bark file the zip does not hold (`tron_tree_02_tex.png`,
`tron_tree_03_tex.png`, `bark08.png`) and link one it does (`tron_tree_remast_tex.png`,
`tron_tree_01_tex.png`), which inspect reports as notes. The same command on a copy of tree v5 with
`leave_tree_09_tex.png` deleted exits 1 with `PROBLEM: picture leave_tree_09_tex.png: …/long01.fbm/
leave_tree_09_tex.png is not there`.

## Mistakes

| Mistake | Instead |
|---|---|
| Reporting what the zips hold when the model files were asked for | Extract the model and its textures into the library and inspect them there |
| Asking whether the library takes the raw files or built ones | Raw files in the library, built files in the game |
| Asking where this skill or the library's tools go | The skill in core's `.claude/skills/`, the tools in the library |
| `git init` in the library | It stays off git |
| Taking a texture with no file for "fine because the model imported" | `yarn inspect`: a missing file is a PROBLEM and exit 1 |
| Calling the 0.01 object scale a problem, or ignoring it | A note: the build applies it into the mesh |
| Replacing a missing texture with another picture | Find the delivered file, or name the gap to the person who gave the pack |
