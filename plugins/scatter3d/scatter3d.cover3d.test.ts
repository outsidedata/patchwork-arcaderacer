// scatter3d's mod for cover3d, given to cover3d by one key of a scene: `world.cover3d.mods.solids` is
// 'scatter3d'. The test writes a manager and one child, `wood`, which `load` boots as a game's would:
// hills with firs that stand `tall`, trunks that stand without end and ferns that are no solid, placed
// through `world.scatter3d.mods.ground`. cover3d finds cover behind them, each as tall as its row's
// `tall` times its size or without end. Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { spots } from '#plugins/cover3d/cover3d.sim.ts'
import type { Scatter } from './scatter3d.sim.ts'
import { solids } from './scatter3d.cover3d.ts'

const DT = 1 / 60
const field: Field = {
  program: {
    world: 600, hscale: 30, sea: 0.5, flood: false, out: 'hills',
    nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 8, seed: 4 }],
  },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  bands: [{ colour: '#3e5722', amount: 1, rules: [] }],
  grain: { base: 1, range: 0 },
  detail: [],
  surfaces: {},
  layers: [],
}
const url = '/scatter3d-cover3d-test/wood.json'
written(url, JSON.stringify(field))

const scatter: Scatter & { mods: Record<string, string> } = {
  cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, mods: { ground: 'terrain3d' },
  packs: {
    trees: {
      asset: 'firs', rows: { fir: { weight: 2, solid: 0.35, tall: 6 }, trunk: { weight: 1, solid: 0.3 }, fern: { weight: 1 } },
      cell: 8, reach: 60, seed: 33, lods: [20, 40], shadow: 30, leaf: 0.5, density: 0.4, rules: [], clearing: 0, size: [0.8, 0.6], vary: 0.2,
    },
  },
}
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { wood: { file: 'wood.scene.json', suspend: false } }, dt: DT, entry: 'wood', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const wood = {
  world: {
    loader: { assets: { land: { type: 'json', url, preload: true } } },
    terrain3d: { field: 'land' },
    scatter3d: scatter,
    cover3d: { mods: { solids: 'scatter3d' } },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'scatter3d-cover3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'wood.scene.json'), JSON.stringify(wood))
writeFileSync(join(dir, 'wood.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './wood.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { before(_me, _dt, w) { globalThis.scatter3dCover3d = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('wood')!
  child.step(DT)
  return { child, w: (globalThis as { scatter3dCover3d?: W }).scatter3dCover3d! }
}

test('the scene\'s one key gives cover3d scatter3d\'s solids, loaded before the first step', async () => {
  const { child } = await booted()
  expect(mod(child.world, 'cover3d', 'solids')).toBe(solids)
})

test('cover3d finds cover behind them: each spot against the far side of one of them, straight on from the threat', async () => {
  const { w } = await booted()
  const threat = [40, -25]
  const got = spots(w, [0, 0], threat, { reach: 20, radius: 0.35, low: 1.5 })
  expect(got.length).toBeGreaterThan(3)
  for (const s of got) {
    expect(s.tall).toBeGreaterThanOrEqual(1.5)
    const behind = solids(w, s.at[0], s.at[1], 20).find(o => Math.abs(Math.hypot(s.at[0] - o.x, s.at[1] - o.z) - (o.radius + 0.35)) < 1e-9)!
    expect(behind.tall ?? Infinity).toBe(s.tall)
    const toCentre = Math.hypot(behind.x - threat[0], behind.z - threat[1])
    expect(Math.hypot(s.at[0] - threat[0], s.at[1] - threat[1])).toBeCloseTo(toCentre + behind.radius + 0.35, 9)
  }
})
