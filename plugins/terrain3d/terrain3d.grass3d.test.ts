// terrain3d's mod for grass3d: the land as a page has it, its lattice the finest ring's, its version moving
// with every stroke, and in a worker the same ground made from what `land` handed.
import { expect, test } from 'vitest'
import type { Plugins } from '#engine/browser.ts'
import { land as make, type Field, type Stroke } from './terrain3d.sim.ts'
import { land, worker } from './terrain3d.grass3d.ts'

const field: Field = {
  program: { world: 600, hscale: 6, sea: -1, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 12, seed: 3 }] },
  analysis: { slopeStep: 1, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: { road: { cover: 0 } },
  layers: [{ at: [0, 0], size: 64, px: 64, strokes: [] }],
}

test('the page\'s land: the finest ring\'s lattice, a version that moves with a stroke, and the same ground in a worker', () => {
  const l = make(field)
  let version = 0
  const ground = {
    height: (x: number, z: number) => l.height(x, z), cover: (x: number, z: number) => l.paint(x, z).cover,
    ramp: l.ramp, rules: l.rules,
    edits: () => ({ land: l, layers: [{ version }] }),
    shown: () => true, prepared: () => undefined,
  }
  const plugins = { terrain3d: { ground }, wire: { scene: { world: { terrain3d: { rings: [{ reach: 64, seg: 256 }, { reach: 320, seg: 128 }] } } } } } as unknown as Plugins
  const a = land(plugins)!
  expect(a.cell).toBe(0.5)
  expect(a.shown).toBe(true)
  version++
  expect(land(plugins)!.version).not.toBe(a.version)
  // A stroke not yet saved is handed to the worker, whose ground is the page's.
  const road: Stroke = { verb: 'surface', radius: 3, hardness: 1, strength: 0, level: 0, surface: 'road', path: [[-20, 2], [20, 2]] }
  l.stroke(0, road)
  const held = land(plugins)!.worker!.held as Parameters<typeof worker>[0]
  const there = worker(held)
  for (const [x, z] of [[0, 2], [10, -7], [-31, 30]]) {
    expect(there.height(x, z)).toBe(l.height(x, z))
    expect(there.cover(x, z)).toBe(l.paint(x, z).cover)
  }
  expect(there.cover(0, 2)).toBe(0)
  expect(land({ terrain3d: {} } as unknown as Plugins)).toBeUndefined()
})
