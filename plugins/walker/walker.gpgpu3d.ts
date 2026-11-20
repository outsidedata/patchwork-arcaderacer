// walker's mod for gpgpu3d (`addons/scenemanager`'s mods), the page's: every walking body as a thing on the
// GPU. A scene with `world.gpgpu3d.mods: { things: ['walker'], behaviors: ['shapes3d'] }` has each body
// met by whatever asks gpgpu3d, and pressing the grass that names it (`walker.grass3d.ts`).
//
// `things(plugins, near)` hands back, for every row this page has whose kind walks (`world.walker.kinds`,
// by the kind its `as` names where it names one), is not limp and stands within `near.reach` of `near.at`
// on the ground, `{ cylinder: { pos, radius, height } }`: an upright cylinder standing on its `pos`, its
// kind's `radius` round and `height` tall. A cylinder is shapes3d's word (`shapes3d.gpgpu3d.ts`), so the
// scene names shapes3d under `behaviors`.
import type { Plugins } from '#engine/browser.ts'
import type { Near, Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'
import { kindOf } from './walker.sim.ts'

export function things(plugins: Plugins, near: Near): Thing[] {
  const kinds = plugins.wire.scene.world!.walker?.kinds as Record<string, { radius: number; height: number }> | undefined
  if (!kinds) return []
  const out: Thing[] = []
  for (const r of plugins.wire.rows) {
    const k = kinds[kindOf(r)]
    if (!k || r.data.limp || !Array.isArray(r.data.pos)) continue
    const pos = r.data.pos as number[]
    if (Math.hypot(pos[0] - near.at[0], pos[2] - near.at[2]) <= near.reach) out.push({ cylinder: { pos, radius: k.radius, height: k.height } })
  }
  return out
}
