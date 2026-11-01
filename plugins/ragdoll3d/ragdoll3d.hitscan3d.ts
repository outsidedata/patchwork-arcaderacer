// ragdoll3d's mod for hitscan3d (`addons/scenemanager`'s mods). A scene with
// `world.hitscan3d.mods: { bodies: 'ragdoll3d' }` has a shot meet a standing body's bones: every row
// of a kind `world.anim.kinds` lists whose rig carries the bake's `ends` for its model is the body
// `capsules` makes of it (`ragdoll3d.sim.ts`), one capsule a bone, each part named as its bone, as it
// stands this step of its clip. A row anim has played no clip on yet stands nowhere a bone could be
// read, and is none of these.
//
// Every other body comes from the `bodies` ragdoll3d is itself handed, `world.ragdoll3d.mods: {
// bodies: '<a>' }` (walker's, `walker.hitscan3d.ts`), none when it names none; a body that mod hands
// with the id of one of these is this one, never both.
import type { Row, W } from '#engine/engine.ts'
import type { Body } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import { mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { numbersOf, rigOf } from '#plugins/anim/anim.sim.ts'
import { capsules } from './ragdoll3d.sim.ts'

type Bodies = (w: W) => Body[]

// Whether a kind's rig carries the bake's ends for its model.
function measured(w: W, kind: string): boolean {
  const k = numbersOf(w).kinds[kind]
  return !!rigOf(w, kind).ends?.[k.model]
}

// Each anim kind with ends, found once per world: the rigs are the scene's, read once.
const found = new WeakMap<object, string[]>()

function kindsOf(w: W): string[] {
  let kinds = found.get(w.world)
  if (!kinds) found.set(w.world, kinds = Object.keys(numbersOf(w)?.kinds ?? {}).filter(kind => measured(w, kind)))
  return kinds
}

const bonesOf = (w: W, r: Row): Body => ({
  id: r.id, kind: r.kind, pos: r.data.pos,
  shapes: capsules(w, r).map(c => ({ part: c.bone, capsule: { a: c.a, b: c.b, radius: c.radius } })),
})

export function bodies(w: W): Body[] {
  const mine = kindsOf(w).flatMap(kind => w.all(kind)).filter(r => r.data.clip).map(r => bonesOf(w, r))
  const ids = new Set(mine.map(b => b.id))
  const rest = mod<Bodies>(w.world, 'ragdoll3d', 'bodies')?.(w) ?? []
  return [...rest.filter(b => !ids.has(b.id)), ...mine]
}
