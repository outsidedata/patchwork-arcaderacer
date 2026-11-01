// terrain3d's mod for hitscan3d (`addons/scenemanager`'s mods). A scene with
// `world.hitscan3d.mods: { ground: 'terrain3d' }` stops a shot at the land.
//
// `ground(w, from, dir, far)` is where the line first reaches the ground, `ray`: `{ t, normal }`, t
// metres along unit `dir` and the land's normal there, over ± its analysis's `slopeStep`, as the
// land's `slope` is read; or undefined when it stays over the ground for `far` metres. A line
// starting under the ground meets it at once.
import type { W } from '#engine/engine.ts'
import { json } from '#plugins/loader/loader.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { normalAt, ray } from './terrain3d.sim.ts'

export function ground(w: W, from: number[], dir: number[], far: number) {
  const p = ray(w, from, dir, far)
  if (!p) return undefined
  const t = math.hypot(p[0] - from[0], p[1] - from[1], p[2] - from[2])
  const step = (json(w, w.world.terrain3d.field) as { analysis: { slopeStep: number } }).analysis.slopeStep
  return { t, normal: normalAt(w, p[0], p[2], step) }
}
