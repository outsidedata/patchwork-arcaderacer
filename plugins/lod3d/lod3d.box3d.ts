// lod3d's mod for box3d (`addons/scenemanager`'s mods). A scene with `world.box3d.mods: { props:
// ['lod3d'] }` makes lod3d's solid instances (`lod3d.walker.ts`'s `solids`), the trunks and the boulders,
// fixed things box3d's bodies run into, so the trunk a car hits is the trunk a seat sees.
//
// `props(w, [i, j])` is every solid instance whose middle is in box3d's chunk [i, j] (the square
// (count − 1)·cell metres a side, `world.box3d.chunk`, whose corner is at i and j times that) as one box3d
// Static at the chunk's corner, or undefined when the chunk has none. Each stands from its foot, `base`,
// as tall as its `tall`, its radius its `radius`: an upright capsule from its foot to `tall` − radius above
// it, so its rounded top is `tall` up, or, where `tall` is no more than the radius, a ball whose top is
// `tall` up, sunk into what it stands on, a boulder's dome. A solid row with no `tall` stands without
// end, which a body cannot be: it throws, naming where it stands.
import type { W } from '#engine/engine.ts'
import type { Shape, Static } from '#plugins/box3d/box3d.sim.ts'
import { solids } from './lod3d.walker.ts'

export function props(w: W, [i, j]: number[]): Static | undefined {
  const { count, cell } = w.world.box3d.chunk as { count: number; cell: number }
  const span = (count - 1) * cell, x0 = i * span, z0 = j * span
  const inside = solids(w, x0 + span / 2, z0 + span / 2, (span * Math.SQRT2) / 2)
    .filter(s => s.x >= x0 && s.x < x0 + span && s.z >= z0 && s.z < z0 + span)
  if (!inside.length) return undefined
  const shapes: Shape[] = inside.map(s => {
    if (s.tall === undefined) throw new Error(`lod3d's solid at [${s.x}, ${s.z}] has no tall, and box3d stands each prop as tall as its row's tall: give every solid row of world.lod3d.layers a tall`)
    const h = s.base, x = s.x - x0, z = s.z - z0, top = h + s.tall - s.radius
    return top > h
      ? { capsule: { center1: [x, h, z], center2: [x, top, z], radius: s.radius } }
      : { sphere: { center: [x, top, z], radius: s.radius } }
  })
  return { pos: [x0, 0, z0], rot: [0, 0, 0, 1], shapes }
}
