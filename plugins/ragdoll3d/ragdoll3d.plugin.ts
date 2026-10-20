// ragdoll3d: a limp body on a Mixamo skeleton, stepped on the sim's clock, the same on every seat. It
// is a browser half only, with no row and no prefab: its numbers never change, so they are the
// scene's `world.ragdoll3d`, read off `plugins.wire.scene.world`.
//
// What it lies on comes through mods (`addons/scenemanager`), `world.ragdoll3d.mods: { model, pose,
// land, solids, gravity }`, each naming the plugin whose mod for ragdoll3d hands that function (and a
// server one, `bodies`, which its mod for hitscan3d passes on, `ragdoll3d.hitscan3d.ts`):
//   model     `model(plugins, id)`, the row's model root, or undefined before it is built (anim's,
//             `anim.ragdoll3d.ts`). A scene that names none throws.
//   pose      `pose(plugins, id, clip, t)`, the row's model drawn in one clip alone from its rest and
//             handed back (anim's). A scene that names none throws. The plugin whose `model` and
//             `pose` these are makes and poses its models in its own `tick`, which this one reads in
//             its `tick`, so it is listed before ragdoll3d and a scene listing it after throws
//             (`ahead`, whose words name the `afterTick`: the plugins' `tick`s run in the same
//             order). render3d draws in its `afterTick`, after every `tick`, so it may be listed
//             anywhere.
//   land      `land(plugins)`, the ground the body lies on, `{ height(x, z) }`, or undefined until
//             there is one (terrain3d's, `terrain3d.ragdoll3d.ts`). Until there is a ground no body
//             steps, and a scene that names none has none: its bodies lie as they died.
//   solids    `solids(plugins, x, z, r)`, the solids the body is pushed out of (scatter3d's,
//             `scatter3d.ragdoll3d.ts`): circles `{ x, z, radius }`, each a solid upright without end.
//             A scene that names none has no solids.
//   gravity   `gravity(world, kind)`, the m/s² a body of that kind falls at, or undefined for a kind
//             it has none for (walker's `world.walker.kinds[kind].gravity`, `walker.ragdoll3d.ts`). A
//             scene that names none throws, and so does a body of a kind it gives no gravity.
// Only `model` and `pose` hand back what their plugin changes in the frame, so `ahead` is asked of
// those two alone: the land and the solids a step asks are the same whenever in the frame it asks
// them, and a body's gravity is read once, as it is built. The land and the solids are what their
// plugin's browser half holds, so a scene that names one for a plugin it does not list throws
// (`provided`); the gravity is read off the scene's `world`, which every page has.
//
// The numbers, `world.ragdoll3d`:
//   bones     role to the suffix of the bone that joint is, for the 15 roles: hips, spine (the upper
//             spine), head, armL, forearmL, handL, armR, forearmR, handR, uplegL, legL, footL,
//             uplegR, legR, footR.
//   damp      the share of a step's velocity kept into the next.
//   iter      passes a step, each reading the ground under every point once.
//   sweeps    rounds of the sticks, the limits, the ground and the solids in each pass.
//   radius    metres: how far a joint's point stays off the ground and out of a solid.
//   vmax      metres a step: the most a point moves by its velocity.
//   friction  the share of a ground-touching point's speed across the ground taken each step.
//   spread    the share of the blow's speed every point but the one struck is given.
//   limits    `{ elbow, knee, spine, hip, shoulder }`, each `[least, most]` degrees.
//   still     metres a step: a body whose every point moves less than this for `calm` steps sleeps.
//   calm      steps.
//   settle    seconds: the most of its fall a body is stepped through.
// The numbers are checked whenever their content changes: a number out of its range, a role
// with no suffix or a limit that is not 0 ≤ least ≤ most ≤ 180 throws naming it. A body takes the
// numbers as they stand when it is built and keeps them while it lies, so an edit reaches the next
// body and never a body part way down. The scene's `engine` prefab gives `dt`, the seconds a step.
//
// The dying row. A game's rule writes, on the step its row dies:
//   limp      true while the body lies. A row whose `limp` is true is the ragdoll's, and anim stops
//             drawing it.
//   limpFor   the steps since it went limp: 0 as it dies, one more each step after while `limp`
//             holds. A rule reads no step counter, so the row counts its own.
//   blow      `{ dir: [x, z], speed, height }`: the way it was struck across the ground (normalised
//             here), m/s, and metres above the row's `pos`.
//   pose      `{ clip, clipT }`: the clip and playhead it died in.
// and leaves `pos` and `yaw` alone until it stands again, so a seat that first sees it late builds
// the body from where it died.
//
// The body. Its 15 points are joints, each the first bone under a skeleton copy whose name ends
// with its role's suffix. Three's glTF loader makes a repeated name unique with `_1`, `_2`, …, and
// that ending is not part of the name matched, so each copy's bones are found by the same suffixes.
// A Mixamo model's meshes can each bind a skeleton copy of their own: a copy is every bone under a
// bone with no bone above it, and every copy holding all 15 is driven. The points are read from the
// copy whose hips' name has no `_N`, the copy anim's clips name and so drive, wherever it stands in
// the model (the first, when every copy's has one). A model with no whole copy throws, naming the
// kind and a bone it lacks.
//   Building it: the model is drawn at `pose` by the `pose` mod, every other copy takes that copy's
//   local rotations, bone by bone of the same name, and each point is set at its bone. The gravity
//   is read then, from the `gravity` mod for the row's kind, so a body falls at the gravity it walked
//   under and a gravity the editor changes reaches the next body; a kind it gives no gravity throws,
//   naming the kind.
//   The blow is given as a velocity, where each point was a step ago: the point whose height is
//   nearest `pos[1] + height` (the first in role order, on a tie) at `speed`, the rest at
//   `speed·spread`, since a kick on one joint of a braced body leaves it standing like a statue.
//   Every seat builds the same start.
//   Sticks: the 14 bones between the points (hips–spine, spine–head, spine–arm, arm–forearm,
//   forearm–hand, hips–up-leg, up-leg–leg, leg–foot) and braces shoulder–shoulder, hip–hip,
//   hips–each shoulder and upper spine–each hip, so the torso stays a slab. Each keeps the length it
//   had at death.
//   Limits: each bounds the angle at the middle point of three: `elbow` arm–forearm–hand, `knee`
//   up-leg–leg–foot, `spine` hips–upper spine–head (the torso below the upper spine is a slab, so this
//   is the spine's and the neck's bend), `hip` upper spine–up-leg–leg, `shoulder` hips–arm–forearm,
//   left and right. A limit out of bounds turns the two outer points about the middle one, each
//   through half the angle it is out by, in the plane of the three, which leaves both sticks' lengths
//   as they were; then the three move together so their centre stays put. A band on the outer
//   points' distance could do neither: near 180° it is a millimetre wide and its pull runs along the
//   limb, so it cannot bend a straight one. A straight hinge has no plane of its own, and bends about
//   the pelvis's x (left up-leg to right), or its z for a limb lying along x. A most just short of
//   180° stops a hinge folding backwards; a most of 180° is no bound.
//
// A step, once per sim step and never per frame:
//   1. Each point moves by v = (pos − prev)·damp, cut to `vmax` long, then falls gravity·dt².
//   2. The solids are asked once, about the moved points' centre across the ground, out to the
//      furthest point plus `radius` and `vmax`.
//   3. `iter` passes. A pass reads the ground's height under each point, and its slope from the
//      heights `vmax` further along x and along z, as a plane; lifts each point under its plane plus
//      `radius` onto it, and pushes it out of each solid across the ground to the solid's radius plus
//      `radius`, straight out from the solid's middle. Then `sweeps` rounds, each of the sticks (both
//      points moved equally), the limits, and every point lifted onto its plane and pushed out of the
//      solids again. The ground is so part of every round the sticks and limits are held in, and the
//      rounds settle onto all of them at once, a landing too; the plane keeps the ground's slope in
//      the rounds without reading it again.
//   4. The ground is read once more under each point and every point lifted onto it and out of the
//      solids, so no point ends a step under the ground or inside a solid.
//   5. A point any of these lifted touches the ground: its `prev` moves `friction` of the way to its
//      `pos` across the ground.
// At `iter` 6 and `sweeps` 30 every limit holds within 0.1° after every step, measured over falls of
// every kind in the tests and in Chrome, landings included.
// A row is owed min(limpFor, ⌊settle/dt⌋) steps and each frame takes the steps it is owed, so a frame
// with no new step does no physics, and a seat that sees the row late catches up to the body every
// seat shows. `settle` is a hard stop: a body never steps past it and sleeps there, so a seat arriving
// after it draws the settled body exactly. A body sleeps sooner when every point moves less than
// `still` for `calm` steps running. A `limpFor` below the last one seen is a new death, and so is a
// model the `model` mod hands back other than the one the body was built on, as anim makes a model
// again when its rig changes: the body is built again. It is drawn as it was last stepped.
//
// Writing back, onto every copy, after a step or a build:
//   The hips take the pelvis basis's turn since death, the basis's y along hips → upper spine and its
//   x from the left up-leg to the right, square to y, and stand on the hips point.
//   Then each limb bone, parent before child: the neck (the head's parent) toward the head, each
//   shoulder (the arm's parent) toward its arm, arm toward its forearm, forearm toward its hand, up-leg
//   toward its leg and leg toward its foot. Each starts from its local rotation at death, under its
//   parent as it now stands, and turns by the shortest arc from where it points (at its child bone)
//   to where its points run (from its own point to its child's, or from the bone itself for the
//   neck and a shoulder, which have none), so its twist is the death pose's and no turn carries over
//   from the frame before. A neck or shoulder that is the upper spine's bone itself is not turned.
//   Every other bone keeps its rotation at death.
//
// A body is let go of when its row's `limp` clears or the row ends, and `close` lets go of all; anim
// puts a row that gets up back at its rest. `body(id)` is the row's body as it stands, `{ points,
// steps, asleep }`: each role's point, the steps taken and whether it sleeps, or undefined.
//
// The physics mode, `world.ragdoll3d.physics: true`: the body is a box3d ragdoll the server made
// (`ragdoll3d.sim.ts`'s `fall`, `ragdoll3d.box3d.ts`), and none of the above runs. A body lying limp
// with a `ragdoll` (bone name to its `bone` row's id) has its model's bones turned to follow its
// bodies every frame. anim draws no limp row, so the model is the ragdoll's.
//   The frame a ragdoll is first drawn, its meshes stop being culled by their rest-pose bounds, and
//   each bone's turn in the world against its body's, and the hips' place against the torso's body,
//   are kept: the model stands as it stood. Each frame after, each bone of `PHYSICS.bones`
//   (`ragdoll3d.sim.ts`; its `model` the suffix of the model's bone), parents first, is
//   turned to its body's turn times that offset, in its parent's frame; the hips (`root`) are moved
//   with the torso
//   too. A Mixamo model binds a copy of the skeleton for each of its meshes, the copies' bones named
//   as the first's with `_1`, `_2`, …; every copy takes the first's local turns and places.
import type * as THREE from 'three'
import type { Plugins } from '#engine/browser.ts'
import type { Row } from '#engine/engine.ts'
import { ahead, mod, provided } from '#addons/scenemanager/scenemanager.addon.ts'
import { PHYSICS } from './ragdoll3d.sim.ts'

type Three = typeof import('three')
type V = [number, number, number]

const ROLES = ['hips', 'spine', 'head', 'armL', 'forearmL', 'handL', 'armR', 'forearmR', 'handR', 'uplegL', 'legL', 'footL', 'uplegR', 'legR', 'footR'] as const
export type Role = (typeof ROLES)[number]
const LIMITS = ['elbow', 'knee', 'spine', 'hip', 'shoulder'] as const
export type Numbers = {
  bones: Record<Role, string>
  damp: number; iter: number; sweeps: number; radius: number; vmax: number; friction: number; spread: number
  limits: Record<(typeof LIMITS)[number], [number, number]>
  still: number; calm: number; settle: number
}
export type Solid = { x: number; z: number; radius: number }
type Ground = { height(x: number, z: number): number }
// The functions the scene's `world.ragdoll3d.mods` hand it.
type Model = (plugins: Plugins, id: number) => THREE.Object3D | undefined
type Pose = (plugins: Plugins, id: number, clip: string, t: number) => THREE.Object3D
type Land = (plugins: Plugins) => Ground | undefined
type Solids = (plugins: Plugins, x: number, z: number, r: number) => Solid[]
type Gravity = (world: Record<string, any>, kind: string) => number | undefined

const I = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<Role, number>
const STICKS: [Role, Role][] = [
  ['hips', 'spine'], ['spine', 'head'],
  ['spine', 'armL'], ['armL', 'forearmL'], ['forearmL', 'handL'],
  ['spine', 'armR'], ['armR', 'forearmR'], ['forearmR', 'handR'],
  ['hips', 'uplegL'], ['uplegL', 'legL'], ['legL', 'footL'],
  ['hips', 'uplegR'], ['uplegR', 'legR'], ['legR', 'footR'],
  ['armL', 'armR'], ['uplegL', 'uplegR'], ['hips', 'armL'], ['hips', 'armR'], ['spine', 'uplegL'], ['spine', 'uplegR'],
]
const HINGES: [(typeof LIMITS)[number], Role, Role, Role][] = [
  ['elbow', 'armL', 'forearmL', 'handL'], ['elbow', 'armR', 'forearmR', 'handR'],
  ['knee', 'uplegL', 'legL', 'footL'], ['knee', 'uplegR', 'legR', 'footR'],
  ['spine', 'hips', 'spine', 'head'],
  ['hip', 'spine', 'uplegL', 'legL'], ['hip', 'spine', 'uplegR', 'legR'],
  ['shoulder', 'hips', 'armL', 'forearmL'], ['shoulder', 'hips', 'armR', 'forearmR'],
]
// The limb bones turned, parent before child: [the bone's own role, the role it turns toward]. A null
// role is the bone above the one it turns toward, which has no point: the neck and the shoulders.
const TURNS: [Role | null, Role][] = [
  [null, 'head'],
  [null, 'armL'], ['armL', 'forearmL'], ['forearmL', 'handL'],
  [null, 'armR'], ['armR', 'forearmR'], ['forearmR', 'handR'],
  ['uplegL', 'legL'], ['legL', 'footL'],
  ['uplegR', 'legR'], ['legR', 'footR'],
]

type Copy = {
  bones: THREE.Object3D[] // by role
  hips: THREE.Quaternion // the hips' world rotation at death
  turns: { bone: THREE.Object3D; child: THREE.Object3D; from: number; to: number; rest: THREE.Quaternion }[]
}
type Body = {
  root: THREE.Object3D
  p: V[]
  q: V[] // where each point was a step ago
  sticks: [number, number, number][] // two points and their distance
  bends: [number, number, number, number, number][] // three points and the least and most angle at the middle one, radians
  g: number
  k: Pick<Numbers, 'damp' | 'iter' | 'sweeps' | 'radius' | 'vmax' | 'friction' | 'still' | 'calm'> & { cap: number } // the numbers at build
  basis: THREE.Quaternion // the pelvis basis at death, inverted
  copies: Copy[]
  seen: number // the last limpFor seen
  steps: number
  calm: number
  asleep: boolean
}

const RANGES: [keyof Numbers, (v: number) => boolean, string][] = [
  ['damp', v => v > 0 && v <= 1, 'above 0 and at most 1'],
  ['iter', v => Number.isInteger(v) && v >= 1, 'a whole number from 1'],
  ['sweeps', v => Number.isInteger(v) && v >= 1, 'a whole number from 1'],
  ['radius', v => v >= 0, 'at least 0'],
  ['vmax', v => v > 0, 'above 0'],
  ['friction', v => v >= 0 && v <= 1, 'from 0 to 1'],
  ['spread', v => v >= 0, 'at least 0'],
  ['still', v => v > 0, 'above 0'],
  ['calm', v => Number.isInteger(v) && v >= 1, 'a whole number from 1'],
  ['settle', v => v > 0, 'above 0'],
]
function check(p: Numbers) {
  for (const [key, ok, words] of RANGES) {
    const v = p[key] as number
    if (!(Number.isFinite(v) && ok(v))) throw new Error(`ragdoll3d ${key} must be ${words}, not ${v}`)
  }
  for (const role of ROLES) if (typeof p.bones?.[role] !== 'string' || !p.bones[role]) throw new Error(`ragdoll3d bones gives no suffix for ${role}`)
  for (const key of LIMITS) {
    const l = p.limits?.[key]
    if (!(Array.isArray(l) && l[0] >= 0 && l[0] <= l[1] && l[1] <= 180)) throw new Error(`ragdoll3d limits.${key} must be [least, most] degrees, 0 ≤ least ≤ most ≤ 180`)
  }
}

const plain = (name: string) => name.replace(/_\d+$/, '')
const isBone = (o: THREE.Object3D | null) => !!(o as THREE.Bone | null)?.isBone

// Every copy of the skeleton holding all 15 joints, the one anim's clips drive first.
function copiesOf(root: THREE.Object3D, p: Numbers, kind: string) {
  const tops: THREE.Object3D[] = []
  root.traverse(o => { if (isBone(o) && !isBone(o.parent)) tops.push(o) })
  const found = tops.map(top => {
    const bones: (THREE.Object3D | undefined)[] = ROLES.map(() => undefined)
    top.traverse(o => {
      if (!isBone(o)) return
      ROLES.forEach((role, i) => { if (!bones[i] && plain(o.name).endsWith(p.bones[role])) bones[i] = o })
    })
    return { top, bones }
  })
  const whole = found.filter(c => c.bones.every(Boolean)) as { top: THREE.Object3D; bones: THREE.Object3D[] }[]
  if (!whole.length) {
    const lacks = (c: (typeof found)[number]) => c.bones.filter(b => !b).length
    const best = found.reduce<(typeof found)[number] | undefined>((a, c) => (!a || lacks(c) < lacks(a) ? c : a), undefined)
    const missing = ROLES[best ? best.bones.findIndex(b => !b) : 0]
    throw new Error(`ragdoll3d: the ${kind} model has no bone ending ${p.bones[missing]}`)
  }
  const first = whole.find(c => plain(c.bones[I.hips].name) === c.bones[I.hips].name) ?? whole[0]
  return [first, ...whole.filter(c => c !== first)]
}

// The pelvis basis: y along hips → upper spine, x from the left up-leg to the right, square to y.
function basisOf(T: Three, p: V[]) {
  const at = (r: Role) => new T.Vector3(...p[I[r]])
  const y = at('spine').sub(at('hips')).normalize()
  const x = at('uplegR').sub(at('uplegL'))
  x.addScaledVector(y, -x.dot(y)).normalize()
  const z = new T.Vector3().crossVectors(x, y)
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z))
}

// Moves two points apart or together, equally, to the distance given.
function hold(a: V, b: V, len: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]
  const d = Math.hypot(dx, dy, dz)
  if (d === len || d === 0) return
  const k = (d - len) / d / 2
  a[0] += dx * k; a[1] += dy * k; a[2] += dz * k
  b[0] -= dx * k; b[1] -= dy * k; b[2] -= dz * k
}

const cross = (u: V, v: V): V => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
const dot = (u: V, v: V) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
const minus = (u: V, v: V): V => [u[0] - v[0], u[1] - v[1], u[2] - v[2]]
// v turned by `angle` about the unit axis n (Rodrigues), n square to v.
const turn = (v: V, n: V, angle: number): V => {
  const c = Math.cos(angle), s = Math.sin(angle), w = cross(n, v)
  return [v[0] * c + w[0] * s, v[1] * c + w[1] * s, v[2] * c + w[2] * s]
}

// Holds the angle at the middle point m within [lo, hi]: the two outer points turn about m, each
// through half the angle it is out by, in the plane of the three, which keeps both sticks' lengths,
// and then all three move together so their centre stays where it was. A straight or folded-flat
// hinge has no plane of its own: it bends across the pelvis's x (left up-leg to right), or its z
// where the limb lies along x.
function bend(p: V[], i: number, m: number, j: number, lo: number, hi: number) {
  const a = p[i], o = p[m], c = p[j]
  const u = minus(a, o), v = minus(c, o)
  const lu = Math.hypot(...u), lv = Math.hypot(...v)
  if (lu === 0 || lv === 0) return
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (lu * lv))))
  const want = Math.min(hi, Math.max(lo, angle))
  if (want === angle) return
  let n = cross(u, v)
  if (Math.hypot(...n) <= 1e-9 * lu * lv) {
    const y = minus(p[I.spine], p[I.hips]), x = minus(p[I.uplegR], p[I.uplegL])
    const ly = Math.hypot(...y) || 1
    const across = minus(x, y.map(t => (t * dot(x, y)) / (ly * ly)) as V)
    for (const w of [across, cross(across, y)]) {
      // w square to the limb, as the axis the hinge bends about.
      const k = dot(w, u) / (lu * lu)
      const s = minus(w, u.map(t => t * k) as V)
      if (Math.hypot(...s) > 1e-9 * Math.hypot(...w)) { n = s; break }
    }
  }
  const ln = Math.hypot(...n)
  if (ln === 0) return
  const axis = n.map(t => t / ln) as V
  // Turning u by +θ about n meets v, so the angle opens by δ when u turns −δ/2 and v +δ/2.
  // Turning u by +θ about the axis meets v, so the angle opens by δ as u turns −δ/2 and v +δ/2.
  const half = (want - angle) / 2
  const a2 = turn(u, axis, -half), c2 = turn(v, axis, half)
  const da = minus(a2, u), dc = minus(c2, v)
  const shift = [0, 1, 2].map(k => -(da[k] + dc[k]) / 3)
  for (let k = 0; k < 3; k++) {
    a[k] = o[k] + a2[k] + shift[k]
    c[k] = o[k] + c2[k] + shift[k]
    o[k] += shift[k]
  }
}

type Held = {
  root: THREE.Object3D
  bones: { name: string; obj: THREE.Object3D; id: number; off: THREE.Quaternion }[]
  hips: { obj: THREE.Object3D; id: number; at: THREE.Vector3 }
  copies: [THREE.Object3D, THREE.Object3D][]
}

export function ragdoll3d() {
  const bodies = new Map<number, Body>()
  const held = new Map<number, Held>()
  let text: string | undefined

  // The physics mode: each limp row's model follows its box3d bodies.
  function follow(plugins: Plugins) {
    const T: Three = plugins.render3d.THREE
    const numbers = PHYSICS
    const byId = new Map(plugins.wire.rows.map(r => [r.id, r]))
    for (const row of plugins.wire.rows) {
      if (!row.data.limp || !row.data.ragdoll) {
        held.delete(row.id)
        continue
      }
      const root = plugins.anim.model(row.id) as THREE.Object3D | undefined
      if (!root) continue
      const body = (id: number) => byId.get(id)?.data
      let h = held.get(row.id)
      if (!h || h.root !== root) {
        // three culls a skinned mesh by bounds measured round its rest pose; a ragdoll throws the body
        // out of them, and its meshes would blink out.
        root.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false })
        root.updateMatrixWorld(true)
        const first = (suffix: string) => {
          let found: THREE.Object3D | undefined
          root.traverse(o => { if (!found && (o as THREE.Bone).isBone && o.name.endsWith(suffix)) found = o })
          return found!
        }
        const list = Object.entries(numbers.bones).map(([name, b]) => {
          const obj = first(b.model)
          const d = body(row.data.ragdoll[name])
          const q = new T.Quaternion().fromArray(d.rot).normalize()
          return { name, obj, id: row.data.ragdoll[name], off: q.invert().multiply(obj.getWorldQuaternion(new T.Quaternion())) }
        })
        const torso = list.find(b => b.name === numbers.root)!
        const td = body(torso.id)
        const tq = new T.Quaternion().fromArray(td.rot).normalize()
        const at = torso.obj.getWorldPosition(new T.Vector3()).sub(new T.Vector3().fromArray(td.pos)).applyQuaternion(tq.clone().invert())
        const primary = new Map<string, THREE.Object3D>()
        const copies: [THREE.Object3D, THREE.Object3D][] = []
        root.traverse(o => { if ((o as THREE.Bone).isBone && !/_\d+$/.test(o.name) && !primary.has(o.name)) primary.set(o.name, o) })
        root.traverse(o => {
          if (!(o as THREE.Bone).isBone) return
          const base = o.name.replace(/_\d+$/, '')
          const p = primary.get(base)
          if (p && p !== o) copies.push([p, o])
        })
        h = { root, bones: list, hips: { obj: torso.obj, id: torso.id, at }, copies }
        held.set(row.id, h)
      }
      // The hips stand where the torso's body carries them.
      const td = body(h.hips.id)
      if (!td) continue
      const tq = new T.Quaternion().fromArray(td.rot).normalize()
      const hipsAt = h.hips.at.clone().applyQuaternion(tq).add(new T.Vector3().fromArray(td.pos))
      const parent = h.hips.obj.parent!
      parent.updateMatrixWorld(true)
      h.hips.obj.position.copy(parent.worldToLocal(hipsAt))
      // Each bone, parents first, to its body's turn times its offset, in its parent's frame.
      for (const b of h.bones) {
        const d = body(b.id)
        if (!d) continue
        const want = new T.Quaternion().fromArray(d.rot).normalize().multiply(b.off)
        const pq = b.obj.parent!.getWorldQuaternion(new T.Quaternion())
        b.obj.quaternion.copy(pq.invert().multiply(want))
        b.obj.updateMatrixWorld(true)
      }
      for (const [p, c] of h.copies) {
        c.position.copy(p.position)
        c.quaternion.copy(p.quaternion)
      }
      root.updateMatrixWorld(true)
    }
  }

  function build(T: Three, r: Row, p: Numbers, plugins: Plugins, dt: number, on: { model: Model; pose: Pose; gravity: Gravity }): Body | undefined {
    const world = plugins.wire.scene.world!
    const g = on.gravity(world, r.kind)
    if (g === undefined) throw new Error(`ragdoll3d: ${world.ragdoll3d.mods.gravity} gives no gravity for kind ${r.kind}, so the ${r.kind} body cannot fall`)
    if (!on.model(plugins, r.id)) return undefined
    const d = r.data
    const root = on.pose(plugins, r.id, d.pose.clip, d.pose.clipT)
    const found = copiesOf(root, p, r.kind)
    const named = new Map<string, THREE.Object3D>()
    found[0].top.traverse(o => { if (isBone(o) && !named.has(plain(o.name))) named.set(plain(o.name), o) })
    for (const c of found.slice(1)) c.top.traverse(o => { const from = isBone(o) && named.get(plain(o.name)); if (from) o.quaternion.copy(from.quaternion) })
    root.updateMatrixWorld(true)

    const pts = found[0].bones.map(b => b.getWorldPosition(new T.Vector3()).toArray() as V)
    const dist = (a: number, b: number) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1], pts[a][2] - pts[b][2])
    const sticks: Body['sticks'] = STICKS.map(([a, b]) => [I[a], I[b], dist(I[a], I[b])])
    const bends: Body['bends'] = HINGES.map(([key, a, m, c]) => [I[a], I[m], I[c], (p.limits[key][0] * Math.PI) / 180, (p.limits[key][1] * Math.PI) / 180])

    const { dir, speed, height } = d.blow
    const len = Math.hypot(dir[0], dir[1])
    const ux = len > 0 ? dir[0] / len : 0, uz = len > 0 ? dir[1] / len : 0
    const aim = d.pos[1] + height
    let hit = 0
    pts.forEach((v, i) => { if (Math.abs(v[1] - aim) < Math.abs(pts[hit][1] - aim)) hit = i })
    const q = pts.map((v, i): V => {
      const s = speed * dt * (i === hit ? 1 : p.spread)
      return [v[0] - ux * s, v[1], v[2] - uz * s]
    })

    const copies: Copy[] = found.map(({ bones }) => ({
      bones,
      hips: bones[I.hips].getWorldQuaternion(new T.Quaternion()),
      turns: TURNS.flatMap(([own, to]) => {
        const bone = own ? bones[I[own]] : bones[I[to]].parent
        if (!bone || !isBone(bone) || bone === bones[I.spine]) return []
        return [{ bone, child: bones[I[to]], from: own ? I[own] : -1, to: I[to], rest: bone.quaternion.clone() }]
      }),
    }))
    const { damp, iter, sweeps, radius, vmax, friction, still, calm } = p
    return {
      root, p: pts, q, sticks, bends, g, k: { damp, iter, sweeps, radius, vmax, friction, still, calm, cap: Math.floor(p.settle / dt + 1e-9) },
      basis: basisOf(T, pts).invert(), copies, seen: d.limpFor, steps: 0, calm: 0, asleep: false,
    }
  }

  function step(b: Body, dt: number, ground: Ground, solids: ((x: number, z: number, r: number) => Solid[]) | undefined) {
    const n = b.p.length, p = b.k
    const was = b.p.map(v => [...v] as V)
    const fall = b.g * dt * dt
    for (let i = 0; i < n; i++) {
      const a = b.p[i], o = b.q[i]
      let vx = (a[0] - o[0]) * p.damp, vy = (a[1] - o[1]) * p.damp, vz = (a[2] - o[2]) * p.damp
      const s = Math.hypot(vx, vy, vz)
      if (s > p.vmax) { vx *= p.vmax / s; vy *= p.vmax / s; vz *= p.vmax / s }
      b.q[i] = [a[0], a[1], a[2]]
      a[0] += vx; a[1] += vy - fall; a[2] += vz
    }
    let cx = 0, cz = 0
    for (const v of b.p) { cx += v[0] / n; cz += v[2] / n }
    let far = 0
    for (const v of b.p) far = Math.max(far, Math.hypot(v[0] - cx, v[2] - cz))
    const circles = solids ? solids(cx, cz, far + p.radius + p.vmax) : []
    // A point under its floor is lifted onto it, and touches the ground for the rest of the step.
    const touched = new Array<boolean>(n).fill(false)
    const floors = b.p.map(() => [0, 0, 0, 0, 0])
    const read = (tilt: boolean) => {
      for (let i = 0; i < n; i++) {
        const [x, , z] = b.p[i], h = ground.height(x, z)
        floors[i] = tilt ? [h, (ground.height(x + p.vmax, z) - h) / p.vmax, (ground.height(x, z + p.vmax) - h) / p.vmax, x, z] : [h, 0, 0, x, z]
      }
    }
    const out = () => {
      for (let i = 0; i < n; i++) {
        const a = b.p[i], [h, gx, gz, x, z] = floors[i]
        const floor = h + gx * (a[0] - x) + gz * (a[2] - z) + p.radius
        if (a[1] < floor) { a[1] = floor; touched[i] = true }
        for (const c of circles) {
          const dx = a[0] - c.x, dz = a[2] - c.z, d = Math.hypot(dx, dz), m = c.radius + p.radius
          if (d >= m) continue
          const [ux, uz] = d > 0 ? [dx / d, dz / d] : [1, 0]
          a[0] = c.x + ux * m
          a[2] = c.z + uz * m
        }
      }
    }
    for (let k = 0; k < p.iter; k++) {
      read(true)
      out()
      for (let r = 0; r < p.sweeps; r++) {
        for (const [i, j, len] of b.sticks) hold(b.p[i], b.p[j], len)
        for (const [i, m, j, lo, hi] of b.bends) bend(b.p, i, m, j, lo, hi)
        out()
      }
    }
    read(false)
    out()
    let moved = 0
    for (let i = 0; i < n; i++) {
      const a = b.p[i], o = b.q[i]
      if (touched[i]) { o[0] += (a[0] - o[0]) * p.friction; o[2] += (a[2] - o[2]) * p.friction }
      moved = Math.max(moved, Math.hypot(a[0] - was[i][0], a[1] - was[i][1], a[2] - was[i][2]))
    }
    b.steps++
    b.calm = moved < p.still ? b.calm + 1 : 0
    if (b.calm >= p.calm) b.asleep = true
  }

  function write(T: Three, b: Body) {
    const turn = basisOf(T, b.p).multiply(b.basis)
    const at = (i: number) => new T.Vector3(...b.p[i])
    for (const c of b.copies) {
      const hips = c.bones[I.hips], up = hips.parent!
      hips.quaternion.copy(up.getWorldQuaternion(new T.Quaternion()).invert().multiply(turn.clone().multiply(c.hips)))
      hips.position.copy(up.worldToLocal(at(I.hips)))
      hips.updateMatrixWorld(true)
      for (const t of c.turns) {
        t.bone.quaternion.copy(t.rest)
        t.bone.updateMatrixWorld(true)
        const o = t.bone.getWorldPosition(new T.Vector3())
        const now = t.child.getWorldPosition(new T.Vector3()).sub(o).normalize()
        const want = at(t.to).sub(t.from < 0 ? o : at(t.from)).normalize()
        const world = new T.Quaternion().setFromUnitVectors(now, want).multiply(t.bone.getWorldQuaternion(new T.Quaternion()))
        t.bone.quaternion.copy(t.bone.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(world))
        t.bone.updateMatrixWorld(true)
      }
    }
  }

  return {
    body(id: number) {
      const b = bodies.get(id)
      if (!b) return undefined
      return { points: Object.fromEntries(ROLES.map((r, i) => [r, [...b.p[i]]])) as Record<Role, V>, steps: b.steps, asleep: b.asleep }
    },
    tick(plugins: Plugins) {
      const scene = plugins.wire.scene
      const p = scene.world?.ragdoll3d as Numbers | undefined
      if (!p) throw new Error('ragdoll3d: the scene gives no world.ragdoll3d')
      if ((p as { physics?: boolean }).physics) {
        follow(plugins)
        return
      }
      const now = JSON.stringify(p)
      if (now !== text) {
        check(p)
        text = now
      }
      const world = scene.world!
      const model = mod<Model>(world, 'ragdoll3d', 'model'), pose = mod<Pose>(world, 'ragdoll3d', 'pose')
      if (!model) throw new Error('ragdoll3d lays its bodies on the model a mod hands it, and the scene names none in world.ragdoll3d.mods.model')
      if (!pose) throw new Error('ragdoll3d builds its bodies from the pose a mod draws, and the scene names none in world.ragdoll3d.mods.pose')
      ahead(scene, 'ragdoll3d', 'model')
      ahead(scene, 'ragdoll3d', 'pose')
      provided(scene, 'ragdoll3d', 'land')
      provided(scene, 'ragdoll3d', 'solids')
      const gravity = mod<Gravity>(world, 'ragdoll3d', 'gravity')
      if (!gravity) throw new Error('ragdoll3d drops its bodies at the gravity a mod hands it, and the scene names none in world.ragdoll3d.mods.gravity')
      const dt = scene.prefabs.engine?.dt
      if (!dt) throw new Error('ragdoll3d: the scene has no engine prefab with dt')
      const ground = mod<Land>(world, 'ragdoll3d', 'land')?.(plugins)
      const over = mod<Solids>(world, 'ragdoll3d', 'solids')
      const solids = over && ((x: number, z: number, r: number) => over(plugins, x, z, r))
      const T: Three = plugins.render3d.THREE
      const seen = new Set<number>()
      for (const r of plugins.wire.rows) {
        if (!r.data.limp) continue
        seen.add(r.id)
        let b = bodies.get(r.id)
        if (b && (r.data.limpFor < b.seen || model(plugins, r.id) !== b.root)) {
          bodies.delete(r.id)
          b = undefined
        }
        let changed = false
        if (!b) {
          b = build(T, r, p, plugins, dt, { model, pose, gravity })
          if (!b) continue
          bodies.set(r.id, b)
          changed = true
        }
        b.seen = r.data.limpFor
        if (ground) {
          const owed = Math.min(r.data.limpFor, b.k.cap)
          while (!b.asleep && b.steps < owed) {
            step(b, dt, ground, solids)
            changed = true
          }
          if (b.steps >= b.k.cap) b.asleep = true
        }
        if (changed) write(T, b)
      }
      for (const id of [...bodies.keys()]) if (!seen.has(id)) bodies.delete(id)
    },
    close() {
      bodies.clear()
      held.clear()
      text = undefined
    },
  }
}
