// A glb read and written on node, for a bake's tool that works on a model's numbers (`garment.ts`).
//
// `read(bytes)` hands back the glb's JSON, `numbers(accessor)`, every number of one of its accessors as
// floats (a view gltfpack compressed, `EXT_meshopt_compression`, decoded; a normalized integer taken to
// -1..1 or 0..1), `indices(accessor)` as whole numbers, and `world(node)`, a node's matrix in the glb's
// own frame: its own times every node's above it, sixteen numbers column by column as glTF writes one.
//
// `write(file, nodes)` writes a glb of plain meshes, one node each of one primitive: `{ name, position,
// uv?, index, extras? }`, positions three floats a vertex, uv two, the node's extras as given. Nothing
// is packed: a bake packs it (`Tools.pack`).
import fs from 'node:fs'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

type Accessor = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; normalized?: boolean }
export type Gltf = {
  scenes: { nodes: number[] }[]; scene?: number
  nodes: { name?: string; mesh?: number; skin?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[]; extras?: unknown }[]
  meshes: { name?: string; primitives: { attributes: Record<string, number>; indices?: number; mode?: number }[] }[]
  accessors: Accessor[]
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number; extensions?: { EXT_meshopt_compression?: { byteOffset?: number; byteLength: number; byteStride: number; count: number; mode: string; filter?: string } } }[]
  skins?: { joints: number[]; inverseBindMatrices?: number }[]
}

const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const READ: Record<number, [keyof DataView, number, number]> = {
  5120: ['getInt8', 1, 127], 5121: ['getUint8', 1, 255], 5122: ['getInt16', 2, 32767], 5123: ['getUint16', 2, 65535], 5125: ['getUint32', 4, 1], 5126: ['getFloat32', 4, 1],
}

// a × b, each sixteen numbers column by column
export function times(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return out
}
// the matrix of a place, a turn [x, y, z, w] and a scale
export function composed(t: number[] = [0, 0, 0], q: number[] = [0, 0, 0, 1], s: number[] = [1, 1, 1]): number[] {
  const [x, y, z, w] = q
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]
}
// the inverse of a matrix whose last row is 0 0 0 1
export function inverse(m: ArrayLike<number>): number[] {
  const [a, b, c, , d, e, f, , g, h, i, , x, y, z] = Array.from(m)
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g
  const det = a * A + b * B + c * C
  if (!(Math.abs(det) > 0)) throw new Error('a matrix with no inverse')
  const r = [A / det, (c * h - b * i) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, (c * d - a * f) / det, C / det, (b * g - a * h) / det, (a * e - b * d) / det]
  return [
    r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0,
    -(r[0] * x + r[3] * y + r[6] * z), -(r[1] * x + r[4] * y + r[7] * z), -(r[2] * x + r[5] * y + r[8] * z), 1,
  ]
}
// a point through a matrix
export const moved = (m: ArrayLike<number>, p: ArrayLike<number>, at = 0): number[] => [
  m[0] * p[at] + m[4] * p[at + 1] + m[8] * p[at + 2] + m[12],
  m[1] * p[at] + m[5] * p[at + 1] + m[9] * p[at + 2] + m[13],
  m[2] * p[at] + m[6] * p[at + 1] + m[10] * p[at + 2] + m[14],
]

export async function read(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb: it does not start with glTF')
  const jsonLength = view.getUint32(12, true)
  const gltf: Gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)))
  const bin = bytes.subarray(28 + jsonLength, 28 + jsonLength + view.getUint32(20 + jsonLength, true))
  await MeshoptDecoder.ready
  const views = new Map<number, Uint8Array>()
  const viewOf = (i: number) => {
    let out = views.get(i)
    if (!out) {
      const v = gltf.bufferViews[i], m = v.extensions?.EXT_meshopt_compression
      if (m) {
        out = new Uint8Array(m.count * m.byteStride)
        MeshoptDecoder.decodeGltfBuffer(out, m.count, m.byteStride, bin.subarray(m.byteOffset ?? 0, (m.byteOffset ?? 0) + m.byteLength), m.mode, m.filter ?? 'NONE')
      } else out = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)
      views.set(i, out)
    }
    return out
  }
  const every = (i: number, normalize: boolean) => {
    const a = gltf.accessors[i]
    if (a.bufferView === undefined) throw new Error(`the glb's accessor ${i} has no buffer view`)
    const width = WIDTH[a.type], [get, size, most] = READ[a.componentType]
    const data = viewOf(a.bufferView), v = gltf.bufferViews[a.bufferView]
    const stride = v.extensions?.EXT_meshopt_compression?.byteStride ?? v.byteStride ?? width * size
    const dv = new DataView(data.buffer, data.byteOffset + (a.byteOffset ?? 0))
    const out = new Float64Array(a.count * width)
    for (let n = 0; n < a.count; n++)
      for (let k = 0; k < width; k++) {
        const x = (dv[get] as (at: number, little: boolean) => number)(n * stride + k * size, true)
        out[n * width + k] = normalize && a.normalized ? Math.max(x / most, -1) : x
      }
    return out
  }
  const above = new Map<number, number>()
  gltf.nodes.forEach((n, i) => n.children?.forEach(c => above.set(c, i)))
  const own = (i: number) => gltf.nodes[i].matrix ?? composed(gltf.nodes[i].translation, gltf.nodes[i].rotation, gltf.nodes[i].scale)
  const world = (i: number): number[] => (above.has(i) ? times(world(above.get(i)!), own(i)) : own(i))
  return { gltf, numbers: (i: number) => every(i, true), indices: (i: number) => Uint32Array.from(every(i, false)), world }
}

export type Written = { name: string; position: Float32Array; uv?: Float32Array; index: Uint32Array; extras?: Record<string, unknown> }

export function write(file: string, nodes: Written[]) {
  const chunks: Buffer[] = []
  let length = 0
  const bufferViews: Record<string, unknown>[] = [], accessors: Record<string, unknown>[] = []
  const add = (data: Float32Array | Uint32Array, type: string, target: number, bounds: boolean) => {
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length, target })
    chunks.push(bytes)
    length += bytes.length
    const width = WIDTH[type]
    const a: Record<string, unknown> = { bufferView: bufferViews.length - 1, componentType: data instanceof Uint32Array ? 5125 : 5126, count: data.length / width, type }
    if (bounds) {
      const min = new Array(width).fill(Infinity), max = new Array(width).fill(-Infinity)
      for (let i = 0; i < data.length; i++) {
        min[i % width] = Math.min(min[i % width], data[i])
        max[i % width] = Math.max(max[i % width], data[i])
      }
      Object.assign(a, { min, max })
    }
    accessors.push(a)
    return accessors.length - 1
  }
  const meshes = nodes.map(n => ({
    primitives: [{
      attributes: { POSITION: add(n.position, 'VEC3', 34962, true), ...(n.uv ? { TEXCOORD_0: add(n.uv, 'VEC2', 34962, false) } : {}) },
      indices: add(n.index, 'SCALAR', 34963, false),
    }],
  }))
  const gltf = {
    asset: { version: '2.0', generator: 'core scripts/glb.ts' },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes: nodes.map((n, i) => ({ name: n.name, mesh: i, ...(n.extras ? { extras: n.extras } : {}) })),
    meshes, accessors, bufferViews, buffers: [{ byteLength: length }],
  }
  const text = Buffer.from(JSON.stringify(gltf), 'utf8')
  const json = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
  const body = Buffer.concat(chunks)
  const head = Buffer.alloc(20)
  head.writeUInt32LE(0x46546c67, 0)
  head.writeUInt32LE(2, 4)
  head.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8)
  head.writeUInt32LE(json.length, 12)
  head.writeUInt32LE(0x4e4f534a, 16)
  const binHead = Buffer.alloc(8)
  binHead.writeUInt32LE(body.length, 0)
  binHead.writeUInt32LE(0x004e4942, 4)
  fs.mkdirSync(new URL('.', `file://${file}`).pathname, { recursive: true })
  fs.writeFileSync(file, Buffer.concat([head, json, binHead, body]))
}
