// shapes3d's mod for nav3d, named by the scene's `world.nav3d.mods`: `solids`. The test writes a manager
// and one child, `yard`, which `load` boots as a game's would: level ground (terrain3d's), a crate (a box
// 2 m across and 1 m long, turned), a post (a cylinder) and a far post past the area. `solids` hands the
// crate as its four corners, the post as its middle rounded by its radius, and nothing outside the area.
// Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { corners } from './shapes3d.sim.ts'
import { solids } from './shapes3d.nav3d.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 1, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
const url = '/shapes3d-nav3d-test/yard.json'
written(url, JSON.stringify(field))

const CRATE = { pos: [0, 0, 0], size: [2, 1, 1], yaw: 0.6 }
const yard = {
  world: {
    loader: { assets: { land: { type: 'json', url, preload: true } } },
    terrain3d: { field: 'land' },
    shapes3d: { kinds: { crate: { shape: { box: { size: CRATE.size } } }, post: { shape: { cylinder: { radius: 0.5, height: 3 } } } } },
    nav3d: { graphs: {}, mods: { solids: ['shapes3d'] } },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, crate: { pos: [0, 0, 0], yaw: 0 }, post: { pos: [0, 0, 0], yaw: 0 }, probe: {} },
  actors: [
    { is: 'scenemanager' }, { is: 'loader' },
    { is: 'crate', pos: CRATE.pos, yaw: CRATE.yaw }, { is: 'post', pos: [-6, 0, 2] }, { is: 'post', pos: [40, 0, 0] },
    { is: 'probe' },
  ],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'shapes3d-nav3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, crate: {}, post: {}, probe: { before(_me, _dt, w) { globalThis.shapes3dNav = w } } }
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
  return (globalThis as { shapes3dNav?: W }).shapes3dNav!
}

test('the scene\'s solids are shapes3d\'s', async () => {
  const w = await booted()
  expect(modsOf(w.world, 'nav3d', 'solids')).toEqual([solids])
})

test('solids hands a box as its four corners and a cylinder as its middle rounded by its radius, and nothing outside the area', async () => {
  const w = await booted()
  expect(solids(w, [-20, -20, 20, 20])).toEqual([
    { points: corners(CRATE), round: 0 },
    { points: [[-6, 2]], round: 0.5 },
  ])
  // A post whose round reaches into the area is handed; one whose round stops short of it is not.
  expect(solids(w, [-5.6, -20, 20, 20])).toHaveLength(2)
  expect(solids(w, [-5.4, -20, 20, 20])).toEqual([{ points: corners(CRATE), round: 0 }])
  expect(solids(w, [39.6, -1, 41, 1])).toEqual([{ points: [[40, 0]], round: 0.5 }])
})
