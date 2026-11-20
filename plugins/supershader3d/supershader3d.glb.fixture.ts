// A pro-ng glb written here as pro-ng's pack writes one, for the tests that read one (`supershader3d.glb.test.ts`,
// world3d's `world3d.plugin.test.ts`): a solid triangle; a kit quad skinned to a fan's rotor, which the animation
// `fan spin` turns once in a third of a second; a sign of two morph targets; and two course rows. `glbOf` writes the
// glb's bytes from what `made` makes.
import * as THREE from 'three'
import type { Looks } from './supershader3d.plugin.ts'
import type { CourseRow } from './supershader3d.glb.ts'

export const ROTOR = [2, 1, 0]
// a turn of `degrees` about up, as a quaternion [x, y, z, w]
export const about = (degrees: number) => [0, Math.sin((degrees * Math.PI) / 360), 0, Math.cos((degrees * Math.PI) / 360)]

export type Made = { gltf: any; bin: Uint8Array }
export function glbOf({ gltf, bin }: Made): Uint8Array {
  const pad = (n: number) => (4 - (n % 4)) % 4
  let text = JSON.stringify(gltf)
  text += ' '.repeat(pad(text.length))
  const json = new TextEncoder().encode(text)
  const data = new Uint8Array(bin.length + pad(bin.length))
  data.set(bin)
  const out = new Uint8Array(12 + 8 + json.length + 8 + data.length)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, out.length, true)
  v.setUint32(12, json.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  out.set(json, 20)
  v.setUint32(20 + json.length, data.length, true)
  v.setUint32(24 + json.length, 0x004e4942, true)
  out.set(data, 28 + json.length)
  return out
}

export const COURSE_ROWS: CourseRow[] = [
  { thing: 'keep', look: 'stone', feet: [0, 0.4, 0.9], wallDepth: 1.2 },
  { thing: 'hut', look: 'stone', feet: [0, 0.3], wallDepth: 0.5 },
]
export const LOOKS = {
  materials: [
    { name: 'stone', look: 'stone', call: 'solid', colour: [0.5, 0.5, 0.5] },
    { name: 'slate', look: 'slate', call: 'relief', colour: [0.2, 0.2, 0.3] },
  ],
} as unknown as Looks

// The glb: `courses` its course rows, `skinned` whether the kit is skinned to the fan's rotor (else every mesh plain
// and no animation), `extras` the `pro-ng` node's extras in place of its own.
export function made({ courses = COURSE_ROWS, skinned = true, extras }: { courses?: CourseRow[]; skinned?: boolean; extras?: unknown } = {}): Made {
  const chunks: Uint8Array[] = []
  let length = 0
  const bufferViews: any[] = [], accessors: any[] = []
  const WIDTHS: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }
  const add = (array: Float32Array | Uint16Array | Uint8Array, type: string, componentType: number) => {
    const bytes = new Uint8Array(array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength))
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length })
    chunks.push(bytes)
    length += bytes.length
    const gap = (4 - (length % 4)) % 4
    chunks.push(new Uint8Array(gap))
    length += gap
    accessors.push({ bufferView: bufferViews.length - 1, componentType, count: array.length / WIDTHS[type], type })
    return accessors.length - 1
  }
  const f = (...n: number[]) => add(new Float32Array(n), n.length % 3 ? 'SCALAR' : 'VEC3', 5126)
  const scalars = (...n: number[]) => add(new Float32Array(n), 'SCALAR', 5126)
  const index = (...n: number[]) => add(new Uint16Array(n), 'SCALAR', 5123)
  const up = f(0, 1, 0, 0, 1, 0, 0, 1, 0)
  // the solid: a triangle of the material 0, solid
  const solid = { primitives: [{ attributes: { POSITION: f(0, 0, 0, 1, 0, 0, 0, 0, 1), NORMAL: up, _LOOK: scalars(0, 0, 0) }, indices: index(0, 1, 2) }] }
  // the kit: a quad round the rotor of the material 1, relief, each corner wholly on joint 1, the rotor
  const [rx, ry, rz] = ROTOR
  const kitAttributes: Record<string, number> = {
    POSITION: f(rx + 0.5, ry, rz, rx, ry, rz + 0.5, rx - 0.5, ry, rz, rx, ry, rz - 0.5),
    NORMAL: f(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0),
    _LOOK: scalars(1, 1, 1, 1),
    // its material's number in the kit's own count, its thing's row and its part's number in its thing
    _KIT: f(1, 0, 3, 1, 0, 3, 1, 0, 3, 1, 0, 3),
  }
  if (skinned) {
    kitAttributes.JOINTS_0 = add(new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 'VEC4', 5121)
    kitAttributes.WEIGHTS_0 = add(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 'VEC4', 5126)
  }
  const kit = { primitives: [{ attributes: kitAttributes, indices: index(0, 1, 2, 0, 2, 3) }] }
  // the sign: a triangle with no look of its own (the input's default, 0), and two targets, one a metre along z, one up
  const sign = {
    primitives: [{
      attributes: { POSITION: f(5, 0, 0, 6, 0, 0, 5, 1, 0), NORMAL: up },
      indices: index(0, 1, 2),
      targets: [{ POSITION: f(0, 0, 1, 0, 0, 1, 0, 0, 1) }, { POSITION: f(0, 1, 0, 0, 1, 0, 0, 1, 0) }],
    }],
    weights: [0, 0],
    extras: { targetNames: ['out', 'up'] },
  }
  const vertex = {
    meshes: ['solid', 'kit', 'sign'],
    attributes: { position: [['POSITION', 0], ['POSITION', 1], ['POSITION', 2]], normal: [['NORMAL', 0], ['NORMAL', 1], ['NORMAL', 2]], lookId: [['_LOOK', 0]], lookInfo: [['_KIT', 0], ['_KIT', 1], ['_KIT', 2]] },
    defaults: { lookId: 0, lookInfo: -1 },
  }
  const nodes: any[] = [
    { name: 'pro-ng', extras: extras ?? { vertex, courses } },
    { name: 'solid', mesh: 0 },
    { name: 'kit', mesh: 1, ...(skinned ? { skin: 0 } : {}) },
    { name: 'sign', mesh: 2 },
  ]
  const gltf: any = { asset: { version: '2.0' }, nodes, meshes: [solid, kit, sign], accessors, bufferViews, buffers: [] }
  if (skinned) {
    nodes.push({ name: 'kit bones', children: [5] }, { name: 'fan rotor', translation: ROTOR })
    const inverses = new Float32Array(32)
    new THREE.Matrix4().toArray(inverses, 0)
    new THREE.Matrix4().makeTranslation(-rx, -ry, -rz).toArray(inverses, 16)
    gltf.skins = [{ joints: [4, 5], inverseBindMatrices: add(inverses, 'MAT4', 5126) }]
    const times = scalars(0, 1 / 12, 2 / 12, 3 / 12, 4 / 12)
    const turns = add(new Float32Array([0, 90, 180, 270, 360].flatMap(about)), 'VEC4', 5126)
    gltf.animations = [{ name: 'fan spin', channels: [{ sampler: 0, target: { node: 5, path: 'rotation' } }], samplers: [{ input: times, output: turns }] }]
  }
  const bin = new Uint8Array(length)
  let at = 0
  for (const c of chunks) { bin.set(c, at); at += c.length }
  gltf.buffers = [{ byteLength: bin.length }]
  return { gltf, bin }
}
