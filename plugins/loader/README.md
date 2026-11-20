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
Every entry is preloaded unless it says `preload: false`; one that says so starts only when asked for.

**Server half (`loader.sim.ts`).** One empty `loader` row runs `before` and `prepare`. The process
fetches each file once (a fetch in a tab, a read from disk in node) and decodes it once for every
truth's rules and every actor's `def`.

- Six types are files a rule reads: `json` (data, definitions), `sheet`, `palette` (a GIMP `.gpl`, as
  0xRRGGBB), `tilemap` (a Tiled `.tmj` with its tilesets), `pixels` (a PNG read as data, every pixel's
  RGBA byte for byte plus its text chunks, never through a canvas) and `binary` (bytes: a ROM, a disk
  image, a module).
- `prepare` resolves once every preloaded entry of those types has landed and decoded, and the
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

**Browser half (`loader.plugin.ts`).** Each client's own tables: it starts every entry on its first
tick but those that say `preload: false`, and those on `load` or `on`. Images are decoded by the scene's renderer (three's
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
  output works); `model(name)` is `{ scene, animations }`, cloned with its skeleton per call, its
  geometry and materials shared by every copy. In a page a meshopt glb's buffers are unpacked in
  three workers, and at most four models fetch and decode at once, the rest queued in order.
- Nothing lands the moment it decodes: each tick hands over what has decoded, in order, for four
  milliseconds, sending each model's and texture's pictures to the GPU (`renderer.initTexture`)
  before it lands, so a big batch of models arrives over several frames and the first frame that
  draws one uploads nothing.
- What the ui draws comes first: nothing else of any type starts until every font and every
  preloaded entry `for: "ui"` has landed or failed, and those land ahead of anything else waiting, so a loading
  screen is up within a frame or two.
- `sound`: decoded through `plugins.audio.context`; `sound(name)` is the AudioBuffer.
- `preloads()`: `{ done, of }`, how many of the first tick's entries (every preloaded entry and font) have
  landed or failed.
- `shaders()`: how many things are still having their shaders compiled, through the scene's
  `world.loader.mods.shaders` (render3d's `render3d.loader.ts`); 0 when it names none.
- `settled()`: whether every plugin the scene's `world.loader.mods.ready` names says the world it draws
  is whole, each its `ready(plugins)` (terrain3d's `terrain3d.loader.ts`: its land where the camera
  starts, and lod3d's tiles through terrain3d's own `mods.ready`); true when it names none.
- The loading screen, `loader.ui.ts`: delivers the ui the word `loading`. A `world.ui` panel giving
  `loading: { fill, pictures, bar, lines, shaders, fade }` covers the canvas with the game's art and
  logo (`texture` entries `for: "ui"`, preloaded), a bar of `preloads()`, and tips one at a time; once
  every file is in and while `shaders()` is above 0, its `shaders` line ("Compiling shaders") in place
  of the tips and the bar filling as they finish; once `settled()`, then fades. The scene names it in `world.ui.mods.behaviors: ['loader']`, lists `loader`
  before `ui`, and gives the panel `modal` and a high `layer`. Its header has a whole example.
- The loading cover, `loader.cover.ts` and `loader.cover.js`: the entry scene's loading screen drawn in
  the page's first bytes. The bundle (`scripts/bundle.ts`) writes it just inside the `<body>` of a
  game's `index.html` and `client.html` when the entry scene has a `loading` panel, so it shows before
  any of the game's code has come down. It draws the panel in the DOM where the ui will draw it, and
  fetches every file the loader fetches first, for every scene: each entry not marked `preload: false`,
  every font and every wad, the screen's pictures and fonts ahead of the rest. Both halves read a file
  the cover fetched from its bytes (`Symbol.for('loader: cover')`), so nothing is fetched twice.
  `loader.ui.ts` takes it off the page the frame after its own screen has drawn every picture under it,
  and its bar never shows less than the cover's had. A scene with no loading screen takes it off on the
  loader's first tick. On a published site it takes the place of `scripts/loading.html`.
- A garment, `loader.fabric3d.ts`: delivers fabric3d the cut `garment`. A fabric giving `garment: {
  model, file }` is cut from a garment a bake draped on a body the game draws (`scripts/garment.ts`): its
  glb, a `model` entry with a mesh for each pattern piece, and its sidecar, a `json` entry with the frame
  each of the body's bones stood in. The scene names it in `world.fabric3d.mods.behaviors: ['loader']`.
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
`beside`), **fabric3d** (the fabrics file, and a garment's glb and sidecar through `loader.fabric3d.ts`).

## Keywords

assets, asset loading, asset catalogue, preload, loading screen, progress, fetch, files, data files,
JSON, definitions, defs, sprite sheet, atlas, Aseprite, TexturePacker, frame tags, slices, nine-slice,
Tiled, tmj, tsj, tileset, tilemap, PNG, pixels, height map, GIMP palette, gpl, binary, ROM, texture,
sRGB, linear, normal map, anisotropy, glTF, glb, gltfpack, meshopt, model, bitmap font, BMFont,
font, TTF, OTF, WOFF, FontFace, custom font, sound, AudioBuffer, wad, encrypted assets, licensed art, hot reload, live reload, `json`, `def`,
`sheet`, `tiled`, `pixels`, `load`, `on`, `model`, `beside`, `world.loader`
