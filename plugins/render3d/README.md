# render3d

The 3D renderer: the three.js scene, the camera and how the frame is drawn. Tone mapping, exposure,
shadows, background, GTAO ambient occlusion, bloom, post-processing passes before and after tone
mapping, shader splices every material gets, a pixel ratio that can drop to chunky pixels, an
overlay scene for things a hand's width from the eye, drawing between steps with teleports, one
camera driver at a time, and reports of what was drawn.

## Why use it

Every 3D game uses render3d. Actors and plugins add meshes to its scene; it moves everything between
the last two steps each frame so motion is smooth at any frame rate, and gives every look plugin
(sky, terrain, sea, cel shading, many lights) one place to splice into every material and one
composer to draw through.

## How it works

render3d has no row and no server half. Its numbers are the scene's `render3d` prefab, read on the
first tick:

- `camera`: `{ fov, near, far, at, look }`, a PerspectiveCamera of the canvas's shape.
- `pixelRatio`: a cap on the screen's devicePixelRatio.
- `tone`: `neutral` or `none`, and `exposure`.
- `shadows`: `soft`, `hard` or `none`.
- `background`: the clear colour.
- `ao`: `{ on, radius, thickness, falloff, scale, intensity, samples }`, three's GTAOPass. With it the
  renderer draws reversed depth, so normals rebuilt from far depth are not noise; the scene is still
  drawn once a frame.
- `bloom`: `{ strength, radius, threshold }`, three's UnrealBloomPass on the frame's light before tone
  mapping.

With no `ao`, `bloom` or pass there is no composer and the scene draws straight to the canvas;
otherwise the frame is drawn into half-float targets and three's OutputPass tone maps it at the end.

**Materials.** `splice(key, splice)` registers a shader splice for every dressed material, once per
key; `dress(material, { surface })` hands a material every splice and its own surface through one
`onBeforeCompile`. A splice is `{ uniforms?, vertex?: { chunk: glsl }, fragment?: { chunk: glsl } }`:
each glsl goes right after `#include <chunk>` (`?chunk` where only some shaders have it). Every dressed
program has `vDressWorld`, the fragment's world position, instancing and batching counted.

**Passes.** `pass(key, pass)` draws through a postprocessing Pass after the AO and before the overlay,
bloom and tone mapping, handed the scene's depth; `finish(key, pass)` draws after tone mapping, on the
screen's sRGB colours (a palette, a dither). `ratio(r, 'blocks' | 'smooth')` draws `r` pixels per
canvas pixel; `ratio()` goes back.

**The overlay.** `overlay` is `{ scene, camera }`, drawn over the world with depth cleared, its camera
following the main one with its own `near` and `far`: a cockpit, a held weapon, a tool.

**Between steps.** Each frame every object of the scene and the overlay, and the camera, is put
between where the last two steps left it, and put back once drawn. An object with
`userData.teleport` true is drawn where it is set for that step (a respawn, a door to elsewhere, a car
put back on the road).

**The camera.** `claim(owner)`, `release(owner)`, `claimed()`: whoever places the camera claims it.

**Reports.** `project(point)` → `{ x, y, behind }` on the canvas. `drew(f)` hands `f` every frame where
the camera and each drawn mesh stand (by `userData.row` where tagged). `drifted(f)` hands `f` each
object that moved on a frame with no step, which is how a testbed finds what judders.

It hands out `THREE`, `scene`, `overlay`, `canvas`, `camera`, `renderer`, `GLTFLoader`,
`SkeletonUtils` and `composer` (read where it is used; it is made again when a pass joins). One per
client; `close` disposes the composer, the renderer and its context and takes the canvas off.

## Using it

1. List `render3d` in `plugins` after the plugins that place things in their `afterTick` (anim,
   ik3d, particle3d, ocean3d, environment3d, …) and before the cameras that need its camera made
   (chasecamera3d, cutscene). Give the scene a `render3d` prefab.
2. In a kind's `<kind>.client.ts`, add meshes to `plugins.render3d.scene` with `plugins.render3d.THREE`,
   and hand every material to `plugins.render3d.dress(material)` so the sky, wet and snow reach it.

## Plugins it works with

Every 3D plugin draws through it: **anim**, **box3d**, **box3dvehicle**, **cel3d** (splice and pass),
**chasecamera3d** and **cutscene** (the camera), **cull3d**, **dismember3d**, **dither3d** (finish
and ratio), **environment3d**, **flight3d**, **ik3d**, **lights3d** (splice), **ocean3d**,
**particle3d**, **ragdoll3d**, **scatter3d**, **skydome3d**, **solids**, **sprite3d**, **terrain3d**,
**volley3d**. The **loader** decodes textures and models through it, and **audio** listens from its
camera.

## Keywords

3D rendering, renderer, three.js, WebGL, scene, camera, perspective, tone mapping, neutral, exposure,
shadows, shadow map, PCF, ambient occlusion, AO, GTAO, SSAO, bloom, glow, HDR, post-processing,
EffectComposer, pass, shader splice, onBeforeCompile, material patching, pixel ratio, low resolution,
overlay, first-person weapon, viewmodel, cockpit, interpolation, smooth motion, between steps,
teleport, camera claim, project, world to screen, judder, drift, `dress`, `splice`, `pass`, `finish`,
`ratio`, `claim`, `project`, `drew`, `drifted`, `render3d` prefab
