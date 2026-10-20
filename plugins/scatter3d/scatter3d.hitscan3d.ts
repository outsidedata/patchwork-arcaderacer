// scatter3d's mod for hitscan3d (`addons/scenemanager`'s mods). A scene with
// `world.hitscan3d.mods: { solids: 'scatter3d' }` stops a shot at a trunk or a boulder: each solid
// instance stands on the ground under its centre, `tall` high, or without end for a row that gives
// none, placed on the ground `world.scatter3d.mods.ground` names.
//
// `solids(w, from, dir, far)` is `{ x, z, radius, base, tall? }` for every solid instance whose circle
// the line's path over the ground crosses within `far`: its centre within its radius of that path,
// `base` the ground's height under its centre. The line is asked in lengths of the largest cell of
// the scene's packs, each length's solids gathered round its middle, so a long line asks only the
// cells it crosses.
import type { W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { placed, solids as over, type Scatter } from './scatter3d.sim.ts'

export function solids(w: W, from: number[], dir: number[], far: number) {
  const ground = placed(w)
  const cell = Math.max(...Object.values((w.world.scatter3d as Scatter).packs).map(p => p.cell))
  // The path over the ground, from (x0, z0) along (dx, dz) for 0 ≤ s ≤ 1.
  const x0 = from[0], z0 = from[2], dx = dir[0] * far, dz = dir[2] * far, ll = dx * dx + dz * dz
  const off = (x: number, z: number) => {
    const s = ll > 0 ? Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / ll)) : 0
    return math.hypot(x - x0 - dx * s, z - z0 - dz * s)
  }
  const out: { x: number; z: number; radius: number; base: number; tall?: number }[] = []
  const seen = new Set<string>()
  for (let a = 0; a < far; a += cell) {
    const b = Math.min(a + cell, far), m = (a + b) / 2
    const reach = math.hypot(dir[0], dir[2]) * (b - a) / 2
    for (const s of over(w, x0 + dir[0] * m, z0 + dir[2] * m, reach, ground)) {
      const key = `${s.x} ${s.z}`
      if (seen.has(key)) continue
      seen.add(key)
      if (off(s.x, s.z) <= s.radius) out.push({ ...s, base: ground.height(s.x, s.z) })
    }
  }
  return out
}
