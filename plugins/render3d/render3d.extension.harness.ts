// What render3d's stage tests, with the game view and without, hold the camera to: where the orbit's
// pose puts the eye, and two points the same to six places.
import { expect } from 'vitest'
import type { Pose } from '#editor/editor.ts'

// Where the camera law puts the eye for a pose.
export const eye = ({ pivot, yaw, pitch, dist }: Pose) => [
  pivot[0] - dist * Math.sin(yaw) * Math.cos(pitch),
  pivot[1] + dist * Math.sin(pitch),
  pivot[2] - dist * Math.cos(yaw) * Math.cos(pitch),
]
export const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))
