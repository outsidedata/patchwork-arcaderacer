// shapes3d's spaces for motion3d (`shapes3d.motion3d.ts`): a space row turned by its `yaw`, and one
// turned by `rot`, the whole of its turn, whose box and plane tilt with it.
import { expect, test } from 'vitest'
import type { Row, W } from '#engine/engine.ts'
import { spaces } from './shapes3d.motion3d.ts'

// A climbing wall's space: a box 3 wide, 5 tall and 1 deep, its plane on its far side, standing up.
const kinds = {
  wall: {
    shape: { box: { size: [3, 5, 1] } },
    points: { Face: { plane: { at: [0, 2.5, 0.5], size: [3, 5], turn: [0, -90, 0], normal: [0, 0, -1] } } },
    activities: ['climb'],
  },
}
const reader = (rows: Row[]): W => ({ world: { shapes3d: { kinds } }, all: (kind: string) => rows.filter(r => r.kind === kind) }) as never
const row = (data: Record<string, unknown>): Row => ({ id: 1, kind: 'wall', data }) as never
const plane = (data: Record<string, unknown>, at = [0, 0, 0]) => {
  const [s] = spaces(reader([row(data)]), at)
  return { ...(s.points!.Face as any).plane, holds: s.holds, far: s.far }
}
const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9))
// A turn of `angle` radians about the x axis, and about up, as quaternions.
const aboutX = (angle: number) => [Math.sin(angle / 2), 0, 0, Math.cos(angle / 2)]
const aboutUp = (angle: number) => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)]

test('a space turned by its yaw: its plane stands up across it, facing back out of it', () => {
  const p = plane({ pos: [10, 0, 20], yaw: 0 })
  near(p.at, [10, 2.5, 20.5])
  near(p.u, [1, 0, 0])
  near(p.v, [0, 1, 0])
  near(p.normal, [0, 0, -1])
  expect(p.yaw).toBe(0)
})

test('a space turned by a rot about up is the same space turned by that yaw', () => {
  const byYaw = plane({ pos: [10, 0, 20], yaw: 0.7 }), byRot = plane({ pos: [10, 0, 20], rot: aboutUp(0.7) })
  near(byRot.at, byYaw.at)
  near(byRot.u, byYaw.u)
  near(byRot.v, byYaw.v)
  near(byRot.normal, byYaw.normal)
  expect(byRot.yaw).toBeCloseTo(byYaw.yaw, 9)
})

test('a space leant by its rot: its plane, its axes and its normal lean with it', () => {
  // Leant 30° about x: its up goes toward +z.
  const lean = Math.PI / 6, s = Math.sin(lean), c = Math.cos(lean)
  const p = plane({ pos: [10, 0, 20], rot: aboutX(lean) })
  near(p.at, [10, 2.5 * c - 0.5 * s, 20 + 2.5 * s + 0.5 * c])
  near(p.u, [1, 0, 0])
  near(p.v, [0, c, s])
  near(p.normal, [0, s, -c])
  // A body on it still faces into it across the ground.
  expect(p.yaw).toBeCloseTo(0, 9)
})

test('a leant space holds a point that is inside its leant box, and not one inside the box were it upright', () => {
  const rot = aboutX(Math.PI / 6)
  // Four metres up the leant box's middle line.
  const up = [10, 4 * Math.cos(Math.PI / 6), 20 + 4 * Math.sin(Math.PI / 6)]
  expect(plane({ pos: [10, 0, 20], rot }, up).holds).toBe(true)
  expect(plane({ pos: [10, 0, 20], yaw: 0 }, up).holds).toBe(false)
  // Straight over its foot at that height: inside it upright, outside it leant.
  expect(plane({ pos: [10, 0, 20], yaw: 0 }, [10, 4, 20]).holds).toBe(true)
  expect(plane({ pos: [10, 0, 20], rot }, [10, 4, 20]).holds).toBe(false)
  // How far over the ground the point is from the leant box's middle.
  const mid = [10, 20 + 2.5 * Math.sin(Math.PI / 6)]
  expect(plane({ pos: [10, 0, 20], rot }, [13, 1, 24]).far).toBeCloseTo(Math.hypot(13 - mid[0], 24 - mid[1]), 9)
})
