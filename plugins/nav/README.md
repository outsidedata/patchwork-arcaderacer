# nav

Pathfinding on a grid: windowed A* that always returns a route (to the closest reachable cell when
the goal cannot be reached), a Dijkstra distance field that serves every mover heading for one goal,
line of sight for a body of a radius, and a route pulled straight into the fewest waypoints.

## Why use it

Use nav when enemies, units, pets or NPCs must find their way round walls: a top-down shooter's
monsters chasing the player, an RTS's units, a tower defence's creeps flowing to the base, a
roguelike's enemies, an NPC walking to a door. It is deterministic (one grid and one ask give one
route on every machine), so it can run in the rules and every seat agrees where everyone walks.

## How it works

nav has a server half only, no row and no numbers of its own: the window and the costs are the
caller's.

- `grid(across, down, blocked, sub, window)` describes a map of `across` × `down` cells, `blocked(c, r)`
  saying whether map cell [c, r] blocks (tilemap's `blocked`, say). Each map cell is `sub` × `sub` nav
  cells, so bodies can thread finer than the map. A step is to any of the eight neighbours, 1 along a
  row or column and √2 on a diagonal, taken only when both cells beside the diagonal are open, so no
  route cuts a corner.
- `path(g, from, to)` is A* inside a square `window` cells across centred on `from`, so a fine grid
  costs detail rather than time. A goal outside the window is clipped to its edge, and the mover asks
  again when it gets there. An unreachable goal returns the route to the closest cell reached, so a
  walled-off mover walks up to the wall. The estimate is octile distance; ties go to the cell reached
  first. Cells are numbered `c = y × w + x`; the route leaves out `from`.
- `field(g, goal, limit)` is the cost from every nav cell to `goal` by Dijkstra, Infinity beyond
  `limit`; `down(f, c)` is the next cell downhill toward the goal. One field moves a whole swarm.
- `at(g, point)` is the nav cell under a map point; `centre(g, c, radius?)` the middle of a nav cell,
  or with a radius the nearest point where a body of that radius touches no blocked cell.
- `sight(blocked, from, to, radius?)`: whether a straight line, or a body of `radius` along it (the
  middle line and one either side), crosses no blocking cell.
- `pull(route, blocked, radius?)`: the route pulled straight, keeping each time the furthest point the
  body can see.

`path` also runs over any graph the caller describes as `{ w, h, window, around(c) }`, `around`
yielding `[cell, cost]` steps.

## Using it

```ts
import { grid, at, path, centre, pull } from '#plugins/nav/nav.sim.ts'
import { blocked } from '#plugins/tilemap/tilemap.sim.ts'

const walls = (c: number, r: number) => blocked(map, edits, c, r)
const g = grid(map.width, map.height, walls, sub, window)
const route = path(g, at(g, me.data.pos), at(g, target))
const points = pull([me.data.pos, ...route.map(c => centre(g, c, radius))], walls, radius)
```

Keep the window and the sub-cells in the kind's definition.

## Plugins it works with

- **tilemap**: its `blocked` is what nav's `grid` reads.
- **mapgen** makes maps whose every walkable cell is reachable from every other.
- **math**: deterministic `hypot` and square roots.

## Keywords

pathfinding, A*, A star, navigation, grid navigation, flow field, distance field, Dijkstra,
vector field, swarm, chase, follow, route, waypoints, string pulling, path smoothing, line of sight,
octile, diagonal movement, corner cutting, sub-cells, top-down, RTS, tower defence, roguelike AI,
deterministic, `path`, `field`, `down`, `sight`, `pull`, `grid`
