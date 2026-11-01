// Which ground layers the ground round the camera hits, as the near maps ask it: hills cleared flat
// at the spawn, with rock drawn on their steep sides. Round the spawn only grass is drawn; out on the
// hills, rock too.
import { expect, test } from 'vitest'
import { land, type Field } from './terrain3d.sim.ts'
import { present } from './terrain3d.present.ts'

const field: Field = {
  program: {
    world: 600, hscale: 120, sea: 0.5, flood: false, out: 'spawn',
    nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 8, seed: 21 }, { id: 'spawn', op: 'clearing', input: 'hills', flat: 30, floor: 0 }],
  },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }, { name: 'rock', map: 'rock', scale: 30, where: [{ q: 'slope', lo: 0.3, hi: 0.45 }] }] },
  surfaces: {},
  layers: [],
}

test('round the spawn the ground hits only grass; out on the steep hills it hits rock too', () => {
  const l = land(field)
  const names = ['grass', 'rock']
  const [grass, rock] = present(l, { x: 0, z: 0, reach: 8, step: 2, names })
  expect(grass).toBeGreaterThan(0)
  expect(rock).toBe(0)
  // A place whose ground is steep enough for rock.
  const steep = Array.from({ length: 81 * 81 }, (_, k) => [(k % 81) * 5 - 200, Math.floor(k / 81) * 5 - 200]).find(([x, z]) => l.analyse(x, z).slope > 0.5)!
  const there = present(l, { x: steep[0], z: steep[1], reach: 8, step: 2, names })
  expect(there[1]).toBeGreaterThan(0)
  // Each of the grid's 9 × 9 points, 2 m apart across the 16 m square, gives its whole weight to the
  // layers drawn there.
  expect(there[0] + there[1]).toBeCloseTo(81, 9)
})
