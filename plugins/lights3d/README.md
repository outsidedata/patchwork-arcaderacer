# lights3d

Clustered forward shading (Forward+) for render3d: every point and spot light in the scene lit by
clusters, so a scene may hold as many as it likes (street lamps, windows, neon, muzzle flashes, car
lights) and each fragment is lit only by the few that reach it; with `areas`, lights that are a surface: every
rectangle of light (three's `RectAreaLight`, shining a picture where it is given one: a screen, a stained window, a
sign) and everything drawn in a glowing material of supershader3d's (a rune, slime, lava, a screen), lighting the
room by being drawn, with nothing placed by hand; and, with `shadows`, every one that
casts a shadow shadowed from two atlas textures, however many there are: a still one, drawn once, of
everything that never moves, and a moving one, drawn each frame, of what moves.

## Why use it

three.js lights a fragment by looping over every light in the scene, each a uniform of every
program, so a scene with hundreds of lamps recompiles and slows to a crawl. lights3d takes the point
lights off that loop and lights each fragment from a small per-cell list. Each of three's shadows is
a texture of its own, and a shader has 16, so three cannot draw a room of a dozen shadowed lamps at
all; lights3d draws every shadow into tiles of its atlases. Use it for a city at night, a lit interior
with many lamps, a racing track lined with lights, a dungeon of torches in 3D. Lights are added the
ordinary three.js way (a `PointLight` or `SpotLight` on the scene, `castShadow` for a shadow) and are
drawn exactly as three would draw them, with three's own falloff and spot cone.

## How it works

lights3d has no row and no server half. On its first tick it reads `world.lights3d` and hooks the
scene's `onBeforeRender` and `onAfterRender`. Each time the scene is drawn, through whatever camera
draws it:

1. Every visible `PointLight` and `SpotLight` on a layer the camera sees has its layers turned off,
   so three's own loop leaves it out. Without `shadows`, a light that casts a shadow stays three's.
   Anything that reads the lights off the scene still finds them where they stand.
2. With `shadows`, the lights that cast one and reach the view are given tiles, the same in both
   atlases, nearest the camera first, while the tiles last: a spot one, a point light six (a cube's
   faces). The scene is drawn from each light into its tiles, the distance of each surface from the
   light, as three's point shadows store it, only what has `castShadow`. A light the tiles do not
   reach is lit unshadowed.
   - **The still atlas** holds every caster not marked moving. A light's still tiles are drawn once,
     when it is new to them, and kept: nothing that moves after, the light or a caster, draws them
     again, so a light that moves keeps the still shadow it was first drawn with.
   - **The moving atlas** holds the casters marked moving, `userData.moving = true`, which the plugin
     that moves a thing sets: anim on every body it poses and every prop it holds, crowd3d on its
     crowds. Every frame, each face of a light whose view holds one is cleared and drawn from those
     alone. A caster drawn wherever it is (`frustumCulled` false, crowd3d's) is held by every face
     of every light.
3. Each light's place in view space, `distance`, colour × `intensity`, `decay`, a spot's cone and its
   tiles are written into a float texture, six texels a light, one number saying its kind (a lamp or a
   rectangle), and each tile's matrix in each atlas
   into a texture for that atlas. A moving tile with nothing drawn in it this frame is given a matrix
   of zeros, which holds no point, so it shadows nothing.
4. The frame is cut into `grid` cells across and up and `slices` along the view (each slice the same
   ratio deeper than the one before, so cells near the eye are as shallow as they are wide). Each light
   goes into every cell its sphere of reach meets (a lamp's `distance`, one of no `distance` reaching all;
   an area's as Area lights says), and each cell's run of light numbers is written into one list, with a
   texture of where each run starts.

### Area lights

With `areas`, lights that are a surface are lit too, by three's own Linearly Transformed Cosines (Heitz, Dupuy, Hill,
Neubelt, 2016), the maths three's `RectAreaLight` is lit by:

- **Rectangles.** Every `RectAreaLight` on the scene, three's loop leaving it out. Given `userData.picture` (any three
  texture: a picture, a canvas, a video), it shines that picture: the picture is blurred into `levels` layers, each
  twice as blurred as the one before, and each point reads it where it faces the light, as blurred as the light it
  takes in (sharp close to a big panel, the average far off), so a screen lights a room in its own colours and a
  smooth floor reflects it sharp. A picture whose texture changes is blurred again that frame. `castShadow` gives it
  a shadow tile, drawn from its middle the way it shines, read as a lamp's is.
- **What glows.** With `areas.glow` and `mods: { glow: 'supershader3d' }`, every material of supershader3d's that
  glows lights the scene by being drawn: a rune on an axe, a slime pool, a lava crack, a screen in a kit thing, a
  glowing body. Its glowmap (`plugins/supershader3d/supershader3d.glowmap.ts`) draws the scene again small through the
  camera, each glowing pixel's glow worked out by the material's own shader, and sums it into screen cells, each a
  small light of its power at its place facing its way, which every lit pixel takes. A skinned or moving thing is
  drawn where it is posed, so it lights from there. What glows off the screen or behind something lights nothing, and
  the glow casts no shadow.

A rectangle is clustered by the reach past which it gives less than `cutoff` and fades to nothing there. The fog takes
rectangles too, each a small light at its middle with its shadow; it is not lit by the glow.

A splice (render3d's `splice`, under `lights3d`, into the shaders that light: Lambert, Phong, standard,
physical and toon) finds a fragment's cell by its pixel and depth and hands each light of the cell to
the shader's own `RE_Direct`, as three's point and spot light loops do, before `lights_fragment_maps`
and `lights_fragment_end`, so every later splice finds it as direct light. A light with tiles is
shadowed there: the fragment, moved `normalBias` along its normal, is looked up in the tile that holds
it in each atlas, nine texels round it, and the share it is no farther than (less `bias`) is how much
light gets past; the still atlas's share times the moving atlas's is how much reaches it. The fog's
walk reads both the same way, one texel each. `onAfterRender` turns the splice off again, so the
overlay and any other scene through the same renderer is lit by its own lights alone. No texture but
the atlases has a fixed size: each grows to what the frame needs.

## Using it

1. List `lights3d` anywhere in `plugins` (render3d must be listed) and give
   `world.lights3d: { grid: [across, up], slices }`, whole numbers above 0, and for shadows
   `shadows: { atlas, tile, bias, normalBias, budget }`: each atlas `atlas` texels square cut into
   tiles `tile` texels square, the biases in metres, and `budget` the most still tiles drawn a frame
   (the rest owed to the frames after, a light never drawn first, then the nearest). For lit fog, `fog: { density, colour, steps, g, far, resolution, blend }`
   (`blend` the share of each new frame kept in a running average over the frames before, read where
   each pixel stood last frame and held to what this frame's nearby pixels show; 0.1 smooths the
   walk's noise, 1 is none; `noise: { size, layers, strength, wind }` swings its thickness by a
   baked 3D noise that repeats every `size` metres, `layers` of it each half the size and drifting
   faster on `wind` turned further round, from even (`strength` 0) to clumps and clear gaps (1); and
   `height: { floor, thinning }` keeps it full below `floor` and halves it every `thinning` metres
   above, so it lies on the ground),
   each read every frame so it can be tuned while the page runs (walked at `resolution` of the
   frame's size and laid over it):
   each pixel's ray walked in `steps` steps through air that takes `density` of the light a metre and
   gives back `colour` and the light of every lamp of each step's cell, its shadow included, thrown
   on toward the eye by `g`; a beam shows where a spot shines and a halo round each lamp. For
   reflections, `probes: { size, intensity, near, far, places: [{ at, box }] }`: the scene captured
   round each `at` into a cube `size` texels a face, lit by every lamp, prefiltered as three
   prefilters an envMap, and packed into one texture array; every standard or physical surface in a
   probe's `box` takes its reflection, projected onto the box so it stands where its wall does, and
   the light round it. The probes are captured on the second frame and after `capture()`. For area lights,
   `areas: { size, levels, blur, cutoff, angle, near, glow? }`: each picture blurred into `levels` layers `size`
   texels square and read `blur` times as blurred as the light the point takes in; `cutoff` the light past which an
   area reaches no further; a rectangle's shadow tile drawn `angle` radians from its aim, from `near` metres. For what
   glows, `glow: { gain }` (`gain` times its glow), `mods: { glow: 'supershader3d' }`, supershader3d listed before
   lights3d, and `world.supershader3d.glowmap: { resolution, cells }` (the share of the frame's width and height its
   pass is drawn at, and the cells across and up it is summed into). Every number of `areas` and of the glowmap is read
   every frame.
2. Add `PointLight`s, `SpotLight`s and, with `areas`, `RectAreaLight`s to render3d's scene from any actor or plugin, `castShadow` on
   those that cast, and on every mesh that casts. A plugin that moves a mesh, or poses it in its
   shader, sets `userData.moving = true` on it, so its shadow is drawn each frame into the moving
   atlas; a mesh left unmarked is still, and its shadow is drawn once.
3. Read `plugins.lights3d.count` (lights clustered last draw), `entries` (light-in-cell pairs),
   `cells`, `shadowed` (lights given tiles), `tiles` (tiles they took), `redrawn` (still tiles drawn
   the last frame, those of lights new to their tiles), `moving` (moving tiles drawn the last frame),
   `owed` (still tiles the budget left for later frames) and `captures` (times the probes were
   captured); call `capture()` to capture the probes again.
4. `close` gives every light its layers back, frees the textures and both atlases and gives the scene
   its hooks back.

## What it costs

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
| A rectangle | Each pixel in its reach evaluates it by LTC twice (its gloss and its matte), reading its picture twice where it has one | Rectangles overlapping a spot | A higher `cutoff` (a shorter reach) |
| A picture that changes | Its `levels` layers blurred again, two passes each, that frame | Pictures changing each frame | Still pictures, blurred once |
| What glows | The scene drawn again at the glowmap's `resolution`, and every lit pixel loops over every cell | Cells, and the pixels the second draw covers | Few cells, a low `resolution` |
| The frame's size | Surface light, the fog and the output pass all work a pixel | Pixels: a Retina screen has 4× | — |

demo_lights3d's room, 19 shadowed lights at 1280×720, was held at 33 frames a second by the shadows'
redraws and the fog's steps × resolution, each a few milliseconds over the 16.7 of a frame; with a
light's tiles kept from frame to frame and only the faces a mover is seen in drawn again, and the fog
at 32 steps and 0.4 of the frame, it drew 59 (`benchmarking-a-game`, 2026-11-08).

demo_world3d's town at night, one wall torch and the light the player carries, ran at 15 frames a
second when every shadowed light's tiles were drawn again each frame a skinned body stood in reach:
each tile drew the whole town, one mesh, again (12 tiles, 25 ms of GPU a frame). With the still
shadows drawn once and only the bodies and the crowd drawn each frame into the moving atlas, no tile
draws the town again after its first frame (2026-11-08).

## Plugins it works with

- **render3d**: its scene, its cameras and its `splice`.
- **box3dvehicle**: a car's headlights and point lights are lit here.
- **particle3d**: an effect's `lamp` layer (a point or spot light at the
  emitter, with a shadow where it says) are lit here.
- **solids**: the point and spot lights a model hangs are lit here.
- **anim** and **crowd3d**: mark what they move and pose (`userData.moving`), so its shadow is drawn
  into the moving atlas each frame.
- **supershader3d**: its glowmap, through `supershader3d.lights3d.ts`, so every glowing material it draws lights the
  scene.
- **environment3d** and **skydome3d** give the directional sun and sky light, which three lights as
  always.

## Keywords

Forward+, clustered shading, clustered forward, tiled lighting, many lights, point lights, spot
lights, shadows, shadow atlas, static shadows, baked shadows, moving shadows, dynamic shadows,
cached shadow maps, many shadows, point light shadows, volumetric fog, lit fog, light
shafts, god rays from lamps, reflection probes, box projection, parallax corrected cubemaps, local
reflections, light culling, light clusters,
froxels, street lamps, city at night, neon, performance, uniforms, shader recompilation, texture
units, area lights, rect area lights, RectAreaLight, LTC, linearly transformed cosines, textured area lights, screen
light, TV light, light from a picture, video light, emissive lighting, glowing materials, emissive surfaces as lights,
glowmap, glowing kit, three.js, render3d, splice, `world.lights3d`
