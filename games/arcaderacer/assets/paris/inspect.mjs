// Prints what a glb holds, to check an export against what its script meant: each material's maps,
// alpha mode, factors and extensions, each image's size in bytes, each mesh's primitives (their
// material, attributes and triangle count), and each node's extras.
//   node games/arcaderacer/assets/paris/inspect.mjs <file.glb>
import { readFileSync } from 'node:fs'

const buf = readFileSync(process.argv[2])
const jsonLength = buf.readUInt32LE(12)
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString())
for (const [k, m] of (gltf.materials ?? []).entries()) {
  const pbr = m.pbrMetallicRoughness ?? {}
  const maps = Object.entries({ ...pbr, normal: m.normalTexture, emissive: m.emissiveTexture }).filter(([, v]) => v && v.index !== undefined).map(([n, v]) => `${n}:${v.index}`)
  console.log(`material ${k} ${m.name}: alpha ${m.alphaMode ?? 'OPAQUE'}${m.alphaCutoff !== undefined ? ` cutoff ${m.alphaCutoff}` : ''} doubleSided ${!!m.doubleSided} maps [${maps.join(', ')}] base ${JSON.stringify(pbr.baseColorFactor ?? null)} metal ${pbr.metallicFactor ?? 1} rough ${pbr.roughnessFactor ?? 1} emissive ${JSON.stringify(m.emissiveFactor ?? null)} ext ${JSON.stringify(m.extensions ?? {})}`)
}
for (const [k, t] of (gltf.textures ?? []).entries()) {
  const img = gltf.images[t.source]
  const view = gltf.bufferViews[img.bufferView]
  console.log(`texture ${k}: image ${t.source} ${img.name} ${img.mimeType} ${view.byteLength} bytes`)
}
let total = 0
for (const mesh of gltf.meshes ?? []) {
  const parts = mesh.primitives.map(p => {
    const tris = (p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count) / 3
    total += tris
    return `${gltf.materials[p.material]?.name}(${Object.keys(p.attributes).join('+')}, ${tris})`
  })
  console.log(`mesh ${mesh.name}: ${parts.join(' ')}`)
}
for (const node of gltf.nodes ?? []) if (node.extras) console.log(`node ${node.name}: extras ${JSON.stringify(node.extras)}`)
console.log('triangles in all', total)
