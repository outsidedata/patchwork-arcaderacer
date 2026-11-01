// ik3d's solve on a three-bone arm under an armature turned a quarter about x and scaled to
// centimetres, as an exported Mixamo rig is: the hand reaches a target in reach and takes its
// rotation, the bones keep their lengths, the elbow bends toward the pole, a target out of reach
// leaves the arm straight toward it and answers how far short it fell, and a prop is anchored by its
// point, turned about it.
import { expect, test } from 'vitest'
import * as THREE from 'three'
import { anchor, reach } from './ik3d.solve.ts'

const X = new THREE.Vector3(1, 0, 0)
const DEG = Math.PI / 180

// A body root at `at` turned `yaw`, an armature under it, and an arm along −x: upper 28 cm, lower 26 cm.
function arm(yaw = 0, at = new THREE.Vector3()) {
  const root = new THREE.Group()
  root.position.copy(at)
  root.rotation.y = yaw
  const rig = new THREE.Object3D()
  rig.quaternion.setFromAxisAngle(X, Math.PI / 2)
  rig.scale.setScalar(0.01)
  root.add(rig)
  const shoulder = new THREE.Bone()
  shoulder.position.set(0, 0, -140)
  const upper = new THREE.Bone(), lower = new THREE.Bone(), end = new THREE.Bone()
  upper.position.set(-12, 0, 0)
  lower.position.set(-28, 0, 0)
  end.position.set(-26, 0, 0)
  rig.add(shoulder)
  shoulder.add(upper)
  upper.add(lower)
  lower.add(end)
  root.updateMatrixWorld(true)
  return { root, bones: [upper, lower, end] as [THREE.Bone, THREE.Bone, THREE.Bone] }
}

const world = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)
const turnOf = (o: THREE.Object3D) => { const q = new THREE.Quaternion(); o.matrixWorld.decompose(new THREE.Vector3(), q, new THREE.Vector3()); return q }

function target(at: number[], turn = new THREE.Euler()) {
  const t = new THREE.Object3D()
  t.position.fromArray(at)
  t.rotation.copy(turn)
  t.updateMatrixWorld(true)
  return t
}

test('the hand reaches a target in reach, takes its rotation, and every bone keeps its length', () => {
  const { root, bones } = arm()
  const [u, l, e] = bones
  const len1 = world(u).distanceTo(world(l)), len2 = world(l).distanceTo(world(e))
  const t = target([-0.3, 1.2, 0.25], new THREE.Euler(0.3, -0.5, 1.1))
  const short = reach(THREE, bones, t, [0, -1, 0], root)
  expect(short).toBeLessThan(1e-6)
  expect(world(e).distanceTo(world(t))).toBeLessThan(1e-6)
  expect(world(u).distanceTo(world(l))).toBeCloseTo(len1, 6)
  expect(world(l).distanceTo(world(e))).toBeCloseTo(len2, 6)
  expect(turnOf(e).angleTo(turnOf(t))).toBeLessThan(1e-6)
})

test('the elbow bends toward the pole, in the body root\'s frame', () => {
  for (const [pole, sign] of [[[0, -1, 0], -1], [[0, 1, 0], 1]] as const) {
    for (const yaw of [0, 1.3]) {
      const { root, bones } = arm(yaw, new THREE.Vector3(2, 0, -3))
      const a = world(bones[0])
      const t = target(a.clone().add(new THREE.Vector3(0, 0, 0.35).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)).toArray())
      reach(THREE, bones, t, [...pole], root)
      // The elbow sits off the line from the shoulder to the target, on the pole's side.
      const mid = a.clone().lerp(world(t), 0.5)
      expect(Math.sign(world(bones[1]).y - mid.y)).toBe(sign)
    }
  }
})

test('a target out of reach leaves the arm straight toward it, a millimetre short of locked, and answers how far it fell short', () => {
  const { root, bones } = arm()
  const a = world(bones[0])
  const span = world(bones[0]).distanceTo(world(bones[1])) + world(bones[1]).distanceTo(world(bones[2]))
  const t = target(a.clone().add(new THREE.Vector3(0, 0, 1)).toArray())
  const short = reach(THREE, bones, t, [0, -1, 0], root)
  expect(short).toBeCloseTo(1 - span + 1e-3, 5)
  const dir = world(bones[2]).sub(a).normalize()
  expect(dir.angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-6)
})

test('solving again from the solved pose lands the same, so a repeat never drifts', () => {
  const { root, bones } = arm()
  const t = target([-0.25, 1.3, 0.3])
  reach(THREE, bones, t, [0, -1, 0], root)
  const first = bones.map(b => b.quaternion.clone())
  reach(THREE, bones, t, [0, -1, 0], root)
  bones.forEach((b, i) => expect(b.quaternion.angleTo(first[i])).toBeLessThan(1e-6))
})

test('a prop is anchored by its point at the bone\'s scale-free frame, moved and turned in it, and turns about the point', () => {
  const { bones } = arm()
  const prop = new THREE.Group()
  const stock = new THREE.Object3D()
  stock.name = 'stock'
  stock.position.set(0, 0.1, 0.3)
  const muzzle = new THREE.Object3D()
  muzzle.name = 'muzzle'
  muzzle.position.set(0, 0.1, -0.5)
  prop.add(stock, muzzle)
  const scene = new THREE.Scene()
  scene.add(prop, bones[0].parent!.parent!.parent!)
  scene.updateMatrixWorld(true)
  const at = [0.02, -0.05, 0.1]
  const spot = world(bones[0]).add(new THREE.Vector3().fromArray(at).applyQuaternion(turnOf(bones[0])))
  anchor(THREE, prop, bones[0], at, [0, 0, 0], 'stock')
  expect(world(stock).distanceTo(spot)).toBeLessThan(1e-6)
  const before = world(muzzle)
  anchor(THREE, prop, bones[0], at, [0, 30, 0], 'stock')
  expect(world(stock).distanceTo(spot)).toBeLessThan(1e-6)
  // The muzzle swung about the stock: the same distance from it, 30° round.
  expect(world(muzzle).distanceTo(spot)).toBeCloseTo(before.distanceTo(spot), 6)
  expect(world(muzzle).sub(spot).angleTo(before.clone().sub(spot))).toBeCloseTo(30 * DEG, 6)
  expect(prop.scale.x).toBeCloseTo(1, 9)
})

test('a prop with no such point is placed by its root', () => {
  const { bones } = arm()
  const prop = new THREE.Group()
  const scene = new THREE.Scene()
  scene.add(prop, bones[0].parent!.parent!.parent!)
  scene.updateMatrixWorld(true)
  anchor(THREE, prop, bones[0], [0, 0, 0], [0, 0, 0], 'stock')
  expect(world(prop).distanceTo(world(bones[0]))).toBeLessThan(1e-6)
  expect(turnOf(prop).angleTo(turnOf(bones[0]))).toBeLessThan(1e-6)
})
