---
name: using-lights3d
description: Use in core, or any clone of it, whenever lights3d comes up - many point and spot lights in a render3d scene (clustered Forward+ shading), area lights (`world.lights3d.areas`: three's `RectAreaLight`, a panel or screen that shines a picture, `userData.picture`; and glowing materials lighting the scene, supershader3d's glowmap through `mods.glow`, a glowing rune, slime, lava or kit thing that casts light by being drawn), lights that cast shadows (its still and moving shadow atlases, `world.lights3d.shadows`, `castShadow`, `userData.moving` on what a plugin moves), lit fog and light shafts (`world.lights3d.fog`), reflection probes and local reflections (`world.lights3d.probes`, `capture()`), particle3d's `lamp` layer (a light carried by an effect: a torch, a lantern, a searchlight), solids' hung lights, and what all of it costs. Also when a scene "flips out" or hitches as a lamp turns on, a shader fails with "texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)", lights do not light something, shadows are missing or stripe, a moving thing's shadow stays behind where it first stood, the fog is blotchy or slow, reflections are black or dark, a scene with lights runs slowly, or whenever someone asks how many lights or shadows a scene can have.
---

# Using lights3d

lights3d (`plugins/lights3d/`) lights every point and spot light of a render3d scene from per-pixel
lists instead of three's own loop over every light, so a scene may hold as many as it likes; with
`shadows` it draws every shadow into tiles of one texture, with `fog` it lights the air, and with
`probes` it gives surfaces local reflections. The plugin's header and README say every number; this
skill is what was found out building and measuring it, so nobody finds it out again.

## Why three alone falls over

- **Every light is in every lit shader.** three loops over every visible light for every pixel of
  every lit material, and the count of lights is written into the shader. Turning a light on or off
  (`visible`, or a light added or taken away) changes the count, and three compiles every lit shader
  again: the hitch when a lamp turns on.
- **Every shadow is a texture.** A shadowed point light is a cube shadow map, a spot one map, each a
  texture slot; a shader has 16. A room of 18 shadowed lamps does not draw at all in three: the
  shader fails with `FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)`
  and everything but the unlit bulbs goes black. demo_lights3d's "lit by lights3d" box, unticked,
  shows it.
- **A light of strength 0 still costs.** Only `visible = false` takes a light out of three's loop, and
  that changes the count. Under lights3d a light switched by `intensity` costs nothing to switch, and
  a light switched by `visible` rebuilds nothing either, since its lights live in textures.

## How it reaches every material without changing them

render3d `dress`es a material: its shader text is edited in three's `onBeforeCompile` before it is
compiled (a splice). lights3d's splice goes in right after `#include <lights_fragment_begin>` and
hands each light of the pixel's cell to the shader's own `RE_Direct`, so any of three's lit materials
(Lambert, Phong, standard, physical, toon) that went through `dress` is lit with no change of its own.
A hand-written `ShaderMaterial` that does not include three's lighting chunks is not reached: read it
before saying lights3d lights it (supershader3d has not been checked).

Each light is taken off three's loop by turning its layers off (`taken`); anything that reads the
lights off the scene still finds them.

## The lights it takes

| Light | lights3d |
|---|---|
| `PointLight` | yes, with or without a shadow (with `shadows`) |
| `SpotLight` | yes, its cone three's own (`angle`, `penumbra`); its `map` (a projected picture) is not drawn |
| `DirectionalLight` (the sun: skydome3d, environment3d) | no, three's own, with its shadow |
| `HemisphereLight`, `AmbientLight` | no, three's own |
| `RectAreaLight` | with `areas`: yes, lit by LTC, shining `userData.picture` where it has one, a shadow tile with `castShadow`; without, three's own |
| a glowing material of supershader3d's | with `areas.glow` and `mods.glow`: yes, each thing's glowing material one light |

Without `world.lights3d.shadows`, a light with `castShadow` is left to three, as it was before
lights3d had shadows.

## Area lights

`areas: { size, levels, blur, cutoff, angle, near, glow? }` (the plugin's header and README say each, and
`lights3d.areas.ts` how). What was found building them, in `games/demo_lights3d`'s `panel` and `glow` scenes:

- **A rectangle is three's `RectAreaLight`**: `color` × `intensity` its face's light, `width` × `height`, shining
  along its own −z. A panel facing +z needs its light turned half round to shine out of it; the picture is then the
  right way round on both.
- **A picture is any texture.** A canvas or video lights the room as it plays: it is blurred again into its layers
  the frame its `version` changes. A canvas drawn from a loader picture is upside down against it (the loader's
  bitmap was turned over as decoded); the canvas texture is uploaded turned over as three does a picture.
- **A flat area light lights nothing in its own plane.** A slime pool lying in the floor meets the floor edge on:
  raise its light, or let the glowing thing's own shape stand proud of what it lies on.
- **A rectangle's reach comes from its light**: past where it gives less than `cutoff`, it is in no cell, and it
  fades to nothing at that reach. A brighter or bigger panel reaches further and costs more pixels.
- **Its shadow is drawn from its middle**, one tile, read as a lamp's is. A panel that is moved keeps the still shadow
  it was first drawn with, as any light does.
- **A glowing person.** Tag every vertex of a body with a glowing look's `lookId` (and its own `lookInfo` row) and
  draw it in supershader3d's material: the glowmap's pass draws it posed, as three skins it, and the room is lit from
  its glow. demo_lights3d's glow scene has a woman in `spirit_glow` dancing beside a man in chrome.
- **In the fog** a rectangle is a small light at its middle with its shadow. The fog is not lit by the glow. The
  shadow's biases need raising for the wide tile (the panel scene uses 0.06 and 0.12).
- **What glows lights by being drawn.** A kit thing in a glowing material needs nothing placed: bake it, draw it
  through supershader3d, give supershader3d a `glowmap: { resolution, cells }` and lights3d `areas.glow: { gain }`
  and `mods.glow`. The pass draws the scene again at `resolution` of the frame, sums each glowing pixel's glow × the
  surface it covers into `cells`, and every lit pixel takes each cell as a small light at its place facing its way.
  Only what the camera sees glows: something behind a wall or off the screen lights nothing. `gain` scales it (the
  glow scene shows it at 8).
- **The look is read with its screen derivatives nought** in the pass: a rune's strokes finer than the pass's pixels
  faded to nothing otherwise, a quarter of the glow lost.

### Texture slots

A shader has 16. Each plugin that splices a lit material adds to every lit program: lights3d 7 (lights, cells,
list, both atlases and their tiles), with `areas` 3 more (pictures, LTC tables, glowmap), with `probes` 1 more;
supershader3d's own 2 or more (`lookPictures`, `lookSettings`, and `csNoise`, `cbRand`, `csCourses` as its looks
need). An area-light plugin of a game's own, before it moved into lights3d, took 8 and pushed a supershader3d
program to 17: `FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)`. Count before adding
a sampler.

Where lights come from: any actor or plugin adding them to render3d's scene; particle3d's `light` on
each particle of a layer and its `lamp` layer (below); solids' lights hung on a model's nodes;
box3dvehicle's lamps.

## Shadows: the still atlas and the moving atlas

`shadows: { atlas, tile, bias, normalBias, budget }`. Each of the two atlases is `atlas` texels
square cut into `tile` squares (4096 and 256 is 256 tiles); a spot takes one tile, a point light six,
the same tiles in both. Tiles go to the shadowed lights whose reach is in view, nearest first, while
they last; a light past them is lit without its shadow. Every mesh that should cast needs
`castShadow = true`, as in three: a bulb drawn at the light (a `MeshBasicMaterial` ball) must not, or
it shadows its own light.

- **The still atlas**: what never moves. A light's still tiles are drawn once, when it is first given
  them, and kept: nothing that moves after, the light or a caster, draws them again. A town of torches
  draws its town into each torch's tiles once and only reads them after. `budget` is the most still
  tiles drawn a frame. A light that moves (one carried in a hand) keeps the still shadow it was first
  drawn with.
- **The moving atlas**: what moves. A mesh is moving when the plugin that moves or poses it sets
  `userData.moving = true`: anim on every body and every prop it holds, crowd3d on its crowds,
  fabric3d on every fabric, hair3d on every patch of strands, grass3d on its blades. A game's
  own plugin that moves a mesh sets it the same way. Every frame, each face of a light whose view holds
  a moving mesh is cleared and drawn from the moving meshes alone, so a redraw costs a few bodies, never
  the town. A mesh drawn wherever it is (`frustumCulled` false: crowd3d's, fabric3d's fabrics, hair3d's
  strands) is in every face of every light. A fabric and a patch of hair carry their own depth and
  distance materials, so their shadows are drawn where the GPU has moved them, and grass3d's chunks
  cast only within each grass's `shadow` metres of the camera.
- A surface, and the fog, is lit by what gets past both.

`plugins.lights3d.redrawn` is the still tiles drawn the last frame, `moving` the moving ones and
`owed` the still ones waiting on the budget: read them on the dev page's readout.

`bias` and `normalBias` (metres) stop a surface shadowing itself in stripes; each light's own
`shadow.bias` and `shadow.normalBias` are added. demo_lights3d uses 0.03 and 0.04; demo_particle3d
0.05 and 0.06.

## Fog: lit air

`fog: { density, colour, steps, g, far, resolution, blend, noise?, height? }`, a pass render3d draws the frame through. Each
pixel's ray is walked in `steps` steps; at each the fog takes `density` of the light a metre and gives
back `colour` (its own faint light) and every lamp of that step's cell, its shadow included, thrown
on toward the eye by `g` (0.35 is a good start). A spot shows its beam, each lamp a halo, and a
shadow carries into the air. The walk is drawn at `resolution` of the frame's width and height and
laid over it.

- Every fog number is read every frame: tune them live. demo_lights3d's `dev.html` has a fog folder
  with all six and "copy fog JSON".
- **Blotchy fog**, and dots right by a lamp, is the walk's per-pixel jitter on a coarse grid stretched
  up. `blend` fixes it: each frame's jitter moves on by the golden ratio and the walk is averaged over
  the frames before (`blend` 0.1 keeps a tenth of each new frame), read where each pixel stood last
  frame and held within what this frame's nine nearest texels show, so the camera can move and a lamp
  can move without trails. More `steps` and a higher `resolution` also help, at a cost (below).
  Summing each step's fall off exactly along its stretch of ray (an arctangent) was tried for the dots
  and looked worse.
- **Fog like soup** is fog of one thickness everywhere. `noise: { size, layers, strength, wind }`
  swings it by a 64³ noise that repeats seamlessly, baked once on the page (`fogNoise`), read a few
  times a step at sizes halving and drifting faster on the wind turned further round, so it churns;
  `height: { floor, thinning }` lays it on the ground. demo_lights3d's `mist` scene: size 16, 3
  layers, strength 1, floor 0.6, thinning 1.8. Summed octaves of noise crowd round their middle and
  barely clump: the bake stretches the noise to 0..1 and the shader widens the layers' average again
  before the clumps are cut. Its time is the steps' clock, set on the fog by lights3d each tick.
- **Bulbs dark in the fog**: the fog dims everything behind it, a plain white bulb included, so its
  own halo outshines it. Draw the bulb brighter than white: its `MeshBasicMaterial` colour times 6
  (demo_lights3d's `lamps.glow`).
- The fog dims the sky too: `far` is how far a ray that meets nothing is walked.

## Reflection probes

`probes: { size, intensity, near, far, places: [{ at, box }] }`. Each probe captures the scene round
its `at` into a cube of `size` texels a face, lit by every lamp with its shadow, prefiltered as three
prefilters an envMap (its PMREM), and packed with the others into one texture array, so any number of
probes is one texture. Every standard or physical surface inside a probe's `box` takes its reflection
and the light round it; the reflection is projected onto the box, so a floor shows the wall where the
wall stands. Make the box the room's walls. A surface in more than one box takes the smallest's, in
none the nearest's.

- Probes are captured on the second frame and after `plugins.lights3d.capture()`; `captures` counts
  them. Things that move after (a light carried round, a ball rolling) are not in the reflection until
  `capture()` is called again.
- Reflections show on what is shiny: a polished floor (roughness 0.1 to 0.2), metal (`metalness` 1,
  roughness under 0.1). A dim room reflects dimly: light its walls, not only its air, or the
  reflections read black beside the fog's halos.
- Lambert, Phong and toon take no reflections: three's indirect specular is standard and physical
  only.
- Live reflections are render3d's: `ssr` on its prefab traces what is on screen and falls back to the
  probes where a ray leaves it, and a mesh with `userData.mirror` is an exact mirror drawn each frame
  (render3d's header, Reflections; `games/demo_render3d`).

## particle3d's lamp

A layer `{ "lamp": { intensity, distance, decay, at?, tint?, shadow?, flicker?, spot? } }` in an
effect is one light at the effect's point, made when the effect starts and gone when it ends, riding
with it. `at` is metres off the point times the effect's `scale`, not turned with anything; `tint` an
sRGB number, else the spawn's tint, else white; `shadow` casts from the atlas; `flicker` from 0 to 1
dims it between full and `1 - flicker` of it, never brighter; `spot: { angle, penumbra }` is a spot
along the effect's `dir`, straight down without one, `angle` from its middle to its edge (above 0, at
most π/2). A layer is `{ lamp }` alone. An effect of lamps alone shines for its `life`; one of life 0
shines while its particles fly. Without lights3d in the scene no lamp is drawn. A torch is one effect:
a flickering shadowed lamp and its flames. demo_particle3d's keys 9 and 0 are a torch and a
searchlight; the particle workshop has "Add a lamp".

## What costs what

| What | What costs time | It grows with | Cheap when |
|---|---|---|---|
| Plain lights (no shadow) | Each pixel loops over the lights in its cell | Lights overlapping the same spot | Lights have a small reach (`distance`) |
| Still shadows | Each light's still tiles hold a drawing of what never moves, drawn once when it takes them | Lights newly given tiles (`redrawn`) | The same lights stay in view |
| Moving shadows | Each face of a light whose view holds a moving thing is drawn again every frame, from the moving things alone | Faces holding moving things (`moving`); a crowd, drawn wherever its people are, is in every face of every light | Few shadowed lights near what moves |
| Point light against spot | A point light's shadow is 6 tiles, a spot's 1 | Point lights with shadows | Spots where a cone will do |
| Shadow taps on surfaces | 9 reads of each atlas a lit pixel a shadowed light | Shadowed lights overlapping a spot | Few shadowed lights overlap |
| The second atlas | As many texels as the first: 4096 square of half floats is 32 MB | `atlas` squared | A smaller `atlas` |
| Fog `steps` | Each step loops over that spot's lights, one shadow read each | Steps × lights there | Fewer steps (noisier) |
| Fog `resolution` | The walk runs on that share of the frame's width and height | Its square: 0.5 is a quarter of the pixels | Lower (blotchier) |
| Fog `far` and `density` | A ray stops once the fog hides what is behind it | Thin fog and a long `far` walk further | Thicker fog stops sooner |
| Reflection probes | One capture of six views at load and after `capture()`, nothing after | `size` and the probes, at capture only | Captured once |
| A rectangle | Each pixel in its reach evaluates it by LTC twice, reading its picture twice where it has one | Rectangles overlapping a spot | A higher `cutoff` |
| A picture that changes | Its `levels` layers blurred again that frame | Pictures changing each frame | Still pictures |
| What glows | The scene drawn again at the glowmap's `resolution`; each lit pixel loops over every cell | Cells, and that second draw's pixels | Few cells, a low `resolution` |
| The frame's size | Surface light, the fog and the output pass all work a pixel | Pixels: a Retina screen has 4× | — |

None of the area lights' rows has been measured yet: the page they were built on was drawn behind other windows.

The cost a pixel is the lights in its own cell, never all of them: a lamp across the town costs a
pixel nothing unless its reach covers that pixel's cell. Give every light the smallest `distance`
that looks right.

Measure with `benchmarking-a-game` (`bench.mjs`), never the page's own counter in a tab behind other
windows. Read a GPU row where taking one thing away jumps the page to 60 as "the frame is a few
milliseconds over 16.7", not as that thing costing everything: the screen shows frames in steps of
16.7 ms, so an 18 ms frame shows at 30 a second. demo_lights3d's room (19 shadowed lights, fog,
a probe, 1280×720) measured 33 a second with every tile drawn each frame and the fog at 48 steps and
0.5; 59 with tiles kept and the fog at 32 and 0.4.

## Mistakes that were made, and why

| What happened | Why | Now |
|---|---|---|
| Probe reflections came out 20 to 30 times too dark | three's `CubeCamera` draws its faces through a field of view of -90°, which turns the projection's scale negative, and lights3d's light-to-cell range came out reversed, so no light reached any cell of a cube face | The range is the least and most of the light's sphere's corners whatever the sign; a test draws through a -90° camera |
| A cube camera's faces drawn while shadows were drawn all landed in face 0 | `renderer.setRenderTarget(was)` after drawing the atlas forgets the cube face and mip level the frame was drawing into | Every target put back is `setRenderTarget(was, face, level)` from `getActiveCubeFace()` and `getActiveMipmapLevel()` |
| 8 frames a second in a room of 19 shadowed lights | Every light's every tile was drawn every frame (84 scene draws), and the fog walked every pixel 64 steps with 9 shadow reads a lamp a step | Tiles kept and drawn again only when something there moved; the fog at a share of the frame, one shadow read a step |
| demo_world3d's town at night ran at 15 frames a second with one torch and the light the player carries | The player's skinned body stood in the torch's reach, so both lights' 12 tiles were drawn again every frame, and each drew the whole town, one mesh, again: 25 ms of GPU a frame. A 1024 atlas instead of 4096 changed nothing | Two atlases: what never moves drawn once into the still one, what anim and crowd3d mark moving drawn each frame into the moving one; no tile draws the town again |
| A probe at the room's middle captured nothing but the bulbs | The probe stood inside a box; then the -90° camera above | A probe's `at` in open air |
| Reading a probe's picture said nothing changed after `capture()` | The test tab behind other windows draws no frames, so nothing was captured until a frame was drawn | A screenshot makes the tab draw; read after it |
| A `const` in a page `eval` threw "already declared" | The page's console keeps top-level names between evals | Wrap a page eval in `(() => { ... })()` |
| The fog's bulbs read as dark dots | The fog dims what is behind it, and a white bulb is only 1 | Bulbs brighter than white |
| A supershader3d program failed to compile once area lights were added | lights3d's 7 samplers, an area plugin's 8 and supershader3d's 2 came to 17 of 16 | The area lights in lights3d, three samplers: the glowmap one texture, the LTC tables side by side in one, a mesh's matrix in the glowmap's own pass |
| The glowmap held a quarter of the runes' glow | the look faded detail finer than a pixel of the quarter-size pass, and a rune's strokes are | The pass reads the look with its screen derivatives nought |
| A panel's light shone a picture played through a canvas upside down | a canvas drawn from the loader's turned-over bitmap holds it the right way up again | The canvas texture uploaded turned over, as three does a picture |
| A page's frame counter read 1 a second in every scene | the test tab was behind other windows; `requestAnimationFrame` was called 0 times a second | Read the frame rate with `benchmarking-a-game`, never a covered tab's counter |

## Where to try it

`games/demo_lights3d/`: a room of 12 coloured wall lamps, 6 sweeping overhead spots, a lamp weaving
between boxes and spheres, an orbiting ball, polished floor and metal balls, every light shadowed, lit
fog and one probe. Its `dev.html` has the comparison with three (`?three=1`), the fog folder, and a
readout of lights, shadowed lights, tiles, still and moving tiles drawn this frame and cells. Its `panel` scene has
four rectangles shining a picture, two playing it, one shadowed, with a panels folder to move them; its `glow`
scene a pro-ng rune pillar (baked by `assets/demo_lights3d.bake.ts`) whose runes light the room, and two dancers,
one glowing, with the glow's gain and pass resolution and a toggle for each thing on the panel. `games/demo_particle3d/`'s
torch and searchlight are lamps. `games/demo_world3d/`'s town has wall torches, a light in the
player's hand and a crowd; its `dev.html` `lights` folder sets how many torches and people
(`?torches=`, `?people=`), the atlas and tile (`?atlas=`, `?tile=`), the fog (`?fog=1`), the torch's
shadow (`?torchshadow=0`), lights3d itself (`?lights3d=0`), the torch lamp's numbers, the carried
light, the exposure and the castle drawn flat, and its readout shows the still and moving tiles drawn
each frame.
