// ik3d's solve: the pure three.js arithmetic of a body's limbs reaching points on a prop, shared by
// the plugin (`ik3d.plugin.ts`) and the asset workshop (`tools/workshop/`), which runs the same solve
// live while a prop's points are tuned. It imports nothing at run time: three is handed in, so a page
// that serves this file alone can run it.
//
// `anchor(T, prop, bone, at, turn, point)` places a prop by one of its own points: the `point` empty
// inside the prop (its `stock`, say), its place and its rotation both, is put at the frame of `bone`
// with that frame's scale taken off, moved by `at` (metres) and turned by `turn` (degrees, an XYZ
// Euler) in that frame, and the prop's root is set so the point's frame lands there. Turning `turn` turns the prop about the point, so a stock
// stays in the shoulder while the muzzle is aimed. A prop with no such point is placed by its root.
// The root's matrix, position, quaternion and scale are all written and its world matrices updated.
//
// `reach(T, bones, target, pole, up)` bends a three-bone limb (`bones`: upper, lower and end, the arm,
// forearm and hand) so the end bone stands at the target's world position, turned to the target's
// world rotation with its scale taken off. It is the exact two-bone solve: the distance from the
// upper bone to the target, cut to what the two lengths can span (a millimetre short of straight, and
// no closer than their difference), sets the middle joint's place by the law of cosines, on the side
// of the line toward `pole`: a direction in `up`'s frame (the body root's), the way the elbow or
// knee points. Each of the upper and lower bones is turned by the shortest arc from where it points to
// where it must, so the twist each had is kept; the end bone takes the target's rotation. The lengths
// are the bones' own as they stand, so the solve never stretches a limb. It answers how far the end
// bone's place ended from the target, in metres: 0 when the target was in reach.
//
// Every bone it turns is turned in its parent's frame as the parent stands after the bones above it
// were turned, and world matrices are brought up to date bone by bone, so a caller reads the solved
// pose at once.
import type * as THREE from 'three'

type Three = typeof import('three')
const DEG = Math.PI / 180

// A bone's or a point's world place and rotation, its scale taken off.
function frame(T: Three, o: THREE.Object3D) {
  o.updateWorldMatrix(true, false)
  const at = new T.Vector3(), turn = new T.Quaternion(), scale = new T.Vector3()
  o.matrixWorld.decompose(at, turn, scale)
  return { at, turn }
}

// Sets an object's local rotation so its world rotation is `world`.
function turnTo(T: Three, o: THREE.Object3D, world: THREE.Quaternion) {
  const parent = o.parent ? frame(T, o.parent).turn.normalize() : new T.Quaternion()
  o.quaternion.copy(parent.invert().multiply(world.clone().normalize())).normalize()
  o.updateWorldMatrix(false, true)
}

export function anchor(T: Three, prop: THREE.Object3D, bone: THREE.Object3D, at: number[], turn: number[], point?: string) {
  const b = frame(T, bone)
  const spot = new T.Matrix4().compose(b.at, b.turn, new T.Vector3(1, 1, 1))
    .multiply(new T.Matrix4().compose(new T.Vector3().fromArray(at), new T.Quaternion().setFromEuler(new T.Euler(turn[0] * DEG, turn[1] * DEG, turn[2] * DEG, 'XYZ')), new T.Vector3(1, 1, 1)))
  // The point's matrix in the prop root's own frame.
  let inside = new T.Matrix4()
  if (point) {
    let found: THREE.Object3D | undefined
    prop.traverse(o => { if (!found && o !== prop && o.name.endsWith(point)) found = o })
    if (found) {
      prop.updateWorldMatrix(true, true)
      inside = prop.matrixWorld.clone().invert().multiply(found.matrixWorld)
    }
  }
  const world = spot.multiply(inside.invert())
  const parent = prop.parent ? (prop.parent.updateWorldMatrix(true, false), prop.parent.matrixWorld.clone().invert()) : new T.Matrix4()
  prop.matrix.copy(parent.multiply(world))
  prop.matrix.decompose(prop.position, prop.quaternion, prop.scale)
  prop.updateMatrixWorld(true)
}

export function reach(T: Three, bones: [THREE.Object3D, THREE.Object3D, THREE.Object3D], target: THREE.Object3D, pole: number[], up: THREE.Object3D) {
  const [upper, lower, end] = bones
  const a = frame(T, upper).at, b = frame(T, lower).at, c = frame(T, end).at
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c)
  const goal = frame(T, target)
  const toGoal = goal.at.clone().sub(a)
  const far = toGoal.length()
  const d = Math.min(Math.max(far, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-3)
  const n = far > 1e-9 ? toGoal.clone().divideScalar(far) : b.clone().sub(a).normalize()
  // The bend: the pole, in the body's frame, made square to the line from the upper bone to the target.
  const bend = new T.Vector3().fromArray(pole).applyQuaternion(frame(T, up).turn)
  bend.sub(n.clone().multiplyScalar(bend.dot(n)))
  if (bend.lengthSq() < 1e-12) bend.copy(b.clone().sub(a)).sub(n.clone().multiplyScalar(b.clone().sub(a).dot(n)))
  if (bend.lengthSq() < 1e-12) bend.set(0, 1, 0).sub(n.clone().multiplyScalar(n.y))
  bend.normalize()
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x))
  const joint = a.clone().addScaledVector(n, x).addScaledVector(bend, h)
  const wrist = a.clone().addScaledVector(n, d)
  // The upper bone, then the lower, each by the shortest arc from where it points to where it must.
  const swing = (bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) => {
    const arc = new T.Quaternion().setFromUnitVectors(from.normalize(), to.normalize())
    turnTo(T, bone, arc.multiply(frame(T, bone).turn))
  }
  swing(upper, b.clone().sub(a), joint.clone().sub(a))
  const b2 = frame(T, lower).at, c2 = frame(T, end).at
  swing(lower, c2.clone().sub(b2), wrist.clone().sub(b2))
  turnTo(T, end, goal.turn)
  return frame(T, end).at.distanceTo(goal.at)
}
