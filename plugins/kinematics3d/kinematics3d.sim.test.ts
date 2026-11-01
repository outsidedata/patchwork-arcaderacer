// kinematics3d's gravity on a scene the test writes into a game folder of its own and boots through the
// scenemanager's `load`, so its mods load as a game's do: terrain3d's level land (`triangles`), shapes3d's
// boxes standing on it, and motion3d's `move` and `jump`. A `block` a metre tall, its top 2 m square,
// stands at the middle; a `stair` 0.3 m tall beside it. A `body` row is moved each step by its rule, on
// the triangles, by `move` (or `jump` while its `jumping` is set), at its `want`. A `probe` row hands
// the test the truth's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Scene, type Truth, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { is } from './kinematics3d.sim.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 1, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
written('/kinematics3d-sim-test/land.json', JSON.stringify(field))

const K = {
  triangles: { radius: 0.3, height: 1.8, step: 0.45, maxSlope: 0.9, slopeBand: 0.2, slide: 4, wade: 0.8, span: 0.3, probe: 0.5 },
  move: { accel: 12, turnRate: 12, still: 0.05 },
  fall: { gravity: 20, airAccel: 2 },
  jump: { jumpH: 1 },
}
const BLOCK = { pos: [0, 0, 0], size: [2, 1, 2] }
const STAIR = { pos: [0, 0, 6], size: [2, 0.3, 2] }

const yard: Scene = {
  world: {
    seed: 3,
    loader: { assets: { land: { type: 'json', url: '/kinematics3d-sim-test/land.json', preload: true } } },
    terrain3d: { field: 'land', rings: [{ reach: 64, seg: 256 }] },
    kinematics3d: { kinds: { body: K }, mods: { behaviors: ['shapes3d', 'terrain3d', 'motion3d'], states: ['motion3d'], solids: ['shapes3d'], footprints: ['shapes3d'] } },
    shapes3d: { kinds: { block: { shape: { box: { size: BLOCK.size } } }, stair: { shape: { box: { size: STAIR.size } } } } },
  },
  prefabs: {
    engine: { dt: DT }, scenemanager: { out: {} }, loader: {},
    block: { pos: [0, 0, 0], yaw: 0 }, stair: { pos: [0, 0, 0], yaw: 0 },
    body: { pos: [0, 1, 0], want: [0, 0], jumping: false },
    probe: {},
  },
  actors: [
    { is: 'scenemanager' }, { is: 'loader' },
    { is: 'block', pos: BLOCK.pos }, { is: 'stair', pos: STAIR.pos },
    { is: 'body' }, { is: 'probe' },
  ],
  plugins: ['scenemanager'],
}
const top: Scene = {
  world: {}, plugins: ['scenemanager'], seats: 1,
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { yard: { file: 'yard.scene.json', suspend: false } }, dt: DT, entry: 'yard', port: 0 } },
  actors: [{ is: 'scenemanager' }],
}

const dir = mkdtempSync(join(tmpdir(), 'kinematics3d-sim-'))
afterAll(() => rmSync(dir, { recursive: true }))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'yard.scene.json'), JSON.stringify(yard))
writeFileSync(join(dir, 'yard.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { step } from ${path('./kinematics3d.sim.ts')}
import file from './yard.scene.json' with { type: 'json' }
const body = { tick(me, dt, w) {
  const d = me.data
  d.pos = step(w, { [d.jumping ? 'jump' : 'move']: { triangles: {} } }, d.pos, [d.want[0], 0, d.want[1]], dt, me)
} }
export const sim = { scenemanager, loader, block: {}, stair: {}, body, probe: { after(_me, _dt, w) { globalThis.kinematics3dW = w } } }
export const scene = file
`)

async function open() {
  const t: Truth = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('yard')!
  t.step(DT)
  return { t, w: (globalThis as any).kinematics3dW as W, body: t.rows.find(r => r.kind === 'body')! }
}
const steps = (t: Truth, n: number, each: () => void = () => {}) => {
  for (let i = 0; i < n; i++) {
    t.step(DT)
    each()
  }
}

test('a body stands on the block, held up, and is neither falling nor rising', async () => {
  const { t, w, body } = await open()
  steps(t, 10)
  expect(body.data.grounded).toBe(true)
  expect(body.data.pos[1]).toBeCloseTo(1, 6)
  expect(is(body, w, 'ground')).toBe(true)
  expect(is(body, w, 'falling')).toBe(false)
  expect(is(body, w, 'rising')).toBe(false)
})

test('walked off the block\'s edge it falls, gravity moving it down, and lands on the land, held up again', async () => {
  const { t, w, body } = await open()
  steps(t, 2)
  body.data.want = [3, 0]
  let fell = false, lowest = Infinity, speed = 0
  steps(t, 120, () => {
    if (is(body, w, 'falling')) {
      fell = true
      expect(body.data.vel[1]).toBeLessThan(0)
      speed = Math.min(speed, body.data.vel[1])
    }
    lowest = Math.min(lowest, body.data.pos[1])
  })
  expect(fell).toBe(true)
  // A metre fallen under 20 m/s² is about √40 m/s at the bottom: the fall picked up speed on the way.
  expect(speed).toBeLessThan(-3)
  expect(lowest).toBeCloseTo(0, 6)
  expect(body.data.grounded).toBe(true)
  expect(body.data.pos[1]).toBeCloseTo(0, 6)
  expect(is(body, w, 'falling')).toBe(false)
})

test('a jump rises, then falls, and lands where it left', async () => {
  const { t, w, body } = await open()
  steps(t, 2)
  body.data.jumping = true
  t.step(DT)
  body.data.jumping = false
  expect(is(body, w, 'rising')).toBe(true)
  let peak = 0, rose = false, fell = false
  steps(t, 120, () => {
    peak = Math.max(peak, body.data.pos[1])
    if (is(body, w, 'rising')) rose = true
    if (is(body, w, 'falling')) {
      expect(rose).toBe(true)
      fell = true
    }
  })
  expect(fell).toBe(true)
  // √(2·g·jumpH) up from the block's top: a metre over it, within a step's worth.
  expect(peak).toBeGreaterThan(1.9)
  expect(peak).toBeLessThan(2.05)
  expect(body.data.grounded).toBe(true)
  expect(body.data.pos[1]).toBeCloseTo(1, 6)
})

test('walking down off the stair follows the drop and is never falling', async () => {
  const { t, w, body } = await open()
  body.data.pos = [0, 0.3, 6]
  steps(t, 2)
  expect(body.data.pos[1]).toBeCloseTo(0.3, 6)
  body.data.want = [3, 0]
  steps(t, 90, () => {
    expect(is(body, w, 'falling')).toBe(false)
    expect(body.data.grounded).toBe(true)
  })
  expect(body.data.pos[1]).toBeCloseTo(0, 6)
})
