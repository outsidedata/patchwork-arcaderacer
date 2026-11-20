// particle3d's mod for ui3d, named by the scene's `world.ui3d.mods.behaviors`: a look's `particles` keep
// effects running on the thing, at its point in its holder's frame, driven by its state. The test runs the
// real ui3d and the real particle3d on a page of its own, each frame as a client runs them: ui3d's tick, the
// actor's shows, ui3d's afterTick, then particle3d's.
import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { mod, prepare } from '#addons/scenemanager/scenemanager.addon.ts'
import { ui3d } from '#plugins/ui3d/ui3d.plugin.ts'
import { particle3d, type Effects } from './particle3d.plugin.ts'
import { behaviors } from './particle3d.ui3d.ts'

vi.stubGlobal('addEventListener', () => {})
vi.stubGlobal('removeEventListener', () => {})

const DT = 1 / 60
const KEYS = { next: 'ArrowDown', previous: 'ArrowUp', press: 'Enter' }
// A stream of one particle a tenth of a second, thrown up at `rise` metres a second.
const EFFECTS: Effects = {
  cap: 500,
  drivers: { rise: 0 },
  effects: { embers: [{ every: 0.1, n: [1, 1], life: [0.5, 0.5], dir: [0, 1, 0], spread: 0, speed: ['rise', 'rise'] }], spark: [{ life: [0.5, 0.5] }] },
} as any

const page = async () => {
  const world = {
    ui3d: { overlay: [0.1, 200], keys: KEYS, mods: { behaviors: ['particle3d'] } },
    particle3d: { effects: 'effects', hold: 0.1 },
  }
  await prepare({}, [], world)
  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 1000)
  camera.position.set(0, 0, 10)
  const canvas = { parentElement: { style: { cursor: '' } }, getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) }
  const p: any = {
    wire: { scene: { plugins: ['loader', 'ui3d', 'particle3d', 'render3d'], world, prefabs: { engine: { dt: DT } } }, rows: [], n: 0 },
    render3d: { THREE, scene: new THREE.Scene(), camera, overlay: { scene: new THREE.Scene(), camera }, canvas },
    loader: { on: (_: string, f: (it: Effects) => void) => f(EFFECTS), onWritten: () => {}, get: () => undefined, load: () => {} },
  }
  p.ui3d = ui3d()
  p.particle3d = particle3d()
  const frame = (shows: () => void = () => {}) => {
    camera.updateMatrixWorld()
    p.ui3d.tick(p)
    p.particle3d.tick(p)
    shows()
    p.ui3d.afterTick(p)
    p.particle3d.afterTick(p)
  }
  return { p, world, frame }
}
const slab = () => new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.2), new THREE.MeshStandardMaterial())

test('the scene that names particle3d under world.ui3d.mods.behaviors is handed its particles word', async () => {
  const { world } = await page()
  const got = mod<() => Record<string, unknown>>(world, 'ui3d', 'behaviors')!
  expect(got).toBe(behaviors)
  expect(Object.keys(got())).toEqual(['particles'])
})

test('an effect runs on the thing at its point in the holder\'s frame, its driver held at the thing\'s state; the first frame nobody shows it is its last', async () => {
  const { p, frame } = await page()
  const a = slab(), b = slab()
  const look = (at: number[]) => ({ at, select: true, particles: [{ effect: 'embers', at: [1, 0.5, 0], drivers: { rise: 'selected' } }] })
  const shows = () => {
    p.ui3d.show('a', () => a, look([-3, 0, -10]))
    p.ui3d.show('b', () => b, look([3, 0, -10]))
  }
  frame(shows)
  const [ea, eb] = p.particle3d.effects
  expect(ea.name).toBe('embers')
  // its point is 1 right and 0.5 up of a's middle, which stands 3 left and 10 ahead of the camera at z 10
  expect(ea.at[0]).toBeCloseTo(-2, 9)
  expect(ea.at[1]).toBeCloseTo(0.5, 9)
  expect(ea.at[2]).toBeCloseTo(0, 9)
  // a is selected first: its driver is 1, b's 0
  expect(ea.drivers.rise).toBe(1)
  expect(eb.drivers.rise).toBe(0)
  // the camera moves: the point is written where the thing now stands
  p.render3d.camera.position.set(0, 4, 10)
  frame(shows)
  expect(ea.at[1]).toBeCloseTo(4.5, 9)
  // a key selects b: the drivers follow
  p.ui3d.select('b')
  frame(shows)
  expect(ea.drivers.rise).toBe(0)
  expect(eb.drivers.rise).toBe(1)
  for (let f = 0; f < 20; f++) frame(shows)
  expect(p.particle3d.count).toBeGreaterThan(0)
  // nobody shows either: both effects stop throwing, and once their particles have lived out their lives they are gone
  frame()
  frame()
  expect(p.particle3d.effects.every((fx: any) => fx.life <= fx.age + 1e-9)).toBe(true)
  for (let f = 0; f < 40; f++) frame()
  expect(p.particle3d.effects).toEqual([])
  expect(p.particle3d.count).toBe(0)
})

test('a look whose particles name other effects ends the old ones and throws the new', async () => {
  const { p, frame } = await page()
  const a = slab()
  let effect = 'embers'
  const shows = () => p.ui3d.show('a', () => a, { at: [0, 0, -10], particles: [{ effect, at: [0, 0, 0] }] })
  frame(shows)
  const old = p.particle3d.effects[0]
  effect = 'spark'
  frame(shows)
  expect(old.life).toBeLessThanOrEqual(old.age + DT)
  expect(p.particle3d.effects.map((fx: any) => fx.name)).toContain('spark')
})

test('particles of the wrong numbers throw, naming the thing', async () => {
  const cases: [unknown, string][] = [
    [{ effect: 'embers', at: [0, 0] }, "ui3d's a particles 0 at [0,0] is not [x, y, z]"],
    [{ effect: 'embers', at: [0, 0, 0], drivers: { rise: 'hovered' } }, 'ui3d\'s a particles 0 drives rise by "hovered", and a thing\'s state is one of selected, chosen, age'],
    [{ effect: 'embers', at: [0, 0, 0], tint: 1 }, "ui3d's a particles 0 has tint, and it is { effect, at, drivers? }"],
  ]
  for (const [one, message] of cases) {
    const { p, frame } = await page()
    expect(() => frame(() => p.ui3d.show('a', () => slab(), { at: [0, 0, -10], particles: [one] }))).toThrow(message)
  }
})
