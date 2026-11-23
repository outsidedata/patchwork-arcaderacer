# Changelog

## 2026-11-23-0300dfe

- yarn bake — bakes feather pictures and reads textures and garments from the library's current layout.
- loader — the loading bar names the file still coming down.
- audiodaw — music plays in Firefox.

## 2026-11-22-471eaf5

- audiodaw — clips can loop for any length, and a song can be played as launchable scenes and slots, like Ableton's Session View.
- using-audiodaw skill — explains looping clips and the session's scenes and launching.
- loader — a loading screen can show a picture beside its bar and words.
- using-the-loader skill — explains putting a picture on a loading screen.

## 2026-11-22-d1ff3e5

- box3dvehicle — cars are drawn from the library's vehicle models, with moving suspension, steering and lit lamps, and motorcycles can be driven too.
- supershader3d — a vehicle model's suspension, steering and lamps move and light up as the car drives.
- committing-a-game skill — a game's baked car and bike models are committed like any other baked art.
- asset-workshop skill — fitting props now covers the library's vehicle models.
- making-3d-assets-in-blender skill — making a vehicle follows the library's vehicle kit.

## 2026-11-21-774a6eb

- particle3d — particles dim at night with the sky's light.
- gpuparticle3d — particles dim at night with the sky's light.
- skydome3d — gives particles the sky's light, so they brighten and dim with the time of day.
- particle workshop — the stage has a sky, with time buttons that set the hour, day, moon phase and sun and moon strength.
- tuning-particles skill — covers making particles take the sky's light.
- benchmarking-a-game skill — a scene with no player, like a title screen, can now be played in a playtest.

## 2026-11-21-30b349d

- terrain3d — a game published to GitHub Pages now loads its land without errors.
- shapes3d — a game published to GitHub Pages now loads its shapes without errors.
- yarn publish_gh_pages_game — clears the game folder's installed packages after publishing, so published games no longer fill your disk.

## 2026-11-21-d5fb580

- terrain3d — grass grows on the land in a game published as a static site.

## 2026-11-21-d0d9c3e

- hair3d — hair can be tied up into ponytails, pigtails and braids.

## 2026-11-20-97847d2

- ui3d — a new plugin: shows things in 3D over the game, such as a logo title, that move, glow and answer the pointer and keys.
- grass3d — a new plugin: a meadow over the land round the camera that sways in the wind and is trampled by what walks or drives through it.
- hair3d — a new plugin: hair, fur and manes on bodies that move with them.
- fabric3d — a new plugin: flags, capes, ribbons, banners and cloth that blow in the wind and drape on what they touch.
- gpgpu3d — a new plugin: tells shaders where the shapes and the land are, so cloth, grass and particles react to them.
- item3d — a new plugin: items that lie loose or are held and worn by bodies, with their own hair and cloth.
- puppet3d — a new plugin: bodies, animals included, move from layers of tuned cues instead of recorded clips.
- motion3d — characters blend a walk into a run by speed and start, stop and turn smoothly.
- loader — the loading screen shows at once and stays up until the land is whole.
- particle3d — particles on a ui3d thing follow whether it is selected or chosen.
- world3d — a lamp or effect can ride on a moving part of a model.
- crowd3d — people in a crowd hold items and wear hair.
- anim — bodies hold items and wear hair and cloth.
- yarn dev, yarn serve — run a game from any folder, inside the repo or not.
- yarn workshop — new workshops for grass, hair, items and puppet bodies.
- yarn bake — compressed pictures can be set to colour or linear.

## 2026-11-17-3866e37

- gpuparticle3d — a new plugin: plays particle3d's effects on the GPU, so an effect can throw far more particles.
- world3d — a new plugin: drops a whole baked place into a scene, with its looks, its shapes, its paths, its player start and the people who live and walk there.
- particle3d — effects can push particles with forces, react to what the game is doing, bounce, use meshes and flipbooks, light the world with lamps and ride along on other things.
- particle2d — 2D effects can do everything 3D effects can.
- lights3d — lights cast soft shadows cheaply, fog drifts, clumps and lies low on the ground, rectangle lights and glowing surfaces light the scene, and shiny surfaces reflect the room around them.
- render3d — shiny surfaces reflect what is on screen, and any flat mesh can be a mirror.
- supershader3d — a scene can use any number of looks, and a look can move over time.
- loader — models load faster and smoother, textures can be KTX2, and a game can show a loading screen.
- ui — a game can show a loading screen while its art arrives.
- terrain3d — the ground can have holes cut in it.
- nav3d — people can be spread across a spot instead of all walking to one point.
- npc3d — people in a world3d place go about their day between the places they belong.
- shapes3d — shapes can be turned and tilted any way, and can be made of any triangles.
- motion3d — moves read buffered input and can be cancelled, jumps carry the speed they are taken at, attacks bend onto their target, and climbers follow a leaning shape.
- kinematics3d — a kind sets how much of its running speed a jump carries.
- box3dvehicle — vehicles can have their own wheel and hub models, and their smoke, sparks and skids follow the engine, the speed and the slide.
- anim — a game caps how large each kind of a character's textures may be.
- lod3d — trees and rocks thin out by the camera's height as well as its distance.
- yarn workshop — the particle workshop opens on any effects file and comes with explosions, a waterfall, flipbooks and more.
- yarn particle-views — a new command: takes pictures of particle effects from the cameras you list.
- yarn particle-costs — a new command: measures what every part of a particle effect costs.
- yarn particle-score — a new command: judges a particle effect against the design rules.
- yarn bake — a game's bake can bake its effects' flipbooks and its looks.
- yarn serve — a game's server no longer restarts for files outside the repo, and says which file restarted it.
- yarn health — checks the tools a KTX2 bake needs.
- stations.py — a new script: renders a model in Blender from listed camera spots, one picture each.
- layoutviewer — a new tool: views and checks an animal's bones and muscles.
- using-lights3d skill — a new skill: lighting a 3D scene with lamps, shadows, fog and probes.
- using-render3d skill — a new skill: getting the most out of the 3D renderer, reflections and mirrors included.
- using-supershader3d skill — a new skill: drawing a baked place or model with its own looks.
- using-the-loader skill — a new skill: loading a game's art, moving its bake to KTX2 and adding a loading screen.
- tuning-particles skill — covers forces, flipbooks and building a burst.
- using-the-dev-page skill — shows how to cap the frame rate to judge motion.

## 2026-11-06-b6183dd

- supershader3d — any material can read the extra numbers its model carries on each vertex, not only a wall's.
- yarn workshop — a new command: opens the asset, UI or particle workshop for a game, or the pose lab.

## 2026-11-04-d3098a9

- lod3d — a new plugin: fills a landscape with thousands of trees, grass, rocks and anything else, round the camera, solid to walk, shoot and drive against.
- instances3d — a new plugin: draws many copies of the same thing in one go, from a forest to a pile of crates.
- supershader3d — a new plugin: gives every surface of a scene the library's materials through one shader.
- scatter3d — removed; lod3d takes its place.
- scripts/scatter3d-to-lod3d.ts — moves a game's scenes from scatter3d to lod3d.
- box3dvehicle — cars can have independent suspension, and there is a UTV to drive.
- shapes3d — static shapes can come from files as well as the scene.
- solids — draws shapes from files too, and paints any solid with a library material.
- terrain3d — a ground layer can be painted with a library material.
- nav3d — routes are found many times faster.
- asset workshop — plays a model's own animation clips.
- yarn bake — bakes the library materials a scene uses into the game.
- yarn publish_gh_pages_game — a published game's repo now holds the whole game, including files added later.
- connecting-plugins-using-mods skill — explains how plugins hand each other their work, and checks whether a plugin does it that way.

## 2026-11-01-6c4ac40

- yarn dev — serves every game, with a home page linking each game's pages and scenes.
- yarn serve — runs a game's server beside its pages and restarts it on every change.
- yarn new-game — a new game comes with a dev page and a frame-rate counter.
- benchmarkPage — a page to look at and compare a game's benchmark runs.
- crowd3d — a new plugin: hundreds of animated people walking, standing and holding things, cheap to draw.
- npc3d — a new plugin: characters that see, hear, remember and choose what to do.
- nav3d — a new plugin: pathfinding over a map of the level, across any kind of connection.
- shapes3d — a new plugin: floors, walls, ramps, paths and moving platforms that bodies stand on, walk and collide with.
- kinematics3d — a new plugin: moves a body over the ground, along paths and onto whatever it stands on.
- motion3d — a new plugin: a character plays its animations in place against ledges, walls, seats and anything else in the world.
- melee3d — characters can fight with swords.
- anim — characters hold poses, and a clip can be nudged into place as it is baked.
- walker — big crowds walk cheaply and steer round trees and other fixed things.
- terrain3d — characters find their way across the land.
- scatter3d — boulders and other scattered models sit partly buried, each a little different.
- box3d — shapes stand in the physics world as solid floors, walls and ramps.
- solids — faces can be painted with a picture.
- hitscan3d — shots hit shapes and characters.
- cover3d — characters take cover behind shapes.
- cutscene — a game can add cutscene steps of its own, edit its cutscenes on the dev page, and covers the screen until a shot is ready.
- ui — no flash of a bare frame or wrong font before the HUD first draws, and button labels can be nudged.
- loader — loads fonts.
- player — a gamepad button only counts as pressed past a deadzone.
- ragdoll3d — a scene names which kinds go limp as ragdolls.
- box3dvehicle — cars can start moving, aim and switch their headlights, and throw dust that lands on the ground.
- particle3d — effects can swirl, and speed up or throw harder while they run.
- ocean3d — waves cast shadows, and smoke and spray draw over the sea.
- workshop — tune particles, the HUD and poses live, and check a body's moves against a level.
- asset-workshop skill — covers the workshop's new pages.
- people-in-a-scene skill — a new skill: choosing and setting up characters and crowds in a scene.
- using-motion3d skill — a new skill: making characters move with motion3d.
- using-the-dev-page skill — a new skill: everything a game's dev page can do.
- tuning-particles skill — a new skill: tuning a game's effects.
- numerically-solving-balance skill — a new skill: balancing a game by playing its rules many times.
- patchwork-game-design-flowchart skill — a new skill: how a game's things connect.
- prime-directive skill — says where each new thing a game needs goes.
- building-a-plugin skill — covers where a game's logic goes and how a game adds its own kinds of thing to a plugin.
- connecting-plugins-using-mods skill — covers adding new kinds of thing to a plugin.
- building-a-cutscene-intro skill — covers adding cast members and shots seen through a character's eyes.
- building-the-hud skill — covers the UI workshop.
- benchmarking-a-game skill — shows where every millisecond goes.
- guide-to-smooth-gameplay skill — covers keeping things that ride a moving object smooth.
- using-terrain3d skill — finds the ground's height at any point.
- making-3d-assets-in-blender skill — catches overlapping faces reliably.
