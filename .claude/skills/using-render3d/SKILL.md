---
name: using-render3d
description: Use in core, or any clone of it, whenever render3d comes up - the 3D renderer every 3D game draws through - its prefab (`camera`, `pixelRatio`, `tone`, `exposure`, `shadows`, `background`, `ao`, `bloom`, `ssr`), materials handed to `dress` and the splices every dressed material gets (`splice`, `?chunk`, what goes last), effect passes before the tone mapping (`pass`) and finish passes after it (`finish`), the overlay for a cockpit or a held tool, `ratio` for chunky pixels, drawing between steps and `userData.teleport`, the camera's one driver (`claim`), `project`, `drew` and `drifted`, screen-space reflections (`ssr`) and live mirrors (`userData.mirror`). Also when a thing judders, slides on a teleport, wiggles or spins the long way, a reflection is black or missing, a mirror shows nothing or the wrong mirror's picture, a splice lands in the wrong place or throws that a chunk is missing, a material is not reached by the sky or the lights, or the frame is slow.
---

# Using render3d

render3d (`plugins/render3d/`) is the three.js scene, the camera and how every frame is drawn. Its
header is the whole of it; this skill is what to reach for, and what was found out the hard way.

## The prefab

The scene's `render3d` prefab, read on the first tick, the page's alone (no row):

| field | what |
|---|---|
| `camera` | `{ fov, near, far, at, look }`, a PerspectiveCamera of the canvas's shape |
| `pixelRatio` | a cap on the screen's devicePixelRatio; a Retina screen is 4× the pixels |
| `tone`, `exposure` | `neutral` or `none` (never ACES), and the exposure |
| `shadows` | `soft`, `hard` or `none` |
| `background` | the clear colour |
| `ao` | `{ on, radius, thickness, falloff, scale, intensity, samples }`, GTAO; reverses the depth buffer |
| `bloom` | `{ strength, radius, threshold }`, on the light before the tone mapping |
| `ssr` | `{ steps, distance, thickness, roughness }`, screen-space reflections (below), read every frame |

With no `ao`, `bloom`, `ssr`, pass or finish there is no composer and the scene draws straight to
the canvas. With any, the frame goes through half-float targets and three's OutputPass tone maps it.

## Materials: `dress` and splices

Every material a look makes goes through `plugins.render3d.dress(material, { surface? })`. A dressed
material's shader is edited in three's `onBeforeCompile`: each splice's glsl goes right after
`#include <chunk>`, `?chunk` only where the shader has it (`lights_fragment_begin` is in Lambert,
Phong, standard, physical and toon; never basic). That is how the sky, the wet, the snow, lights3d's
lamps and the reflections reach every material with no change to the material. An undressed material
gets none of it.

The order inside a shader: `vDressWorld` (the fragment's world position, instancing counted), the
material's own `surface`, every plugin's `splice` in the order registered, then render3d's own (the
screen-space reflections), then a mirror's. So a splice of render3d's own lands on top of every
plugin's: SSR replaces the reflection lights3d's probes put in only where it finds something.

A splice's `uniforms` are handed to every program as they are: the plugin writes `value` once a
frame and every dressed material follows. A hand-written `ShaderMaterial` that does not include
three's chunks is not reached; supershader3d is three's physical material patched, and is.

## Passes, finish passes, the overlay, ratio

- `pass(key, pass)`: an effect after the AO and before the overlay, bloom and tone mapping, handed the
  depth the scene was drawn with (`effect.depth`, reversed under `ao`). lights3d's fog is one.
- `finish(key, pass)`: after the tone mapping, on the screen's sRGB colours (a palette, a dither).
- `overlay`: `{ scene, camera }`, drawn over the world with the depth cleared, its camera following
  the main one with its own `near`/`far`: a cockpit, a held weapon. A menu of 3D things the pointer
  and keys select is ui3d's, which places them in the overlay (`plugins/ui3d/README.md`).
- `ratio(r, 'blocks' | 'smooth')`: draw `r` pixels a canvas pixel, live; `ratio()` goes back.

The composer's order: scene, AO, every pass, the history (with `ssr`), overlay, bloom, tone mapping,
every finish.

## Smooth: between steps, teleports, turns

render3d draws every object and the camera between where the last two steps left them, then puts
each back (`guide-to-smooth-gameplay`). So:

- A look writes its object from its row as the row is, every frame. Never ease, lerp or extrapolate
  on top.
- A thing a look moves on its own (a sweeping lamp, a drifting light, a spinning prop) moves by the
  steps' clock, the moment drawn: `(plugins.wire.n − 1 + plugins.wire.between) × dt`. Never
  `performance.now()`: it runs long and short between frames that do and don't take a step, and on a
  display faster than 60 Hz it shakes. demo_lights3d and demo_render3d both did this and it was very
  visible.
- Every turn is set as a whole quaternion (`quaternion.setFromAxisAngle`, `setFromEuler`). Never
  `.rotation`, anywhere, even once at setup.
- A jump (a door, a respawn) raises `userData.teleport` on the frame it moves the object, off a count
  on the row, and lowers it on a later frame.
- What hangs off a drawn object and is moved on the GPU (fabric3d's cloth pinned to a bone, hair3d's
  locks rooted on a skin) is moved from the scene's `onBeforeRender`, the moment the scene is first
  drawn in a frame: only there does every bone stand where the frame draws it. In an `afterTick` the
  bones stand where the last step left them, not where the frame draws them, and what is moved there is
  out of step with the body it hangs on. Each keeps whatever was hooked there before it and calls it
  (`using-fabric3d`, `using-hair3d`).

`drifted(f)` names each object the moment it drops out of the blend; `drew(f)` hands every frame
where the camera and each mesh are drawn; `project(p)` is a world point on the canvas.

## Reflections

Three ways to reflect, from cheapest to most exact:

| | what | cost | sees |
|---|---|---|---|
| lights3d's probes (`using-lights3d`) | the scene captured round a point into a cube, box-projected | once, or a face a frame with `refresh` | everything, a snapshot or a round late |
| `ssr` | each shiny pixel traces its reflected ray through the last frame's picture and depth | one pass over the frame's shiny pixels | only what is on screen; falls back to the probe |
| a mirror (`userData.mirror`) | the scene drawn from the camera reflected in a flat mesh's plane, every frame | one more draw of the scene a mirror a frame | everything in front of the mirror, exact, live |

**`ssr`.** A pass after the scene's effects keeps the frame for the next one: its colour (with mips,
to blur a rough surface's reflection), each pixel's distance from the camera, and the camera. In every
standard or physical shader, last of all splices, a surface smoother than `roughness` walks its
reflected ray `distance` metres in `steps` steps, puts each step through the last frame's camera,
and where it first passes behind that frame's depth by less than `thickness`, halved back to the edge,
takes the last frame's colour there in place of the reflection it had. Faded at the frame's edge, at
the ray's end, and as roughness nears `roughness`. Done inside the surface's own shader, not as a pass
over the frame, because a frame keeps no roughness or metalness: a pass would mirror the walls as much
as the floor. Lambert, Phong and toon take no reflections (three's indirect specular is standard and
physical only).

**Mirrors.** A flat mesh whose face is its local +z (a PlaneGeometry; a floor turned −90° about x)
with `userData.mirror = { resolution }`. Each frame render3d reflects the camera in the mesh's plane as
three's Reflector does, clips everything behind the plane with a renderer clipping plane (which works
with reversed depth, where Reflector's oblique near plane does not), hides the mirror, and draws the
scene into a picture `resolution` of the frame with mips. The mesh's material, dressed if it was not,
reads that picture as its whole reflection, blurred by its roughness; its colour, metalness and
roughness work on it as on any light. A metal of roughness 0 is a looking glass; a polished
dielectric reflects more as the eye grazes it. A mirror in another mirror shows that one's picture as
the last frame left it. `resolution` is read every frame.

## Mistakes that were made, and why

| What happened | Why | Now |
|---|---|---|
| A cube camera's faces got no lamp light from lights3d | three's `CubeCamera` draws through a field of view of −90°, and a light's range of cells came out reversed | lights3d takes the least and most of the sphere's corners whatever the sign |
| A cube camera's six faces all landed in face 0 | a plugin drawing its own target inside the scene's `onBeforeRender` put the target back with `setRenderTarget(was)`, losing the cube face and mip level | `setRenderTarget(was, getActiveCubeFace(), getActiveMipmapLevel())` everywhere a target is put back |
| Two mirrors would show one picture | a mirror's picture rides on its material's uniforms | each mirror has a material of its own; sharing one throws, naming both |
| Moving things shook on a 120 Hz screen | the looks moved them by `performance.now()` | the steps' clock, the moment drawn |
| A spinning box wobbled | `rotation.set(...)` each frame | `quaternion.setFromEuler` |
| SSR edges and the fog speckle | each pixel's ray starts at a jittered offset, and nothing averages it | the fog blends each frame into the last few (lights3d's `fog.blend`); SSR's edges still to do, issue #64 |

## Where to try it

`games/demo_render3d/`: `main`, a room of mirrors (a mirror floor, a looking glass, a rough mirror,
glowing things circling); `glossy`, a polished yard of pillars and glowing movers under `ssr`. Its
`dev.html` tunes the exposure, each mirror's resolution and material, the floor, each light, and the
`ssr` numbers live, and `?ssr=0` takes them out to compare. `games/demo_lights3d`'s gallery is the
probes.

Related: `writing-the-look` (every look plugin), `guide-to-smooth-gameplay`, `using-lights3d`,
`benchmarking-a-game` (how fast it draws, the only measure).
