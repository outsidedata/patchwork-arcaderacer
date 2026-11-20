// crowd3d's mod for hair3d (`addons/scenemanager`'s mods). A scene with
// `world.hair3d.mods: { skins: ['crowd3d'], behaviors: ['crowd3d'] }` grows hair3d's hairs on crowd3d's
// people, every person of a body in one draw.
//
// `skins(plugins)` is a wearer for each body of `world.crowd3d.bodies` once the bodies are built: its
// `id` `crowd3d <body>`, its `kind` the body's name, its skins the body's mesh groups, each
// `{ posed: { body, mesh } }`: the body as crowd3d's `worn()` hands it and one of its groups.
//
// `behaviors()` delivers the word `posed`: the skin of such a mesh group, the same one each time it is
// handed the group. Its `name` is the mesh's (`crowd3d <body> <mesh>`) and its `key` its geometry's id;
// its geometry is as the group was merged, in metres by the body's `unit`; it has as many copies as the
// body has people, and its bones are the rows of crowd3d's pose, a person a row from the body's first:
// hair3d's pass reads them where crowd3d's own pass wrote them.
import type { BufferGeometry, Matrix4, Mesh } from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Behavior, Frame, Pose, Skinned, Wearer } from '#plugins/hair3d/hair3d.sim.ts'
import type { Worn } from './crowd3d.plugin.ts'

type Posed = { body: Worn; mesh: Mesh<BufferGeometry> }

// Each mesh group's skin, made once for its geometry, and the body it was last handed with.
const made = new WeakMap<BufferGeometry, { skin: Skinned; body: Worn }>()

export function skins(plugins: Plugins): Wearer[] {
  const worn: Worn[] = plugins.crowd3d.worn()
  return worn.map(body => ({ id: `crowd3d ${body.name}`, kind: body.name, skins: body.groups.map(mesh => ({ posed: { body, mesh } })) }))
}

const posed: Behavior = (plugins: Plugins, { body, mesh }: Posed): Skinned => {
  const T = plugins.render3d.THREE
  const g = mesh.geometry
  const held = made.get(g)
  if (held) {
    held.body = body
    return held.skin
  }
  const first = body
  const frames = (): Frame[] => first.bones.map((name, j) => {
    const bind = (new T.Matrix4() as Matrix4).copy(first.inverses[j]).invert().elements.slice()
    bind[12] *= first.unit; bind[13] *= first.unit; bind[14] *= first.unit
    return { name, bind }
  })
  const pose: Pose = { bones: first.pose, first: 0, copies: 0, bind: new T.Matrix4() }
  const mine = { body, skin: undefined as unknown as Skinned }
  mine.skin = {
    name: mesh.name, key: g.uuid, unit: first.unit, frames,
    skin() {
      const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), bi = g.getAttribute('crowdBones'), bw = g.getAttribute('crowdWeights')
      const n = pos.count
      const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), bones = new Float32Array(n * 4), weights = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) {
        positions[i * 3] = pos.getX(i) * first.unit; positions[i * 3 + 1] = pos.getY(i) * first.unit; positions[i * 3 + 2] = pos.getZ(i) * first.unit
        normals[i * 3] = nor.getX(i); normals[i * 3 + 1] = nor.getY(i); normals[i * 3 + 2] = nor.getZ(i)
        let sum = 0
        for (let k = 0; k < 4; k++) { bones[i * 4 + k] = bi.getComponent(i, k); weights[i * 4 + k] = bw.getComponent(i, k); sum += weights[i * 4 + k] }
        if (sum > 0) for (let k = 0; k < 4; k++) weights[i * 4 + k] /= sum
      }
      const index = g.getIndex()!
      const triangles = new Uint32Array(index.count)
      for (let i = 0; i < triangles.length; i++) triangles[i] = index.getX(i)
      return { positions, normals, bones, weights, triangles, frames: frames() }
    },
    pose() {
      pose.bones = mine.body.pose
      pose.first = mine.body.first
      pose.copies = mine.body.count
      return pose
    },
  }
  made.set(g, mine)
  return mine.skin
}

export const behaviors = (): Record<string, Behavior> => ({ posed })
