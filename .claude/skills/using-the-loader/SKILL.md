---
name: using-the-loader
description: Use in core, or any clone of it, whenever the loader comes up, and to migrate any game's bake to the KTX2 compression, a game baked before or a new one - how a scene's files come down and reach the game (`plugins.loader`'s `load`, `on`, `get`, `ready`, `model`, `preloads()`, `shaders()`), how a load runs without stalling the game (four models at a time, meshopt workers, a few things landing each tick with their textures on the GPU first, fonts and the ui's pictures first), GPU-compressed `.ktx2` textures and supershader3d's KTX2 picture stack, render3d compiling shaders before the first draw, the loading screen (`plugins/loader/loader.ui.ts`, the ui's `loading` word, "Compiling shaders") and its cover in the page's first bytes (`loader.cover.ts`), and migrating a game's bake to KTX2. Also when a scene chugs, stalls or freezes ("kill/wait") or goes black while its art comes down, a test that awaits `plugins.loader.load` hangs, a model or texture never lands, a `.ktx2` entry fails, or the loading screen does not show, or shows only after a black screen.
---

# Using the loader

The loader (`plugins/loader/`) is how every file reaches a game: the scene's catalogue,
`world.loader.assets`, and nothing else fetches or decodes. Getting a file into the catalogue and drawn
is `bringing-in-art`. This skill is everything the loader does with it from there: how it comes down,
when it lands, how the GPU gets it, the loading screen a game shows meanwhile, and how a game's bake
moves its pictures to KTX2. The headers of `loader.plugin.ts`, `loader.ui.ts`, `render3d.plugin.ts`
(Shaders before the first draw) and `supershader3d.plugin.ts` (The pictures) are the contract.

## What a game calls

- `plugins.loader.load(name)`: a promise of the thing; it never throws, a failure rejects and is written
  to the console once. `retry(name)` starts a failed one again.
- `on(name, f)`: `f` runs once it has landed, or at once if it has.
- `get(name)`, `ready(name)`: the thing, or undefined while it is coming.
- `model(name)`: `{ scene, animations }`, the node tree and skeleton cloned per call, geometry and
  materials shared by every copy.
- `preloads()`: `{ done, of }`, every preloaded entry and every font, landed or failed.

Every entry is preloaded, started on the first tick, unless it says `preload: false`; one that does
starts only when something calls `load` or `on`. `"preload": true` on an entry says nothing.
- `shaders()`: how many things render3d is still compiling, through `world.loader.mods.shaders`.
- `settled()`: whether every plugin `world.loader.mods.ready` names says its world is whole
  (terrain3d's land and lod3d's tiles where the camera starts).

No row ever carries whether a file has landed: a fetch takes a different time on every machine.

## How a load runs

A game calls the loader as above and things arrive a frame or two later; nothing else changes for it.

- **Fonts and the ui's pictures first.** Nothing else starts, of any type (a model, a `binary` kit, a
  json, a texture), until every font and every preloaded entry `for: "ui"` has landed or failed, and those land ahead of anything else waiting. The ui draws nothing
  until its fonts are in, so this is what lets a loading screen show within a frame or two.
- **Four models at a time**, the rest waiting their turn in the order asked.
- **Meshopt off the page.** A gltfpack glb's buffers are unpacked in three workers in a page.
- **Landing on a tick.** Nothing lands the moment it decodes. Each tick of the loader hands over what
  has decoded, in order, for four milliseconds, at least one picture a tick: a batch arrives over
  several frames, each frame's share bounded.
- **Textures to the GPU before landing.** Each picture of a model or a texture is sent with
  `renderer.initTexture` inside that budget, so the frame that first draws it uploads nothing.

The numbers (four at once, four milliseconds, three workers) are fixed in the plugin; no scene sets
them.

## Shaders before the first draw

A game dresses a model's materials after the loader hands it over, so render3d compiles, not the
loader. An object put straight into render3d's scene or overlay, or handed to
`plugins.render3d.prepare(object)` after it is given a material it has not drawn with, is compiled for
that scene and left out of every draw until its programs are ready on the GPU's own threads
(`KHR_parallel_shader_compile`): it shows a few frames late instead of freezing the frame that first
draws it.

- It compiles last of the scene's own `onBeforeRender`, where lights3d has taken its lights out of
  three's; compiled anywhere else, a lit material is compiled for the wrong light count and again at
  the draw.
- Everything put in a scene in one frame is one `renderer.compile`: three walks the whole scene for its
  lights once a call.
- A program depends on the mesh as well as the material (skinned, instanced), so materials are compiled
  through the meshes that draw them, never alone. supershader3d's are compiled through world3d's town.
- A plugin that swaps a material on something already in the scene calls `prepare`, as terrain3d does
  for its rings when the ground's look changes.
- Objects added inside one already in the scene, and everything on a GPU without the extension, compile
  on first draw. `compiling()` is the count; it is 0 with no renderer.

## GPU-compressed textures (KTX2)

A `texture` entry whose url ends `.ktx2` is GPU-compressed: Basis Universal, transcoded in a page by
three's KTX2 reader into what the GPU reads (BC7, ASTC, ETC2…) and uploaded as it is with the mips the
bake made. It is several times faster to upload than a WebP's pixels and about as small to download.
One holding several layers is a CompressedArrayTexture.

- It is render3d's alone; one `for: "ui"`, or in a scene with no render3d, fails.
- It decodes once render3d has a renderer. Its transcoder is `plugins/loader/basis/`, three's own files,
  which a published site carries; a test holds them equal to three's.
- Its colour space is the file's unless the entry gives `space`; `wrap` and `anisotropy` as on any
  texture. In node it is the 1×1 white texture every picture is.

The bake writes it (`scripts/bake.ts`): `ktx2(srcs, out, size, space)` cuts each source to `size` square
and has `basisu` write ETC1S at its own settings, mipmapped, as one array (several sources) or one
texture. `space` is the colour space the file says, which the loader samples it in:
- `'linear'`, when left out: the bytes read as they are, for a picture of numbers (a normal or a
  roughness map) and for supershader3d's stack, whose shader decodes each layer itself.
- `'srgb'`: a picture of colours (a colour map), which the GPU decodes to linear light as it samples.
  Written linear, a colour map is drawn washed out, and an entry's `space` cannot say sRGB. ETC1S keeps the file about as small as the WebPs; UASTC is many times the download and is not
used. `yarn health` checks `basisu` (`brew install basis_universal`, or `BASISU` in `.env`).

### supershader3d's stack

A looks file with a `stack` holds every picture of its looks again as one KTX2 array, with each colour
picture's mean. supershader3d loads the catalogue's `stack.asset` and binds it as `lookPictures`: nothing
is drawn on a canvas, read back or mipmapped on the page. Its pictures' own entries are not asked for.
A looks file with no `stack` is drawn from its pictures as before. `stack(looks, folder, out)` in the
bake makes one from the pictures already cut into `folder`; the looks tool runs it itself.

## Migrating a game's bake to KTX2

For a game baked before KTX2, and for a new game taking the compression up: done once per game, in its
own repo. Each step is checked before the next.

1. **The machine.** `yarn health` passes `basisu`.
2. **The looks' stack.**
   - A bake that calls `t.looks({ materials, out, pictures })`: nothing to change. Bake again
     (`yarn bake <game>`) and the looks file has its `stack`, the KTX2 written beside the pictures as
     `<scene>.pictures.ktx2`.
   - A bake whose looks file another tool writes (a world3d place through pro-ng's `build.mjs`, after
     `packLooks`): once the pictures are copied into the game's `looks/`, run
     `const stacked = await t.stack(looks, path.join(into, 'looks'), looksFile)` and write `stacked` as
     the looks file. Bake again.
3. **The catalogue.** In the scene whose catalogue lists the looks' pictures, add the stack and take the
   pictures out (left in, each would still be fetched and uploaded one by one):
   ```json
   "<scene>_pictures": { "type": "texture", "url": "/games/<game>/assets/looks/<scene>.pictures.ktx2", "preload": true }
   ```
   A bake that writes the catalogue itself (a world3d place's) writes this entry in place of the
   pictures', so baking again keeps it.
4. **The game's other textures.** Each loose `texture` entry render3d draws (a ground layer, a model's
   own picture cut as a texture, a sheet page for render3d), not one `for: "ui"`: the bake writes it with
   `t.ktx2([source], '<name>.ktx2', size, space)` in place of `t.webp`, `'srgb'` for a colour map and
   `'linear'` for a normal or roughness map, and its entry's url names the `.ktx2`, its `space`, `wrap`
   and `anisotropy` kept. A game whose maps a `cc0-textures.json` cut as WebP moves its sets to a data
   file its bake reads, and cuts each with `t.texture(set)` and `t.ktx2`; left in, the cc0 cut writes
   the WebPs again.
5. **Shaders on the loading screen** (when the game shows one): `world.loader.mods.shaders: "render3d"`
   in each scene with render3d, and the `loading` panel's `shaders` line (The loading screen, below).
6. **Commit** the `.ktx2` files with the rest of the baked art (`committing-a-game`); the WebPs the
   catalogue no longer names stay only if something else reads them.
7. **Check it.** The game's tests beside what changed. Then its `dev.html` in Chrome: the scene draws as
   before, and `__page.client.plugins.supershader3d.uniforms.lookPictures.value.isCompressedArrayTexture`
   is true.

## The loading screen

A mod of the loader's for the ui, `plugins/loader/loader.ui.ts`, the word `loading` on a panel. A game
asks for it; nothing shows it unasked. It covers the canvas in `fill`, draws each picture once it
lands, fills the bar to `preloads()`, shows one line of `text` at a time; once every file is in and while
`shaders()` is above 0, shows its `shaders` line in place of the tips and fills the bar as they finish;
waits, bar full and tips going round, until `settled()`; then fades over `fade` seconds and never shows again for that client, so each scene shows its own while
its own art comes down. Every field is in its header.

## Adding a loading screen to a game

Done once per game. The screen is the game's art and words, laid out in the game's own pixels; nothing
of it is code.

1. **The pictures.** A backdrop the size of the game's canvas (its `engine` prefab's `width` × `height`,
   1280 × 720 say), and a logo or title art, any size. They live in `games/<game>/assets/loading/`:
   - made from a source in the library, the bake cuts each with `t.webp(source, out, size)` (WebP, and
     the ui is PixiJS, so `for: "ui"` pictures stay WebP, never KTX2);
   - drawn by hand, committed as WebP or PNG as they are, small: the screen's art is the first thing
     fetched, ahead of everything else.
   Keep a logo's transparency in PNG or WebP with alpha.
2. **The catalogue.** Each picture a `texture` entry `for: "ui"`, preloaded (the screen refuses one
   that says `"preload": false`), in the catalogue of every scene that shows the screen, the manager's when every scene
   shares it:
   ```json
   "splash": { "type": "texture", "url": "/games/<game>/assets/loading/splash.webp", "for": "ui", "preload": true },
   "logo": { "type": "texture", "url": "/games/<game>/assets/loading/logo.webp", "for": "ui", "preload": true }
   ```
   A font for its words is a `font` entry (fonts always load first): `"Ithaca": { "type": "font", "url": "/games/<game>/assets/fonts/Ithaca.ttf" }`.
3. **The plugins.** Each scene that shows it lists `ui`, with `loader` before it:
   `"plugins": ["loader", "scenemanager", "player", "render3d", "ui", ...]`.
4. **The panel**, in `world.ui` (the manager's for every scene; a scene that gives its own `world.ui`
   holds all of it, so it repeats the panel). The panel is the canvas's size, centred, modal so no
   key or click reaches the game while it is up, on a layer over every other panel; every `at` and
   `size` inside is in its pixels, from its top left:
   ```json
   "ui": {
     "mods": { "behaviors": ["loader"] },
     "panels": {
       "loading": {
         "anchor": "center", "size": [1280, 720], "layer": 100, "modal": true,
         "loading": {
           "fill": { "color": 723726 },
           "pictures": [
             { "picture": "splash", "at": [0, 0], "size": [1280, 720] },
             { "picture": "logo", "at": [440, 90], "size": [400, 200] }
           ],
           "bar": { "at": [340, 600], "size": [600, 14], "edge": 2, "frame": { "color": 16115400 },
                    "track": { "color": 2105376 }, "fill": { "color": 16769280 } },
           "lines": { "style": "tip", "at": [640, 650], "every": 4,
                      "text": ["Hold shift to run.", "The bridge falls at dusk."] },
           "shaders": { "style": "tip", "at": [640, 650], "text": "Compiling shaders" },
           "fade": 0.8
         }
       }
     },
     "styles": { "tip": { "fontFamily": "Ithaca, Arial, sans-serif", "fontSize": 26, "fill": 15263976 } },
     "keys": { "up": "ArrowUp", "down": "ArrowDown", "left": "ArrowLeft", "right": "ArrowRight", "press": ["Enter", " "], "back": "Escape" }
   }
   ```
   A game with a `world.ui` already adds the panel, the `mods` and the style to it. Pictures draw in
   their order, the first under the rest: the backdrop first, then the logo over it. A colour is a
   number, `0xRRGGBB` written in decimal.
5. **The words.** `lines.text` is the messages, one shown at a time, the next every `every` seconds,
   round again after the last: tips, the place's name, a line of the story. Each is centred on `at`, so
   keep each to one line at its font size; nothing measures text. An entry can be `{ "text": "...",
   "picture": "ar1" }`: while that line shows, its picture (a preloaded `texture` entry `for: "ui"`) is
   drawn at the panel's top left corner at the size the file was made, never resized, so a game sizes it
   when it commits it. A game that uses this leaves `pictures` out. `shaders.text` is what shows once the
   files are in and shaders are still compiling, in the same place.
6. **Shaders.** `world.loader.mods.shaders: "render3d"` in each scene with render3d, so the screen waits
   for the shaders and says so; left out, it fades once the files are in.
7. **The world.** In each scene with terrain3d, `world.loader.mods.ready: ["terrain3d"]`,
   `world.terrain3d.preload: true`, and in `world.terrain3d.mods.ready` every plugin standing on the
   land the scene lists (`"lod3d"`, `"grass3d"`), so the screen stays up until the land, its trees and
   its grass stand whole where the camera starts; left out, the game shows while they are still being
   made.

   **Check it, every time a scene's world is invisible or half made when the screen lifts.** The
   three are a chain, and each link is needed:
   - `world.terrain3d.preload: true` alone holds nothing: it only makes terrain3d's `shown()` wait.
     The screen waits on it only when the scene's `world.loader.mods.ready` names `terrain3d`.
   - A game whose `world.loader` is the manager's (`vehicles.scene.json`) gets `mods.ready` there for
     every child that has no `world.loader` of its own; a child with its own loader block (vehicles'
     title) needs it in that block too, since a child's world replaces the manager's key by key.
   - `world.terrain3d.mods.ready` names each of lod3d and grass3d the scene lists; a scene that names
     only `grass3d` shows before its trees.
   - A scene's terrain3d settings may come from a partial it `extends` (vehicles'
     `plains.partial_scene.json`); read the partial as well as the scene.

   vehicles had `preload: true` and grass3d under `terrain3d.mods.ready` and still showed an empty
   world, because no scene named `terrain3d` under `world.loader.mods.ready`.
8. **Check it.** The game's tests beside what changed. Then `index.html` in Chrome, with the network
   throttled and the cache off. The page's cover shows the backdrop, logo, bar and words within one
   fetch of the page opening, before the code has come down. The ui's screen then takes over with no
   change you can see, shows "Compiling shaders" after the files, then fades. Take each screenshot on
   a signal from the page (the cover's picture shown, its bar, the cover gone), and look at each one.
   A restarted dev server is needed after `scripts/bundle.ts` or `loader.cover.ts` changes: Vite
   doesn't reload what its config imports.

### The cover: the screen before any code

A page can't run the ui until its code has come down, and the scenemanager waits for every truth's
`prepare` before the ui has a client. That `prepare` fetches every preloaded file a rule reads: kits,
data, definitions. So the screen above, on its own, shows only once nearly everything is in. The
cover solves this, and the game does nothing for it. When the entry scene has a `loading` panel, the
bundle writes the cover into the first bytes of `index.html` and `client.html`
(`plugins/loader/loader.cover.ts`, `loader.cover.js`). The cover:
- draws the same panel in the DOM, where the ui will draw it;
- fetches every scene's files the loader fetches first, the screen's pictures and fonts ahead of the
  rest, while the code comes down;
- hands those fetches to the loader, so nothing is fetched twice.

The ui's screen takes the cover off the frame after it has drawn every picture under it. Its bar
starts from where the cover's was. On a published site the cover takes the place of
`scripts/loading.html`. `dev.html` has none: it can enter any scene.

The screen is a mod because the drawing is the ui's and the waiting is the loader's. The ui keeps a
table of words: any field of a panel's entry that is not a placing field (`anchor`, `at`, `size`, `clip`,
`layer`, `modal`, `backdrop`, `key`, `scale`, `group`, `screen`) is a word, delivered by the plugin that
owns it in `<a>.ui.ts`'s `behaviors()`, named in `world.ui.mods.behaviors`, and run every tick before
the actors (`connecting-plugins-using-mods`).

## Tests

- **Things land only on a tick, in node too.** A test that awaits `load` ticks the loader while it
  waits, as a page does every frame: `await vi.waitFor(() => { me.tick(w); expect(me.ready(name)).toBe(true) })`,
  or the `run` and `ticked` helpers of `loader.plugin.test.ts`. One that awaits without ticking hangs.
- **A page test in node stands in a `Worker`.** A process with a `location` is a page, so the loader
  turns on the meshopt workers: `vi.stubGlobal('Worker', class { postMessage() {} terminate() {} })`,
  and `MeshoptDecoder.useWorkers(0)` when the page ends, since the decoder is one per process.
- **A stand-in glTF has a scene that traverses**, and a stand-in renderer has what three's has
  (`extensions`, `properties`, `compile`, and calls the scene's `onBeforeRender` when it renders): fix
  the stand-in, never guard the plugin.
- **A window behind others loads slowly**: landing rides on frames and Chrome gives that window almost
  none. Read Chrome's long tasks, not frame times, to see whether the page's thread was blocked.

## Questions never asked

- Should a game set how many models decode at once, or the budget? No: they are fixed in the loader.
- Should node land things at once so a test need not tick? No: a test ticks, as a page does.
- Should the loader compile shaders? No: render3d, once a model is dressed.
- Should a material be compiled on its own, ahead of any mesh? No: through the mesh that draws it.
- UASTC, or a higher ETC1S quality? No: ETC1S at basisu's own settings.
- A colour map as KTX2, linear, with `space` on its entry? No: `ktx2(..., 'srgb')`; the file says its space.
- Does a game get the loading screen without asking? No: `world.ui.mods.behaviors` and a `loading`
  panel.
