// terrain3d's mod for scatter3d's server half, named by the scene's `world.scatter3d.mods.ground`. The
// test writes a manager and one child, `wood`, which `load` boots as a game's would: hills with a road
// painted across them, rock drawn on their steep sides, and a pack of firs kept below a treeline and
// off the rock. The firs scatter3d places on the server stand on the land, none on the road, over
// the treeline or on the rock, and a road the brush strokes later takes the firs there away. Its
// `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { place, placed, solids, type Pack, type Scatter } from '#plugins/scatter3d/scatter3d.sim.ts'
import { analyse, edits, heightAt, paintAt, type Field, type Rule, type Stroke } from './terrain3d.sim.ts'

const DT = 1 / 60
const road: Stroke = { verb: 'surface', radius: 12, hardness: 1, strength: 0, level: 0, surface: 'road', path: [[-80, -40], [80, -40]] }
const field: Field = {
  program: { world: 600, hscale: 60, sea: 0.5, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 4, seed: 21 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }, { name: 'rock', map: 'rock', scale: 30, where: [{ q: 'slope', lo: 0.15, hi: 0.25 }] }] },
  surfaces: { road: { colour: '#6d6459', cover: 0 } },
  layers: [{ at: [0, -40], size: 200, px: 100, strokes: [road] }, { at: [60, 60], size: 40, px: 40, strokes: [] }],
}
const url = '/terrain3d-scatter3d-test/wood.json'
written(url, JSON.stringify(field))

const TREELINE: Rule = { q: 'height', lo: 36, hi: 30 }
const OFF_ROCK: Rule = { q: 'layer:rock', lo: 0.5, hi: 0.2 }
const firs: Pack = {
  asset: 'firs', rows: { fir: { weight: 1, solid: 0.3, tall: 6 } },
  cell: 5, reach: 60, seed: 91, lods: [20, 40], shadow: 30, leaf: 0.5, density: 1, rules: [TREELINE, OFF_ROCK],
  clearing: 0, size: [0.8, 0.6], vary: 0.2,
}
const scatter: Scatter = { cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, packs: { firs }, mods: { ground: 'terrain3d' } }

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { wood: { file: 'wood.scene.json', suspend: false } }, dt: DT, entry: 'wood', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const wood = {
  world: { loader: { assets: { land: { type: 'json', url, preload: true } } }, terrain3d: { field: 'land' }, scatter3d: scatter },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'terrain3d-scatter3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'wood.scene.json'), JSON.stringify(wood))
writeFileSync(join(dir, 'wood.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './wood.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { before(_me, _dt, w) { globalThis.terrain3dScatter3d = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('wood')!
  child.step(DT)
  return (globalThis as { terrain3dScatter3d?: W }).terrain3dScatter3d!
}

test('firs placed on the land stand on it, and none on the road, over the treeline or on the rock', async () => {
  const w = await booted()
  const ground = placed(w)
  let kept = 0, road = 0, high = 0, rock = 0
  for (let j = -20; j <= 20; j++) for (let i = -20; i <= 20; i++) {
    // Each cell's middle, where the rules are asked whether a fir would stand.
    const [x, z] = [i * 5, j * 5]
    if (paintAt(w, x, z).surface === 'road') road++
    if (heightAt(w, x, z) > TREELINE.lo) high++
    if (analyse(w, x, z).read('layer:rock') > 0.5) rock++
    const c = place(firs, i, j, ground)
    if (!c) continue
    kept++
    expect(ground.height(c.x, c.z)).toBe(heightAt(w, c.x, c.z))
    expect(paintAt(w, c.x, c.z).cover).toBeGreaterThan(0)
    expect(heightAt(w, c.x, c.z)).toBeLessThan(TREELINE.lo)
    expect(analyse(w, c.x, c.z).read('layer:rock')).toBeLessThan(OFF_ROCK.lo)
  }
  expect(kept).toBeGreaterThan(100)
  // The square holds road, ground over the treeline and rock, so each rule refused somewhere.
  expect(road).toBeGreaterThan(20)
  expect(high).toBeGreaterThan(20)
  expect(rock).toBeGreaterThan(20)
})

test('a road the brush strokes over the land takes the firs there away on the next question, and leaves the rest', async () => {
  const w = await booted()
  const there = () => solids(w, 60, 60, 12, placed(w))
  const far = () => solids(w, -60, 60, 20, placed(w))
  expect(there().length).toBeGreaterThan(0)
  const before = far()
  expect(before.length).toBeGreaterThan(0)
  edits(w).land.stroke(1, { verb: 'surface', radius: 30, hardness: 1, strength: 0, level: 0, surface: 'road', path: [[60, 60]] })
  expect(there()).toEqual([])
  expect(far()).toEqual(before)
})
