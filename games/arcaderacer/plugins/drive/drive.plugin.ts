// The browser half of drive: it draws every racing row (`racers` in `drive.sim.ts`, the seats' cars,
// the `car` rows their `player` rows hold, and the CPU's rivals) from the frame's rows. A row's `car`
// names its car file, the loader's json entry of that name (`assets/cars/<car>.json`), which says how
// that car is drawn. Every car file has:
//   name           the car's name, as the title's car select shows it (`titlecard.client.ts`).
//   form           how the car is made: `model`, one glTF of the loader's whose named nodes are its parts, or
//                  `kit`, the library's pro-ng kit cut into a body and four wheels, each a glb of its own
//                  drawn in supershader3d's one shader. Each form's fields are below.
//   steer          radians the front wheels turn with the wheel full over.
//   tracks         [[x, z], ...]: the rear tyres' contact patches in the car's frame, where fx lays its
//                  marks and throws its tyre smoke (`fx.plugin.ts`, `fx.particle3d.ts`).
//   metadata       what one car alone needs: { paint, paintMaterial } on a `model` car painted here, its
//                  model's material `paintMaterial` the body's paint, which each car gets a copy of in `paint`.
//                  A car with no `metadata.paint` is drawn in its own colours.
// A `model` car's file also has:
//   model          the loader's model entry, which the loader clones for each row.
//   lamp           the model's tail-lamp material, which each car gets a copy of, lit the kind's
//                  `look.glow` while its brake or handbrake is held.
//   heads          the model's headlamp materials, each car's own copy lit the kind's `look.headGlow`
//                  { colour, intensity } on a course whose `light.lit` is set (its lights on, at dusk or
//                  night).
//   hubs           { fl, fr, rl, rr }: the nodes the wheels hang from; the front two turn `steer`.
//   wheels         { fl, fr, rl, rr }: the wheels, each turned about its axle as far as the car has
//                  rolled over a tyre of radius `tyre` metres.
// A `kit` car's file also has:
//   turn           radians every piece is turned about the upright to stand in the car's frame (the kit's
//                  pieces face −z, the car's nose is +z).
//   body           { glb, looks }: the body, the loader's `binary` entry of its glb and `json` entry of the
//                  glb's own looks file (both preloaded), its bytes unpacked once, made a mesh by the scene's `world.drive.mods.models` (supershader3d's,
//                  `supershader3d.drive.ts`) once the scene's looks file has landed.
//   wheels         { fl, fr, rl, rr }: each { glb, looks, at, radius }: its glb and looks as the body's, its
//                  middle at `at` in the car's frame, turned about its axle as far as the car has rolled over a
//                  tyre of `radius` metres; each glb stands on the ground, its middle `radius` over it.
//   steering       { bone, lock }: the body's bone that is the steering wheel, its +x down the column, turned
//                  about it `lock` radians with the wheel full over.
//   lamps          { brake, heads }: each { material, setting, off, on }, the scene's looks file's material the
//                  lamp is and the setting of its look it glows by (`lpGlow`, `lnGlow`, `sbGlow`, `glGlow`, as
//                  each kit's look names it), set each frame through supershader3d's `set` to `on` while the
//                  row brakes or holds its handbrake (`brake`), or while the course's `light.lit` is set
//                  (`heads`), else `off`. A kit car's materials are its own, and no car is on the grid twice,
//                  so each lamp is that one car's.
//   paint          { material, options }: the scene's looks file's material the body's paint is (an `auto_paint`),
//                  and the paints the library's kit offers, each { name, settings }, every setting of the look.
//                  A row's car is painted the option of its grid place, round the list again
//                  (`options[grid % options.length]`), each setting written through supershader3d's `set` as the
//                  car is made; a car drawn with no row (`model`) keeps the paint it was baked in, the first.
//                  The options are the library's (`pro-ng/materials/<car>`), each laid over auto_paint's defaults.
// A `model` car's or a `kit` car's part its file names that its glb has not throws, naming it and the car.
// A row's kind's definition holds `look`, what every car shares: `glow` and `headGlow`.
// On such a course the seat's own car carries a spot light, the course's `light.headlight`
// { colour, intensity, distance, angle, penumbra, at, aim }: standing at `at` in the car's frame and
// shining at `aim`.
// A node is named as three's glTF loader names it, which drops the dots of the file's own name
// (`car.hub_fl` in the file is `carhub_fl`).
// The car stands at its row's `pos`, turned by `yaw` (its nose its +z), `pitch` nose up and `roll`
// right side down, its root named `<kind>.<id>`. A row that leaves takes its car with it. The cars are placed in its `tick`, which
// runs before render3d's `afterTick` draws the frame wherever `shipped` stands, so every car is
// drawn where this frame's rows put it.
//
// `model(p, car, kind)` is one car of the car file `car` drawn alone, as the kind `kind` draws it, for a
// page that shows a car with no row (the title's car select): its root, on no scene, and `dispose`, which
// lets go of what it was given; undefined while its pieces are still coming.
import type * as THREE from 'three'
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { ahead, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { def, json } from '#plugins/loader/loader.sim.ts'
import type { Models } from '#plugins/supershader3d/supershader3d.box3dvehicle.ts'
import type { Unpacked } from '#plugins/supershader3d/supershader3d.glb.ts'
import { courseOf } from '../track/track.sim.ts'
import { RACING } from './drive.sim.ts'
import { holding } from '#plugins/player/player.plugin.ts'

type Corner = (typeof CORNERS)[number]
type Piece = { glb: string; looks: string }
// A car file (the header).
export type Car = {
  name: string
  steer: number
  tracks: number[][]
  metadata?: { paint?: string; paintMaterial?: string }
} & (
  | { form: 'model'; model: string; lamp: string; heads: string[]; hubs: Record<Corner, string>; wheels: Record<Corner, string>; tyre: number }
  | { form: 'kit'; turn: number; body: Piece; wheels: Record<Corner, Piece & { at: number[]; radius: number }>; steering: { bone: string; lock: number }; lamps: { brake: Lamp; heads: Lamp }; paint: Paint }
)
// A kit car's lamp: the scene's looks file's material it is, the setting of the material's look it glows by, and
// that setting's value unlit and lit (a number or [r, g, b], as the look reads it).
type Glow = number | number[]
type Lamp = { material: string; setting: string; off: Glow; on: Glow }
// A kit car's paint: the material, and every paint it may be drawn in, each every setting of its look.
type Paint = { material: string; options: { name: string; settings: Record<string, Glow> }[] }

// A car made: its root; the groups the front wheels steer by, the groups each wheel rolls by and each wheel's
// radius; its tail-lamp material; its steering wheel and how it stands straight; and what it owns.
type Built = {
  root: THREE.Object3D
  hubs: THREE.Object3D[]
  wheels: THREE.Object3D[]
  radii: number[]
  lamp?: THREE.MeshStandardMaterial
  wheel?: { bone: THREE.Object3D; rest: THREE.Quaternion; lock: number }
  owned: { dispose(): void }[]
}
// A car on the scene: how far it has rolled, and the moment it was last drawn at in the steps' seconds (a
// step behind the clock, `between` of a step past the step before the newest), undefined before its first
// frame. Its wheels roll by how far that moment moves frame to frame, never by the page's clock, which
// runs long, short, long, short above 60 frames a second on frames that do and do not run a step.
type Drawn = Built & { rolled: number; drawnAt?: number }

const CORNERS = ['fl', 'fr', 'rl', 'rr'] as const

// The car file a row names.
export const carOf = (p: Plugins, row: Row): Car => json(p.wire, row.data.car)

export function drive() {
  const drawn = new Map<number, Drawn>()
  // each kit glb as the `models` mod unpacked it, by its catalogue name, undefined while it is unpacked
  const unpacked = new Map<string, Unpacked | undefined>()
  // with the lights on, the seat's own car's headlights
  let beam: THREE.SpotLight | undefined

  // A `model` car of the file `C` (named `car`) as the kind `kind` draws it, on no scene, or undefined while its
  // model is coming. Its headlamps are lit when `lights` is.
  function modelled(p: Plugins, car: string, C: Extract<Car, { form: 'model' }>, kind: string, lights: boolean): Built | undefined {
    const { render3d, loader, wire } = p
    const look = def(wire, kind).look
    if (!loader.ready(C.model)) {
      loader.load(C.model).catch(() => {})
      return
    }
    const root = loader.model(C.model).scene as THREE.Object3D
    const paint = C.metadata?.paint
    const owned: THREE.Material[] = []
    let lamp: THREE.MeshStandardMaterial | undefined
    root.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const own = (m: THREE.Material) => {
        if (paint !== undefined && m.name === C.metadata!.paintMaterial) {
          const copy = (m as THREE.MeshStandardMaterial).clone()
          copy.color.set(paint)
          owned.push(copy)
          return render3d.dress(copy)
        }
        if (m.name === C.lamp) {
          if (!lamp) {
            lamp = (m as THREE.MeshStandardMaterial).clone()
            lamp.emissive.copy(lamp.color)
            owned.push(lamp)
          }
          return render3d.dress(lamp)
        }
        // the headlamps, lit when the course's lights are on
        if (lights && C.heads.includes(m.name)) {
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
      if (!it) throw new Error(`drive: the car ${car}'s model ${C.model} has no node ${name}`)
      return it
    }
    return {
      root,
      hubs: CORNERS.map(c => node(C.hubs[c])),
      wheels: CORNERS.map(c => node(C.wheels[c])),
      radii: CORNERS.map(() => C.tyre),
      lamp,
      owned,
    }
  }

  // The kit glb `piece` as the `models` mod unpacked it, asked of the loader the first time, or undefined while it
  // comes.
  function bytes(p: Plugins, models: Models, it: Piece): Unpacked | undefined {
    if (!unpacked.has(it.glb)) {
      unpacked.set(it.glb, undefined)
      // The loader writes a failure to the console once itself.
      p.loader.load(it.glb).then(async (glb: { bytes: Uint8Array }) => { unpacked.set(it.glb, await models.unpack(glb.bytes)) }).catch(() => {})
    }
    return unpacked.get(it.glb)
  }

  // The mesh of the unpacked kit glb `u`, its own looks `looks`, or undefined while the scene's looks file has not
  // landed; its geometry goes with `owned`.
  function piece(p: Plugins, models: Models, u: Unpacked, looks: string, owned: { dispose(): void }[]): THREE.Object3D | undefined {
    const mesh = models.build(u, json(p.wire, looks))
    if (!mesh) return
    owned.push({ dispose: () => mesh.traverse(o => (o as THREE.Mesh).geometry?.dispose()) })
    return mesh
  }

  // A `kit` car of the file `C` (named `car`), on no scene, or undefined while any of its pieces is coming: the
  // body turned `turn`, and each wheel in a group at its `at` (which a front wheel steers by), in a group it
  // rolls by, its glb turned `turn` and lowered its radius, so it turns about its own middle.
  function kitted(p: Plugins, car: string, C: Extract<Car, { form: 'kit' }>): Built | undefined {
    const T = p.render3d.THREE as typeof THREE
    const makes = mod<(plugins: Plugins) => Models>(p.wire.scene.world!, 'drive', 'models')
    if (!makes) throw new Error(`drive: the car ${car} is a kit, and world.drive.mods names no models`)
    ahead(p.wire.scene, 'drive', 'models')
    const models = makes(p)
    // every piece unpacked before any is built, so a car is made once
    const pieces = [C.body, ...CORNERS.map(c => C.wheels[c])]
    const got = pieces.map(it => bytes(p, models, it))
    if (got.some(u => !u)) return
    const owned: { dispose(): void }[] = []
    const body = piece(p, models, got[0]!, C.body.looks, owned)
    const wheels = CORNERS.map((c, k) => piece(p, models, got[k + 1]!, C.wheels[c].looks, owned))
    if (!body || wheels.some(w => !w)) {
      for (const o of owned) o.dispose()
      return
    }
    const root = new T.Group()
    const upright = new T.Vector3(0, 1, 0)
    body.quaternion.setFromAxisAngle(upright, C.turn)
    root.add(body)
    const hubs: THREE.Object3D[] = [], rolls: THREE.Object3D[] = []
    CORNERS.forEach((c, k) => {
      const W = C.wheels[c]
      const hub = new T.Group(), roll = new T.Group()
      hub.position.fromArray(W.at)
      wheels[k]!.quaternion.setFromAxisAngle(upright, C.turn)
      wheels[k]!.position.y = -W.radius
      roll.add(wheels[k]!)
      hub.add(roll)
      root.add(hub)
      hubs.push(hub)
      rolls.push(roll)
    })
    const bone = body.getObjectByName(C.steering.bone)
    if (!bone) throw new Error(`drive: the car ${car}'s body ${C.body.glb} has no bone ${C.steering.bone}`)
    return { root, hubs, wheels: rolls, radii: CORNERS.map(c => C.wheels[c].radius), wheel: { bone, rest: bone.quaternion.clone(), lock: C.steering.lock }, owned }
  }

  // One car of the car file `car`, as the kind `kind` draws it, on no scene, or undefined while it is coming.
  function build(p: Plugins, car: string, kind: string, lights: boolean): Built | undefined {
    const C: Car = json(p.wire, car)
    if (C.form === 'model') return modelled(p, car, C, kind, lights)
    if (C.form === 'kit') return kitted(p, car, C)
    throw new Error(`drive: the car ${car}'s form is ${(C as { form: string }).form}, and a car is a model or a kit`)
  }

  // A new car for `row`, on the scene, or undefined while it is still coming.
  function make(p: Plugins, row: Row): Drawn | undefined {
    const it = build(p, row.data.car, row.kind, !!courseOf(p.wire).light.lit)
    if (!it) return
    it.root.name = `${row.kind}.${row.id}`
    it.root.traverse(o => { o.castShadow = o.receiveShadow = true })
    // a kit car painted its grid place's paint
    const C = carOf(p, row)
    if (C.form === 'kit') {
      const { material, options } = C.paint
      const paint = options[row.data.grid % options.length]
      for (const [setting, value] of Object.entries(paint.settings)) p.supershader3d.set(material, setting, value)
    }
    p.render3d.scene.add(it.root)
    return { ...it, rolled: 0 }
  }

  function drop(p: Plugins, id: number) {
    const it = drawn.get(id)
    if (!it) return
    p.render3d.scene.remove(it.root)
    for (const m of it.owned) m.dispose()
    drawn.delete(id)
  }

  return {
    model(p: Plugins, car: string, kind: string): { root: THREE.Object3D; dispose(): void } | undefined {
      const it = build(p, car, kind, false)
      if (!it) return
      return { root: it.root, dispose: () => { for (const m of it.owned) m.dispose() } }
    },
    tick(p: Plugins) {
      const { wire } = p
      const T = p.render3d.THREE as typeof THREE
      const seen = new Set<number>()
      // the moment drawn this frame, in the steps' seconds
      const between = wire.between
      const drawnAt = (between === undefined ? wire.n : wire.n - 1 + between) * (wire.scene.prefabs.engine.dt as number)
      const X = new T.Vector3(1, 0, 0), Y = new T.Vector3(0, 1, 0)
      for (const row of wire.rows) {
        if (!RACING.includes(row.kind) || row.data.seg < 0) continue
        seen.add(row.id)
        const it = drawn.get(row.id) ?? make(p, row)
        if (!it) continue
        drawn.set(row.id, it)
        const look = def(wire, row.kind).look
        const C = carOf(p, row)
        const d = row.data
        it.root.position.set(d.pos[0], d.pos[1], d.pos[2])
        // the whole turn set at once: heading, then nose up, then right side down
        it.root.quaternion.setFromEuler(new T.Euler(-d.pitch, d.yaw, d.roll, 'YXZ'))
        // how far it rolled along its nose while the moment drawn moved since its last frame (none when the
        // steps went back or it is new)
        const along = d.vel[0] * Math.sin(d.yaw) + d.vel[1] * Math.cos(d.yaw)
        const moved = it.drawnAt === undefined ? 0 : Math.min(0.1, Math.max(0, drawnAt - it.drawnAt))
        it.drawnAt = drawnAt
        it.rolled += along * moved
        it.hubs[0].quaternion.setFromAxisAngle(Y, -d.wheel * C.steer)
        it.hubs[1].quaternion.setFromAxisAngle(Y, -d.wheel * C.steer)
        it.wheels.forEach((w, k) => w.quaternion.setFromAxisAngle(X, it.rolled / it.radii[k]))
        if (it.wheel) it.wheel.bone.quaternion.copy(it.wheel.rest).multiply(new T.Quaternion().setFromAxisAngle(X, d.wheel * it.wheel.lock))
        const braking = d.brake > 0 || d.handbrake > 0
        if (it.lamp) it.lamp.emissiveIntensity = braking ? look.glow : 0.2
        // a kit car's lamps are its looks' materials, which only it draws: their glow set for this frame
        if (C.form === 'kit') {
          const L = C.lamps
          p.supershader3d.set(L.brake.material, L.brake.setting, braking ? L.brake.on : L.brake.off)
          p.supershader3d.set(L.heads.material, L.heads.setting, courseOf(wire).light.lit ? L.heads.on : L.heads.off)
        }
      }
      for (const id of [...drawn.keys()]) if (!seen.has(id)) drop(p, id)
      // the headlights ride the seat's own car, on a course that gives them
      const H = courseOf(wire).light.headlight
      const own = holding(wire.rows)
      const mine = own && drawn.get(own.id)
      if (!H || !mine) return
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
