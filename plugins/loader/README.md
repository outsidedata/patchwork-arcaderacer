# loader

Every file a game uses: the scene's asset catalogue, fetched and decoded once, for the rules on the
server and for each page. Data files (`json`, `pixels`, `palette`, `binary`), sprite sheets
(Aseprite, TexturePacker, Tiled tilesets), Tiled maps, textures, glTF models, bitmap fonts, font
files and sounds; preloading before the first step; sealed wads for art that must not sit on disk as itself;
and files rewritten while the game runs refilled in place.

## Why use it

Every file a game reads goes through the loader and nothing else: no code fetches a file, decodes
one, or writes its path. The catalogue names each file once, so a scene's every asset is in one
place, and a rule can read a file on any step because the loader has it there before the first.
Use it whenever a game has art, sound, levels, data tables or definitions.

## How it works

The catalogue is the scene's `world.loader.assets`: name to entry `{ type, url, preload?, for?,
nearest?, facing?, palette?, space?, wrap?, anisotropy? }`. It never changes, so no row carries it. A
child scene takes the manager's `world.loader` unless it gives its own. A url is a plain path from the
working directory, written as the file is named; a path a file names is read from that file's folder.

**Server half (`loader.sim.ts`).** One empty `loader` row runs `before` and `prepare`. The process
fetches each file once (a fetch in a tab, a read from disk in node) and decodes it once for every
truth's rules and every actor's `def`.

- Six types are files a rule reads: `json` (data, definitions), `sheet`, `palette` (a GIMP `.gpl`, as
  0xRRGGBB), `tilemap` (a Tiled `.tmj` with its tilesets), `pixels` (a PNG read as data, every pixel's
  RGBA byte for byte plus its text chunks, never through a canvas) and `binary` (bytes: a ROM, a disk
  image, a module).
- `prepare` resolves once every `preload` entry of those types has landed and decoded, and the
  scenemanager awaits it before booting a scene and before a page makes its client, so a broken file
  stops the scene before its first step.
- Reads from a rule: `json(w, name)`, `sheet`, `palette`, `tiled`, `pixels`, `binary`, `def(w, kind)`
  (a kind's entry in the scene's definitions file, `world.defs`), `ready(w, name)`, `load(w, name)`
  (start one not preloaded), `asset(w, name)`, and `prepared(world, name)` for another kind's
  `prepare`.
- A `sheet` reads either an Aseprite / TexturePacker JSON (frames, trimmed and rotated frames, pivots,
  durations, frame tags as clips with directions and repeats, `<clip>@<k>` runs per facing, slices,
  multipacks) or a Tiled tileset (tiles as frames, tile types and animations as clips), into one
  `Sheet` shape. `pick`, `frameOf`, `play`, `span` and `reach` answer which run faces a way, a frame
  of a clip, how a clip moves on, how long it lasts and how far a frame reaches from its anchor.
- A `tilemap` reads orthogonal and isometric maps, tile layers (CSV, base64, zlib, gzip, zstd,
  infinite chunks, flip bits), image layers, object layers, groups flattened with their offsets,
  parallax, opacity and tint, and each tile's collision shapes, one-way where its type is `top`.
- `decodePng` / `encodePng` read and write a PNG with its text as `iTXt`, losslessly.
- **Wads**: `world.loader.wads` lists sealed files (AES-GCM, a key that ships with core), opened in
  memory, each file then at its own path for both halves. This hides licensed art at rest in the
  repo, on the server and in a player's cache; it is not protection from someone who wants it.
  `seal` and `unseal` make and open one.
- `written(url, content)` refills every decoded copy of a file in place when it is rewritten while the
  game runs, so everything holding it reads the new content.

**Browser half (`loader.plugin.ts`).** Each client's own tables: it starts every `preload` entry on
its first tick and the rest on `load` or `on`. Images are decoded by the scene's renderer (three's
`TextureLoader` under render3d, `PIXI.Assets` under render2d, an `<img>` with neither); an entry with
`for: "ui"` is decoded through the ui plugin's PixiJS.

- `texture`: sRGB unless `space: "linear"` (normal and roughness maps), `wrap: "repeat"`,
  `anisotropy`.
- `sheet`: `{ data, pages, texture(id), uv(id), pick, frameOf }`, frames cut for PixiJS or UVs for a
  three.js quad; `nearest` for pixel art.
- `tilemap`: `{ map, texture(gid), image(url), version }`, drawn by render2d.
- `bitmapfont`: an AngelCode BMFont installed as a PixiJS bitmap font of the entry's name.
- `font`: a `.ttf`, `.otf`, `.woff` or `.woff2` installed in the page as the font of the entry's
  name, so any text whose `fontFamily` is that name draws with it (the ui's, render2d's and the
  page's alike, whatever its `for`); handed over as the `FontFace`. One font of a name per page, so
  the next scene's client installs nothing again. Every font is preloaded, whatever its entry says,
  and `fonts()` says whether every font of the catalogue has landed or failed; the ui waits on it
  before it draws. In node or jsdom nothing is installed and a font is `{ family }`, its name.
- `model`: a self-contained `.glb` decoded with three's glTF loader and meshopt decoder (so gltfpack
  output works); `model(name)` is `{ scene, animations }`, cloned with its skeleton per call.
- `sound`: decoded through `plugins.audio.context`; `sound(name)` is the AudioBuffer.
- `beside(name, path)`: the bytes of a file an entry's file names but the catalogue does not (a music
  project's samples, a sound's stems), or undefined when missing.
- `load(name)` never throws: a failure rejects, is written to the console once as `loader <name>: …`,
  and is remembered until `retry(name)`. `ready`, `get`, `on(name, f)`, `progress()` (for a loading
  bar), `fonts()`, `catalogued(name)`, `onWritten(name, f)` (rebuild what was built from a file when it is
  rewritten), `close`.

In node there is no page: an image is a 1×1 white texture, and a model decodes with a borrowed
`self` and `document`, so a client runs with every asset it asks for.

No row ever carries whether an asset has landed: a fetch takes a different time on every machine, so
the rules would disagree. An actor asks the loader, or draws something else until `on` fires.

## Using it

1. List `loader` in `plugins`, add one `loader` row to `actors`, and give `world.loader: { assets: {
   <name>: { type, url, preload? } }, wads? }`.
2. Put each file under the game's `assets/`, with the script that makes it beside it.
3. In a rule: `json(w, 'levels')`, `def(w, me.kind)`. On the page: `plugins.loader.model('hero')`,
   `plugins.loader.on('tiles', t => …)`, `plugins.loader.get('click')`.

## Plugins it works with

Nearly every plugin reads its files through the loader: **anim** (rigs and models), **audio**
(sounds and gun manifests), **sprite2d**, **sprite3d**, **particle2d** and **grid** (sheets),
**tilemap** (maps), **render3d** and **render2d** (which decode its images), **ui** (`for: "ui"`
images and bitmap fonts, and every `font`, which it waits on before it draws), **terrain3d** and **skydome3d** (their field and sky files), **cutscene**
and **interact** (their files), **box2d** and **box3d** (chains, meshes and height fields as
`{ asset }`), **flight3d** and **box3dvehicle** (models), **audiodaw**'s pages (song samples by
`beside`).

## Keywords

assets, asset loading, asset catalogue, preload, loading screen, progress, fetch, files, data files,
JSON, definitions, defs, sprite sheet, atlas, Aseprite, TexturePacker, frame tags, slices, nine-slice,
Tiled, tmj, tsj, tileset, tilemap, PNG, pixels, height map, GIMP palette, gpl, binary, ROM, texture,
sRGB, linear, normal map, anisotropy, glTF, glb, gltfpack, meshopt, model, bitmap font, BMFont,
font, TTF, OTF, WOFF, FontFace, custom font, sound, AudioBuffer, wad, encrypted assets, licensed art, hot reload, live reload, `json`, `def`,
`sheet`, `tiled`, `pixels`, `load`, `on`, `model`, `beside`, `world.loader`
