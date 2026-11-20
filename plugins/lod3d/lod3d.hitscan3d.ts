// lod3d's mod for hitscan3d (`addons/scenemanager`'s mods). A scene with `world.hitscan3d.mods: {
// solids: 'lod3d' }` stops a shot at a trunk or a boulder: each solid instance (`lod3d.walker.ts`'s
// `solids`) stands from its foot, `tall` high, or without end for a row that gives none.
//
// `solids(w, from, dir, far)` is `{ x, z, radius, base, tall? }` for every solid instance whose circle the
// line's path across x and z crosses within `far`: its centre within its radius of that path. The line is
// asked in lengths of the largest tile of the scene's layers, each length's solids gathered round its
// middle, so a long line asks only the tiles it crosses.
import type { W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { layersOf, type Lod3d } from './lod3d.sim.ts'
import { solids as over, type Solid } from './lod3d.walker.ts'

export function solids(w: W, from: number[], dir: number[], far: number): Solid[] {
  const cell = Math.max(...Object.values(layersOf(w.world.lod3d as Lod3d)).map(l => l.cell))
  const x0 = from[0], z0 = from[2], dx = dir[0] * far, dz = dir[2] * far, ll = dx * dx + dz * dz
  const off = (x: number, z: number) => {
    const s = ll > 0 ? Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / ll)) : 0
    return math.hypot(x - x0 - dx * s, z - z0 - dz * s)
  }
  const out: Solid[] = []
  const seen = new Set<string>()
  for (let a = 0; a < far; a += cell) {
    const b = Math.min(a + cell, far), m = (a + b) / 2
    const reach = (math.hypot(dir[0], dir[2]) * (b - a)) / 2
    for (const s of over(w, x0 + dir[0] * m, z0 + dir[2] * m, reach)) {
      const key = `${s.x} ${s.z} ${s.base}`
      if (seen.has(key)) continue
      seen.add(key)
      if (off(s.x, s.z) <= s.radius) out.push(s)
    }
  }
  return out
}
