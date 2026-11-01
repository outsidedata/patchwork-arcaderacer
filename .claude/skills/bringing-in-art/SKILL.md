---
name: bringing-in-art
description: Use in core, or any clone of it, when getting a picture, sprite sheet, tileset, model, animation, font or any other file into a game and drawn. That covers a PNG, an Aseprite or TexturePacker sheet, a .glb or a bitmap font in `games/<game>/assets/`, its entry in the scene's loader catalogue (`world.loader.assets`, the `texture`, `sheet`, `model`, `bitmapfont`, `font`, `palette`, `pixels`, `binary` and `json` types), and drawing it from a kind's `<kind>.client.ts` through `plugins.loader` (`get`, `load`, `on`, `model`) or through a plugin's table (`sprite2d`, `sprite3d`, `anim`, `particle2d`). It also covers an image the HUD shows (`"for": "ui"`) and a file the loader has no type for. Also use it when art does not show, the page stays blank, art is blurred, too big or off the point it stands on, or a test says `loader <name>: document is not defined`.
---

# Bringing in art

Every file a game uses, whether a picture, a sprite sheet, a model, a font or a data file, is an
entry in its scene's asset catalogue, `world.loader.assets`. It reaches whatever draws it through the
`loader` plugin and nothing else, which fetches it once and decodes it for whatever draws it.
Nothing else fetches or decodes a file or writes its path in code: no `fetch`, no
`PIXI.Assets.load`, no `new THREE.TextureLoader()`, no `GLTFLoader`, no `import url from
'./assets/x.png'`, in a rule, an actor or a plugin. A kind of file the catalogue cannot hold yet is a
type added to the loader, never a fetch beside it.

The loader is `plugins/loader/`. The header of `loader.sim.ts`, the server half, is the catalogue,
the types a rule reads and every sheet and map format. The header of `loader.plugin.ts`, the browser
half, is what each type is decoded to on a page. The engine is frozen and is never touched for any of
this. `addons/scenemanager/scenemanager.addon.ts` says where a game keeps its files (`assets/`), and
the game `yarn new-game` writes (`scripts/new-game.ts`) already has a catalogue of one
entry, its definitions, and a `loader` row, prefab and plugin.

## When it applies

It applies to getting a file into a game and drawn: a picture or a sheet on a 2D kind, a billboard
or a model in 3D, a picture on the HUD, a font, and a type of file the loader lacks. It does not
cover:

- making the art. A model, a level's meshes or a texture is made in Blender and exported as glTF:
  that is `making-game-assets`. Packing an animation's frames into a sheet, and proving no frame
  swims, is `onionskinning-sprite-sheets`.
- how a thing is lit and shaded, its materials and the frame's look. That is `writing-the-look`.
- a level's map, a `tilemap` entry the `tilemap` plugin draws. That is `building-a-level`.
- sounds and music, `sound` entries and the `audio` plugin. That is `sound`.
- what the HUD shows and how its panels are laid out. That is `building-the-hud`. This skill
  covers the entry an image on it is decoded from.
- the kind's rule, its row and its definition. That is `designing-a-kind`. A new plugin that draws
  a new sort of thing is `building-a-plugin`.

## Where a file and its entry go

- A file the game reads sits in `games/<game>/assets/`, or a folder under it. Beside those files
  `assets/` keeps what they are made from, which the game never reads: the rip art is cut from, and
  the script that draws, writes or cuts a file, kept there so the file can be made again
  (prime-directive, Names and tests).
- A model or texture a game ships is built, never raw: a glb packed by gltfpack (meshopt geometry,
  WebP textures) and a loose texture as `.webp`. The raw parts it is made from (source glbs,
  full-size texture sets, packs) live in the library, `PATCHWORK_LIBRARY`, never in the game.
  `games/<game>/assets/<game>.bake.ts` makes every built file from the library and the scripts beside
  the art, and `yarn bake <game>` runs it (`scripts/bake.ts`: its tools `blender`, `pack`, `webp`,
  `scratch`, `library` and `texture`, a cc0-textures set's maps out of the library, downloaded
  first when it is not there; the cc0-textures.com sets a game draws as they are are listed in
  `assets/cc0-textures.json`, which the bake cuts into maps before it runs the bake file; `pack` is `-cc -kn -km -ke -vpf -tw`, so node and material names, extras and
  float positions survive for a look that instances a mesh's geometry; a glTF mesh's own name does
  not, so a mesh found by name is a node of one primitive). What of it is committed, and the check
  run before every commit, is `committing-a-game`. `yarn health` checks the machine first. The
  loader decodes both with no setup: meshopt and `EXT_texture_webp` in a glb, and a `.webp` texture
  entry like a jpg.
- Art whose licence lets a game ship it but forbids handing the files on (an itch.io pack, a bought
  set) is never in the repo as itself. The pack is kept as downloaded in the library under
  `vendor/<pack>/`, which is never committed, and the script that cuts it seals every picture it
  makes into one wad with `seal` from `plugins/loader/loader.sim.ts`, written in `assets/`. The scene
  names the wad in `world.loader.wads`, beside `assets`, and the loader opens it in memory: every
  file in it is at its own path from the wad's folder, so the catalogue, the sheets and the maps name
  `hero.png` as ever and never know it came from a wad. The header of `loader.sim.ts` has the
  format. It hides the files and no more: the key ships with core.
- Its entry is a key of `world.loader.assets` in the scene file: `{ "type", "url", "preload"?, ... }`.
  The `url` is the file's path from the repo's root, with a leading `/`, written as the file is
  named, spaces and all: `"/games/<game>/assets/coin.json"`, as `yarn new-game` writes its
  definitions' entry. The loader encodes it where it fetches it. A file another file names, such as
  a sheet's page, a multipack's other packs, a map's tilesets or a font's pages, is named from that
  file's own folder and has no entry of its own.
- The catalogue never changes, so it is on `world`, never on a row or a prefab. A child scene's
  `world` is the manager's with the child's own keys over it, key by key
  (`addons/scenemanager/scenemanager.addon.ts`, `child`). So a child that gives `world.loader` has
  its own catalogue and none of the manager's entries. A catalogue every scene shares is written
  once, in `<game>.scene.json`'s `world.loader`, and a scene that needs one more entry names them
  all in its own.
- Which entry a thing draws is never written in code. A kind's actor reads the entry's name off its
  definition, `"image": "hero"` in `assets/<game>.json`, read with `def`. A plugin's kinds name it
  in the plugin's table on `world`, `world.sprite2d.kinds.<kind>.sheet` or
  `world.anim.kinds.<kind>.model`, or on the row when it changes while the game runs, as a sprite2d
  row's own `sheet` does.

## The types

- `json`: a data file, the definitions among them. A rule reads it with `json(w, name)` and a kind's
  definition with `def(w, me.kind)`. An actor reads `json(plugins.wire, name)` and
  `def(plugins.wire, row.kind)` (`plugins/loader/loader.sim.ts`).
- `sheet`: an Aseprite or TexturePacker JSON and its page images, or a Tiled `.tsj`. It holds frames,
  clips and slices. The entry's `nearest` (pixel art: nearest filtering, whole pixels), `facing`
  (which way each run of a clip faces) and `palette` belong to the catalogue, never the file. A rule
  reads the data with `sheet(w, name)`. On a page, `plugins.loader.get(name)` is `{ data, pages,
  texture(id), uv(id), pick, frameOf }` once every page has landed. A frame's anchor is the point
  that stands on the row's `pos`. In an Aseprite or TexturePacker JSON it is the frame's `pivot` as
  a fraction of the whole frame, else TexturePacker's `anchor`, and a frame with neither stands on
  its top-left corner. A Tiled `.tsj` tile stands where Tiled stands a tile object: on the
  tileset's `objectalignment`, bottom-left when it is `unspecified`, moved by its `tileoffset`
  (`loader.sim.ts`, `tileSheet`).
- `texture`: one picture, decoded by the scene's renderer. It is a PixiJS texture under render2d,
  and a three texture under render3d, sRGB unless the entry says `"space": "linear"` (a normal or
  roughness map), with `"wrap": "repeat"` and `"anisotropy": n` beside it. Those three are read on a
  `texture` render3d decodes and nowhere else: on any other type, on one `for: "ui"`, or in a scene
  with no render3d the entry fails (`loader.plugin.ts`, `begin`). With neither renderer it is an
  `HTMLImageElement`. No rule reads it. `nearest` is not read on a texture: it is a sheet's, a
  tilemap's and a bitmap font's.
- `model`: one self-contained `.glb`; a `.gltf`, which names files beside it, is refused. It needs
  render3d. `plugins.loader.model(name)` is `{ scene, animations }`, the scene cloned with its
  skeleton on every call, so each row that draws it has its own.
- `bitmapfont`: an AngelCode `.fnt` and the pages it names, installed as the PixiJS bitmap font of
  the entry's name, for render2d or for the ui.
- `font`: a `.ttf`, `.otf`, `.woff` or `.woff2`, installed in the page as the font of the entry's
  name, so any text whose style's `fontFamily` is that name draws with it: the ui's, render2d's and
  the DOM's alike. Every font is preloaded, whatever its entry says, and the ui draws nothing until
  `plugins.loader.fonts()` says every font has landed or failed, so no text is drawn in a fallback
  and kept. In node there is no `FontFace`, and a font is `{ family }`, its name.
- `palette`: a GIMP `.gpl`, its colours as 0xRRGGBB. sprite2d draws a row in another palette than
  its sheet's.
- `pixels`: a PNG a rule reads as data, never drawn. `binary`: bytes in a format of the game's own.
- `tilemap` is `building-a-level`'s, and `sound` is `sound`'s.

Six types are files a rule reads: `json`, `sheet`, `palette`, `tilemap`, `pixels` and `binary`. The
server half decodes each once per process. One marked `preload` is there before the first step and
before the page's first frame, because the scenemanager awaits the loader's `prepare`, so a rule
reads it on any step and an actor in its `setup`. A preloaded file of these six that cannot be
fetched or decoded stops the scene before its first step. `texture`, `model`, `bitmapfont`, `font`
and `sound` are the browser half's alone (a `font` starts on the first tick whether or not it is
`preload`): `preload` starts them on the loader's first tick, they land
some frames later, and no rule reads them. A sheet's data is there from the first frame, but its
pages land later, and `plugins.loader.get` hands nothing until they have.

## Drawing it

There are two ways, and core uses both. When a plugin already draws the sort of thing, as sprite2d
draws a frame of a sheet for each row, the kind uses that plugin and draws nothing of its own: an
actor never builds what a plugin builds.

**A plugin's table.** A plugin that draws a sort of thing reads a table on `world` naming the
entry, and draws every row of the kinds it lists. Such a kind needs no `<kind>.client.ts`: a row
with no client file has no actor (`engine/browser.ts`). Each plugin's header gives its table.

- `sprite2d` draws rows as frames of a sheet in render2d's world. Its table is
  `world.sprite2d.kinds.<kind>: { layer, turn, sheet?, clip?, facing?, shadow? }`. A look every row
  of the kind shares is given once there; otherwise each row carries `sheet`, `clip` and `facing`.
  The row carries `pos`, and `frame`, which the kind's rule moves on with `play` from
  `plugins/loader/loader.sim.ts`, keeping the seconds shown in a row field beside it. sprite2d
  draws in render2d's world, so the scene needs `world.render2d` naming the layer. `ground: [[1, 0],
  [0, 1]]`, `up: [0, -1]`, `zoom: 1`, `look` at the canvas's middle and `layers` make the world's
  points the canvas's pixels, as a scene with no world has them. sprite2d is listed before
  `render2d` in `plugins`.
- `sprite3d` draws billboards of a sheet in render3d. Its table is `world.sprite3d: { ppm,
  alphaTest, kinds }`, and it is listed before `render3d`, or it throws.
- `anim` draws a `model` per row, posed by skeletal clips from a rig file, a `json` entry. Its table
  is `world.anim.kinds.<kind>: { rig, model, ... }` (`plugins/anim/anim.sim.ts`).
- Others draw from the entries their tables name. `particle2d` and `particle3d` draw sheets named in
  an effects file. `grid` and `volley2d` draw sheets. `terrain3d` draws textures. `scatter3d`,
  `flight3d`, `crowd3d`, `motion3d` and `box3dvehicle` draw models. `solids` draws a model of its
  own, a `json` entry `world.solids.kinds` names, and a paint of it that gives `map` lays a
  `texture` entry on its faces, `scale` metres to one span of the picture.

A rule that plays a clip on a sprite2d kind reads the look where sprite2d reads it:

```ts
// coin.sim.ts: `frame` moved on by the clip's own frame durations, `ft` the seconds it has shown.
import type { Kind } from '#engine/engine.ts'
import { play, sheet } from '#plugins/loader/loader.sim.ts'
import type { Look } from '#plugins/sprite2d/sprite2d.plugin.ts'

export const coin: Kind = {
  tick(me, dt, w) {
    const look = w.world.sprite2d.kinds[me.kind] as Look
    ;[me.data.frame, me.data.ft] = play(sheet(w, look.sheet), look.clip, me.data.frame, me.data.ft, dt)
  },
}
```

Its prefab holds `pos`, `frame` and `ft`, and the sheet's entry has `preload`, so the rule finds the
sheet on its first step.

**The kind's own actor.** `<kind>.client.ts` draws through the renderer the scene lists and asks
the loader for the thing. The thing a seat plays as is its `player` row (`designing-a-seat`), so its
look is `player.client.ts`, which the page loads once for every `player` row it is sent and which
draws the thing for every one of them, so each seat sees the others. `yarn new-game` still writes a
`body.client.ts` that the `player` row's spawned `body` draws with; that is never the model, and it is folded into `player.client.ts` first, with the rest of the `body`. Its
square of the definition's colour, drawn from a picture instead, is:

```ts
// player.client.ts: the seat's thing, for every seat's `player` row: the picture its definition's
// `image` names, a `texture` entry, drawn `size` pixels square, the point `anchor` of it (fractions
// of it across and down) on the row's `pos`. Keys and the camera are only for the row that is `mine`.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { def } from '#plugins/loader/loader.sim.ts'
import type { Binds } from '#plugins/player/player.plugin.ts'

let sprite: any
let image: string
let ours = false

export function setup(row: Row, plugins: Plugins) {
  const d = def(plugins.wire, row.kind)
  image = d.image
  sprite = new plugins.render2d.PIXI.Sprite()
  sprite.anchor.set(d.anchor[0], d.anchor[1])
  sprite.width = d.size
  sprite.height = d.size
  plugins.render2d.stage.addChild(sprite)
  ours = row.data.mine === true
  if (ours) plugins.player.bind({
    stick: [{ keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'], send: (x, y) => ['move', x, y] }],
  } satisfies Binds)
  tick(row, plugins)
}

export function tick(row: Row, plugins: Plugins) {
  const texture = plugins.loader.get(image)
  if (texture) sprite.texture = texture
  else void plugins.loader.load(image)
  sprite.position.set(row.data.pos[0], row.data.pos[1])
}

export function remove(plugins: Plugins) {
  plugins.render2d.stage.removeChild(sprite)
  sprite.destroy()
  if (ours) plugins.player.unbind()
}
```

- Its definition in `assets/<game>.json` holds every number it draws by: `{ "speed": 240, "size":
  32, "image": "hero", "anchor": [0.5, 0.5] }`. Where the picture stands on `pos` is one of them,
  never a number in the actor.
- What it draws is made in `setup` and held in a variable at the top of the file, since the page
  imports the file once per row. The variable is set in `setup`, never where it is declared.
- It asks `plugins.loader.get(name)` each frame and `plugins.loader.load(name)` while that hands
  nothing, as sprite2d does, or hands `plugins.loader.on(name, f)` a callback. Until then it draws
  nothing, or something else. A name asked for before the loader's first tick waits for it. A
  failed name is fetched once and reported once, however often it is asked, and `load` never
  throws. No row ever carries whether a file has landed: a fetch takes a different time on every
  machine, and two machines would disagree.
- A texture, a sheet and a model are the loader's. `remove` destroys the sprite or the mesh and
  never the texture, and `sprite.destroy()` leaves the texture alone.
- A PixiJS sprite is sized with `width` and `height`, which hold when the texture arrives. Set
  before the texture lands, `setSize` scales the empty texture's single pixel and is not kept: a
  64-pixel picture sized to 32 was drawn 2048 pixels across.
- In 3D it calls `plugins.loader.model(name)` once, when `plugins.loader.ready(name)` or in `on`,
  keeps that clone's `scene` in its variable, adds it to `plugins.render3d.scene`, and takes it off
  in `remove`. A three texture goes on a material. How either is lit is `writing-the-look`'s.

## The UI's own entry

The UI draws on its own canvas with its own renderer, which cannot draw a texture decoded for the
game's renderer. So an image the HUD shows is an entry with `"for": "ui"`, decoded through the ui's
PixiJS whatever the scene draws with. A picture both the game and the HUD draw is two entries with
one url, as a 3D scene's mesh and its HUD icon are. A `sheet` and a `bitmapfont` may be `for: "ui"`
too. An entry `for` anything but `ui`, or `for: "ui"` in a scene that names no `ui` plugin, fails.

## A file the loader has no type for

It gets its type in the loader, before the game uses it: general, naming no game, tested, and there
for every game that has such a file. It never gets a `fetch` in an actor or a plugin. The places a
type touches, as the types there now touch them:

- `plugins/loader/loader.sim.ts`, when a rule reads it: a paragraph in the header saying what the
  file is and what it decodes to, the type in `DECODED`, its branch in `decodeFile`, a reader like
  `json`, `sheet` and `binary`, its case in `prepared` when its value is not the decoded table (as
  `binary` hands its bytes), and an `…At` for tests, as `binaryAt`.
- `plugins/loader/loader.plugin.ts`: the header's paragraph, the type in `begin`'s list, a refusal
  in `begin` when the scene names nothing that can decode it (as a `model` with no render3d, a
  `sound` with no audio), and its branch in `decodeEntry`.
- A test beside each file it changes: `loader.sim.test.ts` and `loader.plugin.test.ts`.

## The work in order

1. Get the file. Make it (`making-game-assets`, `onionskinning-sprite-sheets`), or write it with a
   script, kept beside it in `assets/`. Put
   it in `games/<game>/assets/`.
2. Pick its type by what draws it and whether a rule reads it (The types).
3. Write its entry in `world.loader.assets`: the type, the url with its leading `/`, `preload` when a
   rule reads it on its first step or it should start at once, and the type's own fields
   (`nearest`, `facing`, `palette`, `for`, `space`, `wrap`, `anisotropy`). An Aseprite or
   TexturePacker sheet's frames each have a `pivot` where the thing stands; a Tiled tileset says it
   with `objectalignment`.
4. Name the entry where its drawer reads it: the kind's definition, the plugin's table on `world`,
   or the row when it changes.
5. Draw it. For a plugin, list it in `plugins` in the order its header asks, write its table on
   `world`, give render2d its world for sprite2d, and delete a `<kind>.client.ts` that would draw the
   kind a second time. For the kind's own actor, write `<kind>.client.ts` as above, with a header
   saying what it draws from what.
6. A clip it plays: `frame` and the seconds shown on the row and in its prefab, moved on by its rule
   with `play`.
7. The HUD shows it too: a second entry, `"for": "ui"`.
8. The tests beside what changed, run, then broken on purpose (How it is proven).
9. Play it and look at it.

## What goes wrong

- A url with no leading `/`. Node reads it from the working directory either way, so a node test
  that reads the file passes. The page asks for it beside the page itself and it fails. A preloaded
  `json`, `sheet`, `palette`, `tilemap`, `pixels` or `binary` entry then stops the scene before its
  first step, and the page stays blank. A `texture`, `model`, `bitmapfont`, `font` or `sound` entry leaves
  the page running with the art missing, and `loader <name>: …` in the browser's console.
- A page test of a 2D scene that draws a picture: node decodes no picture for render2d or the ui,
  so the entry fails with `loader <name>: document is not defined`. `load` never throws: the
  message goes to the console, and the test fails on its own next assertion, the sprite with no
  texture or no url asked for, unless it awaits `load` itself. The test stands in for
  `PIXI.Assets.load` (How it is proven). Under render3d, node hands every texture as a 1×1 white
  `DataTexture` and decodes a `.glb` itself.
- The header of `plugins/loader/loader.plugin.ts` says node decodes every image as a 1×1 white
  texture. The code does so only under render3d, not under render2d and not for the ui
  (`decode`). The header and the code disagree. Meeting it, the job includes the fix: the header
  made to say what the code does, or the code made to do what the header says, with a test in
  `loader.plugin.test.ts`.
- sprite2d in a scene with no `world.render2d`, which throws `render2d was asked for the layer
  <layer>, and the scene gives no world.render2d` on the next frame.
- An Aseprite or TexturePacker sheet whose frames have no `pivot` and no `anchor`, so each frame's
  top-left corner stands on `pos` and the thing is drawn below and to the right of where it is.
  `pivot` on each frame in the file sets it. A Tiled tileset's tiles stand on its `objectalignment`
  and `tileoffset`: those are set in Tiled.
- `nearest: true` written on a `texture` entry for pixel art, which the loader does not read, so the
  picture is filtered smooth. Pixel art that must stay sharp is a `sheet` with `nearest`.
- `setSize` on a sprite before its texture lands, which draws it at the empty texture's scale.
- The UI handed the texture decoded for the game's renderer. It is an entry of its own, `for: "ui"`.
- A child scene given its own `world.loader` for one new entry, which drops every entry the
  manager's catalogue gave it.
- A test that only checks a sprite exists, which passes with the wrong picture or the wrong url. It
  checks the texture is the loader's, and the url asked for against the literal path from the
  repo's root: checked against the entry's own url it passes with the slash missing.
- A plugin's sprite and the look's own square both left drawing one kind: the `player` row under
  `world.sprite2d.kinds.player` with `player.client.ts` still drawing the square it took from the
  generated `body.client.ts`.
- The seat's thing drawn as a kind of its own that the `player` row spawned, a `body` or a `hero`
  with its own `<kind>.client.ts`. The thing is the `player` row, drawn by `player.client.ts`.
- `player.client.ts` drawing only the row that is `mine`: every other seat sees nothing of it. It
  draws every `player` row and binds keys only for its own.
- A kind a plugin draws by table that is the seat's thing: its table entry is for `player`
  (`world.sprite2d.kinds.player`, `world.anim.kinds.player`), never for a kind the `player` row spawns.

## How it is proven

Tests sit beside what they test and run in node: `yarn vitest run <file>`.

A kind its own actor draws has `<kind>.client.test.ts` beside `<kind>.client.ts`. It drives a page
the way `index.html` does:

```ts
import { expect, test, vi } from 'vitest'
import * as PIXI from 'pixi.js'
import { boot, type Scene } from '#engine/engine.ts'
import type { Client } from '#engine/browser.ts'
import { accept, link, load, manager, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { sim } from './<game>.sim.ts'
import file from './<game>.scene.json' with { type: 'json' }

const DT = file.prefabs.engine.dt
const here = new URL('./', import.meta.url).href
// The player plugin listens on the page, and node has none.
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}
// Node decodes no picture for render2d or the ui (a texture, a sheet's pages, a map's images, a
// font's pages, anything `for: "ui"`): a stand-in that writes down each url.
const asked: string[] = []
const picture = new PIXI.Texture({ source: new PIXI.TextureSource({ width: 64, height: 64 }) })
vi.spyOn(PIXI.Assets, 'load').mockImplementation((async (url: string) => { asked.push(url); return picture }) as any)
// The page's canvases stood in for, so no renderer is made and everything is still placed.
const surface = () => ({ addEventListener() {}, removeEventListener() {}, style: {} as any, width: 960, height: 540, remove() {} })
const mount = (me: Client) => { for (const s of [me.plugins.render3d ?? me.plugins.render2d, me.plugins.ui]) if (s) s.canvas = surface() }

test('<what it draws, in a sentence>', async () => {
  const truth = boot(structuredClone(file) as Scene, sim)
  const room = (await load(truth, here)).get('<scene>')!
  const page = view(link(loopback(accept(manager(truth)))), file as Scene, here, mount)
  const frames = async (k: number) => { for (let i = 0; i < k; i++) { truth.step(DT); await page.frame() } }
  await frames(3)
  // read page.client!.plugins.render2d, and the rows off room.rows
})
```

The stand-in is needed by every page test of a 2D scene in node that decodes a picture: a
texture's, a sheet's pages, a tilemap's images, a bitmap font's pages, and every `for: "ui"` entry
in any scene, since each goes through the PixiJS `Assets.load` of render2d or the ui.

It checks the url asked for, once, against the literal path,
`expect(asked).toEqual([encodeURI('/games/<game>/assets/<file>')])`, or that every url asked
for starts with `/`. Compared with the catalogue entry's own url it would pass with the slash
missing, since the url asked for is that url, encoded. It checks the sprite draws nothing before
the texture lands: the stand-in can wait on a promise the test resolves. After that, the sprite's
texture is the loader's (`toBe` the stand-in), its size is the definition's, and the stand-in's
size differs from the drawn size so the check means something. Its anchor is the definition's,
its position where the row stands, and it follows the row as the row moves. When the row ends,
`room.end(row)` then a frame or two, the sprite is destroyed and the texture is not. For
`player.client.ts`, a second seat joins the same truth with `connection(manager(truth), () => {})`,
and the page draws a sprite for both `player` rows while it binds keys for its own row alone. (Two
pages on one truth in one node process share each row's module, so one page is read.)

A kind a plugin draws has its rule's test, `<kind>.sim.test.ts`. It shows the frame moves on by
the durations the sheet gives, every number read from the sheet file, and goes round again. In the
same file, a page reads the plugin's layer, `render2d.layer(name).children`: the frame's box is the
frame the row names, the anchor is the pivot, and a `nearest` sheet's page has `scaleMode`
`'nearest'`. A scene that is `suspend: true` steps only with somebody in it, so a rule test seats one
first, `connection(manager(truth), () => {})`.

Once the tests pass, break the drawing on purpose and see them fail: leave the texture unassigned,
size the sprite with `setSize`, take the leading `/` off the entry's url, which the literal path
check fails on. Run `yarn tsc`, which checks the game's files.

Then play it: `yarn dev`, and open `http://localhost:5173/games/<game>/index.html`. The
picture is drawn where its row says, at its size, sharp where it should be, and a clip plays at its
pace. A blank page is a preloaded file a rule reads that failed, so the scene never booted: the
page's `load` rejects with `loader <name>: …`, which the browser's console shows. Art missing on a
running page is a picture, model or font that failed: the console's `loader <name>: …` says which
entry and why, in the loader's own words.

## Questions never asked

- Can this actor or plugin fetch or decode the file itself, just this once? No: an entry in the
  catalogue, through `plugins.loader`.
- Can the url, or an import of the file, go in the code? No: the url is the catalogue's, and the
  code reads the entry's name off a definition, a table or a row.
- Can the HUD draw the texture the game decoded? No: a second entry, `"for": "ui"`.
- The loader has no type for this file. Can it be fetched beside the loader? No: the type is added
  to the loader.
- Can a row say whether the picture has landed? No: the page asks the loader.
- Can the catalogue go on a row or a prefab? No: `world.loader`.
- Can a `.gltf` with its files beside it go in? No: one `.glb`.
- Should the engine load files? No.
- Do you want the full version? Always.

Ask the person making the game what the art should be and how it should move. That is content, and
it is theirs.
