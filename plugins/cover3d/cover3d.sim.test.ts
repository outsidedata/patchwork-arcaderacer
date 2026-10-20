// cover3d on a wood the test writes: a manager and one child, `wood`, which `load` boots as a game's
// would, so the mod `world.cover3d.mods.solids` names is loaded before the first step: scatter3d's
// rocks, which stand `tall`, and trunks, which stand without end, on terrain3d's level ground. `spots`
// behind every solid within reach from a threat, nearest first, the short ones left out by `low`, each
// with the solid across every line from the threat to it under the solid's height. A scene that names
// no solids throws. Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { placed, solids as over, type Scatter } from '#plugins/scatter3d/scatter3d.sim.ts'
import { cylinder } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import { spots, type Solid } from './cover3d.sim.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 10, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  bands: [{ colour: '#3e5722', amount: 1, rules: [] }],
  grain: { base: 1, range: 0 },
  detail: [],
  surfaces: {},
  layers: [],
}
const url = '/cover3d-test/wood.json'
written(url, JSON.stringify(field))

const scatter: Scatter & { mods: Record<string, string> } = {
  cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, mods: { ground: 'terrain3d' },
  packs: {
    trunks: {
      asset: 'firs', rows: { fir: { weight: 2, solid: 0.35 }, fern: { weight: 1 } },
      cell: 9, reach: 60, seed: 91, lods: [20, 40], shadow: 30, leaf: 0.5, density: 0.25, rules: [], clearing: 0, size: [0.8, 0.6], vary: 0.2,
    },
    rocks: {
      shape: { detail: 1, lumpy: [0.7, 0.3], squash: 0.7 }, colour: '#6a655e',
      rows: { rock: { weight: 1, solid: 0.8, tall: 0.75 } },
      cell: 14, reach: 100, seed: 7, lods: [40], shadow: 50, leaf: 0.5, density: 0.4, rules: [], clearing: 0, size: [1, 0.6], vary: 0.1,
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

const dir = mkdtempSync(join(tmpdir(), 'cover3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'wood.scene.json'), JSON.stringify(wood))
writeFileSync(join(dir, 'wood.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './wood.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { before(_me, _dt, w) { globalThis.cover3dWood = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('wood')!
  child.step(DT)
  return { child, w: (globalThis as { cover3dWood?: W }).cover3dWood! }
}
const around = (w: W, x: number, z: number, r: number): Solid[] => over(w, x, z, r, placed(w))
// A rock with no other solid within 12 m of its circle.
function alone(w: W) {
  const all = around(w, 0, 0, 200)
  const lone = (s: Solid) => all.every(o => o === s || Math.hypot(o.x - s.x, o.z - s.z) > o.radius + s.radius + 12)
  return all.find(s => s.tall !== undefined && lone(s))!
}
const BODY = 0.35

// ---------------------------------------------------------------- spots

test('a spot stands against the far side of each solid within reach, on the line from the threat through its centre, nearest first', async () => {
  const { w } = await booted()
  const cases = [{ at: [10, -5], threat: [40, 30], reach: 25 }, { at: [-60, 20], threat: [-60, -30], reach: 18 }, { at: [0, 0], threat: [-3, 1], reach: 30 }]
  let seen = 0
  for (const { at, threat, reach } of cases) {
    const got = spots(w, at, threat, { reach, radius: BODY, low: 0 })
    const within = around(w, at[0], at[1], reach).filter(s => Math.hypot(s.x - at[0], s.z - at[1]) <= reach)
    expect(got).toHaveLength(within.length)
    expect(got.length).toBeGreaterThan(2)
    for (let i = 1; i < got.length; i++) expect(got[i].far).toBeGreaterThanOrEqual(got[i - 1].far)
    for (const spot of got) {
      expect(spot.far).toBe(Math.hypot(spot.at[0] - at[0], spot.at[1] - at[1]))
      // Its solid: the one it stands its radius and the body's from, straight on from the threat.
      const s = within.find(s => Math.abs(Math.hypot(spot.at[0] - s.x, spot.at[1] - s.z) - (s.radius + BODY)) < 1e-9)!
      expect(s).toBeDefined()
      const toCentre = Math.hypot(s.x - threat[0], s.z - threat[1])
      expect(Math.hypot(spot.at[0] - threat[0], spot.at[1] - threat[1])).toBeCloseTo(toCentre + s.radius + BODY, 9)
      expect(spot.tall).toBe(s.tall ?? Infinity)
      // A line from the threat to the body at any height under the solid's meets the solid first.
      for (const y of [0.05, Math.min(spot.tall, 50) * 0.9]) {
        const d = [spot.at[0] - threat[0], 0, spot.at[1] - threat[1]], l = Math.hypot(d[0], d[2])
        const hit = cylinder([threat[0], y, threat[1]], [d[0] / l, 0, d[2] / l], l, [s.x, 0, s.z], s.radius, 0, s.tall ?? Infinity)
        expect(hit!.t).toBeLessThan(l - BODY)
      }
      seen++
    }
  }
  expect(seen).toBeGreaterThan(10)
})

test('low leaves out the solids shorter than it; a solid with no tall stands without end and is never left out', async () => {
  const { w } = await booted()
  const at = [15, 25], threat = [-20, -30], reach = 40
  const all = spots(w, at, threat, { reach, radius: BODY, low: 0 })
  const rocks = all.filter(s => Number.isFinite(s.tall)), trunks = all.filter(s => s.tall === Infinity)
  expect(rocks.length).toBeGreaterThan(2)
  expect(trunks.length).toBeGreaterThan(2)
  const cut = Math.max(...rocks.map(s => s.tall)) + 0.01
  expect(spots(w, at, threat, { reach, radius: BODY, low: cut })).toEqual(trunks)
  const mid = [...rocks.map(s => s.tall)].sort((a, b) => a - b)[Math.floor(rocks.length / 2)]
  expect(spots(w, at, threat, { reach, radius: BODY, low: mid })).toEqual(all.filter(s => s.tall >= mid))
  expect(spots(w, at, threat, { reach, radius: BODY, low: 1e9 })).toEqual(trunks)
})

test('reach is how far a solid\'s centre may be from where the body is: one whose circle reaches in, centre beyond, has no spot', async () => {
  const { w } = await booted()
  const rock = alone(w)
  const threat = [rock.x - 20, rock.z]
  const d = 6
  const at = [rock.x, rock.z + d]
  expect(spots(w, at, threat, { reach: d, radius: BODY, low: 0 }).map(s => s.at)).toEqual([[rock.x + rock.radius + BODY, rock.z]])
  expect(spots(w, at, threat, { reach: d - rock.radius / 2, radius: BODY, low: 0 })).toEqual([])
  // Where it stands depends on the threat, not the body.
  expect(spots(w, [rock.x - 1, rock.z + 3], [rock.x, rock.z + 20], { reach: d, radius: 0.5, low: 0 })[0].at[1]).toBeCloseTo(rock.z - rock.radius - 0.5, 9)
})

test('spots throws in a scene that names no world.cover3d.mods.solids', () => {
  let bare!: W
  boot({ world: { cover3d: {} }, prefabs: { probe: {} }, actors: [{ is: 'probe' }] }, { probe: { before(_me, _dt, got) { bare = got } } }).step(DT)
  const message = 'cover3d is asked for cover, and the scene names no world.cover3d.mods.solids'
  expect(() => spots(bare, [0, 0], [5, 5], { reach: 10, radius: BODY, low: 0 })).toThrow(message)
})
