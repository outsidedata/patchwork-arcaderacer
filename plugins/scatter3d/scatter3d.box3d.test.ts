// scatter3d's mod for box3d, given to box3d by one key of a scene: `world.box3d.mods.props` is
// ['scatter3d'], with terrain3d's `ground` beside it. The test writes a manager and one child, `wood`,
// which `load` boots as a game's would: level ground with firs and boulders on it, placed through
// `world.scatter3d.mods.ground`, and the `box3d` row listing the four 64 m chunks round the origin, so
// box3d asks both mods for them on its first step. Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { castRayClosest } from '#plugins/box3d/box3d.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { placed, solids, type Scatter, type Solid } from './scatter3d.sim.ts'
import { props } from './scatter3d.box3d.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 10, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0.5 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  bands: [{ colour: '#3e5722', amount: 1, rules: [] }],
  grain: { base: 1, range: 0 },
  detail: [],
  surfaces: {},
  layers: [],
}
const url = '/scatter3d-box3d-test/wood.json'
written(url, JSON.stringify(field))

// Firs 6·size tall round 0.4·size, boulders 0.5·size tall round 1·size, so a boulder is a ball's dome.
const scatter: Scatter & { mods: Record<string, string> } = {
  cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, mods: { ground: 'terrain3d' },
  packs: {
    trees: {
      asset: 'firs', rows: { fir: { weight: 3, solid: 0.4, tall: 6 }, boulder: { weight: 1, solid: 1, tall: 0.5 }, fern: { weight: 1 } },
      cell: 8, reach: 60, seed: 33, lods: [20, 40], shadow: 30, leaf: 0.5, density: 0.3, rules: [], clearing: 0, size: [0.8, 0.6], vary: 0.2,
    },
  },
}
const SPAN = 64
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
    box3d: { gravity: [0, -10, 0], subStepCount: 4, static: [], kinds: {}, mods: { ground: 'terrain3d', props: ['scatter3d'] }, chunk: { count: 33, cell: 2 } },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, box3d: { ground: [[-1, -1], [-1, 0], [0, -1], [0, 0]] }, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'box3d' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'scatter3d-box3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'wood.scene.json'), JSON.stringify(wood))
writeFileSync(join(dir, 'wood.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { box3d } from ${path('../box3d/box3d.sim.ts')}
import file from './wood.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, box3d, probe: { after(_me, _dt, w) { globalThis.scatter3dBox3d = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted(): Promise<{ child: Truth; w: W }> {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('wood')!
  child.step(DT)
  return { child, w: (globalThis as { scatter3dBox3d?: W }).scatter3dBox3d! }
}
// Every solid whose middle is in the four chunks round the origin.
const all = (w: W) => solids(w, 0, 0, SPAN * 2, placed(w)).filter(s => Math.abs(s.x) < SPAN && Math.abs(s.z) < SPAN && s.x >= -SPAN && s.z >= -SPAN)
// A solid with nothing else within `gap` metres of it.
const alone = (list: Solid[], gap: number) => list.find(s => list.every(o => o === s || Math.hypot(o.x - s.x, o.z - s.z) > o.radius + s.radius + gap))!

test('the scene\'s props list gives box3d scatter3d\'s props, loaded before the first step', async () => {
  const { child } = await booted()
  expect(modsOf(child.world, 'box3d', 'props')).toEqual([props])
})

test('chunk [i, j]\'s props are every solid whose middle is in its square, each standing on the ground to its tall: a fir a capsule, a boulder a sunk ball', async () => {
  const { w } = await booted()
  const every = all(w), H = placed(w).height(0, 0)
  expect(every.length).toBeGreaterThan(20)
  let shapes = 0
  for (const [i, j] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
    const x0 = i * SPAN, z0 = j * SPAN
    const mine = every.filter(s => s.x >= x0 && s.x < x0 + SPAN && s.z >= z0 && s.z < z0 + SPAN)
    const got = props(w, [i, j])!
    expect(got.pos).toEqual([x0, 0, z0])
    expect(got.shapes).toHaveLength(mine.length)
    mine.forEach((s, k) => {
      const shape = got.shapes[k] as { capsule?: { center1: number[]; center2: number[]; radius: number }; sphere?: { center: number[]; radius: number } }
      // The top of the rounded end `tall` up: its middle a radius under that.
      const tip = H + s.tall! - s.radius
      if (tip > H) {
        expect(shape.capsule).toEqual({ center1: [s.x - x0, H, s.z - z0], center2: [s.x - x0, tip, s.z - z0], radius: s.radius })
      } else {
        expect(shape.sphere).toEqual({ center: [s.x - x0, tip, s.z - z0], radius: s.radius })
      }
    })
    shapes += got.shapes.length
  }
  // The four chunks share out the solids, none twice and none left out.
  expect(shapes).toBe(every.length)
  // A chunk far out on ground with no solid in it has no props.
  const empty = { ...w, world: { ...w.world, scatter3d: { ...scatter, packs: { trees: { ...scatter.packs.trees, density: 0 } } } } } as W
  expect(props(empty, [0, 0])).toBeUndefined()
})

test('a ray along the ground stops at a fir\'s trunk, and stops no more once its chunk is dropped from the box3d row', async () => {
  const { child, w } = await booted()
  const fir = alone(all(w).filter(s => s.tall! > s.radius && Math.abs(s.x) < SPAN - 12 && Math.abs(s.z) < SPAN - 12), 8)
  expect(fir).toBeDefined()
  const from: [number, number, number] = [fir.x - 6, placed(w).height(fir.x, fir.z) + 1, fir.z], hit = castRayClosest(w, from, [12, 0, 0])!
  expect(hit).toBeDefined()
  expect(hit.id).toBe(0)
  expect(hit.point[0]).toBeCloseTo(fir.x - fir.radius, 3)
  // Its chunk let go, the trunk is gone with the ground under it.
  child.rows.find(r => r.kind === 'box3d')!.data.ground = [[5, 5]]
  child.step(DT)
  expect(castRayClosest(w, from, [12, 0, 0])).toBeUndefined()
})

test('a solid row with no tall throws, naming where it stands, since a prop cannot stand without end', async () => {
  const { w } = await booted()
  const endless = { ...w, world: { ...w.world, scatter3d: { ...scatter, packs: { trees: { ...scatter.packs.trees, rows: { fir: { weight: 1, solid: 0.4 } } } } } } } as W
  expect(() => props(endless, [0, 0])).toThrow(/^scatter3d's solid at \[[-\d.]+, [-\d.]+\] has no tall, and box3d stands each prop as tall as its row's tall: give every solid row of world\.scatter3d\.packs a tall$/)
})
