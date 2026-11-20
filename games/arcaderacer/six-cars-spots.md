# arcaderacer: every spot to change for the six kit cars, six spots, car select

## The three facts
- No scene lists box3dvehicle, supershader3d or box3d. The cars are drawn by the game's own `drive` plugin (`plugins/drive/drive.plugin.ts`), which clones a glTF `model` and recolours its paint.
- The cars move by the game's own handling in `plugins/drive/drive.sim.ts`, read from `def(w, kind).drive` in `assets/arcaderacer.json`. No physics.
- Nothing picks which car a seat or rival drives: every `car` row and `rival` row gets one look, by its kind.

## Counts of 8 -> 6
- forest.scene.json :22 seats 8; :71-78 8 start actors; :79-86 8 rival actors
- tokyo.scene.json :22 seats 8; :71-78 start; :79-86 rival
- paris.scene.json :30 seats 8; :84-91 start; :92-99 rival
- title.scene.json :186-193 rival1..rival8
- assets/intro.json :12-40 cast rival1..rival8 (regenerate with intro.ts); intro.ts :6 says "eight rivals"
- title.sim.ts :7 "eight rival rows"
- title.sim.test.ts :35 toBe(8)
- addons/match/match.addon.test.ts :102 [3,4,5,6,7] -> [3,4,5]
- README.md :8 "eight cars", :10 "Up to eight players"
- arcaderacer.json :171-173 rival.ai.skill and ai.lanes are lists of 5 by grid place

## The supercar, to remove
- arcaderacer.scene.json :26-30 loader entry `supercar`
- title.scene.json :38-42 loader entry `supercar` (title's own catalogue; every kit entry must be repeated here)
- arcaderacer.json :116-128 car.look and :206-218 rival.look (model, paint, paints, sc_ materials, hubs carhub_*, wheels carwheel_*, tyre, steer)
- arcaderacer.json :98-115, :189-205 fx offsets (wheels, sparks, pop) measured on the supercar; :93/:166 radius 1.9
- paris.json :74 headlight at [0, 0.75, 2.2], sized to the supercar
- intro.ts :44 FAR and intro.head camera height, sized to the supercar
- arcaderacer.bake.ts the supercar step; assets/supercar/ folder

## Drawing: drive plugin -> box3dvehicle + supershader3d
- drive.plugin.ts :1-24 header, :53-58 model clone, :59 paint by grid, :63-94 material swaps, :95-105 hub/wheel nodes, :132-143 placing, steering, wheel spin, brake lamp, :146-158 Paris headlight
- shipped.plugins: arcaderacer.scene.json :247-256, title.scene.json :128-130 — no box3dvehicle or supershader3d
- plugins lists: forest :9-21, tokyo :9-21, paris :16-29, title :132-142 — add supershader3d before box3dvehicle
- world needs `box3dvehicle` (vehicles, mods.models: supershader3d) and `supershader3d.looks`
- curtain.client.ts :15, :26 waits for model/texture only, not binary/json
- fx.plugin.ts :206-207 reads per-kind fx offsets; partial_scene :3-13 particle3d.attach sourced by fx

## Which car: there is no field for it yet
- prefabs.car :539-579 and prefabs.rival :586-628 (grid, name), no car field
- car.sim.ts :1-4, :19; rival.sim.ts :1, :24, :35
- match.sim.ts :75 the one spawn of a player's car; :64-70 reset fills rivals on the rest
- match.addon.ts :111-121 start(course), :136 start only from the leader; no car carried
- match.plugin.ts :16, :27, :109, :168 labels "PLAYER n" / "CPU n"
- dev.html :21-22, :164, :304 watch by grid (0-5 now); :323 cpu pilot

## Car select screen
- arcaderacer.scene.json :509-531 scenemanager scenes title, forest, tokyo, paris; entry title — a select scene goes here
- title.sim.ts :14-16 title -> course; select goes between
- titlecard.client.ts :38-39, :305-307 course press sends match `start`; :200-212 3D words from title.glb; :277-283 word reveal
- arcaderacer.json :9-40 titlecard definition
- title.py and title.glb: the six car names in 3D text
- arcaderacer.scene.json :296-303 ui.panels.title, :470-499 styles
