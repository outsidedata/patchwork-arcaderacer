# cc0-textures in the bake: games register their sets, the tools make them

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A game names the cc0-textures.com sets it draws in one data file; `yarn bake <game>` downloads them into the library and cuts the game's WebP maps; `yarn health` says which games are not baked; no cc0 texture, raw or baked, is committed to any repo; demo_terrain3d is brought into `core_dev/games` on this footing.

**Architecture:** The library (`$PATCHWORK_LIBRARY`) owns cc0-textures: its committed list `textures/cc0-textures.json` and `cc0-textures/cc0-textures.mjs` (search, resolve, download into `textures/cc0-textures/<zip>/`, which git ignores). Core's `scripts/cc0.ts` reads a game's `assets/cc0-textures.json`, loads the library's module from `$PATCHWORK_LIBRARY`, and cuts each set's maps with the bake's `webp()`. `scripts/bake.ts` runs it for any game that has the file, and `scripts/health.ts` scans every game for it.

**Tech Stack:** Node 22 (`--experimental-strip-types`), vitest (core), `node:test` (library), ImageMagick 7 with libwebp, system `unzip`.

**Spec:** this conversation's decisions, restated in Global Constraints.

## Global Constraints

- No cc0-textures file, raw or baked, is committed anywhere: the library commits only `textures/cc0-textures.json`; a game commits only its `assets/cc0-textures.json` and git ignores every file the bake cuts from it.
- `textures/cc0-textures.json` is a hint naming each set's download (`<vendor>/<zip>.zip` on `https://download.cc0-textures.com`), its tags and its maps. Nothing reads textures from the local collection it was built from.
- A game's cut maps are `assets/<folder>/<name>-<map>-<size>.webp`, at quality 80 (`bake.ts` `webp()`), square, `size` in pixels.
- demo_terrain3d's tiers: UHD 2048, HD 1024, lofi 512 (42 files, 21.91 MB measured from the current 4K JPEGs).
- `PATCHWORK_LIBRARY` is the only library setting; no new environment variable.
- Bill's shell rule: one plain command per Bash call, no pipes, `&&`, loops, `$(...)`, heredocs or `node -e`; logic goes in a named script.
- Every subagent on Opus. No git worktrees. Work in `/Users/bill/core_dev`.
- Tests: only the files beside what changed (`yarn vitest run <file>`); never editor or extension tests; no prediction tests.
- `games/` is its own repo: game changes are committed there with `git -C games`, on the same branch name as core.
- No skill, header or test outside `games/` names a game in `games/`.

## Review Focus

1. A set named in a game's file that the library's list does not have → the bake fails before downloading anything, naming the set and `yarn cc0-textures:search`. (Task 2 test.)
2. A Poly Haven set with both `nor_gl` and `nor_dx`, a ShareTextures set with a single `normal`, and an ambientCG set with `NormalGL`/`NormalDX` → the GL normal is cut every time, never DX. (Task 2 test.)
3. An output the game's `.gitignore` does not cover → the bake fails naming the file, before cutting anything. (Task 3 test.)
4. A cc0-only game on a machine without Blender or gltfpack → the bake runs; with no ImageMagick or no library → it stops naming that check. (Task 3 test.)
5. A fresh clone with nothing baked → `yarn health` fails with the game, the count of missing files, and `yarn bake <game>`. (Task 4 test.)

---

### Task 1: The library's list, live

**Files:**
- Modify: `~/patchwork-library/textures/textures.json` → renamed `textures/cc0-textures.json`
- Delete: `~/patchwork-library/build-textures.mjs` (superseded by `cc0-textures/directory.mjs`)
- Create: `~/patchwork-library/README.md`

**Interfaces:**
- Produces: `textures/cc0-textures.json`, `{ [zip: string]: { zip: string, tags: string[], maps: string[] } }`; `cc0-textures/cc0-textures.mjs` exports `HOST`, `LIBRARY`, `read(library?)`, `stem(zip)`, `search(directory, words)`, `resolve(directory, name)`, `download(directory, zip, { library?, host? }) → Promise<{ dir: string, fetched: boolean }>`.

- [ ] **Step 1:** When the background `build-textures.mjs` run ends, read its output: set count per vendor, unnamed files, sets whose maps disagree on tags, sets no vendor serves. Every listed problem is fixed in `directory.mjs` (the name pattern or the vendor order) and the list rebuilt with `yarn cc0-textures:directory /Volumes/ai/textures`, until all three lists are empty or each remaining entry is a set cc0-textures.com really does not serve.
- [ ] **Step 2:** Check every set the games use is in the list: the 8 of arcaderacer's `surfaces/fetch.ts`, its `limestone_1-4K` and `metal_roof-4K`, demo_wormhole's `Metal027_4K-JPG` and `Metal029_4K-JPG`, and demo_terrain3d's 7 (`aerial_grass_rock_4K-JPG`, `Rock007_4K-JPG`, `snow_02_4K-JPG`, `gravel_ground_01_4K-JPG`, `dry_ground_rocks_4K-JPG`, `mud_cracked_dry_03_4K-JPG`, `Rock029_4K-JPG`). One the local collection lacks is added from its download (HEAD-checked) by `directory.mjs` reading an extra list `cc0-textures/extra.json` of `<vendor>/<zip>.zip`, its tags from the site's `__NEXT_DATA__` listing.
- [ ] **Step 3:** Run `yarn cc0-textures:search metal roof` and `yarn cc0-textures:download metal_roof` in `~/patchwork-library`; expect the set's line, then `downloaded metal_roof-4K  …/textures/cc0-textures/metal_roof-4K` with five flat `.jpeg` files.
- [ ] **Step 4:** Write `README.md`: what the library holds, `PATCHWORK_LIBRARY`, the three `yarn cc0-textures:*` commands, that `textures/cc0-textures/` is downloaded and ignored, and `yarn test`.
- [ ] **Step 5:** Run `node --test cc0-textures/cc0-textures.test.mjs`; expect 8 pass.

### Task 2: `scripts/cc0.ts`, a game's sets cut into it

**Files:**
- Create: `scripts/cc0.ts`
- Test: `scripts/cc0.test.ts`

**Interfaces:**
- Consumes: the library module (Task 1), loaded with `import(pathToFileURL(path.join(library, 'cc0-textures', 'cc0-textures.mjs')).href)`; `Tools['webp']` from `scripts/bake.ts`.
- Produces:
  - `type Map = 'color' | 'normal' | 'roughness'`
  - `type Config = { folder: string, sizes: number[], sets: Record<string, { set: string, maps: Map[] }> }`
  - `config(root: string, game: string): Config | undefined` — reads `games/<game>/assets/cc0-textures.json`, undefined when absent; throws naming the file and the field on a bad shape (a size not a positive integer, a map not one of the three, a set not a string).
  - `outputs(config: Config): string[]` — paths under the game's `assets/`, `<folder>/<name>-<map>-<size>.webp`, in set, map, size order.
  - `pick(files: string[], map: Map): string | undefined` — the file of a set that is that map.
  - `cut(root: string, game: string, tools: Pick<Tools, 'library' | 'webp'>, host?: string): Promise<string[]>` — every output not already on disk, made; answers the paths it wrote.

- [ ] **Step 1: Write the failing tests** in `scripts/cc0.test.ts`, each on a temp root with a fake library (a `cc0-textures/cc0-textures.mjs` copied from the real one, a `textures/cc0-textures.json`) and a local HTTP server serving zips built with `zip`, `webp` faked as in `bake.test.ts`:
  - `outputs` of `{ folder: 'ground', sizes: [2048, 512], sets: { rock: { set: 'Rock007_4K-JPG', maps: ['color', 'normal'] } } }` is `['ground/rock-color-2048.webp', 'ground/rock-color-512.webp', 'ground/rock-normal-2048.webp', 'ground/rock-normal-512.webp']`.
  - `pick` takes `Rock007_4K_NormalGL.jpg` over `Rock007_4K_NormalDX.jpg`; `x_nor_gl_4k.jpg` over `x_nor_dx_4k.jpg`; `4K-metal_roof_normal.jpeg` when it is the only normal; colour from `_Color.`, `_diff_`, `baseColor`, `basecolor`, `diffuse`, `albedo`; roughness from `_Roughness.`, `_rough_`, `roughness`.
  - `cut` downloads the set once, writes each output through `webp(src, out, size)` with the picked map, and on a second call writes nothing and asks the server nothing.
  - `cut` throws `demo: no cc0-textures set Lava001_4K-JPG (yarn cc0-textures:search <words>)` and downloads nothing when a set is not in the list.
  - `cut` throws naming the set and the map when the zip has no such map (`Rock007_4K-JPG has no roughness map among …`).
  - `config` throws `games/demo/assets/cc0-textures.json: sizes[1] is not a positive whole number` for `sizes: [1024, 0]`.
- [ ] **Step 2:** Run `yarn vitest run scripts/cc0.test.ts`; expect every test to fail on the missing module.
- [ ] **Step 3:** Implement `scripts/cc0.ts` with a header in the style of `bake.ts`'s. Map patterns: color `[/_color\./i, /_diff_/i, /basecolor/i, /diffuse/i, /albedo/i]`; normal GL first `[/normalgl/i, /_nor_gl_/i]`, then `/normal/i` only when exactly one file matches it and none matches `/normaldx|_nor_dx_/i`; roughness `[/_roughness\./i, /_rough_/i, /roughness/i]`; image files only (`/\.(jpe?g|png)$/i`). Every set is resolved before any download starts.
- [ ] **Step 4:** Run `yarn vitest run scripts/cc0.test.ts`; expect all pass. Run `yarn tsc` and `yarn lint`; expect no errors in `scripts/`.

### Task 3: `yarn bake` runs a game's cc0 sets

**Files:**
- Modify: `scripts/bake.ts`
- Test: `scripts/bake.test.ts`

**Interfaces:**
- Consumes: `config`, `outputs`, `cut` (Task 2).
- Produces: `Tools` gains `texture(zip: string): Promise<Record<Map, string>>` — a set's map files in the library, downloaded first if absent, for a bake script that feeds them to Blender. `bake(game, root, shell)` runs, in order: the checks the game needs; the `.gitignore` check; `cut`; then `<game>.bake.ts` if it exists. A game with neither file throws `<game> has no bake: no games/<game>/assets/<game>.bake.ts or cc0-textures.json`.

- [ ] **Step 1: Write the failing tests** in `scripts/bake.test.ts`:
  - a game with only `cc0-textures.json`, `BLENDER` and `GLTFPACK` pointing at missing files, bakes: its outputs are written.
  - the same game with `MAGICK` missing stops with `imagemagick: …` and writes nothing.
  - a game whose `.gitignore` does not cover `ground/rock-color-512.webp` (the test makes `games/` a git repo with `git init`, as a game folder is) stops with `games/demo/assets/ground/rock-color-512.webp is not ignored by git: add it to games/demo/.gitignore` and writes nothing.
  - a game with both files runs the cut before its `.bake.ts`, which reads a cut file.
  - `texture('Rock007_4K-JPG')` answers the three map paths under the fake library's `textures/cc0-textures/Rock007_4K-JPG/`.
  - the existing tests still pass unchanged but for the no-bake message.
- [ ] **Step 2:** Run `yarn vitest run scripts/bake.test.ts`; expect the new tests to fail.
- [ ] **Step 3:** Implement. Checks: a `.bake.ts` needs every `for: 'bake'` check, as now; a cc0 file alone needs `library` and `imagemagick`. The ignore check runs `git -C <root>/games check-ignore --stdin` once with every output path (`execFileSync`, input on stdin) and names each path git does not ignore. Update the header: the two files a bake may have, the order, `texture`.
- [ ] **Step 4:** Run `yarn vitest run scripts/bake.test.ts`; expect all pass. `yarn tsc`, `yarn lint`.

### Task 4: `yarn health` names every game not baked

**Files:**
- Modify: `scripts/health.ts`
- Test: `scripts/health.test.ts`

**Interfaces:**
- Consumes: `config`, `outputs` (Task 2).
- Produces: `Check['for']` gains `'game'`; `checks(root, shell)` adds one check per `games/*/assets/cc0-textures.json`, named the game. `bake.ts` filters on `for === 'bake'`, so it is untouched by these.

- [ ] **Step 1: Write the failing tests:** a root with `games/demo/assets/cc0-textures.json` naming 4 outputs, 1 on disk → `{ name: 'demo', for: 'game', ok: false, detail: '3 of 4 cc0 textures not baked', fix: 'yarn bake demo' }`; all 4 on disk → `{ ok: true, detail: '4 cc0 textures baked' }`; a root with no `games/` → no game checks.
- [ ] **Step 2:** Run `yarn vitest run scripts/health.test.ts`; expect the new tests to fail.
- [ ] **Step 3:** Implement; update the header's paragraph on what is checked.
- [ ] **Step 4:** Run `yarn vitest run scripts/health.test.ts`; expect all pass. `yarn tsc`, `yarn lint`.

### Task 5: demo_terrain3d in `core_dev/games`

**Files:**
- Create: `games/demo_terrain3d/` — a copy of `~/core/games/demo_terrain3d` at games commit `0c54dbf9`, without `.DS_Store`, `assets/ground/*.jpg` or `assets/ground/fetch.mjs`
- Create: `games/demo_terrain3d/assets/cc0-textures.json`, `games/demo_terrain3d/.gitignore`
- Modify: `games/demo_terrain3d/demo_terrain3d.scene.json` (catalogue), `assets/uhd.json`, `assets/hd.json`, `assets/lofi.json`, `assets/valley.mjs` (its header line on map names)
- Test: `games/demo_terrain3d/demo_terrain3d.sim.test.ts`

**Interfaces:**
- Consumes: `yarn bake` (Task 3).

- [ ] **Step 1:** Copy the game with a scratchpad script, `node copy-terrain.mjs ~/core/games/demo_terrain3d games/demo_terrain3d`, that copies every file but `.DS_Store`, `assets/ground/*.jpg` and `assets/ground/fetch.mjs`, and prints the count and bytes copied.
- [ ] **Step 2:** Write `assets/cc0-textures.json`: `folder` `ground`, `sizes` `[2048, 1024, 512]`, the 7 sets by the names `ground/fetch.mjs` gave them (`meadow`, `rock`, `snow`, `gravel`, `dry-ground`, `cracked-mud`, `desert-rock`), each its zip from Task 1 Step 2 and `maps: ["color", "normal"]`.
- [ ] **Step 3:** Write `.gitignore`: `assets/ground/*.webp`.
- [ ] **Step 4:** Rewrite the catalogue's 42 entries to `…/ground/<name>-<map>-<size>.webp`, keys renamed `<name>-<map>-<size>`, and each tier file's layer map names from `-4k`/`-2k`/`-1k` to `-2048`/`-1024`/`-512`. Keep `"space": "linear"` on normals and `"wrap": "repeat"` on all.
- [ ] **Step 5:** Run `yarn bake demo_terrain3d`; expect 42 `wrote` lines. Run `yarn health`; expect `ok demo_terrain3d game 42 cc0 textures baked`. Run `git -C games status --short`; expect no `.webp` listed. Measure `du -sh games/demo_terrain3d` and the committed size (`git -C games ls-files -s demo_terrain3d` summed by a scratchpad script).
- [ ] **Step 6:** Run `yarn vitest run games/demo_terrain3d/demo_terrain3d.sim.test.ts`; expect pass.
- [ ] **Step 7:** Open `games/demo_terrain3d/dev.html` for each tier in Chrome (good-webviews), screenshot the valley floor, the crags and the desert at each, and read each screenshot: every ground layer textured, no grey layer, no 404 in the console.
- [ ] **Step 8:** The glbs: `firs.glb` and `clumps.glb` are raw Blender exports (6.5 MB, 3.0 MB, PNG textures). Decision for Bill (below); then they are packed by the game's `demo_terrain3d.bake.ts` from their sources, or committed packed.

### Task 6: arcaderacer and demo_wormhole onto the same footing

**Files:**
- Delete: `games/arcaderacer/assets/surfaces/fetch.ts`, `games/demo_wormhole/assets/surfaces/fetch.ts`
- Create: `games/arcaderacer/assets/cc0-textures.json`, `games/arcaderacer/.gitignore`, `games/demo_wormhole/.gitignore` if any cut output lands in it
- Modify: `games/arcaderacer/assets/arcaderacer.bake.ts`, `games/arcaderacer/assets/paris/haussmann.py` (its `LIMESTONE`/`ZINC` paths become arguments the bake passes from `texture()`), arcaderacer's scene catalogue entries for `surfaces/<set>/<map>.webp` → `surfaces/<set>-<map>-1024.webp`, `games/demo_wormhole/assets/demo_wormhole.bake.ts` (its sets from `texture()`), `games/demo_wormhole/README.md` (its bake lines)
- Remove from git (kept on disk, then rebuilt): arcaderacer's committed `surfaces/*/*.webp`

- [ ] **Step 1:** arcaderacer's 8 surfaces become its `cc0-textures.json` (`folder` `surfaces`, `sizes` `[1024]`, maps `color`, `normal`, `roughness`); its bake drops the surfaces block; `.gitignore` names `assets/surfaces/*.webp`; `git -C games rm --cached` each committed surface map.
- [ ] **Step 2:** haussmann's limestone and zinc: the bake calls `texture('limestone_1-4K')` and `texture('metal_roof-4K')` and passes the map paths to `haussmann.py` after its quality argument; `haussmann.py` reads them from `sys.argv`. Its header says so.
- [ ] **Step 3:** demo_wormhole's bake takes each surface's maps from `texture(<zip>)` and its definitions' `set` values become zip names.
- [ ] **Step 4:** Run `yarn bake arcaderacer` and `yarn bake demo_wormhole`; expect every catalogue file written. Run each game's tests beside what changed (`games/arcaderacer/*.test.ts` touching surfaces, `games/demo_wormhole/*.test.ts`). Screenshot Paris, Tokyo and Cascade in arcaderacer and the chamber in demo_wormhole and read each.

### Task 7: The skills and docs say what the tools do

**Files:**
- Modify: `~/.claude/skills/cc0-textures/SKILL.md`, `.claude/skills/using-terrain3d/SKILL.md` (its "Ground textures from cc0-textures.com" section and its description), `.claude/skills/writing-the-look/SKILL.md`, `.claude/skills/starting-a-game/SKILL.md`, `.claude/skills/bringing-in-art/SKILL.md` (Where a file and its entry go), `.claude/skills/making-game-assets/SKILL.md` (Export) and `~/.claude/skills/making-game-assets/SKILL.md`, `.claude/skills/shipping-a-game/SKILL.md`, `README.md` (To bake art), `.env.example` (the library's comment), `.claude/CLAUDE.md` (Commands: `yarn bake <game>`)

- [ ] **Step 1:** `cc0-textures` skill: a "In a Patchwork library" section first: `yarn cc0-textures:search <words>` before any listing page, `yarn cc0-textures:download <name>`, a game's `assets/cc0-textures.json` and `yarn bake`; the listing and thumbnail URLs stay for picking a set the list's tags cannot decide, and for a set the list lacks.
- [ ] **Step 2:** `using-terrain3d`: replace steps 3–5 of its ground-texture section with the game's `cc0-textures.json`, the cut names `<name>-<map>-<size>.webp`, `.gitignore`, `yarn bake`; remove the line that names `games/demo_terrain3d` (no skill names a game).
- [ ] **Step 3:** `writing-the-look`, `starting-a-game`, `bringing-in-art`, both `making-game-assets`, `shipping-a-game`, `README.md`, `.env.example`, `CLAUDE.md`: each states, where it speaks of art or a fresh clone, that a game's cc0 maps are made by `yarn bake <game>` from its `assets/cc0-textures.json`, never committed, and that `yarn health` names a game not baked. `shipping-a-game` adds the bake before a game is published.
- [ ] **Step 4:** Grep the skills for `fetch.ts`, `ground/fetch.mjs`, `-4k.jpg`, `100 MB`; expect no hits.

### Task 8: Prove and land

- [ ] **Step 1:** Run the tests beside every change: `scripts/cc0.test.ts`, `scripts/bake.test.ts`, `scripts/health.test.ts`, the three games' tests named above; `yarn tsc`; `yarn lint`; the library's `node --test cc0-textures/cc0-textures.test.mjs`.
- [ ] **Step 2:** One evidence page (provide-evidence): the size table before and after for each game, the health output, the screenshots, the test output.
- [ ] **Step 3:** Commit core's changes in core and the games' in `games/`, on the same branch name; the library is not a git repo, so its files are listed for Bill to commit where it lives.

## Decisions for Bill

1. **Branch.** Both repos are on `dev`. "Work on a branch": which name, created by whom, given another session may be live in `core_dev`?
2. **demo_terrain3d's glbs.** `firs.glb` 6.5 MB → 1.60 MB and `clumps.glb` 3.0 MB → 0.69 MB packed (measured). Firs come from the library's `props/fir-trees`; clumps' source is not in the library. Commit them packed, or put clumps' source in the library and bake both?
3. **arcaderacer's Paris glbs** carry textures made from cc0 limestone and zinc inside `haussmann.glb` (1.67 MB). They are Blender's output, not cut cc0 maps: committed as now, or built by the bake and ignored too?
