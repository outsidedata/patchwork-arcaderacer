// terrain3d's mod for solids, named by the scene's `world.solids.mods.land`. The test writes a manager
// and one child, `hills`, which `load` boots as a game's would, and a page on it through the loopback as
// `index.html` makes one, on a clock of one step a frame, with render3d handed a canvas stand-in. A
// `pad` row, which solids draws from a model of the test's own, stands on the land the page holds
// wherever the row moves, whatever height the row says.
import { afterAll, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene } from '#engine/engine.ts'
import { accept, link, load, manager, view } from '#addons/scenemanager/scenemanager.addon.ts'
import { loopback } from '#addons/loopback/loopback.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { land, type Field } from './terrain3d.sim.ts'

const DT = 1 / 60
;(globalThis as any).addEventListener = () => {}
;(globalThis as any).removeEventListener = () => {}
let clock = 0
vi.spyOn(performance, 'now').mockImplementation(() => clock)

const field: Field = {
  program: { world: 600, hscale: 30, sea: 0.5, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 12, seed: 3 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
const FIELD_URL = '/terrain3d-solids-test/hills.json'
written(FIELD_URL, JSON.stringify(field))
// A slab.
const PAD = {
  paints: { slab: { colour: '#4a4f55' } },
  nodes: { base: { at: [0, 0, 0] } },
  parts: [{ node: 'base', paint: 'slab', loft: { axis: 'y', from: 0, to: 0.3, a: [0, 0, 2, 1] } }],
}
const PAD_URL = '/terrain3d-solids-test/pad.model.json'
written(PAD_URL, JSON.stringify(PAD))

const top: Scene = {
  world: {},
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { hills: { file: 'hills.scene.json', suspend: false } }, dt: DT, entry: 'hills', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const hills: Scene = {
  world: {
    loader: { assets: { land: { type: 'json', url: FIELD_URL, preload: true }, pad: { type: 'json', url: PAD_URL, preload: true }, grass: { type: 'texture', url: '/terrain3d-solids-test/grass.png' } } },
    terrain3d: { field: 'land', rings: [{ reach: 40, seg: 10 }], shadowReach: 100, budget: 1e9, seabed: false },
    solids: { kinds: { pad: 'pad' }, mods: { land: 'terrain3d' } },
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {}, pad: { pos: [0, 0, 0], yaw: 0 } },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'pad', pos: [4, 300, -2], yaw: 0.7 }],
  plugins: ['scenemanager', 'loader', 'terrain3d', 'solids', 'render3d'],
  seats: 1,
}

const dir = mkdtempSync(join(tmpdir(), 'terrain3d-solids-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'hills.scene.json'), JSON.stringify(hills))
writeFileSync(join(dir, 'hills.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './hills.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, pad: {} }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))
const home = pathToFileURL(dir + '/').href

test('a pad stands on the land the page holds wherever its row moves, whatever height the row says', async () => {
  const truth = boot(structuredClone(top), { scenemanager })
  const child = (await load(truth, home)).get('hills')!
  const surface = (s: Scene) => ({ addEventListener: () => {}, style: {} as any, width: s.prefabs.engine.width, height: s.prefabs.engine.height, remove() {} })
  const page = view(link(loopback(accept(manager(truth)))), top, home, (me, s) => { me.plugins.render3d.canvas = surface(s) })
  const frames = async (k: number) => { for (let i = 0; i < k; i++) { truth.step(DT); clock += DT * 1000; await page.frame() } }
  await frames(1)
  const client = page.client!
  for (let i = 0; i < 60 && !client.plugins.terrain3d.ground; i++) await frames(1)
  expect(client.plugins.terrain3d.ground).toBeDefined()
  const truthLand = land(field)
  const pad = child.rows.find(r => r.kind === 'pad')!
  for (const [x, y, z] of [[4, 300, -2], [-37, -40, 21], [55, 0, 80]]) {
    pad.data.pos = [x, y, z]
    await frames(2)
    const at = client.plugins.solids.group(pad.id).position.toArray()
    expect(at[1]).toBe(truthLand.height(x, z))
    expect([at[0], at[2]]).toEqual([x, z])
  }
  page.close()
})
