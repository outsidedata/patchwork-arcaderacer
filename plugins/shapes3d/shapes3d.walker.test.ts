// shapes3d's mod for walker, named by the scene's `world.walker.mods`: `fixed` and `behaviors`. The test
// writes a manager and one child, `yard`, which `load` boots as a game's would: level ground
// (terrain3d's), a crate (a box 2 m across and 1 m long, turned), a wall (a box 0.3 m thick and 8 m
// long) and a post (a cylinder). A body walked at the crate from any side stops against it, never
// within its radius of it; walked along the wall it slides along it; it seeks round the wall to a
// target behind it; a carry into the crate stops where it meets it; an agent walks round the crate on
// its map. Its `probe` hands the test the child's `w`. Beside them, shapes3d as the ground (`ground`), for
// a `climber`, which walks on it: a stair of boxes up onto a deck, a box raised over a body's head, and a
// ramp, a tilted plane, up onto a ledge.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load, modsOf } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { carry, groundOf, type Numbers } from '#plugins/walker/walker.sim.ts'
import { words } from './shapes3d.sim.ts'
import { behaviors, fixed } from './shapes3d.walker.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 1, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
const url = '/shapes3d-walker-test/yard.json'
written(url, JSON.stringify(field))

const K: Numbers = {
  radius: 0.35, height: 1.7, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9,
  step: 0.6, maxSlope: 0.7, slopeBand: 0.05, slide: 2, wade: 0.5, span: 0.5, probe: 1.5, seekSpeed: 1.5,
}
const BODY = { pos: [0, 0, 0], yaw: 0, vel: [0, 0, 0], grounded: true, speed: 0, want: [0, 0], face: null, jump: false, side: 0, turned: 0, sliding: false, target: null }
const CRATE = { pos: [0, 0, 0], size: [2, 1, 1], yaw: 0.6 }
const WALL = { pos: [10, 0, 0], size: [0.3, 2.5, 8], yaw: 0 }
// Six steps 0.3 m apart up to a deck whose underside is over a body's head, and a ramp rising 0.3 a metre
// for 5 m up to a ledge.
const STEPS = [0, 1, 2, 3, 4, 5].map(i => ({ is: 'step', pos: [30, 0.3 * i, 30.25 + 0.5 * i] }))
const DECK = { pos: [30, 1.8, 35], size: [4, 0.2, 4] }
const RAMP = { pos: [40, 0.75, 32.5], size: [2, 5], tilt: Math.atan(0.3) }
const LEDGE = { pos: [40, 1.2, 36.5], size: [3, 0.3, 3] }

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const yard = {
  world: {
    loader: { assets: { land: { type: 'json', url, preload: true } } },
    terrain3d: { field: 'land' },
    shapes3d: {
      kinds: {
        crate: { shape: { box: { size: CRATE.size } } }, wall: { shape: { box: { size: WALL.size } } }, post: { shape: { cylinder: { radius: 0.5, height: 3 } } },
        step: { shape: { box: { size: [2, 0.3, 0.5] } } }, deck: { shape: { box: { size: DECK.size } } },
        ramp: { shape: { plane: { size: RAMP.size, tilt: RAMP.tilt } } }, ledge: { shape: { box: { size: LEDGE.size } } },
      },
      mods: { height: 'terrain3d' },
    },
    walker: { kinds: { body: K, agent: { ...K, agent: 0.25 }, climber: K }, mods: { height: 'terrain3d', fixed: 'shapes3d', behaviors: 'shapes3d' } },
  },
  prefabs: {
    engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, walker: {}, crate: { pos: [0, 0, 0], yaw: 0 }, wall: { pos: [0, 0, 0], yaw: 0 }, post: { pos: [0, 0, 0], yaw: 0 },
    step: { pos: [0, 0, 0], yaw: 0 }, deck: { pos: [0, 0, 0], yaw: 0 }, ramp: { pos: [0, 0, 0], yaw: 0 }, ledge: { pos: [0, 0, 0], yaw: 0 },
    body: BODY, agent: BODY, climber: BODY, probe: {},
  },
  actors: [
    { is: 'scenemanager' }, { is: 'loader' }, { is: 'walker' },
    { is: 'crate', pos: CRATE.pos, yaw: CRATE.yaw }, { is: 'wall', pos: WALL.pos, yaw: WALL.yaw }, { is: 'post', pos: [-10, 0, 0] },
    ...STEPS, { is: 'deck', pos: DECK.pos }, { is: 'ramp', pos: RAMP.pos }, { is: 'ledge', pos: LEDGE.pos },
    { is: 'probe' },
  ],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'shapes3d-walker-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
// A body walks by its `want`, or seeks its `target` when it has one.
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { groundOf, numbers, seek, walk, walker } from ${path('../walker/walker.sim.ts')}
import { ground } from ${path('./shapes3d.walker.ts')}
import file from './yard.scene.json' with { type: 'json' }
const body = { tick(me, dt, w) { if (me.data.target) seek(me, w, me.data.target, 0.3, groundOf(w)); walk(me, w, dt, groundOf(w)) } }
const climber = { tick(me, dt, w) { walk(me, w, dt, ground(w, me.data.pos[1], numbers(me, w))) } }
const still = {}
export const sim = { scenemanager, loader, walker, crate: still, wall: still, post: still, step: still, deck: still, ramp: still, ledge: still, body, agent: body, climber, probe: { before(_me, _dt, w) { globalThis.shapes3dWalker = w } } }
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  child.step(DT)
  return { child, w: (globalThis as { shapes3dWalker?: W }).shapes3dWalker! }
}
const run = (t: Truth, k: number, each?: () => void) => { for (let i = 0; i < k; i++) { t.step(DT); each?.() } }
const gap = (box: typeof CRATE, b: Row) => words.box.gap(box, b.data.pos[0], b.data.pos[2])

test('the scene\'s mods are shapes3d\'s: its fixed solids, and its behaviors deliver box', async () => {
  const { w } = await booted()
  expect(modsOf(w.world, 'walker', 'fixed')).toEqual([fixed])
  expect(modsOf(w.world, 'walker', 'behaviors')).toEqual([behaviors])
  expect(behaviors().box(CRATE)).toEqual({ points: expect.any(Array), round: 0 })
})

test('a body walked at a turned box from any way never comes within its radius of it', async () => {
  const { child, w } = await booted()
  for (let a = 0; a < 16; a++) {
    const way = (a / 16) * 2 * Math.PI
    const b = w.spawn('body', { pos: [-5 * Math.sin(way), 0, -5 * Math.cos(way)], want: [2 * Math.sin(way), 2 * Math.cos(way)] })
    run(child, 240, () => expect(gap(CRATE, b)).toBeGreaterThanOrEqual(K.radius - 1e-6))
    child.end(b)
  }
})

test('a body walked square at each side of a turned box stops against it, its radius off the side', async () => {
  const { child, w } = await booted()
  const c = Math.cos(CRATE.yaw), s = Math.sin(CRATE.yaw)
  // Each side's outward normal in the crate's own frame, and how far out its middle stands.
  for (const [nx, nz, out] of [[1, 0, 1], [-1, 0, 1], [0, 1, 0.5], [0, -1, 0.5]]) {
    const wx = nx * c + nz * s, wz = -nx * s + nz * c
    const b = w.spawn('body', { pos: [wx * (out + 4), 0, wz * (out + 4)], want: [-2 * wx, -2 * wz] })
    run(child, 240)
    expect(gap(CRATE, b)).toBeCloseTo(K.radius, 6)
    child.end(b)
  }
})

test('a body walked along a wall at a slant slides along it, and never through it', async () => {
  const { child, w } = await booted()
  const b = w.spawn('body', { pos: [9, 0, -6], want: [1, 3] })
  run(child, 240, () => expect(gap(WALL, b)).toBeGreaterThanOrEqual(K.radius - 1e-6))
  // Along the wall's −x face, past its far end.
  expect(b.data.pos[0]).toBeLessThan(10)
  expect(b.data.pos[2]).toBeGreaterThan(4)
})

test('seek goes round a wall to a target behind it, never through it', async () => {
  const { child, w } = await booted()
  const b = w.spawn('body', { pos: [7, 0, 1], target: [13, 1] })
  let arrived = false
  run(child, 1200, () => {
    expect(gap(WALL, b)).toBeGreaterThanOrEqual(K.radius - 1e-6)
    if (Math.hypot(b.data.pos[0] - 13, b.data.pos[2] - 1) <= 0.3 + 1e-9) arrived = true
  })
  expect(arrived).toBe(true)
})

test('a carry into a box stops where the body meets it, and a carry away from it is not cut', async () => {
  const { w } = await booted()
  const b = w.spawn('body', { pos: [5, 0, 0] })
  // Toward the crate's middle, 5 m: cut where the body's circle meets the box.
  carry(b, w, [-5, 0], groundOf(w))
  expect(gap(CRATE, b)).toBeCloseTo(K.radius, 6)
  const at = b.data.pos[0]
  carry(b, w, [1, 0], groundOf(w))
  expect(b.data.pos[0]).toBeCloseTo(at + 1, 9)
})

test('on shapes3d\'s ground a body walks up a stair of boxes onto a box raised over its head, and stands on it', async () => {
  const { child, w } = await booted()
  const b = w.spawn('climber', { pos: [30, 0, 27], want: [0, 1.5] })
  run(child, 360)
  expect(b.data.pos[2]).toBeGreaterThan(DECK.pos[2] - DECK.size[2] / 2)
  expect(b.data.pos[1]).toBeCloseTo(DECK.pos[1] + DECK.size[1], 9)
  expect(b.data.grounded).toBe(true)
})

test('on shapes3d\'s ground a body walks under a box raised over its head on the land below', async () => {
  const { child, w } = await booted()
  const b = w.spawn('climber', { pos: [30, 0, 39], want: [0, -1.5] })
  run(child, 240, () => expect(b.data.pos[1]).toBe(0))
  expect(b.data.pos[2]).toBeLessThan(DECK.pos[2])
})

test('on shapes3d\'s ground a body walks up a tilted plane onto a ledge', async () => {
  const { child, w } = await booted()
  const b = w.spawn('climber', { pos: [40, 0, 28], want: [0, 1.5] })
  run(child, 360)
  expect(b.data.pos[2]).toBeGreaterThan(LEDGE.pos[2] - LEDGE.size[2] / 2)
  expect(b.data.pos[1]).toBeCloseTo(LEDGE.pos[1] + LEDGE.size[1], 9)
})

test('an agent walks round a box on its map, never within its radius of it', async () => {
  const { child, w } = await booted()
  const a = w.spawn('agent', { pos: [0, 0, -5], want: [0, 2] })
  run(child, 300, () => expect(gap(CRATE, a)).toBeGreaterThanOrEqual(K.radius - 1e-6))
})
