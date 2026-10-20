// cover3d: where a body can stand out of a threat's sight behind the solids standing on the ground.
// It has a server half only: a rule asks it, and nothing is drawn.
//
// The solids are asked of another plugin through a mod (`addons/scenemanager`), the one
// `world.cover3d.mods.solids` names: `(w, x, z, r) → { x, z, radius, tall? }[]`, every solid whose
// circle reaches within r of (x, z), `tall` how high it stands over the ground, without end when it
// has none (`scatter3d.cover3d.ts`). cover3d has no row and no numbers of its own: a rule hands every
// number with the question.
//
// `spots(w, at, threat, { reach, radius, low })` is every place within `reach` metres of `at` that a
// solid hides from `threat`, nearest to `at` first: for each solid at least `low` metres tall whose
// centre is within `reach`, the point on the line from `threat` through its centre, past it by its
// radius and `radius` more (the body's), so the body stands against the solid's far side. Each is
// `{ at: [x, z], tall, far }`, `tall` the solid's height and `far` the metres from `at`. The line from
// the threat to that point passes through the solid's middle, so a line from the threat at any height
// under `tall` over the ground meets the solid first; the ground between is not asked. `at` and
// `threat` are [x, z].
import type { W } from '#engine/engine.ts'
import * as math from '#plugins/math/math.sim.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'

export type Solid = { x: number; z: number; radius: number; tall?: number }
export type Spot = { at: number[]; tall: number; far: number }
type Solids = (w: W, x: number, z: number, r: number) => Solid[]

function solidsOf(w: W): Solids {
  const solids = mod<Solids>(w.world, 'cover3d', 'solids')
  if (!solids) throw new Error('cover3d is asked for cover, and the scene names no world.cover3d.mods.solids')
  return solids
}

export function spots(w: W, at: number[], threat: number[], opts: { reach: number; radius: number; low: number }): Spot[] {
  const out: Spot[] = []
  for (const s of solidsOf(w)(w, at[0], at[1], opts.reach)) {
    const tall = s.tall ?? Infinity
    if (tall < opts.low || math.hypot(s.x - at[0], s.z - at[1]) > opts.reach) continue
    const dx = s.x - threat[0], dz = s.z - threat[1], l = math.hypot(dx, dz)
    if (l === 0) continue
    const off = s.radius + opts.radius
    const p = [s.x + (dx / l) * off, s.z + (dz / l) * off]
    out.push({ at: p, tall, far: math.hypot(p[0] - at[0], p[1] - at[1]) })
  }
  return out.sort((a, b) => a.far - b.far)
}
