// terrain3d's mods for box3dvehicle, named by the scene's `world.box3dvehicle.mods`: `grip` and `drag` on
// the server, `land` on the page. The test writes a manager and two children, which `load` boots as a
// game's would: flat ground, box3d standing on it through terrain3d's own mod, with a wide patch of mud
// painted on it. The land the page hands box3dvehicle says what the mud sprays and how dark a track it
// takes.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load, mod } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { render3d } from '#plugins/render3d/render3d.plugin.ts'
import type { Axle, Fleet, Vehicle } from '#plugins/box3dvehicle/box3dvehicle.sim.ts'
import type { Plugins } from '#engine/browser.ts'
import type { Field, Stroke } from './terrain3d.sim.ts'
import { terrain3d, type Ground } from './terrain3d.plugin.ts'

const DT = 1 / 60
const MUD: Stroke = { verb: 'surface', radius: 30, hardness: 1, strength: 0, level: 0, surface: 'mud', path: [[-10, 0], [70, 0]] }
const fieldOf = (strokes: Stroke[]): Field => ({
  program: { world: 600, hscale: 10, sea: 0.5, flood: false, out: 'flat', nodes: [{ id: 'flat', op: 'const', value: 0.5 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: { mud: { colour: '#4a3a28', cover: 0.3, grip: 0.5, drag: 0.3, spray: 'clods', mark: 0.9 } },
  layers: [{ at: [30, 0], size: 160, px: 80, strokes }],
})
const FIELDS = { mud: fieldOf([MUD]), plain: fieldOf([]) }
for (const [name, field] of Object.entries(FIELDS)) written(`/terrain3d-box3dvehicle-test/${name}.json`, JSON.stringify(field))

// A 600 kg car on four driven 20 kg wheels, as box3dvehicle's own tests make it.
const axle = (at: number, steered: boolean): Axle => ({
  at, track: 1.7, mount: 0.2,
  wheel: { radius: 0.36, width: 0.28, mass: 20, friction: 0.9, rollingResistance: 0 },
  spring: { stiffness: 16000, length: 0.55, travel: 0.3, sag: 0.1 },
  damper: { bump: 800, rebound: 1600 },
  bumpStop: { length: 0.06, stiffness: 30000 },
  antiRoll: 8000, driven: true, steered,
})
const car: Vehicle = {
  body: { length: 3.6, width: 1.3, height: 0.5, mass: 600, center: [0.1, -0.1, 0], friction: 0.9 },
  bodies: { enableContactRecycling: false },
  axles: [axle(1.25, true), axle(-1.25, false)],
  engine: { spinSpeed: 30, spinTorque: 300, brakeTorque: 600, coastTorque: 0 },
  steering: { angle: 0.5, hertz: 5, dampingRatio: 1, maxTorque: 1e4 },
  look: { paint: { body: 0, cabin: 0, trim: 0, glass: 0, light: 0, tail: 0, amber: 0, tyre: 0, rim: 0, chrome: 0, seat: 0, hook: 0, spring: 0, damper: 0, arm: 0 }, segments: 16, spokes: 5, rim: 0.6, coils: 6, coilRadius: 0.07, wire: 0.01, arm: 0.03 },
}
const fleet: Fleet = { chassis: 'body', wheel: 'tyre', joint: 'axle', vehicles: { car }, mods: { gravity: 'box3d', grip: 'terrain3d', drag: 'terrain3d', land: 'terrain3d' } }

const dir = mkdtempSync(join(tmpdir(), 'terrain3d-box3dvehicle-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
const at = { pos: [0, 0, 0], rot: [0, 0, 0, 1], vel: [0, 0, 0], spin: [0, 0, 0], awake: true }
for (const name of Object.keys(FIELDS)) {
  const scene = {
    world: {
      loader: { assets: { land: { type: 'json', url: `/terrain3d-box3dvehicle-test/${name}.json`, preload: true } } },
      terrain3d: { field: 'land' },
      box3d: { gravity: [0, -10, 0], subStepCount: 4, static: [], kinds: {}, mods: { kinds: 'box3dvehicle', ground: 'terrain3d' }, chunk: { count: 33, cell: 2 } },
      box3dvehicle: fleet,
    },
    prefabs: {
      engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, box3d: { ground: [[-1, -1], [-1, 0], [0, -1], [0, 0], [1, -1], [1, 0]] },
      box3dvehicle: { throttle: 0, brake: 0, steer: 0 }, body: at, tyre: at, axle: {}, probe: {},
    },
    actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'box3d' }, { is: 'box3dvehicle', vehicle: 'car', pos: [0, 1, 0], rot: [0, 0, 0, 1] }, { is: 'probe' }],
    plugins: ['scenemanager'],
  }
  writeFileSync(join(dir, `${name}.scene.json`), JSON.stringify(scene))
  writeFileSync(join(dir, `${name}.sim.ts`), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { box3d } from ${path('../box3d/box3d.sim.ts')}
import { box3dvehicle } from ${path('../box3dvehicle/box3dvehicle.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, box3d, box3dvehicle, body: {}, tyre: {}, axle: {}, probe: { after(_me, _dt, w) { globalThis.terrain3dBox3dvehicle = w } } }
export const scene = file
`)
}
afterAll(() => rmSync(dir, { recursive: true }))

async function yard(name: keyof typeof FIELDS) {
  const top: Scene = {
    prefabs: { engine: { dt: DT }, scenemanager: { scenes: { [name]: { file: `${name}.scene.json`, suspend: false } }, dt: DT, entry: name, port: 0 } },
    actors: [{ is: 'scenemanager' }],
    plugins: ['scenemanager'],
    seats: 1,
  }
  const child = (await load(boot(top, { scenemanager }), pathToFileURL(dir + '/').href)).get(name)!
  return { child, w: () => (globalThis as { terrain3dBox3dvehicle?: W }).terrain3dBox3dvehicle! }
}
test('the land the page hands box3dvehicle says what the mud sprays and how dark a track it takes, and nothing off it', async () => {
  const { child } = await yard('mud')
  const plugins: any = {
    wire: { rows: [], scene: { world: { terrain3d: { field: 'land', rings: [{ reach: 40, seg: 10 }], shadowReach: 100, budget: 1e9, seabed: false } }, prefabs: { engine: { width: 320, height: 200 }, render3d: { camera: { fov: 60, near: 0.15, far: 3000, at: [0, 20, 0], look: [10, 0, 10] } } } } },
    render3d: render3d(),
    loader: { get: () => structuredClone(FIELDS.mud), catalogued: () => ({ type: 'texture' }), load: () => undefined },
    terrain3d: terrain3d(),
  }
  const landOf = mod<(plugins: Plugins) => Ground | undefined>(child.world, 'box3dvehicle', 'land')!
  expect(landOf(plugins)).toBeUndefined()
  plugins.render3d.tick(plugins)
  plugins.terrain3d.afterTick(plugins)
  const ground = landOf(plugins)!
  expect([ground.spray(20, 0), ground.mark(20, 0)]).toEqual(['clods', 0.9])
  expect([ground.spray(20, 60), ground.mark(20, 60)]).toEqual([undefined, undefined])
})
