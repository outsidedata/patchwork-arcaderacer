// dismember3d: limbs that come off a Mixamo body. Its server half (this file) holds where a body's
// joints stand, takes the hits a shot lands on them, and cuts a limb off into a piece; its page half
// (`dismember3d.plugin.ts`) leaves the lost limbs out of what the body draws, draws every piece and
// gores it. Its mod for hitscan3d (`dismember3d.hitscan3d.ts`) hands a shot the joints as the body;
// its mod for box3dvehicle (`dismember3d.box3dvehicle.ts`) has a car crush a body and lay it down.
//
// The limbs are a Mixamo body's segments, each named by the bone it starts at, as anim's bake measures
// them into the rig's `ends` (`anim.export.py`): `head`; on each side the upper arm, forearm and hand
// (`armL`, `forearmL`, `handL`, …R), and the thigh, shin and foot (`uplegL`, `legL`, `footL`, …R). What
// every Mixamo body shares is `LIMBS`, one entry each:
//   piece    the kind of the piece row it comes off as, a kind of the game's that box3d moves (its
//            `world.box3d.kinds` entry, the shape it tumbles as) and that has no look of its own: this
//            plugin's page half draws it. `PIECES` is every piece kind, once.
//   below    the segments that go with it, those still on: the forearm and the hand with an upper arm.
//   joint    `{ radius, hp, about? }`: the sphere a shot meets it in, `radius` metres, where the segment
//            starts (the shoulder for an upper arm, the elbow for a forearm, the wrist for a hand; the
//            hip, the knee and the ankle for the legs), or about its middle for one `about` marks (the
//            head); and the hits it takes, `hp`.
//   push     m/s in the body's frame (x its left, y up, z ahead) the piece is thrown at, beside the
//            body's own velocity; `spin`, radians a second about the body's axes it spins at.
//   kills    losing it drops the body where it stands (ragdoll3d's `die`), still, its blow `fall`,
//            `{ dir: [x, z], speed, height }` in the body's frame, turned by its `yaw`.
//   crawls   losing it puts the body in its rig's `crawl` stance from that step.
//
// The fixed numbers of a scene are `world.dismember3d`:
//   kinds    `{ <kind>: { gore?: { sever?, drip? } } }`: the kinds of body that come apart, and the
//            particle3d effects each one's pieces burst in where they come off (`sever`) and drip as
//            they lie (`drip`), none for one left out (`dismember3d.plugin.ts`).
//   mods     `bodies`, the bodies its mod for hitscan3d hands beside its own (`dismember3d.hitscan3d.ts`);
//            `land`, the ground its gore comes to rest on (`dismember3d.plugin.ts`).
//
// A body that comes apart is a row of one of `kinds`, drawn by anim, its pose its `clip` and `clipT`,
// and stood at its `pos` facing its `yaw`. Its fields this plugin writes: `off`, the segments it has
// lost, `[]` in its prefab; `hp`, each joint's hits left, `{}` in its prefab and filled the first time
// a joint is hit; `rig`, `crawl` once a leg is lost; and ragdoll3d's dying row through `die`.
// A piece row: box3d's `pos`, `rot`, `vel`, `spin` and `awake`; `of`, the id of the body it came off;
// `limbs`, the segments it carries, which the page half draws.
//
// `joints(w, me)` is every joint of a body that still has its segment, `{ segment, at, radius }`, `at`
// in the world, as it stands this step of its clip; none for a body anim has played no clip on yet.
// `hit(w, me, struck)`, hitscan3d's `Struck`, which a body's `hit` act hands it: the joint of the
// segment its `part` names, one the body still has, while it is not limp, loses `damage` of its hp,
// and at none the segment is lost as `lose` loses it.
// `lose(w, me, limb)`: a segment the body still has comes off, while it is not limp and once it has
// played a clip (a body spawned this step stands nowhere a segment could be cut from), and with it every
// segment its `below` lists that is still on. They all go on `off`, and one row of its `piece` kind is
// spawned carrying them, along them as they stand this step: from the top of the segment lost to the
// end of the lowest one going with it, standing at their middle, turned so the piece's shape, which
// lies along its own y, runs from one end to the other, the whole turned by the body's `yaw` and moved
// to its `pos`. It is thrown at `push` plus the body's velocity, spinning at `spin`. Then `crawls` and
// `kills`.
// `pieces(w, body)` is every piece row cut off a body: a body's rule ends them when it clears it away.
import type { Row, W } from '#engine/engine.ts'
import type { Wire } from '#engine/browser.ts'
import { ends } from '#plugins/anim/anim.sim.ts'
import type { Struck } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import * as math from '#plugins/math/math.sim.ts'
import { die } from '#plugins/ragdoll3d/ragdoll3d.sim.ts'

export type Limb = {
  piece: string; below: string[]; joint: { radius: number; hp: number; about?: boolean }
  push: number[]; spin: number[]; kills?: boolean; crawls?: boolean; fall?: { dir: number[]; speed: number; height: number }
}

export const LIMBS: Record<string, Limb> = {
  head: { piece: 'skull', below: [], joint: { radius: 0.13, hp: 1, about: true }, push: [0.3, 2.5, -1.2], spin: [4, 1, 2], kills: true, fall: { dir: [0, -1], speed: 1.5, height: 1.4 } },
  armL: { piece: 'arm', below: ['forearmL', 'handL'], joint: { radius: 0.08, hp: 1 }, push: [0.8, 0.5, -0.3], spin: [2, 0.5, 4] },
  forearmL: { piece: 'forearm', below: ['handL'], joint: { radius: 0.07, hp: 1 }, push: [0.8, 0.5, -0.3], spin: [2, 0.5, 4] },
  handL: { piece: 'hand', below: [], joint: { radius: 0.06, hp: 1 }, push: [0.8, 0.6, -0.3], spin: [3, 1, 5] },
  armR: { piece: 'arm', below: ['forearmR', 'handR'], joint: { radius: 0.08, hp: 1 }, push: [-0.8, 0.5, -0.3], spin: [2, -0.5, -4] },
  forearmR: { piece: 'forearm', below: ['handR'], joint: { radius: 0.07, hp: 1 }, push: [-0.8, 0.5, -0.3], spin: [2, -0.5, -4] },
  handR: { piece: 'hand', below: [], joint: { radius: 0.06, hp: 1 }, push: [-0.8, 0.6, -0.3], spin: [3, -1, -5] },
  uplegL: { piece: 'thigh', below: ['legL', 'footL'], joint: { radius: 0.11, hp: 1 }, push: [0.6, 0.3, -0.4], spin: [1, 0.3, 2], crawls: true },
  legL: { piece: 'shin', below: ['footL'], joint: { radius: 0.09, hp: 1 }, push: [0.6, 0.3, -0.4], spin: [1, 0.3, 2], crawls: true },
  footL: { piece: 'foot', below: [], joint: { radius: 0.07, hp: 1 }, push: [0.5, 0.4, -0.5], spin: [2, 0.5, 3] },
  uplegR: { piece: 'thigh', below: ['legR', 'footR'], joint: { radius: 0.11, hp: 1 }, push: [-0.6, 0.3, -0.4], spin: [1, -0.3, -2], crawls: true },
  legR: { piece: 'shin', below: ['footR'], joint: { radius: 0.09, hp: 1 }, push: [-0.6, 0.3, -0.4], spin: [1, -0.3, -2], crawls: true },
  footR: { piece: 'foot', below: [], joint: { radius: 0.07, hp: 1 }, push: [-0.5, 0.4, -0.5], spin: [2, -0.5, -3] },
}

export const PIECES = [...new Set(Object.values(LIMBS).map(l => l.piece))]

// A vector in the body's frame turned to the world by `yaw` about y (yaw θ faces (sin θ, cos θ)).
export const turn = (v: number[], yaw: number) => {
  const c = math.cos(yaw), s = math.sin(yaw)
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]
}

// q · r, quaternions [x, y, z, w].
const times = (q: number[], r: number[]) => [
  q[3] * r[0] + q[0] * r[3] + q[1] * r[2] - q[2] * r[1],
  q[3] * r[1] - q[0] * r[2] + q[1] * r[3] + q[2] * r[0],
  q[3] * r[2] + q[0] * r[1] - q[1] * r[0] + q[2] * r[3],
  q[3] * r[3] - q[0] * r[0] - q[1] * r[1] - q[2] * r[2],
]

// The shortest turn taking +y onto the unit vector u.
const fromUp = (u: number[]) => {
  const q = [u[2], 0, -u[0], 1 + u[1]]
  const l = math.hypot(q[0], q[1], q[2], q[3])
  return l < 1e-9 ? [1, 0, 0, 0] : q.map(c => c / l)
}

export type Joint = { segment: string; at: number[]; radius: number }

export function joints(w: W | Wire, me: Row): Joint[] {
  const d = me.data
  // A body spawned this step has played no clip yet, so it stands nowhere a joint could be read.
  if (!d.clip) return []
  const out: Joint[] = []
  for (const [segment, l] of Object.entries(LIMBS)) {
    if (d.off.includes(segment)) continue
    const [ax, ay, az, bx, by, bz] = ends(w, me, segment)
    const local = l.joint.about ? [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2] : [ax, ay, az]
    const at = turn(local, d.yaw)
    out.push({ segment, at: [d.pos[0] + at[0], d.pos[1] + at[1], d.pos[2] + at[2]], radius: l.joint.radius })
  }
  return out
}

export function hit(w: W, me: Row, h: Struck) {
  const d = me.data
  const segment = h.part
  if (d.limp || segment === null || !LIMBS[segment] || d.off.includes(segment)) return
  const left = (d.hp[segment] ?? LIMBS[segment].joint.hp) - h.damage
  d.hp = { ...d.hp, [segment]: left }
  if (left <= 0) lose(w, me, segment)
}

export function lose(w: W, me: Row, limb: string) {
  const d = me.data
  const l = LIMBS[limb]
  // A body spawned this step has played no clip yet, so it stands nowhere a segment could be cut from.
  if (d.limp || !l || !d.clip || d.off.includes(limb)) return
  const gone = [limb, ...l.below.filter(b => !d.off.includes(b))]
  const [ax, ay, az] = ends(w, me, limb)
  const [, , , bx, by, bz] = ends(w, me, gone[gone.length - 1])
  d.off = [...d.off, ...gone]
  const at = turn([(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2], d.yaw)
  const len = math.hypot(bx - ax, by - ay, bz - az)
  const along = fromUp([(bx - ax) / len, (by - ay) / len, (bz - az) / len])
  const half = d.yaw / 2
  const push = turn(l.push, d.yaw)
  w.spawn(l.piece, {
    of: me.id,
    limbs: gone,
    pos: [d.pos[0] + at[0], d.pos[1] + at[1], d.pos[2] + at[2]],
    rot: times([0, math.sin(half), 0, math.cos(half)], along),
    vel: [push[0] + d.vel[0], push[1] + d.vel[1], push[2] + d.vel[2]],
    spin: turn(l.spin, d.yaw),
  })
  if (l.crawls) d.rig = 'crawl'
  if (!l.kills || !l.fall) return
  const way = turn([l.fall.dir[0], 0, l.fall.dir[1]], d.yaw)
  d.vel = [0, 0, 0]
  die(w, me, { dir: [way[0], way[2]], speed: l.fall.speed, height: l.fall.height })
}

export const pieces = (w: W, body: Row): Row[] => PIECES.flatMap(kind => w.all(kind)).filter(p => p.data.of === body.id)
