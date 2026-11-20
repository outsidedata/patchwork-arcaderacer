// A pro-ng glb made into what three draws in supershader3d's calls: a place's (world3d's, `world3d.plugin.ts`) or a
// car's body, wheel or hub (supershader3d's box3dvehicle mod, `supershader3d.box3dvehicle.ts`). Nothing here draws,
// loads or keeps anything: each function is handed what it works on.
//
// The glb. The library's pro-ng cuts a scene or a kit thing (its `procedural.py`) and packs it (`pack.mjs`) for
// supershader3d, the scene's one shader, composed from the materials the glb draws (its looks file). Nothing here knows
// a material or a mesh: the glb's node `pro-ng` says it in its extras' `vertex` (pack.mjs, VERTEX): the meshes to draw,
// each of the shader's vertex inputs as the glb's attributes' numbers, and the number an input reads on a mesh that has
// not its attribute; and in its extras' `courses`, the course table's rows (`world3d.plugin.ts`, The course table).
// `unpack(bytes)` reads it: each mesh the extras name with every input read off its attributes (meshopt-compressed
// views decoded), or its default, and its joints, weights and morph targets; the skin; the animations.
// `assemble(T, unpacked, looks, material)` puts every mesh's vertices into one geometry, each input its own
// attribute, and every triangle into the run of the draw call that draws its material (its vertices' `lookId`, the
// looks file's `call`): solid, relief, see-through, at most three calls, each drawn by `material(call)`.
//
// Moving things. A kit thing that moves (a tavern's ceiling fan) skins the glb's mesh `kit`: its JOINTS_0 and
// WEIGHTS_0 name the joints of the glb's one skin, joint 0 the node `kit bones` at the world's zero, which never moves,
// and each other joint a node `<thing> <bone>` under it at the bone's pivot. Then the glb is one THREE.SkinnedMesh in
// the same calls: its skeleton the skin's nodes as bones under the mesh with the skin's inverse bind matrices, every
// vertex of a mesh with no joints (the solids, the coverings, the timber) wholly on joint 0, so it stands where it was
// cut. A kit mesh with morph targets (sparse POSITION and NORMAL, named in the mesh's extras' `targetNames`) gives the
// geometry its morph attributes, nought on every other mesh's vertices. Three adds its skinning and morph chunks to
// supershader3d's materials for a skinned mesh, and the looks read the vertex's `position` and `normal` as cut, so a
// texture stays on the part that moves. A glb with no moving thing is a plain mesh. world3d plays the animations
// (`world3d.place.ts`, `played`).
//
// A glb of the wrong shape throws, naming what is wrong: no extras `vertex` (bake it again with the library's
// pro-ng/pack.mjs), a mesh the extras name that the glb has not, joints without a skin, meshes on more than one skin,
// morph targets on more than one mesh, a bone hanging from a node that is no joint, an animation moving what is not a
// bone's rotation, translation or scale, or not linear, or a node that is no joint; a vertex's `lookId` that is no material
// of the looks.
import type * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import type { Call, Looks } from './supershader3d.plugin.ts'

// a row of the course table as the glb lists it: its thing, its look, its courses' feet (heights off the ground)
// and its walls' thickness
export type CourseRow = { thing: string; look: string; feet: number[]; wallDepth: number }
// the extras' `vertex`: the meshes drawn, each input's numbers, each input's default
type Vertex = { meshes: string[]; attributes: Record<string, [string, number][]>; defaults: Record<string, number> }
export type Info = { courses: CourseRow[]; vertex: Vertex }
type Accessor = {
  bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean
  sparse?: { count: number; indices: { bufferView: number; byteOffset?: number; componentType: number }; values: { bufferView: number; byteOffset?: number } }
}
type Gltf = {
  nodes: { name: string; mesh?: number; skin?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; extras?: unknown }[]
  meshes: { primitives: { attributes: Record<string, number>; indices: number; targets?: Record<string, number>[] }[]; weights?: number[]; extras?: { targetNames?: string[] } }[]
  accessors: Accessor[]
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number; extensions?: { EXT_meshopt_compression?: { byteOffset?: number; byteLength: number; byteStride: number; count: number; mode: string; filter?: string } } }[]
  skins?: { joints: number[]; inverseBindMatrices: number }[]
  animations?: { name: string; channels: { sampler: number; target: { node?: number; path: string } }[]; samplers: { input: number; output: number; interpolation?: string }[] }[]
}

// a mesh's vertices: each input's numbers, `count` vertices of the input's width, and its index; on a skinned mesh
// its joints (the skin's) and weights, four a vertex, and on a mesh with morph targets each target's moves
type Mesh = {
  count: number; inputs: Record<string, Float32Array>; index: Uint32Array
  joints?: Float32Array; weights?: Float32Array; targets?: { position: Float32Array; normal?: Float32Array }[]; targetNames?: string[]; morphWeights?: number[]
}
// a bone of the skin: its node's name, the bone it hangs from (its number among the skin's joints, -1 for none) and
// its node's place
type Bone = { name: string; parent: number; translation: number[]; rotation: number[]; scale: number[] }
// a channel of an animation: the bone it moves (its number among the skin's joints), the property, and the keys'
// times and values, linear between keys
type Track = { joint: number; path: 'translation' | 'rotation' | 'scale'; times: Float32Array; values: Float32Array }
export type Unpacked = {
  info: Info; meshes: Mesh[]
  skin?: { bones: Bone[]; inverses: Float32Array }
  animations: { name: string; tracks: Track[] }[]
}

export const CALLS: Call[] = ['solid', 'relief', 'seeThrough']
const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const ARRAYS: Record<number, any> = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
const MOST: Record<number, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }
const PATHS = new Set(['translation', 'rotation', 'scale'])

export async function unpack(bytes: Uint8Array): Promise<Unpacked> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const jsonLength = view.getUint32(12, true)
  const gltf: Gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)))
  const bin = bytes.subarray(28 + jsonLength, 28 + jsonLength + view.getUint32(20 + jsonLength, true))
  await MeshoptDecoder.ready
  const views = gltf.bufferViews.map(v => {
    const m = v.extensions?.EXT_meshopt_compression
    if (!m) return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)
    const out = new Uint8Array(m.count * m.byteStride)
    MeshoptDecoder.decodeGltfBuffer(out, m.count, m.byteStride, bin.subarray(m.byteOffset || 0, (m.byteOffset || 0) + m.byteLength), m.mode, m.filter)
    return out
  })
  // `count` numbers of `width` of type `componentType` from a view, from `byteOffset`, `stride` bytes apart
  const numbers = (bufferView: number, byteOffset: number, componentType: number, count: number, width: number, normalized: boolean, out: Float32Array, place?: (n: number) => number) => {
    const Arr = ARRAYS[componentType]
    const every = new Arr(views[bufferView].slice().buffer)
    const stride = (gltf.bufferViews[bufferView].byteStride || width * Arr.BYTES_PER_ELEMENT) / Arr.BYTES_PER_ELEMENT
    const offset = byteOffset / Arr.BYTES_PER_ELEMENT
    for (let n = 0; n < count; n++) {
      const to = place ? place(n) : n
      for (let k = 0; k < width; k++) {
        const x = every[n * stride + offset + k]
        out[to * width + k] = normalized ? Math.max(x / MOST[componentType], -1) : x
      }
    }
  }
  const floatsOf = (i: number) => {
    const a = gltf.accessors[i]
    const width = WIDTH[a.type]
    const out = new Float32Array(a.count * width)
    if (a.bufferView !== undefined) numbers(a.bufferView, a.byteOffset || 0, a.componentType, a.count, width, !!a.normalized, out)
    if (a.sparse) {
      const s = a.sparse
      const at = new Float32Array(s.count)
      numbers(s.indices.bufferView, s.indices.byteOffset || 0, s.indices.componentType, s.count, 1, false, at)
      numbers(s.values.bufferView, s.values.byteOffset || 0, a.componentType, s.count, width, !!a.normalized, out, n => at[n])
    }
    return { floats: out, width }
  }
  const info = gltf.nodes.find(n => n.name === 'pro-ng')?.extras as Info | undefined
  if (!info?.vertex) throw new Error('supershader3d: the glb has no extras `vertex`; bake it again with the library\'s pro-ng/pack.mjs')
  const skinned = new Set<number>()
  const meshes = info.vertex.meshes.map((name): Mesh => {
    const node = gltf.nodes.find(n => n.name === name && n.mesh !== undefined)
    if (!node) throw new Error(`supershader3d: the glb's extras name the mesh ${name}, which it has not`)
    const mesh = gltf.meshes[node.mesh!]
    const prim = mesh.primitives[0]
    const count = gltf.accessors[prim.attributes.POSITION].count
    const read: Record<string, { floats: Float32Array; width: number }> = {}
    const inputs: Record<string, Float32Array> = {}
    for (const [input, numbers] of Object.entries(info.vertex.attributes)) {
      const out = new Float32Array(count * numbers.length).fill(info.vertex.defaults[input] ?? 0)
      if (numbers.every(([key]) => prim.attributes[key] !== undefined)) {
        for (const [key] of numbers) read[key] ??= floatsOf(prim.attributes[key])
        for (let n = 0; n < count; n++) numbers.forEach(([key, k], j) => { out[n * numbers.length + j] = read[key].floats[n * read[key].width + k] })
      }
      inputs[input] = out
    }
    const ia = gltf.accessors[prim.indices]
    const out: Mesh = { count, inputs, index: Uint32Array.from(new ARRAYS[ia.componentType](views[ia.bufferView!].slice().buffer)) }
    if (prim.attributes.JOINTS_0 !== undefined) {
      if (node.skin === undefined) throw new Error(`supershader3d: the glb's mesh ${name} has joints and no skin`)
      skinned.add(node.skin)
      out.joints = floatsOf(prim.attributes.JOINTS_0).floats
      out.weights = floatsOf(prim.attributes.WEIGHTS_0).floats
    }
    if (prim.targets?.length) {
      out.targets = prim.targets.map(t => ({ position: floatsOf(t.POSITION).floats, ...(t.NORMAL !== undefined ? { normal: floatsOf(t.NORMAL).floats } : {}) }))
      out.targetNames = mesh.extras?.targetNames
      out.morphWeights = mesh.weights
    }
    return out
  })
  if (skinned.size > 1) throw new Error(`supershader3d: the glb's meshes are skinned to ${skinned.size} skins, and it is drawn on one`)
  if (meshes.filter(m => m.targets).length > 1) throw new Error('supershader3d: more than one of the glb\'s meshes has morph targets, and a pose names its target by its number on the one')
  const unpacked: Unpacked = { info, meshes, animations: [] }
  const joints = skinned.size ? gltf.skins![[...skinned][0]].joints : []
  if (skinned.size) {
    const skin = gltf.skins![[...skinned][0]]
    const parentOf = new Map<number, number>()
    gltf.nodes.forEach((n, i) => n.children?.forEach(c => parentOf.set(c, i)))
    const bones = joints.map((j): Bone => {
      const n = gltf.nodes[j]
      const up = parentOf.get(j)
      return { name: n.name, parent: up === undefined ? -1 : joints.indexOf(up), translation: n.translation ?? [0, 0, 0], rotation: n.rotation ?? [0, 0, 0, 1], scale: n.scale ?? [1, 1, 1] }
    })
    bones.forEach((b, k) => {
      if (b.parent === -1 && parentOf.get(joints[k]) !== undefined) throw new Error(`supershader3d: the glb's bone ${b.name} hangs from a node that is no joint of its skin`)
    })
    unpacked.skin = { bones, inverses: floatsOf(skin.inverseBindMatrices).floats }
  }
  for (const a of gltf.animations ?? []) {
    const tracks = a.channels.map((c): Track => {
      const s = a.samplers[c.sampler]
      if (!PATHS.has(c.target.path)) throw new Error(`supershader3d: the glb's animation ${a.name} moves ${c.target.path}, which is not a bone's rotation, translation or scale`)
      if ((s.interpolation ?? 'LINEAR') !== 'LINEAR') throw new Error(`supershader3d: the glb's animation ${a.name} is ${s.interpolation}, and its clips are linear`)
      const path = c.target.path as Track['path']
      const joint = joints.indexOf(c.target.node!)
      if (joint < 0) throw new Error(`supershader3d: the glb's animation ${a.name} moves the node ${gltf.nodes[c.target.node!]?.name}, which is no joint of its skin`)
      return { joint, path, times: floatsOf(s.input).floats, values: floatsOf(s.output).floats }
    })
    unpacked.animations.push({ name: a.name, tracks })
  }
  return unpacked
}

// Every mesh in one geometry, each triangle in its call's run, drawn by that call's material (`material(call)`): a
// SkinnedMesh on the glb's skin when it has one, its bones under it, else a Mesh.
export function assemble(T: typeof THREE, { info, meshes, skin }: Unpacked, looks: Looks, material: (call: Call) => THREE.Material) {
  const total = meshes.reduce((n, m) => n + m.count, 0)
  const geo = new T.BufferGeometry()
  for (const [input, numbers] of Object.entries(info.vertex.attributes)) {
    const out = new Float32Array(total * numbers.length)
    let at = 0
    for (const m of meshes) { out.set(m.inputs[input], at * numbers.length); at += m.count }
    geo.setAttribute(input, new T.BufferAttribute(out, numbers.length))
  }
  const lookId = geo.getAttribute('lookId').array as Float32Array
  const runs: Record<Call, number[]> = { solid: [], relief: [], seeThrough: [] }
  let base = 0
  for (const m of meshes) {
    for (let i = 0; i < m.index.length; i++) {
      const v = base + m.index[i]
      const look = looks.materials[Math.round(lookId[v])]
      if (!look) throw new Error(`supershader3d: a vertex's lookId ${lookId[v]} is no material of the looks`)
      runs[look.call].push(v)
    }
    base += m.count
  }
  const index = new Uint32Array(CALLS.reduce((n, c) => n + runs[c].length, 0))
  const materials: THREE.Material[] = []
  let at = 0
  for (const call of CALLS) {
    if (!runs[call].length) continue
    index.set(runs[call], at)
    geo.addGroup(at, runs[call].length, materials.length)
    materials.push(material(call))
    at += runs[call].length
  }
  geo.setIndex(new T.BufferAttribute(index, 1))
  // the morph targets: each one's moves on its mesh's vertices, nought on every other's
  const morphed = meshes.find(m => m.targets)
  if (morphed) {
    const from = meshes.slice(0, meshes.indexOf(morphed)).reduce((n, m) => n + m.count, 0)
    const position: THREE.BufferAttribute[] = [], normal: THREE.BufferAttribute[] = []
    const normals = morphed.targets!.some(t => t.normal)
    for (const t of morphed.targets!) {
      const p = new Float32Array(total * 3)
      p.set(t.position, from * 3)
      position.push(new T.BufferAttribute(p, 3))
      if (normals) {
        const n = new Float32Array(total * 3)
        if (t.normal) n.set(t.normal, from * 3)
        normal.push(new T.BufferAttribute(n, 3))
      }
    }
    geo.morphAttributes.position = position
    if (normals) geo.morphAttributes.normal = normal
    geo.morphTargetsRelative = true
  }
  geo.computeBoundingSphere()
  if (!skin) {
    const mesh = new T.Mesh(geo, materials)
    if (morphed) prime(mesh, morphed)
    return mesh
  }
  // the joints and weights, four a vertex: a mesh with none wholly on joint 0, the bone that never moves
  const wide = skin.bones.length > 256
  const joints = wide ? new Uint16Array(total * 4) : new Uint8Array(total * 4)
  const weights = new Uint8Array(total * 4)
  base = 0
  for (const m of meshes) {
    if (m.joints) {
      joints.set(m.joints, base * 4)
      for (let i = 0; i < m.count * 4; i++) weights[base * 4 + i] = Math.round(m.weights![i] * 255)
    } else {
      for (let v = 0; v < m.count; v++) weights[(base + v) * 4] = 255
    }
    base += m.count
  }
  geo.setAttribute('skinIndex', new T.BufferAttribute(joints, 4))
  geo.setAttribute('skinWeight', new T.BufferAttribute(weights, 4, true))
  const mesh = new T.SkinnedMesh(geo, materials)
  const bones = skin.bones.map(b => {
    const bone = new T.Bone()
    bone.name = b.name
    bone.position.fromArray(b.translation)
    bone.quaternion.fromArray(b.rotation)
    bone.scale.fromArray(b.scale)
    return bone
  })
  skin.bones.forEach((b, k) => (b.parent < 0 ? mesh : bones[b.parent]).add(bones[k]))
  const inverses = skin.bones.map((_, k) => new T.Matrix4().fromArray(skin.inverses, k * 16))
  mesh.bind(new T.Skeleton(bones, inverses), new T.Matrix4())
  if (morphed) prime(mesh, morphed)
  return mesh
}

// a mesh's morph weights as the glb gives them, and its targets by their names
function prime(mesh: THREE.Mesh, m: Mesh) {
  mesh.updateMorphTargets()
  m.morphWeights?.forEach((w, i) => { mesh.morphTargetInfluences![i] = w })
  if (m.targetNames) mesh.morphTargetDictionary = Object.fromEntries(m.targetNames.map((n, i) => [n, i]))
}
