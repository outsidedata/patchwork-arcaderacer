// dismember3d's mod for box3dvehicle (`addons/scenemanager`'s mods). A scene with
// `world.box3dvehicle.mods: { strike: 'dismember3d' }` has a car crush a body that comes apart (a
// row of a kind `world.dismember3d.kinds` lists) where a round would cut it: the car's `Struck`
// (`what: 'car'`) takes off the arm and the thigh, each with every segment below it, on the side of
// the body the `part` it met is on (a part ending `L` its left, `R` its right), or both thighs for a
// part on neither side (the head), each a piece as `lose` cuts it (`dismember3d.sim.ts`). Then the
// body dies (ragdoll3d's `die`), thrown along the way the car goes at its `speed`, from the height
// the car met it, and lies limp with what is left of it. A limp body is crushed no more, and cut no
// more: `hit` and `lose` leave it, and hitscan3d hands no body lying `off`.
//
// Every other row a car meets is struck as hitscan3d strikes it: its `hit` act called with the
// `Struck` (`hitscan3d.box3dvehicle.ts`).
import type { Row, W } from '#engine/engine.ts'
import { strike as hurt, type Struck } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { die } from '#plugins/ragdoll3d/ragdoll3d.sim.ts'
import { lose } from './dismember3d.sim.ts'

// The segments a car crushes, by the side of the part it met.
const CRUSHED: Record<'L' | 'R' | 'none', string[]> = { L: ['armL', 'uplegL'], R: ['armR', 'uplegR'], none: ['uplegL', 'uplegR'] }

export function strike(w: W, row: Row, struck: Struck) {
  if (!(row.kind in w.world.dismember3d.kinds)) return hurt(w, row, struck)
  const d = row.data
  if (d.limp) return
  const end = struck.part?.slice(-1)
  for (const segment of CRUSHED[end === 'L' || end === 'R' ? end : 'none']) lose(w, row, segment)
  const l = math.hypot(struck.dir[0], struck.dir[2])
  die(w, row, { dir: l > 0 ? [struck.dir[0] / l, struck.dir[2] / l] : [0, 0], speed: struck.speed as number, height: struck.point[1] - d.pos[1] })
}
