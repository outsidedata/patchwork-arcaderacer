# shapes3d

Shapes standing in a 3D world, held on the server: cylinders, boxes, planes and hyperplanes a game
places as rows and may move,
which block shots and sight (hitscan3d), are walked round and stood on (walker, kinematics3d), are
hidden behind (cover3d), are baked round (nav3d), stand in box3d's world for its bodies and cars (box3d)
and can be drawn as plain shapes (solids), all from one entry each. A kind that lists `activities` is a
space instead: it stands in nothing's way, and offers motion3d what a body does there. Its points,
lines, splines and planes are the targets kinematics3d moves a body along, and its lines and splines
the courses crowd3d and npc3d walk people on.

## Why use it

Use shapes3d for whatever stands in the way that is placed rather than scattered: walls, crates,
pillars, posts, barriers, counters, floors, a level's blockout. Each plugin that asks what is in the
way reads the same shapes in the same words, so a wall stops a bullet, a body, a car and a line of
sight alike, and a body can take cover behind it.

## How it works

shapes3d has a server half only, no row of its own, and draws nothing. Its numbers are
`world.shapes3d.kinds`: `{ <kind>: { shape: { <word>: { … } }, look?, surface? } }`, every row of the
kind a thing of that word; `surface` is what box3d's bodies meet on it, Box3D's own surface fields
(`friction`, `restitution`, `rollingResistance`, …). Its words:

- `cylinder` `{ radius, height }`: upright, its foot's middle at the row's `pos`.
- `box` `{ size: [x, y, z] }`: its foot's middle at the row's `pos`, `x` across, `z` long, `y` tall,
  turned by the row's `yaw` (its length along (sin yaw, cos yaw)).
- `plane` `{ size: [x, z], tilt? }`: a surface, its middle at the row's `pos`, `x` across and `z` long on
  the ground, turned by the row's `yaw`; flat, or rising `tilt` radians along its length, a ramp. It is
  stood on and shot, and never in the way.
- `hyperplane` `{ size: [x, z] }`: a surface like a plane, its middle at the row's `pos`, turned by the
  row's `rot` `[x, y, z, w]`, a unit quaternion that is the whole of its turn, so a game can tilt, roll
  and turn it as it runs; at `[0, 0, 0, 1]` it lies face up, `x` along the world's x. It is stood on
  and shot, and never in the way; a body on one tilted past its `maxSlope` slides off it.

A row of one of these kinds carries `pos` and `yaw` (a hyperplane's `rot` in place of `yaw`) and stands
where it was put until a rule moves it with `move(w, row, pos, turn)`, `turn` its new `yaw`, or a
hyperplane's new `rot`. Nothing else writes its place. `move` keeps where it stood before on the row's
`was`, so a kind whose rows move gives `was: null` in its prefab, and walker's and kinematics3d's grounds
read the shapes again and carry a body standing on it along with it, turned with its turn. Move a shape
every step it travels; one that stops is moved to where it is. `turnOf(row)` is a row's turn as a
quaternion. `shapes(w)` is every
one as a shape in the world, `{ <word>: { pos, … } }`; `near(w, x, z, r)` those in the way whose
footprint reaches within r of a point; `along(w, from, dir, far)` those a line may cross. Each word
answers for its own top: a cylinder and a box flat at their top, a plane at its height, risen along its
length by its tilt.

A kind that lists `activities` is a space (motion3d, below): `shapes` and every mod but motion3d's and
solids' leave it out, so it is only where its activities are offered. A thing in the way there is a
kind of its own.

hitscan3d, walker and cover3d have `cylinder` of their own; shapes3d delivers each of them `box`, by its
behaviors: where a line meets a box (`lineBox`), a box's footprint (`corners`), and where a body stands
hidden behind one (`behind`); and hitscan3d `plane` and `hyperplane`, where a line meets one
(`linePlane`, `lineHyperplane`).

## The ground

shapes3d can be the ground a walker body walks on. A rule hands walker `ground(w, feet, k)`
(`shapes3d.walker.ts`) in place of `groundOf(w)`: under a body's feet is the top of the highest shape
no more than its `step` above them, or the land where there is none; every cylinder and box rising past
that and starting below its head is walked round. So boxes no taller than a step apart are stairs, a
tilted plane is a ramp, and a box raised over a body's head is a floor it walks under, or stands on once
it has climbed up. The land is the `height` mod's, `world.shapes3d.mods: { height: 'terrain3d' }`
(`terrain3d.shapes3d.ts`), or flat at 0 with none.

Walker asks the ground many times a step for every body, so the walker mod reads a truth's shapes once,
the first time it is asked, and again only after a `move`, and keeps them by the 2 m squares of the
ground their footprints reach. `ground` and `fixed` read only the shapes of the squares round the place
asked about, so a body on a castle of a thousand shapes reads the few round it.

The ground's `footing(pos, yaw)` carries a body standing on a shape that moved: its place on the shape
as it stood is put back through the shape as it stands now, so a lift raises it, a turning platform
turns it and a tilting one tilts it, and its facing turns with the shape. A body on the land or on a
still shape is left as it is.

## Using it

1. Give `world.shapes3d: { kinds: { wall: { shape: { box: { size: [0.3, 2.5, 8] } }, look: { colour:
   '#4a4552' } } } }`, a prefab `wall: { pos: [0, 0, 0], yaw: 0 }` and `actors` entries placing them.
2. Name shapes3d where each plugin asks:
   - `world.hitscan3d.mods: { solids: ['shapes3d'], behaviors: 'shapes3d' }`
   - `world.walker.mods: { fixed: ['shapes3d'], behaviors: 'shapes3d' }`, or, walking on its ground,
     `{ behaviors: 'shapes3d' }` with `world.shapes3d.mods: { height: 'terrain3d' }`
   - `world.cover3d.mods: { solids: ['shapes3d'], behaviors: 'shapes3d' }`
   - `world.kinematics3d.mods: { behaviors: ['shapes3d'], solids: ['shapes3d'], footprints:
     ['shapes3d'] }`, so a body moves on its points and walks the land round its shapes and up onto them
   - `world.motion3d.mods: { spaces: 'shapes3d' }`, so the kinds that list `activities` offer them
   - `world.nav3d.mods: { solids: ['shapes3d'] }`, so nav3d's bake lays its graph round them
   - `world.box3d.mods: { fixed: ['shapes3d'] }`, so box3d's bodies and cars stand on them and run
     into them: a box as itself, a cylinder as the prism of its look's `sides` and a plane as the slab
     of its look's `thick`, the solids solids draws
   - `world.solids.mods: { models: 'shapes3d' }`, with `solids` listed before `render3d`, to draw each
     kind that gives a `look` (`{ colour, roughness?, sides?, thick?, map?, scale? }`, `sides` for a
     cylinder's prism, `thick` for a plane's slab, `map` a texture entry of the loader's catalogue laid
     on it at `scale` metres to a span, as solids lays a paint's picture).
   Other plugins' solids sit beside it in the same lists, `solids: ['scatter3d', 'shapes3d']`.

## Plugins it works with

- **hitscan3d**: `shapes3d.hitscan3d.ts`, its shapes as `solids` and the `box` behavior.
- **walker**: `shapes3d.walker.ts`, its shapes as `fixed` and the `box` footprint, and `ground`, the
  shapes as the ground itself.
- **terrain3d**: `terrain3d.shapes3d.ts`, the land under the shapes.
- **cover3d**: `shapes3d.cover3d.ts`, its shapes as `solids` and the `box` spot.
- **nav3d**: `shapes3d.nav3d.ts`, its shapes as the bake's `solids`, each as its footprint.
- **box3d**: `shapes3d.box3d.ts`, its shapes as `fixed`, things in box3d's world that never move,
  each named by its row.
- **solids**: `shapes3d.solids.ts`, a plain model of each kind with a `look`.
- **motion3d**: `shapes3d.motion3d.ts`, its spaces. A kind that lists `activities` offers them to a
  body its shape holds (a cylinder or a box, over its footprint from its underside to its top; a plane
  has no inside and throws), and stands in nothing's way. Beside them it gives a `priority`, 1 when it
  gives none; `data`, blocks keyed by the plugin each is for, passed on untouched
  (`data.motion3d.autoChange`, the activities taken up with no key); and `points`, what a motion's root
  and limbs are held to, each in the shape's own frame so it moves and turns with its row:
  - `point` `{ at, turn? }`: one place, a seat, a door handle
  - `line` `{ from, to, turn? }`: a ledge's lip, a bar
  - `spline` `{ points, turn? }`: a curve through two or more places, a ledge bending round a tower,
    a sagging rope
  - `plane` `{ at, size: [x, z], turn? }`: a flat rectangle lying face up until it is turned, a
    ceiling, a climbing wall

  `turn` is `[yaw, pitch, roll]` degrees; on a point, a line and a spline its yaw is the facing a body
  takes on it, and a plane is turned by all three. `normal` `[x, y, z]`, on any of them, is the way it
  faces out: a seat's up, a wall's out.
- **kinematics3d**: `shapes3d.kinematics3d.ts` (`world.kinematics3d.mods: { behaviors: ['shapes3d'],
  solids: ['shapes3d'], footprints: ['shapes3d'] }`): its points as `point`, `line`, `spline` and
  `plane` targets, a place moved along a line or a spline, metres along the curve, or across a plane and
  stopped at the edges, the place nearest a
  point, and the ways a place moves; `solids(w, x, z, r)`, its shapes standing on the land, which
  terrain3d's `triangles` stands a body on and walks it round; and the `box`, `cylinder`, `plane` and
  `hyperplane` footprints, each with its underside and its top. Every target also gives kinematics3d
  `footing`, so a body standing on a shape that moved is carried with it. A spline is a Catmull-Rom curve through every one of
  its points, drawn as 16 straight pieces between each two, and every answer is on those pieces.
  `drawn(spline)` hands them out, which crowd3d walks a person along, nav3d draws a link's course with
  and npc3d draws a route with.
- **crowd3d** and **npc3d**: a person's course is shapes3d's `line` from its `pos` to its `to`, or with
  `through` the `spline` through them (`crowd3d.sim.ts`).
- **crowd3d**: `shapes3d.crowd3d.ts` (`world.crowd3d.mods: { paths: 'shapes3d' }`), the paths crowd3d's
  people walk: every `line` and `spline` point of a kind whose `data.crowd3d` is `{ clip, speed }`, the
  clip or pose played on it and its speed in metres a second, moved and turned with its row. A kind laid
  down only for its paths gives `activities: []`, so it stands in nothing's way. A block with no clip,
  or no speed above 0, throws naming the kind.
- **math**: deterministic maths.

## Keywords

shapes, collision shapes, colliders, obstacles, walls, crates, boxes, cylinders, pillars, blockout,
level geometry, floor, ramp, stairs, line of sight, cover, walk round, server-side collision, box3d,
static, fixed, behaviors, spaces, activities, targets, point, line, spline, curve, plane, ledge, seat,
hyperplane, quaternion, moving platform, lift, `shapes`, `near`, `along`, `drawn`, `move`, `turnOf`,
`world.shapes3d`
