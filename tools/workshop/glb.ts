// A glb's named empties read and written in place, in node: the JSON chunk is parsed, each point's
// node given its translation and rotation (added as a root node of the default scene when the glb has
// none of that name), and the glb written again with its JSON chunk padded to four bytes with spaces
// and its binary chunk as it was. No Blender run: a point is a number the workshop tunes, and the glb
// is where the game reads it, as it reads `muzzle`.

import fs from 'node:fs'

export type Point = { at: number[]; turn: number[] } // metres, and a quaternion [x, y, z, w]

type Gltf = { nodes?: { name?: string; translation?: number[]; rotation?: number[]; mesh?: number; children?: number[] }[]; scenes?: { nodes?: number[] }[]; scene?: number }

function chunks(buf: Buffer) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb')
  const jsonLen = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('the glb\'s first chunk is not JSON')
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as Gltf
  const rest = buf.subarray(20 + jsonLen) // the binary chunk with its header, or nothing
  return { json, rest }
}

function write(file: string, json: Gltf, rest: Buffer) {
  let text = Buffer.from(JSON.stringify(json), 'utf8')
  const pad = (4 - (text.length % 4)) % 4
  if (pad) text = Buffer.concat([text, Buffer.alloc(pad, 0x20)])
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(20 + text.length + rest.length, 8)
  header.writeUInt32LE(text.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  // Written beside and renamed over, so a reader never sees half a file.
  fs.writeFileSync(file + '.tmp', Buffer.concat([header, text, rest]))
  fs.renameSync(file + '.tmp', file)
}

// Every empty (a node with no mesh and no children) by name, with its translation and rotation.
export function readPoints(file: string): Record<string, Point> {
  const { json } = chunks(fs.readFileSync(file))
  const out: Record<string, Point> = {}
  for (const n of json.nodes ?? []) {
    if (n.mesh !== undefined || n.children?.length || !n.name) continue
    out[n.name] = { at: n.translation ?? [0, 0, 0], turn: n.rotation ?? [0, 0, 0, 1] }
  }
  return out
}

export function writePoints(file: string, points: Record<string, Point>) {
  const { json, rest } = chunks(fs.readFileSync(file))
  json.nodes ??= []
  for (const [name, p] of Object.entries(points)) {
    let node = json.nodes.find(n => n.name === name)
    if (node && (node.mesh !== undefined || node.children?.length)) throw new Error(`${name} is a node with a mesh or children in the glb, not an empty`)
    if (!node) {
      node = { name }
      json.nodes.push(node)
      const scene = (json.scenes ??= [{ nodes: [] }])[json.scene ?? 0]
      ;(scene.nodes ??= []).push(json.nodes.length - 1)
    }
    node.translation = p.at
    node.rotation = p.turn
  }
  write(file, json, rest)
}
