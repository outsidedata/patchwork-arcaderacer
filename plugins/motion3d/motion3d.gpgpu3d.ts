// motion3d's mod for gpgpu3d (`addons/scenemanager`'s mods), the page's: the bodies motion3d draws as things
// on the GPU. A scene with `world.gpgpu3d.mods: { things: ['motion3d'], behaviors: ['anim'] }`, and motion3d
// listed, has every body of a kind that has capsules (`world.motion3d.kinds.<kind>.capsules`, and those the
// `capsules` mod gives the kind, item3d's off its bodies sheet: `motion3d.play.ts`'s `capsulesOf`) met by
// whatever asks gpgpu3d: a cape draped on the body that wears it, a particle bounced off it.
//
// `things(plugins, near)` hands back, for every row motion3d draws whose kind has capsules and whose
// model is made, each capsule whose middle is within `near.reach` of `near.at`: `{ capsule: { key, a, b,
// radius } }`, `key` its row and its place in the list, `a` and `b` where its two bones stand as they are
// when it is asked, bent, aimed and carried as motion3d left them; a ball, `{ bone, at, radius }`, is a
// capsule whose two ends are the one point its bone carries. A capsule is anim's word
// (`plugins/anim/anim.gpgpu3d.ts`), so the scene names anim under `behaviors`. A capsule that names a bone
// the body has none of throws, naming the kind and the bone.
import type { Plugins } from '#engine/browser.ts'
import { carried, type Near, type Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'
import type { Numbers } from './motion3d.sim.ts'
import { capsulesOf, playKind } from './motion3d.play.ts'

export function things(plugins: Plugins, near: Near): Thing[] {
  const kinds = (plugins.wire.scene.world?.motion3d as Numbers | undefined)?.kinds ?? {}
  const out: Thing[] = []
  for (const r of plugins.wire.rows) {
    const of = playKind(r)
    if (!kinds[of] || !plugins.motion3d.model(r.id)) continue
    const list = capsulesOf(plugins, of)
    const end = (on: string, at = [0, 0, 0]) => {
      const bone = plugins.motion3d.socket(r.id, on)
      if (!bone) throw new Error(`motion3d: a capsule of the kind ${of} runs to the bone ${on}, which the body has none of`)
      return carried(bone.matrixWorld.elements, at)
    }
    list.forEach((c, i) => {
      const a = 'bone' in c ? end(c.bone, c.at) : end(c.from), b = 'bone' in c ? a : end(c.to)
      if (Math.hypot((a[0] + b[0]) / 2 - near.at[0], (a[1] + b[1]) / 2 - near.at[1], (a[2] + b[2]) / 2 - near.at[2]) <= near.reach)
        out.push({ capsule: { key: `${r.id} ${i}`, a, b, radius: c.radius } })
    })
  }
  return out
}
