// Prints each glb's materials and image names, read off its JSON chunk.
//   node glb-materials.mjs <a.glb> [<b.glb> ...]
import { readFileSync } from 'node:fs'
for (const p of process.argv.slice(2)) {
  const b = readFileSync(p)
  const len = b.readUInt32LE(12)
  const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8'))
  console.log(p, JSON.stringify({ materials: j.materials, images: j.images?.map(i => i.name ?? i.mimeType) }, null, 1))
}
