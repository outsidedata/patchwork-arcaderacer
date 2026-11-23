// The garment tool of a bake (`bake.ts`, `Tools.garment`): a garment of the library's garment shop draped
// on a game's own body and written as the fabric fabric3d's `garment` cut reads
// (`plugins/fabric3d/fabric3d.garment.ts`).
//
//
// `garment(spec, with)` is the tool. `spec` is
//   body     the game's baked body, a glb with one skin (anim's export, say): the garment is draped on it
//            as it stands at rest in that file, T-posed, which the shop asks of a figure
//   figure   the name the shop keeps that body under as a figure (`Trades/garment/figures/<figure>/` in the
//            library), made again from the body on every bake
//   kit      a kit of the shop (`Trades/garment/store/kits/<kit>/`), `config` one of its configs, and `garment`
//            the name of the one of the piece's garments to write (a kit of one garment names it as the
//            kit does: the skirt kit's is `skirt`)
//   out      the glb to write; the sidecar is written beside it, `<out less .glb>.garment.json`
// It runs the library's `Trades/garment/game/drape.mjs` on the body (by the draper `GARMENT_DRAPER` names in the
// shell or the root's `.env`, a machine with a GPU, else here, where a drape takes minutes), and writes:
//   the glb      a mesh for each piece of the garment's pattern, named for the piece, its points where the
//                drape left them on the body, in the body's model's own frame, metres; a vertex's uv where
//                it lies on the cloth as it was cut flat, metres; packed by gltfpack with every attribute kept
//                (`-kv`, since a piece has no material) and no number rounded (`-noq`, since two pieces
//                share the points of their seam)
//   the sidecar  `{ garment, kit, config, body, pieces, points, triangles, stood, drape }` (`Garment`,
//                `plugins/loader/loader.fabric3d.ts`): the pieces in the pattern's order, how many points
//                the garment has with its seams joined, each of the body's bones by its name with the
//                frame it stood in, and the drape's record as the shop gives it
// Then it reads the packed glb back and throws unless it holds every piece and joins to the points the
// sidecar says: what the page will cut the fabric from is what was baked. A drape the shop fails, a garment
// the piece has not, and a piece whose name three would change (anything but letters, digits, _ and -) each
// throw, naming it.
//
// `body(glb)` reads a baked body: every skinned mesh of it as it stands at rest, in the model's own frame
// (the frame its root is drawn in: metres, y up), and each bone's frame at rest there.
// `obj(body)` is that body as the obj the shop makes a figure of.
import fs from 'node:fs'
import path from 'node:path'
import type { Garment } from '#plugins/loader/loader.fabric3d.ts'
import { joined } from '#plugins/loader/loader.fabric3d.ts'
import { moved, read, times, write } from './glb.ts'

export type GarmentSpec = { body: string; figure: string; kit: string; config: string; garment: string; out: string }
// What the tool is handed of the bake: the library, a scratch path, the packer, and node run on a script
// of the library's with the bake's environment.
export type GarmentWith = {
  library: string
  scratch: (name: string) => string
  pack: (raw: string, out: string) => Promise<string>
  node: (args: string[]) => Promise<string>
}
// The shop's `drape.json` (`Trades/garment/game/drape.mjs` in the library).
type Draped = { figure: string; kit: string; config: string; garments: { name: string; kind: string; obj: string; parts: string; record: Record<string, unknown> }[] }

const CM = 0.01
const NAMED = /^[A-Za-z0-9_-]+$/

// A drape's obj: its points, its texture coordinates and its triangles, each corner a point and a coordinate.
function drapeOf(text: string, file: string) {
  const v: number[] = [], vt: number[] = [], corners: number[][] = []
  for (const line of text.split('\n')) {
    const w = line.trim().split(/\s+/)
    if (w[0] === 'v') v.push(+w[1], +w[2], +w[3])
    else if (w[0] === 'vt') vt.push(+w[1], +w[2])
    else if (w[0] === 'f') {
      if (w.length !== 4) throw new Error(`${file}: a face of ${w.length - 1} corners, and a drape is triangles`)
      const face = w.slice(1).map(c => c.split('/').map(Number))
      if (face.some(c => !(c[0] >= 1) || !(c[1] >= 1))) throw new Error(`${file}: the face ${line.trim()} has a corner with no texture coordinate`)
      corners.push(face.flatMap(c => [c[0] - 1, c[1] - 1]))
    }
  }
  return { v, vt, corners }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

export async function garment(spec: GarmentSpec, t: GarmentWith): Promise<Garment> {
  if (!spec.out.endsWith('.glb')) throw new Error(`the garment's out is ${spec.out}, and it is the glb to write`)
  const script = path.join(t.library, 'Trades', 'garment', 'game', 'drape.mjs')
  if (!fs.existsSync(script)) throw new Error(`the library at ${t.library} has no Trades/garment/game/drape.mjs`)
  const b = await body(spec.body)
  const figure = t.scratch(`${spec.figure}.obj`)
  fs.mkdirSync(path.dirname(figure), { recursive: true })
  fs.writeFileSync(figure, obj(b))
  const folder = t.scratch(`garment-${spec.kit}-${spec.config}`)
  console.log(await t.node([script, figure, spec.figure, spec.kit, spec.config, folder]))
  const draped: Draped = JSON.parse(fs.readFileSync(path.join(folder, 'drape.json'), 'utf8'))
  const one = draped.garments.find(g => g.name === spec.garment)
  if (!one) throw new Error(`the ${spec.kit} kit's ${spec.config} has no garment ${spec.garment}: its garments are ${draped.garments.map(g => g.name).join(', ')}`)
  const { v, vt, corners } = drapeOf(fs.readFileSync(path.join(folder, one.obj), 'utf8'), one.obj)
  const parts: { panels: string[]; faces: number[] } = JSON.parse(fs.readFileSync(path.join(folder, one.parts), 'utf8'))
  if (parts.faces.length !== corners.length) throw new Error(`${one.parts} has ${parts.faces.length} triangles and ${one.obj} ${corners.length}: the two are not of one drape`)

  // The cloth's uv is GarmentCode's layout of the pieces flat, in its own unit: how many metres one of it
  // is, measured on the drape, the middle of every triangle edge's length over its length in the layout.
  const at = (p: number) => [Math.fround(v[p * 3] * CM), Math.fround(v[p * 3 + 1] * CM), Math.fround(v[p * 3 + 2] * CM)]
  const ratios: number[] = []
  for (const c of corners)
    for (const [i, j] of [[0, 2], [2, 4], [4, 0]]) {
      const flat = Math.hypot(vt[c[i + 1] * 2] - vt[c[j + 1] * 2], vt[c[i + 1] * 2 + 1] - vt[c[j + 1] * 2 + 1])
      if (flat > 0) ratios.push(Math.hypot(...at(c[i]).map((x, k) => x - at(c[j])[k])) / flat)
    }
  if (!ratios.length) throw new Error(`${one.obj} has no triangle with a size in its texture coordinates`)
  const metres = median(ratios)

  // a mesh a piece: its triangles' corners, each point and coordinate once
  const meshes: Record<string, { position: number[]; uv: number[]; index: number[] }> = {}
  const pieces: string[] = []
  const seen: Map<string, number>[] = parts.panels.map(() => new Map())
  let triangles = 0
  corners.forEach((c, f) => {
    if (c[0] === c[2] || c[2] === c[4] || c[0] === c[4]) return
    const name = parts.panels[parts.faces[f]]
    if (!NAMED.test(name)) throw new Error(`the ${spec.garment}'s piece ${JSON.stringify(name)} has a name three would change: a piece's name is letters, digits, _ and -`)
    if (!meshes[name]) {
      meshes[name] = { position: [], uv: [], index: [] }
      pieces.push(name)
    }
    const m = meshes[name], mine = seen[parts.faces[f]]
    for (const k of [0, 2, 4]) {
      const key = `${c[k]} ${c[k + 1]}`
      let n = mine.get(key)
      if (n === undefined) {
        n = m.position.length / 3
        mine.set(key, n)
        m.position.push(...at(c[k]))
        m.uv.push(vt[c[k + 1] * 2] * metres, vt[c[k + 1] * 2 + 1] * metres)
      }
      m.index.push(n)
    }
    triangles++
  })
  const points = joined(pieces, meshes).points.length / 3

  const raw = t.scratch(`${spec.garment}.raw.glb`)
  write(raw, pieces.map(name => ({ name, position: Float32Array.from(meshes[name].position), uv: Float32Array.from(meshes[name].uv), index: Uint32Array.from(meshes[name].index) })))
  await t.pack(raw, spec.out)

  // the packed glb read back: every piece there, and its points joining to the same count
  const packed = await read(fs.readFileSync(spec.out))
  const back: typeof meshes = {}
  packed.gltf.nodes.forEach((n, i) => {
    if (n.mesh === undefined) return
    if (!n.name || !meshes[n.name]) throw new Error(`${spec.out}: the packer wrote a mesh named ${JSON.stringify(n.name)}, which is no piece of the ${spec.garment}`)
    const p = packed.gltf.meshes[n.mesh].primitives[0]
    if (p.attributes.TEXCOORD_0 === undefined || p.indices === undefined) throw new Error(`${spec.out}: the packer left the piece ${n.name} with no ${p.indices === undefined ? 'index' : 'uv'}`)
    const frame = packed.world(i), position = packed.numbers(p.attributes.POSITION)
    const moved3: number[] = []
    for (let k = 0; k < position.length; k += 3) moved3.push(...moved(frame, position, k).map(Math.fround))
    back[n.name] = { position: moved3, uv: Array.from(packed.numbers(p.attributes.TEXCOORD_0)), index: Array.from(packed.indices(p.indices)) }
  })
  for (const name of pieces) if (!back[name]) throw new Error(`${spec.out}: the packer left out the piece ${name}`)
  const kept = joined(pieces, back).points.length / 3
  if (kept !== points) throw new Error(`${spec.out}: its points join to ${kept} once packed, and the drape's to ${points}: the packer moved a seam's points apart`)

  const made: Garment = { garment: spec.garment, kit: spec.kit, config: spec.config, body: path.basename(spec.body), pieces, points, triangles, stood: b.frames, drape: one.record }
  fs.writeFileSync(spec.out.replace(/\.glb$/, '.garment.json'), JSON.stringify(made) + '\n')
  return made
}

// A body at rest: its points [x, y, z, …], its triangles, and each bone's frame, sixteen numbers column
// by column, by the bone's name.
export type Body = { points: Float64Array; triangles: Uint32Array; frames: Record<string, number[]> }

export async function body(file: string): Promise<Body> {
  const { gltf, numbers, indices, world } = await read(fs.readFileSync(file))
  const skinned = gltf.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.mesh !== undefined && n.skin !== undefined)
  if (!skinned.length) throw new Error(`${file} has no skinned mesh: a garment is draped on a body with bones`)
  const skins = new Set(skinned.map(({ n }) => n.skin!))
  if (skins.size > 1) throw new Error(`${file} has meshes on ${skins.size} skins, and a garment is draped on a body of one`)
  // A skinned mesh is drawn where its bones put it, not where its node is: a vertex stands at its bone's
  // frame times the bone's inverse bind matrix. With the bones at rest, as the file's nodes have them,
  // that is one matrix for every bone, the mesh's frame to the model's.
  const skin = gltf.skins![[...skins][0]]
  if (skin.inverseBindMatrices === undefined) throw new Error(`${file}: its skin has no inverse bind matrices`)
  const inverses = numbers(skin.inverseBindMatrices)
  const frames: Record<string, number[]> = {}
  let at: number[] | undefined
  skin.joints.forEach((j, k) => {
    const name = gltf.nodes[j].name
    if (!name) throw new Error(`${file}: joint ${k} of its skin has no name`)
    frames[name] = world(j)
    const stands = times(frames[name], inverses.subarray(k * 16, k * 16 + 16))
    at ??= stands
    const size = Math.hypot(at[0], at[1], at[2])
    if (stands.some((v, c) => Math.abs(v - at![c]) > 1e-3 * (c % 4 === 3 || c >= 12 ? 1 : size)))
      throw new Error(`${file}: the bone ${name} is not at rest in the file's nodes, and a garment is draped on the body as it stands at rest`)
  })
  const points: number[] = [], triangles: number[] = []
  for (const { n } of skinned) {
    for (const p of gltf.meshes[n.mesh!].primitives) {
      if ((p.mode ?? 4) !== 4 || p.indices === undefined) throw new Error(`${file}: the mesh ${n.name} is not indexed triangles`)
      const base = points.length / 3
      const position = numbers(p.attributes.POSITION)
      for (let k = 0; k < position.length; k += 3) points.push(...moved(at!, position, k))
      for (const v of indices(p.indices)) triangles.push(base + v)
    }
  }
  return { points: Float64Array.from(points), triangles: Uint32Array.from(triangles), frames }
}

export function obj(b: Body): string {
  const lines: string[] = []
  for (let k = 0; k < b.points.length; k += 3) lines.push(`v ${b.points[k]} ${b.points[k + 1]} ${b.points[k + 2]}`)
  for (let k = 0; k < b.triangles.length; k += 3) lines.push(`f ${b.triangles[k] + 1} ${b.triangles[k + 1] + 1} ${b.triangles[k + 2] + 1}`)
  return lines.join('\n') + '\n'
}
