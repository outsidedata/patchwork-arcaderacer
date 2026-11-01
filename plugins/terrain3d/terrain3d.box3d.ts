// terrain3d's mod for box3d (`addons/scenemanager`'s mods). A scene with
// `world.box3d.mods: { ground: 'terrain3d' }` gives box3d this `ground`.
//
// `ground(w, [i, j])` is chunk [i, j] of the land as a box3d Static: one height field of
// `world.box3d.chunk.count` heights a side, `world.box3d.chunk.cell` metres apart, each terrain3d's
// heightAt there. A chunk spans (count - 1)·cell metres, so chunk [i, j]'s corner is at i and j times
// that, and neighbouring chunks share the heights along their edge.
import type { W } from '#engine/engine.ts'
import type { Static } from '#plugins/box3d/box3d.sim.ts'
import { heightAt } from './terrain3d.sim.ts'

export function ground(w: W, [i, j]: number[]): Static {
  const { count, cell } = w.world.box3d.chunk as { count: number; cell: number }
  const span = (count - 1) * cell, x = i * span, z = j * span
  const heights: number[] = []
  for (let b = 0; b < count; b++) for (let a = 0; a < count; a++) heights.push(heightAt(w, x + a * cell, z + b * cell))
  return { pos: [x, 0, z], rot: [0, 0, 0, 1], shapes: [{ heightField: { heights, countX: count, countZ: count, scale: [cell, 1, cell] } }] }
}
