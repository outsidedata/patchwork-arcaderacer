// ragdoll3d's mod for box3d (`addons/scenemanager`'s mods), for its physics mode. A scene with
// `world.box3d.mods: { kinds: 'ragdoll3d' }` has box3d make each `bone` row a dynamic capsule of the
// row's own `half` and `radius`, of `PHYSICS.body`'s settings and `PHYSICS.shape`'s density and
// surface (`ragdoll3d.sim.ts`), and each `bonejoint` row the joint its row's `joint` holds.
import type { Row, W } from '#engine/engine.ts'
import type { Body, Joint, Kinds } from '#plugins/box3d/box3d.sim.ts'
import { PHYSICS } from './ragdoll3d.sim.ts'

export const kinds = (_w: W): Kinds => ({
  bodies: {
    bone: (row: Row): Body => ({
      ...PHYSICS.body,
      shapes: [{ capsule: { center1: [0, -row.data.half, 0], center2: [0, row.data.half, 0], radius: row.data.radius }, ...PHYSICS.shape }],
    } as Body),
  },
  joints: {
    bonejoint: (row: Row): Joint => row.data.joint,
  },
})
