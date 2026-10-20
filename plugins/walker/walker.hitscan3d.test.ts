// walker's mod for hitscan3d, given to hitscan3d by one key of a scene: `world.hitscan3d.mods.bodies`
// is 'walker'. The test writes a manager and one child, `yard`, which `load` boots as a game's would:
// `world.walker.kinds` lists two kinds, soldiers and dogs, and a post is a kind walker does not list.
// `bodies` is every row of a listed kind, where its row stands now, with its kind's radius and height;
// hitscan3d meets the ones it lists itself. Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { shoot } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import type { Numbers } from './walker.sim.ts'
import { bodies } from './walker.hitscan3d.ts'

const DT = 1 / 60
const K: Numbers = {
  radius: 0.35, height: 1.7, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9,
  step: 0.6, maxSlope: 0.7, slopeBand: 0.05, slide: 2, wade: 0.5, span: 0.5, probe: 1.5, seekSpeed: 1.5,
}
const DOG: Numbers = { ...K, radius: 0.25, height: 0.6 }

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const yard = {
  world: {
    walker: { kinds: { soldier: K, dog: DOG } },
    hitscan3d: { mods: { bodies: 'walker' }, kinds: { soldier: { parts: { body: [0, 1] } } }, rewind: 1 },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, soldier: { pos: [0, 0, 0] }, dog: { pos: [0, 0, 0] }, post: { pos: [0, 0, 0] }, probe: {} },
  actors: [
    { is: 'scenemanager' },
    { is: 'soldier', pos: [0, 0, 5] }, { is: 'dog', pos: [3, 0.5, 0] }, { is: 'soldier', pos: [-4, 1, -4] }, { is: 'post', pos: [0, 0, -3] },
    { is: 'probe' },
  ],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'walker-hitscan3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, soldier: {}, dog: {}, post: {}, probe: { before(_me, _dt, w) { globalThis.walkerHitscan3d = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  return { child, w: (globalThis as { walkerHitscan3d?: W }).walkerHitscan3d! }
}
const byId = <T extends { id: number }>(list: T[]) => [...list].sort((a, b) => a.id - b.id)

test('bodies are every row of a kind world.walker.kinds lists, at its pos, its feet, with its kind\'s radius and height', async () => {
  const { w } = await booted()
  const [s1, s2] = w.all('soldier'), [dog] = w.all('dog')
  expect(byId(bodies(w))).toEqual(byId([
    { id: s1.id, kind: 'soldier', pos: [0, 0, 5], radius: 0.35, height: 1.7 },
    { id: s2.id, kind: 'soldier', pos: [-4, 1, -4], radius: 0.35, height: 1.7 },
    { id: dog.id, kind: 'dog', pos: [3, 0.5, 0], radius: 0.25, height: 0.6 },
  ]))
})

test('they are read off the rows as they are now: a body moved, one ended and one spawned', async () => {
  const { w } = await booted()
  const [s1, s2] = w.all('soldier')
  s1.data.pos = [7, 2, 7]
  w.end(s2)
  const pup = w.spawn('dog', { pos: [1, 0, 1] })
  const got = byId(bodies(w))
  expect(got.map(b => b.id)).toEqual(byId([s1, w.all('dog')[0], pup]).map(r => r.id))
  expect(got.find(b => b.id === s1.id)!.pos).toEqual([7, 2, 7])
  expect(got.find(b => b.id === pup.id)).toEqual({ id: pup.id, kind: 'dog', pos: [1, 0, 1], radius: 0.25, height: 0.6 })
})

test('hitscan3d meets the bodies of the kinds it lists at walker\'s radius and height, and passes the rest', async () => {
  const { w } = await booted()
  const [s1] = w.all('soldier')
  const hit = shoot(w, [0, 1, 0], [0, 0, 1], 20)!
  expect(hit).toMatchObject({ what: 'body', id: s1.id, kind: 'soldier', part: 'body' })
  expect(hit.t).toBeCloseTo(5 - 0.35, 9)
  expect(shoot(w, [0, 1.75, 0], [0, 0, 1], 20)).toBeUndefined()
  // A dog walker lists and hitscan3d does not, and a post walker does not list.
  expect(shoot(w, [0, 0.8, 0], [1, 0, 0], 20)).toBeUndefined()
  expect(shoot(w, [0, 0.5, 0], [0, 0, -1], 20)).toBeUndefined()
})
