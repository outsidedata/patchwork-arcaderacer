---
name: committing-a-game
description: Use in core, or any clone of it, before every commit of a game's files, and whenever a game is moved or lifted into `games/`, added to the games repo (`outsidedata/patchwork-games`), or its art is committed. A game commits its source and its baked art, never the raw parts its bake reads from the library (`PATCHWORK_LIBRARY`). It covers which files go in and which stay out, the game's `README.md`, written when it has none, `yarn bake <game>` and the game's `<game>.bake.ts`, its cc0 maps, the games repo's own `.gitignore` that lists each game, and `scripts/raw.mjs` beside this file, which names every raw file a game would commit. Triggers on "commit the game", "lift the game", "add the game to games", "move the game into games/", "join the games repo", "raw assets", "baked", "re-bake", "don't commit the source", a .fbx, .blend, .jpg or an unpacked .glb in a game's `assets/`, and `git add` of `games/<game>/assets`.
---

# Committing a game

A game's repo holds what is needed to play it and to make its art again, nothing else. Someone who
downloads the game plays it with no Blender and no library. Someone who wants to make its art again
needs the library, `PATCHWORK_LIBRARY` (not a git repo; each person has their own copy), and runs
`yarn bake <game>`, which reads the raw parts from it and runs the scripts in the game.

So every file a game commits is one of two things:

- **Source**: its code (`.ts`, its pages), its scene files, its data files, every spec a bake reads
  (`<name>.trees.json`, `<name>.foliage.json`, `<game>.sounds.json`, `cc0-textures.json`, a rig file)
  and every script that makes its art (`<game>.bake.ts`, and the `.py` and `.mjs` it runs).
- **Baked**: a file `<game>.bake.ts` writes, in the form every game ships its art: a glb packed by
  gltfpack (meshopt geometry, WebP textures), a picture as `.webp`, a sound, a wad.

Anything else is raw and is never committed: a glb exported by Blender and not packed, an FBX, a
.blend, a full-size texture set, a downloaded pack, a jpg or png copied in from the library. A raw
part lives in the library (`importing-external-assets` puts it there), and the game's bake reads it
from there. One file of art is never committed both as its source and as its baked version.

The rule for art, and the bake's tools (`blender`, `pack`, `webp`, `scratch`, `library`,
`texture`), are `bringing-in-art` (Where a file and its entry go) and the header of
`scripts/bake.ts`. This skill is the check made at the commit.

## The README

Every game commits a `README.md` in its folder, `games/<game>/README.md`. A game moved or lifted
into `games/` without one has it written before its first commit here. It says, in plain words:

- what the game is, and what a player does in it;
- its controls;
- **Playing it**: the commands that play it, `yarn dev` then `/games/<game>/index.html`, and its
  server, `yarn serve <game>`, then `/games/<game>/client.html`;
- **Remaking the art**: `yarn bake <game>`, or the game's own scripts that draw its art and what
  each writes, and what of the library each reads;
- **Credit**, when art or sound is someone else's: what it is, who made it, and where it came from.

Each line is read off the game's own files: its scene, its looks and their headers, its scripts.
`publishing-a-game` copies it over the repo's README in a repo that holds that game alone.

## Where the game is committed

- **In a clone of core**, your own game: `games/<game>/` is committed in your repo like any other
  folder (`publishing-a-game`, Your repo and core).
- **In core's own checkout**: `games/` is its own git repo, `outsidedata/patchwork-games`, which
  core keeps out with a line in `.git/info/exclude`. Every git command for a game runs against
  `games/` (`git -C games ...`), never against `games/<game>`. Its `.gitignore` ignores everything it
  does not list, so a game joins it by a `!/<game>/` line, added in the same commit as the game; a
  game without its line is not committed at all.

## Each kind of art, and what its bake does

Each is a step in `games/<game>/assets/<game>.bake.ts`, which `yarn bake <game>` runs after
`yarn health`'s checks. Its output is written where the scene's catalogue reads it.

| art | made by | committed |
|---|---|---|
| a prop, building, vehicle or title from a Blender script of the game's | `blender` runs the script into `scratch`, `pack` writes the glb | the script and the packed glb |
| trees | the library's `trees/trees.py` from the game's `<name>.trees.json`, its leaf sets asked of `texture` first | the spec and the packed glb |
| grass clumps | the library's `foliage/foliage.py` from `<name>.foliage.json` | the spec and the packed glb |
| a Mixamo character | the library's FBX, named in its rig file's `bodies`, baked by `plugins/anim/anim.export.py`, which packs it itself, and its table written back by `merge-table.mjs` (`using-mixamo-assets`) | the rig file and the packed glb |
| engine and other made sounds | the library's `sounds/sounds.mjs` from `<game>.sounds.json` | the spec and the sounds |
| a texture a script draws with | `texture(zip)`: the set's maps from the library, downloaded into it first when missing | nothing of the set |
| ground and surface textures | the game's `cc0-textures.json`, cut by the bake to `.webp` before the bake file runs (`scripts/cc0.ts`) | the json and the `.webp` maps, so the game boots with no bake |
| a picture cut to size | `webp(src, out, size)` | the `.webp` |
| a sheet or a song a script draws from nothing | the game's own script, which reads nothing from the library (an `fx/fx.mjs` that writes `fx/fx.png`, a `.song.ts` that writes a song) | the script and what it writes |
| art whose licence forbids handing it on | the pack stays in the library's `vendor/<pack>/`, and the script seals what it cuts into a wad (`bringing-in-art`) | the script and the wad |

A built file that no script of the game's writes is raw, however it got there. Every script that
reads the library is run by the bake: a glb with its `.py` beside it that `<game>.bake.ts` does not
run is a step missing from the bake, and the step is written.

## Before every commit

1. `yarn bake <game>`, from the root. It stops at its first failure and writes nothing past it; it
   prints `wrote <path>` for each file it makes.
2. `node .claude/skills/committing-a-game/scripts/raw.mjs games/<game>`. It reads the files git would
   commit in the game's folder, honouring its `.gitignore`, and names each raw one: a glb whose
   `asset.generator` is not gltfpack's, a model or scene source, an archive, a working picture
   (`.psd`, `.exr`, ...), a jpg. It lists every png apart, since a script of the game's may draw one;
   each png is either written by a script the bake runs or it is raw. It exits 1 on any raw file.
   Every file it names is moved to the library and made by a step of the bake, then step 1 is run
   again.
3. `node .claude/skills/committing-a-game/scripts/inventory.mjs games/<game>`. It reads the same files
   `raw.mjs` reads and prints what the commit would add: the count and total size, each kind of file
   (its extension) with its count and size, and the fifteen largest files. The inventory goes to Bill
   in full, in one message, before the commit.
4. Every file the scene's catalogue names is on disk after the bake, and the game's tests pass: each
   `yarn vitest run <file>` of the game.
5. `games/<game>/README.md` is there and says what The README asks; it is written when it is not.
6. `git -C games status --short <game>` (or `git status --short games/<game>` in your own repo): the
   files to commit are the game's source and the files the bake wrote, and nothing the bake did not.

## What goes wrong

| mistake | what happens |
|---|---|
| A Blender export committed beside its script, unpacked | Every player downloads the uncompressed geometry and full-size textures; `raw.mjs` names it by its generator. |
| Library textures copied into `assets/` as jpg | The full-size set is in the repo, and the next set chosen is copied in again; the game's `cc0-textures.json` names it and the bake cuts it. |
| A script beside its glb that the bake never runs | The glb cannot be made again from the repo; the next person to change the script commits a glb nobody can reproduce. |
| A game's baked file kept out of git (a `.gitignore` over its cc0 maps) | A download of the game cannot boot until it is baked, and baking needs Blender and the library. Every file the bake writes is committed. |
| A game added to `games/` without its `!/<game>/` line | `git -C games status` shows nothing, and the game is not committed at all. |
| `git -C games/<game>` | A game's folder is there only on the branches that have it, so the command fails on every other branch; every command for a game is `git -C games`. |
| A raw part kept "for now" in the game | It is raw. It goes to the library, and the bake reads it from there. |
