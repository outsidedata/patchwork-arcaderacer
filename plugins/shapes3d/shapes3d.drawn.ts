// shapes3d's shapes as a page draws them this frame, for its mods that hand them to what is moved as the
// frame is drawn (`shapes3d.gpgpu3d.ts`, `shapes3d.fabric3d.ts`).
//
// Between the steps. A shape a rule moves (`move`) is drawn between where the last two steps left it, and
// so is what `drawn(plugins)` hands back: each box, plane, hyperplane and cylinder's place and turn as the
// page's last two steps had them, `wire.between` of the way from the one to the other, its place in a
// straight line and its turn the short way round, as render3d draws the object solids draws it by. So what
// is held to a moving shape, or lies on one, stays on the shape as it is drawn, not a step ahead of it.
// With no `between`, each is where its row has it. It reads the shapes off the rows this page holds (and
// the files `world.shapes3d.shapes` names), and may be asked any number of times a frame.
import type { Row, W } from '#engine/engine.ts'
import type { Plugins, Wire } from '#engine/browser.ts'
import { shapes, type Placed } from './shapes3d.sim.ts'

// The words that stand somewhere and are turned: every word but `triangles`.
export const STOOD = ['box', 'plane', 'hyperplane', 'cylinder']

export type Stood = { pos: number[]; yaw?: number; rot?: number[] }
// Each page's shapes as its last two steps had them, by the shape's id, and the step the newer is of.
const kept = new WeakMap<Wire, { n: number; shapes: Map<number, { was: Stood; now: Stood }> }>()

const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI))
// `f` of the way from one standing to another: the place in a straight line, the turn the short way round.
function between(was: Stood, now: Stood, f: number): Stood {
  const pos = now.pos.map((v, i) => was.pos[i] + (v - was.pos[i]) * f)
  if (now.rot && was.rot) {
    const a = was.rot, b = now.rot
    const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1
    const q = a.map((v, i) => v + (b[i] * sign - v) * f)
    const l = Math.hypot(q[0], q[1], q[2], q[3])
    return { pos, rot: q.map(v => v / l) }
  }
  return { pos, yaw: (was.yaw ?? 0) + wrap((now.yaw ?? 0) - (was.yaw ?? 0)) * f }
}

export function drawn(plugins: Plugins): Placed[] {
  const wire = plugins.wire
  const placed = shapes({
    world: wire.scene.world ?? {},
    all: (kind: string) => wire.rows.filter(r => r.kind === kind),
    get: (id: number) => wire.rows.find(r => r.id === id),
    find: (kind: string, pred: (r: Row) => boolean = () => true) => wire.rows.find(r => r.kind === kind && pred(r)),
  } as unknown as W)
  let had = kept.get(wire)
  if (!had) kept.set(wire, had = { n: wire.n, shapes: new Map() })
  const stepped = had.n !== wire.n
  had.n = wire.n
  const here = new Set<number>()
  const out = placed.map(p => {
    const s = p.shape[p.word] as Stood
    const stands: Stood = { pos: s.pos, ...(s.rot ? { rot: s.rot } : { yaw: s.yaw }) }
    here.add(p.id)
    let k = had.shapes.get(p.id)
    if (!k) had.shapes.set(p.id, k = { was: stands, now: stands })
    else if (stepped) k = had.shapes.set(p.id, { was: k.now, now: stands }).get(p.id)!
    else k.now = stands
    if (wire.between === undefined || !STOOD.includes(p.word)) return p
    return { ...p, shape: { [p.word]: { ...s, ...between(k.was, k.now, wire.between) } } }
  })
  for (const id of [...had.shapes.keys()]) if (!here.has(id)) had.shapes.delete(id)
  return out
}
