// render3d's mod for hair3d (`addons/scenemanager`'s mods). A scene with
// `world.hair3d.mods: { behaviors: ['render3d'] }` lets hair3d grow on three's skinned meshes, which the
// plugins that draw bodies through render3d hand it (`anim.hair3d.ts`, `motion3d.hair3d.ts`,
// `puppet3d.hair3d.ts`), each `{ skinned: <the mesh> }`.
//
// `behaviors()` delivers the word `skinned`: the skin of a three SkinnedMesh, the same one each time it
// is handed the mesh. Its `name` is the mesh's and its `key` its geometry's id; its geometry is taken
// through its bind matrix, in metres by the scale its first bone carries (a Mixamo skin is bound in
// centimetres); its bones are its skeleton's own bone texture, brought up to date when its pose is asked;
// it is one copy.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Behavior, Frame, Pose, Skinned } from '#plugins/hair3d/hair3d.sim.ts'

// Each mesh's skin, made once for the mesh.
const made = new WeakMap<THREE.SkinnedMesh, Skinned>()

const skinned: Behavior = (plugins: Plugins, mesh: THREE.SkinnedMesh): Skinned => {
  const held = made.get(mesh)
  if (held) return held
  const T = plugins.render3d.THREE as typeof THREE
  const sk = mesh.skeleton
  mesh.updateWorldMatrix(true, false)
  sk.bones[0].updateWorldMatrix(true, false)
  const carried = new T.Matrix4().multiplyMatrices(sk.bones[0].matrixWorld, sk.boneInverses[0])
  const unit = Math.cbrt(Math.abs(new T.Matrix3().setFromMatrix4(carried).determinant()))
  const frames = (): Frame[] => sk.bones.map((b, i) => {
    const bind = new T.Matrix4().copy(sk.boneInverses[i]).invert().elements.slice()
    bind[12] *= unit; bind[13] *= unit; bind[14] *= unit
    return { name: b.name, bind }
  })
  const pose: Pose = { bones: undefined as unknown as THREE.Texture, first: -1, copies: 1, bind: new T.Matrix4() }
  const skin: Skinned = {
    name: mesh.name, key: mesh.geometry.uuid, unit, frames,
    skin() {
      const g = mesh.geometry
      const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight')
      if (!pos || !nor || !si || !sw) throw new Error(`hair3d: the mesh ${mesh.name} has no position, normal, skinIndex or skinWeight to root hair on`)
      const n = pos.count
      const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), bones = new Float32Array(n * 4), weights = new Float32Array(n * 4)
      const v = new T.Vector3(), w = new T.Vector4()
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix).multiplyScalar(unit).toArray(positions, i * 3)
        v.fromBufferAttribute(nor, i).transformDirection(mesh.bindMatrix).toArray(normals, i * 3)
        w.set(si.getX(i), si.getY(i), si.getZ(i), si.getW(i)).toArray(bones, i * 4)
        w.set(sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i))
        const sum = w.x + w.y + w.z + w.w
        w.divideScalar(sum > 0 ? sum : 1).toArray(weights, i * 4)
      }
      const index = g.getIndex()
      const triangles = new Uint32Array(index ? index.count : n)
      for (let i = 0; i < triangles.length; i++) triangles[i] = index ? index.getX(i) : i
      return { positions, normals, bones, weights, triangles, frames: frames() }
    },
    pose() {
      sk.update()
      if (!sk.boneTexture) sk.computeBoneTexture()
      pose.bones = sk.boneTexture!
      pose.bind.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
      return pose
    },
  }
  made.set(mesh, skin)
  return skin
}

export const behaviors = (): Record<string, Behavior> => ({ skinned })
