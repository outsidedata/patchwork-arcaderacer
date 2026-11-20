// lod3d's mod for ragdoll3d (`addons/scenemanager`'s mods). A scene with `world.ragdoll3d.mods: { solids:
// 'lod3d' }` pushes ragdoll3d's limp bodies out of lod3d's solid instances, the trunks a seat sees.
//
// `solids(plugins, x, z, r)` is `{ x, z, radius, base, tall? }` for every instance this page's lod3d holds,
// of a row that gives `solid`, whose circle reaches within r of (x, z) across x and z: its radius
// solid·size, its foot its `base`, `tall`·size high where its row gives one. None before lod3d holds any.
import type { Plugins } from '#engine/browser.ts'
import type { Live } from './lod3d.plugin.ts'
import type { Solid } from './lod3d.walker.ts'

export function solids(plugins: Plugins, x: number, z: number, r: number): Solid[] {
  const out: Solid[] = []
  for (const l of Object.values(plugins.lod3d.layers() as Record<string, Live>)) {
    const rows = l.layer.rows
    if (!Object.values(rows).some(row => row.solid !== undefined)) continue
    for (const h of l.held.values()) {
      for (const t of h.things) {
        const row = rows[t.row]
        if (row?.solid === undefined) continue
        const radius = row.solid * t.size
        const [tx, ty, tz] = t.at
        if (Math.hypot(tx - x, tz - z) > r + radius) continue
        out.push(row.tall === undefined ? { x: tx, z: tz, radius, base: ty } : { x: tx, z: tz, radius, base: ty, tall: row.tall * t.size })
      }
    }
  }
  return out
}
