// world3d's mod for shapes3d, named by the scene's `world.shapes3d.mods.shapes`. The test writes a manager and one
// child, `yard`, which `load` boots as a game's would: its place `yard`'s shapes file, a wall and a floor, and one
// shapes file of the scene's own, a post, named in `world.shapes3d.shapes`. shapes3d holds all three, the scene's own
// first, each with no row; the wall stands in the way, the floor is stood on. Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { near, shapes as held, words } from '#plugins/shapes3d/shapes3d.sim.ts'
import { shapes } from './world3d.shapes3d.ts'

const DT = 1 / 60
const at = '/world3d-shapes3d-test/'
written(`${at}yard.shapes3d.json`, JSON.stringify({
  kinds: { wall: { shape: { box: { size: [4, 3, 0.5] } } }, floor: { shape: { plane: { size: [6, 6] } } } },
  shapes: [{ kind: 'wall', pos: [0, 0, 5], yaw: 0 }, { kind: 'floor', pos: [0, 2, -5], yaw: 0 }],
}))
written(`${at}posts.json`, JSON.stringify({ kinds: { post: { shape: { cylinder: { radius: 0.2, height: 2 } } } }, shapes: [{ kind: 'post', pos: [8, 0, 0], yaw: 0 }] }))

const yard = {
  world: {
    loader: { assets: { 'yard.shapes3d': { type: 'json', url: `${at}yard.shapes3d.json`, preload: true }, posts: { type: 'json', url: `${at}posts.json`, preload: true } } },
    world3d: { place: 'yard' },
    shapes3d: { shapes: ['posts'], mods: { shapes: ['world3d'] } },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'world3d-shapes3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { before(_me, _dt, w) { globalThis.world3dShapes = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const manager: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}

async function booted() {
  const child = (await load(boot(structuredClone(manager), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  return (globalThis as { world3dShapes?: W }).world3dShapes!
}

test('the scene\'s shapes mod is world3d\'s, naming the place\'s shapes file', async () => {
  const w = await booted()
  expect(modsOf(w.world, 'shapes3d', 'shapes')).toEqual([shapes])
  expect(shapes(w.world)).toEqual(['yard.shapes3d'])
})

test('shapes3d holds the scene\'s own shapes and the place\'s, each with no row; the wall stands in the way and the floor is stood on', async () => {
  const w = await booted()
  const all = held(w)
  expect(all.map(s => [s.id, s.kind, s.word])).toEqual([[-1, 'post', 'cylinder'], [-2, 'wall', 'box'], [-3, 'floor', 'plane']])
  // the wall 4 m across x and half a metre along z, about z 5
  expect(near(w, 1, 5.2, 0.1).map(s => s.kind)).toEqual(['wall'])
  expect(near(w, 1, 5.5, 0.1)).toEqual([])
  const floor = all.find(s => s.kind === 'floor')!
  expect(words.plane.top(floor.shape.plane, 0, -5)).toBe(2)
  expect(words.plane.top(floor.shape.plane, 0, 5)).toBeUndefined()
})
