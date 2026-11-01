// shapes3d's mod for hitscan3d, named by the scene's `world.hitscan3d.mods`: `solids` and `behaviors`.
// The test writes a manager and one child, `yard`, which `load` boots as a game's would: level ground
// (terrain3d's), a crate (a box 2 m across, 1 m long and 1 m tall, turned), a wall (a box) and a post
// (a cylinder). A shot meets the box's side and top where they stand, passes over it, is met from
// inside where it leaves, and a sight is blocked by it; the post is met as hitscan3d's own cylinder
// meets it. A second child, `swap`, names a plugin of its own beside shapes3d whose `cylinder` takes the
// place of hitscan3d's: there a shot passes through the post. Its `probe` hands the test the child's
// `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type W } from '#engine/engine.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { sees, shoot } from '#plugins/hitscan3d/hitscan3d.sim.ts'
import { behaviors, solids } from './shapes3d.hitscan3d.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 1, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
const url = '/shapes3d-hitscan3d-test/yard.json'
written(url, JSON.stringify(field))

const CRATE = { size: [2, 1, 1] }, TURN = 0.6
// A ramp, a plane 4 m long rising 0.5 a metre, its middle 1 m up.
const RAMP = { size: [2, 4], tilt: Math.atan(0.5) }
const shapes3d = { kinds: { crate: { shape: { box: CRATE } }, wall: { shape: { box: { size: [0.3, 2.5, 8] } } }, post: { shape: { cylinder: { radius: 0.5, height: 3 } } }, ramp: { shape: { plane: RAMP } } } }
const yard = (mods: Record<string, unknown>, shipped?: string[]) => ({
  world: {
    loader: { assets: { land: { type: 'json', url, preload: true } } },
    terrain3d: { field: 'land' },
    shapes3d,
    hitscan3d: { kinds: {}, rewind: 1, mods },
    ...(shipped && { shipped: { plugins: shipped } }),
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, crate: { pos: [0, 0, 0], yaw: 0 }, wall: { pos: [0, 0, 0], yaw: 0 }, post: { pos: [0, 0, 0], yaw: 0 }, ramp: { pos: [0, 0, 0], yaw: 0 }, probe: {} },
  actors: [
    { is: 'scenemanager' }, { is: 'loader' },
    { is: 'crate', pos: [0, 0, 6], yaw: TURN }, { is: 'wall', pos: [-8, 0, 0], yaw: 0 }, { is: 'post', pos: [8, 0, 0] },
    { is: 'ramp', pos: [0, 1, -8], yaw: 0 },
    { is: 'probe' },
  ],
  plugins: ['scenemanager'],
})

const dir = mkdtempSync(join(tmpdir(), 'shapes3d-hitscan3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
const sim = (name: string) => `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import file from './${name}.scene.json' with { type: 'json' }
export const sim = { scenemanager, loader, crate: {}, wall: {}, post: {}, ramp: {}, probe: { before(_me, _dt, w) { globalThis.shapes3dYard = w } } }
export const scene = file
`
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard({ ground: 'terrain3d', solids: ['shapes3d'], behaviors: 'shapes3d' })))
writeFileSync(join(dir, 'yard.sim.ts'), sim('yard'))
// A plugin of the game's own whose `cylinder` meets nothing, named after shapes3d, so it takes the place
// of hitscan3d's own `cylinder`.
mkdirSync(join(dir, 'plugins', 'swap'), { recursive: true })
writeFileSync(join(dir, 'plugins', 'swap', 'swap.hitscan3d.ts'), 'export const behaviors = () => ({ cylinder: () => undefined })\n')
writeFileSync(join(dir, 'swap.scene.json'), JSON.stringify(yard({ ground: 'terrain3d', solids: ['shapes3d'], behaviors: ['shapes3d', 'swap'] }, ['swap'])))
writeFileSync(join(dir, 'swap.sim.ts'), sim('swap'))
afterAll(() => rmSync(dir, { recursive: true }))

const top = (entry: string): Scene => ({
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false }, swap: { file: 'swap.scene.json', suspend: false } }, dt: DT, entry, port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
})

async function booted(entry = 'yard') {
  const child = (await load(boot(top(entry), { scenemanager }), pathToFileURL(dir + '/').href)).get(entry)!
  child.step(DT)
  return (globalThis as { shapes3dYard?: W }).shapes3dYard!
}

// A point [x, z] in the crate's own frame, its length along +z, in the world.
const crate = (lx: number, lz: number) => [lx * Math.cos(TURN) + lz * Math.sin(TURN), 6 - lx * Math.sin(TURN) + lz * Math.cos(TURN)]
// Where the crate's own frame puts a world point.
const own = (x: number, z: number) => {
  const rx = x, rz = z - 6
  return [rx * Math.cos(TURN) - rz * Math.sin(TURN), rx * Math.sin(TURN) + rz * Math.cos(TURN)]
}

test('the scene\'s mods are shapes3d\'s: its solids, and its behaviors deliver box, plane and hyperplane', async () => {
  const w = await booted()
  expect(modsOf(w.world, 'hitscan3d', 'solids')).toEqual([solids])
  expect(modsOf(w.world, 'hitscan3d', 'behaviors')).toEqual([behaviors])
  expect(Object.keys(behaviors())).toEqual(['box', 'plane', 'hyperplane'])
})

test('a shot straight down meets a tilted plane at its height there, its normal tilted with it; past its edge it passes', async () => {
  const w = await booted()
  // 1 m along its length from its middle, its surface is 1 + 0.5 m up.
  const hit = shoot(w, [0, 5, -7], [0, -1, 0], 10)!
  expect(hit.what).toBe('solid')
  expect(hit.t).toBeCloseTo(3.5, 9)
  expect(hit.normal[1]).toBeCloseTo(1 / Math.hypot(1, 0.5), 9)
  expect(hit.normal[2]).toBeCloseTo(-0.5 / Math.hypot(1, 0.5), 9)
  // 0.1 m past its side, the shot reaches the ground.
  expect(shoot(w, [1.1, 5, -7], [0, -1, 0], 10)!.what).toBe('ground')
})

test('a shot meets a turned box on its side where the side stands, with its normal; over its top it passes', async () => {
  const w = await booted()
  // Straight at the middle of the crate's −z side, from 3 m out along its length.
  const [fx, fz] = crate(0, -3.5), [tx, tz] = crate(0, 0)
  const dir = [tx - fx, 0, tz - fz]
  const hit = shoot(w, [fx, 0.5, fz], dir, 10)!
  expect(hit.what).toBe('solid')
  expect(hit.t).toBeCloseTo(3, 9)
  const [lx, lz] = own(hit.point[0], hit.point[2])
  expect(lx).toBeCloseTo(0, 9)
  expect(lz).toBeCloseTo(-0.5, 9)
  // Its normal faces back along the line.
  const l = Math.hypot(dir[0], dir[2])
  expect(hit.normal[0]).toBeCloseTo(-dir[0] / l, 9)
  expect(hit.normal[2]).toBeCloseTo(-dir[2] / l, 9)
  // A line along its length 0.05 m outside its +x end passes it by.
  const [ax, az] = crate(1.05, -3.5)
  expect(shoot(w, [ax, 0.5, az], dir, 10)?.what).not.toBe('solid')
  // 0.1 m over its 1 m top it passes; straight down onto it, its top is met with the normal up.
  expect(shoot(w, [fx, 1.1, fz], dir, 10)?.what).not.toBe('solid')
  const down = shoot(w, [tx, 5, tz], [0, -1, 0], 10)!
  expect(down.what).toBe('solid')
  expect(down.t).toBeCloseTo(4, 9)
  expect(down.normal[1]).toBeCloseTo(1, 9)
})

test('a line from inside a box meets it where it leaves it, the normal turned in', async () => {
  const w = await booted()
  const [x, z] = crate(0, 0), [ex, ez] = crate(0, 1)
  const out = shoot(w, [x, 0.5, z], [ex - x, 0, ez - z], 10)!
  expect(out.what).toBe('solid')
  expect(out.t).toBeCloseTo(0.5, 9)
  expect(out.normal[0]).toBeCloseTo(-(ex - x), 9)
  expect(out.normal[2]).toBeCloseTo(-(ez - z), 9)
})

test('a wall blocks a sight across it and not one over it; a post is met as hitscan3d\'s own cylinder meets it', async () => {
  const w = await booted()
  expect(sees(w, [-12, 1.5, 0], [-4, 1.5, 0])).toBe(false)
  expect(sees(w, [-12, 3, 0], [-4, 3, 0])).toBe(true)
  expect(sees(w, [-12, 1.5, 5], [-4, 1.5, 5])).toBe(true)
  const hit = shoot(w, [0, 1, 0], [1, 0, 0], 20)!
  expect(hit.what).toBe('solid')
  expect(hit.t).toBeCloseTo(7.5, 12)
  expect(hit.normal).toEqual([-1, 0, 0])
})

test('a cylinder a later plugin delivers takes the place of hitscan3d\'s own: the shot passes through the post', async () => {
  const w = await booted('swap')
  expect(shoot(w, [0, 1, 0], [1, 0, 0], 20)?.what).not.toBe('solid')
  // The box shapes3d delivers is still met.
  expect(shoot(w, [-12, 1, 0], [1, 0, 0], 20)!.t).toBeCloseTo(12 - 8 - 0.15, 12)
})
