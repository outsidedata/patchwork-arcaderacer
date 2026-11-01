// The browser half of drive: it draws every racing row (`racers` in `drive.sim.ts`, the seats' cars,
// the `car` rows their `player` rows hold, and the CPU's rivals) from the frame's rows, each its kind's `look.model` from the loader, cloned
// once per row. Nothing is drawn until the model has landed. A row's kind's definition holds `look`:
//   model          the loader's model entry.
//   paint          the body's colour, or `paints`, a list a rival takes the one of its `grid` place
//                  from, round again past the last.
//   paintMaterial  the model's material that is the body's paint, which each car gets a copy of.
//   lamp, glow     the model's tail-lamp material, which each car gets a copy of, lit `glow` while its
//                  brake or handbrake is held.
//   hubs           { fl, fr, rl, rr }: the nodes the wheels hang from; the front two turn `steer`
//                  radians with the wheel full over.
//   wheels         { fl, fr, rl, rr }: the wheels, each turned about its axle as far as the car has
//                  rolled over a tyre of radius `tyre` metres.
//   heads, headGlow  the model's headlamp materials, each car's own copy lit { colour, intensity }
//                  on a course whose `light.lit` is set (its lights on, at dusk or night).
// On such a course the seat's own car carries a spot light, the course's `light.headlight`
// { colour, intensity, distance, angle, penumbra, at, aim }: standing at `at` in the car's frame and
// shining at `aim`.
// A node is named as three's glTF loader names it, which drops the dots of the file's own name
// (`car.hub_fl` in the file is `carhub_fl`). A node the model lacks throws, naming it.
// The car stands at its row's `pos`, turned by `yaw` (its nose its +z), `pitch` nose up and `roll`
// right side down, its root named `<kind>.<id>`. A row that leaves takes its car with it. The cars are placed in its `tick`, which
// runs before render3d's `afterTick` draws the frame wherever `shipped` stands, so every car is
// drawn where this frame's rows put it.
import type * as THREE from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { def } from '#plugins/loader/loader.sim.ts'
import { courseOf } from '../track/track.sim.ts'
import { RACING } from './drive.sim.ts'
import { holding } from '#plugins/player/player.plugin.ts'

type Drawn = {
  root: THREE.Object3D
  hubs: THREE.Object3D[]
  wheels: THREE.Object3D[]
  lamp?: THREE.MeshStandardMaterial
  owned: THREE.Material[]
  rolled: number
  at: number
}

const CORNERS = ['fl', 'fr', 'rl', 'rr'] as const

export function drive() {
  const drawn = new Map<number, Drawn>()
  // with the lights on, the seat's own car's headlights
  let beam: THREE.SpotLight | undefined

  // A new car of `row`'s kind, or undefined while its model is still coming.
  function make(p: Plugins, row: Row): Drawn | undefined {
    const { render3d, loader, wire } = p
    const look = def(wire, row.kind).look
    if (!loader.ready(look.model)) {
      loader.load(look.model).catch(() => {})
      return
    }
    const root = loader.model(look.model).scene as THREE.Object3D
    const paint = look.paint ?? look.paints[row.data.grid % look.paints.length]
    const owned: THREE.Material[] = []
    const lights = !!courseOf(wire).light.lit
    let lamp: THREE.MeshStandardMaterial | undefined
    root.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const own = (m: THREE.Material) => {
        if (m.name === look.paintMaterial) {
          const copy = (m as THREE.MeshStandardMaterial).clone()
          copy.color.set(paint)
          owned.push(copy)
          return render3d.dress(copy)
        }
        if (m.name === look.lamp) {
          if (!lamp) {
            lamp = (m as THREE.MeshStandardMaterial).clone()
            lamp.emissive.copy(lamp.color)
            owned.push(lamp)
          }
          return render3d.dress(lamp)
        }
        // the headlamps, lit when the course's lights are on
        if (lights && (look.heads as string[]).includes(m.name)) {
          const lit = (m as THREE.MeshStandardMaterial).clone()
          lit.emissive.set(look.headGlow.colour)
          lit.emissiveIntensity = look.headGlow.intensity
          owned.push(lit)
          return render3d.dress(lit)
        }
        return render3d.dress(m)
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
    })
    const node = (name: string) => {
      const it = root.getObjectByName(name)
      if (!it) throw new Error(`drive: ${look.model} has no node ${name}`)
      return it
    }
    root.name = `${row.kind}.${row.id}`
    render3d.scene.add(root)
    return {
      root,
      hubs: CORNERS.map(c => node(look.hubs[c])),
      wheels: CORNERS.map(c => node(look.wheels[c])),
      lamp,
      owned,
      rolled: 0,
      at: performance.now(),
    }
  }

  function drop(p: Plugins, id: number) {
    const it = drawn.get(id)
    if (!it) return
    p.render3d.scene.remove(it.root)
    for (const m of it.owned) m.dispose()
    drawn.delete(id)
  }

  return {
    tick(p: Plugins) {
      const { wire } = p
      const seen = new Set<number>()
      for (const row of wire.rows) {
        if (!RACING.includes(row.kind) || row.data.seg < 0) continue
        seen.add(row.id)
        const it = drawn.get(row.id) ?? make(p, row)
        if (!it) continue
        drawn.set(row.id, it)
        const look = def(wire, row.kind).look
        const d = row.data
        it.root.position.set(d.pos[0], d.pos[1], d.pos[2])
        it.root.rotation.set(-d.pitch, d.yaw, d.roll, 'YXZ')
        // how far it rolled since the last frame, along its nose
        const now = performance.now()
        const along = d.vel[0] * Math.sin(d.yaw) + d.vel[1] * Math.cos(d.yaw)
        it.rolled += (along * Math.min(0.1, (now - it.at) / 1000)) / look.tyre
        it.at = now
        it.hubs[0].rotation.set(0, -d.wheel * look.steer, 0)
        it.hubs[1].rotation.set(0, -d.wheel * look.steer, 0)
        for (const w of it.wheels) w.rotation.set(it.rolled, 0, 0)
        if (it.lamp) it.lamp.emissiveIntensity = d.brake > 0 || d.handbrake > 0 ? look.glow : 0.2
      }
      for (const id of [...drawn.keys()]) if (!seen.has(id)) drop(p, id)
      // the headlights ride the seat's own car, on a course that gives them
      const H = courseOf(wire).light.headlight
      const own = holding(wire.rows)
      const mine = own && drawn.get(own.id)
      if (!H || !mine) return
      const T = p.render3d.THREE as typeof THREE
      if (!beam) {
        beam = new T.SpotLight(H.colour, H.intensity, H.distance, H.angle, H.penumbra, 1.5)
        p.render3d.scene.add(beam, beam.target)
      }
      mine.root.updateMatrixWorld()
      beam.position.copy(mine.root.localToWorld(new T.Vector3().fromArray(H.at)))
      beam.target.position.copy(mine.root.localToWorld(new T.Vector3().fromArray(H.aim)))
    },
    close(p: Plugins) {
      for (const id of [...drawn.keys()]) drop(p, id)
      if (beam) p.render3d.scene.remove(beam, beam.target)
      beam?.dispose()
      beam = undefined
    },
  }
}
