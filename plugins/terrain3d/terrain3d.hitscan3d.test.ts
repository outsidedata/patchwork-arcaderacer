// terrain3d's mod for hitscan3d, named by the scene's `world.hitscan3d.mods.ground`. The test writes a
// manager and one child, `hills`, which `load` boots as a game's would, and fires shots through
// hitscan3d across the hills: each stops at the land, facing out of it, and one into the sky meets
// nothing. Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { shoot } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import { heightAt, normalAt, type Field } from './terrain3d.sim.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 30, sea: 0.5, flood: false, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 12, seed: 3 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
const url = '/terrain3d-hitscan3d-test/hills.json'
written(url, JSON.stringify(field))

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { hills: { file: 'hills.scene.json', suspend: false } }, dt: DT, entry: 'hills', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const hills = {
  world: {
    loader: { assets: { land: { type: 'json', url, preload: true } } },
    terrain3d: { field: 'land' },
    hitscan3d: { mods: { ground: 'terrain3d' }, kinds: {}, rewind: 1 },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'terrain3d-hitscan3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'hills.scene.json'), JSON.stringify(hills))
writeFileSync(join(dir, 'hills.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './hills.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, probe: { before(_me, _dt, w) { globalThis.terrain3dHitscan3d = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

const unit = (v: number[]) => v.map(c => c / Math.hypot(v[0], v[1], v[2]))

test('shots fired across the hills stop at the land, facing out of it, and one into the sky meets nothing', async () => {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('hills')!
  child.step(DT)
  const w = (globalThis as { terrain3dHitscan3d?: W }).terrain3dHitscan3d!
  const shots = [
    { from: [10, 80, -20], dir: [0, -1, 0] },
    { from: [-40, 60, 35], dir: unit([1, -0.4, 0.3]) },
    { from: [70, 50, 70], dir: unit([-0.8, -0.15, -0.5]) },
    // Low over the ground, nearly level, as a seat standing on it aims.
    { from: [0, heightAt(w, 0, 0) + 1.6, 0], dir: unit([1, -0.02, 0.2]) },
  ]
  for (const { from, dir } of shots) {
    const hit = shoot(w, from, dir, 400)!
    expect(hit.what).toBe('ground')
    expect(hit.point[1] - heightAt(w, hit.point[0], hit.point[2])).toBeLessThan(1e-4)
    // The land's own normal there, as its slope reads it.
    const n = normalAt(w, hit.point[0], hit.point[2], field.analysis.slopeStep)
    hit.normal.forEach((c, i) => expect(c).toBeCloseTo(n[i], 12))
    // The shot came from above the ground it hit.
    expect(hit.normal[0] * dir[0] + hit.normal[1] * dir[1] + hit.normal[2] * dir[2]).toBeLessThan(0)
  }
  expect(shoot(w, [5, 90, 5], [0, 1, 0], 400)).toBeUndefined()
})
