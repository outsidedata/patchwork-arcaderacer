// world3d's mod for nav3d, named by the scene's `world.nav3d.mods.graphs`. The test writes a manager and one child,
// `yard`, which `load` boots as a game's would: the place `yard`'s graph, three places in a row and two ways, is
// nav3d's graph `place`, a route goes along it, and npc3d's routes walk it as the scene's one graph. Its `probe` hands
// the test its `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { graphsOf, route } from '#plugins/nav3d/nav3d.sim.ts'
import { route as walk } from '#plugins/nav3d/nav3d.npc3d.ts'
import { graphs } from './world3d.nav3d.ts'
import { GRAPH } from './world3d.sim.ts'

const DT = 1 / 60
const at = '/world3d-nav3d-test/'
const place = (x: number, tag: string) => ({ point: { at: [x, 0, 0] }, data: { nav3d: { tags: [tag] } } })
written(`${at}yard.nav.json`, JSON.stringify({
  places: [place(0, 'gate'), place(5, 'well'), place(10, 'hall')],
  ways: [{ line: { from: [0, 0, 0], to: [5, 0, 0] } }, { line: { from: [5, 0, 0], to: [10, 0, 0] } }],
}))

const childOf = (nav3d: Record<string, unknown>) => ({
  world: {
    loader: { assets: { 'yard.nav': { type: 'json', url: `${at}yard.nav.json`, preload: true } } },
    world3d: { place: 'yard' },
    nav3d,
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager'],
})
const children: Record<string, unknown> = {
  yard: childOf({ mods: { graphs: ['world3d'] } }),
}

const dir = mkdtempSync(join(tmpdir(), 'world3d-nav3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
for (const [name, s] of Object.entries(children)) {
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(s))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { before(_me, _dt, w) { globalThis.world3dNav = w } } }
export const scene = file
`)
}
afterAll(() => rmSync(dir, { recursive: true }))

async function booted(entry: string) {
  const manager: Scene = {
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [entry]: { file: `${entry}.scene.json`, suspend: false } }, dt: DT, entry, port: 0 } },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
    seats: 1,
  }
  const child = (await load(boot(manager, { scenemanager }), pathToFileURL(dir + '/').href)).get(entry)!
  child.step(DT)
  return (globalThis as { world3dNav?: W }).world3dNav!
}

test('the scene\'s graphs mod is world3d\'s, the place\'s graph by the name place', async () => {
  const w = await booted('yard')
  expect(modsOf(w.world, 'nav3d', 'graphs')).toEqual([graphs])
  expect(GRAPH).toBe('place')
  expect(graphs(w.world)).toEqual({ place: { asset: 'yard.nav' } })
  expect(graphsOf(w.world)).toEqual({ place: { asset: 'yard.nav' } })
})

test('a route goes along the place\'s graph, and npc3d\'s routes walk it as the scene\'s one graph', async () => {
  const w = await booted('yard')
  expect(route(w, GRAPH, [0, 0, 0], 'hall')!.map(s => [s.at, s.place])).toEqual([[[0, 0, 0], 0], [[5, 0, 0], 1], [[10, 0, 0], 2]])
  // to a point: the places on the way, then the point itself, here standing on the hall
  expect(walk(w, [1, 0, 0], [10, 0, 0])).toEqual([[0, 0, 0], [5, 0, 0], [10, 0, 0], [10, 0, 0]])
})
