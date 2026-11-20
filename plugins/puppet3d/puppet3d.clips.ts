// puppet3d's clips from a body: a kind posed by puppet3d's own code, walking and standing, written into a
// copy of its glb as two ordinary animations, `walk` and `idle`, so crowd3d bakes and plays it like any
// Mixamo clip and an animal can stand or walk in a crowd. The reverse of `puppet3d.cues.py`. Run by hand
// or by a game's bake:
//
//   node --experimental-strip-types plugins/puppet3d/puppet3d.clips.ts <scene.json> <kind> <out.glb> \
//       rate=<frames a second> walk=<metres a second>,<sense>,<settle seconds> idle=<seconds> \
//       mods=<a.puppet3d.ts>,<b.puppet3d.ts>,…
//
// Every input is named on the command. `<scene.json>` is a scene that draws `<kind>` by puppet3d: its
// `world.defs` names the definitions, its catalogue every skeleton, skin and sheet, its
// `prefabs.engine.dt` the step and its `prefabs[<kind>]` the row's fields its senses read. `mods=` is the
// file of each mod its `world.puppet3d.mods.behaviors` names, in that order, each one's `behaviors()`
// laid over the last as the plugin lays them.
//
// The body is posed by `stand`, `stepped`, `sensed` and `stood`, as the plugin poses it, on flat ground at
// height 0, a step of the scene's `dt` at a time; a frame is written every `1 / rate` seconds, which must
// be a whole number of steps.
//   walk  the row goes straight ahead (+z) from the origin at `<metres a second>`, its `vel` that speed.
//         It walks `<settle seconds>` first, so its gait has settled, then on to where the sense `<sense>`
//         (one the kind names, such as `stride` from the solver's `sprawlStride`) next comes round (falls
//         back), and the clip is the frames from there to where it comes round again, both ends kept:
//         one whole stride, its hips going ahead, which crowd3d takes off and hands out as `travel`.
//   idle  the row stands at the origin, its `vel` 0, and the clip is `<seconds>` of it from the clock's 0,
//         both ends kept.
//
// Only the layout on the world is written, the one the glb's skin is: crowd3d draws one skeleton a body,
// so a layout hung on it (the rider on the horse) is not in its clips. Each joint of the glb's skin is the
// bone of the layout's skeleton of its name. Where puppet3d draws a bone is its frame (`frame`: its head,
// its length along y, its across along z), and its skin puts a vertex through that frame times the
// inverse of its rest frame; so each joint's place in the world in a frame is that turn times where the
// glb binds it (the inverse of its inverse bind matrix), and its translation and rotation are written as
// its parent's place undone from it. The glb is written with its own nodes, meshes and buffer as they
// were, and each clip a sampler a joint for its translation and one for its rotation, linear, appended
// to its buffer; an animation of the same name it already had is replaced.
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { frame, sensed, sheetsOf, solvers, stand, stepped, stood, type Behaviors, type Bone, type BoneCues, type Def, type Ridden, type Skeleton, type Solver } from './puppet3d.plugin.ts'

const root = path.join(import.meta.dirname, '..', '..')
type Glb = { json: any; bin: Buffer }

function readGlb(file: string): Glb {
  const b = fs.readFileSync(file)
  const jsonLength = b.readUInt32LE(12)
  const json = JSON.parse(b.subarray(20, 20 + jsonLength).toString('utf8'))
  const at = 20 + jsonLength
  const bin = at < b.length ? b.subarray(at + 8, at + 8 + b.readUInt32LE(at)) : Buffer.alloc(0)
  return { json, bin }
}

function writeGlb(file: string, { json, bin }: Glb) {
  const pad = (b: Buffer, fill: number) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4, fill)])
  const j = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20), d = pad(bin, 0)
  const head = Buffer.alloc(12), jh = Buffer.alloc(8), dh = Buffer.alloc(8)
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + j.length + 8 + d.length, 8)
  jh.writeUInt32LE(j.length, 0); jh.writeUInt32LE(0x4e4f534a, 4)
  dh.writeUInt32LE(d.length, 0); dh.writeUInt32LE(0x004e4942, 4)
  fs.writeFileSync(file, Buffer.concat([head, jh, j, dh, d]))
}

// A node's own matrix, from its `matrix` or its translation, rotation and scale.
function local(n: any): THREE.Matrix4 {
  if (n.matrix) return new THREE.Matrix4().fromArray(n.matrix)
  return new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])))
}

// The floats of an accessor of the glb.
function floats({ json, bin }: Glb, index: number): Float32Array {
  const a = json.accessors[index], v = json.bufferViews[a.bufferView]
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type as string]!
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
  return new Float32Array(bin.buffer.slice(bin.byteOffset + start, bin.byteOffset + start + a.count * size * 4))
}

// One bone's turn in a frame: its frame as drawn times its rest frame undone.
function turnOf(posed: Bone, rest: Bone): THREE.Matrix4 {
  const m = frame(THREE, posed, new THREE.Matrix4())
  return m.multiply(frame(THREE, rest, new THREE.Matrix4()).invert())
}

const args = process.argv.slice(2)
const named = Object.fromEntries(args.slice(3).map(a => a.split('=', 2) as [string, string]))
if (args.length !== 7 || !named.rate || !named.walk || !named.idle || !named.mods) {
  console.error('puppet3d clips: <scene.json> <kind> <out.glb> rate=<frames a second> walk=<metres a second>,<sense>,<settle seconds> idle=<seconds> mods=<a.puppet3d.ts>,…')
  process.exit(1)
}
const [sceneFile, kind, out] = args
const rate = Number(named.rate), [walkSpeed, walkSense, settle] = named.walk.split(','), idleFor = Number(named.idle)
const scene = JSON.parse(fs.readFileSync(sceneFile, 'utf8'))
const world = scene.world, assets = world.loader.assets as Record<string, { url: string }>
const fileOf = (entry: string) => {
  const a = assets[entry]
  if (!a) throw new Error(`puppet3d clips: ${sceneFile}'s catalogue has no entry ${entry}`)
  return path.join(root, a.url.replace(/^\//, ''))
}
const read = (entry: string) => JSON.parse(fs.readFileSync(fileOf(entry), 'utf8'))
const d = read(world.defs)[kind] as Def
if (!d?.layouts) throw new Error(`puppet3d clips: ${world.defs} has no puppet3d definition of ${kind}`)
const mods = await Promise.all(named.mods.split(',').map(f => import(path.resolve(f)) as Promise<{ behaviors: Behaviors }>))
const table: Record<string, Solver> = Object.assign({}, ...mods.map(m => m.behaviors()))
const { drivers, blocks } = solvers(d, table, read)
const sheets = Object.fromEntries(sheetsOf(d).map(e => [e, read(e) as BoneCues]))
const names = Object.keys(d.layouts), first = names.find(n => d.layouts[n].on === 'world')!
const sks = names.map(n => ({ ...read(d.layouts[n].skeleton), entry: d.layouts[n].skeleton }) as Skeleton)
const rest = sks[names.indexOf(first)].bones
const dt = scene.prefabs.engine.dt as number, every = Math.round(1 / (rate * dt))
if (Math.abs(every * rate * dt - 1) > 1e-6) throw new Error(`puppet3d clips: a frame every 1/${rate} s is not a whole number of steps of ${dt} s`)
const flat = () => 0

// The glb, and each joint of its skin: its node, the bone of its name, where the glb binds it.
const glb = readGlb(fileOf(d.layouts[first].skin))
const skin = glb.json.skins[0], ibm = floats(glb, skin.inverseBindMatrices)
const parentOf: number[] = []
glb.json.nodes.forEach((n: any, i: number) => { for (const c of n.children ?? []) parentOf[c] = i })
const worldOf = (i: number): THREE.Matrix4 => parentOf[i] === undefined ? local(glb.json.nodes[i]) : worldOf(parentOf[i]).multiply(local(glb.json.nodes[i]))
const joints = (skin.joints as number[]).map((node, k) => {
  const name = glb.json.nodes[node].name as string, bone = rest.findIndex(b => b.name === name)
  if (bone < 0) throw new Error(`puppet3d clips: the skin's joint ${name} is no bone of ${kind}'s ${first}`)
  return { node, bone, bound: new THREE.Matrix4().fromArray(ibm, k * 16).invert() }
})
const isJoint = new Map(joints.map((j, k) => [j.node, k]))

// One frame: each joint's translation and rotation, from the layout's bones as puppet3d stands them.
function pose(list: Bone[]) {
  const placed: THREE.Matrix4[] = joints.map(j => turnOf(list[j.bone], rest[j.bone]).multiply(j.bound))
  return joints.map((j, k) => {
    const p = parentOf[j.node], up = p === undefined ? new THREE.Matrix4() : isJoint.has(p) ? placed[isJoint.get(p)!] : worldOf(p)
    const m = up.clone().invert().multiply(placed[k])
    const t = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
    m.decompose(t, q, s)
    return { t, q }
  })
}

// A clip: the row moved at `speed` ahead, stood first, settled for `settle` seconds, then from where
// `sense` comes round (or the clock's 0, with none) to where it comes round again, or for `length`.
function record(speed: number, settleFor: number, sense?: string, length?: number) {
  const data = structuredClone(scene.prefabs[kind] ?? {})
  const at: Ridden = { pos: [0, 0, 0], yaw: 0, vel: [0, 0, speed] }
  const s = stand(kind, d, table, blocks, sks, at, flat, data)
  let clock = 0, n = 0
  const go = () => {
    at.pos = [at.pos[0], 0, at.pos[2] + speed * dt]
    stepped(table, drivers, blocks, s, data, at, dt, flat)
    clock += dt
    n++
  }
  const senses = () => sensed(kind, d, table, drivers, s, data, at, clock)
  while (clock < settleFor - 1e-9) go()
  if (sense !== undefined) {
    if (!(sense in d.senses)) throw new Error(`puppet3d clips: ${kind} names no sense ${sense}`)
    let was = senses()[sense]
    for (let i = 0; ; i++) {
      if (i > 100000) throw new Error(`puppet3d clips: ${kind}'s ${sense} never comes round`)
      go()
      const now = senses()[sense]
      if (now < was) break
      was = now
    }
  }
  const frames: ReturnType<typeof pose>[] = []
  const take = () => frames.push(pose(stood(kind, d, table, blocks, sheets, s, senses(), at)[first]))
  take()
  if (sense !== undefined) {
    let was = senses()[sense], k = 0
    for (;;) {
      go()
      const now = senses()[sense]
      if (now < was && k > 0) { while (n % every) go(); take(); break }
      was = now
      if (n % every === 0) { take(); k++ }
    }
  } else {
    while (frames.length - 1 < Math.round(length! * rate)) { for (let i = 0; i < every; i++) go(); take() }
  }
  return frames
}

// The clip `name` appended to the glb: its frames' times, and a sampler a joint for each of translation
// and rotation.
function append(name: string, frames: ReturnType<typeof pose>[]) {
  const j = glb.json
  const parts: Buffer[] = [glb.bin]
  let offset = glb.bin.length
  const add = (data: Float32Array, type: string, extra: object = {}) => {
    const pad = (4 - (offset % 4)) % 4
    parts.push(Buffer.alloc(pad)); offset += pad
    const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    j.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length })
    parts.push(bytes); offset += bytes.length
    j.accessors.push({ bufferView: j.bufferViews.length - 1, componentType: 5126, count: data.length / { SCALAR: 1, VEC3: 3, VEC4: 4 }[type]!, type, ...extra })
    return j.accessors.length - 1
  }
  const times = Float32Array.from(frames.map((_, i) => i / rate))
  const input = add(times, 'SCALAR', { min: [0], max: [times[times.length - 1]] })
  const samplers: object[] = [], channels: object[] = []
  joints.forEach((jt, k) => {
    const t = add(Float32Array.from(frames.flatMap(f => f[k].t.toArray())), 'VEC3')
    const q = add(Float32Array.from(frames.flatMap(f => f[k].q.toArray())), 'VEC4')
    samplers.push({ input, output: t, interpolation: 'LINEAR' }, { input, output: q, interpolation: 'LINEAR' })
    channels.push({ sampler: samplers.length - 2, target: { node: jt.node, path: 'translation' } }, { sampler: samplers.length - 1, target: { node: jt.node, path: 'rotation' } })
  })
  glb.bin = Buffer.concat(parts)
  j.buffers[0].byteLength = glb.bin.length
  j.animations = [...(j.animations ?? []).filter((a: any) => a.name !== name), { name, samplers, channels }]
  return times[times.length - 1]
}

const walkFrames = record(Number(walkSpeed), Number(settle), walkSense)
const walkLength = append('walk', walkFrames)
const idleFrames = record(0, 0, undefined, idleFor)
const idleLength = append('idle', idleFrames)
writeGlb(out, glb)
console.log(`CLIPS ${out} ${kind}'s ${first}: walk ${walkFrames.length} frames, ${walkLength.toFixed(3)} s at ${walkSpeed} m/s; idle ${idleFrames.length} frames, ${idleLength.toFixed(3)} s; ${joints.length} joints`)
