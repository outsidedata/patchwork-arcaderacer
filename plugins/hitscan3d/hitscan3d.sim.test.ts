// hitscan3d's server half on a range the test writes: a manager and one child, `range`, which `load`
// boots as a game's would, so the mods its `world.hitscan3d.mods` names are loaded before the first
// step: terrain3d's ground, level at 0; scatter3d's rocks, which stand `tall`, and trunks, which stand
// without end, none within 30 m of the origin; walker's bodies, three soldiers and a crate, a kind
// hitscan3d does not list. A shot's meeting with the ground and the solids, a kind it does not list and
// `off`, `skip` and `bodies: false`, the rewind the `hitscan3d` row keeps, and `sees`. Its `probe` hands
// the test the child's `w`.
import { afterAll, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { boot, type Row, type Scene, type W } from '#engine/engine.ts'
import { load } from '#addons/scenemanager/scenemanager.addon.ts'
import { scenemanager } from '#plugins/scenemanager/scenemanager.sim.ts'
import { written } from '#plugins/loader/loader.sim.ts'
import type { Field } from '#plugins/terrain3d/terrain3d.sim.ts'
import { placed, solids, type Scatter, type Solid } from '#plugins/scatter3d/scatter3d.sim.ts'
import type { Numbers as Walker } from '#plugins/walker/walker.sim.ts'
import { sees, shoot, type Numbers } from './hitscan3d.sim.ts'

const DT = 1 / 60
const field: Field = {
  program: { world: 600, hscale: 10, sea: 0.5, flood: false, out: 'level', nodes: [{ id: 'level', op: 'const', value: 0 }] },
  analysis: { slopeStep: 1.5, curveStep: 4, positionRadius: 18, occlusionRadius: 30, occlusionSteps: 5, cliffProbe: 12, cliffSlope: 0.5, cliffDrop: 7, flatAngle: 0.03, records: 50000 },
  ground: { layers: [{ name: 'grass', map: 'grass', scale: 30 }] },
  surfaces: {},
  layers: [],
}
const url = '/hitscan3d-test/range.json'
written(url, JSON.stringify(field))

const scatter: Scatter & { mods: Record<string, string> } = {
  cutout: 0.45, coverage: 0.25, budget: 1e9, remember: 100000, mods: { ground: 'terrain3d' },
  packs: {
    stones: {
      shape: { detail: 1, lumpy: [0.7, 0.3], squash: 0.7 }, colour: '#6a655e',
      rows: { rock: { weight: 1, solid: 0.6, tall: 0.8 }, trunk: { weight: 1, solid: 0.3 } },
      cell: 10, reach: 100, seed: 17, lods: [40], shadow: 50, leaf: 0.5, density: 0.4, rules: [], clearing: 30, size: [1, 0.5], vary: 0.1,
    },
  },
}
const WALKER: Walker = {
  radius: 0.35, height: 1.8, accel: 14, turnRate: 12, gravity: 20, jumpH: 0.9,
  step: 0.6, maxSlope: 0.7, slopeBand: 0.05, slide: 2, wade: 0.5, span: 0.5, probe: 1.5, seekSpeed: 1.5,
}
const hitscan: Numbers & { mods: Record<string, string> } = {
  mods: { ground: 'terrain3d', solids: 'scatter3d', bodies: 'walker' },
  kinds: { soldier: { tall: 'tall', off: 'limp' } },
  rewind: 5,
}

const top: Scene = {
  prefabs: { engine: { dt: DT }, scenemanager: { scenes: { range: { file: 'range.scene.json', suspend: false } }, dt: DT, entry: 'range', port: 0 } },
  actors: [{ is: 'scenemanager' }],
  plugins: ['scenemanager'],
  seats: 1,
}
const range = {
  world: {
    loader: { assets: { land: { type: 'json', url, preload: true } } },
    terrain3d: { field: 'land' },
    scatter3d: scatter,
    walker: { kinds: { soldier: WALKER, crate: { ...WALKER, radius: 0.4, height: 1 } } },
    hitscan3d: hitscan,
  },
  prefabs: { engine: { dt: DT }, scenemanager: { out: {} }, loader: {}, hitscan3d: {}, soldier: { pos: [0, 0, 0] }, crate: { pos: [0, 0, 0] }, probe: {} },
  // The hitscan3d row before the bodies, as a game lists it; A with B behind it along +z, C along +x,
  // the crate along −x.
  actors: [
    { is: 'scenemanager' }, { is: 'loader' }, { is: 'hitscan3d' },
    { is: 'soldier', pos: [0, 0, 6] }, { is: 'soldier', pos: [0, 0, 10] }, { is: 'soldier', pos: [6, 0, 0] }, { is: 'crate', pos: [-6, 0, 0] },
    { is: 'probe' },
  ],
  plugins: ['scenemanager'],
}

const dir = mkdtempSync(join(tmpdir(), 'hitscan3d-'))
const path = (p: string) => JSON.stringify(new URL(p, import.meta.url).pathname)
writeFileSync(join(dir, 'range.scene.json'), JSON.stringify(range))
writeFileSync(join(dir, 'range.sim.ts'), `
import { scenemanager } from ${path('../scenemanager/scenemanager.sim.ts')}
import { loader } from ${path('../loader/loader.sim.ts')}
import { hitscan3d } from ${path('./hitscan3d.sim.ts')}
import file from './range.scene.json' with { type: 'json' }
export const sim = {
  scenemanager, loader, hitscan3d, soldier: {}, crate: {},
  probe: { before(_me, _dt, w) { globalThis.hitscan3dRange = w } },
}
export const scene = file
`)
afterAll(() => rmSync(dir, { recursive: true }))

// The range booted and stepped once, its `w`, and its soldiers A, B and C.
async function booted() {
  const child = (await load(boot(structuredClone(top), { scenemanager }), pathToFileURL(dir + '/').href)).get('range')!
  child.step(DT)
  const w = (globalThis as { hitscan3dRange?: W }).hitscan3dRange!
  const [a, b, c] = w.all('soldier')
  return { child, w, a, b, c }
}

const close = (got: number[], want: number[], digits = 6) => got.forEach((g, i) => expect(g).toBeCloseTo(want[i], digits))
// A rock and a trunk with no other solid within 4 m of their circles, so a short line at one meets it alone.
function alone(w: W) {
  const all = solids(w, 0, 0, 120, placed(w))
  const lone = (s: Solid) => all.every(o => o === s || Math.hypot(o.x - s.x, o.z - s.z) > o.radius + s.radius + 4)
  return { rock: all.find(s => s.tall !== undefined && lone(s))!, trunk: all.find(s => s.tall === undefined && lone(s))! }
}

// ---------------------------------------------------------------- what a shot meets

test('a shot meets the ground: t metres along the line, the point there and the ground\'s normal; past far it meets nothing', async () => {
  const { w } = await booted()
  const down = shoot(w, [3, 10, 4], [0, -1, 0], 50)!
  expect(down.what).toBe('ground')
  expect(down.t).toBeCloseTo(10, 5)
  close(down.point, [3, 0, 4], 5)
  close(down.normal, [0, 1, 0], 12)
  // `dir` of any length: t is still metres.
  const slant = shoot(w, [0, 2, 0], [5, -5, 0], 50)!
  expect(slant.what).toBe('ground')
  expect(slant.t).toBeCloseTo(2 * Math.SQRT2, 5)
  close(slant.point, [2, 0, 0], 5)
  expect(shoot(w, [3, 10, 4], [0, -1, 0], 9.5)).toBeUndefined()
  // Level over level ground, out of reach of every body and solid.
  expect(shoot(w, [0, 1, 0], [-1, 0, 0], 20)).toBeUndefined()
})

test('a shot meets a solid: the side of a rock, its top at `tall`, nothing over it, and a trunk with no `tall` at any height', async () => {
  const { w } = await booted()
  const { rock, trunk } = alone(w)
  expect(rock.tall).toBeGreaterThan(0)
  const side = shoot(w, [rock.x - rock.radius - 1, 0.3, rock.z], [1, 0, 0], 3)!
  expect(side.what).toBe('solid')
  expect(side.t).toBeCloseTo(1, 9)
  close(side.point, [rock.x - rock.radius, 0.3, rock.z], 9)
  close(side.normal, [-1, 0, 0], 9)
  expect(shoot(w, [rock.x - rock.radius - 1, rock.tall! + 0.05, rock.z], [1, 0, 0], 2 * rock.radius + 2)).toBeUndefined()
  // Straight down onto it, the top is nearer than the ground under it.
  const onto = shoot(w, [rock.x, 5, rock.z], [0, -1, 0], 10)!
  expect(onto.what).toBe('solid')
  expect(onto.t).toBeCloseTo(5 - rock.tall!, 9)
  close(onto.normal, [0, 1, 0], 12)
  const high = shoot(w, [trunk.x - trunk.radius - 1, 40, trunk.z], [1, 0, 0], 3)!
  expect(high.what).toBe('solid')
  expect(high.t).toBeCloseTo(1, 9)
})

test('a kind hitscan3d does not list is not hit, and neither is a row whose `off` field is truthy', async () => {
  const { w, a, b } = await booted()
  // The crate stands 6 m along −x.
  expect(shoot(w, [0, 0.5, 0], [-1, 0, 0], 20)).toBeUndefined()
  a.data.limp = true
  expect(shoot(w, [0, 1.2, 0], [0, 0, 1], 20)!.id).toBe(b.id)
  a.data.limp = 0
  expect(shoot(w, [0, 1.2, 0], [0, 0, 1], 20)!.id).toBe(a.id)
})

test('skip passes through the bodies it names; bodies: false passes through every one, and the ground and the solids still stop it', async () => {
  const { w, a, b } = await booted()
  const { rock } = alone(w)
  expect(shoot(w, [0, 1.2, 0], [0, 0, 1], 20, { skip: [a.id] })!.id).toBe(b.id)
  expect(shoot(w, [0, 1.2, 0], [0, 0, 1], 20, { skip: [a.id, b.id] })).toBeUndefined()
  expect(shoot(w, [0, 1.2, 0], [0, 0, 1], 20, { bodies: false })).toBeUndefined()
  const down = shoot(w, [0, 5, 6], [0, -1, 0], 10, { bodies: false })!
  expect(down.what).toBe('ground')
  expect(down.t).toBeCloseTo(5, 5)
  a.data.pos = [rock.x - rock.radius - 3, 0, rock.z]
  expect(shoot(w, [rock.x - rock.radius - 6, 0.3, rock.z], [1, 0, 0], 10, { bodies: false })!.what).toBe('solid')
})

// ---------------------------------------------------------------- sees

test('sees: the ground and the solids stand between two points, and bodies do not', async () => {
  const { w } = await booted()
  const { rock } = alone(w)
  // A and B stand on this line.
  expect(sees(w, [0, 1, 0], [0, 1, 20])).toBe(true)
  expect(sees(w, [0, 5, 0], [10, -1, 0])).toBe(false)
  expect(sees(w, [0, 1, 0], [0, 1, 0])).toBe(true)
  const x0 = rock.x - rock.radius
  expect(sees(w, [x0 - 1, 0.3, rock.z], [rock.x + rock.radius + 1, 0.3, rock.z])).toBe(false)
  expect(sees(w, [x0 - 1, rock.tall! + 0.05, rock.z], [rock.x + rock.radius + 1, rock.tall! + 0.05, rock.z])).toBe(true)
  // Short of the rock, it is not in the way.
  expect(sees(w, [x0 - 3, 0.3, rock.z], [x0 - 0.5, 0.3, rock.z])).toBe(true)
})

// ---------------------------------------------------------------- aiming back

// Steps the range `k` times, A 3 m further along x at the end of each, its `pos` moved in place, so
// what is kept must be a copy. After the first step A stood at x 0, so on step n it stood at 3(n − 1).
// B and C stand off every line along +z from z 2 at x > 0.
function march(child: { step(dt: number): void }, a: Row, k: number) {
  for (let i = 0; i < k; i++) {
    a.data.pos[0] += 3
    child.step(DT)
  }
}
// Whether a line along +z at x = 3(n − 1), where A stood on step n, meets A, aimed at `seen`.
const meets = (w: W, a: Row, n: number, seen?: number) => shoot(w, [3 * (n - 1), 1, 2], [0, 0, 1], 20, { seen })?.id === a.id

test('the hitscan3d row counts the steps in n, and a shot aimed at a kept step meets the bodies where they stood then', async () => {
  const { child, w, a } = await booted()
  const row = w.all('hitscan3d')[0]
  expect(row.data.n).toBe(1)
  march(child, a, 7)
  expect(row.data.n).toBe(8)
  expect(a.data.pos).toEqual([21, 0, 6])
  for (const seen of [4, 5, 6, 7]) {
    for (let n = 1; n <= 8; n++) expect(meets(w, a, n, seen), `seen ${seen} at step ${n}'s place`).toBe(n === seen)
  }
  // A seen between two steps is the step it follows.
  expect(meets(w, a, 6, 6.7)).toBe(true)
})

test('a seen older than rewind steps is the oldest kept; one at or past the last step, or none, is now', async () => {
  const { child, w, a } = await booted()
  march(child, a, 7)
  // rewind 5: steps 4 to 8 are kept.
  for (const seen of [3, 1, -20]) expect(meets(w, a, 4, seen), `seen ${seen}`).toBe(true)
  expect(meets(w, a, 3, 3)).toBe(false)
  for (const seen of [8, 9, 1000, undefined]) {
    expect(meets(w, a, 8, seen), `seen ${seen}`).toBe(true)
    expect(meets(w, a, 7, seen), `seen ${seen}`).toBe(false)
  }
})

test('a body is only put back, never brought back: one ended since is not there, and whether it is off is read off its row now', async () => {
  const { child, w, a, b } = await booted()
  march(child, a, 3)
  a.data.limp = true
  march(child, a, 4)
  // Limp now: not met where it stood on step 6.
  expect(meets(w, a, 6, 6)).toBe(false)
  // Standing now, it is met where it stood on step 6, though it lay limp then.
  a.data.limp = false
  expect(meets(w, a, 6, 6)).toBe(true)
  w.end(a)
  expect(shoot(w, [15, 1, 2], [0, 0, 1], 20, { seen: 6 })).toBeUndefined()
  // B, still there, is put back where it stood.
  expect(shoot(w, [0, 1, 2], [0, 0, 1], 20, { seen: 6 })!.id).toBe(b.id)
})

test('with no hitscan3d row a seen is now', async () => {
  const { child, w, a } = await booted()
  march(child, a, 7)
  expect(meets(w, a, 6, 6)).toBe(true)
  w.end(w.all('hitscan3d')[0])
  expect(meets(w, a, 6, 6)).toBe(false)
  expect(meets(w, a, 8, 6)).toBe(true)
})

test('each truth keeps its own steps: two ranges marched apart answer each for its own', async () => {
  const one = await booted()
  const two = await booted()
  march(one.child, one.a, 4)
  march(two.child, two.a, 2)
  two.a.data.pos[0] = 100
  march(two.child, two.a, 2)
  expect(meets(one.w, one.a, 4, 4)).toBe(true)
  expect(meets(two.w, two.a, 4, 4)).toBe(false)
  expect(meets(two.w, two.a, 3, 3)).toBe(true)
})
