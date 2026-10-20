// scatter3d's mod for hitscan3d, given to hitscan3d by one key of a scene: `world.hitscan3d.mods.solids`
// is 'scatter3d'. The test writes a manager and one child, `wood`, which `load` boots as a game's
// would: hills, a pack of trunks that stand without end on 5 m cells and a pack of rocks that stand
// `tall` on 12 m cells, placed through `world.scatter3d.mods.ground`. Lines are checked against every
// solid scatter3d's `solids` finds round them, each kept when its circle meets the line's path over
// the ground, so the lengths the mod asks the line in are seen to miss none and to add none; then,
// through hitscan3d's `shoot`, a rock's side and top, a line over it, and a trunk far up. Its `probe`
// hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { heightAt, type Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { shoot } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import { placed, solids as over, type Scatter, type Solid } from './scatter3d.sim.ts'
import { solids } from './scatter3d.hitscan3d.ts'

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
const url = '/scatter3d-hitscan3d-test/wood.json'
written(url, JSON.stringify(field))

const scatter: Scatter & { mods: Record<string, string> } = {
  cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, mods: { ground: 'terrain3d' },
  packs: {
    trunks: {
      asset: 'firs', rows: { fir: { weight: 3, solid: 0.3 }, fern: { weight: 1 } },
      cell: 5, reach: 60, seed: 91, lods: [20, 40], shadow: 30, leaf: 0.5, density: 0.3, rules: [], clearing: 10, size: [0.8, 0.6], vary: 0.2,
    },
    rocks: {
      shape: { detail: 1, lumpy: [0.7, 0.3], squash: 0.7 }, colour: '#6a655e',
      rows: { rock: { weight: 1, solid: 0.8, tall: 0.75 } },
      cell: 12, reach: 100, seed: 7, lods: [40], shadow: 50, leaf: 0.5, density: 0.5, rules: [], clearing: 10, size: [1, 0.6], vary: 0.1,
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
    hitscan3d: { mods: { solids: 'scatter3d' }, kinds: {}, rewind: 1 },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'scatter3d-hitscan3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'wood.scene.json'), JSON.stringify(wood))
writeFileSync(join(dir, 'wood.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './wood.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { before(_me, _dt, w) { globalThis.scatter3dHitscan3d = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('wood')!
  child.step(DT)
  return { child, w: (globalThis as { scatter3dHitscan3d?: W }).scatter3dHitscan3d! }
}
const unit = (v: number[]) => v.map(c => c / Math.hypot(v[0], v[1], v[2]))
// Every solid round a line whose circle its path over the ground, from `from` for `far` metres along
// unit `dir`, comes within, stood on the ground under its centre, in the order `key` sorts them.
const key = (s: { x: number; z: number }) => `${s.x} ${s.z}`
function along(w: W, from: number[], dir: number[], far: number) {
  const mid = [from[0] + dir[0] * far / 2, from[2] + dir[2] * far / 2]
  const to = [from[0] + dir[0] * far, from[2] + dir[2] * far]
  const off = (x: number, z: number) => {
    const dx = to[0] - from[0], dz = to[1] - from[2], ll = dx * dx + dz * dz
    const s = ll > 0 ? Math.min(1, Math.max(0, ((x - from[0]) * dx + (z - from[2]) * dz) / ll)) : 0
    return Math.hypot(x - from[0] - dx * s, z - from[2] - dz * s)
  }
  return over(w, mid[0], mid[1], far / 2 + 1, placed(w))
    .filter(s => off(s.x, s.z) <= s.radius)
    .map(s => ({ ...s, base: heightAt(w, s.x, s.z) }))
    .sort((a, b) => key(a).localeCompare(key(b)))
}
// A rock and a trunk with no other solid within 4 m of their circles.
function alone(w: W) {
  const all = over(w, 0, 0, 150, placed(w))
  const lone = (s: Solid) => all.every(o => o === s || Math.hypot(o.x - s.x, o.z - s.z) > o.radius + s.radius + 4)
  return { rock: all.find(s => s.tall !== undefined && lone(s))!, trunk: all.find(s => s.tall === undefined && lone(s))! }
}

test('the scene\'s one key gives hitscan3d scatter3d\'s solids, loaded before the first step', async () => {
  const { child } = await booted()
  expect(mod(child.world, 'hitscan3d', 'solids')).toBe(solids)
})

test('a line is handed every solid its path over the ground crosses within far, however long it is, on the ground under its centre, and no other', async () => {
  const { w } = await booted()
  let crossed = 0, clear = 0, rocks = 0
  for (let k = 0; k < 60; k++) {
    const a = k * 2.399963, x = 80 * Math.cos(a * 1.7), z = 80 * Math.sin(a * 1.3)
    const from = [x, heightAt(w, x, z) + 0.2 + (k % 5) * 0.3, z]
    const dir = unit([Math.cos(a), (k % 3 - 1) * 0.02, Math.sin(a)])
    for (const far of [3, 17, 60, 150]) {
      const got = solids(w, from, dir, far).sort((a, b) => key(a).localeCompare(key(b)))
      expect(got, `line ${k} far ${far}`).toEqual(along(w, from, dir, far))
      if (got.length) crossed++
      else clear++
      rocks += got.filter(s => s.tall !== undefined).length
    }
  }
  expect(crossed).toBeGreaterThan(25)
  expect(clear).toBeGreaterThan(20)
  expect(rocks).toBeGreaterThan(5)
})

test('a line straight down is handed the solids whose circle holds the point it falls on', async () => {
  const { w } = await booted()
  const { rock } = alone(w)
  const base = heightAt(w, rock.x, rock.z)
  expect(solids(w, [rock.x + rock.radius * 0.9, base + 10, rock.z], [0, -1, 0], 20).map(key)).toEqual([key(rock)])
  expect(solids(w, [rock.x + rock.radius + 0.1, base + 10, rock.z], [0, -1, 0], 20)).toEqual([])
})

test('hitscan3d meets a rock at its side, out of its side, and at its top, up out of it, tall·size over the ground under its centre; a line over it passes', async () => {
  const { w } = await booted()
  const { rock } = alone(w)
  const base = heightAt(w, rock.x, rock.z)
  const side = shoot(w, [rock.x - rock.radius - 1, base + 0.2, rock.z], [1, 0, 0], 4, { bodies: false })!
  expect(side.what).toBe('solid')
  expect(side.t).toBeCloseTo(1, 9)
  side.normal.forEach((n, i) => expect(n).toBeCloseTo([-1, 0, 0][i], 9))
  const top = shoot(w, [rock.x, base + 10, rock.z], [0, -1, 0], 20, { bodies: false })!
  expect(top.what).toBe('solid')
  expect(top.t).toBeCloseTo(10 - rock.tall!, 9)
  expect(top.normal).toEqual([0, 1, 0])
  expect(shoot(w, [rock.x - rock.radius - 1, base + rock.tall! + 0.05, rock.z], [1, 0, 0], 2 * rock.radius + 2, { bodies: false })).toBeUndefined()
})

test('hitscan3d meets a solid of a row with no tall far over the ground: it stands without end', async () => {
  const { w } = await booted()
  const { trunk } = alone(w)
  const hit = shoot(w, [trunk.x, 500, trunk.z - trunk.radius - 2], [0, 0, 1], 5, { bodies: false })!
  expect(hit.what).toBe('solid')
  expect(hit.t).toBeCloseTo(2, 9)
  hit.normal.forEach((n, i) => expect(n).toBeCloseTo([0, 0, -1][i], 9))
  expect(shoot(w, [trunk.x, 500, trunk.z - trunk.radius - 2], [0, 0, 1], 1.9, { bodies: false })).toBeUndefined()
})
