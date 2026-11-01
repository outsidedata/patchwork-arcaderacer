// tilemap's mod for box2d (`addons/scenemanager`'s mods). A scene with
// `world.box2d.mods: { ground: 'tilemap' }` gives box2d this `ground`.
//
// `ground(w, [i, j])` is chunk [i, j] of the level as a box2d Static: every collision shape of every
// tile whose cell is one of the `world.box2d.chunk.count` × `count` cells from [i·count, j·count],
// with the tilemap row's `edits` in them (tilemap's `shapes`), each a polygon, and a one-way one's
// `oneWay` up the rows, [0, -1], since a map's y grows down them. A cell is one of Box2D's metres,
// so the scene's gravity, in cells, points down the rows along +y. A tile's shape of more points
// than Box2D's polygon holds is refused by box2d, saying so. box2d builds a chunk the first step it
// is listed, so an edit to a cell of a chunk the world holds reaches it when the rule lists the
// chunk again after leaving it out for a step.
import type { W } from '#engine/engine.ts'
import type { Static } from '#plugins/box2d/box2d.sim.ts'
import { tiled } from '#plugins/loader/loader.sim.ts'
import { shapes } from './tilemap.sim.ts'

export function ground(w: W, [i, j]: number[]): Static {
  const { count } = w.world.box2d.chunk as { count: number }
  const row = w.find('tilemap')
  const box = { x: i * count, y: j * count, w: count, h: count }
  return {
    pos: [0, 0], rot: [1, 0],
    shapes: shapes(tiled(w, w.world.tilemap.file), row.data.edits, box).map(s => ({ polygon: { points: s.pts.flat() }, ...(s.oneway ? { oneWay: [0, -1] as [number, number] } : {}) })),
  }
}
