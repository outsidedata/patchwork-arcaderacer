// shapes3d's mod for cover3d, named by the scene's `world.cover3d.mods`: `solids` and `behaviors`. The
// test writes a manager and one child, `yard`, which `load` boots as a game's would: a crate (a box 2 m
// across, 1 m long and 1 m tall, turned), a kerb (a box 0.2 m tall) and a post (a cylinder). A spot
// behind the crate stands on the line from the threat through its middle, the body's radius clear of
// it, with the crate between it and the threat; the kerb is too low to hide behind; the post's spot is
// cover3d's own cylinder's. Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { spots } from '#plugins/cover3d/cover3d.sim.ts'
import { lineBox, words } from './shapes3d.sim.ts'
import { behaviors, solids } from './shapes3d.cover3d.ts'

const DT = 1 / 60
const CRATE = { pos: [0, 0, 0], size: [2, 1, 1], yaw: 0.6 }
const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const yard = {
  world: {
    shapes3d: { kinds: { crate: { shape: { box: { size: CRATE.size } } }, kerb: { shape: { box: { size: [4, 0.2, 0.3] } } }, post: { shape: { cylinder: { radius: 0.5, height: 3 } } } } },
    cover3d: { mods: { solids: 'shapes3d', behaviors: 'shapes3d' } },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, crate: { pos: [0, 0, 0], yaw: 0 }, kerb: { pos: [0, 0, 0], yaw: 0 }, post: { pos: [0, 0, 0], yaw: 0 }, probe: {} },
  actors: [
    { is: 'scenemanager' },
    { is: 'crate', pos: CRATE.pos, yaw: CRATE.yaw }, { is: 'kerb', pos: [0, 0, -6], yaw: 0 }, { is: 'post', pos: [8, 0, 0] },
    { is: 'probe' },
  ],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'shapes3d-cover3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
export const sim = { scenemanager, crate: {}, kerb: {}, post: {}, probe: { before(_me, _dt, w) { globalThis.shapes3dCover = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  return (globalThis as { shapes3dCover?: W }).shapes3dCover!
}
const ASK = { reach: 4, radius: 0.35, low: 0.8 }

test('the scene\'s mods are shapes3d\'s: its solids, and its behaviors deliver box', async () => {
  const w = await booted()
  expect(modsOf(w.world, 'cover3d', 'solids')).toEqual([solids])
  expect(modsOf(w.world, 'cover3d', 'behaviors')).toEqual([behaviors])
  expect(Object.keys(behaviors())).toEqual(['box'])
})

test('a spot behind a turned box stands on the line from the threat through its middle, the body\'s radius clear of it, the box between', async () => {
  const w = await booted()
  for (let a = 0; a < 12; a++) {
    const way = (a / 12) * 2 * Math.PI
    const threat = [-10 * Math.sin(way), -10 * Math.cos(way)]
    const spot = spots(w, [0, 0], threat, ASK).find(s => s.tall === 1)!
    // On the line: square to it, the spot stands nowhere off it.
    const ux = -threat[0] / 10, uz = -threat[1] / 10
    expect(spot.at[0] * uz - spot.at[1] * ux).toBeCloseTo(0, 9)
    expect(spot.at[0] * ux + spot.at[1] * uz).toBeGreaterThan(0)
    expect(words.box.gap(CRATE, spot.at[0], spot.at[1])).toBeCloseTo(ASK.radius, 9)
    // A line from the threat to the spot, under the crate's top, meets the crate before the spot.
    const to = [spot.at[0] - threat[0], 0, spot.at[1] - threat[1]], far = Math.hypot(to[0], to[2])
    const hit = lineBox(CRATE, [threat[0], 0.5, threat[1]], [to[0] / far, 0, to[2] / far], far, 0)!
    expect(hit.t).toBeLessThan(far)
  }
})

test('a box under low is left out, and so is one whose middle is beyond reach', async () => {
  const w = await booted()
  // The kerb, 6 m away, is in reach of a body beside it, but under low.
  expect(spots(w, [0, -5], [0, -12], ASK).some(s => s.tall === 0.2)).toBe(false)
  expect(spots(w, [0, -5], [0, -12], { ...ASK, low: 0.1 }).some(s => s.tall === 0.2)).toBe(true)
  // The crate's middle is 5 m from [0, -5]: beyond a reach of 4.
  expect(spots(w, [0, -5], [0, -12], ASK).some(s => s.tall === 1)).toBe(false)
})

test('a post\'s spot is cover3d\'s own cylinder\'s: its middle and the two radii on, from the threat', async () => {
  const w = await booted()
  const spot = spots(w, [8, 2], [8, 10], ASK).find(s => s.tall === 3)!
  expect(spot.at).toEqual([8, 0 + (-8 / 8) * (0.5 + ASK.radius)])
})
