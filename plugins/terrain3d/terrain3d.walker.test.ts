// terrain3d's mods for walker, named by the scene's `world.walker.mods`: `height`, `depth` and `cell`.
// The test writes a manager and one child, `shore`, which `load` boots as a game's would: flooded
// hills whose lowest hollows hold shallow water, drawn on a page as rings whose finest cell is 4 m.
// Bodies walked there stand on the land where it is dry, wade on the bed where it is not, and stand on
// the very triangles the page draws, which the test builds as the page does (`terrain3d.rings.ts`).
// Its `probe` hands the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import { groundOf, stand, type Ground, type Numbers } from '#plugins/walker/walker.sim.ts'
import { depthAt, land, rawAt, type Field } from './terrain3d.sim.ts'
import { build, finish, layoutOf, slotsOf } from './terrain3d.rings.ts'

const DT = 1 / 60
// raw = hscale·(v − 0.25): where simplex v is under 0.25 it is under water, less than 0.4 m deep.
const field: Field = {
  program: { world: 600, hscale: 4, sea: 0.625, flood: true, out: 'hills', nodes: [{ id: 'hills', op: 'noise', kind: 'simplex', freq: 6, seed: 5 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
const url = '/terrain3d-walker-test/shore.json'
written(url, JSON.stringify(field))
const RINGS = [{ reach: 160, seg: 80 }, { reach: 400, seg: 50 }]

const K: Numbers = {
  radius: 0.35, height: 1.7, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9,
  step: 0.6, maxSlope: 0.7, slopeBand: 0.05, slide: 2, wade: 0.5, span: 0.5, probe: 1.5, seekSpeed: 1.5,
}
const BODY = { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], grounded: false, speed: 0, want: [0, 0], face: null, jump: false, side: 0, turned: 0, sliding: false }

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { shore: { file: 'shore.scene.json', suspend: false } }, dt: DT, entry: 'shore', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const shore = {
  world: {
    loader: { assets: { land: { type: 'json', url, preload: true } } },
    terrain3d: { field: 'land', rings: RINGS, shadowReach: 100, budget: 8, seabed: false },
    walker: { kinds: { body: K }, mods: { height: 'terrain3d', depth: 'terrain3d', cell: 'terrain3d' } },
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, body: BODY, probe: {} },
  actors: [{ is: 'scenemanager' }, { is: 'loader' }, { is: 'probe' }],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'terrain3d-walker-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'shore.scene.json'), JSON.stringify(shore))
writeFileSync(join(dir, 'shore.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { groundOf, walk } from ${path('../walker/walker.sim.ts')}
import file from './shore.scene.json' with { type: 'json' }
export const sim = {
  scenemanager, loader,
  body: { tick(me, dt, w) { walk(me, w, dt, groundOf(w)) } },
  probe: { before(_me, _dt, w) { globalThis.terrain3dWalker = w } },
}
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('shore')!
  child.step(DT)
  return { child, w: (globalThis as { terrain3dWalker?: W }).terrain3dWalker! }
}
const run = (t: Truth, k: number) => { for (let i = 0; i < k; i++) t.step(DT) }

// A point every 2 m over a square 240 m across; `feet` the five places a body reads the ground at.
const GRID = Array.from({ length: 121 * 121 }, (_, k) => [(k % 121) * 2 - 120, Math.floor(k / 121) * 2 - 120])
const feet = (x: number, z: number) => [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([a, b]) => [x + a * 0.5, z + b * 0.5])
const drop = (w: W, x: number, z: number): Row => w.spawn('body', { pos: [x, rawAt(w, x, z) + 1, z] })

test('a body walked on the shore stands on the land where it is dry, and wades on the bed where it is not', async () => {
  const { child, w } = await booted()
  const wet = GRID.find(([x, z]) => feet(x, z).every(([a, b]) => depthAt(w, a, b) > 0.1))!
  const dry = GRID.find(([x, z]) => feet(x, z).every(([a, b]) => depthAt(w, a, b) === 0 && rawAt(w, a, b) > 0.5))!
  const [inWater, onLand] = [wet, dry].map(([x, z]) => drop(w, x, z))
  run(child, 180)
  const ground = groundOf(w)
  for (const b of [inWater, onLand]) {
    const [x, y, z] = b.data.pos
    expect(b.data.grounded).toBe(true)
    expect(y).toBeCloseTo(stand(K, ground, x, z), 6)
  }
  // In the water, under the surface that heightAt stands a seat's camera on; on the land, on it.
  expect(inWater.data.pos[1]).toBeLessThan(0)
  expect(onLand.data.pos[1]).toBeGreaterThan(0.5)
})

test('a body stands on the triangles the page draws of the finest ring, not on the land between them', async () => {
  const { child, w } = await booted()
  // The finest ring round the origin, built as the page builds it, and the height of its triangles.
  const layout = layoutOf(RINGS)
  const ring = build(land(field), layout, slotsOf(field), 0, [0, 0], undefined, false)
  finish(ring)
  const tris = Array.from({ length: ring.index.length / 3 }, (_, t) => [0, 1, 2].map(c => ring.index[3 * t + c]))
  const drawn = (x: number, z: number) => {
    const p = ring.pos
    for (const [a, b, c] of tris) {
      const [ax, az, bx, bz, cx, cz] = [p[3 * a], p[3 * a + 2], p[3 * b], p[3 * b + 2], p[3 * c], p[3 * c + 2]]
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
      if (u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9) return u * p[3 * a + 1] + v * p[3 * b + 1] + (1 - u - v) * p[3 * c + 1]
    }
    throw new Error(`no triangle of the ring holds ${x}, ${z}`)
  }
  const page: Ground = { height: drawn, depth: (x, z) => depthAt(w, x, z), solids: () => [] }
  // Dry places a cell's width from any lattice line, where the triangles part from the land most.
  const spots = GRID.filter(([x, z]) => Math.abs(x) < 100 && Math.abs(z) < 100 && feet(x + 1.3, z + 2.1).every(([a, b]) => depthAt(w, a, b) === 0))
    .filter((_, k) => k % 97 === 0).slice(0, 6).map(([x, z]) => [x + 1.3, z + 2.1])
  expect(spots).toHaveLength(6)
  const bodies = spots.map(([x, z]) => drop(w, x, z))
  run(child, 180)
  let apart = 0
  for (const b of bodies) {
    const [x, y, z] = b.data.pos
    expect(b.data.grounded).toBe(true)
    // The page's triangles are float32: the body stands on them to their rounding.
    expect(y).toBeCloseTo(stand(K, page, x, z), 4)
    apart = Math.max(apart, Math.abs(y - stand(K, { height: (a, c) => rawAt(w, a, c), solids: () => [] }, x, z)))
  }
  // And the triangles are not the land itself: standing on the land would put some body elsewhere.
  expect(apart).toBeGreaterThan(1e-3)
})
