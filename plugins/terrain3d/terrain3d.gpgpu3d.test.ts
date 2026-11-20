// terrain3d's mod for gpgpu3d: the window of the land a page hands gpgpu3d, its heights the land's on the
// finest ring's lattice, held round the camera as it flies and filled again when the land is stroked.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { land as make, type Field } from './terrain3d.sim.ts'
import { things, type Window } from './terrain3d.gpgpu3d.ts'

const field: Field = {
  program: { world: 600, hscale: 6, sea: -1, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 12, seed: 3 }] },
  analysis: { slopeStep: 1, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [{ at: [0, 0], size: 64, px: 64, strokes: [] }],
}

test('the land is held reach metres round the camera wherever it flies, each height the land\'s, and filled again when the land is stroked', () => {
  const l = make(field)
  let version = 0
  // a page with no workers: its `task` hands back nothing, and the window is filled on the page
  const ground = { height: (x: number, z: number) => l.height(x, z), edits: () => ({ land: l, layers: [{ version }] }), task: () => undefined }
  const plugins = { terrain3d: { ground }, wire: { scene: { world: { terrain3d: { rings: [{ reach: 64, seg: 256 }, { reach: 320, seg: 128 }] } } } } } as unknown as Plugins
  const reach = 8
  const windowAt = (x: number, z: number) => (things(plugins, { at: [x, 0, z], reach })[0].land as Window)
  // the land's own height at every point of the window, and the window reaching `reach` round the camera
  const holds = (w: Window, x: number, z: number) => {
    expect(w.cell).toBe(0.5)
    const far = w.at.map(a => a + (w.n - 1) * w.cell)
    expect([w.at[0] <= x - reach, w.at[1] <= z - reach, far[0] >= x + reach, far[1] >= z + reach]).toEqual([true, true, true, true])
    for (const [i, j] of [[0, 0], [w.n - 1, 0], [3, w.n - 1], [w.n >> 1, w.n >> 1]])
      expect(w.heights[j * w.n + i]).toBe(Math.fround(l.height(w.at[0] + i * w.cell, w.at[1] + j * w.cell)))
  }
  const first = windowAt(1, -2)
  holds(first, 1, -2)
  // a step on, the same window; flown on, another round the camera
  expect(windowAt(1.5, -2)).toBe(first)
  for (const [x, z] of [[9, -2], [30, 41], [-17.25, 3]]) holds(windowAt(x, z), x, z)
  // a stroke moves the land's version, and the window is filled again
  const before = windowAt(-17.25, 3)
  version++
  expect(windowAt(-17.25, 3)).not.toBe(before)
})
