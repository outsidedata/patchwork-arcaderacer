// ragdoll3d's server half: how a rule kills a body, lays it and stands it again, the same calls in
// either of its modes.
//
// `die(w, me, blow, hits)`, on the step a body dies. `blow` is `{ dir: [x, z], speed, height }`, the
// way it was struck across the ground, m/s, and metres above its `pos`. It writes the dying row:
// `limp` true, `limpFor` 0, `blow`, and `pose`, the clip and playhead it died in (its `clip` and
// `clipT`, or, for a row anim has not played yet, its stance's `still` clip at 0, off its rig, anim's
// `rigOf`, `stanceOf` and `momentOf`). A body already limp is left as it lies.
//   Without `world.ragdoll3d.physics`, that is all: the page half lays the body down from those fields
//   (`ragdoll3d.plugin.ts`).
//   With `physics: true`, it also falls (`fall`, below) on the server: pushed by `hits`, when the rule
//   gives them, or else by the blow, the bone whose middle stands nearest `pos[1] + height` set moving
//   at the blow's speed along its way, on top of the body's own `vel`.
// `lie(me)`, each step a body lies: `limpFor` one more. A rule reads no step counter, so the row counts
// its own.
// `rise(w, me)`, when a body stands again or before its row ends: its ragdoll's bone and joint rows
// end and its `ragdoll` is null, and `limp`, `limpFor`, `blow` and `pose` are put back as a standing
// row holds them (false, 0, null, null).
//
// The physics mode (`world.ragdoll3d.physics: true`): a body that dies becomes a box3d ragdoll, one
// box3d body per bone, joined at its joints, on the server, so it falls, is thrown and lands as rigid
// bodies do, the same on every seat. Its page half (`ragdoll3d.plugin.ts`) turns the model's bones to
// follow the bodies, and its mod for box3d (`ragdoll3d.box3d.ts`) makes each bone's body and each joint
// from its row.
//
// `capsules(w, me)` is a standing body's bones as capsules, which its mod for hitscan3d hands a shot
// as the body (`ragdoll3d.hitscan3d.ts`), so a weapon knows what it hit before the body falls.
//
// The fall, `die`'s in the physics mode, `hits` what struck it (each a push at a point on a
// bone, put on that bone's body as box3d's `pushes`): a `bone` row for each of the body's bones its numbers
// (`bones`) name, a capsule from one end of the bone to the other as the body stood in its `pose`
// (`ends`), its `radius` the bone's; and
// a `bonejoint` row for each of `joints`, joining a parent bone and a child at the point
// where the child starts. Every joint is the same ball joint: the child swings at most
// `limit.swing` degrees from the way it pointed at death and rolls about itself at most
// `limit.roll` degrees either way. The
// body's row keeps `ragdoll`, bone name to its row's id, which the page half reads.
//
// A segment's two ends as the row stands are anim's `ends`, off its body's measurements in its rig
// file's `ends`, which anim's bake measures on every body it bakes (`anim.export.py`).
//
// The numbers, `PHYSICS`, a Mixamo body's:
//   root      the bone the model's hips follow.
//   bones     bone name to `{ radius, model }`: the capsule's radius, metres, and the suffix of the
//             model's bone it turns.
//   joints    `[{ parent, child }]`, the child starting at the parent.
//   limit     `{ swing, roll }` degrees.
//   joint     box3d's settings of every joint; `body`, of every bone's body; `shape`, of every bone's
//             capsule, its density and surface.
//
// A bone row: box3d's `pos`, `rot`, `vel`, `spin`, `awake`; `of`, the body's id; `bone`, its name;
// `half`, half its length between the capsule's two centres; `radius`. A joint row: box3d's `a` and
// `b`; `joint`, its box3d Joint.
//
// The kinds of those rows, `bone` and `bonejoint`, are ragdoll3d's own, exported here, with no rule:
// box3d moves them, `fall` spawns them with every field written and `rise` ends them. A scene in the
// physics mode lists both in its sim and gives each a prefab, which the engine spawns no row without
// and whose values `fall` writes over. They have no look: the page half turns the body's model to
// follow them.
import type { Kind, Row, W } from '#engine/engine.ts'
import { animKind, ends, momentOf, rigOf, stanceOf } from '#plugins/anim/anim.sim.ts'
import * as math from '#plugins/math/math.sim.ts'

type Q = number[]

export const PHYSICS = {
  root: 'torso',
  bones: {
    torso: { radius: 0.13, model: 'Hips' },
    head: { radius: 0.1, model: 'Head' },
    armL: { radius: 0.05, model: 'LeftArm' },
    forearmL: { radius: 0.045, model: 'LeftForeArm' },
    handL: { radius: 0.04, model: 'LeftHand' },
    armR: { radius: 0.05, model: 'RightArm' },
    forearmR: { radius: 0.045, model: 'RightForeArm' },
    handR: { radius: 0.04, model: 'RightHand' },
    uplegL: { radius: 0.075, model: 'LeftUpLeg' },
    legL: { radius: 0.06, model: 'LeftLeg' },
    footL: { radius: 0.045, model: 'LeftFoot' },
    uplegR: { radius: 0.075, model: 'RightUpLeg' },
    legR: { radius: 0.06, model: 'RightLeg' },
    footR: { radius: 0.045, model: 'RightFoot' },
  } as Record<string, { radius: number; model: string }>,
  joints: [
    { parent: 'torso', child: 'head' },
    { parent: 'torso', child: 'armL' },
    { parent: 'armL', child: 'forearmL' },
    { parent: 'forearmL', child: 'handL' },
    { parent: 'torso', child: 'armR' },
    { parent: 'armR', child: 'forearmR' },
    { parent: 'forearmR', child: 'handR' },
    { parent: 'torso', child: 'uplegL' },
    { parent: 'uplegL', child: 'legL' },
    { parent: 'legL', child: 'footL' },
    { parent: 'torso', child: 'uplegR' },
    { parent: 'uplegR', child: 'legR' },
    { parent: 'legR', child: 'footR' },
  ],
  limit: { swing: 60, roll: 30 },
  joint: { collideConnected: false },
  body: { type: 'dynamic', linearDamping: 0.05, angularDamping: 0.4, gravityScale: 1, sleepThreshold: 0.05, isBullet: false },
  shape: { density: 1000, baseMaterial: { friction: 0.8, restitution: 0, rollingResistance: 0.05 }, filter: { categoryBits: 1, maskBits: 65535, groupIndex: -1 } },
}

// A vector in the body's frame turned to the world by `yaw` about y (yaw θ faces (sin θ, cos θ)).
export const turn = (v: number[], yaw: number) => {
  const c = math.cos(yaw), s = math.sin(yaw)
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
}

// q · r, quaternions [x, y, z, w].
export const times = (q: Q, r: Q): Q => [
  q[3] * r[0] + q[0] * r[3] + q[1] * r[2] - q[2] * r[1],
  q[3] * r[1] - q[0] * r[2] + q[1] * r[3] + q[2] * r[0],
  q[3] * r[2] + q[0] * r[1] - q[1] * r[0] + q[2] * r[3],
  q[3] * r[3] - q[0] * r[0] - q[1] * r[1] - q[2] * r[2],
]
const conj = (q: Q): Q => [-q[0], -q[1], -q[2], q[3]]
// v turned by q.
const rotate = (q: Q, v: number[]) => {
  const p = times(times(q, [v[0], v[1], v[2], 0]), conj(q))
  return [p[0], p[1], p[2]]
}
// The shortest turn taking +y onto the unit vector u.
export const fromUp = (u: number[]): Q => {
  const q = [u[2], 0, -u[0], 1 + u[1]]
  const l = math.hypot(q[0], q[1], q[2], q[3])
  return l < 1e-9 ? [1, 0, 0, 0] : q.map(c => c / l)
}

const DEG = Math.PI / 180

// A joint of `world.ragdoll3d.joints`: the parent bone and the child that starts at it.
type JointNumbers = { parent: string; child: string }

// The turn taking +z onto +y: a bone lies along its body's +y, and Box3D's spherical joint twists
// about its frame's z.
const Z_TO_Y: Q = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]

// What struck a body as it died: a push of `impulse` (N·s, a world vector) at `point` on the bone
// named, applied to that bone's body on the step its ragdoll is made.
export type Hit = { bone: string; point: number[]; impulse: number[] }

// The bones of a standing body as capsules in the world, this step of its clip: each bone of
// `world.ragdoll3d.bones` from one end to the other, of its `radius`.
export function capsules(w: W, me: Row): { bone: string; a: number[]; b: number[]; radius: number }[] {
  const d = me.data
  return Object.entries(PHYSICS.bones).map(([bone, b]) => {
    const [ax, ay, az, bx, by, bz] = ends(w, me, bone)
    const pa = turn([ax, ay, az], d.yaw), pb = turn([bx, by, bz], d.yaw)
    return {
      bone,
      a: [d.pos[0] + pa[0], d.pos[1] + pa[1], d.pos[2] + pa[2]],
      b: [d.pos[0] + pb[0], d.pos[1] + pb[1], d.pos[2] + pb[2]],
      radius: b.radius,
    }
  })
}

function fall(w: W, me: Row, hits: Hit[]) {
  const d = me.data
  const p = PHYSICS
  const half = d.yaw / 2
  const yawQ = [0, math.sin(half), 0, math.cos(half)]
  const placed: Record<string, { id: number; pos: number[]; rot: Q; start: number[] }> = {}
  for (const [bone, b] of Object.entries(p.bones)) {
    const [ax, ay, az, bx, by, bz] = ends(w, me, bone, d.pose)
    const len = math.hypot(bx - ax, by - ay, bz - az)
    const mid = turn([(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], d.yaw)
    const start = turn([ax, ay, az], d.yaw)
    const rot = times(yawQ, fromUp([(bx - ax) / len, (by - ay) / len, (bz - az) / len]))
    const pos = [d.pos[0] + mid[0], d.pos[1] + mid[1], d.pos[2] + mid[2]]
    const row = w.spawn('bone', {
      of: me.id, bone, half: Math.max(0.001, len / 2 - b.radius), radius: b.radius,
      pos, rot, vel: [...(d.vel ?? [0, 0, 0])], spin: [0, 0, 0], awake: true,
    })
    placed[bone] = { id: row.id, pos, rot, start: [d.pos[0] + start[0], d.pos[1] + start[1], d.pos[2] + start[2]] }
  }
  for (const j of p.joints as JointNumbers[]) {
    const A = placed[j.parent], B = placed[j.child]
    if (!A || !B) continue
    const at = B.start
    const local = (p: { pos: number[]; rot: Q }) => rotate(conj(p.rot), [at[0] - p.pos[0], at[1] - p.pos[1], at[2] - p.pos[2]])
    // Every joint is the same: a ball whose frames lie with z along the child bone (Box3D twists a
    // spherical joint about z and swings its cone away from z), both frames one frame in the world, so
    // the pose it dies in is the middle of its swing and its roll.
    const along = times(B.rot, Z_TO_Y)
    const limit = p.limit
    w.spawn('bonejoint', {
      a: A.id, b: B.id,
      joint: {
        ...p.joint,
        type: 'spherical',
        enableConeLimit: true, coneAngle: limit.swing * DEG,
        enableTwistLimit: true, lowerTwistAngle: -limit.roll * DEG, upperTwistAngle: limit.roll * DEG,
        localFrameA: { pos: local(A), rot: times(conj(A.rot), along) },
        localFrameB: { pos: local(B), rot: Z_TO_Y },
      },
    })
  }
  // What struck it, as pushes on the bones struck, applied on the step their bodies are made.
  for (const h of hits) {
    const p = placed[h.bone]
    if (!p) continue
    const row = w.get(p.id)
    row.data.pushes = [...(row.data.pushes ?? []), { impulse: h.impulse, point: h.point }]
  }
  d.ragdoll = Object.fromEntries(Object.entries(placed).map(([bone, p]) => [bone, p.id]))
}

export const bone: Kind = {}
export const bonejoint: Kind = {}

// The way a body was struck as it died (see the header).
export type Blow = { dir: number[]; speed: number; height: number }

export function die(w: W, me: Row, blow: Blow, hits?: Hit[]) {
  const d = me.data
  if (d.limp) return
  let pose = { clip: d.clip, clipT: d.clipT }
  if (d.clip == null) {
    const rig = rigOf(w, animKind(me))
    pose = { clip: momentOf(rig, stanceOf(rig, d), 'still'), clipT: 0 }
  }
  Object.assign(d, { limp: true, limpFor: 0, blow, pose })
  if (!w.world.ragdoll3d.physics) return
  fall(w, me, hits ?? [])
  if (hits) return
  // The blow, on the bone whose middle stands nearest its height.
  const aim = d.pos[1] + blow.height
  const bones = Object.values(d.ragdoll as Record<string, number>).map(id => w.get(id))
  const struck = bones.reduce((a, b) => (Math.abs(b.data.pos[1] - aim) < Math.abs(a.data.pos[1] - aim) ? b : a))
  const l = math.hypot(blow.dir[0], blow.dir[1])
  const ux = l > 0 ? blow.dir[0] / l : 0, uz = l > 0 ? blow.dir[1] / l : 0
  const v = struck.data.vel
  struck.data.vel = [v[0] + ux * blow.speed, v[1], v[2] + uz * blow.speed]
}

export function lie(me: Row) {
  me.data.limpFor += 1
}

export function rise(w: W, me: Row) {
  const d = me.data
  const ids = new Set(Object.values(d.ragdoll ?? {}) as number[])
  if (ids.size) {
    for (const j of w.all('bonejoint')) if (ids.has(j.data.a) || ids.has(j.data.b)) w.end(j)
    for (const id of ids) w.end(w.get(id))
    d.ragdoll = null
  }
  Object.assign(d, { limp: false, limpFor: 0, blow: null, pose: null })
}
