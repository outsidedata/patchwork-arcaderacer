// A glb packed by gltfpack (`EXT_meshopt_compression`) written back out with its buffer views decoded,
// for a tool that cannot decode meshopt itself: Blender's glTF importer refuses the extension, so
// `render_glb.py` reads a bake through this. Every buffer view the extension compresses is decoded by
// three's meshopt decoder (the one the loader hands its glTF loader) into one plain buffer,
// beside the views that were never compressed (the images), and the extension and gltfpack's fallback
// buffer are dropped. The quantized attributes (`KHR_mesh_quantization`) are left as they are.
//
//   node unpack_glb.mjs <packed.glb> <out.glb>
import { readFileSync, writeFileSync } from 'node:fs'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const [input, output] = process.argv.slice(2)
const EXT = 'EXT_meshopt_compression'

const bytes = readFileSync(input)
const jsonLength = bytes.readUInt32LE(12)
const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'))
// The binary chunk's data, after its own 8-byte header.
const binStart = 20 + jsonLength
const bin = bytes.subarray(binStart + 8, binStart + 8 + bytes.readUInt32LE(binStart))
if (gltf.buffers.findIndex(b => b.uri === undefined && !b.extensions?.[EXT]) !== 0)
  throw new Error(`${input}: buffer 0 is not the glb's binary chunk`)

await MeshoptDecoder.ready
const pieces = []
let offset = 0
for (const view of gltf.bufferViews) {
  const ext = view.extensions?.[EXT]
  let data
  if (ext) {
    if (ext.buffer !== 0) throw new Error(`${input}: a compressed view reads buffer ${ext.buffer}, not the binary chunk`)
    data = new Uint8Array(ext.count * ext.byteStride)
    const source = bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength)
    MeshoptDecoder.decodeGltfBuffer(data, ext.count, ext.byteStride, source, ext.mode, ext.filter ?? 'NONE')
    delete view.extensions[EXT]
    if (!Object.keys(view.extensions).length) delete view.extensions
  } else {
    if (view.buffer !== 0) throw new Error(`${input}: an uncompressed view reads buffer ${view.buffer}, not the binary chunk`)
    data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
  }
  const pad = (16 - (offset % 16)) % 16
  if (pad) pieces.push(new Uint8Array(pad))
  offset += pad
  view.buffer = 0
  view.byteOffset = offset
  view.byteLength = data.length
  pieces.push(data)
  offset += data.length
}
const tail = (4 - (offset % 4)) % 4
if (tail) pieces.push(new Uint8Array(tail))
const body = Buffer.concat(pieces)
gltf.buffers = [{ byteLength: body.length }]
gltf.extensionsUsed = (gltf.extensionsUsed ?? []).filter(e => e !== EXT)
if (gltf.extensionsRequired) gltf.extensionsRequired = gltf.extensionsRequired.filter(e => e !== EXT)
if (!gltf.extensionsRequired?.length) delete gltf.extensionsRequired

const text = Buffer.from(JSON.stringify(gltf), 'utf8')
const json = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)])
const head = Buffer.alloc(28)
head.writeUInt32LE(0x46546c67, 0)
head.writeUInt32LE(2, 4)
head.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8)
head.writeUInt32LE(json.length, 12)
head.writeUInt32LE(0x4e4f534a, 16)
const binHead = Buffer.alloc(8)
binHead.writeUInt32LE(body.length, 0)
binHead.writeUInt32LE(0x004e4942, 4)
writeFileSync(output, Buffer.concat([head.subarray(0, 20), json, binHead, body]))
console.log(`${output}: ${gltf.bufferViews.length} views, ${body.length} bytes unpacked from ${bytes.length}`)
