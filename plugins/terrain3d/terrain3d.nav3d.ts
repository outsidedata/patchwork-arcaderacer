// terrain3d's mod for nav3d (`addons/scenemanager`'s mods). A scene with `world.nav3d.mods: { height:
// 'terrain3d', link: 'terrain3d', behaviors: ['terrain3d'] }` has nav3d's bake lay its graph on the land,
// and its routes cross the ways it made.
//
// `height(w, x, z)` is the ground under a place, `rawAt`: the bed, under water too. `link(w, a, b,
// rules)` walks the straight line from `a` to `b` [x, z] over the ground in equal pieces no longer than
// the bake's `sample` metres, from end to end, and hands back undefined when the water over any point
// of it is deeper than `wade` metres (`depthAt`), or any piece rises or falls more than `slope` metres a
// metre across; else the way, of the word `ground`: `{ cost, ground: {} }`, `cost` the metres walked,
// each piece its length over the ground, which the bake writes as the line's `data.nav3d.cost`.
// `behaviors()` delivers nav3d `ground`, whose cost to cross is the way's own, `data.nav3d.cost`, or its
// length along its shape where it gives none: the land never changes. The bake's rules this reads, beside nav3d's own:
//   sample  metres, above 0
//   slope   metres of rise a metre across, 0 or more
//   wade    metres of water, 0 or more
// A rule of the wrong value throws, naming it.
import type { W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { lengthOf, type Behavior, type Rules } from '#plugins/nav3d/nav3d.sim.ts'
import { depthAt, rawAt } from './terrain3d.sim.ts'

export const height = (w: W, x: number, z: number) => rawAt(w, x, z)

export function link(w: W, a: number[], b: number[], rules: Rules) {
  const { sample, slope, wade } = rules as Rules & { sample: number; slope: number; wade: number }
  if (!(Number.isFinite(sample) && sample > 0)) throw new Error('terrain3d\'s nav3d link: the bake\'s sample is not a number above 0')
  if (!(Number.isFinite(slope) && slope >= 0)) throw new Error('terrain3d\'s nav3d link: the bake\'s slope is not a number of 0 or more')
  if (!(Number.isFinite(wade) && wade >= 0)) throw new Error('terrain3d\'s nav3d link: the bake\'s wade is not a number of 0 or more')
  const across = math.hypot(b[0] - a[0], b[1] - a[1])
  const pieces = Math.max(1, Math.ceil(across / sample))
  const run = across / pieces
  let cost = 0
  let was = rawAt(w, a[0], a[1])
  if (depthAt(w, a[0], a[1]) > wade) return undefined
  for (let i = 1; i <= pieces; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / pieces, z = a[1] + ((b[1] - a[1]) * i) / pieces
    if (depthAt(w, x, z) > wade) return undefined
    const y = rawAt(w, x, z)
    if (run > 0 && Math.abs(y - was) / run > slope) return undefined
    cost += math.hypot(run, y - was)
    was = y
  }
  return { cost, ground: {} }
}

export const behaviors = (): Record<string, Behavior> => ({ ground: (_w, _data, way) => way.data?.nav3d?.cost ?? lengthOf(way) })
