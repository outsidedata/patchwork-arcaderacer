// The browser half of flight3d: every plane of the scene, every row of a kind `world.flight3d.kinds`
// lists (`flight3d` when it lists none), drawn from the loader model its entry of
// `world.flight3d.planes` names (`look.model`), placed each frame by its row. It needs render3d and the
// loader, and is listed after the loader and before render3d, so a frame draws the rows it was handed.
// A plane is drawn from the first frame its model has landed; the model is asked for the first time a
// row of its plane is seen, and the loader writes a failure to the console once itself.
//
// A model is in flight3d's body frame (+X the right wing, +Y up, −Z the nose), as `games/flight/assets/
// planes.py` builds one: a node for each moving part, on its hinge, its local axes turned so the hinge
// is the axis it turns about. Each frame every part is turned from the pose the model gave it, by the
// angle on the row, so the drawing is what is being flown:
//   aileron_left…      about its local X by `aileron`, aileron_right… by −`aileron` (a name beginning
//                      with either, as the Camel's lower pair do): +aileron rolls right, the right
//                      one's back edge rising and the left's falling.
//   elevator           about X by −`elevator`: +elevator pitches the nose up, the back edge rising.
//   rudder             about Y by `rudder`: +rudder yaws the nose right, the back edge swinging right.
//   airbrake…          about X by −`airbrake` times `look.airbrake`, so the entry says which way and
//                      how far its brakes, or flaps, go.
//   gear_<n>           about X by `look.gear` times how far the gear is up (1 − `gear`): leg n folding
//                      away, its wheel and steer node with it.
//   prop               about Z, turning `look.spin` rad/s at full throttle on the page's clock,
//                      positive clockwise seen from the cockpit.
//   steer_<n>          about Y by −`steer` times the yaw stick, gear wheel n turning the way the nose
//                      is pushed.
//   wheel_<n>          about X by the distance it has rolled over its radius while it is pressed into
//                      the ground (the row's `press`), the plane's own forward speed; in the air it
//                      spins down over a second and a half. Wheel n (or the steer node holding it) is
//                      drawn up its leg by how far it is pressed in.
// The page's clock counts a frame as a tenth of a second at most. Every mesh casts and takes shadows,
// its material dressed by render3d. A plane goes with its row, and when `world.flight3d` changes, as the
// editor does while a value of it is dragged, every plane is made again.
// One of these per client: the planes drawn are this scene's.
import type { Row } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { modelOf, unrotate, type Flight, type Look, type Plane } from './flight3d.sim.ts'

type Turned = { node: any; rest: any; axis: number[]; angle: (p: Plane, look: Look) => number }
type Wheel = { node: any; rest: any; radius: number; rolled: number; rate: number; holder: any; seat: any }
type Drawn = { root: any; type: string; turned: Turned[]; prop?: { node: any; rest: any; angle: number }; steers: { node: any; rest: any; steer: number }[]; wheels: (Wheel | undefined)[] }

// The surfaces, by the start of their nodes' names.
const SURFACES: { name: string; axis: number[]; angle: (p: Plane, look: Look) => number }[] = [
  { name: 'aileron_left', axis: [1, 0, 0], angle: p => p.aileron },
  { name: 'aileron_right', axis: [1, 0, 0], angle: p => -p.aileron },
  { name: 'elevator', axis: [1, 0, 0], angle: p => -p.elevator },
  { name: 'rudder', axis: [0, 1, 0], angle: p => p.rudder },
  { name: 'airbrake', axis: [1, 0, 0], angle: (p, look) => -p.airbrake * look.airbrake },
  { name: 'gear', axis: [1, 0, 0], angle: (p, look) => (1 - p.gear) * look.gear },
]
const named = (n: string, start: string) => n === start || n.startsWith(start + '_')
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function flight3d() {
  const planes = new Map<number, Drawn>()
  const asked = new Set<string>()
  let design = ''
  let last = 0 // the page's clock at the last frame, ms; 0 is none

  function make(plugins: Plugins, f: Flight, type: string): Drawn {
    const { render3d, loader } = plugins
    const plane = modelOf(f, type)
    const root = loader.model(plane.look.model).scene
    root.traverse((o: any) => {
      if (!o.isMesh) return
      o.castShadow = true
      o.receiveShadow = true
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) render3d.dress(m)
    })
    const turned: Turned[] = []
    const steers: Drawn['steers'] = []
    const wheels: Drawn['wheels'] = plane.gear.wheels.map(() => undefined)
    let prop: Drawn['prop']
    root.traverse((o: any) => {
      const s = SURFACES.find(s => named(o.name, s.name))
      if (s) turned.push({ node: o, rest: o.quaternion.clone(), axis: s.axis, angle: s.angle })
      if (o.name === 'prop') prop = { node: o, rest: o.quaternion.clone(), angle: 0 }
      const steer = /^steer_(\d+)$/.exec(o.name)
      if (steer) steers[Number(steer[1])] = { node: o, rest: o.quaternion.clone(), steer: plane.gear.wheels[Number(steer[1])].steer }
    })
    plane.gear.wheels.forEach((w, i) => {
      const node = root.getObjectByName(`wheel_${i}`)
      if (!node) return
      const holder = steers[i]?.node ?? node
      wheels[i] = { node, rest: node.quaternion.clone(), radius: w.radius, rolled: 0, rate: 0, holder, seat: holder.position.clone() }
    })
    render3d.scene.add(root)
    return { root, type, turned, prop, steers: steers.filter(Boolean), wheels }
  }

  function drop(scene: any, id: number) {
    scene.remove(planes.get(id)!.root)
    planes.delete(id)
  }

  return {
    afterTick(plugins: Plugins) {
      const { THREE, scene } = plugins.render3d
      const f: Flight | undefined = plugins.wire.scene.world?.flight3d
      if (!f) return
      const now = JSON.stringify(f)
      if (now !== design) { for (const id of [...planes.keys()]) drop(scene, id); design = now }
      const clock = performance.now()
      const dt = last ? Math.min(0.1, (clock - last) / 1000) : 0
      last = clock
      const q = new THREE.Quaternion(), axis = new THREE.Vector3()
      const seen = new Set<number>()
      const kinds = f.kinds ?? ['flight3d']
      for (const row of plugins.wire.rows as Row[]) {
        if (!kinds.includes(row.kind) || !row.data.pos) continue
        const p = row.data as Plane
        const look = modelOf(f, p.type).look
        if (!plugins.loader.ready(look.model)) {
          if (!asked.has(look.model)) { asked.add(look.model); plugins.loader.load(look.model).catch(() => {}) }
          continue
        }
        seen.add(row.id)
        if (planes.get(row.id)?.type !== p.type) {
          if (planes.has(row.id)) drop(scene, row.id)
          planes.set(row.id, make(plugins, f, p.type))
        }
        const d = planes.get(row.id)!
        d.root.position.fromArray(p.pos)
        d.root.quaternion.fromArray(p.rot)
        const turn = (node: any, rest: any, a: number[], angle: number) => node.quaternion.copy(rest).multiply(q.setFromAxisAngle(axis.fromArray(a), angle))
        for (const t of d.turned) turn(t.node, t.rest, t.axis, t.angle(p, look))
        if (d.prop) {
          d.prop.angle -= look.spin * p.throttle * dt
          turn(d.prop.node, d.prop.rest, [0, 0, 1], d.prop.angle)
        }
        for (const s of d.steers) turn(s.node, s.rest, [0, 1, 0], -s.steer * clamp(p.yaw, -1, 1))
        const forward = -unrotate(p.rot, p.vel)[2]
        d.wheels.forEach((w, i) => {
          if (!w) return
          const press = p.press?.[i] ?? 0
          w.rate = press > 0 ? forward / w.radius : w.rate * Math.exp(-dt / 1.5)
          w.rolled -= w.rate * dt
          turn(w.node, w.rest, [1, 0, 0], w.rolled)
          w.holder.position.set(w.seat.x, w.seat.y + press, w.seat.z)
        })
      }
      for (const id of [...planes.keys()]) if (!seen.has(id)) drop(scene, id)
    },
    close(plugins: Plugins) {
      for (const id of [...planes.keys()]) drop(plugins.render3d.scene, id)
      design = ''
      last = 0
    },
  }
}
