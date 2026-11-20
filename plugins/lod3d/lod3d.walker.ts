// lod3d's mod for walker (`addons/scenemanager`'s mods). A scene with `world.walker.mods: { fixed:
// 'lod3d' }` (or `solids: 'lod3d'`) has walker's bodies walk round lod3d's solid instances, the ones of a
// row that gives `solid`, asked of the tiles the server's behaviors fill, so the trunk a body walks round
// is the trunk a seat sees.
//
// A row's numbers it reads: `solid`, each instance a circle solid·size metres round; `tall`, how high it
// stands from its foot, tall·size, or without end where it gives none. `world.lod3d.widest` is the widest
// circle any instance has, so a question reaches the tiles of every instance whose circle may touch it.
//
// `solids(w, x, z, r)` is `{ x, z, radius, base, tall? }`, `base` its foot's height, for every such
// instance whose circle reaches within r of (x, z) across x and z, the tiles of each truth remembered,
// `world.lod3d.remember` of them, the one asked longest ago forgotten first, and every one forgotten when
// a `surfaces` mod hands a list other than the one it handed before. `fixed` is the same: the instances never move, so walker asks once a tile
// of an agent's map; `solids` is asked every call.
import type { W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { behaviorsOf, layersOf, named, tile, type Behaviors, type Lod3d, type Surface, type Thing } from './lod3d.sim.ts'

export type Solid = { x: number; z: number; radius: number; base: number; tall?: number }
type Numbers = Lod3d & { widest: number; remember: number }

type Memo = { lod3d: object; from: Surface[][]; surfaces: Surface[]; behaviors: Behaviors; tiles: Map<string, Thing[]> }
const memos = new WeakMap<W, Memo>()

export function solids(w: W, x: number, z: number, r: number): Solid[] {
  const s = w.world.lod3d as Numbers
  if (!(s.widest >= 0)) throw new Error(`lod3d widest ${s.widest} is not a radius of at least 0 metres`)
  if (!(Number.isInteger(s.remember) && s.remember > 0)) throw new Error(`lod3d remember ${s.remember} is not a whole number above 0`)
  // Each `surfaces` mod hands the same list while its surfaces stand (`lod3d.sim.ts`), so a list handed
  // anew is a change, and only then are the surfaces, the behaviors and the tiles made again.
  const from = named<(w: W) => Surface[]>(w.world, 'surfaces').map(f => f(w))
  let m = memos.get(w)
  if (!m || m.lod3d !== s || m.from.length !== from.length || m.from.some((l, k) => l !== from[k])) {
    memos.set(w, (m = { lod3d: s, from, surfaces: from.flat(), behaviors: behaviorsOf(w.world), tiles: new Map() }))
  }
  const { surfaces, behaviors } = m
  const out: Solid[] = []
  const layers = layersOf(s)
  for (const [name, l] of Object.entries(layers)) {
    if (!Object.values(l.rows).some(row => row.solid !== undefined)) continue
    const R = r + s.widest
    const i0 = Math.floor((x - R) / l.cell), i1 = Math.floor((x + R) / l.cell), j0 = Math.floor((z - R) / l.cell), j1 = Math.floor((z + R) / l.cell)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const things = tile(name, layers, i, j, surfaces, behaviors, { w }, m.tiles)
        while (m.tiles.size > s.remember) m.tiles.delete(m.tiles.keys().next().value!)
        for (const t of things) {
          const row = l.rows[t.row]
          if (row?.solid === undefined) continue
          const radius = row.solid * t.size
          if (math.hypot(t.at[0] - x, t.at[2] - z) > r + radius) continue
          out.push(row.tall === undefined ? { x: t.at[0], z: t.at[2], radius, base: t.at[1] } : { x: t.at[0], z: t.at[2], radius, base: t.at[1], tall: row.tall * t.size })
        }
      }
    }
  }
  return out
}

export const fixed = solids
