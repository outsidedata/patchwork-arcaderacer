// puppet3d's mod for gpgpu3d (`addons/scenemanager`'s mods), the page's: the bodies puppet3d draws as things
// on the GPU. A scene with `world.gpgpu3d.mods: { things: ['puppet3d'], behaviors: ['anim'] }`, and puppet3d
// listed, has every body of a kind `world.puppet3d.capsules` names met by whatever asks gpgpu3d: a mane
// lying on a horse's neck, a particle bounced off it.
//
// `world.puppet3d.capsules` is `{ <kind>: [{ from, to, radius }, { bone, at, radius }, …] }`: each a capsule
// `radius` metres round between the bones named `from` and `to`, or a ball carried by the bone named
// `bone`, `at` [x, y, z] metres in its frame. A bone is the first of the row's bodies' whose name ends
// with the name given.
//
// `things(plugins, near)` hands back, for every row puppet3d draws whose kind is named there and whose
// bodies are made, each one whose middle is within `near.reach` of `near.at`: `{ capsule: { key, a, b,
// radius } }`, `key` its row and its place in the list, `a` and `b` where its bones stand as they are when
// it is asked. A capsule is anim's word (`plugins/anim/anim.gpgpu3d.ts`), so the scene names anim under
// `behaviors`. One that names a bone the body has none of throws, naming the kind and the bone.
import type { SkinnedMesh } from 'three'
import type { Plugins } from '#engine/browser.ts'
import { carried, type Near, type Thing } from '#plugins/gpgpu3d/gpgpu3d.sim.ts'

type Capsule = { from: string; to: string; radius: number } | { bone: string; at: number[]; radius: number }

export function things(plugins: Plugins, near: Near): Thing[] {
  const capsules = (plugins.wire.scene.world!.puppet3d.capsules ?? {}) as Record<string, Capsule[]>
  const out: Thing[] = []
  for (const r of plugins.wire.rows) {
    const list = capsules[r.kind]
    if (!list) continue
    const bodies: SkinnedMesh[] = plugins.puppet3d.bodies(r.id)
    if (!bodies.length) continue
    const end = (on: string, at = [0, 0, 0]) => {
      const bone = bodies.flatMap(b => b.skeleton.bones).find(b => b.name.endsWith(on))
      if (!bone) throw new Error(`puppet3d capsules.${r.kind} runs to the bone ${on}, which the body has none of`)
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
