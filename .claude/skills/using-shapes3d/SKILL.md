---
name: using-shapes3d
description: Use in core, or any clone of it, whenever shapes3d comes up - `world.shapes3d` (`kinds`, `shapes`, `mods`), a wall, crate, post, floor, deck, stair, ramp, lift, moving platform or blockout placed as a `box`, `cylinder`, `plane` or `hyperplane`, a shapes file, `move`, `was`, `shapes`, `near`, `along`, `land`, `ground`, `footing`, a kind with `activities`, `points` (`point`, `line`, `spline`, `plane`) or `data` (a space, a ledge, a seat, a crowd path), and any `shapes3d.<p>.ts` mod (walker, kinematics3d, motion3d, hitscan3d, cover3d, nav3d, box3d, solids, instances3d, particle3d, gpgpu3d, fabric3d, crowd3d, lod3d) or a scene's `mods` naming `shapes3d`. Also when a body walks through a box or a zone, cannot climb onto a box, falls through a deck, is not carried by a platform, a shot or particle passes through a shape, a shape is not drawn, or something throws `shapes3d kind ...`, `has no behavior for a solid of the word box`, or `gives no look with sides`.
---

# Using shapes3d

shapes3d (`plugins/shapes3d/`) is the one place a game says what stands in a 3D world. It holds
shapes and answers nothing itself: each plugin that needs to know what is there is handed the same
shapes through a mod, so one entry is a wall to a body, a shot, a car, a particle, a fabric and the
nav bake alike. Fourteen plugins take from it. The facts are `shapes3d.sim.ts`' header, each
`shapes3d.<p>.ts`' header and the tests beside them; where this file disagrees with them, they are
right and this file is fixed.

It has a server half only. It has no row, no prefab and no browser half, and it is **not listed in
a scene's `plugins`**: a scene uses it by giving `world.shapes3d` and naming `shapes3d` in the mods
of the plugins that ask. The mods that run on the page (solids', instances3d's, particle3d's,
gpgpu3d's, fabric3d's, lod3d's `seen`) read the shapes off the rows the page was sent.

## A kind

```json
"shapes3d": {
  "kinds": {
    "wall":  { "shape": { "box": { "size": [0.3, 2.5, 8] } }, "look": { "colour": "#4a4552" } },
    "post":  { "shape": { "cylinder": { "radius": 0.25, "height": 3 } }, "look": { "colour": "#7a5636", "sides": 10 } },
    "ramp":  { "shape": { "plane": { "size": [2, 6], "tilt": 0.29 } }, "look": { "colour": "#70a8e8", "thick": 0.2 }, "surface": { "friction": 0.9 } },
    "lift":  { "shape": { "hyperplane": { "size": [3, 3] } }, "look": { "colour": "#e07850", "thick": 0.2 } }
  },
  "mods": { "height": "terrain3d" }
}
```

Every row of the kind is a thing of the word its `shape` gives. Beside the entry, the kind needs
what any kind needs: a prefab (`"wall": { "pos": [0, 0, 0], "yaw": 0 }`), an `actors` entry for each
one placed, and an entry in the scene's `sim`, `{}` when it has no rule (`wall: {}`).

| Field | What it is |
|---|---|
| `shape` | `{ <word>: { … } }`, one word. A word that is none of shapes3d's throws `shapes3d kind <kind> is a <word>, which is none of its words: …` |
| `look` | `{ colour, roughness?, sides?, thick?, map?, scale? }`, how solids draws it; or `{ look: '<name>', sides?, thick? }`, a material of supershader3d's. A kind with no `look` is not drawn. `sides` (a cylinder) and `thick` (a plane, a hyperplane) are also what box3d stands it as |
| `surface` | Box3D's surface fields (`friction`, `restitution`, `rollingResistance`, …), what box3d's bodies meet on it |
| `activities` | the kind is a space, not a thing in the way (Spaces, below) |
| `priority`, `points`, `data` | a space's, and a path's (Spaces, below) |

## The words

| Word | Numbers | The row carries | Stands in the way | Stood on | Shot |
|---|---|---|---|---|---|
| `box` | `size: [x, y, z]`, `x` across, `y` tall, `z` long | `pos`, `yaw` | yes | its top | yes |
| `cylinder` | `radius`, `height`, upright | `pos`, `yaw` | yes | its top | yes |
| `plane` | `size: [x, z]`, `tilt?` radians rising along its length | `pos`, `yaw` | never | its surface, a ramp when tilted | yes |
| `hyperplane` | `size: [x, z]` | `pos`, `rot` `[x, y, z, w]`, the whole of its turn | never | its face; past the body's `maxSlope` it slides off | yes |
| `triangles` | `triangles`, each three corners | — | never | the highest over a point | by nothing |

A box and a cylinder stand with the middle of their foot at `pos`; a plane and a hyperplane have
their middle at `pos`. A box's length runs along (sin yaw, cos yaw). A hyperplane at
`[0, 0, 0, 1]` lies face up. "In the way" is what has an underside (`base`): walker's `fixed`,
cover3d and nav3d are handed boxes and cylinders only, and `near` leaves the rest out. `triangles`
has a top and a footprint in `shapes3d.sim.ts`, no mod delivers a behavior for it, and no game in
`games/` uses it.

## A shape that moves

A shape stands where it was put until a rule moves it, and only `move` moves it:

```ts
import { move } from '#plugins/shapes3d/shapes3d.sim.ts'
move(w, me, [x, next, z], d.rot)     // a hyperplane: its new rot; any other word: its new yaw
```

- The kind's prefab gives `was: null`. `move` writes where the shape stood on `was`, and a row that
  carries `was` is how walker's and kinematics3d's grounds know which shapes may move.
- `move` counts the truth's moves (`moves(w)`), which is what makes walker's ground, kinematics3d's
  solids and lod3d's surfaces read the shapes again. A rule that writes `pos` itself moves the row
  and nothing else: bodies go on standing on the shape where it was.
- Call it every step the shape travels, and while it waits too, with the place it stands at
  (`games/demo_walker/lift.sim.ts` does both).
- A body is carried by how far its floor has moved since it was last carried (`carried`), kept on
  the body's own row as `floor`. A lift raises it, a turning platform turns it and its facing, a
  tilting one tilts it.
- box3d is handed the shapes once, as its world is made, and never follows one after. A lift is not
  a moving floor to a crate or a car.

`turnOf(row)` is a row's turn as a quaternion; `rotate`, `conj` and `mul` are the quaternion sums.

## Shapes from a file

Shapes that never move need no rows. A file `{ kinds, shapes }`, `kinds` as above and `shapes`
`[{ kind, pos, yaw }]`, is a `json` entry of the loader's catalogue with `preload`, named in
`world.shapes3d.shapes`:

```json
"loader": { "assets": { "yardShapes": { "type": "json", "url": "/games/<game>/assets/yard.shapes3d.json", "preload": true } } },
"shapes3d": { "shapes": ["yardShapes"] }
```

A place world3d draws hands its file through the `shapes` mod, `"shapes3d": { "mods": { "shapes":
["world3d"] } }`, read after the listed files (every scene of `games/demo_world3d`). The file is read
once per truth; its shapes come after the rows' in `shapes(w)` and their ids count down from −1, so
none is taken for a row. They have no `points`, no `was` and are in nothing that reads rows: `faces`,
`spaces`, `paths` and lod3d's points.

## What a rule can ask

All from `#plugins/shapes3d/shapes3d.sim.ts`:

| Call | Answer |
|---|---|
| `shapes(w)` | every shape but the spaces, `{ id, kind, word, shape: { <word>: { pos, … } } }`, rows first, then files |
| `near(w, x, z, r)` | the boxes and cylinders whose footprint reaches within `r` of (x, z) |
| `along(w, from, dir, far)` | the shapes a line's path over the ground may cross |
| `land(w)` | `(w, x, z) → y`, the ground under the shapes: the `height` mod's, or 0 everywhere |
| `words[word].top(shape, x, z)` | the height stood on over (x, z), undefined off it; `.base(shape)` its underside, `.gap`, `.middle` its footprint |
| `wordOf(kind, k)` | a kind's word and what shapes3d knows of it |
| `corners`, `lineBox`, `linePlane`, `lineHyperplane`, `behind` | the sums its behaviors are made of: a box's footprint, where a line meets each, the spot behind a box |
| `move`, `moves`, `turnOf`, `carried` | A shape that moves, above |

`games/demo_ragdoll3d/player.sim.ts` uses `lineBox` itself; `games/demo_walker/plugins/gait/` and
`plugins/touch/` use `land`, `shapes`, `wordOf` and `ground`.

## The mods

Each line is one file beside shapes3d, named after the plugin that asks. The scene switches it on in
that plugin's `mods`; nothing is on until it is named. The last column is the scene in `games/` that
uses it, the place to read a working one.

| Asks | Scene line | File | Hands over | Used in |
|---|---|---|---|---|
| walker | `"walker": { "mods": { "fixed": ["shapes3d"], "behaviors": "shapes3d" } }` | `shapes3d.walker.ts` | `fixed`: boxes and cylinders as walls; `behaviors`: `box`, its four corners. And `ground(w, feet, k)`, which a rule imports (Walking on it) | `demo_walker` (`shapes`, `yard`, `main`), `demo_world3d`, `demo_particle3d`, `demo_npc3d` |
| kinematics3d | `"kinematics3d": { "mods": { "behaviors": ["shapes3d"], "solids": ["shapes3d"], "footprints": ["shapes3d"] } }` | `shapes3d.kinematics3d.ts` | `behaviors`: the targets `point`, `line`, `spline`, `plane`, each with `footing`; `solids`: the shapes round a place; `footprints`: `box`, `cylinder`, `plane`, `hyperplane`, each with `base`, `crown`, `top` | `demo_motion3d` |
| motion3d | `"motion3d": { "mods": { "spaces": "shapes3d", "faces": "shapes3d" } }` | `shapes3d.motion3d.ts` | `spaces`: the kinds with `activities`; `faces`: the four upright sides of every solid box, for an activity's `solid` (a vault, a mantle) | `demo_motion3d` |
| hitscan3d | `"hitscan3d": { "mods": { "solids": ["shapes3d"], "behaviors": "shapes3d" } }` | `shapes3d.hitscan3d.ts` | `solids`: `along`; `behaviors`: `box`, `plane`, `hyperplane` | `demo_ragdoll3d` (`blast`), `demo_audio` (`lot`), `demo_npc3d` |
| cover3d | `"cover3d": { "mods": { "solids": ["shapes3d"], "behaviors": "shapes3d" } }` | `shapes3d.cover3d.ts` | `solids`: `near`; `behaviors`: `box`, the spot behind it | no game; `shapes3d.cover3d.test.ts` |
| nav3d | `"nav3d": { "mods": { "solids": ["shapes3d"] } }` | `shapes3d.nav3d.ts` | each box and cylinder in the bake's area as its footprint, however tall | `demo_npc3d` (`town`, `wall`) |
| box3d | `"box3d": { "mods": { "fixed": ["shapes3d"] } }` | `shapes3d.box3d.ts` | every shape as a Static named by its row's id, the solid solids draws of it, with its `surface` | `demo_ragdoll3d` (`blast`), `demo_audio` (`lot`) |
| solids | `"solids": { "mods": { "models": "shapes3d" } }`, `solids` listed before `render3d` | `shapes3d.solids.ts` | a model of each kind with a `look`: a box a loft, a cylinder a prism of `sides`, a plane and a hyperplane a slab `thick` deep under the surface | every demo above |
| instances3d | `"instances3d": { "mods": { "instances": ["shapes3d"], "behaviors": ["shapes3d"] }, "kinds": { "wall": { "form": {}, … } } }` | `shapes3d.instances3d.ts` | `instances`: every row; `behaviors`: `form`, the same geometry solids draws, `form.sides` and `form.thick` in place of the look's. In place of solids for a kind, never both | no game; `shapes3d.instances3d.test.ts` |
| particle3d | `"particle3d": { "mods": { "solids": ["shapes3d"] } }` | `shapes3d.particle3d.ts` | where a line first meets a box, plane, hyperplane or cylinder, for a layer with a `bounce` | `demo_particle3d` |
| gpgpu3d | `"gpgpu3d": { "mods": { "things": ["shapes3d"], "behaviors": ["shapes3d"] } }` | `shapes3d.gpgpu3d.ts` | `things`: the shapes within `reach`, where the frame draws them; `behaviors`: `box`, `plane`, `hyperplane`, `cylinder`, each a line met and a point pushed clear in GLSL. What gpuparticle3d, fabric3d, grass3d and hair3d meet | `demo_gpuparticle3d` (`bounce`), `demo_fabric3d` |
| fabric3d | `"fabric3d": { "mods": { "sources": ["shapes3d"], "behaviors": ["shapes3d"] } }` | `shapes3d.fabric3d.ts` | `sources`: each shape a thing a fabric is pinned to, its `key` the id, its `of` the kind, its point `pos`; `behaviors`: the cut `plane` `{ size }` | `demo_fabric3d` |
| crowd3d | `"crowd3d": { "mods": { "paths": "shapes3d" } }` | `shapes3d.crowd3d.ts` | every `line` and `spline` point of a kind whose `data.crowd3d` is `{ clip, speed }` | `demo_pose` |
| lod3d | `"lod3d": { "mods": { "surfaces": ["shapes3d"], "seen": ["shapes3d"], "behaviors": ["shapes3d"] } }` | `shapes3d.lod3d.ts` | each shape's parts as surfaces a layer stands on, named by its kind (a box `top`, `bottom`, `+x`, `-x`, `+z`, `-z`; a cylinder `wall`, `top`, `bottom`; a plane and a hyperplane `face`), and each point as `<kind>.<point>` | `demo_lod3d` |

And the two shapes3d itself asks, in `world.shapes3d.mods`:

| Key | From | Gives |
|---|---|---|
| `height`, one | `plugins/terrain3d/terrain3d.shapes3d.ts` | the land under the shapes, `rawAt`. With none, flat at 0 |
| `shapes`, many | `plugins/world3d/world3d.shapes3d.ts` | more shapes files by their catalogue names |

Things to know when naming them:

- **A word needs its behavior named too.** hitscan3d, walker and cover3d have `cylinder` of their
  own and nothing else. Naming shapes3d under `solids` or `fixed` and not under `behaviors` throws
  `walker has no behavior for a solid of the word box: no plugin world.walker.mods.behaviors names
  delivers it` (cover3d's the same; hitscan3d's says `a shape of the word`; gpgpu3d's `has no
  behavior for thing <n>, of the word box`).
- **Another plugin's things in shapes3d's words.** A plugin that hands gpgpu3d a `cylinder`
  (walker's bodies, `walker.gpgpu3d.ts`) is met by shapes3d's `cylinder`, so the scene names
  `behaviors: ['shapes3d']` there even with no shape in it.
- **Other plugins sit beside it** in the lists: `solids: ['lod3d', 'shapes3d']`.
- **box3d and solids agree.** box3d stands a cylinder as the prism of its look's `sides` and a plane
  or hyperplane as the slab of its look's `thick`, so a body meets what is drawn. A cylinder with no
  `look.sides`, or a plane with no `look.thick`, throws in both.
- **On the page, between the steps.** gpgpu3d's `things` and fabric3d's `sources` hand each shape
  where the frame draws it, between its last two steps (`shapes3d.drawn.ts`), so a fabric pinned to
  a moving shape and a particle landing on one stay on it as drawn.
- **A spline is drawn in pieces.** `drawn(spline)` in `shapes3d.kinematics3d.ts` is a Catmull-Rom
  curve through every point, 16 straight pieces between each two. kinematics3d, crowd3d, npc3d,
  nav3d and lod3d all walk or draw those same pieces by importing it.

## Walking on it

There are two ways a walker body meets the shapes, and a scene picks one.

**As walls.** `world.walker.mods: { fixed: ['shapes3d'], behaviors: 'shapes3d' }` and the rule walks
on `groundOf(w)`. Every box and cylinder pushes the body out sideways. Nothing holds it up: a body
stands only on the `height` mod's ground.

**As the ground.** `world.walker.mods: { behaviors: 'shapes3d' }`, shapes3d **not** in `fixed`, and
the rule hands walker shapes3d's ground in place of `groundOf`:

```ts
import { ground } from '#plugins/shapes3d/shapes3d.walker.ts'
import { numbers, walk } from '#plugins/walker/walker.sim.ts'
walk(me, w, dt, ground(w, me.data.pos[1], numbers(me, w)))
```

- Its `height` over a point is the top of the highest shape there no more than the body's `step`
  above its feet, or the land (`world.shapes3d.mods.height`) where that is higher.
- Its `solids` are the boxes and cylinders whose top rises past that and whose underside starts
  below the body's head. Everything else is walked over or under.
- Its `roof` is the lowest underside over the head, where a rising head stops.
- Its `footing` carries a body on a shape that moved.

So boxes no more than a `step` apart are stairs, a tilted plane is a ramp, a box over the head is
walked under and stood on once climbed, and a hyperplane a rule moves is a lift. Build the ground
each step from the body's own feet: it is the feet's height that decides what is floor and what is
wall. `games/demo_walker`'s `shapes` scene is all of it (`shapes.scene.json`, `player.sim.ts`'s
`walking`, `plugins/gait/gait.sim.ts`' `underfoot`, `lift.sim.ts`); `games/demo_world3d/player.sim.ts`
walks a baked place the same way.

The mod reads a truth's shapes once and keeps them by 2 m squares of the ground, so a body on a
thousand shapes reads the few round it; a `move` has them read again.

A kinematics3d body gets the same from its three mods: `solids` and `footprints` stand it on the
tops and walk it round what is in the way (through terrain3d's `triangles`), and each target's
`footing` carries it, by its kind's `triangles.step`.

## Spaces, points and paths

A kind that lists `activities` is a space. It offers those activities to a motion3d body its shape
holds, and **stands in nothing's way**: `shapes(w)` leaves it out, so only motion3d's `spaces`,
crowd3d's `paths` and lod3d's points see it. Solids and instances3d draw what `shapes(w)` hands
out, so a space is not drawn either, whatever `look` it gives. A thing in the way, or a thing to
see, at the same place is a second kind with no `activities` (`games/demo_motion3d`: the `wall`
at `[0, 0, 10.6]` and its `ledgezone` at `[0, -0.5, 9.4]`, the `chair` and its `chairzone`).

```json
"ledgezone": {
  "shape": { "box": { "size": [4, 2.872, 1.2] } },
  "points": { "Lip": { "line": { "from": [-2, 2.654, 0.6], "to": [2, 2.654, 0.6] } } },
  "activities": ["ledge"]
}
```

- The space's shape is a `box` or a `cylinder`; it holds a point over its footprint from its
  underside to its top. A `plane` has no inside and throws `shapes3d kind <kind> offers activities,
  and a plane has no inside to hold a body`.
- `priority` is its activities' priority, 1 when not given. `data` is `{ <plugin>: { … } }`, passed
  on untouched: `data.motion3d.autoChange`, `data.crowd3d`.
- `points` are in the shape's own frame, metres, `x` across, `y` up from its foot, `z` along its
  length, so they move and turn with the row:

| Point | Numbers | For |
|---|---|---|
| `point` | `{ at, turn? }` | a seat, a door handle |
| `line` | `{ from, to, turn? }` | a ledge's lip, a bar, a stair's flight |
| `spline` | `{ points, turn? }`, two or more | a ledge round a tower, a rope, a path |
| `plane` | `{ at, size: [x, z], turn? }`, face up until turned | a ceiling, a climbing wall |

  `turn` is `[yaw, pitch, roll]` degrees. On a point, a line and a spline its yaw is the facing a
  body takes; a plane is turned by all three. `normal` `[x, y, z]` on any of them is the way it
  faces out. A point of any other word throws `shapes3d kind <kind>'s point <name> is a <word>,
  which is none of point, line, spline, plane`.
- A space's row may carry `rot` in place of `yaw`: the shape and every point lean with it, and each
  point hands `up`, so a body climbs along a leaning shape.
- **A crowd path** is a `line` or `spline` point of a kind whose `data.crowd3d` is `{ clip, speed }`.
  A kind laid down only for its paths gives `activities: []`, so it stands in nothing's way
  (`games/demo_pose`). A block with no `clip`, or no `speed` above 0, throws naming the kind.
- crowd3d's paths and lod3d's points turn a point by its row's `yaw` alone, not `rot`.
- `faces` are the sides of boxes with no `activities`, turned by `yaw` alone; a box whose row
  carries `rot` has none.

## What throws

| Text | Why |
|---|---|
| `shapes3d kind <kind> is a <word>, which is none of its words: cylinder, box, plane, hyperplane, triangles` | the `shape`'s key |
| `walker has no behavior for a solid of the word box: no plugin world.walker.mods.behaviors names delivers it` (cover3d the same, hitscan3d `a shape of the word`, gpgpu3d `for thing <n>, of the word box`) | shapes3d named under `solids`, `fixed` or `things` and not under that plugin's `behaviors` |
| `shapes3d kind <kind> is a cylinder, which box3d stands as the prism solids draws of its look's sides, and it gives no look with sides` (and the plane's and hyperplane's, `thick`) | box3d's `fixed` with a kind that has no `look.sides` or `look.thick` |
| `shapes3d kind <kind> is drawn as a cylinder, and its look gives no sides` (plane, hyperplane: `no thick`) | solids' `models` |
| `shapes3d kind <kind> is drawn as a cylinder, and its form gives no sides` | instances3d's `form` |
| `instances3d draws <kind>'s form, and world.shapes3d.kinds lists no <kind>` | the kind is in neither `world.shapes3d.kinds` nor a file `world.shapes3d.shapes` lists; a file only the `shapes` mod names is not looked in |
| `shapes3d kind <kind> offers activities, and a plane has no inside to hold a body` | a space of a plane or hyperplane |
| `shapes3d kind <kind>'s point <name> is a <word>, which is none of point, line, spline, plane` | motion3d's `spaces`, lod3d's surfaces |
| `shapes3d kind <kind>'s data.crowd3d names no clip` / `gives no speed above 0` | crowd3d's `paths` |

## Mistakes

| What happens | Why | Fix |
|---|---|---|
| A body cannot climb a stair or a crate; every box is a wall | shapes3d is in `world.walker.mods.fixed` | Name it in `behaviors` only and walk on `ground(w, feet, k)` |
| A body sinks through a deck or a floor | the rule walks on `groundOf(w)`: solids never hold a body up | Hand `walk` shapes3d's `ground` |
| A body walks straight through a zone | the kind lists `activities`, so it is a space | A second kind with no `activities` for the thing in the way |
| A body is left behind by a platform, or stands in the air where it was | the rule wrote `pos` itself, or the prefab has no `was` | `move` every step, `was: null` in the prefab |
| A platform cannot tilt | it is a `plane` or a `box`, turned by `yaw` alone | A `hyperplane`, its row `rot` |
| A crate rides a lift's old place | box3d is handed the shapes once | A moving floor for box3d is a kinematic box3d body |
| A shot passes through a wall a body stops at | hitscan3d is handed nothing | Name shapes3d in `world.hitscan3d.mods.solids` and `behaviors` |
| A shape is solid and invisible | the kind has no `look`, or solids' `models` does not name shapes3d | Give `look`, name the mod, list `solids` before `render3d` |
| A zone's mat is not drawn | the kind lists `activities`, and a space is not drawn | A second kind with a `look` and no `activities` for the mat |
| A shape is drawn twice | named for both solids and instances3d | One of the two for each kind |
| shapes3d in the scene's `plugins` | it has no half to list | Take it out; give `world.shapes3d` and name the mods |
| A kind with no `sim` entry or no prefab | it is a kind like any other | `wall: {}` in `sim`, `"wall": { "pos": [0, 0, 0], "yaw": 0 }` in `prefabs` |
| `Math.sin` in a rule that places shapes | the page's copy drifts | `plugins/math` |

## Where it is proven

Beside each mod, run one at a time with `yarn vitest run <file>`: `shapes3d.walker.test.ts`,
`shapes3d.kinematics3d.test.ts`, `shapes3d.motion3d.test.ts`, `shapes3d.hitscan3d.test.ts`,
`shapes3d.cover3d.test.ts`, `shapes3d.nav3d.test.ts`, `shapes3d.box3d.test.ts`,
`shapes3d.solids.test.ts`, `shapes3d.instances3d.test.ts`, `shapes3d.particle3d.test.ts`,
`shapes3d.fabric3d.test.ts`, and `plugins/world3d/world3d.shapes3d.test.ts` for shapes from a file.
crowd3d's paths, lod3d's surfaces and gpgpu3d's things are proven in those plugins' own tests
(`crowd3d.sim.test.ts`, `lod3d.sim.test.ts`, `gpgpu3d.plugin.test.ts`).

A new plugin that should meet the shapes gets a new `shapes3d.<p>.ts`, which is an expansion of
core's and asked for first (`prime-directive`, `connecting-plugins-using-mods`); a game's own plugin
takes them by importing `shapes`, `near` or `along`, or through a mod of its own beside itself.

Related: `using-3d-physics` (each plugin that moves or tests a thing, and its mods),
`people-in-a-scene` (walker or crowd3d, and what each stands on), `using-motion3d` (the activities a
space offers), `using-terrain3d` (the land under the shapes), `building-a-level`,
`connecting-plugins-using-mods`.
