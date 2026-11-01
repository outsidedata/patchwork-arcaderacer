// dismember3d's page half: what a body that comes apart looks like. Every triangle of a body's model
// is labelled with the limb whose bones weigh most on its three corners; each row of a kind
// `world.dismember3d.kinds` lists draws every triangle but those of the limbs its `off` names; and each
// piece row (`PIECES`, `dismember3d.sim.ts`) is drawn as its limbs' triangles, baked, each corner skinned
// to where its body's pose has it the frame the piece is first drawn, into a plain mesh that box3d
// carries wherever it puts the row, and gone when the row ends. A kind of piece has no look of its own.
//
// The limbs, by the suffix of the bone each starts at: the head; on each side the upper arm, forearm
// and hand, the thigh, shin and foot. A bone is the limb of the nearest bone at or above it that one
// starts at, so a finger is the hand's; every other bone is the torso's.
//
// Gore: a piece bursts its body kind's `world.dismember3d.kinds.<kind>.gore.sever` effect where it came
// off, thrown the way it flies, and carries `gore.drip` with it for as long as it lies (particle3d's
// `from`). Both come to rest on the ground under where it came off: the `land` mod's,
// `world.dismember3d.mods: { land: '<a>' }`, `land(plugins)` handing back `{ height(x, z) }` or
// undefined until there is one (terrain3d's, `terrain3d.dismember3d.ts`); with none named, or none yet,
// the flat floor at y 0. A kind that names no gore, or a scene that lists no particle3d, has none.
//
// It draws through anim's models (`plugins.anim.model`), render3d's scene, box3d's `follow` and
// particle3d's `emit`, and reads a body's model as anim posed it this frame: it is listed after anim,
// box3d and particle3d, and before render3d.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { mod, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { PIECES } from './dismember3d.sim.ts'

const LIMBS: [string, string][] = [
  ['Head', 'head'],
  ['LeftArm', 'armL'], ['LeftForeArm', 'forearmL'], ['LeftHand', 'handL'],
  ['RightArm', 'armR'], ['RightForeArm', 'forearmR'], ['RightHand', 'handR'],
  ['LeftUpLeg', 'uplegL'], ['LeftLeg', 'legL'], ['LeftFoot', 'footL'],
  ['RightUpLeg', 'uplegR'], ['RightLeg', 'legR'], ['RightFoot', 'footR'],
]

// One skinned mesh of a body: its full list of corners, three to a triangle, and each triangle's limb.
type Labelled = { mesh: THREE.SkinnedMesh; full: Uint32Array; limb: string[] }
type Land = (plugins: Plugins) => { height(x: number, z: number): number } | undefined

// The limb of a bone: the first of LIMBS whose bone it is or is under, else the torso.
function limbOf(bone: THREE.Object3D): string {
  for (let b: THREE.Object3D | null = bone; b; b = b.parent) {
    const hit = LIMBS.find(([suffix]) => b!.name.endsWith(suffix))
    if (hit) return hit[1]
  }
  return 'torso'
}

// Every skinned mesh under `root` given geometry of its own (a model's clones share it) and every
// triangle its limb.
function label(root: THREE.Object3D): Labelled[] {
  const out: Labelled[] = []
  root.traverse(o => {
    const m = o as THREE.SkinnedMesh
    if (!m.isSkinnedMesh) return
    m.geometry = m.geometry.clone()
    // three culls a mesh by a sphere measured round its rest pose; a crawl carries the body out of it,
    // and the mesh would blink out on every lap of the clip.
    m.frustumCulled = false
    const g = m.geometry
    const si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight')
    const boneLimb = m.skeleton.bones.map(limbOf)
    const vertLimb = (v: number) => {
      const share: Record<string, number> = {}
      for (let k = 0; k < 4; k++) {
        const l = boneLimb[si.getComponent(v, k)]
        share[l] = (share[l] ?? 0) + sw.getComponent(v, k)
      }
      return Object.keys(share).reduce((a, b) => (share[a] >= share[b] ? a : b))
    }
    const full = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: g.getAttribute('position').count }, (_, i) => i)
    const limb: string[] = []
    for (let t = 0; t < full.length; t += 3) {
      const a = vertLimb(full[t]), b = vertLimb(full[t + 1]), c = vertLimb(full[t + 2])
      limb.push(b === c ? b : a)
    }
    out.push({ mesh: m, full, limb })
  })
  return out
}

// Each mesh draws every triangle whose limb is not in `off`.
function show(body: Labelled[], off: string[]) {
  for (const b of body) {
    const keep: number[] = []
    for (let i = 0; i < b.limb.length; i++) if (!off.includes(b.limb[i])) keep.push(b.full[i * 3], b.full[i * 3 + 1], b.full[i * 3 + 2])
    b.mesh.geometry.setIndex(keep)
  }
}

// A plain mesh of the triangles of the `limbs`, each corner skinned to where the body's pose has it
// now, in the world.
function bake(T: typeof THREE, body: Labelled[], limbs: string[]): THREE.Group {
  const group = new T.Group()
  for (const b of body) {
    const tris: number[] = []
    for (let i = 0; i < b.limb.length; i++) if (limbs.includes(b.limb[i])) tris.push(b.full[i * 3], b.full[i * 3 + 1], b.full[i * 3 + 2])
    if (!tris.length) continue
    b.mesh.updateMatrixWorld(true)
    const g = b.mesh.geometry
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv')
    const used = [...new Set(tris)]
    const at = new Map(used.map((v, i) => [v, i]))
    const P = new Float32Array(used.length * 3), N = new Float32Array(used.length * 3)
    const U = uv ? new Float32Array(used.length * 2) : undefined
    const a = new T.Vector3(), tip = new T.Vector3(), n = new T.Vector3()
    used.forEach((v, i) => {
      a.fromBufferAttribute(pos, v)
      tip.copy(a).addScaledVector(n.fromBufferAttribute(nor, v), 0.01)
      b.mesh.applyBoneTransform(v, a).applyMatrix4(b.mesh.matrixWorld)
      b.mesh.applyBoneTransform(v, tip).applyMatrix4(b.mesh.matrixWorld)
      P.set([a.x, a.y, a.z], i * 3)
      tip.sub(a).normalize()
      N.set([tip.x, tip.y, tip.z], i * 3)
      if (U) U.set([uv!.getX(v), uv!.getY(v)], i * 2)
    })
    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.BufferAttribute(P, 3))
    geo.setAttribute('normal', new T.BufferAttribute(N, 3))
    if (U) geo.setAttribute('uv', new T.BufferAttribute(U, 2))
    geo.setIndex(tris.map(v => at.get(v)!))
    const mesh = new T.Mesh(geo, b.mesh.material)
    mesh.castShadow = mesh.receiveShadow = true
    group.add(mesh)
  }
  return group
}

export function dismember3d() {
  // Each model's labelled meshes, labelled once per model: anim builds a body's model once, and again
  // only when its rig changes, which is a new model.
  const labels = new WeakMap<THREE.Object3D, Labelled[]>()
  const labelled = (root: THREE.Object3D) => {
    let parts = labels.get(root)
    if (!parts) labels.set(root, parts = label(root))
    return parts
  }
  // What each body last drew without, so its triangle lists are rebuilt only when that changes.
  const drawn = new Map<number, { root: THREE.Object3D; off: string }>()
  // Each piece row's mesh, once its body's model was there to bake it from.
  const made = new Map<number, THREE.Group>()
  let checked = false

  // The height the gore comes to rest at under `at`.
  const floorAt = (plugins: Plugins, at: number[]) => {
    const land = mod<Land>(plugins.wire.scene.world!, 'dismember3d', 'land')
    return land?.(plugins)?.height(at[0], at[2]) ?? 0
  }

  // A piece's mesh: its limbs baked off its body's model in the pose that body stands in now, laid in
  // the row's own frame as box3d first placed it, and carried wherever box3d puts the row; and its gore.
  function draw(row: Row, plugins: Plugins): THREE.Group | undefined {
    const root = plugins.anim.model(row.data.of)
    if (!root) return undefined
    const T: typeof THREE = plugins.render3d.THREE
    root.updateMatrixWorld(true)
    const world = bake(T, labelled(root), row.data.limbs)
    const back = new T.Matrix4().compose(new T.Vector3().fromArray(row.data.pos), new T.Quaternion().fromArray(row.data.rot).normalize(), new T.Vector3(1, 1, 1)).invert()
    for (const m of world.children) (m as THREE.Mesh).geometry.applyMatrix4(back)
    plugins.render3d.scene.add(world)
    plugins.box3d.follow(row.id, world)
    const body = plugins.wire.rows.find(r => r.id === row.data.of)
    const gore = body && plugins.wire.scene.world!.dismember3d.kinds[body.kind]?.gore
    if (gore && plugins.particle3d) {
      const v = row.data.vel ?? [0, 0, 0]
      const floor = floorAt(plugins, row.data.pos)
      if (gore.sever) plugins.particle3d.emit(gore.sever, row.data.pos, { dir: v, floor, seed: row.id })
      if (gore.drip) plugins.particle3d.emit(gore.drip, row.data.pos, { from: row.id, life: 1e6, floor, seed: row.id + 1 })
    }
    return world
  }

  return {
    tick(plugins: Plugins) {
      const scene = plugins.wire.scene
      if (!checked) {
        provided(scene, 'dismember3d', 'land')
        checked = true
      }
      const kinds = Object.keys(scene.world!.dismember3d?.kinds ?? {})
      for (const row of plugins.wire.rows) {
        if (!kinds.includes(row.kind)) continue
        const root = plugins.anim.model(row.id)
        if (!root) continue
        const off = ((row.data.off ?? []) as string[]).join()
        const was = drawn.get(row.id)
        if (was && was.root === root && was.off === off) continue
        drawn.set(row.id, { root, off })
        show(labelled(root), row.data.off ?? [])
      }
      const live = new Set<number>()
      for (const row of plugins.wire.rows) {
        if (!PIECES.includes(row.kind)) continue
        live.add(row.id)
        if (made.has(row.id)) continue
        const world = draw(row, plugins)
        if (world) made.set(row.id, world)
      }
      for (const [id, world] of made) {
        if (live.has(id)) continue
        plugins.box3d.drop(id)
        plugins.render3d.scene.remove(world)
        made.delete(id)
      }
      for (const id of drawn.keys()) if (!plugins.wire.rows.some(r => r.id === id)) drawn.delete(id)
    },
    close(plugins: Plugins) {
      for (const [id, world] of made) {
        plugins.box3d.drop(id)
        plugins.render3d.scene.remove(world)
      }
      made.clear()
      drawn.clear()
    },
  }
}
