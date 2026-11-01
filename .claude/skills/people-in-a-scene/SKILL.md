---
name: people-in-a-scene
description: Use in core, or any clone of it, whenever a person goes into a 3D scene - the player's body, an NPC, a guard, townspeople, workers, bystanders, a crowd - and before choosing walker (drawn by anim) or crowd3d for it. Covers what each body is, what each costs to draw and to send, props held on bones (crowd3d's instanced items, anim's props), what each stands on (terrain3d, shapes3d's levels, the base of a game's own), routes round what is in the way (nav3d), being shot (hitscan3d), and npc3d driving either body from one definition. Triggers on "walker or crowd3d", "make them crowd3d people", "NPCs", "a crowd", "townspeople", "hold a sword", "prop on a bone", "300 people", "they walk through walls", "their feet slide", "a person floats".
---

# People in a scene

A person in a 3D scene is one of two bodies: a **walker**, stepped by `walker` on the server and drawn
by `anim`, or a **crowd3d person**, a course written on its row and posed by `crowd3d` on the GPU.
Everything else here (the ground, shapes3d's levels, nav3d's routes, hitscan3d's shots, npc3d's
choosing) joins one of those two. This skill is how they fit together, in one place. A body moved by
`kinematics3d` and played and drawn by `motion3d`, which does what the shapes round it offer, is
`using-motion3d`'s.

## The two bodies

### Walker

A walker is a body the server steps every step: `walker.walk` moves its `pos` by its `want`, keeps it
apart from the kinds its `world.walker.kinds.<kind>.bodies` names, walks it round every solid the
`solids` mods hand, stands it on the ground the `height` mod (or a `ground` such as shapes3d's) gives,
and lets it fall, wade and slide. `seek` walks it to a goal round what is in the way. Its numbers are
`world.walker.kinds.<kind>`: `radius`, `height`, `step`, `maxSlope`, `seekSpeed`, `turnRate` and the
rest.

`anim` draws it, from the row's fields as they stand. It has everything a body can have:

- blended clips, crossfading over the kind's `fade`;
- an upper layer (`gesture`), so its hands play one clip while its legs walk another;
- gears, the walk and run clips chosen from its speed, and strafing when it faces one way and walks
  another;
- `aim`, its upper body pitched by the row's aim;
- props, loader models hung on bones (`world.anim.kinds.<kind>.props`);
- `ragdoll3d` when it goes limp, blown by `blow`;
- `ik3d` and `interact` (boarding a mech, a hand on a rifle's stock).

### crowd3d person

A person is a row that holds a course, not a place: `pos`, where its feet stood at `since`; `to`, where
the course ends; `speed`, metres a second across the ground from `pos` toward `to`; `yaw`, the way it
faces; and `body`, `clip` and `holding`. It stands on the straight line from `pos` to `to`, as far along
it as `speed × (now − since)` is of the line's length across the ground, and at `to` once it has gone
that far. The GPU works that out every frame, and so does any rule that needs where it is now: a hit,
the end of a walk.

- It plays the one clip its row names, looped, or held on its last frame when the clip is in
  `world.crowd3d.hold`, or a pose, a frame of a clip held, named in `clip` as a clip is
  (`world.crowd3d.poses`). With `world.crowd3d.fade` a change of clip or pose fades over that many
  seconds; without it, it snaps. No upper layer, no aim, no ragdoll.
- It faces its `yaw`; whoever writes the course faces it the way it walks. A turn is a new course.
- It walks straight, through everything. Nothing keeps it apart from anything. With `through`, a list
  of [x, y, z], its course is the shapes3d spline through `pos`, each of them and `to` (a curved
  stair), walked a straight piece at a time.
- Its height goes along the line from `pos[1]` to `to[1]`, so a line from the foot of a stair to its top
  climbs the stair. `normal` and `normalTo` are the up of the ground under `pos` and under `to`,
  `[0, 1, 0]` when left out, so a person walks on a wall or a ceiling.
- To change what it does, write its row once: `pos` where it stands now, `since` now, and the new
  `to`, `through`, `speed`, `yaw`, `clip`, `body`, `normal` or `normalTo`. Standing still is a
  `speed` of 0.
- It can walk the paths the scene's shapes lay down instead: with `world.crowd3d.mods: { paths:
  'shapes3d' }`, every `line` and `spline` point of a shapes3d kind whose `data` has a `crowd3d` block
  (`{ clip, speed }`) is a path (`shapes3d.crowd3d.ts`). Its rule calls `travel(me, w, time)` from
  `crowd3d.sim.ts` once a step, and at a path's end it goes on along another whose end is within
  `world.crowd3d.reach`, on that path's clip or pose at its speed.

## What each costs

### Drawing

- **Walker.** Each row gets its own clone of its kind's model, with its own skeleton and mixer: each
  mesh of that model is a draw call for that row, and one more for each light whose shadow it casts.
  Each prop is its own clone per row, as many draw calls again. Every walker adds its model's draw
  calls.
- **crowd3d.** A body's meshes are merged by material, and each group is drawn once for all the people
  of that body: one draw call per material, and one more per light for shadows, however many people.
  One bake of every clip is shared by every body. The pose is one pass on the GPU over every person.
  The pool is `poolSize` slots, 512 when left out, and more people than that throws.

300 people at 60 fps is what crowd3d does in core today.

### Sending

- **Walker.** Its `pos`, `yaw`, `vel`, anim's clip fields and its intents change every step it moves,
  so its row is sent every step.
- **crowd3d.** A row that keeps its course never changes, so a seat is sent nothing for it. A row
  changes only when it turns, stops, starts or changes clip.

## Props on bones

This is crowd3d's great strength. `world.crowd3d.items` names the things people hold, and a row's
`holding` `{ <place>: <item> }` says what it holds where:

```json
"items": {
  "wrench": { "model": "wrench", "rightHand": { "at": [0, 0.08, 0], "turn": [0, 0, -90] } },
  "hardhat": { "model": "hardhat", "head": { "at": [0, 0.09, 0] } }
}
```

Each item is drawn once per material for every copy anyone holds, instanced, posed by its holder's
bone on the GPU. Putting a thing in a hand or taking it out is one write of `holding`, drawn on the
next frame.

- `at` is metres in the bone's own frame; a Mixamo armature's centimetres are undone. `turn` is degrees,
  XYZ Euler, in the bone's frame. `scale` is a number or `[x, y, z]`.
- The places: `hips`, `chest`, `back`, `neck`, `head`, `leftArm`/`rightArm`, `leftForearm`/
  `rightForearm`, `leftHand`/`rightHand`, `leftThigh`/`rightThigh`, `leftShin`/`rightShin`,
  `leftFoot`/`rightFoot`.
- In a Mixamo rig a hand's y runs along the fingers; the head's y is up and its z forward.
- An item lists only the places it is held on. Holding it in the other hand too is one more line.
- `holds(body, clip, t, item, place)` on the page hands back the matrix an item goes through, to fit
  one.

A walker's props are `world.anim.kinds.<kind>.props: [{ model, bone, at, turn }]`, each its own clone
per row.

## What they stand on

### terrain3d

- **Walker**: `world.walker.mods: { height: 'terrain3d', depth: 'terrain3d', cell: 'terrain3d' }`. It
  stands on `rawAt`, the bed under water too, so it wades and `depth` says how deep; `cell` stands it on
  the triangles the page draws.
- **Person**: its course's line from `pos[1]` to `to[1]`. Whoever writes the course writes the ground's
  height at both ends.

### shapes3d: many levels

shapes3d's `ground(w, feet, k)` is the ground a walker walks on, handed to `walk`, `slide`, `carry` and
`seek` in place of `groundOf`. Its height under a body is the top of the highest shape no more than the
body's `step` above its feet, or the land under the shapes where that is higher; its solids are the
shapes that rise past that and start below its head. So a walker:

- walks up a stair of boxes and up a tilted `plane`, a ramp;
- walks under a box raised over its head, and once it has climbed onto that box, stands on it;
- steps down a stair without falling: anim's `falls` are speed bands it falls by, only ever up until it
  lands.

The land under the shapes is `world.shapes3d.mods: { height: 'terrain3d' }`. The scene names shapes3d
in `world.walker.mods.behaviors`, for the boxes' footprints, and **not** in `fixed`, which would hand
walker every box as a wall.

A person goes from one level to another along a course whose ends stand on each: a nav3d route over a
graph of levels hands each place's height, and npc3d walks a person up the stair one leg at a time.

### A game's own ground

A game's plugin may hand walker its own `height` and `solids` (floors over terrain3d's land, walls
as circles). A walker walks round them; a person does not.

## Routes: nav3d

A walker's `seek` walks round what is in the way, step by step. A person walks a straight line, so it
goes round things only along a route.

- The graph is baked before the game runs: `world.nav3d.graphs.<name>: { asset, bake: { area,
  clearance, around, sample, slope, wade } }`, and `bake(manager, scene)` from the game's
  `assets/<game>.bake.ts`, `yarn bake <game>`.
- A graph is made of shapes3d's shapes, `{ places, ways, blocks? }`: places are points, ways are lines
  and splines between them, each with a `data` block (`data.nav3d.word`, `cost`, `one`, `tags`, and
  any other block carried on the step, such as `data.crowd3d: { clip, speed }`). A level's generator
  may write one with no bake.
- The bake's `solids` mods hand the footprints: `shapes3d.nav3d.ts` (every shape but a plane), or a
  game's own. Each is grown by `clearance` into a block, a place at each corner, and two places joined
  by a line where the walk between them crosses no block.
- `terrain3d.nav3d.ts` gives the places' `height` and the `link`: a walk is refused where the ground
  rises more than `slope` a metre or the water is deeper than `wade`. Its `behaviors` deliver the
  `ground` word, which costs a way its `data.nav3d.cost`, or its length along its shape.
- `route(w, name, from, to, who?)`, `from` [x, y, z] and `to` [x, y, z] or a tag, hands back the steps
  `[{ at, place, way, course, normal? }]`, each place at its height, the way that reaches it with its
  data, and `course`, that way's line or spline run the way it is crossed. A person walks one course
  per step, a line or the way's spline, its height with it; a walker seeks each in turn.

## Being shot: hitscan3d

A shot meets a body that a `bodies` mod hands hitscan3d: one upright cylinder per row, its part named
as its kind.

- `walker.hitscan3d.ts`: every walker kind's rows at their `pos`, of the kind's `radius` and `height`.
- `npc3d.hitscan3d.ts`: every row of a kind whose definition names a `body`, standing where that body
  says it is now on npc3d's clock, of the definition's `radius` and `tall`.
- A person's cylinder must stand where the person is now, by the course formula, never at its `pos`.
- `world.hitscan3d.kinds.<kind>.off` names the field that takes it out of the shooting (`limp`).

A shot calls the row's `hit(struck)`. A walker dies into a ragdoll (`ragdoll3d`'s `die`). A person dies
on a clip in `hold`, held on its last frame, which leaves it lying.

## npc3d: one definition, either body

npc3d's NPCs see, hear, notice, remember, choose and act, and every order goes to the body the
definition's `body` names, `walker` or `crowd3d`. A body does what it can of an order and drops the
rest:

| order | walker | crowd3d |
| ----- | ------ | ------- |
| stand on a clip | plays it as an act | a course of speed 0 on it |
| walk to [x, y, z] | `seek` round solids across the ground, ends within `arrive` or when held up | one straight course to the place, or a route leg's spline, its height and all; ends at distance over speed |
| face | turns at `turnRate`, walking or standing | turns at once standing; dropped walking |
| hands | upper layer, legs carry on | stops it on that clip |
| others | kept apart from | walked through |

`world.npc3d.mods: { sight: 'hitscan3d', shot: 'hitscan3d', route: 'nav3d' }`, and `world.hitscan3d.mods:
{ bodies: 'npc3d' }`. List the plugins `loader, scenemanager, player, crowd3d, anim, npc3d, render3d`.
The scene has one `npc3d` actor; each NPC kind's rule is `npc`.

## Choosing

- **Walker**: the player's body, and anything that must be solid, keep apart from others, climb
  shapes3d's levels within one walk, ragdoll, aim, blend gestures over a walk, strafe, or ride and
  board.
- **crowd3d**: everyone else, the people who make a place alive: workers, townspeople, bystanders,
  crowds that idle, wander, visit, run, and die on a held clip. Hundreds of them, each holding its own
  props.

One model serves both: the player's body a walker, and people on the same model crowd3d people.

## Setting up a crowd3d person

1. `plugins`: `loader` before `crowd3d`, `crowd3d` before `render3d`.
2. `world.crowd3d`: `bodies` `{ <body>: <model> }`, Mixamo glbs on one skeleton with the clips baked
   on (anim's export); `clips`, every clip played; `rate`; `hold`, the clips held on their last frame;
   `kinds`, the kinds whose rows are people; `poolSize`; `items`; and where they are used, `poses`
   (a loader `json` entry of poses), `fade`, `reach` and `mods: { paths }`.
3. The kind's prefab carries `pos`, `to`, `since`, `yaw`, `speed`, `body`, `clip`, `holding`, and
   `through`, `normal` and `normalTo` where they are used. A row without `to` throws.
4. Its rule writes a course only when what it does changes, and at the clip's own pace: crowd3d's
   `travel(body, clip)` is how fast the clip carries the body, so a walk's `speed` is that number and
   its feet stay planted.

## What goes wrong

- **Feet slide**: a walk's `speed` is not its clip's travel.
- **A dead person stands up again**: its death clip is not in `hold`, so it loops.
- **A body throws about its bones**: every body must be on the first body's skeleton.
- **More people than `poolSize`** throws, naming both.
- **A shot misses where the person is**: something read `pos` as where it stands now; it is where it
  stood at `since`.
- **A person walks through a building**: it was sent straight; send it along a nav3d route.
- **A walker cannot climb onto a box**: shapes3d is in `world.walker.mods.fixed`, not `behaviors`.
- **npc3d throws about routes**: the scene names no nav3d graph, or more than one.
