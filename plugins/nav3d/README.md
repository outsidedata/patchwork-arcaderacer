# nav3d

The way from one place to another over a graph, a model of the space made of shapes3d's shapes: places
(points), the ways between them (lines and splines), and in each one's data what it is and what happens
there. The graph is made before the game runs, by a level's generator or by nav3d's bake
from the shapes and the ground, and the game only searches it.

## Why use it

Use nav3d when a thing has to get somewhere it cannot walk to in a straight line: round a wall, through
a house to its kitchen, from one end of a castle to the other. All the work of reading the space is done
once, offline, in the bake; while the game runs, a route is a search over a few points, on the server
and on a page running ahead alike. nav3d moves nothing: whatever drives a body (an NPC's plugin) walks it
along the route through the body's own plugin (walker, crowd3d).

## How it works

nav3d has a server half, which bakes and searches, and a browser half, which only draws the graphs for a
testbed. It has no row. Its numbers are `world.nav3d`:

- `graphs` `{ <name>: { asset, bake? } }`: each graph, `asset` the loader catalogue `json` entry of its
  file, `bake` the rules the bake makes it by.
- `mods` the plugins it asks.

A graph is made of shapes3d's shapes: its places are points and its ways are lines and splines, in
shapes3d's own words. Each shape's first-class fields are what it must have to work: its word, its
points, its normal. Everything else about it is in its `data` block beside its word, `{ <plugin or
word>: { … } }`. What happens on a stretch of the graph is said where it happens: a ledge's way says to
balance (`data.crowd3d.clip`), a door's way says who may go through it (`data.door`), and whoever walks
the route reads it off the step. A new behaviour is one more field in a data block.

A graph file is `{ places, ways, blocks? }`:

- `places` `[{ point: { at: [x, y, z], normal? }, data? }]`. `normal` `[x, y, z]`, a unit vector, is the
  up of the ground there, for a graph walked on walls and ceilings; a place without one stands on
  `[0, 1, 0]`. Places along an edge whose ups step from one face's to the other's turn a person over the
  edge. `data.nav3d.tags` are names a route may be asked to reach ("kitchen").
- `ways` `[{ line: { from, to }, data? }]` or `[{ spline: { points }, data? }]`, each a way between the
  two places its ends stand on, within a millimetre of a place's `at`. A line is the straight way; a
  spline the curve through its points, first to last (a curved stair). Its data:
  - `data.nav3d.word`: what it is (`stair`, `door`, `room`, `ground`), the word its behavior is found by
  - `data.nav3d.cost`: what crossing it costs as the file was made; its length along its shape when it
    gives none
  - `data.nav3d.one`: true, crossed from its first end to its last alone
  - `data.<word>`: the word's own numbers, handed to its behavior
  - any other block, carried on the step for whoever walks it (`data.crowd3d: { clip, speed }`)
- `blocks` the convex outlines no straight walk crosses, which the bake writes; a route joins its ends
  across them, and on a graph with none, to their nearest places, nearest in all three, so an end on one
  level of a graph of levels joins a place on its own level.

A place that is not one point, a way that is not one line or spline, a way's end on no place or on two,
or a normal that is not three numbers of length 1, throws, naming it.

**Behaviors.** A way costs to cross its own cost, whatever its word. A word whose ways cost something
else now, or cannot be crossed now (a door locked, a door for the staff alone), has a behavior, `(w,
data, way, who) → cost | undefined`, `data` the way's `data.<word>`, `who` whoever the route was asked
for, delivered by the plugin that brings ways of it through `world.nav3d.mods.behaviors`, a later one's
taking the place of an earlier one's.

**Routes.** `route(w, name, from, to, who?)` is the cheapest way from `from` [x, y, z] to `to`, a place
[x, y, z] or a tag, for `who`: steps `{ at: [x, y, z], place, way, course, normal? }`, each the place to
go to next with its height (a place's own, or the goal place's as it was asked), the place it is (null
for the goal place), the way that reaches it with all its data (null for a step that joins the graph),
`course` that way's shape run the way the route crosses it (`{ line: { from, to } }` or `{ spline: {
points } }`), and, where the graph gives one, the up there (a place's own `normal`, the goal place's that
of the place it joins from), or undefined when there is no way. A join costs its length in all three. A
way whose behavior says it cannot be crossed now is not taken.

**The bake.** `graphOf(w, name)` makes a graph from the space by its `bake`: `area` `[x0, z0, x1, z1]`,
the play area the graph stops at; `clearance` metres kept from every solid; `around`, the corners that
ring a round solid; and whatever the `link` mod reads. Each solid's footprint, grown by the clearance,
is a block, a place is put at each of its corners, and two places are joined by a line where the
straight walk between them crosses no block and the ground lets it be walked, its word and cost in its
data. `bake(manager, scene)`
(`nav3d.bake.ts`) boots a game's manager on node and writes each such graph to its file. Before it
boots, it hands the loader an empty graph for every graph a bake makes, in every scene of the manager,
whose file is not on disk yet, so baking one scene never stops on another scene's graph not yet made.

`wordOf(way)` is a way's word, `pointsOf(way)` its shape's points from its first end to its last, and
`lengthOf(way)` its length along its shape, a way's cost when its data gives none (terrain3d's
`ground` behavior uses it).

## Using it

1. List the graph in the scene's catalogue and in `world.nav3d.graphs`:

   ```json
   "loader": { "assets": { "yardNav": { "type": "json", "url": "/games/<game>/assets/yard.nav.json", "preload": true } } },
   "nav3d": {
     "graphs": { "yard": { "asset": "yardNav", "bake": { "area": [-30, -30, 30, 30], "clearance": 0.5, "around": 8, "sample": 1, "slope": 0.6, "wade": 0.4 } } },
     "mods": { "solids": ["shapes3d"], "height": "terrain3d", "link": "terrain3d", "behaviors": ["terrain3d"] }
   }
   ```

2. Bake it from the game's bake file, `assets/<game>.bake.ts`, and run `yarn bake <game>`:

   ```ts
   import { bake } from '#plugins/nav3d/nav3d.bake.ts'
   export default async () => { await bake(new URL('../<game>.scene.json', import.meta.url), '<scene>') }
   ```

   Move a wall or change the ground, and bake again.
3. Ask it from a rule: `route(w, 'yard', [x, y, z], 'kitchen', who)`, and walk the body to each step's
   `at` in turn, along its `course`, doing what the step's way's data says. npc3d does this for its NPCs
   with `world.npc3d.mods: { route: 'nav3d' }`, over the scene's one graph: a scene whose
   `world.nav3d.graphs` names none, or more than one, throws.
4. To see the graphs, list `nav3d` before `render3d` and turn on its `graphs` flag in `dev.html`. Each
   way is drawn as a line, a spline along its curve, each place as a point lifted off its ground along
   its up, and a place that gives a `normal` has a short line along it. A graph is drawn again when its
   file is written again.

A graph a level's generator writes needs no `bake`: the generator writes the file, its places and ways
with whatever data each needs, and a plugin that brings a word whose ways cost something else now
delivers its behavior.

## Plugins it works with

- **shapes3d**: `shapes3d.nav3d.ts`, its shapes as the bake's `solids`; its point, line and spline, the
  graph's places and ways; and its drawn spline, a spline way's length.
- **npc3d**: `nav3d.npc3d.ts`, the route npc3d's people walk, a step over a spline way as its spline,
  and a step with an up as a leg with its `normal`, which a crowd3d person stands on.
- **terrain3d**: `terrain3d.nav3d.ts`, the ground's `height`, whether a walk over it is a `link`, and
  the `ground` word's behavior.
- **loader**: the graph files.
- **render3d**: the browser half draws on its scene.
- **math**: deterministic maths.

## Keywords

navigation, pathfinding, path finding, routes, route, waypoints, nav graph, navigation graph, node graph,
A*, Dijkstra, visibility graph, bake, navmesh, rooms, doors, levels, stairs, spline, course, curved
stair, one-way, go to, places, ways, shapes, data, who, staff only, `route`, `graphOf`, `bake`,
`world.nav3d`
