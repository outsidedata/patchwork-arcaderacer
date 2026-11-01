// terrain3d's mod for nav3d, named by the scene's `world.nav3d.mods`: `height`, `link` and `behaviors`.
// The test writes a manager and one child, `yard`, which `load` boots as a game's would: ground at 0, the
// sea under it, with one painted layer of a mound flattened to 4 m and a pond flattened to 2 m under the
// waterline. A walk over flat ground is a `ground` link costing its length; one over the mound costs
// more, and is refused where it rises faster than the slope; one into the pond is refused deeper than
// the wade. Rules of the wrong value throw. Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load, mod, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Rules } from '#plugins/nav3d/nav3d.sim.ts'
import { depthAt, rawAt, type Field, type Stroke } from './terrain3d.sim.ts'
import { behaviors, height, link } from './terrain3d.nav3d.ts'

const DT = 1 / 60
const flatten = (level: number, x: number, z: number): Stroke => ({ verb: 'flatten', radius: 3, hardness: 0.5, strength: 0, level, surface: '', path: [[x, z]] })
const field: Field = {
  program: { world: 600, hscale: 1, sea: 0.5, flood: true, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [{ at: [10, 0], size: 40, px: 160, strokes: [flatten(4, 10, -10), flatten(-2, 10, 10)] }],
}
const url = '/terrain3d-nav3d-test/yard.json'
written(url, JSON.stringify(field))

const yard = {
  world: {
    loader: { assets: { land: { type: 'json', url, preload: true } } },
    terrain3d: { field: 'land' },
    nav3d: { graphs: {}, mods: { height: 'terrain3d', link: 'terrain3d', behaviors: ['terrain3d'] } },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'terrain3d-nav3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { before(_me, _dt, w) { globalThis.terrain3dNav = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  return (globalThis as { terrain3dNav?: W }).terrain3dNav!
}

const rules = (more: Partial<Rules>): Rules => ({ area: [-50, -50, 50, 50], clearance: 0, around: 8, sample: 0.25, slope: 100, wade: 0.3, ...more })

test('the scene\'s height, link and behaviors are terrain3d\'s', async () => {
  const w = await booted()
  expect(mod(w.world, 'nav3d', 'height')).toBe(height)
  expect(mod(w.world, 'nav3d', 'link')).toBe(link)
  expect(modsOf(w.world, 'nav3d', 'behaviors')).toEqual([behaviors])
})

test('height is the ground under a point, the bed under water', async () => {
  const w = await booted()
  expect(height(w, -20, 0)).toBe(0)
  expect(height(w, 10, -10)).toBeCloseTo(4, 6)
  expect(height(w, 10, 10)).toBe(rawAt(w, 10, 10))
  expect(height(w, 10, 10)).toBeCloseTo(-2, 6)
})

test('a walk over flat ground is a ground way costing its length, and ground costs the way\'s own cost, or its length where it gives none', async () => {
  const w = await booted()
  const got = link(w, [-30, 0], [-10, 0], rules({ slope: 0 }))!
  expect(got).toEqual({ cost: 20, ground: {} })
  const line = { from: [-30, 0, 0], to: [-10, 0, 0] }
  expect(behaviors().ground(w, {}, { line, data: { nav3d: { word: 'ground', cost: 27 }, ground: {} } }, undefined)).toBe(27)
  expect(behaviors().ground(w, {}, { line, data: { nav3d: { word: 'ground' }, ground: {} } }, undefined)).toBe(20)
})

test('a walk over the mound costs the metres walked over it, and is refused where it rises faster than the slope', async () => {
  const w = await booted()
  const over = link(w, [0, -10], [20, -10], rules({}))!
  // Up 4 m and down again, so more than the 20 m across, and less than 20 m and both climbs.
  expect(over.cost).toBeGreaterThan(20)
  expect(over.cost).toBeLessThan(28)
  expect(link(w, [0, -10], [20, -10], rules({ slope: 0.5 }))).toBeUndefined()
})

test('a walk into the pond is refused deeper than the wade, and taken when the wade is deeper than the pond', async () => {
  const w = await booted()
  expect(depthAt(w, 10, 10)).toBeCloseTo(2, 6)
  expect(link(w, [0, 10], [20, 10], rules({}))).toBeUndefined()
  expect(link(w, [0, 10], [20, 10], rules({ wade: 3 }))).toMatchObject({ ground: {} })
})

test('a rule of the wrong value throws, naming it', async () => {
  const w = await booted()
  expect(() => link(w, [0, 0], [1, 0], rules({ sample: 0 }))).toThrow('terrain3d\'s nav3d link: the bake\'s sample is not a number above 0')
  expect(() => link(w, [0, 0], [1, 0], rules({ slope: -1 }))).toThrow('terrain3d\'s nav3d link: the bake\'s slope is not a number of 0 or more')
  expect(() => link(w, [0, 0], [1, 0], rules({ wade: Number.NaN }))).toThrow('terrain3d\'s nav3d link: the bake\'s wade is not a number of 0 or more')
})
