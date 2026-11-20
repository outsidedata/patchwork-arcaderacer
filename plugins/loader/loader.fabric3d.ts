// loader's mod for fabric3d (`addons/scenemanager`'s mods), the page's. A scene with
// `world.fabric3d.mods: { behaviors: ['loader'] }` cuts a fabric from a garment a bake made
// (`scripts/garment.ts`, a bake's `garment` tool): a garment of the library's garment shop, draped on a body
// the game draws, as it came to rest on that body.
//
// `behaviors()` delivers the sewn cut `garment`, `{ model, file }`, two entries of the loader's catalogue:
//   model  the garment's glb, a `model` entry: a mesh for each piece of its pattern, named for the piece, in
//          the frame the body's model is drawn in, lying as it came to rest on the body at rest. A point two
//          pieces are sewn together at is a vertex of each, at the one place.
//   file   the garment's sidecar, a `json` entry (`Garment`): its `pieces` in order, how many `points` it
//          has once its seams are joined, and `stood`, each of the body's bones by its name with the frame
//          it stood in as the garment was draped, sixteen numbers column by column
// The fabric's points are the glb's vertices with every seam's joined; its pieces the glb's meshes, which a
// pin of the fabric names (`{ on, piece }`); and a vertex's uv is where it lies on the cloth as it was cut
// flat, in metres. It is cut once both have landed. A glb with a mesh the sidecar does not name, without one
// it does, or whose joined points are not the sidecar's count throws, naming it: the two are baked together
// and one was left behind.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Behavior, Sewn } from '#plugins/fabric3d/fabric3d.plugin.ts'

// A garment's sidecar, as a bake writes it (`scripts/garment.ts`).
export type Garment = {
  garment: string; kit: string; config: string; body: string
  pieces: string[]; points: number; triangles: number
  stood: Record<string, number[]>
  drape: Record<string, unknown>
}

const FIELDS = ['model', 'file']

// The points of a garment's glb with its seams joined: every vertex that lies at one place is one point.
export function joined(pieces: string[], meshes: Record<string, { position: ArrayLike<number>; uv: ArrayLike<number>; index: ArrayLike<number> }>): Omit<Sewn, 'stood'> {
  const at = new Map<string, number>()
  const points: number[] = [], of: number[] = [], uv: number[] = [], index: number[] = []
  const byPiece: Record<string, number[]> = {}
  for (const piece of pieces) {
    const m = meshes[piece]
    const base = of.length, mine = new Set<number>()
    for (let v = 0; v < m.position.length / 3; v++) {
      const [x, y, z] = [m.position[v * 3], m.position[v * 3 + 1], m.position[v * 3 + 2]]
      const key = `${x} ${y} ${z}`
      let p = at.get(key)
      if (p === undefined) {
        p = points.length / 3
        at.set(key, p)
        points.push(x, y, z)
      }
      of.push(p)
      mine.add(p)
      uv.push(m.uv[v * 2], m.uv[v * 2 + 1])
    }
    for (let i = 0; i < m.index.length; i++) index.push(base + m.index[i])
    byPiece[piece] = [...mine]
  }
  return { points: Float32Array.from(points), of: Uint32Array.from(of), uv: Float32Array.from(uv), index: Uint32Array.from(index), pieces: byPiece }
}

// Each model's cut, kept with the model the loader decoded, so a fabric made again cuts nothing again.
const cuts = new WeakMap<object, Sewn>()

const garment: Behavior = {
  check(data, what, world) {
    if (!data || typeof data !== 'object') throw new Error(`${what} is ${JSON.stringify(data)}, and a garment is { ${FIELDS.join(', ')} }`)
    for (const k of Object.keys(data)) if (!FIELDS.includes(k)) throw new Error(`${what} has ${k}, and a garment is { ${FIELDS.join(', ')} }`)
    if (world.loader?.assets?.[data.model]?.type !== 'model') throw new Error(`${what} is cut from ${JSON.stringify(data.model)}, which is no model entry of the loader's catalogue`)
    if (world.loader?.assets?.[data.file]?.type !== 'json') throw new Error(`${what} reads ${JSON.stringify(data.file)}, which is no json entry of the loader's catalogue`)
  },
  sewn(data: { model: string; file: string }, { plugins, name }: { plugins: Plugins; name: string }) {
    let waiting = false
    for (const entry of [data.model, data.file])
      if (!plugins.loader.ready(entry)) {
        plugins.loader.load(entry).catch(() => {})
        waiting = true
      }
    if (waiting) return undefined
    const model: { scene: THREE.Object3D } = plugins.loader.get(data.model)
    const had = cuts.get(model)
    if (had) return had
    const file: Garment = plugins.loader.get(data.file)
    const meshes: Record<string, { position: number[]; uv: number[]; index: number[] }> = {}
    model.scene.updateMatrixWorld(true)
    model.scene.traverse(o => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      if (!file.pieces.includes(mesh.name)) throw new Error(`${name} is cut from ${data.model}, whose mesh ${mesh.name} is no piece of ${data.file}: its pieces are ${file.pieces.join(', ')}`)
      const g = mesh.geometry, p = g.getAttribute('position'), t = g.getAttribute('uv'), i = g.getIndex()
      if (!t || !i) throw new Error(`${name} is cut from ${data.model}, whose mesh ${mesh.name} has no ${t ? 'index' : 'uv'}: bake it again`)
      const position: number[] = [], uv: number[] = []
      const v = new plugins.render3d.THREE.Vector3()
      for (let k = 0; k < p.count; k++) {
        v.fromBufferAttribute(p, k).applyMatrix4(mesh.matrixWorld)
        position.push(Math.fround(v.x), Math.fround(v.y), Math.fround(v.z))
        uv.push(t.getX(k), t.getY(k))
      }
      meshes[mesh.name] = { position, uv, index: Array.from(i.array) }
    })
    for (const piece of file.pieces) if (!meshes[piece]) throw new Error(`${name} is cut from ${data.model}, which has no mesh of the piece ${piece} that ${data.file} names`)
    const cut = { ...joined(file.pieces, meshes), stood: file.stood }
    if (cut.points.length / 3 !== file.points) throw new Error(`${name} is cut from ${data.model}, whose points join to ${cut.points.length / 3}, and ${data.file} says ${file.points}: the two were not baked together`)
    cuts.set(model, cut)
    return cut
  },
}

export const behaviors = (): Record<string, Behavior> => ({ garment })
