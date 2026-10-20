// walker's mod for hitscan3d (`addons/scenemanager`'s mods). A scene with
// `world.hitscan3d.mods: { bodies: 'walker' }` has a shot meet walker's bodies: every row of a kind
// `world.walker.kinds` lists, at its `pos`, its feet, one upright cylinder of its kind's `radius` and
// `height`, its part named as its kind.
import type { W } from '#engine/engine.ts'
import type { Body } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import type { Numbers } from './walker.sim.ts'

export function bodies(w: W): Body[] {
  const kinds = w.world.walker.kinds as Record<string, Numbers>
  return Object.entries(kinds).flatMap(([kind, k]) => w.all(kind).map(r => {
    const pos = r.data.pos as number[]
    return { id: r.id, kind, pos, shapes: [{ part: kind, cylinder: { pos, radius: k.radius, height: k.height } }] }
  }))
}
