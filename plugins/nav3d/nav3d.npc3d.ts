// nav3d's mod for npc3d (`addons/scenemanager`'s mods). A scene with `world.npc3d.mods: { route: 'nav3d' }` has its NPCs walk along nav3d's routes
// over the scene's graph, the one `world.nav3d.graphs` names; a scene that names none, or more than
// one, throws, naming them.
//
// `route(w, from, to)` is nav3d's `route` over that graph from `from` [x, y, z] to the place `to`
// [x, y, z]: the place of each of its steps in turn, [x, y, z], each place's at its height in the graph,
// the last of them `to`; a step over a spline way its spline instead, its points run the way the route
// crosses it, ending at the step's place; or undefined when there is no way. A step the graph gives an
// up (a place's `normal`) carries it: `{ at, normal }`, or the spline with its `normal`, the up at its
// end, so a person walks onto the ground of each place.
import type { W } from '#engine/engine.ts'
import type { Leg } from '#plugins/npc3d/npc3d.sim.ts'
import { route as way, type Step } from '#plugins/nav3d/nav3d.sim.ts'

function graphOf(w: W): string {
  const names = Object.keys(w.world.nav3d?.graphs ?? {})
  if (names.length !== 1) throw new Error(`npc3d's routes walk the scene's one graph, and world.nav3d.graphs names ${names.join(', ') || 'none'}`)
  return names[0]
}

function legOf(s: Step): Leg {
  if (!s.course || !('spline' in s.course)) return s.normal ? { at: s.at, normal: s.normal } : s.at
  const spline = { points: s.course.spline.points }
  return s.normal ? { spline, normal: s.normal } : { spline }
}

export const route = (w: W, from: number[], to: number[]): Leg[] | undefined => way(w, graphOf(w), from, to)?.map(legOf)
