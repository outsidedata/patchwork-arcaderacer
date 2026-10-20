# Asset workshop — design

## Purpose

A place to make game assets together, quickly, with no game running. Claude builds or changes an
asset; the page reloads it by itself; Bill orbits it, clicks on what is wrong, and types a note.
Claude reads the notes, fixes the asset, and marks each note fixed with a reply. The first asset
made in it is a new rifle for the mech raiders, whose current `rifle.glb` is a flat, untextured
carbine with no source file in the repo.

## Constraints

- Gameless: no scene, no engine boot, no game server, no editor. The workshop loads glTF files and
  nothing else of a game's.
- The editor is on hold, so the workshop is not part of it and shares no code with `editor/`.
- The workshop never changes how an asset is drawn in a game. A game picks up a changed asset only
  because the workshop exports to the same path the game already loads.
- Assets are finished in Blender and exported as plain glTF (the `making-game-assets` rule). Every
  asset made in the workshop has its Blender build script in the repo beside the glb.

## Pieces

All under `tools/workshop/`:

- `workshop.server.ts` — a node HTTP server, run as
  `node --experimental-strip-types tools/workshop/workshop.server.ts`, on port 5180. It serves the
  page, the asset files listed in `assets.json`, and three.js from `node_modules`. It answers:
  - `GET /api/assets` — the list, each asset with its glb's modified time.
  - `GET /api/notes/<id>`, `POST /api/notes/<id>` (adds a note), `PATCH /api/notes/<id>/<note>`
    (changes status or adds a reply).
  - `GET /api/events` — server-sent events: `changed <id>` whenever an asset's glb or notes file
    changes on disk (`fs.watch`, debounced 150 ms so a half-written export is not read).
- `assets.json` — the workshop's list. Each entry has: `id`, `name`, `glb` (repo path), `build`
  (the path of its Blender build script), and an optional `held` block:
  `{ body: <glb path>, bone: "RightHand", at: [x,y,z], turn: [x,y,z] }` copied from the game's
  scene so the asset can be seen in the hand it is made for.
- `workshop.html` and `workshop.ts` — the page:
  - A left column listing the assets, each with its count of open notes.
  - A three.js view with orbit controls, neutral tone mapping, a studio HDR-style light rig, a
    ground grid, and a 1.8 m reference figure.
  - Views to switch between: free orbit, front, side, top, close-up, and **held**. Held loads the
    `body` glb, puts the asset on the bone with the given `at`/`turn`, and poses the body in its
    first clip, so a bad grip or wrong scale shows at once.
  - Overlays: a wireframe toggle, a triangle count, a bounding box with dimensions in metres, and a
    marker on every empty (`muzzle`, and so on).
  - **Notes:** a click on the model raycasts to a point. A box asks for the note's text, and the
    note is saved with the point (in the asset's own space), the mesh and material it hit, and the
    current camera. Each note is a numbered pin drawn on the model. Its card in a right column
    shows the text, the status (open/fixed) and Claude's reply. Clicking a card moves the camera
    back to where the note was made.
  - **Atlas view:** the asset's atlas drawn flat, its cells labelled from `<asset>.atlas.json`. A
    click on the model highlights the cell that point's UV falls in, and a note records the cell.
  - **Texture library:** a browser of the texture folders Bill names. The folders are listed in
    `tools/workshop/library.json` and can be added or removed from the page. Nothing else is
    scanned. A folder may be on a network drive (Bill's full CC0 collection is), so the server
    caches each set's listing and thumbnail in `tools/workshop/.cache/` (git-ignored), keyed by
    the file's path, size and modified time. A full-size map is read from the drive only when a set
    is opened or assigned to a cell. The server reads only those folders, groups the files into sets by
    name (`colour`/`color`, `normal`, `rough`/`roughness`, and so on), and serves a thumbnail of
    each set. Sets can be filtered by name and by game, and one opens on a lit sphere and a flat tile.
  - **Cell editing, live:** each atlas cell has a recipe. It names a source set, plus a scale,
    an offset, a rotation, a tint (hue, saturation, value), brightness and contrast, a normal
    strength, and a roughness and a metalness (each either a flat value or the set's map with a
    multiplier). Dragging a set from the library onto a cell assigns it. Every slider recomposes
    the cell on the page (WebGL, into the atlas's three maps, at the asset's atlas size), and the model in the view
    updates the same frame. Undo and redo are kept for the session.
  - **Save:** writes the recipes to `<asset>.atlas.json` and the three composed maps as PNGs beside
    the glb. The page sends the exact pixels it shows, so what is saved is what was seen. The
    server then rewrites the glb's three images in place (the glb's JSON and binary chunks are
    rewritten in node, with no Blender run), so the game sees the change too.
  - On `changed <id>` for the open asset, the page reloads the glb in place and keeps the camera
    where it is. A short "reloaded" mark shows the time.
- `<asset>.notes.json`, beside each glb: `[{ id, text, at, mesh, material, camera, status, reply,
  made }]`.
- `look.py` — the renderer that `making-game-assets` already names and that is missing. It runs
  `Blender -b --python tools/workshop/look.py -- <glb> <outdir>` and renders turntable, close-up and
  held sheets with Eevee, so Claude can check its own work before Bill sees it. It also reports
  each asset's materials, its map sizes against the size its `assets.json` entry declares, and any
  UVs that cross a cell's edge. A bigger atlas is allowed: the size is a per-asset choice (512×512
  by default, 1024 or 2048 when a part needs it), and the report says what it is rather than
  failing it. Only UVs crossing a cell's edge fail, because they draw the wrong surface.
- `tools/workshop/atlas.py` — the shared Blender helper that bakes a list of surfaces into an
  atlas's cells, packs each part's UVs into its cell, and writes `<asset>.atlas.json`. Every build
  script uses it.

## The skill

`making-game-assets` gains a "Texture atlas" section: a prop has one material and one atlas by
default, the atlas size as a per-asset choice (512 by default, larger when a part needs it), the
cell sizes and padding, how to use `atlas.py` from a build script, and what `look.py` reports. Its viewer section points to `tools/workshop/` and to `look.py` at its real
path.

## The raider rifle

- `games/mech/assets/raiders/rifle.build.py` — a Blender script that builds the rifle from nothing
  and exports `rifle.glb` to the same path.
- The rifle's shape: a modern carbine at real proportions (about 0.85 m). It has a receiver with
  bevelled edges, a handguard with vent slots, a barrel and a flash hider, a magazine, a pistol
  grip, a stock, an optic, and a sling mount.
- **One texture atlas, one material.** Its surfaces (worn anodised metal, polymer, rubber, optic
  glass, markings) come from CC0 sets fetched through `cc0-textures`. Each is baked into one cell of
  a 512×512 atlas: a 4×4 grid of 128×128 cells, each with 4 px of padding against bleed in the
  mipmaps. The UVs of each part are packed into its surface's cell. The glb has one material, with
  three 512×512 maps: colour, normal, and ORM (occlusion, roughness and metalness packed into one).
  The atlas layout (cell → surface) is written to `rifle.atlas.json` beside the glb.
- It keeps the `muzzle` empty at the end of the flash hider. The game's `rifle.muzzle` in
  `mech.json`, and the `at`/`turn` on both bodies in `highlands.scene.json`, are updated to the new
  geometry, and both are checked in the held view.

## Testing

- `tools/workshop/workshop.server.test.ts` (node): the asset list, adding, reading and patching
  notes, a refused path outside the repo, and a `changed` event sent after a file is written.
- `yarn tsc` and `yarn lint` clean.
- The page driven in a real Chrome (`good-webviews`): load an asset, place a note by a real click,
  write the glb again, and see the reload happen with the camera kept.
- The rifle: `look.py` sheets checked by eye in every view, including held on both bodies.
- Everything shown to Bill on one evidence page (`provide-evidence`).
