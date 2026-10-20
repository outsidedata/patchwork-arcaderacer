// A solids model as the game draws it, for the asset workshop's page: the stand-in scene a solids
// model is drawn on, and how the page finds its pieces in what the game's plugins drew. Nothing here
// makes a mesh: every mesh and light is the solids plugin's (`plugins/solids/solids.plugin.ts`).
//
// How a model is drawn, as the game draws it (`stand`, from the server's summary):
//   - named by `world.solids.kinds.<kind>`: one row of that kind, drawn by the solids plugin.
//   - named by the definition of `kind` (`<kind>.model`), in a scene with plugins of the game's own
//     that draw solids models (`drawers`): one row of that kind, drawn by those plugins, loaded from
//     the game's folder as `shipped` loads them, each with its `world.<p>`. A drawer that throws on
//     the first frame (one that draws the kind only with fields of the game's the still row has not,
//     a mech's fitted modules say) is let go of, so the rest draw.
//   - neither, or no drawer drew it: the page hangs its parts itself (`assemble`), with the solids
//     plugin's `meshes` and `lights`, in its nodes as every plugin hangs them, the parts of a node it
//     does not list in a piece of that name at the model's origin, as mount3d and interior3d hang a
//     module's or a cabin's.
// `stillRow(kind)` is the one row: standing at the origin facing +z, still: `pos` [0, 0, 0], `yaw` 0,
//   `vel` [0, 0, 0] (walker's), `heading` 0, the way a turret or a torso faces in the world, and
//   `kneel` 0, a mech standing up (legs3d's).
// `standScene(game, key, stand, home, size)` is that stand-in scene: `{ scene, plugins }`, the plugins
//   the page makes besides the loader and render3d: `solids`, and each drawer by name.
//
// How its pieces are found in a drawing, whoever drew it. Every plugin that draws a solids model with
// nodes makes a group for each node in the order the model lists them, each added to its parent's
// group (the drawing's root for a node with none) before any mesh or light, and then hangs each node's
// meshes in it, one for each paint in the order its parts first name them (`meshes`'s batches):
//   `nodeGroups(root, model)` is each node's group, by name;
//   `labels(root, model)` is each of the model's meshes with its node and paint, which a note records
//     and which the page counts as the model's (a drawing may hang other things on its nodes).
// `assemble(THREE, solids, dress, model)` is the page's own drawing: `{ root, owned }`, `owned` every
//   geometry, material and light to dispose.
// `rootOf(o, scene)` is the drawing a mesh is part of: its ancestor that is a child of the scene.

import type { Paint, Part, Lamp } from '../../plugins/solids/solids.plugin.ts'

export type Named = { by: 'solids' | 'defs'; kind: string; path: string; scenes: string[] }
export type Stand = { scene: string; kind: string; by: 'solids' | 'defs'; defs?: string; drawers: string[]; world: Record<string, any> }
// An empty: a point, or a point that rides a part, which mech's mount3d turns with the part.
export type Empty = number[] | { at: number[]; part?: string; turn?: number[] }
export type Model = { paints: Record<string, Paint>; nodes?: Record<string, { parent?: string; at: number[]; turn?: number[]; mirror?: boolean }>; parts: Part[]; lights?: Lamp[]; empties?: Record<string, Empty> }
type Obj = { children: Obj[]; parent: Obj | null; isMesh?: boolean; material?: unknown }

// An empty's point: the empty itself, or the `at` of one that rides a part.
export const pointOf = (e: Empty): number[] => (Array.isArray(e) ? e : e.at)
// An empty moved to `at`, riding the part it rode.
export const movedTo = (e: Empty | undefined, at: number[]): Empty => (e && !Array.isArray(e) ? { ...e, at } : at)

export const stillRow = (kind: string) => ({ id: 1, kind, data: { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], heading: 0, kneel: 0 } as Record<string, unknown> })

export function standScene(game: { world: any; engine: { dt?: number }; render3d: any }, key: string, stand: Stand | undefined, home: string, size: { width: number; height: number }) {
  const drawers = stand?.by === 'defs' ? stand.drawers : []
  const world: Record<string, any> = {
    loader: structuredClone(game.world.loader),
    scenemanager: { home },
    ...(stand?.defs ? { defs: stand.defs } : {}),
    ...(stand?.by === 'solids' ? { solids: { kinds: { [stand.kind]: key } } } : {}),
    ...(drawers.length ? { shipped: { plugins: drawers } } : {}),
    ...structuredClone(stand?.by === 'defs' ? stand.world : {}),
  }
  const scene = {
    plugins: ['loader', 'solids', ...(drawers.length ? ['shipped'] : []), 'render3d'],
    world,
    prefabs: {
      engine: { width: size.width, height: size.height, dt: game.engine.dt ?? 1 / 60 },
      render3d: { ...(game.render3d ?? {}), camera: { fov: 40, near: 0.01, far: 500, at: [4, 4, 6], look: [0, 1, 0] } },
    },
  }
  return { scene, drawers }
}

export function nodeGroups(root: Obj, model: Model): Map<string, Obj> {
  const out = new Map<string, Obj>()
  const taken = new Map<Obj, number>()
  for (const [name, n] of Object.entries(model.nodes ?? {})) {
    const parent = n.parent === undefined ? root : out.get(n.parent)
    if (!parent) continue
    const i = taken.get(parent) ?? 0
    taken.set(parent, i + 1)
    const g = parent.children[i]
    if (g && !g.isMesh) out.set(name, g)
  }
  return out
}

// Each node's paints, in the order its parts first name them.
function paintsOf(model: Model) {
  const out = new Map<string, string[]>()
  for (const p of model.parts) {
    const list = out.get(p.node) ?? []
    if (!list.includes(p.paint)) list.push(p.paint)
    out.set(p.node, list)
  }
  return out
}

export function labels(root: Obj, model: Model, groups: Map<string, Obj> = nodeGroups(root, model)): Map<Obj, { node: string; paint: string }> {
  const out = new Map<Obj, { node: string; paint: string }>()
  for (const [node, paints] of paintsOf(model)) {
    const g = groups.get(node)
    if (!g) continue
    const meshes = g.children.filter(c => c.isMesh)
    paints.forEach((paint, i) => { if (meshes[i]) out.set(meshes[i], { node, paint }) })
  }
  return out
}

type Solids = { meshes: Function; lights: Function }
export function assemble(THREE: any, solids: Solids, dress: (m: any) => any, model: Model) {
  const root = new THREE.Group()
  const groups = new Map<string, any>()
  for (const [name, n] of Object.entries(model.nodes ?? {})) {
    const o = new THREE.Group()
    o.position.fromArray(n.at)
    o.rotation.order = 'ZYX'
    if (n.turn) o.rotation.set(n.turn[0], n.turn[1], 0)
    if (n.mirror) o.scale.x = -1
    ;(n.parent === undefined ? root : groups.get(n.parent) ?? root).add(o)
    groups.set(name, o)
  }
  const made = solids.meshes(THREE, dress, model.paints, model.parts, 'workshop: the model')
  const piece = (name: string) => {
    if (!groups.has(name)) { const g = new THREE.Group(); root.add(g); groups.set(name, g) }
    return groups.get(name)
  }
  for (const [node, list] of made.meshes as Map<string, any[]>) piece(node).add(...list)
  const lit = solids.lights(THREE, model.lights ?? [])
  for (const [node, list] of lit.lights as Map<string, any[]>) piece(node).add(...list)
  return { root, groups, owned: [...made.owned, ...lit.owned] as { dispose(): void }[] }
}

export function rootOf(o: Obj, scene: Obj): Obj | undefined {
  let at: Obj | null = o
  while (at && at.parent !== scene) at = at.parent
  return at ?? undefined
}
