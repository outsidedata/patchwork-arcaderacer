// interact's mod for ik3d, on a scene the test writes into a game folder of its own and boots through
// the scenemanager's `load`, so the scene's mods are loaded as a game's are.
// A `cart` has the interaction `board`: `reach`, which bends no limb, then `grab`, holding, its hands
// on the cart's `gripL` and `gripR`. The game's own `rack` hands interact the cart's points as the page
// draws them, `object(plugins, machine, name)`, out of a table the page's `plugins.drawn` holds, a
// point missing from it not drawn yet.
//
// The mod hands the limbs of the step the row is in with their
// objects, none for a step that bends none or a row in no interaction, and leaves out a point not drawn;
// it throws for a scene that names no object mod.
import { afterAll, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Row, type Scene } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { limbs } from './interact.ik3d.ts'
import type { Interaction } from './interact.sim.ts'

const DT = 1 / 60
const BOARD: Interaction = {
  body: 'person',
  steps: [
    { name: 'reach', clip: 'reach', at: 'foot' },
    { name: 'grab', clip: 'perch', at: 'seat', hold: true, ik: [
      { bones: ['LeftArm', 'LeftForeArm', 'LeftHand'], target: 'gripL', pole: [1, -1, 0] },
      { bones: ['RightArm', 'RightForeArm', 'RightHand'], target: 'gripR', pole: [-1, -1, 0] },
    ] },
  ],
}
const BOARD_URL = '/interact-ik3d-test/board.json'
written(BOARD_URL, JSON.stringify(BOARD))

const world = {
  loader: { assets: { board: { type: 'json', url: BOARD_URL, preload: true } } },
  interact: { kinds: { cart: { board: 'board' } }, mods: { point: 'rack', object: 'rack' } },
  ik3d: { mods: { limbs: 'interact' } },
  shipped: { plugins: ['rack'] },
}
const yard: Scene = {
  world,
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }],
  plugins: ['scenemanager'],
}
const top: Scene = {
  world: {}, plugins: ['scenemanager'], seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}
const dir = mkdtempSync(join(tmpdir(), 'interact-ik3d-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
mkdirSync(join(dir, 'plugins/rack'), { recursive: true })
writeFileSync(join(dir, 'plugins/rack/rack.plugin.ts'), 'export const rack = () => ({})\n')
writeFileSync(join(dir, 'plugins/rack/rack.interact.ts'), `
export const point = () => undefined
export const object = (plugins, machine, name) => plugins.drawn?.[machine]?.[name]
`)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader }
export const scene = file
`)

// A page's plugins on the booted yard: its wire, with `rows`, and `drawn`, the rack's objects by
// machine id and point.
async function page(rows: Row[], drawn: Record<number, Record<string, THREE.Object3D>> = {}) {
  const plugins = ['loader', 'shipped', 'interact', 'ik3d', 'render3d']
  const t = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  return { wire: { n: 1, rows, scene: { ...t.scene, plugins } }, drawn } as any
}
const empty = (name: string) => Object.assign(new THREE.Object3D(), { name })
const person = (step: number | null): Row => ({ id: 2, kind: 'person', data: { interact: step === null ? null : { machine: 9, kind: 'cart', name: 'board', step, t: 0 } } })

test('the limbs mod hands the limbs of the step the row is in, each on its point\'s object as drawn', async () => {
  const gripL = empty('gripL'), gripR = empty('gripR')
  const plugins = await page([], { 9: { gripL, gripR } })
  expect(limbs(plugins, person(1))).toEqual([
    { bones: ['LeftArm', 'LeftForeArm', 'LeftHand'], pole: [1, -1, 0], target: gripL },
    { bones: ['RightArm', 'RightForeArm', 'RightHand'], pole: [-1, -1, 0], target: gripR },
  ])
})

test('no limbs for a row in no interaction or in a step that bends none; a point not drawn yet is left out', async () => {
  const gripR = empty('gripR')
  const plugins = await page([], { 9: { gripR } })
  expect(limbs(plugins, person(null))).toBeUndefined()
  expect(limbs(plugins, person(0))).toBeUndefined()
  expect(limbs(plugins, person(1))).toEqual([{ bones: ['RightArm', 'RightForeArm', 'RightHand'], pole: [-1, -1, 0], target: gripR }])
})

test('a scene with a step that bends limbs and no object mod throws', async () => {
  const plugins = await page([])
  const mods = plugins.wire.scene.world.interact.mods
  plugins.wire.scene.world.interact.mods = { point: 'rack' }
  try {
    expect(() => limbs(plugins, person(1))).toThrow('interact bends limbs onto the points a mod draws, and the scene names none in world.interact.mods.object')
  } finally {
    plugins.wire.scene.world.interact.mods = mods
  }
})
