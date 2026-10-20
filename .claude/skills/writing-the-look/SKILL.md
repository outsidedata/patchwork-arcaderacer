---
name: writing-the-look
description: Use in core, or any clone of it, when working on how a game looks. That covers choosing render2d or render3d, switching a scene to 3D, drawing a kind in its `<kind>.client.ts` (a mesh, a box, a PIXI graphic), turning, spinning or rotating a mesh, and the sky, sun, lights, shadows, fog, weather and rain (`skydome3d`, `environment3d`). It covers the ground's colours and detail (`terrain3d`'s field), the sea (`ocean3d`), trees and rocks on the land (`scatter3d`), particles (`particle3d`, `particle2d`), and darkness and torches in 2D (`light2d`). It covers the camera, background, shadows, bloom, AO and exposure that render3d takes from the scene, and a look setting only the page keeps, such as brightness (the store). Also use it when one look plugin needs another's knowledge (the sky's light on the sea, the land under the rain or under scatter) through `world.<p>.mods`. And use it when a thing judders, flips or spins the long way, the sky draws black, nothing draws, a thing casts no shadow or stays dry in the rain, or a plugin throws that it is listed in the wrong order.
---

# Writing the look

How a game looks is data in its scene file and drawing in two places: the `<kind>.client.ts` of
each kind it draws, and the look plugins its scene lists. Every number of the look (a colour, a
size, a light's power, a camera's far plane, a fog's density) is in the scene file or in a data
file the scene's loader catalogue names. No number is in code. The engine is frozen, and nothing
here edits it, a plugin or an addon. When the look needs what no plugin does, that plugin is
changed or a new one is built, in its home (`building-a-plugin`), and then used here.

## When it applies

It applies to what a seat sees in the game's canvas: the renderer, the camera's settings as the
look needs them, light, sky, weather, ground colour, sea, particles, and how each kind is drawn.
Something else applies instead to:

- how a camera moves (a follow, a chase, an orbit, a shake, smoothing): `tuning-feel`.
- the art files themselves (sprite sheets, glTF models, textures) and putting them in the loader
  catalogue: `bringing-in-art`, and `making-game-assets` for making them.
- the shape of the land, a level's layout, a Tiled map, where scatter grows: `building-a-level`.
  The ground's colours and detail are here.
- a kind's rule and where its values go: `designing-a-kind`.
- the HUD and menus on the `ui` canvas: `building-the-hud`.
- sound: `sound`.
- a new look plugin, or a change to one: `building-a-plugin`.
- judging a 3D result from screenshots: `verifying-3d-visuals`.

## Where the look's numbers go

- A plugin's fixed numbers belong in `world.<plugin>`, and a plugin with no row has no prefab (the
  prime directive). render2d, light2d, skydome3d, terrain3d, ocean3d, scatter3d, sprite2d,
  sprite3d, particle3d and particle2d read `world.<p>`. render3d and environment3d are old code that
  breaks this: render3d reads
  `plugins.wire.scene.prefabs.render3d` once, on its first tick (`plugins/render3d/render3d.plugin.ts`),
  environment3d reads `prefabs.environment3d` (`plugins/environment3d/environment3d.plugin.ts`), and
  skydome3d reads `prefabs.render3d` for render3d's tone and AO (`plugins/skydome3d/skydome3d.plugin.ts`).
  Their numbers belong in `world.render3d` and `world.environment3d`. So the job that uses render3d
  or environment3d moves their numbers there first, in one change, through `building-a-plugin`. The
  move touches those three reads, `plugins.wire.scene.prefabs.render3d as Prefab | undefined` in
  `plugins/render3d/render3d.plugin.ts`, `plugins.wire.scene.prefabs.environment3d` in
  `plugins/environment3d/environment3d.plugin.ts` and `plugins.wire.scene.prefabs.render3d ?? {}` in
  `plugins/skydome3d/skydome3d.plugin.ts` (found with `grep -nE 'prefabs\.(render3d|environment3d)'`
  on those files), and the headers beside them; both plugins' extensions, `plugins/render3d/render3d.extension.tsx`
  and `plugins/environment3d/environment3d.extension.tsx`, which type the prefab's fields, and their
  tests; every other test that gives either prefab, found with `grep -rlnE
  '"?(render3d|environment3d)"?: \{' plugins addons editor extensions`; every scene of every game in
  `games/` that writes them; and the lines of the skills that name the prefabs. Then the scene gives
  `world.render3d` and `world.environment3d`. A camera written under `world.render3d` before that
  move is read by nothing, and the scene draws nothing, so the move comes first. The store reads
  `prefabs.store` too, for its keys' starting values (`plugins/store/store.plugin.ts`); their home is
  `world.store`, and the job that uses the store moves them first (`building-the-hud`, step 9).
- A plugin's table, `world.<p>`. No packet carries it. A child scene's `world` and `prefabs` are
  the manager's with its own over them, key by key (`addons/scenemanager/scenemanager.addon.ts`).
  So a sky or a render3d table every scene of the game shares is written once, in
  `<game>.scene.json`.
- Anything big: a data file in `assets/`, an entry of `world.loader.assets` of type `json` with
  `preload`, named by the plugin's table. Examples are skydome3d's weathers, terrain3d's field and
  particle3d's effects.
- How a kind looks: its definition in `assets/<game>.json`, read by its look with
  `def(plugins.wire, row.kind)` (`plugins/loader/loader.sim.ts`). What changes while the game runs
  (a heading, a clip, a light turned down) is a field of its row.
- A look setting the page alone keeps (brightness, a colour-blind palette, weather drawn or not):
  a key of the store (below).

The editor writes these same values. render3d's and environment3d's extensions type their prefab's
fields, and skydome3d's Sky panel writes `world.skydome3d`'s look, precip and shadow and the weathers
file, one value at a time (`plugins/skydome3d/skydome3d.extension.tsx`). A look is tuned in the file
or in the panel, never in code.

## render2d or render3d

A scene lists one renderer in `plugins`. Every page mounts a canvas the size of the scene's
`engine` prefab for `render3d ?? render2d`, and one for `ui` over it, so the page is the same in
every game. Which renderer a scene names decides:

- render2d (`plugins/render2d/render2d.plugin.ts`) draws a PixiJS stage. With no `world.render2d`,
  a kind draws on `stage` in the canvas's pixels, as the game `yarn new-game` writes does. With
  `world.render2d` (`ground`, `up`, `zoom`, `look`, `layers`, `fit`, `background`), things stand in
  a world of their own. A point is [x, y] on the ground or [x, y, h], a kind draws on
  `render2d.layer(name)` at `render2d.place(pos)`, and the camera is `look` and `zoom`. Every size
  a kind's definition gives is then in the world's units, a tilemap's cells, as its speed and its
  `pos` are, and its look draws it scaled by `render2d.ground()`, asked in its `tick`: a radius of
  `r` on an orthogonal ground `[[w, 0], [0, h]]` is drawn `r · w` stage pixels along x and `r · h`
  along y. A size in pixels on a definition is tied to the tile size and is wrong the day `ground`
  changes, so it is never written (`building-a-level`, step 4). This holds under every
  `world.render2d`, with no tilemap as with one, an identity ground `[[1, 0], [0, 1]]` included, and
  a scene that gives `world.render2d` only to have layers is under it too: `place` and `ground()`
  read its `ground` all the same. A kind's header and a look's say units, never pixels. Under an
  identity ground the scaling multiplies by 1, so a look that skips it draws right there and wrong
  the day the ground changes; its test proves the scaling on a scene file of its own with a ground
  other than identity (How it is proven).
- render3d draws a three.js scene through a perspective camera. A point is [x, y, z] in metres, y
  up. A kind adds to `render3d.scene`.

The editor's placer follows the renderer: [x, y, h] under render2d and a world point [x, y, z]
under render3d (`plugins/render2d/render2d.extension.tsx`, `plugins/render3d/render3d.extension.tsx`).

Switching a scene of the generated game to 3D, in order:

1. `<scene>.scene.json`: `render3d` in place of `render2d` in `plugins`, and `world.render3d`, its
   numbers moved there first (above), with `camera { fov, near, far, at, look }`, `shadows`,
   `pixelRatio`, and `tone` and `exposure` as the look wants them. Under skydome3d render3d's
   `exposure` is written over every frame, by `look.exposure·(1 + nightOpen·night)`, so the sky's
   `look.exposure` is the exposure there.
2. The light and the sky: `skydome3d`, or `environment3d` for fixed lights and a flat floor. The
   ground: `terrain3d`, or environment3d's `floor`. Each is set up as "The scene's light, sky,
   ground and the rest" says.
3. Every `pos` that meant canvas pixels now means metres. Change the start actors' `pos` to
   [x, y, z], the definitions' speeds and sizes to metres, and the rules that move a thing to the
   new axes. The generated game moves its seat's thing on a `body` row its `player` row spawns; that
   is the editor's template, on hold, and never the model. The `body` is folded into the `player`
   row first, its fields onto the `player` prefab, its rule into `player.sim.ts`, its look into
   `player.client.ts`, and `body` taken out of the sim, the scene and the test
   (`designing-a-seat`), since a page running the scene ahead draws only the seat's own `player` row
   on the frame after the key. Then the `player` row's `tick`, which moves `pos[0]` and `pos[1]` and
   writes a pos of two numbers, is rewritten to `[pos[0] + x·step, pos[1], pos[2] + y·step]`, so the
   stick's y runs along z and the up arrow walks away from a camera looking down −z. A thing that
   stands on the land has its rule set `pos[1]` with `heightAt(w, x, z)` from
   `plugins/terrain3d/terrain3d.sim.ts`.
4. Every kind's `.client.ts` redrawn against render3d (next section), `player.client.ts` among them:
   it draws the thing for every seat's `player` row, and moves the camera and binds keys only for the
   row that is `mine`.
5. The tests beside each changed file, and the game's `<game>.sim.test.ts`, changed to the new
   meaning and run (How it is proven).

## A kind's look

`games/<game>/<kind>.client.ts` exports `setup(row, plugins)`, `tick(row, plugins)` and
`remove(plugins)`. The page imports it once per row of each client, as
`<kind>.client.ts?row=<id>&client=<c>` (`engine/browser.ts`), so a variable at the top of the file
holds that row's drawing alone, never another seat's in the same tab. It is
set in `setup`. A kind with no `.client.ts` is not drawn by itself.

It draws through the plugins the scene lists and builds nothing a plugin builds. A thing drawn
from a sprite sheet is a kind listed in `world.sprite2d.kinds` or `world.sprite3d.kinds`. A rigged
model with clips is listed in `world.anim.kinds`. A still model of low-poly solids is listed in
`world.solids.kinds` (`plugins/solids/solids.plugin.ts`). An effect is a particle3d or particle2d
effect.
Such a kind needs no `.client.ts` for that drawing. What no plugin draws, a kind draws itself:

```ts
// player.client.ts: a seat's thing, a box of its definition's `size` and `colour`, its bottom on the
// row's `pos`, drawn for every seat's `player` row (its keys and camera, for the row that is `mine`,
// are `input-and-seats`' and `tuning-feel`'s).
import type * as THREE from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { def } from '#plugins/loader/loader.sim.ts'

let box: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>
let lift: number

export function setup(row: Row, plugins: Plugins) {
  const { size, colour } = def(plugins.wire, row.kind)
  const three = plugins.render3d.THREE as typeof THREE
  box = new three.Mesh(new three.BoxGeometry(size, size, size), plugins.render3d.dress(new three.MeshStandardMaterial({ color: colour })))
  box.castShadow = true
  box.receiveShadow = true
  lift = size / 2
  plugins.render3d.scene.add(box)
  tick(row)
}

export function tick(row: Row) {
  box.position.set(row.data.pos[0], row.data.pos[1] + lift, row.data.pos[2])
}

export function remove(plugins: Plugins) {
  plugins.render3d.scene.remove(box)
  box.geometry.dispose()
  box.material.dispose()
}
```

- THREE is render3d's (`plugins.render3d.THREE`), as the generated 2D look takes PIXI from
  `plugins.render2d.PIXI`.
- Every material goes through `render3d.dress`. A look plugin reaches a material through a splice
  only when the material is dressed. skydome3d's splice darkens wet surfaces, lays snow on up
  faces and casts the clouds' shadow, so an undressed thing stays dry and sunlit in a storm.
  anim dresses every material of a model the same way (`plugins/anim/anim.plugin.ts`).
- Shadows take three things: render3d's `shadows` on, a light that casts (skydome3d's key light,
  environment3d's `sun.shadow`), and `castShadow` and `receiveShadow` on each mesh.
- Every number comes off the definition or the row. `size / 2` is arithmetic on the definition,
  not a number of its own.
- A turn is set whole, as a quaternion: `mesh.quaternion.setFromAxisAngle(up, row.data.turn)` for a
  turn about one axis, `quaternion.fromArray` for a row that carries one. Never one Euler angle
  alone (`mesh.rotation.y = turn`). After every draw render3d puts each object back by writing its
  quaternion (Between steps, `render3d.plugin.ts`), and three works the Euler angles out again from
  it: past 90° of y it gives x = π, y = π − turn, z = π. The next `rotation.y =` keeps that x and z,
  a mirrored orientation, and the blend between it and the true one turns the long way round every
  frame. A turning cube did exactly that, and three hours went on the engine before one measurement
  found it.
- `remove` takes off and disposes what `setup` made. The page runs it when the row ends and when the
  client closes.
- On the first packet, `setup` runs before any plugin has ticked. render3d has no camera yet,
  render2d's `place`, `project` and `camera` throw (they read the table its first tick reads), and
  the store has no values yet. A look asks for them in `tick`. render3d's `scene`, `THREE` and
  `dress`, and `render2d.layer(name)`, are there from the start.

## The scene's light, sky, ground and the rest

Each plugin's header is the whole of it. A look plugin with a row (skydome3d, ocean3d, particle3d,
particle2d) has its kind in the scene's sim, imported from its `.sim.ts`, a prefab, and one
`actors` entry. An actor whose kind the sim leaves out throws `no code for kind <kind>` at boot,
and one with no prefab throws `no prefab for <kind>` (`engine/engine.ts`). What a scene sets for
each:

- `environment3d` (`plugins/environment3d/environment3d.plugin.ts`): `world.environment3d`, its
  numbers moved there first (Where the look's numbers go), with `sun { at, color, power, shadow? }`, `sky { color, ground, power }` (a hemisphere light, not a
  drawn sky), `ambient`, `lights` and `floor { size, color }`. It has fixed lights and a flat floor,
  read once. Its floor is a `MeshLambertMaterial` that is not dressed and does not take shadows, so
  nothing casts a shadow on it, and under skydome3d it stays dry in the rain. A floor that needs
  either is terrain3d, or a change to environment3d made in its home (`building-a-plugin`).
- `skydome3d` (`plugins/skydome3d/skydome3d.plugin.ts`, `skydome3d.sim.ts`): "the one sky". It
  draws the dome, the sun and moon, clouds, stars, a key light with its shadow box, a hemisphere
  light, the fog, the scene's environment map, the weather on dressed surfaces, rain, snow, dust
  and lightning. It brings its own lights, so a scene with it needs no environment3d for light. It
  is a row: the scene's sim lists `skydome3d` from `#plugins/skydome3d/skydome3d.sim.ts`, the scene
  has one `{ "is": "skydome3d" }` actor, and the prefab holds every field of the row, `t`, `rate`,
  `doy`, `lat`, `phase`, `to`, `from` and `mix` (each a whole Weather), `blend`, `fade`, `wet`,
  `pack`, `windDeg`, `flash`, `strike` and `drift`. `world.skydome3d` holds `day`, `weathers` (a
  catalogue `json` entry with `preload`, a table of Weathers by name), `soak`, `dry`, `lay`, `melt`,
  `gusts` and `bolt`, and the browser's `look`, `precip` and `shadow`. It writes render3d's exposure
  every frame, `look.exposure·(1 + nightOpen·night)`. A game changes the weather or the hour
  through its closed acts (`weather`, `time`, `rate`, `moon`, `place`), which a rule forwards with
  `w.call`. A weather that thunders rolls the die, so its scene has a `world.seed`.
- `terrain3d` (`plugins/terrain3d/terrain3d.plugin.ts`, `terrain3d.sim.ts`): the ground, as rings
  that follow the camera. It has no row. `world.terrain3d` holds `field` (a catalogue `json` entry
  with `preload`), `rings`, `shadowReach`, `budget`, `seabed` and `static`. The field file's
  `program` and `layers` are the land's shape (`building-a-level`). Its look is `bands` (colours,
  each mixed in by rules over the land record's keys, `relief`, `slope`, `aspect` and the rest),
  `grain`, `detail` layers (`tint`, `patch`, `bump`, `rough`, and `texture` over the catalogue's
  `texture` entries), and the colours of the `surfaces` the brush paints. A change to the bands'
  colours, amounts and edges, the surfaces' colours, covers and edges, or the detail but for its
  record rules, rebuilds the material and no ring. Every ring takes shadows, and a ring within `shadowReach`
  casts them. The whole of it is `using-terrain3d`.
- `ocean3d` (`plugins/ocean3d/ocean3d.plugin.ts`, `ocean3d.sim.ts`): the sea. It is a row whose
  prefab is `t` and nothing else, `{ "t": 0 }`, the sim lists `ocean3d` from
  `#plugins/ocean3d/ocean3d.sim.ts`, and the rest is `world.ocean3d`. It is lit by a `light` mod or
  else by the fixed `world.ocean3d.light`, and throws with neither.
- `scatter3d` (`plugins/scatter3d/scatter3d.plugin.ts`): trees, grass and boulders around the
  camera. It draws nothing until a `land` mod hands it a ground.
- `particle3d` and `particle2d`: a ledger row (prefab `{ "next": 1, "live": [] }`, the sim listing
  `particle3d` or `particle2d` from its `.sim.ts`, one actor) and `world.particle3d` or
  `world.particle2d`, `{ effects, hold }`, with `effects` a catalogue entry of the effects file. A rule spawns an effect with `emit(w, effect, at, spawn)` from
  `particle3d.sim.ts` or `particle2d.sim.ts`, and a page with the browser half's own `emit`. A
  particle with `gain` above 1 is brighter than white and blooms under render3d's `bloom`.
- render3d's own look: `shadows`, `background`, `ao`, `bloom`, `pixelRatio`, and `tone` and
  `exposure`. A plugin adds to every frame through `splice` and `dress`, `pass` for an effect pass
  on the light before the tone mapping, `finish` for a pass on the screen's colours after it,
  `ratio` to draw at another resolution live, shown as hard blocks or smoothed, and `overlay` for a
  cockpit or a held tool (its header).
- `dither3d` (`plugins/dither3d/dither3d.plugin.ts`): the PlayStation's look, a 4×4 ordered dither
  over colour cut to `bits` a channel, drawn at `ratio` as hard blocks. `world.dither3d` is
  `{ on, bits, matrix, ratio }`; it hands render3d nothing until it is first on, and `on`, `bits`
  and `ratio` are set live on `plugins.dither3d`.
- `cull3d` (`plugins/cull3d/cull3d.plugin.ts`): what render3d's scene holds many copies of, drawn
  only where the camera sees it. Three culls an InstancedMesh whole, so a city's lots or a forest's
  trees standing all round the camera are drawn whole, behind it too, and far ones shaded under near
  ones. A look or a plugin hands cull3d its copies, `crowd({ matrices, colours?, levels })`, each level
  `{ meshes, within }`, and cull3d writes the meshes' instances as the scene is drawn: each copy in
  the view of the camera drawn through (or, at a level that casts, in a shadow's view), at the level
  its distance picks, nearest first. A mesh all round the course, a ground or a road, is cut into
  tiles three culls one by one with `split(geometry)`. `world.cull3d` is `{ cell, tile }`, metres.
- `light2d` (`plugins/light2d/light2d.plugin.ts`): darkness over render2d's world and the lights
  that cut it. `world.light2d` holds `layer`, `ambient`, `kinds`, `budget`, `falloff` and
  `flicker`. A row of a listed kind gives its kind's light, and carries its own `light` field only
  for what changes. Its layer is the last of `world.render2d.layers`. An actor sets another ambient
  for the next draw with `plugins.light2d.ambient(a)` in its `tick`.
- render2d's own look: `world.render2d.background`. In an actor's `tick`, `background(colour)`,
  `parallax(name, fx, fy)` and `mosaic(size, names)`.
- `cover3d` draws nothing: it answers a rule's question of where a mover can hide.

## The order the scene lists them in

On the page, every plugin's `tick` runs, then every actor's `tick`, then every plugin's
`afterTick` (`engine/browser.ts`). render3d and render2d draw in their own `afterTick`. A plugin that
places what it draws by the camera in its `afterTick` is listed before the renderer. A plugin that
reads another's work of the same frame is listed after that one.

- These throw when listed after their renderer: particle3d, sprite3d and anim after render3d;
  particle2d and light2d after render2d. A camera plugin throws when listed before its renderer
  (chasecamera3d, cutscene, pancamera).
- These say in their headers that they come before their renderer and do not check it. Before
  render3d: skydome3d, terrain3d, ocean3d, scatter3d, environment3d, solids, flight3d and
  box3dvehicle. Before render2d: sprite2d, tilemap, vision and volley2d. Listed after, each draws a
  frame behind, and nothing says so. skydome3d, terrain3d, ocean3d and scatter3d draw round last
  frame's camera. environment3d lags only with `sun.shadow`, whose box it centres on the camera.
  sprite2d, solids, flight3d, box3dvehicle and volley2d draw last frame's rows. The scene's test checks
  their order (How it is proven).
- A plugin that asks a mod `ahead` throws unless the provider is listed before it, as skydome3d
  does for terrain3d's land.
- cull3d is listed before whatever hands it a crowd or a split in its `tick` (`shipped`, for a
  game's own plugin), which throws `cull3d has not ticked yet` otherwise. An actor's look uses it
  from its `tick`, never its `setup`, which runs before any plugin has ticked.

A scene of the generated game with a sky over terrain lists
`["loader", "scenemanager", "player", "terrain3d", "skydome3d", "render3d"]`.

## Mods, as a scene names them

When one look plugin needs what another knows, the scene switches it on with one value:
`world.<p>.mods: { <function>: '<a>' }`, or a list, `['<a>', '<b>']`, for a function `p` takes from
several plugins (`addons/scenemanager`'s Mods header). The file is `plugins/<a>/<a>.<p>.ts`. Before the first
step, on the server and on the page alike, the scenemanager imports every mod a scene names, and
it throws when the file does not export the function. The mods of the look:

- `world.skydome3d.mods.land: 'terrain3d'` (`plugins/terrain3d/terrain3d.skydome3d.ts`): the rain's
  splashes stand on the land. With none named, no splash is drawn.
- `world.ocean3d.mods`: `light: 'skydome3d'` and `wind: 'skydome3d'`
  (`plugins/skydome3d/skydome3d.ocean3d.ts`) light the sea with the sky and raise it with the sky's
  wind. `land: 'terrain3d'` (`plugins/terrain3d/terrain3d.ocean3d.ts`) gives the sea its seabed;
  with none, the sea is open ocean.
- `world.scatter3d.mods`: `land: 'terrain3d'` for the browser half and `ground: 'terrain3d'` for the
  server half (`plugins/terrain3d/terrain3d.scatter3d.ts`) stand what scatter draws, and what a rule
  asks about, on the same land.

The scene's side is all of it. Name each mod in `world.<p>.mods`, list the plugin it names, and
list that plugin before `p` where `p`'s header says it reads the mod in the same phase. Swapping one
provider for another is changing that one value. A plugin never takes a field of its own table
naming the plugin it stands on, `world.<p>.ground: 'terrain3d'` then `plugins[ground]`. That is not
`world.scatter3d.mods.ground: 'terrain3d'`, which is a mod named in `mods`. A plugin never reaches
`plugins.<a>` for what `a` knows, and never reads `world.<a>`.
Each `p`'s header says what it does with no mod named. A game's own look plugin that needs a
top-level plugin's knowledge takes it through a mod beside the game's plugin,
`games/<game>/plugins/<p>/<a>.<p>.ts` (`building-a-plugin`).

## A look plugin's state

A plugin's file is imported once per page, and the page calls its exported function once per
client, which it makes each time the seat enters a scene. So everything a look plugin holds in the
browser (its meshes, lights, renderer, materials, a "built" flag) is inside that function, as
render3d holds its scene and renderer and skydome3d its dome. A value at the top of the file is made
once and read by every scene after. A look plugin takes the renderer out of `plugins` and never
imports it: the scene it builds on is the one of the client it is ticking for
(`plugins/environment3d/environment3d.plugin.ts`). Its `close` takes off and disposes what it built.
An actor's file is the other way round: it is imported once per row, so its top-level variables are
that row's.

## A look setting the page keeps: the store

A value only the page uses and the server never reads (brightness, a palette, weather drawn or
not) is a key of the store (`plugins/store/store.plugin.ts`). The scene lists `store` before
`player` (a seat bound with `control` throws `store is listed after player` otherwise,
`plugins/player/player.plugin.ts`), and `world.store` gives each key's starting value: the store
reads them off a `store` prefab today, and the job that uses the store moves them to `world.store`
first (`building-the-hud`, step 9). The game's settings actor writes the key with
`plugins.store.set`. Whatever draws reads it with `plugins.store.get` in its `tick`, not in a first
`setup`, which runs before the store's tick has filled it. The table is the page's link's, so every
scene of the page reads one table and no server is sent it. It is never a row, and never `world`.

No look plugin in core reads a store key today. A plugin that honours one names the key in its own
table, as `world.audio.volume` names the store keys audio's volume is read from
(`plugins/audio/audio.plugin.ts`). So a brightness is a change to the renderer in its home
(`building-a-plugin`), with the key named in `world.render2d`, or in render3d's table. In 2D,
`light2d.ambient` is not a brightness: it sets only the darkness between the lights, lights still
bring the world up to as drawn, a level over 1 overflows the colour's channels into one another, and
without light2d it does nothing. In 3D, skydome3d writes render3d's exposure every frame, so an actor
writing `renderer.toneMappingExposure` is written over, and a 3D brightness is a change to the plugin
that owns the exposure.

## What goes wrong

- The sky is black. skydome3d's dome is a sphere of `look.radius` metres centred on the camera, and
  it is clipped wherever its depth along the view, the radius times the cosine of the angle off the
  view's middle, passes the camera's `far`. A `far` a little under the radius clips the middle of
  the view. A `far` of half the radius clipped every pixel of a 55° field of view on a 16:9 canvas. The `far` is past the
  radius: a radius of 8000 needs a `far` over 8000.
- render3d's camera written in `world.render3d` with the move not made: it is read off
  `prefabs.render3d` today, so nothing is drawn. Or written back into `prefabs.render3d` so it draws:
  the job that uses render3d makes the move first (Where the look's numbers go).
- A plugin from the order list above listed after its renderer. Nothing throws and every frame lags
  by one. The scene's order is checked by its test.
- environment3d's floor used as the ground under a sky or a shadow. It takes neither (above).
- A kind's material not passed through `render3d.dress`: the sky's wet, snow and cloud shadow skip
  it. A mesh without `castShadow` and `receiveShadow`, or a render3d with no `shadows`: no shadow.
- `skydome3d` left out of the scene's sim, which throws when the scene boots. A weather in the
  weathers file missing one of its 13 numbers, which throws where it is read; the prefab's `from`
  and `mix` are each a whole Weather of the same 13 (`skydome3d.sim.ts`). A weathers or field file
  not in the catalogue with `preload`.
- A thing that judders, flips or turns the long way. The cause is the new look's own code until a
  measurement says otherwise: render3d's blending draws every moving thing in every game, and it
  draws them smoothly. Before reading render3d or the engine, and before changing how the thing is
  driven (page clock, row, shader), open the page and record what is drawn for that thing every
  frame with `render3d.drew(f)`, with `wire.n` beside it: its position and quaternion, and the row's
  value it came from. The frame where the drawn value leaves the row's is the bug. A single Euler
  angle set alone (A kind's look) is the first thing to look for.
- A camera or a mesh seen sliding across the level for a frame when it is put somewhere new (a
  teleport, a respawn, a door to elsewhere): its `userData.teleport` was not raised on the frame it was
  put there (`guide-to-smooth-gameplay`).
- A camera, `place` or the store read in `setup` on the first packet, before the plugins ticked.
- A colour, size or light written in a `.client.ts` or a plugin. It goes in the definition, the
  plugin's table or the prefab.
- Under a `world.render2d`, a size written on a definition in pixels, or a header that says pixels.
  It is in the world's units, drawn scaled by `render2d.ground()`, under an identity ground and a
  `world.render2d` given only for its layers as under any other.
- A look's scaling proven only under an identity ground, where leaving it out changes nothing drawn.
- A plugin given a field naming the plugin it draws over, or reading that plugin's `world`. That is
  a mod.
- A test that mounts a canvas in node: render3d makes a WebGLRenderer there, and node has no WebGL.
  A look test mounts nothing, or replaces three's WebGLRenderer as
  `plugins/chasecamera3d/chasecamera3d.plugin.test.ts` does.
- A screenshot of another agent's page. `webview.mjs` keys its tab by `WEBVIEW_TAB`, else by
  `CLAUDE_CODE_SESSION_ID`. good-webviews' own doc says that makes a tab each agent's own, but
  subagents were seen to share their parent's session id, so a coordinator's agents drove one tab,
  and a shot taken after another agent navigated it showed that agent's game. So each agent sets
  `WEBVIEW_TAB` to a name of its own and checks `location.href` before trusting a shot.

## How it is proven

The tests are node `.test.ts` files beside what they test, run with `yarn vitest run <file>`. Each
boots the game's manager as `index.html` does, makes a page on it with
`view(link(loopback(accept(manager(truth)))), file, import.meta.url, () => {})`, and steps
`truth.step(DT)` then `await page.frame()`. The mount mounts nothing, so render3d makes no renderer
and the test reads the scene graph the plugins and actors build. A scene that lists `player` sets
`globalThis.addEventListener` and `removeEventListener` to functions that do nothing, since the
player plugin listens on the page and node has none. Two more things hold in node:

- An image decoded for render3d comes back as a 1×1 white texture in node
  (`plugins/loader/loader.plugin.ts`). For render2d it goes through `PIXI.Assets.load`, which a 2D
  test that draws a sheet, an image or a tileset replaces, as with
  `vi.spyOn(PIXI.Assets, 'load').mockImplementation(async () => PIXI.Texture.WHITE)`.
- Two pages on one manager in one node process share each row's `.client.ts` module, because the
  row's id, and so the url it is imported at, is the same on both. The second page's `setup` writes
  over the first's top-level variables. A test reads a drawing off one page.

- `games/<game>/<kind>.client.test.ts`, beside each drawn kind's look. It checks what the look
  built from the row and the definition: one drawing per row on `render3d.scene` (or render2d's
  stage or layer), of the definition's size and colour from `defs`, standing on the row's `pos` every
  frame while the seat moves it, with its shadows, and dressed: `material.customProgramCacheKey()`
  holds the key of each look plugin's splice (`skydome3d`). When the row ends, and when the page's
  client closes, it is off the scene and its geometry and material are disposed. Whether it looks
  right is not asserted in node: it is seen in Chrome (below). Under a `world.render2d` the size is
  checked as the definition's units times `render2d.ground()`, on a scene file the test writes into
  a temporary folder whose ground is other than identity, `[[2, 0], [0, 3]]` say, with its
  `<scene>.sim.ts` importing the game's kinds by their absolute paths (`proving-a-game`): under an
  identity ground a look that skips the scaling passes.
- `games/<game>/<scene>.sim.test.ts`, beside `<scene>.sim.ts`, for the scene's look. It checks that
  each look plugin built what the scene says: skydome3d's `sky()` probe (the dome of `look.radius`,
  the key light casting, the hemisphere light, `scene.fog`), terrain3d's `rings` on the scene and its
  `ground.height` equal to `landOf(field).height`, and the camera at `world.render3d.camera.at`,
  looking at its `look`. It checks that the camera's `far` is past the dome's radius, and that the plugins that do
  not check their own order are listed as they must be. Each mod the scene names is checked to be the
  provider's thing, `mod(world, p, name)(plugins)`, and its effect is checked where it lands. Put the
  sky in rain by writing its row's `to`, `from`, `blend` and `fade` as the `weather` act does, and
  every splash stands at the ground's height plus `precip.lift`.
- The game's `<game>.sim.test.ts` and each kind's `<kind>.sim.test.ts`, changed when a switch to 3D
  changed what `pos` means, such as the `player` row's height read against
  `landOf(field).height(x, z)`.
- `yarn tsc`.

Then the pixels are looked at in Chrome. Run `yarn editor <game>`, or `PORT=<n> yarn editor <game>`
when 5173 is another's (`editor/server/server.ts` reads `PORT`), and open
`http://localhost:<port>/games/<game>/index.html`. To stand the camera elsewhere and look again, a
`dev.html` testbed may put the page on `window`, and the driver moves
`page.client.plugins.render3d.camera` with good-webviews' `eval`. A scene with a camera plugin
(chasecamera3d, cutscene) places the camera every frame and writes over a camera moved that way,
so the driver first takes it with `render3d.claim(owner)`, which those plugins stand aside for, and
gives it back with `render3d.release(owner)`. Screenshots are taken with
`.claude/skills/good-webviews/webview.mjs` under a `WEBVIEW_TAB` of the agent's own. A 3D look is
judged by `verifying-3d-visuals`: at least three angles, the sky and the ground and the thing up
close, each looked over for what is wrong, before saying it looks right. A page opened straight
from `games/<game>/` is reloaded after every edit before a shot is trusted.

## Questions never asked

- Can this colour or size go in the `.client.ts`? No: the definition.
- Can the sea read the sky's table, or take `sky: 'skydome3d'`? No: a mod, `world.ocean3d.mods`.
- Can brightness go on a row or `world`? No: a key of the store.
- Can a look plugin keep its meshes at the top of its file? No: inside its exported function.
- Can the look work around what a plugin lacks, in an actor or with a number in code? No: the
  plugin is changed in its home (`building-a-plugin`), tested, and then used here.
- Do you want the full version? Always.

Ask the person making the game how it should look: the time of day, the weather, the colour of
the ground. That is content, and it is theirs.
