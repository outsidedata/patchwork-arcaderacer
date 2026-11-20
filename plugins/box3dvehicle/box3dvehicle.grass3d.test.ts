// box3dvehicle's mods for gpgpu3d and grass3d, named by a scene the test writes and boots through `load` as a
// game's is: grass3d's browser half on three in node, on terrain3d's land, pressed by what gpgpu3d holds, a
// car the test stands on the land, its rows written by the test as box3dvehicle's server half names them,
// each of its boxes a `hyperbox`. The car's wheels, standing on the
// ground, trample the grass under them, lying away from each wheel's middle; its body, over the ground,
// does not.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import type { Plugins } from '#engine/browser.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { json, written } from '#plugins/loader/loader.sim.ts'
import { edits, heightAt, paintAt, ramp, type Field, type Rule } from '#plugins/terrain3d/terrain3d.sim.ts'
import { grass3d } from '#plugins/grass3d/grass3d.plugin.ts'
import { gpgpu3d } from '#plugins/gpgpu3d/gpgpu3d.plugin.ts'
import type { Grass3d } from '#plugins/grass3d/grass3d.sim.ts'
import { corners, type Vehicle } from './box3dvehicle.sim.ts'

const DT = 1 / 60
// Flat ground at 2 m, so the car stands level on it.
const field: Field = {
  program: { world: 600, hscale: 2, sea: 0, flood: false, out: 'flat', nodes: [{ id: 'flat', op: 'const', value: 0.5 }] },
  analysis: { slopeStep: 1, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
written('/box3dvehicle-grass3d-test/flat.json', JSON.stringify(field))

const R = 0.36, W_ = 0.28
const axle = (at: number) => ({ at, track: 1.7, mount: 0.2, wheel: { radius: R, width: W_ } })
// The car as its boxes are read off it: its body, its bumpers and its axles' wheels.
const jeep = { body: { length: 3.6, width: 1.3, height: 0.5 }, axles: [axle(1.25), axle(-1.25)], look: { bumpers: { depth: 0.15, overhang: 0.1 } } }
const settings: Grass3d = {
  budget: 1000, wind: { toward: 0, speed: 0 }, gust: { scale: 10, strength: 0, flutter: 0, rate: 0 },
  bend: 0, trample: { recover: 20, reach: 0.3 },
  grasses: {
    meadow: {
      rules: [], density: 50, full: 4, reach: 20, fade: 4, tile: 2, height: [0.4, 0], width: [0.04, 0], widen: 0.5, widest: 4,
      lean: 0, segments: [2, 1], chunks: 2, colours: { root: '#203010', tip: '#90b050', dry: '#b0a060' }, dry: { amount: 0, scale: 10 },
      vary: 0, translucency: 0, roughness: 0.7, ao: 0, shadow: 0,
    },
  },
}
written('/box3dvehicle-grass3d-test/grasses.json', JSON.stringify(settings))
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }], plugins: ['scenemanager'], seats: 1,
}
const yard = {
  world: {
    loader: { assets: { land: { type: 'json', url: '/box3dvehicle-grass3d-test/flat.json', preload: true }, grasses: { type: 'json', url: '/box3dvehicle-grass3d-test/grasses.json', preload: true } } },
    terrain3d: { field: 'land', rings: [{ reach: 16, seg: 64 }] },
    box3dvehicle: { vehicles: { jeep } },
    gpgpu3d: { reach: 30, mods: { things: ['box3dvehicle'], behaviors: ['box3dvehicle'] } },
    grass3d: { grasses: 'grasses', mods: { land: 'terrain3d', keeper: 'gpgpu3d', pressed: 'gpgpu3d', behaviors: ['box3dvehicle'] } },
  },
  prefabs: { engine: { dt: DT, width: 320, height: 200 }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager', 'loader', 'terrain3d', 'box3dvehicle', 'gpgpu3d', 'grass3d', 'render3d'],
}
const dir = mkdtempSync(join(tmpdir(), 'box3dvehicle-grass3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { after(_me, _dt, w) { globalThis.box3dvehicleGrass3d = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

test('a car standing on the land tramples the grass under its wheels, lying away from each wheel, and none under its body', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  const w = (globalThis as { box3dvehicleGrass3d?: W }).box3dvehicleGrass3d!
  const ground = heightAt(w, 0, 0)
  // The car at the origin, facing +x, each wheel's bottom on the ground, the body's bottom 0.4 m over it.
  const wheels = corners(jeep as unknown as Vehicle).map(c => [c.mount[0], ground + R, c.mount[2]])
  const rows = [
    { id: 1, kind: 'box3dvehicle', data: { vehicle: 'jeep', chassis: 2, wheels: [3, 4, 5, 6] } },
    { id: 2, kind: 'car', data: { pos: [0, ground + 0.4 + 0.25, 0], rot: [0, 0, 0, 1] } },
    ...wheels.map((at, i) => ({ id: 3 + i, kind: 'wheel', data: { pos: at, rot: [0, 0, 0, 1] } })),
  ] as Row[]
  const plugins = {
    render3d: { THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), dress: (m: THREE.Material) => m },
    terrain3d: {
      ground: {
        prepared: () => undefined, shown: () => true, height: (x: number, z: number) => heightAt(w, x, z), cover: (x: number, z: number) => paintAt(w, x, z).cover,
        ramp: (r: Rule, x: number, z: number) => ramp(w, r, x, z), rules: (list: Rule[], what: string) => edits(w).land.rules(list, what),
        edits: () => ({ land: edits(w).land, layers: [] }),
      },
    },
    loader: { get: (name: string) => json(w, name) },
    wire: { scene: { world: w.world, plugins: yard.plugins, prefabs: yard.prefabs }, rows, n: 1 },
  } as unknown as Plugins
  plugins.gpgpu3d = gpgpu3d()
  plugins.grass3d = grass3d()
  // gpgpu3d holds the car's five boxes: the body, and each wheel its radius round and its width across.
  for (let frame = 0; frame < 2; frame++) {
    plugins.gpgpu3d.afterTick(plugins)
    plugins.grass3d.afterTick(plugins)
  }
  const boxes = plugins.gpgpu3d.shader(plugins, 'grass3d').things()
  expect(boxes).toHaveLength(5)
  expect(boxes[1].hyperbox.half).toEqual([R, R, W_ / 2])
  const cell = 0.5, at = (x: number, z: number) => plugins.grass3d.at(Math.round(x / cell), Math.round(z / cell))
  // Each wheel, its tyre narrower than a cell, tramples the lattice point nearest under it, which lies
  // away from the wheel's middle.
  for (const [x, , z] of wheels) {
    const i = Math.round(x / cell), j = Math.round(z / cell)
    const under = plugins.grass3d.at(i, j)
    expect(under.trampled).toBeGreaterThan(0)
    const away = [i * cell - x, j * cell - z], len = Math.hypot(away[0], away[1])
    expect(under.lies[0] * away[0] / len + under.lies[1] * away[1] / len).toBeGreaterThan(0.999)
  }
  // Between the axles, under the body, nothing lies.
  expect(at(0, 0).trampled).toBe(0)
  expect(at(0, 0.5).trampled).toBe(0)
})
