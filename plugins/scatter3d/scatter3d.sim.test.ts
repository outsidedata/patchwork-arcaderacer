// The server half of scatter3d on scenes the test writes: a `world.terrain3d` naming a small field the
// test hands the loader, and a `world.scatter3d` carrying the packs. `placed` with no ground named
// throws, and so does a pack rule that reads no key of the land record; the mods that place through it
// are tested beside them (`scatter3d.walker.test.ts`, `scatter3d.hitscan3d.test.ts`,
// `terrain3d.scatter3d.test.ts`).
import { expect, test } from 'vitest'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { loader, written } from '#plugins/loader/loader.sim.ts'
import { edits, heightAt, paintAt, ramp, rules, type Field, type Node } from '#plugins/terrain3d/terrain3d.sim.ts'
import { placed, solids, type Ground, type Pack, type Scatter } from './scatter3d.sim.ts'

const ANALYSIS = { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 }
// Rolling hills some tens of metres high, levelled at spawn.
const HILLS: Node[] = [
  { id: 'hills', op: 'noise', kind: 'simplex', freq: 3, seed: 21 },
  { id: 'spawn', op: 'clearing', input: 'hills', flat: 40, floor: 0.12 },
]
const fieldOf = (more: Partial<Field> = {}): Field => ({
  program: { world: 600, hscale: 80, sea: 0.5, flood: false, out: 'spawn', nodes: HILLS },
  analysis: ANALYSIS,
  bands: [{ colour: '#3e5722', amount: 1, rules: [] }],
  grain: { base: 1, range: 0 },
  detail: [],
  surfaces: { road: { colour: '#6d6459', cover: 0 } },
  layers: [{ at: [0, 0], size: 200, px: 100, strokes: [] }],
  ...more,
})

const PACK: Pack = {
  asset: 'firs', rows: { tall: { weight: 2, solid: 0.3 }, small: { weight: 1 }, gone: { weight: 0, solid: 1 } },
  cell: 6, reach: 60, seed: 91, lods: [20, 40], shadow: 30, leaf: 0.5, density: 0.6, rules: [{ q: 'slope', lo: 0.6, hi: 0.3 }],
  clearing: 10, size: [0.8, 0.6], vary: 0.2,
}
const scatterOf = (packs: Record<string, Pack> = { trees: PACK }, more: Partial<Scatter> = {}): Scatter => ({ cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, packs, ...more })

let files = 0
function truthOf(field: Field = fieldOf(), scatter: Scatter = scatterOf()) {
  const url = `/scatter3d-test/${++files}.json`
  written(url, JSON.stringify(field))
  const scene: Scene = {
    world: { terrain3d: { field: 'place' }, scatter3d: scatter, loader: { assets: { place: { type: 'json', url, preload: true } } } },
    prefabs: { loader: {}, probe: {} },
    actors: [{ is: 'loader' }, { is: 'probe' }],
  }
  let w!: W
  const t = boot(scene, { loader, probe: { before(_me, _dt, got) { w = got } } })
  t.step(1 / 60)
  // The ground a game's actor hands scatter3d: terrain3d's server functions over this truth.
  const ground: Ground = {
    height: (x, z) => heightAt(w, x, z), cover: (x, z) => paintAt(w, x, z).cover, ramp: (rule, x, z) => ramp(w, rule, x, z), rules, edits: () => edits(w),
  }
  return { t, w, url, ground, numbers: w.world.scatter3d as Scatter }
}

test('placed throws when the scene names no world.scatter3d.mods.ground', () => {
  const { w } = truthOf()
  expect(() => placed(w)).toThrow('scatter3d is asked where its instances stand, and the scene names no world.scatter3d.mods.ground')
})

test('a pack rule that reads no key of the land record throws naming it', () => {
  const { w, ground, numbers } = truthOf()
  numbers.packs.trees.rules = [{ q: 'slope', lo: 0.6, hi: 0.3 }, { q: 'steepness', lo: 0, hi: 1 }]
  expect(() => solids(w, 0, 0, 10, ground)).toThrow('scatter3d pack trees rule 1 reads steepness')
})
