// box3d's mod for box3dvehicle, given to box3dvehicle by one key of a scene:
// `world.box3dvehicle.mods.gravity` is 'box3d'. The test writes a manager and children, each a box3d
// world with nothing in it, which `load` boots as a game's would; a child's `probe` hands the test the
// child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { b3 } from './box3d.sim.ts'
import { gravity } from './box3d.box3dvehicle.ts'

const DT = 1 / 60
const dir = mkdtempSync(join(tmpdir(), 'box3d-box3dvehicle-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
let made = 0

// A child whose `world.box3d` is `world`, booted, loaded and stepped once: its truth and its `w`.
async function child(world: Record<string, unknown>): Promise<{ truth: Truth; w: () => W }> {
  const name = `still${made++}`
  const scene = {
    world: { box3d: { subStepCount: 4, static: [], kinds: {}, ...world }, box3dvehicle: { mods: { gravity: 'box3d' } } },
    prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, box3d: {}, probe: {} },
    actors: [{ is: 'scenemanager' }, { is: 'box3d' }, { is: 'probe' }],
    plugins: ['scenemanager'],
  }
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(scene))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { box3d } from ${path('./box3d.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, box3d, probe: { after(_me, _dt, w) { globalThis.${name} = w } } }
export const scene = file
`)
  const top: Scene = {
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [name]: { file: `${name}.scene.json`, suspend: false } }, dt: DT, entry: name, port: 0 } },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
  }
  const truth = (await load(boot(top, { scenemanager }), pathToFileURL(dir + '/').href)).get(name)!
  truth.step(DT)
  return { truth, w: () => (globalThis as any)[name] }
}

test('the scene\'s one key gives box3dvehicle this gravity, loaded before the first step', async () => {
  const { truth } = await child({ gravity: [0, -4, 0] })
  expect(mod(truth.world, 'box3dvehicle', 'gravity')).toBe(gravity)
})

test('the gravity is the scene\'s world.box3d.gravity, and Box3D\'s own when the scene gives none', async () => {
  const moon = await child({ gravity: [0, -1.6, 0] })
  expect(gravity(moon.w())).toEqual([0, -1.6, 0])
  const plain = await child({})
  expect(gravity(plain.w())).toEqual(b3.b3DefaultWorldDef().gravity)
})

test('a gravity the box3d row carries is the gravity, as box3d pushes it to its world over the scene\'s', async () => {
  const { truth, w } = await child({ gravity: [0, -4, 0] })
  const world = truth.rows.find(r => r.kind === 'box3d')!
  world.data.gravity = [1, -3, 0]
  truth.step(DT)
  expect(gravity(w())).toEqual([1, -3, 0])
})
