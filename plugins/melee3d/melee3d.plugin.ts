// melee3d's page half: each blade a body holds (`blades`, `melee3d.sim.ts`), drawn as a rod from its
// guard to its tip, `world.melee3d.show`'s colour and radius, over everything else, so it shows where
// the rows put a blade beside the sword the model draws; with `show.limbs`, each limb a body still has
// (`limbs`) as a line from bone to bone in that colour, and a limb a swing in play has met, named on
// any body's `struck`, in `show.struck`'s. A scene with no `show` draws nothing.
//
// Each rod and line is placed from the newest rows in its tick, as anim poses the bodies from them,
// and render3d draws all of them between the last two steps alike. It draws through render3d's scene.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import { blades, limbs } from './melee3d.sim.ts'

export function melee3d() {
  // Each body's rods, by blade, made the first time it holds that blade, and its limbs' lines.
  const rods = new Map<number, Map<string, THREE.Mesh>>()
  const lines = new Map<number, THREE.LineSegments>()
  let shape: { geometry: THREE.CylinderGeometry; material: THREE.MeshBasicMaterial; lines: THREE.LineBasicMaterial } | undefined

  const drop = (plugins: Plugins, id: number) => {
    for (const rod of rods.get(id)?.values() ?? []) plugins.render3d.scene.remove(rod)
    rods.delete(id)
    const l = lines.get(id)
    if (l) {
      plugins.render3d.scene.remove(l)
      l.geometry.dispose()
      lines.delete(id)
    }
  }

  return {
    tick(plugins: Plugins) {
      const numbers = plugins.wire.scene.world!.melee3d
      const show = numbers.show
      if (!show) return
      const T: typeof THREE = plugins.render3d.THREE
      // A rod one metre long along +y from its foot at the origin, stretched to each blade's length.
      shape ??= {
        geometry: new T.CylinderGeometry(show.radius, show.radius, 1, 8).translate(0, 0.5, 0),
        material: new T.MeshBasicMaterial({ color: show.colour, depthTest: false, transparent: true }),
        lines: new T.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }),
      }
      const up = new T.Vector3(0, 1, 0), along = new T.Vector3()
      const struck = new Set(plugins.wire.rows.flatMap(r => (r.data.swing ? (r.data.struck ?? []) as string[] : [])))
      const plain = new T.Color(show.limbs ?? 0), met = new T.Color(show.struck ?? show.limbs ?? 0)
      const live = new Set<number>()
      for (const row of plugins.wire.rows) {
        if (!numbers.kinds.includes(row.kind)) continue
        live.add(row.id)
        const held = blades(plugins.wire, row)
        let mine = rods.get(row.id)
        if (!mine) rods.set(row.id, mine = new Map())
        for (const [blade, rod] of mine) if (!held.some(b => b.blade === blade)) rod.visible = false
        for (const { blade, guard, tip } of held) {
          let rod = mine.get(blade)
          if (!rod) {
            rod = new T.Mesh(shape.geometry, shape.material)
            rod.renderOrder = 999
            rod.frustumCulled = false
            plugins.render3d.scene.add(rod)
            mine.set(blade, rod)
          }
          along.set(tip[0] - guard[0], tip[1] - guard[1], tip[2] - guard[2])
          const length = along.length()
          rod.visible = true
          rod.position.fromArray(guard)
          rod.quaternion.setFromUnitVectors(up, along.divideScalar(length))
          rod.scale.set(1, length, 1)
        }
        if (!show.limbs) continue
        const each = limbs(plugins.wire, row)
        let l = lines.get(row.id)
        if (!l) {
          l = new T.LineSegments(new T.BufferGeometry(), shape.lines)
          l.renderOrder = 998
          l.frustumCulled = false
          plugins.render3d.scene.add(l)
          lines.set(row.id, l)
        }
        const pos = new Float32Array(each.length * 6), colour = new Float32Array(each.length * 6)
        each.forEach((limb, i) => {
          pos.set([...limb.a, ...limb.b], i * 6)
          const c = struck.has(`${row.id}:${limb.limb}`) ? met : plain
          colour.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6)
        })
        l.geometry.setAttribute('position', new T.BufferAttribute(pos, 3))
        l.geometry.setAttribute('color', new T.BufferAttribute(colour, 3))
        l.visible = each.length > 0
      }
      for (const id of [...new Set([...rods.keys(), ...lines.keys()])]) if (!live.has(id)) drop(plugins, id)
    },
    close(plugins: Plugins) {
      for (const id of [...new Set([...rods.keys(), ...lines.keys()])]) drop(plugins, id)
      shape?.geometry.dispose()
      shape?.material.dispose()
      shape?.lines.dispose()
      shape = undefined
    },
  }
}
