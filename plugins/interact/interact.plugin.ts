// interact's browser half (`interact.sim.ts` is what an interaction is): no drawing of its own. It
// stands where the scene lists it so the body of a row in an interaction is drawn on its machine's point
// as the page draws it, its hands and feet reach the machine's points through ik3d (`interact.ik3d.ts`,
// ik3d's `limbs`), and it checks the scene's side each frame.
//
// The machine's points and the bodies as the page draws them come through mods, `world.interact.mods`:
//   object  `object(plugins, machine, name)`: the three.js object of the point `name` of the machine
//           whose row id is `machine`, as it is drawn this frame, its world matrix this frame's (the
//           game's that draws its machines, beside the `point` it hands the server); undefined while it
//           is not drawn, or for a point the page draws no object for. It is the drawn twin of `point`:
//           with the machine drawn as its row stands, still, the object is at the `point`'s place, its
//           parent turned to the `point`'s yaw, so a body drawn on it is where the server stands it. Needed by a scene with a step that bends limbs (`ik`) and by one that
//           names a `body`; one with neither needs none, and one with either and no `object` throws.
//   body    `body(plugins, row)`: the body the page draws for the row, `{ root, props, limp }`, its
//           model root, the roots of the props hung on it and whether it lies limp; undefined while it
//           has no model (anim's, `anim.interact.ts`). With none named, a body is drawn where its row
//           stands, as the plugin that draws it puts it.
// The plugins they are place what they draw in their `tick` or their `afterTick` (anim poses its bodies
// in its `tick` and hangs their props in both), so each is listed before interact (`ahead`), and
// interact before ik3d, whose `limbs` it hands (ik3d checks that), so the limbs reach from the body
// where interact has put it.
//
// The body on its point. The server stands the body's root on the step's point (`at`) as a rule
// works it out, facing the point's frame's yaw turned by the step's `turn` (`interact.sim.ts`); the page
// draws its machine moving as no rule sees it (a walker's bob and sway, a car's body rolling and
// pitching on its springs). So in its `tick`
// and again in its `afterTick`, for each row in an interaction whose body the `body` mod hands and does
// not lie limp, and whose step's point the `object` mod draws, the body's root is put where the step
// has it in the frame the point hangs in (its parent's world turn: the point's own `turn`, which a
// hand takes, is not the body's): at the object's world place, or, for a step that travels, moved
// along that frame's x and z as far as its clip has taken it (`travelOf`, `interact.sim.ts`, at the
// row's `t`), and turned as that frame is, then by the step's `turn` and its travel's turn about the
// frame's up, its scale kept. The props hung on it are moved with it, by the same change to the root's world
// matrix, since their plugin hung them where the root stood. A step whose point is not drawn leaves the
// body where its plugin drew it. The `tick` places it on the points as they were drawn the frame
// before, so an actor's tick reads it on the machine; the `afterTick` on this frame's.
//
// Each frame it reads every interaction of `world.interact.kinds` (the loader's `json`), so one out of
// shape throws naming it the first frame it is read, and checks the mods' places.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { ahead, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { interactionOf, travelOf, type Numbers, type State } from './interact.sim.ts'

type Three = typeof import('three')
type ObjectMod = (plugins: Plugins, machine: number, name: string) => THREE.Object3D | undefined
export type Body = { root: THREE.Object3D; props: THREE.Object3D[]; limp: boolean }
type BodyMod = (plugins: Plugins, row: Row) => Body | undefined

// An object put at the world matrix `m`, in its parent's frame when it has one.
function setWorld(T: Three, o: THREE.Object3D, m: THREE.Matrix4) {
  const local = o.parent ? new T.Matrix4().copy(o.parent.matrixWorld).invert().multiply(m) : m
  local.decompose(o.position, o.quaternion, o.scale)
  o.updateMatrixWorld(true)
}

// The body put on the point: the root at `local.at` [x, z] in the point's frame from the point, turned
// as that frame and then by `local.yaw` radians about its up; each prop moved by as much as the root
// was. Only the root's position and quaternion are written, in its parent's frame, and its scale is
// left as its plugin set it: read back out of a matrix and written again every frame, the scale and
// the turn came out a bit different on frames that took no step, and render3d draws a thing moved on
// such a frame where it is set rather than between the steps (`steps`, `engine/browser.ts`), so the
// body jumped ahead of its machine.
function seat(T: Three, b: Body, point: THREE.Object3D, local: { at: number[]; yaw: number }) {
  point.updateWorldMatrix(true, false)
  const frame = point.parent ? point.parent.getWorldQuaternion(new T.Quaternion()) : new T.Quaternion()
  const at = new T.Vector3().setFromMatrixPosition(point.matrixWorld).add(new T.Vector3(local.at[0], 0, local.at[1]).applyQuaternion(frame))
  const q = frame.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), local.yaw))
  b.root.updateWorldMatrix(true, false)
  const was = b.root.matrixWorld.clone()
  const parent = b.root.parent
  if (parent) {
    b.root.position.copy(parent.worldToLocal(at))
    b.root.quaternion.copy(parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q))
  } else {
    b.root.position.copy(at)
    b.root.quaternion.copy(q)
  }
  b.root.updateMatrixWorld(true)
  const moved = new T.Matrix4().copy(b.root.matrixWorld).multiply(was.invert())
  for (const p of b.props) {
    p.updateWorldMatrix(true, false)
    setWorld(T, p, new T.Matrix4().copy(moved).multiply(p.matrixWorld))
  }
}

export function interact() {
  function frame(plugins: Plugins) {
    const scene = plugins.wire.scene
    const n = scene.world?.interact as Numbers | undefined
    if (!n || typeof n.kinds !== 'object') throw new Error('interact: the scene gives no world.interact.kinds')
    let bends = false
    for (const [kind, all] of Object.entries(n.kinds)) for (const name of Object.keys(all)) {
      if (interactionOf(plugins.wire, kind, name)!.steps.some(s => s.ik?.length)) bends = true
    }
    const body = mod<BodyMod>(scene.world!, 'interact', 'body')
    if (!bends && !body) return
    const object = mod<ObjectMod>(scene.world!, 'interact', 'object')
    if (!object) throw new Error('interact draws bodies on, and bends limbs onto, the points a mod draws, and the scene names none in world.interact.mods.object')
    ahead(scene, 'interact', 'object')
    if (!body) return
    ahead(scene, 'interact', 'body')
    if (!plugins.render3d) throw new Error('interact draws bodies on points render3d draws, and this scene does not list it')
    const T: Three = plugins.render3d.THREE
    for (const r of plugins.wire.rows) {
      const s = r.data.interact as State | null | undefined
      if (!s) continue
      const step = interactionOf(plugins.wire, s.kind, s.name)?.steps[s.step]
      if (!step) continue
      const point = object(plugins, s.machine, step.at)
      if (!point) continue
      const b = body(plugins, r)
      if (!b || b.limp) continue
      seat(T, b, point, travelOf(plugins.wire, r, step, s.t))
    }
  }

  return {
    tick(plugins: Plugins) { frame(plugins) },
    afterTick(plugins: Plugins) { frame(plugins) },
  }
}
