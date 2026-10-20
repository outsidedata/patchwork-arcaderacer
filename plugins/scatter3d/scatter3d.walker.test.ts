// scatter3d's mod for walker, given to walker by one key of a scene: `world.walker.mods.solids` is
// 'scatter3d', with terrain3d's `height` beside it. The test writes a manager and one child, `wood`,
// which `load` boots as a game's would: level ground with trunks on it, placed through
// `world.scatter3d.mods.ground`. A body walked on walker's `groundOf` straight at a trunk walks round
// it, never inside its circle. Its `probe` hands the test the child's `w`.
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
import type { Numbers } from '#plugins/walker/walker.sim.ts'
import { placed, solids as over, type Scatter, type Solid } from './scatter3d.sim.ts'
import { solids } from './scatter3d.walker.ts'

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
const url = '/scatter3d-walker-test/wood.json'
written(url, JSON.stringify(field))

const scatter: Scatter & { mods: Record<string, string> } = {
  cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, mods: { ground: 'terrain3d' },
  packs: {
    trees: {
      asset: 'firs', rows: { fir: { weight: 3, solid: 0.4, tall: 6 }, fern: { weight: 1 } },
      cell: 8, reach: 60, seed: 33, lods: [20, 40], shadow: 30, leaf: 0.5, density: 0.3, rules: [], clearing: 10, size: [0.8, 0.6], vary: 0.2,
    },
  },
}
const K: Numbers = {
  radius: 0.35, height: 1.7, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9,
  step: 0.6, maxSlope: 0.7, slopeBand: 0.05, slide: 2, wade: 0.5, span: 0.5, probe: 1.5, seekSpeed: 1.5,
}
const BODY = { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], grounded: true, speed: 0, want: [0, 0], face: null, jump: false, side: 0, turned: 0, sliding: false }

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
    walker: { kinds: { body: K }, mods: { height: 'terrain3d', solids: 'scatter3d' } },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, body: BODY, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'scatter3d-walker-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'wood.scene.json'), JSON.stringify(wood))
writeFileSync(join(dir, 'wood.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { groundOf, walk } from ${path('../walker/walker.sim.ts')}
import file from './wood.scene.json' with { type: 'json' }
export const sim = {
  scenemanager, loader,
  body: { tick(me, dt, w) { walk(me, w, dt, groundOf(w)) } },
  probe: { before(_me, _dt, w) { globalThis.scatter3dWalker = w } },
}
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('wood')!
  child.step(DT)
  return { child, w: (globalThis as { scatter3dWalker?: W }).scatter3dWalker! }
}

test('the scene\'s one key gives walker scatter3d\'s solids, loaded before the first step', async () => {
  const { child } = await booted()
  expect(mod(child.world, 'walker', 'solids')).toBe(solids)
})

test('a body walked on groundOf straight at a trunk walks round it, never inside its circle', async () => {
  const { child, w } = await booted()
  const all = over(w, 0, 0, 120, placed(w))
  // A trunk with nothing else within 5 m of it along the body's way.
  const trunk = all.find(s => all.every((o: Solid) => o === s || Math.hypot(o.x - s.x, o.z - s.z) > o.radius + s.radius + 5))!
  expect(trunk).toBeDefined()
  const body = w.spawn('body', { pos: [trunk.x - 4, 0, trunk.z + 0.05], want: [2, 0] })
  let nearest = Infinity
  for (let i = 0; i < 300; i++) {
    child.step(DT)
    nearest = Math.min(nearest, Math.hypot(body.data.pos[0] - trunk.x, body.data.pos[2] - trunk.z))
  }
  expect(nearest).toBeGreaterThanOrEqual(trunk.radius + K.radius - 1e-9)
  expect(nearest).toBeLessThan(trunk.radius + K.radius + 0.1)
  // Round it, and on past it.
  expect(body.data.pos[0]).toBeGreaterThan(trunk.x + 3)
})
