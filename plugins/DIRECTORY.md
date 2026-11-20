# Plugins

| Plugin | What it does |
| --- | --- |
| anim | Skeletal animation for rigged 3D characters: clips picked from how the row moves, crossfades, gestures, aim, props on bones. |
| audio | Sound effects, ambient loops, music and per-row loops, in 3D or panned in 2D. |
| audiodaw | A DAW-style song sequencer on Tone.js: instruments, effects, tracks, clips and offline render. |
| box2d | 2D rigid-body physics (Box2D v3, WebAssembly), the same on server and page. |
| box3d | 3D rigid-body physics (Box3D, WebAssembly), the same on server and page. |
| box3dvehicle | Driveable cars on box3d: wheels, suspension, engines and gearboxes, drawn with smoke, dust and tracks. |
| cel3d | Toon shading: banded light, hued shadows, one highlight, rim light and ink outlines. |
| chasecamera3d | A third-person camera orbiting one row. |
| chat | Text chat on zone, global, party and whisper channels, with a chat box. |
| clouds3d | The cloud deck, cirrus, god rays and cloud shadows, drawn into skydome3d's dome. |
| cover3d | Finds the places near a body where a solid hides it from a threat, for AI. |
| crowd3d | Crowds of Mixamo bodies, one draw call per material, posed on the GPU along courses that cost nothing on the wire. |
| cull3d | Frustum and shadow culling, level of detail and sorting for instanced meshes. |
| cutscene | In-engine cutscenes from a cue file: shots, a cast, lines, fades, sound and skip. |
| dismember3d | Limbs shot off Mixamo bodies, falling as physics pieces, with crawling and gore. |
| dither3d | A PlayStation look: low resolution, too few colours, ordered dither. |
| environment3d | The sun, sky light, ambient light and flat floor of a simple 3D scene. |
| fabric3d | Fabric moved on the GPU: flags, capes, ribbons, banners, cloths and the garment shop's garments baked on a game's bodies, pinned to bones, props and shapes, draped on shapes and bodies, blown by the wind. |
| flight3d | Fixed-wing flight: forces, stalls, engines, control surfaces, landing gear and crashes. |
| gpgpu3d | The things of a scene held on the GPU, the land, the shapes, the bodies and the cars, with the GLSL that tells any shader where a line meets one and how far a point is to move clear of one: what particles bounce off, fabric drapes on, hair lies on and grass is pressed by; and the ops a sheet lists, noise, folds, remaps and the clock, compiled to GLSL for any plugin's shader. |
| gpuparticle3d | particle3d with every particle on the GPU: the same effects files, moved, sorted and drawn there. |
| grass3d | A meadow made blade by blade on the GPU round the camera: thins out with distance, sways in the wind, bends from cars and bodies and lies down in their tracks; a program of ops sets where it grows tall, short or dry. |
| grid | A changing 2D map of cell layers in chunks, drawn on render2d, with picking and save as PNG. |
| hair3d | Hair, fur and manes grown on a body's skin: locks rooted where the scene says, simulated on the GPU so they hang, swing and blow as the body moves, drawn strand by strand. |
| hitscan3d | Instant shots in 3D with lag compensation, line of sight and hurt. |
| ik3d | Two-bone IK on the page: hands and feet put on grips, wheels, pedals and rungs. |
| instances3d | Draws many copies of a look as instanced meshes, handed to it by other plugins. |
| interact | A body doing a scripted thing with a machine: getting in a car, mounting a seat. |
| item3d | Kit items pro-ng baked, drawn in supershader3d's looks: lying loose as rows, or held by the bodies anim, motion3d and crowd3d draw. |
| kinematics3d | Where a moving body goes along its target's ways, and gravity. |
| light2d | Darkness over a render2d world and the lights that cut through it. |
| lights3d | Clustered (Forward+) point and spot lights, as many as a scene likes, every shadow from a still atlas drawn once and a moving atlas drawn each frame, lit fog and reflection probes. |
| loader | Every file a game uses: the asset catalogue, fetched and decoded once, preloaded, reloaded live. |
| local | Actors that live only on this page, with no row and nothing on the wire. |
| lod3d | Forests, clumps and stones placed round the camera by level of detail, the same everywhere. |
| mapgen | Procedural levels from a recipe and a seed: rooms, caves, stairs, actors and autotiled walls. |
| math | Deterministic sin, cos, exp, pow and the rest, the same double on every machine. |
| melee3d | Swords swung by animation clips, and what each swing meets. |
| motion3d | How a rigged body moves or is held while it animates: walking, climbing, sitting, driving. |
| nav | Grid pathfinding: A*, distance fields and line of sight. |
| nav3d | Routes over a baked graph of places and ways made from shapes3d's shapes. |
| npc3d | NPCs that see, hear, remember, choose and act, on a walker or crowd3d body. |
| ocean3d | A deterministic FFT ocean, with floating on the exact waves every seat draws. |
| pancamera | An RTS or city-builder camera over render2d: edge pan, keys, zoom steps, minimap jumps. |
| particle2d | 2D particle effects on render2d. |
| particle3d | 3D particle effects on render3d, including particles that carry point lights and lamp layers of point or spot lights. |
| party | Player parties across scenes: invite, kick, promote, member frames. |
| persist | The rule side of saving: which kinds are kept as records, and loading them back. |
| player | The seat's input (keys, mouse, gamepads, rebinding) and its taking hold of other rows. |
| playtester | A seat that plays itself: a bot that presses through the player plugin. |
| ragdoll3d | Ragdolls for Mixamo bodies: limp, thrown, falling and settling, the same on every seat. |
| render2d | The 2D renderer on PixiJS: camera, projections, layers, zoom and pixel scaling. |
| render3d | The 3D renderer on three.js: camera, tone mapping, shadows, AO, bloom, screen-space reflections, mirrors, passes and splices. |
| renderdom | HTML drawn over or as the game, scaled with the canvas, and a kit of hardware-style controls. |
| roomcamera | A room-by-room 2D camera that scrolls from one room to the next. |
| scenemanager | The scene table and the act that moves a seat to another scene. |
| shapes3d | Shapes standing in the world that block, are stood on, hide, are baked round and are drawn. |
| shipped | Loads the plugins a game keeps in its own folder. |
| skydome3d | The sky: day clock, sun and moon, weathers, lightning, the dome, its lights and fog. |
| solids | Low-poly models written as data from convex solids, with paints and lights. |
| sprite2d | Rows drawn as sprites on render2d, eight-way, depth-sorted, with shadows. |
| sprite3d | Rows drawn as camera-facing sprites in 3D, as Doom draws its monsters. |
| stats | three.js's stats panel: frames a second, milliseconds a frame, heap. |
| store | The page's own values the server never reads: volume, keys, settings. |
| supershader3d | One shader for every surface of a scene, from the bake's looks file, in at most three draws. |
| synthaudio | Music as notes on Tone.js, changed on the bar line, and played live by keys. |
| terrain3d | Endless deterministic terrain from one field file: noise, sea, painted layers, textures and rings. |
| tilemap | Tiled maps as levels: drawn, changed and asked for collision. |
| ui | The HUD and menus: panels, buttons, bars, nameplates, modals and focus. |
| ui3d | Things in 3D over the game in render3d's overlay, placed in the camera's frame, selected and pressed by the pointer and keys. |
| vision | Fog of war over a render2d map, the page's half of team vision. |
| volley2d | Bullet patterns computed from their volley, for hundreds of bullets at no cost. |
| volley3d | Rockets, shells, grenades and missiles that fly, hit, splash and can be shot down. |
| walker | A kinematic 3D character controller: walk, jump, fall, step, slide and seek. |
| weather3d | The rain, snow, dust, splashes and wet surfaces, under skydome3d. |
| world3d | A place pro-ng baked, drawn and played, its files handed to shapes3d, nav3d, supershader3d and lod3d, and its people spawned on npc3d's loiter and transfer. |
