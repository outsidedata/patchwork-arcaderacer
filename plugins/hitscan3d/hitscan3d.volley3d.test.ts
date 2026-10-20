// hitscan3d's mod for volley3d, given to volley3d by two keys of a scene: `world.volley3d.mods.shoot`
// and `.bodies` are 'hitscan3d'. The test writes a manager and one child, `range`, which `load` boots
// as a game's would: hitscan3d meets terrain3d's ground, level at 0, and walker's bodies, two soldiers
// hitscan3d lists, with a `tall` field and an `off` one, and a crate it does not. The `hitscan3d` row
// keeps each step's bodies, so a shot of hitscan3d's own could be aimed back; a round never is. Its
// `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import type { Numbers as Walker } from '#plugins/walker/walker.sim.ts'
import { shoot as hitscan } from './hitscan3d.sim.ts'
import { bodies, shoot } from './hitscan3d.volley3d.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 10, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  bands: [{ colour: '#3e5722', amount: 1, rules: [] }],
  grain: { base: 1, range: 0 },
  detail: [],
  surfaces: {},
  layers: [],
}
const url = '/hitscan3d-volley3d-test/range.json'
written(url, JSON.stringify(field))
const patternsUrl = '/hitscan3d-volley3d-test/patterns.json'
written(patternsUrl, JSON.stringify({ patterns: {} }))

const SOLDIER: Walker = {
  radius: 0.4, height: 1.8, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9,
  step: 0.6, maxSlope: 0.7, slopeBand: 0.05, slide: 2, wade: 0.5, span: 0.5, probe: 1.5, seekSpeed: 1.5,
}

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { range: { file: 'range.scene.json', suspend: false } }, dt: DT, entry: 'range', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const range = {
  world: {
    loader: { assets: { land: { type: 'json', url, preload: true }, patterns: { type: 'json', url: patternsUrl, preload: true } } },
    terrain3d: { field: 'land' },
    walker: { kinds: { soldier: SOLDIER, crate: { ...SOLDIER, radius: 0.5, height: 1 } } },
    hitscan3d: { mods: { ground: 'terrain3d', bodies: 'walker' }, kinds: { soldier: { parts: { legs: [0, 0.5], body: [0.5, 1] }, tall: 'tall', off: 'limp' } }, rewind: 5 },
    volley3d: { patterns: 'patterns', hold: 0.25, mods: { shoot: 'hitscan3d', bodies: 'hitscan3d' } },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, hitscan3d: {}, soldier: { pos: [0, 0, 0] }, crate: { pos: [0, 0, 0] }, probe: {} },
  // A along +z, B along +x, the crate along −x.
  actors: [
    { is: 'scenemanager' }, { is: 'loader' }, { is: 'hitscan3d' },
    { is: 'soldier', pos: [0, 0, 6] }, { is: 'soldier', pos: [6, 0, 0] }, { is: 'crate', pos: [-6, 0, 0] },
    { is: 'probe' },
  ],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'hitscan3d-volley3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'range.scene.json'), JSON.stringify(range))
writeFileSync(join(dir, 'range.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { hitscan3d } from ${path('./hitscan3d.sim.ts')}
import file from './range.scene.json' with { type: 'json' }
export const sim = {
  scenemanager, loader, hitscan3d, soldier: {}, crate: {},
  probe: { before(_me, _dt, w) { globalThis.hitscan3dVolley3d = w } },
}
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('range')!
  child.step(DT)
  const w = (globalThis as { hitscan3dVolley3d?: W }).hitscan3dVolley3d!
  const [a, b] = w.all('soldier')
  return { child, w, a, b }
}
const who = (h: ReturnType<typeof shoot>) => h && { what: h.what, id: h.id, part: h.part }

test('shoot is hitscan3d\'s shoot: the ground, a body and its part, skip and grow, each as hitscan3d answers', async () => {
  const { w, a } = await booted()
  const lines: [number[], number[], number, Parameters<typeof shoot>[4]][] = [
    [[0, 1, 0], [0, 0, 1], 20, {}],
    [[0, 1, 0], [0, 0, 1], 20, { skip: [a.id] }],
    [[0, 2, 0], [0, -0.2, 1], 20, { skip: [a.id] }],
    [[0.6, 1, 0], [0, 0, 1], 20, {}],
    [[0.6, 1, 0], [0, 0, 1], 20, { grow: 0.3 }],
  ]
  for (const [from, d, far, opts] of lines) expect(shoot(w, from, d, far, opts)).toEqual(hitscan(w, from, d, far, opts))
  expect(who(shoot(w, [0, 1, 0], [0, 0, 1], 20, {}))).toEqual({ what: 'body', id: a.id, part: 'body' })
  expect(shoot(w, [0, 1, 0], [0, 0, 1], 20, { skip: [a.id] })).toBeUndefined()
  // Down past A, which it skips, to the ground 10 m on.
  expect(shoot(w, [0, 2, 0], [0, -0.2, 1], 20, { skip: [a.id] })).toMatchObject({ what: 'ground', point: [0, expect.closeTo(0, 4), expect.closeTo(10, 3)] })
  // 0.6 m off A's middle is past its 0.4 m, and within it grown by 0.3.
  expect(shoot(w, [0.6, 1, 0], [0, 0, 1], 20, {})).toBeUndefined()
  expect(who(shoot(w, [0.6, 1, 0], [0, 0, 1], 20, { grow: 0.3 }))).toEqual({ what: 'body', id: a.id, part: 'body' })
})

test('shoot is asked of now: a body moved since a step the hitscan3d row kept is met where it stands', async () => {
  const { child, w, a } = await booted()
  for (let i = 0; i < 3; i++) child.step(DT)
  a.data.pos = [0, 0, 9]
  expect(shoot(w, [0, 1, 0], [0, 0, 1], 20, {})!.point[2]).toBeCloseTo(8.6, 9)
  expect(hitscan(w, [0, 1, 0], [0, 0, 1], 20, { seen: w.all('hitscan3d')[0].data.n - 1 })!.point[2]).toBeCloseTo(5.6, 9)
})

test('bodies are every body a shot can hit now: of a kind hitscan3d lists, none lying off, each as tall as its tall field', async () => {
  const { w, a, b } = await booted()
  expect(bodies(w)).toEqual([
    { id: a.id, kind: 'soldier', pos: [0, 0, 6], radius: 0.4, height: 1.8 },
    { id: b.id, kind: 'soldier', pos: [6, 0, 0], radius: 0.4, height: 1.8 },
  ])
  a.data.tall = 1.1
  b.data.limp = true
  expect(bodies(w)).toEqual([{ id: a.id, kind: 'soldier', pos: [0, 0, 6], radius: 0.4, height: 1.1 }])
})
