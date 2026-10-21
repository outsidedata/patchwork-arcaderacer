---
name: using-mixamo-assets
description: Use in core, or any clone of it, when a Mixamo, Adobe Fuse or other mixamorig-skinned character FBX (from the library, `PATCHWORK_LIBRARY`, e.g. characters/farmer_woman) is brought into a game or swapped for one a game already draws through anim (X Bot, Y Bot, a raider, a fighter, a player body), or made into a new kind that walks and is animated (a bystander, a crew, townspeople, NPCs idling, walking and talking). Also when a baked character looks like shiny metal or wet plastic, its shine is inside out, its hair or lashes are black cards, a rifle or other prop sits wrong in its hand after a body swap, or the anim rig's `bodies`, `anim.export.py` or a rig's `table` come up.
---

# Using Mixamo assets

A Mixamo-rigged character reaches a game one way: the anim rig file names it under `bodies`,
`plugins/anim/anim.export.py` bakes every clip of the rig onto it in Blender, packs it with gltfpack
and writes it as a glb to the loader `model` entry of the same name, and measures the rig's `table`.
Nothing else turns an FBX
into what the game draws. The headers of `plugins/anim/anim.sim.ts` (the rig file) and
`anim.export.py` (the bake) are the whole of it; this skill is the order the work is done in and the
checks that catch what goes wrong. **REQUIRED:** `bringing-in-art` for the catalogue and loader.
When the character is a new kind with rules of its own (a townsperson, a crew, a bystander, an enemy
of a new sort) and not only a new body for a kind that exists, **REQUIRED:** `designing-a-kind`
too, loaded before any of this, and step 2b below.

Every script named here is in `scripts/` beside this file. Blender is
`/Applications/Blender.app/Contents/MacOS/Blender`, run `-b --factory-startup --python <script> -- <args>`.
The bake's settings, `BLENDER`, `PATCHWORK_LIBRARY` and `GLTFPACK`, come from the shell, else from
`.env` at the repo's root, copied from `.env.example`, which lists them with their defaults. `yarn
health` runs each one and says the fix for any that fails.

## 1. Inspect the FBX before anything

`scripts/probe_fbx.py <fbx> [<fbx> ...]` prints each file's armature, bone names, meshes with their
materials, height, hip height, armature scale and images. Run it on the new body and the body it
replaces. Check:

- The bones are `mixamorig:<Name>`, the same names as the clips' (the bake strips the prefix). A rig
  of other names takes no clip.
- The height is a person's (about 1.6 to 1.9 m). The bake keeps each body's own limb lengths and keys
  only the hips' position, so a body of other proportions still plays every clip; its hip height
  goes into the table on the next bake.
- `images` named `…_diffuse`, `…_gloss`, `…_specular`, `…_normal`, often with a `…_diffuse.001`: a
  Fuse or Mixamo spec/gloss body (step 3).

## 2. Swap or add the body

The rig file's `bodies` is `{ <model entry>: "<fbx under the library>" }`. The library is
`PATCHWORK_LIBRARY` from the shell or `.env`, else `~/patchwork-library`, and a rigged character is
`characters/<name>/<name>.fbx` in it, one folder each: `farmer_woman`, `farmer_man`, `farmhand`,
`mechworker`, `soldier`, `soldier_woman`, `xbot` (Mixamo's X Bot, meshes `Alpha_*`) and `ybot` (Y Bot,
`Beta_*`). A new body is put there first. To swap a body, point its existing key at the new FBX; the
kind, the catalogue entry, the glb path and every scene keep their names. To add one, add a key, a
`model` entry of that name in `world.loader.assets`, and a `world.anim.kinds.<kind>` naming it.

## 2b. A new kind that walks and is animated

Before reading any plugin header, find the kind in the game that already walks on walker and is
drawn by anim (`grep -l "animate(" games/<game>/**/*.sim.ts`). Read its rule, its walker, anim, hitscan3d
and ragdoll3d entries in the scene, and its rig file: they are the whole shape, and the new kind is
written by it. Then decide, each one a choice in the scene and none in code:

- **Its own rig, or the existing one.** A rig is its clips. A body that should move as the existing
  kind moves (the same rifle stance, say) is one more key in that rig's `bodies`. A body that moves
  differently (unarmed, a worker, a civilian) gets a rig file of its own beside its glb, with its own
  `clips`, `roles` (`still` alone for a body that never leaves the ground) and `stances`, and only
  the clips it plays: a clip in the rig is baked onto every body of it.
- **Where its clips come from.** `~/troupe-collection/packs/` holds the packs by name (`Male
  Locomotion Pack 30FPS` for an unarmed idle, walk and turns, `Gestures Pack Basic 30FPS` for
  nods and shrugs) and `packs/mixamo-motions/` single clips (`Talking*.fbx`, `Talking At
  Watercooler.fbx`). Find them with `find ~/troupe-collection/packs -iname "*<word>*"`. A walk clip
  is a gear (`loop`, `gear: 0`); an idle or a talk played in place is a `loop` played by `play`, or
  a gesture on the upper channel over the `still` role. Beside them, `packs/mixamo-catalogue.json`
  is Mixamo's own word on every clip (its name, description, params, length, whether it loops or
  stays in place), keyed by id, each clip's `file` its path; and `packs/mixamo-measures.json` is each
  clip measured on its own Mixamo skeleton, keyed by that same path: the bake's table row (length,
  travel forward and left, turn, the hips' rise, height and dip, the right hand's fastest moment),
  every limb segment's fastest moment (`segments.<segment>`: when, how fast, where its end is and the
  way it moves, what a blow lands with and how high), and every segment's ends on every frame. It
  says which way a walk goes, which hand or foot an attack lands with and when, before any clip is
  baked. `scripts/measure-clips.py` writes it, a pack folder at a time:

  ```
  Blender -b --factory-startup --python scripts/measure-clips.py -- \
      ~/troupe-collection/packs/mixamo-measures.json "<pack dir>" ["<pack dir>" ...]
  ```

  It holds the Great Sword, Pro Sword and Shield, Pro Melee Axe and Boxing packs.
- **What it is solid to, and what is solid to it.** `world.walker.kinds.<kind>.bodies` lists the kinds
  it walks round; another kind walks round it only if that kind's `bodies` lists it. A bystander
  that must not block the player lists only its own kind, and no other kind adds it.
- **Whether it can be shot.** A kind is a body to hitscan3d only with a `world.hitscan3d.kinds`
  entry; scenery has none, so no round meets it. No `hp`, no `hit` act, and no rule of any other
  kind names it.
- **Where it stands and walks to.** Never a list on `world` or in its definition: rows in `actors`,
  its own and, for the places it walks between, a kind of their own with one `actors` entry each,
  as `start` is for seats. Two of them never take one place: the place a row has taken is a field
  of that row, and a row chooses only among places no other row holds.

Bake by hand (the editor's Export Models command runs the same script, and the editor is on hold):

```
Blender -b --factory-startup --python plugins/anim/anim.export.py -- \
    <rig.json> <scratch>/table.json <body>=<out.glb> [<body>=<out.glb> ...]
node scripts/merge-table.mjs <rig.json> <scratch>/table.json <rig.json>
```

Every body is baked in one run: the table is measured on the first body named and is the rig's
for all of them. Each glb is packed by gltfpack before it is written (meshopt compression, every
name kept, translations at 20 bits; the header of `anim.export.py`), so a log line
`PACK <out.glb> raw=<bytes> packed=<bytes> meshes=<names>` follows each body's export, and a glb
whose `asset.generator` is not `gltfpack` was not made by this bake. The packing needs the native
gltfpack 1.3 or later (`GLTFPACK`, else `gltfpack` on the PATH; the npm build in `node_modules` is
never used), which `yarn health` checks. A game that bakes its rigs from a script of its own
(`games/farm/assets/xbot.mjs`, `games/fighters/assets/fighter.mjs`) runs this export and
`merge-table.mjs`, and packs nothing itself. `merge-table.mjs` writes the table into the rig in the rig's own layout (one-space
indent, every number array on one line); a plain `JSON.stringify` rewrites the whole file. Its
remaining arguments `<body>=<fbx>` also set `bodies` in the same write. The diff of the rig after it
holds only the `bodies` lines and the table's numbers.

## 3. Fuse and Mixamo materials

Blender's FBX importer reads a spec/gloss material as Metallic 1 with the gloss map plugged straight
into Roughness. Baked so, cloth and skin draw as polished metal with their shine inside out, and the
alpha comes from a non-colour duplicate of the diffuse (`….001`) that glTF cannot pack.
`anim.export.py`'s `metal_rough` fixes every such material on every bake: a material whose Roughness
is fed by an image named `gloss` gets Metallic 0, roughness from that image inverted, no specular
map, and alpha from its base colour's image clipped at one half (glTF `MASK`), or none when that
image is opaque. Its log line is `METAL_ROUGH <material> alpha=clip|opaque`.

Check it on every bake of a new body:

- The bake's output has a `METAL_ROUGH` line per material of each Fuse body.
- `node scripts/glb-materials.mjs <out.glb>`: every material `"metallicFactor": 0`, a `…_gloss_rough`
  image, `"alphaMode": "MASK"` where hair, lashes or brows are, and no alpha on an opaque one.
- `scripts/render_glb.py <out.png> <a.glb> [<b.glb>]` renders the baked glbs in their `idle` clip,
  three to a picture (its camera frames three). Blender's glTF importer refuses a packed glb, so it
  first unpacks each through `node scripts/unpack_glb.mjs <packed.glb> <out.glb>`, which decodes the
  meshopt buffers with three's decoder; that script alone is how any other Blender tool reads a bake.
  Read the PNG. Cloth is matte, skin is skin, hair is cut out. Any metallic sheen is a material the
  rule missed: its Roughness is fed by something not named `gloss`, which `scripts/probe_mats.py
  <fbx>` shows, link by link. That case is fixed in `metal_rough`, never by hand in the glb.

## 4. Props on a bone

`world.anim.kinds.<kind>.props: [{ model, bone, at, turn }]` hangs a model on a bone: `at` metres and
`turn` degrees, a three.js `'XYZ'` Euler, in the bone's scale-free frame. Two Mixamo bodies roll
their hand bones differently (10 to 25 degrees is common), so a prop tuned on one is turned on the
other. Refit each kind's props for its new body:

```
Blender -b --factory-startup --python scripts/refit_prop.py -- \
    "<troupe>/packs/<pack>/<clip the prop is held in>.fbx" <bone> <old body fbx> <new body fbx> <ax,ay,az> <tx,ty,tz>
```

It poses both bodies on the clip's first frame as the bake does and prints the `at` and `turn` that
keep the prop's turn in the world and its offset from the bone. three.js's `'XYZ'` is Blender's
`'ZYX'`; the script converts both ways. Write the new numbers into every scene that holds the kind's
`anim` table (in mech: training, defense, night, highlands).

## 5. Look at it in the game

Look at the body in a gym scene: the game's own scene with the bodies standing from the first step,
render3d's camera (`prefabs.render3d.camera` `at`/`look`, world metres) a few metres in front of them
at eye height, and nothing that moves the camera: no `player`, no seat's vehicle, no HUD.
`games/mech/gym.scene.json` and `gym.sim.ts` are such a scene, entered at
`dev.html?tab&scene=gym`. A body put in the scene's `actors` with `grounded` true stands on the
ground on its first step. A chase or cockpit camera, a wave timer, or moving rows from the console
to get a view are the wrong tools.

## 6. Prove and land it

- The game's tests beside what changed: the kinds that draw the body, the scenes whose props were
  refitted, and the gym's own `<gym>.sim.test.ts`.
- The games repo is `games/`, its own git repo. Both it and core are on `dev` before the work starts
  (`git -C games branch --show-current`); commit each on `dev`.

## Common mistakes

| Mistake | What happens |
|---|---|
| Kind and catalogue names changed with the body | Every scene, rule and test that names them breaks; swap the FBX under the existing key. |
| Table not written back after a hand bake | The rig's travel and hip heights stay the old body's. |
| `JSON.stringify` on the rig | Thousands of lines of diff for a few numbers. |
| Materials not checked after a bake | The character draws as chrome. |
| Prop `turn` read as Blender's `'XYZ'` | The refit turns it the wrong way. |
| Viewing through the player's camera | The body is a speck behind the mech or under the dashboard. |
